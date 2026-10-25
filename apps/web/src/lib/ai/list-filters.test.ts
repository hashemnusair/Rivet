import { describe, expect, it } from "vitest";
import { memberFilterPlan } from "./list-filters";

describe("members list filters from a request", () => {
  it("applies only the list's own filters and names the window it really uses", () => {
    expect(memberFilterPlan({ membership: "expiring", expiringWithinDays: 30, unrecognised: [] }, {})).toEqual({ apply: { membership: "expiring" }, notes: [{ kind: "expiringWindow", days: 30 }], notApplied: [] });
    expect(memberFilterPlan({ membership: "expiring", expiringWithinDays: 14, unrecognised: [] }, {}).notes).toEqual([]);
  });

  it("uses “owes money” alone, but never silently drops it next to another membership filter", () => {
    expect(memberFilterPlan({ owes: true, unrecognised: [] }, {}).apply).toEqual({ membership: "outstanding" });
    expect(memberFilterPlan({ membership: "frozen", owes: true, unrecognised: [] }, {})).toMatchObject({ apply: { membership: "frozen" }, notApplied: [{ kind: "owesConflict" }] });
  });

  it("lists what this list cannot show instead of approximating it", () => {
    const plan = memberFilterPlan({ membership: "none", notVisitedForDays: 21, branchId: "b-2", unrecognised: ["tall people"] }, { activeBranchId: "b-1" });
    expect(plan.apply).toEqual({});
    expect(plan.notApplied).toEqual([{ kind: "membershipNone" }, { kind: "notVisited", days: 21 }, { kind: "branchSwitch", branchId: "b-2" }, { kind: "unrecognised", text: "tall people" }]);
    expect(memberFilterPlan({ branchId: "b-1", unrecognised: [] }, { activeBranchId: "b-1" }).notes).toEqual([{ kind: "branchShown", branchId: "b-1" }]);
  });
});
