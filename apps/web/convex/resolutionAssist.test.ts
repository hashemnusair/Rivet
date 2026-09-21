import { describe, expect, it } from "vitest";
import type { JevJudgment } from "./jevRegistry";
import {
  PLAN_PRIORITY_NONE,
  RESOLUTION_NONE,
  RESOLUTION_NO_MATCH,
  buildClassPickState,
  buildPlanPriorityState,
  buildResolutionIntentState,
  buildTrainerPickState,
  chargeService,
  classEligibility,
  comparePlans,
  permittedResolutionClarifications,
  permittedResolutionPanels,
  readTrainingPayment,
  resolveClassPickFixture,
  resolveClassPickReading,
  resolvePlanPriorityFixture,
  resolvePlanPriorityReading,
  resolveResolutionIntentFixture,
  resolveResolutionIntentReading,
  resolveTrainerPickFixture,
  resolveTrainerPickReading,
  resolutionFacts,
  selectResolutionEvidence,
  type ClassEligibilityInput,
  type MemberResolutionContext,
  type ResolutionClassOption,
  type ResolutionFacts,
  type ResolutionPlan,
  type ResolutionTrainerOption,
} from "./resolutionAssist";

const TZ = "Asia/Amman";
const NOW = Date.UTC(2026, 8, 21, 9, 0); // Monday 21 Sep 2026, 12:00 Amman
const FACTS: ResolutionFacts = { outstandingMinor: 40_000, openCharges: 1, ptOrdersPending: 0, ptOrdersPaid: 1, ptCreditsAvailable: 9, ptCreditsReserved: 1, membershipStatus: "active", daysUntilExpiry: 20, openTasks: 1, joinableClasses: 2, bookableTrainers: 1, activePlans: 2 };
const ALL = ["members.read", "members.write", "crm.read", "reports.financial.read", "payments.collect", "memberships.sell", "pt.book_for_member"];

function intent(goal: string, permissions = ALL) {
  const panels = permittedResolutionPanels(permissions);
  const built = buildResolutionIntentState({ goal, memberId: "m1", facts: FACTS, panels, clarifications: permittedResolutionClarifications(panels) });
  return resolveResolutionIntentReading(resolveResolutionIntentFixture({ state: built.state, candidates: built.candidates })!, panels);
}

describe("which panel helps", () => {
  it("offers only the panels the actor may open and only clarifications whose options are both offered", () => {
    expect(permittedResolutionPanels(["members.read"]).map((panel) => panel.id)).not.toContain("panel.open_work");
    expect(permittedResolutionPanels(["members.read", "crm.read"]).map((panel) => panel.id)).toContain("panel.open_work");
    expect(permittedResolutionClarifications(permittedResolutionPanels(["crm.read"]))).toEqual([]);
    const built = buildResolutionIntentState({ goal: "x", memberId: "m1", facts: FACTS, panels: permittedResolutionPanels(ALL), clarifications: permittedResolutionClarifications(permittedResolutionPanels(ALL)) });
    expect(built.state).toMatchObject({ goal: "x", facts: { outstandingBalance: true, openTasks: 1 } });
    expect(JSON.stringify(built.state)).not.toContain("members.read");
  });

  it("reads the brief's examples: paid for training, a money question, a session, a class, a trainer, a plan, a term, and nothing", () => {
    expect(intent("I already paid for training")).toMatchObject({ kind: "panel", panel: { id: "panel.training_payment" } });
    expect(intent("she says she paid")).toMatchObject({ kind: "clarify", clarification: { id: "clarify.payment" } });
    expect(intent("wants to book a session")).toMatchObject({ kind: "clarify", clarification: { id: "clarify.session" } });
    expect(intent("a morning yoga class")).toMatchObject({ kind: "panel", panel: { id: "panel.classes" } });
    expect(intent("an arabic speaking trainer")).toMatchObject({ kind: "panel", panel: { id: "panel.trainers" } });
    expect(intent("a cheaper plan that covers both branches")).toMatchObject({ kind: "panel", panel: { id: "panel.plan_compare" } });
    expect(intent("freeze her membership for two weeks")).toMatchObject({ kind: "panel", panel: { id: "panel.membership_terms" } });
    expect(intent("who is handling her callback")).toMatchObject({ kind: "panel", panel: { id: "panel.open_work" } });
    expect(intent("what is the weather like")).toEqual({ kind: "no_match" });
  });

  it("never opens a panel the actor may not see, whatever the judgment names", () => {
    const permitted = permittedResolutionPanels(["members.read"]);
    const foreign: JevJudgment = { kind: "choice", choice: "panel.open_work", probabilities: { "panel.open_work": 1 } };
    expect(resolveResolutionIntentReading(foreign, permitted)).toEqual({ kind: "no_match" });
    expect(intent("who is handling her callback", ["members.read"])).toEqual({ kind: "no_match" });
    const halfClarify: JevJudgment = { kind: "choice", choice: "clarify.payment", probabilities: { "clarify.payment": 1 } };
    expect(resolveResolutionIntentReading(halfClarify, permitted).kind).toBe("clarify");
    expect(resolveResolutionIntentReading({ kind: "choice", choice: RESOLUTION_NO_MATCH, probabilities: {} }, permitted)).toEqual({ kind: "no_match" });
  });
});

