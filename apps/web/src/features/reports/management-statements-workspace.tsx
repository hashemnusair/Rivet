"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  LockKeyhole,
  RefreshCw,
  Scale,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  BalanceSheet,
  CashflowSection,
  CashflowStatement,
  IncomeStatement,
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
import { MoneyText } from "@/components/shared/data-display";
import { PageHeader } from "@/components/shared/chrome";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { ForbiddenState, QueryErrorState, StatePanel } from "@/components/ui/states";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScopePills } from "./report-scope";

export type ManagementStatementKind = "income" | "balance" | "cashflow";

/** Journal entries live in Ledger controls; the link keeps the statement's branch scope. */
export function scopedJournalsHref(branchFilter: string): string {
  return branchFilter === "all" ? "/finance/controls?tab=journals" : `/finance/controls?tab=journals&branchId=${encodeURIComponent(branchFilter)}`;
}

const STATUS_LABELS: Record<string, string> = {
  available: "Matches",
  not_available: "Does not match",
  not_configured: "Not set up",
  proven: "Matches",
  unproven: "Not confirmed",
  refresh_required: "Needs a refresh",
  unavailable: "Not checked",
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
    <div className="space-y-4" role="status" aria-label="Loading statement">
      <div className="grid gap-3 sm:grid-cols-3">
        {(["a", "b", "c"] as const).map((key) => <Skeleton key={key} className="h-24" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

function ReportStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? "neutral"}>
      <span className="sr-only">Status: </span>
      {STATUS_LABELS[status] ?? statusLabel(status)}
    </Badge>
  );
}

function SectionLines({ section, emptyLabel = "Nothing here for these dates." }: { section: ManagementStatementSection; emptyLabel?: string }) {
  if (section.lines.length === 0) return <p className="px-4 py-5 text-[12px] text-ink-3">{emptyLabel}</p>;
  return (
    <div className="divide-y divide-line">
      {section.lines.map((line) => (
        <div key={line.accountId} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{line.accountName}</p>
            <p className="text-[12px] text-ink-3" dir="ltr"><span className="font-mono text-[11px]">{line.accountCode}</span> · {line.entryIds.length} journal {line.entryIds.length === 1 ? "entry" : "entries"}</p>
          </div>
          <MoneyText money={line.amount} />
        </div>
      ))}
    </div>
  );
}

/** Sends the reader to the posted entries behind a section, in the same branch scope. */
function JournalsLink({ href, label = "View journal entries" }: { href?: string; label?: string }) {
  if (!href) return null;
  return <Link href={href} className="text-[12px] text-ink-3 underline decoration-line-3 underline-offset-2 hover:text-ink">{label}</Link>;
}

function StatementSectionCard({ title, description, section, tone, journalsHref }: { title: string; description: string; section: ManagementStatementSection; tone?: "positive" | "negative"; journalsHref?: string }) {
  return (
    <section className="panel overflow-hidden" aria-label={title}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0"><h3 className="text-[14px] font-semibold">{title}</h3><p className="text-[12px] text-ink-3">{description}</p>{section.lines.length > 0 ? <JournalsLink href={journalsHref} /> : null}</div>
        <MoneyText money={section.total} className={tone === "positive" ? "text-success-deep" : tone === "negative" ? "text-warning-deep" : undefined} />
      </header>
      <SectionLines section={section} />
    </section>
  );
}

function SummaryCard({ label, value, context, tone = "default" }: { label: string; value: ReactNode; context?: ReactNode; tone?: "default" | "positive" | "warning" | "danger" }) {
  return (
    <section className="panel p-4">
      <p className="context-label">{label}</p>
      <div className={cn("mt-1.5 text-[21px] font-semibold leading-tight tabular", tone === "positive" && "text-success-deep", tone === "warning" && "text-warning-deep", tone === "danger" && "text-danger")} dir="ltr">{value}</div>
      {context ? <p className="mt-1.5 text-[12px] text-ink-3">{context}</p> : null}
    </section>
  );
}

