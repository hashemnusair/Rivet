import type { PtEntitlement, PtPackage } from "./types";

export const PT_SESSION_DURATION_MINUTES = 60;
export const PT_DEFAULT_BOOKING_HORIZON_DAYS = 30;
export const PT_DEFAULT_CANCELLATION_CUTOFF_HOURS = 12;
export const PT_PACKAGE_SIZES = [12, 20, 30] as const;

export function ptAvailableCredits(value: Pick<PtEntitlement, "granted" | "reserved" | "consumed" | "revoked">): number {
  return Math.max(0, value.granted - value.reserved - value.consumed - value.revoked);
}

export function ptPackageLadderIsValid(packages: Array<Pick<PtPackage, "sessionCount" | "totalPrice" | "status">>): boolean {
  const active = packages.filter((item) => item.status === "active").sort((left, right) => left.sessionCount - right.sessionCount);
  for (let index = 1; index < active.length; index += 1) {
    const previous = active[index - 1]!;
    const current = active[index]!;
    // Cross multiplication keeps this deterministic in integer minor units.
    if (current.totalPrice.amount * previous.sessionCount > previous.totalPrice.amount * current.sessionCount) return false;
  }
  return true;
}

export function ptRefundMinor(input: {
  packageTotalMinor: number;
  totalSessions: number;
  alreadyRefundedSessions: number;
  sessionsToRefund: number;
}): number {
  const { packageTotalMinor, totalSessions, alreadyRefundedSessions, sessionsToRefund } = input;
  if (!Number.isSafeInteger(packageTotalMinor) || packageTotalMinor < 0) throw new Error("Package total must be a non-negative integer.");
  if (!Number.isSafeInteger(totalSessions) || totalSessions <= 0) throw new Error("Package sessions must be a positive integer.");
  if (!Number.isSafeInteger(alreadyRefundedSessions) || alreadyRefundedSessions < 0) throw new Error("Already-refunded sessions are invalid.");
  if (!Number.isSafeInteger(sessionsToRefund) || sessionsToRefund <= 0 || alreadyRefundedSessions + sessionsToRefund > totalSessions) throw new Error("Refund session count is invalid.");
  const before = Math.floor((packageTotalMinor * alreadyRefundedSessions) / totalSessions);
  const after = Math.floor((packageTotalMinor * (alreadyRefundedSessions + sessionsToRefund)) / totalSessions);
  return after - before;
}

export function ptCancellationResult(input: {
  startsAt: string | number;
  cancelledAt: string | number;
  cutoffHours: number;
  cancelledByGym: boolean;
}): { status: "cancelled" | "late_cancelled" | "gym_cancelled"; restoreCredit: boolean } {
  if (input.cancelledByGym) return { status: "gym_cancelled", restoreCredit: true };
  const startsAt = typeof input.startsAt === "number" ? input.startsAt : Date.parse(input.startsAt);
  const cancelledAt = typeof input.cancelledAt === "number" ? input.cancelledAt : Date.parse(input.cancelledAt);
  const timely = startsAt - cancelledAt >= input.cutoffHours * 3_600_000;
  return timely ? { status: "cancelled", restoreCredit: true } : { status: "late_cancelled", restoreCredit: false };
}

export function ptIntervalsOverlap(left: { startsAt: number; endsAt: number }, right: { startsAt: number; endsAt: number }): boolean {
  return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}

export function selectPtEntitlement<T extends Pick<PtEntitlement, "source" | "expiresAt" | "status" | "granted" | "reserved" | "consumed" | "revoked"> & Pick<Partial<PtEntitlement>, "startsAt">>(entitlements: T[], startsAt: number): T | undefined {
  return entitlements
    .filter((item) => item.status === "active" && (!item.startsAt || Date.parse(item.startsAt) <= startsAt) && Date.parse(item.expiresAt) >= startsAt && ptAvailableCredits(item) > 0)
    .sort((left, right) => {
      const expiry = Date.parse(left.expiresAt) - Date.parse(right.expiresAt);
      if (expiry !== 0) return expiry;
      if (left.source === right.source) return 0;
      return left.source === "included" ? -1 : 1;
    })[0];
}
