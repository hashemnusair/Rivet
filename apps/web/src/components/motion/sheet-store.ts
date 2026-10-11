/*
 * The state of a page change carried by the night sheet, shared by the links
 * that start one, the sheet that plays it, and the sign-in drawing it hands
 * its lines to. Kept apart from the components so the sign-in page can ask
 * about it without loading the sheet.
 */

import { canonicalHref, RIVET_ORIGINS } from "@/lib/routing/host-routing";

/** `rack`: the sheet fading on; `hold`: covering while the next page loads; `lift`: fading off. */
export type SheetPhase = "idle" | "rack" | "hold" | "lift";

/** The sign-in drawing a sheet can carry into the page's own art panel. */
export type SheetDock = "account" | "staff" | "member" | "admin";

/** The sign-in drawings' viewBox. Each drawing is centred in its box and scaled evenly to fit. */
export const ART_VIEWBOX = { width: 800, height: 900 } as const;

export type SheetState = {
  phase: SheetPhase;
  /** A local path or a canonical RIVET URL, with its query and hash. */
  target: string;
  /** The path it left, so arrival is the first path that is not this one. */
  from: string;
  dock: SheetDock | null;
  /** Decided as the sheet fades off: whether the drawing lands on the page's art panel. */
  landing: boolean;
  /** When the sheet started to cover, on the page's clock. */
  startedAt: number;
};

export const IDLE_SHEET: SheetState = { phase: "idle", target: "", from: "", dock: null, landing: false, startedAt: 0 };

/** The public pages a sheet goes to, and the one whose art panel takes its drawing. */
const SHEET_ROUTES: Record<string, { dock?: SheetDock }> = {
  "/": {},
  "/login": { dock: "account" },
  "/login/gym": { dock: "staff" },
  "/login/member": { dock: "member" },
  "/login/member/create": { dock: "member" },
  "/login/admin": { dock: "admin" },
  "/signup": {},
  "/privacy": {},
  "/terms": {},
};

export const sheetRoute = (pathname: string) => SHEET_ROUTES[pathname] ?? null;

/** Resolve host ownership before navigating: production doors cross documents. */
export function sheetTarget(href: string, currentHref: string): string | null {
  const current = new URL(currentHref);
  const url = new URL(canonicalHref(href, current.hostname), current);
  const local = url.origin === current.origin;
  const rivet = RIVET_ORIGINS.includes(current.origin) && RIVET_ORIGINS.includes(url.origin);
  if (!sheetRoute(url.pathname) || (!local && !rivet) || url.username || url.password) return null;
  if (local && url.pathname === current.pathname) return null;
  return local ? `${url.pathname}${url.search}${url.hash}` : url.href;
}

let state = IDLE_SHEET;
const listeners = new Set<() => void>();
/** Mounted sheets. A link starts one only when something will play it. */
let players = 0;

export const sheetStore = {
  get: () => state,
  hasPlayer: () => players > 0,
  addPlayer() {
    players += 1;
    return () => {
      players -= 1;
    };
  },
  set(next: SheetState) {
    state = next;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Whether a sheet is bringing this drawing in, so the page shows it drawn and waits for it. */
export const sheetCarries = (door: string) => state.phase !== "idle" && state.dock === door;
