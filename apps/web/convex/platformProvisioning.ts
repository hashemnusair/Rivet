import { v } from "convex/values";
import { internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DEFAULT_ROLE_DEFINITIONS } from "./permissions";
import { domainError, publicBranchId, publicOrganizationId, publicUserId, requirePlatformAdmin, type OrganizationRole } from "./security";
import { notifyPlatformAdmins } from "./notificationDelivery";

const provisionArgs = {
  applicationId: v.string(),
  correlationId: v.string(),
};

type Application = Doc<"gymApplications">;

const DEFAULT_PAYMENT_METHODS = [
  { key: "cash", label: "Cash", enabled: true, affectsCashDrawer: true },
  { key: "card", label: "Card", enabled: true, affectsCashDrawer: false },
  { key: "bank_transfer", label: "Bank transfer", enabled: true, affectsCashDrawer: false },
  { key: "cliq", label: "CliQ", enabled: true, affectsCashDrawer: false },
  { key: "other", label: "Other", enabled: false, affectsCashDrawer: false },
];

const DEFAULT_NOTIFICATIONS = {
  managerAlerts: { cashVariance: true, refundOrVoid: true, checkinOverride: true, discountApproval: true },
  automationDeliveryMode: "sandbox",
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
};

const PROVISIONING_LOCK_MS = 10 * 60_000;

/**
 * Clerk appends __clerk_ticket and __clerk_status to this route when an
 * organization invitation is accepted. Keep it centralized so provisioning
 * and the branded browser flow cannot drift apart.
 */
export const INVITATION_REDIRECT_PATH = "/login/accept-invitation";
/** @deprecated Use INVITATION_REDIRECT_PATH for both owner and staff invites. */
export const OWNER_INVITATION_REDIRECT_PATH = INVITATION_REDIRECT_PATH;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54) || "gym";
}

function stableUuid(applicationId: string, variant: "8" | "9" | "a"): string {
  const hex = applicationId.replace(/[^a-f0-9]/gi, "").toLowerCase().padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Stable identifiers make retries safe after an external Clerk request succeeds. */
export function provisioningIdentifiers(applicationId: string, gymName: string) {
  const suffix = applicationId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toLowerCase();
  const base = slugify(gymName);
  return {
    organizationPublicId: stableUuid(applicationId, "8"),
    organizationSlug: `${base}-${suffix}`.slice(0, 80),
    branchPublicId: stableUuid(applicationId, "9"),
    marketplacePublicId: stableUuid(applicationId, "a"),
  };
}

function branchName(gymName: string): string {
  return `${gymName.trim()} — Main branch`;
}

function organizationResult(application: Application) {
  return {
    applicationId: application.publicId,
    status: "completed" as const,
    organizationId: application.provisionedOrganizationId ?? "",
    organizationName: application.gymName,
    branchId: application.provisionedBranchId ?? "",
    branchName: branchName(application.gymName),
    plan: application.plan,
    ownerName: application.ownerName,
    ownerEmail: application.email,
    clerkOrganizationId: application.clerkOrganizationId ?? "",
    clerkInvitationId: application.clerkInvitationId ?? "",
  };
}

async function applicationById(ctx: QueryCtx | MutationCtx, applicationId: string): Promise<Application> {
  const application = await ctx.db
    .query("gymApplications")
    .withIndex("by_public_id", (q) => q.eq("publicId", applicationId))
    .unique();
  if (!application) domainError("NOT_FOUND", "Gym application not found.");
  return application;
}

/** Claims an approved application for one idempotent provisioning attempt. */
export const begin = internalMutation({
  args: provisionArgs,
  returns: v.any(),
  handler: async (ctx, args) => {
    const admin = await requirePlatformAdmin(ctx, args.correlationId);
    const application = await applicationById(ctx, args.applicationId);
    if (application.status !== "approved") {
      domainError("VALIDATION_ERROR", "Only approved applications can be provisioned.", { correlationId: args.correlationId });
    }
    if (application.provisioningStatus === "completed" && application.provisionedOrganizationId) {
      return { status: "completed" as const, result: organizationResult(application) };
    }

    const now = Date.now();
    if (application.provisioningStatus === "in_progress" && application.provisioningStartedAt && now - application.provisioningStartedAt < PROVISIONING_LOCK_MS) {
      return { status: "busy" as const, applicationId: application.publicId, correlationId: args.correlationId };
    }

    const ids = provisioningIdentifiers(application.publicId, application.gymName);
    await ctx.db.patch(application._id, {
      provisioningStatus: "in_progress",
      provisioningStartedAt: now,
      provisioningError: undefined,
      updatedAt: now,
    });

    return {
      status: "in_progress" as const,
      applicationDocumentId: application._id,
      applicationId: application.publicId,
      gymName: application.gymName,
      ownerName: application.ownerName,
      email: application.email,
      contactNumber: application.contactNumber,
      plan: application.plan,
      organizationPublicId: ids.organizationPublicId,
      organizationSlug: ids.organizationSlug,
      branchPublicId: ids.branchPublicId,
      marketplacePublicId: ids.marketplacePublicId,
      clerkOrganizationId: application.clerkOrganizationId,
      clerkInvitationId: application.clerkInvitationId,
      adminUserId: admin.user._id,
      adminPublicId: publicUserId(admin.user),
      adminName: admin.user.fullName,
      correlationId: args.correlationId,
    };
  },
});

export const rememberClerkOrganization = internalMutation({
  args: { applicationId: v.string(), clerkOrganizationId: v.string(), correlationId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.correlationId);
    const application = await applicationById(ctx, args.applicationId);
    if (application.clerkOrganizationId && application.clerkOrganizationId !== args.clerkOrganizationId) {
      domainError("CONFLICT", "This application is already linked to a different Clerk organization.", { correlationId: args.correlationId });
    }
    await ctx.db.patch(application._id, { clerkOrganizationId: args.clerkOrganizationId, updatedAt: Date.now() });
    return undefined;
  },
});

