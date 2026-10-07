import { describe, expect, it } from "vitest";
import type { WorkspaceModuleKey } from "@/lib/domain/types";
import {
  ANNUAL_DISCOUNT_PERCENT,
  DEFAULT_PUBLIC_PRICING_PLANS,
  calculatePlanPrice,
  formatJodMinor,
  isPublicQuotePlan,
  pricingSignupHref,
  publicPlanFeatures,
  resolvePublicPricingPlans,
} from "./pricing";

describe("public pricing contract", () => {
  it("publishes the three fixed launch tiers and retains Enterprise for quote compatibility", () => {
    expect(DEFAULT_PUBLIC_PRICING_PLANS.map((plan) => plan.name)).toEqual(["Starter", "Growth", "Pro", "Enterprise"]);
    expect(DEFAULT_PUBLIC_PRICING_PLANS).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Starter", priceMinor: 39_000, branches: 1, staff: 3, members: 150, onboardingFeeMinor: 75_000, operationalEmails: 600 }),
      expect.objectContaining({ name: "Growth", priceMinor: 89_000, branches: 2, staff: 8, members: 300, onboardingFeeMinor: 150_000, operationalEmails: 1_500 }),
      expect.objectContaining({ name: "Pro", priceMinor: 199_000, branches: 5, staff: 20, members: 1_000, onboardingFeeMinor: 300_000, operationalEmails: 5_000 }),
    ]));
    expect(DEFAULT_PUBLIC_PRICING_PLANS.at(-1)).toMatchObject({ name: "Enterprise", priceMinor: 500_000, onboardingFeeMinor: 0, operationalEmails: 20_000 });
    expect(isPublicQuotePlan(DEFAULT_PUBLIC_PRICING_PLANS.at(-1)!)).toBe(true);
  });

  it("calculates annual billing from the monthly minor-unit price", () => {
    const annual = calculatePlanPrice({ priceMinor: 39_000, onboardingFeeMinor: 75_000 }, "annual");
    expect(annual).toMatchObject({
      monthlyMinor: 39_000,
      annualTotalMinor: 444_600,
      effectiveMonthlyMinor: 37_050,
      firstPaymentMinor: 519_600,
      savingsMinor: 23_400,
      discountPercent: ANNUAL_DISCOUNT_PERCENT,
    });
    expect(calculatePlanPrice({ priceMinor: 39_000, onboardingFeeMinor: 75_000 }, "monthly")).toMatchObject({
      effectiveMonthlyMinor: 39_000,
      annualTotalMinor: 444_600,
      firstPaymentMinor: 114_000,
      savingsMinor: 0,
      discountPercent: 0,
    });
    expect(formatJodMinor(37_050)).toBe("37.050");
  });

  it("keeps quote-only Enterprise visible when the live catalog is still on the three-plan shape", () => {
    const resolved = resolvePublicPricingPlans(DEFAULT_PUBLIC_PRICING_PLANS.slice(0, 3));
    expect(resolved).toHaveLength(4);
    expect(resolved.at(-1)).toMatchObject({ name: "Enterprise", priceMinor: 500_000, onboardingFeeMinor: 0 });
    expect(isPublicQuotePlan(resolved.at(-1)!)).toBe(true);
  });

  it("preserves live catalog values while retaining the public tier contract", () => {
    const resolved = resolvePublicPricingPlans([
      { name: "Starter", priceMinor: 40_000, branches: 1, staff: 3, members: 150, tone: "paper" },
      { name: "Enterprise", priceMinor: 525_000, branches: 12, staff: 100, members: 20_000, tone: "night" },
    ]);
    expect(resolved[0]).toMatchObject({ name: "Starter", priceMinor: 40_000, branches: 1, onboardingFeeMinor: 75_000, operationalEmails: 600 });
    expect(resolved.at(-1)).toMatchObject({ name: "Enterprise", priceMinor: 525_000, branches: 12 });
    expect(resolved.map((plan) => plan.name)).toEqual(["Starter", "Growth", "Pro", "Enterprise"]);
  });

  it("carries the plan and cadence into the application link", () => {
    expect(pricingSignupHref("Starter", "annual")).toBe("/signup?plan=Starter&interval=annual");
  });

  it("uses the fixed launch workspace modules and shows true operational limits", () => {
    expect(publicPlanFeatures(DEFAULT_PUBLIC_PRICING_PLANS[0]!)).toEqual(expect.arrayContaining(["Gym foundation", "Revenue protection"]));
    expect(publicPlanFeatures(DEFAULT_PUBLIC_PRICING_PLANS[0]!)).toEqual(expect.arrayContaining(["Up to 150 active members across all branches", "Up to 3 owner and staff accounts", "Up to 600 operational emails per month"]));
    expect(publicPlanFeatures(DEFAULT_PUBLIC_PRICING_PLANS[0]!)).not.toContain("Daily operations");
    expect(publicPlanFeatures(DEFAULT_PUBLIC_PRICING_PLANS[1]!)).toContain("Daily operations");
    expect(publicPlanFeatures(DEFAULT_PUBLIC_PRICING_PLANS[2]!)).toEqual(expect.arrayContaining(["Financial operating system", "Management reporting"]));
    expect(publicPlanFeatures(DEFAULT_PUBLIC_PRICING_PLANS[2]!)).toContain("Management reporting");
    expect(publicPlanFeatures(DEFAULT_PUBLIC_PRICING_PLANS[3]!)).toContain("Branches, active-member capacity, staff accounts and email allowance confirmed by quote");
    expect(publicPlanFeatures(DEFAULT_PUBLIC_PRICING_PLANS[3]!)).not.toContain("Member app and marketplace listing");
  });

  it("uses valid admin module selections and falls back when a live selection is invalid", () => {
    const resolved = resolvePublicPricingPlans([{ name: "Starter", entitledModules: ["foundation", "operations"] }]);
    expect(resolved[0]?.entitledModules).toEqual(["foundation", "operations"]);

    const invalid = resolvePublicPricingPlans([{ name: "Starter", entitledModules: ["foundation", "unknown"] as unknown as WorkspaceModuleKey[] }]);
    expect(invalid[0]?.entitledModules).toEqual(["foundation", "revenue"]);
  });
});
