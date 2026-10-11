import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageSheet, SheetLink, startSheet } from "./page-sheet";
import { IDLE_SHEET, sheetCarries, sheetRoute, sheetStore, sheetTarget } from "./sheet-store";
import { SHEET_ENTRY_ID, SHEET_ENTRY_PRE_PAINT } from "./sheet-entry";

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
    document.getElementById(SHEET_ENTRY_ID)?.remove();
    vi.useRealTimers();
  });

  it("goes only to the public pages, and lands its drawing only on sign-in", () => {
    expect(sheetRoute("/login")).toEqual({ dock: "account" });
    expect(sheetRoute("/terms")).toEqual({});
    expect(sheetRoute("/dashboard")).toBeNull();
    expect(sheetRoute("/login/gym")).toEqual({ dock: "staff" });
    expect(sheetRoute("/login/member")).toEqual({ dock: "member" });
    expect(sheetRoute("/login/member/create")).toEqual({ dock: "member" });
    expect(sheetRoute("/login/admin")).toEqual({ dock: "admin" });
  });

  it("resolves production doors and home across hosts without losing the continuation", () => {
    expect(sheetTarget("/login/gym?next=%2Fmembers&art=account", "https://www.rivetjo.com/login")).toBe("https://dashboard.rivetjo.com/login/gym?next=%2Fmembers&art=account");
    expect(sheetTarget("/login/member", "https://www.rivetjo.com/login")).toBe("https://app.rivetjo.com/login/member");
    expect(sheetTarget("https://www.rivetjo.com/#pricing", "https://app.rivetjo.com/login/member")).toBe("https://www.rivetjo.com/#pricing");
    expect(sheetTarget("/login/gym", "http://localhost:3210/login")).toBe("/login/gym");
    expect(sheetTarget("https://unrelated.example/", "https://app.rivetjo.com/login/member")).toBeNull();
    expect(sheetTarget("https://www.rivetjo.com.attacker.example/", "https://app.rivetjo.com/login/member")).toBeNull();
    expect(sheetTarget("javascript:alert(1)", "https://www.rivetjo.com/login")).toBeNull();
  });

  it.each(["https://www.rivetjo.com/", "https://dashboard.rivetjo.com/login/gym", "https://app.rivetjo.com/login/member?art=account"])("covers a fresh document before hydration and releases it safely: %s", (href) => {
    new Function("location", "matchMedia", SHEET_ENTRY_PRE_PAINT)(new URL(href), () => ({ matches: false }));
    expect(document.getElementById(SHEET_ENTRY_ID)?.textContent).toContain("background:#0b0a08");
    act(() => vi.advanceTimersByTime(12_000));
    expect(document.getElementById(SHEET_ENTRY_ID)).toBeNull();
  });

  it("does not cover reduced motion or an app-host workspace root", () => {
    const run = new Function("location", "matchMedia", SHEET_ENTRY_PRE_PAINT);
    run(new URL("https://www.rivetjo.com/"), () => ({ matches: true }));
    expect(document.getElementById(SHEET_ENTRY_ID)).toBeNull();
    run(new URL("https://dashboard.rivetjo.com/"), () => ({ matches: false }));
    expect(document.getElementById(SHEET_ENTRY_ID)).toBeNull();
  });

  it("takes over the document cover without another navigation", () => {
    new Function("location", "matchMedia", SHEET_ENTRY_PRE_PAINT)(new URL("https://www.rivetjo.com/"), () => ({ matches: false }));
    render(<PageSheet />);
    act(() => vi.advanceTimersByTime(20));
    expect(document.getElementById(SHEET_ENTRY_ID)).toBeNull();
    expect(sheetStore.get()).toMatchObject({ phase: "hold", from: "", target: "/" });
    act(() => vi.advanceTimersByTime(1_000));
    expect(sheetStore.get().phase).toBe("lift");
    act(() => vi.advanceTimersByTime(500));
    expect(sheetStore.get().phase).toBe("idle");
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("holds a prerendered page's cover until the visitor activates it", () => {
    Object.defineProperty(document, "prerendering", { configurable: true, value: true });
    try {
      new Function("location", "matchMedia", SHEET_ENTRY_PRE_PAINT)(new URL("https://www.rivetjo.com/"), () => ({ matches: false }));
      render(<PageSheet />);
      act(() => vi.advanceTimersByTime(20_000));
      expect(document.getElementById(SHEET_ENTRY_ID)).not.toBeNull();
      expect(sheetStore.get().phase).toBe("idle");
      Object.defineProperty(document, "prerendering", { configurable: true, value: false });
      act(() => document.dispatchEvent(new Event("prerenderingchange")));
      act(() => vi.advanceTimersByTime(20));
      expect(document.getElementById(SHEET_ENTRY_ID)).toBeNull();
      expect(sheetStore.get()).toMatchObject({ phase: "hold", target: "/" });
      expect(nav.push).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(document, "prerendering");
    }
  });

  it("animates a plain router or history arrival home without pushing another entry", () => {
    window.history.replaceState(null, "", "/login/gym");
    nav.pathname = "/login/gym";
    const { rerender } = render(<PageSheet />);
    window.history.replaceState(null, "", "/");
    nav.pathname = "/";
    rerender(<PageSheet />);
    expect(sheetStore.get()).toMatchObject({ phase: "hold", target: "/" });
    expect(nav.push).not.toHaveBeenCalled();
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

  it("replaces a stale departure with an arrival when home comes back from the back-forward cache", () => {
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
    expect(sheetStore.get()).toMatchObject({ phase: "hold", target: "/", from: "" });
    act(() => vi.advanceTimersByTime(1_000));
    act(() => vi.advanceTimersByTime(500));
    expect(sheetStore.get().phase).toBe("idle");
    expect(html).not.toHaveAttribute("data-page-covered");
  });

  it.each([0, 600])("cancels navigation and its cover on Back/Forward after %ims", (elapsed) => {
    window.history.replaceState(null, "", "/privacy");
    nav.pathname = "/privacy";
    render(<PageSheet />);
    act(() => { startSheet("/login"); });
    act(() => vi.advanceTimersByTime(elapsed));
    const pushes = nav.push.mock.calls.length;
    window.history.replaceState(null, "", "/");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(sheetStore.get()).toMatchObject({ phase: "hold", target: "/", from: "" });
    act(() => vi.advanceTimersByTime(2_000));
    act(() => vi.advanceTimersByTime(500));
    expect(nav.push).toHaveBeenCalledTimes(pushes);
    expect(sheetStore.get().phase).toBe("idle");
    expect(html).not.toHaveAttribute("data-page-covered");
    expect(html).not.toHaveAttribute("data-sheet-docking");
  });

  it("leaves same-page landing anchor history alone", () => {
    render(<PageSheet />);
    window.history.replaceState(null, "", "/#pricing");
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(sheetStore.get().phase).toBe("idle");
    expect(nav.push).not.toHaveBeenCalled();
  });
});
