"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";
import { decideHostRouting } from "@/lib/routing/host-routing";
import { ART_VIEWBOX, IDLE_SHEET, sheetRoute, sheetStore, sheetTarget, type SheetDock } from "./sheet-store";
import { SHEET_ENTRY_ID } from "./sheet-entry";
import styles from "./page-sheet.module.css";

/*
 * The page change between the public pages (the landing, the documents, the
 * application and sign-in). A sheet link fades one night sheet over the page,
 * the next page loads underneath while a sign-in drawing draws itself, and the
 * sheet fades off it. Only opacity moves, so nothing ever cuts across the page
 * underneath. A long load keeps the drawing going: its lines move from the
 * machine to the desk, the bench and the network until the page is there. The
 * doors and links across RIVET hosts use the same sheet. Full-document arrivals
 * resume behind a pre-paint cover; product pages keep their short entrance.
 */

const loadDrawing = () => import("@/app/login/sign-in-art");
const SheetDrawing = lazy(() => loadDrawing().then((module) => ({ default: module.DrawingLoop })));

let drawingPrefetched = false;

/**
 * Fetches the drawing once a page with sheet links is idle. A phone has no
 * hover to fetch it on, so without this the first sheet would play without
 * its drawing and show it late.
 */
function prefetchDrawing() {
  if (drawingPrefetched) return;
  drawingPrefetched = true;
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => void loadDrawing(), { timeout: 4000 });
  else window.setTimeout(() => void loadDrawing(), 1500);
}

/** Matches `--cover-ms` and `--uncover-ms` in the stylesheet: the sheet fading on, and off. */
const RACK_MS = 280;
const LIFT_MS = 460;
const DOCK_MS = 760;
/** Landing, how far into the glide the page's own words fade in: once the drawing has moved off them. */
const WORDS_MS = 380;
/** The least time from the click to the lift, so the drawing is seen, not flashed. */
const HOLD_MS = 900;
/** Going to sign in, long enough for the machine to be fully drawn when it lands. */
const DOCK_HOLD_MS = 1250;
/** A page that has not arrived by then is loaded the ordinary way. */
const STALL_MS = 12_000;
/** The longest a landed drawing may take to come back to the machine before the sheet goes anyway. */
const LAND_LIMIT_MS = 1600;
/** The drawing's pace on the sheet: a little quicker than on the sign-in page. */
const DRAW_PACE = 0.3;

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The art panel a sheet can land its drawing on, when it is on screen. */
function dockFor(dock: SheetDock | null): HTMLElement | null {
  if (!dock) return null;
  const panel = document.querySelector<HTMLElement>(`[data-sheet-dock="${dock}"]`);
  return panel && panel.getBoundingClientRect().width > 0 ? panel : null;
}

function settle() {
  document.documentElement.removeAttribute("data-page-covered");
  document.documentElement.removeAttribute("data-sheet-docking");
  sheetStore.set(IDLE_SHEET);
}

/**
 * Starts a sheet to `href` when it goes to a public/sign-in page on this origin
 * or another RIVET host. Anything else (an external site, the page already open,
 * reduced motion, a sheet already playing) is left to ordinary navigation.
 */
export function startSheet(href: string): boolean {
  if (!sheetStore.hasPlayer() || sheetStore.get().phase !== "idle" || reducedMotion()) return false;
  const target = sheetTarget(href, window.location.href);
  if (!target) return false;
  const route = sheetRoute(new URL(target, window.location.href).pathname)!;
  void loadDrawing();
  sheetStore.set({
    phase: "rack",
    target,
    from: window.location.pathname,
    dock: route.dock ?? null,
    landing: false,
    startedAt: performance.now(),
  });
  return true;
}

/** An arrival never pushes history: the document or Back/Forward already did. */
function arrive(pathname: string) {
  const route = sheetRoute(pathname);
  if (!route || reducedMotion()) return;
  if (pathname === "/" && decideHostRouting(window.location.hostname, pathname).kind === "rewrite") return;
  void loadDrawing();
  document.documentElement.setAttribute("data-page-covered", "");
  if (route.dock) document.documentElement.setAttribute("data-sheet-docking", "");
  sheetStore.set({ phase: "hold", target: pathname, from: "", dock: route.dock ?? null, landing: false, startedAt: performance.now() });
}

