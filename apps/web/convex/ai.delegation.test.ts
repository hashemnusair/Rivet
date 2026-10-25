import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { delegatedRequest, requireActor } from "./security";
import { executeDomainMutation } from "./domain";
import { GLOBAL_CONTROL_KEY, memberCapabilityOn } from "./aiPolicy";
import { LEASE_MS } from "./aiPolicy";
import { DEFAULT_RUN_LIMITS } from "../src/lib/ai/contracts";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

// Thursday 22 October 2026, 11:30 in Amman.
const NOW = new Date("2026-10-22T08:30:00.000Z");
const ORG = "ai-org";
const MAIN = "ai-main";
const NORTH = "ai-north";
const FOREIGN_ORG = "ai-foreign-org";

type Harness = TestConvex<typeof schema>;
type Ids = { org: Id<"organizations">; main: Id<"branches">; north: Id<"branches">; sales: Id<"users">; owner: Id<"users">; salesMembership: Id<"organizationMemberships"> };

const op = (operation: string, input: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ operation, input, correlationId: `cor-ai-${operation}`, organizationId: ORG, ...extra });

async function seed(t: Harness, options: { aiMode?: "off" | "prepare" | "execute" } = {}): Promise<Ids> {
  return await t.run(async (ctx) => {
    const now = NOW.getTime();
    const org = await ctx.db.insert("organizations", { publicId: ORG, name: "Ledger Gym", slug: "ledger-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", defaultLanguage: "en", createdAt: now, updatedAt: now });
    const main = await ctx.db.insert("branches", { organizationId: org, publicId: MAIN, name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const north = await ctx.db.insert("branches", { organizationId: org, publicId: NORTH, name: "North", code: "NORTH", active: true, status: "active", createdAt: now, updatedAt: now });
    const user = async (publicId: string, role: "owner" | "manager" | "sales" | "receptionist", branchIds: Id<"branches">[], branchScope: "all" | "selected") => {
      const id = await ctx.db.insert("users", { publicId, authSubject: `clerk-${publicId}`, email: `${publicId}@ledger.example`, fullName: publicId.replace("ai-", "").replace(/^./, (c) => c.toUpperCase()), platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      const membership = await ctx.db.insert("organizationMemberships", { organizationId: org, userId: id, role, branchIds, branchScope, active: true, createdAt: now, updatedAt: now });
      return { id, membership };
    };
    const owner = await user("ai-owner", "owner", [main, north], "all");
    const sales = await user("ai-sales", "sales", [main], "selected");
    await user("ai-sales2", "sales", [main], "selected");
    await user("ai-desk-north", "receptionist", [north], "selected");
    const record = async (entityType: string, publicId: string, value: Record<string, unknown>, keys: { memberPublicId?: string; leadPublicId?: string; branchId?: Id<"branches"> } = {}) =>
      ctx.db.insert("domainRecords", { organizationId: org, entityType, publicId, branchId: keys.branchId ?? main, createdAt: now, updatedAt: now, data: { id: publicId, organizationId: ORG, ...value }, ...(keys.memberPublicId ? { memberPublicId: keys.memberPublicId } : {}) });
    await record("settings", "settings", { operationalPolicies: {} });
    await record("plan", "plan-monthly", { name: "Monthly", code: "M1", kind: "time", durationDays: 30, basePrice: { amount: 30_000, currency: "JOD" }, branchAccess: "all", branchIds: [], status: "active" });
    const member = async (id: string, fullName: string, endDate: string, extra: Record<string, unknown> = {}, membershipExtra: Record<string, unknown> = {}) => {
      await record("member", id, { memberNumber: `M-${id}`, fullName, phone: `+96279${String(Math.abs([...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 10_000_000).padStart(7, "0")}`, homeBranchId: MAIN, status: "active", tags: [], preferredLanguage: "en", marketingOptIn: true, createdAt: "2026-01-01T00:00:00.000Z", ...extra }, { memberPublicId: id });
      await record("membership", `${id}-term`, { memberId: id, planId: "plan-monthly", homeBranchId: MAIN, startDate: "2026-09-25", endDate, salePrice: { amount: 30_000, currency: "JOD" }, discount: { amount: 0, currency: "JOD" }, freezes: [], adjustments: [], createdAt: "2026-09-25T08:00:00.000Z", ...membershipExtra }, { memberPublicId: id });
    };
    await member("m-omar", "Omar Haddad", "2026-10-30", { assignedSalespersonId: "ai-sales" });
    await member("m-lina", "Lina Saleh", "2026-10-27");
    await member("m-huda", "Huda Nasser", "2026-10-28", { whatsappOptedOut: true });
    await member("m-rami", "Rami Khalil", "2026-10-29");
    await member("m-noor", "Noor Aziz", "2026-10-31", {}, { activeFreeze: { status: "active", startDate: "2026-10-15", endDate: "2026-11-05" } });
    await member("m-tariq", "Tariq Fares", "2026-11-01");
    await member("m-sara", "Sara Odeh", "2026-11-03", { preferredLanguage: "ar" });
    // Omar: three evening visits a week until twelve days ago, and a recorded conversation about evening classes.
    for (let day = 60; day >= 12; day -= 2) {
      if (day % 7 === 3) continue;
      const at = new Date(NOW.getTime() - day * 86_400_000);
      at.setUTCHours(15, 0, 0, 0);
      await record("checkIn", `ci-omar-${day}`, { memberId: "m-omar", branchId: MAIN, occurredAt: at.toISOString(), decision: "allowed" }, { memberPublicId: "m-omar" });
    }
    await record("timeline", "tl-omar-note", { memberId: "m-omar", type: "note", title: "Note added", body: "Omar said he can't find an evening class that fits after work.", actorName: "Sales", occurredAt: "2026-10-12T16:00:00.000Z" }, { memberPublicId: "m-omar" });
    await record("timeline", "tl-lina-call", { memberId: "m-lina", type: "call_attempt", title: "Contact — no answer", actorName: "Sales", occurredAt: "2026-10-21T10:00:00.000Z", meta: { outcome: "no_answer" } }, { memberPublicId: "m-lina" });
    await record("task", "task-rami-existing", { type: "renewal_call", title: "Call Rami Khalil about membership renewal", ownerId: "ai-sales2", dueAt: "2026-10-23T07:00:00.000Z", priority: "normal", status: "open", memberId: "m-rami", subjectName: "Rami Khalil", createdById: "ai-sales2", createdAt: "2026-10-20T07:00:00.000Z" }, { memberPublicId: "m-rami" });
    await ctx.db.insert("classSessions", { organizationId: org, publicId: "class-evening-spin", branchId: main, name: "Evening spin", dayOfWeek: 1, startMinute: 18 * 60 + 30, durationMinutes: 45, capacity: 12, status: "scheduled", roster: [], createdAt: now, updatedAt: now } as never);
    await ctx.db.insert("aiMemories", { organizationId: org, publicId: "memory-tariq-travel", kind: "staff_statement", topic: "travel", subjectType: "member", subjectId: "m-tariq", branchId: main, text: "Travelling until Sunday", effectiveFrom: "2026-10-20", effectiveUntil: "2026-10-25", status: "active", provenance: { sourceKind: "staff_explicit", recordedByUserId: sales.id, recordedAt: now }, revision: 1, createdAt: now, updatedAt: now });
    if (options.aiMode && options.aiMode !== "off") {
      await ctx.db.insert("aiSettings", { organizationId: org, tenantMode: options.aiMode, externalProcessing: false, capabilityModes: {}, revision: 1, updatedAt: now });
      // RIVET has made assistance available for this gym; without it every gate reads as off.
      const platformOperator = await ctx.db.insert("users", { publicId: "ai-platform-operator", authSubject: "clerk-ai-platform-operator", email: "platform@ledger.example", fullName: "Platform Operator", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("aiAvailability", { organizationId: org, available: true, reason: "Test gym", changedByUserId: platformOperator, changedAt: now });
    }
    // A second gym with a member of the same name, which must never be visible.
    const foreign = await ctx.db.insert("organizations", { publicId: FOREIGN_ORG, name: "Other Gym", slug: "other-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const foreignBranch = await ctx.db.insert("branches", { organizationId: foreign, publicId: "foreign-main", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: foreign, entityType: "member", publicId: "m-foreign-omar", branchId: foreignBranch, memberPublicId: "m-foreign-omar", createdAt: now, updatedAt: now, data: { id: "m-foreign-omar", fullName: "Omar Haddad", homeBranchId: "foreign-main", status: "active" } });
    return { org, main, north, sales: sales.id, owner: owner.id, salesMembership: sales.membership };
  });
}

type RunView = { id: string; status: string; counts: Record<string, number>; exclusions: Array<{ subjectId: string; reason: string }>; results: Array<{ kind: string; id: string; subjectName?: string; labelMessage?: { key: string } }>; steps: Array<{ subjectId?: string; status: string; reason?: string; draft?: { language: string; text: string } }>; committedEffects: number; errorCategory?: string; allowed: Record<string, boolean> };
type TaskRow = { id: string; memberId?: string; type: string; status: string; dueAt: string; ownerId?: string; title: string; titleMessage?: { key: string; params?: Record<string, unknown> }; origin?: { kind: string; runId: string }; aiContext?: { purpose: string; membershipId?: string; topic?: string }; outcome?: string };

async function tasksOf(t: Harness, memberId: string, status = "open"): Promise<TaskRow[]> {
  return (await t.withIdentity({ subject: "clerk-ai-owner" }).query(api.domain.query, op("tasks.list", { memberId, status, pageSize: 50 })) as { items: TaskRow[] }).items;
}

async function startRun(t: Harness, requestKey = "renewal-request-0001", params: Record<string, unknown> = { bucket: "expiring", owner: "me" }): Promise<RunView> {
  return await t.withIdentity({ subject: "clerk-ai-sales" }).mutation(api.domain.mutate, op("ai.run.start", { playbook: "renewal_followups", params, requestKey }, { activeBranchId: MAIN })) as RunView;
}

async function getRun(t: Harness, runId: string, subject = "clerk-ai-sales"): Promise<RunView> {
  return await t.withIdentity({ subject }).query(api.domain.query, op("ai.run.get", { runId }, { activeBranchId: MAIN })) as RunView;
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

describe("assistance stays off until the deployment and the gym turn it on", () => {
  it("reports why the member brief is unavailable without confirming foreign records", async () => {
    vi.stubEnv("RIVET_AI_MODE", "");
    const t = convexTest(schema, modules);
    await seed(t, { aiMode: "execute" });
    const sales = t.withIdentity({ subject: "clerk-ai-sales" });
    expect(await sales.query(api.domain.query, op("ai.member.brief", { memberId: "m-omar" }, { activeBranchId: MAIN }))).toEqual({ available: false, reason: "ai_off" });
    await expect(sales.query(api.domain.query, op("ai.member.brief", { memberId: "m-foreign-omar" }, { activeBranchId: MAIN }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
  });

  it("keeps a gym that never enabled assistance off, and refuses delegated work there", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const sales = t.withIdentity({ subject: "clerk-ai-sales" });
    expect(await sales.query(api.domain.query, op("ai.member.brief", { memberId: "m-omar" }, { activeBranchId: MAIN }))).toEqual({ available: false, reason: "tenant_off" });
    await expect(startRun(t)).rejects.toMatchObject({ data: expect.objectContaining({ code: "FEATURE_NOT_AVAILABLE" }) });
  });

  it("does not let preparation mode create business records", async () => {
    const t = convexTest(schema, modules);
    await seed(t, { aiMode: "prepare" });
    await expect(startRun(t)).rejects.toMatchObject({ data: expect.objectContaining({ code: "FEATURE_NOT_AVAILABLE", details: { reason: "capability_off" } }) });
    const brief = await t.withIdentity({ subject: "clerk-ai-sales" }).query(api.domain.query, op("ai.member.brief", { memberId: "m-omar" }, { activeBranchId: MAIN })) as { available: boolean };
    expect(brief.available).toBe(true);
  });
});

describe("member context beside the contact action", () => {
  it("assembles evidence-linked facts, staff statements and gaps for the flagship member", async () => {
    const t = convexTest(schema, modules);
    await seed(t, { aiMode: "execute" });
    const result = await t.withIdentity({ subject: "clerk-ai-sales" }).query(api.domain.query, op("ai.member.brief", { memberId: "m-omar" }, { activeBranchId: MAIN })) as { available: true; brief: { headline: { key: string; params: Record<string, unknown> }; lines: Array<{ key: string; basis: string; message: { key: string; params?: Record<string, unknown> }; sources: Array<{ kind: string; id: string; href?: string }> }>; gaps: Array<{ key: string }>; extraction: { available: boolean } } };
    expect(result.available).toBe(true);
    const { brief } = result;
    expect(brief.headline).toEqual({ key: "aiWork.brief.headline.eveningClasses", params: { name: "Omar", count: 8 } });
    const byKey = new Map(brief.lines.map((line) => [line.key, line]));
    expect(byKey.get("renewal")?.message).toEqual({ key: "aiWork.brief.endsIn", params: { count: 8, date: { date: "2026-10-30" } } });
    expect(byKey.get("attendance")?.message.key).toBe("aiWork.brief.absentAgainstBaseline");
    expect(byKey.get("attendance")?.message.params?.count).toBe(12);
    expect(byKey.get("topic-evening")).toMatchObject({ basis: "staff_statement", sources: [{ kind: "timeline", id: "tl-omar-note", href: "/members/m-omar?tab=timeline#timeline-event-tl-omar-note" }] });
    expect(byKey.get("classes-evening")?.message).toEqual({ key: "aiWork.brief.eveningClassesAvailable", params: { count: 1, branch: "Main" } });
    expect(brief.gaps).toEqual([{ key: "aiWork.brief.gapNoContact" }]);
    expect(brief.extraction.available).toBe(true);
  });

  it("labels travel as what staff recorded, not a verified fact", async () => {
    const t = convexTest(schema, modules);
    await seed(t, { aiMode: "execute" });
    const result = await t.withIdentity({ subject: "clerk-ai-sales" }).query(api.domain.query, op("ai.member.brief", { memberId: "m-tariq" }, { activeBranchId: MAIN })) as { brief: { lines: Array<{ key: string; basis: string; message: { key: string } }>; headline: { key: string } } };
    expect(result.brief.lines.find((line) => line.key === "statement-memory-tariq-travel")).toMatchObject({ basis: "staff_statement", message: { key: "aiWork.brief.travelStatement" } });
    expect(result.brief.headline.key).toBe("aiWork.brief.headline.travellingRenewal");
  });

  it("denies other branches and other gyms through the same scope as the member record", async () => {
    const t = convexTest(schema, modules);
    await seed(t, { aiMode: "execute" });
    const north = t.withIdentity({ subject: "clerk-ai-desk-north" });
    await expect(north.query(api.domain.query, op("ai.member.brief", { memberId: "m-omar" }, { activeBranchId: NORTH }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
    const sales = t.withIdentity({ subject: "clerk-ai-sales" });
    await expect(sales.query(api.domain.query, op("ai.member.brief", { memberId: "m-foreign-omar" }, { activeBranchId: MAIN }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
    await expect(sales.query(api.domain.query, op("ai.member.brief", { memberId: "m-omar" }, { organizationId: FOREIGN_ORG }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
  });

  it("gives each visible list row its headline and silently leaves out members outside the reader's scope", async () => {
    const t = convexTest(schema, modules);
    await seed(t, { aiMode: "execute" });
    const sales = t.withIdentity({ subject: "clerk-ai-sales" });
    const result = await sales.query(api.domain.query, op("ai.member.headlines", { memberIds: ["m-huda", "m-omar", "m-foreign-omar", "m-huda"] })) as { available: boolean; items: Array<{ memberId: string; fact: { key: string } }> };
    expect(result.available).toBe(true);
    expect(result.items.map((item) => item.memberId).every((id) => id === "m-huda" || id === "m-omar")).toBe(true);
    expect(result.items.some((item) => item.memberId === "m-foreign-omar")).toBe(false);
    expect(result.items.length).toBeGreaterThan(0);
    // The row already shows the end date and last contact; the line adds something else.
    expect(result.items.every((item) => item.fact.key.startsWith("aiWork.brief.") && !["aiWork.brief.endsIn", "aiWork.brief.endedAgo", "aiWork.brief.lastContact"].includes(item.fact.key))).toBe(true);
  });
});

describe("Prepare follow-ups saves and verifies real tasks", () => {
  it("creates deduplicated renewal tasks with drafts, links open work and explains every exclusion", async () => {
    const t = convexTest(schema, modules);
    await seed(t, { aiMode: "execute" });
    const started = await startRun(t);
    expect(started.status).toBe("queued");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const run = await getRun(t, started.id);
    expect(run.status).toBe("completed");
    expect(run.counts).toMatchObject({ considered: 7, created: 4, linked: 1, skipped: 2, failed: 0 });
    expect(new Map(run.exclusions.map((item) => [item.subjectId, item.reason]))).toEqual(new Map([["m-lina", "recently_contacted"], ["m-noor", "frozen"]]));
    expect(run.results.map((item) => item.subjectName).sort()).toEqual(["Huda Nasser", "Omar Haddad", "Rami Khalil", "Sara Odeh", "Tariq Fares"]);

    const [omarTask] = await tasksOf(t, "m-omar");
    expect(omarTask).toMatchObject({ type: "renewal_call", title: "Call Omar Haddad about membership renewal · ask about evening classes", ownerId: "ai-sales", origin: { kind: "ai_run", runId: run.id }, aiContext: { purpose: "renewal", membershipId: "m-omar-term", topic: "evening_classes" } });
    // Omar usually visits in the evening: the call is planned for 18:00 in Amman today.
    expect(omarTask?.dueAt).toBe("2026-10-22T15:00:00.000Z");
    // The stored English title has a descriptor beside it, so each reader sees it in their own language.
    expect(omarTask?.titleMessage).toEqual({ key: "communicationCompletion.tasks.renewalCallEveningClasses", params: { name: "Omar Haddad" } });
    expect(run.results.find((item) => item.subjectName === "Omar Haddad")).toMatchObject({ labelMessage: { key: "communicationCompletion.tasks.renewalCallEveningClasses" } });
    const omarStep = run.steps.find((step) => step.subjectId === "m-omar");
    expect(omarStep?.draft?.language).toBe("en");
    expect(omarStep?.draft?.text).toContain("We have evening classes that may suit you");

    const [tariqTask] = await tasksOf(t, "m-tariq");
    // Travelling until Sunday: the call waits until the day after.
    expect(tariqTask?.dueAt.slice(0, 10)).toBe("2026-10-26");
    expect(run.steps.find((step) => step.subjectId === "m-tariq")?.draft?.text).toContain("Welcome back from your trip.");
    // Huda opted out of WhatsApp: a call task, no message draft.
    expect(run.steps.find((step) => step.subjectId === "m-huda")?.draft).toBeUndefined();
    expect(await tasksOf(t, "m-huda")).toHaveLength(1);
    // Sara's draft follows her language, not the staff member's screen.
    expect(run.steps.find((step) => step.subjectId === "m-sara")?.draft?.language).toBe("ar");
    // Rami already had an open call owned by someone else: linked, not duplicated.
    expect((await tasksOf(t, "m-rami")).map((task) => task.id)).toEqual(["task-rami-existing"]);
    expect(await tasksOf(t, "m-lina")).toEqual([]);

    const timeline = await t.withIdentity({ subject: "clerk-ai-sales" }).query(api.domain.query, op("members.timeline", { memberId: "m-omar", pageSize: 20 }, { activeBranchId: MAIN })) as { items: Array<{ type: string; actorName?: string; meta?: { delegationRunId?: string } }> };
    expect(timeline.items.find((event) => event.type === "task_created")).toMatchObject({ actorName: "Sales", meta: { delegationRunId: run.id, delegationTool: "task.create_followup" } });
    expect(timeline.items.some((event) => event.type === "call_attempt" && event.meta?.delegationRunId)).toBe(false);
  });

  it("returns the same run for a repeated start and never stacks a second task on the same renewal", async () => {
    const t = convexTest(schema, modules);
    await seed(t, { aiMode: "execute" });
    const first = await startRun(t);
    const repeat = await startRun(t);
    expect(repeat.id).toBe(first.id);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const second = await startRun(t, "renewal-request-0002");
    expect(second.id).not.toBe(first.id);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const secondRun = await getRun(t, second.id);
    expect(secondRun.status).toBe("completed");
    expect(secondRun.counts.created).toBe(0);
    expect(secondRun.counts.linked).toBe(5);
    for (const memberId of ["m-omar", "m-huda", "m-tariq", "m-sara"]) expect(await tasksOf(t, memberId)).toHaveLength(1);
  });

  it("resumes after a worker stops right after a commit, without repeating the committed step", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    const started = await startRun(t);
    const args = { organizationId: ids.org, runPublicId: started.id };
    const lease = await t.mutation(internal.aiRuns.acquireLease, args);
    expect(lease.token).toBeTruthy();
    await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! }); // plan
    await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! }); // Lina: skipped
    await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! }); // Huda: task committed
    expect(await tasksOf(t, "m-huda")).toHaveLength(1);
    // The worker dies here. Its lease expires; a late write from it is fenced off.
    vi.setSystemTime(NOW.getTime() + LEASE_MS + 1_000);
    expect(await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! })).toEqual({ done: true });
    expect(await t.mutation(internal.aiRuns.recoverExpiredLeases, {})).toBeGreaterThan(0);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const run = await getRun(t, started.id);
    expect(run.status).toBe("completed");
    expect(run.counts.created).toBe(4);
    expect(await tasksOf(t, "m-huda")).toHaveLength(1);
  });

  it("lets only the current lease holder commit", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    const started = await startRun(t);
    const args = { organizationId: ids.org, runPublicId: started.id };
    const first = await t.mutation(internal.aiRuns.acquireLease, args);
    expect(await t.mutation(internal.aiRuns.acquireLease, args)).toEqual({});
    vi.setSystemTime(NOW.getTime() + LEASE_MS + 1);
    const second = await t.mutation(internal.aiRuns.acquireLease, args);
    expect(second.token).toBeTruthy();
    expect(second.token).not.toBe(first.token);
    expect(await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: first.token! })).toEqual({ done: true });
    expect(await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: second.token! })).toEqual({ done: false });
  });

  it("stops at the next step when cancelled and reports what was already saved", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    const started = await startRun(t);
    const args = { organizationId: ids.org, runPublicId: started.id };
    const lease = await t.mutation(internal.aiRuns.acquireLease, args);
    for (let step = 0; step < 3; step += 1) await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! });
    const cancelled = await t.withIdentity({ subject: "clerk-ai-sales" }).mutation(api.domain.mutate, op("ai.run.cancel", { runId: started.id }, { activeBranchId: MAIN })) as RunView;
    expect(cancelled.status).toBe("running");
    expect(await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! })).toEqual({ done: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const run = await getRun(t, started.id);
    expect(run.status).toBe("cancelled");
    expect(run.counts.created).toBe(1);
    expect(run.committedEffects).toBe(1);
    expect(await tasksOf(t, "m-huda")).toHaveLength(1);
    expect(await tasksOf(t, "m-omar")).toHaveLength(0);
  });

  it("stops pending writes when the owner loses access between steps", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    const started = await startRun(t);
    const args = { organizationId: ids.org, runPublicId: started.id };
    const lease = await t.mutation(internal.aiRuns.acquireLease, args);
    for (let step = 0; step < 3; step += 1) await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! });
    await t.run(async (ctx) => { await ctx.db.patch(ids.salesMembership, { role: "receptionist" }); });
    expect(await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! })).toEqual({ done: true });
    const run = await getRun(t, started.id, "clerk-ai-owner");
    expect(run).toMatchObject({ status: "partially_completed", errorCategory: "authority_revoked" });
    expect(run.counts.created).toBe(1);
    expect(await tasksOf(t, "m-omar")).toHaveLength(0);
  });

  it("stops when the gym turns assistance off mid-run", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    const started = await startRun(t);
    const args = { organizationId: ids.org, runPublicId: started.id };
    const lease = await t.mutation(internal.aiRuns.acquireLease, args);
    await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! });
    await t.withIdentity({ subject: "clerk-ai-owner" }).mutation(api.domain.mutate, op("ai.settings.update", { tenantMode: "off", expectedRevision: 1, reason: "Pausing assistance" }));
    expect(await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! })).toEqual({ done: true });
    expect((await getRun(t, started.id, "clerk-ai-owner")).status).toBe("cancelled");
    expect(await tasksOf(t, "m-huda")).toHaveLength(0);
  });

  it("stops at the next step when the platform-wide stop is switched on", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    const started = await startRun(t);
    const args = { organizationId: ids.org, runPublicId: started.id };
    const lease = await t.mutation(internal.aiRuns.acquireLease, args);
    await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! });
    await t.run(async (ctx) => { await ctx.db.insert("aiControls", { key: GLOBAL_CONTROL_KEY, stopped: true, reason: "Incident drill", changedAt: Date.now() }); });
    expect(await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! })).toEqual({ done: true });
    const run = await getRun(t, started.id, "clerk-ai-owner");
    expect(["failed", "cancelled", "partially_completed"]).toContain(run.status);
    expect(await tasksOf(t, "m-huda")).toHaveLength(0);
    // Ordinary work is untouched by the stop.
    await expect(t.withIdentity({ subject: "clerk-ai-owner" }).query(api.domain.query, op("tasks.list", { status: "open", pageSize: 5 }))).resolves.toBeTruthy();
  });

  it("stops a capability's runs when only that capability is turned off", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    const started = await startRun(t);
    const args = { organizationId: ids.org, runPublicId: started.id };
    const lease = await t.mutation(internal.aiRuns.acquireLease, args);
    await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! });
    await t.withIdentity({ subject: "clerk-ai-owner" }).mutation(api.domain.mutate, op("ai.settings.update", { capabilities: { followup_batch: "off" }, expectedRevision: 1, reason: "Pausing prepared follow-ups" }));
    expect(await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! })).toEqual({ done: true });
    expect(["failed", "cancelled"]).toContain((await getRun(t, started.id, "clerk-ai-owner")).status);
    expect(await tasksOf(t, "m-huda")).toHaveLength(0);
  });

  it("skips a member who renewed after the batch was planned, and renewal closes the prepared call", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    const started = await startRun(t);
    const args = { organizationId: ids.org, runPublicId: started.id };
    const lease = await t.mutation(internal.aiRuns.acquireLease, args);
    await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! }); // plan
    await t.withIdentity({ subject: "clerk-ai-sales" }).mutation(api.domain.mutate, op("memberships.renew", { membershipId: "m-huda-term" }, { activeBranchId: MAIN }));
    // The test held the lease by hand; let it expire so the recovered worker continues.
    vi.setSystemTime(NOW.getTime() + LEASE_MS + 1_000);
    await t.mutation(internal.aiRuns.recoverExpiredLeases, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const run = await getRun(t, started.id);
    expect(run.exclusions).toContainEqual(expect.objectContaining({ subjectId: "m-huda", reason: "renewed" }));
    expect(await tasksOf(t, "m-huda")).toHaveLength(0);
    // Omar renews after his call was prepared: the prepared call closes in the same transaction.
    expect(await tasksOf(t, "m-omar")).toHaveLength(1);
    await t.withIdentity({ subject: "clerk-ai-sales" }).mutation(api.domain.mutate, op("memberships.renew", { membershipId: "m-omar-term" }, { activeBranchId: MAIN }));
    expect(await tasksOf(t, "m-omar")).toHaveLength(0);
    expect(await tasksOf(t, "m-omar", "completed")).toEqual([expect.objectContaining({ outcome: "Renewed — follow-up no longer needed" })]);
    // A staff member's own task is never closed by this rule.
    await t.withIdentity({ subject: "clerk-ai-sales" }).mutation(api.domain.mutate, op("memberships.renew", { membershipId: "m-rami-term" }, { activeBranchId: MAIN }));
    expect((await tasksOf(t, "m-rami")).map((task) => task.id)).toEqual(["task-rami-existing"]);
  });

  it("applies a revision to the remaining members without redoing finished work", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    const started = await startRun(t);
    const args = { organizationId: ids.org, runPublicId: started.id };
    const lease = await t.mutation(internal.aiRuns.acquireLease, args);
    for (let step = 0; step < 3; step += 1) await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! });
    const revised = await t.withIdentity({ subject: "clerk-ai-sales" }).mutation(api.domain.mutate, op("ai.run.revise", { runId: started.id, text: "Only the evening members", revision: { kind: "time_of_day", value: "evening" } }, { activeBranchId: MAIN })) as RunView & { revisions: Array<{ appliedToRemaining: number }> };
    expect(revised.revisions[0]?.appliedToRemaining).toBe(5);
    await expect(t.withIdentity({ subject: "clerk-ai-sales" }).mutation(api.domain.mutate, op("ai.run.revise", { runId: started.id, text: "skip Zaid", revision: { kind: "exclude_member", memberId: "m-not-in-run" } }, { activeBranchId: MAIN }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) });
    vi.setSystemTime(NOW.getTime() + LEASE_MS + 1_000);
    await t.mutation(internal.aiRuns.recoverExpiredLeases, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const run = await getRun(t, started.id);
    expect(run.status).toBe("completed");
    // Huda's task was saved before the change and stays; only Omar (an evening regular) is added after it.
    expect(await tasksOf(t, "m-huda")).toHaveLength(1);
    expect(await tasksOf(t, "m-omar")).toHaveLength(1);
    expect(await tasksOf(t, "m-sara")).toHaveLength(0);
    expect(run.exclusions).toContainEqual(expect.objectContaining({ subjectId: "m-sara", reason: "revision_excluded" }));
  });

  it("hands remaining members to a person on takeover", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    const started = await startRun(t);
    const args = { organizationId: ids.org, runPublicId: started.id };
    const lease = await t.mutation(internal.aiRuns.acquireLease, args);
    for (let step = 0; step < 3; step += 1) await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! });
    const taken = await t.withIdentity({ subject: "clerk-ai-sales" }).mutation(api.domain.mutate, op("ai.run.take_over", { runId: started.id }, { activeBranchId: MAIN })) as RunView;
    expect(taken.status).toBe("partially_completed");
    expect(taken.steps.filter((step) => step.status === "handed_over")).toHaveLength(5);
    expect(await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! })).toEqual({ done: true });
    expect(await tasksOf(t, "m-omar")).toHaveLength(0);
  });

  it("does not let another salesperson in a different branch see or control the run", async () => {
    const t = convexTest(schema, modules);
    await seed(t, { aiMode: "execute" });
    const started = await startRun(t);
    const north = t.withIdentity({ subject: "clerk-ai-desk-north" });
    await expect(north.query(api.domain.query, op("ai.run.get", { runId: started.id }, { activeBranchId: NORTH }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
    await expect(north.mutation(api.domain.mutate, op("ai.run.cancel", { runId: started.id }, { activeBranchId: NORTH }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
  });
});

describe("delegated principals can only narrow authority", () => {
  it("refuses a delegated request inside a signed-in call", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    await expect(t.withIdentity({ subject: "clerk-ai-sales" }).run(async (ctx) => {
      await requireActor(ctx, delegatedRequest({ organizationId: ORG, activeBranchId: MAIN }, { userId: ids.sales, organizationId: ids.org, allowedPermissions: ["crm.read"], runPublicId: "run-x", grantPublicId: "grant-x", tool: "t" }));
    })).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
  });

  it("keeps an owner's grant limited to the tools it names", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    await expect(t.run(async (ctx) => {
      const request = delegatedRequest({ organizationId: ORG, correlationId: "cor-ai-narrow" }, { userId: ids.owner, organizationId: ids.org, allowedPermissions: ["crm.read", "crm.write"], runPublicId: "run-narrow", grantPublicId: "grant-narrow", tool: "task.create_followup" });
      await executeDomainMutation(ctx, "plans.create", { name: "Free forever", code: "FREE" }, request);
    })).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
  });

  it("rebuilds the actor from current records: a deactivated person has no authority", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    await t.run(async (ctx) => { await ctx.db.patch(ids.sales, { status: "deactivated" }); });
    await expect(t.run(async (ctx) => {
      await requireActor(ctx, delegatedRequest({ organizationId: ORG, activeBranchId: MAIN }, { userId: ids.sales, organizationId: ids.org, allowedPermissions: ["crm.read"], runPublicId: "run-x", grantPublicId: "grant-x", tool: "t" }));
    })).rejects.toMatchObject({ data: expect.objectContaining({ code: "UNAUTHENTICATED" }) });
  });
});

describe("standing instructions", () => {
  it("needs the current preview, starts one run per slot, and stops when the owner loses access", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    const sales = t.withIdentity({ subject: "clerk-ai-sales" });
    const preview = await sales.query(api.domain.query, op("ai.standing.preview", { playbook: "renewal_followups", params: { bucket: "expiring", owner: "me" } }, { activeBranchId: MAIN })) as { subjects: Array<{ id: string; decision: string }>; digest: string };
    expect(preview.subjects.filter((subject) => subject.decision === "create").map((subject) => subject.id).sort()).toEqual(["m-huda", "m-omar", "m-sara", "m-tariq"]);
    const input = { playbook: "renewal_followups", params: { bucket: "expiring", owner: "me" }, schedule: { weekdays: [0, 1, 2, 3, 4], time: "09:00" }, requestKey: "standing-request-1" };
    await expect(sales.mutation(api.domain.mutate, op("ai.standing.create", { ...input, previewDigest: "stale" }, { activeBranchId: MAIN }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "CONFLICT" }) });
    const standing = await sales.mutation(api.domain.mutate, op("ai.standing.create", { ...input, previewDigest: preview.digest }, { activeBranchId: MAIN })) as { id: string; nextRunAt: string; status: string };
    expect(standing.status).toBe("active");
    // Today's 09:00 has passed and Friday/Saturday are not scheduled: next is Sunday 25 October, 09:00 in Amman.
    expect(standing.nextRunAt).toBe("2026-10-25T06:00:00.000Z");
    vi.setSystemTime(new Date("2026-10-25T06:01:00.000Z"));
    expect(await t.mutation(internal.aiRuns.dispatchStanding, {})).toBe(1);
    expect(await t.mutation(internal.aiRuns.dispatchStanding, {})).toBe(0);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const runs = await sales.query(api.domain.query, op("ai.runs.list", { playbook: "renewal_followups" }, { activeBranchId: MAIN })) as Array<{ trigger: string; status: string; standingInstructionId?: string }>;
    expect(runs).toEqual([expect.objectContaining({ trigger: "schedule", status: "completed", standingInstructionId: standing.id })]);
    await t.run(async (ctx) => { await ctx.db.patch(ids.salesMembership, { active: false }); });
    vi.setSystemTime(new Date("2026-10-26T06:01:00.000Z"));
    expect(await t.mutation(internal.aiRuns.dispatchStanding, {})).toBe(0);
    const listed = await t.withIdentity({ subject: "clerk-ai-owner" }).query(api.domain.query, op("ai.standing.list")) as Array<{ id: string }>;
    expect(listed.find((item) => item.id === standing.id)).toBeUndefined();
  });
});

