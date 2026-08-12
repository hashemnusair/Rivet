import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/utils/dates";
import { money, zeroMoney } from "@/lib/utils/money";
import {
  EXPIRING_WINDOW_DAYS,
  deriveMembershipStatus,
  evaluateCheckIn,
  isMembershipUsable,
  type CheckInDecisionInput,
} from "./status";
import type { FreezePeriod } from "./types";

const TODAY = "2026-07-30";

function term(overrides: Partial<Parameters<typeof deriveMembershipStatus>[0]> = {}) {
  return {
    cancelledAt: undefined,
    activeFreeze: undefined,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    remainingVisits: undefined,
    totalVisits: undefined,
    ...overrides,
  };
}

const activeFreeze: FreezePeriod = {
  id: "f1",
  membershipId: "m1",
  startDate: "2026-07-20",
  endDate: "2026-08-20",
  status: "active",
  reason: "Travelling",
  createdById: "u1",
  createdAt: "2026-07-19T10:00:00Z",
};

describe("deriveMembershipStatus", () => {
  it("reports an ordinary in-term membership as active", () => {
    expect(deriveMembershipStatus(term(), TODAY)).toBe("active");
  });

  it("flags a membership inside the expiring window", () => {
    // 2026-08-13 is exactly EXPIRING_WINDOW_DAYS (14) after 2026-07-30.
    const lastDayInWindow = addDays(TODAY, EXPIRING_WINDOW_DAYS);
    expect(lastDayInWindow).toBe("2026-08-13");
    expect(deriveMembershipStatus(term({ endDate: lastDayInWindow }), TODAY)).toBe("expiring");
    expect(deriveMembershipStatus(term({ endDate: addDays(TODAY, EXPIRING_WINDOW_DAYS + 1) }), TODAY)).toBe("active");
  });

  it("treats the final day as expiring, not expired", () => {
    expect(deriveMembershipStatus(term({ endDate: TODAY }), TODAY)).toBe("expiring");
  });

  it("expires the day after the end date", () => {
    expect(deriveMembershipStatus(term({ endDate: "2026-07-29" }), TODAY)).toBe("expired");
  });

  it("marks a future term as scheduled", () => {
    expect(deriveMembershipStatus(term({ startDate: "2026-09-01", endDate: "2027-08-31" }), TODAY)).toBe("scheduled");
  });

  it("marks a visit pass with no visits left as depleted", () => {
    expect(deriveMembershipStatus(term({ totalVisits: 10, remainingVisits: 0 }), TODAY)).toBe("depleted");
    expect(deriveMembershipStatus(term({ totalVisits: 10, remainingVisits: 3 }), TODAY)).toBe("active");
  });

  it("prefers cancellation over every other signal", () => {
    expect(
      deriveMembershipStatus(term({ cancelledAt: "2026-07-01T10:00:00Z", activeFreeze, endDate: "2026-07-01" }), TODAY),
    ).toBe("cancelled");
  });

  it("prefers an active freeze over dates and visits", () => {
    expect(deriveMembershipStatus(term({ activeFreeze, totalVisits: 10, remainingVisits: 0 }), TODAY)).toBe("frozen");
  });

  it("ignores a freeze that is no longer active", () => {
    expect(deriveMembershipStatus(term({ activeFreeze: { ...activeFreeze, status: "completed" } }), TODAY)).toBe("active");
  });

  it("does not freeze the membership before a scheduled freeze begins or after it ends", () => {
    expect(deriveMembershipStatus(term({ activeFreeze: { ...activeFreeze, startDate: "2026-08-10", endDate: "2026-08-20" } }), TODAY)).toBe("active");
    expect(deriveMembershipStatus(term({ activeFreeze: { ...activeFreeze, startDate: "2026-07-01", endDate: "2026-07-20" } }), TODAY)).toBe("active");
  });
});