function ReportErrorOrLoading({ loading, error, onRetry, title }: { loading: boolean; error: unknown; onRetry: () => void; title: string }) {
  if (loading) return <StatementLoading />;
  if (error) return <QueryErrorState error={error} onRetry={onRetry} notFoundTitle={`${title} is not available`} />;
  return null;
}

const MEMBERSHIP_RECOGNITION_WARNING_KEY = "membership-revenue-recognition";

/**
 * The server words some notes in accounting terms. These are the known ones in
 * plain English; any other text is shown exactly as the server sent it.
 */
const PLAIN_REPORT_TEXT: Record<string, string> = {
  "accounting source queue coverage is not proven for this report. refresh the source queue before relying on completeness.": "Some sales or costs may not be in the books yet. Refresh the list in Bookkeeping before you rely on these numbers.",
  "membership revenue recognition coverage is incomplete; deferred amounts remain unearned until the validated service schedule is posted.": "Some membership income may be missing. Money paid in advance counts as earned only after its monthly schedule is added to the books.",
  "fixed assets have incomplete depreciation coverage; affected assets remain gross until acquisition, date, cost, useful life, and lifecycle requirements are posted.": "Some equipment is missing details, so its value is not reduced over time. Add the purchase date, cost and useful life.",
  "management accounting projection for operational decision support. this is not statutory, tax, audit, or jurisdiction-specific financial reporting.": "These figures are for running the gym. They are not for tax or official accounts.",
  "cash arithmetic agrees with the current ledger projection, but source queue coverage is not proven. refresh the source queue before treating this reconciliation as complete.": "The cash numbers add up, but some sales or costs may not be in the books yet. Refresh the list in Bookkeeping first.",
  "the classified cash movement does not agree with the independent cash-account position through the as-of date.": "The cash that moved does not match the cash in your cash accounts on the end date. Ask your accountant to check.",
  "cash on hand and card/bank-transfer clearing accounts are treated as cash. each posted entry's cash movement is classified by its non-cash counterpart lines: investing when any counterpart is a non-current asset, otherwise financing when any counterpart is equity or a non-current liability, otherwise operating. entries that only move money between cash accounts are internal transfers and are excluded from the classified sections.": "Cash in the drawer and card and bank transfer money count as cash. Equipment purchases and sales count as investing. Money the owner puts in or takes out, and loans, count as financing. Everything else counts as operating. Moving money between your own cash accounts is left out.",
};

function plainReportText(text: string): string {
  return PLAIN_REPORT_TEXT[text.trim().replace(/\s+/g, " ").toLowerCase()] ?? text;
}

function normalizedWarningKey(warning: string): string {
  const normalized = warning.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized.startsWith("membership revenue recognition") ? MEMBERSHIP_RECOGNITION_WARNING_KEY : normalized;
}

/** Keep report caveats readable when a provider repeats the same warning. */
export function dedupeStatementWarnings(warnings: readonly string[]): string[] {
  const seen = new Set<string>();
  return warnings.reduce<string[]>((deduped, warning) => {
    const displayWarning = warning.trim().replace(/\s+/g, " ");
    if (!displayWarning) return deduped;
    const key = normalizedWarningKey(displayWarning);
    if (seen.has(key)) return deduped;
    seen.add(key);
    deduped.push(displayWarning);
    return deduped;
  }, []);
}

function statementWarnings(report: ManagementReportCompleteness | undefined, kind: ManagementStatementKind): string[] {
  if (!report) return [];
  const warnings = [...report.warnings];
  const membershipRevenueRecognition = kind === "income" ? (report as IncomeStatement).membershipRevenueRecognition : undefined;
  if (membershipRevenueRecognition === "not_configured" && !warnings.some((warning) => normalizedWarningKey(warning) === MEMBERSHIP_RECOGNITION_WARNING_KEY)) {
    warnings.push("Some membership income may be missing. Money paid in advance counts as earned only after its monthly schedule is added to the books.");
  }
  return dedupeStatementWarnings(warnings).map(plainReportText);
}

