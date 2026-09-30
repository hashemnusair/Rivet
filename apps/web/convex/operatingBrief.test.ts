import { describe, expect, it } from "vitest";
import {
  BRIEF_STALE_DAYS,
  buildOperatingBrief,
  type BriefInput,
  type BriefQueueItem,
} from "./operatingBrief";

const TODAY = "2026-09-22";
const NOW = "2026-09-22T05:00:00.000Z";
const scope = { branches: [{ id: "b-a", name: "Abdoun" }, { id: "b-b", name: "Sweifieh" }], branchScope: "all" as const, role: "owner", userId: "u-owner" };

function item(overrides: Partial<BriefQueueItem> & Pick<BriefQueueItem, "id" | "kind">): BriefQueueItem {
  return { priority: "normal", title: overrides.id, detail: "detail", href: `/x/${overrides.id}`, action: { kind: "navigate", label: "Open" }, ...overrides };
}

const QUEUE: BriefQueueItem[] = [
  item({ id: "balance:m-1", kind: "outstanding_balance", priority: "high", title: "Collect from Aya", subject: { kind: "member", id: "m-1" }, branchName: "Abdoun", amount: { amount: 45_000, currency: "JOD" }, href: "/members/m-1?action=collect", action: { kind: "navigate", label: "Collect" } }),
  item({ id: "balance:m-2", kind: "outstanding_balance", priority: "high", title: "Collect from Omar", subject: { kind: "member", id: "m-2" }, branchName: "Sweifieh", amount: { amount: 120_000, currency: "JOD" } }),
  item({ id: "renewal:ms-1", kind: "renewal", title: "Renew Dana", dueAt: "2026-09-22T20:59:59.999Z" }),
  item({ id: "renewal:ms-2", kind: "renewal", title: "Renew Faris", dueAt: "2026-09-26T20:59:59.999Z" }),
  item({ id: "task:t-1", kind: "follow_up", priority: "high", title: "Call Rania", dueAt: "2026-09-10T08:00:00.000Z", overdue: true, subject: { kind: "member", id: "m-3" }, action: { kind: "complete_task", label: "Done", taskId: "t-1" } }),
  item({ id: "task:t-2", kind: "follow_up", title: "Call Sami", dueAt: "2026-09-22T09:00:00.000Z" }),
  item({ id: "task:t-3", kind: "follow_up", priority: "high", title: "Call Nour", dueAt: "2026-09-20T09:00:00.000Z", overdue: true }),
  item({ id: "at-risk:m-4", kind: "at_risk", title: "Reconnect with Laith" }),
  item({ id: "access:m-5", kind: "access_denial", priority: "urgent", title: "Resolve entry for Zaid", occurredAt: "2026-09-22T04:10:00.000Z", branchName: "Abdoun" }),
  item({ id: "variance:s-1", kind: "cash_variance", priority: "urgent", title: "Review Abdoun cash variance", amount: { amount: -7_000, currency: "JOD" }, occurredAt: "2026-09-21T20:00:00.000Z" }),
  item({ id: "approval:a-1", kind: "approval", priority: "high", title: "Discount request", occurredAt: "2026-09-21T10:00:00.000Z" }),
  item({ id: "facility:f-1", kind: "facility_task", priority: "high", title: "Treadmill belt noise", detail: "Main floor · open", description: "TREAD-01 belt squeals at speed 10; members complaining.", branchName: "Abdoun", dueAt: "2026-09-21T09:00:00.000Z", overdue: true }),
  item({ id: "facility:f-2", kind: "facility_task", title: "Shower drain slow", detail: "Changing rooms · open", description: "Drain in the men's showers backs up after the evening peak.", branchName: "Sweifieh" }),
  item({ id: "checklist-due:tpl-1:2026-09-22", kind: "branch_checklist", title: "Due: Opening walkthrough", overdue: false }),
];

