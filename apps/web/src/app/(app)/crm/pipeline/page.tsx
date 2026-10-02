"use client";
import { useLocale, useT, type TKey } from "@/lib/i18n/provider";


import { GripVertical, LayoutList, PhoneCall, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { qk } from "@/lib/api/keys";
import { deriveLeadProgressFacts } from "@/lib/crm/lead-progression";
import { contactOutcomeLabel, leadSourceLabel } from "@/features/crm/crm-labels";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import type { LeadListQuery } from "@/lib/api/GymOSApi";
import type { LeadStage, LeadSummary } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { MoneyText, RelativeText } from "@/components/shared/data-display";
import { DataPagination, PageHeader } from "@/components/shared/chrome";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Monogram, Skeleton } from "@/components/ui/misc";
import { EmptyState, ErrorState, QueryErrorState } from "@/components/ui/states";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { NewLeadDialog } from "@/features/crm/new-lead-dialog";
import { toast } from "sonner";
import { WorkspaceModuleBoundary } from "@/components/shell/workspace-module-boundary";
import { Checkbox } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BulkOperationKind } from "@/lib/domain/qol";
import { searchKey } from "@/lib/utils/text";
import { localizeApiError } from "@/lib/api/errors";

type PipelineColumn = "trial" | "sold" | "not_sold" | "no_answer";
const PIPELINE_COLUMNS: Array<{ column: PipelineColumn; labelKey: TKey; hintKey: TKey }> = [
  { column: "trial", labelKey: "crmCompletion.pipeline.columns.trial.label", hintKey: "crmCompletion.pipeline.columns.trial.hint" },
  { column: "sold", labelKey: "crmCompletion.pipeline.columns.sold.label", hintKey: "crmCompletion.pipeline.columns.sold.hint" },
  { column: "not_sold", labelKey: "crmCompletion.pipeline.columns.notSold.label", hintKey: "crmCompletion.pipeline.columns.notSold.hint" },
  { column: "no_answer", labelKey: "crmCompletion.pipeline.columns.noAnswer.label", hintKey: "crmCompletion.pipeline.columns.noAnswer.hint" },
];

function pipelineColumn(lead: LeadSummary): PipelineColumn {
  const facts = lead.progressFacts ?? deriveLeadProgressFacts(lead);
  if (facts.hasConversion) return "sold";
  if (facts.hasLoss) return "not_sold";
  if (facts.hasAttempt && lead.lastContactOutcome === "no_answer") return "no_answer";
  return "trial";
}

const PIPELINE_LEAD_STAGES: LeadStage[] = ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent", "won", "lost"];

function columnLabel(column: PipelineColumn, t: ReturnType<typeof useT>): string {
  const item = PIPELINE_COLUMNS.find((entry) => entry.column === column);
  return item ? t(item.labelKey) : column;
}

