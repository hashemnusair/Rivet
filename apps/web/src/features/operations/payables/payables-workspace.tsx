"use client";
import { useLocale } from "@/lib/i18n/provider";

import { isApiError } from "@/lib/api/errors";

import { AlertTriangle, ChevronLeft, ChevronRight, Download, History, Receipt, Search as SearchIcon, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { qk } from "@/lib/api/keys";
import { payableStatusLabel, payableSourceLabel, payableReconciliationReason } from "@/lib/i18n/payables";
import type { TKey } from "@/lib/i18n/core";
import { useFormat } from "@/lib/i18n/format";
import type { Payable, PayableStatusFilter, PayablesQuery, SupplierPaymentDetail } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useDebouncedValue } from "@/lib/hooks/use-debounced";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { downloadTextFile } from "@/lib/exports/download";
import { getApi } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { PageHeader } from "@/components/shared/chrome";
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

const STATUS_FILTERS: Array<{ value: PayableStatusFilter; label: TKey }> = [
  { value: "open", label: "payablesWorkspace.notFull" },
  { value: "unpaid", label: "payablesWorkspace.unpaid" },
  { value: "partially_paid", label: "payablesWorkspace.partiallyPaid" },
  { value: "paid", label: "payablesWorkspace.paid" },
  { value: "reversed", label: "payablesWorkspace.reversed" },
  { value: "all", label: "stockWorkspace.all" },
];
const PAGE_SIZE = 25;
const ALL = "all";

function payableStatusVariant(status: Payable["status"]): "neutral" | "success" | "warning" | "danger" {
  if (status === "paid") return "success";
  if (status === "partially_paid") return "warning";
  if (status === "reversed") return "danger";
  return "neutral";
}

