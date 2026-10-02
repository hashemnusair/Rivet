import { v } from "convex/values";
import { internalMutation, internalQuery, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { attendanceInsights, attendanceSettings, checkInEvent, type AttendanceEvent, type AttendanceSettings } from "../src/lib/attendance/model";
import { domainError, publicBranchId, publicOrganizationId } from "./security";
import { enforcePublicRateLimit } from "./publicAbuse";

const LIMIT = 10_000;
export async function branchAttendance(ctx: QueryCtx | MutationCtx, organization: Doc<"organizations">, branch: Doc<"branches">, date?: string) {
  const now = Date.now();
  const rows = await Promise.all(["checkIn", "attendanceEvent"].map((entityType) => ctx.db.query("domainRecords").withIndex("by_organization_branch_type_created", (q) => q.eq("organizationId", organization._id).eq("branchId", branch._id).eq("entityType", entityType).gte("createdAt", now - 29 * 86_400_000)).order("desc").take(LIMIT + 1)));
  const events: AttendanceEvent[] = [];
  for (const row of rows[0]!) {
    const value = row.data as Record<string, unknown>;
    if (typeof value.memberId === "string" && typeof value.occurredAt === "string") events.push(checkInEvent({ id: row.publicId, memberId: value.memberId, occurredAt: value.occurredAt, decision: String(value.decision), attendanceWindowMinutes: typeof value.attendanceWindowMinutes === "number" ? value.attendanceWindowMinutes : undefined, attendanceSource: typeof value.attendanceSource === "string" ? value.attendanceSource : undefined }));
  }
  for (const row of rows[1]!) events.push(row.data as AttendanceEvent);
  return attendanceInsights({ branchId: publicBranchId(branch), settings: attendanceSettings(branch.attendance, organization.timezone, branch.capacity), events, now, date, feedHeartbeatAt: branch.attendanceHeartbeatAt, truncated: rows.some((r) => r.length > LIMIT) || !branch.active || branch.status === "inactive" });
}

export function validateAttendanceSettings(input: Record<string, unknown>): AttendanceSettings {
  const windowMinutes = Number(input.windowMinutes);
  const capacity = input.capacity === undefined || input.capacity === null ? undefined : Number(input.capacity);
  const timezone = String(input.timezone ?? "");
  if (!Number.isInteger(windowMinutes) || windowMinutes < 15 || windowMinutes > 720 || (capacity !== undefined && (!Number.isInteger(capacity) || capacity < 1 || capacity > 100_000)) || typeof input.publicEnabled !== "boolean" || !["reception", "external", "paused"].includes(String(input.feedMode))) domainError("VALIDATION_ERROR", "Check the attendance settings. Use 15–720 minutes and a positive capacity, or leave capacity blank.");
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); } catch { domainError("VALIDATION_ERROR", "Choose a valid branch timezone."); }
  return { windowMinutes, capacity, timezone, publicEnabled: input.publicEnabled, feedMode: input.feedMode as AttendanceSettings["feedMode"] };
}

