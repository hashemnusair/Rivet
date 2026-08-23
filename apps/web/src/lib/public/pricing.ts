import type { PlatformSaasPlan } from "@/lib/api/GymOSApi";

/** The two billing cadences shown on public pricing and gym applications. */
export type BillingInterval = "monthly" | "annual";

export const ANNUAL_DISCOUNT_PERCENT = 20 as const;

export type PublicPricingPlanName = "Starter" | "Growth" | "Pro" | "Enterprise";

export interface PublicPricingPlan {
  name: PublicPricingPlanName;
  priceMinor: number;
  branches: number;
  staff: number;
  members: number;
  tone: "paper" | "signal" | "night";
}

/**
 * Public launch pricing. Prices are integer JOD minor units (three decimal
 * places in the product's money contract), so annual totals never depend on
 * floating-point formatting in a component.
 */
export const DEFAULT_PUBLIC_PRICING_PLANS: readonly PublicPricingPlan[] = [
  { name: "Starter", priceMinor: 79_000, branches: 1, staff: 8, members: 500, tone: "paper" },
  { name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500, tone: "signal" },
  { name: "Pro", priceMinor: 249_000, branches: 8, staff: 80, members: 10_000, tone: "night" },
  { name: "Enterprise", priceMinor: 500_000, branches: 25, staff: 250, members: 50_000, tone: "night" },
];

const PLAN_NAMES = new Set<PublicPricingPlanName>(DEFAULT_PUBLIC_PRICING_PLANS.map((plan) => plan.name));

export interface PlanPrice {
  interval: BillingInterval;
  monthlyMinor: number;
  annualTotalMinor: number;
  effectiveMonthlyMinor: number;
  savingsMinor: number;
  discountPercent: typeof ANNUAL_DISCOUNT_PERCENT | 0;
}

/**
 * Calculate the display price for a billing cadence. Annual billing is paid
 * once per year at 20% off the equivalent twelve monthly payments.
 */
export function calculatePlanPrice(plan: Pick<PublicPricingPlan, "priceMinor">, interval: BillingInterval): PlanPrice {
  const monthlyMinor = Math.max(0, Math.round(plan.priceMinor));
  const undiscountedAnnualMinor = monthlyMinor * 12;
  const annualTotalMinor = Math.round(undiscountedAnnualMinor * (1 - ANNUAL_DISCOUNT_PERCENT / 100));
  return {
    interval,
    monthlyMinor,
    annualTotalMinor,
    effectiveMonthlyMinor: interval === "annual" ? Math.round(annualTotalMinor / 12) : monthlyMinor,
    savingsMinor: interval === "annual" ? undiscountedAnnualMinor - annualTotalMinor : 0,
    discountPercent: interval === "annual" ? ANNUAL_DISCOUNT_PERCENT : 0,
  };
}

/** Keep public JOD formatting consistent wherever pricing is shown. */
export function formatJodMinor(amountMinor: number): string {
  return (Math.max(0, Math.round(amountMinor)) / 1000).toFixed(3);
}

/**
 * Resolve a live catalog against the public launch contract. This makes the
 * landing page resilient while a deployment is migrating its catalog and
 * guarantees that the fourth Enterprise tier is not silently omitted.
 */
export function resolvePublicPricingPlans(
  livePlans: readonly (Partial<PublicPricingPlan> & { name: string })[],
): PublicPricingPlan[] {
  const byName = new Map(livePlans.map((plan) => [plan.name, plan]));
  return DEFAULT_PUBLIC_PRICING_PLANS.map((fallback) => {
    const live = byName.get(fallback.name);
    if (!live) return { ...fallback };
    return {
      ...fallback,
      ...live,
      name: fallback.name,
      priceMinor: Number.isFinite(live.priceMinor) ? Math.max(0, Math.round(live.priceMinor!)) : fallback.priceMinor,
      branches: Number.isFinite(live.branches) ? Math.max(0, Math.round(live.branches!)) : fallback.branches,
      staff: Number.isFinite(live.staff) ? Math.max(0, Math.round(live.staff!)) : fallback.staff,
      members: Number.isFinite(live.members) ? Math.max(0, Math.round(live.members!)) : fallback.members,
      tone: live.tone === "paper" || live.tone === "signal" || live.tone === "night" ? live.tone : fallback.tone,
    };
  });
}

export function isPublicPricingPlanName(value: string | null | undefined): value is PublicPricingPlanName {
  return Boolean(value && PLAN_NAMES.has(value as PublicPricingPlanName));
}

export function isBillingInterval(value: string | null | undefined): value is BillingInterval {
  return value === "monthly" || value === "annual";
}

export function pricingSignupHref(plan: PublicPricingPlanName, interval: BillingInterval): string {
  const params = new URLSearchParams({ plan, interval });
  return `/signup?${params.toString()}`;
}

/** Public-facing capability summary kept in step with the workspace tiers. */
export function publicPlanFeatures(plan: PublicPricingPlan): string[] {
  const common = ["Member app and marketplace listing", "Staff permissions and audit history"];
  if (plan.name === "Enterprise") {
    return ["Up to 25 branches", "Up to 250 staff accounts", "Up to 50,000 members", "All workspace modules", "Priority onboarding and support", ...common];
  }
  const tierFeatures: Record<Exclude<PublicPricingPlanName, "Enterprise">, string[]> = {
    Starter: ["1 branch", "Up to 8 staff accounts", "Up to 500 members", "Gym foundation and revenue tools"],
    Growth: ["Up to 3 branches", "Up to 25 staff accounts", "Up to 2,500 members", "Daily operations workspace"],
    Pro: ["Up to 8 branches", "Up to 80 staff accounts", "Up to 10,000 members", "Finance and management reporting"],
  };
  return [...tierFeatures[plan.name], ...common];
}

/** Keep the public pricing name aligned with the application API contract. */
export function asApplicationPlan(plan: PublicPricingPlanName): PlatformSaasPlan["name"] {
  return plan as PlatformSaasPlan["name"];
}
