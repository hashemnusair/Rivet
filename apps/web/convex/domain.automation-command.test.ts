import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-test-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };
const previousAutomationLive = process.env.RIVET_AUTOMATIONS_LIVE;

beforeEach(() => {
  process.env.RIVET_AUTOMATIONS_LIVE = "true";
});

afterAll(() => {
  if (previousAutomationLive === undefined) delete process.env.RIVET_AUTOMATIONS_LIVE;
  else process.env.RIVET_AUTOMATIONS_LIVE = previousAutomationLive;
});

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-a", name: "Gym A", slug: "gym-a", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const otherOrganization = await ctx.db.insert("organizations", { publicId: "org-b", name: "Gym B", slug: "gym-b", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-a", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const otherBranch = await ctx.db.insert("branches", { organizationId: otherOrganization, publicId: "branch-b", name: "Other", code: "OTHER", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner-a", authSubject: "clerk-owner-a", email: "owner-a@example.com", fullName: "Owner A", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const otherOwner = await ctx.db.insert("users", { publicId: "owner-b", authSubject: "clerk-owner-b", email: "owner-b@example.com", fullName: "Owner B", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: otherOrganization, userId: otherOwner, role: "owner", branchIds: [otherBranch], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "member", publicId: "member-a", branchId: branch, memberPublicId: "member-a", createdAt: now, updatedAt: now, data: { id: "member-a", fullName: "Inactive Member", homeBranchId: "branch-a", createdAt: "2026-01-01T00:00:00.000Z", lastCheckInAt: "2026-01-01T00:00:00.000Z" } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "automationRule", publicId: "rule-a", createdAt: now, updatedAt: now, data: { id: "rule-a", name: "Inactive follow-up", trigger: "member_inactive", triggerParams: { days: 1 }, actions: [{ key: "create_task", taskOwnerRole: "salesperson", taskTitle: "Call inactive member" }, { key: "queue_message", templateId: "template-a", channel: "whatsapp" }, { key: "notify_manager" }], enabled: true, dedupeWindowHours: 24, executionsLast30Days: 0, updatedAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: otherOrganization, entityType: "automationRule", publicId: "rule-b", createdAt: now, updatedAt: now, data: { id: "rule-b", name: "Other tenant rule", trigger: "member_inactive", triggerParams: { days: 1 }, actions: [{ key: "notify_manager" }], enabled: true, dedupeWindowHours: 24, executionsLast30Days: 0, updatedAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "automationExecution", publicId: "failed-execution", branchId: branch, memberPublicId: "member-a", createdAt: now, updatedAt: now, data: { id: "failed-execution", ruleId: "rule-a", ruleName: "Inactive follow-up", subjectType: "member", subjectId: "member-a", subjectName: "Inactive Member", status: "failed", executedAt: new Date(now).toISOString(), actionResults: [{ key: "queue_message", status: "failed" }], attemptHistory: [{ action: "queue_message", attempt: 1, status: "failed", occurredAt: new Date(now).toISOString(), reason: "Redacted transient provider failure" }], retryPolicy: { maxAttempts: 3, backoffMinutes: [1, 5, 30] } } });
  });
}

