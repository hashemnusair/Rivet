import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type MutationCtx, type QueryCtx } from "./_generated/server";

/**
 * Guarded removal of one whole tenant.
 *
 * Every function here is internal: nothing in the web app can reach it, and
 * it runs only from the Convex dashboard or `npx convex run` by an operator
 * who holds the deployment. It exists for one job, retiring a test gym so a
 * deployment can start fresh, and the guards are built for that job:
 *
 * - `listOrganizations` and `inventory` are read-only and always safe.
 * - `purge` needs the slug, the organization's exact name, a written reason
 *   and the exact acknowledgement sentence. It deletes every row the tenant
 *   owns (each table with an `organizationId`, plus the gym applications
 *   that provisioned it and the stored media files), then the organization
 *   row itself, in bounded batches so a large tenant never exceeds one
 *   transaction. It is resumable: a re-run continues where it stopped.
 * - Clerk is cleaned separately and explicitly (`clerk: "delete"`): the
 *   organization is deleted there and pending RIVET invitations that pointed
 *   at it are revoked. Clerk *users* are never deleted here.
 * - `listResidue` shows what a purge leaves behind: accounts that belong to
 *   no gym and are not platform administrators, and gym applications.
 *   `deleteResidue` removes only the accounts and applications it is handed,
 *   re-checking each one, and can delete the matching Clerk users.
 *
 * `platformAuditEvents` are kept on purpose and receive a start, completion
 * and Clerk outcome event for every purge, so the platform trail explains
 * why a gym disappeared. The runbook (docs/12) carries the procedure.
 */

export const PURGE_ACKNOWLEDGEMENT = "permanently delete this organization and everything it owns";
export const RESIDUE_ACKNOWLEDGEMENT = "permanently delete these accounts and applications";
const DEFAULT_BATCH = 100;
const MAX_BATCH = 400;
const MIN_REASON_LENGTH = 10;

/**
 * Every table that carries an organizationId. `index` names an index whose
 * first field is organizationId; `scan` tables have no such index and are
 * read page by page with a filter. `tenantPurge.test.ts` checks this list
 * against the schema so a new tenant table cannot be forgotten.
 */
export const TENANT_TABLES: ReadonlyArray<{ table: TableNames; index?: string; scan?: true; storage?: true }> = [
  { table: "organizationEntitlements", index: "by_organization" },
  { table: "workspaceModulePreferences", index: "by_organization" },
  { table: "branches", index: "by_organization" },
  { table: "zones", index: "by_organization" },
  { table: "products", index: "by_organization" },
  { table: "productTombstones", index: "by_organization" },
  { table: "suppliers", index: "by_organization" },
  { table: "inventoryBalances", index: "by_organization" },
  { table: "stockMovements", index: "by_organization" },
  { table: "inventoryTransfers", index: "by_organization" },
  { table: "retailSales", index: "by_organization" },
  { table: "inventoryAlerts", index: "by_organization" },
  { table: "supplierPayments", index: "by_organization" },
  { table: "purchaseOrders", index: "by_organization" },
  { table: "classSessions", index: "by_organization" },
  { table: "classOccurrences", index: "by_organization" },
  { table: "classBookings", index: "by_organization" },
  { table: "classMemberStats", index: "by_organization" },
  { table: "checklistTemplates", index: "by_organization" },
  { table: "checklistRuns", index: "by_template_date" },
  { table: "facilityTasks", index: "by_organization" },
  { table: "equipmentAssets", index: "by_organization" },
  { table: "equipmentIssues", index: "by_organization" },
  { table: "equipmentWorkOrders", index: "by_organization" },
  { table: "accountingAccounts", index: "by_organization" },
  { table: "accountingPeriods", index: "by_organization" },
  { table: "accountingPostingPolicies", index: "by_organization" },
  { table: "accountingJournalEntries", index: "by_organization" },
  { table: "accountingJournalLines", index: "by_entry" },
  { table: "accountingSourcePostings", index: "by_organization" },
  { table: "accountingSourceQueueRuns", index: "by_organization" },
  { table: "accountingPostingAttempts", index: "by_organization_source_key" },
  { table: "userSavedViews", index: "by_user_surface" },
  { table: "userOnboardingProgress", scan: true },
  { table: "recentWorkspaceItems", scan: true },
  { table: "pinnedWorkspaceItems", scan: true },
  { table: "operationalNotifications", scan: true },
  { table: "operationalEmailDeliveries", index: "by_organization_created" },
  { table: "subscriptionAgreements", index: "by_organization" },
  { table: "operationalEmailSettings", index: "by_organization" },
  { table: "renewalDeliveries", index: "by_organization" },
  { table: "renewalDeliveryEvents", index: "by_organization_delivery" },
  { table: "organizationMemberships", index: "by_organization" },
  { table: "roleDefinitions", index: "by_organization_role" },
  { table: "ptTrainerProfiles", index: "by_organization" },
  { table: "ptAvailabilityRules", scan: true },
  { table: "ptAvailabilityExceptions", scan: true },
  { table: "ptPackages", index: "by_organization" },
  { table: "ptPackageOrders", index: "by_organization" },
  { table: "ptEntitlements", index: "by_organization_public_id" },
  { table: "ptCreditLedger", index: "by_organization_member" },
  { table: "ptBookings", index: "by_organization_public_id" },
  { table: "mediaAssets", index: "by_organization_public_id", storage: true },
  { table: "mediaUploadIntents", index: "by_organization_expires", storage: true },
  { table: "domainRecords", index: "by_organization_type" },
  { table: "auditEvents", index: "by_organization_occurred" },
  { table: "idempotencyRecords", index: "by_organization_operation_key" },
  { table: "entryPasses", index: "by_organization_public_id" },
  { table: "sequenceCounters", index: "by_organization_key" },
];

