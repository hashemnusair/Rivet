"use client";
import { useLocale, useT } from "@/lib/i18n/provider";

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
import { addDays, todayISODate } from "@/lib/utils/dates";
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
import { describeStatementText } from "@/lib/domain/statement-messages";
import type { StatementTextMessage } from "@/lib/domain/statement-messages";
import type { TFunction, TKey } from "@/lib/i18n/core";
import { useFormat, useFormattingTimeZone } from "@/lib/i18n/format";
import { accountingAccountName } from "@/lib/i18n/accounting";

export type ManagementStatementKind = "income" | "balance" | "cashflow";

/** Journal entries live in Ledger controls; the link keeps the statement's branch scope. */
export function scopedJournalsHref(branchFilter: string): string {
  return branchFilter === "all" ? "/finance/controls?tab=journals" : `/finance/controls?tab=journals&branchId=${encodeURIComponent(branchFilter)}`;
}

const STATUS_LABELS: Record<string, TKey> = {
  available: "statements.matches",
  not_available: "statements.notMatch",
  not_configured: "statements.notSetup",
  proven: "statements.matches",
  unproven: "statements.notConfirmed",
  refresh_required: "statements.needsRefresh",
  unavailable: "statements.notChecked",
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

function StatementLoading() {
  const t = useT();
  return (
    <div className="space-y-4" role="status" aria-label={t("statements.loading")}>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["a", "b", "c"] as const).map((key) => <Skeleton key={key} className="h-24" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

function ReportStatusBadge({ status }: { status: string }) {
  const t = useT();
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? "neutral"}>
      <span className="sr-only">{t("statements.status")}{" "}</span>
      {t(Object.hasOwn(STATUS_LABELS, status) ? STATUS_LABELS[status]! : "statements.unknownStatus")}
    </Badge>
  );
}

function SectionLines({ section, emptyLabel }: { section: ManagementStatementSection; emptyLabel?: string }) {
  const { t, locale } = useLocale();
  if (section.lines.length === 0) return <p className="px-4 py-5 text-[12px] text-ink-3">{emptyLabel ?? t("statements.empty")}</p>;
  return (
    <div className="divide-y divide-line">
      {section.lines.map((line) => (
        <div key={line.accountId} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{accountingAccountName(line.accountCode, line.accountName, locale, t)}</p>
            <p className="text-[12px] text-ink-3"><bdi dir="ltr" className="font-mono text-[11px]">{line.accountCode}</bdi> · {t("statements.entries", { count: line.entryIds.length })}</p>
          </div>
          <MoneyText money={line.amount} />
        </div>
      ))}
    </div>
  );
}

/** Sends the reader to the posted entries behind a section, in the same branch scope. */
function JournalsLink({ href, label }: { href?: string; label?: string }) {
  const t = useT();
  if (!href) return null;
  return <Link href={href} className="text-[12px] text-ink-3 underline decoration-line-3 underline-offset-2 hover:text-ink">{label ?? t("statements.journals")}</Link>;
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
  const t = useT();
  if (loading) return <StatementLoading />;
  if (error) return <QueryErrorState error={error} onRetry={onRetry} notFoundTitle={t("statements.notAvailable", { title })} />;
  return null;
}

const MEMBERSHIP_RECOGNITION_WARNING_KEY = "membership-revenue-recognition";

function plainReportText(text: string, t: TFunction, descriptor?: StatementTextMessage): string {
  const message = descriptor ?? describeStatementText(text);
  return message ? t(message.key, message.params) : text;
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

function statementWarnings(report: ManagementReportCompleteness | undefined, kind: ManagementStatementKind, t: TFunction): string[] {
  if (!report) return [];
  const warnings = [...report.warnings];
  const membershipRevenueRecognition = kind === "income" ? (report as IncomeStatement).membershipRevenueRecognition : undefined;
  if (membershipRevenueRecognition === "not_configured" && !warnings.some((warning) => normalizedWarningKey(warning) === MEMBERSHIP_RECOGNITION_WARNING_KEY)) {
    warnings.push("Membership revenue recognition coverage is incomplete; deferred amounts remain unearned until the validated service schedule is posted.");
  }
  return dedupeStatementWarnings(warnings).map(text => plainReportText(text, t, report.warningMessages?.find(message => message.original.trim().replace(/\s+/g, " ") === text)));
}

function ReportQuality({ report, warnings, kind, controlsHref }: { report?: ManagementReportCompleteness; warnings?: readonly string[]; kind?: ManagementStatementKind; controlsHref?: string }) {
  const t = useT();
  const f = useFormat();
  if (!report) return null;
  const visibleWarnings = warnings ?? dedupeStatementWarnings(report.warnings).map(text => plainReportText(text, t));
  const needsAttention = report.queueCoverage !== "proven" || visibleWarnings.length > 0;
  return (
    <section className="space-y-2" aria-label={t("statements.about")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
        {/* A balance sheet is a cumulative position, not period activity. */}
        <span>{kind === "balance" ? t("statements.asOf", { date: f.date(report.toDate) }) : `${f.date(report.fromDate)} – ${f.date(report.toDate)}`}</span>
        <span aria-hidden>·</span>
        <span>{report.branchId ? t("statements.selectedBranch") : t("statements.allBranches")}</span>
        <span aria-hidden>·</span>
        <span dir="ltr">{report.currency}</span>
        {report.queueCoverage !== "proven" ? <Badge variant="warning">{t("statements.mayMissing")}</Badge> : null}
        {!needsAttention ? <span className="inline-flex items-center gap-1 text-success-deep"><CheckCircle2 className="size-3.5" aria-hidden /> {" "}{t("statements.complete")}</span> : null}
      </div>
      {visibleWarnings.length > 0 ? <section className="rounded-md border border-warning/40 bg-warning-bg px-4 py-3 text-[12px] text-warning-deep" role="status" aria-label={t("statements.warnings")}><div className="flex items-start gap-2"><ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><div><p className="font-medium">{t("statements.incomplete")}</p><ul className="mt-1 list-disc space-y-0.5 ps-5">{visibleWarnings.map((warning) => <li key={normalizedWarningKey(warning)}>{warning}</li>)}</ul>{controlsHref ? <p className="mt-2"><Link href={controlsHref} className="font-medium underline underline-offset-2">{t("statements.fixBookkeeping")}</Link></p> : null}</div></div></section> : report.queueCoverage !== "proven" && controlsHref ? <p className="text-[12px] text-ink-3">{t("statements.itemsMissing")}{" "}<Link href={controlsHref} className="font-medium text-ink-2 underline underline-offset-2">{t("statements.refreshBookkeeping")}</Link>{t("members.bulk.toast.end")}</p> : null}
      <div className="flex items-start gap-2 rounded-md border border-line bg-sunken/30 px-4 py-3 text-[12px] text-ink-3"><CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden /><p>{plainReportText(report.disclaimer, t, report.disclaimerMessage)}</p></div>
    </section>
  );
}

function IncomeStatementView({ report, journalsHref }: { report: IncomeStatement; journalsHref?: string }) {
  const t = useT();
  return (
    <div className="space-y-4" data-testid="income-statement">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label={t("statements.totalRevenue")} value={<MoneyText money={report.totalRevenue} />} tone="positive" context={t("statements.revenueHint")} />
        <SummaryCard label={t("statements.totalCosts")} value={<MoneyText money={report.totalCosts} />} tone="warning" context={t("statements.costsHint")} />
        <SummaryCard label={t("statements.netIncome")} value={<MoneyText money={report.netIncome} />} tone={report.netIncome.amount >= 0 ? "positive" : "danger"} context={t("statements.netHint")} />
      </div>
      {report.membershipRevenueRecognition !== "not_available" ? (
        <div className="flex items-start gap-2 rounded-md border border-line bg-sunken/30 px-4 py-3 text-[12px] text-ink-3">
          <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p><span className="font-medium text-ink-2">{t("statements.filsTitle")}</span> {" "}{t("statements.filsHint")}</p>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <StatementSectionCard journalsHref={journalsHref} title={t("palette.moduleBoundary.name.revenue")} description={t("statements.revenueDescription")} section={report.revenue} tone="positive" />
        <StatementSectionCard journalsHref={journalsHref} title={t("statements.costSales")} description={t("statements.costSalesHint")} section={report.costOfSales} tone="negative" />
        <StatementSectionCard journalsHref={journalsHref} title={t("statements.operatingExpenses")} description={t("statements.operatingExpensesHint")} section={report.operatingExpenses} tone="negative" />
        <StatementSectionCard journalsHref={journalsHref} title={t("statements.otherIncome")} description={t("statements.otherIncomeHint")} section={report.otherIncome} tone="positive" />
        <StatementSectionCard journalsHref={journalsHref} title={t("statements.otherExpenses")} description={t("statements.otherExpensesHint")} section={report.otherExpenses} tone="negative" />
      </div>
    </div>
  );
}

function BalanceSheetView({ report, journalsHref }: { report: BalanceSheet; journalsHref?: string }) {
  const t = useT();
  // Canonical field with a deploy-skew fallback to the deprecated alias.
  const cumulativeEarnings = report.cumulativeEarnings ?? report.currentEarnings;
  return (
    <div className="space-y-4" data-testid="balance-sheet">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label={t("statements.totalAssets")} value={<MoneyText money={report.totalAssets} />} context={t("statements.assetsHint")} />
        <SummaryCard label={t("statements.liabilities")} value={<MoneyText money={report.totalLiabilities} />} context={t("statements.liabilitiesHint")} />
        <SummaryCard label={t("statements.liabilitiesEquity")} value={<MoneyText money={report.totalLiabilitiesAndEquity} />} tone={report.balanced ? "positive" : "danger"} context={t("statements.liabilitiesEquityHint")} />
      </div>
      <section className={cn("rounded-md border px-4 py-3", report.balanced ? "border-success/40 bg-success-bg text-success-deep" : "border-danger/40 bg-danger-bg text-danger")} role="status" aria-label={t("statements.balanceCheck")}>
        <div className="flex flex-wrap items-center gap-2"><Scale className="size-4" aria-hidden /><p className="font-medium">{report.balanced ? t("statements.balanced") : t("statements.unbalanced")}</p><ReportStatusBadge status={report.balanced ? "available" : "not_available"} /></div>
        <p className="mt-1 text-[12px]">{t("statements.balanceDifference")}{" "}<span dir="ltr" className="font-medium"><MoneyText money={report.difference} /></span></p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <StatementSectionCard journalsHref={journalsHref} title={t("statements.currentAssets")} description={t("statements.currentAssetsHint")} section={report.assets.current} />
        <StatementSectionCard journalsHref={journalsHref} title={t("statements.noncurrentAssets")} description={t("statements.noncurrentAssetsHint")} section={report.assets.noncurrent} />
        <StatementSectionCard journalsHref={journalsHref} title={t("statements.currentLiabilities")} description={t("statements.currentLiabilitiesHint")} section={report.liabilities.current} />
        <StatementSectionCard journalsHref={journalsHref} title={t("statements.noncurrentLiabilities")} description={t("statements.noncurrentLiabilitiesHint")} section={report.liabilities.noncurrent} />
        <StatementSectionCard journalsHref={journalsHref} title={t("statements.equity")} description={t("statements.equityHint")} section={report.equity} />
        <SummaryCard label={t("statements.earnings")} value={<MoneyText money={cumulativeEarnings} />} context={t("statements.earningsHint")} />
      </div>
    </div>
  );
}

const CASHFLOW_SECTION_DESCRIPTIONS: Record<string, TKey> = {
  operating: "statements.operatingCashHint",
  investing: "statements.investingCashHint",
  financing: "statements.financingCashHint",
};

const CASHFLOW_SECTION_TITLES: Record<CashflowSection["category"], { label: TKey; aria: TKey }> = {
  operating: { label: "statements.operatingActivities", aria: "statements.operatingCash" },
  investing: { label: "statements.investingActivities", aria: "statements.investingCash" },
  financing: { label: "statements.financingActivities", aria: "statements.financingCash" },
};

function CashflowSectionCard({ section, journalsHref }: { section: CashflowSection; journalsHref?: string }) {
  const t = useT();
  return <section className="panel overflow-hidden" aria-label={t(CASHFLOW_SECTION_TITLES[section.category].aria)}><header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3"><div className="min-w-0"><h3 className="text-[14px] font-semibold capitalize">{t(CASHFLOW_SECTION_TITLES[section.category].label)}</h3>{CASHFLOW_SECTION_DESCRIPTIONS[section.category] ? <p className="text-[12px] text-ink-3">{t(CASHFLOW_SECTION_DESCRIPTIONS[section.category]!)}</p> : null}{section.lines.length > 0 ? <JournalsLink href={journalsHref} /> : null}</div><MoneyText money={section.netChange} signed /></header><SectionLines section={{ lines: section.lines, total: section.netChange }} emptyLabel={t("statements.noCash")} /></section>;
}

function CashflowView({ report, journalsHref }: { report: CashflowStatement; journalsHref?: string }) {
  const t = useT();
  const reconciliation = report.reconciliation;
  const reconciliationProven = report.reconciliationStatus === "proven";
  return (
    <div className="space-y-4" data-testid="cashflow-statement">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label={t("statements.openingCash")} value={<MoneyText money={report.openingCash} />} context={t("statements.openingCashHint")} />
        <SummaryCard label={t("statements.changeCash")} value={<MoneyText money={report.netChange} signed />} tone={report.netChange.amount >= 0 ? "positive" : "danger"} context={t("statements.changeCashHint")} />
        <SummaryCard label={t("statements.closingCash")} value={<MoneyText money={report.closingCash} />} tone={report.balanced ? "positive" : "warning"} context={t("statements.closingCashHint")} />
      </div>
      <section className={cn("rounded-md border px-4 py-3", reconciliationProven ? "border-success/40 bg-success-bg text-success-deep" : "border-warning/40 bg-warning-bg text-warning-deep")} role="status" aria-label={t("statements.cashCheck")}><div className="flex flex-wrap items-center gap-2">{reconciliationProven ? <CheckCircle2 className="size-4" aria-hidden /> : <AlertTriangle className="size-4" aria-hidden />}<p className="font-medium">{reconciliationProven ? t("statements.cashMatches") : t("statements.cashNeedsCheck")}</p><ReportStatusBadge status={report.reconciliationStatus} /></div><p className="mt-1 text-[12px]">{t("statements.expectedCash")}{" "}<span dir="ltr" className="font-medium"><MoneyText money={reconciliation.expectedClosingCash} /></span> {" "}{t("statements.cashAsOf")}{" "}<span dir="ltr" className="font-medium"><MoneyText money={reconciliation.asOfCash} /></span> {" "}{t("statements.difference")}{" "}<span dir="ltr" className="font-medium"><MoneyText money={reconciliation.difference} /></span></p>{reconciliation.note ? <p className="mt-1 text-[12px]">{plainReportText(reconciliation.note, t, reconciliation.noteMessage)}</p> : null}</section>
      <div className="grid gap-4 lg:grid-cols-3"><CashflowSectionCard section={report.operating} journalsHref={journalsHref} /><CashflowSectionCard section={report.investing} journalsHref={journalsHref} /><CashflowSectionCard section={report.financing} journalsHref={journalsHref} /></div>
      <div className="flex items-start gap-2 rounded-md border border-line bg-sunken/30 px-4 py-3 text-[12px] text-ink-3"><Banknote className="mt-0.5 size-4 shrink-0" aria-hidden /><p><span className="font-medium text-ink-2">{t("statements.cashSorted")}</span> {plainReportText(report.classificationPolicy.description, t, report.classificationPolicy.descriptionMessage)}</p></div>
    </div>
  );
}

const STATEMENT_LABELS: Record<ManagementStatementKind, { label: TKey; description: TKey }> = {
  income: { label: "statements.income", description: "statements.incomeHint" },
  balance: { label: "statements.balance", description: "statements.balanceHint" },
  cashflow: { label: "statements.cashflow", description: "statements.cashflowHint" },
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
function rangePresets(t: TFunction, timeZone: string): Array<{ key: string; label: string; from: string; to: string }> {
  const today = todayISODate(timeZone);
  const month = today.slice(0, 7);
  const previousMonthEnd = addDays(`${month}-01`, -1);
  const previousMonth = previousMonthEnd.slice(0, 7);
  return [
    { key: "this-month", label: t("statements.thisMonth"), from: `${month}-01`, to: today },
    { key: "last-month", label: t("statements.lastMonth"), from: `${previousMonth}-01`, to: previousMonthEnd },
    { key: "last-30", label: t("statements.last30"), from: addDays(today, -29), to: today },
    { key: "this-year", label: t("statements.thisYear"), from: `${today.slice(0, 4)}-01-01`, to: today },
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
  const t = useT();
  const validRange = fromDate.length > 0 && toDate.length > 0 && fromDate <= toDate;
  const { locale } = useLocale();
  const timeZone = useFormattingTimeZone();
  const presets = rangePresets(t, timeZone);
  return (
    <section className="panel flex flex-col gap-3 p-4" aria-label={t("statements.datesBranch")}>
      <ScopePills
        label={t("statements.quickRanges")}
        value={presets.find((preset) => preset.from === fromDate && preset.to === toDate)?.key}
        items={presets.map((preset) => ({ value: preset.key, label: preset.label }))}
        onChange={(key) => { const preset = presets.find((item) => item.key === key); if (preset) onRangeChange(preset.from, preset.to); }}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <Field label={t("statements.fromDate")} className="w-full sm:w-44"><Input type="date" lang={locale} value={fromDate} onChange={(event) => onFromDateChange(event.target.value)} dir="ltr" /></Field>
        <Field label={t("statements.toDate")} className="w-full sm:w-44"><Input type="date" lang={locale} value={toDate} onChange={(event) => onToDateChange(event.target.value)} dir="ltr" /></Field>
        <Field label={t("common.label.branch")} className="w-full sm:w-64"><Select value={branchFilter} onValueChange={onBranchChange}><SelectTrigger aria-label={t("common.label.branch")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t("statements.allBranches")}</SelectItem>{branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}</SelectContent></Select></Field>
        <div className="flex items-center gap-2 text-[12px] text-ink-3 sm:ms-auto"><CalendarDays className="size-4" aria-hidden /><span>{branchFilter === "all" ? t("statements.branchesTogether") : branches.find((branch) => branch.id === branchFilter)?.name}</span></div>
      </div>
      {!validRange ? <p className="basis-full text-[12px] text-danger" role="alert">{t("statements.invalidRange")}</p> : null}
    </section>
  );
}

/** One statement per route; only the selected report projection is fetched. */
export function ManagementStatementPage({ kind }: { kind: ManagementStatementKind }) {
  const t = useT();
  const { session, sessionLoading } = useApp();
  const { can } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timeZone = useFormattingTimeZone();
  const defaults = useMemo(() => ({ from: addDays(todayISODate(timeZone), -29), to: todayISODate(timeZone) }), [timeZone]);
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
  const reportWarnings = statementWarnings(report, kind, t);

  if (sessionLoading && !session) return <><PageHeader sectionLabel={t("nav.section.managementLedger")} title={t(definition.label)} description={t("statements.loadingDescription")} /><StatementLoading /></>;
  if (!canRead) return <ForbiddenState description={t("statements.forbidden")} />;
  if (workspaceQuery.isLoading) return <><PageHeader sectionLabel={t("nav.section.managementLedger")} title={t(definition.label)} description={t("statements.loadingDescription")} /><StatementLoading /></>;
  if (workspaceQuery.error || !workspace) return <QueryErrorState error={workspaceQuery.error} onRetry={() => void workspaceQuery.refetch()} />;
  if (!reportingModule?.entitled) return <StatePanel icon={LockKeyhole} title={t("statements.planMissing")} description={t("statements.planMissingHint")} className="mt-4" />;
  if (!reportingModule.enabled) return <StatePanel icon={LockKeyhole} title={t("statements.turnedOff")} description={t("statements.turnedOffHint")} className="mt-4" />;

  return (
    <div className="space-y-5" data-testid="management-statements-workspace" data-kind={kind}>
      {/* Same back link as Ledger controls, so the three statements and the controls read as one place. */}
      <Link href={scopedStatementHref("/finance", fromDate, toDate, effectiveBranchFilter)} className="inline-flex items-center gap-1.5 text-[12px] text-ink-2 underline-offset-2 hover:text-ink hover:underline"><ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden /> {" "}{t("statements.allStatements")}</Link>
      <PageHeader sectionLabel={t("nav.section.managementLedger")} title={t(definition.label)} description={t(definition.description)} actions={<div className="flex flex-wrap items-center justify-end gap-2"><Badge variant="outline">{readOnly ? t("statements.viewOnly") : t("statements.fromBooks")}</Badge>{!readOnly ? <Button asChild variant="secondary"><Link href={effectiveBranchFilter === "all" ? "/finance/controls" : `/finance/controls?branchId=${encodeURIComponent(effectiveBranchFilter)}`}>{t("statements.bookkeeping")}</Link></Button> : null}<Button type="button" variant="secondary" onClick={refresh} disabled={statementQuery.isLoading || !validRange}><RefreshCw className={statementQuery.isLoading ? "animate-spin" : undefined} /> {" "}{t("statements.reload")}</Button></div>} />
      <StatementScopeFilters branches={availableBranches} fromDate={fromDate} toDate={toDate} branchFilter={effectiveBranchFilter} onFromDateChange={setFromDate} onToDateChange={setToDate} onBranchChange={setBranchFilter} onRangeChange={(from, to) => { setFromDate(from); setToDate(to); }} />
      <ReportQuality report={report} warnings={reportWarnings} kind={kind} controlsHref={!readOnly ? "/finance/controls" : undefined} />
      {statementQuery.isBackgroundError ? <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="status" aria-label={t("statements.outdated")}>{t("statements.outdatedHint")}{" "}<button type="button" className="font-medium underline" onClick={refresh} disabled={!validRange || statementQuery.isLoading}>{t("common.action.retry")}</button></div> : null}
      <ReportErrorOrLoading loading={statementQuery.isLoading} error={statementQuery.isError ? statementQuery.error : undefined} onRetry={refresh} title={t(definition.label)} />
      {reportView}
    </div>
  );
}
