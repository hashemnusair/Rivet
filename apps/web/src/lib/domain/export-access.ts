const DAY_MS = 86_400_000;
/** The existing 30-day termination window is [cancelledAt, cancelledAt + 30d). */
export function terminationExportDeadline(organization: { status: string; cancelledAt?: number; archivedAt?: unknown }, now = Date.now()): number | undefined {
  const cancelledAt = organization.cancelledAt;
  if (organization.status !== "cancelled" || organization.archivedAt !== undefined || typeof cancelledAt !== "number" || !Number.isFinite(cancelledAt) || cancelledAt <= 0 || cancelledAt > now) return undefined;
  const deadline = cancelledAt + 30 * DAY_MS;
  return Number.isFinite(deadline) && now < deadline ? deadline : undefined;
}
