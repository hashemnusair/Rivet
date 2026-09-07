import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-drawer-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };
const JOD = (amount: number) => ({ amount, currency: "JOD" });

type ReceiptDetail = { receipt: { id: string }; payment: { id: string; status: string; shiftId?: string } };
type Shift = { id: string; status: string; expectedCash?: { amount: number } };
type ShiftTotals = { shift: { id: string }; totals: { cashPayments: { amount: number }; cashRefunds: { amount: number } } };

/**
 * Cash refunds and voids of membership payments follow the same drawer rules
 * as retail: a cash refund needs the paying branch's open drawer so the
 * outflow is part of a shift, and a cash payment can only be voided while
 * the shift that counted it is still open. Card money never touches a drawer.
 */
async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", { publicId: "drawer-org", name: "Drawer Gym", slug: "drawer-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", receiptPrefix: "DRW", nextReceiptNumber: 1001, createdAt: now, updatedAt: now });
    const branchId = await ctx.db.insert("branches", { organizationId, publicId: "drawer-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const managerId = await ctx.db.insert("users", { publicId: "drawer-manager", authSubject: "clerk-drawer-manager", email: "manager@example.test", fullName: "Drawer Manager", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: managerId, role: "manager", branchIds: [branchId], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "member", publicId: "drawer-member", branchId, memberPublicId: "drawer-member", createdAt: now, updatedAt: now, data: { id: "drawer-member", fullName: "Drawer Member", memberNumber: "DRW-1", homeBranchId: "drawer-branch", status: "active", createdAt: new Date(now).toISOString() } });
    for (const [publicId, amount] of [["charge-cash-refund", 10_000], ["charge-cash-void", 8_000], ["charge-card", 20_000]] as const) {
      await ctx.db.insert("domainRecords", { organizationId, entityType: "charge", publicId, branchId, memberPublicId: "drawer-member", createdAt: now, updatedAt: now, data: { id: publicId, memberId: "drawer-member", branchId: "drawer-branch", description: publicId, total: JOD(amount), paidAmount: JOD(0), outstandingAmount: JOD(amount), discount: JOD(0), status: "unpaid", issueDate: new Date(now).toISOString().slice(0, 10), dueDate: new Date(now).toISOString().slice(0, 10), createdAt: new Date(now).toISOString() } });
    }
  });
}

