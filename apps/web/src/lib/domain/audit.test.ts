import { describe, expect, it } from "vitest";
import { auditApprovalStatusForDisplay } from "./audit";

describe("audit approval presentation", () => {
  it("hides the stale approved badge on an old balanced shift close", () => {
    expect(
      auditApprovalStatusForDisplay({
        action: "shift.close",
        approvalStatus: "approved",
        after: { variance: 0 },
      }),
    ).toBeUndefined();
  });

  it("keeps reviewed variance decisions visible", () => {
    expect(
      auditApprovalStatusForDisplay({
        action: "shift.close_variance",
        approvalStatus: "approved",
        after: { variance: 2_500 },
      }),
    ).toBe("approved");
  });

  it("does not change approval semantics for other sensitive actions", () => {
    expect(
      auditApprovalStatusForDisplay({
        action: "payment.refund",
        approvalStatus: "approved",
        after: { amount: 10_000 },
      }),
    ).toBe("approved");
  });
});
