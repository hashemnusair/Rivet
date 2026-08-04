"use client";

import { ArrowRight, Building2, MapPin, Plus, Search, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMarketplaceGyms } from "@/lib/providers/experience-provider";

export default function PlatformGymsPage(){
  const [query,setQuery]=useState(""); const [filter,setFilter]=useState("all");
  const directory=useMarketplaceGyms();
  const gyms=useMemo(()=>directory.filter((gym)=>`${gym.name} ${gym.areas.join(" ")} ${gym.rivetPlan}`.toLowerCase().includes(query.toLowerCase())&&(filter==="all"||gym.subscriptionStatus===filter)),[directory,filter,query]);
  return <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-[1480px]">
    <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">Tenant directory</p><h1 className="mt-2 text-[30px] font-semibold tracking-tight">Subscribed gyms</h1><p className="mt-2 text-[12.5px] text-ink-2">Manage every gym organization, its branches, plan, and platform health.</p></div><Button variant="signal"><Plus/>Add gym</Button></div>
    <div className="mt-7 grid gap-3 border border-line bg-surface p-3 md:grid-cols-[1fr_auto]"><label className="relative"><Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3"/><Input value={query} onChange={(e)=>setQuery(e.target.value)} className="ps-9" placeholder="Search gyms, areas, or plans"/></label><div className="flex gap-2">{["all","active","trial"].map((item)=><Button key={item} variant={filter===item?"primary":"secondary"} size="sm" onClick={()=>setFilter(item)} className="capitalize">{item}</Button>)}</div></div>
    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{gyms.map((gym)=><article key={gym.id} className="group border border-line bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-ink hover:shadow-pop"><div className="flex items-start justify-between gap-4"><span className="flex size-12 items-center justify-center font-mono text-[10px] font-semibold text-white" style={{backgroundColor:gym.accent}}>{gym.shortName.slice(0,3)}</span><span className={gym.subscriptionStatus==="active"?"rounded-full bg-success-bg px-2.5 py-1 font-mono text-[8px] uppercase tracking-[.1em] text-success":"rounded-full bg-info-bg px-2.5 py-1 font-mono text-[8px] uppercase tracking-[.1em] text-info"}>{gym.subscriptionStatus}</span></div><h2 className="mt-5 text-[19px] font-semibold">{gym.name}</h2><p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-3"><MapPin className="size-3"/>{gym.areas.join(" · ")}</p><div className="mt-6 grid grid-cols-3 gap-px border-y border-line bg-line py-px"><Metric icon={<Building2/>} value={String(gym.branchCount)} label="branches"/><Metric icon={<Users/>} value={gym.memberCount.toLocaleString()} label="members"/><Metric value={gym.rivetPlan} label="plan"/></div><div className="mt-5 flex items-center justify-between"><div><p className="font-mono text-[8px] uppercase tracking-[.1em] text-ink-3">Gym revenue</p><p className="mt-1 text-[13px] font-semibold">JD {(gym.monthlyRevenueMinor/1000).toLocaleString()}</p></div><Button asChild variant="secondary" size="sm"><Link href={`/platform/gyms/${gym.id}`}>Open <ArrowRight/></Link></Button></div></article>)}</div>
    {gyms.length===0?<div className="mt-5 border border-dashed border-line-3 p-14 text-center"><Building2 className="mx-auto size-6 text-ink-3"/><h2 className="mt-3 text-[17px] font-semibold">No gyms found</h2><p className="mt-1 text-[12px] text-ink-3">Try another search or status.</p></div>:null}
  </div></div>;
}
function Metric({icon,value,label}:{icon?:React.ReactNode;value:string;label:string}){return <div className="bg-surface px-3 py-3"><div className="flex items-center gap-1.5 text-[11.5px] font-semibold"><span className="text-ink-3 [&_svg]:size-3">{icon}</span>{value}</div><p className="mt-1 font-mono text-[7.5px] uppercase tracking-[.1em] text-ink-3">{label}</p></div>}
