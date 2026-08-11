import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

describe("PT reminder scheduler", () => {
  it("captures one email and one member notification across repeated scheduler runs", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", { publicId: "reminder-org", name: "Reminder Gym", slug: "reminder-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
      const branchId = await ctx.db.insert("branches", { organizationId, publicId: "reminder-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
      const trainerUserId = await ctx.db.insert("users", { publicId: "reminder-trainer-user", authSubject: "clerk-reminder-trainer", email: "trainer@example.test", fullName: "Reminder Trainer", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      const memberUserId = await ctx.db.insert("users", { publicId: "reminder-member-user", authSubject: "clerk-reminder-member", email: "member@example.test", fullName: "Reminder Member", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      const trainerProfileId = await ctx.db.insert("ptTrainerProfiles", { organizationId, publicId: "reminder-trainer", userId: trainerUserId, displayName: "Coach Reminder", specialties: [], languages: ["en"], branchIds: [branchId], status: "published", createdAt: now, updatedAt: now });
      const entitlementId = await ctx.db.insert("ptEntitlements", { organizationId, publicId: "reminder-entitlement", memberPublicId: "reminder-member", source: "included", membershipPublicId: "reminder-membership", granted: 2, reserved: 1, consumed: 0, revoked: 0, expiresAt: now + 10 * 86_400_000, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("ptBookings", { organizationId, publicId: "reminder-booking", memberPublicId: "reminder-member", membershipPublicId: "reminder-membership", trainerProfileId, branchId, entitlementId, startsAt: now + 23.5 * 60 * 60 * 1000, endsAt: now + 24.5 * 60 * 60 * 1000, status: "reserved", bookedByUserId: memberUserId, idempotencyKey: "reminder-booking-key", createdAt: now, updatedAt: now });
      await ctx.db.insert("domainRecords", { organizationId, entityType: "member", publicId: "reminder-member", branchId, memberPublicId: "reminder-member", createdAt: now, updatedAt: now, data: { id: "reminder-member", fullName: "Reminder Member", email: "member@example.test", preferredLanguage: "en" } });
      await ctx.db.insert("domainRecords", { organizationId, entityType: "customerMembership", publicId: "reminder-membership", branchId, memberPublicId: "reminder-member", createdAt: now, updatedAt: now, data: { id: "reminder-membership", customerUserId: "reminder-member-user", memberId: "reminder-member" } });
    });

    const first = await t.mutation(internal.ptJobs.queueUpcomingReminders, { now });
    const second = await t.mutation(internal.ptJobs.queueUpcomingReminders, { now });
    expect(first).toEqual({ scanned: 1, queued: 1, notified: 1 });
    expect(second).toEqual({ scanned: 1, queued: 0, notified: 0 });
    const state = await t.run(async (ctx) => ({
      emails: await ctx.db.query("operationalEmailDeliveries").collect(),
      notifications: await ctx.db.query("operationalNotifications").collect(),
    }));
    expect(state.emails).toHaveLength(1);
    expect(state.emails[0]).toMatchObject({ kind: "pt_booking_reminder", status: "suppressed", dedupeKey: "pt-booking-reminder:reminder-booking" });
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]).toMatchObject({ kind: "pt_booking_reminder", recipientUserId: expect.any(String) });
  });
});
