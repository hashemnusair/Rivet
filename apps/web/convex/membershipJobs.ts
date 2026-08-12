import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { enqueueOperationalEmail } from "./operationalEmail";

type Data = Record<string, unknown>;

function value(input: unknown): Data {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Data : {};
}

function stringValue(input: unknown): string | undefined {
  return typeof input === "string" && input.trim() ? input.trim() : undefined;
}

function todayIn(timezone: string, now: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

async function customerUserForMember(ctx: MutationCtx, organizationId: Id<"organizations">, memberPublicId: string) {
  const projection = await ctx.db.query("domainRecords").withIndex("by_organization_member_type", (q) =>
    q.eq("organizationId", organizationId).eq("memberPublicId", memberPublicId).eq("entityType", "customerMembership"),
  ).first();
  const publicUserId = stringValue(value(projection?.data).customerUserId);
  return publicUserId ? await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", publicUserId)).unique() : null;
}

async function notifyMemberOnce(ctx: MutationCtx, input: {
  user: Doc<"users">;
  organizationId: Id<"organizations">;
  branchId?: Id<"branches">;
  kind: "renewal_reminder" | "membership_expiry";
  membershipId: string;
  endDate: string;
}) {
  const dedupeKey = `${input.kind}:${input.membershipId}:${input.endDate}`;
  const existing = await ctx.db.query("operationalNotifications").withIndex("by_recipient_dedupe", (q) => q.eq("recipientUserId", input.user._id).eq("dedupeKey", dedupeKey)).unique();
  if (existing) return false;
  await ctx.db.insert("operationalNotifications", {
    publicId: `NOT-${crypto.randomUUID()}`,
    recipientUserId: input.user._id,
    organizationId: input.organizationId,
    branchId: input.branchId,
    kind: input.kind,
    title: input.kind === "renewal_reminder" ? "Membership renewal approaching" : "Membership expiry approaching",
    body: `Your current membership term ends ${input.endDate}.`,
    href: "/customer/my-gyms",
    dedupeKey,
    expiresAt: Date.parse(`${input.endDate}T23:59:59Z`) + 7 * 86_400_000,
    createdAt: Date.now(),
  });
  return true;
}

/**
 * Queues exact, deduplicated service reminders from persisted membership terms.
 * Running hourly covers tenant-local date boundaries; the durable dedupe key
 * prevents repeated mail or notification records during the same term.
 */
export const queueLifecycleReminders = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({ scanned: v.number(), queued: v.number(), notified: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const organizations = await ctx.db.query("organizations").collect();
    let scanned = 0;
    let queued = 0;
    let notified = 0;
    for (const organization of organizations) {
      if (organization.status === "suspended" || organization.status === "cancelled") continue;
      const today = todayIn(organization.timezone || "UTC", now);
      const memberships = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", organization._id).eq("entityType", "membership")).collect();
      for (const record of memberships) {
        const membership = value(record.data);
        const memberId = stringValue(membership.memberId);
        const endDate = stringValue(membership.endDate);
        const startDate = stringValue(membership.startDate);
        if (!memberId || !endDate || !startDate || membership.cancelledAt || startDate > today || endDate < today) continue;
        scanned += 1;
        const daysLeft = daysBetween(today, endDate);
        const kind = daysLeft === 7 ? "renewal_reminder" as const : daysLeft === 1 ? "membership_expiry" as const : null;
        if (!kind) continue;
        const member = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "member").eq("publicId", memberId)).unique();
        const memberData = value(member?.data);
        const dedupeKey = `${kind}:${record.publicId}:${endDate}`;
        const existed = await ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey)).unique();
        await enqueueOperationalEmail(ctx, {
          organizationId: organization._id,
          branchId: record.branchId,
          kind,
          templateVersion: `${kind}-v1`,
          language: memberData.preferredLanguage === "ar" ? "ar" : "en",
          recipientReference: memberId,
          recipientEmail: stringValue(memberData.email),
          relatedEntityType: "membership",
          relatedEntityPublicId: record.publicId,
          dedupeKey,
        });
        if (!existed) queued += 1;
        const user = await customerUserForMember(ctx, organization._id, memberId);
        if (user && user.status !== "deactivated" && await notifyMemberOnce(ctx, { user, organizationId: organization._id, branchId: record.branchId, kind, membershipId: record.publicId, endDate })) notified += 1;
      }
    }
    return { scanned, queued, notified };
  },
});
