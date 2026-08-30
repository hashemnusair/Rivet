"use client";

import { ArrowLeft, CalendarDays, Copy, CreditCard, Dumbbell, Gift, MapPin, QrCode, ScanLine, Share2, Ticket, Users } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { getApi } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { Input, Textarea } from "@/components/ui/input";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import type { CustomerMembership, CustomerReferralProgram, CustomerVisit, MarketplaceGym } from "@/lib/public/experience-data";
import { cn } from "@/lib/utils/cn";
import { addDays, daysFromToday, diffDays, formatDate, formatDateTime, formatTime, formatWeekday, todayISODate } from "@/lib/utils/dates";

export default function MembershipDetailClient({ membershipId }: { membershipId: string }) {
  const searchParams = useSearchParams();
  const { memberships } = useExperience();
  const gyms = useMarketplaceGyms();
  const { ready, identitySignedIn } = useMemberGate();
  const membership = memberships.find((item) => item.id === membershipId);
  const [tab, setTab] = useState<"membership" | "pt">(() => searchParams.get("section") === "pt" ? "pt" : "membership");
  const [qrOpen, setQrOpen] = useState(false);
  const [qrToken, setQrToken] = useState("");
  const [qrExpiresAt, setQrExpiresAt] = useState<string>();
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string>();

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

  // A subscription may remain active even when the gym is not eligible for
  // public Find Gyms discovery. Use the authenticated membership projection
  // as the fallback so members never lose access to their own dashboard.
  const gym = gyms.find((item) => item.id === membership.gymId) ?? fallbackGym(membership);
  const branch = gym.branches.find((item) => item.id === membership.branchId);
  const total = Math.max(diffDays(membership.startDate, membership.endDate), 1);
  const elapsed = Math.min(Math.max(diffDays(membership.startDate, todayISODate()), 0), total);
  const daysLeft = Math.max(daysFromToday(membership.endDate), 0);
  const openQr = async () => {
    setQrOpen(true);
    setQrToken("");
    setQrExpiresAt(undefined);
    setQrError(undefined);
    setQrLoading(true);
    try {
      const pass = await getApi().getEntryPass(membership.id);
      setQrToken(pass.token);
      setQrExpiresAt(pass.expiresAt);
    } catch (error) {
      setQrError(error instanceof Error ? error.message : "The entry QR could not be prepared.");
    } finally {
      setQrLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link href="/customer/my-gyms" className="inline-flex items-center gap-2 text-[12.5px] text-ink-3 transition-colors hover:text-ink">
        <ArrowLeft className="size-3.5" /> Dashboard
      </Link>

      <div className="mt-4 h-28 overflow-hidden rounded-lg border border-line bg-cover bg-center" role="img" aria-label={`${gym.name} cover image`} style={{ backgroundColor: gym.accent, backgroundImage: membership.gymCoverUrl ?? gym.cover?.url ? `linear-gradient(rgb(0 0 0 / .28), rgb(0 0 0 / .28)), url(${membership.gymCoverUrl ?? gym.cover?.url})` : undefined }} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-md font-mono text-[9px] font-semibold uppercase text-white"
            style={{ backgroundColor: gym.accent, backgroundImage: membership.gymLogoUrl ?? gym.logo?.url ? `url(${membership.gymLogoUrl ?? gym.logo?.url})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }}
            aria-hidden
          >
            {membership.gymLogoUrl ?? gym.logo?.url ? null : gym.shortName.slice(0, 5)}
          </span>
          <div>
            <h1 className="font-display text-[22px] font-semibold tracking-tight">{gym.name}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-3">
              <MapPin className="size-3" /> {branch?.address ?? "Branch unavailable"}
            </p>
          </div>
        </div>
        <Button onClick={() => void openQr()}><QrCode /> Show entry QR</Button>
      </div>

      <div className="mt-5 flex w-fit rounded-lg border border-line bg-surface p-1" role="tablist" aria-label={`${gym.name} account sections`}>
        <button type="button" role="tab" aria-selected={tab === "membership"} onClick={() => setTab("membership")} className={cn("rounded-md px-3 py-2 text-[12.5px] font-medium", tab === "membership" ? "bg-ink text-paper" : "text-ink-3 hover:text-ink")}>Membership details</button>
        <button type="button" role="tab" aria-selected={tab === "pt"} onClick={() => setTab("pt")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-medium", tab === "pt" ? "bg-ink text-paper" : "text-ink-3 hover:text-ink")}><Dumbbell className="size-3.5" /> PT</button>
      </div>

      {tab === "membership" ? <div className="mt-5 space-y-5">
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between text-[12.5px]"><span className="text-ink-3">{formatDate(membership.startDate)}</span><span className={cn("font-medium", daysLeft <= 14 ? "text-warning-deep" : "text-ink-2")}>{daysLeft} days left</span><span className="text-ink-3">{formatDate(membership.endDate)}</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken-2"><div className={cn("h-full rounded-full", daysLeft <= 14 ? "bg-warning" : "bg-ink")} style={{ width: `${Math.round((elapsed / total) * 100)}%` }} /></div>
        </div>
        <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4"><Stat icon={<Ticket />} label="Plan" value={membership.planName} /><Stat icon={<CalendarDays />} label="Valid until" value={formatDate(membership.endDate)} /><Stat icon={<ScanLine />} label="Visits · all time" value={String(membership.totalCheckIns ?? membership.visitHistory.length)} /><Stat icon={<CreditCard />} label="Balance" value={`JD ${(membership.balanceMinor / 1000).toFixed(3)}`} /></div>
        <FreezeRequestCard membershipId={membership.id} />
        {membership.referral?.enabled ? <ReferralCard initialProgram={membership.referral} gymName={gym.name} /> : null}
        <div className="rounded-lg border border-line bg-surface p-4"><p className="eyebrow">Membership details</p><dl className="mt-3 grid gap-3 text-[12.5px] sm:grid-cols-2"><div><dt className="text-ink-3">Member number</dt><dd className="mt-1 font-mono">{membership.memberNumber}</dd></div><div><dt className="text-ink-3">Branch</dt><dd className="mt-1">{branch?.name ?? "Branch unavailable"}</dd></div><div><dt className="text-ink-3">Started</dt><dd className="mt-1">{formatDate(membership.startDate)}</dd></div><div><dt className="text-ink-3">Ends</dt><dd className="mt-1">{formatDate(membership.endDate)} · {daysLeft} days</dd></div></dl></div>
      </div> : <CustomerPtPanel membershipId={membership.id} gymName={gym.name} branchNames={new Map(gym.branches.map((item) => [item.id, item.name]))} />}
      <ActivityHistory membership={membership} visits={membership.visitHistory ?? []} />
      <Dialog open={qrOpen} onOpenChange={(open) => { setQrOpen(open); if (!open) { setQrToken(""); setQrError(undefined); } }}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>{gym.name} entry QR</DialogTitle></DialogHeader><DialogBody className="text-center">{qrLoading ? <div className="flex min-h-64 items-center justify-center text-[12.5px] text-ink-3" role="status">Preparing a short-lived entry pass…</div> : qrError ? <div role="alert" className="rounded-md border border-danger/30 bg-danger-bg px-3 py-4 text-left text-[12.5px] text-danger">{qrError}<Button className="mt-3" size="sm" variant="secondary" onClick={() => void openQr()}>Try again</Button></div> : qrToken ? <><div className="mx-auto w-fit rounded-lg border border-line bg-white p-5"><QRCodeSVG value={qrToken} size={224} level="H" bgColor="#ffffff" fgColor="#15140f" aria-label="Membership entry QR code" /></div><p className="mt-4 font-mono text-[18px] tracking-wide">{membership.memberNumber}</p><p className="mt-3 text-[11.5px] text-ink-3">Expires {qrExpiresAt ? formatDateTime(qrExpiresAt) : "soon"}. Close this window when finished.</p></> : null}</DialogBody></DialogContent></Dialog>
    </main>
  );
}

function ReferralCard({ initialProgram, gymName }: { initialProgram: CustomerReferralProgram; gymName: string }) {
  const [program, setProgram] = useState(initialProgram);
  useEffect(() => setProgram(initialProgram), [initialProgram]);
  const ensureLink = useApiMutation((api, membershipId: string) => api.ensureCustomerReferralLink(membershipId), { onSuccess: setProgram });
  const sharePath = program.sharePath;
  const progress = program.maxRewardDaysPerWindow > 0 ? Math.min(100, Math.round((program.earnedDays / program.maxRewardDaysPerWindow) * 100)) : 0;
  const copy = async () => {
    if (!sharePath) return;
    try { await navigator.clipboard.writeText(new URL(sharePath, window.location.origin).toString()); toast.success("Referral link copied."); }
    catch { toast.error("The link could not be copied. Try Share instead."); }
  };
  const share = async () => {
    if (!sharePath) return;
    const shareUrl = new URL(sharePath, window.location.origin).toString();
    if (!navigator.share) { await copy(); return; }
    try { await navigator.share({ title: `Join me at ${gymName}`, text: `Book a trial at ${gymName} through my member referral.`, url: shareUrl }); }
    catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; toast.error("The share sheet could not be opened."); }
  };
  return <section className="overflow-hidden rounded-lg border border-line bg-surface" aria-labelledby="referral-title">
    <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
      <div className="p-5"><span className="flex size-9 items-center justify-center rounded-md bg-success-bg text-success-deep"><Gift className="size-4" aria-hidden /></span><p className="eyebrow mt-4">Member referrals</p><h2 id="referral-title" className="mt-1 font-display text-[18px] font-semibold">Bring a friend. Earn {program.rewardDays} free day{program.rewardDays === 1 ? "" : "s"}.</h2><p className="mt-2 max-w-2xl text-[12.5px] leading-5 text-ink-2">Share your link. If your friend books through it and buys their first membership, {gymName} applies the reward automatically.</p><div className="mt-4 flex flex-wrap gap-2">{sharePath ? <><Button onClick={() => void share()}><Share2 /> Share link</Button><Button variant="secondary" onClick={() => void copy()}><Copy /> Copy</Button></> : <Button loading={ensureLink.isPending} onClick={() => ensureLink.mutate(program.membershipId)}><Share2 /> Create my link</Button>}</div></div>
      <div className="border-t border-line bg-sunken p-5 lg:border-s lg:border-t-0"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-[12.5px] font-medium text-ink"><Users className="size-4 text-ink-3" /> Reward progress</span><span className="font-mono text-[11px] text-ink-3">{program.earnedDays}/{program.maxRewardDaysPerWindow} days</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken-2"><div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${progress}%` }} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-[11.5px]"><div><dt className="text-ink-3">Successful referrals</dt><dd className="mt-1 text-[16px] font-semibold text-ink">{program.successfulReferrals}</dd></div><div><dt className="text-ink-3">Days still available</dt><dd className="mt-1 text-[16px] font-semibold text-ink">{program.remainingDays}</dd></div></dl><p className="mt-4 text-[10.5px] leading-4 text-ink-3">The {program.maxRewardDaysPerWindow}-day cap looks back {program.windowDays} days. A referral counts once, after the first membership sale.</p></div>
    </div>
  </section>;
}

function fallbackGym(membership: CustomerMembership): MarketplaceGym {
  const name = membership.gymName ?? "Gym";
  return {
    id: membership.gymId,
    name,
    shortName: name.slice(0, 12).toUpperCase(),
    tagline: "",
    description: "",
    city: "",
    areas: [],
    category: "Gym",
    audience: "All members",
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
    branches: [{ id: membership.branchId, name: membership.branchName ?? "Branch", area: "", address: membership.branchName ?? "Branch", trialSlots: [] }],
  };
}

function VisitHistory({ visits }: { visits: CustomerVisit[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface" aria-labelledby="visit-history-title">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 id="visit-history-title" className="eyebrow">Visit history</h2>
        <span className="text-[11px] tabular text-ink-3">{visits.length} recorded</span>
      </header>
      {visits.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12.5px] text-ink-3">Your check-ins will appear here after you visit this gym.</p>
      ) : (
        <ol className="divide-y divide-line">
          {visits.map((visit) => (
            <li key={visit.id} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2">
                <ScanLine className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{formatWeekday(visit.occurredAt)} · {formatDate(visit.occurredAt)}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-3">{formatTime(visit.occurredAt)} · {visit.branchName}</p>
                <p className="mt-1 text-[11px] text-ink-3">Checked in as {visit.memberName}</p>
              </div>
              <Badge variant="outline">{visit.decision === "overridden" ? "Override accepted" : "Checked in"}</Badge>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ActivityHistory({ membership, visits }: { membership: CustomerMembership; visits: CustomerVisit[] }) {
  const activity = membership.activity ?? [];
  const count = activity.length || visits.length;
  return <details className="overflow-hidden rounded-lg border border-line bg-surface"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13px] font-semibold"><span>Recent activity</span><span className="font-mono text-[10.5px] font-normal text-ink-3">{count} recorded</span></summary><div className="border-t border-line">{activity.length ? <ol className="divide-y divide-line">{activity.map((item) => <li key={item.id} className="px-4 py-3"><div className="flex items-start justify-between gap-3"><div><p className="text-[13px] font-medium">{item.title}</p><p className="mt-0.5 text-[11.5px] text-ink-3">{item.detail ? `${item.detail} · ` : ""}{formatDateTime(item.occurredAt)}</p></div>{item.href ? <Link href={item.href} className="shrink-0 text-[11.5px] font-medium text-ink underline underline-offset-4">View receipt</Link> : null}</div></li>)}</ol> : <VisitHistory visits={visits} />}</div></details>;
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

function FreezeRequestCard({ membershipId }: { membershipId: string }) {
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
    successMessage: "Freeze request sent. The gym will confirm it.",
  });

  if (requestsQuery.isLoading || policyQuery.isLoading) return <Skeleton className="h-24 w-full" />;
  if (requestsQuery.isError || policyQuery.isError) return <section className="rounded-lg border border-line bg-surface p-4"><ErrorState title="Freeze details could not be loaded" description="RIVET could not safely check your existing requests or the gym's current policy." onRetry={() => { void requestsQuery.refetch(); void policyQuery.refetch(); }} /></section>;
  const policy = policyQuery.data!;
  if (!policy.requestsEnabled && !pending && !latestDecided) return null;

  return (
    <section className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Freeze</p>
          <p className="mt-1 text-[12.5px] text-ink-2">
            {pending
              ? `Requested ${pending.days} days from ${pending.startDate} — waiting for the gym${pending.expectedFeeMinor > 0 ? ` (expected fee JOD ${(pending.expectedFeeMinor / 1000).toFixed(3)})` : ""}.`
              : latestDecided
                ? `Last request ${latestDecided.status}${latestDecided.status === "approved" && (latestDecided.feeMinor ?? 0) > 0 ? ` · fee JOD ${((latestDecided.feeMinor ?? 0) / 1000).toFixed(3)}` : ""}${latestDecided.decisionNote ? ` — ${latestDecided.decisionNote}` : ""}.`
                : policy.requestsEnabled ? "Need a break? Ask the gym to pause your membership." : "This gym is not accepting new freeze requests right now."}
          </p>
        </div>
        {!pending && policy.requestsEnabled ? <Button size="sm" variant="secondary" onClick={() => { setDays(Math.max(policy.minimumDays, Math.min(7, policy.maximumDays))); setOpen(true); }}>Request a freeze</Button> : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request a freeze</DialogTitle>
          </DialogHeader>
          <DialogBody className="grid gap-3">
            <label className="grid gap-1.5 text-[12px] font-medium">From<Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label className="grid gap-1.5 text-[12px] font-medium">Days<Input type="number" min={policy.minimumDays} max={policy.maximumDays} value={days} onChange={(event) => setDays(Number(event.target.value))} /><span className="text-[11px] font-normal text-ink-3">Choose {policy.minimumDays} to {policy.maximumDays} days.</span></label>
            <label className="grid gap-1.5 text-[12px] font-medium">Why?<Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Travel, injury, exams…" /></label>
            <div className="rounded-md border border-line bg-sunken px-3 py-2.5 text-[12px] text-ink-2">
              {policy.expectedFeeMinor > 0 ? <p>This request currently carries a <MoneyText money={{ amount: policy.expectedFeeMinor, currency: policy.currency }} /> fee, collected at the desk if approved.</p> : <p>This request is free under the gym&apos;s current policy.</p>}
              <p className="mt-1 text-[11px] text-ink-3">The gym recalculates the fee when it approves the request.</p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={submit.isPending} disabled={!startDate || !reason.trim() || !Number.isSafeInteger(days) || days < policy.minimumDays || days > policy.maximumDays} onClick={() => submit.mutate()}>Send request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
