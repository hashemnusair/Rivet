import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { gymMonthlyPriceMinor } from "./planCatalogue";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-quote-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };
const DAY = 86_400_000;
afterEach(() => vi.unstubAllEnvs());

type Data = Record<string, unknown>;

async function seedAdmin(t: TestConvex<typeof schema>) {
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("users", { publicId: "platform", authSubject: "clerk-platform", email: "platform@example.com", fullName: "Platform Admin", platformAdmin: true, status: "active", createdAt: now, updatedAt: now });
  });
}

/** An active gym in the middle of a paid month, with the invoice that paid for it. */
async function seedActiveGym(t: TestConvex<typeof schema>, plan: "Pro" | "Enterprise", quotedPriceMinor?: number) {
  const periodEnd = Date.now() + 15 * DAY;
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "org-quote", name: "Quote Gym", slug: "quote-gym", status: "active", subscriptionPlan: plan, billingInterval: "monthly", ...(quotedPriceMinor !== undefined ? { quotedPriceMinor } : {}), subscriptionStartedAt: now - 15 * DAY, currentPeriodEndsAt: periodEnd, timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "branch-quote", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "owner-quote", authSubject: "clerk-owner-quote", email: "owner@quote.jo", fullName: "Quote Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], active: true, branchScope: "all", invitationStatus: "accepted", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "marketplaceGym", publicId: "quote-gym", createdAt: now, updatedAt: now, data: { id: "quote-gym", name: "Quote Gym", targetOrganizationId: "org-quote", subscriptionStatus: "active", rivetPlan: plan, isPublic: true, branches: [] } });
    const paid = plan === "Enterprise" ? quotedPriceMinor ?? 500_000 : 199_000;
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "platformInvoice", publicId: "INV-paid", createdAt: now, updatedAt: now, data: { id: "INV-paid", gymId: "quote-gym", amountMinor: paid, currency: "JOD", status: "paid", periodStart: new Date(now - 15 * DAY).toISOString(), periodEnd: new Date(periodEnd).toISOString(), billingInterval: "monthly", cycleKey: "first:org-quote", createdAt: new Date(now - 15 * DAY).toISOString() } });
  });
  return periodEnd;
}

async function organization(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => (await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "org-quote")).unique())!);
}

async function invoices(t: TestConvex<typeof schema>): Promise<Data[]> {
  return await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformInvoice")).collect()).map((row) => row.data as Data));
}

describe("the gym's monthly price", () => {
  it("is the quote on Enterprise and the catalogue price everywhere else", () => {
    expect(gymMonthlyPriceMinor("Enterprise", 500_000, 450_000)).toBe(450_000);
    expect(gymMonthlyPriceMinor("Enterprise", 500_000, undefined)).toBe(500_000);
    expect(gymMonthlyPriceMinor("Enterprise", 500_000, 0)).toBe(500_000);
    expect(gymMonthlyPriceMinor("Pro", 199_000, 450_000)).toBe(199_000);
  });
});

