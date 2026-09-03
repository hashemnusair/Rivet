/**
 * WhatsApp / SMS go-live flag and provider seam.
 *
 *   RIVET_MESSAGING_MODE = off | sandbox | allowlist | live   (default off)
 *   RIVET_MESSAGING_PROVIDER = twilio                          (only provider)
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   TWILIO_MESSAGING_SERVICE_SID   sender for SMS
 *   TWILIO_WHATSAPP_FROM           "whatsapp:+1415..." sender for WhatsApp
 *   RIVET_MESSAGING_SANDBOX_TO     E.164 number that receives every sandbox message
 *   RIVET_MESSAGING_ALLOWLIST      comma list of E.164 numbers or prefixes
 *
 * Two switches must both be on before a member receives a message: this
 * global mode, and the gym's own "External delivery" setting
 * (`automationDeliveryMode = live`). Messages keep the sandbox ledger shape
 * in every mode, so nothing about the audit trail changes when a provider
 * is switched on. No Convex imports: shared by the mock adapter and tests.
 */
export const MESSAGING_MODES = ["off", "sandbox", "allowlist", "live"] as const;
export type MessagingMode = (typeof MESSAGING_MODES)[number];
export type MessagingChannel = "whatsapp" | "sms";

type Env = Record<string, string | undefined>;

export interface MessagingModeResolution {
  mode: MessagingMode;
  provider: "twilio" | "none";
  whatsappReady: boolean;
  smsReady: boolean;
  sandboxConfigured: boolean;
  allowlistSize: number;
  warning?: string;
}

export function resolveMessagingMode(env: Env = process.env): MessagingModeResolution {
  const raw = env.RIVET_MESSAGING_MODE?.trim().toLowerCase();
  let mode: MessagingMode = "off";
  let warning: string | undefined;
  if (raw) {
    if ((MESSAGING_MODES as readonly string[]).includes(raw)) mode = raw as MessagingMode;
    else warning = `RIVET_MESSAGING_MODE "${raw}" is not one of ${MESSAGING_MODES.join(", ")}; messaging stays off.`;
  }
  const providerName = env.RIVET_MESSAGING_PROVIDER?.trim().toLowerCase();
  const twilioAuth = Boolean(env.TWILIO_ACCOUNT_SID?.trim() && env.TWILIO_AUTH_TOKEN?.trim());
  const provider = providerName === "twilio" && twilioAuth ? "twilio" : "none";
  return {
    mode,
    provider,
    whatsappReady: provider === "twilio" && Boolean(env.TWILIO_WHATSAPP_FROM?.trim()),
    smsReady: provider === "twilio" && Boolean(env.TWILIO_MESSAGING_SERVICE_SID?.trim()),
    sandboxConfigured: Boolean(env.RIVET_MESSAGING_SANDBOX_TO?.trim()),
    allowlistSize: parseMessagingAllowlist(env.RIVET_MESSAGING_ALLOWLIST).length,
    warning,
  };
}

/**
 * Normalise a phone number to E.164. Jordanian local formats (07x…) are
 * completed with +962; anything already international is kept. Returns
 * undefined when the digits cannot be a real number.
 */
export function toE164(input: string | undefined, defaultCountryCode = "962"): string | undefined {
  if (!input) return undefined;
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("+")) {
    const rest = digits.slice(1);
    return /^\d{8,15}$/.test(rest) ? `+${rest}` : undefined;
  }
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith(defaultCountryCode) && digits.length >= 11) return `+${digits}`;
  return /^\d{7,12}$/.test(digits) ? `+${defaultCountryCode}${digits}` : undefined;
}

export function parseMessagingAllowlist(value: string | undefined): string[] {
  return (value ?? "").split(",").map((item) => toE164(item.trim()) ?? item.trim()).filter(Boolean);
}

export function phoneAllowed(recipient: string, allowlist: readonly string[]): boolean {
  const number = toE164(recipient);
  if (!number) return false;
  return allowlist.some((entry) => number === entry || (entry.endsWith("*") && number.startsWith(entry.slice(0, -1))));
}

export type MessageRoute =
  | { decision: "send"; to: string }
  | { decision: "redirect"; to: string; originalRecipient: string }
  | { decision: "drop"; reason: string };

export function routeMessage(input: { mode: MessagingMode; channel: MessagingChannel; recipient: string | undefined; sandboxTo?: string; allowlist?: readonly string[]; resolution: Pick<MessagingModeResolution, "whatsappReady" | "smsReady"> }): MessageRoute {
  const to = toE164(input.recipient);
  if (!to) return { decision: "drop", reason: "Recipient phone number is missing or not a valid number" };
  const ready = input.channel === "whatsapp" ? input.resolution.whatsappReady : input.resolution.smsReady;
  switch (input.mode) {
    case "off":
      return { decision: "drop", reason: "Messaging mode is off (RIVET_MESSAGING_MODE)" };
    case "sandbox": {
      const sandboxTo = toE164(input.sandboxTo);
      if (!sandboxTo) return { decision: "drop", reason: "Messaging mode is sandbox but RIVET_MESSAGING_SANDBOX_TO is not set" };
      if (!ready) return { decision: "drop", reason: `The ${input.channel === "whatsapp" ? "WhatsApp" : "SMS"} sender is not configured` };
      return { decision: "redirect", to: sandboxTo, originalRecipient: to };
    }
    case "allowlist":
      if (!ready) return { decision: "drop", reason: `The ${input.channel === "whatsapp" ? "WhatsApp" : "SMS"} sender is not configured` };
      if (!phoneAllowed(to, input.allowlist ?? [])) return { decision: "drop", reason: "Recipient is not on RIVET_MESSAGING_ALLOWLIST (allowlist mode)" };
      return { decision: "send", to };
    case "live":
      if (!ready) return { decision: "drop", reason: `The ${input.channel === "whatsapp" ? "WhatsApp" : "SMS"} sender is not configured` };
      return { decision: "send", to };
  }
}

export const MESSAGE_RETRY_MINUTES = [1, 5, 30] as const;
export const MESSAGE_MAX_ATTEMPTS = MESSAGE_RETRY_MINUTES.length + 1;

/** Twilio request body for one message; the worker adds credentials. */
export function twilioMessageParams(input: { channel: MessagingChannel; to: string; body: string; env?: Env }): URLSearchParams {
  const env = input.env ?? process.env;
  const params = new URLSearchParams();
  if (input.channel === "whatsapp") {
    params.set("To", `whatsapp:${input.to}`);
    params.set("From", env.TWILIO_WHATSAPP_FROM?.trim() ?? "");
  } else {
    params.set("To", input.to);
    params.set("MessagingServiceSid", env.TWILIO_MESSAGING_SERVICE_SID?.trim() ?? "");
  }
  params.set("Body", input.body);
  return params;
}

export function twilioMessagesUrl(accountSid: string): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
}

export function twilioRetryable(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}
