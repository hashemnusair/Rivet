import { expect, it } from "vitest";
import { DAY_MS, termEnd, upgradeActivation } from "./subscriptionTerm";
it.each([ ["2026-01-31T12:00:00Z", "monthly"], ["2024-02-29T12:00:00Z", "annual"] ] as const)("values partial old service using stored %s/%s dates, preserving cash and excluding setup", (start, interval) => {
  const sourceStart = Date.parse(start), end = termEnd(sourceStart, interval), now = sourceStart + 10 * DAY_MS;
  const result = upgradeActivation({ now, interval, amountMinor: 225000, onboardingFeeMinor: 75000, subtotalMinor: 274000, creditMinor: 49000, outgoing: { periodStartsAt: sourceStart, periodEndsAt: end, monthlyPriceMinor: 49000, amountMinor: 49000, interval } });
  expect(result.appliedCreditMinor).toBe(Math.round(49000 * (end - now) / (end - sourceStart)));
  expect(result.fundedSubscriptionMinor).toBe(150000 + result.appliedCreditMinor);
  expect(Date.parse(result.periodStart)).toBe(now);
  expect(Date.parse(result.periodEnd) - now).toBe(Math.ceil((termEnd(now, interval) - now) * result.fundedSubscriptionMinor / 199000));
});
