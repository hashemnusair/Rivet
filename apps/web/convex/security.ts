import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { DEFAULT_ROLE_DEFINITIONS, rolePermissions, type Permission } from "./permissions";

export type OrganizationRole = "owner" | "manager" | "sales" | "receptionist" | "trainer" | "auditor";
export type AccountStatus = "active" | "invited" | "deactivated";
export type ReadCtx = QueryCtx | MutationCtx;

export interface RequestArgs {
  organizationId?: string;
  branchId?: string;
  activeBranchId?: string;
  correlationId?: string;
}

/**
 * A membership row is routable only after its invitation has been accepted.
 * `undefined` remains a legacy-accepted value for rows written before the
 * invitationStatus field existed; new invitation rows always write an
 * explicit status. Pending/revoked/unknown rows are never treated as
 * workspace access, even when their historical `active` flag was left true.
 */
export function membershipInvitationAccepted(membership: MaybeMembership): boolean {
  return Boolean(membership && (membership.invitationStatus === undefined || membership.invitationStatus === "accepted"));
}

export interface ActorContext {
  user: NonNullable<Awaited<ReturnType<typeof findUser>>>;
  organization: NonNullable<Awaited<ReturnType<typeof findOrganization>>>;
  membership: NonNullable<Awaited<ReturnType<typeof findMembership>>>;
  role: OrganizationRole;
  permissions: string[];
  branchIds: Id<"branches">[];
  branchScope: "all" | "selected";
  branch?: NonNullable<Awaited<ReturnType<typeof findBranch>>>;
  correlationId: string;
}

type MaybeUser = {
  _id: Id<"users">;
  _creationTime: number;
  publicId?: string;
  authSubject: string;
  email: string;
  fullName: string;
  phone?: string;
  platformAdmin: boolean;
  status?: AccountStatus;
  createdAt: number;
  updatedAt: number;
} | null;

type MaybeOrganization = {
  _id: Id<"organizations">;
  _creationTime: number;
  publicId?: string;
  name: string;
  slug: string;
  status: "trial" | "active" | "past_due" | "suspended" | "cancelled";
  subscriptionPlan?: "Starter" | "Growth" | "Pro" | "Enterprise";
  subscriptionStartedAt?: number;
  trialEndsAt?: number;
  currentPeriodEndsAt?: number;
  cancelledAt?: number;
  subscriptionStatusReason?: string;
  archivedAt?: number;
  archiveReason?: string;
  archivedByUserId?: Id<"users">;
  clerkOrganizationId?: string;
  timezone: string;
  currency: string;
  locale?: string;
  defaultLanguage?: "en" | "ar";
  taxRatePercent?: number;
  receiptPrefix?: string;
  nextReceiptNumber?: number;
  receiptFooter?: string;
  createdAt: number;
  updatedAt: number;
} | null;

type MaybeMembership = {
  _id: Id<"organizationMemberships">;
  _creationTime: number;
  organizationId: Id<"organizations">;
  userId: Id<"users">;
  role: OrganizationRole;
  branchIds: Id<"branches">[];
  active: boolean;
  branchScope?: "all" | "selected";
  invitationStatus?: "pending" | "accepted" | "revoked";
  invitedAt?: number;
  createdAt: number;
  updatedAt: number;
} | null;

type MaybeBranch = {
  _id: Id<"branches">;
  _creationTime: number;
  organizationId: Id<"organizations">;
  publicId?: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  capacity?: number;
  active: boolean;
  status?: "active" | "inactive";
  createdAt: number;
  updatedAt: number;
} | null;

export function domainError(
  code: string,
  message: string,
  extra?: { details?: Record<string, unknown>; fieldErrors?: Record<string, string[]>; correlationId?: string },
): never {
  const payload = {
    code,
    message,
    requestId: extra?.correlationId ?? newCorrelationId(),
    ...(extra?.details ? { details: extra.details } : {}),
    ...(extra?.fieldErrors ? { fieldErrors: extra.fieldErrors } : {}),
  };
  // ConvexError accepts the serializable Convex Value union. The payload is
  // deliberately an API error object whose nested records are validated at
  // the call sites, so the cast is isolated to this error boundary.
  throw new ConvexError(payload as never);
}

export function newCorrelationId(): string {
  return `cor-${crypto.randomUUID()}`;
}

export function requireReason(reason: unknown, correlationId?: string, field = "reason"): asserts reason is string {
  if (typeof reason !== "string" || !reason.trim()) {
    domainError("VALIDATION_ERROR", "A reason is required for this action.", {
      fieldErrors: { [field]: ["Required"] },
      correlationId,
    });
  }
}

