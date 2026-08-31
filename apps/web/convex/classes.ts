import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertBranchAccess,
  domainError,
  hasPermission,
  requirePermission,
  requireReason,
  publicBranchId,
  publicUserId,
  type ActorContext,
} from "./security";
import { deriveServerMembershipStatus } from "./invariants";
import { addDays, diffDays, localDateTimeToISO, todayISODate } from "../src/lib/utils/dates";

type ReadContext = QueryCtx | MutationCtx;
type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Branch = Doc<"branches">;
type ClassSession = Doc<"classSessions">;
type ClassOccurrence = Doc<"classOccurrences">;
type ClassBooking = Doc<"classBookings">;
type Organization = Doc<"organizations">;
type User = Doc<"users">;

const MAX_CAPACITY = 200;
const MAX_DURATION_MINUTES = 8 * 60;
const DAY_MINUTES = 24 * 60;
const AUDIENCES = ["mixed", "women", "men"] as const;
const ACTIVE_BOOKING_STATUSES = new Set<ClassBooking["status"]>(["booked", "waitlisted"]);
const DEFAULT_CLASS_POLICY = {
  enabled: true,
  eligibilityMode: "all_active_memberships" as const,
  eligiblePlanIds: [] as string[],
  bookingHorizonDays: 30,
  cancellationCutoffHours: 2,
  maxActiveBookingsPerMember: 8,
  waitlistEnabled: true,
  waitlistSize: 12,
  noShowTracking: true,
};

export type CustomerClassContext = {
  user: User;
  organization: Organization;
  projection: Doc<"domainRecords">;
  membership: Doc<"domainRecords">;
  member: Doc<"domainRecords">;
};

function optionalText(input: unknown): string | undefined {
  const value = typeof input === "string" ? input.trim() : undefined;
  return value || undefined;
}

function requiredText(input: unknown, field: string, actor: ActorContext): string {
  const value = optionalText(input);
  if (!value) domainError("VALIDATION_ERROR", `${field} is required.`, { correlationId: actor.correlationId });
  return value;
}

function boundedInteger(input: unknown, field: string, min: number, max: number, actor: ActorContext): number {
  const value = typeof input === "number" ? input : Number.NaN;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    domainError("VALIDATION_ERROR", `${field} must be a whole number between ${min} and ${max}.`, { correlationId: actor.correlationId });
  }
  return value;
}

function valueData(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Data : {};
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function occurrenceId(templatePublicId: string, date: string): string {
  return `occ:${templatePublicId}:${date}`;
}

function occurrenceInputParts(value: unknown): { templatePublicId: string; date: string } | undefined {
  const id = optionalText(value);
  if (!id?.startsWith("occ:") || id.length < 16) return undefined;
  const date = id.slice(-10);
  const templatePublicId = id.slice(4, -11);
  return templatePublicId && validDate(date) ? { templatePublicId, date } : undefined;
}

export function occurrenceTimes(date: string, startMinute: number, durationMinutes: number, timezone: string): { startsAt: number; endsAt: number } {
  const time = `${String(Math.floor(startMinute / 60)).padStart(2, "0")}:${String(startMinute % 60).padStart(2, "0")}`;
  const startsAt = Date.parse(localDateTimeToISO(date, time, timezone || "Asia/Amman"));
  return { startsAt, endsAt: startsAt + durationMinutes * 60_000 };
}

async function classPolicy(ctx: ReadContext, organizationId: Id<"organizations">): Promise<Data> {
  const settings = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationId).eq("entityType", "settings").eq("publicId", "settings")).unique();
  const configured = valueData(valueData(valueData(settings?.data).operationalPolicies).classBooking);
  return { ...DEFAULT_CLASS_POLICY, ...configured, eligiblePlanIds: Array.isArray(configured.eligiblePlanIds) ? configured.eligiblePlanIds.filter((item): item is string => typeof item === "string") : [] };
}

async function coachSnapshot(ctx: ReadContext, organizationId: Id<"organizations">, coachId: string | undefined): Promise<{ name?: string } | undefined> {
  if (!coachId) return undefined;
  const coach = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organizationId).eq("entityType", "coach").eq("publicId", coachId)).unique();
  if (!coach) return undefined;
  const value = valueData(coach.data);
  return { name: optionalText(value.name) };
}

async function ensureOccurrence(ctx: MutationCtx, organization: Organization, template: ClassSession, date: string): Promise<ClassOccurrence> {
  const existing = await ctx.db.query("classOccurrences").withIndex("by_template_date", (q) => q.eq("organizationId", organization._id).eq("templateId", template._id).eq("date", date)).unique();
  if (existing) return existing;
  const slot = weeklySlot(template, organization.timezone || "Asia/Amman");
  if (new Date(`${date}T12:00:00.000Z`).getUTCDay() !== slot.dayOfWeek) domainError("VALIDATION_ERROR", "This class does not run on the selected date.");
  const times = occurrenceTimes(date, slot.startMinute, template.durationMinutes, organization.timezone || "Asia/Amman");
  const coach = await coachSnapshot(ctx, organization._id, template.coachUserId);
  const now = Date.now();
  const id = await ctx.db.insert("classOccurrences", {
    organizationId: organization._id,
    publicId: occurrenceId(template.publicId, date),
    templateId: template._id,
    templatePublicId: template.publicId,
    branchId: template.branchId,
    date,
    ...times,
    name: template.name,
    regularCoachId: template.coachUserId,
    regularCoachName: template.coachName,
    coachId: template.coachUserId,
    coachName: coach?.name ?? template.coachName,
    capacity: template.capacity,
    audience: template.audience ?? "mixed",
    imageAssetId: template.imageAssetId,
    notes: template.notes,
    status: "scheduled",
    payCurrency: organization.currency,
    createdAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(id))!;
}

async function occurrenceFromInput(ctx: MutationCtx, organization: Organization, value: unknown): Promise<ClassOccurrence> {
  const requestedId = optionalText(value);
  if (!requestedId) domainError("VALIDATION_ERROR", "Class occurrence is required.");
  const persisted = await ctx.db.query("classOccurrences").withIndex("by_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", requestedId)).unique();
  if (persisted) return persisted;
  const parts = occurrenceInputParts(requestedId);
  const template = parts
    ? await ctx.db.query("classSessions").withIndex("by_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", parts.templatePublicId)).unique()
    : null;
  if (!template || template.status === "cancelled") domainError("NOT_FOUND", "Class occurrence not found.");
  return await ensureOccurrence(ctx, organization, template, parts!.date);
}

async function classImageForOrganization(ctx: ReadContext, organizationId: Id<"organizations">, assetId: string | undefined): Promise<{ imageUrl?: string; imageAltText?: string }> {
  if (!assetId) return {};
  const asset = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organizationId).eq("publicId", assetId)).unique();
  if (!asset || asset.ownerType !== "class_image" || !["active", "pending"].includes(asset.status)) return {};
  const url = await ctx.storage.getUrl(asset.storageId);
  return { imageUrl: url ?? undefined, imageAltText: asset.altText };
}

function requireRosterPermission(actor: ActorContext): void {
  // Reception books members into sessions with pt.book_for_member; sales and
  // managers hold members.write. Either capability may manage a roster.
  if (!hasPermission(actor, "members.write") && !hasPermission(actor, "pt.book_for_member")) {
    domainError("FORBIDDEN", "Your role cannot manage class rosters.", { correlationId: actor.correlationId });
  }
}

async function branchByPublicId(ctx: ReadContext, actor: ActorContext, id: string | undefined): Promise<Branch> {
  const branch = id
    ? await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", id)).unique()
    : null;
  assertBranchAccess(actor, branch);
  return branch;
}

async function sessionByPublicId(ctx: ReadContext, actor: ActorContext, id: unknown): Promise<ClassSession> {
  const sessionId = optionalText(id);
  const session = sessionId
    ? await ctx.db.query("classSessions").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", sessionId)).unique()
    : null;
  if (!session) domainError("NOT_FOUND", "Class not found.", { correlationId: actor.correlationId });
  if (actor.branchScope !== "all" && !actor.branchIds.includes(session.branchId)) {
    domainError("FORBIDDEN", "Your role cannot manage classes for this branch.", { correlationId: actor.correlationId });
  }
  return session;
}

