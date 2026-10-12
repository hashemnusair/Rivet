import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PageSheet, SheetLink, startSheet } from "./page-sheet";
import { IDLE_SHEET, SHEET_ENTRY_ID, sheetCarries, sheetRoute, sheetStore, sheetTarget } from "./sheet-store";
import { drawingSvg } from "@/app/login/sign-in-drawings";
import { SHEET_ENTRY_PRE_PAINT, svgUrl } from "./sheet-entry";
import { SheetEntryArt } from "./sheet-entry-art";

const nav = vi.hoisted(() => ({ pathname: "/", push: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, prefetch: nav.prefetch }),
}));

const html = document.documentElement;
const runEntry = (href: string, reduce = false) => new Function("location", "matchMedia", SHEET_ENTRY_PRE_PAINT)(new URL(href), () => ({ matches: reduce }));
const entryCss = () => document.getElementById(SHEET_ENTRY_ID)?.textContent ?? null;
/** jsdom cannot leave the document: it reports each document navigation as an error instead. */
const documentNavigations = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([message]) => String(message).includes("Not implemented: navigation")).length;

describe("page sheet", () => {
  // The sheet fetches its drawing (the real one) lazily. Fetched first under
  // fake timers, the fetch could outlive the fake clock and never arrive: play
  // one sheet on the real clock first, so every sheet below draws at once.
  beforeAll(async () => {
    const { unmount } = render(<PageSheet />);
    act(() => {
      startSheet("/login");
    });
    await waitFor(() => expect(document.querySelector("[data-page-sheet] svg")).not.toBeNull(), { timeout: 10_000 });
    act(() => sheetStore.set(IDLE_SHEET));
    unmount();
    html.removeAttribute("data-page-covered");
    html.removeAttribute("data-sheet-docking");
  }, 15_000);

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
    document.head.querySelectorAll("style").forEach((style) => style.textContent?.includes("data-sheet-words") && style.remove());
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

  it.each(["https://www.rivetjo.com/", "https://dashboard.rivetjo.com/login/gym", "https://app.rivetjo.com/login/member?art=account"])("opens a fresh document on the drawn sheet and lifts it once painted: %s", (href) => {
    runEntry(href);
    // The sheet as the page before was left on: its night, its grid and its drawing.
    expect(entryCss()).toContain("background:#0b0a08");
    expect(entryCss()).toContain("background-size:40px 40px");
    expect(entryCss()).toMatch(/html::before\{[^}]*url\("data:image\/svg\+xml,%3Csvg /);
    expect(entryCss()).not.toContain("rivet-sheet-entry .46s");
    // Painted (two frames once parsed): the cover fades by itself, with no script of the page's.
    act(() => vi.advanceTimersByTime(40));
    expect(entryCss()).toContain("rivet-sheet-entry .46s");
    act(() => vi.advanceTimersByTime(600));
    expect(document.getElementById(SHEET_ENTRY_ID)).toBeNull();
  });

  it("glides a door's drawing onto its art panel, and goes once the page has its own drawing", () => {
    const panel = document.createElement("aside");
    panel.setAttribute("data-sheet-dock", "staff");
    panel.innerHTML = "<svg data-art-pending></svg>";
    panel.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 900 }) as DOMRect;
    document.body.appendChild(panel);
    Object.defineProperty(html, "clientWidth", { configurable: true, value: 1440 });
    Object.defineProperty(html, "clientHeight", { configurable: true, value: 900 });
    const words = () => Array.from(document.head.querySelectorAll("style")).some((style) => style.textContent?.includes("data-sheet-words"));
    try {
      runEntry("https://dashboard.rivetjo.com/login/gym");
      // Under the cover the page's own drawing and words wait for it.
      expect(entryCss()).toContain("[data-sheet-dock]>svg{visibility:hidden}");
      expect(words()).toBe(true);
      act(() => vi.advanceTimersByTime(40));
      // The night fades; the drawing moves from the middle half onto the left half, at the same size.
      expect(entryCss()).toContain("html::after{animation:rivet-sheet-entry .46s");
      expect(entryCss()).not.toContain("html::before,html::after{animation");
      expect(entryCss()).toContain("html::before{animation:rivet-sheet-dock .76s cubic-bezier(.65,0,.35,1) forwards}");
      expect(entryCss()).toContain("transform:translate(-360px,0px) scale(1)");
      act(() => vi.advanceTimersByTime(380));
      expect(words()).toBe(false);
      // Landed, it stays until the page has taken its drawing over.
      act(() => vi.advanceTimersByTime(1_000));
      expect(sheetCarries("staff")).toBe(true);
      panel.querySelector("svg")!.removeAttribute("data-art-pending");
      act(() => vi.advanceTimersByTime(50));
      expect(document.getElementById(SHEET_ENTRY_ID)).toBeNull();
      expect(sheetCarries("staff")).toBe(false);

      // A page that never takes it over is uncovered anyway.
      panel.querySelector("svg")!.setAttribute("data-art-pending", "");
      runEntry("https://dashboard.rivetjo.com/login/gym");
      act(() => vi.advanceTimersByTime(2_900));
      expect(document.getElementById(SHEET_ENTRY_ID)).not.toBeNull();
      act(() => vi.advanceTimersByTime(200));
      expect(document.getElementById(SHEET_ENTRY_ID)).toBeNull();
    } finally {
      panel.remove();
      Reflect.deleteProperty(html, "clientWidth");
      Reflect.deleteProperty(html, "clientHeight");
    }
  });

  it("opens the cover on the machine, and a door page on its own drawing", () => {
    runEntry("https://dashboard.rivetjo.com/login/gym");
    expect(entryCss()).toContain(svgUrl(drawingSvg("account")));
    const { container } = render(<SheetEntryArt door="staff" />);
    // Later in the document than the cover, so its drawing is the one shown.
    expect(container.querySelector("style")?.textContent).toBe(`html::before{background-image:${svgUrl(drawingSvg("staff"))}}`);
  });

  it("does not cover reduced motion or an app-host workspace root", () => {
    runEntry("https://www.rivetjo.com/", true);
    expect(document.getElementById(SHEET_ENTRY_ID)).toBeNull();
    runEntry("https://dashboard.rivetjo.com/");
    expect(document.getElementById(SHEET_ENTRY_ID)).toBeNull();
  });

  it("leaves a document's own cover to lift itself, without starting another sheet or navigation", () => {
    runEntry("https://www.rivetjo.com/");
    render(<PageSheet />);
    expect(sheetStore.get().phase).toBe("idle");
    act(() => vi.advanceTimersByTime(700));
    expect(document.getElementById(SHEET_ENTRY_ID)).toBeNull();
    expect(sheetStore.get().phase).toBe("idle");
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("holds a prerendered page's cover until the visitor activates it", () => {
    Object.defineProperty(document, "prerendering", { configurable: true, value: true });
    try {
      runEntry("https://www.rivetjo.com/");
      act(() => vi.advanceTimersByTime(20_000));
      expect(entryCss()).not.toContain("rivet-sheet-entry .46s");
      Object.defineProperty(document, "prerendering", { configurable: true, value: false });
      act(() => document.dispatchEvent(new Event("prerenderingchange")));
      act(() => vi.advanceTimersByTime(40));
      expect(entryCss()).toContain("rivet-sheet-entry .46s");
      act(() => vi.advanceTimersByTime(600));
      expect(document.getElementById(SHEET_ENTRY_ID)).toBeNull();
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

  it("leaves for another host only once its drawing is fully drawn, and asks once", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      window.history.replaceState(null, "", "/login");
      nav.pathname = "/login";
      render(<PageSheet />);
      act(() => sheetStore.set({ phase: "rack", target: "https://dashboard.rivetjo.com/login/gym?art=account", from: "/login", dock: "staff", landing: false, startedAt: performance.now() }));
      // The drawing plays here, and the next page is not asked for while it draws (1080ms).
      expect(document.querySelector("[data-page-sheet] svg")).not.toBeNull();
      act(() => vi.advanceTimersByTime(1_000));
      expect(sheetStore.get().phase).toBe("hold");
      expect(documentNavigations(errors)).toBe(0);
      // Drawn: go, once, even when the limit comes round after.
      act(() => vi.advanceTimersByTime(100));
      expect(documentNavigations(errors)).toBe(1);
      act(() => vi.advanceTimersByTime(2_000));
      expect(documentNavigations(errors)).toBe(1);
      expect(nav.push).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it("lifts a stalled load on another host instead of asking for it again", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      window.history.replaceState(null, "", "/login");
      nav.pathname = "/login";
      render(<PageSheet />);
      html.setAttribute("data-page-covered", "");
      act(() => sheetStore.set({ phase: "hold", target: "https://dashboard.rivetjo.com/login/gym", from: "/login", dock: "staff", landing: false, startedAt: performance.now() }));
      act(() => vi.advanceTimersByTime(11_900));
      expect(sheetStore.get().phase).toBe("hold");
      expect(documentNavigations(errors)).toBe(1);
      act(() => vi.advanceTimersByTime(200));
      expect(sheetStore.get().phase).toBe("idle");
      expect(html).not.toHaveAttribute("data-page-covered");
      expect(documentNavigations(errors)).toBe(1);
    } finally {
      errors.mockRestore();
    }
  });

  it("lifts only once the first drawing is fully drawn, so it is never cut off", () => {
    const { rerender } = render(<PageSheet />);
    act(() => {
      startSheet("/terms");
    });
    act(() => vi.advanceTimersByTime(300));
    nav.pathname = "/terms";
    rerender(<PageSheet />);
    // The drawing draws for 1080ms at the sheet's pace.
    act(() => vi.advanceTimersByTime(800));
    expect(sheetStore.get().phase).toBe("hold");
    act(() => vi.advanceTimersByTime(100));
    expect(sheetStore.get().phase).toBe("lift");
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
    act(() => vi.advanceTimersByTime(1_200));
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
