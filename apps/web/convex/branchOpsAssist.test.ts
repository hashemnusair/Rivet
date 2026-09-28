import { describe, expect, it } from "vitest";
import {
  MANDATORY_NOTIFICATION_KINDS,
  evaluateGrouping,
  groupNotifications,
  handoverGroups,
  handoverItems,
  notificationEntity,
  relatedRepairHistory,
  type HandoverRunLike,
  type IssueLike,
  type NotificationLike,
} from "./branchOpsAssist";

const issue = (id: string, assetId: string, title: string, description: string, extra: Partial<IssueLike> = {}): IssueLike => ({
  id,
  branchId: "branch-a",
  assetId,
  title,
  description,
  severity: "medium",
  status: "resolved",
  safetyStatus: "safe_to_operate",
  reportedAt: "2026-06-01T07:00:00.000Z",
  resolvedAt: "2026-06-03T07:00:00.000Z",
  ...extra,
});

describe("deterministic repair history", () => {
  it("keeps history on the same machine and surfaces similar wording for manual comparison", () => {
    const current = issue("now", "tread-1", "Belt slipping under load", "Belt slips above speed 10 with a grinding noise.", { status: "open", reportedAt: "2026-09-20T07:00:00.000Z", resolvedAt: undefined });
    const earlier = issue("before", "tread-1", "Belt slipping", "Belt slipped under load during the evening peak.");
    const otherMachine = issue("other", "tread-2", "Belt slipping under load", "Same wording, different treadmill.");
    const history = relatedRepairHistory(current, [current, earlier, otherMachine], [{ id: "wo-1", assetId: "tread-1", issueId: "before", status: "completed", description: "Tension belt", openedAt: "2026-06-02T07:00:00.000Z" }]);

    expect(history.entries.map((entry) => entry.issue.id)).toEqual(["before"]);
    expect(history.entries[0]).toMatchObject({ similarWording: true, workOrders: [expect.objectContaining({ id: "wo-1" })] });
    expect(history.comparisons).toEqual([{ issueId: "now", otherIssueId: "before" }]);
    expect(history.disclosure).toContain("Other machines and other branches are not included");
  });
});

const run = (templateId: string, localDate: string, items: HandoverRunLike["items"], extra: Partial<HandoverRunLike> = {}): HandoverRunLike => ({
  templateId,
  branchId: "branch-a",
  localDate,
  name: templateId === "open" ? "Opening walkthrough" : "Closing walkthrough",
  type: templateId === "open" ? "opening" : "closing",
  dueTime: "07:30",
  assignedRole: "receptionist",
  assignedUserName: "Hala",
  overdue: true,
  items,
  ...extra,
});

describe("deterministic handover groups", () => {
  it("keeps unresolved obligations and groups repeated checklist records", () => {
    const items = handoverItems([
      run("open", "2026-09-18", [{ itemId: "clean", label: "Check changing rooms", required: true, status: "failed", zoneId: "changing" }]),
      run("open", "2026-09-19", [{ itemId: "clean", label: "Check changing rooms", required: true, status: "failed", zoneId: "changing", reason: "Drain blocked" }, { itemId: "scanner", label: "Test scanner", required: true, status: "pending" }]),
      run("close", "2026-09-19", [{ itemId: "mop", label: "Mop changing rooms", required: true, status: "failed", zoneId: "changing", reason: "Drain blocked" }, { itemId: "optional", label: "Rack weights", required: false, status: "pending" }], { assignedUserName: "Karim" }),
    ]);
    expect(items.map((item) => item.key)).toEqual(["open|2026-09-18|clean", "close|2026-09-19|mop", "open|2026-09-19|clean", "open|2026-09-19|scanner"]);
    expect(items.some((item) => item.itemId === "optional")).toBe(false);
    const grouping = handoverGroups(items, new Map([["changing", "Changing rooms"]]));
    expect(grouping.groups[0]).toMatchObject({ kind: "recurring", items: expect.arrayContaining([expect.objectContaining({ itemId: "clean" })]) });
    expect(grouping.ungrouped.map((item) => item.itemId)).toEqual(["mop", "scanner"]);
    expect(grouping.comparisons.length).toBeGreaterThan(0);
    expect(grouping.disclosure).toContain("previous 7 days");
  });
});

const notification = (id: string, kind: string, href: string, extra: Partial<NotificationLike> = {}): NotificationLike => ({
  id,
  kind,
  title: kind.replaceAll("_", " "),
  body: "",
  href,
  dedupeKey: `${kind}:${id}`,
  createdAt: `2026-09-21T0${id.length}:00:00.000Z`,
  ...extra,
});

describe("deterministic notification groups", () => {
  it("keeps mandatory alerts visible and groups linked records without hiding items", () => {
    const list = [
      notification("booking-1", "pt_booking", "/pt?booking=bk-1", { body: "Rania · booking", createdAt: "2026-09-21T09:00:00.000Z" }),
      notification("booking-2", "pt_booking_rescheduled", "/pt?booking=bk-1", { body: "Rania · rescheduled", createdAt: "2026-09-21T10:00:00.000Z" }),
      notification("member-1", "renewal", "/members/member-1?action=renew", { body: "Sami · ends soon", createdAt: "2026-09-21T07:00:00.000Z" }),
      notification("alert-1", "access_denial", "/reception", { body: "Expired membership", createdAt: "2026-09-21T11:00:00.000Z" }),
      notification("single-1", "staff_note", "/pt", { body: "Schedule note", createdAt: "2026-09-21T08:00:00.000Z" }),
    ];
    const grouping = groupNotifications(list);
    expect(grouping.mandatory.map((entry) => entry.id)).toEqual(["alert-1"]);
    expect(grouping.groups.map((group) => group.notifications.map((entry) => entry.id))).toEqual([["booking-2", "booking-1"]]);
    expect(grouping.singles.map((entry) => entry.id)).toEqual(["single-1", "member-1"]);
    const shown = [...grouping.mandatory, ...grouping.groups.flatMap((group) => group.notifications), ...grouping.singles].map((entry) => entry.id).sort();
    expect(shown).toEqual(list.map((entry) => entry.id).sort());
    expect(MANDATORY_NOTIFICATION_KINDS).toContain("access_denial");
    expect(notificationEntity({ href: "/platform/support?case=SUP-9", dedupeKey: "x" })).toEqual({ key: "case:SUP-9", label: "Support case SUP-9" });
  });
});

describe("grouping evaluation", () => {
  it("reports useful, false, missed and hidden pairs", () => {
    expect(evaluateGrouping({ sourceIds: ["a", "b", "c", "d", "e"], groups: [["a", "b"], ["c", "d"]], shownIds: ["a", "b", "c", "d"], truePairs: [["a", "b"], ["a", "e"]] })).toEqual({ usefulPairs: 1, falsePairs: 1, missedPairs: 1, hiddenItems: ["e"] });
  });
});
