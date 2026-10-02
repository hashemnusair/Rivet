"use client";
import { useLocale, useT, type TFunction } from "@/lib/i18n/provider";
import { useFormat, useFormattingTimeZone } from "@/lib/i18n/format";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Receipt, Search } from "lucide-react";
import { SubscriptionStatusBadge } from "@/components/platform/platform-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import type { BillingInterval, PlatformSaasPlan } from "@/lib/api/GymOSApi";
import type { MarketplaceGym } from "@/lib/public/experience-data";
import { useApiMutation } from "@/lib/hooks/use-api";
import { cn } from "@/lib/utils/cn";
import { subscriptionBillingLineDescriptors } from "@/lib/platform/subscription-billing";
import { termPriceMinor } from "../../../../convex/planCatalogue";
import { money } from "@/lib/utils/money";
import { searchKey } from "@/lib/utils/text";

type PlanName = "Starter" | "Growth" | "Pro" | "Enterprise";
const STEPS = [
  { key: "gym", message: "platformFinance.wizard.stepGym" },
  { key: "plan", message: "platformFinance.wizard.stepPlan" },
  { key: "review", message: "platformFinance.wizard.stepReview" },
] as const;
type Step = (typeof STEPS)[number]["key"];

function statusText(status: MarketplaceGym["subscriptionStatus"], t: TFunction): string {
  switch (status) {
    case "active": return t("platformFinance.wizard.statusActive");
    case "trial": return t("platformFinance.wizard.statusTrial");
    case "overdue": return t("platformFinance.wizard.statusPastDue");
    case "suspended": return t("platformFinance.wizard.statusSuspended");
    case "cancelled": return t("platformFinance.wizard.statusCancelled");
  }
}