describe("Enterprise applications", () => {
  it("cannot be approved without a quote, and the gym's first invoice bills that quote", async () => {
    const t = convexTest(schema, modules);
    await seedAdmin(t);
    const applicationId = "30000000-0000-4a00-8a00-000000000001";
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("gymApplications", { publicId: applicationId, applicationKey: "owner@big.jo::big-gym", gymName: "Big Gym", gymAddress: "Amman", ownerName: "Big Owner", email: "owner@big.jo", contactNumber: "+962790000123", plan: "Enterprise", billingInterval: "monthly", status: "under_review", notificationStatus: "sent", submittedAt: now, updatedAt: now });
    });
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const review = { applicationId, decision: "approved" as const, correlationId: "cor-quote-review" };
    await expectCode(platform.mutation(internal.gymApplications.reviewRecord, review), "VALIDATION_ERROR");
    await expectCode(platform.mutation(internal.gymApplications.reviewRecord, { ...review, quotedPriceMinor: 0 }), "VALIDATION_ERROR");
    const approved = await platform.mutation(internal.gymApplications.reviewRecord, { ...review, quotedPriceMinor: 425_500 }) as Data;
    expect(approved).toMatchObject({ status: "approved", quotedPriceMinor: 425_500 });
    const listed = await platform.query(api.domain.query, operation("platform.applications")) as Data[];
    expect(listed.find((item) => item.id === applicationId)).toMatchObject({ plan: "Enterprise", quotedPriceMinor: 425_500 });
    const audit = await t.run((ctx) => ctx.db.query("platformAuditEvents").collect());
    expect(audit.find((event) => event.action === "gym_application.approved")?.after).toMatchObject({ quotedPriceMinor: 425_500 });

    const claim = await platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId: "cor-quote-provision" }) as { correlationId: string; leaseId: string };
    await platform.mutation(internal.platformProvisioning.rememberClerkOrganization, { applicationId, clerkOrganizationId: "org_clerk_big", correlationId: claim.correlationId, leaseId: claim.leaseId });
    await platform.mutation(internal.platformProvisioning.createWorkspace, { applicationId, clerkOrganizationId: "org_clerk_big", correlationId: claim.correlationId, leaseId: claim.leaseId });
    const gym = await t.run(async (ctx) => (await ctx.db.query("organizations").collect()).find((row) => row.name === "Big Gym"));
    expect(gym).toMatchObject({ subscriptionPlan: "Enterprise", quotedPriceMinor: 425_500, status: "pending_payment" });
    // The website promised a quote: the gym pays it, not the catalogue's JOD 500.
    expect(await invoices(t)).toEqual([expect.objectContaining({ firstPayment: true, subtotalMinor: 425_500, amountMinor: 425_500 })]);
  });

  it("never asks for a quote on the published plans", async () => {
    const t = convexTest(schema, modules);
    await seedAdmin(t);
    const applicationId = "30000000-0000-4a00-8a00-000000000002";
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("gymApplications", { publicId: applicationId, applicationKey: "owner@small.jo::small-gym", gymName: "Small Gym", ownerName: "Small Owner", email: "owner@small.jo", contactNumber: "+962790000124", plan: "Growth", status: "pending", notificationStatus: "sent", submittedAt: now, updatedAt: now });
    });
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const approved = await platform.mutation(internal.gymApplications.reviewRecord, { applicationId, decision: "approved", quotedPriceMinor: 425_500, correlationId: "cor-quote-growth" }) as Data;
    expect(approved.quotedPriceMinor).toBeUndefined();
  });
});

