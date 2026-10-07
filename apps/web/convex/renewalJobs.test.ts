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
  renewalRecoveryEnabled?: boolean;
}) {
  return await t.run(async (ctx) => {
    const now = atUtc("2026-08-01");
    const organization = await ctx.db.insert("organizations", { publicId: input.publicId, name: input.publicId, slug: input.publicId, status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: `${input.publicId}-branch`, name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: { id: "settings", notifications: { quietHoursStart: input.quietHours?.start ?? "00:00", quietHoursEnd: input.quietHours?.end ?? "00:00", ...(input.renewalRecoveryEnabled === undefined ? {} : { renewalRecoveryEnabled: input.renewalRecoveryEnabled }) } } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "member", publicId: input.memberId, branchId: branch, memberPublicId: input.memberId, createdAt: now, updatedAt: now, data: { id: input.memberId, fullName: input.memberId, homeBranchId: `${input.publicId}-branch`, status: "active", phone: "+962790000000", preferredLanguage: "en", ...(input.member ?? {}) } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "membership", publicId: input.membershipId, branchId: branch, memberPublicId: input.memberId, createdAt: now, updatedAt: now, data: { id: input.membershipId, memberId: input.memberId, homeBranchId: `${input.publicId}-branch`, startDate: "2026-07-01", endDate: input.endDate } });
    return { organization, branch };
  });
}

describe("renewal staff call tasks", () => {
  it("does nothing until the organization enables staff call tasks", async () => {
    const t = convexTest(schema, modules);
    await addOrganization(t, { publicId: "disabled", memberId: "member", membershipId: "term", endDate: "2026-08-26" });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-25") })).toMatchObject({ created: 0, queued: 0 });
    expect(await t.run(async (ctx) => ctx.db.query("renewalDeliveries").collect())).toEqual([]);
  });

  it("skips old 14/7/3 messages and creates one call task even without message consent", async () => {
    const t = convexTest(schema, modules);
    await addOrganization(t, { publicId: "enabled", memberId: "member", membershipId: "term", endDate: "2026-08-26", renewalRecoveryEnabled: true, member: { preferredLanguage: "ar" } });
    for (const date of ["2026-08-12", "2026-08-19", "2026-08-23"]) {
      expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc(date) })).toMatchObject({ created: 0 });
    }
    const now = atUtc("2026-08-25");
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now })).toMatchObject({ created: 1, queued: 1 });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now })).toMatchObject({ created: 0 });
    const deliveries = await t.run(async (ctx) => ctx.db.query("renewalDeliveries").collect());
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ channel: "staff_task", checkpointKey: "1_day_call", consentStatus: "not_applicable", language: "ar", languageSource: "recipient" });
    const timeline = await t.run(async (ctx) => ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "timeline")).first());
    expect(timeline?.data).toMatchObject({ titleMessage: { key: "communicationCompletion.timeline.renewalCallTask" }, bodyMessage: { key: "communicationCompletion.timeline.renewalCallTaskBody" } });
    const audit = await t.query(internal.renewalJobs.releaseAudit, { since: now });
    expect(audit.deliveries).toMatchObject({ count: 1, groups: { queued: 1 } });
    expect(audit.staffCallTasks).toMatchObject({ count: 1, groups: { open: 1 } });
    expect(audit).not.toHaveProperty("memberPublicId");
  });

  it("cancels pending historical WhatsApp rows with an event while preserving sent history", async () => {
    const t = convexTest(schema, modules);
    const { organization } = await addOrganization(t, { publicId: "legacy", memberId: "member", membershipId: "term", endDate: "2026-08-26" });
    await t.run(async (ctx) => {
      for (const status of ["queued", "deferred", "sandboxed", "failed", "sent"] as const) {
        await ctx.db.insert("renewalDeliveries", { organizationId: organization, publicId: status, membershipPublicId: "term", membershipEndDate: "2026-08-26", memberPublicId: "member", checkpointDaysBefore: 7, checkpointKey: "7_day", channel: "whatsapp", templateVersion: "v1", policyVersion: "v1", dedupeKey: status, recipientReference: "member", language: "en", consentStatus: "explicit_opt_in", channelOptedOut: false, status, attempts: [], createdAt: 1, updatedAt: 1 });
      }
    });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-19") })).toMatchObject({ created: 0, cancelled: 4 });
    const rows = await t.run(async (ctx) => ctx.db.query("renewalDeliveries").collect());
    expect(rows).toHaveLength(5);
    expect(rows.filter((row) => row.status === "cancelled")).toHaveLength(4);
    expect(rows.find((row) => row.publicId === "sent")).toMatchObject({ status: "sent", updatedAt: 1 });
    expect(rows.find((row) => row.publicId === "queued")).toMatchObject({ cancellationReason: "automated_messaging_retired" });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now: atUtc("2026-08-19") })).toMatchObject({ cancelled: 0 });
    expect(await t.run(async (ctx) => ctx.db.query("renewalDeliveryEvents").collect())).toHaveLength(4);
  });

  it.each(["term_changed", "renewed"])("cancels an open call task when %s, without touching the other tenant", async (reason) => {
    const t = convexTest(schema, modules);
    const { organization } = await addOrganization(t, { publicId: "first", memberId: "member", membershipId: "term", endDate: "2026-08-26", renewalRecoveryEnabled: true });
    await addOrganization(t, { publicId: "second", memberId: "member", membershipId: "term", endDate: "2026-08-26", renewalRecoveryEnabled: true });
    const now = atUtc("2026-08-25");
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now })).toMatchObject({ created: 2 });
    await t.run(async (ctx) => {
      const term = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization).eq("entityType", "membership").eq("publicId", "term")).unique();
      if (!term) throw new Error("Missing fixture");
      if (reason === "term_changed") await ctx.db.patch(term._id, { data: { ...term.data as Record<string, unknown>, endDate: "2026-09-26" } });
      else await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "membership", publicId: "successor", createdAt: now, updatedAt: now, data: { id: "successor", memberId: "member", previousMembershipId: "term", startDate: "2026-08-27", endDate: "2026-09-26" } });
    });
    expect(await t.mutation(internal.renewalJobs.queueRenewalJourney, { now })).toMatchObject({ created: 0, cancelled: 1 });
    const tasks = await t.run(async (ctx) => ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "task")).collect());
    expect(tasks.find((row) => row.organizationId === organization)?.data).toMatchObject({ status: "cancelled" });
    expect(tasks.find((row) => row.organizationId !== organization)?.data).toMatchObject({ status: "open" });
  });
});
