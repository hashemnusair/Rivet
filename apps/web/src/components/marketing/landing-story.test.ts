import { describe, expect, it } from "vitest";
import { resolveLandingHash } from "./cinematic-header";
import { RIG, STACK_ITEMS, STACK_TIMELINE, plateCentre, plateRight, seatedTip, stackPoseAt, travelTip } from "./landing-story";

const last = STACK_ITEMS.length - 1;

describe("stack pin pose", () => {
  it("starts home in the first plate and ends home in the last, lifted toward the stub", () => {
    const start = stackPoseAt(0);
    expect(start).toMatchObject({ plate: 0, engaged: 0, seated: true, lift: 0, finale: 0 });
    expect(start.tipX).toBe(seatedTip(0));
    expect(start.y).toBe(plateCentre(0));

    const end = stackPoseAt(1);
    expect(end).toMatchObject({ plate: last, engaged: last, seated: true, finale: 1 });
    expect(end.tipX).toBe(seatedTip(last));
    expect(end.lift).toBeCloseTo(-RIG.lift);
    // The lifted load still clears the return stub.
    expect(RIG.plate.top + end.lift).toBeGreaterThan(RIG.stub.bottom);
  });

  it("moves continuously: no leg of the path joins with a jump, forwards or backwards", () => {
    const samples = 6000;
    let previous = stackPoseAt(0);
    let largestStep = 0;
    for (let index = 1; index <= samples; index += 1) {
      const pose = stackPoseAt(index / samples);
      largestStep = Math.max(largestStep, Math.abs(pose.tipX - previous.tipX), Math.abs(pose.y + pose.lift - (previous.y + previous.lift)));
      previous = pose;
    }
    // The longest move covers about 370 viewBox units over 7% of the track, so
    // a 1/6000 step is well under two units; anything larger is a teleport.
    expect(largestStep).toBeLessThan(2.5);
    // A pure function of progress reads the same in reverse.
    expect(stackPoseAt(0.4321)).toEqual(stackPoseAt(0.4321));
  });

  it("only travels down the clear lane: the rod tip never crosses a plate between rows", () => {
    for (let index = 0; index <= 4000; index += 1) {
      const pose = stackPoseAt(index / 4000);
      const onRow = STACK_ITEMS.some((_, plate) => Math.abs(pose.y - plateCentre(plate)) < 0.01);
      if (!onRow) expect(pose.tipX).toBeGreaterThanOrEqual(travelTip() - 0.01);
    }
  });

  it("switches the description exactly when the rod tip meets the plate it is entering", () => {
    let previous = stackPoseAt(0);
    const switches: number[] = [];
    for (let index = 1; index <= 8000; index += 1) {
      const pose = stackPoseAt(index / 8000);
      if (pose.engaged !== previous.engaged) {
        expect(pose.engaged).toBe(previous.engaged + 1);
        expect(pose.tipX).toBeLessThanOrEqual(plateRight(pose.engaged) + 0.5);
        expect(previous.tipX).toBeGreaterThan(plateRight(pose.engaged) - 3);
        switches.push(index / 8000);
      }
      previous = pose;
    }
    expect(switches).toHaveLength(last);
  });

  it("rests in every plate for the whole dwell, with the rod home in the hole", () => {
    const { lead, dwell, move } = STACK_TIMELINE;
    for (let plate = 0; plate <= last; plate += 1) {
      const start = lead + plate * (dwell + move);
      for (const at of [start + 0.001, start + dwell / 2, start + dwell - 0.001]) {
        const pose = stackPoseAt(at);
        expect(pose).toMatchObject({ plate, engaged: plate, seated: true });
        // The hole sits under the hidden rod.
        const holeX = plateRight(plate) - RIG.hole.inset;
        expect(holeX).toBeGreaterThan(pose.tipX);
        expect(holeX).toBeLessThan(pose.tipX + RIG.pin.rod);
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
