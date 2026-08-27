"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import type { BillingInterval, PlatformSaasPlan } from "@/lib/api/GymOSApi";
import type { MarketplaceGym } from "@/lib/public/experience-data";
import { useApiMutation } from "@/lib/hooks/use-api";
import { cn } from "@/lib/utils/cn";
import { formatBillingDate, subscriptionBillingLines } from "@/lib/platform/subscription-billing";

type PlanName = "Starter" | "Growth" | "Pro" | "Enterprise";
type Step = "gym" | "plan" | "review";

const STEPS: Array<{ key: Step; label: string }> = [
  { key: "gym", label: "Choose gym" },
  { key: "plan", label: "Plan & billing" },
  { key: "review", label: "Review & confirm" },
];

/**
 * Guided billing walkthrough: pick the gym, pick the plan and cadence, see
 * exactly what will be invoiced, then save. It is a front door over the same
 * subscription-change mutation the gym detail page uses, so the server keeps
 * owning every date, credit, and invoice.
 */
export function BillGymWizard({ open, onOpenChange, gyms, plans, initialGymId }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gyms: MarketplaceGym[];
  plans: PlatformSaasPlan[];
  /** Skip the gym step and open directly on this tenant's plan step. */
  initialGymId?: string;
}) {
  const [step, setStep] = useState<Step>("gym");
  const [search, setSearch] = useState("");
  const [gymId, setGymId] = useState<string>();
  const [plan, setPlan] = useState<PlanName>();
  const [cadence, setCadence] = useState<BillingInterval>("monthly");
  const [reason, setReason] = useState("");

  const billableGyms = useMemo(
    () => gyms.filter((gym) => gym.isProvisioned === true && !gym.isArchived),
    [gyms],
  );
  const matchedGyms = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? billableGyms.filter((gym) => gym.name.toLowerCase().includes(query)) : billableGyms;
  }, [billableGyms, search]);
  const gym = billableGyms.find((item) => item.id === gymId);
  const selectedPlan = plan ?? gym?.rivetPlan;
  const currentCadence = gym?.billingInterval ?? "monthly";
  const planPrice = plans.find((item) => item.name === selectedPlan)?.priceMinor;
  const alreadyExact = Boolean(gym && gym.subscriptionStatus === "active" && selectedPlan === gym.rivetPlan && cadence === currentCadence);
  const needsActivation = Boolean(gym && gym.subscriptionStatus !== "active");

  const reset = () => {
    setStep("gym");
    setSearch("");
    setGymId(undefined);
    setPlan(undefined);
    setCadence("monthly");
    setReason("");
  };

  useEffect(() => {
    if (!open) return;
    const preselected = initialGymId ? billableGyms.find((item) => item.id === initialGymId) : undefined;
    if (preselected) {
      setGymId(preselected.id);
      setPlan(preselected.rivetPlan);
      setCadence(preselected.billingInterval ?? "monthly");
      setStep("plan");
    }
  }, [open, initialGymId, billableGyms]);

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const chooseGym = (item: MarketplaceGym) => {
    setGymId(item.id);
    setPlan(item.rivetPlan);
    setCadence(item.billingInterval ?? "monthly");
    setStep("plan");
  };

  const bill = useApiMutation((api) => {
    if (!gym || !selectedPlan) throw new Error("Choose a gym and plan first.");
    return api.updatePlatformGym({
      gymId: gym.id,
      plan: selectedPlan,
      billingInterval: cadence,
      ...(needsActivation ? { status: "active" as const } : {}),
      reason: reason.trim(),
    });
  }, {
    onSuccess: () => {
      close(false);
    },
    successMessage: "Subscription saved. The term invoice is now in the ledger below.",
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!bill.isPending) close(next); }}>
      <DialogContent className="max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Bill a gym</DialogTitle>
          <DialogDescription>Three steps: pick the gym, pick the plan and billing, confirm the invoice. The server derives every date and credit.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <ol className="flex flex-wrap items-center gap-2 text-[10.5px]" aria-label="Billing steps">
            {STEPS.map((item, index) => {
              const activeIndex = STEPS.findIndex((candidate) => candidate.key === step);
              const state = index < activeIndex ? "done" : index === activeIndex ? "current" : "todo";
              return (
                <li key={item.key} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1", state === "current" ? "border-ink bg-sunken font-semibold" : state === "done" ? "border-success/40 bg-success-bg/40 text-success-deep" : "border-line text-ink-3")} aria-current={state === "current" ? "step" : undefined}>
                  {state === "done" ? <Check className="size-3" aria-hidden /> : <span className="font-mono">{index + 1}</span>}
                  {item.label}
                </li>
              );
            })}
          </ol>

          {step === "gym" ? (
            <div className="grid gap-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search gyms by name" aria-label="Search gyms" className="ps-9" autoFocus />
              </label>
              <div className="max-h-72 divide-y divide-line overflow-y-auto border border-line" role="listbox" aria-label="Billable gyms">
                {matchedGyms.length === 0 ? <p className="px-4 py-8 text-center text-[12px] text-ink-3">No provisioned gyms match this search.</p> : matchedGyms.map((item) => (
                  <button key={item.id} type="button" role="option" aria-selected={item.id === gymId} onClick={() => chooseGym(item)} className="grid w-full gap-1 px-4 py-3 text-start transition-colors hover:bg-sunken">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold">{item.name}</span>
                      <StatusBadge status={item.subscriptionStatus} />
                    </span>
                    <span className="text-[10.5px] text-ink-3">
                      {item.rivetPlan} · {item.billingInterval === "annual" ? "annual" : "monthly"}
                      {item.subscriptionStatus === "active" && item.currentPeriodEndsAt ? ` · paid through ${formatBillingDate(new Date(item.currentPeriodEndsAt))}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === "plan" && gym ? (
            <div className="grid gap-4">
              <p className="text-[11.5px] text-ink-2"><span className="font-semibold">{gym.name}</span> is currently <span className="font-semibold">{gym.subscriptionStatus === "overdue" ? "past due" : gym.subscriptionStatus}</span> on {gym.rivetPlan} · {currentCadence}.</p>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Plan">
                {plans.map((item) => (
                  <button key={item.name} type="button" role="radio" aria-checked={selectedPlan === item.name} onClick={() => setPlan(item.name as PlanName)} className={cn("grid gap-1 border px-4 py-3 text-start transition-colors", selectedPlan === item.name ? "border-ink bg-sunken" : "border-line hover:bg-sunken/60")}>
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold">{item.name}</span>
                      {item.name === gym.rivetPlan ? <span className="rounded-sm bg-night px-1.5 py-0.5 font-mono text-[7.5px] uppercase tracking-[.1em] text-night-ink">Current</span> : null}
                    </span>
                    <span className="text-[11px] text-ink-2">JOD {(item.priceMinor / 1_000).toFixed(3)} / month</span>
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Billing cadence">
                {(["monthly", "annual"] as const).map((interval) => {
                  const amount = planPrice === undefined ? undefined : interval === "annual" ? Math.round(planPrice * 12 * 0.8) : planPrice;
                  return (
                    <button key={interval} type="button" role="radio" aria-checked={cadence === interval} onClick={() => setCadence(interval)} className={cn("grid gap-1 border px-4 py-3 text-start transition-colors", cadence === interval ? "border-ink bg-sunken" : "border-line hover:bg-sunken/60")}>
                      <span className="text-[13px] font-semibold">{interval === "annual" ? "Annual · saves 20%" : "Monthly"}</span>
                      <span className="text-[11px] text-ink-2">{amount === undefined ? "—" : `JOD ${(amount / 1_000).toFixed(3)} ${interval === "annual" ? "per year" : "per month"}`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === "review" && gym && selectedPlan ? (
            <div className="grid gap-4">
              <p className="text-[11.5px] text-ink-2">
                {needsActivation
                  ? <>Saving <span className="font-semibold">reactivates {gym.name}</span> on {selectedPlan} · {cadence}, starting a fresh paid term today.</>
                  : alreadyExact
                    ? <>{gym.name} is already active on exactly this plan and billing — there is nothing to bill.</>
                    : <>Saving changes <span className="font-semibold">{gym.name}</span> to {selectedPlan} · {cadence}. Unused paid days carry over, so there is no need to wait for the current term to end.</>}
              </p>
              {!alreadyExact ? (
                <div className="border border-signal/40 bg-signal-bg/60 px-4 py-3 text-[11.5px] leading-relaxed" role="note" aria-label="Billing preview">
                  <p className="flex items-start gap-2 font-semibold"><Receipt className="mt-0.5 size-3.5 shrink-0" aria-hidden />What happens when you save</p>
                  <ul className="mt-2 grid gap-1 text-ink-2">
                    {subscriptionBillingLines({ currentStatus: gym.subscriptionStatus, currentPeriodEndsAt: gym.currentPeriodEndsAt, plan: selectedPlan, billingInterval: cadence, priceMinor: planPrice }).map((line) => <li key={line}>{line}</li>)}
                  </ul>
                </div>
              ) : null}
              {!alreadyExact ? (
                <label className="grid gap-1.5 text-[12px] font-medium" htmlFor="bill-gym-reason">Reason for this change<Textarea id="bill-gym-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for the immutable platform audit trail" /></label>
              ) : null}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter className="flex-wrap justify-between gap-2">
          <div>
            {step !== "gym" ? <Button variant="secondary" onClick={() => setStep(step === "review" ? "plan" : "gym")} disabled={bill.isPending}><ArrowLeft className="rtl:rotate-180" />Back</Button> : null}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => close(false)} disabled={bill.isPending}>Cancel</Button>
            {step === "plan" ? <Button variant="signal" onClick={() => setStep("review")} disabled={!selectedPlan}>Review<ArrowRight className="rtl:rotate-180" /></Button> : null}
            {step === "review" ? <Button variant="signal" loading={bill.isPending} disabled={alreadyExact || !reason.trim()} onClick={() => bill.mutate()}><Check />Confirm & bill</Button> : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: MarketplaceGym["subscriptionStatus"] }) {
  const label = status === "overdue" ? "past due" : status;
  return <span className={cn("rounded-sm px-1.5 py-0.5 font-mono text-[7.5px] uppercase tracking-[.1em]", status === "active" ? "bg-success-bg text-success-deep" : status === "trial" ? "bg-sunken text-ink-2" : "bg-signal-bg text-signal-deep")}>{label}</span>;
}
