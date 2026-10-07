import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { notifyOrganizationSupervisors } from "./notificationDelivery";
import { parseEmailAllowlist, resolveEmailMode, routeEmail, sandboxSubject } from "./emailMode";
import { attachmentSizeLabel, renderBrandedEmail, type EmailAudience, type EmailRow, type EmailStatusTone } from "./emailTemplate";
import { createTranslator, type TKey } from "../src/lib/i18n/core";
import { makeFormatters } from "../src/lib/i18n/formatters";
import { resolveRecipientLanguage, type CommunicationLanguageSource } from "../src/lib/i18n/communication";
import { systemMessage } from "../src/lib/i18n/system-messages";
import { communicationCompletion as enCommunication } from "../src/lib/i18n/messages/en/communicationCompletion";
import { domain as enDomain } from "../src/lib/i18n/messages/en/domain";
import { resolveBrandColor } from "./brand";
import { BRAND_CONTACT } from "./brandTokens";
import { findPlan } from "./planCatalogue";

const RETRY_MINUTES = [1, 5, 30] as const;
const MAX_ATTEMPTS = RETRY_MINUTES.length + 1;
const LEASE_MS = 2 * 60 * 1000;
const OPERATIONAL_EMAIL_QUOTA_TIME_ZONE = "Asia/Amman";
const MEMBER_OPERATIONAL_EMAIL_QUOTA_KINDS = new Set([
  "trial_request_confirmation",
  "trial_status",
  "payment_receipt",
  "renewal_reminder",
  "membership_expiry",
  "pt_package_paid",
  "pt_booking_confirmation",
  "pt_booking_update",
  "pt_booking_reminder",
  "pt_low_balance",
]);
const AMMAN_DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: OPERATIONAL_EMAIL_QUOTA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

type Language = "en" | "ar";
type MessageClass = "service" | "marketing";
type Delivery = Doc<"operationalEmailDeliveries">;
/**
 * The copy catalogue that rendered a stored message. Stored bytes are what a
 * retry sends, so a later catalogue edit never reaches a queued message; this
 * records which wording it carries.
 */
export const OPERATIONAL_EMAIL_COPY_VERSION = "communication-2026-10-03";

const MANDATORY_PLATFORM_KINDS = new Set(["platform_invoice_issued", "platform_invoice_reminder", "platform_invoice_paid", "platform_invoice_past_due", "platform_subscription_suspended", "platform_subscription_cancelled", "subscription_agreement_signed", "subscription_agreement_countersigned", "subscription_agreement_copy"]);

function providerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
}

/** The worker runs in every mode except off, and only with a configured provider. */
function deliveryEnabled(): boolean {
  return resolveEmailMode().mode !== "off" && providerConfigured();
}

export interface QueueOperationalEmailInput {
  organizationId?: Id<"organizations">;
  branchId?: Id<"branches">;
  kind: string;
  templateVersion: string;
  /** The recipient's language, resolved by the caller from the recipient's own record. */
  language?: Language;
  languageSource?: CommunicationLanguageSource;
  recipientReference: string;
  recipientEmail?: string;
  relatedEntityType?: string;
  relatedEntityPublicId?: string;
  dedupeKey: string;
  messageClass?: MessageClass;
  suppressionReason?: string;
  subject?: string;
  html?: string;
  text?: string;
  attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>;
  facts?: OperationalEmailFacts;
}

function utcIso(value: number): string {
  return new Date(value).toISOString();
}

function cleanEmail(value: string | undefined): string | undefined {
  const email = value?.trim().toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
}

function acceptedProviderRecipient(delivery: Delivery | null): string | undefined {
  if (!delivery) return undefined;
  const acceptedAttempt = [...delivery.attempts].reverse().find((attempt) => attempt.outcome === "accepted");
  if (!acceptedAttempt) return undefined;
  return cleanEmail(acceptedAttempt.deliveredTo)
    ?? (acceptedAttempt.mode === "live" || acceptedAttempt.mode === "allowlist" ? cleanEmail(delivery.recipientEmail) : undefined);
}

type EmailSuppressionReason = "hard_bounce" | "complaint";

async function findEmailSuppression(ctx: MutationCtx, email: string | undefined) {
  if (!email) return null;
  return await ctx.db.query("operationalEmailSuppressions").withIndex("by_email", (q) => q.eq("email", email)).unique();
}

function publicSuppressionReason(_reason: EmailSuppressionReason): string {
  // Avoid exposing provider records or activity associated with another gym.
  return "This email address is suppressed after a delivery issue";
}

function isHardBounce(bounceType: string | undefined): boolean {
  const type = bounceType?.trim().toLowerCase();
  return type === "permanent" || type === "hard" || type === "hard_bounce";
}

function providerEventRank(eventType: string | undefined): number {
  if (eventType === "email.bounced" || eventType === "email.failed" || eventType === "email.suppressed") return 3;
  if (eventType === "email.complained") return 2;
  if (eventType === "email.delivered") return 1;
  return 0;
}

