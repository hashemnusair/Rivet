"use client";
import { useLocale, useT, type TKey } from "@/lib/i18n/provider";
import { createTranslator } from "@/lib/i18n/core";
import { followUpHandoffDraft } from "../../../../../convex/followupAssist";


import { tabListClassName, tabTriggerClassName } from "@/components/ui/tabs";

import { Activity, ArrowUpRight, Banknote, CalendarClock, PhoneCall, RefreshCw, RotateCcw, Search, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { contactOutcomeLabel, retentionReasonLabel, riskPriorityLabel } from "@/features/crm/crm-labels";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import type { AtRiskMemberItem, RenewalQueueItem, RetentionRiskKind } from "@/lib/domain/types";
import { useApp } from "@/lib/providers/app-providers";
import { cn } from "@/lib/utils/cn";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { DaysUntilText, MoneyText, RelativeText } from "@/components/shared/data-display";
import { DataPagination, PageHeader } from "@/components/shared/chrome";
import { MembershipStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Monogram, Skeleton } from "@/components/ui/misc";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LogContactDialog } from "@/features/crm/contact-work-panel";
import { WhatsAppHandoff } from "@/features/crm/whatsapp-handoff";
import { FollowUpContextPanel } from "@/features/followup/follow-up-context";
import { WorkspaceModuleBoundary } from "@/components/shell/workspace-module-boundary";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { latinDigits, searchKey } from "@/lib/utils/text";
import { localizeApiError } from "@/lib/api/errors";

type RenewalBucket = "expiring" | "expired";

const BUCKETS: Array<{ value: RenewalBucket; labelKey: TKey; hintKey: TKey }> = [
  { value: "expiring", labelKey: "crmCompletion.queues.buckets.expiring.label", hintKey: "crmCompletion.queues.buckets.expiring.hint" },
  { value: "expired", labelKey: "crmCompletion.queues.buckets.expired.label", hintKey: "crmCompletion.queues.buckets.expired.hint" },
];

export default function QueuesPage() {
  return <Suspense><WorkspaceModuleBoundary moduleKey="revenue"><RetentionWorkspace /></WorkspaceModuleBoundary></Suspense>;
}

function useRetentionParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const update = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value); else next.delete(key);
    }
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };
  return { params, update };
}

function RetentionWorkspace() {
  const t = useT();
  const { params, update } = useRetentionParams();
  const view = params.get("view") === "renewals" ? "renewals" : "at-risk";
  const setView = (next: string) => update({ view: next, page: undefined, member: undefined });
  return <div className="space-y-4">
    <PageHeader title={t("crm.queues.title")} description={t("crmCompletion.queues.description")} />
    <div className={tabListClassName} role="group" aria-label={t("crmCompletion.queues.listsLabel")}>
      <button type="button" aria-pressed={view === "at-risk"} onClick={() => setView("at-risk")} className={tabTriggerClassName}><Activity className="size-3.5" />{" "}{t("dashboard.today.kind.at_risk")}</button>
      <button type="button" aria-pressed={view === "renewals"} onClick={() => setView("renewals")} className={tabTriggerClassName}><CalendarClock className="size-3.5" />{" "}{t("dashboard.owner.renewalsCol")}</button>
    </div>
    {view === "at-risk" ? <AtRiskQueuePage /> : <RenewalQueuePage />}
  </div>;
}

const RISK_FILTERS: Array<{ value: RetentionRiskKind | "all"; labelKey: TKey; hintKey: TKey }> = [
  { value: "all", labelKey: "crmCompletion.queues.riskFilters.all.label", hintKey: "crmCompletion.queues.riskFilters.all.hint" },
  { value: "inactive", labelKey: "crmCompletion.queues.riskFilters.inactive.label", hintKey: "crmCompletion.queues.riskFilters.inactive.hint" },
  { value: "expiring", labelKey: "crmCompletion.queues.riskFilters.expiring.label", hintKey: "crmCompletion.queues.riskFilters.expiring.hint" },
  { value: "expired", labelKey: "crmCompletion.queues.riskFilters.expired.label", hintKey: "crmCompletion.queues.riskFilters.expired.hint" },
];

