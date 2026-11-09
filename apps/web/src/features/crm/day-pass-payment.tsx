"use client";

import { Banknote, Receipt } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MoneyText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioCard, RadioGroup } from "@/components/ui/radio-group";
import { DAY_PASS_LIMITS, dayPassAwaitsPayment } from "@/lib/domain/day-pass";
import type { DayPassPaymentMethod, LeadTrialBooking } from "@/lib/domain/types";
import { useApiMutation, useInvalidate } from "@/lib/hooks/use-api";
import { useT } from "@/lib/i18n/provider";

/**
 * A day pass on the lead page: its price, how the visitor said they would
 * pay, and whether the gym has recorded the payment (with its receipt).
 */
export function DayPassFacts({ booking }: { booking: LeadTrialBooking }) {
  const t = useT();
  const paid = booking.paymentStatus === "paid";
  return (
    <div className="mt-3" data-testid="day-pass-facts">
      <dl className="space-y-1.5 text-[12.5px]">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-3">{t("crmCompletion.dayPass.price")}</dt>
          <dd>{booking.price ? <MoneyText money={booking.price} className="font-semibold" /> : "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-ink-3">{t("crmCompletion.dayPass.payment")}</dt>
          <dd className="flex items-center gap-2">
            <span className="text-ink-2">{booking.paymentMethod === "cliq" ? t("crmCompletion.dayPass.cliq") : t("crmCompletion.dayPass.cashAtDesk")}</span>
            <Badge variant={paid ? "success" : "warning"}>{paid ? t("crmCompletion.dayPass.paid") : t("crmCompletion.dayPass.unpaid")}</Badge>
          </dd>
        </div>
        {booking.cliqReference ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-3">{t("crmCompletion.dayPass.reference")}</dt>
            <dd><bdi dir="ltr" className="font-mono">{booking.cliqReference}</bdi></dd>
          </div>
        ) : null}
      </dl>
      {!paid && dayPassAwaitsPayment(booking) ? (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-3">{booking.paymentMethod === "cliq" ? t("crmCompletion.dayPass.cliqHint") : t("crmCompletion.dayPass.cashHint")}</p>
      ) : null}
      {paid && booking.receiptId ? (
        <Link href={`/payments/receipts/${booking.receiptId}`} className="mt-2 inline-flex min-h-8 items-center gap-1.5 text-[12.5px] font-medium text-ink underline underline-offset-4"><Receipt className="size-3.5" aria-hidden />{t("crmCompletion.dayPass.viewReceipt")}</Link>
      ) : null}
    </div>
  );
}

/**
 * Records the payment the gym received: CliQ it saw in its bank app (with the
 * transfer reference) or cash at the desk (into the open shift). The server
 * sells the "Day pass" plan to the visitor at the booked price.
 */
export function RecordDayPassPaymentDialog({ booking, open, onOpenChange }: { booking: LeadTrialBooking; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const invalidate = useInvalidate();
  const [method, setMethod] = useState<DayPassPaymentMethod>(booking.paymentMethod ?? "cash");
  const [reference, setReference] = useState(booking.cliqReference ?? "");
  const [gender, setGender] = useState<"male" | "female">();
  const keyRef = useRef<string | undefined>(undefined);

  const record = useApiMutation(
    (api) => {
      const idempotencyKey = keyRef.current ?? (keyRef.current = crypto.randomUUID());
      return api.collectDayPassPayment(booking.id, { method, externalReference: method === "cliq" ? reference.trim() : undefined, gender, idempotencyKey });
    },
    {
      onSuccess: async () => {
        toast.success(t("crmCompletion.dayPass.recorded"));
        keyRef.current = undefined;
        onOpenChange(false);
        await invalidate();
      },
    },
  );
  const { reset } = record;
  useEffect(() => {
    if (!open) return;
    setMethod(booking.paymentMethod ?? "cash");
    setReference(booking.cliqReference ?? "");
    setGender(undefined);
    keyRef.current = undefined;
    reset();
  }, [booking.cliqReference, booking.paymentMethod, open, reset]);

  const referenceMissing = method === "cliq" && reference.trim().length === 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("crmCompletion.dayPass.recordTitle")}</DialogTitle>
          <DialogDescription>{t("crmCompletion.dayPass.recordDescription")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-line bg-sunken/60 px-3 py-2.5 text-[13px]">
            <span className="text-ink-2">{t("crmCompletion.dayPass.amount")}</span>
            {booking.price ? <MoneyText money={booking.price} className="text-[15px] font-semibold" /> : null}
          </div>
          <fieldset>
            <legend className="mb-2 text-[12.5px] font-medium text-ink-2">{t("crmCompletion.dayPass.method")}</legend>
            <RadioGroup value={method} onValueChange={(value) => setMethod(value === "cliq" ? "cliq" : "cash")} className="grid grid-cols-2 gap-2">
              <RadioCard value="cliq" data-testid="day-pass-method-cliq"><span className="text-[13px] font-semibold">{t("crmCompletion.dayPass.cliq")}</span></RadioCard>
              <RadioCard value="cash" data-testid="day-pass-method-cash"><span className="text-[13px] font-semibold">{t("crmCompletion.dayPass.cash")}</span></RadioCard>
            </RadioGroup>
          </fieldset>
          {method === "cliq" ? (
            <Field label={t("crmCompletion.dayPass.referenceLabel")} htmlFor="day-pass-reference" required hint={t("crmCompletion.dayPass.referenceHint")}>
              <Input id="day-pass-reference" dir="ltr" autoComplete="off" maxLength={DAY_PASS_LIMITS.cliqReference} value={reference} onChange={(event) => setReference(event.target.value)} />
            </Field>
          ) : (
            <p className="text-[12.5px] text-ink-3">{t("crmCompletion.dayPass.cashDrawer")}</p>
          )}
          <fieldset>
            <legend className="mb-2 text-[12.5px] font-medium text-ink-2">{t("crmCompletion.dayPass.gender")}</legend>
            <RadioGroup value={gender ?? ""} onValueChange={(value) => setGender(value === "female" ? "female" : "male")} className="grid grid-cols-2 gap-2">
              <RadioCard value="male"><span className="text-[13px] font-semibold">{t("crmCompletion.dayPass.male")}</span></RadioCard>
              <RadioCard value="female"><span className="text-[13px] font-semibold">{t("crmCompletion.dayPass.female")}</span></RadioCard>
            </RadioGroup>
            <p className="mt-1.5 text-[12px] text-ink-3">{t("crmCompletion.dayPass.genderHint")}</p>
          </fieldset>
          {/* The toast fades; a refused payment (no open shift, a missing gender) stays in view. */}
          {record.error ? <p role="alert" className="text-[12.5px] text-danger">{record.error.message}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.back")}</Button>
          <Button data-testid="confirm-day-pass-payment" disabled={referenceMissing} loading={record.isPending} onClick={() => record.mutate()}><Banknote />{" "}{t("crmCompletion.dayPass.recordConfirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
