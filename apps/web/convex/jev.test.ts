import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { jevLeaseKey, jevStateHash } from "./jevAnswers";
import { getJevQuestion } from "./jevQuestions";
import type { JevJudgeResult, JevStatusView } from "./jevRegistry";
import schema from "./schema";

declare global {
  interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; }
}

const modules = import.meta.glob("./**/*.ts");
const scoped = <Extra extends Record<string, unknown> = Record<never, never>>(organizationId: string, extra?: Extra) => ({ organizationId, correlationId: `cor-test-${organizationId}`, ...(extra ?? ({} as Extra)) });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const orgA = await ctx.db.insert("organizations", { publicId: "org-a", name: "Gym A", slug: "gym-a", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const orgB = await ctx.db.insert("organizations", { publicId: "org-b", name: "Gym B", slug: "gym-b", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: orgA, publicId: "branch-a", name: "Gym A Main", code: "A", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: orgB, publicId: "branch-b", name: "Gym B Main", code: "B", active: true, status: "active", createdAt: now, updatedAt: now });
    const user = async (publicId: string, subject: string) => await ctx.db.insert("users", { publicId, authSubject: subject, email: `${publicId}@example.com`, fullName: publicId, platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const ownerA = await user("owner-a", "clerk-owner-a");
    const receptionA = await user("reception-a", "clerk-reception-a");
    const ownerB = await user("owner-b", "clerk-owner-b");
    const membership = async (organizationId: typeof orgA, userId: typeof ownerA, role: "owner" | "receptionist", branchId: typeof branchA) => await ctx.db.insert("organizationMemberships", { organizationId, userId, role, branchIds: [branchId], active: true, branchScope: role === "owner" ? "all" : "selected", createdAt: now, updatedAt: now });
    await membership(orgA, ownerA, "owner", branchA);
    await membership(orgA, receptionA, "receptionist", branchA);
    await membership(orgB, ownerB, "owner", branchB);
  });
}

async function harness() {
  const t = convexTest(schema, modules);
  await seed(t);
  return {
    t,
    ownerA: t.withIdentity({ subject: "clerk-owner-a" }),
    receptionA: t.withIdentity({ subject: "clerk-reception-a" }),
    ownerB: t.withIdentity({ subject: "clerk-owner-b" }),
  };
}

const fixtureMode = () => vi.stubEnv("RIVET_JEV_MODE", "fixture");

afterEach(() => vi.unstubAllEnvs());

describe("Jev status and the gym's own switch", () => {
  it("requires a signed-in actor and hides foreign gyms", async () => {
    const { t, ownerA } = await harness();
    await expectCode(t.query(api.jev.status, scoped("org-a")), "UNAUTHENTICATED");
    // The tenant boundary answers with FORBIDDEN for a gym the actor does not belong to, as every other workspace query does.
    await expectCode(ownerA.query(api.jev.status, scoped("org-b")), "FORBIDDEN");
    const status = await ownerA.query(api.jev.status, scoped("org-a")) as JevStatusView;
    expect(status).toMatchObject({ mode: "off", ready: false, blockedReason: "mode_off", keyConfigured: false, freeTerms: "unconfirmed", tenant: { enabled: false }, breaker: { tripped: false }, canManage: true });
    expect(status.features.map((feature) => feature.key)).toContain("foundation");
    expect(status.features[0]!.questions.map((question) => question.key)).toEqual(expect.arrayContaining(["foundation.refund_detected", "foundation.plan_fit"]));
    expect(JSON.stringify(status)).not.toContain("AI_GATEWAY_API_KEY=");
  });

  it("lets only a settings manager change the switch, and audits the change", async () => {
    const { t, ownerA, receptionA } = await harness();
    await expectCode(receptionA.mutation(api.jev.updateTenantPreference, scoped("org-a", { enabled: true })), "FORBIDDEN");
    expect((await receptionA.query(api.jev.status, scoped("org-a")) as JevStatusView).canManage).toBe(false);
    const status = await ownerA.mutation(api.jev.updateTenantPreference, scoped("org-a", { enabled: true, reason: "Pilot the suggestions" })) as JevStatusView;
    expect(status.tenant).toMatchObject({ enabled: true, updatedBy: "owner-a", reason: "Pilot the suggestions" });
    await t.run(async (ctx) => {
      const audit = (await ctx.db.query("auditEvents").collect()).find((event) => event.action === "settings.assist.update");
      expect(audit).toMatchObject({ category: "settings", before: { enabled: false }, after: { enabled: true }, reason: "Pilot the suggestions", actorPublicId: "owner-a" });
      expect((await ctx.db.query("jevTenantPreferences").collect()).map((row) => row.enabled)).toEqual([true]);
    });
  });
});

describe("Jev judgments", () => {
  it("refuses every request while the environment is off, without touching counters or leases", async () => {
    const { t, ownerA } = await harness();
    await ownerA.mutation(api.jev.updateTenantPreference, scoped("org-a", { enabled: true }));
    const result = await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.refund_detected" })) as JevJudgeResult;
    expect(result).toEqual({ status: "blocked", reason: "mode_off", message: expect.stringContaining("switched off") });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jevRequests").collect()).toEqual([]);
      expect(await ctx.db.query("jevUsage").collect()).toEqual([]);
    });
  });

  it("refuses a gym that has not switched suggestions on, and an actor without the question's permission", async () => {
    fixtureMode();
    const { ownerA, receptionA } = await harness();
    expect(await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.refund_detected" }))).toMatchObject({ status: "blocked", reason: "tenant_off" });
    await ownerA.mutation(api.jev.updateTenantPreference, scoped("org-a", { enabled: true }));
    await expectCode(receptionA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.refund_detected" })), "FORBIDDEN");
    expect(await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.not_registered" }))).toMatchObject({ status: "blocked", reason: "unknown_question" });
  });

  it("answers every foundation fixture in fixture mode and records the request and usage", async () => {
    fixtureMode();
    const { t, ownerA } = await harness();
    await ownerA.mutation(api.jev.updateTenantPreference, scoped("org-a", { enabled: true }));
    for (const key of ["foundation.refund_detected", "foundation.ticket_route", "foundation.plan_fit", "foundation.note_urgency"]) {
      const result = await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: key })) as JevJudgeResult;
      expect(result, key).toMatchObject({ status: "ready", source: "fixture", questionKey: key, judgment: getJevQuestion(key)!.fixture.judgment, modelId: "typesafe-ai/jev" });
    }
    await t.run(async (ctx) => {
      const requests = await ctx.db.query("jevRequests").collect();
      expect(requests.map((row) => row.status)).toEqual(["completed", "completed", "completed", "completed"]);
      const usage = await ctx.db.query("jevUsage").collect();
      expect(usage).toHaveLength(1);
      expect(usage[0]).toMatchObject({ requests: 4, reportedCostUsd: 0 });
      const global = (await ctx.db.query("jevControlState").collect()).find((row) => row.key === "global-usage");
      expect(global?.requests).toBe(4);
    });
    const status = await ownerA.query(api.jev.status, scoped("org-a")) as JevStatusView;
    expect(status).toMatchObject({ ready: true, readyMode: "fixture", usage: { tenantRequests: 4, globalRequests: 4 } });
  });

  it("serves a cached judgment only to the same gym for the same state", async () => {
    fixtureMode();
    const { t, ownerA, ownerB } = await harness();
    await ownerA.mutation(api.jev.updateTenantPreference, scoped("org-a", { enabled: true }));
    await ownerB.mutation(api.jev.updateTenantPreference, scoped("org-b", { enabled: true }));
    const first = await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.note_urgency" })) as JevJudgeResult;
    const second = await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.note_urgency" })) as JevJudgeResult;
    expect(first).toMatchObject({ status: "ready", source: "fixture" });
    expect(second).toMatchObject({ status: "ready", source: "cache", stateHash: (first as { stateHash: string }).stateHash });
    const other = await ownerB.action(api.jevInference.judge, scoped("org-b", { questionKey: "foundation.note_urgency" })) as JevJudgeResult;
    expect(other).toMatchObject({ status: "ready", source: "fixture" });
    // Questions that opt out of caching are always answered afresh.
    expect(await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.refund_detected" }))).toMatchObject({ status: "ready", source: "fixture" });
    expect(await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.refund_detected" }))).toMatchObject({ status: "ready", source: "fixture" });
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("jevJudgments").collect();
      const organizations = await ctx.db.query("organizations").collect();
      const byOrg = Object.fromEntries(organizations.map((organization) => [organization.publicId, rows.filter((row) => row.organizationId === organization._id).length]));
      expect(byOrg).toEqual({ "org-a": 1, "org-b": 1 });
      expect(rows.every((row) => row.source === "fixture" && row.questionKey === "foundation.note_urgency")).toBe(true);
    });
  });

  it("turns a simulated unusable answer or outage into an unavailable status that the page can ignore", async () => {
    fixtureMode();
    const { t, ownerA } = await harness();
    await ownerA.mutation(api.jev.updateTenantPreference, scoped("org-a", { enabled: true }));
    expect(await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.ticket_route", subject: { simulate: "invalid_output" } }))).toMatchObject({ status: "unavailable", reason: "invalid_output", retryable: false });
    expect(await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.ticket_route", subject: { simulate: "timeout" } }))).toMatchObject({ status: "unavailable", reason: "timeout", retryable: true });
    await t.run(async (ctx) => {
      expect((await ctx.db.query("jevRequests").collect()).map((row) => [row.status, row.failureReason])).toEqual([["failed", "invalid_output"], ["failed", "timeout"]]);
      expect(await ctx.db.query("jevJudgments").collect()).toEqual([]);
    });
  });

  it("tells a duplicate request to wait while an identical one holds the lease", async () => {
    fixtureMode();
    const { t, ownerA } = await harness();
    await ownerA.mutation(api.jev.updateTenantPreference, scoped("org-a", { enabled: true }));
    const question = getJevQuestion("foundation.refund_detected")!;
    const stateHash = jevStateHash({ questionKey: question.key, questionVersion: question.version, sourceVersion: `fixture:${question.version}`, state: question.fixture.state });
    await t.run(async (ctx) => {
      const organization = (await ctx.db.query("organizations").collect()).find((row) => row.publicId === "org-a")!;
      const user = (await ctx.db.query("users").collect()).find((row) => row.publicId === "owner-a")!;
      await ctx.db.insert("jevRequests", { organizationId: organization._id, leaseKey: jevLeaseKey(question.key, "synthetic", stateHash), status: "pending", mode: "fixture", requestedByUserId: user._id, correlationId: "cor-other", startedAt: Date.now(), leaseExpiresAt: Date.now() + 60_000 });
    });
    expect(await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.refund_detected" }))).toEqual({ status: "in_progress", retryAfterMs: 1_500 });
  });

  it("rejects a judgment whose state changed while the model was answering", async () => {
    fixtureMode();
    const { t, ownerA } = await harness();
    await ownerA.mutation(api.jev.updateTenantPreference, scoped("org-a", { enabled: true }));
    const question = getJevQuestion("foundation.note_urgency")!;
    const requestId = await t.run(async (ctx) => {
      const organization = (await ctx.db.query("organizations").collect()).find((row) => row.publicId === "org-a")!;
      const user = (await ctx.db.query("users").collect()).find((row) => row.publicId === "owner-a")!;
      return await ctx.db.insert("jevRequests", { organizationId: organization._id, leaseKey: "lease", status: "pending", mode: "fixture", requestedByUserId: user._id, correlationId: "cor-stale", startedAt: Date.now(), leaseExpiresAt: Date.now() + 60_000 });
    });
    const result = await ownerA.mutation(internal.jev.complete, {
      ...scoped("org-a"),
      requestId,
      questionKey: question.key,
      stateHash: "0".repeat(64),
      source: "fixture",
      judgment: question.fixture.judgment,
      modelId: "typesafe-ai/jev",
      latencyMs: 12,
      warnings: [],
    }) as JevJudgeResult;
    expect(result).toMatchObject({ status: "stale" });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(requestId))?.status).toBe("stale");
      expect(await ctx.db.query("jevJudgments").collect()).toEqual([]);
    });
  });

  it("refuses to complete a request that belongs to another gym", async () => {
    fixtureMode();
    const { t, ownerB } = await harness();
    const question = getJevQuestion("foundation.note_urgency")!;
    const requestId = await t.run(async (ctx) => {
      const organization = (await ctx.db.query("organizations").collect()).find((row) => row.publicId === "org-a")!;
      const user = (await ctx.db.query("users").collect()).find((row) => row.publicId === "owner-a")!;
      return await ctx.db.insert("jevRequests", { organizationId: organization._id, leaseKey: "lease", status: "pending", mode: "fixture", requestedByUserId: user._id, correlationId: "cor-foreign", startedAt: Date.now(), leaseExpiresAt: Date.now() + 60_000 });
    });
    await expectCode(ownerB.mutation(internal.jev.complete, { ...scoped("org-b"), requestId, questionKey: question.key, stateHash: "0".repeat(64), source: "fixture", judgment: question.fixture.judgment, modelId: "typesafe-ai/jev", latencyMs: 1, warnings: [] }), "NOT_FOUND");
  });

  it("stops live calls until the free terms, key, breaker and caps all agree", async () => {
    vi.stubEnv("RIVET_JEV_MODE", "live");
    vi.stubEnv("RIVET_JEV_FEATURES", "foundation");
    const { t, ownerA } = await harness();
    await ownerA.mutation(api.jev.updateTenantPreference, scoped("org-a", { enabled: true }));
    expect(await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.refund_detected" }))).toMatchObject({ status: "blocked", reason: "key_missing" });
    vi.stubEnv("AI_GATEWAY_API_KEY", "placeholder-not-a-real-key");
    expect(await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.refund_detected" }))).toMatchObject({ status: "blocked", reason: "free_terms_unconfirmed" });
    vi.stubEnv("RIVET_JEV_FREE_UNTIL", "2000-01-01");
    expect(await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.refund_detected" }))).toMatchObject({ status: "blocked", reason: "free_terms_expired" });
    vi.stubEnv("RIVET_JEV_FREE_UNTIL", "2999-12-31");
    await t.run(async (ctx) => { await ctx.db.insert("jevControlState", { key: "breaker", trippedAt: Date.now(), tripReason: "test", updatedAt: Date.now() }); });
    expect(await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.refund_detected" }))).toMatchObject({ status: "blocked", reason: "breaker_tripped" });
    await t.mutation(internal.jev.resetBreaker, { reason: "Reviewed the AI Gateway bill in a test" });
    vi.stubEnv("RIVET_JEV_DAILY_CAP", "0");
    expect(await ownerA.action(api.jevInference.judge, scoped("org-a", { questionKey: "foundation.refund_detected" }))).toMatchObject({ status: "blocked", reason: "daily_cap" });
    const status = await ownerA.query(api.jev.status, scoped("org-a")) as JevStatusView;
    expect(status).toMatchObject({ mode: "live", keyConfigured: true, freeTerms: "confirmed", breaker: { tripped: false }, ready: false, blockedReason: "daily_cap" });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jevRequests").collect()).toEqual([]);
    });
  });

  it("trips the breaker when a live completion reports a cost", async () => {
    vi.stubEnv("RIVET_JEV_MODE", "live");
    const { t, ownerA } = await harness();
    const question = getJevQuestion("foundation.refund_detected")!;
    const requestId = await t.run(async (ctx) => {
      const organization = (await ctx.db.query("organizations").collect()).find((row) => row.publicId === "org-a")!;
      const user = (await ctx.db.query("users").collect()).find((row) => row.publicId === "owner-a")!;
      await ctx.db.insert("jevUsage", { organizationId: organization._id, day: new Date().toISOString().slice(0, 10), requests: 1, inputTokens: 0, outputTokens: 0, reportedCostUsd: 0, updatedAt: Date.now() });
      return await ctx.db.insert("jevRequests", { organizationId: organization._id, leaseKey: "lease", status: "pending", mode: "live", requestedByUserId: user._id, correlationId: "cor-cost", startedAt: Date.now(), leaseExpiresAt: Date.now() + 60_000 });
    });
    const stateHash = jevStateHash({ questionKey: question.key, questionVersion: question.version, sourceVersion: `fixture:${question.version}`, state: question.fixture.state });
    const result = await ownerA.mutation(internal.jev.complete, { ...scoped("org-a"), requestId, questionKey: question.key, stateHash, source: "live", judgment: question.fixture.judgment, modelId: "typesafe-ai/jev", inputTokens: 300, outputTokens: 0, reportedCostUsd: 0.0000126, latencyMs: 210, warnings: [] }) as JevJudgeResult;
    expect(result).toMatchObject({ status: "ready", source: "live", warning: expect.stringContaining("stopped") });
    const status = await ownerA.query(api.jev.status, scoped("org-a")) as JevStatusView;
    expect(status.breaker).toMatchObject({ tripped: true, reason: expect.stringContaining("0.0000126") });
    await t.run(async (ctx) => {
      expect((await ctx.db.query("jevUsage").collect())[0]).toMatchObject({ inputTokens: 300, reportedCostUsd: 0.0000126 });
    });
  });

  it("cleans up expired judgments and old request rows in bounded batches", async () => {
    const { t } = await harness();
    await t.run(async (ctx) => {
      const organization = (await ctx.db.query("organizations").collect()).find((row) => row.publicId === "org-a")!;
      const user = (await ctx.db.query("users").collect()).find((row) => row.publicId === "owner-a")!;
      const now = Date.now();
      const judgment = { organizationId: organization._id, questionKey: "foundation.note_urgency", questionVersion: 1, registryVersion: 1, scopeKey: "synthetic", stateHash: "h", sourceVersion: "fixture:1", source: "fixture" as const, modelId: "typesafe-ai/jev", judgment: {}, latencyMs: 1, requestedByUserId: user._id, correlationId: "c", createdAt: now };
      await ctx.db.insert("jevJudgments", { ...judgment, expiresAt: now - 1 });
      await ctx.db.insert("jevJudgments", { ...judgment, expiresAt: now + 60_000 });
      await ctx.db.insert("jevRequests", { organizationId: organization._id, leaseKey: "old", status: "completed", mode: "fixture", requestedByUserId: user._id, correlationId: "c", startedAt: now - 2 * 86_400_000, leaseExpiresAt: now - 2 * 86_400_000 });
      await ctx.db.insert("jevRequests", { organizationId: organization._id, leaseKey: "new", status: "completed", mode: "fixture", requestedByUserId: user._id, correlationId: "c", startedAt: now, leaseExpiresAt: now + 10_000 });
    });
    expect(await t.mutation(internal.jev.cleanupExpired, {})).toEqual({ judgments: 1, requests: 1 });
    await t.run(async (ctx) => {
      expect(await ctx.db.query("jevJudgments").collect()).toHaveLength(1);
      expect((await ctx.db.query("jevRequests").collect()).map((row) => row.leaseKey)).toEqual(["new"]);
    });
  });
});

/** Convex ids are opaque; this keeps the helper typed without a cast at every call site. */
export type SeededId = Id<"organizations">;
