import { termPriceMinor, type PlanDefinition, type PlanInterval } from "./planCatalogue";

/** Tenant-owned quantities; prices and ceilings are always server-owned. */
export const ADD_ON_CATALOGUE = [
  { key: "branch", priceMinor: 39_000, max: 1 },
  { key: "members", priceMinor: 10_000, max: 3 },
  { key: "staff", priceMinor: 5_000, max: 3 },
  { key: "operations", priceMinor: 5_000, max: 1 },
  { key: "finance", priceMinor: 10_000, max: 1 },
  { key: "reporting", priceMinor: 10_000, max: 1 },
] as const;
export type AddOnKey = typeof ADD_ON_CATALOGUE[number]["key"];
export type SubscriptionAddOns = Record<AddOnKey, number>;
export const EMPTY_ADD_ONS: SubscriptionAddOns = { branch: 0, members: 0, staff: 0, operations: 0, finance: 0, reporting: 0 };

export function validateAddOns(input: unknown, plan: string | undefined): SubscriptionAddOns {
  if (input === undefined) return { ...EMPTY_ADD_ONS };
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Add-ons must contain quantities only.");
  const source = input as Record<string, unknown>;
  if (Object.keys(source).some(key => !ADD_ON_CATALOGUE.some(item => item.key === key))) throw new Error("Unknown add-on; prices and limits are server-owned.");
  const result = { ...EMPTY_ADD_ONS };
  for (const item of ADD_ON_CATALOGUE) {
    const quantity = source[item.key] === undefined ? 0 : source[item.key];
    if (typeof quantity !== "number" || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > item.max) throw new Error(`Invalid ${item.key} quantity. Basic is limited to 2 branches, 600 members and 11 staff accounts; choose Pro for more.`);
    result[item.key] = quantity;
  }
  if (plan !== "Basic" && Object.values(result).some(Boolean)) throw new Error("Paid add-ons are available only on Basic. Pro already includes all features and unlimited capacity.");
  if (result.finance && !result.operations) throw new Error("Financial OS requires daily operations.");
  if (result.reporting && !result.finance) throw new Error("Management reporting requires Financial OS.");
  return result;
}
export function addOnMonthlyPrice(addOns: SubscriptionAddOns): number {
  return ADD_ON_CATALOGUE.reduce((sum, item) => sum + item.priceMinor * addOns[item.key], 0);
}
export function applyAddOns(plan: PlanDefinition, input?: SubscriptionAddOns): PlanDefinition {
  const addons = validateAddOns(input, plan.name);
  if (plan.name !== "Basic") return plan;
  // Fixed organization-wide capacity: catalog overrides cannot bypass Basic's ceiling.
  return { ...plan, priceMinor: plan.priceMinor + addOnMonthlyPrice(addons), branches: 1 + addons.branch, members: 300 + 100 * addons.members, staff: 5 + 2 * addons.staff, operationalEmails: 900 + 300 * addons.members };
}
export function addOnModules(plan: string | undefined, input?: SubscriptionAddOns): Array<"operations" | "finance" | "reporting"> {
  const addons = validateAddOns(input, plan);
  return (["operations", "finance", "reporting"] as const).filter(key => addons[key] > 0);
}
export interface SubscriptionInvoiceLine { key: "base" | AddOnKey; quantity: number; amountMinor: number; }
export function subscriptionInvoiceLines(basePriceMinor: number, input: SubscriptionAddOns, interval: PlanInterval): SubscriptionInvoiceLine[] {
  return [{ key: "base", quantity: 1, amountMinor: termPriceMinor(basePriceMinor, interval) }, ...ADD_ON_CATALOGUE.filter(item => input[item.key] > 0).map(item => ({ key: item.key, quantity: input[item.key], amountMinor: termPriceMinor(item.priceMinor * input[item.key], interval) }))];
}
