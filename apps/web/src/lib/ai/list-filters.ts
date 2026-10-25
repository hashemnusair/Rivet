import type { MemberFilterInterpretation } from "./contracts";

/**
 * Turns an interpreted request into the members list's own filters. Only
 * filters the list really has are applied, so the result is always visible
 * and editable in the ordinary controls; everything else is listed as not
 * applied with the reason, never silently dropped or approximated.
 */

export type MemberListMembershipFilter = "active" | "expiring" | "expired" | "frozen" | "outstanding";

/** The list's "Expiring" filter covers this many days; it is not configurable. */
export const LIST_EXPIRING_WINDOW_DAYS = 14;

export type MemberFilterNote =
  | { kind: "expiringWindow"; days: number }
  | { kind: "membershipNone" }
  | { kind: "owesConflict" }
  | { kind: "notVisited"; days: number }
  | { kind: "branchShown"; branchId: string }
  | { kind: "branchSwitch"; branchId: string }
  | { kind: "unrecognised"; text: string };

export interface MemberFilterPlan {
  apply: { membership?: MemberListMembershipFilter };
  /** Facts about what was applied (still applied). */
  notes: MemberFilterNote[];
  /** Parts of the request this list cannot show. */
  notApplied: MemberFilterNote[];
}

export function memberFilterPlan(interpretation: MemberFilterInterpretation, context: { activeBranchId?: string }): MemberFilterPlan {
  const plan: MemberFilterPlan = { apply: {}, notes: [], notApplied: [] };
  const membership = interpretation.membership;
  if (membership === "active" || membership === "expiring" || membership === "expired" || membership === "frozen") {
    plan.apply.membership = membership;
    if (membership === "expiring" && interpretation.expiringWithinDays && interpretation.expiringWithinDays !== LIST_EXPIRING_WINDOW_DAYS) plan.notes.push({ kind: "expiringWindow", days: interpretation.expiringWithinDays });
  } else if (membership === "none") {
    plan.notApplied.push({ kind: "membershipNone" });
  }
  if (interpretation.owes) {
    if (plan.apply.membership) plan.notApplied.push({ kind: "owesConflict" });
    else plan.apply.membership = "outstanding";
  }
  if (interpretation.notVisitedForDays) plan.notApplied.push({ kind: "notVisited", days: interpretation.notVisitedForDays });
  if (interpretation.branchId) {
    if (interpretation.branchId === context.activeBranchId) plan.notes.push({ kind: "branchShown", branchId: interpretation.branchId });
    else plan.notApplied.push({ kind: "branchSwitch", branchId: interpretation.branchId });
  }
  for (const text of interpretation.unrecognised) plan.notApplied.push({ kind: "unrecognised", text });
  return plan;
}
