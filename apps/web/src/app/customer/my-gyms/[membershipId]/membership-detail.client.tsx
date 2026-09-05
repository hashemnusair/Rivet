"use client";

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
import type { CustomerClassOccurrence } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import type { CustomerMembership, CustomerReferralProgram, CustomerReferralRewardEvent, CustomerVisit, MarketplaceGym } from "@/lib/public/experience-data";
import { membershipDisplayStatus, type MembershipDisplayStatus } from "@/lib/public/membership-status";
import { cn } from "@/lib/utils/cn";
import { addDays, diffDays, formatDate, formatDateTime, formatTime, formatWeekday, todayISODate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";

type Section = "membership" | "classes" | "pt";

function sectionFromParam(value: string | null): Section {
  return value === "pt" || value === "classes" ? value : "membership";
}

const SELECT_CLASS = "h-11 w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px] text-ink transition-colors hover:border-line-3 focus:border-[var(--tenant-brand-primary)] disabled:cursor-not-allowed disabled:opacity-50 sm:h-9";

export default function MembershipDetailClient({ membershipId }: { membershipId: string }) {
  return (
    <Suspense fallback={<GateLoading />}>
      <MembershipDetail membershipId={membershipId} />
    </Suspense>
  );
}

function MembershipDetail({ membershipId }: { membershipId: string }) {
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
        <h1 className="font-display text-[22px] font-semibold tracking-tight">Membership not found</h1>
        <p className="mt-2 text-[13.5px] text-ink-2">This membership is not linked to your account, or the link is out of date.</p>
        <Button asChild className="mt-5">
          <Link href="/customer/my-gyms">Back to home</Link>
        </Button>
      </main>
    );
  }

  // A subscription may remain active even when the gym is not eligible for
  // public Find Gyms discovery. Use the authenticated membership projection
  // as the fallback so members never lose access to their own dashboard.
  const gym = gyms.find((item) => item.id === membership.gymId) ?? fallbackGym(membership);
  const branch = gym.branches.find((item) => item.id === membership.branchId);
  const status = membershipDisplayStatus(membership);
  const cover = membership.gymCoverUrl ?? gym.cover?.url;

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <Link href="/customer/my-gyms" className="inline-flex min-h-8 items-center gap-1.5 rounded-xs text-[13px] text-ink-3 transition-colors hover:text-ink">
        <ArrowLeft className="size-3.5" aria-hidden /> Home
      </Link>

      {cover ? <div className="mt-4 h-32 overflow-hidden rounded-lg border border-line bg-cover bg-center sm:h-40" role="img" aria-label={`${gym.name} cover image`} style={{ backgroundImage: `url(${cover})` }} /> : null}

      <header className="mt-4 flex flex-wrap items-center gap-3 sm:gap-4">
        <GymMark name={gym.name} shortName={gym.shortName} logoUrl={membership.gymLogoUrl ?? gym.logo?.url} accent={gym.accent} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[24px] font-semibold leading-tight tracking-tight">{gym.name}</h1>
          <p className="mt-1 flex items-start gap-1.5 text-[13px] text-ink-2">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />
            <span>{branch ? `${branch.name} · ${branch.address}` : "Branch unavailable"}</span>
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setQrOpen(true)}><QrCode /> Show entry QR</Button>
      </header>

      <SegmentedTabs
        className="mt-5"
        label={`${gym.name} account sections`}
        value={section}
        onChange={setSection}
        items={[
          { value: "membership", label: "Membership" },
          { value: "classes", label: <><CalendarDays className="size-3.5" aria-hidden /> Classes</>, name: "Classes" },
          { value: "pt", label: <><Dumbbell className="size-3.5" aria-hidden /> PT</>, name: "PT" },
        ]}
      />

      {section === "membership" ? (
        <div className="mt-4 space-y-4" role="tabpanel" aria-label="Membership">
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
    </main>
  );
}