async function classAudit(ctx: MutationCtx, actor: ActorContext, input: { action: string; branchId: ClassSession["branchId"]; entityId: string; entityLabel: string; summary: string; reason?: string; before?: unknown; after?: unknown }): Promise<void> {
  await ctx.db.insert("auditEvents", {
    organizationId: actor.organization._id,
    publicId: `audit-${crypto.randomUUID()}`,
    branchId: input.branchId,
    actorUserId: actor.user._id,
    actorPublicId: publicUserId(actor.user),
    actorName: actor.user.fullName,
    actorRole: actor.role,
    category: "operations",
    action: input.action,
    entityType: "class_session",
    entityPublicId: input.entityId,
    entityLabel: input.entityLabel,
    summary: input.summary,
    reason: input.reason,
    before: input.before,
    after: input.after,
    correlationId: actor.correlationId,
    occurredAt: Date.now(),
  });
}

async function classImageView(ctx: ReadContext, actor: ActorContext, assetId: string | undefined): Promise<{ imageUrl?: string; imageAltText?: string }> {
  return await classImageForOrganization(ctx, actor.organization._id, assetId);
}

/** Legacy dated rows normalize into the weekly template in the gym timezone. */
export function weeklySlot(session: ClassSession, timezone: string): { dayOfWeek: number; startMinute: number } {
  if (session.dayOfWeek !== undefined && session.startMinute !== undefined) {
    return { dayOfWeek: session.dayOfWeek, startMinute: session.startMinute };
  }
  const at = new Date(session.startsAt ?? session.createdAt);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone || "Asia/Amman", weekday: "short", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(at);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 12) % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return { dayOfWeek: dayIndex < 0 ? 0 : dayIndex, startMinute: hour * 60 + minute };
}

async function classView(ctx: ReadContext, actor: ActorContext, session: ClassSession): Promise<Data> {
  const image = await classImageView(ctx, actor, session.imageAssetId);
  const branch = await ctx.db.get(session.branchId);
  if (!branch || branch.organizationId !== actor.organization._id) domainError("NOT_FOUND", "Class branch not found.", { correlationId: actor.correlationId });
  const slot = weeklySlot(session, actor.organization.timezone || "Asia/Amman");
  return {
    id: session.publicId,
    branchId: publicBranchId(branch),
    name: session.name,
    coachId: session.coachUserId,
    coachName: session.coachName,
    dayOfWeek: slot.dayOfWeek,
    startMinute: slot.startMinute,
    durationMinutes: session.durationMinutes,
    capacity: session.capacity,
    audience: session.audience ?? "mixed",
    imageAssetId: session.imageAssetId,
    ...image,
    notes: session.notes,
    roster: session.roster.map((entry) => ({ memberId: entry.memberId, name: entry.name, bookedAt: new Date(entry.bookedAt).toISOString(), attended: entry.attended })),
    attendedCount: session.roster.filter((entry) => entry.attended).length,
    createdAt: new Date(session.createdAt).toISOString(),
    updatedAt: new Date(session.updatedAt).toISOString(),
  };
}

async function activateClassImage(ctx: MutationCtx, actor: ActorContext, assetId: string | undefined, previousAssetId: string | undefined): Promise<void> {
  const now = Date.now();
  if (assetId && assetId !== previousAssetId) {
    const asset = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", assetId)).unique();
    if (!asset || asset.ownerType !== "class_image" || !["pending", "active"].includes(asset.status)) {
      domainError("NOT_FOUND", "Class image was not found.", { correlationId: actor.correlationId });
    }
    if (asset.status === "pending") await ctx.db.patch(asset._id, { status: "active", deleteAfter: undefined, updatedAt: now });
  }
  if (previousAssetId && previousAssetId !== assetId) {
    const previous = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", previousAssetId)).unique();
    if (previous && previous.status === "active") await ctx.db.patch(previous._id, { status: "scheduled_for_deletion", deleteAfter: now + 30 * 86_400_000, updatedAt: now });
  }
}

async function coachByPublicId(ctx: ReadContext, actor: ActorContext, id: string): Promise<Doc<"domainRecords">> {
  const coach = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "coach").eq("publicId", id)).unique();
  if (!coach) domainError("NOT_FOUND", "Coach not found.", { correlationId: actor.correlationId });
  return coach;
}

async function listClassSessions(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data[]> {
  requirePermission(actor, "members.read");
  const branch = await branchByPublicId(ctx, actor, optionalText(input.branchId));
  const rows = (await ctx.db.query("classSessions").withIndex("by_branch", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id)).collect())
    .filter((row) => row.status !== "cancelled");
  const views = await Promise.all(rows.map((row) => classView(ctx, actor, row)));
  return views.sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.startMinute - right.startMinute);
}

async function upsertClassSession(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requirePermission(actor, "operations.manage");
  const branch = await branchByPublicId(ctx, actor, optionalText(input.branchId));
  const name = requiredText(input.name, "Class name", actor);
  if (name.length > 80) domainError("VALIDATION_ERROR", "Class name must be 80 characters or fewer.", { correlationId: actor.correlationId });
  const dayOfWeek = boundedInteger(input.dayOfWeek, "Day", 0, 6, actor);
  const startMinute = boundedInteger(input.startMinute, "Start time", 0, DAY_MINUTES - 15, actor);
  const durationMinutes = boundedInteger(input.durationMinutes, "Duration", 15, MAX_DURATION_MINUTES, actor);
  // A class lives inside one calendar day: crossing midnight would split its
  // occurrence across dates and push the timetable window past the visible day.
  if (startMinute + durationMinutes > DAY_MINUTES) {
    domainError("VALIDATION_ERROR", "A class must end by midnight. Start it earlier or shorten the duration.", { correlationId: actor.correlationId, fieldErrors: { startMinute: ["Must end by midnight"] } });
  }
  const capacity = boundedInteger(input.capacity, "Capacity", 1, MAX_CAPACITY, actor);
  const audience = optionalText(input.audience) ?? "mixed";
  if (!AUDIENCES.includes(audience as (typeof AUDIENCES)[number])) domainError("VALIDATION_ERROR", "Audience must be mixed, women, or men.", { correlationId: actor.correlationId });
  const notes = optionalText(input.notes);
  if (notes && notes.length > 500) domainError("VALIDATION_ERROR", "Notes must be 500 characters or fewer.", { correlationId: actor.correlationId });
  const imageAssetId = optionalText(input.imageAssetId);
  const coachId = optionalText(input.coachId);
  let coachName: string | undefined;
  if (coachId) {
    const coach = await coachByPublicId(ctx, actor, coachId);
    coachName = optionalText((coach.data as Data).name) ?? coachId;
  }
  const now = Date.now();
  const requestedId = optionalText(input.sessionId);
  // Two classes never share the floor: reject any time overlap with another
  // class in this branch on the same weekday.
  const branchSessions = await ctx.db.query("classSessions").withIndex("by_branch", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id)).collect();
  const clash = branchSessions.find((candidate) => {
    if (candidate.publicId === requestedId) return false;
    const slot = weeklySlot(candidate, actor.organization.timezone || "Asia/Amman");
    if (slot.dayOfWeek !== dayOfWeek) return false;
    const candidateEnd = slot.startMinute + candidate.durationMinutes;
    return startMinute < candidateEnd && slot.startMinute < startMinute + durationMinutes;
  });
  if (clash) {
    const slot = weeklySlot(clash, actor.organization.timezone || "Asia/Amman");
    const label = `${String(Math.floor(slot.startMinute / 60)).padStart(2, "0")}:${String(slot.startMinute % 60).padStart(2, "0")}`;
    domainError("VALIDATION_ERROR", `This time overlaps “${clash.name}” at ${label}. Pick another slot.`, { correlationId: actor.correlationId, fieldErrors: { startMinute: ["Overlaps another class"] } });
  }
  const existing = requestedId
    ? await ctx.db.query("classSessions").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", requestedId)).unique()
    : null;

  if (existing) {
    if (actor.branchScope !== "all" && !actor.branchIds.includes(existing.branchId)) {
      domainError("FORBIDDEN", "Your role cannot manage classes for this branch.", { correlationId: actor.correlationId });
    }
    if (existing.branchId !== branch._id) domainError("VALIDATION_ERROR", "A class cannot move between branches.", { correlationId: actor.correlationId });
    if (capacity < existing.roster.length) domainError("VALIDATION_ERROR", `Capacity cannot drop below the ${existing.roster.length} people already in the class.`, { correlationId: actor.correlationId });
    const before = { name: existing.name, dayOfWeek: existing.dayOfWeek, startMinute: existing.startMinute, durationMinutes: existing.durationMinutes, capacity: existing.capacity, audience: existing.audience, coachName: existing.coachName, imageAssetId: existing.imageAssetId };
    await activateClassImage(ctx, actor, imageAssetId, existing.imageAssetId);
    await ctx.db.patch(existing._id, { name, coachUserId: coachId, coachName, dayOfWeek, startMinute, startsAt: undefined, audience: audience as ClassSession["audience"], durationMinutes, capacity, imageAssetId, notes, status: "scheduled", cancelReason: undefined, updatedAt: now });
    const updated = (await ctx.db.get(existing._id))!;
    await classAudit(ctx, actor, { action: "classes.session.update", branchId: updated.branchId, entityId: updated.publicId, entityLabel: name, summary: `Updated class ${name}`, before, after: { name, dayOfWeek, startMinute, durationMinutes, capacity, audience, coachName, imageAssetId } });
    return await classView(ctx, actor, updated);
  }

  await activateClassImage(ctx, actor, imageAssetId, undefined);
  const publicId = requestedId ?? crypto.randomUUID();
  const id = await ctx.db.insert("classSessions", {
    organizationId: actor.organization._id,
    publicId,
    branchId: branch._id,
    name,
    coachUserId: coachId,
    coachName,
    dayOfWeek,
    startMinute,
    audience: audience as ClassSession["audience"],
    durationMinutes,
    capacity,
    imageAssetId,
    notes,
    status: "scheduled",
    roster: [],
    createdAt: now,
    updatedAt: now,
  });
  const created = (await ctx.db.get(id))!;
  await classAudit(ctx, actor, { action: "classes.session.create", branchId: created.branchId, entityId: created.publicId, entityLabel: name, summary: `Scheduled class ${name}`, after: { name, dayOfWeek, startMinute, durationMinutes, capacity, audience, coachName, imageAssetId } });
  return await classView(ctx, actor, created);
}

