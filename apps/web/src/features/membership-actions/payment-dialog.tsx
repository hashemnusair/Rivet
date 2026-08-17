"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { qk } from "@/lib/api/keys";
import { isApiError } from "@/lib/api/errors";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import type { MemberSummary, PaymentMethodKey, ReceiptDetail } from "@/lib/domain/types";
import { money, parseMoneyInput, toMajor } from "@/lib/utils/money";
import { MoneyText } from "@/components/shared/data-display";
import { useT } from "@/lib/i18n/provider";
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
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const schema = z.object({
  amount: z.string().min(1, "Amount is required"),
  method: z.enum(["cash", "card", "bank_transfer", "cliq", "other"]),
  reference: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Collect money against an outstanding balance. Shows before/after so the
 * collector can state the result out loud to the member.
 */
export function CollectPaymentDialog({
  open,
  onOpenChange,
  member,
  initialChargeId,
  onCollected,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  member: MemberSummary;
  initialChargeId?: string;
  onCollected?: (receipt: ReceiptDetail) => void;
}) {
  const t = useT();
  const invalidate = useInvalidate();
  const [serverError, setServerError] = useState<string | null>(null);
  const settingsQuery = useApiQuery(qk.settings, (api) => api.getOrganizationSettings());
  const methods = (settingsQuery.data?.paymentMethods ?? []).filter((m) => m.enabled);
  const charges = member.outstandingCharges ?? [];
  const [selectedChargeId, setSelectedChargeId] = useState<string | undefined>(initialChargeId);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: "", method: "cash", reference: "" },
  });

  useEffect(() => {
    if (open) {
      const nextCharge = initialChargeId ? charges.find((charge) => charge.id === initialChargeId) : charges[0];
      setSelectedChargeId(nextCharge?.id);
      form.reset({ amount: toMajor(nextCharge?.outstandingAmount ?? member.outstanding).toFixed(3), method: "cash", reference: "" });
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, member.id, initialChargeId]);

  const selectedCharge = charges.find((charge) => charge.id === selectedChargeId);
  // A member detail collection must never silently apply an aggregate balance
  // to the wrong invoice. The aggregate fallback only supports legacy/mock
  // snapshots that have no itemized charges at all.
  const outstanding = selectedCharge?.outstandingAmount ?? (charges.length === 0 ? member.outstanding : money(0));
  const amountValue = parseMoneyInput(form.watch("amount") ?? "") ?? money(0);
  const selectedMethod = form.watch("method");
  const referenceRequired = selectedMethod === "card" || selectedMethod === "bank_transfer" || selectedMethod === "cliq";
  const after = money(Math.max(0, outstanding.amount - amountValue.amount));

  const mutation = useApiMutation(
    (api, values: FormValues) =>
      api.createPayment(
        {
          memberId: member.id,
          chargeId: selectedCharge?.id,
          amount: amountValue,
          method: values.method as PaymentMethodKey,
          externalReference: values.reference || undefined,
        },
        crypto.randomUUID(),
      ),
    {
      onSuccess: async (receipt) => {
        await invalidate();
        onOpenChange(false);
        onCollected?.(receipt);
      },
      onError: (e) => setServerError(isApiError(e) ? e.message : "Payment failed."),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Collect payment</DialogTitle>
          <DialogDescription>
            {member.fullName} · <span className="font-mono">{member.memberNumber}</span>
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((values) => {
            setServerError(null);
            if (amountValue.amount <= 0) {
              form.setError("amount", { message: "Amount must be greater than zero" });
              return;
            }
            if (amountValue.amount > outstanding.amount) {
              form.setError("amount", { message: "Cannot exceed the selected invoice balance" });
              return;
            }
            if (referenceRequired && !values.reference?.trim()) {
              form.setError("reference", { message: "Reference is required for this payment method" });
              return;
            }
            mutation.mutate(values);
          })}
        >
          <DialogBody className="space-y-4">
            {outstanding.amount <= 0 ? (
              <p className="rounded-md border border-line bg-sunken/50 px-3 py-2.5 text-[13px] text-ink-2">
                No outstanding balance — this member is fully paid up.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2.5">
                  <span className="text-[13px] font-medium text-warning-deep">Outstanding balance</span>
                  <MoneyText money={outstanding} className="text-[15px] font-semibold text-warning-deep" />
                </div>
                {charges.length > 1 ? (
                  <Field label="Invoice" required>
                    <Select
                      value={selectedChargeId}
                      onValueChange={(value) => {
                        const charge = charges.find((item) => item.id === value);
                        setSelectedChargeId(value);
                        form.setValue("amount", toMajor(charge?.outstandingAmount ?? member.outstanding).toFixed(3));
                        setServerError(null);
                      }}
                    >
                      <SelectTrigger aria-label="Invoice to collect">
                        <SelectValue placeholder="Select an invoice" />
                      </SelectTrigger>
                      <SelectContent>
                        {charges.map((charge) => (
                          <SelectItem key={charge.id} value={charge.id}>
                            {charge.description} · {toMajor(charge.outstandingAmount).toFixed(3)} JOD due
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Amount (JOD)" required error={form.formState.errors.amount?.message}>
                    <Input inputMode="decimal" autoFocus max={toMajor(outstanding).toFixed(3)} step="0.001" data-testid="payment-amount" {...form.register("amount")} />
                  </Field>
                  <Field label="Method" required>
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
                              <SelectItem key={m.key} value={m.key}>
                                {t(`domain.paymentMethod.${m.key}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>
                </div>
                <Field label="External reference" required={referenceRequired} error={form.formState.errors.reference?.message} hint={referenceRequired ? "Enter the POS slip or provider reference." : "Optional for this payment method."}>
                  <Input {...form.register("reference")} placeholder="e.g. POS-88213" />
                </Field>
                <div className="flex items-center justify-between border-t border-line pt-3 text-[13px]">
                  <span className="text-ink-3">Remaining after this payment</span>
                  <MoneyText money={after} className={after.amount > 0 ? "font-semibold text-warning-deep" : "font-semibold text-success-deep"} />
                </div>
              </>
            )}
          </DialogBody>
          <DialogFooter>
            {serverError ? <p role="alert" className="me-auto text-[12.5px] text-danger">{serverError}</p> : null}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={outstanding.amount <= 0} data-testid="confirm-payment">
              Collect {amountValue.amount > 0 ? `${toMajor(amountValue).toFixed(3)} JOD` : "payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
