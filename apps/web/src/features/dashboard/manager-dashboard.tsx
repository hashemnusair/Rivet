"use client";

import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
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
import { TodayQueue } from "./today-queue";

export function ManagerDashboard() {
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

  return <div className="space-y-5"><PageHeader eyebrow={formatDate(today)} title={`Operations, ${session?.user.name.split(" ")[0] ?? "manager"}`} description={branchId ? session?.branches.find((branch) => branch.id === branchId)?.name ?? "Accessible branch" : "All accessible branches"} actions={<Button asChild><Link href="/reception">Open reception <ArrowRight /></Link></Button>} />
    <section className="panel grid grid-cols-2 divide-line sm:grid-cols-3 sm:divide-x lg:grid-cols-6"><Metric label="Collected today" loading={loading}><MoneyText money={data?.kpis.revenueToday ?? money(0)} /></Metric><Metric label="Check-ins today" loading={loading}>{data?.kpis.checkInsToday ?? 0}</Metric><Metric label="Pending approvals" loading={loading} warning={pendingApprovals > 0}>{pendingApprovals}</Metric><Metric label="Shift variances" loading={loading} warning={varianceShifts > 0}>{varianceShifts}</Metric><Metric label="Overdue follow-ups" loading={loading} warning={(data?.kpis.overdueFollowUps ?? 0) > 0}>{data?.kpis.overdueFollowUps ?? 0}</Metric><Metric label="Renewals queue" loading={loading} warning={(data?.kpis.renewalsDueNext7Days ?? 0) > 0}>{data?.kpis.renewalsDueNext7Days ?? 0}</Metric></section>
    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><TodayQueue data={data?.todayQueue} loading={loading} /><section className="panel overflow-hidden"><header className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="text-[13px] font-semibold">Operational attention</h2><Button asChild variant="ghost" size="sm"><Link href="/audit">Audit trail <ArrowRight /></Link></Button></header><div className="divide-y divide-line">{data?.alerts.slice(0, 5).map((alert) => <Link key={alert.id} href={alert.href} className="flex items-start gap-3 px-4 py-3 hover:bg-sunken"><AlertTriangle className={alert.severity === "critical" ? "mt-0.5 size-4 text-danger" : "mt-0.5 size-4 text-warning"} /><span className="min-w-0"><span className="block text-[12.5px] font-medium">{alert.title}</span><span className="mt-0.5 block text-[10.5px] text-ink-3">{alert.detail}</span></span></Link>)}{(data?.alerts.length ?? 0) === 0 ? <div className="px-5 py-12 text-center"><CheckCircle2 className="mx-auto size-5 text-success" /><p className="mt-3 text-[12px] font-medium">No operational alerts</p><p className="mt-1 text-[10.5px] text-ink-3">This reflects the current persisted records.</p></div> : null}</div></section></div>
  </div>;
}

function Metric({ label, children, loading, warning }: { label: string; children: React.ReactNode; loading: boolean; warning?: boolean }) { return <div className="px-4 py-3.5"><p className="eyebrow">{label}</p>{loading ? <Skeleton className="mt-2 h-6 w-14" /> : <p className={warning ? "mt-1 text-[22px] font-medium text-warning" : "mt-1 text-[22px] font-medium"}>{children}</p>}</div>; }
