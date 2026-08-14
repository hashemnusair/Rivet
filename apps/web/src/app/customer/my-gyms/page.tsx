"use client";

import { ArrowRight, MapPin, QrCode, Search, Snowflake } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { CustomerCommunicationPreferences } from "@/components/public/customer-communication-preferences";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getApi } from "@/lib/api/client";
import type { CustomerMembership, MarketplaceGym } from "@/lib/public/experience-data";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import { useCustomerPersona, useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { daysFromToday, diffDays, formatDate, formatDateTime, formatTime, formatWeekday, todayISODate } from "@/lib/utils/dates";

export default function MemberDashboardPage() {
  const customer = useCustomerPersona();
  const { customerMemberships, customerBookings } = useExperience();
  const gyms = useMarketplaceGyms();
  const { ready, identitySignedIn, profileSelected } = useMemberGate();
  const [qrFor, setQrFor] = useState<CustomerMembership | null>(null);
  const [qrValue, setQrValue] = useState("");
  const [qrExpiresAt, setQrExpiresAt] = useState<string>();
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string>();

  if (!ready || !identitySignedIn) return <GateLoading />;
  if (!profileSelected || !customer) return <SignedOut />;

  const gymFor = (id: string) => gyms.find((gym) => gym.id === id);
  const openQr = async (membership: CustomerMembership) => {
    setQrFor(membership);
    setQrValue("");
    setQrExpiresAt(undefined);
    setQrError(undefined);
    setQrLoading(true);
    try {
      const pass = await getApi().getEntryPass(membership.id);
      setQrValue(pass.token);
      setQrExpiresAt(pass.expiresAt);
    } catch (error) {
      setQrError(error instanceof Error ? error.message : "The entry QR could not be prepared.");
    } finally {
      setQrLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Member home</p>
          <h1 className="mt-1 font-display text-[27px] font-semibold tracking-tight">Hi, {customer.name.split(" ")[0]}</h1>
          <p className="mt-1 text-[13px] text-ink-2">Your gyms, memberships, visits, and entry passes in one place.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary"><Link href="/customer/profile">Profile</Link></Button>
          <Button asChild><Link href="/customer/discover"><Search /> Find a gym</Link></Button>
        </div>
      </header>

      <section className="mt-8" aria-labelledby="subscribed-gyms-title">
        <div className="flex items-baseline justify-between gap-3">
          <div><p className="eyebrow">Your memberships</p><h2 id="subscribed-gyms-title" className="mt-1 text-[18px] font-semibold">Subscribed gyms</h2></div>
          <span className="text-[12px] text-ink-3">{customerMemberships.length} {customerMemberships.length === 1 ? "gym" : "gyms"}</span>
        </div>
        {customerMemberships.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {customerMemberships.map((membership) => <MembershipCard key={membership.id} membership={membership} gym={gymFor(membership.gymId)} onShowQr={() => void openQr(membership)} />)}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-line-2 bg-surface p-8 text-center">
            <p className="text-[14px] font-medium">You have no gym subscriptions yet.</p>
            <p className="mx-auto mt-1 max-w-md text-[12.5px] text-ink-3">Find a gym, book a trial, and your membership will appear here after the gym activates it.</p>
            <Button asChild className="mt-4"><Link href="/customer/discover">Find a gym</Link></Button>
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3"><div><p className="eyebrow">Across your gyms</p><h2 className="mt-1 text-[18px] font-semibold">Recent activity</h2></div><span className="text-[12px] text-ink-3">Latest first</span></div>
          <ActivityList memberships={customerMemberships} gyms={gyms} />
        </div>
        <aside className="space-y-4">
          <div className="rounded-lg border border-line bg-surface p-5">
            <p className="eyebrow">Need another gym?</p>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">Browse gyms and keep every subscription under this same member account.</p>
            <Button asChild variant="secondary" className="mt-4 w-full"><Link href="/customer/discover">Find gyms <ArrowRight /></Link></Button>
          </div>
          <CustomerCommunicationPreferences />
        </aside>
      </section>

      {customerBookings.length > 0 ? <section className="mt-8" aria-labelledby="trials-title">
        <p className="eyebrow">Requests</p><h2 id="trials-title" className="mt-1 text-[18px] font-semibold">Free trials</h2>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {customerBookings.map((booking) => {
            const gym = gymFor(booking.gymId);
            const branch = gym?.branches.find((item) => item.id === booking.branchId);
            return <li key={booking.id} className="flex flex-wrap items-center gap-3 px-4 py-3"><span className="size-8 shrink-0 rounded-md" style={{ backgroundColor: gym?.accent ?? "var(--color-ink-3)" }} aria-hidden /><span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{gym?.name ?? "Gym"}</span><span className="block truncate text-[12px] text-ink-3">{branch?.name} · {formatDate(booking.preferredDate)} at {booking.preferredTime}</span></span><StatusPill status={booking.status} />{gym ? <Button asChild variant="ghost" size="sm"><Link href={`/customer/gyms/${gym.id}`}>Open <ArrowRight /></Link></Button> : null}</li>;
          })}
        </ul>
      </section> : null}

      <Dialog open={qrFor !== null} onOpenChange={(open) => { if (!open) { setQrFor(null); setQrValue(""); setQrError(undefined); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Entry QR</DialogTitle></DialogHeader>
          {qrFor ? <DialogBody className="text-center">
            {qrLoading ? <div className="flex min-h-64 items-center justify-center text-[12.5px] text-ink-3" role="status">Preparing a short-lived entry pass…</div> : qrError ? <div className="rounded-md border border-danger/30 bg-danger-bg px-3 py-4 text-left text-[12.5px] text-danger" role="alert">{qrError}<Button className="mt-3" size="sm" variant="secondary" onClick={() => void openQr(qrFor)}>Try again</Button></div> : qrValue ? <><div className="mx-auto w-fit rounded-lg border border-line bg-white p-5"><QRCodeSVG value={qrValue} size={224} level="H" bgColor="#ffffff" fgColor="#15140f" aria-label="Membership entry QR code" /></div><p className="mt-4 font-mono text-[18px] tracking-wide">{qrFor.memberNumber}</p><p className="mt-1 text-[12.5px] text-ink-3">{gymFor(qrFor.gymId)?.name} · {gymFor(qrFor.gymId)?.branches.find((branch) => branch.id === qrFor.branchId)?.name}</p><p className="mt-3 text-[11.5px] text-ink-3">Expires {qrExpiresAt ? formatDateTime(qrExpiresAt) : "soon"}. Close this window when you are done.</p></> : null}
          </DialogBody> : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function MembershipCard({ membership, gym, onShowQr }: { membership: CustomerMembership; gym?: MarketplaceGym; onShowQr: () => void }) {
  const branch = gym?.branches.find((item) => item.id === membership.branchId);
  const total = Math.max(diffDays(membership.startDate, membership.endDate), 1);
  const elapsed = Math.min(Math.max(diffDays(membership.startDate, todayISODate()), 0), total);
  const daysLeft = Math.max(daysFromToday(membership.endDate), 0);
  const logo = membership.gymLogoUrl ?? gym?.logo?.url;
  const cover = membership.gymCoverUrl ?? gym?.cover?.url;
  return <article className="overflow-hidden rounded-lg border border-line bg-surface">
    <div className="h-20 bg-cover bg-center" role="img" aria-label={`${membership.gymName ?? gym?.name ?? "Gym"} cover image`} style={{ backgroundColor: gym?.accent ?? "var(--color-ink)", backgroundImage: cover ? `linear-gradient(rgb(0 0 0 / .25), rgb(0 0 0 / .25)), url(${cover})` : undefined }} />
    <div className="flex items-start gap-3 p-4 pt-0">
      <span className="-mt-5 flex size-11 shrink-0 items-center justify-center rounded-md border-2 border-surface bg-sunken bg-cover bg-center font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-white" style={{ backgroundColor: gym?.accent ?? "var(--color-ink)", backgroundImage: logo ? `url(${logo})` : undefined }} aria-hidden>{logo ? null : (gym?.shortName ?? membership.gymName ?? "GYM").slice(0, 5)}</span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-[15px] font-semibold">{membership.gymName ?? gym?.name ?? "Gym"}</h3><StatusPill status={membership.status} /></div><p className="mt-1 flex items-center gap-1.5 truncate text-[12px] text-ink-3"><MapPin className="size-3" aria-hidden /> {membership.branchName ?? branch?.name ?? "Branch"} · {membership.memberNumber}</p></div>
    </div>
    <div className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4"><MiniStat label="Plan" value={membership.planName} /><MiniStat label="Visits · all time" value={String(membership.totalCheckIns ?? membership.visitHistory?.length ?? 0)} /><MiniStat label="Days left" value={String(daysLeft)} tone={daysLeft <= 14 ? "warning" : "default"} /><MiniStat label="Balance" value={membership.balanceMinor > 0 ? `JD ${(membership.balanceMinor / 1000).toFixed(3)}` : "Paid"} tone={membership.balanceMinor > 0 ? "danger" : "default"} /></div>
    <div className="px-4 pb-4 pt-3.5"><div className="flex items-baseline justify-between text-[12px]"><span className="text-ink-3">Started {formatDate(membership.startDate)}</span><span className={cn("font-medium", daysLeft <= 14 ? "text-warning-deep" : "text-ink-2")}>Ends {formatDate(membership.endDate)}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken-2"><div className={cn("h-full rounded-full", daysLeft <= 14 ? "bg-warning" : "bg-ink")} style={{ width: `${Math.round((elapsed / total) * 100)}%` }} /></div><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={onShowQr}><QrCode /> Show entry QR</Button><Button asChild size="sm" variant="secondary"><Link href={`/customer/my-gyms/${membership.id}`}>Open gym dashboard</Link></Button></div></div>
  </article>;
}

function ActivityList({ memberships, gyms }: { memberships: CustomerMembership[]; gyms: MarketplaceGym[] }) {
  const rows = memberships.flatMap((membership) => (membership.activity ?? membership.visitHistory?.map((visit) => ({ id: visit.id, type: "check_in" as const, title: "Checked in", detail: visit.branchName, occurredAt: visit.occurredAt })) ?? []).map((item) => ({ ...item, gymName: membership.gymName ?? gyms.find((gym) => gym.id === membership.gymId)?.name ?? "Gym" }))).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 8);
  return <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">{rows.length ? <ul className="divide-y divide-line">{rows.map((row) => <li key={`${row.gymName}-${row.id}`} className="flex items-start gap-3 px-4 py-3"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2" aria-hidden><ActivityIcon type={row.type} /></span><div className="min-w-0 flex-1"><p className="text-[13px] font-medium">{row.title}</p><p className="mt-0.5 text-[12px] text-ink-3">{row.gymName}{row.detail ? ` · ${row.detail}` : ""} · {formatWeekday(row.occurredAt)} {formatTime(row.occurredAt)}</p></div></li>)}</ul> : <p className="px-4 py-8 text-center text-[12.5px] text-ink-3">Activity from your gyms will appear here.</p>}</div>;
}

function ActivityIcon({ type }: { type: string }) {
  return type === "check_in" ? <QrCode className="size-4" /> : type === "payment" ? <span className="font-mono text-xs">JD</span> : <span className="font-mono text-xs">•</span>;
}

function MiniStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "danger" | "warning" }) { return <div className="bg-surface px-3 py-3"><p className="eyebrow">{label}</p><p className={cn("mt-1 truncate text-[13px] font-medium", tone === "danger" && "text-danger", tone === "warning" && "text-warning-deep")}>{value}</p></div>; }

const PILL_TONES: Record<string, string> = { active: "bg-success-bg text-success-deep", expiring: "bg-warning-bg text-warning-deep", frozen: "bg-sunken-2 text-ink-2", requested: "bg-warning-bg text-warning-deep", confirmed: "bg-success-bg text-success-deep", completed: "bg-sunken-2 text-ink-2", no_show: "bg-warning-bg text-warning-deep", cancelled: "bg-signal-bg text-signal-deep", converted: "bg-signal-bg text-signal-deep" };
function StatusPill({ status }: { status: string }) { return <span className={cn("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em]", PILL_TONES[status] ?? "bg-sunken-2 text-ink-2")}>{status === "frozen" ? <Snowflake className="size-2.5" aria-hidden /> : null}{status.replaceAll("_", " ")}</span>; }

function GateLoading() { return <main className="flex min-h-[60vh] items-center justify-center px-4" role="status" aria-label="Checking access"><div className="h-1 w-40 animate-pulse rounded-full bg-sunken-2" /></main>; }
function SignedOut() { return <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center"><span className="flex size-11 items-center justify-center rounded-lg border border-line-2 bg-surface text-ink-2"><QrCode className="size-5" /></span><h1 className="mt-5 font-display text-[22px] font-semibold tracking-tight">Sign in to your member account</h1><p className="mt-2 text-[13px] text-ink-2">Your gyms, visits, balance, and entry QR are available after sign in.</p><div className="mt-6 flex gap-2"><Button asChild><Link href="/login">Sign in</Link></Button><Button asChild variant="secondary"><Link href="/login/member/create">Create an account</Link></Button></div></main>; }