const AGING_LABELS: Record<string, TKey> = {
  "0-30": "payablesWorkspace.age30",
  "31-60": "payablesWorkspace.age60",
  "61-90": "payablesWorkspace.age90",
  "90+": "payablesWorkspace.ageOver90",
};

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
  const { t, locale, isolate } = useLocale();
  const f = useFormat();
  const { session } = useApp();
  const { can } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currency = session?.organization.currency ?? "JOD";
  const timeZone = session?.organization.timezone ?? "Asia/Amman";
  const branches = useMemo(() => session?.branches ?? [], [session?.branches]);
  const canRead = can("operations.manage") || can("reports.financial.read");
  const writeEnabled = can("operations.manage");

  const [branchId, setBranchId] = useState<string>(() => embeddedBranchId ?? searchParams.get("branch") ?? session?.activeBranchId ?? ALL);
  const [supplierId, setSupplierId] = useState<string>(() => searchParams.get("supplier") ?? ALL);
  const [status, setStatus] = useState<PayableStatusFilter>(() => STATUS_FILTERS.find((entry) => entry.value === searchParams.get("status"))?.value ?? "open");
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [cursors, setCursors] = useState<string[]>([]);
  const [payDialog, setPayDialog] = useState<{ supplierId?: string; payable?: Payable } | null>(() => (searchParams.get("pay") ? { supplierId: searchParams.get("supplier") ?? undefined } : null));
  const [history, setHistory] = useState<{ payableId?: string; supplierId?: string; sourceLabel: string; supplierName: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  const filterQuery = searchParams.toString();
  useEffect(() => {
    const current = new URLSearchParams(filterQuery);
    setSupplierId(current.get("supplier") ?? ALL);
    setStatus(STATUS_FILTERS.find((entry) => entry.value === current.get("status"))?.value ?? "open");
    setSearch(current.get("search") ?? "");
  }, [filterQuery]);

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

  if (!canRead) return <ForbiddenState description={t("payablesWorkspace.noBillsAccess")} />;

  const page = payablesQuery.data;
  const suppliers = suppliersQuery.data ?? [];
  const branchLabel = branchId === ALL ? t("common.label.allBranches") : branches.find((branch) => branch.id === branchId)?.name ?? t("common.label.branch");
  const supplierLabel = supplierId === ALL ? t("payablesWorkspace.allSuppliers") : suppliers.find((supplier) => supplier.id === supplierId)?.name ?? t("stockWorkspace.supplier");
  const statusLabel = t(STATUS_FILTERS.find((entry) => entry.value === status)?.label ?? "stockWorkspace.all");
  const pageStart = page ? cursors.length * PAGE_SIZE + (page.items.length ? 1 : 0) : 0;
  const pageEnd = page ? cursors.length * PAGE_SIZE + page.items.length : 0;
  const oldestOpen = page?.supplierTotals.map((row) => row.oldestReceivedAt).filter((value): value is string => Boolean(value)).sort()[0];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const exported = await getApi().exportPayables({ ...filters, cursor: undefined, pageSize: undefined });
      downloadTextFile({ content: buildPayablesCsv(exported, { locale, timeZone, branchLabel, supplierLabel, statusLabel, search: debouncedSearch || undefined }), fileName: `rivet-payables-${new Date().toISOString().slice(0, 10)}.csv`, mimeType: "text/csv;charset=utf-8" });
      toast.success(exported.truncated ? t("payablesWorkspace.downloadedFirst", { count: f.number(exported.rows.length) }) : t("payablesWorkspace.downloaded", { count: exported.rows.length }));
    } catch {
      toast.error(t("payablesWorkspace.downloadFailed"));
    } finally {
      setExporting(false);
    }
  };

  const onRecorded = (detail: SupplierPaymentDetail) => {
    setPayDialog(null);
    router.push(supplierPaymentHref(detail.id));
  };

  const toolbar = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative">
        <SearchIcon className="absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
        <Input value={search} onChange={(event) => setSearch(event.target.value)} onBlur={() => updateFilter("search", search)} placeholder={t("payablesWorkspace.searchPlaceholder")} className="h-9 w-60 max-w-full ps-8" aria-label={t("payablesWorkspace.searchBills")} />
      </div>
      {!embedded ? (
        <Select value={branchId} onValueChange={(value) => { setBranchId(value); updateFilter("branch", value); }}>
          <SelectTrigger aria-label={t("common.label.branch")} className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value={ALL}>{t("common.label.allBranches")}</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent>
        </Select>
      ) : null}
      <Select value={supplierId} onValueChange={(value) => { setSupplierId(value); updateFilter("supplier", value); }}>
        <SelectTrigger aria-label={t("stockWorkspace.supplier")} className="h-9 w-44"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>{t("payablesWorkspace.allSuppliers")}</SelectItem>{suppliers.map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={status} onValueChange={(value) => { setStatus(value as PayableStatusFilter); updateFilter("status", value); }}>
        <SelectTrigger aria-label={t("payablesWorkspace.billStatus")} className="h-9 w-64 max-w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{STATUS_FILTERS.map((entry) => <SelectItem key={entry.value} value={entry.value}>{t(entry.label)}</SelectItem>)}</SelectContent>
      </Select>

    </div>
  );

  return (
    <div className="space-y-4" data-testid="payables-workspace">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {embedded ? <div><h2 className="text-[15px] font-semibold">{t("palette.pages.supplierBills")}</h2><p className="text-[12px] text-ink-2">{t("payablesWorkspace.oldestFirstHint")}</p></div> : <PageHeader title={t("palette.pages.supplierBills")} description={t("payablesWorkspace.workspaceHint")} />}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => void exportCsv()} loading={exporting} disabled={!page}><Download /> {" "}{t("payablesWorkspace.downloadCsv")}</Button>
          {writeEnabled ? <Button size="sm" onClick={() => setPayDialog({ supplierId: supplierId === ALL ? undefined : supplierId })} data-testid="open-record-supplier-payment"><WalletCards /> {" "}{t("payablesWorkspace.recordPayment")}</Button> : null}
        </div>
      </div>
      {toolbar}

      {payablesQuery.isLoading ? <div className="grid gap-3 sm:grid-cols-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        : payablesQuery.isError && (!page || (isApiError(payablesQuery.error) && ["FORBIDDEN", "UNAUTHENTICATED"].includes(payablesQuery.error.code))) ? <QueryErrorState error={payablesQuery.error} onRetry={() => void payablesQuery.refetch()} forbiddenDescription={t("payablesWorkspace.noBillsAccess")} />
          : page ? (
            <>
              {payablesQuery.isError ? <p role="status" className="text-[12px] text-warning-deep">{t("payablesWorkspace.staleBills")}{" "}<Button variant="ghost" size="sm" onClick={() => void payablesQuery.refetch()}>{t("common.action.retry")}</Button></p> : null}
              <div className="panel grid divide-y divide-line sm:grid-cols-3 sm:divide-y-0">
                <section className="p-4"><p className="context-label">{t("payablesWorkspace.youOwe")}</p><p className="mt-1 text-xl font-semibold tabular-nums"><MoneyText money={page.totals.outstanding} /></p><p className="mt-1 text-[12px] text-ink-2">{t("payablesWorkspace.billsToPay", { count: page.totals.openCount })} · <bdi>{branchLabel}</bdi></p></section>
                <section className="p-4"><p className="context-label">{t("payablesWorkspace.oldestUnpaid")}</p><p className="mt-1 text-[14px] font-medium">{oldestOpen ? <DateText iso={oldestOpen} /> : t("payablesWorkspace.nothingToPay")}</p><p className="mt-1 text-[12px] text-ink-2">{t("payablesWorkspace.ageHint")}</p></section>
                <section className="p-4"><p className="context-label">{t("payablesWorkspace.ageHeading")}</p><dl className="mt-2 grid grid-cols-4 gap-2 text-[12px]">{page.aging.map((bucket) => <div key={bucket.bucket}><dt className="text-ink-3">{AGING_LABELS[bucket.bucket] ? t(AGING_LABELS[bucket.bucket]!) : t("payablesWorkspace.ageUnknown", { days: bucket.bucket })}</dt><dd className={cn("mt-0.5 font-medium tabular-nums", bucket.bucket === "90+" && bucket.count > 0 && "text-danger")}><MoneyText money={bucket.outstanding} hideCurrency /></dd></div>)}</dl></section>
              </div>

              {page.supplierTotals.length > 1 ? (
                <section className="panel overflow-hidden">
                  <header className="border-b border-line px-4 py-2.5"><h3 className="text-[13px] font-semibold">{t("payablesWorkspace.bySupplier")}</h3></header>
                  <ul className="divide-y divide-line">
                    {page.supplierTotals.map((row) => (
                      <li key={row.supplierId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
                        <button type="button" className="min-w-0 text-start font-medium hover:underline" onClick={() => { setSupplierId(row.supplierId); updateFilter("supplier", row.supplierId); }}>{row.supplierName}</button>
                        <span className="flex items-center gap-3 text-[12px] text-ink-2"><span>{t("payablesWorkspace.billsToPay", { count: row.openCount })}{row.oldestReceivedAt ? t("payablesWorkspace.oldestDate", { date: f.date(row.oldestReceivedAt) }) : null}</span><MoneyText money={row.outstanding} className="font-semibold text-ink" />{writeEnabled ? <Button size="xs" variant="secondary" onClick={() => setPayDialog({ supplierId: row.supplierId })}>{t("payablesWorkspace.pay")}</Button> : null}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="panel overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-start" data-testid="payables-table">
                    <caption className="sr-only">{t("palette.pages.supplierBills")}</caption>
                    <thead className="border-b border-line bg-sunken/40 text-[12px] text-ink-3">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">{t("stockWorkspace.supplier")}</th>
                        <th className="px-4 py-2.5 font-medium">{t("payablesWorkspace.receivedContents")}</th>
                        <th className="px-4 py-2.5 font-medium">{t("payablesWorkspace.received")}</th>
                        <th className="px-4 py-2.5 text-end font-medium">{t("common.label.total")}</th>
                        <th className="px-4 py-2.5 text-end font-medium">{t("payablesWorkspace.paid")}</th>
                        <th className="px-4 py-2.5 text-end font-medium">{t("renewFlow.receipt.stillOwed")}</th>
                        <th className="px-4 py-2.5 font-medium">{t("common.label.status")}</th>
                        <th className="px-4 py-2.5 text-end font-medium">{t("common.label.actions")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {page.items.length === 0 ? (
                        <tr><td colSpan={8}><EmptyState compact title={status === "open" ? t("payablesWorkspace.nothingToPay") : t("payablesWorkspace.noMatching")} description={status === "open" ? t("payablesWorkspace.emptyOpenHint") : t("payablesWorkspace.tryFilters")} className="m-4" /></td></tr>
                      ) : page.items.map((payable) => (
                        <tr key={payable.id} className="text-[12.5px]" data-testid="payable-row">
                          <td className="px-4 py-3"><span className="font-medium">{payable.supplierName}</span><span className="block text-[12px] text-ink-3">{payable.branchName}</span></td>
                          <td className="max-w-[280px] px-4 py-3"><Link href={payable.href} className="block truncate hover:underline">{payableSourceLabel(payable.sourceLabel, t)}</Link>{payable.externalReference ? <span className="block font-mono text-[12px] text-ink-3">{payable.externalReference}</span> : null}</td>
                          <td className="whitespace-nowrap px-4 py-3"><DateText iso={payable.receivedAt} /><span className={cn("block text-[12px]", ageTone(payable.ageDays))}>{t("payablesWorkspace.days", { count: payable.ageDays })}{payable.dueDate ? t("payablesWorkspace.due", { date: f.date(payable.dueDate) }) : null}</span></td>
                          <td className="px-4 py-3 text-end tabular" dir="ltr"><MoneyText money={payable.original} hideCurrency /></td>
                          <td className="px-4 py-3 text-end tabular" dir="ltr"><MoneyText money={payable.paid} hideCurrency /></td>
                          <td className="px-4 py-3 text-end font-semibold tabular" dir="ltr"><MoneyText money={payable.remaining} hideCurrency /></td>
                          <td className="px-4 py-3"><div className="flex flex-wrap gap-1"><Badge variant={payableStatusVariant(payable.status)} dot>{payableStatusLabel(payable.status, t)}</Badge><LedgerStatusBadge status={payable.ledgerPostingStatus} /></div></td>
                          <td className="px-4 py-3 text-end">
                            <div className="flex items-center justify-end gap-1">
                              {writeEnabled && (payable.status === "unpaid" || payable.status === "partially_paid") ? <Button size="xs" onClick={() => setPayDialog({ supplierId: payable.supplierId, payable })} aria-label={t("payablesWorkspace.payNamed", { supplier: isolate(payable.supplierName), bill: isolate(payableSourceLabel(payable.sourceLabel, t)) })}><WalletCards /> {" "}{t("payablesWorkspace.pay")}</Button> : null}
                              <Button size="xs" variant="ghost" onClick={() => setHistory({ payableId: payable.id, sourceLabel: payable.sourceLabel, supplierName: payable.supplierName })} aria-label={t("payablesWorkspace.historyNamed", { bill: isolate(payableSourceLabel(payable.sourceLabel, t)) })}><History />{" "}{t("marketing.device.phone.visitsValue")}</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {page.matchedCount > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[12px] text-ink-3">
                    <span className="tabular">{t("common.pagination.showing", { from: f.number(pageStart), to: f.number(pageEnd), total: f.number(page.matchedCount) })}</span>
                    <div className="flex items-center gap-1">
                      <Button variant="secondary" size="icon-sm" disabled={cursors.length === 0} onClick={() => setCursors((current) => current.slice(0, -1))} aria-label={t("common.pagination.previous")}><ChevronLeft className="rtl:rotate-180" /></Button>
                      <Button variant="secondary" size="icon-sm" disabled={!page.nextCursor} onClick={() => { if (page.nextCursor) setCursors((current) => [...current, page.nextCursor!]); }} aria-label={t("common.pagination.next")}><ChevronRight className="rtl:rotate-180" /></Button>
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
              <h3 className="text-[13px] font-semibold">{t("payablesWorkspace.costsNoSupplier")}</h3>
              <p className="text-[12px] text-ink-3">{t("payablesWorkspace.costsHint")}</p>
            </div>
          </div>
          {reconciliationQuery.data ? <span className="text-[12px] text-ink-2">{t("payablesWorkspace.items", { count: reconciliationQuery.data.count })} · <MoneyText money={reconciliationQuery.data.total} /></span> : null}
        </header>
        {reconciliationQuery.isLoading ? <div className="space-y-2 p-4"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
          : reconciliationQuery.isError ? <div className="p-4"><QueryErrorState error={reconciliationQuery.error} onRetry={() => void reconciliationQuery.refetch()} /></div>
            : (reconciliationQuery.data?.items.length ?? 0) === 0 ? <p className="px-4 py-3 text-[12.5px] text-ink-3">{t("payablesWorkspace.noCosts")}</p>
              : (
                <ul className="divide-y divide-line">
                  {reconciliationQuery.data!.items.map((item) => (
                    <li key={item.id} className="grid gap-1 px-4 py-2.5 text-[12.5px] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        <Link href={item.href} className="font-medium hover:underline">{payableSourceLabel(item.sourceLabel, t)}</Link>
                        <p className="text-[12px] text-ink-3">{item.branchName} · <DateText iso={item.recordedAt} />{item.vendorHint ? ` · ${item.vendorHint}` : ""}</p>
                        <p className="text-[12px] text-ink-2">{payableReconciliationReason(item.reason, t)}</p>
                      </div>
                      <div className="flex items-center gap-2 sm:justify-end"><MoneyText money={item.amount} className="font-semibold" /><LedgerStatusBadge status={item.ledgerPostingStatus} /></div>
                    </li>
                  ))}
                  {reconciliationQuery.data!.truncated ? <li className="px-4 py-2 text-[12px] text-ink-3">{t("payablesWorkspace.newest", { count: f.number(reconciliationQuery.data!.items.length) })}</li> : null}
                </ul>
              )}
      </section>

      {!embedded ? <p className="text-[12px] text-ink-3"><Receipt className="me-1 inline size-3.5" aria-hidden />{t("payablesWorkspace.printHistoryHint")}</p> : null}

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
      {history ? <SupplierPaymentHistoryDialog open onOpenChange={(next) => { if (!next) setHistory(null); }} query={{ payableId: history.payableId, supplierId: history.supplierId }} title={t("memberProfile.payments.historyLabel")} description={`${payableSourceLabel(history.sourceLabel, t)} · ${history.supplierName}`} writeEnabled={writeEnabled} /> : null}
    </div>
  );
}
