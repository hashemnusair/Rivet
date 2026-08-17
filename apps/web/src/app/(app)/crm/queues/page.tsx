"use client";

import { PhoneCall, RefreshCw, RotateCcw, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { qk } from "@/lib/api/keys";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import type { RenewalQueueItem } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { addDays, formatDate, todayISODate } from "@/lib/utils/dates";
import { DaysUntilText, MoneyText, RelativeText } from "@/components/shared/data-display";
import { PageHeader } from "@/components/shared/chrome";
import { MembershipStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Monogram, Skeleton } from "@/components/ui/misc";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { LogContactForm } from "@/features/crm/contact-work-panel";
import { useT } from "@/lib/i18n/provider";

type RenewalBucket = "expiring" | "expired";

const BUCKETS: Array<{ value: RenewalBucket; label: string; hint: string }> = [
  { value: "expiring", label: "Expiring", hint: "Memberships ending soon." },
  { value: "expired", label: "Expired", hint: "Memberships that ended recently." },
];

export default function QueuesPage() {
  const t = useT();
  const { session } = useApp();
  const [bucket, setBucket] = useState<RenewalBucket>("expiring");
  const [days, setDays] = useState("14");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const panelRef = useRef<HTMLElement | null>(null);
  const today = todayISODate();
  const oldestDate = addDays(today, -365);
  const latestDate = bucket === "expired" ? today : addDays(today, 365);

  const query = useMemo(() => ({
    bucket,
    branchId: session?.activeBranchId,
    days: Number.isInteger(Number(days)) && Number(days) > 0 ? Math.min(Number(days), 365) : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    pageSize: 100,
  }), [bucket, days, fromDate, session?.activeBranchId, toDate]);
  const renewals = useRealtimeApiQuery({
    queryKey: qk.renewalQueue(query),
    query: (api) => api.listRenewalQueue(query),
    subscribe: (api, onValue, onError) => api.subscribeRenewalQueue(query, onValue, onError),
  });
  const items = renewals.data?.items ?? [];
  const selectedItem = items.find((item) => item.membership.id === selectedId);

  useEffect(() => {
    if (selectedItem && window.innerWidth < 1280) panelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [selectedItem]);

  const reset = () => {
    setDays(bucket === "expiring" ? "14" : "45");
    setFromDate("");
    setToDate("");
    setSelectedId(undefined);
  };

  const changeBucket = (next: RenewalBucket) => {
    setBucket(next);
    setDays(next === "expiring" ? "14" : "45");
    setFromDate("");
    setToDate("");
    setSelectedId(undefined);
  };

  return <div className="space-y-4">
    <PageHeader eyebrow={t("crm.eyebrow")} title={t("crm.queues.title")} description={t("crm.queues.description")} />

    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="panel h-fit self-start lg:sticky lg:top-4" aria-label={t("crm.queues.filtersLabel")} data-testid="follow-up-filters">
        <header className="border-b border-line px-4 py-3">
          <p className="eyebrow">{t("crm.queues.filterWork")}</p>
          <h2 className="mt-1 text-[15px] font-semibold">{t("crm.queues.membershipsToReview")}</h2>
        </header>
        <div className="space-y-4 p-4">
          <div>
            <p className="text-[11px] font-medium text-ink-2">{t("crm.queues.status")}</p>
            <div className="mt-2 grid gap-1 rounded-md border border-line-2 bg-surface p-1" role="group" aria-label={t("crm.queues.statusLabel")}>
              {BUCKETS.map((option) => <button key={option.value} type="button" aria-pressed={bucket === option.value} onClick={() => changeBucket(option.value)} className={cn("rounded-sm px-3 py-2.5 text-start text-[12.5px] font-medium transition-colors", bucket === option.value ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken")}>{option.label}</button>)}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">{BUCKETS.find((option) => option.value === bucket)?.hint}</p>
          </div>

          <div className="border-t border-line pt-4">
            <p className="text-[11px] font-medium text-ink-2">{t("crm.queues.window")}</p>
            <div className="mt-2 space-y-3">
              <label htmlFor="follow-up-days" className="grid gap-1.5 text-[11px] font-medium text-ink-2">
                Days
                <Input id="follow-up-days" type="number" min={1} max={365} value={days} onChange={(event) => { setDays(event.target.value); setFromDate(""); setToDate(""); }} aria-label={t("crm.queues.daysLabel")} />
              </label>
              <p className="text-[10.5px] text-ink-4">{t("crm.queues.useExactRange")}</p>
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <p className="text-[11px] font-medium text-ink-2">{t("crm.queues.exactRange")}</p>
            <div className="mt-2 space-y-3">
              <label htmlFor="follow-up-from-date" className="grid gap-1.5 text-[11px] font-medium text-ink-2">
                From date
                <Input id="follow-up-from-date" type="date" min={oldestDate} max={toDate || latestDate} value={fromDate} onChange={(event) => { setFromDate(event.target.value); setDays(""); }} aria-label={t("crm.queues.fromLabel")} />
              </label>
              <label htmlFor="follow-up-to-date" className="grid gap-1.5 text-[11px] font-medium text-ink-2">
                To date
                <Input id="follow-up-to-date" type="date" min={fromDate || oldestDate} max={latestDate} value={toDate} onChange={(event) => { setToDate(event.target.value); setDays(""); }} aria-label={t("crm.queues.toLabel")} />
              </label>
            </div>
          </div>

          <Button type="button" variant="secondary" onClick={reset} className="w-full"><RotateCcw /> {t("crm.queues.resetFilters")}</Button>
        </div>
        <footer className="border-t border-line px-4 py-3 text-[10.5px] leading-relaxed text-ink-3">{t("crm.queues.rangeNote")}</footer>
      </aside>

      <div className={cn("grid gap-4", selectedItem && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <section className="panel min-h-[420px] overflow-hidden self-start" aria-labelledby="follow-up-results-title" data-testid="follow-up-results">
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="eyebrow">{t("crm.queues.renewalQueue")}</p>
              <h2 id="follow-up-results-title" className="mt-1 text-[15px] font-semibold">{t("crm.queues.foundMatches")}</h2>
              <p className="mt-0.5 text-[12px] text-ink-3">{BUCKETS.find((option) => option.value === bucket)?.label} memberships · {fromDate || toDate ? `${fromDate || oldestDate} → ${toDate || today}` : `${days || "—"} day window`}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-[11px] text-ink-3 tabular">{renewals.data?.totalItems ?? 0}</span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => { void renewals.refetch(); }} aria-label={t("crm.queues.refreshLabel")} title={t("crm.queues.refresh")}><RefreshCw className="size-3.5" /></Button>
            </div>
          </header>
          {renewals.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</div> : renewals.isError ? <ErrorState className="m-4" title={t("crm.queues.loadFailed")} onRetry={() => { void renewals.refetch(); }} /> : items.length === 0 ? <EmptyQueue text={bucket === "expiring" ? "No memberships match this expiring filter." : "No memberships match this expired filter."} description={t("crm.queues.loadFailedDetail")} onReset={reset} /> : <ul className="divide-y divide-line">{items.map((item) => <RenewalRow key={item.membership.id} item={item} selected={selectedItem?.membership.id === item.membership.id} onClick={() => setSelectedId(item.membership.id)} />)}</ul>}
        </section>

        {selectedItem ? <aside ref={panelRef} className="panel self-start overflow-hidden animate-fade-in scroll-mt-16" data-testid="follow-up-panel">
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3"><div className="min-w-0"><p className="eyebrow">{bucket === "expiring" ? "Expiring membership" : "Expired membership"}</p><h3 className="truncate font-display text-[16px] font-semibold">{selectedItem.member.fullName}</h3><p className="font-mono text-[11.5px] text-ink-3" dir="ltr">{selectedItem.member.phone}</p></div><button type="button" onClick={() => setSelectedId(undefined)} aria-label={t("crm.queues.closePanel")} className="rounded-sm p-1 text-ink-3 hover:bg-sunken hover:text-ink"><X className="size-4" /></button></header>
        <div className="space-y-4 px-4 py-3.5"><RenewalContext item={selectedItem} /><div className="border-t border-line pt-3.5"><p className="eyebrow mb-2.5">{t("crm.queues.logContact")}</p><LogContactForm subject="member" memberId={selectedItem.member.id} compact onLogged={() => setSelectedId(undefined)} /></div><div className="border-t border-line pt-3"><Button asChild variant="secondary" size="sm" className="w-full"><Link href={`/members/${selectedItem.member.id}`}>{t("crm.queues.openMemberRecord")}</Link></Button></div></div>
        </aside> : null}
      </div>
    </div>
  </div>;
}

function RenewalRow({ item, selected, onClick }: { item: RenewalQueueItem; selected: boolean; onClick: () => void }) {
  return <li><button type="button" aria-pressed={selected} onClick={onClick} className={cn("flex w-full items-center gap-3 px-4 py-3 text-start transition-colors", selected ? "bg-sunken/70" : "hover:bg-sunken/40")}><Monogram name={item.member.fullName} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{item.member.fullName}</span><span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3"><MembershipStatusChip status={item.membership.status} />{item.membership.planName} · ends {formatDate(item.membership.endDate)}</span></span><span className="shrink-0 text-end"><span className="block text-[12px]"><DaysUntilText date={item.membership.endDate} /></span><span className="block text-[11px] text-ink-3">{item.lastContactAt ? <>called <RelativeText iso={item.lastContactAt} /></> : <span className="font-medium text-warning-deep">not contacted</span>}</span></span><PhoneCall className="size-3.5 shrink-0 text-ink-4" aria-hidden /></button></li>;
}

function EmptyQueue({ text, description, onReset }: { text: string; description: string; onReset: () => void }) {
  const t = useT();
  return <EmptyState title={text} description={description} compact className="m-4" icon={UserPlus} action={<Button type="button" variant="secondary" size="sm" onClick={onReset}>{t("crm.queues.resetFilters")}</Button>} />;
}

function RenewalContext({ item }: { item: RenewalQueueItem }) {
  const t = useT();
  return <dl className="space-y-1.5 text-[12.5px]"><ContextRow label={t("crm.queues.plan")}>{item.membership.planName}</ContextRow><ContextRow label={t("crm.queues.ends")}><span className="tabular">{item.membership.endDate}</span> <DaysUntilText date={item.membership.endDate} /></ContextRow>{item.membership.outstanding.amount > 0 ? <ContextRow label={t("crm.queues.balance")}><MoneyText money={item.membership.outstanding} className="text-warning-deep" /></ContextRow> : null}{item.lastContactAt ? <ContextRow label={t("crm.queues.lastContact")}><RelativeText iso={item.lastContactAt} /> {item.lastContactOutcome ? `· ${item.lastContactOutcome.replace(/_/g, " ")}` : ""}</ContextRow> : <ContextRow label={t("crm.queues.lastContact")}><span className="font-medium text-warning-deep">never contacted</span></ContextRow>}</dl>;
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) { return <div className="flex items-center justify-between gap-3"><dt className="text-ink-3">{label}</dt><dd className="text-end">{children}</dd></div>; }
