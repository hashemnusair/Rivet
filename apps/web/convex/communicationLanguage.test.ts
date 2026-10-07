import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { enqueueOperationalEmail, operationalEmailContent, OPERATIONAL_EMAIL_COPY_VERSION } from "./operationalEmail";
import { utf16Hex } from "./pdfUnicode";
import { createTranslator } from "../src/lib/i18n/core";
import { makeFormatters } from "../src/lib/i18n/formatters";
import { presentNotification } from "../src/lib/i18n/system-messages";

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
