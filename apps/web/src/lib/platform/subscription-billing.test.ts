import { describe, expect, it } from "vitest";
import { projectSubscriptionBilling, subscriptionBillingLines } from "./subscription-billing";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-08-27T12:00:00.000Z");

describe("projectSubscriptionBilling", () => {
  it("prices annual as twelve months with the published 20% saving", () => {
    const projection = projectSubscriptionBilling({ currentStatus: "active", plan: "Growth", billingInterval: "annual", priceMinor: 149_000, now: NOW });
    expect(projection.amountMinor).toBe(Math.round(149_000 * 12 * 0.8));
    expect(projection.subtotalMinor).toBe(Math.round(149_000 * 12 * 0.8));
  });

  it("credits the remaining paid days as money and still bills one interval", () => {
    const projection = projectSubscriptionBilling({
      currentStatus: "active",
      currentPeriodEndsAt: new Date(NOW + 16 * DAY_MS).toISOString(),
      currentPlanPriceMinor: 149_000,
      currentBillingInterval: "monthly",
      plan: "Pro",
      billingInterval: "annual",
      priceMinor: 249_000,
      now: NOW,
    });
    expect(projection.creditDays).toBe(16);
    expect(projection.creditMinor).toBeGreaterThan(0);
    expect(projection.creditMinor).toBeLessThan(149_000);
    expect(projection.amountMinor).toBe((projection.subtotalMinor ?? 0) - projection.creditMinor);
    const twelveMonths = new Date(NOW);
    twelveMonths.setUTCMonth(twelveMonths.getUTCMonth() + 12);
    expect(projection.newPeriodEnd.getTime()).toBe(twelveMonths.getTime());
  });

  it("gives no credit for an unpaid, suspended or elapsed term", () => {
    expect(projectSubscriptionBilling({ currentStatus: "suspended", currentPeriodEndsAt: new Date(NOW + 10 * DAY_MS).toISOString(), plan: "Growth", billingInterval: "monthly", priceMinor: 149_000, now: NOW }).creditMinor).toBe(0);
    expect(projectSubscriptionBilling({ currentStatus: "overdue", currentPeriodEndsAt: new Date(NOW + 10 * DAY_MS).toISOString(), plan: "Growth", billingInterval: "monthly", priceMinor: 149_000, now: NOW }).creditMinor).toBe(0);
    expect(projectSubscriptionBilling({ currentStatus: "active", currentPeriodEndsAt: new Date(NOW - DAY_MS).toISOString(), plan: "Growth", billingInterval: "monthly", priceMinor: 149_000, now: NOW }).creditDays).toBe(0);
  });

  it("keeps the amount unknown while the catalog has not loaded", () => {
    const lines = subscriptionBillingLines({ currentStatus: "active", plan: "Growth", billingInterval: "annual", now: NOW });
    expect(lines[0]).toBe("An annual invoice for the new Growth term is issued today.");
  });

  it("says in money what the change costs and what the credit takes off", () => {
    const lines = subscriptionBillingLines({
      currentStatus: "active",
      currentPeriodEndsAt: new Date(NOW + 15 * DAY_MS).toISOString(),
      currentPlanPriceMinor: 149_000,
      currentBillingInterval: "monthly",
      plan: "Pro",
      billingInterval: "monthly",
      priceMinor: 249_000,
      now: NOW,
    });
    expect(lines[0]).toBe("An invoice for JOD 249.000 (Pro · monthly) is issued today.");
    expect(lines[1]).toMatch(/^15 unused paid days of the current term are credited: JOD \d+\.\d{3} off, leaving JOD \d+\.\d{3} to pay\.$/);
    expect(lines[2]).toBe("The new term runs until 27 Sep 2026.");
  });
});
