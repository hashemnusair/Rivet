"use client";

import { PhoneCall, RotateCcw, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
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
import { EmptyState } from "@/components/ui/states";
import { LogContactForm } from "@/features/crm/contact-work-panel";

type RenewalBucket = "expiring" | "expired";

const BUCKETS: Array<{ value: RenewalBucket; label: string; hint: string }> = [
  { value: "expiring", label: "Expiring", hint: "Memberships ending soon." },
  { value: "expired", label: "Expired", hint: "Memberships that ended recently." },
];

export default function QueuesPage() {
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
  const renewals = useApiQuery(qk.renewalQueue(query), (api) => api.listRenewalQueue(query));
  const items = renewals.data?.items ?? [];
  const selectedItem = items.find((item) => item.membership.id === selectedId);

  useEffect(() => {
    if (selectedItem && window.innerWidth < 1280) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    <PageHeader eyebrow="Growth" title="Follow-ups" description="Filter expiring and expired memberships by a number of days or an exact date range." />

    <section className="panel p-4" aria-label="Follow-up filters">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-[220px] flex-1">
          <p className="eyebrow">Memberships to review</p>
          <div className="mt-2 flex rounded-md border border-line-2 bg-surface p-1" role="group" aria-label="Follow-up membership status">
            {BUCKETS.map((option) => <button key={option.value} type="button" aria-pressed={bucket === option.value} onClick={() => changeBucket(option.value)} className={cn("flex-1 rounded-sm px-3 py-2 text-start text-[12.5px] font-medium", bucket === option.value ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken")}>{option.label}</button>)}
          </div>
          <p className="mt-1.5 text-[11.5px] text-ink-3">{BUCKETS.find((option) => option.value === bucket)?.hint}</p>
        </div>
        <label className="grid min-w-32 gap-1.5 text-[11px] font-medium text-ink-2">Days
          <Input type="number" min={1} max={365} value={days} onChange={(event) => { setDays(event.target.value); setFromDate(""); setToDate(""); }} aria-label="Follow-up days" />
        </label>
        <label className="grid min-w-36 gap-1.5 text-[11px] font-medium text-ink-2">From date
          <Input type="date" min={oldestDate} max={toDate || latestDate} value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Follow-up from date" />
        </label>
        <label className="grid min-w-36 gap-1.5 text-[11px] font-medium text-ink-2">To date
          <Input type="date" min={fromDate || oldestDate} max={latestDate} value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="Follow-up to date" />
        </label>
        <Button type="button" variant="secondary" onClick={reset}><RotateCcw /> Reset</Button>
      </div>
      <p className="mt-3 text-[11px] text-ink-3">Date ranges can go back one year. Leave the dates blank to use the day window.</p>
    </section>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="panel min-h-[420px] overflow-hidden self-start">
        <header className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3"><div><h2 className="text-[13px] font-semibold">{BUCKETS.find((option) => option.value === bucket)?.label} memberships</h2><p className="text-[12px] text-ink-3">{fromDate || toDate ? `${fromDate || oldestDate} → ${toDate || today}` : `${days || "—"} day window`}</p></div><span className="font-mono text-[11px] text-ink-3">{renewals.data?.totalItems ?? 0}</span></header>
        {renewals.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</div> : renewals.isError ? <p className="p-5 text-[12px] text-danger">Follow-up data could not be loaded. Try again.</p> : items.length === 0 ? <EmptyQueue text={bucket === "expiring" ? "No memberships match this expiring filter." : "No memberships match this expired filter."} /> : <ul className="divide-y divide-line">{items.map((item) => <RenewalRow key={item.membership.id} item={item} selected={selectedItem?.membership.id === item.membership.id} onClick={() => setSelectedId(item.membership.id)} />)}</ul>}
      </section>

      {selectedItem ? <aside ref={panelRef} className="panel self-start overflow-hidden animate-fade-in scroll-mt-16" data-testid="follow-up-panel">
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3"><div className="min-w-0"><p className="eyebrow">{bucket === "expiring" ? "Expiring membership" : "Expired membership"}</p><h3 className="truncate font-display text-[16px] font-semibold">{selectedItem.member.fullName}</h3><p className="font-mono text-[11.5px] text-ink-3" dir="ltr">{selectedItem.member.phone}</p></div><button type="button" onClick={() => setSelectedId(undefined)} aria-label="Close follow-up panel" className="rounded-sm p-1 text-ink-3 hover:bg-sunken hover:text-ink"><X className="size-4" /></button></header>
        <div className="space-y-4 px-4 py-3.5"><RenewalContext item={selectedItem} /><div className="border-t border-line pt-3.5"><p className="eyebrow mb-2.5">Log contact</p><LogContactForm subject="member" memberId={selectedItem.member.id} compact onLogged={() => setSelectedId(undefined)} /></div><div className="border-t border-line pt-3"><Button asChild variant="secondary" size="sm" className="w-full"><Link href={`/members/${selectedItem.member.id}`}>Open member record</Link></Button></div></div>
      </aside> : null}
    </div>
  </div>;
}

function RenewalRow({ item, selected, onClick }: { item: RenewalQueueItem; selected: boolean; onClick: () => void }) {
  return <li><button type="button" onClick={onClick} className={cn("flex w-full items-center gap-3 px-4 py-3 text-start transition-colors", selected ? "bg-sunken/70" : "hover:bg-sunken/40")}><Monogram name={item.member.fullName} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{item.member.fullName}</span><span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3"><MembershipStatusChip status={item.membership.status} />{item.membership.planName} · ends {formatDate(item.membership.endDate)}</span></span><span className="shrink-0 text-end"><span className="block text-[12px]"><DaysUntilText date={item.membership.endDate} /></span><span className="block text-[11px] text-ink-3">{item.lastContactAt ? <>called <RelativeText iso={item.lastContactAt} /></> : <span className="font-medium text-warning-deep">not contacted</span>}</span></span><PhoneCall className="size-3.5 shrink-0 text-ink-4" aria-hidden /></button></li>;
}

function EmptyQueue({ text }: { text: string }) { return <EmptyState title={text} compact className="m-4" icon={UserPlus} />; }

function RenewalContext({ item }: { item: RenewalQueueItem }) {
  return <dl className="space-y-1.5 text-[12.5px]"><ContextRow label="Plan">{item.membership.planName}</ContextRow><ContextRow label="Ends"><span className="tabular">{item.membership.endDate}</span> <DaysUntilText date={item.membership.endDate} /></ContextRow>{item.membership.outstanding.amount > 0 ? <ContextRow label="Balance"><MoneyText money={item.membership.outstanding} className="text-warning-deep" /></ContextRow> : null}{item.lastContactAt ? <ContextRow label="Last contact"><RelativeText iso={item.lastContactAt} /> {item.lastContactOutcome ? `· ${item.lastContactOutcome.replace(/_/g, " ")}` : ""}</ContextRow> : <ContextRow label="Last contact"><span className="font-medium text-warning-deep">never contacted</span></ContextRow>}</dl>;
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) { return <div className="flex items-center justify-between gap-3"><dt className="text-ink-3">{label}</dt><dd className="text-end">{children}</dd></div>; }
