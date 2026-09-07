"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { qk } from "@/lib/api/keys";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import type { MemberSummary, PaymentMethodKey, ReceiptDetail } from "@/lib/domain/types";
import { money, readMoneyInput, toMajorString } from "@/lib/utils/money";
import { receiptHref } from "@/lib/utils/receipt-links";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { PAYMENT_METHOD_LABELS, TransactionStatusChip } from "@/components/shared/status-chip";
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

const schema = z.object({
  amount: z.string().min(1, "Amount is required"),
  method: z.enum(["cash", "card", "bank_transfer", "cliq", "other"]),
  reference: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/** Methods RIVET only records: the money moved somewhere RIVET cannot see. */
const RECORDED_ONLY_NOTE: Partial<Record<PaymentMethodKey, string>> = {
  card: "RIVET records the card payment as received. It does not charge the card or confirm settlement.",
  cliq: "RIVET records the CliQ transfer as received. It does not confirm it with the bank.",
  bank_transfer: "RIVET records the transfer as received. It does not confirm it with the bank.",
  other: "RIVET records this payment as received; nothing is processed through a provider.",
};

/**
 * Collect money against an outstanding balance. Shows before/after so the
 * collector can state the result out loud to the member, then confirms what
 * the server actually recorded: receipt, amount, method, status and the
 * balance that remains. The dialog closes only when the operator is done.
 */
export function CollectPaymentDialog({
  open,
  onOpenChange,
  member,
  initialChargeId,
  branchId,
  cashDrawerOpen,
  onCollected,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: MemberSummary;
  initialChargeId?: string;
  /** The desk taking the money. Its drawer, not the member's home branch, gets the cash. */
  branchId?: string;
  /** When known to be false, cash is unavailable here and a non-cash method is preselected. */
  cashDrawerOpen?: boolean;
  /** Fires once the server has recorded the payment; the dialog stays open on its confirmation until Done. */
  onCollected?: (receipt: ReceiptDetail) => void;
}) {
  const invalidate = useInvalidate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [collected, setCollected] = useState<ReceiptDetail | null>(null);
  const [attempt, setAttempt] = useState(0);
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const methods = (settingsQuery.data?.paymentMethods ?? []).filter((m) => m.enabled);
  const cashUnavailable = cashDrawerOpen === false;
  const methodUnavailable = (method: { key: PaymentMethodKey; affectsCashDrawer: boolean }) => cashUnavailable && (method.affectsCashDrawer || method.key === "cash");
  const defaultMethod = (methods.find((m) => !methodUnavailable(m))?.key ?? "cash") as FormValues["method"];
  const charges = member.outstandingCharges ?? [];
  const [selectedChargeId, setSelectedChargeId] = useState<string | undefined>(initialChargeId);
  // The invoice this dialog was opened for is gone (paid meanwhile, voided, or
  // the snapshot moved on). Never fall through to another invoice silently.
  const initialChargeMissing = Boolean(initialChargeId) && charges.length > 0 && !charges.some((charge) => charge.id === initialChargeId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: "", method: defaultMethod, reference: "" },
  });

  useEffect(() => {
    if (open) {
      const nextCharge = initialChargeId ? charges.find((charge) => charge.id === initialChargeId) : charges[0];
      setSelectedChargeId(nextCharge?.id);
      form.reset({ amount: toMajorString(nextCharge?.outstandingAmount ?? member.outstanding), method: defaultMethod, reference: "" });
      setServerError(null);
      setCollected(null);
      setAttempt((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member.id, initialChargeId]);

  // Settings can arrive after the dialog opened: move off a method the desk
  // cannot take right now, but never off one the operator chose deliberately.
  const chosenMethod = form.watch("method");
  useEffect(() => {
    if (!open || !cashUnavailable) return;
    const chosen = methods.find((m) => m.key === chosenMethod);
    if (chosen && methodUnavailable(chosen) && defaultMethod !== chosenMethod && !methodUnavailable({ key: defaultMethod, affectsCashDrawer: false })) {
      form.setValue("method", defaultMethod);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cashUnavailable, chosenMethod, defaultMethod, methods.length]);

  const selectedCharge = charges.find((charge) => charge.id === selectedChargeId);
  // A member detail collection must never silently apply an aggregate balance
  // to the wrong invoice. The aggregate fallback only supports legacy/mock
  // snapshots that have no itemized charges at all.
  const outstanding = selectedCharge?.outstandingAmount ?? (charges.length === 0 ? member.outstanding : money(0));
  const currency = outstanding.currency;
  const rawAmount = form.watch("amount") ?? "";
  const amountRead = readMoneyInput(rawAmount, currency);
  const amountValue = amountRead.ok ? amountRead.money : money(0, currency);
  // A malformed paste is called out as soon as the operator leaves the field,
  // not only after a failed submit; a valid prefix while typing stays quiet.
  const liveAmountProblem = !amountRead.ok && amountRead.problem !== "empty" && (form.formState.touchedFields.amount || form.formState.isSubmitted) ? amountRead.message : undefined;
  const selectedMethod = form.watch("method");
  const rawReference = form.watch("reference") ?? "";
  const referenceRequired = selectedMethod === "card" || selectedMethod === "bank_transfer" || selectedMethod === "cliq";
  const after = money(Math.max(0, outstanding.amount - amountValue.amount), currency);

  // One idempotency key per distinct draft and per opening: a retry after a
  // failed request replays the same payment instead of taking it twice, and
  // an edited amount, method or reference gets a fresh key.
  const draftSignature = JSON.stringify({ attempt, memberId: member.id, chargeId: selectedCharge?.id, branchId, amount: amountValue.amount, currency, method: selectedMethod, reference: rawReference.trim() || undefined });
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [draftSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useApiMutation(
    (api, values: FormValues) =>
      api.createPayment(
        {
          memberId: member.id,
          chargeId: selectedCharge?.id,
          branchId,
          amount: amountValue,
          method: values.method as PaymentMethodKey,
          externalReference: values.reference?.trim() || undefined,
        },
        idempotencyKey,
      ),
    {
      onSuccess: async (receipt) => {
        await invalidate();
        setCollected(receipt);
        onCollected?.(receipt);
      },
      onError: (e) => setServerError(isApiError(e) ? e.message : "Payment failed. Nothing was recorded; check the connection and try again."),
    },
  );

  // A request in flight is the operation; closing the dialog must not hide it.
  const handleOpenChange = (next: boolean) => {
    if (!next && mutation.isPending) return;
    onOpenChange(next);
  };

  const collectedPayment = collected?.payment;
  const collectedMethodLabel = collectedPayment ? (PAYMENT_METHOD_LABELS[collectedPayment.method] ?? collectedPayment.method) : "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent aria-busy={mutation.isPending || undefined}>
        <DialogHeader>
          <DialogTitle>{collected ? (collectedPayment?.method === "cash" ? "Cash collected" : `${collectedMethodLabel} payment recorded`) : "Collect payment"}</DialogTitle>
          <DialogDescription>
            {member.fullName} · <span className="font-mono">{member.memberNumber}</span>
          </DialogDescription>
        </DialogHeader>
        {collected && collectedPayment ? (
          <>
            <DialogBody className="space-y-4" data-testid="payment-collected">
              <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success-bg/40 px-3 py-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-white" aria-hidden><CheckCircle2 className="size-4" /></span>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold">Receipt <span className="font-mono">{collected.receipt.receiptNumber}</span></p>
                  <p className="text-[12.5px] text-ink-2"><DateTimeText iso={collected.receipt.issuedAt} /> · {collected.branch.name}</p>
                </div>
              </div>
              <dl className="grid grid-cols-[minmax(96px,120px)_1fr] gap-x-4 gap-y-2 text-[13px]">
                <dt className="text-ink-3">Amount</dt>
                <dd><MoneyText money={collectedPayment.amount} className="text-[15px] font-semibold" /></dd>
                <dt className="text-ink-3">Method</dt>
                <dd>{collectedMethodLabel}{collectedPayment.externalReference ? <span className="font-mono text-[12px] text-ink-2"> · {collectedPayment.externalReference}</span> : null}</dd>
                <dt className="text-ink-3">Status</dt>
                <dd><TransactionStatusChip status={collectedPayment.status} /></dd>
                {collected.charge ? (
                  <>
                    <dt className="text-ink-3">Invoice</dt>
                    <dd>{collected.charge.description}</dd>
                    <dt className="text-ink-3">Still owed</dt>
                    <dd><MoneyText money={collected.charge.outstandingAmount} className={collected.charge.outstandingAmount.amount > 0 ? "font-semibold text-warning-deep" : "font-semibold text-success-deep"} /></dd>
                  </>
                ) : null}
                <dt className="text-ink-3">Recorded by</dt>
                <dd>{collectedPayment.collectedByName}</dd>
              </dl>
              {RECORDED_ONLY_NOTE[collectedPayment.method] ? <p className="text-[12px] text-ink-3">{RECORDED_ONLY_NOTE[collectedPayment.method]}</p> : null}
            </DialogBody>
            <DialogFooter>
              <Button asChild variant="secondary">
                <Link href={receiptHref(collected.receipt.id)}><ExternalLink /> Open receipt</Link>
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)} autoFocus data-testid="payment-done">
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
        <form
          onSubmit={form.handleSubmit((values) => {
            setServerError(null);
            if (!amountRead.ok) {
              form.setError("amount", { message: amountRead.problem === "empty" ? "Amount is required" : amountRead.message });
              return;
            }
            if (amountValue.amount <= 0) {
              form.setError("amount", { message: "Amount must be greater than zero" });
              return;
            }
            if (amountValue.amount > outstanding.amount) {
              form.setError("amount", { message: `Cannot exceed the ${toMajorString(outstanding)} ${currency} owed on this invoice` });
              return;
            }
            if (referenceRequired && !values.reference?.trim()) {
              form.setError("reference", { message: "Reference is required for this payment method" });
              return;
            }
            const method = methods.find((m) => m.key === values.method);
            if (method && methodUnavailable(method)) {
              form.setError("method", { message: "Open a cash shift before taking cash at this desk" });
              return;
            }
            mutation.mutate(values);
          })}
        >
          <DialogBody className="space-y-4">
            {initialChargeMissing && !selectedCharge ? (
              <p role="alert" className="rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2.5 text-[13px] text-warning-deep">
                The invoice this payment was opened for is no longer outstanding. Choose the invoice to collect below.
              </p>
            ) : null}
            {outstanding.amount <= 0 && !initialChargeMissing ? (
              <p className="rounded-md border border-line bg-sunken/50 px-3 py-2.5 text-[13px] text-ink-2">
                No outstanding balance — this member is fully paid up.
              </p>
            ) : (
              <>
                {selectedCharge ? (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-warning-deep">Outstanding balance</span>
                      <span className="block truncate text-[12px] text-ink-2" data-testid="payment-invoice">{selectedCharge.description}</span>
                    </span>
                    <MoneyText money={outstanding} className="shrink-0 text-[15px] font-semibold text-warning-deep" />
                  </div>
                ) : outstanding.amount > 0 ? (
                  <div className="flex items-center justify-between rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2.5">
                    <span className="text-[13px] font-medium text-warning-deep">Outstanding balance</span>
                    <MoneyText money={outstanding} className="text-[15px] font-semibold text-warning-deep" />
                  </div>
                ) : null}
                {charges.length > 1 || initialChargeMissing ? (
                  <Field label="Invoice" required>
                    <Select
                      value={selectedChargeId}
                      onValueChange={(value) => {
                        const charge = charges.find((item) => item.id === value);
                        setSelectedChargeId(value);
                        form.setValue("amount", toMajorString(charge?.outstandingAmount ?? member.outstanding));
                        form.clearErrors("amount");
                        setServerError(null);
                      }}
                    >
                      <SelectTrigger aria-label="Invoice to collect">
                        <SelectValue placeholder="Select an invoice" />
                      </SelectTrigger>
                      <SelectContent>
                        {charges.map((charge) => (
                          <SelectItem key={charge.id} value={charge.id}>
                            {charge.description} · {toMajorString(charge.outstandingAmount)} {charge.outstandingAmount.currency} due
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
                {selectedCharge || charges.length === 0 ? (
                  <>
                    <FieldGrid alignFrom="base" className="grid-cols-2">
                      <Field label={`Amount (${currency})`} required error={form.formState.errors.amount?.message ?? liveAmountProblem}>
                        <Input inputMode="decimal" autoFocus dir="ltr" max={toMajorString(outstanding)} step={toMajorString(money(1, currency))} data-testid="payment-amount" aria-invalid={Boolean(form.formState.errors.amount || liveAmountProblem) || undefined} {...form.register("amount")} />
                      </Field>
                      <Field label="Method" required error={form.formState.errors.method?.message} hint={cashUnavailable ? "No cash shift is open at this desk, so cash cannot be taken here." : undefined}>
                        <Controller
                          control={form.control}
                          name="method"
                          render={({ field }) => (
                            <Select value={field.value} onValueChange={field.onChange}>
                              <SelectTrigger aria-label="Payment method" data-testid="payment-method">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {methods.map((m) => (
                                  <SelectItem key={m.key} value={m.key} disabled={methodUnavailable(m)}>
                                    {PAYMENT_METHOD_LABELS[m.key] ?? m.label}
                                    {methodUnavailable(m) ? " · needs an open shift" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </Field>
                    </FieldGrid>
                    <Field label="External reference" required={referenceRequired} error={form.formState.errors.reference?.message} hint={referenceRequired ? `Enter the POS slip or provider reference. ${RECORDED_ONLY_NOTE[selectedMethod] ?? ""}`.trim() : "Optional for this payment method."}>
                      <Input {...form.register("reference")} placeholder="e.g. POS-88213" dir="ltr" />
                    </Field>
                    <div className="flex items-center justify-between border-t border-line pt-3 text-[13px]">
                      <span className="text-ink-3">Remaining after this payment</span>
                      <MoneyText money={after} className={after.amount > 0 ? "font-semibold text-warning-deep" : "font-semibold text-success-deep"} />
                    </div>
                  </>
                ) : null}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={outstanding.amount <= 0} data-testid="confirm-payment">
              {mutation.isPending ? "Recording…" : `Collect ${amountValue.amount > 0 ? `${toMajorString(amountValue)} ${currency}` : "payment"}`}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