type AnyDoc = { _id: Id<TableNames>; organizationId?: Id<"organizations">; storageId?: Id<"_storage"> };
type PurgeCounts = Record<string, number>;

// Functions in this module call each other through `internal`, so every
// handler states its return type; otherwise the generated API becomes
// circular and TypeScript widens the whole module to `any`.
type OrganizationSummary = { id: Id<"organizations">; publicId: string; name: string; slug: string; status: Doc<"organizations">["status"]; createdAt: number; clerkOrganizationId: string | null };
type LinkedApplication = { publicId: string; gymName: string; status: Doc<"gymApplications">["status"] };
type ResolvedOrganization = OrganizationSummary & { linkedApplications: LinkedApplication[] };
type PageResult = { matched: number; storageDeleted: number; cursor: string | null; done: boolean };
type Walk = { counts: PurgeCounts; storageFiles: number };
type InventoryResult = { found: false; slug: string } | { found: true; organization: ResolvedOrganization; rows: number; tables: PurgeCounts; linkedApplications: LinkedApplication[]; note: string };
type PurgeStart = OrganizationSummary & { correlationId: string };
type PurgeFinish = { applicationsDeleted: number; clerkOrganizationId: string | null; publicId: string; name: string };
type ClerkOutcome = { outcome: string; details: Record<string, unknown> };
type PurgeResult = { organization: { publicId: string; name: string; slug: string }; rows: number; tables: PurgeCounts; storageFiles: number; applicationsDeleted: number; clerk: string; correlationId: string; next: string };
type OrphanDeletion = { deleted: false; reason: string } | { deleted: true; authSubject: string; email: string };
type ApplicationDeletion = { deleted: false; reason: string } | { deleted: true; gymName: string };
type ResidueLine = { publicId: string; result: string };
type ResidueResult = { accounts: ResidueLine[]; applications: ResidueLine[] };

const SYSTEM_ACTOR = { actorPublicId: "system:tenant-purge", actorName: "RIVET tenant purge (operator CLI)" } as const;

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

function clerkUserSubject(authSubject: string): boolean {
  return authSubject.startsWith("user_");
}

async function organizationBySlug(ctx: QueryCtx | MutationCtx, slug: string): Promise<Doc<"organizations"> | null> {
  return await ctx.db.query("organizations").withIndex("by_slug", (q) => q.eq("slug", slug.trim())).unique();
}

function organizationSummary(organization: Doc<"organizations">): OrganizationSummary {
  return {
    id: organization._id,
    publicId: organization.publicId ?? "",
    name: organization.name,
    slug: organization.slug,
    status: organization.status,
    createdAt: organization.createdAt,
    clerkOrganizationId: organization.clerkOrganizationId ?? null,
  };
}

