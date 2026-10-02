"use client";
import { useT } from "@/lib/i18n/provider";

import { Boxes, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ForbiddenState, QueryErrorState, StatePanel } from "@/components/ui/states";
import { FacilityTaskWorkspace } from "./facility-task-workspace";

/**
 * Maintenance has its own page: cleaning, inspections and incidents by gym
 * space. Stock & purchasing links here instead of holding it as a tab.
 */
export function MaintenanceWorkspace() {
  const t = useT();
  const { session, setBranch } = useApp();
  const { can } = usePermissions();
  const searchParams = useSearchParams();
  const router = useRouter();
  const branchId = session?.activeBranchId;
  const branches = session?.branches ?? [];
  const branchLabel = branchId ? branches.find((branch) => branch.id === branchId)?.name ?? branchId : t("common.label.allBranches");
  const writeEnabled = can("operations.manage");
  const zonesQuery = useApiQuery(qk.operations({ kind: "equipment-zones", branchId }), (api) => api.listZones({ branchId, includeArchived: false }), { enabled: Boolean(branchId) });

  useEffect(() => {
    const requestedBranchId = searchParams.get("branch");
    if (!requestedBranchId || session?.activeBranchId === requestedBranchId || !session?.branches.some((branch) => branch.id === requestedBranchId)) return;
    void setBranch(requestedBranchId);
  }, [searchParams, session?.activeBranchId, session?.branches, setBranch]);

  if (!can("members.read")) return <ForbiddenState description="You don’t have access to maintenance." />;

  return (
    <div className="space-y-4" data-testid="maintenance-workspace">
      <PageHeader title={t("palette.pages.maintenance")} description={branchId ? `Cleaning, inspections and incidents at ${branchLabel}.` : "Choose a branch to see its cleaning, inspections and incidents."} actions={<div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-2"><label htmlFor="maintenance-branch" className="sr-only">{t("common.label.branch")}</label><Select value={branchId ?? "all"} onValueChange={(value) => { void setBranch(value === "all" ? undefined : value);
            const next = new URLSearchParams(searchParams.toString());
            if (value === "all") next.delete("branch"); else next.set("branch", value);
            next.delete("zone"); next.delete("action");
            router.replace(`/maintenance?${next}`, { scroll: false }); }}><SelectTrigger id="maintenance-branch" aria-label={t("common.label.branch")} className="min-w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("common.label.allBranches")}</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div><Button asChild variant="secondary" size="sm"><Link href={branchId ? `/operations?branch=${encodeURIComponent(branchId)}` : "/operations"}><Boxes />{" "}{t("nav.item.operations")}</Link></Button></div>} />
      {branchId && zonesQuery.isError ? <QueryErrorState error={zonesQuery.error} onRetry={() => void zonesQuery.refetch()} /> : branchId && zonesQuery.isLoading ? <div className="panel h-40 animate-pulse" aria-label="Loading areas" /> : branchId ? <FacilityTaskWorkspace key={branchId} branchId={branchId} zones={zonesQuery.data ?? []} writeEnabled={writeEnabled} /> : <StatePanel icon={ClipboardCheck} title="Choose a branch first" description="Each branch has its own maintenance list. Choose a branch above." className="mt-2" />}
    </div>
  );
}
