"use client";

import { useMemo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { DashboardData } from "@/lib/domain/types";
import { formatDateShort } from "@/lib/utils/dates";
import { formatMoney, money } from "@/lib/utils/money";
import { MoneyText } from "@/components/shared/data-display";

/**
 * Revenue over the last 30 days. Answers: "is collection trending up or down,
 * and which days were unusually strong/weak?" Today is marked in signal red.
 */
export function RevenueChart({ data }: { data: DashboardData["revenueSeries"] }) {
  const chartData = useMemo(
    () =>
      data.map((p) => ({
        date: p.date,
        label: formatDateShort(p.date),
        collected: p.collected / 1000,
        refunds: p.refunds / 1000,
      })),
    [data],
  );
  const today = chartData[chartData.length - 1]?.date;
  const total = data.reduce((s, p) => s + p.collected, 0);
  const avg = data.length ? Math.round(total / data.length) : 0;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <p className="eyebrow">Collected — last 30 days</p>
          <p className="mt-1 text-[22px] font-medium tabular">
            <MoneyText money={money(total)} compact />
            <span className="ms-2 text-[12px] text-ink-3">
              avg <MoneyText money={money(avg)} className="text-ink-3" /> / day
            </span>
          </p>
        </div>
      </div>
      <div className="h-[180px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="28%">
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "#e3e1d6" }}
              tick={{ fontSize: 10, fill: "#8b887b", fontFamily: "var(--font-plex-mono)" }}
              interval={6}
            />
            <Tooltip
              cursor={{ fill: "rgba(27,26,21,0.05)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as { label: string; collected: number; refunds: number };
                return (
                  <div className="rounded-md border border-line bg-surface px-3 py-2 text-[12px] shadow-pop">
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">{p.label}</p>
                    <p className="mt-1 tabular">{formatMoney(money(p.collected * 1000))}</p>
                    {p.refunds > 0 ? (
                      <p className="tabular text-danger">−{formatMoney(money(p.refunds * 1000))} refunded</p>
                    ) : null}
                  </div>
                );
              }}
            />
            <Bar dataKey="collected" radius={[2, 2, 0, 0]} maxBarSize={18}>
              {chartData.map((entry) => (
                <Cell key={entry.date} fill={entry.date === today ? "#d9232b" : "#1b1a15"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Branch comparison. Answers: "which branch carries the business this month?"
 */
export function BranchRevenueBars({ data }: { data: DashboardData["branchRevenue"] }) {
  const max = Math.max(...data.map((b) => b.collected.amount), 1);
  return (
    <div className="space-y-4">
      {data.map((b) => (
        <div key={b.branchId}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[13px] font-medium">{b.branchName}</p>
            <MoneyText money={b.collected} className="text-[13.5px]" />
          </div>
          <div className="mt-1.5 h-2 w-full rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-ink"
              style={{ width: `${Math.max(2, (b.collected.amount / max) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11.5px] text-ink-3 tabular">
            {b.activeMembers} active members · {b.checkInsToday} check-ins today
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Pipeline funnel. Answers: "where do leads stall between capture and won?"
 */
export function LeadFunnel({ data }: { data: DashboardData["funnel"] }) {
  const pipeline = data.filter((s) => s.stage !== "lost");
  const max = Math.max(...pipeline.map((s) => s.count), 1);
  return (
    <div className="space-y-2">
      {pipeline.map((stage, i) => {
        const prev = i > 0 ? pipeline[i - 1] : undefined;
        const conv = prev && prev.count > 0 ? Math.round((stage.count / prev.count) * 100) : undefined;
        return (
          <div key={stage.stage} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-[12px] text-ink-2">{stage.label}</span>
            <div className="relative h-6 flex-1 rounded-sm bg-sunken/70">
              <div
                className="flex h-full items-center rounded-sm bg-ink ps-2 transition-all"
                style={{ width: `${Math.max(stage.count > 0 ? 10 : 0, (stage.count / max) * 100)}%` }}
              >
                <span className="text-[11px] font-medium text-paper tabular">{stage.count}</span>
              </div>
            </div>
            <span className="w-10 shrink-0 text-end text-[11px] text-ink-3 tabular">
              {conv !== undefined ? `${conv}%` : ""}
            </span>
          </div>
        );
      })}
      <p className="pt-1 text-[11.5px] text-ink-3">
        Percentages are stage-to-stage of the current pipeline snapshot.
      </p>
    </div>
  );
}
