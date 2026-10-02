/**
 * Shared by the client, the credential-free adapter and the Convex functions,
 * so it must not import the domain types module (the Convex program cannot
 * resolve that module's path aliases). The unions below mirror
 * `ContactOutcome` and `TaskType` in `src/lib/domain/types.ts`.
 */
export const CONTACT_OUTCOMES = [
  "no_answer",
  "answered_interested",
  "answered_not_interested",
  "answered_call_back",
  "wrong_number",
  "whatsapp_sent",
  "whatsapp_opened",
  "trial_booked",
  "trial_completed",
] as const;
export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number];
type TaskType = "follow_up" | "renewal_call" | "payment_collection" | "trial_follow_up" | "general";

/**
 * Human labels for what actually happened on a contact attempt. Shared by the
 * queues, the pipeline, the lead record and both adapters so the same outcome
 * never reads "called" in one place and "whatsapp opened" in another.
 */
export const CONTACT_OUTCOME_LABELS: Record<ContactOutcome, string> = {
  no_answer: "No answer",
  answered_interested: "Interested",
  answered_not_interested: "Not interested",
  answered_call_back: "Asked for a callback",
  wrong_number: "Wrong number",
  whatsapp_sent: "WhatsApp sent",
  whatsapp_opened: "WhatsApp opened · not confirmed",
  trial_booked: "Trial booked",
  trial_completed: "Trial completed",
};

export function isContactOutcome(value: unknown): value is ContactOutcome {
  return typeof value === "string" && value in CONTACT_OUTCOME_LABELS;
}

/** Label for a persisted outcome; unknown historical values fall back to readable words. */
export function describeContactOutcome(outcome?: string | null): string | undefined {
  if (!outcome) return undefined;
  return isContactOutcome(outcome) ? CONTACT_OUTCOME_LABELS[outcome] : outcome.replace(/_/g, " ");
}

/** Outcomes after which there is nothing left to follow up: every open follow-up closes. */
export const TERMINAL_OUTCOMES: ReadonlySet<ContactOutcome> = new Set<ContactOutcome>(["answered_not_interested", "wrong_number"]);

/** Outcomes that mean the person was actually reached, as opposed to an attempt. */
export const REACHED_OUTCOMES: ReadonlySet<ContactOutcome> = new Set<ContactOutcome>([
  "answered_interested",
  "answered_not_interested",
  "answered_call_back",
  "trial_booked",
  "trial_completed",
]);

/**
 * Suggested retry gap in days for outcomes that leave the conversation open.
 * A suggestion, never a silent write: the form shows the date and says why.
 */
export function suggestedFollowUpDays(outcome: ContactOutcome): number | undefined {
  switch (outcome) {
    case "no_answer": return 2;
    case "answered_call_back": return 1;
    case "whatsapp_opened":
    case "whatsapp_sent": return 1;
    default: return undefined;
  }
}

// ---------------------------------------------------------------------------
// Follow-up task resolution
// ---------------------------------------------------------------------------

/** Task types that represent "contact this person"; a logged contact is their execution. */
export const FOLLOW_UP_TASK_TYPES: ReadonlySet<TaskType> = new Set<TaskType>(["follow_up", "renewal_call", "trial_follow_up"]);

export interface FollowUpTaskFact {
  id: string;
  type: string;
  status: string;
  ownerId?: string;
  memberId?: string;
  leadId?: string;
  dueAt: string;
}

export interface FollowUpResolution<T extends FollowUpTaskFact> {
  /** The one task that stays open with its due date moved to the next follow-up. */
  reschedule?: T;
  /** Tasks the logged contact fulfils; they close with the outcome as their result. */
  complete: T[];
  /** No open task could absorb the next follow-up, so one must be created. */
  createFollowUp: boolean;
}

/**
 * A logged contact is the follow-up happening. Instead of stacking one more
 * "Follow up — Name" task per call, the actor's open follow-up tasks for that
 * person are resolved:
 * - with a next date, the latest one moves to it and the others close;
 * - with a terminal outcome (not interested, wrong number) they all close;
 * - otherwise only the tasks already due close, and a follow-up planned for a
 *   later day is left alone, because this contact was not that one.
 * Tasks owned by someone else are left alone unless the actor may manage the
 * team, mirroring who may complete them from Today.
 */
export function resolveFollowUpTasks<T extends FollowUpTaskFact>(input: {
  tasks: readonly T[];
  subject: { memberId?: string; leadId?: string };
  actorId: string;
  canManageTeam: boolean;
  nextFollowUpAt?: string;
  outcome?: string;
  /** Whether a due date falls on or before the tenant-local today. Defaults to "always due". */
  isDue?: (dueAt: string) => boolean;
}): FollowUpResolution<T> {
  const candidates = input.tasks
    .filter((task) => task.status === "open" && FOLLOW_UP_TASK_TYPES.has(task.type as TaskType))
    .filter((task) => (input.subject.memberId ? task.memberId === input.subject.memberId : false) || (input.subject.leadId ? task.leadId === input.subject.leadId : false))
    .filter((task) => input.canManageTeam || !task.ownerId || task.ownerId === input.actorId)
    .sort((left, right) => right.dueAt.localeCompare(left.dueAt));
  if (input.nextFollowUpAt) {
    const [reschedule, ...rest] = candidates;
    return { reschedule, complete: rest, createFollowUp: !reschedule };
  }
  const terminal = isContactOutcome(input.outcome) && TERMINAL_OUTCOMES.has(input.outcome);
  const isDue = input.isDue ?? (() => true);
  return { complete: terminal ? candidates : candidates.filter((task) => isDue(task.dueAt)), createFollowUp: false };
}

/**
 * Whether a lead's own next-follow-up date should be cleared by a contact that
 * set no new date: yes when the thread ended, or when that date was already
 * due (this contact was the follow-up). A date planned for later stays.
 */
export function shouldClearLeadFollowUp(input: { outcome: string; currentNextFollowUpAt?: string; isDue: (dueAt: string) => boolean }): boolean {
  if (!input.currentNextFollowUpAt) return false;
  if (isContactOutcome(input.outcome) && TERMINAL_OUTCOMES.has(input.outcome)) return true;
  return input.isDue(input.currentNextFollowUpAt);
}

export function completedByContactOutcome(outcome: string): string {
  return `Contact logged — ${describeContactOutcome(outcome) ?? outcome}`;
}

export function followUpTaskTitle(subjectName: string, outcome?: string): string {
  const label = describeContactOutcome(outcome);
  return label ? `Follow up — ${subjectName} · after ${label.toLowerCase()}` : `Follow up — ${subjectName}`;
}
