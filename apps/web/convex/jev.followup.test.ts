import { convexTest, type TestConvex } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { JevJudgeResult } from "./jevRegistry";
import type { MemberFollowUpContext } from "./followupAssist";
import schema from "./schema";

declare global {
  interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; }
}

const modules = import.meta.glob("./**/*.ts");
const ORG = "fu-org";
const BRANCH = "fu-branch";
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const date = (days: number) => inDays(days).slice(0, 10);
const scoped = <Extra extends Record<string, unknown> = Record<never, never>>(organizationId: string, extra?: Extra) => ({ organizationId, correlationId: `cor-fu-${organizationId}`, ...(extra ?? ({} as Extra)) });
const ask = (question: string, subject: Record<string, unknown>) => scoped(ORG, { questionKey: question, subject });
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-fu-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };
const offered = (result: JevJudgeResult): string[] => (result.status === "ready" && result.judgment.kind === "choice" ? Object.keys(result.judgment.probabilities) : []);
const choice = (result: JevJudgeResult): string | undefined => (result.status === "ready" && result.judgment.kind === "choice" ? result.judgment.choice : undefined);

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: ORG, name: "Follow-up Gym", slug: "fu-gym", status: "active", subscriptionPlan: "Pro", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: BRANCH, name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const user = async (publicId: string, fullName: string) => await ctx.db.insert("users", { publicId, authSubject: `clerk-${publicId}`, email: `${publicId}@example.com`, fullName, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const member = async (userId: Awaited<ReturnType<typeof user>>, role: "owner" | "sales" | "receptionist" | "manager", scope: "all" | "selected" = "selected") => ctx.db.insert("organizationMemberships", { organizationId: organization, userId, role, branchIds: [branch], branchScope: scope, active: true, createdAt: now, updatedAt: now });
    await member(await user("fu-owner", "Fu Owner"), "owner", "all");
    await member(await user("fu-sales", "Fu Sales"), "sales");
    await member(await user("fu-other", "Fu Other"), "sales");
    await member(await user("fu-reception", "Fu Reception"), "receptionist");
    const insert = async (entityType: string, publicId: string, value: Record<string, unknown>, keys: { memberPublicId?: string; leadPublicId?: string } = {}) => ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, branchId: branch, createdAt: now, updatedAt: now, data: { id: publicId, ...value }, ...keys });
    await insert("settings", "settings", { operationalPolicies: {}, notifications: { quietHoursStart: "22:00", quietHoursEnd: "08:00", automationDeliveryMode: "sandbox" } });
    await insert("plan", "fu-plan", { organizationId: ORG, name: "Monthly", code: "M1", kind: "time", durationDays: 30, basePrice: { amount: 40_000, currency: "JOD" }, branchAccess: "all", branchIds: [], status: "active" });
    const person = async (publicId: string, fullName: string, consent: Record<string, unknown>) => insert("member", publicId, { organizationId: ORG, memberNumber: publicId.toUpperCase(), fullName, phone: "+962790001000", homeBranchId: BRANCH, status: "active", tags: [], preferredLanguage: "en", createdAt: new Date(now).toISOString(), ...consent });
    await person("fu-member", "Rania Odeh", { marketingOptIn: true, marketingPreference: { optedIn: true, status: "explicit_opt_in", source: "member_selected" } });
    await person("fu-optout", "Dana Khalil", { marketingOptIn: false, marketingPreference: { optedIn: false, status: "explicit_opt_out", source: "member_selected" } });
    await person("fu-plain", "Omar Nassar", { marketingOptIn: true, marketingPreference: { optedIn: true, status: "explicit_opt_in", source: "staff_selected" } });
    for (const [term, memberId] of [["fu-term", "fu-member"], ["fu-term-out", "fu-optout"], ["fu-term-plain", "fu-plain"]] as const) {
      await insert("membership", term, { organizationId: ORG, memberId, planId: "fu-plan", homeBranchId: BRANCH, startDate: date(-20), endDate: date(10), salePrice: { amount: 40_000, currency: "JOD" }, discount: { amount: 0, currency: "JOD" }, discountApprovalStatus: "none", soldById: "fu-sales", frozenDaysUsed: 0, freezes: [], adjustments: [], createdAt: new Date(now).toISOString() }, { memberPublicId: memberId });
    }
    await insert("timeline", "fu-callback", { organizationId: ORG, memberId: "fu-member", type: "call_attempt", title: "Contact — answered call back", body: "Asked us to call after Thursday.", actorId: "fu-sales", actorName: "Fu Sales", occurredAt: inDays(-2), meta: { outcome: "answered_call_back" } }, { memberPublicId: "fu-member" });
    await insert("timeline", "fu-note", { organizationId: ORG, memberId: "fu-member", type: "note", title: "Note added", body: "Complained that the showers were dirty last week.", actorId: "fu-reception", actorName: "Fu Reception", occurredAt: inDays(-12) }, { memberPublicId: "fu-member" });
    await insert("task", "fu-renewal-call", { organizationId: ORG, type: "renewal_call", title: "Call Rania Odeh about membership renewal", ownerId: "fu-sales", ownerName: "Fu Sales", dueAt: inDays(1), priority: "high", status: "open", memberId: "fu-member", subjectName: "Rania Odeh", createdById: "fu-owner", createdAt: new Date(now).toISOString() }, { memberPublicId: "fu-member" });
    await insert("task", "fu-other-task", { organizationId: ORG, type: "follow_up", title: "Follow up — Rania Odeh", ownerId: "fu-other", ownerName: "Fu Other", dueAt: inDays(3), priority: "normal", status: "open", memberId: "fu-member", subjectName: "Rania Odeh", createdById: "fu-other", createdAt: new Date(now).toISOString() }, { memberPublicId: "fu-member" });
    await insert("task", "fu-optout-task", { organizationId: ORG, type: "general", title: "Return locker key", ownerId: "fu-reception", ownerName: "Fu Reception", dueAt: inDays(2), priority: "normal", status: "open", memberId: "fu-optout", subjectName: "Dana Khalil", createdById: "fu-reception", createdAt: new Date(now).toISOString() }, { memberPublicId: "fu-optout" });
    await insert("lead", "fu-lead", { organizationId: ORG, branchId: BRANCH, fullName: "Lead Person", phone: "+962790002000", stage: "contacted", source: "walk_in", ownerId: "fu-sales", createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
    await ctx.db.insert("renewalDeliveries", { publicId: "fu-delivery", organizationId: organization, branchId: branch, membershipPublicId: "fu-term", membershipEndDate: date(10), memberPublicId: "fu-member", checkpointDaysBefore: 7, checkpointKey: "7_day", channel: "whatsapp", templateVersion: "renewal-7-day-v1", policyVersion: "renewal-policy-v1", dedupeKey: "fu-dedupe", recipientReference: "fu-member", recipientPhone: "+962790001000", language: "en", consentStatus: "explicit_opt_in", channelOptedOut: false, status: "queued", nextAttemptAt: now, attempts: [], createdAt: now, updatedAt: now });

    const foreign = await ctx.db.insert("organizations", { publicId: "fu-org-b", name: "Other Gym", slug: "fu-other-gym", status: "active", subscriptionPlan: "Pro", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const foreignBranch = await ctx.db.insert("branches", { organizationId: foreign, publicId: "fu-branch-b", name: "B", code: "B", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: foreign, entityType: "member", publicId: "fu-member-b", branchId: foreignBranch, memberPublicId: "fu-member-b", createdAt: now, updatedAt: now, data: { id: "fu-member-b", organizationId: "fu-org-b", memberNumber: "B-1", fullName: "Foreign Member", phone: "+962790003000", homeBranchId: "fu-branch-b", status: "active", tags: [], preferredLanguage: "en", createdAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: foreign, entityType: "task", publicId: "fu-task-b", branchId: foreignBranch, memberPublicId: "fu-member-b", createdAt: now, updatedAt: now, data: { id: "fu-task-b", organizationId: "fu-org-b", type: "follow_up", title: "Foreign task", ownerId: "x", dueAt: inDays(1), priority: "normal", status: "open", memberId: "fu-member-b", subjectName: "Foreign Member", createdById: "x", createdAt: new Date(now).toISOString() } });
  });
}

async function harness() {
  vi.stubEnv("RIVET_JEV_MODE", "fixture");
  const t = convexTest(schema, modules);
  await seed(t);
  const owner = t.withIdentity({ subject: "clerk-fu-owner" });
  const sales = t.withIdentity({ subject: "clerk-fu-sales" });
  const reception = t.withIdentity({ subject: "clerk-fu-reception" });
  await owner.mutation(api.jev.updateTenantPreference, scoped(ORG, { enabled: true }));
  return { t, owner, sales, reception };
}

afterEach(() => vi.unstubAllEnvs());

describe("contact note review on the server", () => {
  it("offers the subject's own outcomes, reads a third-party note as such, and needs the contact permission", async () => {
    const { sales, reception } = await harness();
    const note = "Spoke to her brother, he said she is travelling until Thursday and wants us to call back";
    const member = await sales.action(api.jevInference.judge, ask("followup.contact_outcome", { subject: "member", memberId: "fu-member", note })) as JevJudgeResult;
    expect(member).toMatchObject({ status: "ready", source: "fixture", judgment: { kind: "choice", choice: "third_party" } });
    expect(offered(member)).toEqual(expect.arrayContaining(["no_answer", "answered_call_back", "third_party", "contradictory", "unclear"]));
    expect(offered(member)).not.toContain("trial_booked");
    const lead = await sales.action(api.jevInference.judge, ask("followup.contact_outcome", { subject: "lead", leadId: "fu-lead", note: "Trial booked for Monday at six" })) as JevJudgeResult;
    expect(choice(lead)).toBe("trial_booked");
    expect(offered(lead)).toContain("trial_completed");
    await expectCode(reception.action(api.jevInference.judge, ask("followup.contact_outcome", { subject: "member", memberId: "fu-member", note })), "FORBIDDEN");
    await expectCode(sales.action(api.jevInference.judge, ask("followup.contact_outcome", { subject: "member", memberId: "fu-member", note: "ok" })), "VALIDATION_ERROR");
    await expectCode(sales.action(api.jevInference.judge, ask("followup.contact_outcome", { subject: "member", memberId: "fu-member-b", note })), "NOT_FOUND");
  });
});

describe("related open work on the server", () => {
  it("offers the person's open tasks with their owners and follows an ownership change instead of the cache", async () => {
    const { t, sales } = await harness();
    const draft = { subject: "member", memberId: "fu-member", type: "renewal_call", title: "Renewal call — Rania Odeh", dueDate: date(2), ownerName: "Fu Sales" };
    const first = await sales.action(api.jevInference.judge, ask("followup.related_task", draft)) as JevJudgeResult;
    expect(first).toMatchObject({ status: "ready", source: "fixture", judgment: { kind: "choice", choice: "fu-renewal-call" } });
    expect([...offered(first)].sort()).toEqual(["fu-other-task", "fu-renewal-call", "none"]);
    expect(await sales.action(api.jevInference.judge, ask("followup.related_task", draft))).toMatchObject({ status: "ready", source: "cache" });
    await t.run(async (ctx) => {
      const task = (await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "task").eq("publicId", "fu-renewal-call")).unique())!;
      await ctx.db.patch(task._id, { data: { ...(task.data as Record<string, unknown>), ownerId: "fu-other" }, updatedAt: Date.now() });
    });
    const after = await sales.action(api.jevInference.judge, ask("followup.related_task", draft)) as JevJudgeResult;
    expect(after).toMatchObject({ status: "ready", source: "fixture", judgment: { kind: "choice", choice: "fu-renewal-call" } });
    const unrelated = await sales.action(api.jevInference.judge, ask("followup.related_task", { ...draft, type: "general", title: "Fix the locker key" })) as JevJudgeResult;
    expect(choice(unrelated)).toBe("none");
    await expectCode(sales.action(api.jevInference.judge, ask("followup.related_task", { ...draft, title: "" })), "VALIDATION_ERROR");
    await expectCode(sales.action(api.jevInference.judge, ask("followup.related_task", { ...draft, memberId: "fu-member-b" })), "NOT_FOUND");
  });
});

