import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { enqueueOperationalEmail, operationalEmailContent, OPERATIONAL_EMAIL_COPY_VERSION } from "./operationalEmail";
import { utf16Hex } from "./pdfUnicode";
import { createTranslator } from "../src/lib/i18n/core";
import { makeFormatters } from "../src/lib/i18n/formatters";
import { presentNotification, presentTimelineEvent } from "../src/lib/i18n/system-messages";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const ENV = ["RIVET_OPERATIONAL_EMAIL_LIVE", "RESEND_API_KEY", "RESEND_FROM_EMAIL", "RIVET_EMAIL_MODE"] as const;
const saved = Object.fromEntries(ENV.map((key) => [key, process.env[key]]));
afterEach(() => {
  for (const key of ENV) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  vi.useRealTimers();
});

const strip = (value: string) => value.replace(/[⁦-⁩]/g, "");
const AR = { locale: "ar" as const, t: createTranslator("ar"), format: makeFormatters("ar", "", "Asia/Amman") };

function operation(name: string, input: Record<string, unknown> = {}) {
  return { operation: name, input, correlationId: `cor-comms-${name}` };
}

describe("outgoing email language and content", () => {
  it("renders a receipt with exact facts in Arabic and English, keeping names and references as written", () => {
    const facts = { type: "receipt" as const, receiptNumber: "RCP-2026-000184", amountMinor: 25_000, currency: "JOD", method: "cash", paidAt: Date.UTC(2026, 9, 3, 9, 30), outstandingMinor: 12_500 };
    const arabic = operationalEmailContent("payment_receipt", "ar", { gymName: "Forge نادي القوة", siteUrl: "https://www.rivetjo.com", timeZone: "Asia/Amman" }, undefined, facts);
    expect(arabic.subject).toBe("إيصال دفعتك");
    expect(arabic.html).toContain('dir="rtl"');
    expect(arabic.text).toContain("رقم وصل الدفع: RCP-2026-000184");
    expect(arabic.text).toContain("المبلغ المدفوع: 25.000 د.أ");
    expect(arabic.text).toContain("طريقة الدفع: كاش");
    expect(arabic.text).toContain("تاريخ الدفع: 3 تشرين الأول 2026، 12:30 م");
    expect(arabic.text).toContain("المبلغ المتبقي: 12.500 د.أ");
    expect(arabic.text).toContain("أُرسلت هذه الرسالة من RIVET نيابةً عن Forge نادي القوة، وهو النادي المسؤول عن اشتراكك.");
    expect(arabic.text).toContain("شروط الاستخدام");
    expect(arabic.text).toContain("عرض وصل الدفع: https://www.rivetjo.com/customer/receipts");
    expect(arabic.html).toContain('dir="ltr" align="left"');
    const english = operationalEmailContent("payment_receipt", "en", { gymName: "Forge نادي القوة", siteUrl: "https://www.rivetjo.com", timeZone: "Asia/Amman" }, undefined, facts);
    expect(english.subject).toBe("Your RIVET payment receipt");
    expect(english.text).toMatch(/Amount paid: JOD\s25\.000/);
    expect(english.text).toMatch(/Paid on: 3 Oct 2026, 12:30/);
    expect(english.text).toContain("Method: Cash");
    expect(english.text).toContain("Sent by RIVET for Forge نادي القوة, which is responsible for your membership.");
  });

  it("shows a negative invoice amount exactly, with Jordanian month names, and a localized status chip", () => {
    const content = operationalEmailContent("platform_invoice_past_due", "ar", { siteUrl: "https://www.rivetjo.com", timeZone: "Asia/Amman" }, undefined, { type: "invoice", invoiceNumber: "INV-0042", amountMinor: -7_125, currency: "JOD", periodStart: "2026-09-01", periodEnd: "2026-09-30", dueAt: "2026-10-07T21:30:00.000Z" });
    expect(content.subject).toBe("تجاوزت فاتورة RIVET موعد الدفع");
    expect(content.text).toContain("تجاوز موعد الدفع");
    expect(content.text).toContain("المبلغ: -7.125 د.أ");
    expect(content.text).toContain("فترة الفوترة: من 1 أيلول 2026 إلى 30 أيلول 2026");
    // The instant falls on 8 October in Amman, not on its UTC date.
    expect(content.text).toContain("تاريخ الاستحقاق: 8 تشرين الأول 2026");
    expect(content.text).not.toMatch(/Past due|Attached/);
  });

  it("records language source and copy version, and never lets the gym default override a member's own choice", async () => {
    const t = convexTest(schema, modules);
    const rows = await t.run(async (ctx) => {
      const now = Date.now();
      const organizationId = await ctx.db.insert("organizations", { publicId: "lang-org", name: "Lang Gym", slug: "lang", status: "active", timezone: "Asia/Amman", currency: "JOD", defaultLanguage: "ar", createdAt: now, updatedAt: now });
      const explicit = await enqueueOperationalEmail(ctx, { organizationId, kind: "pt_booking_reminder", templateVersion: "v1", language: "en", languageSource: "recipient", recipientReference: "m-1", recipientEmail: "a@example.test", dedupeKey: "lang-1" });
      const gymDefault = await enqueueOperationalEmail(ctx, { organizationId, kind: "support_reply", templateVersion: "v1", recipientReference: "owner", recipientEmail: "b@example.test", dedupeKey: "lang-2" });
      return { explicit, gymDefault };
    });
    expect(rows.explicit).toMatchObject({ language: "en", languageSource: "recipient", copyVersion: OPERATIONAL_EMAIL_COPY_VERSION, subject: "Your PT session is tomorrow" });
    expect(rows.gymDefault).toMatchObject({ language: "ar", languageSource: "organization", subject: "ردّت RIVET على طلب الدعم" });
  });

  it("uses the member's language or the gym default for lifecycle reminders, not anyone's screen language", async () => {
    const t = convexTest(schema, modules);
    const now = Date.UTC(2026, 7, 12, 12);
    await t.run(async (ctx) => {
      const organizationId = await ctx.db.insert("organizations", { publicId: "life-org", name: "Life Gym", slug: "life", status: "active", timezone: "UTC", currency: "JOD", defaultLanguage: "ar", createdAt: now, updatedAt: now });
      const branchId = await ctx.db.insert("branches", { organizationId, publicId: "life-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
      // The owner reads RIVET in English; that must not reach members.
      const ownerId = await ctx.db.insert("users", { publicId: "life-owner", authSubject: "life-owner", email: "owner@example.test", fullName: "Owner", platformAdmin: false, status: "active", uiLocale: "en", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerId, role: "owner", branchIds: [branchId], branchScope: "all", active: true, createdAt: now, updatedAt: now });
      await ctx.db.insert("operationalEmailSettings", { organizationId, enabledKinds: ["renewal_reminder"], updatedByUserId: ownerId, reason: "Reviewed", ownerConfirmedAt: now, ownerConfirmedByUserId: ownerId, createdAt: now, updatedAt: now });
      for (const [id, preferredLanguage] of [["unset", undefined], ["english", "en"]] as const) {
        await ctx.db.insert("domainRecords", { organizationId, entityType: "member", publicId: `member-${id}`, branchId, memberPublicId: `member-${id}`, createdAt: now, updatedAt: now, data: { id: `member-${id}`, email: `${id}@example.test`, ...(preferredLanguage ? { preferredLanguage } : {}) } });
        await ctx.db.insert("domainRecords", { organizationId, entityType: "membership", publicId: `ms-${id}`, branchId, memberPublicId: `member-${id}`, createdAt: now, updatedAt: now, data: { id: `ms-${id}`, memberId: `member-${id}`, startDate: "2026-07-01", endDate: "2026-08-19" } });
      }
    });
    await t.mutation(internal.membershipJobs.queueLifecycleReminders, { now });
    const rows = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").collect());
    const byMember = Object.fromEntries(rows.map((row) => [row.recipientReference, row]));
    expect(byMember["member-unset"]).toMatchObject({ language: "ar", languageSource: "organization", subject: "اقترب موعد تجديد اشتراكك في النادي" });
    expect(byMember["member-english"]).toMatchObject({ language: "en", languageSource: "recipient", subject: "Your gym membership is approaching renewal" });
  });
});

async function seedInvoiceGym(t: TestConvex<typeof schema>, options: { gymLanguage: "en" | "ar"; adminLocale: "en" | "ar"; suffix: string }) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: `org-${options.suffix}`, name: `Gym ${options.suffix}`, slug: `gym-${options.suffix}`, status: "active", timezone: "Asia/Amman", currency: "JOD", defaultLanguage: options.gymLanguage, createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: `branch-${options.suffix}`, name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("users", { publicId: `admin-${options.suffix}`, authSubject: `clerk-admin-${options.suffix}`, email: `admin-${options.suffix}@example.test`, fullName: "Platform Admin", platformAdmin: true, status: "active", uiLocale: options.adminLocale, createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: `owner-${options.suffix}`, authSubject: `clerk-owner-${options.suffix}`, email: `owner-${options.suffix}@example.test`, fullName: "عبد الرحمن Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "marketplaceGym", publicId: `listing-${options.suffix}`, createdAt: now, updatedAt: now, data: { id: `listing-${options.suffix}`, name: `Gym ${options.suffix}`, targetOrganizationId: `org-${options.suffix}`, subscriptionStatus: "active", rivetPlan: "Growth", isPublic: true } });
  });
}

describe("platform invoice notices", () => {
  it("follows the gym's language for the notice, its PDF and its notification, whatever the operator's screen language", async () => {
    const t = convexTest(schema, modules);
    await seedInvoiceGym(t, { gymLanguage: "ar", adminLocale: "en", suffix: "ar" });
    await seedInvoiceGym(t, { gymLanguage: "en", adminLocale: "ar", suffix: "en" });
    for (const suffix of ["ar", "en"]) {
      const platform = t.withIdentity({ subject: `clerk-admin-${suffix}` });
      const draft = await platform.mutation(api.domain.mutate, operation("platform.invoice.create", { gymId: `listing-${suffix}`, amountMinor: 149_000, currency: "JOD", periodStart: "2026-08-01", periodEnd: "2026-08-31", dueAt: "2026-09-07" })) as { id: string };
      await platform.mutation(api.domain.mutate, operation("platform.invoice.issue", { invoiceId: draft.id }));
      await platform.mutation(api.domain.mutate, operation("platform.invoice.past_due", { invoiceId: draft.id, reason: "Bank transfer was not received by the due date." }));
    }
    const state = await t.run(async (ctx) => ({
      deliveries: await ctx.db.query("operationalEmailDeliveries").collect(),
      notifications: await ctx.db.query("operationalNotifications").collect(),
      organizations: await ctx.db.query("organizations").collect(),
    }));
    const orgOf = (id: Id<"organizations"> | undefined) => state.organizations.find((row) => row._id === id)?.publicId;
    const arabic = state.deliveries.filter((row) => orgOf(row.organizationId) === "org-ar");
    const english = state.deliveries.filter((row) => orgOf(row.organizationId) === "org-en");
    expect(arabic.map((row) => [row.kind, row.language, row.languageSource])).toEqual([["platform_invoice_issued", "ar", "organization"], ["platform_invoice_past_due", "ar", "organization"]]);
    expect(english.map((row) => [row.kind, row.language])).toEqual([["platform_invoice_issued", "en"], ["platform_invoice_past_due", "en"]]);
    const pastDue = arabic[1]!;
    expect(pastDue.subject).toBe("تجاوزت فاتورة RIVET موعد الدفع");
    expect(pastDue.text).toContain("المبلغ: 149.000 د.أ");
    expect(pastDue.text).toContain("تاريخ الاستحقاق: 7 أيلول 2026");
    expect(pastDue.text).toContain("المرفق: RIVET-invoice-");
    const pdf = atob(pastDue.attachments![0]!.contentBase64);
    expect(pdf).toContain(utf16Hex("فاتورة", true));
    expect(atob(english[1]!.attachments![0]!.contentBase64)).not.toContain(utf16Hex("فاتورة", true));
    expect(english[1]!.subject).toBe("Your RIVET invoice is past due");
    // The supervisor notification is stored in English with a descriptor, and only reaches its own gym.
    const notifications = state.notifications.filter((row) => row.kind === "platform_invoice_past_due");
    expect(notifications.map((row) => orgOf(row.organizationId)).sort()).toEqual(["org-ar", "org-en"]);
    const stored = notifications.find((row) => orgOf(row.organizationId) === "org-ar")!;
    expect(stored.title).toBe("RIVET invoice marked past due");
    expect(stored.body).toMatch(/^INV-.+ · JOD 149\.000$/);
    const shown = presentNotification(stored, AR);
    expect(shown.title).toBe("تجاوزت فاتورة RIVET موعد الدفع");
    expect(strip(shown.body)).toMatch(/^INV-.+ · 149\.000 د\.أ$/);
  });
});

async function seedMessaging(options: { memberLanguage?: "en" | "ar"; gymLanguage?: "en" | "ar" } = {}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", { publicId: "wa-org", name: "Forge Fitness", slug: "forge", status: "active", timezone: "Asia/Amman", currency: "JOD", ...(options.gymLanguage ? { defaultLanguage: options.gymLanguage } : {}), createdAt: now, updatedAt: now });
    const branchId = await ctx.db.insert("branches", { organizationId, publicId: "wa-branch", name: "Abdoun", code: "ABD", active: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: { notifications: { automationDeliveryMode: "live", quietHoursStart: "22:00", quietHoursEnd: "08:00" } } });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "member", publicId: "member-1", branchId, memberPublicId: "member-1", createdAt: now, updatedAt: now, data: { id: "member-1", fullName: "Lina حداد", phone: "079 555 0101", ...(options.memberLanguage ? { preferredLanguage: options.memberLanguage } : {}), status: "active", marketingOptIn: true, marketingPreference: { status: "explicit_opt_in", source: "member_selected" } } });
    return { organizationId, branchId };
  });
  return { t, ...ids };
}

