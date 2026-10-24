"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import type { BillingPlans, PlanChangeOption, PlatformSaasPlan } from "@/lib/api/GymOSApi";
import { qk } from "@/lib/api/keys";
import { useApiMutation } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { findPlan, termPriceMinor, UNLIMITED } from "../../../convex/planCatalogue";

/**
 * A gym moves itself up to a bigger plan. It sees what it pays today (the new
 * plan less the unused days it already paid for), confirms, and goes to the
 * payment page. The plan changes once RIVET confirms the payment.
 */
export function ChangePlanDialog({ open, onOpenChange, plans }: { open: boolean; onOpenChange: (open: boolean) => void; plans: BillingPlans }) {
  const { t, isolateLtr } = useLocale();
  const f = useFormat();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<PlatformSaasPlan["name"] | undefined>(plans.options[0]?.plan);
  const option = plans.options.find((candidate) => candidate.plan === selected) ?? plans.options[0];
  const annual = plans.billingInterval === "annual";
  const cadence = t(annual ? "commerce.lines.year" : "commerce.lines.month");
  const money = (minor: number) => isolateLtr(f.money({ amount: minor, currency: "JOD" }));
  const price = (monthlyMinor: number) => t(annual ? "commerce.plans.perYear" : "commerce.plans.perMonth", { amount: money(termPriceMinor(monthlyMinor, plans.billingInterval)) });
  const currentPrice = plans.monthlyPriceMinor ?? (plans.plan ? findPlan(plans.plan)?.priceMinor : undefined);
  const request = useApiMutation((api, plan: PlatformSaasPlan["name"]) => api.requestPlanChange({ plan }), {
    onSuccess: (checkout) => {
      queryClient.setQueryData(qk.billingCheckout, checkout);
      void queryClient.invalidateQueries({ queryKey: qk.billingPlans });
      void queryClient.invalidateQueries({ queryKey: qk.myPlatformInvoices });
      onOpenChange(false);
      router.push("/billing");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("commerce.plans.title")}</DialogTitle>
          <DialogDescription>{t("commerce.plans.description")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {plans.plan ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-sunken/50 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold"><bdi>{plans.plan}</bdi></p>
                {currentPrice ? <p className="text-[12.5px] text-ink-3">{price(currentPrice)}</p> : null}
              </div>
              <Badge variant="neutral">{t("commerce.plans.current")}</Badge>
            </div>
          ) : null}
          {plans.options.length === 0 ? (
            <p className="text-[13.5px] text-ink-2">{t("commerce.plans.biggest")}</p>
          ) : (
            <RadioGroup value={option?.plan} onValueChange={(value) => setSelected(value as PlatformSaasPlan["name"])} aria-label={t("commerce.plans.title")} className="grid gap-2">
              {plans.options.map((candidate) => <PlanCard key={candidate.plan} option={candidate} price={price(candidate.monthlyPriceMinor)} />)}
            </RadioGroup>
          )}
          {option ? <PaySummary option={option} annual={annual} after={t("commerce.plans.after", { amount: money(option.subtotalMinor), cadence })} /> : null}
          <p className="text-[12.5px] text-ink-3">
            {t("commerce.plans.smaller")}{" "}
            <Link href="/support" className="font-medium text-ink underline-offset-4 hover:underline">{t("commerce.plans.messageRivet")}</Link>
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
          {option ? <Button onClick={() => request.mutate(option.plan)} loading={request.isPending}>{t("commerce.plans.continue")}</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanCard({ option, price }: { option: PlanChangeOption; price: string }) {
  const { t, isolateLtr } = useLocale();
  const f = useFormat();
  const limits = findPlan(option.plan);
  const capacity = (value: number) => value === UNLIMITED ? t("platformFinance.detail.unlimitedCapacity") : f.number(value);
  return (
    <RadioCard value={option.plan} className="flex items-start justify-between gap-3 px-3.5 py-3">
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold"><bdi>{option.plan}</bdi></span>
        {limits ? <span className="mt-0.5 block text-[12.5px] text-ink-3">{t("commerce.plans.limits", { branches: capacity(limits.branches), staff: capacity(limits.staff), members: capacity(limits.members) })}</span> : null}
      </span>
      <span className="shrink-0 text-[13px] font-medium tabular">{isolateLtr(price)}</span>
    </RadioCard>
  );
}

function PaySummary({ option, annual, after }: { option: PlanChangeOption; annual: boolean; after: string }) {
  const { t, isolate, isolateLtr } = useLocale();
  const f = useFormat();
  const money = (minor: number) => isolateLtr(f.money({ amount: minor, currency: "JOD" }));
  return (
    <div className="rounded-md border border-line bg-surface px-3.5 py-3">
      <dl className="divide-y divide-line text-[13.5px]">
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-ink-2">{t("commerce.lines.subscription", { plan: isolate(option.plan), cadence: t(annual ? "commerce.lines.annual" : "commerce.lines.monthly") })}</dt>
          <dd className="tabular">{money(option.subtotalMinor)}</dd>
        </div>
        {option.onboardingFeeMinor > 0 ? (
          <div className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-ink-2">{t("commerce.lines.onboarding")}</dt>
            <dd className="tabular">{money(option.onboardingFeeMinor)}</dd>
          </div>
        ) : null}
        {option.creditMinor > 0 ? (
          <div className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-ink-2">{t("commerce.lines.credit")}</dt>
            <dd className="tabular text-success">{isolateLtr(`−${f.money({ amount: option.creditMinor, currency: "JOD" })}`)}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between gap-4 pt-2.5">
          <dt className="font-semibold">{t("commerce.plans.payToday")}</dt>
          <dd className="tabular text-[17px] font-semibold">{money(option.amountMinor)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">{after}</p>
    </div>
  );
}