function PipelinePageInner() {
  const { t, locale, isolate } = useLocale();
  const { session } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const invalidate = useInvalidate();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const debounced = useDebouncedValue(search, 250);
  const [newOpen, setNewOpen] = useState(searchParams.get("new") === "1");
  const [view, setView] = useState<"board" | "list">(searchParams.get("view") === "list" ? "list" : "board");
  const [page, setPage] = useState(Math.max(1, Number(searchParams.get("page")) || 1));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkKind, setBulkKind] = useState<BulkOperationKind>("leads_create_follow_up");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [dragOverColumn, setDragOverColumn] = useState<PipelineColumn>();
  const [lossLead, setLossLead] = useState<LeadSummary>();
  const [lossReason, setLossReason] = useState("");
  const [lossError, setLossError] = useState<string>();

  // HTML5 drag-and-drop doesn't work on touchscreens — default small touch
  // devices to the list view (the board remains one tap away).
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("view") && window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 1024) {
      setView("list");
    }
  }, []);

  const replaceParams = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
    if (!("page" in changes)) next.delete("page");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };
  useEffect(() => {
    if ((searchParams.get("q") ?? "") !== debounced) replaceParams({ q: debounced || undefined });
    // Only settled search text drives this URL write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const urlState = searchParams.toString();
  useEffect(() => {
    const next = new URLSearchParams(urlState);
    setSearch(next.get("q") ?? "");
    setPage(Math.max(1, Number(next.get("page")) || 1));
    if (next.has("view")) setView(next.get("view") === "list" ? "list" : "board");
  }, [urlState]);

  const query = useMemo(
    () => ({ branchId: session?.activeBranchId, search: searchKey(debounced) || undefined, page, pageSize: 100, sort: "nextFollowUpAt" as const }),
    [session?.activeBranchId, debounced, page],
  );
  const leadQuery = useMemo<LeadListQuery>(() => ({ ...query, stage: PIPELINE_LEAD_STAGES }), [query]);
  const leadQueryKey = useMemo(() => qk.leads(leadQuery), [leadQuery]);
  const { data, isLoading, isError, isBackgroundError, error, refetch } = useRealtimeApiQuery({
    queryKey: leadQueryKey,
    query: (api) => api.listLeads(leadQuery),
    subscribe: (api, onValue, onError) => api.subscribeLeads(leadQuery, onValue, onError),
    fallbackIntervalMs: 4_000,
  });

  const leads = useMemo(() => data?.items ?? [], [data]);
  const users = useApiQuery(qk.users({ status: "active" }), (api) => api.listUsers({ status: "active", pageSize: 100 }));
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
    if (target === "not_sold") return Promise.reject(new Error("Give a reason before marking it not sold."));
    // No stage is forced: the server moves a new lead to "attempted" and leaves a
    // booked trial where it is. The column is derived from the outcome itself.
    if (target === "no_answer") return api.logContactAttempt(lead.id, { outcome: "no_answer", notes: "Moved to Did not answer on the Leads page." });
    return api.updateLead(lead.id, { stage: "contacted", lostReason: undefined });
  }, {
    onSuccess: async (_updated, input) => {
      await invalidate();
      setDragOverColumn(undefined);
      toast.success(t("crmCompletion.pipeline.moved", { name: isolate(input.lead.fullName), stage: columnLabel(input.target, t) }));
    },
    onError: (error, input) => {
      setDragOverColumn(undefined);
      if (input.target === "sold") {
        toast.error(t("crmCompletion.pipeline.saleActionRequired"));
        router.push(`/crm/leads/${input.lead.id}`);
      } else if (input.target === "not_sold") {
        toast.error(t("crmCompletion.pipeline.notSoldReasonRequired"));
      } else {
        toast.error(error instanceof Error ? localizeApiError(error, locale).message : t("crmCompletion.pipeline.moveFailed"));
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
        toast.success(t("crmCompletion.pipeline.markedNotSold", { name: isolate(input.lead.fullName) }));
        setLossLead(undefined);
        setLossReason("");
        setLossError(undefined);
      },
      onError: (error) => setLossError(error instanceof Error ? localizeApiError(error, locale).message : t("crmCompletion.pipeline.saveFailed")),
    },
  );

  const runBulk = useApiMutation((api) => api.runBulkOperation({
    kind: bulkKind,
    recordIds: [...selected],
    idempotencyKey: crypto.randomUUID(),
    ownerId: bulkKind === "leads_assign_owner" ? bulkValue : undefined,
    dueAt: bulkKind === "leads_create_follow_up" ? new Date(bulkValue).toISOString() : undefined,
    reason: bulkKind === "leads_close_lost" ? bulkReason.trim() : undefined,
  }), { onSuccess: async (job) => { await invalidate(); setBulkOpen(false); setSelected(new Set()); setBulkValue(""); setBulkReason(""); toast.success([job.succeededCount ? t("crmCompletion.pipeline.bulk.updated", { count: job.succeededCount }) : undefined, job.skippedCount ? t("crmCompletion.pipeline.bulk.skipped", { count: job.skippedCount }) : undefined, job.failedCount ? t("crmCompletion.pipeline.bulk.failed", { count: job.failedCount }) : undefined].filter(Boolean).join(" ")); } });

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
      toast.info(t("crmCompletion.pipeline.salePageHint"));
      return;
    }
    moveLead.mutate({ lead, target });
  };

  return (
    <div className="flex h-full flex-col space-y-4">
      <PageHeader
        title={t("crm.pipeline.title")}
        description={t("crmCompletion.pipeline.description")}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-line-2 p-0.5" role="group" aria-label={t("crm.pipeline.viewLabel")}>
              <button
                type="button"
                onClick={() => { setView("board"); replaceParams({ view: "board" }); }}
                aria-pressed={view === "board"}
                className={cn("min-h-9 rounded-sm px-3 py-1 text-[13px] cursor-pointer", view === "board" ? "bg-sunken text-ink" : "text-ink-2 hover:bg-sunken/50")}
              >
                {t("crmCompletion.pipeline.board")}
              </button>
              <button
                type="button"
                onClick={() => { setView("list"); replaceParams({ view: "list" }); }}
                aria-pressed={view === "list"}
                className={cn("min-h-9 rounded-sm px-3 py-1 text-[13px] cursor-pointer", view === "list" ? "bg-sunken text-ink" : "text-ink-2 hover:bg-sunken/50")}
              >
                <LayoutList className="inline size-3.5 align-[-2px]" />{" "}{t("palette.notifications.viewList")}</button>
            </div>
            <Button onClick={() => setNewOpen(true)} data-testid="new-lead">
              <Plus />{" "}{t("crm.newLead.title")}</Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full max-w-xs"><Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t("crmCompletion.pipeline.searchPlaceholder")} aria-label={t("crmCompletion.pipeline.searchLabel")} /></div>
      </div>

      {selected.size ? <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ink bg-ink px-3 py-2 text-paper"><span className="text-[12.5px] font-semibold">{t("crmCompletion.pipeline.selected", { count: selected.size })}</span><Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}><UsersRound /> {t("crmCompletion.pipeline.changeSelected")}</Button><button type="button" className="text-[12px] underline underline-offset-4" onClick={() => setSelected(new Set())}>{t("members.list.clearSelection")}</button></div> : null}

      {isBackgroundError ? <ErrorState layout="inline" title={t("crmCompletion.pipeline.backgroundError")} onRetry={() => refetch()} /> : null}
      {isLoading && !data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PIPELINE_COLUMNS.map(({ column }) => (
            <Skeleton key={column} className="h-64 w-full" />
          ))}
        </div>
      ) : isError && !data ? (
        // A role without CRM access lands here by direct URL; say so instead
        // of offering a retry that can never succeed.
        <QueryErrorState error={error} onRetry={() => refetch()} forbiddenDescription={t("crmCompletion.pipeline.forbidden")} />
      ) : view === "list" ? (
        <LeadListView
          leads={leads}
          onNoAnswer={(lead) => moveLead.mutate({ lead, target: "no_answer" })}
          onNotSold={requestLossReason}
          selected={selected}
          onSelectedChange={setSelected}
        />
      ) : (
        <div className="flex min-w-0 gap-3 overflow-x-auto pb-4" data-testid="pipeline-board">
          {PIPELINE_COLUMNS.map(({ column, labelKey, hintKey }) => {
            const label = t(labelKey);
            const hint = t(hintKey);
            const stageLeads = byStage.get(column) ?? [];
            const stageValue = stageLeads.reduce((s, l) => s + (l.expectedValue?.amount ?? 0), 0);
            return (
              <section
                key={column}
                aria-label={label}
                onDragOver={(event) => { event.preventDefault(); setDragOverColumn(column); }}
                onDragLeave={() => setDragOverColumn((current) => current === column ? undefined : current)}
                onDrop={(event) => { event.preventDefault(); const leadId = event.dataTransfer.getData("text/lead-id"); if (leadId) dropLead(leadId, column); }}
                className={cn("flex w-64 shrink-0 flex-col rounded-lg border bg-paper transition-colors", dragOverColumn === column ? "border-signal bg-signal-bg/20" : "border-line")}
              >
                <header className="px-3 pb-2 pt-3">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-[12.5px] font-semibold">{label} <span className="ms-1 text-[12px] font-normal text-ink-3 tabular">{stageLeads.length}</span></h2>
                  {stageValue > 0 ? (
                    <MoneyText money={{ amount: stageValue, currency: "JOD" }} compact className="text-[12px] text-ink-3" />
                  ) : null}
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>
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
                    <p className="rounded-md border border-dashed border-line-2 px-3 py-4 text-center text-[12px] text-ink-4">
                      {t("crmCompletion.pipeline.emptyColumn")}
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {data && data.totalPages > 1 && view === "board" ? <p className="text-[12px] text-ink-2">{t("crmCompletion.pipeline.pageOnly")}</p> : null}
      {data ? <DataPagination page={data} onPage={(next) => { setPage(next); replaceParams({ page: next === 1 ? undefined : String(next) }); }} className="border-t border-line pt-3" /> : null}

      <NewLeadDialog open={newOpen} onOpenChange={setNewOpen} />
      <Dialog open={Boolean(lossLead)} onOpenChange={(open) => { if (!open) { setLossLead(undefined); setLossReason(""); setLossError(undefined); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("crmCompletion.pipeline.lossTitle")}</DialogTitle>
            <DialogDescription>
              {t("crmCompletion.pipeline.lossDescription", { name: isolate(lossLead?.fullName ?? t("crmCompletion.pipeline.unnamedLead")) })}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <label className="block text-[13px] font-medium text-ink-2" htmlFor="pipeline-loss-reason">{t("common.label.reason")}</label>
            <Textarea
              id="pipeline-loss-reason"
              autoFocus
              className="mt-1.5"
              value={lossReason}
              onChange={(event) => { setLossReason(event.target.value); setLossError(undefined); }}
              dir="auto"
              placeholder={t("crmCompletion.pipeline.lossReasonPlaceholder")}
            />
            {lossError ? <p role="alert" className="mt-2 text-[12.5px] text-danger">{lossError}</p> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setLossLead(undefined)}>{t("common.action.cancel")}</Button>
            <Button
              variant="danger"
              disabled={lossReason.trim().length < 5 || !lossLead}
              loading={closeLead.isPending}
              onClick={() => { if (lossLead) closeLead.mutate({ lead: lossLead, reason: lossReason.trim() }); }}
            >
              {t("crmCompletion.pipeline.markNotSold")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("crmCompletion.pipeline.bulk.title", { count: selected.size })}</DialogTitle>
            <DialogDescription>{t("crmCompletion.pipeline.bulk.description")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <label className="grid gap-1.5 text-[12.5px] font-medium">{t("crmCompletion.pipeline.bulk.actionLabel")}
              <Select value={bulkKind} onValueChange={(value) => { setBulkKind(value as BulkOperationKind); setBulkValue(""); setBulkReason(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="leads_create_follow_up">{t("members.bulk.createFollowUp")}</SelectItem>
                  <SelectItem value="leads_assign_owner">{t("crmCompletion.pipeline.bulk.changeOwner")}</SelectItem>
                  <SelectItem value="leads_close_lost">{t("crmCompletion.pipeline.bulk.markNotSold")}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            {bulkKind === "leads_create_follow_up" ? <label className="grid gap-1.5 text-[12.5px] font-medium">{t("members.bulk.dueAt")}<Input type="datetime-local" dir="ltr" value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} /></label> : bulkKind === "leads_assign_owner" ? <label className="grid gap-1.5 text-[12.5px] font-medium">{t("crm.lead.ownerLabel")}<Select value={bulkValue || "none"} onValueChange={setBulkValue}><SelectTrigger><SelectValue placeholder={t("crmCompletion.pipeline.bulk.chooseOwner")} /></SelectTrigger><SelectContent><SelectItem value="none" disabled>{t("crmCompletion.pipeline.bulk.chooseOwner")}</SelectItem>{(users.data?.items ?? []).map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select></label> : <label className="grid gap-1.5 text-[12.5px] font-medium">{t("common.label.reason")}<Textarea value={bulkReason} dir="auto" onChange={(event) => setBulkReason(event.target.value)} placeholder={t("crmCompletion.pipeline.bulk.reasonPlaceholder")} /></label>}
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setBulkOpen(false)}>{t("common.action.cancel")}</Button><Button variant={bulkKind === "leads_close_lost" ? "danger" : "primary"} disabled={!selected.size || (bulkKind === "leads_close_lost" ? bulkReason.trim().length < 3 : !bulkValue)} loading={runBulk.isPending} onClick={() => runBulk.mutate()}>{t("crmCompletion.pipeline.bulk.update", { count: selected.size })}</Button></DialogFooter>
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
  embedded = false,
}: {
  lead: LeadSummary;
  column: PipelineColumn;
  onNoAnswer: () => void;
  onNotSold: () => void;
  embedded?: boolean;
}) {
  const { t, isolate } = useLocale();
  const actionable = column !== "sold" && column !== "not_sold";
  return (
    <article
      aria-label={`${isolate(lead.fullName)}, ${columnLabel(column, t)}`}
      draggable={!embedded}
      onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/lead-id", lead.id); }}
      className={cn("group bg-surface", !embedded && "rounded-md border border-line transition-colors hover:border-line-3")}
    >
      <div className="flex items-start gap-2 p-2.5 active:cursor-grabbing">
        {!embedded ? <GripVertical className="mt-0.5 hidden size-4 shrink-0 cursor-grab text-ink-4 [@media(pointer:fine)]:block" aria-hidden /> : null}
        <div className="min-w-0 flex-1">
          <Link href={`/crm/leads/${lead.id}`} className="block break-words text-[13.5px] font-medium hover:underline" dir="auto" aria-label={t("crmCompletion.pipeline.card.openLead", { name: isolate(lead.fullName) })}>
            {lead.fullName}
          </Link>
          <p className="text-[12px] text-ink-3" dir="ltr">{lead.phone}</p>
        </div>
        <span title={lead.ownerName ?? t("crmCompletion.pipeline.card.unassigned")}><Monogram name={lead.ownerName ?? "?"} size="xs" /></span>
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2 text-[12px]">
        <span className="text-ink-2" dir="auto">{lead.ownerName ?? t("crmCompletion.pipeline.card.unassigned")}</span>
        {lead.expectedValue ? <MoneyText money={lead.expectedValue} className="text-ink-2" /> : null}
      </div>
      {lead.lastContactAt ? <p className="px-2.5 pb-2 text-[12px] text-ink-2">{contactOutcomeLabel(t, lead.lastContactOutcome) ?? t("crmCompletion.pipeline.card.lastContact")} · <RelativeText iso={lead.lastContactAt} /></p> : <p className="px-2.5 pb-2 text-[12px] text-ink-2">{t("crmCompletion.pipeline.card.notContacted")}</p>}
      {lead.nextFollowUpAt ? (
        <p className={cn("mx-2.5 border-t border-line/70 py-1.5 text-[12px]", lead.overdue ? "font-medium text-danger" : "text-ink-3")}>
          {lead.overdue ? `${t("crmCompletion.pipeline.card.overdue")} — ` : `${t("crmCompletion.pipeline.card.followUp")} `}
          <RelativeText iso={lead.nextFollowUpAt} />
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-1 border-t border-line px-2 py-1.5">
        <a data-touch-target href={`tel:${lead.phone.replace(/\s/g, "")}`} className="inline-flex min-h-8 items-center gap-1 rounded-sm px-2 text-[12px] font-medium text-ink-2 hover:bg-sunken hover:text-ink">
          <PhoneCall className="size-3.5" aria-hidden /> {t("crmCompletion.pipeline.card.call")}
        </a>
        {actionable && column !== "no_answer" ? (
          <button data-touch-target type="button" className="min-h-8 rounded-sm px-2 text-[12px] font-medium text-ink-2 hover:bg-sunken hover:text-ink" onClick={onNoAnswer} aria-label={t("crmCompletion.pipeline.card.noAnswerFor", { name: isolate(lead.fullName) })}>{t("memberProfile.contact.outcome.no_answer")}</button>
        ) : null}
        {actionable ? (
          <button data-touch-target type="button" className="ms-auto min-h-8 rounded-sm px-2 text-[12px] font-medium text-ink-2 hover:bg-sunken" onClick={onNotSold} aria-label={t("crmCompletion.pipeline.card.markNotSoldFor", { name: isolate(lead.fullName) })}>
            {t("crmCompletion.pipeline.card.notSold")}
          </button>
        ) : (
          <Link data-touch-target href={`/crm/leads/${lead.id}`} className="ms-auto inline-flex min-h-8 items-center rounded-sm px-2 text-[12px] font-medium text-ink-2 hover:bg-sunken hover:text-ink">{t("crmCompletion.pipeline.card.view")}</Link>
        )}
      </div>
    </article>
  );
}

function LeadListView({ leads, onNoAnswer, onNotSold, selected, onSelectedChange }: { leads: LeadSummary[]; onNoAnswer: (lead: LeadSummary) => void; onNotSold: (lead: LeadSummary) => void; selected: Set<string>; onSelectedChange: (selected: Set<string>) => void }) {
  const t = useT();
  if (leads.length === 0) {
    return <EmptyState layout="section" title={t("crmCompletion.pipeline.emptySearchTitle")} description={t("crmCompletion.pipeline.emptySearchDescription")} />;
  }
  return (
    <div className="panel overflow-hidden">
      <ul className="divide-y divide-line xl:hidden" aria-label={t("crm.pipeline.title")}>
        {leads.map((lead) => <li key={lead.id} className="p-4" data-testid="lead-compact-row">
          <div className="mb-3 flex items-center justify-between gap-3"><Checkbox checked={selected.has(lead.id)} onCheckedChange={(checked) => { const next = new Set(selected); if (checked) next.add(lead.id); else next.delete(lead.id); onSelectedChange(next); }} aria-label={t("crmCompletion.pipeline.card.selectLead", { name: lead.fullName })} /><span className="text-[12px] text-ink-2">{columnLabel(pipelineColumn(lead), t)}</span></div>
          <LeadCard embedded lead={lead} column={pipelineColumn(lead)} onNoAnswer={() => onNoAnswer(lead)} onNotSold={() => onNotSold(lead)} />
        </li>)}
      </ul>
      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line">
              <th className="w-10 px-3 py-2 text-start"><Checkbox checked={leads.length > 0 && leads.every((lead) => selected.has(lead.id))} onCheckedChange={(checked) => { const next = new Set(selected); leads.forEach((lead) => { if (checked) next.add(lead.id); else next.delete(lead.id); }); onSelectedChange(next); }} aria-label={t("crmCompletion.pipeline.card.selectAll")} /></th>
              {([
                ["lead", "crmCompletion.pipeline.card.headers.lead"],
                ["stage", "crmCompletion.pipeline.card.headers.stage"],
                ["owner", "crmCompletion.pipeline.card.headers.owner"],
                ["source", "crmCompletion.pipeline.card.headers.source"],
                ["expectedSale", "crmCompletion.pipeline.card.headers.expectedSale"],
                ["nextFollowUp", "crmCompletion.pipeline.card.headers.nextFollowUp"],
                ["actions", "crmCompletion.pipeline.card.headers.actions"],
              ] as const).map(([key, headerKey]) => (
                <th key={key} className="whitespace-nowrap px-3 py-2 text-start text-[12px] font-medium text-ink-3">
                  {t(headerKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-line/70 last:border-0 hover:bg-sunken/40">
                <td className="px-3 py-2.5"><Checkbox checked={selected.has(lead.id)} onCheckedChange={(checked) => { const next = new Set(selected); if (checked) next.add(lead.id); else next.delete(lead.id); onSelectedChange(next); }} aria-label={t("crmCompletion.pipeline.card.selectLead", { name: lead.fullName })} /></td>
                <td className="px-3 py-2.5">
                  <Link href={`/crm/leads/${lead.id}`} className="font-medium hover:underline underline-offset-2" dir="auto">
                    {lead.fullName}
                  </Link>
                  <span className="block whitespace-nowrap text-[12px] text-ink-3" dir="ltr">{lead.phone}</span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px]">{columnLabel(pipelineColumn(lead), t)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-ink-2" dir="auto">{lead.ownerName ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[12.5px] text-ink-2">{leadSourceLabel(t, lead.source)}</td>
                <td className="whitespace-nowrap px-3 py-2.5">{lead.expectedValue ? <MoneyText money={lead.expectedValue} /> : "—"}</td>
                <td className={cn("whitespace-nowrap px-3 py-2.5 text-[12px]", lead.overdue ? "font-medium text-danger" : "text-ink-3")}>
                  {lead.nextFollowUpAt ? <RelativeText iso={lead.nextFollowUpAt} /> : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <a data-touch-target href={`tel:${lead.phone.replace(/\s/g, "")}`} className="inline-flex min-h-9 items-center rounded-sm px-2 text-[12px] font-medium text-ink-2 hover:bg-sunken">{t("crmCompletion.pipeline.card.call")}</a>
                    {pipelineColumn(lead) !== "sold" && pipelineColumn(lead) !== "not_sold" ? (
                      <>
                        {pipelineColumn(lead) !== "no_answer" ? <button data-touch-target type="button" className="min-h-9 rounded-sm px-2 text-[12px] font-medium text-ink-2 hover:bg-sunken" onClick={() => onNoAnswer(lead)}>{t("memberProfile.contact.outcome.no_answer")}</button> : null}
                        <button data-touch-target type="button" className="min-h-9 rounded-sm px-2 text-[12px] font-medium text-ink-2 hover:bg-sunken" onClick={() => onNotSold(lead)}>{t("crmCompletion.pipeline.card.notSold")}</button>
                      </>
                    ) : null}
                    <Link data-touch-target href={`/crm/leads/${lead.id}`} className="inline-flex min-h-9 items-center rounded-sm px-2 text-[12px] font-medium text-ink-2 hover:bg-sunken">{t("dashboard.today.action.open")}</Link>
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
