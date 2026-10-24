import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { ActorContext } from "./security";
import { domainError, publicBranchId, publicUserId } from "./security";
import { CAPABILITY_KEYS, effectiveCapabilityMode, PLAYBOOKS, type AuthorityInput } from "../src/lib/ai/capabilities";
import { resolveAdapterConfig, type AiAdapterConfig } from "../src/lib/ai/model";
import type {
  AiArtifactView,
  AiCapabilityKey,
  AiErrorCategory,
  AiMemoryView,
  AiPlaybookKey,
  AiProposalView,
  AiRunStatus,
  AiRunView,
  AiSettingsView,
  AiStandingInstructionView,
  AiTenantMode,
} from "../src/lib/ai/contracts";
import { isTerminalRunStatus } from "../src/lib/ai/contracts";

/**
 * Server-side policy for RIVET assistance: deployment configuration, the
 * platform stop, gym settings, capability modes, and the views pages read.
 * Pure helpers over Convex reads; no business writes happen here.
 */

type ReadCtx = QueryCtx | MutationCtx;
export type AiSettingsDoc = Doc<"aiSettings">;
export type AiRunDoc = Doc<"aiRuns">;
export type AiGrantDoc = Doc<"aiGrants">;

export const GLOBAL_CONTROL_KEY = "global";
export const LEASE_MS = 60_000;
export const ARTIFACT_TTL_MS = 30 * 86_400_000;
export const PROPOSAL_TTL_MS = 24 * 3_600_000;
/** Runs one gym may have in progress at once; more wait in the queue. */
export const TENANT_CONCURRENCY = 2;

export function adapterConfig(): AiAdapterConfig {
  return resolveAdapterConfig({
    RIVET_AI_MODE: process.env.RIVET_AI_MODE,
    RIVET_AI_PROTOCOL: process.env.RIVET_AI_PROTOCOL,
    RIVET_AI_API_KEY: process.env.RIVET_AI_API_KEY,
    RIVET_AI_BASE_URL: process.env.RIVET_AI_BASE_URL,
    RIVET_AI_MODEL: process.env.RIVET_AI_MODEL,
    RIVET_AI_TIMEOUT_MS: process.env.RIVET_AI_TIMEOUT_MS,
    RIVET_AI_PROCESSING_APPROVED: process.env.RIVET_AI_PROCESSING_APPROVED,
    RIVET_AI_MAX_RUN_COST_MICROS: process.env.RIVET_AI_MAX_RUN_COST_MICROS,
    RIVET_AI_MAX_MONTHLY_COST_MICROS: process.env.RIVET_AI_MAX_MONTHLY_COST_MICROS,
  });
}

export function newAiPublicId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function monthKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 7);
}

export async function aiSettingsFor(ctx: ReadCtx, organizationId: Id<"organizations">): Promise<AiSettingsDoc | null> {
  return await ctx.db.query("aiSettings").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).unique();
}

export async function globalStopped(ctx: ReadCtx): Promise<{ stopped: boolean; reason?: string }> {
  const row = await ctx.db.query("aiControls").withIndex("by_key", (q) => q.eq("key", GLOBAL_CONTROL_KEY)).unique();
  return { stopped: Boolean(row?.stopped), reason: row?.reason };
}

export function tenantModeOf(settings: AiSettingsDoc | null): AiTenantMode {
  return settings?.tenantMode ?? "off";
}

export function capabilityModeOf(settings: AiSettingsDoc | null, capability: AiCapabilityKey): AiTenantMode {
  return effectiveCapabilityMode(tenantModeOf(settings), settings?.capabilityModes?.[capability], capability);
}

/** Inputs to the pure authority intersection for one actor right now. */
export async function authorityInput(ctx: ReadCtx, actor: ActorContext, capability: AiCapabilityKey, entitledModules: readonly string[]): Promise<Omit<AuthorityInput, "grantTools" | "grantActive">> {
  const [settings, stop] = await Promise.all([aiSettingsFor(ctx, actor.organization._id), globalStopped(ctx)]);
  return {
    adapterMode: adapterConfig().mode,
    globalStop: stop.stopped,
    tenantMode: tenantModeOf(settings),
    capabilityMode: capabilityModeOf(settings, capability),
    actorPermissions: actor.permissions,
    entitledModules,
  };
}

async function userName(ctx: ReadCtx, userId: Id<"users"> | undefined, cache: Map<string, string>): Promise<string> {
  if (!userId) return "";
  const key = String(userId);
  if (!cache.has(key)) cache.set(key, (await ctx.db.get(userId))?.fullName ?? "");
  return cache.get(key) ?? "";
}

