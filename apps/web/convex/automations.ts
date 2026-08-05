import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function value(input: unknown): Data {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Data) : {};
}

function stringValue(input: unknown, fallback = ""): string {
  return typeof input === "string" ? input : fallback;
}

function numberValue(input: unknown, fallback = 0): number {
  return typeof input === "number" && Number.isFinite(input) ? input : fallback;
}

function arrayValue(input: unknown): unknown[] {
  return Array.isArray(input) ? input : [];
}

function todayIn(timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function dayNumber(input: string): number {
  const [year, month, day] = input.slice(0, 10).split("-").map(Number);
  return Math.floor(Date.UTC(year || 1970, (month || 1) - 1, day || 1) / 86_400_000);
}

function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

function localMinutes(timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return Number(values.hour ?? 0) * 60 + Number(values.minute ?? 0);
  } catch {
    const now = new Date();
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

export function isQuietHours(timezone: string, start: string, end: string, now = new Date()): boolean {
  const parse = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return (hour || 0) * 60 + (minute || 0);
  };
  const from = parse(start);
  const to = parse(end);
  if (from === to) return false;
  const current = (() => {
    try {
      const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return Number(values.hour ?? 0) * 60 + Number(values.minute ?? 0);
    } catch {
      return localMinutes(timezone);
    }
  })();
  return from < to ? current >= from && current < to : current >= from || current < to;
}

function isoNow(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

function publicUserId(user: Doc<"users">): string {
  return user.publicId ?? user._id;
}

async function records(ctx: MutationCtx, organizationId: Id<"organizations">, entityType: string): Promise<Array<Doc<"domainRecords">>> {
  return await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organizationId).eq("entityType", entityType)).collect();
}

export function triggerMatches(rule: Data, record: Data, today: string): boolean {
  const trigger = stringValue(rule.trigger);
  const params = value(rule.triggerParams);
  if (trigger === "membership_expiring") {
    const days = daysBetween(today, stringValue(record.endDate));
    return arrayValue(params.daysBefore).map((item) => numberValue(item)).includes(days);
  }
  if (trigger === "membership_expired") {
    const days = daysBetween(stringValue(record.endDate), today);
    return days >= numberValue(params.daysAfter, 0) && days < numberValue(params.daysAfter, 0) + 1;
  }
  if (trigger === "member_inactive") {
    const last = stringValue(record.lastCheckInAt || record.createdAt);
    return daysBetween(last, today) >= numberValue(params.days, 21);
  }
  if (trigger === "lead_untouched") {
    return ["new", "attempted"].includes(stringValue(record.stage)) && Date.now() - new Date(stringValue(record.createdAt)).getTime() >= numberValue(params.hours, 24) * 3_600_000;
  }
  if (trigger === "follow_up_overdue") {
    return stringValue(record.status, "open") === "open" && new Date(stringValue(record.dueAt)).getTime() < Date.now() - numberValue(params.hours, 4) * 3_600_000;
  }
  if (trigger === "payment_outstanding") {
    return numberValue(value(record.outstandingAmount).amount) > 0 && daysBetween(stringValue(record.createdAt), today) >= numberValue(params.days, 7);
  }
  return false;
}

async function ownerForRole(ctx: MutationCtx, organizationId: Id<"organizations">, role: string): Promise<Doc<"users"> | null> {
  const memberships = await ctx.db.query("organizationMemberships").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
  const membership = memberships.find((item: Doc<"organizationMemberships">) => item.active && item.role === (role === "salesperson" ? "sales" : role));
  return membership ? await ctx.db.get(membership.userId) : null;
}

