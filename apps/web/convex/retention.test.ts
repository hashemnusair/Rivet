import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { addDays } from "../src/lib/utils/dates";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }

const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-test-${name}` });

async function seed(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const createdAt = new Date(now).toISOString();
    const organization = await ctx.db.insert("organizations", { publicId: "org-retention", name: "Retention Gym", slug: "retention-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-retention", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner-retention", authSubject: "clerk-owner-retention", email: "owner@retention.example", fullName: "Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    const insertRecord = async (entityType: string, publicId: string, data: Record<string, unknown>, memberPublicId?: string) => await ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, branchId: branch, memberPublicId, createdAt: now, updatedAt: now, data: { id: publicId, organizationId: "org-retention", createdAt, ...data } });
    await insertRecord("plan", "plan-retention", { name: "All access", code: "ALL", kind: "time", status: "active", branchAccess: "all", branchIds: [], basePrice: { amount: 50_000, currency: "JOD" } });
    await insertRecord("member", "member-retention", { fullName: "Amina Saleh", memberNumber: "R-100", phone: "+962790000010", status: "active", homeBranchId: "branch-retention", gender: "female", createdAt: "2026-07-01T08:00:00.000Z" }, "member-retention");
    await insertRecord("membership", "membership-retention", { memberId: "member-retention", planId: "plan-retention", homeBranchId: "branch-retention", startDate: "2026-07-01", endDate: "2026-10-30" }, "member-retention");
    await insertRecord("checkIn", "checkin-retention", { memberId: "member-retention", branchId: "branch-retention", decision: "allowed", occurredAt: "2026-08-01T08:00:00.000Z" }, "member-retention");
    await insertRecord("settings", "settings", { operationalPolicies: { retention: { inactivityDays: 14, expiredWinBackDays: 90 }, membership: { renewalWindowDays: 14 } } });
  });
}

afterEach(() => vi.useRealTimers());

describe("retention queue", () => {
  it("derives inactivity on the server and preserves an audited snooze", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T09:00:00.000Z"));
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-retention" });

    const before = await owner.query(api.domain.query, operation("retention.queue", { reason: "inactive" })) as { items: Array<{ member: { id: string }; reasons: Array<{ kind: string; days: number }> }> };
    expect(before.items).toEqual([expect.objectContaining({ member: expect.objectContaining({ id: "member-retention" }), reasons: [expect.objectContaining({ kind: "inactive", daysInactive: 30 })] })]);

    await owner.mutation(api.domain.mutate, operation("retention.snooze", { memberId: "member-retention", until: addDays("2026-08-31", 7), reason: "Member asked us to call next week." }));
    const after = await owner.query(api.domain.query, operation("retention.queue", {})) as { items: unknown[] };
    expect(after.items).toHaveLength(0);

    const persisted = await t.run(async (ctx) => ({
      retention: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "retentionState")).collect(),
      timeline: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "timeline")).collect(),
      audit: await ctx.db.query("auditEvents").collect(),
    }));
    expect(persisted.retention[0]?.data).toMatchObject({ memberId: "member-retention", snoozedUntil: "2026-09-07", reason: "Member asked us to call next week." });
    expect(persisted.timeline[0]?.data).toMatchObject({ memberId: "member-retention", meta: { kind: "retention_snooze", until: "2026-09-07" } });
    expect(persisted.audit[0]).toMatchObject({ action: "retention.snooze", reason: "Member asked us to call next week." });
  });
});
