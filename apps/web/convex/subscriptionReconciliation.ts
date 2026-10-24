import { submittedPayment } from "./subscriptionInvoiceProtection";
import { notifyPlatformAdmins } from "./notificationDelivery";
import { systemMessage } from "../src/lib/i18n/system-messages";
import { addOnMonthlyPrice, validateAddOns, subscriptionInvoiceLines } from "./subscriptionAddOns";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { enqueueOperationalEmail } from "./operationalEmail";
import { PLAN_CATALOGUE, LEGACY_PLAN_CATALOGUE, isCurrentPlan, COMMERCIAL_TERMS_VERSION, gymMonthlyPriceMinor, termPriceMinor } from "./planCatalogue";
import { pendingOnboardingFee } from "./onboardingBilling";
import { DAY_MS, INVOICE_LEAD_DAYS, PAYMENT_TERM_DAYS, RENEWAL_REMINDER_DAYS, SUSPENSION_AFTER_DUE_DAYS, termEnd, type BillingInterval } from "./subscriptionTerm";

type PlatformPlan = "Basic" | "Starter" | "Growth" | "Pro" | "Enterprise";

/** The published prices, should a deployment's catalog row be missing. */
const DEFAULT_PLAN_PRICES: Record<PlatformPlan, number> = Object.fromEntries([...PLAN_CATALOGUE, ...LEGACY_PLAN_CATALOGUE].map((plan) => [plan.name, plan.priceMinor])) as Record<PlatformPlan, number>;
const SYSTEM_AUDIT_ACTOR_PUBLIC_ID = "system:subscription-reconciliation";
const SYSTEM_AUDIT_ACTOR_NAME = "RIVET billing automation";
const RECONCILIATION_ENABLED_ENV = "RIVET_SUBSCRIPTION_RECONCILIATION_ENABLED";

function reconciliationEnabled(): boolean {
  return process.env[RECONCILIATION_ENABLED_ENV] === "1";
}

function subscriptionBoundary(organization: Doc<"organizations">): number | undefined {
  // Once a trial has ended, the paid period boundary is authoritative. This
  // avoids reconciling an old trial boundary for an active organization.
  const boundary = organization.status === "trial"
    ? organization.trialEndsAt
    : organization.currentPeriodEndsAt ?? organization.trialEndsAt;
  return boundary !== undefined && Number.isFinite(boundary) ? boundary : undefined;
}

type ReconciliationDecision = {
  boundary: number;
  /** The day payment is due: the day the invoice is raised plus the payment term. */
  dueAt: number;
  cycleKey: string;
  invoiceRow?: Doc<"domainRecords">;
  shouldCreate: boolean;
  shouldMarkPastDue: boolean;
  shouldSuspend: boolean;
  shouldReview: boolean;
};

async function reconciliationDecision(
  ctx: Pick<QueryCtx, "db"> | Pick<MutationCtx, "db">,
  organization: Doc<"organizations">,
  now: number,
): Promise<ReconciliationDecision | undefined> {
  if (!["trial", "active", "past_due"].includes(organization.status)) return undefined;
  const boundary = subscriptionBoundary(organization);
  if (boundary === undefined) return undefined;
  const interval = intervalOf(organization.billingInterval);
  const cycleKey = `subscription:${publicId(organization)}:${interval}:${boundary}`;
  const invoiceRows = await ctx.db
    .query("domainRecords")
    .withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "platformInvoice"))
    .collect();
  const invoiceRow = invoiceRows.find((row) => {
    const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
    return data.cycleKey === cycleKey;
  });
  const invoice = invoiceRow?.data && typeof invoiceRow.data === "object" && !Array.isArray(invoiceRow.data)
    ? invoiceRow.data as Record<string, unknown>
    : undefined;
  const currentStatus = invoice ? String(invoice.status) : undefined;
  const shouldCreate = !invoiceRow && now >= boundary - INVOICE_LEAD_DAYS * DAY_MS;
  // The agreement gives the gym 14 days to pay from the day the invoice is
  // raised, so the due date, not the term boundary, is what the clock counts
  // from. An invoice this run is about to create is dated now.
  const dueAt = invoice === undefined
    ? now + PAYMENT_TERM_DAYS * DAY_MS
    : Date.parse(String(invoice.dueAt ?? "")) || boundary;
  const shouldMarkPastDue = !shouldCreate && now >= dueAt && (currentStatus === "draft" || currentStatus === "open");
  const effectiveStatus = shouldMarkPastDue ? "past_due" : currentStatus;
  const enforcementDue = Boolean(invoiceRow)
    && now >= dueAt + SUSPENSION_AFTER_DUE_DAYS * DAY_MS
    && !["paid", "void"].includes(String(effectiveStatus))
    && organization.status !== "suspended"
    && organization.status !== "cancelled";
  const shouldReview = enforcementDue && submittedPayment(invoice ?? {});
  const shouldSuspend = enforcementDue && !shouldReview;
  return { boundary, cycleKey, invoiceRow, dueAt, shouldCreate, shouldMarkPastDue, shouldSuspend, shouldReview };
}

