"use client";

import { qk } from "@/lib/api/keys";
import type { AiMemberBriefResult, AiRunView, AiSettingsView } from "@/lib/ai/contracts";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";

/** The gym's assistance settings; pages hide assistance entry points when it is off. */
export function useAiSettings(enabled = true) {
  return useApiQuery<AiSettingsView>(qk.aiSettings, (api) => api.getAiSettings(), { enabled, refetchOnWindowFocus: false, staleTime: 30_000 });
}

export function useMemberBrief(memberId: string | undefined, enabled = true) {
  return useApiQuery<AiMemberBriefResult>(qk.memberBrief(memberId ?? ""), (api) => api.getMemberBrief(memberId ?? ""), { enabled: enabled && Boolean(memberId), refetchOnWindowFocus: false, retry: false });
}

/** A run stays live while it works; navigating back reads the same run from the server. */
export function useAiRun(runId: string | undefined) {
  return useRealtimeApiQuery<AiRunView>({
    queryKey: qk.aiRun(runId ?? ""),
    query: (api) => api.getAiRun(runId ?? ""),
    subscribe: (api, onValue, onError) => api.subscribeAiRun(runId ?? "", onValue, onError),
    enabled: Boolean(runId),
    fallbackIntervalMs: 3_000,
  });
}

export function isRunWorking(run: Pick<AiRunView, "status"> | undefined): boolean {
  return Boolean(run && (run.status === "queued" || run.status === "running"));
}

/** Whether a capability is usable for this reader right now (server rechecks on every call). */
export function capabilityAvailable(settings: AiSettingsView | undefined, key: AiSettingsView["capabilities"][number]["key"], needsExecute = false): boolean {
  const capability = settings?.capabilities?.find((item) => item.key === key);
  if (!settings || !capability?.available || settings.adapterMode === "off" || settings.globalStop) return false;
  return needsExecute ? capability.effective === "execute" : capability.effective !== "off";
}
