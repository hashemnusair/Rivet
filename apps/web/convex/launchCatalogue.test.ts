import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");

describe("launch catalogue migration", () => {
  it("previews without writes, updates only unchanged defaults, preserves custom rows and replays safely", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      const org = await ctx.db.insert("organizations", { name: "Platform", slug: "platform", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: 1, updatedAt: 1 });
      for (const plan of [{ name: "Starter", priceMinor: 79_000, branches: 1, staff: 8, members: 500 }, { name: "Growth", priceMinor: 120_000, branches: 3, staff: 25, members: 2500 }]) {
        await ctx.db.insert("domainRecords", { organizationId: org, entityType: "platformPlan", publicId: plan.name, createdAt: 1, updatedAt: 1, data: plan });
      }
    });
    const args = { reason: "Apply approved launch packages" };
    const preview = await t.mutation(internal.launchCatalogue.migrateDefaults, args);
    expect(preview.plans).toEqual([{ plan: "Starter", outcome: "would_update" }, { plan: "Growth", outcome: "custom_preserved" }, { plan: "Pro", outcome: "default" }]);
    expect(await t.run(ctx => ctx.db.query("platformAuditEvents").collect())).toHaveLength(0);
    expect((await t.mutation(internal.launchCatalogue.migrateDefaults, { ...args, apply: true })).plans[0]?.outcome).toBe("updated");
    expect((await t.mutation(internal.launchCatalogue.migrateDefaults, { ...args, apply: true })).plans[0]?.outcome).toBe("current");
    expect(await t.run(ctx => ctx.db.query("platformAuditEvents").collect())).toHaveLength(1);
    const rows = await t.run(ctx => ctx.db.query("domainRecords").collect());
    expect(rows.find(row => row.publicId === "Growth")?.data.priceMinor).toBe(120_000);
  });
});