export const evaluate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.db.query("organizations").collect();
    const summary = { organizations: 0, rules: 0, executions: 0, skipped: 0 };
    for (const organization of organizations) {
      if (organization.status === "suspended" || organization.status === "cancelled") continue;
      summary.organizations += 1;
      const today = todayIn(organization.timezone);
      const settings = (await records(ctx, organization._id, "settings"))[0];
      const notifications = value(value(settings?.data).notifications);
      const deliveryMode = stringValue(notifications.automationDeliveryMode, "sandbox");
      const quiet = isQuietHours(organization.timezone, stringValue(notifications.quietHoursStart, "22:00"), stringValue(notifications.quietHoursEnd, "08:00"));
      const rules = await records(ctx, organization._id, "automationRule");
      for (const ruleRecord of rules) {
        const rule = value(ruleRecord.data);
        if (rule.enabled === false) continue;
        summary.rules += 1;
        const entityType = stringValue(rule.trigger).startsWith("membership")
          ? "membership"
          : stringValue(rule.trigger) === "member_inactive"
            ? "member"
            : stringValue(rule.trigger).startsWith("lead") || stringValue(rule.trigger) === "follow_up_overdue"
              ? "lead"
              : "charge";
        const candidates = await records(ctx, organization._id, entityType);
        for (const candidateRecord of candidates) {
          const candidate = value(candidateRecord.data);
          if (!triggerMatches(rule, candidate, today)) continue;
          const dedupeKey = `${ruleRecord.publicId}:${candidateRecord.publicId}:${today}`;
          const existing = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", organization._id).eq("operation", "automation.execute").eq("key", dedupeKey)).unique();
          if (existing) {
            summary.skipped += 1;
            continue;
          }
          const now = Date.now();
          const executionId = newId();
          await ctx.db.insert("idempotencyRecords", { organizationId: organization._id, operation: "automation.execute", key: dedupeKey, requestHash: dedupeKey, result: { executionId }, createdAt: now, expiresAt: now + Math.max(1, numberValue(rule.dedupeWindowHours, 24)) * 3_600_000 });
          const actionResults: Data[] = [];
          const attemptHistory: Data[] = [];
          const memberId = stringValue(candidate.memberId) || (entityType === "member" ? candidateRecord.publicId : undefined);
          const leadId = stringValue(candidate.leadId) || (entityType === "lead" ? candidateRecord.publicId : undefined);
          for (const actionItem of arrayValue(rule.actions).map(value)) {
            const action = stringValue(actionItem.key);
            if (action === "create_task") {
              const owner = await ownerForRole(ctx, organization._id, stringValue(actionItem.taskOwnerRole, "salesperson"));
              const taskId = newId();
              const task = { id: taskId, organizationId: organization.publicId ?? organization._id, title: stringValue(actionItem.taskTitle, "Follow up with member"), type: "renewal_call", status: "open", ownerId: owner ? publicUserId(owner) : undefined, memberId, leadId, dueAt: isoNow(), createdAt: isoNow(), automationExecutionId: executionId };
              await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "task", publicId: taskId, branchId: candidateRecord.branchId, memberPublicId: memberId, leadPublicId: leadId, createdAt: now, updatedAt: now, data: task });
              actionResults.push({ key: action, taskId, status: "completed" });
              attemptHistory.push({ action, attempt: 1, status: "completed", occurredAt: isoNow() });
            } else if (action === "queue_message") {
              const messageId = newId();
              const suppressionReason = quiet ? "Tenant quiet hours" : deliveryMode === "live" ? "No outbound provider is configured" : undefined;
              const messageStatus = suppressionReason ? "suppressed" : "queued";
              const message = { id: messageId, organizationId: organization.publicId ?? organization._id, status: messageStatus, channel: stringValue(actionItem.channel, "sandbox"), language: stringValue(candidate.preferredLanguage, "en"), templateId: actionItem.templateId, memberId, leadId, queuedAt: isoNow(), suppressionReason, retryPolicy: { maxAttempts: 3, backoffMinutes: [5, 30, 120] }, attempts: [{ attempt: 1, status: messageStatus, occurredAt: isoNow(), reason: suppressionReason }], automationExecutionId: executionId };
              await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "messageDelivery", publicId: messageId, branchId: candidateRecord.branchId, memberPublicId: memberId, leadPublicId: leadId, createdAt: now, updatedAt: now, data: message });
              const attemptId = newId();
              await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "automationAttempt", publicId: attemptId, branchId: candidateRecord.branchId, memberPublicId: memberId, leadPublicId: leadId, createdAt: now, updatedAt: now, data: { id: attemptId, executionId, action, attempt: 1, status: messageStatus, reason: suppressionReason, nextAttemptAt: suppressionReason ? undefined : isoNow() } });
              actionResults.push({ key: action, messageId, status: messageStatus, suppressionReason });
              attemptHistory.push({ action, attempt: 1, status: messageStatus, occurredAt: isoNow(), reason: suppressionReason });
            } else if (action === "notify_manager") {
              actionResults.push({ key: action, status: "queued" });
              attemptHistory.push({ action, attempt: 1, status: "queued", occurredAt: isoNow() });
            }
          }
          const executionStatus = actionResults.length > 0 && actionResults.every((item) => item.status === "suppressed") ? "suppressed" : "completed";
          await ctx.db.insert("domainRecords", { organizationId: organization._id, entityType: "automationExecution", publicId: executionId, branchId: candidateRecord.branchId, memberPublicId: memberId, leadPublicId: leadId, createdAt: now, updatedAt: now, data: { id: executionId, ruleId: ruleRecord.publicId, entityId: candidateRecord.publicId, dedupeKey, status: executionStatus, executedAt: isoNow(), actionResults, attemptHistory, retryPolicy: { maxAttempts: 3, backoffMinutes: [5, 30, 120] }, suppressionReason: executionStatus === "suppressed" ? actionResults.map((item) => stringValue(item.suppressionReason)).filter(Boolean).join("; ") : undefined } });
          summary.executions += 1;
        }
      }
    }
    return summary;
  },
});