async function setMemberLanguage(t: TestConvex<typeof schema>, language: "en" | "ar") {
  await t.run(async (ctx) => {
    const member = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "member")).first();
    await ctx.db.patch(member!._id, { data: { ...(member!.data as Record<string, unknown>), preferredLanguage: language, fullName: "Renamed Member" } });
  });
}

describe("WhatsApp retries", () => {
  it("keeps an automation message's queued language and exact body across retries after the member changes preference", async () => {
    vi.useFakeTimers();
    const { t, organizationId, branchId } = await seedMessaging({ memberLanguage: "en" });
    const id = await t.run(async (ctx) => {
      const now = Date.now();
      const publicId = "msg-retry";
      await ctx.db.insert("domainRecords", { organizationId, entityType: "messageDelivery", publicId, branchId, memberPublicId: "member-1", createdAt: now, updatedAt: now, data: { id: publicId, status: "queued", messageClass: "service", channel: "whatsapp", requestedChannel: "whatsapp", language: "en", languageSource: "recipient", catalogueVersion: "1.1", templateKey: "renewal_today", memberId: "member-1", nextAttemptAt: new Date(now).toISOString(), attempts: [] } });
      return publicId;
    });
    const first = (await t.mutation(internal.messagingWorker.leaseDue, { limit: 5 }))[0]!;
    expect(first.language).toBe("en");
    expect(first.body).toContain("Lina حداد, your Forge Fitness membership ends today.");
    await t.mutation(internal.messagingWorker.recordAttempt, { source: "automation", id: first.id, leaseToken: first.leaseToken, accepted: false, retryable: true, mode: "live", errorCode: "provider_http_500" });
    await setMemberLanguage(t, "ar");
    vi.setSystemTime(Date.now() + 2 * 60_000);
    const second = (await t.mutation(internal.messagingWorker.leaseDue, { limit: 5 }))[0]!;
    expect(second.publicId).toBe(id);
    expect(second.language).toBe("en");
    expect(second.body).toBe(first.body);
  });

  it("captures a renewal reminder on first lease and resends those bytes after a preference change", async () => {
    vi.useFakeTimers();
    const { t, organizationId, branchId } = await seedMessaging({ memberLanguage: "ar" });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("renewalDeliveries", { organizationId, branchId, publicId: "renewal-1", membershipPublicId: "ms-1", membershipEndDate: "2026-09-15", memberPublicId: "member-1", checkpointDaysBefore: 7, checkpointKey: "7_day", channel: "whatsapp", templateVersion: "renewal-7-day-v1", policyVersion: "renewal-policy-v1", dedupeKey: "renewal-1", recipientReference: "member-1", recipientPhone: "0795550101", language: "ar", languageSource: "recipient", catalogueVersion: "1.1", consentStatus: "explicit_opt_in", channelOptedOut: false, status: "queued", attempts: [], nextAttemptAt: now - 1, createdAt: now, updatedAt: now });
    });
    const first = (await t.mutation(internal.messagingWorker.leaseDue, { limit: 5 }))[0]!;
    expect(first.body).toBe("مرحبًا Lina حداد، ينتهي اشتراكك في Forge Fitness بتاريخ 15 أيلول 2026. يمكن تجديد الاشتراك من الاستقبال في فرع Forge Fitness أو بالرد على هذه الرسالة لنساعدك. — Forge Fitness");
    await t.mutation(internal.messagingWorker.recordAttempt, { source: "renewal", id: first.id, leaseToken: first.leaseToken, accepted: false, retryable: true, mode: "live", errorCode: "provider_http_503" });
    await setMemberLanguage(t, "en");
    vi.setSystemTime(Date.now() + 2 * 60_000);
    const second = (await t.mutation(internal.messagingWorker.leaseDue, { limit: 5 }))[0]!;
    expect(second).toMatchObject({ publicId: "renewal-1", language: "ar", body: first.body });
    const row = await t.run((ctx) => ctx.db.query("renewalDeliveries").first());
    expect(row).toMatchObject({ renderedBody: first.body, renderedTemplateKey: "renewal_7d" });
  });

  it("renders a legacy row with the wording it was queued under and keeps an explicit English choice", async () => {
    const { t, organizationId, branchId } = await seedMessaging({ memberLanguage: "ar" });
    await t.run(async (ctx) => {
      const now = Date.now();
      // Queued before versions were recorded: Arabic 1.0 wording, no snapshot.
      await ctx.db.insert("domainRecords", { organizationId, entityType: "messageDelivery", publicId: "legacy-ar", branchId, memberPublicId: "member-1", createdAt: now, updatedAt: now, data: { id: "legacy-ar", status: "queued", channel: "whatsapp", requestedChannel: "whatsapp", language: "ar", templateKey: "renewal_today", memberId: "member-1", nextAttemptAt: new Date(now).toISOString(), attempts: [] } });
      // Queued in English for a member who has since switched to Arabic.
      await ctx.db.insert("domainRecords", { organizationId, entityType: "messageDelivery", publicId: "legacy-en", branchId, memberPublicId: "member-1", createdAt: now + 1, updatedAt: now, data: { id: "legacy-en", status: "queued", channel: "whatsapp", requestedChannel: "whatsapp", language: "en", templateKey: "renewal_today", memberId: "member-1", nextAttemptAt: new Date(now).toISOString(), attempts: [] } });
    });
    const leased = await t.mutation(internal.messagingWorker.leaseDue, { limit: 5 });
    const byId = Object.fromEntries(leased.map((item) => [item.publicId, item]));
    // The 1.0 wording, including its visible gap for a branch the record never had.
    expect(byId["legacy-ar"]!.body).toBe("Lina حداد، عضويتك في Forge Fitness تنتهي اليوم. جدّد من كاونتر فرع {{branch_name}} اليوم لتواصل تمرينك غداً. — Forge Fitness");
    expect(byId["legacy-en"]!).toMatchObject({ language: "en" });
    expect(byId["legacy-en"]!.body).toContain("your Forge Fitness membership ends today");
  });

  it("falls back to the gym default for a member without a stored language, and records it on the timeline outcome", async () => {
    const { t, organizationId, branchId } = await seedMessaging({ gymLanguage: "ar" });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("domainRecords", { organizationId, entityType: "messageDelivery", publicId: "fallback", branchId, memberPublicId: "member-1", createdAt: now, updatedAt: now, data: { id: "fallback", status: "queued", channel: "whatsapp", requestedChannel: "whatsapp", templateKey: "renewal_today", catalogueVersion: "1.1", memberId: "member-1", nextAttemptAt: new Date(now).toISOString(), attempts: [] } });
    });
    const leased = (await t.mutation(internal.messagingWorker.leaseDue, { limit: 5 }))[0]!;
    expect(leased.language).toBe("ar");
    expect(leased.body).toContain("ينتهي اشتراكك في Forge Fitness اليوم");
    await t.mutation(internal.messagingWorker.recordAttempt, { source: "automation", id: leased.id, leaseToken: leased.leaseToken, accepted: false, retryable: false, mode: "live", errorCode: "provider_http_400" });
    const timeline = await t.run((ctx) => ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "timeline")).collect());
    const event = timeline[0]!.data as { type: string; title: string; body: string; titleMessage: unknown; bodyMessage: unknown };
    expect(event.title).toBe("WhatsApp message failed");
    expect(presentTimelineEvent(event, AR)).toEqual({ title: "الرسالة عبر واتساب: فشل الإرسال", body: expect.stringContaining("فشل الإرسال بعد محاولة واحدة") });
    const notification = await t.run((ctx) => ctx.db.query("operationalNotifications").collect());
    expect(notification).toHaveLength(0); // no supervisors seeded in this tenant
  });
});