describe("exported Convex automation command center", () => {
  it("reports provider readiness and rejects writes while the global pause is active", async () => {
    delete process.env.RIVET_AUTOMATIONS_LIVE;
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-a" });
    const summary = await owner.query(api.domain.query, operation("automations.monitoring")) as { globallyPaused: boolean; ruleCount: number; persistedEnabledCount: number; failureCount: number; providers: Array<{ key: string; live: boolean }> };
    expect(summary).toMatchObject({ globallyPaused: true, ruleCount: 1, persistedEnabledCount: 1, failureCount: 1 });
    expect(summary.providers).toEqual(expect.arrayContaining([expect.objectContaining({ key: "internal_tasks", live: false }), expect.objectContaining({ key: "sms_whatsapp", live: false })]));
    await expectCode(owner.mutation(api.domain.mutate, operation("automations.run", { ruleId: "rule-a", reason: "Should remain paused" })), "FEATURE_NOT_AVAILABLE");
  });

  it("previews, reason-gates, executes, deduplicates, and audits a forced run", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-a" });
    const preview = await owner.query(api.domain.query, operation("automations.run.preview", { ruleId: "rule-a" })) as { eligibleCount: number; duplicateCount: number; candidates: Array<{ subjectName: string }> };
    expect(preview).toMatchObject({ eligibleCount: 1, duplicateCount: 0, candidates: [{ subjectName: "Inactive Member" }] });
    await expectCode(owner.mutation(api.domain.mutate, operation("automations.run", { ruleId: "rule-a", reason: "" })), "VALIDATION_ERROR");
    expect(await owner.mutation(api.domain.mutate, operation("automations.run", { ruleId: "rule-a", reason: "Pilot operator verification" }))).toEqual({ created: 1, skippedDuplicates: 0 });
    expect(await owner.mutation(api.domain.mutate, operation("automations.run", { ruleId: "rule-a", reason: "Verify dedupe behavior" }))).toEqual({ created: 0, skippedDuplicates: 1 });
    await expectCode(owner.query(api.domain.query, operation("automations.run.preview", { ruleId: "rule-b" })), "NOT_FOUND");

    const persisted = await t.run(async (ctx) => ({
      executions: (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "automationExecution")).collect()).filter((record) => record.publicId !== "failed-execution"),
      tasks: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "task")).collect(),
      notifications: await ctx.db.query("operationalNotifications").collect(),
      messages: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "messageDelivery")).collect(),
      audit: (await ctx.db.query("auditEvents").collect()).filter((event) => event.action === "automation.rule_run_now"),
    }));
    expect(persisted.executions).toHaveLength(1);
    expect(persisted.tasks).toHaveLength(1);
    expect(persisted.notifications).toHaveLength(1);
    expect(persisted.messages).toEqual([expect.objectContaining({ data: expect.objectContaining({ messageClass: "marketing", status: "suppressed", suppressionReason: "Recipient marketing preference is unknown" }) })]);
    expect(persisted.executions[0]?.data).toMatchObject({ actionResults: expect.arrayContaining([expect.objectContaining({ key: "queue_message", status: "suppressed" })]) });
    expect(persisted.audit).toHaveLength(2);
    expect(persisted.audit[0]).toMatchObject({ reason: "Pilot operator verification", after: { created: 1, skippedDuplicates: 0 } });
  });

  it("reason-gates retries and appends attempt history without claiming provider delivery", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-a" });
    await expectCode(owner.mutation(api.domain.mutate, operation("automations.execution.retry", { executionId: "failed-execution", reason: "" })), "VALIDATION_ERROR");
    const retried = await owner.mutation(api.domain.mutate, operation("automations.execution.retry", { executionId: "failed-execution", reason: "Transient failure verified" })) as { status: string; detail: string; attemptHistory: Array<{ attempt: number; status: string }> };
    expect(retried).toMatchObject({ status: "retrying", detail: "Manual retry queued in sandbox.", attemptHistory: [{ attempt: 1, status: "failed" }, { attempt: 2, status: "queued" }] });
    await expectCode(owner.mutation(api.domain.mutate, operation("automations.execution.retry", { executionId: "failed-execution", reason: "Duplicate retry" })), "VALIDATION_ERROR");
    const audits = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((event) => event.action === "automation.execution_retry"));
    expect(audits).toEqual([expect.objectContaining({ reason: "Transient failure verified", before: { status: "failed", attempt: 1 }, after: { status: "retrying", attempt: 2 } })]);
  });

  it("rejects malformed rule configuration at the server boundary", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-a" });
    await expectCode(owner.mutation(api.domain.mutate, operation("automations.rule.create", {
      name: "Missing template",
      trigger: "membership_expired",
      triggerParams: { daysAfter: 1 },
      actions: [{ key: "queue_message", channel: "whatsapp" }],
      enabled: true,
      dedupeWindowHours: 24,
    })), "VALIDATION_ERROR");
  });

  it("preserves the correct parameter shape when an expired-membership rule is edited", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-a" });
    const created = await owner.mutation(api.domain.mutate, operation("automations.rule.create", {
      name: "Expired membership follow-up",
      trigger: "membership_expired",
      triggerParams: { daysAfter: 2 },
      actions: [{ key: "notify_manager" }],
      enabled: true,
      dedupeWindowHours: 24,
    })) as { id: string; triggerParams: Record<string, unknown> };
    expect(created.triggerParams).toEqual({ daysAfter: 2 });
    const updated = await owner.mutation(api.domain.mutate, operation("automations.rule.update", { id: created.id, triggerParams: { daysAfter: 0 } })) as { triggerParams: Record<string, unknown> };
    expect(updated.triggerParams).toEqual({ daysAfter: 0 });
  });
});
