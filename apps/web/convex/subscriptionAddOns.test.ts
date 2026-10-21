import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { ADD_ON_CATALOGUE, EMPTY_ADD_ONS, applyAddOns, validateAddOns } from "./subscriptionAddOns";
import { effectiveOrganizationPlan, enforceBranchCapacity, enforceStaffCapacity, enforceMembershipCapacity } from "./planCapacity";
import { platformPlanEntitledModules } from "./platformPlanCatalog";
import { invoicePdfInput } from "./platformInvoiceDocument";
import { findPlan } from "./planCatalogue";
const modules = import.meta.glob("./**/*.ts");
const max = { branch: 1, members: 3, staff: 3, operations: 1, finance: 1, reporting: 1 };
const request = (input: Record<string, unknown>) => ({ operation: "platform.gym.update", input: { gymId: "addon-gym", reason: "Owner approved this paid add-on package", ...input }, correlationId: "addons-test" });
async function setup() {
  const t = convexTest(schema, modules);
  const org = await t.run(async ctx => {
    const now = Date.now();
    const id = await ctx.db.insert("organizations", { publicId: "addon-org", name: "Add-on Gym", slug: "addon-gym", status: "active", subscriptionPlan: "Basic", billingInterval: "monthly", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner", authSubject: "owner", email: "owner@example.test", fullName: "Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("users", { publicId: "admin", authSubject: "admin", email: "admin@example.test", fullName: "Admin", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: id, userId: owner, role: "owner", branchIds: [], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: id, entityType: "marketplaceGym", publicId: "addon-gym", createdAt: now, updatedAt: now, data: { id: "addon-gym", name: "Add-on Gym", targetOrganizationId: "addon-org", rivetPlan: "Basic", subscriptionStatus: "active", isPublic: false } });
    return id;
  });
  return { t, org, admin: t.withIdentity({ subject: "admin" }), owner: t.withIdentity({ subject: "owner" }) };
}
afterEach(() => vi.unstubAllEnvs());

describe("paid Basic add-ons", () => {
  it("prices the bounded package and rejects fractional, repeated, forged or dependent purchases", () => {
    expect(applyAddOns(findPlan("Basic")!, max)).toMatchObject({ priceMinor: 158000, branches: 2, members: 600, staff: 11, operationalEmails: 1800 });
    for (const item of ADD_ON_CATALOGUE) {
      for (const quantity of [-1, 0.5, item.max + 1, Infinity, "1", null]) {
        // Null is not a request to buy a free/implicit pack.
        if (quantity === null) continue;
        expect(() => validateAddOns({ ...max, [item.key]: quantity }, "Basic")).toThrow();
      }
    }
    for (const input of [{ finance: 1 }, { reporting: 1 }, { priceMinor: 0 }, { branch: 2 }, []]) expect(() => validateAddOns(input, "Basic")).toThrow();
    expect(() => validateAddOns(max, "Pro")).toThrow();
  });

  it("requires admin authority, a reason and a current revision; atomically bills once and grants only the target tenant", async () => {
    const { t, org, admin, owner } = await setup();
    await expect(owner.mutation(api.domain.mutate, request({ addOns: max, expectedAddOnsRevision: 0 }))).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(admin.mutation(api.domain.mutate, request({ addOns: max, expectedAddOnsRevision: 0, reason: "" }))).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await admin.mutation(api.domain.mutate, request({ addOns: max, expectedAddOnsRevision: 0 }));
    await expect(admin.mutation(api.domain.mutate, request({ addOns: max, expectedAddOnsRevision: 0 }))).rejects.toMatchObject({ data: { code: "CONFLICT" } });
    await admin.mutation(api.domain.mutate, request({ addOns: max, expectedAddOnsRevision: 1 }));
    const result = await t.run(async ctx => {
      const organization = (await ctx.db.get(org))!;
      return { organization, plan: await effectiveOrganizationPlan(ctx, organization), modules: await platformPlanEntitledModules(ctx, "Basic", organization.subscriptionAddOns), baseModules: await platformPlanEntitledModules(ctx, "Basic"), invoices: await ctx.db.query("domainRecords").withIndex("by_organization_type", q => q.eq("organizationId", org).eq("entityType", "platformInvoice")).collect(), audits: await ctx.db.query("platformAuditEvents").collect() };
    });
    expect(result.organization).toMatchObject({ addOnsRevision: 1, subscriptionAddOns: max, addOnsEffectiveAt: expect.any(Number) });
    expect(result.plan).toMatchObject({ priceMinor: 158000, members: 600, branches: 2, staff: 11 });
    expect(result.modules).toContain("reporting");
    expect(result.baseModules).toBeUndefined();
    expect(result.invoices).toHaveLength(1);
    const invoice = result.invoices[0]!.data;
    expect(invoice.amountMinor).toBe(158000);
    expect(invoice.lines).toHaveLength(7);
    expect(invoice.lines.reduce((sum: number, line: { amountMinor: number }) => sum + line.amountMinor, 0)).toBe(158000);
    expect(invoicePdfInput("test", invoice, { name: "Gym" }).lines).toHaveLength(7);
    expect(result.audits.some(event => (event.after as { addOnsRevision?: number }).addOnsRevision === 1)).toBe(true);
  });

  it("enforces organization-wide upper bounds and refuses capacity removal without billing side effects", async () => {
    const { t, org, admin } = await setup();
    await admin.mutation(api.domain.mutate, request({ addOns: max, expectedAddOnsRevision: 0 }));
    await t.run(async ctx => {
      for (let i=0;i<2;i++) await ctx.db.insert("branches", { organizationId: org, name: `Branch ${i}`, code: `B${i}`, active: true, status: "active", createdAt: 1, updatedAt: 1 });
      for (let i=0;i<10;i++) {
        const userId = await ctx.db.insert("users", { authSubject: `staff${i}`, email: `staff${i}@example.test`, fullName: "Staff", platformAdmin: false, status: "active", createdAt: 1, updatedAt: 1 });
        await ctx.db.insert("organizationMemberships", { organizationId: org, userId, role: "receptionist", branchIds: [], active: true, invitationStatus: "pending", branchScope: "all", createdAt: 1, updatedAt: 1 });
      }
      for (let i=0;i<600;i++) await ctx.db.insert("domainRecords", { organizationId: org, entityType: "membership", publicId: `term${i}`, createdAt: 1, updatedAt: 1, data: { memberId: `m${i}`, status: "frozen", startDate: "2026-01-01", endDate: "2099-01-01" } });
    });
    const plan = await t.run(async ctx => effectiveOrganizationPlan(ctx, (await ctx.db.get(org))!));
    for (const check of [() => t.run(ctx => enforceBranchCapacity(ctx, org, plan, null, true)), () => t.run(ctx => enforceStaffCapacity(ctx, org, plan, false, true)), () => t.run(ctx => enforceMembershipCapacity(ctx, org, plan, { memberId: "extra", startDate: "2026-01-01", endDate: "2099-01-01" }, { today: "2026-10-21" }))]) await expect(check()).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    for (const key of ["branch", "members", "staff"]) await expect(admin.mutation(api.domain.mutate, request({ addOns: { ...max, [key]: 0 }, expectedAddOnsRevision: 1 }))).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
    await t.run(async ctx => {
      expect((await ctx.db.get(org))?.addOnsRevision).toBe(1);
      expect(await ctx.db.query("domainRecords").withIndex("by_organization_type", q => q.eq("organizationId", org).eq("entityType", "platformInvoice")).collect()).toHaveLength(1);
    });
  });

  it("removes paid modules, clears add-ons on Pro, and rejects smuggled purchases", async () => {
    const { t, org, admin } = await setup();
    await admin.mutation(api.domain.mutate, request({ addOns: max, expectedAddOnsRevision: 0 }));
    await admin.mutation(api.domain.mutate, request({ addOns: EMPTY_ADD_ONS, expectedAddOnsRevision: 1 }));
    const organization = await t.run(ctx => ctx.db.get(org));
    expect(await t.run(ctx => platformPlanEntitledModules(ctx, "Basic", organization!.subscriptionAddOns))).toBeUndefined();
    await admin.mutation(api.domain.mutate, request({ plan: "Pro" }));
    expect((await t.run(ctx => ctx.db.get(org)))?.subscriptionAddOns).toEqual(EMPTY_ADD_ONS);
    await expect(admin.mutation(api.domain.mutate, request({ addOns: max, expectedAddOnsRevision: 2 }))).rejects.toMatchObject({ data: { code: "VALIDATION_ERROR" } });
  });

  it.each(["monthly", "annual"] as const)("includes add-ons in %s activation and recurring invoices, with one-time setup and no duplicate cycles", async interval => {
    vi.stubEnv("RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED", "1");
    const { t, org, admin } = await setup();
    await t.run(ctx => ctx.db.patch(org, { onboardingFeeMinor: 75000 }));
    await admin.mutation(api.domain.mutate, request({ addOns: max, expectedAddOnsRevision: 0, billingInterval: interval }));
    const first = await t.run(async ctx => (await ctx.db.query("domainRecords").withIndex("by_organization_type", q => q.eq("organizationId", org).eq("entityType", "platformInvoice")).unique())!);
    const recurring = interval === "annual" ? 1801200 : 158000;
    expect(first.data.amountMinor).toBe(recurring + 75000);
    await t.run(ctx => ctx.db.patch(first._id, { data: { ...first.data, status: "paid", paidAt: new Date().toISOString() } }));
    const boundary = (await t.run(ctx => ctx.db.get(org)))!.currentPeriodEndsAt!;
    await t.mutation(internal.subscriptionReconciliation.reconcile, { now: boundary });
    await t.mutation(internal.subscriptionReconciliation.reconcile, { now: boundary });
    const rows = await t.run(ctx => ctx.db.query("domainRecords").withIndex("by_organization_type", q => q.eq("organizationId", org).eq("entityType", "platformInvoice")).collect());
    expect(rows).toHaveLength(2);
    const renewal = rows.find(row => row._id !== first._id)!.data;
    expect(renewal.amountMinor).toBe(recurring);
    expect(renewal.onboardingFeeMinor).toBeUndefined();
    expect(renewal.lines).toHaveLength(7);
  });
});
