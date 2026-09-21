import {
  PLAN_PRIORITY_NONE,
  RESOLUTION_NONE,
  RESOLUTION_NO_MATCH,
  buildClassPickState,
  buildPlanPriorityState,
  buildResolutionIntentState,
  buildTrainerPickState,
  permittedResolutionClarifications,
  permittedResolutionPanels,
  resolveClassPickFixture,
  resolvePlanPriorityFixture,
  resolveResolutionIntentFixture,
  resolveTrainerPickFixture,
  type MemberResolutionContext,
} from "./resolutionAssist";
import { PERMISSIONS } from "./permissions";
import type { JevFeature, JevQuestion } from "./jevRegistry";

/**
 * Member resolution workspace. Four candidate-based choices whose options
 * the application builds first: the panels this actor may open, the plan
 * attributes the comparison knows, the classes the member may actually
 * join, and the trainers with a recorded profile and an open slot. Nothing
 * Jev picks books, collects or changes anything.
 */
export const RESOLUTION_FEATURE: JevFeature = {
  key: "resolution",
  label: "Member resolution workspace",
  description: "Turns what staff are helping a member with into the right panel on the member page, suggests which plan attribute to emphasise, and points at a joinable class or an available trainer. Sends the typed goal and counts or recorded profile facts only.",
};

const FULL_PANELS = permittedResolutionPanels([...PERMISSIONS]);

const SYNTHETIC_CONTEXT: Pick<MemberResolutionContext, "classes" | "gender" | "timezone" | "trainers" | "preferredLanguage" | "homeBranchName"> = {
  gender: "female",
  timezone: "Asia/Amman",
  preferredLanguage: "ar",
  homeBranchName: "Main",
  classes: {
    policyEnabled: true,
    horizonDays: 14,
    options: [
      { id: "class-a", name: "Morning HIIT", date: "2026-09-27", startsAt: "2026-09-27T04:00:00.000Z", endsAt: "2026-09-27T05:00:00.000Z", branchId: "branch-fixture", branchName: "Main", coachName: "Coach A", audience: "mixed", capacity: 12, spotsRemaining: 4, waitlistCount: 0, status: "scheduled", eligible: true, wouldWaitlist: false, alreadyBooked: false },
      { id: "class-b", name: "Ladies Strength", date: "2026-09-27", startsAt: "2026-09-27T15:00:00.000Z", endsAt: "2026-09-27T16:00:00.000Z", branchId: "branch-fixture", branchName: "Main", coachName: "Coach B", audience: "women", capacity: 10, spotsRemaining: 0, waitlistCount: 2, status: "scheduled", eligible: true, wouldWaitlist: true, alreadyBooked: false },
    ],
  },
  trainers: {
    credits: 3,
    options: [
      { id: "trainer-a", displayName: "Trainer A", specialties: ["Strength"], languages: ["en", "ar"], branchIds: ["branch-fixture"], branchNames: ["Main"], published: true, nextSlotAt: "2026-09-23T07:00:00.000Z", openSlots: 9, slotsCheckedUntil: "2026-10-05" },
      { id: "trainer-b", displayName: "Trainer B", specialties: [], languages: [], branchIds: ["branch-fixture"], branchNames: ["Main"], published: true, nextSlotAt: "2026-09-22T12:00:00.000Z", openSlots: 4, slotsCheckedUntil: "2026-10-05" },
    ],
  },
};

const intentFixture = buildResolutionIntentState({
  goal: "I already paid for training",
  memberId: "member-fixture",
  facts: { outstandingMinor: 40_000, openCharges: 1, ptOrdersPending: 0, ptOrdersPaid: 1, ptCreditsAvailable: 8, ptCreditsReserved: 1, membershipStatus: "active", daysUntilExpiry: 20, openTasks: 1, joinableClasses: 2, bookableTrainers: 2, activePlans: 3 },
  panels: FULL_PANELS,
  clarifications: permittedResolutionClarifications(FULL_PANELS),
});
const priorityFixture = buildPlanPriorityState({ goal: "She travels a lot and wants to pause when she is away", memberId: "member-fixture", current: undefined, planCount: 3 });
const classFixture = buildClassPickState({ goal: "A morning class this Sunday", memberId: "member-fixture", context: SYNTHETIC_CONTEXT });
const trainerFixture = buildTrainerPickState({ goal: "An Arabic-speaking trainer for strength work", memberId: "member-fixture", context: SYNTHETIC_CONTEXT });

