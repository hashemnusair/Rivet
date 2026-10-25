import { describe, expect, it } from "vitest";
import type { TodayQueueItem } from "@/lib/domain/types";
import { createTranslator } from "@/lib/i18n/core";
import { makeFormatters } from "@/lib/i18n/formatters";
import { todayItemDetail, todayItemTitle } from "./today-queue-copy";
import { systemMessage } from "@/lib/i18n/system-messages";

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

describe("Arabic Today items RIVET adds", () => {
  it("names a waiting approval and who it was prepared for, and a prepared task by its descriptor", () => {
    const format = makeFormatters("ar", "الآن", "Asia/Amman");
    const approval = item({ id: "ai-proposal:proposal-1", kind: "approval", title: "A prepared change is waiting for approval", detail: "Prepared by RIVET for Layla Haddad" });
    expect(todayItemTitle({ t, locale: "ar", isolate: preserve }, approval)).toBe("تغيير مُعدّ بانتظار الاعتماد");
    expect(todayItemDetail({ t, locale: "ar", isolate: preserve }, approval)).toBe("أعدّه RIVET لـ Layla Haddad");
    const task = item({ id: "task:task-1", kind: "follow_up", title: "Follow up with Rana", titleMessage: systemMessage("communicationCompletion.tasks.leadFollowUp", { name: "Rana" }) });
    expect(todayItemTitle({ t, locale: "ar", isolate: preserve, format }, task).replace(/[⁦-⁩]/g, "")).toBe("متابعة Rana");
    // A typed task has no descriptor and keeps its words.
    expect(todayItemTitle({ t, locale: "ar", isolate: preserve, format }, item({ id: "task:task-2", kind: "follow_up" }))).toBe("User supplied work title");
  });
});

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
