"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/switch";
import type { AiRunView } from "@/lib/ai/contracts";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { useApp } from "@/lib/providers/app-providers";
import { capabilityAvailable, useAiSettings } from "./use-assist";

/** "Prepare a report" for the period on screen. Hidden unless the gym's assistance and the person's access allow it. */
export function PrepareReportButton({ from, to, branchId, onStarted }: { from: string; to: string; branchId?: string; onStarted: (run: AiRunView) => void }) {
  const { t } = useLocale();
  const format = useFormat();
  const { session } = useApp();
  const { data: settings } = useAiSettings();
  const [open, setOpen] = useState(false);
  const [withDownload, setWithDownload] = useState(false);
  const start = useApiMutation((api, _unused: void) => api.startAiRun({ playbook: "management_report", params: { from, to, includeExport: withDownload }, ...(branchId ? { branchId } : {}), requestKey: crypto.randomUUID() }), {
    onSuccess: (run) => { setOpen(false); onStarted(run); },
  });
  if (!(session?.permissions ?? []).includes("reports.financial.read") || !capabilityAvailable(settings, "report_job", true)) return null;
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} data-testid="prepare-report">{t("aiWork.report.prepare")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("aiWork.report.prepare")}</DialogTitle>
            <DialogDescription>{t("aiWork.report.prepareHint")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-[13px] text-ink-2">{t("aiWork.report.title", { from: format.date(from), to: format.date(to) })}</p>
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <Checkbox checked={withDownload} onCheckedChange={(checked) => setWithDownload(checked === true)} />
              {t("aiWork.report.includeDownload")}
            </label>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("common.action.cancel")}</Button>
            <Button type="button" loading={start.isPending} onClick={() => start.mutate()} data-testid="prepare-report-start">{t("aiWork.report.prepare")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const NOBODY = "__nobody__";

/** "Prepare the handover" for one branch, optionally given to the next person as a task. */
export function PrepareHandoverButton({ branchId, onStarted }: { branchId: string; onStarted: (run: AiRunView) => void }) {
  const { t } = useLocale();
  const { session } = useApp();
  const { data: settings } = useAiSettings();
  const [open, setOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState(NOBODY);
  const canAssign = (session?.permissions ?? []).includes("crm.write");
  const assignees = useApiQuery(["ai", "handover-assignees", branchId], (api) => api.listChecklistAssignees(branchId), { enabled: open && canAssign });
  const start = useApiMutation((api, _unused: void) => api.startAiRun({ playbook: "shift_handover", params: assigneeId !== NOBODY ? { assigneeId } : {}, branchId, requestKey: crypto.randomUUID() }), {
    onSuccess: (run) => { setOpen(false); onStarted(run); },
  });
  if (!(session?.permissions ?? []).includes("members.read") || !capabilityAvailable(settings, "handover_job", true)) return null;
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} data-testid="prepare-handover">{t("aiWork.handover.prepare")}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("aiWork.handover.prepare")}</DialogTitle>
            <DialogDescription>{t("aiWork.handover.prepareHint")}</DialogDescription>
          </DialogHeader>
          {canAssign ? (
            <DialogBody>
              <Field label={t("aiWork.handover.assignTo")}>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger aria-label={t("aiWork.handover.assignTo")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NOBODY}>{t("aiWork.handover.nobody")}</SelectItem>
                    {(assignees.data ?? []).map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </DialogBody>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("common.action.cancel")}</Button>
            <Button type="button" loading={start.isPending} onClick={() => start.mutate()} data-testid="prepare-handover-start">{t("aiWork.handover.prepare")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
