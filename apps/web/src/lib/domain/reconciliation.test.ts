import { describe, expect, it } from "vitest";
import { canReviewCashVariance, cashShiftHistoryStatus } from "./reconciliation";

describe("cash shift reconciliation state", () => {
  it("treats zero variance as balanced even if an old record has an approval value", () => {
    const shift = { status: "closed" as const, variance: { amount: 0, currency: "JOD" as const }, varianceApprovalStatus: "approved" as const };

    expect(cashShiftHistoryStatus(shift)).toBe("balanced");
    expect(canReviewCashVariance(shift)).toBe(false);
  });

  it("keeps a positive discrepancy in the approval flow", () => {
    const shift = { status: "closed" as const, variance: { amount: 3_000, currency: "JOD" as const }, varianceApprovalStatus: "pending" as const };

    expect(cashShiftHistoryStatus(shift)).toBe("variance_pending");
    expect(canReviewCashVariance(shift)).toBe(true);
  });

  it("keeps a negative discrepancy in the approval flow after rejection", () => {
    const shift = { status: "closed" as const, variance: { amount: -5_000, currency: "JOD" as const }, varianceApprovalStatus: "rejected" as const };

    expect(cashShiftHistoryStatus(shift)).toBe("variance_rejected");
    expect(canReviewCashVariance(shift)).toBe(false);
  });
});
