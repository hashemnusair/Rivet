import { describe, expect, it } from "vitest";
import { flatten, samplePath } from "./sign-in-art-geometry";

const near = (actual: readonly [number, number], expected: [number, number]) => {
  expect(actual[0]).toBeCloseTo(expected[0], 1);
  expect(actual[1]).toBeCloseTo(expected[1], 1);
};

describe("sign-in drawing geometry", () => {
  it("samples an open line from end to end", () => {
    const points = samplePath("M0 0L90 0", 4, false);
    expect(points.map((p) => p[0])).toEqual([0, 30, 60, 90]);
  });

  it("samples a closed box all the way round without repeating its start", () => {
    const points = samplePath("M0 0H10V10H0Z", 4, true);
    near(points[0]!, [0, 0]);
    near(points[1]!, [10, 0]);
    near(points[2]!, [10, 10]);
    near(points[3]!, [0, 10]);
  });

  it("follows arcs on the side their sweep says", () => {
    // A ring drawn as two half circles, as the drawings draw them: left, then down round the bottom.
    const points = samplePath("M-10 0A10 10 0 1 0 10 0A10 10 0 1 0 -10 0Z", 4, true);
    near(points[0]!, [-10, 0]);
    near(points[1]!, [0, 10]);
    near(points[2]!, [10, 0]);
    near(points[3]!, [0, -10]);
  });

  it("reflects the last control point for a smooth curve", () => {
    const run = flatten("M0 0C0 10 10 10 10 0S20 -10 20 0");
    near(run[run.length - 1]!, [20, 0]);
    // The second half mirrors the first, so it dips below as far as the first rose.
    const lowest = Math.min(...run.map((p) => p[1]));
    const highest = Math.max(...run.map((p) => p[1]));
    expect(lowest).toBeCloseTo(-highest, 5);
  });
});
