import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { enqueueOperationalEmail } from "./operationalEmail";

type BillingInterval = "monthly" | "annual";
type PlatformPlan = "Starter" | "Growth" | "Pro" | "Enterprise";

const DAY_MS = 86_400_000;
const INVOICE_LEAD_DAYS = 3;
const PAYMENT_GRACE_DAYS = 2;
const DEFAULT_PLAN_PRICES: Record<PlatformPlan, number> = {
  Starter: 79_000,
  Growth: 149_000,
  Pro: 249_000,
  Enterprise: 500_000,
};
const SYSTEM_AUDIT_ACTOR_PUBLIC_ID = "system:subscription-reconciliation";
const SYSTEM_AUDIT_ACTOR_NAME = "RIVET billing automation";

type SystemAuditInput = {
  action: string;
  entityType: string;
  entityPublicId: string;
  entityLabel: string;
  summary: string;
  reason: string;
  cycleKey: string;
  phase: "invoice_created" | "past_due" | "suspended";
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
  return value === "Starter" || value === "Growth" || value === "Pro" || value === "Enterprise" ? value : undefined;
}

function addCalendarMonths(timestamp: number, months: number): number {
  const source = new Date(timestamp);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1, source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.getTime();
}

function addInterval(timestamp: number, interval: BillingInterval): number {
  return addCalendarMonths(timestamp, interval === "annual" ? 12 : 1);
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

function planPrice(data: Record<string, unknown>, plans: Map<string, number>): number {
  const plan = planOf(data.subscriptionPlan);
  if (!plan) return 0;
  return plans.get(plan) ?? DEFAULT_PLAN_PRICES[plan];
}

function annualPrice(monthlyMinor: number): number {
  return Math.round(monthlyMinor * 12 * 0.8);
}

async function ownerRecipient(ctx: MutationCtx, organizationId: Id<"organizations">): Promise<{ reference: string; email?: string } | null> {
  const memberships = await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
  const owner = memberships.find((membership) => membership.active && membership.role === "owner");
  const user = owner ? await ctx.db.get(owner.userId) : null;
  if (!user || user.status === "deactivated") return null;
  return { reference: user.publicId ?? String(user._id), email: user.email };
}

async function queuePlatformEmail(ctx: MutationCtx, input: {
  organizationId: Id<"organizations">;
  kind: "platform_invoice_reminder" | "platform_invoice_past_due" | "platform_subscription_suspended";
  invoiceId: string;
  cycleKey: string;
  recipient: { reference: string; email?: string };
}): Promise<void> {
  const templateVersion = input.kind === "platform_invoice_reminder"
    ? "platform-invoice-reminder-v1"
    : input.kind === "platform_invoice_past_due"
      ? "platform-invoice-past-due-v1"
      : "platform-subscription-suspended-v1";
  const dedupePrefix = input.kind === "platform_invoice_reminder" ? "platform-invoice-reminder" : input.kind === "platform_invoice_past_due" ? "platform-invoice-past-due" : "platform-subscription-suspended";
  await enqueueOperationalEmail(ctx, {
    organizationId: input.organizationId,
    kind: input.kind,
    templateVersion,
    recipientReference: input.recipient.reference,
    recipientEmail: input.recipient.email,
    relatedEntityType: "platform_invoice",
    relatedEntityPublicId: input.invoiceId,
    dedupeKey: `${dedupePrefix}:${input.cycleKey}`,
  });
}

async function reconcileOrganization(ctx: MutationCtx, organization: Doc<"organizations">, now: number, planPrices: Map<string, number>): Promise<{ invoiceCreated: boolean; markedPastDue: boolean; suspended: boolean }> {
  if (!["trial", "active", "past_due"].includes(organization.status)) return { invoiceCreated: false, markedPastDue: false, suspended: false };
  // Keep the original trial boundary available after the status moves to
  // past_due; payment during grace must still settle that same cycle.
  const boundary = organization.trialEndsAt ?? organization.currentPeriodEndsAt;
  if (boundary === undefined || !Number.isFinite(boundary)) return { invoiceCreated: false, markedPastDue: false, suspended: false };
  const interval = intervalOf(organization.billingInterval);
  const periodEnd = addInterval(boundary, interval);
  const orgPublicId = publicId(organization);
  const cycleKey = `subscription:${orgPublicId}:${interval}:${boundary}`;
  const listing = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "marketplaceGym")).first();
  const listingData = listing && listing.data && typeof listing.data === "object" && !Array.isArray(listing.data) ? listing.data as Record<string, unknown> : {};
  const invoiceRows = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "platformInvoice")).collect();
  let invoiceRow = invoiceRows.find((row) => {
    const data = (row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data : {}) as Record<string, unknown>;
    return data.cycleKey === cycleKey;
  });
  const shouldCreate = now >= boundary - INVOICE_LEAD_DAYS * DAY_MS;
  let invoiceCreated = false;
  const recipient = await ownerRecipient(ctx, organization._id);
  if (shouldCreate && !invoiceRow) {
    const plan = planPrice({ subscriptionPlan: organization.subscriptionPlan }, planPrices);
    const amountMinor = interval === "annual" ? annualPrice(plan) : plan;
    const invoiceId = `INV-${crypto.randomUUID()}`;
    const createdAt = Date.now();
    const invoice = {
      id: invoiceId,
      gymId: listing?.publicId,
      gym: organization.name,
      amountMinor,
      amount: amountLabel(amountMinor),
      currency: "JOD",
      date: iso(now),
      issuedAt: iso(now),
      dueAt: iso(boundary),
      periodStart: iso(boundary),
      periodEnd: iso(periodEnd),
      cycleKey,
      billingInterval: interval,
      status: "open",
      createdAt: iso(createdAt),
      updatedAt: iso(createdAt),
    };
    const id = await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "platformInvoice", publicId: invoiceId, createdAt, updatedAt: createdAt, data: invoice });
    invoiceRow = (await ctx.db.get(id)) ?? undefined;
    invoiceCreated = true;
    if (recipient) await queuePlatformEmail(ctx, { organizationId: organization._id, kind: "platform_invoice_reminder", invoiceId, cycleKey, recipient });
    await recordSystemAudit(ctx, {
      action: "subscription.invoice.created",
      entityType: "platform_invoice",
      entityPublicId: invoiceId,
      entityLabel: invoiceId,
      summary: `Automated invoice ${invoiceId} created for ${organization.name}.`,
      reason: `Invoice generated automatically three days before the ${interval} subscription boundary.`,
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
  let markedPastDue = false;
  if (now >= boundary && ["draft", "open"].includes(String(invoice.status))) {
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
  const graceExpired = now >= boundary + PAYMENT_GRACE_DAYS * DAY_MS;
  if (!graceExpired || status === "paid") return { invoiceCreated, markedPastDue, suspended: false };
  const latest = await ctx.db.get(invoiceRow._id);
  const latestData = latest && latest.data && typeof latest.data === "object" && !Array.isArray(latest.data) ? latest.data as Record<string, unknown> : invoice;
  if (["paid", "void"].includes(String(latestData.status)) || organization.status === "suspended" || organization.status === "cancelled") return { invoiceCreated, markedPastDue, suspended: false };
  const updatedAt = Date.now();
  const previousOrganizationStatus = organization.status;
  const previousSubscriptionStatus = listingData.subscriptionStatus;
  const suspensionReason = `Subscription invoice ${invoiceRow.publicId} remained unpaid after the ${PAYMENT_GRACE_DAYS}-day grace period.`;
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
  returns: v.object({ processed: v.number(), invoicesCreated: v.number(), markedPastDue: v.number(), suspended: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const planRows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformPlan")).collect();
    const planPrices = new Map<string, number>();
    for (const row of planRows) {
      const data = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
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
    return { processed: organizations.length, invoicesCreated, markedPastDue, suspended };
  },
});
