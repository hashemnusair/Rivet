import { describe, expect, it } from "vitest";
import { marketingOptedIn, marketingSuppressionReason, normalizeMarketingChannel } from "./marketing";

describe("marketing preference boundary", () => {
  it("honours an explicit preference object before legacy fields", () => {
    expect(marketingOptedIn({ marketingOptIn: true, marketingPreference: { optedIn: false } })).toBe(false);
    expect(marketingSuppressionReason({ marketingPreference: { optedIn: false } })).toBe("Recipient opted out of marketing messages");
    expect(marketingOptedIn({ marketingOptIn: false })).toBe(false);
    expect(marketingOptedIn({})).toBe(true);
  });

  it("normalizes every supported outbound channel through one boundary", () => {
    expect(["email", "sms", "whatsapp", "carrier-pigeon"].map(normalizeMarketingChannel)).toEqual(["email", "sms", "whatsapp", "whatsapp"]);
  });
});