describe("completion and exception reporting", () => {
  it("tells the person about new work once, and stays quiet when a scheduled run only finds work already open", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    const sales = t.withIdentity({ subject: "clerk-ai-sales" });
    const preview = await sales.query(api.domain.query, op("ai.standing.preview", { playbook: "renewal_followups", params: { bucket: "expiring", owner: "me" } }, { activeBranchId: MAIN })) as { digest: string };
    await sales.mutation(api.domain.mutate, op("ai.standing.create", { playbook: "renewal_followups", params: { bucket: "expiring", owner: "me" }, schedule: { weekdays: [0, 1, 2, 3, 4], time: "09:00" }, requestKey: "standing-quiet-1", previewDigest: preview.digest }, { activeBranchId: MAIN }));
    const notices = async () => await t.run(async (ctx) => (await ctx.db.query("operationalNotifications").collect()).filter((row) => row.kind === "ai_run" && row.recipientUserId === ids.sales));
    vi.setSystemTime(new Date("2026-10-25T06:01:00.000Z"));
    await t.mutation(internal.aiRuns.dispatchStanding, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await notices()).toHaveLength(1);
    // Monday: the same calls are still open, so the run links them and says nothing.
    vi.setSystemTime(new Date("2026-10-26T06:01:00.000Z"));
    expect(await t.mutation(internal.aiRuns.dispatchStanding, {})).toBe(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const runs = await sales.query(api.domain.query, op("ai.runs.list", { playbook: "renewal_followups" }, { activeBranchId: MAIN })) as Array<{ counts: { created: number; linked: number } }>;
    expect(runs.some((run) => run.counts.created === 0 && run.counts.linked > 0)).toBe(true);
    expect(await notices()).toHaveLength(1);
  });
});

