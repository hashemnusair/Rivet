"use client";

import { AlertTriangle, ArrowRight, ArrowUpRight, Clock3, Info, OctagonAlert, UsersRound, WalletCards, type LucideIcon } from "lucide-react";
import Link from "next/link";

import type { DashboardData } from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp } from "@/lib/providers/app-providers";
import { addDays, todayISODate, formatDate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { MoneyText, RelativeText } from "@/components/shared/data-display";
import { PageHeader, Stat } from "@/components/shared/chrome";
import { TimelineFeed } from "@/components/shared/timeline-feed";
import { ErrorState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";
import { BranchRevenueBars, RevenueChart } from "./charts";
import { dashboardScopeDescription } from "./dashboard-scope";

export function OwnerDashboard() {
  const { session } = useApp();
  const branchId = session?.activeBranchId;
  const today = todayISODate();

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
        eyebrow={formatDate(today)}
        title={`${greeting()}, ${session?.user.name.split(" ")[0] ?? ""}`}
        description={
          dashboardScopeDescription(session?.branches ?? [], branchId)
        }
      />

      {/* KPI strip — one ruled panel, not six cards */}
      <section aria-label="Key numbers" className="panel grid grid-cols-2 divide-line sm:grid-cols-3 sm:divide-x lg:grid-cols-6">
        <KpiCell label="Collected today" loading={isLoading}>
          <MoneyText money={kpis?.revenueToday ?? money(0)} />
        </KpiCell>
        <KpiCell
          label="This month"
          loading={isLoading}
          context={
            monthDelta !== undefined ? (
              <span className={cn("inline-flex items-center gap-0.5", monthDelta >= 0 ? "text-success-deep" : "text-danger")}>
                <ArrowUpRight className={cn("size-3", monthDelta < 0 && "rotate-90")} />
                {Math.abs(monthDelta)}% vs last month
              </span>
            ) : undefined
          }
        >
          <MoneyText money={kpis?.revenueThisMonth ?? money(0)} compact />
        </KpiCell>
        <KpiCell label="Outstanding" loading={isLoading} tone={kpis && kpis.outstandingTotal.amount > 0 ? "warning" : undefined} context="unpaid balances">
          <MoneyText money={kpis?.outstandingTotal ?? money(0)} compact />
        </KpiCell>
        <KpiCell label="New members" loading={isLoading} context="this month">
          {kpis?.newMembersThisMonth ?? 0}
        </KpiCell>
        <KpiCell label="Renewals ≤ 7d" loading={isLoading} tone={kpis && kpis.renewalsDueNext7Days > 0 ? "warning" : undefined} context={`${kpis?.expiredUnactioned ?? 0} expired ≤ 30d`}>
          {kpis?.renewalsDueNext7Days ?? 0}
        </KpiCell>
        <KpiCell label="Check-ins today" loading={isLoading} context={`${kpis?.activeLeads ?? 0} open leads`}>
          {kpis?.checkInsToday ?? 0}
        </KpiCell>
      </section>

      {/* Alerts rail */}
      {data && data.alerts.length > 0 ? (
        <section aria-label="Needs attention" className="panel overflow-hidden">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold">
              <OctagonAlert className="size-4 text-signal" aria-hidden />
              Needs attention
              <span className="rounded-sm bg-signal-bg px-1.5 py-0.5 text-[11px] font-medium text-signal-deep tabular">
                {data.alerts.length}
              </span>
            </h2>
            <Link href="/audit" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
              Full audit trail <ArrowRight className="size-3" />
            </Link>
          </header>
          <ul className="divide-y divide-line">
            {data.alerts.slice(0, 5).map((alert) => (
              <li key={alert.id}>
                <Link href={alert.href} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sunken/40">
                  {alert.severity === "critical" ? (
                    <OctagonAlert className="size-4 shrink-0 text-signal" aria-hidden />
                  ) : alert.severity === "warning" ? (
                    <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
                  ) : (
                    <Info className="size-4 shrink-0 text-ink-3" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{alert.title}</span>
                    <span className="block truncate text-[12px] text-ink-3">{alert.detail}</span>
                  </span>
                  {alert.actorName ? <span className="hidden shrink-0 text-[12px] text-ink-3 sm:block">{alert.actorName}</span> : null}
                  <span className="shrink-0 text-[11.5px] text-ink-3">
                    <RelativeText iso={alert.occurredAt} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Revenue + branch/operating priorities */}
      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
        <section className="panel p-4">
          {isLoading || !data ? <Skeleton className="h-[220px] w-full" /> : <RevenueChart data={data.revenueSeries} />}
        </section>
        <div className="grid gap-5">
          <section className="panel p-4">
            <p className="eyebrow mb-3">Revenue by branch — 30 days</p>
            {isLoading || !data ? <Skeleton className="h-[90px] w-full" /> : <BranchRevenueBars data={data.branchRevenue} />}
          </section>
          <OperatingPriorities kpis={data?.kpis} loading={isLoading || !data} />
        </div>
      </div>

      {/* Leaderboard + activity */}
      <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
        <section className="panel overflow-hidden">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Sales this month</h2>
            <Link href="/crm/pipeline" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
              Pipeline <ArrowRight className="size-3" />
            </Link>
          </header>
          {isLoading || !data ? (
            <div className="p-4">
              <Skeleton className="h-[160px] w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-line text-start">
                    <th className="px-4 py-2 text-start font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">Rep</th>
                    <th className="whitespace-nowrap px-3 py-2 text-end font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">Collected</th>
                    <th className="px-3 py-2 text-end font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">New</th>
                    <th className="px-3 py-2 text-end font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">Renewals</th>
                    <th className="whitespace-nowrap px-3 py-2 text-end font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">Follow-ups</th>
                    <th className="px-4 py-2 text-end font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leaderboard.map((rep, i) => (
                    <tr key={rep.userId} className="border-b border-line/70 last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="me-2 text-[11px] text-ink-4 tabular">{String(i + 1).padStart(2, "0")}</span>
                        <span className="font-medium">{rep.name}</span>
                      </td>
                      <td className="px-3 py-2.5 text-end">
                        <MoneyText money={rep.revenueCollected} />
                      </td>
                      <td className="px-3 py-2.5 text-end tabular">{rep.newSales}</td>
                      <td className="px-3 py-2.5 text-end tabular">{rep.renewals}</td>
                      <td className="px-3 py-2.5 text-end tabular">{rep.followUpsCompleted}</td>
                      <td className={cn("px-4 py-2.5 text-end tabular", rep.overdueFollowUps > 0 && "text-danger font-medium")}>
                        {rep.overdueFollowUps}
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
            <h2 className="text-[13px] font-semibold">Recent activity</h2>
          </header>
          <div className="max-h-[380px] overflow-y-auto px-4 py-3">
            {isLoading || !data ? <Skeleton className="h-[220px] w-full" /> : <TimelineFeed events={data.recentActivity} dense />}
          </div>
        </section>
      </div>
    </div>
  );
}

export function OperatingPriorities({
  kpis,
  loading,
}: {
  kpis?: DashboardData["kpis"];
  loading: boolean;
}) {
  const priorities: Array<{
    label: string;
    detail: string;
    href: string;
    icon: LucideIcon;
    value: React.ReactNode;
    tone?: "warning" | "danger";
  }> = [
    {
      label: "Renewals due next 7 days",
      detail: `${kpis?.expiredUnactioned ?? 0} expired without a newer membership`,
      href: "/crm/queues",
      icon: Clock3,
      value: kpis?.renewalsDueNext7Days ?? 0,
      tone: (kpis?.renewalsDueNext7Days ?? 0) > 0 ? "warning" : undefined,
    },
    {
      label: "Outstanding balances",
      detail: "Collect open charges",
      href: "/payments",
      icon: WalletCards,
      value: <MoneyText money={kpis?.outstandingTotal ?? money(0)} compact />,
      tone: (kpis?.outstandingTotal.amount ?? 0) > 0 ? "warning" : undefined,
    },
    {
      label: "Open lead follow-up",
      detail: `${kpis?.overdueFollowUps ?? 0} follow-up${kpis?.overdueFollowUps === 1 ? "" : "s"} overdue`,
      href: "/crm/pipeline",
      icon: UsersRound,
      value: kpis?.activeLeads ?? 0,
      tone: (kpis?.overdueFollowUps ?? 0) > 0 ? "danger" : undefined,
    },
  ];

  return (
    <section className="panel overflow-hidden" aria-labelledby="operating-priorities-title">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="eyebrow">Operating priorities</p>
          <h2 id="operating-priorities-title" className="mt-1 text-[15px] font-semibold">Move the numbers that matter</h2>
        </div>
        <Link href="/crm/queues" className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[12px] text-ink-3 hover:text-ink">
          Open queues <ArrowRight className="size-3" />
        </Link>
      </header>
      <div className="divide-y divide-line">
        {priorities.map((priority) => {
          const Icon = priority.icon;
          return (
            <Link key={priority.label} href={priority.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken/40">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-3">
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium">{priority.label}</span>
                <span className="mt-0.5 block truncate text-[11px] text-ink-3">{priority.detail}</span>
              </span>
              {loading ? (
                <Skeleton className="h-5 w-12 shrink-0" />
              ) : (
                <span className={cn("shrink-0 text-[18px] font-medium leading-none tabular", priority.tone === "warning" && "text-warning-deep", priority.tone === "danger" && "text-danger")}>
                  {priority.value}
                </span>
              )}
              <ArrowRight className="size-3.5 shrink-0 text-ink-4" aria-hidden />
            </Link>
          );
        })}
      </div>
    </section>
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
      <p className="eyebrow">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <div className={cn("mt-1 text-[22px] font-medium leading-none tabular tracking-tight", tone === "warning" && "text-warning-deep")}>
          {children}
        </div>
      )}
      {context ? <div className="mt-1 text-[11.5px] text-ink-3">{context}</div> : null}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardStatPlaceholder() {
  return <Stat label="—" value="—" />;
}
