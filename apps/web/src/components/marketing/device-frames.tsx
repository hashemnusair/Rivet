import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Device chrome for the marketing page, traced from the supplied iPhone 16 Pro
 * and MacBook Pro artwork. The original files render a bitmap into an
 * `<image>` slot; the hero shows live, animated product surfaces instead, so
 * each frame is split into two SVG layers with an HTML screen sandwiched
 * between them:
 *
 *   under  — body, side buttons, the black screen base, base and feet
 *   screen — an absolutely positioned HTML box on the artwork's screen rect
 *   over   — the black bezel ring, the notch or Dynamic Island, the camera
 *
 * The bezel ring is painted again on top so it clips the HTML screen's
 * anti-aliased corners cleanly. The HTML rect is drawn a hair larger than the
 * bezel hole for the same reason: its edge always sits under opaque chrome.
 *
 * Every coordinate below is a fraction of the artwork's viewBox, so the frames
 * scale with their container and never depend on a pixel width.
 */

const percent = (value: number, of: number) => `${((value / of) * 100).toFixed(4)}%`;

/** Places a child on an artwork rectangle inside a container that shares the artwork's aspect ratio. */
function rectStyle(
  rect: { x: number; y: number; w: number; h: number; r: number },
  box: { w: number; h: number },
): CSSProperties {
  return {
    left: percent(rect.x, box.w),
    top: percent(rect.y, box.h),
    width: percent(rect.w, box.w),
    height: percent(rect.h, box.h),
    borderRadius: `${percent(rect.r, rect.w)} / ${percent(rect.r, rect.h)}`,
  };
}

// ---------------------------------------------------------------------------
// iPhone 16 Pro — 200 × 400 artwork
// ---------------------------------------------------------------------------

const IPHONE_BOX = { w: 200, h: 400 } as const;
/** The bezel hole from the artwork, widened by half a unit so its edge hides under the ring. */
const IPHONE_SCREEN = { x: 13.6, y: 12.3, w: 172.94, h: 375.39, r: 25.1 } as const;
/** The outer body, used for the shadow so it follows the phone's silhouette. */
const IPHONE_BODY = { x: 8.83, y: 7.29, w: 182.5, h: 385.42, r: 29.95 } as const;

const IPHONE_TITANIUM =
  "M196.11,128.09c0-.25-.2-.45-.45-.45-.11.04-.37.03-.69,0V36.69c0-17.84-14.46-32.31-32.31-32.31H37.48C19.63,4.39,5.17,18.85,5.17,36.69v48.99c-.3.02-.55.03-.66-.02-.25,0-.45.2-.45.45,0,0,0,17.29,0,17.29-.03.41.5.49,1.11.48v13.63c-.61,0-1.14.08-1.11.48,0,0,0,28.54,0,28.54-.03.42.5.49,1.11.48v7.95c-.61,0-1.14.08-1.11.48,0,0,0,28.54,0,28.54-.03.42.5.49,1.11.48v178.86c0,17.84,14.46,32.31,32.31,32.31h125.2c17.84,0,32.31-14.46,32.31-32.31v-188.87c.32-.02.58-.03.69.04,1.26.1.03-45.94.45-46.38ZM186.07,362.63c0,13.56-10.99,24.56-24.56,24.56H38.64c-13.56,0-24.56-10.99-24.56-24.56V37.37c0-13.56,10.99-24.56,24.56-24.56h122.87c13.56,0,24.56,10.99,24.56,24.56v325.26Z";
const IPHONE_BEZEL =
  "M161.38,7.29H38.78c-16.54,0-29.95,13.41-29.95,29.95v325.52c0,16.54,13.41,29.95,29.95,29.95h122.6c16.54,0,29.95-13.41,29.95-29.95V37.24c0-16.54-13.41-29.95-29.95-29.95ZM186.07,362.57c0,13.6-11.02,24.62-24.62,24.62H38.7c-13.6,0-24.62-11.02-24.62-24.62V37.43c0-13.6,11.02-24.62,24.62-24.62h122.75c13.6,0,24.62,11.02,24.62,24.62v325.14Z";
const IPHONE_ISLAND =
  "M119.61,33.86h-38.93c-10.48-.18-10.5-15.78,0-15.96,0,0,38.93,0,38.93,0,4.41,0,7.98,3.57,7.98,7.98,0,4.41-3.57,7.98-7.98,7.98Z";
const IPHONE_CAMERA = "M118.78,29.21c-4.32.06-4.32-6.73,0-6.66,4.32-.06,4.32,6.73,0,6.66Z";

export function Iphone16ProFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative w-full", className)} style={{ aspectRatio: "200 / 400" }}>
      <div
        aria-hidden
        className="absolute shadow-[0_26px_60px_-14px_rgb(27_26_21/0.5),0_10px_22px_-10px_rgb(27_26_21/0.35)]"
        style={rectStyle(IPHONE_BODY, IPHONE_BOX)}
      />
      <svg viewBox="0 0 200 400" className="absolute inset-0 h-full w-full" aria-hidden>
        <path fill="#303333" fillRule="evenodd" d={IPHONE_TITANIUM} />
        <path fill="#000" fillRule="evenodd" d={IPHONE_BEZEL} />
        <rect fill="#050505" x="14.08" y="12.81" width="171.98" height="374.37" rx="24.62" ry="24.62" />
      </svg>
      <div className="absolute overflow-hidden bg-paper" style={rectStyle(IPHONE_SCREEN, IPHONE_BOX)}>
        {children}
      </div>
      <svg viewBox="0 0 200 400" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <path fill="#000" fillRule="evenodd" d={IPHONE_BEZEL} />
        <path fill="#000" d={IPHONE_ISLAND} />
        <path fill="#080d4c" d={IPHONE_CAMERA} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MacBook Pro — 650 × 400 artwork
