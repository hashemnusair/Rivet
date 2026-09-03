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
import { money, parseMoneyInput, toMajor } from "@/lib/utils/money";
import { MoneyText } from "@/components/shared/data-display";
import { PAYMENT_METHOD_LABELS } from "@/components/shared/status-chip";
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

const schema = z.object({
  planId: z.string().min(1, "Choose a plan"),
  startDate: z.string().min(1, "Start date is required"),
  priceOverride: z.string().optional(),
  overrideReason: z.string().optional(),
  discount: z.string().optional(),
  discountReason: z.string().optional(),
  payNow: z.boolean(),
  payAmount: z.string().optional(),
  payMethod: z.enum(["cash", "card", "bank_transfer", "cliq", "other"]),
  paymentReference: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * New membership sale OR renewal — one deliberate commercial surface.
 * Shows the full money story before anything is committed.
 */
export function MembershipSaleDialog({
  open,
  onOpenChange,
  member,
  renewalOf,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: MemberSummary;
  renewalOf?: MembershipSummary;
  onCompleted?: (result: MembershipSaleResult) => void;
}) {
  const isRenewal = Boolean(renewalOf);
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
      payMethod: "cash",
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
        payMethod: "cash",
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

  const plan: MembershipPlan | undefined = plans.find((p) => p.id === watchPlanId);
  const basePrice = plan ? (parseMoneyInput(watchPrice ?? "") ?? plan.basePrice) : money(0);
  const discount = parseMoneyInput(watchDiscount ?? "") ?? money(0);
  const total = money(Math.max(0, basePrice.amount - discount.amount));
  const payingNow = watchPayNow ? (parseMoneyInput(watchPayAmount ?? "") ?? total) : money(0);
  const remaining = money(Math.max(0, total.amount - payingNow.amount));
  const needsApproval =
    discount.amount > 0 && role ? discountNeedsApproval(settingsQuery.data?.roles ?? [], role, discount.amount) : false;
  const canOverridePrice = can("memberships.override_dates");
  const canDiscount = can("payments.discount");
  const standardStartDate = isRenewal && renewalOf
    ? renewalOf.endDate >= todayISODate() ? addDays(renewalOf.endDate, 1) : todayISODate()
    : todayISODate();
  const needsOverrideReason = Boolean(
    (plan && parseMoneyInput(watchPrice ?? "")?.amount !== undefined && parseMoneyInput(watchPrice ?? "")!.amount !== plan.basePrice.amount)
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
        setServerError(isApiError(e) ? e.message : "Sale failed.");
      },
    },
  );

  const submit = form.handleSubmit((values) => {
    setServerError(null);
    if (discount.amount > 0 && !values.discountReason?.trim()) {
      form.setError("discountReason", { message: "A reason is required for discounts" });
      return;
    }
    if (needsOverrideReason && !values.overrideReason?.trim()) {
      form.setError("overrideReason", { message: "A reason is required for price or date overrides" });
      return;
    }
    if (values.payNow && payingNow.amount > 0 && paymentReferenceRequired && !values.paymentReference?.trim()) {
      form.setError("paymentReference", { message: "Reference is required for this payment method" });
      return;
    }
    const payment =
      values.payNow && payingNow.amount > 0
        ? { amount: payingNow, method: values.payMethod as PaymentMethodKey, externalReference: values.paymentReference?.trim() || undefined }
        : undefined;
    if (isRenewal && renewalOf) {
      mutation.mutate({
        renew: {
          id: renewalOf.id,
          input: {
            planId: values.planId !== renewalOf.planId ? values.planId : undefined,
            startDate: values.startDate,
            priceOverride: parseMoneyInput(values.priceOverride ?? "") ?? undefined,
            overrideReason: values.overrideReason || undefined,
            discount: parseMoneyInput(values.discount ?? "") ?? undefined,
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
          priceOverride: parseMoneyInput(values.priceOverride ?? "") ?? undefined,
          overrideReason: values.overrideReason || undefined,
          discount: parseMoneyInput(values.discount ?? "") ?? undefined,
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
          <DialogTitle>{isRenewal ? "Renew membership" : "Sell membership"}</DialogTitle>
          <DialogDescription>
            {member.fullName} · <span className="font-mono">{member.memberNumber}</span>
            {isRenewal && renewalOf ? (
              <>
                {" "}
                — current term ends <span className="tabular">{renewalOf.endDate}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody className="grid gap-5 sm:grid-cols-[1fr_240px]">
            <div className="space-y-4">
              <Field label="Plan" required>
                <Controller
                  control={form.control}
                  name="planId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Plan">
                        <SelectValue placeholder="Choose a plan…" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} — JOD {toMajor(p.basePrice).toFixed(3)}
                            {p.kind === "visits" ? ` · ${p.visitAllowance} visits` : ` · ${p.durationDays}d`}
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
                <Field label="Start date" required>
                  <Input type="date" {...form.register("startDate")} />
                </Field>
                <Field
                  label="Price override (JOD)"
                  hint={canOverridePrice ? undefined : "Manager permission required"}
                >
                  <Input
                    inputMode="decimal"
                    placeholder={plan ? toMajor(plan.basePrice).toFixed(3) : ""}
                    disabled={!canOverridePrice}
                    {...form.register("priceOverride")}
                  />
                </Field>
              </FieldGrid>

              {needsOverrideReason ? (
                <Field label="Override reason" required error={form.formState.errors.overrideReason?.message} hint="Price and date changes are recorded in the audit trail.">
                  <Input placeholder="Why does this sale need an exception?" {...form.register("overrideReason")} />
                </Field>
              ) : null}

              <FieldGrid alignFrom="base" className="grid-cols-2">
                <Field label="Discount (JOD)" hint={canDiscount ? undefined : "No discount permission"}>
                  <Input inputMode="decimal" placeholder="0.000" disabled={!canDiscount} {...form.register("discount")} />
                </Field>
                <Field label="Discount reason" error={form.formState.errors.discountReason?.message}>
                  <Input placeholder="e.g. Corporate rate" disabled={!canDiscount} {...form.register("discountReason")} />
                </Field>
              </FieldGrid>

              {needsApproval ? (
                <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2 text-[12.5px] text-warning-deep">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  This discount exceeds your limit. It will be recorded as
                  <strong className="font-semibold">pending manager approval</strong> and appear in the audit log.
                </div>
              ) : null}

              <div className="rounded-md border border-line p-3">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-[13px] font-medium">Collect payment now</span>
                  <Controller
                    control={form.control}
                    name="payNow"
                    render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} disabled={renewalStartsInFuture} aria-label="Collect payment now" />}
                  />
                </label>
                {watchPayNow ? (
                  <FieldGrid alignFrom="base" className="mt-3 grid-cols-2">
                    <Field label="Amount (JOD)">
                      <Input inputMode="decimal" placeholder={toMajor(total).toFixed(3)} {...form.register("payAmount")} />
                    </Field>
                    <Field label="Method">
                      <Controller
                        control={form.control}
                        name="payMethod"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger aria-label="Payment method">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {methods.map((m) => (
                                <SelectItem key={m.key} value={m.key}>
                                  {PAYMENT_METHOD_LABELS[m.key] ?? m.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </Field>
                    {paymentReferenceRequired ? (
                      <Field className="col-span-2" label="External reference" required error={form.formState.errors.paymentReference?.message} hint="Enter the POS slip or provider reference.">
                        <Input {...form.register("paymentReference")} placeholder="e.g. POS-88213" />
                      </Field>
                    ) : null}
                  </FieldGrid>
                ) : renewalStartsInFuture ? (
                  <p className="mt-2 text-[12px] text-ink-3">
                    This upcoming invoice becomes collectible when the successor term begins.
                  </p>
                ) : (
                  <p className="mt-2 text-[12px] text-ink-3">
                    The full amount becomes an outstanding balance on the member account.
                  </p>
                )}
              </div>
            </div>

            {/* Money story */}
            <aside className="rounded-md border border-line bg-sunken/50 p-4 self-start" aria-label="Sale summary">
              <p className="context-label">Summary</p>
              <dl className="mt-3 space-y-2 text-[13px]">
                <Row label="Plan">{plan?.name ?? "—"}</Row>
                <Row label="Term">
                  {plan ? (
                    <span className="font-mono text-[12px]">
                      {form.watch("startDate")} → {plan.kind === "visits" ? addDays(form.watch("startDate"), plan.visitValidityDays ?? 90) : addDays(form.watch("startDate"), plan.durationDays ?? 30)}
                    </span>
                  ) : (
                    "—"
                  )}
                </Row>
                <Row label="Price">
                  <MoneyText money={basePrice} />
                </Row>
                <Row label="Discount">
                  <MoneyText money={money(-discount.amount)} signed={discount.amount > 0} />
                </Row>
                <li className="border-t border-line-2 pt-2">
                  <Row label="Total" strong>
                    <MoneyText money={total} />
                  </Row>
                </li>
                <Row label="Paying now">
                  <MoneyText money={payingNow} />
                </Row>
                <Row label="Remaining" tone={remaining.amount > 0 ? "warn" : undefined}>
                  <MoneyText money={remaining} />
                </Row>
              </dl>
            </aside>
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={!plan} data-testid="confirm-sale">
              {isRenewal ? "Confirm renewal" : "Confirm sale"}
              {total.amount > 0 ? ` — ${toMajor(total).toFixed(3)} JOD` : ""}
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
