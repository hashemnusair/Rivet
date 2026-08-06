import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { DEFAULT_ROLE_DEFINITIONS } from "./permissions";
import { ensureUserRecord } from "./users";

const planConfig = {
  Starter: { priceMinor: 79_000, branches: 1, staff: 8, members: 500 },
  Growth: { priceMinor: 149_000, branches: 3, staff: 25, members: 2_500 },
  Pro: { priceMinor: 249_000, branches: 8, staff: 80, members: 10_000 },
} as const;

function clean(value: string, label: string, maxLength: number): string {
  const result = value.trim().replace(/\s+/g, " ");
  if (result.length < 2 || result.length > maxLength) throw new Error(`INVALID_${label.toUpperCase()}`);
  return result;
}

function slugBase(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || `gym-${crypto.randomUUID().slice(0, 8)}`;
}

async function availableSlug(ctx: Parameters<typeof ensureUserRecord>[0], base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while (await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", candidate)).unique()) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * Creates the first real gym workspace for an authenticated owner. Clerk owns
 * the credentials; this mutation owns the tenant, branch, role, defaults and
 * trial subscription. Repeating the request for the same owner is idempotent.
 */
export const createGym = mutation({
  args: {
    gymName: v.string(),
    city: v.string(),
    branchName: v.string(),
    ownerFullName: v.string(),
    ownerPhone: v.optional(v.string()),
    plan: v.union(v.literal("Starter"), v.literal("Growth"), v.literal("Pro")),
    currentActiveMembers: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const gymName = clean(args.gymName, "gym_name", 120);
    const city = clean(args.city, "city", 80);
    const branchName = clean(args.branchName || `${gymName} — Main branch`, "branch_name", 120);
    const ownerFullName = clean(args.ownerFullName, "owner_name", 160);
    const ownerPhone = args.ownerPhone?.trim().slice(0, 40) || undefined;
    const currentActiveMembers = args.currentActiveMembers === undefined ? undefined : Math.max(0, Math.floor(args.currentActiveMembers));
    const config = planConfig[args.plan];
    const user = await ensureUserRecord(ctx, ownerFullName);
    if (!user) throw new Error("UNAUTHENTICATED");

    const existingMemberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const existingOwner = existingMemberships.find((membership) => membership.active && membership.role === "owner");
    if (existingOwner) {
      const organization = await ctx.db.get(existingOwner.organizationId);
      const existingBranchId = existingOwner.branchIds[0];
      const branch = existingBranchId ? await ctx.db.get(existingBranchId) : null;
      if (organization && branch) {
        const subscription = await ctx.db
          .query("domainRecords")
          .withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "platformSubscription"))
          .first();
        const trialEndsAt = typeof subscription?.data?.trialEndsAt === "string" ? subscription.data.trialEndsAt : new Date(Date.now() + 14 * 86_400_000).toISOString();
        return {
          organizationId: organization.publicId ?? organization._id,
          organizationSlug: organization.slug,
          organizationName: organization.name,
          branchId: branch.publicId ?? branch._id,
          branchName: branch.name,
          plan: typeof subscription?.data?.plan === "string" ? subscription.data.plan : args.plan,
          trialEndsAt,
        };
      }
    }

    const now = Date.now();
    const organizationPublicId = crypto.randomUUID();
    const slug = await availableSlug(ctx, slugBase(gymName));
    const branchPublicId = crypto.randomUUID();
    const organizationId = await ctx.db.insert("organizations", {
      publicId: organizationPublicId,
      name: gymName,
      slug,
      status: "trial",
      timezone: "Asia/Amman",
      currency: "JOD",
      locale: "en-JO",
      defaultLanguage: "en",
      taxRatePercent: 0,
      receiptPrefix: slug.replace(/[^A-Z0-9]/gi, "").slice(0, 4).toUpperCase() || "RV",
      nextReceiptNumber: 1001,
      receiptFooter: "Thank you for training with RIVET.",
      createdAt: now,
      updatedAt: now,
    });

    const branchId = await ctx.db.insert("branches", {
      organizationId,
      publicId: branchPublicId,
      name: branchName,
      code: "MAIN",
      address: city,
      phone: ownerPhone,
      capacity: 120,
      active: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    for (const [role, definition] of Object.entries(DEFAULT_ROLE_DEFINITIONS)) {
      await ctx.db.insert("roleDefinitions", {
        organizationId,
        role: role as "owner" | "manager" | "sales" | "receptionist" | "trainer" | "auditor",
        label: definition.label,
        description: definition.description,
        permissions: definition.permissions,
        discountLimitMinor: definition.discountLimitMinor,
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: user._id,
      role: "owner",
      branchIds: [branchId],
      branchScope: "all",
      active: true,
      invitationStatus: "accepted",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("domainRecords", {
      organizationId,
      entityType: "settings",
      publicId: "settings",
      createdAt: now,
      updatedAt: now,
      data: {
        id: "settings",
        organizationId: organizationPublicId,
        paymentMethods: [
          { key: "cash", label: "Cash", enabled: true, affectsCashDrawer: true },
          { key: "card", label: "Card", enabled: true, affectsCashDrawer: false },
          { key: "bank_transfer", label: "Bank transfer", enabled: true, affectsCashDrawer: false },
          { key: "cliq", label: "CliQ", enabled: true, affectsCashDrawer: false },
          { key: "other", label: "Other", enabled: false, affectsCashDrawer: false },
        ],
        notifications: {
          managerAlerts: { cashVariance: true, refundOrVoid: true, checkinOverride: true, discountApproval: true },
          automationDeliveryMode: "sandbox",
          quietHoursStart: "22:00",
          quietHoursEnd: "08:00",
        },
      },
    });

    const trialEndsAt = new Date(now + 14 * 86_400_000).toISOString();
    await ctx.db.insert("domainRecords", {
      organizationId,
      entityType: "platformSubscription",
      publicId: `subscription-${organizationPublicId}`,
      createdAt: now,
      updatedAt: now,
      data: {
        id: `subscription-${organizationPublicId}`,
        organizationId: organizationPublicId,
        plan: args.plan,
        status: "trial",
        priceMinor: config.priceMinor,
        branchLimit: config.branches,
        staffLimit: config.staff,
        memberLimit: config.members,
        currentActiveMembers,
        startedAt: new Date(now).toISOString(),
        trialEndsAt,
      },
    });

    // The directory is the shared boundary between the owner onboarding,
    // platform tenant list, and member discovery. It contains only public
    // profile fields; operational records stay behind organization scope.
    await ctx.db.insert("domainRecords", {
      organizationId,
      entityType: "marketplaceGym",
      publicId: slug,
      createdAt: now,
      updatedAt: now,
      data: {
        id: slug,
        name: gymName,
        shortName: gymName.replace(/[^a-z0-9]/gi, "").slice(0, 12).toUpperCase() || "RIVET GYM",
        tagline: `${gymName} is now running on RIVET.`,
        description: `${gymName} is a RIVET partner gym in ${city}. Contact the gym for membership plans and a free trial.`,
        city,
        areas: [city],
        category: "Fitness & training",
        audience: "All members",
        rating: 0,
        reviewCount: 0,
        memberCount: currentActiveMembers ?? 0,
        branchCount: 1,
        fromPriceMinor: 0,
        amenities: [],
        accent: "#d9232b",
        featured: false,
        subscriptionStatus: "trial",
        rivetPlan: args.plan,
        joinedAt: new Date(now).toISOString().slice(0, 10),
        lastActiveAt: new Date(now).toISOString(),
        monthlyRevenueMinor: 0,
        targetOrganizationId: organizationPublicId,
        isPublic: true,
        branches: [{
          id: `${slug}-main`,
          name: branchName,
          area: city,
          address: city,
          trialSlots: ["08:00", "17:00", "19:00"],
          internalBranchId: branchPublicId,
        }],
      },
    });

    await ctx.db.insert("auditEvents", {
      organizationId,
      publicId: crypto.randomUUID(),
      actorUserId: user._id,
      actorPublicId: user.publicId ?? user._id,
      actorName: ownerFullName,
      actorRole: "owner",
      category: "organization",
      action: "organization.created",
      entityType: "organization",
      entityPublicId: organizationPublicId,
      entityLabel: gymName,
      summary: `Created ${gymName} on the ${args.plan} plan with a 14-day trial.`,
      after: { city, branchName, plan: args.plan },
      correlationId: `onboarding-${crypto.randomUUID()}`,
      occurredAt: now,
    });

    return {
      organizationId: organizationPublicId,
      organizationSlug: slug,
      organizationName: gymName,
      branchId: (await ctx.db.get(branchId))!.publicId ?? branchId,
      branchName,
      plan: args.plan,
      trialEndsAt,
    };
  },
});