/** Server-only seam. An eventual verified device adapter must map its device to this tenant/branch. Never expose this as a browser mutation. */
export const ingest = internalMutation({
  args: { organizationId: v.id("organizations"), branchId: v.id("branches"), personId: v.string(), eventId: v.string(), source: v.string(), kind: v.union(v.literal("entry"), v.literal("exit")), accepted: v.boolean(), occurredAt: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const branch = await ctx.db.get(args.branchId);
    const member = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", args.organizationId).eq("entityType", "member").eq("publicId", args.personId)).unique();
    if (!branch || branch.organizationId !== args.organizationId || !branch.active || !member) domainError("NOT_FOUND", "Attendance destination not found.");
    if (!args.eventId.trim() || args.eventId.length > 128 || !args.source.trim() || args.source.length > 64 || !Number.isFinite(args.occurredAt) || args.occurredAt > now || args.occurredAt < now - 28 * 86_400_000) domainError("VALIDATION_ERROR", "Attendance event is invalid or outside the 28-day delivery window.");
    const id = JSON.stringify([String(branch._id), args.source, args.eventId]);
    const existing = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", args.organizationId).eq("entityType", "attendanceEvent").eq("publicId", id)).unique();
    if (existing) {
      const old = existing.data as AttendanceEvent;
      if (old.personId !== args.personId || old.occurredAt !== args.occurredAt || old.kind !== args.kind || old.accepted !== args.accepted) domainError("CONFLICT", "This event ID has already been recorded with different details.");
      return { duplicate: true };
    }
    const policy = await ctx.db.query("domainRecords").withIndex("by_organization_branch_type_created", q => q.eq("organizationId", args.organizationId).eq("branchId", args.branchId).eq("entityType", "attendancePolicy").lte("createdAt", args.occurredAt)).order("desc").first();
    const duration = policy ? Number((policy.data as { windowMinutes: number }).windowMinutes) : 90;
    const event: AttendanceEvent = { id: args.eventId, personId: args.personId, occurredAt: args.occurredAt, kind: args.kind, accepted: args.accepted, source: args.source, windowMinutes: duration };
    await ctx.db.insert("domainRecords", { organizationId: args.organizationId, branchId: branch._id, memberPublicId: args.personId, entityType: "attendanceEvent", publicId: id, createdAt: now, updatedAt: now, data: event });
    if (args.accepted) {
      const timelineId = crypto.randomUUID();
      const organization = await ctx.db.get(args.organizationId);
      await ctx.db.insert("domainRecords", { organizationId: args.organizationId, branchId: branch._id, memberPublicId: args.personId, entityType: "timeline", publicId: timelineId, createdAt: now, updatedAt: now, data: { id: timelineId, organizationId: organization ? publicOrganizationId(organization) : undefined, branchId: publicBranchId(branch), memberId: args.personId, type: "check_in", title: args.kind === "exit" ? "Exit recorded" : "Entry recorded", actorName: "Access system", occurredAt: new Date(args.occurredAt).toISOString(), meta: { source: args.source, attendanceEventId: args.eventId, kind: args.kind } } });
    }
    return { duplicate: false };
  },
});

/** A heartbeat certifies delivery health, not an entry. Absence of check-ins alone never means a device is broken. */
export const heartbeat = internalMutation({
  args: { organizationId: v.id("organizations"), branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const branch = await ctx.db.get(args.branchId);
    if (!branch || branch.organizationId !== args.organizationId) domainError("NOT_FOUND", "Attendance destination not found.");
    await ctx.db.patch(branch._id, { attendanceHeartbeatAt: Date.now() });
  },
});

export const publicBudget = internalMutation({
  args: {},
  handler: async (ctx) => { await enforcePublicRateLimit(ctx, { scope: "public-occupancy", fingerprint: "global", maxRequests: 600, windowMs: 60_000 }); },
});
export const publicSnapshot = internalQuery({
  args: { organizationId: v.string(), branchId: v.string(), clockBucket: v.number() },
  handler: async (ctx, args) => {
    const org = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", args.organizationId)).unique();
    if (!org || org.archivedAt || !["active", "trial"].includes(org.status)) return null;
    const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", org._id).eq("publicId", args.branchId)).unique();
    if (!branch?.active || branch.status === "inactive" || !branch.attendance?.publicEnabled) return null;
    const { snapshot } = await branchAttendance(ctx, org, branch);
    // Explicit allowlist: no IDs, capacity, entry totals, schedules, history or operational settings.
    return { version: 1, current: snapshot.current, status: snapshot.status, availability: snapshot.availability, generatedAt: snapshot.generatedAt, validUntil: snapshot.validUntil, timezone: snapshot.timezone, disclosure: "Based on recent check-ins." };
  },
});
