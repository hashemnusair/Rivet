import { describe, expect, it } from "vitest";
import { varianceApprovalStatusForAmount, varianceAuditApprovalStatusForAmount } from "./reconciliation";

describe("server cash variance approval projection", () => {
  it("does not create approval state for zero variance", () => {
    expect(varianceApprovalStatusForAmount(0)).toBe("none");
    expect(varianceAuditApprovalStatusForAmount(0)).toBeUndefined();
  });

  it("routes a positive variance to pending approval", () => {
    expect(varianceApprovalStatusForAmount(3_000)).toBe("pending");
    expect(varianceAuditApprovalStatusForAmount(3_000)).toBe("pending");
  });

  it("routes a negative variance to pending approval", () => {
    expect(varianceApprovalStatusForAmount(-5_000)).toBe("pending");
    expect(varianceAuditApprovalStatusForAmount(-5_000)).toBe("pending");
  });
});
