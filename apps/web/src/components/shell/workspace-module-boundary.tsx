"use client";

import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkspaceModuleKey } from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { useLocale } from "@/lib/i18n/provider";
import { QueryErrorState, StatePanel } from "@/components/ui/states";

/**
 * Shared direct-route boundary for subscription capabilities. Navigation is a
 * convenience filter; this server-owned workspace snapshot is the route-level
 * lock used when an operator pastes a URL or opens a saved bookmark.
 */
export function WorkspaceModuleBoundary({ moduleKey, children }: { moduleKey: WorkspaceModuleKey; children: ReactNode }) {
  const { session } = useApp();
  const { t, locale } = useLocale();
  const workspaceQuery = useApiQuery(qk.workspaceAccess, (api) => api.getWorkspaceAccess(), { enabled: Boolean(session) });
  const moduleStatus = workspaceQuery.data?.modules.find((module) => module.key === moduleKey);

  if (workspaceQuery.isLoading) return <StatePanel title={t("common.state.loading")} />;
  if (workspaceQuery.error || !workspaceQuery.data) return <QueryErrorState error={workspaceQuery.error} onRetry={() => void workspaceQuery.refetch()} />;
  if (!moduleStatus?.entitled) return <StatePanel icon={LockKeyhole} title={t("palette.moduleBoundary.notIncludedTitle", { name: t(`palette.moduleBoundary.name.${moduleKey}`) })} description={t("palette.moduleBoundary.notIncludedBody")} />;
  if (!moduleStatus.enabled) return <StatePanel icon={LockKeyhole} title={t("palette.moduleBoundary.turnedOffTitle", { name: locale === "en" ? moduleStatus.label : t(`palette.moduleBoundary.label.${moduleKey}`) })} description={t("palette.moduleBoundary.turnedOffBody")} />;
  return <>{children}</>;
}
