import { beforeEach, describe, expect, it } from "vitest";
import { ERR } from "@/lib/api/errors";
import { MockGymOSApi } from "./MockGymOSApi";

let api: MockGymOSApi;
const JOD = (amount: number) => ({ amount, currency: "JOD" });

/** The demo branch already has an open drawer; close it so each test controls the float. */
async function resetDrawer(branchId: string) {
  const current = await api.getCurrentCashShift(branchId);
  if (current) await api.closeCashShift(current.id, { countedCash: JOD(0), varianceExplanation: "Reset for the payables test" });
}

beforeEach(async () => {
  api = new MockGymOSApi();
  api.setBehavior({ latencyMs: 0 });
  await api.switchDemoRole("owner");
});

describe("mock supplier payables parity", () => {
  it("projects the seeded received order as one aged payable with readable totals", async () => {
    const page = await api.listPayables();
    expect(page.items).toHaveLength(1);
    const payable = page.items[0]!;
    expect(payable).toMatchObject({ sourceType: "purchase_order", supplierName: "Jordan Sports Supply", status: "unpaid", original: JOD(1_650_000), paid: JOD(0), remaining: JOD(1_650_000), externalReference: "JSS-INV-2026-0147" });
    expect(payable.ageDays).toBeGreaterThanOrEqual(19);
    expect(payable.dueDate).toBeUndefined();
    expect(page.totals).toMatchObject({ outstanding: JOD(1_650_000), openCount: 1 });
    expect(page.supplierTotals).toEqual([expect.objectContaining({ supplierName: "Jordan Sports Supply", outstanding: JOD(1_650_000), openCount: 1 })]);
    expect(page.aging.find((bucket) => bucket.bucket === "0-30")).toMatchObject({ outstanding: JOD(1_650_000), count: 1 });
    expect((await api.listPayables({ search: "inv-2026" })).matchedCount).toBe(1);
    expect((await api.listPayables({ search: "unknown supplier" })).matchedCount).toBe(0);
  });

  it("settles a payable with cash then a referenced transfer, keeps the drawer truthful, and replays idempotently", async () => {
    const payable = (await api.listPayables()).items[0]!;
    const branchId = payable.branchId;
    await resetDrawer(branchId);
    await expect(api.recordSupplierPayment({ supplierId: payable.supplierId, branchId, method: "cash", amount: JOD(650_000), allocations: [{ payableId: payable.id, amount: JOD(650_000) }], idempotencyKey: "mock-cash-no-shift" })).rejects.toMatchObject({ code: ERR.NO_OPEN_SHIFT });
    const shift = await api.openCashShift({ branchId, openingFloat: JOD(100_000) });

    const cash = await api.recordSupplierPayment({ supplierId: payable.supplierId, branchId, method: "cash", amount: JOD(650_000), allocations: [{ payableId: payable.id, amount: JOD(650_000) }], expectedShiftId: shift.id, idempotencyKey: "mock-cash-650" });
    expect(cash).toMatchObject({ status: "recorded", method: "cash", shiftId: shift.id, ledgerPostingStatus: "not_posted", supplierRemaining: JOD(1_000_000) });
    expect(cash.payables[0]).toMatchObject({ payableId: payable.id, remaining: JOD(1_000_000), status: "partially_paid" });
    const replay = await api.recordSupplierPayment({ supplierId: payable.supplierId, branchId, method: "cash", amount: JOD(650_000), allocations: [{ payableId: payable.id, amount: JOD(650_000) }], expectedShiftId: shift.id, idempotencyKey: "mock-cash-650" });
    expect(replay.id).toBe(cash.id);
    await expect(api.recordSupplierPayment({ supplierId: payable.supplierId, branchId, method: "cash", amount: JOD(600_000), allocations: [{ payableId: payable.id, amount: JOD(600_000) }], idempotencyKey: "mock-cash-650" })).rejects.toMatchObject({ code: ERR.CONFLICT });

    const totals = await api.getCurrentShiftTotals(branchId);
    expect(totals?.totals.supplierCashPayments).toEqual(JOD(650_000));
    expect(totals?.totals.supplierCashReversals).toEqual(JOD(0));

    await expect(api.recordSupplierPayment({ supplierId: payable.supplierId, branchId, method: "bank_transfer", amount: JOD(1_000_000), allocations: [{ payableId: payable.id, amount: JOD(1_000_000) }], idempotencyKey: "mock-transfer-no-ref" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    const transfer = await api.recordSupplierPayment({ supplierId: payable.supplierId, branchId, method: "bank_transfer", amount: JOD(1_000_000), reference: "TRF-2026-0091", allocations: [{ payableId: payable.id, amount: JOD(1_000_000) }], idempotencyKey: "mock-transfer-1000" });
    expect(transfer).toMatchObject({ status: "recorded", method: "bank_transfer", supplierRemaining: JOD(0) });
    expect(transfer.shiftId).toBeUndefined();

    expect((await api.listPayables()).items).toHaveLength(0);
    expect((await api.listPayables({ status: "all" })).items[0]).toMatchObject({ status: "paid", remaining: JOD(0) });
    await expect(api.recordSupplierPayment({ supplierId: payable.supplierId, branchId, method: "cliq", amount: JOD(1_000), reference: "CLIQ-1", allocations: [{ payableId: payable.id, amount: JOD(1_000) }], idempotencyKey: "mock-after-paid" })).rejects.toMatchObject({ code: ERR.CONFLICT });

    const history = await api.listSupplierPayments({ supplierId: payable.supplierId });
    expect(history.totalItems).toBe(2);
    expect(history.items.map((item) => item.method)).toEqual(["bank_transfer", "cash"]);
    expect((await api.listSupplierPayments({ payableId: payable.id })).totalItems).toBe(2);

    const refreshed = await api.refreshAccountingSourceQueue({ sourceTypes: ["supplier_payment"] });
    expect(refreshed.items.find((item) => item.sourceId === cash.id)).toMatchObject({ status: "pending", policyCode: "supplier-payment-cash.v1" });
    expect(refreshed.items.find((item) => item.sourceId === transfer.id)).toMatchObject({ status: "pending", policyCode: "supplier-payment-bank-transfer.v1" });
    const posted = await api.postAccountingSource({ sourceType: "supplier_payment", sourceId: cash.id, idempotencyKey: "mock-post-cash" });
    expect(posted.status).toBe("posted");
    const journal = await api.getAccountingJournalEntry(posted.journalEntryId!);
    expect(journal.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: "2100", debit: JOD(650_000) }), expect.objectContaining({ accountCode: "1100", credit: JOD(650_000) })]));
    expect((await api.getSupplierPayment(cash.id)).ledgerPostingStatus).toBe("posted");
  });

  it("refuses overpayment, cross-supplier allocations, mismatched totals, and stale shifts", async () => {
    const payable = (await api.listPayables()).items[0]!;
    const branchId = payable.branchId;
    await resetDrawer(branchId);
    await api.openCashShift({ branchId, openingFloat: JOD(0) });
    const other = await api.upsertSupplier({ name: "Amman Nutrition", branchIds: [branchId] });
    await expect(api.recordSupplierPayment({ supplierId: payable.supplierId, branchId, method: "cash", amount: JOD(1_700_000), allocations: [{ payableId: payable.id, amount: JOD(1_700_000) }], idempotencyKey: "mock-overpay" })).rejects.toMatchObject({ code: ERR.CONFLICT });
    await expect(api.recordSupplierPayment({ supplierId: other.id, branchId, method: "cash", amount: JOD(100_000), allocations: [{ payableId: payable.id, amount: JOD(100_000) }], idempotencyKey: "mock-cross" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    await expect(api.recordSupplierPayment({ supplierId: payable.supplierId, branchId, method: "cash", amount: JOD(100_000), allocations: [{ payableId: payable.id, amount: JOD(90_000) }], idempotencyKey: "mock-mismatch" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    await expect(api.recordSupplierPayment({ supplierId: payable.supplierId, branchId, method: "cash", amount: JOD(100_000), allocations: [{ payableId: payable.id, amount: JOD(100_000) }], expectedShiftId: "yesterday", idempotencyKey: "mock-stale" })).rejects.toMatchObject({ code: ERR.CONFLICT });
    await expect(api.recordSupplierPayment({ supplierId: payable.supplierId, branchId, method: "cash", amount: { amount: 100_000, currency: "USD" }, allocations: [{ payableId: payable.id, amount: { amount: 100_000, currency: "USD" } }], idempotencyKey: "mock-usd" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    expect((await api.listSupplierPayments()).totalItems).toBe(0);
  });

  it("reverses a cash payment once with a reason, reopens the payable, and returns the cash to the open drawer", async () => {
    const payable = (await api.listPayables()).items[0]!;
    const branchId = payable.branchId;
    await resetDrawer(branchId);
    const shift = await api.openCashShift({ branchId, openingFloat: JOD(500_000) });
    const cash = await api.recordSupplierPayment({ supplierId: payable.supplierId, branchId, method: "cash", amount: JOD(650_000), allocations: [{ payableId: payable.id, amount: JOD(650_000) }], idempotencyKey: "mock-cash" });
    await expect(api.reverseSupplierPayment({ paymentId: cash.id, reason: " ", idempotencyKey: "mock-reverse-blank" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    const reversed = await api.reverseSupplierPayment({ paymentId: cash.id, reason: "Paid the same invoice twice", idempotencyKey: "mock-reverse" });
    expect(reversed).toMatchObject({ status: "reversed", reversal: { reason: "Paid the same invoice twice", shiftId: shift.id, ledgerPostingStatus: "not_posted" }, supplierRemaining: JOD(1_650_000) });
    expect((await api.reverseSupplierPayment({ paymentId: cash.id, reason: "Paid the same invoice twice", idempotencyKey: "mock-reverse" })).status).toBe("reversed");
    await expect(api.reverseSupplierPayment({ paymentId: cash.id, reason: "Again", idempotencyKey: "mock-reverse-2" })).rejects.toMatchObject({ code: ERR.CONFLICT });
    expect((await api.listPayables()).items[0]).toMatchObject({ status: "unpaid", remaining: JOD(1_650_000) });
    const totals = await api.getCurrentShiftTotals(branchId);
    expect(totals?.totals.supplierCashPayments).toEqual(JOD(650_000));
    expect(totals?.totals.supplierCashReversals).toEqual(JOD(650_000));
    const closed = await api.closeCashShift(shift.id, { countedCash: JOD(500_000) });
    expect(closed.expectedCash).toEqual(JOD(500_000));
    const refreshed = await api.refreshAccountingSourceQueue({ sourceTypes: ["supplier_payment", "supplier_payment_reversal"] });
    expect(refreshed.items.find((item) => item.sourceType === "supplier_payment" && item.sourceId === cash.id)).toMatchObject({ status: "excluded" });
    expect(refreshed.items.find((item) => item.sourceType === "supplier_payment_reversal" && item.sourceId === cash.id)).toMatchObject({ status: "excluded" });
    const audits = (await api.listAuditEvents({ pageSize: 50 })).items.filter((event) => event.action.startsWith("operations.supplier_payment."));
    expect(audits.map((event) => event.action)).toEqual(expect.arrayContaining(["operations.supplier_payment.record", "operations.supplier_payment.reverse"]));
  });

  it("keeps reads capability-gated, hides other branches, and lists non-supplier balances for reconciliation", async () => {
    await api.switchDemoRole("salesperson");
    await expect(api.listPayables()).rejects.toMatchObject({ code: ERR.FORBIDDEN });
    await expect(api.recordSupplierPayment({ supplierId: "x", branchId: "y", method: "cash", amount: JOD(1), allocations: [{ payableId: "z", amount: JOD(1) }], idempotencyKey: "mock-sales" })).rejects.toMatchObject({ code: ERR.FORBIDDEN });
    await api.switchDemoRole("owner");
    const reconciliation = await api.listPayablesReconciliation();
    expect(reconciliation.items.find((item) => item.sourceType === "equipment_acquisition")).toMatchObject({ amount: JOD(2_900_000), vendorHint: "Life Fitness" });
    expect(reconciliation.items.find((item) => item.sourceType === "stock_receive")).toMatchObject({ amount: JOD(26_000) });
    expect(reconciliation.items.every((item) => item.reason.length > 10)).toBe(true);
    const exported = await api.exportPayables({ status: "all" });
    expect(exported.rows[0]).toMatchObject({ supplierName: "Jordan Sports Supply", status: "unpaid", externalReference: "JSS-INV-2026-0147" });
    expect(exported.truncated).toBe(false);
  });
});
