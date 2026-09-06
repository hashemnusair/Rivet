"use client";

import { ArrowRight, CircleAlert } from "lucide-react";
import Link from "next/link";
import { PageHeader, Stat } from "@/components/shared/chrome";
import { PlatformGymLogo } from "@/components/platform/platform-gym-logo";
import { PlatformPage, PlatformPanel, PlatformPanelHeader } from "@/components/platform/platform-page";
import { SubscriptionStatusBadge } from "@/components/platform/platform-status";
import { Button } from "@/components/ui/button";
import { ContextLabel, TechnicalLabel } from "@/components/ui/typography";
import type { PlatformOverview } from "@/lib/api/GymOSApi";
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
    <PlatformPage>
      <PageHeader
        title="Platform overview"
        description="Every gym on RIVET, what it owes, and the work waiting for you."
        actions={
          <>
            <Button asChild variant="secondary"><Link href="/platform/gyms">All gyms</Link></Button>
            <Button asChild><Link href="/platform/applications">Review applications <ArrowRight /></Link></Button>
          </>
        }
      />

      <div className="mt-5">{overview ? <AttentionStrip overview={overview} /> : <p className="text-[12.5px] text-ink-3" role="status">Loading the platform snapshot…</p>}</div>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Network totals">
        <PlatformPanel className="p-4"><Stat label="Active gyms" value={overview ? String(overview.gymCounts.active) : "—"} context={overview ? gymCountsDetail(overview.gymCounts) : "Loading"} /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label="Active MRR" value={overview ? formatMoney(overview.activeMrr) : "—"} context={overview ? "Annual plans at their real monthly rate" : "Loading"} /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label="Active members" value={overview ? overview.memberCount.toLocaleString() : "—"} context={overview ? `${overview.branchCount} branches · ${overview.activeStaffCount} staff` : "Loading"} /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label="Open support cases" value={overview ? String(openCases) : "—"} context={overview ? urgentCases > 0 ? `${urgentCases} urgent` : "None urgent" : "Loading"} tone={urgentCases > 0 ? "warning" : undefined} /></PlatformPanel>
      </section>

      <PlatformPanel className="mt-5" aria-labelledby="billing-position-title">
        <PlatformPanelHeader id="billing-position-title" title="Billing position" description="Platform invoices across every gym." actions={<Button asChild variant="secondary" size="sm"><Link href="/platform/billing">Open billing <ArrowRight /></Link></Button>} />
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-line sm:px-5">
          <Stat label="Collected" value={overview ? formatMoney(overview.invoiceTotals.collected) : "—"} className="sm:pe-5" />
          <Stat label="Outstanding" value={overview ? formatMoney(overview.invoiceTotals.outstanding) : "—"} className="sm:px-5" />
          <Stat label="Overdue" value={overview ? formatMoney(overview.invoiceTotals.overdue) : "—"} tone={overview?.invoiceTotals.overdue.amount ? "warning" : undefined} className="sm:ps-5" />
        </div>
        <div className="border-t border-line px-4 py-4 sm:px-5">
          <ContextLabel as="h3">Monthly invoice history</ContextLabel>
          {overview?.billingHistory.length ? (
            <div className="mt-2 divide-y divide-line">
              {overview.billingHistory.slice(0, 6).map((month) => (
                <div key={month.month} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-2 text-[12.5px] sm:grid-cols-[1fr_repeat(3,minmax(0,1fr))]">
                  <span className="font-medium">{displayMonth(month.month)}</span>
                  <span className="text-end tabular text-ink-2 sm:col-start-2">{formatMoney(month.issued)} issued</span>
                  <span className="text-end tabular text-success-deep sm:col-start-3">{formatMoney(month.collected)} paid</span>
                  <span className="text-end tabular text-warning-deep sm:col-start-4">{formatMoney(month.outstanding)} due</span>
                </div>
              ))}
            </div>
          ) : <p className="mt-2 text-[12.5px] text-ink-3">No issued platform invoices are available for a monthly history.</p>}
        </div>
      </PlatformPanel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.9fr]">
        <PlatformPanel aria-labelledby="subscribed-gyms-title">
          <PlatformPanelHeader id="subscribed-gyms-title" title="Subscribed gyms" actions={<Button asChild variant="ghost" size="sm"><Link href="/platform/gyms">View all <ArrowRight /></Link></Button>} />
          <div className="divide-y divide-line">
            {directoryGyms.length ? directoryGyms.map((gym) => (
              <Link key={gym.id} href={`/platform/gyms/${gym.id}`} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-sunken/60 sm:grid-cols-[1fr_110px_90px_auto] sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <PlatformGymLogo name={gym.name} shortName={gym.shortName} accent={gym.accent} logoUrl={gym.logoUrl} className="size-9 rounded-md text-[11px]" />
                  <div className="min-w-0"><p className="truncate text-[13.5px] font-semibold">{gym.name}</p><p className="mt-0.5 text-[12.5px] text-ink-3">{gym.rivetPlan} plan</p></div>
                </div>
                <DirectoryFact label="Branches" value={String(gym.branchCount)} />
                <DirectoryFact label="Listing" value={gym.isPublic ? "Public" : "Hidden"} />
                <SubscriptionStatusBadge status={gym.subscriptionStatus} />
              </Link>
            )) : <p className="px-5 py-8 text-center text-[12.5px] text-ink-3">No provisioned gyms are present in the platform directory.</p>}
          </div>
        </PlatformPanel>

        <PlatformPanel aria-labelledby="network-demand-title">
          <PlatformPanelHeader id="network-demand-title" title="Network demand" description="Trial requests sent through public gym pages." />
          <div className="grid grid-cols-2 gap-4 px-4 py-4 sm:grid-cols-3 sm:px-5">
            <Stat label="Trial requests" value={overview ? String(overview.trialRequests) : "—"} />
            <Stat label="Converted trials" value={overview ? String(overview.trialConversions) : "—"} />
            <Stat label="Conversion" value={conversionRate === undefined ? "Not available" : `${conversionRate}%`} />
          </div>
          <div className="border-t border-line px-4 py-3 sm:px-5"><Button asChild variant="secondary" size="sm"><Link href="/platform/applications">Review gym applications <ArrowRight /></Link></Button></div>
        </PlatformPanel>
      </div>

      <PlatformPanel className="mt-5" aria-labelledby="operator-activity-title">
        <PlatformPanelHeader id="operator-activity-title" title="Recent operator activity" description="Immutable platform audit; every entry names who did it and when." />
        {platformSnapshot?.auditEvents.length ? (
          <div className="divide-y divide-line">
            {platformSnapshot.auditEvents.slice(0, 8).map((event) => (
              <div key={event.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr_auto] sm:items-center sm:gap-4 sm:px-5">
                <TechnicalLabel as="span">{event.action}</TechnicalLabel>
                <span className="text-[13px]">{event.summary}</span>
                <span className="text-[12.5px] text-ink-3">{event.actorName} · {displayTimestamp(event.occurredAt)}</span>
              </div>
            ))}
          </div>
        ) : <p className="px-5 py-8 text-center text-[12.5px] text-ink-3">No platform operator actions have been recorded.</p>}
      </PlatformPanel>
    </PlatformPage>
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