function AtRiskQueuePage() {
  const t = useT();
  const { session } = useApp();
  const { params, update } = useRetentionParams();
  const requestedReason = params.get("reason");
  const reason = RISK_FILTERS.find((item) => item.value === requestedReason)?.value ?? "all";
  const search = params.get("q") ?? "";
  const selectedId = params.get("member") ?? undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const setReason = (value: RetentionRiskKind | "all") => update({ reason: value === "all" ? undefined : value, page: undefined, member: undefined });
  const setSearch = (value: string) => update({ q: value || undefined, page: undefined, member: undefined });
  const setSelectedId = (value: string | undefined) => update({ member: value });
  const panelRef = useRef<HTMLElement | null>(null);
  const query = useMemo(() => ({ branchId: session?.activeBranchId, reason, search: searchKey(search) || undefined, page, pageSize: 25 }), [reason, search, page, session?.activeBranchId]);
  const risks = useRealtimeApiQuery({
    queryKey: qk.atRisk(query),
    query: (api) => api.listAtRiskMembers(query),
    subscribe: (api, onValue, onError) => api.subscribeAtRiskMembers(query, onValue, onError),
  });
  const items = risks.data?.items ?? [];
  const selectedItem = items.find((item) => item.member.id === selectedId);

  useEffect(() => {
    if (selectedItem && window.innerWidth < 1536) panelRef.current?.scrollIntoView?.({ behavior: "instant", block: "nearest" });
  }, [selectedItem]);

  return <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
    <aside className="panel h-fit self-start lg:sticky lg:top-20" aria-label={t("crmCompletion.queues.filtersLabel")}>

      <div className="space-y-4 p-4">
        <label htmlFor="risk-search" className="grid gap-1.5 text-[12px] font-medium text-ink-2">{t("crmCompletion.queues.findMember")}<div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-4" /><Input id="risk-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("crmCompletion.queues.searchPlaceholder")} className="ps-9" /></div></label>
        <div className="border-t border-line pt-4">
          <p className="text-[12px] font-medium text-ink-2">{t("crmCompletion.queues.reasonLabel")}</p>
          <div className="mt-2 grid grid-cols-2 gap-1 lg:grid-cols-1" role="group" aria-label={t("crmCompletion.queues.reasonLabel")}>
            {RISK_FILTERS.map((option) => <button key={option.value} type="button" aria-pressed={reason === option.value} onClick={() => { setReason(option.value); }} className={cn("rounded-sm px-3 py-2.5 text-start text-[12.5px] font-medium transition-colors", reason === option.value ? "bg-sunken text-ink" : "text-ink-2 hover:bg-sunken/50")}>{t(option.labelKey)}</button>)}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{t(RISK_FILTERS.find((option) => option.value === reason)!.hintKey)}</p>
        </div>
        <p className="hidden text-[12px] leading-relaxed text-ink-2 lg:block">{t("crmCompletion.queues.excludedNote")}</p>
      </div>
    </aside>

    <div className={cn("grid gap-4", selectedItem && "2xl:grid-cols-[minmax(0,1fr)_340px]")}>
      {selectedId && !selectedItem && risks.data && !risks.isLoading ? <MissingSelectionNotice memberId={selectedId} onClear={() => setSelectedId(undefined)} /> : null}
      <section className="panel min-h-[420px] overflow-hidden self-start" aria-labelledby="risk-results-title">
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3"><div><h2 id="risk-results-title" className="mt-1 text-[15px] font-semibold">{t("crmCompletion.queues.membersToContact")}</h2><p className="mt-0.5 text-[12px] text-ink-3">{t("crmCompletion.queues.urgentFirst")}</p></div><div className="flex shrink-0 items-center gap-2"><span className="text-[12px] tabular text-ink-3">{risks.data?.totalItems ?? "…"}</span><Button type="button" variant="ghost" size="icon-sm" onClick={() => void risks.refetch()} aria-label={t("crmCompletion.queues.refreshAtRisk")}><RefreshCw className="size-3.5" /></Button></div></header>
        {risks.isBackgroundError ? <ErrorState layout="inline" title={t("crmCompletion.queues.listRefreshFailed")} onRetry={() => void risks.refetch()} /> : null}
        {risks.isLoading && !risks.data ? <div className="space-y-3 p-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</div> : risks.isError && !risks.data ? <ErrorState className="m-4" title={t("crmCompletion.queues.atRiskLoadFailed")} onRetry={() => void risks.refetch()} /> : items.length === 0 ? <EmptyState title={t("crmCompletion.queues.noMembers")} description={t("crmCompletion.queues.noMembersHint")} compact className="m-4" icon={Activity} action={(search || reason !== "all") ? <Button type="button" variant="secondary" size="sm" onClick={() => { update({ q: undefined, reason: undefined, page: undefined, member: undefined }); }}>{t("common.action.clearFilters")}</Button> : undefined} /> : <ul className="divide-y divide-line">{items.map((item) => <AtRiskRow key={item.member.id} item={item} selected={selectedItem?.member.id === item.member.id} onClick={() => setSelectedId(item.member.id)} />)}</ul>}
        {risks.data && risks.data.totalPages > 1 ? <DataPagination page={risks.data} onPage={(next) => update({ page: String(next), member: undefined })} className="border-t border-line p-4" /> : null}
      </section>
      {selectedItem ? <AtRiskPanel ref={panelRef} item={selectedItem} onClose={() => setSelectedId(undefined)} /> : null}
    </div>
  </div>;
}

