"use client";
import type { TFunction } from "@/lib/i18n/core";
import { FormattingProvider, useFormat, useFormattingTimeZone } from "@/lib/i18n/format";
import { useLocale, useT } from "@/lib/i18n/provider";

import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Clock3, Copy, Dumbbell, MapPin, MessageCircle, Phone, QrCode, ScanLine, Share2, UserRoundCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EntryPassDialog } from "@/components/public/entry-pass-dialog";
import { GymMark } from "@/components/public/gym-mark";
import { SegmentedTabs } from "@/components/public/segmented-tabs";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { StatusChip } from "@/components/shared/status-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import type { CustomerClassOccurrence, PtBooking, PtBookingStatus, PtPackageOrder } from "@/lib/domain/types";
import { renderDomainMessage } from "@/lib/i18n/domain-message";
import { classBookingBlockMessage, classCancellationPreview, type ClassBookingStatus } from "@/lib/domain/class-booking";
import { PT_DEFAULT_CANCELLATION_CUTOFF_HOURS, ptBookingAwaitsOutcome, ptBookingBeforeCutoff, ptNextBooking } from "@/lib/domain/personal-training";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import type { CustomerMembership, CustomerReferralProgram, CustomerReferralRewardEvent, CustomerVisit, MarketplaceGym } from "@/lib/public/experience-data";
import { membershipDisplayStatus, type MembershipDisplayStatus } from "@/lib/public/membership-status";
import { cn } from "@/lib/utils/cn";
import { addDays, diffDays, todayISODate } from "@/lib/utils/dates";
import { latinDigits } from "@/lib/utils/text";
import { money } from "@/lib/utils/money";

type Section = "membership" | "classes" | "pt";

function sectionFromParam(value: string | null): Section {
  return value === "pt" || value === "classes" ? value : "membership";
}

const SELECT_CLASS = "h-11 w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px] text-ink transition-colors hover:border-line-3 focus:border-[var(--tenant-brand-primary)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-9";

const CLASS_BOOKING_LABELS = (t: TFunction): Record<ClassBookingStatus, string> => ({
  booked: t("memberExperience.booked"),
  waitlisted: t("memberExperience.waitlisted"),
  cancelled: t("memberExperience.cancelled"),
  late_cancelled: t("memberExperience.lateCancelled"),
  attended: t("memberExperience.attended"),
  no_show: t("memberExperience.missed"),
});

const PT_BOOKING_LABELS = (t: TFunction): Record<PtBookingStatus, string> => ({
  reserved: t("memberExperience.booked"),
  confirmed: t("memberExperience.confirmed"),
  completed: t("memberExperience.done"),
  cancelled: t("memberExperience.cancelled"),
  late_cancelled: t("memberExperience.lateCancelled"),
  no_show: t("memberExperience.missed"),
  gym_cancelled: t("memberExperience.gymCancelled"),
});

const PT_ORDER_LABELS = (t: TFunction): Record<PtPackageOrder["status"], string> => ({
  pending_payment: t("memberExperience.waitingPayment"),
  active: t("memberExperience.active"),
  partially_refunded: t("memberExperience.partlyRefunded"),
  refunded: t("memberExperience.refunded"),
  cancelled: t("memberExperience.cancelled"),
});

export default function MembershipDetailClient({ membershipId }: { membershipId: string }) {
  return (
    <Suspense fallback={<GateLoading />}>
      <MembershipDetail membershipId={membershipId} />
    </Suspense>
  );
}

function MembershipDetail({ membershipId }: { membershipId: string }) {
  const { t, locale, isolate } = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { memberships } = useExperience();
  const gyms = useMarketplaceGyms();
  const { ready, identitySignedIn } = useMemberGate();
  const membership = memberships.find((item) => item.id === membershipId);
  const sectionParam = searchParams.get("section");
  const [section, setSectionState] = useState<Section>(() => sectionFromParam(sectionParam));
  const [qrOpen, setQrOpen] = useState(false);

  // The section is shareable: deep links and installed-app shortcuts arrive
  // with ?section=, and choosing a tab writes it back without a history entry.
  useEffect(() => {
    setSectionState(sectionFromParam(sectionParam));
  }, [sectionParam]);
  const setSection = (next: Section) => {
    setSectionState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "membership") params.delete("section");
    else params.set("section", next);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // A membership card, its QR and its balance are never shown to a visitor.
  if (!ready || !identitySignedIn) return <GateLoading />;

  if (!membership) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-[22px] font-semibold tracking-tight">{t("memberExperience.notFound")}</h1>
        <p className="mt-2 text-[13.5px] text-ink-2">{t("memberExperience.notFoundDescription")}</p>
        <Button asChild className="mt-5">
          <Link href="/customer/my-gyms">{t("memberExperience.backHome")}</Link>
        </Button>
      </main>
    );
  }

  // A subscription may remain active even when the gym is not eligible for
  // public Find Gyms discovery. Use the authenticated membership projection
  // as the fallback so members never lose access to their own dashboard.
  const gym = gyms.find((item) => item.id === membership.gymId) ?? fallbackGym(membership, t);
  const branch = gym.branches.find((item) => item.id === membership.branchId);
  const status = membershipDisplayStatus(membership, undefined, { locale, timeZone: membership.timezone });
  const cover = membership.gymCoverUrl ?? gym.cover?.url;

  return (
    <FormattingProvider timeZone={membership.timezone}><main className="mx-auto max-w-[1080px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <Link href="/customer/my-gyms" className="inline-flex min-h-8 items-center gap-1.5 rounded-xs text-[13px] text-ink-3 transition-colors hover:text-ink">
        <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden />{" "}{t("marketing.memberShell.home")}</Link>

      {cover ? <div className="mt-4 h-32 overflow-hidden rounded-lg border border-line bg-cover bg-center sm:h-40" role="img" aria-label={t("memberExperience.cover", { gym: isolate(gym.name) })} style={{ backgroundImage: `url(${cover})` }} /> : null}

      <header className="mt-4 flex flex-wrap items-center gap-3 sm:gap-4">
        <GymMark name={gym.name} shortName={gym.shortName} logoUrl={membership.gymLogoUrl ?? gym.logo?.url} accent={gym.accent} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[24px] font-semibold leading-tight tracking-tight">{gym.name}</h1>
          <p className="mt-1 flex items-start gap-1.5 text-[13px] text-ink-2">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
            <span>{branch ? `${branch.name} · ${branch.address}` : t("shell.topbar.branchUnavailable")}</span>
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setQrOpen(true)}><QrCode />{" "}{t("memberExperience.showCode")}</Button>
      </header>

      <SegmentedTabs
        className="mt-5"
        label={t("memberExperience.sections", { gym: isolate(gym.name) })}
        value={section}
        onChange={setSection}
        items={[
          { value: "membership", label: t("memberProfile.followUp.membershipFallback") },
          { value: "classes", label: <><CalendarDays className="size-3.5" aria-hidden />{" "}{t("nav.item.classes")}</>, name: t("memberExperience.classes") },
          { value: "pt", label: <><Dumbbell className="size-3.5" aria-hidden />{" "}{t("memberProfile.tabs.pt")}</>, name: "PT" },
        ]}
      />

      {section === "membership" ? (
        <div className="mt-4 space-y-4" role="tabpanel" aria-label={t("memberProfile.followUp.membershipFallback")}>
          <MembershipSummary membership={membership} gym={gym} branchName={branch?.name ?? membership.branchName} status={status} />
          <FreezeRequestCard membershipId={membership.id} />
          {membership.referral?.enabled ? <ReferralCard initialProgram={membership.referral} gymName={gym.name} /> : null}
          <ActivityHistory membership={membership} visits={membership.visitHistory ?? []} />
        </div>
      ) : section === "classes" ? (
        <CustomerClassesPanel membershipId={membership.id} />
      ) : (
        <CustomerPtPanel membershipId={membership.id} gymName={gym.name} branchNames={new Map(gym.branches.map((item) => [item.id, item.name]))} />
      )}

      <EntryPassDialog open={qrOpen} onOpenChange={setQrOpen} membershipId={membership.id} memberNumber={membership.memberNumber} gymName={gym.name} />
    </main></FormattingProvider>
  );
}

