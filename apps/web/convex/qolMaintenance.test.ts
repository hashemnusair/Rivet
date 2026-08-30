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
      expect(await ctx.db.query("maintenanceState").withIndex("by_key", (q) => q.eq("key", "customer_membership_identity_v1")).unique()).toMatchObject({ status: "completed", processedCount: 1 });
    });
  });
});
