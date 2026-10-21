import type { PlatformSaasPlan } from "@/lib/api/GymOSApi";
import { entitledModulesForPlanSelection, WORKSPACE_MODULE_CATALOG } from "@/lib/domain/workspace-modules";
import type { WorkspaceModuleKey } from "@/lib/domain/types";
import { ANNUAL_DISCOUNT_PERCENT, termPriceMinor, COMMERCIAL_TERMS_VERSION } from "../../../convex/planCatalogue";

export { ANNUAL_DISCOUNT_PERCENT };

/** The two billing cadences shown on public pricing and gym applications. */
export type BillingInterval = "monthly" | "annual";

export type PublicPricingPlanName = "Basic" | "Starter" | "Growth" | "Pro" | "Enterprise";

export interface PublicPricingPlan {
  name: PublicPricingPlanName;
  commercialTermsVersion?: string;
  priceMinor: number;
  branches: number;
  staff: number;
  members: number;
  /** One-time setup fee in JOD minor units. Optional for old public API payloads. */
  onboardingFeeMinor?: number;
  /** Monthly operational email allowance. Optional for old public API payloads. */
  operationalEmails?: number;
  tone: "paper" | "signal" | "night";
  entitledModules?: WorkspaceModuleKey[];
}

/**
 * Public launch pricing. Prices and one-time onboarding fees are integer JOD
 * minor units (three decimal places), so totals never depend on formatting in
 * a component. Only Basic and Pro are offered to new applicants.
 */
/**
 * Public launch pricing, written out rather than derived. This module is
 * reached through the mock's import cycle, where a call into another module
 * at evaluation time is not yet safe. A test holds it to `PLAN_CATALOGUE`,
 * which stays the one place a price is changed.
 */
export const DEFAULT_PUBLIC_PRICING_PLANS: readonly PublicPricingPlan[] = [
  { name: "Basic", priceMinor: 49_000, branches: 1, staff: 5, members: 300, onboardingFeeMinor: 75_000, operationalEmails: 900, tone: "paper", entitledModules: ["foundation", "revenue"] },
  { name: "Pro", priceMinor: 199_000, branches: -1, staff: -1, members: -1, onboardingFeeMinor: 150_000, operationalEmails: 10_000, tone: "signal", entitledModules: ["foundation", "revenue", "operations", "finance", "reporting"] },
];

const PLAN_NAMES = new Set<PublicPricingPlanName>(DEFAULT_PUBLIC_PRICING_PLANS.map((plan) => plan.name));

export interface PlanPrice {
  interval: BillingInterval;
  monthlyMinor: number;
  annualTotalMinor: number;
  effectiveMonthlyMinor: number;
  /** First billing charge for the selected cadence, including onboarding. */
  firstPaymentMinor: number;
  /** One-time setup amount included in the first billing charge. */
  onboardingFeeMinor: number;
  savingsMinor: number;
  discountPercent: typeof ANNUAL_DISCOUNT_PERCENT | 0;
}

/**
 * Calculate the display price for a billing cadence. Annual billing is paid
 * once per year at the configured discount off twelve monthly payments.
 */
export function calculatePlanPrice(plan: Pick<PublicPricingPlan, "priceMinor" | "onboardingFeeMinor">, interval: BillingInterval): PlanPrice {
  const monthlyMinor = Math.max(0, Math.round(plan.priceMinor));
  const undiscountedAnnualMinor = monthlyMinor * 12;
  // The same formula the invoice and the agreement quote.
  const annualTotalMinor = termPriceMinor(monthlyMinor, "annual");
  const onboardingFeeMinor = Math.max(0, Math.round(plan.onboardingFeeMinor ?? 0));
  const firstTermMinor = interval === "annual" ? annualTotalMinor : monthlyMinor;
  return {
    interval,
    monthlyMinor,
    annualTotalMinor,
    effectiveMonthlyMinor: interval === "annual" ? Math.round(annualTotalMinor / 12) : monthlyMinor,
    onboardingFeeMinor,
    firstPaymentMinor: firstTermMinor + onboardingFeeMinor,
    savingsMinor: interval === "annual" ? undiscountedAnnualMinor - annualTotalMinor : 0,
    discountPercent: interval === "annual" ? ANNUAL_DISCOUNT_PERCENT : 0,
  };
}

