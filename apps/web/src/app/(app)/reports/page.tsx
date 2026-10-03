"use client";
import { useLocale, useT } from "@/lib/i18n/provider";

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
import { TransactionStatusChip } from "@/components/shared/status-chip";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { todayISODate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { buildSectionedCsvDocument, formatExportDateTime, formatMinorUnits } from "@/lib/exports/csv";
import { downloadTextFile } from "@/lib/exports/download";
import { OperationalReports, OPERATIONAL_REPORT_LABELS, OPERATIONAL_REPORT_QUESTIONS, type OperationalReportKind } from "@/features/reports/operational-reports";
import { loadTransactionsInRange, summarizeRange } from "@/features/reports/overview-totals";
import { useFormat, useFormattingTimeZone } from "@/lib/i18n/format";
import type { TFunction, TKey } from "@/lib/i18n/core";
import { ReportScopeBar, parseReportScope, reportScopeFrom, reportScopeHref, type ReportScope } from "@/features/reports/report-scope";

function paymentMethodLabel(method: string, t: TFunction): string {
  return ["cash", "card", "bank_transfer", "cliq", "other"].includes(method) ? t(`domain.paymentMethod.${method}` as TKey) : method;
}

type ReportsView = "overview" | OperationalReportKind;
const VIEWS: readonly ReportsView[] = ["overview", "peak-hours", "classes", "retention", "renewals", "collections", "crm", "controls"];

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
  const { t, locale } = useLocale();
  const f = useFormat();
  const timeZone = useFormattingTimeZone();
  const { session } = useApp();
  const { can } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const branches = useMemo(() => session?.branches ?? [], [session?.branches]);
  const currency = session?.organization.currency ?? "JOD";
  const defaultBranchId = session?.activeBranchId ?? "all";
  const view = parseView(searchParams.get("view"));
  const scope = useMemo(() => parseReportScope(searchParams, { branches, defaultBranchId, timeZone }), [searchParams, branches, defaultBranchId, timeZone]);
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
  const hrefFor = (nextView: ReportsView, nextScope: ReportScope = scope) => reportScopeHref(pathname, nextView, nextScope, { defaultBranchId, timeZone });
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
    if (to !== todayISODate(timeZone)) return undefined;
    const query = new URLSearchParams({ range: String(scope.rangeDays), ...params });
    return `/payments?${query}`;
  };

  const exportReport = useApiMutation(async (api) => {
    // Freeze the report scope with the request; a tab/filter or language change
    // while the download loads must not relabel another range's transactions.
    const snapshot = { dashboard, from, to, timeZone, branchName: branches.find(branch => branch.id === scope.branchId)?.name };
    const items = (await loadTransactionsInRange(api, { branchId: branchInput, from, to }, Number.POSITIVE_INFINITY)).items;
    return { ...snapshot, items };
  }, {
    successMessage: ({ items }) => t("reportsWorkspace.downloaded", { count: items.length }),
    onSuccess: ({ items, dashboard, from, to, timeZone, branchName }) => {
      if (!dashboard) return;
      downloadTextFile({
        fileName: `rivet-finance-report-${from}-${to}.csv`,
        mimeType: "text/csv;charset=utf-8",
        content: buildSectionedCsvDocument({
          locale,
          title: t("reportsWorkspace.overviewCsvTitle"),
          metadata: [
            { label: t("statements.dateRange"), value: t("reportsWorkspace.range", { from: f.date(from), to: f.date(to) }) },
            { label: t("reportsWorkspace.timezone"), value: timeZone },
            { label: t("reportsWorkspace.branches"), value: branchName ?? t("statements.allBranches") },
          ],
          sections: [
            {
              title: t("nav.section.overview"),
              headers: [t("reportsWorkspace.item"), t("reportsWorkspace.value")],
              rows: [
                [t("reportsWorkspace.revenueToday"), f.money(dashboard.kpis.revenueToday)],
                [t("reportsWorkspace.revenueMonth"), f.money(dashboard.kpis.revenueThisMonth)],
                [t("reportsWorkspace.unpaid"), f.money(dashboard.kpis.outstandingTotal)],
                [t("reportsWorkspace.newMembersMonth"), dashboard.kpis.newMembersThisMonth],
                [t("reportsWorkspace.checkinsToday"), dashboard.kpis.checkInsToday],
              ],
            },
            {
              title: t("reportsWorkspace.paymentsRefunds"),
              headers: [t("reportsWorkspace.when"), t("reportsWorkspace.member"), t("reportsWorkspace.memberNumber"), t("reportsWorkspace.branch"), t("reportsWorkspace.paymentMethod"), t("reportsWorkspace.type"), t("reportsWorkspace.amount"), t("reportsWorkspace.currency"), t("reportsWorkspace.status"), t("reportsWorkspace.receiptNumber"), t("reportsWorkspace.recordedBy"), t("reportsWorkspace.bankReference"), t("reportsWorkspace.paymentId")],
              rows: items.map((item) => [
                formatExportDateTime(item.occurredAt, timeZone, locale),
                item.memberName,
                item.memberNumber,
                item.branchName,
                paymentMethodLabel(item.method, t),
                t(`domain.transactionType.${item.type}`),
                formatMinorUnits(item.amount.amount, item.amount.currency),
                item.amount.currency,
                t(`domain.transactionStatus.${item.status}`),
                item.receiptNumber,
                item.collectedByName,
                item.externalReference,
                item.id,
              ]),
              emptyMessage: t("reportsWorkspace.noRangePayments"),
            },
          ],
        }),
      });
    },
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("nav.item.reports")}
        description={view === "overview" ? t("reportsWorkspace.overviewQuestion") : t(OPERATIONAL_REPORT_QUESTIONS[view])}
        actions={view === "overview" ? <Button variant="signal" onClick={() => exportReport.mutate()} loading={exportReport.isPending} disabled={!dashboard || transactions.length === 0}><Download /> {" "}{t("reportsWorkspace.download")}</Button> : undefined}
      />

      <Gate permission="reports.financial.read" fallback={<EmptyState icon={FileBarChart} title={t("reportsWorkspace.forbidden")} description={t("reportsWorkspace.forbiddenHint")} />}>
        <nav aria-label={t("reportsWorkspace.views")} className={tabListClassName}>
          {VIEWS.map((kind) => (
            <Link key={kind} href={hrefFor(kind)} replace scroll={false} onClick={(event) => selectView(event, kind)} aria-current={view === kind ? "page" : undefined} className={tabTriggerClassName} data-tab-value={kind}>
              {kind === "overview" ? t("nav.section.overview") : t(OPERATIONAL_REPORT_LABELS[kind])}
            </Link>
          ))}
        </nav>

        {view !== "overview" ? <OperationalReports view={view} scope={scope} branches={branches} onScopeChange={changeScope} /> : <>
        <ReportScopeBar branches={branches} scope={scope} onChange={changeScope} ranged onRefresh={refresh} refreshing={dashboardQuery.isFetching || rangeQuery.isFetching} note={rangeQuery.data?.truncated ? t("reportsWorkspace.truncated", { count: transactions.length }) : undefined} />

        {stale ? <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="status" aria-label={t("reportsWorkspace.outdated")}>{t("reportsWorkspace.overviewOutdated")}{" "}<button type="button" className="font-medium underline" onClick={refresh}>{t("common.action.retry")}</button></div> : null}
        {error ? <ErrorState onRetry={refresh} /> : null}
        {loading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-24" />)}</div> : null}

        {dashboard && rangeQuery.data ? <>
          {/* Unresolved money and reversals first; healthy totals after. */}
          <section className="panel grid grid-cols-2 divide-line sm:grid-cols-3 xl:grid-cols-6" aria-label={t("reportsWorkspace.totals")}>
            <ReportStat label={t("reportsWorkspace.unpaid")} value={<MoneyText money={dashboard.kpis.outstandingTotal} compact />} tone={dashboard.kpis.outstandingTotal.amount > 0 ? "warning" : undefined} context={t("reportsWorkspace.owedAnyDate")} href={ledgerHref({ type: "payment" })} />
            <ReportStat label={t("memberProfile.pt.orderStatus.refunded")} value={<MoneyText money={money(totals.refunded, currency)} compact />} tone={totals.refunded > 0 ? "warning" : undefined} context={t("reportsWorkspace.refundCount", { count: totals.refundCount })} href={ledgerHref({ type: "refund" })} />
            <ReportStat label={t("reportsWorkspace.cancelledPayments")} value={<MoneyText money={money(totals.voided, currency)} compact />} tone={totals.voided > 0 ? "warning" : undefined} context={t("reportsWorkspace.payments", { count: totals.voidCount })} />
            <ReportStat label={t("dashboard.owner.collected")} value={<MoneyText money={money(totals.collected, currency)} compact />} context={t("reportsWorkspace.payments", { count: totals.paymentCount })} />
            <ReportStat label={t("reportsWorkspace.afterRefunds")} value={<MoneyText money={money(totals.collected - totals.refunded, currency)} compact signed={totals.collected - totals.refunded < 0} />} context={t("reportsWorkspace.collectedMinusRefunds")} />
            <ReportStat label={t("common.time.thisMonth")} value={<MoneyText money={dashboard.kpis.revenueThisMonth} compact />} context={t("reportsWorkspace.newMembers", { count: dashboard.kpis.newMembersThisMonth })} />
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <BreakdownPanel currency={currency} sectionLabel={t("reportsWorkspace.paymentsCollected")} title={t("reportsWorkspace.byMethod")} empty={t("reportsWorkspace.noPayments")} rows={totals.byMethod.map((row) => ({ key: row.key, label: paymentMethodLabel(row.key, t), count: row.count, amount: row.amount, refunds: row.refunds, href: ledgerHref({ method: row.key }) }))} />
            <BreakdownPanel currency={currency} sectionLabel={t("reportsWorkspace.paymentsCollected")} title={t("reportsWorkspace.byBranch")} empty={t("reportsWorkspace.noPayments")} rows={totals.byBranch.map((row) => ({ key: row.key, label: row.key, count: row.count, amount: row.amount, refunds: row.refunds }))} />
          </div>

          <section className="panel overflow-hidden" aria-label={t("reportsWorkspace.paymentsRefunds")}>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3"><div><p className="context-label">{t("reportsWorkspace.behindTotals")}</p><h2 className="mt-1 text-[16px] font-semibold">{t("reportsWorkspace.paymentsRefunds")}</h2></div><Badge variant="outline">{t(rangeQuery.data.truncated ? "reportsWorkspace.rowsTruncated" : "reportsWorkspace.rows", { count: transactions.length })}</Badge></header>
            {transactions.length === 0 ? <p className="p-5 text-[13px] text-ink-3">{t("reportsWorkspace.noPaymentsRefunds")}</p> : <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>{t("members.tabs.checkIns.when")}</TableHead><TableHead>{t("palette.kind.member")}</TableHead><TableHead>{t("common.label.branch")}</TableHead><TableHead>{t("renewFlow.shared.method")}</TableHead><TableHead>{t("common.label.type")}</TableHead><TableHead className="text-end">{t("common.label.amount")}</TableHead><TableHead>{t("common.label.status")}</TableHead><TableHead>{t("renewFlow.payment.receipt")}</TableHead></TableRow></TableHeader>
                  <TableBody>{tablePage.items.map((item) => <TableRow key={item.id}><TableCell className="whitespace-nowrap text-[12px]">{f.date(item.occurredAt)}</TableCell><TableCell><p className="font-medium">{item.memberName}</p><p className="font-mono text-[11px] text-ink-3"><bdi dir="ltr">{item.memberNumber}</bdi></p></TableCell><TableCell className="text-[12px]">{item.branchName}</TableCell><TableCell className="text-[12px]">{paymentMethodLabel(item.method, t)}</TableCell><TableCell className="text-[12px]">{t(`domain.transactionType.${item.type}`)}</TableCell><TableCell className="text-end"><MoneyText money={item.amount} className={item.type === "refund" ? "text-danger" : undefined} /></TableCell><TableCell><TransactionStatusChip status={item.status} /></TableCell><TableCell>{ledgerHref({ q: item.receiptNumber }) ? <Link href={ledgerHref({ q: item.receiptNumber })!} className="font-mono text-[12px] underline decoration-line-3 underline-offset-2 hover:text-ink"><bdi dir="ltr">{item.receiptNumber}</bdi></Link> : <span className="font-mono text-[12px]"><bdi dir="ltr">{item.receiptNumber}</bdi></span>}</TableCell></TableRow>)}</TableBody>
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
  const t = useT();
  const body = (
    <>
      <p className="context-label">{label}</p>
      <div className={cn("mt-1 text-[20px] tabular", tone === "warning" && "text-warning-deep")}>{value}</div>
      {context ? <p className="mt-0.5 text-[12px] text-ink-3">{context}</p> : null}
    </>
  );
  const className = "block border-e border-line px-4 py-3.5 last:border-e-0";
  return href ? <Link href={href} className={cn(className, "transition-colors hover:bg-sunken/40")}>{body}<span className="sr-only">{t("reportsWorkspace.openPayments")}</span></Link> : <div className={className}>{body}</div>;
}

function BreakdownPanel({ currency, sectionLabel, title, empty, rows }: { currency: string; sectionLabel: string; title: string; empty: string; rows: Array<{ key: string; label: string; count: number; amount: number; refunds: number; href?: string }> }) {
  const t = useT();
  return (
    <section className="panel overflow-hidden" aria-label={title}>
      <header className="border-b border-line px-4 py-3"><p className="context-label">{sectionLabel}</p><h2 className="mt-1 text-[16px] font-semibold">{title}</h2></header>
      {rows.length === 0 ? <p className="p-5 text-[13px] text-ink-3">{empty}</p> : (
        <ul className="divide-y divide-line">
          {rows.map((row) => {
            const detail = <><p className="text-[13px] font-medium">{row.label}</p><p className="text-[12px] text-ink-3">{t("reportsWorkspace.payments", { count: row.count })}{row.refunds > 0 ? <> · <MoneyText money={money(row.refunds, currency)} /> {" "}{t("reportsWorkspace.refundedSuffix")}</> : null}</p></>;
            const amount = <MoneyText money={money(row.amount, currency)} />;
            return (
              <li key={row.key}>
                {row.href ? <Link href={row.href} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-sunken/40"><span className="min-w-0">{detail}</span>{amount}<span className="sr-only">{t("reportsWorkspace.openPayments")}</span></Link> : <div className="flex items-center justify-between gap-3 px-4 py-3"><span className="min-w-0">{detail}</span>{amount}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
