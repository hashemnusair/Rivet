import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, type MutationCtx } from "./_generated/server";
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
}

async function organizationDeliveryLive(ctx: MutationCtx, organizationId: Id<"organizations">): Promise<boolean> {
  const settings = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationId).eq("entityType", "settings").eq("publicId", "settings")).unique();
  return stringValue(value(value(settings?.data).notifications).automationDeliveryMode, "sandbox") === "live";
}

async function organizationName(ctx: MutationCtx, organizationId: Id<"organizations">): Promise<string> {
  return (await ctx.db.get(organizationId))?.name ?? "Your gym";
}

async function memberVariables(ctx: MutationCtx, organizationId: Id<"organizations">, memberPublicId: string | undefined, leadPublicId: string | undefined): Promise<{ variables: Record<string, string>; phone?: string; language: "en" | "ar" }> {
  const record = memberPublicId
    ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationId).eq("entityType", "member").eq("publicId", memberPublicId)).unique()
    : leadPublicId
      ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationId).eq("entityType", "lead").eq("publicId", leadPublicId)).unique()
      : null;
  const data = value(record?.data);
  const name = stringValue(data.fullName) || stringValue(data.name) || "there";
  const language = stringValue(data.preferredLanguage) === "ar" ? "ar" as const : "en" as const;
  return { variables: { member_name: name, end_date: stringValue(data.endDate), branch_name: stringValue(data.branchName) }, phone: optionalString(data.phone), language };
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
    const liveCache = new Map<string, boolean>();
    const isLive = async (organizationId: Id<"organizations">) => {
      const key = String(organizationId);
      if (!liveCache.has(key)) liveCache.set(key, await organizationDeliveryLive(ctx, organizationId));
      return liveCache.get(key)!;
    };

    const automationRows = (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "messageDelivery")).collect())
      .filter((record) => {
        const data = value(record.data);
        const status = stringValue(data.status);
        const due = typeof data.nextAttemptAt === "string" ? Date.parse(data.nextAttemptAt) : 0;
        const leaseExpired = typeof data.leaseExpiresAt === "number" && data.leaseExpiresAt <= now;
        return (status === "queued" || status === "retrying" || (status === "leased" && leaseExpired)) && data.channel !== "sandbox" && (Number.isNaN(due) || due <= now);
      })
      .slice(0, args.limit);
    for (const record of automationRows) {
      if (!(await isLive(record.organizationId))) continue;
      const data = value(record.data);
      const leaseToken = crypto.randomUUID();
      const member = await memberVariables(ctx, record.organizationId, record.memberPublicId, record.leadPublicId);
      const language = stringValue(data.language) === "ar" ? "ar" as const : member.language;
      const body = await automationBody(ctx, record.organizationId, data, language, member.variables);
      await ctx.db.patch(record._id, { data: { ...data, status: "leased", leaseToken, leaseExpiresAt: now + LEASE_MS }, updatedAt: now });
      leased.push({ source: "automation", id: String(record._id), publicId: record.publicId, organizationId: record.organizationId, leaseToken, channel: stringValue(data.requestedChannel, "whatsapp") === "sms" ? "sms" : "whatsapp", recipientPhone: optionalString(data.recipientPhone) ?? member.phone, language, body, attemptCount: Array.isArray(data.attempts) ? data.attempts.length : 0 });
    }

    const renewalRows = (await ctx.db.query("renewalDeliveries").withIndex("by_status_next_attempt", (q) => q.eq("status", "queued")).collect())
      .filter((row) => row.channel !== "staff_task" && (row.nextAttemptAt ?? 0) <= now)
      .slice(0, Math.max(0, args.limit - leased.length));
    for (const row of renewalRows) {
      if (!(await isLive(row.organizationId))) continue;
      const leaseToken = crypto.randomUUID();
      const memberRecord = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", row.organizationId).eq("entityType", "member").eq("publicId", row.memberPublicId)).unique();
      const gymName = await organizationName(ctx, row.organizationId);
      // A lease is a short exclusive hold: the status stays queued but the
      // next attempt moves forward so a concurrent run skips the row.
      await ctx.db.patch(row._id, { nextAttemptAt: now + LEASE_MS, updatedAt: now });
      leased.push({ source: "renewal", id: String(row._id), publicId: row.publicId, organizationId: row.organizationId, leaseToken, channel: row.channel as MessagingChannel, recipientPhone: row.recipientPhone, language: row.language, body: renewalBody(gymName, row, value(memberRecord?.data), row.language), attemptCount: row.attempts.length });
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
      if (data.leaseToken !== args.leaseToken) return null;
      const attempts = [...(Array.isArray(data.attempts) ? data.attempts : []), { attempt: (Array.isArray(data.attempts) ? data.attempts.length : 0) + 1, status: suppressed ? "suppressed" : args.accepted ? "sent" : "failed", occurredAt: new Date(now).toISOString(), reason: args.suppressionReason ?? args.errorCode, mode: args.mode, deliveredTo: args.deliveredTo, providerMessageId: args.providerMessageId, statusCode: args.statusCode }];
      const exhausted = attempts.length >= MESSAGE_MAX_ATTEMPTS;
      const status = suppressed ? "suppressed" : args.accepted ? "sent" : args.retryable && !exhausted ? "retrying" : "failed";
      const nextAttemptAt = status === "retrying" ? new Date(now + (MESSAGE_RETRY_MINUTES[Math.min(attempts.length - 1, MESSAGE_RETRY_MINUTES.length - 1)] ?? 30) * 60_000).toISOString() : undefined;
      await ctx.db.patch(record._id, { data: { ...data, status, attempts, nextAttemptAt, leaseToken: undefined, leaseExpiresAt: undefined, suppressionReason: args.suppressionReason ?? data.suppressionReason, providerMessageId: args.providerMessageId ?? data.providerMessageId, sentAt: status === "sent" ? new Date(now).toISOString() : data.sentAt, deliveryMode: args.mode, deliveredTo: args.deliveredTo ?? data.deliveredTo }, updatedAt: now });
      if (status === "failed") await notifyOrganizationSupervisors(ctx, { organizationId: record.organizationId, branchId: record.branchId, kind: "message_delivery_failed", title: "A member message could not be sent", body: `${stringValue(data.requestedChannel, "whatsapp")} message failed after ${attempts.length} attempts (${args.errorCode ?? "provider error"}).`, href: "/settings?section=notifications", dedupeKey: `message-failed:${record.publicId}` });
      return null;
    }
    const row = await ctx.db.get(args.id as Id<"renewalDeliveries">);
    if (!row || row.status !== "queued") return null;
    const attempts = [...row.attempts, { attemptedAt: now, outcome: suppressed ? "suppressed" as const : args.accepted ? "accepted" as const : args.retryable ? "retryable_failure" as const : "terminal_failure" as const, statusCode: args.statusCode, errorCode: args.errorCode, providerMessageId: args.providerMessageId }];
    const exhausted = attempts.length >= MESSAGE_MAX_ATTEMPTS;
    const status: Renewal["status"] = suppressed ? "suppressed" : args.accepted ? "sent" : args.retryable && !exhausted ? "queued" : "failed";
    await ctx.db.patch(row._id, { status, attempts, lastAttemptAt: now, lastErrorCode: args.errorCode, nextAttemptAt: status === "queued" ? now + (MESSAGE_RETRY_MINUTES[Math.min(attempts.length - 1, MESSAGE_RETRY_MINUTES.length - 1)] ?? 30) * 60_000 : undefined, sentAt: status === "sent" ? now : row.sentAt, suppressionReason: args.suppressionReason ?? row.suppressionReason, updatedAt: now });
    await ctx.db.insert("renewalDeliveryEvents", { publicId: `RENEWAL-EVENT-${crypto.randomUUID()}`, organizationId: row.organizationId, branchId: row.branchId, deliveryPublicId: row.publicId, membershipPublicId: row.membershipPublicId, memberPublicId: row.memberPublicId, eventType: "provider_attempt", beforeStatus: "queued", afterStatus: status, reason: args.suppressionReason ?? args.errorCode, details: { mode: args.mode, deliveredTo: args.deliveredTo, providerMessageId: args.providerMessageId, statusCode: args.statusCode, channel: row.channel }, source: "system", occurredAt: now });
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
      if (route.decision === "drop") {
        await ctx.runMutation(internal.messagingWorker.recordAttempt, { source: message.source, id: message.id, leaseToken: message.leaseToken, accepted: false, retryable: false, mode: resolution.mode, suppressionReason: route.reason });
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