async function deleteClassSession(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<{ id: string }> {
  requirePermission(actor, "operations.manage");
  requireReason(input.reason, actor.correlationId);
  const session = await sessionByPublicId(ctx, actor, input.sessionId);
  await classAudit(ctx, actor, { action: "classes.session.delete", branchId: session.branchId, entityId: session.publicId, entityLabel: session.name, summary: `Removed class ${session.name} from the weekly schedule`, reason: String(input.reason).trim(), before: { name: session.name, dayOfWeek: session.dayOfWeek, startMinute: session.startMinute, roster: session.roster.length } });
  if (session.imageAssetId) await activateClassImage(ctx, actor, undefined, session.imageAssetId);
  await ctx.db.delete(session._id);
  return { id: session.publicId };
}

async function rosterMember(ctx: ReadContext, actor: ActorContext, memberId: unknown): Promise<{ id: string; name: string }> {
  const id = optionalText(memberId);
  const record = id
    ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "member").eq("publicId", id)).unique()
    : null;
  const value = record?.data && typeof record.data === "object" && !Array.isArray(record.data) ? record.data as Data : undefined;
  const status = typeof value?.status === "string" ? value.status : undefined;
  if (!record || !value || status === "archived") domainError("NOT_FOUND", "Member not found.", { correlationId: actor.correlationId });
  return { id: record.publicId, name: typeof value.fullName === "string" ? value.fullName : record.publicId };
}

async function addClassAttendee(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requireRosterPermission(actor);
  const session = await sessionByPublicId(ctx, actor, input.sessionId);
  const member = await rosterMember(ctx, actor, input.memberId);
  if (session.roster.some((entry) => entry.memberId === member.id)) return await classView(ctx, actor, session);
  if (session.roster.length >= session.capacity) domainError("VALIDATION_ERROR", "This class is full.", { correlationId: actor.correlationId });
  const now = Date.now();
  await ctx.db.patch(session._id, { roster: [...session.roster, { memberId: member.id, name: member.name, bookedAt: now, attended: false }], updatedAt: now });
  const updated = (await ctx.db.get(session._id))!;
  await classAudit(ctx, actor, { action: "classes.roster.add", branchId: updated.branchId, entityId: updated.publicId, entityLabel: session.name, summary: `Added ${member.name} to ${session.name}` });
  return await classView(ctx, actor, updated);
}

async function removeClassAttendee(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requireRosterPermission(actor);
  const session = await sessionByPublicId(ctx, actor, input.sessionId);
  const memberId = optionalText(input.memberId);
  const entry = session.roster.find((candidate) => candidate.memberId === memberId);
  if (!entry) return await classView(ctx, actor, session);
  const now = Date.now();
  await ctx.db.patch(session._id, { roster: session.roster.filter((candidate) => candidate.memberId !== memberId), updatedAt: now });
  const updated = (await ctx.db.get(session._id))!;
  await classAudit(ctx, actor, { action: "classes.roster.remove", branchId: updated.branchId, entityId: updated.publicId, entityLabel: session.name, summary: `Removed ${entry.name} from ${session.name}` });
  return await classView(ctx, actor, updated);
}

async function setClassAttendance(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requireRosterPermission(actor);
  const session = await sessionByPublicId(ctx, actor, input.sessionId);
  const memberId = optionalText(input.memberId);
  const attended = input.attended === true;
  const entry = session.roster.find((candidate) => candidate.memberId === memberId);
  if (!entry) domainError("NOT_FOUND", "This member is not in the class.", { correlationId: actor.correlationId });
  if (entry.attended === attended) return await classView(ctx, actor, session);
  const now = Date.now();
  await ctx.db.patch(session._id, { roster: session.roster.map((candidate) => candidate.memberId === memberId ? { ...candidate, attended } : candidate), updatedAt: now });
  const updated = (await ctx.db.get(session._id))!;
  await classAudit(ctx, actor, { action: "classes.attendance.set", branchId: updated.branchId, entityId: updated.publicId, entityLabel: session.name, summary: `${attended ? "Marked" : "Unmarked"} ${entry.name} ${attended ? "present in" : "for"} ${session.name}` });
  return await classView(ctx, actor, updated);
}

function membershipStatusOn(value: Data, date: string): string {
  const freeze = valueData(value.activeFreeze);
  return deriveServerMembershipStatus({
    cancelledAt: value.cancelledAt,
    freezeStatus: freeze.status,
    freezeStartDate: freeze.startDate,
    freezeEndDate: freeze.endDate,
    startDate: String(value.startDate ?? ""),
    endDate: String(value.endDate ?? ""),
    totalVisits: value.totalVisits,
    remainingVisits: value.remainingVisits,
  }, date);
}

async function membershipEligibility(
  ctx: ReadContext,
  organization: Organization,
  memberId: string,
  membershipId: string | undefined,
  branch: Branch,
  date: string,
  policy: Data,
): Promise<{ membership?: Doc<"domainRecords">; reason?: string }> {
  const records = membershipId
    ? [await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "membership").eq("publicId", membershipId)).unique()].filter((item): item is Doc<"domainRecords"> => Boolean(item))
    : await ctx.db.query("domainRecords").withIndex("by_organization_member_type", (q) => q.eq("organizationId", organization._id).eq("memberPublicId", memberId).eq("entityType", "membership")).collect();
  for (const record of records) {
    const membership = valueData(record.data);
    if (String(membership.memberId ?? "") !== memberId) continue;
    if (!["active", "expiring"].includes(membershipStatusOn(membership, date))) continue;
    if (policy.eligibilityMode === "selected_plans" && !Array.isArray(policy.eligiblePlanIds)) continue;
    if (policy.eligibilityMode === "selected_plans" && !policy.eligiblePlanIds.includes(String(membership.planId ?? ""))) continue;
    const plan = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "plan").eq("publicId", String(membership.planId ?? ""))).unique();
    const planValue = valueData(plan?.data);
    const branchPublicId = publicBranchId(branch);
    const branchAllowed = String(planValue.branchAccess ?? "all") === "all"
      || (Array.isArray(planValue.branchIds) && planValue.branchIds.includes(branchPublicId))
      || String(membership.homeBranchId ?? "") === branchPublicId;
    if (branchAllowed) return { membership: record };
  }
  return { reason: policy.eligibilityMode === "selected_plans" ? "Your membership plan does not include this class." : "Your membership is not active for this class date or branch." };
}

function bookingIsRostered(status: ClassBooking["status"]): boolean {
  return status === "booked" || status === "attended" || status === "no_show";
}

async function classMemberNoShowCounts(
  ctx: ReadContext,
  organizationId: Id<"organizations">,
  memberIds: Iterable<string>,
): Promise<Map<string, number>> {
  const ids = [...new Set(memberIds)];
  const rows = await Promise.all(ids.map((memberId) => ctx.db.query("classMemberStats")
    .withIndex("by_member", (q) => q.eq("organizationId", organizationId).eq("memberPublicId", memberId))
    .unique()));
  return new Map(ids.map((memberId, index) => [memberId, rows[index]?.noShowCount ?? 0]));
}