type SystemAuditInput = {
  action: string;
  entityType: string;
  entityPublicId: string;
  entityLabel: string;
  summary: string;
  reason: string;
  cycleKey: string;
  phase: "invoice_created" | "past_due" | "suspended" | "payment_review";
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  occurredAt: number;
};

async function recordSystemAudit(ctx: MutationCtx, input: SystemAuditInput): Promise<void> {
  const correlationId = `${SYSTEM_AUDIT_ACTOR_PUBLIC_ID}:${input.phase}:${input.cycleKey}`;
  const existing = await ctx.db
    .query("platformAuditEvents")
    .withIndex("by_entity", (q) => q.eq("entityType", input.entityType).eq("entityPublicId", input.entityPublicId))
    .collect();
  if (existing.some((event) => event.correlationId === correlationId)) return;
  await ctx.db.insert("platformAuditEvents", {
    publicId: crypto.randomUUID(),
    actorPublicId: SYSTEM_AUDIT_ACTOR_PUBLIC_ID,
    actorName: SYSTEM_AUDIT_ACTOR_NAME,
    action: input.action,
    entityType: input.entityType,
    entityPublicId: input.entityPublicId,
    entityLabel: input.entityLabel,
    summary: input.summary,
    reason: input.reason,
    before: input.before,
    after: input.after,
    correlationId,
    occurredAt: input.occurredAt,
  });
}

function intervalOf(value: unknown): BillingInterval {
  return value === "annual" ? "annual" : "monthly";
}

function planOf(value: unknown): PlatformPlan | undefined {
  return value === "Basic" || value === "Starter" || value === "Growth" || value === "Pro" || value === "Enterprise" ? value : undefined;
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function publicId(value: { publicId?: string; _id: string }): string {
  return value.publicId ?? String(value._id);
}

function amountLabel(amountMinor: number): string {
  return `JOD ${(amountMinor / 1_000).toFixed(3)}`;
}

/** The gym's monthly price: its own quote on Enterprise, else the catalogue's. */
function planPrice(organization: Pick<Doc<"organizations">, "subscriptionPlan" | "quotedPriceMinor">, plans: Map<string, number>): number {
  const plan = planOf(organization.subscriptionPlan);
  if (!plan) return 0;
  return gymMonthlyPriceMinor(plan, plans.get(plan) ?? DEFAULT_PLAN_PRICES[plan], organization.quotedPriceMinor);
}

async function ownerRecipient(ctx: MutationCtx, organizationId: Id<"organizations">): Promise<{ reference: string; email?: string } | null> {
  const memberships = await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
  const owner = memberships.find((membership) => membership.active && membership.role === "owner");
  const user = owner ? await ctx.db.get(owner.userId) : null;
  if (!user || user.status === "deactivated") return null;
  return { reference: user.publicId ?? String(user._id), email: user.email };
}

type PlatformEmailKind = "platform_invoice_issued" | "platform_invoice_reminder" | "platform_invoice_past_due" | "platform_subscription_suspended";

const TEMPLATE_VERSIONS: Record<PlatformEmailKind, string> = {
  platform_invoice_issued: "platform-invoice-issued-auto-v1",
  platform_invoice_reminder: "platform-invoice-reminder-v2",
  platform_invoice_past_due: "platform-invoice-past-due-v1",
  platform_subscription_suspended: "platform-subscription-suspended-v1",
};

/** The invoice rows an email shows: number, amount, term and due date. */
function invoiceFacts(invoiceId: string, invoice: Record<string, unknown>) {
  const amountMinor = invoice.amountMinor;
  if (typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor)) return undefined;
  const when = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : undefined;
  return { type: "invoice" as const, invoiceNumber: invoiceId, amountMinor, currency: typeof invoice.currency === "string" ? invoice.currency : "JOD", periodStart: when(invoice.periodStart), periodEnd: when(invoice.periodEnd), dueAt: when(invoice.dueAt) };
}

