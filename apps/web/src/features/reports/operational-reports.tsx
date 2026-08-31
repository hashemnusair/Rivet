"use client";

import { Download, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/misc";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, EmptyState } from "@/components/ui/states";
import { MoneyText } from "@/components/shared/data-display";
import { FileBarChart } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { qk } from "@/lib/api/keys";
import { useApp } from "@/lib/providers/app-providers";
import { addDays, formatDate, todayISODate } from "@/lib/utils/dates";
import { money } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { buildCsvDocument, buildSectionedCsvDocument, formatMinorUnits, type CsvMetadataItem } from "@/lib/exports/csv";
import { downloadTextFile } from "@/lib/exports/download";
import type { ClassUtilizationReport, PeakHoursReport, RetentionReport, RenewalForecastReport, CollectionsReport, CrmFunnelReport, ControlTrendsReport } from "@/lib/domain/types";

export type OperationalReportKind = "peak-hours" | "classes" | "retention" | "renewals" | "collections" | "crm" | "controls";

export const OPERATIONAL_REPORT_LABELS: Record<OperationalReportKind, string> = {
  "peak-hours": "Peak hours",
  classes: "Classes",
  retention: "Retention",
  renewals: "Renewals",
  collections: "Collections",
  crm: "CRM",
  controls: "Controls",
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const RANGED: Record<OperationalReportKind, boolean> = { "peak-hours": true, classes: true, retention: false, renewals: false, collections: true, crm: true, controls: true };

function downloadCsv(fileName: string, title: string, rows: string[][], metadata: CsvMetadataItem[] = []) {
  const [headers = [], ...dataRows] = rows;
  downloadTextFile({
    fileName,
    mimeType: "text/csv;charset=utf-8",
    content: buildCsvDocument({ title, metadata, headers, rows: dataRows }),
  });
}

/** Read-only analytics views under Reports. All math happens on the server. */
export function OperationalReports({ view }: { view: OperationalReportKind }) {
  const { session } = useApp();
  // Preselect the safe context: the actor's active branch when one is chosen.
  const [branchId, setBranchId] = useState<string>(session?.activeBranchId ?? "all");
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const [to, setTo] = useState(todayISODate());
  const from = addDays(to, -(rangeDays - 1));
  const branchInput = branchId === "all" ? undefined : branchId;
  const params = { branchId: branchInput, from, to };

  const peakQuery = useApiQuery(qk.analytics("peak-hours", params), (api) => api.getPeakHoursReport({ branchId: branchInput, from, to }), { enabled: view === "peak-hours" });
  const classesQuery = useApiQuery(qk.analytics("classes", params), (api) => api.getClassUtilizationReport({ branchId: branchInput, from, to }), { enabled: view === "classes" });
  const retentionQuery = useApiQuery(qk.analytics("retention", { branchId: branchInput }), (api) => api.getRetentionReport({ branchId: branchInput }), { enabled: view === "retention" });
  const renewalsQuery = useApiQuery(qk.analytics("renewals", { branchId: branchInput }), (api) => api.getRenewalForecastReport({ branchId: branchInput }), { enabled: view === "renewals" });
  const collectionsQuery = useApiQuery(qk.analytics("collections", params), (api) => api.getCollectionsReport({ branchId: branchInput, from, to }), { enabled: view === "collections" });
  const crmQuery = useApiQuery(qk.analytics("crm", params), (api) => api.getCrmFunnelReport({ branchId: branchInput, from, to }), { enabled: view === "crm" });
  const controlsQuery = useApiQuery(qk.analytics("controls", params), (api) => api.getControlTrendsReport({ branchId: branchInput, from, to }), { enabled: view === "controls" });

  const active = { "peak-hours": peakQuery, classes: classesQuery, retention: retentionQuery, renewals: renewalsQuery, collections: collectionsQuery, crm: crmQuery, controls: controlsQuery }[view];

  return (
    <div className="space-y-4">
      <section className="panel flex flex-wrap items-end gap-3 p-4">
        {session && session.branches.length > 1 ? (
          <label className="grid gap-1 text-[11px] text-ink-3">Branch
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger sizeVariant="sm" className="w-44" aria-label="Branch filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All my branches</SelectItem>
                {session.branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
        ) : null}
        {RANGED[view] ? (
          <>
            <div className="flex gap-1.5">
              {([7, 30, 90] as const).map((value) => <Button key={value} size="sm" variant={rangeDays === value ? "primary" : "secondary"} onClick={() => setRangeDays(value)}>{value} days</Button>)}
            </div>
            <label className="grid gap-1 text-[11px] text-ink-3">End date<Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-9 w-40" /></label>
            <p className="text-[11px] text-ink-3">{formatDate(from)} — {formatDate(to)} · gym local time</p>
          </>
        ) : null}
        <Button variant="ghost" size="sm" className="ms-auto" onClick={() => void active.refetch()}><RefreshCw /> Refresh</Button>
      </section>

      {active.isLoading ? <Skeleton className="h-72 w-full" /> : null}
      {active.error ? <ErrorState onRetry={() => void active.refetch()} /> : null}

      {!active.isLoading && !active.error ? (
        view === "peak-hours" && peakQuery.data ? <PeakHoursView report={peakQuery.data} from={from} to={to} />
        : view === "classes" && classesQuery.data ? <ClassesView report={classesQuery.data} from={from} to={to} />
        : view === "retention" && retentionQuery.data ? <RetentionView report={retentionQuery.data} />
        : view === "renewals" && renewalsQuery.data ? <RenewalsView report={renewalsQuery.data} currency={session?.organization.currency ?? "JOD"} />
        : view === "collections" && collectionsQuery.data ? <CollectionsView report={collectionsQuery.data} from={from} to={to} currency={session?.organization.currency ?? "JOD"} />
        : view === "crm" && crmQuery.data ? <CrmView report={crmQuery.data} from={from} to={to} />
        : view === "controls" && controlsQuery.data ? <ControlsView report={controlsQuery.data} from={from} to={to} currency={session?.organization.currency ?? "JOD"} />
        : null
      ) : null}
    </div>
  );
}

// --- Classes ---------------------------------------------------------------

function ClassesView({ report, from, to }: { report: ClassUtilizationReport; from: string; to: string }) {
  const percent = (value?: number) => value === undefined ? "—" : `${Math.round(value * 100)}%`;
  const exportCsv = () => downloadCsv(`rivet-class-utilization-${from}-${to}.csv`, "Class utilization", [
    ["Class", "Occurrences", "Completed", "Class cancellations", "Capacity", "Confirmed bookings", "Fill rate", "Attended", "No-shows", "Attendance rate", "Waitlist demand", "Booking cancellations"],
    ...report.rows.map((row) => [row.className, String(row.occurrences), String(row.completedOccurrences), String(row.cancelledOccurrences), String(row.capacity), String(row.booked), percent(row.fillRate), String(row.attended), String(row.noShows), percent(row.attendanceRate), String(row.waitlisted), String(row.cancelled)]),
  ], [{ label: "Date range", value: `${from} to ${to} (gym-local dates)` }]);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title="Class utilization"
        definition="Dated class capacity and saved roster outcomes in the selected period. Fill rate is confirmed seats divided by offered capacity; cancelled classes are excluded. Attendance rate uses only finalized attended/no-show outcomes. Waitlist demand includes members promoted from a waitlist."
        onExport={exportCsv}
        exportDisabled={report.rows.length === 0}
      />
      {report.rows.length === 0 ? (
        <EmptyState icon={FileBarChart} title="No dated classes in this period" description="Class utilization appears after the weekly timetable produces dated occurrences." />
      ) : (
        <>
          <div className="grid grid-cols-2 divide-line border-b border-line sm:grid-cols-3 xl:grid-cols-6">
            <StatCell label="Occurrences">{report.totals.occurrences}</StatCell>
            <StatCell label="Fill rate">{percent(report.totals.fillRate)}</StatCell>
            <StatCell label="Attendance">{percent(report.totals.attendanceRate)}</StatCell>
            <StatCell label="Waitlist demand">{report.totals.waitlisted}</StatCell>
            <StatCell label="No-shows" tone={report.totals.noShows > 0 ? "warning" : undefined}>{report.totals.noShows}</StatCell>
            <StatCell label="Cancelled classes" tone={report.totals.cancelledOccurrences > 0 ? "warning" : undefined}>{report.totals.cancelledOccurrences}</StatCell>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Class</TableHead><TableHead className="text-end">Dates</TableHead><TableHead className="text-end">Booked / capacity</TableHead><TableHead className="text-end">Fill</TableHead><TableHead className="text-end">Attended</TableHead><TableHead className="text-end">No-shows</TableHead><TableHead className="text-end">Waitlist</TableHead><TableHead className="text-end">Cancellations</TableHead></TableRow></TableHeader>
              <TableBody>{report.rows.map((row) => <TableRow key={`${row.templateId}:${row.className}`}>
                <TableCell><p className="font-medium">{row.className}</p>{row.cancelledOccurrences ? <p className="mt-0.5 text-[10.5px] text-warning-deep">{row.cancelledOccurrences} class cancellation{row.cancelledOccurrences === 1 ? "" : "s"}</p> : null}</TableCell>
                <TableCell className="text-end tabular">{row.occurrences}</TableCell>
                <TableCell className="text-end tabular">{row.booked} / {row.capacity}</TableCell>
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
        <p className="mt-1 max-w-3xl text-[11.5px] leading-4 text-ink-3">{definition}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onExport} disabled={exportDisabled}><Download /> CSV</Button>
    </header>
  );
}

function StatCell({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "warning" }) {
  return <div className="border-e border-line px-4 py-3.5 last:border-e-0"><p className="eyebrow">{label}</p><div className={cn("mt-1 text-[20px] tabular", tone === "warning" && "text-warning-deep")}>{children}</div></div>;
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
    ["Weekday", "Hour", "Accepted check-ins"],
    ...report.cells.map((cell) => [WEEKDAYS[cell.weekday]!, `${String(cell.hour).padStart(2, "0")}:00`, String(cell.count)]),
  ], [{ label: "Date range", value: `${from} to ${to} (gym-local dates)` }]);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title="Peak hours"
        definition="Accepted check-ins by gym-local weekday and hour. Blocked entries are excluded; manual overrides that admitted the member count."
        onExport={exportCsv}
        exportDisabled={report.cells.length === 0}
      />
      {report.cells.length === 0 ? (
        <EmptyState icon={FileBarChart} title="No accepted check-ins in this period" description="Pick a longer period or another branch." />
      ) : (
        <div className="space-y-4 p-4">
          <p className="text-[12.5px] text-ink-2">{report.admittedTotal} accepted check-ins{report.excludedTotal > 0 ? ` · ${report.excludedTotal} blocked entries excluded` : ""}{report.busiest ? ` · busiest: ${WEEKDAYS[report.busiest.weekday]} ${String(report.busiest.hour).padStart(2, "0")}:00` : ""}.</p>
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="grid" style={{ gridTemplateColumns: `88px repeat(${hours.length}, 1fr)` }} aria-hidden>
                <div />
                {hours.map((hour) => <div key={hour} className="pb-1 text-center font-mono text-[9px] text-ink-3">{String(hour).padStart(2, "0")}</div>)}
                {WEEKDAYS.map((label, weekday) => (
                  <div key={label} className="contents">
                    <div className="pe-2 py-0.5 text-[11px] text-ink-2">{label}</div>
                    {hours.map((hour) => {
                      const count = byCell.get(`${weekday}:${hour}`) ?? 0;
                      return <div key={hour} className="m-px flex h-7 items-center justify-center rounded-sm text-[10px] font-medium" style={{ backgroundColor: count > 0 ? `color-mix(in oklab, var(--tenant-brand-primary) ${Math.max(12, Math.round((count / max) * 100))}%, transparent)` : "var(--color-sunken)", color: count > 0 && count / max > 0.55 ? "var(--color-paper)" : undefined }}>{count > 0 ? count : ""}</div>;
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-[12px] text-ink-2">View as table</summary>
            <div className="mt-2 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Weekday</TableHead><TableHead>Hour</TableHead><TableHead className="text-end">Accepted check-ins</TableHead></TableRow></TableHeader>
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
    checkpoint.eligible === 0 ? <span className="text-ink-4">too new</span> : <span className="tabular">{Math.round((checkpoint.retained / checkpoint.eligible) * 100)}% <span className="text-[10.5px] text-ink-3">({checkpoint.retained}/{checkpoint.eligible})</span></span>;
  const exportCsv = () => downloadCsv("rivet-retention-cohorts.csv", "Retention cohorts", [
    ["Cohort month", "Members", "1 month retained", "1 month eligible", "3 months retained", "3 months eligible", "6 months retained", "6 months eligible", "12 months retained", "12 months eligible"],
    ...report.cohorts.map((cohort) => [cohort.cohortMonth, String(cohort.size), String(cohort.months1.retained), String(cohort.months1.eligible), String(cohort.months3.retained), String(cohort.months3.eligible), String(cohort.months6.retained), String(cohort.months6.eligible), String(cohort.months12.retained), String(cohort.months12.eligible)]),
  ]);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title="Retention cohorts"
        definition="Members grouped by the month their first membership started. A member counts as retained at 1, 3, 6, and 12 months when a membership covers that exact date — frozen terms still count, a cancellation ends coverage at its shortened end date, and a gap at the checkpoint counts as lost even if the member later returns. Cohorts too young for a column stay out of its denominator."
        onExport={exportCsv}
        exportDisabled={report.cohorts.length === 0}
      />
      {report.cohorts.length === 0 ? (
        <EmptyState icon={FileBarChart} title="No membership history yet" description="Cohorts appear once members hold memberships." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Cohort</TableHead><TableHead className="text-end">Members</TableHead><TableHead className="text-end">1 month</TableHead><TableHead className="text-end">3 months</TableHead><TableHead className="text-end">6 months</TableHead><TableHead className="text-end">12 months</TableHead></TableRow></TableHeader>
            <TableBody>
              {report.cohorts.map((cohort) => (
                <TableRow key={cohort.cohortMonth}>
                  <TableCell className="font-mono text-[12px]">{cohort.cohortMonth}</TableCell>
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
  const exportCsv = () => downloadCsv("rivet-renewal-forecast.csv", "Renewal forecast", [
    ["Window", "Member", "Plan", "Membership ends", "Expected value", "Currency"],
    ...report.buckets.flatMap((bucket) => bucket.rows.map((row) => [bucket.label, row.memberName, row.planName, row.endDate, formatMinorUnits(row.valueMinor, currency), currency])),
  ]);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title="Renewal forecast"
        definition="Memberships ending within 30 days that do not already have a later term. Buckets are mutually exclusive, so each membership is counted once. Value uses the expiring term's plan price."
        onExport={exportCsv}
        exportDisabled={total === 0}
      />
      {total === 0 ? (
        <EmptyState icon={FileBarChart} title="Nothing expires in the next 30 days" description="Every current membership already runs past this window or has a renewal on file." />
      ) : (
        <div className="space-y-4 p-4">
          <div className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
            {report.buckets.map((bucket) => (
              <div key={bucket.label} className="bg-surface px-4 py-3.5">
                <p className="eyebrow">{bucket.label}</p>
                <p className="mt-1 text-[20px] tabular">{bucket.count}</p>
                <p className="text-[11.5px] text-ink-3"><MoneyText money={money(bucket.valueMinor)} /> expected</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Member</TableHead><TableHead>Plan</TableHead><TableHead>Ends</TableHead><TableHead>Due in</TableHead><TableHead className="text-end">Value</TableHead></TableRow></TableHeader>
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
  const exportCsv = () => downloadCsv(`rivet-collections-${from}-${to}.csv`, "Collection efficiency", [
    ["Metric", "Count", "Amount", "Currency"],
    ["Charged in period", String(report.chargedCount), formatMinorUnits(report.chargedMinor, currency), currency],
    ["Collected in period", String(report.collectedCount), formatMinorUnits(report.collectedMinor, currency), currency],
    ["Refunded in period", String(report.refundedCount), formatMinorUnits(report.refundedMinor, currency), currency],
    ["Voided in period", String(report.voidedCount), formatMinorUnits(report.voidedMinor, currency), currency],
    ["Outstanding now (all time)", "", formatMinorUnits(report.outstandingNowMinor, currency), currency],
  ], [{ label: "Date range", value: `${from} to ${to} (gym-local dates)` }]);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title="Collection efficiency"
        definition="Invoices issued and money collected inside the period, on gym-local dates. Voided payments never count as collected; refunds are shown separately. Outstanding is today's open balance across all time — not a period figure."
        onExport={exportCsv}
      />
      <div className="grid grid-cols-2 divide-line sm:grid-cols-3 xl:grid-cols-5">
        <StatCell label="Charged"><MoneyText money={money(report.chargedMinor)} compact /></StatCell>
        <StatCell label="Collected"><MoneyText money={money(report.collectedMinor)} compact /></StatCell>
        <StatCell label="Refunds" tone={report.refundedMinor > 0 ? "warning" : undefined}><MoneyText money={money(report.refundedMinor)} compact /></StatCell>
        <StatCell label="Voided" tone={report.voidedMinor > 0 ? "warning" : undefined}><MoneyText money={money(report.voidedMinor)} compact /></StatCell>
        <StatCell label="Outstanding now" tone={report.outstandingNowMinor > 0 ? "warning" : undefined}><MoneyText money={money(report.outstandingNowMinor)} compact /></StatCell>
      </div>
      <p className="border-t border-line px-4 py-3 text-[12px] text-ink-3">{report.chargedCount} invoice{report.chargedCount === 1 ? "" : "s"} issued · {report.collectedCount} payment{report.collectedCount === 1 ? "" : "s"} collected · {report.refundedCount} refund{report.refundedCount === 1 ? "" : "s"} · {report.voidedCount} void{report.voidedCount === 1 ? "" : "s"}.</p>
    </section>
  );
}

// --- CRM --------------------------------------------------------------------

function CrmView({ report, from, to }: { report: CrmFunnelReport; from: string; to: string }) {
  const exportCsv = () => downloadCsv(`rivet-crm-funnel-${from}-${to}.csv`, "CRM response and conversion", [
    ["Metric", "Value"],
    ["Leads created", String(report.leadsCreated)],
    ["Leads with a recorded contact", String(report.leadsContacted)],
    ["Median first response (hours)", report.medianFirstResponseHours === undefined ? "—" : String(report.medianFirstResponseHours)],
    ["Trials requested", String(report.trialsBooked)],
    ["Trials attended", String(report.trialsAttended)],
    ["Memberships sold from these leads", String(report.membershipsSold)],
    ["Attended-trial to sale", report.trialToSaleRate === undefined ? "—" : `${Math.round(report.trialToSaleRate * 100)}%`],
  ], [{ label: "Date range", value: `${from} to ${to} (gym-local dates)` }]);
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title="CRM response and conversion"
        definition="Leads created in the period, whether a call attempt reached them, the median time to the first recorded attempt, trials requested in the period with their persisted outcome, and sales recorded on those same leads. Everything comes from saved CRM facts, not the current board column."
        onExport={exportCsv}
      />
      {report.leadsCreated === 0 && report.trialsBooked === 0 ? (
        <EmptyState icon={FileBarChart} title="No leads in this period" description="New leads and trials appear here as the sales team records them." />
      ) : (
        <div className="grid grid-cols-2 divide-line sm:grid-cols-4 xl:grid-cols-7">
          <StatCell label="Leads">{report.leadsCreated}</StatCell>
          <StatCell label="Contacted">{report.leadsContacted}</StatCell>
          <StatCell label="First response">{report.medianFirstResponseHours === undefined ? "—" : `${report.medianFirstResponseHours}h`}</StatCell>
          <StatCell label="Trials">{report.trialsBooked}</StatCell>
          <StatCell label="Attended">{report.trialsAttended}</StatCell>
          <StatCell label="Sold">{report.membershipsSold}</StatCell>
          <StatCell label="Trial → sale">{report.trialToSaleRate === undefined ? "—" : `${Math.round(report.trialToSaleRate * 100)}%`}</StatCell>
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
      title: "Commercial controls",
      metadata: [{ label: "Date range", value: `${from} to ${to} (gym-local dates)` }],
      sections: [
        {
          title: "Summary",
          headers: ["Control", "Count", "Amount", "Currency"],
          rows: [
            ["Refunds", report.refunds.count, formatMinorUnits(report.refunds.amountMinor, currency), currency],
            ["Voids", report.voids.count, formatMinorUnits(report.voids.amountMinor, currency), currency],
            ["Discounted invoices", report.discounts.count, formatMinorUnits(report.discounts.amountMinor, currency), currency],
            ["Price overrides", report.priceOverrides.count, formatMinorUnits(report.priceOverrides.amountMinor, currency), currency],
            ["Staff overrides", report.staffOverrides.count, "", ""],
          ],
        },
        {
          title: "Recent audit evidence",
          headers: ["When", "Action", "Summary", "Recorded by", "Reason"],
          rows: report.recent.map((event) => [event.occurredAt, event.action.replaceAll("_", " "), event.summary, event.actorName, event.reason ?? ""]),
          emptyMessage: "No sensitive commercial actions in this period.",
        },
      ],
    }),
  });
  return (
    <section className="panel overflow-hidden">
      <ReportHeader
        title="Commercial controls"
        definition="Refunds, voids, discounts, and staff overrides recorded in the period. Money comes from the payment and invoice facts; each row links to the audit trail for full before/after evidence."
        onExport={exportCsv}
      />
      <div className="grid grid-cols-2 divide-line sm:grid-cols-5">
        <StatCell label="Refunds" tone={report.refunds.count > 0 ? "warning" : undefined}><MoneyText money={money(report.refunds.amountMinor)} compact /></StatCell>
        <StatCell label="Voids" tone={report.voids.count > 0 ? "warning" : undefined}><MoneyText money={money(report.voids.amountMinor)} compact /></StatCell>
        <StatCell label="Discounts"><MoneyText money={money(report.discounts.amountMinor)} compact /></StatCell>
        <StatCell label="Price overrides"><MoneyText money={money(report.priceOverrides.amountMinor)} compact /></StatCell>
        <StatCell label="Staff overrides">{report.staffOverrides.count}</StatCell>
      </div>
      {report.recent.length === 0 ? (
        <p className="border-t border-line p-5 text-[13px] text-ink-3">No sensitive commercial actions in this period.</p>
      ) : (
        <div className="overflow-x-auto border-t border-line">
          <Table>
            <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Action</TableHead><TableHead>Summary</TableHead><TableHead>By</TableHead><TableHead>Evidence</TableHead></TableRow></TableHeader>
            <TableBody>
              {report.recent.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="whitespace-nowrap text-[11.5px]">{formatDate(event.occurredAt)}</TableCell>
                  <TableCell className="font-mono text-[11px]">{event.action}</TableCell>
                  <TableCell className="max-w-72 truncate text-[12px]" title={event.summary}>{event.summary}</TableCell>
                  <TableCell className="text-[12px]">{event.actorName}</TableCell>
                  <TableCell><Link href="/audit" className="text-[12px] underline decoration-line-3 underline-offset-2 hover:text-ink">Audit log</Link></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
