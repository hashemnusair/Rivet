"use client";

import { keepPreviousData, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { getApi } from "@/lib/api/client";

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
  const enabled = options.enabled ?? true;
  const fallbackIntervalMs = options.fallbackIntervalMs ?? 15_000;
  const queryClient = useQueryClient();
  const [streamState, setStreamState] = useState<StreamState>("connecting");
  const subscribeRef = useRef(options.subscribe);
  const queryRef = useRef(options.query);
  const stableKey = useMemo(() => JSON.stringify(options.queryKey), [options.queryKey]);

  useEffect(() => {
    subscribeRef.current = options.subscribe;
    queryRef.current = options.query;
  }, [options.query, options.subscribe]);

  const query = useQuery<T, Error>({
    queryKey: options.queryKey,
    queryFn: () => queryRef.current(getApi()),
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: streamState === "fallback" ? fallbackIntervalMs : false,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

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
    const handleOffline = () => scheduleReconnect();
    const handleOnline = () => { if (!disposed) void connect(); };
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
    // dispose the previous Convex watch without relying on caller memoization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fallbackIntervalMs, queryClient, stableKey]);

  const hasRenderedData = query.data !== undefined;
  return {
    ...query,
    streamState,
    isError: query.isError && !hasRenderedData,
    isBackgroundError: query.isError && hasRenderedData,
  };
}
