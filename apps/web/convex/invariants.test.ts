import { describe, expect, it } from "vitest";
import { approvalPermissionForAction, checkInDecisionOrder, dashboardRevenueSummary, deriveServerMembershipStatus, duplicateMemberMatches, isValidMinorUnit, marketingPreference, paymentAllocation, refundAllocation, trialTransitionAllowed } from "./invariants";

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

  it("only treats an explicit boolean true as opted in", () => {
    expect(marketingPreference(true)).toBe(true);
    expect(marketingPreference(false)).toBe(false);
    expect(marketingPreference(undefined)).toBe(false);
    expect(marketingPreference("true")).toBe(false);
  });

  it("normalizes duplicate contacts and ignores archived members", () => {
    expect(
      duplicateMemberMatches(
        [
          { id: "member-1", fullName: "Active Member", memberNumber: "AM-1001", phone: "079 111 2222", email: "active@example.com", status: "active" },
          { id: "member-2", fullName: "Archived Member", memberNumber: "AM-1002", phone: "0791112222", email: "archived@example.com", status: "archived" },
        ],
        { phone: "079-111-2222" },
      ),
    ).toEqual([{ memberId: "member-1", fullName: "Active Member", memberNumber: "AM-1001", matchedOn: "phone" }]);

    expect(
      duplicateMemberMatches(
        [{ id: "member-3", fullName: "Email Member", memberNumber: "EM-1003", email: "Member@Example.com" }],
        { email: " member@example.com " },
      ),
    ).toEqual([{ memberId: "member-3", fullName: "Email Member", memberNumber: "EM-1003", matchedOn: "email" }]);
  });

  it("keeps money-changing allocations positive and bounded", () => {
    expect(paymentAllocation(12_500, 40_000)).toEqual({ ok: true, remaining: 27_500 });
    expect(paymentAllocation(40_001, 40_000)).toEqual({ ok: false, code: "AMOUNT_EXCEEDS_OUTSTANDING" });
    expect(paymentAllocation(12.5, 40_000)).toEqual({ ok: false, code: "VALIDATION_ERROR" });
  });

  it("rejects refund requests instead of silently clamping them", () => {
    expect(refundAllocation(undefined, 25_000)).toEqual({ ok: true, amount: 25_000 });
    expect(refundAllocation(10_000, 25_000)).toEqual({ ok: true, amount: 10_000 });
    expect(refundAllocation(25_001, 25_000)).toEqual({ ok: false, code: "REFUND_EXCEEDS_AMOUNT" });
    expect(refundAllocation(0, 25_000)).toEqual({ ok: false, code: "REFUND_EXCEEDS_AMOUNT" });
    expect(refundAllocation(undefined, 0)).toEqual({ ok: false, code: "PAYMENT_ALREADY_REFUNDED" });
  });

  it("maps each approval action to its own server permission", () => {
    expect(approvalPermissionForAction("membership.discount")).toBe("payments.discount");
    expect(approvalPermissionForAction("payment.refund")).toBe("payments.refund");
    expect(approvalPermissionForAction("shift.close_variance")).toBe("reconciliation.approve_variance");
    expect(approvalPermissionForAction("payment.void")).toBeNull();
  });

  it("does not let warnings outrank hard check-in blocks", () => {
    expect(checkInDecisionOrder({ duplicate: true, memberActive: true, hasMembership: true, membershipStatus: "active", branchAllowed: true, expiresSoon: true, outstanding: true })).toBe("duplicate");
    expect(checkInDecisionOrder({ duplicate: false, memberActive: true, hasMembership: true, membershipStatus: "frozen", branchAllowed: true, expiresSoon: false, outstanding: false })).toBe("membership_blocked");
    expect(checkInDecisionOrder({ duplicate: false, memberActive: true, hasMembership: true, membershipStatus: "active", visitsRemaining: 0, branchAllowed: true, expiresSoon: true, outstanding: true })).toBe("visits_depleted");
    expect(checkInDecisionOrder({ duplicate: false, memberActive: true, hasMembership: true, membershipStatus: "active", visitsRemaining: 5, branchAllowed: true, expiresSoon: true, outstanding: true })).toBe("warning");
  });

  it("permits only forward free-trial lifecycle transitions", () => {
    expect(trialTransitionAllowed("requested", "confirmed")).toBe(true);
    expect(trialTransitionAllowed("requested", "completed")).toBe(true);
    expect(trialTransitionAllowed("confirmed", "no_show")).toBe(true);
    expect(trialTransitionAllowed("completed", "confirmed")).toBe(false);
    expect(trialTransitionAllowed("cancelled", "requested")).toBe(false);
    expect(trialTransitionAllowed("unknown", "confirmed")).toBe(false);
  });

  it("keeps monthly KPIs independent from the chart window and excludes voided payments", () => {
    const summary = dashboardRevenueSummary(
      [
        { type: "payment", amount: 10_000, occurredAt: "2026-08-08T10:00:00Z" },
        { type: "payment", amount: 20_000, occurredAt: "2026-08-02T10:00:00Z" },
        { type: "payment", amount: 30_000, occurredAt: "2026-07-20T10:00:00Z" },
        { type: "payment", amount: 99_000, status: "voided", occurredAt: "2026-08-08T11:00:00Z" },
        { type: "refund", amount: -2_000, occurredAt: "2026-08-08T12:00:00Z" },
      ],
      { today: "2026-08-08", from: "2026-08-01", to: "2026-08-08", timezone: "Asia/Amman" },
    );

    expect(summary.revenueToday).toBe(10_000);
    expect(summary.revenueThisMonth).toBe(30_000);
    expect(summary.revenuePrevMonth).toBe(30_000);
    expect(summary.rangePayments).toHaveLength(3);
    expect(summary.revenueSeries.at(-1)).toEqual({ date: "2026-08-08", collected: 10_000, refunds: 2_000 });
  });
});
