import { describe, expect, it } from "vitest";
import { buildOperatingBrief, type BriefInput, type BriefQueueItem } from "../../../convex/operatingBrief";
import { translate } from "@/lib/i18n/dictionary";
import { ar, en } from "@/lib/i18n/messages";
import type { MessageTree } from "@/lib/i18n/dictionary";
import type { TFunction } from "@/lib/i18n/provider";
import { attentionLineText } from "./needs-attention";

const tFor = (locale: "en" | "ar"): TFunction => (key, vars) =>
  translate({ messages: (locale === "en" ? en : ar) as unknown as MessageTree, fallback: en as unknown as MessageTree, locale }, key, vars);

const scope = { branches: [{ id: "b-a", name: "Abdoun" }], branchScope: "all" as const, role: "owner", userId: "u-owner" };

function item(overrides: Partial<BriefQueueItem> & Pick<BriefQueueItem, "id" | "kind">): BriefQueueItem {
  return { priority: "normal", title: overrides.id, detail: "detail", href: `/x/${overrides.id}`, action: { kind: "navigate", label: "Open" }, ...overrides };
}

/** Enough of every kind to make the server write every line, some with one item and some with several. */
function input(extra: BriefQueueItem[] = []): BriefInput {
  const dueAt = "2026-09-10T08:00:00.000Z";
  return {
    generatedAt: "2026-09-22T05:00:00.000Z",
    today: "2026-09-22",
    timezone: "Asia/Amman",
    currency: "JOD",
    scope,
    queue: [
      item({ id: "balance:1", kind: "outstanding_balance", amount: { amount: 5_000, currency: "JOD" } }),
      item({ id: "balance:2", kind: "outstanding_balance", amount: { amount: 7_000, currency: "JOD" } }),
      item({ id: "renewal:1", kind: "renewal", dueAt: "2026-09-23T20:59:59.999Z" }),
      item({ id: "task:1", kind: "follow_up", dueAt, overdue: true }),
      item({ id: "task:2", kind: "follow_up", dueAt: "2026-09-22T09:00:00.000Z" }),
      item({ id: "task:3", kind: "follow_up", dueAt: "2026-09-22T10:00:00.000Z" }),
      item({ id: "at-risk:1", kind: "at_risk" }),
      item({ id: "access:1", kind: "access_denial", priority: "urgent" }),
      item({ id: "variance:1", kind: "cash_variance", priority: "urgent", amount: { amount: -7_000, currency: "JOD" } }),
      item({ id: "variance:2", kind: "cash_variance", priority: "urgent", amount: { amount: 2_000, currency: "JOD" } }),
      item({ id: "approval:1", kind: "approval" }),
      item({ id: "facility:1", kind: "facility_task" }),
      item({ id: "checklist-due:1", kind: "branch_checklist" }),
      item({ id: "checklist-failed:1", kind: "branch_checklist", priority: "urgent" }),
      ...extra,
    ],
    sources: [
      { key: "expired", status: "ok", items: [item({ id: "expired:1", kind: "renewal", dueAt: "2026-09-02T20:59:59.999Z", overdue: true })] },
      { key: "equipment", status: "ok", items: [
        item({ id: "equipment:1", kind: "equipment_issue", priority: "urgent", safetyStatus: "out_of_service" }),
        item({ id: "equipment:2", kind: "equipment_issue", safetyStatus: "unknown" }),
        item({ id: "equipment:3", kind: "equipment_issue", safetyStatus: "unknown" }),
      ] },
      { key: "stock", status: "ok", items: [item({ id: "stock:1", kind: "low_stock" })] },
      { key: "support", status: "ok", items: [
        item({ id: "support:1", kind: "support_case", priority: "urgent" }),
        item({ id: "support:2", kind: "support_case" }),
      ] },
    ],
  };
}

describe("Needs attention lines rebuilt on the client", () => {
  it("reads exactly like the server's English for every line, singular and plural", () => {
    const brief = buildOperatingBrief(input());
    const tEn = tFor("en");
    // Every line kind the server can write is present, so none is left untested.
    expect(brief.attention.map((line) => line.key)).toEqual(expect.arrayContaining([
      "machines-do-not-use", "cash-differences", "entry-refused", "checklists-failed", "support-urgent", "approvals", "unpaid", "renewals-ending",
      "renewals-ended", "followups", "at-risk", "machines-open", "maintenance", "checklists-due", "stock", "support-open",
    ]));
    for (const line of brief.attention) expect(attentionLineText(tEn, brief, line), line.key).toBe(line.text);
  });

  it("covers the late follow-up sentence with and without items due today", () => {
    const tEn = tFor("en");
    const both = buildOperatingBrief(input());
    const lateAndToday = both.attention.find((line) => line.key === "followups")!;
    expect(lateAndToday.text).toBe("1 follow-up is late, and 2 more are due today");
    expect(attentionLineText(tEn, both, lateAndToday)).toBe(lateAndToday.text);

    const base = input();
    const lateOnly = buildOperatingBrief({ ...base, queue: base.queue.filter((queued) => queued.id !== "task:2" && queued.id !== "task:3") });
    const lateLine = lateOnly.attention.find((line) => line.key === "followups")!;
    expect(attentionLineText(tEn, lateOnly, lateLine)).toBe(lateLine.text);

    const todayOnly = buildOperatingBrief({ ...base, queue: base.queue.filter((queued) => queued.id !== "task:1") });
    const todayLine = todayOnly.attention.find((line) => line.key === "followups")!;
    expect(attentionLineText(tEn, todayOnly, todayLine)).toBe(todayLine.text);
  });

  it("writes Arabic with the counted-noun forms and leaves no English words", () => {
    const brief = buildOperatingBrief(input());
    const tAr = tFor("ar");
    for (const line of brief.attention) {
      const text = attentionLineText(tAr, brief, line);
      expect(text, line.key).toBeDefined();
      expect(text, line.key).toMatch(/[؀-ۿ]/);
      expect(text, line.key).not.toBe(line.text);
      // RIVET stays in Latin letters; no other English word may survive.
      expect(text!.replace(/RIVET/g, ""), line.key).not.toMatch(/[A-Za-z]{3,}/);
    }
    const lines = Object.fromEntries(brief.attention.map((line) => [line.key, attentionLineText(tAr, brief, line)]));
    expect(lines["at-risk"]).toBe("عضو واحد قد لا يعود");
    expect(lines["unpaid"]).toBe("عضوان بمبالغ غير مدفوعة");
    expect(lines["machines-open"]).toBe("مشكلتان في الأجهزة لم تُحلّا بعد");
    expect(lines["followups"]).toBe("متابعة واحدة متأخرة، ومتابعتان أخريان مستحقتان اليوم");
  });

  it("falls back to the server's text for a line kind or a figure it does not know", () => {
    const brief = buildOperatingBrief(input());
    const tEn = tFor("en");
    expect(attentionLineText(tEn, brief, { key: "something-new", urgent: false, text: "New thing", href: "/x" })).toBeUndefined();
    expect(attentionLineText(tEn, { ...brief, sections: [] }, brief.attention[0]!)).toBeUndefined();
  });
});