/** One bounded page of a tenant table, counted or deleted. */
async function tenantTablePage(ctx: MutationCtx, input: { organizationId: Id<"organizations">; table: string; cursor: string | null; batch: number; dryRun: boolean }): Promise<PageResult> {
  const entry = TENANT_TABLES.find((item) => item.table === input.table);
  if (!entry) throw new Error(`Unknown tenant table: ${input.table}`);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const base = ctx.db.query(entry.table as any) as any;
  let rows: AnyDoc[];
  let cursor: string | null = null;
  let done: boolean;
  if (entry.index && !input.dryRun) {
    // Deleting from the front of the index means every call starts fresh;
    // the page is exhausted when it comes back short.
    rows = await base.withIndex(entry.index, (q: any) => q.eq("organizationId", input.organizationId)).take(input.batch);
    done = rows.length < input.batch;
  } else if (entry.index) {
    const page = await base.withIndex(entry.index, (q: any) => q.eq("organizationId", input.organizationId)).paginate({ cursor: input.cursor, numItems: input.batch });
    rows = page.page;
    cursor = page.isDone ? null : page.continueCursor;
    done = page.isDone;
  } else {
    // No organization-first index: walk the whole table one page at a time
    // and keep only this tenant's rows. The cursor always advances, so a
    // large table is still read within one transaction's limits per call.
    const page = await base.paginate({ cursor: input.cursor, numItems: input.batch });
    rows = (page.page as AnyDoc[]).filter((doc) => doc.organizationId === input.organizationId);
    cursor = page.isDone ? null : page.continueCursor;
    done = page.isDone;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  let storageDeleted = 0;
  if (!input.dryRun) {
    for (const doc of rows) {
      if (entry.storage && doc.storageId) {
        try {
          await ctx.storage.delete(doc.storageId);
          storageDeleted += 1;
        } catch {
          // The file may already be gone; the row still goes.
        }
      }
      await ctx.db.delete(doc._id);
    }
  }
  return { matched: rows.length, storageDeleted, cursor, done };
}

async function linkedApplications(ctx: QueryCtx | MutationCtx, organization: { publicId: string; clerkOrganizationId: string | null }): Promise<Doc<"gymApplications">[]> {
  const rows = await ctx.db.query("gymApplications").collect();
  return rows.filter((row) => (organization.publicId && row.provisionedOrganizationId === organization.publicId) || (organization.clerkOrganizationId && row.clerkOrganizationId === organization.clerkOrganizationId));
}

async function orphanAccount(ctx: QueryCtx | MutationCtx, user: Doc<"users">): Promise<{ orphan: boolean; reason?: string }> {
  if (user.platformAdmin) return { orphan: false, reason: "platform administrator" };
  const membership = await ctx.db.query("organizationMemberships").withIndex("by_user", (q) => q.eq("userId", user._id)).first();
  if (membership) return { orphan: false, reason: "still a member of a gym workspace" };
  const publicId = user.publicId ?? "";
  const link = publicId ? await ctx.db.query("domainRecords").withIndex("by_type_customer_user", (q) => q.eq("entityType", "customerMembership").eq("customerUserPublicId", publicId)).first() : null;
  if (link) return { orphan: false, reason: "still linked to a gym membership as a member" };
  return { orphan: true };
}

async function recordPlatformEvent(ctx: MutationCtx, input: { action: string; organization: { publicId: string; name: string }; summary: string; reason?: string; before?: unknown; after?: unknown; correlationId: string }) {
  await ctx.db.insert("platformAuditEvents", {
    publicId: crypto.randomUUID(),
    ...SYSTEM_ACTOR,
    action: input.action,
    entityType: "organization",
    entityPublicId: input.organization.publicId,
    entityLabel: input.organization.name,
    summary: input.summary,
    reason: input.reason,
    before: input.before,
    after: input.after,
    correlationId: input.correlationId,
    occurredAt: Date.now(),
  });
}

// ---------------------------------------------------------------------------
// Read-only
// ---------------------------------------------------------------------------

export const listOrganizations = internalQuery({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.db.query("organizations").collect();
    return organizations
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((organization) => ({ ...organizationSummary(organization), archivedAt: organization.archivedAt ?? null }));
  },
});

export const pageTenantTable = internalMutation({
  args: { organizationId: v.id("organizations"), table: v.string(), cursor: v.union(v.string(), v.null()), batch: v.number(), dryRun: v.boolean() },
  handler: async (ctx, args): Promise<PageResult> => await tenantTablePage(ctx, { ...args, batch: Math.max(1, Math.min(MAX_BATCH, Math.floor(args.batch))) }),
});

