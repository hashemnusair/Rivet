"use client";

import { ArrowLeft, CalendarDays, CreditCard, MapPin, Phone, ScanLine, Ticket } from "lucide-react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { isConvexMode } from "@/lib/api/ConvexGymOSApi";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import { useExperience, useMarketplaceGyms } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { daysFromToday, diffDays, formatDate, formatDateTime, todayISODate } from "@/lib/utils/dates";

export default function MembershipDetailClient({ membershipId }: { membershipId: string }) {
  const { memberships } = useExperience();
  const gyms = useMarketplaceGyms();
  const { ready, identitySignedIn } = useMemberGate();
  const membership = memberships.find((item) => item.id === membershipId);

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
          <Button variant="signal">Renew membership</Button>
          <Button asChild variant="secondary">
            <Link href={`/customer/gyms/${gym.id}`}>Gym page</Link>
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="night-surface overflow-hidden rounded-lg bg-night text-night-ink">
          <div className="flex items-center justify-between border-b border-night-line px-4 py-2.5">
            <p className="eyebrow-night">Entry pass</p>
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-success">
              <span className="size-1.5 rounded-full bg-success" /> Valid
            </span>
          </div>
          <div className="p-4">
            <div className="rounded-md bg-white p-4">
              {membership.qrValue ? <QRCodeSVG value={membership.qrValue} size={232} level="H" bgColor="#ffffff" fgColor="#15140f" className="h-auto w-full" aria-label="Membership entry QR code" /> : <p className="px-3 py-16 text-center text-[12px] text-ink-3">Entry pass unavailable. Refresh to try again.</p>}
            </div>
            <p className="mt-4 font-mono text-[18px] tracking-wide">{membership.memberNumber}</p>
            <p className="mt-0.5 text-[11.5px] text-night-ink-3">{branch.name}</p>
            <p className="mt-4 border-t border-night-line pt-3 text-[11px] leading-relaxed text-night-ink-3">
              {signedEntryPass ? "Short-lived signed entry pass. Refresh before entry if it expires." : "Preview code for the local demo. Production uses a short-lived signed token validated at the desk."}
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
      </div>
    </main>
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
