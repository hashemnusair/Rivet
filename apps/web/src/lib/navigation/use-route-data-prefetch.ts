"use client";

import { QueryClientContext, type QueryClient } from "@tanstack/react-query";
import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { getApi } from "@/lib/api/client";
import { currentApiScopeEpoch } from "@/lib/api/scope";
import type { Session } from "@/lib/domain/types";
import { useOptionalApp } from "@/lib/providers/app-context";
import { QUERY_GC_TIME_MS } from "@/lib/providers/query-policy";
import { routeReads } from "./route-reads";

/** The screens' own freshness window (use-api.ts): a read this recent is not repeated. */
const FRESH_MS = 10_000;
/**
 * A pointer that only passes over a link costs nothing; one that rests on it
 * this long is reaching for it. Long enough to skip a sweep across the
 * sidebar, short against the 200-400 ms between arriving on a link and
 * releasing the click.
 */
export const DATA_INTENT_DWELL_MS = 90;

export function prefersSavingData(): boolean {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}

/** A read that finished after a branch, organization or sign-in change must not be cached. */
class ScopeChangedError extends Error {
  constructor() {
    super("The workspace scope changed while this read was in flight.");
    this.name = "ScopeChangedError";
  }
}

/**
 * Start the first reads of the screen `href` opens, under the current
 * session. Shares requests with anything already in flight and skips reads
 * that are still fresh. Does nothing in a hidden tab, with Save-Data, or for
 * the screen already open.
 */
export function prefetchRouteData(queryClient: QueryClient, href: string, session: Session): void {
  if (typeof window === "undefined" || document.visibilityState !== "visible" || prefersSavingData()) return;
  const reads = routeReads(href, session);
  if (reads.length === 0) return;
  if (new URL(href, window.location.href).pathname === window.location.pathname) return;
  const epoch = currentApiScopeEpoch();
  for (const read of reads) {
    void queryClient.prefetchQuery({
      queryKey: read.queryKey,
      queryFn: async () => {
        const value = await read.queryFn(getApi());
        if (currentApiScopeEpoch() !== epoch) throw new ScopeChangedError();
        return value;
      },
      staleTime: FRESH_MS,
      gcTime: QUERY_GC_TIME_MS,
      // A refusal or failure here is left for the screen itself to retry
      // and report when it opens.
      retry: false,
    });
  }
}

/** `prefetchRouteData` bound to the current session; a no-op outside the app providers. */
export function useRouteDataPrefetch(): (href: string) => void {
  const app = useOptionalApp();
  const queryClient = useContext(QueryClientContext);
  const session = app?.session;
  return useCallback((href: string) => {
    if (!queryClient || !session) return;
    prefetchRouteData(queryClient, href, session);
  }, [queryClient, session]);
}

export interface RouteIntentHandlers {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onTouchStart: () => void;
  onPointerDown: () => void;
}

/**
 * Pointer, focus and touch handlers that start a screen's reads when someone
 * reaches for it: at once on touch or press, after DATA_INTENT_DWELL_MS when
 * the pointer or keyboard focus rests on it. For links and for rows that open
 * a screen through the router.
 */
export function useRouteDataIntent(href: string | undefined): RouteIntentHandlers {
  const prefetch = useRouteDataPrefetch();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return useMemo(() => {
    const cancel = () => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    };
    const now = () => {
      cancel();
      if (href) prefetch(href);
    };
    const soon = () => {
      cancel();
      if (href) timer.current = window.setTimeout(now, DATA_INTENT_DWELL_MS);
    };
    return { onPointerEnter: soon, onPointerLeave: cancel, onFocus: soon, onBlur: cancel, onTouchStart: now, onPointerDown: now };
  }, [href, prefetch]);
}
