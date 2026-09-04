import type { PlatformSaasPlan } from "@/lib/api/GymOSApi";
import { entitledModulesForPlanSelection, WORKSPACE_MODULE_CATALOG } from "@/lib/domain/workspace-modules";
import type { WorkspaceModuleKey } from "@/lib/domain/types";
import { planCatalogueWithTone, termPriceMinor } from "../../../convex/planCatalogue";

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
const PUBLIC_PLAN_MODULES: Readonly<Record<PublicPricingPlanName, WorkspaceModuleKey[]>> = {
  Starter: ["foundation", "revenue"],
  Growth: ["foundation", "revenue", "operations"],
  Pro: ["foundation", "revenue", "operations", "finance", "reporting"],
  Enterprise: ["foundation", "revenue", "operations", "finance", "reporting"],
};

export const DEFAULT_PUBLIC_PRICING_PLANS: readonly PublicPricingPlan[] = planCatalogueWithTone().map((plan) => ({
  ...plan,
  entitledModules: PUBLIC_PLAN_MODULES[plan.name],
}));

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
