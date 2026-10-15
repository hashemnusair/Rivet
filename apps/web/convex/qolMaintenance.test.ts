import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.{ts,js}");

afterEach(() => vi.useRealTimers());

describe("QoL maintenance", () => {
  it("purges an expired export body while retaining its audit-safe metadata", async () => {
    const t = convexTest(schema, modules);
    const rowId = await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", { publicId: "org-maintenance", name: "Maintenance Gym", slug: "maintenance", status: "active", currency: "JOD", timezone: "Asia/Amman", createdAt: Date.now(), updatedAt: Date.now() });
      return await ctx.db.insert("domainRecords", {
        organizationId,
        entityType: "exportJob",
        publicId: "export-expired",
        exportExpiresAt: Date.now() - 1,
        createdAt: Date.now() - 100,
        updatedAt: Date.now() - 100,
        data: { id: "export-expired", status: "completed", rowCount: 2, content: "name\r\nA\r\nB\r\n", expiresAt: new Date(Date.now() - 1).toISOString() },
      });
    });

    expect(await t.mutation(internal.qolMaintenance.purgeExpiredExports, {})).toBe(1);
    await t.run(async (ctx) => {
      const row = await ctx.db.get(rowId);
      expect(row?.data).not.toHaveProperty("content");
      expect(row?.data).toMatchObject({ id: "export-expired", rowCount: 2, contentPurgedAt: expect.any(String) });
      expect(row?.exportExpiresAt).toBeUndefined();
    });
  });

  it("advances past exports without an expiry and previously purged metadata", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", { name: "Cleanup", slug: "cleanup", status: "active", currency: "JOD", timezone: "UTC", createdAt: now, updatedAt: now });
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert("domainRecords", { organizationId, entityType: "exportJob", publicId: `metadata-${index}`, data: { status: "completed" }, createdAt: now, updatedAt: now });
      }
      return await Promise.all([0, 1].map((index) => ctx.db.insert("domainRecords", { organizationId, entityType: "exportJob", publicId: `expired-${index}`, exportExpiresAt: now - 1, data: { content: "private CSV", rowCount: 1 }, createdAt: now, updatedAt: now })));
    });
    expect(await t.mutation(internal.qolMaintenance.purgeExpiredExports, {})).toBe(2);
    expect(await t.mutation(internal.qolMaintenance.purgeExpiredExports, {})).toBe(0);
    await t.run(async (ctx) => {
      for (const id of ids) expect((await ctx.db.get(id))?.data).not.toHaveProperty("content");
    });
  });

  it("backfills pre-index identity projections and marks the migration complete", async () => {
    const t = convexTest(schema, modules);
    const rowId = await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", { publicId: "org-backfill", name: "Backfill Gym", slug: "backfill", status: "active", currency: "JOD", timezone: "Asia/Amman", createdAt: Date.now(), updatedAt: Date.now() });
      return await ctx.db.insert("domainRecords", {
        organizationId,
        entityType: "customerMembership",
        publicId: "membership-backfill",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: { id: "membership-backfill", customerUserId: "user-public", customerId: "profile-public" },
      });
    });

    expect(await t.mutation(internal.qolMaintenance.backfillCustomerMembershipIdentity, {})).toEqual({ processed: 1, completed: true });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(rowId)).toMatchObject({ customerUserPublicId: "user-public", customerProfilePublicId: "profile-public" });
      expect(await ctx.db.query("maintenanceState").withIndex("by_key", (q) => q.eq("key", "customer_membership_identity_v2")).unique()).toMatchObject({ status: "completed", processedCount: 1 });
    });
  });
  it("advances past a full batch of unresolved identities and does not recount completed runs", async () => {
    const t = convexTest(schema, modules);
    const lastId = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", { name: "Identity", slug: "identity", status: "active", currency: "JOD", timezone: "UTC", createdAt: now, updatedAt: now });
      for (let i = 0; i < 100; i += 1) {
        await ctx.db.insert("domainRecords", { organizationId, entityType: "customerMembership", publicId: `unresolved-${i}`, data: i % 2 ? { customerId: `profile-${i}` } : {}, createdAt: now, updatedAt: now });
      }
      return ctx.db.insert("domainRecords", { organizationId, entityType: "customerMembership", publicId: "last", data: { customerUserId: "last-user" }, createdAt: now, updatedAt: now });
    });
    expect(await t.mutation(internal.qolMaintenance.backfillCustomerMembershipIdentity, {})).toEqual({ processed: 50, completed: false });
    expect(await t.mutation(internal.qolMaintenance.backfillCustomerMembershipIdentity, {})).toEqual({ processed: 1, completed: true });
    expect(await t.mutation(internal.qolMaintenance.backfillCustomerMembershipIdentity, {})).toEqual({ processed: 0, completed: true });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(lastId))?.customerUserPublicId).toBe("last-user");
      const state = await ctx.db.query("maintenanceState").withIndex("by_key", q => q.eq("key", "customer_membership_identity_v2")).unique();
      expect(state).toMatchObject({ processedCount: 51, skippedCount: 100, status: "completed" });
      const rows = await ctx.db.query("domainRecords").withIndex("by_entity_type", q => q.eq("entityType", "customerMembership")).collect();
      expect(rows.filter(row => row.customerIdentityBackfillIssue === "missing_identity")).toHaveLength(50);
      expect(rows.filter(row => row.customerIdentityBackfillIssue === "profile_only")).toHaveLength(50);
    });
  });

  it("folds existing check-ins into one latest-visit row per member and branch, across batches and gyms", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const expected = await t.run(async (ctx) => {
      const now = Date.now();
      const latest = new Map<string, string>();
      for (const slug of ["visits-one", "visits-two"]) {
        const organizationId = await ctx.db.insert("organizations", { publicId: slug, name: slug, slug, status: "active", currency: "JOD", timezone: "Asia/Amman", createdAt: now, updatedAt: now });
        const branches = [
          await ctx.db.insert("branches", { organizationId, publicId: `${slug}-a`, name: "A", code: "A", active: true, status: "active", createdAt: now, updatedAt: now }),
          await ctx.db.insert("branches", { organizationId, publicId: `${slug}-b`, name: "B", code: "B", active: true, status: "active", createdAt: now, updatedAt: now }),
        ];
        // 650 check-ins per gym, written out of time order; every seventh is a refusal
        // with the newest timestamp, which must never count as a visit.
        for (let index = 0; index < 650; index += 1) {
          const memberId = `${slug}-member-${index % 9}`;
          const branch = index % 2;
          const blocked = index % 7 === 0;
          const occurredAt = new Date(Date.UTC(2026, 8, 1) + ((index * 37) % 650) * 3_600_000 + (blocked ? 10 ** 10 : 0)).toISOString();
          await ctx.db.insert("domainRecords", { organizationId, entityType: "checkIn", publicId: `${slug}-ci-${index}`, branchId: branches[branch], memberPublicId: memberId, createdAt: now, updatedAt: now, data: { id: `${slug}-ci-${index}`, memberId, branchId: `${slug}-${branch ? "b" : "a"}`, decision: blocked ? "blocked" : index % 5 === 0 ? "overridden" : "allowed", occurredAt } });
          if (blocked) continue;
          const key = `${memberId}|${slug}-${branch ? "b" : "a"}`;
          if ((latest.get(key) ?? "") < occurredAt) latest.set(key, occurredAt);
        }
      }
      return Object.fromEntries(latest);
    });

    expect(await t.mutation(internal.qolMaintenance.backfillMemberVisits, {})).toMatchObject({ completed: false });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("maintenanceState").withIndex("by_key", (q) => q.eq("key", "member_visit_summary_v1")).unique()).toBeNull();
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await t.mutation(internal.qolMaintenance.backfillMemberVisits, {})).toEqual({ processed: 0, completed: true });

    await t.run(async (ctx) => {
      const visits = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "memberVisit")).collect();
      expect(Object.fromEntries(visits.map((row) => {
        const value = row.data as { memberId: string; branchId: string; lastVisitAt: string };
        return [`${value.memberId}|${value.branchId}`, value.lastVisitAt];
      }))).toEqual(expected);
      for (const row of visits) {
        const branch = row.branchId ? await ctx.db.get(row.branchId) : null;
        expect(branch?.publicId).toBe((row.data as { branchId: string }).branchId);
        expect(row.memberPublicId).toBe((row.data as { memberId: string }).memberId);
      }
      expect(await ctx.db.query("maintenanceState").withIndex("by_key", (q) => q.eq("key", "member_visit_backfill_v1")).unique()).toMatchObject({ status: "completed", processedCount: 1_114, skippedCount: 186 });
      expect(await ctx.db.query("maintenanceState").withIndex("by_key", (q) => q.eq("key", "member_visit_summary_v1")).unique()).toMatchObject({ status: "completed" });
    });
  });
});