function ammanDateTimeParts(timestamp: number) {
  const parts = Object.fromEntries(AMMAN_DATE_TIME_FORMAT.formatToParts(new Date(timestamp)).map((part) => [part.type, Number(part.value)]));
  return { year: parts.year ?? 0, month: parts.month ?? 0, day: parts.day ?? 0, hour: parts.hour ?? 0, minute: parts.minute ?? 0, second: parts.second ?? 0 };
}

function ammanMonthWindow(timestamp: number): { periodKey: string; nextPeriodStartAt: number; nextPeriodKey: string } {
  const current = ammanDateTimeParts(timestamp);
  const periodKey = `${current.year}-${String(current.month).padStart(2, "0")}`;
  const nextMonth = current.month === 12 ? 1 : current.month + 1;
  const nextYear = current.month === 12 ? current.year + 1 : current.year;
  const targetWallClockAsUtc = Date.UTC(nextYear, nextMonth - 1, 1);
  let nextPeriodStartAt = targetWallClockAsUtc;
  // Convert local Asia/Amman midnight to UTC without assuming a fixed offset.
  // The second pass accounts for timezone transitions at the month boundary.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = ammanDateTimeParts(nextPeriodStartAt);
    const representedAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const correction = targetWallClockAsUtc - representedAsUtc;
    if (correction === 0) break;
    nextPeriodStartAt += correction;
  }
  return { periodKey, nextPeriodStartAt, nextPeriodKey: `${nextYear}-${String(nextMonth).padStart(2, "0")}` };
}

