import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

// Thursday 22 October 2026, 11:30 in Amman.
const NOW = new Date("2026-10-22T08:30:00.000Z");
const ORG = "sales-org";
const MAIN = "sales-main";
const op = (operation: string, input: Record<string, unknown> = {}) => ({ operation, input, correlationId: `cor-sales-${operation}`, organizationId: ORG, activeBranchId: MAIN });

type Run = { id: string; status: string; counts: Record<string, number>; results: Array<{ kind: string; id: string; subjectName?: string }>; exclusions: Array<{ subjectName: string; reason: string }>; steps: Array<{ subjectName?: string; draft?: { language: string; text: string } }> };
type Task = { id: string; title: string; leadId?: string; ownerId: string; status: string; origin?: { runId: string } };

async function seed(t: TestConvex<typeof schema>): Promise<void> {
  await t.run(async (ctx) => {
    const now = NOW.getTime();
    const org = await ctx.db.insert("organizations", { publicId: ORG, name: "Sales Gym", slug: "sales-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const main = await ctx.db.insert("branches", { organizationId: org, publicId: MAIN, name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const person = async (publicId: string, role: "owner" | "sales" | "receptionist") => {
      const id = await ctx.db.insert("users", { publicId, authSubject: `clerk-${publicId}`, email: `${publicId}@sales.example`, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: org, userId: id, role, branchIds: [main], branchScope: role === "owner" ? "all" : "selected", active: true, createdAt: now, updatedAt: now });
    };
    await person("sales-owner", "owner");
    await person("sales-rep", "sales");
    await person("sales-desk", "receptionist");
    const rec = (entityType: string, publicId: string, value: Record<string, unknown>, leadPublicId?: string) => ctx.db.insert("domainRecords", { organizationId: org, entityType, publicId, branchId: main, ...(leadPublicId ? { leadPublicId } : {}), createdAt: now, updatedAt: now, data: { id: publicId, organizationId: ORG, ...value } });
    const lead = (publicId: string, value: Record<string, unknown>) => rec("lead", publicId, { branchId: MAIN, source: "instagram", createdAt: "2026-10-10T08:00:00.000Z", updatedAt: "2026-10-10T08:00:00.000Z", phone: "+962790000000", ...value }, publicId);
    await rec("settings", "settings", { operationalPolicies: {} });
    await lead("lead-due", { fullName: "Rania Saleh", stage: "contacted", ownerId: "sales-rep", nextFollowUpAt: "2026-10-21T15:00:00.000Z" });
    await lead("lead-new", { fullName: "Omar Khalil", stage: "new" });
    await lead("lead-called", { fullName: "Dana Issa", stage: "attempted", nextFollowUpAt: "2026-10-22T06:00:00.000Z" });
    await rec("timeline", "call-1", { type: "call_attempt", leadId: "lead-called", occurredAt: "2026-10-22T06:30:00.000Z", meta: { outcome: "no_answer" } }, "lead-called");
    await lead("lead-tasked", { fullName: "Faris Odeh", stage: "contacted", nextFollowUpAt: "2026-10-20T09:00:00.000Z" });
    await rec("task", "task-open", { type: "follow_up", title: "Call Faris back", ownerId: "sales-rep", dueAt: "2026-10-22T12:00:00.000Z", priority: "normal", status: "open", leadId: "lead-tasked", subjectName: "Faris Odeh", createdById: "sales-rep", createdAt: "2026-10-20T07:00:00.000Z" }, "lead-tasked");
    await lead("lead-nophone", { fullName: "Nour Hamdan", stage: "contacted", nextFollowUpAt: "2026-10-21T09:00:00.000Z", phone: "" });
    await lead("lead-lost", { fullName: "Sami Aziz", stage: "lost", nextFollowUpAt: "2026-10-19T09:00:00.000Z" });
    await lead("lead-later", { fullName: "Hala Nasser", stage: "contacted", nextFollowUpAt: "2026-10-25T09:00:00.000Z" });
    await ctx.db.insert("aiSettings", { organizationId: org, tenantMode: "execute", externalProcessing: false, capabilityModes: {}, revision: 1, updatedAt: now });
  });
}

async function prepare(t: TestConvex<typeof schema>, subject: string, requestKey: string, params: Record<string, unknown> = {}): Promise<Run> {
  const started = await t.withIdentity({ subject }).mutation(api.domain.mutate, op("ai.run.start", { playbook: "sales_followups", params, requestKey })) as Run;
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return await t.withIdentity({ subject }).query(api.domain.query, op("ai.run.get", { runId: started.id })) as Run;
}

async function openLeadTasks(t: TestConvex<typeof schema>): Promise<Task[]> {
  const page = await t.withIdentity({ subject: "clerk-sales-owner" }).query(api.domain.query, op("tasks.list", { status: "open", pageSize: 50 })) as { items: Task[] };
  return page.items.filter((task) => task.leadId);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("RIVET_AI_MODE", "fixture");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("lead follow-up preparation", () => {
  it("saves one call task per due lead, links existing work and says why the rest were left out", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const run = await prepare(t, "clerk-sales-owner", "sales-request-1");
    expect(run.status).toBe("completed");
    // Closed leads are not due at all; Sami's lost lead never enters the plan.
    expect(run.counts).toMatchObject({ considered: 5, created: 2, linked: 1, skipped: 2 });
    expect(Object.fromEntries(run.exclusions.map((item) => [item.subjectName, item.reason]))).toEqual({ "Dana Issa": "lead_contacted_recently", "Nour Hamdan": "no_phone" });
    const tasks = await openLeadTasks(t);
    const prepared = tasks.filter((task) => task.origin?.runId === run.id);
    expect(prepared.map((task) => task.title).sort()).toEqual(["Follow up with Omar Khalil", "Follow up with Rania Saleh"]);
    // The lead owner keeps their lead; an unassigned lead goes to the person who asked.
    expect(prepared.find((task) => task.leadId === "lead-due")?.ownerId).toBe("sales-rep");
    expect(prepared.find((task) => task.leadId === "lead-new")?.ownerId).toBe("sales-owner");
    // Drafts come from approved catalogue wording, never a price or an offer.
    const drafts = run.steps.filter((step) => step.draft).map((step) => step.draft!.text);
    expect(drafts).toHaveLength(2);
    expect(drafts.join(" ")).not.toMatch(/JOD|\d+%|discount/i);
    expect(tasks.some((task) => task.leadId === "lead-later")).toBe(false);
  });

  it("never duplicates a prepared call when asked again", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await prepare(t, "clerk-sales-owner", "sales-request-2");
    const again = await prepare(t, "clerk-sales-owner", "sales-request-3");
    expect(again.counts).toMatchObject({ created: 0, linked: 3 });
    expect((await openLeadTasks(t)).length).toBe(3);
  });

  it("assigns everything to the person who asked when they choose themselves", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const run = await prepare(t, "clerk-sales-owner", "sales-request-4", { owner: "me" });
    const prepared = (await openLeadTasks(t)).filter((task) => task.origin?.runId === run.id);
    expect(prepared.map((task) => task.ownerId)).toEqual(["sales-owner", "sales-owner"]);
  });

  it("is refused to staff who cannot write follow-ups", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await expect(t.withIdentity({ subject: "clerk-sales-desk" }).mutation(api.domain.mutate, op("ai.run.start", { playbook: "sales_followups", params: {}, requestKey: "sales-request-5" }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
  });

  it("shows the owner what was prepared and what people did with it, and nobody else", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const run = await prepare(t, "clerk-sales-owner", "sales-request-6");
    const prepared = (await openLeadTasks(t)).filter((task) => task.origin?.runId === run.id);
    // Someone finishes one of the prepared calls.
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("domainRecords").collect()).find((item) => item.publicId === prepared[0]!.id)!;
      await ctx.db.patch(row._id, { data: { ...(row.data as Record<string, unknown>), status: "completed" } });
    });
    const summary = await t.withIdentity({ subject: "clerk-sales-owner" }).query(api.domain.query, op("ai.outcomes.summary")) as { runs: { total: number; completed: number }; tasks: { prepared: number; done: number; open: number }; model: { liveCalls: number } };
    expect(summary.runs).toMatchObject({ total: 1, completed: 1 });
    // Linked work that was already open is not counted as prepared.
    expect(summary.tasks).toEqual({ prepared: 2, done: 1, open: 1, closedOther: 0 });
    expect(summary.model.liveCalls).toBe(0);
    await expect(t.withIdentity({ subject: "clerk-sales-rep" }).query(api.domain.query, op("ai.outcomes.summary"))).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
  });
});

