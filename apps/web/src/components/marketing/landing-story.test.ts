import { describe, expect, it } from "vitest";
import { resolveLandingHash } from "./cinematic-header";
import { RIG, STACK_ITEMS, STACK_TIMELINE, plateCentre, plateRight, restingRingLeft, stackPoseAt, type RigGeometry } from "./landing-story";

const geometry: RigGeometry = { width: 480, height: 527, rod: 48, gap: 14 };
const last = STACK_ITEMS.length - 1;

describe("stack pin pose", () => {
  it("starts home in the first plate and ends home in the last, lifted", () => {
    const start = stackPoseAt(0, geometry);
    expect(start).toMatchObject({ plate: 0, engaged: 0, seated: true, lift: 0, finale: 0 });
    expect(start.ringLeft).toBeCloseTo(plateRight(0, geometry.width));

    const end = stackPoseAt(1, geometry);
    expect(end).toMatchObject({ plate: last, engaged: last, seated: true, finale: 1 });
    expect(end.ringLeft).toBeCloseTo(plateRight(last, geometry.width));
    expect(end.lift).toBeCloseTo(-geometry.height * RIG.lift);
  });

  it("moves continuously: no leg of the path joins with a jump, forwards or backwards", () => {
    const samples = 6000;
    let previous = stackPoseAt(0, geometry);
    let largestStep = 0;
    for (let index = 1; index <= samples; index += 1) {
      const pose = stackPoseAt(index / samples, geometry);
      largestStep = Math.max(largestStep, Math.abs(pose.ringLeft - previous.ringLeft), Math.abs(pose.y + pose.lift - (previous.y + previous.lift)));
      previous = pose;
    }
    // The fastest leg covers a few hundred rig pixels over 7% of the track, so
    // a 1/6000 step is well under two pixels; anything larger is a teleport.
    expect(largestStep).toBeLessThan(2.5);
    // A pure function of progress reads the same in reverse.
    expect(stackPoseAt(0.4321, geometry)).toEqual(stackPoseAt(0.4321, geometry));
  });

  it("only travels down the clear lane: the rod tip never crosses a plate between rows", () => {
    const clear = restingRingLeft(geometry) - geometry.rod;
    for (let index = 0; index <= 4000; index += 1) {
      const pose = stackPoseAt(index / 4000, geometry);
      const onRow = STACK_ITEMS.some((_, plate) => Math.abs(pose.y - plateCentre(plate, geometry.height)) < 0.01);
      if (!onRow) expect(pose.ringLeft - geometry.rod).toBeGreaterThanOrEqual(clear - 0.01);
    }
  });

  it("switches the description exactly when the rod tip meets the plate it is entering", () => {
    let previous = stackPoseAt(0, geometry);
    const switches: number[] = [];
    for (let index = 1; index <= 8000; index += 1) {
      const pose = stackPoseAt(index / 8000, geometry);
      if (pose.engaged !== previous.engaged) {
        expect(pose.engaged).toBe(previous.engaged + 1);
        // At the switch the tip is at the plate's edge, give or take one sample.
        expect(pose.ringLeft - geometry.rod).toBeLessThanOrEqual(plateRight(pose.engaged, geometry.width) + 0.5);
        expect(previous.ringLeft - geometry.rod).toBeGreaterThan(plateRight(pose.engaged, geometry.width) - 3);
        switches.push(index / 8000);
      }
      previous = pose;
    }
    expect(switches).toHaveLength(last);
  });

  it("rests in every plate for the whole dwell", () => {
    const { lead, dwell, move } = STACK_TIMELINE;
    for (let plate = 0; plate <= last; plate += 1) {
      const start = lead + plate * (dwell + move);
      for (const at of [start + 0.001, start + dwell / 2, start + dwell - 0.001]) {
        expect(stackPoseAt(at, geometry)).toMatchObject({ plate, engaged: plate, seated: true });
      }
    }
  });
});

describe("landing anchors", () => {
  it("sends retired anchors to the section that now carries that content", () => {
    expect(resolveLandingHash("#modules")).toBe("#product");
    expect(resolveLandingHash("#network")).toBe("#member");
    expect(resolveLandingHash("#pricing")).toBe("#pricing");
  });
});
