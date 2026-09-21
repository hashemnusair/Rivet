import {
  BRANCHOPS_NONE,
  BRANCHOPS_UNCLEAR,
  buildHandoverRelatedState,
  buildNotificationTopicState,
  buildReportCategoryState,
  buildReportTargetState,
  buildSameFaultState,
  groupNotifications,
  handoverRelatedOptions,
  reportCategoryOptions,
  resolveHandoverRelatedFixture,
  resolveNotificationTopicFixture,
  resolveReportCategoryFixture,
  resolveReportTargetFixture,
  resolveSameFaultFixture,
  sameFaultOptions,
  type HandoverItem,
  type IssueLike,
  type NotificationLike,
} from "./branchOpsAssist";
import type { JevFeature, JevQuestion } from "./jevRegistry";

/**
 * Branch-operations assistance. Five bounded questions on the shared
 * foundation: which existing report kind and which registered machine or
 * space a written description points at, whether two similarly worded reports
 * on one machine are the same fault, whether two unresolved checklist items
 * are the same problem, and which group a stray notification belongs with.
 * Severity, safety status, repair decisions, ownership, due dates and read
 * state are never part of an answer.
 */
export const BRANCHOPS_FEATURE: JevFeature = {
  key: "branchops",
  label: "Branch operations",
  description: "Reads a written maintenance description into the existing report kinds and the branch's own machines and spaces, compares similarly worded reports on one machine, relates unresolved checklist items at handover, and places stray notifications in a group. Sends the typed description, the recorded report texts and counts only.",
};

const FIXTURE_MACHINES = [
  { id: "asset-tread-01", code: "TREAD-01", name: "Commercial treadmill", manufacturer: "Life Fitness", model: "Integrity 95Ti", zoneId: "zone-floor", status: "active" },
  { id: "asset-tread-02", code: "TREAD-02", name: "Commercial treadmill", manufacturer: "Life Fitness", model: "Integrity 95Ti", zoneId: "zone-floor", status: "active" },
  { id: "asset-row-01", code: "ROW-01", name: "Rowing machine", manufacturer: "Concept2", model: "RowErg", zoneId: "zone-floor", status: "active" },
];
const FIXTURE_SPACES = [
  { id: "zone-floor", name: "Main floor", kind: "floor" },
  { id: "zone-changing", name: "Changing rooms", nameAr: "غرف تبديل الملابس", kind: "changing_room" },
];

const categoryFixture = buildReportCategoryState({ description: "TREAD-01 belt slipping again under load, makes a grinding noise at speed 10", branchId: "branch-fixture", machineCount: 3, spaceCount: 2 });
const targetFixture = buildReportTargetState({ description: "TREAD-01 belt slipping again under load, makes a grinding noise at speed 10", branchId: "branch-fixture", machines: FIXTURE_MACHINES, spaces: FIXTURE_SPACES });

const CURRENT_ISSUE: IssueLike = { id: "issue-now", branchId: "branch-fixture", assetId: "asset-tread-01", title: "Belt slipping under load", description: "Belt slips when a heavier member runs above speed 10; grinding noise from the deck.", severity: "high", status: "open", safetyStatus: "out_of_service", reportedAt: "2026-09-20T07:00:00.000Z" };
const EARLIER_ISSUE: IssueLike = { id: "issue-before", branchId: "branch-fixture", assetId: "asset-tread-01", title: "Belt slipping", description: "Belt slipped under load during the evening peak; deck lubricated and tensioned.", severity: "medium", status: "resolved", safetyStatus: "safe_to_operate", reportedAt: "2026-07-02T07:00:00.000Z", resolvedAt: "2026-07-04T07:00:00.000Z" };
const sameFaultFixture = buildSameFaultState({ current: CURRENT_ISSUE, other: EARLIER_ISSUE, machine: { code: "TREAD-01", name: "Commercial treadmill", model: "Integrity 95Ti" } });

