"use client";

import { ArrowRight, Building2, CircleAlert, CreditCard, LifeBuoy, TrendingUp, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useExperience } from "@/lib/providers/experience-provider";
import { formatMoney, money } from "@/lib/utils/money";

const REVENUE_POINTS = [62, 68, 66, 75, 79, 87, 96, 103, 112, 121, 134, 151];

export default function PlatformOverviewPage() {
  const { marketplaceGyms, bookings, platformSnapshot } = useExperience();
  const active = marketplaceGyms.filter((gym) => gym.subscriptionStatus === "active");
  const members = marketplaceGyms.reduce((sum, gym) => sum + gym.memberCount, 0);
  const branches = marketplaceGyms.reduce((sum, gym) => sum + gym.branchCount, 0);
  const mrrMinor = active.reduce((sum, gym) => sum + (platformSnapshot?.plans.find((plan) => plan.name === gym.rivetPlan)?.priceMinor ?? gym.monthlyRevenueMinor), 0);
  const openCases = platformSnapshot?.supportCases.filter((item) => item.status !== "resolved") ?? [];
  const attentionCases = openCases.filter((item) => item.priority === "urgent").length;
  return <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
    <div className="mx-auto max-w-[1480px]">
      <PageHeading eyebrow="Friday, 31 July" title="Platform overview" description="A live view of every gym, subscription, and operational risk across the RIVET network." action={<Button asChild variant="signal"><Link href="/platform/gyms">Manage gyms <ArrowRight /></Link></Button>} />

      <section className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Building2 />} label="Active gyms" value={String(active.length)} detail="+1 this month" trend="up" />
        <Kpi icon={<CreditCard />} label="Monthly recurring revenue" value={formatMoney(money(mrrMinor), { hideCurrency: true })} detail={`${active.length} active subscription${active.length === 1 ? "" : "s"}`} trend="up" />
        <Kpi icon={<Users />} label="Members under management" value={members.toLocaleString()} detail={`Across ${branches} branch${branches === 1 ? "" : "es"}`} trend="neutral" />
        <Kpi icon={<LifeBuoy />} label="Open support cases" value={String(openCases.length)} detail={`${attentionCases} needs attention`} trend={openCases.length > 0 ? "warning" : "neutral"} />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_0.8fr]">
        <section className="border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Recurring revenue</p><h2 className="mt-2 text-[20px] font-semibold">MRR movement</h2></div><div className="text-end"><p className="text-[23px] font-semibold">JD 647.000</p><p className="mt-1 text-[10px] text-success">↑ JD 80 this quarter</p></div></div>
          <div className="relative mt-8 h-[235px] border-b border-s border-line bg-[linear-gradient(to_right,var(--color-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-line)_1px,transparent_1px)] bg-[size:25%_25%]">
            <svg viewBox="0 0 1100 250" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-label="Monthly recurring revenue has increased over the last twelve months"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d9232b" stopOpacity=".22"/><stop offset="1" stopColor="#d9232b" stopOpacity="0"/></linearGradient></defs><path d={`${chartPath(REVENUE_POINTS)} L 1100 250 L 0 250 Z`} fill="url(#area)"/><path d={chartPath(REVENUE_POINTS)} fill="none" stroke="#d9232b" strokeWidth="4" vectorEffect="non-scaling-stroke"/></svg>
          </div>
          <div className="mt-3 flex justify-between font-mono text-[8px] uppercase tracking-[0.1em] text-ink-3"><span>Aug 25</span><span>Nov</span><span>Feb 26</span><span>May</span><span>Jul</span></div>
        </section>

        <section className="night-surface bg-night p-5 text-night-ink sm:p-6">
          <p className="eyebrow-night">Needs attention</p><h2 className="mt-2 text-[20px] font-semibold">Today’s operator queue</h2>
          <div className="mt-6 grid gap-1">
            <Attention severity="danger" title="Pulse Lab payment retry" detail="Invoice RV-1048 · JD 149.000" href="/platform/billing" />
            <Attention severity="warning" title="District trial ends in 5 days" detail="Onboarding is 63% complete" href="/platform/gyms/district-strength" />
            <Attention severity="warning" title="2 support replies overdue" detail="Oldest response age · 3h 18m" href="/platform/support" />
            <Attention severity="success" title="Her House health improved" detail="88 → 94 in the last 7 days" href="/platform/gyms/her-house" />
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.9fr]">
        <section className="overflow-hidden border border-line bg-surface">
          <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><p className="eyebrow">Tenant health</p><h2 className="mt-1 text-[17px] font-semibold">Subscribed gyms</h2></div><Button asChild variant="ghost" size="sm"><Link href="/platform/gyms">View all <ArrowRight /></Link></Button></div>
          <div className="divide-y divide-line">{marketplaceGyms.map((gym) => <Link key={gym.id} href={`/platform/gyms/${gym.id}`} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 transition-colors hover:bg-sunken sm:grid-cols-[1fr_120px_120px_auto]"><div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center font-mono text-[9px] font-semibold text-white" style={{backgroundColor:gym.accent}}>{gym.shortName.slice(0,2)}</span><div className="min-w-0"><p className="truncate text-[13px] font-semibold">{gym.name}</p><p className="mt-0.5 text-[10.5px] text-ink-3">{gym.branchCount} branch{gym.branchCount > 1 ? "es" : ""} · {gym.rivetPlan}</p></div></div><div className="hidden sm:block"><p className="font-mono text-[8px] uppercase tracking-[0.1em] text-ink-3">Health</p><p className="mt-1 text-[12px] font-medium">{healthFor(gym.id)} / 100</p></div><div className="hidden sm:block"><p className="font-mono text-[8px] uppercase tracking-[0.1em] text-ink-3">Members</p><p className="mt-1 text-[12px] font-medium">{gym.memberCount.toLocaleString()}</p></div><Status status={gym.subscriptionStatus} /></Link>)}</div>
        </section>
        <section className="border border-line bg-surface p-5 sm:p-6"><p className="eyebrow">Member acquisition</p><h2 className="mt-2 text-[18px] font-semibold">Network demand</h2><div className="mt-7 grid grid-cols-2 gap-px border border-line bg-line"><MiniMetric label="Trial requests" value={String(bookings.length)} /><MiniMetric label="Trial → member" value="41%" /><MiniMetric label="Marketplace views" value="3,820" /><MiniMetric label="Avg. response" value="24m" /></div><div className="mt-6 border-t border-line pt-5"><div className="flex items-center justify-between text-[11px]"><span className="text-ink-3">Top discovery gym</span><strong>Her House</strong></div><div className="mt-4 flex items-center justify-between text-[11px]"><span className="text-ink-3">Best conversion</span><strong>Forge · 53%</strong></div></div></section>
      </div>
    </div>
  </div>;
}

