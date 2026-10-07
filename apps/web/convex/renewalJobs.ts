import { v } from "convex/values";
import { resolveRecipientLanguage } from "../src/lib/i18n/communication";
import { renewalReasonMessage, systemMessage, type SystemMessage, type SystemMessageKey } from "../src/lib/i18n/system-messages";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { checkpointForDays, renewalDedupeKey, renewalStopReason, RENEWAL_CHECKPOINTS, RENEWAL_POLICY_VERSION } from "./renewalPolicy";

type Data = Record<string, unknown>;
type DomainRecord = Doc<"domainRecords">;
type Delivery = Doc<"renewalDeliveries">;
type DeliveryStatus = Delivery["status"];
type DeliveryEventType = Doc<"renewalDeliveryEvents">["eventType"];

const DAY_MS = 86_400_000;
const TERMINAL_DELIVERY_STATUSES: DeliveryStatus[] = ["suppressed", "cancelled", "sent", "completed"];

function value(input: unknown): Data {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Data : {};
}

function stringValue(input: unknown, fallback = ""): string {
  return typeof input === "string" ? input.trim() : fallback;
}

function optionalString(input: unknown): string | undefined {
  const result = stringValue(input);
  return result || undefined;
}

function todayIn(timezone: string, now: number): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(now));
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

function dayNumber(date: string): number {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(year || 1970, (month || 1) - 1, day || 1) / DAY_MS);
}

function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Convert a tenant-local wall-clock date/time to a UTC timestamp. */
function wallClockUtc(date: string, hour: number, minute: number, timezone: string): number {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  const wallAsUtc = Date.UTC(year || 1970, (month || 1) - 1, day || 1, hour, minute);
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(wallAsUtc));
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const tenantWallAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
    return wallAsUtc - (tenantWallAsUtc - wallAsUtc);
  } catch {
    return wallAsUtc;
  }
}

function terminalReason(membership: Data, member: Data | undefined, today: string, hasSuccessor: boolean): string | undefined {
  if (!member) return "member_not_found";
  return renewalStopReason({ membership, member, today, hasSuccessor });
}

function asEventType(status: DeliveryStatus): DeliveryEventType {
  if (status === "deferred" || status === "sandboxed" || status === "queued" || status === "suppressed" || status === "cancelled" || status === "completed") return status;
  return "created";
}

async function branchForMembership(ctx: MutationCtx, organizationId: Id<"organizations">, record: DomainRecord, membership: Data) {
  if (record.branchId) return record.branchId;
  const publicBranchId = optionalString(membership.homeBranchId);
  if (!publicBranchId) return undefined;
  return (await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organizationId).eq("publicId", publicBranchId)).unique())?._id;
}

async function appendEvent(ctx: MutationCtx, input: {
  organizationId: Id<"organizations">;
  branchId?: Id<"branches">;
  deliveryPublicId: string;
  membershipPublicId: string;
  memberPublicId: string;
  eventType: DeliveryEventType;
  beforeStatus?: string;
  afterStatus: string;
  reason?: string;
  details?: Data;
  occurredAt: number;
}): Promise<void> {
  await ctx.db.insert("renewalDeliveryEvents", {
    publicId: `RENEWAL-EVENT-${crypto.randomUUID()}`,
    organizationId: input.organizationId,
    branchId: input.branchId,
    deliveryPublicId: input.deliveryPublicId,
    membershipPublicId: input.membershipPublicId,
    memberPublicId: input.memberPublicId,
    eventType: input.eventType,
    beforeStatus: input.beforeStatus,
    afterStatus: input.afterStatus,
    reason: input.reason,
    details: input.details,
    source: "system",
    occurredAt: input.occurredAt,
  });
}

function renewalLanguage(preference: unknown, organizationDefault: unknown): { language: "en" | "ar"; languageSource: "recipient" | "organization" | "default" } {
  const resolved = resolveRecipientLanguage(preference, organizationDefault);
  return { language: resolved.language, languageSource: resolved.source };
}

