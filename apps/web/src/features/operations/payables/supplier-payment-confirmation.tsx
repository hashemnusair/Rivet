"use client";
import { useLocale } from "@/lib/i18n/provider";

import { ArrowLeft, Download, Printer, Undo2, WalletCards } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { qk } from "@/lib/api/keys";
import { isApiError } from "@/lib/api/errors";
import { payableStatusLabel, payableSourceLabel, supplierPaymentMethodLabel } from "@/lib/i18n/payables";
import { useFormat } from "@/lib/i18n/format";
import { useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { downloadTextFile } from "@/lib/exports/download";
import { toMajorString } from "@/lib/utils/money";
import { MoneyText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { ErrorState, ForbiddenState, NotFoundState } from "@/components/ui/states";
import { LedgerStatusBadge, ledgerStatusLabel } from "./ledger-status";
import { buildSupplierPaymentRecordCsv } from "./payables-export";
import { ReverseSupplierPaymentDialog } from "./supplier-payment-history-dialog";

/**
 * The remittance record for one supplier payment. It is deliberately not a
 * customer receipt: no receipt number, no membership language, and an
 * explicit line about whether the ledger has posted the settlement yet.
 */
export function SupplierPaymentConfirmation({ paymentId: paymentIdProp }: { paymentId?: string } = {}) {
  const { t, locale, isolate } = useLocale();
  const f = useFormat();
  const params = useParams<{ paymentId: string }>();
  const paymentId = paymentIdProp ?? params.paymentId;
  const { session } = useApp();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const [reverseOpen, setReverseOpen] = useState(false);
  const canRead = can("operations.manage") || can("reports.financial.read");
  const writeEnabled = can("operations.manage");
  const query = useApiQuery(qk.supplierPayment(paymentId), (api) => api.getSupplierPayment(paymentId), { enabled: canRead && Boolean(paymentId) });

  if (!canRead) return <ForbiddenState description={t("payablesWorkspace.noPaymentsAccess")} />;
  if (query.isLoading) return <div className="mx-auto max-w-4xl space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-[420px] w-full" /></div>;
  if (query.isError || !query.data) {
    return isApiError(query.error) && query.error.code === "NOT_FOUND" ? <NotFoundState title={t("payablesWorkspace.paymentNotFound")} /> : <ErrorState onRetry={() => void query.refetch()} />;
  }

  const detail = query.data;
  const currency = detail.amount.currency;
  const reversed = detail.status === "reversed";
  const timeZone = session?.organization.timezone ?? "Asia/Amman";
  const download = () => downloadTextFile({ content: buildSupplierPaymentRecordCsv(detail, timeZone, locale), fileName: `supplier-payment-${detail.supplierName}-${detail.occurredAt.slice(0, 10)}.csv`, mimeType: "text/csv;charset=utf-8" });

  return (
    <div className="mx-auto max-w-5xl space-y-4" data-testid="supplier-payment-confirmation">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm"><Link href="/operations/payables"><ArrowLeft className="rtl:rotate-180" />{" "}{t("palette.pages.supplierBills")}</Link></Button>
        <div className="flex flex-wrap items-center gap-2">
          {writeEnabled ? <Button asChild variant="secondary" size="sm"><Link href={`/operations/payables?pay=1&supplier=${encodeURIComponent(detail.supplierId)}`}><WalletCards /> {" "}{t("payablesWorkspace.recordAnother")}</Link></Button> : null}
          {writeEnabled && !reversed ? <Button variant="danger" size="sm" onClick={() => setReverseOpen(true)} data-testid="reverse-supplier-payment"><Undo2 /> {" "}{t("payablesWorkspace.reverseEllipsis")}</Button> : null}
          <Button variant="secondary" size="sm" onClick={download}><Download />{" "}{t("common.action.download")}</Button>
          <Button size="sm" onClick={() => window.print()}><Printer />{" "}{t("common.action.print")}</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <article id="receipt-print" className="panel mx-auto w-full max-w-xl px-4 py-5 text-[13px] sm:px-8 sm:py-8">
          <header className="border-b border-dashed border-line-3 pb-4">
            <p className="context-label">{t("payablesWorkspace.confirmation")}</p>
            <h1 className="mt-1 font-display text-[20px] font-semibold tracking-tight">{detail.organization.name}</h1>
            <p className="text-[12px] text-ink-2">{detail.branch.name}{detail.branch.address ? ` · ${detail.branch.address}` : ""}</p>
            {detail.branch.phone ? <p className="text-[12px] text-ink-2" dir="ltr">{detail.branch.phone}</p> : null}
            {reversed ? <p className="mt-3 rounded-md border border-danger/40 bg-danger-bg/50 px-3 py-2 text-[12.5px] font-semibold text-danger">{detail.reversal ? t("payablesWorkspace.reversedDetail", { date: `${f.date(detail.reversal.reversedAt)} · ${f.time(detail.reversal.reversedAt)}`, name: isolate(detail.reversal.reversedByName), reason: isolate(detail.reversal.reason) }) : t("payablesWorkspace.reversed")}</p> : null}
          </header>

          <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 border-b border-dashed border-line-3 py-4 text-[12.5px]">
            <dt className="text-ink-3">{t("payablesWorkspace.paidTo")}</dt><dd className="font-semibold">{detail.supplierName}</dd>
            <dt className="text-ink-3">{t("common.label.amount")}</dt><dd className="font-semibold tabular"><MoneyText money={detail.amount} /></dd>
            <dt className="text-ink-3">{t("renewFlow.shared.method")}</dt><dd>{supplierPaymentMethodLabel(detail.method, t)}{detail.shiftId ? t("payablesWorkspace.fromDrawer") : ""}</dd>
            {detail.reference ? <><dt className="text-ink-3">{t("payablesWorkspace.reference")}</dt><dd className="font-mono" dir="ltr">{detail.reference}</dd></> : null}
            <dt className="text-ink-3">{t("payablesWorkspace.recorded")}</dt><dd>{t("payablesWorkspace.recordedDetail", { date: `${f.date(detail.occurredAt)} · ${f.time(detail.occurredAt)}`, name: isolate(detail.recordedByName) })}</dd>
            {detail.notes ? <><dt className="text-ink-3">{t("common.label.notes")}</dt><dd>{detail.notes}</dd></> : null}
          </dl>

          <section className="border-b border-dashed border-line-3 py-4">
            <h2 className="text-[12px] font-semibold text-ink-3">{t("payablesWorkspace.billsPaid")}</h2>
            <table className="mt-2 w-full text-[12.5px]">
              <thead className="text-start text-[12px] text-ink-3"><tr><th className="py-1 text-start font-medium">{t("payablesWorkspace.bill")}</th><th className="py-1 ps-3 text-end font-medium">{t("payablesWorkspace.paidNow")}</th><th className="py-1 ps-3 text-end font-medium">{t("renewFlow.receipt.stillOwed")}</th></tr></thead>
              <tbody>
                {detail.allocations.map((allocation) => {
                  const payable = detail.payables.find((candidate) => candidate.payableId === allocation.payableId);
                  return (
                    <tr key={allocation.payableId} className="border-t border-line-2">
                      <td className="py-2 pe-2 align-top">{payableSourceLabel(allocation.sourceLabel, t)}{payable ? <span className="block text-[12px] text-ink-3">{t("payablesWorkspace.billTotal", { status: payableStatusLabel(payable.status, t), amount: f.money(payable.original, { hideCurrency: true }) })}</span> : null}</td>
                      <td className="whitespace-nowrap py-2 ps-3 text-end align-top tabular" dir="ltr">{toMajorString(allocation.amount)}</td>
                      <td className="whitespace-nowrap py-2 ps-3 text-end align-top tabular" dir="ltr">{payable ? toMajorString(payable.remaining) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3 flex justify-between border-t border-line-2 pt-2 text-[13px]"><span className="text-ink-2">{t("payablesWorkspace.stillOwedNamed", { supplier: isolate(detail.supplierName) })}</span><MoneyText money={detail.supplierRemaining} className="font-semibold" /></div>
          </section>

          <footer className="space-y-1 pt-4 text-[12px] text-ink-2">
            <p>{t("payablesWorkspace.confirmationFooter", { currency })}</p>
          </footer>
        </article>

        <aside className="no-print space-y-4 self-start">
          <section className="panel p-4">
            <h3 className="context-label mb-2.5">{t("common.label.status")}</h3>
            <div className="flex flex-wrap gap-1.5">{reversed ? <Badge variant="danger" dot>{t("payablesWorkspace.reversed")}</Badge> : <Badge variant="success" dot>{t("payablesWorkspace.recorded")}</Badge>}<LedgerStatusBadge status={detail.ledgerPostingStatus} /></div>
            {detail.reversal ? <p className="mt-2 text-[12px] text-ink-2">{t("payablesWorkspace.reversalLedger", { status: ledgerStatusLabel(detail.reversal.ledgerPostingStatus, t) })}</p> : null}
            <p className="mt-2 text-[12px] text-ink-3">{t("payablesWorkspace.ownerPostingHint")}</p>
          </section>
          <section className="panel p-4 text-[12.5px]">
            <h3 className="context-label mb-2.5">{t("payablesWorkspace.whatNext")}</h3>
            <ul className="space-y-2">
              <li><Link href={`/operations/payables?supplier=${encodeURIComponent(detail.supplierId)}`} className="underline decoration-line-3 underline-offset-2 hover:text-ink">{t("payablesWorkspace.seeBillsNamed", { supplier: isolate(detail.supplierName) })}</Link></li>
              <li><Link href="/operations?tab=suppliers" className="underline decoration-line-3 underline-offset-2 hover:text-ink">{t("payablesWorkspace.allSuppliers")}</Link></li>
              <li><Link href="/operations/payables" className="underline decoration-line-3 underline-offset-2 hover:text-ink">{t("payablesWorkspace.allBills")}</Link></li>
            </ul>
          </section>
        </aside>
      </div>

      <ReverseSupplierPaymentDialog payment={detail} open={reverseOpen} onOpenChange={setReverseOpen} onReversed={async () => { setReverseOpen(false); await invalidate([qk.payables(), qk.supplierPayments()]); }} />
    </div>
  );
}
