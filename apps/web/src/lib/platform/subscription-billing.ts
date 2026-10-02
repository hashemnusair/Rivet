import type { BillingInterval } from "@/lib/api/GymOSApi";
import { termChange } from "../../../convex/subscriptionTerm";

export type SubscriptionBillingInput = {
  /** The tenant's persisted subscription status before this change. */
  currentStatus: "trial" | "active" | "overdue" | "suspended" | "cancelled";
  /** Persisted paid-period boundary, ISO string, when one exists. */
  currentPeriodEndsAt?: string;
  plan: "Starter" | "Growth" | "Pro" | "Enterprise";
  billingInterval: BillingInterval;
  /** Monthly catalog price in minor units for the selected plan. */
  priceMinor?: number;
  /** The plan the tenant is leaving, when it differs from the new one. */
  currentPlanPriceMinor?: number;
  /** The cadence the outgoing term was billed at. */
  currentBillingInterval?: BillingInterval;
  now?: number;
};

export type SubscriptionBillingProjection = {
  /** What the gym owes today; undefined while the catalog is loading. */
  amountMinor?: number;
  /** The new term at list price. */
  subtotalMinor?: number;
  /** What the unfinished part of the outgoing term is worth. */
  creditMinor: number;
  /** Unused paid days behind that credit. */
  creditDays: number;
  /** The end of the new paid term. */
  newPeriodEnd: Date;
};

/**
 * Mirrors the server's billing rules so admin surfaces can show the exact
 * consequence before saving: a material change landing on an active
 * subscription starts a fresh term of one interval today, and the unfinished
 * part of the term it replaces comes back as money off that invoice.
 */
export function projectSubscriptionBilling(input: SubscriptionBillingInput): SubscriptionBillingProjection {
  const now = input.now ?? Date.now();
  const storedPeriodEnd = input.currentPeriodEndsAt === undefined ? undefined : Date.parse(input.currentPeriodEndsAt);
  const outgoingPrice = input.currentPlanPriceMinor ?? input.priceMinor;
  const change = termChange({
    now,
    interval: input.billingInterval,
    monthlyPriceMinor: input.priceMinor ?? 0,
    // Only a paid, running term is worth anything back.
    ...(input.currentStatus === "active" && storedPeriodEnd !== undefined && Number.isFinite(storedPeriodEnd) && outgoingPrice
      ? { outgoing: { periodEndsAt: storedPeriodEnd, monthlyPriceMinor: outgoingPrice, interval: input.currentBillingInterval ?? input.billingInterval } }
      : {}),
  });
  return {
    amountMinor: input.priceMinor === undefined ? undefined : change.amountMinor,
    subtotalMinor: input.priceMinor === undefined ? undefined : change.subtotalMinor,
    creditMinor: input.priceMinor === undefined ? 0 : change.creditMinor,
    creditDays: input.priceMinor === undefined ? 0 : change.creditDays,
    newPeriodEnd: new Date(change.periodEndsAt),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "27 Sep 2026", spelled the way the invoice and the agreement spell it. */
export function formatBillingDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const dinars = (minor: number) => `JOD ${(minor / 1_000).toFixed(3)}`;

/** Plain-language consequence lines for a change that lands on an active subscription. */
export function subscriptionBillingLines(input: SubscriptionBillingInput): string[] {
  const projection = projectSubscriptionBilling(input);
  const cadence = input.billingInterval === "annual" ? "annual, saves 20%" : "monthly";
  return [
    projection.subtotalMinor === undefined
      ? `${input.billingInterval === "annual" ? "An annual" : "A monthly"} invoice for the new ${input.plan} term is issued today.`
      : `An invoice for ${dinars(projection.subtotalMinor)} (${input.plan} · ${cadence}) is issued today.`,
    ...(projection.creditMinor > 0
      ? [`${projection.creditDays} unused paid ${projection.creditDays === 1 ? "day" : "days"} of the current term ${projection.creditDays === 1 ? "is" : "are"} credited: ${dinars(projection.creditMinor)} off, leaving ${dinars(projection.amountMinor ?? 0)} to pay.`]
      : []),
    `The new term runs until ${formatBillingDate(projection.newPeriodEnd)}.`,
    "Any older unpaid subscription invoice is voided so nothing is billed twice.",
  ];
}
