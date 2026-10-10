import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageSheet, SheetLink, startSheet } from "./page-sheet";
import { IDLE_SHEET, sheetCarries, sheetRoute, sheetStore } from "./sheet-store";

const nav = vi.hoisted(() => ({ pathname: "/", push: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, prefetch: nav.prefetch }),
}));
vi.mock("@/app/login/sign-in-art", () => ({ DrawingLoop: () => <svg data-testid="sheet-drawing" /> }));

const html = document.documentElement;

describe("page sheet", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
    window.history.replaceState(null, "", "/");
    nav.pathname = "/";
    nav.push.mockClear();
    nav.prefetch.mockClear();
  });

  afterEach(() => {
    act(() => sheetStore.set(IDLE_SHEET));
    html.removeAttribute("data-page-covered");
    html.removeAttribute("data-sheet-docking");
    vi.useRealTimers();
  });

  it("goes only to the public pages, and lands its drawing only on sign-in", () => {
    expect(sheetRoute("/login")).toEqual({ dock: "account" });
    expect(sheetRoute("/terms")).toEqual({});
    expect(sheetRoute("/dashboard")).toBeNull();
    expect(sheetRoute("/login/gym")).toBeNull();
  });

  it("leaves navigation alone when nothing is mounted to play a sheet", () => {
    expect(startSheet("/login")).toBe(false);
    expect(sheetStore.get().phase).toBe("idle");
  });

  it("starts only for another sheet page on this origin, and one at a time", () => {
    render(<PageSheet />);
    expect(startSheet("/")).toBe(false);
    expect(startSheet("/dashboard")).toBe(false);
    expect(startSheet("https://elsewhere.example/login")).toBe(false);
    expect(sheetStore.get().phase).toBe("idle");

    act(() => {
      expect(startSheet("/login?next=%2Fmembers")).toBe(true);
    });
    expect(sheetStore.get()).toMatchObject({ phase: "rack", target: "/login?next=%2Fmembers", from: "/", dock: "account" });
    expect(startSheet("/terms")).toBe(false);
  });

  it("covers the page, navigates under it, and lifts once the next page is there", () => {
    const { rerender } = render(<PageSheet />);
    act(() => {
      startSheet("/terms");
    });
    expect(document.querySelector("[data-page-sheet='rack']")).toBeInTheDocument();
    // No words on the sheet: only the drawing.
    expect(document.querySelector("[data-page-sheet]")?.textContent).toBe("");
    expect(nav.push).not.toHaveBeenCalled();

    // Covered: the router goes, and the next page knows it is under the sheet.
    act(() => vi.advanceTimersByTime(600));
    expect(nav.push).toHaveBeenCalledWith("/terms");
    expect(sheetStore.get().phase).toBe("hold");
    expect(html).toHaveAttribute("data-page-covered");
    expect(html).not.toHaveAttribute("data-sheet-docking");

    // Still on the old page: the sheet holds.
    act(() => vi.advanceTimersByTime(2_000));
    expect(sheetStore.get().phase).toBe("hold");

    nav.pathname = "/terms";
    rerender(<PageSheet />);
    act(() => vi.advanceTimersByTime(100));
    expect(sheetStore.get().phase).toBe("lift");
    expect(html).not.toHaveAttribute("data-page-covered");
    expect(document.querySelector("[data-page-sheet='lift']")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(800));
    expect(sheetStore.get().phase).toBe("idle");
    expect(document.querySelector("[data-page-sheet]")).toBeNull();
  });

  it("tells the sign-in page its drawing is on the way, and stops when no panel is there to land on", () => {
    const { rerender } = render(<PageSheet />);
    act(() => {
      startSheet("/login");
    });
    expect(sheetCarries("account")).toBe(true);
    expect(sheetCarries("staff")).toBe(false);
    act(() => vi.advanceTimersByTime(600));
    expect(html).toHaveAttribute("data-sheet-docking");

    nav.pathname = "/login";
    rerender(<PageSheet />);
    act(() => vi.advanceTimersByTime(1_300));
    expect(sheetStore.get()).toMatchObject({ phase: "lift", landing: false });
    expect(html).not.toHaveAttribute("data-sheet-docking");
    act(() => vi.advanceTimersByTime(800));
    expect(sheetCarries("account")).toBe(false);
  });

  it("is a plain link for anything but a sheet page, and for the browser's own clicks", () => {
    render(
      <>
        <PageSheet />
        <SheetLink href="/privacy">Privacy policy</SheetLink>
      </>,
    );
    const link = screen.getByRole("link", { name: "Privacy policy" });
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    expect(sheetStore.get().phase).toBe("idle");

    let notCancelled = true;
    act(() => {
      notCancelled = fireEvent.click(link);
    });
    expect(notCancelled).toBe(false);
    expect(sheetStore.get()).toMatchObject({ phase: "rack", target: "/privacy" });
  });

  it("clears itself when the page comes back from the back-forward cache", () => {
    render(<PageSheet />);
    act(() => {
      startSheet("/privacy");
    });
    act(() => vi.advanceTimersByTime(600));
    act(() => {
      const event = new Event("pageshow") as PageTransitionEvent;
      Object.defineProperty(event, "persisted", { value: true });
      window.dispatchEvent(event);
    });
    expect(sheetStore.get().phase).toBe("idle");
    expect(html).not.toHaveAttribute("data-page-covered");
  });

  it.each([0, 600])("cancels navigation and its cover on Back/Forward after %ims", (elapsed) => {
    render(<PageSheet />);
    act(() => { startSheet("/login"); });
    act(() => vi.advanceTimersByTime(elapsed));
    const pushes = nav.push.mock.calls.length;
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    act(() => vi.advanceTimersByTime(2_000));
    expect(nav.push).toHaveBeenCalledTimes(pushes);
    expect(sheetStore.get().phase).toBe("idle");
    expect(html).not.toHaveAttribute("data-page-covered");
    expect(html).not.toHaveAttribute("data-sheet-docking");
  });
});
