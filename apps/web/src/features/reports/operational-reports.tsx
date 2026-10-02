"use client";

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
import { formatDate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { buildCsvDocument, buildSectionedCsvDocument, formatMinorUnits, type CsvMetadataItem } from "@/lib/exports/csv";
import { downloadTextFile } from "@/lib/exports/download";
import type { ClassUtilizationReport, PeakHoursReport, RetentionReport, RenewalForecastReport, CollectionsReport, CrmFunnelReport, ControlTrendsReport } from "@/lib/domain/types";
import { ReportScopeBar, reportScopeFrom, type ReportScope } from "./report-scope";

export type OperationalReportKind = "peak-hours" | "classes" | "retention" | "renewals" | "collections" | "crm" | "controls";

export const OPERATIONAL_REPORT_LABELS: Record<OperationalReportKind, string> = {
  "peak-hours": "Peak hours",
  classes: "Classes",
  retention: "Members who stay",
  renewals: "Renewals",
  collections: "Charged and paid",
  crm: "Leads",
  controls: "Refunds and discounts",
};

/** The operating question each report exists to answer. Shown as the page description. */
export const OPERATIONAL_REPORT_QUESTIONS: Record<OperationalReportKind, string> = {
  "peak-hours": "When is the gym busiest, and when is it quiet?",
  classes: "Which classes fill up, and which have empty places or no-shows?",
  retention: "Do new members stay with the gym?",
  renewals: "Which memberships end in the next 30 days, and what are they worth?",
  collections: "Did members pay what we charged, and what is still unpaid?",
  crm: "How fast do we contact new leads, and do they join?",
  controls: "Who gave refunds or discounts, cancelled payments or made exceptions, and why?",
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Plain names for the staff actions the refunds and discounts report lists. */
const CONTROL_ACTION_LABELS: Record<string, string> = {
  "payment.refund": "Refund",
  "payment.void": "Payment cancelled",
  "membership.price_override": "Price changed",
  "membership.date_override": "Dates changed",
  "checkin.override": "Let in anyway",
};
const MONTH_NAME = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-08" reads as "August 2026"; anything unexpected is shown as it came. */
function monthName(yearMonth: string): string {
  const date = new Date(`${yearMonth}-01T12:00:00Z`);
  return /^\d{4}-\d{2}$/.test(yearMonth) && !Number.isNaN(date.valueOf()) ? MONTH_NAME.format(date) : yearMonth;
}

const RANGED: Record<OperationalReportKind, boolean> = { "peak-hours": true, classes: true, retention: false, renewals: false, collections: true, crm: true, controls: true };

function downloadCsv(fileName: string, title: string, rows: string[][], metadata: CsvMetadataItem[] = []) {
  const [headers = [], ...dataRows] = rows;
  downloadTextFile({
    fileName,
    mimeType: "text/csv;charset=utf-8",
    content: buildCsvDocument({ title, metadata, headers, rows: dataRows }),
  });
}

/**
 * Read-only analytics views under Reports. All math happens on the server;
 * the scope (branch, window) belongs to the page URL so every report shares
 * one scope bar and one set of filters.
 */
export function OperationalReports({ view, scope, branches, onScopeChange }: { view: OperationalReportKind; scope: ReportScope; branches: ReadonlyArray<{ id: string; name: string }>; onScopeChange: (patch: Partial<ReportScope>) => void }) {
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
      <ReportScopeBar branches={branches} scope={scope} onChange={onScopeChange} ranged={RANGED[view]} onRefresh={() => void active.refetch()} refreshing={active.isFetching} note={RANGED[view] ? undefined : "as of today"} />

      {active.isBackgroundError ? <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning-deep" role="status" aria-label="Report may be out of date">This report may be out of date. The last refresh failed. <button type="button" className="font-medium underline" onClick={() => void active.refetch()}>Try again</button></div> : null}
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
  const percent = (value?: number) => value === undefined ? "—" : `${Math.round(value * 100)}%`;
  const exportCsv = () => downloadCsv(`rivet-class-utilization-${from}-${to}.csv`, "How full classes were", [
    ["Class", "Times scheduled", "Times held", "Classes cancelled", "Places", "Places booked", "Places filled", "Attended", "No-shows", "Attendance", "Waiting list", "Bookings cancelled"],
    ...report.rows.map((row) => [row.className, String(row.occurrences), String(row.completedOccurrences), String(row.cancelledOccurrences), String(row.capacity), String(row.booked), percent(row.fillRate), String(row.attended), String(row.noShows), percent(row.attendanceRate), String(row.waitlisted), String(row.cancelled)]),
  ], [{ label: "Date range", value: `${from} to ${to} (your gym's time)` }]);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title="How full classes were"
        definition="Bookings and attendance for each class in these dates. Places filled is booked places out of all places. Cancelled classes are not counted. Attendance only counts bookings where staff marked who came. Waiting list includes members later moved into the class."
        onExport={exportCsv}
        exportDisabled={report.rows.length === 0}
      />
      {report.rows.length === 0 ? (
        <EmptyState icon={FileBarChart} title="No classes in these dates" description="Classes show here once they are on the timetable." />
      ) : (
        <>
          <div className="grid grid-cols-2 divide-line border-b border-line sm:grid-cols-3 xl:grid-cols-6">
            <StatCell label="Classes scheduled">{report.totals.occurrences}</StatCell>
            <StatCell label="Places filled">{percent(report.totals.fillRate)}</StatCell>
            <StatCell label="Attendance">{percent(report.totals.attendanceRate)}</StatCell>
            <StatCell label="Joined waiting list">{report.totals.waitlisted}</StatCell>
            <StatCell label="No-shows" tone={report.totals.noShows > 0 ? "warning" : undefined}>{report.totals.noShows}</StatCell>
            <StatCell label="Cancelled classes" tone={report.totals.cancelledOccurrences > 0 ? "warning" : undefined}>{report.totals.cancelledOccurrences}</StatCell>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Class</TableHead><TableHead className="text-end">Scheduled</TableHead><TableHead className="text-end">Places booked</TableHead><TableHead className="text-end">Places filled</TableHead><TableHead className="text-end">Attended</TableHead><TableHead className="text-end">No-shows</TableHead><TableHead className="text-end">Waiting list</TableHead><TableHead className="text-end">Cancelled bookings</TableHead></TableRow></TableHeader>
              <TableBody>{report.rows.map((row) => <TableRow key={`${row.templateId}:${row.className}`}>
                <TableCell><p className="font-medium">{row.className}</p>{row.cancelledOccurrences ? <p className="mt-0.5 text-[12px] text-warning-deep">{row.cancelledOccurrences} class{row.cancelledOccurrences === 1 ? "" : "es"} cancelled</p> : null}</TableCell>
                <TableCell className="text-end tabular">{row.occurrences}</TableCell>
                <TableCell className="text-end tabular">{row.booked} of {row.capacity}</TableCell>
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
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-[16px] font-semibold">{title}</h2>
        <p className="mt-1 max-w-3xl text-[12px] leading-4 text-ink-3">{definition}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onExport} disabled={exportDisabled}><Download /> Download</Button>
    </header>
  );
}

function StatCell({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "warning" }) {
  return <div className="border-e border-line px-4 py-3.5 last:border-e-0"><p className="context-label">{label}</p><div className={cn("mt-1 text-[20px] tabular", tone === "warning" && "text-warning-deep")}>{children}</div></div>;
}

// --- Peak hours -------------------------------------------------------------

function PeakHoursView({ report, from, to }: { report: PeakHoursReport; from: string; to: string }) {
  const byCell = useMemo(() => new Map(report.cells.map((cell) => [`${cell.weekday}:${cell.hour}`, cell.count])), [report.cells]);
  const max = report.busiest?.count ?? 0;
  const hours = useMemo(() => {
    if (report.cells.length === 0) return [] as number[];
    const first = Math.min(...report.cells.map((cell) => cell.hour));
    const last = Math.max(...report.cells.map((cell) => cell.hour));
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  }, [report.cells]);
  const exportCsv = () => downloadCsv(`rivet-peak-hours-${from}-${to}.csv`, "Peak hours", [
    ["Day", "Hour", "Check-ins"],
    ...report.cells.map((cell) => [WEEKDAYS[cell.weekday]!, `${String(cell.hour).padStart(2, "0")}:00`, String(cell.count)]),
  ], [{ label: "Date range", value: `${from} to ${to} (your gym's time)` }]);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title="Peak hours"
        definition="Check-ins for each day and hour, in the gym's local time. Refused entries are not counted. Members let in anyway are counted."
        onExport={exportCsv}
        exportDisabled={report.cells.length === 0}
      />
      {report.cells.length === 0 ? (
        <EmptyState icon={FileBarChart} title="No check-ins in these dates" description="Choose more days or another branch." />
      ) : (
        <div className="space-y-4 p-4">
          <p className="text-[12.5px] text-ink-2">{report.admittedTotal} check-ins{report.excludedTotal > 0 ? ` · ${report.excludedTotal} refused entries not counted` : ""}{report.busiest ? ` · busiest time: ${WEEKDAYS[report.busiest.weekday]} ${String(report.busiest.hour).padStart(2, "0")}:00` : ""}.</p>
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid" style={{ gridTemplateColumns: `88px repeat(${hours.length}, 1fr)` }} aria-hidden>
                <div />
                {hours.map((hour) => <div key={hour} className="pb-1 text-center font-mono text-[11px] text-ink-3">{String(hour).padStart(2, "0")}</div>)}
                {WEEKDAYS.map((label, weekday) => (
                  <div key={label} className="contents">
                    <div className="pe-2 py-0.5 text-[12px] text-ink-2">{label}</div>
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
            <summary className="cursor-pointer text-[12px] text-ink-2">Show as a table</summary>
            <div className="mt-2 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Day</TableHead><TableHead>Hour</TableHead><TableHead className="text-end">Check-ins</TableHead></TableRow></TableHeader>
                <TableBody>{report.cells.map((cell) => <TableRow key={`${cell.weekday}:${cell.hour}`}><TableCell>{WEEKDAYS[cell.weekday]}</TableCell><TableCell className="font-mono text-[11px]">{String(cell.hour).padStart(2, "0")}:00</TableCell><TableCell className="text-end tabular">{cell.count}</TableCell></TableRow>)}</TableBody>
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
  const cell = (checkpoint: { retained: number; eligible: number }) =>
    checkpoint.eligible === 0 ? <span className="text-ink-4">too new</span> : <span className="tabular">{Math.round((checkpoint.retained / checkpoint.eligible) * 100)}% <span className="text-[12px] text-ink-3">({checkpoint.retained} of {checkpoint.eligible})</span></span>;
  const exportCsv = () => downloadCsv("rivet-retention-cohorts.csv", "How many new members stay", [
    ["Joined in", "Members", "After 1 month: stayed", "After 1 month: counted", "After 3 months: stayed", "After 3 months: counted", "After 6 months: stayed", "After 6 months: counted", "After 12 months: stayed", "After 12 months: counted"],
    ...report.cohorts.map((cohort) => [cohort.cohortMonth, String(cohort.size), String(cohort.months1.retained), String(cohort.months1.eligible), String(cohort.months3.retained), String(cohort.months3.eligible), String(cohort.months6.retained), String(cohort.months6.eligible), String(cohort.months12.retained), String(cohort.months12.eligible)]),
  ]);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title="How many new members stay"
        definition="Members are grouped by the month they first joined. Each column shows how many still had a membership 1, 3, 6 and 12 months later. Frozen memberships count. A gap on that exact day counts as gone, even if the member came back later. Members who joined too recently are left out of that column."
        onExport={exportCsv}
        exportDisabled={report.cohorts.length === 0}
      />
      {report.cohorts.length === 0 ? (
        <EmptyState icon={FileBarChart} title="No membership history yet" description="Members show here once they have a membership." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Joined in</TableHead><TableHead className="text-end">Members</TableHead><TableHead className="text-end">After 1 month</TableHead><TableHead className="text-end">After 3 months</TableHead><TableHead className="text-end">After 6 months</TableHead><TableHead className="text-end">After 12 months</TableHead></TableRow></TableHeader>
            <TableBody>
              {report.cohorts.map((cohort) => (
                <TableRow key={cohort.cohortMonth}>
                  <TableCell className="whitespace-nowrap text-[12px]">{monthName(cohort.cohortMonth)}</TableCell>
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
  const total = report.buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const exportCsv = () => downloadCsv("rivet-renewal-forecast.csv", "Memberships ending soon", [
    ["Ends in", "Member", "Plan", "Membership ends", "Value if renewed", "Currency"],
    ...report.buckets.flatMap((bucket) => bucket.rows.map((row) => [bucket.label, row.memberName, row.planName, row.endDate, formatMinorUnits(row.valueMinor, currency), currency])),
  ]);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title="Memberships ending soon"
        definition="Memberships that end in the next 30 days and are not renewed yet. Each membership is counted once. Value is the price of the member's plan."
        onExport={exportCsv}
        exportDisabled={total === 0}
      />
      {total === 0 ? (
        <EmptyState icon={FileBarChart} title="No memberships end in the next 30 days" description="All current memberships run longer or are already renewed." />
      ) : (
        <div className="space-y-4 p-4">
          <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
            {report.buckets.map((bucket) => (
              <div key={bucket.label} className="bg-surface px-4 py-3.5">
                <p className="context-label">{bucket.label}</p>
                <p className="mt-1 text-[20px] tabular">{bucket.count}</p>
                <p className="text-[12px] text-ink-3"><MoneyText money={money(bucket.valueMinor)} /> if all renew</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Plan</TableHead><TableHead>Ends</TableHead><TableHead>Ends in</TableHead><TableHead className="text-end">Value</TableHead></TableRow></TableHeader>
              <TableBody>
                {report.buckets.flatMap((bucket) => bucket.rows.map((row) => (
                  <TableRow key={row.membershipId}>
                    <TableCell><Link href={`/members/${row.memberId}`} className="font-medium hover:underline underline-offset-2">{row.memberName}</Link></TableCell>
                    <TableCell className="text-[12px]">{row.planName}</TableCell>
                    <TableCell className="whitespace-nowrap text-[12px]">{formatDate(row.endDate)}</TableCell>
                    <TableCell className="text-[12px]">{bucket.label}</TableCell>
                    <TableCell className="text-end"><MoneyText money={money(row.valueMinor)} /></TableCell>
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
  const exportCsv = () => downloadCsv(`rivet-collections-${from}-${to}.csv`, "Charged and paid", [
    ["What", "Count", "Amount", "Currency"],
    ["Charged", String(report.chargedCount), formatMinorUnits(report.chargedMinor, currency), currency],
    ["Collected", String(report.collectedCount), formatMinorUnits(report.collectedMinor, currency), currency],
    ["Refunded", String(report.refundedCount), formatMinorUnits(report.refundedMinor, currency), currency],
    ["Cancelled payments", String(report.voidedCount), formatMinorUnits(report.voidedMinor, currency), currency],
    ["Unpaid now (any date)", "", formatMinorUnits(report.outstandingNowMinor, currency), currency],
  ], [{ label: "Date range", value: `${from} to ${to} (your gym's time)` }]);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title="Charged and paid"
        definition="What members were charged and what they paid in these dates. Cancelled payments are not counted as collected. Refunds are shown on their own. Unpaid now is everything members owe today, not only for these dates."
        onExport={exportCsv}
      />
      <div className="grid grid-cols-2 divide-line sm:grid-cols-3 xl:grid-cols-5">
        <StatCell label="Charged"><MoneyText money={money(report.chargedMinor)} compact /></StatCell>
        <StatCell label="Collected"><MoneyText money={money(report.collectedMinor)} compact /></StatCell>
        <StatCell label="Refunds" tone={report.refundedMinor > 0 ? "warning" : undefined}><MoneyText money={money(report.refundedMinor)} compact /></StatCell>
        <StatCell label="Cancelled payments" tone={report.voidedMinor > 0 ? "warning" : undefined}><MoneyText money={money(report.voidedMinor)} compact /></StatCell>
        <StatCell label="Unpaid now" tone={report.outstandingNowMinor > 0 ? "warning" : undefined}><MoneyText money={money(report.outstandingNowMinor)} compact /></StatCell>
      </div>
      <p className="border-t border-line px-4 py-3 text-[12px] text-ink-3">{report.chargedCount} charge{report.chargedCount === 1 ? "" : "s"} · {report.collectedCount} payment{report.collectedCount === 1 ? "" : "s"} collected · {report.refundedCount} refund{report.refundedCount === 1 ? "" : "s"} · {report.voidedCount} payment{report.voidedCount === 1 ? "" : "s"} cancelled.</p>
    </section>
  );
}

// --- CRM --------------------------------------------------------------------

function CrmView({ report, from, to }: { report: CrmFunnelReport; from: string; to: string }) {
  const exportCsv = () => downloadCsv(`rivet-crm-funnel-${from}-${to}.csv`, "Lead follow-up and sales", [
    ["What", "Value"],
    ["New leads", String(report.leadsCreated)],
    ["Leads contacted", String(report.leadsContacted)],
    ["Time to first contact (hours, middle value)", report.medianFirstResponseHours === undefined ? "—" : String(report.medianFirstResponseHours)],
    ["Trials booked", String(report.trialsBooked)],
    ["Trials attended", String(report.trialsAttended)],
    ["Memberships sold from these leads", String(report.membershipsSold)],
    ["Joined after trial", report.trialToSaleRate === undefined ? "—" : `${Math.round(report.trialToSaleRate * 100)}%`],
  ], [{ label: "Date range", value: `${from} to ${to} (your gym's time)` }]);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title="Lead follow-up and sales"
        definition="New leads in these dates, how fast staff first tried to contact them, their trials, and how many joined. Time to first contact is the middle value: half of leads were contacted faster."
        onExport={exportCsv}
      />
      {report.leadsCreated === 0 && report.trialsBooked === 0 ? (
        <EmptyState icon={FileBarChart} title="No leads in these dates" description="New leads and trials show here when the sales team adds them." />
      ) : (
        <div className="grid grid-cols-2 divide-line sm:grid-cols-4 xl:grid-cols-7">
          <StatCell label="New leads">{report.leadsCreated}</StatCell>
          <StatCell label="Contacted">{report.leadsContacted}</StatCell>
          <StatCell label="Time to first contact">{report.medianFirstResponseHours === undefined ? "—" : `${report.medianFirstResponseHours} ${report.medianFirstResponseHours === 1 ? "hour" : "hours"}`}</StatCell>
          <StatCell label="Trials">{report.trialsBooked}</StatCell>
          <StatCell label="Attended">{report.trialsAttended}</StatCell>
          <StatCell label="Sold">{report.membershipsSold}</StatCell>
          <StatCell label="Joined after trial">{report.trialToSaleRate === undefined ? "—" : `${Math.round(report.trialToSaleRate * 100)}%`}</StatCell>
        </div>
      )}
    </section>
  );
}

// --- Controls ---------------------------------------------------------------

function ControlsView({ report, from, to, currency }: { report: ControlTrendsReport; from: string; to: string; currency: string }) {
  const exportCsv = () => downloadTextFile({
    fileName: `rivet-commercial-controls-${from}-${to}.csv`,
    mimeType: "text/csv;charset=utf-8",
    content: buildSectionedCsvDocument({
      title: "Refunds, discounts and exceptions",
      metadata: [{ label: "Date range", value: `${from} to ${to} (your gym's time)` }],
      sections: [
        {
          title: "Summary",
          headers: ["What", "Count", "Amount", "Currency"],
          rows: [
            ["Refunds", report.refunds.count, formatMinorUnits(report.refunds.amountMinor, currency), currency],
            ["Cancelled payments", report.voids.count, formatMinorUnits(report.voids.amountMinor, currency), currency],
            ["Discounts given", report.discounts.count, formatMinorUnits(report.discounts.amountMinor, currency), currency],
            ["Price changes", report.priceOverrides.count, formatMinorUnits(report.priceOverrides.amountMinor, currency), currency],
            ["Exceptions", report.staffOverrides.count, "", ""],
          ],
        },
        {
          title: "Recent staff actions",
          headers: ["When", "Type", "What happened", "Staff", "Reason"],
          rows: report.recent.map((event) => [event.occurredAt, CONTROL_ACTION_LABELS[event.action] ?? event.action.replaceAll("_", " "), event.summary, event.actorName, event.reason ?? ""]),
          emptyMessage: "No staff actions to check in these dates.",
        },
      ],
    }),
  });
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title="Refunds, discounts and exceptions"
        definition="Refunds, cancelled payments, discounts and exceptions in these dates, with who did them. Exceptions are members let in anyway and membership dates changed by staff. Open the activity log to see what changed."
        onExport={exportCsv}
      />
      <div className="grid grid-cols-2 divide-line sm:grid-cols-5">
        <StatCell label="Refunds" tone={report.refunds.count > 0 ? "warning" : undefined}><MoneyText money={money(report.refunds.amountMinor)} compact /></StatCell>
        <StatCell label="Cancelled payments" tone={report.voids.count > 0 ? "warning" : undefined}><MoneyText money={money(report.voids.amountMinor)} compact /></StatCell>
        <StatCell label="Discounts"><MoneyText money={money(report.discounts.amountMinor)} compact /></StatCell>
        <StatCell label="Price changes"><MoneyText money={money(report.priceOverrides.amountMinor)} compact /></StatCell>
        <StatCell label="Exceptions">{report.staffOverrides.count}</StatCell>
      </div>
      {report.recent.length === 0 ? (
        <p className="border-t border-line p-5 text-[13px] text-ink-3">No staff actions to check in these dates.</p>
      ) : (
        <div className="overflow-x-auto border-t border-line">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead>What happened</TableHead><TableHead>Staff</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
            <TableBody>
              {report.recent.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-[12px]">{formatDate(event.occurredAt)}</TableCell>
                  <TableCell className="text-[12px]">{CONTROL_ACTION_LABELS[event.action] ?? event.action}</TableCell>
                  <TableCell className="max-w-72 truncate text-[12px]" title={event.summary}>{event.summary}</TableCell>
                  <TableCell className="text-[12px]">{event.actorName}</TableCell>
                  <TableCell><Link href="/audit" className="text-[12px] underline decoration-line-3 underline-offset-2 hover:text-ink">Activity log</Link></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
