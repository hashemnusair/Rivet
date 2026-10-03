"use client";
import { useT } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

import { ChecklistRunAssignment } from "@/features/checklists/checklist-assignment";

import { isApiError } from "@/lib/api/errors";

import { Check, CircleAlert, ClipboardCheck, Moon, Sun, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState, EmptyState, QueryErrorState } from "@/components/ui/states";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import type { ChecklistRun, ChecklistRunItem, SetChecklistItemInput, Zone } from "@/lib/domain/types";

interface ProblemDialogState {
  run: ChecklistRun;
  item: ChecklistRunItem;
  mode: "problem" | "correct";
}

interface EscalateDialogState {
  run: ChecklistRun;
  item: ChecklistRunItem;
}

const ROLE_KEYS = {
  owner: "staffTools.checklists.role.owner",
  manager: "staffTools.checklists.role.manager",
  sales: "staffTools.checklists.role.sales",
  receptionist: "staffTools.checklists.role.receptionist",
  trainer: "staffTools.checklists.role.trainer",
} as const;
const RESULT_KEYS = {
  pending: "staffTools.checklists.result.pending",
  completed: "staffTools.checklists.result.completed",
  failed: "staffTools.checklists.result.failed",
  skipped: "staffTools.checklists.result.skipped",
} as const;

export default function ChecklistsPage() {
  const t = useT();
  const format = useFormat();
  const { session } = useApp();
  const { can } = usePermissions();
  const branches = session?.branches ?? [];
  const params = useSearchParams();
  const router = useRouter();
  const requestedBranch = params.get("branch");
  // The branch is read from the URL alone, so Back/Forward and a refresh keep
  // the walkthrough the operator was on; an unknown id falls back to the
  // workspace branch.
  const branchId = branches.find((branch) => branch.id === requestedBranch)?.id ?? session?.activeBranchId ?? branches[0]?.id;
  const branchName = branches.find((branch) => branch.id === branchId)?.name;
  const chooseBranch = (id: string) => { router.replace(`/checklists?branch=${encodeURIComponent(id)}`, { scroll: false }); setProblem(undefined); setEscalate(undefined); };

  const dayQuery = useApiQuery(qk.checklistDay(branchId ?? ""), (api) => api.getChecklistDay({ branchId: branchId! }), { enabled: Boolean(branchId) });
  const invalidate = useInvalidate();
  const refresh = async () => invalidate([qk.checklistDay(branchId ?? "")]);

  const setItem = useApiMutation((api, input: SetChecklistItemInput) => api.setChecklistItem(input), { onSuccess: refresh });
  const [problem, setProblem] = useState<ProblemDialogState | undefined>();
  const [escalate, setEscalate] = useState<EscalateDialogState | undefined>();

  const day = dayQuery.data;
  const canEscalate = can("operations.manage");

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("nav.item.checklists")}
        description={t("staffTools.checklists.description")}
        actions={branches.length > 1 ? (
          <Select value={branchId ?? ""} onValueChange={chooseBranch}>
            <SelectTrigger sizeVariant="sm" className="w-44" aria-label={t("common.label.branch")}><SelectValue /></SelectTrigger>
            <SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
          </Select>
        ) : <span className="text-[13px] text-ink-2">{branchName}</span>}
      />

      {!branchId ? <EmptyState icon={ClipboardCheck} title={t("staffTools.checklists.noBranchTitle")} description={t("staffTools.checklists.noBranchDescription")} /> :
        dayQuery.isLoading ? <div className="space-y-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div> :
        dayQuery.error && (!day || (isApiError(dayQuery.error) && ["FORBIDDEN", "UNAUTHENTICATED"].includes(dayQuery.error.code))) ? <ErrorState onRetry={() => void dayQuery.refetch()} /> :
        !day || day.runs.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title={t("staffTools.checklists.noRunsTitle")} description={canEscalate ? t("staffTools.checklists.noRunsManager") : t("staffTools.checklists.noRunsStaff")} />
        ) : (
          <div className="space-y-5">
            {dayQuery.error ? <p role="status" className="text-[12px] text-warning-deep">{t("staffTools.checklists.stale")} <Button size="sm" variant="ghost" onClick={() => void dayQuery.refetch()}>{t("common.action.retry")}</Button></p> : null}
            {day.carryover?.length ? <p className="text-sm text-warning-deep" role="status">{t("staffTools.checklists.carryover", { count: day.carryover.length, displayCount: format.number(day.carryover.length) })}</p> : null}
            {[...(day.carryover ?? []), ...day.runs].sort((a, b) => Number(b.items.some((item) => item.status === "failed")) - Number(a.items.some((item) => item.status === "failed"))).map((run) => (
              <RunCard
                key={`${run.templateId}:${run.localDate}`}
                run={run}
                canAssign={canEscalate}
                branchId={branchId}
                busy={setItem.isPending}
                onComplete={(item) => setItem.mutate({ templateId: run.templateId, date: run.localDate, itemId: item.itemId, status: "completed" })}
                onProblem={(item) => setProblem({ run, item, mode: "problem" })}
                onCorrect={(item) => setProblem({ run, item, mode: "correct" })}
                onEscalate={canEscalate ? (item) => setEscalate({ run, item }) : undefined}
              />
            ))}
          </div>
        )}

      <ProblemDialog state={problem} onClose={() => setProblem(undefined)} onDone={refresh} />
      <EscalateDialog state={escalate} branchId={branchId} onClose={() => setEscalate(undefined)} onDone={refresh} />
    </div>
  );
}

