"use client";

import { Download, FileBarChart, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader, Gate } from "@/components/shared/chrome";
import { DataPagination } from "@/components/shared/chrome";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MoneyText } from "@/components/shared/data-display";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { addDays, formatDate, todayISODate } from "@/lib/utils/dates";
import { formatMoney, money } from "@/lib/utils/money";
import { buildSectionedCsvDocument, exportStatusLabel, formatExportDateTime, formatMinorUnits } from "@/lib/exports/csv";
import { downloadTextFile } from "@/lib/exports/download";
import type { TransactionSummary } from "@/lib/domain/types";
import { OperationalReports, OPERATIONAL_REPORT_LABELS, type OperationalReportKind } from "@/features/reports/operational-reports";

type Range = 7 | 30 | 90;

/**
 * Owner/manager reporting workspace. It deliberately composes the same
 * dashboard and transaction contracts used by the operating screens, so an
 * export cannot drift away from the ledger that staff see at the desk.
 */
type ReportsView = "overview" | OperationalReportKind;

export default function ReportsPage() {
  const { session } = useApp();
  const { can } = usePermissions();
  const [view, setView] = useState<ReportsView>("overview");
  const [range, setRange] = useState<Range>(30);
  const [to, setTo] = useState(todayISODate());
  const [transactionPage, setTransactionPage] = useState(1);
  const from = addDays(to, -(range - 1));

  const dashboardQuery = useApiQuery(
    qk.dashboard(session?.activeBranchId),
    (api) => api.getDashboard({ branchId: session?.activeBranchId, from, to }),
    { enabled: Boolean(session) && can("reports.financial.read") && view === "overview" },
  );
  const transactionsQuery = useApiQuery(
    qk.transactions({ report: true, branchId: session?.activeBranchId, from, to, page: transactionPage }),
    (api) => api.listTransactions({ branchId: session?.activeBranchId, from, to, page: transactionPage, pageSize: 25, sort: "-occurredAt" }),
    { enabled: Boolean(session) && can("reports.financial.read") && view === "overview" },
  );

  const dashboard = dashboardQuery.data;
  const transactions = useMemo(() => transactionsQuery.data?.items ?? [], [transactionsQuery.data?.items]);
  const loading = dashboardQuery.isLoading || transactionsQuery.isLoading;
  const error = dashboardQuery.error ?? transactionsQuery.error;
  const paymentBreakdown = useMemo(() => summarizePayments(transactions), [transactions]);
  const collected = dashboard?.kpis.revenueThisMonth ?? money(0);
  const refunds = transactions.filter((item) => item.type === "refund").reduce((sum, item) => sum + item.amount.amount, 0);

  const exportReport = useApiMutation(async (api) => {
    const all: TransactionSummary[] = [];
    let nextPage = 1;
    let totalPages = 1;
    do {
      const result = await api.listTransactions({ branchId: session?.activeBranchId, from, to, page: nextPage, pageSize: 100, sort: "-occurredAt" });
      all.push(...result.items);
      totalPages = result.totalPages;
      nextPage += 1;
    } while (nextPage <= totalPages);
    return all;
  }, {
    successMessage: (items) => `Exported all ${items.length} transactions in this report.`,
    onSuccess: (items) => {
      if (!dashboard) return;
      const timeZone = session?.organization.timezone ?? "Asia/Amman";
      const activeBranch = session?.branches.find((branch) => branch.id === session.activeBranchId);
      downloadTextFile({
        fileName: `rivet-finance-report-${from}-${to}.csv`,
        mimeType: "text/csv;charset=utf-8",
        content: buildSectionedCsvDocument({
          title: "Finance overview and transaction ledger",
          metadata: [
            { label: "Date range", value: `${from} to ${to}` },
            { label: "Timezone", value: timeZone },
            { label: "Branch scope", value: activeBranch?.name ?? "All accessible branches" },
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
        eyebrow="Finance"
        title="Reports"
        description="Revenue, collections, and member activity over any date range."
        actions={view === "overview" ? <Button variant="signal" onClick={() => exportReport.mutate()} loading={exportReport.isPending} disabled={!dashboard || (transactionsQuery.data?.totalItems ?? 0) === 0}><Download /> Export all transactions</Button> : undefined}
      />

      <Gate permission="reports.financial.read" fallback={<EmptyState icon={FileBarChart} title="Reports are restricted" description="Owner or manager access is required for financial reporting." />}>
        <nav aria-label="Report views" className="flex flex-wrap items-center gap-1 border-b border-line pb-2">
          {(["overview", "peak-hours", "classes", "retention", "renewals", "collections", "crm", "controls"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-current={view === kind ? "page" : undefined}
              onClick={() => setView(kind)}
              className={`cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] transition-colors ${view === kind ? "bg-ink text-paper" : "text-ink-2 hover:bg-sunken hover:text-ink"}`}
            >
              {kind === "overview" ? "Overview" : OPERATIONAL_REPORT_LABELS[kind]}
            </button>
          ))}
        </nav>

        {view !== "overview" ? <OperationalReports view={view} /> : <>
        <section className="panel flex flex-wrap items-end gap-3 p-4">
          <div className="flex gap-1.5">
            {[7, 30, 90].map((value) => <Button key={value} size="sm" variant={range === value ? "primary" : "secondary"} onClick={() => { setRange(value as Range); setTransactionPage(1); }}>{value} days</Button>)}
          </div>
          <label className="grid gap-1 text-[11px] text-ink-3">End date<Input type="date" value={to} onChange={(event) => { setTo(event.target.value); setTransactionPage(1); }} className="h-9 w-40" /></label>
          <Button variant="ghost" size="sm" className="ms-auto" onClick={() => { void dashboardQuery.refetch(); void transactionsQuery.refetch(); }}><RefreshCw /> Refresh</Button>
          <p className="basis-full text-[11px] text-ink-3">Showing {formatDate(from)} through {formatDate(to)}{session?.activeBranchId ? " · active branch" : " · all accessible branches"}.</p>
        </section>

        {error ? <ErrorState onRetry={() => { void dashboardQuery.refetch(); void transactionsQuery.refetch(); }} /> : null}
        {loading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-28" />)}</div> : null}

        {dashboard ? <>
          <section className="panel grid grid-cols-2 divide-line sm:grid-cols-3 xl:grid-cols-6" aria-label="Report totals">
            <ReportStat label="Collected" value={<MoneyText money={collected} compact />} />
            <ReportStat label="Today" value={<MoneyText money={dashboard.kpis.revenueToday} />} />
            <ReportStat label="Outstanding" value={<MoneyText money={dashboard.kpis.outstandingTotal} compact />} tone={dashboard.kpis.outstandingTotal.amount > 0 ? "warning" : undefined} />
            <ReportStat label="New members" value={dashboard.kpis.newMembersThisMonth} />
            <ReportStat label="Check-ins" value={dashboard.kpis.checkInsToday} />
            <ReportStat label="Refunds in view" value={<MoneyText money={money(refunds)} />} tone={refunds > 0 ? "warning" : undefined} />
          </section>

          <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
            <section className="panel overflow-hidden"><header className="border-b border-line px-4 py-3"><p className="eyebrow">Collections</p><h2 className="mt-1 text-[16px] font-semibold">By payment method</h2></header><div className="divide-y divide-line">{paymentBreakdown.length === 0 ? <p className="p-5 text-[13px] text-ink-3">No transactions in this range.</p> : paymentBreakdown.map((item) => <div key={item.method} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-[13px] font-medium capitalize">{item.method.replace("_", " ")}</p><p className="text-[11px] text-ink-3">{item.count} transaction{item.count === 1 ? "" : "s"}</p></div><MoneyText money={money(item.amount)} /></div>)}</div></section>
            <section className="panel overflow-hidden"><header className="border-b border-line px-4 py-3"><p className="eyebrow">Branches</p><h2 className="mt-1 text-[16px] font-semibold">Operating comparison</h2></header><div className="divide-y divide-line">{dashboard.branchRevenue.map((branch) => <div key={branch.branchId} className="flex items-center justify-between gap-4 px-4 py-3"><div className="min-w-0"><p className="truncate text-[13px] font-medium">{branch.branchName}</p><p className="text-[11px] text-ink-3">{branch.activeMembers} active members · {branch.checkInsToday} check-ins</p></div><MoneyText money={branch.collected} /></div>)}</div></section>
          </div>

          <section className="panel overflow-hidden"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3"><div><p className="eyebrow">Ledger export</p><h2 className="mt-1 text-[16px] font-semibold">Transactions in range</h2></div><Badge variant="outline">{transactionsQuery.data?.totalItems ?? 0} records</Badge></header>{transactions.length === 0 ? <p className="p-5 text-[13px] text-ink-3">No transactions in this range.</p> : <><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Member</TableHead><TableHead>Branch</TableHead><TableHead>Method</TableHead><TableHead>Type</TableHead><TableHead className="text-end">Amount</TableHead><TableHead>Status</TableHead><TableHead>Receipt</TableHead></TableRow></TableHeader><TableBody>{transactions.map((item) => <TableRow key={item.id}><TableCell className="whitespace-nowrap text-[11.5px]">{formatDate(item.occurredAt)}</TableCell><TableCell><p className="font-medium">{item.memberName}</p><p className="font-mono text-[10px] text-ink-3">{item.memberNumber}</p></TableCell><TableCell className="text-[12px]">{item.branchName}</TableCell><TableCell className="text-[12px] capitalize">{item.method.replace("_", " ")}</TableCell><TableCell className="text-[12px] capitalize">{item.type}</TableCell><TableCell className="text-end"><MoneyText money={item.amount} /></TableCell><TableCell><Badge variant={item.status === "completed" ? "success" : item.status === "voided" ? "signal" : "warning"}>{item.status}</Badge></TableCell><TableCell className="font-mono text-[10px]">{item.receiptNumber}</TableCell></TableRow>)}</TableBody></Table></div>{transactionsQuery.data ? <div className="px-4 pb-3"><DataPagination page={transactionsQuery.data} onPage={setTransactionPage} /></div> : null}</>}</section>
        </> : null}
        </>}
      </Gate>
    </div>
  );
}

function ReportStat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warning" }) {
  return <div className="border-e border-line px-4 py-3.5 last:border-e-0"><p className="eyebrow">{label}</p><div className={tone === "warning" ? "mt-1 text-[20px] tabular text-warning-deep" : "mt-1 text-[20px] tabular"}>{value}</div></div>;
}

function summarizePayments(items: TransactionSummary[]) {
  const map = new Map<string, { method: string; amount: number; count: number }>();
  for (const item of items) {
    if (item.type !== "payment" || item.status === "voided") continue;
    const current = map.get(item.method) ?? { method: item.method, amount: 0, count: 0 };
    current.amount += item.amount.amount;
    current.count += 1;
    map.set(item.method, current);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}
