import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { domainError, publicUserId, requireBillingActor, requirePlatformAdmin, requireReason, type ActorContext, type RequestArgs } from "./security";
import { findPlan, termPriceMinor } from "./planCatalogue";
import { DAY_MS, PAYMENT_TERM_DAYS, SUSPENSION_AFTER_DUE_DAYS, termEnd, type BillingInterval } from "./subscriptionTerm";
import {
  DEFAULT_WEBSITE_PLACES,
  DEFAULT_WEBSITE_PRICE_MINOR,
  PROMO_TARGETS,
  firstPaymentQuote,
  normalizePromoCode,
  validPromoCodeShape,
  type PromoCheck,
  type PromoDiscount,
  type PromoTarget,
} from "./firstPayment";
import { notifyPlatformAdmins } from "./notificationDelivery";
import { enqueueOperationalEmail, type OperationalEmailFacts } from "./operationalEmail";
import { systemMessage } from "../src/lib/i18n/system-messages";

/**
 * How a gym pays RIVET, and the launch offers on that first payment.
 *
 * - The website offer and RIVET's payment details live in `platformSettings`.
 * - Promo codes live in `platformPromoCodes`; their uses, and the free website
 *   places, are counted from the invoices that carry them, so voiding an
 *   invoice gives the place or the use back without a counter to repair.
 * - A gym's owner sends payment details from the payment page; a platform
 *   administrator confirms them (`platform.invoice.payment`) or sends them
 *   back with a reason (`platform.invoice.payment_reject`).
 */

type ReadContext = QueryCtx | MutationCtx;
type Data = Record<string, unknown>;
type PlatformAdmin = Awaited<ReturnType<typeof requirePlatformAdmin>>;
type PlanName = "Starter" | "Growth" | "Pro" | "Enterprise";

export const COMMERCE_QUERIES = ["public.websiteOffer", "public.promo.check", "platform.commerce.view", "billing.checkout"] as const;
export const COMMERCE_MUTATIONS = [
  "platform.commerce.website_offer.update",
  "platform.commerce.payment_details.update",
  "platform.promo.create",
  "platform.promo.set_active",
  "platform.invoice.payment_reject",
  "billing.payment.submit",
] as const;

const SETTINGS_KEY = "commercial";
const UNPAID_STATUSES = ["open", "past_due", "failed"];
const PLAN_NAMES: readonly PlanName[] = ["Starter", "Growth", "Pro", "Enterprise"];

export interface WebsiteOfferSettings {
  enabled: boolean;
  places: number;
  priceMinor: number;
}

export interface PaymentDetails {
  cliqAlias: string;
  cliqName: string;
  bankName: string;
  accountName: string;
  iban: string;
  note: string;
}

export interface CommercialSettings {
  websiteOffer: WebsiteOfferSettings;
  paymentDetails: PaymentDetails;
}

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
}

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function wholeAtLeast(value: unknown, min: number): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min ? value : undefined;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function timestamp(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** The calendar day an instant falls on in a gym's time zone, YYYY-MM-DD. */
export function localDay(ms: number, timeZone = "Asia/Amman"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

function amountLabel(amountMinor: number): string {
  return `JOD ${(amountMinor / 1_000).toFixed(3)}`;
}

async function platformAudit(ctx: MutationCtx, actor: { user: Doc<"users">; correlationId: string }, entry: { action: string; entityType: string; entityPublicId: string; entityLabel: string; summary: string; reason?: string; before?: unknown; after?: unknown }): Promise<void> {
  await ctx.db.insert("platformAuditEvents", {
    publicId: crypto.randomUUID(),
    actorUserId: actor.user._id,
    actorPublicId: publicUserId(actor.user),
    actorName: actor.user.fullName,
    ...entry,
    correlationId: actor.correlationId,
    occurredAt: Date.now(),
  });
}

// ---------------------------------------------------------------- Settings

export async function commercialSettings(ctx: ReadContext): Promise<CommercialSettings> {
  const row = await ctx.db.query("platformSettings").withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY)).unique();
  const stored = record(row?.data);
  const offer = record(stored.websiteOffer);
  const payment = record(stored.paymentDetails);
  return {
    websiteOffer: {
      enabled: typeof offer.enabled === "boolean" ? offer.enabled : true,
      places: wholeAtLeast(offer.places, 0) ?? DEFAULT_WEBSITE_PLACES,
      priceMinor: wholeAtLeast(offer.priceMinor, 0) ?? DEFAULT_WEBSITE_PRICE_MINOR,
    },
    paymentDetails: {
      cliqAlias: text(payment.cliqAlias, 80),
      cliqName: text(payment.cliqName, 120),
      bankName: text(payment.bankName, 120),
      accountName: text(payment.accountName, 120),
      iban: text(payment.iban, 40),
      note: text(payment.note, 500),
    },
  };
}

