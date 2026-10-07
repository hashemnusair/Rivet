import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { COMMERCIAL_TERMS_VERSION, PLAN_CATALOGUE } from "./planCatalogue";

const LEGACY = {
  Starter: { priceMinor: 79_000, branches: 1, staff: 8, members: 500 },
  Growth: { priceMinor: 149_000, branches: 3, staff: 25, members: 2_500 },
  Pro: { priceMinor: 249_000, branches: 8, staff: 80, members: 10_000 },
};

/** Preview by default. Only replaces untouched old defaults, preserving custom packages. */
export const migrateDefaults = internalMutation({
  args: { apply: v.optional(v.boolean()), reason: v.string() },
  handler: async (ctx, args) => {
    if (args.reason.trim().length < 10) throw new Error("Provide a release reason.");
    const rows = await ctx.db.query("domainRecords").withIndex("by_entity_type", q => q.eq("entityType", "platformPlan")).collect();
    const result: Array<{ plan: string; outcome: "default" | "current" | "custom_preserved" | "would_update" | "updated" }> = [];
    for (const plan of PLAN_CATALOGUE.filter(plan => plan.name !== "Enterprise")) {
      const row = rows.find(row => (row.data as Record<string, unknown>).name === plan.name);
      if (!row) { result.push({ plan: plan.name, outcome: "default" }); continue; }
      const value = row.data as Record<string, unknown>;
      const legacy = LEGACY[plan.name as keyof typeof LEGACY];
      const keys = ["priceMinor", "branches", "staff", "members", "onboardingFeeMinor", "operationalEmails"] as const;
      if (keys.every(key => value[key] === plan[key])) { result.push({ plan: plan.name, outcome: "current" }); continue; }
      if (!Object.entries(legacy).every(([key, amount]) => value[key] === amount) || value.onboardingFeeMinor !== undefined || value.operationalEmails !== undefined) {
        result.push({ plan: plan.name, outcome: "custom_preserved" }); continue;
      }
      if (!args.apply) { result.push({ plan: plan.name, outcome: "would_update" }); continue; }
      const updated = { ...value, ...plan, commercialTermsVersion: COMMERCIAL_TERMS_VERSION };
      const now = Date.now();
      await ctx.db.patch(row._id, { data: updated, updatedAt: now });
      await ctx.db.insert("platformAuditEvents", {
        publicId: crypto.randomUUID(), actorPublicId: "system:launch-catalogue", actorName: "RIVET release",
        action: "plan.catalog_update", entityType: "platform_plan", entityPublicId: row.publicId, entityLabel: plan.name,
        summary: "Updated unchanged legacy defaults to the commercial launch catalogue",
        reason: args.reason.trim(), before: value, after: updated,
        correlationId: `launch-catalogue:${COMMERCIAL_TERMS_VERSION}:${plan.name}`, occurredAt: now,
      });
      result.push({ plan: plan.name, outcome: "updated" });
    }
    return { applied: Boolean(args.apply), version: COMMERCIAL_TERMS_VERSION, plans: result };
  },
});
