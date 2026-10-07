import { describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
let correlation = 0;
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-money-race-${++correlation}` });
const JOD = (amount: number) => ({ amount, currency: "JOD" });

type ReceiptDetail = { receipt: { id: string }; payment: { id: string; status: string } };
type Fixture = { t: TestConvex<typeof schema>; owner: ReturnType<TestConvex<typeof schema>["withIdentity"]> };

async function seed(timezone = "UTC", issueDate = new Date().toISOString().slice(0, 10)): Promise<Fixture> {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", {
      publicId: "money-race-org",
      name: "Money Race Gym",
      slug: "money-race-gym",
      status: "active",
      timezone,
      currency: "JOD",
      receiptPrefix: "RACE",
      nextReceiptNumber: 1001,
      createdAt: now,
      updatedAt: now,
    });
    const branchId = await ctx.db.insert("branches", { organizationId, publicId: "money-race-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const ownerId = await ctx.db.insert("users", { publicId: "money-race-owner", authSubject: "clerk-money-race-owner", email: "owner@money-race.example", fullName: "Money Race Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerId, role: "owner", branchIds: [branchId], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "member", publicId: "money-race-member", branchId, memberPublicId: "money-race-member", createdAt: now, updatedAt: now, data: { id: "money-race-member", fullName: "Race Member", memberNumber: "MAIN-1", email: "member@money-race.example", homeBranchId: "money-race-branch", status: "active", createdAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "charge", publicId: "money-race-charge", branchId, memberPublicId: "money-race-member", createdAt: now, updatedAt: now, data: { id: "money-race-charge", memberId: "money-race-member", branchId: "money-race-branch", description: "Race invoice", total: JOD(10_000), paidAmount: JOD(0), outstandingAmount: JOD(10_000), discount: JOD(0), status: "unpaid", issueDate, dueDate: issueDate, createdAt: new Date(now).toISOString() } });
  });
  return { t, owner: t.withIdentity({ subject: "clerk-money-race-owner" }) };
}

async function collectFullPayment(owner: Fixture["owner"]): Promise<ReceiptDetail> {
  return await owner.mutation(api.domain.mutate, operation("payments.create", { memberId: "money-race-member", chargeId: "money-race-charge", amount: JOD(10_000), method: "card", externalReference: "POS-RACE-1", idempotencyKey: "race-payment-full" })) as ReceiptDetail;
}

async function snapshot(t: Fixture["t"]) {
  return await t.run(async (ctx) => {
    const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "money-race-org")).unique();
    if (!organization) throw new Error("Money race fixture organization is missing");
    const records = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id)).collect();
    const charge = records.find((record) => record.entityType === "charge" && record.publicId === "money-race-charge");
    if (!charge) throw new Error("Money race fixture charge is missing");
    return {
      charge: charge.data as { paidAmount: { amount: number }; outstandingAmount: { amount: number }; status: string },
      payments: records.filter((record) => record.entityType === "payment").map((record) => record.data as { id: string; type: string; amount: { amount: number }; status: string; originalPaymentId?: string }),
      receipts: records.filter((record) => record.entityType === "receipt"),
      shifts: records.filter((record) => record.entityType === "shift").map((record) => record.data as { id: string; status: string }),
      audits: await ctx.db.query("auditEvents").withIndex("by_organization_occurred", (q) => q.eq("organizationId", organization._id)).collect(),
      idempotency: (await ctx.db.query("idempotencyRecords").collect()).filter((record) => record.organizationId === organization._id),
    };
  });
}

describe("money mutation concurrency", () => {
  it("applies two concurrent retries with the same collection key exactly once", async () => {
    const { t, owner } = await seed();
    const request = operation("payments.create", { memberId: "money-race-member", chargeId: "money-race-charge", amount: JOD(6_000), method: "card", externalReference: "POS-RETRY-1", idempotencyKey: "race-payment-retry" });
    const [first, second] = await Promise.all([
      owner.mutation(api.domain.mutate, request),
      owner.mutation(api.domain.mutate, request),
    ]) as [ReceiptDetail, ReceiptDetail];

    expect(first.receipt.id).toBe(second.receipt.id);
    const state = await snapshot(t);
    expect(state.charge).toMatchObject({ paidAmount: JOD(6_000), outstandingAmount: JOD(4_000), status: "partial" });
    expect(state.payments.filter((payment) => payment.type === "payment")).toHaveLength(1);
    expect(state.receipts).toHaveLength(1);
    expect(state.audits.filter((event) => event.action === "payment.collect")).toHaveLength(1);
    expect(state.idempotency.filter((record) => record.operation === "payment.create")).toHaveLength(1);
    const today = new Date().toISOString().slice(0, 10);
    const reconciliation = await owner.query(api.domain.query, operation("reconciliation.daily", { branchId: "money-race-branch", date: today })) as { totalCollected: { amount: number }; totalsByMethod: Array<{ method: string; payments: { amount: number }; count: number }> };
    expect(reconciliation.totalCollected).toEqual(JOD(6_000));
    expect(reconciliation.totalsByMethod).toEqual(expect.arrayContaining([expect.objectContaining({ method: "card", payments: JOD(6_000), count: 1 })]));
  });

  it("rejects a concurrent collection that would overpay one invoice", async () => {
    const { t, owner } = await seed();
    const outcomes = await Promise.allSettled([
      owner.mutation(api.domain.mutate, operation("payments.create", { memberId: "money-race-member", chargeId: "money-race-charge", amount: JOD(7_000), method: "card", externalReference: "POS-RACE-A", idempotencyKey: "race-payment-a" })),
      owner.mutation(api.domain.mutate, operation("payments.create", { memberId: "money-race-member", chargeId: "money-race-charge", amount: JOD(7_000), method: "card", externalReference: "POS-RACE-B", idempotencyKey: "race-payment-b" })),
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) });
    const state = await snapshot(t);
    expect(state.charge).toMatchObject({ paidAmount: JOD(7_000), outstandingAmount: JOD(3_000), status: "partial" });
    expect(state.payments.filter((payment) => payment.type === "payment")).toHaveLength(1);
    expect(state.receipts).toHaveLength(1);
    expect(state.audits.filter((event) => event.action === "payment.collect")).toHaveLength(1);
  });

  it("keeps concurrent partial refunds within the original payment amount", async () => {
    const { t, owner } = await seed();
    const paid = await collectFullPayment(owner);
    const outcomes = await Promise.allSettled([
      owner.mutation(api.domain.mutate, operation("payments.refund", { paymentId: paid.payment.id, amount: JOD(7_000), reason: "First concurrent refund request", idempotencyKey: "race-refund-a" })),
      owner.mutation(api.domain.mutate, operation("payments.refund", { paymentId: paid.payment.id, amount: JOD(7_000), reason: "Second concurrent refund request", idempotencyKey: "race-refund-b" })),
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((result): result is PromiseRejectedResult => result.status === "rejected");
    expect(rejected?.reason).toMatchObject({ data: expect.objectContaining({ code: "REFUND_EXCEEDS_AMOUNT" }) });
    const state = await snapshot(t);
    const original = state.payments.find((payment) => payment.type === "payment");
    const refunds = state.payments.filter((payment) => payment.type === "refund");
    expect(original?.status).toBe("partially_refunded");
    expect(refunds.reduce((sum, payment) => sum + Math.abs(payment.amount.amount), 0)).toBe(7_000);
    expect(refunds).toHaveLength(1);
    expect(state.charge).toMatchObject({ paidAmount: JOD(3_000), outstandingAmount: JOD(7_000), status: "partial" });
    expect(state.audits.filter((event) => event.action === "payment.refund")).toHaveLength(1);
  });

  it("serializes a refund against a void so only one reversal is recorded", async () => {
    const { t, owner } = await seed();
    const paid = await collectFullPayment(owner);
    const outcomes = await Promise.allSettled([
      owner.mutation(api.domain.mutate, operation("payments.refund", { paymentId: paid.payment.id, amount: JOD(4_000), reason: "Concurrent refund request", idempotencyKey: "race-reversal-refund" })),
      owner.mutation(api.domain.mutate, operation("payments.void", { paymentId: paid.payment.id, reason: "Concurrent void request", idempotencyKey: "race-reversal-void" })),
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    const state = await snapshot(t);
    const original = state.payments.find((payment) => payment.type === "payment");
    const refunds = state.payments.filter((payment) => payment.type === "refund");
    if (original?.status === "voided") {
      expect(refunds).toHaveLength(0);
      expect(state.charge).toMatchObject({ paidAmount: JOD(0), outstandingAmount: JOD(10_000), status: "unpaid" });
      expect(state.audits.filter((event) => event.action === "payment.void")).toHaveLength(1);
      expect(state.audits.filter((event) => event.action === "payment.refund")).toHaveLength(0);
    } else {
      expect(original?.status).toBe("partially_refunded");
      expect(refunds).toHaveLength(1);
      expect(state.charge).toMatchObject({ paidAmount: JOD(6_000), outstandingAmount: JOD(4_000), status: "partial" });
      expect(state.audits.filter((event) => event.action === "payment.refund")).toHaveLength(1);
      expect(state.audits.filter((event) => event.action === "payment.void")).toHaveLength(0);
    }
  });

  it("keeps one open cash drawer per branch when two operators open it together", async () => {
    const { t, owner } = await seed();
    const outcomes = await Promise.allSettled([
      owner.mutation(api.domain.mutate, operation("shifts.open", { branchId: "money-race-branch", openingFloat: JOD(2_000) })),
      owner.mutation(api.domain.mutate, operation("shifts.open", { branchId: "money-race-branch", openingFloat: JOD(2_000) })),
    ]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const state = await snapshot(t);
    expect(state.shifts.filter((shift) => shift.status === "open")).toHaveLength(1);
    expect(state.audits.filter((event) => event.action === "shift.open")).toHaveLength(1);
  });

  it("expires void eligibility at the tenant-local business-day boundary", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-07T20:59:00.000Z")); // 23:59 in Asia/Amman.
      const { owner } = await seed("Asia/Amman", "2026-10-07");
      const paid = await collectFullPayment(owner);

      vi.setSystemTime(new Date("2026-10-07T21:01:00.000Z")); // 00:01 on the next Amman business day.
      await expect(owner.mutation(api.domain.mutate, operation("payments.void", { paymentId: paid.payment.id, reason: "Attempted after the business day closed", idempotencyKey: "race-after-day-void" }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "VOID_WINDOW_EXPIRED" }) });
    } finally {
      vi.useRealTimers();
    }
  });
});