describe("staff statements are bounded and attributable", () => {
  it("records a travel statement with provenance, supersedes the previous one and refuses long or foreign entries", async () => {
    const t = convexTest(schema, modules);
    await seed(t, { aiMode: "execute" });
    const sales = t.withIdentity({ subject: "clerk-ai-sales" });
    const saved = await sales.mutation(api.domain.mutate, op("ai.memory.record", { subjectId: "m-omar", topic: "travel", effectiveUntil: "2026-10-26", text: "Travelling until Sunday" }, { activeBranchId: MAIN })) as { id: string; provenance: { recordedByName: string } };
    expect(saved.provenance.recordedByName).toBe("Sales");
    await sales.mutation(api.domain.mutate, op("ai.memory.record", { subjectId: "m-omar", topic: "travel", effectiveUntil: "2026-10-28", text: "Back on Wednesday" }, { activeBranchId: MAIN }));
    const memories = await sales.query(api.domain.query, op("ai.memories.list", { memberId: "m-omar" }, { activeBranchId: MAIN })) as Array<{ effectiveUntil: string; revision: number }>;
    expect(memories).toEqual([expect.objectContaining({ effectiveUntil: "2026-10-28", revision: 2 })]);
    await expect(sales.mutation(api.domain.mutate, op("ai.memory.record", { subjectId: "m-omar", topic: "travel", effectiveUntil: "2027-06-01" }, { activeBranchId: MAIN }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) });
    await expect(sales.mutation(api.domain.mutate, op("ai.memory.record", { subjectId: "m-foreign-omar", topic: "travel", effectiveUntil: "2026-10-26" }, { activeBranchId: MAIN }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
    const desk = t.withIdentity({ subject: "clerk-ai-desk-north" });
    await expect(desk.mutation(api.domain.mutate, op("ai.memory.record", { subjectId: "m-omar", topic: "travel", effectiveUntil: "2026-10-26" }, { activeBranchId: NORTH }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
  });
});

describe("platform assistance controls", () => {
  it("lets only RIVET operators read and change the platform stop, with a reason and a name", async () => {
    const t = convexTest(schema, modules);
    await seed(t, { aiMode: "execute" });
    await t.run(async (ctx) => { await ctx.db.insert("users", { publicId: "ai-operator", authSubject: "clerk-ai-operator", email: "operator@rivet.example", fullName: "Operator Lina", platformAdmin: true, status: "active", createdAt: Date.now(), updatedAt: Date.now() }); });
    const status = { operation: "ai.platform.status", input: {}, correlationId: "cor-platform-status" };
    await expect(t.withIdentity({ subject: "clerk-ai-owner" }).query(api.domain.query, status)).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
    const operator = t.withIdentity({ subject: "clerk-ai-operator" });
    expect(await operator.query(api.domain.query, status)).toMatchObject({ adapterMode: "fixture", stopped: false });
    await expect(operator.mutation(api.domain.mutate, { operation: "ai.platform.stop", input: { stopped: true, reason: "" }, correlationId: "cor-platform-stop-0" })).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) });
    await operator.mutation(api.domain.mutate, { operation: "ai.platform.stop", input: { stopped: true, reason: "Incident drill" }, correlationId: "cor-platform-stop-1" });
    expect(await operator.query(api.domain.query, status)).toMatchObject({ stopped: true, reason: "Incident drill", changedByName: "Operator Lina" });
    // The gym sees assistance stopped everywhere.
    expect(await t.withIdentity({ subject: "clerk-ai-owner" }).query(api.domain.query, op("ai.settings.get"))).toMatchObject({ globalStop: true });
  });
});

describe("platform availability per gym", () => {
  async function operator(t: Harness) {
    await t.run(async (ctx) => { await ctx.db.insert("users", { publicId: "ai-operator", authSubject: "clerk-ai-operator", email: "operator@rivet.example", fullName: "Operator Lina", platformAdmin: true, status: "active", createdAt: Date.now(), updatedAt: Date.now() }); });
    return t.withIdentity({ subject: "clerk-ai-operator" });
  }
  const availability = (organizationId: string, available: boolean, reason: string) => ({ operation: "ai.platform.availability.set", input: { organizationId, available, reason }, correlationId: "cor-availability" });
  const listAvailability = { operation: "ai.platform.availability", input: {}, correlationId: "cor-availability-list" };
  const notAvailable = { data: expect.objectContaining({ code: "FEATURE_NOT_AVAILABLE", details: { reason: "not_available" } }) };
  type Gym = { organizationId: string; name: string; available: boolean; reason?: string; changedByName?: string };

  it("keeps every gym unavailable by default, so its owner can only keep assistance off", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-ai-owner" });
    expect(await owner.query(api.domain.query, op("ai.settings.get"))).toMatchObject({ platformAvailable: false, tenantMode: "off" });
    for (const input of [{ tenantMode: "prepare" }, { tenantMode: "execute" }, { externalProcessing: true }, { tenantMode: "prepare", externalProcessing: true }]) {
      await expect(owner.mutation(api.domain.mutate, op("ai.settings.update", { ...input, expectedRevision: 0 }))).rejects.toMatchObject(notAvailable);
    }
    await expect(owner.mutation(api.domain.mutate, op("ai.settings.update", { tenantMode: "off", expectedRevision: 0, reason: "Keeping it off" }))).resolves.toMatchObject({ tenantMode: "off", platformAvailable: false });
    expect(await t.run(async (ctx) => (await ctx.db.query("aiSettings").collect()).map((row) => [row.tenantMode, row.externalProcessing]))).toEqual([["off", false]]);
  });

  it("lets only a platform admin change availability, always with a reason, and records each change", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-ai-owner" });
    await expect(owner.query(api.domain.query, listAvailability)).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
    await expect(owner.mutation(api.domain.mutate, availability(ORG, true, "Owner wants it"))).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
    const admin = await operator(t);
    expect(((await admin.query(api.domain.query, listAvailability)) as { gyms: Gym[] }).gyms.map((gym) => [gym.organizationId, gym.available])).toEqual([[ORG, false], [FOREIGN_ORG, false]]);
    await expect(admin.mutation(api.domain.mutate, availability(ORG, true, "  "))).rejects.toMatchObject({ data: expect.objectContaining({ code: "VALIDATION_ERROR" }) });
    await expect(admin.mutation(api.domain.mutate, availability("no-such-gym", true, "Pilot"))).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
    expect(await admin.mutation(api.domain.mutate, availability(ORG, true, "Pilot gym"))).toMatchObject({ organizationId: ORG, available: true, reason: "Pilot gym", changedByName: "Operator Lina" });
    // Asking again changes nothing and records nothing.
    await admin.mutation(api.domain.mutate, availability(ORG, true, "Pilot gym again"));
    const audits = await t.run(async (ctx) => await ctx.db.query("platformAuditEvents").collect());
    expect(audits.map((row) => [row.action, row.entityPublicId, row.reason, row.actorName])).toEqual([["ai.gym.available", ORG, "Pilot gym", "Operator Lina"]]);
    // Now the owner may turn it on.
    await expect(owner.mutation(api.domain.mutate, op("ai.settings.update", { tenantMode: "prepare", externalProcessing: true, expectedRevision: 0 }))).resolves.toMatchObject({ platformAvailable: true, tenantMode: "prepare", externalProcessing: true });
  });

  it("makes only the chosen gym available", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const foreign = (await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", FOREIGN_ORG)).unique())!;
      const branch = (await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", foreign._id)).collect())[0]!;
      const user = await ctx.db.insert("users", { publicId: "foreign-owner", authSubject: "clerk-foreign-owner", email: "owner@other.example", fullName: "Other Owner", platformAdmin: false, status: "active", createdAt: Date.now(), updatedAt: Date.now() });
      await ctx.db.insert("organizationMemberships", { organizationId: foreign._id, userId: user, role: "owner", branchIds: [branch._id], branchScope: "all", active: true, createdAt: Date.now(), updatedAt: Date.now() });
    });
    const admin = await operator(t);
    await admin.mutation(api.domain.mutate, availability(ORG, true, "Pilot gym"));
    const foreignOwner = t.withIdentity({ subject: "clerk-foreign-owner" });
    const foreignOp = (operation: string, input: Record<string, unknown> = {}) => ({ operation, input, correlationId: "cor-foreign", organizationId: FOREIGN_ORG });
    expect(await foreignOwner.query(api.domain.query, foreignOp("ai.settings.get"))).toMatchObject({ platformAvailable: false });
    await expect(foreignOwner.mutation(api.domain.mutate, foreignOp("ai.settings.update", { tenantMode: "prepare", expectedRevision: 0 }))).rejects.toMatchObject(notAvailable);
    await expect(t.withIdentity({ subject: "clerk-ai-owner" }).mutation(api.domain.mutate, op("ai.settings.update", { tenantMode: "prepare", expectedRevision: 0 }))).resolves.toMatchObject({ platformAvailable: true });
  });

  it("reads a gym without availability as off at every gate, even with its own settings left on", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("aiAvailability").collect())[0]!;
      await ctx.db.patch(row._id, { available: false, reason: "Taken off the pilot" });
      await ctx.db.insert("aiGrants", { organizationId: ids.org, publicId: "standing-due", kind: "standing", playbook: "renewal_followups", playbookVersion: "renewal-followups.v1", grantorUserId: ids.owner, ownerUserId: ids.owner, tools: ["renewal.candidates", "member.context", "task.create_followup"], params: { bucket: "expiring", owner: "me", requestKey: "standing-due-key" }, limits: DEFAULT_RUN_LIMITS, schedule: { weekdays: [0, 1, 2, 3, 4, 5, 6], time: "08:00" }, status: "active", revision: 1, nextRunAt: Date.now() - 60_000, createdAt: Date.now(), updatedAt: Date.now() });
    });
    const sales = t.withIdentity({ subject: "clerk-ai-sales" });
    expect(await sales.query(api.domain.query, op("ai.member.brief", { memberId: "m-omar" }, { activeBranchId: MAIN }))).toEqual({ available: false, reason: "tenant_off" });
    await expect(startRun(t)).rejects.toMatchObject({ data: expect.objectContaining({ code: "FEATURE_NOT_AVAILABLE", details: { reason: "tenant_off" } }) });
    const settings = await t.withIdentity({ subject: "clerk-ai-owner" }).query(api.domain.query, op("ai.settings.get")) as { platformAvailable: boolean; tenantMode: string; capabilities: Array<{ available: boolean; effective: string }> };
    expect(settings).toMatchObject({ platformAvailable: false, tenantMode: "execute" });
    expect(settings.capabilities.every((item) => !item.available && item.effective === "off")).toBe(true);
    expect(await t.run(async (ctx) => await memberCapabilityOn(ctx, ids.org, "member_class_finder"))).toBe(false);
    // A due standing instruction skips its slot instead of starting work.
    expect(await t.mutation(internal.aiRuns.dispatchStanding, {})).toBe(0);
    expect(await t.run(async (ctx) => (await ctx.db.query("aiRuns").collect()).length)).toBe(0);
  });

  it("stops that gym's running work at the next step when availability is removed", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t, { aiMode: "execute" });
    const admin = await operator(t);
    const started = await startRun(t);
    const args = { organizationId: ids.org, runPublicId: started.id };
    const lease = await t.mutation(internal.aiRuns.acquireLease, args);
    await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! });
    expect(await admin.mutation(api.domain.mutate, availability(ORG, false, "Incident drill"))).toMatchObject({ available: false, reason: "Incident drill" });
    expect(await t.mutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token! })).toEqual({ done: true });
    expect((await getRun(t, started.id, "clerk-ai-owner")).status).toBe("cancelled");
    expect(await tasksOf(t, "m-huda")).toHaveLength(0);
    expect((await t.run(async (ctx) => await ctx.db.query("platformAuditEvents").collect())).map((row) => [row.action, row.reason])).toEqual([["ai.gym.unavailable", "Incident drill"]]);
    // The gym's own choice is kept; it simply cannot run, and ordinary work carries on.
    expect(await t.withIdentity({ subject: "clerk-ai-owner" }).query(api.domain.query, op("ai.settings.get"))).toMatchObject({ platformAvailable: false, tenantMode: "execute" });
    await expect(t.withIdentity({ subject: "clerk-ai-owner" }).query(api.domain.query, op("tasks.list", { status: "open", pageSize: 5 }))).resolves.toBeTruthy();
  });
});