/**
 * A Today link names a member who is not on this page of the queue (another
 * page, a filter, or no longer at risk). Say so and offer the record instead
 * of opening nothing.
 */
function MissingSelectionNotice({ memberId, onClear }: { memberId: string; onClear: () => void }) {
  const t = useT();
  return <aside className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 animate-fade-in" data-testid="at-risk-missing-selection" aria-label={t("crmCompletion.queues.missingSelectionLabel")}>
    <div className="min-w-0">
      <p className="text-[13px] font-medium">{t("crmCompletion.queues.missingSelectionTitle")}</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{t("crmCompletion.queues.missingSelectionDescription")}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm"><Link href={`/members/${memberId}`}>{t("crm.queues.openMemberRecord")}{" "}<ArrowUpRight /></Link></Button>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>{t("members.list.clearSelection")}</Button>
    </div>
  </aside>;
}

function AtRiskRow({ item, selected, onClick }: { item: AtRiskMemberItem; selected: boolean; onClick: () => void }) {
  const { t } = useLocale();
  return <li><button type="button" aria-pressed={selected} onClick={onClick} className={cn("flex w-full items-center gap-3 px-4 py-3 text-start transition-colors", selected ? "bg-sunken/70" : "hover:bg-sunken/40")}><Monogram name={item.member.fullName} size="sm" /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="break-words text-[13px] font-medium" dir="auto">{item.member.fullName}</span><span className={cn("rounded-sm px-2 py-0.5 text-[12px] font-medium", item.priority === "urgent" ? "bg-danger-soft text-danger" : item.priority === "high" ? "bg-warning-soft text-warning-deep" : "bg-sunken text-ink-3")}>{riskPriorityLabel(t, item.priority)}</span></span><span className="mt-1 block text-[12px] text-ink-3">{item.reasons.map((risk) => retentionReasonLabel(t, risk, Boolean(item.lastVisitAt))).join(" · ")}</span></span><span className="hidden shrink-0 text-end sm:block"><span className="block text-[12px] font-medium" dir="auto">{item.membership.planName}</span><span className="block text-[12px] text-ink-3">{item.lastContactAt ? <>{contactOutcomeLabel(t, item.lastContactOutcome) ?? t("crmCompletion.queues.contacted")} · <RelativeText iso={item.lastContactAt} /></> : t("crmCompletion.queues.notContacted")}</span></span><PhoneCall className="size-3.5 shrink-0 text-ink-4" /></button></li>;
}

