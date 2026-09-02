import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-payables-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };
const JOD = (amount: number) => ({ amount, currency: "JOD" });

type PayablesPage = { items: Array<{ id: string; status: string; original: { amount: number }; paid: { amount: number }; remaining: { amount: number }; ageDays: number; supplierName: string; dueDate?: string }>; matchedCount: number; nextCursor?: string; totals: { outstanding: { amount: number }; openCount: number }; supplierTotals: Array<{ supplierName: string; outstanding: { amount: number } }>; aging: Array<{ bucket: string; outstanding: { amount: number }; count: number }> };
type PaymentDetail = { id: string; status: string; method: string; amount: { amount: number }; shiftId?: string; allocations: Array<{ payableId: string; amount: { amount: number } }>; supplierRemaining: { amount: number }; ledgerPostingStatus: string; reversal?: { reason: string; shiftId?: string; ledgerPostingStatus: string }; payables: Array<{ payableId: string; remaining: { amount: number }; status: string }> };

async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "payables-org-a", name: "Payables A", slug: "payables-a", status: "active", subscriptionPlan: "Pro", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: organization, publicId: "payables-branch-a", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: organization, publicId: "payables-branch-b", name: "Second", code: "SECOND", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "payables-owner", authSubject: "clerk-payables-owner", email: "owner@payables.example", fullName: "Payables Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const manager = await ctx.db.insert("users", { publicId: "payables-manager", authSubject: "clerk-payables-manager", email: "manager@payables.example", fullName: "Payables Manager", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const sales = await ctx.db.insert("users", { publicId: "payables-sales", authSubject: "clerk-payables-sales", email: "sales@payables.example", fullName: "Payables Sales", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branchA, branchB], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: manager, role: "manager", branchIds: [branchB], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: sales, role: "sales", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });

    const otherOrganization = await ctx.db.insert("organizations", { publicId: "payables-org-b", name: "Payables B", slug: "payables-b", status: "active", subscriptionPlan: "Pro", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const otherBranch = await ctx.db.insert("branches", { organizationId: otherOrganization, publicId: "payables-other-branch", name: "Other", code: "OTHER", active: true, status: "active", createdAt: now, updatedAt: now });
    const otherOwner = await ctx.db.insert("users", { publicId: "payables-other-owner", authSubject: "clerk-payables-other-owner", email: "other@payables.example", fullName: "Other Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: otherOrganization, userId: otherOwner, role: "owner", branchIds: [otherBranch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
  });
  return {
    t,
    owner: t.withIdentity({ subject: "clerk-payables-owner" }),
    manager: t.withIdentity({ subject: "clerk-payables-manager" }),
    sales: t.withIdentity({ subject: "clerk-payables-sales" }),
    otherOwner: t.withIdentity({ subject: "clerk-payables-other-owner" }),
  };
}

/** Seeds JOD 1,650.000 owed to one supplier through a fully received order. */
async function seededPayable(owner: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>, branchId = "payables-branch-a", tag = "a") {
  const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: `PAY-${tag.toUpperCase()}`, name: `Whey protein ${tag}`, unit: "each", reorderPoint: 1 })) as { id: string };
  const supplier = await owner.mutation(api.domain.mutate, operation("operations.supplier.upsert", { name: `Jordan Sports Supply ${tag}`, branchIds: [branchId] })) as { id: string; name: string };
  const order = await owner.mutation(api.domain.mutate, operation("operations.purchase_order.create", { branchId, sourceType: "supplier", supplierId: supplier.id, lines: [{ productId: product.id, quantity: 33, unitCost: JOD(50_000) }], supplierInvoiceReference: `JSS-INV-${tag}` })) as { id: string };
  await owner.mutation(api.domain.mutate, operation("operations.purchase_order.approve", { id: order.id }));
  await owner.mutation(api.domain.mutate, operation("operations.purchase_order.receive", { purchaseOrderId: order.id, idempotencyKey: `receive-${tag}` }));
  return { product, supplier, order, payableId: `purchase_order:${order.id}` };
}

