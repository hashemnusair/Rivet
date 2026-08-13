"use client";

import { LayoutList, Plus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/api/keys";
import { getApi } from "@/lib/api/client";
import { useApiQuery } from "@/lib/hooks/use-api";
import type { LeadListQuery } from "@/lib/api/GymOSApi";
import type { LeadStage, LeadSummary } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { MoneyText, RelativeText } from "@/components/shared/data-display";
import { PageHeader } from "@/components/shared/chrome";
import { LEAD_SOURCE_LABELS } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Monogram, Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { NewLeadDialog } from "@/features/crm/new-lead-dialog";

type SimpleSalesStage = "trial" | "membership";
const SIMPLE_STAGES: Array<{ stage: SimpleSalesStage; label: string; hint: string }> = [
  { stage: "trial", label: "Trial", hint: "Book, confirm, or complete the trial" },
  { stage: "membership", label: "Membership sale", hint: "Complete the trial, then record the sale" },
];

function simpleStage(stage: LeadStage): SimpleSalesStage {
  if (stage === "trial_completed" || stage === "offer_sent") return "membership";
  return "trial";
}

// Closed outcomes remain available from the lead/member timeline, but the
// working board should contain only records that still need staff action.
const ACTIVE_LEAD_STAGES: LeadStage[] = ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent"];

function PipelinePageInner() {
  const { session } = useApp();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const [newOpen, setNewOpen] = useState(searchParams.get("new") === "1");
  const [view, setView] = useState<"board" | "list">("board");

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
  const leadQuery = useMemo<LeadListQuery>(() => ({ ...query, stage: ACTIVE_LEAD_STAGES }), [query]);
  const leadQueryKey = useMemo(() => qk.leads(leadQuery), [leadQuery]);
  const { data, isLoading, isError, refetch } = useApiQuery(leadQueryKey, (api) => api.listLeads(leadQuery), { refetchInterval: false });

  // The pipeline is the first CRM surface on the native subscription path.
  // Keep TanStack Query as the rendered cache so mutations and navigation use
  // the same data contract while Convex pushes cross-tab lead/trial changes.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    let fallbackTimer: number | undefined;
    const stopFallback = () => {
      if (fallbackTimer === undefined) return;
      window.clearInterval(fallbackTimer);
      fallbackTimer = undefined;
    };
    const startFallback = () => {
      if (fallbackTimer !== undefined) return;
      fallbackTimer = window.setInterval(() => {
        void refetch();
      }, 4_000);
    };
    void getApi().subscribeLeads(leadQuery, (page) => {
      if (cancelled) return;
      stopFallback();
      queryClient.setQueryData(leadQueryKey, page);
    }, () => {
      if (!cancelled) startFallback();
    }).then((disposer) => {
      if (cancelled) disposer();
      else unsubscribe = disposer;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      stopFallback();
      unsubscribe?.();
    };
  }, [leadQuery, leadQueryKey, queryClient, refetch]);

  // Keep the active-work boundary on the client as well as the API query. It
  // prevents an older deployed backend (or a stale realtime snapshot) from
  // putting closed outcomes back on the working board during rollout.
  const leads = useMemo(() => (data?.items ?? []).filter((lead) => ACTIVE_LEAD_STAGES.includes(lead.stage)), [data]);
  const byStage = useMemo(() => {
    const map = new Map<SimpleSalesStage, LeadSummary[]>();
    for (const stage of SIMPLE_STAGES) map.set(stage.stage, []);
    for (const lead of leads) {
      map.get(simpleStage(lead.stage))?.push(lead);
    }
    return map;
  }, [leads]);

  return (
    <div className="flex h-full flex-col space-y-4">
      <PageHeader
        eyebrow="Growth"
        title="Leads"
        description="Work active trials and membership sales here. Closed outcomes stay in the lead and member history."
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
          {SIMPLE_STAGES.map(({ stage }) => (
            <Skeleton key={stage} className="h-64 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : view === "list" ? (
        <LeadListView leads={leads} />
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4" data-testid="pipeline-board">
          {SIMPLE_STAGES.map(({ stage, label, hint }) => {
            const stageLeads = byStage.get(stage) ?? [];
            const stageValue = stageLeads.reduce((s, l) => s + (l.expectedValue?.amount ?? 0), 0);
            return (
              <section
                key={stage}
                aria-label={label}
                className="flex w-64 shrink-0 flex-col rounded-lg border border-line bg-sunken/40"
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
                    <LeadCard key={lead.id} lead={lead} />
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

function LeadCard({ lead }: { lead: LeadSummary }) {
  return (
    <Link
      href={`/crm/leads/${lead.id}`}
      aria-label={`${lead.fullName}, ${lead.stage}`}
      className="group block cursor-pointer rounded-md border border-line bg-surface p-2.5 transition-colors hover:border-line-3"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{lead.fullName}</p>
          <p className="font-mono text-[11px] text-ink-3" dir="ltr">{lead.phone}</p>
        </div>
        <Monogram name={lead.ownerName ?? "?"} size="xs" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-ink-3">{LEAD_SOURCE_LABELS[lead.source]}</span>
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
                <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] capitalize">{simpleStage(lead.stage).replace(/_/g, " ")}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-ink-2">{lead.ownerName ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-ink-2">{LEAD_SOURCE_LABELS[lead.source]}</td>
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
