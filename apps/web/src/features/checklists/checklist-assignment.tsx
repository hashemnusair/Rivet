"use client";
import { useT } from "@/lib/i18n/provider";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/api/keys";
import type { ChecklistRun } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";

export function ChecklistAssigneeSelect({ branchId, value, onChange, disabled = false }: { branchId: string; value?: string; onChange: (id: string | undefined) => void; disabled?: boolean }) {
  const t = useT();
  const staff = useApiQuery(qk.checklistAssignees(branchId), api => api.listChecklistAssignees(branchId));
  if (staff.isError) return <p className="text-xs text-danger">{t("settingsDetails.staffListFailed")} <Button variant="ghost" size="sm" onClick={() => void staff.refetch()}>{t("common.action.retry")}</Button></p>;
  return <label className="grid gap-1 text-xs">{t("settingsDetails.responsiblePerson")}
    <select className="h-10 rounded-md border border-line-2 bg-surface px-2 text-sm" value={value ?? ""} onChange={event => onChange(event.target.value || undefined)} disabled={disabled || staff.isLoading}>
      <option value="">{t("settingsDetails.anyoneInRole")}</option>
      {value && !staff.data?.some(user => user.id === value) ? <option value={value} disabled>{t("settingsDetails.previousPerson")}</option> : null}
      {staff.data?.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
    </select>
  </label>;
}

export function ChecklistRunAssignment({ run }: { run: ChecklistRun }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [userId, setUserId] = useState(run.assignedUserId);
  const invalidate = useInvalidate();
  const assign = useApiMutation(api => api.assignChecklistRun({ templateId: run.templateId, date: run.localDate, assignedUserId: userId }), {
    successMessage: t("settingsDetails.assignmentSaved"),
    onSuccess: async () => { setEditing(false); await invalidate(); },
  });
  if (!editing) return <Button variant="ghost" size="sm" onClick={() => { setUserId(run.assignedUserId); setEditing(true); }}>{t("settingsDetails.assignPerson")}</Button>;
  return <div className="flex flex-wrap items-end gap-2 border-t border-line p-3">
    <ChecklistAssigneeSelect branchId={run.branchId} value={userId} onChange={setUserId} disabled={assign.isPending} />
    <Button size="sm" loading={assign.isPending} onClick={() => assign.mutate()}>{t("settingsDetails.saveAssignment")}</Button><Button size="sm" variant="ghost" disabled={assign.isPending} onClick={() => setEditing(false)}>{t("common.action.cancel")}</Button>
  </div>;
}
