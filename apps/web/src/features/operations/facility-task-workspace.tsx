"use client";
import { useLocale, useT } from "@/lib/i18n/provider";
import { useFormattingTimeZone } from "@/lib/i18n/format";
import { maintenanceDateTimeInput, maintenanceDueInstant } from "@/lib/i18n/operations";
import { toast } from "sonner";
import type { TKey } from "@/lib/i18n/core";

import { isApiError } from "@/lib/api/errors";

import { CheckCircle2, ClipboardCheck, Copy, Download, Flag, Play, Plus, QrCode } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, QueryErrorState, StatePanel } from "@/components/ui/states";
import { DateTimeText } from "@/components/shared/data-display";
import { qk } from "@/lib/api/keys";
import type { FacilityTask, FacilityTaskKind, FacilityTaskSeverity, FacilityTaskStatus, UpsertFacilityTaskInput, Zone } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { cn } from "@/lib/utils/cn";
import { downloadTextFile } from "@/lib/exports/download";

const ACTIVE_STATUSES = new Set<FacilityTaskStatus>(["open", "in_progress", "blocked"]);

const TASK_PRESETS: Array<{ label: TKey; title: TKey; kind: FacilityTaskKind; severity: FacilityTaskSeverity }> = [
  { label: "operationsWorkspace.cleaningNeeded", title: "operationsWorkspace.cleaningNeeded", kind: "cleaning", severity: "medium" },
  { label: "operationsWorkspace.inspectArea", title: "operationsWorkspace.inspectArea", kind: "inspection", severity: "medium" },
  { label: "operationsWorkspace.reportIncident", title: "operationsWorkspace.incidentHere", kind: "incident", severity: "high" },
];

const STATUS_LABELS: Record<FacilityTaskStatus, TKey> = {
  open: "operationsWorkspace.open",
  in_progress: "operationsWorkspace.inProgress",
  blocked: "operationsWorkspace.blocked",
  completed: "operationsWorkspace.done",
  cancelled: "operationsWorkspace.cancelled",
};

const PRIORITY_LABELS: Record<FacilityTaskSeverity, TKey> = {
  low: "operationsWorkspace.low",
  medium: "operationsWorkspace.medium",
  high: "operationsWorkspace.high",
  critical: "operationsWorkspace.critical",
};

const KIND_LABELS: Record<FacilityTaskKind, TKey> = {
  cleaning: "operationsWorkspace.cleaning",
  inspection: "operationsWorkspace.inspection",
  incident: "operationsWorkspace.incident",
};

function taskUpdate(task: FacilityTask, status: FacilityTaskStatus): UpsertFacilityTaskInput {
  return {
    id: task.id,
    branchId: task.branchId,
    zoneId: task.zoneId,
    kind: task.kind,
    severity: task.severity,
    status,
    title: task.title,
    notes: task.notes,
    assigneeId: task.assigneeId,
    dueAt: task.dueAt,
    trafficContext: task.trafficContext,
    suppliesCost: task.suppliesCost,
  };
}

function statusVariant(status: FacilityTaskStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "completed") return "success";
  if (status === "blocked") return "warning";
  if (status === "cancelled") return "danger";
  return "neutral";
}

