"use client";

import { ArrowLeft, CalendarDays, CreditCard, Dumbbell, MapPin, Phone, ScanLine, Ticket } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { isConvexMode } from "@/lib/api/ConvexGymOSApi";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { addDays, daysFromToday, diffDays, formatDate, formatDateTime, todayISODate } from "@/lib/utils/dates";

export default function MembershipDetailClient({ membershipId }: { membershipId: string }) {
  const searchParams = useSearchParams();
  const { memberships } = useExperience();
  const gyms = useMarketplaceGyms();
  const { ready, identitySignedIn } = useMemberGate();
  const membership = memberships.find((item) => item.id === membershipId);
  const [tab, setTab] = useState<"membership" | "pt">(() => searchParams.get("section") === "pt" ? "pt" : "membership");

  // A membership card, its QR and its balance are never shown to a visitor.
  if (!ready || !identitySignedIn) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-4" role="status" aria-label="Checking access">
        <div className="h-1 w-40 overflow-hidden rounded-full bg-sunken-2">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-ink" />
        </div>
      </main>
    );
  }

  if (!membership) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-display text-[22px] font-semibold tracking-tight">Membership not found</h1>
        <Button asChild className="mt-5">
          <Link href="/customer/my-gyms">Back to dashboard</Link>
        </Button>
      </main>
    );
  }

  const gym = gyms.find((item) => item.id === membership.gymId);
  const branch = gym?.branches.find((item) => item.id === membership.branchId);
  if (!gym || !branch) {
    return <main className="mx-auto max-w-md px-4 py-24 text-center"><h1 className="font-display text-[22px] font-semibold tracking-tight">Gym information unavailable</h1><Button asChild className="mt-5"><Link href="/customer/my-gyms">Back to dashboard</Link></Button></main>;
  }
  const total = Math.max(diffDays(membership.startDate, membership.endDate), 1);
  const elapsed = Math.min(Math.max(diffDays(membership.startDate, todayISODate()), 0), total);
  const daysLeft = Math.max(daysFromToday(membership.endDate), 0);
  const signedEntryPass = isConvexMode();

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link href="/customer/my-gyms" className="inline-flex items-center gap-2 text-[12.5px] text-ink-3 transition-colors hover:text-ink">
        <ArrowLeft className="size-3.5" /> Dashboard
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-md font-mono text-[9px] font-semibold uppercase text-white"
            style={{ backgroundColor: gym.accent }}
            aria-hidden
          >
            {gym.shortName.slice(0, 5)}
          </span>
          <div>
            <h1 className="font-display text-[22px] font-semibold tracking-tight">{gym.name}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <MapPin className="size-3" /> {branch.address}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="signal" disabled>Online renewal not available</Button>
          <Button asChild variant="secondary">
            <Link href={`/customer/gyms/${gym.id}`}>Gym page</Link>
          </Button>
        </div>
      </div>

      <div className="mt-5 flex w-fit rounded-lg border border-line bg-surface p-1" role="tablist" aria-label={`${gym.name} account sections`}>
        <button type="button" role="tab" aria-selected={tab === "membership"} onClick={() => setTab("membership")} className={cn("rounded-md px-3 py-2 text-[12.5px] font-medium", tab === "membership" ? "bg-ink text-paper" : "text-ink-3 hover:text-ink")}>Membership</button>
        <button type="button" role="tab" aria-selected={tab === "pt"} onClick={() => setTab("pt")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-medium", tab === "pt" ? "bg-ink text-paper" : "text-ink-3 hover:text-ink")}><Dumbbell className="size-3.5" /> Personal training</button>
      </div>

      {tab === "membership" ? <div className="mt-5 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="night-surface overflow-hidden rounded-lg bg-night text-night-ink">
          <div className="flex items-center justify-between border-b border-night-line px-4 py-2.5">
            <p className="eyebrow-night">Entry pass</p>
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-success">
              <span className="size-1.5 rounded-full bg-success" /> Valid
            </span>
          </div>
          <div className="p-4">
            <div className="rounded-md bg-white p-4">
              {signedEntryPass && membership.qrValue ? <QRCodeSVG value={membership.qrValue} size={232} level="H" bgColor="#ffffff" fgColor="#15140f" className="h-auto w-full" aria-label="Membership entry QR code" /> : <p className="px-3 py-16 text-center text-[12px] text-ink-3">Signed entry pass unavailable.</p>}
            </div>
            <p className="mt-4 font-mono text-[18px] tracking-wide">{membership.memberNumber}</p>
            <p className="mt-0.5 text-[11.5px] text-night-ink-3">{branch.name}</p>
            <p className="mt-4 border-t border-night-line pt-3 text-[11px] leading-relaxed text-night-ink-3">
              {signedEntryPass ? "Short-lived signed entry pass. Refresh before entry if it expires." : "Entry passes require the configured production signing service."}
            </p>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between text-[12.5px]">
              <span className="text-ink-3">{formatDate(membership.startDate)}</span>
              <span className={cn("font-medium", daysLeft <= 14 ? "text-warning-deep" : "text-ink-2")}>{daysLeft} days left</span>
              <span className="text-ink-3">{formatDate(membership.endDate)}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken-2">
              <div
                className={cn("h-full rounded-full", daysLeft <= 14 ? "bg-warning" : "bg-ink")}
                style={{ width: `${Math.round((elapsed / total) * 100)}%` }}
              />
            </div>
          </div>

          <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={<Ticket />} label="Plan" value={membership.planName} />
            <Stat icon={<CalendarDays />} label="Valid until" value={formatDate(membership.endDate)} />
            <Stat icon={<ScanLine />} label="Visits · month" value={String(membership.visitsThisMonth)} />
            <Stat icon={<CreditCard />} label="Balance" value={`JD ${(membership.balanceMinor / 1000).toFixed(3)}`} />
          </div>

          <div className="rounded-lg border border-line bg-surface">
            <p className="eyebrow border-b border-line px-4 py-2.5">Activity</p>
            <ul className="divide-y divide-line">
              <Row title="Last check-in" detail={`${branch.name} · ${formatDateTime(membership.lastCheckInAt)}`} />
              <Row title="Membership started" detail={formatDate(membership.startDate)} />
              <Row title="Renewal due" detail={`${formatDate(membership.endDate)} · ${daysLeft} days`} />
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
            <Phone className="size-4 text-ink-3" aria-hidden />
            <p className="flex-1 text-[12.5px] text-ink-2">Questions about this membership? The gym front desk can freeze, transfer, or renew it.</p>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/customer/gyms/${gym.id}`}>Contact {gym.shortName}</Link>
            </Button>
          </div>
        </div>
      </div> : <CustomerPtPanel membershipId={membership.id} gymName={gym.name} branchNames={new Map(gym.branches.map((item) => [item.id, item.name]))} />}
    </main>
  );
}

function CustomerPtPanel({ membershipId, gymName, branchNames }: { membershipId: string; gymName: string; branchNames: Map<string, string> }) {
  const invalidate = useInvalidate();
  const [trainerId, setTrainerId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [date, setDate] = useState(() => addDays(todayISODate(), 1));
  const [rescheduleBookingId, setRescheduleBookingId] = useState<string>();
  const experience = useRealtimeApiQuery({
    queryKey: ["customer", ...qk.ptMember(membershipId)],
    query: (api) => api.getCustomerPtExperience(membershipId),
    subscribe: (api, onValue, onError) => api.subscribeCustomerPtExperience(membershipId, onValue, onError),
  });
  const selectedTrainer = experience.data?.trainers.find((item) => item.id === trainerId);
  const selectedBranchId = branchId || selectedTrainer?.branchIds[0] || "";
  const slots = useApiQuery(
    ["customer", "pt", "slots", membershipId, trainerId, selectedBranchId, date],
    (api) => api.listCustomerPtAvailableSlots({ membershipId, trainerProfileId: trainerId, branchId: selectedBranchId, from: date, to: date }),
    { enabled: Boolean(trainerId && selectedBranchId) },
  );
  const book = useApiMutation(
    (api, startsAt: string) => rescheduleBookingId ? api.rescheduleCustomerPtBooking({ bookingId: rescheduleBookingId, trainerProfileId: trainerId, branchId: selectedBranchId, startsAt, reason: "Rescheduled by member", idempotencyKey: crypto.randomUUID() }) : api.createCustomerPtBooking({ membershipId, trainerProfileId: trainerId, branchId: selectedBranchId, startsAt, idempotencyKey: crypto.randomUUID() }),
    { onSuccess: async () => { toast.success(rescheduleBookingId ? "Your PT session was rescheduled." : "Your PT session is reserved."); setRescheduleBookingId(undefined); await invalidate(); } },
  );
  const cancel = useApiMutation(
    (api, bookingId: string) => api.cancelCustomerPtBooking(bookingId, "Cancelled by member"),
    { onSuccess: async () => { toast.success("Booking cancelled. Your credit balance has been updated."); await invalidate(); } },
  );
  const requestPackage = useApiMutation(
    (api, packageId: string) => api.requestCustomerPtPackage({ membershipId, packageId, idempotencyKey: crypto.randomUUID() }),
    { onSuccess: async () => { toast.success("Package request created. Credits activate only after full payment is recorded by the gym."); await invalidate(); } },
  );

  if (experience.isLoading) return <Skeleton className="mt-5 h-80 w-full" />;
  if (experience.isError) return <div className="mt-5"><ErrorState title="Personal training could not be loaded" onRetry={() => experience.refetch()} /></div>;
  const value = experience.data!;
  return (
    <div className="mt-5 space-y-5" role="tabpanel" aria-label="Personal training">
      <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
        <Stat icon={<Dumbbell />} label="Available sessions" value={String(value.availableSessions)} />
        <Stat icon={<CalendarDays />} label="Reserved" value={String(value.reservedSessions)} />
        <Stat icon={<Ticket />} label="Next booking" value={value.upcomingBookings[0] ? formatDateTime(value.upcomingBookings[0].startsAt) : "None"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
        <section className="rounded-lg border border-line bg-surface p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-[17px] font-semibold">{rescheduleBookingId ? "Choose a new time" : "Book with a trainer"}</h2><p className="mt-1 text-[12px] text-ink-3">Choose a published {gymName} trainer and an open 60-minute slot.</p></div>{rescheduleBookingId ? <Button size="sm" variant="ghost" onClick={() => setRescheduleBookingId(undefined)}>Keep booking</Button> : null}</div>
          {value.availableSessions <= 0 && !rescheduleBookingId ? (
            <div className="mt-4 rounded-md border border-warning/30 bg-warning-bg p-4 text-[12.5px] text-warning-deep">You have no usable PT sessions. Request a package from the catalog; its credits become available after the gym records full payment.</div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-[11px] font-medium">Trainer<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[12.5px]" value={trainerId} onChange={(event) => { setTrainerId(event.target.value); setBranchId(""); }}><option value="">Choose trainer</option>{value.trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.displayName}</option>)}</select></label>
              <label className="grid gap-1 text-[11px] font-medium">Branch<select className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[12.5px]" disabled={!selectedTrainer} value={selectedBranchId} onChange={(event) => setBranchId(event.target.value)}><option value="">Choose branch</option>{selectedTrainer?.branchIds.map((id) => <option key={id} value={id}>{branchNames.get(id) ?? id}</option>)}</select></label>
              <label className="grid gap-1 text-[11px] font-medium">Date<input className="h-10 rounded-md border border-line-2 bg-surface px-3 text-[12.5px]" type="date" min={todayISODate()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
            </div>
          )}
          {(value.availableSessions > 0 || Boolean(rescheduleBookingId)) && trainerId && selectedBranchId ? <div className="mt-5"><p className="eyebrow">Available times</p>{slots.isLoading ? <p className="mt-3 text-[12px] text-ink-3">Loading current availability…</p> : slots.data?.length ? <div className="mt-3 flex flex-wrap gap-2">{slots.data.map((slot) => <Button key={slot.startsAt} size="sm" variant="secondary" loading={book.isPending} onClick={() => book.mutate(slot.startsAt)}>{rescheduleBookingId ? "Move to " : ""}{new Intl.DateTimeFormat("en-JO", { hour: "numeric", minute: "2-digit" }).format(new Date(slot.startsAt))}</Button>)}</div> : <p className="mt-3 text-[12px] text-ink-3">No open slots on this date.</p>}</div> : null}
        </section>

        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          <header className="border-b border-line px-4 py-3"><p className="eyebrow">PT packages</p></header>
          <div className="divide-y divide-line">{value.packages.length ? value.packages.map((item) => <article key={item.id} className="flex items-start justify-between gap-3 p-4"><div><p className="text-[13px] font-semibold">{item.name}</p><p className="mt-1 text-[11.5px] text-ink-3">{item.sessionCount} sessions · valid {item.validityDays} days</p><p className="mt-1 text-[13px]"><MoneyText money={item.totalPrice} /></p></div><Button size="sm" variant="secondary" loading={requestPackage.isPending} onClick={() => requestPackage.mutate(item.id)}>Request</Button></article>) : <p className="p-5 text-[12px] text-ink-3">This gym has no active PT packages.</p>}</div>
          {value.orders.length ? <div className="border-t border-line p-4"><p className="eyebrow">Package orders</p><ul className="mt-2 space-y-2">{value.orders.map((order) => <li key={order.id} className="flex items-center justify-between text-[11.5px]"><span className="font-mono">{order.id.slice(0, 8)}</span><Badge variant="outline">{order.status.replaceAll("_", " ")}</Badge></li>)}</ul></div> : null}
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border border-line bg-surface">
        <header className="border-b border-line px-4 py-3"><p className="eyebrow">Upcoming bookings</p></header>
        {value.upcomingBookings.length ? <div className="divide-y divide-line">{value.upcomingBookings.map((booking) => <article key={booking.id} className="flex flex-wrap items-center gap-3 p-4"><div className="min-w-0 flex-1"><p className="text-[13px] font-medium">{booking.trainerName}</p><p className="mt-0.5 text-[11.5px] text-ink-3"><DateTimeText iso={booking.startsAt} /> · {branchNames.get(booking.branchId) ?? booking.branchName}</p></div><Badge variant="outline">{booking.status}</Badge><Button size="sm" variant="secondary" onClick={() => { setRescheduleBookingId(booking.id); setTrainerId(booking.trainerProfileId); setBranchId(booking.branchId); setDate(booking.startsAt.slice(0, 10)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Reschedule</Button><Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(booking.id)}>Cancel</Button></article>)}</div> : <p className="p-5 text-[12px] text-ink-3">No upcoming PT bookings.</p>}
      </section>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-surface p-4">
      <p className="flex items-center gap-1.5 eyebrow [&_svg]:size-3.5">
        {icon} {label}
      </p>
      <p className="mt-2 truncate text-[15px] font-semibold">{value}</p>
    </div>
  );
}

function Row({ title, detail }: { title: string; detail: string }) {
  return (
    <li className="px-4 py-3">
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mt-0.5 text-[12px] text-ink-3">{detail}</p>
    </li>
  );
}
