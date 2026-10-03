"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Dumbbell } from "lucide-react";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import type { CheckInSummary, MemberDetail, MembershipSummary, Task, TimelineEventType, TransactionSummary, UUID } from "@/lib/domain/types";
import { LogContactForm } from "@/features/crm/contact-work-panel";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { numberingLocale } from "@/lib/i18n/config";
import { useFormat } from "@/lib/i18n/format";
import { en } from "@/lib/i18n/messages/en";
import { leadSourceLabel, paymentMethodLabel, transactionTypeLabel } from "@/lib/i18n/labels";
import { useLocale, type TFunction, type TKey } from "@/lib/i18n/provider";
import { toast } from "sonner";
import { DateText, DateTimeText, DaysUntilText, MoneyText, RelativeText } from "@/components/shared/data-display";
import { DataPagination } from "@/components/shared/chrome";
import { CheckInDecisionChip, MembershipStatusChip, PaymentStatusChip, TransactionStatusChip } from "@/components/shared/status-chip";
import { TimelineFeed } from "@/components/shared/timeline-feed";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";
import { receiptHref } from "@/lib/utils/receipt-links";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { visibleBranchId } from "@/lib/domain/branch-scope";
import { ptBookingAwaitsOutcome, ptNextBooking } from "@/lib/domain/personal-training";

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------
export function OverviewTab({ member }: { member: MemberDetail }) {
  const { t } = useLocale();
  const timelineQuery = useApiQuery(qk.memberTimeline(member.id, { pageSize: 6 }), (api) =>
    api.listMemberTimeline(member.id, { pageSize: 6 }),
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="panel grid grid-cols-2 self-start [&>*:nth-child(2n)]:border-s [&>*:nth-child(n+3)]:border-t [&>*]:border-line">
        <StatCell label={t("memberProfile.overview.checkIns30")} value={member.stats.checkInsLast30Days} />
        <StatCell label={t("memberProfile.overview.checkInsAll")} value={member.stats.totalCheckIns} />
        <StatCell label={t("memberProfile.overview.totalPaid")} value={<MoneyText money={member.stats.lifetimeValue} />} />
        <StatCell
          label={t("memberProfile.overview.lastCheckIn")}
          value={
            member.stats.daysSinceLastCheckIn != null
              ? member.stats.daysSinceLastCheckIn === 0
                ? t("common.time.today")
                : t("memberProfile.overview.daysAgo", { count: member.stats.daysSinceLastCheckIn })
              : "—"
          }
        />
      </section>

      <section className="panel overflow-hidden">
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h3 className="text-[13px] font-semibold">{t("memberProfile.overview.latestActivity")}</h3>
        </header>
        <div className="px-4 py-3">
          {timelineQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <TimelineFeed events={timelineQuery.data?.items ?? []} dense empty={t("memberProfile.overview.emptyActivity")} />
          )}
        </div>
      </section>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="px-4 py-3.5">
      <p className="context-label">{label}</p>
      <div className="mt-1 text-[20px] font-medium tabular">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
const TIMELINE_FILTERS: Array<{ value: string; labelKey: TKey; types?: TimelineEventType[] }> = [
  { value: "all", labelKey: "memberProfile.timeline.filters.all" },
  { value: "commercial", labelKey: "memberProfile.timeline.filters.commercial", types: ["membership_sold", "membership_renewed", "payment_collected", "payment_refunded", "payment_voided"] },
  { value: "membership", labelKey: "memberProfile.timeline.filters.membership", types: ["membership_frozen", "membership_unfrozen", "membership_extended", "membership_cancelled"] },
  { value: "contact", labelKey: "memberProfile.timeline.filters.contact", types: ["call_attempt", "note", "message", "task_created", "task_completed", "offer_drafted", "offer_sent"] },
  { value: "checkin", labelKey: "memberProfile.timeline.filters.checkin", types: ["check_in"] },
];

export function TimelineTab({ memberId }: { memberId: UUID }) {
  const { t } = useLocale();
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const types = TIMELINE_FILTERS.find((f) => f.value === filter)?.types;
  const query = useApiQuery(qk.memberTimeline(memberId, { filter, page }), (api) =>
    api.listMemberTimeline(memberId, { types, page, pageSize: 25 }),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("memberProfile.timeline.filterLabel")}>
        {TIMELINE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setFilter(f.value);
              setPage(1);
            }}
            aria-pressed={filter === f.value}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] transition-colors cursor-pointer",
              filter === f.value ? "border-ink bg-ink text-paper" : "border-line-2 bg-surface text-ink-2 hover:border-line-3",
            )}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>
      <div className="panel px-5 py-4">
        {query.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : query.isError ? (
          <ErrorState onRetry={() => query.refetch()} />
        ) : (
          <>
            <div data-testid="member-timeline">
              <TimelineFeed events={query.data?.items ?? []} empty={t("memberProfile.timeline.empty")} />
            </div>
            {query.data ? <DataPagination page={query.data} onPage={setPage} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memberships
// ---------------------------------------------------------------------------
export function MembershipsTab({ memberId }: { memberId: UUID }) {
  const { t, isolate } = useLocale();
  const format = useFormat();
  const query = useApiQuery(qk.memberships({ memberId }), (api) =>
    api.listMemberships({ memberId, pageSize: 20, sort: "-startDate" }),
  );

  if (query.isLoading) return <Skeleton className="h-48 w-full" />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return <EmptyState layout="section" title={t("memberProfile.memberships.empty")} description={t("memberProfile.memberships.emptyDescription")} />;
  }

  return (
    <div className="panel overflow-hidden">
      <ul className="divide-y divide-line lg:hidden" aria-label={t("memberProfile.memberships.historyLabel")}>
        {items.map((membership) => <MembershipRecordRow key={membership.id} membership={membership} />)}
      </ul>
      <Table className="hidden lg:table">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("memberProfile.memberships.plan")}</TableHead>
            <TableHead>{t("memberProfile.memberships.dates")}</TableHead>
            <TableHead>{t("common.label.status")}</TableHead>
            <TableHead className="text-end">{t("memberProfile.memberships.price")}</TableHead>
            <TableHead className="text-end">{t("memberProfile.memberships.discount")}</TableHead>
            <TableHead>{t("memberProfile.memberships.payment")}</TableHead>
            <TableHead>{t("common.label.type")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((m) => (
            <TableRow key={m.id}>
              <TableCell>
                <bdi className="font-medium">{m.planName}</bdi>
                {m.remainingVisits != null ? (
                  <span className="block text-[12px] text-ink-3 tabular">
                    {t("memberProfile.shared.visitsLeft", { remaining: m.remainingVisits, total: m.totalVisits ?? "" })}
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                <span className="whitespace-nowrap text-[12px] tabular">
                  {t("memberProfile.shared.dateRange", { start: isolate(format.date(m.startDate)), end: isolate(format.date(m.endDate)) })}
                </span>
                <span className="block text-[12px]">
                  <DaysUntilText date={m.endDate} />
                </span>
              </TableCell>
              <TableCell>
                <MembershipStatusChip status={m.status} />
                {m.activeFreeze ? (
                  <span className="block text-[12px] text-ink-3">{t("memberProfile.memberships.frozenUntil", { date: isolate(format.date(m.activeFreeze.endDate)) })}</span>
                ) : null}
              </TableCell>
              <TableCell className="text-end">
                <MoneyText money={m.salePrice} />
              </TableCell>
              <TableCell className="text-end">
                {m.discount.amount > 0 ? (
                  <span>
                    <MoneyText money={m.discount} />
                    {m.discountApprovalStatus === "pending" ? (
                      <Badge variant="warning" className="ms-1.5">{t("memberProfile.memberships.needsApproval")}</Badge>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-ink-4">—</span>
                )}
              </TableCell>
              <TableCell>
                <PaymentStatusChip status={m.paymentStatus} />
                {m.outstanding.amount > 0 ? (
                  <span className="block text-[12px] text-warning-deep tabular">
                    {t("memberProfile.shared.owes")} <MoneyText money={m.outstanding} />
                  </span>
                ) : null}
                {(m.upcomingAmount?.amount ?? 0) > 0 ? (
                  <span className="block text-[12px] text-ink-3 tabular">
                    <MoneyText money={m.upcomingAmount!} /> {t("memberProfile.memberships.dueOn", { date: isolate(format.date(m.startDate)) })}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-[12px] text-ink-3">
                {m.previousMembershipId ? t("memberProfile.memberships.renewal") : t("memberProfile.memberships.firstMembership")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MembershipRecordRow({ membership }: { membership: MembershipSummary }) {
  const { t, isolate } = useLocale();
  const format = useFormat();
  return (
    <li className="space-y-3 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-semibold text-ink" dir="auto">{membership.planName}</p>
          <p className="mt-0.5 text-[12px] tabular text-ink-3">{t("memberProfile.shared.dateRange", { start: isolate(format.date(membership.startDate)), end: isolate(format.date(membership.endDate)) })} · <DaysUntilText date={membership.endDate} /></p>
        </div>
        <MembershipStatusChip status={membership.status} />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-[12.5px]">
        <div><dt className="text-ink-3">{t("memberProfile.memberships.price")}</dt><dd className="mt-0.5 font-medium"><MoneyText money={membership.salePrice} /></dd></div>
        <div><dt className="text-ink-3">{t("memberProfile.memberships.payment")}</dt><dd className="mt-0.5"><PaymentStatusChip status={membership.paymentStatus} /></dd></div>
        {membership.remainingVisits != null ? <div><dt className="text-ink-3">{t("memberProfile.memberships.visitsLeftLabel")}</dt><dd className="mt-0.5 tabular">{t("memberProfile.memberships.ofTotal", { remaining: membership.remainingVisits, total: membership.totalVisits ?? "" })}</dd></div> : null}
        <div><dt className="text-ink-3">{t("common.label.type")}</dt><dd className="mt-0.5">{membership.previousMembershipId ? t("memberProfile.memberships.renewal") : t("memberProfile.memberships.firstMembership")}</dd></div>
      </dl>
      {membership.outstanding.amount > 0 ? <p className="text-[12.5px] font-medium text-warning-deep">{t("memberProfile.shared.owes")} <MoneyText money={membership.outstanding} /></p> : null}
      {membership.activeFreeze ? <p className="text-[12px] text-ink-3">{t("memberProfile.memberships.frozenUntilCap", { date: isolate(format.date(membership.activeFreeze.endDate)) })}</p> : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Personal training
// ---------------------------------------------------------------------------
export function PersonalTrainingTab({ membershipId, preselectTrainerId, openBookingOnMount }: { membershipId?: UUID; /** A trainer chosen elsewhere (the resolution workspace) is preselected; the person still picks branch, date and time. */ preselectTrainerId?: string; openBookingOnMount?: boolean }) {
  const { session } = useApp();
  const { can } = usePermissions();
  const { t, locale } = useLocale();
  const invalidate = useInvalidate();
  const [trainerId, setTrainerId] = useState(preselectTrainerId ?? "");
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(() => addDays(todayISODate(), 1));
  const [bookingOpen, setBookingOpen] = useState(false);
  const query = useRealtimeApiQuery({ queryKey: qk.ptMember(membershipId ?? "none"), query: (api) => api.getPtMemberExperience(membershipId!), subscribe: (api, onValue, onError) => api.subscribePtMemberExperience(membershipId!, onValue, onError), enabled: Boolean(membershipId) });
  const selectedTrainer = query.data?.trainers.find((item) => item.id === trainerId);
  // A "Book with" link from the resolution workspace opens the dialog only once
  // the record shows a usable credit; without one the page explains instead.
  const openRequested = Boolean(openBookingOnMount && preselectTrainerId);
  const availableSessions = query.data?.availableSessions;
  useEffect(() => {
    if (openRequested && availableSessions !== undefined && availableSessions > 0) setBookingOpen(true);
  }, [openRequested, availableSessions]);
  // Booking is a mutation. Do not silently book at the trainer's first
  // branch; the operator must choose a concrete branch for this session.
  const selectedBranch = visibleBranchId(session?.branches, branchId) ?? "";
  const slots = useApiQuery(["pt", "slots", trainerId, selectedBranch, date], (api) => api.listPtAvailableSlots({ trainerProfileId: trainerId, branchId: selectedBranch, from: date, to: date }), { enabled: Boolean(trainerId && selectedBranch && date) });
  const requestPackage = useApiMutation((api, packageId: string) => api.requestPtPackage({ membershipId: membershipId!, packageId, idempotencyKey: crypto.randomUUID() }), { onSuccess: async () => { toast.success(t("memberProfile.pt.packageAdded")); await invalidate(); } });
  const book = useApiMutation((api, startsAt: string) => api.createPtBooking({ membershipId: membershipId!, trainerProfileId: trainerId, branchId: selectedBranch, startsAt, idempotencyKey: crypto.randomUUID() }), { onSuccess: async () => { toast.success(t("memberProfile.pt.sessionBooked")); setBookingOpen(false); await invalidate(); } });

  if (!membershipId) return <EmptyState title={t("memberProfile.pt.noMembership")} description={t("memberProfile.pt.noMembershipDescription")} />;
  if (query.isLoading) return <Skeleton className="h-56 w-full" />;
  if (query.isError && !query.data) return <ErrorState title={t("memberProfile.pt.loadFailed")} onRetry={() => query.refetch()} />;
  const experience = query.data;
  if (!experience) return <Skeleton className="h-56 w-full" />;
  const nextBooking = ptNextBooking(experience.upcomingBookings);
  return <div className="space-y-4">
    {query.isBackgroundError ? <ErrorState layout="inline" title={t("memberProfile.pt.refreshFailed")} onRetry={() => query.refetch()} /> : null}
    <section className="grid border border-line bg-surface sm:grid-cols-3"><StatCell label={t("memberProfile.pt.availableSessions")} value={experience.availableSessions} /><StatCell label={t("memberProfile.pt.booked")} value={experience.reservedSessions} /><StatCell label={t("memberProfile.pt.nextBooking")} value={nextBooking ? <DateTimeText iso={nextBooking.startsAt} /> : "—"} /></section>
    <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <section className="panel p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><CalendarClock className="size-4 text-ink-3" /><div><h3 className="text-[13px] font-semibold">{t("memberProfile.pt.bookHeading")}</h3><p className="mt-1 text-[12px] text-ink-3">{t("memberProfile.pt.bookHint")}</p></div></div>{experience.availableSessions > 0 ? <Button size="sm" onClick={() => setBookingOpen(true)}><CalendarClock /> {t("memberProfile.pt.bookButton")}</Button> : null}</div>{experience.availableSessions <= 0 ? <p className="mt-4 border border-warning/25 bg-warning-bg p-3 text-[12px] text-warning-deep">{t("memberProfile.pt.noSessionsLeft")}</p> : null}</section>
      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("memberProfile.pt.dialogTitle")}</DialogTitle>
            <DialogDescription>{t("memberProfile.pt.dialogDescription")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-3">
            <label className="grid gap-1 text-[12px] font-medium">{t("memberProfile.pt.trainer")}<select aria-label={t("memberProfile.pt.trainer")} className="h-9 rounded-md border border-line-2 bg-surface px-3 text-[12px]" value={trainerId} onChange={(event) => { setTrainerId(event.target.value); setBranchId(""); }}><option value="">{t("memberProfile.pt.chooseTrainer")}</option>{experience.trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.displayName}</option>)}</select></label>
            {selectedTrainer ? <label className="grid gap-1 text-[12px] font-medium">{t("common.label.branch")}<select aria-label={t("common.label.branch")} className="h-9 rounded-md border border-line-2 bg-surface px-3 text-[12px]" value={visibleBranchId(session?.branches, selectedBranch) ?? ""} onChange={(event) => setBranchId(event.target.value)}><option value="">{t("memberProfile.pt.chooseBranch")}</option>{selectedTrainer.branchIds.filter((id) => visibleBranchId(session?.branches, id)).map((id) => <option key={id} value={id}>{session?.branches.find((branch) => branch.id === id)?.name ?? id}</option>)}</select></label> : null}
            <label className="grid gap-1 text-[12px] font-medium">{t("common.label.date")}<input aria-label={t("common.label.date")} dir="ltr" className="h-9 rounded-md border border-line-2 bg-surface px-3 text-[12px]" type="date" min={addDays(todayISODate(), 1)} value={date} onChange={(event) => setDate(event.target.value)} /></label>
            {trainerId && selectedBranch ? <div><p className="mb-2 text-[12px] font-medium">{t("memberProfile.pt.availableTimes")}</p>{(slots.isError || slots.isBackgroundError) ? <ErrorState layout="section" title={t("memberProfile.pt.slotsFailed")} onRetry={() => slots.refetch()} /> : slots.isLoading ? <p className="text-[12px] text-ink-3">{t("memberProfile.pt.loadingTimes")}</p> : slots.data?.length ? <div className="flex flex-wrap gap-2">{slots.data.map((slot) => <Button key={slot.startsAt} size="sm" variant="secondary" loading={book.isPending} onClick={() => book.mutate(slot.startsAt)}><span dir="auto">{new Intl.DateTimeFormat(locale === "ar" ? numberingLocale("ar") : "en-JO", { hour: "numeric", minute: "2-digit", timeZone: session?.organization.timezone ?? "Asia/Amman" }).format(new Date(slot.startsAt))}</span></Button>)}</div> : <p className="text-[12px] text-ink-3">{t("memberProfile.pt.noSlots")}</p>}</div> : <p className="text-[12px] text-ink-3">{t("memberProfile.pt.pickToSeeTimes")}</p>}
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => setBookingOpen(false)}>{t("common.action.cancel")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <section className="panel overflow-hidden"><header className="border-b border-line px-4 py-3"><div className="flex items-center gap-2"><Dumbbell className="size-4 text-ink-3" /><h3 className="text-[13px] font-semibold">{t("memberProfile.pt.packages")}</h3></div></header><div className="divide-y divide-line">{experience.packages.length ? experience.packages.map((item) => <article key={item.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[12px] font-semibold" dir="auto">{item.name}</p><p className="mt-1 text-[12px] text-ink-3">{t("memberProfile.pt.packageTerms", { sessions: item.sessionCount, days: item.validityDays })}</p><p className="mt-1 text-[12px]"><MoneyText money={item.totalPrice} /></p></div>{can("pt.book_for_member") ? <Button size="sm" variant="secondary" loading={requestPackage.isPending} onClick={() => requestPackage.mutate(item.id)}>{t("memberProfile.pt.addPackage")}</Button> : null}</div></article>) : <p className="p-5 text-[12px] text-ink-3">{t("memberProfile.pt.noPackages")}</p>}</div>{experience.orders.length ? <div className="border-t border-line p-4"><p className="context-label">{t("memberProfile.pt.recentPackages")}</p><div className="mt-2 space-y-1">{experience.orders.map((order) => <p key={order.id} className="flex justify-between gap-3 text-[12px]"><span className="text-ink-3" dir="auto">{order.packageName ?? order.packageNameSnapshot ?? t("memberProfile.pt.packageFallback")}</span><span>{t(`memberProfile.pt.orderStatus.${order.status}`)}</span></p>)}</div></div> : null}</section>
    </div>
    {experience.upcomingBookings.length ? <section className="panel overflow-hidden"><header className="border-b border-line px-4 py-3"><h3 className="text-[13px] font-semibold">{t("memberProfile.pt.upcoming")}</h3><p className="mt-0.5 text-[12px] text-ink-3">{t("memberProfile.pt.upcomingHint")}</p></header><div className="divide-y divide-line">{experience.upcomingBookings.map((booking) => { const awaiting = ptBookingAwaitsOutcome(booking); return <article key={booking.id} className="flex items-center justify-between gap-3 p-4"><div><p className="text-[12px] font-medium" dir="auto">{booking.trainerName}</p><p className="mt-1 text-[12px] text-ink-3"><DateTimeText iso={booking.startsAt} /> · <bdi>{booking.branchName}</bdi></p>{awaiting ? <p className="mt-1 text-[12px] text-warning-deep">{t("memberProfile.pt.awaitingResult")}</p> : null}</div><Badge variant={awaiting ? "warning" : "outline"}>{awaiting ? t("memberProfile.pt.needsResult") : t(`memberProfile.pt.bookingStatus.${booking.status}`)}</Badge></article>; })}</div></section> : null}
  </div>;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export function PaymentsTab({ memberId }: { memberId: UUID }) {
  const { t } = useLocale();
  const query = useApiQuery(qk.transactions({ memberId }), (api) =>
    api.listTransactions({ memberId, pageSize: 30 }),
  );

  if (query.isLoading) return <Skeleton className="h-48 w-full" />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return <EmptyState layout="section" title={t("memberProfile.payments.empty")} description={t("memberProfile.payments.emptyDescription")} />;
  }

  return (
    <div className="panel overflow-hidden">
      <ul className="divide-y divide-line lg:hidden" aria-label={t("memberProfile.payments.historyLabel")}>
        {items.map((transaction) => <PaymentRecordRow key={transaction.id} transaction={transaction} />)}
      </ul>
      <Table className="hidden lg:table">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("memberProfile.payments.receipt")}</TableHead>
            <TableHead>{t("memberProfile.payments.when")}</TableHead>
            <TableHead>{t("common.label.type")}</TableHead>
            <TableHead>{t("memberProfile.payments.method")}</TableHead>
            <TableHead className="text-end">{t("common.label.amount")}</TableHead>
            <TableHead>{t("common.label.status")}</TableHead>
            <TableHead>{t("memberProfile.payments.collectedBy")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <Link
                  href={receiptHref(p.receiptId)}
                  dir="ltr"
                  className="font-mono text-[12px] underline decoration-line-3 underline-offset-2 hover:text-ink"
                >
                  {p.receiptNumber}
                </Link>
              </TableCell>
              <TableCell className="whitespace-nowrap text-[12.5px] text-ink-2">
                <DateTimeText iso={p.occurredAt} />
              </TableCell>
              <TableCell className="text-[12.5px]">{transactionTypeLabel(t, p.type)}</TableCell>
              <TableCell className="text-[12.5px]">{paymentMethodLabel(t, p.method)}</TableCell>
              <TableCell className="text-end">
                <MoneyText money={p.amount} />
              </TableCell>
              <TableCell>
                <TransactionStatusChip status={p.status} />
              </TableCell>
              <TableCell className="text-[12.5px] text-ink-2"><bdi>{p.collectedByName}</bdi></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PaymentRecordRow({ transaction }: { transaction: TransactionSummary }) {
  const { t, isolate } = useLocale();
  return (
    <li className="space-y-3 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13.5px] font-semibold text-ink">{transactionTypeLabel(t, transaction.type)}</p>
          <p className="mt-0.5 text-[12px] text-ink-3"><DateTimeText iso={transaction.occurredAt} /></p>
        </div>
        <MoneyText money={transaction.amount} className="text-[13.5px] font-semibold" />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3 text-[12.5px] text-ink-2">
        <TransactionStatusChip status={transaction.status} />
        <span>{paymentMethodLabel(t, transaction.method)}</span>
        <span>{t("memberProfile.payments.collectedByName", { name: isolate(transaction.collectedByName) })}</span>
        <Link href={receiptHref(transaction.receiptId)} dir="ltr" className="ms-auto font-mono text-[12px] font-medium underline decoration-line-3 underline-offset-2 hover:text-ink">{transaction.receiptNumber}</Link>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------
/** Reason codes come from the server as identifiers; known ones get words, new ones show as before. */
function checkInReasonText(t: TFunction, codes: readonly string[]): string {
  return codes
    .map((code) => (code in en.memberProfile.checkIns.reason ? t(`memberProfile.checkIns.reason.${code}` as TKey) : code.toLowerCase().replace(/_/g, " ")))
    .join(t("memberProfile.checkIns.reasonSeparator"));
}

export function CheckInsTab({ memberId }: { memberId: UUID }) {
  const { t } = useLocale();
  const [page, setPage] = useState(1);
  const query = useApiQuery(qk.checkIns({ memberId, page }), (api) =>
    api.listRecentCheckIns({ memberId, page, pageSize: 20 }),
  );

  if (query.isLoading) return <Skeleton className="h-48 w-full" />;
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />;
  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return <EmptyState layout="section" title={t("memberProfile.checkIns.empty")} description={t("memberProfile.checkIns.emptyDescription")} />;
  }

  return (
    <div>
      <div className="panel overflow-hidden">
        <ul className="divide-y divide-line md:hidden" aria-label={t("memberProfile.checkIns.historyLabel")}>
          {items.map((checkIn) => <CheckInRecordRow key={checkIn.id} checkIn={checkIn} />)}
        </ul>
        <Table className="hidden md:table">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("memberProfile.checkIns.when")}</TableHead>
              <TableHead>{t("common.label.branch")}</TableHead>
              <TableHead>{t("memberProfile.checkIns.result")}</TableHead>
              <TableHead>{t("common.label.details")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="whitespace-nowrap text-[12.5px]">
                  <DateTimeText iso={c.occurredAt} />
                </TableCell>
                <TableCell className="text-[12.5px] text-ink-2"><bdi>{c.branchName}</bdi></TableCell>
                <TableCell>
                  <CheckInDecisionChip decision={c.decision} />
                </TableCell>
                <TableCell className="text-[12px] text-ink-3" dir="auto">
                  {c.overrideReason ?? (c.reasonCodes.includes("OK") ? "—" : checkInReasonText(t, c.reasonCodes))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {query.data ? <DataPagination page={query.data} onPage={setPage} /> : null}
    </div>
  );
}

function CheckInRecordRow({ checkIn }: { checkIn: CheckInSummary }) {
  const { t } = useLocale();
  const detail = checkIn.overrideReason ?? (checkIn.reasonCodes.includes("OK") ? null : checkInReasonText(t, checkIn.reasonCodes));
  return (
    <li className="space-y-2.5 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[13px] font-medium text-ink" dir="auto">{checkIn.branchName}</p><p className="mt-0.5 text-[12px] text-ink-3"><DateTimeText iso={checkIn.occurredAt} /></p></div>
        <CheckInDecisionChip decision={checkIn.decision} />
      </div>
      {detail ? <p className="border-s-2 border-line-2 ps-3 text-[12px] leading-relaxed text-ink-2" dir="auto">{detail}</p> : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
/** Tasks that stand for a conversation with the member: "Done" asks what happened, as Today does. */
const CONTACT_TASK_TYPES = new Set<Task["type"]>(["follow_up", "renewal_call", "trial_follow_up"]);

export function MemberTasksPanel({ memberId }: { memberId: UUID }) {
  const { t, isolate } = useLocale();
  const invalidate = useInvalidate();
  const query = useApiQuery(qk.tasks({ memberId, open: true }), (api) =>
    api.listTasks({ status: "open", memberId, pageSize: 10 }),
  );
  const [logging, setLogging] = useState<Task>();
  const complete = useApiMutation((api, taskId: string) => api.completeTask(taskId, { outcome: "Completed from member page" }), {
    onSuccess: async () => {
      toast.success(t("memberProfile.tasks.completed"));
      setLogging(undefined);
      await invalidate();
    },
  });
  const requestComplete = (task: Task) => {
    if (CONTACT_TASK_TYPES.has(task.type)) setLogging(task);
    else complete.mutate(task.id);
  };

  const tasks = (query.data?.items ?? []).filter((task) => task.memberId === memberId);
  if (query.isLoading) return <Skeleton className="h-20 w-full" />;
  if (query.isError) return <ErrorState layout="inline" title={t("memberProfile.tasks.loadFailed")} description={t("memberProfile.tasks.loadFailedDescription")} onRetry={() => query.refetch()} />;
  if (tasks.length === 0) return <p className="text-[12.5px] text-ink-3">{t("memberProfile.tasks.empty")}</p>;

  return (
    <>
    <ul className="space-y-2">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-start gap-2 text-[12.5px]">
          <button
            type="button"
            aria-label={t("memberProfile.tasks.completeAria", { title: isolate(task.title) })}
            disabled={complete.isPending}
            onClick={() => requestComplete(task)}
            className="mt-0.5 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line-3 text-transparent hover:border-success hover:text-success focus-visible:border-success focus-visible:text-success"
          >
            <CheckCircle2 className="size-3.5" />
          </button>
          <div className="min-w-0">
            <p className="font-medium leading-snug" dir="auto">{task.title}</p>
            {task.relatedTaskTitle ? <p className="text-[12px] text-ink-3">{t("memberProfile.tasks.nextStepAfter", { title: isolate(task.relatedTaskTitle) })}</p> : null}
            <p className="text-[12px] text-ink-3">
              <bdi>{task.ownerName}</bdi> · <RelativeText iso={task.dueAt} />
            </p>
          </div>
        </li>
      ))}
    </ul>
      <Dialog open={Boolean(logging)} onOpenChange={(open) => { if (!open) setLogging(undefined); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("memberProfile.contact.whatHappened")}</DialogTitle>
            <DialogDescription>{logging ? t("memberProfile.tasks.dialogDescription", { title: isolate(logging.title) }) : ""}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <LogContactForm subject="member" memberId={memberId} submitLabel={t("memberProfile.tasks.saveAndFinish")} onLogged={() => setLogging(undefined)} />
          </DialogBody>
          <DialogFooter className="justify-between">
            <Button type="button" variant="ghost" size="sm" loading={complete.isPending} onClick={() => { if (logging) complete.mutate(logging.id); }}>
              {t("memberProfile.tasks.doneNothing")}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setLogging(undefined)}>{t("common.action.cancel")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Details panel
// ---------------------------------------------------------------------------
export function MemberDetailsPanel({ member, branchName, salespersonName }: { member: MemberDetail; branchName: string; salespersonName?: string }) {
  const { t } = useLocale();
  const marketingSource = member.marketingPreference
    ? Object.prototype.hasOwnProperty.call(en.memberProfile.details.marketingSource, member.marketingPreference.source)
      ? t(`memberProfile.details.marketingSource.${member.marketingPreference.source}` as TKey)
      : member.marketingPreference.source.replaceAll("_", " ")
    : undefined;
  const gender = member.gender === "female" ? t("memberProfile.details.female") : member.gender === "male" ? t("memberProfile.details.male") : member.gender ?? "—";
  const foundUs = member.source
    ? (() => {
        const label = leadSourceLabel(t, member.source);
        return label === member.source ? member.source.replace(/_/g, " ") : label;
      })()
    : "—";
  const rows: Array<[string, React.ReactNode]> = [
    [t("common.label.phone"), <span key="p" dir="ltr" className="text-[12.5px]">{member.phone}</span>],
    [t("common.label.email"), member.email ? <bdi dir="ltr">{member.email}</bdi> : "—"],
    [t("memberProfile.edit.homeBranch"), <bdi key="b">{branchName}</bdi>],
    [t("memberProfile.edit.preferredLanguage"), member.preferredLanguage === "ar" ? t("common.language.arabic") : t("common.language.english")],
    [t("memberProfile.details.gender"), gender],
    [t("memberProfile.details.dateOfBirth"), member.dateOfBirth ? <DateText key="dob" iso={member.dateOfBirth} /> : "—"],
    [t("memberProfile.details.address"), member.addressLine1 ? <bdi key="a">{`${member.addressLine1}${member.city ? ` · ${member.city}` : ""}`}</bdi> : "—"],
    [t("memberProfile.edit.emergencyContact"), member.emergencyContactName ? (
      <span key="e">
        <bdi>{member.emergencyContactName}</bdi>
        {member.emergencyContactRelationship ? <> · <bdi>{member.emergencyContactRelationship}</bdi></> : null}
        {member.emergencyContactPhone ? <> · <bdi dir="ltr">{member.emergencyContactPhone}</bdi></> : null}
      </span>
    ) : "—"],
    [t("memberProfile.details.foundUs"), foundUs],
    [t("memberProfile.details.salesperson"), salespersonName !== undefined ? <bdi key="s">{salespersonName}</bdi> : t("memberProfile.details.notAssigned")],
    [t("memberProfile.edit.marketing"), <span key="marketing">{member.marketingPreference?.status === "unknown" || !member.marketingPreference ? t("memberProfile.details.marketingUnknown") : member.marketingOptIn ? t("memberProfile.details.marketingAgreed") : t("memberProfile.details.marketingDeclined")}{marketingSource ? <span className="ms-1 text-ink-3">· {marketingSource}</span> : null}</span>],
    [t("memberProfile.details.memberSince"), <DateText key="c" iso={member.createdAt} />],
  ];
  return (
    <dl className="space-y-2.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 text-[12.5px]">
          <dt className="shrink-0 text-ink-3">{label}</dt>
          <dd className="min-w-0 break-words text-end text-ink">{value}</dd>
        </div>
      ))}
      {member.sensitiveNotes ? (
        <div className="mt-3 rounded-md border border-warning/40 bg-warning-bg/50 p-3">
          <p className="context-label mb-1 text-warning-deep">{t("memberProfile.details.privateNote")}</p>
          <p className="text-[12.5px] text-ink-2" dir="auto">{member.sensitiveNotes}</p>
        </div>
      ) : null}
      {member.notes ? (
        <div className="mt-3 rounded-md border border-line bg-sunken/40 p-3">
          <p className="context-label mb-1">{t("memberProfile.edit.staffNotes")}</p>
          <p className="text-[12.5px] text-ink-2" dir="auto">{member.notes}</p>
        </div>
      ) : null}
    </dl>
  );
}
