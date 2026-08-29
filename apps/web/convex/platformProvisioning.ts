import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { DEFAULT_ROLE_DEFINITIONS, PERMISSION_CATALOG_VERSION, rolePermissions } from "./permissions";
import { domainError, publicBranchId, publicOrganizationId, publicUserId, requirePlatformAdmin, type OrganizationRole } from "./security";
import { notifyPlatformAdmins } from "./notificationDelivery";
import { defaultWorkspacePreferences, entitledModulesForPlan, validateWorkspaceModuleSelection, WORKSPACE_MODULE_CATALOG_VERSION } from "./workspaceModules";
import { seedAccountingMetadata } from "./accounting";

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
type BillingInterval = "monthly" | "annual";
type ProvisioningOutcome = "complete" | "partial" | "retryable" | "permanent";

const provisioningLeaseArgs = {
  applicationId: v.string(),
  correlationId: v.string(),
  leaseId: v.string(),
};

function marketplaceSubscriptionStatus(status: Doc<"organizations">["status"]): "trial" | "active" | "overdue" | "suspended" | "cancelled" {
  return status === "past_due" ? "overdue" : status;
}

function addCalendarMonth(timestamp: number): number {
  const source = new Date(timestamp);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 1, source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.getTime();
}

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

function organizationResult(application: Application, organization?: Doc<"organizations">, branch?: Doc<"branches">) {
  return {
    applicationId: application.publicId,
    status: "completed" as const,
    organizationId: organization ? publicOrganizationId(organization) : application.provisionedOrganizationId ?? "",
    organizationName: organization?.name ?? application.gymName,
    branchId: branch ? publicBranchId(branch) : application.provisionedBranchId ?? "",
    branchName: branch?.name ?? branchName(application.gymName),
    plan: organization?.subscriptionPlan ?? application.plan,
    billingInterval: organization?.billingInterval ?? application.billingInterval ?? "monthly",
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

type ProvisioningAdmin = { user: Doc<"users"> };

/**
 * Every mutating step after `begin` is fenced by both the correlation id and
 * a unique lease. An action can outlive its lock and arrive after a newer
 * attempt; it must fail closed instead of regressing that newer attempt.
 */
async function applicationForLease(ctx: QueryCtx | MutationCtx, args: { applicationId: string; correlationId: string; leaseId: string }): Promise<Application> {
  const application = await applicationById(ctx, args.applicationId);
  if (application.provisioningStatus !== "in_progress" || application.provisioningLeaseId !== args.leaseId || application.provisioningLastCorrelationId !== args.correlationId) {
    domainError("CONFLICT", "This provisioning attempt is stale; refresh and retry the current attempt.", { correlationId: args.correlationId });
  }
  return application;
}

function legacyOwnerMembershipAccepted(membership: Doc<"organizationMemberships"> | null, user: Doc<"users"> | null): boolean {
  // Older rows predate invitationStatus. An active legacy owner is already a
  // usable membership and must never be downgraded to pending or reinvited.
  return Boolean(membership && user && membership.active && user.status !== "deactivated" && (membership.invitationStatus === "accepted" || membership.invitationStatus === undefined));
}

function invitationStatusForMembership(membership: Doc<"organizationMemberships"> | null, user: Doc<"users"> | null): "pending" | "accepted" | "revoked" | undefined {
  if (legacyOwnerMembershipAccepted(membership, user)) return "accepted";
  return membership?.invitationStatus;
}

async function recordPermanentBeginConflict(ctx: MutationCtx, admin: ProvisioningAdmin, application: Application, message: string, correlationId: string): Promise<void> {
  const now = Date.now();
  const boundedMessage = message.slice(0, 500);
  if (application.provisioningStatus === "failed" && application.provisioningOutcome === "permanent" && application.provisioningError === boundedMessage) return;
  await ctx.db.patch(application._id, {
    provisioningStatus: "failed",
    provisioningOutcome: "permanent",
    provisioningStartedAt: undefined,
    provisioningError: boundedMessage,
    provisioningLastCorrelationId: correlationId,
    provisioningProviderStatus: undefined,
    provisioningProviderCode: undefined,
    updatedAt: now,
  });
  await ctx.db.insert("platformAuditEvents", {
    publicId: crypto.randomUUID(),
    actorUserId: admin.user._id,
    actorPublicId: publicUserId(admin.user),
    actorName: admin.user.fullName,
    action: "gym.provisioning.failed",
    entityType: "gym_application",
    entityPublicId: application.publicId,
    entityLabel: application.gymName,
    summary: "Gym workspace provisioning requires manual correction",
    reason: boundedMessage,
    after: { provisioningStatus: "failed", provisioningOutcome: "permanent", provisioningCheckpoint: application.provisioningCheckpoint ?? "claimed" },
    correlationId,
    occurredAt: now,
  });
  await notifyPlatformAdmins(ctx, {
    kind: "provisioning_failure",
    title: "Gym provisioning requires manual correction",
    body: `${application.gymName} · ${boundedMessage}`,
    href: `/platform/applications?application=${application.publicId}`,
    dedupeKey: `gym-provisioning-failed:${application.publicId}:${now}`,
  });
}

/**
 * Branch public ids are the durable identity after the first workspace step.
 * Legacy applications have no persisted branch id, so recover only from the
 * deterministic application-derived public id or a single branch in the
 * organization. A multi-branch workspace is intentionally ambiguous; never
 * fall back to mutable codes such as MAIN or create a duplicate.
 */
async function authoritativeProvisioningBranch(ctx: QueryCtx | MutationCtx, organization: Doc<"organizations">, application: Application): Promise<Doc<"branches"> | null> {
  if (application.provisionedBranchId) {
    return await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", application.provisionedBranchId!)).unique();
  }
  const ids = provisioningIdentifiers(application.publicId, application.gymName);
  const expectedBranch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", ids.branchPublicId)).unique();
  if (expectedBranch) return expectedBranch;
  const branches = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect();
  return branches.length === 1 ? branches[0] ?? null : null;
}

/** Retire stale operational failure alerts after a successful retry. */
async function dismissProvisioningFailureNotifications(ctx: MutationCtx, applicationId: string, now: number): Promise<void> {
  const platformOperators = (await ctx.db.query("users").collect()).filter((user) => user.platformAdmin && user.status !== "deactivated");
  await Promise.all(platformOperators.map(async (operator) => {
    const rows = await ctx.db.query("operationalNotifications").withIndex("by_recipient_created", (q) => q.eq("recipientUserId", operator._id)).collect();
    await Promise.all(rows
      .filter((row) => row.kind === "provisioning_failure" && row.dedupeKey.startsWith(`gym-provisioning-failed:${applicationId}:`))
      .map((row) => ctx.db.patch(row._id, { readAt: now, expiresAt: now })));
  }));
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
      const existingOrganization = await ctx.db
        .query("organizations")
        .withIndex("by_public_id", (q) => q.eq("publicId", application.provisionedOrganizationId!))
        .unique();
      const existingBranch = existingOrganization ? await authoritativeProvisioningBranch(ctx, existingOrganization, application) : null;
      if (existingOrganization && existingBranch) {
        if (!application.provisionedBranchId) await ctx.db.patch(application._id, { provisionedBranchId: publicBranchId(existingBranch), updatedAt: Date.now() });
        await dismissProvisioningFailureNotifications(ctx, application.publicId, Date.now());
        return { status: "completed" as const, result: organizationResult(application, existingOrganization, existingBranch) };
      }
      // A completed application without its durable workspace is a drifted
      // checkpoint. Resume the missing workspace step rather than trusting the
      // stale completion marker or resetting any surviving tenant facts.
    }
    if (application.provisioningStatus === "failed" && application.provisioningOutcome === "permanent") {
      return {
        status: "permanent" as const,
        applicationId: application.publicId,
        message: application.provisioningError ?? "Provisioning requires manual correction before it can be retried.",
        correlationId: args.correlationId,
      };
    }

    const now = Date.now();
    if (application.provisioningStatus === "in_progress" && application.provisioningStartedAt && now - application.provisioningStartedAt < PROVISIONING_LOCK_MS) {
      return { status: "busy" as const, applicationId: application.publicId, correlationId: args.correlationId };
    }

    const ids = provisioningIdentifiers(application.publicId, application.gymName);
    const existingOrganization = await ctx.db
      .query("organizations")
      .withIndex("by_public_id", (q) => q.eq("publicId", ids.organizationPublicId))
      .unique();
    const owner = existingOrganization
      ? await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", application.email)).unique()
      : null;
    const ownerMembership = existingOrganization && owner
      ? await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", existingOrganization._id).eq("userId", owner._id)).unique()
      : null;
    if (application.clerkOrganizationId && existingOrganization?.clerkOrganizationId && application.clerkOrganizationId !== existingOrganization.clerkOrganizationId) {
      await recordPermanentBeginConflict(ctx, admin, application, "The application and workspace reference different Clerk organizations.", args.correlationId);
      return { status: "permanent" as const, applicationId: application.publicId, message: "The application and workspace reference different Clerk organizations.", correlationId: args.correlationId };
    }
    const clerkOrganizationId = application.clerkOrganizationId ?? existingOrganization?.clerkOrganizationId;
    const ownerInvitationStatus = invitationStatusForMembership(ownerMembership, owner);
    // Only an explicitly pending provider invitation may be reused. A stored
    // revoked/expired/failed id is a tombstone, not a safe provider handle.
    const reusableMembershipInvitation = ownerMembership?.clerkInvitationStatus === "pending" ? ownerMembership.clerkInvitationId : undefined;
    const membershipInvitationTerminal = Boolean(ownerMembership?.clerkInvitationId && (ownerMembership.clerkInvitationStatus !== "pending" || ownerMembership.invitationStatus === "revoked"));
    const reusableApplicationInvitation = !membershipInvitationTerminal && application.clerkInvitationStatus === "pending" ? application.clerkInvitationId : undefined;
    const clerkInvitationId = reusableApplicationInvitation ?? reusableMembershipInvitation;
    const clearStaleApplicationInvitation = !ownerInvitationStatus?.includes("accepted") && Boolean(application.clerkInvitationId && (application.clerkInvitationStatus !== "pending" || membershipInvitationTerminal));
    const checkpoint = existingOrganization && clerkInvitationId
      ? "invitation_recorded"
      : existingOrganization
        ? "workspace_ready"
        : application.clerkOrganizationId
          ? "organization_recorded"
          : "claimed";
    const leaseId = `${args.correlationId}:${crypto.randomUUID()}`;
    await ctx.db.patch(application._id, {
      provisioningStatus: "in_progress",
      provisioningCheckpoint: checkpoint,
      provisioningOutcome: "partial",
      provisioningAttemptCount: (application.provisioningAttemptCount ?? 0) + 1,
      provisioningLastCorrelationId: args.correlationId,
      provisioningLeaseId: leaseId,
      provisioningStartedAt: now,
      provisioningError: undefined,
      ...(clerkOrganizationId && !application.clerkOrganizationId ? { clerkOrganizationId } : {}),
      ...(clerkInvitationId && !application.clerkInvitationId ? { clerkInvitationId, clerkInvitationStatus: "pending" as const } : {}),
      ...(clearStaleApplicationInvitation ? { clerkInvitationId: undefined, clerkInvitationStatus: undefined } : {}),
      provisioningProviderStatus: undefined,
      provisioningProviderCode: undefined,
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
      clerkOrganizationId,
      clerkInvitationId,
      clerkInvitationStatus: reusableApplicationInvitation ? application.clerkInvitationStatus : ownerMembership?.clerkInvitationStatus,
      ownerInvitationStatus,
      existingOrganizationStatus: existingOrganization?.status,
      adminUserId: admin.user._id,
      adminPublicId: publicUserId(admin.user),
      adminName: admin.user.fullName,
      correlationId: args.correlationId,
      leaseId,
    };
  },
});