describe("RIVET changes a gym's plan", () => {
  it("needs a quote to move a gym onto Enterprise, and bills the new term at it", async () => {
    const t = convexTest(schema, modules);
    await seedAdmin(t);
    await seedActiveGym(t, "Pro");
    const platform = t.withIdentity({ subject: "clerk-platform" });
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "quote-gym", plan: "Enterprise", reason: "Signed an Enterprise quote." })), "VALIDATION_ERROR");
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "quote-gym", quotedPriceMinor: 300_000, reason: "A quote on Pro means nothing." })), "VALIDATION_ERROR");

    const updated = await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "quote-gym", plan: "Enterprise", quotedPriceMinor: 300_000, reason: "Signed an Enterprise quote." })) as Data;
    expect(updated).toMatchObject({ rivetPlan: "Enterprise", quotedPriceMinor: 300_000 });
    expect(await organization(t)).toMatchObject({ subscriptionPlan: "Enterprise", quotedPriceMinor: 300_000 });
    const change = (await invoices(t)).find((invoice) => String(invoice.cycleKey).startsWith("change:"));
    // One month at the quote, less the unused half of the paid Pro month.
    expect(change).toMatchObject({ subtotalMinor: 300_000, status: "open" });
    expect(Number(change?.creditMinor)).toBeGreaterThan(90_000);
    expect(change?.amountMinor).toBe(300_000 - Number(change?.creditMinor));
    const audit = await t.run((ctx) => ctx.db.query("platformAuditEvents").collect());
    const event = audit.find((item) => item.action === "gym.subscription.update");
    expect(event?.before).toMatchObject({ quotedPriceMinor: null });
    expect(event?.after).toMatchObject({ quotedPriceMinor: 300_000 });
  });

  it("re-prices an Enterprise gym from a new quote, and forgets the quote when it leaves Enterprise", async () => {
    const t = convexTest(schema, modules);
    await seedAdmin(t);
    await seedActiveGym(t, "Enterprise", 400_000);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "quote-gym", quotedPriceMinor: 360_000, billingInterval: "annual", reason: "New yearly quote." }));
    expect(await organization(t)).toMatchObject({ subscriptionPlan: "Enterprise", billingInterval: "annual", quotedPriceMinor: 360_000 });
    const yearly = (await invoices(t)).find((invoice) => String(invoice.cycleKey).startsWith("change:"));
    // Twelve months of the quote at 5% off.
    expect(yearly).toMatchObject({ subtotalMinor: 4_104_000, billingInterval: "annual" });

    const detail = await platform.query(api.domain.query, operation("platform.gym.detail", { gymId: "quote-gym" })) as { subscription: { recurringAmount?: { value?: { amount: number } } } };
    expect(detail.subscription.recurringAmount?.value?.amount).toBe(4_104_000);

    await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId: "quote-gym", plan: "Pro", reason: "Back to a published plan." }));
    const after = await organization(t);
    expect(after.subscriptionPlan).toBe("Pro");
    expect(after.quotedPriceMinor).toBeUndefined();
  });
});

describe("Enterprise renewals and the gym's own view", () => {
  it("renew at the quote, and show the gym the price it pays", async () => {
    vi.stubEnv("RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED", "1");
    const t = convexTest(schema, modules);
    await seedAdmin(t);
    const periodEnd = await seedActiveGym(t, "Enterprise", 410_000);
    const owner = t.withIdentity({ subject: "clerk-owner-quote" });
    expect(await owner.query(api.domain.query, operation("billing.plans"))).toMatchObject({ plan: "Enterprise", monthlyPriceMinor: 410_000, options: [] });

    await t.mutation(internal.subscriptionReconciliation.reconcile, { now: periodEnd - 10 * DAY });
    const renewal = (await invoices(t)).find((invoice) => String(invoice.cycleKey).startsWith("subscription:"));
    expect(renewal).toMatchObject({ amountMinor: 410_000 });
  });

  it("count toward platform revenue at the quote", async () => {
    const t = convexTest(schema, modules);
    await seedAdmin(t);
    await seedActiveGym(t, "Enterprise", 410_000);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const snapshot = await platform.query(api.domain.query, operation("platform.snapshot")) as { overview: { activeMrr: { amount: number } } };
    expect(snapshot.overview.activeMrr.amount).toBe(410_000);
  });
});

/** An approved Enterprise application set up and waiting for its first payment. */
async function provisionPendingEnterprise(t: TestConvex<typeof schema>, quotedPriceMinor: number) {
  await seedAdmin(t);
  const applicationId = "30000000-0000-4a00-8a00-000000000010";
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("gymApplications", { publicId: applicationId, applicationKey: "owner@wait.jo::wait-gym", gymName: "Wait Gym", gymAddress: "Amman", ownerName: "Wait Owner", email: "owner@wait.jo", contactNumber: "+962790000125", plan: "Enterprise", billingInterval: "monthly", status: "under_review", notificationStatus: "sent", submittedAt: now, updatedAt: now });
  });
  const platform = t.withIdentity({ subject: "clerk-platform" });
  await platform.mutation(internal.gymApplications.reviewRecord, { applicationId, decision: "approved", quotedPriceMinor, correlationId: "cor-wait-review" });
  const claim = await platform.mutation(internal.platformProvisioning.begin, { applicationId, correlationId: "cor-wait-provision" }) as { correlationId: string; leaseId: string };
  await platform.mutation(internal.platformProvisioning.rememberClerkOrganization, { applicationId, clerkOrganizationId: "org_clerk_wait", correlationId: claim.correlationId, leaseId: claim.leaseId });
  await platform.mutation(internal.platformProvisioning.createWorkspace, { applicationId, clerkOrganizationId: "org_clerk_wait", correlationId: claim.correlationId, leaseId: claim.leaseId });
  const gymId = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "marketplaceGym")).collect())[0]!.publicId);
  return { platform, gymId };
}

