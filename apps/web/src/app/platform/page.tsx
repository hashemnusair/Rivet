"use client";

import { ArrowRight, Building2, CircleAlert, CreditCard, LifeBuoy, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/chrome";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { ContextLabel, TechnicalLabel } from "@/components/ui/typography";
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
        <PageHeader
          title="Platform overview"
          description="Tenants, money, and anything that needs you — live."
          actions={<Button asChild variant="signal"><Link href="/platform/gyms">Manage gyms <ArrowRight /></Link></Button>}
        />

        <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi icon={<Building2 />} label="Active gyms" value={overview ? String(overview.gymCounts.active) : "—"} detail={overview ? gymCountsDetail(overview.gymCounts) : "Loading"} />
          <Kpi icon={<CreditCard />} label="Active MRR" value={overview ? formatMoney(overview.activeMrr) : "—"} detail={overview ? "Annual plans at their real monthly rate" : "Loading"} />
          <Kpi icon={<Users />} label="Active members" value={overview ? overview.memberCount.toLocaleString() : "—"} detail={overview ? `${overview.branchCount} branches · ${overview.activeStaffCount} staff` : "Loading"} />
          <Kpi icon={<LifeBuoy />} label="Open support cases" value={overview ? String(openCases) : "—"} detail={overview ? urgentCases > 0 ? `${urgentCases} urgent` : "None urgent" : "Loading"} warning={urgentCases > 0} />
        </section>

        {overview ? <AttentionStrip overview={overview} /> : null}

        <section className="mt-5 border border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-[20px] font-semibold">Billing position</h2>
              <Button asChild variant="secondary" size="sm"><Link href="/platform/billing">Open billing <ArrowRight /></Link></Button>
            </div>
            <div className="mt-5 grid gap-px border border-line bg-line sm:grid-cols-3">
              <MiniMetric label="Collected" value={overview ? formatMoney(overview.invoiceTotals.collected) : "—"} />
              <MiniMetric label="Outstanding" value={overview ? formatMoney(overview.invoiceTotals.outstanding) : "—"} />
              <MiniMetric label="Overdue" value={overview ? formatMoney(overview.invoiceTotals.overdue) : "—"} warning={Boolean(overview?.invoiceTotals.overdue.amount)} />
            </div>
            <div className="mt-6 border-t border-line pt-5">
              <ContextLabel>Monthly invoice history</ContextLabel>
              {overview?.billingHistory.length ? <div className="mt-3 divide-y divide-line">{overview.billingHistory.slice(0, 6).map((month) => <div key={month.month} className="grid grid-cols-[1fr_repeat(3,minmax(0,1fr))] gap-3 py-2.5 text-[12px]"><span className="font-medium">{displayMonth(month.month)}</span><span className="text-end text-ink-2">{formatMoney(month.issued)} issued</span><span className="text-end text-success">{formatMoney(month.collected)} paid</span><span className="text-end text-warning">{formatMoney(month.outstanding)} due</span></div>)}</div> : <p className="mt-3 text-[12px] text-ink-3">No issued platform invoices are available for a monthly history.</p>}
            </div>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.9fr]">
          <section className="overflow-hidden border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-4"><h2 className="text-[17px] font-semibold">Subscribed gyms</h2><Button asChild variant="ghost" size="sm"><Link href="/platform/gyms">View all <ArrowRight /></Link></Button></div>
            <div className="divide-y divide-line">
              {directoryGyms.length ? directoryGyms.map((gym) => (
                <Link key={gym.id} href={`/platform/gyms/${gym.id}`} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-sunken sm:grid-cols-[1fr_130px_100px_auto]">
                  <div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center font-mono text-[10.5px] font-semibold text-white" style={{ backgroundColor: gym.accent }}>{gym.shortName.slice(0, 2)}</span><div className="min-w-0"><p className="truncate text-[13px] font-semibold">{gym.name}</p><p className="mt-0.5 text-[10.5px] text-ink-3">{gym.rivetPlan} plan</p></div></div>
                  <DirectoryFact label="Branches" value={String(gym.branchCount)} />
                  <DirectoryFact label="Listing" value={gym.isPublic ? "Public" : "Hidden"} />
                  <Status status={gym.subscriptionStatus} />
                </Link>
              )) : <p className="px-5 py-8 text-center text-[12px] text-ink-3">No provisioned gyms are present in the platform directory.</p>}
            </div>
          </section>

          <section className="border border-line bg-surface p-5 sm:p-6">
            <ContextLabel>Member acquisition</ContextLabel>
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
          <div className="border-b border-line px-5 py-4"><ContextLabel>Immutable platform audit</ContextLabel><h2 className="mt-1 text-[17px] font-semibold">Recent operator activity</h2></div>
          {platformSnapshot?.auditEvents.length ? <div className="divide-y divide-line">{platformSnapshot.auditEvents.slice(0, 8).map((event) => <div key={event.id} className="grid gap-1 px-5 py-3 sm:grid-cols-[170px_1fr_auto] sm:items-center sm:gap-4"><TechnicalLabel>{event.action}</TechnicalLabel><span className="text-[13px]">{event.summary}</span><span className="text-[12px] text-ink-3">{event.actorName} · {displayTimestamp(event.occurredAt)}</span></div>)}</div> : <p className="px-5 py-8 text-center text-[13px] text-ink-3">No platform operator actions have been recorded.</p>}
        </section>
      </div>
    </div>
  );
}

