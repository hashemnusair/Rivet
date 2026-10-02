import { describe, expect, it } from "vitest";
import {
  buildMemberFollowUpContext,
  classifyFollowUpEvidence,
  describeFollowUpDelivery,
  eligibleReminderTemplates,
  followUpTopicsIn,
  previewContactConsequences,
  reminderTemplateUnavailableReason,
  renderReminderForMember,
  type FollowUpContextInput,
} from "./followupAssist";

const TODAY = "2026-09-21";
const NOW = Date.UTC(2026, 8, 21, 9, 0); // 12:00 in Amman
const iso = (daysFromToday: number, hour = 9) => new Date(NOW + daysFromToday * 86_400_000 + (hour - 9) * 3_600_000).toISOString();

describe("consequence preview", () => {
  const tasks = [
    { id: "mine", type: "follow_up", status: "open", ownerId: "sales-a", ownerName: "Sales A", memberId: "m1", dueAt: iso(-1), title: "Follow up — Rania" },
    { id: "theirs", type: "renewal_call", status: "open", ownerId: "sales-b", ownerName: "Sales B", memberId: "m1", dueAt: iso(2), title: "Call Rania about renewal" },
    { id: "done", type: "follow_up", status: "completed", ownerId: "sales-a", ownerName: "Sales A", memberId: "m1", dueAt: iso(-3), title: "Old" },
  ];
  const base = { subject: "member" as const, subjectId: "m1", today: TODAY, tasks, actorId: "sales-a", canManageTeam: false, isDue: (dueAt: string) => dueAt.slice(0, 10) <= TODAY };

  it("moves the actor's own follow-up to the suggested date and leaves someone else's task alone", () => {
    const preview = previewContactConsequences({ ...base, outcome: "no_answer", followUpTouched: false });
    expect(preview.followUp).toEqual({ kind: "date", date: "2026-09-23", source: "suggested" });
    expect(preview.tasks).toEqual([
      { effect: "reschedule", task: expect.objectContaining({ id: "mine" }), to: "2026-09-23" },
      { effect: "kept", task: expect.objectContaining({ id: "theirs" }), why: "other_owner" },
    ]);
    expect(preview.createsTask).toBe(false);
  });

  it("keeps a typed date, closes due tasks on a terminal outcome and previews the lead stage the form would send", () => {
    const typed = previewContactConsequences({ ...base, outcome: "answered_call_back", followUpTouched: true, typedFollowUpDate: "2026-09-30" });
    expect(typed.followUp).toEqual({ kind: "date", date: "2026-09-30", source: "typed" });
    const terminal = previewContactConsequences({ ...base, outcome: "answered_not_interested", followUpTouched: false });
    expect(terminal.followUp).toEqual({ kind: "none" });
    expect(terminal.tasks).toEqual([{ effect: "complete", task: expect.objectContaining({ id: "mine" }) }, { effect: "kept", task: expect.objectContaining({ id: "theirs" }), why: "other_owner" }]);
    const lead = previewContactConsequences({ ...base, subject: "lead", subjectId: "l1", tasks: [], outcome: "answered_interested", followUpTouched: false, currentStage: "new", stageAfter: () => "contacted" });
    expect(lead.stage).toEqual({ from: "new", to: "contacted" });
    expect(lead.createsTask).toBe(false);
  });

  it("creates a member follow-up only when no task can absorb the next date", () => {
    const preview = previewContactConsequences({ ...base, tasks: [], outcome: "answered_call_back", followUpTouched: false });
    expect(preview.createsTask).toBe(true);
    const manager = previewContactConsequences({ ...base, canManageTeam: true, outcome: "no_answer", followUpTouched: false });
    expect(manager.tasks.map((effect) => [effect.task.id, effect.effect])).toEqual([["theirs", "reschedule"], ["mine", "complete"]]);
  });
});

function contextInput(overrides: Partial<FollowUpContextInput> = {}): FollowUpContextInput {
  return {
    member: { id: "m1", fullName: "Rania Odeh", phone: "+962790000001", preferredLanguage: "en", status: "active", consent: { marketingPreference: { optedIn: true, status: "explicit_opt_in", source: "member_selected" } } },
    memberships: [{ id: "t1", planName: "Monthly", branchName: "Main", startDate: "2026-09-01", endDate: "2026-10-01", status: "active", outstandingMinor: 0 }],
    timeline: [],
    tasks: [],
    deliveries: [],
    quietHours: { start: "22:00", end: "08:00" },
    deliveryMode: "sandbox",
    currency: "JOD",
    timezone: "Asia/Amman",
    today: TODAY,
    now: NOW,
    ...overrides,
  };
}

