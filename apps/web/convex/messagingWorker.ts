import { v } from "convex/values";
import { dueMessageCandidates, type MessageSource } from "./messagingQueue";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
import { marketingSuppressionReason } from "./marketing";
import { consentForRenewalChannel, renewalMessageSuppressionReason } from "./renewalPolicy";
import { notifyOrganizationSupervisors } from "./notificationDelivery";
import { MESSAGE_MAX_ATTEMPTS, MESSAGE_RETRY_MINUTES, parseMessagingAllowlist, resolveMessagingMode, routeMessage, twilioMessageParams, twilioMessagesUrl, twilioRetryable, type MessagingChannel } from "./messagingMode";
import { OPT_OUT_FOOTER, catalogueTemplate, renderMessageTemplate } from "./messagingTemplates";

/**
 * Outbound WhatsApp / SMS worker.
 *
 * Two queues feed it: automation `messageDelivery` records (marketing and
 * operational rules the gym configured) and `renewalDeliveries` (the
 * renewal journey). A row is only leased when its gym switched external
 * delivery on and its send time (quiet-hour deferral included) has passed.
 * The global RIVET_MESSAGING_MODE then decides whether the provider is
 * called, the message is redirected to the sandbox number, or it is
 * suppressed with a reason the gym can read. Every attempt is recorded on
 * the row with the mode and the number it actually went to.
 */
type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Renewal = Doc<"renewalDeliveries">;
const LEASE_MS = 2 * 60_000;

function value(input: unknown): Data {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Data : {};
}

function stringValue(input: unknown, fallback = ""): string {
  return typeof input === "string" ? input : fallback;
}

function optionalString(input: unknown): string | undefined {
  const result = stringValue(input).trim();
  return result || undefined;
}

export interface LeasedMessage {
  source: "automation" | "renewal";
  /** domainRecords _id for automation messages, renewalDeliveries _id for renewals. */
  id: string;
  publicId: string;
  organizationId: Id<"organizations">;
  leaseToken: string;
  channel: MessagingChannel;
  recipientPhone?: string;
  language: "en" | "ar";
  body: string;
  attemptCount: number;
  suppressionReason?: string;
}

async function organizationDeliveryLive(ctx: MutationCtx, organizationId: Id<"organizations">): Promise<boolean> {
  const organization = await ctx.db.get(organizationId);
  if (!organization || !["trial", "active", "past_due"].includes(organization.status)) return false;
  const settings = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationId).eq("entityType", "settings").eq("publicId", "settings")).unique();
  return stringValue(value(value(settings?.data).notifications).automationDeliveryMode, "sandbox") === "live";
}

async function organizationName(ctx: MutationCtx, organizationId: Id<"organizations">): Promise<string> {
  return (await ctx.db.get(organizationId))?.name ?? "Your gym";
}

type DeliveryState = "provider_accepted" | "failed" | "suppressed";

function channelLabel(channel: string): string {
  return channel === "sms" ? "SMS" : "WhatsApp";
}

/**
 * What the member record shows for an automated message. "Accepted by the
 * provider" is the strongest claim RIVET can make without a status webhook;
 * it is never written as "delivered". Failures and suppressions are written
 * too, so a reminder that never left is visible next to the calls that did.
 */
