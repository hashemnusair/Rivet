"use client";

import { useMemo } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { DashboardData } from "@/lib/domain/types";
import { useFormat } from "@/lib/i18n/format";
import { leadStageName } from "@/lib/i18n/labels";
import { useLocale } from "@/lib/i18n/provider";
import { exponentFor, money } from "@/lib/utils/money";
import { MoneyText } from "@/components/shared/data-display";

/**
 * Revenue over the last 30 days. Answers: "is collection trending up or down,
 * and which days were unusually strong/weak?" Today is marked in signal red.
 */
export function RevenueChart({ data, currency = "JOD" }: { data: DashboardData["revenueSeries"]; currency?: string }) {
  const { t, dir, locale, isolateLtr } = useLocale();
  const format = useFormat();
  const rtl = dir === "rtl";
  // Bars are drawn in major units of the gym's currency; totals stay in minor units.
  const scale = 10 ** exponentFor(currency);
  const chartData = useMemo(
    () =>
      data.map((p) => ({
        date: p.date,
        label: format.dateShort(p.date),
        collected: p.collected / scale,
        refunds: p.refunds / scale,
      })),
    [data, scale, format],
  );
  const today = chartData[chartData.length - 1]?.date;
  const total = data.reduce((s, p) => s + p.collected, 0);
  const avg = data.length ? Math.round(total / data.length) : 0;

  return (
    <div role="img" aria-label={t("deskCompletion.dashboard.charts.revenueAria")}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <p className="context-label">{t("dashboard.chart.collectedLast30")}</p>
          <p className="mt-1 text-[22px] font-medium tabular">
            <MoneyText money={money(total, currency)} compact />
            <span className="ms-2 text-[12px] text-ink-3">
              {t("dashboard.chart.averagePrefix")} <MoneyText money={money(avg, currency)} className="text-ink-3" /> {t("dashboard.chart.averageSuffix")}
            </span>
          </p>
        </div>
      </div>
      {/* The plot stays left-to-right so Recharts' geometry is right; in RTL the axis is reversed so the newest day sits on the left, as a right-to-left reader expects. Numbers stay left-to-right. */}
      <div className="h-[180px]" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="28%">
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "#e3e1d6" }}
              tick={{ fontSize: 10, fill: "#8b887b", fontFamily: locale === "ar" ? "inherit" : "var(--font-plex-mono)" }}
              interval={locale === "ar" ? 9 : 6}
              reversed={rtl}
            />
            <Tooltip
              cursor={{ fill: "rgba(27,26,21,0.05)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]!.payload as { label: string; collected: number; refunds: number };
                return (
                  <div dir={dir} className="rounded-md border border-line bg-surface px-3 py-2 text-start text-[12px] shadow-pop">
                    <p className="context-label">{p.label}</p>
                    <p className="mt-1 tabular">{format.money(money(Math.round(p.collected * scale), currency))}</p>
                    {p.refunds > 0 ? (
                      <p className="tabular text-danger">{t("dashboard.chart.refunded", { amount: isolateLtr("−" + format.money(money(Math.round(p.refunds * scale), currency))) })}</p>
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
  const { t } = useLocale();
  const max = Math.max(...data.map((b) => b.collected.amount), 1);
  return (
    <div className="space-y-4">
      {data.map((b) => (
        <div key={b.branchId}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[13px] font-medium"><bdi>{b.branchName}</bdi></p>
            <MoneyText money={b.collected} className="text-[13.5px]" />
          </div>
          <div className="mt-1.5 h-2 w-full rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-ink"
              style={{ width: `${Math.max(2, (b.collected.amount / max) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[12px] text-ink-3 tabular">
            {t("dashboard.chart.activeMembers", { count: b.activeMembers })} · {t("dashboard.chart.checkInsToday", { count: b.checkInsToday })}
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
  const { t, locale } = useLocale();
  const format = useFormat();
  const pipeline = data.filter((s) => s.stage !== "lost");
  const max = Math.max(...pipeline.map((s) => s.count), 1);
  return (
    <div className="space-y-2" role="img" aria-label={t("deskCompletion.dashboard.charts.funnelAria")}>
      {pipeline.map((stage, i) => {
        const prev = i > 0 ? pipeline[i - 1] : undefined;
        const conv = prev && prev.count > 0 ? Math.round((stage.count / prev.count) * 100) : undefined;
        return (
          <div key={stage.stage} className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-[12px] text-ink-2">{locale === "en" ? stage.label : leadStageName(t, stage.stage)}</span>
            <div className="relative h-6 flex-1 rounded-sm bg-sunken/70">
              <div
                className="flex h-full items-center rounded-sm bg-ink ps-2 transition-[width] duration-200 ease-out"
                style={{ width: `${Math.max(stage.count > 0 ? 10 : 0, (stage.count / max) * 100)}%` }}
              >
                <span className="text-[12px] font-medium text-paper tabular">{format.number(stage.count)}</span>
              </div>
            </div>
            <span className="w-10 shrink-0 text-end text-[12px] text-ink-3 tabular">
              {conv !== undefined ? format.percent(conv) : ""}
            </span>
          </div>
        );
      })}
      <p className="pt-1 text-[12px] text-ink-3">
        {t("dashboard.chart.funnelNote")}
      </p>
    </div>
  );
}