/** Re-read the owner membership immediately before any external invitation call. */
export const ownerInvitationState = internalQuery({
  args: provisioningLeaseArgs,
  returns: v.any(),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.correlationId);
    const application = await applicationForLease(ctx, args);
    const ids = provisioningIdentifiers(application.publicId, application.gymName);
    const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", ids.organizationPublicId)).unique();
    const owner = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", application.email)).unique();
    const membership = organization && owner
      ? await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", owner._id)).unique()
      : null;
    return {
      invitationStatus: invitationStatusForMembership(membership, owner),
      clerkInvitationId: membership?.clerkInvitationId,
      clerkInvitationStatus: membership?.clerkInvitationStatus,
    };
  },
});

export const rememberClerkOrganization = internalMutation({
  args: { applicationId: v.string(), clerkOrganizationId: v.string(), correlationId: v.string(), leaseId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.correlationId);
    const application = await applicationForLease(ctx, args);
    if (application.clerkOrganizationId && application.clerkOrganizationId !== args.clerkOrganizationId) {
      domainError("CONFLICT", "This application is already linked to a different Clerk organization.", { correlationId: args.correlationId });
    }
    const ids = provisioningIdentifiers(application.publicId, application.gymName);
    const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", ids.organizationPublicId)).unique();
    if (organization?.clerkOrganizationId && organization.clerkOrganizationId !== args.clerkOrganizationId) {
      domainError("CONFLICT", "This workspace is already linked to a different Clerk organization.", { correlationId: args.correlationId });
    }
    if (organization && !organization.clerkOrganizationId) await ctx.db.patch(organization._id, { clerkOrganizationId: args.clerkOrganizationId, updatedAt: Date.now() });
    await ctx.db.patch(application._id, { clerkOrganizationId: args.clerkOrganizationId, provisioningCheckpoint: "organization_recorded", provisioningOutcome: "partial", provisioningLastCorrelationId: args.correlationId, updatedAt: Date.now() });
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
    catalogVersion: PERMISSION_CATALOG_VERSION,
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

async function upsertMarketplace(ctx: MutationCtx, organizationId: Id<"organizations">, input: { applicationId: string; marketplacePublicId: string; organizationPublicId: string; gymName: string; plan: "Starter" | "Growth" | "Pro" | "Enterprise"; billingInterval: BillingInterval; branchPublicId: string; branchName: string; now: number; organization: Doc<"organizations"> }) {
  const existing = await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationId).eq("entityType", "marketplaceGym").eq("publicId", input.marketplacePublicId))
    .unique();
  const existingData = existing?.data && typeof existing.data === "object" && !Array.isArray(existing.data)
    ? existing.data as Record<string, unknown>
    : {};
  const organization = input.organization;
  const plan = organization.subscriptionPlan ?? input.plan;
  const billingInterval = organization.billingInterval ?? input.billingInterval;
  const defaultBranches = [{ id: input.branchPublicId, name: input.branchName, area: "Amman", address: "", trialSlots: [] }];
  const value = {
    ...existingData,
    id: input.marketplacePublicId,
    name: existingData.name ?? input.gymName,
    shortName: existingData.shortName ?? input.gymName.slice(0, 12).toUpperCase(),
    tagline: existingData.tagline ?? "A new RIVET partner gym.",
    description: existingData.description ?? `${input.gymName} is now managed with RIVET.`,
    city: existingData.city ?? "Amman",
    areas: existingData.areas ?? ["Amman"],
    category: existingData.category ?? "Gym",
    audience: existingData.audience ?? "All members",
    rating: existingData.rating ?? 0,
    reviewCount: existingData.reviewCount ?? 0,
    memberCount: existingData.memberCount ?? 0,
    branchCount: existingData.branchCount ?? 1,
    fromPriceMinor: existingData.fromPriceMinor ?? 0,
    amenities: existingData.amenities ?? [],
    accent: existingData.accent ?? "#1b1a15",
    featured: existingData.featured ?? false,
    subscriptionStatus: marketplaceSubscriptionStatus(organization.status),
    rivetPlan: plan,
    billingInterval,
    joinedAt: existingData.joinedAt ?? new Date(input.now).toISOString().slice(0, 10),
    lastActiveAt: existingData.lastActiveAt ?? new Date(input.now).toISOString(),
    monthlyRevenueMinor: existingData.monthlyRevenueMinor ?? 0,
    targetOrganizationId: input.organizationPublicId,
    // A retry must preserve a platform operator's explicit private/public
    // choice. Only a brand-new listing defaults to public discovery.
    isPublic: typeof existingData.isPublic === "boolean" ? existingData.isPublic : true,
    branches: Array.isArray(existingData.branches) && existingData.branches.length > 0 ? existingData.branches : defaultBranches,
    applicationId: input.applicationId,
    trialEndsAt: organization.trialEndsAt !== undefined ? new Date(organization.trialEndsAt).toISOString() : undefined,
    subscriptionStartedAt: organization.subscriptionStartedAt !== undefined ? new Date(organization.subscriptionStartedAt).toISOString() : undefined,
    currentPeriodEndsAt: organization.currentPeriodEndsAt !== undefined ? new Date(organization.currentPeriodEndsAt).toISOString() : undefined,
    cancelledAt: organization.cancelledAt !== undefined ? new Date(organization.cancelledAt).toISOString() : undefined,
    subscriptionStatusReason: organization.subscriptionStatusReason,
    isArchived: organization.archivedAt !== undefined || existingData.isArchived === true,
    archivedAt: organization.archivedAt !== undefined ? new Date(organization.archivedAt).toISOString() : existingData.archivedAt,
    archiveReason: organization.archiveReason ?? existingData.archiveReason,
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
    leaseId: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const admin = await requirePlatformAdmin(ctx, args.correlationId);
    const application = await applicationForLease(ctx, args);
    if (application.status !== "approved") domainError("VALIDATION_ERROR", "Only approved applications can be provisioned.", { correlationId: args.correlationId });
    const ids = provisioningIdentifiers(application.publicId, application.gymName);
    const now = Date.now();

    let organization = await ctx.db
      .query("organizations")
      .withIndex("by_public_id", (q) => q.eq("publicId", ids.organizationPublicId))
      .unique();
    const requestedBillingInterval: BillingInterval = application.billingInterval === "annual" ? "annual" : "monthly";
    if (!organization) {
      const organizationId = await ctx.db.insert("organizations", {
        publicId: ids.organizationPublicId,
        name: application.gymName,
        slug: ids.organizationSlug,
        status: "trial",
        subscriptionPlan: application.plan,
        billingInterval: requestedBillingInterval,
        subscriptionStartedAt: now,
        trialEndsAt: addCalendarMonth(now),
        clerkOrganizationId: args.clerkOrganizationId,
        timezone: "Asia/Amman",
        currency: "JOD",
        locale: "en-JO",
        phoneCountryCallingCode: "962",
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
      if (organization.clerkOrganizationId && organization.clerkOrganizationId !== args.clerkOrganizationId) {
        domainError("CONFLICT", "This workspace is already linked to a different Clerk organization.", { correlationId: args.correlationId });
      }
      // Existing organization lifecycle and billing facts are authoritative.
      // A retry may fill the missing Clerk link, but it must never reset an
      // active, paid, suspended, cancelled, or otherwise operator-managed
      // workspace back into trial.
      if (!organization.clerkOrganizationId) await ctx.db.patch(organization._id, { clerkOrganizationId: args.clerkOrganizationId, updatedAt: now });
      organization = await ctx.db.get(organization._id);
    }
    if (!organization) domainError("INTERNAL_ERROR", "The gym workspace could not be created.", { correlationId: args.correlationId });
    const plan = organization.subscriptionPlan ?? application.plan;
    const billingInterval: BillingInterval = organization.billingInterval ?? requestedBillingInterval;
    // Seed only code-owned accounting metadata during provisioning. No
    // periods, balances, journal entries, or source facts are created here.
    await seedAccountingMetadata(ctx, organization._id, now);

    let branch = await authoritativeProvisioningBranch(ctx, organization, application);
    if (application.provisionedBranchId && !branch) {
      domainError("CONFLICT", "The provisioned branch identity is missing; manual correction is required before retrying.", { correlationId: args.correlationId });
    }
    if (!branch) {
      const existingBranches = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect();
      if (existingBranches.length > 0) {
        domainError("CONFLICT", "The initial gym branch cannot be identified safely; manual correction is required before retrying.", { correlationId: args.correlationId });
      }
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
    } else if (!branch.publicId) {
      // The branch is an authoritative tenant record too. A retry may fill a
      // missing public identifier, but must not reactivate or rename a branch
      // that an operator has deliberately changed since the first attempt.
      await ctx.db.patch(branch._id, { publicId: ids.branchPublicId, updatedAt: now });
      branch = await ctx.db.get(branch._id);
    }
    if (!branch) domainError("INTERNAL_ERROR", "The first gym branch could not be created.", { correlationId: args.correlationId });
    // Persist the stable branch identity before later workspace writes. A
    // retry never needs to infer the branch from mutable display codes.
    await ctx.db.patch(application._id, { provisionedBranchId: publicBranchId(branch), updatedAt: now });

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
    }
    if (!user) domainError("INTERNAL_ERROR", "The gym owner account could not be prepared.", { correlationId: args.correlationId });

    const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", user._id)).unique();
    if (membership) {
      // An accepted owner is already a usable identity. Preserve the
      // invitation status and branch scope on retries; only incomplete
      // placeholder memberships are repaired into the expected owner shape.
      if (legacyOwnerMembershipAccepted(membership, user)) {
        await ctx.db.patch(membership._id, { updatedAt: now });
      } else {
        await ctx.db.patch(membership._id, { role: "owner", branchIds: [branch._id], branchScope: "all", active: true, invitationStatus: "pending", invitedAt: membership.invitedAt ?? now, updatedAt: now });
      }
    } else {
      await ctx.db.insert("organizationMemberships", { organizationId: organization._id, userId: user._id, role: "owner", branchIds: [branch._id], branchScope: "all", active: true, invitationStatus: "pending", invitedAt: now, createdAt: now, updatedAt: now });
    }

    for (const [role, definition] of Object.entries(DEFAULT_ROLE_DEFINITIONS) as Array<[OrganizationRole, (typeof DEFAULT_ROLE_DEFINITIONS)["owner"]]>) {
      const existing = await ctx.db.query("roleDefinitions").withIndex("by_organization_role", (q) => q.eq("organizationId", organization._id).eq("role", role)).unique();
      const value = roleDefinitionValue(role, now);
      if (existing) {
        // Provisioning is idempotent and may run after an owner has edited a
        // role. Preserve current-version omissions and other custom removals;
        // only legacy rows receive the narrowly-scoped compatibility additions.
        await ctx.db.patch(existing._id, { label: definition.label, description: definition.description, permissions: rolePermissions(role, existing.permissions, existing.catalogVersion), catalogVersion: PERMISSION_CATALOG_VERSION, discountLimitMinor: existing.discountLimitMinor, updatedAt: now });
      }
      else await ctx.db.insert("roleDefinitions", { organizationId: organization._id, ...value });
    }
    const entitledModules = entitledModulesForPlan(plan);
    const existingEntitlements = await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique();
    if (existingEntitlements) await ctx.db.patch(existingEntitlements._id, { catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, subscriptionPlan: plan, entitledModules, source: "subscription_plan", updatedAt: now });
    else await ctx.db.insert("organizationEntitlements", { organizationId: organization._id, catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, subscriptionPlan: plan, entitledModules, source: "subscription_plan", createdAt: now, updatedAt: now });
    const existingPreferences = await ctx.db.query("workspaceModulePreferences").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique();
    const storedModules = existingPreferences?.enabledModules.filter((module): module is typeof entitledModules[number] => entitledModules.includes(module as typeof entitledModules[number])) ?? [];
    let enabledModules = storedModules;
    try { enabledModules = validateWorkspaceModuleSelection(storedModules, entitledModules); } catch { enabledModules = defaultWorkspacePreferences(entitledModules); }
    if (existingPreferences) await ctx.db.patch(existingPreferences._id, { catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, enabledModules, updatedByUserId: user._id, updatedAt: now });
    else await ctx.db.insert("workspaceModulePreferences", { organizationId: organization._id, catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, enabledModules, updatedByUserId: user._id, createdAt: now, updatedAt: now });
    await upsertSettings(ctx, organization._id, now);
    await upsertMarketplace(ctx, organization._id, { applicationId: application.publicId, marketplacePublicId: ids.marketplacePublicId, organizationPublicId: ids.organizationPublicId, gymName: application.gymName, plan, billingInterval, branchPublicId: publicBranchId(branch), branchName: branch.name, now, organization });

    await ctx.db.patch(application._id, { provisioningCheckpoint: "workspace_ready", provisioningOutcome: "partial", provisioningLastCorrelationId: args.correlationId, provisionedBranchId: publicBranchId(branch), updatedAt: now });

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
        summary: `Created ${plan} workspace for ${application.gymName}`,
        before: { provisioningStatus: application.provisioningStatus ?? "not_started" },
        after: { organizationId: ids.organizationPublicId, branchId: publicBranchId(branch), plan },
        correlationId: args.correlationId,
        occurredAt: now,
      });
    }

    return { applicationId: application.publicId, organizationId: ids.organizationPublicId, organizationName: organization.name, branchId: publicBranchId(branch), branchName: branch.name, plan, billingInterval, ownerName: application.ownerName, ownerEmail: application.email, clerkOrganizationId: args.clerkOrganizationId, ownerUserPublicId: publicUserId(user), correlationId: args.correlationId };
  },
});