const FIRST_ITEM: HandoverItem = { key: "tpl-open|2026-09-20|open-2", templateId: "tpl-open", localDate: "2026-09-20", itemId: "open-2", label: "Check changing rooms are clean", runName: "Opening walkthrough", runType: "opening", dueTime: "07:30", required: true, status: "failed", zoneId: "zone-changing", reason: "Shower drain blocked, water on the floor", responsible: "receptionist", overdue: true };
const SECOND_ITEM: HandoverItem = { key: "tpl-close|2026-09-19|close-4", templateId: "tpl-close", localDate: "2026-09-19", itemId: "close-4", label: "Mop changing room floors", runName: "Closing walkthrough", runType: "closing", dueTime: "23:30", required: true, status: "failed", zoneId: "zone-changing", reason: "Drain still blocked, floor floods after mopping", responsible: "receptionist", overdue: true };
const handoverFixture = buildHandoverRelatedState({ first: FIRST_ITEM, second: SECOND_ITEM, spaces: new Map([["zone-changing", "Changing rooms"]]) });

const FIXTURE_NOTIFICATIONS: NotificationLike[] = [
  { id: "n1", kind: "pt_booking", title: "New PT booking", body: "Rania Odeh · 2026-09-22T07:00:00.000Z", href: "/pt?booking=bk-1", dedupeKey: "pt-booking:bk-1", createdAt: "2026-09-21T06:00:00.000Z" },
  { id: "n2", kind: "pt_booking_rescheduled", title: "PT booking rescheduled", body: "2026-09-23T07:00:00.000Z", href: "/pt?booking=bk-1", dedupeKey: "pt-reschedule:bk-1:1", createdAt: "2026-09-21T07:00:00.000Z" },
  { id: "n3", kind: "support_reply", title: "RIVET replied to your support case", body: "Charged twice for July", href: "/support?case=SUP-219", dedupeKey: "support-reply:SUP-219:1", createdAt: "2026-09-21T08:00:00.000Z" },
  { id: "n4", kind: "support_resolved", title: "RIVET resolved your support case", body: "Charged twice for July", href: "/support?case=SUP-219", dedupeKey: "support-resolved:SUP-219:1", createdAt: "2026-09-21T09:00:00.000Z" },
  { id: "n5", kind: "staff_note", title: "Schedule note for Rania Odeh", body: "Rania Odeh · PT booking moved to Tuesday by the member", href: "/pt", dedupeKey: "staff-note:2026-09-21", createdAt: "2026-09-21T10:00:00.000Z" },
];
const topicFixture = buildNotificationTopicState({ notification: FIXTURE_NOTIFICATIONS[4]!, grouping: groupNotifications(FIXTURE_NOTIFICATIONS) });

