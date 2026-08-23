"use client";

import { ArrowRight, Building2, CircleAlert, CreditCard, LifeBuoy, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useExperience } from "@/lib/providers/experience-provider";
import { formatMoney } from "@/lib/utils/money";

export default function PlatformOverviewPage() {
  const { platformSnapshot } = useExperience();
  // The platform snapshot is the authoritative tenant directory. The public
  // marketplace stream intentionally excludes hidden/suspended tenants and
  // can update independently of the operator console.
  const directoryGyms = (platformSnapshot?.gyms ?? [])
    .filter((gym) => gym.isProvisioned !== false)
    .sort((left, right) => subscriptionStatusOrder(left.subscriptionStatus) - subscriptionStatusOrder(right.subscriptionStatus));
  const overview = platformSnapshot?.overview;
  const openCases = overview?.openSupportCases ?? 0;
  const urgentCases = overview?.urgentSupportCases ?? 0;
  const conversionRate = overview && overview.trialRequests > 0
    ? Math.round((overview.trialConversions / overview.trialRequests) * 100)
    : undefined;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1480px]">
        <PageHeading
          eyebrow="RIVET operations"
          title="Platform overview"
          description="A live view of persisted subscriptions, tenant activity, applications, billing, and support work across RIVET."
          action={<Button asChild variant="signal"><Link href="/platform/gyms">Manage gyms <ArrowRight /></Link></Button>}
        />

        <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={<Building2 />} label="Active gyms" value={overview ? String(overview.gymCounts.active) : "—"} detail={overview ? `${overview.gymCounts.trial} trial · ${overview.gymCounts.past_due} past due · ${overview.gymCounts.suspended} suspended · ${overview.gymCounts.cancelled} cancelled` : "Loading tenant status"} />
          <Kpi icon={<CreditCard />} label="Active MRR" value={overview ? formatMoney(overview.activeMrr) : "—"} detail={overview ? "From active plan assignments" : "Loading subscriptions"} />
          <Kpi icon={<Users />} label="Active members" value={overview ? overview.memberCount.toLocaleString() : "—"} detail={overview ? `${overview.branchCount} active branches · ${overview.activeStaffCount} active staff` : "Loading tenant usage"} />
          <Kpi icon={<LifeBuoy />} label="Open support cases" value={overview ? String(openCases) : "—"} detail={overview ? `${urgentCases} urgent` : "Loading support queue"} warning={urgentCases > 0} />
        </section>

        <section className="mt-3 grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
          <MiniMetric label="Applications awaiting review" value={overview ? String(overview.pendingApplications) : "—"} warning={Boolean(overview?.pendingApplications)} />
          <MiniMetric label="Provisioning failures" value={overview ? String(overview.provisioningFailures) : "—"} warning={Boolean(overview?.provisioningFailures)} />
          <MiniMetric label="Trials expiring in 14 days" value={overview ? String(overview.trialsExpiringSoon) : "—"} warning={Boolean(overview?.trialsExpiringSoon)} />
          <MiniMetric label="Past-due gym accounts" value={overview ? String(overview.pastDueAccounts) : "—"} warning={Boolean(overview?.pastDueAccounts)} />
        </section>

        <section className="mt-5 border border-line bg-surface p-5 sm:p-6">
            <p className="eyebrow">Platform ledger</p>
            <h2 className="mt-2 text-[20px] font-semibold">Billing position</h2>
            <p className="mt-2 max-w-xl text-[11.5px] leading-relaxed text-ink-3">These values are derived from persisted platform invoices. External card charging and payout data remain unavailable until a billing provider is configured.</p>
            <div className="mt-6 grid gap-px border border-line bg-line sm:grid-cols-3">
              <MiniMetric label="Collected" value={overview ? formatMoney(overview.invoiceTotals.collected) : "—"} />
              <MiniMetric label="Outstanding" value={overview ? formatMoney(overview.invoiceTotals.outstanding) : "—"} />
              <MiniMetric label="Overdue" value={overview ? formatMoney(overview.invoiceTotals.overdue) : "—"} warning={Boolean(overview?.invoiceTotals.overdue.amount)} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild variant="secondary" size="sm"><Link href="/platform/billing">Open invoice ledger <ArrowRight /></Link></Button>
            </div>
            <div className="mt-6 border-t border-line pt-5">
              <p className="font-mono text-[8px] uppercase tracking-[.1em] text-ink-3">Monthly invoice history</p>
              {overview?.billingHistory.length ? <div className="mt-3 divide-y divide-line">{overview.billingHistory.slice(0, 6).map((month) => <div key={month.month} className="grid grid-cols-[1fr_repeat(3,minmax(0,1fr))] gap-3 py-2.5 text-[10.5px]"><span className="font-medium">{displayMonth(month.month)}</span><span className="text-end text-ink-2">{formatMoney(month.issued)} issued</span><span className="text-end text-success">{formatMoney(month.collected)} paid</span><span className="text-end text-warning">{formatMoney(month.outstanding)} due</span></div>)}</div> : <p className="mt-3 text-[10.5px] text-ink-3">No issued platform invoices are available for a monthly history.</p>}
            </div>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.9fr]">
          <section className="overflow-hidden border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><p className="eyebrow">Tenant directory</p><h2 className="mt-1 text-[17px] font-semibold">Subscribed gyms</h2></div><Button asChild variant="ghost" size="sm"><Link href="/platform/gyms">View all <ArrowRight /></Link></Button></div>
            <div className="divide-y divide-line">
              {directoryGyms.length ? directoryGyms.map((gym) => (
                <Link key={gym.id} href={`/platform/gyms/${gym.id}`} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-sunken sm:grid-cols-[1fr_130px_100px_auto]">
                  <div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center font-mono text-[9px] font-semibold text-white" style={{ backgroundColor: gym.accent }}>{gym.shortName.slice(0, 2)}</span><div className="min-w-0"><p className="truncate text-[13px] font-semibold">{gym.name}</p><p className="mt-0.5 text-[10.5px] text-ink-3">{gym.rivetPlan} plan</p></div></div>
                  <DirectoryFact label="Branches" value={String(gym.branchCount)} />
                  <DirectoryFact label="Listing" value={gym.isPublic ? "Public" : "Hidden"} />
                  <Status status={gym.subscriptionStatus} />
                </Link>
              )) : <p className="px-5 py-8 text-center text-[12px] text-ink-3">No provisioned gyms are present in the platform directory.</p>}
            </div>
          </section>

          <section className="border border-line bg-surface p-5 sm:p-6">
            <p className="eyebrow">Member acquisition</p>
            <h2 className="mt-2 text-[18px] font-semibold">Network demand</h2>
            <div className="mt-7 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3">
              <MiniMetric label="Trial requests" value={overview ? String(overview.trialRequests) : "—"} />
              <MiniMetric label="Converted trials" value={overview ? String(overview.trialConversions) : "—"} />
              <MiniMetric label="Conversion" value={conversionRate === undefined ? "Not available" : `${conversionRate}%`} />
            </div>
            <div className="mt-5"><Button asChild variant="secondary" size="sm"><Link href="/platform/applications">Review gym applications <ArrowRight /></Link></Button></div>
          </section>
        </div>

        <section className="mt-5 overflow-hidden border border-line bg-surface">
          <div className="border-b border-line px-5 py-4"><p className="eyebrow">Immutable platform audit</p><h2 className="mt-1 text-[17px] font-semibold">Recent operator activity</h2></div>
          {platformSnapshot?.auditEvents.length ? <div className="divide-y divide-line">{platformSnapshot.auditEvents.slice(0, 8).map((event) => <div key={event.id} className="grid gap-1 px-5 py-3 sm:grid-cols-[170px_1fr_auto] sm:items-center sm:gap-4"><span className="font-mono text-[8px] uppercase tracking-[.08em] text-ink-3">{event.action}</span><span className="text-[11.5px]">{event.summary}</span><span className="text-[9.5px] text-ink-3">{event.actorName} · {displayTimestamp(event.occurredAt)}</span></div>)}</div> : <p className="px-5 py-8 text-center text-[11.5px] text-ink-3">No platform operator actions have been recorded.</p>}
        </section>
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 text-[30px] font-semibold tracking-tight">{title}</h1><p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-ink-2">{description}</p></div>{action}</div>;
}