const PLANS: ResolutionPlan[] = [
  { id: "basic", name: "Basic Monthly", code: "BM", kind: "time", durationDays: 30, price: { amount: 40_000, currency: "JOD" }, branchAccess: "selected", branchIds: ["b1"], branchNames: ["Abdoun"], freezeAllowanceDays: 0, includedPtSessions: 0, status: "active" },
  { id: "flex", name: "Flex Monthly", code: "FM", kind: "time", durationDays: 30, price: { amount: 55_000, currency: "JOD" }, branchAccess: "all", branchIds: [], branchNames: [], freezeAllowanceDays: 14, includedPtSessions: 2, status: "active" },
  { id: "visits", name: "10 Visits", code: "V10", kind: "visits", visitAllowance: 10, visitValidityDays: 60, price: { amount: 30_000, currency: "JOD" }, branchAccess: "selected", branchIds: ["b1"], branchNames: ["Abdoun"], freezeAllowanceDays: 0, includedPtSessions: 0, status: "active" },
];

describe("plan comparison", () => {
  const priority = (goal: string) => {
    const built = buildPlanPriorityState({ goal, memberId: "m1", current: undefined, planCount: 3 });
    return resolvePlanPriorityReading(resolvePlanPriorityFixture({ state: built.state, candidates: built.candidates })!);
  };

  it("reads an explicitly stated priority and nothing else", () => {
    expect(priority("She travels a lot and wants to pause the membership when she is away").primary).toBe("attr.freeze");
    expect(priority("needs both branches").primary).toBe("attr.branch_access");
    expect(priority("wants training sessions included").primary).toBe("attr.included_pt");
    expect(priority("something cheaper").primary).toBe("attr.price");
    expect(priority("no preference really")).toEqual({ emphasized: [] });
    const built = buildPlanPriorityState({ goal: "x", memberId: "m1", current: undefined, planCount: 3 });
    expect(resolvePlanPriorityFixture({ state: built.state, candidates: built.candidates })).toMatchObject({ choice: PLAN_PRIORITY_NONE });
  });

  it("keeps every term and price in the table and only reorders the emphasised columns", () => {
    const comparison = comparePlans(PLANS, "basic", ["attr.freeze", "attr.branch_access"]);
    expect(comparison.columns.slice(0, 2)).toEqual(["attr.freeze", "attr.branch_access"]);
    expect(comparison.columns).toHaveLength(6);
    expect(comparison.rows[0]).toMatchObject({ current: true, plan: { id: "basic" } });
    const flex = comparison.rows.find((row) => row.plan.id === "flex")!;
    expect(flex.cells[0]).toMatchObject({ attribute: "attr.freeze", text: "14 freeze days per term", versusCurrent: "more" });
    expect(flex.cells[1]).toMatchObject({ attribute: "attr.branch_access", text: "All branches", versusCurrent: "more" });
    expect(flex.cells.find((cell) => cell.attribute === "attr.price")).toMatchObject({ text: "55.000 JOD", versusCurrent: "less" });
    expect(comparison.rows[1]!.plan.id).toBe("flex");
    const visits = comparison.rows.find((row) => row.plan.id === "visits")!;
    expect(visits.cells.find((cell) => cell.attribute === "attr.visits")).toMatchObject({ text: "10 visits · valid 60 days", versusCurrent: "n/a" });
  });
});

