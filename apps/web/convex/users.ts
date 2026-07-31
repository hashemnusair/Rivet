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
