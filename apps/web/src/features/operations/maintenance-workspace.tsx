"use client";

import { Boxes, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ForbiddenState, StatePanel } from "@/components/ui/states";
import { FacilityTaskWorkspace } from "./facility-task-workspace";

/**
 * Maintenance has its own page: cleaning, inspections and incidents by gym
 * space. Stock & purchasing links here instead of holding it as a tab.
 */
export function MaintenanceWorkspace() {
  const { session, setBranch } = useApp();
  const { can } = usePermissions();
  const searchParams = useSearchParams();
  const branchId = session?.activeBranchId;
  const branches = session?.branches ?? [];
  const branchLabel = branchId ? branches.find((branch) => branch.id === branchId)?.name ?? branchId : "All branches";
  const writeEnabled = can("operations.manage");
  const zonesQuery = useApiQuery(qk.operations({ kind: "equipment-zones", branchId }), (api) => api.listZones({ branchId, includeArchived: false }), { enabled: Boolean(branchId) });

  useEffect(() => {
    const requestedBranchId = searchParams.get("branch");
    if (!requestedBranchId || session?.activeBranchId === requestedBranchId || !session?.branches.some((branch) => branch.id === requestedBranchId)) return;
    void setBranch(requestedBranchId);
  }, [searchParams, session?.activeBranchId, session?.branches, setBranch]);

  if (!can("members.read")) return <ForbiddenState description="Maintenance is limited to gym team members with operational read access." />;

  return (
    <div className="space-y-4" data-testid="maintenance-workspace">
      <PageHeader eyebrow="Operations" title="Maintenance" description={branchId ? `Cleaning, inspections, and incidents at ${branchLabel.toLowerCase()}, organised by gym space.` : "Choose a branch to see its cleaning, inspection, and incident work."} actions={<div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11.5px] text-ink-2"><label htmlFor="maintenance-branch" className="sr-only">Maintenance branch</label><Select value={branchId ?? "all"} onValueChange={(value) => { void setBranch(value === "all" ? undefined : value); }}><SelectTrigger id="maintenance-branch" aria-label="Maintenance branch" className="h-8 min-w-44 border-0 bg-transparent px-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All branches</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></div><Button asChild variant="secondary" size="sm"><Link href={branchId ? `/operations?branch=${encodeURIComponent(branchId)}` : "/operations"}><Boxes /> Stock & purchasing</Link></Button></div>} />
      {branchId ? <FacilityTaskWorkspace branchId={branchId} zones={zonesQuery.data ?? []} writeEnabled={writeEnabled} /> : <StatePanel icon={ClipboardCheck} title="Choose a branch first" description="Maintenance is tracked separately for each branch. Choose a branch above to see cleaning, inspection, and incident tasks by gym space." className="mt-2" />}
    </div>
  );
}
