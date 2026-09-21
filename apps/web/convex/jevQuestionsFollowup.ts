import {
  CONTEXT_NONE,
  NOTE_UNCLEAR,
  REASON_CHECK_LEVELS,
  RELATED_TASK_NONE,
  TEMPLATE_STAFF_REVIEW,
  buildContactNoteState,
  buildMemberFollowUpContext,
  buildReasonCheckState,
  buildRelatedTaskState,
  buildReminderTemplateState,
  buildRenewalContextState,
  resolveContactNoteFixture,
  resolveReasonCheckFixture,
  resolveRelatedTaskFixture,
  resolveReminderTemplateFixture,
  resolveRenewalContextFixture,
  type FollowUpRelatedTask,
} from "./followupAssist";
import type { JevFeature, JevQuestion } from "./jevRegistry";

/**
 * Connected staff follow-up assistance. Five questions, all answered from
 * options and facts the application builds first: the outcomes a form
 * offers, the person's open tasks, the evidence already on the timeline,
 * the approved templates that fit the term's timing, and the audit
 * criterion for a sensitive action. Nothing here sends a message, closes a
 * task or authorises anything.
 */
export const FOLLOWUP_FEATURE: JevFeature = {
  key: "followup",
  label: "Staff follow-up assistance",
  description: "Reads a contact note for the supported outcome it records, checks new follow-up work against open tasks, points a renewal conversation at the recorded context that matters, suggests an approved reminder template or a staff-written message, and asks for missing detail in sensitive-action reasons. Sends the typed text and the person's own recorded facts only.",
};

const SYNTHETIC_TASKS: FollowUpRelatedTask[] = [
  { id: "task-renewal", type: "renewal_call", title: "Call Member A about membership renewal", ownerName: "Sales B", dueAt: "2026-09-24T07:00:00.000Z", priority: "high", status: "open", mine: false },
  { id: "task-collect", type: "payment_collection", title: "Collect balance 40.000 JOD", ownerName: "Reception C", dueAt: "2026-09-22T07:00:00.000Z", priority: "normal", status: "open", mine: false },
];

const SYNTHETIC_CONTEXT = buildMemberFollowUpContext({
  member: { id: "member-fixture", fullName: "Member A", phone: "+962790000001", preferredLanguage: "en", status: "active", consent: { marketingPreference: { optedIn: true, status: "explicit_opt_in", source: "member_selected" } } },
  memberships: [{ id: "membership-fixture", planName: "Monthly", branchName: "Main", startDate: "2026-08-25", endDate: "2026-09-25", status: "active", outstandingMinor: 0 }],
  timeline: [
    { id: "evidence-callback", type: "call_attempt", title: "Contact — answered call back", body: "Asked us to call after Thursday, travelling until then.", occurredAt: "2026-09-18T09:00:00.000Z", actorName: "Sales B", meta: { outcome: "answered_call_back" } },
    { id: "evidence-note", type: "note", title: "Note added", body: "Mentioned the changing rooms were dirty last week.", occurredAt: "2026-09-10T09:00:00.000Z", actorName: "Reception C" },
  ],
  tasks: SYNTHETIC_TASKS,
  deliveries: [{ id: "delivery-fixture", checkpointKey: "7_day", channel: "whatsapp", status: "queued", attempts: 0, updatedAt: Date.UTC(2026, 8, 18), membershipId: "membership-fixture" }],
  quietHours: { start: "22:00", end: "08:00" },
  deliveryMode: "sandbox",
  currency: "JOD",
  timezone: "Asia/Amman",
  today: "2026-09-21",
  now: Date.UTC(2026, 8, 21, 9),
});

const noteFixture = buildContactNoteState({ subject: "member", subjectId: "member-fixture", note: "Spoke to her brother, she is travelling until Thursday and he thinks she wants to renew." });
const relatedFixture = buildRelatedTaskState({ subject: "member", subjectId: "member-fixture", personName: "Member A", draft: { type: "renewal_call", title: "Renewal call — Member A", dueDate: "2026-09-23", ownerName: "Sales D" }, tasks: SYNTHETIC_TASKS });
const contextFixture = buildRenewalContextState({ context: SYNTHETIC_CONTEXT, today: "2026-09-21" });
const templateFixture = buildReminderTemplateState({ context: SYNTHETIC_CONTEXT, today: "2026-09-21" });
const reasonFixture = buildReasonCheckState({ action: "refund", reason: "customer request" });

