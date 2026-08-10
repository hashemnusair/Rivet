export type MarketingPreferenceValue = {
  marketingOptIn?: unknown;
  marketingPreference?: { optedIn?: unknown } | unknown;
};

/**
 * Marketing defaults to opted-in only for legacy records that have no saved
 * preference. An explicit false always wins, regardless of delivery channel.
 */
export function marketingOptedIn(value: MarketingPreferenceValue | null | undefined): boolean {
  const preference = value?.marketingPreference;
  if (preference && typeof preference === "object" && "optedIn" in preference && typeof (preference as { optedIn?: unknown }).optedIn === "boolean") {
    return Boolean((preference as { optedIn: boolean }).optedIn);
  }
  return typeof value?.marketingOptIn === "boolean" ? Boolean(value.marketingOptIn) : true;
}

export function marketingSuppressionReason(value: MarketingPreferenceValue | null | undefined): string | undefined {
  return marketingOptedIn(value) ? undefined : "Recipient opted out of marketing messages";
}

export function normalizeMarketingChannel(value: unknown): "email" | "sms" | "whatsapp" {
  if (value === "email" || value === "sms" || value === "whatsapp") return value;
  return "whatsapp";
}
