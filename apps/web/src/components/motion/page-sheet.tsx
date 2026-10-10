"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type ComponentProps, type CSSProperties } from "react";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { Plates, platesMs } from "./plates";
import { IDLE_SHEET, sheetRoute, sheetStore, type SheetDock } from "./sheet-store";
import styles from "./page-sheet.module.css";

/*
 * The page change between the public pages (the landing, the documents, the
 * application and sign-in). A sheet link racks the night plates over the page,
 * the next page loads underneath while a sign-in drawing draws itself, and the
 * plates lift off it. A long load keeps the drawing going: its lines move from
 * the machine to the desk, the bench and the network until the page is there.
 * The doors between sign-in pages keep their own quicker move (`?art=`), and
 * the product's pages keep their short entrance.
 */

const loadDrawing = () => import("@/app/login/sign-in-art");
const SheetDrawing = lazy(() => loadDrawing().then((module) => ({ default: module.DrawingLoop })));

/** Matches `--rack-*` and `--lift-*` in the stylesheet. */
const RACK_MS = platesMs(400, 24);
const LIFT_MS = platesMs(560, 26);
const DOCK_MS = 760;
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
 * Starts a sheet to `href` when it goes to a sheet page on this origin, and
 * says whether it did. Anything else (another host, the page already open,
 * reduced motion, a sheet already playing) is left to ordinary navigation.
 * `source`, the link that was followed, lends the sheet its page's display
 * face, so the product's pages never load the public site's font.
 */
export function startSheet(href: string, source?: Element): boolean {
  if (!sheetStore.hasPlayer() || sheetStore.get().phase !== "idle" || reducedMotion()) return false;
  const url = new URL(href, window.location.href);
  const route = sheetRoute(url.pathname);
  if (!route || url.origin !== window.location.origin || url.pathname === window.location.pathname) return false;
  void loadDrawing();
  sheetStore.set({
    phase: "rack",
    target: `${url.pathname}${url.search}${url.hash}`,
    from: window.location.pathname,
    caption: route.caption,
    font: source ? getComputedStyle(source).getPropertyValue("--font-mona").trim() : "",
    dock: route.dock ?? null,
    landing: false,
    startedAt: performance.now(),
  });
  return true;
}

/**
 * A link that goes by sheet when it can and is an ordinary `Link` otherwise.
 * Its own `onClick` runs first and may cancel the navigation; new-tab and
 * modified clicks are the browser's. The drawing is fetched on hover or focus.
 */
export function SheetLink({ href, onClick, onPointerEnter, onFocus, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
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
        if (startSheet(href, event.currentTarget)) event.preventDefault();
      }}
    />
  );
}

/** Plays every sheet. Mounted once, in the root layout, so it outlives the pages it moves between. */
export function PageSheet() {
  const sheet = useSyncExternalStore(sheetStore.subscribe, sheetStore.get, () => IDLE_SHEET);
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const drawingRef = useRef<HTMLDivElement>(null);
  // Landing needs both: the drawing over the panel, and back on the machine if a long wait moved it on.
  const landed = useRef({ placed: false, rested: false });
  const rest = useCallback(() => {
    landed.current.rested = true;
    if (landed.current.placed) settle();
  }, []);

  useEffect(() => sheetStore.addPlayer(), []);

  // A page brought back from the back-forward cache never keeps a sheet over it.
  useEffect(() => {
    const restored = (event: PageTransitionEvent) => {
      if (event.persisted) settle();
    };
    window.addEventListener("pageshow", restored);
    return () => window.removeEventListener("pageshow", restored);
  }, []);

  useEffect(() => {
    if (sheet.phase === "rack") landed.current = { placed: false, rested: false };
  }, [sheet.phase]);

  // Covered: go. The next page is told it is under the sheet (`data-page-covered`), so its
  // entrance waits for the lift, and the sign-in page that its drawing is coming.
  useEffect(() => {
    if (sheet.phase !== "rack") return;
    router.prefetch(sheet.target);
    const timer = window.setTimeout(() => {
      document.documentElement.setAttribute("data-page-covered", "");
      if (sheet.dock) document.documentElement.setAttribute("data-sheet-docking", "");
      sheetStore.set({ ...sheet, phase: "hold" });
      router.push(sheet.target);
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
      document.documentElement.removeAttribute("data-page-covered");
      if (!landing) document.documentElement.removeAttribute("data-sheet-docking");
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

  // Lifting: the drawing either lands on the page's art panel or leaves with the plates.
  useLayoutEffect(() => {
    if (sheet.phase !== "lift") return;
    const box = drawingRef.current;
    const dock = sheet.landing ? dockFor(sheet.dock) : null;
    if (!box || !dock) {
      const timer = window.setTimeout(settle, LIFT_MS);
      return () => window.clearTimeout(timer);
    }
    const from = box.getBoundingClientRect();
    const to = dock.getBoundingClientRect();
    const move = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`;
    const landing = box.animate([{ transform: "none" }, { transform: move }], { duration: DOCK_MS, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" });
    const place = window.setTimeout(() => {
      landed.current.placed = true;
      if (landed.current.rested) settle();
    }, Math.max(LIFT_MS, DOCK_MS));
    const limit = window.setTimeout(settle, Math.max(LIFT_MS, DOCK_MS) + LAND_LIMIT_MS);
    return () => {
      window.clearTimeout(place);
      window.clearTimeout(limit);
      landing.cancel();
    };
  }, [sheet]);

  if (sheet.phase === "idle") return null;
  const lifting = sheet.phase === "lift";
  return (
    <div
      className={cn(styles.sheet, lifting && styles.lifting)}
      style={sheet.font ? ({ "--font-mona": sheet.font } as CSSProperties) : undefined}
      aria-hidden
      data-page-sheet={sheet.phase}
    >
      <Plates tone="night" motion={sheet.phase === "rack" ? "rack" : lifting ? "lift" : null} />
      <div ref={drawingRef} className={cn(styles.drawing, lifting && !sheet.landing && styles.leaving)}>
        <Suspense fallback={null}>
          <SheetDrawing pace={DRAW_PACE} endOn={lifting && sheet.landing ? sheet.dock : null} onRest={rest} />
        </Suspense>
      </div>
      {sheet.caption ? (
        <p className={styles.caption}>
          <span>{t(sheet.caption)}</span>
        </p>
      ) : null}
    </div>
  );
}
