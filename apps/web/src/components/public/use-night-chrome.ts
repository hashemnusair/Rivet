"use client";

import { useEffect } from "react";
import { NIGHT_CHROME, PAPER_CHROME } from "@/lib/ui/chrome-colors";

/**
 * Tints the browser's own bars night while a night page is open, and gives
 * them back the paper after: the root layout's `theme-color` is the product's
 * paper, and the night pages are client pages that cannot set their own. The
 * page edges themselves (overscroll, safe areas) follow `data-night-page` in
 * globals.css. Going from one night page to another, the next page's effect
 * runs after this one's cleanup, so the bars stay night.
 */
export function useNightChrome(active = true) {
  useEffect(() => {
    if (!active) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    meta.content = NIGHT_CHROME;
    return () => {
      meta.content = PAPER_CHROME;
    };
  }, [active]);
}

/** The same, for a page rendered on the server. */
export function NightChrome() {
  useNightChrome();
  return null;
}