async function findUser(ctx: ReadCtx, authSubject: string): Promise<MaybeUser> {
  return (await ctx.db
    .query("users")
    .withIndex("by_auth_subject", (q) => q.eq("authSubject", authSubject))
    .unique()) as MaybeUser;
}

async function findOrganization(ctx: ReadCtx, publicId?: string): Promise<MaybeOrganization> {
  if (!publicId) return null;
  return (await ctx.db
    .query("organizations")
    .withIndex("by_public_id", (q) => q.eq("publicId", publicId))
    .unique()) as MaybeOrganization;
}

async function findMembership(ctx: ReadCtx, organizationId: Id<"organizations">, userId: Id<"users">): Promise<MaybeMembership> {
  return (await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization_user", (q) => q.eq("organizationId", organizationId).eq("userId", userId))
    .unique()) as MaybeMembership;
}

async function findBranch(ctx: ReadCtx, organizationId: Id<"organizations">, publicId?: string): Promise<MaybeBranch> {
  if (!publicId) return null;
  return (await ctx.db
    .query("branches")
    .withIndex("by_organization_public_id", (q) => q.eq("organizationId", organizationId).eq("publicId", publicId))
    .unique()) as MaybeBranch;
}

async function firstActiveMembership(ctx: ReadCtx, userId: Id<"users">): Promise<MaybeMembership> {
  const rows = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const routable = [];
  for (const row of rows) {
    if (!row.active || !membershipInvitationAccepted(row as MaybeMembership)) continue;
    const organization = await ctx.db.get(row.organizationId);
    if (!organization || !["trial", "active", "past_due"].includes(organization.status)) continue;
    routable.push({ row, organization });
  }
  if (routable.length > 1) {
    domainError("ORGANIZATION_SELECTION_REQUIRED", "Select a gym workspace before continuing.", {
      details: { membershipCount: routable.length },
    });
  }
  return (routable[0]?.row ?? null) as MaybeMembership;
}

export async function requireAuthenticated(ctx: ReadCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) domainError("UNAUTHENTICATED", "Authentication is required.");

  const user = await findUser(ctx, identity.subject);
  // Invitation rows are deliberately inert until users.ensureCurrent claims
  // the Clerk identity and promotes the row to active. Keeping this check in
  // the shared authentication kernel prevents a caller from skipping that
  // bootstrap mutation and using an invited staff/owner row directly.
  if (!user || user.status === "deactivated" || user.status === "invited") {
    domainError("UNAUTHENTICATED", "This account is not active in RIVET.");
  }
  return { identity, user } as { identity: NonNullable<typeof identity>; user: NonNullable<MaybeUser> };
}

/**
 * Member-only operations must not be reachable by platform administrators or
 * gym staff. Those accounts have a higher-priority workspace and should never
 * be silently provisioned a consumer profile just because they opened a
 * member URL or called the customer API directly.
 */
export async function requireMember(ctx: ReadCtx) {
  const { identity, user } = await requireAuthenticated(ctx);
  if (user.platformAdmin) {
    domainError("FORBIDDEN", "Platform administrators must use the platform workspace.");
  }

  const memberships = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  if (memberships.some((membership) => membership.active && membershipInvitationAccepted(membership as MaybeMembership))) {
    domainError("FORBIDDEN", "Gym team accounts must use their gym workspace.");
  }

  return { identity, user } as { identity: NonNullable<typeof identity>; user: NonNullable<MaybeUser> };
}