export const FOLLOWUP_QUESTIONS: readonly JevQuestion[] = [
  {
    kind: "choice",
    key: "followup.contact_outcome",
    feature: "followup",
    version: 1,
    label: "Contact note outcome",
    description: "Which supported contact outcome a typed note records, or that the note is about a third party, contradicts itself or is unclear.",
    instructions: "Gym staff logged a contact attempt with a lead or a member and wrote a note about what happened. Choose the one offered outcome the note records. Choose third_party when the note describes speaking with someone other than the person, whatever that person said. Choose contradictory when the note states things that cannot all be true. Choose unclear when the note does not say which outcome happened. Never assume the person was reached unless the note says so.",
    maxCandidates: 12,
    permission: "members.read",
    cacheTtlMs: 60 * 60 * 1000,
    timeoutMs: 8_000,
    synthetic: false,
    fixtureResolver: resolveContactNoteFixture,
    fixture: {
      state: noteFixture.state,
      candidates: noteFixture.candidates,
      judgment: resolveContactNoteFixture({ state: noteFixture.state, candidates: noteFixture.candidates }) ?? { kind: "choice", choice: NOTE_UNCLEAR, probabilities: { [NOTE_UNCLEAR]: 1 } },
    },
  },
  {
    kind: "choice",
    key: "followup.related_task",
    feature: "followup",
    version: 1,
    label: "Related open task",
    description: "Whether an open task about the same person already covers the work a new task describes.",
    instructions: "A staff member is about to create a task about a person. From the person's open tasks offered, choose the one that already covers the same work as the new task, judging by what the work is (a renewal call, a payment, a follow-up about a specific thing), not by the person's name. Choose none when no open task concerns the same work. Never merge, close or move a task; you only point one out.",
    maxCandidates: 32,
    permission: "crm.read",
    cacheTtlMs: 10 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveRelatedTaskFixture,
    fixture: {
      state: relatedFixture.state,
      candidates: relatedFixture.candidates,
      judgment: resolveRelatedTaskFixture({ state: relatedFixture.state, candidates: relatedFixture.candidates }) ?? { kind: "choice", choice: RELATED_TASK_NONE, probabilities: { [RELATED_TASK_NONE]: 1 } },
    },
  },
  {
    kind: "choice",
    key: "followup.renewal_context",
    feature: "followup",
    version: 1,
    label: "Renewal conversation context",
    description: "Which recorded item on the member's timeline matters most for the renewal conversation that is about to happen.",
    instructions: "A staff member is about to talk to a gym member about renewing their membership. From the recorded items offered (calls, notes, messages, freezes, snoozes), choose the one that most changes how that conversation should go: an agreed callback, a complaint, travel, a freeze, a firm no. Choose none when nothing recorded changes it. Use only what is offered; do not assume anything that is not recorded.",
    maxCandidates: 16,
    permission: "crm.read",
    cacheTtlMs: 30 * 60 * 1000,
    timeoutMs: 8_000,
    synthetic: false,
    fixtureResolver: resolveRenewalContextFixture,
    fixture: {
      state: contextFixture.state,
      candidates: contextFixture.candidates,
      judgment: resolveRenewalContextFixture({ state: contextFixture.state, candidates: contextFixture.candidates }) ?? { kind: "choice", choice: CONTEXT_NONE, probabilities: { [CONTEXT_NONE]: 1 } },
    },
  },
  {
    kind: "choice",
    key: "followup.reminder_template",
    feature: "followup",
    version: 1,
    label: "Reminder template or staff review",
    description: "Whether the approved renewal reminder that fits the term's timing is appropriate for this member, or staff should write the message.",
    instructions: "A staff member wants to remind a gym member to renew. The approved standard reminder for the term's timing is offered, if one fits. Choose it when nothing recorded speaks against a standard reminder. Choose staff_review when the recorded context calls for a message written by a person or a call instead: a callback was agreed, a complaint or dispute is recorded, the last contact was with someone else, the member said no, or the standard wording would read wrong. You never decide whether a message may be sent; consent, quiet hours and suppression are checked by the application.",
    maxCandidates: 6,
    permission: "crm.read",
    cacheTtlMs: 30 * 60 * 1000,
    timeoutMs: 8_000,
    synthetic: false,
    fixtureResolver: resolveReminderTemplateFixture,
    fixture: {
      state: templateFixture.state,
      candidates: templateFixture.candidates,
      judgment: resolveReminderTemplateFixture({ state: templateFixture.state, candidates: templateFixture.candidates }) ?? { kind: "choice", choice: TEMPLATE_STAFF_REVIEW, probabilities: { [TEMPLATE_STAFF_REVIEW]: 1 } },
    },
  },
  {
    kind: "score",
    key: "followup.reason_check",
    feature: "followup",
    version: 1,
    label: "Reason detail",
    description: "How much checkable factual detail the reason typed for a sensitive action gives an auditor.",
    instructions: "A staff member typed a reason for a sensitive action (a refund, a void, a check-in override, a freeze, a cancellation, a date change). The criterion states what an auditor needs to find in it. Rate how much checkable factual detail the reason gives. Do not judge whether the action is justified and never suggest a reason.",
    levels: [...REASON_CHECK_LEVELS],
    permission: "members.read",
    cacheTtlMs: 60 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: (input) => resolveReasonCheckFixture({ state: input.state }),
    fixture: {
      state: reasonFixture.state,
      judgment: resolveReasonCheckFixture({ state: reasonFixture.state }) ?? { kind: "score", score: 1, level: 1, levelCount: REASON_CHECK_LEVELS.length, probabilities: { "0": 0.05, "1": 0.85, "2": 0.07, "3": 0.03 } },
    },
  },
];
