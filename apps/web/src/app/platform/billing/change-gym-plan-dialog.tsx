"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import type { BillingInterval, PlatformSaasPlan } from "@/lib/api/GymOSApi";
import { useApiMutation } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { useExperience } from "@/lib/providers/experience-provider";
import type { MarketplaceGym } from "@/lib/public/experience-data";
import { resolvePublicPricingPlans } from "@/lib/public/pricing";
import { money, readMoneyInput, toMajorString } from "@/lib/utils/money";
import { AddOnControls, AddOnSummary } from "@/features/subscriptions/add-on-controls";
import { addOnMonthlyPrice, validateAddOns, EMPTY_ADD_ONS, type SubscriptionAddOns } from "../../../../convex/subscriptionAddOns";
import { projectSubscriptionBilling } from "@/lib/platform/subscription-billing";
import { isQuotedPlan, findPlan, termPriceMinor } from "../../../../convex/planCatalogue";

type PlanName = PlatformSaasPlan["name"];

/**
 * RIVET changes a gym's plan, billing cycle or Enterprise price. An active gym
 * starts a new paid term today and gets an invoice, less the days it already
 * paid for; a gym that has not paid yet gets its first invoice replaced. The
 * server prices both, so this dialog only says what will happen.
 */
export function ChangeGymPlanDialog({ gym, onOpenChange }: { gym: MarketplaceGym; onOpenChange: (open: boolean) => void }) {
  const { t, isolate, isolateLtr } = useLocale();
  const f = useFormat();
  const { saasPlans } = useExperience();
  const plans = useMemo(() => resolvePublicPricingPlans(saasPlans), [saasPlans]);
  const currentInterval: BillingInterval = gym.billingInterval === "annual" ? "annual" : "monthly";
  const [plan, setPlan] = useState<PlanName>(gym.rivetPlan);
  const [interval, setBillingInterval] = useState<BillingInterval>(currentInterval);
  const [quote, setQuote] = useState(gym.quotedPriceMinor ? toMajorString(money(gym.quotedPriceMinor, "JOD")) : "");
  const [addOns, setAddOns] = useState<SubscriptionAddOns>(() => validateAddOns(gym.addOns, gym.rivetPlan));
  const selectedAddOns = plan === "Basic" ? addOns : EMPTY_ADD_ONS;
  const addOnsChanged = JSON.stringify(selectedAddOns) !== JSON.stringify(validateAddOns(gym.addOns, gym.rivetPlan));
  const monthlyPrice = (plans.find(item => item.name === plan)?.priceMinor ?? findPlan(plan)?.priceMinor ?? 0) + addOnMonthlyPrice(selectedAddOns);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ quote?: string; changes?: string }>({});
  const quoted = isQuotedPlan(plan);
  const active = gym.subscriptionStatus === "active" || gym.subscriptionStatus === "overdue";
  const awaitingFirstPayment = gym.subscriptionStatus === "pending_payment";

  const save = useApiMutation((api, input: { plan?: PlanName; billingInterval?: BillingInterval; quotedPriceMinor?: number; addOns?: SubscriptionAddOns; expectedAddOnsRevision?: number }) => api.updatePlatformGym({ gymId: gym.id, ...input, reason: reason.trim() }), {
    onSuccess: () => onOpenChange(false),
    successMessage: t("platformFinance.subscriptions.planSaved"),
  });

  const submit = () => {
    const next: typeof errors = {};
    let quotedPriceMinor: number | undefined;
    if (quoted) {
      const parsed = readMoneyInput(quote, "JOD");
      if (!parsed.ok || parsed.money.amount <= 0) next.quote = t("platformFinance.subscriptions.quoteRequired");
      else quotedPriceMinor = parsed.money.amount;
    }
    const input = {
      ...(addOnsChanged ? { addOns: selectedAddOns, expectedAddOnsRevision: gym.addOnsRevision ?? 0 } : {}),
      ...(plan !== gym.rivetPlan ? { plan } : {}),
      ...(interval !== currentInterval ? { billingInterval: interval } : {}),
      ...(quotedPriceMinor !== undefined && quotedPriceMinor !== gym.quotedPriceMinor ? { quotedPriceMinor } : {}),
    };
    if (!next.quote && Object.keys(input).length === 0) next.changes = t("platformFinance.subscriptions.nothingChanged");
    setErrors(next);
    if (next.quote || next.changes) return;
    // Moving onto Enterprise always sends the quote, even when it matches a
    // stored one, so the server never has to guess the price.
    save.mutate(quoted && plan !== gym.rivetPlan ? { ...input, quotedPriceMinor } : input);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!save.isPending) onOpenChange(open); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("platformFinance.subscriptions.changePlanTitle", { gym: isolate(gym.name) })}</DialogTitle>
          <DialogDescription>{t("platformFinance.subscriptions.changePlanDescription")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-[13px] font-medium">{t("platformFinance.subscriptions.planLabel")}</legend>
            <RadioGroup value={plan} onValueChange={(value) => { setPlan(value as PlanName); setErrors({}); }} aria-label={t("platformFinance.subscriptions.planLabel")} className="grid gap-2 sm:grid-cols-2">
              {plans.map((candidate) => (
                <RadioCard key={candidate.name} value={candidate.name} className="flex items-start justify-between gap-2 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-semibold"><bdi dir="ltr">{candidate.name}</bdi></span>
                    <span className="mt-0.5 block text-[12.5px] text-ink-3">{isQuotedPlan(candidate.name) ? t("platformFinance.subscriptions.customQuote") : t("platformFinance.subscriptions.perMonth", { amount: isolateLtr(f.money(money(candidate.priceMinor, "JOD"))) })}</span>
                  </span>
                  {candidate.name === gym.rivetPlan ? <Badge variant="neutral">{t("platformFinance.subscriptions.current")}</Badge> : null}
                </RadioCard>
              ))}
            </RadioGroup>
          </fieldset>
          {plan === "Basic" && (gym.subscriptionStatus === "active" || awaitingFirstPayment) ? <AddOnControls value={addOns} onChange={setAddOns} /> : null}
          {quoted ? (
            <Field label={t("platformFinance.subscriptions.quoteLabel")} hint={t("platformFinance.subscriptions.quoteHint")} error={errors.quote} required>
              <Input value={quote} onChange={(event) => { setQuote(event.target.value); setErrors({}); }} inputMode="decimal" aria-invalid={Boolean(errors.quote)} />
            </Field>
          ) : null}
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">{t("platformFinance.subscriptions.billingLabel")}</legend>
            <RadioGroup value={interval} onValueChange={(value) => { setBillingInterval(value as BillingInterval); setErrors({}); }} aria-label={t("platformFinance.subscriptions.billingLabel")} className="grid grid-cols-2 gap-2">
              <RadioCard value="monthly" className="text-[13px] font-medium">{t("platformFinance.subscriptions.monthly")}</RadioCard>
              <RadioCard value="annual" className="text-[13px] font-medium">{t("platformFinance.subscriptions.annual")}</RadioCard>
            </RadioGroup>
          </fieldset>
          <p className="rounded-md border border-line bg-sunken/50 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">{awaitingFirstPayment ? t("platformFinance.subscriptions.replaceFirstInvoice", { gym: isolate(gym.name) }) : active ? t("platformFinance.subscriptions.invoiceToday", { gym: isolate(gym.name) }) : t("platformFinance.subscriptions.noInvoice")}</p>
          {!quoted && gym.subscriptionStatus === "active" ? <div className="grid gap-2 rounded-md border border-line p-3 text-[12.5px]" role="note" aria-label={t("platformFinance.wizard.previewAria")}>
            <p>{t("platformFinance.addOns.recurring")}: <strong>{f.money(money(termPriceMinor(monthlyPrice, interval), "JOD"))}</strong> · {t(interval === "annual" ? "platformFinance.subscriptions.annual" : "platformFinance.subscriptions.monthly")}</p>
            <p>{t("platformFinance.wizard.preview.invoice", { amount: f.money(money(projectSubscriptionBilling({ currentStatus: gym.subscriptionStatus, currentPeriodEndsAt: gym.currentPeriodEndsAt, currentTermValueMinor: gym.currentTermValueMinor, pendingOnboardingFeeMinor: gym.pendingOnboardingFeeMinor, plan, billingInterval: interval, priceMinor: monthlyPrice, currentBillingInterval: currentInterval }).amountMinor ?? 0, "JOD")), plan, cadence: t(interval === "annual" ? "platformFinance.subscriptions.annual" : "platformFinance.subscriptions.monthly") })}</p>
            {plan === "Basic" ? <AddOnSummary value={selectedAddOns} /> : null}
            <p>{t("platformFinance.addOns.review")}</p>
          </div> : null}
          <Field label={t("platformFinance.subscriptions.reason")} htmlFor="change-plan-reason">
            <Textarea id="change-plan-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("platformFinance.subscriptions.auditReasonPlaceholder")} />
          </Field>
          {errors.changes ? <p className="text-[12.5px] text-danger" role="alert">{errors.changes}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={save.isPending}>{t("common.action.cancel")}</Button>
          <Button loading={save.isPending} disabled={!reason.trim()} onClick={submit}>{t("platformFinance.subscriptions.changePlan")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
