import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-workspace-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seeded(plan?: "Starter" | "Growth" | "Pro" | "Enterprise") {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "workspace-org", name: "Workspace Gym", slug: "workspace-gym", status: "active", ...(plan ? { subscriptionPlan: plan } : {}), timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "workspace-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "workspace-owner", authSubject: "clerk-workspace-owner", email: "owner@workspace.example", fullName: "Workspace Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const manager = await ctx.db.insert("users", { publicId: "workspace-manager", authSubject: "clerk-workspace-manager", email: "manager@workspace.example", fullName: "Workspace Manager", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: manager, role: "manager", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
  });
  return { t, owner: t.withIdentity({ subject: "clerk-workspace-owner" }), manager: t.withIdentity({ subject: "clerk-workspace-manager" }) };
}

describe("server-owned workspace entitlements", () => {
  it("assigns the statements route to reporting and maintenance controls to finance", async () => {
    const { owner } = await seeded("Pro");
    const access = await owner.query(api.domain.query, operation("workspace.access")) as { catalog: Array<{ key: string; routePrefixes: string[] }> };
    expect(access.catalog.find((module) => module.key === "finance")?.routePrefixes).toEqual(["/finance/controls"]);
    expect(access.catalog.find((module) => module.key === "reporting")?.routePrefixes).toEqual(["/finance", "/reports/statements"]);
  });

  it("derives all four entitlements from the organization plan", async () => {
    for (const [plan, expected] of [["Starter", ["foundation", "revenue"]], ["Growth", ["foundation", "revenue", "operations"]], ["Pro", ["foundation", "revenue", "operations", "finance", "reporting"]], ["Enterprise", ["foundation", "revenue", "operations", "finance", "reporting"]]] as const) {
      const { owner } = await seeded(plan);
      const access = await owner.query(api.domain.query, operation("workspace.access")) as { entitlements: { subscriptionPlan: string; entitledModules: string[] } };
      expect(access.entitlements).toMatchObject({ subscriptionPlan: plan, entitledModules: expected, source: "subscription_plan" });
    }
  });

  it("keeps a legacy tenant operational without inventing a client entitlement grant", async () => {
    const { owner } = await seeded();
    const access = await owner.query(api.domain.query, operation("workspace.access")) as { entitlements: { subscriptionPlan?: string; source: string; entitledModules: string[] } };
    expect(access.entitlements).toMatchObject({ source: "legacy_default", entitledModules: ["foundation", "revenue", "operations", "finance", "reporting"] });
    expect(access.entitlements.subscriptionPlan).toBeUndefined();
  });

  it("uses an explicit platform catalog selection instead of a stale materialized entitlement row", async () => {
    const { owner, t } = await seeded("Pro");
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "workspace-org")).unique();
      const now = Date.now();
      await ctx.db.insert("domainRecords", {
        organizationId: organization!._id,
        entityType: "platformPlan",
        publicId: "Pro",
        createdAt: now,
        updatedAt: now,
        data: { id: "Pro", name: "Pro", entitledModules: ["foundation", "revenue", "operations"] },
      });
      await ctx.db.insert("organizationEntitlements", {
        organizationId: organization!._id,
        catalogVersion: 1,
        subscriptionPlan: "Pro",
        entitledModules: ["foundation", "revenue"],
        source: "subscription_plan",
        createdAt: now,
        updatedAt: now,
      });
    });
    const access = await owner.query(api.domain.query, operation("workspace.access")) as { entitlements: { entitledModules: string[] } };
    expect(access.entitlements.entitledModules).toEqual(["foundation", "revenue", "operations"]);
  });

  it("allows only the owner to change preferences and appends an audit event", async () => {
    const { owner, manager, t } = await seeded("Pro");
    await expectCode(manager.mutation(api.domain.mutate, operation("workspace.preferences.update", { enabledModules: ["foundation", "revenue", "operations"] })), "FORBIDDEN");
    await owner.mutation(api.domain.mutate, operation("workspace.preferences.update", { enabledModules: ["foundation", "revenue", "operations"] }));
    const access = await owner.query(api.domain.query, operation("workspace.access")) as { preferences: { enabledModules: string[] } };
    expect(access.preferences.enabledModules).toEqual(["foundation", "revenue", "operations"]);
    const audits = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((event) => event.action === "workspace.module_preferences.update"));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ entityType: "workspace_module_preferences", entityPublicId: "workspace-org", category: "settings" });
  });

  it("rejects unknown modules and invalid dependency sets", async () => {
    const { owner } = await seeded("Pro");
    await expectCode(owner.mutation(api.domain.mutate, operation("workspace.preferences.update", { enabledModules: ["foundation", "unknown"] })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("workspace.preferences.update", { enabledModules: ["foundation", "reporting"] })), "VALIDATION_ERROR");
  });

  it("preserves history while locking a module after a server-side downgrade", async () => {
    const { owner, t } = await seeded("Pro");
    await owner.mutation(api.domain.mutate, operation("workspace.preferences.update", { enabledModules: ["foundation", "revenue", "operations", "finance", "reporting"] }));
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "workspace-org")).unique();
      await ctx.db.patch(organization!._id, { subscriptionPlan: "Starter", updatedAt: Date.now() });
    });
    const access = await owner.query(api.domain.query, operation("workspace.access")) as { entitlements: { entitledModules: string[] }; preferences: { enabledModules: string[] } };
    expect(access.entitlements.entitledModules).toEqual(["foundation", "revenue"]);
    expect(access.preferences.enabledModules).toEqual(["foundation", "revenue"]);
    await expectCode(owner.query(api.domain.query, operation("workspace.module", { moduleKey: "finance" })), "FEATURE_NOT_AVAILABLE");
    const stored = await t.run(async (ctx) => await ctx.db.query("workspaceModulePreferences").withIndex("by_organization").unique());
    expect(stored?.enabledModules).toEqual(["foundation", "revenue", "operations", "finance", "reporting"]);
  });
});
