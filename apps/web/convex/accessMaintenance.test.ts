import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

describe("release access maintenance diagnostic", () => {
  it("returns bounded gym access state without sensitive identifiers", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      const organization = await ctx.db.insert("organizations", { publicId: "maintenance-org", name: "Maintenance Gym", slug: "maintenance-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
      const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "maintenance-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
      const user = await ctx.db.insert("users", { publicId: "maintenance-user", authSubject: "user_maintenance", email: " Gym@Example.com ".trim().toLowerCase(), fullName: "Gym Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: user, role: "owner", branchIds: [branch], branchScope: "all", active: true, invitationStatus: "pending", clerkInvitationId: "clerk-invite-secret", clerkInvitationStatus: "pending", createdAt: now, updatedAt: now });
      await ctx.db.insert("customerProfiles", { publicId: "maintenance-customer", userId: "maintenance-user", name: "Gym Owner", nameAr: "مالك", email: "gym@example.com", phone: "+962790000000", initials: "GO", context: "RIVET member", createdAt: now, updatedAt: now });
      await ctx.db.insert("gymApplications", { publicId: "maintenance-application", applicationKey: "gym@example.com::maintenance", gymName: "Maintenance Gym", ownerName: "Gym Owner", email: "gym@example.com", contactNumber: "+962790000000", plan: "Pro", status: "approved", notificationStatus: "sent", provisioningStatus: "completed", provisioningOutcome: "complete", provisionedOrganizationId: "maintenance-org", clerkInvitationStatus: "accepted", submittedAt: now, updatedAt: now });
    });

    const result = await t.query(internal.accessMaintenance.inspectGymAccessByEmail, { email: "  GYM@EXAMPLE.COM " });
    expect(result).toMatchObject({ normalizedEmailMatched: true, userCount: 1, users: [{ status: "active", platformAdmin: false, publicIdPresent: true, authSubjectKind: "clerk", customerProfilePresent: true, memberships: [{ role: "owner", active: true, invitationStatus: "pending", clerkInvitationIdPresent: true, clerkInvitationStatus: "pending", branchScope: "all", assignedBranchCount: 1, activeBranchCount: 1, organization: { name: "Maintenance Gym", slug: "maintenance-gym", status: "active", publicIdPresent: true } }] }], applications: [{ provisioningStatus: "completed", provisioningOutcome: "complete", clerkInvitationStatus: "accepted", provisionedOrganizationIdPresent: true }] });
    expect(JSON.stringify(result)).not.toContain("user_maintenance");
    expect(JSON.stringify(result)).not.toContain("clerk-invite-secret");
    expect(JSON.stringify(result)).not.toContain("maintenance-user");

    const repaired = await t.mutation(internal.accessMaintenance.repairApprovedOwnerMembership, {
      email: "gym@example.com",
      organizationSlug: "maintenance-gym",
      reason: "Repair approved owner access after a stale provisioning invitation state.",
    });
    expect(repaired).toEqual({ repaired: true, alreadyAccepted: false, audited: true, organizationSlug: "maintenance-gym" });

    const replay = await t.mutation(internal.accessMaintenance.repairApprovedOwnerMembership, {
      email: "gym@example.com",
      organizationSlug: "maintenance-gym",
      reason: "Idempotent replay of the same approved owner access repair.",
    });
    expect(replay).toEqual({ repaired: false, alreadyAccepted: true, audited: true, organizationSlug: "maintenance-gym" });

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", "maintenance-gym")).unique();
      const audits = await ctx.db.query("platformAuditEvents").withIndex("by_entity", (q) => q.eq("entityType", "organization").eq("entityPublicId", organization!.publicId!)).collect();
      expect(audits.filter((event) => event.action === "gym.owner_access.repaired")).toHaveLength(1);
      expect(audits[0]).toMatchObject({ actorPublicId: "system:release-maintenance", reason: expect.stringContaining("stale provisioning") });
    });
  });

  it("does not reveal anything for an unknown email", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(internal.accessMaintenance.inspectGymAccessByEmail, { email: "missing@example.com" })).resolves.toEqual({ normalizedEmailMatched: false, userCount: 0, users: [], applications: [] });
  });
});
