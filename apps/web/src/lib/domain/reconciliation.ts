import type { CashShift } from "./types";

export type CashShiftHistoryStatus = "open" | "balanced" | "variance_pending" | "variance_approved" | "variance_rejected" | "closed";

export function cashShiftHasVariance(shift: Pick<CashShift, "variance">): boolean {
  return (shift.variance?.amount ?? 0) !== 0;
}

/** Zero is a reconciliation result, never an approval state. */
export function cashShiftHistoryStatus(shift: Pick<CashShift, "status" | "variance" | "varianceApprovalStatus">): CashShiftHistoryStatus {
  if (shift.status === "open") return "open";
  if (!cashShiftHasVariance(shift)) return "balanced";
  if (shift.varianceApprovalStatus === "pending") return "variance_pending";
  if (shift.varianceApprovalStatus === "approved") return "variance_approved";
  if (shift.varianceApprovalStatus === "rejected") return "variance_rejected";
  return "closed";
}

export function canReviewCashVariance(shift: Pick<CashShift, "variance" | "varianceApprovalStatus">): boolean {
  return cashShiftHasVariance(shift) && shift.varianceApprovalStatus === "pending";
}