function ReportQuality({ report, warnings, kind, controlsHref }: { report?: ManagementReportCompleteness; warnings?: readonly string[]; kind?: ManagementStatementKind; controlsHref?: string }) {
  if (!report) return null;
  const visibleWarnings = warnings ?? dedupeStatementWarnings(report.warnings).map(plainReportText);
  const needsAttention = report.queueCoverage !== "proven" || visibleWarnings.length > 0;
  return (
    <section className="space-y-2" aria-label="About these numbers">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
        {/* A balance sheet is a cumulative position, not period activity. */}
        <span dir="ltr">{kind === "balance" ? `As of ${formatDate(report.toDate)}` : `${formatDate(report.fromDate)} – ${formatDate(report.toDate)}`}</span>
        <span aria-hidden>·</span>
        <span>{report.branchId ? "Selected branch" : "All your branches"}</span>
        <span aria-hidden>·</span>
        <span dir="ltr">{report.currency}</span>
        {report.queueCoverage !== "proven" ? <Badge variant="warning">May be missing items</Badge> : null}
        {!needsAttention ? <span className="inline-flex items-center gap-1 text-success-deep"><CheckCircle2 className="size-3.5" aria-hidden /> Everything is in the books</span> : null}
      </div>
      {visibleWarnings.length > 0 ? <section className="rounded-md border border-warning/40 bg-warning-bg px-4 py-3 text-[12px] text-warning-deep" role="status" aria-label="Statement warnings"><div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><div><p className="font-medium">Some figures may be incomplete</p><ul className="mt-1 list-disc space-y-0.5 ps-5">{visibleWarnings.map((warning) => <li key={normalizedWarningKey(warning)}>{warning}</li>)}</ul>{controlsHref ? <p className="mt-2"><Link href={controlsHref} className="font-medium underline underline-offset-2">Fix this in Bookkeeping</Link></p> : null}</div></div></section> : report.queueCoverage !== "proven" && controlsHref ? <p className="text-[12px] text-ink-3">Some items may not be in the books yet. <Link href={controlsHref} className="font-medium text-ink-2 underline underline-offset-2">Refresh the list in Bookkeeping</Link>.</p> : null}
      <div className="flex items-start gap-2 rounded-md border border-line bg-sunken/30 px-4 py-3 text-[12px] text-ink-3"><CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden /><p>{plainReportText(report.disclaimer)}</p></div>
    </section>
  );
}