/**
 * A link that goes by sheet when it can and is an ordinary `Link` otherwise.
 * Its own `onClick` runs first and may cancel the navigation; new-tab and
 * modified clicks are the browser's. The drawing is fetched once the page is
 * idle, or sooner on hover or focus.
 */
export function SheetLink({ href, onClick, onPointerEnter, onFocus, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  useEffect(prefetchDrawing, []);
  return (
    <Link
      {...props}
      href={href}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        void loadDrawing();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        void loadDrawing();
      }}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (props.target && props.target !== "_self") return;
        if (startSheet(href)) event.preventDefault();
      }}
    />
  );
}

/** Plays every sheet. Mounted once, in the root layout, so it outlives the pages it moves between. */
export function PageSheet() {
  const sheet = useSyncExternalStore(sheetStore.subscribe, sheetStore.get, () => IDLE_SHEET);
  const router = useRouter();
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const drawingRef = useRef<HTMLDivElement>(null);
  // Landing needs both: the drawing over the panel, and back on the machine if a long wait moved it on.
  const landed = useRef({ placed: false, rested: false });
  const rest = useCallback(() => {
    landed.current.rested = true;
    if (landed.current.placed) settle();
  }, []);

  useEffect(() => sheetStore.addPlayer(), []);

  // A hard navigation has a pre-paint cover. A plain Next link or browser Back
  // to the landing also gets an arrival, without requiring every caller to use
  // SheetLink. An existing in-app sheet already owns the arrival and is kept.
  useLayoutEffect(() => {
    const entry = document.getElementById(SHEET_ENTRY_ID);
    const returningHome = pathname === "/" && previousPath.current !== pathname;
    previousPath.current = pathname;
    if (!entry && !returningHome) return;
    let frame = 0;
    const enter = () => {
      if (sheetStore.get().phase === "idle") arrive(pathname);
      entry?.remove();
    };
    // Keep the pre-paint cover through the initial commit, then let the shared
    // player take over on the next frame without exposing the page between them.
    const hydrated = () => { frame = requestAnimationFrame(enter); };
    if ((document as Document & { prerendering?: boolean }).prerendering) {
      document.addEventListener("prerenderingchange", hydrated, { once: true });
    } else if (entry) {
      hydrated();
    } else {
      enter();
    }
    return () => {
      document.removeEventListener("prerenderingchange", hydrated);
      cancelAnimationFrame(frame);
    };
  }, [pathname]);

  // Back/forward supersedes an in-flight sheet, including its delayed push.
  // A page brought back from the back-forward cache must also clear the cover.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) {
        settle();
        if (window.location.pathname === "/") arrive("/");
      }
    };
    const historyChanged = () => {
      const current = sheetStore.get();
      const home = window.location.pathname === "/";
      // pageshow precedes popstate on a cached document; keep its fresh arrival.
      if (home && current.phase !== "idle" && current.target === "/" && current.from === "") return;
      settle();
      // Moving between anchors on the landing is scrolling, not a page arrival.
      if (home && previousPath.current !== "/") arrive("/");
    };
    window.addEventListener("pageshow", restored);
    window.addEventListener("popstate", historyChanged);
    return () => {
      window.removeEventListener("pageshow", restored);
      window.removeEventListener("popstate", historyChanged);
    };
  }, []);

  useEffect(() => {
    if (sheet.phase === "rack" || sheet.phase === "hold") landed.current = { placed: false, rested: false };
  }, [sheet.phase]);

  // Covered: go. The next page is told it is under the sheet (`data-page-covered`), so its
  // entrance waits for the sheet to fade, and the sign-in page that its drawing is coming.
  useEffect(() => {
    if (sheet.phase !== "rack") return;
    const crossingHost = new URL(sheet.target, window.location.href).origin !== window.location.origin;
    if (!crossingHost) router.prefetch(sheet.target);
    const timer = window.setTimeout(() => {
      document.documentElement.setAttribute("data-page-covered", "");
      if (sheet.dock) document.documentElement.setAttribute("data-sheet-docking", "");
      sheetStore.set({ ...sheet, phase: "hold" });
      if (crossingHost) window.location.assign(sheet.target);
      else router.push(sheet.target);
    }, RACK_MS);
    return () => window.clearTimeout(timer);
  }, [sheet, router]);

  // Arrived (the first path that is not the one left), painted, and seen for long enough: lift.
  useEffect(() => {
    if (sheet.phase !== "hold") return;
    const elapsed = performance.now() - sheet.startedAt;
    if (pathname === sheet.from) {
      const timer = window.setTimeout(() => window.location.assign(sheet.target), Math.max(0, STALL_MS - elapsed));
      return () => window.clearTimeout(timer);
    }
    let frame = 0;
    const hold = dockFor(sheet.dock) ? DOCK_HOLD_MS : HOLD_MS;
    const lift = () => {
      const landing = Boolean(dockFor(sheet.dock));
      // Landing, the page's words wait for the drawing to move off them (the lift effect below).
      if (!landing) {
        document.documentElement.removeAttribute("data-page-covered");
        document.documentElement.removeAttribute("data-sheet-docking");
      }
      sheetStore.set({ ...sheet, phase: "lift", landing });
    };
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(lift);
      });
    }, Math.max(0, hold - elapsed));
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [sheet, pathname]);

  // Uncovering: the drawing either glides onto the page's art panel or fades with the sheet.
  useLayoutEffect(() => {
    if (sheet.phase !== "lift") return;
    const box = drawingRef.current;
    const dock = sheet.landing ? dockFor(sheet.dock) : null;
    if (!box || !dock) {
      document.documentElement.removeAttribute("data-page-covered");
      const timer = window.setTimeout(settle, LIFT_MS);
      return () => window.clearTimeout(timer);
    }
    // Both copies sit centred and evenly scaled in their boxes, so the lines land
    // by their centre and one scale, never stretched, wherever the panel ends.
    const from = box.getBoundingClientRect();
    const to = dock.getBoundingClientRect();
    const fit = (rect: DOMRect) => Math.min(rect.width / ART_VIEWBOX.width, rect.height / ART_VIEWBOX.height);
    const scale = fit(to) / fit(from);
    const x = to.left + to.width / 2 - from.left - (from.width / 2) * scale;
    const y = to.top + to.height / 2 - from.top - (from.height / 2) * scale;
    const move = `translate(${x}px, ${y}px) scale(${scale})`;
    const landing = box.animate([{ transform: "none" }, { transform: move }], { duration: DOCK_MS, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" });
    const words = window.setTimeout(() => document.documentElement.removeAttribute("data-page-covered"), WORDS_MS);
    const place = window.setTimeout(() => {
      landed.current.placed = true;
      if (landed.current.rested) settle();
    }, Math.max(LIFT_MS, DOCK_MS));
    const limit = window.setTimeout(settle, Math.max(LIFT_MS, DOCK_MS) + LAND_LIMIT_MS);
    return () => {
      window.clearTimeout(words);
      window.clearTimeout(place);
      window.clearTimeout(limit);
      landing.cancel();
    };
  }, [sheet]);

  if (sheet.phase === "idle") return null;
  const lifting = sheet.phase === "lift";
  return (
    <div
      className={cn(styles.sheet, sheet.phase === "rack" && styles.covering, lifting && styles.lifting)}
      aria-hidden
      data-page-sheet={sheet.phase}
    >
      <div className={styles.cover} />
      <div ref={drawingRef} className={cn(styles.drawing, lifting && !sheet.landing && styles.leaving)}>
        <Suspense fallback={null}>
          <SheetDrawing pace={DRAW_PACE} endOn={lifting && sheet.landing ? sheet.dock : null} onRest={rest} />
        </Suspense>
      </div>
    </div>
  );
}
