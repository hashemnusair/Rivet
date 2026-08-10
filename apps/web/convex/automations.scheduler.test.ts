import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-automation-${name}` });

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-scheduler", name: "Scheduler Gym", slug: "scheduler-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "scheduler-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "scheduler-owner", authSubject: "clerk-scheduler-owner", email: "owner@scheduler.example", fullName: "Scheduler Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const manager = await ctx.db.insert("users", { publicId: "scheduler-manager", authSubject: "clerk-scheduler-manager", email: "manager@scheduler.example", fullName: "Scheduler Manager", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: manager, role: "manager", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: { id: "settings", notifications: { quietHoursStart: "23:59", quietHoursEnd: "00:01", automationDeliveryMode: "sandbox" } } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "member", publicId: "scheduler-member", branchId: branch, memberPublicId: "scheduler-member", createdAt: now, updatedAt: now, data: { id: "scheduler-member", fullName: "Opted Out Member", memberNumber: "MAIN-1000", homeBranchId: "scheduler-branch", status: "active", createdAt: "2020-01-01T00:00:00.000Z", lastCheckInAt: "2020-01-01T00:00:00.000Z", marketingOptIn: false, marketingPreference: { optedIn: false, source: "member_selected" } } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "automationRule", publicId: "scheduler-rule", createdAt: now, updatedAt: now, data: { id: "scheduler-rule", name: "Inactive member follow-up", trigger: "member_inactive", triggerParams: { days: 1 }, actions: [{ key: "queue_message", channel: "email", templateId: "inactive-member-v1" }, { key: "notify_manager" }], enabled: true, dedupeWindowHours: 24, executionsLast30Days: 0 } });
  });
}

describe("automation scheduler", () => {
  it("deduplicates repeated runs, suppresses opted-out marketing, and notifies managers", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const first = await t.mutation(internal.automations.evaluate, {});
    const second = await t.mutation(internal.automations.evaluate, {});
    expect(first).toMatchObject({ organizations: 1, rules: 1, executions: 1 });
    expect(second).toMatchObject({ organizations: 1, rules: 1, executions: 0, skipped: 1 });

    const persisted = await t.run(async (ctx) => ({
      executions: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "automationExecution")).collect(),
      messages: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "messageDelivery")).collect(),
      notifications: await ctx.db.query("operationalNotifications").collect(),
    }));
    expect(persisted.executions).toHaveLength(1);
    expect(persisted.messages).toHaveLength(1);
    const message = persisted.messages[0];
    expect(message).toBeDefined();
    expect(message?.data).toMatchObject({ messageClass: "marketing", requestedChannel: "email", status: "suppressed", suppressionReason: "Recipient opted out of marketing messages" });
    expect(persisted.notifications).toHaveLength(2);

    const owner = t.withIdentity({ subject: "clerk-scheduler-owner" });
    await expect(owner.query(api.domain.query, operation("automations.executions"))).resolves.toMatchObject({ items: [expect.objectContaining({ status: "completed" })] });
  });
});