async function recordDeliveryOutcomeOnTimeline(ctx: MutationCtx, input: {
  organizationId: Id<"organizations">;
  branchId?: Id<"branches">;
  memberPublicId?: string;
  leadPublicId?: string;
  channel: string;
  context: string;
  state: DeliveryState;
  mode: string;
  attempts: number;
  reason?: string;
  providerMessageId?: string;
  source: "automation" | "renewal";
  deliveryPublicId: string;
  now: number;
}): Promise<void> {
  if (!input.memberPublicId && !input.leadPublicId) return;
  const organization = await ctx.db.get(input.organizationId);
  const label = channelLabel(input.channel);
  const title = input.state === "provider_accepted"
    ? `${label} ${input.context} accepted by the provider`
    : input.state === "failed"
      ? `${label} ${input.context} failed`
      : `${label} ${input.context} not sent`;
  const body = input.state === "provider_accepted"
    ? input.mode === "sandbox"
      ? "Redirected to RIVET's sandbox number (sandbox mode). The member did not receive it."
      : "Handed to the messaging provider. Delivery to the phone is not confirmed by RIVET."
    : input.state === "failed"
      ? `Failed after ${input.attempts} attempt${input.attempts === 1 ? "" : "s"}${input.reason ? ` (${input.reason})` : ""}. Managers were notified; follow up by phone.`
      : input.reason ?? "Suppressed by RIVET's messaging rules.";
  await ctx.db.insert("domainRecords", {
    organizationId: input.organizationId,
    entityType: "timeline",
    publicId: `MESSAGE-TIMELINE-${crypto.randomUUID()}`,
    branchId: input.branchId,
    memberPublicId: input.memberPublicId,
    leadPublicId: input.leadPublicId,
    createdAt: input.now,
    updatedAt: input.now,
    data: {
      id: `MESSAGE-TIMELINE-${crypto.randomUUID()}`,
      organizationId: organization?.publicId ?? String(input.organizationId),
      memberId: input.memberPublicId,
      leadId: input.leadPublicId,
      type: "message",
      title,
      body,
      occurredAt: new Date(input.now).toISOString(),
      meta: { channel: input.channel, deliveryState: input.state, mode: input.mode, source: input.source, deliveryId: input.deliveryPublicId, providerMessageId: input.providerMessageId, attempts: input.attempts },
    },
  });
}

/** Where a manager should land after a failure: the person, not a settings page. */
function attentionHref(memberPublicId?: string, leadPublicId?: string): string {
  return memberPublicId ? `/members/${memberPublicId}` : leadPublicId ? `/crm/leads/${leadPublicId}` : "/settings?section=notifications";
}

async function memberVariables(ctx: MutationCtx, organizationId: Id<"organizations">, memberPublicId: string | undefined, leadPublicId: string | undefined): Promise<{ variables: Record<string, string>; phone?: string; language: "en" | "ar"; recipient: Data }> {
  const record = memberPublicId
    ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationId).eq("entityType", "member").eq("publicId", memberPublicId)).unique()
    : leadPublicId
      ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationId).eq("entityType", "lead").eq("publicId", leadPublicId)).unique()
      : null;
  const data = value(record?.data);
  const name = stringValue(data.fullName) || stringValue(data.name) || "there";
  const language = stringValue(data.preferredLanguage) === "ar" ? "ar" as const : "en" as const;
  return { variables: { member_name: name, end_date: stringValue(data.endDate), branch_name: stringValue(data.branchName) }, phone: optionalString(data.phone), language, recipient: data };
}

async function automationBody(ctx: MutationCtx, organizationId: Id<"organizations">, message: Data, language: "en" | "ar", variables: Record<string, string>): Promise<string> {
  const gymName = await organizationName(ctx, organizationId);
  const templateId = optionalString(message.templateId);
  const templateKey = optionalString(message.templateKey);
  let body = "";
  if (templateId) {
    const template = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationId).eq("entityType", "template").eq("publicId", templateId)).unique();
    const data = value(template?.data);
    body = language === "ar" ? stringValue(data.bodyAr) || stringValue(data.bodyEn) : stringValue(data.bodyEn) || stringValue(data.bodyAr);
  }
  if (!body && templateKey) {
    const template = catalogueTemplate(templateKey);
    if (template) body = language === "ar" ? template.bodyAr : template.bodyEn;
  }
  if (!body) body = language === "ar" ? `لديك تحديث من ${gymName}. تواصل مع الكاونتر للتفاصيل.` : `You have an update from ${gymName}. Contact the front desk for details.`;
  const rendered = renderMessageTemplate(body, { ...variables, gym_name: gymName });
  return stringValue(message.messageClass) === "marketing" ? `${rendered}\n${OPT_OUT_FOOTER[language]}` : rendered;
}

function renewalBody(gymName: string, delivery: Renewal, member: Data, language: "en" | "ar"): string {
  const key = delivery.checkpointKey === "14_day" || delivery.checkpointKey === "7_day" ? "renewal_7d" : delivery.checkpointKey === "3_day" ? "renewal_3d" : "renewal_today";
  const template = catalogueTemplate(key)!;
  return renderMessageTemplate(language === "ar" ? template.bodyAr : template.bodyEn, { member_name: stringValue(member.fullName) || "there", gym_name: gymName, end_date: delivery.membershipEndDate, branch_name: stringValue(member.branchName) || gymName });
}

