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
import { isApiError } from "@/lib/api/errors";
import { INVALIDATE_ALL } from "@/lib/api/keys";

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
  const hasRenderedData = query.data !== undefined;
  return {
    ...query,
    isError: query.isError && !hasRenderedData,
    isBackgroundError: query.isError && hasRenderedData,
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
    onSuccess: (data, variables, onMutateResult, context) => {
      if (successMessage) {
        toast.success(typeof successMessage === "function" ? successMessage(data) : successMessage);
      }
      onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: (error, variables, onMutateResult, context) => {
      if (isApiError(error)) {
        toast.error(error.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
      onError?.(error, variables, onMutateResult, context);
    },
    ...rest,
  });
}