describe("recorded follow-up context", () => {
  it("tags recorded callbacks, travel and complaints only when the record says so", () => {
    expect(followUpTopicsIn("Asked us to call back after Eid, travelling until then")).toEqual(["callback", "travel"]);
    expect(followUpTopicsIn("Complained that the showers were dirty")).toEqual(["complaint"]);
    expect(followUpTopicsIn("Happy with the classes")).toEqual([]);
    const callback = classifyFollowUpEvidence({ id: "e1", type: "call_attempt", title: "Contact — answered call back", occurredAt: iso(-2), meta: { outcome: "answered_call_back" } })!;
    expect(callback).toMatchObject({ kind: "contact", outcomeLabel: "Asked for a callback", topics: ["callback"], flags: ["callback_requested", "reached"] });
    expect(classifyFollowUpEvidence({ id: "e2", type: "message", title: "WhatsApp renewal reminder failed", occurredAt: iso(-1), meta: { deliveryState: "failed" } })).toMatchObject({ kind: "message", flags: ["not_sent"] });
    expect(classifyFollowUpEvidence({ id: "e3", type: "task_completed", title: "Task completed", occurredAt: iso(-1) })).toBeUndefined();
  });

  it("reads consent deterministically, never infers it, and names why reminders are suppressed", () => {
    const optedOut = buildMemberFollowUpContext(contextInput({ member: { ...contextInput().member, consent: { marketingPreference: { optedIn: false, status: "explicit_opt_out", source: "member_selected" } } } }));
    expect(optedOut.messaging).toMatchObject({ consent: "explicit_opt_out", channelOptedOut: true, suppressionReason: "Recipient opted out of renewal messages" });
    expect(eligibleReminderTemplates(optedOut)).toEqual([]);
    const legacy = buildMemberFollowUpContext(contextInput({ member: { ...contextInput().member, consent: { marketingOptIn: true } } }));
    expect(legacy.messaging).toMatchObject({ consent: "unknown", suppressionReason: "Explicit consent is required for renewal messages" });
    const optedIn = buildMemberFollowUpContext(contextInput());
    expect(optedIn.messaging.suppressionReason).toBeUndefined();
    expect(optedIn.renewal).toMatchObject({ membershipId: "t1", daysUntilExpiry: 10, journeyStopReason: undefined, hasSuccessor: false });
    expect(optedIn.phone).toBe("+962790000001");
  });

  it("keeps quiet hours, journey stops and delivery wording truthful", () => {
    const night = buildMemberFollowUpContext(contextInput({ now: Date.UTC(2026, 8, 21, 20, 30) }));
    expect(night.messaging.quietHours).toMatchObject({ activeNow: true, resumesAt: expect.stringContaining("2026-09-22T05:00") });
    const frozen = buildMemberFollowUpContext(contextInput({ memberships: [{ ...contextInput().memberships[0]!, activeFreeze: { status: "active", startDate: "2026-09-15", endDate: "2026-09-30" } }] }));
    expect(frozen.renewal).toMatchObject({ journeyStopReason: "membership_frozen", journeyStopLabel: "membership frozen" });
    const renewed = buildMemberFollowUpContext(contextInput({ memberships: [{ ...contextInput().memberships[0]! }, { id: "t2", planName: "Monthly", branchName: "Main", startDate: "2026-10-02", endDate: "2026-11-01", status: "scheduled", previousMembershipId: "t1", outstandingMinor: 0 }] }));
    expect(renewed.renewal).toMatchObject({ membershipId: "t2", hasSuccessor: false, journeyStopReason: "membership_not_started" });
    const labels = (["queued", "sent", "sandboxed", "suppressed", "deferred"] as const).map((status) => describeFollowUpDelivery({ id: status, checkpointKey: "7_day", channel: "whatsapp", status, attempts: 0, updatedAt: NOW, membershipId: "t1", suppressionReason: "Explicit consent is required for renewal messages", deferredUntil: NOW + 3_600_000 }, "Asia/Amman").label);
    expect(labels).toEqual([
      "WhatsApp reminder (7 days before) queued · not delivered",
      "WhatsApp reminder (7 days before) accepted by the provider · delivery not confirmed",
      "WhatsApp reminder (7 days before) prepared in sandbox · not sent",
      "WhatsApp reminder (7 days before) not sent",
      "WhatsApp reminder (7 days before) deferred · quiet hours",
    ]);
    expect(labels.join(" ")).not.toContain("delivered ·");
  });

  it("carries an agreed callback with the open task that holds its date, and marks it future or past", () => {
    const timeline = [{ id: "e-cb", type: "call_attempt", title: "Contact — answered call back", body: "Call after Thursday", occurredAt: iso(-2), meta: { outcome: "answered_call_back" } }];
    const future = buildMemberFollowUpContext(contextInput({ timeline, tasks: [{ id: "task-cb", type: "follow_up", title: "Follow up — Rania Odeh · after asked for a callback", ownerName: "Sales A", dueAt: iso(3), priority: "normal", status: "open", mine: true }] }));
    expect(future.callback).toEqual({ evidenceId: "e-cb", requestedAt: iso(-2), taskId: "task-cb", dueAt: iso(3), future: true });
    const past = buildMemberFollowUpContext(contextInput({ timeline, tasks: [] }));
    expect(past.callback).toEqual({ evidenceId: "e-cb", requestedAt: iso(-2), taskId: undefined, dueAt: undefined, future: false });
    expect(future.lastContact).toMatchObject({ evidenceId: "e-cb", outcome: "answered_call_back", label: "Asked for a callback" });
  });
});