export const leaseDue = internalMutation({
  args: { limit: v.number() },
  handler: async (ctx, args): Promise<LeasedMessage[]> => {
    const now = Date.now();
    const leased: LeasedMessage[] = [];
    const limit = Number.isSafeInteger(args.limit) ? Math.max(0, Math.min(args.limit, 50)) : 0;
    if (limit === 0) return leased;
    const liveCache = new Map<string, boolean>();
    const isLive = async (organizationId: Id<"organizations">) => {
      const key = String(organizationId);
      if (!liveCache.has(key)) liveCache.set(key, await organizationDeliveryLive(ctx, organizationId));
      return liveCache.get(key)!;
    };

    const state = await ctx.db.query("messagingWorkerState").withIndex("by_key", q => q.eq("key", "outbound")).unique();
    let nextSource: MessageSource = state?.nextSource ?? "automation";
    const candidates = await dueMessageCandidates(ctx, now, nextSource);
    for (const candidate of candidates) {
      if (leased.length >= limit) break;
      if (!(await isLive(candidate.row.organizationId))) {
        // Move disabled/quiet gyms out of the due window. Bounded scans can
        // then reach later gyms without dropping or sending deferred work.
        if (candidate.source === "automation") {
          const data = value(candidate.row.data);
          const deferred = now + 5 * 60_000;
          await ctx.db.patch(candidate.row._id, { data: { ...data, ...(data.status === "leased" ? { leaseExpiresAt: deferred } : { nextAttemptAt: new Date(deferred).toISOString() }) } });
        } else await ctx.db.patch(candidate.row._id, { nextAttemptAt: now + 5 * 60_000 });
        continue;
      }
      if (candidate.source === "automation") {
        const record = candidate.row;
        const data = value(record.data);
        const leaseToken = crypto.randomUUID();
        const member = await memberVariables(ctx, record.organizationId, record.memberPublicId, record.leadPublicId);
        const language = stringValue(data.language) === "ar" ? "ar" as const : member.language;
        const body = await automationBody(ctx, record.organizationId, data, language, member.variables);
        await ctx.db.patch(record._id, { data: { ...data, status: "leased", leaseToken, leaseExpiresAt: now + LEASE_MS }, updatedAt: now });
        leased.push({ source: "automation", id: String(record._id), publicId: record.publicId, organizationId: record.organizationId, leaseToken, channel: stringValue(data.requestedChannel, "whatsapp") === "sms" ? "sms" : "whatsapp", recipientPhone: optionalString(data.recipientPhone) ?? member.phone, language, body, attemptCount: Array.isArray(data.attempts) ? data.attempts.length : 0, suppressionReason: data.messageClass === "marketing" ? marketingSuppressionReason(member.recipient) : undefined });
      } else {
        const row = candidate.row;
        const leaseToken = crypto.randomUUID();
        const memberRecord = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", row.organizationId).eq("entityType", "member").eq("publicId", row.memberPublicId)).unique();
        const gymName = await organizationName(ctx, row.organizationId);
        // A lease is a short exclusive hold: the status stays queued but the
        // next attempt moves forward so a concurrent run skips the row.
        await ctx.db.patch(row._id, { leaseToken, nextAttemptAt: now + LEASE_MS, updatedAt: now });
        leased.push({ source: "renewal", id: String(row._id), publicId: row.publicId, organizationId: row.organizationId, leaseToken, channel: row.channel as MessagingChannel, recipientPhone: row.recipientPhone, language: row.language, body: renewalBody(gymName, row, value(memberRecord?.data), row.language), attemptCount: row.attempts.length, suppressionReason: renewalMessageSuppressionReason(consentForRenewalChannel(value(memberRecord?.data), row.channel as MessagingChannel).status, row.recipientPhone) });
      }
      nextSource = candidate.source === "automation" ? "renewal" : "automation";
    }
    if (leased.length) {
      if (state) await ctx.db.patch(state._id, { nextSource });
      else await ctx.db.insert("messagingWorkerState", { key: "outbound", nextSource });
    }
    return leased;
  },
});

