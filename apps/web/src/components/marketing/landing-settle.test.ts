import { describe, expect, it } from "vitest";
import { settleDuration, settleEase, settleReach, settleTarget, type SettleInput } from "./landing-settle";

const base = (overrides: Partial<SettleInput>): SettleInput => ({
  scrollY: 1000,
  viewportHeight: 900,
  barHeight: 72,
  maxScroll: 8000,
  edges: [],
  direction: 1,
  ...overrides,
});

describe("settleTarget", () => {
  it("finishes a downward scroll that stopped just short of a section", () => {
    // The section top sits 80px below the bar: within the forward reach at 900px.
    expect(settleTarget(base({ edges: [{ kind: "start", top: 152 }] }))).toBe(1080);
  });

  it("does not reach for a section that is far away", () => {
    expect(settleTarget(base({ edges: [{ kind: "start", top: 72 + 300 }] }))).toBeNull();
  });

  it("pulls back against the visitor only a short way", () => {
    // Scrolled down past the section by 60px: too far to drag back.
    expect(settleTarget(base({ edges: [{ kind: "start", top: 12 }] }))).toBeNull();
    // Past it by 20px: eased back under the bar.
    expect(settleTarget(base({ edges: [{ kind: "start", top: 52 }] }))).toBe(980);
  });

  it("leaves the page alone when an edge is already in place", () => {
    expect(settleTarget(base({ edges: [{ kind: "start", top: 73 }, { kind: "start", top: 140 }] }))).toBeNull();
  });

  it("chooses the nearest edge and settles the page end to the viewport bottom", () => {
    expect(settleTarget(base({ edges: [{ kind: "start", top: 170 }, { kind: "end", bottom: 950 }] }))).toBe(1050);
  });

  it("never moves past the ends of the page", () => {
    expect(settleTarget(base({ scrollY: 7990, edges: [{ kind: "start", top: 150 }] }))).toBe(8000);
    expect(settleTarget(base({ scrollY: 10, direction: -1, edges: [{ kind: "start", top: 72 - 30 }] }))).toBe(0);
  });

  it("uses the tighter reach when the direction is unknown", () => {
    expect(settleTarget(base({ direction: 0, edges: [{ kind: "start", top: 72 + 60 }] }))).toBeNull();
    expect(settleTarget(base({ direction: 0, edges: [{ kind: "start", top: 72 + 30 }] }))).toBe(1030);
  });
});

describe("settle motion", () => {
  it("scales the forward reach with the viewport within fixed bounds", () => {
    expect(settleReach(300).forward).toBe(40);
    expect(settleReach(900).forward).toBe(108);
    expect(settleReach(1600).forward).toBe(110);
  });

  it("keeps every move between a coast and a glide", () => {
    expect(settleDuration(2)).toBe(280);
    expect(settleDuration(110)).toBe(526);
    expect(settleDuration(400)).toBe(560);
  });

  it("eases out and stays within the move", () => {
    expect(settleEase(0)).toBe(0);
    expect(settleEase(1)).toBe(1);
    expect(settleEase(1.4)).toBe(1);
    expect(settleEase(0.5)).toBeGreaterThan(0.5);
  });
});