type EligibilityOverrides = Omit<Partial<ClassEligibilityInput>, "occurrence" | "membership"> & { occurrence?: Partial<ClassEligibilityInput["occurrence"]>; membership?: Partial<NonNullable<ClassEligibilityInput["membership"]>> | null };

function eligibilityInput(overrides: EligibilityOverrides = {}): ClassEligibilityInput {
  const { occurrence, membership, ...rest } = overrides;
  return {
    occurrence: { id: "o1", date: "2026-09-27", startsAt: "2026-09-27T04:00:00.000Z", endsAt: "2026-09-27T05:00:00.000Z", status: "scheduled", audience: "mixed", capacity: 12, bookedCount: 4, waitlistCount: 0, branchId: "b1", ...occurrence },
    policy: { enabled: true, eligibilityMode: "all_active_memberships", eligiblePlanIds: [], maxActiveBookingsPerMember: 8, waitlistEnabled: true, waitlistSize: 12, bookingHorizonDays: 30 },
    member: { id: "m1", gender: "female" },
    membership: membership === null ? undefined : { planId: "basic", startDate: "2026-09-01", endDate: "2026-10-01", homeBranchId: "b1", ...membership },
    plan: { branchAccess: "selected", branchIds: ["b1"] },
    activeBookings: 0,
    alreadyBooked: false,
    now: NOW,
    ...rest,
  };
}

describe("class eligibility", () => {
  it("applies audience, capacity, waitlist, schedule, membership and plan rules the booking mutation applies", () => {
    expect(classEligibility(eligibilityInput())).toEqual({ eligible: true, wouldWaitlist: false });
    expect(classEligibility(eligibilityInput({ occurrence: { audience: "men" } }))).toMatchObject({ eligible: false, reason: expect.stringContaining("for men") });
    expect(classEligibility(eligibilityInput({ member: { id: "m1", gender: undefined }, occurrence: { audience: "women" } }))).toMatchObject({ eligible: false, reason: expect.stringContaining("gender is not recorded") });
    expect(classEligibility(eligibilityInput({ occurrence: { bookedCount: 12, waitlistCount: 2 } }))).toEqual({ eligible: true, wouldWaitlist: true });
    expect(classEligibility(eligibilityInput({ occurrence: { bookedCount: 12, waitlistCount: 12 } }))).toMatchObject({ eligible: false, reason: "This class and its waitlist are full." });
    expect(classEligibility(eligibilityInput({ occurrence: { status: "cancelled" } }))).toMatchObject({ eligible: false, reason: "This class was cancelled." });
    expect(classEligibility(eligibilityInput({ occurrence: { startsAt: "2026-09-21T08:00:00.000Z", endsAt: "2026-09-21T10:00:00.000Z" } }))).toMatchObject({ eligible: false, reason: "This class has started." });
    expect(classEligibility(eligibilityInput({ membership: { activeFreeze: { status: "active", startDate: "2026-09-20", endDate: "2026-09-30" } } }))).toMatchObject({ eligible: false, reason: "The membership is not active on that date." });
    expect(classEligibility(eligibilityInput({ membership: null }))).toMatchObject({ eligible: false, reason: "No membership to book against." });
    expect(classEligibility(eligibilityInput({ policy: { enabled: true, eligibilityMode: "selected_plans", eligiblePlanIds: ["flex"], maxActiveBookingsPerMember: 8, waitlistEnabled: true, waitlistSize: 12, bookingHorizonDays: 30 } }))).toMatchObject({ eligible: false, reason: "This membership plan does not include classes." });
    expect(classEligibility(eligibilityInput({ occurrence: { branchId: "b2" }, membership: { homeBranchId: "b1" } }))).toMatchObject({ eligible: false, reason: "The plan does not cover this branch." });
    expect(classEligibility(eligibilityInput({ alreadyBooked: true }))).toMatchObject({ eligible: false, reason: "Already booked or waitlisted." });
    expect(classEligibility(eligibilityInput({ activeBookings: 8 }))).toMatchObject({ eligible: false, reason: expect.stringContaining("limit of 8") });
  });
});

