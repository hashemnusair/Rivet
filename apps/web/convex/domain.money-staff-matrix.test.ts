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
    await user("reception-a1", "clerk-reception-a1", orgA, "receptionist", [a1], "selected");
    await user("owner-b", "clerk-owner-b", orgB, "owner", [b1], "all");
    const insert = async (organizationId: typeof orgA, entityType: string, publicId: string, data: Record<string, unknown>, branchId?: typeof a1) => await ctx.db.insert("domainRecords", {
      organizationId, entityType, publicId, branchId, memberPublicId: entityType === "member" ? publicId : undefined, createdAt: now, updatedAt: now, data: { id: publicId, ...data },
    });
    await insert(orgA, "member", "member-a1", { memberNumber: "A1-900", fullName: "Member A1", phone: "+962790000901", homeBranchId: "branch-a1", status: "active", createdAt: new Date(now).toISOString() }, a1);
    await insert(orgA, "member", "member-a2", { memberNumber: "A2-901", fullName: "Member A2", phone: "+962790000902", homeBranchId: "branch-a2", status: "active", createdAt: new Date(now).toISOString() }, a2);
    await insert(orgA, "member", "member-a-price", { memberNumber: "A1-902", fullName: "Member A price", phone: "+962790000906", homeBranchId: "branch-a1", status: "active", createdAt: new Date(now).toISOString() }, a1);
    await insert(orgA, "member", "member-a-date", { memberNumber: "A1-903", fullName: "Member A date", phone: "+962790000907", homeBranchId: "branch-a1", status: "active", createdAt: new Date(now).toISOString() }, a1);
    await insert(orgB, "member", "member-b1", { memberNumber: "B1-900", fullName: "Member B1", phone: "+962790000903", homeBranchId: "branch-b1", status: "active", createdAt: new Date(now).toISOString() }, b1);
    await insert(orgA, "plan", "plan-a", { name: "A plan", code: "A", kind: "time", durationDays: 30, basePrice: money(50_000), branchAccess: "all", status: "active" }, a1);
    await insert(orgB, "plan", "plan-b", { name: "B plan", code: "B", kind: "time", durationDays: 30, basePrice: money(50_000), branchAccess: "all", status: "active" }, b1);
    await insert(orgA, "charge", "charge-a-refund", { memberId: "member-a1", total: money(50_000), paidAmount: money(0), outstandingAmount: money(50_000), status: "unpaid" }, a1);
    await insert(orgA, "charge", "charge-a-void", { memberId: "member-a1", total: money(40_000), paidAmount: money(0), outstandingAmount: money(40_000), status: "unpaid" }, a1);
    await insert(orgA, "charge", "charge-a2", { memberId: "member-a2", total: money(25_000), paidAmount: money(0), outstandingAmount: money(25_000), status: "unpaid" }, a2);
    await insert(orgB, "charge", "charge-b", { memberId: "member-b1", total: money(30_000), paidAmount: money(0), outstandingAmount: money(30_000), status: "unpaid" }, b1);
    await insert(orgA, "membership", "membership-a1", { memberId: "member-a1", planId: "plan-a", homeBranchId: "branch-a1", startDate: today, endDate: "2099-01-01", salePrice: money(50_000), discount: money(0), frozenDaysUsed: 0, freezes: [] }, a1);
    await insert(orgA, "lead", "lead-a1", { branchId: "branch-a1", fullName: "Lead A1", phone: "+962790000904", stage: "new", createdAt: new Date(now).toISOString() }, a1);
    return { orgA, orgB, a1, a2, b1, ownerA, managerA1, salesA1 };
  });
}

async function factCounts(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => ({
    payments: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "payment")).collect(),
    audits: await ctx.db.query("auditEvents").collect(),
    records: await ctx.db.query("domainRecords").collect(),
  }));
}

describe("TODO-006 persisted money and staff handler matrix", () => {
  it("allows a routine collection once, rejects foreign identifiers, and preserves one immutable collection audit", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-sales-a1" });
    const reception = t.withIdentity({ subject: "clerk-reception-a1" });
    const foreign = t.withIdentity({ subject: "clerk-owner-b" });
    const input = { memberId: "member-a1", chargeId: "charge-a-refund", branchId: "branch-a1", amount: money(50_000), method: "card", idempotencyKey: "collect-a1" };

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
    const collect = async (chargeId: string, key: string) => await sales.mutation(api.domain.mutate, operation("payments.create", { memberId: "member-a1", chargeId, branchId: "branch-a1", amount: chargeId === "charge-a-void" ? money(40_000) : money(50_000), method: "card", idempotencyKey: key })) as { payment: { id: string } };
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
