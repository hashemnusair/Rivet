import { describe, expect, it } from "vitest";
import { dashboardScopeDescription } from "./dashboard-scope";

const branches = [
  { id: "abdoun", name: "Abdoun" },
  { id: "sweifieh", name: "Sweifieh" },
  { id: "mecca", name: "Mecca Street" },
];

describe("dashboard branch scope copy", () => {
  it("names the selected branch", () => {
    expect(dashboardScopeDescription(branches, "sweifieh")).toBe("Showing Sweifieh only.");
  });

  it("uses singular copy for one accessible branch", () => {
    expect(dashboardScopeDescription([branches[0]!])).toBe("Showing Abdoun.");
  });

  it("counts all accessible branches", () => {
    expect(dashboardScopeDescription(branches)).toBe("All 3 branches, consolidated.");
  });

  it("does not claim a branch while access is loading", () => {
    expect(dashboardScopeDescription([])).toBe("Loading your branch access.");
  });
});
