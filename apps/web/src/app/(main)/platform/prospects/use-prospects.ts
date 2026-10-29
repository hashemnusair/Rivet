"use client";

import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/api/keys";
import { useApiMutation } from "@/lib/hooks/use-api";
import type { PlatformProspectsView, UpdatePlatformProspectInput } from "@/lib/platform/prospects";

/**
 * Saves changes to one prospect and puts the saved row straight into the
 * list, so the list and the open gym agree without a reload. Its history is
 * read again because the save added a line to it.
 */
export function useProspectUpdate() {
  const queryClient = useQueryClient();
  return useApiMutation((api, input: UpdatePlatformProspectInput) => api.updatePlatformProspect(input), {
    onSuccess: async (updated) => {
      queryClient.setQueryData<PlatformProspectsView>(qk.platformProspects, (current) => current ? { ...current, prospects: current.prospects.map((prospect) => prospect.id === updated.id ? updated : prospect) } : current);
      await queryClient.invalidateQueries({ queryKey: qk.platformProspectHistory(updated.id) });
    },
  });
}