describe("isMembershipUsable", () => {
  it("allows entry only for active and expiring terms", () => {
    expect(isMembershipUsable("active")).toBe(true);
    expect(isMembershipUsable("expiring")).toBe(true);
    for (const status of ["frozen", "expired", "cancelled", "depleted", "scheduled"] as const) {
      expect(isMembershipUsable(status)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Check-in decision engine
// ---------------------------------------------------------------------------

const BRANCH_A = "branch-a";
const BRANCH_B = "branch-b";

function input(overrides: Partial<CheckInDecisionInput> = {}): CheckInDecisionInput {
  return {
    memberStatus: "active",
    membership: {
      status: "active",
      planBranchAccess: "all",
      planBranchIds: [],
      endDate: "2026-12-31",
    },
    checkInBranchId: BRANCH_A,
    memberHomeBranchId: BRANCH_A,
    outstanding: zeroMoney(),
    today: TODAY,
    ...overrides,
  };
}

describe("evaluateCheckIn — allowed", () => {
  it("lets a paid, in-term member straight in", () => {
    const result = evaluateCheckIn(input());
    expect(result.decision).toBe("allowed");
    expect(result.reasonCodes).toEqual(["OK"]);
    expect(result.message).toMatch(/welcome/i);
  });
});

describe("evaluateCheckIn — warnings", () => {
  it("warns, but allows, when the membership expires within a week", () => {
    const result = evaluateCheckIn(input({ membership: { ...input().membership!, endDate: "2026-08-03" } }));
    expect(result.decision).toBe("warning");
    expect(result.reasonCodes).toContain("EXPIRES_SOON");
    expect(result.message).toMatch(/expires in 4 days/);
  });

  it("says 'today' rather than 'in 0 days' on the last day", () => {
    const result = evaluateCheckIn(input({ membership: { ...input().membership!, endDate: TODAY } }));
    expect(result.decision).toBe("warning");
    expect(result.message).toMatch(/expires today/);
  });

  it("warns, but allows, when a balance is outstanding", () => {
    const result = evaluateCheckIn(input({ outstanding: money(45_000) }));
    expect(result.decision).toBe("warning");
    expect(result.reasonCodes).toContain("OUTSTANDING_BALANCE");
    expect(result.message).toMatch(/outstanding balance/i);
  });

  it("reports both warnings together", () => {
    const result = evaluateCheckIn(
      input({ membership: { ...input().membership!, endDate: "2026-08-02" }, outstanding: money(20_000) }),
    );
    expect(result.decision).toBe("warning");
    expect(result.reasonCodes).toEqual(expect.arrayContaining(["EXPIRES_SOON", "OUTSTANDING_BALANCE"]));
  });

  it("does not warn outside the configured expiry window", () => {
    const result = evaluateCheckIn(input({ daysUntilExpiryWarning: 3, membership: { ...input().membership!, endDate: "2026-08-10" } }));
    expect(result.decision).toBe("allowed");
  });
});

describe("evaluateCheckIn — blocked", () => {
  it("blocks a duplicate scan before anything else", () => {
    const result = evaluateCheckIn(input({ duplicateWithinMinutes: true, memberStatus: "archived" }));
    expect(result.decision).toBe("blocked");
    expect(result.reasonCodes).toEqual(["DUPLICATE_SCAN"]);
  });

  it("blocks an inactive or archived member", () => {
    expect(evaluateCheckIn(input({ memberStatus: "inactive" })).reasonCodes).toEqual(["MEMBER_INACTIVE"]);
    expect(evaluateCheckIn(input({ memberStatus: "archived" })).reasonCodes).toEqual(["MEMBER_INACTIVE"]);
  });

  it("blocks when there is no membership at all", () => {
    const result = evaluateCheckIn(input({ membership: undefined }));
    expect(result.decision).toBe("blocked");
    expect(result.reasonCodes).toEqual(["NO_ACTIVE_MEMBERSHIP"]);
    expect(result.message).toMatch(/sell or renew/i);
  });

  it("blocks an expired term and tells the desk to renew", () => {
    const result = evaluateCheckIn(input({ membership: { ...input().membership!, status: "expired" } }));
    expect(result.decision).toBe("blocked");
    expect(result.reasonCodes).toEqual(["MEMBERSHIP_EXPIRED"]);
    expect(result.message).toMatch(/renew/i);
  });

  it("blocks a scheduled term that has not started", () => {
    expect(evaluateCheckIn(input({ membership: { ...input().membership!, status: "scheduled" } })).decision).toBe("blocked");
  });

  it("blocks a cancelled term and points at a manager override", () => {
    const result = evaluateCheckIn(input({ membership: { ...input().membership!, status: "cancelled" } }));
    expect(result.decision).toBe("blocked");
    expect(result.message).toMatch(/override/i);
  });

  it("blocks a frozen membership", () => {
    const result = evaluateCheckIn(input({ membership: { ...input().membership!, status: "frozen" } }));
    expect(result.decision).toBe("blocked");
    expect(result.reasonCodes).toEqual(["MEMBERSHIP_FROZEN"]);
  });

  it("blocks a depleted visit pass", () => {
    const result = evaluateCheckIn(
      input({ membership: { ...input().membership!, status: "depleted", remainingVisits: 0 } }),
    );
    expect(result.decision).toBe("blocked");
    expect(result.reasonCodes).toEqual(["VISITS_DEPLETED"]);
  });

  it("blocks at a branch the plan does not cover", () => {
    const result = evaluateCheckIn(
      input({
        checkInBranchId: BRANCH_B,
        memberHomeBranchId: BRANCH_A,
        membership: { ...input().membership!, planBranchAccess: "selected", planBranchIds: [BRANCH_A] },
      }),
    );
    expect(result.decision).toBe("blocked");
    expect(result.reasonCodes).toEqual(["WRONG_BRANCH"]);
  });

  it("still admits a single-branch member at their own home branch", () => {
    const result = evaluateCheckIn(
      input({
        checkInBranchId: BRANCH_A,
        memberHomeBranchId: BRANCH_A,
        membership: { ...input().membership!, planBranchAccess: "selected", planBranchIds: [] },
      }),
    );
    expect(result.decision).toBe("allowed");
  });

  it("admits an all-access plan at any branch", () => {
    const result = evaluateCheckIn(input({ checkInBranchId: BRANCH_B, memberHomeBranchId: BRANCH_A }));
    expect(result.decision).toBe("allowed");
  });

  it("prioritises a hard block over a mere balance warning", () => {
    const result = evaluateCheckIn(
      input({ membership: { ...input().membership!, status: "expired" }, outstanding: money(45_000) }),
    );
    expect(result.decision).toBe("blocked");
    expect(result.reasonCodes).not.toContain("OUTSTANDING_BALANCE");
  });
});
