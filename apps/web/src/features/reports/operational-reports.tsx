"use client";
import { useLocale, useT } from "@/lib/i18n/provider";

import { Download, FileBarChart } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { MoneyText } from "@/components/shared/data-display";
import { useApiQuery } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import { useApp } from "@/lib/providers/app-providers";
import { useFormat, useFormattingTimeZone, type Formatters } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/locale";
import type { TFunction, TKey } from "@/lib/i18n/core";
import { money } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { buildCsvDocument, buildSectionedCsvDocument, formatMinorUnits, formatExportDateTime, type CsvMetadataItem } from "@/lib/exports/csv";
import { downloadTextFile } from "@/lib/exports/download";
import type { ClassUtilizationReport, PeakHoursReport, RetentionReport, RenewalForecastReport, CollectionsReport, CrmFunnelReport, ControlTrendsReport } from "@/lib/domain/types";
import { ReportScopeBar, reportScopeFrom, type ReportScope } from "./report-scope";

export type OperationalReportKind = "peak-hours" | "classes" | "retention" | "renewals" | "collections" | "crm" | "controls";

export const OPERATIONAL_REPORT_LABELS: Record<OperationalReportKind, TKey> = {
  "peak-hours": "reportsWorkspace.peakHours",
  classes: "reportsWorkspace.classes",
  retention: "reportsWorkspace.retention",
  renewals: "reportsWorkspace.renewals",
  collections: "reportsWorkspace.collections",
  crm: "reportsWorkspace.leads",
  controls: "reportsWorkspace.controls",
};

/** The operating question each report exists to answer. Shown as the page description. */
export const OPERATIONAL_REPORT_QUESTIONS: Record<OperationalReportKind, TKey> = {
  "peak-hours": "reportsWorkspace.peakQuestion",
  classes: "reportsWorkspace.classesQuestion",
  retention: "reportsWorkspace.retentionQuestion",
  renewals: "reportsWorkspace.renewalsQuestion",
  collections: "reportsWorkspace.collectionsQuestion",
  crm: "reportsWorkspace.crmQuestion",
  controls: "reportsWorkspace.controlsQuestion",
};

const WEEKDAYS: readonly TKey[] = ["reportsWorkspace.sunday", "reportsWorkspace.monday", "reportsWorkspace.tuesday", "reportsWorkspace.wednesday", "reportsWorkspace.thursday", "reportsWorkspace.friday", "reportsWorkspace.saturday"];

/** Plain names for the staff actions the refunds and discounts report lists. */
const CONTROL_ACTION_LABELS: Record<string, TKey> = {
  "payment.refund": "reportsWorkspace.refund",
  "payment.void": "reportsWorkspace.paymentCancelled",
  "membership.price_override": "reportsWorkspace.priceChanged",
  "membership.date_override": "reportsWorkspace.datesChanged",
  "checkin.override": "reportsWorkspace.letIn",
};


/** "2026-08" reads as "August 2026"; anything unexpected is shown as it came. */
function monthName(yearMonth: string, f: Formatters): string {
  const date = new Date(`${yearMonth}-01T12:00:00Z`);
  return /^\d{4}-\d{2}$/.test(yearMonth) && !Number.isNaN(date.valueOf()) ? f.monthYear(`${yearMonth}-01`) : yearMonth;
}

function controlActionLabel(action: string, t: TFunction): string {
  return Object.hasOwn(CONTROL_ACTION_LABELS, action) ? t(CONTROL_ACTION_LABELS[action]!) : action;
}

const RENEWAL_BUCKET_LABELS: Record<string, TKey> = { "Next 7 days": "reportsWorkspace.next7", "8–14 days": "reportsWorkspace.next14", "15–30 days": "reportsWorkspace.next30" };
function renewalBucketLabel(label: string, t: TFunction): string {
  return Object.hasOwn(RENEWAL_BUCKET_LABELS, label) ? t(RENEWAL_BUCKET_LABELS[label]!) : label;
}

const RANGED: Record<OperationalReportKind, boolean> = { "peak-hours": true, classes: true, retention: false, renewals: false, collections: true, crm: true, controls: true };

function downloadCsv(fileName: string, title: string, rows: string[][], metadata: CsvMetadataItem[], locale: Locale) {
  const [headers = [], ...dataRows] = rows;
  downloadTextFile({
    fileName,
    mimeType: "text/csv;charset=utf-8",
    content: buildCsvDocument({ locale, title, metadata, headers, rows: dataRows }),
  });
}