function roleDefinitionValue(role: OrganizationRole, now: number) {
  const definition = DEFAULT_ROLE_DEFINITIONS[role];
  return {
    role,
    label: definition.label,
    description: definition.description,
    permissions: definition.permissions,
    discountLimitMinor: definition.discountLimitMinor,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
  };
}

async function upsertSettings(ctx: MutationCtx, organizationId: Id<"organizations">, now: number) {
  const existing = await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationId).eq("entityType", "settings").eq("publicId", "settings"))
    .unique();
  const current = existing?.data && typeof existing.data === "object" && !Array.isArray(existing.data) ? existing.data as Record<string, unknown> : {};
  const value = {
    ...current,
    id: "settings",
    paymentMethods: current.paymentMethods ?? DEFAULT_PAYMENT_METHODS,
    notifications: current.notifications ?? DEFAULT_NOTIFICATIONS,
  };
  if (existing) await ctx.db.patch(existing._id, { data: value, updatedAt: now });
  else await ctx.db.insert("domainRecords", { organizationId, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: value });
}

async function upsertMarketplace(ctx: MutationCtx, organizationId: Id<"organizations">, input: { applicationId: string; marketplacePublicId: string; organizationPublicId: string; gymName: string; plan: "Starter" | "Growth" | "Pro"; branchPublicId: string; branchName: string; now: number }) {
  const existing = await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationId).eq("entityType", "marketplaceGym").eq("publicId", input.marketplacePublicId))
    .unique();
  const value = {
    id: input.marketplacePublicId,
    name: input.gymName,
    shortName: input.gymName.slice(0, 12).toUpperCase(),
    tagline: "A new RIVET partner gym.",
    description: `${input.gymName} is now managed with RIVET.`,
    city: "Amman",
    areas: ["Amman"],
    category: "Gym",
    audience: "All members",
    rating: 0,
    reviewCount: 0,
    memberCount: 0,
    branchCount: 1,
    fromPriceMinor: 0,
    amenities: [],
    accent: "#1b1a15",
    featured: false,
    subscriptionStatus: "trial",
    rivetPlan: input.plan,
    joinedAt: new Date(input.now).toISOString().slice(0, 10),
    lastActiveAt: new Date(input.now).toISOString(),
    monthlyRevenueMinor: 0,
    targetOrganizationId: input.organizationPublicId,
    // An approved, provisioned gym is part of the member discovery network by
    // default. Platform admins can hide it later through the listing control.
    isPublic: true,
    branches: [{ id: input.branchPublicId, name: input.branchName, area: "Amman", address: "", trialSlots: [] }],
    applicationId: input.applicationId,
  };
  if (existing) await ctx.db.patch(existing._id, { data: value, updatedAt: input.now });
  else await ctx.db.insert("domainRecords", { organizationId, entityType: "marketplaceGym", publicId: input.marketplacePublicId, createdAt: input.now, updatedAt: input.now, data: value });
}

