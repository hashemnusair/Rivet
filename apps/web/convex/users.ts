import { mutation, query } from "./_generated/server";

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
      .unique();
  },
});

export const ensureCurrent = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHENTICATED");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
      .unique();

    const now = Date.now();
    const email = identity.email ?? "";
    const fullName = identity.name ?? email.split("@")[0] ?? "RIVET user";

    if (existing) {
      await ctx.db.patch(existing._id, { email, fullName, updatedAt: now });
      return existing._id;
    }

    // A record may already exist for this email without a Clerk subject —
    // either seeded staff, or someone a gym added before they ever signed in.
    // Claiming it keeps the role and organization they were given, instead of
    // silently creating a second, member-only account under the same address.
    if (email) {
      const invited = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();

      if (invited && invited.authSubject.startsWith("invite:")) {
        await ctx.db.patch(invited._id, { authSubject: identity.subject, fullName, updatedAt: now });
        return invited._id;
      }
    }

    return await ctx.db.insert("users", {
      authSubject: identity.subject,
      email,
      fullName,
      platformAdmin: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});
