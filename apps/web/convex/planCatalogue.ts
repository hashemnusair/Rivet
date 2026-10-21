/**
 * RIVET's published plans: the launch prices and the limits each plan
 * carries. Configuration, not tenant data, and free of Convex imports so the
 * agreement, the invoice and the browser describe a plan in the same words.
 * Commercial launch configuration. Existing signed documents remain immutable.
 */
export interface PlanDefinition {
  name: "Basic" | "Starter" | "Growth" | "Pro" | "Enterprise";
  priceMinor: number;
  branches: number;
  staff: number;
  members: number;
  onboardingFeeMinor: number;
  operationalEmails: number;
}

/** Explicit, JSON-safe sentinel. Capacity checks skip this limit; never display -1. */
export const UNLIMITED = -1;
export const CURRENT_PLAN_NAMES = ["Basic", "Pro"] as const;
export function isCurrentPlan(name: unknown): name is typeof CURRENT_PLAN_NAMES[number] {
  return name === "Basic" || name === "Pro";
}

export const PLAN_CATALOGUE: readonly PlanDefinition[] = [
  { name: "Basic", priceMinor: 49_000, branches: 1, staff: 5, members: 300, onboardingFeeMinor: 75_000, operationalEmails: 900 },
  { name: "Pro", priceMinor: 199_000, branches: UNLIMITED, staff: UNLIMITED, members: UNLIMITED, onboardingFeeMinor: 150_000, operationalEmails: 10_000 },
];

/** Read compatibility only: existing subscriptions and immutable agreements retain their names. */
export const LEGACY_PLAN_CATALOGUE: readonly PlanDefinition[] = [
  { name: "Starter", priceMinor: 39_000, branches: 1, staff: 3, members: 150, onboardingFeeMinor: 75_000, operationalEmails: 600 },
  { name: "Growth", priceMinor: 89_000, branches: 2, staff: 8, members: 300, onboardingFeeMinor: 150_000, operationalEmails: 1_500 },
  { name: "Enterprise", priceMinor: 500_000, branches: 25, staff: 250, members: 50_000, onboardingFeeMinor: 0, operationalEmails: 20_000 },
];

/** A year is twelve months billed once, at 5% off. */
export const ANNUAL_DISCOUNT_PERCENT = 5 as const;
export const ANNUAL_DISCOUNT = 0.95;
export const COMMERCIAL_TERMS_VERSION = "2026-10-21";

/** How each plan is drawn on a pricing card. Presentation, not pricing. */
export const PLAN_TONE: Readonly<Record<PlanDefinition["name"], "paper" | "signal" | "night">> = {
  Basic: "paper",
  Starter: "paper",
  Growth: "signal",
  Pro: "signal",
  Enterprise: "night",
};

/**
 * The catalogue as a pricing table, with each plan's tone attached. Every
 * surface that lists plans builds on this, so a price is changed in one file.
 */
export function planCatalogueWithTone(): Array<PlanDefinition & { tone: "paper" | "signal" | "night" }> {
  return PLAN_CATALOGUE.map((plan) => ({ ...plan, tone: PLAN_TONE[plan.name] }));
}

export type PlanInterval = "monthly" | "annual";

export function findPlan(name: string | undefined): PlanDefinition | undefined {
  return [...PLAN_CATALOGUE, ...LEGACY_PLAN_CATALOGUE].find((plan) => plan.name.toLowerCase() === (name ?? "").trim().toLowerCase());
}

const dinars = (minor: number) => `JOD ${(minor / 1000).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

/**
 * What one term costs at this cadence, from the plan's monthly price. Every
 * invoice, quote and projection goes through here, so the yearly saving is
 * stated once.
 */
export function termPriceMinor(monthlyMinor: number, interval: PlanInterval): number {
  return interval === "annual" ? Math.round(monthlyMinor * 12 * ANNUAL_DISCOUNT) : Math.round(monthlyMinor);
}

/** The plan as the agreement names it: the plan itself, without limits the
 * agreement does not promise. */
export function planSummary(name: string): string {
  return findPlan(name)?.name ?? name;
}

/** "JOD 149.000 per month" from a price in minor units, for the interval. */
export function feeLabel(priceMinor: number, interval: PlanInterval = "monthly"): string {
  return `${dinars(termPriceMinor(priceMinor, interval))} ${interval === "annual" ? "per year" : "per month"}`;
}

/** "JOD 149.000 per month" or "JOD 1,430.400 per year" */
export function planFee(name: string, interval: PlanInterval = "monthly"): string | undefined {
  const plan = findPlan(name);
  if (!plan) return undefined;
  return feeLabel(plan.priceMinor, interval);
}
