import { describe, expect, it } from "vitest";
import { dashboardScope } from "./dashboard-scope";

const branches = [
  { id: "abdoun", name: "Abdoun" },
  { id: "sweifieh", name: "Sweifieh" },
  { id: "mecca", name: "Mecca Street" },
];

describe("dashboard branch scope", () => {
  it("names the selected branch", () => {
    expect(dashboardScope(branches, "sweifieh")).toEqual({ key: "selectedNamed", vars: { branch: "Sweifieh" } });
  });

  it("uses singular copy for one accessible branch", () => {
    expect(dashboardScope([branches[0]!])).toEqual({ key: "single", vars: { branch: "Abdoun" } });
  });

  it("counts all accessible branches", () => {
    expect(dashboardScope(branches)).toEqual({ key: "consolidated", vars: { count: 3 } });
  });

  it("does not claim a branch while access is loading", () => {
    expect(dashboardScope([])).toEqual({ key: "loading" });
  });
});