function validQuotaLimit(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

type ServiceKind = keyof typeof enCommunication.email.kinds;

function isServiceKind(kind: string): kind is ServiceKind {
  return Object.hasOwn(enCommunication.email.kinds, kind);
}

/**
 * Who each message is written for, and where its one action goes. A member
 * reads about their own gym, so the gym leads and its accent colours the
 * button; a gym owner reads about their RIVET account.
 */
const KIND_AUDIENCE: Readonly<Record<string, { audience: EmailAudience; path: string; status?: { key: "pastDue" | "suspended"; tone: EmailStatusTone } }>> = {
  subscription_agreement_signed: { audience: "gym", path: "/settings?section=agreement" },
  subscription_agreement_copy: { audience: "gym", path: "/platform/agreements" },
  subscription_agreement_countersigned: { audience: "gym", path: "/settings?section=agreement" },
  platform_invoice_issued: { audience: "gym", path: "/settings?section=subscription" },
  platform_invoice_reminder: { audience: "gym", path: "/settings?section=subscription" },
  platform_invoice_paid: { audience: "gym", path: "/settings?section=subscription" },
  platform_invoice_past_due: { audience: "gym", path: "/settings?section=subscription", status: { key: "pastDue", tone: "danger" } },
  platform_subscription_suspended: { audience: "gym", path: "/settings?section=subscription", status: { key: "suspended", tone: "danger" } },
  platform_subscription_cancelled: { audience: "gym", path: "/settings?section=subscription" },
  support_acknowledgement: { audience: "gym", path: "/support" },
  support_reply: { audience: "gym", path: "/support" },
  support_resolved: { audience: "gym", path: "/support" },
  trial_request_confirmation: { audience: "member", path: "/customer/my-gyms" },
  trial_status: { audience: "member", path: "/customer/my-gyms" },
  payment_receipt: { audience: "member", path: "/customer/receipts" },
  renewal_reminder: { audience: "member", path: "/customer/my-gyms" },
  membership_expiry: { audience: "member", path: "/customer/my-gyms" },
  pt_package_paid: { audience: "member", path: "/customer/my-gyms" },
  pt_booking_confirmation: { audience: "member", path: "/customer/my-gyms" },
  pt_booking_update: { audience: "member", path: "/customer/my-gyms" },
  pt_booking_reminder: { audience: "member", path: "/customer/my-gyms" },
  pt_low_balance: { audience: "member", path: "/customer/my-gyms" },
};

/** The exact figures a receipt or invoice notice repeats from the authoritative record. */
export type OperationalEmailFacts =
  | { type: "receipt"; receiptNumber: string; amountMinor: number; currency: string; method: string; paidAt: number; outstandingMinor?: number }
  /** Dates are YYYY-MM-DD calendar dates or ISO instants; instants render on the gym's calendar day. */
  | { type: "invoice"; invoiceNumber: string; amountMinor: number; currency: string; periodStart?: string; periodEnd?: string; dueAt?: string };

interface BrandContext {
  gymName?: string;
  accent?: string;
  siteUrl?: string;
  timeZone?: string;
}

function factRows(facts: OperationalEmailFacts | undefined, language: Language, timeZone: string): EmailRow[] | undefined {
  if (!facts) return undefined;
  const t = createTranslator(language);
  const format = makeFormatters(language, "", timeZone);
  const money = (amount: number) => format.money({ amount, currency: facts.currency });
  if (facts.type === "receipt") {
    const methodKey = `domain.paymentMethod.${facts.method}`;
    const method = Object.hasOwn(enDomain.paymentMethod, facts.method) ? t(methodKey as TKey) : facts.method;
    return [
      { label: t("communicationCompletion.email.rows.receiptNumber"), value: facts.receiptNumber, mono: true },
      { label: t("communicationCompletion.email.rows.amountPaid"), value: money(facts.amountMinor), strong: true },
      { label: t("communicationCompletion.email.rows.method"), value: method },
      { label: t("communicationCompletion.email.rows.paidAt"), value: t("communicationCompletion.email.dateTime", { date: format.date(new Date(facts.paidAt).toISOString()), time: format.time(new Date(facts.paidAt).toISOString()) }) },
      ...(facts.outstandingMinor !== undefined ? [{ label: t("communicationCompletion.email.rows.remaining"), value: money(facts.outstandingMinor), strong: true }] : []),
    ];
  }
  const rows: EmailRow[] = [
    { label: t("communicationCompletion.email.rows.invoiceNumber"), value: facts.invoiceNumber, mono: true },
    { label: t("communicationCompletion.email.rows.invoiceAmount"), value: money(facts.amountMinor), strong: true },
  ];
  if (facts.periodStart && facts.periodEnd) rows.push({ label: t("communicationCompletion.email.rows.period"), value: t("communicationCompletion.email.period", { start: format.date(facts.periodStart), end: format.date(facts.periodEnd) }) });
  if (facts.dueAt) rows.push({ label: t("communicationCompletion.email.rows.dueDate"), value: format.date(facts.dueAt) });
  return rows;
}

/**
 * The branded body for a kind that does not supply its own, in the
 * recipient's language. The subject is also the headline: one sentence that
 * says what happened. Rendered once, when the message is queued.
 */
export function operationalEmailContent(kind: string, language: Language, context: BrandContext = {}, attachments?: QueueOperationalEmailInput["attachments"], facts?: OperationalEmailFacts) {
  const t = createTranslator(language);
  const copy = isServiceKind(kind)
    ? { subject: t(`communicationCompletion.email.kinds.${kind}.subject`), body: t(`communicationCompletion.email.kinds.${kind}.body`), action: t(`communicationCompletion.email.kinds.${kind}.action`) }
    : { subject: t("communicationCompletion.email.fallback.subject"), body: t("communicationCompletion.email.fallback.body"), action: t("communicationCompletion.email.fallback.action") };
  const meta = KIND_AUDIENCE[kind] ?? { audience: "gym" as EmailAudience, path: "/dashboard" };
  const siteUrl = (context.siteUrl ?? process.env.RIVET_SITE_URL ?? "https://www.rivetjo.com").replace(/\/$/, "");
  const attachment = attachments?.[0];
  return renderBrandedEmail(copy.subject, {
    language,
    audience: meta.audience,
    headline: copy.subject,
    paragraphs: [copy.body],
    rows: factRows(facts, language, context.timeZone || "UTC"),
    gymName: meta.audience === "member" ? context.gymName : undefined,
    accent: context.accent,
    siteUrl,
    status: meta.status ? { label: t(`communicationCompletion.email.status.${meta.status.key}`), tone: meta.status.tone } : undefined,
    button: { label: copy.action, href: `${siteUrl}${meta.path}` },
    attachment: attachment ? { filename: attachment.filename, sizeLabel: attachmentSizeLabel(attachment.contentBase64.length) } : undefined,
  });
}

async function mirrorDelivery(ctx: MutationCtx, delivery: Delivery) {
  if (!delivery.organizationId) return;
  const existing = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) =>
    q.eq("organizationId", delivery.organizationId!).eq("entityType", "operationalEmailDelivery").eq("publicId", delivery.publicId),
  ).unique();
  const value = {
    id: delivery.publicId,
    kind: delivery.kind,
    messageClass: delivery.messageClass,
    templateVersion: delivery.templateVersion,
    language: delivery.language,
    languageSource: delivery.languageSource,
    copyVersion: delivery.copyVersion,
    recipientReference: delivery.recipientReference,
    recipientEmail: delivery.recipientEmail,
    relatedEntityType: delivery.relatedEntityType,
    relatedEntityPublicId: delivery.relatedEntityPublicId,
    dedupeKey: delivery.dedupeKey,
    providerId: delivery.providerId,
    quotaReservationMonth: delivery.quotaReservationMonth,
    quotaReservedAt: delivery.quotaReservedAt ? utcIso(delivery.quotaReservedAt) : undefined,
    quotaDeferredUntil: delivery.quotaDeferredUntil ? utcIso(delivery.quotaDeferredUntil) : undefined,
    attempts: delivery.attempts.map((attempt) => ({
      attemptedAt: utcIso(attempt.attemptedAt),
      outcome: attempt.outcome,
      statusCode: attempt.statusCode,
      errorCode: attempt.errorCode,
      mode: attempt.mode,
      deliveredTo: attempt.deliveredTo,
    })),
    attachments: delivery.attachments?.map((attachment) => ({ filename: attachment.filename, contentType: attachment.contentType, bytes: Math.floor((attachment.contentBase64.length * 3) / 4) })),
    retryPolicy: { maxAttempts: MAX_ATTEMPTS, backoffMinutes: [...RETRY_MINUTES] },
    nextAttemptAt: delivery.nextAttemptAt ? utcIso(delivery.nextAttemptAt) : undefined,
    status: delivery.status,
    suppressionReason: delivery.suppressionReason,
    lastErrorCode: delivery.lastErrorCode,
    queuedAt: utcIso(delivery.createdAt),
    updatedAt: utcIso(delivery.updatedAt),
  };
  if (existing) await ctx.db.patch(existing._id, { data: value, updatedAt: delivery.updatedAt });
  else await ctx.db.insert("domainRecords", {
    organizationId: delivery.organizationId,
    entityType: "operationalEmailDelivery",
    publicId: delivery.publicId,
    branchId: delivery.branchId,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
    data: value,
  });
}

