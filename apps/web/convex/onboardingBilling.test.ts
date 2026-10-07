import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
import { pendingOnboardingFee } from "./onboardingBilling";
import { fundedSubscriptionValue, termChange, DAY_MS } from "./subscriptionTerm";
import { invoicePdfInput } from "./platformInvoiceDocument";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());

describe("launch onboarding and funded credits", () => {
  it.each(["monthly", "annual"] as const)("bills setup once, outside the %s discount, and never again at renewal", async interval => {
    vi.stubEnv("RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED", "1");
    const t = convexTest(schema, modules);
    const boundary = Date.parse("2026-11-01T12:00:00Z");
    const orgId = await t.run(ctx => ctx.db.insert("organizations", { name: "New gym", slug: "new", status: "trial", subscriptionPlan: "Starter", billingInterval: interval, onboardingFeeMinor: 75_000, trialEndsAt: boundary, timezone: "Asia/Amman", currency: "JOD", createdAt: boundary - 30 * DAY_MS, updatedAt: boundary }));
    await t.mutation(internal.subscriptionReconciliation.reconcile, { now: boundary - 3 * DAY_MS });
    await t.mutation(internal.subscriptionReconciliation.reconcile, { now: boundary - 3 * DAY_MS });
    const invoice = await t.run(async ctx => (await ctx.db.query("domainRecords").withIndex("by_organization_type", q => q.eq("organizationId", orgId).eq("entityType", "platformInvoice")).unique())!);
    expect(invoice.data).toMatchObject({ onboardingFeeMinor: 75_000, amountMinor: (interval === "annual" ? 444_600 : 39_000) + 75_000 });
    await t.run(async ctx => {
      await ctx.db.patch(invoice._id, { data: { ...invoice.data, status: "paid" } });
      await ctx.db.patch(orgId, { status: "active", currentPeriodEndsAt: Date.parse(invoice.data.periodEnd) });
    });
    await t.mutation(internal.subscriptionReconciliation.reconcile, { now: Date.parse(invoice.data.periodEnd) - 3 * DAY_MS });
    const next = await t.run(async ctx => (await ctx.db.query("domainRecords").withIndex("by_organization_type", q => q.eq("organizationId", orgId).eq("entityType", "platformInvoice")).collect()).filter(row => row._id !== invoice._id));
    expect(next).toHaveLength(1);
    expect(next[0]!.data.amountMinor).toBe(interval === "annual" ? 444_600 : 39_000);
    expect(next[0]!.data.onboardingFeeMinor).toBeUndefined();
  });

  it("carries setup after voiding, reserves an unpaid charge, and leaves legacy gyms uncharged", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      const id = await ctx.db.insert("organizations", { name: "Gym", slug: "gym", status: "active", onboardingFeeMinor: 75_000, timezone: "Asia/Amman", currency: "JOD", createdAt: 1, updatedAt: 1 });
      const org = (await ctx.db.get(id))!;
      const invoice = await ctx.db.insert("domainRecords", { organizationId: id, entityType: "platformInvoice", publicId: "fee", createdAt: 1, updatedAt: 1, data: { status: "open", onboardingFeeMinor: 75_000 } });
      expect(await pendingOnboardingFee(ctx, org)).toBe(0);
      await ctx.db.patch(invoice, { data: { status: "void", onboardingFeeMinor: 75_000 } });
      expect(await pendingOnboardingFee(ctx, org)).toBe(75_000);
      expect(await pendingOnboardingFee(ctx, { ...org, onboardingFeeMinor: undefined })).toBe(0);
    });
  });

  it("never credits unpaid revenue or setup, preserves carried credit and uses historical paid value", () => {
    expect(fundedSubscriptionValue({ status: "open", amountMinor: 1_000_000 })).toBe(0);
    expect(fundedSubscriptionValue({ status: "open", amountMinor: 1_000_000, creditMinor: 40_000 })).toBe(40_000);
    expect(fundedSubscriptionValue({ status: "paid", amountMinor: 114_000, onboardingFeeMinor: 75_000 })).toBe(39_000);
    expect(fundedSubscriptionValue({ status: "void", amountMinor: 114_000 })).toBeUndefined();
    const now = Date.parse("2026-10-07T12:00:00Z");
    const a = termChange({ now, interval: "annual", monthlyPriceMinor: 199_000, outgoing: { periodEndsAt: now + 100 * DAY_MS, interval: "annual", monthlyPriceMinor: 999_000, amountMinor: 854_400 } });
    expect(a.creditMinor).toBe(Math.round(854_400 * 100 / 365));
  });

  it.each(["en", "ar"] as const)("prints the setup as a separate %s line with exact totals", locale => {
    const pdf = invoicePdfInput("INV-SETUP", { amountMinor: 519_600, subtotalMinor: 519_600, onboardingFeeMinor: 75_000, billingInterval: "annual", currency: "JOD" }, { name: "Gym", plan: "Starter" }, { locale });
    expect(pdf.lines).toHaveLength(2);
    expect(pdf.lines[0]!.amount).toContain("444.600");
    expect(pdf.lines[1]!.amount).toContain("75.000");
    expect(pdf.total).toContain("519.600");
  });
});
