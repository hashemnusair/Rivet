import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { organizationRole } from "./schema";

/**
 * Seeds the Forge Fitness demo tenant as real Convex records: the organization,
 * its two Amman branches, the four staff members and the two customers that the
 * frontend previously hard-coded.
 *
 * These users are created *unclaimed* — their `authSubject` is a placeholder
 * rather than a Clerk subject, because no Clerk account exists for them. The
 * first person to sign in with the matching email claims the record and inherits
 * its role (see `users.ensureCurrent`), which is how an invited staff member
 * joins in a real deployment.
 *
 * Internal on purpose: the deployment is public, so seeding is something the
 * owner runs from the Convex dashboard, not something the web app can trigger.
 * Running it twice is safe — every write is keyed and patched rather than
 * duplicated.
 */
export const seedDemoTenant = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // --- organization -------------------------------------------------------
    const slug = "forge-fitness";
    const organization: Doc<"organizations"> | null = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();

    let organizationId: Id<"organizations">;
    if (organization) {
      organizationId = organization._id;
      await ctx.db.patch(organizationId, { updatedAt: now });
    } else {
      organizationId = await ctx.db.insert("organizations", {
        name: "Forge Fitness Club",
        slug,
        status: "active",
        timezone: "Asia/Amman",
        currency: "JOD",
        createdAt: now,
        updatedAt: now,
      });
    }

    // --- branches -----------------------------------------------------------
    const branchSeeds = [
      { code: "ABD", name: "Forge — Abdoun", address: "Salah Al-Suheimat St 12, Abdoun" },
      { code: "SWF", name: "Forge — Sweifieh", address: "Ali Nasuh Al-Tahir St 7, Sweifieh" },
    ];

    const branchIds: Id<"branches">[] = [];
    for (const branch of branchSeeds) {
      const existing = await ctx.db
        .query("branches")
        .withIndex("by_organization_code", (q) => q.eq("organizationId", organizationId).eq("code", branch.code))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { name: branch.name, address: branch.address, updatedAt: now });
        branchIds.push(existing._id);
      } else {
        branchIds.push(
          await ctx.db.insert("branches", {
            organizationId,
            name: branch.name,
            code: branch.code,
            address: branch.address,
            active: true,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
    }
    const [abdoun] = branchIds as [Id<"branches">];

    // --- people -------------------------------------------------------------
    const staff = [
      { email: "omar@forgefitness.jo", fullName: "Omar Al-Khatib", role: "owner" as const, branches: branchIds },
      { email: "layla@forgefitness.jo", fullName: "Layla Haddad", role: "manager" as const, branches: branchIds },
      { email: "sara@forgefitness.jo", fullName: "Sara Abuhamdan", role: "sales" as const, branches: branchIds },
      { email: "hala@forgefitness.jo", fullName: "Hala Qasem", role: "receptionist" as const, branches: [abdoun] },
    ];

    // Customers hold no organization membership — that is what makes them
    // members rather than staff when they sign in.
    const customers = [
      { email: "lina@example.com", fullName: "Lina Haddad" },
      { email: "yousef@example.com", fullName: "Yousef Nasser" },
    ];

    const upsertUser = async (email: string, fullName: string) => {
      const existing = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { fullName, updatedAt: now });
        return existing._id;
      }
      return await ctx.db.insert("users", {
        // Claimed by whoever signs in with this email; never a real Clerk subject.
        authSubject: `invite:${email}`,
        email,
        fullName,
        platformAdmin: false,
        createdAt: now,
        updatedAt: now,
      });
    };

    for (const person of staff) {
      const userId = await upsertUser(person.email, person.fullName);
      const existing = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_user", (q) => q.eq("organizationId", organizationId).eq("userId", userId))
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, { role: person.role, branchIds: person.branches, active: true, updatedAt: now });
      } else {
        await ctx.db.insert("organizationMemberships", {
          organizationId,
          userId,
          role: person.role,
          branchIds: person.branches,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    for (const person of customers) await upsertUser(person.email, person.fullName);

    return {
      organizationId,
      branches: branchIds.length,
      staff: staff.length,
      customers: customers.length,
    };
  },
});

/**
 * Grants platform administration to a user by email. The owner runs this from
 * the Convex dashboard; it is deliberately unreachable from the web app, so a
 * public deployment cannot be used to escalate into the platform console.
 */
/**
 * Finds a user by email, or by Clerk subject when the JWT template omits the
 * email claim and the stored email is therefore blank.
 */
async function findUser(ctx: MutationCtx, args: { email?: string; authSubject?: string }) {
  if (args.authSubject) {
    const bySubject = await ctx.db
      .query("users")
      .withIndex("by_auth_subject", (q) => q.eq("authSubject", args.authSubject!))
      .unique();
    if (bySubject) return bySubject;
  }
  if (args.email) {
    const byEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email!))
      .unique();
    if (byEmail) return byEmail;
  }
  throw new Error(
    `No user matched ${JSON.stringify(args)}. Sign in once first, or seed the tenant. ` +
      "If the email is blank in the users table, add `email` and `name` claims to the Clerk JWT template for Convex.",
  );
}

/**
 * Grants platform administration. The owner runs this from the Convex dashboard
 * or CLI; it is deliberately unreachable from the web app, so a public
 * deployment cannot be used to escalate into the platform console.
 */
export const grantPlatformAdmin = internalMutation({
  args: { email: v.optional(v.string()), authSubject: v.optional(v.string()), platformAdmin: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await findUser(ctx, args);
    const platformAdmin = args.platformAdmin ?? true;
    await ctx.db.patch(user._id, { platformAdmin, updatedAt: Date.now() });
    return { email: user.email, authSubject: user.authSubject, platformAdmin };
  },
});

/**
 * Puts a user on a gym's staff, or changes the role they already hold. Also
 * dashboard-only, for the same reason.
 */
export const grantOrganizationRole = internalMutation({
  args: {
    email: v.optional(v.string()),
    authSubject: v.optional(v.string()),
    organizationSlug: v.string(),
    role: organizationRole,
    branchCodes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const user = await findUser(ctx, args);

    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.organizationSlug))
      .unique();
    if (!organization) throw new Error(`No organization with slug ${args.organizationSlug}.`);

    const allBranches = await ctx.db
      .query("branches")
      .withIndex("by_organization", (q) => q.eq("organizationId", organization._id))
      .collect();

    // No branch codes means every branch, which is what owners and managers get.
    const branchIds = args.branchCodes
      ? allBranches.filter((branch) => args.branchCodes!.includes(branch.code)).map((branch) => branch._id)
      : allBranches.map((branch) => branch._id);

    const now = Date.now();
    const existing = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { role: args.role, branchIds, active: true, updatedAt: now });
    } else {
      await ctx.db.insert("organizationMemberships", {
        organizationId: organization._id,
        userId: user._id,
        role: args.role,
        branchIds,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { email: user.email, organization: organization.name, role: args.role, branches: branchIds.length };
  },
});