describe("supplier payables and supplier payments", () => {
  it("projects a received order as an aged, unpaid payable and settles it with cash then a bank transfer", async () => {
    const { owner, t } = await seeded();
    const { supplier, order, payableId } = await seededPayable(owner);

    const before = await owner.query(api.domain.query, operation("operations.payables.list")) as PayablesPage;
    expect(before.items).toHaveLength(1);
    expect(before.items[0]).toMatchObject({ id: payableId, status: "unpaid", original: { amount: 1_650_000 }, paid: { amount: 0 }, remaining: { amount: 1_650_000 }, ageDays: 0, supplierName: supplier.name });
    expect(before.items[0]!.dueDate).toBeUndefined();
    expect(before.totals).toMatchObject({ outstanding: { amount: 1_650_000 }, openCount: 1 });
    expect(before.supplierTotals).toEqual([expect.objectContaining({ supplierName: supplier.name, outstanding: { amount: 1_650_000, currency: "JOD" } })]);
    expect(before.aging.find((bucket) => bucket.bucket === "0-30")).toMatchObject({ outstanding: { amount: 1_650_000 }, count: 1 });

    await expectCode(owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: supplier.id, branchId: "payables-branch-a", method: "cash", amount: JOD(650_000), allocations: [{ payableId, amount: JOD(650_000) }], idempotencyKey: "cash-no-shift" })), "NO_OPEN_SHIFT");
    const shift = await owner.mutation(api.domain.mutate, operation("shifts.open", { branchId: "payables-branch-a", openingFloat: JOD(100_000) })) as { id: string };

    const cash = await owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: supplier.id, branchId: "payables-branch-a", method: "cash", amount: JOD(650_000), allocations: [{ payableId, amount: JOD(650_000) }], expectedShiftId: shift.id, idempotencyKey: "cash-650" })) as PaymentDetail;
    expect(cash).toMatchObject({ status: "recorded", method: "cash", amount: { amount: 650_000 }, shiftId: shift.id, ledgerPostingStatus: "not_posted", supplierRemaining: { amount: 1_000_000 } });
    expect(cash.allocations).toEqual([{ payableId, sourceType: "purchase_order", sourceLabel: expect.stringContaining("Purchase order"), amount: JOD(650_000) }]);
    expect(cash.payables[0]).toMatchObject({ payableId, remaining: { amount: 1_000_000 }, status: "partially_paid" });

    const replay = await owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: supplier.id, branchId: "payables-branch-a", method: "cash", amount: JOD(650_000), allocations: [{ payableId, amount: JOD(650_000) }], expectedShiftId: shift.id, idempotencyKey: "cash-650" })) as PaymentDetail;
    expect(replay.id).toBe(cash.id);
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: supplier.id, branchId: "payables-branch-a", method: "cash", amount: JOD(600_000), allocations: [{ payableId, amount: JOD(600_000) }], idempotencyKey: "cash-650" })), "CONFLICT");

    const current = await owner.query(api.domain.query, operation("shifts.current", { branchId: "payables-branch-a" })) as { totals: { supplierCashPayments: { amount: number }; supplierCashReversals: { amount: number } } };
    expect(current.totals.supplierCashPayments).toEqual(JOD(650_000));
    expect(current.totals.supplierCashReversals).toEqual(JOD(0));

    const partial = await owner.query(api.domain.query, operation("operations.payables.list")) as PayablesPage;
    expect(partial.items[0]).toMatchObject({ status: "partially_paid", paid: { amount: 650_000 }, remaining: { amount: 1_000_000 } });

    await expectCode(owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: supplier.id, branchId: "payables-branch-a", method: "bank_transfer", amount: JOD(1_000_000), allocations: [{ payableId, amount: JOD(1_000_000) }], idempotencyKey: "transfer-no-ref" })), "VALIDATION_ERROR");
    const transfer = await owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: supplier.id, branchId: "payables-branch-a", method: "bank_transfer", amount: JOD(1_000_000), reference: "TRF-2026-0091", allocations: [{ payableId, amount: JOD(1_000_000) }], idempotencyKey: "transfer-1000" })) as PaymentDetail;
    expect(transfer).toMatchObject({ status: "recorded", method: "bank_transfer", supplierRemaining: { amount: 0 } });
    expect(transfer.shiftId).toBeUndefined();

    const paid = await owner.query(api.domain.query, operation("operations.payables.list", { status: "all" })) as PayablesPage;
    expect(paid.items[0]).toMatchObject({ status: "paid", remaining: { amount: 0 } });
    expect((await owner.query(api.domain.query, operation("operations.payables.list")) as PayablesPage).items).toHaveLength(0);
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: supplier.id, branchId: "payables-branch-a", method: "cliq", amount: JOD(1_000), reference: "CLIQ-1", allocations: [{ payableId, amount: JOD(1_000) }], idempotencyKey: "cliq-after-paid" })), "CONFLICT");

    const history = await owner.query(api.domain.query, operation("operations.supplier_payments.list", { supplierId: supplier.id })) as { items: Array<{ id: string; method: string }>; totalItems: number };
    expect(history.totalItems).toBe(2);
    expect(history.items.map((item) => item.method)).toEqual(["bank_transfer", "cash"]);
    const byPayable = await owner.query(api.domain.query, operation("operations.supplier_payments.list", { payableId })) as { totalItems: number };
    expect(byPayable.totalItems).toBe(2);

    const audits = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((event) => event.action === "operations.supplier_payment.record"));
    expect(audits).toHaveLength(2);
    expect(audits[0]?.after).toMatchObject({ allocations: [{ payableId, amountMinor: 650_000 }] });

    const refreshed = await owner.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["supplier_payment"] })) as { items: Array<{ sourceId: string; status: string; policyCode?: string }> };
    expect(refreshed.items.find((item) => item.sourceId === cash.id)).toMatchObject({ status: "pending", policyCode: "supplier-payment-cash.v1" });
    expect(refreshed.items.find((item) => item.sourceId === transfer.id)).toMatchObject({ status: "pending", policyCode: "supplier-payment-bank-transfer.v1" });
    const posted = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "supplier_payment", sourceId: cash.id, idempotencyKey: "post-cash-650" })) as { status: string };
    expect(posted.status).toBe("posted");
    const detail = await owner.query(api.domain.query, operation("operations.supplier_payment.get", { paymentId: cash.id })) as PaymentDetail;
    expect(detail.ledgerPostingStatus).toBe("posted");
    expect(order.id).toBeTruthy();
  });

  it("refuses overpayment, cross-supplier allocation, mismatched totals, and stale shifts before writing", async () => {
    const { owner, t } = await seeded();
    const first = await seededPayable(owner, "payables-branch-a", "a");
    const second = await seededPayable(owner, "payables-branch-a", "b");
    const shift = await owner.mutation(api.domain.mutate, operation("shifts.open", { branchId: "payables-branch-a", openingFloat: JOD(0) })) as { id: string };

    await expectCode(owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: first.supplier.id, branchId: "payables-branch-a", method: "cash", amount: JOD(1_700_000), allocations: [{ payableId: first.payableId, amount: JOD(1_700_000) }], idempotencyKey: "overpay" })), "CONFLICT");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: first.supplier.id, branchId: "payables-branch-a", method: "cash", amount: JOD(100_000), allocations: [{ payableId: second.payableId, amount: JOD(100_000) }], idempotencyKey: "cross-supplier" })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: first.supplier.id, branchId: "payables-branch-a", method: "cash", amount: JOD(100_000), allocations: [{ payableId: first.payableId, amount: JOD(90_000) }], idempotencyKey: "mismatch" })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: first.supplier.id, branchId: "payables-branch-a", method: "cash", amount: JOD(100_000), allocations: [{ payableId: first.payableId, amount: JOD(50_000) }, { payableId: first.payableId, amount: JOD(50_000) }], idempotencyKey: "duplicate-payable" })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: first.supplier.id, branchId: "payables-branch-a", method: "cash", amount: { amount: 100_000, currency: "USD" }, allocations: [{ payableId: first.payableId, amount: { amount: 100_000, currency: "USD" } }], idempotencyKey: "usd" })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: first.supplier.id, branchId: "payables-branch-a", method: "cash", amount: JOD(100_000), allocations: [{ payableId: first.payableId, amount: JOD(100_000) }], expectedShiftId: "shift-from-yesterday", idempotencyKey: "stale-shift" })), "CONFLICT");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: first.supplier.id, branchId: "payables-branch-a", method: "cash", amount: JOD(0), allocations: [{ payableId: first.payableId, amount: JOD(0) }], idempotencyKey: "zero" })), "VALIDATION_ERROR");

    const payments = await t.run(async (ctx) => await ctx.db.query("supplierPayments").collect());
    expect(payments).toHaveLength(0);

    // One payment settles several payables of the same supplier; the
    // second supplier's balance is untouched.
    const third = await owner.mutation(api.domain.mutate, operation("operations.purchase_order.create", { branchId: "payables-branch-a", sourceType: "supplier", supplierId: first.supplier.id, lines: [{ productId: first.product.id, quantity: 2, unitCost: JOD(100_000) }] })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("operations.purchase_order.approve", { id: third.id }));
    await owner.mutation(api.domain.mutate, operation("operations.purchase_order.receive", { purchaseOrderId: third.id, idempotencyKey: "receive-third" }));
    const combined = await owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: first.supplier.id, branchId: "payables-branch-a", method: "cash", amount: JOD(1_750_000), allocations: [{ payableId: first.payableId, amount: JOD(1_650_000) }, { payableId: `purchase_order:${third.id}`, amount: JOD(100_000) }], expectedShiftId: shift.id, idempotencyKey: "combined" })) as PaymentDetail;
    expect(combined.supplierRemaining).toEqual(JOD(100_000));
    const list = await owner.query(api.domain.query, operation("operations.payables.list", { status: "all", supplierId: first.supplier.id })) as PayablesPage;
    expect(list.items.map((item) => [item.id, item.status])).toEqual(expect.arrayContaining([[first.payableId, "paid"], [`purchase_order:${third.id}`, "partially_paid"]]));
    expect((await owner.query(api.domain.query, operation("operations.payables.list", { supplierId: second.supplier.id })) as PayablesPage).totals.outstanding).toEqual(JOD(1_650_000));
  });

  it("reverses a payment once with a reason, reopens the payable, restores the drawer, and gates the ledger reversal", async () => {
    const { owner, t } = await seeded();
    const { supplier, payableId } = await seededPayable(owner);
    const shift = await owner.mutation(api.domain.mutate, operation("shifts.open", { branchId: "payables-branch-a", openingFloat: JOD(500_000) })) as { id: string };
    const cash = await owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: supplier.id, branchId: "payables-branch-a", method: "cash", amount: JOD(650_000), allocations: [{ payableId, amount: JOD(650_000) }], idempotencyKey: "cash-650" })) as PaymentDetail;

    await expectCode(owner.mutation(api.domain.mutate, operation("operations.supplier_payment.reverse", { paymentId: cash.id, reason: "", idempotencyKey: "reverse-no-reason" })), "VALIDATION_ERROR");
    const reversed = await owner.mutation(api.domain.mutate, operation("operations.supplier_payment.reverse", { paymentId: cash.id, reason: "Paid the same invoice twice", idempotencyKey: "reverse-1" })) as PaymentDetail;
    expect(reversed).toMatchObject({ status: "reversed", reversal: { reason: "Paid the same invoice twice", shiftId: shift.id, ledgerPostingStatus: "not_posted" }, supplierRemaining: { amount: 1_650_000 } });
    expect(reversed.allocations).toEqual([{ payableId, sourceType: "purchase_order", sourceLabel: expect.any(String), amount: JOD(650_000) }]);
    const replay = await owner.mutation(api.domain.mutate, operation("operations.supplier_payment.reverse", { paymentId: cash.id, reason: "Paid the same invoice twice", idempotencyKey: "reverse-1" })) as PaymentDetail;
    expect(replay.status).toBe("reversed");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.supplier_payment.reverse", { paymentId: cash.id, reason: "Trying again", idempotencyKey: "reverse-2" })), "CONFLICT");

    const reopened = await owner.query(api.domain.query, operation("operations.payables.list")) as PayablesPage;
    expect(reopened.items[0]).toMatchObject({ id: payableId, status: "unpaid", paid: { amount: 0 }, remaining: { amount: 1_650_000 } });
    const current = await owner.query(api.domain.query, operation("shifts.current", { branchId: "payables-branch-a" })) as { totals: { supplierCashPayments: { amount: number }; supplierCashReversals: { amount: number } } };
    expect(current.totals.supplierCashPayments).toEqual(JOD(650_000));
    expect(current.totals.supplierCashReversals).toEqual(JOD(650_000));
    const closed = await owner.mutation(api.domain.mutate, operation("shifts.close", { shiftId: shift.id, countedCash: JOD(500_000) })) as { expectedCash: { amount: number }; variance: { amount: number } };
    expect(closed.expectedCash).toEqual(JOD(500_000));
    expect(closed.variance.amount).toBe(0);

    const stored = await t.run(async (ctx) => (await ctx.db.query("supplierPayments").collect())[0]);
    expect(stored).toMatchObject({ status: "reversed", amountMinor: 650_000, reversalReason: "Paid the same invoice twice", reversalShiftPublicId: shift.id });
    const audits = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((event) => event.action === "operations.supplier_payment.reverse"));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.reason).toBe("Paid the same invoice twice");

    const refreshed = await owner.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["supplier_payment", "supplier_payment_reversal"] })) as { items: Array<{ sourceType: string; sourceId: string; status: string }> };
    expect(refreshed.items.find((item) => item.sourceType === "supplier_payment" && item.sourceId === cash.id)).toMatchObject({ status: "excluded" });
    expect(refreshed.items.find((item) => item.sourceType === "supplier_payment_reversal" && item.sourceId === cash.id)).toMatchObject({ status: "excluded" });
  });

  it("blocks a cash reversal without an open shift and reports the day's supplier cash in reconciliation", async () => {
    const { owner } = await seeded();
    const { supplier, payableId } = await seededPayable(owner);
    const shift = await owner.mutation(api.domain.mutate, operation("shifts.open", { branchId: "payables-branch-a", openingFloat: JOD(1_000_000) })) as { id: string };
    const cash = await owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { supplierId: supplier.id, branchId: "payables-branch-a", method: "cash", amount: JOD(650_000), allocations: [{ payableId, amount: JOD(650_000) }], idempotencyKey: "cash-650" })) as PaymentDetail;
    const closed = await owner.mutation(api.domain.mutate, operation("shifts.close", { shiftId: shift.id, countedCash: JOD(350_000) })) as { expectedCash: { amount: number } };
    expect(closed.expectedCash).toEqual(JOD(350_000));
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.supplier_payment.reverse", { paymentId: cash.id, reason: "Wrong supplier", idempotencyKey: "reverse-closed" })), "NO_OPEN_SHIFT");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const reconciliation = await owner.query(api.domain.query, operation("reconciliation.daily", { branchId: "payables-branch-a", date: today })) as { supplierPayments: { cashPaid: { amount: number }; cashReturned: { amount: number }; totalPaid: { amount: number }; count: number } };
    expect(reconciliation.supplierPayments).toMatchObject({ cashPaid: { amount: 650_000 }, cashReturned: { amount: 0 }, totalPaid: { amount: 650_000 }, count: 1 });
  });

  it("enforces capabilities, branch scope, and tenant isolation on every payables operation", async () => {
    const { owner, manager, sales, otherOwner } = await seeded();
    const { supplier, payableId } = await seededPayable(owner);
    const cash = { supplierId: supplier.id, branchId: "payables-branch-a", method: "bank_transfer", amount: JOD(100_000), reference: "TRF-1", allocations: [{ payableId, amount: JOD(100_000) }], idempotencyKey: "scoped" };

    await expectCode(sales.mutation(api.domain.mutate, operation("operations.supplier_payment.record", cash)), "FORBIDDEN");
    await expectCode(sales.query(api.domain.query, operation("operations.payables.list")), "FORBIDDEN");

    // The manager is scoped to the second branch: the first branch's payable
    // is invisible and cannot be paid from a branch they cannot access.
    expect((await manager.query(api.domain.query, operation("operations.payables.list")) as PayablesPage).items).toHaveLength(0);
    await expectCode(manager.mutation(api.domain.mutate, operation("operations.supplier_payment.record", cash)), "FORBIDDEN");
    await expectCode(manager.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { ...cash, branchId: "payables-branch-b" })), "NOT_FOUND");

    const recorded = await owner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", cash)) as PaymentDetail;
    await expectCode(manager.query(api.domain.query, operation("operations.supplier_payment.get", { paymentId: recorded.id })), "NOT_FOUND");
    await expectCode(manager.mutation(api.domain.mutate, operation("operations.supplier_payment.reverse", { paymentId: recorded.id, reason: "Not mine", idempotencyKey: "manager-reverse" })), "FORBIDDEN");
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.supplier_payment.reverse", { paymentId: recorded.id, reason: "Not mine", idempotencyKey: "sales-reverse" })), "FORBIDDEN");

    await expectCode(otherOwner.query(api.domain.query, operation("operations.supplier_payment.get", { paymentId: recorded.id })), "NOT_FOUND");
    await expectCode(otherOwner.mutation(api.domain.mutate, operation("operations.supplier_payment.reverse", { paymentId: recorded.id, reason: "Cross tenant", idempotencyKey: "cross-tenant" })), "NOT_FOUND");
    await expectCode(otherOwner.mutation(api.domain.mutate, operation("operations.supplier_payment.record", { ...cash, idempotencyKey: "cross-tenant-record" })), "NOT_FOUND");
    expect((await otherOwner.query(api.domain.query, operation("operations.payables.list")) as PayablesPage).items).toHaveLength(0);
    expect((await otherOwner.query(api.domain.query, operation("operations.supplier_payments.list")) as { totalItems: number }).totalItems).toBe(0);
  });

  it("keeps private and non-supplier 2100 balances as reconciliation items, exports readable rows, and pages the list", async () => {
    const { owner } = await seeded();
    const { supplier, product } = await seededPayable(owner);
    const privateOrder = await owner.mutation(api.domain.mutate, operation("operations.purchase_order.create", { branchId: "payables-branch-a", sourceType: "private", lines: [{ productId: product.id, quantity: 4, unitCost: JOD(25_000) }] })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("operations.purchase_order.approve", { id: privateOrder.id }));
    await owner.mutation(api.domain.mutate, operation("operations.purchase_order.receive", { purchaseOrderId: privateOrder.id, idempotencyKey: "receive-private" }));
    await owner.mutation(api.domain.mutate, operation("operations.equipment_asset.upsert", { branchId: "payables-branch-a", code: "TREAD-01", name: "Treadmill", purchaseDate: "2026-08-01", purchaseCost: JOD(2_900_000) }));

    const reconciliation = await owner.query(api.domain.query, operation("operations.payables.reconciliation")) as { count: number; total: { amount: number }; items: Array<{ sourceType: string; sourceId: string; amount: { amount: number }; reason: string; vendorHint?: string }> };
    expect(reconciliation.count).toBe(2);
    expect(reconciliation.total).toEqual(JOD(3_000_000));
    expect(reconciliation.items.find((item) => item.sourceType === "purchase_order")).toMatchObject({ sourceId: privateOrder.id, amount: { amount: 100_000 }, reason: expect.stringMatching(/private purchase/i) });
    expect(reconciliation.items.find((item) => item.sourceType === "equipment_acquisition")).toMatchObject({ amount: { amount: 2_900_000 }, reason: expect.stringMatching(/not a supplier account/i) });
    const payables = await owner.query(api.domain.query, operation("operations.payables.list")) as PayablesPage;
    expect(payables.items).toHaveLength(1);
    expect(payables.items[0]!.supplierName).toBe(supplier.name);

    const exported = await owner.query(api.domain.query, operation("operations.payables.export", { status: "all" })) as { rows: Array<Record<string, unknown>>; truncated: boolean; currency: string };
    expect(exported).toMatchObject({ truncated: false, currency: "JOD" });
    expect(exported.rows).toHaveLength(1);
    expect(exported.rows[0]).toMatchObject({ supplierName: supplier.name, branchName: "Main", status: "unpaid", original: JOD(1_650_000), remaining: JOD(1_650_000), externalReference: "JSS-INV-a", ledgerPostingStatus: "not_posted" });
    expect(JSON.stringify(exported.rows[0])).not.toMatch(/"_id"|allocations/);

    const searched = await owner.query(api.domain.query, operation("operations.payables.list", { search: "jss-inv-a" })) as PayablesPage;
    expect(searched.matchedCount).toBe(1);
    expect((await owner.query(api.domain.query, operation("operations.payables.list", { search: "nothing-here" })) as PayablesPage).matchedCount).toBe(0);
    const paged = await owner.query(api.domain.query, operation("operations.payables.list", { pageSize: 1 })) as PayablesPage;
    expect(paged.items).toHaveLength(1);
    expect(paged.nextCursor).toBeUndefined();
    await expectCode(owner.query(api.domain.query, operation("operations.payables.list", { cursor: "-1" })), "VALIDATION_ERROR");
    await expectCode(owner.query(api.domain.query, operation("operations.payables.list", { status: "everything" })), "VALIDATION_ERROR");
  });
});