const EQUIPMENT: BriefQueueItem[] = [
  item({ id: "equipment:e-1", kind: "equipment_issue", priority: "urgent", title: "Belt slipping under load", detail: "TREAD-01 Commercial treadmill · in progress · safety: out of service", description: "Belt slips above speed 10 with a grinding noise.", branchName: "Abdoun", occurredAt: "2026-09-20T07:00:00.000Z", safetyStatus: "out_of_service" }),
  item({ id: "equipment:e-2", kind: "equipment_issue", title: "Console dim", detail: "ROW-01 Rowing machine · open · safety: unknown", branchName: "Sweifieh", occurredAt: "2026-09-21T07:00:00.000Z", safetyStatus: "unknown" }),
];

function input(overrides: Partial<BriefInput> = {}): BriefInput {
  return {
    generatedAt: NOW,
    today: TODAY,
    timezone: "Asia/Amman",
    currency: "JOD",
    scope,
    queue: QUEUE,
    sources: [
      { key: "expired", status: "ok", items: [item({ id: "expired:ms-9", kind: "renewal", title: "Win back Hala", dueAt: "2026-09-02T20:59:59.999Z", overdue: true })] },
      { key: "equipment", status: "ok", items: EQUIPMENT },
      { key: "stock", status: "ok", items: [item({ id: "stock:al-1", kind: "low_stock", title: "Reorder Creatine", detail: "0 available · reorder at 20" })] },
      { key: "support", status: "ok", items: [item({ id: "support:SUP-1", kind: "support_case", priority: "urgent", title: "Payment retry failed", description: "Card retry keeps failing since Monday." })] },
    ],
    ...overrides,
  };
}

