import { describe, expect, it } from "vitest";
import { planLimitViolation, resolvePlanLimits } from "./planLimits";

describe("plan limits", () => {
  it("uses the published limits, with operator-saved numbers taking precedence", () => {
    expect(resolvePlanLimits("Starter")).toEqual({ plan: "Starter", branches: 1, staff: 8, members: 500 });
    expect(resolvePlanLimits("growth", { members: 3_000, staff: 0 })).toEqual({ plan: "Growth", branches: 3, staff: 25, members: 3_000 });
  });

  it("does not limit a gym that predates billing", () => {
    expect(resolvePlanLimits(undefined)).toBeUndefined();
    expect(planLimitViolation(undefined, "members", 10_000)).toBeUndefined();
  });

  it("refuses only the addition that would pass the limit", () => {
    const limits = resolvePlanLimits("Starter")!;
    expect(planLimitViolation(limits, "members", 499)).toBeUndefined();
    expect(planLimitViolation(limits, "members", 500)).toMatchObject({ code: "PLAN_LIMIT_REACHED", messageKey: "apiErrors.planLimitMembers", params: { plan: "Starter", limit: 500 } });
    expect(planLimitViolation(limits, "branches", 0, 2)).toMatchObject({ details: { limit: "branches", allowed: 1, used: 0, adding: 2 } });
    expect(planLimitViolation(limits, "staff", 20, 0)).toBeUndefined();
  });
});
