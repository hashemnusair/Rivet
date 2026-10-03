"use client";
import { useLocale } from "@/lib/i18n/provider";
import { createTranslator, type TKey } from "@/lib/i18n/core";
import type { Locale } from "@/lib/i18n/locale";
import { makeFormatters, FormattingProvider } from "@/lib/i18n/format";
import { isolate, isolateLtr } from "@/lib/i18n/bidi";
import { paymentMethodLabel, transactionStatusLabel } from "@/lib/i18n/labels";
import { useT } from "@/lib/i18n/provider";

import { AlertTriangle, ArrowLeft, Download, Printer, SearchX } from "lucide-react";
import Link from "next/link";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { TransactionStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { StatePanel } from "@/components/ui/states";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import type { CustomerReceipt } from "@/lib/domain/qol";
import { useApiQuery } from "@/lib/hooks/use-api";
import { downloadTextFile } from "@/lib/exports/download";

/** Plain-text copy of the receipt: readable on any phone, no app required. */
export function receiptTextLines(detail: CustomerReceipt, locale: Locale = "en"): string[] {
  const t = createTranslator(locale);
  const f = makeFormatters(locale, t("common.time.now"), detail.organization.timezone);
  const text = (value: string) => locale === "ar" ? isolate(value) : value;
  const reference = (value: string) => locale === "ar" ? isolateLtr(value) : value;
  const fact = (key: TKey, value: string) => `${t(key)}: ${value}`;
  const payment = detail.payment;
  const retail = detail.retailSale;
  const amount = retail?.total ?? payment.amount;
  const customerName = detail.member?.fullName ?? detail.customer?.fullName ?? t("palette.kind.member");
  const customerNumber = detail.member?.memberNumber ?? detail.customer?.memberNumber;
  return [
    text(detail.organization.name),
    `${text(detail.branch.name)} (${reference(detail.branch.code)})`,
    text(detail.branch.address),
    reference(detail.branch.phone),
    "",
    fact("customerPortal.receiptNumber", reference(detail.receipt.receiptNumber)),
    fact("customerPortal.issued", `${f.date(detail.receipt.issuedAt)} · ${f.time(detail.receipt.issuedAt)}`),
    fact("palette.kind.member", text(customerName)),
    ...(customerNumber ? [fact("customerPortal.memberNumber", reference(customerNumber))] : []),
    "",
    ...(retail?.lines.length
      ? [t("customerPortal.items"), ...retail.lines.map((line) => `- ${text(line.productName)} × ${line.quantity}: ${reference(f.money(line.lineTotal))}`)]
      : [fact("customerPortal.description", text(detail.charge?.description ?? t(payment.type === "refund" ? "customerPortal.refund" : "customerPortal.payment")))]),
    "",
    fact(payment.type === "refund" ? "customerPortal.refunded" : "common.label.total", reference(f.money(amount))),
    ...(detail.charge?.outstandingAmount.amount ? [fact("domain.paymentStatus.unpaid", reference(f.money(detail.charge.outstandingAmount)))] : []),
    fact("renewFlow.shared.paymentMethodAria", paymentMethodLabel(t, payment.method)),
    fact("common.label.status", transactionStatusLabel(t, payment.status)),
    fact("customerPortal.recordedBy", text(payment.collectedByName)),
    ...(payment.externalReference ? [fact("customerPortal.paymentReference", reference(payment.externalReference))] : []),
    ...(payment.refundReason ? [fact("customerPortal.refundReason", text(payment.refundReason))] : []),
    ...(payment.voidReason ? [fact("customerPortal.cancelReason", text(payment.voidReason))] : []),
    "",
    detail.organization.receiptFooter,
  ].filter((line) => line !== undefined);
}

export default function CustomerReceiptClient({ receiptId }: { receiptId: string }) {
  const t = useT();
  const { locale } = useLocale();
  const query = useApiQuery(qk.customerReceipt(receiptId), (api) => api.getCustomerReceipt(receiptId));

  if (query.isLoading) {
    return (
      <main className="mx-auto max-w-[720px] space-y-4 px-4 py-6 sm:px-6 lg:px-8" role="status" aria-label={t("customerPortal.loadingReceipt")}>
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
          title={notFound ? t("renewFlow.receipt.notFound") : t("customerPortal.receiptLoadFailed")}
          description={notFound ? t("customerPortal.receiptNotOnAccount") : t("customerPortal.paymentsUnchanged")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {notFound ? null : <Button size="sm" onClick={() => query.refetch()}>{t("common.action.retry")}</Button>}
              <Button asChild size="sm" variant="secondary"><Link href="/customer/finance">{t("customerPortal.backPayments")}</Link></Button>
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
  const customerName = detail.member?.fullName ?? detail.customer?.fullName ?? t("palette.kind.member");
  const customerNumber = detail.member?.memberNumber ?? detail.customer?.memberNumber;
  const outstanding = detail.charge?.outstandingAmount.amount ? detail.charge.outstandingAmount : undefined;
  const download = () => downloadTextFile({ content: `\uFEFF${receiptTextLines(detail, locale).join("\r\n")}\r\n`, fileName: `${detail.receipt.receiptNumber}.txt` });

  return (
    <FormattingProvider timeZone={detail.organization.timezone}><main className="mx-auto max-w-[720px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm"><Link href="/customer/finance"><ArrowLeft className="rtl:rotate-180" />{" "}{t("renewFlow.receipt.back")}</Link></Button>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={download}><Download />{" "}{t("common.action.download")}</Button>
          <Button size="sm" onClick={() => window.print()}><Printer />{" "}{t("common.action.print")}</Button>
        </div>
      </div>

      {/* The print stylesheet reveals only #receipt-print, so the member copy
          shares the staff receipt's id and prints exactly what is on screen. */}
      <article id="receipt-print" className="panel mt-4 px-5 py-6 sm:px-8 sm:py-8" aria-labelledby="receipt-title">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ink-3">{isRefund ? t("customerPortal.refundReceipt") : retail ? t("customerPortal.shopReceipt") : t("renewFlow.payment.receipt")}</p>
            <h1 id="receipt-title" dir="ltr" className="mt-0.5 font-mono text-[18px] font-semibold tracking-wide text-ink">{detail.receipt.receiptNumber}</h1>
            <p className="mt-1 text-[13px] text-ink-2"><DateTimeText iso={detail.receipt.issuedAt} /></p>
          </div>
          <TransactionStatusChip status={payment.status} />
        </header>

        <section className="grid gap-4 border-b border-line py-4 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ink-3">{t("common.label.from")}</p>
            <p className="mt-0.5 text-[14px] font-semibold text-ink">{detail.organization.name}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-2">{detail.branch.name} · {detail.branch.address}</p>
            <p className="text-[12.5px] text-ink-2" dir="ltr">{detail.branch.phone}</p>
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ink-3">{t("palette.kind.member")}</p>
            <p className="mt-0.5 text-[14px] font-semibold text-ink">{customerName}</p>
            {customerNumber ? <p className="mt-0.5 font-mono text-[12px] text-ink-3">{customerNumber}</p> : null}
          </div>
        </section>

        <section className="border-b border-line py-4" aria-label={t("customerPortal.amounts")}>
          <p className="text-[12px] font-medium text-ink-3">{retail?.lines.length ? t("customerPortal.items") : t("customerPortal.description")}</p>
          <table className="mt-2 w-full text-[13.5px]">
            <tbody>
              {retail?.lines.length ? retail.lines.map((line) => (
                <tr key={`${line.productId}-${line.quantity}`}>
                  <td className="py-1.5 pe-3 align-top text-ink">{line.productName} × {line.quantity}</td>
                  <td className="py-1.5 text-end align-top tabular text-ink"><MoneyText money={line.lineTotal} hideCurrency /></td>
                </tr>
              )) : (
                <tr>
                  <td className="py-1.5 pe-3 align-top text-ink">{detail.charge?.description ?? (isRefund ? t("domain.transactionType.refund") : t("members.tabs.membershipColumns.payment"))}</td>
                  <td className="py-1.5 text-end align-top tabular text-ink"><MoneyText money={amount} hideCurrency /></td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-line-2 pt-3">
            <span className="text-[14px] font-semibold text-ink">{isRefund ? t("memberProfile.pt.orderStatus.refunded") : t("common.label.total")}</span>
            <MoneyText money={amount} className="font-display text-[22px] font-semibold text-ink" />
          </div>
          {outstanding ? (
            <div className="mt-2 flex items-baseline justify-between gap-4 text-[13.5px] font-medium text-warning-deep">
              <span>{t("domain.paymentStatus.unpaid")}</span>
              <MoneyText money={outstanding} />
            </div>
          ) : null}
        </section>

        <dl className="grid gap-x-6 gap-y-2 py-4 text-[13px] sm:grid-cols-2">
          <ReceiptFact label={t("renewFlow.shared.paymentMethodAria")}>{paymentMethodLabel(t, payment.method)}</ReceiptFact>
          <ReceiptFact label={t("customerPortal.recordedBy")}>{payment.collectedByName}</ReceiptFact>
          {payment.externalReference ? <ReceiptFact label={t("customerPortal.paymentReference")}><span dir="ltr" className="font-mono text-[12px]">{payment.externalReference}</span></ReceiptFact> : null}
          {payment.refundReason ? <ReceiptFact label={t("customerPortal.refundReason")}>{payment.refundReason}</ReceiptFact> : null}
          {payment.voidReason ? <ReceiptFact label={t("customerPortal.cancelReason")}>{payment.voidReason}</ReceiptFact> : null}
        </dl>

        <footer className="border-t border-line pt-4 text-[12px] leading-relaxed text-ink-3">
          <p>{detail.organization.receiptFooter}</p>
          <p className="mt-2">{t("customerPortal.receiptQuery")}</p>
        </footer>
      </article>
    </main></FormattingProvider>
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
