"use client";
import { useT, type TKey } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";

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

export default function PlatformOverviewPage() {
  const t = useT();
  const f = useFormat();
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
        title={t("platformConsole.home.title")}
        description={t("platformConsole.home.description")}
        actions={
          <>
            <Button asChild variant="secondary"><Link href="/platform/gyms">{t("platformConsole.home.allGyms")}</Link></Button>
            <Button asChild><Link href="/platform/applications">{t("platformConsole.home.reviewApplications")} <ArrowRight className="rtl:rotate-180" /></Link></Button>
          </>
        }
      />

      <div className="mt-5">{overview ? <AttentionStrip overview={overview} /> : <p className="text-[12.5px] text-ink-3" role="status">{t("platformConsole.home.loadingSnapshot")}</p>}</div>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("platformConsole.home.networkTotals")}>
        <PlatformPanel className="p-4"><Stat label={t("platformConsole.home.activeGyms")} value={overview ? f.number(overview.gymCounts.active) : "—"} context={overview ? gymCountsDetail(overview.gymCounts, t) : t("common.a11y.loading")} /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label={t("platformConsole.home.activeMrr")} value={overview ? f.money(overview.activeMrr) : "—"} context={overview ? t("platformConsole.home.annualPlansAtMonthlyRate") : t("common.a11y.loading")} /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label={t("members.list.activeMembers")} value={overview ? f.number(overview.memberCount) : "—"} context={overview ? t("platformConsole.home.branchesAndStaff", { branches: t("platformConsole.home.branches", { count: overview.branchCount }), staff: t("platformConsole.home.staff", { count: overview.activeStaffCount }) }) : t("common.a11y.loading")} /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label={t("platformConsole.home.openSupportCases")} value={overview ? f.number(openCases) : "—"} context={overview ? urgentCases > 0 ? t("platformConsole.home.urgent", { count: urgentCases }) : t("platformConsole.home.noneUrgent") : t("common.a11y.loading")} tone={urgentCases > 0 ? "warning" : undefined} /></PlatformPanel>
      </section>

      <PlatformPanel className="mt-5" aria-labelledby="billing-position-title">
        <PlatformPanelHeader id="billing-position-title" title={t("platformConsole.home.billingPosition")} description={t("platformConsole.home.invoicesAcrossGyms")} actions={<Button asChild variant="secondary" size="sm"><Link href="/platform/billing">{t("platformConsole.home.openBilling")} <ArrowRight className="rtl:rotate-180" /></Link></Button>} />
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-line sm:px-5">
          <Stat label={t("dashboard.owner.collected")} value={overview ? f.money(overview.invoiceTotals.collected) : "—"} className="sm:pe-5" />
          <Stat label={t("marketing.device.kpi.outstanding")} value={overview ? f.money(overview.invoiceTotals.outstanding) : "—"} className="sm:px-5" />
          <Stat label={t("dashboard.owner.overdueCol")} value={overview ? f.money(overview.invoiceTotals.overdue) : "—"} tone={overview?.invoiceTotals.overdue.amount ? "warning" : undefined} className="sm:ps-5" />
        </div>
        <div className="border-t border-line px-4 py-4 sm:px-5">
          <ContextLabel as="h3">{t("platformConsole.home.monthlyHistory")}</ContextLabel>
          {overview?.billingHistory.length ? (
            <div className="mt-2 divide-y divide-line">
              {overview.billingHistory.slice(0, 6).map((month) => (
                <div key={month.month} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-2 text-[12.5px] sm:grid-cols-[1fr_repeat(3,minmax(0,1fr))]">
                  <span className="font-medium">{displayMonth(month.month, f.monthYear)}</span>
                  <span className="text-end tabular text-ink-2 sm:col-start-2">{f.money(month.issued)} {t("platformConsole.home.issued")}</span>
                  <span className="text-end tabular text-success-deep sm:col-start-3">{f.money(month.collected)} {t("platformConsole.home.paid")}</span>
                  <span className="text-end tabular text-warning-deep sm:col-start-4">{f.money(month.outstanding)}{" "}{t("memberProfile.relatedTask.due")}</span>
                </div>
              ))}
            </div>
          ) : <p className="mt-2 text-[12.5px] text-ink-3">{t("platformConsole.home.noInvoiceHistory")}</p>}
        </div>
      </PlatformPanel>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.9fr]">
        <PlatformPanel aria-labelledby="subscribed-gyms-title">
          <PlatformPanelHeader id="subscribed-gyms-title" title={t("platformConsole.home.subscribedGyms")} actions={<Button asChild variant="ghost" size="sm"><Link href="/platform/gyms">{t("platformConsole.home.viewAll")}{" "}<ArrowRight className="rtl:rotate-180" /></Link></Button>} />
          <div className="divide-y divide-line">
            {directoryGyms.length ? directoryGyms.map((gym) => (
              <Link key={gym.id} href={`/platform/gyms/${gym.id}`} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 transition-colors hover:bg-sunken/60 sm:grid-cols-[1fr_110px_90px_auto] sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <PlatformGymLogo name={gym.name} shortName={gym.shortName} accent={gym.accent} logoUrl={gym.logoUrl} className="size-9 rounded-md text-[11px]" />
                  <div className="min-w-0"><p dir="auto" className="truncate text-[13.5px] font-semibold">{gym.name}</p><p dir="auto" className="mt-0.5 text-[12.5px] text-ink-3">{t("platformConsole.home.plan")} {gym.rivetPlan}</p></div>
                </div>
                <DirectoryFact label={t("platformConsole.home.gymBranches")} value={f.number(gym.branchCount)} />
                <DirectoryFact label={t("platformConsole.home.listing")} value={gym.isPublic ? t("platformConsole.home.public") : t("platformConsole.home.hidden")} />
                <SubscriptionStatusBadge status={gym.subscriptionStatus} />
              </Link>
            )) : <p className="px-5 py-8 text-center text-[12.5px] text-ink-3">{t("platformConsole.home.noGyms")}</p>}
          </div>
        </PlatformPanel>

        <PlatformPanel aria-labelledby="network-demand-title">
          <PlatformPanelHeader id="network-demand-title" title={t("platformConsole.home.networkDemand")} description={t("platformConsole.home.publicTrialRequests")} />
          <div className="grid grid-cols-2 gap-4 px-4 py-4 sm:grid-cols-3 sm:px-5">
            <Stat label={t("platformConsole.home.trialRequests")} value={overview ? f.number(overview.trialRequests) : "—"} />
            <Stat label={t("platformConsole.home.convertedTrials")} value={overview ? f.number(overview.trialConversions) : "—"} />
            <Stat label={t("platformConsole.home.conversion")} value={conversionRate === undefined ? t("platformConsole.home.notAvailable") : f.percent(conversionRate)} />
          </div>
          <div className="border-t border-line px-4 py-3 sm:px-5"><Button asChild variant="secondary" size="sm"><Link href="/platform/applications">{t("platformConsole.home.reviewGymApplications")} <ArrowRight className="rtl:rotate-180" /></Link></Button></div>
        </PlatformPanel>
      </div>

      <PlatformPanel className="mt-5" aria-labelledby="operator-activity-title">
        <PlatformPanelHeader id="operator-activity-title" title={t("platformConsole.home.recentActivity")} description={t("platformConsole.home.immutableAudit")} />
        {platformSnapshot?.auditEvents.length ? (
          <div className="divide-y divide-line">
            {platformSnapshot.auditEvents.slice(0, 8).map((event) => (
              <div key={event.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[180px_1fr_auto] sm:items-center sm:gap-4 sm:px-5">
                <TechnicalLabel as="span">{event.action}</TechnicalLabel>
                <span className="text-[13px]" dir="auto">{event.summary}</span>
                <span className="text-[12.5px] text-ink-3" dir="auto">{t("platformConsole.home.auditActorTime", { actor: event.actorName, time: displayTimestamp(event.occurredAt, f.dateTime, t("platformConsole.home.timestampUnavailable")) })}</span>
              </div>
            ))}
          </div>
        ) : <p className="px-5 py-8 text-center text-[12.5px] text-ink-3">{t("platformConsole.home.noOperatorActivity")}</p>}
      </PlatformPanel>
    </PlatformPage>
  );
}

