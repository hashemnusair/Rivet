import { describe, expect, it } from "vitest";
import { hasVisibleBranch, visibleBranchId } from "./branch-scope";

const branches = [{ id: "abdoun" }, { id: "sweifieh" }];

describe("branch scope helpers", () => {
  it("accepts only a concrete visible branch", () => {
    expect(visibleBranchId(branches, "sweifieh")).toBe("sweifieh");
    expect(visibleBranchId(branches, "all")).toBeUndefined();
    expect(visibleBranchId(branches, "missing")).toBeUndefined();
    expect(visibleBranchId(branches, " ")).toBeUndefined();
  });

  it("treats missing or stale selections as unavailable", () => {
    expect(hasVisibleBranch(branches, undefined)).toBe(false);
    expect(hasVisibleBranch(branches, "removed-branch")).toBe(false);
    expect(hasVisibleBranch([], "abdoun")).toBe(false);
  });
});