export const BRANCHOPS_QUESTIONS: readonly JevQuestion[] = [
  {
    kind: "choice",
    key: "branchops.report_category",
    feature: "branchops",
    version: 1,
    label: "Report kind from a description",
    description: "Which existing report kind a written maintenance description belongs to: machine issue, cleaning, inspection, incident, or unclear.",
    instructions: "Gym staff wrote what they found at a branch. Choose the one existing report kind it belongs to. A machine that is faulty, noisy, stuck or unsafe is a machine issue. Dirt, spills, smells, bins or supplies are a cleaning task. Injury, leaks, flooding, power, fire, a hazard or damage to the building is an incident, even when a machine is involved. Something to be checked or tested on a schedule is an inspection. Choose unclear when the description does not say. Never judge severity or safety.",
    options: reportCategoryOptions(),
    permission: "members.read",
    cacheTtlMs: 30 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveReportCategoryFixture,
    fixture: { state: categoryFixture.state, judgment: resolveReportCategoryFixture({ state: categoryFixture.state }) ?? { kind: "choice", choice: BRANCHOPS_UNCLEAR, probabilities: { [BRANCHOPS_UNCLEAR]: 1 } } },
  },
  {
    kind: "choice",
    key: "branchops.report_target",
    feature: "branchops",
    version: 1,
    label: "Machine or space from a description",
    description: "Which registered machine or gym space at this branch a written description is about, or none. A same-named machine at another branch is never offered.",
    instructions: "Gym staff wrote what they found at a branch. The machines (code, name, make, model, location) and gym spaces registered at that branch are offered. Choose the one the description names or clearly points at. When two are equally plausible, split the probability between them rather than guessing. Choose none when the description names no machine or space, or names one that is not offered.",
    maxCandidates: 111,
    permission: "members.read",
    cacheTtlMs: 30 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveReportTargetFixture,
    fixture: { state: targetFixture.state, candidates: targetFixture.candidates, judgment: resolveReportTargetFixture({ state: targetFixture.state, candidates: targetFixture.candidates }) ?? { kind: "choice", choice: BRANCHOPS_NONE, probabilities: { [BRANCHOPS_NONE]: 1 } } },
  },
  {
    kind: "choice",
    key: "branchops.same_fault",
    feature: "branchops",
    version: 1,
    label: "Same fault or separate",
    description: "Whether a report and an earlier report on the same machine describe the same recurring fault, a separate fault with similar wording, or cannot be told apart.",
    instructions: "Two reports about one gym machine are given: the current one and an earlier one. Choose same_fault when both describe the same defect on the same part or the same behaviour. Choose similar_but_separate when the words overlap but the part, symptom or cause differs. Choose unclear when the descriptions do not say enough. Similar wording alone never means the same fault. Do not judge severity, safety or whether the machine should be repaired or replaced.",
    options: sameFaultOptions(),
    permission: "members.read",
    cacheTtlMs: 60 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveSameFaultFixture,
    fixture: { state: sameFaultFixture.state, judgment: resolveSameFaultFixture({ state: sameFaultFixture.state }) ?? { kind: "choice", choice: "unclear", probabilities: { unclear: 1 } } },
  },
  {
    kind: "choice",
    key: "branchops.handover_related",
    feature: "branchops",
    version: 1,
    label: "Same problem at handover",
    description: "Whether two unresolved checklist items with similar wording are the same underlying problem, related but separate, unrelated, or unclear.",
    instructions: "Two unresolved daily-checklist items at one branch are given with their notes and failure reasons. Choose same_problem only when one cause explains both and one fix would resolve both. Choose related_but_separate when they share a place or theme but need separate actions. Choose unrelated when the wording overlaps by coincidence. Choose unclear when the notes do not say enough. Never decide who is responsible, whether an item is required, or whether it is done.",
    options: handoverRelatedOptions(),
    permission: "members.read",
    cacheTtlMs: 30 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveHandoverRelatedFixture,
    fixture: { state: handoverFixture.state, judgment: resolveHandoverRelatedFixture({ state: handoverFixture.state }) ?? { kind: "choice", choice: "unclear", probabilities: { unclear: 1 } } },
  },
  {
    kind: "choice",
    key: "branchops.notification_topic",
    feature: "branchops",
    version: 1,
    label: "Notification group",
    description: "Which existing notification group a stray notification belongs with, or none. Grouping is presentation only; nothing is marked read.",
    instructions: "One notification addressed to a staff member is given with the groups already formed from their other notifications. Choose the group it belongs with when it concerns the same record or the same kind of work; choose none when it is about something else. Never mark anything read or drop a notification.",
    maxCandidates: 21,
    permission: "members.read",
    cacheTtlMs: 10 * 60 * 1000,
    timeoutMs: 6_000,
    synthetic: false,
    fixtureResolver: resolveNotificationTopicFixture,
    fixture: { state: topicFixture.state, candidates: topicFixture.candidates, judgment: resolveNotificationTopicFixture({ state: topicFixture.state, candidates: topicFixture.candidates }) ?? { kind: "choice", choice: BRANCHOPS_NONE, probabilities: { [BRANCHOPS_NONE]: 1 } } },
  },
];