describe("task titles RIVET prepares", () => {
  it("keeps a translatable title only on tasks delegated work saved; a person cannot claim one", async () => {
    const t = convexTest(schema, modules);
    await seed(t, { aiMode: "execute" });
    const owner = t.withIdentity({ subject: "clerk-ai-owner" });
    const created = await owner.mutation(api.domain.mutate, op("tasks.create", { type: "follow_up", title: "Call Lina about her plan", titleMessage: { key: "communicationCompletion.tasks.renewalCall", params: { name: "Someone else" } }, ownerId: "ai-owner", dueAt: "2026-10-23T09:00:00.000Z", memberId: "m-lina" }, { activeBranchId: MAIN })) as TaskRow;
    expect(created.title).toBe("Call Lina about her plan");
    expect(created.titleMessage).toBeUndefined();
    // Completing a prepared task names it in the timeline through the same descriptor.
    const started = await startRun(t);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [omarTask] = await tasksOf(t, "m-omar");
    expect((await getRun(t, started.id)).status).toBe("completed");
    await owner.mutation(api.domain.mutate, op("tasks.complete", { taskId: omarTask!.id, outcome: "Called" }, { activeBranchId: MAIN }));
    const timeline = await t.run(async (ctx) => (await ctx.db.query("domainRecords").collect()).filter((row) => row.entityType === "timeline").map((row) => row.data as { type: string; titleMessage?: { params?: Record<string, unknown> } }));
    expect(timeline.find((event) => event.type === "task_completed")?.titleMessage?.params?.title).toEqual({ message: { key: "communicationCompletion.tasks.renewalCallEveningClasses", params: { name: "Omar Haddad" } } });
  });
});
