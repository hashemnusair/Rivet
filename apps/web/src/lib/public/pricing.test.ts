import { describe, expect, it } from "vitest";
import {
  ANNUAL_DISCOUNT_PERCENT,
  DEFAULT_PUBLIC_PRICING_PLANS,
  calculatePlanPrice,
  formatJodMinor,
  pricingSignupHref,
  publicPlanFeatures,
  resolvePublicPricingPlans,
} from "./pricing";

describe("public pricing contract", () => {
  it("publishes four launch tiers with Enterprise at JOD 500 monthly", () => {
    expect(DEFAULT_PUBLIC_PRICING_PLANS.map((plan) => plan.name)).toEqual(["Starter", "Growth", "Pro", "Enterprise"]);
    expect(DEFAULT_PUBLIC_PRICING_PLANS.at(-1)).toMatchObject({ name: "Enterprise", priceMinor: 500_000 });
  });

  it("calculates annual billing from the monthly minor-unit price", () => {
    const annual = calculatePlanPrice({ priceMinor: 79_000 }, "annual");
    expect(annual).toMatchObject({
      monthlyMinor: 79_000,
      annualTotalMinor: 758_400,
      effectiveMonthlyMinor: 63_200,
      savingsMinor: 189_600,
      discountPercent: ANNUAL_DISCOUNT_PERCENT,
    });
    expect(calculatePlanPrice({ priceMinor: 79_000 }, "monthly")).toMatchObject({
      effectiveMonthlyMinor: 79_000,
      annualTotalMinor: 758_400,
      savingsMinor: 0,
      discountPercent: 0,
    });
    expect(formatJodMinor(63_200)).toBe("63.200");
  });

  it("keeps the fourth tier visible when a live catalog is still on the old three-plan shape", () => {
    const resolved = resolvePublicPricingPlans(DEFAULT_PUBLIC_PRICING_PLANS.slice(0, 3));
    expect(resolved).toHaveLength(4);
    expect(resolved.at(-1)).toMatchObject({ name: "Enterprise", priceMinor: 500_000 });
  });

  it("preserves live catalog values while retaining the public tier contract", () => {
    const resolved = resolvePublicPricingPlans([
      { name: "Starter", priceMinor: 80_000, branches: 2, staff: 10, members: 600, tone: "paper" },
      { name: "Enterprise", priceMinor: 525_000, branches: 12, staff: 100, members: 20_000, tone: "night" },
    ]);
    expect(resolved[0]).toMatchObject({ name: "Starter", priceMinor: 80_000, branches: 2 });
    expect(resolved.at(-1)).toMatchObject({ name: "Enterprise", priceMinor: 525_000, branches: 12 });
    expect(resolved.map((plan) => plan.name)).toEqual(["Starter", "Growth", "Pro", "Enterprise"]);
  });

  it("carries the plan and cadence into the application link", () => {
    expect(pricingSignupHref("Enterprise", "annual")).toBe("/signup?plan=Enterprise&interval=annual");
  });

  it("keeps capability summaries tier-specific", () => {
    expect(publicPlanFeatures(DEFAULT_PUBLIC_PRICING_PLANS[0]!)).toContain("Gym foundation and revenue tools");
    expect(publicPlanFeatures(DEFAULT_PUBLIC_PRICING_PLANS[2]!)).toContain("Finance and management reporting");
    expect(publicPlanFeatures(DEFAULT_PUBLIC_PRICING_PLANS[3]!)).toContain("All workspace modules");
  });
});
