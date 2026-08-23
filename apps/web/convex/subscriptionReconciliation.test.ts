import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-test-${name}` });

async function seed(t: TestConvex<typeof schema>, options: { interval: "monthly" | "annual"; status: "trial" | "active"; boundary: number }) {
  await t.run(async (ctx) => {
    const now = options.boundary - 10 * 86_400_000;
    const organization = await ctx.db.insert("organizations", {
      publicId: "org-reconcile",
      name: "Reconcile Gym",
      slug: "reconcile-gym",
      status: options.status,
      subscriptionPlan: "Pro",
      billingInterval: options.interval,
      subscriptionStartedAt: options.status === "trial" ? options.boundary - 30 * 86_400_000 : options.boundary - 31 * 86_400_000,
      ...(options.status === "trial" ? { trialEndsAt: options.boundary } : { currentPeriodEndsAt: options.boundary }),
      timezone: "UTC",
      currency: "JOD",
      createdAt: now,
      updatedAt: now,
    });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-reconcile", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner-reconcile", authSubject: "clerk-owner-reconcile", email: "owner@reconcile.example", fullName: "Reconcile Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("users", { publicId: "admin-reconcile", authSubject: "clerk-admin-reconcile", email: "admin@reconcile.example", fullName: "Platform Admin", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "marketplaceGym", publicId: "reconcile-gym", createdAt: now, updatedAt: now, data: { id: "reconcile-gym", name: "Reconcile Gym", targetOrganizationId: "org-reconcile", subscriptionStatus: options.status, rivetPlan: "Pro", billingInterval: options.interval, isPublic: true, branches: [] } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "platformPlan", publicId: "Pro", createdAt: now, updatedAt: now, data: { id: "Pro", name: "Pro", priceMinor: 249_000, branches: 8, staff: 80, members: 10_000, tone: "night" } });
  });
}

describe("subscription reconciliation lifecycle", () => {
  it("creates one monthly trial invoice at T-3, marks it due, grants grace, then suspends and hides", async () => {
    const t = convexTest(schema, modules);
    const boundary = Date.parse("2026-08-31T12:00:00.000Z");
    await seed(t, { interval: "monthly", status: "trial", boundary });

    const reminder = await t.mutation(internal.subscriptionReconciliation.reconcile, { now: boundary - 3 * 86_400_000 });
    expect(reminder).toMatchObject({ invoicesCreated: 1, markedPastDue: 0, suspended: 0 });
    const repeat = await t.mutation(internal.subscriptionReconciliation.reconcile, { now: boundary - 3 * 86_400_000 });
    expect(repeat).toMatchObject({ invoicesCreated: 0 });
    const reminderAudits = await t.run(async (ctx) => ctx.db.query("platformAuditEvents").collect());
    expect(reminderAudits).toEqual([expect.objectContaining({ action: "subscription.invoice.created", actorPublicId: "system:subscription-reconciliation", correlationId: expect.stringContaining("invoice_created") })]);
    expect(reminderAudits[0]).not.toHaveProperty("actorUserId");
    const invoice = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformInvoice")).unique())!);
    expect(invoice.data).toMatchObject({ status: "open", billingInterval: "monthly", cycleKey: expect.stringContaining("monthly"), dueAt: new Date(boundary).toISOString() });

    const due = await t.mutation(internal.subscriptionReconciliation.reconcile, { now: boundary });
    expect(due).toMatchObject({ markedPastDue: 1, suspended: 0 });
    expect((await t.run(async (ctx) => await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-reconcile")).unique()))?.status).toBe("past_due");
    const grace = await t.mutation(internal.subscriptionReconciliation.reconcile, { now: boundary + 86_400_000 });
    expect(grace).toMatchObject({ suspended: 0 });
    const suspended = await t.mutation(internal.subscriptionReconciliation.reconcile, { now: boundary + 2 * 86_400_000 });
    expect(suspended).toMatchObject({ suspended: 1 });
    const repeatSuspended = await t.mutation(internal.subscriptionReconciliation.reconcile, { now: boundary + 2 * 86_400_000 });
    expect(repeatSuspended).toMatchObject({ suspended: 0 });
    const state = await t.run(async (ctx) => ({
      organization: await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-reconcile")).unique(),
      listing: await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).unique(),
      emails: (await ctx.db.query("operationalEmailDeliveries").collect()).map((row) => ({ kind: row.kind, dedupeKey: row.dedupeKey })),
      audits: (await ctx.db.query("platformAuditEvents").collect()).filter((event) => event.actorPublicId === "system:subscription-reconciliation"),
    }));
    expect(state.organization).toMatchObject({ status: "suspended" });
    expect(state.listing?.data).toMatchObject({ subscriptionStatus: "suspended", isPublic: false });
    expect(state.emails).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "platform_invoice_reminder" }),
      expect.objectContaining({ kind: "platform_invoice_past_due" }),
      expect.objectContaining({ kind: "platform_subscription_suspended" }),
    ]));
    expect(state.audits).toHaveLength(3);
    const createdAudit = state.audits.find((event) => event.action === "subscription.invoice.created");
    const pastDueAudit = state.audits.find((event) => event.action === "subscription.invoice.past_due");
    const suspendedAudit = state.audits.find((event) => event.action === "subscription.suspended");
    expect(createdAudit).toMatchObject({ before: { invoiceStatus: null }, after: expect.objectContaining({ invoiceStatus: "open", cycleKey: expect.any(String) }) });
    expect(pastDueAudit).toMatchObject({ before: expect.objectContaining({ invoiceStatus: "open", organizationStatus: "trial" }), after: expect.objectContaining({ invoiceStatus: "past_due", organizationStatus: "past_due", subscriptionStatus: "overdue" }) });
    expect(suspendedAudit).toMatchObject({ before: expect.objectContaining({ organizationStatus: "past_due" }), after: expect.objectContaining({ organizationStatus: "suspended", subscriptionStatus: "suspended", isPublic: false }) });
  });

  it("prices annual cycles at the 20% discount and payment reactivates the tenant for the next period", async () => {
    const t = convexTest(schema, modules);
    const boundary = Date.parse("2026-09-30T12:00:00.000Z");
    await seed(t, { interval: "annual", status: "active", boundary });
    await t.mutation(internal.subscriptionReconciliation.reconcile, { now: boundary - 3 * 86_400_000 });
    const invoice = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformInvoice")).unique())!);
    expect(invoice.data).toMatchObject({ amountMinor: 2_390_400, billingInterval: "annual", status: "open" });
    await t.mutation(internal.subscriptionReconciliation.reconcile, { now: boundary });
    const admin = t.withIdentity({ subject: "clerk-admin-reconcile" });
    await admin.mutation(api.domain.mutate, operation("platform.invoice.payment", { invoiceId: invoice.publicId, reference: "BANK-ANNUAL-1", reason: "Annual transfer received." }));
    const state = await t.run(async (ctx) => ({
      organization: await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-reconcile")).unique(),
      invoice: await ctx.db.get(invoice._id),
    }));
    expect(state.invoice?.data).toMatchObject({ status: "paid", billingInterval: "annual" });
    expect(state.organization).toMatchObject({ status: "active", billingInterval: "annual", currentPeriodEndsAt: Date.parse("2027-09-30T12:00:00.000Z") });
  });
});
