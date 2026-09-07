import { describe, expect, it } from "vitest";
import { completedByContactOutcome, describeContactOutcome, followUpTaskTitle, resolveFollowUpTasks, shouldClearLeadFollowUp, suggestedFollowUpDays } from "./contact-outcomes";

const task = (id: string, overrides: Partial<{ type: string; status: string; ownerId: string; memberId: string; leadId: string; dueAt: string }> = {}) => ({
  id,
  type: "follow_up",
  status: "open",
  ownerId: "sara",
  memberId: "member-1",
  dueAt: "2026-09-08T07:00:00.000Z",
  ...overrides,
});

describe("contact outcome language", () => {
  it("labels persisted outcomes consistently and never pretends a WhatsApp handoff was delivered", () => {
    expect(describeContactOutcome("no_answer")).toBe("No answer");
    expect(describeContactOutcome("whatsapp_opened")).toBe("WhatsApp opened · not confirmed");
    expect(describeContactOutcome("legacy_value")).toBe("legacy value");
    expect(describeContactOutcome(undefined)).toBeUndefined();
    expect(completedByContactOutcome("answered_call_back")).toBe("Contact logged — Asked for a callback");
    expect(followUpTaskTitle("Dana", "no_answer")).toBe("Follow up — Dana · after no answer");
    expect(followUpTaskTitle("Dana")).toBe("Follow up — Dana");
  });

  it("suggests a retry only for outcomes that leave the conversation open", () => {
    expect(suggestedFollowUpDays("no_answer")).toBe(2);
    expect(suggestedFollowUpDays("answered_call_back")).toBe(1);
    expect(suggestedFollowUpDays("answered_not_interested")).toBeUndefined();
    expect(suggestedFollowUpDays("wrong_number")).toBeUndefined();
  });
});

describe("resolveFollowUpTasks", () => {
  it("moves the latest open follow-up instead of creating a duplicate, closing older ones", () => {
    const tasks = [task("older", { dueAt: "2026-09-01T07:00:00.000Z" }), task("latest"), task("renewal", { type: "renewal_call", dueAt: "2026-09-05T07:00:00.000Z" })];
    const result = resolveFollowUpTasks({ tasks, subject: { memberId: "member-1" }, actorId: "sara", canManageTeam: false, nextFollowUpAt: "2026-09-10T07:00:00.000Z" });
    expect(result.reschedule?.id).toBe("latest");
    expect(result.complete.map((item) => item.id)).toEqual(["renewal", "older"]);
    expect(result.createFollowUp).toBe(false);
  });

  it("closes only the follow-ups already due when no next date is given, everything on a terminal outcome, and asks for a new task only when none exists", () => {
    const isDue = (dueAt: string) => dueAt <= "2026-09-08T23:59:59.999Z";
    const due = task("due", { dueAt: "2026-09-08T07:00:00.000Z" });
    const later = task("later", { dueAt: "2026-09-12T07:00:00.000Z" });
    const noAnswer = resolveFollowUpTasks({ tasks: [due, later], subject: { memberId: "member-1" }, actorId: "sara", canManageTeam: false, outcome: "no_answer", isDue });
    expect(noAnswer).toEqual({ complete: [due], createFollowUp: false });
    const notInterested = resolveFollowUpTasks({ tasks: [due, later], subject: { memberId: "member-1" }, actorId: "sara", canManageTeam: false, outcome: "answered_not_interested", isDue });
    expect(notInterested.complete.map((item) => item.id)).toEqual(["later", "due"]);
    const fresh = resolveFollowUpTasks({ tasks: [], subject: { memberId: "member-1" }, actorId: "sara", canManageTeam: false, nextFollowUpAt: "2026-09-10T07:00:00.000Z" });
    expect(fresh).toEqual({ reschedule: undefined, complete: [], createFollowUp: true });
  });

  it("clears a lead's own follow-up date only when it was due or the thread ended", () => {
    const isDue = (dueAt: string) => dueAt <= "2026-09-08T23:59:59.999Z";
    expect(shouldClearLeadFollowUp({ outcome: "no_answer", currentNextFollowUpAt: "2026-09-08T07:00:00.000Z", isDue })).toBe(true);
    expect(shouldClearLeadFollowUp({ outcome: "no_answer", currentNextFollowUpAt: "2026-09-12T07:00:00.000Z", isDue })).toBe(false);
    expect(shouldClearLeadFollowUp({ outcome: "wrong_number", currentNextFollowUpAt: "2026-09-12T07:00:00.000Z", isDue })).toBe(true);
    expect(shouldClearLeadFollowUp({ outcome: "answered_interested", currentNextFollowUpAt: undefined, isDue })).toBe(false);
  });

  it("leaves other people's tasks, completed tasks and unrelated task types alone unless the actor manages the team", () => {
    const tasks = [
      task("theirs", { ownerId: "omar" }),
      task("done", { status: "completed" }),
      task("payment", { type: "payment_collection" }),
      task("other-member", { memberId: "member-2" }),
      task("lead-task", { memberId: undefined, leadId: "lead-1" }),
    ];
    const asSales = resolveFollowUpTasks({ tasks, subject: { memberId: "member-1" }, actorId: "sara", canManageTeam: false, outcome: "no_answer" });
    expect(asSales.complete).toEqual([]);
    const asManager = resolveFollowUpTasks({ tasks, subject: { memberId: "member-1" }, actorId: "layla", canManageTeam: true, outcome: "no_answer" });
    expect(asManager.complete.map((item) => item.id)).toEqual(["theirs"]);
    const forLead = resolveFollowUpTasks({ tasks, subject: { leadId: "lead-1" }, actorId: "sara", canManageTeam: false, nextFollowUpAt: "2026-09-10T07:00:00.000Z" });
    expect(forLead.reschedule?.id).toBe("lead-task");
  });
});
