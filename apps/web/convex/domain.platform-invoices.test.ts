import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}

const modules = import.meta.glob("./**/*.ts");

function operation(operationName: string, input: Record<string, unknown> = {}) {
  return { operation: operationName, input, correlationId: `cor-test-${operationName}` };
}

async function expectCode(request: Promise<unknown>, code: string) {
  await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

async function seedPlatformInvoiceFixtures(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", {
      publicId: "org-invoice",
      name: "Invoice Gym",
      slug: "invoice-gym",
      status: "active",
      timezone: "Asia/Amman",
      currency: "JOD",
      createdAt: now,
      updatedAt: now,
    });
    const branch = await ctx.db.insert("branches", {
      organizationId: organization,
      publicId: "branch-invoice",
      name: "Invoice Gym Main",
      code: "INV",
      active: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const admin = await ctx.db.insert("users", {
      publicId: "platform-admin",
      authSubject: "clerk-platform-invoice",
      email: "platform@example.com",
      fullName: "Platform Admin",
      platformAdmin: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const staff = await ctx.db.insert("users", {
      publicId: "gym-staff",
      authSubject: "clerk-gym-staff",
      email: "staff@example.com",
      fullName: "Gym Staff",
      platformAdmin: false,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: organization,
      userId: staff,
      role: "owner",
      branchIds: [branch],
      active: true,
      branchScope: "all",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("domainRecords", {
      organizationId: organization,
      entityType: "marketplaceGym",
      publicId: "invoice-gym",
      createdAt: now,
      updatedAt: now,
      data: {
        id: "invoice-gym",
        name: "Invoice Gym",
        targetOrganizationId: "org-invoice",
        subscriptionStatus: "active",
        rivetPlan: "Growth",
        isPublic: true,
      },
    });
    void admin;
  });
}

describe("exported Convex platform invoice boundaries", () => {
  it("requires a platform admin and follows a truthful manual payment lifecycle", async () => {
    const t = convexTest(schema, modules);
    await seedPlatformInvoiceFixtures(t);
    const platform = t.withIdentity({ subject: "clerk-platform-invoice" });
    const staff = t.withIdentity({ subject: "clerk-gym-staff" });
    const input = {
      gymId: "invoice-gym",
      amountMinor: 149_000,
      currency: "JOD",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      dueAt: "2026-09-07",
    };

    await expectCode(staff.mutation(api.domain.mutate, operation("platform.invoice.create", input)), "FORBIDDEN");
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.invoice.create", { ...input, currency: "USD" })), "VALIDATION_ERROR");
    const draft = await platform.mutation(api.domain.mutate, operation("platform.invoice.create", input)) as { id: string; status: string };
    expect(draft).toMatchObject({ id: expect.stringMatching(/^INV-/), status: "draft" });

    const issued = await platform.mutation(api.domain.mutate, operation("platform.invoice.issue", { invoiceId: draft.id })) as { status: string; issuedAt: string };
    expect(issued).toMatchObject({ status: "open", issuedAt: expect.any(String) });
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.invoice.past_due", { invoiceId: draft.id, reason: "" })), "VALIDATION_ERROR");
    const pastDue = await platform.mutation(api.domain.mutate, operation("platform.invoice.past_due", { invoiceId: draft.id, reason: "Bank transfer was not received by the due date." })) as { status: string; pastDueAt: string };
    expect(pastDue).toMatchObject({ status: "past_due", pastDueAt: expect.any(String) });
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.invoice.payment", { invoiceId: draft.id, reference: "BANK-1", reason: "" })), "VALIDATION_ERROR");

    const paid = await platform.mutation(api.domain.mutate, operation("platform.invoice.payment", { invoiceId: draft.id, reference: "BANK-1", reason: "Bank transfer verified." })) as { status: string; paymentReference: string };
    expect(paid).toMatchObject({ status: "paid", paymentReference: "BANK-1" });
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.invoice.void", { invoiceId: draft.id, reason: "Attempted after payment." })), "VALIDATION_ERROR");

    const persisted = await t.run(async (ctx) => {
      const invoice = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformInvoice")).collect()).find((row) => row.publicId === draft.id);
      const audit = (await ctx.db.query("platformAuditEvents").collect()).filter((event) => event.entityPublicId === draft.id);
      const emails = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "operationalEmailDelivery")).collect()).map((record) => record.data);
      const notifications = await ctx.db.query("operationalNotifications").collect();
      return { invoice, audit, emails, notifications };
    });
    expect(persisted.invoice?.data).toMatchObject({ status: "paid", amountMinor: 149_000, currency: "JOD", paymentReference: "BANK-1" });
    expect(persisted.audit.map((event) => event.action)).toEqual(["invoice.create", "invoice.issue", "invoice.mark_past_due", "invoice.manual_payment"]);
    expect(persisted.audit.at(-1)).toMatchObject({ reason: "Bank transfer verified.", before: { status: "past_due" }, after: { status: "paid" } });
    expect(persisted.emails).toEqual([
      expect.objectContaining({ kind: "platform_invoice_issued", status: "suppressed", retryPolicy: { maxAttempts: 4, backoffMinutes: [1, 5, 30] } }),
      expect.objectContaining({ kind: "platform_invoice_past_due", status: "suppressed" }),
      expect.objectContaining({ kind: "platform_invoice_paid", status: "suppressed" }),
    ]);
    expect(persisted.notifications).toEqual([expect.objectContaining({ kind: "platform_invoice_past_due", dedupeKey: `platform-invoice-past-due:${draft.id}` })]);
  });

  it("never moves a gym's paid-through date backwards when a stale invoice is paid", async () => {
    const t = convexTest(schema, modules);
    await seedPlatformInvoiceFixtures(t);
    const platform = t.withIdentity({ subject: "clerk-platform-invoice" });
    const paidThrough = Date.parse("2027-06-30T12:00:00.000Z");
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-invoice")).unique();
      await ctx.db.patch(organization!._id, { currentPeriodEndsAt: paidThrough, billingInterval: "annual" });
    });

    // An old term's invoice, settled late, covers a period already behind the
    // gym: paying it must not take back the year it has paid for.
    const draft = await platform.mutation(api.domain.mutate, operation("platform.invoice.create", {
      gymId: "invoice-gym",
      amountMinor: 149_000,
      currency: "JOD",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      dueAt: "2026-09-07",
    })) as { id: string };
    await platform.mutation(api.domain.mutate, operation("platform.invoice.issue", { invoiceId: draft.id }));
    await platform.mutation(api.domain.mutate, operation("platform.invoice.payment", { invoiceId: draft.id, reference: "BANK-LATE", reason: "Late transfer for an old term." }));

    const organization = await t.run(async (ctx) => await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-invoice")).unique());
    expect(organization).toMatchObject({ status: "active", currentPeriodEndsAt: paidThrough });
  });

  it("requires a reason to void and leaves the immutable invoice record present", async () => {
    const t = convexTest(schema, modules);
    await seedPlatformInvoiceFixtures(t);
    const platform = t.withIdentity({ subject: "clerk-platform-invoice" });
    const draft = await platform.mutation(api.domain.mutate, operation("platform.invoice.create", {
      gymId: "invoice-gym",
      amountMinor: 79_000,
      currency: "JOD",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      dueAt: "2026-09-07",
    })) as { id: string };

    await expectCode(platform.mutation(api.domain.mutate, operation("platform.invoice.void", { invoiceId: draft.id, reason: "" })), "VALIDATION_ERROR");
    const voided = await platform.mutation(api.domain.mutate, operation("platform.invoice.void", { invoiceId: draft.id, reason: "Duplicate draft." })) as { id: string; status: string };
    expect(voided).toMatchObject({ id: draft.id, status: "void" });
    const rows = await t.run(async (ctx) => await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformInvoice")).collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).toMatchObject({ id: draft.id, status: "void" });
  });

  it("projects automatic invoice lifecycle fields through the platform snapshot", async () => {
    const t = convexTest(schema, modules);
    await seedPlatformInvoiceFixtures(t);
    const platform = t.withIdentity({ subject: "clerk-platform-invoice" });
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-invoice")).unique();
      if (!organization) throw new Error("invoice organization missing");
      await ctx.db.insert("domainRecords", {
        organizationId: organization._id,
        entityType: "platformInvoice",
        publicId: "INV-AUTOMATIC-PROJECTION",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: {
          id: "INV-AUTOMATIC-PROJECTION",
          gymId: "invoice-gym",
          gym: "Invoice Gym",
          amount: "JOD 119.520",
          amountMinor: 119_520,
          currency: "JOD",
          status: "open",
          cycleKey: "subscription:org-invoice:annual:1788177600000",
          billingInterval: "annual",
          issuedAt: "2026-08-28T12:00:00.000Z",
          dueAt: "2026-08-31T12:00:00.000Z",
          periodStart: "2026-08-31T12:00:00.000Z",
          periodEnd: "2027-08-31T12:00:00.000Z",
        },
      });
    });
    const snapshot = await platform.query(api.domain.query, operation("platform.snapshot")) as { invoices: Array<Record<string, unknown>> };
    expect(snapshot.invoices.find((invoice) => invoice.id === "INV-AUTOMATIC-PROJECTION")).toMatchObject({
      gymId: "invoice-gym",
      cycleKey: "subscription:org-invoice:annual:1788177600000",
      billingInterval: "annual",
      dueAt: "2026-08-31T12:00:00.000Z",
      periodStart: "2026-08-31T12:00:00.000Z",
      periodEnd: "2027-08-31T12:00:00.000Z",
    });
  });

  it("rejects invoices when the directory row and target organization disagree", async () => {
    const t = convexTest(schema, modules);
    await seedPlatformInvoiceFixtures(t);
    const platform = t.withIdentity({ subject: "clerk-platform-invoice" });
    await t.run(async (ctx) => {
      const listing = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).unique();
      if (!listing) throw new Error("seed marketplace listing missing");
      const otherOrganization = await ctx.db.insert("organizations", {
        publicId: "org-other-invoice",
        name: "Other Invoice Gym",
        slug: "other-invoice-gym",
        status: "active",
        timezone: "Asia/Amman",
        currency: "JOD",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.patch(listing._id, { organizationId: otherOrganization, updatedAt: Date.now() });
    });
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.invoice.create", {
      gymId: "invoice-gym",
      amountMinor: 149_000,
      currency: "JOD",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      dueAt: "2026-09-07",
    })), "CONFIGURATION_ERROR");
  });
});