function occurrenceRowData(template: ClassSession, branch: Branch, date: string, timezone: string): Data {
  const slot = weeklySlot(template, timezone);
  const times = occurrenceTimes(date, slot.startMinute, template.durationMinutes, timezone);
  return {
    id: occurrenceId(template.publicId, date),
    templateId: template.publicId,
    branchId: publicBranchId(branch),
    branchName: branch.name,
    date,
    startsAt: times.startsAt,
    endsAt: times.endsAt,
    name: template.name,
    regularCoachId: template.coachUserId,
    regularCoachName: template.coachName,
    coachId: template.coachUserId,
    coachName: template.coachName,
    capacity: template.capacity,
    audience: template.audience ?? "mixed",
    imageAssetId: template.imageAssetId,
    notes: template.notes,
    status: "scheduled",
    persistedId: undefined,
  };
}

function persistedOccurrenceData(row: ClassOccurrence, branch: Branch): Data {
  return {
    id: row.publicId,
    templateId: row.templatePublicId,
    branchId: publicBranchId(branch),
    branchName: branch.name,
    date: row.date,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    name: row.name,
    regularCoachId: row.regularCoachId,
    regularCoachName: row.regularCoachName,
    coachId: row.coachId,
    coachName: row.coachName,
    capacity: row.capacity,
    audience: row.audience,
    imageAssetId: row.imageAssetId,
    notes: row.notes,
    status: row.status,
    attendanceFinalizedAt: row.attendanceFinalizedAt,
    persistedId: row._id,
  };
}

async function occurrenceView(
  ctx: ReadContext,
  organization: Organization,
  source: Data,
  bookings: ClassBooking[],
  memberId?: string,
  canBook = false,
  bookingBlockReason?: string,
  noShowCounts?: ReadonlyMap<string, number>,
): Promise<Data> {
  const activeRoster = bookings.filter((booking) => bookingIsRostered(booking.status));
  const waitlist = bookings.filter((booking) => booking.status === "waitlisted").sort((left, right) => (left.waitlistedAt ?? left.bookedAt) - (right.waitlistedAt ?? right.bookedAt) || left.publicId.localeCompare(right.publicId));
  const own = memberId ? bookings.filter((booking) => booking.memberPublicId === memberId).sort((left, right) => right.updatedAt - left.updatedAt)[0] : undefined;
  const image = await classImageForOrganization(ctx, organization._id, optionalText(source.imageAssetId));
  return {
    id: String(source.id),
    templateId: String(source.templateId),
    branchId: String(source.branchId),
    branchName: String(source.branchName),
    date: String(source.date),
    startsAt: new Date(Number(source.startsAt)).toISOString(),
    endsAt: new Date(Number(source.endsAt)).toISOString(),
    name: String(source.name),
    regularCoachId: optionalText(source.regularCoachId),
    regularCoachName: optionalText(source.regularCoachName),
    coachId: optionalText(source.coachId),
    coachName: optionalText(source.coachName),
    substituted: Boolean(source.coachId && source.regularCoachId && source.coachId !== source.regularCoachId),
    capacity: Number(source.capacity),
    audience: String(source.audience ?? "mixed"),
    ...image,
    notes: optionalText(source.notes),
    status: String(source.status ?? "scheduled"),
    attendanceFinalizedAt: source.attendanceFinalizedAt ? new Date(Number(source.attendanceFinalizedAt)).toISOString() : undefined,
    bookedCount: activeRoster.length,
    waitlistCount: waitlist.length,
    spotsRemaining: Math.max(0, Number(source.capacity) - activeRoster.length),
    roster: activeRoster.concat(waitlist).map((booking) => ({ bookingId: booking.publicId, memberId: booking.memberPublicId, membershipId: booking.membershipPublicId, name: booking.memberName, status: booking.status, bookedAt: new Date(booking.bookedAt).toISOString(), fromWaitlist: booking.fromWaitlist, noShowCount: noShowCounts?.get(booking.memberPublicId) })),
    booking: own ? { id: own.publicId, status: own.status, position: own.status === "waitlisted" ? waitlist.findIndex((booking) => booking._id === own._id) + 1 : undefined, fromWaitlist: own.fromWaitlist } : undefined,
    canBook,
    bookingBlockReason,
  };
}

async function listOccurrenceSources(ctx: ReadContext, organization: Organization, branch: Branch, from: string, to: string): Promise<Array<{ source: Data; bookings: ClassBooking[] }>> {
  if (!validDate(from) || !validDate(to) || from > to || diffDays(from, to) > 92) domainError("VALIDATION_ERROR", "Choose a class date range of 93 days or fewer.");
  const timezone = organization.timezone || "Asia/Amman";
  const lower = occurrenceTimes(from, 0, 0, timezone).startsAt;
  const upper = occurrenceTimes(addDays(to, 1), 0, 0, timezone).startsAt - 1;
  const [templates, persisted, bookings] = await Promise.all([
    ctx.db.query("classSessions").withIndex("by_branch", (q) => q.eq("organizationId", organization._id).eq("branchId", branch._id)).collect(),
    ctx.db.query("classOccurrences").withIndex("by_branch_start", (q) => q.eq("organizationId", organization._id).eq("branchId", branch._id).gte("startsAt", lower).lte("startsAt", upper)).collect(),
    ctx.db.query("classBookings").withIndex("by_branch_start", (q) => q.eq("organizationId", organization._id).eq("branchId", branch._id).gte("startsAt", lower).lte("startsAt", upper)).collect(),
  ]);
  const persistedByKey = new Map(persisted.map((row) => [`${row.templatePublicId}:${row.date}`, row]));
  const sources: Data[] = persisted.map((row) => persistedOccurrenceData(row, branch));
  const seen = new Set(persisted.map((row) => row.publicId));
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
    for (const template of templates) {
      if (template.status === "cancelled" || weeklySlot(template, timezone).dayOfWeek !== weekday) continue;
      const stored = persistedByKey.get(`${template.publicId}:${date}`);
      const source = stored ? persistedOccurrenceData(stored, branch) : occurrenceRowData(template, branch, date, timezone);
      if (seen.has(String(source.id))) continue;
      seen.add(String(source.id));
      sources.push(source);
    }
  }
  return sources
    .map((source) => ({ source, bookings: source.persistedId ? bookings.filter((booking) => booking.occurrenceId === source.persistedId) : [] }))
    .sort((left, right) => Number(left.source.startsAt) - Number(right.source.startsAt));
}

