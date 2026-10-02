import { diffDays } from "../utils/dates";

export type RetentionRiskKind = "inactive" | "expiring" | "expired";

export interface RetentionMemberFact {
  id: string;
  status: string;
  homeBranchId: string;
  assignedSalespersonId?: string;
  createdAt: string;
}

export interface RetentionMembershipFact {
  id: string;
  memberId: string;
  homeBranchId: string;
  startDate: string;
  endDate: string;
  totalVisits?: number;
  remainingVisits?: number;
  cancelledAt?: string;
  previousMembershipId?: string;
  activeFreeze?: { status?: string; startDate?: string; endDate?: string };
}

export interface RetentionCheckInFact {
  memberId: string;
  decision: string;
  occurredAt: string;
}

export interface RetentionSnoozeFact {
  memberId: string;
  snoozedUntil?: string;
}

export interface RetentionRiskReasonFact {
  kind: RetentionRiskKind;
  label: string;
  daysInactive?: number;
  daysUntilExpiry?: number;
  daysSinceExpiry?: number;
}

export interface RetentionRiskFact {
  memberId: string;
  membershipId: string;
  branchId: string;
  assignedSalespersonId?: string;
  reasons: RetentionRiskReasonFact[];
  priority: "urgent" | "high" | "normal";
  lastVisitAt?: string;
  snoozedUntil?: string;
}

function activeFreezeOn(membership: RetentionMembershipFact, today: string): boolean {
  const freeze = membership.activeFreeze;
  return freeze?.status === "active" && Boolean(freeze.startDate && freeze.endDate && freeze.startDate <= today && freeze.endDate >= today);
}

function latestByEndDate(rows: RetentionMembershipFact[]): RetentionMembershipFact | undefined {
  return [...rows].sort((left, right) => right.endDate.localeCompare(left.endDate) || right.startDate.localeCompare(left.startDate))[0];
}

/**
 * Derives retention risk from persisted operational facts only. The caller is
 * responsible for applying tenant/branch/role visibility before rendering.
 */
export function deriveRetentionRisks(input: {
  today: string;
  inactivityDays: number;
  renewalWindowDays: number;
  expiredWinBackDays: number;
  members: RetentionMemberFact[];
  memberships: RetentionMembershipFact[];
  checkIns: RetentionCheckInFact[];
  snoozes?: RetentionSnoozeFact[];
  includeSnoozed?: boolean;
}): RetentionRiskFact[] {
  const renewedIds = new Set(input.memberships.map((membership) => membership.previousMembershipId).filter((id): id is string => Boolean(id)));
  const snoozeByMember = new Map((input.snoozes ?? []).map((snooze) => [snooze.memberId, snooze]));
  const lastVisitByMember = new Map<string, string>();
  for (const checkIn of input.checkIns) {
    if (checkIn.decision === "blocked") continue;
    const current = lastVisitByMember.get(checkIn.memberId);
    if (!current || current < checkIn.occurredAt) lastVisitByMember.set(checkIn.memberId, checkIn.occurredAt);
  }

  const risks: RetentionRiskFact[] = [];
  for (const member of input.members) {
    if (member.status !== "active") continue;
    const snooze = snoozeByMember.get(member.id);
    if (!input.includeSnoozed && snooze?.snoozedUntil && snooze.snoozedUntil >= input.today) continue;
    const memberTerms = input.memberships.filter((membership) => membership.memberId === member.id && !renewedIds.has(membership.id));
    const current = latestByEndDate(memberTerms.filter((membership) => !membership.cancelledAt
      && membership.startDate <= input.today
      && membership.endDate >= input.today
      && !(membership.totalVisits !== undefined && (membership.remainingVisits ?? 0) <= 0)));
    if (current && activeFreezeOn(current, input.today)) continue;
    const expired = current ? undefined : latestByEndDate(memberTerms.filter((membership) => !membership.cancelledAt && membership.endDate < input.today));
    const selected = current ?? expired;
    if (!selected) continue;

    const reasons: RetentionRiskReasonFact[] = [];
    const lastVisitAt = lastVisitByMember.get(member.id);
    if (current) {
      const daysUntilExpiry = diffDays(input.today, current.endDate);
      if (daysUntilExpiry >= 0 && daysUntilExpiry <= input.renewalWindowDays) {
        reasons.push({ kind: "expiring", label: daysUntilExpiry === 0 ? "Membership ends today" : `Membership expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? "" : "s"}`, daysUntilExpiry });
      }
      const membershipAge = diffDays(current.startDate, input.today);
      const memberAge = diffDays(member.createdAt.slice(0, 10), input.today);
      const daysInactive = lastVisitAt ? diffDays(lastVisitAt.slice(0, 10), input.today) : Math.min(membershipAge, memberAge);
      if (membershipAge >= input.inactivityDays && memberAge >= input.inactivityDays && daysInactive >= input.inactivityDays) {
        reasons.push({ kind: "inactive", label: lastVisitAt ? `No visit in ${daysInactive} days` : `No first visit after ${daysInactive} days`, daysInactive });
      }
    } else if (expired) {
      const daysSinceExpiry = diffDays(expired.endDate, input.today);
      if (daysSinceExpiry >= 1 && daysSinceExpiry <= input.expiredWinBackDays) {
        reasons.push({ kind: "expired", label: `Expired ${daysSinceExpiry} day${daysSinceExpiry === 1 ? "" : "s"} ago`, daysSinceExpiry });
      }
    }
    if (reasons.length === 0) continue;
    const urgent = reasons.some((reason) => reason.kind === "expired" || (reason.daysUntilExpiry ?? 99) <= 2 || (reason.daysInactive ?? 0) >= input.inactivityDays * 2);
    const high = urgent || reasons.some((reason) => reason.kind === "expiring" || (reason.daysInactive ?? 0) >= input.inactivityDays);
    risks.push({
      memberId: member.id,
      membershipId: selected.id,
      branchId: selected.homeBranchId || member.homeBranchId,
      assignedSalespersonId: member.assignedSalespersonId,
      reasons,
      priority: urgent ? "urgent" : high ? "high" : "normal",
      lastVisitAt,
      snoozedUntil: snooze?.snoozedUntil,
    });
  }
  const priorityRank = { urgent: 0, high: 1, normal: 2 } as const;
  return risks.sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority]
    || (right.reasons[0]?.daysInactive ?? 0) - (left.reasons[0]?.daysInactive ?? 0)
    || left.memberId.localeCompare(right.memberId));
}