describe("renewal conversation context on the server", () => {
  it("offers only recorded evidence, lifts the agreed callback, and keeps template gates deterministic", async () => {
    const { sales, reception } = await harness();
    const context = await reception.action(api.jevInference.judge, ask("followup.renewal_context", { memberId: "fu-member" })) as JevJudgeResult;
    expect([...offered(context)].sort()).toEqual(["fu-callback", "fu-note", "none"]);
    expect(choice(context)).toBe("fu-callback");

    const callbackAgreed = await sales.action(api.jevInference.judge, ask("followup.reminder_template", { memberId: "fu-member" })) as JevJudgeResult;
    expect([...offered(callbackAgreed)].sort()).toEqual(["renewal_7d", "staff_review"]);
    expect(choice(callbackAgreed)).toBe("staff_review");

    const plain = await sales.action(api.jevInference.judge, ask("followup.reminder_template", { memberId: "fu-plain" })) as JevJudgeResult;
    expect(choice(plain)).toBe("renewal_7d");

    // An explicit opt-out is refused before any question exists; nothing is ever offered for that member.
    await expectCode(sales.action(api.jevInference.judge, ask("followup.reminder_template", { memberId: "fu-optout" })), "VALIDATION_ERROR");
    await expectCode(sales.action(api.jevInference.judge, ask("followup.renewal_context", { memberId: "fu-member-b" })), "NOT_FOUND");
  });
});

