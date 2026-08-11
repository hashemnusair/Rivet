export type MarketingPreferenceValue = {
  marketingOptIn?: unknown;
  marketingPreference?: { optedIn?: unknown; status?: unknown; source?: unknown } | unknown;
};

/**
 * Unknown and legacy-default preferences are suppressed. Only an attributable
 * explicit opt-in permits marketing; service messages use a separate path.
 */
export function marketingPreferenceStatus(value: MarketingPreferenceValue | null | undefined): "explicit_opt_in" | "explicit_opt_out" | "unknown" {
  const preference = value?.marketingPreference;
  if (preference && typeof preference === "object") {
    const status = (preference as { status?: unknown }).status;
    if (status === "explicit_opt_in" || status === "explicit_opt_out" || status === "unknown") return status;
    const optedIn = (preference as { optedIn?: unknown }).optedIn;
    const source = (preference as { source?: unknown }).source;
    if (typeof optedIn === "boolean" && source && source !== "system_default") return optedIn ? "explicit_opt_in" : "explicit_opt_out";
    if (optedIn === false) return "explicit_opt_out";
    return "unknown";
  }
  return value?.marketingOptIn === false ? "explicit_opt_out" : "unknown";
}

export function marketingOptedIn(value: MarketingPreferenceValue | null | undefined): boolean {
  return marketingPreferenceStatus(value) === "explicit_opt_in";
}

export function marketingSuppressionReason(value: MarketingPreferenceValue | null | undefined): string | undefined {
  const status = marketingPreferenceStatus(value);
  if (status === "explicit_opt_in") return undefined;
  return status === "explicit_opt_out" ? "Recipient opted out of marketing messages" : "Recipient marketing preference is unknown";
}

export function normalizeMarketingChannel(value: unknown): "email" | "sms" | "whatsapp" {
  if (value === "email" || value === "sms" || value === "whatsapp") return value;
  return "whatsapp";
}
