import { addDays, diffDays } from "../utils/dates";
import type { AiExclusionReason, AiRunRevision } from "./contracts";
import { TIME_OF_DAY_CLOCK, type TimeOfDay } from "./relative-dates";

/**
 * The "Prepare follow-ups" decision for one member, shared by the Convex
 * worker (which re-runs it inside the write transaction against current
 * records) and the explicit preview adapter. Pure and deterministic.
 */

export const RENEWAL_FOLLOWUPS_PLAYBOOK_VERSION = "renewal-followups.v1";
/** A contact logged this recently makes another call unnecessary. */
export const RECENT_CONTACT_DAYS = 3;

export interface RenewalCandidateFacts {
  memberId: string;
  memberName: string;
  memberStatus: string;
  membershipId: string;
  membershipEndDate: string;
  /** A successor term exists: the member already renewed. */
  renewed: boolean;
  phone?: string;
  /** The member asked not to be contacted at all (renewal stop reason). */
  noContact: boolean;
  /** Messages are not allowed (explicit opt-out); a call task may still be appropriate. */
  messagesOptedOut: boolean;
  frozenToday: boolean;
  snoozedUntil?: string;
  travellingUntil?: string;
  lastContactAt?: string;
  openFollowUp?: { id: string; type: string; ownerId?: string; dueAt: string; title: string };
  usualTimeOfDay?: TimeOfDay;
  preferredContactTime?: TimeOfDay;
  assignedSalespersonId?: string;
  preferredLanguage: "en" | "ar";
  mentionsEveningClasses: boolean;
}

export interface RenewalBatchPolicy {
  today: string;
  /** The note-time-independent "now" used for recent-contact checks (ISO instant). */
  now: string;
  revisions: readonly AiRunRevision[];
  /** Last day a follow-up is still useful (membership end + grace for ended terms). */
  latestUsefulDate?: string;
}

export type RenewalDecision =
  | { decision: "create"; dueDate: string; dueTime: string; adjustedFor?: "travel"; draft: "message" | "none"; topic?: "evening_classes" }
  | { decision: "link"; taskId: string; taskTitle: string }
  | { decision: "exclude"; reason: AiExclusionReason };

export function evaluateRenewalCandidate(facts: RenewalCandidateFacts, policy: RenewalBatchPolicy): RenewalDecision {
  if (facts.renewed) return { decision: "exclude", reason: "renewed" };
  if (facts.memberStatus !== "active") return { decision: "exclude", reason: "not_active" };
  if (facts.noContact) return { decision: "exclude", reason: "opted_out" };
  for (const revision of policy.revisions) {
    if (revision.kind === "exclude_member" && revision.memberId === facts.memberId) return { decision: "exclude", reason: "revision_excluded" };
    if (revision.kind === "time_of_day" && facts.usualTimeOfDay !== revision.value) return { decision: "exclude", reason: "revision_excluded" };
  }
  if (facts.frozenToday) return { decision: "exclude", reason: "frozen" };
  if (facts.snoozedUntil && facts.snoozedUntil > policy.today) return { decision: "exclude", reason: "snoozed" };
  if (facts.lastContactAt && Date.parse(policy.now) - Date.parse(facts.lastContactAt) < RECENT_CONTACT_DAYS * 86_400_000) return { decision: "exclude", reason: "recently_contacted" };
  // One open follow-up per member: link it instead of stacking another.
  if (facts.openFollowUp) return { decision: "link", taskId: facts.openFollowUp.id, taskTitle: facts.openFollowUp.title };
  if (!facts.phone) return { decision: "exclude", reason: "no_phone" };

  let dueDate = policy.today;
  let adjustedFor: "travel" | undefined;
  if (facts.travellingUntil && facts.travellingUntil >= policy.today) {
    dueDate = addDays(facts.travellingUntil, 1);
    adjustedFor = "travel";
    if (policy.latestUsefulDate && diffDays(policy.latestUsefulDate, dueDate) > 0) return { decision: "exclude", reason: "travelling" };
  }
  const timeOfDay = facts.preferredContactTime ?? facts.usualTimeOfDay;
  const dueTime = timeOfDay ? TIME_OF_DAY_CLOCK[timeOfDay] : "10:00";
  return {
    decision: "create",
    dueDate,
    dueTime,
    ...(adjustedFor ? { adjustedFor } : {}),
    draft: facts.messagesOptedOut ? "none" : "message",
    ...(facts.mentionsEveningClasses ? { topic: "evening_classes" as const } : {}),
  };
}

/** The stored task title. Task titles are stored in English, like other system-created tasks. */
export function renewalTaskTitle(memberName: string, topic?: "evening_classes"): string {
  return topic === "evening_classes" ? `Call ${memberName} about membership renewal · ask about evening classes` : `Call ${memberName} about membership renewal`;
}

/**
 * The idempotency key for one member's follow-up in a renewal cycle. Stable
 * across runs, retries and standing-instruction slots, so the same term never
 * receives two AI-created follow-ups.
 */
export function renewalOperationKey(organizationId: string, memberId: string, membershipId: string, membershipEndDate: string): string {
  return `renewal-followup:${organizationId}:${memberId}:${membershipId}:${membershipEndDate}`;
}

/** Which part of the day a member usually visits, from local check-in hours; undefined when there is too little history. */
export function usualTimeOfDay(localHours: readonly number[]): TimeOfDay | undefined {
  if (localHours.length < 3) return undefined;
  const buckets: Record<TimeOfDay, number> = { morning: 0, afternoon: 0, evening: 0 };
  for (const hour of localHours) buckets[hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening"] += 1;
  const [top, second] = (Object.entries(buckets) as Array<[TimeOfDay, number]>).sort((left, right) => right[1] - left[1]);
  if (!top || top[1] === 0) return undefined;
  // A tie is not a pattern.
  return second && second[1] === top[1] ? undefined : top[0];
}
