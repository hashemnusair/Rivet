"use client";

import { GripVertical, LayoutList, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import type { LeadListQuery } from "@/lib/api/GymOSApi";
import type { LeadStage, LeadSummary } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { MoneyText, RelativeText } from "@/components/shared/data-display";
import { PageHeader } from "@/components/shared/chrome";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Monogram, Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { NewLeadDialog } from "@/features/crm/new-lead-dialog";
import { toast } from "sonner";

type PipelineColumn = "trial" | "sold" | "not_sold" | "no_answer";
const PIPELINE_COLUMNS: Array<{ column: PipelineColumn; label: string; hint: string }> = [
  { column: "trial", label: "Trial", hint: "New leads and active trial work" },
  { column: "sold", label: "Membership sold", hint: "Completed membership sales" },
  { column: "not_sold", label: "Membership not sold", hint: "Closed without a membership" },
  { column: "no_answer", label: "Did not answer", hint: "Contact attempts still unanswered" },
];

function pipelineColumn(lead: LeadSummary): PipelineColumn {
  if (lead.stage === "won") return "sold";
  if (lead.stage === "lost") return "not_sold";
  if (lead.stage === "attempted") return "no_answer";
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
    if (target === "not_sold") return api.logContactAttempt(lead.id, { outcome: "answered_not_interested", stage: "lost", notes: "Moved to Membership not sold from the pipeline." });
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

  const dropLead = (leadId: string, target: PipelineColumn) => {
    const lead = leads.find((item) => item.id === leadId);
    if (!lead || pipelineColumn(lead) === target) {
      setDragOverColumn(undefined);
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
        <LeadListView leads={leads} />
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
                    <LeadCard key={lead.id} lead={lead} column={column} />
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
    </div>
  );
}

function LeadCard({ lead, column }: { lead: LeadSummary; column: PipelineColumn }) {
  const t = useT();
  return (
    <Link
      href={`/crm/leads/${lead.id}`}
      aria-label={`${lead.fullName}, ${columnLabel(column)}`}
      draggable
      onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/lead-id", lead.id); }}
      className="group block cursor-grab rounded-md border border-line bg-surface p-2.5 transition-colors hover:border-line-3 active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 size-4 shrink-0 text-ink-4" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{lead.fullName}</p>
          <p className="font-mono text-[11px] text-ink-3" dir="ltr">{lead.phone}</p>
        </div>
        <Monogram name={lead.ownerName ?? "?"} size="xs" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-ink-3">{t(`domain.leadSource.${lead.source}`)}</span>
        {lead.expectedValue ? <MoneyText money={lead.expectedValue} className="text-ink-2" /> : null}
      </div>
      {lead.nextFollowUpAt ? (
        <p className={cn("mt-1.5 border-t border-line/70 pt-1.5 text-[11px]", lead.overdue ? "font-medium text-danger" : "text-ink-3")}>
          {lead.overdue ? "Follow-up overdue — " : "Follow up "}
          <RelativeText iso={lead.nextFollowUpAt} />
        </p>
      ) : null}
    </Link>
  );
}

function LeadListView({ leads }: { leads: LeadSummary[] }) {
  const t = useT();
  if (leads.length === 0) {
    return <p className="py-10 text-center text-[13px] text-ink-3">No leads right now.</p>;
  }
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line">
              {["Lead", "Stage", "Owner", "Source", "Expected", "Next follow-up"].map((h) => (
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
                <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-ink-2">{t(`domain.leadSource.${lead.source}`)}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{lead.expectedValue ? <MoneyText money={lead.expectedValue} /> : "—"}</td>
                <td className={cn("whitespace-nowrap px-3 py-2.5 text-[12px]", lead.overdue ? "font-medium text-danger" : "text-ink-3")}>
                  {lead.nextFollowUpAt ? <RelativeText iso={lead.nextFollowUpAt} /> : "—"}
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
      <PipelinePageInner />
    </Suspense>
  );
}
