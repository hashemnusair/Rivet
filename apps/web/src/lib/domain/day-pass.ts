/**
 * Day passes: a gym can offer a paid day pass on its trial days instead of a
 * free trial. The member picks a date and says how they will pay (CliQ before
 * they come, or cash at the desk); the gym records the payment, which sells
 * its "Day pass" plan (one visit) so the money reaches receipts, the cash
 * drawer and reports like any membership sale.
 *
 * No imports: Convex reads this file as well as the preview adapter and the
 * screens, so the three agree on the rules.
 */

export const TRIAL_OFFER_KINDS = ["free_trial", "day_pass"] as const;
export const DAY_PASS_PAYMENT_METHODS = ["cliq", "cash"] as const;

export const DAY_PASS_LIMITS = {
  /** Highest day-pass price, in minor units (JOD 500.000). */
  maxPriceMinor: 500_000,
  /** A CliQ alias is short (an alias name or a phone number); 40 leaves room. */
  cliqAlias: 40,
  /** A bank app's transfer reference. */
  cliqReference: 60,
} as const;

/** The plan a recorded day-pass payment sells. The gym may rename it in Plans. */
export const DAY_PASS_PLAN = {
  name: "Day pass",
  /** The name for a gym whose default language is Arabic (proposed term, docs/09). */
  nameAr: "اشتراك يومي",
  code: "DAY-PASS",
  kind: "visits",
  visitAllowance: 1,
  visitValidityDays: 1,
} as const;

/** The goal stored on a day-pass booking, which asks no goal. */
export const DAY_PASS_GOAL = "Day pass";

export interface TrialOfferValue {
  kind: (typeof TRIAL_OFFER_KINDS)[number];
  dayPassPrice?: { amount: number; currency: string };
  cliqAlias?: string;
  dayPassPlanId?: string;
}

/** A stored offer, or a free trial when the gym never chose (settings saved before day passes). */
export function trialOfferOf(raw: unknown): TrialOfferValue {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const price = value.dayPassPrice && typeof value.dayPassPrice === "object" ? (value.dayPassPrice as Record<string, unknown>) : undefined;
  const amount = typeof price?.amount === "number" ? price.amount : undefined;
  const currency = typeof price?.currency === "string" ? price.currency : undefined;
  const cliqAlias = typeof value.cliqAlias === "string" && value.cliqAlias.trim() ? value.cliqAlias.trim() : undefined;
  const dayPassPlanId = typeof value.dayPassPlanId === "string" && value.dayPassPlanId ? value.dayPassPlanId : undefined;
  const sellsDayPass = value.kind === "day_pass" && amount !== undefined && amount > 0 && currency !== undefined;
  return {
    kind: sellsDayPass ? "day_pass" : "free_trial",
    ...(amount !== undefined && currency ? { dayPassPrice: { amount, currency } } : {}),
    ...(cliqAlias ? { cliqAlias } : {}),
    ...(dayPassPlanId ? { dayPassPlanId } : {}),
  };
}

/** What a gym's public page may show: never the plan id. A free trial shows nothing else. */
export function publicTrialOfferOf(raw: unknown): { kind: TrialOfferValue["kind"]; dayPassPrice?: { amount: number; currency: string }; cliqAlias?: string } {
  const offer = trialOfferOf(raw);
  if (offer.kind !== "day_pass") return { kind: "free_trial" };
  return { kind: "day_pass", dayPassPrice: offer.dayPassPrice, ...(offer.cliqAlias ? { cliqAlias: offer.cliqAlias } : {}) };
}

/** The ways a member may pay for this gym's day pass: CliQ only when the gym gave an alias. */
export function dayPassPaymentMethods(offer: { cliqAlias?: string }): Array<(typeof DAY_PASS_PAYMENT_METHODS)[number]> {
  return offer.cliqAlias ? ["cliq", "cash"] : ["cash"];
}

/** A booking is a day pass only when it says so; older bookings are free trials. */
export function isDayPassBooking(booking: { kind?: unknown }): boolean {
  return booking.kind === "day_pass";
}

/** A day pass the gym has not yet recorded a payment for, and that can still be paid. */
export function dayPassAwaitsPayment(booking: { kind?: unknown; paymentStatus?: unknown; status?: unknown }): boolean {
  return isDayPassBooking(booking) && booking.paymentStatus !== "paid" && (booking.status === "requested" || booking.status === "confirmed");
}
