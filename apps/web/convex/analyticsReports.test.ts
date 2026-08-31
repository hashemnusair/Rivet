import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-test-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-analytics", name: "Analytics Gym", slug: "analytics-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-a", name: "Abdoun", code: "ABD", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-b", name: "Sweifieh", code: "SWF", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner-analytics", authSubject: "clerk-owner-analytics", email: "owner@analytics.example", fullName: "Owner Analytics", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const scoped = await ctx.db.insert("users", { publicId: "manager-analytics", authSubject: "clerk-manager-analytics", email: "manager@analytics.example", fullName: "Manager Analytics", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const reception = await ctx.db.insert("users", { publicId: "reception-analytics", authSubject: "clerk-reception-analytics", email: "reception@analytics.example", fullName: "Reception Analytics", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branchA, branchB], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: scoped, role: "manager", branchIds: [branchA], active: true, branchScope: "selected", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: reception, role: "receptionist", branchIds: [branchA], active: true, branchScope: "selected", createdAt: now, updatedAt: now });

    const iso = (offsetHours: number) => new Date(now - offsetHours * 3_600_000).toISOString();
    const insert = async (entityType: string, publicId: string, value: Record<string, unknown>, branchId?: typeof branchA, createdAt = now) => {
      await ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, branchId, createdAt, updatedAt: createdAt, data: { id: publicId, ...value } });
    };
    await insert("member", "member-a", { fullName: "Aisha", memberNumber: "A-1", status: "active", homeBranchId: "branch-a", createdAt: iso(24) }, branchA);
    await insert("member", "member-b", { fullName: "Basel", memberNumber: "B-1", status: "active", homeBranchId: "branch-b", createdAt: iso(24) }, branchB);
    await insert("checkIn", "check-a", { memberId: "member-a", branchId: "branch-a", branchName: "Abdoun", decision: "allowed", occurredAt: iso(2) }, branchA);
    await insert("checkIn", "check-b", { memberId: "member-b", branchId: "branch-b", branchName: "Sweifieh", decision: "allowed", occurredAt: iso(3) }, branchB);
    await insert("checkIn", "check-blocked", { memberId: "member-a", branchId: "branch-a", branchName: "Abdoun", decision: "blocked", occurredAt: iso(4) }, branchA);
    await insert("payment", "payment-a", { memberId: "member-a", branchId: "branch-a", type: "payment", status: "completed", amount: { amount: 45_000, currency: "JOD" }, method: "cash", occurredAt: iso(2) }, branchA);
    await insert("charge", "charge-a", { memberId: "member-a", total: { amount: 45_000, currency: "JOD" }, discount: { amount: 0, currency: "JOD" }, outstandingAmount: { amount: 0, currency: "JOD" }, status: "paid", issueDate: iso(2).slice(0, 10), createdAt: iso(2) }, branchA);
  });
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman" }).format(Date.now());
const range = () => ({ from: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10), to: today() });

describe("operational analytics queries", () => {
  it("requires the reporting permission and validates the requested range", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const reception = t.withIdentity({ subject: "clerk-reception-analytics" });
    await expectCode(reception.query(api.domain.query, operation("analytics.peak_hours", { ...range() })), "FORBIDDEN");
    const owner = t.withIdentity({ subject: "clerk-owner-analytics" });
    await expectCode(owner.query(api.domain.query, operation("analytics.peak_hours", { from: "2026-06-30", to: "2026-06-01" })), "VALIDATION_ERROR");
    await expectCode(owner.query(api.domain.query, operation("analytics.peak_hours", { from: "2020-01-01", to: "2026-06-01" })), "VALIDATION_ERROR");
  });

  it("scopes rows to the actor's branches and honors an explicit branch filter", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-analytics" });
    const all = await owner.query(api.domain.query, operation("analytics.peak_hours", { ...range() })) as { admittedTotal: number; excludedTotal: number };
    expect(all.admittedTotal).toBe(2);
    expect(all.excludedTotal).toBe(1);

    const filtered = await owner.query(api.domain.query, operation("analytics.peak_hours", { ...range(), branchId: "branch-b" })) as { admittedTotal: number };
    expect(filtered.admittedTotal).toBe(1);

    const scoped = t.withIdentity({ subject: "clerk-manager-analytics" });
    const scopedReport = await scoped.query(api.domain.query, operation("analytics.peak_hours", { ...range() })) as { admittedTotal: number };
    expect(scopedReport.admittedTotal).toBe(1);
    await expectCode(scoped.query(api.domain.query, operation("analytics.peak_hours", { ...range(), branchId: "branch-b" })), "FORBIDDEN");
    await expectCode(owner.query(api.domain.query, operation("analytics.peak_hours", { ...range(), branchId: "branch-nope" })), "FORBIDDEN");
  });

  it("returns collections built from payment and charge facts without writing anything", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-analytics" });
    const before = await t.run(async (ctx) => (await ctx.db.query("domainRecords").collect()).length);
    const report = await owner.query(api.domain.query, operation("analytics.collections", { ...range() })) as Record<string, number>;
    expect(report).toMatchObject({ collectedCount: 1, collectedMinor: 45_000, chargedCount: 1, chargedMinor: 45_000, refundedCount: 0, outstandingNowMinor: 0 });
    const after = await t.run(async (ctx) => (await ctx.db.query("domainRecords").collect()).length);
    expect(after).toBe(before);
  });

  it("serves retention and renewal shapes from membership facts", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const organization = (await ctx.db.query("organizations").collect())[0]!;
      const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman" });
      const day = (offset: number) => local.format(Date.now() + offset * 86_400_000);
      await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "membership", publicId: "ms-a", createdAt: Date.now(), updatedAt: Date.now(), data: { id: "ms-a", memberId: "member-a", planId: "plan-x", startDate: day(-40), endDate: day(5) } });
      await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "plan", publicId: "plan-x", createdAt: Date.now(), updatedAt: Date.now(), data: { id: "plan-x", name: "Monthly", basePrice: { amount: 45_000, currency: "JOD" } } });
    });
    const owner = t.withIdentity({ subject: "clerk-owner-analytics" });
    const forecast = await owner.query(api.domain.query, operation("analytics.renewal_forecast", {})) as { buckets: Array<{ count: number; rows: Array<{ memberName: string }> }> };
    expect(forecast.buckets[0]!.count).toBe(1);
    expect(forecast.buckets[0]!.rows[0]!.memberName).toBe("Aisha");
    const retention = await owner.query(api.domain.query, operation("analytics.retention", {})) as { cohorts: Array<{ size: number }> };
    expect(retention.cohorts.length).toBeGreaterThan(0);
  });
});
