import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceCurtain } from "./workspace-curtain";

describe("WorkspaceCurtain", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("never shows over a shell that is ready on its first render", () => {
    render(<WorkspaceCurtain ready label="Loading your gym" />);
    expect(screen.queryByTestId("workspace-curtain")).toBeNull();
  });

  it("is the page's status while it waits, and stops being one the moment the shell is ready", () => {
    const { rerender } = render(<WorkspaceCurtain ready={false} label="Loading your gym" />);
    expect(screen.getByRole("status", { name: "Loading your gym" })).toBeInTheDocument();
    expect(screen.getByTestId("workspace-curtain").querySelectorAll("rect")).toHaveLength(12);

    rerender(<WorkspaceCurtain ready label="Loading your gym" />);
    expect(screen.queryByRole("status", { name: "Loading your gym" })).toBeNull();
    expect(screen.getByTestId("workspace-curtain")).toHaveAttribute("aria-hidden", "true");

    act(() => vi.advanceTimersByTime(200));
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.queryByTestId("workspace-curtain")).toBeNull();
  });

  it("covers again if the workspace stops being ready", () => {
    const { rerender } = render(<WorkspaceCurtain ready={false} label="Checking access" />);
    rerender(<WorkspaceCurtain ready label="Checking access" />);
    act(() => vi.advanceTimersByTime(1_500));
    rerender(<WorkspaceCurtain ready={false} label="Checking access" />);
    expect(screen.getByRole("status", { name: "Checking access" })).toBeInTheDocument();
  });

  it("uncovers a ready workspace immediately when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    const { rerender } = render(<WorkspaceCurtain ready={false} label="Loading your gym" />);
    expect(screen.getByRole("status", { name: "Loading your gym" })).toBeInTheDocument();
    rerender(<WorkspaceCurtain ready label="Loading your gym" />);
    expect(screen.queryByTestId("workspace-curtain")).toBeNull();

    rerender(<WorkspaceCurtain ready={false} label="Loading your gym" />);
    expect(screen.getByRole("status", { name: "Loading your gym" })).toBeInTheDocument();
    rerender(<WorkspaceCurtain ready label="Loading your gym" />);
    expect(screen.queryByTestId("workspace-curtain")).toBeNull();
  });
});
