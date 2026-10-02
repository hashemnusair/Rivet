import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

function subjectKind(subject: string): "invite" | "seed" | "clerk" | "other" {
  if (subject.startsWith("invite:")) return "invite";
  if (subject.startsWith("seed:")) return "seed";
  if (subject.startsWith("user_")) return "clerk";
  return "other";
}

/**
 * Secret-safe release diagnostic for a single account. This is internal-only
 * and intentionally omits document ids, auth subjects, contact details and
 * provider payloads.
 */
export const inspectGymAccessByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const users = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).collect();
    const applications = await ctx.db.query("gymApplications").withIndex("by_email", (q) => q.eq("email", email)).collect();

    const userStates = await Promise.all(users.map(async (user) => {
      const memberships = await ctx.db.query("organizationMemberships").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
      const membershipStates = await Promise.all(memberships.map(async (membership) => {
        const organization = await ctx.db.get(membership.organizationId);
        const branches = await Promise.all(membership.branchIds.map((branchId) => ctx.db.get(branchId)));
        return {
          role: membership.role,
          active: membership.active,
          invitationStatus: membership.invitationStatus ?? "legacy_accepted",
          clerkInvitationIdPresent: Boolean(membership.clerkInvitationId),
          clerkInvitationStatus: membership.clerkInvitationStatus ?? "not_recorded",
          branchScope: membership.branchScope ?? "legacy",
          assignedBranchCount: membership.branchIds.length,
          activeBranchCount: branches.filter((branch) => branch?.active).length,
          organization: organization ? {
            name: organization.name,
            slug: organization.slug,
            status: organization.status,
            publicIdPresent: Boolean(organization.publicId),
            plan: organization.subscriptionPlan ?? "not_recorded",
            archived: Boolean(organization.archivedAt),
            trialEndsAt: organization.trialEndsAt ?? null,
            currentPeriodEndsAt: organization.currentPeriodEndsAt ?? null,
            subscriptionStatusReason: organization.subscriptionStatusReason ?? null,
          } : null,
        };
      }));
      const profile = user.publicId
        ? await ctx.db.query("customerProfiles").withIndex("by_user_id", (q) => q.eq("userId", user.publicId!)).unique()
        : null;
      return {
        status: user.status ?? "legacy_active",
        platformAdmin: user.platformAdmin,
        publicIdPresent: Boolean(user.publicId),
        authSubjectKind: subjectKind(user.authSubject),
        customerProfilePresent: Boolean(profile),
        memberships: membershipStates,
      };
    }));

    return {
      normalizedEmailMatched: users.length > 0,
      userCount: users.length,
      users: userStates,
      applications: applications.map((application) => ({
        status: application.status,
        provisioningStatus: application.provisioningStatus ?? "not_started",
        provisioningCheckpoint: application.provisioningCheckpoint ?? "not_recorded",
        provisioningOutcome: application.provisioningOutcome ?? "not_recorded",
        clerkInvitationStatus: application.clerkInvitationStatus ?? "not_recorded",
        provisionedOrganizationIdPresent: Boolean(application.provisionedOrganizationId),
        provisionedBranchIdPresent: Boolean(application.provisionedBranchId),
      })),
    };
  },
});

const ROUTABLE_ORGANIZATION_STATUSES = new Set(["trial", "active", "past_due"]);

/**
 * Repairs a stale local owner invitation only when the approved application,
 * authenticated user, membership and provisioned organization all agree.
 * This is an internal release-maintenance action, not a browser mutation.
 */
export const repairApprovedOwnerMembership = internalMutation({
  args: { email: v.string(), organizationSlug: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const reason = args.reason.trim().replace(/\s+/g, " ");
    if (!email || reason.length < 10 || reason.length > 500) throw new Error("INVALID_REPAIR_REQUEST");

    const users = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).collect();
    const user = users[0];
    if (users.length !== 1 || !user) throw new Error("AMBIGUOUS_USER");
    if (user.status !== "active" || !user.publicId || subjectKind(user.authSubject) !== "clerk") throw new Error("USER_NOT_REPAIRABLE");

    const organization = await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", args.organizationSlug)).unique();
    if (!organization?.publicId || !ROUTABLE_ORGANIZATION_STATUSES.has(organization.status) || organization.archivedAt) {
      throw new Error("ORGANIZATION_NOT_REPAIRABLE");
    }

    const membership = await ctx.db.query("organizationMemberships")
      .withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", user._id))
      .unique();
    if (!membership || !membership.active || membership.role !== "owner") throw new Error("OWNER_MEMBERSHIP_NOT_REPAIRABLE");

    const applications = await ctx.db.query("gymApplications").withIndex("by_email", (q) => q.eq("email", email)).collect();
    const application = applications.find((row) => row.status === "approved"
      && row.provisioningStatus === "completed"
      && row.provisionedOrganizationId === organization.publicId);
    if (!application) throw new Error("APPROVED_PROVISIONING_BINDING_NOT_FOUND");

    const priorAudits = await ctx.db.query("platformAuditEvents")
      .withIndex("by_entity", (q) => q.eq("entityType", "organization").eq("entityPublicId", organization.publicId!))
      .collect();
    const existingAudit = priorAudits.find((event) => event.action === "gym.owner_access.repaired" && event.correlationId === `owner-access-repair:${organization.publicId}:${user.publicId}`);
    if (membership.invitationStatus === "accepted") {
      return { repaired: false, alreadyAccepted: true, audited: Boolean(existingAudit), organizationSlug: organization.slug };
    }
    if (membership.invitationStatus !== "pending") throw new Error("OWNER_INVITATION_NOT_PENDING");

    const now = Date.now();
    await ctx.db.patch(membership._id, { invitationStatus: "accepted", invitationError: undefined, updatedAt: now });
    if (!existingAudit) {
      await ctx.db.insert("platformAuditEvents", {
        publicId: crypto.randomUUID(),
        actorPublicId: "system:release-maintenance",
        actorName: "RIVET release maintenance",
        action: "gym.owner_access.repaired",
        entityType: "organization",
        entityPublicId: organization.publicId,
        entityLabel: organization.name,
        summary: "Repaired an approved owner's stale local invitation state",
        reason,
        before: { membershipActive: membership.active, invitationStatus: membership.invitationStatus, role: membership.role },
        after: { membershipActive: true, invitationStatus: "accepted", role: "owner" },
        correlationId: `owner-access-repair:${organization.publicId}:${user.publicId}`,
        occurredAt: now,
      });
    }

    return { repaired: true, alreadyAccepted: false, audited: true, organizationSlug: organization.slug };
  },
});
