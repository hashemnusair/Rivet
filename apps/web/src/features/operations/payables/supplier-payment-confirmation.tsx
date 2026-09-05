"use client";

import { ArrowLeft, Download, Printer, Undo2, WalletCards } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { qk } from "@/lib/api/keys";
import { isApiError } from "@/lib/api/errors";
import { PAYABLE_STATUS_LABELS, SUPPLIER_PAYMENT_METHOD_LABELS } from "@/lib/domain/payables";
import { useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { downloadTextFile } from "@/lib/exports/download";
import { formatDateTime } from "@/lib/utils/dates";
import { toMajor } from "@/lib/utils/money";
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
  const params = useParams<{ paymentId: string }>();
  const paymentId = paymentIdProp ?? params.paymentId;
  const { session } = useApp();
  const { can } = usePermissions();
  const invalidate = useInvalidate();
  const [reverseOpen, setReverseOpen] = useState(false);
  const canRead = can("operations.manage") || can("reports.financial.read");
  const writeEnabled = can("operations.manage");
  const query = useApiQuery(qk.supplierPayment(paymentId), (api) => api.getSupplierPayment(paymentId), { enabled: canRead && Boolean(paymentId) });

  if (!canRead) return <ForbiddenState description="Supplier payment records are visible to purchasing managers and finance readers." />;
  if (query.isLoading) return <div className="mx-auto max-w-4xl space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-[420px] w-full" /></div>;
  if (query.isError || !query.data) {
    return isApiError(query.error) && query.error.code === "NOT_FOUND" ? <NotFoundState title="Supplier payment not found" /> : <ErrorState onRetry={() => void query.refetch()} />;
  }

  const detail = query.data;
  const currency = detail.amount.currency;
  const reversed = detail.status === "reversed";
  const timeZone = session?.organization.timezone ?? "Asia/Amman";
  const download = () => downloadTextFile({ content: buildSupplierPaymentRecordCsv(detail, timeZone), fileName: `supplier-payment-${detail.supplierName}-${detail.occurredAt.slice(0, 10)}.csv`, mimeType: "text/csv;charset=utf-8" });

  return (
    <div className="mx-auto max-w-5xl space-y-4" data-testid="supplier-payment-confirmation">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm"><Link href="/operations/payables"><ArrowLeft /> Payables</Link></Button>
        <div className="flex flex-wrap items-center gap-2">
          {writeEnabled ? <Button asChild variant="secondary" size="sm"><Link href={`/operations/payables?pay=1&supplier=${encodeURIComponent(detail.supplierId)}`}><WalletCards /> Record another</Link></Button> : null}
          {writeEnabled && !reversed ? <Button variant="danger" size="sm" onClick={() => setReverseOpen(true)} data-testid="reverse-supplier-payment"><Undo2 /> Reverse…</Button> : null}
          <Button variant="secondary" size="sm" onClick={download}><Download /> Download</Button>
          <Button size="sm" onClick={() => window.print()}><Printer /> Print</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <article id="receipt-print" className="panel mx-auto w-full max-w-xl px-4 py-5 text-[13px] sm:px-8 sm:py-8">
          <header className="border-b border-dashed border-line-3 pb-4">
            <p className="context-label">Supplier payment confirmation</p>
            <h1 className="mt-1 font-display text-[20px] font-semibold tracking-tight">{detail.organization.name}</h1>
            <p className="text-[12px] text-ink-2">{detail.branch.name}{detail.branch.address ? ` · ${detail.branch.address}` : ""}</p>
            {detail.branch.phone ? <p className="text-[12px] text-ink-2" dir="ltr">{detail.branch.phone}</p> : null}
            {reversed ? <p className="mt-3 rounded-md border border-danger/40 bg-danger-bg/50 px-3 py-2 text-[12.5px] font-semibold text-danger">REVERSED {detail.reversal ? `on ${formatDateTime(detail.reversal.reversedAt)} by ${detail.reversal.reversedByName}: ${detail.reversal.reason}` : ""}</p> : null}
          </header>

          <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 border-b border-dashed border-line-3 py-4 text-[12.5px]">
            <dt className="text-ink-3">Paid to</dt><dd className="font-semibold">{detail.supplierName}</dd>
            <dt className="text-ink-3">Amount</dt><dd className="font-semibold tabular"><MoneyText money={detail.amount} /></dd>
            <dt className="text-ink-3">Method</dt><dd>{SUPPLIER_PAYMENT_METHOD_LABELS[detail.method]}{detail.shiftId ? " · from the open cash drawer" : ""}</dd>
            {detail.reference ? <><dt className="text-ink-3">Reference</dt><dd className="font-mono" dir="ltr">{detail.reference}</dd></> : null}
            <dt className="text-ink-3">Recorded</dt><dd>{formatDateTime(detail.occurredAt)} by {detail.recordedByName}</dd>
            {detail.notes ? <><dt className="text-ink-3">Notes</dt><dd>{detail.notes}</dd></> : null}
          </dl>

          <section className="border-b border-dashed border-line-3 py-4">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Applied to</h2>
            <table className="mt-2 w-full text-[12.5px]">
              <thead className="text-start text-[11px] uppercase tracking-wide text-ink-3"><tr><th className="py-1 text-start font-medium">Payable</th><th className="py-1 text-end font-medium">Applied</th><th className="py-1 text-end font-medium">Still owed</th></tr></thead>
              <tbody>
                {detail.allocations.map((allocation) => {
                  const payable = detail.payables.find((candidate) => candidate.payableId === allocation.payableId);
                  return (
                    <tr key={allocation.payableId} className="border-t border-line-2">
                      <td className="py-2 pe-2 align-top">{allocation.sourceLabel}{payable ? <span className="block text-[11px] text-ink-3">{PAYABLE_STATUS_LABELS[payable.status]} · total {toMajor(payable.original).toFixed(3)}</span> : null}</td>
                      <td className="py-2 text-end align-top tabular" dir="ltr">{toMajor(allocation.amount).toFixed(3)}</td>
                      <td className="py-2 text-end align-top tabular" dir="ltr">{payable ? toMajor(payable.remaining).toFixed(3) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3 flex justify-between border-t border-line-2 pt-2 text-[13px]"><span className="text-ink-2">{detail.supplierName} still owed after this payment</span><MoneyText money={detail.supplierRemaining} className="font-semibold" /></div>
          </section>

          <footer className="space-y-1 pt-4 text-[11.5px] text-ink-2">
            <p>Operational record: {reversed ? "reversed" : "recorded"} in RIVET. Ledger: {ledgerStatusLabel(detail.ledgerPostingStatus).toLowerCase()}{detail.reversal ? `; reversal ${ledgerStatusLabel(detail.reversal.ledgerPostingStatus).toLowerCase()}` : ""}.</p>
            <p>Amounts in {currency}. This is a supplier remittance record, not a customer receipt.</p>
          </footer>
        </article>

        <aside className="no-print space-y-4 self-start">
          <section className="panel p-4">
            <h3 className="context-label mb-2.5">Status</h3>
            <div className="flex flex-wrap gap-1.5">{reversed ? <Badge variant="danger" dot>Reversed</Badge> : <Badge variant="success" dot>Recorded</Badge>}<LedgerStatusBadge status={detail.ledgerPostingStatus} /></div>
            {detail.reversal ? <p className="mt-2 text-[12px] text-ink-2">Reversal in ledger: {ledgerStatusLabel(detail.reversal.ledgerPostingStatus).toLowerCase()}.</p> : null}
            <p className="mt-2 text-[12px] text-ink-3">Recording a payment and posting it to the ledger are separate steps. Owners post from Statements → Ledger controls.</p>
          </section>
          <section className="panel p-4 text-[12.5px]">
            <h3 className="context-label mb-2.5">Next</h3>
            <ul className="space-y-2">
              <li><Link href={`/operations/payables?supplier=${encodeURIComponent(detail.supplierId)}`} className="underline decoration-line-3 underline-offset-2 hover:text-ink">Open {detail.supplierName}’s payables</Link></li>
              <li><Link href="/operations?tab=suppliers" className="underline decoration-line-3 underline-offset-2 hover:text-ink">Supplier directory</Link></li>
              <li><Link href="/operations/payables" className="underline decoration-line-3 underline-offset-2 hover:text-ink">All payables</Link></li>
            </ul>
          </section>
        </aside>
      </div>

      <ReverseSupplierPaymentDialog payment={detail} open={reverseOpen} onOpenChange={setReverseOpen} onReversed={async () => { setReverseOpen(false); await invalidate([qk.payables(), qk.supplierPayments()]); }} />
    </div>
  );
}
