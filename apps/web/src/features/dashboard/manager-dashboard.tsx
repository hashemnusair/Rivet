"use client";
import { useT } from "@/lib/i18n/provider";


import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/chrome";
import { MoneyText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp } from "@/lib/providers/app-providers";
import { addDays, formatDate, todayISODate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { NeedsAttention } from "@/features/brief/needs-attention";
import { dashboardScopeDescription, timeOfDayGreeting } from "./dashboard-scope";
import { TodayQueue } from "./today-queue";
import { ContextLabel } from "@/components/ui/typography";

export function ManagerDashboard() {
  const t = useT();
  const { session } = useApp();
  const branchId = session?.activeBranchId;
  const today = todayISODate();
  const dashboardInput = { branchId, from: addDays(today, -29), to: today };
  const dashboard = useRealtimeApiQuery({ queryKey: qk.dashboard(branchId), query: (api) => api.getDashboard(dashboardInput), subscribe: (api, onValue, onError) => api.subscribeDashboard(dashboardInput, onValue, onError), enabled: Boolean(session) });
  if (dashboard.isError) return <ErrorState onRetry={() => dashboard.refetch()} />;

  const data = dashboard.data;
  const pendingApprovals = data?.todayQueue.kindCounts.approval ?? 0;
  const varianceShifts = data?.todayQueue.kindCounts.cash_variance ?? 0;
  const loading = dashboard.isLoading;

  return <div className="space-y-5"><PageHeader sectionLabel={formatDate(today)} title={`${timeOfDayGreeting()}, ${session?.user.name.split(" ")[0] ?? ""}`} description={dashboardScopeDescription(session?.branches ?? [], branchId)} actions={<Button asChild><Link href="/reception">{t("dashboard.manager.openReception")}{" "}<ArrowRight className="rtl:rotate-180" /></Link></Button>} />
    <section className="panel grid grid-cols-2 divide-line sm:grid-cols-3 sm:divide-x lg:grid-cols-6" aria-label={t("dashboard.owner.keyNumbers")}><Metric label={t("dashboard.manager.collectedToday")} loading={loading}><MoneyText money={data?.kpis.revenueToday ?? money(0)} /></Metric><Metric label={t("dashboard.manager.checkInsToday")} loading={loading}>{data?.kpis.checkInsToday ?? 0}</Metric><Metric label="Waiting for approval" loading={loading} warning={pendingApprovals > 0}>{pendingApprovals}</Metric><Metric label="Cash differences" loading={loading} warning={varianceShifts > 0}>{varianceShifts}</Metric><Metric label={t("dashboard.owner.lateFollowUps")} loading={loading} warning={(data?.kpis.overdueFollowUps ?? 0) > 0}>{data?.kpis.overdueFollowUps ?? 0}</Metric><Metric label={t("dashboard.owner.endingThisWeek")} loading={loading} warning={(data?.kpis.renewalsDueNext7Days ?? 0) > 0}>{data?.kpis.renewalsDueNext7Days ?? 0}</Metric></section>
    <NeedsAttention branchId={branchId} />
    <TodayQueue data={data?.todayQueue} loading={loading} />
  </div>;
}

function Metric({ label, children, loading, warning }: { label: string; children: React.ReactNode; loading: boolean; warning?: boolean }) { return <div className="px-4 py-3.5"><ContextLabel>{label}</ContextLabel>{loading ? <Skeleton className="mt-2 h-6 w-14" /> : <p className={warning ? "mt-1 text-[22px] font-medium tabular text-warning-deep" : "mt-1 text-[22px] font-medium tabular"}>{children}</p>}</div>; }
