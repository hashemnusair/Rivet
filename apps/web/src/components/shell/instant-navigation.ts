"use client";

import { useRouter } from "next/navigation";
import type { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

type Router = ReturnType<typeof useRouter>;

/**
 * Fetch a page whole, as `<Link prefetch>` does. `router.prefetch` on its own
 * only fetches what a partial prefetch would, which for these per-request
 * pages still leaves the click waiting on the server.
 */
export function prefetchFully(router: Router, href: string) {
  router.prefetch(href, { kind: "full" as PrefetchKind });
}

/**
 * Workspace pages are rendered per request, so a page nobody fetched ahead
 * waits a full server round trip after the click. Once the workspace has
 * loaded and the browser is idle, fetch every page in the navigation fully,
 * one at a time, so a click opens it at once. Startup is untouched: nothing
 * starts before the page is idle (prefetching at mount slowed startup in the
 * 15 October speed pass).
 *
 * A full prefetch is reused for five minutes (Next's static stale time). It
 * is refreshed when the person comes back to the tab or uses the page after
 * that, never on a timer, so an idle tab costs nothing.
 */
const REFRESH_AFTER_MS = 4.5 * 60 * 1000;
let warmedAt = 0;

function saveData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}

function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout: 2_000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 600);
  return () => window.clearTimeout(id);
}

export function useWarmNavigation(hrefs: readonly string[], pathname: string) {
  const router = useRouter();
  const key = hrefs.join("|");
  const previous = useRef(pathname);

  // The page someone arrived on was rendered for that visit and is not kept
  // for a return trip; fetch it ahead once they have left it.
  useEffect(() => {
    const left = previous.current;
    previous.current = pathname;
    if (left === pathname || !key.split("|").includes(left) || saveData()) return;
    return whenIdle(() => prefetchFully(router, left));
  }, [key, pathname, router]);

  useEffect(() => {
    const targets = key ? key.split("|") : [];
    if (targets.length === 0) return;
    let cancelIdle: (() => void) | undefined;
    let running = false;

    const warm = () => {
      if (running || saveData() || document.visibilityState !== "visible") return;
      if (Date.now() - warmedAt < REFRESH_AFTER_MS) return;
      running = true;
      warmedAt = Date.now();
      let index = 0;
      const next = () => {
        if (index >= targets.length) { running = false; return; }
        prefetchFully(router, targets[index]!);
        index += 1;
        cancelIdle = whenIdle(next);
      };
      cancelIdle = whenIdle(next);
    };

    // Expired prefetches are refreshed by use, not by a timer.
    const onActivity = () => { if (Date.now() - warmedAt >= REFRESH_AFTER_MS) warm(); };
    cancelIdle = whenIdle(warm);
    document.addEventListener("visibilitychange", warm);
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    return () => {
      cancelIdle?.();
      document.removeEventListener("visibilitychange", warm);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [key, router]);
}

/**
 * The navigation item someone clicked lights up in the same frame, before its
 * page has rendered. It belongs to the page it was clicked on, so it clears
 * itself when the new page arrives (or if the click led nowhere new).
 */
export function usePendingNavigation(pathname: string) {
  const [pending, setPending] = useState<{ href: string; from: string }>();
  const pendingHref = pending && pending.from === pathname ? pending.href : undefined;
  const onNavigate = useCallback((href: string, event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (href !== pathname) setPending({ href, from: pathname });
  }, [pathname]);
  return { pendingHref, onNavigate };
}