export async function settingsView(ctx: ReadCtx, actor: ActorContext): Promise<AiSettingsView> {
  const config = adapterConfig();
  const [settings, stop] = await Promise.all([aiSettingsFor(ctx, actor.organization._id), globalStopped(ctx)]);
  const now = Date.now();
  const usageRows = await ctx.db.query("aiUsage").withIndex("by_organization_month", (q) => q.eq("organizationId", actor.organization._id).eq("month", monthKey(now))).take(5_000);
  const runs = await ctx.db.query("aiRuns").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id).gte("createdAt", Date.parse(`${monthKey(now)}-01T00:00:00.000Z`))).take(2_000);
  const tenantMode = tenantModeOf(settings);
  const names = new Map<string, string>();
  return {
    adapterMode: config.mode,
    adapterReady: config.ready,
    ...(config.reason ? { adapterReason: config.reason } : {}),
    globalStop: stop.stopped,
    tenantMode,
    externalProcessing: settings?.externalProcessing ?? false,
    memberDataApproved: config.memberDataApproved,
    capabilities: CAPABILITY_KEYS.map((key) => {
      const own = settings?.capabilityModes?.[key];
      const effective = effectiveCapabilityMode(tenantMode, own, key);
      return { key, mode: own ?? effectiveCapabilityMode("execute", undefined, key), effective, available: config.mode !== "off" && !stop.stopped && effective !== "off" };
    }),
    usage: {
      monthModelCalls: usageRows.filter((row) => row.source === "live").length,
      monthCostMicros: usageRows.reduce((sum, row) => sum + (row.costMicros ?? 0), 0),
      monthRuns: runs.length,
      ...(config.maxMonthlyCostMicros ? { budgetMicros: config.maxMonthlyCostMicros } : {}),
    },
    revision: settings?.revision ?? 0,
    ...(settings ? { updatedAt: new Date(settings.updatedAt).toISOString(), updatedByName: await userName(ctx, settings.updatedByUserId, names) } : {}),
    canManage: actor.permissions.includes("settings.manage") && !actor.delegation,
  };
}

/** Who may read a run: the requester, the accountable owner, or staff with the playbook's read access in scope. */
export function canReadRun(actor: ActorContext, run: AiRunDoc): boolean {
  if (run.requestedByUserId === actor.user._id || run.ownerUserId === actor.user._id) return true;
  if (actor.role === "owner" || actor.role === "manager") return true;
  const playbook = PLAYBOOKS[run.playbook as AiPlaybookKey];
  if (!playbook) return false;
  const readPermission = playbook.startPermissions[0];
  if (!readPermission || !actor.permissions.includes(readPermission)) return false;
  if (!run.branchPublicId || actor.branchScope === "all") return true;
  return Boolean(actor.branch && publicBranchId(actor.branch) === run.branchPublicId);
}

export function canControlRun(actor: ActorContext, run: AiRunDoc): boolean {
  if (actor.delegation) return false;
  return run.requestedByUserId === actor.user._id || run.ownerUserId === actor.user._id || actor.role === "owner" || actor.role === "manager";
}