export const resolveOrganization = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, args): Promise<ResolvedOrganization | null> => {
    const organization = await organizationBySlug(ctx, args.slug);
    if (!organization) return null;
    const summary = organizationSummary(organization);
    const applications = await linkedApplications(ctx, summary);
    return { ...summary, linkedApplications: applications.map((row) => ({ publicId: row.publicId, gymName: row.gymName, status: row.status })) };
  },
});

async function walkTenant(ctx: ActionCtx, organizationId: Id<"organizations">, batch: number, dryRun: boolean): Promise<Walk> {
  const counts: PurgeCounts = {};
  let storageFiles = 0;
  for (const entry of TENANT_TABLES) {
    let cursor: string | null = null;
    let total = 0;
    for (;;) {
      const page: PageResult = await ctx.runMutation(internal.tenantPurge.pageTenantTable, { organizationId, table: entry.table, cursor, batch, dryRun });
      total += page.matched;
      storageFiles += page.storageDeleted;
      cursor = page.cursor;
      if (page.done) break;
    }
    if (total > 0) counts[entry.table] = total;
  }
  return { counts, storageFiles };
}

/** Read-only: what a purge of this slug would remove. Safe to run any time. */
export const inventory = internalAction({
  args: { slug: v.string(), batch: v.optional(v.number()) },
  handler: async (ctx, args): Promise<InventoryResult> => {
    const organization: ResolvedOrganization | null = await ctx.runQuery(internal.tenantPurge.resolveOrganization, { slug: args.slug });
    if (!organization) return { found: false as const, slug: args.slug };
    const walk = await walkTenant(ctx, organization.id, args.batch ?? DEFAULT_BATCH, true);
    const rows = Object.values(walk.counts).reduce((sum, count) => sum + count, 0);
    return { found: true as const, organization, rows, tables: walk.counts, linkedApplications: organization.linkedApplications, note: "Nothing was changed. Media files are counted with their rows." };
  },
});

// ---------------------------------------------------------------------------
// Purge
// ---------------------------------------------------------------------------

export const beginPurge = internalMutation({
  args: { slug: v.string(), confirmName: v.string(), reason: v.string(), acknowledge: v.string() },
  handler: async (ctx, args): Promise<PurgeStart> => {
    const organization = await organizationBySlug(ctx, args.slug);
    if (!organization) throw new Error(`No organization has the slug "${args.slug.trim()}". Run tenantPurge:listOrganizations first.`);
    if (args.confirmName !== organization.name) throw new Error(`confirmName must be exactly "${organization.name}".`);
    if (args.acknowledge !== PURGE_ACKNOWLEDGEMENT) throw new Error(`acknowledge must be exactly "${PURGE_ACKNOWLEDGEMENT}".`);
    if (args.reason.trim().length < MIN_REASON_LENGTH) throw new Error(`reason must explain the purge in at least ${MIN_REASON_LENGTH} characters.`);
    const summary = organizationSummary(organization);
    const correlationId = `tenant-purge:${summary.publicId || organization._id}:${Date.now()}`;
    await recordPlatformEvent(ctx, { action: "organization.purge.started", organization: summary, summary: `Started removing ${organization.name} (${organization.slug}) and everything it owns`, reason: args.reason.trim(), before: { status: organization.status, clerkOrganizationId: summary.clerkOrganizationId }, correlationId });
    return { ...summary, correlationId };
  },
});

export const finishPurge = internalMutation({
  args: { organizationId: v.id("organizations"), correlationId: v.string(), reason: v.string(), counts: v.any(), storageFiles: v.number() },
  handler: async (ctx, args): Promise<PurgeFinish> => {
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) throw new Error("The organization row disappeared before the purge finished; check platformAuditEvents.");
    const summary = organizationSummary(organization);
    const applications = await linkedApplications(ctx, summary);
    for (const application of applications) await ctx.db.delete(application._id);
    await ctx.db.delete(organization._id);
    await recordPlatformEvent(ctx, { action: "organization.purge.completed", organization: summary, summary: `Removed ${organization.name} (${organization.slug}): ${Object.values(args.counts as PurgeCounts).reduce((sum, count) => sum + count, 0)} rows, ${args.storageFiles} stored files, ${applications.length} linked applications`, reason: args.reason, after: { tables: args.counts, storageFiles: args.storageFiles, linkedApplications: applications.map((row) => row.publicId), clerkOrganizationId: summary.clerkOrganizationId }, correlationId: args.correlationId });
    return { applicationsDeleted: applications.length, clerkOrganizationId: summary.clerkOrganizationId, publicId: summary.publicId, name: summary.name };
  },
});

