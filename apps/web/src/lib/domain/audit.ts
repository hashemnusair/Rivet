import type { AuditEvent } from "./types";

/**
 * Returns the approval state that should be shown to an operator.
 *
 * Older zero-variance shift.close events were written with an `approved`
 * value even though no discrepancy existed and no manager review occurred.
 * Audit records are append-only, so the compatibility fix belongs at the
 * presentation boundary rather than in a data rewrite.
 */
export function auditApprovalStatusForDisplay(
  event: Pick<AuditEvent, "action" | "approvalStatus" | "after">,
): AuditEvent["approvalStatus"] {
  if (event.action === "shift.close" && event.approvalStatus === "approved" && event.after?.variance === 0) {
    return undefined;
  }

  return event.approvalStatus;
}

/** Only this exact system-owned posting reason is projected; audit bytes stay original. */
export function auditReasonMessageKey(event: Pick<AuditEvent, "action" | "reason">): "accountingMessages.sourceQueueReason" | undefined {
  return event.action === "accounting.source.post" && event.reason === "Posted from the management-ledger source queue."
    ? "accountingMessages.sourceQueueReason"
    : undefined;
}
