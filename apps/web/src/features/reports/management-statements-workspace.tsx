"use client";

import {
  AlertTriangle,
  BarChart3,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  LockKeyhole,
  RefreshCw,
  Scale,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  BalanceSheet,
  CashflowSection,
  CashflowStatement,
  GeneralManagerAnalysis,
  IncomeStatement,
  ManagementAnalysisMetric,
  ManagementReportCompleteness,
  ManagementStatementSection,
  UUID,
  WorkspaceAccess,
} from "@/lib/domain/types";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp, usePermissions } from "@/lib/providers/app-providers";
import { addDays, formatDate, todayISODate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { PageHeader } from "@/components/shared/chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, ForbiddenState, QueryErrorState, StatePanel } from "@/components/ui/states";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceNav } from "@/features/finance/finance-nav";

type StatementsTab = "income" | "balance" | "cashflow" | "analysis";

const STATUS_LABELS: Record<string, string> = {
  available: "Available",
  not_available: "Not available",
  not_configured: "Not configured",
  proven: "Proven",
  unproven: "Unproven",
  refresh_required: "Refresh required",
  unavailable: "Unavailable",
};

const STATUS_VARIANTS: Record<string, "success" | "warning" | "neutral"> = {
  available: "success",
  not_available: "neutral",
  not_configured: "warning",
  proven: "success",
  unproven: "warning",
  refresh_required: "warning",
  unavailable: "neutral",
};

function statusLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function StatementLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading management statement">
      <div className="grid gap-3 sm:grid-cols-3">
        {(["a", "b", "c"] as const).map((key) => <Skeleton key={key} className="h-24" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

function ReportStatusBadge({ status }: { status: string }) {
  const normalized = status;
  const variant = STATUS_VARIANTS[normalized] ?? "neutral";
  return (
    <Badge variant={variant}>
      <span className="sr-only">Status: </span>
      {STATUS_LABELS[normalized] ?? statusLabel(status)}
    </Badge>
  );
}

function moneyAmount(value: unknown): value is { amount: number; currency: string } {
  return Boolean(value && typeof value === "object" && "amount" in value && "currency" in value);
}

function metricValue(metric: ManagementAnalysisMetric): ReactNode {
  if (metric.value === undefined || metric.value === null) return <span className="text-ink-3">—</span>;
  if (moneyAmount(metric.value)) return <MoneyText money={metric.value} />;
  const suffix = metric.unit === "days" ? " days" : metric.unit === "count" ? " records" : "";
  return <span dir="ltr" className="tabular">{metric.value}{suffix}</span>;
}

function SectionLines({ section, emptyLabel = "No posted lines in this scope." }: { section: ManagementStatementSection; emptyLabel?: string }) {
  if (section.lines.length === 0) return <p className="px-4 py-5 text-[12px] text-ink-3">{emptyLabel}</p>;
  return (
    <div className="divide-y divide-line">
      {section.lines.map((line) => (
        <div key={line.accountId} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{line.accountName}</p>
            <p className="font-mono text-[10px] text-ink-3" dir="ltr">{line.accountCode} · {line.entryIds.length} journal {line.entryIds.length === 1 ? "entry" : "entries"}</p>
          </div>
          <MoneyText money={line.amount} />
        </div>
      ))}
    </div>
  );
}

function StatementSectionCard({ title, section, tone }: { title: string; section: ManagementStatementSection; tone?: "positive" | "negative" }) {
  return (
    <section className="panel overflow-hidden" aria-label={title}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        <MoneyText money={section.total} className={tone === "positive" ? "text-success-deep" : tone === "negative" ? "text-warning-deep" : undefined} />
      </header>
      <SectionLines section={section} />
    </section>
  );
}

function SummaryCard({ label, value, context, tone = "default" }: { label: string; value: ReactNode; context?: ReactNode; tone?: "default" | "positive" | "warning" | "danger" }) {
  return (
    <section className="panel p-4">
      <p className="eyebrow">{label}</p>
      <div className={cn("mt-1.5 text-[21px] font-semibold leading-tight tabular", tone === "positive" && "text-success-deep", tone === "warning" && "text-warning-deep", tone === "danger" && "text-danger")}>{value}</div>
      {context ? <p className="mt-1.5 text-[11.5px] text-ink-3">{context}</p> : null}
    </section>
  );
}

function ReportErrorOrLoading({ loading, error, onRetry, title }: { loading: boolean; error: unknown; onRetry: () => void; title: string }) {
  if (loading) return <StatementLoading />;
  if (error) return <QueryErrorState error={error} onRetry={onRetry} notFoundTitle={`${title} unavailable`} />;
  return null;
}

function ReportMetadata({ report }: { report?: ManagementReportCompleteness }) {
  if (!report) return null;
  const counts = Object.entries(report.sourcePostingCounts).sort(([left], [right]) => left.localeCompare(right));
  return (
    <>
      <section className="panel overflow-hidden" aria-label="Statement metadata">
        <div className="grid gap-0 divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
          <div className="p-3.5"><p className="eyebrow">Reporting period</p><p className="mt-1 text-[12px] font-medium" dir="ltr">{formatDate(report.fromDate)} – {formatDate(report.toDate)}</p><p className="mt-0.5 text-[11px] text-ink-3">{report.timezone} · {report.branchId ? "Selected branch" : "All accessible branches"}</p></div>
          <div className="p-3.5"><p className="eyebrow">Generated</p><p className="mt-1 text-[12px] font-medium"><DateTimeText iso={report.generatedAt} /></p><p className="mt-0.5 text-[11px] text-ink-3">Amounts in <span dir="ltr">{report.currency}</span></p></div>
          <div className="p-3.5"><p className="eyebrow">Queue coverage</p><div className="mt-1 flex flex-wrap items-center gap-2"><ReportStatusBadge status={report.queueCoverage} /><span className="text-[11px] text-ink-3">{report.lastQueueProjectionAt ? <><DateTimeText iso={report.lastQueueProjectionAt} /></> : "No refresh timestamp"}</span></div></div>
          <div className="p-3.5"><p className="eyebrow">Policy versions</p><p className="mt-1 text-[12px] font-medium">{report.policyVersions.length > 0 ? report.policyVersions.map((policy) => `${policy.code} v${policy.version}`).join(" · ") : "None reported"}</p></div>
        </div>
        <div className="border-t border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-2"><p className="eyebrow me-1">Source status counts</p>{counts.length === 0 ? <span className="text-[11px] text-ink-3">No source statuses reported.</span> : counts.map(([status, count]) => <Badge key={status} variant={status === "posted" || status === "reversed" ? "success" : status === "pending" || status === "unconfigured" ? "warning" : status === "failed" ? "danger" : "signal"}><span className="capitalize">{statusLabel(status)}</span> <span dir="ltr">{count}</span></Badge>)}</div>
        </div>
      </section>
      {report.warnings.length > 0 ? <section className="rounded-md border border-warning/40 bg-warning-bg px-4 py-3 text-[12px] text-warning-deep" role="status" aria-label="Statement warnings"><div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><div><p className="font-medium">Completeness warnings</p><ul className="mt-1 list-disc space-y-0.5 ps-5">{report.warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}</ul></div></div></section> : null}
      <div className="flex items-start gap-2 rounded-md border border-line bg-sunken/30 px-4 py-3 text-[11.5px] text-ink-3"><CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden /><p>{report.disclaimer}</p></div>
    </>
  );
}

function IncomeStatementView({ report }: { report: IncomeStatement }) {
  const recognitionWarning = report.membershipRevenueRecognition !== "available";
  return (
    <div className="space-y-4" data-testid="income-statement">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Total revenue" value={<MoneyText money={report.totalRevenue} />} tone="positive" />
        <SummaryCard label="Total costs" value={<MoneyText money={report.totalCosts} />} tone="warning" />
        <SummaryCard label="Net income" value={<MoneyText money={report.netIncome} />} tone={report.netIncome.amount >= 0 ? "positive" : "danger"} context="Revenue less cost of sales, operating expenses, and other expenses." />
      </div>
      {recognitionWarning ? <div className="rounded-md border border-warning/40 bg-warning-bg px-4 py-3 text-[12px] text-warning-deep" role="status"><p className="font-medium">Membership revenue recognition is {(STATUS_LABELS[report.membershipRevenueRecognition] ?? statusLabel(report.membershipRevenueRecognition)).toLowerCase()}.</p><p className="mt-0.5">Deferred membership sales are not presented as earned revenue until a recognition policy is configured.</p></div> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <StatementSectionCard title="Revenue" section={report.revenue} tone="positive" />
        <StatementSectionCard title="Cost of sales" section={report.costOfSales} tone="negative" />
        <StatementSectionCard title="Operating expenses" section={report.operatingExpenses} tone="negative" />
        <StatementSectionCard title="Other income" section={report.otherIncome} tone="positive" />
        <StatementSectionCard title="Other expenses" section={report.otherExpenses} tone="negative" />
      </div>
    </div>
  );
}

function BalanceSheetView({ report }: { report: BalanceSheet }) {
  return (
    <div className="space-y-4" data-testid="balance-sheet">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Total assets" value={<MoneyText money={report.totalAssets} />} />
        <SummaryCard label="Liabilities" value={<MoneyText money={report.totalLiabilities} />} />
        <SummaryCard label="Liabilities + equity" value={<MoneyText money={report.totalLiabilitiesAndEquity} />} tone={report.balanced ? "positive" : "danger"} />
      </div>
      <section className={cn("rounded-md border px-4 py-3", report.balanced ? "border-success/40 bg-success-bg text-success-deep" : "border-danger/40 bg-danger-bg text-danger")} role="status" aria-label="Balance sheet equation">
        <div className="flex flex-wrap items-center gap-2"><Scale className="size-4" aria-hidden /><p className="font-medium">{report.balanced ? "Balance sheet equation reconciles" : "Balance sheet equation needs review"}</p><ReportStatusBadge status={report.balanced ? "available" : "not_available"} /></div>
        <p className="mt-1 text-[12px]">Assets = liabilities + equity + current earnings · difference <span dir="ltr" className="font-medium"><MoneyText money={report.difference} /></span></p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <StatementSectionCard title="Current assets" section={report.assets.current} />
        <StatementSectionCard title="Non-current assets" section={report.assets.noncurrent} />
        <StatementSectionCard title="Current liabilities" section={report.liabilities.current} />
        <StatementSectionCard title="Non-current liabilities" section={report.liabilities.noncurrent} />
        <StatementSectionCard title="Equity" section={report.equity} />
        <SummaryCard label="Cumulative earnings" value={<MoneyText money={report.currentEarnings} />} context="Earnings accumulated through the as-of date and included in the equation." />
      </div>
    </div>
  );
}

function CashflowSectionCard({ section }: { section: CashflowSection }) {
  return <section className="panel overflow-hidden" aria-label={`${section.category} cashflow`}><header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><h3 className="text-[14px] font-semibold capitalize">{section.category} activities</h3><MoneyText money={section.netChange} signed /></header><SectionLines section={{ lines: section.lines, total: section.netChange }} emptyLabel={`No ${section.category} cash movements in this scope.`} /></section>;
}

function CashflowView({ report }: { report: CashflowStatement }) {
  const reconciliation = report.reconciliation;
  const reconciliationProven = report.reconciliationStatus === "proven";
  return (
    <div className="space-y-4" data-testid="cashflow-statement">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Opening cash" value={<MoneyText money={report.openingCash} />} />
        <SummaryCard label="Net change" value={<MoneyText money={report.netChange} signed />} tone={report.netChange.amount >= 0 ? "positive" : "danger"} />
        <SummaryCard label="Closing cash" value={<MoneyText money={report.closingCash} />} tone={report.balanced ? "positive" : "warning"} />
      </div>
      <section className={cn("rounded-md border px-4 py-3", reconciliationProven ? "border-success/40 bg-success-bg text-success-deep" : "border-warning/40 bg-warning-bg text-warning-deep")} role="status" aria-label="Cashflow reconciliation"><div className="flex flex-wrap items-center gap-2">{reconciliationProven ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}<p className="font-medium">{reconciliationProven ? "Cashflow reconciles" : "Cashflow reconciliation needs review"}</p><ReportStatusBadge status={report.reconciliationStatus} /></div><p className="mt-1 text-[12px]">Opening cash + net change = expected closing cash <span dir="ltr" className="font-medium"><MoneyText money={reconciliation.expectedClosingCash} /></span> · independent as-of cash <span dir="ltr" className="font-medium"><MoneyText money={reconciliation.asOfCash} /></span> · difference <span dir="ltr" className="font-medium"><MoneyText money={reconciliation.difference} /></span></p>{reconciliation.note ? <p className="mt-1 text-[11px]">{reconciliation.note}</p> : null}</section>
      <div className="grid gap-4 lg:grid-cols-3"><CashflowSectionCard section={report.operating} /><CashflowSectionCard section={report.investing} /><CashflowSectionCard section={report.financing} /></div>
      <div className="flex items-start gap-2 rounded-md border border-line bg-sunken/30 px-4 py-3 text-[11.5px] text-ink-3"><Banknote className="mt-0.5 size-4 shrink-0" aria-hidden /><p><span className="font-medium text-ink-2">Classification policy:</span> {report.classificationPolicy.description} <span dir="ltr">({report.classificationPolicy.code} v{report.classificationPolicy.version})</span></p></div>
    </div>
  );
}

function AnalysisMetricCard({ metric }: { metric: ManagementAnalysisMetric }) {
  return (
    <section className="panel p-4" aria-label={metric.label}>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="eyebrow">{metric.label}</p><p className="mt-1 text-[21px] font-semibold tabular">{metricValue(metric)}</p></div><ReportStatusBadge status={metric.status} /></div>
      {metric.note ? <p className="mt-2 text-[12px] text-ink-2">{metric.note}</p> : null}
      <p className="mt-2 text-[11px] text-ink-3">{metric.sourceCount} source {metric.sourceCount === 1 ? "record" : "records"}{metric.drilldownIds.length > 0 ? ` · ${metric.drilldownIds.length} drilldown ${metric.drilldownIds.length === 1 ? "ID" : "IDs"}` : ""}</p>
      {metric.drilldownIds.length > 0 ? <details className="mt-2 text-[10px] text-ink-3"><summary className="cursor-pointer font-medium text-ink-2">View identifiers</summary><div className="mt-1 space-y-0.5 font-mono" dir="ltr">{metric.drilldownIds.slice(0, 5).map((id) => <div key={id}>{id}</div>)}{metric.drilldownIds.length > 5 ? <div>+{metric.drilldownIds.length - 5} more</div> : null}</div></details> : null}
    </section>
  );
}

function AnalysisView({ report }: { report: GeneralManagerAnalysis }) {
  return <div className="space-y-4" data-testid="gm-analysis"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{report.metrics.length === 0 ? <EmptyState icon={BarChart3} title="No management metrics available" description="The reporting contract returned no configured metrics for this scope." compact className="sm:col-span-2 xl:col-span-3" /> : report.metrics.map((metric) => <AnalysisMetricCard key={metric.key} metric={metric} />)}</div><p className="text-[11.5px] text-ink-3">Metrics are shown only when the reporting contract provides a status, source count, and bounded drilldown identifiers. No inferred insight is added here.</p></div>;
}

function reportsForInput(input: { fromDate: string; toDate: string; branchId?: UUID }) {
  return input;
}

export function ManagementStatementsWorkspace() {
  const { session, sessionLoading } = useApp();
  const { can } = usePermissions();
  const [tab, setTab] = useState<StatementsTab>("income");
  const [fromDate, setFromDate] = useState(addDays(todayISODate(), -29));
  const [toDate, setToDate] = useState(todayISODate());
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const canRead = can("reports.financial.read");

  useEffect(() => {
    if (branchFilter !== "all" && !session?.branches.some((branch) => branch.id === branchFilter)) setBranchFilter("all");
  }, [branchFilter, session?.branches]);

  const scopeBranchId = branchFilter === "all" ? undefined : branchFilter;
  const validRange = fromDate.length > 0 && toDate.length > 0 && fromDate <= toDate;
  const reportInput = useMemo(() => reportsForInput({ fromDate, toDate, branchId: scopeBranchId }), [fromDate, toDate, scopeBranchId]);
  const workspaceQuery = useApiQuery(qk.workspaceAccess, (api) => api.getWorkspaceAccess(), { enabled: Boolean(session) && canRead });
  const workspace = workspaceQuery.data as WorkspaceAccess | undefined;
  const reportingModule = workspace?.modules.find((module) => module.key === "reporting");
  const ready = Boolean(reportingModule?.entitled && reportingModule.enabled && validRange);

  const incomeQuery = useApiQuery(qk.managementReports({ kind: "income", ...reportInput }), (api) => api.getIncomeStatement(reportInput), { enabled: ready });
  const balanceQuery = useApiQuery(qk.managementReports({ kind: "balance", ...reportInput }), (api) => api.getBalanceSheet(reportInput), { enabled: ready });
  const cashflowQuery = useApiQuery(qk.managementReports({ kind: "cashflow", ...reportInput }), (api) => api.getCashflowStatement(reportInput), { enabled: ready });
  const analysisQuery = useApiQuery(qk.managementReports({ kind: "analysis", ...reportInput }), (api) => api.getGeneralManagerAnalysis(reportInput), { enabled: ready });

  const metadata = incomeQuery.data ?? balanceQuery.data ?? cashflowQuery.data ?? analysisQuery.data;
  const reportError = incomeQuery.error ?? balanceQuery.error ?? cashflowQuery.error ?? analysisQuery.error;
  const loading = incomeQuery.isLoading || balanceQuery.isLoading || cashflowQuery.isLoading || analysisQuery.isLoading;
  const readOnly = !(session?.roles.some((role) => role === "owner" || role === "manager") ?? false);
  const refresh = () => { void Promise.all([incomeQuery.refetch(), balanceQuery.refetch(), cashflowQuery.refetch(), analysisQuery.refetch()]); };

  if (sessionLoading && !session) return <><PageHeader eyebrow="Reporting" title="Management statements" description="Loading your reporting workspace…" /><StatementLoading /></>;
  if (!canRead) return <ForbiddenState description="Management statements are limited to roles with financial reporting access." />;
  if (workspaceQuery.isLoading) return <><PageHeader eyebrow="Reporting" title="Management statements" description="Loading your reporting workspace…" /><StatementLoading /></>;
  if (workspaceQuery.error || !workspace) return <QueryErrorState error={workspaceQuery.error} onRetry={() => void workspaceQuery.refetch()} />;
  if (!reportingModule?.entitled) return <StatePanel icon={LockKeyhole} title="Management reporting is not included" description="The Pro reporting workspace module adds financial statements and general-manager analysis." className="mt-4" />;
  if (!reportingModule.enabled) return <StatePanel icon={LockKeyhole} title="Management reporting is paused" description="An organization owner can enable the reporting module from workspace settings." className="mt-4" />;

  return (
    <div className="space-y-5" data-testid="management-statements-workspace">
      <PageHeader eyebrow="Reporting · management accounting" title="Management statements" description="Read-only statements and decision support from posted management-ledger facts. This workspace does not claim statutory accounting compliance." actions={<><Badge variant="outline">{readOnly ? "Read-only access" : "Read-only statement view"}</Badge><Button type="button" variant="secondary" onClick={refresh} disabled={loading}><RefreshCw className={loading ? "animate-spin" : undefined} /> Refresh</Button></>} />
      <FinanceNav />
      <section className="panel flex flex-wrap items-end gap-3 p-4" aria-label="Statement scope filters">
        <Field label="From date" className="w-full sm:w-44"><Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} dir="ltr" /></Field>
        <Field label="To date" className="w-full sm:w-44"><Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} dir="ltr" /></Field>
        <Field label="Branch scope" className="w-full sm:w-64"><Select value={branchFilter} onValueChange={setBranchFilter}><SelectTrigger aria-label="Statement branch scope"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All accessible branches</SelectItem>{session?.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></Field>
        <div className="ms-auto flex items-center gap-2 pb-0.5"><CalendarDays className="size-4 text-ink-3" aria-hidden /><span className="text-[11.5px] text-ink-3">{branchFilter === "all" ? "Consolidated accessible scope" : session?.branches.find((branch) => branch.id === branchFilter)?.name}</span></div>
        {!validRange ? <p className="basis-full text-[12px] text-danger" role="alert">Choose a from date on or before the to date.</p> : null}
      </section>

      {reportError && !loading ? <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="status">Some statement panels could not refresh. Panels that loaded remain visible. <button type="button" className="font-medium underline" onClick={refresh}>Retry all</button></div> : null}
      <ReportMetadata report={metadata} />

      <Tabs value={tab} onValueChange={(value) => setTab(value as StatementsTab)}>
        <TabsList className="max-w-full overflow-x-auto" aria-label="Management statements"><TabsTrigger value="income"><TrendingUp className="size-3.5" /> Income statement</TabsTrigger><TabsTrigger value="balance"><Scale className="size-3.5" /> Balance sheet</TabsTrigger><TabsTrigger value="cashflow"><Banknote className="size-3.5" /> Cashflow</TabsTrigger><TabsTrigger value="analysis"><BarChart3 className="size-3.5" /> GM analysis</TabsTrigger></TabsList>
        <TabsContent value="income"><ReportErrorOrLoading loading={incomeQuery.isLoading} error={incomeQuery.error} onRetry={() => void incomeQuery.refetch()} title="Income statement" />{incomeQuery.data ? <IncomeStatementView report={incomeQuery.data} /> : null}</TabsContent>
        <TabsContent value="balance"><ReportErrorOrLoading loading={balanceQuery.isLoading} error={balanceQuery.error} onRetry={() => void balanceQuery.refetch()} title="Balance sheet" />{balanceQuery.data ? <BalanceSheetView report={balanceQuery.data} /> : null}</TabsContent>
        <TabsContent value="cashflow"><ReportErrorOrLoading loading={cashflowQuery.isLoading} error={cashflowQuery.error} onRetry={() => void cashflowQuery.refetch()} title="Cashflow statement" />{cashflowQuery.data ? <CashflowView report={cashflowQuery.data} /> : null}</TabsContent>
        <TabsContent value="analysis"><ReportErrorOrLoading loading={analysisQuery.isLoading} error={analysisQuery.error} onRetry={() => void analysisQuery.refetch()} title="General-manager analysis" />{analysisQuery.data ? <AnalysisView report={analysisQuery.data} /> : null}</TabsContent>
      </Tabs>
    </div>
  );
}
