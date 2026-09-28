"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ClipboardList, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MoneyText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { dashboardScopeDescription } from "@/features/dashboard/dashboard-scope";
import { TodayQueueRow, useTodayQueueCompletion } from "@/features/dashboard/today-queue";
import { qk } from "@/lib/api/keys";
import type { BriefFigure, BriefItem, BriefSection, BriefSource, OperatingBrief, TodayQueueItem } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { formatTime } from "@/lib/utils/dates";
import { briefEmphasis, briefPairKey, briefSharedWords } from "../../../convex/operatingBrief";

const SECTION_PREVIEW = 3;

const SOURCE_STATUS: Record<BriefSource["status"], { label: string; tone: "success" | "neutral" | "warning" | "danger" }> = {
  ok: { label: "read", tone: "success" },
  empty: { label: "nothing open", tone: "neutral" },
  not_enabled: { label: "module off", tone: "warning" },
  no_permission: { label: "not for your role", tone: "neutral" },
  unavailable: { label: "could not be read", tone: "danger" },
};

function FigureValue({ figure }: { figure: BriefFigure }) {
  const value = figure.value.kind === "money" ? <MoneyText money={figure.value.money} /> : <span className="tabular">{figure.value.value}</span>;
  return figure.href ? <Link href={figure.href} className="font-medium text-ink hover:underline">{value}</Link> : <span className="font-medium text-ink">{value}</span>;
}

function Figures({ figures, testId }: { figures: BriefFigure[]; testId: string }) {
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-3" data-testid={testId}>
      {figures.map((figure) => (
        <div key={figure.key} className="flex items-baseline gap-1.5" data-figure={figure.key}>
          <dt>{figure.label}</dt>
          <dd><FigureValue figure={figure} /></dd>
        </div>
      ))}
    </dl>
  );
}

function ItemExtra({ item }: { item: BriefItem }) {
  if (item.overdueDays === undefined) return null;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
      {item.overdueDays !== undefined ? <Badge variant={item.stale ? "danger" : "warning"} data-testid="brief-item-overdue">{item.stale ? `waiting ${item.overdueDays} days` : item.overdueDays === 0 ? "due today, past time" : `${item.overdueDays} day${item.overdueDays === 1 ? "" : "s"} overdue`}</Badge> : null}
    </p>
  );
}
function EmphasisCard({ brief }: { brief: OperatingBrief }) {
  const fallback = briefEmphasis(brief.defaultEmphasis);
  const evidence = (keys: string[]) => brief.sections.filter((section) => keys.includes(section.key));
  return (
    <div className="space-y-2" data-testid="brief-emphasis">
      <div className="rounded-md border border-line bg-sunken/30 px-3 py-2" data-testid="brief-emphasis-default">
        <p className="context-label">Start here (standard order)</p>
        <p className="mt-0.5 text-[13.5px] font-semibold text-ink">{fallback?.heading ?? "Routine day"}</p>
        <EmphasisEvidence sections={evidence(fallback?.sections ?? [])} />
      </div>
    </div>
  );
}

