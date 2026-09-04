import { describe, expect, it } from "vitest";
import { PLAN_CATALOGUE, findPlan, planFee, planSummary } from "./planCatalogue";

describe("plan catalogue", () => {
  it("describes a plan the way the agreement and the invoice print it", () => {
    expect(PLAN_CATALOGUE.map((plan) => plan.name)).toEqual(["Starter", "Growth", "Pro", "Enterprise"]);
    expect(planSummary("Growth")).toBe("Growth · up to 3 branches, 25 staff, 2,500 members");
    expect(planSummary("Starter")).toBe("Starter · up to 1 branch, 8 staff, 500 members");
    expect(planSummary("Unknown")).toBe("Unknown");
    expect(planFee("Growth")).toBe("JOD 149.000 per month");
    expect(planFee("Pro", "annual")).toBe("JOD 2,390.400 per year");
    expect(planFee("Unknown")).toBeUndefined();
    expect(findPlan(" growth ")?.members).toBe(2_500);
  });
});