export const rememberClerkInvitation = internalMutation({
  args: { applicationId: v.string(), clerkInvitationId: v.string(), correlationId: v.string(), leaseId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.correlationId);
    const application = await applicationForLease(ctx, args);
    const user = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", application.email)).unique();
    if (!user) domainError("NOT_FOUND", "The gym owner account could not be found.", { correlationId: args.correlationId });
    const organization = application.provisionedOrganizationId
      ? await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", application.provisionedOrganizationId!)).unique()
      : await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", provisioningIdentifiers(application.publicId, application.gymName).organizationPublicId)).unique();
    if (!organization) domainError("NOT_FOUND", "The provisioned gym workspace could not be found.", { correlationId: args.correlationId });
    const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", user._id)).unique();
    if (!membership) domainError("NOT_FOUND", "The gym owner membership could not be found.", { correlationId: args.correlationId });
    // Re-read immediately before recording the provider result. An owner can
    // accept an invitation while the external request is in flight; never
    // overwrite that accepted/legacy-active membership with a new pending id.
    if (legacyOwnerMembershipAccepted(membership, user)) {
      return { status: "accepted" as const, clerkInvitationId: membership.clerkInvitationId ?? application.clerkInvitationId };
    }
    const now = Date.now();
    await ctx.db.patch(membership._id, { clerkInvitationId: args.clerkInvitationId, clerkInvitationStatus: "pending", invitationSentAt: membership.invitationSentAt ?? now, invitationLastAttemptAt: now, invitationError: undefined, invitationStatus: membership.invitationStatus === "accepted" ? "accepted" : "pending", updatedAt: now });
    await ctx.db.patch(application._id, { clerkInvitationId: args.clerkInvitationId, clerkInvitationStatus: "pending", provisioningCheckpoint: "invitation_recorded", provisioningOutcome: "partial", provisioningLastCorrelationId: args.correlationId, updatedAt: now });
    return { status: "pending" as const, clerkInvitationId: args.clerkInvitationId };
  },
});