function chartPath(points:number[]){const max=Math.max(...points);const min=Math.min(...points);return points.map((point,index)=>{const x=(index/(points.length-1))*1100;const y=220-((point-min)/(max-min))*185;return `${index===0?"M":"L"} ${x.toFixed(1)} ${y.toFixed(1)}`;}).join(" ");}
function healthFor(id:string){return ({"forge-fitness":96,"pulse-lab":82,"her-house":94,"district-strength":71} as Record<string,number>)[id] ?? 80;}
function PageHeading({eyebrow,title,description,action}:{eyebrow:string;title:string;description:string;action?:React.ReactNode}){return <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 text-[30px] font-semibold tracking-tight">{title}</h1><p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-ink-2">{description}</p></div>{action}</div>}
function Kpi({icon,label,value,detail,trend}:{icon:React.ReactNode;label:string;value:string;detail:string;trend:"up"|"neutral"|"warning"}){return <div className="border border-line bg-surface p-5"><div className="flex items-start justify-between"><span className="text-ink-3 [&_svg]:size-4">{icon}</span><span className={trend==="up"?"text-success":trend==="warning"?"text-warning":"text-ink-3"}>{trend==="up"?<TrendingUp className="size-4"/>:trend==="warning"?<CircleAlert className="size-4"/>:null}</span></div><p className="mt-7 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-3">{label}</p><p className="mt-2 text-[28px] font-semibold tracking-tight">{value}</p><p className={"mt-2 text-[10.5px] "+(trend==="up"?"text-success":trend==="warning"?"text-warning":"text-ink-3")}>{detail}</p></div>}
function Attention({severity,title,detail,href}:{severity:"danger"|"warning"|"success";title:string;detail:string;href:string}){return <Link href={href} className="group flex items-start gap-3 border-t border-night-line px-1 py-4 first:border-t-0"><span className={"mt-1 size-2 shrink-0 rounded-full "+(severity==="danger"?"bg-danger":severity==="warning"?"bg-warning":"bg-success")}/><span className="min-w-0 flex-1"><strong className="block text-[12px] font-medium">{title}</strong><span className="mt-1 block text-[10.5px] text-night-ink-3">{detail}</span></span><ArrowRight className="mt-1 size-3.5 text-night-ink-3 transition-transform group-hover:translate-x-1"/></Link>}
function Status({status}:{status:string}){const active=status==="active";const trial=status==="trial";return <span className={"rounded-full px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.1em] "+(active?"bg-success-bg text-success":trial?"bg-info-bg text-info":"bg-warning-bg text-warning")}>{status}</span>}
function MiniMetric({label,value}:{label:string;value:string}){return <div className="bg-surface p-4"><p className="font-mono text-[8px] uppercase tracking-[0.1em] text-ink-3">{label}</p><p className="mt-2 text-[20px] font-semibold">{value}</p></div>}
