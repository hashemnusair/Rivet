"use client";

import { ArrowLeft, Printer, Undo2, XOctagon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { usePermissions } from "@/lib/providers/app-providers";
import { formatDateTime, todayISODate } from "@/lib/utils/dates";
import { money, toMajor } from "@/lib/utils/money";
import { receiptHref } from "@/lib/utils/receipt-links";
import { MoneyText } from "@/components/shared/data-display";
import { PAYMENT_METHOD_LABELS, TransactionStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState, NotFoundState } from "@/components/ui/states";
import { cn } from "@/lib/utils/cn";

export default function ReceiptPageClient({ receiptId: receiptIdProp }: { receiptId?: string } = {}) {
  const { receiptId: paramReceiptId } = useParams<{ receiptId: string }>();
  const receiptId = receiptIdProp ?? paramReceiptId;
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const [refundOpen, setRefundOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const query = useApiQuery(qk.receipt(receiptId), (api) => api.getReceipt(receiptId));

  if (query.isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[480px] w-full" />
      </div>
    );
  }
  if (query.isError) {
    return isApiError(query.error) && query.error.code === "NOT_FOUND" ? (
      <NotFoundState title="Receipt not found" />
    ) : (
      <ErrorState onRetry={() => query.refetch()} />
    );
  }

  const detail = query.data!;
  const { payment, charge } = detail;
  const isRefund = payment.type === "refund";
  const isVoided = payment.status === "voided";
  const canVoid =
    can("payments.void") && !isRefund && !isVoided && payment.status === "completed" && payment.occurredAt.slice(0, 10) <= todayISODate() &&
    // void is same-day only — the API enforces; the UI reflects it
    new Date(payment.occurredAt).toLocaleDateString("en-CA", { timeZone: "Asia/Amman" }) === todayISODate();
  const refundableMinor = payment.amount.amount - (payment.refundedAmount?.amount ?? 0);
  const canRefund = can("payments.refund") && !isRefund && !isVoided && refundableMinor > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/payments">
            <ArrowLeft /> Transactions
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {canRefund ? (
            <Button variant="secondary" size="sm" onClick={() => setRefundOpen(true)} data-testid="refund-button">
              <Undo2 /> Refund…
            </Button>
          ) : null}
          {canVoid ? (
            <Button variant="danger" size="sm" onClick={() => setVoidOpen(true)}>
              <XOctagon /> Void…
            </Button>
          ) : null}
          <Button size="sm" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        {/* The receipt document */}
        <div id="receipt-print" className="panel mx-auto w-full max-w-md px-8 py-8 font-mono text-[12.5px]">
          <div className="flex flex-col items-center border-b border-dashed border-line-3 pb-4 text-center">
            <Image src="/brand/rivet-glyph.png" alt="" width={19} height={30} className="mb-2" />
            <h1 className="font-display text-[17px] font-semibold tracking-tight">{detail.organization.name}</h1>
            <p className="mt-0.5 text-[11px] text-ink-2">
              {detail.branch.name} · {detail.branch.address}
            </p>
            <p className="text-[11px] text-ink-2" dir="ltr">{detail.branch.phone}</p>
          </div>

          <div className="flex justify-between border-b border-dashed border-line-3 py-3 text-[11.5px]">
            <div>
              <p className="text-ink-3">RECEIPT</p>
              <p className="text-[14px] font-semibold">{detail.receipt.receiptNumber}</p>
            </div>
            <div className="text-end">
              <p className="text-ink-3">{formatDateTime(detail.receipt.issuedAt)}</p>
              <p className="mt-0.5 uppercase">{isRefund ? "REFUND" : "PAYMENT"}</p>
            </div>
          </div>

          <div className="border-b border-dashed border-line-3 py-3">
            <p className="text-[13px] font-semibold">{detail.member.fullName}</p>
            <p className="text-[11px] text-ink-2">{detail.member.memberNumber}</p>
          </div>

          <table className="w-full border-b border-dashed border-line-3 py-3 text-[12px]">
            <tbody>
              <tr>
                <td className="py-2 pe-2 align-top">{charge?.description ?? (isRefund ? "Refund" : "Payment")}</td>
                <td className="py-2 text-end align-top tabular">
                  {charge ? toMajor(charge.subtotal).toFixed(3) : toMajor(money(Math.abs(payment.amount.amount))).toFixed(3)}
                </td>
              </tr>
              {charge && charge.discount.amount > 0 ? (
                <tr>
                  <td className="pb-2 text-ink-2">Discount{charge.status ? "" : ""}</td>
                  <td className="pb-2 text-end tabular">−{toMajor(charge.discount).toFixed(3)}</td>
                </tr>
              ) : null}
              {charge ? (
                <tr className="border-t border-line-2">
                  <td className="py-2 font-semibold">Charge total</td>
                  <td className="py-2 text-end font-semibold tabular">{toMajor(charge.total).toFixed(3)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <div className="space-y-1 border-b border-dashed border-line-3 py-3 text-[12px]">
            <div className="flex justify-between">
              <span>{isRefund ? "Refunded" : "Paid"} ({PAYMENT_METHOD_LABELS[payment.method]})</span>
              <span className="tabular">{toMajor(money(Math.abs(payment.amount.amount))).toFixed(3)}</span>
            </div>
            {charge && charge.outstandingAmount.amount > 0 ? (
              <div className="flex justify-between font-semibold">
                <span>Balance remaining</span>
                <span className="tabular">{toMajor(charge.outstandingAmount).toFixed(3)}</span>
              </div>
            ) : null}
          </div>

          <div className="space-y-0.5 py-3 text-[11px] text-ink-2">
            <p>Served by: {payment.collectedByName}</p>
            {payment.externalReference ? <p>Reference: {payment.externalReference}</p> : null}
            {isRefund && payment.refundReason ? <p>Reason: {payment.refundReason}</p> : null}
            {isVoided ? <p className="font-semibold text-danger">VOIDED — {payment.voidReason}</p> : null}
            {payment.status === "refunded" && !isRefund ? <p className="font-semibold">This payment was refunded.</p> : null}
          </div>

          <div className="border-t border-dashed border-line-3 pt-3 text-center">
            <p className="text-[10.5px] leading-relaxed text-ink-2">{detail.organization.receiptFooter}</p>
            <p className="mt-3 font-mono text-[13px] tracking-[0.3em]">{detail.member.memberNumber}</p>
            <p className="mt-1 text-[9.5px] text-ink-3">JOD · amounts in Jordanian Dinar</p>
          </div>
        </div>

        {/* Side panel */}
        <aside className="no-print space-y-4 self-start">
          <section className="panel p-4">
            <h3 className="eyebrow mb-2.5">Status</h3>
            <TransactionStatusChip status={payment.status} />
            {payment.refundedAmount && payment.refundedAmount.amount > 0 ? (
              <p className="mt-2 text-[12.5px] text-ink-2">
                Refunded so far: <MoneyText money={payment.refundedAmount} />
              </p>
            ) : null}
            {payment.originalPaymentId ? (
              <p className="mt-2 text-[12px] text-ink-3">This refund is linked to the original payment.</p>
            ) : null}
          </section>

          {detail.relatedPayments.length > 0 ? (
            <section className="panel p-4">
              <h3 className="eyebrow mb-2.5">Linked records</h3>
              <ul className="space-y-2">
                {detail.relatedPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-[12.5px]">
                    <Link href={receiptHref(p.receiptId)} className="font-mono underline decoration-line-3 underline-offset-2 hover:text-ink">
                      {p.receiptNumber}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="capitalize text-ink-3">{p.type}</span>
                      <MoneyText money={p.amount} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="panel p-4 text-[12.5px] text-ink-2">
            <h3 className="eyebrow mb-2.5">Rules</h3>
            <ul className="list-disc space-y-1.5 ps-4">
              <li>Voids are same-day only and fully reverse the payment.</li>
              <li>Refunds create a linked negative receipt; they never rewrite history.</li>
              <li>Refunds over JOD 25.000 are flagged for manager review.</li>
            </ul>
          </section>
        </aside>
      </div>

      <RefundDialog
        receiptId={receiptId}
        paymentId={payment.id}
        maxMinor={refundableMinor}
        open={refundOpen}
        onOpenChange={setRefundOpen}
        onDone={async () => {
          setRefundOpen(false);
          toast.success("Refund issued — linked to the original payment.");
          await invalidate();
        }}
      />
      <VoidDialog
        paymentId={payment.id}
        open={voidOpen}
        onOpenChange={setVoidOpen}
        onDone={async () => {
          setVoidOpen(false);
          toast.success("Payment voided.");
          await invalidate();
        }}
      />
    </div>
  );
}

function RefundDialog({
  receiptId,
  paymentId,
  maxMinor,
  open,
  onOpenChange,
  onDone,
}: {
  receiptId: string;
  paymentId: string;
  maxMinor: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  void receiptId;

  const mutation = useApiMutation(
    (api) =>
      api.refundPayment(paymentId, {
        amount: amount ? money(Math.round(Number(amount) * 1000)) : undefined,
        reason,
      }),
    {
      onSuccess: () => onDone(),
      onError: (e) => setError(isApiError(e) ? e.message : "Refund failed."),
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
          <DialogDescription>
            Creates a separate negative receipt linked to this one. The original payment is never rewritten.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex justify-between rounded-md border border-line bg-sunken/50 px-3 py-2.5 text-[13px]">
            <span className="text-ink-2">Refundable remaining</span>
            <MoneyText money={money(maxMinor)} className="font-semibold" />
          </div>
          <Field label="Amount (JOD)" hint={`Leave empty to refund the full ${toMajor(money(maxMinor)).toFixed(3)}.`}>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={toMajor(money(maxMinor)).toFixed(3)} data-testid="refund-amount" />
          </Field>
          <Field label="Reason" required>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Duplicate charge confirmed with the bank" data-testid="refund-reason" />
          </Field>
          {Number(amount) * 1000 > 25_000 || (!amount && maxMinor > 25_000) ? (
            <p className="rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2 text-[12.5px] text-warning-deep">
              Refunds above JOD 25.000 are flagged for manager review in the audit log.
            </p>
          ) : null}
          {error ? <p role="alert" className="text-[12.5px] text-danger">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="signal" disabled={reason.trim().length < 5} loading={mutation.isPending} onClick={() => mutation.mutate()} data-testid="confirm-refund">
            Issue refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoidDialog({
  paymentId,
  open,
  onOpenChange,
  onDone,
}: {
  paymentId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useApiMutation((api) => api.voidPayment(paymentId, { reason }), {
    onSuccess: () => onDone(),
    onError: (e) => setError(isApiError(e) ? e.message : "Void failed."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void payment</DialogTitle>
          <DialogDescription>
            Same-day correction: the payment is marked void and fully reversed. Use a refund for anything older.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className={cn("rounded-md border border-danger/30 bg-danger-bg/50 px-3 py-2.5 text-[13px] text-danger")}>
            This is audited with your name attached and cannot be undone.
          </div>
          <Field label="Reason" required>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong amount keyed at the terminal" />
          </Field>
          {error ? <p role="alert" className="text-[12.5px] text-danger">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="signal" disabled={reason.trim().length < 5} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Void payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
