export function varianceApprovalStatusForAmount(variance: number): "none" | "pending" {
  return variance === 0 ? "none" : "pending";
}

export function varianceAuditApprovalStatusForAmount(variance: number): "pending" | undefined {
  return variance === 0 ? undefined : "pending";
}
