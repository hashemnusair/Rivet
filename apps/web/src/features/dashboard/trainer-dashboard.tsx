"use client";

import { ArrowRight, CalendarClock, CheckCircle2, Clock3, UserRound, XCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/chrome";
import { DateTimeText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import type { PtBooking } from "@/lib/domain/types";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp } from "@/lib/providers/app-providers";
import { useState } from "react";
import { BookingOutcomeConfirmation } from "@/features/personal-training/booking-outcome-confirmation";
import { useT } from "@/lib/i18n/provider";

export function TrainerDashboard() {
  const t = useT();
  const { session } = useApp();
  const invalidate = useInvalidate();
  const [bookingAction, setBookingAction] = useState<{ booking: PtBooking; action: "completed" | "no_show" }>();
  const workspace = useRealtimeApiQuery({
    queryKey: qk.ptWorkspace,
    query: (api) => api.getPtWorkspace(),
    subscribe: (api, onValue, onError) => api.subscribePtWorkspace(onValue, onError),
    enabled: Boolean(session),
  });
  const outcome = useApiMutation(
    (api, input: { booking: PtBooking; result: "completed" | "no_show"; reason?: string }) => input.result === "completed" ? api.completePtBooking(input.booking.id) : api.markPtBookingNoShow(input.booking.id, { reason: input.reason }),
    { onSuccess: async (_, input) => { await invalidate(); setBookingAction(undefined); toast.success(input.result === "completed" ? t("dashboard.trainer.sessionCompleted") : t("dashboard.trainer.noShowRecorded")); } },
  );

  if (workspace.isError) return <ErrorState title={t("dashboard.trainer.loadFailed")} onRetry={() => workspace.refetch()} />;

  const active = (workspace.data?.bookings ?? []).filter((booking) => ["reserved", "confirmed"].includes(booking.status));
  const timezone = session?.organization.timezone ?? "Asia/Amman";
  const today = dateKey(Date.now(), timezone);
  const todayBookings = active.filter((booking) => dateKey(Date.parse(booking.startsAt), timezone) === today);
  const upcoming = active.filter((booking) => Date.parse(booking.startsAt) > Date.now()).slice(0, 8);
  const members = [...new Map((workspace.data?.bookings ?? []).map((booking) => [booking.memberId, { id: booking.memberId, name: booking.memberName }])).values()];

  return <div className="space-y-5">
    <PageHeader
      eyebrow={t("dashboard.trainer.eyebrow")}
      title={`Today, ${session?.user.name.split(" ")[0] ?? "coach"}`}
      description={t("dashboard.trainer.description")}
      actions={<Button asChild><Link href="/pt">{t("dashboard.trainer.openCalendar")} <ArrowRight /></Link></Button>}
    />

    <section className="panel grid grid-cols-2 divide-x divide-line sm:grid-cols-4">
      <Metric label={t("dashboard.trainer.sessionsToday")} value={todayBookings.length} loading={workspace.isLoading} />
      <Metric label={t("dashboard.trainer.upcoming")} value={active.filter((booking) => Date.parse(booking.startsAt) > Date.now()).length} loading={workspace.isLoading} />
      <Metric label={t("dashboard.trainer.assignedMembers")} value={members.length} loading={workspace.isLoading} />
      <Metric label={t("dashboard.trainer.noShows")} value={workspace.data?.metrics.noShows ?? 0} loading={workspace.isLoading} />
    </section>

    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <section className="panel overflow-hidden">
        <header className="flex items-center justify-between border-b border-line px-4 py-3"><div><p className="eyebrow">{t("dashboard.trainer.today")}</p><h2 className="mt-1 text-[14px] font-semibold">{t("dashboard.trainer.sessionOutcomes")}</h2></div><Clock3 className="size-4 text-ink-3" /></header>
        {workspace.isLoading ? <div className="space-y-3 p-4"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div> : todayBookings.length ? <div className="divide-y divide-line">{todayBookings.map((booking) => {
          const started = Date.parse(booking.startsAt) <= Date.now();
          return <article key={booking.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1"><Link href={`/members/${booking.memberId}`} className="text-[13px] font-semibold hover:underline">{booking.memberName}</Link><p className="mt-1 text-[11px] text-ink-3"><DateTimeText iso={booking.startsAt} /> · {booking.branchName}</p>{!started ? <p className="mt-1 text-[10px] text-ink-3">{t("dashboard.trainer.outcomesLocked")}</p> : null}</div>
            <Badge variant="outline">{booking.status}</Badge>
            <div className="flex gap-1"><Button size="sm" variant="secondary" disabled={!started || outcome.isPending} onClick={() => setBookingAction({ booking, action: "completed" })}><CheckCircle2 /> {t("dashboard.trainer.complete")}</Button><Button size="sm" variant="ghost" disabled={!started || outcome.isPending} onClick={() => setBookingAction({ booking, action: "no_show" })}><XCircle /> {t("dashboard.trainer.noShow")}</Button></div>
          </article>;
        })}</div> : <div className="px-5 py-12 text-center"><CheckCircle2 className="mx-auto size-5 text-success" /><p className="mt-3 text-[12px] font-medium">{t("dashboard.trainer.noSessionsToday")}</p><p className="mt-1 text-[10.5px] text-ink-3">{t("dashboard.trainer.noSessionsDetail")}</p></div>}
      </section>

      <section className="panel overflow-hidden">
        <header className="flex items-center justify-between border-b border-line px-4 py-3"><div><p className="eyebrow">{t("dashboard.trainer.next")}</p><h2 className="mt-1 text-[14px] font-semibold">{t("dashboard.trainer.upcomingCalendar")}</h2></div><CalendarClock className="size-4 text-ink-3" /></header>
        {workspace.isLoading ? <div className="p-4"><Skeleton className="h-28 w-full" /></div> : upcoming.length ? <div className="divide-y divide-line">{upcoming.map((booking) => <article key={booking.id} className="flex items-center gap-3 px-4 py-3"><span className="flex size-8 items-center justify-center rounded-full bg-sunken"><UserRound className="size-3.5" /></span><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-medium">{booking.memberName}</p><p className="mt-0.5 text-[10px] text-ink-3"><DateTimeText iso={booking.startsAt} /> · {booking.branchName}</p></div></article>)}</div> : <p className="p-8 text-center text-[11px] text-ink-3">{t("dashboard.trainer.noUpcoming")}</p>}
      </section>
    </div>

    <section className="panel overflow-hidden"><header className="border-b border-line px-4 py-3"><p className="eyebrow">{t("dashboard.trainer.coachingContext")}</p><h2 className="mt-1 text-[14px] font-semibold">{t("dashboard.trainer.assignedMembersHeading")}</h2></header>{workspace.isLoading ? <div className="p-4"><Skeleton className="h-14 w-full" /></div> : members.length ? <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">{members.map((member) => <Link key={member.id} href={`/members/${member.id}`} className="flex items-center gap-3 p-4 hover:bg-sunken"><span className="flex size-9 items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-paper">{initials(member.name)}</span><span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{member.name}</span><ArrowRight className="size-3.5 text-ink-3" /></Link>)}</div> : <p className="p-8 text-center text-[11px] text-ink-3">{t("dashboard.trainer.membersAppear")}</p>}</section>
    <BookingOutcomeConfirmation booking={bookingAction?.booking} action={bookingAction?.action} open={Boolean(bookingAction)} pending={outcome.isPending} onOpenChange={(open) => { if (!open) setBookingAction(undefined); }} onConfirm={({ booking, action, reason }) => outcome.mutate({ booking, result: action as "completed" | "no_show", reason })} />
  </div>;
}

function Metric({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return <div className="p-4"><p className="eyebrow">{label}</p>{loading ? <Skeleton className="mt-2 h-7 w-12" /> : <p className="mt-2 text-[22px] font-semibold tabular-nums">{value}</p>}</div>;
}

function dateKey(timestamp: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "M";
}
