export type TodayQueueSortableItem = {
  id: string;
  kind: string;
  priority: "urgent" | "high" | "normal";
  dueAt?: string;
  occurredAt?: string;
};

export type FinalizedTodayQueue<T extends TodayQueueSortableItem> = {
  generatedAt: string;
  items: T[];
  totalItems: number;
  urgentItems: number;
  highPriorityItems: number;
  kindCounts: Partial<Record<T["kind"], number>>;
};

const PRIORITY_RANK: Record<TodayQueueSortableItem["priority"], number> = {
  urgent: 0,
  high: 1,
  normal: 2,
};

function queueTime(item: TodayQueueSortableItem): string {
  return item.dueAt ?? item.occurredAt ?? "9999-12-31T23:59:59.999Z";
}

/**
 * Keep the queue deterministic across the Convex and preview adapters. Items
 * are ordered by severity, then time, then stable identity. Counts describe
 * the complete queue even when the dashboard only receives its first page.
 */
export function finalizeTodayQueue<T extends TodayQueueSortableItem>(
  candidates: readonly T[],
  generatedAt: string,
  limit = 12,
): FinalizedTodayQueue<T> {
  const unique = new Map<string, T>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.id)) unique.set(candidate.id, candidate);
  }
  const ordered = [...unique.values()].sort((left, right) => {
    const priority = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
    if (priority !== 0) return priority;
    const time = queueTime(left).localeCompare(queueTime(right));
    return time !== 0 ? time : left.id.localeCompare(right.id);
  });
  const kindCounts: Record<string, number> = {};
  for (const item of ordered) {
    kindCounts[item.kind] = (kindCounts[item.kind] ?? 0) + 1;
  }

  return {
    generatedAt,
    items: ordered.slice(0, Math.max(1, limit)),
    totalItems: ordered.length,
    urgentItems: ordered.filter((item) => item.priority === "urgent").length,
    highPriorityItems: ordered.filter((item) => item.priority === "high").length,
    kindCounts: kindCounts as Partial<Record<T["kind"], number>>,
  };
}
