"use client";

import { AlertTriangle, ArrowLeft, Download, Printer, SearchX } from "lucide-react";
import Link from "next/link";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { PAYMENT_METHOD_LABELS, TransactionStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { StatePanel } from "@/components/ui/states";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import type { CustomerReceipt } from "@/lib/domain/qol";
import { useApiQuery } from "@/lib/hooks/use-api";
import { exportStatusLabel } from "@/lib/exports/csv";
import { downloadTextFile } from "@/lib/exports/download";
import { formatMoney } from "@/lib/utils/money";

/** Plain-text copy of the receipt: readable on any phone, no app required. */
export function receiptTextLines(detail: CustomerReceipt): string[] {
  const payment = detail.payment;
  const retail = detail.retailSale;
  const amount = retail?.total ?? payment.amount;
  const customerName = detail.member?.fullName ?? detail.customer?.fullName ?? "Member";
  const customerNumber = detail.member?.memberNumber ?? detail.customer?.memberNumber;
  return [
    detail.organization.name,
    `${detail.branch.name} (${detail.branch.code})`,
    detail.branch.address,
    detail.branch.phone,
    "",
    `Receipt number: ${detail.receipt.receiptNumber}`,
    `Issued: ${new Date(detail.receipt.issuedAt).toLocaleString("en-JO")}`,
    `Customer: ${customerName}`,
    ...(customerNumber ? [`Member number: ${customerNumber}`] : []),
    "",
    ...(retail?.lines.length
      ? ["Items", ...retail.lines.map((line) => `- ${line.productName} × ${line.quantity}: ${formatMoney(line.lineTotal)}`)]
      : [`Description: ${detail.charge?.description ?? (payment.type === "refund" ? "Refund" : "Payment")}`]),
    "",
    `${payment.type === "refund" ? "Refunded" : "Total"}: ${formatMoney(amount)}`,
    ...(detail.charge?.outstandingAmount.amount ? [`Balance remaining: ${formatMoney(detail.charge.outstandingAmount)}`] : []),
    `Payment method: ${PAYMENT_METHOD_LABELS[payment.method] ?? exportStatusLabel(payment.method)}`,
    `Status: ${exportStatusLabel(payment.status)}`,
    `Recorded by: ${payment.collectedByName}`,
    ...(payment.externalReference ? [`Payment reference: ${payment.externalReference}`] : []),
    ...(payment.refundReason ? [`Refund reason: ${payment.refundReason}`] : []),
    ...(payment.voidReason ? [`Void reason: ${payment.voidReason}`] : []),
    "",
    detail.organization.receiptFooter,
  ].filter((line) => line !== undefined);
}

export default function CustomerReceiptClient({ receiptId }: { receiptId: string }) {
  const query = useApiQuery(qk.customerReceipt(receiptId), (api) => api.getCustomerReceipt(receiptId));

  if (query.isLoading) {
    return (
      <main className="mx-auto max-w-[720px] space-y-4 px-4 py-6 sm:px-6 lg:px-8" role="status" aria-label="Loading receipt">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-[480px] w-full" />
      </main>
    );
  }

  if (query.isError) {
    const notFound = isApiError(query.error) && query.error.code === "NOT_FOUND";
    return (
      <main className="mx-auto max-w-lg px-4 py-12 sm:px-6">
        <StatePanel
          icon={notFound ? SearchX : AlertTriangle}
          role={notFound ? "status" : "alert"}
          title={notFound ? "Receipt not found" : "The receipt could not be loaded"}
          description={notFound ? "This receipt is not linked to your account, or the link is out of date." : "Nothing about your payments changed. Try again in a moment."}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {notFound ? null : <Button size="sm" onClick={() => query.refetch()}>Try again</Button>}
              <Button asChild size="sm" variant="secondary"><Link href="/customer/finance">Back to payments</Link></Button>
            </div>
          }
        />
      </main>
    );
  }

  const detail = query.data!;
  const payment = detail.payment;
  const retail = detail.retailSale;
  const isRefund = payment.type === "refund";
  const amount = retail?.total ?? payment.amount;
  const customerName = detail.member?.fullName ?? detail.customer?.fullName ?? "Member";
  const customerNumber = detail.member?.memberNumber ?? detail.customer?.memberNumber;
  const outstanding = detail.charge?.outstandingAmount.amount ? detail.charge.outstandingAmount : undefined;
  const download = () => downloadTextFile({ content: `\uFEFF${receiptTextLines(detail).join("\r\n")}\r\n`, fileName: `${detail.receipt.receiptNumber}.txt` });

  return (
    <main className="mx-auto max-w-[720px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm"><Link href="/customer/finance"><ArrowLeft /> Payments</Link></Button>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={download}><Download /> Download</Button>
          <Button size="sm" onClick={() => window.print()}><Printer /> Print</Button>
        </div>
      </div>

      {/* The print stylesheet reveals only #receipt-print, so the member copy
          shares the staff receipt's id and prints exactly what is on screen. */}
      <article id="receipt-print" className="panel mt-4 px-5 py-6 sm:px-8 sm:py-8" aria-labelledby="receipt-title">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ink-3">{isRefund ? "Refund receipt" : retail ? "Shop receipt" : "Receipt"}</p>
            <h1 id="receipt-title" className="mt-0.5 font-mono text-[18px] font-semibold tracking-wide text-ink">{detail.receipt.receiptNumber}</h1>
            <p className="mt-1 text-[13px] text-ink-2"><DateTimeText iso={detail.receipt.issuedAt} /></p>
          </div>
          <TransactionStatusChip status={payment.status} />
        </header>

        <section className="grid gap-4 border-b border-line py-4 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ink-3">From</p>
            <p className="mt-0.5 text-[14px] font-semibold text-ink">{detail.organization.name}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-2">{detail.branch.name} · {detail.branch.address}</p>
            <p className="text-[12.5px] text-ink-2" dir="ltr">{detail.branch.phone}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ink-3">Member</p>
            <p className="mt-0.5 text-[14px] font-semibold text-ink">{customerName}</p>
            {customerNumber ? <p className="mt-0.5 font-mono text-[12px] text-ink-3">{customerNumber}</p> : null}
          </div>
        </section>

        <section className="border-b border-line py-4" aria-label="Amounts">
          <p className="text-[12px] font-medium text-ink-3">{retail?.lines.length ? "Items" : "Description"}</p>
          <table className="mt-2 w-full text-[13.5px]">
            <tbody>
              {retail?.lines.length ? retail.lines.map((line) => (
                <tr key={`${line.productId}-${line.quantity}`}>
                  <td className="py-1.5 pe-3 align-top text-ink">{line.productName} × {line.quantity}</td>
                  <td className="py-1.5 text-end align-top tabular text-ink"><MoneyText money={line.lineTotal} hideCurrency /></td>
                </tr>
              )) : (
                <tr>
                  <td className="py-1.5 pe-3 align-top text-ink">{detail.charge?.description ?? (isRefund ? "Refund" : "Payment")}</td>
                  <td className="py-1.5 text-end align-top tabular text-ink"><MoneyText money={amount} hideCurrency /></td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-line-2 pt-3">
            <span className="text-[14px] font-semibold text-ink">{isRefund ? "Refunded" : "Total"}</span>
            <MoneyText money={amount} className="font-display text-[22px] font-semibold text-ink" />
          </div>
          {outstanding ? (
            <div className="mt-2 flex items-baseline justify-between gap-4 text-[13.5px] font-medium text-warning-deep">
              <span>Balance remaining</span>
              <MoneyText money={outstanding} />
            </div>
          ) : null}
        </section>

        <dl className="grid gap-x-6 gap-y-2 py-4 text-[13px] sm:grid-cols-2">
          <ReceiptFact label="Payment method">{PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</ReceiptFact>
          <ReceiptFact label="Recorded by">{payment.collectedByName}</ReceiptFact>
          {payment.externalReference ? <ReceiptFact label="Payment reference"><span className="font-mono text-[12px]">{payment.externalReference}</span></ReceiptFact> : null}
          {payment.refundReason ? <ReceiptFact label="Refund reason">{payment.refundReason}</ReceiptFact> : null}
          {payment.voidReason ? <ReceiptFact label="Void reason">{payment.voidReason}</ReceiptFact> : null}
        </dl>

        <footer className="border-t border-line pt-4 text-[12px] leading-relaxed text-ink-3">
          <p>{detail.organization.receiptFooter}</p>
          <p className="mt-2">Only you can open this receipt while signed in. The gym&apos;s recorded payment status is the source of truth.</p>
        </footer>
      </article>
    </main>
  );
}

function ReceiptFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:block">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-end font-medium text-ink sm:mt-0.5 sm:text-start">{children}</dd>
    </div>
  );
}
