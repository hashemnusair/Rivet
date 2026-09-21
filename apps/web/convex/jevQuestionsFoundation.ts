import type { JevFeature, JevQuestion } from "./jevRegistry";

/**
 * Foundation questions: synthetic checks that prove the Jev connection and
 * demonstrate the suggestion pattern with each judgment kind. They load only
 * the fixture below, never gym data, so they are safe to run against the live
 * model from Settings, from the smoke test and from previews. Later feature
 * modules declare real questions beside this one and register a loader in
 * `jevLoaders.ts`.
 */
export const FOUNDATION_FEATURE: JevFeature = {
  key: "foundation",
  label: "Foundation checks",
  description: "Synthetic questions that prove the connection and the suggestion pattern. They never read gym data.",
};

const SYNTHETIC_TRANSCRIPT = [
  "Reception: Thanks for calling. How can I help?",
  "Member A: I was charged twice for my monthly plan last week.",
  "Reception: I can see the duplicate charge. I have refunded the second payment of 45.000 JOD to your card today.",
  "Member A: Great, thank you.",
].join("\n");

export const FOUNDATION_QUESTIONS: readonly JevQuestion[] = [
  {
    kind: "boolean",
    key: "foundation.refund_detected",
    feature: "foundation",
    version: 1,
    label: "Refund detected",
    description: "Did the sample conversation end with a refund being issued?",
    instructions: "Was a refund issued to the member during this conversation?",
    criteria: {
      true: "The staff member confirmed that money was returned to the member.",
      false: "No refund was issued, or the refund was declined or only promised for later.",
    },
    permission: "settings.manage",
    cacheTtlMs: 0,
    synthetic: true,
    fixture: {
      state: SYNTHETIC_TRANSCRIPT,
      judgment: { kind: "boolean", probability: 0.97, confidence: 0.93 },
    },
  },
  {
    kind: "choice",
    key: "foundation.ticket_route",
    feature: "foundation",
    version: 1,
    label: "Ticket route",
    description: "Which team a sample member message belongs to.",
    instructions: "Which team should handle this member message?",
    options: {
      billing: "Charges, receipts, refunds and outstanding balances",
      access: "Check-in problems, entry passes and membership status at the door",
      schedule: "Class bookings, personal-training sessions and opening hours",
      other: "Anything that does not fit the other teams",
    },
    permission: "settings.manage",
    cacheTtlMs: 0,
    synthetic: true,
    fixture: {
      state: { channel: "whatsapp", message: "My card was charged twice for one month and I still see a balance on my account." },
      judgment: { kind: "choice", choice: "billing", probabilities: { billing: 0.94, access: 0.03, schedule: 0.01, other: 0.02 }, confidence: 0.91 },
    },
  },
  {
    kind: "choice",
    key: "foundation.plan_fit",
    feature: "foundation",
    version: 1,
    label: "Plan fit",
    description: "Which of the supplied sample plans best fits a stated goal (candidate options are scoped per request).",
    instructions: "Which plan best fits what this person says they want? Pick the option whose description matches their goal and budget.",
    maxCandidates: 10,
    permission: "settings.manage",
    cacheTtlMs: 0,
    synthetic: true,
    fixture: {
      state: { goal: "Train three mornings a week before work, mostly weights, and keep the cost under 40 JOD a month.", budgetMinor: 40_000 },
      candidates: [
        { id: "plan_a", description: "Unlimited access, all hours, 55.000 JOD per month" },
        { id: "plan_b", description: "Morning access before 11:00, unlimited visits, 35.000 JOD per month" },
        { id: "plan_c", description: "Eight visits a month, any time, 30.000 JOD per month" },
      ],
      judgment: { kind: "choice", choice: "plan_b", probabilities: { plan_a: 0.05, plan_b: 0.86, plan_c: 0.09 }, confidence: 0.88 },
    },
  },
  {
    kind: "score",
    key: "foundation.note_urgency",
    feature: "foundation",
    version: 1,
    label: "Note urgency",
    description: "How urgent a sample front-desk note is, on a four-level scale.",
    instructions: "How urgently does this note need a manager's attention?",
    levels: [
      "Informational: nothing to do",
      "Routine: handle within the week",
      "Soon: handle today",
      "Immediate: a person is waiting or money is at risk right now",
    ],
    permission: "settings.manage",
    cacheTtlMs: 60 * 60 * 1000,
    synthetic: true,
    fixture: {
      state: { note: "The card terminal at reception is down and two members are waiting to pay for renewals.", writtenBy: "reception" },
      judgment: { kind: "score", score: 2.9, level: 3, levelCount: 4, probabilities: { "0": 0, "1": 0.01, "2": 0.08, "3": 0.91 }, confidence: 0.9 },
    },
  },
];
