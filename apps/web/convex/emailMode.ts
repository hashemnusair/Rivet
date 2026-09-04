/**
 * Operational email go-live flag.
 *
 * One environment variable decides whether RIVET's operational email
 * (invoices, agreements, receipts, reminders, alerts) reaches real people:
 *
 *   RIVET_EMAIL_MODE = off | sandbox | allowlist | live
 *
 * - off        rendered and logged, never sent (default; tests, local dev)
 * - sandbox    every message goes to RIVET_EMAIL_SANDBOX_TO with the original
 *              recipient in the subject (staging)
 * - allowlist  only recipients or domains in RIVET_EMAIL_ALLOWLIST are sent;
 *              everything else is suppressed with a visible reason
 *              (Production before go-live, internal pilots)
 * - live       real recipients (Production after the checklist)
 *
 * A missing or unrecognised value means off. The legacy boolean
 * RIVET_OPERATIONAL_EMAIL_LIVE=true is honoured as "live" only when
 * RIVET_EMAIL_MODE is unset, so an existing deployment keeps behaving until
 * the new variable is configured. This module has no Convex imports so the
 * mock adapter and unit tests can share it.
 */
export const EMAIL_MODES = ["off", "sandbox", "allowlist", "live"] as const;
export type EmailMode = (typeof EMAIL_MODES)[number];

export interface EmailModeResolution {
  mode: EmailMode;
  source: "RIVET_EMAIL_MODE" | "legacy_live_flag" | "default";
  /** Set when the configured value was not understood and fell back to off. */
  warning?: string;
}

type Env = Record<string, string | undefined>;

export function resolveEmailMode(env: Env = process.env): EmailModeResolution {
  const raw = env.RIVET_EMAIL_MODE?.trim().toLowerCase();
  if (raw) {
    if ((EMAIL_MODES as readonly string[]).includes(raw)) return { mode: raw as EmailMode, source: "RIVET_EMAIL_MODE" };
    return { mode: "off", source: "default", warning: `RIVET_EMAIL_MODE "${raw}" is not one of ${EMAIL_MODES.join(", ")}; operational email stays off.` };
  }
  if (env.RIVET_OPERATIONAL_EMAIL_LIVE === "true") return { mode: "live", source: "legacy_live_flag" };
  return { mode: "off", source: "default" };
}

/**
 * Kinds that may reach a real recipient even in allowlist mode. RIVET has no
 * password-reset or security-alert email of its own today (Clerk sends
 * those), so the set is empty; it exists so the exemption is deliberate.
 */
export const ALLOWLIST_EXEMPT_KINDS: ReadonlySet<string> = new Set<string>();

export function parseEmailAllowlist(value: string | undefined): string[] {
  return (value ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

export function recipientAllowed(recipient: string, allowlist: readonly string[]): boolean {
  const email = recipient.trim().toLowerCase();
  const domain = email.split("@")[1] ?? "";
  return allowlist.some((entry) => entry === email || (entry.startsWith("@") ? entry.slice(1) === domain : entry === domain));
}

export type EmailRoute =
  | { decision: "send"; to: string }
  | { decision: "redirect"; to: string; originalRecipient: string }
  | { decision: "drop"; reason: string };

/**
 * Decide where one queued email goes under the current mode.
 *
 * In allowlist mode a recipient is sent to when they are on the list, or
 * when the worker has established that they are on the team of a subscribed
 * gym and the message is addressed to the gym (`trusted`). Subscribed gyms
 * therefore get their invoices, agreements and support replies without
 * anyone editing an environment variable, while member-facing mail waits
 * for the list or for live mode.
 */
export function routeEmail(input: { mode: EmailMode; kind: string; recipient: string; sandboxTo?: string; allowlist?: readonly string[]; trusted?: boolean }): EmailRoute {
  const recipient = input.recipient.trim().toLowerCase();
  switch (input.mode) {
    case "live":
      return { decision: "send", to: recipient };
    case "sandbox": {
      const sandboxTo = input.sandboxTo?.trim().toLowerCase();
      if (!sandboxTo) return { decision: "drop", reason: "Email mode is sandbox but RIVET_EMAIL_SANDBOX_TO is not set" };
      return { decision: "redirect", to: sandboxTo, originalRecipient: recipient };
    }
    case "allowlist":
      if (input.trusted || ALLOWLIST_EXEMPT_KINDS.has(input.kind) || recipientAllowed(recipient, input.allowlist ?? [])) return { decision: "send", to: recipient };
      return { decision: "drop", reason: "Recipient is not on RIVET_EMAIL_ALLOWLIST and not on a subscribed gym's team (allowlist mode)" };
    default:
      return { decision: "drop", reason: "Email mode is off" };
  }
}

export function sandboxSubject(subject: string | undefined, originalRecipient: string): string {
  return `[sandbox → ${originalRecipient}] ${subject ?? "RIVET"}`;
}