async function queuePlatformEmail(ctx: MutationCtx, input: {
  organizationId: Id<"organizations">;
  kind: PlatformEmailKind;
  invoiceId: string;
  cycleKey: string;
  recipient: { reference: string; email?: string };
  invoice?: Record<string, unknown>;
  /** Separates several emails of one kind for one cycle, such as each reminder. */
  dedupeSuffix?: string;
}): Promise<void> {
  const facts = input.invoice ? invoiceFacts(input.invoiceId, input.invoice) : undefined;
  await enqueueOperationalEmail(ctx, {
    organizationId: input.organizationId,
    kind: input.kind,
    templateVersion: TEMPLATE_VERSIONS[input.kind],
    recipientReference: input.recipient.reference,
    recipientEmail: input.recipient.email,
    relatedEntityType: "platform_invoice",
    relatedEntityPublicId: input.invoiceId,
    ...(facts ? { facts } : {}),
    dedupeKey: `${input.kind.replace(/_/g, "-")}:${input.cycleKey}${input.dedupeSuffix ? `:${input.dedupeSuffix}` : ""}`,
  });
}

/**
 * The reminder due now for a term that ends at `boundary`: the latest of the
 * 7, 3 and 1 day marks already passed. A job that starts late sends only the
 * nearest one rather than all three at once.
 */
export function renewalReminderDay(boundary: number, now: number): number | undefined {
  if (now >= boundary) return undefined;
  const passed = RENEWAL_REMINDER_DAYS.filter((days) => now >= boundary - days * DAY_MS);
  return passed.length > 0 ? Math.min(...passed) : undefined;
}

