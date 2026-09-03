"use client";

import { ArrowLeft, Download, Printer } from "lucide-react";
import Link from "next/link";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { PAYMENT_METHOD_LABELS, TransactionStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState, NotFoundState } from "@/components/ui/states";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { exportStatusLabel } from "@/lib/exports/csv";
import { downloadTextFile } from "@/lib/exports/download";
import { formatMoney } from "@/lib/utils/money";

export default function CustomerReceiptClient({ receiptId }: { receiptId: string }) {
  const query = useApiQuery(qk.customerReceipt(receiptId), (api) => api.getCustomerReceipt(receiptId));
  if (query.isLoading) return <main className="mx-auto max-w-3xl space-y-4 px-4 py-8"><Skeleton className="h-9 w-40" /><Skeleton className="h-[520px] w-full" /></main>;
  if (query.isError) return <main className="mx-auto max-w-3xl px-4 py-12">{isApiError(query.error) && query.error.code === "NOT_FOUND" ? <NotFoundState title="Receipt not found" /> : <ErrorState onRetry={() => query.refetch()} />}</main>;
  const detail = query.data!;
  const payment = detail.payment;
  const retail = detail.retailSale;
  const amount = retail?.total ?? payment.amount;
  const download = () => {
    const customerName = detail.member?.fullName ?? detail.customer?.fullName ?? "Member";
    const customerNumber = detail.member?.memberNumber ?? detail.customer?.memberNumber;
    const lines = [
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
    downloadTextFile({ content: `\uFEFF${lines.join("\r\n")}\r\n`, fileName: `${detail.receipt.receiptNumber}.txt` });
  };
  return <main className="mx-auto max-w-3xl px-4 py-7 pb-24 sm:px-6 lg:px-8 lg:py-10"><div className="no-print flex flex-wrap items-center justify-between gap-3"><Button asChild variant="ghost"><Link href="/customer/finance"><ArrowLeft /> Payments</Link></Button><div className="flex gap-2"><Button variant="secondary" onClick={download}><Download /> Download</Button><Button onClick={() => window.print()}><Printer /> Print</Button></div></div><article id="customer-receipt" className="panel mx-auto mt-5 max-w-lg px-7 py-8 font-mono text-[12px]"><header className="border-b border-dashed border-line-3 pb-5 text-center"><p className="font-display text-[19px] font-semibold">{detail.organization.name}</p><p className="mt-1 text-[11px] text-ink-2">{detail.branch.name} · {detail.branch.address}</p><p className="text-[11px] text-ink-2" dir="ltr">{detail.branch.phone}</p></header><section className="flex justify-between gap-4 border-b border-dashed border-line-3 py-4"><div><p className="text-[10.5px] text-ink-3">RECEIPT</p><h1 className="mt-1 text-[15px] font-semibold">{detail.receipt.receiptNumber}</h1></div><div className="text-end"><DateTimeText iso={detail.receipt.issuedAt} /><div className="mt-2"><TransactionStatusChip status={payment.status} /></div></div></section><section className="border-b border-dashed border-line-3 py-4"><p className="text-[13px] font-semibold">{detail.member?.fullName ?? detail.customer?.fullName ?? "Member"}</p><p className="mt-0.5 text-[11px] text-ink-3">{detail.member?.memberNumber ?? detail.customer?.memberNumber}</p></section><section className="border-b border-dashed border-line-3 py-4">{retail?.lines.length ? <div className="space-y-2">{retail.lines.map((line) => <div key={`${line.productId}-${line.quantity}`} className="flex justify-between gap-4"><span>{line.productName} × {line.quantity}</span><MoneyText money={line.lineTotal} hideCurrency /></div>)}</div> : <div className="flex justify-between gap-4"><span>{detail.charge?.description ?? (payment.type === "refund" ? "Refund" : "Payment")}</span><MoneyText money={amount} hideCurrency /></div>}<div className="mt-4 flex justify-between border-t border-line-2 pt-3 text-[14px] font-semibold"><span>{payment.type === "refund" ? "Refunded" : "Total"}</span><MoneyText money={amount} /></div>{detail.charge?.outstandingAmount.amount ? <div className="mt-2 flex justify-between text-warning-deep"><span>Balance remaining</span><MoneyText money={detail.charge.outstandingAmount} /></div> : null}</section><section className="space-y-1 py-4 text-[11px] text-ink-2"><p>Method: {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</p><p>Recorded by: {payment.collectedByName}</p>{payment.externalReference ? <p>Reference: {payment.externalReference}</p> : null}</section><footer className="border-t border-dashed border-line-3 pt-4 text-center text-[10.5px] leading-relaxed text-ink-2"><p>{detail.organization.receiptFooter}</p><p className="mt-3 text-[10.5px] text-ink-3">This receipt is available only to the signed-in member.</p></footer></article></main>;
}
