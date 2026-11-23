"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { prefetchFully } from "@/components/shell/instant-navigation";
import { DATA_INTENT_DWELL_MS, useRouteDataPrefetch, type RouteIntentHandlers } from "./use-route-data-prefetch";

/**
 * Intent handlers for rows and cards that open a screen through the router
 * rather than a link (a table row's click). One hook per list: call the
 * returned function with each row's destination and spread the handlers on
 * the row. Reaching for a row prepares its screen (the page and its first
 * reads) after a short rest of the pointer or focus, or at once on touch or
 * press.
 */
export function useRouteIntentFor(): (href: string) => RouteIntentHandlers {
  const router = useRouter();
  const prefetchData = useRouteDataPrefetch();
  const timer = useRef<number | undefined>(undefined);
  const prepared = useRef(new Set<string>());
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return useCallback((href: string) => {
    const cancel = () => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    };
    const page = () => {
      if (prepared.current.has(href)) return;
      prepared.current.add(href);
      prefetchFully(router, href);
    };
    const now = () => { cancel(); page(); prefetchData(href); };
    // A pointer sweeping down a table passes over every row; only a row it
    // rests on is prepared, so a sweep costs no server requests.
    const soon = () => {
      cancel();
      timer.current = window.setTimeout(() => { page(); prefetchData(href); }, DATA_INTENT_DWELL_MS);
    };
    return { onPointerEnter: soon, onPointerLeave: cancel, onFocus: soon, onBlur: cancel, onTouchStart: now, onPointerDown: now };
  }, [prefetchData, router]);
}
