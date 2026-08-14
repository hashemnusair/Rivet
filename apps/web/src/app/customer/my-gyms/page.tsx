"use client";

import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleCheck,
  MapPin,
  QrCode,
  Search,
  Snowflake,
  Ticket,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { CustomerCommunicationPreferences } from "@/components/public/customer-communication-preferences";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getApi } from "@/lib/api/client";
import { qk } from "@/lib/api/keys";
import { useMemberGate } from "@/lib/hooks/use-member-gate";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import type { CustomerMembership, MarketplaceGym } from "@/lib/public/experience-data";
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

  const firstName = customer.name.split(/\s+/)[0] ?? customer.name;
  const gymFor = (id: string) => gyms.find((gym) => gym.id === id);
  const recentActivity = customerMemberships
    .flatMap((membership) =>
      (
        membership.activity ??
        membership.visitHistory?.map((visit) => ({
          id: visit.id,
          type: "check_in" as const,
          title: "Checked in",
          detail: visit.branchName,
          occurredAt: visit.occurredAt,
        })) ??
        []
      ).map((item) => ({
        ...item,
        gymName: membership.gymName ?? gymFor(membership.gymId)?.name ?? "Gym",
      })),
    )
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 4);

  const membershipLabel = `${customerMemberships.length} ${customerMemberships.length === 1 ? "membership" : "memberships"}`;

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
      setQrError(error instanceof Error ? error.message : "The entry pass could not be prepared.");
    } finally {
      setQrLoading(false);
    }
  };

  const closeQr = () => {
    setQrFor(null);
    setQrValue("");
    setQrExpiresAt(undefined);
    setQrError(undefined);
  };

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 pb-16 pt-8 sm:px-6 sm:pt-10 lg:px-8 lg:pb-20 lg:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-line pb-7 sm:pb-9">
        <div className="max-w-2xl">
          <h1 className="font-display text-[32px] font-semibold leading-[1.05] tracking-[-0.035em] text-balance sm:text-[42px]">
            Welcome back, {firstName}.
          </h1>
          <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-ink-2 sm:text-[15px]">
            Your entry passes, membership details, and recent activity—ready when you are.
          </p>
        </div>
        <div className="flex items-center gap-2.5 text-[12px] text-ink-2">
          <span className="size-2 rounded-full bg-success" aria-hidden />
          <span>{customerMemberships.length > 0 ? `${membershipLabel} on RIVET` : "No active memberships"}</span>
        </div>
      </header>

      <div className="mt-9 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-12">
        <section id="memberships" aria-labelledby="memberships-heading" className="min-w-0 scroll-mt-24">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="memberships-heading" className="text-[19px] font-semibold tracking-[-0.02em] sm:text-[21px]">
              {customerMemberships.length === 1 ? "Your membership" : "Your memberships"}
            </h2>
            {customerMemberships.length > 0 ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">{membershipLabel}</span>
            ) : null}
          </div>

          {customerMemberships.length > 0 ? (
            <div className="mt-4 grid gap-5">
              {customerMemberships.map((membership) => (
                <MembershipPass
                  key={membership.id}
                  membership={membership}
                  gym={gymFor(membership.gymId)}
                  onShowQr={() => void openQr(membership)}
                />
              ))}
            </div>
          ) : (
            <EmptyMemberships />
          )}

          {customerBookings.length > 0 ? (
            <section aria-labelledby="trials-heading" className="mt-10">
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="trials-heading" className="text-[19px] font-semibold tracking-[-0.02em]">Trial bookings</h2>
                <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
                  {customerBookings.length} upcoming
                </span>
              </div>
              <ul className="mt-4 divide-y divide-line border-y border-line">
                {customerBookings.map((booking) => {
                  const gym = gymFor(booking.gymId);
                  const branch = gym?.branches.find((item) => item.id === booking.branchId);
                  return (
                    <li key={booking.id}>
                      <Link
                        href={gym ? `/customer/gyms/${gym.id}` : "/customer/discover"}
                        className="group flex min-h-20 items-center gap-3 py-4 transition-colors hover:text-ink-2"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2">
                          <Ticket className="size-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[14px] font-semibold">{gym?.name ?? "Gym"}</span>
                            <StatusPill status={booking.status} />
                          </span>
                          <span className="mt-1 block truncate text-[12px] text-ink-3">
                            {branch?.name} · {formatDate(booking.preferredDate)} at {booking.preferredTime}
                          </span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </section>

        <aside className="grid content-start gap-9">
          <section aria-labelledby="activity-heading">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="activity-heading" className="text-[16px] font-semibold tracking-[-0.015em]">Recent activity</h2>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-3">Latest 4</span>
            </div>
            {recentActivity.length > 0 ? (
              <ol className="mt-4 border-t border-line">
                {recentActivity.map((item) => (
                  <li key={`${item.gymName}-${item.id}`} className="grid grid-cols-[28px_1fr] gap-3 border-b border-line py-3.5">
                    <span className="mt-0.5 flex size-7 items-center justify-center rounded-full bg-sunken text-ink-2">
                      <ActivityIcon type={item.type} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[12.5px] font-medium">{item.title}</span>
                        <time className="shrink-0 font-mono text-[9.5px] text-ink-3">{formatTime(item.occurredAt)}</time>
                      </span>
                      <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
                        {item.gymName}{item.detail ? ` · ${item.detail}` : ""} · {formatWeekday(item.occurredAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-4 border-y border-line py-5">
                <p className="text-[12.5px] font-medium">No activity yet</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">Visits, payments, and membership changes will appear here.</p>
              </div>
            )}
          </section>

          <section aria-labelledby="shortcuts-heading">
            <h2 id="shortcuts-heading" className="text-[16px] font-semibold tracking-[-0.015em]">Shortcuts</h2>
            <nav className="mt-3 border-y border-line" aria-label="Member shortcuts">
              <Shortcut href="/customer/discover" icon={<Search />} label="Explore gyms" detail="Plans, branches, and free trials" />
              {customerMemberships[0] ? (
                <Shortcut
                  href={`/customer/my-gyms/${customerMemberships[0].id}`}
                  icon={<CalendarDays />}
                  label="Membership history"
                  detail="Payments, visits, and plan details"
                />
              ) : null}
            </nav>
          </section>

          <CustomerCommunicationPreferences />
        </aside>
      </div>

      <Dialog open={qrFor !== null} onOpenChange={(open) => !open && closeQr()}>
        <DialogContent className="max-w-[390px] overflow-hidden p-0">
          <DialogHeader className="border-b border-line px-5 py-4">
            <DialogTitle>Entry pass</DialogTitle>
          </DialogHeader>
          {qrFor ? (
            <EntryPassDialog
              membership={qrFor}
              gym={gymFor(qrFor.gymId)}
              token={qrValue}
              expiresAt={qrExpiresAt}
              loading={qrLoading}
              error={qrError}
              onRetry={() => void openQr(qrFor)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function MembershipPass({
  membership,
  gym,
  onShowQr,
}: {
  membership: CustomerMembership;
  gym?: MarketplaceGym;
  onShowQr: () => void;
}) {
  const branch = gym?.branches.find((item) => item.id === membership.branchId);
  const total = Math.max(diffDays(membership.startDate, membership.endDate), 1);
  const elapsed = Math.min(Math.max(diffDays(membership.startDate, todayISODate()), 0), total);
  const daysLeft = Math.max(daysFromToday(membership.endDate), 0);
  const progress = Math.round((elapsed / total) * 100);
  const gymName = membership.gymName ?? gym?.name ?? "Gym";
  const branchName = membership.branchName ?? branch?.name ?? "Branch not available";
  const logo = membership.gymLogoUrl ?? gym?.logo?.url;
  const cover = membership.gymCoverUrl ?? gym?.cover?.url;

  return (
    <article className="overflow-hidden rounded-lg bg-night text-night-ink shadow-pop">
      <div className="relative isolate overflow-hidden px-5 pb-6 pt-5 sm:px-7 sm:pb-7 sm:pt-6">
        {cover ? (
          <span
            className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center opacity-[0.12] grayscale"
            style={{ backgroundImage: `url(${cover})` }}
            aria-hidden
          />
        ) : (
          <Image
            src="/brand/rivet-glyph-rev.png"
            alt=""
            width={180}
            height={180}
            className="pointer-events-none absolute -bottom-14 -right-8 -z-10 w-44 rotate-6 opacity-[0.055] sm:w-52"
            aria-hidden
          />
        )}

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {logo ? <span className="size-6 shrink-0 rounded-sm bg-white bg-cover bg-center" style={{ backgroundImage: `url(${logo})` }} aria-hidden /> : null}
              {gym ? (
                <Link
                  href={`/customer/gyms/${gym.id}`}
                  className="group inline-flex min-w-0 items-center gap-1.5 text-[12px] font-medium text-night-ink-2 transition-colors hover:text-night-ink"
                >
                  <span className="truncate">{gymName}</span>
                  <ArrowUpRight className="size-3.5 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                </Link>
              ) : (
                <span className="truncate text-[12px] font-medium text-night-ink-2">{gymName}</span>
              )}
            </div>
            <h3 className="mt-2 text-[23px] font-semibold leading-tight tracking-[-0.03em] text-balance sm:text-[27px]">{membership.planName}</h3>
          </div>
          <StatusPill status={membership.status} night />
        </div>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-6 sm:mt-9">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-night-ink-3">Member number</p>
            <p className="mt-1.5 font-mono text-[17px] tracking-[0.08em] tabular sm:text-[19px]">{membership.memberNumber}</p>
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-night-ink-2">
              <MapPin className="size-3.5" aria-hidden /> {branchName}
            </p>
          </div>
          <Button onClick={onShowQr} variant="night" size="lg" className="w-full sm:w-auto">
            <QrCode /> Show entry pass
          </Button>
        </div>
      </div>

      <div className="bg-surface text-ink">
        <dl className="grid grid-cols-2 border-b border-line sm:grid-cols-4">
          <PassMetric label="Renews" value={daysLeft === 0 ? formatDate(membership.endDate) : `${daysLeft} days`} warning={daysLeft <= 14} />
          <PassMetric label="Total visits" value={String(membership.totalCheckIns ?? membership.visitHistory?.length ?? 0)} />
          <CustomerPtSummary membershipId={membership.id} />
          <PassMetric
            label="Balance"
            value={membership.balanceMinor > 0 ? `JD ${(membership.balanceMinor / 1000).toFixed(3)}` : "Paid"}
            warning={membership.balanceMinor > 0}
          />
        </dl>

        <div className="px-5 pb-5 pt-4 sm:px-7">
          <div className="flex items-center justify-between gap-4 text-[11px]">
            <span className="text-ink-3">Started {formatDate(membership.startDate)}</span>
            <span className="font-medium text-ink-2">Ends {formatDate(membership.endDate)}</span>
          </div>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-sunken-2" aria-label={`${progress}% of membership term elapsed`} role="img">
            <div className={cn("h-full rounded-full", daysLeft <= 14 ? "bg-warning" : "bg-ink")} style={{ width: `${progress}%` }} />
          </div>
          <nav className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2" aria-label={`${gymName} membership actions`}>
            <Link
              href={`/customer/my-gyms/${membership.id}`}
              className="group inline-flex items-center gap-1 text-[12px] font-semibold text-ink-2 transition-colors hover:text-ink"
            >
              Membership details <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <Link
              href={`/customer/my-gyms/${membership.id}?section=pt`}
              className="group inline-flex items-center gap-1 text-[12px] font-medium text-ink-3 transition-colors hover:text-ink"
            >
              PT sessions <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </nav>
        </div>
      </div>
    </article>
  );
}

function PassMetric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="min-w-0 border-e border-line px-4 py-4 last:border-e-0 sm:px-5 [&:nth-child(2)]:border-e-0 sm:[&:nth-child(2)]:border-e [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0">
      <dt className="text-[10.5px] text-ink-3">{label}</dt>
      <dd className={cn("mt-1 truncate text-[14px] font-semibold tabular", warning && "text-warning-deep")}>{value}</dd>
    </div>
  );
}

function CustomerPtSummary({ membershipId }: { membershipId: string }) {
  const query = useRealtimeApiQuery({
    queryKey: ["customer", ...qk.ptMember(membershipId)],
    query: (api) => api.getCustomerPtExperience(membershipId),
    subscribe: (api, onValue, onError) => api.subscribeCustomerPtExperience(membershipId, onValue, onError),
  });
  return <PassMetric label="PT sessions" value={query.isLoading ? "…" : query.isError ? "Unavailable" : String(query.data?.availableSessions ?? 0)} />;
}

function EntryPassDialog({
  membership,
  gym,
  token,
  expiresAt,
  loading,
  error,
  onRetry,
}: {
  membership: CustomerMembership;
  gym?: MarketplaceGym;
  token: string;
  expiresAt?: string;
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const branch = gym?.branches.find((item) => item.id === membership.branchId);
  const gymName = membership.gymName ?? gym?.name ?? "Gym";
  const branchName = membership.branchName ?? branch?.name;

  return (
    <DialogBody className="bg-paper px-5 pb-6 pt-5 text-center">
      {loading ? (
        <div className="flex min-h-72 flex-col items-center justify-center" role="status">
          <div className="size-44 animate-pulse rounded-lg bg-sunken" />
          <p className="mt-4 text-[12px] text-ink-3">Preparing a short-lived entry pass…</p>
        </div>
      ) : error ? (
        <div className="border-y border-danger/30 py-7 text-left" role="alert">
          <p className="text-[13px] font-semibold text-danger">Entry pass unavailable</p>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{error}</p>
          <Button className="mt-4" size="sm" variant="secondary" onClick={onRetry}>Try again</Button>
        </div>
      ) : token ? (
        <>
          <div className="rounded-lg bg-night p-3 shadow-pop">
            <div className="flex items-center justify-between px-1 pb-3 text-start">
              <div>
                <p className="text-[12px] font-semibold text-night-ink">{gymName}</p>
                <p className="mt-0.5 text-[10.5px] text-night-ink-3">{branchName}</p>
              </div>
              <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-success">
                <span className="size-1.5 rounded-full bg-success" aria-hidden /> Valid
              </span>
            </div>
            <div className="rounded-md bg-white p-4">
              <QRCodeSVG
                value={token}
                size={260}
                level="H"
                bgColor="#ffffff"
                fgColor="#15140f"
                className="h-auto w-full"
                aria-label="Membership entry QR code"
              />
            </div>
            <p className="px-1 pb-1 pt-3 font-mono text-[16px] tracking-[0.09em] text-night-ink tabular">{membership.memberNumber}</p>
          </div>
          <p className="mx-auto mt-4 max-w-[34ch] text-[11.5px] leading-relaxed text-ink-3">
            Expires {expiresAt ? formatDateTime(expiresAt) : "soon"}. Close this pass when you are done.
          </p>
        </>
      ) : null}
    </DialogBody>
  );
}

function ActivityIcon({ type }: { type: string }) {
  if (type === "check_in") return <Check className="size-3.5 text-success" strokeWidth={2.5} aria-hidden />;
  if (type === "payment") return <span className="font-mono text-[9px] font-semibold">JD</span>;
  return <span className="size-1.5 rounded-full bg-ink-3" aria-hidden />;
}

function Shortcut({ href, icon, label, detail }: { href: string; icon: React.ReactNode; label: string; detail: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 border-b border-line py-3.5 last:border-b-0">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2 transition-colors group-hover:bg-sunken-2 [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium">{label}</span>
        <span className="mt-0.5 block truncate text-[10.5px] text-ink-3">{detail}</span>
      </span>
      <ChevronRight className="size-3.5 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

function EmptyMemberships() {
  return (
    <div className="mt-4 border-y border-line py-12 text-center sm:py-16">
      <span className="mx-auto flex size-11 items-center justify-center rounded-lg bg-sunken text-ink-2">
        <QrCode className="size-5" aria-hidden />
      </span>
      <h3 className="mt-5 text-[18px] font-semibold tracking-[-0.02em]">Your first entry pass starts with a gym</h3>
      <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-ink-3">Browse local gyms, compare their plans, and book a free trial. Your membership appears here when the gym activates it.</p>
      <Button asChild className="mt-5">
        <Link href="/customer/discover"><Search /> Explore gyms</Link>
      </Button>
    </div>
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

function StatusPill({ status, night = false }: { status: string; night?: boolean }) {
  const normalized = status.replaceAll("_", " ");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em]",
        night ? "bg-white/10 text-night-ink-2" : PILL_TONES[status] ?? "bg-sunken-2 text-ink-2",
      )}
    >
      {status === "frozen" ? <Snowflake className="size-2.5" aria-hidden /> : null}
      {status === "active" && night ? <CircleCheck className="size-2.5" aria-hidden /> : null}
      {normalized}
    </span>
  );
}

function GateLoading() {
  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-12" role="status" aria-label="Checking access">
      <div className="h-10 w-64 animate-pulse rounded-md bg-sunken" />
      <div className="mt-10 h-80 animate-pulse rounded-lg bg-sunken" />
    </main>
  );
}

function SignedOut() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="flex size-11 items-center justify-center rounded-lg bg-sunken text-ink-2">
        <QrCode className="size-5" aria-hidden />
      </span>
      <h1 className="mt-5 font-display text-[22px] font-semibold tracking-[-0.02em]">Sign in to your member account</h1>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-2">Your memberships, visits, balances, and entry passes are protected behind sign-in.</p>
      <div className="mt-6 flex gap-2">
        <Button asChild><Link href="/login">Sign in</Link></Button>
        <Button asChild variant="secondary"><Link href="/login/member/create">Create an account</Link></Button>
      </div>
      <Link href="/customer/discover" className="mt-5 text-[12.5px] text-ink-3 underline decoration-line-3 underline-offset-4 transition-colors hover:text-ink">
        Browse gyms without an account
      </Link>
    </main>
  );
}