export const fail = internalMutation({
  args: {
    applicationId: v.string(),
    message: v.string(),
    correlationId: v.string(),
    leaseId: v.string(),
    outcome: v.optional(v.union(v.literal("retryable"), v.literal("permanent"))),
    providerStatus: v.optional(v.number()),
    providerCode: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const admin = await requirePlatformAdmin(ctx, args.correlationId);
    const application = await applicationById(ctx, args.applicationId);
    // The external Clerk action can lose its response after this mutation has
    // committed. A late catch must never overwrite a durable completed
    // application or emit a false failure notification for a usable gym.
    if (application.provisioningStatus === "completed") {
      return { status: "completed" as const };
    }
    if (application.provisioningStatus !== "in_progress" || application.provisioningLeaseId !== args.leaseId || application.provisioningLastCorrelationId !== args.correlationId) {
      return { status: "stale" as const };
    }
    const now = Date.now();
    const message = args.message.slice(0, 500);
    const ids = provisioningIdentifiers(application.publicId, application.gymName);
    const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", ids.organizationPublicId)).unique();
    const partial = Boolean(organization || application.clerkOrganizationId || application.clerkInvitationId || application.provisionedBranchId || application.provisioningCheckpoint === "workspace_ready" || application.provisioningCheckpoint === "invitation_recorded");
    const outcome: ProvisioningOutcome = args.outcome ?? (partial ? "partial" : "retryable");
    await ctx.db.patch(application._id, { provisioningStatus: "failed", provisioningOutcome: outcome, provisioningStartedAt: undefined, provisioningLeaseId: undefined, provisioningError: message, provisioningLastCorrelationId: args.correlationId, provisioningProviderStatus: args.providerStatus, provisioningProviderCode: args.providerCode?.slice(0, 120), updatedAt: now });
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
      after: { provisioningStatus: "failed", provisioningOutcome: outcome, provisioningCheckpoint: application.provisioningCheckpoint ?? "claimed", providerStatus: args.providerStatus, providerCode: args.providerCode?.slice(0, 120) },
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
    return { status: "failed" as const, outcome };
  },
});

