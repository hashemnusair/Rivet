import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { Blob as NodeBlob } from "node:buffer";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-test-${name}` });
const SELECTED_PERIOD_END = "2099-12-31T23:59:59.999Z";
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seed(t: TestConvex<typeof schema>, options: { status?: "active" | "trial" } = {}) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-sub", name: "Subscription Gym", slug: "subscription-gym", status: options.status ?? "active", subscriptionPlan: "Growth", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
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
  it("requires platform authorization and keeps onboarding trial dates automatic", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const owner = t.withIdentity({ subject: "clerk-owner" });
    await expectCode(owner.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "suspended", reason: "Test" })), "FORBIDDEN");
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "suspended", reason: "" })), "VALIDATION_ERROR");

    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "trial", reason: "Attempt to restart an onboarding trial." })), "VALIDATION_ERROR");
    const trialTenant = convexTest(schema, modules);
    await seed(trialTenant, { status: "trial" });
    const trialPlatform = trialTenant.withIdentity({ subject: "clerk-platform" });
    const trial = await trialPlatform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "trial", reason: "Keep the onboarding trial state." })) as Record<string, unknown>;
    expect(trial).toMatchObject({ subscriptionStatus: "trial", trialEndsAt: expect.any(String), subscriptionStartedAt: expect.any(String) });
  });

  it("persists the requested billing cadence and derives the matching paid period", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });

    const annual = await platform.mutation(api.domain.mutate, operation("platform.gym.update", {
      gymId: "subscription-gym",
      status: "active",
      billingInterval: "annual",
      currentPeriodEndsAt: SELECTED_PERIOD_END,
      reason: "Approve annual billing for the tenant.",
    })) as Record<string, unknown>;
    const annualPeriodEnd = Date.parse(String(annual.currentPeriodEndsAt));
    expect(annual).toMatchObject({ subscriptionStatus: "active", billingInterval: "annual" });
    expect(annualPeriodEnd).toBe(Date.parse(SELECTED_PERIOD_END));

    const monthly = await platform.mutation(api.domain.mutate, operation("platform.gym.update", {
      gymId: "subscription-gym",
      billingInterval: "monthly",
      currentPeriodEndsAt: "2099-11-30T23:59:59.999Z",
      reason: "Move the tenant to monthly billing.",
    })) as Record<string, unknown>;
    const monthlyPeriodEnd = Date.parse(String(monthly.currentPeriodEndsAt));
    expect(monthly).toMatchObject({ subscriptionStatus: "active", billingInterval: "monthly" });
    expect(monthlyPeriodEnd).toBe(Date.parse("2099-11-30T23:59:59.999Z"));

    const persisted = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
      const listing = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).unique();
      const audit = (await ctx.db.query("platformAuditEvents").collect()).find((event) => event.entityPublicId === "subscription-gym" && (event.after as Record<string, unknown> | undefined)?.billingInterval === "monthly");
      return { organization, listing, audit };
    });
    expect(persisted.organization).toMatchObject({ billingInterval: "monthly" });
    expect(persisted.listing?.data).toMatchObject({ billingInterval: "monthly" });
    expect(persisted.audit).toMatchObject({
      action: "gym.subscription.update",
      before: { billingInterval: "annual" },
      after: { billingInterval: "monthly" },
    });
  });

  it("requires and persists an admin-selected end date for material changes while keeping trial dates automatic", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });

    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "suspended", reason: "Require an explicit membership boundary." })), "VALIDATION_ERROR");
    const suspended = await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "suspended", currentPeriodEndsAt: SELECTED_PERIOD_END, reason: "Pause access at the selected membership boundary." })) as Record<string, unknown>;
    expect(suspended).toMatchObject({ subscriptionStatus: "suspended", currentPeriodEndsAt: SELECTED_PERIOD_END });

    const cancelled = await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "cancelled", currentPeriodEndsAt: SELECTED_PERIOD_END, reason: "Cancel at the selected membership boundary." })) as Record<string, unknown>;
    expect(cancelled).toMatchObject({ subscriptionStatus: "cancelled", currentPeriodEndsAt: SELECTED_PERIOD_END, cancelledAt: expect.any(String) });

    const trialTest = convexTest(schema, modules);
    await seed(trialTest, { status: "trial" });
    const trialPlatform = trialTest.withIdentity({ subject: "clerk-platform" });
    await expectCode(trialPlatform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "trial", currentPeriodEndsAt: SELECTED_PERIOD_END, reason: "Trial end remains server-derived." })), "VALIDATION_ERROR");
    const trial = await trialPlatform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "trial", reason: "Start the onboarding trial." })) as Record<string, unknown>;
    expect(trial).toMatchObject({ subscriptionStatus: "trial", trialEndsAt: expect.any(String) });
    expect(trial.currentPeriodEndsAt).toBeUndefined();
  });

  it("keeps the directory, tenant lifecycle, and immutable audit reason aligned", async () => {
    const t = convexTest(schema, modules);
    await seed(t, { status: "trial" });
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const updated = await platform.mutation(api.domain.mutate, operation("platform.gym.update", {
      gymId: "subscription-gym",
      status: "trial",
      plan: "Starter",
      isPublic: false,
      reason: "Approved thirty-day pilot.",
    })) as Record<string, unknown>;
    expect(updated).toMatchObject({ subscriptionStatus: "trial", rivetPlan: "Starter", isPublic: false, trialEndsAt: expect.any(String), subscriptionStartedAt: expect.any(String), subscriptionStatusReason: "Approved thirty-day pilot." });

    const persisted = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
      return {
        organization,
        entitlement: organization ? await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).unique() : null,
        audit: (await ctx.db.query("platformAuditEvents").collect()).find((event) => event.entityPublicId === "subscription-gym"),
      };
    });
    expect(persisted.organization).toMatchObject({ status: "trial", subscriptionPlan: "Starter", subscriptionStatusReason: "Approved thirty-day pilot." });
    expect(persisted.organization?.trialEndsAt).toBe(Date.parse(String(updated.trialEndsAt)));
    expect(persisted.entitlement).toMatchObject({ subscriptionPlan: "Starter", source: "subscription_plan", entitledModules: ["foundation", "revenue"] });
    expect(persisted.audit).toMatchObject({ action: "gym.subscription.update", reason: "Approved thirty-day pilot.", before: { subscriptionStatus: "active", organization: { status: "trial", subscriptionPlan: "Growth" }, entitlements: { subscriptionPlan: "Growth" } }, after: { subscriptionStatus: "trial", organization: { status: "trial", subscriptionPlan: "Starter" }, entitlements: { subscriptionPlan: "Starter" } } });

    const cancelled = await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "cancelled", currentPeriodEndsAt: SELECTED_PERIOD_END, reason: "Customer requested cancellation." })) as Record<string, unknown>;
    expect(cancelled).toMatchObject({ subscriptionStatus: "cancelled", cancelledAt: expect.any(String) });
    await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "cancelled", currentPeriodEndsAt: SELECTED_PERIOD_END, reason: "Reconfirmed cancellation state." }));
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

  it("projects only a safe same-tenant gym logo to platform surfaces", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const storageId = await t.run(async (ctx) => ctx.storage.store(new NodeBlob(["logo"]) as unknown as Blob));
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
      const listing = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).unique();
      if (!organization || !listing) throw new Error("seed subscription records missing");
      await ctx.db.insert("mediaAssets", { organizationId: organization._id, publicId: "platform-logo", ownerType: "gym_logo", ownerPublicId: "org-sub", storageId, contentType: "image/png", sizeBytes: 4, visibility: "public", status: "active", createdAt: Date.now(), updatedAt: Date.now() });
      await ctx.db.patch(listing._id, { data: { ...(listing.data as Record<string, unknown>), logoAssetId: "platform-logo" }, updatedAt: Date.now() });
    });

    const platform = t.withIdentity({ subject: "clerk-platform" });
    const snapshot = await platform.query(api.domain.query, operation("platform.snapshot")) as { gyms: Array<Record<string, unknown>> };
    expect(snapshot.gyms[0]?.logoUrl).toEqual(expect.any(String));
    const detail = await platform.query(api.domain.query, operation("platform.gym.detail", { gymId: "subscription-gym" })) as { logoUrl?: { state: string; value?: string } };
    expect(detail.logoUrl).toMatchObject({ state: "available", value: expect.any(String) });

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
      const logo = organization ? await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", "platform-logo")).unique() : null;
      if (!logo) throw new Error("platform logo missing");
      await ctx.db.patch(logo._id, { visibility: "private", updatedAt: Date.now() });
    });
    const privateSnapshot = await platform.query(api.domain.query, operation("platform.snapshot")) as { gyms: Array<Record<string, unknown>> };
    expect(privateSnapshot.gyms[0]).not.toHaveProperty("logoUrl");
    await expect(platform.query(api.domain.query, operation("platform.gym.detail", { gymId: "subscription-gym" }))).resolves.toMatchObject({ logoUrl: { state: "not_configured" } });
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

    const updated = await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "suspended", currentPeriodEndsAt: SELECTED_PERIOD_END, reason: "Repair lifecycle while preserving the organization plan." })) as Record<string, unknown>;
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

  it("ignores stale directory lifecycle dates and derives a fresh tenant lifecycle", async () => {
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
    await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", plan: "Starter", currentPeriodEndsAt: SELECTED_PERIOD_END, reason: "Update plan without importing stale listing dates." }));
    const persisted = await t.run(async (ctx) => ({
      organization: await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique(),
      listing: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).unique(),
    }));
    expect(persisted.organization).toMatchObject({ subscriptionPlan: "Starter" });
    expect(persisted.organization?.trialEndsAt).toBeUndefined();
    expect(persisted.organization?.subscriptionStartedAt).toEqual(expect.any(Number));
    expect(persisted.listing?.data).toMatchObject({ rivetPlan: "Starter" });
    expect((persisted.listing?.data as Record<string, unknown> | undefined)?.trialEndsAt).toBeUndefined();
    expect((persisted.listing?.data as Record<string, unknown> | undefined)?.subscriptionStartedAt).toEqual(expect.any(String));
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
        currentPeriodEndsAt: SELECTED_PERIOD_END,
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

  it("archives a gym without deleting tenant records and keeps audit detail retrievable", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const owner = t.withIdentity({ subject: "clerk-owner" });
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
      if (!organization) throw new Error("seed organization missing");
      const now = Date.now();
      await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "platformInvoice", publicId: "archive-invoice", createdAt: now, updatedAt: now, data: { id: "archive-invoice", gymId: "subscription-gym", gym: "Subscription Gym", amount: "JD 149.000", amountMinor: 149_000, currency: "JOD", status: "paid", date: "2026-08-20" } });
      await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "supportCase", publicId: "archive-support", createdAt: now, updatedAt: now, data: { id: "archive-support", gymId: "subscription-gym", gym: "Subscription Gym", subject: "Historical support case", body: "Retain this record.", priority: "normal", status: "open", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() } });
      await ctx.db.insert("accountingSourcePostings", { organizationId: organization._id, publicId: "archive-posting", sourceType: "payment", sourcePublicId: "payment-archive", status: "posted", amountMinor: 149_000, currency: "JOD", occurredAt: now, createdAt: now, updatedAt: now });
    });

    await expectCode(owner.mutation(api.domain.mutate, operation("platform.gym.archive", { gymId: "subscription-gym", confirmation: "Subscription Gym", reason: "Customer requested account closure." })), "FORBIDDEN");
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.archive", { gymId: "subscription-gym", confirmation: "Wrong Name", reason: "Customer requested account closure." })), "VALIDATION_ERROR");
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.archive", { gymId: "subscription-gym", confirmation: "Subscription Gym", reason: "" })), "VALIDATION_ERROR");

    const platformMemberships = await t.run(async (ctx) => {
      const admin = await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", "platform")).unique();
      return admin ? await ctx.db.query("organizationMemberships").withIndex("by_user", (q) => q.eq("userId", admin._id)).collect() : [];
    });
    expect(platformMemberships).toHaveLength(0);

    const archived = await platform.mutation(api.domain.mutate, operation("platform.gym.archive", { gymId: "subscription-gym", confirmation: "Subscription Gym", reason: "Customer requested account closure." })) as Record<string, unknown>;
    expect(archived).toMatchObject({ id: "subscription-gym", subscriptionStatus: "suspended", isPublic: false, isArchived: true, archiveReason: "Customer requested account closure." });

    const persisted = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique();
      const listing = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization!._id).eq("entityType", "marketplaceGym").eq("publicId", "subscription-gym")).unique();
      const invoice = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization!._id).eq("entityType", "platformInvoice").eq("publicId", "archive-invoice")).unique();
      const support = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization!._id).eq("entityType", "supportCase").eq("publicId", "archive-support")).unique();
      const posting = await ctx.db.query("accountingSourcePostings").withIndex("by_organization_source", (q) => q.eq("organizationId", organization!._id).eq("sourceType", "payment").eq("sourcePublicId", "payment-archive")).unique();
      const audit = (await ctx.db.query("platformAuditEvents").withIndex("by_entity", (q) => q.eq("entityType", "platform_gym").eq("entityPublicId", "subscription-gym")).collect()).find((event) => event.action === "gym.archive");
      return { organization, listing, invoice, support, posting, audit };
    });
    expect(persisted.organization).toMatchObject({ status: "suspended", archivedAt: expect.any(Number), archiveReason: "Customer requested account closure.", subscriptionStatusReason: "Customer requested account closure." });
    expect(persisted.listing?.data).toMatchObject({ subscriptionStatus: "suspended", isPublic: false, isArchived: true });
    expect(persisted.invoice).toBeTruthy();
    expect(persisted.support).toBeTruthy();
    expect(persisted.posting).toBeTruthy();
    expect(persisted.audit).toMatchObject({ action: "gym.archive", reason: "Customer requested account closure.", before: { organization: { status: "active" } }, after: { organization: { status: "suspended", archiveReason: "Customer requested account closure." } } });

    const snapshot = await platform.query(api.domain.query, operation("platform.snapshot")) as { gyms: Array<Record<string, unknown>>; overview: { gymCounts: Record<string, number> } };
    expect(snapshot.gyms).toEqual([expect.objectContaining({ id: "subscription-gym", isArchived: true, subscriptionStatus: "suspended", isPublic: false })]);
    expect(snapshot.overview.gymCounts.suspended).toBe(0);
    expect(await t.query(api.domain.query, operation("public.marketplace"))).toEqual([]);
    await expect(platform.query(api.domain.query, operation("platform.gym.detail", { gymId: "subscription-gym" }))).resolves.toMatchObject({ controls: { isArchived: true, isPublic: false, status: "suspended" } });
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "active", reason: "Attempt to revive archived gym." })), "CONFLICT");
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
    const suspended = await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "suspended", currentPeriodEndsAt: SELECTED_PERIOD_END, isPublic: true, reason: "Billing review requires access suspension." })) as Record<string, unknown>;
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
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", billingInterval: "weekly", reason: "Reject an unsupported billing cadence." })), "VALIDATION_ERROR");
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

  it("persists catalog capability toggles and projects them to gyms already on the tier", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const owner = t.withIdentity({ subject: "clerk-owner" });
    const updated = await platform.mutation(api.domain.mutate, operation("platform.plan.update", {
      name: "Growth",
      entitledModules: ["foundation", "revenue"],
      reason: "Keep operations behind a reviewed add-on for the initial launch.",
    })) as Record<string, unknown>;
    expect(updated).toMatchObject({ name: "Growth", entitledModules: ["foundation", "revenue"] });
    const catalog = await platform.query(api.domain.query, operation("public.catalog")) as Array<Record<string, unknown>>;
    expect(catalog.find((plan) => plan.name === "Growth")).toMatchObject({ entitledModules: ["foundation", "revenue"] });
    await platform.mutation(api.domain.mutate, operation("platform.gym.update", {
      gymId: "subscription-gym",
      status: "active",
      plan: "Growth",
      currentPeriodEndsAt: SELECTED_PERIOD_END,
      reason: "Apply the reviewed Growth capability package to the assigned gym.",
    }));
    const access = await owner.query(api.domain.query, operation("workspace.access")) as { entitlements: { entitledModules: string[] }; modules: Array<{ key: string; entitled: boolean }> };
    expect(access.entitlements.entitledModules).toEqual(["foundation", "revenue"]);
    expect(access.modules.find((module) => module.key === "operations")).toMatchObject({ entitled: false });
    const audit = await t.run(async (ctx) => (await ctx.db.query("platformAuditEvents").collect()).find((event) => event.entityPublicId === "Growth"));
    expect(audit).toMatchObject({ action: "plan.catalog_update", after: { entitledModules: ["foundation", "revenue"] } });
  });

  it("allows non-default tier packaging while enforcing module dependencies", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const starter = await platform.mutation(api.domain.mutate, operation("platform.plan.update", {
      name: "Starter",
      entitledModules: ["foundation", "operations"],
      reason: "Package daily operations into the Starter pilot.",
    })) as Record<string, unknown>;
    expect(starter).toMatchObject({ name: "Starter", entitledModules: ["foundation", "operations"] });
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.plan.update", {
      name: "Starter",
      entitledModules: ["foundation", "reporting"],
      reason: "Reject reporting without its finance dependency.",
    })), "VALIDATION_ERROR");
  });
});
