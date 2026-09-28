"use client";

import { Download, FileBarChart } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { tabListClassName, tabTriggerClassName } from "@/components/ui/tabs";
import { DataPagination, Gate, PageHeader } from "@/components/shared/chrome";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/shared/data-display";
import { PAYMENT_METHOD_LABELS, TransactionStatusChip } from "@/components/shared/status-chip";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { formatDate, todayISODate } from "@/lib/utils/dates";
import { formatMoney, money } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { buildSectionedCsvDocument, exportStatusLabel, formatExportDateTime, formatMinorUnits } from "@/lib/exports/csv";
import { downloadTextFile } from "@/lib/exports/download";
import { OperationalReports, OPERATIONAL_REPORT_LABELS, OPERATIONAL_REPORT_QUESTIONS, type OperationalReportKind } from "@/features/reports/operational-reports";
import { countLabel, loadTransactionsInRange, summarizeRange } from "@/features/reports/overview-totals";
import { ReportScopeBar, parseReportScope, reportScopeFrom, reportScopeHref, type ReportScope } from "@/features/reports/report-scope";

type ReportsView = "overview" | OperationalReportKind;
const VIEWS: readonly ReportsView[] = ["overview", "peak-hours", "classes", "retention", "renewals", "collections", "crm", "controls"];
const OVERVIEW_QUESTION = "What came in, by which method and branch, and what is still unresolved?";
const TABLE_PAGE_SIZE = 25;

function parseView(value: string | null): ReportsView {
  return (VIEWS as readonly string[]).includes(value ?? "") ? (value as ReportsView) : "overview";
}

/**
 * Owner/manager reporting workspace. It deliberately composes the same
 * dashboard and transaction contracts used by the operating screens, so an
 * export cannot drift away from the ledger that staff see at the desk.
 */