export const RESOLUTION_QUESTIONS: readonly JevQuestion[] = [
  {
    kind: "choice",
    key: "resolution.intent",
    feature: "resolution",
    version: 1,
    label: "Which panel helps",
    description: "Which approved panel on the member page helps with what staff typed, a prepared clarification, or no match.",
    instructions: "Gym staff opened a member's record and wrote what they are helping the member with. Choose the one offered panel that helps with it. Choose a clarification option when the request fits two panels equally. Choose no_match when no offered panel helps or the request is not about this member. Never assume a panel that is not offered.",
    maxCandidates: 16,
    permission: "members.read",
    cacheTtlMs: 30 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveResolutionIntentFixture,
    fixture: {
      state: intentFixture.state,
      candidates: intentFixture.candidates,
      judgment: resolveResolutionIntentFixture({ state: intentFixture.state, candidates: intentFixture.candidates }) ?? { kind: "choice", choice: RESOLUTION_NO_MATCH, probabilities: { [RESOLUTION_NO_MATCH]: 1 } },
    },
  },
  {
    kind: "choice",
    key: "resolution.plan_priority",
    feature: "resolution",
    version: 1,
    label: "Plan priority",
    description: "Which plan attribute the member's stated priority points at, so the comparison can emphasise it. Every term and price stays visible.",
    instructions: "Gym staff are comparing membership plans for a member and wrote what the member said matters to them. Choose the one plan attribute the request most explicitly prioritises: branch access, freezing, included training, visits, duration or price. Choose none when the request names no priority. Do not rank plans or suggest a price.",
    maxCandidates: 8,
    permission: "members.read",
    cacheTtlMs: 60 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolvePlanPriorityFixture,
    fixture: {
      state: priorityFixture.state,
      candidates: priorityFixture.candidates,
      judgment: resolvePlanPriorityFixture({ state: priorityFixture.state, candidates: priorityFixture.candidates }) ?? { kind: "choice", choice: PLAN_PRIORITY_NONE, probabilities: { [PLAN_PRIORITY_NONE]: 1 } },
    },
  },
  {
    kind: "choice",
    key: "resolution.class_pick",
    feature: "resolution",
    version: 1,
    label: "Class to suggest",
    description: "Which of the classes the member may actually join fits what was asked. Eligibility, capacity and schedule are enforced before anything is offered.",
    instructions: "Gym staff want to put a member into a group class and wrote what the member asked for. Only classes the member may join are offered, each with its day, time, name, coach, audience, spots and branch. Choose the one that best fits the request; choose none when nothing offered fits or the request names nothing to match on. Never invent a class.",
    maxCandidates: 60,
    permission: "members.read",
    cacheTtlMs: 5 * 60 * 1000,
    timeoutMs: 8_000,
    synthetic: false,
    fixtureResolver: resolveClassPickFixture,
    fixture: {
      state: classFixture.state,
      candidates: classFixture.candidates,
      judgment: resolveClassPickFixture({ state: classFixture.state, candidates: classFixture.candidates }) ?? { kind: "choice", choice: RESOLUTION_NONE, probabilities: { [RESOLUTION_NONE]: 1 } },
    },
  },
  {
    kind: "choice",
    key: "resolution.trainer_pick",
    feature: "resolution",
    version: 1,
    label: "Trainer to suggest",
    description: "Which trainer with a recorded profile and an open slot fits what was asked. A language or skill the profile does not record stays unknown.",
    instructions: "Gym staff want to match a member with a personal trainer and wrote what the member asked for. Only published trainers with an open slot at the member's branch are offered, described by what their profile records. Choose the trainer whose recorded profile fits the request; choose none when nothing recorded fits. A language, gender or skill that a profile does not record is unknown: never infer it from a name.",
    maxCandidates: 40,
    permission: "members.read",
    cacheTtlMs: 5 * 60 * 1000,
    timeoutMs: 8_000,
    synthetic: false,
    fixtureResolver: resolveTrainerPickFixture,
    fixture: {
      state: trainerFixture.state,
      candidates: trainerFixture.candidates,
      judgment: resolveTrainerPickFixture({ state: trainerFixture.state, candidates: trainerFixture.candidates }) ?? { kind: "choice", choice: RESOLUTION_NONE, probabilities: { [RESOLUTION_NONE]: 1 } },
    },
  },
];
