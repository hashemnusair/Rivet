import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { auditGym, NOW, op } from "./subscription-audit.test-support";
import { DAY_MS, PAYMENT_TERM_DAYS, SUSPENSION_AFTER_DUE_DAYS } from "./subscriptionTerm";
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.stubEnv("RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED", "1"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
const payment = (invoiceId: string) => op("billing.payment.submit", { invoiceId, method: "cliq", reference: "BANK-PAID", payerName: "Owner", paidOn: "2026-10-10" });

describe("overdue submitted payment review", () => {
  it.each(["monthly", "annual"] as const)("preserves %s clocks, routes review once, and enforces returned payments without a new grace period", async billingInterval => {
    const gym = await auditGym({ billingInterval, currentPeriodEndsAt: NOW });
    await gym.t.mutation(internal.subscriptionReconciliation.reconcile, { now: NOW });
    const row = (await gym.state()).records.find(row => row.entityType === "platformInvoice")!;
    const due = NOW + PAYMENT_TERM_DAYS * DAY_MS;
    const threshold = due + SUSPENSION_AFTER_DUE_DAYS * DAY_MS;
    await gym.owner.mutation(api.domain.mutate, payment(row.publicId));
    const sentState = await gym.state();
    vi.setSystemTime(threshold);
    await gym.owner.mutation(api.domain.mutate, payment(row.publicId));
    expect(await gym.state()).toEqual(sentState);
    await expect(gym.owner.mutation(api.domain.mutate, { ...payment(row.publicId), input: { ...payment(row.publicId).input, reference: "DIFFERENT" } })).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    for (const now of [threshold - 1, threshold, threshold + DAY_MS, threshold + 2 * DAY_MS]) {
      const preview = await gym.t.query(internal.subscriptionReconciliation.preview, { now });
      expect(preview.organizationsToSuspend).toBe(0);
      expect(preview.paymentReviewsRequired).toBe(now < threshold ? 0 : 1);
      expect((await gym.t.mutation(internal.subscriptionReconciliation.reconcile, { now })).suspended).toBe(0);
    }
    const reviewed = await gym.state();
    const invoice = reviewed.records.find(item => item._id === row._id)!.data;
    expect(invoice).toMatchObject({ status: "past_due", dueAt: new Date(due).toISOString(), paymentClaim: { submittedAt: new Date(NOW).toISOString() } });
    expect(reviewed.organizations[0]!.status).toBe("past_due");
    expect(reviewed.audits.filter(event => event.action === "subscription.payment_review_required")).toHaveLength(1);
    expect(reviewed.notifications.filter(event => event.dedupeKey.startsWith("subscription-payment-review:"))).toHaveLength(1);
    expect(reviewed.records.filter(item => item.entityType === "supportCase")).toHaveLength(1);
    await gym.admin.mutation(api.domain.mutate, op("platform.invoice.payment_reject", { invoiceId: row.publicId, reason: "Transfer was not received" }));
    // A corrected submission still has the same due/enforcement clock.
    await gym.owner.mutation(api.domain.mutate, payment(row.publicId));
    expect((await gym.t.mutation(internal.subscriptionReconciliation.reconcile, { now: threshold + 3 * DAY_MS })).suspended).toBe(0);
    await gym.admin.mutation(api.domain.mutate, op("platform.invoice.payment_reject", { invoiceId: row.publicId, reason: "Still no transfer" }));
    expect((await gym.t.query(internal.subscriptionReconciliation.preview, { now: threshold })).organizationsToSuspend).toBe(1);
    expect((await gym.t.mutation(internal.subscriptionReconciliation.reconcile, { now: threshold })).suspended).toBe(1);
    expect((await gym.state()).records.find(item => item._id === row._id)!.data.dueAt).toBe(invoice.dueAt);
  });
  it("keeps ordinary unpaid enforcement at the exact deadline", async () => {
    const gym = await auditGym({ currentPeriodEndsAt: NOW });
    await gym.t.mutation(internal.subscriptionReconciliation.reconcile, { now: NOW });
    const threshold = NOW + (PAYMENT_TERM_DAYS + SUSPENSION_AFTER_DUE_DAYS) * DAY_MS;
    expect((await gym.t.mutation(internal.subscriptionReconciliation.reconcile, { now: threshold - 1 })).suspended).toBe(0);
    expect((await gym.t.mutation(internal.subscriptionReconciliation.reconcile, { now: threshold })).suspended).toBe(1);
  });
});
