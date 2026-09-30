"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CalendarDays, Check, CreditCard, ReceiptText, WalletCards } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { MoneyText } from "@/components/shared/data-display";
import { PAYMENT_METHOD_LABELS } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { qk } from "@/lib/api/keys";
import type { CreateMemberMembershipSaleInput, MembershipPlan, PaymentMethodKey } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { addDays, formatDate, todayISODate } from "@/lib/utils/dates";
import { money, moneyInputError, parseMoneyInput, toMajorString } from "@/lib/utils/money";

const schema = z.object({
  planId: z.string().min(1, "Choose a membership"),
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
  const rawAmount = (form.watch("payAmount") ?? "").trim();
  const parsedAmount = parseMoneyInput(rawAmount, currency);
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
      form.setError("payAmount", { message: moneyInputError(rawAmount, currency) ?? "Enter a valid amount" });
      return;
    }
    if (values.collectNow && payingNow.amount <= 0) {
      form.setError("payAmount", { message: "Enter an amount greater than zero" });
      return;
    }
    if (payingNow.amount > plan.basePrice.amount) {
      form.setError("payAmount", { message: "The amount cannot be more than the membership price" });
      return;
    }
    if (values.collectNow && !methods.some((method) => method.key === values.payMethod)) {
      form.setError("payMethod", { message: "Choose a payment method from the list" });
      return;
    }
    if (values.collectNow && referenceRequired && !values.paymentReference?.trim()) {
      form.setError("paymentReference", { message: "Enter the reference number from the card slip or transfer" });
      return;
    }
    onSubmit({
      planId: plan.id,
      startDate: todayISODate(),
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
      <div className="flex items-center gap-2 text-[12px] text-ink-3" aria-label="Steps">
        <span className="inline-flex items-center gap-1.5"><span className="grid size-5 place-items-center rounded-full bg-success text-[12px] text-white"><Check className="size-3" /></span> Member details</span>
        <span aria-hidden className="h-px w-8 bg-line-2" />
        <span className="inline-flex items-center gap-1.5 font-medium text-ink"><span className="grid size-5 place-items-center rounded-full bg-ink text-[12px] text-paper">2</span> Membership and payment</span>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-line bg-sunken/40 px-5 py-4">
          <h2 className="font-display text-xl font-semibold tracking-tight">Choose {memberName}&apos;s membership</h2>
          <p className="mt-1 text-[13px] text-ink-3">The member and membership are saved together when you confirm.</p>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-5">
            <Field label="Membership" required error={form.formState.errors.planId?.message}>
              <Controller
                control={form.control}
                name="planId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-label="Membership" className="min-h-12" data-testid="quick-sale-plan">
                      <SelectValue placeholder={plansQuery.isLoading ? "Loading memberships…" : "Choose a membership"} />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name} · {toMajorString(item.basePrice)} {item.basePrice.currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {plansQuery.isError ? <InlineRetry label="Could not load memberships." onRetry={() => { void plansQuery.refetch(); }} /> : null}
              {!plansQuery.isLoading && !plansQuery.isError && plans.length === 0 ? <p className="mt-2 text-[12.5px] text-warning-deep">No plans are for sale at this branch. Save the member without a membership, or ask a manager to add a plan for this branch.</p> : null}
            </Field>

            <div className="rounded-lg border border-line bg-paper px-4 py-4">
              <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
                <span>
                  <span className="block text-[13.5px] font-semibold">Collect payment now</span>
                  <span className="mt-0.5 block text-[12px] text-ink-3">Turn this off if the member will pay later. The full price will show as unpaid.</span>
                </span>
                <Controller control={form.control} name="collectNow" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Collect payment now" />} />
              </label>

              {collectNow ? (
                <FieldGrid className="mt-4 gap-4 border-t border-line pt-4 sm:grid-cols-2">
                  <Field label={`Amount (${currency})`} error={form.formState.errors.payAmount?.message} hint="Leave empty to take the full price.">
                    <Input inputMode="decimal" dir="ltr" className="min-h-11" placeholder={plan ? toMajorString(plan.basePrice) : toMajorString(money(0, currency))} {...form.register("payAmount")} />
                  </Field>
                  <Field label="Payment method" error={form.formState.errors.payMethod?.message}>
                    <Controller
                      control={form.control}
                      name="payMethod"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger aria-label="Payment method" className="min-h-11"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {methods.map((method) => <SelectItem key={method.key} value={method.key}>{PAYMENT_METHOD_LABELS[method.key] ?? method.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {settingsQuery.isError ? <InlineRetry label="Could not load payment methods." onRetry={() => { void settingsQuery.refetch(); }} /> : null}
                  </Field>
                  {referenceRequired ? (
                    <Field className="sm:col-span-2" label="Reference number" required error={form.formState.errors.paymentReference?.message} hint="The reference number on the card slip, CliQ payment or bank transfer.">
                      <Input className="min-h-11" placeholder="For example: POS-88213" {...form.register("paymentReference")} />
                    </Field>
                  ) : null}
                </FieldGrid>
              ) : (
                <div className="mt-4 flex items-start gap-3 border-t border-line pt-4 text-[12.5px] text-ink-2">
                  <ReceiptText className="mt-0.5 size-4 shrink-0 text-warning-deep" aria-hidden />
                  The membership starts today. The full price stays unpaid until the member pays.
                </div>
              )}
            </div>
          </div>

          <SaleSummary plan={plan} payingNow={payingNow} remaining={remaining} />
        </div>
      </section>

      <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {error ? <p role="alert" className="me-auto max-w-md text-[13px] text-danger">{error}</p> : null}
        <Button type="button" variant="secondary" className="max-sm:w-full" onClick={onBack} disabled={pending}><ArrowLeft /> Back</Button>
        <Button type="submit" className="max-sm:w-full" loading={pending} disabled={!plan || (collectNow && methods.length === 0)} data-testid="confirm-member-sale">
          <WalletCards /> Save member and membership
          {plan ? ` · ${toMajorString(plan.basePrice)} ${plan.basePrice.currency}` : ""}
        </Button>
      </div>
    </form>
  );
}

function SaleSummary({ plan, payingNow, remaining }: { plan?: MembershipPlan; payingNow: ReturnType<typeof money>; remaining: ReturnType<typeof money> }) {
  const start = todayISODate();
  const end = plan ? addDays(start, plan.kind === "visits" ? (plan.visitValidityDays ?? 90) : (plan.durationDays ?? 30)) : undefined;
  return (
    <aside className="self-start rounded-lg border border-line bg-sunken/55 p-4" aria-label="Summary">
      <p className="context-label">Summary</p>
      <dl className="mt-4 space-y-3 text-[13px]">
        <SummaryRow icon={<WalletCards className="size-4" />} label="Membership" value={plan?.name ?? "Not chosen"} />
        <SummaryRow icon={<CalendarDays className="size-4" />} label="Dates" value={end ? `${formatDate(start)} – ${formatDate(end)}` : "—"} tabular />
        <SummaryRow icon={<CreditCard className="size-4" />} label="Paying now" value={<MoneyText money={payingNow} />} />
        <div className="border-t border-line pt-3">
          <SummaryRow icon={<ReceiptText className="size-4" />} label="Left to pay" value={<MoneyText money={remaining} />} warning={remaining.amount > 0} />
        </div>
      </dl>
      <p className="mt-4 text-[12px] leading-relaxed text-ink-3">A receipt is made automatically when money is taken.</p>
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
  return <p role="alert" className="mt-2 text-[12px] text-danger">{label} <button type="button" className="font-medium underline underline-offset-2" onClick={onRetry}>Try again</button></p>;
}