async function staffOccurrences(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data[]> {
  requirePermission(actor, "members.read");
  const branch = await branchByPublicId(ctx, actor, optionalText(input.branchId));
  const today = todayISODate(actor.organization.timezone || "Asia/Amman");
  const from = validDate(input.fromDate) ? input.fromDate : validDate(input.from) ? input.from : today;
  const to = validDate(input.toDate) ? input.toDate : validDate(input.to) ? input.to : addDays(from, 6);
  const rows = await listOccurrenceSources(ctx, actor.organization, branch, from, to);
  const coachId = optionalText(input.coachId);
  const visible = rows.filter(({ source }) => !coachId || source.coachId === coachId);
  const noShowCounts = await classMemberNoShowCounts(ctx, actor.organization._id, visible.flatMap(({ bookings }) => bookings.map((booking) => booking.memberPublicId)));
  return await Promise.all(visible.map(({ source, bookings }) => occurrenceView(ctx, actor.organization, source, bookings, undefined, false, undefined, noShowCounts)));
}

async function customerClassExperience(ctx: QueryCtx, context: CustomerClassContext): Promise<Data> {
  const policy = await classPolicy(ctx, context.organization._id);
  const membership = valueData(context.membership.data);
  const member = valueData(context.member.data);
  const planId = String(membership.planId ?? "");
  const plan = planId ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", context.organization._id).eq("entityType", "plan").eq("publicId", planId)).unique() : null;
  const planValue = valueData(plan?.data);
  const allBranches = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", context.organization._id)).collect();
  const eligibleBranchIds = String(planValue.branchAccess ?? "all") === "all"
    ? new Set(allBranches.filter((branch) => branch.active && branch.status !== "inactive").map((branch) => publicBranchId(branch)))
    : new Set(Array.isArray(planValue.branchIds) ? planValue.branchIds.filter((item): item is string => typeof item === "string") : [String(membership.homeBranchId ?? "")]);
  eligibleBranchIds.add(String(membership.homeBranchId ?? ""));
  const branches = allBranches.filter((branch) => eligibleBranchIds.has(publicBranchId(branch)) && branch.active && branch.status !== "inactive");
  const today = todayISODate(context.organization.timezone || "Asia/Amman");
  const horizon = Number(policy.bookingHorizonDays ?? DEFAULT_CLASS_POLICY.bookingHorizonDays);
  const upcomingSources = (await Promise.all(branches.map((branch) => listOccurrenceSources(ctx, context.organization, branch, today, addDays(today, horizon))))).flat().sort((a, b) => Number(a.source.startsAt) - Number(b.source.startsAt));
  const memberBookings = await ctx.db.query("classBookings").withIndex("by_member_start", (q) => q.eq("organizationId", context.organization._id).eq("memberPublicId", context.member.publicId)).collect();
  const activeCount = memberBookings.filter((booking) => ACTIVE_BOOKING_STATUSES.has(booking.status) && booking.startsAt >= Date.now()).length;
  const profileCorrectionRequired = !["male", "female"].includes(String(member.gender ?? ""));
  const policyPlanBlocked = policy.eligibilityMode === "selected_plans" && !policy.eligiblePlanIds.includes(planId);
  const upcoming = await Promise.all(upcomingSources.map(async ({ source, bookings }) => {
    const own = bookings.find((booking) => booking.memberPublicId === context.member.publicId && ACTIVE_BOOKING_STATUSES.has(booking.status));
    const rostered = bookings.filter((booking) => bookingIsRostered(booking.status)).length;
    const waitlisted = bookings.filter((booking) => booking.status === "waitlisted").length;
    let reason: string | undefined;
    if (!policy.enabled) reason = "This gym has paused member class booking.";
    else if (policyPlanBlocked) reason = "Your membership plan does not include classes.";
    else if (!['active', 'expiring'].includes(membershipStatusOn(membership, String(source.date)))) reason = "Your membership is not active for this class date.";
    else if (profileCorrectionRequired) reason = "Add your gender in Profile before booking a gender-restricted class.";
    else if ((source.audience === "women" && member.gender !== "female") || (source.audience === "men" && member.gender !== "male")) reason = `This class is for ${source.audience}.`;
    else if (!own && activeCount >= Number(policy.maxActiveBookingsPerMember)) reason = `You already have ${policy.maxActiveBookingsPerMember} active class bookings.`;
    else if (!own && rostered >= Number(source.capacity) && (!policy.waitlistEnabled || waitlisted >= Number(policy.waitlistSize))) reason = policy.waitlistEnabled ? "This class and its waitlist are full." : "This class is full.";
    return await occurrenceView(ctx, context.organization, source, bookings, context.member.publicId, !own && !reason, reason);
  }));
  const historyBookings = memberBookings.filter((booking) => booking.startsAt < Date.now()).sort((a, b) => b.startsAt - a.startsAt).slice(0, 30);
  const history = await Promise.all(historyBookings.map(async (booking) => {
    const occurrence = await ctx.db.get(booking.occurrenceId);
    const branch = occurrence ? await ctx.db.get(occurrence.branchId) : null;
    if (!occurrence || !branch) return null;
    const all = await ctx.db.query("classBookings").withIndex("by_occurrence", (q) => q.eq("organizationId", context.organization._id).eq("occurrenceId", occurrence._id)).collect();
    return await occurrenceView(ctx, context.organization, persistedOccurrenceData(occurrence, branch), all, context.member.publicId);
  }));
  return {
    membershipId: context.projection.publicId,
    gymName: context.organization.name,
    timezone: context.organization.timezone || "Asia/Amman",
    policy,
    upcoming,
    history: history.filter(Boolean),
    noShowCount: memberBookings.filter((booking) => booking.status === "no_show").length,
    profileCorrectionRequired,
  };
}

async function insertClassTimeline(ctx: MutationCtx, input: { organization: Organization; branchId: Id<"branches">; memberId: string; actor: User; type: string; title: string; body?: string; meta?: Data }): Promise<void> {
  const now = Date.now();
  const publicId = crypto.randomUUID();
  await ctx.db.insert("domainRecords", {
    organizationId: input.organization._id,
    entityType: "timeline",
    publicId,
    branchId: input.branchId,
    memberPublicId: input.memberId,
    createdAt: now,
    updatedAt: now,
    data: { id: publicId, memberId: input.memberId, branchId: publicBranchId((await ctx.db.get(input.branchId))!), type: input.type, title: input.title, body: input.body, actorId: publicUserId(input.actor), actorName: input.actor.fullName, occurredAt: new Date(now).toISOString(), meta: input.meta },
  });
}

async function occurrenceAudit(ctx: MutationCtx, input: { organization: Organization; branchId: Id<"branches">; actor: User; actorRole: ActorContext["role"] | "member"; correlationId: string; action: string; occurrence: ClassOccurrence; summary: string; reason?: string; before?: unknown; after?: unknown }): Promise<void> {
  await ctx.db.insert("auditEvents", {
    organizationId: input.organization._id,
    publicId: `audit-${crypto.randomUUID()}`,
    branchId: input.branchId,
    actorUserId: input.actor._id,
    actorPublicId: publicUserId(input.actor),
    actorName: input.actor.fullName,
    actorRole: input.actorRole,
    category: "operations",
    action: input.action,
    entityType: "class_occurrence",
    entityPublicId: input.occurrence.publicId,
    entityLabel: `${input.occurrence.name} · ${input.occurrence.date}`,
    summary: input.summary,
    reason: input.reason,
    before: input.before,
    after: input.after,
    correlationId: input.correlationId,
    occurredAt: Date.now(),
  });
}

async function notifyPromotedMember(ctx: MutationCtx, organization: Organization, booking: ClassBooking, occurrence: ClassOccurrence): Promise<void> {
  const member = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "member").eq("publicId", booking.memberPublicId)).unique();
  const profileId = optionalText(valueData(member?.data).customerProfileId);
  const profile = profileId ? await ctx.db.query("customerProfiles").withIndex("by_public_id", (q) => q.eq("publicId", profileId)).unique() : null;
  const user = profile ? await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", profile.userId)).unique() : null;
  if (!user) return;
  const dedupeKey = `class-waitlist-promotion:${booking.publicId}`;
  const existing = await ctx.db.query("operationalNotifications").withIndex("by_recipient_dedupe", (q) => q.eq("recipientUserId", user._id).eq("dedupeKey", dedupeKey)).unique();
  if (existing) return;
  await ctx.db.insert("operationalNotifications", {
    publicId: crypto.randomUUID(),
    recipientUserId: user._id,
    organizationId: organization._id,
    branchId: occurrence.branchId,
    kind: "class_waitlist_promoted",
    title: `You're in ${occurrence.name}`,
    body: `A place opened for the ${occurrence.date} class. Your waitlist booking is now confirmed.`,
    href: "/customer/my-gyms",
    dedupeKey,
    expiresAt: occurrence.endsAt + 86_400_000,
    createdAt: Date.now(),
  });
}

async function promoteWaitlist(ctx: MutationCtx, organization: Organization, occurrence: ClassOccurrence): Promise<ClassBooking | undefined> {
  if (occurrence.startsAt <= Date.now()) return undefined;
  const waitlist = (await ctx.db.query("classBookings").withIndex("by_occurrence", (q) => q.eq("organizationId", organization._id).eq("occurrenceId", occurrence._id)).collect())
    .filter((booking) => booking.status === "waitlisted")
    .sort((left, right) => (left.waitlistedAt ?? left.bookedAt) - (right.waitlistedAt ?? right.bookedAt) || left.publicId.localeCompare(right.publicId));
  const promoted = waitlist[0];
  if (!promoted) return undefined;
  const now = Date.now();
  await ctx.db.patch(promoted._id, { status: "booked", promotedAt: now, fromWaitlist: true, updatedAt: now });
  const updated = (await ctx.db.get(promoted._id))!;
  await notifyPromotedMember(ctx, organization, updated, occurrence);
  const member = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization._id).eq("entityType", "member").eq("publicId", updated.memberPublicId)).unique();
  const actor = member ? await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", optionalText(valueData(member.data).customerUserId))).unique() : null;
  if (actor) await insertClassTimeline(ctx, { organization, branchId: occurrence.branchId, memberId: updated.memberPublicId, actor, type: "class_waitlist_promoted", title: `Moved into ${occurrence.name}`, body: `A place opened for ${occurrence.date}.`, meta: { occurrenceId: occurrence.publicId, bookingId: updated.publicId } });
  return updated;
}