export async function runView(ctx: ReadCtx, actor: ActorContext, run: AiRunDoc, options: { includeSteps?: boolean } = {}): Promise<AiRunView> {
  const names = new Map<string, string>();
  const playbook = PLAYBOOKS[run.playbook as AiPlaybookKey];
  const steps = options.includeSteps === false ? [] : await ctx.db.query("aiRunSteps").withIndex("by_organization_run", (q) => q.eq("organizationId", run.organizationId).eq("runPublicId", run.publicId)).take(500);
  const branch = run.branchPublicId ? await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", run.organizationId).eq("publicId", run.branchPublicId)).unique() : null;
  const grant = await ctx.db.query("aiGrants").withIndex("by_organization_public_id", (q) => q.eq("organizationId", run.organizationId).eq("publicId", run.grantPublicId)).unique();
  const terminal = isTerminalRunStatus(run.status as AiRunStatus);
  const control = canControlRun(actor, run);
  const committedEffects = run.counts.created + run.resultRefs.filter((ref) => (ref as { kind?: string }).kind === "artifact").length;
  return {
    id: run.publicId,
    playbook: run.playbook as AiPlaybookKey,
    playbookVersion: run.playbookVersion,
    status: run.status as AiRunStatus,
    stageKey: run.stage,
    goal: { key: playbook?.goalKey ?? "aiWork.goal.generic", params: { branch: branch?.name ?? "" } },
    ...(run.branchPublicId ? { branchId: run.branchPublicId, branchName: branch?.name ?? "" } : {}),
    requestedById: publicUserId(await ctx.db.get(run.requestedByUserId)),
    requestedByName: await userName(ctx, run.requestedByUserId, names),
    ownerId: publicUserId(await ctx.db.get(run.ownerUserId)),
    ownerName: await userName(ctx, run.ownerUserId, names),
    grantId: run.grantPublicId,
    ...(grant?.kind === "standing" ? { standingInstructionId: grant.publicId } : {}),
    trigger: run.trigger,
    counts: run.counts,
    results: run.resultRefs as AiRunView["results"],
    exclusions: run.exclusions as AiRunView["exclusions"],
    steps: steps.map((step) => ({
      id: String(step._id),
      seq: step.seq,
      capability: step.tool,
      ...(step.subjectId ? { subjectId: step.subjectId, subjectName: step.subjectName ?? "" } : {}),
      status: step.status,
      ...(step.reason ? { reason: step.reason as AiRunView["steps"][number]["reason"] } : {}),
      ...(step.resultRef ? { resultRef: step.resultRef as AiRunView["steps"][number]["resultRef"] } : {}),
      ...(step.draft ? { draft: step.draft } : {}),
      updatedAt: new Date(step.updatedAt).toISOString(),
    })),
    revisions: await Promise.all(run.revisions.map(async (revision) => ({ id: revision.id, at: new Date(revision.at).toISOString(), byName: await userName(ctx, revision.byUserId, names), text: revision.text, interpreted: revision.interpreted, appliedToRemaining: revision.appliedToRemaining }))),
    ...(run.errorCategory ? { errorCategory: run.errorCategory as AiErrorCategory } : {}),
    cancelRequested: Boolean(run.cancelRequestedAt),
    ...(run.takenOverByUserId ? { takenOverByName: await userName(ctx, run.takenOverByUserId, names) } : {}),
    committedEffects,
    budget: { modelCalls: run.budget.modelCalls, writes: run.budget.writes, maxWrites: run.limits.maxWrites, costMicros: run.budget.costMicros },
    source: run.source,
    createdAt: new Date(run.createdAt).toISOString(),
    updatedAt: new Date(run.updatedAt).toISOString(),
    ...(run.completedAt ? { completedAt: new Date(run.completedAt).toISOString() } : {}),
    allowed: {
      cancel: control && !terminal,
      revise: control && !terminal && run.playbook === "renewal_followups",
      takeOver: control && !terminal && run.plannedSubjects.length > run.cursor,
      retry: control && (run.status === "failed" || run.status === "partially_completed") && run.errorCategory !== "authority_revoked",
    },
  };
}

export async function standingView(ctx: ReadCtx, grant: AiGrantDoc): Promise<AiStandingInstructionView> {
  const names = new Map<string, string>();
  const branch = grant.branchPublicId ? await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", grant.organizationId).eq("publicId", grant.branchPublicId)).unique() : null;
  const owner = await ctx.db.get(grant.ownerUserId);
  const creator = await ctx.db.get(grant.grantorUserId);
  const playbook = PLAYBOOKS[grant.playbook as AiPlaybookKey];
  return {
    id: grant.publicId,
    playbook: grant.playbook as AiPlaybookKey,
    title: playbook?.goalKey ?? grant.playbook,
    ownerId: publicUserId(owner),
    ownerName: await userName(ctx, grant.ownerUserId, names),
    createdById: publicUserId(creator),
    ...(grant.branchPublicId ? { branchId: grant.branchPublicId, branchName: branch?.name ?? "" } : {}),
    schedule: grant.schedule ?? { weekdays: [], time: "08:00" },
    capabilities: grant.tools,
    limits: grant.limits,
    params: (grant.params ?? {}) as AiStandingInstructionView["params"],
    status: grant.status,
    revision: grant.revision,
    ...(grant.lastRunAt ? { lastRunAt: new Date(grant.lastRunAt).toISOString() } : {}),
    ...(grant.nextRunAt ? { nextRunAt: new Date(grant.nextRunAt).toISOString() } : {}),
    ...(grant.lastRunPublicId ? { lastRunId: grant.lastRunPublicId } : {}),
    ...(grant.expiresAt ? { expiresAt: new Date(grant.expiresAt).toISOString() } : {}),
    ...(grant.revokedReason ? { revokedReason: grant.revokedReason } : {}),
    createdAt: new Date(grant.createdAt).toISOString(),
    updatedAt: new Date(grant.updatedAt).toISOString(),
  };
}

