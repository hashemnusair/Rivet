"use client";

import { Check, ChevronLeft, ChevronRight, CircleCheck, Dumbbell, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PublicHeader } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import type { PlatformSaasPlan } from "@/lib/api/GymOSApi";
import { DEFAULT_GYM_ONBOARDING_DRAFT, GYM_ONBOARDING_DRAFT_KEY, type GymOnboardingDraft } from "@/lib/onboarding/gym-draft";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";

const STEPS = ["Owner", "Your gym", "Plan", "Ready"];

const DEFAULT_PLANS: PlatformSaasPlan[] = [
  { name: "Starter", priceMinor: 79_000, branches: 1, staff: 8, members: 500, tone: "paper" },
  { name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500, tone: "signal" },
  { name: "Pro", priceMinor: 249_000, branches: 8, staff: 80, members: 10_000, tone: "night" },
];

export default function GymSignupPage() {
  const router = useRouter();
  const { saasPlans } = useExperience();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<GymOnboardingDraft>(DEFAULT_GYM_ONBOARDING_DRAFT);
  const plans = saasPlans.length > 0 ? saasPlans : DEFAULT_PLANS;

  const update = <K extends keyof GymOnboardingDraft>(key: K, value: GymOnboardingDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const startOnboarding = () => {
    window.sessionStorage.setItem(GYM_ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
    if (DEMO_AUTH_BYPASS) {
      router.push("/onboarding/gym");
      return;
    }
    router.push("/login/gym/create?next=%2Fonboarding%2Fgym");
  };

  return (
    <div className="min-h-screen bg-paper">
      <PublicHeader />
      <main className="marketing-grid px-5 py-10 sm:px-8 lg:px-12 lg:py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex items-center justify-between gap-5">
            <div>
              <p className="eyebrow">14-day trial · No card required</p>
              <h1 className="mt-2 text-[28px] font-semibold tracking-tight">Bring your gym onto RIVET.</h1>
            </div>
            <span className="hidden font-mono text-[9px] uppercase tracking-[0.16em] text-ink-3 sm:block">Takes about 3 minutes</span>
          </div>

          <ol className="grid grid-cols-4 border border-line bg-surface">
            {STEPS.map((label, index) => (
              <li key={label} className={cn("relative border-e border-line p-3 last:border-e-0 sm:p-4", index === step && "bg-ink text-paper")}>
                <span className={cn("font-mono text-[8px] uppercase tracking-[0.14em]", index === step ? "text-paper/60" : "text-ink-3")}>0{index + 1}</span>
                <p className="mt-1 text-[11px] font-semibold sm:text-[13px]">
                  {index < step ? <Check className="me-1 inline size-3.5 text-success" /> : null}
                  {label}
                </p>
              </li>
            ))}
          </ol>

          <section className="mt-5 min-h-[500px] border border-ink bg-surface p-6 shadow-pop sm:p-9 lg:p-12">
            {step === 0 ? <StepAccount draft={draft} update={update} /> : null}
            {step === 1 ? <StepGym draft={draft} update={update} /> : null}
            {step === 2 ? <StepPlan plans={plans} plan={draft.plan} onPlan={(plan) => update("plan", plan)} /> : null}
            {step === 3 ? <StepReady draft={draft} plan={plans.find((item) => item.name === draft.plan) ?? DEFAULT_PLANS[1]!} onStart={startOnboarding} /> : null}

            {step < 3 ? (
              <div className="mt-10 flex justify-between border-t border-line pt-6">
                <Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
                  <ChevronLeft /> Back
                </Button>
                <Button variant="signal" onClick={() => setStep((value) => Math.min(3, value + 1))}>
                  Continue <ChevronRight />
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}

function StepAccount({ draft, update }: { draft: GymOnboardingDraft; update: <K extends keyof GymOnboardingDraft>(key: K, value: GymOnboardingDraft[K]) => void }) {
  return (
    <div className="mx-auto max-w-xl">
      <p className="eyebrow">First, you</p>
      <h2 className="mt-3 text-[31px] font-semibold tracking-tight">Tell us who will own the workspace.</h2>
      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">You’ll create the secure owner login with Clerk after this short setup.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Owner name">
            <Input value={draft.ownerFullName} onChange={(event) => update("ownerFullName", event.target.value)} placeholder="Omar Khalil" autoComplete="name" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Mobile number">
            <Input value={draft.ownerPhone} onChange={(event) => update("ownerPhone", event.target.value)} placeholder="+962 79 555 0194" autoComplete="tel" />
          </Field>
        </div>
      </div>
    </div>
  );
}

function StepGym({ draft, update }: { draft: GymOnboardingDraft; update: <K extends keyof GymOnboardingDraft>(key: K, value: GymOnboardingDraft[K]) => void }) {
  return (
    <div className="mx-auto max-w-xl">
      <p className="eyebrow">Your organization</p>
      <h2 className="mt-3 text-[31px] font-semibold tracking-tight">Tell us how your gym starts.</h2>
      <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">We’ll create your first branch and leave the rest ready to add from Settings.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Gym name">
            <Input value={draft.gymName} onChange={(event) => update("gymName", event.target.value)} placeholder="Northstar Fitness" />
          </Field>
        </div>
        <Field label="City">
          <Input value={draft.city} onChange={(event) => update("city", event.target.value)} placeholder="Amman" />
        </Field>
        <Field label="First branch">
          <Input value={draft.branchName} onChange={(event) => update("branchName", event.target.value)} placeholder="Abdoun" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Current active members (optional)">
            <Input type="number" min={0} value={draft.currentActiveMembers} onChange={(event) => update("currentActiveMembers", event.target.value)} placeholder="650" />
          </Field>
        </div>
      </div>
    </div>
  );
}

function StepPlan({ plans, plan, onPlan }: { plans: PlatformSaasPlan[]; plan: PlatformSaasPlan["name"]; onPlan: (plan: PlatformSaasPlan["name"]) => void }) {
  return (
    <div>
      <p className="eyebrow">Choose your starting point</p>
      <h2 className="mt-3 text-[31px] font-semibold tracking-tight">One plan for your whole operation.</h2>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {plans.map((item) => (
          <button key={item.name} type="button" onClick={() => onPlan(item.name)} className={cn("relative border p-5 text-start transition-all", plan === item.name ? "border-signal bg-signal/[0.035] shadow-pop" : "border-line hover:border-ink")}>
            <div className="flex items-center justify-between">
              <p className="eyebrow">{item.name}</p>
              <span className={cn("flex size-5 items-center justify-center rounded-full border", plan === item.name ? "border-signal bg-signal text-white" : "border-line-3")}>{plan === item.name ? <Check className="size-3" /> : null}</span>
            </div>
            <p className="mt-6 text-[28px] font-semibold">JD {(item.priceMinor / 1000).toFixed(3)}<span className="text-[11px] font-normal text-ink-3"> / month</span></p>
            <ul className="mt-6 grid gap-2 text-[11.5px] text-ink-2">
              <li>{item.branches} branch{item.branches > 1 ? "es" : ""}</li>
              <li>Up to {item.members.toLocaleString()} members</li>
              <li>{item.staff} staff accounts</li>
            </ul>
          </button>
        ))}
      </div>
      <p className="mt-5 text-[11px] text-ink-3">You can change plans before the trial ends. Prices exclude applicable taxes.</p>
    </div>
  );
}

function StepReady({ draft, plan, onStart }: { draft: GymOnboardingDraft; plan: PlatformSaasPlan; onStart: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-4 text-center">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-bg text-success"><CircleCheck className="size-7" /></span>
      <p className="mt-7 eyebrow">Workspace setup ready</p>
      <h2 className="mt-3 text-[35px] font-semibold tracking-tight">{draft.gymName || "Your gym"} is next.</h2>
      <p className="mx-auto mt-4 max-w-md text-[13.5px] leading-relaxed text-ink-2">We’ll create your first branch, owner access, default permissions, and a 14-day {plan.name} trial.</p>
      <div className="mt-8 grid grid-cols-3 gap-px border border-line bg-line text-start">
        <ReadyItem icon={<Dumbbell />} label={draft.branchName || "1 branch"} />
        <ReadyItem icon={<Sparkles />} label={`${plan.name} trial`} />
        <ReadyItem icon={<Check />} label="14 days" />
      </div>
      <Button type="button" variant="signal" size="lg" className="mt-8" onClick={onStart}>
        Create owner account <ChevronRight />
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[11.5px] font-medium">{label}</span>{children}</label>;
}

function ReadyItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="bg-surface p-4 text-center text-[11px] font-medium"><span className="mx-auto mb-2 block w-fit text-signal [&_svg]:size-4">{icon}</span>{label}</div>;
}