function MembershipSummary({ membership, gym, branchName, status }: { membership: CustomerMembership; gym: MarketplaceGym; branchName?: string; status: MembershipDisplayStatus }) {
  const timeZone = useFormattingTimeZone();
  const fmt = useFormat();
  const { t, isolate } = useLocale();
  const total = Math.max(diffDays(membership.startDate, membership.endDate), 1);
  const elapsed = Math.min(Math.max(diffDays(membership.startDate, todayISODate(timeZone)), 0), total);
  const percent = Math.round((elapsed / total) * 100);
  const phone = gym.contactPhone;
  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="membership-summary-title">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 id="membership-summary-title" className="text-[16px] font-semibold leading-tight">{membership.planName}</h2>
          <p className={cn("mt-1 text-[13.5px]", status.ended ? "text-danger" : status.key === "ending" ? "text-warning-deep" : "text-ink-2")}>{status.summary}</p>
        </div>
        <StatusChip tone={status.tone} dot>{status.label}</StatusChip>
      </div>

      {status.ended ? (
        <p className="mt-3 text-[13px] text-ink-2">{t("memberExperience.renewAtDesk", { gym: isolate(gym.name) })}</p>
      ) : (
        <div className="mt-3" aria-hidden>
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken-2">
            <div className={cn("h-full rounded-full", status.key === "ending" ? "bg-warning" : "bg-ink")} style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[12px] text-ink-3">
            <span>{t("memberExperience.started")}{" "}{fmt.date(membership.startDate)}</span>
            <span>{t("crm.queues.ends")}{" "}{fmt.date(membership.endDate)}</span>
          </div>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-[13px] sm:grid-cols-4">
        <Fact label={t("memberExperience.memberNumber")}><bdi dir="ltr" className="font-mono text-[12.5px]">{membership.memberNumber}</bdi></Fact>
        <Fact label={t("common.label.branch")}>{branchName ?? t("memberExperience.branchUnavailable")}</Fact>
        <Fact label={t("memberExperience.totalVisits")}><span className="tabular">{membership.totalCheckIns ?? membership.visitHistory.length}</span></Fact>
        <Fact label={t("domain.paymentStatus.unpaid")}><MoneyText money={money(membership.balanceMinor)} className={membership.balanceMinor > 0 ? "font-medium text-warning-deep" : undefined} /></Fact>
      </dl>

      {phone ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <Button variant="secondary" size="sm" asChild>
            <a href={`https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(t("memberExperience.whatsappDraft", { gym: gym.name }))}`} target="_blank" rel="noreferrer"><MessageCircle />{" "}{t("memberExperience.whatsapp")}</a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={`tel:${phone}`}><Phone />{" "}{t("memberExperience.call")}</a>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-ink">{children}</dd>
    </div>
  );
}

function CustomerClassesPanel({ membershipId }: { membershipId: string }) {
  const timeZone = useFormattingTimeZone();
  const fmt = useFormat();
  const { t, locale, isolate } = useLocale();
  const invalidate = useInvalidate();
  const experience = useApiQuery(qk.customerClasses(membershipId), (api) => api.getCustomerClassExperience(membershipId));
  // One day at a time, bounded to the rolling week. The view resets to the new
  // week automatically when the week rolls over.
  const [panelView, setPanelView] = useState<"week" | "history">("week");
  const [selectedDate, setSelectedDate] = useState(() => todayISODate(timeZone));
  const autoAdvanced = useRef(false);
  // Land on the first day of the week that actually has classes, once, so a
  // member never opens onto an empty day when later days have sessions.
  useEffect(() => {
    const upcoming = experience.data?.upcoming;
    if (!upcoming || autoAdvanced.current) return;
    autoAdvanced.current = true;
    const start = todayISODate(timeZone);
    const end = addDays(start, 6);
    const firstWithClasses = upcoming
      .map((occurrence) => occurrence.date)
      .filter((value) => value >= start && value <= end)
      .sort()[0];
    if (firstWithClasses) setSelectedDate(firstWithClasses);
  }, [experience.data, timeZone]);
  const book = useApiMutation((api, occurrenceId: string) => api.bookCustomerClass({ membershipId, occurrenceId }), {
    onSuccess: async (result) => {
      toast.success(result.outcome === "waitlisted" ? t("memberExperience.joinedWaitlist") : t("memberExperience.classBooked"));
      await invalidate([qk.customerClasses(membershipId)]);
    },
  });
  // Cancelling is confirmed first: the member sees whether it counts as late
  // (or only leaves the waitlist) before anything is recorded.
  const [cancelTarget, setCancelTarget] = useState<CustomerClassOccurrence>();
  const cancel = useApiMutation((api, input: { occurrenceId: string; wasWaitlisted: boolean }) => api.cancelCustomerClass({ membershipId, occurrenceId: input.occurrenceId }), {
    onSuccess: async (result, input) => {
      toast.success(result.outcome === "late_cancelled" ? t("memberExperience.classLateCancelled") : input.wasWaitlisted ? t("memberExperience.leftWaitlist") : t("memberExperience.classBookingCancelled"));
      setCancelTarget(undefined);
      await invalidate([qk.customerClasses(membershipId)]);
    },
  });

  if (experience.isLoading) return <div className="mt-4 grid gap-3 sm:grid-cols-2" role="tabpanel" aria-label={t("nav.item.classes")} aria-busy="true"><Skeleton className="h-56 w-full" /><Skeleton className="h-56 w-full" /></div>;
  if (experience.isError) return <div className="mt-4" role="tabpanel" aria-label={t("nav.item.classes")}><ErrorState layout="section" title={t("memberExperience.classesLoadError")} description={t("memberExperience.membershipUnaffected")} onRetry={() => experience.refetch()} /></div>;
  const value = experience.data!;
  if (!value.policy.enabled) {
    return (
      <section className="panel mt-4 p-6 text-center" role="tabpanel" aria-label={t("nav.item.classes")}>
        <CalendarDays className="mx-auto size-6 text-ink-3" aria-hidden />
        <h2 className="mt-3 text-[16px] font-semibold">{t("memberExperience.bookAtReception")}</h2>
        <p className="mt-1 text-[13px] text-ink-2">{t("memberExperience.noAppBooking", { gym: isolate(value.gymName) })}</p>
      </section>
    );
  }

  const today = todayISODate(timeZone);
  // Rolling seven days, matching the staff view's dated window: a new day
  // opens at the far end as each day passes.
  const weekEnd = addDays(today, 6);
  const date = selectedDate < today ? today : selectedDate > weekEnd ? weekEnd : selectedDate;
  const dayOccurrences = value.upcoming.filter((occurrence) => occurrence.date === date);
  const attendedCount = value.history.filter((occurrence) => occurrence.booking?.status === "attended").length;

  return (
    <div className="mt-4 space-y-4" role="tabpanel" aria-label={t("nav.item.classes")}>
      {experience.isBackgroundError ? <ErrorState layout="inline" title={t("memberExperience.classesRefreshError")} description={t("memberExperience.staleClasses")} onRetry={() => experience.refetch()} /> : null}
      {value.profileCorrectionRequired ? (
        <div className="rounded-md border border-warning/30 bg-warning-bg px-4 py-3 text-[13px] text-warning-deep" role="status">
          {t("memberExperience.genderInstruction")}{" "}<Link href="/customer/profile" className="font-semibold underline underline-offset-4">{t("memberExperience.yourProfile")}</Link>
        </div>
      ) : null}

      <SegmentedTabs
        label={t("memberExperience.classViews")}
        value={panelView}
        onChange={setPanelView}
        items={[
          { value: "week", label: t("common.time.thisWeek") },
          { value: "history", label: <>{t("memberExperience.myHistory")}{attendedCount ? <span className="tabular text-[12px] font-normal text-ink-3">{attendedCount}</span> : null}</>, name: t("memberExperience.myHistory") },
        ]}
      />

      {panelView === "week" ? (
        <section aria-label={t("memberExperience.weekClasses")}>
          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" size="icon" aria-label={t("memberExperience.previousDay")} disabled={date <= today} onClick={() => setSelectedDate(addDays(date, -1))}><ChevronLeft className="rtl:rotate-180" /></Button>
            <div className="min-w-0 text-center">
              <h3 className="text-[15px] font-semibold">{date === today ? t("common.time.today") : date === addDays(today, 1) ? t("common.time.tomorrow") : fmt.weekday(`${date}T12:00:00Z`)} · {fmt.date(date)}</h3>
              <p className="text-[12px] text-ink-3">{t("memberExperience.nextSevenDays")}</p>
            </div>
            <Button variant="secondary" size="icon" aria-label={t("memberExperience.nextDay")} disabled={date >= weekEnd} onClick={() => setSelectedDate(addDays(date, 1))}><ChevronRight className="rtl:rotate-180" /></Button>
          </div>
          <div key={date} className="mt-3">
            {dayOccurrences.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {dayOccurrences.map((occurrence) => (
                  <CustomerClassCard
                    key={occurrence.id}
                    occurrence={occurrence}
                    cutoffHours={value.policy.cancellationCutoffHours}
                    busy={(book.isPending && book.variables === occurrence.id) || (cancel.isPending && cancel.variables?.occurrenceId === occurrence.id)}
                    onBook={() => book.mutate(occurrence.id)}
                    onCancel={() => setCancelTarget(occurrence)}
                  />
                ))}
              </div>
            ) : (
              <div className="panel p-8 text-center">
                <CalendarDays className="mx-auto size-6 text-ink-3" aria-hidden />
                <h3 className="mt-3 text-[15px] font-semibold">{t("memberExperience.noClassesToday")}</h3>
                <p className="mt-1 text-[13px] text-ink-2">{t("memberExperience.checkOtherDays")}</p>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section aria-label={t("memberExperience.classHistory")} className="panel overflow-hidden">
          {value.history.length ? (
            <div className="divide-y divide-line">
              {value.history.map((occurrence) => {
                const bookingStatus = occurrence.booking?.status;
                return (
                  <div key={occurrence.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium">{occurrence.name}</p>
                      <p className="mt-0.5 text-[12px] text-ink-3">{fmt.dateTime(occurrence.startsAt)}{occurrence.coachName ? ` · ${occurrence.coachName}` : ""}</p>
                    </div>
                    <Badge variant={bookingStatus === "attended" ? "success" : bookingStatus === "no_show" ? "warning" : "outline"}>
                      {bookingStatus ? CLASS_BOOKING_LABELS(t)[bookingStatus] : t("memberExperience.notBooked")}
                    </Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center">
              <CalendarDays className="mx-auto size-6 text-ink-3" aria-hidden />
              <h3 className="mt-3 text-[15px] font-semibold">{t("memberExperience.noClasses")}</h3>
              <p className="mt-1 text-[13px] text-ink-2">{t("memberExperience.classesWillAppear")}</p>
            </div>
          )}
        </section>
      )}

      <Dialog open={Boolean(cancelTarget)} onOpenChange={(open) => { if (!open && !cancel.isPending) setCancelTarget(undefined); }}>
        <DialogContent className="max-w-md">
          {cancelTarget ? (() => {
            const waitlisted = cancelTarget.booking?.status === "waitlisted";
            const preview = classCancellationPreview({ startsAt: cancelTarget.startsAt, endsAt: cancelTarget.endsAt, bookingStatus: cancelTarget.booking?.status ?? "booked", cutoffHours: value.policy.cancellationCutoffHours });
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{waitlisted ? t("memberExperience.leaveWaitlistTitle", { name: isolate(cancelTarget.name) }) : t("memberExperience.cancelClassTitle", { name: isolate(cancelTarget.name) })}</DialogTitle>
                  <DialogDescription dir="auto">{fmt.dateTime(cancelTarget.startsAt)}{cancelTarget.coachName ? ` · ${cancelTarget.coachName}` : ""}</DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <p role="status" className={cn("rounded-md border p-3 text-[13px]", preview.outcome === "late_cancelled" ? "border-warning/30 bg-warning-bg text-warning-deep" : "border-line bg-sunken text-ink-2")}>{renderDomainMessage(preview.text, locale, preview.message)}</p>
                </DialogBody>
                <DialogFooter>
                  <Button variant="secondary" disabled={cancel.isPending} onClick={() => setCancelTarget(undefined)}>{t("memberExperience.keepBooking")}</Button>
                  <Button variant="danger" loading={cancel.isPending} disabled={preview.outcome === "closed"} onClick={() => cancel.mutate({ occurrenceId: cancelTarget.id, wasWaitlisted: waitlisted })}>{waitlisted ? t("memberExperience.leaveWaitlist") : t("memberExperience.cancelBooking")}</Button>
                </DialogFooter>
              </>
            );
          })() : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerClassCard({ occurrence, cutoffHours, busy, onBook, onCancel }: { occurrence: CustomerClassOccurrence; cutoffHours: number; busy: boolean; onBook: () => void; onCancel: () => void }) {
  const fmt = useFormat();
  const { t, locale } = useLocale();
  const active = occurrence.booking && ["booked", "waitlisted"].includes(occurrence.booking.status);
  const full = occurrence.spotsRemaining === 0;
  const minutes = Math.round((Date.parse(occurrence.endsAt) - Date.parse(occurrence.startsAt)) / 60_000);
  const preview = active ? classCancellationPreview({ startsAt: occurrence.startsAt, endsAt: occurrence.endsAt, bookingStatus: occurrence.booking?.status ?? "booked", cutoffHours }) : undefined;
  const cancelHint = !preview ? "" : preview.outcome === "leave_waitlist" ? t("memberExperience.leaveAnytime")
    : preview.outcome === "closed" ? t("memberExperience.classEnded")
      : preview.outcome === "late_cancelled" ? t("memberExperience.classLateHint", { hours: cutoffHours })
        : t("memberExperience.classFreeUntil", { date: fmt.dateTime(new Date(preview.freeUntil!).toISOString()) });
  return (
    <article className="panel overflow-hidden">
      {occurrence.imageUrl ? <div className="h-24 bg-cover bg-center" role="img" aria-label={occurrence.imageAltText ?? occurrence.name} style={{ backgroundImage: `url(${occurrence.imageUrl})` }} /> : null}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-[14px] font-semibold">{occurrence.name}</h4>
            <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-2"><Clock3 className="size-3.5 text-ink-3" aria-hidden /> <span dir="auto">{fmt.time(occurrence.startsAt)} · {t("memberExperience.durationMinutes", { count: minutes })}</span></p>
          </div>
          <Badge variant="outline">{occurrence.audience === "mixed" ? t("memberExperience.everyone") : occurrence.audience === "women" ? t("memberExperience.women") : t("memberExperience.men")}</Badge>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-y border-line py-2.5 text-[12.5px]">
          <span className="flex min-w-0 items-center gap-1.5 text-ink-2"><UserRoundCheck className="size-3.5 shrink-0 text-ink-3" aria-hidden /> <span className="truncate">{occurrence.coachName ?? t("memberExperience.coachUnconfirmed")}</span></span>
          <span dir="auto" className={cn("shrink-0 tabular", full ? "font-medium text-warning-deep" : "text-ink-3")}>{full ? t("memberExperience.waitingCount", { count: occurrence.waitlistCount }) : t("memberExperience.spotsLeft", { count: occurrence.spotsRemaining })}</span>
        </div>
        {active ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-success-deep">{occurrence.booking?.status === "waitlisted" ? (occurrence.booking.position ? t("memberExperience.waitlistPosition", { position: occurrence.booking.position }) : t("memberExperience.waitlisted")) : occurrence.booking?.fromWaitlist ? t("memberExperience.bookedFromWaitlist") : t("memberProfile.pt.bookingStatus.reserved")}</p>
              <p className="mt-0.5 text-[12px] text-ink-3" dir="auto">{cancelHint}</p>
            </div>
            <Button size="sm" variant="secondary" loading={busy} disabled={preview?.outcome === "closed"} onClick={onCancel}>{occurrence.booking?.status === "waitlisted" ? t("memberExperience.leave") : t("common.action.cancel")}</Button>
          </div>
        ) : (
          <div className="mt-3">
            <Button className="w-full" loading={busy} disabled={!occurrence.canBook} onClick={onBook}>{full ? t("memberExperience.joinWaitlist") : t("memberExperience.bookClass")}</Button>
            {occurrence.status === "cancelled" && occurrence.cancelReason ? <p className="mt-2 text-[12px] leading-4 text-ink-2">{t("memberExperience.gymCancelledPrefix")}{" "}{occurrence.cancelReason}</p> : occurrence.bookingBlockReason ? <p className="mt-2 text-[12px] leading-4 text-ink-2">{renderDomainMessage(occurrence.bookingBlockReason, locale, occurrence.bookingBlockMessage ?? classBookingBlockMessage(occurrence.bookingBlockReason))}</p> : null}
          </div>
        )}
      </div>
    </article>
  );
}

const REFERRAL_STATUS_META = (t: TFunction): Record<CustomerReferralRewardEvent["status"], { label: string; explanation: string; tone: "success" | "warning" | "neutral" }> => ({
  applied: { label: t("memberExperience.rewardAdded"), explanation: t("memberExperience.rewardAddedDescription"), tone: "success" },
  capped: { label: t("memberExperience.rewardCapped"), explanation: t("memberExperience.rewardCappedDescription"), tone: "warning" },
  ineligible: { label: t("memberExperience.rewardIneligible"), explanation: t("memberExperience.rewardIneligibleDescription"), tone: "neutral" },
  pending: { label: t("memberExperience.rewardPending"), explanation: t("memberExperience.rewardPendingDescription"), tone: "neutral" },
});

function ReferralCard({ initialProgram, gymName }: { initialProgram: CustomerReferralProgram; gymName: string }) {
  const fmt = useFormat();
  const { t, isolate } = useLocale();
  const [program, setProgram] = useState(initialProgram);
  useEffect(() => setProgram(initialProgram), [initialProgram]);
  const ensureLink = useApiMutation((api, membershipId: string) => api.ensureCustomerReferralLink(membershipId), { onSuccess: setProgram });
  const sharePath = program.sharePath;
  const progress = program.maxRewardDaysPerWindow > 0 ? Math.min(100, Math.round((program.earnedDays / program.maxRewardDaysPerWindow) * 100)) : 0;
  const dayWord = (days: number) => t("memberExperience.freeDays", { count: days });
  const copy = async () => {
    if (!sharePath) return;
    try { await navigator.clipboard.writeText(new URL(sharePath, window.location.origin).toString()); toast.success(t("memberExperience.linkCopied")); }
    catch { toast.error(t("memberExperience.copyFailed")); }
  };
  const share = async () => {
    if (!sharePath) return;
    const shareUrl = new URL(sharePath, window.location.origin).toString();
    if (!navigator.share) { await copy(); return; }
    try { await navigator.share({ title: t("memberExperience.shareTitle", { gym: gymName }), text: t("memberExperience.shareDraft", { gym: gymName }), url: shareUrl }); }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; toast.error(t("memberExperience.shareFailed")); }
  };
  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="referral-title">
      <h2 id="referral-title" className="text-[16px] font-semibold leading-tight">{t("memberExperience.rewardTitle", { reward: dayWord(program.rewardDays) })}</h2>
      <p className="mt-1 text-[13px] text-ink-2">{t("memberExperience.rewardDescription", { gym: isolate(gymName) })}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {sharePath ? (
          <>
            <Button size="sm" onClick={() => void share()}><Share2 />{" "}{t("memberExperience.shareLink")}</Button>
            <Button size="sm" variant="secondary" onClick={() => void copy()}><Copy />{" "}{t("common.action.copy")}</Button>
          </>
        ) : (
          <Button size="sm" loading={ensureLink.isPending} onClick={() => ensureLink.mutate(program.membershipId)}><Share2 />{" "}{t("memberExperience.createLink")}</Button>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="font-medium text-ink">{t("memberExperience.earnedFreeDays")}</span>
          <span className="tabular text-ink-3">{t("memberExperience.rewardProgress", { earned: program.earnedDays, limit: program.maxRewardDaysPerWindow })}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken-2" aria-hidden><div className="h-full rounded-full bg-success" style={{ width: `${progress}%` }} /></div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
          <div><dt className="text-ink-3">{t("memberExperience.friendsJoined")}</dt><dd className="mt-0.5 text-[16px] font-semibold tabular text-ink">{program.successfulReferrals}</dd></div>
          <div><dt className="text-ink-3">{t("memberExperience.remainingRewards")}</dt><dd className="mt-0.5 text-[16px] font-semibold tabular text-ink">{program.remainingDays}</dd></div>
        </dl>
        <p className="mt-2 text-[12px] leading-4 text-ink-3">{t("memberExperience.rewardLimit", { limit: program.maxRewardDaysPerWindow, window: program.windowDays })}</p>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <h3 className="text-[13px] font-medium text-ink">{t("memberExperience.rewardHistory")}</h3>
        {program.history.length === 0 ? (
          <p className="mt-1 text-[12.5px] leading-5 text-ink-3">{t("memberExperience.noRewards", { reward: dayWord(program.rewardDays) })}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line" aria-label={t("memberExperience.referralHistory")}>
            {program.history.map((event) => {
              const meta = REFERRAL_STATUS_META(t)[event.status];
              return (
                <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
                  <span className="w-24 shrink-0 text-ink-3">{fmt.date(event.occurredAt)}</span>
                  <Badge variant={meta.tone}>{meta.label}</Badge>
                  <span className="font-medium tabular text-ink">{event.days > 0 ? t("memberExperience.rewardDaysAdded", { count: event.days }) : t("memberExperience.zeroDays")}</span>
                  <span className="min-w-0 flex-1 basis-full text-[12px] text-ink-3 sm:basis-auto">{meta.explanation}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function fallbackGym(membership: CustomerMembership, t: TFunction): MarketplaceGym {
  const name = membership.gymName ?? t("memberExperience.gym");
  return {
    id: membership.gymId,
    name,
    shortName: name.slice(0, 12).toUpperCase(),
    tagline: "",
    description: "",
    city: "",
    areas: [],
    category: t("memberExperience.gym"),
    audience: t("memberExperience.allMembers"),
    memberCount: 0,
    branchCount: 1,
    fromPriceMinor: 0,
    amenities: [],
    accent: "#15140f",
    featured: false,
    subscriptionStatus: "active",
    rivetPlan: "Starter",
    joinedAt: membership.startDate,
    lastActiveAt: membership.lastCheckInAt,
    monthlyRevenueMinor: 0,
    branches: [{ id: membership.branchId, name: membership.branchName ?? t("memberExperience.branch"), area: "", address: membership.branchName ?? t("memberExperience.branch"), trialSlots: [] }],
  };
}

function VisitHistory({ visits }: { visits: CustomerVisit[] }) {
  const t = useT();
  const fmt = useFormat();
  return (
    <section aria-labelledby="visit-history-title">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 id="visit-history-title" className="text-[12px] font-medium text-ink-3">{t("memberExperience.visitHistory")}</h2>
        <span className="text-[12px] tabular text-ink-3">{t("memberExperience.recordedCount", { count: visits.length })}</span>
      </header>
      {visits.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-ink-2">{t("memberExperience.noVisits")}</p>
      ) : (
        <ol className="divide-y divide-line">
          {visits.map((visit) => (
            <li key={visit.id} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2">
                <ScanLine className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{fmt.weekday(visit.occurredAt)} · {fmt.date(visit.occurredAt)}</p>
                <p className="mt-0.5 text-[12px] text-ink-3">{fmt.time(visit.occurredAt)} · {visit.branchName}</p>
                <p className="mt-0.5 text-[12px] text-ink-3">{t("memberExperience.checkedInAs")}{" "}{visit.memberName}</p>
              </div>
              <Badge variant="outline">{visit.decision === "overridden" ? t("memberExperience.letInByStaff") : t("memberExperience.checkedIn")}</Badge>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ActivityHistory({ membership, visits }: { membership: CustomerMembership; visits: CustomerVisit[] }) {
  const fmt = useFormat();
  const t = useT();
  const activity = membership.activity ?? [];
  const count = activity.length || visits.length;
  return (
    <details className="panel overflow-hidden">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13.5px] font-semibold">
        <span>{t("dashboard.owner.recentActivity")}</span>
        <span className="text-[12px] font-normal tabular text-ink-3">{t("memberExperience.recordedCount", { count })}</span>
      </summary>
      <div className="border-t border-line">
        {activity.length ? (
          <ol className="divide-y divide-line">
            {activity.map((item) => (
              <li key={item.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{item.title}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">{item.detail ? `${item.detail} · ` : ""}{fmt.dateTime(item.occurredAt)}</p>
                  </div>
                  {item.href ? <Link href={item.href} className="shrink-0 text-[12.5px] font-medium text-ink underline underline-offset-4">{t("memberProfile.timeline.viewReceipt")}</Link> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <VisitHistory visits={visits} />
        )}
      </div>
    </details>
  );
}

function CustomerPtPanel({ membershipId, gymName, branchNames }: { membershipId: string; gymName: string; branchNames: Map<string, string> }) {
  const timeZone = useFormattingTimeZone();
  const fmt = useFormat();
  const { t, isolate } = useLocale();
  const invalidate = useInvalidate();
  const [trainerId, setTrainerId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(() => addDays(todayISODate(timeZone), 1));
  const [rescheduleBookingId, setRescheduleBookingId] = useState<string>();
  const experience = useRealtimeApiQuery({
    queryKey: ["customer", ...qk.ptMember(membershipId)],
    query: (api) => api.getCustomerPtExperience(membershipId),
    subscribe: (api, onValue, onError) => api.subscribeCustomerPtExperience(membershipId, onValue, onError),
  });
  const selectedTrainer = experience.data?.trainers.find((item) => item.id === trainerId);
  // PT bookings are writes. Never silently choose the trainer's first branch;
  // the member must select the concrete branch for this booking.
  const selectedBranchId = branchId;
  const slots = useApiQuery(
    ["customer", "pt", "slots", membershipId, trainerId, selectedBranchId, date],
    (api) => api.listCustomerPtAvailableSlots({ membershipId, trainerProfileId: trainerId, branchId: selectedBranchId, from: date, to: date }),
    { enabled: Boolean(trainerId && selectedBranchId) },
  );
  const book = useApiMutation(
    (api, startsAt: string) => rescheduleBookingId ? api.rescheduleCustomerPtBooking({ bookingId: rescheduleBookingId, trainerProfileId: trainerId, branchId: selectedBranchId, startsAt, reason: "Rescheduled by member", idempotencyKey: crypto.randomUUID() }) : api.createCustomerPtBooking({ membershipId, trainerProfileId: trainerId, branchId: selectedBranchId, startsAt, idempotencyKey: crypto.randomUUID() }),
    { onSuccess: async () => { toast.success(rescheduleBookingId ? t("memberExperience.ptRescheduled") : t("memberExperience.ptBooked")); setRescheduleBookingId(undefined); await invalidate([["customer"]]); } },
  );
  // Cancelling is confirmed first, and the toast repeats what the server
  // actually did to the credit instead of assuming.
  const [cancelBooking, setCancelBooking] = useState<PtBooking>();
  const cancel = useApiMutation(
    (api, bookingId: string) => api.cancelCustomerPtBooking(bookingId, "Cancelled by member"),
    { onSuccess: async (result) => { toast.success(result.status === "late_cancelled" ? t("memberExperience.ptLateCancelled") : t("memberExperience.ptCancelled")); setCancelBooking(undefined); await invalidate([["customer"]]); } },
  );
  const requestPackage = useApiMutation(
    (api, packageId: string) => api.requestCustomerPtPackage({ membershipId, packageId, idempotencyKey: crypto.randomUUID() }),
    { onSuccess: async () => { toast.success(t("memberExperience.ptPackageRequested")); await invalidate([["customer"]]); } },
  );

  // The panel exists as soon as the tab is chosen; loading and failure are
  // states inside it, so the tab never points at nothing.
  if (experience.isLoading) return <div className="mt-4" role="tabpanel" aria-label={t("palette.notificationGroups.family.pt")} aria-busy="true"><Skeleton className="h-80 w-full" /></div>;
  if (experience.isError) return <div className="mt-4" role="tabpanel" aria-label={t("palette.notificationGroups.family.pt")}><ErrorState layout="section" title={t("memberExperience.ptLoadError")} onRetry={() => experience.refetch()} /></div>;
  const value = experience.data!;
  const cutoffHours = value.cancellationCutoffHours ?? PT_DEFAULT_CANCELLATION_CUTOFF_HOURS;
  const nextBooking = ptNextBooking(value.upcomingBookings);
  const canPickSlot = (value.availableSessions > 0 || Boolean(rescheduleBookingId)) && Boolean(trainerId && selectedBranchId);
  return (
    <div className="mt-4 space-y-4" role="tabpanel" aria-label={t("palette.notificationGroups.family.pt")}>
      {experience.isBackgroundError ? <ErrorState layout="inline" title={t("memberExperience.ptRefreshError")} description={t("memberExperience.staleData")} onRetry={() => experience.refetch()} /> : null}
      <dl className="grid grid-cols-3 divide-x rtl:divide-x-reverse divide-line rounded-lg border border-line bg-surface">
        <PtStat label={t("memberExperience.available")} value={String(value.availableSessions)} />
        <PtStat label={t("memberProfile.pt.bookingStatus.reserved")} value={String(value.reservedSessions)} />
        <PtStat label={t("memberExperience.nextSession")} value={nextBooking ? fmt.dateTime(nextBooking.startsAt) : t("memberExperience.none")} />
      </dl>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
        <section className="panel p-4 sm:p-5" aria-labelledby="pt-booking-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="pt-booking-title" className="text-[16px] font-semibold">{rescheduleBookingId ? t("memberExperience.chooseNewTime") : t("memberExperience.bookTrainer")}</h2>
              <p className="mt-1 text-[13px] text-ink-2">{t("memberExperience.ptChoose", { gym: isolate(gymName) })}</p>
            </div>
            {rescheduleBookingId ? <Button size="sm" variant="ghost" onClick={() => setRescheduleBookingId(undefined)}>{t("memberExperience.keepCurrentTime")}</Button> : null}
          </div>
          {value.availableSessions <= 0 && !rescheduleBookingId ? (
            <div className="mt-4 rounded-md border border-warning/30 bg-warning-bg p-4 text-[13px] text-warning-deep" role="status">{t("memberExperience.noPtCredit")}</div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label={t("members.tabs.pt.trainer")} htmlFor="pt-trainer">
                <select id="pt-trainer" className={SELECT_CLASS} value={trainerId} onChange={(event) => { setTrainerId(event.target.value); setBranchId(""); }}>
                  <option value="">{t("memberExperience.chooseTrainer")}</option>
                  {value.trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.displayName}</option>)}
                </select>
              </Field>
              <Field label={t("common.label.branch")} htmlFor="pt-branch">
                <select id="pt-branch" className={SELECT_CLASS} disabled={!selectedTrainer} value={selectedBranchId} onChange={(event) => setBranchId(event.target.value)}>
                  <option value="">{t("members.bulk.chooseBranch")}</option>
                  {selectedTrainer?.branchIds.map((id) => <option key={id} value={id}>{branchNames.get(id) ?? id}</option>)}
                </select>
              </Field>
              <Field label={t("common.label.date")} htmlFor="pt-date">
                <Input id="pt-date" type="date" className="h-11 sm:h-9" min={todayISODate(timeZone)} value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
            </div>
          )}
          {canPickSlot ? (
            <div className="mt-5">
              <p className="text-[12px] font-medium text-ink-3">{t("members.tabs.pt.availableTimes")}</p>
              {slots.isLoading ? <p className="mt-2 text-[13px] text-ink-3" role="status">{t("memberExperience.loadingTimes")}</p> : slots.data?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {slots.data.map((slot) => (
                    <Button key={slot.startsAt} size="sm" variant="secondary" loading={book.isPending} onClick={() => book.mutate(slot.startsAt)}>
                      {rescheduleBookingId ? t("memberExperience.moveTo") : ""}{new Intl.DateTimeFormat("en-JO", { hour: "numeric", minute: "2-digit" }).format(new Date(slot.startsAt))}
                    </Button>
                  ))}
                </div>
              ) : <p className="mt-2 text-[13px] text-ink-2">{t("memberExperience.noFreeTimes")}</p>}
            </div>
          ) : null}
        </section>

        <section className="panel overflow-hidden" aria-labelledby="pt-packages-title">
          <header className="border-b border-line px-4 py-3"><h2 id="pt-packages-title" className="text-[14px] font-semibold">{t("memberProfile.pt.packages")}</h2></header>
          <div className="divide-y divide-line">
            {value.packages.length ? value.packages.map((item) => (
              <article key={item.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold">{item.name}</p>
                  <p className="mt-0.5 text-[12px] text-ink-3">{t("memberExperience.packageTerms", { sessions: item.sessionCount, days: item.validityDays })}</p>
                  <p className="mt-1 text-[13px]"><MoneyText money={item.totalPrice} /></p>
                </div>
                <Button size="sm" variant="secondary" loading={requestPackage.isPending} onClick={() => requestPackage.mutate(item.id)}>{t("memberExperience.request")}</Button>
              </article>
            )) : <p className="p-5 text-[13px] text-ink-2">{t("memberExperience.noPtPackages")}</p>}
          </div>
          {value.orders.length ? (
            <div className="border-t border-line p-4">
              <p className="text-[12px] font-medium text-ink-3">{t("memberExperience.packageRequests")}</p>
              <ul className="mt-2 space-y-2">
                {value.orders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="min-w-0 truncate">{order.packageNameSnapshot ?? order.packageName ?? t("memberExperience.ptPackage")}</span>
                    <Badge variant="outline">{PT_ORDER_LABELS(t)[order.status]}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <section className="panel overflow-hidden" aria-labelledby="pt-upcoming-title">
        <header className="border-b border-line px-4 py-3"><h2 id="pt-upcoming-title" className="text-[14px] font-semibold">{t("members.tabs.pt.upcomingBookings")}</h2><p className="mt-0.5 text-[12px] text-ink-3">{t("memberExperience.ptCutoff", { hours: cutoffHours })}</p></header>
        {value.upcomingBookings.length ? (
          <div className="divide-y divide-line">
            {value.upcomingBookings.map((booking) => {
              const awaiting = ptBookingAwaitsOutcome(booking);
              const beforeCutoff = ptBookingBeforeCutoff(booking, cutoffHours);
              return (
                <article key={booking.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium">{booking.trainerName}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3"><DateTimeText iso={booking.startsAt} /> · {branchNames.get(booking.branchId) ?? booking.branchName}</p>
                  </div>
                  {awaiting ? (
                    <>
                      <Badge variant="warning">{t("memberExperience.waitingTrainer")}</Badge>
                      <p className="w-full text-[12px] text-ink-3">{t("memberExperience.awaitingOutcome")}</p>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline">{PT_BOOKING_LABELS(t)[booking.status]}</Badge>
                      {beforeCutoff ? <Button size="sm" variant="secondary" onClick={() => { setRescheduleBookingId(booking.id); setTrainerId(booking.trainerProfileId); setBranchId(booking.branchId); setDate(booking.startsAt.slice(0, 10)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t("memberExperience.changeTime")}</Button> : null}
                      <Button size="sm" variant="ghost" loading={cancel.isPending && cancel.variables === booking.id} onClick={() => setCancelBooking(booking)}>{t("common.action.cancel")}</Button>
                      {!beforeCutoff ? <p className="w-full text-[12px] text-warning-deep">{t("memberExperience.ptLateHint", { hours: cutoffHours })}</p> : null}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        ) : <p className="p-5 text-[13px] text-ink-2">{t("memberExperience.noPtBookings")}</p>}
      </section>

      <Dialog open={Boolean(cancelBooking)} onOpenChange={(open) => { if (!open && !cancel.isPending) setCancelBooking(undefined); }}>
        <DialogContent className="max-w-md">
          {cancelBooking ? (() => {
            const returnsCredit = ptBookingBeforeCutoff(cancelBooking, cutoffHours);
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{t("memberExperience.cancelPtTitle")}</DialogTitle>
                  <DialogDescription>{t("memberExperience.ptCancelDescription", { date: fmt.dateTime(cancelBooking.startsAt), trainer: isolate(cancelBooking.trainerName ?? "") })}</DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <p role="status" className={cn("rounded-md border p-3 text-[13px]", returnsCredit ? "border-line bg-sunken text-ink-2" : "border-warning/30 bg-warning-bg text-warning-deep")}>{returnsCredit ? t("memberExperience.ptReturnsCredit") : t("memberExperience.ptLosesCredit", { hours: cutoffHours })}</p>
                </DialogBody>
                <DialogFooter>
                  <Button variant="secondary" disabled={cancel.isPending} onClick={() => setCancelBooking(undefined)}>{t("memberExperience.keepSession")}</Button>
                  <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate(cancelBooking.id)}>{t("memberExperience.cancelSession")}</Button>
                </DialogFooter>
              </>
            );
          })() : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PtStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 p-3 sm:p-4">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className="mt-1 truncate text-[15px] font-semibold tabular text-ink">{value}</dd>
    </div>
  );
}

function FreezeRequestCard({ membershipId }: { membershipId: string }) {
  const timeZone = useFormattingTimeZone();
  const fmt = useFormat();
  const { t, isolate } = useLocale();
  const invalidate = useInvalidate();
  const requestsQuery = useApiQuery(["customerFreezeRequests", membershipId] as const, (api) => api.listCustomerFreezeRequests(membershipId));
  const policyQuery = useApiQuery(["customerFreezePolicy", membershipId] as const, (api) => api.getCustomerFreezePolicy(membershipId));
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState("");
  const pending = requestsQuery.data?.find((item) => item.status === "pending");
  const latestDecided = requestsQuery.data?.find((item) => item.status !== "pending");

  const submit = useApiMutation((api) => api.requestMembershipFreeze({ membershipId, startDate, days, reason: reason.trim() }), {
    onSuccess: async () => {
      setOpen(false);
      setStartDate("");
      setReason("");
      await invalidate([["customerFreezeRequests", membershipId], ["customerFreezePolicy", membershipId]]);
    },
    successMessage: t("memberExperience.freezeRequested"),
  });

  if (requestsQuery.isLoading || policyQuery.isLoading) return <Skeleton className="h-20 w-full" />;
  if (requestsQuery.isError || policyQuery.isError) {
    return <ErrorState layout="section" title={t("memberExperience.freezeLoadError")} description={t("memberExperience.freezeLoadDescription")} onRetry={() => { void requestsQuery.refetch(); void policyQuery.refetch(); }} />;
  }
  const policy = policyQuery.data!;
  if (!policy.requestsEnabled && !pending && !latestDecided) return null;

  const fee = (minor: number) => fmt.money(money(minor, policy.currency));
  const summary = pending
    ? `${t("memberExperience.freezePending", { count: pending.days, date: fmt.date(pending.startDate) })}${pending.expectedFeeMinor > 0 ? ` ${t("memberExperience.expectedFee", { fee: fee(pending.expectedFeeMinor) })}` : ""}`
    : latestDecided
      ? `${latestDecided.status === "approved" ? (latestDecided.feeMinor ?? 0) > 0 ? t("memberExperience.freezeApprovedFee", { fee: fee(latestDecided.feeMinor ?? 0) }) : t("memberExperience.freezeApproved") : t("memberExperience.freezeDenied")}${latestDecided.decisionNote ? ` ${isolate(latestDecided.decisionNote)}` : ""}`
      : policy.requestsEnabled ? t("memberExperience.freezePrompt") : t("memberExperience.freezeDisabled");
  const invalidDays = !Number.isSafeInteger(days) || days < policy.minimumDays || days > policy.maximumDays;

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="freeze-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="freeze-title" className="text-[14px] font-semibold">{t("memberProfile.followUp.evidenceKind.freeze")}</h2>
          <p className="mt-1 text-[13px] text-ink-2">{summary}</p>
        </div>
        {!pending && policy.requestsEnabled ? <Button size="sm" variant="secondary" onClick={() => { setDays(Math.max(policy.minimumDays, Math.min(7, policy.maximumDays))); setOpen(true); }}>{t("memberExperience.requestFreeze")}</Button> : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("memberExperience.requestFreeze")}</DialogTitle>
            <DialogDescription>{t("memberExperience.freezeReview")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label={t("common.label.from")} htmlFor="freeze-start" required>
              <Input id="freeze-start" type="date" className="h-11 sm:h-9" min={todayISODate(timeZone)} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </Field>
            <Field label={t("memberExperience.days")} htmlFor="freeze-days" hint={t("memberExperience.freezeRange", { minimum: policy.minimumDays, maximum: policy.maximumDays })} error={startDate && invalidDays ? t("memberExperience.freezeRange", { minimum: policy.minimumDays, maximum: policy.maximumDays }) : undefined} required>
              <Input id="freeze-days" type="text" inputMode="numeric" dir="ltr" className="h-11 sm:h-9" value={Number.isNaN(days) ? "" : days} onChange={(event) => setDays(Number(latinDigits(event.target.value)))} />
            </Field>
            <Field label={t("memberExperience.freezeReason")} htmlFor="freeze-reason" required>
              <Textarea id="freeze-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("memberExperience.freezeReasonPlaceholder")} />
            </Field>
            <div className="rounded-md border border-line bg-sunken px-3 py-2.5 text-[13px] text-ink-2">
              {policy.expectedFeeMinor > 0 ? <p>{t("memberExperience.freezeFee", { fee: fee(policy.expectedFeeMinor) })}</p> : <p>{t("memberExperience.freeFreeze")}</p>}
              <p className="mt-1 text-[12px] text-ink-3">{t("memberExperience.freezeFinalFee")}</p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t("common.action.cancel")}</Button>
            <Button loading={submit.isPending} disabled={!startDate || !reason.trim() || invalidDays} onClick={() => submit.mutate()}>{t("memberExperience.sendRequest")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function GateLoading() {
  const t = useT();
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4" role="status" aria-label={t("memberExperience.checkingAccess")}>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-sunken-2">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-ink" />
      </div>
    </main>
  );
}
