import { afterEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const previousLive = process.env.RIVET_OPERATIONAL_EMAIL_LIVE;
afterEach(() => { if (previousLive === undefined) delete process.env.RIVET_OPERATIONAL_EMAIL_LIVE; else process.env.RIVET_OPERATIONAL_EMAIL_LIVE = previousLive; });

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", { publicId: "email-org", name: "Email Gym", slug: "email-gym", status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branchId = await ctx.db.insert("branches", { organizationId, publicId: "email-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const ownerId = await ctx.db.insert("users", { publicId: "email-owner", authSubject: "clerk-email-owner", email: "owner@example.test", fullName: "Email Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerId, role: "owner", branchIds: [branchId], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("operationalEmailSettings", { organizationId, enabledKinds: ["payment_receipt"], updatedByUserId: ownerId, reason: "Test activation", createdAt: now, updatedAt: now });
    return { organizationId, branchId };
  });
  return { t, ...ids };
}

describe("durable operational email", () => {
  it("defaults to suppression and deduplicates queue requests", async () => {
    delete process.env.RIVET_OPERATIONAL_EMAIL_LIVE;
    const { t, organizationId } = await seed();
    const first = await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-1", recipientEmail: "member@example.test", dedupeKey: "receipt-1" });
    const replay = await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-1", recipientEmail: "member@example.test", dedupeKey: "receipt-1" });
    expect(first).toMatchObject({ status: "suppressed" });
    expect(replay.publicId).toBe(first.publicId);
    const rows = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.suppressionReason).toContain("Sandbox default");
    expect(rows[0]?.subject).toBe("Your RIVET payment receipt");
  });

  it("persists a versioned Arabic service template without exposing provider fiction", async () => {
    const { t, organizationId } = await seed();
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "pt_booking_confirmation", templateVersion: "pt-booking-confirmation-v1", language: "ar", recipientReference: "member-1", recipientEmail: "member@example.test", dedupeKey: "pt-arabic" });
    const row = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", "pt-arabic")).unique());
    expect(row).toMatchObject({ language: "ar", templateVersion: "pt-booking-confirmation-v1", subject: "تم حجز جلسة التدريب الشخصي", status: "suppressed" });
    expect(row?.html).toContain('dir="rtl"');
    expect(row?.text).not.toContain("delivered");
  });

  it("leases safely, applies the 1/5/30 retry cap, and alerts without recipient data", async () => {
    process.env.RIVET_OPERATIONAL_EMAIL_LIVE = "true";
    const { t, organizationId, branchId } = await seed();
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, branchId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-1", recipientEmail: "private-recipient@example.test", dedupeKey: "receipt-retry" });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const leased = await t.mutation(internal.operationalEmail.leaseDue, { limit: 10 });
      expect(leased).toHaveLength(1);
      const delivery = leased[0] as { _id: Id<"operationalEmailDeliveries">; leaseToken: string };
      await t.mutation(internal.operationalEmail.recordAttempt, { deliveryId: delivery._id, leaseToken: delivery.leaseToken, accepted: false, retryable: true, statusCode: 503, errorCode: "provider_unavailable" });
      await t.run(async (ctx) => {
        const row = await ctx.db.get(delivery._id);
        if (row?.status === "retrying") await ctx.db.patch(row._id, { nextAttemptAt: Date.now() - 1 });
      });
    }
    const state = await t.run(async (ctx) => ({ deliveries: await ctx.db.query("operationalEmailDeliveries").collect(), notifications: await ctx.db.query("operationalNotifications").collect() }));
    expect(state.deliveries[0]).toMatchObject({ status: "failed", attempts: [{ outcome: "retryable_failure" }, { outcome: "retryable_failure" }, { outcome: "retryable_failure" }] });
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.body).not.toContain("private-recipient@example.test");
  });

  it("deduplicates webhooks and ignores older out-of-order provider events", async () => {
    const { t, organizationId } = await seed();
    await t.run(async (ctx) => { await ctx.db.insert("operationalEmailDeliveries", { publicId: "EMAIL-WEBHOOK", organizationId, kind: "payment_receipt", messageClass: "service", templateVersion: "receipt-v1", language: "en", recipientReference: "member-1", recipientEmail: "member@example.test", subject: "Receipt", dedupeKey: "receipt-webhook", providerId: "provider-email-1", attempts: [], status: "provider_accepted", createdAt: 10, updatedAt: 10 }); });
    await t.mutation(internal.operationalEmail.recordWebhook, { webhookId: "webhook-delivered", providerId: "provider-email-1", eventType: "email.delivered", occurredAt: 200 });
    await t.mutation(internal.operationalEmail.recordWebhook, { webhookId: "webhook-older-failure", providerId: "provider-email-1", eventType: "email.bounced", occurredAt: 100 });
    await t.mutation(internal.operationalEmail.recordWebhook, { webhookId: "webhook-delivered", providerId: "provider-email-1", eventType: "email.delivered", occurredAt: 200 });
    const state = await t.run(async (ctx) => ({ deliveries: await ctx.db.query("operationalEmailDeliveries").collect(), events: await ctx.db.query("operationalEmailWebhookEvents").collect() }));
    expect(state.deliveries[0]).toMatchObject({ status: "delivered", providerEventAt: 200 });
    expect(state.events).toHaveLength(2);
  });
});
