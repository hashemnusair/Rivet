import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { Blob as NodeBlob } from "node:buffer";
import { api, internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-profile-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-profile", name: "Profile Gym", slug: "profile-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "profile-branch", name: "Abdoun", code: "ABD", address: "Amman", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "profile-owner", authSubject: "clerk-profile-owner", email: "owner@profile.example", fullName: "Profile Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const reception = await ctx.db.insert("users", { publicId: "profile-reception", authSubject: "clerk-profile-reception", email: "reception@profile.example", fullName: "Profile Reception", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("users", { publicId: "profile-admin", authSubject: "clerk-profile-admin", email: "admin@rivet.example", fullName: "Platform Admin", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: reception, role: "receptionist", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "marketplaceGym", publicId: "profile-gym", createdAt: now, updatedAt: now, data: { id: "profile-gym", targetOrganizationId: "org-profile", name: "Profile Gym", shortName: "PROFILE", tagline: "Old tagline", description: "Old description", city: "Amman", areas: ["Abdoun"], category: "Gym", audience: "All members", memberCount: 999, branchCount: 1, fromPriceMinor: 999_000, amenities: [], accent: "#15140f", featured: false, subscriptionStatus: "active", rivetPlan: "Growth", joinedAt: new Date(now).toISOString().slice(0, 10), lastActiveAt: new Date(now).toISOString(), monthlyRevenueMinor: 0, isPublic: true, branches: [{ id: "profile-branch-public", internalBranchId: "profile-branch", name: "Abdoun", area: "Abdoun", address: "Amman", trialSlots: ["18:00"] }] } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "plan", publicId: "profile-plan", createdAt: now, updatedAt: now, data: { id: "profile-plan", name: "Monthly", code: "MONTH", kind: "time", durationDays: 30, basePrice: { amount: 45_000, currency: "JOD" }, branchAccess: "all", branchIds: [], freezeAllowanceDays: 0, includedPtSessions: 2, status: "active" } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "member", publicId: "profile-member", branchId: branch, memberPublicId: "profile-member", createdAt: now, updatedAt: now, data: { id: "profile-member", fullName: "Actual Member", memberNumber: "ABD-1", homeBranchId: "profile-branch", status: "active", createdAt: new Date(now).toISOString() } });
  });
  return t;
}

