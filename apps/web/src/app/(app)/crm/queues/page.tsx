"use client";

import { Activity, CalendarClock, PhoneCall, RefreshCw, RotateCcw, Search, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import type { AtRiskMemberItem, RenewalQueueItem, RetentionRiskKind } from "@/lib/domain/types";
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
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogContactDialog } from "@/features/crm/contact-work-panel";
import { WhatsAppHandoff } from "@/features/crm/whatsapp-handoff";
import { WorkspaceModuleBoundary } from "@/components/shell/workspace-module-boundary";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";

type RenewalBucket = "expiring" | "expired";

const BUCKETS: Array<{ value: RenewalBucket; label: string; hint: string }> = [
  { value: "expiring", label: "Expiring", hint: "Memberships ending soon." },
  { value: "expired", label: "Expired", hint: "Memberships that ended recently." },
];

export default function QueuesPage() {
  return <WorkspaceModuleBoundary moduleKey="revenue"><RetentionWorkspace /></WorkspaceModuleBoundary>;
}

function RetentionWorkspace() {
  const [view, setView] = useState<"at-risk" | "renewals">("at-risk");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "renewals") setView("renewals");
  }, []);
  return <div className="space-y-4">
    <PageHeader title="Retention" description="See who needs attention, understand why, and take the next action without digging through reports." />
    <div className="inline-flex rounded-md border border-line-2 bg-surface p-1" role="group" aria-label="Retention workspace">
      <button type="button" aria-pressed={view === "at-risk"} onClick={() => setView("at-risk")} className={cn("flex min-h-10 items-center gap-2 rounded-sm px-3.5 text-[12.5px] font-medium transition-colors", view === "at-risk" ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken")}><Activity className="size-3.5" /> At risk</button>
      <button type="button" aria-pressed={view === "renewals"} onClick={() => setView("renewals")} className={cn("flex min-h-10 items-center gap-2 rounded-sm px-3.5 text-[12.5px] font-medium transition-colors", view === "renewals" ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken")}><CalendarClock className="size-3.5" /> Renewals</button>
    </div>
    {view === "at-risk" ? <AtRiskQueuePage /> : <RenewalQueuePage />}
  </div>;
}

const RISK_FILTERS: Array<{ value: RetentionRiskKind | "all"; label: string; hint: string }> = [
  { value: "all", label: "All attention", hint: "The most urgent inactive, expiring, and expired members." },
  { value: "inactive", label: "Not visiting", hint: "Active members who have stopped checking in." },
  { value: "expiring", label: "Expiring", hint: "Active memberships inside the gym's renewal window." },
  { value: "expired", label: "Win back", hint: "Recently expired members with no newer term." },
];

function AtRiskQueuePage() {
  const { session } = useApp();
  const [reason, setReason] = useState<RetentionRiskKind | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const panelRef = useRef<HTMLElement | null>(null);
  const query = useMemo(() => ({ branchId: session?.activeBranchId, reason, search: search.trim() || undefined, pageSize: 100 }), [reason, search, session?.activeBranchId]);
  const risks = useRealtimeApiQuery({
    queryKey: qk.atRisk(query),
    query: (api) => api.listAtRiskMembers(query),
    subscribe: (api, onValue, onError) => api.subscribeAtRiskMembers(query, onValue, onError),
  });
  const items = risks.data?.items ?? [];
  const selectedItem = items.find((item) => item.member.id === selectedId);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("member");
    if (requested) setSelectedId(requested);
  }, []);
  useEffect(() => {
    if (selectedItem && window.innerWidth < 1280) panelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [selectedItem]);

  return <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
    <aside className="panel h-fit self-start lg:sticky lg:top-4" aria-label="At-risk filters">
      <header className="border-b border-line px-4 py-3"><p className="context-label">Focus the queue</p><h2 className="mt-1 text-[15px] font-semibold">Who needs attention?</h2></header>
      <div className="space-y-4 p-4">
        <label htmlFor="risk-search" className="grid gap-1.5 text-[11px] font-medium text-ink-2">Find a member<div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" /><Input id="risk-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, phone or number" className="ps-9" /></div></label>
        <div className="border-t border-line pt-4">
          <p className="text-[11px] font-medium text-ink-2">Reason</p>
          <div className="mt-2 grid gap-1 rounded-md border border-line-2 bg-surface p-1" role="group" aria-label="At-risk reason">
            {RISK_FILTERS.map((option) => <button key={option.value} type="button" aria-pressed={reason === option.value} onClick={() => { setReason(option.value); setSelectedId(undefined); }} className={cn("rounded-sm px-3 py-2.5 text-start text-[12.5px] font-medium transition-colors", reason === option.value ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken")}>{option.label}</button>)}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">{RISK_FILTERS.find((option) => option.value === reason)?.hint}</p>
        </div>
        <div className="rounded-md border border-line bg-sunken px-3 py-2.5 text-[11px] leading-relaxed text-ink-3">Frozen memberships and newly joined members are excluded. Thresholds follow Settings → Rules & hours.</div>
      </div>
    </aside>

    <div className={cn("grid gap-4", selectedItem && "xl:grid-cols-[minmax(0,1fr)_360px]")}>
      <section className="panel min-h-[420px] overflow-hidden self-start" aria-labelledby="risk-results-title">
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">Retention radar</p><h2 id="risk-results-title" className="mt-1 text-[15px] font-semibold">Recommended follow-ups</h2><p className="mt-0.5 text-[12px] text-ink-3">Each member appears once, with every current reason shown.</p></div><div className="flex shrink-0 items-center gap-2"><span className="font-mono text-[11px] tabular text-ink-3">{risks.data?.totalItems ?? 0}</span><Button type="button" variant="ghost" size="icon-sm" onClick={() => void risks.refetch()} aria-label="Refresh at-risk members"><RefreshCw className="size-3.5" /></Button></div></header>
        {risks.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</div> : risks.isError ? <ErrorState className="m-4" title="At-risk members could not be loaded" onRetry={() => void risks.refetch()} /> : items.length === 0 ? <EmptyState title="Nobody matches this view" description="That is either good news or a sign that the filter is too narrow." compact className="m-4" icon={Activity} action={(search || reason !== "all") ? <Button type="button" variant="secondary" size="sm" onClick={() => { setSearch(""); setReason("all"); }}>Clear filters</Button> : undefined} /> : <ul className="divide-y divide-line">{items.map((item) => <AtRiskRow key={item.member.id} item={item} selected={selectedItem?.member.id === item.member.id} onClick={() => setSelectedId(item.member.id)} />)}</ul>}
      </section>
      {selectedItem ? <AtRiskPanel ref={panelRef} item={selectedItem} onClose={() => setSelectedId(undefined)} /> : null}
    </div>
  </div>;
}

function AtRiskRow({ item, selected, onClick }: { item: AtRiskMemberItem; selected: boolean; onClick: () => void }) {
  return <li><button type="button" aria-pressed={selected} onClick={onClick} className={cn("flex w-full items-center gap-3 px-4 py-3 text-start transition-colors", selected ? "bg-sunken/70" : "hover:bg-sunken/40")}><Monogram name={item.member.fullName} size="sm" /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="truncate text-[13px] font-medium">{item.member.fullName}</span><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", item.priority === "urgent" ? "bg-danger-soft text-danger" : item.priority === "high" ? "bg-warning-soft text-warning-deep" : "bg-sunken text-ink-3")}>{item.priority}</span></span><span className="mt-1 block truncate text-[12px] text-ink-3">{item.reasons.map((risk) => risk.label).join(" · ")}</span></span><span className="hidden shrink-0 text-end sm:block"><span className="block text-[12px] font-medium">{item.membership.planName}</span><span className="block text-[12px] text-ink-3">{item.lastContactAt ? <>contacted <RelativeText iso={item.lastContactAt} /></> : "not contacted"}</span></span><PhoneCall className="size-3.5 shrink-0 text-ink-4" /></button></li>;
}

function AtRiskPanel({ item, onClose, ref }: { item: AtRiskMemberItem; onClose: () => void; ref: React.Ref<HTMLElement> }) {
  const initialMessage = item.reasons.some((reason) => reason.kind === "expired")
    ? `Hi ${item.member.fullName.split(/\s+/)[0]}, we have missed seeing you at the gym. If you would like to return, reply here and we will help you find the right membership.`
    : item.reasons.some((reason) => reason.kind === "expiring")
      ? `Hi ${item.member.fullName.split(/\s+/)[0]}, your membership is ending soon. Reply here and we will make renewal easy for you.`
      : `Hi ${item.member.fullName.split(/\s+/)[0]}, we have not seen you at the gym lately. Is everything okay? Reply here if we can help.`;
  return <aside ref={ref} className="panel self-start overflow-hidden animate-fade-in scroll-mt-16"><header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3"><div className="min-w-0"><p className="context-label">Recommended follow-up</p><h3 className="truncate font-display text-[16px] font-semibold">{item.member.fullName}</h3><p className="font-mono text-[11.5px] text-ink-3" dir="ltr">{item.member.phone}</p></div><button type="button" onClick={onClose} aria-label="Close member panel" className="rounded-sm p-1 text-ink-3 hover:bg-sunken hover:text-ink"><X className="size-4" /></button></header><div className="space-y-4 px-4 py-3.5"><div className="space-y-2">{item.reasons.map((reason) => <div key={reason.kind} className="rounded-md border border-line bg-sunken px-3 py-2"><p className="text-[12.5px] font-medium">{reason.label}</p><p className="mt-0.5 text-[10.5px] capitalize text-ink-3">{reason.kind === "expired" ? "Win-back opportunity" : `${reason.kind} membership signal`}</p></div>)}</div><dl className="space-y-1.5 border-t border-line pt-3 text-[12px]"><ContextRow label="Plan">{item.membership.planName}</ContextRow><ContextRow label="Membership ends">{formatDate(item.membership.endDate)}</ContextRow>{item.lastVisitAt ? <ContextRow label="Last visit"><RelativeText iso={item.lastVisitAt} /></ContextRow> : <ContextRow label="Last visit">No recorded visit</ContextRow>}{item.membership.outstanding.amount > 0 ? <ContextRow label="Balance"><MoneyText money={item.membership.outstanding} className="text-warning-deep" /></ContextRow> : null}</dl><div className="border-t border-line pt-3"><p className="context-label">Take action</p><div className="mt-3 grid grid-cols-2 gap-2"><Button asChild variant="secondary" size="sm"><a href={`tel:${item.member.phone}`}><PhoneCall /> Call</a></Button><WhatsAppHandoff subject="member" subjectId={item.member.id} recipientName={item.member.fullName} phone={item.member.phone} initialMessage={initialMessage} onLogged={onClose} className="w-full" /><LogContactDialog subject="member" memberId={item.member.id} onLogged={onClose} /><SnoozeRiskDialog item={item} onSnoozed={onClose} /></div></div><Button asChild variant="secondary" size="sm" className="w-full"><Link href={`/members/${item.member.id}`}>Open member record</Link></Button></div></aside>;
}

function SnoozeRiskDialog({ item, onSnoozed }: { item: AtRiskMemberItem; onSnoozed: () => void }) {
  const { session } = useApp();
  const invalidate = useInvalidate();
  const today = todayISODate(session?.organization?.timezone);
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState(addDays(today, item.recommendedSnoozeDays));
  const [reason, setReason] = useState("");
  useEffect(() => {
    setUntil(addDays(today, item.recommendedSnoozeDays));
    setReason("");
  }, [item.member.id, item.recommendedSnoozeDays, today]);
  const snooze = useApiMutation((api) => api.snoozeAtRiskMember({ memberId: item.member.id, until, reason: reason.trim() || undefined }), { onSuccess: async () => { toast.success(`Follow-up snoozed until ${formatDate(until)}.`); setOpen(false); await invalidate(); onSnoozed(); }, onError: () => toast.error("Follow-up could not be snoozed.") });
  return <><Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}><CalendarClock /> Snooze</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Snooze this follow-up</DialogTitle><DialogDescription>{item.member.fullName} leaves the active queue until the selected date. The decision stays in the timeline and audit trail.</DialogDescription></DialogHeader><DialogBody className="space-y-3"><label htmlFor="risk-snooze-until" className="grid gap-1.5 text-[11px] font-medium text-ink-2">Return to queue<Input id="risk-snooze-until" type="date" min={addDays(today, 1)} max={addDays(today, 90)} value={until} onChange={(event) => setUntil(event.target.value)} /></label><label htmlFor="risk-snooze-reason" className="grid gap-1.5 text-[11px] font-medium text-ink-2">Note <span className="font-normal text-ink-4">Optional</span><Input id="risk-snooze-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Travelling, asked us to call next week…" /></label></DialogBody><DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" loading={snooze.isPending} disabled={!until} onClick={() => snooze.mutate()}>Snooze follow-up</Button></DialogFooter></DialogContent></Dialog></>;
}

function RenewalQueuePage() {
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

  return <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="panel h-fit self-start lg:sticky lg:top-4" aria-label="Follow-up filters" data-testid="follow-up-filters">
        <header className="border-b border-line px-4 py-3">
          <p className="context-label">Filter work</p>
          <h2 className="mt-1 text-[15px] font-semibold">Memberships to review</h2>
        </header>
        <div className="space-y-4 p-4">
          <div>
            <p className="text-[11px] font-medium text-ink-2">Status</p>
            <div className="mt-2 grid gap-1 rounded-md border border-line-2 bg-surface p-1" role="group" aria-label="Follow-up membership status">
              {BUCKETS.map((option) => <button key={option.value} type="button" aria-pressed={bucket === option.value} onClick={() => changeBucket(option.value)} className={cn("rounded-sm px-3 py-2.5 text-start text-[12.5px] font-medium transition-colors", bucket === option.value ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken")}>{option.label}</button>)}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">{BUCKETS.find((option) => option.value === bucket)?.hint}</p>
          </div>

          <div className="border-t border-line pt-4">
            <p className="text-[11px] font-medium text-ink-2">Window</p>
            <div className="mt-2 space-y-3">
              <label htmlFor="follow-up-days" className="grid gap-1.5 text-[11px] font-medium text-ink-2">
                Days
                <Input id="follow-up-days" type="number" min={1} max={365} value={days} onChange={(event) => { setDays(event.target.value); setFromDate(""); setToDate(""); }} aria-label="Follow-up days" />
              </label>
              <p className="text-[12px] text-ink-4">Use an exact range below instead when you need a specific review period.</p>
            </div>
          </div>

          <div className="border-t border-line pt-4">
            <p className="text-[11px] font-medium text-ink-2">Exact end-date range</p>
            <div className="mt-2 space-y-3">
              <label htmlFor="follow-up-from-date" className="grid gap-1.5 text-[11px] font-medium text-ink-2">
                From date
                <Input id="follow-up-from-date" type="date" min={oldestDate} max={toDate || latestDate} value={fromDate} onChange={(event) => { setFromDate(event.target.value); setDays(""); }} aria-label="Follow-up from date" />
              </label>
              <label htmlFor="follow-up-to-date" className="grid gap-1.5 text-[11px] font-medium text-ink-2">
                To date
                <Input id="follow-up-to-date" type="date" min={fromDate || oldestDate} max={latestDate} value={toDate} onChange={(event) => { setToDate(event.target.value); setDays(""); }} aria-label="Follow-up to date" />
              </label>
            </div>
          </div>

          <Button type="button" variant="secondary" onClick={reset} className="w-full"><RotateCcw /> Reset filters</Button>
        </div>
        <footer className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-ink-3">Date ranges can go back one year. Results update as soon as a filter changes.</footer>
      </aside>

      <div className={cn("grid gap-4", selectedItem && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <section className="panel min-h-[420px] overflow-hidden self-start" aria-labelledby="follow-up-results-title" data-testid="follow-up-results">
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="context-label">Renewal queue</p>
              <h2 id="follow-up-results-title" className="mt-1 text-[15px] font-semibold">Found matches</h2>
              <p className="mt-0.5 text-[12px] text-ink-3">{BUCKETS.find((option) => option.value === bucket)?.label} memberships · {fromDate || toDate ? `${fromDate || oldestDate} → ${toDate || today}` : `${days || "—"} day window`}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="font-mono text-[11px] text-ink-3 tabular">{renewals.data?.totalItems ?? 0}</span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => { void renewals.refetch(); }} aria-label="Refresh follow-up matches" title="Refresh matches"><RefreshCw className="size-3.5" /></Button>
            </div>
          </header>
          {renewals.isLoading ? <div className="space-y-3 p-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</div> : renewals.isError ? <ErrorState className="m-4" title="Follow-up data could not be loaded" onRetry={() => { void renewals.refetch(); }} /> : items.length === 0 ? <EmptyQueue text={bucket === "expiring" ? "No memberships match this expiring filter." : "No memberships match this expired filter."} description="Try a wider day window or an exact end-date range." onReset={reset} /> : <ul className="divide-y divide-line">{items.map((item) => <RenewalRow key={item.membership.id} item={item} selected={selectedItem?.membership.id === item.membership.id} onClick={() => setSelectedId(item.membership.id)} />)}</ul>}
        </section>

        {selectedItem ? <aside ref={panelRef} className="panel self-start overflow-hidden animate-fade-in scroll-mt-16" data-testid="follow-up-panel">
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3"><div className="min-w-0"><p className="context-label">{bucket === "expiring" ? "Expiring membership" : "Expired membership"}</p><h3 className="truncate font-display text-[16px] font-semibold">{selectedItem.member.fullName}</h3><p className="font-mono text-[11.5px] text-ink-3" dir="ltr">{selectedItem.member.phone}</p></div><button type="button" onClick={() => setSelectedId(undefined)} aria-label="Close follow-up panel" className="rounded-sm p-1 text-ink-3 hover:bg-sunken hover:text-ink"><X className="size-4" /></button></header>
        <div className="space-y-4 px-4 py-3.5"><RenewalContext item={selectedItem} /><div className="border-t border-line pt-3.5"><div><p className="context-label">Contact</p><p className="mt-1 text-[11px] text-ink-3">Call or open a ready-to-edit WhatsApp follow-up.</p></div><div className="mt-3 grid grid-cols-2 gap-2"><LogContactDialog subject="member" memberId={selectedItem.member.id} onLogged={() => setSelectedId(undefined)} /><WhatsAppHandoff subject="member" subjectId={selectedItem.member.id} recipientName={selectedItem.member.fullName} phone={selectedItem.member.phone} onLogged={() => setSelectedId(undefined)} className="w-full" /></div></div><div className="border-t border-line pt-3"><Button asChild variant="secondary" size="sm" className="w-full"><Link href={`/members/${selectedItem.member.id}`}>Open member record</Link></Button></div></div>
        </aside> : null}
      </div>
    </div>;
}

function RenewalRow({ item, selected, onClick }: { item: RenewalQueueItem; selected: boolean; onClick: () => void }) {
  return <li><button type="button" aria-pressed={selected} onClick={onClick} className={cn("flex w-full items-center gap-3 px-4 py-3 text-start transition-colors", selected ? "bg-sunken/70" : "hover:bg-sunken/40")}><Monogram name={item.member.fullName} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{item.member.fullName}</span><span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3"><MembershipStatusChip status={item.membership.status} />{item.membership.planName} · ends {formatDate(item.membership.endDate)}</span></span><span className="shrink-0 text-end"><span className="block text-[12px]"><DaysUntilText date={item.membership.endDate} /></span><span className="block text-[11px] text-ink-3">{item.lastContactAt ? <>called <RelativeText iso={item.lastContactAt} /></> : <span className="font-medium text-warning-deep">not contacted</span>}</span></span><PhoneCall className="size-3.5 shrink-0 text-ink-4" aria-hidden /></button></li>;
}

function EmptyQueue({ text, description, onReset }: { text: string; description: string; onReset: () => void }) {
  return <EmptyState title={text} description={description} compact className="m-4" icon={UserPlus} action={<Button type="button" variant="secondary" size="sm" onClick={onReset}>Reset filters</Button>} />;
}

function RenewalContext({ item }: { item: RenewalQueueItem }) {
  return <dl className="space-y-1.5 text-[12.5px]"><ContextRow label="Plan">{item.membership.planName}</ContextRow><ContextRow label="Ends"><span className="tabular">{item.membership.endDate}</span> <DaysUntilText date={item.membership.endDate} /></ContextRow>{item.membership.outstanding.amount > 0 ? <ContextRow label="Balance"><MoneyText money={item.membership.outstanding} className="text-warning-deep" /></ContextRow> : null}{item.lastContactAt ? <ContextRow label="Last contact"><RelativeText iso={item.lastContactAt} /> {item.lastContactOutcome ? `· ${item.lastContactOutcome.replace(/_/g, " ")}` : ""}</ContextRow> : <ContextRow label="Last contact"><span className="font-medium text-warning-deep">never contacted</span></ContextRow>}</dl>;
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) { return <div className="flex items-center justify-between gap-3"><dt className="text-ink-3">{label}</dt><dd className="text-end">{children}</dd></div>; }
