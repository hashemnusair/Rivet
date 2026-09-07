import { beforeEach, describe, expect, it } from "vitest";
import { ERR } from "@/lib/api/errors";
import type * as T from "@/lib/domain/types";
import { addDays, todayISODate } from "@/lib/utils/dates";
import { MockGymOSApi } from "./MockGymOSApi";

/**
 * The daily sales and retention loop as the mock backend must run it: a logged
 * contact resolves the follow-up it fulfils, Today shows every due follow-up
 * exactly once with the person attached, and closing a lead leaves one audit
 * trail whichever button was used.
 */
let api: MockGymOSApi;

beforeEach(async () => {
  api = new MockGymOSApi();
  api.setBehavior({ latencyMs: 0 });
  await api.switchDemoRole("owner");
});

async function openFollowUpTasks(memberId: string): Promise<T.Task[]> {
  return (await api.listTasks({ status: "open", memberId, pageSize: 100 })).items.filter((task) => task.type === "follow_up" || task.type === "renewal_call");
}

async function activeMember(): Promise<T.MemberSummary> {
  const page = await api.listMembers({ status: "active", pageSize: 50 });
  const member = page.items.find((candidate) => candidate.membershipStatus === "active");
  if (!member) throw new Error("seed should contain an active member");
  return member;
}

describe("member follow-up loop", () => {
  it("moves the open follow-up to the next date instead of stacking a task per contact", async () => {
    const member = await activeMember();
    const session = await api.getSession();
    const today = todayISODate(session.organization.timezone);
    const firstDate = `${addDays(today, 1)}T07:00:00.000Z`;
    const secondDate = `${addDays(today, 3)}T07:00:00.000Z`;
    const before = (await openFollowUpTasks(member.id)).length;

    await api.logMemberContactAttempt(member.id, { outcome: "no_answer", nextFollowUpAt: firstDate });
    await api.logMemberContactAttempt(member.id, { outcome: "answered_call_back", notes: "Call Thursday", nextFollowUpAt: secondDate });

    const open = await openFollowUpTasks(member.id);
    expect(open.length).toBe(Math.max(1, before));
    const followUp = open.find((task) => task.type === "follow_up") ?? open[0]!;
    expect(followUp.dueAt).toBe(secondDate);
    if (followUp.type === "follow_up") expect(followUp.title).toBe(`Follow up — ${member.fullName} · after asked for a callback`);
  });

  it("closes the follow-up with the outcome when no next date is given and leaves the closure on the timeline", async () => {
    const member = await activeMember();
    const session = await api.getSession();
    const nextDate = `${addDays(todayISODate(session.organization.timezone), 1)}T07:00:00.000Z`;
    await api.logMemberContactAttempt(member.id, { outcome: "no_answer", nextFollowUpAt: nextDate });
    expect((await openFollowUpTasks(member.id)).length).toBeGreaterThan(0);

    await api.logMemberContactAttempt(member.id, { outcome: "answered_not_interested", notes: "Moving abroad" });

    expect(await openFollowUpTasks(member.id)).toEqual([]);
    const completed = (await api.listTasks({ status: "completed", memberId: member.id, pageSize: 100 })).items;
    expect(completed.some((task) => task.outcome === "Contact logged — Not interested")).toBe(true);
    const timeline = await api.listMemberTimeline(member.id, { pageSize: 10 });
    expect(timeline.items.some((event) => event.type === "task_completed" && event.body === "Contact logged — Not interested")).toBe(true);
  });

  it("lists only the member's own tasks when asked for a member", async () => {
    const member = await activeMember();
    const session = await api.getSession();
    await api.logMemberContactAttempt(member.id, { outcome: "no_answer", nextFollowUpAt: `${addDays(todayISODate(session.organization.timezone), 1)}T07:00:00.000Z` });
    const all = await api.listTasks({ status: "open", pageSize: 200 });
    const mine = await api.listTasks({ status: "open", memberId: member.id, pageSize: 200 });
    expect(all.totalItems).toBeGreaterThan(mine.totalItems);
    expect(mine.items.every((task) => task.memberId === member.id)).toBe(true);
  });

  it("requires members.write to log a member contact, exactly like the Convex operation", async () => {
    const member = await activeMember();
    await api.switchDemoRole("receptionist");
    await expect(api.logMemberContactAttempt(member.id, { outcome: "no_answer" })).rejects.toMatchObject({ code: ERR.FORBIDDEN });
    await api.switchDemoRole("salesperson");
    const salesSession = await api.getSession();
    const visible = (await api.listMembers({ pageSize: 50 })).items[0];
    if (visible) await expect(api.logMemberContactAttempt(visible.id, { outcome: "no_answer" })).resolves.toMatchObject({ type: "call_attempt" });
    expect(salesSession.permissions).toContain("members.write");
  });
});

