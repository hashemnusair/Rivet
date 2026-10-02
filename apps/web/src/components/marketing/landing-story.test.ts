import { describe, expect, it } from "vitest";
import { resolveLandingHash } from "./cinematic-header";
import {
  RIG,
  STACK_ITEMS,
  STACK_PACE,
  clearTip,
  moveDuration,
  pathLength,
  pinPath,
  plateCentre,
  plateRight,
  plateTop,
  poseAlong,
  seatedPose,
  seatedTip,
  type PinPose,
} from "./landing-story";

const last = STACK_ITEMS.length - 1;
const narrowLast = RIG.plate.narrowCount - 1;
const firstWide = RIG.plate.narrowCount;

/** Poses at even steps along a path. */
function sample(points: PinPose[], steps = 2000): PinPose[] {
  const length = pathLength(points);
  return Array.from({ length: steps + 1 }, (_, index) => poseAlong(points, (length * index) / steps));
}

/** The rows a plate occupies, widened by the rod's half height. */
function plateBand(index: number): [number, number] {
  const top = plateTop(index);
  return [top - RIG.pin.rodHeight / 2, top + RIG.plate.height + RIG.pin.rodHeight / 2];
}

describe("stack pin path", () => {
  it("rests home in every plate with the hole under the hidden rod", () => {
    for (let plate = 0; plate <= last; plate += 1) {
      const pose = seatedPose(plate);
      expect(pose.tipX).toBe(plateRight(plate) - RIG.pin.rod);
      expect(pose.y).toBe(plateCentre(plate));
      const holeX = plateRight(plate) - RIG.hole.inset;
      expect(holeX).toBeGreaterThan(pose.tipX);
      expect(holeX).toBeLessThan(pose.tipX + RIG.pin.rod);
    }
  });

  it("withdraws the same distance from a narrow plate's opening as from a wide one's", () => {
    const narrow = pinPath(seatedPose(0), 1);
    const wide = pinPath(seatedPose(firstWide), firstWide + 1);
    expect(narrow[1]).toEqual({ tipX: clearTip(0), y: plateCentre(0) });
    expect(wide[1]).toEqual({ tipX: clearTip(firstWide), y: plateCentre(firstWide) });
    expect(narrow[1]!.tipX - narrow[0]!.tipX).toBe(wide[1]!.tipX - wide[0]!.tipX);
    expect(clearTip(0) - plateRight(0)).toBe(RIG.pin.clearance);
    expect(clearTip(firstWide) - plateRight(firstWide)).toBe(RIG.pin.clearance);
    // The narrow lane is well inside the wide plates' edge: it is not one fixed lane for the stack.
    expect(clearTip(0)).toBeLessThan(plateRight(firstWide));
  });

  it("retracts further to pass a wider plate when crossing between the narrow and wide groups", () => {
    const down = pinPath(seatedPose(narrowLast), firstWide);
    expect(down[1]!.tipX).toBe(clearTip(firstWide));
    const up = pinPath(seatedPose(firstWide), narrowLast);
    expect(up[1]!.tipX).toBe(clearTip(firstWide));
    // Wide to wide needs no more than the wide clearance itself.
    expect(pinPath(seatedPose(firstWide), last)[1]!.tipX).toBe(clearTip(firstWide));
  });

  it("goes withdraw, travel, insert, with the rod clear of every plate it passes", () => {
    const cases: Array<[number, number]> = [[0, 1], [narrowLast, firstWide], [last, 0], [1, 4], [5, 2], [0, last]];
    for (const [from, to] of cases) {
      const points = pinPath(seatedPose(from), to);
      expect(points).toHaveLength(4);
      expect(points[1]!.y).toBe(plateCentre(from));
      expect(points[2]!.tipX).toBe(points[1]!.tipX);
      expect(points[2]!.y).toBe(plateCentre(to));
      expect(points[3]).toEqual(seatedPose(to));
      for (const pose of sample(points)) {
        for (let plate = 0; plate <= last; plate += 1) {
          if (plate === from || plate === to) continue;
          const [top, bottom] = plateBand(plate);
          if (pose.y >= top && pose.y <= bottom) {
            expect(pose.tipX).toBeGreaterThanOrEqual(plateRight(plate) + RIG.pin.clearance - 0.01);
          }
        }
      }
    }
  });

  it("continues from wherever the pin is when another plate is chosen mid-move", () => {
    // Mid-travel in the wide lane, asked for a plate above: no second withdrawal.
    const midTravel = { tipX: clearTip(last), y: (plateCentre(2) + plateCentre(3)) / 2 };
    const back = pinPath(midTravel, 1);
    expect(back[0]).toEqual(midTravel);
    expect(back).toHaveLength(3);
    expect(back[1]).toEqual({ tipX: clearTip(last), y: plateCentre(1) });
    expect(back[2]).toEqual(seatedPose(1));
    // Half withdrawn from a plate and sent back into it: straight home.
    const halfOut = { tipX: seatedTip(0) + 30, y: plateCentre(0) };
    expect(pinPath(halfOut, 0)).toEqual([halfOut, seatedPose(0)]);
    // Already home: nothing to do.
    expect(pathLength(pinPath(seatedPose(4), 4))).toBe(0);
  });

  it("paces a move by its length and moves without a jump between legs", () => {
    const short = pathLength(pinPath(seatedPose(0), 1));
    const long = pathLength(pinPath(seatedPose(last), 0));
    expect(long).toBeGreaterThan(short * 2);
    expect(moveDuration(short)).toBeGreaterThanOrEqual(STACK_PACE.minMs);
    expect(moveDuration(short)).toBeLessThan(moveDuration(long));
    expect(moveDuration(long)).toBe(STACK_PACE.maxMs);

    const poses = sample(pinPath(seatedPose(last), 0));
    let largest = 0;
    for (let index = 1; index < poses.length; index += 1) {
      largest = Math.max(largest, Math.hypot(poses[index]!.tipX - poses[index - 1]!.tipX, poses[index]!.y - poses[index - 1]!.y));
    }
    expect(largest).toBeLessThan(long / 2000 + 0.01);
  });
});

describe("landing anchors", () => {
  it("sends retired anchors to the section that now carries that content", () => {
    expect(resolveLandingHash("#modules")).toBe("#product");
    expect(resolveLandingHash("#network")).toBe("#member");
    expect(resolveLandingHash("#pricing")).toBe("#pricing");
  });
});