const CLASSES: ResolutionClassOption[] = [
  { id: "hiit", name: "Morning HIIT", date: "2026-09-27", startsAt: "2026-09-27T04:00:00.000Z", endsAt: "2026-09-27T05:00:00.000Z", branchId: "b1", branchName: "Abdoun", coachName: "Rami", audience: "mixed", capacity: 12, spotsRemaining: 4, waitlistCount: 0, status: "scheduled", eligible: true, wouldWaitlist: false, alreadyBooked: false },
  { id: "ladies", name: "Ladies Strength", date: "2026-09-27", startsAt: "2026-09-27T15:00:00.000Z", endsAt: "2026-09-27T16:00:00.000Z", branchId: "b1", branchName: "Abdoun", coachName: "Lina", audience: "women", capacity: 10, spotsRemaining: 0, waitlistCount: 1, status: "scheduled", eligible: true, wouldWaitlist: true, alreadyBooked: false },
  { id: "boxing", name: "Boxing Fundamentals", date: "2026-09-29", startsAt: "2026-09-29T16:00:00.000Z", endsAt: "2026-09-29T17:30:00.000Z", branchId: "b1", branchName: "Abdoun", coachName: "Omar", audience: "mixed", capacity: 16, spotsRemaining: 6, waitlistCount: 0, status: "scheduled", eligible: true, wouldWaitlist: false, alreadyBooked: false },
  { id: "men", name: "Men's Circuit", date: "2026-09-28", startsAt: "2026-09-28T16:00:00.000Z", endsAt: "2026-09-28T17:00:00.000Z", branchId: "b1", branchName: "Abdoun", audience: "men", capacity: 10, spotsRemaining: 3, waitlistCount: 0, status: "scheduled", eligible: false, wouldWaitlist: false, blockReason: "This class is for men; a staff override needs a reason.", alreadyBooked: false },
];

describe("class pick", () => {
  const context = { classes: { policyEnabled: true, horizonDays: 14, options: CLASSES }, gender: "female" as const, timezone: TZ };
  const pick = (goal: string) => {
    const built = buildClassPickState({ goal, memberId: "m1", context });
    return { built, reading: resolveClassPickReading(resolveClassPickFixture({ state: built.state, candidates: built.candidates })!, CLASSES) };
  };

  it("offers joinable classes only and matches on day, time and name", () => {
    const { built, reading } = pick("a morning class this sunday");
    expect(built.candidates.map((candidate) => candidate.id)).toEqual(["hiit", "ladies", "boxing", RESOLUTION_NONE]);
    expect(built.candidates[0]!.description).toContain("Sun 27 Sep · 07:00");
    expect(reading).toMatchObject({ kind: "class", option: { id: "hiit" } });
    expect(pick("boxing with Omar").reading).toMatchObject({ kind: "class", option: { id: "boxing" } });
    expect(pick("sunday evening").reading).toMatchObject({ kind: "class", option: { id: "ladies" } });
  });

  it("says none when nothing matches and never returns a class the member may not join", () => {
    expect(pick("a pilates class on saturday").reading).toEqual({ kind: "none" });
    const stale: JevJudgment = { kind: "choice", choice: "men", probabilities: { men: 1 } };
    expect(resolveClassPickReading(stale, CLASSES)).toEqual({ kind: "none" });
    expect(pick("find her a class").reading).toMatchObject({ kind: "class", option: { id: "hiit" } });
  });
});