describe("the needs-attention summary computes every number in code", () => {
  it("sums balances and counts renewals, follow-ups, approvals, cash, entry and machines exactly, per section", () => {
    const brief = buildOperatingBrief(input());
    const figures = (key: string) => Object.fromEntries((brief.sections.find((section) => section.key === key)?.figures ?? []).map((figure) => [figure.key, figure.value.kind === "count" ? figure.value.value : figure.value.money.amount]));
    expect(figures("collections")).toEqual({ outstanding: 165_000, members: 2, largest: 120_000 });
    expect(figures("renewals")).toEqual({ ending: 2, today: 1, expired: 1 });
    expect(figures("followups")).toEqual({ overdue: 2, today: 1, stale: 1 });
    expect(figures("retention")).toEqual({ members: 1 });
    expect(figures("controls")).toEqual({ approvals: 1, variances: 1, variance_total: 7_000, entry: 1 });
    expect(figures("facilities")).toEqual({ open: 2, overdue: 1, urgent: 0 });
    expect(figures("equipment")).toEqual({ open: 2, out_of_service: 1, unknown: 1 });
    expect(figures("checklists")).toEqual({ failed: 0, due: 1, overdue: 0 });
    expect(figures("stock")).toEqual({ products: 1 });
    expect(figures("support")).toEqual({ open: 1, urgent: 1 });
    expect(brief.totals).toEqual({ items: 19, urgent: 4, overdue: 4, stale: 2 });
    expect(BRIEF_STALE_DAYS).toBe(7);
    expect(brief.coverage).toBe("complete");
    expect(brief.missing).toEqual([]);
    expect(brief.truncated).toBe(false);
  });

  it("says each problem in one plain sentence, most urgent first, and links to the page where it is fixed", () => {
    const brief = buildOperatingBrief(input());
    expect(brief.attention.map((line) => [line.urgent, line.text, line.href])).toEqual([
      [true, '1 machine is marked "do not use"', "/x/equipment:e-1"],
      [true, "1 cash difference to check", "/payments/shifts"],
      [true, "1 member was refused entry today", "/reception"],
      [true, "1 urgent request with RIVET support", "/x/support:SUP-1"],
      [false, "1 request is waiting for your approval", "/audit?approval=pending"],
      [false, "2 members owe money", "/members?membership=outstanding&sort=-outstanding"],
      [false, "2 memberships end in the next 7 days", "/crm/queues?view=renewals"],
      [false, "1 membership ended in the last 30 days and was not renewed", "/crm/queues?view=renewals"],
      [false, "2 follow-ups are late, and 1 more is due today", "/crm/queues"],
      [false, "1 member may not come back", "/crm/queues?view=at-risk"],
      [false, "1 machine problem is not fixed yet", "/x/equipment:e-2"],
      [false, "2 maintenance jobs are open", "/maintenance"],
      [false, "1 daily checklist is not finished", "/checklists"],
      [false, "1 product is running low", "/operations?tab=inventory&stock=attention"],
    ]);
    // The money line carries the exact total beside the sentence.
    expect(brief.attention.find((line) => line.key === "unpaid")?.money).toEqual({ amount: 165_000, currency: "JOD" });
    // No sentence uses symbols or internal words.
    for (const line of brief.attention) expect(line.text).not.toMatch(/≤|≥|→|queue|variance|outstanding|term|coverage|source/i);
  });

  it("names only sources that could not be read, and ignores ones switched off or hidden by role", () => {
    const brief = buildOperatingBrief(input({ sources: [
      { key: "expired", status: "ok", items: [] },
      { key: "equipment", status: "not_enabled", message: "The operations module is off for this gym." },
      { key: "stock", status: "unavailable", message: "This source could not be read just now." },
      { key: "support", status: "no_permission" },
    ] }));
    expect(brief.coverage).toBe("partial");
    expect(brief.missing).toEqual(["stock levels"]);
    expect(brief.sources.map((source) => [source.key, source.status, source.itemCount])).toEqual([["queue", "ok", 14], ["expired", "empty", 0], ["equipment", "not_enabled", 0], ["stock", "unavailable", 0], ["support", "no_permission", 0]]);
    expect(brief.sections.find((section) => section.key === "collections")?.totalItems).toBe(2);
    expect(brief.attention.some((line) => line.key.startsWith("machines"))).toBe(false);
  });

  it("marks a cut list as partial and a quiet gym as all clear", () => {
    const cut = buildOperatingBrief(input({ queueTotal: 5_000 }));
    expect(cut.coverage).toBe("partial");
    expect(cut.truncated).toBe(true);
    const empty = buildOperatingBrief(input({ queue: [], sources: [{ key: "expired", status: "ok", items: [] }, { key: "equipment", status: "ok", items: [] }, { key: "stock", status: "ok", items: [] }, { key: "support", status: "ok", items: [] }] }));
    expect(empty.coverage).toBe("complete");
    expect(empty.totals).toEqual({ items: 0, urgent: 0, overdue: 0, stale: 0 });
    expect(empty.sections.every((section) => section.totalItems === 0)).toBe(true);
    expect(empty.attention).toEqual([]);
  });

  it("uses singular and plural correctly and folds due-today follow-ups into one sentence", () => {
    const onlyToday = buildOperatingBrief(input({ queue: [item({ id: "task:t-9", kind: "follow_up", title: "Call Lina", dueAt: "2026-09-22T12:00:00.000Z" })], sources: [] }));
    expect(onlyToday.attention.map((line) => line.text)).toEqual(["1 follow-up is due today"]);
    const twoMachines = buildOperatingBrief(input({ queue: [], sources: [{ key: "equipment", status: "ok", items: [
      item({ id: "equipment:a", kind: "equipment_issue", priority: "urgent", title: "A", safetyStatus: "out_of_service", href: "/operations?tab=equipment&branch=b-a" }),
      item({ id: "equipment:b", kind: "equipment_issue", priority: "urgent", title: "B", safetyStatus: "out_of_service", href: "/operations?tab=equipment&branch=b-b" }),
    ] }] }));
    // Two machines in two branches: the line links to the machines list, not one branch.
    expect(twoMachines.attention[0]).toMatchObject({ text: '2 machines are marked "do not use"', href: "/operations?tab=equipment", urgent: true });
  });
});
