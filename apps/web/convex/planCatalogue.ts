/**
 * RIVET's published plans: the launch prices and the limits each plan
 * carries. Configuration, not tenant data, and free of Convex imports so the
 * agreement, the invoice and the browser describe a plan in the same words.
 * The numbers stay provisional until the pricing sheet in docs/19 is signed.
 */
export interface PlanDefinition {
  name: "Starter" | "Growth" | "Pro" | "Enterprise";
  priceMinor: number;
  branches: number;
  staff: number;
  members: number;
}

export const PLAN_CATALOGUE: readonly PlanDefinition[] = [
  { name: "Starter", priceMinor: 79_000, branches: 1, staff: 8, members: 500 },
  { name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500 },
  { name: "Pro", priceMinor: 249_000, branches: 8, staff: 80, members: 10_000 },
  { name: "Enterprise", priceMinor: 500_000, branches: 25, staff: 250, members: 50_000 },
];

/** A year is twelve months billed once, at 20% off. */
export const ANNUAL_DISCOUNT = 0.8;

export type PlanInterval = "monthly" | "annual";

export function findPlan(name: string | undefined): PlanDefinition | undefined {
  return PLAN_CATALOGUE.find((plan) => plan.name.toLowerCase() === (name ?? "").trim().toLowerCase());
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