function TaskDialog({ branchId, zones, task, initialZoneId, pending, onClose, onSubmit }: { branchId: string; zones: Zone[]; task?: FacilityTask; initialZoneId?: string; pending: boolean; onClose: () => void; onSubmit: (input: UpsertFacilityTaskInput) => void }) {
  const { t, locale } = useLocale();
  const timeZone = useFormattingTimeZone();
  const [form, setForm] = useState(() => ({
    zoneId: task?.zoneId ?? (zones.some((zone) => zone.id === initialZoneId) ? initialZoneId! : zones[0]?.id ?? ""),
    kind: task?.kind ?? "cleaning" as FacilityTaskKind,
    severity: task?.severity ?? "medium" as FacilityTaskSeverity,
    status: task?.status ?? "open" as FacilityTaskStatus,
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    dueAt: maintenanceDateTimeInput(task?.dueAt, timeZone),
  }));
  const dueInstant = form.dueAt ? maintenanceDueInstant(form.dueAt, timeZone) : undefined;
  const invalidDueTime = Boolean(form.dueAt && !dueInstant);
  const editing = Boolean(task);
  const applyPreset = (preset: typeof TASK_PRESETS[number]) => setForm((current) => ({ ...current, title: t(preset.title), kind: preset.kind, severity: preset.severity }));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? t("operationsWorkspace.editMaintenance") : t("operationsWorkspace.addMaintenance")}</DialogTitle>
          <DialogDescription>{editing ? t("operationsWorkspace.updateJobHint") : t("operationsWorkspace.pickJobHint")}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
            event.preventDefault();
            if (!form.zoneId || !form.title.trim() || invalidDueTime) return;
            onSubmit({ id: task?.id, branchId, zoneId: form.zoneId, kind: form.kind, severity: form.severity, status: form.status, title: form.title.trim(), notes: form.notes.trim() || undefined, dueAt: form.dueAt === maintenanceDateTimeInput(task?.dueAt, timeZone) ? task?.dueAt : dueInstant, assigneeId: task?.assigneeId, trafficContext: task?.trafficContext, suppliesCost: task?.suppliesCost });
          }}>
            {!editing ? <div className="flex flex-wrap gap-2 sm:col-span-2" aria-label={t("operationsWorkspace.shortcuts")}>{TASK_PRESETS.map((preset) => <Button key={preset.label} type="button" size="xs" variant="secondary" onClick={() => applyPreset(preset)}>{t(preset.label)}</Button>)}</div> : null}
            <Field label={t("operationsWorkspace.whereGym")} required><Select value={form.zoneId} onValueChange={(value) => setForm((current) => ({ ...current, zoneId: value }))}><SelectTrigger aria-label={t("operationsWorkspace.whereGym")}><SelectValue placeholder={t("operationsWorkspace.chooseArea")} /></SelectTrigger><SelectContent>{zones.map((zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label={t("operationsWorkspace.jobKind")} required><Select value={form.kind} onValueChange={(value) => setForm((current) => ({ ...current, kind: value as FacilityTaskKind }))}><SelectTrigger aria-label={t("operationsWorkspace.jobKind")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cleaning">{t("operationsWorkspace.cleaning")}</SelectItem><SelectItem value="inspection">{t("operationsWorkspace.inspection")}</SelectItem><SelectItem value="incident">{t("operationsWorkspace.incident")}</SelectItem></SelectContent></Select></Field>
            <Field label={t("operationsWorkspace.priority")} required><Select value={form.severity} onValueChange={(value) => setForm((current) => ({ ...current, severity: value as FacilityTaskSeverity }))}><SelectTrigger aria-label={t("operationsWorkspace.priority")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">{t("operationsWorkspace.low")}</SelectItem><SelectItem value="medium">{t("operationsWorkspace.medium")}</SelectItem><SelectItem value="high">{t("operationsWorkspace.high")}</SelectItem><SelectItem value="critical">{t("operationsWorkspace.critical")}</SelectItem></SelectContent></Select></Field>
            {editing ? <Field label={t("common.label.status")} required><Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as FacilityTaskStatus }))}><SelectTrigger aria-label={t("common.label.status")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">{t("dashboard.today.action.open")}</SelectItem><SelectItem value="in_progress">{t("operationsWorkspace.inProgress")}</SelectItem><SelectItem value="blocked">{t("operationsWorkspace.blocked")}</SelectItem><SelectItem value="completed">{t("common.action.done")}</SelectItem><SelectItem value="cancelled">{t("renewFlow.adjust.membershipStatus.cancelled")}</SelectItem></SelectContent></Select></Field> : null}
            <Field label={t("operationsWorkspace.jobQuestion")} className="sm:col-span-2" required><Input autoFocus value={form.title} maxLength={160} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder={t("operationsWorkspace.cleaningExample")} required /></Field>
            <Field label={t("operationsWorkspace.dueBy")} error={invalidDueTime ? t("operationsWorkspace.invalidDueTime") : undefined}><Input type="datetime-local" dir="ltr" lang={locale} aria-invalid={invalidDueTime || undefined} value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} /></Field>
            <Field label={t("common.label.details")} className={editing ? "sm:col-span-2" : ""}><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder={t("operationsWorkspace.nextPersonExample")} /></Field>
            <DialogFooter className="px-0 pb-0 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose} disabled={pending}>{t("common.action.cancel")}</Button><Button type="submit" loading={pending} disabled={!form.zoneId || !form.title.trim() || invalidDueTime}><ClipboardCheck /> {editing ? t("operationsWorkspace.saveJob") : t("operationsWorkspace.addJob")}</Button></DialogFooter>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ZoneQrDialog({ branchId, zones, selectedZoneId, onClose }: { branchId: string; zones: Zone[]; selectedZoneId?: string; onClose: () => void }) {
  const t = useT();
  const [zoneId, setZoneId] = useState(zones.some((zone) => zone.id === selectedZoneId) ? selectedZoneId! : zones[0]?.id ?? "");
  const [copied, setCopied] = useState(false);
  const zone = zones.find((candidate) => candidate.id === zoneId);
  const path = zone ? `/maintenance?branch=${encodeURIComponent(branchId)}&zone=${encodeURIComponent(zone.id)}&action=new-task` : "/maintenance";
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;

  const download = () => {
    const svg = document.getElementById("facility-zone-qr");
    if (!svg || !zone) return;
    const source = new XMLSerializer().serializeToString(svg);
    downloadTextFile({ content: source, fileName: `rivet-${zone.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || zone.id}-task-qr.svg`, mimeType: "image/svg+xml;charset=utf-8" });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("operationsWorkspace.areaQr")}</DialogTitle><DialogDescription>{t("operationsWorkspace.areaQrHint")}</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <Field label={t("operationsWorkspace.area")}><Select value={zoneId} onValueChange={(value) => { setZoneId(value); setCopied(false); }}><SelectTrigger aria-label={t("operationsWorkspace.area")}><SelectValue /></SelectTrigger><SelectContent>{zones.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
          {zone ? <div className="mx-auto w-fit rounded-lg border border-line bg-white p-4 text-[#171611]"><QRCodeSVG id="facility-zone-qr" value={url} size={208} level="M" marginSize={1} title={t("operationsWorkspace.qrTitle", { name: zone.name })} /></div> : null}
          <div className="rounded-md border border-line bg-sunken/50 px-3 py-2 text-[12px] leading-5 text-ink-2"><strong>{zone?.name ?? t("operationsWorkspace.areaFallback")}</strong><br />{t("operationsWorkspace.qrSignInHint")}</div>
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(url).then(() => setCopied(true)).catch(() => toast.error(t("operationsWorkspace.qrCopyFailed"))); }}><Copy /> {copied ? t("operationsWorkspace.linkCopied") : t("operationsWorkspace.copyLink")}</Button><Button onClick={download} disabled={!zone}><Download /> {" "}{t("operationsWorkspace.downloadQr")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FacilityTaskWorkspace({ branchId, zones, writeEnabled }: { branchId?: string; zones: Zone[]; writeEnabled: boolean }) {
  const t = useT();
  const searchParams = useSearchParams();
  const router = useRouter();
  const invalidate = useInvalidate();
  const requestedZoneId = searchParams.get("zone") ?? undefined;
  const requestedAction = searchParams.get("action");
  const requestedTaskId = searchParams.get("task");
  const selectedTaskRef = useRef<HTMLElement>(null);
  const showHistory = searchParams.get("history") === "1";
  const [taskDialog, setTaskDialog] = useState<FacilityTask | "new" | null>(null);
  const [qrDialog, setQrDialog] = useState(false);
  const [shortcutHandled, setShortcutHandled] = useState(false);
  const tasksQuery = useApiQuery(qk.operations({ kind: "facility-tasks", branchId }), (api) => api.listFacilityTasks({ branchId }), { enabled: Boolean(branchId) });
  const mutation = useApiMutation((api, input: UpsertFacilityTaskInput) => api.upsertFacilityTask(input), { onSuccess: async () => { await invalidate([qk.operations()]); }, successMessage: t("operationsWorkspace.maintenanceUpdated") });

  useEffect(() => {
    if (shortcutHandled || !writeEnabled || !branchId || requestedAction !== "new-task" || !zones.some((zone) => zone.id === requestedZoneId)) return;
    setTaskDialog("new");
    setShortcutHandled(true);
  }, [branchId, requestedAction, requestedZoneId, shortcutHandled, writeEnabled, zones]);

  useEffect(() => {
    if (requestedTaskId && tasksQuery.data) selectedTaskRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [requestedTaskId, tasksQuery.data]);
  const tasks = tasksQuery.data ?? [];
  const activeTasks = tasks.filter((task) => ACTIVE_STATUSES.has(task.status));
  const priorities = { critical: 0, high: 1, medium: 2, low: 3 };
  const visibleTasks = (showHistory || requestedTaskId ? tasks : activeTasks).filter((task) => !requestedZoneId || task.zoneId === requestedZoneId)
    .sort((a, b) => Number(ACTIVE_STATUSES.has(b.status)) - Number(ACTIVE_STATUSES.has(a.status)) || priorities[a.severity] - priorities[b.severity] || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"));
  const criticalCount = activeTasks.filter((task) => task.severity === "critical").length;
  const inProgressCount = activeTasks.filter((task) => task.status === "in_progress").length;

  if (!branchId) return <StatePanel icon={ClipboardCheck} title={t("operationsWorkspace.chooseBranch")} description={t("operationsWorkspace.branchMaintenanceHint")} className="mt-2" />;
  if (tasksQuery.isLoading) return <div className="grid gap-3 sm:grid-cols-3"><div className="panel h-24 animate-pulse" /><div className="panel h-24 animate-pulse" /><div className="panel h-24 animate-pulse" /></div>;
  if (tasksQuery.isError && (!tasksQuery.data || (isApiError(tasksQuery.error) && ["FORBIDDEN", "UNAUTHENTICATED"].includes(tasksQuery.error.code)))) return <QueryErrorState error={tasksQuery.error} onRetry={() => tasksQuery.refetch()} forbiddenDescription={t("operationsWorkspace.noBranchMaintenanceAccess")} />;

  return (
    <div className="space-y-4" data-testid="operations-facilities">
      {tasksQuery.isError ? <div role="status" className="text-[12px] text-warning-deep">{t("operationsWorkspace.listRefreshFailed")}{" "}<Button size="sm" variant="ghost" onClick={() => void tasksQuery.refetch()}>{t("common.action.retry")}</Button></div> : null}
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-3 text-[13.5px]" aria-label={t("operationsWorkspace.maintenanceSummary")}>
        <span className="tabular-nums">{t("operationsWorkspace.openJobs", { count: activeTasks.length })}</span>
        <span className={criticalCount > 0 ? "text-danger" : "text-ink-2"}><span className="tabular-nums">{t("operationsWorkspace.criticalCount", { count: criticalCount })}</span></span>
        <span className="text-ink-2"><span className="tabular-nums">{t("operationsWorkspace.inProgressCount", { count: inProgressCount })}</span></span>
      </div>
      {requestedZoneId ? <div className="flex flex-wrap items-center gap-2 text-[13px]">{t("operationsWorkspace.areaNamed", { name: zones.find((zone) => zone.id === requestedZoneId)?.name ?? t("operationsWorkspace.unknownArea") })}<Button size="sm" variant="ghost" onClick={() => { const next = new URLSearchParams(searchParams.toString()); next.delete("zone"); next.delete("action"); router.replace(`/maintenance?${next}`, { scroll: false }); }}>{t("operationsWorkspace.allAreas")}</Button></div> : null}

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5">
          <div className="flex min-w-0 items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-sunken"><ClipboardCheck className="size-3.5 text-ink-2" aria-hidden /></span><div><h2 className="text-[15px] font-semibold text-ink">{t("operationsWorkspace.maintenanceList")}</h2></div></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" aria-pressed={showHistory} onClick={() => { const next = new URLSearchParams(searchParams.toString()); if (showHistory) next.delete("history"); else next.set("history", "1"); router.replace(`/maintenance?${next}`, { scroll: false }); }}>{showHistory ? t("operationsWorkspace.hideHistory") : t("operationsWorkspace.showHistory")}</Button>{writeEnabled ? <><Button size="sm" variant="secondary" onClick={() => setQrDialog(true)} disabled={zones.length === 0}><QrCode /> {" "}{t("operationsWorkspace.areaQr")}</Button><Button size="sm" onClick={() => setTaskDialog("new")} disabled={zones.length === 0}><Plus /> {" "}{t("operationsWorkspace.newJob")}</Button></> : null}</div>
        </div>
        {!writeEnabled ? <div className="border-b border-line bg-sunken/50 px-4 py-2 text-[12px] text-ink-2">{t("operationsWorkspace.readOnlyJobs")}</div> : null}
        {zones.length === 0 ? <EmptyState title={t("operationsWorkspace.noAreas")} description={t("operationsWorkspace.addAreasHint")} className="m-4" /> : visibleTasks.length === 0 ? <EmptyState title={showHistory ? t("operationsWorkspace.noMaintenanceHistory") : t("operationsWorkspace.noOpenJobs")} description={showHistory ? t("operationsWorkspace.jobsAppear") : t("operationsWorkspace.noJobsHint")} className="m-4" /> : <div className="divide-y divide-line">{visibleTasks.map((task) => <article key={task.id} ref={task.id === requestedTaskId ? selectedTaskRef : undefined} aria-label={task.title} className={cn(task.id === requestedTaskId && "bg-sunken/60","grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center", task.severity === "critical" && ACTIVE_STATUSES.has(task.status) && "bg-danger-bg/20")}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant={statusVariant(task.status)} dot>{t(STATUS_LABELS[task.status])}</Badge><Badge variant={task.severity === "critical" ? "danger" : task.severity === "high" ? "warning" : "neutral"}>{t("operationsWorkspace.priorityNamed", { priority: t(PRIORITY_LABELS[task.severity]) })}</Badge><span className="text-[12px] text-ink-3">{t(KIND_LABELS[task.kind])} · {task.zoneName}</span></div><h3 className="mt-2 text-[14px] font-medium text-ink">{task.title}</h3><p className="mt-1 text-[12px] text-ink-2">{task.assigneeId ? t("operationsWorkspace.assignedStaff") : t("memberProfile.details.notAssigned")}</p>{task.notes ? <p className="mt-1 text-[12px] leading-5 text-ink-2">{task.notes}</p> : null}<p className="mt-1 text-[12px] text-ink-3">{task.dueAt ? <>{t("operationsWorkspace.due")}{" "}<DateTimeText iso={task.dueAt} /></> : <>{t("common.label.updatedAt")}{" "}<DateTimeText iso={task.updatedAt} /></>}</p></div>{writeEnabled ? <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">{task.status === "open" ? <Button size="xs" variant="secondary" onClick={() => mutation.mutate(taskUpdate(task, "in_progress"))} loading={mutation.isPending}><Play /> {" "}{t("operationsWorkspace.start")}</Button> : null}{["open", "in_progress", "blocked"].includes(task.status) ? <Button size="xs" onClick={() => mutation.mutate(taskUpdate(task, "completed"))} loading={mutation.isPending}><CheckCircle2 /> {" "}{t("operationsWorkspace.markDone")}</Button> : null}{["open", "in_progress"].includes(task.status) ? <Button size="xs" variant="ghost" onClick={() => mutation.mutate(taskUpdate(task, "blocked"))} loading={mutation.isPending}><Flag /> {" "}{t("operationsWorkspace.putOnHold")}</Button> : null}<Button size="xs" variant="ghost" onClick={() => setTaskDialog(task)}>{t("common.action.edit")}</Button></div> : null}</article>)}</div>}
      </section>

      {taskDialog ? <TaskDialog key={taskDialog === "new" ? `new-${requestedZoneId ?? "default"}` : taskDialog.id} branchId={branchId} zones={zones} task={taskDialog === "new" ? undefined : taskDialog} initialZoneId={requestedZoneId} pending={mutation.isPending} onClose={() => setTaskDialog(null)} onSubmit={(input) => mutation.mutate(input, { onSuccess: () => setTaskDialog(null) })} /> : null}
      {qrDialog ? <ZoneQrDialog branchId={branchId} zones={zones} selectedZoneId={requestedZoneId} onClose={() => setQrDialog(false)} /> : null}
    </div>
  );
}