export async function requireActor(ctx: ReadCtx, args: RequestArgs = {}): Promise<ActorContext> {
  const { user } = await requireAuthenticated(ctx);
  const membership = args.organizationId
    ? await (async () => {
        const organization = await findOrganization(ctx, args.organizationId);
        if (!organization) domainError("NOT_FOUND", "Organization not found.");
        return await findMembership(ctx, organization._id, user._id);
      })()
    : await firstActiveMembership(ctx, user._id);

  if (!membership || !membership.active) {
    domainError("FORBIDDEN", "You are not an active member of this organization.");
  }

  if (!membershipInvitationAccepted(membership)) {
    // Deliberately do not distinguish pending, revoked, or failed invitation
    // state to callers. The invitation flow must prove acceptance before a
    // workspace becomes routable; an email match alone is not sufficient.
    domainError("FORBIDDEN", "This workspace invitation has not been accepted.");
  }

  const organization = (await ctx.db.get(membership.organizationId)) as MaybeOrganization;
  if (!organization || organization.status === "suspended" || organization.status === "cancelled") {
    domainError("FORBIDDEN", "This organization is not available.");
  }

  const roleDefinition = await ctx.db
    .query("roleDefinitions")
    .withIndex("by_organization_role", (q) => q.eq("organizationId", organization._id).eq("role", membership.role))
    .unique();
  const role = membership.role;
  const branchScope = membership.branchScope ?? (role === "owner" || role === "manager" ? "all" : "selected");
  const organizationBranches = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect();
  const activeBranchIds = new Set(organizationBranches.filter((candidate) => candidate.active && candidate.status !== "inactive").map((candidate) => candidate._id));
  const branchIds = branchScope === "all"
    ? organizationBranches.filter((branch) => activeBranchIds.has(branch._id)).map((branch) => branch._id)
    : membership.branchIds.filter((branchId) => activeBranchIds.has(branchId));
  const requestedBranchId = args.branchId ?? args.activeBranchId;
  const branch = requestedBranchId ? await findBranch(ctx, organization._id, requestedBranchId) : null;

  // Never treat a stale, inactive, or foreign active-branch selection as if
  // no branch had been selected. That would silently widen a selected actor's
  // read scope and allow a mutation that omitted its own branch field to run
  // against an unintended workspace. A selected actor with multiple branches
  // must also make an explicit choice before any operation proceeds.
  if (requestedBranchId && !branch) {
    domainError("FORBIDDEN", "You do not have access to this branch.");
  }

  if (branch && (!branch.active || branch.organizationId !== organization._id || (branchScope === "selected" && !branchIds.includes(branch._id)))) {
    domainError("FORBIDDEN", "You do not have access to this branch.");
  }

  if (!requestedBranchId && branchScope === "selected" && branchIds.length > 1) {
    domainError("ORGANIZATION_SELECTION_REQUIRED", "Select a branch before continuing.", {
      details: { branchCount: branchIds.length },
    });
  }
  if (!requestedBranchId && branchScope === "selected" && branchIds.length === 0) {
    domainError("FORBIDDEN", "No active branch is available for this workspace.");
  }

  return {
    user,
    organization: organization as NonNullable<MaybeOrganization>,
    membership: membership as NonNullable<MaybeMembership>,
    role,
    permissions: rolePermissions(role, roleDefinition?.permissions, roleDefinition?.catalogVersion),
    branchIds,
    branchScope,
    branch: branch ?? undefined,
    correlationId: args.correlationId ?? newCorrelationId(),
  };
}

export async function requirePlatformAdmin(ctx: ReadCtx, correlationId?: string) {
  const { user } = await requireAuthenticated(ctx);
  if (!user.platformAdmin) domainError("FORBIDDEN", "Platform administrator access is required.", { correlationId });
  return { user, correlationId: correlationId ?? newCorrelationId() };
}

export function requirePermission(actor: ActorContext, permission: Permission): void {
  if (!actor.permissions.includes(permission)) {
    domainError("FORBIDDEN", `Your role is missing the ${permission} permission.`, { correlationId: actor.correlationId });
  }
}

export function hasPermission(actor: ActorContext, permission: Permission): boolean {
  return actor.permissions.includes(permission);
}

export function assertBranchAccess(actor: ActorContext, branch: MaybeBranch | undefined | null): asserts branch is NonNullable<MaybeBranch> {
  if (!branch || !branch.active || branch.organizationId !== actor.organization._id) {
    domainError("NOT_FOUND", "Branch not found.", { correlationId: actor.correlationId });
  }
  if (actor.branchScope === "selected" && !actor.branchIds.includes(branch._id)) {
    domainError("FORBIDDEN", "You do not have access to this branch.", { correlationId: actor.correlationId });
  }
}

export function publicOrganizationId(organization: MaybeOrganization): string {
  return organization?.publicId ?? organization?._id ?? "";
}

export function publicBranchId(branch: MaybeBranch): string {
  return branch?.publicId ?? branch?._id ?? "";
}

export function publicUserId(user: MaybeUser): string {
  return user?.publicId ?? user?._id ?? "";
}

export function assertNonEmptyString(value: unknown, field: string, correlationId?: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    domainError("VALIDATION_ERROR", `${field} is required.`, { fieldErrors: { [field]: ["Required"] }, correlationId });
  }
}

export function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export { DEFAULT_ROLE_DEFINITIONS };
