"use client";

import { ArrowLeft, Printer, Undo2, XOctagon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { usePermissions } from "@/lib/providers/app-providers";
import { todayISODate } from "@/lib/utils/dates";
import { currencyDisplayName, money, readMoneyInput, toMajorString } from "@/lib/utils/money";
import { receiptHref } from "@/lib/utils/receipt-links";
import { useFormat } from "@/lib/i18n/format";
import { paymentMethodLabel as paymentMethodName, transactionTypeLabel } from "@/lib/i18n/labels";
import { useLocale } from "@/lib/i18n/provider";
import { useAmountText, useMoneyProblemText } from "@/features/membership-actions/renew-flow-format";
import { MoneyText } from "@/components/shared/data-display";
import { TransactionStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState, NotFoundState } from "@/components/ui/states";
import { cn } from "@/lib/utils/cn";
import type { Payment, RetailSale } from "@/lib/domain/types";

export default function ReceiptPageClient({ receiptId: receiptIdProp }: { receiptId?: string } = {}) {
  const { receiptId: paramReceiptId } = useParams<{ receiptId: string }>();
  const receiptId = receiptIdProp ?? paramReceiptId;
  const { can } = usePermissions();
  const { t, locale, isolate, isolateLtr } = useLocale();
  const format = useFormat();
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
      <NotFoundState title={t("renewFlow.receipt.notFound")} />
    ) : (
      <ErrorState onRetry={() => query.refetch()} />
    );
  }

  const detail = query.data!;
  const retailSale = detail.retailSale;
  const { payment, charge } = detail;
  const paymentRecord: Payment | undefined = payment.type !== "retail_sale" ? payment : undefined;
  const isRetailSale = Boolean(retailSale?.lines?.length);
  const retailCustomer = detail.customer ?? retailSale?.customer;
  const memberSnapshot = detail.member;
  const customerName = retailCustomer?.fullName ?? memberSnapshot?.fullName ?? t("renewFlow.receipt.walkInCustomer");
  const customerIdentifier = retailCustomer?.memberNumber ?? retailCustomer?.phone ?? memberSnapshot?.memberNumber;
  const customerReference = customerIdentifier ?? t("renewFlow.receipt.retailSaleReference");
  const retailTotal = retailSale?.total ?? retailSale?.subtotal;
  const paymentMethodLabel = isRetailSale && payment.method === "card" ? t("renewFlow.receipt.visaCard") : paymentMethodName(t, payment.method);
  const isRefund = payment.type === "refund";
  const displayedPaymentAmount = isRefund ? { ...payment.amount, amount: Math.abs(payment.amount.amount) } : retailTotal ?? payment.amount;
  const isVoided = payment.status === "voided";
  const currency = payment.amount.currency;
  const refundedSoFar = paymentRecord?.refundedAmount?.amount ? paymentRecord.refundedAmount : retailSale?.refundedAmount?.amount ? retailSale.refundedAmount : undefined;
  const canVoid =
    can("payments.void") && !isRetailSale && !isRefund && !isVoided && payment.status === "completed" && payment.occurredAt.slice(0, 10) <= todayISODate() &&
    // void is same-day only — the API enforces; the UI reflects it
    new Date(payment.occurredAt).toLocaleDateString("en-CA", { timeZone: "Asia/Amman" }) === todayISODate();
  const refundableMinor = payment.amount.amount - (paymentRecord?.refundedAmount?.amount ?? 0);
  const canRefund = can("payments.refund") && !isRetailSale && !isRefund && !isVoided && refundableMinor > 0;
  const retailRefundable = retailSale ? retailSale.total.amount - (retailSale.refundedAmount?.amount ?? 0) : 0;
  const retailSameDay = retailSale ? new Date(retailSale.createdAt).toLocaleDateString("en-CA", { timeZone: "Asia/Amman" }) === todayISODate() : false;
  const canRetailRefund = can("payments.refund") && Boolean(retailSale) && retailSale?.status !== "voided" && retailSale?.status !== "refunded" && retailRefundable > 0;
  const canRetailVoid = can("payments.void") && retailSale?.status === "completed" && retailSameDay;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/payments">
            <ArrowLeft /> {t("renewFlow.receipt.back")}
          </Link>
        </Button>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          {isRetailSale ? (
            <Button asChild variant="secondary" size="sm">
              <Link href="/checkout">{t("renewFlow.receipt.newSale")}</Link>
            </Button>
          ) : null}
          {canRefund ? (
            <Button variant="secondary" size="sm" onClick={() => setRefundOpen(true)} data-testid="refund-button">
              <Undo2 /> {t("renewFlow.receipt.refundButton")}
            </Button>
          ) : null}
          {canRetailRefund ? (
            <Button variant="secondary" size="sm" onClick={() => setRefundOpen(true)} data-testid="retail-refund-button">
              <Undo2 /> {t("renewFlow.receipt.retailRefundButton")}
            </Button>
          ) : null}
          {canVoid ? (
            <Button variant="danger" size="sm" onClick={() => setVoidOpen(true)}>
              <XOctagon /> {t("renewFlow.receipt.cancelPaymentButton")}
            </Button>
          ) : null}
          {canRetailVoid ? (
            <Button variant="danger" size="sm" onClick={() => setVoidOpen(true)} data-testid="retail-void-button">
              <XOctagon /> {t("renewFlow.receipt.cancelSaleButton")}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => window.print()}>
            <Printer /> {t("common.action.print")}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        {/* The receipt document */}
        <div id="receipt-print" className="panel mx-auto w-full max-w-md px-5 py-6 font-mono text-[12.5px] sm:px-8 sm:py-8">
          <div className="flex flex-col items-center border-b border-dashed border-line-3 pb-4 text-center">
            <Image src="/brand/rivet-glyph.png" alt="" width={19} height={30} className="mb-2" />
            <h1 className="font-display text-[17px] font-semibold tracking-tight"><bdi>{detail.organization.name}</bdi></h1>
            <p className="mt-0.5 text-[12px] text-ink-2">
              <bdi>{detail.branch.name}</bdi> · <bdi>{detail.branch.address}</bdi>
            </p>
            <p className="text-[12px] text-ink-2" dir="ltr">{detail.branch.phone}</p>
          </div>

          <div className="flex justify-between border-b border-dashed border-line-3 py-3 text-[12px]">
            <div>
              <p className="text-ink-3">{t("renewFlow.receipt.heading")}</p>
              <p className="text-[14px] font-semibold" dir="ltr">{detail.receipt.receiptNumber}</p>
            </div>
            <div className="text-end">
              <p className="text-ink-3"><bdi>{format.dateTime(detail.receipt.issuedAt)}</bdi></p>
            <p className="mt-0.5 uppercase">{isRefund ? t("renewFlow.receipt.kindRefund") : isRetailSale ? t("renewFlow.receipt.kindRetail") : t("renewFlow.receipt.kindPayment")}</p>
            </div>
          </div>

          <div className="border-b border-dashed border-line-3 py-3">
            <p className="text-[13px] font-semibold"><bdi>{customerName}</bdi></p>
            <p className="text-[12px] text-ink-2"><bdi>{retailCustomer?.memberNumber ? t("renewFlow.receipt.memberNumber", { number: isolateLtr(retailCustomer.memberNumber) }) : retailCustomer?.phone ?? memberSnapshot?.memberNumber ?? (retailCustomer?.kind === "guest" ? t("renewFlow.receipt.guestSale") : t("renewFlow.receipt.walkInSale"))}</bdi></p>
          </div>

          <table className="w-full border-b border-dashed border-line-3 py-3 text-[12px]">
            <tbody>
              {isRetailSale && !isRefund ? retailSale!.lines.map((line, index) => {
                const lineTotal = line.lineTotal;
                return (
                  <tr key={`${line.sku}-${index}`}>
                    <td className="py-2 pe-2 align-top"><bdi>{line.productName}</bdi> × {line.quantity}</td>
                    <td className="py-2 text-end align-top tabular"><span dir="ltr">
                      {toMajorString(lineTotal)}
                    </span></td>
                  </tr>
                );
              }) : (
                <tr>
                  <td className="py-2 pe-2 align-top">{charge?.description ? <bdi>{charge.description}</bdi> : isRefund ? t("domain.transactionType.refund") : t("domain.transactionType.payment")}</td>
                  <td className="py-2 text-end align-top tabular"><span dir="ltr">
                    {charge ? toMajorString(charge.subtotal) : toMajorString({ ...payment.amount, amount: Math.abs(payment.amount.amount) })}
                  </span></td>
                </tr>
              )}
              {charge && charge.discount.amount > 0 ? (
                <tr>
                  <td className="pb-2 text-ink-2">{t("renewFlow.receipt.discount")}</td>
                  <td className="pb-2 text-end tabular"><span dir="ltr">−{toMajorString(charge.discount)}</span></td>
                </tr>
              ) : null}
              {isRetailSale && !isRefund ? (
                <tr className="border-t border-line-2">
                  <td className="py-2 font-semibold">{t("renewFlow.receipt.saleTotal")}</td>
                  <td className="py-2 text-end font-semibold tabular"><span dir="ltr">{retailTotal ? toMajorString(retailTotal) : toMajorString({ ...payment.amount, amount: Math.abs(payment.amount.amount) })}</span></td>
                </tr>
              ) : charge ? (
                <tr className="border-t border-line-2">
                  <td className="py-2 font-semibold">{t("common.label.total")}</td>
                  <td className="py-2 text-end font-semibold tabular"><span dir="ltr">{toMajorString(charge.total)}</span></td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <div className="space-y-1 border-b border-dashed border-line-3 py-3 text-[12px]">
            <div className="flex justify-between">
              <span>{isRefund ? t("renewFlow.receipt.refundedVia", { method: paymentMethodLabel }) : t("renewFlow.receipt.paidVia", { method: paymentMethodLabel })}</span>
              <span className="tabular" dir="ltr">{toMajorString(displayedPaymentAmount)}</span>
            </div>
            {charge && charge.outstandingAmount.amount > 0 ? (
              <div className="flex justify-between font-semibold">
                <span>{t("renewFlow.receipt.stillOwed")}</span>
                <span className="tabular" dir="ltr">{toMajorString(charge.outstandingAmount)}</span>
              </div>
            ) : null}
          </div>

          <div className="space-y-0.5 py-3 text-[12px] text-ink-2">
            <p>{t("renewFlow.receipt.servedBy", { name: isolate(payment.collectedByName) })}</p>
            {payment.externalReference ? <p>{t("renewFlow.receipt.reference", { reference: isolateLtr(payment.externalReference) })}</p> : null}
            {isRefund && paymentRecord?.refundReason ? <p>{t("renewFlow.receipt.reason", { reason: isolate(paymentRecord.refundReason) })}</p> : null}
            {isVoided ? <p className="font-semibold text-danger">{payment.voidReason ? t("renewFlow.receipt.cancelledWithReason", { reason: isolate(payment.voidReason) }) : t("renewFlow.receipt.cancelled")}</p> : null}
            {payment.status === "refunded" && !isRefund ? <p className="font-semibold">{t(isRetailSale ? (refundedSoFar ? "renewFlow.receipt.fullyRefundedSaleAmount" : "renewFlow.receipt.fullyRefundedSale") : (refundedSoFar ? "renewFlow.receipt.fullyRefundedPaymentAmount" : "renewFlow.receipt.fullyRefundedPayment"), { amount: refundedSoFar ? isolateLtr(toMajorString(refundedSoFar)) : "" })}</p> : null}
            {payment.status === "partially_refunded" && !isRefund && refundedSoFar ? <p className="font-semibold">{t("renewFlow.receipt.partRefunded", { amount: isolateLtr(toMajorString(refundedSoFar)) })}</p> : null}
          </div>

          <div className="border-t border-dashed border-line-3 pt-3 text-center">
            <p className="text-[12px] leading-relaxed text-ink-2">{detail.organization.receiptFooter}</p>
            <p className={cn("mt-3 font-mono text-[13px] tracking-[0.3em]", !customerIdentifier && "rtl:tracking-normal")} dir={customerIdentifier ? "ltr" : "auto"}>{customerReference}</p>
            <p className="mt-1 text-[12px] text-ink-3">{t("renewFlow.receipt.currencyFooter", { currency: isolateLtr(currency), name: currencyDisplayName(currency, locale) })}</p>
          </div>
        </div>

        {/* Side panel */}
        <aside className="no-print space-y-4 self-start">
          <section className="panel p-4">
            <h3 className="mb-2.5 text-[13px] font-semibold">{t("renewFlow.receipt.statusTitle")}</h3>
            <TransactionStatusChip status={payment.status} />
            {paymentRecord?.refundedAmount && paymentRecord.refundedAmount.amount > 0 ? (
              <p className="mt-2 text-[12.5px] text-ink-2">
                {t("renewFlow.receipt.refundedSoFar")} <MoneyText money={paymentRecord.refundedAmount} />
              </p>
            ) : null}
            {retailSale?.refundedAmount && retailSale.refundedAmount.amount > 0 ? (
              <p className="mt-2 text-[12.5px] text-ink-2">
                {t("renewFlow.receipt.refundedSoFar")} <MoneyText money={retailSale.refundedAmount} />
              </p>
            ) : null}
            {retailSale?.voidReason ? <p className="mt-2 text-[12px] text-danger">{t("renewFlow.receipt.cancelReason", { reason: isolate(retailSale.voidReason) })}</p> : null}
            {paymentRecord?.originalPaymentId ? (
              <p className="mt-2 text-[12px] text-ink-3">{t("renewFlow.receipt.refundOfEarlier")}</p>
            ) : null}
          </section>

          {detail.relatedPayments?.length > 0 ? (
            <section className="panel p-4">
              <h3 className="mb-2.5 text-[13px] font-semibold">{t("renewFlow.receipt.relatedTitle")}</h3>
              <ul className="space-y-2">
                {detail.relatedPayments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-[12.5px]">
                    <Link href={receiptHref(p.receiptId)} dir="ltr" className="font-mono underline decoration-line-3 underline-offset-2 hover:text-ink">
                      {p.receiptNumber}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="text-ink-3">{transactionTypeLabel(t, p.type)}</span>
                      <MoneyText money={p.amount} />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="panel p-4 text-[12.5px] text-ink-2">
            <h3 className="mb-2.5 text-[13px] font-semibold">{t("renewFlow.receipt.guideTitle")}</h3>
            <ul className="list-disc space-y-1.5 ps-4">
              <li>{t("renewFlow.receipt.guideCancel")}</li>
              <li>{t("renewFlow.receipt.guideRefund")}</li>
              <li>{t("renewFlow.receipt.guideReview", { amount: isolateLtr("JOD 25.000") })}</li>
            </ul>
          </section>
        </aside>
      </div>

      {retailSale ? <RetailRefundDialog
        sale={retailSale}
        open={refundOpen}
        onOpenChange={setRefundOpen}
        onDone={async () => {
          setRefundOpen(false);
          toast.success(t("renewFlow.receipt.toastRetailRefunded"));
          await invalidate();
        }}
      /> : <RefundDialog
        receiptId={receiptId}
        paymentId={payment.id}
        maxMinor={refundableMinor}
        currency={currency}
        open={refundOpen}
        onOpenChange={setRefundOpen}
        onDone={async () => {
          setRefundOpen(false);
          toast.success(t("renewFlow.receipt.toastRefunded"));
          await invalidate();
        }}
      />}
      <VoidDialog
        paymentId={payment.id}
        retailSaleId={retailSale?.id}
        open={voidOpen}
        onOpenChange={setVoidOpen}
        onDone={async () => {
          setVoidOpen(false);
          toast.success(retailSale ? t("renewFlow.receipt.toastSaleCancelled") : t("renewFlow.receipt.toastPaymentCancelled"));
          await invalidate();
        }}
      />
    </div>
  );
}

function RetailRefundDialog({
  sale,
  open,
  onOpenChange,
  onDone,
}: {
  sale: RetailSale;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t, isolate, isolateLtr } = useLocale();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const returned = new Map((sale.returnedLines ?? []).map((line) => [line.productId, line.quantity]));
  const lines = sale.lines.map((line) => ({ ...line, remaining: line.quantity - (returned.get(line.productId) ?? 0) })).filter((line) => line.remaining > 0);
  const selected = lines.map((line) => ({ productId: line.productId, quantity: quantities[line.productId] ?? 0 })).filter((line) => line.quantity > 0);
  const refundMinor = selected.reduce((sum, line) => sum + sale.lines.find((candidate) => candidate.productId === line.productId)!.unitPrice.amount * line.quantity, 0);

  const mutation = useApiMutation((api) => api.refundRetailSale(sale.id, { lines: selected, reason, idempotencyKey }), {
    onSuccess: () => {
      setQuantities({});
      setReason("");
      setIdempotencyKey(crypto.randomUUID());
      onDone();
    },
    onError: (e) => setError(isApiError(e) ? e.message : t("renewFlow.receipt.retailRefund.saveFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && mutation.isPending) return; onOpenChange(next); }}>
      <DialogContent aria-busy={mutation.isPending || undefined}>
        <DialogHeader>
          <DialogTitle>{t("renewFlow.receipt.retailRefund.title")}</DialogTitle>
          <DialogDescription>{t("renewFlow.receipt.retailRefund.description")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-2" aria-label={t("renewFlow.receipt.retailRefund.quantitiesAria")}>
            {lines.map((line) => (
              <div key={line.productId} className="grid grid-cols-[1fr_88px] items-center gap-3 rounded-md border border-line px-3 py-2.5">
                <div>
                  <p className="text-[13px] font-medium"><bdi>{line.productName}</bdi></p>
                  <p className="text-[12px] text-ink-3">{t("renewFlow.receipt.retailRefund.upTo", { remaining: line.remaining, price: isolateLtr(toMajorString(line.unitPrice)) })}</p>
                </div>
                <Input
                  aria-label={t("renewFlow.receipt.retailRefund.quantityAria", { name: isolate(line.productName) })}
                  type="number"
                  dir="ltr"
                  min={0}
                  max={line.remaining}
                  step={1}
                  value={quantities[line.productId] ?? 0}
                  onChange={(event) => setQuantities((current) => ({ ...current, [line.productId]: Math.min(line.remaining, Math.max(0, Math.trunc(Number(event.target.value) || 0))) }))}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between rounded-md border border-line bg-sunken/50 px-3 py-2.5 text-[13px]">
            <span className="text-ink-2">{t("renewFlow.receipt.retailRefund.refundTotal")}</span>
            <MoneyText money={money(refundMinor)} className="font-semibold" />
          </div>
          <Field label={t("common.label.reason")} required>
            <Textarea dir="auto" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("renewFlow.receipt.retailRefund.reasonPlaceholder")} data-testid="retail-refund-reason" />
          </Field>
          {error ? <p role="alert" className="text-[12.5px] text-danger">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>{t("common.action.cancel")}</Button>
          <Button variant="signal" disabled={selected.length === 0 || reason.trim().length < 5} loading={mutation.isPending} onClick={() => mutation.mutate()} data-testid="confirm-retail-refund">{t("renewFlow.receipt.retailRefund.submit")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({
  receiptId,
  paymentId,
  maxMinor,
  currency,
  open,
  onOpenChange,
  onDone,
}: {
  receiptId: string;
  paymentId: string;
  maxMinor: number;
  currency: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t, isolateLtr } = useLocale();
  const amountText = useAmountText();
  const moneyProblemText = useMoneyProblemText();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  void receiptId;
  const refundable = money(maxMinor, currency);
  const amountRead = amount.trim() ? readMoneyInput(amount, currency) : undefined;
  const requestedMinor = amountRead?.ok ? amountRead.money.amount : amount.trim() ? undefined : maxMinor;
  const reviewFlagged = requestedMinor !== undefined && requestedMinor > 25_000;

  // The dialog stays mounted between refunds, so each opening starts from a
  // clean draft. One idempotency key per distinct draft and per opening: a
  // retry after a lost response replays the same refund, while a second
  // refund with the same figures is a new request rather than a silent replay.
  useEffect(() => {
    if (!open) return;
    setAmount("");
    setReason("");
    setError(null);
    setAmountError(null);
    setAttempt((current) => current + 1);
  }, [open]);
  const draftSignature = JSON.stringify({ attempt, paymentId, amount: amountRead?.ok ? amountRead.money.amount : amount.trim(), reason: reason.trim() });
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [draftSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useApiMutation(
    (api) =>
      api.refundPayment(paymentId, {
        amount: amountRead?.ok ? amountRead.money : undefined,
        reason,
        idempotencyKey,
      }),
    {
      onSuccess: () => onDone(),
      onError: (e) => setError(isApiError(e) ? e.message : t("renewFlow.receipt.refund.saveFailed")),
    },
  );

  const submit = () => {
    setError(null);
    if (amountRead && !amountRead.ok) {
      setAmountError(moneyProblemText(amountRead, currency));
      return;
    }
    if (amountRead?.ok && amountRead.money.amount <= 0) {
      setAmountError(t("renewFlow.receipt.refund.amountPositive"));
      return;
    }
    if (amountRead?.ok && amountRead.money.amount > maxMinor) {
      setAmountError(t("renewFlow.receipt.refund.atMost", { amount: amountText(refundable) }));
      return;
    }
    setAmountError(null);
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && mutation.isPending) return; onOpenChange(next); }}>
      <DialogContent aria-busy={mutation.isPending || undefined}>
        <DialogHeader>
          <DialogTitle>{t("renewFlow.receipt.refund.title")}</DialogTitle>
          <DialogDescription>
            {t("renewFlow.receipt.refund.description")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="flex justify-between rounded-md border border-line bg-sunken/50 px-3 py-2.5 text-[13px]">
            <span className="text-ink-2">{t("renewFlow.receipt.refund.canStillRefund")}</span>
            <MoneyText money={refundable} className="font-semibold" />
          </div>
          <Field label={t("renewFlow.shared.amountWithCurrency", { currency: isolateLtr(currency) })} error={amountError ?? undefined} hint={t("renewFlow.receipt.refund.hint", { amount: isolateLtr(toMajorString(refundable)) })}>
            <Input inputMode="decimal" dir="ltr" value={amount} onChange={(e) => { setAmount(e.target.value); setAmountError(null); }} placeholder={toMajorString(refundable)} aria-invalid={amountError ? true : undefined} data-testid="refund-amount" />
          </Field>
          <Field label={t("common.label.reason")} required>
            <Textarea dir="auto" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("renewFlow.receipt.refund.reasonPlaceholder")} data-testid="refund-reason" />
          </Field>
          {reviewFlagged ? (
            <p className="rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2 text-[12.5px] text-warning-deep">
              {t("renewFlow.receipt.refund.managerReview", { amount: isolateLtr(`${currency} 25.000`) })}
            </p>
          ) : null}
          {error ? <p role="alert" className="text-[12.5px] text-danger">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>{t("common.action.cancel")}</Button>
          <Button variant="signal" disabled={reason.trim().length < 5} loading={mutation.isPending} onClick={submit} data-testid="confirm-refund">
            {t("renewFlow.receipt.refund.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoidDialog({
  paymentId,
  retailSaleId,
  open,
  onOpenChange,
  onDone,
}: {
  paymentId: string;
  retailSaleId?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useLocale();
  const [reason, setReason] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setReason("");
    setError(null);
    setAttempt((current) => current + 1);
  }, [open]);
  const draftSignature = JSON.stringify({ attempt, paymentId, retailSaleId, reason: reason.trim() });
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [draftSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  const mutation = useApiMutation((api) => retailSaleId ? api.voidRetailSale(retailSaleId, { reason, idempotencyKey }) : api.voidPayment(paymentId, { reason, idempotencyKey }), {
    onSuccess: () => onDone(),
    onError: (e) => setError(isApiError(e) ? e.message : retailSaleId ? t("renewFlow.receipt.void.saleFailed") : t("renewFlow.receipt.void.paymentFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && mutation.isPending) return; onOpenChange(next); }}>
      <DialogContent aria-busy={mutation.isPending || undefined}>
        <DialogHeader>
          <DialogTitle>{retailSaleId ? t("renewFlow.receipt.void.titleSale") : t("renewFlow.receipt.void.titlePayment")}</DialogTitle>
          <DialogDescription>
            {retailSaleId ? t("renewFlow.receipt.void.descriptionSale") : t("renewFlow.receipt.void.descriptionPayment")}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className={cn("rounded-md border border-danger/30 bg-danger-bg/50 px-3 py-2.5 text-[13px] text-danger")}>
            {t("renewFlow.receipt.void.warning")}
          </div>
          <Field label={t("common.label.reason")} required>
            <Textarea dir="auto" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("renewFlow.receipt.void.reasonPlaceholder")} />
          </Field>
          {error ? <p role="alert" className="text-[12.5px] text-danger">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>{retailSaleId ? t("renewFlow.receipt.void.keepSale") : t("renewFlow.receipt.void.keepPayment")}</Button>
          <Button variant="signal" disabled={reason.trim().length < 5} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            {retailSaleId ? t("renewFlow.receipt.void.cancelSale") : t("renewFlow.receipt.void.cancelPayment")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