async function saveCommercialSettings(ctx: MutationCtx, next: CommercialSettings, userId: Id<"users">): Promise<void> {
  const row = await ctx.db.query("platformSettings").withIndex("by_key", (q) => q.eq("key", SETTINGS_KEY)).unique();
  const now = Date.now();
  if (row) await ctx.db.patch(row._id, { data: next, updatedByUserId: userId, updatedAt: now });
  else await ctx.db.insert("platformSettings", { key: SETTINGS_KEY, data: next, updatedByUserId: userId, updatedAt: now });
}

// ---------------------------------------------------------------- Invoices read for counting

async function allPlatformInvoices(ctx: ReadContext): Promise<Doc<"domainRecords">[]> {
  return await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformInvoice")).collect();
}

async function organizationInvoices(ctx: ReadContext, organizationId: Id<"organizations">): Promise<Doc<"domainRecords">[]> {
  return await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", "platformInvoice")).collect();
}

export interface WebsitePlaceHolder {
  organizationId: Id<"organizations">;
  gym: string;
  invoiceId: string;
  status: string;
  issuedAt?: string;
}

/**
 * Gyms holding a free website place: an invoice that is not void gave them
 * the website free. A gym holds at most one place; places go in the order
 * the invoices were issued.
 */
function websitePlaceHolders(rows: Doc<"domainRecords">[]): WebsitePlaceHolder[] {
  const byOrganization = new Map<string, WebsitePlaceHolder>();
  for (const row of rows) {
    const invoice = record(row.data);
    if (invoice.websiteFree !== true || invoice.status === "void") continue;
    const issuedAt = typeof invoice.issuedAt === "string" ? invoice.issuedAt : typeof invoice.createdAt === "string" ? invoice.createdAt : undefined;
    const existing = byOrganization.get(row.organizationId);
    if (existing && (existing.issuedAt ?? "") <= (issuedAt ?? "")) continue;
    byOrganization.set(row.organizationId, { organizationId: row.organizationId, gym: text(invoice.gym), invoiceId: row.publicId, status: text(invoice.status), issuedAt });
  }
  return [...byOrganization.values()].sort((left, right) => (left.issuedAt ?? "").localeCompare(right.issuedAt ?? ""));
}

/** The free-website offer as a visitor sees it: the count, never a gym's name. */
export async function websiteOfferView(ctx: ReadContext): Promise<{ enabled: boolean; places: number; claimed: number; priceMinor: number }> {
  const { websiteOffer } = await commercialSettings(ctx);
  const holders = websitePlaceHolders(await allPlatformInvoices(ctx));
  return { enabled: websiteOffer.enabled, places: websiteOffer.places, claimed: Math.min(holders.length, websiteOffer.places), priceMinor: websiteOffer.priceMinor };
}

// ---------------------------------------------------------------- Promo codes

type PromoRow = Doc<"platformPromoCodes">;
type PromoState = "active" | "paused" | "expired" | "used_up";

function promoUses(rows: Doc<"domainRecords">[]): Map<string, number> {
  const uses = new Map<string, number>();
  for (const row of rows) {
    const invoice = record(row.data);
    if (typeof invoice.promoCode !== "string" || invoice.status === "void") continue;
    uses.set(invoice.promoCode, (uses.get(invoice.promoCode) ?? 0) + 1);
  }
  return uses;
}

function promoDiscountOf(row: PromoRow): PromoDiscount {
  return { code: row.code, target: row.target, ...(row.percentOff !== undefined ? { percentOff: row.percentOff } : { amountOffMinor: row.amountOffMinor ?? 0 }) };
}

function promoState(row: PromoRow, uses: number, today: string): PromoState {
  if (!row.active) return "paused";
  if (row.expiresOn && row.expiresOn < today) return "expired";
  if (row.maxRedemptions !== undefined && uses >= row.maxRedemptions) return "used_up";
  return "active";
}

