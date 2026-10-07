import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const ENV_KEYS = ["RIVET_MESSAGING_MODE", "RIVET_MESSAGING_PROVIDER", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_MESSAGING_SERVICE_SID", "TWILIO_WHATSAPP_FROM", "RIVET_MESSAGING_SANDBOX_TO", "RIVET_MESSAGING_ALLOWLIST"] as const;

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function twilioReady(mode: string) {
  process.env.RIVET_MESSAGING_MODE = mode;
  process.env.RIVET_MESSAGING_PROVIDER = "twilio";
  process.env.TWILIO_ACCOUNT_SID = "AC123";
  process.env.TWILIO_AUTH_TOKEN = "secret";
  process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
}

async function seed(options: { gymLive: boolean; quietHoursStart?: string; quietHoursEnd?: string }) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", { publicId: "msg-org", name: "Forge Fitness", slug: "forge", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branchId = await ctx.db.insert("branches", { organizationId, publicId: "msg-branch", name: "Abdoun", code: "ABD", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: { notifications: { managerAlerts: {}, automationDeliveryMode: options.gymLive ? "live" : "sandbox", quietHoursStart: options.quietHoursStart ?? "22:00", quietHoursEnd: options.quietHoursEnd ?? "08:00" } } });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "member", publicId: "member-1", branchId, memberPublicId: "member-1", createdAt: now, updatedAt: now, data: { id: "member-1", fullName: "Lina Haddad", phone: "079 555 0101", preferredLanguage: "en", status: "active", marketingOptIn: true, marketingPreference: { status: "explicit_opt_in", source: "member_selected" } } });
    return { organizationId, branchId };
  });
  return { t, ...ids };
}

async function queueAutomationMessage(t: ReturnType<typeof convexTest>, organizationId: string, branchId: string, overrides: Record<string, unknown> = {}) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const id = `msg-${crypto.randomUUID()}`;
    await ctx.db.insert("domainRecords", { organizationId: organizationId as never, entityType: "messageDelivery", publicId: id, branchId: branchId as never, memberPublicId: "member-1", createdAt: now, updatedAt: now, data: { id, status: "queued", messageClass: "marketing", channel: "whatsapp", requestedChannel: "whatsapp", language: "en", templateKey: "renewal_7d", memberId: "member-1", queuedAt: new Date(now).toISOString(), nextAttemptAt: new Date(now).toISOString(), retryPolicy: { maxAttempts: 4, backoffMinutes: [1, 5, 30] }, attempts: [{ attempt: 1, status: "queued", occurredAt: new Date(now).toISOString() }], ...overrides } });
    return id;
  });
}

async function queueRenewalMessage(t: ReturnType<typeof convexTest>, organizationId: string, branchId: string) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("renewalDeliveries", {
      organizationId: organizationId as never, branchId: branchId as never,
      publicId: `renewal-${crypto.randomUUID()}`, membershipPublicId: "membership-1", membershipEndDate: "2026-09-15", memberPublicId: "member-1",
      checkpointDaysBefore: 7, checkpointKey: "7_day", channel: "whatsapp", templateVersion: "renewal-7-day-v1", policyVersion: "renewal-policy-v1",
      dedupeKey: crypto.randomUUID(), recipientReference: "member-1", recipientPhone: "0795550101", language: "en",
      consentStatus: "explicit_opt_in", channelOptedOut: false, status: "queued", attempts: [], nextAttemptAt: now - 1, createdAt: now, updatedAt: now,
    });
  });
}

describe("retired outbound messaging worker", () => {
  it.each(["off", "sandbox", "allowlist", "live"])("never sends or leases retained history even with legacy %s configuration", async (mode) => {
    twilioReady(mode);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { t, organizationId, branchId } = await seed({ gymLive: true });
    await queueAutomationMessage(t, organizationId, branchId);
    await queueRenewalMessage(t, organizationId, branchId);
    const before = await t.run(async (ctx) => ({
      records: await ctx.db.query("domainRecords").collect(),
      deliveries: await ctx.db.query("renewalDeliveries").collect(),
    }));
    expect(await t.action(internal.messagingWorker.processDue, {})).toEqual({ processed: 0, disabled: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await t.run(async (ctx) => ({
      records: await ctx.db.query("domainRecords").collect(),
      deliveries: await ctx.db.query("renewalDeliveries").collect(),
    }))).toEqual(before);
  });
});
