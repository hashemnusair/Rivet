"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useLocale } from "@/lib/i18n/provider";
import { useApp } from "@/lib/providers/app-providers";
import type { AttendanceInsights, AttendanceCell } from "@/lib/attendance/model";
import { OccupancyReading } from "./occupancy-widget";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function timeLabel(cell: AttendanceCell | null) { return cell ? `${DAYS[cell.weekday]} · ${String(cell.hour).padStart(2, "0")}:00–${String(cell.hour + 1).padStart(2, "0")}:00` : "Still learning"; }
const queryOptions = { refetchInterval: 15_000, staleTime: 0, refetchOnReconnect: "always" as const };

export function MemberAttendance({ membershipId, compact = false }: { membershipId: string; compact?: boolean }) {
  const query = useApiQuery(["attendance", "member", membershipId], api => api.getCustomerAttendance(membershipId), queryOptions);
  return <div className="space-y-4"><OccupancyReading data={query.data?.snapshot} loading={query.isLoading} failed={query.isError || query.isBackgroundError} />{!compact && query.data && !query.isError && !query.isBackgroundError ? <AttendanceCharts report={query.data} /> : null}</div>;
}

export function StaffAttendance({ branchId: selectedBranch, date }: { branchId?: string; date?: string }) {
  const { session } = useApp();
  const [choice, setChoice] = useState("");
  const branchId = selectedBranch ?? choice;
  const query = useApiQuery(["attendance", "staff", branchId, date], api => api.getAttendanceInsights(branchId, date), { ...queryOptions, enabled: Boolean(branchId) });
  return <div className="space-y-4">
    {!selectedBranch ? <label className="block text-[13px] font-medium">Attendance branch<select className="ms-3 min-h-11 rounded-md border border-line bg-surface px-3" value={choice} onChange={e => setChoice(e.target.value)}><option value="">Choose a branch</option>{session?.branches.map(b => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label> : null}
    {branchId ? <><OccupancyReading data={query.data?.snapshot} loading={query.isLoading} failed={query.isError || query.isBackgroundError} />{query.data && !query.isError && !query.isBackgroundError ? <AttendanceCharts report={query.data} staff /> : null}</> : <p className="text-[13px] text-ink-2">Choose one branch to see estimated occupancy in its local time.</p>}
  </div>;
}

export function AttendanceCharts({ report, staff = false }: { report: AttendanceInsights; staff?: boolean }) {
  const { dir } = useLocale();
  const max = Math.max(1, ...report.cells.map(c => c.average));
  const cells = new Map(report.cells.map(c => [`${c.weekday}:${c.hour}`, c]));
  return <section className="panel overflow-hidden" aria-label="Attendance insights">
    <header className="border-b border-line p-4"><h2 className="text-[15px] font-semibold">{staff ? "Attendance insights" : "Plan your visit"}</h2><p className="mt-1 text-[12px] text-ink-2">Estimated people inside · {report.snapshot.timezone}</p></header>
    <div className="space-y-5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[14px] font-semibold">Daily occupancy</h3><span className="text-[12px] text-ink-2">{report.date}{staff ? ` · ${report.entriesOnDate} distinct visits started` : ""}</span></div>
      {report.curve.length > 1 ? <div className="h-52 w-full" dir="ltr" aria-label="Estimated concurrent occupancy, sampled every 15 minutes">
        <ResponsiveContainer width="100%" height="100%"><AreaChart data={report.curve} margin={{ top: 10, right: 10, left: -18, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="var(--color-line)" /><XAxis reversed={dir === "rtl"} dataKey="label" minTickGap={40} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-line)", borderRadius: 6, fontSize: 12 }} formatter={(value) => [`~${value} people`, "Estimated occupancy"]} /><Area type="stepAfter" dataKey="occupancy" stroke="var(--color-ink)" fill="var(--color-sunken)" strokeWidth={2} isAnimationActive={false} />
        </AreaChart></ResponsiveContainer>
      </div> : <p className="py-6 text-[13px] text-ink-2">Not enough recorded attendance for a curve on this day.</p>}
      <details><summary className="min-h-11 cursor-pointer py-3 text-[12px] text-ink-2">View daily values as a table</summary><div className="max-h-64 overflow-auto"><table className="w-full text-start text-[12px]"><caption className="sr-only">Daily occupancy in branch local time</caption><thead><tr><th className="text-start">Time</th><th className="text-end">Estimated people</th>{staff ? <th className="text-end">Entries in preceding 15 min</th> : null}</tr></thead><tbody>{report.curve.map(p => <tr key={p.at} className="border-t border-line"><td className="py-2">{p.label}</td><td className="text-end tabular">{p.occupancy}</td>{staff ? <td className="text-end tabular">{p.entries}</td> : null}</tr>)}</tbody></table></div></details>
      <div className="border-t border-line pt-4"><h3 className="text-[14px] font-semibold">Usual rhythm</h3><p className="mt-1 text-[12px] text-ink-2">Average concurrent occupancy over the last 28 days. Darker means more people.</p></div>
      {!report.enoughHistory ? <p className="rounded-md bg-sunken p-4 text-[13px] text-ink-2">Still learning this branch’s rhythm. Suggestions need at least 7 complete days and 20 recorded visits.</p> : <>
        <div className="overflow-x-auto rounded-sm" tabIndex={0} role="region" aria-label="Day and hour occupancy heatmap. Scroll horizontally to see all hours.">
          <table className="w-full min-w-[760px] border-separate border-spacing-1 text-[12px]"><caption className="sr-only">Average people inside by day and hour; dash means insufficient observations</caption><thead><tr><th className="text-start">Day</th>{Array.from({ length: 24 }, (_, hour) => <th key={hour} scope="col" className="font-normal text-ink-2">{String(hour).padStart(2, "0")}</th>)}</tr></thead><tbody>{DAYS.map((day, weekday) => <tr key={day}><th scope="row" className="pe-2 text-start font-normal">{day.slice(0, 3)}</th>{Array.from({ length: 24 }, (_, hour) => { const cell = cells.get(`${weekday}:${hour}`); const value = cell?.average; const intensity = value === undefined ? 0 : value / max; return <td key={hour} aria-label={`${day} ${hour}:00 · ${value === undefined ? "No observations" : `approximately ${value} people averaged over ${cell?.days} observed days`}`} title={`${day} ${hour}:00 · ${value === undefined ? "No observations" : `~${value} people, ${cell?.days} observed days`}`} className="h-8 min-w-6 rounded-xs text-center tabular" style={{ background: value === undefined ? "transparent" : `color-mix(in srgb, var(--color-ink) ${Math.max(5, intensity * 85)}%, var(--color-surface))`, color: intensity > 0.5 ? "var(--color-surface)" : "var(--color-ink-2)" }}>{value === undefined ? "—" : Math.round(value)}</td>; })}</tr>)}</tbody></table>
        </div>
        <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2"><div><p className="text-[12px] text-ink-2">Typically busiest</p><p className="mt-1 text-[14px] font-semibold">{timeLabel(report.peak)}</p></div><div><p className="text-[12px] text-ink-2">A quieter time to try</p><p className="mt-1 text-[14px] font-semibold">{timeLabel(report.quiet)}</p></div></div>
        <p className="text-[12px] text-ink-2">Suggestions use hours with recorded entries and at least two observed days. Check the gym’s opening hours before travelling.</p>
      </>}
      {staff ? <p className="border-t border-line pt-4 text-[12px] text-ink-2">Entry volume counts arrivals. Occupancy estimates how many people are inside together. Repeated scans within a presence window count as one visit; a recorded exit allows re-entry.</p> : null}
    </div>
  </section>;
}
