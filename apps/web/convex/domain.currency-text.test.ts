import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

/**
 * Audit summaries, timeline titles and notification bodies must spell an
 * amount at the record's own currency precision: "USD 40.00" for 4,000 minor
 * units, "JOD 40.000" for 40,000. Each case runs the same workflow for a JOD
 * gym and a USD gym and compares the written text with the stored amount.
 */

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-currency-${name}` });

type Case = { currency: string; unit: number; text: (major: string) => string };
const CASES: Case[] = [
  { currency: "JOD", unit: 1_000, text: (major) => `JOD ${major}` },
  { currency: "USD", unit: 100, text: (major) => `USD ${major}` },
];

async function seed(t: TestConvex<typeof schema>, currency: string) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organizationId = await ctx.db.insert("organizations", { publicId: "text-org", name: "Text Gym", slug: "text-gym", status: "active", timezone: "Asia/Amman", currency, receiptPrefix: "TXT", nextReceiptNumber: 1, createdAt: now, updatedAt: now });
    const branchId = await ctx.db.insert("branches", { organizationId, publicId: "text-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const managerId = await ctx.db.insert("users", { publicId: "text-manager", authSubject: "clerk-text-manager", email: "manager@text.example", fullName: "Text Manager", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: managerId, role: "manager", branchIds: [branchId], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "member", publicId: "text-member", branchId, memberPublicId: "text-member", createdAt: now, updatedAt: now, data: { id: "text-member", fullName: "Text Member", email: "member@text.example", phone: "+962790000009", memberNumber: "MAIN-1", homeBranchId: "text-branch", status: "active", createdAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "charge", publicId: "text-charge", branchId, memberPublicId: "text-member", createdAt: now, updatedAt: now, data: { id: "text-charge", memberId: "text-member", branchId: "text-branch", description: "Membership", total: { amount: 40 * (currency === "JOD" ? 1_000 : 100), currency }, paidAmount: { amount: 0, currency }, outstandingAmount: { amount: 40 * (currency === "JOD" ? 1_000 : 100), currency }, discount: { amount: 0, currency }, status: "unpaid", createdAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "charge", publicId: "text-charge-2", branchId, memberPublicId: "text-member", createdAt: now, updatedAt: now, data: { id: "text-charge-2", memberId: "text-member", branchId: "text-branch", description: "Locker", total: { amount: 7 * (currency === "JOD" ? 1_000 : 100), currency }, paidAmount: { amount: 0, currency }, outstandingAmount: { amount: 7 * (currency === "JOD" ? 1_000 : 100), currency }, discount: { amount: 0, currency }, status: "unpaid", createdAt: new Date(now).toISOString() } });
  });
}

async function writtenText(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => ({
    audit: (await ctx.db.query("auditEvents").collect()).map((event) => event.summary),
    timeline: (await ctx.db.query("domainRecords").collect()).filter((record) => record.entityType === "timeline").map((record) => `${String((record.data as { title?: string }).title ?? "")} | ${String((record.data as { body?: string }).body ?? "")}`),
    notifications: (await ctx.db.query("operationalNotifications").collect()).map((row) => row.body),
  }));
}

describe("member payment text follows the stored currency", () => {
  it.each(CASES)("$currency: collected, refunded and voided amounts read at the currency's precision", async ({ currency, unit, text }) => {
    const t = convexTest(schema, modules);
    await seed(t, currency);
    const manager = t.withIdentity({ subject: "clerk-text-manager" });
    const major = (minor: number) => (minor / unit).toFixed(unit === 1_000 ? 3 : 2);

    await manager.mutation(api.domain.mutate, operation("shifts.open", { branchId: "text-branch", openingFloat: { amount: 5 * unit, currency } })) as { id: string };
    const paid = await manager.mutation(api.domain.mutate, operation("payments.create", { memberId: "text-member", chargeId: "text-charge", amount: { amount: 40 * unit, currency }, method: "card", externalReference: "POS-1", idempotencyKey: "text-pay-1" })) as { payment: { id: string } };
    const locker = await manager.mutation(api.domain.mutate, operation("payments.create", { memberId: "text-member", chargeId: "text-charge-2", amount: { amount: 7 * unit, currency }, method: "cash", idempotencyKey: "text-pay-2" })) as { payment: { id: string } };
    await manager.mutation(api.domain.mutate, operation("payments.refund", { paymentId: paid.payment.id, amount: { amount: 15 * unit + 5, currency }, reason: "Approved partial service refund", idempotencyKey: "text-refund-1" }));
    await manager.mutation(api.domain.mutate, operation("payments.void", { paymentId: locker.payment.id, reason: "Keyed against the wrong member", idempotencyKey: "text-void-1" }));

    const written = await writtenText(t);
    expect(written.audit).toContain(`Collected ${text(major(40 * unit))} (card)`);
    expect(written.audit).toContain(`Refunded ${text(major(15 * unit + 5))}`);
    expect(written.audit).toContain(`Voided ${text(major(7 * unit))}`);
    expect(written.timeline.some((line) => line.startsWith(`Payment collected — ${text(major(40 * unit))} card`))).toBe(true);
    expect(written.timeline.some((line) => line.startsWith(`Payment refunded — ${text(major(15 * unit + 5))}`))).toBe(true);
    expect(written.notifications).toContain(`${text(major(15 * unit + 5))} · Text Manager`);
    expect(written.notifications).toContain(`${text(major(7 * unit))} · Text Manager`);
    for (const line of [...written.audit, ...written.timeline, ...written.notifications]) {
      expect(line, line).not.toMatch(unit === 100 ? /USD \d+\.\d{3}\b/ : /JOD \d+\.\d{2}\b(?!\d)/);
    }
  });
});
