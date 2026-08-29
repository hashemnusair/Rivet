import { describe, expect, it } from "vitest";
import {
  buildWhatsAppUrl,
  canonicalPhoneKey,
  countryCallingCodeForLocale,
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

  it("normalizes Jordanian landlines and emails separately", () => {
    expect(normalizeLeadPhone("06 555 1234")).toBe("+96265551234");
    expect(normalizeOptionalEmail(" STAFF@Example.COM ")).toBe("staff@example.com");
  });

  it("uses a configurable tenant default without overriding explicit international numbers", () => {
    expect(normalizeLeadPhone("050 123 4567", "971")).toBe("+971501234567");
    expect(normalizeLeadPhone("055 123 4567", "966")).toBe("+966551234567");
    expect(normalizeLeadPhone("+44 20 7946 0958", "962")).toBe("+442079460958");
    expect(normalizeLeadPhone("0044 20 7946 0958", "962")).toBe("+442079460958");
  });

  it("derives common defaults from locale while falling back to Jordan", () => {
    expect(countryCallingCodeForLocale("en-JO")).toBe("962");
    expect(countryCallingCodeForLocale("ar-AE")).toBe("971");
    expect(countryCallingCodeForLocale("en-GB")).toBe("44");
    expect(countryCallingCodeForLocale("en")).toBe("962");
  });

  it("builds an encoded provider-free WhatsApp handoff", () => {
    expect(buildWhatsAppUrl({ phone: "079 123 4567", message: "Hello Ahmad & welcome" })).toBe("https://wa.me/962791234567?text=Hello%20Ahmad%20%26%20welcome");
    expect(buildWhatsAppUrl({ phone: "+1 415 555 0100", message: "Hello", defaultCountryCallingCode: "962" })).toBe("https://wa.me/14155550100?text=Hello");
    expect(buildWhatsAppUrl({ phone: "123", message: "Hello" })).toBeUndefined();
  });
});
