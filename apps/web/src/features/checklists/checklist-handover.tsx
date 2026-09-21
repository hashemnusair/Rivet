"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { HandoverGroupsView } from "@/features/branch-ops/handover-groups";

/**
 * Unresolved checklist work at handover: today and the previous seven days
 * (the handover window). Items are grouped by their own records where that
 * helps and listed plainly one click away; nothing here completes, closes,
 * reassigns or re-dates an item.
 */
export function ChecklistHandover({ branchId }: { branchId: string }) {
  const day = useApiQuery(qk.checklistDay(branchId), api => api.getChecklistDay({ branchId }));
  if (day.isLoading) return <p className="text-xs text-ink-3">Checking handover tasks…</p>;
  if (day.isError) return <p className="text-xs text-warning-deep">Handover tasks could not load. <Button size="sm" variant="ghost" onClick={() => void day.refetch()}>Retry</Button></p>;
  if (!day.data) return null;
  return (
    <div className="space-y-2">
      <HandoverGroupsView branchId={branchId} day={day.data} />
      <Link className="inline-block text-sm underline" href={`/checklists?branch=${encodeURIComponent(branchId)}`}>Review daily checklists</Link>
    </div>
  );
}
