import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }

const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `todo-006-${name}-${crypto.randomUUID()}`, ...extra });
const money = (amount: number) => ({ amount, currency: "JOD" });
const expectCode = async (request: Promise<unknown>, code: string) => {
  await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
};

async function seed(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const organization = async (publicId: string, name: string) => await ctx.db.insert("organizations", {
      publicId, name, slug: publicId, status: "active", timezone: "UTC", currency: "JOD", receiptPrefix: publicId === "org-a" ? "A" : "B", nextReceiptNumber: 1001, createdAt: now, updatedAt: now,
    });
    const orgA = await organization("org-a", "Authorization Gym A");
    const orgB = await organization("org-b", "Authorization Gym B");
    const branch = async (organizationId: typeof orgA, publicId: string, code: string) => await ctx.db.insert("branches", { organizationId, publicId, name: publicId, code, active: true, status: "active", createdAt: now, updatedAt: now });
    const a1 = await branch(orgA, "branch-a1", "A1");
    const a2 = await branch(orgA, "branch-a2", "A2");
    const b1 = await branch(orgB, "branch-b1", "B1");
    const user = async (publicId: string, subject: string, organizationId: typeof orgA, role: "owner" | "manager" | "sales" | "receptionist", branchIds: typeof a1[], branchScope: "all" | "selected") => {
      const userId = await ctx.db.insert("users", { publicId, authSubject: subject, email: `${publicId}@example.test`, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId, userId, role, branchIds, branchScope, active: true, createdAt: now, updatedAt: now });
      return userId;
    };
    const ownerA = await user("owner-a", "clerk-owner-a", orgA, "owner", [a1, a2], "all");
    const managerA1 = await user("manager-a1", "clerk-manager-a1", orgA, "manager", [a1], "selected");
    const salesA1 = await user("sales-a1", "clerk-sales-a1", orgA, "sales", [a1], "selected");
    const salesA2 = await user("sales-a2", "clerk-sales-a2", orgA, "sales", [a2], "selected");
    const receptionA1 = await user("reception-a1", "clerk-reception-a1", orgA, "receptionist", [a1], "selected");
    const ownerB = await user("owner-b", "clerk-owner-b", orgB, "owner", [b1], "all");
    const insert = async (organizationId: typeof orgA, entityType: string, publicId: string, data: Record<string, unknown>, branchId?: typeof a1) => await ctx.db.insert("domainRecords", {
      organizationId, entityType, publicId, branchId, memberPublicId: entityType === "member" ? publicId : undefined, createdAt: now, updatedAt: now, data: { id: publicId, ...data },
    });
    await insert(orgA, "member", "member-a1", { memberNumber: "A1-900", fullName: "Member A1", phone: "+962790000901", homeBranchId: "branch-a1", status: "active", createdAt: new Date(now).toISOString() }, a1);
    await insert(orgA, "member", "member-a2", { memberNumber: "A2-901", fullName: "Member A2", phone: "+962790000902", homeBranchId: "branch-a2", status: "active", createdAt: new Date(now).toISOString() }, a2);
    await insert(orgA, "member", "member-a-price", { memberNumber: "A1-902", fullName: "Member A price", phone: "+962790000906", homeBranchId: "branch-a1", status: "active", createdAt: new Date(now).toISOString() }, a1);
    await insert(orgA, "member", "member-a-date", { memberNumber: "A1-903", fullName: "Member A date", phone: "+962790000907", homeBranchId: "branch-a1", status: "active", createdAt: new Date(now).toISOString() }, a1);
    for (const [publicId, memberNumber, fullName, phone] of [
      ["member-a-zero", "A1-904", "Member A zero", "+962790000908"],
      ["member-a-limit", "A1-905", "Member A limit", "+962790000909"],
      ["member-a-over", "A1-906", "Member A over", "+962790000910"],
      ["member-a-reject", "A1-907", "Member A reject", "+962790000915"],
    ] as const) {
      await insert(orgA, "member", publicId, { memberNumber, fullName, phone, homeBranchId: "branch-a1", status: "active", createdAt: new Date(now).toISOString() }, a1);
    }
    await insert(orgA, "member", "member-a2-discount", { memberNumber: "A2-908", fullName: "Member A2 discount", phone: "+962790000916", homeBranchId: "branch-a2", status: "active", createdAt: new Date(now).toISOString() }, a2);
    await insert(orgA, "member", "member-a-inactive", { memberNumber: "A1-909", fullName: "Member A inactive", phone: "+962790000917", homeBranchId: "branch-a1", status: "inactive", createdAt: new Date(now).toISOString() }, a1);
    await insert(orgB, "member", "member-b1", { memberNumber: "B1-900", fullName: "Member B1", phone: "+962790000903", homeBranchId: "branch-b1", status: "active", createdAt: new Date(now).toISOString() }, b1);
    await insert(orgA, "plan", "plan-a", { name: "A plan", code: "A", kind: "time", durationDays: 30, basePrice: money(50_000), branchAccess: "all", status: "active" });
    await insert(orgB, "plan", "plan-b", { name: "B plan", code: "B", kind: "time", durationDays: 30, basePrice: money(50_000), branchAccess: "all", status: "active" }, b1);
    await insert(orgA, "charge", "charge-a-refund", { memberId: "member-a1", total: money(50_000), paidAmount: money(0), outstandingAmount: money(50_000), status: "unpaid" }, a1);
    await insert(orgA, "charge", "charge-a-void", { memberId: "member-a1", total: money(40_000), paidAmount: money(0), outstandingAmount: money(40_000), status: "unpaid" }, a1);
    await insert(orgA, "charge", "charge-a2", { memberId: "member-a2", total: money(25_000), paidAmount: money(0), outstandingAmount: money(25_000), status: "unpaid" }, a2);
    await insert(orgB, "charge", "charge-b", { memberId: "member-b1", total: money(30_000), paidAmount: money(0), outstandingAmount: money(30_000), status: "unpaid" }, b1);
    await insert(orgA, "membership", "membership-a1", { memberId: "member-a1", planId: "plan-a", homeBranchId: "branch-a1", startDate: today, endDate: "2099-01-01", salePrice: money(50_000), discount: money(0), frozenDaysUsed: 0, freezes: [] }, a1);
    await insert(orgA, "membership", "membership-a2", { memberId: "member-a2", planId: "plan-a", homeBranchId: "branch-a2", startDate: today, endDate: "2099-01-01", salePrice: money(50_000), discount: money(0), frozenDaysUsed: 0, freezes: [] }, a2);
    await insert(orgA, "membership", "membership-a-inactive", { memberId: "member-a-inactive", planId: "plan-a", homeBranchId: "branch-a1", startDate: today, endDate: "2099-01-01", salePrice: money(50_000), discount: money(0), status: "inactive", frozenDaysUsed: 0, freezes: [] }, a1);
    await insert(orgB, "membership", "membership-b1", { memberId: "member-b1", planId: "plan-b", homeBranchId: "branch-b1", startDate: today, endDate: "2099-01-01", salePrice: money(50_000), discount: money(0), frozenDaysUsed: 0, freezes: [] }, b1);
    await insert(orgA, "lead", "lead-a1", { branchId: "branch-a1", fullName: "Lead A1", phone: "+962790000904", stage: "new", createdAt: new Date(now).toISOString() }, a1);
    return { orgA, orgB, a1, a2, b1, ownerA, ownerB, managerA1, salesA1, salesA2, receptionA1 };
  });
}

