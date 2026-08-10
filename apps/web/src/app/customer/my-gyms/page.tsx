"use client";

import {
  ArrowRight,
  CalendarClock,
  CreditCard,
  MapPin,
  QrCode,
  Search,
  Snowflake,
  Ticket,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CustomerCommunicationPreferences } from "@/components/public/customer-communication-preferences";
import type { CustomerMembership, MarketplaceGym } from "@/lib/public/experience-data";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import { useCustomerPersona, useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { daysFromToday, diffDays, formatDate, formatRelative, todayISODate } from "@/lib/utils/dates";

export default function MemberDashboardPage() {
  const customer = useCustomerPersona();
  const { customerMemberships, customerBookings } = useExperience();
  const gyms = useMarketplaceGyms();
  const { ready, identitySignedIn, profileSelected } = useMemberGate();
  const [qrFor, setQrFor] = useState<CustomerMembership | null>(null);

  // No identity yet: the gate is already redirecting to the member portal.
  if (!ready || !identitySignedIn) return <GateLoading />;
  if (!profileSelected || !customer) return <SignedOut />;

  const primary = customerMemberships[0];
  const soonest = [...customerMemberships].sort((a, b) => a.endDate.localeCompare(b.endDate))[0];
  const visits = customerMemberships.reduce((total, m) => total + m.visitsThisMonth, 0);
  const balanceMinor = customerMemberships.reduce((total, m) => total + m.balanceMinor, 0);
  const lastCheckIn = customerMemberships
    .map((m) => m.lastCheckInAt)
    .sort()
    .at(-1);
  const gymFor = (id: string) => gyms.find((gym) => gym.id === id);

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[24px] font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            {customer.name} · {customerMemberships.length} {customerMemberships.length === 1 ? "membership" : "memberships"}
            {customerBookings.length > 0 ? ` · ${customerBookings.length} trial booked` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary">
            <Link href="/customer/discover">
              <Search /> Find a gym
            </Link>
          </Button>
          {primary ? (
            <Button onClick={() => setQrFor(primary)}>
              <QrCode /> Entry QR
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={<CalendarClock />}
          label="Next renewal"
          value={soonest ? `${Math.max(daysFromToday(soonest.endDate), 0)} days` : "—"}
          context={soonest ? formatDate(soonest.endDate) : "No active membership"}
          tone={soonest && daysFromToday(soonest.endDate) <= 14 ? "warning" : "default"}
        />
        <Tile
          icon={<TrendingUp />}
          label="Visits this month"
          value={String(visits)}
          context={lastCheckIn ? `Last visit ${formatRelative(lastCheckIn)}` : "No visits yet"}
        />
        <Tile
          icon={<CreditCard />}
          label="Balance due"
          value={`JD ${(balanceMinor / 1000).toFixed(3)}`}
          context={balanceMinor > 0 ? "Payable at the desk" : "Nothing outstanding"}
          tone={balanceMinor > 0 ? "danger" : "default"}
        />
        <Tile
          icon={<Ticket />}
          label="Trial requests"
          value={String(customerBookings.length)}
          context={customerBookings.length > 0 ? "Awaiting your visit" : "None booked"}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <SectionTitle>Memberships</SectionTitle>
          {customerMemberships.length > 0 ? (
            <div className="mt-3 grid gap-3">
              {customerMemberships.map((membership) => (
                <MembershipCard key={membership.id} membership={membership} gym={gymFor(membership.gymId)} onShowQr={() => setQrFor(membership)} />
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-line-2 bg-surface p-8 text-center">
              <p className="text-[14px] font-medium">No active membership</p>
              <p className="mx-auto mt-1 max-w-sm text-[12.5px] text-ink-3">
                Book a free trial at any RIVET gym. Once the gym activates your membership it appears here.
              </p>
              <Button asChild className="mt-4">
                <Link href="/customer/discover">Find a gym</Link>
              </Button>
            </div>
          )}

          <SectionTitle className="mt-7">Free trials</SectionTitle>
          {customerBookings.length > 0 ? (
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
              {customerBookings.map((booking) => {
                const gym = gymFor(booking.gymId);
                const branch = gym?.branches.find((item) => item.id === booking.branchId);
                return (
                  <li key={booking.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span
                      className="size-8 shrink-0 rounded-md"
                      style={{ backgroundColor: gym?.accent ?? "var(--color-ink-3)" }}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{gym?.name ?? "Gym"}</span>
                      <span className="block truncate text-[12px] text-ink-3">
                        {branch?.name} · {formatDate(booking.preferredDate)} at {booking.preferredTime}
                      </span>
                    </span>
                    <StatusPill status={booking.status} />
                    {gym ? (
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/customer/gyms/${gym.id}`}>
                          Open <ArrowRight />
                        </Link>
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-3 rounded-lg border border-line bg-surface px-4 py-5 text-[12.5px] text-ink-3">
              No trial requests. Booking one from a gym page sends it straight to that gym&rsquo;s front desk.
            </p>
          )}
        </section>

        <aside className="grid content-start gap-4">
          {primary ? <EntryCard membership={primary} gym={gymFor(primary.gymId)} onExpand={() => setQrFor(primary)} /> : null}

          <div className="rounded-lg border border-line bg-surface">
            <p className="eyebrow border-b border-line px-4 py-2.5">Recent</p>
            <ul className="divide-y divide-line">
              {lastCheckIn ? (
                <ActivityRow title="Checked in" detail={formatRelative(lastCheckIn)} />
              ) : null}
              {soonest ? (
                <ActivityRow
                  title="Renewal due"
                  detail={`${formatDate(soonest.endDate)} · ${Math.max(daysFromToday(soonest.endDate), 0)} days`}
                />
              ) : null}
              {customerBookings[0] ? (
                <ActivityRow
                  title="Trial requested"
                  detail={`${gymFor(customerBookings[0].gymId)?.name ?? "Gym"} · ${formatRelative(customerBookings[0].createdAt)}`}
                />
              ) : null}
              {!lastCheckIn && !soonest && !customerBookings[0] ? (
                <li className="px-4 py-4 text-[12.5px] text-ink-3">Nothing yet.</li>
              ) : null}
            </ul>
          </div>
          <CustomerCommunicationPreferences />
        </aside>
      </div>

      <Dialog open={qrFor !== null} onOpenChange={(open) => !open && setQrFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Entry QR</DialogTitle>
          </DialogHeader>
          {qrFor ? (
            <DialogBody className="text-center">
              <div className="mx-auto w-fit rounded-lg border border-line bg-white p-5">
                <QRCodeSVG value={qrFor.qrValue} size={224} level="H" bgColor="#ffffff" fgColor="#15140f" aria-label="Membership entry QR code" />
              </div>
              <p className="mt-4 font-mono text-[18px] tracking-wide">{qrFor.memberNumber}</p>
              <p className="mt-1 text-[12.5px] text-ink-3">
                {gymFor(qrFor.gymId)?.name} · {gymFor(qrFor.gymId)?.branches.find((b) => b.id === qrFor.branchId)?.name}
              </p>
              <p className="mt-4 text-[11.5px] text-ink-3">Show this at the desk. In production the code is short-lived and re-signed each time.</p>
            </DialogBody>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}

// ---------------------------------------------------------------------------

function MembershipCard({ membership, gym, onShowQr }: { membership: CustomerMembership; gym?: MarketplaceGym; onShowQr: () => void }) {
  const branch = gym?.branches.find((item) => item.id === membership.branchId);
  const total = Math.max(diffDays(membership.startDate, membership.endDate), 1);
  const elapsed = Math.min(Math.max(diffDays(membership.startDate, todayISODate()), 0), total);
  const daysLeft = Math.max(daysFromToday(membership.endDate), 0);

  return (
    <article className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-md font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-white"
          style={{ backgroundColor: gym?.accent ?? "var(--color-ink)" }}
          aria-hidden
        >
          {gym?.shortName.slice(0, 5)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold">{gym?.name ?? "Gym"}</h3>
            <StatusPill status={membership.status} />
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[12px] text-ink-3">
            <MapPin className="size-3" aria-hidden /> {branch?.name} · {membership.memberNumber}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-3">
        <MiniStat className="col-span-2 sm:col-span-1" label="Plan" value={membership.planName} />
        <MiniStat label="Visits · month" value={String(membership.visitsThisMonth)} />
        <MiniStat label="Balance" value={`JD ${(membership.balanceMinor / 1000).toFixed(3)}`} tone={membership.balanceMinor > 0 ? "danger" : "default"} />
      </div>

      <div className="px-4 pb-4 pt-3.5">
        <div className="flex items-baseline justify-between text-[12px]">
          <span className="text-ink-3">{formatDate(membership.startDate)}</span>
          <span className={cn("font-medium", daysLeft <= 14 ? "text-warning-deep" : "text-ink-2")}>
            {daysLeft} days left
          </span>
          <span className="text-ink-3">{formatDate(membership.endDate)}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken-2">
          <div
            className={cn("h-full rounded-full", daysLeft <= 14 ? "bg-warning" : "bg-ink")}
            style={{ width: `${Math.round((elapsed / total) * 100)}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={onShowQr}>
            <QrCode /> Entry QR
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/customer/my-gyms/${membership.id}`}>Membership details</Link>
          </Button>
          {gym ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/customer/gyms/${gym.id}`}>Gym page</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function EntryCard({ membership, gym, onExpand }: { membership: CustomerMembership; gym?: MarketplaceGym; onExpand: () => void }) {
  return (
    <div className="night-surface overflow-hidden rounded-lg bg-night text-night-ink">
      <div className="flex items-center justify-between border-b border-night-line px-4 py-2.5">
        <p className="eyebrow-night">Entry pass</p>
        <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-success">
          <span className="size-1.5 rounded-full bg-success" /> Valid
        </span>
      </div>
      <div className="p-4">
        <button
          type="button"
          onClick={onExpand}
          className="block w-full cursor-pointer rounded-md bg-white p-4 transition-transform hover:scale-[1.01]"
          aria-label="Enlarge entry QR code"
        >
          <QRCodeSVG
            value={membership.qrValue}
            size={200}
            level="H"
            bgColor="#ffffff"
            fgColor="#15140f"
            className="h-auto w-full"
            aria-hidden
          />
        </button>
        <p className="mt-3 font-mono text-[15px] tracking-wide">{membership.memberNumber}</p>
        <p className="mt-0.5 text-[11.5px] text-night-ink-3">{gym?.name}</p>
      </div>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  context,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  context: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className="bg-surface p-4">
      <p className="flex items-center gap-1.5 eyebrow [&_svg]:size-3.5">
        {icon} {label}
      </p>
      <p
        className={cn(
          "mt-2.5 text-[26px] font-semibold leading-none tabular",
          tone === "warning" && "text-warning-deep",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[12px] text-ink-3">{context}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  tone?: "default" | "danger";
  className?: string;
}) {
  return (
    <div className={cn("bg-surface px-4 py-3", className)}>
      <p className="eyebrow">{label}</p>
      <p className={cn("mt-1 truncate text-[13.5px] font-medium", tone === "danger" && "text-danger")}>{value}</p>
    </div>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-2", className)}>{children}</h2>;
}

function ActivityRow({ title, detail }: { title: string; detail: string }) {
  return (
    <li className="px-4 py-3">
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mt-0.5 text-[12px] text-ink-3">{detail}</p>
    </li>
  );
}

const PILL_TONES: Record<string, string> = {
  active: "bg-success-bg text-success-deep",
  expiring: "bg-warning-bg text-warning-deep",
  frozen: "bg-sunken-2 text-ink-2",
  requested: "bg-warning-bg text-warning-deep",
  confirmed: "bg-success-bg text-success-deep",
  completed: "bg-sunken-2 text-ink-2",
  no_show: "bg-warning-bg text-warning-deep",
  cancelled: "bg-signal-bg text-signal-deep",
  converted: "bg-signal-bg text-signal-deep",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em]",
        PILL_TONES[status] ?? "bg-sunken-2 text-ink-2",
      )}
    >
      {status === "frozen" ? <Snowflake className="size-2.5" aria-hidden /> : null}
      {status.replaceAll("_", " ")}
    </span>
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

function SignedOut() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex size-11 items-center justify-center rounded-lg border border-line-2 bg-surface text-ink-2">
        <QrCode className="size-5" />
      </span>
      <h1 className="mt-5 font-display text-[22px] font-semibold tracking-tight">Sign in to your member account</h1>
      <p className="mt-2 text-[13px] text-ink-2">Memberships, visits, balance, and your entry QR live behind sign-in.</p>
      <div className="mt-6 flex gap-2">
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/login/member/create">Create an account</Link>
        </Button>
      </div>
      <Link href="/customer/discover" className="mt-4 text-[12.5px] text-ink-3 underline decoration-line-3 underline-offset-4 hover:text-ink">
        Or browse gyms without an account
      </Link>
    </main>
  );
}
