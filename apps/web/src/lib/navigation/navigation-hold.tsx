"use client";

import { hashKey, useQueryClient, type FetchQueryOptions, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { createContext, use, useContext, useLayoutEffect } from "react";

/**
 * The pathname of the tree being rendered, or null outside the App Router
 * (unit tests). `NavigationHoldPathname` (navigation-hold-pathname.tsx) fills
 * it from Next's own `usePathname()` in the root layout.
 *
 * It is our own context on purpose. This file is imported by every query
 * hook, and most unit tests replace `next/navigation` with a partial mock,
 * so it must not import that module. It must not import Next's internal
 * context either: `next/dist/shared/lib/hooks-client-context.shared-runtime`
 * works in the browser and under `next start`, but on the server Next's
 * require hook swaps any `*.shared-runtime` request for the Pages Router
 * bundle, which Vercel does not ship with this app's functions. That import
 * made every page's server render throw on Production from 23 to 25
 * November 2026 (HTTP 500 with an empty document; see CURRENT_STATE.md).
 */
export const NavigationHoldPathnameContext = createContext<string | null>(null);

/**
 * Navigation hold: the screen someone is on stays until the next one has its
 * data, for at most this long. A slower screen then appears with its own
 * loading placeholders, exactly as before.
 */
export const NAVIGATION_HOLD_CAP_MS = 260;

/*
 * How it works
 *
 * An App Router navigation is a React transition: the router state, and with
 * it the pathname (`usePathname()`) and the page tree, change together inside
 * it (next/dist/client/components/app-router-instance.js dispatchAction and
 * app-router.js Router, which derives the pathname from the same state as the
 * tree). Without a loading.tsx, Next adds no Suspense boundary per segment
 * (layout-router.js LoadingBoundary renders a bare fragment), so if anything
 * in that transition suspends, React keeps the current screen and commits the
 * new one only when the suspension ends.
 *
 * The pages do not suspend themselves. Several wrap their whole content in a
 * fresh <Suspense> (for useSearchParams), and a component that suspends under
 * a newly mounted boundary shows that boundary's fallback, a blank screen,
 * instead of holding the old one. So the query hooks only *register* their
 * read while they render for a navigation that has not committed (and start
 * it at once), and one gate rendered after the whole route tree, in the root
 * layout, suspends on those reads. No boundary sits between the gate and the
 * root that has not already been revealed, so the transition simply waits.
 *
 * Because the gate renders after the page has rendered, every read on the
 * page starts together; nothing waits on a suspended parent. Reads that only
 * mount once an earlier one has data (a module check, then the list) are
 * registered on the next attempt and held for too, within the same deadline.
 *
 * Only a render that sees a pathname that has not been committed yet can
 * register. An urgent update (a dialog opening, a tab, a refetch) renders
 * with the committed pathname, so it never holds anything; nor does a render
 * outside the App Router (unit tests), where the pathname is null.
 */

interface HeldRead {
  done: boolean;
  settled: Promise<void>;
}

interface PendingNavigation {
  startedAt: number;
  reads: Map<string, HeldRead>;
  round?: { signature: string; promise: Promise<void> };
}

let committedPathname: string | null = null;
let commitCount = 0;
const pendingNavigations = new Map<string, PendingNavigation>();

function pendingNavigationKey(pathname: string | null): string | null {
  if (typeof window === "undefined") return null;
  if (pathname === null || committedPathname === null || pathname === committedPathname) return null;
  return `${commitCount}:${pathname}`;
}

function recordCommit(pathname: string | null) {
  if (pathname === committedPathname) return;
  committedPathname = pathname;
  commitCount += 1;
  pendingNavigations.clear();
}

/** The subset of query options a held read is started with. */
export interface HoldableQueryOptions {
  queryKey: QueryKey;
  queryFn?: unknown;
  staleTime?: unknown;
  gcTime?: number;
  retry?: unknown;
  retryDelay?: unknown;
  refetchOnMount?: unknown;
}

/** What the hook rendered with, from TanStack's own result. */
export interface HoldableQueryState {
  isEnabled: boolean;
  status: "pending" | "error" | "success";
  data: unknown;
}

/**
 * A read is held only when holding cannot cost a second request: a read that
 * is always stale (staleTime 0, the check-in lookup) or always refetched on
 * mount would be fetched again by its own observer right after the hold.
 */
function holdable(options: HoldableQueryOptions): boolean {
  // skipToken (a symbol) and a missing queryFn are not reads to start.
  if (typeof options.queryFn !== "function") return false;
  if (typeof options.staleTime !== "number" || options.staleTime <= 0) return false;
  return options.refetchOnMount !== "always";
}

function registerRead(navigationKey: string, queryClient: QueryClient, options: HoldableQueryOptions) {
  let navigation = pendingNavigations.get(navigationKey);
  if (!navigation) {
    navigation = { startedAt: Date.now(), reads: new Map() };
    pendingNavigations.set(navigationKey, navigation);
  }
  const hash = hashKey(options.queryKey);
  if (navigation.reads.has(hash)) return;
  const read: HeldRead = { done: false, settled: Promise.resolve() };
  // prefetchQuery shares the request with the observer that mounts later (and
  // with an intent prefetch already in flight), and never rejects. The client's
  // retry policy applies unless the hook passed its own.
  read.settled = queryClient
    .prefetchQuery({
      queryKey: options.queryKey,
      queryFn: options.queryFn as () => Promise<unknown>,
      staleTime: options.staleTime as number,
      ...(options.gcTime !== undefined ? { gcTime: options.gcTime } : {}),
      ...(options.retry !== undefined ? { retry: options.retry as FetchQueryOptions["retry"] } : {}),
      ...(options.retryDelay !== undefined ? { retryDelay: options.retryDelay as FetchQueryOptions["retryDelay"] } : {}),
    })
    .then(() => { read.done = true; });
  navigation.reads.set(hash, read);
}

/**
 * Called by useApiQuery and useRealtimeApiQuery on every render, after
 * useQuery. Outside a pending navigation it does nothing at all.
 */
export function useNavigationHoldRead(options: HoldableQueryOptions, state: HoldableQueryState) {
  const queryClient = useQueryClient();
  const pathname = useContext(NavigationHoldPathnameContext);
  const navigationKey = pendingNavigationKey(pathname);
  if (navigationKey === null) return;
  if (!state.isEnabled || state.status !== "pending" || state.data !== undefined) return;
  if (!holdable(options)) return;
  registerRead(navigationKey, queryClient, options);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { window.setTimeout(resolve, ms); });
}

