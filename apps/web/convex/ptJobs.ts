import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { enqueueOperationalEmail } from "./operationalEmail";

const REMINDER_WINDOW_START_MS = 23 * 60 * 60 * 1000;
const REMINDER_WINDOW_END_MS = 24 * 60 * 60 * 1000 + 15 * 60 * 1000;

type MemberData = {
  email?: unknown;
  fullName?: unknown;
  preferredLanguage?: unknown;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function memberForBooking(ctx: MutationCtx, booking: Doc<"ptBookings">) {
  return await ctx.db.query("domainRecords").withIndex("by_organization_member_type", (q) =>
    q.eq("organizationId", booking.organizationId).eq("memberPublicId", booking.memberPublicId).eq("entityType", "member"),
  ).unique();
}

async function customerUserForMember(ctx: MutationCtx, organizationId: Id<"organizations">, memberPublicId: string) {
  const projection = await ctx.db.query("domainRecords").withIndex("by_organization_member_type", (q) =>
    q.eq("organizationId", organizationId).eq("memberPublicId", memberPublicId).eq("entityType", "customerMembership"),
  ).first();
  const publicUserId = stringValue(objectValue(projection?.data).customerUserId);
  if (!publicUserId) return null;
  return await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", publicUserId)).unique();
}

async function notifyOnce(ctx: MutationCtx, input: {
  recipientUserId: Id<"users">;
  booking: Doc<"ptBookings">;
  body: string;
}) {
  const dedupeKey = `pt-booking-reminder:${input.booking.publicId}`;
  const existing = await ctx.db.query("operationalNotifications").withIndex("by_recipient_dedupe", (q) =>
    q.eq("recipientUserId", input.recipientUserId).eq("dedupeKey", dedupeKey),
  ).unique();
  if (existing) return false;
  await ctx.db.insert("operationalNotifications", {
    publicId: `NOT-${crypto.randomUUID()}`,
    recipientUserId: input.recipientUserId,
    organizationId: input.booking.organizationId,
    branchId: input.booking.branchId,
    kind: "pt_booking_reminder",
    title: "PT session tomorrow",
    body: input.body,
    href: "/customer/my-gyms",
    dedupeKey,
    expiresAt: input.booking.endsAt,
    createdAt: Date.now(),
  });
  return true;
}

/**
 * Captures the reminder exactly once in the durable queues. Delivery remains
 * governed by the global and tenant operational-email activation gates.
 */
export const queueUpcomingReminders = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({ scanned: v.number(), queued: v.number(), notified: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const from = now + REMINDER_WINDOW_START_MS;
    const to = now + REMINDER_WINDOW_END_MS;
    const [reserved, confirmed] = await Promise.all([
      ctx.db.query("ptBookings").withIndex("by_status_start", (q) => q.eq("status", "reserved").gte("startsAt", from).lte("startsAt", to)).collect(),
      ctx.db.query("ptBookings").withIndex("by_status_start", (q) => q.eq("status", "confirmed").gte("startsAt", from).lte("startsAt", to)).collect(),
    ]);
    let queued = 0;
    let notified = 0;
    for (const booking of [...reserved, ...confirmed]) {
      const memberRecord = await memberForBooking(ctx, booking);
      const member = objectValue(memberRecord?.data) as MemberData;
      const language = member.preferredLanguage === "ar" ? "ar" as const : "en" as const;
      const dedupeKey = `pt-booking-reminder:${booking.publicId}`;
      const existed = await ctx.db.query("operationalEmailDeliveries").withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey)).unique();
      const delivery = await enqueueOperationalEmail(ctx, {
        organizationId: booking.organizationId,
        branchId: booking.branchId,
        kind: "pt_booking_reminder",
        templateVersion: "pt-booking-reminder-v1",
        language,
        recipientReference: booking.memberPublicId,
        recipientEmail: stringValue(member.email),
        dedupeKey,
      });
      if (!existed && delivery) queued += 1;
      const user = await customerUserForMember(ctx, booking.organizationId, booking.memberPublicId);
      if (user && user.status !== "deactivated") {
        const organization = await ctx.db.get(booking.organizationId);
        const starts = new Intl.DateTimeFormat(language === "ar" ? "ar-JO" : "en-JO", { dateStyle: "medium", timeStyle: "short", timeZone: organization?.timezone || "UTC" }).format(booking.startsAt);
        if (await notifyOnce(ctx, { recipientUserId: user._id, booking, body: language === "ar" ? `موعد جلستك في ${starts}` : `Your session starts ${starts}.` })) notified += 1;
      }
    }
    return { scanned: reserved.length + confirmed.length, queued, notified };
  },
});
