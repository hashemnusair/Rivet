import type {
  CheckInDecision,
  CheckInReasonCode,
  Membership,
  MembershipEffectiveStatus,
  Money,
} from "./types";
import { diffDays } from "@/lib/utils/dates";

export const EXPIRING_WINDOW_DAYS = 14;

/**
 * Derive a membership's effective status from explicit state + dates.
 * One authoritative function — mirrors docs/05 "Derived status guidance".
 */
export function deriveMembershipStatus(
  m: Pick<
    Membership,
    "cancelledAt" | "activeFreeze" | "startDate" | "endDate" | "remainingVisits" | "totalVisits"
  >,
  today: string,
): MembershipEffectiveStatus {
  if (m.cancelledAt) return "cancelled";
  if (m.activeFreeze && m.activeFreeze.status === "active" && m.activeFreeze.startDate <= today && today <= m.activeFreeze.endDate) return "frozen";
  if (diffDays(m.startDate, today) < 0) return "scheduled";
  if (diffDays(today, m.endDate) < 0) return "expired";
  if (m.totalVisits != null && (m.remainingVisits ?? 0) <= 0) return "depleted";
  if (diffDays(today, m.endDate) <= EXPIRING_WINDOW_DAYS) return "expiring";
  return "active";
}

export function isMembershipUsable(status: MembershipEffectiveStatus): boolean {
  return status === "active" || status === "expiring";
}

export const MEMBERSHIP_STATUS_LABELS: Record<MembershipEffectiveStatus, string> = {
  active: "Active",
  expiring: "Expiring",
  frozen: "Frozen",
  expired: "Expired",
  cancelled: "Cancelled",
  depleted: "Visits used up",
  scheduled: "Scheduled",
};

// ---------------------------------------------------------------------------
// Check-in decision engine (pure — the backend reimplements this server-side)
// ---------------------------------------------------------------------------

export interface CheckInDecisionInput {
  memberStatus: "active" | "inactive" | "archived";
  membership?: {
    status: MembershipEffectiveStatus;
    planBranchAccess: "all" | "selected";
    planBranchIds: string[];
    remainingVisits?: number;
    /** Needed to explain a term that has not begun yet. */
    startDate?: string;
    endDate: string;
  };
  checkInBranchId: string;
  memberHomeBranchId: string;
  outstanding: Money;
  today: string;
  daysUntilExpiryWarning?: number; // default 7
  duplicateWithinMinutes?: boolean;
}

export interface CheckInDecisionOutput {
  decision: CheckInDecision;
  reasonCodes: CheckInReasonCode[];
  message: string;
}

export function evaluateCheckIn(input: CheckInDecisionInput): CheckInDecisionOutput {
  const codes: CheckInReasonCode[] = [];
  const warnDays = input.daysUntilExpiryWarning ?? 7;

  if (input.duplicateWithinMinutes) {
    return {
      decision: "blocked",
      reasonCodes: ["DUPLICATE_SCAN"],
      message: "Already checked in moments ago. Duplicate scan ignored.",
    };
  }

  if (input.memberStatus !== "active") {
    return {
      decision: "blocked",
      reasonCodes: ["MEMBER_INACTIVE"],
      message: "This member account is not active.",
    };
  }

  const ms = input.membership;
  if (!ms) {
    return {
      decision: "blocked",
      reasonCodes: ["NO_ACTIVE_MEMBERSHIP"],
      message: "No membership on file. Sell or renew a membership to allow entry.",
    };
  }

  if (ms.status === "scheduled") {
    // A future term is not an expired one: the desk must not be told to renew
    // a membership the member has already bought.
    return {
      decision: "blocked",
      reasonCodes: ["MEMBERSHIP_NOT_STARTED"],
      message: ms.startDate
        ? `Membership starts on ${ms.startDate}. Entry before then needs a manager override.`
        : "Membership has not started yet. Entry before the start date needs a manager override.",
    };
  }

  if (ms.status === "expired" || ms.status === "cancelled") {
    return {
      decision: "blocked",
      reasonCodes: ["MEMBERSHIP_EXPIRED"],
      message:
        ms.status === "cancelled"
          ? "Membership was cancelled. Entry requires a manager override."
          : "Membership is not currently valid. Renew to allow entry.",
    };
  }

  if (ms.status === "frozen") {
    return {
      decision: "blocked",
      reasonCodes: ["MEMBERSHIP_FROZEN"],
      message: "Membership is frozen. Unfreeze or ask a manager to override.",
    };
  }

  if (ms.status === "depleted" || (ms.remainingVisits != null && ms.remainingVisits <= 0 && ms.remainingVisits !== undefined)) {
    return {
      decision: "blocked",
      reasonCodes: ["VISITS_DEPLETED"],
      message: "No visits remaining on this pass.",
    };
  }

  const branchAllowed =
    ms.planBranchAccess === "all" ||
    ms.planBranchIds.includes(input.checkInBranchId) ||
    input.checkInBranchId === input.memberHomeBranchId;
  if (!branchAllowed) {
    return {
      decision: "blocked",
      reasonCodes: ["WRONG_BRANCH"],
      message: "This membership does not include access to this branch.",
    };
  }

  // Warnings
  const daysLeft = diffDays(input.today, ms.endDate);
  if (daysLeft <= warnDays) codes.push("EXPIRES_SOON");
  if (input.outstanding.amount > 0) codes.push("OUTSTANDING_BALANCE");

  if (codes.length > 0) {
    const parts: string[] = [];
    if (codes.includes("EXPIRES_SOON")) {
      parts.push(daysLeft === 0 ? "membership expires today" : `membership expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`);
    }
    if (codes.includes("OUTSTANDING_BALANCE")) parts.push("outstanding balance due");
    return {
      decision: "warning",
      reasonCodes: codes,
      message: `Allowed with notice — ${parts.join("; ")}.`,
    };
  }

  return { decision: "allowed", reasonCodes: ["OK"], message: "Membership valid. Welcome in." };
}

// ---------------------------------------------------------------------------
// Which term is "current" — identical to the server's projection rank
// ---------------------------------------------------------------------------

const CURRENT_MEMBERSHIP_RANK: Record<MembershipEffectiveStatus, number> = {
  active: 0,
  expiring: 0,
  frozen: 0,
  depleted: 1,
  scheduled: 2,
  expired: 3,
  cancelled: 4,
};

/**
 * The term the API treats as the member's current one: a usable term first,
 * then a depleted pass, then a term that has not started, then history. The
 * member record must rank the same way or its header contradicts the status
 * chip the server derived.
 */
export function pickCurrentMembership<T extends Pick<Membership, "status" | "endDate">>(memberships: readonly T[]): T | undefined {
  return [...memberships].sort(
    (a, b) => CURRENT_MEMBERSHIP_RANK[a.status] - CURRENT_MEMBERSHIP_RANK[b.status] || b.endDate.localeCompare(a.endDate),
  )[0];
}

/**
 * The term a renewal chains from: the latest one that was not cancelled. A
 * renewal of an earlier term would overlap a successor already sold, which
 * the server rejects, and would break the renewal lineage.
 */
export function pickRenewalTarget<T extends Pick<Membership, "status" | "endDate">>(memberships: readonly T[]): T | undefined {
  return [...memberships].filter((m) => m.status !== "cancelled").sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
}
