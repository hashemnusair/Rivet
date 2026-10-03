"use client";
import { useLocale } from "@/lib/i18n/provider";
import { enrollmentErrorText, enrollmentKey } from "@/lib/i18n/member-enrollment";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CalendarDays, Check, CreditCard, ReceiptText, WalletCards } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { MoneyText } from "@/components/shared/data-display";
import { paymentMethodLabel } from "@/lib/i18n/labels";
import { useFormat, useFormattingTimeZone } from "@/lib/i18n/format";
import { useMoneyProblemText } from "@/features/membership-actions/renew-flow-format";
import { Button } from "@/components/ui/button";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { qk } from "@/lib/api/keys";
import type { CreateMemberMembershipSaleInput, MembershipPlan, PaymentMethodKey } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { money, readMoneyInput, parseMoneyInput, toMajorString } from "@/lib/utils/money";

const schema = z.object({
  planId: z.string().min(1, enrollmentKey("chooseMembership")),
  collectNow: z.boolean(),
  payAmount: z.string().optional(),
  payMethod: z.enum(["cash", "card", "bank_transfer", "cliq", "other"]),
  paymentReference: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function QuickMembershipStep({
  memberName,
  branchId,
  pending,
  error,
  onBack,
  onSubmit,
}: {
  memberName: string;
  branchId: string;
  pending: boolean;
  error?: string | null;
  onBack: () => void;
  onSubmit: (sale: CreateMemberMembershipSaleInput["sale"]) => void;
}) {
  const { t, isolate } = useLocale();
  const f = useFormat();
  const timeZone = useFormattingTimeZone();
  const plansQuery = useApiQuery(qk.plans({ status: "active" }), (api) => api.listPlans({ status: "active", pageSize: 50 }));
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const plans = useMemo(
    () => (plansQuery.data?.items ?? []).filter((plan) => plan.branchAccess === "all" || plan.branchIds.includes(branchId)),
    [branchId, plansQuery.data?.items],
  );
  const methods = useMemo(
    () => (settingsQuery.data?.paymentMethods ?? []).filter((method) => method.enabled),
    [settingsQuery.data?.paymentMethods],
  );
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { planId: "", collectNow: true, payAmount: "", payMethod: "cash", paymentReference: "" },
  });
  const plan = plans.find((candidate) => candidate.id === form.watch("planId"));
  const collectNow = form.watch("collectNow");
  const selectedMethod = form.watch("payMethod");
  const currency = plan?.basePrice.currency ?? "JOD";
  const moneyProblemText = useMoneyProblemText();
  const rawAmount = (form.watch("payAmount") ?? "").trim();
  const parsedAmount = parseMoneyInput(rawAmount, currency);
  const amountRead = readMoneyInput(rawAmount, currency);
  const payingNow = collectNow && plan ? (rawAmount ? (parsedAmount ?? money(0, plan.basePrice.currency)) : plan.basePrice) : money(0, plan?.basePrice.currency ?? "JOD");
  const remaining = money(Math.max(0, (plan?.basePrice.amount ?? 0) - payingNow.amount), plan?.basePrice.currency ?? "JOD");
  const referenceRequired = selectedMethod === "card" || selectedMethod === "bank_transfer" || selectedMethod === "cliq";

  useEffect(() => {
    if (methods.length === 0 || methods.some((method) => method.key === form.getValues("payMethod"))) return;
    form.setValue("payMethod", methods[0]!.key);
  }, [form, methods]);

  const submit = form.handleSubmit((values) => {
    if (!plan) return;
    if (values.collectNow && rawAmount && !parsedAmount) {
      form.setError("payAmount", { message: enrollmentKey("validAmount") });
      return;
    }
    if (values.collectNow && payingNow.amount <= 0) {
      form.setError("payAmount", { message: enrollmentKey("positiveAmount") });
      return;
    }
    if (payingNow.amount > plan.basePrice.amount) {
      form.setError("payAmount", { message: enrollmentKey("amountAbovePrice") });
      return;
    }
    if (values.collectNow && !methods.some((method) => method.key === values.payMethod)) {
      form.setError("payMethod", { message: enrollmentKey("chooseMethod") });
      return;
    }
    if (values.collectNow && referenceRequired && !values.paymentReference?.trim()) {
      form.setError("paymentReference", { message: enrollmentKey("enterReference") });
      return;
    }
    onSubmit({
      planId: plan.id,
      startDate: todayISODate(timeZone),
      payment: values.collectNow
        ? {
            amount: payingNow,
            method: values.payMethod as PaymentMethodKey,
            externalReference: values.paymentReference?.trim() || undefined,
          }
        : undefined,
    });
  });

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="flex items-center gap-2 text-[12px] text-ink-3" aria-label={t("memberEnrollment.steps")}>
        <span className="inline-flex items-center gap-1.5"><span className="grid size-5 place-items-center rounded-full bg-success text-[12px] text-white"><Check className="size-3" /></span> {" "}{t("memberEnrollment.memberDetails")}</span>
        <span aria-hidden className="h-px w-8 bg-line-2" />
        <span className="inline-flex items-center gap-1.5 font-medium text-ink"><span className="grid size-5 place-items-center rounded-full bg-ink text-[12px] text-paper">2</span> {" "}{t("memberEnrollment.membershipPayment")}</span>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-line bg-sunken/40 px-5 py-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">{t("memberEnrollment.chooseFor", { name: isolate(memberName) })}</h2>
          <p className="mt-1 text-[13px] text-ink-3">{t("memberEnrollment.savedTogether")}</p>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-5">
            <Field label={t("memberProfile.followUp.membershipFallback")} required error={enrollmentErrorText(t, form.formState.errors.planId?.message)}>
              <Controller
                control={form.control}
                name="planId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label={t("memberProfile.followUp.membershipFallback")} className="min-h-12" data-testid="quick-sale-plan">
                      <SelectValue placeholder={plansQuery.isLoading ? t("memberEnrollment.loadingMemberships") : t("memberEnrollment.chooseMembership")} />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          <bdi>{item.name}</bdi> · <MoneyText money={item.basePrice} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {plansQuery.isError ? <InlineRetry label={t("memberEnrollment.plansFailed")} onRetry={() => { void plansQuery.refetch(); }} /> : null}
              {!plansQuery.isLoading && !plansQuery.isError && plans.length === 0 ? <p className="mt-2 text-[12.5px] text-warning-deep">{t("memberEnrollment.noBranchPlans")}</p> : null}
            </Field>

            <div className="rounded-lg border border-line bg-paper px-4 py-4">
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
                <span>
                  <span className="block text-[13.5px] font-semibold">{t("renewFlow.sale.collectNow")}</span>
                  <span className="mt-0.5 block text-[12px] text-ink-3">{t("memberEnrollment.collectLaterHint")}</span>
                </span>
                <Controller control={form.control} name="collectNow" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={t("renewFlow.sale.collectNow")} />} />
              </label>

              {collectNow ? (
                <FieldGrid className="mt-4 gap-4 border-t border-line pt-4 sm:grid-cols-2">
                  <Field label={t("memberEnrollment.amountCurrency", { currency })} error={form.formState.errors.payAmount && !amountRead.ok && rawAmount ? moneyProblemText(amountRead, currency) : enrollmentErrorText(t, form.formState.errors.payAmount?.message)} hint={t("memberEnrollment.fullPriceHint")}>
                    <Input inputMode="decimal" dir="ltr" className="min-h-11" placeholder={plan ? toMajorString(plan.basePrice) : toMajorString(money(0, currency))} {...form.register("payAmount")} />
                  </Field>
                  <Field label={t("renewFlow.shared.paymentMethodAria")} error={enrollmentErrorText(t, form.formState.errors.payMethod?.message)}>
                    <Controller
                      control={form.control}
                      name="payMethod"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-label={t("renewFlow.shared.paymentMethodAria")} className="min-h-11"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {methods.map((method) => <SelectItem key={method.key} value={method.key}>{paymentMethodLabel(t, method.key) ?? method.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {settingsQuery.isError ? <InlineRetry label={t("memberEnrollment.methodsFailed")} onRetry={() => { void settingsQuery.refetch(); }} /> : null}
                  </Field>
                  {referenceRequired ? (
                    <Field className="sm:col-span-2" label={t("renewFlow.shared.referenceNumber")} required error={enrollmentErrorText(t, form.formState.errors.paymentReference?.message)} hint={t("memberEnrollment.referenceHint")}>
                      <Input className="min-h-11" placeholder={t("renewFlow.shared.referencePlaceholder")} {...form.register("paymentReference")} />
                    </Field>
                  ) : null}
                </FieldGrid>
              ) : (
                <div className="mt-4 flex items-start gap-3 border-t border-line pt-4 text-[12.5px] text-ink-2">
                  <ReceiptText className="mt-0.5 size-4 shrink-0 text-warning-deep" aria-hidden />
                  {" "}{t("memberEnrollment.startsUnpaid")}{" "}</div>
              )}
            </div>
          </div>

          <SaleSummary plan={plan} payingNow={payingNow} remaining={remaining} />
        </div>
      </section>

      <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {error ? <p role="alert" className="me-auto max-w-md text-[13px] text-danger">{error}</p> : null}
        <Button type="button" variant="secondary" className="max-sm:w-full" onClick={onBack} disabled={pending}><ArrowLeft className="rtl:rotate-180" />{" "}{t("common.action.back")}</Button>
        <Button type="submit" className="max-sm:w-full" loading={pending} disabled={!plan || (collectNow && methods.length === 0)} data-testid="confirm-member-sale">
          <WalletCards /> {" "}{t("memberEnrollment.saveMemberSale")}{" "}{plan ? ` · ${isolate(f.money(plan.basePrice))}` : ""}
        </Button>
      </div>
    </form>
  );
}

function SaleSummary({ plan, payingNow, remaining }: { plan?: MembershipPlan; payingNow: ReturnType<typeof money>; remaining: ReturnType<typeof money> }) {
  const { t, isolate } = useLocale();
  const f = useFormat();
  const timeZone = useFormattingTimeZone();
  const start = todayISODate(timeZone);
  const end = plan ? addDays(start, plan.kind === "visits" ? (plan.visitValidityDays ?? 90) : (plan.durationDays ?? 30)) : undefined;
  return (
    <aside className="self-start rounded-lg border border-line bg-sunken/55 p-4" aria-label={t("renewFlow.sale.summary")}>
      <p className="context-label">{t("renewFlow.sale.summary")}</p>
      <dl className="mt-4 space-y-3 text-[13px]">
        <SummaryRow icon={<WalletCards className="size-4" />} label={t("memberProfile.followUp.membershipFallback")} value={plan?.name ?? t("memberEnrollment.notChosen")} />
        <SummaryRow icon={<CalendarDays className="size-4" />} label={t("renewFlow.sale.rowDates")} value={end ? t("memberEnrollment.dateRange", { start: isolate(f.date(start)), end: isolate(f.date(end)) }) : "—"} tabular />
        <SummaryRow icon={<CreditCard className="size-4" />} label={t("renewFlow.sale.rowPayingNow")} value={<MoneyText money={payingNow} />} />
        <div className="border-t border-line pt-3">
          <SummaryRow icon={<ReceiptText className="size-4" />} label={t("memberEnrollment.leftToPay")} value={<MoneyText money={remaining} />} warning={remaining.amount > 0} />
        </div>
      </dl>
      <p className="mt-4 text-[12px] leading-relaxed text-ink-3">{t("memberEnrollment.receiptAutomatic")}</p>
    </aside>
  );
}

function SummaryRow({ icon, label, value, tabular, warning }: { icon: React.ReactNode; label: string; value: React.ReactNode; tabular?: boolean; warning?: boolean }) {
  return (
    <div className="grid grid-cols-[20px_1fr] gap-x-2 gap-y-0.5">
      <dt className="row-span-2 mt-0.5 text-ink-3">{icon}</dt>
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className={`${tabular ? "text-[12.5px] tabular" : "font-medium"} ${warning ? "text-warning-deep" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

function InlineRetry({ label, onRetry }: { label: string; onRetry: () => void }) {
  const { t } = useLocale();
  return <p role="alert" className="mt-2 text-[12px] text-danger">{label} <button type="button" className="font-medium underline underline-offset-2" onClick={onRetry}>{t("common.action.retry")}</button></p>;
}
