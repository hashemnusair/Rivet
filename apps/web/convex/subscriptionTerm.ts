/**
 * One set of rules for a platform subscription term: when it ends, what the
 * gym owes for it, and what an unfinished term is worth when the plan or the
 * cadence changes mid-way.
 *
 * The module is pure and free of Convex imports so the server, the mock API
 * and the admin preview all answer the same question the same way. The dates
 * it produces are the dates the invoice prints.
 */
import { termPriceMinor, type PlanInterval } from "./planCatalogue";

export type BillingInterval = PlanInterval;

export const DAY_MS = 86_400_000;

/** Months in one term of each cadence. */
export function monthsInTerm(interval: BillingInterval): number {
  return interval === "annual" ? 12 : 1;
}

/** Add calendar months without allowing Jan 31 to spill into March. */
export function addCalendarMonths(timestamp: number, months: number): number {
  const source = new Date(timestamp);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1, source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.getTime();
}

/** The end of a term that starts at this instant. One interval, never more. */
export function termEnd(startMs: number, interval: BillingInterval): number {
  return addCalendarMonths(startMs, monthsInTerm(interval));
}

/** The start of the term that ends at this instant. */
export function termStart(endMs: number, interval: BillingInterval): number {
  return addCalendarMonths(endMs, -monthsInTerm(interval));
}

/** Whole days between two instants, never negative. */
export function daysBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.ceil((toMs - fromMs) / DAY_MS));
}

/**
 * Payment and enforcement windows, taken from the signed subscription
 * agreement: invoices are payable within 14 days, and access may be suspended
 * after 7 days' written notice once an invoice is more than 14 days overdue.
 */
export const PAYMENT_TERM_DAYS = 14;
export const OVERDUE_BEFORE_NOTICE_DAYS = 14;
export const SUSPENSION_NOTICE_DAYS = 7;
/** Days after the due date at which access may be suspended. */
export const SUSPENSION_AFTER_DUE_DAYS = OVERDUE_BEFORE_NOTICE_DAYS + SUSPENSION_NOTICE_DAYS;
/**
 * A renewal invoice is raised this many days before the term it covers
 * begins. Fourteen days, the agreement's payment term, puts the due date on
 * the last day of the paid term, so a gym that pays on time never runs late.
 */
export const INVOICE_LEAD_DAYS = 14;
/** Days before a term ends on which an unpaid renewal invoice is reminded by email. */
export const RENEWAL_REMINDER_DAYS = [7, 3, 1] as const;

/** The outgoing term a change interrupts, when the gym has paid for one. */
export interface OutgoingTerm {
  /** When the paid term was due to end. */
  periodEndsAt: number;
  /** Stored service start when available, including short funded upgrade terms. */
  periodStartsAt?: number;
  /** The plan's monthly list price during that term, in minor units. */
  monthlyPriceMinor: number;
  /** Historical subscription value, excluding setup fees; never reprice paid history. */
  amountMinor?: number;
  /** The cadence that term was billed at. */
  interval: BillingInterval;
}

export interface TermChangeInput {
  now: number;
  /** The cadence the new term is billed at. */
  interval: BillingInterval;
  /** The new plan's monthly list price, in minor units. */
  monthlyPriceMinor: number;
  /** The term being replaced, when it was paid and still running. */
  outgoing?: OutgoingTerm;
}