function AtRiskPanel({ item, onClose, ref }: { item: AtRiskMemberItem; onClose: () => void; ref: React.Ref<HTMLElement> }) {
  const { t, isolate } = useLocale();
  const { session } = useApp();
  const format = useFormat(session?.organization.timezone);
  const today = todayISODate(session?.organization?.timezone);
  const canSell = (session?.permissions ?? []).includes("memberships.sell");
  const canCollect = (session?.permissions ?? []).includes("payments.collect");
  const needsRenewal = item.reasons.some((reason) => reason.kind === "expired" || reason.kind === "expiring");
  const lapsedSnooze = item.snoozedUntil && item.snoozedUntil < today ? item.snoozedUntil : undefined;
  const firstName = item.member.fullName.trim().split(/\s+/)[0] || item.member.fullName;
  const messageKey: TKey = item.reasons.some((reason) => reason.kind === "expired")
    ? "crmCompletion.queues.expiredMessage"
    : item.reasons.some((reason) => reason.kind === "expiring")
      ? "crmCompletion.queues.expiringMessage"
      : "crmCompletion.queues.inactiveMessage";
  const recipientLanguage = followUpHandoffDraft(
    { fullName: item.member.fullName, preferredLanguage: item.member.preferredLanguage },
    session?.organization.name ?? "RIVET",
    session?.organization.defaultLanguage,
  ).language;
  const recipientT = createTranslator(recipientLanguage);
  const initialMessage = recipientT(messageKey, { name: recipientLanguage === "ar" ? isolate(firstName) : firstName });
  return <aside ref={ref} className="panel self-start overflow-hidden animate-fade-in scroll-mt-16" data-testid="at-risk-panel">
    <FollowUpHeader member={item.member} onClose={onClose} />
    <div className="space-y-4 px-4 py-4">
      <div className="space-y-1">{item.reasons.map((reason) => <p key={reason.kind} className="text-[13px] font-medium">{retentionReasonLabel(t, reason, Boolean(item.lastVisitAt))}</p>)}</div>
      {lapsedSnooze ? <p className="rounded-md border border-line bg-sunken px-3 py-2 text-[12px] leading-relaxed text-ink-2" data-testid="at-risk-lapsed-snooze">{t("crmCompletion.queues.lapsedSnooze", { date: format.date(lapsedSnooze) })}</p> : null}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-[12.5px]">
        <ContextRow label={t("crm.lead.membership.plan")}>{item.membership.planName}</ContextRow>
        <ContextRow label={t("members.list.columns.expiry")}>{format.date(item.membership.endDate)}</ContextRow>
        <ContextRow label={t("crmCompletion.queues.lastVisit")}>{item.lastVisitAt ? <RelativeText iso={item.lastVisitAt} /> : t("crmCompletion.queues.noVisitsRecorded")}</ContextRow>
        <ContextRow label={t("crm.queues.lastContact")}>{item.lastContactAt ? <>{contactOutcomeLabel(t, item.lastContactOutcome) ?? t("crmCompletion.queues.contacted")} · <RelativeText iso={item.lastContactAt} /></> : <span className="font-medium text-warning-deep">{t("crmCompletion.queues.notContactedYet")}</span>}</ContextRow>
        {item.membership.outstanding.amount > 0 ? <ContextRow label={t("members.list.columns.balance")}><MoneyText money={item.membership.outstanding} className="text-warning-deep" /></ContextRow> : null}
      </dl>
    </div>
    <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3" aria-label={t("crmCompletion.queues.followUpActions")}>
      <Button asChild variant="secondary" size="sm"><a href={`tel:${item.member.phone}`}><PhoneCall /> {t("crmCompletion.queues.call")}</a></Button>
      <WhatsAppHandoff subject="member" subjectId={item.member.id} recipientName={item.member.fullName} recipientPreferredLanguage={item.member.preferredLanguage} phone={item.member.phone} initialMessage={initialMessage} onLogged={onClose} />
      <LogContactDialog subject="member" memberId={item.member.id} onLogged={onClose} />
      {needsRenewal && canSell ? <Button asChild variant="secondary" size="sm"><Link href={`/members/${item.member.id}?action=renew`}><RotateCcw />{" "}{t("memberProfile.header.renew")}</Link></Button> : null}
      {item.membership.outstanding.amount > 0 && canCollect ? <Button asChild variant="secondary" size="sm"><Link href={`/members/${item.member.id}?action=collect`}><Banknote />{" "}{t("renewFlow.payment.collectPlain")}</Link></Button> : null}
      <SnoozeRiskDialog item={item} onSnoozed={onClose} />
    </footer>
  </aside>;
}