export const complete = internalMutation({
  args: { applicationId: v.string(), clerkInvitationId: v.optional(v.string()), correlationId: v.string(), leaseId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const admin = await requirePlatformAdmin(ctx, args.correlationId);
    const application = await applicationById(ctx, args.applicationId);
    const ids = provisioningIdentifiers(application.publicId, application.gymName);
    if (application.provisioningStatus === "completed" && application.provisionedOrganizationId) {
      const completedOrganization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", application.provisionedOrganizationId!)).unique();
      const completedBranch = completedOrganization ? await authoritativeProvisioningBranch(ctx, completedOrganization, application) : null;
      if (completedOrganization && completedBranch) return organizationResult(application, completedOrganization, completedBranch);
    }
    const leasedApplication = await applicationForLease(ctx, args);
    const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", ids.organizationPublicId)).unique();
    const branch = organization ? await authoritativeProvisioningBranch(ctx, organization, leasedApplication) : null;
    if (!organization) domainError("INTERNAL_ERROR", "Workspace provisioning is incomplete.", { correlationId: args.correlationId });
    if (!branch) {
      const candidates = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect();
      domainError(candidates.length > 0 ? "CONFLICT" : "INTERNAL_ERROR", candidates.length > 0 ? "The initial gym branch cannot be identified safely; manual correction is required before retrying." : "Workspace provisioning is incomplete.", { correlationId: args.correlationId });
    }
    const now = Date.now();
    const owner = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", leasedApplication.email)).unique();
    const membership = owner
      ? await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organization._id).eq("userId", owner._id)).unique()
      : null;
    const ownerAccepted = legacyOwnerMembershipAccepted(membership, owner);
    const clerkInvitationId = ownerAccepted ? membership?.clerkInvitationId : args.clerkInvitationId ?? leasedApplication.clerkInvitationId;
    await ctx.db.patch(leasedApplication._id, {
      provisioningStatus: "completed",
      provisioningCheckpoint: "completed",
      provisioningOutcome: "complete",
      provisioningStartedAt: undefined,
      provisioningError: undefined,
      provisioningLeaseId: undefined,
      provisioningLastCorrelationId: args.correlationId,
      provisionedAt: now,
      provisionedOrganizationId: publicOrganizationId(organization),
      provisionedBranchId: publicBranchId(branch),
      ...(clerkInvitationId ? { clerkInvitationId, clerkInvitationStatus: ownerAccepted ? "accepted" as const : "pending" as const } : ownerAccepted ? { clerkInvitationId: undefined, clerkInvitationStatus: "accepted" as const } : {}),
      updatedAt: now,
    });

    // The workspace mutation already creates the owner membership. Persist
    // the external invitation id opportunistically in this same finalization
    // transaction; do not make a successful Clerk invite look like a failed
    // provisioning run solely because this bookkeeping row is unavailable.
    if (clerkInvitationId && membership && !ownerAccepted) {
      await ctx.db.patch(membership._id, { clerkInvitationId, clerkInvitationStatus: "pending", invitationSentAt: membership.invitationSentAt ?? now, invitationLastAttemptAt: now, invitationError: undefined, invitationStatus: "pending", updatedAt: now });
    }

    // A retry after an external provider failure can leave a historical
    // failure notification behind even though this attempt completed. Failure
    // audit events remain immutable, but the operational alert is no longer
    // actionable and should not continue to badge the platform console.
    await dismissProvisioningFailureNotifications(ctx, application.publicId, now);
    const auditRows = await ctx.db.query("platformAuditEvents").withIndex("by_entity", (q) => q.eq("entityType", "gym_application").eq("entityPublicId", application.publicId)).collect();
    if (!auditRows.some((row) => row.action === "gym.provisioned")) {
      await ctx.db.insert("platformAuditEvents", { publicId: crypto.randomUUID(), actorUserId: admin.user._id, actorPublicId: publicUserId(admin.user), actorName: admin.user.fullName, action: "gym.provisioned", entityType: "gym_application", entityPublicId: leasedApplication.publicId, entityLabel: leasedApplication.gymName, summary: `Provisioned ${leasedApplication.gymName} and invited the owner`, after: { organizationId: publicOrganizationId(organization), branchId: publicBranchId(branch), clerkOrganizationId: leasedApplication.clerkOrganizationId, clerkInvitationId: clerkInvitationId ?? leasedApplication.clerkInvitationId, provisioningOutcome: "complete" }, correlationId: args.correlationId, occurredAt: now });
    }
    const updated = await ctx.db.get(leasedApplication._id);
    if (!updated) domainError("INTERNAL_ERROR", "The provisioning result could not be read.", { correlationId: args.correlationId });
    return organizationResult(updated, organization, branch);
  },
});
