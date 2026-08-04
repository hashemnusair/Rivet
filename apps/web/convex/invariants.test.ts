import { describe, expect, it } from "vitest";
import { checkInDecisionOrder, deriveServerMembershipStatus, isValidMinorUnit, paymentAllocation } from "./invariants";

describe("server domain invariants", () => {
  it("preserves membership-status precedence and end-date boundaries", () => {
    const base = { startDate: "2026-08-01", endDate: "2026-08-12", totalVisits: 10, remainingVisits: 0 };
    expect(deriveServerMembershipStatus({ ...base, cancelledAt: "2026-08-01", freezeStatus: "active" }, "2026-08-05")).toBe("cancelled");
    expect(deriveServerMembershipStatus({ ...base, freezeStatus: "active" }, "2026-08-05")).toBe("frozen");
    expect(deriveServerMembershipStatus({ ...base }, "2026-07-31")).toBe("scheduled");
    expect(deriveServerMembershipStatus({ ...base, remainingVisits: 5 }, "2026-08-13")).toBe("expired");
    expect(deriveServerMembershipStatus({ ...base, remainingVisits: 0 }, "2026-08-12")).toBe("depleted");
    expect(deriveServerMembershipStatus({ ...base, remainingVisits: 5 }, "2026-08-12")).toBe("expiring");
  });

  it("accepts only integer minor-unit money", () => {
    expect(isValidMinorUnit(12_500)).toBe(true);
    expect(isValidMinorUnit(12.5)).toBe(false);
    expect(isValidMinorUnit(-1)).toBe(false);
    expect(isValidMinorUnit(-1, true)).toBe(true);
  });

  it("keeps money-changing allocations positive and bounded", () => {
    expect(paymentAllocation(12_500, 40_000)).toEqual({ ok: true, remaining: 27_500 });
    expect(paymentAllocation(40_001, 40_000)).toEqual({ ok: false, code: "AMOUNT_EXCEEDS_OUTSTANDING" });
    expect(paymentAllocation(12.5, 40_000)).toEqual({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("does not let warnings outrank hard check-in blocks", () => {
    expect(checkInDecisionOrder({ duplicate: true, memberActive: true, hasMembership: true, membershipStatus: "active", branchAllowed: true, expiresSoon: true, outstanding: true })).toBe("duplicate");
    expect(checkInDecisionOrder({ duplicate: false, memberActive: true, hasMembership: true, membershipStatus: "frozen", branchAllowed: true, expiresSoon: false, outstanding: false })).toBe("membership_blocked");
    expect(checkInDecisionOrder({ duplicate: false, memberActive: true, hasMembership: true, membershipStatus: "active", visitsRemaining: 0, branchAllowed: true, expiresSoon: true, outstanding: true })).toBe("visits_depleted");
    expect(checkInDecisionOrder({ duplicate: false, memberActive: true, hasMembership: true, membershipStatus: "active", visitsRemaining: 5, branchAllowed: true, expiresSoon: true, outstanding: true })).toBe("warning");
  });
});