/** Whether a code can be used on an application for this plan, today. */
export async function checkPromo(ctx: ReadContext, rawCode: unknown, plan: PlanName, now: number): Promise<PromoCheck> {
  const code = normalizePromoCode(rawCode);
  if (!validPromoCodeShape(code)) return { valid: false, reason: "not_found" };
  const row = await ctx.db.query("platformPromoCodes").withIndex("by_code", (q) => q.eq("code", code)).unique();
  if (!row) return { valid: false, reason: "not_found" };
  const uses = promoUses(await allPlatformInvoices(ctx)).get(code) ?? 0;
  const state = promoState(row, uses, localDay(now));
  if (state !== "active") return { valid: false, reason: state };
  if (row.plans.length > 0 && !row.plans.includes(plan)) return { valid: false, reason: "plan" };
  return { valid: true, promo: promoDiscountOf(row) };
}

function planName(value: unknown): PlanName | undefined {
  return PLAN_NAMES.includes(value as PlanName) ? value as PlanName : undefined;
}

// ---------------------------------------------------------------- First invoice

async function planPriceMinor(ctx: ReadContext, plan: PlanName): Promise<number> {
  const rows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformPlan")).collect();
  const stored = rows.map((row) => record(row.data)).find((row) => row.name === plan);
  return wholeAtLeast(stored?.priceMinor, 0) ?? findPlan(plan)?.priceMinor ?? 0;
}

/**
 * The invoice a newly set-up gym pays before it can open its workspace. Its
 * term dates are provisional: the paid term starts when RIVET confirms the
 * payment. The website price and any promo code are fixed here, so the gym
 * pays what the invoice says even if the offer changes later.
 */
export async function createFirstInvoice(ctx: MutationCtx, admin: PlatformAdmin, input: { organization: Doc<"organizations">; application: Doc<"gymApplications">; listingPublicId: string; now: number }): Promise<void> {
  const { organization, application, now } = input;
  const cycleKey = `first:${organization.publicId ?? organization._id}`;
  const existing = (await organizationInvoices(ctx, organization._id)).find((row) => record(row.data).cycleKey === cycleKey);
  if (existing) return;
  const plan = organization.subscriptionPlan ?? application.plan;
  const interval: BillingInterval = organization.billingInterval === "annual" ? "annual" : "monthly";
  const settings = await commercialSettings(ctx);
  const allInvoices = await allPlatformInvoices(ctx);
  const freePlaceOpen = settings.websiteOffer.enabled && websitePlaceHolders(allInvoices).length < settings.websiteOffer.places;
  const promoCheck = application.promoCode ? await checkPromo(ctx, application.promoCode, plan, now) : undefined;
  const quote = firstPaymentQuote({
    subscriptionMinor: termPriceMinor(await planPriceMinor(ctx, plan), interval),
    onboardingFeeMinor: organization.onboardingFeeMinor ?? 0,
    website: { requested: application.websiteRequested === true, free: freePlaceOpen, priceMinor: settings.websiteOffer.priceMinor },
    promo: promoCheck?.valid ? promoCheck.promo : undefined,
  });
  const invoiceId = `INV-${crypto.randomUUID()}`;
  const invoice: Data = {
    id: invoiceId,
    gymId: input.listingPublicId,
    gym: organization.name,
    amountMinor: quote.totalMinor,
    amount: amountLabel(quote.totalMinor),
    subtotalMinor: quote.subtotalMinor,
    ...(quote.onboardingFeeMinor > 0 ? { onboardingFeeMinor: quote.onboardingFeeMinor } : {}),
    ...(quote.websiteRequested ? { websiteMinor: quote.websiteMinor, websiteListMinor: quote.websiteListMinor, websiteFree: quote.websiteFree } : {}),
    ...(quote.promo ? {
      promoCode: quote.promo.code,
      promoTarget: quote.promo.target,
      ...(quote.promo.percentOff !== undefined ? { promoPercentOff: quote.promo.percentOff } : { promoAmountOffMinor: quote.promo.amountOffMinor }),
      discountMinor: quote.discountMinor,
      subscriptionDiscountMinor: quote.subscriptionDiscountMinor,
    } : {}),
    // A code that stopped working between the application and set-up is
    // kept visible for the platform team rather than silently dropped.
    ...(application.promoCode && !promoCheck?.valid ? { promoNotApplied: { code: normalizePromoCode(application.promoCode), reason: promoCheck?.reason ?? "not_found" } } : {}),
    currency: "JOD",
    date: iso(now),
    issuedAt: iso(now),
    dueAt: iso(now + PAYMENT_TERM_DAYS * DAY_MS),
    periodStart: iso(now),
    periodEnd: iso(termEnd(now, interval)),
    cycleKey,
    firstPayment: true,
    billingInterval: interval,
    status: "open",
    createdAt: iso(now),
    updatedAt: iso(now),
  };
  await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "platformInvoice", publicId: invoiceId, createdAt: now, updatedAt: now, data: invoice });
  await platformAudit(ctx, admin, {
    action: "invoice.first_payment_created",
    entityType: "platform_invoice",
    entityPublicId: invoiceId,
    entityLabel: invoiceId,
    summary: `First payment invoice for ${organization.name}`,
    after: { amountMinor: quote.totalMinor, subtotalMinor: quote.subtotalMinor, onboardingFeeMinor: quote.onboardingFeeMinor, websiteMinor: quote.websiteMinor, websiteFree: quote.websiteFree, promoCode: quote.promo?.code, discountMinor: quote.discountMinor },
  });
}

