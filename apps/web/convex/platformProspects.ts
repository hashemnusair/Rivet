import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { domainError, publicUserId, requirePlatformAdmin, type RequestArgs } from "./security";
import {
  AMMAN_PILOT_PROSPECTS,
  emptyProspectFields,
  nextProspectCode,
  normalizeProspectChanges,
  prospectChangeList,
  sameGymName,
  type PlatformProspect,
  type PlatformProspectHistoryEntry,
  type PlatformProspectOwner,
  type PlatformProspectsView,
  type ProspectChange,
  type ProspectChanges,
  type ProspectField,
  type ProspectFieldError,
  type ProspectStage,
} from "../src/lib/platform/prospects";

/**
 * Platform console → Prospects: the gyms RIVET plans to invite to a pilot.
 * Every operation is for platform administrators only, and every change is
 * written to the platform audit trail with the fields it changed, which is
 * also what the page shows as each prospect's history.
 */

type ReadContext = QueryCtx | MutationCtx;
type ProspectRow = Doc<"platformProspects">;
type PlatformAdmin = Awaited<ReturnType<typeof requirePlatformAdmin>>;
type Data = Record<string, unknown>;

export const PLATFORM_PROSPECT_QUERIES = ["platform.prospects.list", "platform.prospect.history"] as const;
export const PLATFORM_PROSPECT_MUTATIONS = ["platform.prospect.create", "platform.prospect.update", "platform.prospects.import_amman"] as const;

const ENTITY_TYPE = "platform_prospect";
const MAX_PROSPECTS = 500;
const HISTORY_LIMIT = 60;

const STAGE_NAMES: Record<ProspectStage, string> = {
  not_contacted: "Not contacted",
  contacted: "Contacted",
  replied: "Replied",
  demo_scheduled: "Demo booked",
  pilot_agreed: "Pilot agreed",
  pilot_active: "Pilot running",
  paid: "Paid",
  not_interested: "Not interested",
  on_hold: "On hold",
};

