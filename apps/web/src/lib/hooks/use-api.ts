"use client";

import {
  hashKey,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { getApi } from "@/lib/api/client";
import { useLocale } from "@/lib/i18n/provider";
import { ERR, isApiError, localizeApiError } from "@/lib/api/errors";
import { INVALIDATE_ALL } from "@/lib/api/keys";
import { currentApiScopeEpoch } from "@/lib/api/scope";
import { useNavigationHoldRead } from "@/lib/navigation/navigation-hold";
import { QUERY_GC_TIME_MS } from "@/lib/providers/query-policy";

/**
 * A denied or signed-out answer is final for this session: the server has
 * re-checked the actor's role, branch and membership and refused. Unlike a
 * network failure, no retry changes it, and a snapshot loaded before access
 * was revoked must not stay on screen behind a "could not refresh" notice.
 */
export function isAccessDenied(error: unknown): boolean {
  return isApiError(error) && (error.code === ERR.FORBIDDEN || error.code === ERR.UNAUTHENTICATED);
}

export type ApiQueryOptions<TData> = Omit<UseQueryOptions<TData, Error>, "queryKey" | "queryFn"> & {
  /**
   * Keep the last result on screen while this query's arguments change, but
   * only while these values stay the same. Pass what identifies the record or
   * scope (branch, member, lead), never the filters: a search, sort, filter or
   * page change keeps the previous list visible until the new one arrives; a
   * change of branch, record or signed-in scope shows the loading state
   * instead, so one branch's or member's data never appears under another.
   */
  keepPreviousWithin?: readonly unknown[];
};

/**
 * The scope each cached result was read under, by query hash, recorded when
 * the read starts (or a live value arrives). Kept outside the query's options
 * because those are rewritten on every render: a result read under one scope
 * must not be relabelled with the next one by a re-render after a switch.
 */
const readScopes = new Map<string, string>();

/**
 * placeholderData that reuses the previous key's data only when that data was
 * read under the same scope. The API scope epoch (sign-in, organization and
 * branch switches) is always part of the scope. `record` must be called when
 * a read for `key` starts or a live value for it arrives.
 */
export function scopedPlaceholder<TData>(scope: readonly unknown[] | undefined) {
  if (!scope) return undefined;
  const scopeHash = hashKey([currentApiScopeEpoch(), ...scope]);
  return {
    record: (key: QueryKey) => { readScopes.set(hashKey(key), hashKey([currentApiScopeEpoch(), ...scope])); },
    // TanStack types placeholder data as NonFunctionGuard<TData>; query data
    // here is never a function, so the previous result passes through as is.
    placeholderData: ((previousData: TData | undefined, previousQuery?: { queryHash: string }) =>
      previousQuery && readScopes.get(previousQuery.queryHash) === scopeHash ? previousData : undefined) as UseQueryOptions<TData, Error>["placeholderData"],
  };
}

export function useApiQuery<TData>(
  key: QueryKey,
  fn: (api: ReturnType<typeof getApi>) => Promise<TData>,
  options?: ApiQueryOptions<TData>,
) {
  const { locale } = useLocale();
  const { keepPreviousWithin, ...callerOptions } = options ?? {};
  const scoped = scopedPlaceholder<TData>(keepPreviousWithin);
  const queryOptions: UseQueryOptions<TData, Error> = {
    queryKey: key,
    queryFn: () => {
      scoped?.record(key);
      return fn(getApi());
    },
    // Most operational mutations invalidate their affected prefixes. A short
    // freshness window avoids refetching the same expensive projection on
    // every navigation, focus event, and component remount while preserving
    // immediate updates after a mutation.
    staleTime: 10_000,
    gcTime: QUERY_GC_TIME_MS,
    // Refresh one-shot screens when an operator returns to them. Realtime
    // screens use useRealtimeApiQuery and intentionally keep their websocket
    // as the primary source of updates.
    refetchOnWindowFocus: true,
    ...callerOptions,
    ...(scoped ? { placeholderData: scoped.placeholderData } : {}),
  };
  const query = useQuery<TData, Error>(queryOptions);
  // While a navigation to this screen is pending, start this read now and let
  // the current screen stay until it is in (see navigation-hold.tsx).
  useNavigationHoldRead(queryOptions, query);

  // TanStack Query can retain a useful snapshot while a background refetch
  // fails. Treat that as a stale-data warning rather than replacing a working
  // table/card with a full-page error; initial failures still remain errors.
  // A refusal (revoked role, branch or membership, or a signed-out account)
  // is not a refresh problem: the snapshot is withdrawn and the denial shown.
  const presentedError = useMemo(() => query.error ? localizeApiError(query.error, locale) : null, [query.error, locale]);
  const hasRenderedData = query.data !== undefined;
  const denied = query.isError && isAccessDenied(query.error);
  return {
    ...query,
    error: presentedError,
    data: denied ? undefined : query.data,
    isError: query.isError && (!hasRenderedData || denied),
    isBackgroundError: query.isError && hasRenderedData && !denied,
  };
}

/** Broad invalidation after commercial mutations so every surface agrees. */
export function useInvalidate() {
  const queryClient = useQueryClient();
  return useCallback(
    async (extraKeys: QueryKey[] = []) => {
      const prefixes = new Set<string>([
        ...INVALIDATE_ALL,
        ...extraKeys.map((key) => String(key[0])),
      ]);
      // One predicate pass prevents overlapping prefixes from scheduling the
      // same active query for refetch many times after a mutation.
      await queryClient.invalidateQueries({
        predicate: (query) => prefixes.has(String(query.queryKey[0])),
      });
    },
    [queryClient],
  );
}

export function useApiMutation<TData, TVariables = void>(
  fn: (api: ReturnType<typeof getApi>, variables: TVariables) => Promise<TData>,
  options?: Omit<UseMutationOptions<TData, Error, TVariables>, "mutationFn"> & {
    successMessage?: string | ((data: TData) => string);
  },
) {
  // onSuccess/onError must be destructured out: leaving them in the spread
  // would overwrite these wrappers and silently drop the toasts whenever a
  // caller passes both a successMessage and its own callback.
  const { locale, t } = useLocale();
  // A pending write can outlive a UI language change. Its eventual error or
  // refresh warning must use the current language without reissuing the write.
  const presentation = useRef({ locale, t });
  useEffect(() => { presentation.current = { locale, t }; }, [locale, t]);
  const { successMessage, onSuccess, onError, ...rest } = options ?? {};
  const mutation = useMutation<TData, Error, TVariables>({
    mutationFn: (variables) => fn(getApi(), variables),
    // TanStack awaits this callback before the mutation leaves its pending
    // state, so the caller's follow-up work (cache invalidation, navigation,
    // closing a dialog) is awaited too: a Submit button stays disabled until
    // the refreshed data is in place instead of re-enabling on the bare
    // network response. A failure inside that follow-up must not be reported
    // as a failed write, though: the server already committed the change,
    // and a retry toast would invite a second submission. Log it and tell
    // the operator that the screen, not the record, is what needs a refresh.
    onSuccess: async (data, variables, onMutateResult, context) => {
      if (successMessage) {
        toast.success(typeof successMessage === "function" ? successMessage(data) : successMessage);
      }
      try {
        await onSuccess?.(data, variables, onMutateResult, context);
      } catch (followUpError) {
        console.error("Mutation follow-up failed after the change was saved", followUpError);
        toast.warning(presentation.current.t("apiErrors.savedRefresh"));
      }
    },
    onError: async (error, variables, onMutateResult, context) => {
      const presented = localizeApiError(error, presentation.current.locale);
      toast.error(presented.message);
      await onError?.(presented, variables, onMutateResult, context);
    },
    ...rest,
  });
  const presentedError = useMemo(() => mutation.error ? localizeApiError(mutation.error, locale) : null, [mutation.error, locale]);
  const execute = mutation.mutateAsync;
  const mutateAsync = useCallback<typeof execute>(async (variables, callOptions) => {
    try { return await execute(variables, callOptions); }
    catch (error) { throw localizeApiError(error, presentation.current.locale); }
  }, [execute]);
  return { ...mutation, error: presentedError, mutateAsync };
}