export function memoryView(memory: Doc<"aiMemories">, recordedBy: { id: string; name: string }): AiMemoryView {
  return {
    id: memory.publicId,
    kind: memory.kind,
    topic: memory.topic,
    subjectType: memory.subjectType,
    subjectId: memory.subjectId,
    text: memory.text,
    effectiveFrom: memory.effectiveFrom,
    ...(memory.effectiveUntil ? { effectiveUntil: memory.effectiveUntil } : {}),
    status: memory.status,
    provenance: { sourceKind: memory.provenance.sourceKind, ...(memory.provenance.sourceId ? { sourceId: memory.provenance.sourceId } : {}), recordedById: recordedBy.id, recordedByName: recordedBy.name, recordedAt: new Date(memory.provenance.recordedAt).toISOString() },
    revision: memory.revision,
  };
}

/** Active statements for a subject; ones past their end date read as expired without a write. */
export async function activeMemories(ctx: ReadCtx, organizationId: Id<"organizations">, subjectType: Doc<"aiMemories">["subjectType"], subjectId: string, today: string): Promise<AiMemoryView[]> {
  const rows = await ctx.db.query("aiMemories").withIndex("by_organization_subject", (q) => q.eq("organizationId", organizationId).eq("subjectType", subjectType).eq("subjectId", subjectId)).take(50);
  const views: AiMemoryView[] = [];
  for (const row of rows) {
    if (row.status !== "active") continue;
    if (row.effectiveUntil && row.effectiveUntil < today) continue;
    const user = await ctx.db.get(row.provenance.recordedByUserId);
    views.push(memoryView(row, { id: publicUserId(user), name: user?.fullName ?? "" }));
  }
  return views;
}

export async function proposalView(ctx: ReadCtx, actor: ActorContext, proposal: Doc<"aiProposals">): Promise<AiProposalView> {
  const names = new Map<string, string>();
  const run = await ctx.db.query("aiRuns").withIndex("by_organization_public_id", (q) => q.eq("organizationId", proposal.organizationId).eq("publicId", proposal.runPublicId)).unique();
  const pending = proposal.status === "pending" && proposal.expiresAt > Date.now();
  // The person who asked RIVET to prepare it may approve it; RIVET never approves its own proposal.
  const mayDecide = pending && !actor.delegation && actor.permissions.includes(proposal.requiredPermission);
  return {
    id: proposal.publicId,
    runId: proposal.runPublicId,
    capability: proposal.tool,
    changes: proposal.changes.map((change) => ({ field: change.field, ...(change.from !== undefined ? { from: change.from } : {}), to: change.to })),
    subjectLabel: proposal.subjectLabel,
    changesetHash: proposal.changesetHash,
    requiredPermissionKey: proposal.requiredPermission,
    status: proposal.status === "pending" && proposal.expiresAt <= Date.now() ? "expired" : proposal.status,
    proposedAt: new Date(proposal.proposedAt).toISOString(),
    expiresAt: new Date(proposal.expiresAt).toISOString(),
    ...(proposal.decidedByUserId ? { decidedByName: await userName(ctx, proposal.decidedByUserId, names) } : {}),
    ...(proposal.invalidationReason ? { invalidationReason: proposal.invalidationReason as AiErrorCategory } : {}),
    allowed: { approve: mayDecide && Boolean(run), reject: mayDecide },
  };
}

export async function artifactView(ctx: ReadCtx, actor: ActorContext, artifact: Doc<"aiArtifacts">): Promise<AiArtifactView> {
  if (artifact.expiresAt <= Date.now()) domainError("NOT_FOUND", "This prepared work has expired. Prepare it again.", { correlationId: actor.correlationId });
  if (artifact.requiredPermissions.some((permission) => !actor.permissions.includes(permission))) domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", { correlationId: actor.correlationId });
  if (artifact.branchId && actor.branchScope === "selected" && !actor.branchIds.includes(artifact.branchId)) domainError("FORBIDDEN", "You do not have access to this branch.", { correlationId: actor.correlationId });
  const branch = artifact.branchId ? await ctx.db.get(artifact.branchId) : null;
  const content = (artifact.content ?? {}) as Pick<AiArtifactView, "sections" | "verification" | "coverage" | "titleParams">;
  return {
    id: artifact.publicId,
    kind: artifact.kind,
    title: artifact.title,
    ...(content.titleParams ? { titleParams: content.titleParams } : {}),
    ...(branch ? { branchId: publicBranchId(branch), branchName: branch.name } : {}),
    createdAt: new Date(artifact.createdAt).toISOString(),
    expiresAt: new Date(artifact.expiresAt).toISOString(),
    runId: artifact.runPublicId,
    sections: content.sections ?? [],
    verification: content.verification ?? { verified: false, checks: [] },
    coverage: content.coverage ?? [],
  };
}
