"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { getApi } from "@/lib/api/client";
import { ERR, isApiError } from "@/lib/api/errors";
import { INVALIDATE_ALL } from "@/lib/api/keys";

/**
 * A denied or signed-out answer is final for this session: the server has
 * re-checked the actor's role, branch and membership and refused. Unlike a
 * network failure, no retry changes it, and a snapshot loaded before access
 * was revoked must not stay on screen behind a "could not refresh" notice.
 */
export function isAccessDenied(error: unknown): boolean {
  return isApiError(error) && (error.code === ERR.FORBIDDEN || error.code === ERR.UNAUTHENTICATED);
}

export function useApiQuery<TData>(
  key: QueryKey,
  fn: (api: ReturnType<typeof getApi>) => Promise<TData>,
  options?: Omit<UseQueryOptions<TData, Error>, "queryKey" | "queryFn">,
) {
  const query = useQuery<TData, Error>({
    queryKey: key,
    queryFn: () => fn(getApi()),
    // Most operational mutations invalidate their affected prefixes. A short
    // freshness window avoids refetching the same expensive projection on
    // every navigation, focus event, and component remount while preserving
    // immediate updates after a mutation.
    staleTime: 10_000,
    gcTime: 5 * 60_000,
    // Refresh one-shot screens when an operator returns to them. Realtime
    // screens use useRealtimeApiQuery and intentionally keep their websocket
    // as the primary source of updates.
    refetchOnWindowFocus: true,
    ...options,
  });

  // TanStack Query can retain a useful snapshot while a background refetch
  // fails. Treat that as a stale-data warning rather than replacing a working
  // table/card with a full-page error; initial failures still remain errors.
  // A refusal (revoked role, branch or membership, or a signed-out account)
  // is not a refresh problem: the snapshot is withdrawn and the denial shown.
  const hasRenderedData = query.data !== undefined;
  const denied = query.isError && isAccessDenied(query.error);
  return {
    ...query,
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
  const { successMessage, onSuccess, onError, ...rest } = options ?? {};
  return useMutation<TData, Error, TVariables>({
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
        toast.warning("Saved, but this screen could not refresh. Reload to see the latest data.");
      }
    },
    onError: async (error, variables, onMutateResult, context) => {
      if (isApiError(error)) {
        toast.error(error.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
      await onError?.(error, variables, onMutateResult, context);
    },
    ...rest,
  });
}