export const recordClerkOutcome = internalMutation({
  args: { organization: v.object({ publicId: v.string(), name: v.string() }), correlationId: v.string(), outcome: v.string(), details: v.optional(v.any()) },
  handler: async (ctx, args): Promise<null> => {
    await recordPlatformEvent(ctx, { action: "organization.purge.clerk", organization: args.organization, summary: `Clerk cleanup for ${args.organization.name}: ${args.outcome}`, after: args.details, correlationId: args.correlationId });
    return null;
  },
});

type ClerkResult = { ok: boolean; status: number; payload: unknown };

async function clerkCall(secret: string, url: string, method: "GET" | "POST" | "DELETE"): Promise<ClerkResult> {
  try {
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" } });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    return { ok: response.ok, status: response.status, payload };
  } catch {
    return { ok: false, status: 0, payload: undefined };
  }
}

function clerkInvitationList(payload: unknown): Array<Record<string, unknown>> {
  const list = Array.isArray(payload) ? payload : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data) ? (payload as { data: unknown[] }).data : [];
  return list.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)));
}

/** Pending RIVET invitations at the Clerk instance level that pointed at this organization. */
export function invitationPointsAtOrganization(invitation: Record<string, unknown>, organizationPublicId: string): boolean {
  if (!organizationPublicId) return false;
  const metadata = [invitation.public_metadata, invitation.publicMetadata].find((value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value))) ?? {};
  return invitation.status === "pending" && (metadata.rivetOrganizationId === organizationPublicId || metadata.rivetOrganizationPublicId === organizationPublicId);
}

/**
 * Delete the Clerk organization (memberships and organization invitations go
 * with it) and revoke pending instance-level invitations that named it.
 * Users are never touched here.
 */
async function cleanUpClerk(input: { clerkOrganizationId: string | null; organizationPublicId: string }): Promise<ClerkOutcome> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) return { outcome: "skipped: CLERK_SECRET_KEY is not configured on this deployment", details: {} };
  const details: Record<string, unknown> = { organizationDeleted: false, invitationsRevoked: 0 };
  if (input.clerkOrganizationId) {
    const deleted = await clerkCall(secret, `https://api.clerk.com/v1/organizations/${encodeURIComponent(input.clerkOrganizationId)}`, "DELETE");
    details.organizationDeleted = deleted.ok;
    details.organizationStatus = deleted.status;
    if (!deleted.ok && deleted.status !== 404) return { outcome: `failed: Clerk organization delete returned HTTP ${deleted.status || "network error"}`, details };
    if (deleted.status === 404) details.organizationDeleted = "already absent";
  } else {
    details.organizationDeleted = "none recorded";
  }
  const pending = await clerkCall(secret, "https://api.clerk.com/v1/invitations?status=pending&limit=500", "GET");
  if (!pending.ok) return { outcome: `partial: organization handled, but the pending invitation list returned HTTP ${pending.status || "network error"}`, details };
  let revoked = 0;
  let revokeFailures = 0;
  for (const invitation of clerkInvitationList(pending.payload)) {
    if (!invitationPointsAtOrganization(invitation, input.organizationPublicId) || typeof invitation.id !== "string") continue;
    const result = await clerkCall(secret, `https://api.clerk.com/v1/invitations/${encodeURIComponent(invitation.id)}/revoke`, "POST");
    if (result.ok) revoked += 1;
    else revokeFailures += 1;
  }
  details.invitationsRevoked = revoked;
  details.invitationRevokeFailures = revokeFailures;
  return { outcome: revokeFailures ? `partial: ${revokeFailures} invitation revocations failed` : "completed", details };
}

/**
 * Remove one organization and everything it owns. Requires the slug, the
 * organization's exact name, a reason and the acknowledgement sentence.
 * Re-runnable: a run that stops part-way can be started again with the same
 * arguments and continues; once the organization row is gone the slug no
 * longer resolves.
 */
