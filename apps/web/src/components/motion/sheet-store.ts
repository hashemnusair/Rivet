import type { TKey } from "@/lib/i18n/core";

/*
 * The state of a page change carried by the night sheet, shared by the links
 * that start one, the sheet that plays it, and the sign-in drawing it hands
 * its lines to. Kept apart from the components so the sign-in page can ask
 * about it without loading the sheet.
 */

/** `rack`: the sheet fading on; `hold`: covering while the next page loads; `lift`: fading off. */
export type SheetPhase = "idle" | "rack" | "hold" | "lift";

/** The sign-in drawing a sheet can carry into the page's own art panel. */
export type SheetDock = "account";

/** The sign-in drawings' viewBox. Each drawing is centred in its box and scaled evenly to fit. */
export const ART_VIEWBOX = { width: 800, height: 900 } as const;

export type SheetState = {
  phase: SheetPhase;
  /** Where the sheet is going: a path on this origin, with its query and hash. */
  target: string;
  /** The path it left, so arrival is the first path that is not this one. */
  from: string;
  caption: TKey | null;
  /** The display face of the page left (its `--font-mona`), borrowed so the sheet loads no font of its own. */
  font: string;
  dock: SheetDock | null;
  /** Decided as the sheet fades off: whether the drawing lands on the page's art panel. */
  landing: boolean;
  /** When the sheet started to cover, on the page's clock. */
  startedAt: number;
};

export const IDLE_SHEET: SheetState = { phase: "idle", target: "", from: "", caption: null, font: "", dock: null, landing: false, startedAt: 0 };

/** The public pages a sheet goes to, each with the line it shows on the way. */
const SHEET_ROUTES: Record<string, { caption: TKey; dock?: SheetDock }> = {
  "/": { caption: "common.brand.name" },
  "/login": { caption: "auth.pageTitle.signIn", dock: "account" },
  "/signup": { caption: "publicCompletion.header.applyAccess" },
  "/privacy": { caption: "auth.chrome.privacy" },
  "/terms": { caption: "auth.chrome.terms" },
};

export const sheetRoute = (pathname: string) => SHEET_ROUTES[pathname] ?? null;

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
