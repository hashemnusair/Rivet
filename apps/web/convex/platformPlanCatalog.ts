import { addOnModules, type SubscriptionAddOns } from "./subscriptionAddOns";
import { entitledModulesForPlanSelection } from "./workspaceModules";
import { isCurrentPlan, COMMERCIAL_TERMS_VERSION } from "./planCatalogue";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { WorkspaceModulePlan } from "./workspaceModules";

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
export async function platformPlanEntitledModules(ctx: ReadContext, plan: WorkspaceModulePlan | undefined, addOns?: SubscriptionAddOns): Promise<readonly unknown[] | undefined> {
  if (!plan) return undefined;
  const rows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformPlan")).collect();
  const row = rows.find((candidate) => {
    const value = data(candidate.data);
    return value.name === plan || candidate.publicId === plan;
  });
  const value = data(row?.data);
  const selection = isCurrentPlan(plan) && value.commercialTermsVersion !== COMMERCIAL_TERMS_VERSION ? undefined : value.entitledModules;
  const purchased = addOnModules(plan, addOns);
  if (purchased.length) return [...new Set([...entitledModulesForPlanSelection(plan, Array.isArray(selection) ? selection : undefined), ...purchased])];
  return Array.isArray(selection) ? selection : undefined;
}
