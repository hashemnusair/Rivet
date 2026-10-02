import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.{ts,js}");

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

});
