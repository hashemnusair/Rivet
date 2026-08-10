"use client";

import { ArrowRight, BadgeDollarSign, Check, CircleAlert, Clock3, Pencil } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApiMutation } from "@/lib/hooks/use-api";
import type { PlatformSaasPlan } from "@/lib/api/GymOSApi";
import { useExperience, usePlatformGyms } from "@/lib/providers/experience-provider";
import { formatMoney } from "@/lib/utils/money";

export default function SubscriptionsPage() {
  const gyms = usePlatformGyms();
  const { platformSnapshot } = useExperience();
  const customerGyms = platformSnapshot?.gyms ?? gyms;
  const [plans, setPlans] = useState<PlatformSaasPlan[]>(platformSnapshot?.plans ?? []);
  const [editing, setEditing] = useState<PlatformSaasPlan | null>(null);
  useEffect(() => setPlans(platformSnapshot?.plans ?? []), [platformSnapshot?.plans]);

  const updatePlan = useApiMutation((api, input: { name: PlatformSaasPlan["name"]; priceMinor: number; branches: number; staff: number; members: number }) => api.updatePlatformPlan(input), {
    onSuccess: (updated) => {
      setPlans((current) => current.map((plan) => plan.name === updated.name ? updated : plan));
      setEditing(null);
      toast.success(`${updated.name} plan updated and audited.`);
    },
  });

  return <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><div className="mx-auto max-w-[1480px]">
    <div><p className="eyebrow">Commercial operations</p><h1 className="mt-2 text-[30px] font-semibold tracking-tight">Subscriptions</h1><p className="mt-2 max-w-2xl text-[12.5px] text-ink-2">Plans, trials, renewals, and expansion opportunities across every RIVET tenant.</p></div>
    <section className="mt-7 grid gap-3 sm:grid-cols-3"><Kpi label="Active MRR" value={platformSnapshot?.overview ? formatMoney(platformSnapshot.overview.activeMrr) : "—"} detail={`${platformSnapshot?.overview?.gymCounts.active ?? 0} active customer accounts`} icon={<BadgeDollarSign/>}/><Kpi label="Trial pipeline" value={`JD ${(customerGyms.filter((gym) => gym.subscriptionStatus === "trial").reduce((total, gym) => total + (plans.find((plan) => plan.name === gym.rivetPlan)?.priceMinor ?? 0), 0) / 1000).toFixed(3)}`} detail={`${customerGyms.filter((gym) => gym.subscriptionStatus === "trial").length} trial account${customerGyms.filter((gym) => gym.subscriptionStatus === "trial").length === 1 ? "" : "s"}`} icon={<Clock3/>}/><Kpi label="Past due" value={String(platformSnapshot?.overview?.gymCounts.past_due ?? 0)} detail="Accounts requiring billing follow-up" icon={<CircleAlert/>}/></section>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.8fr]">
      <section className="overflow-x-auto border border-line bg-surface"><div className="border-b border-line px-5 py-4"><p className="eyebrow">Customer plans</p><h2 className="mt-1 text-[17px] font-semibold">Current subscriptions</h2></div><table className="w-full min-w-[720px] text-start"><thead><tr className="border-b border-line bg-sunken text-start font-mono text-[8px] uppercase tracking-[.1em] text-ink-3"><th className="px-5 py-3 font-medium">Gym</th><th className="px-4 py-3 font-medium">Plan</th><th className="px-4 py-3 font-medium">Persisted directory</th><th className="px-4 py-3 font-medium">External billing</th><th className="px-4 py-3 font-medium">Status</th><th/></tr></thead><tbody>{customerGyms.map((gym)=> <tr key={gym.id} className="border-b border-line last:border-b-0"><td className="px-5 py-4"><p className="text-[12.5px] font-semibold">{gym.name}</p><p className="mt-1 text-[9.5px] text-ink-3">{gym.branchCount} branch{gym.branchCount>1?"es":""}</p></td><td className="px-4 py-4 text-[11.5px]">{gym.rivetPlan}</td><td className="px-4 py-4 text-[9px] text-ink-3">{gym.memberCount.toLocaleString()} members · {gym.branchCount} branches</td><td className="px-4 py-4 text-[11px] text-ink-3">Not configured</td><td className="px-4 py-4"><span className={gym.subscriptionStatus==="active"?"rounded-full bg-success-bg px-2 py-1 font-mono text-[7.5px] uppercase text-success":gym.subscriptionStatus==="suspended"?"rounded-full bg-danger-bg px-2 py-1 font-mono text-[7.5px] uppercase text-danger":"rounded-full bg-info-bg px-2 py-1 font-mono text-[7.5px] uppercase text-info"}>{gym.subscriptionStatus}</span></td><td className="px-4 py-4"><Button asChild variant="ghost" size="icon-sm"><Link href={`/platform/gyms/${gym.id}`} aria-label={`Open ${gym.name}`}><ArrowRight/></Link></Button></td></tr>)}</tbody></table></section>
      <section className="border border-line bg-surface p-5"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Plan catalog</p><h2 className="mt-1 text-[17px] font-semibold">Published pricing</h2></div><span className="font-mono text-[8px] uppercase tracking-[.1em] text-ink-3">Audited</span></div><div className="mt-5 grid gap-3">{plans.map((plan)=><div key={plan.name} className="border border-line p-4"><div className="flex items-center justify-between gap-3"><strong className="text-[13px]">{plan.name}</strong><div className="flex items-center gap-2"><span className="text-[13px] font-semibold">JD {(plan.priceMinor/1000).toFixed(3)}<small className="font-normal text-ink-3"> / mo</small></span><Button variant="ghost" size="icon-sm" aria-label={`Edit ${plan.name}`} onClick={() => setEditing(plan)}><Pencil/></Button></div></div><ul className="mt-3 grid gap-1.5 text-[9.5px] text-ink-3"><li className="flex items-center gap-1.5"><Check className="size-3 text-success"/>{plan.branches} branches</li><li className="flex items-center gap-1.5"><Check className="size-3 text-success"/>Up to {plan.members.toLocaleString()} members</li><li className="flex items-center gap-1.5"><Check className="size-3 text-success"/>{plan.staff} staff seats</li></ul></div>)}</div></section>
    </div>
    {editing ? <PlanDialog plan={editing} open onOpenChange={(open) => !open && setEditing(null)} saving={updatePlan.isPending} onSave={(input) => updatePlan.mutate(input)} /> : null}
  </div></div>;
}

