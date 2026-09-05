"use client";

import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";
import { addDays, formatDate, todayISODate } from "@/lib/utils/dates";

/**
 * One scope model for every owner report: a rolling window that ends on a
 * chosen day, and an optional branch. The scope lives in the URL so a report
 * can be shared, refreshed, and returned to without losing its question.
 */
export type ReportRangeDays = 7 | 30 | 90;
export const REPORT_RANGES: readonly ReportRangeDays[] = [7, 30, 90];

export type ReportScope = { rangeDays: ReportRangeDays; to: string; branchId: string };

type ParamSource = { get(name: string): string | null };
type ScopeBranch = { id: string; name: string };

export function validISODate(value: string | null | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : undefined;
}

export function parseReportRange(value: string | null | undefined, fallback: ReportRangeDays = 30): ReportRangeDays {
  const parsed = Number(value);
  return (REPORT_RANGES as readonly number[]).includes(parsed) ? (parsed as ReportRangeDays) : fallback;
}

/** Reads a scope from URL params, falling back to the actor's active branch. */
export function parseReportScope(params: ParamSource, options: { branches: readonly ScopeBranch[]; defaultBranchId?: string }): ReportScope {
  const requested = params.get("branchId");
  const known = (id: string | null | undefined) => Boolean(id) && options.branches.some((branch) => branch.id === id);
  const branchId = requested === "all" ? "all" : known(requested) ? (requested as string) : known(options.defaultBranchId) ? (options.defaultBranchId as string) : "all";
  return {
    rangeDays: parseReportRange(params.get("range")),
    to: validISODate(params.get("to")) ?? todayISODate(),
    branchId,
  };
}

/** Builds a report URL that only carries the parts that differ from the defaults. */
export function reportScopeHref(pathname: string, view: string, scope: ReportScope, options: { defaultBranchId?: string; defaultView?: string } = {}): string {
  const params = new URLSearchParams();
  const defaultView = options.defaultView ?? "overview";
  const defaultBranchId = options.defaultBranchId ?? "all";
  if (view !== defaultView) params.set("view", view);
  if (scope.rangeDays !== 30) params.set("range", String(scope.rangeDays));
  if (scope.to !== todayISODate()) params.set("to", scope.to);
  if (scope.branchId !== defaultBranchId) params.set("branchId", scope.branchId);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function reportScopeFrom(scope: ReportScope): string {
  return addDays(scope.to, -(scope.rangeDays - 1));
}

export function scopeBranchName(branches: readonly ScopeBranch[], branchId: string): string {
  return branchId === "all" ? "All accessible branches" : branches.find((branch) => branch.id === branchId)?.name ?? "Selected branch";
}

/**
 * Pressed-state pills for one-click scope presets. The group carries the
 * label; each pill announces its own pressed state.
 */
export function ScopePills<T extends string | number>({ label, value, items, onChange, className }: { label: string; value: T | undefined; items: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={String(item.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            data-touch-target
            className={cn(
              "inline-flex items-center rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink",
              active ? "border-ink bg-ink text-paper" : "border-line-2 text-ink-2 hover:border-ink-3 hover:text-ink",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** The one scope bar shared by the overview and every operational report. */
export function ReportScopeBar({
  branches,
  scope,
  onChange,
  ranged,
  onRefresh,
  refreshing,
  note,
}: {
  branches: readonly ScopeBranch[];
  scope: ReportScope;
  /** Receives only the changed part so quick successive edits never overwrite each other. */
  onChange: (patch: Partial<ReportScope>) => void;
  /** False for point-in-time reports (retention, renewals) that ignore the window. */
  ranged: boolean;
  onRefresh: () => void;
  refreshing?: boolean;
  note?: ReactNode;
}) {
  const from = reportScopeFrom(scope);
  return (
    <section className="panel flex flex-wrap items-end gap-3 p-4" aria-label="Report scope">
      {branches.length > 1 ? (
        <Field label="Branch" className="w-full sm:w-52">
          <Select value={scope.branchId} onValueChange={(branchId) => onChange({ branchId })}>
            <SelectTrigger aria-label="Branch filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accessible branches</SelectItem>
              {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {ranged ? (
        <>
          <Field label="Date range" className="w-auto">
            <ScopePills label="Date range" value={scope.rangeDays} items={REPORT_RANGES.map((days) => ({ value: days, label: `${days} days` }))} onChange={(rangeDays) => onChange({ rangeDays })} className="min-h-9 items-center" />
          </Field>
          <Field label="End date" className="w-full sm:w-44">
            <Input type="date" dir="ltr" value={scope.to} max={todayISODate()} onChange={(event) => { const to = validISODate(event.target.value); if (to) onChange({ to }); }} />
          </Field>
        </>
      ) : null}
      <Button variant="ghost" size="sm" className="ms-auto" onClick={onRefresh} disabled={refreshing}><RefreshCw className={refreshing ? "animate-spin" : undefined} /> Refresh</Button>
      <p className="basis-full text-[12px] text-ink-3" dir="auto">
        {ranged ? <><span dir="ltr">{formatDate(from)} – {formatDate(scope.to)}</span> · gym local time · </> : null}
        {scopeBranchName(branches, scope.branchId)}
        {note ? <> · {note}</> : null}
      </p>
    </section>
  );
}
