import type { PlatformSaasPlan } from "@/lib/api/GymOSApi";
import { entitledModulesForPlanSelection, WORKSPACE_MODULE_CATALOG } from "@/lib/domain/workspace-modules";
import type { WorkspaceModuleKey } from "@/lib/domain/types";
import { termPriceMinor } from "../../../convex/planCatalogue";

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
  entitledModules?: WorkspaceModuleKey[];
}

/**
 * Public launch pricing. Prices are integer JOD minor units (three decimal
 * places in the product's money contract), so annual totals never depend on
 * floating-point formatting in a component.
 */
/**
 * Public launch pricing, written out rather than derived. This module is
 * reached through the mock's import cycle, where a call into another module
 * at evaluation time is not yet safe. A test holds it to `PLAN_CATALOGUE`,
 * which stays the one place a price is changed.
 */
export const DEFAULT_PUBLIC_PRICING_PLANS: readonly PublicPricingPlan[] = [
  { name: "Starter", priceMinor: 79_000, branches: 1, staff: 8, members: 500, tone: "paper", entitledModules: ["foundation", "revenue"] },
  { name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500, tone: "signal", entitledModules: ["foundation", "revenue", "operations"] },
  { name: "Pro", priceMinor: 249_000, branches: 8, staff: 80, members: 10_000, tone: "night", entitledModules: ["foundation", "revenue", "operations", "finance", "reporting"] },
  { name: "Enterprise", priceMinor: 500_000, branches: 25, staff: 250, members: 50_000, tone: "night", entitledModules: ["foundation", "revenue", "operations", "finance", "reporting"] },
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
  // The same formula the invoice and the agreement quote.
  const annualTotalMinor = termPriceMinor(monthlyMinor, "annual");
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
      entitledModules: entitledModulesForPlanSelection(fallback.name, live.entitledModules ?? fallback.entitledModules),
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
  const modules = entitledModulesForPlanSelection(plan.name, plan.entitledModules);
  const moduleFeatures = modules.map((key) => WORKSPACE_MODULE_CATALOG.find((entry) => entry.key === key)?.label ?? key);
  return [
    `${plan.branches === 1 ? "1 branch" : `Up to ${plan.branches.toLocaleString()} branches`}`,
    `Up to ${plan.staff.toLocaleString()} staff accounts`,
    `Up to ${plan.members.toLocaleString()} members`,
    ...moduleFeatures,
    ...(plan.name === "Enterprise" ? ["Priority onboarding and support"] : []),
    ...common,
  ];
}

/** Keep the public pricing name aligned with the application API contract. */
export function asApplicationPlan(plan: PublicPricingPlanName): PlatformSaasPlan["name"] {
  return plan as PlatformSaasPlan["name"];
}
