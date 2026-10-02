"use client";
import { useT } from "@/lib/i18n/provider";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/api/keys";
import type { ChecklistDay, HandoverItem } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { cn } from "@/lib/utils/cn";
import { useFormat } from "@/lib/i18n/format";
import { roleLabel } from "@/lib/i18n/labels";
import { isolate } from "@/lib/i18n/bidi";
import { HANDOVER_WINDOW_DAYS, handoverGroups, handoverItems, type HandoverGroupKind } from "../../../convex/branchOpsAssist";

function ItemRow({ item }: { item: HandoverItem }) {
  const t = useT();
  const f = useFormat();
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-1.5" data-testid="handover-item" data-item-key={item.key}>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-ink">{item.label}</span>
        <span className="block text-[12px] text-ink-3">{item.runName} · {f.date(item.localDate)} · {roleLabel(t, item.responsible)}{item.reason ? ` · ${item.reason}` : ""}</span>
      </span>
      <span className="flex shrink-0 flex-wrap gap-1">
        <Badge variant={item.status === "failed" ? "danger" : "warning"}>{item.status === "failed" ? t("salesWorkspace.failed") : t("salesWorkspace.notDone")}</Badge>
        {item.overdue ? <Badge variant="outline">{t("dashboard.owner.overdueCol")}</Badge> : null}
        {item.facilityTaskId ? <Badge variant="outline">{t("salesWorkspace.jobAdded")}</Badge> : null}
      </span>
    </li>
  );
}

/**
 * Unresolved checklist work in the handover window, grouped by record
 * relationships (the same item on several days, the same linked task, the
 * same gym space) with an ungrouped view one click away. Similar wording is
 * shown as a review prompt; the records remain separate until staff choose an
 * existing manual action.
 */
export function HandoverGroupsView({ branchId, day }: { branchId: string; day: ChecklistDay }) {
  const t = useT();
  const f = useFormat();
  const groupBadges: Record<HandoverGroupKind, string> = { recurring: t("salesWorkspace.keepsHappening"), task: t("salesWorkspace.sameJob"), space: t("salesWorkspace.sameArea") };
  const groupReasons: Record<HandoverGroupKind, string> = { recurring: t("salesWorkspace.recurringReason"), task: t("salesWorkspace.taskReason"), space: t("salesWorkspace.spaceReason") };
  const zones = useApiQuery(qk.operations({ kind: "equipment-zones", branchId }), (api) => api.listZones({ branchId, includeArchived: false }), { retry: false, staleTime: 5 * 60_000 });
  const spaces = useMemo(() => new Map((zones.data ?? []).map((zone) => [zone.id, zone.name] as const)), [zones.data]);
  const items = useMemo(() => handoverItems([...(day.carryover ?? []), ...day.runs]), [day]);
  const grouping = useMemo(() => handoverGroups(items, spaces), [items, spaces]);
  const [mode, setMode] = useState<"grouped" | "all">(() => (grouping.groups.length ? "grouped" : "all"));
  if (!items.length) return null;
  const failed = items.filter((item) => item.status === "failed").length;
  return (
    <section className="rounded-md border border-line p-3" aria-label={t("salesWorkspace.unfinishedItems")} data-testid="checklist-handover">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("salesWorkspace.unfinishedItems")}</p>
          <p className="mt-0.5 text-xs text-ink-3" data-testid="handover-summary">{t("salesWorkspace.handoverSummary", { items: t("salesWorkspace.handoverCount", { count: items.length }), failed, days: HANDOVER_WINDOW_DAYS })}</p>
        </div>
        <div className="flex gap-1" role="group" aria-label={t("salesWorkspace.showItems")}>
          <Button type="button" size="xs" variant={mode === "grouped" ? "primary" : "secondary"} aria-pressed={mode === "grouped"} onClick={() => setMode("grouped")}>{t("palette.notifications.viewGrouped")}</Button>
          <Button type="button" size="xs" variant={mode === "all" ? "primary" : "secondary"} aria-pressed={mode === "all"} onClick={() => setMode("all")}>{t("salesWorkspace.allItems")}</Button>
        </div>
      </div>
      {mode === "all" ? (
        <ul className="mt-2 divide-y divide-line" data-testid="handover-all">{items.map((item) => <ItemRow key={item.key} item={item} />)}</ul>
      ) : (
        <div className="mt-2 space-y-3" data-testid="handover-grouped">
          {grouping.groups.map((group) => (
            <div key={group.id} className={cn("rounded-md border border-line px-3 py-2", group.kind === "recurring" && "border-warning/50 bg-warning-bg/20")} data-testid="handover-group" data-group-kind={group.kind}>
              <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium"><Badge variant={group.kind === "recurring" ? "warning" : "outline"}>{groupBadges[group.kind]}</Badge>{group.kind === "task" ? null : group.label}<span className="text-[12px] font-normal text-ink-3">· {t("salesWorkspace.groupCount", { count: group.items.length })}</span></p>
              <p className="mt-0.5 text-[12px] text-ink-3">{groupReasons[group.kind]}</p>
              <ul className="mt-1 divide-y divide-line">{group.items.map((item) => <ItemRow key={item.key} item={item} />)}</ul>
            </div>
          ))}
          {grouping.ungrouped.length ? <div data-testid="handover-ungrouped"><p className="text-[12px] text-ink-3">{grouping.groups.length ? t("salesWorkspace.otherItems") : t("salesWorkspace.allItems")}</p><ul className="divide-y divide-line">{grouping.ungrouped.map((item) => <ItemRow key={item.key} item={item} />)}</ul></div> : null}
        </div>
      )}
      {grouping.comparisons.length ? (
        <div className="mt-3 space-y-2 border-t border-line pt-3" data-testid="handover-comparisons">
          <p className="text-[12px] text-ink-3">{t("salesWorkspace.compareHint")}</p>
          {grouping.comparisons.map((comparison) => (
            <div key={`${comparison.first.key}+${comparison.second.key}`} className="rounded-md border border-dashed border-line-2 p-2" data-testid="handover-comparison">
              <p className="text-[12.5px] text-ink-2">{t("salesWorkspace.compareItems", { first: isolate(comparison.first.label), firstDate: isolate(f.date(comparison.first.localDate)), second: isolate(comparison.second.label), secondDate: isolate(f.date(comparison.second.localDate)) })}</p>
              <p className="mt-1 text-[12px] text-ink-3">{t("salesWorkspace.sharedWords", { count: comparison.sharedTokens })}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
