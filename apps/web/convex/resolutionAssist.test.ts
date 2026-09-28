import { describe, expect, it } from "vitest";
import {
  chargeService,
  classEligibility,
  comparePlans,
  permittedResolutionPanels,
  readTrainingPayment,
  selectResolutionEvidence,
  type ClassEligibilityInput,
  type MemberResolutionContext,
  type ResolutionPlan,
} from "./resolutionAssist";

describe("resolution panel permissions", () => {
  it("exposes only panels backed by the actor's permissions", () => {
    expect(permittedResolutionPanels([])).toEqual([]);
    expect(permittedResolutionPanels(["members.read"]).map((panel) => panel.id)).toEqual([
      "panel.training_payment",
      "panel.balance",
      "panel.membership_terms",
      "panel.plan_compare",
      "panel.classes",
      "panel.trainers",
    ]);
    expect(permittedResolutionPanels(["crm.read"]).map((panel) => panel.id)).toEqual(["panel.open_work"]);
    expect(permittedResolutionPanels(["members.read", "crm.read"]).map((panel) => panel.id)).toContain("panel.open_work");
  });
});

const PLANS: ResolutionPlan[] = [
  { id: "basic", name: "Basic Monthly", code: "BM", kind: "time", durationDays: 30, price: { amount: 40_000, currency: "JOD" }, branchAccess: "selected", branchIds: ["b1"], branchNames: ["Abdoun"], freezeAllowanceDays: 0, includedPtSessions: 0, status: "active" },
  { id: "flex", name: "Flex Monthly", code: "FM", kind: "time", durationDays: 30, price: { amount: 55_000, currency: "JOD" }, branchAccess: "all", branchIds: [], branchNames: [], freezeAllowanceDays: 14, includedPtSessions: 2, status: "active" },
  { id: "visits", name: "10 Visits", code: "V10", kind: "visits", visitAllowance: 10, visitValidityDays: 60, price: { amount: 30_000, currency: "JOD" }, branchAccess: "selected", branchIds: ["b1"], branchNames: ["Abdoun"], freezeAllowanceDays: 0, includedPtSessions: 0, status: "active" },
];

describe("plan comparison", () => {
  it("keeps every term and price in the table while prioritising emphasised columns", () => {
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

type EligibilityOverrides = Omit<Partial<ClassEligibilityInput>, "occurrence" | "membership"> & {
  occurrence?: Partial<ClassEligibilityInput["occurrence"]>;
  membership?: Partial<NonNullable<ClassEligibilityInput["membership"]>> | null;
};

function eligibilityInput(overrides: EligibilityOverrides = {}): ClassEligibilityInput {
  const { occurrence, membership, ...rest } = overrides;
  return {
    occurrence: {
      id: "o1",
      date: "2026-09-27",
      startsAt: "2026-09-27T04:00:00.000Z",
      endsAt: "2026-09-27T05:00:00.000Z",
      status: "scheduled",
      audience: "mixed",
      capacity: 12,
      bookedCount: 4,
      waitlistCount: 0,
      branchId: "b1",
      ...occurrence,
    },
    policy: { enabled: true, eligibilityMode: "all_active_memberships", eligiblePlanIds: [], maxActiveBookingsPerMember: 8, waitlistEnabled: true, waitlistSize: 12, bookingHorizonDays: 30 },
    member: { id: "m1", gender: "female" },
    membership: membership === null ? undefined : { planId: "basic", startDate: "2026-09-01", endDate: "2026-10-01", homeBranchId: "b1", ...membership },
    plan: { branchAccess: "selected", branchIds: ["b1"] },
    activeBookings: 0,
    alreadyBooked: false,
    now: Date.UTC(2026, 8, 21, 9, 0),
    ...rest,
  };
}

describe("class eligibility", () => {
  it("enforces audience, capacity, freeze and branch guards", () => {
    expect(classEligibility(eligibilityInput())).toEqual({ eligible: true, wouldWaitlist: false });
    expect(classEligibility(eligibilityInput({ occurrence: { audience: "men" } }))).toMatchObject({ eligible: false, reason: expect.stringContaining("for men") });
    expect(classEligibility(eligibilityInput({ member: { id: "m1", gender: undefined }, occurrence: { audience: "women" } }))).toMatchObject({ eligible: false, reason: expect.stringContaining("gender is not recorded") });
    expect(classEligibility(eligibilityInput({ occurrence: { bookedCount: 12, waitlistCount: 2 } }))).toEqual({ eligible: true, wouldWaitlist: true });
    expect(classEligibility(eligibilityInput({ occurrence: { bookedCount: 12, waitlistCount: 12 } }))).toMatchObject({ eligible: false, reason: "This class and its waitlist are full." });
    expect(classEligibility(eligibilityInput({ membership: { activeFreeze: { status: "active", startDate: "2026-09-20", endDate: "2026-09-30" } } }))).toMatchObject({ eligible: false, reason: "The membership is not active on that date." });
    expect(classEligibility(eligibilityInput({ occurrence: { branchId: "b2" }, membership: { homeBranchId: "b1" } }))).toMatchObject({ eligible: false, reason: "The plan does not cover this branch." });
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

  it("matches services from links and keeps a PT payment beside an open membership charge", () => {
    expect(chargeService({ membershipId: "term-1" }, ptChargeIds, "charge-pt")).toBe("personal_training");
    expect(chargeService({ membershipId: "term-1" }, ptChargeIds, "charge-membership")).toBe("membership");
    expect(chargeService({}, ptChargeIds, "charge-x")).toBe("other");

    const reading = readTrainingPayment(context);
    expect(reading.ptPayments.map((payment) => payment.id)).toEqual(["pay-1"]);
    expect(reading.ptOrders.map((order) => order.id)).toEqual(["order-1"]);
    expect(reading.openMembershipCharges.map((charge) => charge.id)).toEqual(["charge-membership"]);
    expect(reading.openPtCharges).toEqual([]);
    expect(reading.openMembershipCharges[0]!.outstandingAmount.amount).toBe(40_000);
    expect(reading.crossedServices).toBe(true);
  });

  it("selects typed payment and membership evidence while keeping task events separate", () => {
    const events = [
      { id: "n1", type: "note", title: "Note", occurredAt: "2026-09-20T09:00:00.000Z" },
      { id: "p1", type: "payment_collected", title: "Payment collected", occurredAt: "2026-09-10T10:00:00.000Z", meta: { receiptId: "r1" } },
      { id: "t1", type: "task_created", title: "Task", occurredAt: "2026-09-19T09:00:00.000Z" },
      { id: "m1", type: "membership_sold", title: "Sold", occurredAt: "2026-09-01T09:00:00.000Z", meta: { membershipId: "term-1" } },
    ];
    const { evidence, taskEvents } = selectResolutionEvidence(events);

    expect(evidence.map((event) => event.id)).toEqual(["p1", "m1"]);
    expect(evidence[0]).toMatchObject({ receiptId: "r1" });
    expect(evidence[1]).toMatchObject({ membershipId: "term-1" });
    expect(taskEvents.map((event) => event.id)).toEqual(["t1"]);
  });
});
