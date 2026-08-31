"use client";

import { Check, CircleAlert, ClipboardCheck, Moon, Sun, Wrench } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { formatTime } from "@/lib/utils/dates";
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

export default function ChecklistsPage() {
  const { session } = useApp();
  const { can } = usePermissions();
  const branches = session?.branches ?? [];
  const [branchChoice, setBranchChoice] = useState<string | undefined>();
  const branchId = branchChoice ?? session?.activeBranchId ?? branches[0]?.id;

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
        eyebrow="Workspace"
        title="Daily checklist"
        description="Tick each item as it's done. Anything that fails gets a reason, so nothing is quietly skipped."
        actions={branches.length > 1 ? (
          <Select value={branchId ?? ""} onValueChange={setBranchChoice}>
            <SelectTrigger sizeVariant="sm" className="w-44" aria-label="Branch"><SelectValue /></SelectTrigger>
            <SelectContent>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
          </Select>
        ) : undefined}
      />

      {!branchId ? <EmptyState icon={ClipboardCheck} title="Join a branch first" description="Checklists are branch-specific." /> :
        dayQuery.isLoading ? <div className="space-y-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div> :
        dayQuery.error ? <ErrorState onRetry={() => void dayQuery.refetch()} /> :
        !day || day.runs.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No checklists for this branch yet" description={canEscalate ? "Create the opening and closing walkthroughs under Settings → Daily checklists." : "Ask a manager to set up the daily walkthroughs."} />
        ) : (
          <div className="space-y-5">
            {day.runs.map((run) => (
              <RunCard
                key={`${run.templateId}:${run.localDate}`}
                run={run}
                busy={setItem.isPending}
                onComplete={(item) => setItem.mutate({ templateId: run.templateId, itemId: item.itemId, status: "completed" })}
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

function RunCard({ run, busy, onComplete, onProblem, onCorrect, onEscalate }: {
  run: ChecklistRun;
  busy: boolean;
  onComplete: (item: ChecklistRunItem) => void;
  onProblem: (item: ChecklistRunItem) => void;
  onCorrect: (item: ChecklistRunItem) => void;
  onEscalate?: (item: ChecklistRunItem) => void;
}) {
  const Icon = run.type === "opening" ? Sun : Moon;
  return (
    <section className="panel overflow-hidden" aria-label={`${run.name} checklist`}>
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <span className="flex size-8 items-center justify-center rounded-md bg-sunken"><Icon className="size-4 text-ink-2" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">{run.name}</h2>
          <p className="text-[11.5px] text-ink-3">{run.type === "opening" ? "Opening" : "Closing"} · due {run.dueTime}</p>
        </div>
        {run.complete ? <Badge variant="success">All done</Badge> : run.overdue ? <Badge variant="warning">Overdue</Badge> : null}
        <span className="font-mono text-[11.5px] text-ink-3">{run.progress.done}/{run.progress.total}</span>
      </header>
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
                aria-label={done ? `${item.label} — recorded ${item.status}; open correction` : `Mark "${item.label}" done`}
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
                  <span className={cn("block text-[13.5px]", item.status === "completed" && "text-ink-3 line-through decoration-line-3")}>{item.label}{!item.required ? <span className="ms-2 text-[10.5px] text-ink-3">optional</span> : null}</span>
                  {item.instructions && !done ? <span className="block text-[11.5px] text-ink-3">{item.instructions}</span> : null}
                  {done && item.actorName && item.at ? <span className="block text-[11px] text-ink-3">{item.status === "completed" ? "Done" : item.status === "failed" ? "Failed" : "Skipped"} by {item.actorName} at {formatTime(item.at)}{item.reason ? ` — ${item.reason}` : ""}</span> : null}
                </span>
              </button>
              {!done ? (
                <Button variant="ghost" size="sm" onClick={() => onProblem(item)}>Problem?</Button>
              ) : item.status === "failed" && !item.facilityTaskId && item.offerMaintenance && onEscalate ? (
                <Button variant="secondary" size="sm" onClick={() => onEscalate(item)}><Wrench /> Create maintenance task</Button>
              ) : item.facilityTaskId ? (
                <Badge variant="outline">Maintenance task created</Badge>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ProblemDialog({ state, onClose, onDone }: { state?: ProblemDialogState; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [status, setStatus] = useState<"failed" | "skipped" | "completed" | "pending">("failed");
  const [reason, setReason] = useState("");
  const mutate = useApiMutation((api, input: SetChecklistItemInput) => api.setChecklistItem(input), {
    successMessage: "Recorded.",
    onSuccess: async () => { onClose(); setReason(""); await onDone(); },
  });
  const correcting = state?.mode === "correct";
  const needsReason = correcting || (state ? state.item.required : true);
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) { onClose(); setReason(""); setStatus("failed"); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{correcting ? "Correct this item" : "Report a problem"}</DialogTitle></DialogHeader>
        {state ? (
          <DialogBody className="space-y-3">
            <p className="text-[13px] font-medium">{state.item.label}</p>
            {correcting ? (
              <>
                <p className="text-[12px] text-ink-3">Recorded {state.item.status} by {state.item.actorName ?? "staff"}. Corrections keep an audit trail.</p>
                <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                  <SelectTrigger aria-label="New status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Mark done</SelectItem>
                    <SelectItem value="failed">Mark failed</SelectItem>
                    <SelectItem value="skipped">Mark skipped</SelectItem>
                    <SelectItem value="pending">Back to pending</SelectItem>
                  </SelectContent>
                </Select>
              </>
            ) : (
              <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
                <SelectTrigger aria-label="What happened"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="failed">It failed — something is wrong</SelectItem>
                  <SelectItem value="skipped">Skipped today</SelectItem>
                </SelectContent>
              </Select>
            )}
            <label className="grid gap-1 text-[11px] text-ink-3">{needsReason ? "Why? (required)" : "Why? (optional)"}
              <Textarea value={reason} onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => setReason(event.target.value)} placeholder={correcting ? "What changed?" : "What did you find?"} />
            </label>
          </DialogBody>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={mutate.isPending}
            disabled={!state || (needsReason && reason.trim().length < 3)}
            onClick={() => state && mutate.mutate({ templateId: state.run.templateId, itemId: state.item.itemId, status, reason: reason.trim() || undefined })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EscalateDialog({ state, branchId, onClose, onDone }: { state?: EscalateDialogState; branchId?: string; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [zoneId, setZoneId] = useState<string>("");
  const zonesQuery = useApiQuery(["zones", branchId ?? ""], (api) => api.listZones({ branchId }), { enabled: Boolean(state && branchId && !state.item.zoneId) });
  const zones = zonesQuery.data ?? [];
  const mutate = useApiMutation((api, input: { templateId: string; itemId: string; zoneId?: string }) => api.createChecklistMaintenanceTask(input), {
    successMessage: "Maintenance task created.",
    onSuccess: async () => { onClose(); setZoneId(""); await onDone(); },
  });
  const effectiveZone = state?.item.zoneId ?? (zoneId || undefined);
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => { if (!open) { onClose(); setZoneId(""); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Create maintenance task</DialogTitle></DialogHeader>
        {state ? (
          <DialogBody className="space-y-3">
            <p className="text-[13px]">A facility task goes to Operations for <span className="font-medium">{state.item.label}</span>{state.item.reason ? <> — “{state.item.reason}”</> : null}.</p>
            {!state.item.zoneId ? (
              zones.length === 0 && !zonesQuery.isLoading ? (
                <p className="text-[12px] text-warning-deep">This branch has no gym spaces yet. Add one under Settings → Gym spaces first.</p>
              ) : (
                <label className="grid gap-1 text-[11px] text-ink-3">Gym space
                  <Select value={zoneId} onValueChange={setZoneId}>
                    <SelectTrigger aria-label="Gym space"><SelectValue placeholder="Choose a space" /></SelectTrigger>
                    <SelectContent>{zones.map((zone: Zone) => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
              )
            ) : null}
          </DialogBody>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={mutate.isPending} disabled={!state || !effectiveZone} onClick={() => state && mutate.mutate({ templateId: state.run.templateId, itemId: state.item.itemId, zoneId: effectiveZone })}>Create task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