async function createBooking(ctx: MutationCtx, input: { organization: Organization; actor: User; actorRole: ActorContext["role"] | "member"; correlationId: string; occurrence: ClassOccurrence; member: Doc<"domainRecords">; membership?: Doc<"domainRecords">; bookedBy: "member" | "staff"; overrideReason?: string }): Promise<{ booking: ClassBooking; outcome: "booked" | "waitlisted" }> {
  const member = valueData(input.member.data);
  const policy = await classPolicy(ctx, input.organization._id);
  if (!policy.enabled) domainError("FEATURE_NOT_AVAILABLE", "This gym has paused class booking.", { correlationId: input.correlationId });
  if (input.occurrence.status !== "scheduled" || input.occurrence.endsAt <= Date.now()) domainError("CONFLICT", "This class is no longer open for booking.", { correlationId: input.correlationId });
  if (input.bookedBy === "member") {
    const today = todayISODate(input.organization.timezone || "Asia/Amman");
    const daysAhead = diffDays(today, input.occurrence.date);
    if (input.occurrence.startsAt <= Date.now()) domainError("CONFLICT", "Booking closes when the class starts.", { correlationId: input.correlationId });
    if (daysAhead < 0 || daysAhead > Number(policy.bookingHorizonDays)) domainError("VALIDATION_ERROR", `Member booking is available up to ${policy.bookingHorizonDays} days ahead.`, { correlationId: input.correlationId });
  }
  const branch = await ctx.db.get(input.occurrence.branchId);
  if (!branch) domainError("NOT_FOUND", "Class branch not found.", { correlationId: input.correlationId });
  const eligibility = await membershipEligibility(ctx, input.organization, input.member.publicId, input.membership?.publicId, branch, input.occurrence.date, policy);
  if (!eligibility.membership) domainError("MEMBERSHIP_NOT_ACTIVE", eligibility.reason ?? "An active membership is required.", { correlationId: input.correlationId });
  const mismatch = !["male", "female"].includes(String(member.gender ?? ""))
    || (input.occurrence.audience === "women" && member.gender !== "female")
    || (input.occurrence.audience === "men" && member.gender !== "male");
  if (mismatch && input.bookedBy === "member") domainError("VALIDATION_ERROR", !member.gender ? "Add your gender in Profile before booking classes." : `This class is for ${input.occurrence.audience}.`, { correlationId: input.correlationId });
  if (mismatch && !optionalText(input.overrideReason)) domainError("VALIDATION_ERROR", "A reason is required to override the class audience rule.", { correlationId: input.correlationId, fieldErrors: { overrideReason: ["Required"] } });
  const existing = (await ctx.db.query("classBookings").withIndex("by_occurrence_member", (q) => q.eq("organizationId", input.organization._id).eq("occurrenceId", input.occurrence._id).eq("memberPublicId", input.member.publicId)).collect())
    .filter((booking) => ACTIVE_BOOKING_STATUSES.has(booking.status))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
  if (existing) return { booking: existing, outcome: existing.status as "booked" | "waitlisted" };
  const memberFuture = await ctx.db.query("classBookings").withIndex("by_member_start", (q) => q.eq("organizationId", input.organization._id).eq("memberPublicId", input.member.publicId).gte("startsAt", Date.now())).collect();
  if (memberFuture.filter((booking) => ACTIVE_BOOKING_STATUSES.has(booking.status)).length >= Number(policy.maxActiveBookingsPerMember) && !optionalText(input.overrideReason)) {
    domainError("VALIDATION_ERROR", `This member already has ${policy.maxActiveBookingsPerMember} active class bookings. A staff override requires a reason.`, { correlationId: input.correlationId });
  }
  const occurrenceBookings = await ctx.db.query("classBookings").withIndex("by_occurrence", (q) => q.eq("organizationId", input.organization._id).eq("occurrenceId", input.occurrence._id)).collect();
  const rostered = occurrenceBookings.filter((booking) => bookingIsRostered(booking.status)).length;
  const waitlisted = occurrenceBookings.filter((booking) => booking.status === "waitlisted").length;
  const outcome = rostered < input.occurrence.capacity ? "booked" as const : "waitlisted" as const;
  if (outcome === "waitlisted" && (!policy.waitlistEnabled || waitlisted >= Number(policy.waitlistSize))) domainError("CONFLICT", policy.waitlistEnabled ? "This class and its waitlist are full." : "This class is full.", { correlationId: input.correlationId });
  const now = Date.now();
  const publicId = crypto.randomUUID();
  const id = await ctx.db.insert("classBookings", {
    organizationId: input.organization._id,
    publicId,
    occurrenceId: input.occurrence._id,
    occurrencePublicId: input.occurrence.publicId,
    templatePublicId: input.occurrence.templatePublicId,
    branchId: input.occurrence.branchId,
    memberPublicId: input.member.publicId,
    membershipPublicId: eligibility.membership.publicId,
    memberName: String(member.fullName ?? input.member.publicId),
    startsAt: input.occurrence.startsAt,
    status: outcome,
    bookedAt: now,
    waitlistedAt: outcome === "waitlisted" ? now : undefined,
    fromWaitlist: false,
    bookedBy: input.bookedBy,
    bookedByUserPublicId: publicUserId(input.actor),
    overrideReason: optionalText(input.overrideReason),
    updatedAt: now,
  });
  const booking = (await ctx.db.get(id))!;
  await insertClassTimeline(ctx, { organization: input.organization, branchId: input.occurrence.branchId, memberId: input.member.publicId, actor: input.actor, type: outcome === "booked" ? "class_booked" : "class_waitlisted", title: outcome === "booked" ? `Booked ${input.occurrence.name}` : `Joined the ${input.occurrence.name} waitlist`, body: input.occurrence.date, meta: { occurrenceId: input.occurrence.publicId, bookingId: booking.publicId, bookedBy: input.bookedBy } });
  await occurrenceAudit(ctx, { organization: input.organization, branchId: input.occurrence.branchId, actor: input.actor, actorRole: input.actorRole, correlationId: input.correlationId, action: outcome === "booked" ? "classes.booking.create" : "classes.waitlist.join", occurrence: input.occurrence, summary: `${booking.memberName} ${outcome === "booked" ? "booked" : "joined the waitlist for"} ${input.occurrence.name}`, reason: optionalText(input.overrideReason), after: { memberId: booking.memberPublicId, membershipId: booking.membershipPublicId, status: outcome } });
  return { booking, outcome };
}

async function cancelBooking(ctx: MutationCtx, input: { organization: Organization; actor: User; actorRole: ActorContext["role"] | "member"; correlationId: string; occurrence: ClassOccurrence; booking: ClassBooking; reason?: string; requireStaffReason: boolean }): Promise<{ booking: ClassBooking; outcome: "cancelled" | "late_cancelled"; promoted?: ClassBooking }> {
  if (!ACTIVE_BOOKING_STATUSES.has(input.booking.status)) return { booking: input.booking, outcome: input.booking.status === "late_cancelled" ? "late_cancelled" : "cancelled" };
  if (input.requireStaffReason && !optionalText(input.reason)) domainError("VALIDATION_ERROR", "A reason is required when staff remove a class booking.", { correlationId: input.correlationId, fieldErrors: { reason: ["Required"] } });
  if (input.occurrence.endsAt <= Date.now()) domainError("CONFLICT", "This class has ended. Finalize attendance instead.", { correlationId: input.correlationId });
  const policy = await classPolicy(ctx, input.organization._id);
  const late = Date.now() > input.occurrence.startsAt - Number(policy.cancellationCutoffHours) * 3_600_000;
  const outcome = late ? "late_cancelled" as const : "cancelled" as const;
  const now = Date.now();
  const previousStatus = input.booking.status;
  await ctx.db.patch(input.booking._id, { status: outcome, cancelledAt: now, updatedAt: now });
  const updated = (await ctx.db.get(input.booking._id))!;
  const promoted = previousStatus === "booked" ? await promoteWaitlist(ctx, input.organization, input.occurrence) : undefined;
  await insertClassTimeline(ctx, { organization: input.organization, branchId: input.occurrence.branchId, memberId: input.booking.memberPublicId, actor: input.actor, type: outcome === "late_cancelled" ? "class_cancelled_late" : "class_cancelled", title: `Cancelled ${input.occurrence.name}`, body: optionalText(input.reason) ?? (late ? "Cancelled after the gym's cutoff. No fee or membership penalty was applied." : undefined), meta: { occurrenceId: input.occurrence.publicId, bookingId: input.booking.publicId, late } });
  await occurrenceAudit(ctx, { organization: input.organization, branchId: input.occurrence.branchId, actor: input.actor, actorRole: input.actorRole, correlationId: input.correlationId, action: outcome === "late_cancelled" ? "classes.booking.cancel_late" : "classes.booking.cancel", occurrence: input.occurrence, summary: `${input.booking.memberName} cancelled ${input.occurrence.name}`, reason: optionalText(input.reason), before: { status: previousStatus }, after: { status: outcome, promotedBookingId: promoted?.publicId } });
  return { booking: updated, outcome, promoted };
}