export async function enqueueOperationalEmail(ctx: MutationCtx, input: QueueOperationalEmailInput): Promise<Delivery> {
  const existing = await ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", input.dedupeKey)).unique();
  if (existing) return existing;
  const now = Date.now();
  const organization = input.organizationId ? await ctx.db.get(input.organizationId) : null;
  // Member-facing mail names the member's language explicitly; anything
  // else addressed to a gym follows the language the gym chose in settings.
  // The operator who triggered the message is never consulted.
  const resolved = input.language
    ? { language: input.language, source: input.languageSource ?? "explicit" as const }
    : resolveRecipientLanguage(undefined, organization?.defaultLanguage);
  const language: Language = resolved.language;
  const brand = organization ? resolveBrandColor(organization.brandPaletteKey, organization.brandPrimaryColor) : undefined;
  const content = operationalEmailContent(input.kind, language, { gymName: organization?.name, accent: brand?.primaryColor, siteUrl: process.env.RIVET_SITE_URL, timeZone: organization?.timezone }, input.attachments, input.facts);
  const recipientEmail = cleanEmail(input.recipientEmail);
  let suppressionReason = input.suppressionReason ?? (!recipientEmail ? "A valid recipient email is not available" : undefined);
  if (!suppressionReason && recipientEmail) {
    const addressSuppression = await findEmailSuppression(ctx, recipientEmail);
    if (addressSuppression) suppressionReason = publicSuppressionReason(addressSuppression.reason);
  }
  if (!suppressionReason) {
    if (!deliveryEnabled()) suppressionReason = resolveEmailMode().mode === "off" ? "Operational email mode is off (RIVET_EMAIL_MODE)" : "The email provider is not configured";
    else if (input.organizationId && !MANDATORY_PLATFORM_KINDS.has(input.kind)) {
      const settings = await ctx.db.query("operationalEmailSettings").withIndex("by_organization", (q) => q.eq("organizationId", input.organizationId!)).unique();
      if (!settings?.ownerConfirmedAt) suppressionReason = "The gym owner has not confirmed operational email preferences";
      else if (!settings.enabledKinds.includes(input.kind)) suppressionReason = "This operational email type is not enabled";
    } else if (!input.organizationId) {
      const enabledKinds = (process.env.RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES ?? "").split(",").map((item) => item.trim()).filter(Boolean);
      if (!enabledKinds.includes(input.kind)) suppressionReason = "This platform operational email type is not enabled";
    }
  }
  const id = await ctx.db.insert("operationalEmailDeliveries", {
    publicId: `EMAIL-${crypto.randomUUID()}`,
    organizationId: input.organizationId,
    branchId: input.branchId,
    kind: input.kind,
    messageClass: input.messageClass ?? "service",
    templateVersion: input.templateVersion,
    language,
    languageSource: resolved.source,
    copyVersion: input.subject || input.html || input.text ? undefined : OPERATIONAL_EMAIL_COPY_VERSION,
    recipientReference: input.recipientReference,
    recipientEmail,
    relatedEntityType: input.relatedEntityType,
    relatedEntityPublicId: input.relatedEntityPublicId,
    subject: input.subject ?? content.subject,
    html: input.html ?? content.html,
    text: input.text ?? content.text,
    attachments: input.attachments,
    dedupeKey: input.dedupeKey,
    attempts: [],
    status: suppressionReason ? "suppressed" : "queued",
    suppressionReason,
    nextAttemptAt: suppressionReason ? undefined : now,
    createdAt: now,
    updatedAt: now,
  });
  const delivery = (await ctx.db.get(id))!;
  await mirrorDelivery(ctx, delivery);
  await syncRelatedApplicationStatus(ctx, delivery);
  return delivery;
}

