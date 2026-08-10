import { describe, expect, it } from "vitest";
import { refreshFailureState } from "./experience-refresh";

describe("experience refresh recovery", () => {
  it("fails closed when the first live snapshot cannot be loaded", () => {
    expect(refreshFailureState(false, "Convex unavailable")).toEqual({
      status: "error",
      message: "Convex unavailable",
      showStaleNotice: false,
    });
  });

  it("keeps a rendered snapshot and exposes a stale notice after a refresh failure", () => {
    expect(refreshFailureState(true, "Temporary network failure")).toEqual({
      status: "ready",
      message: "Temporary network failure",
      showStaleNotice: true,
    });
  });
});
