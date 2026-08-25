import { afterEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const previous = {
  live: process.env.RIVET_OPERATIONAL_EMAIL_LIVE,
  kinds: process.env.RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES,
  recipients: process.env.RIVET_APPLICATION_RECIPIENTS,
};
afterEach(() => {
  for (const [key, value] of Object.entries({ RIVET_OPERATIONAL_EMAIL_LIVE: previous.live, RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES: previous.kinds, RIVET_APPLICATION_RECIPIENTS: previous.recipients })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

async function seedAdmin() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("users", { publicId: "application-admin", authSubject: "clerk-application-admin", email: "admin@example.test", fullName: "Application Admin", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
  });
  return t;
}

describe("gym application durable email migration", () => {
  it("accepts Enterprise applications as a first-class launch plan", async () => {
    delete process.env.RIVET_OPERATIONAL_EMAIL_LIVE;
    process.env.RIVET_APPLICATION_RECIPIENTS = "sales@example.test";
    const t = await seedAdmin();
    const submitted = await t.action(api.gymApplications.submit, { gymName: "Enterprise Gym", ownerName: "Enterprise Owner", email: "enterprise-owner@example.test", contactNumber: "+962790000099", plan: "Enterprise", billingInterval: "annual" });
    expect(submitted).toMatchObject({ status: "pending", duplicate: false });
    const application = await t.run((ctx) => ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", submitted.applicationId)).unique());
    expect(application).toMatchObject({ plan: "Enterprise", billingInterval: "annual" });
  });

  it("replays a public application idempotently and rejects key reuse for different data", async () => {
    delete process.env.RIVET_OPERATIONAL_EMAIL_LIVE;
    const t = await seedAdmin();
    const input = { gymName: "Retry Gym", ownerName: "Retry Owner", email: "retry-owner@example.test", contactNumber: "+962790000099", plan: "Growth" as const, idempotencyKey: "application-retry-key" };
    const first = await t.action(api.gymApplications.submit, input);
    const replay = await t.action(api.gymApplications.submit, input);
    expect(first).toMatchObject({ duplicate: false, applicationId: expect.any(String) });
    expect(replay).toMatchObject({ duplicate: true, applicationId: first.applicationId });
    await expect(t.action(api.gymApplications.submit, { ...input, gymName: "Different Gym" })).rejects.toMatchObject({ data: expect.objectContaining({ code: "CONFLICT" }) });
    const applications = await t.run((ctx) => ctx.db.query("gymApplications").collect());
    expect(applications).toHaveLength(1);
  });

  it("replaces expired public retry state before reusing its key", async () => {
    const t = await seedAdmin();
    await t.run(async (ctx) => {
      await ctx.db.insert("publicRequestIdempotency", { scope: "gym_application", key: "expired-application-key", requestHash: "old-hash", result: { applicationId: "old" }, createdAt: Date.now() - 86_400_000, expiresAt: Date.now() - 1 });
      // Simulate duplicate stale rows left by an older implementation that
      // used .unique() without cleaning expired retry state first.
      await ctx.db.insert("publicRequestIdempotency", { scope: "gym_application", key: "expired-application-key", requestHash: "older-hash", result: { applicationId: "older" }, createdAt: Date.now() - 2 * 86_400_000, expiresAt: Date.now() - 2 });
    });
    const submitted = await t.action(api.gymApplications.submit, { gymName: "Expired Retry Gym", ownerName: "Retry Owner", email: "expired-owner@example.test", contactNumber: "+962790000096", plan: "Starter", idempotencyKey: "expired-application-key" });
    expect(submitted.duplicate).toBe(false);
    const rows = await t.run((ctx) => ctx.db.query("publicRequestIdempotency").withIndex("by_scope_key", (q) => q.eq("scope", "gym_application").eq("key", "expired-application-key")).collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.result).toMatchObject({ applicationId: submitted.applicationId });
  });

  it("silently accepts honeypot submissions without creating an application", async () => {
    const t = await seedAdmin();
    const before = await t.run((ctx) => ctx.db.query("gymApplications").collect());
    const result = await t.action(api.gymApplications.submit, { gymName: "Spam Gym", ownerName: "Spam Owner", email: "spam@example.test", contactNumber: "+962790000098", plan: "Starter", website: "https://bot.invalid" });
    const after = await t.run((ctx) => ctx.db.query("gymApplications").collect());
    expect(result).toMatchObject({ status: "pending", duplicate: false });
    expect(after).toHaveLength(before.length);
  });

  it("bounds repeated public application attempts without storing raw identifiers", async () => {
    const t = await seedAdmin();
    for (let index = 0; index < 5; index += 1) {
      await t.action(api.gymApplications.submit, { gymName: `Rate Gym ${index}`, ownerName: "Rate Owner", email: "rate-owner@example.test", contactNumber: "+962790000097", plan: "Starter", idempotencyKey: `rate-key-${index}` });
    }
    await expect(t.action(api.gymApplications.submit, { gymName: "Rate Gym 6", ownerName: "Rate Owner", email: "rate-owner@example.test", contactNumber: "+962790000097", plan: "Starter", idempotencyKey: "rate-key-6" })).rejects.toMatchObject({ data: expect.objectContaining({ code: "RATE_LIMITED", message: "Too many requests. Please wait and try again." }) });
    const guards = await t.run((ctx) => ctx.db.query("publicRequestGuards").collect());
    expect(guards).toHaveLength(1);
    expect(JSON.stringify(guards[0])).not.toContain("rate-owner@example.test");
  });

  it("canonicalizes phone formatting and counts repeated existing-application attempts", async () => {
    const t = await seedAdmin();
    const phones = ["+962 79 000 0000", "+962790000000", "00962790000000", "+962-79-000-0000", "00962 79 000 0000", "+962790000000"];
    for (let index = 0; index < 5; index += 1) {
      await t.action(api.gymApplications.submit, { gymName: "Same Application Gym", ownerName: "Same Owner", email: "same-owner@example.test", contactNumber: phones[index]!, plan: "Starter" });
    }
    await expect(t.action(api.gymApplications.submit, { gymName: "Same Application Gym", ownerName: "Same Owner", email: "same-owner@example.test", contactNumber: phones[5]!, plan: "Starter" })).rejects.toMatchObject({ data: expect.objectContaining({ code: "RATE_LIMITED" }) });
    const applications = await t.run((ctx) => ctx.db.query("gymApplications").collect());
    expect(applications).toHaveLength(1);
  });

  it("captures applicant and internal notifications once while the worker is sandboxed", async () => {
    delete process.env.RIVET_OPERATIONAL_EMAIL_LIVE;
    process.env.RIVET_APPLICATION_RECIPIENTS = "sales@example.test";
    const t = await seedAdmin();
    const input = { gymName: "Queue Gym", ownerName: "Queue Owner", email: "owner@example.test", contactNumber: "+962790000001", plan: "Growth" as const };
    const first = await t.action(api.gymApplications.submit, input);
    const replay = await t.action(api.gymApplications.submit, input);
    expect(first).toMatchObject({ notificationStatus: "not_configured", duplicate: false });
    expect(replay).toMatchObject({ applicationId: first.applicationId, notificationStatus: "not_configured", duplicate: true });
    const deliveries = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").collect());
    expect(deliveries).toHaveLength(2);
    expect(deliveries.every((row) => row.status === "suppressed" && row.relatedEntityPublicId === first.applicationId)).toBe(true);
  });

  it("keeps newly queued application email sandboxed, while provider callbacks still require every related delivery", async () => {
    process.env.RIVET_OPERATIONAL_EMAIL_LIVE = "true";
    process.env.RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES = "gym_application_received_applicant,gym_application_received_internal,gym_application_approved";
    process.env.RIVET_APPLICATION_RECIPIENTS = "sales@example.test";
    const t = await seedAdmin();
    const submitted = await t.action(api.gymApplications.submit, { gymName: "Delivered Gym", ownerName: "Delivered Owner", email: "delivered-owner@example.test", contactNumber: "+962790000002", plan: "Pro" });
    expect(submitted.notificationStatus).toBe("not_configured");

    const submissionDeliveries = await t.run(async (ctx) => {
      const rows = await ctx.db.query("operationalEmailDeliveries").withIndex("by_related_entity", (q) => q.eq("relatedEntityType", "gym_application_submission").eq("relatedEntityPublicId", submitted.applicationId)).collect();
      for (const [index, row] of rows.entries()) await ctx.db.patch(row._id, { providerId: `provider-submission-${index}`, status: "provider_accepted" });
      return rows.map((row, index) => ({ ...row, providerId: `provider-submission-${index}` }));
    });
    expect(submissionDeliveries).toHaveLength(2);
    await t.mutation(internal.operationalEmail.recordWebhook, { webhookId: "submission-webhook-0", providerId: submissionDeliveries[0]!.providerId, eventType: "email.delivered", occurredAt: 100 });
    let application = await t.run((ctx) => ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", submitted.applicationId)).unique());
    expect(application?.notificationStatus).toBe("pending");
    await t.mutation(internal.operationalEmail.recordWebhook, { webhookId: "submission-webhook-1", providerId: submissionDeliveries[1]!.providerId, eventType: "email.delivered", occurredAt: 101 });
    application = await t.run((ctx) => ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", submitted.applicationId)).unique());
    expect(application?.notificationStatus).toBe("sent");

    const admin = t.withIdentity({ subject: "clerk-application-admin" });
    const reviewed = await admin.action(api.gymApplications.review, { applicationId: submitted.applicationId, decision: "approved", note: "Verified for durable queue test", correlationId: "cor-application-review" });
    expect(reviewed.reviewNotificationStatus).toBe("not_configured");
    const reviewDelivery = await t.run(async (ctx) => {
      const row = await ctx.db.query("operationalEmailDeliveries").withIndex("by_related_entity", (q) => q.eq("relatedEntityType", "gym_application_review").eq("relatedEntityPublicId", submitted.applicationId)).unique();
      if (!row) throw new Error("Review delivery is missing");
      await ctx.db.patch(row._id, { providerId: "provider-review", status: "provider_accepted" });
      return row;
    });
    expect(reviewDelivery.kind).toBe("gym_application_approved");
    await t.mutation(internal.operationalEmail.recordWebhook, { webhookId: "review-webhook", providerId: "provider-review", eventType: "email.delivered", occurredAt: 200 });
    application = await t.run((ctx) => ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", submitted.applicationId)).unique());
    expect(application?.reviewNotificationStatus).toBe("sent");
  });
});