// ---------------------------------------------------------------- The gym's payment page

function invoiceView(row: Doc<"domainRecords">, gym: string): Data {
  return { id: row.publicId, gym, ...record(row.data) };
}

function canPay(actor: ActorContext): boolean {
  return actor.role === "owner" || actor.permissions.includes("settings.manage");
}

/** The unpaid invoice to pay next: the one due first. */
function nextUnpaidInvoice(rows: Doc<"domainRecords">[]): Doc<"domainRecords"> | undefined {
  return rows
    .filter((row) => UNPAID_STATUSES.includes(text(record(row.data).status)))
    .sort((left, right) => text(record(left.data).dueAt).localeCompare(text(record(right.data).dueAt)))[0];
}

async function checkoutView(ctx: ReadContext, actor: ActorContext): Promise<Data> {
  const organization = await ctx.db.get(actor.organization._id);
  if (!organization) domainError("NOT_FOUND", "Gym not found.", { correlationId: actor.correlationId });
  const { paymentDetails } = await commercialSettings(ctx);
  const row = nextUnpaidInvoice(await organizationInvoices(ctx, organization._id));
  const dueAt = row ? timestamp(record(row.data).dueAt) : undefined;
  return {
    gym: {
      name: organization.name,
      status: organization.status,
      plan: organization.subscriptionPlan,
      billingInterval: organization.billingInterval ?? "monthly",
      ...(organization.currentPeriodEndsAt !== undefined ? { currentPeriodEndsAt: iso(organization.currentPeriodEndsAt) } : {}),
      timezone: organization.timezone,
    },
    ...(row ? { invoice: invoiceView(row, organization.name) } : {}),
    paymentDetails,
    canPay: canPay(actor),
    // A gym that has never paid has nothing to lose; a paying gym is told
    // the day its access stops if this invoice stays unpaid.
    ...(dueAt !== undefined && organization.status !== "pending_payment" && organization.status !== "suspended" ? { accessEndsAt: iso(dueAt + SUSPENSION_AFTER_DUE_DAYS * DAY_MS) } : {}),
  };
}

const PAYMENT_METHODS = ["cliq", "bank_transfer"] as const;

