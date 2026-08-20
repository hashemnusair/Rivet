import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");

function atUtc(date: string, hour = 12): number {
  return Date.parse(`${date}T${String(hour).padStart(2, "0")}:00:00.000Z`);
}

async function addOrganization(t: TestConvex<typeof schema>, input: {
  publicId: string;
  memberId: string;
  membershipId: string;
  endDate: string;
  member?: Record<string, unknown>;
  quietHours?: { start: string; end: string };
}) {
  return await t.run(async (ctx) => {
    const now = atUtc("2026-08-01");
    const organization = await ctx.db.insert("organizations", { publicId: input.publicId, name: input.publicId, slug: input.publicId, status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: `${input.publicId}-branch`, name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: { id: "settings", notifications: { quietHoursStart: input.quietHours?.start ?? "00:00", quietHoursEnd: input.quietHours?.end ?? "00:00" } } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "member", publicId: input.memberId, branchId: branch, memberPublicId: input.memberId, createdAt: now, updatedAt: now, data: { id: input.memberId, fullName: input.memberId, homeBranchId: `${input.publicId}-branch`, status: "active", phone: "+962790000000", preferredLanguage: "en", ...(input.member ?? {}) } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "membership", publicId: input.membershipId, branchId: branch, memberPublicId: input.memberId, createdAt: now, updatedAt: now, data: { id: input.membershipId, memberId: input.memberId, homeBranchId: `${input.publicId}-branch`, startDate: "2026-07-01", endDate: input.endDate } });
    return { organization, branch };
  });
}

