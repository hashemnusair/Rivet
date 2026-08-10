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
      await Promise.all([
        ...INVALIDATE_ALL.map((prefix) => queryClient.invalidateQueries({ queryKey: [prefix] })),
        ...extraKeys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
      ]);
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
  const { successMessage, ...rest } = options ?? {};
  return useMutation<TData, Error, TVariables>({
    mutationFn: (variables) => fn(getApi(), variables),
    onSuccess: (data, variables, onMutateResult, context) => {
      if (successMessage) {
        toast.success(typeof successMessage === "function" ? successMessage(data) : successMessage);
      }
      options?.onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: (error, variables, onMutateResult, context) => {
      if (isApiError(error)) {
        toast.error(error.message);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
      options?.onError?.(error, variables, onMutateResult, context);
    },
    ...rest,
  });
}
