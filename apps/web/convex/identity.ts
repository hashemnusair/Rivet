import { query } from "./_generated/server";
import { toFrontendRole } from "./permissions";
import { membershipInvitationAccepted } from "./security";

const ROUTABLE_ORGANIZATION_STATUSES: readonly string[] = ["trial", "active", "past_due"];

type IdentityMembership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationStatus: string;
  role: string;
  branches: Array<{ id: string; name: string; code: string }>;
};

/**
 * Everything the frontend needs to route a signed-in person to the right place:
 * who they are, whether they administer the platform, and which gyms they work
 * for in what role.
 *
 * Returns `null` when unauthenticated, and a user with no memberships when the
 * person is simply a gym member — that absence is the signal, not an error.
 */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const auth = await ctx.auth.getUserIdentity();
    if (!auth) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", auth.subject))
      .unique();

    // Authenticated but not yet written to the users table — the client's
    // `ensureCurrent` mutation is still in flight on a first-ever sign-in.
    if (!user) {
      return {
        pending: true as const,
        user: null,
        memberships: [],
      };
    }

    // Keep deactivated accounts from learning their former role or tenant
    // memberships through this routing projection. The operation guards still
    // enforce this server-side, but identity.current must not advertise access
    // that requireAuthenticated will reject.
    if (user.status === "deactivated" || user.status === "invited") return null;

    const rows = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Routing identifiers are public application ids. Never turn a missing
    // legacy public id into a browser-visible Convex document id.
    if (!user.publicId) return null;

    const memberships: IdentityMembership[] = [];
    let gymAccessUnavailable = false;
    for (const row of rows) {
      // An active database row is not enough to route a user. Invitation
      // delivery failures, pending tickets, and revoked invitations retain
      // their rows for audit/history but must not become workspace access.
      if (!row.active || !membershipInvitationAccepted(row)) continue;
      const organization = await ctx.db.get(row.organizationId);
      // A staff membership is not enough to route into a workspace: the
      // tenant itself must still be operational. Suspended/cancelled gyms
      // remain in storage for history and billing, but must disappear from
      // the identity projection so the client cannot advertise a dead route.
      if (!organization || !organization.publicId || !ROUTABLE_ORGANIZATION_STATUSES.includes(organization.status)) {
        gymAccessUnavailable = true;
        continue;
      }

      const branches = [];
      for (const branchId of row.branchIds) {
        const branch = await ctx.db.get(branchId);
        if (branch?.active && branch.publicId) branches.push({ id: branch.publicId, name: branch.name, code: branch.code });
      }

      memberships.push({
        organizationId: organization.publicId,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        organizationStatus: organization.status,
        role: toFrontendRole(row.role),
        branches,
      });
    }

    memberships.sort((left, right) => left.organizationId.localeCompare(right.organizationId));

    return {
      pending: false as const,
      user: {
        id: user.publicId,
        email: user.email,
        fullName: user.fullName,
        platformAdmin: user.platformAdmin,
      },
      gymAccessUnavailable,
      // The UI must render an explicit organization chooser when this is true;
      // callers must never select memberships by array order.
      organizationSelectionRequired: memberships.length > 1,
      memberships,
    };
  },
});