export const purge = internalAction({
  args: {
    slug: v.string(),
    confirmName: v.string(),
    reason: v.string(),
    acknowledge: v.string(),
    clerk: v.union(v.literal("delete"), v.literal("keep")),
    batch: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PurgeResult> => {
    const started: PurgeStart = await ctx.runMutation(internal.tenantPurge.beginPurge, { slug: args.slug, confirmName: args.confirmName, reason: args.reason, acknowledge: args.acknowledge });
    const walk = await walkTenant(ctx, started.id, args.batch ?? DEFAULT_BATCH, false);
    const finished: PurgeFinish = await ctx.runMutation(internal.tenantPurge.finishPurge, { organizationId: started.id, correlationId: started.correlationId, reason: args.reason.trim(), counts: walk.counts, storageFiles: walk.storageFiles });
    let clerk: ClerkOutcome = { outcome: "kept (clerk: keep)", details: {} };
    if (args.clerk === "delete") {
      clerk = await cleanUpClerk({ clerkOrganizationId: finished.clerkOrganizationId, organizationPublicId: finished.publicId });
    }
    await ctx.runMutation(internal.tenantPurge.recordClerkOutcome, { organization: { publicId: finished.publicId, name: finished.name }, correlationId: started.correlationId, outcome: clerk.outcome, details: clerk.details });
    return {
      organization: { publicId: started.publicId, name: started.name, slug: started.slug },
      rows: Object.values(walk.counts).reduce((sum, count) => sum + count, 0),
      tables: walk.counts,
      storageFiles: walk.storageFiles,
      applicationsDeleted: finished.applicationsDeleted,
      clerk: clerk.outcome,
      correlationId: started.correlationId,
      next: "Run tenantPurge:listResidue to see accounts and applications that no longer belong to any gym.",
    };
  },
});

// ---------------------------------------------------------------------------
// Residue: accounts and applications left without a gym
// ---------------------------------------------------------------------------

export const listResidue = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const orphans: Array<{ publicId: string; fullName: string; email: string; status: string; auth: "clerk" | "placeholder"; createdAt: number }> = [];
    let platformAdmins = 0;
    let attached = 0;
    for (const user of users) {
      if (user.platformAdmin) {
        platformAdmins += 1;
        continue;
      }
      const check = await orphanAccount(ctx, user);
      if (!check.orphan) {
        attached += 1;
        continue;
      }
      orphans.push({ publicId: user.publicId ?? String(user._id), fullName: user.fullName, email: maskEmail(user.email), status: user.status ?? "active", auth: clerkUserSubject(user.authSubject) ? "clerk" : "placeholder", createdAt: user.createdAt });
    }
    const applications = (await ctx.db.query("gymApplications").collect()).map((row) => ({ publicId: row.publicId, gymName: row.gymName, status: row.status, provisionedOrganizationId: row.provisionedOrganizationId ?? null, submittedAt: row.submittedAt }));
    const organizations = (await ctx.db.query("organizations").collect()).map((row) => ({ slug: row.slug, name: row.name, status: row.status }));
    return { organizations, platformAdmins, attachedAccounts: attached, orphanAccounts: orphans, applications };
  },
});

