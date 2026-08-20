import { query } from "./_generated/server";
import { toFrontendRole } from "./permissions";

const ROUTABLE_ORGANIZATION_STATUSES: readonly string[] = ["trial", "active", "past_due"];

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

    const memberships = [];
    for (const row of rows) {
      if (!row.active) continue;
      const organization = await ctx.db.get(row.organizationId);
      // A staff membership is not enough to route into a workspace: the
      // tenant itself must still be operational. Suspended/cancelled gyms
      // remain in storage for history and billing, but must disappear from
      // the identity projection so the client cannot advertise a dead route.
      if (!organization || !ROUTABLE_ORGANIZATION_STATUSES.includes(organization.status)) continue;

      const branches = [];
      for (const branchId of row.branchIds) {
        const branch = await ctx.db.get(branchId);
        if (branch?.active) branches.push({ id: branch.publicId ?? branch._id, name: branch.name, code: branch.code });
      }

      memberships.push({
        organizationId: organization.publicId ?? organization._id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        organizationStatus: organization.status,
        role: toFrontendRole(row.role),
        branches,
      });
    }

    return {
      pending: false as const,
      user: {
        id: user.publicId ?? user._id,
        email: user.email,
        fullName: user.fullName,
        platformAdmin: user.platformAdmin,
      },
      memberships,
    };
  },
});