async function reconcileOrganization(ctx: MutationCtx, organization: Doc<"organizations">, now: number, planPrices: Map<string, number>): Promise<{ invoiceCreated: boolean; markedPastDue: boolean; suspended: boolean }> {
  const decision = await reconciliationDecision(ctx, organization, now);
  if (!decision) return { invoiceCreated: false, markedPastDue: false, suspended: false };
  const { boundary, cycleKey, dueAt } = decision;
  const interval = intervalOf(organization.billingInterval);
  const periodEnd = termEnd(boundary, interval);
  const orgPublicId = publicId(organization);
  const listing = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "marketplaceGym")).first();
  const listingData = listing && listing.data && typeof listing.data === "object" && !Array.isArray(listing.data) ? listing.data as Record<string, unknown> : {};
  let invoiceRow = decision.invoiceRow;
  let invoiceCreated = false;
  const recipient = await ownerRecipient(ctx, organization._id);
  if (decision.shouldCreate && !invoiceRow) {
    const plan = planPrice(organization, planPrices);
    const onboardingFeeMinor = await pendingOnboardingFee(ctx, organization);
    const addOns = validateAddOns(organization.subscriptionAddOns, organization.subscriptionPlan);
    const amountMinor = termPriceMinor(plan + addOnMonthlyPrice(addOns), interval) + onboardingFeeMinor;
    const invoiceId = `INV-${crypto.randomUUID()}`;
    const createdAt = Date.now();
    const invoice = {
      id: invoiceId,
      gymId: listing?.publicId,
      gym: organization.name,
      amountMinor,
      ...(onboardingFeeMinor > 0 ? { onboardingFeeMinor, subtotalMinor: amountMinor } : {}),
      amount: amountLabel(amountMinor),
      currency: "JOD",
      date: iso(now),
      issuedAt: iso(now),
      dueAt: iso(dueAt),
      periodStart: iso(boundary),
      periodEnd: iso(periodEnd),
      cycleKey,
      billingInterval: interval,
      addOns,
      lines: subscriptionInvoiceLines(plan, addOns, interval),
      status: "open",
      createdAt: iso(createdAt),
      updatedAt: iso(createdAt),
    };
    const id = await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "platformInvoice", publicId: invoiceId, createdAt, updatedAt: createdAt, data: invoice });
    invoiceRow = (await ctx.db.get(id)) ?? undefined;
    invoiceCreated = true;
    if (recipient) await queuePlatformEmail(ctx, { organizationId: organization._id, kind: "platform_invoice_issued", invoiceId, cycleKey, recipient, invoice });
    await recordSystemAudit(ctx, {
      action: "subscription.invoice.created",
      entityType: "platform_invoice",
      entityPublicId: invoiceId,
      entityLabel: invoiceId,
      summary: `Automated invoice ${invoiceId} created for ${organization.name}.`,
      reason: `Invoice generated automatically ${INVOICE_LEAD_DAYS} days before the ${interval} subscription boundary, payable within ${PAYMENT_TERM_DAYS} days.`,
      cycleKey,
      phase: "invoice_created",
      before: { invoiceStatus: null, cycleKey },
      after: { invoiceId, invoiceStatus: "open", amountMinor, billingInterval: interval, dueAt: invoice.dueAt, periodEnd: invoice.periodEnd, cycleKey },
      occurredAt: now,
    });
  }
  if (!invoiceRow) return { invoiceCreated, markedPastDue: false, suspended: false };
  const invoice = (invoiceRow.data && typeof invoiceRow.data === "object" && !Array.isArray(invoiceRow.data) ? invoiceRow.data : {}) as Record<string, unknown>;
  // A platform operator may void an automated cycle as a deliberate ledger
  // exception. Preserve that decision and never recreate the same cycle.
  if (String(invoice.status) === "void") return { invoiceCreated, markedPastDue: false, suspended: false };
  // Reminders 7, 3 and 1 days before the paid term ends, while the renewal is
  // unpaid and the gym has not already sent its payment details.
  const reminderDay = renewalReminderDay(boundary, now);
  const claimSent = invoice.paymentClaim && typeof invoice.paymentClaim === "object" && (invoice.paymentClaim as Record<string, unknown>).status === "submitted";
  if (reminderDay !== undefined && recipient && ["draft", "open"].includes(String(invoice.status)) && !claimSent) {
    await queuePlatformEmail(ctx, { organizationId: organization._id, kind: "platform_invoice_reminder", invoiceId: invoiceRow.publicId, cycleKey, recipient, invoice, dedupeSuffix: `${reminderDay}d` });
  }
  let markedPastDue = false;
  if (now >= dueAt && ["draft", "open"].includes(String(invoice.status))) {
    const updatedAt = Date.now();
    const previousOrganizationStatus = organization.status;
    const previousSubscriptionStatus = listingData.subscriptionStatus;
    const previousInvoiceStatus = String(invoice.status);
    const pastDueReason = `Subscription invoice ${invoiceRow.publicId} is due.`;
    const updated = { ...invoice, status: "past_due", pastDueAt: iso(now), updatedAt: iso(updatedAt) };
    await ctx.db.patch(invoiceRow._id, { data: updated, updatedAt });
    await ctx.db.patch(organization._id, { status: "past_due", subscriptionStatusReason: pastDueReason, updatedAt });
    if (listing) {
      await ctx.db.patch(listing._id, { data: { ...listingData, subscriptionStatus: "overdue", subscriptionStatusReason: pastDueReason }, updatedAt });
    }
    markedPastDue = true;
    if (recipient) await queuePlatformEmail(ctx, { organizationId: organization._id, kind: "platform_invoice_past_due", invoiceId: invoiceRow.publicId, cycleKey, recipient });
    await recordSystemAudit(ctx, {
      action: "subscription.invoice.past_due",
      entityType: "platform_invoice",
      entityPublicId: invoiceRow.publicId,
      entityLabel: invoiceRow.publicId,
      summary: `Automated invoice ${invoiceRow.publicId} was marked past due.`,
      reason: pastDueReason,
      cycleKey,
      phase: "past_due",
      before: { invoiceStatus: previousInvoiceStatus, organizationStatus: previousOrganizationStatus, subscriptionStatus: previousSubscriptionStatus, cycleKey },
      after: { invoiceStatus: "past_due", organizationStatus: "past_due", subscriptionStatus: "overdue", cycleKey },
      occurredAt: now,
    });
  }
  const status = markedPastDue ? "past_due" : String(invoice.status);
  const graceExpired = now >= dueAt + SUSPENSION_AFTER_DUE_DAYS * DAY_MS;
  if (!graceExpired || status === "paid") return { invoiceCreated, markedPastDue, suspended: false };
  const latest = await ctx.db.get(invoiceRow._id);
  const latestData = latest && latest.data && typeof latest.data === "object" && !Array.isArray(latest.data) ? latest.data as Record<string, unknown> : invoice;
  if (["paid", "void"].includes(String(latestData.status)) || organization.status === "suspended" || organization.status === "cancelled") return { invoiceCreated, markedPastDue, suspended: false };
  if (submittedPayment(latestData)) {
    // Keep the original due/past-due clocks. A returned claim is enforceable
    // on the next run; submitting again never manufactures a new grace period.
    await notifyPlatformAdmins(ctx, {
      kind: "platform_payment_submitted",
      title: "Gym payment to confirm",
      titleMessage: systemMessage("communicationCompletion.notifications.paymentToConfirm"),
      body: `${organization.name} · ${invoiceRow.publicId}`,
      bodyMessage: systemMessage("communicationCompletion.notifications.facts2", { a: organization.name, b: invoiceRow.publicId }),
      href: `/platform/billing?invoice=${invoiceRow.publicId}`,
      dedupeKey: `subscription-payment-review:${cycleKey}`,
    });
    await recordSystemAudit(ctx, {
      action: "subscription.payment_review_required", entityType: "platform_invoice", entityPublicId: invoiceRow.publicId, entityLabel: invoiceRow.publicId,
      summary: "Automatic suspension withheld: submitted payment requires operator review.",
      reason: "Confirm or return the existing payment claim; the original due date and enforcement clock remain unchanged.",
      cycleKey, phase: "payment_review", before: { invoiceStatus: latestData.status, dueAt: iso(dueAt) },
      after: { reviewRequired: true, dueAt: iso(dueAt) }, occurredAt: now,
    });
    return { invoiceCreated, markedPastDue, suspended: false };
  }
  const updatedAt = Date.now();
  const previousOrganizationStatus = organization.status;
  const previousSubscriptionStatus = listingData.subscriptionStatus;
  const suspensionReason = `Subscription invoice ${invoiceRow.publicId} remained unpaid ${SUSPENSION_AFTER_DUE_DAYS} days past its due date, after written notice.`;
  await ctx.db.patch(organization._id, { status: "suspended", subscriptionStatusReason: suspensionReason, updatedAt });
  if (listing) {
    await ctx.db.patch(listing._id, { data: { ...listingData, subscriptionStatus: "suspended", isPublic: false, subscriptionStatusReason: suspensionReason }, updatedAt });
  }
  if (recipient) await queuePlatformEmail(ctx, { organizationId: organization._id, kind: "platform_subscription_suspended", invoiceId: invoiceRow.publicId, cycleKey, recipient });
  await recordSystemAudit(ctx, {
    action: "subscription.suspended",
    entityType: "platform_gym",
    entityPublicId: listing?.publicId ?? orgPublicId,
    entityLabel: organization.name,
    summary: `Automated suspension applied to ${organization.name}.`,
    reason: suspensionReason,
    cycleKey,
    phase: "suspended",
    before: { invoiceStatus: String(latestData.status), organizationStatus: previousOrganizationStatus, subscriptionStatus: previousSubscriptionStatus, isPublic: listing ? Boolean(listingData.isPublic) : null, cycleKey },
    after: { invoiceStatus: String(latestData.status), organizationStatus: "suspended", subscriptionStatus: "suspended", isPublic: false, cycleKey },
    occurredAt: now,
  });
  return { invoiceCreated, markedPastDue, suspended: true };
}