/** Only collected money or a carried paid credit can fund the next term. */
export function fundedSubscriptionValue(invoice: { status?: unknown; subtotalMinor?: unknown; amountMinor?: unknown; onboardingFeeMinor?: unknown; creditMinor?: unknown; websiteMinor?: unknown; subscriptionDiscountMinor?: unknown; upgradeActivation?: unknown }): number | undefined {
  if (invoice.status === "void") return undefined;
  if (invoice.status === "paid" && invoice.upgradeActivation && typeof invoice.upgradeActivation === "object" && "fundedSubscriptionMinor" in invoice.upgradeActivation) {
    const funded = invoice.upgradeActivation.fundedSubscriptionMinor;
    return typeof funded === "number" && Number.isSafeInteger(funded) && funded >= 0 ? funded : undefined;
  }
  // A first invoice can also carry a website and a promo discount; neither is
  // subscription value a later term change should credit back.
  const nonSubscription = (typeof invoice.onboardingFeeMinor === "number" ? invoice.onboardingFeeMinor : 0)
    + (typeof invoice.websiteMinor === "number" ? invoice.websiteMinor : 0)
    + (typeof invoice.subscriptionDiscountMinor === "number" ? invoice.subscriptionDiscountMinor : 0);
  const gross = invoice.status === "paid"
    ? (typeof invoice.subtotalMinor === "number" ? invoice.subtotalMinor : invoice.amountMinor)
    : invoice.creditMinor;
  const value = typeof gross === "number" ? gross - (invoice.status === "paid" ? nonSubscription : 0) : 0;
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export interface TermChange {
  /** The new term ends exactly one interval from today. */
  periodEndsAt: number;
  /** The new term at list price. */
  subtotalMinor: number;
  /** What the unused days of the outgoing term are worth, capped at the subtotal. */
  creditMinor: number;
  /** Unused days behind that credit, for the wording on the invoice. */
  creditDays: number;
  /** What the gym owes today. */
  amountMinor: number;
}

/**
 * A plan or cadence change that starts a new paid term today.
 *
 * The new term is exactly one interval long. The unfinished part of the
 * outgoing term is not carried as extra time, which would compound and hand
 * over months of a more expensive plan for free; it is valued in money at the
 * rate the gym actually paid and deducted from the new invoice. The deduction
 * never exceeds the invoice, so no term is ever billed as a negative amount.
 */
export function termChange(input: TermChangeInput): TermChange {
  const subtotalMinor = termPriceMinor(input.monthlyPriceMinor, input.interval);
  const periodEndsAt = termEnd(input.now, input.interval);
  const outgoing = input.outgoing;
  if (!outgoing || outgoing.periodEndsAt <= input.now) {
    return { periodEndsAt, subtotalMinor, creditMinor: 0, creditDays: 0, amountMinor: subtotalMinor };
  }
  const outgoingStart = outgoing.periodStartsAt ?? termStart(outgoing.periodEndsAt, outgoing.interval);
  const termDays = daysBetween(outgoingStart, outgoing.periodEndsAt);
  const creditDays = Math.min(daysBetween(input.now, outgoing.periodEndsAt), termDays);
  const outgoingPrice = outgoing.amountMinor ?? termPriceMinor(outgoing.monthlyPriceMinor, outgoing.interval);
  const worth = termDays === 0 ? 0 : Math.round((outgoingPrice * creditDays) / termDays);
  const creditMinor = Math.max(0, Math.min(subtotalMinor, worth));
  return { periodEndsAt, subtotalMinor, creditMinor, creditDays: creditMinor > 0 ? creditDays : 0, amountMinor: subtotalMinor - creditMinor };
}


export interface UpgradeActivation {
  quotedPeriodStart?: string;
  quotedPeriodEnd?: string;
  quotedCreditMinor: number;
  appliedCreditMinor: number;
  consumedCreditMinor: number;
  fundedSubscriptionMinor: number;
  nominalSubscriptionMinor: number;
  periodStart: string;
  periodEnd: string;
}

/**
 * Preserve cash and historical invoice amounts while consuming old-plan time
 * only once. Review never backdates new service or consumes the service bought
 * by the transfer. Only the still-unused part of the quoted credit funds it.
 */
export function upgradeActivation(input: { now: number; interval: BillingInterval; amountMinor: number; subtotalMinor: number; onboardingFeeMinor: number; creditMinor: number; outgoing?: OutgoingTerm }): UpgradeActivation {
  const nominal = input.subtotalMinor - input.onboardingFeeMinor;
  const cash = input.amountMinor - input.onboardingFeeMinor;
  if (!Number.isSafeInteger(nominal) || nominal <= 0 || !Number.isSafeInteger(cash) || cash < 0 || !Number.isSafeInteger(input.creditMinor) || input.creditMinor < 0 || cash + input.creditMinor !== nominal) throw new Error("Invalid upgrade funding.");
  const outgoing = input.outgoing;
  const sourceStart = outgoing ? outgoing.periodStartsAt ?? termStart(outgoing.periodEndsAt, outgoing.interval) : input.now;
  const sourceDuration = outgoing ? outgoing.periodEndsAt - sourceStart : 0;
  const unusedDuration = outgoing ? Math.max(0, Math.min(sourceDuration, outgoing.periodEndsAt - input.now)) : 0;
  const remaining = outgoing && sourceDuration > 0 ? Math.round((outgoing.amountMinor ?? termPriceMinor(outgoing.monthlyPriceMinor, outgoing.interval)) * unusedDuration / sourceDuration) : 0;
  const credit = Math.min(input.creditMinor, remaining);
  const funded = cash + credit;
  const fullEnd = termEnd(input.now, input.interval);
  const end = input.now + Math.ceil((fullEnd - input.now) * (funded / nominal));
  return { quotedCreditMinor: input.creditMinor, appliedCreditMinor: credit, consumedCreditMinor: input.creditMinor - credit, fundedSubscriptionMinor: funded, nominalSubscriptionMinor: nominal, periodStart: new Date(input.now).toISOString(), periodEnd: new Date(end).toISOString() };
}
