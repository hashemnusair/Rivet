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
const MAX_WINDOW_DAYS = 62;
const DAY_MS = 86_400_000;

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

function timestamp(input: unknown, field: string, actor: ActorContext): number {
  const value = typeof input === "string" ? Date.parse(input) : Number.NaN;
  if (!Number.isFinite(value)) domainError("VALIDATION_ERROR", `${field} must be a valid time.`, { correlationId: actor.correlationId });
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
  if (!session) domainError("NOT_FOUND", "Class session not found.", { correlationId: actor.correlationId });
  if (actor.branchScope !== "all" && !actor.branchIds.includes(session.branchId)) {
    domainError("FORBIDDEN", "Your role cannot manage classes for this branch.", { correlationId: actor.correlationId });
  }
  return session;
}

async function classAudit(ctx: MutationCtx, actor: ActorContext, input: { action: string; session: ClassSession; summary: string; reason?: string; before?: unknown; after?: unknown }): Promise<void> {
  await ctx.db.insert("auditEvents", {
    organizationId: actor.organization._id,
    publicId: `audit-${crypto.randomUUID()}`,
    branchId: input.session.branchId,
    actorUserId: actor.user._id,
    actorPublicId: publicUserId(actor.user),
    actorName: actor.user.fullName,
    actorRole: actor.role,
    category: "operations",
    action: input.action,
    entityType: "class_session",
    entityPublicId: input.session.publicId,
    entityLabel: input.session.name,
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

async function classView(ctx: ReadContext, actor: ActorContext, session: ClassSession): Promise<Data> {
  const image = await classImageView(ctx, actor, session.imageAssetId);
  return {
    id: session.publicId,
    branchId: publicBranchId(await branchOf(ctx, actor, session)),
    name: session.name,
    coachUserId: session.coachUserId,
    coachName: session.coachName,
    startsAt: new Date(session.startsAt).toISOString(),
    durationMinutes: session.durationMinutes,
    capacity: session.capacity,
    imageAssetId: session.imageAssetId,
    ...image,
    notes: session.notes,
    status: session.status,
    cancelReason: session.cancelReason,
    roster: session.roster.map((entry) => ({ memberId: entry.memberId, name: entry.name, bookedAt: new Date(entry.bookedAt).toISOString(), attended: entry.attended })),
    attendedCount: session.roster.filter((entry) => entry.attended).length,
    createdAt: new Date(session.createdAt).toISOString(),
    updatedAt: new Date(session.updatedAt).toISOString(),
  };
}

async function branchOf(ctx: ReadContext, actor: ActorContext, session: ClassSession): Promise<Branch> {
  const branch = await ctx.db.get(session.branchId);
  if (!branch || branch.organizationId !== actor.organization._id) domainError("NOT_FOUND", "Class session branch not found.", { correlationId: actor.correlationId });
  return branch;
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
    if (previous && previous.status === "active") await ctx.db.patch(previous._id, { status: "scheduled_for_deletion", deleteAfter: now + 30 * DAY_MS, updatedAt: now });
  }
}

async function listClassSessions(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data[]> {
  requirePermission(actor, "members.read");
  const branch = await branchByPublicId(ctx, actor, optionalText(input.branchId));
  const from = input.from === undefined ? Date.now() - 7 * DAY_MS : timestamp(input.from, "The window start", actor);
  const to = input.to === undefined ? from + 7 * DAY_MS : timestamp(input.to, "The window end", actor);
  if (to < from || to - from > MAX_WINDOW_DAYS * DAY_MS) domainError("VALIDATION_ERROR", `Choose a calendar window of at most ${MAX_WINDOW_DAYS} days.`, { correlationId: actor.correlationId });
  const rows = await ctx.db
    .query("classSessions")
    .withIndex("by_branch_start", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id).gte("startsAt", from).lte("startsAt", to))
    .collect();
  const views = await Promise.all(rows.sort((left, right) => left.startsAt - right.startsAt).map((row) => classView(ctx, actor, row)));
  return views;
}

async function upsertClassSession(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requirePermission(actor, "operations.manage");
  const branch = await branchByPublicId(ctx, actor, optionalText(input.branchId));
  const name = requiredText(input.name, "Class name", actor);
  if (name.length > 80) domainError("VALIDATION_ERROR", "Class name must be 80 characters or fewer.", { correlationId: actor.correlationId });
  const startsAt = timestamp(input.startsAt, "The class start time", actor);
  const durationMinutes = boundedInteger(input.durationMinutes, "Duration", 15, MAX_DURATION_MINUTES, actor);
  const capacity = boundedInteger(input.capacity, "Capacity", 1, MAX_CAPACITY, actor);
  const notes = optionalText(input.notes);
  if (notes && notes.length > 500) domainError("VALIDATION_ERROR", "Notes must be 500 characters or fewer.", { correlationId: actor.correlationId });
  const imageAssetId = optionalText(input.imageAssetId);
  const coachUserId = optionalText(input.coachUserId);
  let coachName: string | undefined;
  if (coachUserId) {
    const coach = await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", coachUserId)).unique();
    const membership = coach ? await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", actor.organization._id).eq("userId", coach._id)).unique() : null;
    if (!coach || coach.status === "deactivated" || !membership?.active) domainError("NOT_FOUND", "Coach not found in this gym.", { correlationId: actor.correlationId });
    coachName = coach.fullName;
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
    if (existing.branchId !== branch._id) domainError("VALIDATION_ERROR", "A class session cannot move between branches.", { correlationId: actor.correlationId });
    if (existing.status === "cancelled") domainError("VALIDATION_ERROR", "A cancelled class cannot be edited. Schedule a new session instead.", { correlationId: actor.correlationId });
    if (capacity < existing.roster.length) domainError("VALIDATION_ERROR", `Capacity cannot drop below the ${existing.roster.length} people already booked.`, { correlationId: actor.correlationId });
    const before = { name: existing.name, startsAt: existing.startsAt, durationMinutes: existing.durationMinutes, capacity: existing.capacity, coachName: existing.coachName, imageAssetId: existing.imageAssetId };
    await activateClassImage(ctx, actor, imageAssetId, existing.imageAssetId);
    await ctx.db.patch(existing._id, { name, coachUserId, coachName, startsAt, durationMinutes, capacity, imageAssetId, notes, updatedAt: now });
    const updated = (await ctx.db.get(existing._id))!;
    await classAudit(ctx, actor, { action: "classes.session.update", session: updated, summary: `Updated class ${name}`, before, after: { name, startsAt, durationMinutes, capacity, coachName, imageAssetId } });
    return await classView(ctx, actor, updated);
  }

  await activateClassImage(ctx, actor, imageAssetId, undefined);
  const publicId = requestedId ?? crypto.randomUUID();
  const id = await ctx.db.insert("classSessions", {
    organizationId: actor.organization._id,
    publicId,
    branchId: branch._id,
    name,
    coachUserId,
    coachName,
    startsAt,
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
  await classAudit(ctx, actor, { action: "classes.session.create", session: created, summary: `Scheduled class ${name}`, after: { name, startsAt, durationMinutes, capacity, coachName, imageAssetId } });
  return await classView(ctx, actor, created);
}

async function cancelClassSession(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requirePermission(actor, "operations.manage");
  requireReason(input.reason, actor.correlationId);
  const session = await sessionByPublicId(ctx, actor, input.sessionId);
  if (session.status === "cancelled") return await classView(ctx, actor, session);
  const now = Date.now();
  await ctx.db.patch(session._id, { status: "cancelled", cancelReason: String(input.reason).trim(), updatedAt: now });
  const updated = (await ctx.db.get(session._id))!;
  await classAudit(ctx, actor, { action: "classes.session.cancel", session: updated, summary: `Cancelled class ${session.name}`, reason: String(input.reason).trim(), before: { status: "scheduled" }, after: { status: "cancelled" } });
  return await classView(ctx, actor, updated);
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
  if (session.status === "cancelled") domainError("VALIDATION_ERROR", "A cancelled class cannot take bookings.", { correlationId: actor.correlationId });
  const member = await rosterMember(ctx, actor, input.memberId);
  if (session.roster.some((entry) => entry.memberId === member.id)) return await classView(ctx, actor, session);
  if (session.roster.length >= session.capacity) domainError("VALIDATION_ERROR", "This class is full.", { correlationId: actor.correlationId });
  const now = Date.now();
  await ctx.db.patch(session._id, { roster: [...session.roster, { memberId: member.id, name: member.name, bookedAt: now, attended: false }], updatedAt: now });
  const updated = (await ctx.db.get(session._id))!;
  await classAudit(ctx, actor, { action: "classes.roster.add", session: updated, summary: `Added ${member.name} to ${session.name}` });
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
  await classAudit(ctx, actor, { action: "classes.roster.remove", session: updated, summary: `Removed ${entry.name} from ${session.name}` });
  return await classView(ctx, actor, updated);
}

async function setClassAttendance(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  requireRosterPermission(actor);
  const session = await sessionByPublicId(ctx, actor, input.sessionId);
  if (session.status === "cancelled") domainError("VALIDATION_ERROR", "A cancelled class has no attendance to record.", { correlationId: actor.correlationId });
  const memberId = optionalText(input.memberId);
  const attended = input.attended === true;
  const entry = session.roster.find((candidate) => candidate.memberId === memberId);
  if (!entry) domainError("NOT_FOUND", "This member is not on the class roster.", { correlationId: actor.correlationId });
  if (entry.attended === attended) return await classView(ctx, actor, session);
  const now = Date.now();
  await ctx.db.patch(session._id, { roster: session.roster.map((candidate) => candidate.memberId === memberId ? { ...candidate, attended } : candidate), updatedAt: now });
  const updated = (await ctx.db.get(session._id))!;
  await classAudit(ctx, actor, { action: "classes.attendance.set", session: updated, summary: `${attended ? "Marked" : "Unmarked"} ${entry.name} ${attended ? "present in" : "for"} ${session.name}` });
  return await classView(ctx, actor, updated);
}

export async function classesQuery(ctx: QueryCtx, actor: ActorContext, operation: string, input: Data): Promise<unknown> {
  switch (operation) {
    case "classes.sessions.list": return await listClassSessions(ctx, actor, input);
    default: domainError("NOT_FOUND", `Unknown classes query ${operation}.`, { correlationId: actor.correlationId });
  }
}

export async function classesMutation(ctx: MutationCtx, actor: ActorContext, operation: string, input: Data): Promise<unknown> {
  switch (operation) {
    case "classes.session.upsert": return await upsertClassSession(ctx, actor, input);
    case "classes.session.cancel": return await cancelClassSession(ctx, actor, input);
    case "classes.roster.add": return await addClassAttendee(ctx, actor, input);
    case "classes.roster.remove": return await removeClassAttendee(ctx, actor, input);
    case "classes.attendance.set": return await setClassAttendance(ctx, actor, input);
    default: domainError("NOT_FOUND", `Unknown classes mutation ${operation}.`, { correlationId: actor.correlationId });
  }
}
