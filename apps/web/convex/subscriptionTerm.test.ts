import { describe, expect, it } from "vitest";
import { addCalendarMonths, daysBetween, DAY_MS, PAYMENT_TERM_DAYS, SUSPENSION_AFTER_DUE_DAYS, termChange, termEnd, termStart } from "./subscriptionTerm";

const NOW = Date.parse("2026-09-04T12:00:00.000Z");
const GROWTH = 149_000;
const PRO = 249_000;
const annual = (monthly: number) => Math.round(monthly * 12 * 0.8);

describe("term dates", () => {
  it("keeps the day of the month and never spills into the next one", () => {
    expect(new Date(addCalendarMonths(Date.parse("2026-01-31T12:00:00.000Z"), 1)).toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(new Date(termEnd(Date.parse("2026-09-04T12:00:00.000Z"), "annual")).toISOString()).toBe("2027-09-04T12:00:00.000Z");
    expect(new Date(termEnd(Date.parse("2026-09-04T12:00:00.000Z"), "monthly")).toISOString()).toBe("2026-10-04T12:00:00.000Z");
  });

  it("reads a term backwards from the day it ends", () => {
    expect(new Date(termStart(Date.parse("2027-09-04T12:00:00.000Z"), "annual")).toISOString()).toBe("2026-09-04T12:00:00.000Z");
    expect(daysBetween(termStart(Date.parse("2027-09-04T12:00:00.000Z"), "annual"), Date.parse("2027-09-04T12:00:00.000Z"))).toBe(365);
  });

  it("states the payment and enforcement windows the agreement promises", () => {
    expect(PAYMENT_TERM_DAYS).toBe(14);
    expect(SUSPENSION_AFTER_DUE_DAYS).toBe(21);
  });
});

describe("a change of plan or cadence mid-term", () => {
  it("bills one interval and no more, however much of the old term is left", () => {
    const change = termChange({
      now: NOW,
      interval: "annual",
      monthlyPriceMinor: PRO,
      outgoing: { periodEndsAt: NOW + 350 * DAY_MS, monthlyPriceMinor: GROWTH, interval: "annual" },
    });
    // The new term ends a year from today, not a year after the old one.
    expect(new Date(change.periodEndsAt).toISOString()).toBe("2027-09-04T12:00:00.000Z");
    expect(change.periodEndsAt).toBeLessThan(NOW + 366 * DAY_MS);
  });

  it("values the unused days at the price the gym actually paid", () => {
    const change = termChange({
      now: NOW,
      interval: "annual",
      monthlyPriceMinor: PRO,
      outgoing: { periodEndsAt: NOW + 183 * DAY_MS, monthlyPriceMinor: GROWTH, interval: "annual" },
    });
    const outgoingTermDays = daysBetween(termStart(NOW + 183 * DAY_MS, "annual"), NOW + 183 * DAY_MS);
    expect(change.creditDays).toBe(183);
    expect(change.creditMinor).toBe(Math.round((annual(GROWTH) * 183) / outgoingTermDays));
    expect(change.subtotalMinor).toBe(annual(PRO));
    expect(change.amountMinor).toBe(annual(PRO) - change.creditMinor);
    // An upgrade is never handed half a year of the dearer plan for free.
    expect(change.creditMinor).toBeLessThan(Math.round(annual(PRO) / 2));
  });

  it("credits sixteen unused monthly days at the monthly rate", () => {
    const change = termChange({
      now: NOW,
      interval: "annual",
      monthlyPriceMinor: GROWTH,
      outgoing: { periodEndsAt: NOW + 16 * DAY_MS, monthlyPriceMinor: GROWTH, interval: "monthly" },
    });
    const monthDays = daysBetween(termStart(NOW + 16 * DAY_MS, "monthly"), NOW + 16 * DAY_MS);
    expect(change.creditDays).toBe(16);
    expect(change.creditMinor).toBe(Math.round((GROWTH * 16) / monthDays));
    expect(change.amountMinor).toBe(annual(GROWTH) - change.creditMinor);
  });

  it("never bills a negative term, however large the credit", () => {
    const change = termChange({
      now: NOW,
      interval: "monthly",
      monthlyPriceMinor: 79_000,
      outgoing: { periodEndsAt: NOW + 300 * DAY_MS, monthlyPriceMinor: PRO, interval: "annual" },
    });
    expect(change.creditMinor).toBe(change.subtotalMinor);
    expect(change.amountMinor).toBe(0);
  });

  it("gives nothing back for a term with no time left, or none at all", () => {
    const elapsed = termChange({ now: NOW, interval: "monthly", monthlyPriceMinor: GROWTH, outgoing: { periodEndsAt: NOW - DAY_MS, monthlyPriceMinor: GROWTH, interval: "monthly" } });
    expect(elapsed).toMatchObject({ creditMinor: 0, creditDays: 0, amountMinor: GROWTH });
    const fresh = termChange({ now: NOW, interval: "monthly", monthlyPriceMinor: GROWTH });
    expect(fresh).toMatchObject({ creditMinor: 0, creditDays: 0, amountMinor: GROWTH, subtotalMinor: GROWTH });
  });
});
