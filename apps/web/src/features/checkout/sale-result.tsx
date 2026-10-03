"use client";
import { useT } from "@/lib/i18n/provider";

import { CheckCircle2, ExternalLink, RotateCcw, ShoppingBag } from "lucide-react";
import Link from "next/link";
import type { ReceiptDetail, RetailSale } from "@/lib/domain/types";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { TransactionStatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { checkoutPaymentMethodLabel } from "./checkout-model";

export type RetailCheckoutResult = ReceiptDetail & { receiptId: string; retailSale: RetailSale };

/** The completion screen: what happened, where the receipt is, what to do next. */
export function SaleResult({ result, canAdjust, onNextSale }: { result: RetailCheckoutResult; canAdjust: boolean; onNextSale: () => void }) {
  const t = useT();
  const sale = result.retailSale;
  const customer = sale.customer;
  const units = sale.lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <section className="panel mx-auto max-w-xl overflow-hidden" data-testid="sale-result" aria-labelledby="sale-result-heading">
      <div className="flex items-start gap-3 border-b border-line bg-success-bg/40 px-5 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success text-white" aria-hidden><CheckCircle2 className="size-5" /></span>
        <div>
          <h2 id="sale-result-heading" className="text-[17px] font-semibold">{t("salesWorkspace.saleCompleted")}</h2>
          <p className="text-[12.5px] text-ink-2">{t("renewFlow.payment.receipt")}{" "}<span className="font-mono"><bdi dir="ltr">{result.receipt.receiptNumber}</bdi></span> · {t("salesWorkspace.soldCount", { count: units })}</p>
          <p className="text-[12px] text-ink-3"><DateTimeText iso={result.receipt.issuedAt} /> · {result.branch.name}</p>
        </div>
      </div>
      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 px-5 py-4 text-[13px]">
        <dt className="text-ink-3">{t("common.label.amount")}</dt><dd className="font-semibold"><MoneyText money={sale.total} /></dd>
        <dt className="text-ink-3">{t("salesWorkspace.paidBy")}</dt><dd>{checkoutPaymentMethodLabel(t, sale.method)}{sale.externalReference ? <span className="font-mono text-[12px] text-ink-2"> · <bdi dir="ltr">{sale.externalReference}</bdi></span> : null}</dd>
        <dt className="text-ink-3">{t("common.label.status")}</dt><dd><TransactionStatusChip status={result.payment.status} /></dd>
        <dt className="text-ink-3">{t("renewFlow.payment.receipt")}</dt><dd className="font-mono">{result.receipt.receiptNumber}</dd>
        {customer.kind === "member" ? <><dt className="text-ink-3">{t("palette.kind.member")}</dt><dd>{customer.fullName}{customer.memberNumber ? <span className="font-mono text-[12px] text-ink-2"> · {customer.memberNumber}</span> : null}</dd></> : null}
        {customer.kind === "guest" ? <><dt className="text-ink-3">{t("salesWorkspace.receiptName")}</dt><dd>{customer.fullName}</dd></> : null}
        <dt className="text-ink-3">{t("salesWorkspace.items")}</dt><dd><ul className="space-y-0.5">{sale.lines.map((line) => <li key={line.productId} className="flex justify-between gap-3"><span>{line.productName} × {line.quantity}</span><MoneyText money={line.lineTotal} hideCurrency /></li>)}</ul></dd>
      </dl>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4">
        <Button type="button" size="lg" className="h-12 w-full sm:h-10 sm:w-auto" onClick={onNextSale} data-testid="next-sale" autoFocus><ShoppingBag /> {" "}{t("salesWorkspace.nextSale")}</Button>
        <Button asChild variant="secondary" size="lg" className="h-12 w-full sm:h-10 sm:w-auto"><Link href={`/payments/receipts/${encodeURIComponent(result.receiptId)}`}><ExternalLink />{" "}{t("renewFlow.payment.openReceipt")}</Link></Button>
        {canAdjust ? <Button asChild variant="ghost" size="sm" className="w-full sm:w-auto"><Link href={`/payments/receipts/${encodeURIComponent(result.receiptId)}`}><RotateCcw /> {" "}{t("salesWorkspace.refundSale")}</Link></Button> : null}
      </div>
      <p className="px-5 pb-4 text-[12px] text-ink-3">{sale.method !== "cash" ? t("salesWorkspace.bankUnchecked", { method: checkoutPaymentMethodLabel(t, sale.method) }) + " " : ""}{t("salesWorkspace.receiptHint")}{" "}{customer.kind === "walk_in" ? t("salesWorkspace.unlinkedSale") : ""}</p>
    </section>
  );
}
