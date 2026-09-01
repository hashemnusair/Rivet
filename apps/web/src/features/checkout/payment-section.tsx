"use client";

import Link from "next/link";
import type { CashShift } from "@/lib/domain/types";
import { cn } from "@/lib/utils/cn";
import { DateTimeText } from "@/components/shared/data-display";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CHECKOUT_PAYMENT_METHODS, CHECKOUT_PAYMENT_METHOD_LABELS, type CheckoutPaymentMethod } from "./checkout-model";

export interface CashShiftStatus {
  /** Whether the client could ask; sales staff without shift permission rely on the server. */
  known: boolean;
  loading: boolean;
  error?: unknown;
  shift: CashShift | null;
  onRetry: () => void;
}

export function PaymentSection({ method, onMethod, enabledMethods, reference, onReference, cashShift, branchName }: { method: CheckoutPaymentMethod; onMethod: (method: CheckoutPaymentMethod) => void; enabledMethods: Set<CheckoutPaymentMethod>; reference: string; onReference: (value: string) => void; cashShift: CashShiftStatus; branchName?: string }) {
  return (
    <section className="panel p-4" aria-labelledby="payment-heading" data-testid="payment-section">
      <h2 id="payment-heading" className="text-[15px] font-semibold">Payment</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Payment method">
        {CHECKOUT_PAYMENT_METHODS.map((value) => {
          const enabled = enabledMethods.has(value);
          return (
            <label key={value} className={cn("flex min-h-11 items-center gap-2 rounded-md border px-3 py-2.5 text-[13px]", enabled ? "cursor-pointer" : "cursor-not-allowed opacity-50", method === value ? "border-ink bg-sunken/60" : enabled ? "border-line-2 hover:border-line-3" : "border-line-2")}>
              <input type="radio" name="checkout-payment-method" value={value} checked={method === value} disabled={!enabled} onChange={() => onMethod(value)} className="size-4" />
              {CHECKOUT_PAYMENT_METHOD_LABELS[value]}
            </label>
          );
        })}
      </div>
      {method === "cliq" || method === "card" ? (
        <Field className="mt-3" label={`${CHECKOUT_PAYMENT_METHOD_LABELS[method]} reference`} required hint="Type the transaction reference as shown on the terminal or app. RIVET records it; it does not verify it.">
          <Input value={reference} onChange={(event) => onReference(event.target.value)} placeholder="Reference number" dir="ltr" required className="h-11 sm:h-9" />
        </Field>
      ) : cashShift.known ? (
        cashShift.loading ? <p role="status" className="mt-3 text-[12px] text-ink-3">Checking the cash shift…</p>
          : cashShift.error ? <p role="alert" className="mt-3 rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2 text-[12.5px] text-warning-deep">The cash shift could not be checked. <button type="button" className="font-medium underline" onClick={cashShift.onRetry}>Try again</button>. The sale is still protected by the server.</p>
            : cashShift.shift ? <p role="status" className="mt-3 text-[12px] text-ink-3">Cash goes into the open shift{branchName ? ` at ${branchName}` : ""} (opened by {cashShift.shift.openedByName}, <DateTimeText iso={cashShift.shift.openedAt} />).</p>
              : <p role="alert" className="mt-3 rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2 text-[12.5px] text-warning-deep" data-testid="no-open-shift">No cash shift is open{branchName ? ` at ${branchName}` : ""}. <Link href="/payments/shifts" className="font-medium underline">Open a shift</Link> before taking cash, or choose CliQ or card.</p>
      ) : <p className="mt-3 text-[12px] text-ink-3">Cash is counted in the branch’s open shift; the server refuses cash sales when no shift is open.</p>}
    </section>
  );
}
