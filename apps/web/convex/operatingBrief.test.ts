import { describe, expect, it } from "vitest";
import {
  BRIEF_STALE_DAYS,
  applicableEmphases,
  briefEmphasisFacts,
  briefRelatedPairs,
  buildBriefEmphasisState,
  buildBriefRelatedState,
  buildOperatingBrief,
  resolveBriefEmphasisFixture,
  resolveBriefEmphasisReading,
  resolveBriefRelatedFixture,
  resolveBriefRelatedReading,
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

describe("the operating brief computes every figure in code", () => {
  it("sums balances, counts renewals, follow-ups, controls and machine reports exactly, per authored section", () => {
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
    expect(brief.sections.map((section) => section.key)).toEqual(["collections", "renewals", "followups", "retention", "controls", "facilities", "equipment", "checklists", "stock", "support"]);
    expect(brief.totals).toEqual({ items: 19, mandatory: 4, overdue: 4, stale: 2 });
    expect(brief.coverage).toBe("complete");
    expect(brief.truncated).toBe(false);
  });

  it("keeps mandatory items on top and in their sections, orders the complete queue deterministically, and flags stale work with the exact days", () => {
    const brief = buildOperatingBrief(input());
    // Queue order: priority, then the earliest recorded time, then id; an item without a time goes last.
    expect(brief.mandatory.map((entry) => entry.id)).toEqual(["equipment:e-1", "variance:s-1", "access:m-5", "support:SUP-1"]);
    expect(brief.sections.find((section) => section.key === "controls")?.items.map((entry) => entry.id)).toEqual(["variance:s-1", "access:m-5", "approval:a-1"]);
    expect(brief.queue.slice(0, 4).every((entry) => entry.priority === "urgent")).toBe(true);
    // Priority first, then time, then id: the same order the Today queue uses.
    expect(brief.queue.map((entry) => entry.id)).toEqual([...brief.queue].sort((left, right) => {
      const rank = { urgent: 0, high: 1, normal: 2 } as const;
      return rank[left.priority] - rank[right.priority] || (left.dueAt ?? left.occurredAt ?? "9999").localeCompare(right.dueAt ?? right.occurredAt ?? "9999") || left.id.localeCompare(right.id);
    }).map((entry) => entry.id));
    const stale = brief.queue.find((entry) => entry.id === "task:t-1");
    expect(stale).toMatchObject({ overdueDays: 12, stale: true });
    const recent = brief.queue.find((entry) => entry.id === "task:t-3");
    expect(recent).toMatchObject({ overdueDays: 2, stale: false });
    expect(BRIEF_STALE_DAYS).toBe(7);
    // Evidence links keep the original action and add the record's own pages.
    expect(brief.queue.find((entry) => entry.id === "balance:m-1")?.evidence).toEqual([
      { label: "Collect", href: "/members/m-1?action=collect" },
      { label: "Member record", href: "/members/m-1" },
      { label: "Timeline", href: "/members/m-1?tab=timeline" },
      { label: "Payments", href: "/members/m-1?tab=payments" },
    ]);
  });

  it("reports missing, disabled and forbidden sources as partial coverage without dropping the rest", () => {
    const brief = buildOperatingBrief(input({ sources: [
      { key: "expired", status: "ok", items: [] },
      { key: "equipment", status: "not_enabled", message: "The operations module is off for this gym." },
      { key: "stock", status: "unavailable", message: "This source could not be read just now; the rest of the brief is current." },
      { key: "support", status: "no_permission" },
    ] }));
    expect(brief.coverage).toBe("partial");
    expect(brief.sources.map((source) => [source.key, source.status, source.itemCount])).toEqual([["queue", "ok", 14], ["expired", "empty", 0], ["equipment", "not_enabled", 0], ["stock", "unavailable", 0], ["support", "no_permission", 0]]);
    expect(brief.sources.every((source) => source.asOf === NOW)).toBe(true);
    expect(brief.sections.find((section) => section.key === "collections")?.totalItems).toBe(2);
    expect(brief.sections.find((section) => section.key === "equipment")?.totalItems).toBe(0);
    expect(brief.mandatory.map((entry) => entry.id)).toEqual(["variance:s-1", "access:m-5"]);
  });

  it("shows a cut queue as partial coverage and an empty scope as complete and empty", () => {
    const cut = buildOperatingBrief(input({ queueTotal: 5_000 }));
    expect(cut.coverage).toBe("partial");
    expect(cut.truncated).toBe(true);
    expect(cut.sources[0]?.message).toContain("first 14 of 5000");
    const empty = buildOperatingBrief(input({ queue: [], sources: [{ key: "expired", status: "ok", items: [] }, { key: "equipment", status: "ok", items: [] }, { key: "stock", status: "ok", items: [] }, { key: "support", status: "ok", items: [] }] }));
    expect(empty.coverage).toBe("complete");
    expect(empty.totals).toEqual({ items: 0, mandatory: 0, overdue: 0, stale: 0 });
    expect(empty.sections.every((section) => section.totalItems === 0)).toBe(true);
    expect(empty.defaultEmphasis).toBe("steady");
    expect(empty.applicableEmphases).toEqual(["steady"]);
  });
});

describe("prepared emphasis", () => {
  it("offers only emphases whose deterministic precondition holds, defaults to the first by rank, and sends counts and amounts only", () => {
    const brief = buildOperatingBrief(input());
    expect(brief.applicableEmphases).toEqual(["safety_first", "collections", "renewals", "followups", "retention", "facilities", "checklists", "support", "steady"]);
    expect(brief.defaultEmphasis).toBe("safety_first");
    const quiet = buildOperatingBrief(input({ queue: QUEUE.filter((entry) => entry.kind === "renewal"), sources: [] }));
    expect(applicableEmphases(quiet)).toEqual(["renewals", "steady"]);
    expect(quiet.defaultEmphasis).toBe("renewals");
    const facts = briefEmphasisFacts(brief);
    expect(JSON.stringify(facts)).not.toMatch(/Aya|Omar|Rania|Treadmill|TREAD/);
    expect(facts).toMatchObject({ scope: "all_branches", branchCount: 2, mandatoryItems: 4, figures: { collections: { items: 2, outstanding: 165_000 } } });
    const state = buildBriefEmphasisState({ brief, currency: "JOD" });
    expect(state.candidates.map((candidate) => candidate.id)).toEqual(brief.applicableEmphases);
    expect(state.scopeKey).toBe("brief:u-owner:all");
    const scoped = buildBriefEmphasisState({ brief: buildOperatingBrief(input({ scope: { ...scope, branchId: "b-a", branchScope: "selected", userId: "u-manager" } })), currency: "JOD" });
    expect(scoped.scopeKey).toBe("brief:u-manager:b-a");
    expect(scoped.state).not.toEqual(state.state);
  });

  it("reads the fixture answer, leads with safety when anything is mandatory, and falls back to the standard order for an unoffered answer or a model failure", () => {
    const brief = buildOperatingBrief(input());
    const state = buildBriefEmphasisState({ brief, currency: "JOD" });
    const judgment = resolveBriefEmphasisFixture({ state: state.state, candidates: state.candidates });
    expect(judgment).toMatchObject({ kind: "choice", choice: "safety_first" });
    expect(resolveBriefEmphasisReading(judgment!, brief)).toMatchObject({ key: "safety_first", heading: "Safety, cash and entry problems come first", fallback: false });
    const calm = buildOperatingBrief(input({ queue: QUEUE.filter((entry) => entry.priority !== "urgent"), sources: [] }));
    const calmState = buildBriefEmphasisState({ brief: calm, currency: "JOD" });
    const calmJudgment = resolveBriefEmphasisFixture({ state: calmState.state, candidates: calmState.candidates });
    expect(calmJudgment).toMatchObject({ kind: "choice", choice: "collections" });
    expect(resolveBriefEmphasisReading({ kind: "choice", choice: "support", probabilities: { support: 1 } }, calm)).toMatchObject({ key: calm.defaultEmphasis, fallback: true });
    expect(resolveBriefEmphasisReading({ kind: "boolean", probability: 0.9 }, calm)).toMatchObject({ key: "collections", fallback: true });
  });
});

describe("related matter", () => {
  it("proposes only same-branch operational pairs with overlapping wording and never touches commercial items", () => {
    const brief = buildOperatingBrief(input());
    expect(brief.related).toEqual([{ firstId: "equipment:e-1", secondId: "facility:f-1", sharedTokens: expect.any(Number) }]);
    expect(brief.related[0]!.sharedTokens).toBeGreaterThanOrEqual(2);
    // The Sweifieh shower task and the Abdoun treadmill task never pair across branches even with shared words.
    const crossBranch = briefRelatedPairs(buildOperatingBrief(input({ sources: [], queue: [...QUEUE, item({ id: "facility:f-3", kind: "facility_task", title: "Treadmill belt noise", description: "TREAD-01 belt squeals at speed 10; members complaining.", branchName: "Sweifieh" })] })).queue);
    expect(crossBranch.some((pair) => pair.secondId === "facility:f-3" && pair.firstId === "facility:f-1")).toBe(false);
  });

  it("reads a shared machine as the same matter, conflicting descriptions as unclear, and a strong answer only as a presentation link", () => {
    const first = item({ id: "equipment:e-1", kind: "equipment_issue", title: "Belt slipping under load", detail: "TREAD-01 Commercial treadmill · in progress · safety: out of service", description: "Belt slips above speed 10 with a grinding noise.", safetyStatus: "out_of_service" });
    const same = item({ id: "facility:f-1", kind: "facility_task", title: "Treadmill belt noise", detail: "Main floor · open", description: "TREAD-01 belt squeals at speed 10; members complaining." });
    const sameState = buildBriefRelatedState({ first, second: same, scope: { userId: "u-owner" } });
    expect(sameState.scopeKey).toBe("brief-related:u-owner:equipment:e-1+facility:f-1");
    const sameReading = resolveBriefRelatedReading(resolveBriefRelatedFixture({ state: sameState.state })!);
    expect(sameReading).toMatchObject({ verdict: "same_matter", related: true });
    const conflicting = item({ id: "facility:f-9", kind: "facility_task", title: "TREAD-01 belt fixed", detail: "Main floor · open", description: "Belt tensioned this morning; treadmill safe to use again." });
    const conflictState = buildBriefRelatedState({ first, second: conflicting, scope: { userId: "u-owner" } });
    const conflictReading = resolveBriefRelatedReading(resolveBriefRelatedFixture({ state: conflictState.state })!);
    expect(conflictReading).toMatchObject({ verdict: "unclear", related: false });
    expect(conflictReading.explanation).toContain("both stay listed");
    // The recorded safety status is passed as a fact and is never part of the answer.
    expect((conflictState.state as { first: { recordedSafetyStatus: string } }).first.recordedSafetyStatus).toBe("out_of_service");
    const separate = item({ id: "facility:f-2", kind: "facility_task", title: "Shower drain slow", description: "Drain in the men's showers backs up after the evening peak." });
    expect(resolveBriefRelatedReading(resolveBriefRelatedFixture({ state: buildBriefRelatedState({ first, second: separate, scope: { userId: "u-owner" } }).state })!)).toMatchObject({ verdict: "separate", related: false });
    expect(resolveBriefRelatedReading({ kind: "choice", choice: "same_matter", probabilities: { same_matter: 0.55, related: 0.45 } }).related).toBe(false);
  });
});
