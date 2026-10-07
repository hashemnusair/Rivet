import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { Webhook } from "svix";
import schema from "./schema";
import { enqueueOperationalEmail } from "./operationalEmail";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const resendWebhookFixture = `whsec_${Buffer.from("resend-email-test-fixture").toString("base64")}`;
const ammanTestFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });

function ammanTestParts(timestamp: number): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = ammanTestFormatter.formatToParts(new Date(timestamp));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function ammanTestMonthKey(timestamp: number): string {
  const parts = ammanTestParts(timestamp);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

function nextAmmanMonthStart(timestamp: number): number {
  const current = ammanTestParts(timestamp);
  const nextMonth = current.month === 12 ? 1 : current.month + 1;
  const nextYear = current.month === 12 ? current.year + 1 : current.year;
  const utcStart = Date.UTC(nextYear, nextMonth - 1, 1);
  for (let candidate = utcStart - 36 * 60 * 60_000; candidate <= utcStart + 36 * 60 * 60_000; candidate += 60_000) {
    const local = ammanTestParts(candidate);
    if (local.year === nextYear && local.month === nextMonth && local.day === 1 && local.hour === 0 && local.minute === 0 && local.second === 0) return candidate;
  }
  throw new Error("Asia/Amman month boundary was not found");
}

function signedResendRequest(payload: unknown, webhookId: string, secret = resendWebhookFixture): RequestInit {
  const body = JSON.stringify(payload);
  const timestamp = new Date();
  return {
    method: "POST",
    body,
    headers: {
      "svix-id": webhookId,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "svix-signature": new Webhook(secret).sign(webhookId, timestamp, body),
    },
  };
}

const previousEnvironment = {
  live: process.env.RIVET_OPERATIONAL_EMAIL_LIVE,
  apiKey: process.env.RESEND_API_KEY,
  from: process.env.RESEND_FROM_EMAIL,
  globalTypes: process.env.RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES,
  webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
};
afterEach(() => {
  for (const key of ["RIVET_EMAIL_MODE", "RIVET_EMAIL_SANDBOX_TO", "RIVET_EMAIL_ALLOWLIST"]) delete process.env[key];
  for (const [key, value] of Object.entries({ RIVET_OPERATIONAL_EMAIL_LIVE: previousEnvironment.live, RESEND_API_KEY: previousEnvironment.apiKey, RESEND_FROM_EMAIL: previousEnvironment.from, RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES: previousEnvironment.globalTypes, RESEND_WEBHOOK_SECRET: previousEnvironment.webhookSecret })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  vi.unstubAllGlobals();
});

function enableLiveWorker() {
  process.env.RIVET_OPERATIONAL_EMAIL_LIVE = "true";
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.RESEND_FROM_EMAIL = "RIVET <noreply@rivetjo.com>";
}

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", { publicId: "email-org", name: "Email Gym", slug: "email-gym", status: "active", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branchId = await ctx.db.insert("branches", { organizationId, publicId: "email-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const ownerId = await ctx.db.insert("users", { publicId: "email-owner", authSubject: "clerk-email-owner", email: "owner@example.test", fullName: "Email Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerId, role: "owner", branchIds: [branchId], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("operationalEmailSettings", { organizationId, enabledKinds: ["payment_receipt"], updatedByUserId: ownerId, reason: "Test activation", ownerConfirmedAt: now, ownerConfirmedByUserId: ownerId, createdAt: now, updatedAt: now });
    return { organizationId, branchId, ownerId };
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
    expect(rows[0]?.suppressionReason).toMatch(/mode is off/);
    expect(rows[0]?.subject).toBe("Your RIVET payment receipt");
  });

  it("persists a versioned Arabic service template without exposing provider fiction", async () => {
    const { t, organizationId } = await seed();
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "pt_booking_confirmation", templateVersion: "pt-booking-confirmation-v1", language: "ar", recipientReference: "member-1", recipientEmail: "member@example.test", dedupeKey: "pt-arabic" });
    const row = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", "pt-arabic")).unique());
    expect(row).toMatchObject({ language: "ar", templateVersion: "pt-booking-confirmation-v1", subject: "تم حجز حصة التدريب الشخصي", status: "suppressed" });
    expect(row?.html).toContain('dir="rtl"');
    expect(row?.text).not.toContain("delivered");
  });

  it("keeps platform billing and subscription notices mandatory even when a gym has no enabled service categories", async () => {
    enableLiveWorker();
    const { t, organizationId } = await seed();
    await t.run(async (ctx) => {
      const settings = await ctx.db.query("operationalEmailSettings").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).unique();
      if (settings) await ctx.db.patch(settings._id, { enabledKinds: [] });
    });
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "platform_invoice_past_due", templateVersion: "invoice-v1", recipientReference: "email-owner", recipientEmail: "owner@example.test", dedupeKey: "mandatory-platform-invoice" });
    const row = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", "mandatory-platform-invoice")).unique());
    expect(row?.status).toBe("queued");
    expect(row?.suppressionReason).toBeUndefined();
  });

  it("describes the invoice reminder as issued, without claiming payment is due three days later", async () => {
    const { t, organizationId } = await seed();
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "platform_invoice_reminder", templateVersion: "platform-invoice-reminder-v1", recipientReference: "email-owner", recipientEmail: "owner@example.test", dedupeKey: "invoice-reminder-copy" });
    const row = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", "invoice-reminder-copy")).unique());
    expect(row?.subject).toBe("Your RIVET invoice is ready");
    expect(row?.text).toContain("Payment is due on the date shown.");
    expect(row?.text).not.toContain("due in three days");
  });

  it("sends a confirmed enabled category through Resend and persists only provider-safe outcome data", async () => {
    enableLiveWorker();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "provider-email-accepted" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, organizationId, branchId } = await seed();
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, branchId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-1", recipientEmail: "private-recipient@example.test", dedupeKey: "receipt-retry" });
    const result = await t.action(internal.operationalEmail.processDue, {});
    const rows = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").collect());
    expect(result).toEqual({ processed: 1, disabled: false });
    expect(rows[0]).toMatchObject({ status: "provider_accepted", providerId: "provider-email-accepted", attempts: [{ outcome: "accepted", statusCode: 200 }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toMatchObject({ "Idempotency-Key": "receipt-retry" });
  });

  it("does not queue gym-controlled delivery until the owner has confirmed categories", async () => {
    enableLiveWorker();
    const { t, organizationId } = await seed();
    await t.run(async (ctx) => {
      const settings = await ctx.db.query("operationalEmailSettings").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).unique();
      if (settings) await ctx.db.patch(settings._id, { ownerConfirmedAt: undefined, ownerConfirmedByUserId: undefined });
    });
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-1", recipientEmail: "member@example.test", dedupeKey: "owner-unconfirmed" });
    const row = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", "owner-unconfirmed")).unique());
    expect(row).toMatchObject({ status: "suppressed", suppressionReason: "The gym owner has not confirmed operational email preferences" });
  });

  it("retries transient provider failures after the configured first backoff", async () => {
    enableLiveWorker();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "provider-email-retry-success" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, organizationId } = await seed();
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-1", recipientEmail: "member@example.test", dedupeKey: "receipt-transient" });
    const before = Date.now();
    await t.action(internal.operationalEmail.processDue, {});
    const row = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", "receipt-transient")).unique());
    expect(row).toMatchObject({ status: "retrying", quotaReservationMonth: expect.any(String), attempts: [{ outcome: "retryable_failure", statusCode: 503, errorCode: "provider_http_503" }] });
    expect(row?.nextAttemptAt).toBeGreaterThanOrEqual(before + 60_000);
    const firstUsage = await t.run((ctx) => ctx.db.query("operationalEmailQuotaUsage").withIndex("by_organization_month", (q) => q.eq("organizationId", organizationId).eq("periodKey", row?.quotaReservationMonth ?? "")).unique());
    expect(firstUsage).toMatchObject({ reservedCount: 1 });
    await t.run(async (ctx) => { if (row) await ctx.db.patch(row._id, { nextAttemptAt: Date.now() - 1 }); });
    await t.action(internal.operationalEmail.processDue, {});
    const retried = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", "receipt-transient")).unique());
    const usageAfterRetry = await t.run((ctx) => ctx.db.query("operationalEmailQuotaUsage").withIndex("by_organization_month", (q) => q.eq("organizationId", organizationId).eq("periodKey", row?.quotaReservationMonth ?? "")).unique());
    expect(retried).toMatchObject({ status: "provider_accepted", quotaReservationMonth: row?.quotaReservationMonth, attempts: [{ outcome: "retryable_failure" }, { outcome: "accepted" }] });
    expect(usageAfterRetry).toMatchObject({ reservedCount: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("routes terminal delivery failures to the email settings instead of deferred automation UI", async () => {
    enableLiveWorker();
    const { t, organizationId } = await seed();
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-1", recipientEmail: "member@example.test", dedupeKey: "receipt-terminal" });
    const leased = await t.mutation(internal.operationalEmail.leaseDue, { limit: 1 });
    const delivery = leased[0] as { _id: string; leaseToken?: string };
    expect(delivery?.leaseToken).toBeTruthy();
    await t.mutation(internal.operationalEmail.recordAttempt, { deliveryId: delivery._id as Id<"operationalEmailDeliveries">, leaseToken: delivery.leaseToken!, accepted: false, retryable: false, statusCode: 550, errorCode: "provider_terminal" });
    const notifications = await t.run((ctx) => ctx.db.query("operationalNotifications").collect());
    expect(notifications).toEqual([expect.objectContaining({ kind: "operational_email_failed", href: "/settings?section=email" })]);
  });

  it("suppresses a queued category if the gym disables it before the worker leases it", async () => {
    enableLiveWorker();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { t, organizationId } = await seed();
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-1", recipientEmail: "member@example.test", dedupeKey: "disabled-before-lease" });
    await t.run(async (ctx) => {
      const settings = await ctx.db.query("operationalEmailSettings").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).unique();
      if (settings) await ctx.db.patch(settings._id, { enabledKinds: [] });
    });
    expect(await t.action(internal.operationalEmail.processDue, {})).toEqual({ processed: 0, disabled: false });
    const row = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", "disabled-before-lease")).unique());
    expect(row).toMatchObject({ status: "suppressed", suppressionReason: "This operational email type was disabled before delivery" });
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("resolves same-time delivery and hard-bounce events deterministically", async () => {
    const { t, organizationId } = await seed();
    await t.run(async (ctx) => { await ctx.db.insert("operationalEmailDeliveries", { publicId: "EMAIL-WEBHOOK-TIE", organizationId, kind: "payment_receipt", messageClass: "service", templateVersion: "receipt-v1", language: "en", recipientReference: "member-1", recipientEmail: "member@example.test", subject: "Receipt", dedupeKey: "receipt-webhook-tie", providerId: "provider-email-tie", attempts: [], status: "provider_accepted", createdAt: 10, updatedAt: 10 }); });
    await t.mutation(internal.operationalEmail.recordWebhook, { webhookId: "tie-delivered", providerId: "provider-email-tie", eventType: "email.delivered", occurredAt: 200 });
    await t.mutation(internal.operationalEmail.recordWebhook, { webhookId: "tie-hard-bounce", providerId: "provider-email-tie", eventType: "email.bounced", occurredAt: 200, recipientEmails: ["member@example.test"], bounceType: "Permanent" });
    await t.mutation(internal.operationalEmail.recordWebhook, { webhookId: "tie-late-delivered", providerId: "provider-email-tie", eventType: "email.delivered", occurredAt: 200 });
    const state = await t.run(async (ctx) => ({ deliveries: await ctx.db.query("operationalEmailDeliveries").collect(), suppressions: await ctx.db.query("operationalEmailSuppressions").collect() }));
    expect(state.deliveries[0]).toMatchObject({ status: "failed", providerEventAt: 200, providerEventType: "email.bounced" });
    expect(state.suppressions).toMatchObject([{ email: "member@example.test", reason: "hard_bounce" }]);
  });

  it("accepts signed Resend callbacks and suppresses queued and retrying mail after permanent bounces or complaints", async () => {
    enableLiveWorker();
    process.env.RESEND_WEBHOOK_SECRET = resendWebhookFixture;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { t, organizationId } = await seed();
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-1", recipientEmail: "member@example.test", dedupeKey: "address-queued" });
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-1", recipientEmail: "member@example.test", dedupeKey: "address-retrying" });
    const firstEventAt = Date.now() - 2_000;
    await t.run(async (ctx) => {
      const retry = await ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", "address-retrying")).unique();
      if (retry) await ctx.db.patch(retry._id, { status: "retrying", nextAttemptAt: Date.now() - 1 });
      await ctx.db.insert("operationalEmailDeliveries", { publicId: "EMAIL-SUPPRESSION-SOURCE", organizationId, kind: "payment_receipt", messageClass: "service", templateVersion: "receipt-v1", language: "en", recipientReference: "member-1", recipientEmail: "member@example.test", subject: "Receipt", dedupeKey: "address-source", providerId: "provider-bounce-source", attempts: [], status: "provider_accepted", createdAt: firstEventAt - 1, updatedAt: firstEventAt - 1 });
      await ctx.db.insert("operationalEmailDeliveries", { publicId: "EMAIL-PROVIDER-SUPPRESSED", organizationId, kind: "payment_receipt", messageClass: "service", templateVersion: "receipt-v1", language: "en", recipientReference: "member-2", recipientEmail: "muted@example.test", subject: "Receipt", dedupeKey: "provider-suppressed-source", providerId: "provider-suppressed-source", attempts: [], status: "provider_accepted", createdAt: firstEventAt - 1, updatedAt: firstEventAt - 1 });
    });

    const bounce = { type: "email.bounced", created_at: new Date(firstEventAt).toISOString(), data: { email_id: "provider-bounce-source", to: ["Member@Example.test"], bounce: { type: "Permanent" } } };
    const forged = await t.fetch("/webhooks/resend", signedResendRequest(bounce, "resend-hard-bounce", `whsec_${Buffer.from("wrong-resend-fixture").toString("base64")}`));
    expect(forged.status).toBe(400);
    expect(await t.run((ctx) => ctx.db.query("operationalEmailSuppressions").collect())).toHaveLength(0);

    const accepted = await t.fetch("/webhooks/resend", signedResendRequest(bounce, "resend-hard-bounce"));
    expect(accepted.status).toBe(200);
    expect(await t.run((ctx) => ctx.db.query("operationalEmailSuppressions").collect())).toMatchObject([{ email: "member@example.test", reason: "hard_bounce" }]);

    const complaint = { type: "email.complained", created_at: new Date(firstEventAt + 1_000).toISOString(), data: { email_id: "provider-bounce-source", to: ["member@example.test"] } };
    expect((await t.fetch("/webhooks/resend", signedResendRequest(complaint, "resend-complaint"))).status).toBe(200);
    const replay = await t.fetch("/webhooks/resend", signedResendRequest(complaint, "resend-complaint"));
    expect(replay.status).toBe(200);
    expect(await t.run((ctx) => ctx.db.query("operationalEmailSuppressions").collect())).toMatchObject([{ email: "member@example.test", reason: "complaint" }]);

    const providerSuppressed = { type: "email.suppressed", created_at: new Date(firstEventAt + 2_000).toISOString(), data: { email_id: "provider-suppressed-source", to: ["muted@example.test"] } };
    expect((await t.fetch("/webhooks/resend", signedResendRequest(providerSuppressed, "resend-provider-suppressed"))).status).toBe(200);
    const suppressedReplay = await t.fetch("/webhooks/resend", signedResendRequest(providerSuppressed, "resend-provider-suppressed"));
    expect(suppressedReplay.status).toBe(200);
    const providerSuppressedState = await t.run(async (ctx) => ({
      delivery: await ctx.db.query("operationalEmailDeliveries").withIndex("by_provider_id", (q) => q.eq("providerId", "provider-suppressed-source")).unique(),
      suppressions: await ctx.db.query("operationalEmailSuppressions").collect(),
    }));
    expect(providerSuppressedState.delivery).toMatchObject({ status: "suppressed", providerEventType: "email.suppressed", suppressionReason: "The email provider suppressed delivery" });
    expect(providerSuppressedState.suppressions).toMatchObject([{ email: "member@example.test", reason: "complaint" }]);

    const future = await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-1", recipientEmail: "MEMBER@example.test", dedupeKey: "address-future" });
    expect(future.status).toBe("suppressed");
    expect(await t.action(internal.operationalEmail.processDue, {})).toEqual({ processed: 0, disabled: false });
    expect(fetchMock).not.toHaveBeenCalled();
    const rows = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").collect());
    expect(rows.find((row) => row.dedupeKey === "address-future")).toMatchObject({ status: "suppressed", suppressionReason: "This email address is suppressed after a delivery issue" });
    expect(rows.find((row) => row.dedupeKey === "address-queued")).toMatchObject({ status: "suppressed" });
    expect(rows.find((row) => row.dedupeKey === "address-retrying")).toMatchObject({ status: "suppressed" });
    expect(rows.find((row) => row.dedupeKey === "address-source")).toMatchObject({ status: "suppressed", providerEventType: "email.complained", suppressionReason: "Recipient reported this email as spam" });
    expect(await t.run((ctx) => ctx.db.query("operationalEmailWebhookEvents").collect())).toHaveLength(3);
  });
});

describe("monthly member email quota", () => {
  it("uses the Starter catalogue allowance when no persisted plan override exists", async () => {
    enableLiveWorker();
    const { t, organizationId } = await seed();
    const now = Date.now();
    const periodKey = ammanTestMonthKey(now);
    await t.run(async (ctx) => {
      await ctx.db.patch(organizationId, { subscriptionPlan: "Starter" });
      await ctx.db.insert("operationalEmailQuotaUsage", { organizationId, periodKey, reservedCount: 599, monthlyLimit: 1_000, createdAt: now, updatedAt: now });
    });
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-1", recipientEmail: "member@example.test", dedupeKey: "catalog-limit-1" });
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-2", recipientEmail: "member-2@example.test", dedupeKey: "catalog-limit-2" });

    expect(await t.mutation(internal.operationalEmail.leaseDue, { limit: 50 })).toHaveLength(1);
    const state = await t.run(async (ctx) => ({
      usage: await ctx.db.query("operationalEmailQuotaUsage").withIndex("by_organization_month", (q) => q.eq("organizationId", organizationId).eq("periodKey", periodKey)).unique(),
      deliveries: await ctx.db.query("operationalEmailDeliveries").collect(),
    }));
    expect(state.usage).toMatchObject({ reservedCount: 600, monthlyLimit: 600 });
    expect(state.deliveries.filter((row) => row.status === "retrying")).toMatchObject([{ quotaDeferredUntil: expect.any(Number), suppressionReason: expect.stringContaining("limit of 600") }]);
  });

  it("reserves concurrently without exceeding the persisted limit or sharing usage across organizations", async () => {
    enableLiveWorker();
    const { t, organizationId } = await seed();
    const secondOrganizationId = await t.run(async (ctx) => {
      await ctx.db.patch(organizationId, { subscriptionPlan: "Starter" });
      const now = Date.now();
      const ownerId = await ctx.db.insert("users", { publicId: "quota-owner-b", authSubject: "clerk-quota-owner-b", email: "quota-owner-b@example.test", fullName: "Quota Owner B", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      const otherOrganizationId = await ctx.db.insert("organizations", { publicId: "quota-org-b", name: "Quota Gym B", slug: "quota-gym-b", status: "active", subscriptionPlan: "Starter", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
      await ctx.db.insert("operationalEmailSettings", { organizationId: otherOrganizationId, enabledKinds: ["payment_receipt"], updatedByUserId: ownerId, reason: "Quota test", ownerConfirmedAt: now, ownerConfirmedByUserId: ownerId, createdAt: now, updatedAt: now });
      await ctx.db.insert("domainRecords", { organizationId, entityType: "platformPlan", publicId: "Starter", createdAt: now, updatedAt: now, data: { name: "Starter", operationalEmails: 2 } });
      for (let index = 0; index < 3; index += 1) {
        await enqueueOperationalEmail(ctx, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: `member-${index}`, recipientEmail: `member-${index}@example.test`, dedupeKey: `concurrent-a-${index}` });
      }
      await enqueueOperationalEmail(ctx, { organizationId: otherOrganizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-b", recipientEmail: "member-b@example.test", dedupeKey: "concurrent-b-1" });
      return otherOrganizationId;
    });

    const leaseResults = await Promise.all(Array.from({ length: 4 }, () => t.mutation(internal.operationalEmail.leaseDue, { limit: 1 })));
    const leased = leaseResults.flat() as Array<{ _id: string }>;
    const state = await t.run(async (ctx) => ({
      deliveries: await ctx.db.query("operationalEmailDeliveries").collect(),
      usage: await ctx.db.query("operationalEmailQuotaUsage").collect(),
    }));
    expect(leased).toHaveLength(3);
    expect(new Set(leased.map((row) => row._id)).size).toBe(3);
    expect(state.usage.find((row) => row.organizationId === organizationId)).toMatchObject({ reservedCount: 2, monthlyLimit: 2 });
    expect(state.usage.find((row) => row.organizationId === secondOrganizationId)).toMatchObject({ reservedCount: 1, monthlyLimit: 2 });
    expect(state.deliveries.filter((row) => row.organizationId === organizationId && row.status === "retrying")).toHaveLength(1);
    expect(state.deliveries.find((row) => row.organizationId === secondOrganizationId)).toMatchObject({ status: "leased", quotaReservationMonth: expect.any(String) });
  });

  it("honors an explicit zero platform-plan email allowance", async () => {
    enableLiveWorker();
    const { t, organizationId } = await seed();
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.patch(organizationId, { subscriptionPlan: "Starter" });
      await ctx.db.insert("domainRecords", { organizationId, entityType: "platformPlan", publicId: "Starter", createdAt: now, updatedAt: now, data: { name: "Starter", operationalEmails: 0 } });
      await enqueueOperationalEmail(ctx, { organizationId, kind: "platform_invoice_issued", templateVersion: "invoice-v1", recipientReference: "invoice-1", recipientEmail: "owner@example.test", dedupeKey: "zero-allowance-platform-invoice" });
    });
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-1", recipientEmail: "member@example.test", dedupeKey: "zero-email-allowance" });

    const leased = await t.mutation(internal.operationalEmail.leaseDue, { limit: 50 });
    expect(leased).toHaveLength(1);
    const state = await t.run(async (ctx) => ({
      deliveries: await ctx.db.query("operationalEmailDeliveries").collect(),
      usage: await ctx.db.query("operationalEmailQuotaUsage").collect(),
    }));
    expect(state.deliveries.find((row) => row.dedupeKey === "zero-email-allowance")).toMatchObject({ status: "retrying", nextAttemptAt: expect.any(Number), quotaDeferredUntil: expect.any(Number) });
    expect(state.deliveries.find((row) => row.dedupeKey === "zero-allowance-platform-invoice")).toMatchObject({ status: "leased" });
    expect(state.usage).toHaveLength(0);
  });

  it("defers at the exact Asia/Amman month boundary and reserves against the new month", async () => {
    enableLiveWorker();
    const { t, organizationId } = await seed();
    const currentTime = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.patch(organizationId, { subscriptionPlan: "Starter" });
      await ctx.db.insert("domainRecords", { organizationId, entityType: "platformPlan", publicId: "Starter", createdAt: currentTime, updatedAt: currentTime, data: { name: "Starter", operationalEmails: 1 } });
    });
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-a", recipientEmail: "member-a@example.test", dedupeKey: "month-boundary-a" });
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-b", recipientEmail: "member-b@example.test", dedupeKey: "month-boundary-b" });

    const boundary = nextAmmanMonthStart(currentTime);
    const beforeBoundary = boundary - 60_000;
    const firstMonth = ammanTestMonthKey(beforeBoundary);
    const secondMonth = ammanTestMonthKey(boundary);
    const firstLeases = await t.mutation(internal.operationalEmail.leaseDue, { limit: 50, now: beforeBoundary });
    expect(firstLeases).toHaveLength(1);
    const deferred = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", "month-boundary-b")).unique());
    expect(deferred).toMatchObject({ status: "retrying", nextAttemptAt: boundary, quotaDeferredUntil: boundary });

    const secondLeases = await t.mutation(internal.operationalEmail.leaseDue, { limit: 50, now: boundary });
    expect(secondLeases).toHaveLength(1);
    expect(String(secondLeases[0]?._id)).toBe(String(deferred?._id));
    const usage = await t.run((ctx) => ctx.db.query("operationalEmailQuotaUsage").collect());
    expect(usage.find((row) => row.periodKey === firstMonth)).toMatchObject({ reservedCount: 1, monthlyLimit: 1 });
    expect(usage.find((row) => row.periodKey === secondMonth)).toMatchObject({ reservedCount: 1, monthlyLimit: 1 });
    const requeued = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", "month-boundary-b")).unique());
    expect(requeued).toMatchObject({ status: "leased", quotaReservationMonth: secondMonth });
    expect(requeued?.quotaDeferredUntil).toBeUndefined();
    expect(requeued?.suppressionReason).toBeUndefined();
  });
});

describe("operational email go-live modes", () => {
  it("redirects every message to the sandbox inbox with the real recipient in the subject", async () => {
    process.env.RIVET_EMAIL_MODE = "sandbox";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "RIVET <noreply@rivetjo.com>";
    process.env.RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES = "platform_invoice_issued";
    process.env.RIVET_EMAIL_SANDBOX_TO = "inbox@rivetjo.com";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "provider-sandbox" }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "provider-live" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await enqueueOperationalEmail(ctx, { kind: "platform_invoice_issued", templateVersion: "v1", recipientReference: "invoice-1", recipientEmail: "owner@gym.jo", dedupeKey: "sandbox-1", subject: "Invoice issued" });
    });
    await t.action(internal.operationalEmail.processDue, {});
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as { to: string[]; subject: string; reply_to?: string };
    expect(body.to).toEqual(["inbox@rivetjo.com"]);
    expect(body.subject).toBe("[sandbox → owner@gym.jo] Invoice issued");
    expect(body.reply_to).toBe("sales@rivetjo.com");
    const delivery = await t.run(async (ctx) => (await ctx.db.query("operationalEmailDeliveries").collect())[0]);
    expect(delivery?.attempts[0]).toMatchObject({ outcome: "accepted", mode: "sandbox", deliveredTo: "inbox@rivetjo.com" });
    await t.mutation(internal.operationalEmail.recordWebhook, { webhookId: "sandbox-hard-bounce", providerId: "provider-sandbox", eventType: "email.bounced", occurredAt: Date.now(), recipientEmails: ["inbox@rivetjo.com"], bounceType: "Permanent" });
    expect(await t.run((ctx) => ctx.db.query("operationalEmailSuppressions").collect())).toMatchObject([{ email: "inbox@rivetjo.com", reason: "hard_bounce" }]);

    process.env.RIVET_EMAIL_MODE = "live";
    await t.run(async (ctx) => {
      await enqueueOperationalEmail(ctx, { kind: "platform_invoice_issued", templateVersion: "v1", recipientReference: "invoice-live", recipientEmail: "owner@gym.jo", dedupeKey: "live-original-after-sandbox-bounce", subject: "Invoice issued" });
    });
    await t.action(internal.operationalEmail.processDue, {});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const liveDelivery = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", "live-original-after-sandbox-bounce")).unique());
    expect(liveDelivery).toMatchObject({ status: "provider_accepted", recipientEmail: "owner@gym.jo", attempts: [{ mode: "live", deliveredTo: "owner@gym.jo" }] });

    await t.mutation(internal.operationalEmail.recordWebhook, { webhookId: "live-hard-bounce", providerId: "provider-live", eventType: "email.bounced", occurredAt: Date.now(), bounceType: "Permanent" });
    expect(await t.run((ctx) => ctx.db.query("operationalEmailSuppressions").collect())).toMatchObject([
      { email: "inbox@rivetjo.com", reason: "hard_bounce" },
      { email: "owner@gym.jo", reason: "hard_bounce" },
    ]);
    const futureLive = await t.run(async (ctx) => await enqueueOperationalEmail(ctx, { kind: "platform_invoice_issued", templateVersion: "v1", recipientReference: "invoice-live-next", recipientEmail: "owner@gym.jo", dedupeKey: "live-original-suppressed", subject: "Invoice issued" }));
    expect(futureLive.status).toBe("suppressed");
    delete process.env.RIVET_EMAIL_MODE;
    delete process.env.RIVET_EMAIL_SANDBOX_TO;
  });

  it("uses a RIVET reply address for all operational mail", async () => {
    process.env.RIVET_EMAIL_MODE = "sandbox";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "RIVET <noreply@rivetjo.com>";
    process.env.RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES = "gym_application_received_applicant";
    process.env.RIVET_EMAIL_SANDBOX_TO = "inbox@rivetjo.com";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "provider-application" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await enqueueOperationalEmail(ctx, { kind: "gym_application_received_applicant", templateVersion: "gym-application-received-v1", recipientReference: "owner@example.test", recipientEmail: "owner@example.test", dedupeKey: "application-reply-to", subject: "Application received", html: "<p>received</p>", text: "received" });
    });
    await t.action(internal.operationalEmail.processDue, {});
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as { reply_to?: string };
    expect(body.reply_to).toBe("sales@rivetjo.com");
  });

  it("suppresses recipients outside the allowlist with a readable reason and never calls the provider for them", async () => {
    process.env.RIVET_EMAIL_MODE = "allowlist";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "RIVET <noreply@rivetjo.com>";
    process.env.RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES = "platform_invoice_issued";
    process.env.RIVET_EMAIL_ALLOWLIST = "@rivetjo.com, pilot@gym.jo";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "provider-allowed" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await enqueueOperationalEmail(ctx, { kind: "platform_invoice_issued", templateVersion: "v1", recipientReference: "invoice-2", recipientEmail: "pilot@gym.jo", dedupeKey: "allow-1", subject: "Invoice issued" });
      await enqueueOperationalEmail(ctx, { kind: "platform_invoice_issued", templateVersion: "v1", recipientReference: "invoice-3", recipientEmail: "member@gmail.com", dedupeKey: "allow-2", subject: "Invoice issued" });
    });
    expect(await t.action(internal.operationalEmail.processDue, {})).toEqual({ processed: 2, disabled: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const rows = await t.run(async (ctx) => await ctx.db.query("operationalEmailDeliveries").collect());
    expect(rows.find((row) => row.recipientEmail === "pilot@gym.jo")).toMatchObject({ status: "provider_accepted" });
    expect(rows.find((row) => row.recipientEmail === "member@gmail.com")).toMatchObject({ status: "suppressed", suppressionReason: expect.stringMatching(/allowlist/) });
    delete process.env.RIVET_EMAIL_MODE;
    delete process.env.RIVET_EMAIL_ALLOWLIST;
  });

  it("in allowlist mode, suppresses subscribed gym and member addresses without a list entry", async () => {
    process.env.RIVET_EMAIL_MODE = "allowlist";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "RIVET <noreply@rivetjo.com>";
    process.env.RIVET_EMAIL_ALLOWLIST = "@rivetjo.com";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "provider-trusted" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const now = Date.now();
      const active = await ctx.db.insert("organizations", { publicId: "org-active", name: "Active Gym", slug: "active-gym", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
      const suspended = await ctx.db.insert("organizations", { publicId: "org-suspended", name: "Suspended Gym", slug: "suspended-gym", status: "suspended", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
      const owner = await ctx.db.insert("users", { publicId: "u-owner", authSubject: "clerk-trusted-owner", email: "hashem.owner@gmail.com", fullName: "Gym Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      const other = await ctx.db.insert("users", { publicId: "u-other", authSubject: "clerk-suspended-owner", email: "other.owner@gmail.com", fullName: "Other Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: active, userId: owner, role: "owner", branchIds: [], branchScope: "all", active: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: suspended, userId: other, role: "owner", branchIds: [], branchScope: "all", active: true, createdAt: now, updatedAt: now });
      // The active gym has switched member service email on.
      await ctx.db.insert("operationalEmailSettings", { organizationId: active, enabledKinds: ["pt_booking_confirmation"], ownerConfirmedAt: now, ownerConfirmedByUserId: owner, reason: "Pilot", createdAt: now, updatedAt: now, updatedByUserId: owner });
      // Member-facing, to a member of the active gym: served, no list entry.
      await enqueueOperationalEmail(ctx, { organizationId: active, kind: "pt_booking_confirmation", templateVersion: "v1", recipientReference: "member-1", recipientEmail: "samira.member@gmail.com", dedupeKey: "trust-4", subject: "Your PT session is booked" });
      // Member-facing, to a member of the suspended gym: held back.
      await ctx.db.insert("operationalEmailSettings", { organizationId: suspended, enabledKinds: ["pt_booking_confirmation"], ownerConfirmedAt: now, ownerConfirmedByUserId: other, reason: "Pilot", createdAt: now, updatedAt: now, updatedByUserId: other });
      await enqueueOperationalEmail(ctx, { organizationId: suspended, kind: "pt_booking_confirmation", templateVersion: "v1", recipientReference: "member-2", recipientEmail: "lapsed.member@gmail.com", dedupeKey: "trust-5", subject: "Your PT session is booked" });
      // Gym-facing, to the active gym's owner: trusted.
      await enqueueOperationalEmail(ctx, { organizationId: active, kind: "platform_invoice_issued", templateVersion: "v1", recipientReference: "inv-a", recipientEmail: "hashem.owner@gmail.com", dedupeKey: "trust-1", subject: "Invoice issued" });
      // Gym-facing, to the suspended gym's owner: not subscribed, held back.
      await enqueueOperationalEmail(ctx, { organizationId: suspended, kind: "platform_invoice_issued", templateVersion: "v1", recipientReference: "inv-b", recipientEmail: "other.owner@gmail.com", dedupeKey: "trust-2", subject: "Invoice issued" });
      // Gym-facing, to an address that is not on the active gym's team: held back.
      await enqueueOperationalEmail(ctx, { organizationId: active, kind: "subscription_agreement_copy", templateVersion: "v1", recipientReference: "copy", recipientEmail: "someone.else@gmail.com", dedupeKey: "trust-3", subject: "Copy" });
    });
    expect(await t.action(internal.operationalEmail.processDue, {})).toEqual({ processed: 5, disabled: false });
    expect(fetchMock).not.toHaveBeenCalled();
    const rows = await t.run(async (ctx) => await ctx.db.query("operationalEmailDeliveries").collect());
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.status === "suppressed" && row.suppressionReason?.includes("RIVET_EMAIL_ALLOWLIST"))).toBe(true);
    delete process.env.RIVET_EMAIL_MODE;
    delete process.env.RIVET_EMAIL_ALLOWLIST;
  });

  it("keeps everything suppressed when the mode is off even if the provider is configured", async () => {
    process.env.RIVET_EMAIL_MODE = "off";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "RIVET <noreply@rivetjo.com>";
    process.env.RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES = "platform_invoice_issued";
    const t = convexTest(schema, modules);
    const delivery = await t.run(async (ctx) => await enqueueOperationalEmail(ctx, { kind: "platform_invoice_issued", templateVersion: "v1", recipientReference: "invoice-4", recipientEmail: "owner@gym.jo", dedupeKey: "off-1" }));
    expect(delivery).toMatchObject({ status: "suppressed", suppressionReason: expect.stringMatching(/mode is off/) });
    expect(await t.action(internal.operationalEmail.processDue, {})).toEqual({ processed: 0, disabled: true });
    delete process.env.RIVET_EMAIL_MODE;
  });
});