describe("renewal context and reminder suggestions", () => {
  it("offers approved templates that fit the timing and describes unavailable cases", () => {
    const plain = buildMemberFollowUpContext(contextInput());
    expect(eligibleReminderTemplates(plain).map((template) => template.key)).toEqual(["renewal_7d"]);
    expect(eligibleReminderTemplates(buildMemberFollowUpContext(contextInput({ memberships: [{ ...contextInput().memberships[0]!, endDate: "2026-09-23" }] }))).map((template) => template.key)).toEqual(["renewal_3d"]);
    expect(eligibleReminderTemplates(buildMemberFollowUpContext(contextInput({ memberships: [{ ...contextInput().memberships[0]!, endDate: TODAY }] }))).map((template) => template.key)).toEqual(["renewal_today"]);
    expect(eligibleReminderTemplates(buildMemberFollowUpContext(contextInput({ memberships: [{ ...contextInput().memberships[0]!, startDate: "2026-08-01", endDate: "2026-09-16" }] }))).map((template) => template.key)).toEqual(["renewal_expired_3d"]);
    expect(eligibleReminderTemplates(buildMemberFollowUpContext(contextInput({ memberships: [{ ...contextInput().memberships[0]!, startDate: "2026-05-01", endDate: "2026-06-01" }] })))).toEqual([]);

    const optedOut = buildMemberFollowUpContext(contextInput({ member: { ...contextInput().member, consent: { marketingPreference: { optedIn: false, status: "explicit_opt_out", source: "member_selected" } } } }));
    expect(reminderTemplateUnavailableReason(optedOut)).toContain("opted out");
    expect(reminderTemplateUnavailableReason(plain)).toBeUndefined();
    expect(reminderTemplateUnavailableReason(buildMemberFollowUpContext(contextInput({ memberships: [{ ...contextInput().memberships[0]!, startDate: "2026-05-01", endDate: "2026-06-01" }] })))).toContain("timing");
  });

  it("renders the template in the member's language from the record, never inventing a value", () => {
    const arabic = buildMemberFollowUpContext(contextInput({ member: { ...contextInput().member, fullName: "رانيا عودة", preferredLanguage: "ar" } }));
    const template = eligibleReminderTemplates(arabic)[0]!;
    const body = renderReminderForMember(template, arabic, "Forge Gym");
    expect(body).toContain("مرحبًا رانيا");
    expect(body).toContain("1 تشرين الأول 2026");
    expect(body).toContain("Forge Gym");
    expect(body).not.toContain("{{");
  });
});
