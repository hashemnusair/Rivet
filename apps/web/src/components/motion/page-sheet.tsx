"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";
import { decideHostRouting } from "@/lib/routing/host-routing";
import { ART_VIEWBOX, IDLE_SHEET, OPENING_DRAWING, sheetRoute, sheetStore, sheetTarget, type SheetDock } from "./sheet-store";
import styles from "./page-sheet.module.css";

/*
 * The page change between the public pages (the landing, the documents, the
 * application and sign-in). A sheet link fades one night sheet over the page,
 * the next page loads underneath while a sign-in drawing draws itself, and the
 * sheet fades off it. Only opacity moves, so nothing ever cuts across the page
 * underneath. A long load keeps the drawing going: its lines move from the
 * machine to the desk, the bench and the network until the page is there. The
 * doors and links across RIVET hosts use the same sheet, but a browser may
 * stop painting a page as soon as the next document starts loading (iOS
 * Safari does), so the drawing plays on the page being left: it draws itself
 * while the next page's stylesheets are fetched, and that page is only asked
 * for once it is fully drawn. The next page opens on the same drawing (its
 * pre-paint cover, `sheet-entry`), which lifts as soon as that page has
 * painted. Product pages keep their short entrance.
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
/**
 * The least time from the click to the lift: the first drawing is fully drawn
 * by then (`DrawingLoop` at DRAW_PACE draws for 1080ms), so a lift never cuts it off.
 */
const HOLD_MS = 1150;
/** Going to sign in, long enough for the machine to be fully drawn when it lands. */
const DOCK_HOLD_MS = 1250;
/** Leaving for another host, the latest the next page is asked for if the drawing has not come to rest. */
const DEPART_LIMIT_MS = 2400;
/**
 * A page on this host that has not arrived by then is loaded the ordinary way.
 * One on another host is already loading that way, so the sheet only lifts.
 */
const STALL_MS = 12_000;
/** The longest a landed drawing may take to come back to the machine before the sheet goes anyway. */
const LAND_LIMIT_MS = 1600;
/** The drawing's pace on the sheet: a little quicker than on the sign-in page. */
const DRAW_PACE = 0.3;

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Whether a sheet's target is on another RIVET host, so this document is left behind. */
const crossesHost = (target: string) => new URL(target, window.location.href).origin !== window.location.origin;

const preconnected = new Set<string>();

/**
 * Opens the connection to another RIVET host a link goes to, so its page
 * starts loading sooner. Safari has no speculation rules to fetch it ahead.
 */
function preconnect(href: string) {
  const target = sheetTarget(href, window.location.href);
  if (!target || !crossesHost(target)) return;
  const { origin } = new URL(target);
  if (preconnected.has(origin)) return;
  preconnected.add(origin);
  const link = document.createElement("link");
  link.rel = "preconnect";
  link.href = origin;
  document.head.appendChild(link);
}

const warmed = new Set<string>();

/**
 * Fetches the stylesheets a page on another host needs before it can paint,
 * while the drawing plays. Every RIVET host serves the same build, so they are
 * this page's own, from that host. Its scripts stay on their own host
 * (`script-src 'self'`); the page paints without them.
 */
function warmStylesheets(target: string) {
  const { origin } = new URL(target);
  for (const sheet of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]')) {
    const url = new URL(sheet.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/_next/static/")) continue;
    const href = `${origin}${url.pathname}${url.search}`;
    if (warmed.has(href)) continue;
    warmed.add(href);
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "style";
    link.href = href;
    document.head.appendChild(link);
  }
}

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
  if (crossesHost(target)) warmStylesheets(target);
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
 * idle, or sooner on hover or focus; another host is connected to at once.
 */
export function SheetLink({ href, onClick, onPointerEnter, onFocus, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  useEffect(prefetchDrawing, []);
  useEffect(() => preconnect(href), [href]);
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
  // Leaving for another host: the next page is asked for once, when the drawing is fully drawn.
  const departed = useRef(-1);
  const depart = useCallback(() => {
    const current = sheetStore.get();
    if ((current.phase !== "rack" && current.phase !== "hold") || !crossesHost(current.target) || departed.current === current.startedAt) return;
    departed.current = current.startedAt;
    window.location.assign(current.target);
  }, []);

  useEffect(() => sheetStore.addPlayer(), []);

  // A plain Next link or browser Back to the landing also gets an arrival,
  // without requiring every caller to use SheetLink. An existing in-app sheet
  // already owns the arrival and is kept. A full document lifts its own
  // pre-paint cover once painted (`sheet-entry`), without waiting for this.
  useLayoutEffect(() => {
    const returningHome = pathname === "/" && previousPath.current !== pathname;
    previousPath.current = pathname;
    if (returningHome && sheetStore.get().phase === "idle") arrive(pathname);
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
  // A page on another host is asked for later, once the drawing has drawn itself (`depart`).
  useEffect(() => {
    if (sheet.phase !== "rack") return;
    const crossingHost = crossesHost(sheet.target);
    if (!crossingHost) router.prefetch(sheet.target);
    const timer = window.setTimeout(() => {
      document.documentElement.setAttribute("data-page-covered", "");
      if (sheet.dock) document.documentElement.setAttribute("data-sheet-docking", "");
      sheetStore.set({ ...sheet, phase: "hold" });
      if (!crossingHost) router.push(sheet.target);
    }, RACK_MS);
    return () => window.clearTimeout(timer);
  }, [sheet, router]);

  // Arrived (the first path that is not the one left), painted, and seen for long enough: lift.
  useEffect(() => {
    if (sheet.phase !== "hold") return;
    const elapsed = performance.now() - sheet.startedAt;
    if (pathname === sheet.from) {
      if (!crossesHost(sheet.target)) {
        const timer = window.setTimeout(() => window.location.assign(sheet.target), Math.max(0, STALL_MS - elapsed));
        return () => window.clearTimeout(timer);
      }
      // The drawing's rest asks for the page (`depart`); this asks if it never rests.
      // Assigning a slow page again would start its load over, so a stall only lifts.
      const late = window.setTimeout(depart, Math.max(0, DEPART_LIMIT_MS - elapsed));
      const stalled = window.setTimeout(settle, Math.max(0, STALL_MS - elapsed));
      return () => {
        window.clearTimeout(late);
        window.clearTimeout(stalled);
      };
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
  }, [sheet, pathname, depart]);

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
  // Leaving for another host, the drawing stays on the one it opened on: the one the next page opens on.
  const departing = crossesHost(sheet.target);
  return (
    <div
      className={cn(styles.sheet, sheet.phase === "rack" && styles.covering, lifting && styles.lifting)}
      aria-hidden
      data-page-sheet={sheet.phase}
    >
      <div className={styles.cover} />
      <div ref={drawingRef} className={cn(styles.drawing, lifting && !sheet.landing && styles.leaving)}>
        <Suspense fallback={null}>
          <SheetDrawing
            pace={DRAW_PACE}
            startOn={sheet.dock}
            endOn={departing ? (sheet.dock ?? OPENING_DRAWING) : lifting && sheet.landing ? sheet.dock : null}
            onRest={departing ? depart : rest}
          />
        </Suspense>
      </div>
    </div>
  );
}