describe("gym-controlled public profile", () => {
  it("keeps drafts private, versions publication, and preserves the platform listing gate", async () => {
    const t = await seeded();
    const owner = t.withIdentity({ subject: "clerk-profile-owner" });
    const input = { shortName: "PROFILE", taglineEn: "Train with a plan", taglineAr: "تدرب بخطة", descriptionEn: "A real operating gym in Amman.", descriptionAr: "نادٍ رياضي عامل في عمّان.", category: "Strength", audience: "All members", amenities: ["Free weights", "Parking"], contactEmail: "hello@profile.example", contactPhone: "+962790000000", websiteUrl: "https://profile.example", instagramUrl: "https://instagram.com/profile", accentColor: "#123456", galleryAssetIds: [] };

    const draft = await owner.mutation(api.domain.mutate, operation("profiles.gym.save", input)) as { status: string; version: number };
    expect(draft).toMatchObject({ status: "draft", version: 1 });
    let publicRows = await owner.query(api.domain.query, operation("public.marketplace")) as Array<Record<string, unknown>>;
    expect(publicRows[0]).toMatchObject({ tagline: "Old tagline", memberCount: 1, fromPriceMinor: 45_000 });

    const published = await owner.mutation(api.domain.mutate, operation("profiles.gym.publish")) as { status: string; taglineEn: string; version: number };
    expect(published).toMatchObject({ status: "published", taglineEn: "Train with a plan", version: 1 });
    const retried = await owner.mutation(api.domain.mutate, operation("profiles.gym.publish")) as { status: string; version: number };
    expect(retried).toMatchObject({ status: "published", version: 1 });
    publicRows = await owner.query(api.domain.query, operation("public.marketplace")) as Array<Record<string, unknown>>;
    expect(publicRows[0]).toMatchObject({ tagline: "Train with a plan", taglineAr: "تدرب بخطة", memberCount: 1, fromPriceMinor: 45_000, profileVersion: 1 });

    const versions = await owner.query(api.domain.query, operation("profiles.gym.versions")) as Array<{ version: number; status: string }>;
    expect(versions).toEqual([expect.objectContaining({ version: 1, status: "published" })]);

    // After the first publish, tenants can neither republish nor take the
    // page down themselves: both routes go through RIVET.
    await expectCode(owner.mutation(api.domain.mutate, operation("profiles.gym.unpublish", { reason: "Temporarily hiding the public profile" })), "VALIDATION_ERROR");
    const secondDraft = await owner.mutation(api.domain.mutate, operation("profiles.gym.save", { ...input, taglineEn: "Reviewed tagline" })) as { status: string; version: number };
    expect(secondDraft).toMatchObject({ status: "draft", version: 2 });
    await expectCode(owner.mutation(api.domain.mutate, operation("profiles.gym.publish")), "VALIDATION_ERROR");

    // The platform admin reviews and publishes the saved draft.
    const admin = t.withIdentity({ subject: "clerk-profile-admin" });
    await expectCode(owner.mutation(api.domain.mutate, operation("platform.gym.profile.publish", { gymId: "profile-gym", reason: "Tenant is not a platform admin." })), "FORBIDDEN");
    const reviewed = await admin.mutation(api.domain.mutate, operation("platform.gym.profile.publish", { gymId: "profile-gym", reason: "Reviewed the requested public page update." })) as { publishedVersion: number };
    expect(reviewed).toMatchObject({ publishedVersion: 2 });
    publicRows = await owner.query(api.domain.query, operation("public.marketplace")) as Array<Record<string, unknown>>;
    expect(publicRows[0]).toMatchObject({ tagline: "Reviewed tagline", profileVersion: 2 });
    const audit = await t.run(async (ctx) => (await ctx.db.query("platformAuditEvents").collect()).find((event) => event.action === "gym.profile.publish"));
    expect(audit).toMatchObject({ entityPublicId: "profile-gym", reason: "Reviewed the requested public page update." });
  });

  it("denies profile management to reception", async () => {
    const t = await seeded();
    const reception = t.withIdentity({ subject: "clerk-profile-reception" });
    await expectCode(reception.query(api.domain.query, operation("profiles.gym.get")), "FORBIDDEN");
    await expectCode(reception.mutation(api.domain.mutate, operation("profiles.gym.publish")), "FORBIDDEN");
  });

  it("passes only authorization fields before validating uploaded bytes", async () => {
    const t = await seeded();
    const owner = t.withIdentity({ subject: "clerk-profile-owner" });
    const storageId = await t.run(async (ctx) => ctx.storage.store(new NodeBlob(["not an image"]) as unknown as Blob));
    await owner.mutation(api.media.generateUploadUrl, { organizationId: "org-profile", correlationId: "cor-profile-finalize", ownerType: "gym_logo", ownerPublicId: "org-profile" });

    await expect(owner.action(api.media.finalizeUpload, { organizationId: "org-profile", correlationId: "cor-profile-finalize", ownerType: "gym_logo", ownerPublicId: "org-profile", altText: "Profile Gym logo", storageId })).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR", message: "Use a JPEG, PNG, or WebP image." }) });
  });

  it("promotes only saved gym media and expires abandoned uploads server-side", async () => {
    const t = await seeded();
    const owner = t.withIdentity({ subject: "clerk-profile-owner" });
    const [savedStorageId, abandonedStorageId] = await t.run(async (ctx) => [
      await ctx.storage.store(new NodeBlob(["saved"]) as unknown as Blob),
      await ctx.storage.store(new NodeBlob(["abandoned"]) as unknown as Blob),
    ]);
    const request = { organizationId: "org-profile", correlationId: "cor-profile-media", ownerType: "gym_logo" as const, ownerPublicId: "org-profile", altText: "Profile Gym logo", contentType: "image/png" as const, sizeBytes: 5 };
    const saved = await owner.mutation(internal.media.commit, { ...request, storageId: savedStorageId });
    const abandoned = await owner.mutation(internal.media.commit, { ...request, storageId: abandonedStorageId });
    expect(saved.status).toBe("pending");
    expect(abandoned.status).toBe("pending");

    await owner.mutation(api.domain.mutate, operation("profiles.gym.save", { shortName: "PROFILE", taglineEn: "Train with a plan", descriptionEn: "A real operating gym in Amman.", category: "Gym", audience: "All members", amenities: [], accentColor: "#123456", logoAssetId: saved.id, galleryAssetIds: [] }));
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-profile")).unique();
      expect(organization).not.toBeNull();
      const savedRow = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", saved.id)).unique();
      const abandonedRow = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", abandoned.id)).unique();
      expect(savedRow).toMatchObject({ status: "active" });
      expect(savedRow).not.toHaveProperty("deleteAfter");
      expect(abandonedRow?.status).toBe("pending");
      await ctx.db.patch(abandonedRow!._id, { deleteAfter: Date.now() - 1 });
    });

    expect(await t.mutation(internal.media.cleanupExpired, {})).toBe(1);
    const state = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-profile")).unique();
      expect(organization).not.toBeNull();
      return { abandoned: await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", abandoned.id)).unique(), stored: await ctx.storage.get(abandonedStorageId) };
    });
    expect(state.abandoned).toMatchObject({ status: "replaced" });
    expect(state.abandoned).not.toHaveProperty("deleteAfter");
    expect(state.stored).toBeNull();
  });

  it("bounds unsaved profile media and removes a rejected storage object", async () => {
    const t = await seeded();
    const owner = t.withIdentity({ subject: "clerk-profile-owner" });
    await owner.mutation(api.media.generateUploadUrl, { organizationId: "org-profile", correlationId: "cor-profile-media-quota", ownerType: "gym_gallery", ownerPublicId: "org-profile" });
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-profile")).unique();
      expect(organization).not.toBeNull();
      const now = Date.now();
      for (let index = 0; index < 25; index += 1) {
        const storageId = await ctx.storage.store(new NodeBlob([`pending-${index}`]) as unknown as Blob);
        await ctx.db.insert("mediaAssets", { organizationId: organization!._id, publicId: `pending-${index}`, ownerType: "gym_gallery", ownerPublicId: "org-profile", storageId, contentType: "image/png", sizeBytes: 10, visibility: "public", status: "pending", deleteAfter: now + 86_400_000, createdAt: now, updatedAt: now });
      }
    });
    const rejectedStorageId = await t.run(async (ctx) => ctx.storage.store(new NodeBlob(["rejected"]) as unknown as Blob));
    await expectCode(owner.action(api.media.finalizeUpload, { organizationId: "org-profile", correlationId: "cor-profile-media-quota", ownerType: "gym_gallery", ownerPublicId: "org-profile", altText: "Quota test", storageId: rejectedStorageId }), "VALIDATION_ERROR");
    expect(await t.run(async (ctx) => Boolean(await ctx.storage.get(rejectedStorageId)))).toBe(false);
  });

  it("reserves and expires upload intents before a browser receives a storage URL", async () => {
    const t = await seeded();
    const owner = t.withIdentity({ subject: "clerk-profile-owner" });
    await expect(owner.mutation(api.media.generateUploadUrl, {
      organizationId: "org-profile",
      correlationId: "cor-profile-upload-intent",
      ownerType: "gym_gallery",
      ownerPublicId: "org-profile",
    })).resolves.toEqual(expect.any(String));
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-profile")).unique();
      const intent = await ctx.db.query("mediaUploadIntents").withIndex("by_organization_correlation", (q) => q.eq("organizationId", organization!._id).eq("correlationId", "cor-profile-upload-intent")).unique();
      expect(intent).toMatchObject({ ownerType: "gym_gallery", ownerPublicId: "org-profile" });
      await ctx.db.patch(intent!._id, { expiresAt: Date.now() - 1 });
    });
    expect(await t.mutation(internal.media.cleanupExpired, {})).toBe(1);
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-profile")).unique();
      expect(await ctx.db.query("mediaUploadIntents").withIndex("by_organization_correlation", (q) => q.eq("organizationId", organization!._id).eq("correlationId", "cor-profile-upload-intent")).unique()).toBeNull();
    });
  });

  it("protects media referenced by published and historical profile snapshots", async () => {
    const t = await seeded();
    const owner = t.withIdentity({ subject: "clerk-profile-owner" });
    const [firstStorageId, secondStorageId] = await t.run(async (ctx) => [
      await ctx.storage.store(new NodeBlob(["first-logo"]) as unknown as Blob),
      await ctx.storage.store(new NodeBlob(["second-logo"]) as unknown as Blob),
    ]);
    const request = { organizationId: "org-profile", correlationId: "cor-profile-versioned-media", ownerType: "gym_logo" as const, ownerPublicId: "org-profile", altText: "Profile Gym logo", contentType: "image/png" as const, sizeBytes: 10 };
    const first = await owner.mutation(internal.media.commit, { ...request, storageId: firstStorageId });
    await owner.mutation(api.domain.mutate, operation("profiles.gym.save", { shortName: "PROFILE", taglineEn: "Train with a plan", descriptionEn: "A real operating gym in Amman.", category: "Gym", audience: "All members", amenities: [], accentColor: "#123456", logoAssetId: first.id, galleryAssetIds: [] }));
    await owner.mutation(api.domain.mutate, operation("profiles.gym.publish"));

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-profile")).unique();
      const asset = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", first.id)).unique();
      await ctx.db.patch(asset!._id, { status: "scheduled_for_deletion", deleteAfter: Date.now() - 1 });
    });
    expect(await t.mutation(internal.media.cleanupExpired, {})).toBe(1);
    const restored = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-profile")).unique();
      const asset = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", first.id)).unique();
      return { status: asset?.status, stored: Boolean(await ctx.storage.get(firstStorageId)) };
    });
    expect(restored).toMatchObject({ status: "active" });
    expect(restored.stored).toBe(true);

    const second = await owner.mutation(internal.media.commit, { ...request, storageId: secondStorageId });
    await owner.mutation(api.domain.mutate, operation("profiles.gym.save", { shortName: "PROFILE", taglineEn: "Train with a plan", descriptionEn: "A real operating gym in Amman.", category: "Gym", audience: "All members", amenities: [], accentColor: "#123456", logoAssetId: second.id, galleryAssetIds: [] }));
    // Post-first-publish changes ship through the platform review path.
    await t.withIdentity({ subject: "clerk-profile-admin" }).mutation(api.domain.mutate, operation("platform.gym.profile.publish", { gymId: "profile-gym", reason: "Reviewed logo replacement." }));
    const states = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-profile")).unique();
      const rows = await ctx.db.query("mediaAssets").withIndex("by_owner", (q) => q.eq("organizationId", organization!._id).eq("ownerType", "gym_logo").eq("ownerPublicId", "org-profile")).collect();
      return rows.map((row) => ({ id: row.publicId, status: row.status }));
    });
    expect(states).toEqual(expect.arrayContaining([{ id: first.id, status: "active" }, { id: second.id, status: "active" }]));
  });

  it("does not discard logo, cover, or gallery media referenced by a published profile", async () => {
    const t = await seeded();
    const owner = t.withIdentity({ subject: "clerk-profile-owner" });
    const storageIds = await t.run(async (ctx) => [
      await ctx.storage.store(new NodeBlob(["published-logo"]) as unknown as Blob),
      await ctx.storage.store(new NodeBlob(["published-cover"]) as unknown as Blob),
      await ctx.storage.store(new NodeBlob(["published-gallery"]) as unknown as Blob),
      await ctx.storage.store(new NodeBlob(["unreferenced-draft"]) as unknown as Blob),
    ]);
    const request = { organizationId: "org-profile", correlationId: "cor-profile-discard-published", altText: "Profile media", contentType: "image/png" as const, sizeBytes: 16 };
    const [logo, cover, gallery, unreferenced] = await Promise.all([
      owner.mutation(internal.media.commit, { ...request, ownerType: "gym_logo" as const, ownerPublicId: "org-profile", storageId: storageIds[0]! }),
      owner.mutation(internal.media.commit, { ...request, ownerType: "gym_cover" as const, ownerPublicId: "org-profile", storageId: storageIds[1]! }),
      owner.mutation(internal.media.commit, { ...request, ownerType: "gym_gallery" as const, ownerPublicId: "org-profile", storageId: storageIds[2]! }),
      owner.mutation(internal.media.commit, { ...request, ownerType: "gym_gallery" as const, ownerPublicId: "org-profile", storageId: storageIds[3]! }),
    ]);

    await owner.mutation(api.domain.mutate, operation("profiles.gym.save", {
      shortName: "PROFILE",
      taglineEn: "Train with a plan",
      descriptionEn: "A real operating gym in Amman.",
      category: "Gym",
      audience: "All members",
      amenities: [],
      accentColor: "#123456",
      logoAssetId: logo.id,
      coverAssetId: cover.id,
      galleryAssetIds: [gallery.id],
    }));
    await owner.mutation(api.domain.mutate, operation("profiles.gym.publish"));

    for (const asset of [logo, cover, gallery]) {
      await expectCode(owner.mutation(api.media.discardDraft, { organizationId: "org-profile", assetId: asset.id, correlationId: "cor-profile-discard-published" }), "VALIDATION_ERROR");
    }

    await owner.mutation(api.media.discardDraft, { organizationId: "org-profile", assetId: unreferenced.id, correlationId: "cor-profile-discard-unreferenced" });
    const state = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-profile")).unique();
      const published = await Promise.all([logo, cover, gallery].map(async (asset) => {
        const row = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", asset.id)).unique();
        return row?.status;
      }));
      const unreferencedRow = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", unreferenced.id)).unique();
      return { published, unreferenced: unreferencedRow };
    });
    expect(state.published).toEqual(["active", "active", "active"]);
    expect(state.unreferenced?.status).toBe("replaced");
    expect(await t.run(async (ctx) => ctx.storage.get(storageIds[3]!))).toBeNull();
  });
});
