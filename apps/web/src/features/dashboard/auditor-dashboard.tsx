"use client";

import { ArrowRight, ClipboardCheck, FileSearch, Scale } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/shared/chrome";
import { MoneyText } from "@/components/shared/data-display";
import { TimelineFeed } from "@/components/shared/timeline-feed";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp } from "@/lib/providers/app-providers";
import { addDays, formatDate, todayISODate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { TodayQueue } from "./today-queue";

export function AuditorDashboard() {
  const { session } = useApp();
  const branchId = session?.activeBranchId;
  const today = todayISODate(session?.organization.timezone);
  const dashboardInput = { branchId, from: addDays(today, -29), to: today };
  const dashboard = useRealtimeApiQuery({
    queryKey: qk.dashboard(branchId),
    query: (api) => api.getDashboard(dashboardInput),
    subscribe: (api, onValue, onError) => api.subscribeDashboard(dashboardInput, onValue, onError),
    enabled: Boolean(session),
  });

  if (dashboard.isError) {
    return <ErrorState title="The review workspace could not be loaded" onRetry={() => dashboard.refetch()} />;
  }

  const data = dashboard.data;
  const criticalAlerts = data?.alerts.filter((alert) => alert.severity === "critical").length ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={formatDate(today)}
        title={`Review, ${session?.user.name.split(" ")[0] ?? "auditor"}`}
        description="A read-only view of financial exceptions, operational controls, and the records behind them."
        actions={
          <Button asChild>
            <Link href="/audit">
              Open audit trail <ArrowRight />
            </Link>
          </Button>
        }
      />

      <section aria-label="Review numbers" className="panel grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x">
        <Metric label="Collected today" loading={dashboard.isLoading}>
          <MoneyText money={data?.kpis.revenueToday ?? money(0)} />
        </Metric>
        <Metric label="Outstanding" loading={dashboard.isLoading} warning={(data?.kpis.outstandingTotal.amount ?? 0) > 0}>
          <MoneyText money={data?.kpis.outstandingTotal ?? money(0)} compact />
        </Metric>
        <Metric label="Critical alerts" loading={dashboard.isLoading} warning={criticalAlerts > 0}>
          {criticalAlerts}
        </Metric>
        <Metric label="Queue exceptions" loading={dashboard.isLoading} warning={(data?.todayQueue.urgentItems ?? 0) > 0}>
          {data?.todayQueue.totalItems ?? 0}
        </Metric>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <TodayQueue data={data?.todayQueue} loading={dashboard.isLoading} />
        <section className="panel overflow-hidden">
          <header className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
            <div>
              <p className="eyebrow">Evidence</p>
              <h2 className="mt-1 text-[14px] font-semibold">Recent recorded activity</h2>
            </div>
            <FileSearch className="size-4 text-ink-3" aria-hidden />
          </header>
          {dashboard.isLoading || !data ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : (
            <TimelineFeed events={data.recentActivity.slice(0, 8)} dense />
          )}
        </section>
      </div>

      <section className="panel grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0" aria-label="Review workspaces">
        <ReviewLink href="/reports/statements" icon={Scale} label="Financial statements" detail="Trace balances into ledger activity" />
        <ReviewLink href="/payments/shifts" icon={ClipboardCheck} label="Cash reconciliation" detail="Inspect shifts, counts, and variances" />
        <ReviewLink href="/audit" icon={FileSearch} label="Audit trail" detail="Filter sensitive changes by actor and action" />
      </section>
    </div>
  );
}

function Metric({ label, children, loading, warning }: { label: string; children: React.ReactNode; loading: boolean; warning?: boolean }) {
  return (
    <div className="px-4 py-3.5">
      <p className="eyebrow">{label}</p>
      {loading ? <Skeleton className="mt-2 h-6 w-14" /> : <p className={warning ? "mt-1 text-[22px] font-medium text-warning" : "mt-1 text-[22px] font-medium"}>{children}</p>}
    </div>
  );
}

function ReviewLink({ href, icon: Icon, label, detail }: { href: string; icon: typeof Scale; label: string; detail: string }) {
  return (
    <Link href={href} className="group flex min-h-20 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-sunken/40">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sunken text-ink-2 group-hover:bg-ink group-hover:text-paper">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">{detail}</span>
      </span>
      <ArrowRight className="size-3.5 shrink-0 text-ink-3" aria-hidden />
    </Link>
  );
}
