import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { WorkspaceModulePlan } from "./workspaceModules";
import { resolvePlanLimits, type PlanLimits } from "./planLimits";

type ReadContext = QueryCtx | MutationCtx;
type Data = Record<string, unknown>;

function data(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
}

/**
 * Read the operator-owned commercial capability selection, when one has been
 * persisted. Organization entitlements are a materialized projection and
 * must not be used as the source of truth when that projection is stale.
 */
export async function platformPlanEntitledModules(ctx: ReadContext, plan: WorkspaceModulePlan | undefined): Promise<readonly unknown[] | undefined> {
  if (!plan) return undefined;
  const rows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformPlan")).collect();
  const row = rows.find((candidate) => {
    const value = data(candidate.data);
    return value.name === plan || candidate.publicId === plan;
  });
  const selection = data(row?.data).entitledModules;
  return Array.isArray(selection) ? selection : undefined;
}

/**
 * The plan's branch, staff and member limits, with any numbers a platform
 * operator saved in the catalogue taking precedence over the published ones.
 */
export async function platformPlanLimits(ctx: ReadContext, plan: WorkspaceModulePlan | undefined): Promise<PlanLimits | undefined> {
  if (!plan) return undefined;
  const rows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformPlan")).collect();
  const row = rows.find((candidate) => {
    const value = data(candidate.data);
    return value.name === plan || candidate.publicId === plan;
  });
  return resolvePlanLimits(plan, row ? data(row.data) : undefined);
}
