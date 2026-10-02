"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { qk } from "@/lib/api/keys";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { discountNeedsApproval } from "@/lib/domain/permissions";
import type {
  CreateMembershipSaleInput,
  MemberSummary,
  MembershipPlan,
  MembershipSaleResult,
  MembershipSummary,
  PaymentMethodKey,
  RenewMembershipInput,
  UUID,
} from "@/lib/domain/types";
import { usePermissions } from "@/lib/providers/app-providers";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { money, parseMoneyInput, toMajorString } from "@/lib/utils/money";
import { useFormat } from "@/lib/i18n/format";
import { paymentMethodLabel } from "@/lib/i18n/labels";
import { useLocale, type TFunction } from "@/lib/i18n/provider";
import { MoneyText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAmountText, useMoneyInputError, useReadableDate } from "./renew-flow-format";

const makeSchema = (t: TFunction) => z.object({
  planId: z.string().min(1, t("renewFlow.sale.errors.choosePlan")),
  startDate: z.string().min(1, t("renewFlow.sale.errors.chooseStartDate")),
  priceOverride: z.string().optional(),
  overrideReason: z.string().optional(),
  discount: z.string().optional(),
  discountReason: z.string().optional(),
  payNow: z.boolean(),
  payAmount: z.string().optional(),
  payMethod: z.enum(["cash", "card", "bank_transfer", "cliq", "other"]),
  paymentReference: z.string().optional(),
});

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

/**
 * New membership sale OR renewal — one deliberate commercial surface.
 * Shows the full money story before anything is committed.
 */
