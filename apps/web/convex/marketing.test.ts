import { describe, expect, it } from "vitest";
import { marketingOptedIn, marketingPreferenceStatus, marketingStatusFromProvenance, marketingSuppressionReason, normalizeMarketingChannel } from "./marketing";

describe("marketing preference boundary", () => {
  it("honours an explicit preference object before legacy fields", () => {
    expect(marketingOptedIn({ marketingOptIn: true, marketingPreference: { optedIn: false, source: "member_selected" } })).toBe(false);
    expect(marketingSuppressionReason({ marketingPreference: { optedIn: false, source: "member_selected" } })).toBe("Recipient opted out of marketing messages");
    expect(marketingOptedIn({ marketingOptIn: false })).toBe(false);
    expect(marketingOptedIn({})).toBe(false);
    expect(marketingOptedIn({ marketingOptIn: true })).toBe(false);
    expect(marketingOptedIn({ marketingPreference: { optedIn: true, source: "member_selected" } })).toBe(true);
    expect(marketingPreferenceStatus({ marketingPreference: { optedIn: true, source: "system_default" } })).toBe("unknown");
    expect(marketingPreferenceStatus({ marketingPreference: { optedIn: true, source: "imported" } })).toBe("unknown");
    expect(marketingStatusFromProvenance("staff_selected", false)).toBe("explicit_opt_out");
    expect(marketingStatusFromProvenance("member_selected", true)).toBe("explicit_opt_in");
    expect(marketingPreferenceStatus({})).toBe("unknown");
    expect(marketingSuppressionReason({})).toBe("Recipient marketing preference is unknown");
  });

  it("normalizes every supported outbound channel through one boundary", () => {
    expect(["email", "sms", "whatsapp", "carrier-pigeon"].map(normalizeMarketingChannel)).toEqual(["email", "sms", "whatsapp", "whatsapp"]);
  });
});