/**
 * Reconciles the platform subscription clock. This mutation is intentionally
 * internal: the cron is the operator, and manual invoice rows without a cycle
 * key are never altered by this process.
 */
export const reconcile = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({ enabled: v.boolean(), processed: v.number(), invoicesCreated: v.number(), markedPastDue: v.number(), suspended: v.number() }),
  handler: async (ctx, args) => {
    if (!reconciliationEnabled()) {
      return { enabled: false, processed: 0, invoicesCreated: 0, markedPastDue: 0, suspended: 0 };
    }
    const now = args.now ?? Date.now();
    const planRows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformPlan")).collect();
    const planPrices = new Map<string, number>();
    for (const row of planRows) {
      const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
      if (isCurrentPlan(data.name) && data.commercialTermsVersion !== COMMERCIAL_TERMS_VERSION) continue;
      if (typeof data.name === "string" && typeof data.priceMinor === "number") planPrices.set(data.name, data.priceMinor);
    }
    const organizations = await ctx.db.query("organizations").collect();
    let invoicesCreated = 0;
    let markedPastDue = 0;
    let suspended = 0;
    for (const organization of organizations) {
      const result = await reconcileOrganization(ctx, organization, now, planPrices);
      if (result.invoiceCreated) invoicesCreated += 1;
      if (result.markedPastDue) markedPastDue += 1;
      if (result.suspended) suspended += 1;
    }
    return { enabled: true, processed: organizations.length, invoicesCreated, markedPastDue, suspended };
  },
});