function value(input: unknown): Data {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Data : {};
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function rejectFieldErrors(fieldErrors: Partial<Record<ProspectField, ProspectFieldError>>, correlationId: string): void {
  const entries = Object.entries(fieldErrors);
  if (!entries.length) return;
  domainError("VALIDATION_ERROR", "Check the highlighted fields and try again.", {
    message: { key: "apiErrors.validation" },
    fieldErrors: Object.fromEntries(entries.map(([field, code]) => [field, [code as string]])),
    correlationId,
  });
}

async function platformOwners(ctx: ReadContext): Promise<Array<PlatformProspectOwner & { userId: Id<"users"> }>> {
  const admins = await ctx.db.query("users").withIndex("by_platform_admin", (q) => q.eq("platformAdmin", true)).collect();
  return admins
    .filter((user) => (user.status ?? "active") === "active")
    .map((user) => ({ userId: user._id, id: publicUserId(user), name: user.fullName.trim() || user.email }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

async function ownerOf(ctx: ReadContext, row: ProspectRow, known: Map<string, PlatformProspectOwner>): Promise<PlatformProspectOwner | undefined> {
  if (!row.ownerUserId) return undefined;
  const cached = known.get(String(row.ownerUserId));
  if (cached) return cached;
  // Someone who has since left the platform team still shows by name.
  const user = await ctx.db.get(row.ownerUserId);
  if (!user) return undefined;
  const owner = { id: publicUserId(user), name: user.fullName.trim() || user.email };
  known.set(String(row.ownerUserId), owner);
  return owner;
}

function prospectView(row: ProspectRow, owner: PlatformProspectOwner | undefined): PlatformProspect {
  return {
    id: row.publicId,
    code: row.code,
    gymName: row.gymName,
    area: row.area,
    batch: row.batch,
    stage: row.stage,
    ...(owner ? { owner } : {}),
    nextAction: row.nextAction,
    followUpOn: row.followUpOn,
    notes: row.notes,
    route: row.route,
    phone: row.phone,
    whatsapp: row.whatsapp,
    instagram: row.instagram,
    facebook: row.facebook,
    email: row.email,
    evidence: row.evidence,
    checkedOn: row.checkedOn,
    contactNotes: row.contactNotes,
    sources: row.sources,
    draftStatus: row.draftStatus,
    openingMessage: row.openingMessage,
    proposalMessage: row.proposalMessage,
    draftNotes: row.draftNotes,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    ...(row.updatedByName ? { updatedBy: row.updatedByName } : {}),
  };
}

async function listView(ctx: ReadContext): Promise<PlatformProspectsView> {
  const owners = await platformOwners(ctx);
  const known = new Map<string, PlatformProspectOwner>(owners.map(({ userId, ...owner }) => [String(userId), owner]));
  const rows = (await ctx.db.query("platformProspects").take(MAX_PROSPECTS)).sort((left, right) => left.code.localeCompare(right.code, "en", { numeric: true }));
  const prospects: PlatformProspect[] = [];
  for (const row of rows) prospects.push(prospectView(row, await ownerOf(ctx, row, known)));
  return { prospects, owners: owners.map(({ id, name }) => ({ id, name })) };
}

async function prospectByPublicId(ctx: ReadContext, prospectId: unknown, correlationId: string): Promise<ProspectRow> {
  const id = typeof prospectId === "string" ? prospectId.trim() : "";
  const row = id ? await ctx.db.query("platformProspects").withIndex("by_public_id", (q) => q.eq("publicId", id)).unique() : null;
  if (!row) domainError("NOT_FOUND", "Prospect not found.", { message: { key: "apiErrors.notFound" }, correlationId });
  return row;
}

/** "" clears the owner; anything else must be an active platform administrator. */
async function resolveOwner(ctx: ReadContext, ownerId: string, correlationId: string): Promise<PlatformProspectOwner & { userId: Id<"users"> } | null> {
  if (!ownerId) return null;
  const owner = (await platformOwners(ctx)).find((candidate) => candidate.id === ownerId);
  if (!owner) rejectFieldErrors({ ownerId: "unknownOwner" }, correlationId);
  return owner!;
}

async function insertAudit(ctx: MutationCtx, admin: PlatformAdmin, event: { action: string; entityPublicId: string; entityLabel: string; summary: string; before?: Data; after?: Data }): Promise<void> {
  await ctx.db.insert("platformAuditEvents", {
    publicId: crypto.randomUUID(),
    actorUserId: admin.user._id,
    actorPublicId: publicUserId(admin.user),
    actorName: admin.user.fullName,
    action: event.action,
    entityType: ENTITY_TYPE,
    entityPublicId: event.entityPublicId,
    entityLabel: event.entityLabel,
    summary: event.summary,
    ...(event.before ? { before: event.before } : {}),
    ...(event.after ? { after: event.after } : {}),
    correlationId: admin.correlationId,
    occurredAt: Date.now(),
  });
}

/** Row fields for the patch: the owner becomes a user link. */
function rowPatch(values: ProspectChanges, owner: { userId: Id<"users"> } | null | undefined): Partial<ProspectRow> {
  const { ownerId: _ownerId, ...rest } = values;
  return { ...rest, ...(owner !== undefined ? { ownerUserId: owner?.userId } : {}) } as Partial<ProspectRow>;
}

function updateSummary(row: ProspectRow, changes: ProspectChange[]): string {
  const stage = changes.find((change) => change.field === "stage");
  const label = `${row.gymName} (${row.code})`;
  if (stage && changes.length === 1) return `Moved ${label} to ${STAGE_NAMES[stage.to as ProspectStage] ?? stage.to}`;
  return `Updated ${label}: ${changes.map((change) => change.field).join(", ")}`;
}

export async function platformProspectsQuery(ctx: QueryCtx, operation: string, input: Data, request: RequestArgs): Promise<unknown> {
  const admin = await requirePlatformAdmin(ctx, request.correlationId);
  switch (operation) {
    case "platform.prospects.list":
      return await listView(ctx);
    case "platform.prospect.history": {
      const row = await prospectByPublicId(ctx, input.prospectId, admin.correlationId);
      const events = (await ctx.db.query("platformAuditEvents").withIndex("by_entity", (q) => q.eq("entityType", ENTITY_TYPE).eq("entityPublicId", row.publicId)).collect())
        .filter((event) => event.action === "prospect.updated")
        .sort((left, right) => right.occurredAt - left.occurredAt || right._creationTime - left._creationTime)
        .slice(0, HISTORY_LIMIT);
      const history: PlatformProspectHistoryEntry[] = events.map((event) => ({
        id: event.publicId,
        action: "updated",
        actorName: event.actorName,
        occurredAt: iso(event.occurredAt),
        changes: Array.isArray(value(event.after).changes) ? (value(event.after).changes as ProspectChange[]) : [],
      }));
      // The first line of every history is how the prospect got here.
      history.push({ id: `${row.publicId}-added`, action: row.source === "import" ? "imported" : "created", actorName: row.createdByName, occurredAt: iso(row.createdAt), changes: [] });
      return history;
    }
    default:
      domainError("NOT_FOUND", `Unknown prospect query ${operation}.`, { message: { key: "apiErrors.unexpected" }, correlationId: admin.correlationId });
  }
}

export async function platformProspectsMutation(ctx: MutationCtx, operation: string, input: Data, request: RequestArgs): Promise<unknown> {
  // Authorization comes first, before any validation or lookup.
  const admin = await requirePlatformAdmin(ctx, request.correlationId);
  const now = Date.now();
  switch (operation) {
    case "platform.prospects.import_amman": {
      // Loads the Amman pilot sheet once. A code already in the list is left
      // exactly as people have edited it, so running it again adds nothing.
      const existing = new Set((await ctx.db.query("platformProspects").take(MAX_PROSPECTS)).map((row) => row.code));
      let added = 0;
      for (const seed of AMMAN_PILOT_PROSPECTS) {
        if (existing.has(seed.code)) continue;
        await ctx.db.insert("platformProspects", { ...seed, publicId: crypto.randomUUID(), source: "import", followUpOn: "", sources: [...seed.sources], createdByName: admin.user.fullName, updatedByName: admin.user.fullName, createdAt: now, updatedAt: now });
        added += 1;
      }
      if (added) await insertAudit(ctx, admin, { action: "prospects.imported", entityPublicId: "amman-pilot", entityLabel: "Amman pilot list", summary: `Added ${added} gyms from the Amman pilot list`, after: { added } });
      return { added, skipped: AMMAN_PILOT_PROSPECTS.length - added };
    }
    case "platform.prospect.create": {
      const { values, fieldErrors } = normalizeProspectChanges(value(input.fields));
      if (!values.gymName && !fieldErrors.gymName) fieldErrors.gymName = "required";
      rejectFieldErrors(fieldErrors, admin.correlationId);
      const rows = await ctx.db.query("platformProspects").take(MAX_PROSPECTS);
      if (rows.length >= MAX_PROSPECTS) domainError("VALIDATION_ERROR", "The prospect list is full.", { message: { key: "apiErrors.validation" }, correlationId: admin.correlationId });
      if (rows.some((row) => sameGymName(row.gymName, values.gymName!))) rejectFieldErrors({ gymName: "duplicate" }, admin.correlationId);
      const owner = values.ownerId !== undefined ? await resolveOwner(ctx, values.ownerId, admin.correlationId) : null;
      const code = nextProspectCode(rows.map((row) => row.code));
      const publicId = crypto.randomUUID();
      const { ownerId: _ownerId, ...fields } = { ...emptyProspectFields(), ...values, gymName: values.gymName! };
      const id = await ctx.db.insert("platformProspects", { ...fields, publicId, code, source: "manual", ...(owner ? { ownerUserId: owner.userId } : {}), createdByName: admin.user.fullName, updatedByName: admin.user.fullName, createdAt: now, updatedAt: now });
      await insertAudit(ctx, admin, { action: "prospect.created", entityPublicId: publicId, entityLabel: `${fields.gymName} (${code})`, summary: `Added ${fields.gymName} (${code}) to prospects` });
      const row = (await ctx.db.get(id))!;
      return prospectView(row, owner ? { id: owner.id, name: owner.name } : undefined);
    }
    case "platform.prospect.update": {
      const row = await prospectByPublicId(ctx, input.prospectId, admin.correlationId);
      const { values, fieldErrors } = normalizeProspectChanges(value(input.changes));
      rejectFieldErrors(fieldErrors, admin.correlationId);
      if (values.gymName && !sameGymName(values.gymName, row.gymName)) {
        const others = (await ctx.db.query("platformProspects").take(MAX_PROSPECTS)).filter((other) => other._id !== row._id);
        if (others.some((other) => sameGymName(other.gymName, values.gymName!))) rejectFieldErrors({ gymName: "duplicate" }, admin.correlationId);
      }
      const known = new Map<string, PlatformProspectOwner>();
      const currentOwner = await ownerOf(ctx, row, known);
      const nextOwner = values.ownerId !== undefined ? await resolveOwner(ctx, values.ownerId, admin.correlationId) : undefined;
      // History shows owners by name, not by account id.
      const before = { ...row, ownerId: currentOwner?.name ?? "" } as unknown as Partial<Record<ProspectField, unknown>>;
      const shown: ProspectChanges = { ...values, ...(values.ownerId !== undefined ? { ownerId: nextOwner?.name ?? "" } : {}) };
      const changes = prospectChangeList(before, shown);
      if (!changes.length) return prospectView(row, currentOwner);
      await ctx.db.patch(row._id, { ...rowPatch(values, nextOwner), updatedByName: admin.user.fullName, updatedAt: now });
      await insertAudit(ctx, admin, { action: "prospect.updated", entityPublicId: row.publicId, entityLabel: `${row.gymName} (${row.code})`, summary: updateSummary(row, changes), after: { changes } });
      const updated = (await ctx.db.get(row._id))!;
      return prospectView(updated, nextOwner === undefined ? currentOwner : nextOwner ? { id: nextOwner.id, name: nextOwner.name } : undefined);
    }
    default:
      domainError("NOT_FOUND", `Unknown prospect operation ${operation}.`, { message: { key: "apiErrors.unexpected" }, correlationId: admin.correlationId });
  }
}