function IncomeStatementView({ report, journalsHref }: { report: IncomeStatement; journalsHref?: string }) {
  return (
    <div className="space-y-4" data-testid="income-statement">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Total revenue" value={<MoneyText money={report.totalRevenue} />} tone="positive" context="Membership and shop income earned in these dates." />
        <SummaryCard label="Total costs" value={<MoneyText money={report.totalCosts} />} tone="warning" context="Stock, repairs, equipment wear and other running costs." />
        <SummaryCard label="Net income" value={<MoneyText money={report.netIncome} />} tone={report.netIncome.amount >= 0 ? "positive" : "danger"} context="Your profit or loss: all income minus all costs." />
      </div>
      {report.membershipRevenueRecognition !== "not_available" ? (
        <div className="flex items-start gap-2 rounded-md border border-line bg-sunken/30 px-4 py-3 text-[12px] text-ink-3">
          <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p><span className="font-medium text-ink-2">Why you may see fils:</span> older memberships are counted as earned day by day, so a month can include fils. Together, those months always add up to the full price. New memberships count their full price on the day of sale.</p>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <StatementSectionCard journalsHref={journalsHref} title="Revenue" description="Money the gym earned from members and sales." section={report.revenue} tone="positive" />
        <StatementSectionCard journalsHref={journalsHref} title="Cost of sales" description="What the things you sold cost you." section={report.costOfSales} tone="negative" />
        <StatementSectionCard journalsHref={journalsHref} title="Operating expenses" description="Running costs, like repairs, supplies and equipment wear." section={report.operatingExpenses} tone="negative" />
        <StatementSectionCard journalsHref={journalsHref} title="Other income" description="Income from outside normal gym work." section={report.otherIncome} tone="positive" />
        <StatementSectionCard journalsHref={journalsHref} title="Other expenses" description="Costs from outside normal gym work." section={report.otherExpenses} tone="negative" />
      </div>
    </div>
  );
}

function BalanceSheetView({ report, journalsHref }: { report: BalanceSheet; journalsHref?: string }) {
  // Canonical field with a deploy-skew fallback to the deprecated alias.
  const cumulativeEarnings = report.cumulativeEarnings ?? report.currentEarnings;
  return (
    <div className="space-y-4" data-testid="balance-sheet">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Total assets" value={<MoneyText money={report.totalAssets} />} context="Cash, stock and equipment the gym owns." />
        <SummaryCard label="Liabilities" value={<MoneyText money={report.totalLiabilities} />} context="What the gym still owes suppliers and members." />
        <SummaryCard label="Liabilities and equity" value={<MoneyText money={report.totalLiabilitiesAndEquity} />} tone={report.balanced ? "positive" : "danger"} context="Should equal total assets. If not, the books need checking." />
      </div>
      <section className={cn("rounded-md border px-4 py-3", report.balanced ? "border-success/40 bg-success-bg text-success-deep" : "border-danger/40 bg-danger-bg text-danger")} role="status" aria-label="Balance check">
        <div className="flex flex-wrap items-center gap-2"><Scale className="size-4" aria-hidden /><p className="font-medium">{report.balanced ? "The balance sheet balances" : "The balance sheet does not balance"}</p><ReportStatusBadge status={report.balanced ? "available" : "not_available"} /></div>
        <p className="mt-1 text-[12px]">Assets should equal liabilities plus equity plus earnings to date. Difference: <span dir="ltr" className="font-medium"><MoneyText money={report.difference} /></span></p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <StatementSectionCard journalsHref={journalsHref} title="Current assets" description="Cash, stock and money members owe you." section={report.assets.current} />
        <StatementSectionCard journalsHref={journalsHref} title="Non-current assets" description="Equipment and other things you keep for years." section={report.assets.noncurrent} />
        <StatementSectionCard journalsHref={journalsHref} title="Current liabilities" description="What you owe within a year, like supplier bills and prepaid memberships." section={report.liabilities.current} />
        <StatementSectionCard journalsHref={journalsHref} title="Non-current liabilities" description="What you owe over more than a year." section={report.liabilities.noncurrent} />
        <StatementSectionCard journalsHref={journalsHref} title="Equity" description="What the owner has put into the gym." section={report.equity} />
        <SummaryCard label="Earnings to date" value={<MoneyText money={cumulativeEarnings} />} context="All income minus all costs, from the start of your books to this date." />
      </div>
    </div>
  );
}

const CASHFLOW_SECTION_DESCRIPTIONS: Record<string, string> = {
  operating: "Cash from running the gym day to day.",
  investing: "Cash spent on or received for equipment.",
  financing: "Cash put in or taken out by the owner, and loans.",
};

function CashflowSectionCard({ section, journalsHref }: { section: CashflowSection; journalsHref?: string }) {
  return <section className="panel overflow-hidden" aria-label={`${section.category} cash flow`}><header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><div className="min-w-0"><h3 className="text-[14px] font-semibold capitalize">{section.category} activities</h3>{CASHFLOW_SECTION_DESCRIPTIONS[section.category] ? <p className="text-[12px] text-ink-3">{CASHFLOW_SECTION_DESCRIPTIONS[section.category]}</p> : null}{section.lines.length > 0 ? <JournalsLink href={journalsHref} /> : null}</div><MoneyText money={section.netChange} signed /></header><SectionLines section={{ lines: section.lines, total: section.netChange }} emptyLabel="No cash moved here in these dates." /></section>;
}

function CashflowView({ report, journalsHref }: { report: CashflowStatement; journalsHref?: string }) {
  const reconciliation = report.reconciliation;
  const reconciliationProven = report.reconciliationStatus === "proven";
  return (
    <div className="space-y-4" data-testid="cashflow-statement">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Opening cash" value={<MoneyText money={report.openingCash} />} context="Cash in the drawer plus card and bank transfer money, at the start." />
        <SummaryCard label="Change in cash" value={<MoneyText money={report.netChange} signed />} tone={report.netChange.amount >= 0 ? "positive" : "danger"} context="Cash in minus cash out in these dates." />
        <SummaryCard label="Closing cash" value={<MoneyText money={report.closingCash} />} tone={report.balanced ? "positive" : "warning"} context="Cash in the drawer plus card and bank transfer money, at the end." />
      </div>
      <section className={cn("rounded-md border px-4 py-3", reconciliationProven ? "border-success/40 bg-success-bg text-success-deep" : "border-warning/40 bg-warning-bg text-warning-deep")} role="status" aria-label="Cash check"><div className="flex flex-wrap items-center gap-2">{reconciliationProven ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}<p className="font-medium">{reconciliationProven ? "The cash numbers match" : "The cash numbers need checking"}</p><ReportStatusBadge status={report.reconciliationStatus} /></div><p className="mt-1 text-[12px]">Expected closing cash (opening cash plus change): <span dir="ltr" className="font-medium"><MoneyText money={reconciliation.expectedClosingCash} /></span> · Cash in your cash accounts on the end date: <span dir="ltr" className="font-medium"><MoneyText money={reconciliation.asOfCash} /></span> · Difference: <span dir="ltr" className="font-medium"><MoneyText money={reconciliation.difference} /></span></p>{reconciliation.note ? <p className="mt-1 text-[12px]">{plainReportText(reconciliation.note)}</p> : null}</section>
      <div className="grid gap-4 lg:grid-cols-3"><CashflowSectionCard section={report.operating} journalsHref={journalsHref} /><CashflowSectionCard section={report.investing} journalsHref={journalsHref} /><CashflowSectionCard section={report.financing} journalsHref={journalsHref} /></div>
      <div className="flex items-start gap-2 rounded-md border border-line bg-sunken/30 px-4 py-3 text-[12px] text-ink-3"><Banknote className="mt-0.5 size-4 shrink-0" aria-hidden /><p><span className="font-medium text-ink-2">How cash is sorted:</span> {plainReportText(report.classificationPolicy.description)}</p></div>
    </div>
  );
}

const STATEMENT_LABELS: Record<ManagementStatementKind, { label: string; description: string }> = {
  income: { label: "Income statement", description: "What the gym earned and spent in these dates, and the profit or loss." },
  balance: { label: "Balance sheet", description: "What the gym owns and owes on the end date." },
  cashflow: { label: "Cash flow statement", description: "Where cash came from and where it went in these dates." },
};

function validDateParam(value: string | null, fallback: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : fallback;
}

export function scopedStatementHref(path: string, fromDate: string, toDate: string, branchFilter: string): string {
  const params = new URLSearchParams();
  if (fromDate) params.set("from", fromDate);
  if (toDate) params.set("to", toDate);
  if (branchFilter !== "all") params.set("branchId", branchFilter);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

type StatementBranch = { id: string; name: string };

/** One-click ranges for owners who never want to touch two date fields. */
function rangePresets(): Array<{ key: string; label: string; from: string; to: string }> {
  const today = todayISODate();
  const month = today.slice(0, 7);
  const previousMonthEnd = addDays(`${month}-01`, -1);
  const previousMonth = previousMonthEnd.slice(0, 7);
  return [
    { key: "this-month", label: "This month", from: `${month}-01`, to: today },
    { key: "last-month", label: "Last month", from: `${previousMonth}-01`, to: previousMonthEnd },
    { key: "last-30", label: "Last 30 days", from: addDays(today, -29), to: today },
    { key: "this-year", label: "This year", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}

function normalizeBranchFilter(value: string | null | undefined, branches: readonly StatementBranch[]): string {
  const candidate = value?.trim();
  if (!candidate || candidate === "all") return "all";
  return branches.some((branch) => branch.id === candidate) ? candidate : "all";
}

function StatementScopeFilters({
  branches,
  fromDate,
  toDate,
  branchFilter,
  onFromDateChange,
  onToDateChange,
  onBranchChange,
  onRangeChange,
}: {
  branches: readonly StatementBranch[];
  fromDate: string;
  toDate: string;
  branchFilter: string;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onRangeChange: (from: string, to: string) => void;
}) {
  const validRange = fromDate.length > 0 && toDate.length > 0 && fromDate <= toDate;
  const presets = rangePresets();
  return (
    <section className="panel flex flex-col gap-3 p-4" aria-label="Dates and branch">
      <ScopePills
        label="Quick date ranges"
        value={presets.find((preset) => preset.from === fromDate && preset.to === toDate)?.key}
        items={presets.map((preset) => ({ value: preset.key, label: preset.label }))}
        onChange={(key) => { const preset = presets.find((item) => item.key === key); if (preset) onRangeChange(preset.from, preset.to); }}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Field label="From date" className="w-full sm:w-44"><Input type="date" value={fromDate} onChange={(event) => onFromDateChange(event.target.value)} dir="ltr" /></Field>
        <Field label="To date" className="w-full sm:w-44"><Input type="date" value={toDate} onChange={(event) => onToDateChange(event.target.value)} dir="ltr" /></Field>
        <Field label="Branch" className="w-full sm:w-64"><Select value={branchFilter} onValueChange={onBranchChange}><SelectTrigger aria-label="Branch"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All your branches</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></Field>
        <div className="flex items-center gap-2 text-[12px] text-ink-3 sm:ms-auto"><CalendarDays className="size-4" aria-hidden /><span>{branchFilter === "all" ? "All your branches together" : branches.find((branch) => branch.id === branchFilter)?.name}</span></div>
      </div>
      {!validRange ? <p className="basis-full text-[12px] text-danger" role="alert">The from date must be on or before the to date.</p> : null}
    </section>
  );
}

/** One statement per route; only the selected report projection is fetched. */
export function ManagementStatementPage({ kind }: { kind: ManagementStatementKind }) {
  const { session, sessionLoading } = useApp();
  const { can } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaults = useMemo(() => ({ from: addDays(todayISODate(), -29), to: todayISODate() }), []);
  const searchParamsKey = searchParams.toString();
  const sessionBranchKey = session?.branches.map((branch) => branch.id).join("|") ?? "";
  const availableBranches = useMemo(() => session?.branches ?? [], [session?.branches]);
  const [fromDate, setFromDate] = useState(() => validDateParam(searchParams.get("from") ?? searchParams.get("fromDate"), defaults.from));
  const [toDate, setToDate] = useState(() => validDateParam(searchParams.get("to") ?? searchParams.get("toDate"), defaults.to));
  const [branchFilter, setBranchFilter] = useState(() => searchParams.get("branchId") || "all");
  const lastObservedUrlRef = useRef(searchParamsKey);
  const lastObservedBranchKeyRef = useRef(sessionBranchKey);
  const pendingCanonicalHrefRef = useRef<string | null>(null);
  const suppressUrlWriteRef = useRef(false);
  const initialUrlWriteRef = useRef(true);
  const canRead = can("reports.financial.read");
  const effectiveBranchFilter = normalizeBranchFilter(branchFilter, availableBranches);
  const scopeBranchId = effectiveBranchFilter === "all" ? undefined : effectiveBranchFilter as UUID;
  const validRange = fromDate.length > 0 && toDate.length > 0 && fromDate <= toDate;
  const reportInput = useMemo(() => ({ fromDate, toDate, branchId: scopeBranchId }), [fromDate, toDate, scopeBranchId]);
  const workspaceQuery = useApiQuery(qk.workspaceAccess, (api) => api.getWorkspaceAccess(), { enabled: Boolean(session) && canRead });
  const workspace = workspaceQuery.data as WorkspaceAccess | undefined;
  const reportingModule = workspace?.modules.find((module) => module.key === "reporting");
  const ready = Boolean(reportingModule?.entitled && reportingModule.enabled && validRange);
  const statementQuery = useApiQuery<IncomeStatement | BalanceSheet | CashflowStatement>(
    qk.managementReports({ kind, ...reportInput }),
    (api) => kind === "income" ? api.getIncomeStatement(reportInput) : kind === "balance" ? api.getBalanceSheet(reportInput) : api.getCashflowStatement(reportInput),
    { enabled: ready, retry: false },
  );
  const readOnly = !can("accounting.post");
  const definition = STATEMENT_LABELS[kind];
  const currentHref = searchParamsKey ? `${pathname}?${searchParamsKey}` : pathname;
  const desiredHref = scopedStatementHref(pathname, fromDate, toDate, effectiveBranchFilter);
  const hasScopeParams = searchParams.get("from") !== null || searchParams.get("to") !== null || searchParams.get("fromDate") !== null || searchParams.get("toDate") !== null || searchParams.get("branchId") !== null;
  const refresh = () => {
    if (!validRange) return;
    void statementQuery.refetch();
  };

  // Keep the local controls aligned with browser back/forward and any other
  // same-route URL changes. The pending href ref prevents the URL writer from
  // racing this effect with the previous scope for one render.
  useEffect(() => {
    const urlChanged = lastObservedUrlRef.current !== searchParamsKey;
    const branchesChanged = lastObservedBranchKeyRef.current !== sessionBranchKey;
    if (!urlChanged && !branchesChanged) return;
    lastObservedUrlRef.current = searchParamsKey;
    lastObservedBranchKeyRef.current = sessionBranchKey;

    // Do not canonicalize a clean URL while the session is still hydrating. A
    // valid branch in the URL must be checked against the actual session list
    // before it can be retained or removed.
    if (!session && searchParams.get("branchId") !== null) return;
    if (!urlChanged && !searchParamsKey) return;

    const nextFromDate = validDateParam(searchParams.get("from") ?? searchParams.get("fromDate"), defaults.from);
    const nextToDate = validDateParam(searchParams.get("to") ?? searchParams.get("toDate"), defaults.to);
    const nextBranchFilter = normalizeBranchFilter(searchParams.get("branchId"), availableBranches);
    const nextHref = scopedStatementHref(pathname, nextFromDate, nextToDate, nextBranchFilter);
    const stateChanged = nextFromDate !== fromDate || nextToDate !== toDate || nextBranchFilter !== effectiveBranchFilter;

    suppressUrlWriteRef.current = true;
    if (stateChanged) {
      pendingCanonicalHrefRef.current = nextHref;
      if (nextFromDate !== fromDate) setFromDate(nextFromDate);
      if (nextToDate !== toDate) setToDate(nextToDate);
      if (nextBranchFilter !== effectiveBranchFilter) setBranchFilter(nextBranchFilter);
    } else {
      pendingCanonicalHrefRef.current = null;
      if (currentHref !== nextHref) router.replace(nextHref, { scroll: false });
    }
  }, [availableBranches, currentHref, defaults.from, defaults.to, effectiveBranchFilter, fromDate, pathname, router, searchParams, searchParamsKey, session, sessionBranchKey, sessionLoading, toDate]);

  useEffect(() => {
    if (suppressUrlWriteRef.current) {
      suppressUrlWriteRef.current = false;
      return;
    }
    if (initialUrlWriteRef.current) {
      initialUrlWriteRef.current = false;
      // A clean URL is intentionally left clean on first render. Once a
      // control changes, subsequent state changes are reflected in the URL.
      if (!hasScopeParams && !pendingCanonicalHrefRef.current) return;
      if (hasScopeParams && searchParams.get("branchId") !== null && !session) return;
    }
    if (pendingCanonicalHrefRef.current) {
      if (pendingCanonicalHrefRef.current !== desiredHref) return;
      pendingCanonicalHrefRef.current = null;
    }
    if (currentHref !== desiredHref) router.replace(desiredHref, { scroll: false });
  }, [currentHref, desiredHref, hasScopeParams, pathname, router, searchParams, session]);

  const report = statementQuery.data;
  // Journal entries sit behind Ledger controls, which only posting roles reach.
  const journalsHref = readOnly ? undefined : scopedJournalsHref(effectiveBranchFilter);
  const reportView = report ? kind === "income" ? <IncomeStatementView report={report as IncomeStatement} journalsHref={journalsHref} /> : kind === "balance" ? <BalanceSheetView report={report as BalanceSheet} journalsHref={journalsHref} /> : <CashflowView report={report as CashflowStatement} journalsHref={journalsHref} /> : null;
  const reportWarnings = statementWarnings(report, kind);

  if (sessionLoading && !session) return <><PageHeader sectionLabel="Management ledger" title={definition.label} description="Loading the statement…" /><StatementLoading /></>;
  if (!canRead) return <ForbiddenState description="You don't have access to the financial statements. Ask the gym owner if you need them." />;
  if (workspaceQuery.isLoading) return <><PageHeader sectionLabel="Management ledger" title={definition.label} description="Loading the statement…" /><StatementLoading /></>;
  if (workspaceQuery.error || !workspace) return <QueryErrorState error={workspaceQuery.error} onRetry={() => void workspaceQuery.refetch()} />;
  if (!reportingModule?.entitled) return <StatePanel icon={LockKeyhole} title="Financial statements are not in your plan" description="Your plan does not include the income statement, balance sheet and cash flow statement. Contact RIVET to add them." className="mt-4" />;
  if (!reportingModule.enabled) return <StatePanel icon={LockKeyhole} title="Financial statements are turned off" description="The gym owner can turn them on in Settings." className="mt-4" />;

  return (
    <div className="space-y-5" data-testid="management-statements-workspace" data-kind={kind}>
      {/* Same back link as Ledger controls, so the three statements and the controls read as one place. */}
      <Link href={scopedStatementHref("/finance", fromDate, toDate, effectiveBranchFilter)} className="inline-flex items-center gap-1.5 text-[12px] text-ink-2 underline-offset-2 hover:text-ink hover:underline"><ArrowLeft className="size-3.5" aria-hidden /> All statements</Link>
      <PageHeader sectionLabel="Management ledger" title={definition.label} description={definition.description} actions={<div className="flex flex-wrap items-center justify-end gap-2"><Badge variant="outline">{readOnly ? "View only" : "From the books"}</Badge>{!readOnly ? <Button asChild variant="secondary"><Link href={effectiveBranchFilter === "all" ? "/finance/controls" : `/finance/controls?branchId=${encodeURIComponent(effectiveBranchFilter)}`}>Bookkeeping</Link></Button> : null}<Button type="button" variant="secondary" onClick={refresh} disabled={statementQuery.isLoading || !validRange}><RefreshCw className={statementQuery.isLoading ? "animate-spin" : undefined} /> Reload</Button></div>} />
      <StatementScopeFilters branches={availableBranches} fromDate={fromDate} toDate={toDate} branchFilter={effectiveBranchFilter} onFromDateChange={setFromDate} onToDateChange={setToDate} onBranchChange={setBranchFilter} onRangeChange={(from, to) => { setFromDate(from); setToDate(to); }} />
      <ReportQuality report={report} warnings={reportWarnings} kind={kind} controlsHref={!readOnly ? "/finance/controls" : undefined} />
      {statementQuery.isBackgroundError ? <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="status" aria-label="Numbers may be out of date">These numbers may be out of date. The last reload failed. <button type="button" className="font-medium underline" onClick={refresh} disabled={!validRange || statementQuery.isLoading}>Try again</button></div> : null}
      <ReportErrorOrLoading loading={statementQuery.isLoading} error={statementQuery.isError ? statementQuery.error : undefined} onRetry={refresh} title={definition.label} />
      {reportView}
    </div>
  );
}