/** Only work that actually needs the operator, ahead of the healthy totals; quiet when there is none. */
function AttentionStrip({ overview }: { overview: PlatformOverview }) {
  const items = [
    { count: overview.pendingApplications, one: "application awaiting review", many: "applications awaiting review", href: "/platform/applications?status=pending" },
    { count: overview.provisioningFailures, one: "provisioning failure", many: "provisioning failures", href: "/platform/applications?status=approved" },
    { count: overview.pastDueAccounts, one: "past-due gym account", many: "past-due gym accounts", href: "/platform/billing" },
    { count: overview.urgentSupportCases, one: "urgent support case", many: "urgent support cases", href: "/platform/support" },
    { count: overview.trialsExpiringSoon, one: "trial ending within 14 days", many: "trials ending within 14 days", href: "/platform/gyms?status=trial" },
  ].filter((item) => item.count > 0).map((item) => ({ ...item, label: item.count === 1 ? item.one : item.many }));
  if (items.length === 0) return <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[12.5px] text-ink-2" role="status">Nothing needs your attention right now.</p>;
  return (
    <section className="flex flex-wrap gap-2" aria-label="Needs attention">
      {items.map((item) => (
        <Link key={item.label} href={item.href} data-touch-target className="inline-flex items-center gap-2 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12.5px] font-medium text-warning-deep transition-colors hover:border-warning">
          <CircleAlert className="size-3.5" aria-hidden />{item.count} {item.label}
        </Link>
      ))}
    </section>
  );
}

function subscriptionStatusOrder(status: string) {
  return { active: 0, trial: 1, overdue: 2, past_due: 2, suspended: 3, cancelled: 4 }[status as "active" | "trial" | "overdue" | "past_due" | "suspended" | "cancelled"] ?? 5;
}

function DirectoryFact({ label, value }: { label: string; value: string }) {
  return <div className="hidden sm:block"><ContextLabel>{label}</ContextLabel><p className="mt-0.5 text-[13px] font-medium tabular">{value}</p></div>;
}

function displayMonth(value: string) {
  const timestamp = Date.parse(`${value}-01T00:00:00.000Z`);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-JO", { month: "short", year: "numeric", timeZone: "UTC" }).format(timestamp) : value;
}

function displayTimestamp(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-JO", { dateStyle: "medium", timeStyle: "short" }).format(timestamp) : "Time unavailable";
}
