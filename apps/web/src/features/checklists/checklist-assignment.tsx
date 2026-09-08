"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/api/keys";
import type { ChecklistRun } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";

export function ChecklistAssigneeSelect({ branchId, value, onChange, disabled = false }: { branchId: string; value?: string; onChange: (id: string | undefined) => void; disabled?: boolean }) {
  const staff = useApiQuery(qk.checklistAssignees(branchId), api => api.listChecklistAssignees(branchId));
  if (staff.isError) return <p className="text-xs text-danger">Staff could not load. <Button variant="ghost" size="sm" onClick={() => void staff.refetch()}>Retry</Button></p>;
  return <label className="grid gap-1 text-xs">Responsible person
    <select className="h-10 rounded-md border border-line-2 bg-surface px-2 text-sm" value={value ?? ""} onChange={event => onChange(event.target.value || undefined)} disabled={disabled || staff.isLoading}>
      <option value="">Use responsible role</option>
      {value && !staff.data?.some(user => user.id === value) ? <option value={value} disabled>Previously assigned staff</option> : null}
      {staff.data?.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
    </select>
  </label>;
}

export function ChecklistRunAssignment({ run }: { run: ChecklistRun }) {
  const [editing, setEditing] = useState(false);
  const [userId, setUserId] = useState(run.assignedUserId);
  const invalidate = useInvalidate();
  const assign = useApiMutation(api => api.assignChecklistRun({ templateId: run.templateId, date: run.localDate, assignedUserId: userId }), {
    successMessage: "Checklist responsibility updated.",
    onSuccess: async () => { setEditing(false); await invalidate(); },
  });
  if (!editing) return <Button variant="ghost" size="sm" onClick={() => { setUserId(run.assignedUserId); setEditing(true); }}>Assign this day</Button>;
  return <div className="flex flex-wrap items-end gap-2 border-t border-line p-3">
    <ChecklistAssigneeSelect branchId={run.branchId} value={userId} onChange={setUserId} disabled={assign.isPending} />
    <Button size="sm" loading={assign.isPending} onClick={() => assign.mutate()}>Save assignment</Button><Button size="sm" variant="ghost" disabled={assign.isPending} onClick={() => setEditing(false)}>Cancel</Button>
  </div>;
}