/** Keep public JOD formatting consistent wherever pricing is shown. */
export function formatJodMinor(amountMinor: number): string {
  return (Math.max(0, Math.round(amountMinor)) / 1000).toFixed(3);
}

/**
 * Resolve the public launch contract against live values. Missing fields on
 * old API payloads inherit the launch values while deployments migrate.
 * Only Basic and Pro are offered; retired plans are never returned.
 */
export function resolvePublicPricingPlans(
  livePlans: readonly (Partial<PublicPricingPlan> & { name: string })[],
): PublicPricingPlan[] {
  const byName = new Map(livePlans.map((plan) => [plan.name, plan]));
  return DEFAULT_PUBLIC_PRICING_PLANS.map((fallback) => {
    const live = byName.get(fallback.name);
    if (!live || (fallback.name === "Pro" && live.commercialTermsVersion !== COMMERCIAL_TERMS_VERSION)) return { ...fallback };
    return {
      ...fallback,
      ...live,
      name: fallback.name,
      priceMinor: Number.isFinite(live.priceMinor) ? Math.max(0, Math.round(live.priceMinor!)) : fallback.priceMinor,
      branches: fallback.name === "Pro" ? -1 : Number.isFinite(live.branches) ? Math.max(0, Math.round(live.branches!)) : fallback.branches,
      staff: fallback.name === "Pro" ? -1 : Number.isFinite(live.staff) ? Math.max(0, Math.round(live.staff!)) : fallback.staff,
      members: fallback.name === "Pro" ? -1 : Number.isFinite(live.members) ? Math.max(0, Math.round(live.members!)) : fallback.members,
      onboardingFeeMinor: Number.isFinite(live.onboardingFeeMinor) ? Math.max(0, Math.round(live.onboardingFeeMinor!)) : fallback.onboardingFeeMinor,
      operationalEmails: Number.isFinite(live.operationalEmails) ? Math.max(0, Math.round(live.operationalEmails!)) : fallback.operationalEmails,
      tone: live.tone === "paper" || live.tone === "signal" || live.tone === "night" ? live.tone : fallback.tone,
      // Preserve the canonical launch tiers when old payloads omit this field,
      // while keeping platform-admin module selections authoritative.
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

/** Enterprise remains available to legacy applications, with custom pricing. */
export function isPublicQuotePlan(plan: Pick<PublicPricingPlan, "name">): boolean {
  return plan.name === "Enterprise";
}

/** Public-facing capability summary kept in step with the workspace tiers. */
export function publicPlanFeatures(plan: PublicPricingPlan): string[] {
  const common = ["Member app", "Staff permissions and audit history"];
  const modules = entitledModulesForPlanSelection(plan.name, plan.entitledModules);
  const moduleFeatures = modules.map((key) => WORKSPACE_MODULE_CATALOG.find((entry) => entry.key === key)?.label ?? key);
  if (isPublicQuotePlan(plan)) {
    return [
      "Branches, active-member capacity, staff accounts and email allowance confirmed by quote",
      ...moduleFeatures,
      ...common,
    ];
  }
  return [
    plan.branches === -1 ? "Unlimited branches" : `${plan.branches === 1 ? "1 branch" : `Up to ${plan.branches.toLocaleString()} branches`}`,
    plan.members === -1 ? "Unlimited members" : `Up to ${plan.members.toLocaleString()} active members across all branches`,
    plan.staff === -1 ? "Unlimited owner and staff accounts" : `Up to ${plan.staff.toLocaleString()} owner and staff accounts`,
    `Up to ${(plan.operationalEmails ?? 0).toLocaleString()} operational emails per month`,
    ...moduleFeatures,
    ...common,
  ];
}

/** Keep the public pricing name aligned with the application API contract. */
export function asApplicationPlan(plan: PublicPricingPlanName): PlatformSaasPlan["name"] {
  return plan as PlatformSaasPlan["name"];
}
