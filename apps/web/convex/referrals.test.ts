import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, organizationId: "org-referral", correlationId: `cor-test-${name}` });

const DAY_MS = 86_400_000;

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-referral", name: "Referral Gym", slug: "referral-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-referral", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner-referral", authSubject: "clerk-owner-referral", email: "owner@referral.example", fullName: "Owner Referral", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    const today = new Date(now).toISOString().slice(0, 10);
    const in30 = new Date(now + 30 * DAY_MS).toISOString().slice(0, 10);
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "member", publicId: "referrer-1", branchId: branch, memberPublicId: "referrer-1", createdAt: now, updatedAt: now, data: { id: "referrer-1", fullName: "Rania Referrer", memberNumber: "MAIN-1", status: "active", phone: "+962790000001", homeBranchId: "branch-referral", createdAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "membership", publicId: "membership-referrer", branchId: branch, memberPublicId: "referrer-1", createdAt: now, updatedAt: now, data: { id: "membership-referrer", memberId: "referrer-1", planId: "plan-month", homeBranchId: "branch-referral", startDate: today, endDate: in30, adjustments: [], createdAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "plan", publicId: "plan-month", createdAt: now, updatedAt: now, data: { id: "plan-month", name: "Monthly", code: "MONTH", kind: "time", durationDays: 30, basePrice: { amount: 45_000, currency: "JOD" }, branchAccess: "all", branchIds: [], freezeAllowanceDays: 0, includedPtSessions: 0, status: "active" } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: { id: "settings", operationalPolicies: { entry: { outstandingBalance: "warn", expiryWarningDays: 7, duplicateScanWindowMinutes: 2, enforceOperatingHours: false }, membership: { allowOverlappingMemberships: false, renewalWindowDays: 14, minimumFreezeDays: 1, maximumExtensionDays: 365 }, personalTraining: { sessionDurationMinutes: 60, bookingHorizonDays: 30, cancellationCutoffHours: 12 }, referrals: { enabled: true, rewardDays: 7, maxRewardDaysPerWindow: 10, windowDays: 90 }, operatingHours: [], trialSchedules: [] } } });
  });
}

async function createReferred(t: TestConvex<typeof schema>, suffix: string): Promise<string> {
  const owner = t.withIdentity({ subject: "clerk-owner-referral" });
  const created = await owner.mutation(api.domain.mutate, operation("members.create", {
    fullName: `Referred ${suffix}`,
    phone: `+96279000${suffix.padStart(4, "1")}`,
    homeBranchId: "branch-referral",
    preferredLanguage: "en",
    referredByMemberId: "referrer-1",
  })) as { member: { id: string } };
  return created.member.id;
}

