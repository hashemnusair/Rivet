import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { enqueueOperationalEmail } from "./operationalEmail";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const previousEnvironment = {
  live: process.env.RIVET_OPERATIONAL_EMAIL_LIVE,
  apiKey: process.env.RESEND_API_KEY,
  from: process.env.RESEND_FROM_EMAIL,
  globalTypes: process.env.RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES,
};
afterEach(() => {
  for (const key of ["RIVET_EMAIL_MODE", "RIVET_EMAIL_SANDBOX_TO", "RIVET_EMAIL_ALLOWLIST"]) delete process.env[key];
  for (const [key, value] of Object.entries({ RIVET_OPERATIONAL_EMAIL_LIVE: previousEnvironment.live, RESEND_API_KEY: previousEnvironment.apiKey, RESEND_FROM_EMAIL: previousEnvironment.from, RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES: previousEnvironment.globalTypes })) {
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
    expect(row).toMatchObject({ language: "ar", templateVersion: "pt-booking-confirmation-v1", subject: "تم حجز جلسة التدريب الشخصي", status: "suppressed" });
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const { t, organizationId } = await seed();
    await t.mutation(internal.operationalEmail.enqueue, { organizationId, kind: "payment_receipt", templateVersion: "receipt-v1", recipientReference: "member-1", recipientEmail: "member@example.test", dedupeKey: "receipt-transient" });
    const before = Date.now();
    await t.action(internal.operationalEmail.processDue, {});
    const row = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", "receipt-transient")).unique());
    expect(row).toMatchObject({ status: "retrying", attempts: [{ outcome: "retryable_failure", statusCode: 503, errorCode: "provider_http_503" }] });
    expect(row?.nextAttemptAt).toBeGreaterThanOrEqual(before + 60_000);
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
});

describe("operational email go-live modes", () => {
  it("redirects every message to the sandbox inbox with the real recipient in the subject", async () => {
    process.env.RIVET_EMAIL_MODE = "sandbox";
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "RIVET <noreply@rivetjo.com>";
    process.env.RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES = "platform_invoice_issued";
    process.env.RIVET_EMAIL_SANDBOX_TO = "inbox@rivetjo.com";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "provider-sandbox" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await enqueueOperationalEmail(ctx, { kind: "platform_invoice_issued", templateVersion: "v1", recipientReference: "invoice-1", recipientEmail: "owner@gym.jo", dedupeKey: "sandbox-1", subject: "Invoice issued" });
    });
    await t.action(internal.operationalEmail.processDue, {});
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as { to: string[]; subject: string };
    expect(body.to).toEqual(["inbox@rivetjo.com"]);
    expect(body.subject).toBe("[sandbox → owner@gym.jo] Invoice issued");
    const delivery = await t.run(async (ctx) => (await ctx.db.query("operationalEmailDeliveries").collect())[0]);
    expect(delivery?.attempts[0]).toMatchObject({ outcome: "accepted", mode: "sandbox", deliveredTo: "inbox@rivetjo.com" });
    delete process.env.RIVET_EMAIL_MODE;
    delete process.env.RIVET_EMAIL_SANDBOX_TO;
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