// ---------------------------------------------------------------------------

const MACBOOK_BOX = { w: 650, h: 400 } as const;
const MACBOOK_SCREEN = { x: 74.02, y: 20.82, w: 502.22, h: 324.85, r: 5.5 } as const;
/** The lid and the base, used only to cast shadows in the right places. */
const MACBOOK_LID = { x: 66.46, y: 13.18, w: 517.52, h: 349.71, r: 13.1 } as const;
const MACBOOK_BASE = { x: 19.04, y: 362.77, w: 611.92, h: 21.18, r: 10.79 } as const;

const MACBOOK_LID_SHELL = "M79.56,13.18h491.32c7.23,0,13.1,5.87,13.1,13.1v336.61H66.46V26.28c0-7.23,5.87-13.1,13.1-13.1Z";
const MACBOOK_LID_INNER = "M79.96,14.24h490.45c6.83,0,12.37,5.54,12.37,12.37v336.28H67.59V26.6c0-6.83,5.54-12.37,12.37-12.37Z";
const MACBOOK_BEZEL =
  "M570.25,15.74H80.34c-6.12,0-11.08,4.96-11.08,11.08v336.07h512.08V26.82c0-6.12-4.96-11.08-11.08-11.08ZM575.74,345.17H74.52V27.31c0-3.31,2.68-5.99,5.99-5.99h489.24c3.31,0,5.99,2.68,5.99,5.99v317.86Z";
const MACBOOK_NOTCH = "M298.14,21.02h54.07v6.5c0,1.56-1.27,2.82-2.82,2.82h-48.42c-1.56,0-2.82-1.27-2.82-2.82v-6.5h0Z";
const MACBOOK_CAMERA = "M325.11,25.14c-1.99.03-1.99-3.09,0-3.06,1.99-.03,1.99,3.09,0,3.06Z";
const MACBOOK_BASE_PATH = "M19.04,362.77h611.92v10.39c0,5.95-4.83,10.79-10.79,10.79H29.83c-5.95,0-10.79-4.83-10.79-10.79v-10.39h0Z";
const MACBOOK_LIP = "M278.11,362.6h94.05c0,3.63-2.95,6.58-6.58,6.58h-80.89c-3.63,0-6.58-2.95-6.58-6.58h0Z";

/**
 * How far the notch reaches into the screen, as a fraction of screen height.
 * The screen puts a menu bar of this height above the product so the notch
 * sits in the bar, the way it does on the real machine.
 */
export const MACBOOK_MENU_BAR_HEIGHT = `${(((30.34 - 21.32) / 323.85) * 100 + 0.6).toFixed(2)}%`;

export function MacbookProFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative w-full", className)} style={{ aspectRatio: "650 / 400" }}>
      <div
        aria-hidden
        className="absolute shadow-[0_30px_70px_-30px_rgb(27_26_21/0.45)]"
        style={rectStyle(MACBOOK_LID, MACBOOK_BOX)}
      />
      <div
        aria-hidden
        className="absolute shadow-[0_18px_40px_-10px_rgb(27_26_21/0.42),0_4px_10px_-4px_rgb(27_26_21/0.3)]"
        style={rectStyle(MACBOOK_BASE, MACBOOK_BOX)}
      />
      <svg viewBox="0 0 650 400" className="absolute inset-0 h-full w-full" aria-hidden>
        <path fill="#a4a5a7" d={MACBOOK_LID_SHELL} />
        <path fill="#222" d={MACBOOK_LID_INNER} />
        <path fill="#000" fillRule="evenodd" d={MACBOOK_BEZEL} />
        <rect fill="#050505" x="74.52" y="21.32" width="501.22" height="323.85" rx="5" ry="5" />
        <rect fill="#1d1d1d" x="69.09" y="350.51" width="512.11" height="12.48" />
        <path fill="#acadaf" d={MACBOOK_BASE_PATH} />
        <polygon fill="#b9b9bb" points="600.06 385.39 567.29 385.39 565.84 383.95 601.82 383.95 600.06 385.39" />
        <polygon fill="#292929" points="598.73 386.82 568.64 386.82 567.32 385.39 600.35 385.39 598.73 386.82" />
        <polygon fill="#b9b9bb" points="82.64 385.39 49.87 385.39 48.43 383.95 84.41 383.95 82.64 385.39" />
        <polygon fill="#292929" points="81.31 386.82 51.23 386.82 49.9 385.39 82.93 385.39 81.31 386.82" />
        <path fill="#8f9091" d={MACBOOK_LIP} />
      </svg>
      <div className="absolute overflow-hidden bg-paper" style={rectStyle(MACBOOK_SCREEN, MACBOOK_BOX)}>
        {children}
      </div>
      <svg viewBox="0 0 650 400" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <path fill="#000" fillRule="evenodd" d={MACBOOK_BEZEL} />
        <path fill="#000" d={MACBOOK_NOTCH} />
        <path fill="#080d4c" d={MACBOOK_CAMERA} />
      </svg>
    </div>
  );
}
