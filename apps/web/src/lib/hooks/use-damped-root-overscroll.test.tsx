import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDampedRootOverscroll } from "./use-damped-root-overscroll";

function mediaQuery(media: string, matches = false) {
  return Object.assign(new EventTarget(), { media, matches, onchange: null, addListener: vi.fn(), removeListener: vi.fn() }) as MediaQueryList;
}

describe("root overscroll gesture isolation and recovery", () => {
  let shell: HTMLDivElement;
  let coarse: MediaQueryList;
  let frames: Map<number, FrameRequestCallback>;
  let sequence: number;

  beforeEach(() => {
    shell = document.createElement("div");
    document.body.append(shell);
    coarse = mediaQuery("(pointer: coarse)");
    frames = new Map();
    sequence = 0;
    vi.spyOn(window, "matchMedia").mockImplementation((query) => query === coarse.media ? coarse : mediaQuery(query));
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.set(++sequence, callback);
      return sequence;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
  });
  afterEach(() => {
    shell.remove();
    vi.restoreAllMocks();
  });

  const wheel = (deltaX: number, deltaY: number) => {
    const event = new WheelEvent("wheel", { deltaX, deltaY, cancelable: true });
    act(() => { window.dispatchEvent(event); });
    return event;
  };

  it("leaves horizontal trackpad gestures and their vertical noise to the nested tab strip", () => {
    renderHook(() => useDampedRootOverscroll({ current: shell }, true));
    expect(wheel(160, -3).defaultPrevented).toBe(false);
    expect(wheel(-160, 3).defaultPrevented).toBe(false);
    expect(shell.style.transform).toBe("");
    expect(frames.size).toBe(0);
  });

  it.each([1000 / 120, 1000 / 60, 1000 / 30, 100, 250, 1000])("keeps the page bounded and settles after %dms frame intervals", (interval) => {
    renderHook(() => useDampedRootOverscroll({ current: shell }, true));
    expect(wheel(0, -240).defaultPrevented).toBe(true);
    expect(shell.style.transform).toContain("7px");
    let timestamp = 0;
    for (let frame = 0; frame < 150 && frames.size; frame++) {
      const callbacks = [...frames.values()];
      frames.clear();
      timestamp += interval;
      act(() => { callbacks.forEach((callback) => callback(timestamp)); });
      if (shell.style.transform) {
        const offset = Number(shell.style.transform.match(/,\s*([^,]+)px,/)?.[1]);
        expect(Number.isFinite(offset)).toBe(true);
        expect(Math.abs(offset)).toBeLessThanOrEqual(7);
      }
    }
    expect(frames.size).toBe(0);
    expect(shell.style.transform).toBe("");
    expect(shell.style.willChange).toBe("");
  });

  it("switches to native scrolling immediately when phone emulation is enabled mid-pull", () => {
    renderHook(() => useDampedRootOverscroll({ current: shell }, true));
    wheel(0, -240);
    expect(frames.size).toBe(1);
    act(() => {
      Object.defineProperty(coarse, "matches", { value: true, configurable: true });
      coarse.dispatchEvent(new Event("change"));
    });
    expect(shell.dataset.overscrollMode).toBe("native");
    expect(frames.size).toBe(0);
    expect(shell.style.transform).toBe("");
    expect(wheel(0, -240).defaultPrevented).toBe(false);
  });

  it("does not intercept native touch gestures even on a fine-pointer host", () => {
    renderHook(() => useDampedRootOverscroll({ current: shell }, true));
    const start = new Event("touchstart", { cancelable: true });
    Object.defineProperty(start, "touches", { value: [{ clientX: 300, clientY: 200 }] });
    const move = new Event("touchmove", { cancelable: true });
    Object.defineProperty(move, "touches", { value: [{ clientX: 100, clientY: 210 }] });
    act(() => { window.dispatchEvent(start); window.dispatchEvent(move); });
    expect(move.defaultPrevented).toBe(false);
    expect(shell.style.transform).toBe("");
  });
});
