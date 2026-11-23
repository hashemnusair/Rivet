"use client";

import { useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/provider";
import { localizeApiError } from "@/lib/api/errors";
import { getApi } from "@/lib/api/client";
import { isConvexMode } from "@/lib/api/ConvexGymOSApi";
import { useApiScopeEpoch } from "@/lib/api/scope";
import { isAccessDenied, scopedPlaceholder } from "@/lib/hooks/use-api";
import { useNavigationHoldRead } from "@/lib/navigation/navigation-hold";
import { QUERY_GC_TIME_MS } from "@/lib/providers/query-policy";

type StreamState = "connecting" | "live" | "fallback";

/**
 * Shared query/subscription bridge for operational screens.
 *
 * A successful stream writes directly into the normal TanStack cache. The
 * last good snapshot stays rendered during reconnects; polling starts only
 * after a stream failure and stops as soon as the stream produces data again.
 */
export function useRealtimeApiQuery<T>(options: {
  queryKey: QueryKey;
  query: (api: ReturnType<typeof getApi>) => Promise<T>;
  subscribe: (api: ReturnType<typeof getApi>, onValue: (value: T) => void, onError: (error: unknown) => void) => Promise<() => void>;
  enabled?: boolean;
  fallbackIntervalMs?: number;
}) {
  const { locale } = useLocale();
  const enabled = options.enabled ?? true;
  const fallbackIntervalMs = options.fallbackIntervalMs ?? 15_000;
  const convexMode = isConvexMode();
  const queryClient = useQueryClient();
  // The branch, organization or signed-in identity behind the API client.
  // A watch opened under one scope must not keep feeding a screen after the
  // operator switches to another, even when the query key itself does not
  // name the branch.
  const scopeEpoch = useApiScopeEpoch();
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const subscribeRef = useRef(options.subscribe);
  const queryRef = useRef(options.query);
  const stableKey = useMemo(() => JSON.stringify(options.queryKey), [options.queryKey]);

  useEffect(() => {
    subscribeRef.current = options.subscribe;
    queryRef.current = options.query;
  }, [options.query, options.subscribe]);

  const placeholder = scopedPlaceholder<T>([])!;
  const queryOptions: UseQueryOptions<T, Error> = {
    queryKey: options.queryKey,
    queryFn: () => {
      placeholder.record(options.queryKey);
      return queryRef.current(getApi());
    },
    // Keep the ordinary query enabled until the watch has delivered its first
    // value. A native Convex watch can remain in its connecting state without
    // immediately exposing a local snapshot; disabling the query during that
    // window makes detail pages render with undefined data. Once the stream is
    // live it owns updates, and the ordinary query is only re-enabled for the
    // failure-only polling fallback.
    enabled: enabled && (!convexMode || streamState !== "live"),
    // While a filter, search or page changes, the last list stays on screen
    // until the new one arrives, but never across a sign-in, organization or
    // branch change: those show the loading state instead of the previous
    // scope's figures. Reconnects keep the same key, so the last snapshot
    // simply stays.
    placeholderData: placeholder.placeholderData,
    staleTime: 10_000,
    gcTime: QUERY_GC_TIME_MS,
    refetchOnWindowFocus: false,
    refetchInterval: streamState === "fallback" ? fallbackIntervalMs : false,
    refetchIntervalInBackground: false,
  };
  const query = useQuery<T, Error>(queryOptions);
  // While a navigation to this screen is pending, read the first snapshot now
  // and keep the current screen until it is in (see navigation-hold.tsx). The
  // watch itself still opens after mount, as before.
  useNavigationHoldRead(queryOptions, query);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    // A new key or scope means the cached "live" state belonged to another
    // watch. Drop back to connecting so the ordinary query fetches the new
    // record under the new scope instead of leaving the previous snapshot
    // presented as current until the fresh stream delivers.
    setStreamState("connecting");
    const scheduleReconnect = () => {
      if (disposed || retryTimer) return;
      setStreamState("fallback");
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, 5_000);
    };
    const connect = async () => {
      stop?.();
      stop = undefined;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        scheduleReconnect();
        return;
      }
      setStreamState((current) => current === "live" ? current : "connecting");
      try {
        const disposer = await subscribeRef.current(
          getApi(),
          (value) => {
            if (disposed) return;
            placeholder.record(options.queryKey);
            queryClient.setQueryData(options.queryKey, value);
            setStreamState("live");
          },
          scheduleReconnect,
        );
        if (disposed) disposer(); else stop = disposer;
      } catch {
        scheduleReconnect();
      }
    };
    const handleOffline = () => {
      // Do not leave a dead Convex watch alive while the browser is offline.
      // The last good TanStack snapshot remains visible and reconnect starts
      // only after the browser reports a usable network again.
      stop?.();
      stop = undefined;
      scheduleReconnect();
    };
    const handleOnline = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      if (!disposed) void connect();
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    void connect();
    return () => {
      disposed = true;
      stop?.();
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
    // Query keys are serialized so tenant, branch, route, and record changes
    // dispose the previous Convex watch without relying on caller memoization;
    // the scope epoch covers switches the key does not carry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fallbackIntervalMs, queryClient, scopeEpoch, stableKey]);

  // As in useApiQuery: a refusal after the watch or its fallback fetch is
  // re-checked by the server withdraws the snapshot instead of leaving stale
  // data behind a "could not refresh" notice.
  const presentedError = useMemo(() => query.error ? localizeApiError(query.error, locale) : null, [query.error, locale]);
  const hasRenderedData = query.data !== undefined;
  const denied = query.isError && isAccessDenied(query.error);
  return {
    ...query,
    error: presentedError,
    data: denied ? undefined : query.data,
    streamState,
    isError: query.isError && (!hasRenderedData || denied),
    isBackgroundError: query.isError && hasRenderedData && !denied,
  };
}
