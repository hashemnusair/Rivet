import { describe, expect, it } from "vitest";
import { COMMERCIAL_TERMS_VERSION } from "../../../convex/planCatalogue";
import { DEFAULT_PUBLIC_PRICING_PLANS, calculatePlanPrice, isPublicPricingPlanName, pricingSignupHref, publicPlanFeatures, resolvePublicPricingPlans } from "./pricing";

describe("two-plan commercial contract", () => {
  it("publishes Basic and unlimited Pro with plan-specific onboarding", () => {
    expect(DEFAULT_PUBLIC_PRICING_PLANS).toMatchObject([
      { name: "Basic", priceMinor: 49_000, branches: 1, staff: 5, members: 300, operationalEmails: 900, onboardingFeeMinor: 75_000 },
      { name: "Pro", priceMinor: 199_000, branches: -1, staff: -1, members: -1, operationalEmails: 10_000, onboardingFeeMinor: 150_000 },
    ]);
    expect(DEFAULT_PUBLIC_PRICING_PLANS).toHaveLength(2);
    for (const retired of ["Starter", "Growth", "Enterprise"]) expect(isPublicPricingPlanName(retired)).toBe(false);
  });

  it("calculates exact monthly and discounted annual totals including onboarding once", () => {
    const [basic, pro] = DEFAULT_PUBLIC_PRICING_PLANS;
    expect(calculatePlanPrice(basic!, "monthly")).toMatchObject({ firstPaymentMinor: 124_000, savingsMinor: 0 });
    expect(calculatePlanPrice(pro!, "monthly")).toMatchObject({ firstPaymentMinor: 349_000 });
    expect(calculatePlanPrice(basic!, "annual")).toMatchObject({ annualTotalMinor: 558_600, effectiveMonthlyMinor: 46_550, firstPaymentMinor: 633_600, savingsMinor: 29_400 });
    expect(calculatePlanPrice(pro!, "annual")).toMatchObject({ annualTotalMinor: 2_268_600, effectiveMonthlyMinor: 189_050, firstPaymentMinor: 2_418_600 });
  });

  it("rejects retired entries and old Pro overrides in mixed-version deployments", () => {
    const resolved = resolvePublicPricingPlans([
      { name: "Starter", priceMinor: 39_000 },
      { name: "Enterprise", priceMinor: 500_000 },
      { name: "Pro", priceMinor: 249_000, branches: 5, members: 1_000, staff: 20, onboardingFeeMinor: 300_000, entitledModules: ["foundation"] },
    ]);
    expect(resolved).toEqual(DEFAULT_PUBLIC_PRICING_PLANS);
  });

  it("accepts current commercial edits but preserves Pro unlimited capacity and all features", () => {
    const resolved = resolvePublicPricingPlans([{ name: "Pro", commercialTermsVersion: COMMERCIAL_TERMS_VERSION, priceMinor: 200_000, branches: 3, entitledModules: ["foundation"] }]);
    expect(resolved[1]).toMatchObject({ priceMinor: 200_000, branches: -1, entitledModules: ["foundation", "revenue", "operations", "finance", "reporting"] });
  });

  it("renders real allowances without exposing the unlimited sentinel", () => {
    expect(publicPlanFeatures(DEFAULT_PUBLIC_PRICING_PLANS[0]!)).toEqual(expect.arrayContaining(["1 branch", "Up to 300 active members across all branches", "Up to 5 owner and staff accounts", "Up to 900 operational emails per month"]));
    const features = publicPlanFeatures(DEFAULT_PUBLIC_PRICING_PLANS[1]!);
    expect(features).toEqual(expect.arrayContaining(["Unlimited branches", "Unlimited members", "Unlimited owner and staff accounts", "Financial operating system", "Management reporting"]));
    expect(features.join(" ")).not.toContain("-1");
    expect(pricingSignupHref("Basic", "annual")).toBe("/signup?plan=Basic&interval=annual");
  });
});