/** Each renewal timeline type has one fixed system title. */
const RENEWAL_TIMELINE_TITLES: Readonly<Record<string, SystemMessageKey>> = {
  renewal_journey_cancelled: "communicationCompletion.timeline.renewalStopped",
  renewal_message_suppressed: "communicationCompletion.timeline.renewalSuppressed",
  renewal_call_task_created: "communicationCompletion.timeline.renewalCallTask",
  renewal_message_sandboxed: "communicationCompletion.timeline.renewalSandboxed",
};

async function appendTimeline(ctx: MutationCtx, input: {
  organizationId: Id<"organizations">;
  organizationPublicId: string;
  branchId?: Id<"branches">;
  memberPublicId: string;
  type: string;
  title: string;
  body?: string;
  /** A body descriptor only when the body is wholly system-written; reasons stay original. */
  bodyMessage?: SystemMessage;
  occurredAt: number;
  meta?: Data;
}): Promise<void> {
  const titleKey = RENEWAL_TIMELINE_TITLES[input.type];
  const id = `RENEWAL-TIMELINE-${crypto.randomUUID()}`;
  await ctx.db.insert("domainRecords", {
    organizationId: input.organizationId,
    entityType: "timeline",
    publicId: id,
    branchId: input.branchId,
    memberPublicId: input.memberPublicId,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    data: {
      id,
      organizationId: input.organizationPublicId,
      memberId: input.memberPublicId,
      branchId: input.branchId,
      type: input.type,
      title: input.title,
      body: input.body,
      ...(titleKey ? { titleMessage: systemMessage(titleKey) } : {}),
      ...(input.bodyMessage ? { bodyMessage: input.bodyMessage } : {}),
      occurredAt: new Date(input.occurredAt).toISOString(),
      actorId: "system",
      actorName: "RIVET renewal journey",
      meta: input.meta,
    },
  });
}

async function ownerForCall(ctx: MutationCtx, organizationId: Id<"organizations">, branchId?: Id<"branches">): Promise<{ id?: string; name: string }> {
  const memberships = (await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect())
    .filter((membership) => membership.active && ["sales", "manager", "owner"].includes(membership.role))
    .filter((membership) => !branchId || membership.branchScope === "all" || membership.branchIds.includes(branchId))
    .sort((left, right) => {
      const rank = (role: string) => role === "sales" ? 0 : role === "manager" ? 1 : 2;
      return rank(left.role) - rank(right.role);
    });
  for (const membership of memberships) {
    const user = await ctx.db.get(membership.userId);
    if (user && user.status !== "deactivated") return { id: user.publicId ?? user._id, name: user.fullName };
  }
  return { name: "Renewal queue" };
}

async function customerUserIdForMember(ctx: MutationCtx, organizationId: Id<"organizations">, memberPublicId: string): Promise<string | undefined> {
  const projection = await ctx.db.query("domainRecords").withIndex("by_organization_member_type", (q) => q.eq("organizationId", organizationId).eq("memberPublicId", memberPublicId).eq("entityType", "customerMembership")).first();
  return optionalString(value(projection?.data).customerUserId);
}

async function createCallTask(ctx: MutationCtx, input: {
  organizationId: Id<"organizations">;
  organizationPublicId: string;
  branchId?: Id<"branches">;
  memberPublicId: string;
  memberName: string;
  membershipPublicId: string;
  dueAt: number;
  deliveryPublicId: string;
  createdAt: number;
}): Promise<string> {
  const taskPublicId = `RENEWAL-CALL-${crypto.randomUUID()}`;
  const owner = await ownerForCall(ctx, input.organizationId, input.branchId);
  await ctx.db.insert("domainRecords", {
    organizationId: input.organizationId,
    entityType: "task",
    publicId: taskPublicId,
    branchId: input.branchId,
    memberPublicId: input.memberPublicId,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    data: {
      id: taskPublicId,
      organizationId: input.organizationPublicId,
      type: "renewal_call",
      title: `Call ${input.memberName} about membership renewal`,
      ownerId: owner.id,
      ownerName: owner.name,
      memberId: input.memberPublicId,
      subjectName: input.memberName,
      dueAt: new Date(input.dueAt).toISOString(),
      priority: "high",
      status: "open",
      renewalDeliveryPublicId: input.deliveryPublicId,
      renewalMembershipPublicId: input.membershipPublicId,
      reason: "Membership expires tomorrow",
      createdById: "system",
      createdAt: new Date(input.createdAt).toISOString(),
    },
  });
  return taskPublicId;
}