/**
 * Read-only analytics views under Reports. All math happens on the server;
 * the scope (branch, window) belongs to the page URL so every report shares
 * one scope bar and one set of filters.
 */
export function OperationalReports({ view, scope, branches, onScopeChange }: { view: OperationalReportKind; scope: ReportScope; branches: ReadonlyArray<{ id: string; name: string }>; onScopeChange: (patch: Partial<ReportScope>) => void }) {
  const t = useT();
  const { session } = useApp();
  const from = reportScopeFrom(scope);
  const to = scope.to;
  const branchInput = scope.branchId === "all" ? undefined : scope.branchId;
  const params = { branchId: branchInput, from, to };

  const peakQuery = useApiQuery(qk.analytics("peak-hours", params), (api) => api.getPeakHoursReport({ branchId: branchInput, from, to }), { enabled: view === "peak-hours" });
  const classesQuery = useApiQuery(qk.analytics("classes", params), (api) => api.getClassUtilizationReport({ branchId: branchInput, from, to }), { enabled: view === "classes" });
  const retentionQuery = useApiQuery(qk.analytics("retention", { branchId: branchInput }), (api) => api.getRetentionReport({ branchId: branchInput }), { enabled: view === "retention" });
  const renewalsQuery = useApiQuery(qk.analytics("renewals", { branchId: branchInput }), (api) => api.getRenewalForecastReport({ branchId: branchInput }), { enabled: view === "renewals" });
  const collectionsQuery = useApiQuery(qk.analytics("collections", params), (api) => api.getCollectionsReport({ branchId: branchInput, from, to }), { enabled: view === "collections" });
  const crmQuery = useApiQuery(qk.analytics("crm", params), (api) => api.getCrmFunnelReport({ branchId: branchInput, from, to }), { enabled: view === "crm" });
  const controlsQuery = useApiQuery(qk.analytics("controls", params), (api) => api.getControlTrendsReport({ branchId: branchInput, from, to }), { enabled: view === "controls" });

  const active = { "peak-hours": peakQuery, classes: classesQuery, retention: retentionQuery, renewals: renewalsQuery, collections: collectionsQuery, crm: crmQuery, controls: controlsQuery }[view];
  const currency = session?.organization.currency ?? "JOD";

  return (
    <div className="space-y-4">
      <ReportScopeBar branches={branches} scope={scope} onChange={onScopeChange} ranged={RANGED[view]} onRefresh={() => void active.refetch()} refreshing={active.isFetching} note={RANGED[view] ? undefined : t("reportsWorkspace.asOfToday")} />

      {active.isBackgroundError ? <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="status" aria-label={t("reportsWorkspace.outdated")}>{t("reportsWorkspace.outdatedHint")}{" "}<button type="button" className="font-medium underline" onClick={() => void active.refetch()}>{t("common.action.retry")}</button></div> : null}
      {active.isLoading ? <Skeleton className="h-72 w-full" /> : null}
      {active.isError ? <ErrorState onRetry={() => void active.refetch()} /> : null}

      {!active.isLoading && !active.isError ? (
        view === "peak-hours" && peakQuery.data ? <PeakHoursView report={peakQuery.data} from={from} to={to} />
        : view === "classes" && classesQuery.data ? <ClassesView report={classesQuery.data} from={from} to={to} />
        : view === "retention" && retentionQuery.data ? <RetentionView report={retentionQuery.data} />
        : view === "renewals" && renewalsQuery.data ? <RenewalsView report={renewalsQuery.data} currency={currency} />
        : view === "collections" && collectionsQuery.data ? <CollectionsView report={collectionsQuery.data} from={from} to={to} currency={currency} />
        : view === "crm" && crmQuery.data ? <CrmView report={crmQuery.data} from={from} to={to} />
        : view === "controls" && controlsQuery.data ? <ControlsView report={controlsQuery.data} from={from} to={to} currency={currency} />
        : null
      ) : null}
    </div>
  );
}

// --- Classes ---------------------------------------------------------------