function RunCard({ run, branchId, canAssign, busy, onComplete, onProblem, onCorrect, onEscalate }: {
  run: ChecklistRun;
  branchId: string;
  canAssign: boolean;
  busy: boolean;
  onComplete: (item: ChecklistRunItem) => void;
  onProblem: (item: ChecklistRunItem) => void;
  onCorrect: (item: ChecklistRunItem) => void;
  onEscalate?: (item: ChecklistRunItem) => void;
}) {
  const t = useT();
  const format = useFormat();
  const Icon = run.type === "opening" ? Sun : Moon;
  const failedCount = run.items.filter((item) => item.status === "failed").length;
  return (
    <section className="panel overflow-hidden" aria-label={t("staffTools.checklists.sectionAria", { name: run.name })}>
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-md bg-sunken"><Icon className="size-4 text-ink-2" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">{run.name}</h2>
          <p className="text-[12px] text-ink-3">{format.date(run.localDate)} · {t(run.type === "opening" ? "staffTools.checklists.type.opening" : "staffTools.checklists.type.closing")} · {t("staffTools.checklists.dueTime", { time: format.clock(run.dueTime) })} · {run.assignedUserName ?? (ROLE_KEYS[run.assignedRole] ? t(ROLE_KEYS[run.assignedRole]) : run.assignedRole)}</p>
        </div>
        {failedCount > 0 ? <Badge variant="danger">{t("staffTools.checklists.failedCount", { count: failedCount, displayCount: format.number(failedCount) })}</Badge> : run.complete ? <Badge variant="success">{t("dashboard.trainer.complete")}</Badge> : run.overdue ? <Badge variant="warning">{t("dashboard.owner.overdueCol")}</Badge> : null}
        <span className="tabular-nums text-[12px] text-ink-3">{t("staffTools.checklists.progress", { done: format.number(run.progress.done), total: format.number(run.progress.total) })}</span>
      </header>
      {canAssign ? <ChecklistRunAssignment run={run} /> : null}
      <ul className="divide-y divide-line">
        {run.items.map((item) => {
          const done = item.status !== "pending";
          return (
            <li key={item.itemId} className={cn("flex flex-wrap items-center gap-2 px-3 py-2", item.status === "failed" && "bg-danger-bg/40")}>
              <button
                type="button"
                disabled={busy}
                onClick={() => (done ? onCorrect(item) : onComplete(item))}
                className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md px-2 text-start transition-colors hover:bg-sunken/70"
                aria-label={done ? t("staffTools.checklists.item.changeResult", { item: item.label, result: t(RESULT_KEYS[item.status]) }) : t("staffTools.checklists.item.markDone", { item: item.label })}
              >
                <span aria-hidden className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border",
                  item.status === "completed" ? "border-success bg-success text-paper" :
                  item.status === "failed" ? "border-danger bg-danger text-paper" :
                  item.status === "skipped" ? "border-line-3 bg-sunken-2 text-ink-3" : "border-line-3",
                )}>
                  {item.status === "completed" ? <Check className="size-4" /> : item.status === "failed" ? <CircleAlert className="size-4" /> : item.status === "skipped" ? "–" : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[13.5px]", item.status === "completed" && "text-ink-3 line-through decoration-line-3")}>{item.label}{!item.required ? <span className="ms-2 text-[12px] text-ink-3">{t("common.state.optional")}</span> : null}</span>
                  {item.instructions && !done ? <span className="block text-[12px] text-ink-3">{item.instructions}</span> : null}
                  {done && item.actorName && item.at ? <span className="block text-[12px] text-ink-3">{t("staffTools.checklists.item.reasonBy", { result: t(RESULT_KEYS[item.status]), name: item.actorName, time: format.time(item.at) })}{item.reason ? ` — ${item.reason}` : ""}</span> : null}
                </span>
              </button>
              {!done ? (
                <Button variant="ghost" size="sm" onClick={() => onProblem(item)}>{t("staffTools.checklists.item.problem")}</Button>
              ) : item.status === "failed" && !item.facilityTaskId && item.offerMaintenance && onEscalate ? (
                <Button variant="secondary" size="sm" onClick={() => onEscalate(item)}><Wrench />{t("staffTools.checklists.item.createMaintenance")}</Button>
              ) : item.facilityTaskId ? (
                <Button asChild variant="secondary" size="sm"><Link href={`/maintenance?branch=${encodeURIComponent(branchId)}&task=${encodeURIComponent(item.facilityTaskId)}`}><Wrench />{t("staffTools.checklists.item.openMaintenance")}</Link></Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ProblemDialog({ state, onClose, onDone }: { state?: ProblemDialogState; onClose: () => void; onDone: () => Promise<unknown> }) {
  const t = useT();
  const [status, setStatus] = useState<"failed" | "skipped" | "completed" | "pending">("failed");
  const [reason, setReason] = useState("");
  const mutate = useApiMutation((api, input: SetChecklistItemInput) => api.setChecklistItem(input), {
    successMessage: t("staffTools.checklists.dialog.problemSaved"),
    onSuccess: async () => { onClose(); setReason(""); await onDone(); },
  });
  const correcting = state?.mode === "correct";
  const needsReason = correcting || (state ? state.item.required : true);
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) { onClose(); setReason(""); setStatus("failed"); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{correcting ? t("staffTools.checklists.dialog.changeResult") : t("staffTools.checklists.dialog.reportProblem")}</DialogTitle></DialogHeader>
        {state ? (
          <DialogBody className="space-y-3">
            <p className="text-[13px] font-medium">{state.item.label}</p>
            {correcting ? (
              <>
                <p className="text-[12px] text-ink-3">{t("staffTools.checklists.dialog.markedStatusBy", { result: t(RESULT_KEYS[state.item.status]), name: state.item.actorName ?? t("staffTools.checklists.staffFallback") })}</p>
                <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                  <SelectTrigger aria-label={t("staffTools.checklists.dialog.newResult")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">{t("staffTools.checklists.item.markDoneAction")}</SelectItem>
                    <SelectItem value="failed">{t("staffTools.checklists.item.markFailed")}</SelectItem>
                    <SelectItem value="skipped">{t("staffTools.checklists.item.markSkipped")}</SelectItem>
                    <SelectItem value="pending">{t("staffTools.checklists.item.markPending")}</SelectItem>
                  </SelectContent>
                </Select>
              </>
            ) : (
                <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                <SelectTrigger aria-label={t("staffTools.checklists.dialog.whatHappened")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="failed">{t("staffTools.checklists.item.somethingWrong")}</SelectItem>
                  <SelectItem value="skipped">{t("staffTools.checklists.item.skippedToday")}</SelectItem>
                </SelectContent>
              </Select>
            )}
            <label className="grid gap-1 text-[12px] text-ink-3">{needsReason ? t("staffTools.checklists.dialog.whyRequired") : t("staffTools.checklists.dialog.whyOptional")}
              <Textarea value={reason} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setReason(event.target.value)} placeholder={correcting ? t("staffTools.checklists.dialog.whatChanged") : t("staffTools.checklists.dialog.whatFound")} />
            </label>
          </DialogBody>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t("common.action.cancel")}</Button>
          <Button
            loading={mutate.isPending}
            disabled={!state || (needsReason && reason.trim().length < 3)}
            onClick={() => state && mutate.mutate({ templateId: state.run.templateId, date: state.run.localDate, itemId: state.item.itemId, status, reason: reason.trim() || undefined })}
          >{t("staffTools.checklists.dialog.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EscalateDialog({ state, branchId, onClose, onDone }: { state?: EscalateDialogState; branchId?: string; onClose: () => void; onDone: () => Promise<unknown> }) {
  const t = useT();
  const [zoneId, setZoneId] = useState<string>("");
  const zonesQuery = useApiQuery(["zones", branchId ?? ""], (api) => api.listZones({ branchId }), { enabled: Boolean(state && branchId && !state.item.zoneId) });
  const zones = zonesQuery.data ?? [];
  const mutate = useApiMutation((api, input: { templateId: string; date?: string; itemId: string; zoneId?: string }) => api.createChecklistMaintenanceTask(input), {
    successMessage: t("staffTools.checklists.item.maintenanceCreated"),
    onSuccess: async () => { onClose(); setZoneId(""); await onDone(); },
  });
  const effectiveZone = state?.item.zoneId ?? (zoneId || undefined);
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) { onClose(); setZoneId(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("staffTools.checklists.dialog.escalationTitle")}</DialogTitle></DialogHeader>
        {state ? (
          <DialogBody className="space-y-3">
            <p className="text-[12px] text-ink-2">{t("staffTools.checklists.dialog.escalationIntro")}</p>
            <p className="text-[13px]">{t("staffTools.checklists.dialog.escalationPrefix")} <span className="font-medium">{state.item.label}</span>{state.item.reason ? <> — “{state.item.reason}”</> : null}</p>
            {!state.item.zoneId ? (
              zonesQuery.isError ? <QueryErrorState error={zonesQuery.error} onRetry={() => void zonesQuery.refetch()} /> : zones.length === 0 && !zonesQuery.isLoading ? (
                <p className="text-[12px] text-warning-deep">{t("staffTools.checklists.dialog.noAreas")}</p>
              ) : (
                <label className="grid gap-1 text-[12px] text-ink-3">{t("staffTools.checklists.dialog.area")}
                  <Select value={zoneId} onValueChange={setZoneId}>
                    <SelectTrigger aria-label={t("staffTools.checklists.dialog.area")}><SelectValue placeholder={t("staffTools.checklists.dialog.chooseArea")} /></SelectTrigger>
                    <SelectContent>{zones.map((zone: Zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
              )
            ) : null}
          </DialogBody>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t("common.action.cancel")}</Button>
          <Button loading={mutate.isPending} disabled={!state || !effectiveZone} onClick={() => state && mutate.mutate({ templateId: state.run.templateId, date: state.run.localDate, itemId: state.item.itemId, zoneId: effectiveZone })}>{t("staffTools.checklists.dialog.createJob")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
