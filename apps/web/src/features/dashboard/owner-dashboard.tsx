"use client";

import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { qk } from "@/lib/api/keys";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp } from "@/lib/providers/app-providers";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { MoneyText } from "@/components/shared/data-display";
import { PageHeader } from "@/components/shared/chrome";
import { TimelineFeed } from "@/components/shared/timeline-feed";
import { ErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";
import { NeedsAttention } from "@/features/brief/needs-attention";
import { BranchRevenueBars, RevenueChart } from "./charts";
import { useDashboardScopeText, useGreeting } from "./dashboard-scope";
import { TodayQueue } from "./today-queue";
import { ContextLabel } from "@/components/ui/typography";

export function OwnerDashboard() {
  const { session } = useApp();
  const { t, isolateLtr } = useLocale();
  const format = useFormat();
  const branchId = session?.activeBranchId;
  const today = todayISODate(session?.organization.timezone);
  const greeting = useGreeting(session?.user.name.split(" ")[0] ?? "", undefined, session?.organization.timezone);
  const scopeText = useDashboardScopeText(session?.branches ?? [], branchId);

  const dashboardQuery = { branchId, from: addDays(today, -29), to: today };
  const { data, isLoading, isError, refetch } = useRealtimeApiQuery({
    queryKey: qk.dashboard(branchId),
    query: (api) => api.getDashboard(dashboardQuery),
    subscribe: (api, onValue, onError) => api.subscribeDashboard(dashboardQuery, onValue, onError),
    enabled: Boolean(session),
  });

  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  const kpis = data?.kpis;
  const monthDelta =
    kpis && kpis.revenuePrevMonth.amount > 0
      ? Math.round(((kpis.revenueThisMonth.amount - kpis.revenuePrevMonth.amount) / kpis.revenuePrevMonth.amount) * 100)
      : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        sectionLabel={format.date(today)}
        title={greeting}
        description={scopeText}
      />

      {/* KPI strip — one ruled panel, not six cards */}
      <section aria-label={t("dashboard.owner.keyNumbers")} className="panel grid grid-cols-2 divide-line sm:grid-cols-3 sm:divide-x lg:grid-cols-6">
        <KpiCell label={t("dashboard.owner.collectedToday")} loading={isLoading}>
          <MoneyText money={kpis?.revenueToday ?? money(0)} />
        </KpiCell>
        <KpiCell
          label={t("dashboard.owner.collectedThisMonth")}
          loading={isLoading}
          context={
            monthDelta !== undefined ? (
              <span className={cn("inline-flex items-center gap-0.5", monthDelta >= 0 ? "text-success-deep" : "text-danger")}>
                <ArrowUpRight className={cn("size-3", monthDelta < 0 && "rotate-90")} aria-hidden />
                {t(monthDelta >= 0 ? "dashboard.owner.monthUp" : "dashboard.owner.monthDown", { percent: isolateLtr(format.percent(Math.abs(monthDelta))) })}
              </span>
            ) : undefined
          }
        >
          <MoneyText money={kpis?.revenueThisMonth ?? money(0)} compact />
        </KpiCell>
        <KpiCell label={t("dashboard.owner.unpaid")} loading={isLoading} tone={kpis && kpis.outstandingTotal.amount > 0 ? "warning" : undefined} context={t("dashboard.owner.owedByMembers")}>
          <MoneyText money={kpis?.outstandingTotal ?? money(0)} compact />
        </KpiCell>
        <KpiCell label={t("dashboard.owner.newMembers")} loading={isLoading} context={t("dashboard.owner.joinedThisMonth")}>
          {format.number(kpis?.newMembersThisMonth ?? 0)}
        </KpiCell>
        <KpiCell label={t("dashboard.owner.endingThisWeek")} loading={isLoading} tone={kpis && kpis.renewalsDueNext7Days > 0 ? "warning" : undefined} context={t("dashboard.owner.memberships")}>
          {format.number(kpis?.renewalsDueNext7Days ?? 0)}
        </KpiCell>
        <KpiCell label={t("dashboard.owner.checkInsToday")} loading={isLoading} context={t("dashboard.owner.openLeads", { count: kpis?.activeLeads ?? 0 })}>
          {format.number(kpis?.checkInsToday ?? 0)}
        </KpiCell>
      </section>

      <NeedsAttention branchId={branchId} />

      <TodayQueue data={data?.todayQueue} loading={isLoading || !data} initialVisible={4} />

      {/* Revenue + branch context */}
      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
        <section className="panel p-4">
          {isLoading || !data ? <Skeleton className="h-[220px] w-full" /> : <RevenueChart data={data.revenueSeries} currency={session?.organization.currency} />}
        </section>
        <section className="panel p-4">
          <ContextLabel className="mb-3">{t("dashboard.owner.collectedByBranch")}</ContextLabel>
          {isLoading || !data ? <Skeleton className="h-[90px] w-full" /> : <BranchRevenueBars data={data.branchRevenue} />}
        </section>
      </div>

      {/* Leaderboard + activity */}
      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
        <section className="panel overflow-hidden">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">{t("dashboard.owner.salesTeam")}</h2>
            <Link href="/crm/pipeline" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
              {t("dashboard.owner.leads")} <ArrowRight className="size-3" aria-hidden />
            </Link>
          </header>
          {isLoading || !data ? (
            <div className="p-4">
              <Skeleton className="h-[160px] w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]" aria-label={t("dashboard.owner.salesTeam")}>
                <thead>
                  <tr className="border-b border-line text-start">
                    <th className="px-4 py-2 text-start text-[11.5px] font-semibold text-ink-3">{t("dashboard.owner.salesperson")}</th>
                    <th className="whitespace-nowrap px-3 py-2 text-end text-[11.5px] font-semibold text-ink-3">{t("dashboard.owner.collected")}</th>
                    <th className="whitespace-nowrap px-3 py-2 text-end text-[11.5px] font-semibold text-ink-3">{t("dashboard.owner.newMembers")}</th>
                    <th className="px-3 py-2 text-end text-[11.5px] font-semibold text-ink-3">{t("dashboard.owner.renewals")}</th>
                    <th className="whitespace-nowrap px-3 py-2 text-end text-[11.5px] font-semibold text-ink-3">{t("dashboard.owner.followUpsDone")}</th>
                    <th className="whitespace-nowrap px-4 py-2 text-end text-[11.5px] font-semibold text-ink-3">{t("dashboard.owner.lateFollowUps")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard.map((rep, i) => (
                    <tr key={rep.userId} className="border-b border-line/70 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="me-2 text-[12px] text-ink-4 tabular">{String(i + 1).padStart(2, "0")}</span>
                        <bdi className="font-medium">{rep.name}</bdi>
                      </td>
                      <td className="px-3 py-2.5 text-end">
                        <MoneyText money={rep.revenueCollected} />
                      </td>
                      <td className="px-3 py-2.5 text-end tabular">{format.number(rep.newSales)}</td>
                      <td className="px-3 py-2.5 text-end tabular">{format.number(rep.renewals)}</td>
                      <td className="px-3 py-2.5 text-end tabular">{format.number(rep.followUpsCompleted)}</td>
                      <td className={cn("px-4 py-2.5 text-end tabular", rep.overdueFollowUps > 0 && "text-danger font-medium")}>
                        {format.number(rep.overdueFollowUps)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel overflow-hidden">
          <header className="border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">{t("dashboard.owner.recentActivity")}</h2>
          </header>
          <div className="max-h-[380px] overflow-y-auto px-4 py-3">
            {isLoading || !data ? <Skeleton className="h-[220px] w-full" /> : <TimelineFeed events={data.recentActivity} dense />}
          </div>
        </section>
      </div>
    </div>
  );
}

function KpiCell({
  label,
  children,
  context,
  tone,
  loading,
}: {
  label: string;
  children: React.ReactNode;
  context?: React.ReactNode;
  tone?: "warning";
  loading?: boolean;
}) {
  return (
    <div className="px-4 py-3.5">
      <ContextLabel>{label}</ContextLabel>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <div className={cn("mt-1 text-[22px] font-medium leading-none tabular tracking-tight", tone === "warning" && "text-warning-deep")}>
          {children}
        </div>
      )}
      {context ? <div className="mt-1 text-[12px] text-ink-3">{context}</div> : null}
    </div>
  );
}
