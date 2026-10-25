import { describe, expect, it } from "vitest";
import { evaluateLeadCandidate, leadIsDue, leadOperationKey, type LeadFollowUpFacts } from "./sales-batch";

const NOW = "2026-10-22T08:30:00.000Z";
const base: LeadFollowUpFacts = { leadId: "l-1", leadName: "Rania Saleh", stage: "contacted", phone: "+962790000000", nextFollowUpAt: "2026-10-21T15:00:00.000Z", openTasks: [] };

describe("lead follow-up decisions", () => {
  it("treats open leads due by tonight, and new leads without a date, as due", () => {
    const tonight = "2026-10-22T20:59:00.000Z";
    expect(leadIsDue({ stage: "contacted", nextFollowUpAt: "2026-10-22T18:00:00.000Z" }, tonight)).toBe(true);
    expect(leadIsDue({ stage: "contacted", nextFollowUpAt: "2026-10-23T06:00:00.000Z" }, tonight)).toBe(false);
    expect(leadIsDue({ stage: "new" }, tonight)).toBe(true);
    expect(leadIsDue({ stage: "contacted" }, tonight)).toBe(false);
    expect(leadIsDue({ stage: "won", nextFollowUpAt: "2026-10-20T06:00:00.000Z" }, tonight)).toBe(false);
    expect(leadIsDue({ stage: "offer_sent", nextFollowUpAt: "2026-10-20T06:00:00.000Z", convertedMemberId: "m-1" }, tonight)).toBe(false);
  });

  it("leaves out a lead who asked not to be contacted, even with open work to link", () => {
    expect(evaluateLeadCandidate({ ...base, doNotContact: true }, { now: NOW })).toEqual({ decision: "exclude", reason: "opted_out" });
    expect(evaluateLeadCandidate({ ...base, doNotContact: true, openTasks: [{ id: "t-1", title: "Call back" }] }, { now: NOW })).toEqual({ decision: "exclude", reason: "opted_out" });
  });

  it("stops for a lead closed, without a phone, or contacted in the last day, and links open work", () => {
    expect(evaluateLeadCandidate({ ...base, stage: "lost" }, { now: NOW })).toEqual({ decision: "exclude", reason: "lead_closed" });
    expect(evaluateLeadCandidate({ ...base, convertedMemberId: "m-1" }, { now: NOW })).toEqual({ decision: "exclude", reason: "lead_closed" });
    expect(evaluateLeadCandidate({ ...base, phone: " " }, { now: NOW })).toEqual({ decision: "exclude", reason: "no_phone" });
    expect(evaluateLeadCandidate({ ...base, lastContactAt: "2026-10-21T09:00:00.000Z" }, { now: NOW })).toEqual({ decision: "exclude", reason: "lead_contacted_recently" });
    expect(evaluateLeadCandidate({ ...base, lastContactAt: "2026-10-21T08:00:00.000Z" }, { now: NOW }).decision).toBe("create");
    expect(evaluateLeadCandidate({ ...base, openTasks: [{ id: "t-1", title: "Call back" }] }, { now: NOW })).toEqual({ decision: "link", taskId: "t-1", taskTitle: "Call back" });
  });

  it("keeps a later time today as recorded, brings an overdue call into the next hour, and raises long-overdue calls", () => {
    expect(evaluateLeadCandidate({ ...base, nextFollowUpAt: "2026-10-22T15:00:00.000Z" }, { now: NOW })).toEqual({ decision: "create", dueAt: "2026-10-22T15:00:00.000Z", priority: "normal" });
    expect(evaluateLeadCandidate(base, { now: NOW })).toEqual({ decision: "create", dueAt: "2026-10-22T09:30:00.000Z", priority: "normal" });
    expect(evaluateLeadCandidate({ ...base, nextFollowUpAt: "2026-10-19T09:00:00.000Z" }, { now: NOW })).toMatchObject({ priority: "high" });
  });

  it("keys one prepared call per lead and follow-up date", () => {
    expect(leadOperationKey("org", "l-1", "2026-10-21T15:00:00.000Z")).toBe(leadOperationKey("org", "l-1", "2026-10-21T15:00:00.000Z"));
    expect(leadOperationKey("org", "l-1", "2026-10-22T15:00:00.000Z")).not.toBe(leadOperationKey("org", "l-1", "2026-10-21T15:00:00.000Z"));
  });
});
