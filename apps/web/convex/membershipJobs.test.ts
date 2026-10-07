import { afterEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const previous = { live: process.env.RIVET_OPERATIONAL_EMAIL_LIVE, key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL };
afterEach(() => {
  for (const [key, value] of Object.entries({ RIVET_OPERATIONAL_EMAIL_LIVE: previous.live, RESEND_API_KEY: previous.key, RESEND_FROM_EMAIL: previous.from })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

function isoDate(offsetDays: number): string {
  return new Date(Date.UTC(2026, 7, 12 + offsetDays)).toISOString().slice(0, 10);
}

describe("membership lifecycle reminder job", () => {
  it("queues exact seven-day and one-day reminders once and notifies the linked member", async () => {
    process.env.RIVET_OPERATIONAL_EMAIL_LIVE = "true";
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "noreply@rivetjo.com";
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const now = Date.UTC(2026, 7, 12, 12);
      const organizationId = await ctx.db.insert("organizations", { publicId: "reminder-org", name: "Reminder Gym", slug: "reminder-gym", status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
      const branchId = await ctx.db.insert("branches", { organizationId, publicId: "reminder-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
      const ownerId = await ctx.db.insert("users", { publicId: "owner", authSubject: "owner", email: "owner@example.test", fullName: "Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      const customerId = await ctx.db.insert("users", { publicId: "customer", authSubject: "customer", email: "member@example.test", fullName: "Member", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("operationalEmailSettings", { organizationId, enabledKinds: ["renewal_reminder", "membership_expiry"], updatedByUserId: ownerId, reason: "Reviewed", ownerConfirmedAt: now, ownerConfirmedByUserId: ownerId, createdAt: now, updatedAt: now });
      for (const [id, endDate] of [["membership-seven", isoDate(7)], ["membership-one", isoDate(1)]] as const) {
        await ctx.db.insert("domainRecords", { organizationId, entityType: "member", publicId: `member-${id}`, branchId, memberPublicId: `member-${id}`, createdAt: now, updatedAt: now, data: { id: `member-${id}`, email: "member@example.test", preferredLanguage: id.endsWith("one") ? "ar" : "en" } });
        await ctx.db.insert("domainRecords", { organizationId, entityType: "membership", publicId: id, branchId, memberPublicId: `member-${id}`, createdAt: now, updatedAt: now, data: { id, memberId: `member-${id}`, startDate: isoDate(-20), endDate } });
        await ctx.db.insert("domainRecords", { organizationId, entityType: "customerMembership", publicId: id, branchId, memberPublicId: `member-${id}`, createdAt: now, updatedAt: now, data: { customerUserId: "customer", memberId: `member-${id}` } });
      }
      void customerId;
    });
    const now = Date.UTC(2026, 7, 12, 12);
    expect(await t.mutation(internal.membershipJobs.queueLifecycleReminders, { now })).toEqual({ scanned: 2, queued: 2, notified: 2 });
    expect(await t.mutation(internal.membershipJobs.queueLifecycleReminders, { now })).toEqual({ scanned: 2, queued: 0, notified: 0 });
    const state = await t.run(async (ctx) => ({ deliveries: await ctx.db.query("operationalEmailDeliveries").collect(), notifications: await ctx.db.query("operationalNotifications").collect() }));
    expect(state.deliveries.map((row) => [row.kind, row.status, row.language]).sort()).toEqual([["membership_expiry", "queued", "ar"], ["renewal_reminder", "queued", "en"]]);
    expect(state.notifications).toHaveLength(2);
  });
});

async function seedReminder(t: ReturnType<typeof convexTest>, suffix: string, options: { successor?: boolean; inactive?: boolean; legacy?: boolean } = {}) {
  return t.run(async (ctx) => {
    const now = Date.UTC(2026, 7, 12, 12);
    const organizationId = await ctx.db.insert("organizations", { publicId: `org-${suffix}`, name: `Gym ${suffix}`, slug: `gym-${suffix}`, status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const ownerId = await ctx.db.insert("users", { publicId: `owner-${suffix}`, authSubject: `owner-${suffix}`, email: "owner@example.test", fullName: "Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("operationalEmailSettings", { organizationId, enabledKinds: ["renewal_reminder", "membership_expiry"], updatedByUserId: ownerId, reason: "Test", ownerConfirmedAt: now, ownerConfirmedByUserId: ownerId, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "member", publicId: "shared-member-id", createdAt: now, updatedAt: now, data: { id: "shared-member-id", email: `${suffix}@example.test`, status: options.inactive ? "deactivated" : "active" } });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "membership", publicId: "shared-term-id", createdAt: now, updatedAt: now, data: { id: "shared-term-id", memberId: "shared-member-id", startDate: isoDate(-20), endDate: isoDate(7) } });
    if (options.successor) await ctx.db.insert("domainRecords", { organizationId, entityType: "membership", publicId: "next-term", createdAt: now, updatedAt: now, data: { id: "next-term", memberId: "shared-member-id", previousMembershipId: "shared-term-id", startDate: isoDate(8), endDate: isoDate(38) } });
    if (options.legacy) await ctx.db.insert("operationalEmailDeliveries", { publicId: "legacy-email", organizationId, kind: "renewal_reminder", messageClass: "service", templateVersion: "renewal_reminder-v1", language: "en", recipientReference: "shared-member-id", recipientEmail: `${suffix}@example.test`, relatedEntityType: "membership", relatedEntityPublicId: "shared-term-id", dedupeKey: `renewal_reminder:shared-term-id:${isoDate(7)}`, status: "provider_accepted", attempts: [], createdAt: now, updatedAt: now });
    return organizationId;
  });
}

describe("renewal email recipient boundaries", () => {
  it("queues separately for identical membership IDs in different gyms, while retaining legacy dedupe", async () => {
    process.env.RIVET_OPERATIONAL_EMAIL_LIVE = "true";
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "noreply@rivetjo.com";
    const t = convexTest(schema, modules);
    await seedReminder(t, "first", { legacy: true });
    await seedReminder(t, "second");
    const now = Date.UTC(2026, 7, 12, 12);
    expect(await t.mutation(internal.membershipJobs.queueLifecycleReminders, { now })).toMatchObject({ queued: 1 });
    expect(await t.mutation(internal.membershipJobs.queueLifecycleReminders, { now })).toMatchObject({ queued: 0 });
    const rows = await t.run(async (ctx) => ctx.db.query("operationalEmailDeliveries").collect());
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.recipientEmail === "first@example.test")).toMatchObject({ status: "provider_accepted", publicId: "legacy-email" });
    expect(rows.find((row) => row.recipientEmail === "second@example.test")).toMatchObject({ status: "queued", kind: "renewal_reminder" });
  });

  it("does not ask an already-renewed or deactivated member to renew", async () => {
    const t = convexTest(schema, modules);
    await seedReminder(t, "renewed", { successor: true });
    await seedReminder(t, "inactive", { inactive: true });
    expect(await t.mutation(internal.membershipJobs.queueLifecycleReminders, { now: Date.UTC(2026, 7, 12, 12) })).toMatchObject({ queued: 0, notified: 0 });
    expect(await t.run(async (ctx) => ctx.db.query("operationalEmailDeliveries").collect())).toEqual([]);
  });
});