describe("reason checks on the server", () => {
  it("gates each check by the action's own permission and reads only the typed reason", async () => {
    const { owner, reception } = await harness();
    await expectCode(reception.action(api.jevInference.judge, ask("followup.reason_check", { action: "refund", reason: "customer request" })), "FORBIDDEN");
    const vague = await owner.action(api.jevInference.judge, ask("followup.reason_check", { action: "refund", reason: "customer request" })) as JevJudgeResult;
    expect(vague).toMatchObject({ status: "ready", judgment: { kind: "score", level: 1, levelCount: 4 } });
    const specific = await owner.action(api.jevInference.judge, ask("followup.reason_check", { action: "checkin_override", reason: "Paid at Abdoun branch this morning, receipt #4412 shown at the desk" })) as JevJudgeResult;
    expect(specific).toMatchObject({ status: "ready", judgment: { kind: "score", level: 3 } });
    await expectCode(owner.action(api.jevInference.judge, ask("followup.reason_check", { action: "delete_everything", reason: "because" })), "VALIDATION_ERROR");
    await expectCode(owner.action(api.jevInference.judge, ask("followup.reason_check", { action: "refund", reason: "  " })), "VALIDATION_ERROR");
  });
});

describe("the member follow-up context and the explicit task link", () => {
  it("reads consent, queued reminders and the agreed callback from records and words them truthfully", async () => {
    const { sales, reception } = await harness();
    const context = await sales.query(api.domain.query, operation("members.followup_context", { memberId: "fu-member" })) as MemberFollowUpContext;
    expect(context.messaging).toMatchObject({ consent: "explicit_opt_in", channelOptedOut: false, deliveryMode: "sandbox", quietHours: { start: "22:00", end: "08:00" } });
    expect(context.messaging.deliveries).toEqual([expect.objectContaining({ id: "fu-delivery", status: "queued", label: "WhatsApp reminder (7 days before) queued · not delivered" })]);
    expect(context.callback).toMatchObject({ evidenceId: "fu-callback", taskId: "fu-renewal-call", future: true });
    expect(context.evidence.map((item) => item.id)).toEqual(["fu-callback", "fu-note"]);
    expect(context.evidence[1]).toMatchObject({ kind: "note", topics: ["complaint"] });
    expect(context.relatedWork.map((task) => [task.id, task.ownerName, task.mine])).toEqual([["fu-renewal-call", "Fu Sales", true], ["fu-other-task", "Fu Other", false]]);
    expect(context.renewal).toMatchObject({ membershipId: "fu-term", planName: "Monthly", hasSuccessor: false });
    expect(context.renewal.journeyStopReason).toBeUndefined();
    expect(context.phone).toBe("+962790001000");
    const optedOut = await reception.query(api.domain.query, operation("members.followup_context", { memberId: "fu-optout" })) as MemberFollowUpContext;
    expect(optedOut.messaging).toMatchObject({ consent: "explicit_opt_out", channelOptedOut: true, suppressionReason: "Recipient opted out of renewal messages" });
    await expectCode(sales.query(api.domain.query, operation("members.followup_context", { memberId: "fu-member-b" })), "NOT_FOUND");
  });

  it("links a new task to an existing open task only when the link is explicit and about the same person", async () => {
    const { sales } = await harness();
    const input = { type: "follow_up", title: "Follow up — Rania Odeh about the PT package", ownerId: "fu-sales", dueAt: inDays(4), memberId: "fu-member" };
    const linked = await sales.mutation(api.domain.mutate, operation("tasks.create", { ...input, relatedTaskId: "fu-renewal-call" })) as { id: string; relatedTaskId?: string; relatedTaskTitle?: string; status: string };
    expect(linked).toMatchObject({ status: "open", relatedTaskId: "fu-renewal-call", relatedTaskTitle: "Call Rania Odeh about membership renewal" });
    const tasks = await sales.query(api.domain.query, operation("tasks.list", { status: "open", memberId: "fu-member", pageSize: 20 })) as { items: Array<{ id: string; status: string }> };
    // Linking never closes, merges or moves the existing task.
    expect(tasks.items.map((task) => task.id).sort()).toEqual(["fu-other-task", "fu-renewal-call", linked.id].sort());
    const timeline = await sales.query(api.domain.query, operation("members.timeline", { memberId: "fu-member", pageSize: 20 })) as { items: Array<{ type: string; body?: string }> };
    expect(timeline.items).toContainEqual(expect.objectContaining({ type: "task_created", body: "Follow-on to: Call Rania Odeh about membership renewal" }));
    const plain = await sales.mutation(api.domain.mutate, operation("tasks.create", input)) as { relatedTaskId?: string };
    expect(plain.relatedTaskId).toBeUndefined();
    await expectCode(sales.mutation(api.domain.mutate, operation("tasks.create", { ...input, relatedTaskId: "fu-optout-task" })), "VALIDATION_ERROR");
    await expectCode(sales.mutation(api.domain.mutate, operation("tasks.create", { ...input, relatedTaskId: "fu-task-b" })), "NOT_FOUND");
  });
});
