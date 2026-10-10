import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignInArt, withArt } from "./sign-in-art";

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

  it("moves the machine's pin into a clicked plate, and sinks the rope only under the lightest", () => {
    const { container } = render(<SignInArt door="account" />);
    const svg = container.querySelector("svg");
    const plate = (index: number) => container.querySelector(`[data-plate="${index}"]`) as Element;
    const pin = () => container.querySelector("[data-pin]");
    const redPlates = () => Array.from(container.querySelectorAll("[data-plate]")).filter((el) => el.querySelector("[data-on]")).map((el) => el.getAttribute("data-plate"));
    const stack = Array.from(container.querySelectorAll("svg path")).map((path) => path.getAttribute("d"));

    // At rest it is the mark: the pin in the fifth plate, the rope hanging where it was drawn.
    expect(container.querySelectorAll("[data-plate]")).toHaveLength(8);
    expect(pin()?.getAttribute("data-pin")).toBe("4");
    expect(redPlates()).toEqual(["4"]);
    expect(svg?.hasAttribute("data-rope")).toBe(false);
    expect(svg?.getAttribute("aria-hidden")).toBe("true");

    // A wide plate takes the pin straight down; a narrow one draws it in to its shorter edge.
    fireEvent.click(plate(6));
    expect(pin()?.getAttribute("style")).toContain("translate(0px, 48px)");
    expect(redPlates()).toEqual(["6"]);
    expect(svg?.hasAttribute("data-rope")).toBe(false);
    fireEvent.click(plate(1));
    expect(pin()?.getAttribute("style")).toContain("translate(-26px, -72px)");
    expect(svg?.hasAttribute("data-rope")).toBe(false);

    // The lightest plate: the rope sinks and the plate rises by the same length of cable.
    fireEvent.click(plate(0));
    expect(svg?.getAttribute("data-rope")).toBe("sunk");
    expect(plate(0).getAttribute("style")).toContain("translateY(-32px)");
    expect(container.querySelector("[class*='sway']")?.parentElement?.getAttribute("style")).toContain("translateY(32px)");

    // Any heavier plate pulls it back.
    fireEvent.click(plate(4));
    expect(svg?.getAttribute("data-rope")).toBe("raised");
    expect(plate(0).getAttribute("style") ?? "").not.toContain("translateY");
    expect(redPlates()).toEqual(["4"]);
    // The lines themselves never change, only where the parts sit.
    expect(Array.from(container.querySelectorAll("svg path")).map((path) => path.getAttribute("d"))).toEqual(stack);
  });

  it("carries the door a link leaves from, keeping its other parameters", () => {
    expect(withArt("/login/gym", "account")).toBe("/login/gym?art=account");
    expect(withArt("/login/member?next=%2Fcustomer", "staff")).toBe("/login/member?next=%2Fcustomer&art=staff");
  });
});