const TRAINERS: ResolutionTrainerOption[] = [
  { id: "lina", displayName: "Coach Lina", specialties: ["Strength", "Mobility"], languages: ["en", "ar"], branchIds: ["b1"], branchNames: ["Abdoun"], published: true, nextSlotAt: "2026-09-23T07:00:00.000Z", openSlots: 9, slotsCheckedUntil: "2026-10-05" },
  { id: "ahmad", displayName: "Ahmad Nasser", specialties: [], languages: [], branchIds: ["b1"], branchNames: ["Abdoun"], published: true, nextSlotAt: "2026-09-22T12:00:00.000Z", openSlots: 4, slotsCheckedUntil: "2026-10-05" },
  { id: "busy", displayName: "Coach Busy", specialties: ["Boxing"], languages: ["ar"], branchIds: ["b1"], branchNames: ["Abdoun"], published: true, nextSlotAt: undefined, openSlots: 0, slotsCheckedUntil: "2026-10-05" },
];

describe("trainer pick", () => {
  const context = { trainers: { credits: 3, options: TRAINERS }, preferredLanguage: "ar" as const, timezone: TZ, homeBranchName: "Abdoun" };
  const pick = (goal: string, options = TRAINERS) => {
    const built = buildTrainerPickState({ goal, memberId: "m1", context: { ...context, trainers: { credits: 3, options } } });
    return { built, reading: resolveTrainerPickReading(resolveTrainerPickFixture({ state: built.state, candidates: built.candidates })!, options) };
  };

  it("offers trainers with an open slot only and describes what the profile records, including 'not recorded'", () => {
    const { built } = pick("anyone");
    expect(built.candidates.map((candidate) => candidate.id)).toEqual(["lina", "ahmad", RESOLUTION_NONE]);
    expect(built.candidates[1]!.description).toContain("languages: not recorded");
    expect(built.candidates[1]!.description).toContain("specialties: not recorded");
    expect(built.state).toMatchObject({ memberLanguage: "Arabic", ptCreditsAvailable: 3, bookableTrainers: 2 });
  });

  it("matches a language only when the profile records it, never from the name", () => {
    expect(pick("an arabic speaking trainer").reading).toMatchObject({ kind: "trainer", option: { id: "lina" } });
    expect(pick("someone who speaks arabic", TRAINERS.filter((trainer) => trainer.id !== "lina")).reading).toEqual({ kind: "none" });
    expect(pick("strength work").reading).toMatchObject({ kind: "trainer", option: { id: "lina" } });
    expect(pick("the soonest available trainer").reading).toMatchObject({ kind: "trainer", option: { id: "lina" } });
    const stale: JevJudgment = { kind: "choice", choice: "busy", probabilities: { busy: 1 } };
    expect(resolveTrainerPickReading(stale, TRAINERS)).toEqual({ kind: "none" });
  });
});

