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

  if (workspaceQuery.isLoading) return <StatePanel title="Loading workspace access…" />;
  if (workspaceQuery.error || !workspaceQuery.data) return <QueryErrorState error={workspaceQuery.error} onRetry={() => void workspaceQuery.refetch()} />;
  if (!moduleStatus?.entitled) return <StatePanel icon={LockKeyhole} title={`${moduleKey[0]?.toUpperCase() ?? "Workspace"}${moduleKey.slice(1)} is not included`} description="Your gym’s current tier does not include this workspace module. Ask the platform team about an upgrade from Support." />;
  if (!moduleStatus.enabled) return <StatePanel icon={LockKeyhole} title={`${moduleStatus.label} is paused`} description="An organization owner has paused this workspace module in settings." />;
  return <>{children}</>;
}
