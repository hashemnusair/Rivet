import { describe, expect, it } from "vitest";
import type { TodayQueueItem } from "@/lib/domain/types";
import { finalizeTodayQueue } from "./today-queue";

function item(input: Partial<TodayQueueItem> & Pick<TodayQueueItem, "id" | "priority">): TodayQueueItem {
  return {
    kind: "follow_up",
    title: input.id,
    detail: "Queue detail",
    href: "/crm/queues",
    action: { kind: "navigate", label: "Open" },
    ...input,
  };
}

describe("today queue ordering", () => {
  it("sorts by priority and time while preserving full counts beyond the visible limit", () => {
    const queue = finalizeTodayQueue([
      item({ id: "normal", priority: "normal", dueAt: "2026-08-29T08:00:00.000Z" }),
      item({ id: "urgent-later", priority: "urgent", dueAt: "2026-08-29T11:00:00.000Z" }),
      item({ id: "high", priority: "high", dueAt: "2026-08-29T07:00:00.000Z", overdue: true }),
      item({ id: "urgent-first", priority: "urgent", dueAt: "2026-08-29T09:00:00.000Z" }),
    ], "2026-08-29T06:00:00.000Z", 3);

    expect(queue.items.map((candidate) => candidate.id)).toEqual(["urgent-first", "urgent-later", "high"]);
    expect(queue).toMatchObject({
      totalItems: 4,
      urgentItems: 2,
      highPriorityItems: 1,
      kindCounts: { follow_up: 4 },
      overdueItems: 1,
      overdueKindCounts: { follow_up: 1 },
    });
  });

  it("deduplicates stable work identities", () => {
    const queue = finalizeTodayQueue([
      item({ id: "task-1", priority: "high" }),
      item({ id: "task-1", priority: "urgent" }),
    ], "2026-08-29T06:00:00.000Z");

    expect(queue.totalItems).toBe(1);
    expect(queue.items[0]?.priority).toBe("high");
  });
});
