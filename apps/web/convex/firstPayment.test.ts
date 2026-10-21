import { describe, expect, it } from "vitest";
import { firstPaymentQuote, normalizePromoCode, paymentNoteReference, validPromoCodeShape } from "./firstPayment";

const base = { subscriptionMinor: 39_000, onboardingFeeMinor: 75_000 };

describe("first payment quote", () => {
  it("adds the website at its price unless a free place covers it", () => {
    expect(firstPaymentQuote({ ...base, website: { requested: false, free: true, priceMinor: 150_000 } })).toMatchObject({ websiteMinor: 0, totalMinor: 114_000, websiteRequested: false });
    expect(firstPaymentQuote({ ...base, website: { requested: true, free: true, priceMinor: 150_000 } })).toMatchObject({ websiteMinor: 0, websiteListMinor: 150_000, websiteFree: true, totalMinor: 114_000 });
    expect(firstPaymentQuote({ ...base, website: { requested: true, free: false, priceMinor: 150_000 } })).toMatchObject({ websiteMinor: 150_000, totalMinor: 264_000 });
  });

  it("takes a promo off only the part it names, never below zero", () => {
    const website = { requested: true, free: false, priceMinor: 150_000 };
    expect(firstPaymentQuote({ ...base, website, promo: { code: "HALF", target: "subscription", percentOff: 50 } })).toMatchObject({ discountMinor: 19_500, subscriptionDiscountMinor: 19_500, totalMinor: 244_500 });
    expect(firstPaymentQuote({ ...base, website, promo: { code: "SETUP", target: "onboarding", amountOffMinor: 100_000 } })).toMatchObject({ discountMinor: 75_000, subscriptionDiscountMinor: 0, totalMinor: 189_000 });
    expect(firstPaymentQuote({ ...base, website: { ...website, free: true }, promo: { code: "SITE", target: "website", percentOff: 100 } })).toMatchObject({ discountMinor: 0, totalMinor: 114_000 });
    expect(firstPaymentQuote({ ...base, website, promo: { code: "ALL", target: "total", percentOff: 10 } })).toMatchObject({ discountMinor: 26_400, subscriptionDiscountMinor: 3_900, totalMinor: 237_600 });
  });

  it("drops a promo that takes nothing off", () => {
    const quote = firstPaymentQuote({ ...base, website: { requested: false, free: false, priceMinor: 150_000 }, promo: { code: "SITE", target: "website", amountOffMinor: 50_000 } });
    expect(quote.promo).toBeUndefined();
    expect(quote.totalMinor).toBe(114_000);
  });
});

describe("codes and references people type", () => {
  it("normalises promo codes and refuses odd shapes", () => {
    expect(normalizePromoCode(" launch 50 ")).toBe("LAUNCH50");
    expect(validPromoCodeShape("LAUNCH50")).toBe(true);
    expect(validPromoCodeShape("AB")).toBe(false);
    expect(validPromoCodeShape("50%OFF")).toBe(false);
  });

  it("shortens an invoice id to something that fits a bank note", () => {
    expect(paymentNoteReference("INV-207f4c78-aeec-44fd-a4f8-b9107adbece0")).toBe("INV-207F4C78");
    expect(paymentNoteReference("RV-1046")).toBe("RV-1046");
  });
});