export const deleteOrphanAccount = internalMutation({
  args: { userPublicId: v.string() },
  handler: async (ctx, args): Promise<OrphanDeletion> => {
    const user = await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", args.userPublicId)).unique();
    if (!user) return { deleted: false as const, reason: "not found" };
    const check = await orphanAccount(ctx, user);
    if (!check.orphan) return { deleted: false as const, reason: check.reason ?? "not an orphan" };
    const publicId = user.publicId ?? "";
    for (const row of await ctx.db.query("customerProfiles").withIndex("by_user_id", (q) => q.eq("userId", publicId)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("customerMarketingPreferenceEvents").withIndex("by_user_id", (q) => q.eq("userId", publicId)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("customerProfileEvents").withIndex("by_user_id", (q) => q.eq("userId", publicId)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("pushSubscriptions").withIndex("by_user", (q) => q.eq("userId", user._id)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("userOnboardingProgress").withIndex("by_user_audience", (q) => q.eq("userId", user._id)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("recentWorkspaceItems").withIndex("by_user_organization_viewed", (q) => q.eq("userId", user._id)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("pinnedWorkspaceItems").withIndex("by_user_organization", (q) => q.eq("userId", user._id)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("operationalNotifications").withIndex("by_recipient_created", (q) => q.eq("recipientUserId", user._id)).collect()) await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("entryPasses").withIndex("by_customer", (q) => q.eq("customerUserId", user._id)).collect()) await ctx.db.delete(row._id);
    await ctx.db.delete(user._id);
    return { deleted: true as const, authSubject: user.authSubject, email: maskEmail(user.email) };
  },
});

export const deleteApplication = internalMutation({
  args: { publicId: v.string() },
  handler: async (ctx, args): Promise<ApplicationDeletion> => {
    const row = await ctx.db.query("gymApplications").withIndex("by_public_id", (q) => q.eq("publicId", args.publicId)).unique();
    if (!row) return { deleted: false as const, reason: "not found" };
    if (row.provisionedOrganizationId) {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", row.provisionedOrganizationId)).unique();
      if (organization) return { deleted: false as const, reason: `provisioned organization ${organization.slug} still exists; purge it first` };
    }
    await ctx.db.delete(row._id);
    return { deleted: true as const, gymName: row.gymName };
  },
});

export const recordResidueOutcome = internalMutation({
  args: { reason: v.string(), summary: v.string(), details: v.any() },
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.insert("platformAuditEvents", {
      publicId: crypto.randomUUID(),
      ...SYSTEM_ACTOR,
      action: "platform.residue.deleted",
      entityType: "platform",
      entityPublicId: "platform",
      entityLabel: "RIVET platform",
      summary: args.summary,
      reason: args.reason,
      after: args.details,
      correlationId: `platform-residue:${Date.now()}`,
      occurredAt: Date.now(),
    });
    return null;
  },
});

/**
 * Delete the listed orphan accounts and applications. Each account is
 * re-checked at deletion time; anything that meanwhile joined a gym, or is
 * a platform administrator, is skipped and reported. With `clerk: "delete"`
 * the matching Clerk users are deleted as well (placeholder accounts that
 * never signed in have no Clerk user).
 */
export const deleteResidue = internalAction({
  args: {
    userPublicIds: v.array(v.string()),
    applicationPublicIds: v.array(v.string()),
    reason: v.string(),
    acknowledge: v.string(),
    clerk: v.union(v.literal("delete"), v.literal("keep")),
  },
  handler: async (ctx, args): Promise<ResidueResult> => {
    if (args.acknowledge !== RESIDUE_ACKNOWLEDGEMENT) throw new Error(`acknowledge must be exactly "${RESIDUE_ACKNOWLEDGEMENT}".`);
    if (args.reason.trim().length < MIN_REASON_LENGTH) throw new Error(`reason must explain the deletion in at least ${MIN_REASON_LENGTH} characters.`);
    const secret = process.env.CLERK_SECRET_KEY;
    const accounts: ResidueLine[] = [];
    for (const publicId of args.userPublicIds) {
      const outcome: OrphanDeletion = await ctx.runMutation(internal.tenantPurge.deleteOrphanAccount, { userPublicId: publicId });
      if (!outcome.deleted) {
        accounts.push({ publicId, result: `skipped: ${outcome.reason}` });
        continue;
      }
      let clerk = "clerk kept";
      if (args.clerk === "delete") {
        if (!clerkUserSubject(outcome.authSubject)) clerk = "no Clerk user (placeholder account)";
        else if (!secret) clerk = "Clerk skipped: CLERK_SECRET_KEY is not configured";
        else {
          const result = await clerkCall(secret, `https://api.clerk.com/v1/users/${encodeURIComponent(outcome.authSubject)}`, "DELETE");
          clerk = result.ok || result.status === 404 ? "Clerk user deleted" : `Clerk delete failed: HTTP ${result.status || "network error"}`;
        }
      }
      accounts.push({ publicId, result: `deleted (${outcome.email}); ${clerk}` });
    }
    const applications: ResidueLine[] = [];
    for (const publicId of args.applicationPublicIds) {
      const outcome: ApplicationDeletion = await ctx.runMutation(internal.tenantPurge.deleteApplication, { publicId });
      applications.push({ publicId, result: outcome.deleted ? `deleted (${outcome.gymName})` : `skipped: ${outcome.reason}` });
    }
    const deletedAccounts = accounts.filter((item) => item.result.startsWith("deleted")).length;
    const deletedApplications = applications.filter((item) => item.result.startsWith("deleted")).length;
    await ctx.runMutation(internal.tenantPurge.recordResidueOutcome, { reason: args.reason.trim(), summary: `Deleted ${deletedAccounts} orphan accounts and ${deletedApplications} applications`, details: { accounts, applications, clerk: args.clerk } });
    return { accounts, applications };
  },
});