/** Creates the internal tenant, branch, owner placeholder, roles, settings and plan record. */
export const createWorkspace = internalMutation({
  args: {
    applicationId: v.string(),
    clerkOrganizationId: v.string(),
    correlationId: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const admin = await requirePlatformAdmin(ctx, args.correlationId);
    const application = await applicationById(ctx, args.applicationId);
    if (application.status !== "approved") domainError("VALIDATION_ERROR", "Only approved applications can be provisioned.", { correlationId: args.correlationId });
    const ids = provisioningIdentifiers(application.publicId, application.gymName);
    const now = Date.now();

    let organization = await ctx.db
      .query("organizations")
      .withIndex("by_public_id", (q) => q.eq("publicId", ids.organizationPublicId))
      .unique();
    if (!organization) {
      const organizationId = await ctx.db.insert("organizations", {
        publicId: ids.organizationPublicId,
        name: application.gymName,
        slug: ids.organizationSlug,
        status: "trial",
        subscriptionPlan: application.plan,
        subscriptionStartedAt: now,
        clerkOrganizationId: args.clerkOrganizationId,
        timezone: "Asia/Amman",
        currency: "JOD",
        locale: "en-JO",
        defaultLanguage: "en",
        taxRatePercent: 0,
        receiptPrefix: "RV",
        nextReceiptNumber: 1001,
        receiptFooter: "Thank you for training with RIVET.",
        createdAt: now,
        updatedAt: now,
      });
      organization = await ctx.db.get(organizationId);
    } else {
      await ctx.db.patch(organization._id, { name: application.gymName, subscriptionPlan: application.plan, clerkOrganizationId: args.clerkOrganizationId, updatedAt: now });
      organization = await ctx.db.get(organization._id);
    }
    if (!organization) domainError("INTERNAL_ERROR", "The gym workspace could not be created.", { correlationId: args.correlationId });

    let branch = await ctx.db
      .query("branches")
      .withIndex("by_organization_code", (q) => q.eq("organizationId", organization._id).eq("code", "MAIN"))
      .unique();
    if (!branch) {
      const branchId = await ctx.db.insert("branches", {
        publicId: ids.branchPublicId,
        organizationId: organization._id,
        name: branchName(application.gymName),
        code: "MAIN",
        address: "",
        phone: application.contactNumber,
        capacity: 120,
        active: true,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      branch = await ctx.db.get(branchId);
    } else {
      await ctx.db.patch(branch._id, { publicId: branch.publicId ?? ids.branchPublicId, name: branchName(application.gymName), phone: application.contactNumber, active: true, status: "active", updatedAt: now });
      branch = await ctx.db.get(branch._id);
    }
    if (!branch) domainError("INTERNAL_ERROR", "The first gym branch could not be created.", { correlationId: args.correlationId });

    let user = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", application.email)).unique();
    if (user?.platformAdmin) domainError("CONFLICT", "The application owner email belongs to a platform administrator.", { correlationId: args.correlationId });
    if (user?.status === "deactivated") domainError("FORBIDDEN", "The application owner account is deactivated.", { correlationId: args.correlationId });
    if (!user) {
      const userId = await ctx.db.insert("users", {
        publicId: crypto.randomUUID(),
        authSubject: `invite:${application.email}`,
        email: application.email,
        fullName: application.ownerName,
        phone: application.contactNumber,
        platformAdmin: false,
        status: "invited",
        createdAt: now,
        updatedAt: now,
      });
      user = await ctx.db.get(userId);
    } else {
      await ctx.db.patch(user._id, { fullName: application.ownerName, phone: application.contactNumber, status: user.status ?? "active", updatedAt: now });
      user = await ctx.db.get(user._id);
    }
    if (!user) domainError("INTERNAL_ERROR", "The gym owner account could not be prepared.", { correlationId: args.correlationId });

    const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", user._id)).unique();
    if (membership) {
      await ctx.db.patch(membership._id, { role: "owner", branchIds: [branch._id], branchScope: "all", active: true, invitationStatus: "pending", invitedAt: membership.invitedAt ?? now, updatedAt: now });
    } else {
      await ctx.db.insert("organizationMemberships", { organizationId: organization._id, userId: user._id, role: "owner", branchIds: [branch._id], branchScope: "all", active: true, invitationStatus: "pending", invitedAt: now, createdAt: now, updatedAt: now });
    }

    for (const [role, definition] of Object.entries(DEFAULT_ROLE_DEFINITIONS) as Array<[OrganizationRole, (typeof DEFAULT_ROLE_DEFINITIONS)["owner"]]>) {
      const existing = await ctx.db.query("roleDefinitions").withIndex("by_organization_role", (q) => q.eq("organizationId", organization._id).eq("role", role)).unique();
      const value = roleDefinitionValue(role, now);
      if (existing) await ctx.db.patch(existing._id, { label: definition.label, description: definition.description, permissions: definition.permissions, discountLimitMinor: definition.discountLimitMinor, updatedAt: now });
      else await ctx.db.insert("roleDefinitions", { organizationId: organization._id, ...value });
    }
    await upsertSettings(ctx, organization._id, now);
    await upsertMarketplace(ctx, organization._id, { applicationId: application.publicId, marketplacePublicId: ids.marketplacePublicId, organizationPublicId: ids.organizationPublicId, gymName: application.gymName, plan: application.plan, branchPublicId: publicBranchId(branch), branchName: branch.name, now });

    const auditRows = await ctx.db.query("platformAuditEvents").withIndex("by_entity", (q) => q.eq("entityType", "gym_application").eq("entityPublicId", application.publicId)).collect();
    if (!auditRows.some((row) => row.action === "gym.provisioning.workspace_created")) {
      await ctx.db.insert("platformAuditEvents", {
        publicId: crypto.randomUUID(),
        actorUserId: admin.user._id,
        actorPublicId: publicUserId(admin.user),
        actorName: admin.user.fullName,
        action: "gym.provisioning.workspace_created",
        entityType: "gym_application",
        entityPublicId: application.publicId,
        entityLabel: application.gymName,
        summary: `Created ${application.plan} workspace for ${application.gymName}`,
        before: { provisioningStatus: application.provisioningStatus ?? "not_started" },
        after: { organizationId: ids.organizationPublicId, branchId: publicBranchId(branch), plan: application.plan },
        correlationId: args.correlationId,
        occurredAt: now,
      });
    }

    return { applicationId: application.publicId, organizationId: ids.organizationPublicId, organizationName: organization.name, branchId: publicBranchId(branch), branchName: branch.name, plan: application.plan, ownerName: application.ownerName, ownerEmail: application.email, clerkOrganizationId: args.clerkOrganizationId, ownerUserPublicId: publicUserId(user), correlationId: args.correlationId };
  },
});

export const rememberClerkInvitation = internalMutation({
  args: { applicationId: v.string(), clerkInvitationId: v.string(), correlationId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.correlationId);
    const application = await applicationById(ctx, args.applicationId);
    const user = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", application.email)).unique();
    if (!user) domainError("NOT_FOUND", "The gym owner account could not be found.", { correlationId: args.correlationId });
    const organization = application.provisionedOrganizationId
      ? await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", application.provisionedOrganizationId!)).unique()
      : await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", provisioningIdentifiers(application.publicId, application.gymName).organizationPublicId)).unique();
    if (!organization) domainError("NOT_FOUND", "The provisioned gym workspace could not be found.", { correlationId: args.correlationId });
    const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", user._id)).unique();
    if (!membership) domainError("NOT_FOUND", "The gym owner membership could not be found.", { correlationId: args.correlationId });
    const now = Date.now();
    await ctx.db.patch(membership._id, { clerkInvitationId: args.clerkInvitationId, invitationSentAt: now, invitationLastAttemptAt: now, invitationError: undefined, invitationStatus: "pending", updatedAt: now });
    await ctx.db.patch(application._id, { clerkInvitationId: args.clerkInvitationId, updatedAt: now });
    return undefined;
  },
});

export const fail = internalMutation({
  args: { applicationId: v.string(), message: v.string(), correlationId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const admin = await requirePlatformAdmin(ctx, args.correlationId);
    const application = await applicationById(ctx, args.applicationId);
    const now = Date.now();
    const message = args.message.slice(0, 500);
    await ctx.db.patch(application._id, { provisioningStatus: "failed", provisioningStartedAt: undefined, provisioningError: message, updatedAt: now });
    await ctx.db.insert("platformAuditEvents", {
      publicId: crypto.randomUUID(),
      actorUserId: admin.user._id,
      actorPublicId: publicUserId(admin.user),
      actorName: admin.user.fullName,
      action: "gym.provisioning.failed",
      entityType: "gym_application",
      entityPublicId: application.publicId,
      entityLabel: application.gymName,
      summary: "Gym workspace provisioning failed",
      reason: message,
      after: { provisioningStatus: "failed" },
      correlationId: args.correlationId,
      occurredAt: now,
    });
    await notifyPlatformAdmins(ctx, {
      kind: "provisioning_failure",
      title: "Gym provisioning failed",
      body: `${application.gymName} · ${message}`,
      href: `/platform/applications?application=${application.publicId}`,
      dedupeKey: `gym-provisioning-failed:${application.publicId}:${now}`,
    });
    return undefined;
  },
});

export const complete = internalMutation({
  args: { applicationId: v.string(), correlationId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const admin = await requirePlatformAdmin(ctx, args.correlationId);
    const application = await applicationById(ctx, args.applicationId);
    if (application.provisioningStatus === "completed" && application.provisionedOrganizationId) return organizationResult(application);
    const ids = provisioningIdentifiers(application.publicId, application.gymName);
    const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", ids.organizationPublicId)).unique();
    const branch = organization ? await ctx.db.query("branches").withIndex("by_organization_code", (q) => q.eq("organizationId", organization._id).eq("code", "MAIN")).unique() : null;
    if (!organization || !branch) domainError("INTERNAL_ERROR", "Workspace provisioning is incomplete.", { correlationId: args.correlationId });
    const now = Date.now();
    await ctx.db.patch(application._id, { provisioningStatus: "completed", provisioningStartedAt: undefined, provisioningError: undefined, provisionedAt: now, provisionedOrganizationId: publicOrganizationId(organization), provisionedBranchId: publicBranchId(branch), updatedAt: now });
    const auditRows = await ctx.db.query("platformAuditEvents").withIndex("by_entity", (q) => q.eq("entityType", "gym_application").eq("entityPublicId", application.publicId)).collect();
    if (!auditRows.some((row) => row.action === "gym.provisioned")) {
      await ctx.db.insert("platformAuditEvents", { publicId: crypto.randomUUID(), actorUserId: admin.user._id, actorPublicId: publicUserId(admin.user), actorName: admin.user.fullName, action: "gym.provisioned", entityType: "gym_application", entityPublicId: application.publicId, entityLabel: application.gymName, summary: `Provisioned ${application.gymName} and invited the owner`, after: { organizationId: publicOrganizationId(organization), branchId: publicBranchId(branch), clerkOrganizationId: application.clerkOrganizationId, clerkInvitationId: application.clerkInvitationId }, correlationId: args.correlationId, occurredAt: now });
    }
    const updated = await ctx.db.get(application._id);
    if (!updated) domainError("INTERNAL_ERROR", "The provisioning result could not be read.", { correlationId: args.correlationId });
    return organizationResult(updated);
  },
});
