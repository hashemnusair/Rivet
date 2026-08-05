import { v } from "convex/values";
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
  args: { fullName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("UNAUTHENTICATED");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
      .unique();

    const now = Date.now();
    const email = (identity.email ?? "").trim().toLowerCase();
    const suppliedFullName = args.fullName?.trim().replace(/\s+/g, " ");
    if (suppliedFullName && suppliedFullName.length > 160) throw new Error("INVALID_PROFILE_NAME");
    const fullName = suppliedFullName || identity.name?.trim() || existing?.fullName || email.split("@")[0] || "RIVET user";

    if (existing) {
      if (existing.status === "deactivated") throw new Error("UNAUTHENTICATED");
      await ctx.db.patch(existing._id, { email, fullName, status: "active", updatedAt: now });
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
        if (invited.status === "deactivated") throw new Error("UNAUTHENTICATED");
        await ctx.db.patch(invited._id, { authSubject: identity.subject, fullName, status: "active", updatedAt: now });
        return invited._id;
      }
    }

    return await ctx.db.insert("users", {
      publicId: crypto.randomUUID(),
      authSubject: identity.subject,
      email,
      fullName,
      platformAdmin: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  },
});
