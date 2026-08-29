"use client";

import { GripVertical, LayoutList, PhoneCall, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { qk } from "@/lib/api/keys";
import { deriveLeadProgressFacts } from "@/lib/crm/lead-progression";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import type { LeadListQuery } from "@/lib/api/GymOSApi";
import type { LeadStage, LeadSummary } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { MoneyText, RelativeText } from "@/components/shared/data-display";
import { PageHeader } from "@/components/shared/chrome";
import { LEAD_SOURCE_LABELS } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Monogram, Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { NewLeadDialog } from "@/features/crm/new-lead-dialog";
import { toast } from "sonner";
import { WorkspaceModuleBoundary } from "@/components/shell/workspace-module-boundary";

type PipelineColumn = "trial" | "sold" | "not_sold" | "no_answer";
const PIPELINE_COLUMNS: Array<{ column: PipelineColumn; label: string; hint: string }> = [
  { column: "trial", label: "Trial", hint: "New leads and active trial work" },
  { column: "sold", label: "Membership sold", hint: "Completed membership sales" },
  { column: "not_sold", label: "Membership not sold", hint: "Closed without a membership" },
  { column: "no_answer", label: "Did not answer", hint: "Contact attempts still unanswered" },
];

function pipelineColumn(lead: LeadSummary): PipelineColumn {
  const facts = lead.progressFacts ?? deriveLeadProgressFacts(lead);
  if (facts.hasConversion) return "sold";
  if (facts.hasLoss) return "not_sold";
  if (facts.hasAttempt && lead.lastContactOutcome === "no_answer") return "no_answer";
  return "trial";
}

const PIPELINE_LEAD_STAGES: LeadStage[] = ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent", "won", "lost"];

function columnLabel(column: PipelineColumn): string {
  return PIPELINE_COLUMNS.find((item) => item.column === column)?.label ?? column;
}

function PipelinePageInner() {
  const { session } = useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const invalidate = useInvalidate();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const [newOpen, setNewOpen] = useState(searchParams.get("new") === "1");
  const [view, setView] = useState<"board" | "list">("board");
  const [dragOverColumn, setDragOverColumn] = useState<PipelineColumn>();
  const [lossLead, setLossLead] = useState<LeadSummary>();
  const [lossReason, setLossReason] = useState("");
  const [lossError, setLossError] = useState<string>();

  // HTML5 drag-and-drop doesn't work on touchscreens — default small touch
  // devices to the list view (the board remains one tap away).
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1024) {
      setView("list");
    }
  }, []);

  const query = useMemo(
    () => ({ branchId: session?.activeBranchId, search: debounced || undefined, pageSize: 100, sort: "nextFollowUpAt" as const }),
    [session?.activeBranchId, debounced],
  );
  const leadQuery = useMemo<LeadListQuery>(() => ({ ...query, stage: PIPELINE_LEAD_STAGES }), [query]);
  const leadQueryKey = useMemo(() => qk.leads(leadQuery), [leadQuery]);
  const { data, isLoading, isError, refetch } = useRealtimeApiQuery({
    queryKey: leadQueryKey,
    query: (api) => api.listLeads(leadQuery),
    subscribe: (api, onValue, onError) => api.subscribeLeads(leadQuery, onValue, onError),
    fallbackIntervalMs: 4_000,
  });

  const leads = useMemo(() => data?.items ?? [], [data]);
  const byStage = useMemo(() => {
    const map = new Map<PipelineColumn, LeadSummary[]>();
    for (const stage of PIPELINE_COLUMNS) map.set(stage.column, []);
    for (const lead of leads) {
      map.get(pipelineColumn(lead))?.push(lead);
    }
    return map;
  }, [leads]);

  const moveLead = useApiMutation((api, input: { lead: LeadSummary; target: PipelineColumn }) => {
    const { lead, target } = input;
    if (target === "sold") return Promise.reject(new Error("Open the lead to complete the membership sale."));
    if (target === "not_sold") return Promise.reject(new Error("A reason is required before closing a lead."));
    if (target === "no_answer") return api.logContactAttempt(lead.id, { outcome: "no_answer", stage: "attempted", notes: "Moved to Did not answer from the pipeline." });
    return api.updateLead(lead.id, { stage: "contacted", lostReason: undefined });
  }, {
    onSuccess: async (_updated, input) => {
      await invalidate();
      setDragOverColumn(undefined);
      toast.success(`${input.lead.fullName} moved to ${columnLabel(input.target)}.`);
    },
    onError: (error, input) => {
      setDragOverColumn(undefined);
      if (input.target === "sold") {
        toast.error("Open the lead to complete and record the membership sale.");
        router.push(`/crm/leads/${input.lead.id}`);
      } else {
        toast.error(error instanceof Error ? error.message : "The lead could not be moved.");
      }
    },
  });

  const closeLead = useApiMutation(
    (api, input: { lead: LeadSummary; reason: string }) => api.logContactAttempt(input.lead.id, {
      outcome: "answered_not_interested",
      stage: "lost",
      notes: input.reason,
    }),
    {
      onSuccess: async (_updated, input) => {
        await invalidate();
        toast.success(`${input.lead.fullName} marked as not sold.`);
        setLossLead(undefined);
        setLossReason("");
        setLossError(undefined);
      },
      onError: (error) => setLossError(error instanceof Error ? error.message : "The lead could not be closed."),
    },
  );

  const requestLossReason = (lead: LeadSummary) => {
    setDragOverColumn(undefined);
    setLossLead(lead);
    setLossReason("");
    setLossError(undefined);
  };

  const dropLead = (leadId: string, target: PipelineColumn) => {
    const lead = leads.find((item) => item.id === leadId);
    if (!lead || pipelineColumn(lead) === target) {
      setDragOverColumn(undefined);
      return;
    }
    if (target === "not_sold") {
      requestLossReason(lead);
      return;
    }
    if (target === "sold") {
      setDragOverColumn(undefined);
      router.push(`/crm/leads/${lead.id}`);
      toast.info("Complete the membership sale from the lead record.");
      return;
    }
    moveLead.mutate({ lead, target });
  };

  return (
    <div className="flex h-full flex-col space-y-4">
      <PageHeader
        eyebrow="Growth"
        title="Leads"
        description="Drag leads between trial, sale outcomes, and unanswered contact work."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-line-2 p-0.5" role="group" aria-label="Lead view">
              <button
                type="button"
                onClick={() => setView("board")}
                aria-pressed={view === "board"}
                className={cn("rounded-sm px-2.5 py-1 text-[12px] cursor-pointer", view === "board" ? "bg-ink text-paper" : "text-ink-2")}
              >
                Board
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
                className={cn("rounded-sm px-2.5 py-1 text-[12px] cursor-pointer", view === "list" ? "bg-ink text-paper" : "text-ink-2")}
              >
                <LayoutList className="inline size-3.5 align-[-2px]" /> List
              </button>
            </div>
            <Button onClick={() => setNewOpen(true)} data-testid="new-lead">
              <Plus /> New lead
            </Button>
          </div>
        }
      />

      <div className="max-w-xs">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by name or phone…" aria-label="Filter leads" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PIPELINE_COLUMNS.map(({ column }) => (
            <Skeleton key={column} className="h-64 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : view === "list" ? (
        <LeadListView
          leads={leads}
          onNoAnswer={(lead) => moveLead.mutate({ lead, target: "no_answer" })}
          onNotSold={requestLossReason}
        />
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4" data-testid="pipeline-board">
          {PIPELINE_COLUMNS.map(({ column, label, hint }) => {
            const stageLeads = byStage.get(column) ?? [];
            const stageValue = stageLeads.reduce((s, l) => s + (l.expectedValue?.amount ?? 0), 0);
            return (
              <section
                key={column}
                aria-label={label}
                onDragOver={(event) => { event.preventDefault(); setDragOverColumn(column); }}
                onDragLeave={() => setDragOverColumn((current) => current === column ? undefined : current)}
                onDrop={(event) => { event.preventDefault(); const leadId = event.dataTransfer.getData("text/lead-id"); if (leadId) dropLead(leadId, column); }}
                className={cn("flex w-64 shrink-0 flex-col rounded-lg border bg-sunken/40 transition-colors", dragOverColumn === column ? "border-signal bg-signal-bg/20" : "border-line")}
              >
                <header className="px-3 pb-2 pt-3">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-[12.5px] font-semibold">{label} <span className="ms-1 text-[11px] font-normal text-ink-3 tabular">{stageLeads.length}</span></h2>
                  {stageValue > 0 ? (
                    <MoneyText money={{ amount: stageValue, currency: "JOD" }} compact className="text-[11px] text-ink-3" />
                  ) : null}
                  </div>
                  <p className="mt-0.5 text-[10.5px] text-ink-3">{hint}</p>
                </header>
                <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {stageLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      column={column}
                      onNoAnswer={() => moveLead.mutate({ lead, target: "no_answer" })}
                      onNotSold={() => requestLossReason(lead)}
                    />
                  ))}
                  {stageLeads.length === 0 ? (
                    <p className="rounded-md border border-dashed border-line-2 px-3 py-4 text-center text-[11.5px] text-ink-4">
                      No leads
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <NewLeadDialog open={newOpen} onOpenChange={setNewOpen} />
      <Dialog open={Boolean(lossLead)} onOpenChange={(open) => { if (!open) { setLossLead(undefined); setLossReason(""); setLossError(undefined); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark membership as not sold?</DialogTitle>
            <DialogDescription>
              {lossLead?.fullName ?? "This lead"} will leave the active pipeline. Record the real reason so the team can learn from it later.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label className="block text-[13px] font-medium text-ink-2" htmlFor="pipeline-loss-reason">Reason</label>
            <Textarea
              id="pipeline-loss-reason"
              autoFocus
              className="mt-1.5"
              value={lossReason}
              onChange={(event) => { setLossReason(event.target.value); setLossError(undefined); }}
              placeholder="e.g. Price too high; asked us to follow up next quarter"
            />
            {lossError ? <p role="alert" className="mt-2 text-[12.5px] text-danger">{lossError}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setLossLead(undefined)}>Cancel</Button>
            <Button
              variant="danger"
              disabled={lossReason.trim().length < 5 || !lossLead}
              loading={closeLead.isPending}
              onClick={() => { if (lossLead) closeLead.mutate({ lead: lossLead, reason: lossReason.trim() }); }}
            >
              Mark not sold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeadCard({
  lead,
  column,
  onNoAnswer,
  onNotSold,
}: {
  lead: LeadSummary;
  column: PipelineColumn;
  onNoAnswer: () => void;
  onNotSold: () => void;
}) {
  const actionable = column !== "sold" && column !== "not_sold";
  return (
    <article
      aria-label={`${lead.fullName}, ${columnLabel(column)}`}
      draggable
      onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/lead-id", lead.id); }}
      className="group rounded-md border border-line bg-surface transition-colors hover:border-line-3"
    >
      <div className="flex cursor-grab items-start gap-2 p-2.5 active:cursor-grabbing">
        <GripVertical className="mt-0.5 size-4 shrink-0 text-ink-4" aria-hidden />
        <div className="min-w-0 flex-1">
          <Link href={`/crm/leads/${lead.id}`} className="block truncate text-[13px] font-medium hover:underline" aria-label={`Open ${lead.fullName}`}>
            {lead.fullName}
          </Link>
          <p className="font-mono text-[11px] text-ink-3" dir="ltr">{lead.phone}</p>
        </div>
        <Monogram name={lead.ownerName ?? "?"} size="xs" />
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2 text-[11px]">
        <span className="text-ink-3">{LEAD_SOURCE_LABELS[lead.source]}</span>
        {lead.expectedValue ? <MoneyText money={lead.expectedValue} className="text-ink-2" /> : null}
      </div>
      {lead.nextFollowUpAt ? (
        <p className={cn("mx-2.5 border-t border-line/70 py-1.5 text-[11px]", lead.overdue ? "font-medium text-danger" : "text-ink-3")}>
          {lead.overdue ? "Follow-up overdue — " : "Follow up "}
          <RelativeText iso={lead.nextFollowUpAt} />
        </p>
      ) : null}
      <div className="flex items-center gap-1 border-t border-line px-2 py-1.5">
        <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="inline-flex min-h-8 items-center gap-1 rounded-sm px-2 text-[11.5px] font-medium text-ink-2 hover:bg-sunken hover:text-ink">
          <PhoneCall className="size-3.5" aria-hidden /> Call
        </a>
        {actionable && column !== "no_answer" ? (
          <button type="button" className="min-h-8 rounded-sm px-2 text-[11.5px] font-medium text-ink-2 hover:bg-sunken hover:text-ink" onClick={onNoAnswer} aria-label={`No answer for ${lead.fullName}`}>
            No answer
          </button>
        ) : null}
        {actionable ? (
          <button type="button" className="ms-auto min-h-8 rounded-sm px-2 text-[11.5px] font-medium text-danger hover:bg-danger-bg" onClick={onNotSold} aria-label={`Mark ${lead.fullName} not sold`}>
            Not sold…
          </button>
        ) : (
          <Link href={`/crm/leads/${lead.id}`} className="ms-auto inline-flex min-h-8 items-center rounded-sm px-2 text-[11.5px] font-medium text-ink-2 hover:bg-sunken hover:text-ink">View</Link>
        )}
      </div>
    </article>
  );
}

function LeadListView({ leads, onNoAnswer, onNotSold }: { leads: LeadSummary[]; onNoAnswer: (lead: LeadSummary) => void; onNotSold: (lead: LeadSummary) => void }) {
  if (leads.length === 0) {
    return <p className="py-10 text-center text-[13px] text-ink-3">No leads right now.</p>;
  }
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line">
              {["Lead", "Stage", "Owner", "Source", "Expected", "Next follow-up", "Actions"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 text-start font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-line/70 last:border-0 hover:bg-sunken/40">
                <td className="px-3 py-2.5">
                  <Link href={`/crm/leads/${lead.id}`} className="font-medium hover:underline underline-offset-2">
                    {lead.fullName}
                  </Link>
                  <span className="block whitespace-nowrap font-mono text-[11px] text-ink-3" dir="ltr">{lead.phone}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px]">{columnLabel(pipelineColumn(lead))}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-ink-2">{lead.ownerName ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-ink-2">{LEAD_SOURCE_LABELS[lead.source]}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{lead.expectedValue ? <MoneyText money={lead.expectedValue} /> : "—"}</td>
                <td className={cn("whitespace-nowrap px-3 py-2.5 text-[12px]", lead.overdue ? "font-medium text-danger" : "text-ink-3")}>
                  {lead.nextFollowUpAt ? <RelativeText iso={lead.nextFollowUpAt} /> : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <a href={`tel:${lead.phone.replace(/\s/g, "")}`} className="inline-flex min-h-9 items-center rounded-sm px-2 text-[11.5px] font-medium text-ink-2 hover:bg-sunken">Call</a>
                    {pipelineColumn(lead) !== "sold" && pipelineColumn(lead) !== "not_sold" ? (
                      <>
                        {pipelineColumn(lead) !== "no_answer" ? <button type="button" className="min-h-9 rounded-sm px-2 text-[11.5px] font-medium text-ink-2 hover:bg-sunken" onClick={() => onNoAnswer(lead)}>No answer</button> : null}
                        <button type="button" className="min-h-9 rounded-sm px-2 text-[11.5px] font-medium text-danger hover:bg-danger-bg" onClick={() => onNotSold(lead)}>Not sold…</button>
                      </>
                    ) : null}
                    <Link href={`/crm/leads/${lead.id}`} className="inline-flex min-h-9 items-center rounded-sm px-2 text-[11.5px] font-medium text-ink-2 hover:bg-sunken">Open</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense>
      <WorkspaceModuleBoundary moduleKey="revenue"><PipelinePageInner /></WorkspaceModuleBoundary>
    </Suspense>
  );
}
