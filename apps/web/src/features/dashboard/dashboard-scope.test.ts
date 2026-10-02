import { describe, expect, it } from "vitest";
import { dashboardScope, dashboardScopeDescription, timeOfDayGreeting, timeOfDayPart } from "./dashboard-scope";

const branches = [
  { id: "abdoun", name: "Abdoun" },
  { id: "sweifieh", name: "Sweifieh" },
  { id: "mecca", name: "Mecca Street" },
];

describe("dashboard branch scope", () => {
  it("names the selected branch", () => {
    expect(dashboardScope(branches, "sweifieh")).toEqual({ key: "selectedNamed", vars: { branch: "Sweifieh" } });
  });

  it("does not name a branch it cannot find", () => {
    expect(dashboardScope(branches, "missing")).toEqual({ key: "selectedUnnamed" });
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

describe("dashboard scope copy in English", () => {
  it("renders the same sentences as before", () => {
    expect(dashboardScopeDescription(branches, "sweifieh")).toBe("Showing Sweifieh only.");
    expect(dashboardScopeDescription(branches, "missing")).toBe("Showing selected branch only.");
    expect(dashboardScopeDescription([branches[0]!])).toBe("Showing Abdoun.");
    expect(dashboardScopeDescription(branches)).toBe("All 3 branches together.");
    expect(dashboardScopeDescription([])).toBe("Loading your branches.");
  });

  it("greets by the hour", () => {
    expect(timeOfDayPart(new Date(2026, 9, 1, 9))).toBe("morning");
    expect(timeOfDayGreeting(new Date(2026, 9, 1, 13))).toBe("Good afternoon");
    expect(timeOfDayGreeting(new Date(2026, 9, 1, 20))).toBe("Good evening");
  });

  it("uses the gym timezone at its local day boundary", () => {
    expect(timeOfDayPart(new Date("2026-10-03T21:30:00.000Z"), "Asia/Amman")).toBe("morning");
  });
});