async function submitPayment(ctx: MutationCtx, input: Data, request: RequestArgs): Promise<Data> {
  const actor = await requireBillingActor(ctx, request);
  if (!canPay(actor)) domainError("FORBIDDEN", "Only the gym owner can send payment details.", { correlationId: actor.correlationId });
  const invoiceId = text(input.invoiceId, 80);
  const row = (await organizationInvoices(ctx, actor.organization._id)).find((candidate) => candidate.publicId === invoiceId);
  if (!row) domainError("NOT_FOUND", "Invoice not found.", { correlationId: actor.correlationId });
  const invoice = record(row.data);
  if (!UNPAID_STATUSES.includes(text(invoice.status))) domainError("CONFLICT", "This invoice is already paid or closed.", { correlationId: actor.correlationId });
  const method = PAYMENT_METHODS.find((candidate) => candidate === input.method);
  const reference = text(input.reference, 80);
  const payerName = text(input.payerName, 120);
  const paidOn = text(input.paidOn, 10);
  const note = text(input.note, 500);
  const fieldErrors: Record<string, string[]> = {};
  if (!method) fieldErrors.method = ["Required"];
  if (reference.length < 3) fieldErrors.reference = ["Required"];
  if (payerName.length < 2) fieldErrors.payerName = ["Required"];
  const today = localDay(Date.now(), actor.organization.timezone || "Asia/Amman");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || paidOn > today) fieldErrors.paidOn = ["Invalid"];
  if (Object.keys(fieldErrors).length > 0) {
    domainError("VALIDATION_ERROR", "Check the payment details and try again.", { fieldErrors, correlationId: actor.correlationId });
  }
  const now = Date.now();
  const claim = {
    status: "submitted",
    method,
    reference,
    payerName,
    paidOn,
    ...(note ? { note } : {}),
    amountMinor: typeof invoice.amountMinor === "number" ? invoice.amountMinor : 0,
    submittedAt: iso(now),
    submittedBy: { id: publicUserId(actor.user), name: actor.user.fullName },
  };
  const before = record(invoice.paymentClaim);
  await ctx.db.patch(row._id, { data: { ...invoice, paymentClaim: claim, updatedAt: iso(now) }, updatedAt: now });
  await platformAudit(ctx, actor, {
    action: "invoice.payment_submitted",
    entityType: "platform_invoice",
    entityPublicId: row.publicId,
    entityLabel: row.publicId,
    summary: `${actor.organization.name} sent payment details`,
    before: Object.keys(before).length > 0 ? before : undefined,
    after: claim,
  });
  await notifyPlatformAdmins(ctx, {
    kind: "platform_payment_submitted",
    title: "Gym payment to confirm",
    body: `${actor.organization.name} · ${amountLabel(claim.amountMinor)}`,
    titleMessage: systemMessage("communicationCompletion.notifications.paymentToConfirm"),
    bodyMessage: systemMessage("communicationCompletion.notifications.facts2", { a: actor.organization.name, b: { amountMinor: claim.amountMinor, currency: "JOD" } }),
    href: `/platform/billing?invoice=${row.publicId}`,
    dedupeKey: `payment-claim:${row.publicId}:${claim.submittedAt}`,
  });
  return await checkoutView(ctx, actor);
}

async function rejectPayment(ctx: MutationCtx, input: Data, request: RequestArgs): Promise<Data> {
  const admin = await requirePlatformAdmin(ctx, request.correlationId);
  requireReason(input.reason, admin.correlationId);
  const reason = input.reason.trim().slice(0, 500);
  const invoiceId = text(input.invoiceId, 80);
  const row = await ctx.db.query("domainRecords").withIndex("by_entity_type_public_id", (q) => q.eq("entityType", "platformInvoice").eq("publicId", invoiceId)).unique();
  if (!row) domainError("NOT_FOUND", "Invoice not found.", { correlationId: admin.correlationId });
  const invoice = record(row.data);
  const claim = record(invoice.paymentClaim);
  if (claim.status !== "submitted") domainError("CONFLICT", "There are no payment details waiting on this invoice.", { correlationId: admin.correlationId });
  const now = Date.now();
  const updatedClaim = { ...claim, status: "rejected", rejectedAt: iso(now), rejectionReason: reason };
  const updated = { ...invoice, paymentClaim: updatedClaim, updatedAt: iso(now) };
  await ctx.db.patch(row._id, { data: updated, updatedAt: now });
  await platformAudit(ctx, admin, {
    action: "invoice.payment_rejected",
    entityType: "platform_invoice",
    entityPublicId: row.publicId,
    entityLabel: row.publicId,
    summary: "Sent payment details back to the gym",
    reason,
    before: claim,
    after: updatedClaim,
  });
  // The owner hears straight away, with our message, rather than finding it
  // the next time someone opens the payment page.
  const owner = await gymOwner(ctx, row.organizationId);
  if (owner) {
    await enqueueOperationalEmail(ctx, {
      organizationId: row.organizationId,
      kind: "platform_payment_returned",
      templateVersion: "platform-payment-returned-v1",
      facts: paymentReturnedFacts(row.publicId, invoice, reason),
      recipientReference: publicUserId(owner),
      recipientEmail: owner.email,
      relatedEntityType: "platform_invoice",
      relatedEntityPublicId: row.publicId,
      // One email for each set of details sent back; details sent again and
      // returned again get their own.
      dedupeKey: `platform-payment-returned:${row.publicId}:${text(claim.submittedAt) || iso(now)}`,
    });
  }
  return { id: row.publicId, ...updated };
}

