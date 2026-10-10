import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DrawingLoop, SignInArt, withArt } from "./sign-in-art";

describe("sign-in drawings", () => {
  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("draws the door at rest where lines cannot be measured, and leaves no measuring behind", () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/login/member?art=account");
    const { container, unmount } = render(<SignInArt door="member" />);
    // The test DOM has no SVG geometry, so the page before's lines cannot move here.
    expect(container.querySelector("g[data-lines]")).toBeNull();
    expect(container.querySelectorAll("svg path").length).toBeGreaterThan(50);
    expect(window.location.search).toBe("");
    expect(() => act(() => vi.advanceTimersByTime(2_000))).not.toThrow();
    unmount();
  });

  it("keeps the first drawing where lines cannot move, and rests on the drawing it is asked to end on once drawn", () => {
    vi.useFakeTimers();
    const onRest = vi.fn();
    const { container, rerender } = render(<DrawingLoop pace={0.3} />);
    act(() => vi.advanceTimersByTime(5_000));
    expect(container.querySelector("g[data-lines]")).toBeNull();
    const drawn = container.innerHTML;

    rerender(<DrawingLoop pace={0.3} endOn="account" onRest={onRest} />);
    act(() => vi.advanceTimersByTime(0));
    expect(onRest).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe(drawn);
  });

  it("carries the door a link leaves from, keeping its other parameters", () => {
    expect(withArt("/login/gym", "account")).toBe("/login/gym?art=account");
    expect(withArt("/login/member?next=%2Fcustomer", "staff")).toBe("/login/member?next=%2Fcustomer&art=staff");
  });
});
