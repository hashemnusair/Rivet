import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-follow-up-${name}` });

const ORG = "loop-org";
const BRANCH = "loop-branch";
const hourAgo = () => new Date(Date.now() - 3_600_000).toISOString();
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: ORG, name: "Loop Gym", slug: "loop-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: BRANCH, name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const sales = await ctx.db.insert("users", { publicId: "loop-sales", authSubject: "clerk-loop-sales", email: "sales@loop.example", fullName: "Loop Sales", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: sales, role: "sales", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    const otherSales = await ctx.db.insert("users", { publicId: "loop-other-sales", authSubject: "clerk-loop-other-sales", email: "other@loop.example", fullName: "Other Sales", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: otherSales, role: "sales", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    const manager = await ctx.db.insert("users", { publicId: "loop-manager", authSubject: "clerk-loop-manager", email: "manager@loop.example", fullName: "Loop Manager", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: manager, role: "manager", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    const receptionist = await ctx.db.insert("users", { publicId: "loop-reception", authSubject: "clerk-loop-reception", email: "desk@loop.example", fullName: "Loop Desk", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: receptionist, role: "receptionist", branchIds: [branch], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    const insertRecord = async (entityType: string, publicId: string, value: Record<string, unknown>, keys: { memberPublicId?: string; leadPublicId?: string } = {}) => ctx.db.insert("domainRecords", { organizationId: organization, entityType, publicId, branchId: branch, createdAt: now, updatedAt: now, data: { id: publicId, ...value }, ...keys });
    await insertRecord("settings", "settings", { operationalPolicies: {} });
    await insertRecord("member", "loop-member", { organizationId: ORG, memberNumber: "MAIN-2001", fullName: "Rania Odeh", phone: "+962790002001", homeBranchId: BRANCH, status: "active", tags: [], preferredLanguage: "en", marketingOptIn: true, assignedSalespersonId: "loop-sales", createdAt: new Date(now).toISOString() });
    await insertRecord("task", "loop-renewal-call", { organizationId: ORG, type: "renewal_call", title: "Call Rania Odeh about membership renewal", ownerId: "loop-sales", dueAt: hourAgo(), priority: "high", status: "open", memberId: "loop-member", subjectName: "Rania Odeh", createdById: "loop-manager", createdAt: new Date(now).toISOString() }, { memberPublicId: "loop-member" });
    await insertRecord("task", "loop-other-owner-task", { organizationId: ORG, type: "follow_up", title: "Follow up — Rania Odeh", ownerId: "loop-other-sales", dueAt: hourAgo(), priority: "normal", status: "open", memberId: "loop-member", subjectName: "Rania Odeh", createdById: "loop-other-sales", createdAt: new Date(now).toISOString() }, { memberPublicId: "loop-member" });
    await insertRecord("lead", "loop-lead-due", { organizationId: ORG, branchId: BRANCH, fullName: "Due Lead", phone: "+962790002002", stage: "contacted", source: "instagram", ownerId: "loop-sales", nextFollowUpAt: hourAgo(), createdAt: new Date(now - 86_400_000).toISOString(), updatedAt: new Date(now).toISOString() });
    await insertRecord("timeline", "loop-lead-due-contact", { organizationId: ORG, leadId: "loop-lead-due", type: "call_attempt", title: "Call — no answer", actorId: "loop-sales", actorName: "Loop Sales", occurredAt: new Date(now - 7_200_000).toISOString(), meta: { outcome: "no_answer" } }, { leadPublicId: "loop-lead-due" });
    await insertRecord("lead", "loop-lead-tasked", { organizationId: ORG, branchId: BRANCH, fullName: "Tasked Lead", phone: "+962790002003", stage: "trial_booked", source: "walk_in", ownerId: "loop-sales", nextFollowUpAt: hourAgo(), createdAt: new Date(now - 86_400_000).toISOString(), updatedAt: new Date(now).toISOString() });
    await insertRecord("task", "loop-lead-task", { organizationId: ORG, type: "follow_up", title: "Follow up — Tasked Lead", ownerId: "loop-sales", dueAt: hourAgo(), priority: "normal", status: "open", leadId: "loop-lead-tasked", subjectName: "Tasked Lead", createdById: "loop-sales", createdAt: new Date(now).toISOString() }, { leadPublicId: "loop-lead-tasked" });
    await insertRecord("lead", "loop-lead-someone-else", { organizationId: ORG, branchId: BRANCH, fullName: "Other Owner Lead", phone: "+962790002004", stage: "new", source: "walk_in", ownerId: "loop-other-sales", nextFollowUpAt: hourAgo(), createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() });
  });
}

type TaskRow = { id: string; type: string; status: string; dueAt: string; title: string; outcome?: string; ownerId?: string };
async function tasksFor(actor: ReturnType<TestConvex<typeof schema>["withIdentity"]>, filter: Record<string, unknown>) {
  return (await actor.query(api.domain.query, operation("tasks.list", { pageSize: 100, ...filter }))) as { items: TaskRow[]; totalItems: number };
}

describe("member contact resolves the follow-up it fulfils", () => {
  it("moves the actor's open follow-up to the next date, closes only their own duplicates, and never stacks tasks", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-loop-sales" });
    const next = inDays(2);

    await sales.mutation(api.domain.mutate, operation("members.contact", { memberId: "loop-member", outcome: "no_answer", nextFollowUpAt: next }));

    const open = await tasksFor(sales, { status: "open", memberId: "loop-member" });
    expect(open.items.map((task) => [task.id, task.dueAt])).toEqual(expect.arrayContaining([["loop-renewal-call", next], ["loop-other-owner-task", expect.any(String)]]));
    expect(open.items).toHaveLength(2);
    expect(open.items.find((task) => task.id === "loop-renewal-call")?.title).toBe("Call Rania Odeh about membership renewal");

    await sales.mutation(api.domain.mutate, operation("members.contact", { memberId: "loop-member", outcome: "answered_call_back", nextFollowUpAt: inDays(4) }));
    const still = await tasksFor(sales, { status: "open", memberId: "loop-member" });
    expect(still.items).toHaveLength(2);
    expect(still.items.find((task) => task.id === "loop-renewal-call")?.dueAt).toBe(inDays(4).slice(0, 13) + still.items.find((task) => task.id === "loop-renewal-call")!.dueAt.slice(13));
  });

  it("closes the actor's open follow-ups with the outcome when the contact ends the thread, on the timeline too", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-loop-sales" });

    await sales.mutation(api.domain.mutate, operation("members.contact", { memberId: "loop-member", outcome: "answered_not_interested", notes: "Moving abroad" }));

    const open = await tasksFor(sales, { status: "open", memberId: "loop-member" });
    expect(open.items.map((task) => task.id)).toEqual(["loop-other-owner-task"]);
    const completed = await tasksFor(sales, { status: "completed", memberId: "loop-member" });
    expect(completed.items).toEqual([expect.objectContaining({ id: "loop-renewal-call", outcome: "Contact logged — Not interested" })]);
    const member = await sales.query(api.domain.query, operation("members.get", { memberId: "loop-member" })) as { id: string };
    expect(member.id).toBe("loop-member");
    const timeline = await sales.query(api.domain.query, operation("members.timeline", { memberId: "loop-member", pageSize: 20 })) as { items: Array<{ type: string; body?: string }> };
    expect(timeline.items).toContainEqual(expect.objectContaining({ type: "task_completed", body: "Contact logged — Not interested" }));
  });

  it("lets a manager resolve any owner's follow-up and creates one only when none exists", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const manager = t.withIdentity({ subject: "clerk-loop-manager" });
    const next = inDays(1);

    await manager.mutation(api.domain.mutate, operation("members.contact", { memberId: "loop-member", outcome: "no_answer", nextFollowUpAt: next }));
    const open = await tasksFor(manager, { status: "open", memberId: "loop-member" });
    expect(open.items).toHaveLength(1);
    expect(open.items[0]?.dueAt).toBe(next);

    await manager.mutation(api.domain.mutate, operation("members.contact", { memberId: "loop-member", outcome: "wrong_number" }));
    expect((await tasksFor(manager, { status: "open", memberId: "loop-member" })).items).toEqual([]);

    await manager.mutation(api.domain.mutate, operation("members.contact", { memberId: "loop-member", outcome: "answered_call_back", nextFollowUpAt: next }));
    const created = await tasksFor(manager, { status: "open", memberId: "loop-member" });
    expect(created.items).toEqual([expect.objectContaining({ type: "follow_up", title: "Follow up — Rania Odeh · after asked for a callback", dueAt: next, ownerId: "loop-manager" })]);
  });

  it("keeps the member-contact permission boundary: reception cannot log, sales can", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const desk = t.withIdentity({ subject: "clerk-loop-reception" });
    await expect(desk.mutation(api.domain.mutate, operation("members.contact", { memberId: "loop-member", outcome: "no_answer" }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
    const sales = t.withIdentity({ subject: "clerk-loop-sales" });
    await expect(sales.mutation(api.domain.mutate, operation("members.contact", { memberId: "loop-member", outcome: "no_answer" }))).resolves.toMatchObject({ type: "call_attempt" });
  });
});

describe("Today carries lead follow-ups and the person behind each task", () => {
  it("shows a due lead follow-up once, only to its owner or a manager, with the last outcome and a direct contact link", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-loop-sales" });
    const dashboard = await sales.query(api.domain.query, operation("dashboard", { branchId: BRANCH })) as { todayQueue: { items: Array<Record<string, unknown>> } };
    const items = dashboard.todayQueue.items;

    expect(items).toContainEqual(expect.objectContaining({ id: "lead-follow-up:loop-lead-due", kind: "follow_up", overdue: true, detail: "Lead · last contact: No answer", subject: { kind: "lead", id: "loop-lead-due" }, href: "/crm/leads/loop-lead-due?action=contact", action: { kind: "navigate", label: "Log contact" } }));
    expect(items.some((item) => item.id === "lead-follow-up:loop-lead-tasked")).toBe(false);
    expect(items).toContainEqual(expect.objectContaining({ id: "task:loop-lead-task", subject: { kind: "lead", id: "loop-lead-tasked" }, action: expect.objectContaining({ kind: "complete_task" }) }));
    expect(items).toContainEqual(expect.objectContaining({ id: "task:loop-renewal-call", subject: { kind: "member", id: "loop-member" } }));
    expect(items.some((item) => item.id === "lead-follow-up:loop-lead-someone-else")).toBe(false);

    const manager = t.withIdentity({ subject: "clerk-loop-manager" });
    const managerView = await manager.query(api.domain.query, operation("dashboard", { branchId: BRANCH })) as { todayQueue: { items: Array<Record<string, unknown>> } };
    expect(managerView.todayQueue.items.some((item) => item.id === "lead-follow-up:loop-lead-someone-else")).toBe(true);
  });

  it("filters the task list by member or lead so a record never lists the whole gym's work", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const manager = t.withIdentity({ subject: "clerk-loop-manager" });
    const all = await tasksFor(manager, { status: "open" });
    const member = await tasksFor(manager, { status: "open", memberId: "loop-member" });
    const lead = await tasksFor(manager, { status: "open", leadId: "loop-lead-tasked" });
    expect(all.totalItems).toBe(3);
    expect(member.items.map((task) => task.id).sort()).toEqual(["loop-other-owner-task", "loop-renewal-call"]);
    expect(lead.items.map((task) => task.id)).toEqual(["loop-lead-task"]);
  });
});

describe("closing a lead from its record", () => {
  it("requires a real reason, clears the follow-up, cancels open lead tasks and writes the lead.lost audit fact", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-loop-sales" });

    await expect(sales.mutation(api.domain.mutate, operation("leads.update", { leadId: "loop-lead-tasked", stage: "lost", lostReason: "no" }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) });
    const closed = await sales.mutation(api.domain.mutate, operation("leads.update", { leadId: "loop-lead-tasked", stage: "lost", lostReason: "Price did not work" })) as { stage: string; lostReason?: string; nextFollowUpAt?: string };
    expect(closed).toMatchObject({ stage: "lost", lostReason: "Price did not work" });
    expect(closed.nextFollowUpAt).toBeUndefined();

    const manager = t.withIdentity({ subject: "clerk-loop-manager" });
    const openLeadTasks = await tasksFor(manager, { status: "open", leadId: "loop-lead-tasked" });
    expect(openLeadTasks.items).toEqual([]);
    const cancelled = await tasksFor(manager, { status: "cancelled", leadId: "loop-lead-tasked" });
    expect(cancelled.items).toEqual([expect.objectContaining({ id: "loop-lead-task", outcome: "Lead marked not sold: Price did not work" })]);
    const audit = await manager.query(api.domain.query, operation("audit.list", { category: "crm", entityId: "loop-lead-tasked", pageSize: 20 })) as { items: Array<{ action: string; reason?: string }> };
    expect(audit.items).toContainEqual(expect.objectContaining({ action: "lead.lost", reason: "Price did not work" }));
  });

  it("does not move a booked trial backwards when the pipeline records no answer without a stage", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-loop-sales" });
    const lead = await sales.mutation(api.domain.mutate, operation("leads.contact", { leadId: "loop-lead-tasked", outcome: "no_answer", notes: "Moved to Did not answer from the pipeline." })) as { stage: string; lastContactOutcome?: string };
    expect(lead).toMatchObject({ stage: "trial_booked", lastContactOutcome: "no_answer" });
  });
});
