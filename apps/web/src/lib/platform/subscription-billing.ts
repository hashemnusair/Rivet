import type { BillingInterval } from "@/lib/api/GymOSApi";

const DAY_MS = 86_400_000;

export type SubscriptionBillingInput = {
  /** The tenant's persisted subscription status before this change. */
  currentStatus: "trial" | "active" | "overdue" | "suspended" | "cancelled";
  /** Persisted paid-period boundary, ISO string, when one exists. */
  currentPeriodEndsAt?: string;
  plan: "Starter" | "Growth" | "Pro" | "Enterprise";
  billingInterval: BillingInterval;
  /** Monthly catalog price in minor units for the selected plan. */
  priceMinor?: number;
  now?: number;
};

export type SubscriptionBillingProjection = {
  /** Invoice amount in minor units; undefined while the catalog is loading. */
  amountMinor?: number;
  /** Unused paid days from the outgoing active term rolled into the new one. */
  creditDays: number;
  /** Approximate end of the new paid term. */
  newPeriodEnd: Date;
};

/**
 * Mirrors the server's billing rules so admin surfaces can show the exact
 * consequence before saving: a material change landing on an active
 * subscription starts a new term today, issues its invoice at
 * interval-correct pricing, and rolls unused paid days forward.
 */
export function projectSubscriptionBilling(input: SubscriptionBillingInput): SubscriptionBillingProjection {
  const now = input.now ?? Date.now();
  const amountMinor = input.priceMinor === undefined
    ? undefined
    : input.billingInterval === "annual"
      ? Math.round(input.priceMinor * 12 * 0.8)
      : input.priceMinor;
  const storedPeriodEnd = input.currentPeriodEndsAt === undefined ? undefined : Date.parse(input.currentPeriodEndsAt);
  const creditDays = (input.currentStatus === "active" || input.currentStatus === "overdue")
    && storedPeriodEnd !== undefined && Number.isFinite(storedPeriodEnd) && storedPeriodEnd > now
    ? Math.ceil((storedPeriodEnd - now) / DAY_MS)
    : 0;
  const end = new Date(now);
  end.setUTCMonth(end.getUTCMonth() + (input.billingInterval === "annual" ? 12 : 1));
  return { amountMinor, creditDays, newPeriodEnd: new Date(end.getTime() + creditDays * DAY_MS) };
}

export function formatBillingDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Plain-language consequence lines for a change that lands on an active subscription. */
export function subscriptionBillingLines(input: SubscriptionBillingInput): string[] {
  const projection = projectSubscriptionBilling(input);
  return [
    projection.amountMinor === undefined
      ? `${input.billingInterval === "annual" ? "An annual" : "A monthly"} invoice for the new ${input.plan} term is issued today.`
      : `An invoice for JOD ${(projection.amountMinor / 1_000).toFixed(3)} (${input.plan} · ${input.billingInterval === "annual" ? "annual, saves 20%" : "monthly"}) is issued today.`,
    ...(projection.creditDays > 0 ? [`${projection.creditDays} unused paid ${projection.creditDays === 1 ? "day" : "days"} from the current term ${projection.creditDays === 1 ? "carries" : "carry"} over.`] : []),
    `The new term runs until about ${formatBillingDate(projection.newPeriodEnd)}.`,
    "Any older unpaid subscription invoice is voided so nothing is billed twice.",
  ];
}
