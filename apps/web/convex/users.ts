import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query, type ActionCtx, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { membershipInvitationAccepted } from "./security";
import { enforcePublicRateLimit, privacyFingerprint } from "./publicAbuse";
import type { Id } from "./_generated/dataModel";

type SafeUser = {
  id: string;
  publicId: string;
  email: string;
  fullName: string;
  phone?: string;
  platformAdmin: boolean;
  status: "active";
};

function safeUserProjection(user: {
  publicId?: string;
  email: string;
  fullName: string;
  phone?: string;
  platformAdmin: boolean;
  status?: "active" | "invited" | "deactivated";
}): SafeUser {
  // Keep this projection intentionally explicit. Returning a Convex document
  // here would leak authSubject and storage metadata to every signed-in
  // browser, and would make future sensitive columns public by accident.
  // User records created by the application always have a publicId. If an
  // old/malformed row does not, fail closed rather than turning Convex's
  // internal document id into a browser-visible identifier.
  const publicId = user.publicId ?? "";
  return {
    id: publicId,
    publicId,
    email: user.email,
    fullName: user.fullName,
    ...(user.phone ? { phone: user.phone } : {}),
    platformAdmin: user.platformAdmin,
    status: "active",
  };
}

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
    return safeUserProjection(user);
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
    // A real Clerk subject does not prove that this account accepted the
    // RIVET invitation. Only the provider-verified claim mutation may move an
    // invited row to active; ensureCurrent must never do that implicitly.
    if (existing.status === "invited") throw new Error("INVITATION_NOT_ACCEPTED");
    const nextEmail = email || existing.email;
    await ctx.db.patch(existing._id, { email: nextEmail, fullName, status: "active", updatedAt: now });
    return { ...existing, email: nextEmail, fullName, status: "active" as const, updatedAt: now };
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

    if (invited) {
      if (invited.status === "deactivated") throw new Error("UNAUTHENTICATED");

      // `invite:` is a durable placeholder, never a credential. Even an
      // accepted legacy membership cannot be claimed here because an email
      // match does not prove that the Clerk invitation ticket was accepted by
      // this identity. The Clerk-backed claimInvitation action performs that
      // provider check and is the only path that promotes invitation rows.
      if (invited.authSubject.startsWith("invite:")) throw new Error("INVITATION_NOT_ACCEPTED");
      // An email match is not proof that the caller owns a real existing
      // Clerk identity. Refuse to create a second row or claim the first row.
      if (!invited.authSubject.startsWith("seed:")) throw new Error("IDENTITY_EMAIL_CONFLICT");

      const memberships = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_user", (q) => q.eq("userId", invited._id))
        .collect();
      const acceptedMembership = memberships.some((membership) => membership.active && membershipInvitationAccepted(membership));
      const pendingMembership = memberships.some((membership) => membership.active && !membershipInvitationAccepted(membership));

      // Seed records are development fixtures, not invitation placeholders.
      // Keep this compatibility branch narrowly scoped to those records.
      if (pendingMembership || (invited.status !== "active" && !acceptedMembership)) {
        throw new Error("UNAUTHENTICATED");
      }

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

interface InvitationCandidate {
  userId: Id<"users">;
  membershipId: Id<"organizationMemberships">;
  userPublicId: string;
  email: string;
  organizationId: Id<"organizations">;
  organizationPublicId: string;
  clerkInvitationId: string;
  clerkOrganizationId?: string;
  /**
   * Platform-owner invitations are created on the Clerk organization and are
   * bound to the approved local application. Staff invitations use the
   * instance invitation API and keep their user-metadata proof instead.
   */
  providerKind: "organization" | "generic";
  applicationPublicId?: string;
}

/** Internal lookup used only by the Clerk-backed claim action. */
export const claimCandidates = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args): Promise<InvitationCandidate[]> => {
    const email = args.email.trim().toLowerCase();
    if (!email) return [];
    const user = await ctx.db.query("users").withIndex("by_email", (q) => q.eq("email", email)).unique();
    if (!user || user.status === "deactivated") return [];

    const memberships = await ctx.db.query("organizationMemberships").withIndex("by_user", (q) => q.eq("userId", user._id)).collect();
    const applications = await ctx.db.query("gymApplications").withIndex("by_email", (q) => q.eq("email", email)).collect();
    const candidates: InvitationCandidate[] = [];
    for (const membership of memberships) {
      if (!membership.active || membership.invitationStatus !== "pending" || !membership.clerkInvitationId) continue;
      const organization = await ctx.db.get(membership.organizationId);
      // Provider metadata is the binding proof. Legacy rows without public
      // identifiers cannot be matched safely, so leave them pending until a
      // controlled migration repairs the identity rather than comparing
      // against internal Convex ids.
      if (!organization?.publicId || !user.publicId) continue;

      // A platform provisioning invitation is the only invitation that may
      // be claimed from an accepted organization membership. The local
      // application row is the server-owned binding between the approval,
      // organization, and Clerk invitation. Generic staff invitations do not
      // have this row and remain on the instance-invitation/user-metadata
      // path below.
      const application = applications.find((row) =>
        row.provisionedOrganizationId === organization.publicId
        && row.clerkInvitationId === membership.clerkInvitationId
        && row.email.trim().toLowerCase() === user.email.trim().toLowerCase(),
      );
      candidates.push({
        userId: user._id,
        membershipId: membership._id,
        userPublicId: user.publicId,
        email: user.email,
        organizationId: organization._id,
        organizationPublicId: organization.publicId,
        clerkInvitationId: membership.clerkInvitationId,
        clerkOrganizationId: organization.clerkOrganizationId ?? application?.clerkOrganizationId,
        providerKind: application ? "organization" : "generic",
        ...(application?.publicId ? { applicationPublicId: application.publicId } : {}),
      });
    }
    return candidates;
  },
});