/**
 * Read-only aggregate preview for operators. It intentionally returns counts
 * and boundary timestamps only: no tenant names, invoice identifiers, or
 * customer data are exposed through release diagnostics.
 */
export const preview = internalQuery({
  args: { now: v.optional(v.number()) },
  returns: v.object({
    enabled: v.boolean(),
    processed: v.number(),
    eligible: v.number(),
    invoicesToCreate: v.number(),
    invoicesToMarkPastDue: v.number(),
    organizationsToSuspend: v.number(),
    paymentReviewsRequired: v.number(),
    earliestBoundary: v.optional(v.number()),
    latestBoundary: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const organizations = await ctx.db.query("organizations").collect();
    let eligible = 0;
    let invoicesToCreate = 0;
    let invoicesToMarkPastDue = 0;
    let organizationsToSuspend = 0;
    let paymentReviewsRequired = 0;
    let earliestBoundary: number | undefined;
    let latestBoundary: number | undefined;
    for (const organization of organizations) {
      const decision = await reconciliationDecision(ctx, organization, now);
      if (!decision) continue;
      eligible += 1;
      if (decision.shouldCreate) invoicesToCreate += 1;
      if (decision.shouldMarkPastDue) invoicesToMarkPastDue += 1;
      if (decision.shouldSuspend) organizationsToSuspend += 1;
      if (decision.shouldReview) paymentReviewsRequired += 1;
      earliestBoundary = earliestBoundary === undefined ? decision.boundary : Math.min(earliestBoundary, decision.boundary);
      latestBoundary = latestBoundary === undefined ? decision.boundary : Math.max(latestBoundary, decision.boundary);
    }
    return {
      enabled: reconciliationEnabled(),
      processed: organizations.length,
      eligible,
      invoicesToCreate,
      invoicesToMarkPastDue,
      organizationsToSuspend,
      paymentReviewsRequired,
      ...(earliestBoundary === undefined ? {} : { earliestBoundary }),
      ...(latestBoundary === undefined ? {} : { latestBoundary }),
    };
  },
});