describe("lead follow-up loop", () => {
  async function newLead(nextFollowUpAt?: string) {
    const session = await api.getSession();
    return api.createLead({ fullName: "Loop Lead", phone: "+962790007001", branchId: session.branches[0]!.id, source: "walk_in", nextFollowUpAt });
  }

  it("puts a due lead follow-up on Today once, with the person attached and a direct contact link", async () => {
    // A salesperson's Today is short enough to show every due item; the owner's
    // demo queue is cut to its highest-priority page.
    await api.switchDemoRole("salesperson");
    const dueAt = new Date(Date.now() - 3_600_000).toISOString();
    const lead = await newLead(dueAt);
    const range = { from: addDays(todayISODate(), -29), to: todayISODate() };
    const dashboard = await api.getDashboard(range);
    const item = dashboard.todayQueue.items.find((candidate) => candidate.id === `lead-follow-up:${lead.id}`);
    expect(item).toMatchObject({ kind: "follow_up", overdue: true, subject: { kind: "lead", id: lead.id }, href: `/crm/leads/${lead.id}?action=contact`, action: { kind: "navigate", label: "Log contact" } });
    expect(item?.detail).toBe("Lead · not contacted yet");

    const session = await api.getSession();
    await api.createFollowUp({ type: "follow_up", title: "Call about trial", ownerId: session.user.id, dueAt, leadId: lead.id });
    const withTask = await api.getDashboard(range);
    expect(withTask.todayQueue.items.some((candidate) => candidate.id === `lead-follow-up:${lead.id}`)).toBe(false);
    expect(withTask.todayQueue.items.filter((candidate) => candidate.subject?.id === lead.id)).toHaveLength(1);
  });

  it("moves an existing lead task when a contact schedules the next follow-up and keeps the stage of a booked trial on no answer", async () => {
    const session = await api.getSession();
    const lead = await newLead();
    const dueAt = new Date(Date.now() - 3_600_000).toISOString();
    const task = await api.createFollowUp({ type: "follow_up", title: "Call about trial", ownerId: session.user.id, dueAt, leadId: lead.id });
    const nextDate = `${addDays(todayISODate(session.organization.timezone), 2)}T07:00:00.000Z`;

    await api.logContactAttempt(lead.id, { outcome: "no_answer", nextFollowUpAt: nextDate });
    const tasks = (await api.listTasks({ status: "open", leadId: lead.id, pageSize: 50 })).items;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: task.id, dueAt: nextDate });
    expect((await api.getLead(lead.id)).stage).toBe("attempted");

    const booked = await api.scheduleLeadTrial(lead.id, { preferredDate: addDays(todayISODate(), 1), preferredTime: "18:00" });
    expect(booked.stage).toBe("trial_booked");
    const afterNoAnswer = await api.logContactAttempt(lead.id, { outcome: "no_answer", notes: "Moved to Did not answer from the pipeline." });
    expect(afterNoAnswer.stage).toBe("trial_booked");
    expect(afterNoAnswer.lastContactOutcome).toBe("no_answer");
  });

  it("closes a lead as not sold from the record with the same reason rule, audit fact and cleared follow-up as the pipeline", async () => {
    const dueAt = new Date(Date.now() + 3_600_000).toISOString();
    const lead = await newLead(dueAt);
    const session = await api.getSession();
    await api.createFollowUp({ type: "follow_up", title: "Call back", ownerId: session.user.id, dueAt, leadId: lead.id });

    await expect(api.updateLead(lead.id, { stage: "lost", lostReason: "no" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    const closed = await api.updateLead(lead.id, { stage: "lost", lostReason: "Price did not work" });
    expect(closed).toMatchObject({ stage: "lost", lostReason: "Price did not work", nextFollowUpAt: undefined });
    expect((await api.listTasks({ status: "open", leadId: lead.id, pageSize: 50 })).items).toEqual([]);
    const audit = await api.listAuditEvents({ category: "crm", entityId: lead.id, pageSize: 20 });
    expect(audit.items).toContainEqual(expect.objectContaining({ action: "lead.lost", reason: "Price did not work" }));
  });
});