/**
 * Reserve a bounded provider-verification attempt. This is an internal
 * mutation so the action can use the shared privacy-safe guard without
 * importing MutationCtx-only logic into the action layer. Subject and email
 * are throttled independently so changing one identifier cannot evade the
 * limit on the other.
 */
export const reserveInvitationClaim = internalMutation({
  args: { subject: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const subject = args.subject.trim();
    const email = args.email.trim().toLowerCase();
    await enforcePublicRateLimit(ctx, {
      scope: "invitation_claim_subject",
      fingerprint: await privacyFingerprint(subject),
      maxRequests: 5,
      windowMs: 10 * 60 * 1000,
    });
    await enforcePublicRateLimit(ctx, {
      scope: "invitation_claim_email",
      fingerprint: await privacyFingerprint(email),
      maxRequests: 5,
      windowMs: 10 * 60 * 1000,
    });
    return { reserved: true } as const;
  },
});

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function clerkRequest(secret: string, url: string): Promise<{ ok: boolean; status: number; payload: unknown }> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = undefined;
  }
  return { ok: response.ok, status: response.status, payload };
}

function listPayload(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  const record = objectValue(value);
  const list = Array.isArray(record.data) ? record.data : Array.isArray(record.items) ? record.items : [];
  return list.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

function providerMetadata(value: Record<string, unknown>): Record<string, unknown> {
  return objectValue(value.public_metadata ?? value.publicMetadata);
}

function providerEmail(value: Record<string, unknown>): string | undefined {
  const publicUser = objectValue(value.public_user_data ?? value.publicUserData);
  return stringValue(value.email_address ?? value.emailAddress ?? publicUser.identifier)?.toLowerCase();
}

function providerUserId(value: Record<string, unknown>): string | undefined {
  const publicUser = objectValue(value.public_user_data ?? value.publicUserData);
  return stringValue(value.user_id ?? value.userId ?? publicUser.user_id ?? publicUser.userId);
}

async function providerGenericInvitationAccepted(secret: string, candidate: InvitationCandidate): Promise<boolean> {
  // Clerk's instance-invitation API exposes a list rather than a get-by-id
  // endpoint. Match the durable invitation id locally; `query` is not a
  // portable Backend API filter.
  const response = await clerkRequest(secret, "https://api.clerk.com/v1/invitations?limit=500");
  if (!response.ok) return false;
  const invitation = listPayload(response.payload).find((item) => item.id === candidate.clerkInvitationId);
  if (!invitation) return false;
  const status = stringValue(invitation.status);
  const invitedEmail = providerEmail(invitation);
  return status === "accepted" && (!invitedEmail || invitedEmail === candidate.email.toLowerCase());
}

/**
 * Verify a platform owner invitation against the accepted organization
 * membership. Clerk may move invitation metadata to that membership when the
 * ticket is accepted, and it is not guaranteed to be copied to user
 * public_metadata. We therefore inspect the invitation first and, when Clerk
 * has retired that record, reconcile the authenticated user's accepted
 * organization membership. Both records are constrained by the local
 * application/invitation binding in InvitationCandidate.
 */
async function providerOrganizationInvitation(
  secret: string,
  candidate: InvitationCandidate,
  subject: string,
): Promise<Record<string, unknown> | null> {
  if (!candidate.clerkOrganizationId || !candidate.applicationPublicId) return null;

  const invitationUrl = `https://api.clerk.com/v1/organizations/${encodeURIComponent(candidate.clerkOrganizationId)}/invitations/${encodeURIComponent(candidate.clerkInvitationId)}`;
  const invitationResponse = await clerkRequest(secret, invitationUrl);
  if (invitationResponse.ok) {
    const invitation = objectValue(invitationResponse.payload);
    const status = stringValue(invitation.status);
    const invitedEmail = providerEmail(invitation);
    // A provider record that still says pending/revoked is authoritative;
    // never let a coincidental existing membership bypass that state.
    if (status !== "accepted" || (invitedEmail && invitedEmail !== candidate.email.toLowerCase())) return null;
    const metadata = providerMetadata(invitation);
    const invitationApplicationId = stringValue(metadata.rivetApplicationId);
    const invitationOrganizationId = stringValue(metadata.rivetOrganizationPublicId);
    if (invitationApplicationId || invitationOrganizationId) {
      return invitationApplicationId === candidate.applicationPublicId
        && invitationOrganizationId === candidate.organizationPublicId
        ? invitation
        : null;
    }
    // Accepted invitations without metadata may expose the server-owned
    // metadata only on the resulting organization membership. Continue to
    // that evidence path rather than falling back to user metadata.
  }

  const membershipsUrl = `https://api.clerk.com/v1/organizations/${encodeURIComponent(candidate.clerkOrganizationId)}/memberships?user_id=${encodeURIComponent(subject)}&limit=100`;
  const membershipsResponse = await clerkRequest(secret, membershipsUrl);
  if (!membershipsResponse.ok) return null;
  const membership = listPayload(membershipsResponse.payload).find((item) => {
    const userId = providerUserId(item);
    const email = providerEmail(item);
    const status = stringValue(item.status ?? item.membershipStatus);
    return userId === subject
      && (!email || email === candidate.email.toLowerCase())
      && (!status || ["active", "accepted"].includes(status));
  });
  if (!membership) return null;
  const metadata = providerMetadata(membership);
  if (stringValue(metadata.rivetApplicationId) !== candidate.applicationPublicId
    || stringValue(metadata.rivetOrganizationPublicId) !== candidate.organizationPublicId) return null;
  return membership;
}

async function providerUserMetadata(secret: string, subject: string): Promise<Record<string, unknown> | null> {
  const response = await clerkRequest(secret, `https://api.clerk.com/v1/users/${encodeURIComponent(subject)}`);
  if (!response.ok) return null;
  const user = objectValue(response.payload);
  return objectValue(user.public_metadata ?? user.publicMetadata);
}

/**
 * Finish an invitation claim only after Clerk confirms both sides of the
 * ticket. Platform owner invitations use the accepted organization
 * membership/invitation and local provisioning binding; generic invitations
 * use the accepted instance invitation plus its user metadata. A
 * browser-supplied email or ticket string is never accepted as proof.
 */
export const claimInvitation = action({
  args: {},
  handler: async (ctx: ActionCtx): Promise<{ claimed: boolean; id?: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Authentication is required." } as never);
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) throw new ConvexError({ code: "CONFIGURATION_ERROR", message: "Invitation verification is not configured." } as never);

    const candidates = await ctx.runQuery(internal.users.claimCandidates, { email: identity.email }) as InvitationCandidate[];
    if (candidates.length === 0) return { claimed: false };
    await ctx.runMutation(internal.users.reserveInvitationClaim, { subject: identity.subject, email: identity.email });
    for (const candidate of candidates) {
      if (candidate.providerKind === "organization") {
        if (!(await providerOrganizationInvitation(secret, candidate, identity.subject))) continue;
      } else {
        const metadata = await providerUserMetadata(secret, identity.subject);
        if (!metadata) continue;
        const metadataUser = stringValue(metadata.rivetUserId);
        const metadataOrganization = stringValue(metadata.rivetOrganizationId ?? metadata.rivetOrganizationPublicId);
        if (metadataUser && metadataUser !== candidate.userPublicId) continue;
        if (metadataOrganization !== candidate.organizationPublicId) continue;
        if (!(await providerGenericInvitationAccepted(secret, candidate))) continue;
      }
      return await ctx.runMutation(internal.users.acceptInvitation, {
        userId: candidate.userId,
        membershipId: candidate.membershipId,
        subject: identity.subject,
        email: identity.email,
      });
    }

    throw new ConvexError({ code: "INVITATION_NOT_ACCEPTED", message: "The invitation could not be verified." } as never);
  },
});

