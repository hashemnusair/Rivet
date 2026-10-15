"use client";

import { CalendarClock, ListPlus, Plus, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/chrome";
import { FilterPills, PlatformPage, PlatformPanel, StaleNotice } from "@/components/platform/platform-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { QueryErrorState, StatePanel } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/provider";
import { PROSPECT_BATCHES, followUpState, prospectStageGroup, type PlatformProspect, type PlatformProspectsView } from "@/lib/platform/prospects";
import { todayISODate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { BATCH_KEYS, FILTERS, STAGE_COPY, type ProspectFilter } from "./prospect-copy";
import { ProspectDetail } from "./prospect-detail";
import { ProspectFormDialog } from "./prospect-form-dialog";
import { replaceQueryInPlace } from "@/lib/routing/replace-query";

const PLATFORM_TIMEZONE = "Asia/Amman";

function parseFilter(value: string | null): ProspectFilter {
  return FILTERS.some((item) => item.value === value) ? (value as ProspectFilter) : "all";
}

/** Due means a follow-up date of today or earlier on a conversation that is still open. */
export function isFollowUpDue(prospect: PlatformProspect, today: string): boolean {
  const state = followUpState(prospect.followUpOn, today);
  return (state === "overdue" || state === "today") && prospectStageGroup(prospect.stage) !== "closed" && prospect.stage !== "paid";
}

function matchesFilter(prospect: PlatformProspect, filter: ProspectFilter, today: string): boolean {
  if (filter === "all") return true;
  if (filter === "due") return isFollowUpDue(prospect, today);
  return prospectStageGroup(prospect.stage) === filter;
}

function matchesSearch(prospect: PlatformProspect, search: string): boolean {
  const text = search.trim().toLocaleLowerCase();
  if (!text) return true;
  if ([prospect.gymName, prospect.area, prospect.code, prospect.owner?.name ?? "", prospect.email].some((value) => value.toLocaleLowerCase().includes(text))) return true;
  // Phone numbers match however they are typed: 0790979998, 79 097 9998, +962…
  const digits = text.replace(/[^0-9]/g, "").replace(/^0+/, "");
  return digits.length >= 4 && [prospect.phone, prospect.whatsapp].some((number) => number.replace(/[^0-9]/g, "").includes(digits));
}

/**
 * Platform console → Prospects: the Amman pilot list that used to live in a
 * three-tab spreadsheet. One list grouped the way the sheet was (Selected,
 * Reserve, Hold), one gym open at a time with everything needed to contact
 * it, and the stage, owner and follow-up changed in place.
 */
export function PlatformProspects() {
  const t = useT();
  const f = useFormat(PLATFORM_TIMEZONE);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const query = useApiQuery(qk.platformProspects, (api) => api.listPlatformProspects());
  const today = todayISODate(PLATFORM_TIMEZONE);

  const filter = parseFilter(searchParams.get("show"));
  const requestedId = searchParams.get("gym") ?? undefined;
  const setParams = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const next = params.toString();
    replaceQueryInPlace(router, next ? `${pathname}?${next}` : pathname);
  };

  const importList = useApiMutation((api) => api.importAmmanPilotProspects(), {
    onSuccess: async (result) => {
      toast.success(result.added ? t("platformConsole.prospects.imported", { count: result.added }) : t("platformConsole.prospects.importNothing"));
      await queryClient.invalidateQueries({ queryKey: qk.platformProspects });
    },
  });

  const view = query.data;
  const prospects = useMemo(() => view?.prospects ?? [], [view]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((item) => [item.value, prospects.filter((prospect) => matchesFilter(prospect, item.value, today)).length])) as Record<ProspectFilter, number>, [prospects, today]);
  const visible = useMemo(() => prospects.filter((prospect) => matchesFilter(prospect, filter, today) && matchesSearch(prospect, search)), [filter, prospects, search, today]);
  const groups = PROSPECT_BATCHES.map((batch) => ({ batch, rows: visible.filter((prospect) => prospect.batch === batch) })).filter((group) => group.rows.length > 0);
  // The open gym stays open while the search or filter hides it from the
  // list; on wide screens the first gym opens when none is chosen.
  const selected = prospects.find((prospect) => prospect.id === requestedId) ?? visible[0];

  // On a phone the list gives way to the gym, so bring the gym's top into view.
  const openProspect = (id: string) => {
    setParams({ gym: id });
    if (!window.matchMedia("(min-width: 1024px)").matches) window.requestAnimationFrame(() => panelRef.current?.scrollIntoView({ block: "start" }));
  };

  const onCreated = (created: PlatformProspect) => {
    queryClient.setQueryData<PlatformProspectsView>(qk.platformProspects, (current) => current ? { ...current, prospects: [...current.prospects, created] } : current);
    setParams({ gym: created.id, show: undefined });
    setSearch("");
  };

  if (query.isLoading) {
    return <PlatformPage><div className="space-y-3" role="status" aria-label={t("platformConsole.prospects.loading")}><Skeleton className="h-8 w-56" /><Skeleton className="h-[480px] w-full" /></div></PlatformPage>;
  }
  if (query.isError || !view) return <PlatformPage><QueryErrorState error={query.error} onRetry={() => void query.refetch()} /></PlatformPage>;

  return (
    <PlatformPage className="space-y-5" data-testid="platform-prospects">
      <PageHeader
        title={t("platformConsole.prospects.title")}
        description={t("platformConsole.prospects.description")}
        actions={prospects.length ? <Button variant="secondary" onClick={() => setAdding(true)}><Plus />{t("platformConsole.prospects.addGym")}</Button> : null}
      />

      {query.isBackgroundError ? <StaleNotice onRetry={() => void query.refetch()} retrying={query.isFetching}>{query.error?.message}</StaleNotice> : null}

      {prospects.length === 0 ? (
        <StatePanel
          layout="page"
          icon={ListPlus}
          title={t("platformConsole.prospects.emptyTitle")}
          description={t("platformConsole.prospects.emptyDescription")}
          action={<div className="flex flex-wrap justify-center gap-2"><Button onClick={() => importList.mutate()} loading={importList.isPending}><ListPlus />{t("platformConsole.prospects.importAmman")}</Button><Button variant="secondary" onClick={() => setAdding(true)} disabled={importList.isPending}><Plus />{t("platformConsole.prospects.addGym")}</Button></div>}
        />
      ) : (
        <div ref={panelRef} className="scroll-mt-20">
        <PlatformPanel className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
            <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input className="ps-9" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("platformConsole.prospects.searchPlaceholder")} aria-label={t("platformConsole.prospects.searchLabel")} />
            </label>
            <FilterPills
              label={t("platformConsole.prospects.filterLabel")}
              value={filter}
              items={FILTERS.filter((item) => item.value !== "due" || counts.due > 0 || filter === "due").map((item) => ({ value: item.value, label: t(item.labelKey), count: counts[item.value] }))}
              onChange={(next) => setParams({ show: next === "all" ? undefined : next })}
            />
          </div>

          <div className="grid lg:min-h-[640px] lg:grid-cols-[minmax(300px,360px)_1fr]">
            <nav aria-label={t("platformConsole.prospects.listLabel")} className={cn("border-line lg:border-e", requestedId ? "hidden lg:block" : "block")}>
              {groups.length === 0 ? (
                <div className="p-4"><StatePanel layout="section" icon={Search} title={t("platformConsole.prospects.noMatchTitle")} description={t("platformConsole.prospects.noMatchDescription")} /></div>
              ) : groups.map((group) => (
                <section key={group.batch} aria-labelledby={`prospect-batch-${group.batch}`}>
                  <h2 id={`prospect-batch-${group.batch}`} className="border-b border-line bg-paper/70 px-4 py-2 text-[12px] font-semibold text-ink-2">
                    {t("platformConsole.prospects.batchCount", { batch: t(BATCH_KEYS[group.batch]), count: f.number(group.rows.length) })}
                  </h2>
                  <ul className="divide-y divide-line">
                    {group.rows.map((prospect) => (
                      <li key={prospect.id}>
                        <ProspectRow prospect={prospect} today={today} selected={selected?.id === prospect.id} onSelect={() => openProspect(prospect.id)} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>

            <div className={cn("min-w-0", requestedId ? "block" : "hidden lg:block")}>
              {selected ? <ProspectDetail key={selected.id} prospect={selected} owners={view.owners} today={today} onBack={() => setParams({ gym: undefined })} /> : null}
            </div>
          </div>
        </PlatformPanel>
        </div>
      )}

      <ProspectFormDialog open={adding} onOpenChange={setAdding} onSaved={onCreated} />
    </PlatformPage>
  );
}

function ProspectRow({ prospect, today, selected, onSelect }: { prospect: PlatformProspect; today: string; selected: boolean; onSelect: () => void }) {
  const t = useT();
  const f = useFormat(PLATFORM_TIMEZONE);
  const stage = STAGE_COPY[prospect.stage];
  const due = followUpState(prospect.followUpOn, today);
  const open = prospectStageGroup(prospect.stage) !== "closed" && prospect.stage !== "paid";
  const followUp = prospect.followUpOn && open
    ? due === "overdue" ? t("platformConsole.prospects.row.followUpOverdue", { date: f.date(prospect.followUpOn) })
      : due === "today" ? t("platformConsole.prospects.row.followUpToday")
        : t("platformConsole.prospects.row.followUpOn", { date: f.date(prospect.followUpOn) })
    : undefined;
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      data-testid="prospect-row"
      className={cn("block w-full px-4 py-3 text-start transition-colors hover:bg-sunken/60 focus-visible:relative", selected && "bg-sunken")}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span dir="auto" className="block truncate text-[13.5px] font-semibold text-ink">{prospect.gymName}</span>
          <span dir="auto" className="mt-0.5 block truncate text-[12.5px] text-ink-3">{[prospect.area, prospect.owner?.name].filter(Boolean).join(" · ")}</span>
        </span>
        <Badge variant={stage.tone} className="shrink-0">{t(stage.labelKey)}</Badge>
      </span>
      {followUp ? (
        <span className={cn("mt-1.5 flex items-center gap-1.5 text-[12.5px]", due === "overdue" ? "font-medium text-danger" : due === "today" ? "font-medium text-warning-deep" : "text-ink-2")}>
          <CalendarClock className="size-3.5 shrink-0" aria-hidden />{followUp}
        </span>
      ) : prospect.nextAction ? (
        <span dir="auto" className="mt-1.5 block truncate text-[12.5px] text-ink-2">{prospect.nextAction}</span>
      ) : null}
    </button>
  );
}
