import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { auditGym, maxAddOns, NOW, op } from "./subscription-audit.test-support";
import { DAY_MS, termEnd } from "./subscriptionTerm";
import { termPriceMinor } from "./planCatalogue";
import { fundedSubscriptionValue } from "./subscriptionTerm";
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());
type Invoice = Record<string, unknown> & { id: string; amountMinor: number; creditMinor?: number; periodStart: string; periodEnd: string; upgradeActivation?: { appliedCreditMinor: number; fundedSubscriptionMinor: number } };
const payment = (invoiceId: string) => op("billing.payment.submit", { invoiceId, method: "cliq", reference: "BANK-UPGRADE", payerName: "Owner", paidOn: "2026-10-10" });

describe("delayed owner upgrade funding", () => {
  it.each(["monthly", "annual"] as const)("refreshes elapsed %s quotes before submission, preserving old invoices and retry semantics", async billingInterval => {
    const end = termEnd(NOW, billingInterval);
    const gym = await auditGym({ billingInterval, subscriptionAddOns: maxAddOns, currentPeriodEndsAt: end });
    await gym.invoice("funded", { status: "paid", amountMinor: termPriceMinor(158000, billingInterval), periodEnd: new Date(end).toISOString(), billingInterval });
    const first = (await gym.owner.mutation(api.domain.mutate, op("billing.plan_change.request", { plan: "Pro" })) as { invoice: Invoice }).invoice;
    vi.setSystemTime(end);
    const before = await gym.state();
    await expect(gym.owner.mutation(api.domain.mutate, payment(first.id))).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    expect(await gym.state()).toEqual(before);
    const refreshed = (await gym.owner.mutation(api.domain.mutate, op("billing.plan_change.request", { plan: "Pro" })) as { invoice: Invoice }).invoice;
    expect(refreshed.id).not.toBe(first.id);
    expect(refreshed.amountMinor).toBe(termPriceMinor(199000, billingInterval));
    expect(refreshed.creditMinor).toBeUndefined();
    expect((await gym.state()).records.find(row => row.publicId === first.id)!.data).toMatchObject({ status: "void", amountMinor: first.amountMinor, creditMinor: first.creditMinor });
    expect((await gym.owner.mutation(api.domain.mutate, op("billing.plan_change.request", { plan: "Pro" })) as { invoice: Invoice }).invoice.id).toBe(refreshed.id);
    await gym.owner.mutation(api.domain.mutate, payment(refreshed.id));
    vi.setSystemTime(end + 40 * DAY_MS);
    const paid = await gym.admin.mutation(api.domain.mutate, op("platform.invoice.payment", { invoiceId: refreshed.id, reference: "BANK-UPGRADE", reason: "Verified transfer after review" })) as Invoice;
    expect(Date.parse(paid.periodStart)).toBe(end + 40 * DAY_MS);
    expect(Date.parse(paid.periodEnd)).toBe(termEnd(end + 40 * DAY_MS, billingInterval));
  });

  it.each(["monthly", "annual"] as const)("does not fund a full later %s term with consumed Basic add-on credit", async billingInterval => {
    const end = termEnd(NOW, billingInterval);
    const gym = await auditGym({ billingInterval, subscriptionAddOns: maxAddOns, currentPeriodEndsAt: end });
    await gym.invoice("funded", { status: "paid", amountMinor: termPriceMinor(158000, billingInterval), periodEnd: new Date(end).toISOString(), billingInterval });
    const quote = (await gym.owner.mutation(api.domain.mutate, op("billing.plan_change.request", { plan: "Pro" })) as { invoice: Invoice }).invoice;
    await gym.owner.mutation(api.domain.mutate, payment(quote.id));
    const submitted = await gym.state();
    vi.setSystemTime(end + DAY_MS);
    // Same-detail network retry preserves the original submission even after quote time elapsed.
    await gym.owner.mutation(api.domain.mutate, payment(quote.id));
    expect(await gym.state()).toEqual(submitted);
    const paid = await gym.admin.mutation(api.domain.mutate, op("platform.invoice.payment", { invoiceId: quote.id, reference: "BANK-UPGRADE", reason: "Verified transfer" })) as Invoice;
    expect(paid.amountMinor).toBe(quote.amountMinor);
    expect(paid.creditMinor).toBe(quote.creditMinor);
    expect(paid.upgradeActivation?.appliedCreditMinor).toBe(0);
    expect(paid.upgradeActivation?.fundedSubscriptionMinor).toBe(quote.amountMinor);
    expect(Date.parse(paid.periodStart)).toBe(end + DAY_MS);
    const fullDuration = termEnd(end + DAY_MS, billingInterval) - (end + DAY_MS);
    expect(Date.parse(paid.periodEnd) - Date.parse(paid.periodStart)).toBe(Math.ceil(fullDuration * quote.amountMinor / termPriceMinor(199000, billingInterval)));
    expect(fundedSubscriptionValue(paid)).toBe(quote.amountMinor);
    const beforeRetry = await gym.state();
    await expect(gym.admin.mutation(api.domain.mutate, op("platform.invoice.payment", { invoiceId: quote.id, reference: "BANK-UPGRADE", reason: "Retry" }))).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    expect(await gym.state()).toEqual(beforeRetry);
    expect((await gym.state()).records.find(row => row.publicId === "funded")!.data).toMatchObject({ status: "paid", amountMinor: termPriceMinor(158000, billingInterval) });
  });

  it.each([-1, 0, 1])("settles credit at the outgoing term boundary %+d milliseconds", async offset => {
    const end = termEnd(NOW, "monthly");
    const gym = await auditGym({ currentPeriodEndsAt: end });
    await gym.invoice("funded", { status: "paid" });
    const quote = (await gym.owner.mutation(api.domain.mutate, op("billing.plan_change.request", { plan: "Pro" })) as { invoice: Invoice }).invoice;
    await gym.owner.mutation(api.domain.mutate, payment(quote.id));
    vi.setSystemTime(end + offset);
    const paid = await gym.admin.mutation(api.domain.mutate, op("platform.invoice.payment", { invoiceId: quote.id, reference: "BANK-UPGRADE", reason: "Verified" })) as Invoice;
    expect(paid.upgradeActivation?.appliedCreditMinor).toBe(0);
  });

  it("requires a returned, elapsed quote to be refreshed and fails closed on changed paid-term funding", async () => {
    const gym = await auditGym(); await gym.invoice("funded", { status: "paid" });
    const quote = (await gym.owner.mutation(api.domain.mutate, op("billing.plan_change.request", { plan: "Pro" })) as { invoice: Invoice }).invoice;
    await gym.owner.mutation(api.domain.mutate, payment(quote.id));
    await gym.admin.mutation(api.domain.mutate, op("platform.invoice.payment_reject", { invoiceId: quote.id, reason: "Correct the reference" }));
    vi.setSystemTime(NOW + 3 * DAY_MS);
    await expect(gym.owner.mutation(api.domain.mutate, payment(quote.id))).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    const refreshed = (await gym.owner.mutation(api.domain.mutate, op("billing.plan_change.request", { plan: "Pro" })) as { invoice: Invoice }).invoice;
    await gym.owner.mutation(api.domain.mutate, payment(refreshed.id));
    await gym.t.run(ctx => ctx.db.patch(gym.org, { currentPeriodEndsAt: termEnd(NOW, "annual") }));
    const before = await gym.state();
    await expect(gym.admin.mutation(api.domain.mutate, op("platform.invoice.payment", { invoiceId: refreshed.id, reference: "BANK-UPGRADE", reason: "Verified" }))).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    expect(await gym.state()).toEqual(before);
  });
});