async function gymOwner(ctx: MutationCtx, organizationId: Id<"organizations">): Promise<Doc<"users"> | null> {
  const memberships = await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
  const owner = memberships.find((membership) => membership.active && membership.role === "owner");
  const user = owner ? await ctx.db.get(owner.userId) : null;
  return user && user.status !== "deactivated" ? user : null;
}

/** The invoice rows the email repeats, under our message. */
function paymentReturnedFacts(invoiceId: string, invoice: Data, message: string): OperationalEmailFacts {
  const when = (value: unknown) => timestamp(value) !== undefined ? value as string : undefined;
  return {
    type: "invoice",
    invoiceNumber: invoiceId,
    amountMinor: typeof invoice.amountMinor === "number" && Number.isSafeInteger(invoice.amountMinor) ? invoice.amountMinor : 0,
    currency: text(invoice.currency) || "JOD",
    periodStart: when(invoice.periodStart),
    periodEnd: when(invoice.periodEnd),
    dueAt: when(invoice.dueAt),
    message,
  };
}

// ---------------------------------------------------------------- The workspace notice

export type BillingNotice = {
  state: "last_day" | "overdue" | "payment_sent";
  periodEndsAt: string;
  invoiceId?: string;
  amountMinor?: number;
  currency?: string;
  /** When access stops if the invoice stays unpaid. */
  accessEndsAt?: string;
  /** RIVET sent the last payment details back. */
  paymentReturned?: boolean;
};

/**
 * What the workspace warns about: the last day of a paid term with nothing
 * paid for the next one, a term that has run out, or payment details RIVET
 * is still checking. Earlier reminders go by email.
 */
export async function billingNotice(ctx: ReadContext, organization: Doc<"organizations">, now: number): Promise<BillingNotice | undefined> {
  if (organization.status !== "active" && organization.status !== "past_due") return undefined;
  const end = organization.currentPeriodEndsAt;
  if (end === undefined) return undefined;
  const rows = await organizationInvoices(ctx, organization._id);
  const paidAhead = rows.some((row) => {
    const invoice = record(row.data);
    return invoice.status === "paid" && (timestamp(invoice.periodEnd) ?? 0) > end;
  });
  if (paidAhead) return undefined;
  const timeZone = organization.timezone || "Asia/Amman";
  const lastDay = now < end && localDay(now, timeZone) === localDay(end - 1, timeZone);
  if (!lastDay && now < end) return undefined;
  const unpaid = nextUnpaidInvoice(rows);
  const invoice = unpaid ? record(unpaid.data) : undefined;
  const claim = record(invoice?.paymentClaim);
  const dueAt = timestamp(invoice?.dueAt);
  return {
    state: claim.status === "submitted" ? "payment_sent" : lastDay ? "last_day" : "overdue",
    periodEndsAt: iso(end),
    ...(unpaid && invoice ? { invoiceId: unpaid.publicId, amountMinor: typeof invoice.amountMinor === "number" ? invoice.amountMinor : undefined, currency: text(invoice.currency) || "JOD" } : {}),
    accessEndsAt: iso((dueAt ?? end) + SUSPENSION_AFTER_DUE_DAYS * DAY_MS),
    ...(claim.status === "rejected" ? { paymentReturned: true } : {}),
  };
}

// ---------------------------------------------------------------- Platform console

function promoView(row: PromoRow, uses: number, today: string): Data {
  return {
    id: row.publicId,
    code: row.code,
    note: row.note,
    target: row.target,
    ...(row.percentOff !== undefined ? { percentOff: row.percentOff } : { amountOffMinor: row.amountOffMinor ?? 0 }),
    plans: row.plans,
    ...(row.maxRedemptions !== undefined ? { maxRedemptions: row.maxRedemptions } : {}),
    ...(row.expiresOn ? { expiresOn: row.expiresOn } : {}),
    active: row.active,
    uses,
    state: promoState(row, uses, today),
    createdAt: iso(row.createdAt),
  };
}