describe("training payments and evidence", () => {
  const ptChargeIds = new Set(["charge-pt"]);
  const context: Pick<MemberResolutionContext, "payments" | "ptOrders" | "charges"> = {
    charges: [
      { id: "charge-pt", description: "12 PT sessions", service: chargeService({ membershipId: "term-1" }, ptChargeIds, "charge-pt"), membershipId: "term-1", ptOrderId: "order-1", total: { amount: 240_000, currency: "JOD" }, paidAmount: { amount: 240_000, currency: "JOD" }, outstandingAmount: { amount: 0, currency: "JOD" }, status: "paid", collectible: false, createdAt: "2026-09-10T09:00:00.000Z" },
      { id: "charge-membership", description: "Basic Monthly membership", service: chargeService({ membershipId: "term-1" }, ptChargeIds, "charge-membership"), membershipId: "term-1", total: { amount: 40_000, currency: "JOD" }, paidAmount: { amount: 0, currency: "JOD" }, outstandingAmount: { amount: 40_000, currency: "JOD" }, status: "unpaid", collectible: true, createdAt: "2026-09-01T09:00:00.000Z" },
    ],
    payments: [{ id: "pay-1", type: "payment", amount: { amount: 240_000, currency: "JOD" }, method: "card", status: "completed", receiptId: "r1", receiptNumber: "R-1", occurredAt: "2026-09-10T10:00:00.000Z", chargeId: "charge-pt", service: "personal_training", chargeDescription: "12 PT sessions", collectedByName: "Desk" }],
    ptOrders: [{ id: "order-1", packageName: "12 PT sessions", sessionCount: 12, totalPrice: { amount: 240_000, currency: "JOD" }, status: "active", chargeId: "charge-pt", paidAt: "2026-09-10T10:00:00.000Z", createdAt: "2026-09-10T09:00:00.000Z" }],
  };

  it("keeps a PT payment beside an open membership charge without netting them", () => {
    expect(chargeService({ membershipId: "term-1" }, ptChargeIds, "charge-pt")).toBe("personal_training");
    expect(chargeService({ membershipId: "term-1" }, ptChargeIds, "charge-membership")).toBe("membership");
    expect(chargeService({}, ptChargeIds, "charge-x")).toBe("other");
    const reading = readTrainingPayment(context);
    expect(reading.ptPayments.map((payment) => payment.id)).toEqual(["pay-1"]);
    expect(reading.openMembershipCharges.map((charge) => charge.id)).toEqual(["charge-membership"]);
    expect(reading.openMembershipCharges[0]!.outstandingAmount.amount).toBe(40_000);
    expect(reading.crossedServices).toBe(true);
  });

  it("reads typed evidence from the whole record, newest first, and keeps task events apart", () => {
    const events = [
      { id: "n1", type: "note", title: "Note", occurredAt: "2026-09-20T09:00:00.000Z" },
      { id: "p1", type: "payment_collected", title: "Payment collected", occurredAt: "2026-09-10T10:00:00.000Z", meta: { receiptId: "r1" } },
      { id: "t1", type: "task_created", title: "Task", occurredAt: "2026-09-19T09:00:00.000Z" },
      { id: "m1", type: "membership_sold", title: "Sold", occurredAt: "2026-09-01T09:00:00.000Z", meta: { membershipId: "term-1" } },
    ];
    const { evidence, taskEvents } = selectResolutionEvidence(events);
    expect(evidence.map((event) => event.id)).toEqual(["p1", "m1"]);
    expect(evidence[0]).toMatchObject({ receiptId: "r1" });
    expect(taskEvents.map((event) => event.id)).toEqual(["t1"]);
  });

  it("derives counts-only facts", () => {
    const facts = resolutionFacts({ ...context, pt: { available: 9, reserved: 1, upcomingBookings: [] }, membership: undefined, tasks: [], classes: { policyEnabled: true, horizonDays: 14, options: CLASSES }, trainers: { credits: 9, options: TRAINERS }, plans: PLANS });
    expect(facts).toMatchObject({ outstandingMinor: 40_000, openCharges: 1, ptOrdersPaid: 1, ptOrdersPending: 0, ptCreditsAvailable: 9, joinableClasses: 3, bookableTrainers: 2, activePlans: 3, openTasks: 0 });
  });
});