function Kpi({ icon, label, value, detail, warning = false }: { icon: React.ReactNode; label: string; value: string; detail: string; warning?: boolean }) {
  return <div className="border border-line bg-surface p-5"><div className="flex items-start justify-between"><span className="text-ink-3 [&_svg]:size-4">{icon}</span>{warning ? <CircleAlert className="size-4 text-warning" /> : null}</div><p className="mt-7 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-3">{label}</p><p className="mt-2 text-[28px] font-semibold tracking-tight">{value}</p><p className={warning ? "mt-2 text-[10.5px] text-warning" : "mt-2 text-[10.5px] text-ink-3"}>{detail}</p></div>;
}

function Status({ status }: { status: string }) {
  const active = status === "active";
  const trial = status === "trial";
  const danger = status === "suspended" || status === "cancelled";
  return <span className={`rounded-full px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.1em] ${active ? "bg-success-bg text-success" : trial ? "bg-info-bg text-info" : danger ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning"}`}>{status.replaceAll("_", " ")}</span>;
}

function subscriptionStatusOrder(status: string) {
  return { active: 0, trial: 1, overdue: 2, past_due: 2, suspended: 3, cancelled: 4 }[status as "active" | "trial" | "overdue" | "past_due" | "suspended" | "cancelled"] ?? 5;
}

function DirectoryFact({ label, value }: { label: string; value: string }) {
  return <div className="hidden sm:block"><p className="font-mono text-[8px] uppercase tracking-[0.1em] text-ink-3">{label}</p><p className="mt-1 text-[12px] font-medium">{value}</p></div>;
}

function MiniMetric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="bg-surface p-4"><p className="font-mono text-[8px] uppercase tracking-[0.1em] text-ink-3">{label}</p><p className={warning ? "mt-2 text-[20px] font-semibold text-warning" : "mt-2 text-[20px] font-semibold"}>{value}</p></div>;
}

function displayMonth(value: string) {
  const timestamp = Date.parse(`${value}-01T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-JO", { month: "short", year: "numeric", timeZone: "UTC" }).format(timestamp) : value;
}

function displayTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-JO", { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : "Time unavailable";
}
