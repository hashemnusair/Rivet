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
});

function twilioReady(mode: string) {
  process.env.RIVET_MESSAGING_MODE = mode;
  process.env.RIVET_MESSAGING_PROVIDER = "twilio";
  process.env.TWILIO_ACCOUNT_SID = "AC123";
  process.env.TWILIO_AUTH_TOKEN = "secret";
  process.env.TWILIO_MESSAGING_SERVICE_SID = "MG123";
  process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
}

async function seed(options: { gymLive: boolean; quietHoursStart?: string; quietHoursEnd?: string }) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", { publicId: "msg-org", name: "Forge Fitness", slug: "forge", status: "active", timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branchId = await ctx.db.insert("branches", { organizationId, publicId: "msg-branch", name: "Abdoun", code: "ABD", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: { notifications: { managerAlerts: {}, automationDeliveryMode: options.gymLive ? "live" : "sandbox", quietHoursStart: options.quietHoursStart ?? "22:00", quietHoursEnd: options.quietHoursEnd ?? "08:00" } } });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "member", publicId: "member-1", branchId, memberPublicId: "member-1", createdAt: now, updatedAt: now, data: { id: "member-1", fullName: "Lina Haddad", phone: "079 555 0101", preferredLanguage: "en", status: "active", marketingOptIn: true } });
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

describe("outbound messaging worker", () => {
  it("stays disabled while the global mode is off, even for a gym with external delivery on", async () => {
    const { t, organizationId, branchId } = await seed({ gymLive: true });
    await queueAutomationMessage(t, organizationId, branchId);
    expect(await t.action(internal.messagingWorker.processDue, {})).toEqual({ processed: 0, disabled: true });
  });

  it("sends a live gym's queued WhatsApp message through Twilio and records the provider id, mode and number", async () => {
    twilioReady("live");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: "SM123" }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, organizationId, branchId } = await seed({ gymLive: true });
    const id = await queueAutomationMessage(t, organizationId, branchId);
    expect(await t.action(internal.messagingWorker.processDue, {})).toEqual({ processed: 1, disabled: false });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("To")).toBe("whatsapp:+962795550101");
    expect(body.get("Body")).toMatch(/^Hi Lina Haddad, your Forge Fitness membership ends on/);
    expect(body.get("Body")).toMatch(/Reply STOP to stop these messages/);
    const record = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "messageDelivery")).collect()).find((row) => row.publicId === id));
    expect(record?.data).toMatchObject({ status: "sent", providerMessageId: "SM123", deliveryMode: "live", deliveredTo: "+962795550101" });
    expect((record?.data as { attempts: Array<{ status: string }> }).attempts.at(-1)).toMatchObject({ status: "sent", mode: "live", providerMessageId: "SM123" });
  });

  it("never sends for a gym that kept external delivery off, and redirects a live gym to the sandbox number in sandbox mode", async () => {
    twilioReady("sandbox");
    process.env.RIVET_MESSAGING_SANDBOX_TO = "0778378608";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: "SM-sandbox" }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const sandboxGym = await seed({ gymLive: false });
    await queueAutomationMessage(sandboxGym.t, sandboxGym.organizationId, sandboxGym.branchId);
    expect(await sandboxGym.t.action(internal.messagingWorker.processDue, {})).toEqual({ processed: 0, disabled: false });
    expect(fetchMock).not.toHaveBeenCalled();

    const liveGym = await seed({ gymLive: true });
    await queueAutomationMessage(liveGym.t, liveGym.organizationId, liveGym.branchId, { requestedChannel: "sms", channel: "sms" });
    await liveGym.t.action(internal.messagingWorker.processDue, {});
    const body = new URLSearchParams(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.get("To")).toBe("+962778378608");
    expect(body.get("MessagingServiceSid")).toBe("MG123");
    expect(body.get("Body")).toMatch(/^\[sandbox → \+962795550101\]/);
  });

  it("suppresses recipients outside the allowlist with a reason and retries provider outages with backoff", async () => {
    twilioReady("allowlist");
    process.env.RIVET_MESSAGING_ALLOWLIST = "+96277*";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const { t, organizationId, branchId } = await seed({ gymLive: true });
    const blocked = await queueAutomationMessage(t, organizationId, branchId);
    const allowed = await queueAutomationMessage(t, organizationId, branchId, { recipientPhone: "077 837 8608" });
    await t.action(internal.messagingWorker.processDue, {});
    const rows = await t.run(async (ctx) => await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "messageDelivery")).collect());
    expect(rows.find((row) => row.publicId === blocked)?.data).toMatchObject({ status: "suppressed", suppressionReason: expect.stringMatching(/allowlist/) });
    const retried = rows.find((row) => row.publicId === allowed)?.data as { status: string; nextAttemptAt: string; attempts: Array<{ status: string }> };
    expect(retried.status).toBe("retrying");
    expect(Date.parse(retried.nextAttemptAt)).toBeGreaterThan(Date.now() + 50_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("queues renewal reminders for live gyms and sends them, while sandbox gyms keep the sandboxed ledger", async () => {
    twilioReady("live");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sid: "SM-renewal" }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const seedRenewal = async (gymLive: boolean) => {
      const { t, organizationId, branchId } = await seed({ gymLive, quietHoursStart: "03:00", quietHoursEnd: "03:01" });
      await t.run(async (ctx) => {
        const now = Date.now();
        const settings = (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", "settings")).collect())[0]!;
        await ctx.db.patch(settings._id, { data: { notifications: { ...(settings.data as { notifications: Record<string, unknown> }).notifications, renewalRecoveryEnabled: true } } });
        const endDate = new Date(now + 7 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });
        const startDate = new Date(now - 30 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Amman" });
        await ctx.db.insert("domainRecords", { organizationId, entityType: "membership", publicId: "membership-1", branchId, memberPublicId: "member-1", createdAt: now, updatedAt: now, data: { id: "membership-1", memberId: "member-1", status: "active", startDate, endDate, renewalConsent: "explicit_opt_in" } });
        const member = (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", "member")).collect())[0]!;
        await ctx.db.patch(member._id, { data: { ...(member.data as Record<string, unknown>), renewalChannel: "whatsapp", marketingPreferenceStatus: "explicit_opt_in", whatsappOptIn: true } });
      });
      await t.mutation(internal.renewalJobs.queueRenewalJourney, {});
      return t;
    };
    const liveT = await seedRenewal(true);
    const liveRows = await liveT.run(async (ctx) => await ctx.db.query("renewalDeliveries").collect());
    expect(liveRows.filter((row) => row.channel !== "staff_task").map((row) => row.status)).toEqual(expect.arrayContaining(["queued"]));
    await liveT.action(internal.messagingWorker.processDue, {});
    const afterSend = await liveT.run(async (ctx) => await ctx.db.query("renewalDeliveries").collect());
    const sent = afterSend.find((row) => row.status === "sent");
    expect(sent).toBeDefined();
    expect(sent?.attempts.at(-1)).toMatchObject({ outcome: "accepted", providerMessageId: "SM-renewal" });
    expect(fetchMock).toHaveBeenCalled();

    const sandboxT = await seedRenewal(false);
    const sandboxRows = await sandboxT.run(async (ctx) => await ctx.db.query("renewalDeliveries").collect());
    expect(sandboxRows.filter((row) => row.channel !== "staff_task").map((row) => row.status)).toEqual(expect.arrayContaining(["sandboxed"]));
  });
});
