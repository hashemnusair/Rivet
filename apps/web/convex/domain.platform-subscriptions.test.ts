import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-test-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-sub", name: "Subscription Gym", slug: "subscription-gym", status: "active", subscriptionPlan: "Growth", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-sub", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const admin = await ctx.db.insert("users", { publicId: "platform", authSubject: "clerk-platform", email: "platform@example.com", fullName: "Platform Admin", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner", authSubject: "clerk-owner", email: "owner@example.com", fullName: "Gym Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationEntitlements", { organizationId: organization, catalogVersion: 1, subscriptionPlan: "Growth", entitledModules: ["foundation", "revenue", "operations"], source: "subscription_plan", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "marketplaceGym", publicId: "subscription-gym", createdAt: now, updatedAt: now, data: { id: "subscription-gym", name: "Subscription Gym", targetOrganizationId: "org-sub", subscriptionStatus: "active", rivetPlan: "Growth", isPublic: true, branches: [] } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "platformPlan", publicId: "Growth", createdAt: now, updatedAt: now, data: { id: "Growth", name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500, tone: "signal" } });
    void admin;
  });
}

describe("exported Convex platform subscription lifecycle", () => {
  it("requires platform authorization, a reason, and a trial end date", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const owner = t.withIdentity({ subject: "clerk-owner" });
    await expectCode(owner.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "suspended", reason: "Test" })), "FORBIDDEN");
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "suspended", reason: "" })), "VALIDATION_ERROR");
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "trial", reason: "Starting pilot trial." })), "VALIDATION_ERROR");
  });

  it("keeps the directory, tenant lifecycle, and immutable audit reason aligned", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const subscriptionStartedAt = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const updated = await platform.mutation(api.domain.mutate, operation("platform.gym.update", {
      gymId: "subscription-gym",
      status: "trial",
      plan: "Starter",
      isPublic: false,
      trialEndsAt: "2026-09-30",
      subscriptionStartedAt,
      currentPeriodEndsAt: "2026-09-30",
      reason: "Approved thirty-day pilot.",
    })) as Record<string, unknown>;
    expect(updated).toMatchObject({ subscriptionStatus: "trial", rivetPlan: "Starter", isPublic: false, trialEndsAt: "2026-09-30T00:00:00.000Z", subscriptionStatusReason: "Approved thirty-day pilot." });

    const persisted = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
      return {
        organization,
        entitlement: organization ? await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique() : null,
        audit: (await ctx.db.query("platformAuditEvents").collect()).find((event) => event.entityPublicId === "subscription-gym"),
      };
    });
    expect(persisted.organization).toMatchObject({ status: "trial", subscriptionPlan: "Starter", subscriptionStatusReason: "Approved thirty-day pilot." });
    expect(persisted.organization?.trialEndsAt).toBe(Date.parse("2026-09-30"));
    expect(persisted.entitlement).toMatchObject({ subscriptionPlan: "Starter", source: "subscription_plan", entitledModules: ["foundation", "revenue"] });
    expect(persisted.audit).toMatchObject({ action: "gym.subscription.update", reason: "Approved thirty-day pilot.", before: { subscriptionStatus: "active", organization: { status: "active", subscriptionPlan: "Growth" }, entitlements: { subscriptionPlan: "Growth" } }, after: { subscriptionStatus: "trial", organization: { status: "trial", subscriptionPlan: "Starter" }, entitlements: { subscriptionPlan: "Starter" } } });

    const cancelled = await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "cancelled", reason: "Customer requested cancellation." })) as Record<string, unknown>;
    expect(cancelled).toMatchObject({ subscriptionStatus: "cancelled", cancelledAt: expect.any(String) });
    await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "cancelled", reason: "Reconfirmed cancellation state." }));
    const emails = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "operationalEmailDelivery")).collect()).map((record) => record.data));
    expect(emails.filter((email) => email.kind === "platform_subscription_cancelled")).toHaveLength(1);
    expect(emails).toEqual([expect.objectContaining({ kind: "platform_subscription_cancelled", status: "suppressed", suppressionReason: expect.stringContaining("disabled or the provider is not configured") })]);
  });

  it("uses organization lifecycle as the public discovery authority and keeps stale rows out", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });

    const before = await t.query(api.domain.query, operation("public.marketplace")) as Array<{ id: string }>;
    expect(before.map((gym) => gym.id)).toEqual(["subscription-gym"]);

    await t.run(async (ctx) => {
      const listing = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).unique();
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
      if (!listing || !organization) throw new Error("seed subscription records missing");
      // The organization remains authoritative even when a legacy listing
      // projection has a stale lifecycle status in the opposite direction.
      await ctx.db.patch(listing._id, { data: { ...(listing.data as Record<string, unknown>), subscriptionStatus: "suspended" }, updatedAt: Date.now() });
    });
    const staleDirectoryStatus = await t.query(api.domain.query, operation("public.marketplace")) as Array<{ id: string; subscriptionStatus: string }>;
    expect(staleDirectoryStatus).toEqual([expect.objectContaining({ id: "subscription-gym", subscriptionStatus: "active" })]);

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
      if (!organization) throw new Error("seed organization missing");
      // Simulate a stale legacy marketplace projection: the listing remains
      // public while the authoritative tenant has been suspended.
      await ctx.db.patch(organization._id, { status: "suspended", updatedAt: Date.now() });
    });

    const after = await t.query(api.domain.query, operation("public.marketplace")) as Array<{ id: string }>;
    expect(after).toEqual([]);
    const snapshot = await platform.query(api.domain.query, operation("platform.snapshot")) as { gyms: Array<{ id: string; subscriptionStatus: string; isPublic?: boolean; isProvisioned?: boolean }> };
    expect(snapshot.gyms).toEqual([expect.objectContaining({ id: "subscription-gym", subscriptionStatus: "suspended", isPublic: false, isProvisioned: true })]);
  });

  it("uses the organization plan as authority and audits entitlement/listing drift", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
      const listing = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).unique();
      if (!organization || !listing) throw new Error("seed subscription records missing");
      await ctx.db.patch(organization._id, { subscriptionPlan: "Pro", updatedAt: Date.now() });
      await ctx.db.patch(listing._id, { data: { ...(listing.data as Record<string, unknown>), rivetPlan: "Starter" }, updatedAt: Date.now() });
    });

    const updated = await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "suspended", reason: "Repair lifecycle while preserving the organization plan." })) as Record<string, unknown>;
    expect(updated).toMatchObject({ rivetPlan: "Pro", subscriptionStatus: "suspended", isPublic: false });
    const persisted = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
      const listing = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).unique();
      const entitlement = organization ? await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique() : null;
      const audit = (await ctx.db.query("platformAuditEvents").collect()).find((event) => event.entityPublicId === "subscription-gym");
      return { organization, listing, entitlement, audit };
    });
    expect(persisted.organization).toMatchObject({ status: "suspended", subscriptionPlan: "Pro" });
    expect(persisted.entitlement).toMatchObject({ subscriptionPlan: "Pro" });
    expect(persisted.listing?.data).toMatchObject({ rivetPlan: "Pro" });
    expect(persisted.audit).toMatchObject({ before: { planResolution: { source: "organization", drift: true } }, after: { planResolution: { source: "organization", drift: false } } });
  });

  it("does not promote stale directory lifecycle dates into the organization", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    await t.run(async (ctx) => {
      const listing = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).unique();
      if (!listing) throw new Error("seed marketplace listing missing");
      await ctx.db.patch(listing._id, {
        data: {
          ...(listing.data as Record<string, unknown>),
          trialEndsAt: "2099-12-31T00:00:00.000Z",
          subscriptionStartedAt: "2099-01-01T00:00:00.000Z",
          currentPeriodEndsAt: "2099-12-31T00:00:00.000Z",
        },
        updatedAt: Date.now(),
      });
    });
    const staleSnapshot = await platform.query(api.domain.query, operation("platform.snapshot")) as { gyms: Array<Record<string, unknown>> };
    expect(staleSnapshot.gyms[0]).not.toHaveProperty("trialEndsAt");
    expect(staleSnapshot.gyms[0]).not.toHaveProperty("subscriptionStartedAt");
    expect(staleSnapshot.gyms[0]).not.toHaveProperty("currentPeriodEndsAt");
    await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", plan: "Starter", reason: "Update plan without importing stale listing dates." }));
    const persisted = await t.run(async (ctx) => ({
      organization: await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique(),
      listing: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).unique(),
    }));
    expect(persisted.organization).toMatchObject({ subscriptionPlan: "Starter" });
    expect(persisted.organization?.trialEndsAt).toBeUndefined();
    expect(persisted.organization?.subscriptionStartedAt).toBeUndefined();
    expect(persisted.listing?.data).toMatchObject({ rivetPlan: "Starter" });
    expect((persisted.listing?.data as Record<string, unknown> | undefined)?.trialEndsAt).toBeUndefined();
    expect((persisted.listing?.data as Record<string, unknown> | undefined)?.subscriptionStartedAt).toBeUndefined();
  });

  it("persists every tier change and immediately projects the matching workspace modules", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const owner = t.withIdentity({ subject: "clerk-owner" });
    const tiers = [
      { plan: "Starter" as const, entitled: ["foundation", "revenue"], locked: ["operations", "finance", "reporting"] },
      { plan: "Growth" as const, entitled: ["foundation", "revenue", "operations"], locked: ["finance", "reporting"] },
      { plan: "Pro" as const, entitled: ["foundation", "revenue", "operations", "finance", "reporting"], locked: [] },
      { plan: "Enterprise" as const, entitled: ["foundation", "revenue", "operations", "finance", "reporting"], locked: [] },
    ];

    for (const tier of tiers) {
      await platform.mutation(api.domain.mutate, operation("platform.gym.update", {
        gymId: "subscription-gym",
        status: "active",
        plan: tier.plan,
        isPublic: true,
        reason: `Enable ${tier.plan} workspace tier for the tenant.`,
      }));

      const persisted = await t.run(async (ctx) => {
        const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
        const entitlement = organization ? await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique() : null;
        return { organization, entitlement };
      });
      expect(persisted.organization).toMatchObject({ subscriptionPlan: tier.plan, status: "active" });
      expect(persisted.entitlement).toMatchObject({ subscriptionPlan: tier.plan, source: "subscription_plan", entitledModules: tier.entitled });

      const access = await owner.query(api.domain.query, operation("workspace.access")) as { entitlements: { subscriptionPlan: string; entitledModules: string[] }; modules: Array<{ key: string; entitled: boolean; enabled: boolean; lockedReason?: string }> };
      expect(access.entitlements).toMatchObject({ subscriptionPlan: tier.plan, entitledModules: tier.entitled });
      expect(access.modules.filter((module) => module.entitled && module.enabled).map((module) => module.key)).toEqual(tier.entitled);
      for (const moduleKey of tier.locked) {
        const status = access.modules.find((module) => module.key === moduleKey);
        expect(status).toMatchObject({ entitled: false, enabled: false, lockedReason: "not_entitled" });
        await expectCode(owner.query(api.domain.query, operation("workspace.module", { moduleKey })), "FEATURE_NOT_AVAILABLE");
      }
      const session = await owner.query(api.domain.query, operation("session")) as { workspace: { entitlements: { subscriptionPlan: string; entitledModules: string[] } } };
      expect(session.workspace.entitlements).toMatchObject({ subscriptionPlan: tier.plan, entitledModules: tier.entitled });
      if (tier.plan === "Starter") {
        // Simulate a tenant provisioned directly on Starter. Its preference
        // row must not prevent a later Growth upgrade from enabling the newly
        // purchased operations module.
        await t.run(async (ctx) => {
          const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
          const ownerUser = await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", "owner")).unique();
          if (!organization || !ownerUser) throw new Error("seed organization missing");
          const preferences = await ctx.db.query("workspaceModulePreferences").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique();
          if (preferences) await ctx.db.patch(preferences._id, { enabledModules: ["foundation", "revenue"], updatedAt: Date.now() });
          else await ctx.db.insert("workspaceModulePreferences", { organizationId: organization._id, catalogVersion: 1, enabledModules: ["foundation", "revenue"], updatedByUserId: ownerUser._id, createdAt: Date.now(), updatedAt: Date.now() });
        });
      }
    }
  });

  it("allows cleanup-only hiding but rejects tenant mutations for unprovisioned rows", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
      if (!organization) throw new Error("seed organization missing");
      await ctx.db.insert("domainRecords", {
        organizationId: organization._id,
        entityType: "marketplaceGym",
        publicId: "directory-only",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: { id: "directory-only", name: "Legacy Directory Gym", targetOrganizationId: "missing-org", subscriptionStatus: "active", rivetPlan: "Growth", isPublic: true },
      });
    });
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "directory-only", status: "suspended", reason: "Reject unprovisioned tenant mutation." })), "CONFIGURATION_ERROR");
    const hidden = await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "directory-only", isPublic: false, reason: "Remove stale directory visibility." })) as Record<string, unknown>;
    expect(hidden).toMatchObject({ id: "directory-only", subscriptionStatus: "suspended", isPublic: false, subscriptionStatusReason: "Organization is not provisioned." });
    const snapshot = await platform.query(api.domain.query, operation("platform.snapshot")) as { gyms: Array<{ id: string; subscriptionStatus: string; isPublic?: boolean; isProvisioned?: boolean }>; overview: { gymCounts: Record<string, number> } };
    expect(snapshot.gyms).toEqual(expect.arrayContaining([expect.objectContaining({ id: "directory-only", subscriptionStatus: "suspended", isPublic: false, isProvisioned: false })]));
    expect(snapshot.overview.gymCounts.active).toBe(1);
  });

  it("keeps expired trials out of public discovery", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
      const listing = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).unique();
      if (!organization || !listing) throw new Error("seed subscription records missing");
      await ctx.db.patch(organization._id, { status: "trial", trialEndsAt: Date.now() - 86_400_000, updatedAt: Date.now() });
      await ctx.db.patch(listing._id, { data: { ...(listing.data as Record<string, unknown>), subscriptionStatus: "trial", trialEndsAt: "2099-12-31T00:00:00.000Z", isPublic: true }, updatedAt: Date.now() });
    });
    expect(await t.query(api.domain.query, operation("public.marketplace"))).toEqual([]);
  });

  it("forces suspended and cancelled projections private even when a stale save asks to publish", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const suspended = await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "suspended", isPublic: true, reason: "Billing review requires access suspension." })) as Record<string, unknown>;
    expect(suspended).toMatchObject({ subscriptionStatus: "suspended", isPublic: false });
    const persisted = await t.run(async (ctx) => ({
      listing: (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).unique())?.data,
      organization: await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique(),
      audit: (await ctx.db.query("platformAuditEvents").collect()).find((event) => event.entityPublicId === "subscription-gym"),
    }));
    expect(persisted.listing).toMatchObject({ subscriptionStatus: "suspended", isPublic: false });
    expect(persisted.organization).toMatchObject({ status: "suspended", subscriptionStatusReason: "Billing review requires access suspension." });
    expect(persisted.audit).toMatchObject({ before: { isPublic: true }, after: { isPublic: false, organization: { status: "suspended" } } });
  });

  it("rejects impossible lifecycle dates before writing a subscription audit", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "trial", trialEndsAt: "2026-02-31", reason: "Reject malformed lifecycle date." })), "VALIDATION_ERROR");
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "active", cancelledAt: "2026-01-01", reason: "Reject cancellation date on active subscription." })), "VALIDATION_ERROR");
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "cancelled", subscriptionStartedAt: "2099-01-01", reason: "Reject cancellation before a future start." })), "VALIDATION_ERROR");
    const audits = await t.run(async (ctx) => ctx.db.query("platformAuditEvents").collect());
    expect(audits).toEqual([]);
  });

  it("reason-gates money-sensitive platform plan catalog edits", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.plan.update", { name: "Growth", priceMinor: 159_000 })), "VALIDATION_ERROR");
    const updated = await platform.mutation(api.domain.mutate, operation("platform.plan.update", { name: "Growth", priceMinor: 159_000, reason: "Annual pricing review approved." })) as Record<string, unknown>;
    expect(updated).toMatchObject({ name: "Growth", priceMinor: 159_000 });
    const audit = await t.run(async (ctx) => (await ctx.db.query("platformAuditEvents").collect()).find((event) => event.entityPublicId === "Growth"));
    expect(audit).toMatchObject({ action: "plan.catalog_update", reason: "Annual pricing review approved.", before: { priceMinor: 149_000 }, after: { priceMinor: 159_000 } });
  });

  it("upserts an editable default catalog row when a fresh deployment has no row yet", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const updated = await platform.mutation(api.domain.mutate, operation("platform.plan.update", {
      name: "Starter",
      priceMinor: 89_000,
      reason: "Launch pricing approved.",
    })) as Record<string, unknown>;
    expect(updated).toMatchObject({ id: "Starter", name: "Starter", priceMinor: 89_000, branches: 1, staff: 8, members: 500 });
    const persisted = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformPlan")).collect()).find((row) => row.publicId === "Starter"));
    expect(persisted?.data).toMatchObject({ name: "Starter", priceMinor: 89_000 });
    const catalog = await t.query(api.domain.query, operation("public.catalog")) as Array<{ name: string }>;
    expect(catalog.map((plan) => plan.name)).toEqual(["Starter", "Growth", "Pro", "Enterprise"]);
    expect(catalog.find((plan) => plan.name === "Enterprise")).toMatchObject({ name: "Enterprise", priceMinor: 500_000 });
  });
});
