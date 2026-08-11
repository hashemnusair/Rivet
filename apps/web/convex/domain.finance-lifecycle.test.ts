import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-finance-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

type ReceiptDetail = { receipt: { id: string; receiptNumber: string }; payment: { id: string; status: string }; charge?: { paidAmount: { amount: number }; outstandingAmount: { amount: number }; status: string } };
type Shift = { id: string; variance?: { amount: number }; varianceApprovalStatus: string };

describe("Convex finance and reconciliation lifecycle", () => {
  it("keeps cash, card and CliQ records authoritative across partial payments, refunds, voids and signed variances", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", { publicId: "finance-org", name: "Finance Gym", slug: "finance-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", receiptPrefix: "FIN", nextReceiptNumber: 1001, createdAt: now, updatedAt: now });
      const branchId = await ctx.db.insert("branches", { organizationId, publicId: "finance-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
      const receptionistId = await ctx.db.insert("users", { publicId: "finance-reception", authSubject: "clerk-finance-reception", email: "reception@example.test", fullName: "Finance Reception", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      const managerId = await ctx.db.insert("users", { publicId: "finance-manager", authSubject: "clerk-finance-manager", email: "manager@example.test", fullName: "Finance Manager", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId, userId: receptionistId, role: "receptionist", branchIds: [branchId], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId, userId: managerId, role: "manager", branchIds: [branchId], branchScope: "all", active: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("domainRecords", { organizationId, entityType: "member", publicId: "finance-member", branchId, memberPublicId: "finance-member", createdAt: now, updatedAt: now, data: { id: "finance-member", fullName: "Finance Member", email: "member@example.test", memberNumber: "MAIN-FIN-1", homeBranchId: "finance-branch", status: "active", createdAt: new Date(now).toISOString() } });
      for (const [publicId, amount] of [["charge-cash", 10_000], ["charge-card", 20_000], ["charge-cliq", 15_000]] as const) {
        await ctx.db.insert("domainRecords", { organizationId, entityType: "charge", publicId, branchId, memberPublicId: "finance-member", createdAt: now, updatedAt: now, data: { id: publicId, memberId: "finance-member", branchId: "finance-branch", description: publicId, total: { amount, currency: "JOD" }, paidAmount: { amount: 0, currency: "JOD" }, outstandingAmount: { amount, currency: "JOD" }, discount: { amount: 0, currency: "JOD" }, status: "unpaid", createdAt: new Date(now).toISOString() } });
      }
    });

    const reception = t.withIdentity({ subject: "clerk-finance-reception" });
    const manager = t.withIdentity({ subject: "clerk-finance-manager" });
    const shiftOne = await reception.mutation(api.domain.mutate, operation("shifts.open", { branchId: "finance-branch", openingFloat: { amount: 5_000, currency: "JOD" } })) as Shift;

    const cash = await reception.mutation(api.domain.mutate, operation("payments.create", { memberId: "finance-member", chargeId: "charge-cash", amount: { amount: 10_000, currency: "JOD" }, method: "cash", idempotencyKey: "finance-cash-1" })) as ReceiptDetail;
    await expectCode(reception.mutation(api.domain.mutate, operation("payments.create", { memberId: "finance-member", chargeId: "charge-card", amount: { amount: 5_000, currency: "JOD" }, method: "card", idempotencyKey: "finance-card-missing-ref" })), "VALIDATION_ERROR");
    const cardPartial = await reception.mutation(api.domain.mutate, operation("payments.create", { memberId: "finance-member", chargeId: "charge-card", amount: { amount: 5_000, currency: "JOD" }, method: "card", externalReference: "POS-100", idempotencyKey: "finance-card-1" })) as ReceiptDetail;
    expect(cardPartial.charge).toMatchObject({ paidAmount: { amount: 5_000 }, outstandingAmount: { amount: 15_000 }, status: "partial" });
    const cardReplay = await reception.mutation(api.domain.mutate, operation("payments.create", { memberId: "finance-member", chargeId: "charge-card", amount: { amount: 5_000, currency: "JOD" }, method: "card", externalReference: "POS-100", idempotencyKey: "finance-card-1" })) as ReceiptDetail;
    expect(cardReplay.receipt.id).toBe(cardPartial.receipt.id);
    const cardPaid = await reception.mutation(api.domain.mutate, operation("payments.create", { memberId: "finance-member", chargeId: "charge-card", amount: { amount: 15_000, currency: "JOD" }, method: "card", externalReference: "POS-101", idempotencyKey: "finance-card-2" })) as ReceiptDetail;
    expect(cardPaid.charge).toMatchObject({ paidAmount: { amount: 20_000 }, outstandingAmount: { amount: 0 }, status: "paid" });
    await expectCode(reception.mutation(api.domain.mutate, operation("payments.create", { memberId: "finance-member", chargeId: "charge-card", amount: { amount: 1, currency: "JOD" }, method: "card", externalReference: "POS-OVER", idempotencyKey: "finance-card-over" })), "VALIDATION_ERROR");

    const cliq = await reception.mutation(api.domain.mutate, operation("payments.create", { memberId: "finance-member", chargeId: "charge-cliq", amount: { amount: 15_000, currency: "JOD" }, method: "cliq", externalReference: "CLIQ-200", idempotencyKey: "finance-cliq-1" })) as ReceiptDetail;
    const voided = await manager.mutation(api.domain.mutate, operation("payments.void", { paymentId: cliq.payment.id, reason: "Duplicate CliQ transfer verified against the bank reference" })) as ReceiptDetail;
    expect(voided.payment.status).toBe("voided");
    expect(voided.charge).toMatchObject({ paidAmount: { amount: 0 }, outstandingAmount: { amount: 15_000 }, status: "unpaid" });
    await expectCode(manager.mutation(api.domain.mutate, operation("payments.void", { paymentId: cliq.payment.id, reason: "Duplicate request" })), "PAYMENT_ALREADY_VOIDED");

    const cardRefund = await manager.mutation(api.domain.mutate, operation("payments.refund", { paymentId: cardPaid.payment.id, amount: { amount: 4_000, currency: "JOD" }, reason: "Approved partial service refund" })) as ReceiptDetail;
    expect(cardRefund.payment).toMatchObject({ status: "completed" });
    await expectCode(manager.mutation(api.domain.mutate, operation("payments.refund", { paymentId: cardPaid.payment.id, amount: { amount: 12_000, currency: "JOD" }, reason: "Exceeds remaining payment amount" })), "REFUND_EXCEEDS_AMOUNT");

    const closedPositive = await reception.mutation(api.domain.mutate, operation("shifts.close", { shiftId: shiftOne.id, countedCash: { amount: 17_000, currency: "JOD" }, varianceExplanation: "Two dinars found above the expected drawer total" })) as Shift;
    expect(closedPositive).toMatchObject({ variance: { amount: 2_000 }, varianceApprovalStatus: "pending" });
    await expectCode(manager.mutation(api.domain.mutate, operation("shifts.review", { shiftId: shiftOne.id, decision: "approved" })), "VALIDATION_ERROR");
    const approved = await manager.mutation(api.domain.mutate, operation("shifts.review", { shiftId: shiftOne.id, decision: "approved", note: "Count sheet and drawer recount both confirm the positive variance" })) as Shift;
    expect(approved.varianceApprovalStatus).toBe("approved");

    const shiftTwo = await reception.mutation(api.domain.mutate, operation("shifts.open", { branchId: "finance-branch", openingFloat: { amount: 5_000, currency: "JOD" } })) as Shift;
    await manager.mutation(api.domain.mutate, operation("payments.refund", { paymentId: cash.payment.id, amount: { amount: 4_000, currency: "JOD" }, reason: "Approved cash service refund" }));
    const closedNegative = await reception.mutation(api.domain.mutate, operation("shifts.close", { shiftId: shiftTwo.id, countedCash: { amount: 0, currency: "JOD" }, varianceExplanation: "Drawer is one dinar below the expected balance after cash refund" })) as Shift;
    expect(closedNegative).toMatchObject({ variance: { amount: -1_000 }, varianceApprovalStatus: "pending" });
    const rejected = await manager.mutation(api.domain.mutate, operation("shifts.review", { shiftId: shiftTwo.id, decision: "rejected", note: "Recount did not support the submitted drawer explanation" })) as Shift;
    expect(rejected.varianceApprovalStatus).toBe("rejected");

    const persisted = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "finance-org")).unique();
      if (!organization) throw new Error("Finance test organization is missing");
      return {
        payments: (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "payment")).collect()).map((row) => row.data as { id: string }),
        receipts: (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "receipt")).collect()).map((row) => row.publicId),
        audits: await ctx.db.query("auditEvents").withIndex("by_organization_occurred", (q) => q.eq("organizationId", organization._id)).collect(),
      };
    });
    expect(new Set(persisted.receipts).size).toBe(persisted.receipts.length);
    expect(persisted.payments).toHaveLength(6);
    expect(persisted.audits.map((event) => event.action)).toEqual(expect.arrayContaining(["payment.collect", "payment.refund", "payment.void", "shift.close_variance", "shift.variance.approved", "shift.variance.rejected"]));
    expect(persisted.audits.filter((event) => event.action.startsWith("shift.variance.")).every((event) => Boolean(event.reason && event.before && event.after))).toBe(true);
  });
});