describe("cash drawer integrity for refunds and voids", () => {
  it("refuses a cash refund without an open drawer, records it against the drawer when open, and keeps closed shifts intact", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const manager = t.withIdentity({ subject: "clerk-drawer-manager" });

    const shiftOne = await manager.mutation(api.domain.mutate, operation("shifts.open", { branchId: "drawer-branch", openingFloat: JOD(5_000) })) as Shift;
    const cash = await manager.mutation(api.domain.mutate, operation("payments.create", { memberId: "drawer-member", chargeId: "charge-cash-refund", amount: JOD(10_000), method: "cash", idempotencyKey: "drawer-cash-1" })) as ReceiptDetail;
    const cashToVoid = await manager.mutation(api.domain.mutate, operation("payments.create", { memberId: "drawer-member", chargeId: "charge-cash-void", amount: JOD(8_000), method: "cash", idempotencyKey: "drawer-cash-2" })) as ReceiptDetail;
    const card = await manager.mutation(api.domain.mutate, operation("payments.create", { memberId: "drawer-member", chargeId: "charge-card", amount: JOD(20_000), method: "card", externalReference: "POS-DRW", idempotencyKey: "drawer-card-1" })) as ReceiptDetail;
    expect(cash.payment.shiftId).toBe(shiftOne.id);

    const closedOne = await manager.mutation(api.domain.mutate, operation("shifts.close", { shiftId: shiftOne.id, countedCash: JOD(23_000) })) as Shift;
    expect(closedOne).toMatchObject({ status: "closed", expectedCash: { amount: 23_000 } });

    // The drawer that counted the cash is closed: a void would rewrite it.
    await expectCode(manager.mutation(api.domain.mutate, operation("payments.void", { paymentId: cashToVoid.payment.id, reason: "Keyed on the wrong member", idempotencyKey: "drawer-void-closed" })), "NO_OPEN_SHIFT");
    // A cash refund with no drawer open would be an invisible outflow.
    await expectCode(manager.mutation(api.domain.mutate, operation("payments.refund", { paymentId: cash.payment.id, amount: JOD(4_000), reason: "Member cancelled a session", idempotencyKey: "drawer-refund-no-shift" })), "NO_OPEN_SHIFT");
    // Card money never sat in the drawer, so its refund is recorded regardless.
    const cardRefund = await manager.mutation(api.domain.mutate, operation("payments.refund", { paymentId: card.payment.id, amount: JOD(5_000), reason: "Partial service refund", idempotencyKey: "drawer-card-refund" })) as ReceiptDetail;
    expect(cardRefund.payment.shiftId).toBeUndefined();

    const shiftTwo = await manager.mutation(api.domain.mutate, operation("shifts.open", { branchId: "drawer-branch", openingFloat: JOD(5_000) })) as Shift;
    const refund = await manager.mutation(api.domain.mutate, operation("payments.refund", { paymentId: cash.payment.id, amount: JOD(4_000), reason: "Member cancelled a session", idempotencyKey: "drawer-refund-open" })) as ReceiptDetail;
    expect(refund.payment.shiftId).toBe(shiftTwo.id);
    const replay = await manager.mutation(api.domain.mutate, operation("payments.refund", { paymentId: cash.payment.id, amount: JOD(4_000), reason: "Member cancelled a session", idempotencyKey: "drawer-refund-open" })) as ReceiptDetail;
    expect(replay.receipt.id).toBe(refund.receipt.id);

    const totals = await manager.query(api.domain.query, operation("shifts.current", { branchId: "drawer-branch" })) as ShiftTotals;
    expect(totals.shift.id).toBe(shiftTwo.id);
    expect(totals.totals.cashRefunds.amount).toBe(4_000);
    expect(totals.totals.cashPayments.amount).toBe(0);
    // The earlier cash payment still lives in its own closed shift, untouched.
    await expectCode(manager.mutation(api.domain.mutate, operation("payments.void", { paymentId: cashToVoid.payment.id, reason: "Still the wrong member", idempotencyKey: "drawer-void-other-shift" })), "NO_OPEN_SHIFT");
    const closedTwo = await manager.mutation(api.domain.mutate, operation("shifts.close", { shiftId: shiftTwo.id, countedCash: JOD(1_000) })) as Shift;
    expect(closedTwo.expectedCash?.amount).toBe(1_000);
  });

  it("voids a cash payment while its own shift is open", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const manager = t.withIdentity({ subject: "clerk-drawer-manager" });
    const shift = await manager.mutation(api.domain.mutate, operation("shifts.open", { branchId: "drawer-branch", openingFloat: JOD(0) })) as Shift;
    const cash = await manager.mutation(api.domain.mutate, operation("payments.create", { memberId: "drawer-member", chargeId: "charge-cash-void", amount: JOD(8_000), method: "cash", idempotencyKey: "drawer-cash-void" })) as ReceiptDetail;
    const voided = await manager.mutation(api.domain.mutate, operation("payments.void", { paymentId: cash.payment.id, reason: "Amount keyed twice", idempotencyKey: "drawer-void-open" })) as ReceiptDetail;
    expect(voided.payment.status).toBe("voided");
    const totals = await manager.query(api.domain.query, operation("shifts.current", { branchId: "drawer-branch" })) as ShiftTotals;
    expect(totals.shift.id).toBe(shift.id);
    expect(totals.totals.cashPayments.amount).toBe(0);
  });
});