describe("renewal recovery job", () => {
  it("creates exact 14/7/3 reminders and one 1-day call, then deduplicates", async () => {
    const t = convexTest(schema, modules);
    await addOrganization(t, { publicId: "renewal-org", memberId: "renewal-member", membershipId: "renewal-membership", endDate: "2026-08-26", member: { marketingPreference: { optedIn: true, source: "member_selected" } } });

    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-12") })).toMatchObject({ created: 1, sandboxed: 1, queued: 0 });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-19") })).toMatchObject({ created: 1, sandboxed: 1 });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-23") })).toMatchObject({ created: 1, sandboxed: 1 });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-25") })).toMatchObject({ created: 1, queued: 1 });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-25", 13) })).toMatchObject({ created: 0 });

    const state = await t.run(async (ctx) => ({
      deliveries: await ctx.db.query("renewalDeliveries").collect(),
      tasks: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "task")).collect(),
      events: await ctx.db.query("renewalDeliveryEvents").collect(),
    }));
    expect(state.deliveries).toHaveLength(4);
    expect(state.deliveries.map((delivery) => delivery.checkpointKey).sort()).toEqual(["14_day", "1_day_call", "3_day", "7_day"]);
    expect(state.deliveries.filter((delivery) => delivery.status === "sent")).toHaveLength(0);
    expect(state.deliveries.filter((delivery) => delivery.channel === "staff_task")).toHaveLength(1);
    expect(state.tasks).toHaveLength(1);
    expect(state.events.some((event) => event.eventType === "task_created")).toBe(true);
  });

  it("suppresses unknown consent and defers an opted-in message through quiet hours", async () => {
    const t = convexTest(schema, modules);
    await addOrganization(t, { publicId: "quiet-org", memberId: "quiet-member", membershipId: "quiet-membership", endDate: "2026-08-26", member: { marketingPreference: { optedIn: true, source: "member_selected" } }, quietHours: { start: "22:00", end: "08:00" } });
    await addOrganization(t, { publicId: "unknown-org", memberId: "unknown-member", membershipId: "unknown-membership", endDate: "2026-08-26" });

    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-12", 23) })).toMatchObject({ created: 2, deferred: 1, suppressed: 1 });
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "quiet-org")).unique();
      if (!organization) throw new Error("quiet organization fixture missing");
      const member = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "member").eq("publicId", "quiet-member")).unique();
      if (!member) throw new Error("quiet member fixture missing");
      await ctx.db.patch(member._id, { data: { ...(member.data as Record<string, unknown>), marketingPreference: { optedIn: false, source: "member_selected", status: "explicit_opt_out" }, marketingPreferenceStatus: "explicit_opt_out", marketingPreferenceSource: "member_selected" }, updatedAt: atUtc("2026-08-12", 23) });
    });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-12", 23) })).toMatchObject({ created: 0, suppressed: 1 });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-13", 8) })).toMatchObject({ created: 0, sandboxed: 0 });
    const deliveries = await t.run(async (ctx) => await ctx.db.query("renewalDeliveries").collect());
    expect(deliveries.find((delivery) => delivery.dedupeKey.includes("quiet-membership"))).toMatchObject({ status: "suppressed", suppressionReason: "Recipient opted out of renewal messages" });
    expect(deliveries.find((delivery) => delivery.dedupeKey.includes("unknown-membership"))).toMatchObject({ status: "suppressed", suppressionReason: "Explicit consent is required for renewal messages" });
  });

  it("cancels the old term on an end-date change, creates the new term action, and keeps one call task", async () => {
    const t = convexTest(schema, modules);
    const ids = await addOrganization(t, { publicId: "term-org", memberId: "term-member", membershipId: "term-membership", endDate: "2026-08-26", member: { marketingPreference: { optedIn: true, source: "member_selected" } } });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-12") })).toMatchObject({ created: 1, sandboxed: 1 });
    await t.run(async (ctx) => {
      const membership = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", ids.organization).eq("entityType", "membership").eq("publicId", "term-membership")).unique();
      if (!membership) throw new Error("term membership fixture missing");
      await ctx.db.patch(membership._id, { data: { ...(membership.data as Record<string, unknown>), endDate: "2026-08-27" }, updatedAt: atUtc("2026-08-13") });
    });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-13") })).toMatchObject({ cancelled: 1, created: 1, sandboxed: 1 });
    const rowsAfterTermChange = await t.run(async (ctx) => await ctx.db.query("renewalDeliveries").collect());
    expect(rowsAfterTermChange).toHaveLength(2);
    expect(rowsAfterTermChange.find((row) => row.membershipEndDate === "2026-08-26")).toMatchObject({ status: "cancelled", cancellationReason: "membership_term_changed" });
    expect(rowsAfterTermChange.find((row) => row.membershipEndDate === "2026-08-27")).toMatchObject({ status: "sandboxed" });

    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-26") })).toMatchObject({ created: 1, queued: 1 });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-26", 13) })).toMatchObject({ created: 0 });
    const finalState = await t.run(async (ctx) => ({
      deliveries: await ctx.db.query("renewalDeliveries").collect(),
      tasks: await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", ids.organization).eq("entityType", "task")).collect(),
    }));
    expect(finalState.tasks).toHaveLength(1);
    expect(finalState.deliveries.filter((row) => row.channel === "staff_task")).toHaveLength(1);
    expect(finalState.deliveries.find((row) => row.channel === "staff_task")).toMatchObject({ membershipEndDate: "2026-08-27", status: "queued" });
  });

  it("cancels outstanding actions when a successor membership is created", async () => {
    const t = convexTest(schema, modules);
    const ids = await addOrganization(t, { publicId: "stop-org", memberId: "stop-member", membershipId: "old-membership", endDate: "2026-08-26", member: { marketingPreference: { optedIn: true, source: "member_selected" } } });
    await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-12") });
    await t.run(async (ctx) => {
      await ctx.db.insert("domainRecords", { organizationId: ids.organization, entityType: "membership", publicId: "new-membership", branchId: ids.branch, memberPublicId: "stop-member", createdAt: atUtc("2026-08-12"), updatedAt: atUtc("2026-08-12"), data: { id: "new-membership", memberId: "stop-member", homeBranchId: "stop-org-branch", startDate: "2026-08-27", endDate: "2026-09-26", previousMembershipId: "old-membership" } });
    });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-12", 13) })).toMatchObject({ cancelled: 1 });
    const deliveries = await t.run(async (ctx) => await ctx.db.query("renewalDeliveries").collect());
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ membershipPublicId: "old-membership", status: "cancelled", cancellationReason: "membership_renewed" });
    expect(await t.run(async (ctx) => (await ctx.db.query("renewalDeliveryEvents").collect()).some((event) => event.eventType === "cancelled" && event.reason === "membership_renewed"))).toBe(true);
  });

  it("keeps identical public IDs isolated across tenants", async () => {
    const t = convexTest(schema, modules);
    await addOrganization(t, { publicId: "tenant-a", memberId: "same-member", membershipId: "same-membership", endDate: "2026-08-26", member: { marketingPreference: { optedIn: true, source: "member_selected" } } });
    await addOrganization(t, { publicId: "tenant-b", memberId: "same-member", membershipId: "same-membership", endDate: "2026-08-26", member: { marketingPreference: { optedIn: true, source: "member_selected" } } });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-12") })).toMatchObject({ organizations: 2, created: 2 });
    expect(await t.run(async (ctx) => (await ctx.db.query("renewalDeliveries").collect()).map((delivery) => delivery.dedupeKey).sort())).toEqual([
      "renewal:tenant-a:same-membership:2026-08-26:14_day:whatsapp:renewal-policy-v1",
      "renewal:tenant-b:same-membership:2026-08-26:14_day:whatsapp:renewal-policy-v1",
    ]);
  });
});
