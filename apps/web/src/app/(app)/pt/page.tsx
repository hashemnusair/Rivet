"use client";
import { useLocale, useT } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";
import { latinDigits } from "@/lib/utils/text";
import { useMoneyProblemText } from "@/features/membership-actions/renew-flow-format";

/* eslint-disable @next/next/no-img-element -- Convex file URLs are runtime-scoped and cannot be declared as static Next image hosts. */

import { CalendarClock, CheckCircle2, Clock3, Dumbbell, Pencil, Plus, Trash2, UserRound, WalletCards, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/chrome";
import { MoneyText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, QueryErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/misc";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { qk } from "@/lib/api/keys";
import type { PtAvailabilityException, PtPackage, PtBooking, PtTrainerProfile, PtPackageOrder, StaffUser, WeekdayKey } from "@/lib/domain/types";
import { PT_PACKAGE_PRICE_GUIDE, PT_PACKAGE_PRICE_GUIDE_CURRENCY, ptBookingAwaitsOutcome, ptBookingIsOpen, ptPackageSuggestedPriceMinor, ptPackageUnitPriceMinor, ptTrainerSetupState } from "@/lib/domain/personal-training";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { visibleBranchId } from "@/lib/domain/branch-scope";
import { exponentFor, money, readMoneyInput, toMajorString } from "@/lib/utils/money";
import { BookingOutcomeConfirmation } from "@/features/personal-training/booking-outcome-confirmation";
import { TrainerSetupNotice } from "@/features/personal-training/trainer-setup-notice";
import Link from "next/link";
import { CollectPaymentDialog } from "@/features/membership-actions/payment-dialog";

const WEEKDAYS = [
  { key: "sun", label: "sunday" }, { key: "mon", label: "monday" }, { key: "tue", label: "tuesday" },
  { key: "wed", label: "wednesday" }, { key: "thu", label: "thursday" }, { key: "fri", label: "friday" }, { key: "sat", label: "saturday" },
] as const;

/** Native number inputs discard Arabic digits before React can normalize them. */
function validWholeCount(value: string, maximum: number): boolean {
  const normalized = latinDigits(value);
  const number = Number(normalized);
  return /^\d+$/.test(normalized) && Number.isSafeInteger(number) && number >= 1 && number <= maximum;
}

export default function PersonalTrainingPage() {
  const { t, locale, isolate } = useLocale();
  const f = useFormat();
  const { session } = useApp();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const [bookOpen, setBookOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const settledMemberSearch = useDebouncedValue(memberSearch, 250);
  const bookingMembers = useApiQuery(qk.members({ search: settledMemberSearch, pageSize: 8 }), (api) => api.listMembers({ search: settledMemberSearch, pageSize: 8 }), { enabled: bookOpen && settledMemberSearch.trim().length >= 2 });
  const [packageOpen, setPackageOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<PtPackage>();
  const [deletePackage, setDeletePackage] = useState<PtPackage>();
  const [paymentOrder, setPaymentOrder] = useState<PtPackageOrder>();
  const [cancelOrder, setCancelOrder] = useState<PtPackageOrder>();
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [editingTrainer, setEditingTrainer] = useState<PtTrainerProfile>();
  const [availabilityTrainer, setAvailabilityTrainer] = useState<PtTrainerProfile>();
  const [bookingAction, setBookingAction] = useState<{ booking: PtBooking; action: "completed" | "no_show" | "cancelled" }>();
  const paymentMember = useApiQuery(qk.member(paymentOrder?.memberId ?? ""), (api) => api.getMember(paymentOrder!.memberId), { enabled: Boolean(paymentOrder) });
  const workspace = useRealtimeApiQuery({ queryKey: qk.ptWorkspace, query: (api) => api.getPtWorkspace(), subscribe: (api, onValue, onError) => api.subscribePtWorkspace(onValue, onError) });
  const trainerUsers = useApiQuery(qk.users({ role: "trainer" }), (api) => api.listUsers({ role: "trainer", pageSize: 100 }), { enabled: can("pt.manage") });
  const finish = useApiMutation((api, input: { booking: PtBooking; outcome: "completed" | "no_show"; reason?: string }) => input.outcome === "completed" ? api.completePtBooking(input.booking.id) : api.markPtBookingNoShow(input.booking.id, { reason: input.reason }), { onSuccess: async (_, input) => { await invalidate(); setBookingAction(undefined); toast.success(input.outcome === "completed" ? t("ptWorkspace.completedToast") : t("ptWorkspace.noShowToast")); } });
  // The server decides what the cancellation did to the credit; the toast
  // repeats its answer instead of assuming.
  const cancel = useApiMutation((api, input: { booking: PtBooking; reason: string; cancelledByGym: boolean }) => api.cancelPtBooking(input.booking.id, { reason: input.reason, cancelledByGym: input.cancelledByGym }), { onSuccess: async (result) => { await invalidate(); setBookingAction(undefined); toast.success(result.status === "late_cancelled" ? t("ptWorkspace.lateToast") : result.status === "gym_cancelled" ? t("ptWorkspace.gymCancelledToast") : t("ptWorkspace.cancelledToast")); } });

  if (workspace.isError && !workspace.data) return <QueryErrorState error={workspace.error} onRetry={() => workspace.refetch()} />;
  const data = workspace.data;
  const now = Date.now();
  const openBookings = (data?.bookings ?? []).filter(ptBookingIsOpen);
  // A session that started without an outcome still holds the member's credit
  // and must stay in front of whoever can record it; it is never "upcoming".
  const awaitingOutcome = openBookings.filter((booking) => ptBookingAwaitsOutcome(booking, now));
  const upcomingBookings = openBookings.filter((booking) => !ptBookingAwaitsOutcome(booking, now));
  const canRecordOutcome = can("pt.outcome.self") || can("pt.manage");
  // The server lets a trainer cancel their own session (the credit comes back
  // as a gym cancellation); everyone else needs the member-booking permission.
  const ownSetup = ptTrainerSetupState(data?.trainers ?? [], session?.user.id);
  const ownTrainerId = ownSetup.kind === "no_profile" ? undefined : ownSetup.profile.id;
  const canCancelBooking = (booking: PtBooking) => can("pt.book_for_member") || can("pt.manage") || (can("pt.outcome.self") && booking.trainerProfileId === ownTrainerId);
  const canBook = can("pt.book_for_member") || can("pt.manage");
  // Convex returns no packages or orders to a role without PT reports access,
  // so those panels would only ever show an empty state for it.
  const canSeeCatalogue = can("pt.reports.read") || can("pt.manage");
  const trainerOnly = !canSeeCatalogue && can("pt.schedule.self");
  const renderBooking = (booking: PtBooking, started: boolean) => <article key={booking.id} className="flex flex-wrap items-center gap-4 p-4" data-testid="pt-booking-row">
    <div className="min-w-0 flex-1"><p className="text-[13px] font-semibold">{booking.memberName} <span className="font-normal text-ink-3">{t("ptWorkspace.withTrainer", { name: isolate(booking.trainerName) })}</span></p><p className="mt-1 text-[12px] text-ink-3"><span dir="ltr">{f.dateTime(booking.startsAt)}</span> · {booking.branchName}</p>{!started && canRecordOutcome ? <p className="mt-1 text-[12px] text-ink-3">{t("ptWorkspace.markAfterStart")}</p> : null}</div>
    <Badge variant={started ? "warning" : "outline"}>{started ? t("ptWorkspace.needsMarking") : t(`memberProfile.pt.bookingStatus.${booking.status}`)}</Badge>
    <div className="flex gap-1">{canRecordOutcome && started ? <><Button size="sm" variant="secondary" disabled={finish.isPending} onClick={() => setBookingAction({ booking, action: "completed" })}><CheckCircle2 />{" "}{t("dashboard.trainer.complete")}</Button><Button size="sm" variant="ghost" disabled={finish.isPending} onClick={() => setBookingAction({ booking, action: "no_show" })}><XCircle />{" "}{t("memberProfile.pt.bookingStatus.no_show")}</Button></> : null}{canCancelBooking(booking) ? <Button size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => setBookingAction({ booking, action: "cancelled" })}>{t("common.action.cancel")}</Button> : null}</div>
  </article>;

  return <div className="space-y-5">
    <PageHeader title={t("palette.notificationGroups.family.pt")} description={trainerOnly ? t("ptWorkspace.trainerHint") : t("ptWorkspace.workspaceHint")} actions={<div className="flex flex-wrap gap-2">{can("pt.manage") ? <><Button variant="secondary" onClick={() => { setEditingTrainer(undefined); setTrainerOpen(true); }}><UserRound /> {" "}{t("ptWorkspace.addTrainer")}</Button><Button variant="secondary" onClick={() => { setEditingPackage(undefined); setPackageOpen(true); }}><Plus />{" "}{t("memberProfile.pt.addPackage")}</Button></> : null}{canBook ? <Button onClick={() => setBookOpen(true)}><CalendarClock />{" "}{t("memberProfile.pt.bookButton")}</Button> : null}</div>} />

    {workspace.isBackgroundError ? <ErrorState layout="inline" title={t("ptWorkspace.refreshFailed")} onRetry={() => workspace.refetch()} /> : null}
    {data && trainerOnly ? <TrainerSetupNotice state={ownSetup} onSetAvailability={(state) => setAvailabilityTrainer(state.profile)} /> : null}
    <section className={`grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface ${can("pt.manage") ? "sm:grid-cols-3 xl:grid-cols-5" : "sm:grid-cols-4"}`}>
      {can("pt.manage") ? <Metric label={t("ptWorkspace.packageRevenue")} value={data ? <MoneyText money={data.metrics.packageRevenue} /> : "…"} /> : null}
      <Metric label={t("ptWorkspace.sessionsUsed")} value={data?.metrics.sessionsUsed ?? "…"} />
      <Metric label={t("ptWorkspace.creditsHeld")} value={data?.metrics.sessionsReserved ?? "…"} />
      <Metric label={t("dashboard.trainer.upcoming")} value={data?.metrics.upcomingBookings ?? "…"} />
      <Metric label={t("dashboard.trainer.noShows")} value={data?.metrics.noShows ?? "…"} />
    </section>

    <section className={`grid gap-5 ${can("payments.collect") && canSeeCatalogue ? "xl:grid-cols-2" : ""}`}>
      <div className="panel overflow-hidden">
        {awaitingOutcome.length ? <section aria-labelledby="pt-awaiting-title">
          <header className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 id="pt-awaiting-title" className="mt-1 text-[15px] font-semibold">{canRecordOutcome ? t("ptWorkspace.markSessions") : t("ptWorkspace.notMarked")}</h2><p className="mt-1 text-[12px] text-ink-2">{t("ptWorkspace.notMarkedHint")}</p></div><Badge variant="warning">{awaitingOutcome.length}</Badge></header>
          <div className="divide-y divide-line border-b border-line">{awaitingOutcome.map((booking) => renderBooking(booking, true))}</div>
        </section> : null}
        <header className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="mt-1 text-[15px] font-semibold">{t("ptWorkspace.upcoming")}</h2></div><CalendarClock className="size-5 text-ink-3" /></header>
        {!data ? <Skeleton className="m-4 h-32" /> : upcomingBookings.length === 0 ? <EmptyState layout="section" className="m-4" title={t("ptWorkspace.noUpcoming")} description={canBook ? t("ptWorkspace.noUpcomingBookHint") : t("ptWorkspace.noUpcomingTrainerHint")} /> : <div className="divide-y divide-line">{upcomingBookings.map((booking) => renderBooking(booking, false))}</div>}
      </div>

      {can("payments.collect") && canSeeCatalogue ? <div className="panel overflow-hidden">
        <header className="border-b border-line px-5 py-4"><h2 className="mt-1 text-[15px] font-semibold">{t("ptWorkspace.unpaidOrders")}</h2></header>
        {!data ? <Skeleton className="m-4 h-32" /> : data.pendingOrders.length === 0 ? <EmptyState layout="section" className="m-4" title={t("ptWorkspace.noUnpaidOrders")} description={t("ptWorkspace.noUnpaidHint")} /> : <div className="divide-y divide-line">{data.pendingOrders.map((order) => <article key={order.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[13px] font-medium">{order.packageName ?? data.packages.find((pkg) => pkg.id === order.packageId)?.name ?? t("ptWorkspace.packageFallback")}</p><p className="mt-1 text-[12px] text-ink-3"><Link className="font-medium text-ink hover:underline" href={`/members/${order.memberId}`}>{order.memberName ?? t("ptWorkspace.openMember")}</Link> · {order.paymentReference ?? t("ptWorkspace.paymentRequest")}</p></div><Badge variant="warning">{t("domain.paymentStatus.unpaid")}</Badge></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => setPaymentOrder(order)}><WalletCards />{" "}{t("renewFlow.payment.collectPlain")}</Button>{can("pt.refund") ? <Button size="sm" variant="ghost" onClick={() => setCancelOrder(order)}>{t("ptWorkspace.cancelOrder")}</Button> : null}</div></article>)}</div>}
      </div> : null}
    </section>

    <section className={`grid gap-5 ${canSeeCatalogue ? "lg:grid-cols-2" : ""}`}>
      <div className="panel overflow-hidden"><header className="border-b border-line px-5 py-4"><h2 className="mt-1 text-[15px] font-semibold">{trainerOnly ? t("ptWorkspace.ownProfile") : t("ptWorkspace.profiles")}</h2></header><div className="divide-y divide-line">{data?.trainers.length ? data.trainers.map((trainer) => <article key={trainer.id} className="p-4"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 gap-3">{trainer.photoUrl ? <img src={trainer.photoUrl} alt={trainer.photoAlt ?? trainer.displayName} className="size-12 rounded-md object-cover" /> : <span className="flex size-12 items-center justify-center rounded-md bg-sunken"><UserRound className="size-5" /></span>}<div><p className="text-[13px] font-semibold">{trainer.displayName}</p><p className="mt-1 text-[12px] text-ink-3">{trainer.specialties.length ? trainer.specialties.join(" · ") : t("ptWorkspace.noSpecialties")}</p><p className="mt-2 text-[12px] text-ink-2">{(locale === "ar" ? trainer.bioAr || trainer.bioEn : trainer.bioEn) || t("ptWorkspace.noBio")}</p></div></div><Badge variant={trainer.status === "published" ? "success" : "outline"}>{trainer.status === "published" ? t("ptWorkspace.published") : trainer.status === "draft" ? t("ptWorkspace.draft") : t("members.list.archived")}</Badge></div>{can("pt.manage") || trainer.userId === session?.user.id ? <div className="mt-3 flex gap-2"><Button size="sm" variant="secondary" onClick={() => setAvailabilityTrainer(trainer)}><Clock3 /> {" "}{t("ptWorkspace.availability")}</Button>{can("pt.manage") ? <Button size="sm" variant="ghost" onClick={() => { setEditingTrainer(trainer); setTrainerOpen(true); }}><Pencil /> {" "}{t("ptWorkspace.editProfile")}</Button> : null}</div> : null}</article>) : !data ? <Skeleton className="m-4 h-28" /> : <EmptyState layout="section" className="m-4" title={trainerOnly ? t("ptWorkspace.noLinkedProfile") : t("ptWorkspace.noProfiles")} description={trainerOnly ? t("ptWorkspace.askProfile") : t("ptWorkspace.addProfileHint")} />}</div></div>
      {canSeeCatalogue ? <div className="panel overflow-hidden"><header className="border-b border-line px-5 py-4"><h2 className="mt-1 text-[15px] font-semibold">{t("memberProfile.pt.packages")}</h2></header><div className="divide-y divide-line">{data?.packages.length ? data.packages.map((pkg) => { const unitPriceMinor = ptPackageUnitPriceMinor(pkg.totalPrice.amount, pkg.sessionCount); return <article key={pkg.id} className="flex flex-wrap items-center gap-3 p-4"><div className="flex size-10 items-center justify-center rounded-md bg-sunken"><Dumbbell className="size-4" /></div><div className="min-w-40 flex-1"><p className="break-words text-[13px] font-semibold">{pkg.name}</p><p className="mt-1 text-[12px] text-ink-3">{t("ptWorkspace.sessionCount", { count: pkg.sessionCount })} · {t("ptWorkspace.validityCount", { count: pkg.validityDays })} · <MoneyText money={pkg.totalPrice} /></p><p className="mt-1 text-[12px] font-medium text-ink-2">{unitPriceMinor ? <><MoneyText money={{ amount: unitPriceMinor, currency: pkg.totalPrice.currency }} /> {" "}{t("ptWorkspace.perSession")}</> : t("ptWorkspace.rateUnavailable")}</p></div><Badge variant={pkg.status === "active" ? "success" : "outline"}>{pkg.status === "active" ? t("renewFlow.adjust.membershipStatus.active") : t("members.list.archived")}</Badge>{can("pt.manage") ? <div className="flex shrink-0 flex-wrap gap-1"><Button size="sm" variant="ghost" aria-label={t("ptWorkspace.editNamed", { name: pkg.name })} onClick={() => { setEditingPackage(pkg); setPackageOpen(true); }}><Pencil />{" "}{t("common.action.edit")}</Button><Button size="sm" variant="ghost" aria-label={t("ptWorkspace.deleteNamed", { name: pkg.name })} onClick={() => setDeletePackage(pkg)}><Trash2 />{" "}{t("common.action.delete")}</Button></div> : null}</article>; }) : !data ? <Skeleton className="m-4 h-28" /> : <EmptyState layout="section" className="m-4" title={t("ptWorkspace.noPackages")} description={t("ptWorkspace.addPackageHint")} />}</div></div> : null}
    </section>

    <Dialog open={bookOpen} onOpenChange={setBookOpen}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{t("memberProfile.pt.dialogTitle")}</DialogTitle><DialogDescription>{t("ptWorkspace.findHint")}</DialogDescription></DialogHeader><DialogBody className="space-y-3"><Field label={t("ptWorkspace.findMember")}><Input autoFocus value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder={t("ptWorkspace.memberSearch")} /></Field>{settledMemberSearch.trim().length < 2 ? <p className="text-[13px] text-ink-2">{t("ptWorkspace.searchMinimum")}</p> : bookingMembers.isLoading ? <Skeleton className="h-32" /> : bookingMembers.isError ? <ErrorState layout="section" title={t("ptWorkspace.membersFailed")} onRetry={() => bookingMembers.refetch()} /> : bookingMembers.data?.items.length ? <ul className="divide-y divide-line">{bookingMembers.data.items.map((member) => <li key={member.id}><Link className="flex min-h-11 items-center justify-between gap-3 py-3 text-[13px] hover:bg-sunken" href={`/members/${member.id}?tab=pt`}><span className="font-medium break-words">{member.fullName}</span><span className="text-[12px] text-ink-2">{t("ptWorkspace.openPt")}</span></Link></li>)}</ul> : <EmptyState layout="section" title={t("members.list.noMatch")} description={t("ptWorkspace.trySearch")} />}</DialogBody><DialogFooter><Button variant="secondary" onClick={() => setBookOpen(false)}>{t("common.action.close")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(paymentOrder) && !paymentMember.data} onOpenChange={(open) => { if (!open) setPaymentOrder(undefined); }}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{t("ptWorkspace.collectPayment")}</DialogTitle><DialogDescription>{t("ptWorkspace.paymentLoading")}</DialogDescription></DialogHeader><DialogBody>{paymentMember.isError ? <ErrorState layout="section" title={t("ptWorkspace.paymentFailed")} onRetry={() => paymentMember.refetch()} /> : <Skeleton className="h-32" />}</DialogBody><DialogFooter><Button variant="secondary" onClick={() => setPaymentOrder(undefined)}>{t("common.action.cancel")}</Button></DialogFooter></DialogContent></Dialog>
    <PackageDialog open={packageOpen} onOpenChange={setPackageOpen} package={editingPackage} />
    <TrainerDialog open={trainerOpen} onOpenChange={setTrainerOpen} users={trainerUsers.data?.items ?? []} trainer={editingTrainer} />
    <AvailabilityDialog trainer={availabilityTrainer} onOpenChange={(open) => { if (!open) setAvailabilityTrainer(undefined); }} />
    <BookingOutcomeConfirmation booking={bookingAction?.booking} action={bookingAction?.action} open={Boolean(bookingAction)} pending={finish.isPending || cancel.isPending} cancelledByGym={bookingAction?.action === "cancelled"} cutoffHours={data?.cancellationCutoffHours} allowCancellationChoice onOpenChange={(open) => { if (!open) setBookingAction(undefined); }} onConfirm={({ booking, action, reason, cancelledByGym }) => { if (action === "cancelled") cancel.mutate({ booking, reason: reason ?? "", cancelledByGym }); else finish.mutate({ booking, outcome: action, reason }); }} />
    {paymentOrder && paymentMember.data ? <CollectPaymentDialog open member={paymentMember.data} initialChargeId={paymentOrder.chargeId} onOpenChange={(open) => { if (!open) setPaymentOrder(undefined); }} /> : null}
    <CancelPtOrderDialog order={cancelOrder} onOpenChange={(open) => { if (!open) setCancelOrder(undefined); }} />
    <DeletePtPackageDialog package={deletePackage} onOpenChange={(open) => { if (!open) setDeletePackage(undefined); }} />
  </div>;
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) { return <div className="min-w-0 border-b border-line p-3 sm:p-4 xl:border-b-0 xl:border-e xl:last:border-e-0"><p className="context-label">{label}</p><div className="mt-1 text-[20px] font-semibold tabular-nums">{value}</div></div>; }

function PackageDialog({ open, onOpenChange, package: editing }: { open: boolean; onOpenChange: (open: boolean) => void; package?: PtPackage }) {
  const { t, isolateLtr } = useLocale();
  const problemText = useMoneyProblemText();
  const { session } = useApp();
  const invalidate = useInvalidate();
  // The gym's currency owns every amount in this dialog. The reference ladder
  // is denominated in JOD and stays labelled that way: a USD gym sees the JOD
  // guide for orientation, but nothing is converted or prefilled from it.
  const currency = editing?.totalPrice.currency ?? session?.organization.currency ?? "JOD";
  const guideApplies = currency === PT_PACKAGE_PRICE_GUIDE_CURRENCY;
  const [sessions, setSessions] = useState("12"); const [name, setName] = useState(""); const [generatedNameCount, setGeneratedNameCount] = useState(12); const [price, setPrice] = useState(""); const [validity, setValidity] = useState("90"); const [branchAccess, setBranchAccess] = useState<"all" | "selected">("all"); const [branchIds, setBranchIds] = useState<string[]>([]); const [status, setStatus] = useState<"active" | "archived">("active"); const [priceTouched, setPriceTouched] = useState(false); const [nameTouched, setNameTouched] = useState(false); const [priceBlurred, setPriceBlurred] = useState(false); const [submitted, setSubmitted] = useState(false);
  const guidePrice = (count: number): string => { const suggested = guideApplies ? ptPackageSuggestedPriceMinor(count) : undefined; return suggested ? toMajorString(money(suggested, currency)) : ""; };
  useEffect(() => {
    if (!open) return;
    const defaultSessions = editing?.sessionCount ?? 12;
    setSessions(String(defaultSessions)); setName(editing?.name ?? ""); setGeneratedNameCount(defaultSessions); setPrice(editing ? toMajorString(editing.totalPrice) : guidePrice(defaultSessions)); setValidity(String(editing?.validityDays ?? 90)); setBranchAccess(editing?.branchAccess ?? "all"); setBranchIds(editing?.branchIds ?? []); setStatus(editing?.status ?? "active"); setPriceTouched(Boolean(editing)); setNameTouched(Boolean(editing)); setPriceBlurred(false); setSubmitted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens or targets another package
  }, [open, editing]);
  const sessionCount = Number(latinDigits(sessions));
  const packageName = nameTouched ? name : t("ptWorkspace.defaultPackageName", { count: generatedNameCount });
  const sessionsValid = validWholeCount(sessions, 1000);
  const validityValid = validWholeCount(validity, 730);
  const priceRead = readMoneyInput(price, currency);
  // A malformed amount is named as soon as the operator leaves the field or
  // tries to save; the draft itself is never cleared or reinterpreted.
  const priceProblem = !priceRead.ok && priceRead.problem !== "empty" && (priceBlurred || submitted) ? problemText(priceRead, currency) : !priceRead.ok && priceRead.problem === "empty" && submitted ? problemText(priceRead, currency) : priceRead.ok && priceRead.money.amount <= 0 && (priceBlurred || submitted) ? t("ptWorkspace.positivePrice") : undefined;
  const enteredPrice = priceRead.ok && priceRead.money.amount > 0 ? priceRead.money : undefined;
  const save = useApiMutation((api) => api.upsertPtPackage({ id: editing?.id, name: packageName.trim(), sessionCount, totalPrice: enteredPrice ?? money(0, currency), validityDays: Number(latinDigits(validity)), branchAccess, branchIds: branchAccess === "all" ? [] : branchIds, status }), { onSuccess: async () => { await invalidate(); onOpenChange(false); toast.success(editing ? t("ptWorkspace.packageUpdated") : t("ptWorkspace.packageCreated")); } });
  const suggestedPriceMinor = guideApplies ? ptPackageSuggestedPriceMinor(sessionCount) : undefined;
  const currentUnitPriceMinor = enteredPrice ? ptPackageUnitPriceMinor(enteredPrice.amount, sessionCount) : undefined;
  const suggestedUnitPriceMinor = suggestedPriceMinor ? ptPackageUnitPriceMinor(suggestedPriceMinor, sessionCount) : undefined;
  const guideCurrency = PT_PACKAGE_PRICE_GUIDE_CURRENCY;
  const changeSessions = (value: string) => {
    const normalized = latinDigits(value);
    setSessions(normalized);
    const next = Number(normalized);
    if (!editing && !priceTouched) setPrice(guidePrice(next));
    if (!editing && !nameTouched && Number.isSafeInteger(next) && next > 0) setGeneratedNameCount(next);
  };
  const canSave = Boolean(packageName.trim()) && sessionsValid && Boolean(enteredPrice) && validityValid && (branchAccess !== "selected" || branchIds.length > 0);
  const submit = () => { setSubmitted(true); if (canSave) save.mutate(); };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{editing ? t("ptWorkspace.editPackage") : t("ptWorkspace.createPackage")}</DialogTitle><DialogDescription>{t("ptWorkspace.packageChangeHint")}</DialogDescription></DialogHeader><DialogBody className="grid gap-4"><Field label={t("ptWorkspace.sessions")} error={!sessionsValid ? t("ptWorkspace.sessionsRange") : undefined}><Input type="text" inputMode="numeric" dir="ltr" aria-invalid={!sessionsValid || undefined} value={sessions} onChange={(event) => changeSessions(event.target.value)} aria-label={t("ptWorkspace.sessions")} /></Field><Field label={t("ptWorkspace.packageName")}><Input value={packageName} onChange={(event) => { setNameTouched(true); setName(event.target.value); }} /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label={t("ptWorkspace.totalPrice", { currency: isolateLtr(currency) })} required error={priceProblem}><Input inputMode="decimal" dir="ltr" placeholder={toMajorString(money(240 * 10 ** exponentFor(currency), currency))} value={price} aria-invalid={priceProblem ? true : undefined} onBlur={() => setPriceBlurred(true)} onChange={(event) => { setPriceTouched(true); setPrice(event.target.value); }} /></Field><Field label={t("ptWorkspace.validDays")} error={!validityValid ? t("ptWorkspace.validityRange") : undefined}><Input type="text" inputMode="numeric" dir="ltr" aria-invalid={!validityValid || undefined} value={validity} onChange={(event) => setValidity(latinDigits(event.target.value))} /></Field></div><div className="rounded-md border border-line bg-sunken p-4" aria-label={t("ptWorkspace.priceGuide")}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="context-label">{t("ptWorkspace.priceGuide")}</p><p className="mt-1 text-[12px] text-ink-3">{guideApplies ? t("ptWorkspace.moreSessionsHint") : t("ptWorkspace.foreignGuide", { guideCurrency: isolateLtr(guideCurrency), currency: isolateLtr(currency) })}</p></div>{suggestedPriceMinor ? <p className="text-end text-[12px] text-ink-2">{t("ptWorkspace.guideTotal")}<br /><strong><MoneyText money={{ amount: suggestedPriceMinor, currency: guideCurrency }} /></strong></p> : null}</div><div className="mt-3 grid gap-3 sm:grid-cols-3">{PT_PACKAGE_PRICE_GUIDE.map((guide) => <div key={guide.sessionCount} className="border-t border-line pt-2 text-start"><p className="text-[12px] text-ink-3">{t("ptWorkspace.sessionCount", { count: guide.sessionCount })}</p><p className="mt-1 text-[12px] font-medium"><MoneyText money={{ amount: guide.totalPriceMinor, currency: guideCurrency }} /></p><p className="mt-0.5 text-[12px] text-ink-3"><MoneyText money={{ amount: Math.round(guide.totalPriceMinor / guide.sessionCount), currency: guideCurrency }} /> {" "}{t("ptWorkspace.perSession")}</p></div>)}</div>{currentUnitPriceMinor ? <p className="mt-3 text-[12px] text-ink-2">{t("ptWorkspace.currentRate")}{" "}<strong><MoneyText money={{ amount: currentUnitPriceMinor, currency }} /> {" "}{t("ptWorkspace.perSession")}</strong>{suggestedUnitPriceMinor ? <>{t("ptWorkspace.guideRate")}{" "}<strong><MoneyText money={{ amount: suggestedUnitPriceMinor, currency: guideCurrency }} /> {" "}{t("ptWorkspace.perSession")}</strong></> : null}{t("members.bulk.toast.end")}</p> : <p className="mt-3 text-[12px] text-ink-3">{t("ptWorkspace.rateHint")}</p>}{enteredPrice && suggestedPriceMinor && enteredPrice.amount !== suggestedPriceMinor ? <p className="mt-2 text-[12px] text-warning-deep">{t("ptWorkspace.differentGuide")}</p> : null}</div><Field label={t("ptWorkspace.branches")}><select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={branchAccess} onChange={(event) => setBranchAccess(event.target.value as "all" | "selected")}><option value="all">{t("common.label.allBranches")}</option><option value="selected">{t("ptWorkspace.selectedBranches")}</option></select></Field>{branchAccess === "selected" ? <div className="grid gap-2 rounded-md border border-line p-3">{session?.branches.map((branch) => <label key={branch.id} className="flex min-h-11 items-center gap-2 text-[12px]"><input className="size-5" type="checkbox" checked={branchIds.includes(branch.id)} onChange={(event) => setBranchIds((current) => event.target.checked ? [...new Set([...current, branch.id])] : current.filter((id) => id !== branch.id))} />{branch.name}</label>)}</div> : null}{editing ? <Field label={t("common.label.status")}><select className="h-10 rounded-md border border-line-2 bg-surface px-3 py-2 text-[13px]" value={status} onChange={(event) => setStatus(event.target.value as "active" | "archived")}><option value="active">{t("renewFlow.adjust.membershipStatus.active")}</option><option value="archived">{t("members.list.archived")}</option></select></Field> : null}</DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button><Button loading={save.isPending} disabled={!packageName.trim() || !sessionsValid || !validityValid || (branchAccess === "selected" && branchIds.length === 0)} onClick={submit}>{t("ptWorkspace.savePackage")}</Button></DialogFooter></DialogContent></Dialog>;
}

function CancelPtOrderDialog({ order, onOpenChange }: { order?: PtPackageOrder; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const invalidate = useInvalidate(); const [reason, setReason] = useState("");
  useEffect(() => { if (order) setReason(""); }, [order]);
  const cancel = useApiMutation((api) => api.cancelPtPackageOrder(order!.id, { reason: reason.trim(), idempotencyKey: crypto.randomUUID() }), { onSuccess: async () => { await invalidate(); onOpenChange(false); toast.success(t("ptWorkspace.orderCancelled")); } });
  return <Dialog open={Boolean(order)} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{t("ptWorkspace.cancelOrderTitle")}</DialogTitle><DialogDescription>{t("ptWorkspace.cancelOrderHint", { name: order?.packageName ?? t("ptWorkspace.thisPackage") })}</DialogDescription></DialogHeader><DialogBody><Field label={t("common.label.reason")} required><Textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("ptWorkspace.orderReasonExample")} /></Field></DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>{t("ptWorkspace.keepOrder")}</Button><Button variant="danger" loading={cancel.isPending} disabled={reason.trim().length < 3} onClick={() => cancel.mutate()}>{t("ptWorkspace.cancelOrder")}</Button></DialogFooter></DialogContent></Dialog>;
}

function DeletePtPackageDialog({ package: packageValue, onOpenChange }: { package?: PtPackage; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const invalidate = useInvalidate();
  const [reason, setReason] = useState("");
  useEffect(() => { if (packageValue) setReason(""); }, [packageValue]);
  const remove = useApiMutation((api) => api.deletePtPackage(packageValue!.id, reason.trim()), {
    onSuccess: async () => {
      await invalidate();
      onOpenChange(false);
      toast.success(t("ptWorkspace.packageDeleted"));
    },
  });
  return <Dialog open={Boolean(packageValue)} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{t("ptWorkspace.deletePackageTitle")}</DialogTitle><DialogDescription>{t("ptWorkspace.deletePackageHint", { name: packageValue?.name ?? "" })}</DialogDescription></DialogHeader><DialogBody><Field label={t("common.label.reason")} required><Textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("ptWorkspace.packageReasonExample")} /></Field></DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>{t("ptWorkspace.keepPackage")}</Button><Button variant="danger" loading={remove.isPending} disabled={reason.trim().length < 3} onClick={() => remove.mutate()}><Trash2 /> {" "}{t("ptWorkspace.deletePackage")}</Button></DialogFooter></DialogContent></Dialog>;
}

function TrainerDialog({ open, onOpenChange, users, trainer }: { open: boolean; onOpenChange: (open: boolean) => void; users: StaffUser[]; trainer?: PtTrainerProfile }) {
  const t = useT();
  const { session } = useApp(); const invalidate = useInvalidate(); const [userId, setUserId] = useState(""); const [name, setName] = useState(""); const [bio, setBio] = useState(""); const [bioAr, setBioAr] = useState(""); const [specialties, setSpecialties] = useState(""); const [status, setStatus] = useState<"draft" | "published" | "archived">("draft"); const [photo, setPhoto] = useState<File>(); const [photoAlt, setPhotoAlt] = useState("");
  useEffect(() => {
    if (!open) return;
    setUserId(trainer?.userId ?? ""); setName(trainer?.displayName ?? ""); setBio(trainer?.bioEn ?? ""); setBioAr(trainer?.bioAr ?? ""); setSpecialties(trainer?.specialties.join(", ") ?? ""); setStatus(trainer?.status ?? "draft"); setPhoto(undefined); setPhotoAlt(trainer?.photoAlt ?? "");
  }, [open, trainer]);
  const selected = users.find((user) => user.id === userId);
  const save = useApiMutation(async (api) => {
    const base = { id: trainer?.id, userId, displayName: name.trim() || selected?.name || "", bioEn: bio.trim() || undefined, bioAr: bioAr.trim() || undefined, specialties: specialties.split(/[,،]/).map((item) => item.trim()).filter(Boolean), languages: ["en", "ar"] as Array<"en" | "ar">, branchIds: selected?.branchScope === "selected" ? selected.branchIds : trainer?.branchIds ?? session?.branches.map((branch) => branch.id) ?? [], photoAlt: photoAlt.trim() || undefined, status };
    const saved = await api.upsertPtTrainerProfile(base);
    if (!photo) return saved;
    const asset = await api.uploadMediaAsset({ ownerType: "trainer_photo", ownerId: saved.id, altText: photoAlt.trim(), file: photo });
    try {
      return await api.upsertPtTrainerProfile({ ...base, id: saved.id, photoAssetId: asset.id });
    } catch (error) {
      // The upload is still a server-side draft until the trainer mutation
      // links it. Best-effort cleanup avoids leaving a usable orphan when a
      // profile validation or network request fails after upload.
      await api.discardDraftMediaAsset(asset.id).catch(() => undefined);
      throw error;
    }
  }, { onSuccess: async () => { await invalidate(); onOpenChange(false); toast.success(t("ptWorkspace.trainerSaved")); } });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{trainer ? t("ptWorkspace.editTrainer") : t("ptWorkspace.addProfile")}</DialogTitle><DialogDescription>{t("ptWorkspace.trainerHintPublic")}</DialogDescription></DialogHeader><DialogBody className="grid gap-4"><Field label={t("ptWorkspace.trainerAccount")}><select disabled={Boolean(trainer)} className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={userId} onChange={(event) => { setUserId(event.target.value); setName(users.find((user) => user.id === event.target.value)?.name ?? ""); }}><option value="">{t("ptWorkspace.selectTrainer")}</option>{users.filter((user) => user.status === "active" || user.id === trainer?.userId).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></Field>{!trainer && !users.some((user) => user.status === "active") ? <p className="-mt-2 text-[12px] text-ink-2" role="status">{users.some((user) => user.status === "invited") ? t("ptWorkspace.invitationPending") : t("ptWorkspace.noActiveTrainers")} {" "}{t("ptWorkspace.invitePrefix")}{" "}<Link className="font-medium text-ink underline" href="/settings?section=users">{t("ptWorkspace.staffSettings")}</Link>{t("ptWorkspace.inviteSuffix")}</p> : null}<Field label={t("ptWorkspace.publicName")}><Input value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label={t("ptWorkspace.specialties")}><Input placeholder={t("ptWorkspace.specialtiesExample")} value={specialties} onChange={(event) => setSpecialties(event.target.value)} /></Field><Field label={t("ptWorkspace.englishBio")}><Textarea dir="ltr" lang="en" className="min-h-20" value={bio} onChange={(event) => setBio(event.target.value)} /></Field><Field label={t("ptWorkspace.arabicBio")}><Textarea dir="rtl" lang="ar" className="min-h-20" value={bioAr} onChange={(event) => setBioAr(event.target.value)} /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label={t("ptWorkspace.trainerPhoto")}><Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0])} /></Field><Field label={t("ptWorkspace.photoDescription")}><Input value={photoAlt} onChange={(event) => setPhotoAlt(event.target.value)} placeholder={t("ptWorkspace.photoExample")} /></Field></div><Field label={t("common.label.status")}><select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={status} onChange={(event) => setStatus(event.target.value as "draft" | "published" | "archived")}><option value="draft">{t("ptWorkspace.draft")}</option><option value="published">{t("ptWorkspace.published")}</option>{trainer ? <option value="archived">{t("members.list.archived")}</option> : null}</select></Field></DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button><Button loading={save.isPending} disabled={!userId || !(name.trim() || selected?.name) || Boolean(photo && !photoAlt.trim())} onClick={() => save.mutate()}>{t("ptWorkspace.saveTrainer")}</Button></DialogFooter></DialogContent></Dialog>;
}

function AvailabilityDialog({ trainer, onOpenChange }: { trainer?: PtTrainerProfile; onOpenChange: (open: boolean) => void }) {
  const { t, locale, isolate, isolateLtr } = useLocale();
  const f = useFormat();
  const { session } = useApp(); const invalidate = useInvalidate(); const [branchId, setBranchId] = useState(""); const [start, setStart] = useState("08:00"); const [end, setEnd] = useState("17:00"); const [days, setDays] = useState<WeekdayKey[]>(["sun", "mon", "tue", "wed", "thu"]); const [weeklyChanged, setWeeklyChanged] = useState(false); const [exceptions, setExceptions] = useState<Array<Omit<PtAvailabilityException, "id" | "trainerProfileId">>>([]); const [timeOffDate, setTimeOffDate] = useState(""); const [timeOffStart, setTimeOffStart] = useState(""); const [timeOffEnd, setTimeOffEnd] = useState(""); const [timeOffReason, setTimeOffReason] = useState("");
  const branches = useMemo(() => session?.branches.filter((branch) => trainer?.branchIds.includes(branch.id)) ?? [], [session?.branches, trainer?.branchIds]);
  useEffect(() => {
    if (!trainer) return;
    const firstRule = trainer.availabilityRules?.[0];
    const fromMinute = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    setBranchId(visibleBranchId(branches, firstRule?.branchId) ?? ""); setStart(firstRule ? fromMinute(firstRule.startMinute) : "08:00"); setEnd(firstRule ? fromMinute(firstRule.endMinute) : "17:00"); setDays(firstRule ? [...new Set(trainer.availabilityRules?.filter((rule) => rule.branchId === firstRule.branchId && rule.startMinute === firstRule.startMinute && rule.endMinute === firstRule.endMinute).map((rule) => rule.weekday))] : ["sun", "mon", "tue", "wed", "thu"]); setExceptions((trainer.availabilityExceptions ?? []).map(({ branchId: id, date, startMinute, endMinute, reason }) => ({ branchId: id, date, startMinute, endMinute, reason }))); setWeeklyChanged(false); setTimeOffDate(""); setTimeOffStart(""); setTimeOffEnd(""); setTimeOffReason("");
  }, [branches, trainer]);
  const toMinute = (value: string) => { const [hour, minute] = value.split(":").map(Number); return (hour ?? 0) * 60 + (minute ?? 0); };
  const addTimeOff = () => { const selectedBranch = visibleBranchId(branches, branchId); if (!timeOffDate || !selectedBranch) return; setExceptions((current) => [...current, { branchId: selectedBranch, date: timeOffDate, startMinute: timeOffStart && timeOffEnd ? toMinute(timeOffStart) : undefined, endMinute: timeOffStart && timeOffEnd ? toMinute(timeOffEnd) : undefined, reason: timeOffReason.trim() || undefined }]); setTimeOffDate(""); setTimeOffStart(""); setTimeOffEnd(""); setTimeOffReason(""); };
  const save = useApiMutation((api) => { const selectedBranch = visibleBranchId(branches, branchId); const priorRules = trainer?.availabilityRules?.map(({ branchId: id, weekday, startMinute, endMinute, active }) => ({ branchId: id, weekday, startMinute, endMinute, active })) ?? []; const rules = weeklyChanged || priorRules.length === 0 ? days.map((weekday) => ({ branchId: selectedBranch ?? "", weekday, startMinute: toMinute(start), endMinute: toMinute(end), active: true })) : priorRules; return api.replacePtAvailability({ trainerProfileId: trainer!.id, rules, exceptions }); }, { onSuccess: async () => { await invalidate(); onOpenChange(false); toast.success(t("ptWorkspace.availabilitySaved")); } });
  return <Dialog open={Boolean(trainer)} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{trainer ? t("ptWorkspace.namedAvailability", { name: isolate(trainer.displayName) }) : t("ptWorkspace.trainerAvailability")}</DialogTitle><DialogDescription>{t("ptWorkspace.availabilityHint")}</DialogDescription></DialogHeader><DialogBody className="grid gap-5"><div className="grid gap-4"><Field label={t("common.label.branch")} required><select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[13px]" value={branchId} onChange={(event) => { setBranchId(event.target.value); setWeeklyChanged(true); }}><option value="">{t("members.bulk.chooseBranch")}</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></Field><Field label={t("ptWorkspace.workingDays")}><div className="flex flex-wrap gap-2">{WEEKDAYS.map((day) => <button key={day.key} type="button" data-touch-target aria-pressed={days.includes(day.key)} onClick={() => { setWeeklyChanged(true); setDays((current) => current.includes(day.key) ? current.filter((item) => item !== day.key) : [...current, day.key]); }} className={days.includes(day.key) ? "rounded-md border border-ink bg-ink px-3 py-2 text-[12px] text-paper" : "rounded-md border border-line-2 px-3 py-2 text-[12px] text-ink-2"}>{locale === "en" ? day.key[0]!.toUpperCase() + day.key.slice(1) : t(`errorValues.weekday.${day.label}`)}</button>)}</div></Field><div className="grid gap-3 sm:grid-cols-2"><Field label={t("renewFlow.adjust.planChange.starts")}><Input type="time" lang={locale} dir="ltr" value={start} onChange={(event) => { setStart(event.target.value); setWeeklyChanged(true); }} /></Field><Field label={t("crm.queues.ends")}><Input type="time" lang={locale} dir="ltr" value={end} onChange={(event) => { setEnd(event.target.value); setWeeklyChanged(true); }} /></Field></div></div><div className="border-t border-line pt-4"><p className="context-label">{t("ptWorkspace.timeOff")}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label={t("common.label.date")}><Input type="date" lang={locale} dir="ltr" value={timeOffDate} onChange={(event) => setTimeOffDate(event.target.value)} /></Field><Field label={t("common.label.reason")}><Input value={timeOffReason} onChange={(event) => setTimeOffReason(event.target.value)} placeholder={t("ptWorkspace.timeOffExample")} /></Field><Field label={t("ptWorkspace.fromOptional")}><Input type="time" lang={locale} dir="ltr" value={timeOffStart} onChange={(event) => setTimeOffStart(event.target.value)} /></Field><Field label={t("ptWorkspace.toOptional")}><Input type="time" lang={locale} dir="ltr" value={timeOffEnd} onChange={(event) => setTimeOffEnd(event.target.value)} /></Field></div><Button className="mt-3" type="button" size="sm" variant="secondary" disabled={!visibleBranchId(branches, branchId) || !timeOffDate || Boolean(timeOffStart) !== Boolean(timeOffEnd) || (timeOffStart && timeOffEnd ? timeOffStart >= timeOffEnd : false)} onClick={addTimeOff}><Plus /> {" "}{t("ptWorkspace.addTimeOff")}</Button>{exceptions.length ? <ul className="mt-3 divide-y divide-line border border-line">{exceptions.map((exception, index) => <li key={`${exception.date}-${exception.branchId}-${index}`} className="flex items-center gap-3 p-3 text-[12px]"><span className="flex-1">{f.date(exception.date)} · {exception.startMinute !== undefined ? isolateLtr(f.clock(`${String(Math.floor(exception.startMinute / 60)).padStart(2, "0")}:${String(exception.startMinute % 60).padStart(2, "0")}`)) : t("ptWorkspace.allDay")}{exception.reason ? ` · ${isolate(exception.reason)}` : ""}</span><Button size="icon" variant="ghost" aria-label={t("ptWorkspace.removeTimeOff", { date: f.date(exception.date) })} onClick={() => setExceptions((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></Button></li>)}</ul> : <p className="mt-3 text-[12px] text-ink-3">{t("ptWorkspace.noTimeOff")}</p>}</div></DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button><Button loading={save.isPending} disabled={!trainer || !visibleBranchId(branches, branchId) || ((weeklyChanged || !(trainer.availabilityRules?.length)) && (days.length === 0 || start >= end))} onClick={() => save.mutate()}>{t("ptWorkspace.saveAvailability")}</Button></DialogFooter></DialogContent></Dialog>;
}