export const acceptInvitation = internalMutation({
  args: {
    userId: v.id("users"),
    membershipId: v.id("organizationMemberships"),
    subject: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    // Internal callers normally reach this through claimInvitation, which
    // verifies Clerk's provider state first. Preserve an additional binding
    // whenever Convex carries the action caller's identity into this mutation;
    // this prevents a future internal caller from supplying a different
    // subject or email than the authenticated request.
    const caller = await ctx.auth.getUserIdentity();
    if (caller && (caller.subject !== args.subject || (caller.email && caller.email.trim().toLowerCase() !== args.email.trim().toLowerCase()))) {
      throw new ConvexError({ code: "INVITATION_NOT_ACCEPTED", message: "The invitation could not be verified." } as never);
    }
    const user = await ctx.db.get(args.userId);
    const membership = await ctx.db.get(args.membershipId);
    if (!user || !membership || membership.userId !== user._id || user.status === "deactivated") {
      throw new ConvexError({ code: "INVITATION_NOT_ACCEPTED", message: "The invitation could not be verified." } as never);
    }
    if (user.email.toLowerCase() !== args.email.trim().toLowerCase()) {
      throw new ConvexError({ code: "INVITATION_NOT_ACCEPTED", message: "The invitation could not be verified." } as never);
    }
    if (membership.invitationStatus === "revoked") {
      throw new ConvexError({ code: "INVITATION_REVOKED", message: "This invitation has been revoked." } as never);
    }
    if (membership.invitationStatus === "accepted" && user.authSubject === args.subject && user.status === "active") {
      return { claimed: true, id: user.publicId ?? "" };
    }
    if (!user.authSubject.startsWith("invite:") && user.authSubject !== args.subject) {
      throw new ConvexError({ code: "INVITATION_NOT_ACCEPTED", message: "The invitation could not be verified." } as never);
    }
    if (membership.invitationStatus !== "pending") {
      throw new ConvexError({ code: "INVITATION_NOT_ACCEPTED", message: "The invitation could not be verified." } as never);
    }

    const now = Date.now();
    await ctx.db.patch(user._id, { authSubject: args.subject, status: "active", updatedAt: now });
    await ctx.db.patch(membership._id, { invitationStatus: "accepted", clerkInvitationStatus: "accepted", invitationError: undefined, updatedAt: now });
    const organization = await ctx.db.get(membership.organizationId);
    if (organization) {
      await ctx.db.insert("auditEvents", {
        organizationId: organization._id,
        publicId: crypto.randomUUID(),
        actorUserId: user._id,
        actorPublicId: user.publicId ?? "",
        actorName: user.fullName,
        actorRole: membership.role,
        category: "users",
        action: "user.invite.accepted",
        entityType: "user",
        entityPublicId: user.publicId ?? "",
        entityLabel: user.fullName,
        summary: "Gym invitation accepted",
        before: { invitationStatus: "pending", status: user.status },
        after: { invitationStatus: "accepted", status: "active" },
        correlationId: `invite-accept:${membership._id}`,
        occurredAt: now,
      });
    }
    return { claimed: true, id: user.publicId ?? "" };
  },
});
