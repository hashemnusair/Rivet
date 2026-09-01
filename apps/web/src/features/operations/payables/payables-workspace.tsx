"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, Download, History, Receipt, Search as SearchIcon, WalletCards } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { PAYABLE_STATUS_LABELS } from "@/lib/domain/payables";
import type { Payable, PayableStatusFilter, PayablesQuery, SupplierPaymentDetail } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { downloadTextFile } from "@/lib/exports/download";
import { getApi } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { PageHeader, Stat } from "@/components/shared/chrome";
import { DateText, MoneyText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ForbiddenState, QueryErrorState } from "@/components/ui/states";
import { buildPayablesCsv } from "./payables-export";
import { LedgerStatusBadge } from "./ledger-status";
import { RecordSupplierPaymentDialog } from "./record-supplier-payment-dialog";
import { SupplierPaymentHistoryDialog, supplierPaymentHref } from "./supplier-payment-history-dialog";

const STATUS_FILTERS: Array<{ value: PayableStatusFilter; label: string }> = [
  { value: "open", label: "Open (unpaid and partially paid)" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "paid", label: "Paid" },
  { value: "reversed", label: "Reversed" },
  { value: "all", label: "Everything" },
];
const PAGE_SIZE = 25;
const ALL = "all";

function payableStatusVariant(status: Payable["status"]): "neutral" | "success" | "warning" | "danger" {
  if (status === "paid") return "success";
  if (status === "partially_paid") return "warning";
  if (status === "reversed") return "danger";
  return "neutral";
}

function ageTone(ageDays: number): string {
  if (ageDays > 90) return "text-danger";
  if (ageDays > 60) return "text-warning-deep";
  return "text-ink-3";
}

export interface PayablesWorkspaceProps {
  /** Rendered inside the Stock & purchasing page: no page header, branch follows the page. */
  embedded?: boolean;
  branchId?: string;
}

/**
 * Supplier payables: what the gym owes, oldest first. Every number is a
 * server projection; this screen only chooses filters and pages.
 */