export const recordAttempt = internalMutation({
  args: {
    source: v.union(v.literal("automation"), v.literal("renewal")),
    id: v.string(),
    leaseToken: v.string(),
    accepted: v.boolean(),
    retryable: v.boolean(),
    mode: v.string(),
    deliveredTo: v.optional(v.string()),
    providerMessageId: v.optional(v.string()),
    statusCode: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    suppressionReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const suppressed = Boolean(args.suppressionReason);
    if (args.source === "automation") {
      const record = await ctx.db.get(args.id as Id<"domainRecords">);
      if (!record || record.entityType !== "messageDelivery") return null;
      const data = value(record.data);
      if (data.status !== "leased" || data.leaseToken !== args.leaseToken) return null;
      const attempts = [...(Array.isArray(data.attempts) ? data.attempts : []), { attempt: (Array.isArray(data.attempts) ? data.attempts.length : 0) + 1, status: suppressed ? "suppressed" : args.accepted ? "sent" : "failed", occurredAt: new Date(now).toISOString(), reason: args.suppressionReason ?? args.errorCode, mode: args.mode, deliveredTo: args.deliveredTo, providerMessageId: args.providerMessageId, statusCode: args.statusCode }];
      const exhausted = attempts.length >= MESSAGE_MAX_ATTEMPTS;
      const status = suppressed ? "suppressed" : args.accepted ? "sent" : args.retryable && !exhausted ? "retrying" : "failed";
      const nextAttemptAt = status === "retrying" ? new Date(now + (MESSAGE_RETRY_MINUTES[Math.min(attempts.length - 1, MESSAGE_RETRY_MINUTES.length - 1)] ?? 30) * 60_000).toISOString() : undefined;
      await ctx.db.patch(record._id, { data: { ...data, status, attempts, nextAttemptAt, leaseToken: undefined, leaseExpiresAt: undefined, suppressionReason: args.suppressionReason ?? data.suppressionReason, providerMessageId: args.providerMessageId ?? data.providerMessageId, sentAt: status === "sent" ? new Date(now).toISOString() : data.sentAt, deliveryMode: args.mode, deliveredTo: args.deliveredTo ?? data.deliveredTo }, updatedAt: now });
      const channel = stringValue(data.requestedChannel, "whatsapp");
      if (status === "failed") await notifyOrganizationSupervisors(ctx, { organizationId: record.organizationId, branchId: record.branchId, kind: "message_delivery_failed", title: "A member message could not be sent", body: `${channel} message failed after ${attempts.length} attempts (${args.errorCode ?? "provider error"}).`, href: attentionHref(record.memberPublicId, record.leadPublicId), dedupeKey: `message-failed:${record.publicId}` });
      if (status !== "retrying") {
        await recordDeliveryOutcomeOnTimeline(ctx, { organizationId: record.organizationId, branchId: record.branchId, memberPublicId: record.memberPublicId, leadPublicId: record.leadPublicId, channel, context: "message", state: status === "sent" ? "provider_accepted" : status === "failed" ? "failed" : "suppressed", mode: args.mode, attempts: attempts.length, reason: args.suppressionReason ?? args.errorCode, providerMessageId: args.providerMessageId, source: "automation", deliveryPublicId: record.publicId, now });
      }
      return null;
    }
    const row = await ctx.db.get(args.id as Id<"renewalDeliveries">);
    if (!row || row.status !== "queued" || row.leaseToken !== args.leaseToken) return null;
    const attempts = [...row.attempts, { attemptedAt: now, outcome: suppressed ? "suppressed" as const : args.accepted ? "accepted" as const : args.retryable ? "retryable_failure" as const : "terminal_failure" as const, statusCode: args.statusCode, errorCode: args.errorCode, providerMessageId: args.providerMessageId }];
    const exhausted = attempts.length >= MESSAGE_MAX_ATTEMPTS;
    const status: Renewal["status"] = suppressed ? "suppressed" : args.accepted ? "sent" : args.retryable && !exhausted ? "queued" : "failed";
    await ctx.db.patch(row._id, { status, attempts, leaseToken: undefined, lastAttemptAt: now, lastErrorCode: args.errorCode, nextAttemptAt: status === "queued" ? now + (MESSAGE_RETRY_MINUTES[Math.min(attempts.length - 1, MESSAGE_RETRY_MINUTES.length - 1)] ?? 30) * 60_000 : undefined, sentAt: status === "sent" ? now : row.sentAt, suppressionReason: args.suppressionReason ?? row.suppressionReason, updatedAt: now });
    await ctx.db.insert("renewalDeliveryEvents", { publicId: `RENEWAL-EVENT-${crypto.randomUUID()}`, organizationId: row.organizationId, branchId: row.branchId, deliveryPublicId: row.publicId, membershipPublicId: row.membershipPublicId, memberPublicId: row.memberPublicId, eventType: "provider_attempt", beforeStatus: "queued", afterStatus: status, reason: args.suppressionReason ?? args.errorCode, details: { mode: args.mode, deliveredTo: args.deliveredTo, providerMessageId: args.providerMessageId, statusCode: args.statusCode, channel: row.channel }, source: "system", occurredAt: now });
    // The renewal journey gets the same visibility as automation messages: a
    // final failure reaches the managers, and every terminal outcome is on the
    // member's timeline beside the calls staff actually made.
    if (status === "failed") await notifyOrganizationSupervisors(ctx, { organizationId: row.organizationId, branchId: row.branchId, kind: "message_delivery_failed", title: "A renewal reminder could not be sent", body: `${row.channel} renewal reminder failed after ${attempts.length} attempts (${args.errorCode ?? "provider error"}). Call the member instead.`, href: attentionHref(row.memberPublicId), dedupeKey: `renewal-failed:${row.publicId}` });
    if (status !== "queued") {
      await recordDeliveryOutcomeOnTimeline(ctx, { organizationId: row.organizationId, branchId: row.branchId, memberPublicId: row.memberPublicId, channel: row.channel, context: "renewal reminder", state: status === "sent" ? "provider_accepted" : status === "failed" ? "failed" : "suppressed", mode: args.mode, attempts: attempts.length, reason: args.suppressionReason ?? args.errorCode, providerMessageId: args.providerMessageId, source: "renewal", deliveryPublicId: row.publicId, now });
    }
    return null;
  },
});

