import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
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

type ReadContext = QueryCtx | MutationCtx;
type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Branch = Doc<"branches">;
type ClassSession = Doc<"classSessions">;

const MAX_CAPACITY = 200;
const MAX_DURATION_MINUTES = 8 * 60;
const DAY_MINUTES = 24 * 60;
const AUDIENCES = ["mixed", "women", "men"] as const;

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
  if (!assetId) return {};
  const asset = await ctx.db.query("mediaAssets").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", assetId)).unique();
  if (!asset || asset.ownerType !== "class_image" || !["active", "pending"].includes(asset.status)) return {};
  const url = await ctx.storage.getUrl(asset.storageId);
  return { imageUrl: url ?? undefined, imageAltText: asset.altText };
}

/** Legacy dated rows normalize into the weekly template in the gym timezone. */
function weeklySlot(session: ClassSession, timezone: string): { dayOfWeek: number; startMinute: number } {
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

function coachView(row: Doc<"domainRecords">): Data {
  const value = row.data as Data;
  return { id: row.publicId, name: String(value.name ?? row.publicId), phone: optionalText(value.phone), specialty: optionalText(value.specialty), createdAt: new Date(row.createdAt).toISOString() };
}

async function listCoaches(ctx: QueryCtx, actor: ActorContext): Promise<Data[]> {
  requirePermission(actor, "members.read");
  return (await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "coach")).collect())
    .map(coachView)
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
    return coachView((await ctx.db.get(existing._id))!);
  }
  const publicId = crypto.randomUUID();
  const id = await ctx.db.insert("domainRecords", { organizationId: actor.organization._id, entityType: "coach", publicId, createdAt: now, updatedAt: now, data: { id: publicId, name, phone, specialty } });
  return coachView((await ctx.db.get(id))!);
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
    case "classes.coach.upsert": return await upsertCoach(ctx, actor, input);
    case "classes.coach.remove": return await removeCoach(ctx, actor, input);
    default: domainError("NOT_FOUND", `Unknown classes mutation ${operation}.`, { correlationId: actor.correlationId });
  }
}
