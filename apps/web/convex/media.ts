import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import { sanitizeImageBytes } from "./mediaSanitizer";
import { assertBranchAccess, domainError, hasPermission, publicOrganizationId, publicUserId, requireActor, requirePermission } from "./security";

const ownerType = v.union(v.literal("gym_logo"), v.literal("gym_cover"), v.literal("gym_gallery"), v.literal("trainer_photo"), v.literal("member_photo"));
const requestArgs = {
  organizationId: v.string(),
  branchId: v.optional(v.string()),
  activeBranchId: v.optional(v.string()),
  correlationId: v.optional(v.string()),
};

const PUBLIC_PROFILE_DRAFT_TTL_MS = 24 * 60 * 60 * 1_000;
const MEDIA_UPLOAD_INTENT_TTL_MS = 2 * 60 * 60 * 1_000;
// A finalized upload is represented by a pending media row until the gym
// profile saves it. Keep abandoned drafts bounded per tenant; the daily
// cleanup cron removes rows after PUBLIC_PROFILE_DRAFT_TTL_MS. Raw storage
// uploads that fail validation are deleted by finalizeUpload before they can
// reach this limit.
const MAX_PENDING_PROFILE_MEDIA_PER_ORGANIZATION = 25;

const PROFILE_MEDIA_OWNER_TYPES = ["gym_logo", "gym_cover", "gym_gallery", "trainer_photo"] as const;

type ProfileMediaOwnerType = (typeof PROFILE_MEDIA_OWNER_TYPES)[number];

function isProfileMediaOwnerType(value: string): value is ProfileMediaOwnerType {
  return (PROFILE_MEDIA_OWNER_TYPES as readonly string[]).includes(value);
}

async function profileMediaUsageCount(ctx: { db: MutationCtx["db"] }, organizationId: Id<"organizations">, now: number): Promise<number> {
  const pending = (await Promise.all(PROFILE_MEDIA_OWNER_TYPES.map((type) => ctx.db
    .query("mediaAssets")
    .withIndex("by_organization_owner_status", (q) => q.eq("organizationId", organizationId).eq("ownerType", type).eq("status", "pending"))
    .take(MAX_PENDING_PROFILE_MEDIA_PER_ORGANIZATION + 1)))).flat();
  const intents = await ctx.db
    .query("mediaUploadIntents")
    .withIndex("by_organization_expires", (q) => q.eq("organizationId", organizationId).gte("expiresAt", now))
    .take(MAX_PENDING_PROFILE_MEDIA_PER_ORGANIZATION + 1);
  return pending.length + intents.length;
}

export const pendingProfileMediaCount = internalQuery({
  args: { organizationId: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", args.organizationId)).unique();
    if (!organization) return 0;
    const pending = (await Promise.all(PROFILE_MEDIA_OWNER_TYPES.map((type) => ctx.db
      .query("mediaAssets")
      .withIndex("by_organization_owner_status", (q) => q.eq("organizationId", organization._id).eq("ownerType", type).eq("status", "pending"))
      .take(MAX_PENDING_PROFILE_MEDIA_PER_ORGANIZATION + 1)))).flat();
    return pending.length;
  },
});

