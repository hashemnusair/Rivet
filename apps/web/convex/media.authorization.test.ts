import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { Blob as NodeBlob } from "node:buffer";
import { api, internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

describe("media authorization boundary", () => {
  it("separates private member photos from publishable gym/trainer media and hides foreign targets", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const now = Date.now();
      const organizationA = await ctx.db.insert("organizations", { publicId: "media-org-a", name: "Media A", slug: "media-a", status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
      const organizationB = await ctx.db.insert("organizations", { publicId: "media-org-b", name: "Media B", slug: "media-b", status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
      const branchA = await ctx.db.insert("branches", { organizationId: organizationA, publicId: "media-branch-a", name: "A", code: "A", active: true, createdAt: now, updatedAt: now });
      const branchA2 = await ctx.db.insert("branches", { organizationId: organizationA, publicId: "media-branch-a2", name: "A2", code: "A2", active: true, createdAt: now, updatedAt: now });
      const branchB = await ctx.db.insert("branches", { organizationId: organizationB, publicId: "media-branch-b", name: "B", code: "B", active: true, createdAt: now, updatedAt: now });
      const ownerA = await ctx.db.insert("users", { publicId: "media-owner-a", authSubject: "clerk-media-owner-a", email: "owner-a@example.test", fullName: "Owner A", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      const receptionA = await ctx.db.insert("users", { publicId: "media-reception-a", authSubject: "clerk-media-reception-a", email: "reception-a@example.test", fullName: "Reception A", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      const ownerB = await ctx.db.insert("users", { publicId: "media-owner-b", authSubject: "clerk-media-owner-b", email: "owner-b@example.test", fullName: "Owner B", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      const trainerA = await ctx.db.insert("users", { publicId: "media-trainer-user-a", authSubject: "clerk-media-trainer-a", email: "trainer-a@example.test", fullName: "Trainer A", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: organizationA, userId: ownerA, role: "owner", branchIds: [branchA], branchScope: "all", active: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: organizationA, userId: receptionA, role: "receptionist", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: organizationA, userId: trainerA, role: "trainer", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: organizationB, userId: ownerB, role: "owner", branchIds: [branchB], branchScope: "all", active: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("domainRecords", { organizationId: organizationA, entityType: "member", publicId: "media-member-a", branchId: branchA, memberPublicId: "media-member-a", createdAt: now, updatedAt: now, data: { id: "media-member-a", fullName: "Member A" } });
      await ctx.db.insert("domainRecords", { organizationId: organizationA, entityType: "member", publicId: "media-member-a2", branchId: branchA2, memberPublicId: "media-member-a2", createdAt: now, updatedAt: now, data: { id: "media-member-a2", fullName: "Member A2", homeBranchId: "media-branch-a2" } });
      await ctx.db.insert("domainRecords", { organizationId: organizationB, entityType: "member", publicId: "media-member-b", branchId: branchB, memberPublicId: "media-member-b", createdAt: now, updatedAt: now, data: { id: "media-member-b", fullName: "Member B" } });
      await ctx.db.insert("ptTrainerProfiles", { organizationId: organizationA, publicId: "media-trainer-a", userId: trainerA, displayName: "Trainer A", specialties: [], languages: ["en"], branchIds: [branchA], status: "published", createdAt: now, updatedAt: now });
    });

    const ownerA = t.withIdentity({ subject: "clerk-media-owner-a" });
    const receptionA = t.withIdentity({ subject: "clerk-media-reception-a" });
    const ownerB = t.withIdentity({ subject: "clerk-media-owner-b" });
    const request = { organizationId: "media-org-a", correlationId: "cor-media-auth" };
    const storageIds = await t.run(async (ctx) => ({
      member: await ctx.storage.store(new NodeBlob(["member-photo"], { type: "image/png" }) as unknown as Blob),
      gym: await ctx.storage.store(new NodeBlob(["gym-photo"], { type: "image/png" }) as unknown as Blob),
      trainer: await ctx.storage.store(new NodeBlob(["trainer-photo"], { type: "image/png" }) as unknown as Blob),
    }));
    await ownerA.mutation(api.media.generateUploadUrl, { ...request, correlationId: "cor-media-member", ownerType: "member_photo", ownerPublicId: "media-member-a" });
    await ownerA.mutation(api.media.generateUploadUrl, { ...request, correlationId: "cor-media-gym", ownerType: "gym_cover", ownerPublicId: "media-org-a" });
    await ownerA.mutation(api.media.generateUploadUrl, { ...request, correlationId: "cor-media-trainer", ownerType: "trainer_photo", ownerPublicId: "media-trainer-a" });

    await expect(ownerA.mutation(internal.media.authorizeFinalize, { ...request, correlationId: "cor-media-member", ownerType: "member_photo", ownerPublicId: "media-member-a", storageId: storageIds.member })).resolves.toMatchObject({ visibility: "private" });
    await expect(ownerA.mutation(internal.media.authorizeFinalize, { ...request, correlationId: "cor-media-gym", ownerType: "gym_cover", ownerPublicId: "media-org-a", altText: "Members training in the gym", storageId: storageIds.gym })).resolves.toMatchObject({ visibility: "public" });
    await expect(ownerA.mutation(internal.media.authorizeFinalize, { ...request, correlationId: "cor-media-trainer", ownerType: "trainer_photo", ownerPublicId: "media-trainer-a", altText: "Trainer A portrait", storageId: storageIds.trainer })).resolves.toMatchObject({ visibility: "public" });

    await expectCode(receptionA.mutation(internal.media.authorizeFinalize, { ...request, correlationId: "cor-media-member", ownerType: "member_photo", ownerPublicId: "media-member-a", storageId: storageIds.member }), "FORBIDDEN");
    await expectCode(ownerA.mutation(internal.media.authorizeFinalize, { ...request, correlationId: "cor-media-gym", ownerType: "gym_cover", ownerPublicId: "media-org-a", storageId: storageIds.gym }), "VALIDATION_ERROR");
    await t.run(async (ctx) => {
      const now = Date.now();
      const organizationA = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "media-org-a")).unique();
      const organizationB = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "media-org-b")).unique();
      await ctx.db.insert("mediaUploadIntents", { organizationId: organizationA!._id, publicId: "intent-foreign-member", correlationId: "cor-media-foreign-member", ownerType: "member_photo", ownerPublicId: "media-member-b", createdAt: now, expiresAt: now + 60_000 });
      await ctx.db.insert("mediaUploadIntents", { organizationId: organizationB!._id, publicId: "intent-foreign-gym", correlationId: "cor-media-foreign", ownerType: "gym_cover", ownerPublicId: "media-org-a", createdAt: now, expiresAt: now + 60_000 });
      await ctx.db.insert("mediaUploadIntents", { organizationId: organizationB!._id, publicId: "intent-foreign-trainer", correlationId: "cor-media-foreign-trainer", ownerType: "trainer_photo", ownerPublicId: "media-trainer-a", createdAt: now, expiresAt: now + 60_000 });
    });
    await expectCode(ownerA.mutation(internal.media.authorizeFinalize, { ...request, correlationId: "cor-media-foreign-member", ownerType: "member_photo", ownerPublicId: "media-member-b", storageId: storageIds.member }), "NOT_FOUND");
    await expectCode(ownerB.mutation(internal.media.authorizeFinalize, { organizationId: "media-org-b", correlationId: "cor-media-foreign", ownerType: "gym_cover", ownerPublicId: "media-org-a", altText: "Foreign target", storageId: storageIds.gym }), "NOT_FOUND");
    await expectCode(ownerB.mutation(internal.media.authorizeFinalize, { organizationId: "media-org-b", correlationId: "cor-media-foreign-trainer", ownerType: "trainer_photo", ownerPublicId: "media-trainer-a", altText: "Foreign trainer", storageId: storageIds.trainer }), "NOT_FOUND");

    await expectCode(ownerA.action(api.media.finalizeUpload, { organizationId: "media-org-a", ownerType: "member_photo", ownerPublicId: "media-member-a", storageId: storageIds.member }), "VALIDATION_ERROR");

    await ownerA.mutation(api.media.generateUploadUrl, { ...request, correlationId: "cor-media-mismatch", ownerType: "member_photo", ownerPublicId: "media-member-a" });
    await ownerA.mutation(internal.media.authorizeFinalize, { ...request, correlationId: "cor-media-mismatch", ownerType: "member_photo", ownerPublicId: "media-member-a", storageId: storageIds.member });
    await expectCode(ownerA.action(api.media.finalizeUpload, { ...request, correlationId: "cor-media-mismatch", ownerType: "member_photo", ownerPublicId: "media-member-a", storageId: storageIds.gym }), "CONFLICT");
    await expectCode(ownerA.action(api.media.finalizeUpload, { ...request, correlationId: "cor-media-mismatch", ownerType: "gym_cover", ownerPublicId: "media-org-a", altText: "Wrong owner", storageId: storageIds.member }), "CONFLICT");

    await ownerA.mutation(api.media.generateUploadUrl, { ...request, correlationId: "cor-media-expired", ownerType: "member_photo", ownerPublicId: "media-member-a" });
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "media-org-a")).unique();
      const intent = await ctx.db.query("mediaUploadIntents").withIndex("by_organization_correlation", (q) => q.eq("organizationId", organization!._id).eq("correlationId", "cor-media-expired")).unique();
      await ctx.db.patch(intent!._id, { expiresAt: Date.now() - 1 });
    });
    await expectCode(ownerA.action(api.media.finalizeUpload, { ...request, correlationId: "cor-media-expired", ownerType: "member_photo", ownerPublicId: "media-member-a", storageId: storageIds.member }), "CONFLICT");

    await ownerA.mutation(api.media.generateUploadUrl, { ...request, correlationId: "cor-media-cross-branch", ownerType: "member_photo", ownerPublicId: "media-member-a2" });
    await expectCode(receptionA.mutation(api.media.generateUploadUrl, { ...request, activeBranchId: "media-branch-a", correlationId: "cor-media-cross-branch-new", ownerType: "member_photo", ownerPublicId: "media-member-a2" }), "FORBIDDEN");
    await expectCode(receptionA.mutation(internal.media.authorizeFinalize, { ...request, activeBranchId: "media-branch-a", correlationId: "cor-media-cross-branch", ownerType: "member_photo", ownerPublicId: "media-member-a2", storageId: storageIds.member }), "FORBIDDEN");
  });
});