async function commerceView(ctx: ReadContext): Promise<Data> {
  const settings = await commercialSettings(ctx);
  const invoices = await allPlatformInvoices(ctx);
  const holders = websitePlaceHolders(invoices);
  const uses = promoUses(invoices);
  const today = localDay(Date.now());
  const codes = (await ctx.db.query("platformPromoCodes").collect()).sort((left, right) => right.createdAt - left.createdAt);
  return {
    websiteOffer: {
      ...settings.websiteOffer,
      claimed: Math.min(holders.length, settings.websiteOffer.places),
      holders: holders.map((holder, index) => ({ place: index + 1, gym: holder.gym, invoiceId: holder.invoiceId, status: holder.status, issuedAt: holder.issuedAt })),
    },
    paymentDetails: settings.paymentDetails,
    promoCodes: codes.map((row) => promoView(row, uses.get(row.code) ?? 0, today)),
  };
}

function boundedPlaces(value: unknown, correlationId: string): number {
  const places = wholeAtLeast(value, 0);
  if (places === undefined || places > 100) domainError("VALIDATION_ERROR", "Places must be a whole number from 0 to 100.", { fieldErrors: { places: ["Invalid"] }, correlationId });
  return places;
}

async function updateWebsiteOffer(ctx: MutationCtx, input: Data, request: RequestArgs): Promise<Data> {
  const admin = await requirePlatformAdmin(ctx, request.correlationId);
  requireReason(input.reason, admin.correlationId);
  const current = await commercialSettings(ctx);
  const priceMinor = wholeAtLeast(input.priceMinor, 0);
  if (priceMinor === undefined || priceMinor > 10_000_000) domainError("VALIDATION_ERROR", "Enter a website price in dinars.", { fieldErrors: { priceMinor: ["Invalid"] }, correlationId: admin.correlationId });
  const websiteOffer = { enabled: input.enabled !== false, places: boundedPlaces(input.places, admin.correlationId), priceMinor };
  await saveCommercialSettings(ctx, { ...current, websiteOffer }, admin.user._id);
  await platformAudit(ctx, admin, {
    action: "commerce.website_offer_update",
    entityType: "platform_setting",
    entityPublicId: SETTINGS_KEY,
    entityLabel: "Website offer",
    summary: "Changed the website offer",
    reason: input.reason.trim(),
    before: current.websiteOffer,
    after: websiteOffer,
  });
  return await commerceView(ctx);
}

async function updatePaymentDetails(ctx: MutationCtx, input: Data, request: RequestArgs): Promise<Data> {
  const admin = await requirePlatformAdmin(ctx, request.correlationId);
  requireReason(input.reason, admin.correlationId);
  const current = await commercialSettings(ctx);
  const paymentDetails: PaymentDetails = {
    cliqAlias: text(input.cliqAlias, 80),
    cliqName: text(input.cliqName, 120),
    bankName: text(input.bankName, 120),
    accountName: text(input.accountName, 120),
    iban: text(input.iban, 40).toUpperCase().replace(/\s+/g, ""),
    note: text(input.note, 500),
  };
  if (paymentDetails.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(paymentDetails.iban)) {
    domainError("VALIDATION_ERROR", "Check the IBAN.", { fieldErrors: { iban: ["Invalid"] }, correlationId: admin.correlationId });
  }
  await saveCommercialSettings(ctx, { ...current, paymentDetails }, admin.user._id);
  await platformAudit(ctx, admin, {
    action: "commerce.payment_details_update",
    entityType: "platform_setting",
    entityPublicId: SETTINGS_KEY,
    entityLabel: "Payment details",
    summary: "Changed where gyms send payments",
    reason: input.reason.trim(),
    before: current.paymentDetails,
    after: paymentDetails,
  });
  return await commerceView(ctx);
}

