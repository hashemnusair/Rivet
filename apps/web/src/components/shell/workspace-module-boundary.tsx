"use client";

import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkspaceModuleKey } from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { QueryErrorState, StatePanel } from "@/components/ui/states";

/**
 * Shared direct-route boundary for subscription capabilities. Navigation is a
 * convenience filter; this server-owned workspace snapshot is the route-level
 * lock used when an operator pastes a URL or opens a saved bookmark.
 */
export function WorkspaceModuleBoundary({ moduleKey, children }: { moduleKey: WorkspaceModuleKey; children: ReactNode }) {
  const { session } = useApp();
  const workspaceQuery = useApiQuery(qk.workspaceAccess, (api) => api.getWorkspaceAccess(), { enabled: Boolean(session) });
  const moduleStatus = workspaceQuery.data?.modules.find((module) => module.key === moduleKey);

  if (workspaceQuery.isLoading) return <StatePanel title="Loading…" />;
  if (workspaceQuery.error || !workspaceQuery.data) return <QueryErrorState error={workspaceQuery.error} onRetry={() => void workspaceQuery.refetch()} />;
  if (!moduleStatus?.entitled) return <StatePanel icon={LockKeyhole} title={`${moduleKey[0]?.toUpperCase() ?? "This feature"}${moduleKey.slice(1)} is not included in your plan`} description="Your gym’s plan does not include this feature. To add it, ask RIVET on the Support page." />;
  if (!moduleStatus.enabled) return <StatePanel icon={LockKeyhole} title={`${moduleStatus.label} is turned off`} description="This feature is turned off for your gym. Ask RIVET on the Support page if you need it." />;
  return <>{children}</>;
}
