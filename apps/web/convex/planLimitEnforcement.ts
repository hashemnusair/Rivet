import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { platformPlanLimits } from "./platformPlanCatalog";
import { planLimitViolation, type PlanLimitKind } from "./planLimits";
import { domainError, type ActorContext } from "./security";

type ReadContext = QueryCtx | MutationCtx;

/** Branches that count against the plan: every branch not switched off. */
export async function activeBranchCount(ctx: ReadContext, organizationId: Id<"organizations">): Promise<number> {
  const branches = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
  return branches.filter((branch) => branch.active).length;
}

/**
 * Staff accounts that count against the plan. A pending invitation holds a
 * seat, so a burst of invitations cannot overshoot the limit before anyone
 * accepts; revoking one frees it.
 */
export async function staffSeatCount(ctx: ReadContext, organizationId: Id<"organizations">): Promise<number> {
  const memberships = await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
  return memberships.filter((membership) => membership.active && membership.invitationStatus !== "revoked").length;
}

/**
 * Refuse to add `adding` more of a kind when the gym's plan does not have
 * room. Raised before anything is written, so a refused request changes
 * nothing.
 */
export async function assertPlanCapacity(ctx: ReadContext, actor: ActorContext, kind: PlanLimitKind, used: number, adding = 1): Promise<void> {
  const limits = await platformPlanLimits(ctx, actor.organization.subscriptionPlan);
  const violation = planLimitViolation(limits, kind, used, adding);
  if (!violation) return;
  domainError(violation.code, violation.message, {
    correlationId: actor.correlationId,
    details: violation.details,
    message: { key: violation.messageKey, params: violation.params },
  });
}