async function waitingGym(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => (await ctx.db.query("organizations").collect()).find((row) => row.name === "Wait Gym")!);
}

describe("a gym that has not paid yet", () => {
  it("has a mistyped quote corrected, and its first invoice issued again", async () => {
    const t = convexTest(schema, modules);
    const { platform, gymId } = await provisionPendingEnterprise(t, 4_255_000);
    const corrected = await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId, quotedPriceMinor: 425_500, reason: "Typed the quote with an extra zero." })) as Data;
    expect(corrected).toMatchObject({ rivetPlan: "Enterprise", subscriptionStatus: "pending_payment", quotedPriceMinor: 425_500 });
    expect(await waitingGym(t)).toMatchObject({ status: "pending_payment", subscriptionPlan: "Enterprise", quotedPriceMinor: 425_500 });
    const all = await invoices(t);
    expect(all.filter((invoice) => invoice.status === "void")).toEqual([expect.objectContaining({ firstPayment: true, subtotalMinor: 4_255_000 })]);
    expect(all.filter((invoice) => invoice.status === "open")).toEqual([expect.objectContaining({ firstPayment: true, subtotalMinor: 425_500, amountMinor: 425_500 })]);
    const audit = await t.run((ctx) => ctx.db.query("platformAuditEvents").collect());
    expect(audit.find((event) => event.action === "gym.subscription.update")).toMatchObject({ before: expect.objectContaining({ quotedPriceMinor: 4_255_000 }), after: expect.objectContaining({ quotedPriceMinor: 425_500 }) });
    expect(audit.filter((event) => event.action === "invoice.void")).toHaveLength(1);
  });

  it("moves to a published plan and yearly billing with that plan's onboarding fee", async () => {
    const t = convexTest(schema, modules);
    const { platform, gymId } = await provisionPendingEnterprise(t, 425_500);
    await platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId, plan: "Growth", billingInterval: "annual", reason: "Owner chose Growth, paid yearly." }));
    const gym = await waitingGym(t);
    expect(gym).toMatchObject({ status: "pending_payment", subscriptionPlan: "Growth", billingInterval: "annual", onboardingFeeMinor: 75_000 });
    expect(gym.quotedPriceMinor).toBeUndefined();
    const open = (await invoices(t)).filter((invoice) => invoice.status === "open");
    // Twelve months of Growth at 5% off, plus the one onboarding fee.
    expect(open).toEqual([expect.objectContaining({ firstPayment: true, billingInterval: "annual", onboardingFeeMinor: 75_000, amountMinor: 1_014_600 + 75_000 })]);
    const entitlement = await t.run(async (ctx) => await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", gym._id)).unique());
    expect(entitlement).toMatchObject({ subscriptionPlan: "Growth", entitledModules: ["foundation", "revenue", "operations"] });
  });

  it("is not changed while the gym's payment details wait for RIVET, or when nothing changes", async () => {
    const t = convexTest(schema, modules);
    const { platform, gymId } = await provisionPendingEnterprise(t, 425_500);
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId, quotedPriceMinor: 425_500, reason: "Same quote." })), "VALIDATION_ERROR");
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformInvoice")).collect())[0]!;
      await ctx.db.patch(row._id, { data: { ...(row.data as Data), paymentClaim: { status: "submitted", method: "cliq", reference: "REF-1" } } });
    });
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.gym.update", { gymId, quotedPriceMinor: 400_000, reason: "Lower quote." })), "CONFLICT");
    expect((await invoices(t)).filter((invoice) => invoice.status === "void")).toHaveLength(0);
  });
});
