/**
 * What a plan lets a gym hold: branches, staff accounts and members. The
 * pricing sheet (docs/19) and the platform catalogue set the numbers; this
 * module decides whether one more fits. A limit only ever stops something new
 * from being added. Nothing a gym already holds is removed or switched off
 * when a plan shrinks, because RIVET offers the next plan instead (Terms).
 *
 * Free of Convex imports so the mock adapter applies the same rule.
 */
import type { ErrorMessageKey } from "../src/lib/i18n/error-messages";
import { findPlan, type PlanDefinition } from "./planCatalogue";

export type PlanLimitKind = "branches" | "staff" | "members";

export interface PlanLimits {
  plan: PlanDefinition["name"];
  branches: number;
  staff: number;
  members: number;
}

export const PLAN_LIMIT_ERROR_CODE = "PLAN_LIMIT_REACHED";

const MESSAGE_KEYS: Readonly<Record<PlanLimitKind, ErrorMessageKey>> = {
  branches: "apiErrors.planLimitBranches",
  staff: "apiErrors.planLimitStaff",
  members: "apiErrors.planLimitMembers",
};

const NOUNS: Readonly<Record<PlanLimitKind, string>> = {
  branches: "branches",
  staff: "staff accounts",
  members: "members",
};

function positiveLimit(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}

/**
 * The limits for a plan. A platform operator may have edited the numbers in
 * the platform catalogue; those win over the published defaults. A gym with
 * no plan predates billing and is not limited, the same rule that keeps its
 * modules.
 */
export function resolvePlanLimits(plan: string | undefined, catalogRow?: Record<string, unknown>): PlanLimits | undefined {
  const published = findPlan(plan);
  if (!published) return undefined;
  return {
    plan: published.name,
    branches: positiveLimit(catalogRow?.branches, published.branches),
    staff: positiveLimit(catalogRow?.staff, published.staff),
    members: positiveLimit(catalogRow?.members, published.members),
  };
}

export interface PlanLimitViolation {
  code: typeof PLAN_LIMIT_ERROR_CODE;
  message: string;
  messageKey: ErrorMessageKey;
  params: { plan: string; limit: number };
  details: { limit: PlanLimitKind; plan: string; allowed: number; used: number; adding: number };
}

/**
 * Whether adding `adding` more of a kind would pass the plan's limit. Returns
 * the error to raise, or undefined when it fits. A gym already over its limit
 * (after a downgrade) keeps everything; it just cannot add more.
 */
export function planLimitViolation(limits: PlanLimits | undefined, kind: PlanLimitKind, used: number, adding = 1): PlanLimitViolation | undefined {
  if (!limits || adding <= 0) return undefined;
  const allowed = limits[kind];
  if (used + adding <= allowed) return undefined;
  return {
    code: PLAN_LIMIT_ERROR_CODE,
    message: `This gym has reached its ${limits.plan} plan limit of ${allowed} ${NOUNS[kind]}. The gym owner can upgrade the plan with RIVET.`,
    messageKey: MESSAGE_KEYS[kind],
    params: { plan: limits.plan, limit: allowed },
    details: { limit: kind, plan: limits.plan, allowed, used, adding },
  };
}