async function updateDeliveryStatus(ctx: MutationCtx, input: {
  delivery: Delivery;
  status: DeliveryStatus;
  now: number;
  reason?: string;
  deferredUntil?: number;
  cancellationReason?: string;
  consentStatus?: "explicit_opt_in" | "explicit_opt_out" | "unknown" | "not_applicable";
  consentSource?: string;
  consentChangedAt?: number;
  channelOptedOut?: boolean;
  details?: Data;
}): Promise<Delivery> {
  if (input.delivery.status === input.status && !input.reason && input.deferredUntil === input.delivery.deferredUntil) return input.delivery;
  await ctx.db.patch(input.delivery._id, {
    status: input.status,
    suppressionReason: input.status === "suppressed" ? input.reason : input.delivery.suppressionReason,
    cancellationReason: input.status === "cancelled" ? input.cancellationReason ?? input.reason : input.delivery.cancellationReason,
    deferredUntil: input.status === "deferred" ? input.deferredUntil : undefined,
    consentStatus: input.consentStatus ?? input.delivery.consentStatus,
    consentSource: input.consentSource ?? input.delivery.consentSource,
    consentChangedAt: input.consentChangedAt ?? input.delivery.consentChangedAt,
    channelOptedOut: input.channelOptedOut ?? input.delivery.channelOptedOut,
    updatedAt: input.now,
  });
  const updated = (await ctx.db.get(input.delivery._id))!;
  await appendEvent(ctx, {
    organizationId: updated.organizationId,
    branchId: updated.branchId,
    deliveryPublicId: updated.publicId,
    membershipPublicId: updated.membershipPublicId,
    memberPublicId: updated.memberPublicId,
    eventType: input.status === "cancelled" ? "cancelled" : asEventType(input.status),
    beforeStatus: input.delivery.status,
    afterStatus: input.status,
    reason: input.reason,
    details: input.details,
    occurredAt: input.now,
  });
  return updated;
}

async function cancelTaskIfOpen(ctx: MutationCtx, organizationId: Id<"organizations">, taskPublicId: string, reason: string, now: number): Promise<void> {
  const task = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationId).eq("entityType", "task").eq("publicId", taskPublicId)).unique();
  if (!task || stringValue(value(task.data).status, "open") !== "open") return;
  await ctx.db.patch(task._id, { data: { ...value(task.data), status: "cancelled", cancellationReason: reason, cancelledAt: new Date(now).toISOString() }, updatedAt: now });
}

