"use client";

import { Check, ChevronLeft, ChevronRight, CircleCheck, Dumbbell, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PublicHeader } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SAAS_PLANS } from "@/lib/public/experience-data";
import { cn } from "@/lib/utils/cn";

const STEPS = ["Account", "Your gym", "Plan", "Ready"];

export default function GymSignupPage() {
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<(typeof SAAS_PLANS)[number]["name"]>("Growth");

  return <div className="min-h-screen bg-paper"><PublicHeader />
    <main className="marketing-grid px-5 py-10 sm:px-8 lg:px-12 lg:py-16">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-5"><div><p className="eyebrow">14-day trial · No card required</p><h1 className="mt-2 text-[28px] font-semibold tracking-tight">Bring your gym onto RIVET.</h1></div><span className="hidden font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3 sm:block">Takes about 3 minutes</span></div>
        <ol className="grid grid-cols-4 border border-line bg-surface">
          {STEPS.map((label, index) => <li key={label} className={cn("relative border-e border-line p-3 last:border-e-0 sm:p-4", index === step && "bg-ink text-paper")}><span className={cn("font-mono text-[8px] uppercase tracking-[0.14em]", index === step ? "text-paper/60" : "text-ink-3")}>0{index + 1}</span><p className="mt-1 text-[11px] font-semibold sm:text-[13px]">{index < step ? <Check className="me-1 inline size-3.5 text-success" /> : null}{label}</p></li>)}
        </ol>

        <section className="mt-5 min-h-[500px] border border-ink bg-surface p-6 shadow-pop sm:p-9 lg:p-12">
          {step === 0 ? <StepAccount /> : null}
          {step === 1 ? <StepGym /> : null}
          {step === 2 ? <StepPlan plan={plan} onPlan={setPlan} /> : null}
          {step === 3 ? <StepReady plan={plan} /> : null}
          {step < 3 ? <div className="mt-10 flex justify-between border-t border-line pt-6"><Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ChevronLeft /> Back</Button><Button variant="signal" onClick={() => setStep((value) => Math.min(3, value + 1))}>Continue <ChevronRight /></Button></div> : null}
        </section>
      </div>
    </main>
  </div>;
}

function StepAccount() { return <div className="mx-auto max-w-xl"><p className="eyebrow">First, you</p><h2 className="mt-3 text-[31px] font-semibold tracking-tight">Create the owner account.</h2><p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">This account controls billing, branches, and permissions for your organization.</p><div className="mt-8 grid gap-4 sm:grid-cols-2"><Field label="First name"><Input defaultValue="Omar" /></Field><Field label="Last name"><Input defaultValue="Khalil" /></Field><Field label="Work email"><Input type="email" defaultValue="omar@northstar.jo" /></Field><Field label="Mobile number"><Input defaultValue="+962 79 555 0194" /></Field><div className="sm:col-span-2"><Field label="Password"><Input type="password" defaultValue="strong-password" /></Field></div></div></div>; }
function StepGym() { return <div className="mx-auto max-w-xl"><p className="eyebrow">Your organization</p><h2 className="mt-3 text-[31px] font-semibold tracking-tight">Tell us how your gym operates.</h2><p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">We use this to seed your workspace and onboarding checklist.</p><div className="mt-8 grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Gym name"><Input defaultValue="Northstar Fitness" /></Field></div><Field label="City"><Input defaultValue="Amman" /></Field><Field label="Number of branches"><select className="h-9 w-full rounded-md border border-line-2 bg-surface px-3 text-[13px]"><option>1 branch</option><option>2–3 branches</option><option>4+ branches</option></select></Field><Field label="Current active members"><Input defaultValue="650" /></Field><Field label="Primary currency"><select className="h-9 w-full rounded-md border border-line-2 bg-surface px-3 text-[13px]"><option>JOD — Jordanian dinar</option></select></Field></div></div>; }
function StepPlan({ plan, onPlan }: { plan: string; onPlan: (plan: (typeof SAAS_PLANS)[number]["name"]) => void }) { return <div><p className="eyebrow">Choose your starting point</p><h2 className="mt-3 text-[31px] font-semibold tracking-tight">One plan for your whole operation.</h2><div className="mt-8 grid gap-4 md:grid-cols-3">{SAAS_PLANS.map((item) => <button key={item.name} type="button" onClick={() => onPlan(item.name)} className={cn("relative p-5 text-start border transition-all", plan === item.name ? "border-signal bg-signal/[0.035] shadow-pop" : "border-line hover:border-ink")}><div className="flex items-center justify-between"><p className="eyebrow">{item.name}</p><span className={cn("flex size-5 items-center justify-center rounded-full border", plan === item.name ? "border-signal bg-signal text-white" : "border-line-3")}>{plan === item.name ? <Check className="size-3" /> : null}</span></div><p className="mt-6 text-[28px] font-semibold">JD {item.priceMinor / 1000}<span className="text-[11px] font-normal text-ink-3"> / month</span></p><ul className="mt-6 grid gap-2 text-[11.5px] text-ink-2"><li>{item.branches} branch{item.branches > 1 ? "es" : ""}</li><li>Up to {item.members.toLocaleString()} members</li><li>{item.staff} staff accounts</li></ul></button>)}</div><p className="mt-5 text-[11px] text-ink-3">You can change plans before the trial ends. Prices exclude applicable taxes.</p></div>; }
function StepReady({ plan }: { plan: string }) { return <div className="mx-auto max-w-xl py-4 text-center"><span className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-bg text-success"><CircleCheck className="size-7" /></span><p className="mt-7 eyebrow">Workspace reserved</p><h2 className="mt-3 text-[35px] font-semibold tracking-tight">Northstar Fitness is ready.</h2><p className="mx-auto mt-4 max-w-md text-[13.5px] leading-relaxed text-ink-2">Your {plan} trial includes the complete operations loop. Start by importing members, inviting staff, and opening your first shift.</p><div className="mt-8 grid grid-cols-3 gap-px border border-line bg-line text-start"><ReadyItem icon={<Dumbbell />} label="1 branch" /><ReadyItem icon={<Sparkles />} label="Sample data" /><ReadyItem icon={<Check />} label="14 days" /></div><Button asChild variant="signal" size="lg" className="mt-8"><Link href="/login/gym/create">Create your account <ChevronRight /></Link></Button></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11.5px] font-medium">{label}</span>{children}</label>; }
function ReadyItem({ icon, label }: { icon: React.ReactNode; label: string }) { return <div className="bg-surface p-4 text-center text-[11px] font-medium"><span className="mx-auto mb-2 block w-fit text-signal [&_svg]:size-4">{icon}</span>{label}</div>; }
