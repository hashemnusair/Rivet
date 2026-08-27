import { describe, expect, it } from "vitest";
import { projectSubscriptionBilling, subscriptionBillingLines } from "./subscription-billing";

const DAY_MS = 86_400_000;
const NOW = Date.parse("2026-08-27T12:00:00.000Z");

describe("projectSubscriptionBilling", () => {
  it("prices annual as twelve months with the published 20% saving", () => {
    const projection = projectSubscriptionBilling({ currentStatus: "active", plan: "Growth", billingInterval: "annual", priceMinor: 149_000, now: NOW });
    expect(projection.amountMinor).toBe(Math.round(149_000 * 12 * 0.8));
  });

  it("credits the remaining paid days of an active term into the new one", () => {
    const projection = projectSubscriptionBilling({
      currentStatus: "active",
      currentPeriodEndsAt: new Date(NOW + 16 * DAY_MS).toISOString(),
      plan: "Pro",
      billingInterval: "annual",
      priceMinor: 249_000,
      now: NOW,
    });
    expect(projection.creditDays).toBe(16);
    const twelveMonths = new Date(NOW);
    twelveMonths.setUTCMonth(twelveMonths.getUTCMonth() + 12);
    expect(projection.newPeriodEnd.getTime()).toBe(twelveMonths.getTime() + 16 * DAY_MS);
  });

  it("gives no credit for suspended tenants or elapsed boundaries", () => {
    expect(projectSubscriptionBilling({ currentStatus: "suspended", currentPeriodEndsAt: new Date(NOW + 10 * DAY_MS).toISOString(), plan: "Growth", billingInterval: "monthly", priceMinor: 149_000, now: NOW }).creditDays).toBe(0);
    expect(projectSubscriptionBilling({ currentStatus: "active", currentPeriodEndsAt: new Date(NOW - DAY_MS).toISOString(), plan: "Growth", billingInterval: "monthly", priceMinor: 149_000, now: NOW }).creditDays).toBe(0);
  });

  it("keeps the amount unknown while the catalog has not loaded", () => {
    const lines = subscriptionBillingLines({ currentStatus: "active", plan: "Growth", billingInterval: "annual", now: NOW });
    expect(lines[0]).toBe("An annual invoice for the new Growth term is issued today.");
  });
});