describe("referral rewards", () => {
  it("extends the referrer's active membership on the referred member's first sale, capped per window", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const owner = t.withIdentity({ subject: "clerk-owner-referral" });
    const today = new Date().toISOString().slice(0, 10);

    const firstId = await createReferred(t, "2");
    await owner.mutation(api.domain.mutate, operation("memberships.sale", { memberId: firstId, planId: "plan-month", startDate: today }));

    const afterFirst = await t.run(async (ctx) => {
      const membership = (await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "membership").eq("publicId", "membership-referrer")).unique())!.data as Record<string, unknown>;
      const rewards = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "referralReward")).collect()).map((row) => row.data as Record<string, unknown>);
      return { endDate: String(membership.endDate), rewards };
    });
    // 30-day membership extended by the 7-day reward.
    expect(afterFirst.rewards).toEqual([expect.objectContaining({ status: "applied", days: 7, referrerId: "referrer-1" })]);
    const expectedEnd = new Date(Date.parse(`${today}T00:00:00.000Z`) + 37 * DAY_MS).toISOString().slice(0, 10);
    expect(afterFirst.endDate).toBe(expectedEnd);

    // A renewal for the same referred member grants nothing more.
    const membershipOfFirst = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "membership")).collect()).map((row) => row.data as Record<string, unknown>).find((value) => value.memberId === firstId));
    await owner.mutation(api.domain.mutate, operation("memberships.renew", { membershipId: String(membershipOfFirst!.id) }));

    // The second referral hits the 10-day window cap: only 3 more days apply.
    const secondId = await createReferred(t, "3");
    await owner.mutation(api.domain.mutate, operation("memberships.sale", { memberId: secondId, planId: "plan-month", startDate: today }));

    const afterSecond = await t.run(async (ctx) => {
      const membership = (await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "membership").eq("publicId", "membership-referrer")).unique())!.data as Record<string, unknown>;
      const rewards = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "referralReward")).collect()).map((row) => row.data as Record<string, unknown>);
      return { endDate: String(membership.endDate), rewards };
    });
    expect(afterSecond.rewards).toHaveLength(2);
    expect(afterSecond.rewards.map((reward) => reward.days).sort()).toEqual([3, 7]);
    const cappedEnd = new Date(Date.parse(`${today}T00:00:00.000Z`) + 40 * DAY_MS).toISOString().slice(0, 10);
    expect(afterSecond.endDate).toBe(cappedEnd);

    // The third referral finds the cap exhausted and records that honestly.
    const thirdId = await createReferred(t, "4");
    await owner.mutation(api.domain.mutate, operation("memberships.sale", { memberId: thirdId, planId: "plan-month", startDate: today }));
    const afterThird = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "referralReward")).collect()).map((row) => row.data as Record<string, unknown>));
    expect(afterThird).toHaveLength(3);
    expect(afterThird.find((reward) => reward.referredMemberId === thirdId)).toMatchObject({ status: "cap_reached", days: 0 });
  });

  it("grants nothing while the gym has referrals disabled", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const settings = (await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "settings").eq("publicId", "settings")).unique())!;
      const value = settings.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      value.operationalPolicies.referrals.enabled = false;
      await ctx.db.patch(settings._id, { data: value });
    });
    const owner = t.withIdentity({ subject: "clerk-owner-referral" });
    const memberId = await createReferred(t, "9");
    await owner.mutation(api.domain.mutate, operation("memberships.sale", { memberId, planId: "plan-month", startDate: new Date().toISOString().slice(0, 10) }));
    const rewards = await t.run(async (ctx) => await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "referralReward")).collect());
    expect(rewards).toHaveLength(0);
  });

  it("does not treat a future scheduled term as the referrer's active membership", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "membership").eq("publicId", "membership-referrer")).unique())!;
      const value = row.data as Record<string, unknown>;
      await ctx.db.patch(row._id, { data: { ...value, startDate: new Date(Date.now() + 10 * DAY_MS).toISOString().slice(0, 10), endDate: new Date(Date.now() + 40 * DAY_MS).toISOString().slice(0, 10) } });
    });
    const owner = t.withIdentity({ subject: "clerk-owner-referral" });
    const referredId = await createReferred(t, "8");
    await owner.mutation(api.domain.mutate, operation("memberships.sale", { memberId: referredId, planId: "plan-month", startDate: new Date().toISOString().slice(0, 10) }));
    const reward = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "referralReward")).first())!.data as Record<string, unknown>);
    expect(reward).toMatchObject({ status: "no_active_membership", days: 0 });
  });

  it("does not accept a referrer outside a branch-scoped staff member's access", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const organization = (await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-referral")).unique())!;
      const main = (await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", "branch-referral")).unique())!;
      const other = await ctx.db.insert("branches", { organizationId: organization._id, publicId: "branch-other", name: "Other", code: "OTHER", active: true, status: "active", createdAt: now, updatedAt: now });
      const manager = await ctx.db.insert("users", { publicId: "manager-referral", authSubject: "clerk-manager-referral", email: "manager@referral.example", fullName: "Manager Referral", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: organization._id, userId: manager, role: "manager", branchIds: [main._id], active: true, branchScope: "selected", createdAt: now, updatedAt: now });
      await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "member", publicId: "referrer-other", branchId: other, memberPublicId: "referrer-other", createdAt: now, updatedAt: now, data: { id: "referrer-other", fullName: "Other Referrer", memberNumber: "OTHER-1", status: "active", phone: "+962790000222", homeBranchId: "branch-other", createdAt: new Date(now).toISOString() } });
    });
    const manager = t.withIdentity({ subject: "clerk-manager-referral" });
    await expect(manager.mutation(api.domain.mutate, operation("members.create", {
      fullName: "Cross Branch Referral",
      phone: "+962790000223",
      homeBranchId: "branch-referral",
      preferredLanguage: "en",
      referredByMemberId: "referrer-other",
    }))).rejects.toMatchObject({ data: expect.objectContaining({ code: "NOT_FOUND" }) });
  });
});