function ReportsPageInner() {
  const { session } = useApp();
  const { can } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const branches = useMemo(() => session?.branches ?? [], [session?.branches]);
  const defaultBranchId = session?.activeBranchId ?? "all";
  const view = parseView(searchParams.get("view"));
  const scope = useMemo(() => parseReportScope(searchParams, { branches, defaultBranchId }), [searchParams, branches, defaultBranchId]);
  const from = reportScopeFrom(scope);
  const to = scope.to;
  const branchInput = scope.branchId === "all" ? undefined : scope.branchId;
  const [transactionPage, setTransactionPage] = useState(1);
  // The URL is the source of truth, but it updates a tick after replace();
  // the ref lets two quick edits (a pill, then a date) build on each other.
  const pendingScopeRef = useRef<ReportScope | null>(null);
  const pendingViewRef = useRef<ReportsView | null>(null);
  useEffect(() => { pendingScopeRef.current = null; }, [scope]);
  useEffect(() => { pendingViewRef.current = null; }, [view]);
  const hrefFor = (nextView: ReportsView, nextScope: ReportScope = scope) => reportScopeHref(pathname, nextView, nextScope, { defaultBranchId });
  // A tab clicked right after a scope edit must carry that edit, not the URL's old scope.
  const selectView = (event: React.MouseEvent<HTMLAnchorElement>, nextView: ReportsView) => {
    pendingViewRef.current = nextView;
    const pending = pendingScopeRef.current;
    if (!pending) return;
    event.preventDefault();
    router.replace(hrefFor(nextView, pending), { scroll: false });
  };
  const changeScope = (patch: Partial<ReportScope>) => {
    const nextScope = { ...(pendingScopeRef.current ?? scope), ...patch };
    pendingScopeRef.current = nextScope;
    setTransactionPage(1);
    router.replace(hrefFor(pendingViewRef.current ?? view, nextScope), { scroll: false });
  };
  const canRead = can("reports.financial.read");
  const overviewEnabled = Boolean(session) && canRead && view === "overview";

  const dashboardQuery = useApiQuery(
    qk.analytics("overview", { branchId: branchInput, from, to }),
    (api) => api.getDashboard({ branchId: branchInput, from, to }),
    { enabled: overviewEnabled },
  );
  const rangeQuery = useApiQuery(
    qk.analytics("overview-transactions", { branchId: branchInput, from, to }),
    (api) => loadTransactionsInRange(api, { branchId: branchInput, from, to }),
    { enabled: overviewEnabled },
  );

  const dashboard = dashboardQuery.data;
  const transactions = useMemo(() => rangeQuery.data?.items ?? [], [rangeQuery.data?.items]);
  const totals = useMemo(() => summarizeRange(transactions), [transactions]);
  const loading = dashboardQuery.isLoading || rangeQuery.isLoading;
  const error = dashboardQuery.isError ? dashboardQuery.error : rangeQuery.isError ? rangeQuery.error : undefined;
  const stale = dashboardQuery.isBackgroundError || rangeQuery.isBackgroundError;
  const refresh = () => { void dashboardQuery.refetch(); void rangeQuery.refetch(); };
  const tablePage = useMemo(() => {
    const totalItems = transactions.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / TABLE_PAGE_SIZE));
    const page = Math.min(transactionPage, totalPages);
    return { items: transactions.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE), page, pageSize: TABLE_PAGE_SIZE, totalItems, totalPages };
  }, [transactions, transactionPage]);
  // The desk ledger only understands rolling windows that end today.
  const ledgerHref = (params: Record<string, string>) => {
    if (to !== todayISODate()) return undefined;
    const query = new URLSearchParams({ range: String(scope.rangeDays), ...params });
    return `/payments?${query}`;
  };

  const exportReport = useApiMutation(async (api) => (await loadTransactionsInRange(api, { branchId: branchInput, from, to }, Number.POSITIVE_INFINITY)).items, {
    successMessage: (items) => `Exported all ${items.length} transactions in this report.`,
    onSuccess: (items) => {
      if (!dashboard) return;
      const timeZone = session?.organization.timezone ?? "Asia/Amman";
      const scopedBranch = branches.find((branch) => branch.id === scope.branchId);
      downloadTextFile({
        fileName: `rivet-finance-report-${from}-${to}.csv`,
        mimeType: "text/csv;charset=utf-8",
        content: buildSectionedCsvDocument({
          title: "Finance overview and transaction ledger",
          metadata: [
            { label: "Date range", value: `${from} to ${to}` },
            { label: "Timezone", value: timeZone },
            { label: "Branch scope", value: scopedBranch?.name ?? "All accessible branches" },
          ],
          sections: [
            {
              title: "Overview",
              headers: ["Metric", "Value"],
              rows: [
                ["Revenue today", formatMoney(dashboard.kpis.revenueToday)],
                ["Revenue this month", formatMoney(dashboard.kpis.revenueThisMonth)],
                ["Outstanding balance", formatMoney(dashboard.kpis.outstandingTotal)],
                ["New members this month", dashboard.kpis.newMembersThisMonth],
                ["Check-ins today", dashboard.kpis.checkInsToday],
              ],
            },
            {
              title: "Transactions",
              headers: ["When", "Member", "Member number", "Branch", "Payment method", "Transaction type", "Amount", "Currency", "Status", "Receipt number", "Recorded by", "External reference", "RIVET transaction ID"],
              rows: items.map((item) => [
                formatExportDateTime(item.occurredAt, timeZone),
                item.memberName,
                item.memberNumber,
                item.branchName,
                exportStatusLabel(item.method),
                exportStatusLabel(item.type),
                formatMinorUnits(item.amount.amount, item.amount.currency),
                item.amount.currency,
                exportStatusLabel(item.status),
                item.receiptNumber,
                item.collectedByName,
                item.externalReference,
                item.id,
              ]),
              emptyMessage: "No transactions in this date range.",
            },
          ],
        }),
      });
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description={view === "overview" ? OVERVIEW_QUESTION : OPERATIONAL_REPORT_QUESTIONS[view]}
        actions={view === "overview" ? <Button variant="signal" onClick={() => exportReport.mutate()} loading={exportReport.isPending} disabled={!dashboard || transactions.length === 0}><Download /> Export all transactions</Button> : undefined}
      />

      <Gate permission="reports.financial.read" fallback={<EmptyState icon={FileBarChart} title="Reports are restricted" description="Owner or manager access is required for financial reporting." />}>
        <nav aria-label="Report views" className={tabListClassName}>
          {VIEWS.map((kind) => (
            <Link key={kind} href={hrefFor(kind)} replace scroll={false} onClick={(event) => selectView(event, kind)} aria-current={view === kind ? "page" : undefined} className={tabTriggerClassName} data-tab-value={kind}>
              {kind === "overview" ? "Overview" : OPERATIONAL_REPORT_LABELS[kind]}
            </Link>
          ))}
        </nav>

        {view !== "overview" ? <OperationalReports view={view} scope={scope} branches={branches} onScopeChange={changeScope} /> : <>
        <ReportScopeBar branches={branches} scope={scope} onChange={changeScope} ranged onRefresh={refresh} refreshing={dashboardQuery.isFetching || rangeQuery.isFetching} note={rangeQuery.data?.truncated ? `first ${transactions.length} records` : undefined} />

        {stale ? <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="status" aria-label="Stale report data">Showing the last loaded figures; the latest refresh failed. <button type="button" className="font-medium underline" onClick={refresh}>Try again</button></div> : null}
        {error ? <ErrorState onRetry={refresh} /> : null}
        {loading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-24" />)}</div> : null}

        {dashboard && rangeQuery.data ? <>
          {/* Unresolved money and reversals first; healthy totals after. */}
          <section className="panel grid grid-cols-2 divide-line sm:grid-cols-3 xl:grid-cols-6" aria-label="Report totals">
            <ReportStat label="Outstanding now" value={<MoneyText money={dashboard.kpis.outstandingTotal} compact />} tone={dashboard.kpis.outstandingTotal.amount > 0 ? "warning" : undefined} context="unpaid member balances, all time" href={ledgerHref({ type: "payment" })} />
            <ReportStat label="Refunded" value={<MoneyText money={money(totals.refunded)} compact />} tone={totals.refunded > 0 ? "warning" : undefined} context={countLabel(totals.refundCount, "refund")} href={ledgerHref({ type: "refund" })} />
            <ReportStat label="Voided" value={<MoneyText money={money(totals.voided)} compact />} tone={totals.voided > 0 ? "warning" : undefined} context={countLabel(totals.voidCount, "void")} />
            <ReportStat label="Collected" value={<MoneyText money={money(totals.collected)} compact />} context={countLabel(totals.paymentCount, "payment")} />
            <ReportStat label="Net in range" value={<MoneyText money={money(totals.collected - totals.refunded)} compact signed={totals.collected - totals.refunded < 0} />} context="collected less refunds" />
            <ReportStat label="This month" value={<MoneyText money={dashboard.kpis.revenueThisMonth} compact />} context={`${dashboard.kpis.newMembersThisMonth} new member${dashboard.kpis.newMembersThisMonth === 1 ? "" : "s"}`} />
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <BreakdownPanel sectionLabel="Collections" title="By payment method" empty="No payments in this range." rows={totals.byMethod.map((row) => ({ key: row.key, label: PAYMENT_METHOD_LABELS[row.key] ?? row.key, count: row.count, amount: row.amount, refunds: row.refunds, href: ledgerHref({ method: row.key }) }))} />
            <BreakdownPanel sectionLabel="Branches" title="By branch" empty="No payments in this range." rows={totals.byBranch.map((row) => ({ key: row.key, label: row.key, count: row.count, amount: row.amount, refunds: row.refunds }))} />
          </div>

          <section className="panel overflow-hidden" aria-label="Transactions in range">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">Source records</p><h2 className="mt-1 text-[16px] font-semibold">Transactions in range</h2></div><Badge variant="outline">{transactions.length}{rangeQuery.data.truncated ? "+" : ""} records</Badge></header>
            {transactions.length === 0 ? <p className="p-5 text-[13px] text-ink-3">No transactions in this range.</p> : <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Member</TableHead><TableHead>Branch</TableHead><TableHead>Method</TableHead><TableHead>Type</TableHead><TableHead className="text-end">Amount</TableHead><TableHead>Status</TableHead><TableHead>Receipt</TableHead></TableRow></TableHeader>
                  <TableBody>{tablePage.items.map((item) => <TableRow key={item.id}><TableCell className="whitespace-nowrap text-[12px]">{formatDate(item.occurredAt)}</TableCell><TableCell><p className="font-medium">{item.memberName}</p><p className="font-mono text-[11px] text-ink-3">{item.memberNumber}</p></TableCell><TableCell className="text-[12px]">{item.branchName}</TableCell><TableCell className="text-[12px]">{PAYMENT_METHOD_LABELS[item.method] ?? item.method}</TableCell><TableCell className="text-[12px] capitalize">{item.type.replaceAll("_", " ")}</TableCell><TableCell className="text-end"><MoneyText money={item.amount} className={item.type === "refund" ? "text-danger" : undefined} /></TableCell><TableCell><TransactionStatusChip status={item.status} /></TableCell><TableCell>{ledgerHref({ q: item.receiptNumber }) ? <Link href={ledgerHref({ q: item.receiptNumber })!} className="font-mono text-[12px] underline decoration-line-3 underline-offset-2 hover:text-ink">{item.receiptNumber}</Link> : <span className="font-mono text-[12px]">{item.receiptNumber}</span>}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
              <div className="px-4 pb-3"><DataPagination page={tablePage} onPage={setTransactionPage} /></div>
            </>}
          </section>
        </> : null}
        </>}
      </Gate>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense>
      <ReportsPageInner />
    </Suspense>
  );
}

function ReportStat({ label, value, context, tone, href }: { label: string; value: React.ReactNode; context?: React.ReactNode; tone?: "warning"; href?: string }) {
  const body = (
    <>
      <p className="context-label">{label}</p>
      <div className={cn("mt-1 text-[20px] tabular", tone === "warning" && "text-warning-deep")}>{value}</div>
      {context ? <p className="mt-0.5 text-[12px] text-ink-3">{context}</p> : null}
    </>
  );
  const className = "block border-e border-line px-4 py-3.5 last:border-e-0";
  return href ? <Link href={href} className={cn(className, "transition-colors hover:bg-sunken/40")}>{body}<span className="sr-only">Open in Payments</span></Link> : <div className={className}>{body}</div>;
}

function BreakdownPanel({ sectionLabel, title, empty, rows }: { sectionLabel: string; title: string; empty: string; rows: Array<{ key: string; label: string; count: number; amount: number; refunds: number; href?: string }> }) {
  return (
    <section className="panel overflow-hidden" aria-label={title}>
      <header className="border-b border-line px-4 py-3"><p className="context-label">{sectionLabel}</p><h2 className="mt-1 text-[16px] font-semibold">{title}</h2></header>
      {rows.length === 0 ? <p className="p-5 text-[13px] text-ink-3">{empty}</p> : (
        <ul className="divide-y divide-line">
          {rows.map((row) => {
            const detail = <><p className="text-[13px] font-medium">{row.label}</p><p className="text-[12px] text-ink-3">{countLabel(row.count, "payment")}{row.refunds > 0 ? <> · <MoneyText money={money(row.refunds)} /> refunded</> : null}</p></>;
            const amount = <MoneyText money={money(row.amount)} />;
            return (
              <li key={row.key}>
                {row.href ? <Link href={row.href} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-sunken/40"><span className="min-w-0">{detail}</span>{amount}<span className="sr-only">Open in Payments</span></Link> : <div className="flex items-center justify-between gap-3 px-4 py-3"><span className="min-w-0">{detail}</span>{amount}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
