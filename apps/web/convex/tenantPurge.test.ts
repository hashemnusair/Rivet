import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { convexTest, type TestConvex } from "convex-test";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { PURGE_ACKNOWLEDGEMENT, RESIDUE_ACKNOWLEDGEMENT, TENANT_TABLES, invitationPointsAtOrganization } from "./tenantPurge";

/**
 * The guarded tenant purge: every organization-scoped table is covered, a
 * purge removes exactly one gym (rows, files, linked applications, the
 * organization row) and leaves the other gym alone, the guards refuse
 * anything but the exact confirmation, Clerk cleanup is explicit, and the
 * residue flow deletes only the orphan accounts and applications it is
 * handed after re-checking each one.
 */

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
type Harness = TestConvex<typeof schema>;
/* eslint-disable @typescript-eslint/no-explicit-any */
type SchemaTable = { validator: { fields?: Record<string, unknown> }; indexes: Array<{ indexDescriptor: string; fields: string[] }> };

async function rowsFor(t: Harness, table: string, organizationId: Id<"organizations">): Promise<number> {
  return await t.run(async (ctx) => (await (ctx.db as any).query(table).filter((q: any) => q.eq(q.field("organizationId"), organizationId)).collect()).length);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const PURGE_ARGS = { slug: "forge-fitness", confirmName: "Forge Fitness Club", reason: "Retiring the test gym before launch", acknowledge: PURGE_ACKNOWLEDGEMENT, clerk: "keep" as const };

async function seedTwoGyms() {
  const t = convexTest(schema, modules);
  await t.mutation(internal.seed.seedDemoTenant, {});
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const forge = await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", "forge-fitness")).unique();
    if (!forge?.publicId) throw new Error("The demo tenant seed did not create forge-fitness");
    const forgeBranch = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", forge._id)).first();
    const forgeMemberships = await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", forge._id)).collect();
    const forgeOwnerId = forgeMemberships[0]!.userId;
    if (!forgeBranch) throw new Error("The demo tenant seed created no branch");
    const audit = (organizationId: Id<"organizations">, actorUserId: Id<"users">, publicId: string) => ctx.db.insert("auditEvents", { organizationId, publicId, actorUserId, actorPublicId: "owner", actorName: "Owner", actorRole: "owner", category: "membership", action: "membership.sale", entityType: "membership", entityPublicId: "m-1", entityLabel: "Membership", summary: "Sold a membership", correlationId: `cor-${publicId}`, occurredAt: now });
    for (const key of ["a", "b", "c"]) await audit(forge._id, forgeOwnerId, `forge-audit-${key}`);
    const storageId = await ctx.storage.store(new NodeBlob(["logo"], { type: "image/png" }) as unknown as Blob);
    await ctx.db.insert("mediaAssets", { organizationId: forge._id, publicId: "forge-media", ownerType: "gym_logo", ownerPublicId: forge.publicId, storageId, contentType: "image/png", sizeBytes: 4, visibility: "public", status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("operationalNotifications", { publicId: "forge-note", recipientUserId: forgeOwnerId, organizationId: forge._id, kind: "shift_variance", title: "Variance", body: "Review the drawer", href: "/finance", dedupeKey: "forge-note", createdAt: now });
    await ctx.db.insert("userOnboardingProgress", { userId: forgeOwnerId, organizationId: forge._id, audience: "owner", version: 1, completedStepKeys: [], createdAt: now, updatedAt: now });
    const profile = await ctx.db.insert("ptTrainerProfiles", { organizationId: forge._id, publicId: "forge-trainer", userId: forgeOwnerId, displayName: "Coach", specialties: ["Strength"], languages: ["en"], branchIds: [forgeBranch._id], status: "published", createdAt: now, updatedAt: now });
    await ctx.db.insert("ptAvailabilityRules", { organizationId: forge._id, publicId: "forge-rule", trainerProfileId: profile, branchId: forgeBranch._id, weekday: "mon", startMinute: 540, endMinute: 720, active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("idempotencyRecords", { organizationId: forge._id, operation: "sale", key: "sale-1", requestHash: "hash", result: { ok: true }, createdAt: now });
    await ctx.db.insert("gymApplications", { publicId: "app-forge", applicationKey: "key-forge", gymName: "Forge Fitness", ownerName: "Forge Owner", email: "owner@forge.example", contactNumber: "0790000000", plan: "Growth", status: "approved", notificationStatus: "sent", submittedAt: now, updatedAt: now, provisioningStatus: "completed", provisionedOrganizationId: forge.publicId });
    await ctx.db.insert("gymApplications", { publicId: "app-pending", applicationKey: "key-pending", gymName: "Someone Else", ownerName: "Nobody", email: "nobody@example.com", contactNumber: "0790000001", plan: "Starter", status: "pending", notificationStatus: "sent", submittedAt: now, updatedAt: now });

    const other = await ctx.db.insert("organizations", { publicId: "other-org", name: "Other Gym", slug: "other-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", clerkOrganizationId: "org_other123", createdAt: now, updatedAt: now });
    const otherBranch = await ctx.db.insert("branches", { organizationId: other, publicId: "other-branch", name: "Main", code: "MAIN", active: true, createdAt: now, updatedAt: now });
    const otherOwner = await ctx.db.insert("users", { publicId: "other-owner", authSubject: "user_other_owner", email: "owner@other.example", fullName: "Other Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: other, userId: otherOwner, role: "owner", branchIds: [otherBranch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: other, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: {} });
    await audit(other, otherOwner, "other-audit");
    await ctx.db.insert("operationalNotifications", { publicId: "other-note", recipientUserId: otherOwner, organizationId: other, kind: "shift_variance", title: "Variance", body: "Review the drawer", href: "/finance", dedupeKey: "other-note", createdAt: now });
    await ctx.db.insert("users", { publicId: "platform-admin", authSubject: "user_platform_admin", email: "admin@rivet.example", fullName: "Platform Admin", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });

    const forgeUserIds = new Set<string>(forgeMemberships.map((membership) => String(membership.userId)));
    const forgeUsers = (await ctx.db.query("users").collect()).filter((user) => forgeUserIds.has(String(user._id)) || user.authSubject.startsWith("seed:"));
    return { forgeId: forge._id, forgePublicId: forge.publicId, storageId, otherId: other, forgeUserPublicIds: forgeUsers.map((user) => user.publicId ?? String(user._id)) };
  });
  return { t, ...ids };
}

describe("tenant purge", () => {
  const savedSecret = process.env.CLERK_SECRET_KEY;
  beforeEach(() => { delete process.env.CLERK_SECRET_KEY; });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedSecret === undefined) delete process.env.CLERK_SECRET_KEY;
    else process.env.CLERK_SECRET_KEY = savedSecret;
  });

  it("names every table that carries an organizationId, through an organization-first index or an explicit scan", () => {
    const tables = schema.tables as unknown as Record<string, SchemaTable>;
    const scoped = Object.entries(tables).filter(([, table]) => Boolean(table.validator.fields && "organizationId" in table.validator.fields)).map(([name]) => name).sort();
    expect(scoped).toEqual(TENANT_TABLES.map((entry) => entry.table).sort());
    for (const entry of TENANT_TABLES) {
      const table = tables[entry.table]!;
      const organizationFirst = table.indexes.filter((index) => index.fields[0] === "organizationId");
      if (entry.scan) {
        expect(organizationFirst, `${entry.table} has an organization-first index and should use it`).toEqual([]);
      } else {
        expect(table.indexes.find((index) => index.indexDescriptor === entry.index)?.fields[0], `${entry.table}.${entry.index}`).toBe("organizationId");
      }
      if (entry.storage) expect("storageId" in (table.validator.fields ?? {})).toBe(true);
    }
  });

  it("inventories a tenant without changing anything", async () => {
    const { t, forgeId } = await seedTwoGyms();
    const before = await rowsFor(t, "branches", forgeId);
    const inventory = await t.action(internal.tenantPurge.inventory, { slug: "forge-fitness", batch: 2 });
    if (!inventory.found) throw new Error("expected the seeded tenant");
    expect(inventory.organization).toMatchObject({ slug: "forge-fitness", name: "Forge Fitness Club", clerkOrganizationId: null });
    expect(inventory.tables).toMatchObject({ branches: before, auditEvents: 3, mediaAssets: 1, operationalNotifications: 1, userOnboardingProgress: 1, ptAvailabilityRules: 1, idempotencyRecords: 1, organizationMemberships: expect.any(Number) });
    expect(inventory.rows).toBe(Object.values(inventory.tables).reduce((sum, count) => sum + count, 0));
    expect(inventory.linkedApplications).toEqual([{ publicId: "app-forge", gymName: "Forge Fitness", status: "approved" }]);
    expect(await rowsFor(t, "branches", forgeId)).toBe(before);
    expect(await rowsFor(t, "auditEvents", forgeId)).toBe(3);
    expect(await t.run(async (ctx) => await ctx.db.get(forgeId))).not.toBeNull();
    expect(await t.action(internal.tenantPurge.inventory, { slug: "no-such-gym" })).toEqual({ found: false, slug: "no-such-gym" });
  });

  it("removes one gym completely, in small pages, and leaves the other gym, its files and the platform trail alone", async () => {
    const { t, forgeId, forgePublicId, storageId, otherId } = await seedTwoGyms();
    const otherBefore = { branches: await rowsFor(t, "branches", otherId), memberships: await rowsFor(t, "organizationMemberships", otherId), records: await rowsFor(t, "domainRecords", otherId), audits: await rowsFor(t, "auditEvents", otherId), notes: await rowsFor(t, "operationalNotifications", otherId) };
    const inventory = await t.action(internal.tenantPurge.inventory, { slug: "forge-fitness" });

    const result = await t.action(internal.tenantPurge.purge, { ...PURGE_ARGS, batch: 2 });

    expect(result.organization).toEqual({ publicId: forgePublicId, name: "Forge Fitness Club", slug: "forge-fitness" });
    expect(result.tables).toEqual(inventory.found ? inventory.tables : {});
    expect(result.rows).toBeGreaterThan(10);
    expect(result.storageFiles).toBe(1);
    expect(result.applicationsDeleted).toBe(1);
    expect(result.clerk).toBe("kept (clerk: keep)");
    for (const entry of TENANT_TABLES) expect(await rowsFor(t, entry.table, forgeId), entry.table).toBe(0);
    await t.run(async (ctx) => {
      expect(await ctx.db.get(forgeId)).toBeNull();
      expect(await ctx.storage.getUrl(storageId)).toBeNull();
      expect(await ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", "app-forge")).unique()).toBeNull();
      expect(await ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", "app-pending")).unique()).not.toBeNull();
      expect(await ctx.db.get(otherId)).not.toBeNull();
      const trail = (await ctx.db.query("platformAuditEvents").withIndex("by_entity", (q) => q.eq("entityType", "organization").eq("entityPublicId", forgePublicId)).collect()).sort((a, b) => a.occurredAt - b.occurredAt);
      expect(trail.map((event) => event.action)).toEqual(["organization.purge.started", "organization.purge.completed", "organization.purge.clerk"]);
      expect(trail[0]).toMatchObject({ reason: PURGE_ARGS.reason, actorPublicId: "system:tenant-purge", correlationId: result.correlationId });
      expect(trail[1]?.after).toMatchObject({ tables: result.tables, storageFiles: 1, linkedApplications: ["app-forge"] });
    });
    expect({ branches: await rowsFor(t, "branches", otherId), memberships: await rowsFor(t, "organizationMemberships", otherId), records: await rowsFor(t, "domainRecords", otherId), audits: await rowsFor(t, "auditEvents", otherId), notes: await rowsFor(t, "operationalNotifications", otherId) }).toEqual(otherBefore);
    await expect(t.action(internal.tenantPurge.purge, PURGE_ARGS)).rejects.toThrow(/No organization has the slug "forge-fitness"/);
  });

  it("refuses anything but the exact name, acknowledgement and a written reason, and touches nothing when it refuses", async () => {
    const { t, forgeId } = await seedTwoGyms();
    const before = await rowsFor(t, "branches", forgeId);
    await expect(t.action(internal.tenantPurge.purge, { ...PURGE_ARGS, confirmName: "Forge Fitness" })).rejects.toThrow(/confirmName must be exactly "Forge Fitness Club"/);
    await expect(t.action(internal.tenantPurge.purge, { ...PURGE_ARGS, acknowledge: "yes" })).rejects.toThrow(/acknowledge must be exactly/);
    await expect(t.action(internal.tenantPurge.purge, { ...PURGE_ARGS, reason: "test" })).rejects.toThrow(/reason must explain/);
    await expect(t.action(internal.tenantPurge.purge, { ...PURGE_ARGS, slug: "other" })).rejects.toThrow(/No organization has the slug "other"/);
    expect(await rowsFor(t, "branches", forgeId)).toBe(before);
    expect(await t.run(async (ctx) => await ctx.db.query("platformAuditEvents").collect())).toEqual([]);
  });

  it("lists the accounts and applications a purge leaves behind and deletes only the ones it is handed, re-checking each", async () => {
    const { t, forgeUserPublicIds } = await seedTwoGyms();
    expect(forgeUserPublicIds.length).toBeGreaterThan(1);
    await t.action(internal.tenantPurge.purge, PURGE_ARGS);

    const residue = await t.query(internal.tenantPurge.listResidue, {});
    expect(residue.organizations).toEqual([{ slug: "other-gym", name: "Other Gym", status: "active" }]);
    expect(residue.platformAdmins).toBe(1);
    expect(residue.attachedAccounts).toBe(1);
    expect(residue.orphanAccounts.map((account) => account.publicId).sort()).toEqual([...forgeUserPublicIds].sort());
    for (const account of residue.orphanAccounts) {
      expect(account.email).toMatch(/^.\*\*\*@/);
      expect(account.auth).toBe("placeholder");
    }
    expect(residue.applications).toEqual([expect.objectContaining({ publicId: "app-pending", status: "pending", provisionedOrganizationId: null })]);

    const customerUser = await t.run(async (ctx) => {
      const profile = (await ctx.db.query("customerProfiles").collect()).find((row) => forgeUserPublicIds.includes(row.userId));
      return profile?.userId;
    });
    if (!customerUser) throw new Error("the demo seed should create a customer profile");
    await expect(t.action(internal.tenantPurge.deleteResidue, { userPublicIds: [customerUser], applicationPublicIds: [], reason: "Fresh start before launch", acknowledge: "sure", clerk: "keep" })).rejects.toThrow(/acknowledge must be exactly/);

    const outcome = await t.action(internal.tenantPurge.deleteResidue, { userPublicIds: [customerUser, "other-owner", "platform-admin", "missing-user"], applicationPublicIds: ["app-pending", "missing-app"], reason: "Fresh start before launch", acknowledge: RESIDUE_ACKNOWLEDGEMENT, clerk: "delete" });
    expect(outcome.accounts).toEqual([
      { publicId: customerUser, result: expect.stringMatching(/^deleted \(.\*\*\*@.+\); no Clerk user \(placeholder account\)$/) },
      { publicId: "other-owner", result: "skipped: still a member of a gym workspace" },
      { publicId: "platform-admin", result: "skipped: platform administrator" },
      { publicId: "missing-user", result: "skipped: not found" },
    ]);
    expect(outcome.applications).toEqual([
      { publicId: "app-pending", result: "deleted (Someone Else)" },
      { publicId: "missing-app", result: "skipped: not found" },
    ]);
    await t.run(async (ctx) => {
      expect(await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", customerUser)).unique()).toBeNull();
      expect(await ctx.db.query("customerProfiles").withIndex("by_user_id", (q) => q.eq("userId", customerUser)).collect()).toEqual([]);
      expect(await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", "other-owner")).unique()).not.toBeNull();
      expect(await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", "platform-admin")).unique()).not.toBeNull();
      expect(await ctx.db.query("gymApplications").collect()).toEqual([]);
      const events = await ctx.db.query("platformAuditEvents").collect();
      expect(events.find((event) => event.action === "platform.residue.deleted")).toMatchObject({ reason: "Fresh start before launch", summary: "Deleted 1 orphan accounts and 1 applications" });
    });
    const after = await t.query(internal.tenantPurge.listResidue, {});
    expect(after.orphanAccounts.map((account) => account.publicId)).not.toContain(customerUser);
    expect(after.orphanAccounts).toHaveLength(forgeUserPublicIds.length - 1);
  });

  it("deletes the Clerk organization and revokes only the pending invitations that pointed at it, after the Convex rows are gone", async () => {
    const { t, otherId } = await seedTwoGyms();
    process.env.CLERK_SECRET_KEY = "test-secret-value";
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET" });
      if (url.includes("/v1/invitations?")) return new Response(JSON.stringify({ data: [
        { id: "inv_mine", status: "pending", public_metadata: { rivetOrganizationId: "other-org" } },
        { id: "inv_theirs", status: "pending", public_metadata: { rivetOrganizationId: "someone-else" } },
        { id: "inv_accepted", status: "accepted", public_metadata: { rivetOrganizationId: "other-org" } },
      ] }), { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ id: "x", deleted: true }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));

    const result = await t.action(internal.tenantPurge.purge, { slug: "other-gym", confirmName: "Other Gym", reason: "Retiring the second test gym", acknowledge: PURGE_ACKNOWLEDGEMENT, clerk: "delete" });

    expect(result.clerk).toBe("completed");
    expect(calls).toEqual([
      { url: "https://api.clerk.com/v1/organizations/org_other123", method: "DELETE" },
      { url: "https://api.clerk.com/v1/invitations?status=pending&limit=500", method: "GET" },
      { url: "https://api.clerk.com/v1/invitations/inv_mine/revoke", method: "POST" },
    ]);
    expect(await t.run(async (ctx) => await ctx.db.get(otherId))).toBeNull();
    const clerkEvent = await t.run(async (ctx) => (await ctx.db.query("platformAuditEvents").collect()).find((event) => event.action === "organization.purge.clerk"));
    expect(clerkEvent).toMatchObject({ summary: "Clerk cleanup for Other Gym: completed", after: { organizationDeleted: true, organizationStatus: 200, invitationsRevoked: 1, invitationRevokeFailures: 0 } });
  });

  it("reports a Clerk failure instead of hiding it, and skips Clerk when no secret is configured", async () => {
    const failing = await seedTwoGyms();
    process.env.CLERK_SECRET_KEY = "test-secret-value";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: "boom" }] }), { status: 500, headers: { "Content-Type": "application/json" } })));
    const failed = await failing.t.action(internal.tenantPurge.purge, { slug: "other-gym", confirmName: "Other Gym", reason: "Retiring the second test gym", acknowledge: PURGE_ACKNOWLEDGEMENT, clerk: "delete" });
    expect(failed.clerk).toBe("failed: Clerk organization delete returned HTTP 500");
    expect(await failing.t.run(async (ctx) => await ctx.db.get(failing.otherId))).toBeNull();

    const bare = await seedTwoGyms();
    delete process.env.CLERK_SECRET_KEY;
    const skipped = await bare.t.action(internal.tenantPurge.purge, { slug: "other-gym", confirmName: "Other Gym", reason: "Retiring the second test gym", acknowledge: PURGE_ACKNOWLEDGEMENT, clerk: "delete" });
    expect(skipped.clerk).toBe("skipped: CLERK_SECRET_KEY is not configured on this deployment");
  });

  it("matches pending invitations to an organization by RIVET's own metadata only", () => {
    expect(invitationPointsAtOrganization({ status: "pending", public_metadata: { rivetOrganizationId: "org-1" } }, "org-1")).toBe(true);
    expect(invitationPointsAtOrganization({ status: "pending", publicMetadata: { rivetOrganizationPublicId: "org-1" } }, "org-1")).toBe(true);
    expect(invitationPointsAtOrganization({ status: "accepted", public_metadata: { rivetOrganizationId: "org-1" } }, "org-1")).toBe(false);
    expect(invitationPointsAtOrganization({ status: "pending", public_metadata: { rivetOrganizationId: "org-2" } }, "org-1")).toBe(false);
    expect(invitationPointsAtOrganization({ status: "pending" }, "org-1")).toBe(false);
    expect(invitationPointsAtOrganization({ status: "pending", public_metadata: { rivetOrganizationId: "" } }, "")).toBe(false);
  });
});
