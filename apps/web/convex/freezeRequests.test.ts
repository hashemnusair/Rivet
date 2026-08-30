import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, organizationId: "org-freeze", correlationId: `cor-test-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

const DAY_MS = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);

async function seed(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-freeze", name: "Freeze Gym", slug: "freeze-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-freeze", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner-freeze", authSubject: "clerk-owner-freeze", email: "owner@freeze.example", fullName: "Owner Freeze", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("users", { publicId: "customer-freeze", authSubject: "clerk-customer-freeze", email: "member@freeze.example", fullName: "Member Freeze", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], active: true, branchScope: "all", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "member", publicId: "member-f", branchId: branch, memberPublicId: "member-f", createdAt: now, updatedAt: now, data: { id: "member-f", fullName: "Member Freeze", memberNumber: "MAIN-9", status: "active", phone: "+962790000009", homeBranchId: "branch-freeze", createdAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "plan", publicId: "plan-f", createdAt: now, updatedAt: now, data: { id: "plan-f", name: "Monthly", code: "MONTH", kind: "time", durationDays: 30, basePrice: { amount: 45_000, currency: "JOD" }, branchAccess: "all", branchIds: [], freezeAllowanceDays: 60, includedPtSessions: 0, status: "active" } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "membership", publicId: "membership-f", memberPublicId: "member-f", createdAt: now, updatedAt: now, data: { id: "membership-f", memberId: "member-f", planId: "plan-f", startDate: day(-10), endDate: day(40), adjustments: [], freezes: [], frozenDaysUsed: 0, createdAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "customerMembership", publicId: "cm-f", createdAt: now, updatedAt: now, data: { id: "cm-f", customerUserId: "customer-freeze", membershipId: "membership-f", memberId: "member-f", memberNumber: "MAIN-9", status: "active", startDate: day(-10), endDate: day(40) } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: { id: "settings", operationalPolicies: { entry: { outstandingBalance: "warn", expiryWarningDays: 7, duplicateScanWindowMinutes: 2, enforceOperatingHours: false }, membership: { allowOverlappingMemberships: false, renewalWindowDays: 14, minimumFreezeDays: 1, maximumExtensionDays: 365 }, personalTraining: { sessionDurationMinutes: 60, bookingHorizonDays: 30, cancellationCutoffHours: 12 }, referrals: { enabled: false, rewardDays: 7, maxRewardDaysPerWindow: 30, windowDays: 90 }, memberFreezes: { requestsEnabled: true, freeFreezesPerWindow: 1, extraFreezeFeeMinor: 10_000, maxDaysPerFreeze: 30, windowDays: 365 }, operatingHours: [], trialSchedules: [] } } });
  });
}

describe("member freeze requests", () => {
  it("collects a request, blocks duplicates, and enforces the reasoned staff decision", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const member = t.withIdentity({ subject: "clerk-customer-freeze" });
    const staff = t.withIdentity({ subject: "clerk-owner-freeze" });

    // Bounds are policy-enforced.
    await expectCode(member.mutation(api.domain.mutate, operation("customer.membership.freezeRequest", { membershipId: "cm-f", startDate: day(1), days: 45, reason: "Long trip" })), "VALIDATION_ERROR");
    await expectCode(member.mutation(api.domain.mutate, operation("customer.membership.freezeRequest", { membershipId: "cm-f", startDate: day(-2), days: 5, reason: "Backdated" })), "VALIDATION_ERROR");

    const created = await member.mutation(api.domain.mutate, operation("customer.membership.freezeRequest", { membershipId: "cm-f", startDate: day(1), days: 7, reason: "Travelling for work." })) as { id: string; status: string; expectedFeeMinor: number };
    expect(created).toMatchObject({ status: "pending", expectedFeeMinor: 0 });
    await expectCode(member.mutation(api.domain.mutate, operation("customer.membership.freezeRequest", { membershipId: "cm-f", startDate: day(2), days: 3, reason: "Second ask" })), "CONFLICT");

    const mine = await member.query(api.domain.query, operation("customer.membership.freezeRequests", { membershipId: "cm-f" })) as Array<{ id: string }>;
    expect(mine.map((item) => item.id)).toContain(created.id);

    // Staff must give a reason to deny.
    await expectCode(staff.mutation(api.domain.mutate, operation("memberships.freeze_request.decide", { requestId: created.id, decision: "denied" })), "VALIDATION_ERROR");
    const denied = await staff.mutation(api.domain.mutate, operation("memberships.freeze_request.decide", { requestId: created.id, decision: "denied", note: "Please visit the desk to confirm identity." })) as { status: string; decisionNote: string };
    expect(denied).toMatchObject({ status: "denied", decisionNote: "Please visit the desk to confirm identity." });
    await expectCode(staff.mutation(api.domain.mutate, operation("memberships.freeze_request.decide", { requestId: created.id, decision: "approved" })), "CONFLICT");
  });

  it("applies the freeze on approval, charging the fee only after the free allowance", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const member = t.withIdentity({ subject: "clerk-customer-freeze" });
    const staff = t.withIdentity({ subject: "clerk-owner-freeze" });

    const first = await member.mutation(api.domain.mutate, operation("customer.membership.freezeRequest", { membershipId: "cm-f", startDate: day(1), days: 5, reason: "Exams." })) as { id: string };
    const approvedFirst = await staff.mutation(api.domain.mutate, operation("memberships.freeze_request.decide", { requestId: first.id, decision: "approved" })) as { status: string; feeMinor: number };
    expect(approvedFirst).toMatchObject({ status: "approved", feeMinor: 0 });

    const frozen = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "membership").eq("publicId", "membership-f")).unique())!.data as Record<string, any>); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(frozen.activeFreeze).toMatchObject({ startDate: day(1) });

    // Retire the first freeze so a second request becomes possible.
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "membership").eq("publicId", "membership-f")).unique())!;
      const value = row.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      value.activeFreeze = { ...value.activeFreeze, startDate: day(-9), endDate: day(-5) };
      await ctx.db.patch(row._id, { data: value });
    });

    const second = await member.mutation(api.domain.mutate, operation("customer.membership.freezeRequest", { membershipId: "cm-f", startDate: day(1), days: 4, reason: "Injury recovery." })) as { id: string; expectedFeeMinor: number };
    // The free allowance is used up, so the member sees the fee upfront.
    expect(second.expectedFeeMinor).toBe(10_000);
    const approvedSecond = await staff.mutation(api.domain.mutate, operation("memberships.freeze_request.decide", { requestId: second.id, decision: "approved" })) as { status: string; feeMinor: number; chargeId?: string };
    expect(approvedSecond).toMatchObject({ status: "approved", feeMinor: 10_000 });
    expect(approvedSecond.chargeId).toBeTruthy();

    const charge = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "charge")).collect()).map((row) => row.data as Record<string, unknown>).find((value) => value.description === "Membership freeze fee"));
    expect(charge).toMatchObject({ status: "unpaid", memberId: "member-f" });
  });

  it("refuses requests while the gym has them disabled", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    await t.run(async (ctx) => {
      const settings = (await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "settings").eq("publicId", "settings")).unique())!;
      const value = settings.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      value.operationalPolicies.memberFreezes.requestsEnabled = false;
      await ctx.db.patch(settings._id, { data: value });
    });
    const member = t.withIdentity({ subject: "clerk-customer-freeze" });
    await expectCode(member.mutation(api.domain.mutate, operation("customer.membership.freezeRequest", { membershipId: "cm-f", startDate: day(1), days: 5, reason: "Trip." })), "VALIDATION_ERROR");
  });
});