export function PayablesWorkspace({ embedded = false, branchId: embeddedBranchId }: PayablesWorkspaceProps) {
  const { session } = useApp();
  const { can } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currency = session?.organization.currency ?? "JOD";
  const timeZone = session?.organization.timezone ?? "Asia/Amman";
  const branches = useMemo(() => session?.branches ?? [], [session?.branches]);
  const canRead = can("operations.manage") || can("reports.financial.read");
  const writeEnabled = can("operations.manage");

  const [branchId, setBranchId] = useState<string>(() => embeddedBranchId ?? session?.activeBranchId ?? ALL);
  const [supplierId, setSupplierId] = useState<string>(() => searchParams.get("supplier") ?? ALL);
  const [status, setStatus] = useState<PayableStatusFilter>("open");
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const [payDialog, setPayDialog] = useState<{ supplierId?: string; payable?: Payable } | null>(() => (searchParams.get("pay") ? { supplierId: searchParams.get("supplier") ?? undefined } : null));
  const [history, setHistory] = useState<{ payableId?: string; supplierId?: string; title: string; description?: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim(), 250);

  useEffect(() => { if (embedded) setBranchId(embeddedBranchId ?? ALL); }, [embedded, embeddedBranchId]);
  useEffect(() => { setCursors([]); }, [branchId, supplierId, status, debouncedSearch]);

  const filters = useMemo<PayablesQuery>(() => ({
    branchId: branchId === ALL ? undefined : branchId,
    supplierId: supplierId === ALL ? undefined : supplierId,
    status,
    search: debouncedSearch || undefined,
    pageSize: PAGE_SIZE,
    cursor: cursors[cursors.length - 1],
  }), [branchId, supplierId, status, debouncedSearch, cursors]);

  const payablesQuery = useApiQuery(qk.payables({ kind: "list", ...filters }), (api) => api.listPayables(filters), { enabled: canRead });
  const suppliersQuery = useApiQuery(qk.operations({ kind: "suppliers" }), (api) => api.listSuppliers(), { enabled: canRead });
  const reconciliationQuery = useApiQuery(qk.payables({ kind: "reconciliation", branchId: filters.branchId }), (api) => api.listPayablesReconciliation({ branchId: filters.branchId }), { enabled: canRead });

  if (!canRead) return <ForbiddenState description="Supplier payables are visible to purchasing managers and finance readers." />;

  const page = payablesQuery.data;
  const suppliers = suppliersQuery.data ?? [];
  const branchLabel = branchId === ALL ? "All branches" : branches.find((branch) => branch.id === branchId)?.name ?? "Branch";
  const supplierLabel = supplierId === ALL ? "All suppliers" : suppliers.find((supplier) => supplier.id === supplierId)?.name ?? "Supplier";
  const statusLabel = STATUS_FILTERS.find((entry) => entry.value === status)?.label ?? status;
  const pageStart = page ? cursors.length * PAGE_SIZE + (page.items.length ? 1 : 0) : 0;
  const pageEnd = page ? cursors.length * PAGE_SIZE + page.items.length : 0;
  const oldestOpen = page?.supplierTotals.map((row) => row.oldestReceivedAt).filter((value): value is string => Boolean(value)).sort()[0];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const exported = await getApi().exportPayables({ ...filters, cursor: undefined, pageSize: undefined });
      downloadTextFile({ content: buildPayablesCsv(exported, { timeZone, branchLabel, supplierLabel, statusLabel, search: debouncedSearch || undefined }), fileName: `rivet-payables-${new Date().toISOString().slice(0, 10)}.csv`, mimeType: "text/csv;charset=utf-8" });
      toast.success(exported.truncated ? `Exported the first ${exported.rows.length} payables. Narrow the filters to export the rest.` : `Exported ${exported.rows.length} payables.`);
    } catch {
      toast.error("The export could not be prepared. Try again.");
    } finally {
      setExporting(false);
    }
  };

  const onRecorded = (detail: SupplierPaymentDetail) => {
    setPayDialog(null);
    router.push(supplierPaymentHref(detail.id));
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <SearchIcon className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Supplier, order, or reference…" className="h-9 w-48 ps-8 sm:w-60" aria-label="Search payables" />
      </div>
      {!embedded ? (
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger aria-label="Payables branch" className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>All branches</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
        </Select>
      ) : null}
      <Select value={supplierId} onValueChange={setSupplierId}>
        <SelectTrigger aria-label="Payables supplier" className="h-9 w-44"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>All suppliers</SelectItem>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={status} onValueChange={(value) => setStatus(value as PayableStatusFilter)}>
        <SelectTrigger aria-label="Payables status" className="h-9 w-44"><SelectValue /></SelectTrigger>
        <SelectContent>{STATUS_FILTERS.map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant="secondary" size="sm" onClick={() => void exportCsv()} loading={exporting} disabled={!page}><Download /> Export CSV</Button>
      {writeEnabled ? <Button size="sm" onClick={() => setPayDialog({ supplierId: supplierId === ALL ? undefined : supplierId })} data-testid="open-record-supplier-payment"><WalletCards /> Record payment</Button> : null}
    </div>
  );

  return (
    <div className="space-y-4" data-testid="payables-workspace">
      {embedded ? <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-[15px] font-semibold">Payables</h2><p className="text-[12px] text-ink-3">What the gym still owes suppliers, oldest first.</p></div>{toolbar}</div>
        : <PageHeader eyebrow="Stock & purchasing" title="Payables" description="What the gym still owes suppliers, oldest first. Record a payment when money goes out; the ledger posts it separately." actions={toolbar} />}

      {payablesQuery.isLoading ? <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        : payablesQuery.isError ? <QueryErrorState error={payablesQuery.error} onRetry={() => void payablesQuery.refetch()} forbiddenDescription="Your role can’t read supplier payables for this workspace." />
          : page ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <section className="panel p-4"><Stat label="Outstanding" value={<MoneyText money={page.totals.outstanding} />} context={`${page.totals.openCount} open ${page.totals.openCount === 1 ? "payable" : "payables"} · ${branchLabel.toLowerCase()}`} /></section>
                <section className="panel p-4"><Stat label="Oldest open balance" value={oldestOpen ? <DateText iso={oldestOpen} /> : "—"} context={oldestOpen ? "Aged from the receiving date; RIVET does not invent due dates." : "Nothing is waiting to be paid."} /></section>
                <section className="panel p-4">
                  <p className="eyebrow">Aging</p>
                  <dl className="mt-2 grid grid-cols-4 gap-1 text-[11.5px]">
                    {page.aging.map((bucket) => <div key={bucket.bucket}><dt className="text-ink-3">{bucket.bucket} days</dt><dd className={cn("mt-0.5 font-medium tabular", bucket.bucket === "90+" && bucket.count > 0 && "text-danger")}><MoneyText money={bucket.outstanding} hideCurrency /></dd></div>)}
                  </dl>
                </section>
              </div>

              {page.supplierTotals.length > 1 ? (
                <section className="panel overflow-hidden">
                  <header className="border-b border-line px-4 py-2.5"><h3 className="text-[13px] font-semibold">By supplier</h3></header>
                  <ul className="divide-y divide-line">
                    {page.supplierTotals.map((row) => (
                      <li key={row.supplierId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                        <button type="button" className="min-w-0 text-start font-medium hover:underline" onClick={() => setSupplierId(row.supplierId)}>{row.supplierName}</button>
                        <span className="flex items-center gap-3 text-[12px] text-ink-2"><span>{row.openCount} open{row.oldestReceivedAt ? <> · oldest <DateText iso={row.oldestReceivedAt} /></> : null}</span><MoneyText money={row.outstanding} className="font-semibold text-ink" />{writeEnabled ? <Button size="xs" variant="secondary" onClick={() => setPayDialog({ supplierId: row.supplierId })}>Pay</Button> : null}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-start" data-testid="payables-table">
                    <caption className="sr-only">Supplier payables</caption>
                    <thead className="border-b border-line bg-sunken/40 text-[11px] uppercase tracking-wide text-ink-3">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Supplier</th>
                        <th className="px-4 py-2.5 font-medium">What was received</th>
                        <th className="px-4 py-2.5 font-medium">Received</th>
                        <th className="px-4 py-2.5 text-end font-medium">Original</th>
                        <th className="px-4 py-2.5 text-end font-medium">Paid</th>
                        <th className="px-4 py-2.5 text-end font-medium">Remaining</th>
                        <th className="px-4 py-2.5 font-medium">Status</th>
                        <th className="px-4 py-2.5 text-end font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {page.items.length === 0 ? (
                        <tr><td colSpan={8}><EmptyState compact title={status === "open" ? "Nothing to pay" : "No matching payables"} description={status === "open" ? "Received supplier orders appear here until they are paid. Private purchases and equipment costs are listed below for reconciliation." : "Try another status, supplier, or search."} className="m-4" /></td></tr>
                      ) : page.items.map((payable) => (
                        <tr key={payable.id} className="text-[12.5px]" data-testid="payable-row">
                          <td className="px-4 py-3"><span className="font-medium">{payable.supplierName}</span><span className="block text-[11px] text-ink-3">{payable.branchName}</span></td>
                          <td className="max-w-[280px] px-4 py-3"><Link href={payable.href} className="block truncate hover:underline">{payable.sourceLabel}</Link>{payable.externalReference ? <span className="block font-mono text-[11px] text-ink-3">{payable.externalReference}</span> : null}</td>
                          <td className="whitespace-nowrap px-4 py-3"><DateText iso={payable.receivedAt} /><span className={cn("block text-[11px]", ageTone(payable.ageDays))}>{payable.ageDays} {payable.ageDays === 1 ? "day" : "days"}{payable.dueDate ? <> · due <DateText iso={payable.dueDate} /></> : null}</span></td>
                          <td className="px-4 py-3 text-end tabular" dir="ltr"><MoneyText money={payable.original} hideCurrency /></td>
                          <td className="px-4 py-3 text-end tabular" dir="ltr"><MoneyText money={payable.paid} hideCurrency /></td>
                          <td className="px-4 py-3 text-end font-semibold tabular" dir="ltr"><MoneyText money={payable.remaining} hideCurrency /></td>
                          <td className="px-4 py-3"><div className="flex flex-wrap gap-1"><Badge variant={payableStatusVariant(payable.status)} dot>{PAYABLE_STATUS_LABELS[payable.status]}</Badge><LedgerStatusBadge status={payable.ledgerPostingStatus} /></div></td>
                          <td className="px-4 py-3 text-end">
                            <div className="flex items-center justify-end gap-1">
                              {writeEnabled && (payable.status === "unpaid" || payable.status === "partially_paid") ? <Button size="xs" onClick={() => setPayDialog({ supplierId: payable.supplierId, payable })} aria-label={`Pay ${payable.supplierName} for ${payable.sourceLabel}`}><WalletCards /> Pay</Button> : null}
                              <Button size="xs" variant="ghost" onClick={() => setHistory({ payableId: payable.id, title: "Payment history", description: `${payable.sourceLabel} · ${payable.supplierName}` })} aria-label={`Payment history for ${payable.sourceLabel}`}><History /> History</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {page.matchedCount > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[12px] text-ink-3">
                    <span className="tabular" dir="ltr">{pageStart}–{pageEnd} of {page.matchedCount}</span>
                    <div className="flex items-center gap-1">
                      <Button variant="secondary" size="icon-sm" disabled={cursors.length === 0} onClick={() => setCursors((current) => current.slice(0, -1))} aria-label="Previous page"><ChevronLeft /></Button>
                      <Button variant="secondary" size="icon-sm" disabled={!page.nextCursor} onClick={() => { if (page.nextCursor) setCursors((current) => [...current, page.nextCursor!]); }} aria-label="Next page"><ChevronRight /></Button>
                    </div>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}

      <section className="panel overflow-hidden" data-testid="payables-reconciliation">
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-sunken"><AlertTriangle className="size-3.5 text-ink-2" aria-hidden /></span>
            <div>
              <h3 className="text-[13px] font-semibold">Costs without a supplier account</h3>
              <p className="text-[11.5px] text-ink-3">Private purchases, equipment, repairs, and supplies also owe money, but RIVET cannot tell who to pay. They are listed here for reconciliation and never assigned to a supplier automatically.</p>
            </div>
          </div>
          {reconciliationQuery.data ? <span className="text-[12px] text-ink-2">{reconciliationQuery.data.count} {reconciliationQuery.data.count === 1 ? "item" : "items"} · <MoneyText money={reconciliationQuery.data.total} /></span> : null}
        </header>
        {reconciliationQuery.isLoading ? <div className="space-y-2 p-4"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          : reconciliationQuery.isError ? <div className="p-4"><QueryErrorState error={reconciliationQuery.error} onRetry={() => void reconciliationQuery.refetch()} /></div>
            : (reconciliationQuery.data?.items.length ?? 0) === 0 ? <p className="px-4 py-3 text-[12.5px] text-ink-3">Nothing to reconcile for this scope.</p>
              : (
                <ul className="divide-y divide-line">
                  {reconciliationQuery.data!.items.map((item) => (
                    <li key={item.id} className="grid gap-1 px-4 py-2.5 text-[12.5px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        <Link href={item.href} className="font-medium hover:underline">{item.sourceLabel}</Link>
                        <p className="text-[11.5px] text-ink-3">{item.branchName} · <DateText iso={item.recordedAt} />{item.vendorHint ? ` · ${item.vendorHint}` : ""}</p>
                        <p className="text-[11.5px] text-ink-2">{item.reason}</p>
                      </div>
                      <div className="flex items-center gap-2 sm:justify-end"><MoneyText money={item.amount} className="font-semibold" /><LedgerStatusBadge status={item.ledgerPostingStatus} /></div>
                    </li>
                  ))}
                  {reconciliationQuery.data!.truncated ? <li className="px-4 py-2 text-[11.5px] text-ink-3">Showing the newest {reconciliationQuery.data!.items.length}; choose one branch to see the rest.</li> : null}
                </ul>
              )}
      </section>

      {!embedded ? <p className="text-[11.5px] text-ink-3"><Receipt className="me-1 inline size-3.5" aria-hidden />Supplier payment confirmations open from each payment’s history. They are remittance records for the supplier, not customer receipts.</p> : null}

      <RecordSupplierPaymentDialog
        open={Boolean(payDialog)}
        onOpenChange={(next) => { if (!next) setPayDialog(null); }}
        suppliers={suppliers}
        branches={branches}
        currency={currency}
        initialBranchId={branchId === ALL ? session?.activeBranchId : branchId}
        initialSupplierId={payDialog?.supplierId}
        initialPayable={payDialog?.payable}
        onRecorded={onRecorded}
      />
      {history ? <SupplierPaymentHistoryDialog open onOpenChange={(next) => { if (!next) setHistory(null); }} query={{ payableId: history.payableId, supplierId: history.supplierId }} title={history.title} description={history.description} writeEnabled={writeEnabled} /> : null}
    </div>
  );
}