function gymCountsDetail(counts: { trial: number; past_due: number; suspended: number; cancelled: number }): string {
  const parts = [
    counts.trial ? `${counts.trial} trial` : "",
    counts.past_due ? `${counts.past_due} past due` : "",
    counts.suspended ? `${counts.suspended} suspended` : "",
    counts.cancelled ? `${counts.cancelled} cancelled` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Every tenant is current";
}

/** Only work that actually needs the operator; quiet when there is none. */
function AttentionStrip({ overview }: { overview: NonNullable<ReturnType<typeof useExperience>["platformSnapshot"]>["overview"] }) {
  const items = [
    { count: overview.pendingApplications, one: "application awaiting review", many: "applications awaiting review", href: "/platform/applications" },
    { count: overview.provisioningFailures, one: "provisioning failure", many: "provisioning failures", href: "/platform/applications" },
    { count: overview.trialsExpiringSoon, one: "trial ending within 14 days", many: "trials ending within 14 days", href: "/platform/gyms" },
    { count: overview.pastDueAccounts, one: "past-due gym account", many: "past-due gym accounts", href: "/platform/billing" },
  ].filter((item) => item.count > 0).map((item) => ({ ...item, label: item.count === 1 ? item.one : item.many }));
  if (items.length === 0) return <p className="mt-3 border border-line bg-surface px-4 py-3 text-[11.5px] text-ink-3">Nothing needs your attention right now.</p>;
  return (
    <section className="mt-3 flex flex-wrap gap-2" aria-label="Needs attention">
      {items.map((item) => (
        <Link key={item.label} href={item.href} className="inline-flex items-center gap-2 border border-warning/40 bg-warning-bg px-3 py-2 text-[11.5px] font-medium text-warning-deep transition-colors hover:border-warning">
          <CircleAlert className="size-3.5" aria-hidden />{item.count} {item.label}
        </Link>
      ))}
    </section>
  );
}

function Kpi({ icon, label, value, detail, warning = false }: { icon: React.ReactNode; label: string; value: string; detail: string; warning?: boolean }) {
  return <div className="border border-line bg-surface p-5"><div className="flex items-start justify-between"><span className="text-ink-3 [&_svg]:size-4">{icon}</span>{warning ? <CircleAlert className="size-4 text-warning" /> : null}</div><ContextLabel className="mt-7">{label}</ContextLabel><p className="mt-2 text-[28px] font-semibold tabular tracking-tight">{value}</p><p className={warning ? "mt-2 text-[12px] text-warning" : "mt-2 text-[12px] text-ink-3"}>{detail}</p></div>;
}

function Status({ status }: { status: string }) {
  const active = status === "active";
  const trial = status === "trial";
  const danger = status === "suspended" || status === "cancelled";
  return <StatusChip tone={active ? "green" : trial ? "neutral" : danger ? "red" : "amber"}>{status.replaceAll("_", " ")}</StatusChip>;
}

function subscriptionStatusOrder(status: string) {
  return { active: 0, trial: 1, overdue: 2, past_due: 2, suspended: 3, cancelled: 4 }[status as "active" | "trial" | "overdue" | "past_due" | "suspended" | "cancelled"] ?? 5;
}

function DirectoryFact({ label, value }: { label: string; value: string }) {
  return <div className="hidden sm:block"><ContextLabel>{label}</ContextLabel><p className="mt-1 text-[13px] font-medium tabular">{value}</p></div>;
}

function MiniMetric({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="bg-surface p-4"><ContextLabel>{label}</ContextLabel><p className={warning ? "mt-2 text-[20px] font-semibold tabular text-warning" : "mt-2 text-[20px] font-semibold tabular"}>{value}</p></div>;
}

function displayMonth(value: string) {
  const timestamp = Date.parse(`${value}-01T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-JO", { month: "short", year: "numeric", timeZone: "UTC" }).format(timestamp) : value;
}

function displayTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-JO", { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : "Time unavailable";
}