async function customerBookingMutation(ctx: MutationCtx, context: CustomerClassContext, operation: string, input: Data, correlationId: string): Promise<Data> {
  const occurrence = await occurrenceFromInput(ctx, context.organization, input.occurrenceId);
  if (String(valueData(context.membership.data).memberId ?? "") !== context.member.publicId) domainError("NOT_FOUND", "Membership not found.", { correlationId });
  if (operation === "customer.classes.book") {
    const created = await createBooking(ctx, { organization: context.organization, actor: context.user, actorRole: "member", correlationId, occurrence, member: context.member, membership: context.membership, bookedBy: "member" });
    const branch = await ctx.db.get(occurrence.branchId);
    const all = await ctx.db.query("classBookings").withIndex("by_occurrence", (q) => q.eq("organizationId", context.organization._id).eq("occurrenceId", occurrence._id)).collect();
    return { occurrence: await occurrenceView(ctx, context.organization, persistedOccurrenceData(occurrence, branch!), all, context.member.publicId), outcome: created.outcome };
  }
  const requestedBookingId = optionalText(input.bookingId);
  const booking = requestedBookingId
    ? await ctx.db.query("classBookings").withIndex("by_public_id", (q) => q.eq("organizationId", context.organization._id).eq("publicId", requestedBookingId)).unique()
    : (await ctx.db.query("classBookings").withIndex("by_occurrence_member", (q) => q.eq("organizationId", context.organization._id).eq("occurrenceId", occurrence._id).eq("memberPublicId", context.member.publicId)).collect())
      .filter((candidate) => ACTIVE_BOOKING_STATUSES.has(candidate.status))
      .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
  if (!booking || booking.occurrenceId !== occurrence._id || booking.memberPublicId !== context.member.publicId || booking.membershipPublicId !== context.membership.publicId) domainError("NOT_FOUND", "Class booking not found.", { correlationId });
  const cancelled = await cancelBooking(ctx, { organization: context.organization, actor: context.user, actorRole: "member", correlationId, occurrence, booking, requireStaffReason: false });
  const branch = await ctx.db.get(occurrence.branchId);
  const all = await ctx.db.query("classBookings").withIndex("by_occurrence", (q) => q.eq("organizationId", context.organization._id).eq("occurrenceId", occurrence._id)).collect();
  return { occurrence: await occurrenceView(ctx, context.organization, persistedOccurrenceData(occurrence, branch!), all, context.member.publicId), outcome: cancelled.outcome, promotedMemberId: cancelled.promoted?.memberPublicId };
}

async function addOccurrenceAttendee(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requireRosterPermission(actor);
  const occurrence = await occurrenceFromInput(ctx, actor.organization, input.occurrenceId);
  if (actor.branchScope !== "all" && !actor.branchIds.includes(occurrence.branchId)) domainError("FORBIDDEN", "Your role cannot manage this class.", { correlationId: actor.correlationId });
  const memberId = requiredText(input.memberId, "Member", actor);
  const member = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "member").eq("publicId", memberId)).unique();
  if (!member || String(valueData(member.data).status ?? "active") === "archived") domainError("NOT_FOUND", "Member not found.", { correlationId: actor.correlationId });
  await createBooking(ctx, { organization: actor.organization, actor: actor.user, actorRole: actor.role, correlationId: actor.correlationId, occurrence, member, bookedBy: "staff", overrideReason: optionalText(input.overrideReason) });
  const branch = await ctx.db.get(occurrence.branchId);
  const all = await ctx.db.query("classBookings").withIndex("by_occurrence", (q) => q.eq("organizationId", actor.organization._id).eq("occurrenceId", occurrence._id)).collect();
  return await occurrenceView(ctx, actor.organization, persistedOccurrenceData(occurrence, branch!), all);
}

async function removeOccurrenceAttendee(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requireRosterPermission(actor);
  const bookingId = requiredText(input.bookingId, "Booking", actor);
  const booking = await ctx.db.query("classBookings").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", bookingId)).unique();
  if (!booking) domainError("NOT_FOUND", "Class booking not found.", { correlationId: actor.correlationId });
  const occurrence = await ctx.db.get(booking.occurrenceId);
  if (!occurrence) domainError("NOT_FOUND", "Class occurrence not found.", { correlationId: actor.correlationId });
  if (actor.branchScope !== "all" && !actor.branchIds.includes(occurrence.branchId)) domainError("FORBIDDEN", "Your role cannot manage this class.", { correlationId: actor.correlationId });
  await cancelBooking(ctx, { organization: actor.organization, actor: actor.user, actorRole: actor.role, correlationId: actor.correlationId, occurrence, booking, reason: optionalText(input.reason), requireStaffReason: true });
  const branch = await ctx.db.get(occurrence.branchId);
  const all = await ctx.db.query("classBookings").withIndex("by_occurrence", (q) => q.eq("organizationId", actor.organization._id).eq("occurrenceId", occurrence._id)).collect();
  return await occurrenceView(ctx, actor.organization, persistedOccurrenceData(occurrence, branch!), all);
}

async function setOccurrenceAttendance(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requireRosterPermission(actor);
  const bookingId = requiredText(input.bookingId, "Booking", actor);
  const booking = await ctx.db.query("classBookings").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", bookingId)).unique();
  if (!booking) domainError("NOT_FOUND", "Class booking not found.", { correlationId: actor.correlationId });
  const occurrence = await ctx.db.get(booking.occurrenceId);
  if (!occurrence) domainError("NOT_FOUND", "Class occurrence not found.", { correlationId: actor.correlationId });
  if (actor.branchScope !== "all" && !actor.branchIds.includes(occurrence.branchId)) domainError("FORBIDDEN", "Your role cannot manage this class.", { correlationId: actor.correlationId });
  if (occurrence.attendanceFinalizedAt) domainError("CONFLICT", "Attendance is already finalized.", { correlationId: actor.correlationId });
  if (!bookingIsRostered(booking.status)) domainError("CONFLICT", "Only confirmed bookings can be marked present.", { correlationId: actor.correlationId });
  const attended = input.attended === true;
  const nextStatus = attended ? "attended" as const : "booked" as const;
  await ctx.db.patch(booking._id, { status: nextStatus, updatedAt: Date.now() });
  await occurrenceAudit(ctx, { organization: actor.organization, branchId: occurrence.branchId, actor: actor.user, actorRole: actor.role, correlationId: actor.correlationId, action: "classes.attendance.set", occurrence, summary: `${attended ? "Marked" : "Unmarked"} ${booking.memberName} ${attended ? "present" : "for attendance"}`, before: { status: booking.status }, after: { status: nextStatus } });
  const branch = await ctx.db.get(occurrence.branchId);
  const all = await ctx.db.query("classBookings").withIndex("by_occurrence", (q) => q.eq("organizationId", actor.organization._id).eq("occurrenceId", occurrence._id)).collect();
  return await occurrenceView(ctx, actor.organization, persistedOccurrenceData(occurrence, branch!), all);
}