export const uploadIntent = internalQuery({
  args: { organizationId: v.string(), correlationId: v.string() },
  returns: v.union(
    v.object({ ownerType: ownerType, ownerPublicId: v.string(), storageId: v.optional(v.id("_storage")), expiresAt: v.number() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", args.organizationId)).unique();
    if (!organization) return null;
    const intent = await ctx.db.query("mediaUploadIntents").withIndex("by_organization_correlation", (q) => q.eq("organizationId", organization._id).eq("correlationId", args.correlationId)).unique();
    return intent ? { ownerType: intent.ownerType, ownerPublicId: intent.ownerPublicId, storageId: intent.storageId, expiresAt: intent.expiresAt } : null;
  },
});

export const consumeUploadIntent = internalMutation({
  args: { organizationId: v.string(), correlationId: v.string(), ownerType, ownerPublicId: v.string(), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", args.organizationId)).unique();
    if (!organization) return null;
    const intent = await ctx.db.query("mediaUploadIntents").withIndex("by_organization_correlation", (q) => q.eq("organizationId", organization._id).eq("correlationId", args.correlationId)).unique();
    if (intent && intent.ownerType === args.ownerType && intent.ownerPublicId === args.ownerPublicId && intent.storageId === args.storageId) await ctx.db.delete(intent._id);
    return null;
  },
});

type MemberMediaRecord = {
  _id: Id<"domainRecords">;
  branchId?: Id<"branches">;
  data?: unknown;
};

/**
 * Member photos are private, but privacy is not a substitute for branch
 * authorization. Resolve the member's authoritative record branch before an
 * upload URL is issued or an upload is committed. Legacy rows may not have a
 * denormalized branchId, so use the member's public homeBranchId only as a
 * compatibility lookup; a member without a resolvable active branch is not a
 * valid media target.
 */
async function memberMediaRecord(ctx: MutationCtx, actor: Awaited<ReturnType<typeof requireActor>>, ownerPublicId: string): Promise<MemberMediaRecord> {
  const member = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "member").eq("publicId", ownerPublicId)).unique();
  if (!member) domainError("NOT_FOUND", "Member not found.", { correlationId: actor.correlationId });
  const memberData = member.data && typeof member.data === "object" && !Array.isArray(member.data) ? member.data as { homeBranchId?: unknown } : {};
  const branch = member.branchId
    ? await ctx.db.get(member.branchId)
    : typeof memberData.homeBranchId === "string" && memberData.homeBranchId.trim()
      ? await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", memberData.homeBranchId as string)).unique()
      : null;
  assertBranchAccess(actor, branch);
  return member as MemberMediaRecord;
}

/**
 * A storage URL is intentionally not an authorization token. The upload
 * intent binds the browser's correlation to the exact tenant, owner, and
 * storage object before any bytes are inspected. The first finalize call
 * records the returned storage id; retries and concurrent callers must match
 * that same id. This keeps a copied/omitted correlation or foreign storage
 * id from reaching sanitization or commit.
 */
async function requireUploadIntent(
  ctx: MutationCtx,
  actor: Awaited<ReturnType<typeof requireActor>>,
  args: { correlationId?: string; ownerType: "gym_logo" | "gym_cover" | "gym_gallery" | "trainer_photo" | "member_photo"; ownerPublicId: string; storageId: Id<"_storage"> },
): Promise<void> {
  const correlationId = args.correlationId?.trim();
  if (!correlationId) domainError("VALIDATION_ERROR", "Media upload correlation is required.", { correlationId: actor.correlationId });
  const intent = await ctx.db.query("mediaUploadIntents").withIndex("by_organization_correlation", (q) => q.eq("organizationId", actor.organization._id).eq("correlationId", correlationId)).unique();
  if (!intent || intent.expiresAt <= Date.now()) domainError("CONFLICT", "This media upload request is missing or no longer valid. Start a new upload.", { correlationId: actor.correlationId });
  if (intent.ownerType !== args.ownerType || intent.ownerPublicId !== args.ownerPublicId || (intent.storageId && intent.storageId !== args.storageId)) {
    domainError("CONFLICT", "This media upload request does not match the uploaded file. Start a new upload.", { correlationId: actor.correlationId });
  }
  if (!intent.storageId) await ctx.db.patch(intent._id, { storageId: args.storageId });
}

function profileMediaIds(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const profile = value as { logoAssetId?: unknown; coverAssetId?: unknown; galleryAssetIds?: unknown };
  const gallery = Array.isArray(profile.galleryAssetIds) ? profile.galleryAssetIds : [];
  return [profile.logoAssetId, profile.coverAssetId, ...gallery].filter((item): item is string => typeof item === "string" && item.length > 0);
}

async function isReferencedByPublishedProfile(ctx: MutationCtx, asset: { organizationId: Id<"organizations">; publicId: string }): Promise<boolean> {
  const organization = await ctx.db.get(asset.organizationId);
  if (organization?.brandLogoAssetId === asset.publicId) return true;
  const versions = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", asset.organizationId).eq("entityType", "gymProfileVersion")).collect();
  return versions.some((version) => {
    const value = version.data && typeof version.data === "object" && !Array.isArray(version.data) ? version.data as { status?: unknown } : {};
    return value.status === "published" && profileMediaIds(version.data).includes(asset.publicId);
  });
}

