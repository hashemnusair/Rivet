export type ServerMembershipStatus = "active" | "expiring" | "frozen" | "expired" | "cancelled" | "depleted" | "scheduled";

function dayNumber(value: string): number {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(year || 1970, (month || 1) - 1, day || 1) / 86_400_000);
}

function diffDays(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function deriveServerMembershipStatus(input: { cancelledAt?: unknown; freezeStatus?: unknown; startDate: string; endDate: string; totalVisits?: unknown; remainingVisits?: unknown }, today: string): ServerMembershipStatus {
  if (typeof input.cancelledAt === "string" && input.cancelledAt) return "cancelled";
  if (input.freezeStatus === "active") return "frozen";
  if (diffDays(input.startDate, today) < 0) return "scheduled";
  if (diffDays(today, input.endDate) < 0) return "expired";
  if (input.totalVisits != null && typeof input.remainingVisits === "number" && input.remainingVisits <= 0) return "depleted";
  if (diffDays(today, input.endDate) <= 14) return "expiring";
  return "active";
}

export function isValidMinorUnit(amount: unknown, allowNegative = false): amount is number {
  return typeof amount === "number" && Number.isSafeInteger(amount) && (allowNegative || amount >= 0);
}

export function paymentAllocation(amount: number, outstanding: number): { ok: true; remaining: number } | { ok: false; code: "VALIDATION_ERROR" | "AMOUNT_EXCEEDS_OUTSTANDING" } {
  if (!isValidMinorUnit(amount) || amount <= 0 || !isValidMinorUnit(outstanding)) return { ok: false, code: "VALIDATION_ERROR" };
  if (amount > outstanding) return { ok: false, code: "AMOUNT_EXCEEDS_OUTSTANDING" };
  return { ok: true, remaining: outstanding - amount };
}

export function checkInDecisionOrder(input: {
  duplicate: boolean;
  memberActive: boolean;
  hasMembership: boolean;
  membershipStatus?: ServerMembershipStatus;
  visitsRemaining?: number;
  branchAllowed: boolean;
  expiresSoon: boolean;
  outstanding: boolean;
}): "duplicate" | "inactive" | "no_membership" | "membership_blocked" | "visits_depleted" | "wrong_branch" | "warning" | "allowed" {
  if (input.duplicate) return "duplicate";
  if (!input.memberActive) return "inactive";
  if (!input.hasMembership) return "no_membership";
  if (input.membershipStatus === "expired" || input.membershipStatus === "scheduled" || input.membershipStatus === "cancelled" || input.membershipStatus === "frozen") return "membership_blocked";
  if (input.visitsRemaining != null && input.visitsRemaining <= 0) return "visits_depleted";
  if (!input.branchAllowed) return "wrong_branch";
  if (input.expiresSoon || input.outstanding) return "warning";
  return "allowed";
}
