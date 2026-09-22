import type { JevFeature, JevQuestion } from "./jevRegistry";
import {
  briefRelatedOptions,
  buildBriefEmphasisState,
  buildBriefRelatedState,
  buildOperatingBrief,
  resolveBriefEmphasisFixture,
  resolveBriefRelatedFixture,
  type BriefQueueItem,
} from "./operatingBrief";

/**
 * The daily operating brief. Two bounded questions on the shared foundation:
 * which prepared emphasis to lead with, given the exact figures RIVET
 * computed, and whether two similarly worded operational items describe the
 * same matter. Totals, counts, overdue conditions, branch scope, order and
 * the mandatory list are never part of an answer; Jev sees counts and
 * amounts for the first question and the two items' recorded wording for
 * the second.
 */
export const BRIEF_FEATURE: JevFeature = {
  key: "brief",
  label: "Daily operating brief",
  description: "Chooses which prepared emphasis the dashboard brief leads with from RIVET's exact figures, and reads whether two similarly worded maintenance, machine, checklist or support items are the same matter. Sends counts and amounts, or the two items' recorded wording, only.",
};

const FIXTURE_QUEUE: BriefQueueItem[] = [
  { id: "balance:m-1", kind: "outstanding_balance", priority: "high", title: "Collect from a member", detail: "Outstanding member balance", href: "/members/m-1?action=collect", action: { kind: "navigate", label: "Collect" }, subject: { kind: "member", id: "m-1" }, branchName: "Abdoun", amount: { amount: 45_000, currency: "JOD" } },
  { id: "balance:m-2", kind: "outstanding_balance", priority: "high", title: "Collect from a member", detail: "Outstanding member balance", href: "/members/m-2?action=collect", action: { kind: "navigate", label: "Collect" }, subject: { kind: "member", id: "m-2" }, branchName: "Abdoun", amount: { amount: 120_000, currency: "JOD" } },
  { id: "renewal:ms-1", kind: "renewal", priority: "normal", title: "Renew a member", detail: "Monthly · 3 days left", href: "/members/m-3?action=renew", action: { kind: "navigate", label: "Renew" }, subject: { kind: "member", id: "m-3" }, dueAt: "2026-09-25T20:59:59.999Z" },
  { id: "task:t-1", kind: "follow_up", priority: "high", title: "Call back about the offer", detail: "Lead · Sales", href: "/crm/leads/l-1", action: { kind: "complete_task", label: "Done", taskId: "t-1" }, subject: { kind: "lead", id: "l-1" }, dueAt: "2026-09-12T08:00:00.000Z", overdue: true },
  { id: "access:m-4", kind: "access_denial", priority: "urgent", title: "Resolve entry for a member", detail: "membership expired", href: "/members/m-4", action: { kind: "navigate", label: "Review" }, branchName: "Abdoun", occurredAt: "2026-09-22T06:10:00.000Z" },
  { id: "facility:f-1", kind: "facility_task", priority: "high", title: "Treadmill row belt noise", detail: "Main floor · open", description: "TREAD-01 belt squeals at speed; members complaining.", href: "/operations?tab=facilities", action: { kind: "navigate", label: "Open" }, branchName: "Abdoun", dueAt: "2026-09-21T09:00:00.000Z", overdue: true },
];
const FIXTURE_EQUIPMENT: BriefQueueItem[] = [
  { id: "equipment:e-1", kind: "equipment_issue", priority: "urgent", title: "Belt slipping under load", detail: "TREAD-01 · in progress", description: "Belt slips above speed 10 with a grinding noise from the deck.", href: "/operations?tab=equipment", action: { kind: "navigate", label: "Open" }, branchName: "Abdoun", occurredAt: "2026-09-20T07:00:00.000Z", safetyStatus: "out_of_service" },
];

const FIXTURE_BRIEF = buildOperatingBrief({
  generatedAt: "2026-09-22T05:00:00.000Z",
  today: "2026-09-22",
  timezone: "Asia/Amman",
  currency: "JOD",
  scope: { branches: [{ id: "b-1", name: "Abdoun" }, { id: "b-2", name: "Sweifieh" }], branchScope: "all", role: "owner", userId: "u-fixture" },
  queue: FIXTURE_QUEUE,
  sources: [
    { key: "expired", status: "ok", items: [] },
    { key: "equipment", status: "ok", items: FIXTURE_EQUIPMENT },
    { key: "stock", status: "not_enabled", message: "The operations module is off." },
    { key: "support", status: "ok", items: [] },
  ],
});

const emphasisFixture = buildBriefEmphasisState({ brief: FIXTURE_BRIEF, currency: "JOD" });
const relatedFixture = buildBriefRelatedState({ first: FIXTURE_EQUIPMENT[0]!, second: FIXTURE_QUEUE[5]!, scope: { userId: "u-fixture" } });

export const BRIEF_QUESTIONS: readonly JevQuestion[] = [
  {
    kind: "choice",
    key: "brief.emphasis",
    feature: "brief",
    version: 1,
    label: "Emphasis for the daily brief",
    description: "Which prepared emphasis the operating brief should lead with, chosen from RIVET's exact figures. Counts and amounts only; no names or record text.",
    instructions: "A gym's morning brief lists exact figures RIVET computed: outstanding balances and their total, renewals ending soon and lapsed terms, overdue follow-ups, members at risk, pending approvals and cash variances, entry denials, open maintenance and machine reports, incomplete checklists, low stock and open support cases, with the scope and how complete the coverage is. Choose the one prepared emphasis a manager should read first. Anything mandatory (safety, cash, entry) outranks money; a large outstanding total or many renewals outranks routine follow-ups. Choose the routine emphasis when nothing stands out. Never compute or restate figures; never invent reasons.",
    maxCandidates: 12,
    permission: "members.read",
    cacheTtlMs: 30 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveBriefEmphasisFixture,
    fixture: { state: emphasisFixture.state, candidates: emphasisFixture.candidates, judgment: resolveBriefEmphasisFixture({ state: emphasisFixture.state, candidates: emphasisFixture.candidates }) ?? { kind: "choice", choice: "steady", probabilities: { steady: 1 } } },
  },
  {
    kind: "choice",
    key: "brief.related_matter",
    feature: "brief",
    version: 1,
    label: "Same matter in the brief",
    description: "Whether two similarly worded operational items in the brief (maintenance task, machine report, checklist, support case) describe the same underlying matter, a related one, a separate one, or cannot be told apart.",
    instructions: "Two unresolved operational items from one gym are given with their recorded wording. Choose same_matter only when one underlying problem explains both and one fix would settle both. Choose related when they share a place, machine or theme but need separate actions. Choose separate when the wording overlaps by coincidence. Choose unclear when the descriptions do not say enough or contradict each other, for example one says a fault is fixed and the other says it is still open. The recorded safety status is a fact; never judge whether a machine is safe, how severe anything is, or who should act.",
    options: briefRelatedOptions(),
    permission: "members.read",
    cacheTtlMs: 30 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveBriefRelatedFixture,
    fixture: { state: relatedFixture.state, judgment: resolveBriefRelatedFixture({ state: relatedFixture.state }) ?? { kind: "choice", choice: "unclear", probabilities: { unclear: 1 } } },
  },
];
