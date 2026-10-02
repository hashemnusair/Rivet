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
/** An invoice is raised this many days before the term it covers begins. */
export const INVOICE_LEAD_DAYS = 3;

/** The outgoing term a change interrupts, when the gym has paid for one. */
export interface OutgoingTerm {
  /** When the paid term was due to end. */
  periodEndsAt: number;
  /** The plan's monthly list price during that term, in minor units. */
  monthlyPriceMinor: number;
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
  const outgoingStart = termStart(outgoing.periodEndsAt, outgoing.interval);
  const termDays = daysBetween(outgoingStart, outgoing.periodEndsAt);
  const creditDays = Math.min(daysBetween(input.now, outgoing.periodEndsAt), termDays);
  const outgoingPrice = termPriceMinor(outgoing.monthlyPriceMinor, outgoing.interval);
  const worth = termDays === 0 ? 0 : Math.round((outgoingPrice * creditDays) / termDays);
  const creditMinor = Math.max(0, Math.min(subtotalMinor, worth));
  return { periodEndsAt, subtotalMinor, creditMinor, creditDays: creditMinor > 0 ? creditDays : 0, amountMinor: subtotalMinor - creditMinor };
}