function MembershipSummary({ membership, gym, branchName, status }: { membership: CustomerMembership; gym: MarketplaceGym; branchName?: string; status: MembershipDisplayStatus }) {
  const total = Math.max(diffDays(membership.startDate, membership.endDate), 1);
  const elapsed = Math.min(Math.max(diffDays(membership.startDate, todayISODate()), 0), total);
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
        <p className="mt-3 text-[13px] text-ink-2">Renewals are handled at the desk. Ask {gym.name} about your next membership; your visit history stays here.</p>
      ) : (
        <div className="mt-3" aria-hidden>
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken-2">
            <div className={cn("h-full rounded-full", status.key === "ending" ? "bg-warning" : "bg-ink")} style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[12px] text-ink-3">
            <span>Started {formatDate(membership.startDate)}</span>
            <span>Ends {formatDate(membership.endDate)}</span>
          </div>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line pt-4 text-[13px] sm:grid-cols-4">
        <Fact label="Member number"><span className="font-mono text-[12.5px]">{membership.memberNumber}</span></Fact>
        <Fact label="Branch">{branchName ?? "Branch unavailable"}</Fact>
        <Fact label="Visits · all time"><span className="tabular">{membership.totalCheckIns ?? membership.visitHistory.length}</span></Fact>
        <Fact label="Balance"><MoneyText money={money(membership.balanceMinor)} className={membership.balanceMinor > 0 ? "font-medium text-warning-deep" : undefined} /></Fact>
      </dl>

      {phone ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <Button variant="secondary" size="sm" asChild>
            <a href={`https://wa.me/${phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(`Hi ${gym.name}, I have a question about my membership.`)}`} target="_blank" rel="noreferrer"><MessageCircle /> WhatsApp the gym</a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={`tel:${phone}`}><Phone /> Call</a>
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
  const invalidate = useInvalidate();
  const experience = useApiQuery(qk.customerClasses(membershipId), (api) => api.getCustomerClassExperience(membershipId));
  // One day at a time, bounded to the rolling week. The view resets to the new
  // week automatically when the week rolls over.
  const [panelView, setPanelView] = useState<"week" | "history">("week");
  const [selectedDate, setSelectedDate] = useState(() => todayISODate());
  const autoAdvanced = useRef(false);
  // Land on the first day of the week that actually has classes, once, so a
  // member never opens onto an empty day when later days have sessions.
  useEffect(() => {
    const upcoming = experience.data?.upcoming;
    if (!upcoming || autoAdvanced.current) return;
    autoAdvanced.current = true;
    const start = todayISODate();
    const end = addDays(start, 6);
    const firstWithClasses = upcoming
      .map((occurrence) => occurrence.date)
      .filter((value) => value >= start && value <= end)
      .sort()[0];
    if (firstWithClasses) setSelectedDate(firstWithClasses);
  }, [experience.data]);
  const book = useApiMutation((api, occurrenceId: string) => api.bookCustomerClass({ membershipId, occurrenceId }), {
    onSuccess: async (result) => {
      toast.success(result.outcome === "waitlisted" ? "You joined the waitlist." : "Class booked.");
      await invalidate([qk.customerClasses(membershipId)]);
    },
  });
  const cancel = useApiMutation((api, occurrenceId: string) => api.cancelCustomerClass({ membershipId, occurrenceId }), {
    onSuccess: async (result) => {
      toast.success(result.outcome === "late_cancelled" ? "Late cancellation recorded. No fee or membership penalty was added." : "Class booking cancelled.");
      await invalidate([qk.customerClasses(membershipId)]);
    },
  });

  if (experience.isLoading) return <div className="mt-4 grid gap-3 sm:grid-cols-2" role="tabpanel" aria-label="Classes" aria-busy="true"><Skeleton className="h-56 w-full" /><Skeleton className="h-56 w-full" /></div>;
  if (experience.isError) return <div className="mt-4" role="tabpanel" aria-label="Classes"><ErrorState layout="section" title="Classes could not be loaded" description="Your membership was not changed. Try again to load the live timetable." onRetry={() => experience.refetch()} /></div>;
  const value = experience.data!;
  if (!value.policy.enabled) {
    return (
      <section className="panel mt-4 p-6 text-center" role="tabpanel" aria-label="Classes">
        <CalendarDays className="mx-auto size-6 text-ink-3" aria-hidden />
        <h2 className="mt-3 text-[16px] font-semibold">Class booking is handled at reception</h2>
        <p className="mt-1 text-[13px] text-ink-2">{value.gymName} has not switched on member self-booking yet. Ask the desk to reserve a spot.</p>
      </section>
    );
  }

  const today = todayISODate();
  // Rolling seven days, matching the staff view's dated window: a new day
  // opens at the far end as each day passes.
  const weekEnd = addDays(today, 6);
  const date = selectedDate < today ? today : selectedDate > weekEnd ? weekEnd : selectedDate;
  const dayOccurrences = value.upcoming.filter((occurrence) => occurrence.date === date);
  const attendedCount = value.history.filter((occurrence) => occurrence.booking?.status === "attended").length;

  return (
    <div className="mt-4 space-y-4" role="tabpanel" aria-label="Classes">
      {experience.isBackgroundError ? <ErrorState layout="inline" title="The timetable could not be refreshed" description="Showing the last loaded classes. Try again to check for changes." onRetry={() => experience.refetch()} /> : null}
      {value.profileCorrectionRequired ? (
        <div className="rounded-md border border-warning/30 bg-warning-bg px-4 py-3 text-[13px] text-warning-deep" role="status">
          Choose female or male in <Link href="/customer/profile" className="font-semibold underline underline-offset-4">your profile</Link> before booking. RIVET never guesses for audience-restricted classes.
        </div>
      ) : null}

      <SegmentedTabs
        label="Classes views"
        value={panelView}
        onChange={setPanelView}
        items={[
          { value: "week", label: "This week" },
          { value: "history", label: <>My history{attendedCount ? <span className="tabular text-[12px] font-normal text-ink-3">{attendedCount}</span> : null}</>, name: "My history" },
        ]}
      />

      {panelView === "week" ? (
        <section aria-label="This week's classes">
          <div className="flex items-center justify-between gap-3">
            <Button variant="secondary" size="icon" aria-label="Previous day" disabled={date <= today} onClick={() => setSelectedDate(addDays(date, -1))}><ChevronLeft /></Button>
            <div className="min-w-0 text-center">
              <h3 className="text-[15px] font-semibold">{date === today ? "Today" : date === addDays(today, 1) ? "Tomorrow" : formatWeekday(`${date}T12:00:00Z`)} · {formatDate(date)}</h3>
              <p className="text-[12px] text-ink-3">Next 7 days. A new day opens as each one passes.</p>
            </div>
            <Button variant="secondary" size="icon" aria-label="Next day" disabled={date >= weekEnd} onClick={() => setSelectedDate(addDays(date, 1))}><ChevronRight /></Button>
          </div>
          <div key={date} className="mt-3">
            {dayOccurrences.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {dayOccurrences.map((occurrence) => (
                  <CustomerClassCard
                    key={occurrence.id}
                    occurrence={occurrence}
                    busy={(book.isPending && book.variables === occurrence.id) || (cancel.isPending && cancel.variables === occurrence.id)}
                    onBook={() => book.mutate(occurrence.id)}
                    onCancel={() => cancel.mutate(occurrence.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="panel p-8 text-center">
                <CalendarDays className="mx-auto size-6 text-ink-3" aria-hidden />
                <h3 className="mt-3 text-[15px] font-semibold">No classes on this day</h3>
                <p className="mt-1 text-[13px] text-ink-2">Use the arrows to check the rest of the week.</p>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section aria-label="My class history" className="panel overflow-hidden">
          {value.history.length ? (
            <div className="divide-y divide-line">
              {value.history.map((occurrence) => {
                const bookingStatus = occurrence.booking?.status;
                return (
                  <div key={occurrence.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium">{occurrence.name}</p>
                      <p className="mt-0.5 text-[12px] text-ink-3">{formatDateTime(occurrence.startsAt)}{occurrence.coachName ? ` · ${occurrence.coachName}` : ""}</p>
                    </div>
                    <Badge variant={bookingStatus === "attended" ? "success" : bookingStatus === "no_show" ? "warning" : "outline"}>
                      {bookingStatus === "attended" ? "Attended" : bookingStatus === "no_show" ? "No-show" : bookingStatus ? bookingStatus.replaceAll("_", " ") : "Not booked"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center">
              <CalendarDays className="mx-auto size-6 text-ink-3" aria-hidden />
              <h3 className="mt-3 text-[15px] font-semibold">No classes yet</h3>
              <p className="mt-1 text-[13px] text-ink-2">Classes you attend will appear here.</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function CustomerClassCard({ occurrence, busy, onBook, onCancel }: { occurrence: CustomerClassOccurrence; busy: boolean; onBook: () => void; onCancel: () => void }) {
  const active = occurrence.booking && ["booked", "waitlisted"].includes(occurrence.booking.status);
  const full = occurrence.spotsRemaining === 0;
  const minutes = Math.round((Date.parse(occurrence.endsAt) - Date.parse(occurrence.startsAt)) / 60_000);
  return (
    <article className="panel overflow-hidden">
      {occurrence.imageUrl ? <div className="h-24 bg-cover bg-center" role="img" aria-label={occurrence.imageAltText ?? occurrence.name} style={{ backgroundImage: `url(${occurrence.imageUrl})` }} /> : null}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-[14px] font-semibold">{occurrence.name}</h4>
            <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-ink-2"><Clock3 className="size-3.5 text-ink-3" aria-hidden /> {formatTime(occurrence.startsAt)} · {minutes} min</p>
          </div>
          <Badge variant="outline">{occurrence.audience === "mixed" ? "Everyone" : occurrence.audience === "women" ? "Women" : "Men"}</Badge>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-y border-line py-2.5 text-[12.5px]">
          <span className="flex min-w-0 items-center gap-1.5 text-ink-2"><UserRoundCheck className="size-3.5 shrink-0 text-ink-3" aria-hidden /> <span className="truncate">{occurrence.coachName ?? "Coach to be confirmed"}</span></span>
          <span className={cn("shrink-0 tabular", full ? "font-medium text-warning-deep" : "text-ink-3")}>{full ? `${occurrence.waitlistCount} waiting` : `${occurrence.spotsRemaining} spots left`}</span>
        </div>
        {active ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-success-deep">{occurrence.booking?.status === "waitlisted" ? `Waitlist · #${occurrence.booking.position ?? "—"}` : occurrence.booking?.fromWaitlist ? "Booked from waitlist" : "Booked"}</p>
              <p className="mt-0.5 text-[12px] text-ink-3">Cancel any time. A late cancellation is recorded without a fee.</p>
            </div>
            <Button size="sm" variant="secondary" loading={busy} onClick={onCancel}>Cancel</Button>
          </div>
        ) : (
          <div className="mt-3">
            <Button className="w-full" loading={busy} disabled={!occurrence.canBook} onClick={onBook}>{full ? "Join waitlist" : "Book class"}</Button>
            {occurrence.bookingBlockReason ? <p className="mt-2 text-[12px] leading-4 text-ink-2">{occurrence.bookingBlockReason}</p> : null}
          </div>
        )}
      </div>
    </article>
  );
}

const REFERRAL_STATUS_META: Record<CustomerReferralRewardEvent["status"], { label: string; explanation: string; tone: "success" | "warning" | "neutral" }> = {
  applied: { label: "Applied", explanation: "Your friend bought their first membership, so the free days were added.", tone: "success" },
  capped: { label: "Capped", explanation: "This landed after the reward cap for the current window was reached.", tone: "warning" },
  ineligible: { label: "Not applied", explanation: "There was no active membership to extend when the reward landed.", tone: "neutral" },
  pending: { label: "Waiting", explanation: "Counts once your friend buys their first membership.", tone: "neutral" },
};

function ReferralCard({ initialProgram, gymName }: { initialProgram: CustomerReferralProgram; gymName: string }) {
  const [program, setProgram] = useState(initialProgram);
  useEffect(() => setProgram(initialProgram), [initialProgram]);
  const ensureLink = useApiMutation((api, membershipId: string) => api.ensureCustomerReferralLink(membershipId), { onSuccess: setProgram });
  const sharePath = program.sharePath;
  const progress = program.maxRewardDaysPerWindow > 0 ? Math.min(100, Math.round((program.earnedDays / program.maxRewardDaysPerWindow) * 100)) : 0;
  const dayWord = (days: number) => `${days} free day${days === 1 ? "" : "s"}`;
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
  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="referral-title">
      <h2 id="referral-title" className="text-[16px] font-semibold leading-tight">Bring a friend. Earn {dayWord(program.rewardDays)}.</h2>
      <p className="mt-1 text-[13px] text-ink-2">Share your link. When a friend books through it and buys their first membership, {gymName} adds the free days to yours.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {sharePath ? (
          <>
            <Button size="sm" onClick={() => void share()}><Share2 /> Share link</Button>
            <Button size="sm" variant="secondary" onClick={() => void copy()}><Copy /> Copy</Button>
          </>
        ) : (
          <Button size="sm" loading={ensureLink.isPending} onClick={() => ensureLink.mutate(program.membershipId)}><Share2 /> Create my link</Button>
        )}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="font-medium text-ink">Reward progress</span>
          <span className="tabular text-ink-3">{program.earnedDays}/{program.maxRewardDaysPerWindow} days</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken-2" aria-hidden><div className="h-full rounded-full bg-success" style={{ width: `${progress}%` }} /></div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
          <div><dt className="text-ink-3">Successful referrals</dt><dd className="mt-0.5 text-[16px] font-semibold tabular text-ink">{program.successfulReferrals}</dd></div>
          <div><dt className="text-ink-3">Days still available</dt><dd className="mt-0.5 text-[16px] font-semibold tabular text-ink">{program.remainingDays}</dd></div>
        </dl>
        <p className="mt-2 text-[12px] leading-4 text-ink-3">The {program.maxRewardDaysPerWindow}-day cap looks back {program.windowDays} days. A referral counts once, after the first membership sale.</p>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <h3 className="text-[13px] font-medium text-ink">Reward history</h3>
        {program.history.length === 0 ? (
          <p className="mt-1 text-[12.5px] leading-5 text-ink-3">No rewards yet. Your first {dayWord(program.rewardDays)} arrive after a friend joins through your link and buys their first membership.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line" aria-label="Referral reward history">
            {program.history.map((event) => {
              const meta = REFERRAL_STATUS_META[event.status];
              return (
                <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[13px]">
                  <span className="w-24 shrink-0 text-ink-3">{formatDate(event.occurredAt)}</span>
                  <Badge variant={meta.tone}>{meta.label}</Badge>
                  <span className="font-medium tabular text-ink">{event.days > 0 ? `+${event.days} day${event.days === 1 ? "" : "s"}` : "0 days"}</span>
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
    <section aria-labelledby="visit-history-title">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 id="visit-history-title" className="text-[12px] font-medium text-ink-3">Visit history</h2>
        <span className="text-[12px] tabular text-ink-3">{visits.length} recorded</span>
      </header>
      {visits.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-ink-2">Your check-ins will appear here after you visit this gym.</p>
      ) : (
        <ol className="divide-y divide-line">
          {visits.map((visit) => (
            <li key={visit.id} className="flex items-start gap-3 px-4 py-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2">
                <ScanLine className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{formatWeekday(visit.occurredAt)} · {formatDate(visit.occurredAt)}</p>
                <p className="mt-0.5 text-[12px] text-ink-3">{formatTime(visit.occurredAt)} · {visit.branchName}</p>
                <p className="mt-0.5 text-[12px] text-ink-3">Checked in as {visit.memberName}</p>
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
  return (
    <details className="panel overflow-hidden">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13.5px] font-semibold">
        <span>Recent activity</span>
        <span className="text-[12px] font-normal tabular text-ink-3">{count} recorded</span>
      </summary>
      <div className="border-t border-line">
        {activity.length ? (
          <ol className="divide-y divide-line">
            {activity.map((item) => (
              <li key={item.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{item.title}</p>
                    <p className="mt-0.5 text-[12px] text-ink-3">{item.detail ? `${item.detail} · ` : ""}{formatDateTime(item.occurredAt)}</p>
                  </div>
                  {item.href ? <Link href={item.href} className="shrink-0 text-[12.5px] font-medium text-ink underline underline-offset-4">View receipt</Link> : null}
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

  // The panel exists as soon as the tab is chosen; loading and failure are
  // states inside it, so the tab never points at nothing.
  if (experience.isLoading) return <div className="mt-4" role="tabpanel" aria-label="Personal training" aria-busy="true"><Skeleton className="h-80 w-full" /></div>;
  if (experience.isError) return <div className="mt-4" role="tabpanel" aria-label="Personal training"><ErrorState layout="section" title="Personal training could not be loaded" onRetry={() => experience.refetch()} /></div>;
  const value = experience.data!;
  const canPickSlot = (value.availableSessions > 0 || Boolean(rescheduleBookingId)) && Boolean(trainerId && selectedBranchId);
  return (
    <div className="mt-4 space-y-4" role="tabpanel" aria-label="Personal training">
      {experience.isBackgroundError ? <ErrorState layout="inline" title="Personal training could not be refreshed" description="Showing your last loaded sessions and credits." onRetry={() => experience.refetch()} /> : null}
      <dl className="grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-surface">
        <PtStat label="Available" value={String(value.availableSessions)} />
        <PtStat label="Reserved" value={String(value.reservedSessions)} />
        <PtStat label="Next booking" value={value.upcomingBookings[0] ? formatDateTime(value.upcomingBookings[0].startsAt) : "None"} />
      </dl>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
        <section className="panel p-4 sm:p-5" aria-labelledby="pt-booking-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="pt-booking-title" className="text-[16px] font-semibold">{rescheduleBookingId ? "Choose a new time" : "Book with a trainer"}</h2>
              <p className="mt-1 text-[13px] text-ink-2">Choose a published {gymName} trainer and an open 60-minute slot.</p>
            </div>
            {rescheduleBookingId ? <Button size="sm" variant="ghost" onClick={() => setRescheduleBookingId(undefined)}>Keep booking</Button> : null}
          </div>
          {value.availableSessions <= 0 && !rescheduleBookingId ? (
            <div className="mt-4 rounded-md border border-warning/30 bg-warning-bg p-4 text-[13px] text-warning-deep" role="status">You have no usable PT sessions. Request a package below; its credits become available after the gym records full payment.</div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Trainer" htmlFor="pt-trainer">
                <select id="pt-trainer" className={SELECT_CLASS} value={trainerId} onChange={(event) => { setTrainerId(event.target.value); setBranchId(""); }}>
                  <option value="">Choose trainer</option>
                  {value.trainers.map((trainer) => <option key={trainer.id} value={trainer.id}>{trainer.displayName}</option>)}
                </select>
              </Field>
              <Field label="Branch" htmlFor="pt-branch">
                <select id="pt-branch" className={SELECT_CLASS} disabled={!selectedTrainer} value={selectedBranchId} onChange={(event) => setBranchId(event.target.value)}>
                  <option value="">Choose branch</option>
                  {selectedTrainer?.branchIds.map((id) => <option key={id} value={id}>{branchNames.get(id) ?? id}</option>)}
                </select>
              </Field>
              <Field label="Date" htmlFor="pt-date">
                <Input id="pt-date" type="date" className="h-11 sm:h-9" min={todayISODate()} value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
            </div>
          )}
          {canPickSlot ? (
            <div className="mt-5">
              <p className="text-[12px] font-medium text-ink-3">Available times</p>
              {slots.isLoading ? <p className="mt-2 text-[13px] text-ink-3" role="status">Loading current availability…</p> : slots.data?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {slots.data.map((slot) => (
                    <Button key={slot.startsAt} size="sm" variant="secondary" loading={book.isPending} onClick={() => book.mutate(slot.startsAt)}>
                      {rescheduleBookingId ? "Move to " : ""}{new Intl.DateTimeFormat("en-JO", { hour: "numeric", minute: "2-digit" }).format(new Date(slot.startsAt))}
                    </Button>
                  ))}
                </div>
              ) : <p className="mt-2 text-[13px] text-ink-2">No open slots on this date. Try another day.</p>}
            </div>
          ) : null}
        </section>

        <section className="panel overflow-hidden" aria-labelledby="pt-packages-title">
          <header className="border-b border-line px-4 py-3"><h2 id="pt-packages-title" className="text-[14px] font-semibold">PT packages</h2></header>
          <div className="divide-y divide-line">
            {value.packages.length ? value.packages.map((item) => (
              <article key={item.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold">{item.name}</p>
                  <p className="mt-0.5 text-[12px] text-ink-3">{item.sessionCount} sessions · valid {item.validityDays} days</p>
                  <p className="mt-1 text-[13px]"><MoneyText money={item.totalPrice} /></p>
                </div>
                <Button size="sm" variant="secondary" loading={requestPackage.isPending} onClick={() => requestPackage.mutate(item.id)}>Request</Button>
              </article>
            )) : <p className="p-5 text-[13px] text-ink-2">This gym has no active PT packages.</p>}
          </div>
          {value.orders.length ? (
            <div className="border-t border-line p-4">
              <p className="text-[12px] font-medium text-ink-3">Package orders</p>
              <ul className="mt-2 space-y-2">
                {value.orders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                    <span className="font-mono text-[12px]">{order.id.slice(0, 8)}</span>
                    <Badge variant="outline">{order.status.replaceAll("_", " ")}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      <section className="panel overflow-hidden" aria-labelledby="pt-upcoming-title">
        <header className="border-b border-line px-4 py-3"><h2 id="pt-upcoming-title" className="text-[14px] font-semibold">Upcoming bookings</h2></header>
        {value.upcomingBookings.length ? (
          <div className="divide-y divide-line">
            {value.upcomingBookings.map((booking) => (
              <article key={booking.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium">{booking.trainerName}</p>
                  <p className="mt-0.5 text-[12px] text-ink-3"><DateTimeText iso={booking.startsAt} /> · {branchNames.get(booking.branchId) ?? booking.branchName}</p>
                </div>
                <Badge variant="outline">{booking.status}</Badge>
                <Button size="sm" variant="secondary" onClick={() => { setRescheduleBookingId(booking.id); setTrainerId(booking.trainerProfileId); setBranchId(booking.branchId); setDate(booking.startsAt.slice(0, 10)); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Reschedule</Button>
                <Button size="sm" variant="ghost" loading={cancel.isPending} onClick={() => cancel.mutate(booking.id)}>Cancel</Button>
              </article>
            ))}
          </div>
        ) : <p className="p-5 text-[13px] text-ink-2">No upcoming PT bookings.</p>}
      </section>
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

  if (requestsQuery.isLoading || policyQuery.isLoading) return <Skeleton className="h-20 w-full" />;
  if (requestsQuery.isError || policyQuery.isError) {
    return <ErrorState layout="section" title="Freeze details could not be loaded" description="RIVET could not safely check your existing requests or the gym's current policy." onRetry={() => { void requestsQuery.refetch(); void policyQuery.refetch(); }} />;
  }
  const policy = policyQuery.data!;
  if (!policy.requestsEnabled && !pending && !latestDecided) return null;

  const fee = (minor: number) => <MoneyText money={money(minor, policy.currency)} />;
  const summary = pending ? (
    <>Requested {pending.days} days from {formatDate(pending.startDate)}. Waiting for the gym to confirm{pending.expectedFeeMinor > 0 ? <> (expected fee {fee(pending.expectedFeeMinor)})</> : null}.</>
  ) : latestDecided ? (
    latestDecided.status === "approved"
      ? <>Your last request was approved{(latestDecided.feeMinor ?? 0) > 0 ? <> with a {fee(latestDecided.feeMinor ?? 0)} fee</> : null}.{latestDecided.decisionNote ? ` ${latestDecided.decisionNote}` : ""}</>
      : <>Your last request was {latestDecided.status}.{latestDecided.decisionNote ? ` ${latestDecided.decisionNote}` : ""}</>
  ) : policy.requestsEnabled ? "Need a break? Ask the gym to pause your membership." : "This gym is not accepting new freeze requests right now.";
  const invalidDays = !Number.isSafeInteger(days) || days < policy.minimumDays || days > policy.maximumDays;

  return (
    <section className="panel p-4 sm:p-5" aria-labelledby="freeze-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="freeze-title" className="text-[14px] font-semibold">Freeze</h2>
          <p className="mt-1 text-[13px] text-ink-2">{summary}</p>
        </div>
        {!pending && policy.requestsEnabled ? <Button size="sm" variant="secondary" onClick={() => { setDays(Math.max(policy.minimumDays, Math.min(7, policy.maximumDays))); setOpen(true); }}>Request a freeze</Button> : null}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Request a freeze</DialogTitle>
            <DialogDescription>The gym reviews every request and confirms the dates.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <Field label="From" htmlFor="freeze-start" required>
              <Input id="freeze-start" type="date" className="h-11 sm:h-9" min={todayISODate()} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </Field>
            <Field label="Days" htmlFor="freeze-days" hint={`Choose ${policy.minimumDays} to ${policy.maximumDays} days.`} error={startDate && invalidDays ? `Choose ${policy.minimumDays} to ${policy.maximumDays} days.` : undefined} required>
              <Input id="freeze-days" type="number" inputMode="numeric" className="h-11 sm:h-9" min={policy.minimumDays} max={policy.maximumDays} value={days} onChange={(event) => setDays(Number(event.target.value))} />
            </Field>
            <Field label="Why do you need the break?" htmlFor="freeze-reason" required>
              <Textarea id="freeze-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Travel, injury, exams…" />
            </Field>
            <div className="rounded-md border border-line bg-sunken px-3 py-2.5 text-[13px] text-ink-2">
              {policy.expectedFeeMinor > 0 ? <p>This request currently carries a {fee(policy.expectedFeeMinor)} fee, collected at the desk if approved.</p> : <p>This request is free under the gym&apos;s current policy.</p>}
              <p className="mt-1 text-[12px] text-ink-3">The gym recalculates the fee when it approves the request.</p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={submit.isPending} disabled={!startDate || !reason.trim() || invalidDays} onClick={() => submit.mutate()}>Send request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function GateLoading() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4" role="status" aria-label="Checking access">
      <div className="h-1 w-40 overflow-hidden rounded-full bg-sunken-2">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-ink" />
      </div>
    </main>
  );
}