async function createPromo(ctx: MutationCtx, input: Data, request: RequestArgs): Promise<Data> {
  const admin = await requirePlatformAdmin(ctx, request.correlationId);
  requireReason(input.reason, admin.correlationId);
  const code = normalizePromoCode(input.code);
  const fieldErrors: Record<string, string[]> = {};
  if (!validPromoCodeShape(code)) fieldErrors.code = ["Invalid"];
  else if (await ctx.db.query("platformPromoCodes").withIndex("by_code", (q) => q.eq("code", code)).unique()) fieldErrors.code = ["Taken"];
  const target = PROMO_TARGETS.find((candidate) => candidate === input.target) as PromoTarget | undefined;
  if (!target) fieldErrors.target = ["Required"];
  const percentOff = wholeAtLeast(input.percentOff, 1);
  const amountOffMinor = wholeAtLeast(input.amountOffMinor, 1);
  if ((percentOff === undefined) === (amountOffMinor === undefined) || (percentOff !== undefined && percentOff > 100)) fieldErrors.discount = ["Invalid"];
  const plans = Array.isArray(input.plans) ? [...new Set(input.plans.map(planName).filter((plan): plan is PlanName => Boolean(plan)))] : [];
  const maxRedemptions = input.maxRedemptions === undefined || input.maxRedemptions === null ? undefined : wholeAtLeast(input.maxRedemptions, 1);
  if (input.maxRedemptions !== undefined && input.maxRedemptions !== null && maxRedemptions === undefined) fieldErrors.maxRedemptions = ["Invalid"];
  const expiresOn = text(input.expiresOn, 10);
  if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) fieldErrors.expiresOn = ["Invalid"];
  if (Object.keys(fieldErrors).length > 0) domainError("VALIDATION_ERROR", "Check the highlighted fields and try again.", { fieldErrors, correlationId: admin.correlationId });
  const now = Date.now();
  const row = {
    publicId: crypto.randomUUID(),
    code,
    note: text(input.note, 200),
    target: target!,
    ...(percentOff !== undefined ? { percentOff } : { amountOffMinor: amountOffMinor! }),
    plans,
    ...(maxRedemptions !== undefined ? { maxRedemptions } : {}),
    ...(expiresOn ? { expiresOn } : {}),
    active: true,
    createdByUserId: admin.user._id,
    createdAt: now,
    updatedAt: now,
  };
  await ctx.db.insert("platformPromoCodes", row);
  await platformAudit(ctx, admin, {
    action: "promo.create",
    entityType: "platform_promo",
    entityPublicId: row.publicId,
    entityLabel: code,
    summary: `Created promo code ${code}`,
    reason: input.reason.trim(),
    after: { code, target: row.target, percentOff, amountOffMinor, plans, maxRedemptions, expiresOn: expiresOn || undefined },
  });
  return await commerceView(ctx);
}

async function setPromoActive(ctx: MutationCtx, input: Data, request: RequestArgs): Promise<Data> {
  const admin = await requirePlatformAdmin(ctx, request.correlationId);
  requireReason(input.reason, admin.correlationId);
  const row = await ctx.db.query("platformPromoCodes").withIndex("by_public_id", (q) => q.eq("publicId", text(input.promoId, 80))).unique();
  if (!row) domainError("NOT_FOUND", "Promo code not found.", { correlationId: admin.correlationId });
  const active = input.active === true;
  if (row.active !== active) {
    await ctx.db.patch(row._id, { active, updatedAt: Date.now() });
    await platformAudit(ctx, admin, {
      action: active ? "promo.resume" : "promo.pause",
      entityType: "platform_promo",
      entityPublicId: row.publicId,
      entityLabel: row.code,
      summary: `${active ? "Resumed" : "Paused"} promo code ${row.code}`,
      reason: input.reason.trim(),
      before: { active: row.active },
      after: { active },
    });
  }
  return await commerceView(ctx);
}

// ---------------------------------------------------------------- Dispatch

export async function commerceQuery(ctx: QueryCtx, operation: string, input: Data, request: RequestArgs): Promise<unknown> {
  if (operation === "public.websiteOffer") return await websiteOfferView(ctx);
  if (operation === "public.promo.check") {
    const plan = planName(input.plan) ?? "Starter";
    const result = await checkPromo(ctx, input.code, plan, Date.now());
    return result.valid ? result : { valid: false, reason: result.reason };
  }
  if (operation === "platform.commerce.view") {
    await requirePlatformAdmin(ctx, request.correlationId);
    return await commerceView(ctx);
  }
  if (operation === "billing.checkout") return await checkoutView(ctx, await requireBillingActor(ctx, request));
  domainError("NOT_FOUND", "Unknown operation.");
}

export async function commerceMutation(ctx: MutationCtx, operation: string, input: Data, request: RequestArgs): Promise<unknown> {
  if (operation === "platform.commerce.website_offer.update") return await updateWebsiteOffer(ctx, input, request);
  if (operation === "platform.commerce.payment_details.update") return await updatePaymentDetails(ctx, input, request);
  if (operation === "platform.promo.create") return await createPromo(ctx, input, request);
  if (operation === "platform.promo.set_active") return await setPromoActive(ctx, input, request);
  if (operation === "platform.invoice.payment_reject") return await rejectPayment(ctx, input, request);
  if (operation === "billing.payment.submit") return await submitPayment(ctx, input, request);
  domainError("NOT_FOUND", "Unknown operation.");
}