function ClassesView({ report, from, to }: { report: ClassUtilizationReport; from: string; to: string }) {
  const { t, locale } = useLocale();
  const f = useFormat();
  const percent = (value?: number) => value === undefined ? "—" : f.percent(value * 100);
  const exportCsv = () => downloadCsv(`rivet-class-utilization-${from}-${to}.csv`, t("reportsWorkspace.classUtilization"), [
    [t("reportsWorkspace.class"), t("reportsWorkspace.scheduledTimes"), t("reportsWorkspace.heldTimes"), t("reportsWorkspace.classesCancelled"), t("reportsWorkspace.places"), t("reportsWorkspace.placesBooked"), t("reportsWorkspace.placesFilled"), t("reportsWorkspace.attended"), t("reportsWorkspace.noShows"), t("reportsWorkspace.attendance"), t("reportsWorkspace.waitingList"), t("reportsWorkspace.bookingsCancelled")],
    ...report.rows.map((row) => [row.className, String(row.occurrences), String(row.completedOccurrences), String(row.cancelledOccurrences), String(row.capacity), String(row.booked), row.fillRate === undefined ? "—" : `${Math.round(row.fillRate * 100)}%`, String(row.attended), String(row.noShows), row.attendanceRate === undefined ? "—" : `${Math.round(row.attendanceRate * 100)}%`, String(row.waitlisted), String(row.cancelled)]),
  ], [{ label: t("statements.dateRange"), value: t("reportsWorkspace.rangeLocal", { from: f.date(from), to: f.date(to) }) }], locale);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title={t("reportsWorkspace.classUtilization")}
        definition={t("reportsWorkspace.classDefinition")}
        onExport={exportCsv}
        exportDisabled={report.rows.length === 0}
      />
      {report.rows.length === 0 ? (
        <EmptyState icon={FileBarChart} title={t("reportsWorkspace.noClasses")} description={t("reportsWorkspace.noClassesHint")} />
      ) : (
        <>
          <div className="grid grid-cols-2 divide-line border-b border-line sm:grid-cols-3 xl:grid-cols-6">
            <StatCell label={t("reportsWorkspace.classesScheduled")}>{report.totals.occurrences}</StatCell>
            <StatCell label={t("reportsWorkspace.placesFilled")}>{percent(report.totals.fillRate)}</StatCell>
            <StatCell label={t("reportsWorkspace.attendance")}>{percent(report.totals.attendanceRate)}</StatCell>
            <StatCell label={t("reportsWorkspace.joinedWaitlist")}>{report.totals.waitlisted}</StatCell>
            <StatCell label={t("dashboard.trainer.noShows")} tone={report.totals.noShows > 0 ? "warning" : undefined}>{report.totals.noShows}</StatCell>
            <StatCell label={t("reportsWorkspace.cancelledClasses")} tone={report.totals.cancelledOccurrences > 0 ? "warning" : undefined}>{report.totals.cancelledOccurrences}</StatCell>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>{t("reportsWorkspace.class")}</TableHead><TableHead className="text-end">{t("renewFlow.adjust.membershipStatus.scheduled")}</TableHead><TableHead className="text-end">{t("reportsWorkspace.placesBooked")}</TableHead><TableHead className="text-end">{t("reportsWorkspace.placesFilled")}</TableHead><TableHead className="text-end">{t("reportsWorkspace.attended")}</TableHead><TableHead className="text-end">{t("dashboard.trainer.noShows")}</TableHead><TableHead className="text-end">{t("reportsWorkspace.waitingList")}</TableHead><TableHead className="text-end">{t("reportsWorkspace.cancelledBookings")}</TableHead></TableRow></TableHeader>
              <TableBody>{report.rows.map((row) => <TableRow key={`${row.templateId}:${row.className}`}>
                <TableCell><p className="font-medium">{row.className}</p>{row.cancelledOccurrences ? <p className="mt-0.5 text-[12px] text-warning-deep">{t("reportsWorkspace.cancelledClassesCount", { count: row.cancelledOccurrences })}</p> : null}</TableCell>
                <TableCell className="text-end tabular">{row.occurrences}</TableCell>
                <TableCell className="text-end tabular">{t("reportsWorkspace.ofCapacity", { count: f.number(row.booked), total: f.number(row.capacity) })}</TableCell>
                <TableCell className="text-end tabular">{percent(row.fillRate)}</TableCell>
                <TableCell className="text-end tabular">{row.attended}</TableCell>
                <TableCell className={cn("text-end tabular", row.noShows > 0 && "text-warning-deep")}>{row.noShows}</TableCell>
                <TableCell className="text-end tabular">{row.waitlisted}</TableCell>
                <TableCell className="text-end tabular">{row.cancelled}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}

function ReportHeader({ title, definition, onExport, exportDisabled }: { title: string; definition: string; onExport: () => void; exportDisabled?: boolean }) {
  const t = useT();
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-[16px] font-semibold">{title}</h2>
        <p className="mt-1 max-w-3xl text-[12px] leading-4 text-ink-3">{definition}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onExport} disabled={exportDisabled}><Download />{" "}{t("common.action.download")}</Button>
    </header>
  );
}

function StatCell({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "warning" }) {
  return <div className="border-e border-line px-4 py-3.5 last:border-e-0"><p className="context-label">{label}</p><div className={cn("mt-1 text-[20px] tabular", tone === "warning" && "text-warning-deep")}>{children}</div></div>;
}

// --- Peak hours -------------------------------------------------------------

function PeakHoursView({ report, from, to }: { report: PeakHoursReport; from: string; to: string }) {
  const { t, locale } = useLocale();
  const f = useFormat();
  const byCell = useMemo(() => new Map(report.cells.map((cell) => [`${cell.weekday}:${cell.hour}`, cell.count])), [report.cells]);
  const max = report.busiest?.count ?? 0;
  const hours = useMemo(() => {
    if (report.cells.length === 0) return [] as number[];
    const first = Math.min(...report.cells.map((cell) => cell.hour));
    const last = Math.max(...report.cells.map((cell) => cell.hour));
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  }, [report.cells]);
  const exportCsv = () => downloadCsv(`rivet-peak-hours-${from}-${to}.csv`, t("reportsWorkspace.peakHours"), [
    [t("reportsWorkspace.day"), t("reportsWorkspace.hour"), t("reportsWorkspace.checkins")],
    ...report.cells.map((cell) => [t(WEEKDAYS[cell.weekday]!), f.clock(`${String(cell.hour).padStart(2, "0")}:00`), String(cell.count)]),
  ], [{ label: t("statements.dateRange"), value: t("reportsWorkspace.rangeLocal", { from: f.date(from), to: f.date(to) }) }], locale);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title={t("reportsWorkspace.peakHours")}
        definition={t("reportsWorkspace.peakDefinition")}
        onExport={exportCsv}
        exportDisabled={report.cells.length === 0}
      />
      {report.cells.length === 0 ? (
        <EmptyState icon={FileBarChart} title={t("reportsWorkspace.noCheckins")} description={t("reportsWorkspace.chooseScope")} />
      ) : (
        <div className="space-y-4 p-4">
          <p className="text-[12.5px] text-ink-2">{t("reportsWorkspace.checkinsCount", { count: report.admittedTotal })}{report.excludedTotal > 0 ? t("reportsWorkspace.refused", { count: report.excludedTotal }) : ""}{report.busiest ? t("reportsWorkspace.busiest", { day: t(WEEKDAYS[report.busiest.weekday]!), time: f.clock(`${String(report.busiest.hour).padStart(2, "0")}:00`) }) : ""}{t("members.bulk.toast.end")}</p>
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(640, 88 + hours.length * 64) }}>
              <div className="grid" style={{ gridTemplateColumns: `88px repeat(${hours.length}, 1fr)` }} aria-hidden>
                <div />
                {hours.map((hour) => <div key={hour} className="pb-1 text-center font-mono text-[11px] text-ink-3">{f.clock(`${String(hour).padStart(2, "0")}:00`)}</div>)}
                {WEEKDAYS.map((label, weekday) => (
                  <div key={label} className="contents">
                    <div className="pe-2 py-0.5 text-[12px] text-ink-2">{t(label)}</div>
                    {hours.map((hour) => {
                      const count = byCell.get(`${weekday}:${hour}`) ?? 0;
                      return <div key={hour} className="m-px flex h-7 items-center justify-center rounded-sm text-[12px] font-medium" style={{ backgroundColor: count > 0 ? `color-mix(in oklab, var(--tenant-brand-primary) ${Math.max(12, Math.round((count / max) * 100))}%, transparent)` : "var(--color-sunken)", color: count > 0 && count / max > 0.55 ? "var(--color-paper)" : undefined }}>{count > 0 ? count : ""}</div>;
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-[12px] text-ink-2">{t("reportsWorkspace.showTable")}</summary>
            <div className="mt-2 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>{t("reportsWorkspace.day")}</TableHead><TableHead>{t("reportsWorkspace.hour")}</TableHead><TableHead className="text-end">{t("palette.pages.receptionSubtitle")}</TableHead></TableRow></TableHeader>
                <TableBody>{report.cells.map((cell) => <TableRow key={`${cell.weekday}:${cell.hour}`}><TableCell>{t(WEEKDAYS[cell.weekday]!)}</TableCell><TableCell className="font-mono text-[11px]">{f.clock(`${String(cell.hour).padStart(2, "0")}:00`)}</TableCell><TableCell className="text-end tabular">{cell.count}</TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

// --- Retention --------------------------------------------------------------

function RetentionView({ report }: { report: RetentionReport }) {
  const { t, locale } = useLocale();
  const f = useFormat();
  const cell = (checkpoint: { retained: number; eligible: number }) =>
    checkpoint.eligible === 0 ? <span className="text-ink-4">{t("reportsWorkspace.tooNew")}</span> : <span className="tabular">{f.percent((checkpoint.retained / checkpoint.eligible) * 100)} <span className="text-[12px] text-ink-3">({t("reportsWorkspace.ofCapacity", { count: f.number(checkpoint.retained), total: f.number(checkpoint.eligible) })})</span></span>;
  const exportCsv = () => downloadCsv("rivet-retention-cohorts.csv", t("reportsWorkspace.retentionTitle"), [
    [t("reportsWorkspace.joinedIn"), t("reportsWorkspace.members"), t("reportsWorkspace.oneMonthRetained"), t("reportsWorkspace.oneMonthEligible"), t("reportsWorkspace.threeMonthsRetained"), t("reportsWorkspace.threeMonthsEligible"), t("reportsWorkspace.sixMonthsRetained"), t("reportsWorkspace.sixMonthsEligible"), t("reportsWorkspace.twelveMonthsRetained"), t("reportsWorkspace.twelveMonthsEligible")],
    ...report.cohorts.map((cohort) => [monthName(cohort.cohortMonth, f), String(cohort.size), String(cohort.months1.retained), String(cohort.months1.eligible), String(cohort.months3.retained), String(cohort.months3.eligible), String(cohort.months6.retained), String(cohort.months6.eligible), String(cohort.months12.retained), String(cohort.months12.eligible)]),
  ], [], locale);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title={t("reportsWorkspace.retentionTitle")}
        definition={t("reportsWorkspace.retentionDefinition")}
        onExport={exportCsv}
        exportDisabled={report.cohorts.length === 0}
      />
      {report.cohorts.length === 0 ? (
        <EmptyState icon={FileBarChart} title={t("reportsWorkspace.noMembershipHistory")} description={t("reportsWorkspace.noMembershipHistoryHint")} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>{t("reportsWorkspace.joinedIn")}</TableHead><TableHead className="text-end">{t("palette.groups.members")}</TableHead><TableHead className="text-end">{t("reportsWorkspace.after1")}</TableHead><TableHead className="text-end">{t("reportsWorkspace.after3")}</TableHead><TableHead className="text-end">{t("reportsWorkspace.after6")}</TableHead><TableHead className="text-end">{t("reportsWorkspace.after12")}</TableHead></TableRow></TableHeader>
            <TableBody>
              {report.cohorts.map((cohort) => (
                <TableRow key={cohort.cohortMonth}>
                  <TableCell className="whitespace-nowrap text-[12px]">{monthName(cohort.cohortMonth, f)}</TableCell>
                  <TableCell className="text-end tabular">{cohort.size}</TableCell>
                  <TableCell className="text-end">{cell(cohort.months1)}</TableCell>
                  <TableCell className="text-end">{cell(cohort.months3)}</TableCell>
                  <TableCell className="text-end">{cell(cohort.months6)}</TableCell>
                  <TableCell className="text-end">{cell(cohort.months12)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

// --- Renewals ---------------------------------------------------------------

function RenewalsView({ report, currency }: { report: RenewalForecastReport; currency: string }) {
  const { t, locale } = useLocale();
  const f = useFormat();
  const total = report.buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const exportCsv = () => downloadCsv("rivet-renewal-forecast.csv", t("reportsWorkspace.renewalsTitle"), [
    [t("reportsWorkspace.endsIn"), t("reportsWorkspace.member"), t("reportsWorkspace.plan"), t("reportsWorkspace.membershipEnds"), t("reportsWorkspace.renewalValue"), t("reportsWorkspace.currency")],
    ...report.buckets.flatMap((bucket) => bucket.rows.map((row) => [renewalBucketLabel(bucket.label, t), row.memberName, row.planName, f.date(row.endDate), formatMinorUnits(row.valueMinor, currency), currency])),
  ], [], locale);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title={t("reportsWorkspace.renewalsTitle")}
        definition={t("reportsWorkspace.renewalsDefinition")}
        onExport={exportCsv}
        exportDisabled={total === 0}
      />
      {total === 0 ? (
        <EmptyState icon={FileBarChart} title={t("reportsWorkspace.noRenewals")} description={t("reportsWorkspace.noRenewalsHint")} />
      ) : (
        <div className="space-y-4 p-4">
          <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
            {report.buckets.map((bucket) => (
              <div key={renewalBucketLabel(bucket.label, t)} className="bg-surface px-4 py-3.5">
                <p className="context-label">{renewalBucketLabel(bucket.label, t)}</p>
                <p className="mt-1 text-[20px] tabular">{bucket.count}</p>
                <p className="text-[12px] text-ink-3"><MoneyText money={money(bucket.valueMinor, currency)} /> {" "}{t("reportsWorkspace.ifAllRenew")}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>{t("palette.kind.member")}</TableHead><TableHead>{t("renewFlow.adjust.planChange.rowPlan")}</TableHead><TableHead>{t("crm.queues.ends")}</TableHead><TableHead>{t("reportsWorkspace.endsIn")}</TableHead><TableHead className="text-end">{t("reportsWorkspace.value")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {report.buckets.flatMap((bucket) => bucket.rows.map((row) => (
                  <TableRow key={row.membershipId}>
                    <TableCell><Link href={`/members/${row.memberId}`} className="font-medium hover:underline underline-offset-2">{row.memberName}</Link></TableCell>
                    <TableCell className="text-[12px]">{row.planName}</TableCell>
                    <TableCell className="whitespace-nowrap text-[12px]">{f.date(row.endDate)}</TableCell>
                    <TableCell className="text-[12px]">{renewalBucketLabel(bucket.label, t)}</TableCell>
                    <TableCell className="text-end"><MoneyText money={money(row.valueMinor, currency)} /></TableCell>
                  </TableRow>
                )))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </section>
  );
}

// --- Collections ------------------------------------------------------------

function CollectionsView({ report, from, to, currency }: { report: CollectionsReport; from: string; to: string; currency: string }) {
  const { t, locale } = useLocale();
  const f = useFormat();
  const exportCsv = () => downloadCsv(`rivet-collections-${from}-${to}.csv`, t("reportsWorkspace.collections"), [
    [t("reportsWorkspace.what"), t("reportsWorkspace.count"), t("reportsWorkspace.amount"), t("reportsWorkspace.currency")],
    [t("reportsWorkspace.charged"), String(report.chargedCount), formatMinorUnits(report.chargedMinor, currency), currency],
    [t("reportsWorkspace.collected"), String(report.collectedCount), formatMinorUnits(report.collectedMinor, currency), currency],
    [t("reportsWorkspace.refunded"), String(report.refundedCount), formatMinorUnits(report.refundedMinor, currency), currency],
    [t("reportsWorkspace.cancelledPayments"), String(report.voidedCount), formatMinorUnits(report.voidedMinor, currency), currency],
    [t("reportsWorkspace.unpaidAnyDate"), "", formatMinorUnits(report.outstandingNowMinor, currency), currency],
  ], [{ label: t("statements.dateRange"), value: t("reportsWorkspace.rangeLocal", { from: f.date(from), to: f.date(to) }) }], locale);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title={t("reportsWorkspace.collections")}
        definition={t("reportsWorkspace.collectionsDefinition")}
        onExport={exportCsv}
      />
      <div className="grid grid-cols-2 divide-line sm:grid-cols-3 xl:grid-cols-5">
        <StatCell label={t("reportsWorkspace.charged")}><MoneyText money={money(report.chargedMinor, currency)} compact /></StatCell>
        <StatCell label={t("dashboard.owner.collected")}><MoneyText money={money(report.collectedMinor, currency)} compact /></StatCell>
        <StatCell label={t("reportsWorkspace.refunds")} tone={report.refundedMinor > 0 ? "warning" : undefined}><MoneyText money={money(report.refundedMinor, currency)} compact /></StatCell>
        <StatCell label={t("reportsWorkspace.cancelledPayments")} tone={report.voidedMinor > 0 ? "warning" : undefined}><MoneyText money={money(report.voidedMinor, currency)} compact /></StatCell>
        <StatCell label={t("reportsWorkspace.unpaid")} tone={report.outstandingNowMinor > 0 ? "warning" : undefined}><MoneyText money={money(report.outstandingNowMinor, currency)} compact /></StatCell>
      </div>
      <p className="border-t border-line px-4 py-3 text-[12px] text-ink-3">{t("reportsWorkspace.countSummary", { charged: t("reportsWorkspace.charges", { count: report.chargedCount }), collected: t("reportsWorkspace.payments", { count: report.collectedCount }), refunds: t("reportsWorkspace.refundCount", { count: report.refundedCount }), voids: t("reportsWorkspace.payments", { count: report.voidedCount }) })}</p>
    </section>
  );
}

// --- CRM --------------------------------------------------------------------

function CrmView({ report, from, to }: { report: CrmFunnelReport; from: string; to: string }) {
  const { t, locale } = useLocale();
  const f = useFormat();
  const exportCsv = () => downloadCsv(`rivet-crm-funnel-${from}-${to}.csv`, t("reportsWorkspace.crmTitle"), [
    [t("reportsWorkspace.what"), t("reportsWorkspace.value")],
    [t("reportsWorkspace.newLeads"), String(report.leadsCreated)],
    [t("reportsWorkspace.leadsContacted"), String(report.leadsContacted)],
    [t("reportsWorkspace.medianHours"), report.medianFirstResponseHours === undefined ? "—" : String(report.medianFirstResponseHours)],
    [t("reportsWorkspace.trialsBooked"), String(report.trialsBooked)],
    [t("reportsWorkspace.trialsAttended"), String(report.trialsAttended)],
    [t("reportsWorkspace.membershipsSold"), String(report.membershipsSold)],
    [t("reportsWorkspace.joinedTrial"), report.trialToSaleRate === undefined ? "—" : `${Math.round(report.trialToSaleRate * 100)}%`],
  ], [{ label: t("statements.dateRange"), value: t("reportsWorkspace.rangeLocal", { from: f.date(from), to: f.date(to) }) }], locale);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title={t("reportsWorkspace.crmTitle")}
        definition={t("reportsWorkspace.crmDefinition")}
        onExport={exportCsv}
      />
      {report.leadsCreated === 0 && report.trialsBooked === 0 ? (
        <EmptyState icon={FileBarChart} title={t("reportsWorkspace.noLeads")} description={t("reportsWorkspace.noLeadsHint")} />
      ) : (
        <div className="grid grid-cols-2 divide-line sm:grid-cols-4 xl:grid-cols-7">
          <StatCell label={t("reportsWorkspace.newLeads")}>{report.leadsCreated}</StatCell>
          <StatCell label={t("memberProfile.contact.stage.contacted")}>{report.leadsContacted}</StatCell>
          <StatCell label={t("reportsWorkspace.firstContact")}>{report.medianFirstResponseHours === undefined ? "—" : t("reportsWorkspace.hours", { count: report.medianFirstResponseHours })}</StatCell>
          <StatCell label={t("reportsWorkspace.trials")}>{report.trialsBooked}</StatCell>
          <StatCell label={t("reportsWorkspace.attended")}>{report.trialsAttended}</StatCell>
          <StatCell label={t("domain.leadStage.won")}>{report.membershipsSold}</StatCell>
          <StatCell label={t("reportsWorkspace.joinedTrial")}>{report.trialToSaleRate === undefined ? "—" : f.percent(report.trialToSaleRate * 100)}</StatCell>
        </div>
      )}
    </section>
  );
}

// --- Controls ---------------------------------------------------------------

function ControlsView({ report, from, to, currency }: { report: ControlTrendsReport; from: string; to: string; currency: string }) {
  const { t, locale } = useLocale();
  const f = useFormat();
  const timeZone = useFormattingTimeZone();
  const exportCsv = () => downloadTextFile({
    fileName: `rivet-commercial-controls-${from}-${to}.csv`,
    mimeType: "text/csv;charset=utf-8",
    content: buildSectionedCsvDocument({
      locale,
      title: t("reportsWorkspace.controlsTitle"),
      metadata: [{ label: t("statements.dateRange"), value: t("reportsWorkspace.rangeLocal", { from: f.date(from), to: f.date(to) }) }],
      sections: [
        {
          title: t("renewFlow.sale.summary"),
          headers: [t("reportsWorkspace.what"), t("reportsWorkspace.count"), t("reportsWorkspace.amount"), t("reportsWorkspace.currency")],
          rows: [
            [t("reportsWorkspace.refunds"), report.refunds.count, formatMinorUnits(report.refunds.amountMinor, currency), currency],
            [t("reportsWorkspace.cancelledPayments"), report.voids.count, formatMinorUnits(report.voids.amountMinor, currency), currency],
            [t("reportsWorkspace.discountsGiven"), report.discounts.count, formatMinorUnits(report.discounts.amountMinor, currency), currency],
            [t("reportsWorkspace.priceChanges"), report.priceOverrides.count, formatMinorUnits(report.priceOverrides.amountMinor, currency), currency],
            [t("reportsWorkspace.exceptions"), report.staffOverrides.count, "", ""],
          ],
        },
        {
          title: t("reportsWorkspace.recentStaff"),
          headers: [t("reportsWorkspace.when"), t("reportsWorkspace.type"), t("reportsWorkspace.whatHappened"), t("reportsWorkspace.staff"), t("reportsWorkspace.reason")],
          rows: report.recent.map((event) => [formatExportDateTime(event.occurredAt, timeZone, locale), controlActionLabel(event.action, t), event.summary, event.actorName, event.reason ?? ""]),
          emptyMessage: t("reportsWorkspace.noStaffActions"),
        },
      ],
    }),
  });
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title={t("reportsWorkspace.controlsTitle")}
        definition={t("reportsWorkspace.controlsDefinition")}
        onExport={exportCsv}
      />
      <div className="grid grid-cols-2 divide-line sm:grid-cols-5">
        <StatCell label={t("reportsWorkspace.refunds")} tone={report.refunds.count > 0 ? "warning" : undefined}><MoneyText money={money(report.refunds.amountMinor, currency)} compact /></StatCell>
        <StatCell label={t("reportsWorkspace.cancelledPayments")} tone={report.voids.count > 0 ? "warning" : undefined}><MoneyText money={money(report.voids.amountMinor, currency)} compact /></StatCell>
        <StatCell label={t("reportsWorkspace.discounts")}><MoneyText money={money(report.discounts.amountMinor, currency)} compact /></StatCell>
        <StatCell label={t("reportsWorkspace.priceChanges")}><MoneyText money={money(report.priceOverrides.amountMinor, currency)} compact /></StatCell>
        <StatCell label={t("reportsWorkspace.exceptions")}>{report.staffOverrides.count}</StatCell>
      </div>
      {report.recent.length === 0 ? (
        <p className="border-t border-line p-5 text-[13px] text-ink-3">{t("reportsWorkspace.noStaffActions")}</p>
      ) : (
        <div className="overflow-x-auto border-t border-line">
          <Table>
            <TableHeader><TableRow><TableHead>{t("members.tabs.checkIns.when")}</TableHead><TableHead>{t("common.label.type")}</TableHead><TableHead>{t("reportsWorkspace.whatHappened")}</TableHead><TableHead>{t("reportsWorkspace.staff")}</TableHead><TableHead>{t("common.label.details")}</TableHead></TableRow></TableHeader>
            <TableBody>
              {report.recent.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-[12px]">{f.date(event.occurredAt)}</TableCell>
                  <TableCell className="text-[12px]">{controlActionLabel(event.action, t)}</TableCell>
                  <TableCell className="max-w-72 truncate text-[12px]" title={event.summary}>{event.summary}</TableCell>
                  <TableCell className="text-[12px]">{event.actorName}</TableCell>
                  <TableCell><Link href="/audit" className="text-[12px] underline decoration-line-3 underline-offset-2 hover:text-ink">{t("nav.item.activityLog")}</Link></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
