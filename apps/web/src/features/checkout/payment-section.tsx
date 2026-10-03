"use client";
import { useT } from "@/lib/i18n/provider";

import { useFormat } from "@/lib/i18n/format";
import { isolate } from "@/lib/i18n/bidi";
import Link from "next/link";
import type { CashShift } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CHECKOUT_PAYMENT_METHODS, checkoutPaymentMethodLabel, type CheckoutPaymentMethod } from "./checkout-model";

export interface CashShiftStatus {
  /** Whether the client could ask; sales staff without shift permission rely on the server. */
  known: boolean;
  loading: boolean;
  error?: unknown;
  shift: CashShift | null;
  onRetry: () => void;
}

export function PaymentSection({ method, onMethod, enabledMethods, reference, onReference, cashShift, branchName }: { method: CheckoutPaymentMethod; onMethod: (method: CheckoutPaymentMethod) => void; enabledMethods: Set<CheckoutPaymentMethod>; reference: string; onReference: (value: string) => void; cashShift: CashShiftStatus; branchName?: string }) {
  const t = useT();
  const f = useFormat();
  return (
    <section className="panel p-4" aria-labelledby="payment-heading" data-testid="payment-section">
      <h2 id="payment-heading" className="text-[15px] font-semibold">{t("members.tabs.membershipColumns.payment")}</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("renewFlow.shared.paymentMethodAria")}>
        {CHECKOUT_PAYMENT_METHODS.map((value) => {
          const enabled = enabledMethods.has(value);
          return (
            <label key={value} className={cn("flex min-h-11 items-center gap-2 rounded-md border px-3 py-2.5 text-[13px]", enabled ? "cursor-pointer" : "cursor-not-allowed opacity-50", method === value ? "border-ink bg-sunken/60" : enabled ? "border-line-2 hover:border-line-3" : "border-line-2")}>
              <input type="radio" name="checkout-payment-method" value={value} checked={method === value} disabled={!enabled} onChange={() => onMethod(value)} className="size-4" />
              {checkoutPaymentMethodLabel(t, value)}
            </label>
          );
        })}
      </div>
      {method === "cliq" || method === "card" ? (
        <Field className="mt-3" label={t("salesWorkspace.referenceLabel", { method: checkoutPaymentMethodLabel(t, method) })} required hint={t("salesWorkspace.referenceHint")}>
          <Input value={reference} onChange={(event) => onReference(event.target.value)} placeholder={t("renewFlow.shared.referenceNumber")} dir="ltr" required className="h-11 sm:h-9" />
        </Field>
      ) : cashShift.known ? (
        cashShift.loading ? <p role="status" className="mt-3 text-[12px] text-ink-3">{t("salesWorkspace.checkingShift")}</p>
          : cashShift.error ? <p role="alert" className="mt-3 rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2 text-[12.5px] text-warning-deep">{t("salesWorkspace.checkShiftFailed")}{" "}<button type="button" className="font-medium underline" onClick={cashShift.onRetry}>{t("common.action.retry")}</button>{t("members.bulk.toast.end")}</p>
            : cashShift.shift ? <p role="status" className="mt-3 text-[12px] text-ink-3">{t(branchName ? "salesWorkspace.cashGoesBranch" : "salesWorkspace.cashGoes", { branch: isolate(branchName ?? ""), name: isolate(cashShift.shift.openedByName), date: isolate(f.dateTime(cashShift.shift.openedAt)) })}</p>
              : <p role="alert" className="mt-3 rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2 text-[12.5px] text-warning-deep" data-testid="no-open-shift">{t(branchName ? "salesWorkspace.noCashShiftBranch" : "salesWorkspace.noCashShift", { branch: isolate(branchName ?? "") })}{" "}<Link href="/payments/shifts" className="font-medium underline">{t("salesWorkspace.openShift")}</Link> {" "}{" "}{t("salesWorkspace.noShiftHint")}</p>
      ) : <p className="mt-3 text-[12px] text-ink-3">{t("salesWorkspace.needsShift")}</p>}
    </section>
  );
}