async function syncRelatedApplicationStatus(ctx: MutationCtx, delivery: Delivery) {
  if (!delivery.relatedEntityPublicId || !["gym_application_submission", "gym_application_review"].includes(delivery.relatedEntityType ?? "")) return;
  const application = await ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", delivery.relatedEntityPublicId!)).unique();
  if (!application) return;
  const related = await ctx.db.query("operationalEmailDeliveries").withIndex("by_related_entity", (q) =>
    q.eq("relatedEntityType", delivery.relatedEntityType).eq("relatedEntityPublicId", delivery.relatedEntityPublicId),
  ).collect();
  const status = related.some((item) => item.status === "failed")
    ? "failed" as const
    : related.length > 0 && related.every((item) => item.status === "delivered")
      ? "sent" as const
      : related.some((item) => item.status === "suppressed")
        ? "not_configured" as const
        : "pending" as const;
  const error = status === "failed"
    ? "One or more durable application emails reached terminal delivery failure."
    : status === "not_configured"
      ? "Application email delivery is sandboxed or not fully configured."
      : undefined;
  if (delivery.relatedEntityType === "gym_application_submission") {
    await ctx.db.patch(application._id, { notificationStatus: status, notificationError: error, updatedAt: Date.now() });
  } else {
    await ctx.db.patch(application._id, { reviewNotificationStatus: status, reviewNotificationError: error, updatedAt: Date.now() });
  }
}

export const enqueue = internalMutation({
  args: {
    organizationId: v.optional(v.id("organizations")),
    branchId: v.optional(v.id("branches")),
    kind: v.string(),
    templateVersion: v.string(),
    language: v.optional(v.union(v.literal("en"), v.literal("ar"))),
    recipientReference: v.string(),
    recipientEmail: v.optional(v.string()),
    relatedEntityType: v.optional(v.string()),
    relatedEntityPublicId: v.optional(v.string()),
    dedupeKey: v.string(),
    messageClass: v.optional(v.union(v.literal("service"), v.literal("marketing"))),
    suppressionReason: v.optional(v.string()),
    subject: v.optional(v.string()),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
  },
  returns: v.object({ publicId: v.string(), status: v.string() }),
  handler: async (ctx, args) => {
    const delivery = await enqueueOperationalEmail(ctx, args);
    return { publicId: delivery.publicId, status: delivery.status };
  },
});

async function kindEnabled(ctx: MutationCtx, delivery: Delivery): Promise<boolean> {
  if (MANDATORY_PLATFORM_KINDS.has(delivery.kind)) return true;
  if (!delivery.organizationId) {
    const kinds = (process.env.RIVET_OPERATIONAL_EMAIL_GLOBAL_TYPES ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    return kinds.includes(delivery.kind);
  }
  const settings = await ctx.db.query("operationalEmailSettings").withIndex("by_organization", (q) => q.eq("organizationId", delivery.organizationId!)).unique();
  return Boolean(settings?.ownerConfirmedAt && settings.enabledKinds.includes(delivery.kind));
}

async function persistedOperationalEmailLimits(ctx: MutationCtx): Promise<Map<string, number>> {
  const rows = await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "platformPlan")).collect();
  const limits = new Map<string, number>();
  for (const row of rows) {
    const value = row.data && typeof row.data === "object" && !Array.isArray(row.data) ? row.data as Record<string, unknown> : {};
    const name = typeof value.name === "string" ? value.name : row.publicId;
    if (validQuotaLimit(value.operationalEmails)) limits.set(name, value.operationalEmails);
  }
  return limits;
}

async function organizationOperationalEmailLimit(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  persistedLimits: ReadonlyMap<string, number>,
  cache: Map<string, number>,
): Promise<number> {
  const key = String(organizationId);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const organization = await ctx.db.get(organizationId);
  const entitlement = organization?.subscriptionPlan
    ? null
    : await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).unique();
  const planName = organization?.subscriptionPlan ?? entitlement?.subscriptionPlan ?? "Starter";
  const starterLimit = findPlan("Starter")?.operationalEmails ?? 600;
  const monthlyLimit = persistedLimits.get(planName) ?? findPlan(planName)?.operationalEmails ?? starterLimit;
  cache.set(key, monthlyLimit);
  return monthlyLimit;
}

async function reserveOperationalEmailQuota(
  ctx: MutationCtx,
  delivery: Delivery,
  now: number,
  monthlyLimit: number,
): Promise<{ allowed: true } | { allowed: false; nextAttemptAt: number; reason: string }> {
  if (!delivery.organizationId || delivery.quotaReservationMonth) return { allowed: true };
  const { periodKey, nextPeriodStartAt, nextPeriodKey } = ammanMonthWindow(now);
  const usage = await ctx.db.query("operationalEmailQuotaUsage").withIndex("by_organization_month", (q) =>
    q.eq("organizationId", delivery.organizationId!).eq("periodKey", periodKey),
  ).unique();
  const reservedCount = usage?.reservedCount ?? 0;
  if (reservedCount >= monthlyLimit) {
    if (usage && usage.monthlyLimit !== monthlyLimit) await ctx.db.patch(usage._id, { monthlyLimit, updatedAt: now });
    return {
      allowed: false,
      nextAttemptAt: nextPeriodStartAt,
      reason: `Monthly member-email limit of ${monthlyLimit} reached; delivery deferred until ${nextPeriodKey} (Asia/Amman).`,
    };
  }
  if (usage) {
    await ctx.db.patch(usage._id, { reservedCount: reservedCount + 1, monthlyLimit, updatedAt: now });
  } else {
    await ctx.db.insert("operationalEmailQuotaUsage", { organizationId: delivery.organizationId, periodKey, reservedCount: 1, monthlyLimit, createdAt: now, updatedAt: now });
  }
  await ctx.db.patch(delivery._id, {
    quotaReservationMonth: periodKey,
    quotaReservedAt: now,
    ...(delivery.quotaDeferredUntil !== undefined ? { quotaDeferredUntil: undefined, suppressionReason: undefined, lastErrorCode: undefined } : {}),
  });
  return { allowed: true };
}

