import { describe, expect, it } from "vitest";
import type { TodayQueueItem } from "@/lib/domain/types";
import { createTranslator } from "@/lib/i18n/core";
import { makeFormatters } from "@/lib/i18n/formatters";
import { todayItemDetail } from "./today-queue-copy";

const t = createTranslator("ar");
const preserve = (value: string | number) => String(value);
const clock = makeFormatters("ar", "الآن", "Asia/Amman").clock;

function item(overrides: Partial<TodayQueueItem> & Pick<TodayQueueItem, "id" | "kind">): TodayQueueItem {
  const { id, kind, ...rest } = overrides;
  return {
    id,
    kind,
    priority: "normal",
    title: "User supplied work title",
    detail: "User supplied work detail",
    href: "/work",
    action: { kind: "navigate", label: "Open" },
    ...rest,
  };
}

describe("Arabic Today queue details", () => {
  it("translates the generated checklist wrapper, keeps its branch, and formats the local clock", () => {
    const detail = todayItemDetail(
      { t, locale: "ar", isolate: preserve, clock },
      item({
        id: "checklist-due:template-1:2026-10-03",
        kind: "branch_checklist",
        detail: "Sweifieh · 2/5 done · due 17:30",
      }),
    );
    expect(detail).toBe("Sweifieh · أُنجز 2/5 · يستحق 5:30 م");
  });

  it("translates known live operational state while retaining staff and zone names", () => {
    const cash = todayItemDetail(
      { t, locale: "ar", isolate: preserve },
      item({ id: "variance:shift-1", kind: "cash_variance", detail: "Shift closed by Dana Manager" }),
    );
    const facility = todayItemDetail(
      { t, locale: "ar", isolate: preserve },
      item({ id: "facility:task-1", kind: "facility_task", detail: "Studio B · in progress" }),
    );
    expect(cash).toBe("أُغلق الصندوق بواسطة Dana Manager");
    expect(facility).toBe("Studio B · قيد التنفيذ");
  });

  it("leaves arbitrary or unfamiliar task details as written", () => {
    const source = "Safety: awaiting technician · custom note from a staff member";
    expect(todayItemDetail(
      { t, locale: "ar", isolate: preserve },
      item({ id: "equipment:issue-1", kind: "equipment_issue", detail: source }),
    )).toBe(source);
  });
});
