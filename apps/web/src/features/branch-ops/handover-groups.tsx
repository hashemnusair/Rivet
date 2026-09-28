"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { qk } from "@/lib/api/keys";
import type { ChecklistDay, HandoverItem } from "@/lib/domain/types";
import { useApiQuery } from "@/lib/hooks/use-api";
import { cn } from "@/lib/utils/cn";
import { handoverGroups, handoverItems } from "../../../convex/branchOpsAssist";

function ItemRow({ item }: { item: HandoverItem }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-1.5" data-testid="handover-item" data-item-key={item.key}>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-ink">{item.label}</span>
        <span className="block text-[12px] text-ink-3">{item.runName} · {item.localDate} · {item.responsible}{item.reason ? ` · ${item.reason}` : ""}</span>
      </span>
      <span className="flex shrink-0 flex-wrap gap-1">
        <Badge variant={item.status === "failed" ? "danger" : "warning"}>{item.status === "failed" ? "failed" : "required · pending"}</Badge>
        {item.overdue ? <Badge variant="outline">overdue</Badge> : null}
        {item.facilityTaskId ? <Badge variant="outline">task linked</Badge> : null}
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
  const zones = useApiQuery(qk.operations({ kind: "equipment-zones", branchId }), (api) => api.listZones({ branchId, includeArchived: false }), { retry: false, staleTime: 5 * 60_000 });
  const spaces = useMemo(() => new Map((zones.data ?? []).map((zone) => [zone.id, zone.name] as const)), [zones.data]);
  const items = useMemo(() => handoverItems([...(day.carryover ?? []), ...day.runs]), [day]);
  const grouping = useMemo(() => handoverGroups(items, spaces), [items, spaces]);
  const [mode, setMode] = useState<"grouped" | "all">(() => (grouping.groups.length ? "grouped" : "all"));
  if (!items.length) return null;
  const failed = items.filter((item) => item.status === "failed").length;
  return (
    <section className="rounded-md border border-line p-3" aria-label="Checklist handover" data-testid="checklist-handover">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Checklist handover</p>
          <p className="mt-0.5 text-xs text-ink-3" data-testid="handover-summary">{items.length} unresolved item{items.length === 1 ? "" : "s"} ({failed} failed) · {grouping.disclosure}</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Handover view">
          <Button type="button" size="xs" variant={mode === "grouped" ? "primary" : "secondary"} aria-pressed={mode === "grouped"} onClick={() => setMode("grouped")}>Grouped</Button>
          <Button type="button" size="xs" variant={mode === "all" ? "primary" : "secondary"} aria-pressed={mode === "all"} onClick={() => setMode("all")}>All items</Button>
        </div>
      </div>
      {mode === "all" ? (
        <ul className="mt-2 divide-y divide-line" data-testid="handover-all">{items.map((item) => <ItemRow key={item.key} item={item} />)}</ul>
      ) : (
        <div className="mt-2 space-y-3" data-testid="handover-grouped">
          {grouping.groups.map((group) => (
            <div key={group.id} className={cn("rounded-md border border-line px-3 py-2", group.kind === "recurring" && "border-warning/50 bg-warning-bg/20")} data-testid="handover-group" data-group-kind={group.kind}>
              <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium"><Badge variant={group.kind === "recurring" ? "warning" : "outline"}>{group.kind === "recurring" ? "Recurring" : group.kind === "task" ? "Same task" : "Same space"}</Badge>{group.label}<span className="text-[12px] font-normal text-ink-3">· {group.items.length} items</span></p>
              <p className="mt-0.5 text-[12px] text-ink-3">{group.reason}</p>
              <ul className="mt-1 divide-y divide-line">{group.items.map((item) => <ItemRow key={item.key} item={item} />)}</ul>
            </div>
          ))}
          {grouping.ungrouped.length ? <div data-testid="handover-ungrouped"><p className="text-[12px] text-ink-3">{grouping.groups.length ? "Not grouped" : "Unresolved items"}</p><ul className="divide-y divide-line">{grouping.ungrouped.map((item) => <ItemRow key={item.key} item={item} />)}</ul></div> : null}
        </div>
      )}
      {grouping.comparisons.length ? (
        <div className="mt-3 space-y-2 border-t border-line pt-3" data-testid="handover-comparisons">
          <p className="text-[12px] text-ink-3">Similar wording, not yet related. Review the records together before taking a manual action; every item keeps its owner and date.</p>
          {grouping.comparisons.map((comparison) => (
            <div key={`${comparison.first.key}+${comparison.second.key}`} className="rounded-md border border-dashed border-line-2 p-2" data-testid="handover-comparison">
              <p className="text-[12.5px] text-ink-2">“{comparison.first.label}” ({comparison.first.localDate}) and “{comparison.second.label}” ({comparison.second.localDate})</p>
              <p className="mt-1 text-[12px] text-ink-3">Shared words: {comparison.sharedTokens}. Confirm the issue from the recorded details before assigning or closing work.</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
