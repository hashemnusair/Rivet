"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";

export function ChecklistHandover({ branchId }: { branchId: string }) {
  const day = useApiQuery(qk.checklistDay(branchId), api => api.getChecklistDay({ branchId }));
  if (day.isLoading) return <p className="text-xs text-ink-3">Checking handover tasks…</p>;
  if (day.isError) return <p className="text-xs text-warning-deep">Handover tasks could not load. <Button size="sm" variant="ghost" onClick={() => void day.refetch()}>Retry</Button></p>;
  const unresolved = [...(day.data?.carryover ?? []), ...(day.data?.runs ?? [])].filter(run => run.items.some(item => item.status === "failed" || (item.required && item.status === "pending")));
  if (!unresolved.length) return null;
  return <section className="rounded-md border border-line p-3" aria-label="Checklist handover">
    <p className="text-sm font-medium">Checklist handover</p>
    <p className="mt-1 text-xs text-ink-3">Unresolved work today and from the previous seven days.</p>
    <ul className="mt-2 space-y-1 text-xs">{unresolved.map(run => <li key={`${run.templateId}:${run.localDate}`}>{run.name} · {run.localDate} · {run.assignedUserName ?? run.assignedRole}</li>)}</ul>
    <Link className="mt-2 inline-block text-sm underline" href={`/checklists?branch=${encodeURIComponent(branchId)}`}>Review daily checklists</Link>
  </section>;
}