export const leaseDue = internalMutation({
  args: { limit: v.number(), now: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const queued = await ctx.db.query("operationalEmailDeliveries").withIndex("by_status_next_attempt", (q) => q.eq("status", "queued")).collect();
    const retrying = await ctx.db.query("operationalEmailDeliveries").withIndex("by_status_next_attempt", (q) => q.eq("status", "retrying")).collect();
    const expiredLeases = await ctx.db.query("operationalEmailDeliveries").withIndex("by_status_next_attempt", (q) => q.eq("status", "leased")).collect();
    const candidates = [...queued, ...retrying, ...expiredLeases]
      .filter((delivery) => (delivery.nextAttemptAt ?? 0) <= now && (delivery.status !== "leased" || (delivery.leaseExpiresAt ?? 0) <= now))
      .sort((left, right) => (left.nextAttemptAt ?? left.createdAt) - (right.nextAttemptAt ?? right.createdAt));
    const quotaLimits = await persistedOperationalEmailLimits(ctx);
    const quotaLimitByOrganization = new Map<string, number>();
    const mode = resolveEmailMode().mode;
    const sandboxTo = process.env.RIVET_EMAIL_SANDBOX_TO;
    const allowlist = parseEmailAllowlist(process.env.RIVET_EMAIL_ALLOWLIST);
    const leased: Delivery[] = [];
    for (const delivery of candidates.slice(0, Math.max(0, Math.min(args.limit, 50)))) {
      const addressSuppression = await findEmailSuppression(ctx, cleanEmail(delivery.recipientEmail));
      if (addressSuppression) {
        await ctx.db.patch(delivery._id, { status: "suppressed", suppressionReason: publicSuppressionReason(addressSuppression.reason), nextAttemptAt: undefined, leaseToken: undefined, leaseExpiresAt: undefined, updatedAt: now });
        const suppressed = (await ctx.db.get(delivery._id))!;
        await mirrorDelivery(ctx, suppressed);
        await syncRelatedApplicationStatus(ctx, suppressed);
        continue;
      }
      if (!await kindEnabled(ctx, delivery)) {
        await ctx.db.patch(delivery._id, { status: "suppressed", suppressionReason: "This operational email type was disabled before delivery", nextAttemptAt: undefined, leaseToken: undefined, leaseExpiresAt: undefined, updatedAt: now });
        const suppressed = (await ctx.db.get(delivery._id))!;
        await mirrorDelivery(ctx, suppressed);
        await syncRelatedApplicationStatus(ctx, suppressed);
        continue;
      }
      if (delivery.organizationId && MEMBER_OPERATIONAL_EMAIL_QUOTA_KINDS.has(delivery.kind) && delivery.recipientEmail) {
        const route = routeEmail({ mode, kind: delivery.kind, recipient: delivery.recipientEmail, sandboxTo, allowlist });
        // Sandbox mail goes to RIVET; dropped allowlist mail will not reach a
        // member. Neither consumes the gym's production message allowance.
        if (route.decision === "send") {
          const monthlyLimit = await organizationOperationalEmailLimit(ctx, delivery.organizationId, quotaLimits, quotaLimitByOrganization);
          const reservation = await reserveOperationalEmailQuota(ctx, delivery, now, monthlyLimit);
          if (!reservation.allowed) {
            await ctx.db.patch(delivery._id, {
              status: "retrying",
              nextAttemptAt: reservation.nextAttemptAt,
              leaseToken: undefined,
              leaseExpiresAt: undefined,
              quotaDeferredUntil: reservation.nextAttemptAt,
              suppressionReason: reservation.reason,
              lastErrorCode: reservation.reason,
              updatedAt: now,
            });
            const deferred = (await ctx.db.get(delivery._id))!;
            await mirrorDelivery(ctx, deferred);
            await syncRelatedApplicationStatus(ctx, deferred);
            continue;
          }
        }
      }
      const leaseToken = crypto.randomUUID();
      await ctx.db.patch(delivery._id, { status: "leased", leaseToken, leaseExpiresAt: now + LEASE_MS, updatedAt: now });
      leased.push({ ...delivery, status: "leased", leaseToken, leaseExpiresAt: now + LEASE_MS, updatedAt: now });
    }
    return leased;
  },
});