async function reconcileOrganization(ctx: MutationCtx, organization: Doc<"organizations">, now: number, today: string): Promise<{ cancelled: number; suppressed: number; completed: number }> {
  const organizationPublicId = organization.publicId ?? organization._id;
  const deliveries = await ctx.db.query("renewalDeliveries").withIndex("by_organization", (q) => q.eq("organizationId", organization._id)).collect();
  if (deliveries.length === 0) return { cancelled: 0, suppressed: 0, completed: 0 };
  const memberships = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "membership")).collect();
  const members = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "member")).collect();
  const membershipById = new Map(memberships.map((record) => [record.publicId, record]));
  const memberById = new Map(members.map((record) => [record.publicId, record]));
  let cancelled = 0;
  let completed = 0;
  for (const delivery of deliveries) {
    if (TERMINAL_DELIVERY_STATUSES.includes(delivery.status)) continue;
    if (delivery.channel !== "staff_task") {
      await updateDeliveryStatus(ctx, { delivery, status: "cancelled", now, reason: "automated_messaging_retired" });
      cancelled += 1;
      continue;
    }
    const membershipRecord = membershipById.get(delivery.membershipPublicId);
    const membership = value(membershipRecord?.data);
    const member = memberById.get(delivery.memberPublicId);
    const memberData = value(member?.data);
    const successor = memberships.some((candidate) => value(candidate.data).previousMembershipId === delivery.membershipPublicId && !value(candidate.data).cancelledAt);
    const reason = !membershipRecord
      ? "membership_not_found"
      : terminalReason(membership, member ? memberData : undefined, today, successor)
        ?? (stringValue(membership.endDate) !== delivery.membershipEndDate ? "membership_term_changed" : undefined);
    if (reason) {
      const updated = await updateDeliveryStatus(ctx, { delivery, status: "cancelled", now, reason, cancellationReason: reason });
      if (updated.taskPublicId) await cancelTaskIfOpen(ctx, organization._id, updated.taskPublicId, reason, now);
      await appendTimeline(ctx, { organizationId: organization._id, organizationPublicId, branchId: updated.branchId, memberPublicId: updated.memberPublicId, type: "renewal_journey_cancelled", title: "Renewal follow-up stopped", body: reason.replaceAll("_", " "), bodyMessage: renewalReasonMessage(reason), occurredAt: now, meta: { deliveryId: updated.publicId, membershipId: updated.membershipPublicId, reason } });
      cancelled += 1;
      continue;
    }
    const taskPublicId = delivery.taskPublicId;
    if (taskPublicId) {
      const task = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "task").eq("publicId", taskPublicId)).unique();
      if (task && stringValue(value(task.data).status) === "completed") {
        await updateDeliveryStatus(ctx, { delivery, status: "completed", now, details: { taskPublicId } });
        completed += 1;
      }
    }
  }
  return { cancelled, suppressed: 0, completed };
}

