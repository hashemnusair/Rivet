"use client";

import type { DashboardData } from "@/lib/domain/types";
import { useFormat } from "@/lib/i18n/format";
import { leadStageName } from "@/lib/i18n/labels";
import { useLocale } from "@/lib/i18n/provider";
import { MoneyText } from "@/components/shared/data-display";

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
