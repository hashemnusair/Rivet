import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
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
    publicRows = await owner.query(api.domain.query, operation("public.marketplace")) as Array<Record<string, unknown>>;
    expect(publicRows[0]).toMatchObject({ tagline: "Train with a plan", taglineAr: "تدرب بخطة", memberCount: 1, fromPriceMinor: 45_000, profileVersion: 1 });

    const versions = await owner.query(api.domain.query, operation("profiles.gym.versions")) as Array<{ version: number; status: string }>;
    expect(versions).toEqual([expect.objectContaining({ version: 1, status: "published" })]);
    await expectCode(owner.mutation(api.domain.mutate, operation("profiles.gym.unpublish", { reason: "" })), "VALIDATION_ERROR");
    await owner.mutation(api.domain.mutate, operation("profiles.gym.unpublish", { reason: "Temporarily hiding the public profile" }));
    expect(await owner.query(api.domain.query, operation("public.marketplace"))).toEqual([]);

    const listing = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).first())?.data);
    expect(listing).toMatchObject({ isPublic: true, profilePublished: false });
  });

  it("denies profile management to reception", async () => {
    const t = await seeded();
    const reception = t.withIdentity({ subject: "clerk-profile-reception" });
    await expectCode(reception.query(api.domain.query, operation("profiles.gym.get")), "FORBIDDEN");
    await expectCode(reception.mutation(api.domain.mutate, operation("profiles.gym.publish")), "FORBIDDEN");
  });
});
