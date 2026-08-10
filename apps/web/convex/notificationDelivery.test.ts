import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

describe("operational notification triggers", () => {
  it("notifies active platform administrators once when a gym application is created", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", { publicId: "platform-active", authSubject: "clerk-platform-active", email: "active@example.com", fullName: "Active Admin", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("users", { publicId: "platform-disabled", authSubject: "clerk-platform-disabled", email: "disabled@example.com", fullName: "Disabled Admin", platformAdmin: true, status: "deactivated", createdAt: now, updatedAt: now });
    });

    const created = await t.mutation(internal.gymApplications.create, { gymName: "Notification Gym", ownerName: "Owner", email: "owner@example.com", contactNumber: "+962790000000", plan: "Growth" });
    await t.mutation(internal.gymApplications.create, { gymName: "Notification Gym", ownerName: "Owner", email: "owner@example.com", contactNumber: "+962790000000", plan: "Growth" });
    const notifications = await t.run(async (ctx) => await ctx.db.query("operationalNotifications").collect());
    expect(notifications).toEqual([expect.objectContaining({ kind: "application_awaiting_review", dedupeKey: `gym-application:${created.applicationId}`, href: expect.stringContaining("/platform/applications") })]);
  });

  it("notifies platform administrators when a provisioning attempt is recorded as failed", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", { publicId: "platform", authSubject: "clerk-platform", email: "platform@example.com", fullName: "Platform Admin", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("gymApplications", { publicId: "application-1", applicationKey: "owner@example.com::failure-gym", gymName: "Failure Gym", ownerName: "Owner", email: "owner@example.com", contactNumber: "+962790000000", plan: "Starter", status: "approved", notificationStatus: "sent", submittedAt: now, updatedAt: now });
    });
    const platform = t.withIdentity({ subject: "clerk-platform" });
    await platform.mutation(internal.platformProvisioning.fail, { applicationId: "application-1", message: "Deterministic Clerk fault", correlationId: "cor-provisioning-fault" });
    const state = await t.run(async (ctx) => ({
      notifications: await ctx.db.query("operationalNotifications").collect(),
      application: await ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", "application-1")).unique(),
    }));
    expect(state.application).toMatchObject({ provisioningStatus: "failed", provisioningError: "Deterministic Clerk fault" });
    expect(state.notifications).toEqual([expect.objectContaining({ kind: "provisioning_failure", body: expect.stringContaining("Deterministic Clerk fault") })]);
  });

  it("scopes failed staff invitation notifications to active gym supervisors", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", { publicId: "org-notify", name: "Notify Gym", slug: "notify-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
      const branchId = await ctx.db.insert("branches", { organizationId, publicId: "branch-notify", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
      const actorUserId = await ctx.db.insert("users", { publicId: "owner", authSubject: "clerk-owner", email: "owner@example.com", fullName: "Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      const managerUserId = await ctx.db.insert("users", { publicId: "manager", authSubject: "clerk-manager", email: "manager@example.com", fullName: "Manager", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      const invitedUserId = await ctx.db.insert("users", { publicId: "invited", authSubject: "invite:staff@example.com", email: "staff@example.com", fullName: "Invited Staff", platformAdmin: false, status: "invited", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId, userId: actorUserId, role: "owner", branchIds: [branchId], active: true, branchScope: "all", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId, userId: managerUserId, role: "manager", branchIds: [branchId], active: true, branchScope: "all", createdAt: now, updatedAt: now });
      const membershipId = await ctx.db.insert("organizationMemberships", { organizationId, userId: invitedUserId, role: "receptionist", branchIds: [branchId], active: true, branchScope: "selected", invitationStatus: "pending", createdAt: now, updatedAt: now });
      return { organizationId, actorUserId, membershipId };
    });
    await t.mutation(internal.invitations.markFailed, { membershipId: ids.membershipId, attemptedAt: Date.now(), message: "Clerk invitation failed with HTTP 503.", organizationId: ids.organizationId, actorUserId: ids.actorUserId, actorPublicId: "owner", actorName: "Owner", actorRole: "owner", userPublicId: "invited", userName: "Invited Staff", correlationId: "cor-invite-failure" });
    const notifications = await t.run(async (ctx) => await ctx.db.query("operationalNotifications").collect());
    expect(notifications).toHaveLength(2);
    expect(notifications.every((notification) => notification.organizationId === ids.organizationId && notification.kind === "staff_invitation_failure")).toBe(true);
  });
});