function SnoozeRiskDialog({ item, onSnoozed }: { item: AtRiskMemberItem; onSnoozed: () => void }) {
  const { t, locale, isolate } = useLocale();
  const { session } = useApp();
  const format = useFormat(session?.organization.timezone);
  const invalidate = useInvalidate();
  const today = todayISODate(session?.organization?.timezone);
  const [open, setOpen] = useState(false);
  const [until, setUntil] = useState(addDays(today, item.recommendedSnoozeDays));
  const [reason, setReason] = useState("");
  useEffect(() => {
    setUntil(addDays(today, item.recommendedSnoozeDays));
    setReason("");
  }, [item.member.id, item.recommendedSnoozeDays, today]);
  const snooze = useApiMutation((api) => api.snoozeAtRiskMember({ memberId: item.member.id, until, reason: reason.trim() || undefined }), { onSuccess: async () => { toast.success(t("crmCompletion.queues.snoozeSaved", { date: format.date(until) })); setOpen(false); await invalidate(); onSnoozed(); }, onError: (error) => toast.error(error instanceof Error ? localizeApiError(error, locale).message : t("crmCompletion.pipeline.saveFailed")) });
  return <><Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}><CalendarClock /> {t("crmCompletion.queues.remindLater")}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{t("crmCompletion.queues.remindLater")}</DialogTitle><DialogDescription>{t("crmCompletion.queues.snoozeDescription", { name: isolate(item.member.fullName) })}</DialogDescription></DialogHeader><DialogBody className="space-y-3"><label htmlFor="risk-snooze-until" className="grid gap-1.5 text-[12px] font-medium text-ink-2">{t("crmCompletion.queues.showAgainOn")}<Input id="risk-snooze-until" type="date" dir="ltr" min={addDays(today, 1)} max={addDays(today, 90)} value={until} onChange={(event) => setUntil(event.target.value)} /></label><label htmlFor="risk-snooze-reason" className="grid gap-1.5 text-[12px] font-medium text-ink-2">{t("memberProfile.followUp.evidenceKind.note")}{" "}<span className="font-normal text-ink-4">{t("common.state.optional")}</span><Input id="risk-snooze-reason" dir="auto" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("crmCompletion.queues.snoozeReasonPlaceholder")} /></label></DialogBody><DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("common.action.cancel")}</Button><Button type="button" loading={snooze.isPending} disabled={!until} onClick={() => snooze.mutate()}>{t("crmCompletion.queues.hideUntil")}</Button></DialogFooter></DialogContent></Dialog></>;
}