export function MembershipSaleDialog({
  open,
  onOpenChange,
  member,
  renewalOf,
  branchId,
  cashDrawerOpen,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: MemberSummary;
  renewalOf?: MembershipSummary;
  /** The desk taking any money now. Its drawer, not the member's home branch, gets the cash. */
  branchId?: string;
  /** When known to be false, cash is unavailable here and a non-cash method is preselected. */
  cashDrawerOpen?: boolean;
  onCompleted?: (result: MembershipSaleResult) => void;
}) {
  const isRenewal = Boolean(renewalOf);
  const { t, isolate, isolateLtr } = useLocale();
  const format = useFormat();
  const readableDate = useReadableDate();
  const amountText = useAmountText();
  const moneyInputError = useMoneyInputError();
  const schema = useMemo(() => makeSchema(t), [t]);
  const invalidate = useInvalidate();
  const { can, role } = usePermissions();
  const [serverError, setServerError] = useState<string | null>(null);

  const plansQuery = useApiQuery(qk.plans({ status: "active" }), (api) => api.listPlans({ status: "active", pageSize: 50 }));
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());

  const plans = useMemo(() => plansQuery.data?.items ?? [], [plansQuery.data]);
  const methods = useMemo(
    () => (settingsQuery.data?.paymentMethods ?? []).filter((m) => m.enabled),
    [settingsQuery.data],
  );
  const cashUnavailable = cashDrawerOpen === false;
  const methodUnavailable = (method: { key: PaymentMethodKey; affectsCashDrawer: boolean }) => cashUnavailable && (method.affectsCashDrawer || method.key === "cash");
  const defaultMethod = (methods.find((m) => !methodUnavailable(m))?.key ?? "cash") as FormValues["payMethod"];

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      planId: renewalOf?.planId ?? "",
      startDate: isRenewal
        ? renewalOf && renewalOf.endDate >= todayISODate()
          ? addDays(renewalOf.endDate, 1)
          : todayISODate()
        : todayISODate(),
      priceOverride: "",
      overrideReason: "",
      discount: "",
      discountReason: "",
      payNow: !isRenewal,
      payAmount: "",
      payMethod: defaultMethod,
      paymentReference: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        planId: renewalOf?.planId ?? "",
        startDate: isRenewal
          ? renewalOf && renewalOf.endDate >= todayISODate()
            ? addDays(renewalOf.endDate, 1)
            : todayISODate()
          : todayISODate(),
        priceOverride: "",
        overrideReason: "",
        discount: "",
        discountReason: "",
        payNow: !isRenewal,
        payAmount: "",
        payMethod: defaultMethod,
        paymentReference: "",
      });
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const watchPlanId = form.watch("planId");
  const watchPrice = form.watch("priceOverride");
  const watchDiscount = form.watch("discount");
  const watchPayNow = form.watch("payNow");
  const watchPayAmount = form.watch("payAmount");
  const watchPayMethod = form.watch("payMethod");
  const renewalStartsInFuture = isRenewal && form.watch("startDate") > todayISODate();
  const paymentReferenceRequired = watchPayMethod === "card" || watchPayMethod === "bank_transfer" || watchPayMethod === "cliq";

  useEffect(() => {
    if (renewalStartsInFuture && form.getValues("payNow")) form.setValue("payNow", false);
  }, [form, renewalStartsInFuture]);

  // Settings can arrive after the dialog opened: move off a method the desk
  // cannot take right now, but never off one the operator chose deliberately.
  useEffect(() => {
    if (!open || !cashUnavailable) return;
    const chosen = methods.find((m) => m.key === watchPayMethod);
    if (chosen && methodUnavailable(chosen) && defaultMethod !== watchPayMethod) form.setValue("payMethod", defaultMethod);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cashUnavailable, watchPayMethod, defaultMethod, methods.length]);

  const plan: MembershipPlan | undefined = plans.find((p) => p.id === watchPlanId);
  // Money is read under the one input policy in the plan's currency. Text
  // that cannot be read is an error at submit (and once the field is left),
  // never a silent fallback to the base price, to no discount or to the full
  // total.
  const currency = plan?.basePrice.currency ?? member.outstanding.currency;
  const rawPrice = watchPrice?.trim() ?? "";
  const rawDiscount = watchDiscount?.trim() ?? "";
  const rawPayAmount = watchPayAmount?.trim() ?? "";
  const priceProblem = rawPrice ? moneyInputError(rawPrice, currency) : undefined;
  const discountProblem = rawDiscount ? moneyInputError(rawDiscount, currency) : undefined;
  const payAmountProblem = watchPayNow && rawPayAmount ? moneyInputError(rawPayAmount, currency) : undefined;
  const showProblem = (field: "priceOverride" | "discount" | "payAmount") => Boolean(form.formState.touchedFields[field] || form.formState.isSubmitted);
  const priceOverride = plan ? parseMoneyInput(rawPrice, currency) : null;
  const basePrice = plan ? (priceOverride ?? plan.basePrice) : money(0, currency);
  const discount = parseMoneyInput(rawDiscount, currency) ?? money(0, currency);
  const total = money(Math.max(0, basePrice.amount - discount.amount), currency);
  const payingNow = watchPayNow ? (rawPayAmount ? (parseMoneyInput(rawPayAmount, currency) ?? money(0, currency)) : total) : money(0, currency);
  const remaining = money(Math.max(0, total.amount - payingNow.amount), currency);
  const needsApproval =
    discount.amount > 0 && role ? discountNeedsApproval(settingsQuery.data?.roles ?? [], role, discount.amount) : false;
  const canOverridePrice = can("memberships.override_dates");
  const canDiscount = can("payments.discount");
  const standardStartDate = isRenewal && renewalOf
    ? renewalOf.endDate >= todayISODate() ? addDays(renewalOf.endDate, 1) : todayISODate()
    : todayISODate();
  const needsOverrideReason = Boolean(
    (plan && priceOverride !== null && priceOverride.amount !== plan.basePrice.amount)
    || form.watch("startDate") !== standardStartDate,
  );

  const mutation = useApiMutation(
    (api, input: { sale?: CreateMembershipSaleInput; renew?: { id: UUID; input: RenewMembershipInput } }) =>
      input.sale ? api.createMembershipSale(input.sale) : api.renewMembership(input.renew!.id, input.renew!.input),
    {
      onSuccess: (result) => {
        onOpenChange(false);
        onCompleted?.(result);
        void invalidate();
      },
      onError: (e) => {
        setServerError(isApiError(e) ? e.message : t("renewFlow.sale.errors.saveFailed"));
      },
    },
  );

  const submit = form.handleSubmit((values) => {
    setServerError(null);
    if (priceProblem) {
      form.setError("priceOverride", { message: priceProblem });
      return;
    }
    if (discountProblem) {
      form.setError("discount", { message: discountProblem });
      return;
    }
    if (values.payNow && payAmountProblem) {
      form.setError("payAmount", { message: payAmountProblem });
      return;
    }
    if (values.payNow && rawPayAmount && payingNow.amount <= 0) {
      form.setError("payAmount", { message: t("renewFlow.sale.errors.payAmountPositive") });
      return;
    }
    if (values.payNow && payingNow.amount > total.amount) {
      form.setError("payAmount", { message: t("renewFlow.sale.errors.payAmountOverTotal", { amount: amountText(total) }) });
      return;
    }
    if (discount.amount > 0 && !values.discountReason?.trim()) {
      form.setError("discountReason", { message: t("renewFlow.sale.errors.discountReasonRequired") });
      return;
    }
    if (needsOverrideReason && !values.overrideReason?.trim()) {
      form.setError("overrideReason", { message: t("renewFlow.sale.errors.overrideReasonRequired") });
      return;
    }
    if (values.payNow && payingNow.amount > 0 && paymentReferenceRequired && !values.paymentReference?.trim()) {
      form.setError("paymentReference", { message: t("renewFlow.shared.referenceRequired") });
      return;
    }
    const chosenMethod = methods.find((m) => m.key === values.payMethod);
    if (values.payNow && payingNow.amount > 0 && chosenMethod && methodUnavailable(chosenMethod)) {
      form.setError("payMethod", { message: t("renewFlow.shared.openShiftFirst") });
      return;
    }
    const payment =
      values.payNow && payingNow.amount > 0
        ? { amount: payingNow, method: values.payMethod as PaymentMethodKey, externalReference: values.paymentReference?.trim() || undefined, branchId }
        : undefined;
    if (isRenewal && renewalOf) {
      mutation.mutate({
        renew: {
          id: renewalOf.id,
          input: {
            planId: values.planId !== renewalOf.planId ? values.planId : undefined,
            startDate: values.startDate,
            priceOverride: parseMoneyInput(values.priceOverride ?? "", currency) ?? undefined,
            overrideReason: values.overrideReason || undefined,
            discount: parseMoneyInput(values.discount ?? "", currency) ?? undefined,
            discountReason: values.discountReason || undefined,
            payment,
          },
        },
      });
    } else {
      mutation.mutate({
        sale: {
          memberId: member.id,
          planId: values.planId,
          startDate: values.startDate,
          priceOverride: parseMoneyInput(values.priceOverride ?? "", currency) ?? undefined,
          overrideReason: values.overrideReason || undefined,
          discount: parseMoneyInput(values.discount ?? "", currency) ?? undefined,
          discountReason: values.discountReason || undefined,
          payment,
        },
      });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isRenewal ? t("renewFlow.sale.titleRenew") : t("renewFlow.sale.titleSell")}</DialogTitle>
          <DialogDescription>
            <bdi>{member.fullName}</bdi> · <span className="font-mono" dir="ltr">{member.memberNumber}</span>
            {isRenewal && renewalOf ? (
              <>
                {" "}
                — {t("renewFlow.sale.currentEnds")} <span className="tabular" dir="auto">{readableDate(renewalOf.endDate)}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody className="grid gap-5 sm:grid-cols-[1fr_240px]">
            <div className="space-y-4">
              <Field label={t("renewFlow.sale.planLabel")} required>
                <Controller
                  control={form.control}
                  name="planId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label={t("renewFlow.sale.planLabel")}>
                        <SelectValue placeholder={t("renewFlow.sale.planPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {t("renewFlow.sale.planOption", {
                              name: isolate(p.name),
                              price: isolateLtr(format.money(p.basePrice)),
                              detail: p.kind === "visits"
                                ? t("renewFlow.sale.planVisits", { count: p.visitAllowance ?? 0 })
                                : t("renewFlow.sale.planDays", { count: p.durationDays ?? 0 }),
                            })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.planId ? (
                  <p role="alert" className="mt-1.5 text-xs text-danger">{form.formState.errors.planId.message}</p>
                ) : null}
              </Field>

              <FieldGrid alignFrom="base" className="grid-cols-2">
                <Field label={t("renewFlow.sale.startDate")} required>
                  <Input type="date" {...form.register("startDate")} />
                </Field>
                <Field
                  label={t("renewFlow.sale.specialPrice", { currency: isolateLtr(currency) })}
                  error={form.formState.errors.priceOverride?.message ?? (showProblem("priceOverride") ? priceProblem : undefined)}
                  hint={canOverridePrice ? undefined : t("renewFlow.sale.specialPriceHint")}
                >
                  <Input
                    inputMode="decimal"
                    dir="ltr"
                    placeholder={plan ? toMajorString(plan.basePrice) : ""}
                    disabled={!canOverridePrice}
                    {...form.register("priceOverride")}
                  />
                </Field>
              </FieldGrid>

              {needsOverrideReason ? (
                <Field label={t("renewFlow.sale.changeReason")} required error={form.formState.errors.overrideReason?.message}>
                  <Input dir="auto" placeholder={t("renewFlow.sale.changeReasonPlaceholder")} {...form.register("overrideReason")} />
                </Field>
              ) : null}

              <FieldGrid alignFrom="base" className="grid-cols-2">
                <Field label={t("renewFlow.sale.discount", { currency: isolateLtr(currency) })} error={form.formState.errors.discount?.message ?? (showProblem("discount") ? discountProblem : undefined)} hint={canDiscount ? undefined : t("renewFlow.sale.discountHint")}>
                  <Input inputMode="decimal" dir="ltr" placeholder={toMajorString(money(0, currency))} disabled={!canDiscount} {...form.register("discount")} />
                </Field>
                <Field label={t("renewFlow.sale.discountReason")} error={form.formState.errors.discountReason?.message}>
                  <Input dir="auto" placeholder={t("renewFlow.sale.discountReasonPlaceholder")} disabled={!canDiscount} {...form.register("discountReason")} />
                </Field>
              </FieldGrid>

              {needsApproval ? (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2 text-[12.5px] text-warning-deep">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {t("renewFlow.sale.needsApproval")}
                </div>
              ) : null}

              <div className="rounded-md border border-line p-3">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-[13px] font-medium">{t("renewFlow.sale.collectNow")}</span>
                  <Controller
                    control={form.control}
                    name="payNow"
                    render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} disabled={renewalStartsInFuture} aria-label={t("renewFlow.sale.collectNow")} />}
                  />
                </label>
                {watchPayNow ? (
                  <FieldGrid alignFrom="base" className="mt-3 grid-cols-2">
                    <Field label={t("renewFlow.shared.amountWithCurrency", { currency: isolateLtr(currency) })} error={form.formState.errors.payAmount?.message ?? (showProblem("payAmount") ? payAmountProblem : undefined)} hint={t("renewFlow.sale.payAmountHint")}>
                      <Input inputMode="decimal" dir="ltr" placeholder={toMajorString(total)} {...form.register("payAmount")} />
                    </Field>
                    <Field label={t("renewFlow.shared.method")} error={form.formState.errors.payMethod?.message} hint={cashUnavailable ? t("renewFlow.shared.noCashShiftHint") : undefined}>
                      <Controller
                        control={form.control}
                        name="payMethod"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger aria-label={t("renewFlow.shared.paymentMethodAria")}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {methods.map((m) => (
                                <SelectItem key={m.key} value={m.key} disabled={methodUnavailable(m)}>
                                  {paymentMethodLabel(t, m.key)}
                                  {methodUnavailable(m) ? t("renewFlow.shared.needsOpenShift") : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </Field>
                    {paymentReferenceRequired ? (
                      <Field className="col-span-2" label={t("renewFlow.shared.referenceNumber")} required error={form.formState.errors.paymentReference?.message} hint={t("renewFlow.shared.referenceHint")}>
                        <Input dir="ltr" {...form.register("paymentReference")} placeholder={t("renewFlow.shared.referencePlaceholder")} />
                      </Field>
                    ) : null}
                  </FieldGrid>
                ) : renewalStartsInFuture ? (
                  <p className="mt-2 text-[12px] text-ink-3">
                    {t("renewFlow.sale.paymentLaterFuture")}
                  </p>
                ) : (
                  <p className="mt-2 text-[12px] text-ink-3">
                    {t("renewFlow.sale.paymentLaterOwes")}
                  </p>
                )}
              </div>
            </div>

            {/* Money story */}
            <aside className="rounded-md border border-line bg-sunken/50 p-4 self-start" aria-label={t("renewFlow.sale.summaryAria")}>
              <p className="context-label">{t("renewFlow.sale.summary")}</p>
              <dl className="mt-3 space-y-2 text-[13px]">
                <Row label={t("renewFlow.sale.rowPlan")}>{plan ? <bdi>{plan.name}</bdi> : "—"}</Row>
                <Row label={t("renewFlow.sale.rowDates")}>
                  {plan ? (
                    <span className="font-mono text-[12px]">
                      {t("renewFlow.sale.dateRange", {
                        start: isolate(readableDate(form.watch("startDate"))),
                        end: isolate(readableDate(plan.kind === "visits" ? addDays(form.watch("startDate"), plan.visitValidityDays ?? 90) : addDays(form.watch("startDate"), plan.durationDays ?? 30))),
                      })}
                    </span>
                  ) : (
                    "—"
                  )}
                </Row>
                <Row label={t("renewFlow.sale.rowPrice")}>
                  <MoneyText money={basePrice} />
                </Row>
                <Row label={t("renewFlow.sale.rowDiscount")}>
                  <MoneyText money={money(-discount.amount)} signed={discount.amount > 0} />
                </Row>
                <li className="border-t border-line-2 pt-2">
                  <Row label={t("renewFlow.sale.rowTotal")} strong>
                    <MoneyText money={total} />
                  </Row>
                </li>
                <Row label={t("renewFlow.sale.rowPayingNow")}>
                  <MoneyText money={payingNow} />
                </Row>
                <Row label={t("renewFlow.sale.rowStillOwed")} tone={remaining.amount > 0 ? "warn" : undefined}>
                  <MoneyText money={remaining} />
                </Row>
              </dl>
            </aside>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              {t("common.action.cancel")}
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!plan} data-testid="confirm-sale">
              {isRenewal
                ? total.amount > 0 ? t("renewFlow.sale.confirmRenewalAmount", { amount: amountText(total) }) : t("renewFlow.sale.confirmRenewal")
                : total.amount > 0 ? t("renewFlow.sale.confirmSaleAmount", { amount: amountText(total) }) : t("renewFlow.sale.confirmSale")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children, strong, tone }: { label: string; children: React.ReactNode; strong?: boolean; tone?: "warn" }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className={cn("text-ink-3", strong && "font-medium text-ink")}>{label}</dt>
      <dd className={cn("text-end", strong && "text-[15px] font-semibold", tone === "warn" && "text-warning-deep")}>{children}</dd>
    </div>
  );
}
