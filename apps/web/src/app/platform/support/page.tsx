"use client";

import { Check, CircleAlert, Clock3, MessageSquareText, Search, Send, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { getApi } from "@/lib/api/client";
import { useExperience } from "@/lib/providers/experience-provider";
import type { PlatformSupportCase } from "@/lib/api/GymOSApi";
import { cn } from "@/lib/utils/cn";
export default function SupportPage(){
  const { platformSnapshot }=useExperience();
  const cases=useMemo(()=>platformSnapshot?.supportCases ?? [],[platformSnapshot?.supportCases]);
  const [selectedId,setSelectedId]=useState<string>();
  const [resolved,setResolved]=useState<string[]>([]);
  const [sent,setSent]=useState(false);
  const [search,setSearch]=useState("");
  const [replyBody,setReplyBody]=useState("");
  const selected=cases.find((item)=>item.id===selectedId)??cases[0];
  const visibleCases=useMemo(()=>cases.filter((item)=>`${item.id} ${item.gym} ${item.subject} ${item.status}`.toLowerCase().includes(search.trim().toLowerCase())),[cases,search]);
  useEffect(()=>{if(selected)setReplyBody(`We checked the ${selected.gym} account and will follow up shortly.`)},[selected]);
  if(!selected)return <div className="px-4 py-24 text-center text-[13px] text-ink-3">No support cases.</div>;
  return <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-[1480px]">
  <div><p className="eyebrow">Customer success</p><h1 className="mt-2 text-[30px] font-semibold tracking-tight">Support inbox</h1><p className="mt-2 text-[12.5px] text-ink-2">Resolve tenant issues before they become operating risk.</p></div>
  <section className="mt-7 grid min-h-[640px] overflow-hidden border border-line bg-surface lg:grid-cols-[350px_1fr]">
    <aside className="border-b border-line lg:border-b-0 lg:border-e"><div className="border-b border-line p-4"><label className="relative"><Search className="absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3"/><Input className="ps-9" placeholder="Search cases" value={search} onChange={(event)=>setSearch(event.target.value)}/></label></div><div className="divide-y divide-line">{visibleCases.map((item: PlatformSupportCase)=><button key={item.id} type="button" onClick={()=>{setSelectedId(item.id);setSent(false)}} className={cn("w-full p-4 text-start transition-colors hover:bg-sunken",selected.id===item.id&&"bg-sunken shadow-[inset_3px_0_0_#d9232b]")}><div className="flex items-center justify-between"><span className="font-mono text-[8px] uppercase tracking-[.1em] text-ink-3">{item.id} · {item.gym}</span><span className="text-[9px] text-ink-3">{item.age}</span></div><p className="mt-2 text-[12.5px] font-semibold">{item.subject}</p><div className="mt-2 flex items-center gap-2"><span className={item.priority==="urgent"?"size-1.5 rounded-full bg-danger":"size-1.5 rounded-full bg-info"}/><span className="text-[9.5px] capitalize text-ink-3">{resolved.includes(item.id)||item.status==="resolved"?"resolved":item.status}</span></div></button>)}</div></aside>
    <article className="flex min-w-0 flex-col"><header className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5"><div><div className="flex items-center gap-2"><span className={selected.priority==="urgent"?"rounded-full bg-danger-bg px-2 py-1 font-mono text-[7.5px] uppercase text-danger":"rounded-full bg-info-bg px-2 py-1 font-mono text-[7.5px] uppercase text-info"}>{selected.priority}</span><span className="font-mono text-[8px] text-ink-3">{selected.id}</span></div><h2 className="mt-3 text-[19px] font-semibold">{selected.subject}</h2><p className="mt-1 text-[10.5px] text-ink-3">{selected.gym} · Opened by Dana Al-Khatib</p></div><Button variant={resolved.includes(selected.id)||selected.status==="resolved"?"secondary":"primary"} size="sm" onClick={()=>{void getApi().resolvePlatformSupportCase(selected.id).then(()=>setResolved((current)=>current.includes(selected.id)?current:[...current,selected.id]));}}>{resolved.includes(selected.id)||selected.status==="resolved"?<><Check/>Resolved</>:"Mark resolved"}</Button></header>
    <div className="flex-1 space-y-5 p-5 sm:p-7"><Message sender="Dana · Pulse Lab" time="Today, 13:22" text="Our subscription card was declined even though the bank confirmed it is active. Staff can still sign in—can you retry it before tonight's shift?"/><Message sender="RIVET platform" time="Today, 13:24" text="Automated diagnostics found a soft decline on invoice RV-1048. The account is inside its grace period and no gym access has been restricted." system/>{sent?<Message sender="Elias · RIVET" time="Just now" text="We retried the invoice successfully and confirmed your service remains active. The receipt will arrive by email shortly."/>:null}</div>
    <div className="border-t border-line bg-sunken p-4 sm:p-5"><Textarea value={replyBody} onChange={(event)=>setReplyBody(event.target.value)}/><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-4 font-mono text-[8px] uppercase tracking-[.1em] text-ink-3"><span className="flex items-center gap-1.5"><Clock3 className="size-3"/>SLA 42m left</span><span className="flex items-center gap-1.5"><UserRound className="size-3"/>Assigned to you</span></div><Button variant="signal" onClick={()=>{void getApi().replyToPlatformSupportCase(selected.id,replyBody.trim()).then(()=>setSent(true));}} disabled={sent||!replyBody.trim()}><Send/>{sent?"Reply sent":"Send reply"}</Button></div></div>
    </article>
  </section>
</div></div>}
function Message({sender,time,text,system=false}:{sender:string;time:string;text:string;system?:boolean}){return <div className={cn("max-w-2xl",system&&"border border-warning/25 bg-warning-bg p-4")}><div className="flex items-center gap-2"><MessageSquareText className={cn("size-3.5",system?"text-warning":"text-ink-3")}/><p className="text-[11px] font-semibold">{sender}</p><span className="text-[9px] text-ink-3">{time}</span></div><p className="mt-2 text-[12px] leading-[1.7] text-ink-2">{text}</p>{system?<p className="mt-2 flex items-center gap-1.5 text-[9px] text-warning"><CircleAlert className="size-3"/>Internal platform event</p>:null}</div>}