async function finalizeOccurrenceAttendance(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requireRosterPermission(actor);
  const occurrence = await occurrenceFromInput(ctx, actor.organization, input.occurrenceId);
  if (actor.branchScope !== "all" && !actor.branchIds.includes(occurrence.branchId)) domainError("FORBIDDEN", "Your role cannot manage this class.", { correlationId: actor.correlationId });
  if (occurrence.endsAt > Date.now()) domainError("CONFLICT", "Attendance can be finalized after the class ends.", { correlationId: actor.correlationId });
  if (occurrence.attendanceFinalizedAt) {
    const branch = await ctx.db.get(occurrence.branchId);
    const current = await ctx.db.query("classBookings").withIndex("by_occurrence", (q) => q.eq("organizationId", actor.organization._id).eq("occurrenceId", occurrence._id)).collect();
    return await occurrenceView(ctx, actor.organization, persistedOccurrenceData(occurrence, branch!), current);
  }
  const policy = await classPolicy(ctx, actor.organization._id);
  const bookings = await ctx.db.query("classBookings").withIndex("by_occurrence", (q) => q.eq("organizationId", actor.organization._id).eq("occurrenceId", occurrence._id)).collect();
  const now = Date.now();
  if (policy.noShowTracking) {
    for (const booking of bookings.filter((candidate) => candidate.status === "booked")) {
      await ctx.db.patch(booking._id, { status: "no_show", updatedAt: now });
      const current = await ctx.db.query("classMemberStats").withIndex("by_member", (q) => q.eq("organizationId", actor.organization._id).eq("memberPublicId", booking.memberPublicId)).unique();
      if (current) await ctx.db.patch(current._id, { noShowCount: current.noShowCount + 1, updatedAt: now });
      else await ctx.db.insert("classMemberStats", { organizationId: actor.organization._id, memberPublicId: booking.memberPublicId, noShowCount: 1, updatedAt: now });
    }
  }
  await ctx.db.patch(occurrence._id, { status: "completed", attendanceFinalizedAt: now, attendanceFinalizedBy: publicUserId(actor.user), updatedAt: now });
  const updated = (await ctx.db.get(occurrence._id))!;
  await occurrenceAudit(ctx, { organization: actor.organization, branchId: occurrence.branchId, actor: actor.user, actorRole: actor.role, correlationId: actor.correlationId, action: "classes.attendance.finalize", occurrence: updated, summary: `Finalized attendance for ${occurrence.name}`, after: { attended: bookings.filter((booking) => booking.status === "attended").length, noShows: policy.noShowTracking ? bookings.filter((booking) => booking.status === "booked").length : 0 } });
  const branch = await ctx.db.get(updated.branchId);
  const all = await ctx.db.query("classBookings").withIndex("by_occurrence", (q) => q.eq("organizationId", actor.organization._id).eq("occurrenceId", updated._id)).collect();
  return await occurrenceView(ctx, actor.organization, persistedOccurrenceData(updated, branch!), all);
}

async function substituteOccurrenceCoach(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requirePermission(actor, "operations.manage");
  requireReason(input.reason, actor.correlationId);
  const occurrence = await occurrenceFromInput(ctx, actor.organization, input.occurrenceId);
  const coachId = requiredText(input.coachId, "Substitute coach", actor);
  const coach = await coachByPublicId(ctx, actor, coachId);
  const snapshot = valueData(coach.data);
  const before = { coachId: occurrence.coachId, coachName: occurrence.coachName };
  await ctx.db.patch(occurrence._id, { coachId, coachName: String(snapshot.name ?? coachId), substitutionReason: String(input.reason).trim(), updatedAt: Date.now() });
  const updated = (await ctx.db.get(occurrence._id))!;
  await occurrenceAudit(ctx, { organization: actor.organization, branchId: occurrence.branchId, actor: actor.user, actorRole: actor.role, correlationId: actor.correlationId, action: "classes.coach.substitute", occurrence: updated, summary: `${String(snapshot.name)} will cover ${occurrence.name}`, reason: String(input.reason).trim(), before, after: { coachId, coachName: snapshot.name } });
  const branch = await ctx.db.get(updated.branchId);
  const all = await ctx.db.query("classBookings").withIndex("by_occurrence", (q) => q.eq("organizationId", actor.organization._id).eq("occurrenceId", updated._id)).collect();
  return await occurrenceView(ctx, actor.organization, persistedOccurrenceData(updated, branch!), all);
}

function coachView(row: Doc<"domainRecords">, currency?: string): Data {
  const value = row.data as Data;
  return { id: row.publicId, name: String(value.name ?? row.publicId), phone: optionalText(value.phone), specialty: optionalText(value.specialty), currency, createdAt: new Date(row.createdAt).toISOString() };
}

async function listCoaches(ctx: QueryCtx, actor: ActorContext): Promise<Data[]> {
  requirePermission(actor, "members.read");
  return (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "coach")).collect())
    .map((row) => coachView(row, actor.organization.currency))
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

async function upsertCoach(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requirePermission(actor, "operations.manage");
  const name = requiredText(input.name, "Coach name", actor);
  if (name.length > 60) domainError("VALIDATION_ERROR", "Coach name must be 60 characters or fewer.", { correlationId: actor.correlationId });
  const phone = optionalText(input.phone);
  const specialty = optionalText(input.specialty);
  const now = Date.now();
  const requestedId = optionalText(input.coachId);
  const existing = requestedId
    ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "coach").eq("publicId", requestedId)).unique()
    : null;
  if (existing) {
    await ctx.db.patch(existing._id, { data: { ...(existing.data as Data), name, phone, specialty }, updatedAt: now });
    // Keep coach-name snapshots on classes in step with the directory.
    const sessions = await ctx.db.query("classSessions").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
    for (const session of sessions.filter((candidate) => candidate.coachUserId === existing.publicId && candidate.coachName !== name)) {
      await ctx.db.patch(session._id, { coachName: name, updatedAt: now });
    }
    return coachView((await ctx.db.get(existing._id))!, actor.organization.currency);
  }
  const publicId = crypto.randomUUID();
  const id = await ctx.db.insert("domainRecords", { organizationId: actor.organization._id, entityType: "coach", publicId, createdAt: now, updatedAt: now, data: { id: publicId, name, phone, specialty } });
  return coachView((await ctx.db.get(id))!, actor.organization.currency);
}

async function removeCoach(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<{ id: string }> {
  requirePermission(actor, "operations.manage");
  const coach = await coachByPublicId(ctx, actor, requiredText(input.coachId, "Coach", actor));
  const now = Date.now();
  // Classes keep the historical name but drop the dangling reference.
  const sessions = await ctx.db.query("classSessions").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  for (const session of sessions.filter((candidate) => candidate.coachUserId === coach.publicId)) {
    await ctx.db.patch(session._id, { coachUserId: undefined, updatedAt: now });
  }
  await ctx.db.delete(coach._id);
  return { id: coach.publicId };
}

export async function classesQuery(ctx: QueryCtx, actor: ActorContext, operation: string, input: Data): Promise<unknown> {
  switch (operation) {
    case "classes.sessions.list": return await listClassSessions(ctx, actor, input);
    case "classes.occurrences.list": return await staffOccurrences(ctx, actor, input);
    case "classes.coaches.list": return await listCoaches(ctx, actor);
    default: domainError("NOT_FOUND", `Unknown classes query ${operation}.`, { correlationId: actor.correlationId });
  }
}

export async function classesMutation(ctx: MutationCtx, actor: ActorContext, operation: string, input: Data): Promise<unknown> {
  switch (operation) {
    case "classes.session.upsert": return await upsertClassSession(ctx, actor, input);
    case "classes.session.delete": return await deleteClassSession(ctx, actor, input);
    case "classes.roster.add": return await addClassAttendee(ctx, actor, input);
    case "classes.roster.remove": return await removeClassAttendee(ctx, actor, input);
    case "classes.attendance.set": return await setClassAttendance(ctx, actor, input);
    case "classes.occurrence.roster.add": return await addOccurrenceAttendee(ctx, actor, input);
    case "classes.occurrence.roster.remove": return await removeOccurrenceAttendee(ctx, actor, input);
    case "classes.occurrence.attendance.set": return await setOccurrenceAttendance(ctx, actor, input);
    case "classes.occurrence.attendance.finalize": return await finalizeOccurrenceAttendance(ctx, actor, input);
    case "classes.occurrence.coach.substitute": return await substituteOccurrenceCoach(ctx, actor, input);
    case "classes.coach.upsert": return await upsertCoach(ctx, actor, input);
    case "classes.coach.remove": return await removeCoach(ctx, actor, input);
    default: domainError("NOT_FOUND", `Unknown classes mutation ${operation}.`, { correlationId: actor.correlationId });
  }
}

export async function customerClassesQuery(ctx: QueryCtx, context: CustomerClassContext): Promise<unknown> {
  return await customerClassExperience(ctx, context);
}

export async function customerClassesMutation(ctx: MutationCtx, context: CustomerClassContext, operation: string, input: Data, correlationId: string): Promise<unknown> {
  if (operation !== "customer.classes.book" && operation !== "customer.classes.cancel") domainError("NOT_FOUND", `Unknown customer classes mutation ${operation}.`, { correlationId });
  return await customerBookingMutation(ctx, context, operation, input, correlationId);
}