async function createCallDelivery(ctx: MutationCtx, input: {
  organization: Doc<"organizations">;
  branchId?: Id<"branches">;
  membershipPublicId: string;
  membershipEndDate: string;
  memberPublicId: string;
  memberName: string;
  preferredLanguage?: unknown;
  customerUserId?: string;
  checkpoint: typeof RENEWAL_CHECKPOINTS[number];
  now: number;
  taskDueAt: number;
}): Promise<boolean> {
  const dedupeKey = renewalDedupeKey({ organizationId: input.organization.publicId ?? input.organization._id, membershipId: input.membershipPublicId, membershipEndDate: input.membershipEndDate, checkpoint: input.checkpoint.key, channel: "staff_task" });
  if (await ctx.db.query("renewalDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey)).unique()) return false;
  const publicId = `RENEWAL-${crypto.randomUUID()}`;
  const taskPublicId = await createCallTask(ctx, {
    organizationId: input.organization._id, organizationPublicId: input.organization.publicId ?? input.organization._id,
    branchId: input.branchId, memberPublicId: input.memberPublicId, memberName: input.memberName,
    membershipPublicId: input.membershipPublicId, dueAt: input.taskDueAt, deliveryPublicId: publicId, createdAt: input.now,
  });
  await ctx.db.insert("renewalDeliveries", {
    publicId, organizationId: input.organization._id, branchId: input.branchId,
    membershipPublicId: input.membershipPublicId, membershipEndDate: input.membershipEndDate,
    memberPublicId: input.memberPublicId, customerUserId: input.customerUserId,
    checkpointDaysBefore: input.checkpoint.days, checkpointKey: input.checkpoint.key,
    channel: "staff_task", templateVersion: input.checkpoint.templateVersion,
    policyVersion: RENEWAL_POLICY_VERSION, dedupeKey, recipientReference: input.memberPublicId,
    ...renewalLanguage(input.preferredLanguage, input.organization.defaultLanguage), consentStatus: "not_applicable", channelOptedOut: false,
    status: "queued", taskPublicId, attempts: [], createdAt: input.now, updatedAt: input.now,
  });
  for (const eventType of ["created", "task_created"] as const) {
    await appendEvent(ctx, { organizationId: input.organization._id, branchId: input.branchId,
      deliveryPublicId: publicId, membershipPublicId: input.membershipPublicId, memberPublicId: input.memberPublicId,
      eventType, afterStatus: "queued", details: { taskPublicId, dueAt: input.taskDueAt }, occurredAt: input.now });
  }
  await appendTimeline(ctx, { organizationId: input.organization._id, organizationPublicId: input.organization.publicId ?? input.organization._id,
    branchId: input.branchId, memberPublicId: input.memberPublicId, type: "renewal_call_task_created",
    title: "Renewal call task created", body: `Call ${input.memberName} before membership end date.`,
    bodyMessage: systemMessage("communicationCompletion.timeline.renewalCallTaskBody", { member: input.memberName }),
    occurredAt: input.now, meta: { deliveryId: publicId, taskPublicId, membershipId: input.membershipPublicId } });
  return true;
}

async function processOrganization(ctx: MutationCtx, organization: Doc<"organizations">, now: number) {
  const today = todayIn(organization.timezone || "UTC", now);
  // Settle retained pending messages as cancelled without deleting history or
  // sending. Staff task completion/cancellation also survives disabling new tasks.
  const reconciliation = await reconcileOrganization(ctx, organization, now, today);
  const empty = { memberships: 0, created: 0, deferred: 0, sandboxed: 0, queued: 0, ...reconciliation };
  const settings = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "settings").eq("publicId", "settings")).unique();
  const notifications = value(value(settings?.data).notifications);
  if (notifications.renewalRecoveryEnabled !== true) return empty;
  const memberships = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "membership")).collect();
  const members = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "member")).collect();
  const memberById = new Map(members.map((record) => [record.publicId, record]));
  let created = 0;
  for (const record of memberships) {
    const membership = value(record.data);
    const memberId = optionalString(membership.memberId);
    const endDate = optionalString(membership.endDate);
    if (!memberId || !endDate || !optionalString(membership.startDate)) continue;
    const checkpoint = checkpointForDays(daysBetween(today, endDate));
    // The 14/7/3 WhatsApp journey is retired. Email checkpoints are owned by
    // membershipJobs and operationalEmail, with their existing delivery gates.
    if (checkpoint?.key !== "1_day_call") continue;
    const memberRecord = memberById.get(memberId);
    const member = value(memberRecord?.data);
    const successor = memberships.some((candidate) => value(candidate.data).previousMembershipId === record.publicId && !value(candidate.data).cancelledAt);
    if (terminalReason(membership, memberRecord ? member : undefined, today, successor)) continue;
    if (await createCallDelivery(ctx, {
      organization, branchId: await branchForMembership(ctx, organization._id, record, membership),
      membershipPublicId: record.publicId, membershipEndDate: endDate, memberPublicId: memberId,
      memberName: stringValue(member.fullName, memberId), preferredLanguage: member.preferredLanguage,
      customerUserId: await customerUserIdForMember(ctx, organization._id, memberId), checkpoint, now,
      taskDueAt: wallClockUtc(addDays(endDate, -1), 9, 0, organization.timezone || "UTC"),
    })) created += 1;
  }
  return { ...empty, memberships: memberships.length, created, queued: created };
}

type ReleaseAuditRow = { timestamp: number; group: string };

function releaseAuditSummary(rows: ReleaseAuditRow[]): { count: number; firstAt?: number; lastAt?: number; groups: Record<string, number> } {
  let firstAt: number | undefined;
  let lastAt: number | undefined;
  const groups: Record<string, number> = {};
  for (const row of rows) {
    firstAt = firstAt === undefined ? row.timestamp : Math.min(firstAt, row.timestamp);
    lastAt = lastAt === undefined ? row.timestamp : Math.max(lastAt, row.timestamp);
    groups[row.group] = (groups[row.group] ?? 0) + 1;
  }
  return { count: rows.length, firstAt, lastAt, groups };
}

