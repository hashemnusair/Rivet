import { describe, expect, it, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { assertOrganizationFitsPlan, effectivePlan, enforceBranchCapacity, enforceStaffCapacity, enforceMembershipCapacity } from "./planCapacity";
import { COMMERCIAL_TERMS_VERSION } from "./planCatalogue";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());

describe("Basic and Pro enforcement", () => {
  it.each(["Basic", "Pro"] as const)("enforces actual %s capacity, independent of stale catalog rows", async name => {
    const t = convexTest(schema, modules);
    const org = await t.run(async ctx => {
      const id = await ctx.db.insert("organizations", { publicId: "gym", name: "Gym", slug: "gym", status: "active", subscriptionPlan: name, timezone: "UTC", currency: "JOD", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("domainRecords", { organizationId: id, entityType: "platformPlan", publicId: name, createdAt: 1, updatedAt: 1, data: { name, branches: 1, staff: 1, members: 1, priceMinor: 999_000 } });
      const branchCount = name === "Pro" ? 6 : 1;
      for (let i = 0; i < branchCount; i++) await ctx.db.insert("branches", { organizationId: id, publicId: `b-${i}`, name: `Branch ${i}`, code: `B${i}`, active: true, status: "active", createdAt: 1, updatedAt: 1 });
      const staffCount = name === "Pro" ? 21 : 5;
      for (let i = 0; i < staffCount; i++) {
        const userId = await ctx.db.insert("users", { publicId: `u-${i}`, authSubject: `auth-${i}`, email: `u${i}@example.test`, fullName: "Staff", platformAdmin: false, status: "active", createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("organizationMemberships", { organizationId: id, userId, role: "receptionist", branchIds: [], branchScope: "all", active: true, invitationStatus: "pending", createdAt: 1, updatedAt: 1 });
      }
      const memberCount = name === "Pro" ? 1_001 : 300;
      for (let i = 0; i < memberCount; i++) await ctx.db.insert("domainRecords", { organizationId: id, entityType: "membership", publicId: `term-${i}`, createdAt: 1, updatedAt: 1, data: { memberId: `member-${i}`, startDate: "2026-01-01", endDate: "2099-01-01", status: "frozen" } });
      return id;
    });
    const plan = await t.run(ctx => effectivePlan(ctx, name));
    expect(plan.priceMinor).toBe(name === "Basic" ? 49_000 : 199_000);
    for (const [resource, check] of [
      ["branches", () => t.run(ctx => enforceBranchCapacity(ctx, org, plan, null, true))],
      ["staff", () => t.run(ctx => enforceStaffCapacity(ctx, org, plan, false, true))],
      ["members", () => t.run(ctx => enforceMembershipCapacity(ctx, org, plan, { memberId: "new", startDate: "2026-01-01", endDate: "2099-01-01" }, { today: "2026-10-21" }))],
    ] as const) {
      if (name === "Basic") await expect(check()).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR", details: expect.objectContaining({ resource, plan: "Basic" }) }) });
      else await expect(check()).resolves.toBeNull();
    }
    if (name === "Pro") {
      const basic = await t.run(ctx => effectivePlan(ctx, "Basic"));
      await expect(t.run(ctx => assertOrganizationFitsPlan(ctx, org, basic, "2026-10-21"))).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) });
    }
  });

  it.each(["Basic", "Pro"] as const)("bills %s at the current price while retaining historical invoices", async name => {
    vi.stubEnv("RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED", "1");
    const t = convexTest(schema, modules);
    const now = Date.parse("2026-10-21T12:00:00Z");
    const org = await t.run(async ctx => {
      const id = await ctx.db.insert("organizations", { publicId: "billing", name: "Billing", slug: "billing", status: "trial", subscriptionPlan: name, billingInterval: "monthly", onboardingFeeMinor: name === "Basic" ? 75_000 : 150_000, commercialTermsVersion: COMMERCIAL_TERMS_VERSION, trialEndsAt: now, timezone: "UTC", currency: "JOD", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("domainRecords", { organizationId: id, entityType: "platformPlan", publicId: name, createdAt: 1, updatedAt: 1, data: { name, priceMinor: 249_000 } });
      return id;
    });
    await t.mutation(internal.subscriptionReconciliation.reconcile, { now });
    await t.mutation(internal.subscriptionReconciliation.reconcile, { now });
    const rows = await t.run(ctx => ctx.db.query("domainRecords").withIndex("by_organization_type", q => q.eq("organizationId", org).eq("entityType", "platformInvoice")).collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data.amountMinor).toBe(name === "Basic" ? 124_000 : 349_000);
  });

  it("rejects retired plans at the public application boundary", async () => {
    const t = convexTest(schema, modules);
    await expect(t.action(api.gymApplications.submit, { gymName: "Retired Gym", gymAddress: "12 Amman Street", ownerName: "Owner", email: "retired@example.test", contactNumber: "+962790000099", plan: "Enterprise" as "Basic" })).rejects.toThrow();
  });
});
