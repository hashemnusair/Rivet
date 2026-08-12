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
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "marketplaceGym", publicId: "subscription-gym", createdAt: now, updatedAt: now, data: { id: "subscription-gym", name: "Subscription Gym", targetOrganizationId: "org-sub", subscriptionStatus: "active", rivetPlan: "Growth", isPublic: true, branches: [] } });
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
    const updated = await platform.mutation(api.domain.mutate, operation("platform.gym.update", {
      gymId: "subscription-gym",
      status: "trial",
      plan: "Starter",
      isPublic: false,
      trialEndsAt: "2026-09-30",
      subscriptionStartedAt: "2026-09-01",
      currentPeriodEndsAt: "2026-09-30",
      reason: "Approved thirty-day pilot.",
    })) as Record<string, unknown>;
    expect(updated).toMatchObject({ subscriptionStatus: "trial", rivetPlan: "Starter", isPublic: false, trialEndsAt: "2026-09-30T00:00:00.000Z", subscriptionStatusReason: "Approved thirty-day pilot." });

    const persisted = await t.run(async (ctx) => ({
      organization: await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-sub")).unique(),
      audit: (await ctx.db.query("platformAuditEvents").collect()).find((event) => event.entityPublicId === "subscription-gym"),
    }));
    expect(persisted.organization).toMatchObject({ status: "trial", subscriptionPlan: "Starter", subscriptionStatusReason: "Approved thirty-day pilot." });
    expect(persisted.organization?.trialEndsAt).toBe(Date.parse("2026-09-30"));
    expect(persisted.audit).toMatchObject({ action: "gym.subscription.update", reason: "Approved thirty-day pilot.", before: { subscriptionStatus: "active" }, after: { subscriptionStatus: "trial" } });

    const cancelled = await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "subscription-gym", status: "cancelled", reason: "Customer requested cancellation." })) as Record<string, unknown>;
    expect(cancelled).toMatchObject({ subscriptionStatus: "cancelled", cancelledAt: expect.any(String) });
    const emails = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "operationalEmailDelivery")).collect()).map((record) => record.data));
    expect(emails).toEqual([expect.objectContaining({ kind: "platform_subscription_cancelled", status: "suppressed", suppressionReason: expect.stringContaining("disabled or the provider is not configured") })]);
  });
});