/** The promise the gate waits on, or null when nothing should be held. */
function holdFor(pathname: string | null): Promise<void> | null {
  const navigationKey = pendingNavigationKey(pathname);
  if (navigationKey === null) return null;
  const navigation = pendingNavigations.get(navigationKey);
  if (!navigation) return null;
  const remaining = navigation.startedAt + NAVIGATION_HOLD_CAP_MS - Date.now();
  if (remaining <= 0) return null;
  const waiting = [...navigation.reads].filter(([, read]) => !read.done);
  if (waiting.length === 0) return null;
  // React needs the same promise on every retry of the same render; a new
  // read registered on a later attempt starts a new round.
  const signature = waiting.map(([hash]) => hash).sort().join("|");
  if (navigation.round?.signature === signature) return navigation.round.promise;
  const promise = Promise.race([
    Promise.all(waiting.map(([, read]) => read.settled)).then(() => undefined),
    sleep(remaining),
  ]);
  navigation.round = { signature, promise };
  return promise;
}

/**
 * Rendered once, after the route tree, in the root layout. It records each
 * committed pathname and, while a navigation is pending, suspends on that
 * navigation's reads so React keeps the current screen meanwhile.
 */
export function NavigationHoldGate() {
  const pathname = useContext(NavigationHoldPathnameContext);
  useLayoutEffect(() => { recordCommit(pathname); }, [pathname]);
  const hold = holdFor(pathname);
  if (hold) use(hold);
  return null;
}

/** Test seam: forget committed state between tests. */
export function resetNavigationHoldForTests() {
  committedPathname = null;
  commitCount = 0;
  pendingNavigations.clear();
}
