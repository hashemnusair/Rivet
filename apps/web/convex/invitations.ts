import { ConvexError, v } from "convex/values";
import { action, internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { domainError, publicOrganizationId, publicUserId, requireActor, requirePermission, type OrganizationRole } from "./security";
import { rolePermissions, toFrontendRole } from "./permissions";

type Data = Record<string, unknown>;

interface PreparedInvitation {
  membershipId: Id<"organizationMemberships">;
  organizationDocumentId: Id<"organizations">;
  userPublicId: string;
  organizationId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  branchScope: "all" | "selected";
  branchIds: string[];
  status: "invited";
  invitedAt: string;
  actorUserId: Id<"users">;
  actorPublicId: string;
  actorName: string;
  actorRole: OrganizationRole;
}

const inviteArgs = {
  organizationId: v.string(),
  input: v.any(),
  correlationId: v.string(),
};

function record(input: unknown): Data {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Data) : {};
}

function stringValue(input: unknown, fallback = ""): string {
  return typeof input === "string" ? input : fallback;
}

function optionalString(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

function roleFromFrontend(input: unknown, correlationId: string): OrganizationRole {
  const role = stringValue(input);
  const normalized = role === "salesperson" ? "sales" : role;
  if (!["owner", "manager", "sales", "receptionist", "trainer", "auditor"].includes(normalized)) {
    domainError("VALIDATION_ERROR", "A valid staff role is required.", { correlationId });
  }
  return normalized as OrganizationRole;
}

function publicId(user: Doc<"users">): string {
  return publicUserId(user);
}

async function prepareInvitation(ctx: MutationCtx, input: Data, organizationId: string, correlationId: string): Promise<PreparedInvitation> {
  const actor = await requireActor(ctx, { organizationId, correlationId });
  requirePermission(actor, "users.manage");

  const email = stringValue(input.email).trim().toLowerCase();
  const name = stringValue(input.name).trim();
  if (!email || !email.includes("@") || !name) {
    domainError("VALIDATION_ERROR", "A valid name and email are required.", { correlationId });
  }

  const role = roleFromFrontend(input.role, correlationId);
  const branchScope = stringValue(input.branchScope, "selected") === "all" ? "all" : "selected";
  if (branchScope === "all" && actor.branchScope !== "all") {
    domainError("FORBIDDEN", "You cannot grant access to every branch.", { correlationId });
  }
  const configuredRole = await ctx.db
    .query("roleDefinitions")
    .withIndex("by_organization_role", (q) => q.eq("organizationId", actor.organization._id).eq("role", role))
    .unique();
  const targetPermissions = configuredRole?.permissions ?? rolePermissions(role);
  if (targetPermissions.some((permission) => !actor.permissions.includes(permission))) {
    domainError("FORBIDDEN", "You cannot grant permissions your role does not possess.", { correlationId });
  }

  const requestedBranchIds = Array.isArray(input.branchIds) ? input.branchIds.map(String) : [];
  if (branchScope === "selected" && requestedBranchIds.length === 0) {
    domainError("VALIDATION_ERROR", "Select at least one branch for selected branch access.", { correlationId });
  }
  const branchIds: Id<"branches">[] = [];
  for (const branchId of requestedBranchIds) {
    const branch = await ctx.db
      .query("branches")
      .withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", branchId))
      .unique();
    if (!branch || !branch.active || (actor.branchScope === "selected" && !actor.branchIds.includes(branch._id))) {
      domainError("NOT_FOUND", "Branch not found.", { correlationId });
    }
    branchIds.push(branch._id);
  }

  const existing = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).unique();
  if (existing?.status === "deactivated") domainError("FORBIDDEN", "This account is deactivated.", { correlationId });

  let user = existing;
  if (!user) {
    const userId = await ctx.db.insert("users", {
      publicId: crypto.randomUUID(),
      authSubject: `invite:${email}`,
      email,
      fullName: name,
      phone: optionalString(input.phone),
      platformAdmin: false,
      status: "invited",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    user = await ctx.db.get(userId);
  }
  if (!user) domainError("NOT_FOUND", "User could not be invited.", { correlationId });

  const now = Date.now();
  const membership = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_organization_user", (q) => q.eq("organizationId", actor.organization._id).eq("userId", user._id))
    .unique();
  let membershipId: Id<"organizationMemberships">;
  if (membership) {
    membershipId = membership._id;
    await ctx.db.patch(membership._id, {
      role,
      branchIds,
      branchScope,
      active: true,
      invitationStatus: "pending",
      invitedAt: now,
      invitationError: undefined,
      updatedAt: now,
    });
  } else {
    membershipId = await ctx.db.insert("organizationMemberships", {
      organizationId: actor.organization._id,
      userId: user._id,
      role,
      branchIds,
      branchScope,
      active: true,
      invitationStatus: "pending",
      invitedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (!existing) await ctx.db.patch(user._id, { status: "invited", updatedAt: now });

  await ctx.db.insert("auditEvents", {
    organizationId: actor.organization._id,
    publicId: crypto.randomUUID(),
    actorUserId: actor.user._id,
    actorPublicId: publicUserId(actor.user),
    actorName: actor.user.fullName,
    actorRole: actor.role,
    category: "users",
    action: "user.invite.requested",
    entityType: "user",
    entityPublicId: publicId(user),
    entityLabel: user.fullName,
    summary: `Invitation requested for ${email}`,
    correlationId,
    occurredAt: now,
  });

  return {
    membershipId,
    organizationDocumentId: actor.organization._id,
    userPublicId: publicId(user),
    organizationId: publicOrganizationId(actor.organization),
    name: user.fullName,
    email: user.email,
    phone: user.phone ?? "",
    role: toFrontendRole(role),
    branchScope,
    branchIds: requestedBranchIds,
    status: "invited" as const,
    invitedAt: new Date(now).toISOString(),
    actorUserId: actor.user._id,
    actorPublicId: publicUserId(actor.user),
    actorName: actor.user.fullName,
    actorRole: actor.role,
  };
}

export const prepare = internalMutation({
  args: inviteArgs,
  returns: v.any(),
  handler: async (ctx, args) => await prepareInvitation(ctx, record(args.input), args.organizationId, args.correlationId),
});

export const markSent = internalMutation({
  args: {
    membershipId: v.id("organizationMemberships"),
    clerkInvitationId: v.string(),
    sentAt: v.number(),
    organizationId: v.id("organizations"),
    actorUserId: v.id("users"),
    actorPublicId: v.string(),
    actorName: v.string(),
    actorRole: v.union(v.literal("owner"), v.literal("manager"), v.literal("sales"), v.literal("receptionist"), v.literal("trainer"), v.literal("auditor")),
    userPublicId: v.string(),
    userName: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.membershipId, { clerkInvitationId: args.clerkInvitationId, invitationSentAt: args.sentAt, invitationLastAttemptAt: args.sentAt, invitationError: undefined, invitationStatus: "pending", updatedAt: args.sentAt });
    await ctx.db.insert("auditEvents", {
      organizationId: args.organizationId,
      publicId: crypto.randomUUID(),
      actorUserId: args.actorUserId,
      actorPublicId: args.actorPublicId,
      actorName: args.actorName,
      actorRole: args.actorRole,
      category: "users",
      action: "user.invite.sent",
      entityType: "user",
      entityPublicId: args.userPublicId,
      entityLabel: args.userName,
      summary: "Clerk invitation sent",
      correlationId: args.correlationId,
      occurredAt: args.sentAt,
    });
    return undefined;
  },
});

export const markFailed = internalMutation({
  args: {
    membershipId: v.id("organizationMemberships"),
    attemptedAt: v.number(),
    message: v.string(),
    organizationId: v.id("organizations"),
    actorUserId: v.id("users"),
    actorPublicId: v.string(),
    actorName: v.string(),
    actorRole: v.union(v.literal("owner"), v.literal("manager"), v.literal("sales"), v.literal("receptionist"), v.literal("trainer"), v.literal("auditor")),
    userPublicId: v.string(),
    userName: v.string(),
    correlationId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.membershipId, { invitationLastAttemptAt: args.attemptedAt, invitationError: args.message, updatedAt: args.attemptedAt });
    await ctx.db.insert("auditEvents", {
      organizationId: args.organizationId,
      publicId: crypto.randomUUID(),
      actorUserId: args.actorUserId,
      actorPublicId: args.actorPublicId,
      actorName: args.actorName,
      actorRole: args.actorRole,
      category: "users",
      action: "user.invite.failed",
      entityType: "user",
      entityPublicId: args.userPublicId,
      entityLabel: args.userName,
      summary: "Clerk invitation delivery failed",
      correlationId: args.correlationId,
      occurredAt: args.attemptedAt,
      details: { reason: args.message },
    });
    return undefined;
  },
});

export const send = action({
  args: inviteArgs,
  returns: v.any(),
  handler: async (ctx, args): Promise<PreparedInvitation> => {
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) {
      throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Clerk invitation delivery is not configured." } as never);
    }

    const prepared: PreparedInvitation = await ctx.runMutation(internal.invitations.prepare, args);
    const response = await fetch("https://api.clerk.com/v1/invitations", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email_address: prepared.email,
        notify: true,
        public_metadata: { rivetOrganizationId: prepared.organizationId, rivetUserId: prepared.userPublicId },
      }),
    });

    if (!response.ok) {
      await ctx.runMutation(internal.invitations.markFailed, { membershipId: prepared.membershipId, attemptedAt: Date.now(), message: `Clerk invitation failed with HTTP ${response.status}.`, organizationId: prepared.organizationDocumentId, actorUserId: prepared.actorUserId, actorPublicId: prepared.actorPublicId, actorName: prepared.actorName, actorRole: prepared.actorRole, userPublicId: prepared.userPublicId, userName: prepared.name, correlationId: args.correlationId });
      throw new ConvexError({ code: "EXTERNAL_SERVICE_ERROR", message: "The staff invitation could not be delivered." } as never);
    }

    const payload = await response.json() as { id?: unknown };
    const clerkInvitationId = stringValue(payload.id);
    if (!clerkInvitationId) {
      await ctx.runMutation(internal.invitations.markFailed, { membershipId: prepared.membershipId, attemptedAt: Date.now(), message: "Clerk returned no invitation identifier.", organizationId: prepared.organizationDocumentId, actorUserId: prepared.actorUserId, actorPublicId: prepared.actorPublicId, actorName: prepared.actorName, actorRole: prepared.actorRole, userPublicId: prepared.userPublicId, userName: prepared.name, correlationId: args.correlationId });
      throw new ConvexError({ code: "EXTERNAL_SERVICE_ERROR", message: "The staff invitation response was incomplete." } as never);
    }
    const sentAt = Date.now();
    await ctx.runMutation(internal.invitations.markSent, {
      membershipId: prepared.membershipId,
      clerkInvitationId,
      sentAt,
      organizationId: prepared.organizationDocumentId,
      actorUserId: prepared.actorUserId,
      actorPublicId: prepared.actorPublicId,
      actorName: prepared.actorName,
      actorRole: prepared.actorRole,
      userPublicId: prepared.userPublicId,
      userName: prepared.name,
      correlationId: args.correlationId,
    });
    return prepared;
  },
});