function RenewalQueuePage() {
  const { t } = useLocale();
  const { session } = useApp();
  const format = useFormat(session?.organization.timezone);
  const { params, update } = useRetentionParams();
  const bucket: RenewalBucket = params.get("bucket") === "expired" ? "expired" : "expiring";
  const fromDate = params.get("from") ?? "";
  const toDate = params.get("to") ?? "";
  const days = params.get("days") ?? (fromDate || toDate ? "" : bucket === "expired" ? "45" : "14");
  const normalizedDays = latinDigits(days);
  const daysNumber = /^\d+$/.test(normalizedDays) ? Number(normalizedDays) : Number.NaN;
  const selectedId = params.get("member") ?? undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const setSelectedId = (value: string | undefined) => update({ member: value });
  const panelRef = useRef<HTMLElement | null>(null);
  const today = todayISODate(session?.organization?.timezone);
  const oldestDate = addDays(today, -365);
  const latestDate = bucket === "expired" ? today : addDays(today, 365);

  const query = useMemo(() => ({
    bucket,
    branchId: session?.activeBranchId,
    days: Number.isInteger(daysNumber) && daysNumber > 0 ? Math.min(daysNumber, 365) : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    page, pageSize: 25,
  }), [bucket, daysNumber, fromDate, session?.activeBranchId, toDate, page]);
  const renewals = useRealtimeApiQuery({
    queryKey: qk.renewalQueue(query),
    query: (api) => api.listRenewalQueue(query),
    subscribe: (api, onValue, onError) => api.subscribeRenewalQueue(query, onValue, onError),
  });
  const items = renewals.data?.items ?? [];
  const selectedItem = items.find((item) => item.membership.id === selectedId);

  useEffect(() => {
    if (selectedItem && window.innerWidth < 1536) panelRef.current?.scrollIntoView?.({ behavior: "instant", block: "nearest" });
  }, [selectedItem]);

  const reset = () => update({ days: undefined, from: undefined, to: undefined, member: undefined, page: undefined });
  const changeBucket = (next: RenewalBucket) => update({ bucket: next, days: undefined, from: undefined, to: undefined, member: undefined, page: undefined });

  return <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
    <aside className="panel h-fit self-start lg:sticky lg:top-20" aria-label={t("crm.queues.filtersLabel")} data-testid="follow-up-filters">
        <header className="border-b border-line px-4 py-3">

          <h2 className="mt-1 text-[15px] font-semibold">{t("crm.queues.membershipsToReview")}</h2>
        </header>
        <div className="space-y-4 p-4">
          <div>
            <p className="text-[12px] font-medium text-ink-2">{t("crm.queues.status")}</p>
            <div className="mt-2 grid grid-cols-2 gap-1 lg:grid-cols-1" role="group" aria-label={t("crm.queues.statusLabel")}>
              {BUCKETS.map((option) => <button key={option.value} type="button" aria-pressed={bucket === option.value} onClick={() => changeBucket(option.value)} className={cn("rounded-sm px-3 py-2.5 text-start text-[12.5px] font-medium transition-colors", bucket === option.value ? "bg-sunken text-ink" : "text-ink-2 hover:bg-sunken/50")}>{t(option.labelKey)}</button>)}
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">{t(BUCKETS.find((option) => option.value === bucket)!.hintKey)}</p>
          </div>

          <div className="border-t border-line pt-4">
            <p className="text-[12px] font-medium text-ink-2">{t("crmCompletion.queues.timePeriod")}</p>
            <div className="mt-2 space-y-3">
              <label htmlFor="follow-up-days" className="grid gap-1.5 text-[12px] font-medium text-ink-2">
                {t("crmCompletion.queues.days")}
                <Input id="follow-up-days" type="text" inputMode="numeric" min={1} max={365} value={days} onChange={(event) => { update({ days: event.target.value, from: undefined, to: undefined, page: undefined, member: undefined }); }} aria-label={t("crm.queues.daysLabel")} dir="ltr" />
              </label>
              <p className="text-[12px] text-ink-4">{t("crmCompletion.queues.exactDatesHint")}</p>
            </div>
          </div>

          <details className="border-t border-line pt-4" open={Boolean(fromDate || toDate) || undefined}>
            <summary className="min-h-9 cursor-pointer text-[12px] font-medium text-ink-2">{t("crmCompletion.queues.exactEndDates")}</summary>
            <div className="mt-2 space-y-3">
              <label htmlFor="follow-up-from-date" className="grid gap-1.5 text-[12px] font-medium text-ink-2">
                {t("crmCompletion.queues.fromDate")}
                <Input id="follow-up-from-date" type="date" dir="ltr" min={oldestDate} max={toDate || latestDate} value={fromDate} onChange={(event) => { update({ from: event.target.value, days: undefined, page: undefined, member: undefined }); }} aria-label={t("crm.queues.fromLabel")} />
              </label>
              <label htmlFor="follow-up-to-date" className="grid gap-1.5 text-[12px] font-medium text-ink-2">
                {t("crmCompletion.queues.toDate")}
                <Input id="follow-up-to-date" type="date" dir="ltr" min={fromDate || oldestDate} max={latestDate} value={toDate} onChange={(event) => { update({ to: event.target.value, days: undefined, page: undefined, member: undefined }); }} aria-label={t("crm.queues.toLabel")} />
              </label>
            </div>
          </details>

          <Button type="button" variant="secondary" onClick={reset} className="w-full"><RotateCcw />{" "}{t("crm.queues.resetFilters")}</Button>
        </div>
        <footer className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-ink-3">{t("crmCompletion.queues.oneYearRange")}</footer>
      </aside>

      <div className={cn("grid gap-4", selectedItem && "2xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <section className="panel min-h-[420px] overflow-hidden self-start" aria-labelledby="follow-up-results-title" data-testid="follow-up-results">
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div>

              <h2 id="follow-up-results-title" className="mt-1 text-[15px] font-semibold">{t("crmCompletion.queues.membershipsFound")}</h2>
              <p className="mt-0.5 text-[12px] text-ink-3">{t(BUCKETS.find((option) => option.value === bucket)!.labelKey)} · {fromDate || toDate ? t("crmCompletion.queues.dateRange", { from: format.date(fromDate || oldestDate), to: format.date(toDate || today) }) : daysNumber > 0 ? t(bucket === "expired" ? "crmCompletion.queues.lastDays" : "crmCompletion.queues.nextDays", { count: Math.min(daysNumber, 365) }) : "—"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[12px] text-ink-3 tabular">{renewals.data?.totalItems ?? "…"}</span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => { void renewals.refetch(); }} aria-label={t("crmCompletion.queues.refreshList")} title={t("crmCompletion.queues.refreshList")}><RefreshCw className="size-3.5" /></Button>
            </div>
          </header>
          {renewals.isBackgroundError ? <ErrorState layout="inline" title={t("crmCompletion.queues.renewalsRefreshFailed")} onRetry={() => void renewals.refetch()} /> : null}
          {renewals.isLoading && !renewals.data ? <div className="space-y-3 p-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-14 w-full" />)}</div> : renewals.isError && !renewals.data ? <ErrorState className="m-4" title={t("crmCompletion.queues.renewalsLoadFailed")} onRetry={() => { void renewals.refetch(); }} /> : items.length === 0 ? <EmptyQueue text={t(bucket === "expiring" ? "crmCompletion.queues.noExpiringMemberships" : "crmCompletion.queues.noExpiredMemberships")} description={t("crmCompletion.queues.tryWiderRange")} onReset={reset} /> : <ul className="divide-y divide-line">{items.map((item) => <RenewalRow key={item.membership.id} item={item} selected={selectedItem?.membership.id === item.membership.id} onClick={() => setSelectedId(item.membership.id)} />)}</ul>}
          {renewals.data && renewals.data.totalPages > 1 ? <DataPagination page={renewals.data} onPage={(next) => update({ page: String(next), member: undefined })} className="border-t border-line p-4" /> : null}
        </section>

        {selectedItem ? <aside ref={panelRef} className="panel self-start overflow-hidden animate-fade-in scroll-mt-16" data-testid="follow-up-panel">
        <FollowUpHeader member={selectedItem.member} onClose={() => setSelectedId(undefined)} />
        <div className="px-4 py-4"><RenewalContext item={selectedItem} /></div>
        <div className="border-t border-line px-4 py-4"><FollowUpContextPanel memberId={selectedItem.member.id} variant="renewal" /></div>
        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3" aria-label={t("crmCompletion.queues.followUpActions")}>
          <Button asChild variant="secondary" size="sm"><a href={`tel:${selectedItem.member.phone}`}><PhoneCall /> {t("crmCompletion.queues.call")}</a></Button>
          <WhatsAppHandoff subject="member" subjectId={selectedItem.member.id} recipientName={selectedItem.member.fullName} recipientPreferredLanguage={selectedItem.member.preferredLanguage} phone={selectedItem.member.phone} onLogged={() => setSelectedId(undefined)} />
          <LogContactDialog subject="member" memberId={selectedItem.member.id} onLogged={() => setSelectedId(undefined)} />
          {(session?.permissions ?? []).includes("memberships.sell") ? <Button asChild variant="secondary" size="sm"><Link href={`/members/${selectedItem.member.id}?action=renew`}><RotateCcw />{" "}{t("memberProfile.header.renew")}</Link></Button> : null}
          {selectedItem.membership.outstanding.amount > 0 && (session?.permissions ?? []).includes("payments.collect") ? <Button asChild variant="secondary" size="sm"><Link href={`/members/${selectedItem.member.id}?action=collect`}><Banknote />{" "}{t("renewFlow.payment.collectPlain")}</Link></Button> : null}
        </footer>
        </aside> : null}
      </div>
    </div>;
}

function RenewalRow({ item, selected, onClick }: { item: RenewalQueueItem; selected: boolean; onClick: () => void }) {
  const t = useT();
  const format = useFormat();
  return <li><button type="button" aria-pressed={selected} onClick={onClick} className={cn("flex w-full items-center gap-3 px-4 py-3 text-start transition-colors", selected ? "bg-sunken/70" : "hover:bg-sunken/40")}><Monogram name={item.member.fullName} size="sm" /><span className="min-w-0 flex-1"><span className="block break-words text-[13px] font-medium" dir="auto">{item.member.fullName}</span><span className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-3"><MembershipStatusChip status={item.membership.status} /><span dir="auto">{item.membership.planName}</span> · {t("crmCompletion.queues.endsOn", { date: format.date(item.membership.endDate) })}</span></span><span className="shrink-0 text-end"><span className="block text-[12px]"><DaysUntilText date={item.membership.endDate} /></span><span className="block text-[12px] text-ink-3">{item.lastContactAt ? <>{contactOutcomeLabel(t, item.lastContactOutcome) ?? t("crmCompletion.queues.contacted")} · <RelativeText iso={item.lastContactAt} /></> : <span className="font-medium text-warning-deep">{t("crmCompletion.queues.notContacted")}</span>}</span></span><PhoneCall className="size-3.5 shrink-0 text-ink-4" aria-hidden /></button></li>;
}

function EmptyQueue({ text, description, onReset }: { text: string; description: string; onReset: () => void }) {
  const t = useT();
  return <EmptyState title={text} description={description} compact className="m-4" icon={UserPlus} action={<Button type="button" variant="secondary" size="sm" onClick={onReset}>{t("crm.queues.resetFilters")}</Button>} />;
}

function RenewalContext({ item }: { item: RenewalQueueItem }) {
  const t = useT();
  const format = useFormat();
  return <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-[12.5px]"><ContextRow label={t("crm.lead.membership.plan")}><span dir="auto">{item.membership.planName}</span></ContextRow><ContextRow label={t("crm.queues.ends")}><span className="tabular">{format.date(item.membership.endDate)}</span> <DaysUntilText date={item.membership.endDate} /></ContextRow>{item.membership.outstanding.amount > 0 ? <ContextRow label={t("members.list.columns.balance")}><MoneyText money={item.membership.outstanding} className="text-warning-deep" /></ContextRow> : null}{item.lastContactAt ? <ContextRow label={t("crm.queues.lastContact")}>{contactOutcomeLabel(t, item.lastContactOutcome) ?? t("crmCompletion.queues.contacted")} · <RelativeText iso={item.lastContactAt} /></ContextRow> : <ContextRow label={t("crm.queues.lastContact")}><span className="font-medium text-warning-deep">{t("crmCompletion.queues.notContactedYet")}</span></ContextRow>}</dl>;
}

function FollowUpHeader({ member, onClose }: { member: { id: string; fullName: string; phone: string }; onClose: () => void }) {
  const { t, isolate } = useLocale();
  return <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
    <div className="min-w-0">
      <h3 className="text-[16px] font-semibold"><Link href={`/members/${member.id}`} aria-label={t("crmCompletion.queues.openMemberNamed", { name: isolate(member.fullName) })} className="inline-flex min-h-9 items-center gap-2 hover:underline underline-offset-4"><span className="break-words" dir="auto">{member.fullName}</span><ArrowUpRight className="size-4 shrink-0 text-ink-3" aria-hidden /></Link></h3>
      <p className="text-[12px] text-ink-3" dir="ltr">{member.phone}</p>
    </div>
    <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("crm.queues.closePanel")}><X /></Button>
  </header>;
}

function ContextRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <><dt className="text-ink-3">{label}</dt><dd className="min-w-0 break-words text-ink-2">{children}</dd></>;
}
