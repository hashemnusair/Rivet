"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/chrome";
import { MoneyText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState } from "@/components/ui/states";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp } from "@/lib/providers/app-providers";
import { addDays, formatDate, todayISODate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { useT } from "@/lib/i18n/provider";

export function ManagerDashboard() {
  const t = useT();
  const { session } = useApp();
  const branchId = session?.activeBranchId;
  const today = todayISODate();
  const dashboardInput = { branchId, from: addDays(today, -29), to: today };
  const dashboard = useRealtimeApiQuery({ queryKey: qk.dashboard(branchId), query: (api) => api.getDashboard(dashboardInput), subscribe: (api, onValue, onError) => api.subscribeDashboard(dashboardInput, onValue, onError), enabled: Boolean(session) });
  const approvals = useApiQuery(["approvals", "manager"], (api) => api.listPendingApprovals(), { enabled: Boolean(session) });
  const shiftsInput = { branchId, pageSize: 30 };
  const shifts = useRealtimeApiQuery({ queryKey: ["shifts", "manager", branchId], query: (api) => api.listCashShifts(shiftsInput), subscribe: (api, onValue, onError) => api.subscribeCashShifts(shiftsInput, onValue, onError), enabled: Boolean(session) });
  const tasksInput = { status: "open" as const, pageSize: 50 };
  const tasks = useRealtimeApiQuery({ queryKey: qk.tasks({ manager: true, branchId }), query: (api) => api.listTasks(tasksInput), subscribe: (api, onValue, onError) => api.subscribeTasks(tasksInput, onValue, onError), enabled: Boolean(session) });
  const renewalsInput = { branchId, pageSize: 50 };
  const renewals = useRealtimeApiQuery({ queryKey: ["renewals", "manager", branchId], query: (api) => api.listRenewalQueue(renewalsInput), subscribe: (api, onValue, onError) => api.subscribeRenewalQueue(renewalsInput, onValue, onError), enabled: Boolean(session) });
  if (dashboard.isError) return <ErrorState onRetry={() => dashboard.refetch()} />;

  const data = dashboard.data;
  const overdueTasks = (tasks.data?.items ?? []).filter((task) => task.dueAt < new Date().toISOString());
  const varianceShifts = (shifts.data?.items ?? []).filter((shift) => shift.status === "closed" && Math.abs(shift.variance?.amount ?? 0) > 0 && shift.varianceApprovalStatus === "pending");
  const expiring = renewals.data?.items.length ?? 0;
  const loading = dashboard.isLoading || approvals.isLoading || shifts.isLoading || tasks.isLoading || renewals.isLoading;

  return <div className="space-y-5"><PageHeader eyebrow={formatDate(today)} title={`Operations, ${session?.user.name.split(" ")[0] ?? "manager"}`} description={branchId ? session?.branches.find((branch) => branch.id === branchId)?.name ?? "Accessible branch" : "All accessible branches"} actions={<Button asChild><Link href="/reception">{t("dashboard.manager.openReception")} <ArrowRight /></Link></Button>} />
    <section className="panel grid grid-cols-2 divide-line sm:grid-cols-3 sm:divide-x lg:grid-cols-6"><Metric label={t("dashboard.manager.collectedToday")} loading={loading}><MoneyText money={data?.kpis.revenueToday ?? money(0)} /></Metric><Metric label={t("dashboard.manager.checkInsToday")} loading={loading}>{data?.kpis.checkInsToday ?? 0}</Metric><Metric label={t("dashboard.manager.pendingApprovals")} loading={loading} warning={Boolean(approvals.data?.length)}>{approvals.data?.length ?? 0}</Metric><Metric label={t("dashboard.manager.shiftVariances")} loading={loading} warning={varianceShifts.length > 0}>{varianceShifts.length}</Metric><Metric label={t("dashboard.manager.overdueFollowUps")} loading={loading} warning={overdueTasks.length > 0}>{overdueTasks.length}</Metric><Metric label={t("dashboard.manager.renewalsQueue")} loading={loading} warning={expiring > 0}>{expiring}</Metric></section>
    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]"><section className="panel overflow-hidden"><header className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="text-[13px] font-semibold">{t("dashboard.manager.operationalAttention")}</h2><Button asChild variant="ghost" size="sm"><Link href="/audit">{t("dashboard.manager.auditTrail")} <ArrowRight /></Link></Button></header><div className="divide-y divide-line">{data?.alerts.slice(0, 5).map((alert) => <Link key={alert.id} href={alert.href} className="flex items-start gap-3 px-4 py-3 hover:bg-sunken"><AlertTriangle className={alert.severity === "critical" ? "mt-0.5 size-4 text-danger" : "mt-0.5 size-4 text-warning"} /><span className="min-w-0"><span className="block text-[12.5px] font-medium">{alert.title}</span><span className="mt-0.5 block text-[10.5px] text-ink-3">{alert.detail}</span></span></Link>)}{(data?.alerts.length ?? 0) === 0 ? <div className="px-5 py-12 text-center"><CheckCircle2 className="mx-auto size-5 text-success" /><p className="mt-3 text-[12px] font-medium">{t("dashboard.manager.noAlerts")}</p><p className="mt-1 text-[10.5px] text-ink-3">{t("dashboard.manager.noAlertsDetail")}</p></div> : null}</div></section><section className="panel overflow-hidden"><header className="border-b border-line px-4 py-3"><h2 className="text-[13px] font-semibold">{t("dashboard.manager.queues")}</h2></header><div className="grid divide-y divide-line"><Queue href="/audit" icon={<CheckCircle2 />} label={t("dashboard.manager.approvalsAwaiting")} value={approvals.data?.length ?? 0} /><Queue href="/payments/shifts" icon={<AlertTriangle />} label={t("dashboard.manager.variancesAwaiting")} value={varianceShifts.length} /><Queue href="/crm/queues" icon={<Clock3 />} label={t("dashboard.manager.overdueCrmTasks")} value={overdueTasks.length} /><Queue href="/memberships" icon={<Users />} label={t("dashboard.manager.expiringMemberships")} value={expiring} /></div></section></div>
  </div>;
}

function Metric({ label, children, loading, warning }: { label: string; children: React.ReactNode; loading: boolean; warning?: boolean }) { return <div className="px-4 py-3.5"><p className="eyebrow">{label}</p>{loading ? <Skeleton className="mt-2 h-6 w-14" /> : <p className={warning ? "mt-1 text-[22px] font-medium text-warning" : "mt-1 text-[22px] font-medium"}>{children}</p>}</div>; }
function Queue({ href, icon, label, value }: { href: string; icon: React.ReactNode; label: string; value: number }) { return <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken"><span className="text-ink-3 [&_svg]:size-4">{icon}</span><span className="flex-1 text-[12px]">{label}</span><strong className={value ? "text-[13px] text-warning" : "text-[13px]"}>{value}</strong><ArrowRight className="size-3.5 text-ink-3" /></Link>; }
