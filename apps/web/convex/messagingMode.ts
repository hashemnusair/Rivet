/** Compatibility types for historical deliveries. Automated WhatsApp/SMS were
 * retired on 7 October 2026. Staff use the manual WhatsApp handoff instead. */
export const MESSAGING_MODES = ["off", "sandbox", "allowlist", "live"] as const;
export type MessagingMode = (typeof MESSAGING_MODES)[number];
export type MessagingChannel = "whatsapp" | "sms";
export const RETIRED_CHANNEL_REASON = "Automated WhatsApp and SMS are retired. Use the manual WhatsApp handoff or operational email.";

export interface MessagingModeResolution {
  mode: MessagingMode;
  provider: "twilio" | "none";
  whatsappReady: boolean;
  sandboxConfigured: boolean;
  allowlistSize: number;
  warning?: string;
}

/** Old environment variables cannot reactivate the removed sender. */
export function resolveMessagingMode(_env: Record<string, string | undefined> = {}): MessagingModeResolution {
  return { mode: "off", provider: "none", whatsappReady: false, sandboxConfigured: false, allowlistSize: 0, warning: RETIRED_CHANNEL_REASON };
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

/** Kept for callers compiled before retirement; never returns a send route. */
export function routeMessage(_input: { mode: MessagingMode; channel: MessagingChannel; recipient: string | undefined; sandboxTo?: string; allowlist?: readonly string[]; resolution: Pick<MessagingModeResolution, "whatsappReady"> }): { decision: "drop"; reason: string } {
  return { decision: "drop", reason: RETIRED_CHANNEL_REASON };
}