async function factCounts(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => ({
    payments: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "payment")).collect(),
    audits: await ctx.db.query("auditEvents").collect(),
    records: await ctx.db.query("domainRecords").collect(),
    timelines: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "timeline")).collect(),
  }));
}

describe("TODO-006 persisted money and staff handler matrix", () => {
  it("allows a routine collection once, rejects foreign identifiers, and preserves one immutable collection audit", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-sales-a1" });
    const reception = t.withIdentity({ subject: "clerk-reception-a1" });
    const foreign = t.withIdentity({ subject: "clerk-owner-b" });
    const input = { memberId: "member-a1", chargeId: "charge-a-refund", branchId: "branch-a1", amount: money(50_000), method: "card", externalReference: "POS-TODO-006-1", idempotencyKey: "collect-a1" };

    const first = await sales.mutation(api.domain.mutate, operation("payments.create", input)) as { receipt: { id: string }; payment: { id: string } };
    const replay = await sales.mutation(api.domain.mutate, operation("payments.create", input)) as { receipt: { id: string }; payment: { id: string } };
    expect(replay.receipt.id).toBe(first.receipt.id);
    expect(replay.payment.id).toBe(first.payment.id);
    await expectCode(reception.mutation(api.domain.mutate, operation("payments.create", { ...input, memberId: "member-a2", chargeId: "charge-a2", branchId: "branch-a2", idempotencyKey: "cross-branch" })), "NOT_FOUND");
    await expectCode(foreign.mutation(api.domain.mutate, operation("payments.create", { ...input, idempotencyKey: "cross-tenant" })), "NOT_FOUND");

    const facts = await factCounts(t);
    expect(facts.payments.filter((row) => row.publicId === first.payment.id)).toHaveLength(1);
    expect(facts.audits.filter((event) => event.action === "payment.collect" && event.entityPublicId === first.payment.id)).toHaveLength(1);
  });

  it("enforces reasoned, replay-safe refund and same-day void paths with immutable facts", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-sales-a1" });
    const manager = t.withIdentity({ subject: "clerk-manager-a1" });
    const foreign = t.withIdentity({ subject: "clerk-owner-b" });
    const collect = async (chargeId: string, key: string) => await sales.mutation(api.domain.mutate, operation("payments.create", { memberId: "member-a1", chargeId, branchId: "branch-a1", amount: chargeId === "charge-a-void" ? money(40_000) : money(50_000), method: "card", externalReference: `POS-${key}`, idempotencyKey: key })) as { payment: { id: string } };
    const refundable = await collect("charge-a-refund", "for-refund");
    await expectCode(manager.mutation(api.domain.mutate, operation("payments.refund", { paymentId: refundable.payment.id, idempotencyKey: "refund-missing" })), "VALIDATION_ERROR");
    await expectCode(sales.mutation(api.domain.mutate, operation("payments.refund", { paymentId: refundable.payment.id, reason: "No permission", idempotencyKey: "refund-sales" })), "FORBIDDEN");
    await expectCode(foreign.mutation(api.domain.mutate, operation("payments.refund", { paymentId: refundable.payment.id, reason: "Foreign identifier", idempotencyKey: "refund-foreign" })), "NOT_FOUND");
    const refundInput = { paymentId: refundable.payment.id, reason: "Duplicate terminal capture verified.", idempotencyKey: "refund-a1" };
    const refund = await manager.mutation(api.domain.mutate, operation("payments.refund", refundInput)) as { receipt: { id: string }; payment: { id: string } };
    const refundReplay = await manager.mutation(api.domain.mutate, operation("payments.refund", refundInput)) as { receipt: { id: string }; payment: { id: string } };
    expect(refundReplay.receipt.id).toBe(refund.receipt.id);

    const voidable = await collect("charge-a-void", "for-void");
    await expectCode(manager.mutation(api.domain.mutate, operation("payments.void", { paymentId: voidable.payment.id, idempotencyKey: "void-missing" })), "VALIDATION_ERROR");
    const voidInput = { paymentId: voidable.payment.id, reason: "Terminal amount keyed twice.", idempotencyKey: "void-a1" };
    const voided = await manager.mutation(api.domain.mutate, operation("payments.void", voidInput)) as { payment: { status: string } };
    const voidReplay = await manager.mutation(api.domain.mutate, operation("payments.void", voidInput)) as { payment: { status: string } };
    expect(voided.payment.status).toBe("voided");
    expect(voidReplay.payment.status).toBe("voided");

    const facts = await factCounts(t);
    expect(facts.audits.filter((event) => event.action === "payment.refund" && event.entityPublicId === refundable.payment.id)).toHaveLength(1);
    expect(facts.audits.filter((event) => event.action === "payment.void" && event.entityPublicId === voidable.payment.id)).toHaveLength(1);
    expect(facts.payments.filter((row) => row.data && typeof row.data === "object" && (row.data as { originalPaymentId?: string }).originalPaymentId === refundable.payment.id)).toHaveLength(1);
  });

  it("keeps non-zero variance review, check-in override, and operational identifiers branch-scoped", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const manager = t.withIdentity({ subject: "clerk-manager-a1" });
    const reception = t.withIdentity({ subject: "clerk-reception-a1" });
    const foreign = t.withIdentity({ subject: "clerk-owner-b" });
    const shift = await reception.mutation(api.domain.mutate, operation("shifts.open", { branchId: "branch-a1", openingFloat: money(0) })) as { id: string };
    const closed = await reception.mutation(api.domain.mutate, operation("shifts.close", { shiftId: shift.id, countedCash: money(1_000), varianceExplanation: "Recount found a cash overage." })) as { varianceApprovalStatus: string };
    expect(closed.varianceApprovalStatus).toBe("pending");
    await expectCode(reception.mutation(api.domain.mutate, operation("shifts.review", { shiftId: shift.id, decision: "approved", note: "Not permitted" })), "FORBIDDEN");
    await expectCode(manager.mutation(api.domain.mutate, operation("shifts.review", { shiftId: shift.id, decision: "approved" })), "VALIDATION_ERROR");
    await expect(manager.mutation(api.domain.mutate, operation("shifts.review", { shiftId: shift.id, decision: "approved", note: "Recount and close report agree." }))).resolves.toMatchObject({ varianceApprovalStatus: "approved" });
    await expectCode(manager.mutation(api.domain.mutate, operation("checkins.override", { memberId: "member-a1", branchId: "branch-a1" })), "VALIDATION_ERROR");
    await expectCode(reception.mutation(api.domain.mutate, operation("checkins.override", { memberId: "member-a1", branchId: "branch-a1", reason: "Not permitted" })), "FORBIDDEN");
    await expectCode(manager.mutation(api.domain.mutate, operation("checkins.override", { memberId: "member-a2", branchId: "branch-a2", reason: "Foreign branch" })), "FORBIDDEN");
    await expectCode(foreign.mutation(api.domain.mutate, operation("checkins.override", { memberId: "member-a1", branchId: "branch-a1", reason: "Foreign tenant" })), "NOT_FOUND");
    await expect(manager.mutation(api.domain.mutate, operation("checkins.create", { memberId: "member-a1", branchId: "branch-a1" }))).resolves.toMatchObject({ decision: "warning" });
    await expect(manager.mutation(api.domain.mutate, operation("checkins.override", { memberId: "member-a1", branchId: "branch-a1", reason: "Owner approved guest entry." }))).resolves.toMatchObject({ decision: "overridden" });
    await expectCode(manager.query(api.domain.query, operation("members.get", { memberId: "member-a2" })), "NOT_FOUND");
    await expectCode(foreign.query(api.domain.query, operation("leads.get", { leadId: "lead-a1" })), "NOT_FOUND");
    const lead = await manager.mutation(api.domain.mutate, operation("leads.create", { branchId: "branch-a1", fullName: "Routine lead", phone: "+962790000905" })) as { id: string };
    const offer = await manager.mutation(api.domain.mutate, operation("offers.create", { leadId: lead.id, planId: "plan-a", price: money(50_000) })) as { id: string };
    await expect(manager.mutation(api.domain.mutate, operation("tasks.create", { leadId: lead.id, ownerId: "sales-a1", title: "Call tomorrow", dueAt: "2099-01-01T09:00:00.000Z" }))).resolves.toMatchObject({ leadId: lead.id });
    await expectCode(foreign.mutation(api.domain.mutate, operation("offers.deliver", { offerId: offer.id, channel: "manual", reference: "desk log" })), "NOT_FOUND");

    const facts = await factCounts(t);
    expect(facts.audits.some((event) => event.action === "shift.variance.approved" && event.reason === "Recount and close report agree.")).toBe(true);
    expect(facts.audits.some((event) => event.action === "checkin.override" && event.reason === "Owner approved guest entry.")).toBe(true);
  });

  it("enforces branch-transfer source and target scope, inactive rechecks, and one immutable replay", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-a" });
    const manager = t.withIdentity({ subject: "clerk-manager-a1" });
    const sales = t.withIdentity({ subject: "clerk-sales-a1" });
    const reception = t.withIdentity({ subject: "clerk-reception-a1" });
    const foreign = t.withIdentity({ subject: "clerk-owner-b" });

    const transfer = { membershipId: "membership-a1", branchId: "branch-a2", reason: "Member now trains at the second branch.", idempotencyKey: "transfer-membership-a1" };
    await expectCode(sales.mutation(api.domain.mutate, operation("memberships.transfer", transfer)), "FORBIDDEN");
    await expectCode(reception.mutation(api.domain.mutate, operation("memberships.transfer", transfer)), "FORBIDDEN");
    await expectCode(manager.mutation(api.domain.mutate, operation("memberships.transfer", { ...transfer, membershipId: "membership-a2", branchId: "branch-a1" })), "NOT_FOUND");
    await expectCode(manager.mutation(api.domain.mutate, operation("memberships.transfer", transfer)), "FORBIDDEN");
    await expectCode(owner.mutation(api.domain.mutate, operation("memberships.transfer", { ...transfer, reason: "" })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("memberships.transfer", { ...transfer, membershipId: "membership-b1" })), "NOT_FOUND");
    await expectCode(owner.mutation(api.domain.mutate, operation("memberships.transfer", { ...transfer, branchId: "branch-b1" })), "NOT_FOUND");
    await expectCode(foreign.mutation(api.domain.mutate, operation("memberships.transfer", transfer)), "NOT_FOUND");
    await expectCode(owner.mutation(api.domain.mutate, operation("memberships.transfer", { ...transfer, membershipId: "membership-a-inactive" })), "MEMBERSHIP_NOT_ACTIVE");

    const first = await owner.mutation(api.domain.mutate, operation("memberships.transfer", transfer)) as { id: string; homeBranchId: string; adjustments: Array<{ type: string; reason: string; before: Record<string, string>; after: Record<string, string> }> };
    const beforeReplay = await factCounts(t);
    const replay = await owner.mutation(api.domain.mutate, operation("memberships.transfer", transfer)) as { id: string; homeBranchId: string; adjustments: Array<{ type: string; reason: string }> };
    const afterReplay = await factCounts(t);
    expect(first).toMatchObject({ id: "membership-a1", homeBranchId: "branch-a2" });
    expect(replay).toMatchObject({ id: first.id, homeBranchId: "branch-a2" });
    expect(replay.adjustments.filter((adjustment) => adjustment.type === "branch_transfer")).toHaveLength(1);
    const transferTimelineCount = beforeReplay.timelines.filter((row) => {
      const value = row.data as { type?: string; membershipId?: string };
      return value.type === "membership_transferred" && value.membershipId === "membership-a1";
    }).length;
    expect(afterReplay.timelines.filter((row) => {
      const value = row.data as { type?: string; membershipId?: string };
      return value.type === "membership_transferred" && value.membershipId === "membership-a1";
    })).toHaveLength(transferTimelineCount);
    const transferAudits = afterReplay.audits.filter((event) => event.action === "membership.branch_transfer" && event.entityPublicId === "membership-a1");
    expect(transferAudits).toHaveLength(1);
    expect(transferAudits[0]).toMatchObject({ reason: transfer.reason, before: { branchId: "branch-a1" }, after: { branchId: "branch-a2" } });

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.ownerA, { status: "deactivated", updatedAt: Date.now() });
    });
    await expectCode(owner.mutation(api.domain.mutate, operation("memberships.transfer", { ...transfer, membershipId: "membership-a2", branchId: "branch-a1" })), "UNAUTHENTICATED");
  });

  it("covers the discount approval allow paths, evidence, isolation, deactivation, and replay", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const salesA1 = t.withIdentity({ subject: "clerk-sales-a1" });
    const salesA2 = t.withIdentity({ subject: "clerk-sales-a2" });
    const manager = t.withIdentity({ subject: "clerk-manager-a1" });
    const foreign = t.withIdentity({ subject: "clerk-owner-b" });
    const today = new Date().toISOString().slice(0, 10);
    const sale = (actor: typeof salesA1, input: Record<string, unknown>) => actor.mutation(api.domain.mutate, operation("memberships.sale", { planId: "plan-a", startDate: today, ...input }));

    const routine = await sale(salesA1, { memberId: "member-a-zero" }) as { membership: { id: string; discountApprovalStatus: string } };
    expect(routine.membership.discountApprovalStatus).toBe("none");
    let facts = await factCounts(t);
    expect(facts.audits.filter((event) => event.action === "membership.discount" && event.entityPublicId === routine.membership.id)).toHaveLength(0);

    const withinLimit = await sale(salesA1, { memberId: "member-a-limit", discount: money(10_000), discountReason: "Approved member retention offer." }) as { membership: { id: string; discountApprovalStatus: string } };
    expect(withinLimit.membership.discountApprovalStatus).toBe("approved");
    facts = await factCounts(t);
    const withinLimitAudit = facts.audits.find((event) => event.action === "membership.discount" && event.entityPublicId === withinLimit.membership.id);
    expect(withinLimitAudit).toMatchObject({ reason: "Approved member retention offer.", approvalStatus: "approved", before: { price: 50_000, discount: 0, approvalStatus: "none" }, after: { price: 50_000, discount: 10_000, approvalStatus: "approved" } });

    const overLimitInput = { memberId: "member-a-over", discount: money(15_000), discountReason: "Manager-approved recovery offer.", payment: { amount: money(35_000), method: "card", externalReference: "POS-TODO-006-discount" }, idempotencyKey: "discount-sale-replay" };
    const overLimit = await sale(salesA1, overLimitInput) as { membership: { id: string; discountApprovalStatus: string }; charge: { id: string }; payment: { id: string }; receipt: { id: string } };
    const beforeSaleReplay = await factCounts(t);
    const overLimitReplay = await sale(salesA1, overLimitInput) as { membership: { id: string }; charge: { id: string }; payment: { id: string }; receipt: { id: string } };
    const afterSaleReplay = await factCounts(t);
    expect(overLimit.membership.discountApprovalStatus).toBe("pending");
    expect(overLimitReplay).toMatchObject({ membership: { id: overLimit.membership.id }, charge: { id: overLimit.charge.id }, payment: { id: overLimit.payment.id }, receipt: { id: overLimit.receipt.id } });
    for (const entityType of ["membership", "charge", "payment", "receipt", "timeline"] as const) {
      expect(afterSaleReplay.records.filter((row) => row.entityType === entityType).length).toBe(beforeSaleReplay.records.filter((row) => row.entityType === entityType).length);
    }
    expect(afterSaleReplay.audits.filter((event) => event.entityPublicId === overLimit.membership.id)).toHaveLength(beforeSaleReplay.audits.filter((event) => event.entityPublicId === overLimit.membership.id).length);

    const pending = afterSaleReplay.audits.find((event) => event.action === "membership.discount" && event.entityPublicId === overLimit.membership.id && event.approvalStatus === "pending");
    if (!pending) throw new Error("missing pending discount audit");
    await expectCode(manager.mutation(api.domain.mutate, operation("approvals.review", { auditEventId: pending.publicId, decision: "approved" })), "VALIDATION_ERROR");
    await expectCode(salesA1.mutation(api.domain.mutate, operation("approvals.review", { auditEventId: pending.publicId, decision: "approved", note: "Sales cannot approve their own exception." })), "FORBIDDEN");
    await expect(manager.mutation(api.domain.mutate, operation("approvals.review", { auditEventId: pending.publicId, decision: "approved", note: "Manager reviewed the retained-member evidence." }))).resolves.toBeNull();
    const afterApproval = await factCounts(t);
    const approvalReview = afterApproval.records.filter((row) => row.entityType === "approvalReview" && (row.data as { auditEventId?: string }).auditEventId === pending.publicId);
    expect(approvalReview).toHaveLength(1);
    const approvalAudit = afterApproval.audits.find((event) => event.action === "membership.discount.approved" && event.entityPublicId === overLimit.membership.id);
    expect(approvalAudit).toMatchObject({ reason: "Manager reviewed the retained-member evidence.", before: { approvalStatus: "pending" }, after: { approvalStatus: "approved" } });
    await expectCode(manager.mutation(api.domain.mutate, operation("approvals.review", { auditEventId: pending.publicId, decision: "approved", note: "Replay should not append a second approval." })), "VALIDATION_ERROR");
    const afterApprovalReplay = await factCounts(t);
    expect(afterApprovalReplay.records.filter((row) => row.entityType === "approvalReview" && (row.data as { auditEventId?: string }).auditEventId === pending.publicId)).toHaveLength(1);
    expect(afterApprovalReplay.audits.filter((event) => event.action === "membership.discount.approved" && event.entityPublicId === overLimit.membership.id)).toHaveLength(1);

    const rejected = await sale(salesA1, { memberId: "member-a-reject", discount: money(15_000), discountReason: "Exception needs rejection evidence." }) as { membership: { id: string; discountApprovalStatus: string } };
    const rejectedFacts = await factCounts(t);
    const rejectedPending = rejectedFacts.audits.find((event) => event.action === "membership.discount" && event.entityPublicId === rejected.membership.id && event.approvalStatus === "pending");
    if (!rejectedPending) throw new Error("missing rejected discount audit");
    await expect(manager.mutation(api.domain.mutate, operation("approvals.review", { auditEventId: rejectedPending.publicId, decision: "rejected", note: "The exception is outside the approved retention policy." }))).resolves.toBeNull();
    const rejectedReview = await manager.query(api.domain.query, operation("memberships.get", { membershipId: rejected.membership.id })) as { discountApprovalStatus: string };
    expect(rejectedReview.discountApprovalStatus).toBe("rejected");
    const finalFacts = await factCounts(t);
    expect(finalFacts.audits.find((event) => event.action === "membership.discount.rejected" && event.entityPublicId === rejected.membership.id)).toMatchObject({ reason: "The exception is outside the approved retention policy.", before: { approvalStatus: "pending" }, after: { approvalStatus: "rejected" } });

    const crossBranch = await sale(salesA2, { memberId: "member-a2-discount", discount: money(15_000), discountReason: "Branch-local exception for isolation test." }) as { membership: { id: string } };
    const crossBranchFacts = await factCounts(t);
    const crossBranchPending = crossBranchFacts.audits.find((event) => event.action === "membership.discount" && event.entityPublicId === crossBranch.membership.id && event.approvalStatus === "pending");
    if (!crossBranchPending) throw new Error("missing cross-branch pending discount audit");
    await expectCode(manager.mutation(api.domain.mutate, operation("approvals.review", { auditEventId: crossBranchPending.publicId, decision: "approved", note: "Wrong branch actor." })), "NOT_FOUND");
    await expectCode(foreign.mutation(api.domain.mutate, operation("approvals.review", { auditEventId: crossBranchPending.publicId, decision: "approved", note: "Foreign tenant actor." })), "NOT_FOUND");
    await expectCode(salesA1.mutation(api.domain.mutate, operation("approvals.review", { auditEventId: crossBranchPending.publicId, decision: "approved", note: "Forbidden sales actor." })), "FORBIDDEN");

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.managerA1, { status: "deactivated", updatedAt: Date.now() });
    });
    await expectCode(manager.mutation(api.domain.mutate, operation("approvals.review", { auditEventId: crossBranchPending.publicId, decision: "approved", note: "Deactivated actor." })), "UNAUTHENTICATED");
  });

  it("prevents invitation escalation, rechecks deactivation, and keeps concurrent tenant writes separate", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-a" });
    const manager = t.withIdentity({ subject: "clerk-manager-a1" });
    const sales = t.withIdentity({ subject: "clerk-sales-a1" });
    const foreign = t.withIdentity({ subject: "clerk-owner-b" });
    await expectCode(manager.mutation(internal.invitations.prepare, { organizationId: "org-a", correlationId: "invite-manager", input: { name: "Escalation", email: "escalation@example.test", role: "owner", branchScope: "all", branchIds: ["branch-a1"] } }), "FORBIDDEN");
    await expectCode(owner.mutation(internal.invitations.prepare, { organizationId: "org-a", correlationId: "invite-foreign-branch", input: { name: "Foreign branch", email: "foreign-branch@example.test", role: "receptionist", branchScope: "selected", branchIds: ["branch-b1"] } }), "NOT_FOUND");
    const invited = await owner.mutation(internal.invitations.prepare, { organizationId: "org-a", correlationId: "invite-allowed", input: { name: "Desk user", email: "desk-user@example.test", role: "receptionist", branchScope: "selected", branchIds: ["branch-a1"] } });
    expect(invited).toMatchObject({ organizationId: "org-a", role: "receptionist", branchIds: ["branch-a1"] });

    const today = new Date().toISOString().slice(0, 10);
    await expectCode(owner.mutation(api.domain.mutate, operation("memberships.sale", { memberId: "member-a-price", planId: "plan-a", startDate: today, priceOverride: money(45_000) })), "VALIDATION_ERROR");
    await expectCode(sales.mutation(api.domain.mutate, operation("memberships.sale", { memberId: "member-a-price", planId: "plan-a", startDate: today, priceOverride: money(45_000), overrideReason: "Approved hardship price." })), "FORBIDDEN");
    await expect(owner.mutation(api.domain.mutate, operation("memberships.sale", { memberId: "member-a-price", planId: "plan-a", startDate: today, priceOverride: money(45_000), overrideReason: "Approved hardship price." }))).resolves.toMatchObject({ membership: { memberId: "member-a-price" } });
    await expectCode(owner.mutation(api.domain.mutate, operation("memberships.sale", { memberId: "member-a-date", planId: "plan-a", startDate: "2099-01-01" })), "VALIDATION_ERROR");
    await expect(owner.mutation(api.domain.mutate, operation("memberships.sale", { memberId: "member-a-date", planId: "plan-a", startDate: "2099-01-01", overrideReason: "Member requested a deferred start." }))).resolves.toMatchObject({ membership: { memberId: "member-a-date" } });

    const [aFirst, aSecond, bFirst] = await Promise.all([
      sales.mutation(api.domain.mutate, operation("members.create", { fullName: "Concurrent A one", phone: "+962790000911", homeBranchId: "branch-a1" })),
      sales.mutation(api.domain.mutate, operation("members.create", { fullName: "Concurrent A two", phone: "+962790000912", homeBranchId: "branch-a1" })),
      foreign.mutation(api.domain.mutate, operation("members.create", { fullName: "Concurrent B one", phone: "+962790000913", homeBranchId: "branch-b1" })),
    ]) as [{ member: { memberNumber: string; id: string } }, { member: { memberNumber: string; id: string } }, { member: { memberNumber: string; id: string } }];
    expect(new Set([aFirst.member.memberNumber, aSecond.member.memberNumber]).size).toBe(2);
    expect(aFirst.member.memberNumber).toMatch(/^A1-100\d$/);
    expect(bFirst.member.memberNumber).toMatch(/^B1-1000$/);

    await t.run(async (ctx) => {
      await ctx.db.patch(ids.salesA1, { status: "deactivated", updatedAt: Date.now() });
      const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", ids.orgA).eq("userId", ids.managerA1)).unique();
      if (!membership) throw new Error("missing manager membership");
      await ctx.db.patch(membership._id, { active: false, updatedAt: Date.now() });
    });
    await expectCode(sales.mutation(api.domain.mutate, operation("members.create", { fullName: "Deactivated", phone: "+962790000914", homeBranchId: "branch-a1" })), "UNAUTHENTICATED");
    await expectCode(manager.query(api.domain.query, operation("members.list")), "FORBIDDEN");

    const facts = await factCounts(t);
    expect(facts.records.filter((row) => row.entityType === "member" && row.organizationId === ids.orgA && [aFirst.member.id, aSecond.member.id].includes(row.publicId))).toHaveLength(2);
    expect(facts.records.filter((row) => row.entityType === "member" && row.organizationId === ids.orgB && row.publicId === bFirst.member.id)).toHaveLength(1);
    expect(facts.audits.some((event) => event.action === "user.invite.requested" && event.entityLabel === "Desk user")).toBe(true);
    expect(facts.audits.some((event) => event.action === "membership.price_override" && event.reason === "Approved hardship price.")).toBe(true);
    expect(facts.audits.some((event) => event.action === "membership.date_override" && event.reason === "Member requested a deferred start.")).toBe(true);
  });
});