function gymCountsDetail(counts: { trial: number; past_due: number; suspended: number; cancelled: number }, t: ReturnType<typeof useT>): string {
  const parts = [
    counts.trial ? t("platformConsole.home.trial", { count: counts.trial }) : "",
    counts.past_due ? t("platformConsole.home.pastDue", { count: counts.past_due }) : "",
    counts.suspended ? t("platformConsole.home.suspended", { count: counts.suspended }) : "",
    counts.cancelled ? t("platformConsole.home.cancelled", { count: counts.cancelled }) : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : t("platformConsole.home.everyTenantCurrent");
}

/** Only work that actually needs the operator, ahead of the healthy totals; quiet when there is none. */
function AttentionStrip({ overview }: { overview: PlatformOverview }) {
  const t = useT();
  const queueItems: Array<{ count: number; key: TKey; href: string }> = [
    { count: overview.pendingApplications, key: "platformConsole.home.applicationsAwaitingReview", href: "/platform/applications?status=pending" },
    { count: overview.provisioningFailures, key: "platformConsole.home.provisioningFailures", href: "/platform/applications?status=approved" },
    { count: overview.pastDueAccounts, key: "platformConsole.home.pastDueAccounts", href: "/platform/billing" },
    { count: overview.urgentSupportCases, key: "platformConsole.home.urgentSupport", href: "/platform/support" },
    { count: overview.trialsExpiringSoon, key: "platformConsole.home.trialsEnding", href: "/platform/gyms?status=trial" },
  ];
  const items = queueItems.filter((item) => item.count > 0).map((item) => ({ ...item, label: t(item.key, { count: item.count }) }));
  if (items.length === 0) return <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[12.5px] text-ink-2" role="status">{t("platformConsole.home.nothingNeedsAttention")}</p>;
  return (
    <section className="flex flex-wrap gap-2" aria-label={t("platformConsole.home.attention")}>
      {items.map((item) => (
        <Link key={item.key} href={item.href} data-touch-target className="inline-flex items-center gap-2 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12.5px] font-medium text-warning-deep transition-colors hover:border-warning">
          <CircleAlert className="size-3.5" aria-hidden />{item.label}
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

function displayMonth(value: string, monthYear: (iso: string) => string) {
  const iso = `${value}-01`;
  return Number.isFinite(Date.parse(`${iso}T12:00:00.000Z`)) ? monthYear(iso) : value;
}

function displayTimestamp(value: string, dateTime: (iso: string) => string, fallback: string) {
  return Number.isFinite(Date.parse(value)) ? dateTime(value) : fallback;
}
