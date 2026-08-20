import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { Blob as NodeBlob } from "node:buffer";
import { api, internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-brand-zone-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organizationA = await ctx.db.insert("organizations", { publicId: "brand-zone-org-a", name: "Brand Zone A", slug: "brand-zone-a", status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const organizationB = await ctx.db.insert("organizations", { publicId: "brand-zone-org-b", name: "Brand Zone B", slug: "brand-zone-b", status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA1 = await ctx.db.insert("branches", { organizationId: organizationA, publicId: "brand-zone-branch-a1", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchA2 = await ctx.db.insert("branches", { organizationId: organizationA, publicId: "brand-zone-branch-a2", name: "Second", code: "SECOND", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: organizationB, publicId: "brand-zone-branch-b", name: "Other", code: "OTHER", active: true, status: "active", createdAt: now, updatedAt: now });
    const ownerA = await ctx.db.insert("users", { publicId: "brand-zone-owner-a", authSubject: "clerk-brand-zone-owner-a", email: "owner-a@brand-zone.example", fullName: "Owner A", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const managerA = await ctx.db.insert("users", { publicId: "brand-zone-manager-a", authSubject: "clerk-brand-zone-manager-a", email: "manager-a@brand-zone.example", fullName: "Manager A", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const ownerB = await ctx.db.insert("users", { publicId: "brand-zone-owner-b", authSubject: "clerk-brand-zone-owner-b", email: "owner-b@brand-zone.example", fullName: "Owner B", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organizationA, userId: ownerA, role: "owner", branchIds: [branchA1, branchA2], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organizationA, userId: managerA, role: "manager", branchIds: [branchA2], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organizationB, userId: ownerB, role: "owner", branchIds: [branchB], branchScope: "all", active: true, createdAt: now, updatedAt: now });
  });
  return {
    t,
    ownerA: t.withIdentity({ subject: "clerk-brand-zone-owner-a" }),
    managerA: t.withIdentity({ subject: "clerk-brand-zone-manager-a" }),
    ownerB: t.withIdentity({ subject: "clerk-brand-zone-owner-b" }),
  };
}

describe("tenant Brand Kit", () => {
  it("keeps owner-only validated changes separate from public profile data", async () => {
    const { ownerA, managerA } = await seeded();
    const fallback = await ownerA.query(api.domain.query, operation("settings.brand.get")) as { paletteKey: string; primaryColor: string; version: number; tokens: { primaryForeground: string } };
    expect(fallback).toMatchObject({ paletteKey: "rivet", primaryColor: "#15140f", version: 0 });
    expect(fallback.tokens.primaryForeground).toBe("#ffffff");
    await expectCode(managerA.mutation(api.domain.mutate, operation("settings.brand.update", { paletteKey: "gold", primaryColor: "#b88a2b" })), "FORBIDDEN");
    await expectCode(ownerA.mutation(api.domain.mutate, operation("settings.brand.update", { paletteKey: "gold", primaryColor: "not-a-color" })), "VALIDATION_ERROR");
    const updated = await ownerA.mutation(api.domain.mutate, operation("settings.brand.update", { paletteKey: "gold", primaryColor: "#B88A2B" })) as { paletteKey: string; primaryColor: string; version: number; tokens: { primary: string } };
    expect(updated).toMatchObject({ paletteKey: "gold", primaryColor: "#b88a2b", version: 1, tokens: { primary: "#b88a2b" } });
    const midTone = await ownerA.mutation(api.domain.mutate, operation("settings.brand.update", { paletteKey: "gold", primaryColor: "#777777" })) as { primaryColor: string; tokens: { primaryForeground: string } };
    expect(midTone).toMatchObject({ primaryColor: "#777777", tokens: { primaryForeground: "#000000" } });
  });

  it("rejects a cross-tenant logo and protects a Brand Kit logo from cleanup", async () => {
    const { t, ownerA, ownerB } = await seeded();
    const ids = await t.run(async (ctx) => {
      const organizations = await ctx.db.query("organizations").collect();
      const orgA = organizations.find((org) => org.publicId === "brand-zone-org-a")!;
      const orgB = organizations.find((org) => org.publicId === "brand-zone-org-b")!;
      const storageA = await ctx.storage.store(new NodeBlob(["logo-a"], { type: "image/png" }) as unknown as Blob);
      const storageB = await ctx.storage.store(new NodeBlob(["logo-b"], { type: "image/png" }) as unknown as Blob);
      const assetA = await ctx.db.insert("mediaAssets", { organizationId: orgA._id, publicId: "brand-logo-a", ownerType: "gym_logo", ownerPublicId: "brand-zone-org-a", storageId: storageA, contentType: "image/png", sizeBytes: 6, altText: "Brand A logo", visibility: "public", status: "pending", deleteAfter: Date.now() - 1, createdAt: Date.now(), updatedAt: Date.now() });
      const assetB = await ctx.db.insert("mediaAssets", { organizationId: orgB._id, publicId: "brand-logo-b", ownerType: "gym_logo", ownerPublicId: "brand-zone-org-b", storageId: storageB, contentType: "image/png", sizeBytes: 6, altText: "Brand B logo", visibility: "public", status: "active", createdAt: Date.now(), updatedAt: Date.now() });
      return { assetA, assetB };
    });
    await expectCode(ownerA.mutation(api.domain.mutate, operation("settings.brand.update", { paletteKey: "gold", logoAssetId: "brand-logo-b" })), "NOT_FOUND");
    await ownerA.mutation(api.domain.mutate, operation("settings.brand.update", { paletteKey: "gold", logoAssetId: "brand-logo-a" }));
    await expectCode(ownerA.mutation(api.media.discardDraft, { organizationId: "brand-zone-org-a", assetId: "brand-logo-a", correlationId: "cor-brand-zone-discard-active-logo" }), "VALIDATION_ERROR");
    await t.run(async (ctx) => {
      const organizations = await ctx.db.query("organizations").collect();
      const orgA = organizations.find((org) => org.publicId === "brand-zone-org-a")!;
      const asset = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", orgA._id).eq("publicId", "brand-logo-a")).unique();
      await ctx.db.patch(asset!._id, { status: "scheduled_for_deletion", deleteAfter: Date.now() - 1 });
    });
    const cleaned = await t.mutation(internal.media.cleanupExpired, {});
    expect(cleaned).toBe(1);
    const status = await t.run(async (ctx) => (await ctx.db.get(ids.assetA))?.status);
    expect(status).toBe("active");
    await ownerB.query(api.domain.query, operation("settings.brand.get"));
  });
});

describe("typed branch zones", () => {
  it("enforces branch scope, tenant isolation, unique codes, archive lifecycle, and audits", async () => {
    const { ownerA, ownerB, managerA, t } = await seeded();
    const created = await ownerA.mutation(api.domain.mutate, operation("zones.upsert", { branchId: "brand-zone-branch-a1", code: "CARDIO", name: "Cardio floor", nameAr: "منطقة الكارديو", kind: "cardio", capacity: 40 })) as { id: string; branchId: string; code: string; status: string };
    expect(created).toMatchObject({ organizationId: "brand-zone-org-a", branchId: "brand-zone-branch-a1", code: "CARDIO", status: "active" });
    await expectCode(ownerA.mutation(api.domain.mutate, operation("zones.upsert", { branchId: "brand-zone-branch-a1", code: "cardio", name: "Duplicate", kind: "weights" })), "CONFLICT");
    await expectCode(managerA.mutation(api.domain.mutate, operation("zones.upsert", { branchId: "brand-zone-branch-a1", code: "WEIGHTS", name: "Weights", kind: "weights" })), "FORBIDDEN");
    await expectCode(ownerB.query(api.domain.query, operation("zones.list", { branchId: "brand-zone-branch-a1" })), "NOT_FOUND");
    const archived = await ownerA.mutation(api.domain.mutate, operation("zones.archive", { id: created.id })) as { status: string };
    expect(archived.status).toBe("archived");
    expect(await ownerA.query(api.domain.query, operation("zones.list", { branchId: "brand-zone-branch-a1" }))).toEqual([]);
    expect(await ownerA.query(api.domain.query, operation("zones.list", { branchId: "brand-zone-branch-a1", includeArchived: true }))).toEqual([expect.objectContaining({ id: created.id, status: "archived" })]);
    const audits = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((event) => event.entityType === "zone"));
    expect(audits.map((event) => event.action)).toEqual(expect.arrayContaining(["zone.create", "zone.archive"]));
  });
});