function previewLine(line: ReturnType<typeof subscriptionBillingLineDescriptors>[number], f: ReturnType<typeof useFormat>, t: TFunction): string {
  switch (line.kind) {
    case "invoice_unpriced":
      return line.billingInterval === "annual"
        ? t("platformFinance.wizard.preview.invoiceUnpricedAnnual", { plan: line.plan })
        : t("platformFinance.wizard.preview.invoiceUnpricedMonthly", { plan: line.plan });
    case "invoice":
      return t("platformFinance.wizard.preview.invoice", {
        amount: f.money(money(line.subtotalMinor, "JOD")),
        plan: line.plan,
        cadence: t(line.billingInterval === "annual" ? "platformFinance.wizard.preview.annualCadence" : "platformFinance.wizard.preview.monthlyCadence"),
      });
    case "credit":
      return t("platformFinance.wizard.preview.credit", {
        credit: f.money(money(line.creditMinor, "JOD")),
        days: t("platformFinance.wizard.preview.creditDays", { count: line.creditDays, formatted: f.number(line.creditDays) }),
        due: f.money(money(line.amountMinor, "JOD")),
      });
    case "term_end":
      return t("platformFinance.wizard.preview.termEnd", { date: f.date(line.date) });
    case "void_previous_invoice":
      return t("platformFinance.wizard.preview.oldInvoice");
  }
}

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
  const t = useT();
  const { isolate, isolateLtr } = useLocale();
  const timeZone = useFormattingTimeZone();
  const f = useFormat(timeZone);
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
    const query = searchKey(search);
    return query ? billableGyms.filter((gym) => searchKey(gym.name).includes(query)) : billableGyms;
  }, [billableGyms, search]);
  const gym = billableGyms.find((item) => item.id === gymId);
  const selectedPlan = plan ?? gym?.rivetPlan;
  const currentCadence = gym?.billingInterval ?? "monthly";
  const planPrice = plans.find((item) => item.name === selectedPlan)?.priceMinor;
  const currentPlanPrice = plans.find((item) => item.name === gym?.rivetPlan)?.priceMinor;
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
    if (!gym || !selectedPlan) throw new Error(t("platformFinance.wizard.chooseFirst"));
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
    successMessage: t("platformFinance.wizard.billingSaved"),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!bill.isPending) close(next); }}>
      <DialogContent className="max-w-2xl" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t("platformFinance.wizard.title")}</DialogTitle>
          <DialogDescription>{t("platformFinance.wizard.description")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <ol className="flex flex-wrap items-center gap-2 text-[12.5px]" aria-label={t("platformFinance.wizard.steps")}>
            {STEPS.map((item, index) => {
              const activeIndex = STEPS.findIndex((candidate) => candidate.key === step);
              const state = index < activeIndex ? "done" : index === activeIndex ? "current" : "todo";
              return (
                <li key={item.key} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1", state === "current" ? "border-ink bg-ink text-paper" : state === "done" ? "border-line-2 text-ink" : "border-line-2 text-ink-3")} aria-current={state === "current" ? "step" : undefined}>
                  {state === "done" ? <Check className="size-3" aria-hidden /> : <span className="tabular">{index + 1}</span>}
          {t(item.message)}
                </li>
              );
            })}
          </ol>

          {step === "gym" ? (
            <div className="grid gap-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("platformFinance.wizard.search")} aria-label={t("platformFinance.wizard.searchAria")} className="ps-9" autoFocus />
              </label>
              <div className="max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line" role="listbox" aria-label={t("platformFinance.wizard.billableGyms")}>
                {matchedGyms.length === 0 ? <p className="px-4 py-8 text-center text-[12.5px] text-ink-3">{t("platformFinance.wizard.noMatches")}</p> : matchedGyms.map((item) => (
                  <button key={item.id} type="button" role="option" aria-selected={item.id === gymId} onClick={() => chooseGym(item)} className="grid w-full gap-1 px-4 py-3 text-start transition-colors hover:bg-sunken">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[13.5px] font-semibold">{item.name}</span>
                      <SubscriptionStatusBadge status={item.subscriptionStatus} />
                    </span>
                    <span className="text-[12.5px] text-ink-3">
                      <bdi dir="ltr">{item.rivetPlan}</bdi> · {item.billingInterval === "annual" ? t("platformFinance.wizard.annual") : t("platformFinance.wizard.monthly")}
                      {item.subscriptionStatus === "active" && item.currentPeriodEndsAt ? ` · ${t("platformFinance.subscriptions.paidThrough")} ${f.date(item.currentPeriodEndsAt)}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === "plan" && gym ? (
            <div className="grid gap-4">
              <p className="text-[13px] text-ink-2">{t("platformFinance.wizard.gymStatus", { gym: isolate(gym.name), status: statusText(gym.subscriptionStatus, t), plan: isolateLtr(selectedPlan ?? gym.rivetPlan), cadence: currentCadence === "annual" ? t("platformFinance.wizard.annualInline") : t("platformFinance.wizard.monthlyInline") })}</p>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("renewFlow.adjust.planChange.rowPlan")}>
                {plans.map((item) => (
                  <button key={item.name} type="button" role="radio" aria-checked={selectedPlan === item.name} onClick={() => setPlan(item.name as PlanName)} className={cn("grid gap-1 rounded-md border px-4 py-3 text-start transition-colors", selectedPlan === item.name ? "border-ink bg-sunken" : "border-line-2 hover:border-line-3")}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13.5px] font-semibold"><bdi dir="ltr">{item.name}</bdi></span>
                      {item.name === gym.rivetPlan ? <Badge variant="ink">{t("platformFinance.wizard.current")}</Badge> : null}
                    </span>
                    <span className="text-[12.5px] text-ink-2">{f.money(money(item.priceMinor, "JOD"))}{" "}{t("marketing.pricing.perMonth")}</span>
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("platformFinance.wizard.planAndBilling")}>
                {(["monthly", "annual"] as const).map((interval) => {
                  const amount = planPrice === undefined ? undefined : termPriceMinor(planPrice, interval);
                  return (
                    <button key={interval} type="button" role="radio" aria-checked={cadence === interval} onClick={() => setCadence(interval)} className={cn("grid gap-1 rounded-md border px-4 py-3 text-start transition-colors", cadence === interval ? "border-ink bg-sunken" : "border-line-2 hover:border-line-3")}>
                      <span className="text-[13.5px] font-semibold">{interval === "annual" ? t("platformFinance.wizard.annualSaving") : t("platformFinance.wizard.monthly")}</span>
                      <span className="text-[12.5px] text-ink-2">{amount === undefined ? "—" : `${f.money(money(amount, "JOD"))} ${interval === "annual" ? t("platformFinance.wizard.perYear") : t("platformFinance.wizard.perMonth")}`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === "review" && gym && selectedPlan ? (
            <div className="grid gap-4">
              <p className="text-[13px] leading-relaxed text-ink-2">
                {needsActivation
                  ? t("platformFinance.wizard.reactivates", { gym: isolate(gym.name), plan: isolateLtr(selectedPlan), cadence: cadence === "annual" ? t("platformFinance.wizard.annualInline") : t("platformFinance.wizard.monthlyInline") })
                  : alreadyExact
                    ? t("platformFinance.wizard.alreadyExact", { gym: isolate(gym.name) })
                    : t("platformFinance.wizard.changing", { gym: isolate(gym.name), plan: isolateLtr(selectedPlan), cadence: cadence === "annual" ? t("platformFinance.wizard.annualInline") : t("platformFinance.wizard.monthlyInline") })}
              </p>
              {!alreadyExact ? (
                <div className="rounded-md border border-line bg-sunken/60 px-4 py-3 text-[12.5px] leading-relaxed" role="note" aria-label={t("platformFinance.wizard.previewAria")}>
                  <p className="flex items-start gap-2 font-semibold text-ink"><Receipt className="mt-0.5 size-3.5 shrink-0 text-ink-3" aria-hidden />{t("platformFinance.wizard.whenSaved")}</p>
                  <ul className="mt-2 grid gap-1 text-ink-2">
                    {subscriptionBillingLineDescriptors({ currentStatus: gym.subscriptionStatus, currentPeriodEndsAt: gym.currentPeriodEndsAt, plan: selectedPlan, billingInterval: cadence, priceMinor: planPrice, currentPlanPriceMinor: currentPlanPrice, currentBillingInterval: currentCadence }).map((line, index) => <li key={`${line.kind}-${index}`}>{previewLine(line, f, t)}</li>)}
                  </ul>
                </div>
              ) : null}
              {!alreadyExact ? (
                <Field label={t("platformFinance.wizard.reason")} htmlFor="bill-gym-reason"><Textarea id="bill-gym-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("platformFinance.wizard.auditReasonPlaceholder")} /></Field>
              ) : null}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter className="flex-wrap justify-between gap-2">
          <div>
            {step !== "gym" ? <Button variant="secondary" onClick={() => setStep(step === "review" ? "plan" : "gym")} disabled={bill.isPending}><ArrowLeft className="rtl:rotate-180" />{t("common.action.back")}</Button> : null}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => close(false)} disabled={bill.isPending}>{t("common.action.cancel")}</Button>
            {step === "plan" ? <Button onClick={() => setStep("review")} disabled={!selectedPlan}>{t("platformFinance.wizard.review")}<ArrowRight className="rtl:rotate-180" /></Button> : null}
            {step === "review" ? <Button variant="signal" loading={bill.isPending} disabled={alreadyExact || !reason.trim()} onClick={() => bill.mutate()}><Check />{t("platformFinance.wizard.confirmBill")}</Button> : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