function EmphasisEvidence({ sections }: { sections: BriefSection[] }) {
  if (!sections.length) return <p className="mt-1 text-[12px] text-ink-3">Nothing stands out; work the sections in their usual order.</p>;
  return (
    <ul className="mt-1 space-y-1" data-testid="brief-emphasis-evidence">
      {sections.map((section) => (
        <li key={section.key} className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-ink-3">
          <a href={`#brief-section-${section.key}`} className="font-medium text-ink hover:underline">{section.label}</a>
          <Figures figures={section.figures} testId={`brief-emphasis-figures-${section.key}`} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The evidence-backed daily operating brief on the owner and manager
 * dashboards. Every figure, count, overdue condition and the order come from
 * the server for the viewer's own scope; the page reads it on open or on an
 * explicit refresh only and caches it under the viewer's identity and
 * branch scope. Mandatory items stay on top and are never folded away, the
 * complete queue is one click away, every row is the Today queue's own row
 * with its own permitted action, and missing sources are shown as partial
 * coverage. Similar wording is shown as a deterministic review aid; neither
 * the wording comparison nor the standard emphasis order hides, merges or
 * reorders anything.
 */
export function OperatingBriefPanel({ branchId }: { branchId?: string }) {
  const { session } = useApp();
  const viewer = session ? `${session.user.id}:${session.roles[0] ?? ""}:${session.branches.map((branch) => branch.id).join(",")}` : "anonymous";
  const query = useApiQuery(qk.operatingBrief(viewer, branchId), (api) => api.getOperatingBrief(branchId ? { branchId } : {}), { enabled: Boolean(session), staleTime: 5 * 60_000, refetchOnWindowFocus: false, retry: false });
  const brief = query.data;
  const completion = useTodayQueueCompletion();
  const [mode, setMode] = useState<"sections" | "queue">("sections");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const row = (item: BriefItem, testId: string) => (
    <TodayQueueRow
      key={item.id}
      item={item as TodayQueueItem}
      first={false}
      completing={completion.isCompleting(item as TodayQueueItem)}
      onComplete={() => completion.requestComplete(item as TodayQueueItem)}
      extra={<ItemExtra item={item} />}
      testId={testId}
    />
  );

  const generated = brief ? formatTime(brief.generatedAt) : undefined;
  const failedAfterData = query.isError && Boolean(brief);
  const unreadSources = brief ? brief.sources.filter((source) => source.status !== "ok" && source.status !== "empty") : [];
  const emptySections = brief ? brief.sections.filter((section) => section.totalItems === 0) : [];
  const openSections = brief ? brief.sections.filter((section) => section.totalItems > 0) : [];

  return (
    <section className="panel overflow-hidden" aria-labelledby="operating-brief-title" data-testid="operating-brief">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-md bg-ink text-paper" aria-hidden><ClipboardList className="size-3.5" /></span>
            <h2 id="operating-brief-title" className="text-[15px] font-semibold tracking-[-0.01em]">Operating brief</h2>
            {brief ? <Badge variant={brief.coverage === "complete" ? "success" : "warning"} dot data-testid="brief-coverage">{brief.coverage === "complete" ? "Complete coverage" : `Partial coverage · ${unreadSources.length} source${unreadSources.length === 1 ? "" : "s"} not read`}</Badge> : null}
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3" data-testid="brief-scope">
            {brief ? <>{dashboardScopeDescription(brief.scope.branches, brief.scope.branchId)}{brief.scope.branchScope === "selected" ? " Your assigned branches only." : ""} Generated {generated} · {brief.today}.</> : "Reading the unresolved queues for your scope."}
            {failedAfterData ? <span className="ms-1 text-warning-deep" data-testid="brief-stale">The last refresh failed; this is the brief from {generated}.</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {brief ? (
            <div className="flex gap-1" role="group" aria-label="Brief view">
              <Button type="button" size="xs" variant={mode === "sections" ? "primary" : "secondary"} aria-pressed={mode === "sections"} onClick={() => setMode("sections")}>Sections</Button>
              <Button type="button" size="xs" variant={mode === "queue" ? "primary" : "secondary"} aria-pressed={mode === "queue"} onClick={() => setMode("queue")} data-testid="brief-queue-toggle">Complete queue · {brief.totals.items}</Button>
            </div>
          ) : null}
          <Button type="button" size="xs" variant="secondary" onClick={() => void query.refetch()} loading={query.isFetching} disabled={query.isFetching} aria-label="Refresh the brief" data-testid="brief-refresh"><RefreshCw /> Refresh</Button>
        </div>
      </header>

      {query.isLoading ? (
        <div className="space-y-3 p-4 sm:p-5" aria-label="Loading the operating brief"><Skeleton className="h-10 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : !brief ? (
        <div className="px-5 py-8 text-center text-[12.5px] text-ink-3" role="status" data-testid="brief-error">The brief could not be read. <Button type="button" size="xs" variant="secondary" className="ms-2" onClick={() => void query.refetch()}>Try again</Button></div>
      ) : (
        <div className="space-y-4 p-4 sm:p-5">
          <EmphasisCard brief={brief} />

          {brief.mandatory.length ? (
            <section aria-labelledby="brief-mandatory-title" data-testid="brief-mandatory" className="rounded-md border border-danger/40">
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-danger-bg/30 px-3 py-2">
                <AlertTriangle className="size-4 text-danger" aria-hidden />
                <h3 id="brief-mandatory-title" className="text-[13px] font-semibold">Must be seen today</h3>
                <span className="text-[12px] text-ink-3">{brief.mandatory.length} item{brief.mandatory.length === 1 ? "" : "s"} · stays visible whatever you dismiss</span>
              </div>
              <ol className="divide-y divide-line">{brief.mandatory.map((item) => row(item, "brief-mandatory-item"))}</ol>
            </section>
          ) : null}

          {brief.totals.items === 0 ? (
            <div className="px-5 py-8 text-center" data-testid="brief-empty">
              <CheckCircle2 className="mx-auto size-5 text-success" aria-hidden />
              <p className="mt-3 text-[13px] font-semibold">Nothing unresolved in this scope</p>
              <p className="mx-auto mt-1 max-w-[46ch] text-[12.5px] leading-relaxed text-ink-3">{brief.coverage === "complete" ? "Every source was read and holds nothing open." : "The sources that could be read hold nothing open; see the coverage note below."}</p>
            </div>
          ) : mode === "queue" ? (
            <section aria-label="Complete queue" data-testid="brief-queue">
              <p className="mb-2 text-[12px] text-ink-3">{brief.totals.items} items in order of priority, then time · {brief.totals.mandatory} mandatory · {brief.totals.overdue} overdue · {brief.totals.stale} waiting {7}+ days{brief.truncated ? " · the queue was cut at its limit" : ""}</p>
              <ol className="divide-y divide-line rounded-md border border-line">{brief.queue.map((item) => row(item, "brief-queue-item"))}</ol>
            </section>
          ) : (
            <div className="space-y-3">
              {openSections.map((section) => {
                const open = expanded[section.key] ?? false;
                const shownItems = open ? section.items : section.items.slice(0, SECTION_PREVIEW);
                return (
                  <section key={section.key} id={`brief-section-${section.key}`} aria-labelledby={`brief-section-${section.key}-title`} data-testid={`brief-section-${section.key}`} className="rounded-md border border-line">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-3 py-2">
                      <div className="min-w-0">
                        <h3 id={`brief-section-${section.key}-title`} className="flex items-center gap-2 text-[13px] font-semibold">
                          {section.label}
                          <Badge variant="outline">{section.kind === "commercial" ? "commercial" : "operational"}</Badge>
                          <span className="text-[12px] font-normal text-ink-3">{section.totalItems} item{section.totalItems === 1 ? "" : "s"}</span>
                        </h3>
                        <div className="mt-1"><Figures figures={section.figures} testId={`brief-figures-${section.key}`} /></div>
                      </div>
                      {section.href ? <Link href={section.href} className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">Open queue <ArrowRight className="size-3" /></Link> : null}
                    </div>
                    <ol className="divide-y divide-line">{shownItems.map((item) => row(item, "brief-section-item"))}</ol>
                    {section.items.length > SECTION_PREVIEW ? (
                      <div className="border-t border-line bg-sunken/25 px-3 py-1.5 text-center">
                        <Button type="button" variant="ghost" size="xs" aria-expanded={open} onClick={() => setExpanded((current) => ({ ...current, [section.key]: !open }))} data-testid={`brief-section-toggle-${section.key}`}>
                          {open ? "Show fewer" : `Show all ${section.items.length}`} <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
                        </Button>
                      </div>
                    ) : null}
                  </section>
                );
              })}
              {emptySections.length ? <p className="text-[12px] text-ink-3" data-testid="brief-empty-sections">Nothing open: {emptySections.map((section) => section.label).join(", ")}.</p> : null}
            </div>
          )}

          {brief.related.length ? (
            <section className="space-y-2 border-t border-line pt-3" aria-label="Similar wording" data-testid="brief-related-pairs">
              <p className="text-[12px] text-ink-3">Similar wording across operational items. Review the records together before deciding whether they concern the same matter; both items stay listed with their own owners and actions.</p>
              {brief.related.map((pair) => {
                const first = brief.queue.find((item) => item.id === pair.firstId);
                const second = brief.queue.find((item) => item.id === pair.secondId);
                if (!first || !second) return null;
                return (
                  <div key={briefPairKey(pair.firstId, pair.secondId)} className="rounded-md border border-dashed border-line-2 p-2" data-testid="brief-related-pair">
                    <p className="text-[12.5px] text-ink-2">“{first.title}” and “{second.title}” <span className="text-ink-3">· shared words: {briefSharedWords(first, second).join(", ") || "none"}</span></p>
                    <p className="mt-1 text-[12px] text-ink-3">Review both records before acting; each item keeps its owner and action.</p>
                  </div>
                );
              })}
            </section>
          ) : null}

          <div className="border-t border-line pt-3">
            <button type="button" className="flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink" aria-expanded={sourcesOpen} onClick={() => setSourcesOpen((current) => !current)} data-testid="brief-sources-toggle">
              Sources and coverage <ChevronDown className={cn("size-3.5 transition-transform", sourcesOpen && "rotate-180")} />
            </button>
            {sourcesOpen ? (
              <ul className="mt-2 space-y-1" data-testid="brief-sources">
                {brief.sources.map((source) => (
                  <li key={source.key} className="flex flex-wrap items-center gap-2 text-[12px] text-ink-2" data-testid={`brief-source-${source.key}`} data-status={source.status}>
                    <Badge variant={SOURCE_STATUS[source.status].tone} dot>{SOURCE_STATUS[source.status].label}</Badge>
                    <span className="min-w-0">{source.label}</span>
                    <span className="text-ink-3">· read {formatTime(source.asOf)}{source.itemCount ? ` · ${source.itemCount} item${source.itemCount === 1 ? "" : "s"}` : ""}</span>
                    {source.message ? <span className="basis-full text-ink-3">{source.message}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      )}
      {completion.dialog}
    </section>
  );
}
