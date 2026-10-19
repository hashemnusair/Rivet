import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { billingNotice, createFirstInvoice, websiteOfferView } from "./platformCommerce";
import { renewalReminderDay } from "./subscriptionReconciliation";
import { DAY_MS } from "./subscriptionTerm";

const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-commerce-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };
afterEach(() => vi.unstubAllEnvs());

type Seeded = { organizationId: Id<"organizations">; adminId: Id<"users">; applicationId: Id<"gymApplications"> };

/** A gym set up and invited, waiting for its first payment. */
async function seedPendingGym(t: TestConvex<typeof schema>, options: { name?: string; slug?: string; websiteRequested?: boolean; promoCode?: string; plan?: "Starter" | "Growth" | "Pro" } = {}): Promise<Seeded> {
  const slug = options.slug ?? "pending-gym";
  return await t.run(async (ctx) => {
    const now = Date.now();
    const admin = await ctx.db.query("users").withIndex("by_auth_subject", (q) => q.eq("authSubject", "clerk-platform")).unique()
      ?? await ctx.db.get(await ctx.db.insert("users", { publicId: "platform", authSubject: "clerk-platform", email: "platform@example.com", fullName: "Platform Admin", platformAdmin: true, status: "active", createdAt: now, updatedAt: now }));
    const organizationId = await ctx.db.insert("organizations", { publicId: `org-${slug}`, name: options.name ?? "Pending Gym", slug, status: "pending_payment", subscriptionPlan: options.plan ?? "Starter", billingInterval: "monthly", onboardingFeeMinor: 75_000, timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId, publicId: `branch-${slug}`, name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: `owner-${slug}`, authSubject: `clerk-owner-${slug}`, email: `owner@${slug}.jo`, fullName: "Gym Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: owner, role: "owner", branchIds: [branch], active: true, branchScope: "all", invitationStatus: "accepted", createdAt: now, updatedAt: now });
    const desk = await ctx.db.insert("users", { publicId: `desk-${slug}`, authSubject: `clerk-desk-${slug}`, email: `desk@${slug}.jo`, fullName: "Desk", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: desk, role: "receptionist", branchIds: [branch], active: true, branchScope: "selected", invitationStatus: "accepted", createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId, entityType: "marketplaceGym", publicId: `listing-${slug}`, createdAt: now, updatedAt: now, data: { id: `listing-${slug}`, name: options.name ?? "Pending Gym", targetOrganizationId: `org-${slug}`, subscriptionStatus: "pending_payment", rivetPlan: options.plan ?? "Starter", isPublic: false, branches: [] } });
    const applicationId = await ctx.db.insert("gymApplications", { publicId: `app-${slug}`, applicationKey: `owner@${slug}.jo::${slug}`, gymName: options.name ?? "Pending Gym", gymAddress: "Amman, Jordan", ownerName: "Gym Owner", email: `owner@${slug}.jo`, contactNumber: "+962790000000", plan: options.plan ?? "Starter", billingInterval: "monthly", ...(options.websiteRequested ? { websiteRequested: true } : {}), ...(options.promoCode ? { promoCode: options.promoCode } : {}), status: "approved", notificationStatus: "sent", submittedAt: now, updatedAt: now });
    const organization = (await ctx.db.get(organizationId))!;
    const application = (await ctx.db.get(applicationId))!;
    await createFirstInvoice(ctx, { user: admin!, correlationId: "cor-test" }, { organization, application, listingPublicId: `listing-${slug}`, now });
    return { organizationId, adminId: admin!._id, applicationId };
  });
}

async function firstInvoice(t: TestConvex<typeof schema>, organizationId: Id<"organizations">): Promise<Doc<"domainRecords">> {
  return await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", "platformInvoice")).unique())!);
}

describe("first payment invoice", () => {
  it("prices the plan, the one onboarding fee, a free website place and a promo code", async () => {
    const t = convexTest(schema, modules);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    await seedPendingGym(t, { slug: "seed-admin" });
    await platform.mutation(api.domain.mutate, operation("platform.promo.create", { code: "launch50", note: "Launch", target: "subscription", percentOff: 50, plans: [], reason: "Launch campaign" }));
    const { organizationId } = await seedPendingGym(t, { slug: "website-gym", websiteRequested: true, promoCode: "LAUNCH50" });
    const invoice = (await firstInvoice(t, organizationId)).data;
    // Starter is JOD 39; half off the first month; JOD 75 onboarding; the website is free.
    expect(invoice).toMatchObject({ firstPayment: true, status: "open", subtotalMinor: 114_000, onboardingFeeMinor: 75_000, websiteMinor: 0, websiteListMinor: 150_000, websiteFree: true, promoCode: "LAUNCH50", discountMinor: 19_500, subscriptionDiscountMinor: 19_500, amountMinor: 94_500 });
  });

  it("charges the website once the free places are taken, and never counts a gym that did not ask for one", async () => {
    const t = convexTest(schema, modules);
    // Test Gym never asked for a website and holds no place.
    const testGym = await seedPendingGym(t, { slug: "test-gym", name: "Test Gym" });
    for (let index = 0; index < 5; index += 1) await seedPendingGym(t, { slug: `free-${index}`, websiteRequested: true });
    const sixth = await seedPendingGym(t, { slug: "sixth", websiteRequested: true });
    expect((await firstInvoice(t, testGym.organizationId)).data.websiteFree).toBeUndefined();
    expect((await firstInvoice(t, sixth.organizationId)).data).toMatchObject({ websiteFree: false, websiteMinor: 150_000, amountMinor: 39_000 + 75_000 + 150_000 });
    expect(await t.query(api.domain.query, operation("public.websiteOffer"))).toEqual({ enabled: true, places: 5, claimed: 5, priceMinor: 150_000 });
  });

  it("gives a place back when its invoice is voided, and follows the console's settings", async () => {
    const t = convexTest(schema, modules);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const held = await seedPendingGym(t, { slug: "held", websiteRequested: true });
    expect((await t.run((ctx) => websiteOfferView(ctx))).claimed).toBe(1);
    const invoice = await firstInvoice(t, held.organizationId);
    await platform.mutation(api.domain.mutate, operation("platform.invoice.void", { invoiceId: invoice.publicId, reason: "Gym withdrew" }));
    expect((await t.run((ctx) => websiteOfferView(ctx))).claimed).toBe(0);
    await platform.mutation(api.domain.mutate, operation("platform.commerce.website_offer.update", { enabled: true, places: 3, priceMinor: 200_000, reason: "Fewer places, higher price" }));
    expect(await t.run((ctx) => websiteOfferView(ctx))).toEqual({ enabled: true, places: 3, claimed: 0, priceMinor: 200_000 });
  });
});

describe("promo codes", () => {
  it("are checked publicly and explain why a code cannot be used", async () => {
    const t = convexTest(schema, modules);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    await seedPendingGym(t, { slug: "seed" });
    const view = await platform.mutation(api.domain.mutate, operation("platform.promo.create", { code: "PRO20", note: "", target: "total", amountOffMinor: 20_000, plans: ["Pro"], maxRedemptions: 1, reason: "Pro campaign" })) as { promoCodes: Array<{ id: string; code: string; state: string }> };
    expect(view.promoCodes[0]).toMatchObject({ code: "PRO20", state: "active" });
    expect(await t.query(api.domain.query, operation("public.promo.check", { code: "pro20", plan: "Pro" }))).toMatchObject({ valid: true, promo: { code: "PRO20", target: "total", amountOffMinor: 20_000 } });
    expect(await t.query(api.domain.query, operation("public.promo.check", { code: "PRO20", plan: "Starter" }))).toEqual({ valid: false, reason: "plan" });
    expect(await t.query(api.domain.query, operation("public.promo.check", { code: "NOPE", plan: "Pro" }))).toEqual({ valid: false, reason: "not_found" });
    await seedPendingGym(t, { slug: "used", plan: "Pro", promoCode: "PRO20" });
    expect(await t.query(api.domain.query, operation("public.promo.check", { code: "PRO20", plan: "Pro" }))).toEqual({ valid: false, reason: "used_up" });
    await platform.mutation(api.domain.mutate, operation("platform.promo.set_active", { promoId: view.promoCodes[0]!.id, active: false, reason: "Campaign over" }));
    expect(await t.query(api.domain.query, operation("public.promo.check", { code: "PRO20", plan: "Pro" }))).toEqual({ valid: false, reason: "paused" });
    const audit = await t.run((ctx) => ctx.db.query("platformAuditEvents").collect());
    expect(audit.map((event) => event.action)).toEqual(expect.arrayContaining(["promo.create", "promo.pause"]));
  });

  it("are refused on an application when they do not work", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("RIVET_PUBLIC_REQUEST_PEPPER", "test-pepper");
    const application = { gymName: "Promo Gym", gymAddress: "Amman, Jordan", ownerName: "Promo Owner", email: "promo@example.com", contactNumber: "+962790000001", plan: "Starter" as const, billingInterval: "monthly" as const, promoCode: "MISSING", websiteRequested: true };
    await expectCode(t.mutation(internal.gymApplications.create, application), "VALIDATION_ERROR");
    const stored = await t.mutation(internal.gymApplications.create, { ...application, promoCode: undefined });
    const row = await t.run((ctx) => ctx.db.get(stored.applicationDocumentId));
    expect(row).toMatchObject({ websiteRequested: true });
    expect(row?.promoCode).toBeUndefined();
  });

  it("are managed by platform administrators only", async () => {
    const t = convexTest(schema, modules);
    await seedPendingGym(t, { slug: "owner-gym" });
    const owner = t.withIdentity({ subject: "clerk-owner-owner-gym" });
    await expectCode(owner.mutation(api.domain.mutate, operation("platform.promo.create", { code: "SELF100", note: "", target: "total", percentOff: 100, plans: [], reason: "Free for me" })), "FORBIDDEN");
    await expectCode(owner.query(api.domain.query, operation("platform.commerce.view")), "FORBIDDEN");
  });
});

describe("pay first", () => {
  it("lets the owner of an unpaid gym open the payment page and nothing else", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await seedPendingGym(t, { slug: "gate" });
    const owner = t.withIdentity({ subject: "clerk-owner-gate" });
    const checkout = await owner.query(api.domain.query, operation("billing.checkout")) as { gym: { status: string }; invoice?: { id: string; amountMinor: number }; canPay: boolean; accessEndsAt?: string };
    expect(checkout).toMatchObject({ gym: { status: "pending_payment" }, canPay: true, invoice: { amountMinor: 114_000 } });
    expect(checkout.accessEndsAt).toBeUndefined();
    await expectCode(owner.query(api.domain.query, operation("session")), "FORBIDDEN");
    const identity = await owner.query(api.identity.current, {}) as { memberships: unknown[]; billingAccess?: Array<{ status: string }> };
    expect(identity.memberships).toEqual([]);
    expect(identity.billingAccess).toEqual([expect.objectContaining({ organizationName: "Pending Gym", status: "pending_payment" })]);
    // Staff are told the gym is unavailable; only the owner pays.
    const desk = t.withIdentity({ subject: "clerk-desk-gate" });
    const deskIdentity = await desk.query(api.identity.current, {}) as { gymAccessUnavailable: boolean; billingAccess?: unknown };
    expect(deskIdentity).toMatchObject({ gymAccessUnavailable: true });
    expect(deskIdentity.billingAccess).toBeUndefined();
    await expectCode(desk.mutation(api.domain.mutate, operation("billing.payment.submit", { invoiceId: checkout.invoice!.id, method: "cliq", reference: "CLIQ-1", payerName: "Desk", paidOn: "2026-10-01" })), "FORBIDDEN");
    void organizationId;
  });

  it("opens the workspace when RIVET confirms the payment the owner sent, and starts the term then", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await seedPendingGym(t, { slug: "paid" });
    const owner = t.withIdentity({ subject: "clerk-owner-paid" });
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const invoice = await firstInvoice(t, organizationId);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    await expectCode(owner.mutation(api.domain.mutate, operation("billing.payment.submit", { invoiceId: invoice.publicId, method: "cliq", reference: "", payerName: "Gym Owner", paidOn: today })), "VALIDATION_ERROR");
    const sent = await owner.mutation(api.domain.mutate, operation("billing.payment.submit", { invoiceId: invoice.publicId, method: "cliq", reference: "CLIQ-778", payerName: "Gym Owner", paidOn: today })) as { invoice: { paymentClaim: { status: string } } };
    expect(sent.invoice.paymentClaim.status).toBe("submitted");
    const notifications = await t.run((ctx) => ctx.db.query("operationalNotifications").collect());
    expect(notifications.some((row) => row.kind === "platform_payment_submitted")).toBe(true);

    const before = Date.now();
    await platform.mutation(api.domain.mutate, operation("platform.invoice.payment", { invoiceId: invoice.publicId, reference: "CLIQ-778", reason: "Checked CliQ payment", paidAt: today }));
    const organization = await t.run((ctx) => ctx.db.get(organizationId));
    expect(organization?.status).toBe("active");
    expect(organization?.subscriptionStartedAt).toBeGreaterThanOrEqual(before);
    const paid = (await firstInvoice(t, organizationId)).data;
    expect(paid).toMatchObject({ status: "paid", paymentClaim: { status: "confirmed" } });
    expect(Date.parse(paid.periodStart)).toBeGreaterThanOrEqual(before);
    expect(organization?.currentPeriodEndsAt).toBe(Date.parse(paid.periodEnd));
    const listing = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", "marketplaceGym")).unique())!.data);
    expect(listing).toMatchObject({ subscriptionStatus: "active", isPublic: true });
    const session = await owner.query(api.domain.query, operation("session")) as { organization: { subscription: { status: string } } };
    expect(session.organization.subscription.status).toBe("active");
  });

  it("sends payment details back with a reason the gym can read", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await seedPendingGym(t, { slug: "returned" });
    const owner = t.withIdentity({ subject: "clerk-owner-returned" });
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const invoice = await firstInvoice(t, organizationId);
    await owner.mutation(api.domain.mutate, operation("billing.payment.submit", { invoiceId: invoice.publicId, method: "bank_transfer", reference: "TRX-1", payerName: "Gym Owner", paidOn: "2026-10-01" }));
    await expectCode(platform.mutation(api.domain.mutate, operation("platform.invoice.payment_reject", { invoiceId: invoice.publicId, reason: "" })), "VALIDATION_ERROR");
    await platform.mutation(api.domain.mutate, operation("platform.invoice.payment_reject", { invoiceId: invoice.publicId, reason: "No transfer with this reference arrived." }));
    const checkout = await owner.query(api.domain.query, operation("billing.checkout")) as { invoice: { paymentClaim: { status: string; rejectionReason: string } } };
    expect(checkout.invoice.paymentClaim).toMatchObject({ status: "rejected", rejectionReason: "No transfer with this reference arrived." });
    expect((await t.run((ctx) => ctx.db.get(organizationId)))?.status).toBe("pending_payment");
  });

  it("emails the owner our message each time payment details are sent back", async () => {
    const t = convexTest(schema, modules);
    const { organizationId } = await seedPendingGym(t, { slug: "returned-mail" });
    const owner = t.withIdentity({ subject: "clerk-owner-returned-mail" });
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const invoice = await firstInvoice(t, organizationId);
    const submit = (reference: string) => owner.mutation(api.domain.mutate, operation("billing.payment.submit", { invoiceId: invoice.publicId, method: "cliq", reference, payerName: "Gym Owner", paidOn: "2026-10-01" }));
    const sendBack = (reason: string) => platform.mutation(api.domain.mutate, operation("platform.invoice.payment_reject", { invoiceId: invoice.publicId, reason }));
    const returned = async () => (await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").collect())).filter((row) => row.kind === "platform_payment_returned");

    await submit("CLIQ-1");
    expect(await returned()).toHaveLength(0);
    await sendBack("No CliQ payment with reference CLIQ-1 arrived.");
    const [first] = await returned();
    expect(first).toMatchObject({
      organizationId,
      recipientEmail: "owner@returned-mail.jo",
      recipientReference: "owner-returned-mail",
      language: "en",
      templateVersion: "platform-payment-returned-v1",
      relatedEntityType: "platform_invoice",
      relatedEntityPublicId: invoice.publicId,
      subject: "We could not match your RIVET payment",
    });
    expect(first!.text).toContain("Our message: No CliQ payment with reference CLIQ-1 arrived.");
    expect(first!.text).toContain(`Invoice number: ${invoice.publicId}`);
    expect(first!.text).toContain("Amount: ");
    expect(first!.text).toContain("Due date: ");
    expect(first!.text).toContain("/billing");
    expect(first!.html).toContain("No CliQ payment with reference CLIQ-1 arrived.");

    // The same details cannot be sent back twice, so there is no second email.
    await expectCode(sendBack("Sent back again"), "CONFLICT");
    expect(await returned()).toHaveLength(1);

    // Details sent again and returned again get their own email, in the gym's language.
    await t.run((ctx) => ctx.db.patch(organizationId, { defaultLanguage: "ar" }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await submit("CLIQ-2");
    await sendBack("The amount was JOD 100.000, not the whole invoice.");
    const emails = await returned();
    expect(emails).toHaveLength(2);
    expect(new Set(emails.map((row) => row.dedupeKey)).size).toBe(2);
    const second = emails.find((row) => row._id !== first!._id)!;
    expect(second).toMatchObject({ language: "ar", subject: "لم نتمكن من مطابقة دفعتك إلى RIVET" });
    expect(second.text).toContain("رسالتنا: The amount was JOD 100.000, not the whole invoice.");
  });

  it("prints the console's payment details on emailed invoices, and a general line until they are set", async () => {
    const t = convexTest(schema, modules);
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const paidInvoicePdf = async (slug: string) => {
      const { organizationId } = await seedPendingGym(t, { slug });
      const invoice = await firstInvoice(t, organizationId);
      await platform.mutation(api.domain.mutate, operation("platform.invoice.payment", { invoiceId: invoice.publicId, reference: `CLIQ-${slug}`, reason: "Checked CliQ payment", paidAt: today }));
      const email = (await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").collect())).find((row) => row.kind === "platform_invoice_paid" && row.organizationId === organizationId);
      return atob(email!.attachments![0]!.contentBase64);
    };

    const generic = await paidInvoicePdf("before-details");
    expect(generic).toContain("(Bank transfer or CliQ. RIVET sends the account details");
    expect(generic).not.toContain("IBAN ");

    await platform.mutation(api.domain.mutate, operation("platform.commerce.payment_details.update", {
      cliqAlias: "RIVETJO",
      cliqName: "RIVET Technologies",
      bankName: "Cairo Amman Bank",
      accountName: "RIVET Technologies LLC",
      iban: "JO71 CBJO 0000 0000 0000 1234 5678 90",
      note: "Write the invoice number in the transfer note.",
      reason: "Bank account opened",
    }));
    const configured = await paidInvoicePdf("after-details");
    for (const line of ["IBAN JO71CBJO0000000000001234567890", "Bank Cairo Amman Bank", "Account name RIVET Technologies LLC", "Alias RIVETJO", "Name RIVET Technologies", "Write the invoice number in the transfer note."]) {
      expect(configured).toContain(`(${line}) Tj`);
    }
    expect(configured).not.toContain("RIVET sends the account details");
  });
});

describe("plan upgrades by the gym", () => {
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  type PlansView = { plan: string; options: Array<{ plan: string; subtotalMinor: number; creditMinor: number; amountMinor: number }>; blockedReason?: string; pending?: { id: string; planChange: { from: string; to: string }; amountMinor: number } };
  type Checkout = { invoice?: { id: string; amountMinor: number; planChange?: { from: string; to: string }; creditMinor?: number; supportCaseId?: string; paymentClaim?: { status: string } } };

  /** A Starter gym that paid its first month today. */
  async function activeGym(t: TestConvex<typeof schema>, slug: string) {
    const seeded = await seedPendingGym(t, { slug });
    const owner = t.withIdentity({ subject: `clerk-owner-${slug}` });
    const platform = t.withIdentity({ subject: "clerk-platform" });
    const first = await firstInvoice(t, seeded.organizationId);
    await owner.mutation(api.domain.mutate, operation("billing.payment.submit", { invoiceId: first.publicId, method: "cliq", reference: "CLIQ-FIRST", payerName: "Gym Owner", paidOn: today() }));
    await platform.mutation(api.domain.mutate, operation("platform.invoice.payment", { invoiceId: first.publicId, reference: "CLIQ-FIRST", reason: "Checked CliQ payment", paidAt: today() }));
    return { ...seeded, owner, platform };
  }

  it("prices bigger plans from the unused paid days, and only the owner asks", async () => {
    const t = convexTest(schema, modules);
    const { organizationId, owner } = await activeGym(t, "upgrade-price");
    // A first payment is followed on its payment page, not in Support.
    expect(await t.run((ctx) => ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", "supportCase")).collect())).toEqual([]);
    const plans = await owner.query(api.domain.query, operation("billing.plans")) as PlansView;
    expect(plans.plan).toBe("Starter");
    // The whole JOD 39 month just paid comes off; Enterprise is quoted by RIVET.
    expect(plans.options).toEqual([
      expect.objectContaining({ plan: "Growth", subtotalMinor: 89_000, creditMinor: 39_000, amountMinor: 50_000 }),
      expect.objectContaining({ plan: "Pro", subtotalMinor: 199_000, creditMinor: 39_000, amountMinor: 160_000 }),
    ]);
    const desk = t.withIdentity({ subject: "clerk-desk-upgrade-price" });
    await expectCode(desk.mutation(api.domain.mutate, operation("billing.plan_change.request", { plan: "Growth" })), "FORBIDDEN");
    await expectCode(owner.mutation(api.domain.mutate, operation("billing.plan_change.request", { plan: "Starter" })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("billing.plan_change.request", { plan: "Enterprise" })), "VALIDATION_ERROR");

    const checkout = await owner.mutation(api.domain.mutate, operation("billing.plan_change.request", { plan: "Growth" })) as Checkout;
    expect(checkout.invoice).toMatchObject({ amountMinor: 50_000, creditMinor: 39_000, planChange: { from: "Starter", to: "Growth" } });
    // Nothing changes until RIVET confirms the payment.
    expect((await t.run((ctx) => ctx.db.get(organizationId)))?.subscriptionPlan).toBe("Starter");
    // Choosing another plan replaces the request; cancelling it leaves nothing to pay.
    const pro = await owner.mutation(api.domain.mutate, operation("billing.plan_change.request", { plan: "Pro" })) as Checkout;
    expect(pro.invoice).toMatchObject({ amountMinor: 160_000, planChange: { to: "Pro" } });
    const invoices = (await t.run((ctx) => ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", "platformInvoice")).collect())).map((row) => row.data);
    expect(invoices.filter((invoice) => invoice.planChange).map((invoice) => [invoice.planChange.to, invoice.status]).sort()).toEqual([["Growth", "void"], ["Pro", "open"]]);
    const afterCancel = await owner.mutation(api.domain.mutate, operation("billing.plan_change.cancel", { invoiceId: pro.invoice!.id })) as PlansView;
    expect(afterCancel.pending).toBeUndefined();
    expect((await owner.query(api.domain.query, operation("billing.checkout")) as Checkout).invoice).toBeUndefined();
  });

  it("changes the plan when RIVET confirms the payment, and the support request follows it", async () => {
    const t = convexTest(schema, modules);
    const { organizationId, owner, platform } = await activeGym(t, "upgrade-flow");
    const startedAt = (await t.run((ctx) => ctx.db.get(organizationId)))!.subscriptionStartedAt;
    const request = await owner.mutation(api.domain.mutate, operation("billing.plan_change.request", { plan: "Growth" })) as Checkout;
    const invoiceId = request.invoice!.id;
    // A renewal raised for the current term is replaced by the upgrade.
    await t.run((ctx) => ctx.db.insert("domainRecords", { organizationId, entityType: "platformInvoice", publicId: "INV-renewal", createdAt: 1, updatedAt: 1, data: { id: "INV-renewal", status: "open", amountMinor: 39_000, currency: "JOD", cycleKey: "renewal:test", dueAt: new Date(Date.now() + 14 * DAY_MS).toISOString(), periodEnd: new Date(Date.now() + 60 * DAY_MS).toISOString() } }));
    // The upgrade is what the payment page asks for.
    expect((await owner.query(api.domain.query, operation("billing.checkout")) as Checkout).invoice?.id).toBe(invoiceId);

    const send = (reference: string) => owner.mutation(api.domain.mutate, operation("billing.payment.submit", { invoiceId, method: "bank_transfer", reference, payerName: "Gym Owner", paidOn: today() }));
    const sent = await send("TRX-UP-1") as Checkout;
    const caseId = sent.invoice!.supportCaseId!;
    type Case = { id: string; subject: string; status: string; requestType: string; billing: { state: string; invoiceId: string; planFrom?: string; planTo?: string; returnReason?: string } };
    const cases = async () => await owner.query(api.domain.query, operation("support.list")) as Case[];
    expect(await cases()).toEqual([expect.objectContaining({ id: caseId, subject: "Upgrade to Growth", status: "open", requestType: "billing", billing: expect.objectContaining({ state: "sent", invoiceId, planFrom: "Starter", planTo: "Growth" }) })]);
    await expectCode(owner.mutation(api.domain.mutate, operation("billing.plan_change.request", { plan: "Pro" })), "CONFLICT");

    await platform.mutation(api.domain.mutate, operation("platform.invoice.payment_reject", { invoiceId, reason: "No transfer with this reference arrived." }));
    expect((await cases())[0]).toMatchObject({ status: "waiting", billing: { state: "returned", returnReason: "No transfer with this reference arrived." } });
    await send("TRX-UP-2");
    expect(await cases()).toEqual([expect.objectContaining({ id: caseId, status: "open", billing: expect.objectContaining({ state: "sent" }) })]);

    const before = Date.now();
    await platform.mutation(api.domain.mutate, operation("platform.invoice.payment", { invoiceId, reference: "TRX-UP-2", reason: "Checked bank transfer", paidAt: today() }));
    const organization = await t.run((ctx) => ctx.db.get(organizationId));
    expect(organization).toMatchObject({ status: "active", subscriptionPlan: "Growth", subscriptionStartedAt: startedAt });
    expect(organization!.currentPeriodEndsAt).toBeGreaterThanOrEqual(before + 28 * DAY_MS);
    const entitlement = await t.run((ctx) => ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).unique());
    expect(entitlement?.subscriptionPlan).toBe("Growth");
    const rows = await t.run((ctx) => ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", "platformInvoice")).collect());
    const byId = new Map(rows.map((row) => [row.publicId, row.data]));
    expect(byId.get("INV-renewal")).toMatchObject({ status: "void" });
    expect(byId.get(invoiceId)).toMatchObject({ status: "paid", periodEnd: new Date(organization!.currentPeriodEndsAt!).toISOString() });
    expect((await cases())[0]).toMatchObject({ status: "resolved", resolutionSummary: "Payment confirmed. Your plan is now Growth.", billing: { state: "confirmed" } });
    const listing = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", "marketplaceGym")).unique())!.data);
    expect(listing.rivetPlan).toBe("Growth");
    const audit = await t.run((ctx) => ctx.db.query("platformAuditEvents").collect());
    expect(audit.map((event) => event.action)).toEqual(expect.arrayContaining(["plan_change.requested", "gym.plan.upgrade"]));
    // The next upgrade starts from the new plan.
    expect((await owner.query(api.domain.query, operation("billing.plans")) as PlansView).options.map((option) => option.plan)).toEqual(["Pro"]);
  });
});

describe("renewal warnings", () => {
  async function activeGym(t: TestConvex<typeof schema>, periodEndsAt: number) {
    return await t.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("organizations", { publicId: "org-renew", name: "Renew Gym", slug: "renew", status: "active", subscriptionPlan: "Starter", billingInterval: "monthly", currentPeriodEndsAt: periodEndsAt, timezone: "Asia/Amman", currency: "JOD", createdAt: now, updatedAt: now });
    });
  }

  it("warns on the last day of the paid term and after it, unless the next term is paid", async () => {
    const t = convexTest(schema, modules);
    const end = Date.parse("2026-11-01T21:00:00Z"); // midnight 2 November in Amman
    const organizationId = await activeGym(t, end);
    const notice = (now: number) => t.run(async (ctx) => billingNotice(ctx, (await ctx.db.get(organizationId))!, now));
    expect(await notice(Date.parse("2026-10-30T09:00:00Z"))).toBeFalsy();
    expect(await notice(Date.parse("2026-11-01T08:00:00Z"))).toMatchObject({ state: "last_day" });
    const invoiceId = await t.run((ctx) => ctx.db.insert("domainRecords", { organizationId, entityType: "platformInvoice", publicId: "INV-renew", createdAt: 1, updatedAt: 1, data: { status: "open", amountMinor: 39_000, currency: "JOD", dueAt: "2026-11-01T21:00:00.000Z", periodEnd: "2026-12-01T21:00:00.000Z" } }));
    expect(await notice(Date.parse("2026-11-03T08:00:00Z"))).toMatchObject({ state: "overdue", invoiceId: "INV-renew", amountMinor: 39_000, accessEndsAt: new Date(end + 21 * DAY_MS).toISOString() });
    await t.run((ctx) => ctx.db.patch(invoiceId, { data: { status: "open", amountMinor: 39_000, currency: "JOD", dueAt: "2026-11-01T21:00:00.000Z", periodEnd: "2026-12-01T21:00:00.000Z", paymentClaim: { status: "submitted" } } }));
    expect(await notice(Date.parse("2026-11-03T08:00:00Z"))).toMatchObject({ state: "payment_sent" });
    await t.run((ctx) => ctx.db.patch(invoiceId, { data: { status: "paid", amountMinor: 39_000, periodEnd: "2026-12-01T21:00:00.000Z" } }));
    expect(await notice(Date.parse("2026-11-01T08:00:00Z"))).toBeFalsy();
  });

  it("sends one reminder at 7, 3 and 1 days before the term ends", async () => {
    expect(renewalReminderDay(10 * DAY_MS, 0)).toBeUndefined();
    expect(renewalReminderDay(10 * DAY_MS, 3 * DAY_MS)).toBe(7);
    expect(renewalReminderDay(10 * DAY_MS, 7.5 * DAY_MS)).toBe(3);
    expect(renewalReminderDay(10 * DAY_MS, 9.5 * DAY_MS)).toBe(1);
    expect(renewalReminderDay(10 * DAY_MS, 10 * DAY_MS)).toBeUndefined();

    vi.stubEnv("RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED", "1");
    const t = convexTest(schema, modules);
    const end = Date.parse("2026-12-01T21:00:00Z");
    const organizationId = await activeGym(t, end);
    await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", { publicId: "owner-renew", authSubject: "clerk-owner-renew", email: "owner@renew.jo", fullName: "Owner", platformAdmin: false, status: "active", createdAt: 1, updatedAt: 1 });
      await ctx.db.insert("organizationMemberships", { organizationId, userId: owner, role: "owner", branchIds: [], active: true, branchScope: "all", createdAt: 1, updatedAt: 1 });
    });
    for (const daysBefore of [14, 10, 7, 6, 3, 3, 1]) await t.mutation(internal.subscriptionReconciliation.reconcile, { now: end - daysBefore * DAY_MS });
    const emails = await t.run((ctx) => ctx.db.query("operationalEmailDeliveries").collect());
    expect(emails.filter((row) => row.kind === "platform_invoice_issued")).toHaveLength(1);
    expect(emails.filter((row) => row.kind === "platform_invoice_reminder").map((row) => row.dedupeKey.split(":").at(-1)).sort()).toEqual(["1d", "3d", "7d"]);
    const invoice = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", "platformInvoice")).unique())!.data);
    // Raised 14 days ahead, so the agreement's 14-day payment term ends with the paid term.
    expect(Math.abs(Date.parse(invoice.dueAt) - end)).toBeLessThan(DAY_MS);
  });
});
