import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const modules = import.meta.glob("./**/*.ts");

describe("Forge demo seed lifecycle", () => {
  it("seeds an active Pro tenant with a future monthly period and projects it", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedDemoTenant, {});

    const platformSubject = "seed-platform-admin";
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        publicId: platformSubject,
        authSubject: platformSubject,
        email: "seed-platform@example.test",
        fullName: "Seed Platform Admin",
        platformAdmin: true,
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const persisted = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", "forge-fitness")).unique();
      const listing = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).filter((q) => q.eq(q.field("publicId"), "forge-fitness")).unique();
      return { organization, listing };
    });

    expect(persisted.organization).toMatchObject({ status: "active", subscriptionPlan: "Pro", billingInterval: "monthly", subscriptionStartedAt: expect.any(Number), currentPeriodEndsAt: expect.any(Number) });
    expect(persisted.organization!.currentPeriodEndsAt!).toBeGreaterThan(Date.now());
    expect(persisted.listing?.data).toMatchObject({ id: "forge-fitness", rivetPlan: "Pro", subscriptionStatus: "active" });

    const snapshot = await t.withIdentity({ subject: platformSubject }).query(api.domain.query, {
      operation: "platform.snapshot",
      input: {},
      correlationId: "seed-lifecycle-snapshot",
    }) as { gyms: Array<Record<string, unknown>> };
    const forge = snapshot.gyms.find((gym) => gym.id === "forge-fitness");
    expect(forge).toMatchObject({ isProvisioned: true, subscriptionStatus: "active", rivetPlan: "Pro", billingInterval: "monthly", subscriptionStartedAt: expect.any(String), currentPeriodEndsAt: expect.any(String) });
    expect(Date.parse(String(forge?.currentPeriodEndsAt))).toBeGreaterThan(Date.now());
  });

  it("does not reset an existing tenant lifecycle when the seed is rerun", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.seed.seedDemoTenant, {});
    const preserved = {
      subscriptionPlan: "Enterprise" as const,
      billingInterval: "annual" as const,
      subscriptionStartedAt: Date.parse("2026-01-15T07:00:00.000Z"),
      currentPeriodEndsAt: Date.parse("2027-01-15T07:00:00.000Z"),
    };
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", "forge-fitness")).unique();
      if (!organization) throw new Error("Forge organization was not seeded");
      await ctx.db.patch(organization._id, preserved);
    });

    await t.mutation(internal.seed.seedDemoTenant, {});
    const organization = await t.run(async (ctx) => await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", "forge-fitness")).unique());
    expect(organization).toMatchObject(preserved);
  });
});
