import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
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
      await ctx.db.insert("domainRecords", { organizationId: organizationB, entityType: "member", publicId: "media-member-b", branchId: branchB, memberPublicId: "media-member-b", createdAt: now, updatedAt: now, data: { id: "media-member-b", fullName: "Member B" } });
      await ctx.db.insert("ptTrainerProfiles", { organizationId: organizationA, publicId: "media-trainer-a", userId: trainerA, displayName: "Trainer A", specialties: [], languages: ["en"], branchIds: [branchA], status: "published", createdAt: now, updatedAt: now });
    });

    const ownerA = t.withIdentity({ subject: "clerk-media-owner-a" });
    const receptionA = t.withIdentity({ subject: "clerk-media-reception-a" });
    const ownerB = t.withIdentity({ subject: "clerk-media-owner-b" });
    const request = { organizationId: "media-org-a", correlationId: "cor-media-auth" };

    await expect(ownerA.mutation(internal.media.authorizeFinalize, { ...request, ownerType: "member_photo", ownerPublicId: "media-member-a" })).resolves.toMatchObject({ visibility: "private" });
    await expect(ownerA.mutation(internal.media.authorizeFinalize, { ...request, ownerType: "gym_cover", ownerPublicId: "media-org-a", altText: "Members training in the gym" })).resolves.toMatchObject({ visibility: "public" });
    await expect(ownerA.mutation(internal.media.authorizeFinalize, { ...request, ownerType: "trainer_photo", ownerPublicId: "media-trainer-a", altText: "Trainer A portrait" })).resolves.toMatchObject({ visibility: "public" });

    await expectCode(receptionA.mutation(internal.media.authorizeFinalize, { ...request, ownerType: "member_photo", ownerPublicId: "media-member-a" }), "FORBIDDEN");
    await expectCode(ownerA.mutation(internal.media.authorizeFinalize, { ...request, ownerType: "gym_cover", ownerPublicId: "media-org-a" }), "VALIDATION_ERROR");
    await expectCode(ownerA.mutation(internal.media.authorizeFinalize, { ...request, ownerType: "member_photo", ownerPublicId: "media-member-b" }), "NOT_FOUND");
    await expectCode(ownerB.mutation(internal.media.authorizeFinalize, { organizationId: "media-org-b", correlationId: "cor-media-foreign", ownerType: "gym_cover", ownerPublicId: "media-org-a", altText: "Foreign target" }), "NOT_FOUND");
    await expectCode(ownerB.mutation(internal.media.authorizeFinalize, { organizationId: "media-org-b", correlationId: "cor-media-foreign-trainer", ownerType: "trainer_photo", ownerPublicId: "media-trainer-a", altText: "Foreign trainer" }), "NOT_FOUND");
  });
});
