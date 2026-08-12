import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, mutation } from "./_generated/server";
import { sanitizeImageBytes } from "./mediaSanitizer";
import { domainError, publicOrganizationId, publicUserId, requireActor, requirePermission } from "./security";

const ownerType = v.union(v.literal("gym_logo"), v.literal("gym_cover"), v.literal("gym_gallery"), v.literal("trainer_photo"), v.literal("member_photo"));
const requestArgs = {
  organizationId: v.string(),
  branchId: v.optional(v.string()),
  activeBranchId: v.optional(v.string()),
  correlationId: v.optional(v.string()),
};

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
      const member = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "member").eq("publicId", args.ownerPublicId)).unique();
      if (!member) domainError("NOT_FOUND", "Member not found.", { correlationId: actor.correlationId });
    } else {
      requirePermission(actor, "profiles.manage");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const authorizeFinalize = internalMutation({
  args: { ...requestArgs, ownerType, ownerPublicId: v.string(), altText: v.optional(v.string()) },
  returns: v.object({ organizationDocumentId: v.id("organizations"), visibility: v.union(v.literal("public"), v.literal("private")) }),
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args);
    const altText = args.altText?.trim();
    if (args.ownerType === "member_photo") {
      requirePermission(actor, "members.write");
      const member = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "member").eq("publicId", args.ownerPublicId)).unique();
      if (!member) domainError("NOT_FOUND", "Member not found.", { correlationId: actor.correlationId });
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
    const now = Date.now();
    // Private member photos can be replaced immediately because no published
    // version references them. Public media remains active while it is in a
    // draft; the profile/trainer publish mutation schedules the prior asset
    // only after the new reference is committed.
    if (args.ownerType === "member_photo") {
      const existing = (await ctx.db.query("mediaAssets").withIndex("by_owner", (q) => q.eq("organizationId", actor.organization._id).eq("ownerType", args.ownerType).eq("ownerPublicId", args.ownerPublicId)).collect()).filter((asset) => asset.status === "active");
      for (const asset of existing) await ctx.db.patch(asset._id, { status: "scheduled_for_deletion", deleteAfter: now + 90 * 86_400_000, updatedAt: now });
    }
    const publicId = `MEDIA-${crypto.randomUUID()}`;
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
      status: "active",
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
    return { id: publicId, organizationId: publicOrganizationId(actor.organization), ownerType: args.ownerType, ownerId: args.ownerPublicId, storageId: String(args.storageId), contentType: args.contentType, sizeBytes: args.sizeBytes, altText: args.altText?.trim() || undefined, visibility: args.ownerType === "member_photo" ? "private" : "public", status: "active", url: url ?? undefined, createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
  },
});

export const finalizeUpload = action({
  args: { ...requestArgs, ownerType, ownerPublicId: v.string(), altText: v.optional(v.string()), storageId: v.id("_storage") },
  returns: v.any(),
  handler: async (ctx, args): Promise<FinalizedAsset> => {
    await ctx.runMutation(internal.media.authorizeFinalize, args);
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
      return await ctx.runMutation(internal.media.commit, { ...args, storageId: normalized as Id<"_storage">, contentType: sanitized.contentType, sizeBytes: sanitized.bytes.length }) as FinalizedAsset;
    } catch (error) {
      await ctx.storage.delete(normalized);
      throw error;
    }
  },
});

/** Schedules an uploaded-but-unreferenced gym asset for cleanup. */
export const discardDraft = mutation({
  args: { ...requestArgs, assetId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireActor(ctx, args);
    requirePermission(actor, "profiles.manage");
    const asset = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", args.assetId)).unique();
    if (!asset || !asset.ownerType.startsWith("gym_")) domainError("NOT_FOUND", "Draft media asset not found.", { correlationId: actor.correlationId });
    const profile = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "gymProfile").eq("publicId", "gym-profile")).unique();
    const draft = profile?.data as { logoAssetId?: string; coverAssetId?: string; galleryAssetIds?: string[] } | undefined;
    if ([draft?.logoAssetId, draft?.coverAssetId, ...(draft?.galleryAssetIds ?? [])].includes(asset.publicId)) domainError("VALIDATION_ERROR", "Saved profile media cannot be discarded as a draft.", { correlationId: actor.correlationId });
    const now = Date.now();
    await ctx.db.patch(asset._id, { status: "scheduled_for_deletion", deleteAfter: now, updatedAt: now });
    await ctx.db.insert("auditEvents", { organizationId: actor.organization._id, publicId: crypto.randomUUID(), actorUserId: actor.user._id, actorPublicId: publicUserId(actor.user), actorName: actor.user.fullName, actorRole: actor.role, category: "settings", action: "media.draft_discard", entityType: "media_asset", entityPublicId: asset.publicId, entityLabel: asset.ownerType.replaceAll("_", " "), summary: "Discarded unreferenced profile draft media", correlationId: actor.correlationId, occurredAt: now });
    return null;
  },
});

export const cleanupExpired = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const due = (await ctx.db.query("mediaAssets").withIndex("by_cleanup", (q) => q.eq("status", "scheduled_for_deletion")).collect()).filter((asset) => (asset.deleteAfter ?? Number.POSITIVE_INFINITY) <= Date.now()).slice(0, 50);
    for (const asset of due) {
      await ctx.storage.delete(asset.storageId);
      await ctx.db.patch(asset._id, { status: "replaced", updatedAt: Date.now() });
    }
    return due.length;
  },
});