/**
 * Count-only release audit for renewal facts. This is intentionally internal:
 * it has no tenant/member identity in its result and is callable only through
 * an authenticated operator/deployment workflow, not the product API.
 */
export const releaseAudit = internalQuery({
  args: { since: v.optional(v.number()) },
  returns: v.object({
    scope: v.literal("renewal-records-only"),
    since: v.optional(v.number()),
    deliveries: v.object({ count: v.number(), firstAt: v.optional(v.number()), lastAt: v.optional(v.number()), groups: v.record(v.string(), v.number()) }),
    deliveryEvents: v.object({ count: v.number(), firstAt: v.optional(v.number()), lastAt: v.optional(v.number()), groups: v.record(v.string(), v.number()) }),
    memberTimeline: v.object({ count: v.number(), firstAt: v.optional(v.number()), lastAt: v.optional(v.number()), groups: v.record(v.string(), v.number()) }),
    staffCallTasks: v.object({ count: v.number(), firstAt: v.optional(v.number()), lastAt: v.optional(v.number()), groups: v.record(v.string(), v.number()) }),
  }),
  handler: async (ctx, args) => {
    const include = (timestamp: number) => args.since === undefined || timestamp >= args.since;
    const [deliveries, deliveryEvents, timelineRecords, taskRecords] = await Promise.all([
      ctx.db.query("renewalDeliveries").collect(),
      ctx.db.query("renewalDeliveryEvents").collect(),
      ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "timeline")).collect(),
      ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "task")).collect(),
    ]);
    const timelineRows = timelineRecords
      .filter((record) => record.publicId.startsWith("RENEWAL-TIMELINE-") && include(record.createdAt))
      .map((record) => ({ timestamp: record.createdAt, group: stringValue(value(record.data).type, "unknown") }));
    const taskRows = taskRecords
      .filter((record) => record.publicId.startsWith("RENEWAL-CALL-") && include(record.createdAt))
      .map((record) => ({ timestamp: record.createdAt, group: stringValue(value(record.data).status, "unknown") }));
    return {
      scope: "renewal-records-only" as const,
      since: args.since,
      deliveries: releaseAuditSummary(deliveries.filter((row) => include(row.createdAt)).map((row) => ({ timestamp: row.createdAt, group: row.status }))),
      deliveryEvents: releaseAuditSummary(deliveryEvents.filter((row) => include(row.occurredAt)).map((row) => ({ timestamp: row.occurredAt, group: row.eventType }))),
      memberTimeline: releaseAuditSummary(timelineRows),
      staffCallTasks: releaseAuditSummary(taskRows),
    };
  },
});

/**
 * Tenant-local staff call task scan. Automated WhatsApp/SMS are retired;
 * member renewal and expiry emails are handled by membershipJobs.
 */
export const queueRenewalJourney = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({ organizations: v.number(), memberships: v.number(), created: v.number(), deferred: v.number(), sandboxed: v.number(), queued: v.number(), suppressed: v.number(), cancelled: v.number(), completed: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const organizations = await ctx.db.query("organizations").collect();
    const summary = { organizations: 0, memberships: 0, created: 0, deferred: 0, sandboxed: 0, queued: 0, suppressed: 0, cancelled: 0, completed: 0 };
    for (const organization of organizations) {
      if (organization.status === "suspended" || organization.status === "cancelled") continue;
      const result = await processOrganization(ctx, organization, now);
      summary.organizations += 1;
      summary.memberships += result.memberships;
      summary.created += result.created;
      summary.deferred += result.deferred;
      summary.sandboxed += result.sandboxed;
      summary.queued += result.queued;
      summary.suppressed += result.suppressed;
      summary.cancelled += result.cancelled;
      summary.completed += result.completed;
    }
    return summary;
  },
});
