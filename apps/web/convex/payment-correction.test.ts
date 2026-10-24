import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { auditGym, NOW, op } from "./subscription-audit.test-support";
import { DAY_MS } from "./subscriptionTerm";
type BillingCheckout = { gym: { id: string; name: string; status: string }; invoice: { id: string; amountMinor?: number; dueAt?: string; paymentClaim?: Record<string, unknown>; supportCaseId?: string } };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => vi.useRealTimers());
it.each(["initial", "renewal", "upgrade"])("%s: corrects only after operator return, with immutable history and clocks", async kind => {
  const gym = await auditGym({ status: kind === "initial" ? "pending_payment" : "active" });
  let invoiceId = "correction-invoice";
  if (kind === "upgrade") {
    const checkout = await gym.owner.mutation(api.domain.mutate, op("billing.plan_change.request", { plan: "Pro" })) as BillingCheckout;
    invoiceId = checkout.invoice!.id;
  } else await gym.invoice(invoiceId, { firstPayment: kind === "initial", dueAt: new Date(NOW - DAY_MS).toISOString() });
  const payment = { invoiceId, method: "cliq", reference: "WRONG-1", payerName: "Owner", paidOn: "2026-10-10" };
  const sent = await gym.owner.mutation(api.domain.mutate, op("billing.payment.submit", payment)) as BillingCheckout;
  const original = sent.invoice!;
  const request = op("billing.payment.correction_request", { invoiceId, reason: "Reference should be CORRECT-2. Please return the details." });
  const requested = await gym.owner.mutation(api.domain.mutate, request) as BillingCheckout;
  expect(requested.invoice!.paymentClaim).toEqual(original.paymentClaim);
  expect(requested.invoice!.dueAt).toEqual(original.dueAt);
  expect(requested.invoice!.amountMinor).toEqual(original.amountMinor);
  expect(requested.invoice!.supportCaseId).toBeTruthy();
  const state = await gym.state();
  expect(state.records.filter(row => row.entityType === "supportMessage")).toHaveLength(1);
  expect(state.audits.filter(row => row.action === "invoice.payment_correction_requested")).toHaveLength(1);
  // Including later retries and rejected edits: no invoice/organization/audit changes.
  vi.setSystemTime(NOW + 1000);
  await gym.owner.mutation(api.domain.mutate, request);
  await gym.owner.mutation(api.domain.mutate, op("billing.payment.submit", payment));
  await expect(gym.owner.mutation(api.domain.mutate, op("billing.payment.submit", { ...payment, reference: "CORRECT-2" }))).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  expect(await gym.state()).toEqual(state);
  await gym.admin.mutation(api.domain.mutate, op("platform.invoice.payment_reject", { invoiceId, reason: "Returned for reference correction" }));
  const corrected = await gym.owner.mutation(api.domain.mutate, op("billing.payment.submit", { ...payment, reference: "CORRECT-2" })) as BillingCheckout;
  expect(corrected.invoice!.paymentClaim).toMatchObject({ reference: "CORRECT-2", status: "submitted", amountMinor: original.amountMinor });
  expect(corrected.invoice!.dueAt).toBe(original.dueAt);
  await gym.admin.mutation(api.domain.mutate, op("platform.invoice.payment", { invoiceId, reference: "CORRECT-2", reason: "Matched corrected transfer" }));
  const final = await gym.state();
  expect(final.records.find(row => row.publicId === invoiceId)!.data).toMatchObject({ status: "paid", paymentClaim: { reference: "CORRECT-2", status: "confirmed" } });
  expect(final.audits.filter(row => row.action === "invoice.payment_submitted")[0]!.after).toMatchObject({ reference: "WRONG-1" });
  const settled = await gym.state();
  await expect(gym.owner.mutation(api.domain.mutate, request)).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  expect(await gym.state()).toEqual(settled);
});
it("denies staff, foreign invoices and empty reasons before any effects", async () => {
  const gym = await auditGym(); await gym.invoice("owned");
  await gym.owner.mutation(api.domain.mutate, op("billing.payment.submit", { invoiceId: "owned", method: "cliq", reference: "WRONG-1", payerName: "Owner", paidOn: "2026-10-10" }));
  const before = await gym.state();
  for (const [actor, input, code] of [
    [gym.t.withIdentity({ subject: "manager" }), { invoiceId: "owned", reason: "Correction" }, "FORBIDDEN"],
    [gym.owner, { invoiceId: "foreign", reason: "Correction" }, "NOT_FOUND"],
    [gym.owner, { invoiceId: "owned", reason: " " }, "VALIDATION_ERROR"],
  ] as const) await expect(actor.mutation(api.domain.mutate, op("billing.payment.correction_request", input))).rejects.toMatchObject({ data: { code } });
  expect(await gym.state()).toEqual(before);
});
