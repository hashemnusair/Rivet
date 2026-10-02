"use client";
import { useT } from "@/lib/i18n/provider";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/api/keys";
import type { ChecklistDay, HandoverItem } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/dates";
import { HANDOVER_WINDOW_DAYS, handoverGroups, handoverItems, type HandoverGroupKind } from "../../../convex/branchOpsAssist";

/** Checklist roles are stored as codes; people read the role name. */
const ROLE_NAMES: Record<string, string> = { owner: "Owner", manager: "Manager", sales: "Sales", receptionist: "Reception", trainer: "Trainer" };

const GROUP_BADGES: Record<HandoverGroupKind, string> = { recurring: "Keeps happening", task: "Same maintenance job", space: "Same area" };

const GROUP_REASONS: Record<HandoverGroupKind, string> = {
  recurring: "The same checklist item, still open on more than one day.",
  task: "These items were sent to one maintenance job.",
  space: "These items are in the same area. They can still be different problems.",
};

function ItemRow({ item }: { item: HandoverItem }) {
  const t = useT();
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-1.5" data-testid="handover-item" data-item-key={item.key}>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-ink">{item.label}</span>
        <span className="block text-[12px] text-ink-3">{item.runName} · {formatDate(item.localDate)} · {ROLE_NAMES[item.responsible] ?? item.responsible}{item.reason ? ` · ${item.reason}` : ""}</span>
      </span>
      <span className="flex shrink-0 flex-wrap gap-1">
        <Badge variant={item.status === "failed" ? "danger" : "warning"}>{item.status === "failed" ? "Failed" : "Not done"}</Badge>
        {item.overdue ? <Badge variant="outline">{t("dashboard.owner.overdueCol")}</Badge> : null}
        {item.facilityTaskId ? <Badge variant="outline">Maintenance job added</Badge> : null}
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
  const zones = useApiQuery(qk.operations({ kind: "equipment-zones", branchId }), (api) => api.listZones({ branchId, includeArchived: false }), { retry: false, staleTime: 5 * 60_000 });
  const spaces = useMemo(() => new Map((zones.data ?? []).map((zone) => [zone.id, zone.name] as const)), [zones.data]);
  const items = useMemo(() => handoverItems([...(day.carryover ?? []), ...day.runs]), [day]);
  const grouping = useMemo(() => handoverGroups(items, spaces), [items, spaces]);
  const [mode, setMode] = useState<"grouped" | "all">(() => (grouping.groups.length ? "grouped" : "all"));
  if (!items.length) return null;
  const failed = items.filter((item) => item.status === "failed").length;
  return (
    <section className="rounded-md border border-line p-3" aria-label="Unfinished checklist items" data-testid="checklist-handover">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Unfinished checklist items</p>
          <p className="mt-0.5 text-xs text-ink-3" data-testid="handover-summary">{items.length} {items.length === 1 ? "item needs" : "items need"} attention ({failed} failed). From today and the last {HANDOVER_WINDOW_DAYS} days.</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="How to show items">
          <Button type="button" size="xs" variant={mode === "grouped" ? "primary" : "secondary"} aria-pressed={mode === "grouped"} onClick={() => setMode("grouped")}>{t("palette.notifications.viewGrouped")}</Button>
          <Button type="button" size="xs" variant={mode === "all" ? "primary" : "secondary"} aria-pressed={mode === "all"} onClick={() => setMode("all")}>All items</Button>
        </div>
      </div>
      {mode === "all" ? (
        <ul className="mt-2 divide-y divide-line" data-testid="handover-all">{items.map((item) => <ItemRow key={item.key} item={item} />)}</ul>
      ) : (
        <div className="mt-2 space-y-3" data-testid="handover-grouped">
          {grouping.groups.map((group) => (
            <div key={group.id} className={cn("rounded-md border border-line px-3 py-2", group.kind === "recurring" && "border-warning/50 bg-warning-bg/20")} data-testid="handover-group" data-group-kind={group.kind}>
              <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium"><Badge variant={group.kind === "recurring" ? "warning" : "outline"}>{GROUP_BADGES[group.kind]}</Badge>{group.kind === "task" ? null : group.label}<span className="text-[12px] font-normal text-ink-3">· {group.items.length} items</span></p>
              <p className="mt-0.5 text-[12px] text-ink-3">{GROUP_REASONS[group.kind]}</p>
              <ul className="mt-1 divide-y divide-line">{group.items.map((item) => <ItemRow key={item.key} item={item} />)}</ul>
            </div>
          ))}
          {grouping.ungrouped.length ? <div data-testid="handover-ungrouped"><p className="text-[12px] text-ink-3">{grouping.groups.length ? "Other items" : "Items"}</p><ul className="divide-y divide-line">{grouping.ungrouped.map((item) => <ItemRow key={item.key} item={item} />)}</ul></div> : null}
        </div>
      )}
      {grouping.comparisons.length ? (
        <div className="mt-3 space-y-2 border-t border-line pt-3" data-testid="handover-comparisons">
          <p className="text-[12px] text-ink-3">These items use similar words. They may be the same problem, so check them together before you act.</p>
          {grouping.comparisons.map((comparison) => (
            <div key={`${comparison.first.key}+${comparison.second.key}`} className="rounded-md border border-dashed border-line-2 p-2" data-testid="handover-comparison">
              <p className="text-[12.5px] text-ink-2">“{comparison.first.label}” ({formatDate(comparison.first.localDate)}) and “{comparison.second.label}” ({formatDate(comparison.second.localDate)})</p>
              <p className="mt-1 text-[12px] text-ink-3">{comparison.sharedTokens} {comparison.sharedTokens === 1 ? "word" : "words"} in common.</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
