"use client";

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

const TASK_PRESETS: Array<{ label: string; title: string; kind: FacilityTaskKind; severity: FacilityTaskSeverity }> = [
  { label: "Cleaning needed", title: "Cleaning required", kind: "cleaning", severity: "medium" },
  { label: "Inspect location", title: "Location inspection", kind: "inspection", severity: "medium" },
  { label: "Report incident", title: "Maintenance incident", kind: "incident", severity: "high" },
];

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
  const [form, setForm] = useState(() => ({
    zoneId: task?.zoneId ?? (zones.some((zone) => zone.id === initialZoneId) ? initialZoneId! : zones[0]?.id ?? ""),
    kind: task?.kind ?? "cleaning" as FacilityTaskKind,
    severity: task?.severity ?? "medium" as FacilityTaskSeverity,
    status: task?.status ?? "open" as FacilityTaskStatus,
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    dueAt: task?.dueAt ? task.dueAt.slice(0, 16) : "",
  }));
  const editing = Boolean(task);
  const applyPreset = (preset: typeof TASK_PRESETS[number]) => setForm((current) => ({ ...current, title: preset.title, kind: preset.kind, severity: preset.severity }));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit maintenance task" : "Add maintenance task"}</DialogTitle>
          <DialogDescription>{editing ? "Keep the location, priority, and next action accurate for the team." : "Choose a shortcut, add only what matters, and send it to the team."}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
            event.preventDefault();
            if (!form.zoneId || !form.title.trim()) return;
            onSubmit({ id: task?.id, branchId, zoneId: form.zoneId, kind: form.kind, severity: form.severity, status: form.status, title: form.title.trim(), notes: form.notes.trim() || undefined, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : undefined, assigneeId: task?.assigneeId, trafficContext: task?.trafficContext, suppliesCost: task?.suppliesCost });
          }}>
            {!editing ? <div className="flex flex-wrap gap-2 sm:col-span-2" aria-label="Task shortcuts">{TASK_PRESETS.map((preset) => <Button key={preset.label} type="button" size="xs" variant="secondary" onClick={() => applyPreset(preset)}>{preset.label}</Button>)}</div> : null}
            <Field label="Where in the gym?" required><Select value={form.zoneId} onValueChange={(value) => setForm((current) => ({ ...current, zoneId: value }))}><SelectTrigger aria-label="Task location"><SelectValue placeholder="Choose a gym space" /></SelectTrigger><SelectContent>{zones.map((zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Work type" required><Select value={form.kind} onValueChange={(value) => setForm((current) => ({ ...current, kind: value as FacilityTaskKind }))}><SelectTrigger aria-label="Maintenance task type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cleaning">Cleaning</SelectItem><SelectItem value="inspection">Inspection</SelectItem><SelectItem value="incident">Incident</SelectItem></SelectContent></Select></Field>
            <Field label="Priority" required><Select value={form.severity} onValueChange={(value) => setForm((current) => ({ ...current, severity: value as FacilityTaskSeverity }))}><SelectTrigger aria-label="Maintenance task priority"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent></Select></Field>
            {editing ? <Field label="Status" required><Select value={form.status} onValueChange={(value) => setForm((current) => ({ ...current, status: value as FacilityTaskStatus }))}><SelectTrigger aria-label="Maintenance task status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="in_progress">In progress</SelectItem><SelectItem value="blocked">Blocked</SelectItem><SelectItem value="completed">Completed</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></Field> : null}
            <Field label="What needs doing?" className="sm:col-span-2" required><Input autoFocus value={form.title} maxLength={160} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Wipe benches and refill sanitizer" required /></Field>
            <Field label="Due by"><Input type="datetime-local" value={form.dueAt} onChange={(event) => setForm((current) => ({ ...current, dueAt: event.target.value }))} /></Field>
            <Field label="Details" className={editing ? "sm:col-span-2" : ""}><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional context for the next employee" /></Field>
            <DialogFooter className="px-0 pb-0 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" loading={pending} disabled={!form.zoneId || !form.title.trim()}><ClipboardCheck /> {editing ? "Save task" : "Add to work list"}</Button></DialogFooter>
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ZoneQrDialog({ branchId, zones, selectedZoneId, onClose }: { branchId: string; zones: Zone[]; selectedZoneId?: string; onClose: () => void }) {
  const [zoneId, setZoneId] = useState(zones.some((zone) => zone.id === selectedZoneId) ? selectedZoneId! : zones[0]?.id ?? "");
  const [copied, setCopied] = useState(false);
  const zone = zones.find((candidate) => candidate.id === zoneId);
  const path = zone ? `/maintenance?branch=${encodeURIComponent(branchId)}&zone=${encodeURIComponent(zone.id)}&action=new-task` : "/maintenance";
  const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;

  const download = () => {
    const svg = document.getElementById("facility-zone-qr");
    if (!svg || !zone) return;
    const source = new XMLSerializer().serializeToString(svg);
    downloadTextFile({ content: source, fileName: `rivet-${zone.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-task-qr.svg`, mimeType: "image/svg+xml;charset=utf-8" });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Location task QR</DialogTitle><DialogDescription>Place this at the selected gym space. Signed-in staff can scan it to report cleaning, inspections, or incidents without choosing the location again.</DialogDescription></DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="Gym space"><Select value={zoneId} onValueChange={(value) => { setZoneId(value); setCopied(false); }}><SelectTrigger aria-label="QR location"><SelectValue /></SelectTrigger><SelectContent>{zones.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></Field>
          {zone ? <div className="mx-auto w-fit rounded-lg border border-line bg-white p-4 text-[#171611]"><QRCodeSVG id="facility-zone-qr" value={url} size={208} level="M" marginSize={1} title={`RIVET task QR for ${zone.name}`} /></div> : null}
          <div className="rounded-md border border-line bg-sunken/50 px-3 py-2 text-[12px] leading-5 text-ink-2"><strong>{zone?.name ?? "Gym space"}</strong><br />Staff still sign in before creating a task. The QR only saves them from finding and selecting this location.</div>
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(url).then(() => setCopied(true)); }}><Copy /> {copied ? "Link copied" : "Copy link"}</Button><Button onClick={download} disabled={!zone}><Download /> Download QR</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FacilityTaskWorkspace({ branchId, zones, writeEnabled }: { branchId?: string; zones: Zone[]; writeEnabled: boolean }) {
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
  const mutation = useApiMutation((api, input: UpsertFacilityTaskInput) => api.upsertFacilityTask(input), { onSuccess: async () => { await invalidate([qk.operations()]); }, successMessage: "Maintenance list updated." });

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

  if (!branchId) return <StatePanel icon={ClipboardCheck} title="Choose a branch first" description="Maintenance is tracked separately for each branch. Choose a branch above to see cleaning, inspection, and incident tasks by gym space." className="mt-2" />;
  if (tasksQuery.isLoading) return <div className="grid gap-3 sm:grid-cols-3"><div className="panel h-24 animate-pulse" /><div className="panel h-24 animate-pulse" /><div className="panel h-24 animate-pulse" /></div>;
  if (tasksQuery.isError && (!tasksQuery.data || (isApiError(tasksQuery.error) && ["FORBIDDEN", "UNAUTHENTICATED"].includes(tasksQuery.error.code)))) return <QueryErrorState error={tasksQuery.error} onRetry={() => tasksQuery.refetch()} forbiddenDescription="Your role can’t read maintenance work for this branch." />;

  return (
    <div className="space-y-4" data-testid="operations-facilities">
      {tasksQuery.isError ? <div role="status" className="text-[12px] text-warning-deep">Maintenance could not refresh. Showing the last loaded tasks. <Button size="sm" variant="ghost" onClick={() => void tasksQuery.refetch()}>Retry</Button></div> : null}
      <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-3 text-[13.5px]" aria-label="Maintenance summary">
        <span><strong className="tabular-nums">{activeTasks.length}</strong> open tasks</span>
        <span className={criticalCount > 0 ? "text-danger" : "text-ink-2"}><strong className="tabular-nums">{criticalCount}</strong> critical</span>
        <span className="text-ink-2"><strong className="tabular-nums">{inProgressCount}</strong> in progress</span>
      </div>
      {requestedZoneId ? <div className="flex flex-wrap items-center gap-2 text-[13px]">Gym space: {zones.find((zone) => zone.id === requestedZoneId)?.name ?? "Unavailable space"}<Button size="sm" variant="ghost" onClick={() => { const next = new URLSearchParams(searchParams.toString()); next.delete("zone"); next.delete("action"); router.replace(`/maintenance?${next}`, { scroll: false }); }}>Show all spaces</Button></div> : null}

      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5">
          <div className="flex min-w-0 items-start gap-2.5"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-sunken"><ClipboardCheck className="size-3.5 text-ink-2" aria-hidden /></span><div><h2 className="text-[15px] font-semibold text-ink">Maintenance list</h2><p className="mt-0.5 text-[12px] text-ink-3">Cleaning, inspections, and incidents for places such as reception, the main floor, and locker rooms.</p></div></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" aria-pressed={showHistory} onClick={() => { const next = new URLSearchParams(searchParams.toString()); if (showHistory) next.delete("history"); else next.set("history", "1"); router.replace(`/maintenance?${next}`, { scroll: false }); }}>{showHistory ? "Hide history" : "Show history"}</Button>{writeEnabled ? <><Button size="sm" variant="secondary" onClick={() => setQrDialog(true)} disabled={zones.length === 0}><QrCode /> Location QR</Button><Button size="sm" onClick={() => setTaskDialog("new")} disabled={zones.length === 0}><Plus /> New task</Button></> : null}</div>
        </div>
        {!writeEnabled ? <div className="border-b border-line bg-sunken/50 px-4 py-2 text-[12px] text-ink-2">You have read-only access. Managers can create and update maintenance work.</div> : null}
        {zones.length === 0 ? <EmptyState title="No gym spaces yet" description="An owner can add spaces such as Reception, Main floor, Studio, or Locker room from Settings → Gym spaces." className="m-4" /> : visibleTasks.length === 0 ? <EmptyState title={showHistory ? "No maintenance history" : "No open maintenance work"} description={showHistory ? "Tasks created for this branch will appear here." : "Everything is clear. Scan a location QR or add a task when work comes up."} className="m-4" /> : <div className="divide-y divide-line">{visibleTasks.map((task) => <article key={task.id} ref={task.id === requestedTaskId ? selectedTaskRef : undefined} aria-label={task.title} className={cn(task.id === requestedTaskId && "bg-sunken/60","grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center", task.severity === "critical" && ACTIVE_STATUSES.has(task.status) && "bg-danger-bg/20")}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant={statusVariant(task.status)} dot>{task.status.replaceAll("_", " ")}</Badge><Badge variant={task.severity === "critical" ? "danger" : task.severity === "high" ? "warning" : "neutral"}>{task.severity}</Badge><span className="text-[12px] text-ink-3">{task.kind} · {task.zoneName}</span></div><h3 className="mt-2 text-[14px] font-medium text-ink">{task.title}</h3><p className="mt-1 text-[12px] text-ink-2">{task.assigneeId ? "Assigned to a staff member" : "Unassigned"}</p>{task.notes ? <p className="mt-1 text-[12px] leading-5 text-ink-2">{task.notes}</p> : null}<p className="mt-1 text-[12px] text-ink-3">{task.dueAt ? <>Due <DateTimeText iso={task.dueAt} /></> : <>Updated <DateTimeText iso={task.updatedAt} /></>}</p></div>{writeEnabled ? <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">{task.status === "open" ? <Button size="xs" variant="secondary" onClick={() => mutation.mutate(taskUpdate(task, "in_progress"))} loading={mutation.isPending}><Play /> Start</Button> : null}{["open", "in_progress", "blocked"].includes(task.status) ? <Button size="xs" onClick={() => mutation.mutate(taskUpdate(task, "completed"))} loading={mutation.isPending}><CheckCircle2 /> Complete</Button> : null}{["open", "in_progress"].includes(task.status) ? <Button size="xs" variant="ghost" onClick={() => mutation.mutate(taskUpdate(task, "blocked"))} loading={mutation.isPending}><Flag /> Block</Button> : null}<Button size="xs" variant="ghost" onClick={() => setTaskDialog(task)}>Edit</Button></div> : null}</article>)}</div>}
      </section>

      {taskDialog ? <TaskDialog key={taskDialog === "new" ? `new-${requestedZoneId ?? "default"}` : taskDialog.id} branchId={branchId} zones={zones} task={taskDialog === "new" ? undefined : taskDialog} initialZoneId={requestedZoneId} pending={mutation.isPending} onClose={() => setTaskDialog(null)} onSubmit={(input) => mutation.mutate(input, { onSuccess: () => setTaskDialog(null) })} /> : null}
      {qrDialog ? <ZoneQrDialog branchId={branchId} zones={zones} selectedZoneId={requestedZoneId} onClose={() => setQrDialog(false)} /> : null}
    </div>
  );
}
