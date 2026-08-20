import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";

export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
      .unique();

    // Keep inactive accounts from receiving a raw user projection. The
    // identity routing query applies the same boundary; this lower-level
    // endpoint must not become a way to recover a former role or status.
    if (!user || user.status === "invited" || user.status === "deactivated") return null;
    return user;
  },
});

export async function ensureUserRecord(ctx: MutationCtx, suppliedFullName?: string) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("UNAUTHENTICATED");

  const existing = await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", identity.subject))
    .unique();

  const now = Date.now();
  const email = (identity.email ?? "").trim().toLowerCase();
  const normalizedFullName = suppliedFullName?.trim().replace(/\s+/g, " ");
  if (normalizedFullName && normalizedFullName.length > 160) throw new Error("INVALID_PROFILE_NAME");
  const fullName = normalizedFullName || identity.name?.trim() || existing?.fullName || email.split("@")[0] || "RIVET user";

  if (existing) {
    if (existing.status === "deactivated") throw new Error("UNAUTHENTICATED");
    await ctx.db.patch(existing._id, { email, fullName, status: "active", updatedAt: now });
    return existing;
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
      return { ...invited, authSubject: identity.subject, fullName, status: "active" as const, updatedAt: now };
    }
  }

  const userId = await ctx.db.insert("users", {
    publicId: crypto.randomUUID(),
    authSubject: identity.subject,
    email,
    fullName,
    platformAdmin: false,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  return await ctx.db.get(userId);
}

export const ensureCurrent = mutation({
  args: { fullName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await ensureUserRecord(ctx, args.fullName);
    return user?._id;
  },
});