function PlanDialog({ plan, open, onOpenChange, saving, onSave }: { plan: PlatformSaasPlan; open: boolean; onOpenChange: (open: boolean) => void; saving: boolean; onSave: (input: { name: PlatformSaasPlan["name"]; priceMinor: number; branches: number; staff: number; members: number }) => void }) {
  const [price, setPrice] = useState(String(plan.priceMinor / 1000));
  const [branches, setBranches] = useState(String(plan.branches));
  const [staff, setStaff] = useState(String(plan.staff));
  const [members, setMembers] = useState(String(plan.members));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Edit {plan.name} plan</DialogTitle><DialogDescription>These limits appear in the public catalog and are recorded in the platform audit stream.</DialogDescription></DialogHeader><DialogBody className="grid gap-4 sm:grid-cols-2"><Field label="Monthly price (JOD)"><Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" /></Field><Field label="Branches"><Input value={branches} onChange={(event) => setBranches(event.target.value)} inputMode="numeric" /></Field><Field label="Staff seats"><Input value={staff} onChange={(event) => setStaff(event.target.value)} inputMode="numeric" /></Field><Field label="Member capacity"><Input value={members} onChange={(event) => setMembers(event.target.value)} inputMode="numeric" /></Field></DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={saving} onClick={() => onSave({ name: plan.name, priceMinor: Math.round(Number(price) * 1000), branches: Number(branches), staff: Number(staff), members: Number(members) })}>Save plan</Button></DialogFooter></DialogContent></Dialog>;
}

function Kpi({label,value,detail,icon}:{label:string;value:string;detail:string;icon:React.ReactNode}){return <div className="border border-line bg-surface p-5"><span className="text-ink-3 [&_svg]:size-4">{icon}</span><p className="mt-6 font-mono text-[8px] uppercase tracking-[.11em] text-ink-3">{label}</p><p className="mt-2 text-[25px] font-semibold">{value}</p><p className="mt-1 text-[10px] text-ink-3">{detail}</p></div>}