export const recordAttempt = internalMutation({
  args: {
    deliveryId: v.id("operationalEmailDeliveries"),
    leaseToken: v.string(),
    accepted: v.boolean(),
    retryable: v.boolean(),
    providerId: v.optional(v.string()),
    statusCode: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    mode: v.optional(v.string()),
    deliveredTo: v.optional(v.string()),
    suppressionReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery || delivery.status !== "leased" || delivery.leaseToken !== args.leaseToken) return null;
    const now = Date.now();
    const suppressed = Boolean(args.suppressionReason);
    const addressSuppression = !args.accepted && args.retryable && !suppressed
      ? await findEmailSuppression(ctx, cleanEmail(delivery.recipientEmail))
      : null;
    const attempts = [...delivery.attempts, {
      attemptedAt: now,
      outcome: suppressed ? "suppressed" as const : args.accepted ? "accepted" as const : args.retryable ? "retryable_failure" as const : "terminal_failure" as const,
      statusCode: args.statusCode,
      errorCode: args.errorCode,
      mode: args.mode,
      deliveredTo: args.deliveredTo,
    }];
    const exhausted = attempts.length >= MAX_ATTEMPTS;
    const status = suppressed
      ? "suppressed" as const
      : args.accepted
        ? "provider_accepted" as const
        : args.retryable && !exhausted && !addressSuppression
          ? "retrying" as const
          : addressSuppression
            ? "suppressed" as const
            : "failed" as const;
    const nextAttemptAt = status === "retrying" ? now + (RETRY_MINUTES[Math.min(attempts.length - 1, RETRY_MINUTES.length - 1)] ?? RETRY_MINUTES[RETRY_MINUTES.length - 1] ?? 30) * 60_000 : undefined;
    await ctx.db.patch(delivery._id, {
      attempts,
      status,
      providerId: args.providerId ?? delivery.providerId,
      nextAttemptAt,
      leaseToken: undefined,
      leaseExpiresAt: undefined,
      lastErrorCode: args.errorCode,
      ...((suppressed || addressSuppression) ? { suppressionReason: args.suppressionReason ?? publicSuppressionReason(addressSuppression!.reason) } : {}),
      updatedAt: now,
    });
    const updated = (await ctx.db.get(delivery._id))!;
    await mirrorDelivery(ctx, updated);
    await syncRelatedApplicationStatus(ctx, updated);
    if (status === "failed" && delivery.organizationId) {
      await notifyOrganizationSupervisors(ctx, {
        organizationId: delivery.organizationId,
        branchId: delivery.branchId,
        kind: "operational_email_failed",
        title: "A gym email could not be delivered",
        body: `An email could not be delivered after ${attempts.length} attempts. Check email settings.`,
        titleMessage: systemMessage("communicationCompletion.notifications.emailFailed"),
        bodyMessage: systemMessage("communicationCompletion.notifications.emailFailedAttempts", { count: attempts.length }),
        // The automation workspace is intentionally deferred. Email delivery
        // failures belong with the authoritative activation/provider controls.
        href: "/settings?section=email",
        dedupeKey: `operational-email-failed:${delivery.publicId}`,
      });
    }
    return null;
  },
});

export const recordWebhook = internalMutation({
  args: {
    webhookId: v.string(),
    providerId: v.optional(v.string()),
    eventType: v.string(),
    occurredAt: v.number(),
    recipientEmails: v.optional(v.array(v.string())),
    bounceType: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const duplicate = await ctx.db.query("operationalEmailWebhookEvents").withIndex("by_webhook_id", (q) => q.eq("webhookId", args.webhookId)).unique();
    if (duplicate) return null;
    const receivedAt = Date.now();
    await ctx.db.insert("operationalEmailWebhookEvents", { webhookId: args.webhookId, providerId: args.providerId, eventType: args.eventType, occurredAt: args.occurredAt, receivedAt });
    const delivery = args.providerId
      ? await ctx.db.query("operationalEmailDeliveries").withIndex("by_provider_id", (q) => q.eq("providerId", args.providerId)).unique()
      : null;

    const suppressionReason: EmailSuppressionReason | undefined = args.eventType === "email.complained"
      ? "complaint"
      : args.eventType === "email.bounced" && isHardBounce(args.bounceType)
        ? "hard_bounce"
        : undefined;
    if (suppressionReason) {
      const recipients = new Set((args.recipientEmails ?? []).map(cleanEmail).filter((email): email is string => Boolean(email)));
      if (recipients.size === 0) {
        const acceptedRecipient = acceptedProviderRecipient(delivery);
        if (acceptedRecipient) recipients.add(acceptedRecipient);
      }
      for (const email of recipients) {
        const existing = await findEmailSuppression(ctx, email);
        const shouldUpgrade = existing?.reason === "hard_bounce" && suppressionReason === "complaint";
        if (existing && !shouldUpgrade) continue;
        if (existing) {
          await ctx.db.patch(existing._id, { reason: suppressionReason, sourceWebhookId: args.webhookId, providerId: args.providerId, occurredAt: args.occurredAt, updatedAt: receivedAt });
        } else {
          await ctx.db.insert("operationalEmailSuppressions", { email, reason: suppressionReason, sourceWebhookId: args.webhookId, providerId: args.providerId, occurredAt: args.occurredAt, createdAt: receivedAt, updatedAt: receivedAt });
        }
      }
    }
    if (!delivery) return null;
    const nextStatus = args.eventType === "email.delivered"
      ? "delivered" as const
      : args.eventType === "email.complained" || args.eventType === "email.suppressed"
        ? "suppressed" as const
        : ["email.bounced", "email.failed"].includes(args.eventType)
          ? "failed" as const
          : undefined;
    if (!nextStatus) return null;
    const latestEventAt = delivery.providerEventAt;
    const olderEvent = latestEventAt !== undefined && args.occurredAt < latestEventAt;
    const losesTimestampTie = latestEventAt === args.occurredAt && providerEventRank(args.eventType) <= providerEventRank(delivery.providerEventType);
    const followsTerminalSuppression = (delivery.providerEventType === "email.complained" || delivery.providerEventType === "email.suppressed") && args.eventType === "email.delivered";
    if (olderEvent || losesTimestampTie || followsTerminalSuppression) return null;
    await ctx.db.patch(delivery._id, {
      status: nextStatus,
      providerEventAt: args.occurredAt,
      providerEventType: args.eventType,
      lastErrorCode: nextStatus === "failed" ? args.eventType : undefined,
      suppressionReason: nextStatus === "suppressed"
        ? args.eventType === "email.complained" ? "Recipient reported this email as spam" : "The email provider suppressed delivery"
        : undefined,
      updatedAt: receivedAt,
    });
    const updated = (await ctx.db.get(delivery._id))!;
    await mirrorDelivery(ctx, updated);
    await syncRelatedApplicationStatus(ctx, updated);
    if (nextStatus === "failed" && delivery.organizationId) {
      await notifyOrganizationSupervisors(ctx, {
        organizationId: delivery.organizationId,
        branchId: delivery.branchId,
        kind: "operational_email_failed",
        title: "A gym email could not be delivered",
        body: `The email service could not deliver an email. Check email settings.`,
        titleMessage: systemMessage("communicationCompletion.notifications.emailFailed"),
        bodyMessage: systemMessage("communicationCompletion.notifications.emailFailedProvider"),
        href: "/settings?section=email",
        dedupeKey: `operational-email-failed:${delivery.publicId}`,
      });
    }
    return null;
  },
});

