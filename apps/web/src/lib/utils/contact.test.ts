import { describe, expect, it } from "vitest";
import {
  canonicalPhoneKey,
  normalizeLeadPhone,
  normalizeOptionalEmail,
  phoneSearchMatches,
} from "./contact";

describe("contact normalization", () => {
  it.each([
    "079 123 4567",
    "079-123-4567",
    "+962 79 123 4567",
    "00962 (79) 123-4567",
    "791234567",
  ])("maps %s to one Jordanian mobile identity", (phone) => {
    expect(canonicalPhoneKey(phone)).toBe("962791234567");
    expect(normalizeLeadPhone(phone)).toBe("+962791234567");
  });

  it("matches partial local and international phone searches", () => {
    expect(phoneSearchMatches("+962 79 123 4567", "079 123")).toBe(true);
    expect(phoneSearchMatches("0791234567", "00962 79 123")).toBe(true);
    expect(phoneSearchMatches("+962791234567", "078 123")).toBe(false);
  });

  it("preserves non-Jordanian local display and normalizes emails separately", () => {
    expect(normalizeLeadPhone("06 555 1234")).toBe("06 555 1234");
    expect(normalizeOptionalEmail(" STAFF@Example.COM ")).toBe("staff@example.com");
  });
});