async function isReferencedByPublishedTrainerProfile(ctx: MutationCtx, asset: { organizationId: Id<"organizations">; publicId: string; ownerPublicId: string }): Promise<boolean> {
  const trainer = await ctx.db.query("ptTrainerProfiles").withIndex("by_organization_public_id", (q) => q.eq("organizationId", asset.organizationId).eq("publicId", asset.ownerPublicId)).unique();
  return trainer?.status === "published" && trainer.photoAssetId === asset.publicId;
}

type FinalizedAsset = {
  id: string;
  organizationId: string;
  ownerType: string;
  ownerId: string;
  storageId: string;
  contentType: string;
  sizeBytes: number;
  altText?: string;
  visibility: string;
  status: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
};

export const generateUploadUrl = mutation({
  args: { ...requestArgs, ownerType, ownerPublicId: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args);
    if (args.ownerType === "member_photo") {
      requirePermission(actor, "members.write");
      await memberMediaRecord(ctx, actor, args.ownerPublicId);
    } else {
      requirePermission(actor, "profiles.manage");
    }
    const correlationId = args.correlationId?.trim();
    if (!correlationId) domainError("VALIDATION_ERROR", "Media upload correlation is required.", { correlationId: actor.correlationId });
    const now = Date.now();
    const existing = await ctx.db.query("mediaUploadIntents").withIndex("by_organization_correlation", (q) => q.eq("organizationId", actor.organization._id).eq("correlationId", correlationId)).unique();
    if (existing && existing.expiresAt > now) domainError("CONFLICT", "This media upload has already started. Retry with a new request.", { correlationId: actor.correlationId });
    if (existing) await ctx.db.delete(existing._id);

    // Reserve a short-lived upload slot before handing the client a URL. This
    // prevents a browser opening many upload tabs from bypassing the profile
    // media quota. The raw storage provider still owns lifecycle cleanup for
    // bytes uploaded after this mutation and before finalizeUpload receives a
    // storage id; Convex cannot delete an id it has never seen.
    if (isProfileMediaOwnerType(args.ownerType)) {
      const usage = await profileMediaUsageCount(ctx, actor.organization._id, now);
      if (usage >= MAX_PENDING_PROFILE_MEDIA_PER_ORGANIZATION) domainError("VALIDATION_ERROR", "Too many unsaved profile images. Save or discard an existing draft before uploading another.", { correlationId: actor.correlationId });
    }
    await ctx.db.insert("mediaUploadIntents", {
      organizationId: actor.organization._id,
      publicId: `MEDIA-INTENT-${crypto.randomUUID()}`,
      correlationId,
      ownerType: args.ownerType,
      ownerPublicId: args.ownerPublicId,
      createdAt: now,
      expiresAt: now + MEDIA_UPLOAD_INTENT_TTL_MS,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

export const authorizeFinalize = internalMutation({
  args: { ...requestArgs, ownerType, ownerPublicId: v.string(), altText: v.optional(v.string()), storageId: v.id("_storage") },
  returns: v.object({ organizationDocumentId: v.id("organizations"), visibility: v.union(v.literal("public"), v.literal("private")) }),
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args);
    await requireUploadIntent(ctx, actor, args);
    const altText = args.altText?.trim();
    if (args.ownerType === "member_photo") {
      requirePermission(actor, "members.write");
      await memberMediaRecord(ctx, actor, args.ownerPublicId);
      return { organizationDocumentId: actor.organization._id, visibility: "private" as const };
    }
    requirePermission(actor, "profiles.manage");
    if (!altText) domainError("VALIDATION_ERROR", "Alt text is required for public media.", { correlationId: actor.correlationId, fieldErrors: { altText: ["Required"] } });
    if (args.ownerType.startsWith("gym_") && args.ownerPublicId !== publicOrganizationId(actor.organization)) domainError("NOT_FOUND", "Profile media target not found.", { correlationId: actor.correlationId });
    if (args.ownerType === "trainer_photo") {
      const trainer = await ctx.db.query("ptTrainerProfiles").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", args.ownerPublicId)).unique();
      if (!trainer || trainer.status === "archived") domainError("NOT_FOUND", "Trainer profile not found.", { correlationId: actor.correlationId });
    }
    return { organizationDocumentId: actor.organization._id, visibility: "public" as const };
  },
});

export const commit = internalMutation({
  args: { ...requestArgs, ownerType, ownerPublicId: v.string(), altText: v.optional(v.string()), storageId: v.id("_storage"), contentType: v.union(v.literal("image/jpeg"), v.literal("image/png"), v.literal("image/webp")), sizeBytes: v.number() },
  returns: v.object({ id: v.string(), organizationId: v.string(), ownerType: v.string(), ownerId: v.string(), storageId: v.string(), contentType: v.string(), sizeBytes: v.number(), altText: v.optional(v.string()), visibility: v.string(), status: v.string(), url: v.optional(v.string()), createdAt: v.string(), updatedAt: v.string() }),
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args);
    if (args.ownerType === "member_photo") requirePermission(actor, "members.write");
    else requirePermission(actor, "profiles.manage");
    if (args.ownerType === "member_photo") await memberMediaRecord(ctx, actor, args.ownerPublicId);
    const now = Date.now();
    // Private member photos are immediately attached to their member. Gym
    // profile media is only a temporary upload until profiles.gym.save
    // references it, so closing the browser cannot leave public files around
    // forever. Trainer photos are promoted by the trainer profile workflow.
    if (args.ownerType === "member_photo") {
      const existing = (await ctx.db.query("mediaAssets").withIndex("by_owner", (q) => q.eq("organizationId", actor.organization._id).eq("ownerType", args.ownerType).eq("ownerPublicId", args.ownerPublicId)).collect()).filter((asset) => asset.status === "active");
      for (const asset of existing) await ctx.db.patch(asset._id, { status: "scheduled_for_deletion", deleteAfter: now + 90 * 86_400_000, updatedAt: now });
    }
    const publicId = `MEDIA-${crypto.randomUUID()}`;
    const isProfileDraft = isProfileMediaOwnerType(args.ownerType);
    const status = isProfileDraft ? "pending" as const : "active" as const;
    const deleteAfter = isProfileDraft ? now + PUBLIC_PROFILE_DRAFT_TTL_MS : undefined;
    if (isProfileDraft) {
      const usage = await profileMediaUsageCount(ctx, actor.organization._id, now);
      if (usage >= MAX_PENDING_PROFILE_MEDIA_PER_ORGANIZATION) {
        // finalizeUpload performs the same check before storing the normalized
        // image and deletes the action-owned object if the quota is exceeded.
        // Keep this mutation-side guard for direct internal callers and
        // concurrent uploads; a thrown mutation rolls back its transaction.
        domainError("VALIDATION_ERROR", "Too many unsaved profile images. Save or discard an existing draft before uploading another.", { correlationId: actor.correlationId });
      }
    }
    await ctx.db.insert("mediaAssets", {
      organizationId: actor.organization._id,
      publicId,
      ownerType: args.ownerType,
      ownerPublicId: args.ownerPublicId,
      storageId: args.storageId,
      contentType: args.contentType,
      sizeBytes: args.sizeBytes,
      altText: args.altText?.trim() || undefined,
      visibility: args.ownerType === "member_photo" ? "private" : "public",
      status,
      deleteAfter,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("auditEvents", {
      organizationId: actor.organization._id,
      publicId: crypto.randomUUID(),
      actorUserId: actor.user._id,
      actorPublicId: publicUserId(actor.user),
      actorName: actor.user.fullName,
      actorRole: actor.role,
      category: "settings",
      action: "media.upload",
      entityType: "media_asset",
      entityPublicId: publicId,
      entityLabel: args.ownerType.replaceAll("_", " "),
      summary: "Uploaded and sanitized profile media",
      after: { ownerType: args.ownerType, ownerPublicId: args.ownerPublicId, contentType: args.contentType, sizeBytes: args.sizeBytes, visibility: args.ownerType === "member_photo" ? "private" : "public" },
      correlationId: actor.correlationId,
      occurredAt: now,
    });
    const url = await ctx.storage.getUrl(args.storageId);
    return { id: publicId, organizationId: publicOrganizationId(actor.organization), ownerType: args.ownerType, ownerId: args.ownerPublicId, storageId: String(args.storageId), contentType: args.contentType, sizeBytes: args.sizeBytes, altText: args.altText?.trim() || undefined, visibility: args.ownerType === "member_photo" ? "private" : "public", status, url: url ?? undefined, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
  },
});

export const finalizeUpload = action({
  args: { ...requestArgs, ownerType, ownerPublicId: v.string(), altText: v.optional(v.string()), storageId: v.id("_storage") },
  returns: v.any(),
  handler: async (ctx, args): Promise<FinalizedAsset> => {
    await ctx.runMutation(internal.media.authorizeFinalize, {
      organizationId: args.organizationId,
      branchId: args.branchId,
      activeBranchId: args.activeBranchId,
      correlationId: args.correlationId,
      ownerType: args.ownerType,
      ownerPublicId: args.ownerPublicId,
      altText: args.altText,
      storageId: args.storageId,
    });
    if (isProfileMediaOwnerType(args.ownerType)) {
      const pending = await ctx.runQuery(internal.media.pendingProfileMediaCount, { organizationId: args.organizationId });
      if (pending >= MAX_PENDING_PROFILE_MEDIA_PER_ORGANIZATION) {
        // Actions are outside the database transaction, so this delete is
        // durable even though the action returns a validation error.
        await ctx.storage.delete(args.storageId);
        domainError("VALIDATION_ERROR", "Too many unsaved profile images. Save or discard an existing draft before uploading another.", { correlationId: args.correlationId });
      }
    }
    const source = await ctx.storage.get(args.storageId);
    if (!source) domainError("NOT_FOUND", "Uploaded image not found.", { correlationId: args.correlationId });
    if (source.size > 5 * 1024 * 1024) {
      await ctx.storage.delete(args.storageId);
      domainError("VALIDATION_ERROR", "Image must be 5 MB or smaller.", { correlationId: args.correlationId });
    }
    let sanitized: ReturnType<typeof sanitizeImageBytes>;
    try {
      sanitized = sanitizeImageBytes(new Uint8Array(await source.arrayBuffer()));
    } catch (error) {
      await ctx.storage.delete(args.storageId);
      const code = error instanceof Error ? error.message : "MALFORMED_IMAGE";
      domainError("VALIDATION_ERROR", code === "IMAGE_TOO_LARGE" ? "Image must be 5 MB or smaller." : code === "UNSUPPORTED_IMAGE_TYPE" ? "Use a JPEG, PNG, or WebP image." : "The uploaded image is malformed.", { correlationId: args.correlationId });
    }
    const normalizedBytes = sanitized.bytes.slice().buffer as ArrayBuffer;
    const normalized = await ctx.storage.store(new Blob([normalizedBytes], { type: sanitized.contentType }));
    await ctx.storage.delete(args.storageId);
    try {
      const intent = args.correlationId
        ? await ctx.runQuery(internal.media.uploadIntent, { organizationId: args.organizationId, correlationId: args.correlationId })
        : null;
      if (!intent || intent.ownerType !== args.ownerType || intent.ownerPublicId !== args.ownerPublicId || intent.storageId !== args.storageId || intent.expiresAt <= Date.now()) {
        domainError("CONFLICT", "The media upload request is no longer valid. Start a new upload.", { correlationId: args.correlationId });
      }
      const result = await ctx.runMutation(internal.media.commit, { ...args, storageId: normalized as Id<"_storage">, contentType: sanitized.contentType, sizeBytes: sanitized.bytes.length }) as FinalizedAsset;
      if (args.correlationId) await ctx.runMutation(internal.media.consumeUploadIntent, { organizationId: args.organizationId, correlationId: args.correlationId, ownerType: args.ownerType, ownerPublicId: args.ownerPublicId, storageId: args.storageId });
      return result;
    } catch (error) {
      await ctx.storage.delete(normalized);
      throw error;
    }
  },
});

/** Immediately removes an uploaded-but-unreferenced gym profile asset. */
export const discardDraft = mutation({
  args: { ...requestArgs, assetId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args);
    const asset = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", args.assetId)).unique();
    if (!asset || (!asset.ownerType.startsWith("gym_") && asset.ownerType !== "trainer_photo")) domainError("NOT_FOUND", "Draft media asset not found.", { correlationId: actor.correlationId });
    if (asset.ownerType === "trainer_photo") {
      if (!hasPermission(actor, "profiles.manage") && !hasPermission(actor, "pt.manage")) domainError("FORBIDDEN", "Your role cannot manage trainer photos.", { correlationId: actor.correlationId });
    } else {
      requirePermission(actor, "profiles.manage");
    }
    if (!["pending", "active"].includes(asset.status)) domainError("NOT_FOUND", "Draft media asset not found.", { correlationId: actor.correlationId });
    if (asset.ownerType === "trainer_photo") {
      const trainer = await ctx.db.query("ptTrainerProfiles").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", asset.ownerPublicId)).unique();
      if (trainer?.photoAssetId === asset.publicId) domainError("VALIDATION_ERROR", "Saved trainer media cannot be discarded as a draft.", { correlationId: actor.correlationId });
    }
    const profile = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "gymProfileDraft").eq("publicId", "current")).unique();
    const draft = profile?.data as { logoAssetId?: string; coverAssetId?: string; galleryAssetIds?: string[] } | undefined;
    const organization = await ctx.db.get(actor.organization._id);
    if (organization?.brandLogoAssetId === asset.publicId) domainError("VALIDATION_ERROR", "The active Brand Kit logo cannot be discarded.", { correlationId: actor.correlationId });
    if ([draft?.logoAssetId, draft?.coverAssetId, ...(draft?.galleryAssetIds ?? [])].includes(asset.publicId)) domainError("VALIDATION_ERROR", "Saved profile media cannot be discarded as a draft.", { correlationId: actor.correlationId });
    if (asset.ownerType.startsWith("gym_") && await isReferencedByPublishedProfile(ctx, asset)) domainError("VALIDATION_ERROR", "Published profile media cannot be discarded.", { correlationId: actor.correlationId });
    if (asset.ownerType === "trainer_photo" && await isReferencedByPublishedTrainerProfile(ctx, asset)) domainError("VALIDATION_ERROR", "Published trainer media cannot be discarded.", { correlationId: actor.correlationId });
    const now = Date.now();
    await ctx.storage.delete(asset.storageId);
    await ctx.db.patch(asset._id, { status: "replaced", deleteAfter: undefined, updatedAt: now });
    await ctx.db.insert("auditEvents", { organizationId: actor.organization._id, publicId: crypto.randomUUID(), actorUserId: actor.user._id, actorPublicId: publicUserId(actor.user), actorName: actor.user.fullName, actorRole: actor.role, category: "settings", action: "media.draft_discard", entityType: "media_asset", entityPublicId: asset.publicId, entityLabel: asset.ownerType.replaceAll("_", " "), summary: "Discarded unreferenced profile draft media", correlationId: actor.correlationId, occurredAt: now });
    return null;
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    // Keep each run bounded. The cron invokes this mutation repeatedly, so a
    // large tenant cannot make one transaction scan or delete unbounded rows.
    const pending = await ctx.db.query("mediaAssets").withIndex("by_cleanup", (q) => q.eq("status", "pending")).take(100);
    const scheduled = await ctx.db.query("mediaAssets").withIndex("by_cleanup", (q) => q.eq("status", "scheduled_for_deletion")).take(100);
    const due = [...pending, ...scheduled].filter((asset) => (asset.deleteAfter ?? Number.POSITIVE_INFINITY) <= now).slice(0, 50);
    for (const asset of due) {
      if (asset.visibility === "public" && asset.ownerType.startsWith("gym_") && await isReferencedByPublishedProfile(ctx, asset)) {
        await ctx.db.patch(asset._id, { status: "active", deleteAfter: undefined, updatedAt: now });
        continue;
      }
      if (asset.visibility === "public" && asset.ownerType === "trainer_photo" && await isReferencedByPublishedTrainerProfile(ctx, asset)) {
        await ctx.db.patch(asset._id, { status: "active", deleteAfter: undefined, updatedAt: now });
        continue;
      }
      await ctx.storage.delete(asset.storageId);
      await ctx.db.patch(asset._id, { status: "replaced", deleteAfter: undefined, updatedAt: now });
    }
    const expiredIntents = await ctx.db.query("mediaUploadIntents").withIndex("by_intent_expiry", (q) => q.lte("expiresAt", now)).take(100);
    for (const intent of expiredIntents) await ctx.db.delete(intent._id);
    return due.length + expiredIntents.length;
  },
});
