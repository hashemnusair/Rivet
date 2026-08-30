import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-member-sale-${name}` });

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", { publicId: "member-sale-org", name: "Member Sale Gym", slug: "member-sale-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", phoneCountryCallingCode: "+962", receiptPrefix: "RV", nextReceiptNumber: 1001, createdAt: now, updatedAt: now });
    const branchId = await ctx.db.insert("branches", { organizationId, publicId: "member-sale-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const userId = await ctx.db.insert("users", { publicId: "member-sale-owner", authSubject: "clerk-member-sale-owner", email: "owner@member-sale.test", fullName: "Sale Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner", branchIds: [branchId], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "plan", publicId: "member-sale-plan", branchId, createdAt: now, updatedAt: now, data: { id: "member-sale-plan", name: "Monthly", code: "MONTHLY", kind: "time", durationDays: 30, basePrice: { amount: 40_000, currency: "JOD" }, branchAccess: "all", branchIds: [], status: "active", freezeAllowanceDays: 5 } });
  });
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    member: { fullName: "Rana Saleh", phone: "0791234567", email: "rana.sale@example.com", homeBranchId: "member-sale-branch", preferredLanguage: "en" },
    sale: { planId: "member-sale-plan", startDate: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Amman" }), payment: { amount: { amount: 40_000, currency: "JOD" }, method: "card", externalReference: "POS-1001" } },
    idempotencyKey: "member-sale-request-0001",
    ...overrides,
  };
}

describe("atomic front-desk member sale", () => {
  it("creates the profile, first term, charge, payment, and receipt once", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-member-sale-owner" });
    const first = await owner.mutation(api.domain.mutate, operation("members.create_and_sell", request())) as { member: { id: string; memberNumber: string }; sale: { membership: { id: string; memberId: string }; charge: { outstandingAmount: { amount: number } }; payment: { id: string }; receipt: { receiptNumber: string } } };
    const replay = await owner.mutation(api.domain.mutate, operation("members.create_and_sell", request())) as typeof first;

    expect(first.member.memberNumber).toBe("MAIN-1000");
    expect(first.sale.membership.memberId).toBe(first.member.id);
    expect(first.sale.charge.outstandingAmount.amount).toBe(0);
    expect(first.sale.payment.id).toBeTruthy();
    expect(first.sale.receipt.receiptNumber).toBe("RV-001001");
    expect(replay).toEqual(first);

    const persisted = await t.run(async (ctx) => ({
      members: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "member")).collect(),
      memberships: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "membership")).collect(),
      payments: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "payment")).collect(),
    }));
    expect(persisted.members).toHaveLength(1);
    expect(persisted.memberships).toHaveLength(1);
    expect(persisted.payments).toHaveLength(1);

    await expect(owner.mutation(api.domain.mutate, operation("members.create_and_sell", request({ sale: { planId: "member-sale-plan", startDate: "2026-09-01" } })))).rejects.toThrow(/different member sale/i);

    const duplicateRequest = request({
      member: { fullName: "Rana's Sister", phone: "0791234567", homeBranchId: "member-sale-branch", preferredLanguage: "en" },
      sale: { planId: "member-sale-plan", startDate: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Amman" }) },
      idempotencyKey: "member-sale-request-duplicate",
    });
    await expect(owner.mutation(api.domain.mutate, operation("members.create_and_sell", duplicateRequest))).rejects.toThrow(/matches an existing member/i);
    const confirmed = await owner.mutation(api.domain.mutate, operation("members.create_and_sell", { ...duplicateRequest, confirmedDuplicateMemberIds: [first.member.id] })) as { member: { id: string } };
    expect(confirmed.member.id).not.toBe(first.member.id);
    const overrideAudits = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "member-sale-org")).unique();
      return organization ? await ctx.db.query("auditEvents").withIndex("by_organization_category", (q) => q.eq("organizationId", organization._id).eq("category", "members")).collect() : [];
    });
    expect(overrideAudits.some((event) => event.action === "member.duplicate_identity_override")).toBe(true);
  });

  it("rolls back the member when the sale cannot be created", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-member-sale-owner" });
    await expect(owner.mutation(api.domain.mutate, operation("members.create_and_sell", request({ sale: { planId: "missing-plan", startDate: "2026-09-01" }, idempotencyKey: "member-sale-request-rollback" })))).rejects.toThrow(/not found/i);
    const members = await t.run(async (ctx) => await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "member")).collect());
    expect(members).toHaveLength(0);
  });
});
