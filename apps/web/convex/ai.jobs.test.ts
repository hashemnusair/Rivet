import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

// Thursday 22 October 2026, 11:30 in Amman.
const NOW = new Date("2026-10-22T08:30:00.000Z");
const ORG = "jobs-org";
const MAIN = "jobs-main";
const op = (operation: string, input: Record<string, unknown> = {}) => ({ operation, input, correlationId: `cor-jobs-${operation}`, organizationId: ORG, activeBranchId: MAIN });

type Run = { id: string; status: string; errorCategory?: string; results: Array<{ kind: string; id: string }>; counts: Record<string, number> };
type Artifact = { id: string; kind: string; sections: Array<{ key: string; items: Array<{ key: string; message: { key: string; params?: Record<string, unknown> } }> }>; verification: { verified: boolean; checks: Array<{ key: string; ok: boolean }> }; coverage: Array<{ key: string; complete: boolean }> };

async function seed(t: TestConvex<typeof schema>): Promise<{ org: Id<"organizations">; main: Id<"branches"> }> {
  return await t.run(async (ctx) => {
    const now = NOW.getTime();
    const org = await ctx.db.insert("organizations", { publicId: ORG, name: "Jobs Gym", slug: "jobs-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const main = await ctx.db.insert("branches", { organizationId: org, publicId: MAIN, name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const person = async (publicId: string, role: "owner" | "manager" | "sales" | "receptionist") => {
      const id = await ctx.db.insert("users", { publicId, authSubject: `clerk-${publicId}`, email: `${publicId}@jobs.example`, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: org, userId: id, role, branchIds: [main], branchScope: role === "owner" || role === "manager" ? "all" : "selected", active: true, createdAt: now, updatedAt: now });
    };
    await person("jobs-owner", "owner");
    await person("jobs-desk", "receptionist");
    await person("jobs-sales", "sales");
    const rec = (entityType: string, publicId: string, value: Record<string, unknown>, memberPublicId?: string) => ctx.db.insert("domainRecords", { organizationId: org, entityType, publicId, branchId: main, ...(memberPublicId ? { memberPublicId } : {}), createdAt: now, updatedAt: now, data: { id: publicId, organizationId: ORG, ...value } });
    await rec("settings", "settings", { operationalPolicies: {} });
    await rec("member", "jobs-member", { fullName: "Lina Haddad", homeBranchId: MAIN, status: "active", memberNumber: "J-1" }, "jobs-member");
    await rec("charge", "jobs-charge", { memberId: "jobs-member", total: { amount: 30_000, currency: "JOD" }, outstandingAmount: { amount: 10_000, currency: "JOD" }, paidAmount: { amount: 20_000, currency: "JOD" }, issueDate: "2026-10-05", createdAt: "2026-10-05T08:00:00.000Z" }, "jobs-member");
    await rec("payment", "jobs-pay-1", { memberId: "jobs-member", branchId: MAIN, type: "payment", status: "completed", method: "cash", amount: { amount: 20_000, currency: "JOD" }, occurredAt: "2026-10-06T09:00:00.000Z" }, "jobs-member");
    await rec("payment", "jobs-refund-1", { memberId: "jobs-member", branchId: MAIN, type: "refund", status: "completed", method: "cash", amount: { amount: -5_000, currency: "JOD" }, occurredAt: "2026-10-07T09:00:00.000Z" }, "jobs-member");
    await rec("task", "jobs-task", { type: "follow_up", title: "Call Lina", ownerId: "jobs-sales", dueAt: "2026-10-22T10:00:00.000Z", priority: "normal", status: "open", memberId: "jobs-member", subjectName: "Lina Haddad", createdById: "jobs-sales", createdAt: "2026-10-20T07:00:00.000Z" }, "jobs-member");
    await ctx.db.insert("aiSettings", { organizationId: org, tenantMode: "execute", externalProcessing: false, capabilityModes: {}, revision: 1, updatedAt: now });
    // RIVET has made assistance available for this gym; without it every gate reads as off.
    const platformOperator = await ctx.db.insert("users", { publicId: "jobs-platform-operator", authSubject: "clerk-jobs-platform-operator", email: "operator@jobs.example", fullName: "Platform Operator", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("aiAvailability", { organizationId: org, available: true, reason: "Test gym", changedByUserId: platformOperator, changedAt: now });
    return { org, main };
  });
}

async function startAndFinish(t: TestConvex<typeof schema>, subject: string, playbook: string, params: Record<string, unknown>, requestKey: string): Promise<Run> {
  const started = await t.withIdentity({ subject }).mutation(api.domain.mutate, op("ai.run.start", { playbook, params, requestKey })) as Run;
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return await t.withIdentity({ subject }).query(api.domain.query, op("ai.run.get", { runId: started.id })) as Run;
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

describe("scoped management report", () => {
  it("saves a protected report whose money totals are checked against the payments list", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const run = await startAndFinish(t, "clerk-jobs-owner", "management_report", { from: "2026-10-01", to: "2026-10-21" }, "report-request-1");
    expect(run.status).toBe("completed");
    const artifactRef = run.results.find((ref) => ref.kind === "artifact");
    expect(artifactRef).toBeDefined();
    const artifact = await t.withIdentity({ subject: "clerk-jobs-owner" }).query(api.domain.query, op("ai.artifact.get", { artifactId: artifactRef!.id })) as Artifact;
    expect(artifact.kind).toBe("management_report");
    const money = artifact.sections.find((section) => section.key === "money")!;
    expect(money.items.find((item) => item.key === "collected")?.message.params).toMatchObject({ count: 1, amount: { amountMinor: 20_000, currency: "JOD" } });
    expect(money.items.find((item) => item.key === "refunded")?.message.params).toMatchObject({ count: 1, amount: { amountMinor: 5_000, currency: "JOD" } });
    expect(money.items.find((item) => item.key === "outstanding")?.message.params).toMatchObject({ amount: { amountMinor: 10_000, currency: "JOD" } });
    expect(artifact.verification.checks.filter((check) => check.key === "collected" || check.key === "refunded")).toEqual([expect.objectContaining({ ok: true }), expect.objectContaining({ ok: true })]);
    expect(artifact.verification.verified).toBe(true);
  });

  it("is refused to staff without financial access, and the saved report is rechecked on every read", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await expect(t.withIdentity({ subject: "clerk-jobs-desk" }).mutation(api.domain.mutate, op("ai.run.start", { playbook: "management_report", params: { from: "2026-10-01", to: "2026-10-21" }, requestKey: "report-request-2" }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
    const run = await startAndFinish(t, "clerk-jobs-owner", "management_report", { from: "2026-10-01", to: "2026-10-21" }, "report-request-3");
    const artifactId = run.results.find((ref) => ref.kind === "artifact")!.id;
    await expect(t.withIdentity({ subject: "clerk-jobs-desk" }).query(api.domain.query, op("ai.artifact.get", { artifactId }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "FORBIDDEN" }) });
    vi.setSystemTime(NOW.getTime() + 31 * 86_400_000);
    await expect(t.withIdentity({ subject: "clerk-jobs-owner" }).query(api.domain.query, op("ai.artifact.get", { artifactId }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
  });

  it("prepares the payments download through the existing export job when asked", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const run = await startAndFinish(t, "clerk-jobs-owner", "management_report", { from: "2026-10-01", to: "2026-10-21", includeExport: true }, "report-request-4");
    expect(run.status).toBe("completed");
    expect(run.results.map((ref) => ref.kind).sort()).toEqual(["artifact", "export"]);
    const exports = await t.withIdentity({ subject: "clerk-jobs-owner" }).query(api.domain.query, op("exports.list")) as Array<{ id: string; kind: string }>;
    expect(exports.map((job) => job.kind)).toContain("payments");
  });
});

describe("next-shift handover", () => {
  it("lists unfinished work, marks what it could not read, and assigns the handover once", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const run = await startAndFinish(t, "clerk-jobs-owner", "shift_handover", { assigneeId: "jobs-desk" }, "handover-request-1");
    expect(run.status).toBe("completed");
    const artifactId = run.results.find((ref) => ref.kind === "artifact")!.id;
    const artifact = await t.withIdentity({ subject: "clerk-jobs-desk" }).query(api.domain.query, op("ai.artifact.get", { artifactId })) as Artifact;
    expect(artifact.sections.find((section) => section.key === "followUps")?.items.map((item) => item.message.params?.title)).toEqual(["Call Lina"]);
    expect(artifact.coverage.find((item) => item.key === "cash")?.complete).toBe(true);
    const tasks = await t.withIdentity({ subject: "clerk-jobs-owner" }).query(api.domain.query, op("tasks.list", { status: "open", ownerId: "jobs-desk", pageSize: 20 })) as { items: Array<{ title: string; origin?: { runId: string } }> };
    expect(tasks.items).toEqual([expect.objectContaining({ title: "Read the handover for 2026-10-22", origin: expect.objectContaining({ runId: run.id }) })]);
    // A second handover for the same person and day links the same task.
    const again = await startAndFinish(t, "clerk-jobs-owner", "shift_handover", { assigneeId: "jobs-desk" }, "handover-request-2");
    expect(again.counts).toMatchObject({ created: 0, linked: 1 });
    expect((await t.withIdentity({ subject: "clerk-jobs-owner" }).query(api.domain.query, op("tasks.list", { status: "open", ownerId: "jobs-desk", pageSize: 20 })) as { items: unknown[] }).items).toHaveLength(1);
  });

  it("shows missing sources plainly for a receptionist instead of pretending they are empty", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const run = await startAndFinish(t, "clerk-jobs-desk", "shift_handover", {}, "handover-request-3");
    expect(run.status).toBe("completed");
    const artifact = await t.withIdentity({ subject: "clerk-jobs-desk" }).query(api.domain.query, op("ai.artifact.get", { artifactId: run.results[0]!.id })) as Artifact;
    expect(artifact.coverage.find((item) => item.key === "followUps")?.complete).toBe(true);
    expect(artifact.coverage.find((item) => item.key === "cash")?.complete).toBe(true);
    expect(artifact.verification.verified).toBe(artifact.coverage.every((item) => item.complete));
  });
});