export const processDue = internalAction({
  args: {},
  returns: v.object({ processed: v.number(), disabled: v.boolean() }),
  handler: async (ctx) => {
    const resolution = resolveMessagingMode();
    if (resolution.mode === "off") return { processed: 0, disabled: true };
    const sandboxTo = process.env.RIVET_MESSAGING_SANDBOX_TO;
    const allowlist = parseMessagingAllowlist(process.env.RIVET_MESSAGING_ALLOWLIST);
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? "";
    const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
    const messages = await ctx.runMutation(internal.messagingWorker.leaseDue, { limit: 25 }) as LeasedMessage[];
    let processed = 0;
    for (const message of messages) {
      const route = routeMessage({ mode: resolution.mode, channel: message.channel, recipient: message.recipientPhone, sandboxTo, allowlist, resolution });
      if (message.suppressionReason || route.decision === "drop") {
        await ctx.runMutation(internal.messagingWorker.recordAttempt, { source: message.source, id: message.id, leaseToken: message.leaseToken, accepted: false, retryable: false, mode: resolution.mode, suppressionReason: message.suppressionReason ?? (route.decision === "drop" ? route.reason : undefined) });
        processed += 1;
        continue;
      }
      const body = route.decision === "redirect" ? `[sandbox → ${route.originalRecipient}] ${message.body}` : message.body;
      let accepted = false;
      let retryable = true;
      let providerMessageId: string | undefined;
      let statusCode: number | undefined;
      let errorCode: string | undefined;
      try {
        const response = await fetch(twilioMessagesUrl(accountSid), {
          method: "POST",
          headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: twilioMessageParams({ channel: message.channel, to: route.to, body }).toString(),
        });
        statusCode = response.status;
        accepted = response.ok;
        retryable = twilioRetryable(response.status);
        if (response.ok) {
          const payload = await response.json() as { sid?: string };
          providerMessageId = payload.sid;
          if (!providerMessageId) { accepted = false; retryable = true; errorCode = "provider_response_missing_sid"; }
        } else errorCode = `provider_http_${response.status}`;
      } catch {
        errorCode = "provider_network_error";
      }
      await ctx.runMutation(internal.messagingWorker.recordAttempt, { source: message.source, id: message.id, leaseToken: message.leaseToken, accepted, retryable, mode: resolution.mode, deliveredTo: route.to, providerMessageId, statusCode, errorCode });
      processed += 1;
    }
    return { processed, disabled: false };
  },
});