export const processDue = internalAction({
  args: {},
  returns: v.object({ processed: v.number(), disabled: v.boolean() }),
  handler: async (ctx) => {
    if (!deliveryEnabled()) return { processed: 0, disabled: true };
    const { mode } = resolveEmailMode();
    const sandboxTo = process.env.RIVET_EMAIL_SANDBOX_TO;
    const allowlist = parseEmailAllowlist(process.env.RIVET_EMAIL_ALLOWLIST);
    const apiKey = process.env.RESEND_API_KEY!.trim();
    const from = process.env.RESEND_FROM_EMAIL!.trim();
    const deliveries = await ctx.runMutation(internal.operationalEmail.leaseDue, { limit: 25 }) as Delivery[];
    let processed = 0;
    for (const delivery of deliveries) {
      if (!delivery.leaseToken || !delivery.recipientEmail) continue;
      // The mode decides where the message may go. Sandbox never reaches the
      // real inbox; allowlist drops with a reason the gym can read; both are
      // recorded on the attempt so an audit shows exactly what happened.
      const route = routeEmail({ mode, kind: delivery.kind, recipient: delivery.recipientEmail, sandboxTo, allowlist });
      if (route.decision === "drop") {
        await ctx.runMutation(internal.operationalEmail.recordAttempt, { deliveryId: delivery._id, leaseToken: delivery.leaseToken, accepted: false, retryable: false, mode, suppressionReason: route.reason });
        processed += 1;
        continue;
      }
      const to = route.to;
      const subject = route.decision === "redirect" ? sandboxSubject(delivery.subject, route.originalRecipient) : delivery.subject;
      let accepted = false;
      let retryable = true;
      let providerId: string | undefined;
      let statusCode: number | undefined;
      let errorCode: string | undefined;
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": delivery.dedupeKey },
          body: JSON.stringify({
            from,
            to: [to],
            subject,
            html: delivery.html,
            text: delivery.text,
            // Operational messages use a no-reply sender, so route replies
            // to RIVET's monitored address unless an environment override is set.
            reply_to: process.env.RESEND_REPLY_TO_EMAIL?.trim() || BRAND_CONTACT.email,
            ...(delivery.attachments?.length ? { attachments: delivery.attachments.map((attachment) => ({ filename: attachment.filename, content: attachment.contentBase64, content_type: attachment.contentType })) } : {}),
          }),
        });
        statusCode = response.status;
        accepted = response.ok;
        retryable = response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500;
        if (response.ok) {
          const payload = await response.json() as { id?: string };
          providerId = payload.id;
          if (!providerId) {
            accepted = false;
            retryable = true;
            errorCode = "provider_response_missing_id";
          }
        } else errorCode = `provider_http_${response.status}`;
      } catch {
        errorCode = "provider_network_error";
      }
      await ctx.runMutation(internal.operationalEmail.recordAttempt, { deliveryId: delivery._id, leaseToken: delivery.leaseToken, accepted, retryable, providerId, statusCode, errorCode, mode, deliveredTo: to });
      processed += 1;
    }
    return { processed, disabled: false };
  },
});
