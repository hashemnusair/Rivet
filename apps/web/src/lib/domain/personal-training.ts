import type { PtEntitlement, PtPackage } from "./types";

export type PtBookingOutcomeAction = "completed" | "no_show" | "cancelled";

export const PT_SESSION_DURATION_MINUTES = 60;
export const PT_DEFAULT_BOOKING_HORIZON_DAYS = 30;
export const PT_DEFAULT_CANCELLATION_CUTOFF_HOURS = 12;

/**
 * The gym's reference PT pricing ladder.  The total price remains editable,
 * but these anchors make the intended volume discount visible and give new
 * packages a sensible starting price.
 */
export const PT_PACKAGE_PRICE_GUIDE = [
  { sessionCount: 12, totalPriceMinor: 240_000 },
  { sessionCount: 20, totalPriceMinor: 300_000 },
  { sessionCount: 30, totalPriceMinor: 400_000 },
] as const;

/**
 * Suggest a total package price using the reference anchors.  Between
 * anchors, the total is linearly interpolated; beyond the final anchor, the
 * final package's marginal price is extended.  This keeps the average rate
 * from increasing as session count grows while supporting arbitrary counts.
 */
export function ptPackageSuggestedPriceMinor(sessionCount: number): number | undefined {
  if (!Number.isSafeInteger(sessionCount) || sessionCount < 1) return undefined;

  const first = PT_PACKAGE_PRICE_GUIDE[0]!;
  if (sessionCount <= first.sessionCount) return sessionCount * (first.totalPriceMinor / first.sessionCount);

  for (let index = 1; index < PT_PACKAGE_PRICE_GUIDE.length; index += 1) {
    const lower = PT_PACKAGE_PRICE_GUIDE[index - 1]!;
    const upper = PT_PACKAGE_PRICE_GUIDE[index]!;
    if (sessionCount <= upper.sessionCount) {
      const span = upper.sessionCount - lower.sessionCount;
      const progress = sessionCount - lower.sessionCount;
      return Math.round(lower.totalPriceMinor + (progress * (upper.totalPriceMinor - lower.totalPriceMinor)) / span);
    }
  }

  const lower = PT_PACKAGE_PRICE_GUIDE[PT_PACKAGE_PRICE_GUIDE.length - 2]!;
  const upper = PT_PACKAGE_PRICE_GUIDE[PT_PACKAGE_PRICE_GUIDE.length - 1]!;
  const marginalPrice = (upper.totalPriceMinor - lower.totalPriceMinor) / (upper.sessionCount - lower.sessionCount);
  return Math.round(upper.totalPriceMinor + (sessionCount - upper.sessionCount) * marginalPrice);
}

/** Return the effective per-session rate in the currency's minor units. */
export function ptPackageUnitPriceMinor(totalPriceMinor: number, sessionCount: number): number | undefined {
  if (!Number.isSafeInteger(totalPriceMinor) || totalPriceMinor <= 0 || !Number.isSafeInteger(sessionCount) || sessionCount < 1) return undefined;
  return Math.round(totalPriceMinor / sessionCount);
}

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

/**
 * Copy used before an irreversible PT outcome is committed.  It deliberately
 * describes the ledger consequence, rather than implying a payment refund.
 */
export function ptBookingCreditConsequence(input: {
  action: PtBookingOutcomeAction;
  startsAt: string | number;
  cancelledAt?: string | number;
  cutoffHours?: number;
  cancelledByGym?: boolean;
}): { effect: "consume" | "return"; text: string } {
  if (input.action === "completed") return { effect: "consume", text: "One reserved PT credit will be consumed." };
  if (input.action === "no_show") return { effect: "consume", text: "One reserved PT credit will be consumed for this no-show." };
  const result = ptCancellationResult({
    startsAt: input.startsAt,
    cancelledAt: input.cancelledAt ?? Date.now(),
    cutoffHours: input.cutoffHours ?? PT_DEFAULT_CANCELLATION_CUTOFF_HOURS,
    cancelledByGym: Boolean(input.cancelledByGym),
  });
  return result.restoreCredit
    ? { effect: "return", text: "The reserved PT credit will be returned to the member." }
    : { effect: "consume", text: "This is after the cancellation cutoff, so one reserved PT credit will be consumed." };
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
