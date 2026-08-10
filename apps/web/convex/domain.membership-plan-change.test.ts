import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-plan-${name}` });

function dateInDays(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-plan", name: "Plan Gym", slug: "plan-gym", status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "plan-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "plan-owner", authSubject: "clerk-plan-owner", email: "owner@plan.example", fullName: "Plan Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    const insertRecord = async (entityType: string, publicId: string, data: Record<string, unknown>) => await ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, branchId: branch, memberPublicId: entityType === "member" ? publicId : undefined, createdAt: now, updatedAt: now, data: { id: publicId, ...data } });
    await insertRecord("plan", "plan-basic", { name: "Basic", code: "BASIC", kind: "time", durationDays: 30, basePrice: { amount: 30_000, currency: "JOD" }, branchAccess: "all", status: "active", freezeAllowanceDays: 5 });
    await insertRecord("plan", "plan-pro", { name: "Pro", code: "PRO", kind: "time", durationDays: 30, basePrice: { amount: 50_000, currency: "JOD" }, branchAccess: "all", status: "active", freezeAllowanceDays: 5 });
    await insertRecord("member", "member-immediate", { fullName: "Immediate Member", memberNumber: "MAIN-1000", phone: "+962790000101", homeBranchId: "plan-branch", status: "active", createdAt: new Date(now).toISOString() });
    await insertRecord("member", "member-next", { fullName: "Next Renewal Member", memberNumber: "MAIN-1001", phone: "+962790000102", homeBranchId: "plan-branch", status: "active", createdAt: new Date(now).toISOString() });
    await insertRecord("membership", "membership-immediate", { memberId: "member-immediate", planId: "plan-basic", homeBranchId: "plan-branch", startDate: dateInDays(-2), endDate: dateInDays(20), salePrice: { amount: 30_000, currency: "JOD" }, discount: { amount: 0, currency: "JOD" }, status: "active", frozenDaysUsed: 0, freezes: [] });
    await insertRecord("membership", "membership-next", { memberId: "member-next", planId: "plan-basic", homeBranchId: "plan-branch", startDate: dateInDays(-10), endDate: dateInDays(5), salePrice: { amount: 30_000, currency: "JOD" }, discount: { amount: 0, currency: "JOD" }, status: "active", frozenDaysUsed: 0, freezes: [] });
  });
}

describe("membership plan change verification", () => {
  it("supports immediate upgrades and next-renewal downgrades with explicit audit state", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-plan-owner" });
    const immediate = await owner.mutation(api.domain.mutate, operation("memberships.plan_change", { membershipId: "membership-immediate", planId: "plan-pro", effectiveDate: "immediate", reason: "Member requested an immediate upgrade." })) as { membership: { id: string; planId: string; startDate: string } };
    expect(immediate.membership).toMatchObject({ planId: "plan-pro", startDate: dateInDays(0) });

    const next = await owner.mutation(api.domain.mutate, operation("memberships.plan_change", { membershipId: "membership-next", planId: "plan-pro", effectiveDate: "next_renewal", reason: "Member selected the new plan for renewal." })) as { membership: { id: string; planId: string; startDate: string } };
    expect(next.membership).toMatchObject({ planId: "plan-pro", startDate: dateInDays(6) });

    const persisted = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-plan")).unique();
      return {
        memberships: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "membership")).collect(),
        audits: organization ? await ctx.db.query("auditEvents").withIndex("by_organization_category", (q) => q.eq("organizationId", organization._id).eq("category", "memberships")).collect() : [],
      };
    });
    const oldImmediate = persisted.memberships.find((row) => row.publicId === "membership-immediate");
    const oldNext = persisted.memberships.find((row) => row.publicId === "membership-next");
    expect(oldImmediate?.data).toMatchObject({ cancelledAt: expect.any(String) });
    expect(oldNext?.data).not.toHaveProperty("cancelledAt");
    expect(persisted.audits.filter((event) => event.action === "membership.plan_change")).toHaveLength(2);
  });
});
