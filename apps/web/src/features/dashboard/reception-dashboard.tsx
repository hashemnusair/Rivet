"use client";

import { ArrowRight, Banknote, Search, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/shared/chrome";
import { MoneyText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useRealtimeApiQuery } from "@/lib/hooks/use-realtime-api";
import { useApp } from "@/lib/providers/app-providers";
import { money } from "@/lib/utils/money";

export function ReceptionDashboard() {
  const { session } = useApp();
  const branchId = session?.activeBranchId ?? session?.branches[0]?.id;
  const shift = useRealtimeApiQuery({ queryKey: ["current-shift-totals", branchId], query: (api) => api.getCurrentShiftTotals(branchId!), subscribe: (api, onValue, onError) => api.subscribeCurrentShiftTotals(branchId!, onValue, onError), enabled: Boolean(branchId) });
  const occupancy = useRealtimeApiQuery({ queryKey: ["occupancy", branchId], query: (api) => api.getOccupancy(branchId!), subscribe: (api, onValue, onError) => api.subscribeOccupancy(branchId!, onValue, onError), enabled: Boolean(branchId) });
  const checkInsInput = { branchId, pageSize: 8 };
  const checkIns = useRealtimeApiQuery({ queryKey: ["checkins", "dashboard", branchId], query: (api) => api.listRecentCheckIns(checkInsInput), subscribe: (api, onValue, onError) => api.subscribeRecentCheckIns(checkInsInput, onValue, onError), enabled: Boolean(branchId) });
  const outstanding = useApiQuery(qk.members({ dashboard: "outstanding", branchId }), (api) => api.listMembers({ branchId, membershipStatus: "outstanding", pageSize: 50 }), { enabled: Boolean(branchId) });
  const trialLeads = useApiQuery(qk.leads({ dashboard: "trials", branchId }), (api) => api.listLeads({ branchId, stage: ["trial_booked"], pageSize: 50 }), { enabled: Boolean(branchId) });
  const loading = shift.isLoading || occupancy.isLoading || checkIns.isLoading || outstanding.isLoading || trialLeads.isLoading;
  const branchName = session?.branches.find((branch) => branch.id === branchId)?.name ?? "Your branch";

  const expectedCash = shift.data ? money(shift.data.shift.openingFloat.amount + shift.data.totals.cashPayments.amount - shift.data.totals.cashRefunds.amount, shift.data.shift.openingFloat.currency) : money(0);
  return <div className="space-y-5"><PageHeader eyebrow={branchName} title={`Front desk, ${session?.user.name.split(" ")[0] ?? "team"}`} description="Live entry, drawer, arrivals, and balance facts for this branch." actions={<Button asChild><Link href="/reception"><ShieldCheck /> Open reception console</Link></Button>} />
    <section className="panel grid grid-cols-2 divide-line sm:grid-cols-5 sm:divide-x"><Metric label="Current occupancy" loading={loading}>{occupancy.data?.current ?? 0}</Metric><Metric label="Check-ins today" loading={loading}>{occupancy.data?.checkInsToday ?? 0}</Metric><Metric label="Open shift" loading={loading}>{shift.data ? "Open" : "None"}</Metric><Metric label="Expected cash" loading={loading}><MoneyText money={expectedCash} /></Metric><Metric label="Outstanding members" loading={loading} warning={Boolean(outstanding.data?.totalItems)}>{outstanding.data?.totalItems ?? 0}</Metric></section>
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><section className="panel overflow-hidden"><header className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="text-[13px] font-semibold">Recent check-ins</h2><Button asChild variant="ghost" size="sm"><Link href="/reception">Entry console <ArrowRight /></Link></Button></header>{(checkIns.data?.items.length ?? 0) === 0 ? <p className="px-5 py-12 text-center text-[12px] text-ink-3">No check-ins recorded for this branch.</p> : <div className="divide-y divide-line">{checkIns.data?.items.map((checkIn) => <div key={checkIn.id} className="flex items-center gap-3 px-4 py-3"><span className={checkIn.decision === "allowed" ? "size-2 rounded-full bg-success" : "size-2 rounded-full bg-danger"} /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-medium">{checkIn.memberName}</span><span className="block text-[9.5px] capitalize text-ink-3">{checkIn.decision.replaceAll("_", " ")}</span></span><time className="font-mono text-[9px] text-ink-3">{new Intl.DateTimeFormat("en-JO", { hour: "numeric", minute: "2-digit" }).format(Date.parse(checkIn.occurredAt))}</time></div>)}</div>}</section><section className="panel overflow-hidden"><header className="border-b border-line px-4 py-3"><h2 className="text-[13px] font-semibold">Front-desk actions</h2></header><div className="grid divide-y divide-line"><Action href="/reception" icon={<Search />} label="Search member or scan QR" detail="Check entry verdict and check in" /><Action href="/payments" icon={<Banknote />} label="Collect or review payment" detail={`${outstanding.data?.totalItems ?? 0} members with outstanding balances`} /><Action href="/crm/queues" icon={<Users />} label="Trial follow-up queue" detail={`${trialLeads.data?.totalItems ?? 0} active trial leads`} /><Action href="/payments/shifts" icon={<Banknote />} label={shift.data ? "Review current cash shift" : "Open a cash shift"} detail={shift.data ? `Opened by ${shift.data.shift.openedByName}` : "Required before recording cash"} /></div></section></div>
  </div>;
}

function Metric({ label, children, loading, warning }: { label: string; children: React.ReactNode; loading: boolean; warning?: boolean }) { return <div className="px-4 py-3.5"><p className="eyebrow">{label}</p>{loading ? <Skeleton className="mt-2 h-6 w-14" /> : <p className={warning ? "mt-1 text-[21px] font-medium text-warning" : "mt-1 text-[21px] font-medium"}>{children}</p>}</div>; }
function Action({ href, icon, label, detail }: { href: string; icon: React.ReactNode; label: string; detail: string }) { return <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-sunken"><span className="text-ink-3 [&_svg]:size-4">{icon}</span><span className="min-w-0 flex-1"><span className="block text-[12px] font-medium">{label}</span><span className="block truncate text-[9.5px] text-ink-3">{detail}</span></span><ArrowRight className="size-3.5 text-ink-3" /></Link>; }
