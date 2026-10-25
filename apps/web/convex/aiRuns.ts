import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { delegatedRequest, publicBranchId, publicOrganizationId, requireActor, type ActorContext, type DelegationPrincipal, type RequestArgs } from "./security";
import { aiDomainPort, cashShiftFactsFor, executeDomainMutation, executeDomainQuery, leadFollowUpFactsFor, notifyProposalWaiting, renewalFactsForMember } from "./domain";
import { classBookingStatusFor, classOptionFactsFor } from "./classes";
import { adapterConfig, aiSettingsFor, authorityInput, LEASE_MS, monthKey, newAiPublicId, spentMicros, TENANT_CONCURRENCY, type AiGrantDoc, type AiRunDoc } from "./aiPolicy";
import { createRun, nextStandingSlot } from "./ai";
import { callModel } from "./aiModelCall";
import { runPlaybookStep, type PlaybookStepEnv } from "./aiPlaybooks";
import { PLAYBOOKS, playbookBlocked, TOOLS, toolBlocked } from "../src/lib/ai/capabilities";
import { isTerminalRunStatus, type AiErrorCategory, type AiPlaybookKey, type AiRunStatus } from "../src/lib/ai/contracts";
import { budgetBlocked, type ModelTask, type ModelTaskOutput } from "../src/lib/ai/model";
import { systemMessage } from "../src/lib/i18n/system-messages";

/**
 * The durable executor for delegated work (docs/23 §8). A run advances one
 * atomic step at a time: each step rechecks the lease, cancellation, the
 * grant, the owner's current access and the gym's settings, reloads the facts
 * it depends on, performs at most one existing domain operation through a
 * delegated principal, verifies the saved record and records its receipt, all
 * in one transaction. Model calls happen in the action, never inside a write.
 */

const runArgs = { organizationId: v.id("organizations"), runPublicId: v.string() };
const MAX_STEPS_PER_TICK = 40;
const TICK_BUDGET_MS = 15_000;

export type AdvanceResult = { done: boolean; modelTask?: ModelTask; subjectId?: string };

async function loadRun(ctx: MutationCtx, organizationId: Id<"organizations">, runPublicId: string): Promise<AiRunDoc | null> {
  return await ctx.db.query("aiRuns").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organizationId).eq("publicId", runPublicId)).unique();
}

async function loadGrant(ctx: MutationCtx, run: AiRunDoc): Promise<AiGrantDoc | null> {
  return await ctx.db.query("aiGrants").withIndex("by_organization_public_id", (q) => q.eq("organizationId", run.organizationId).eq("publicId", run.grantPublicId)).unique();
}

const STAGE_BY_STATUS: Partial<Record<AiRunStatus, string>> = {
  completed: "aiWork.stage.done",
  partially_completed: "aiWork.stage.partly",
  failed: "aiWork.stage.failed",
  cancelled: "aiWork.stage.stopped",
};

function originHref(run: AiRunDoc): string {
  switch (run.playbook as AiPlaybookKey) {
    case "renewal_followups": return `/crm/queues?view=renewals&run=${run.publicId}`;
    case "sales_followups": return `/crm/pipeline?run=${run.publicId}`;
    case "management_report": return `/reports?run=${run.publicId}`;
    case "shift_handover": return `/checklists?run=${run.publicId}`;
    case "cash_difference": return `/payments/shifts?run=${run.publicId}`;
    case "ops_triage": return `/maintenance?run=${run.publicId}`;
    case "class_finder": return `/classes?run=${run.publicId}`;
  }
}

/** Finish a run truthfully: committed effects stay reported, and one useful notice reaches the requester. */
export async function finishRun(ctx: MutationCtx, runId: Id<"aiRuns">, status: AiRunStatus, category?: AiErrorCategory): Promise<void> {
  const run = await ctx.db.get(runId);
  if (!run || isTerminalRunStatus(run.status as AiRunStatus)) return;
  const now = Date.now();
  await ctx.db.patch(run._id, { status, stage: STAGE_BY_STATUS[status] ?? run.stage, ...(category ? { errorCategory: category } : {}), leaseToken: undefined, leaseExpiresAt: undefined, completedAt: now, updatedAt: now });
  const effects = run.counts.created + run.counts.linked + run.resultRefs.length;
  const meaningful = status === "failed" || status === "partially_completed" || effects > 0;
  // Linking work that was already open is not news; a new task, report or prepared change is.
  const somethingNew = run.counts.created > 0 || run.resultRefs.some((ref) => ref.kind !== "task");
  // Scheduled checks with nothing new stay quiet; people hear about real results and real problems.
  if (!meaningful || (run.trigger === "schedule" && status === "completed" && !somethingNew)) return;
  if (run.resultRefs.some((ref) => ref.kind === "proposal")) {
    const requester = await ctx.db.get(run.requestedByUserId);
    await notifyProposalWaiting(ctx, { organizationId: run.organizationId, ...(run.branchPublicId ? { branchPublicId: run.branchPublicId } : {}), requesterName: requester?.fullName ?? "", href: originHref(run), dedupeKey: `ai-proposal:${run.publicId}`, excludeUserId: run.requestedByUserId });
  }
  const title = status === "completed" ? "Prepared work is ready" : status === "cancelled" ? "Prepared work stopped" : status === "partially_completed" ? "Prepared work partly finished" : "Prepared work could not finish";
  const key = status === "completed" ? "aiRunCompleted" : status === "cancelled" ? "aiRunStopped" : status === "partially_completed" ? "aiRunPartly" : "aiRunFailed";
  await ctx.db.insert("operationalNotifications", {
    publicId: newAiPublicId("notification"),
    recipientUserId: run.requestedByUserId,
    organizationId: run.organizationId,
    kind: "ai_run",
    title,
    titleMessage: systemMessage(`communicationCompletion.notifications.${key}`),
    body: `${run.counts.created} created · ${run.counts.linked} already open · ${run.counts.skipped} skipped`,
    bodyMessage: systemMessage("communicationCompletion.notifications.aiRunCounts", { created: run.counts.created, linked: run.counts.linked, skipped: run.counts.skipped }),
    href: originHref(run),
    dedupeKey: `ai-run:${run.publicId}:${status}`,
    createdAt: now,
  });
}

export const tick = internalAction({
  args: runArgs,
  handler: async (ctx, args): Promise<null> => {
    const lease: { token?: string } = await ctx.runMutation(internal.aiRuns.acquireLease, args);
    if (!lease.token) return null;
    const started = Date.now();
    let modelOutput: { subjectId: string; result: unknown } | undefined;
    for (let index = 0; index < MAX_STEPS_PER_TICK; index += 1) {
      let result: AdvanceResult;
      try {
        result = await ctx.runMutation(internal.aiRuns.advance, { ...args, leaseToken: lease.token, ...(modelOutput ? { modelOutput } : {}) });
      } catch (error) {
        // The step's transaction rolled back, so nothing it planned was written.
        const code = error instanceof ConvexError ? String((error.data as { code?: unknown })?.code ?? "") : "";
        const category: AiErrorCategory = code === "FORBIDDEN" ? "permission_denied" : code === "VALIDATION_ERROR" || code === "CONFLICT" ? "validation" : code === "NOT_FOUND" ? "source_changed" : "internal";
        const outcome: { done: boolean } = await ctx.runMutation(internal.aiRuns.recordStepFailure, { ...args, leaseToken: lease.token, category });
        modelOutput = undefined;
        if (outcome.done) return null;
        continue;
      }
      modelOutput = undefined;
      if (result.done) return null;
      if (result.modelTask && result.subjectId) {
        const config = adapterConfig();
        // Over budget: no call; the step keeps the approved catalogue wording.
        const overBudget: AiErrorCategory | null = await ctx.runQuery(internal.aiRuns.budgetCheck, args);
        if (overBudget) {
          modelOutput = { subjectId: result.subjectId, result: { failed: overBudget } };
          continue;
        }
        const outcome = await callModel(result.modelTask, config);
        await ctx.runMutation(internal.aiRuns.recordUsage, {
          organizationId: args.organizationId,
          runPublicId: args.runPublicId,
          task: result.modelTask.kind,
          source: config.mode === "live" ? "live" : "fixture",
          promptVersion: outcome.promptVersion,
          latencyMs: outcome.latencyMs,
          outcome: outcome.ok ? "ok" : outcome.category === "model_timeout" ? "timeout" : outcome.category === "model_malformed" ? "malformed" : outcome.category === "model_refused" ? "refused" : "unavailable",
          ...(outcome.ok ? { inputTokens: outcome.usage.inputTokens, outputTokens: outcome.usage.outputTokens, costMicros: outcome.usage.costMicros } : { errorCategory: outcome.category }),
          ...(config.model ? { model: config.model } : {}),
        });
        modelOutput = { subjectId: result.subjectId, result: outcome.ok ? outcome.output : { failed: outcome.category } };
        continue;
      }
      if (Date.now() - started > TICK_BUDGET_MS) break;
    }
    await ctx.runMutation(internal.aiRuns.releaseAndContinue, { ...args, leaseToken: lease.token });
    return null;
  },
});

export const budgetCheck = internalQuery({
  args: runArgs,
  // Convex returns null rather than undefined across a function boundary.
  handler: async (ctx, args): Promise<AiErrorCategory | null> => budgetBlocked(adapterConfig(), await spentMicros(ctx, args.organizationId, args.runPublicId)) ?? null,
});

export const acquireLease = internalMutation({
  args: runArgs,
  handler: async (ctx, args): Promise<{ token?: string }> => {
    const run = await loadRun(ctx, args.organizationId, args.runPublicId);
    if (!run || (run.status !== "queued" && run.status !== "running")) return {};
    const now = Date.now();
    if (run.leaseToken && (run.leaseExpiresAt ?? 0) > now) return {};
    const running = await ctx.db.query("aiRuns").withIndex("by_organization_status", (q) => q.eq("organizationId", run.organizationId).eq("status", "running")).take(20);
    const busy = running.filter((other) => other._id !== run._id && other.leaseToken && (other.leaseExpiresAt ?? 0) > now);
    if (busy.length >= TENANT_CONCURRENCY && !run.cancelRequestedAt) {
      await ctx.scheduler.runAfter(15_000, internal.aiRuns.tick, args);
      return {};
    }
    const token = crypto.randomUUID();
    await ctx.db.patch(run._id, { status: "running", ...(run.stage === "aiWork.stage.queued" ? { stage: "aiWork.stage.starting" } : {}), leaseToken: token, leaseExpiresAt: now + LEASE_MS, attempts: run.attempts + 1, updatedAt: now });
    return { token };
  },
});

export const releaseAndContinue = internalMutation({
  args: { ...runArgs, leaseToken: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const run = await loadRun(ctx, args.organizationId, args.runPublicId);
    if (!run || run.leaseToken !== args.leaseToken || isTerminalRunStatus(run.status as AiRunStatus)) return null;
    await ctx.db.patch(run._id, { leaseToken: undefined, leaseExpiresAt: undefined, updatedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.aiRuns.tick, { organizationId: args.organizationId, runPublicId: args.runPublicId });
    return null;
  },
});

export const recordUsage = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    runPublicId: v.optional(v.string()),
    task: v.string(),
    source: v.union(v.literal("fixture"), v.literal("live"), v.literal("rules")),
    model: v.optional(v.string()),
    promptVersion: v.string(),
    latencyMs: v.number(),
    outcome: v.union(v.literal("ok"), v.literal("timeout"), v.literal("malformed"), v.literal("refused"), v.literal("unavailable"), v.literal("blocked"), v.literal("error")),
    errorCategory: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    costMicros: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<null> => {
    const now = Date.now();
    await ctx.db.insert("aiUsage", { ...args, capability: args.task, month: monthKey(now), createdAt: now });
    if (args.runPublicId) {
      const run = await loadRun(ctx, args.organizationId, args.runPublicId);
      if (run) await ctx.db.patch(run._id, { budget: { ...run.budget, modelCalls: run.budget.modelCalls + (args.source === "live" ? 1 : 0), costMicros: run.budget.costMicros + (args.costMicros ?? 0), inputTokens: run.budget.inputTokens + (args.inputTokens ?? 0), outputTokens: run.budget.outputTokens + (args.outputTokens ?? 0) } });
    }
    return null;
  },
});

/** Resolve the delegated actor for this run right now, or the reason the authority no longer holds. */
async function resolveAuthority(ctx: MutationCtx, run: AiRunDoc, grant: AiGrantDoc | null): Promise<{ actor: ActorContext; request: RequestArgs; principal: DelegationPrincipal; entitled: string[] } | { blocked: AiErrorCategory }> {
  if (!grant || grant.status !== "active") return { blocked: "authority_revoked" };
  if (grant.expiresAt && grant.expiresAt < Date.now() && grant.kind === "one_off") return { blocked: "grant_expired" };
  const organization = await ctx.db.get(run.organizationId);
  if (!organization) return { blocked: "authority_revoked" };
  const allowedPermissions = [...new Set(grant.tools.flatMap((key) => [...(TOOLS[key]?.permissions ?? []), ...(TOOLS[key]?.optionalPermissions ?? [])]))];
  const principal: DelegationPrincipal = { userId: grant.ownerUserId, organizationId: run.organizationId, allowedPermissions, runPublicId: run.publicId, grantPublicId: grant.publicId, tool: "playbook" };
  const request = delegatedRequest({ organizationId: publicOrganizationId(organization), ...(run.branchPublicId ? { activeBranchId: run.branchPublicId } : {}), correlationId: `ai-${run.publicId}` }, principal);
  let actor: ActorContext;
  try {
    actor = await requireActor(ctx, request);
  } catch {
    return { blocked: "authority_revoked" };
  }
  const definition = PLAYBOOKS[run.playbook as AiPlaybookKey];
  if (!definition) return { blocked: "validation" };
  const entitled = await aiDomainPort.entitledModules(ctx, actor);
  const blocked = playbookBlocked(definition, await authorityInput(ctx, actor, definition.capability, entitled));
  if (blocked) return { blocked: blocked === "permission_denied" ? "authority_revoked" : blocked };
  return { actor, request, principal, entitled };
}

export const advance = internalMutation({
  args: { ...runArgs, leaseToken: v.string(), modelOutput: v.optional(v.object({ subjectId: v.string(), result: v.any() })) },
  handler: async (ctx, args): Promise<AdvanceResult> => {
    const run = await loadRun(ctx, args.organizationId, args.runPublicId);
    if (!run || isTerminalRunStatus(run.status as AiRunStatus)) return { done: true };
    const now = Date.now();
    // Fencing: a worker whose lease expired cannot commit anything.
    if (run.leaseToken !== args.leaseToken || (run.leaseExpiresAt ?? 0) <= now) return { done: true };
    await ctx.db.patch(run._id, { leaseExpiresAt: now + LEASE_MS });
    const partial = run.counts.created + run.counts.linked + run.resultRefs.length > 0;
    if (run.cancelRequestedAt) {
      await finishRun(ctx, run._id, "cancelled");
      return { done: true };
    }
    if (now > run.deadlineAt) {
      await finishRun(ctx, run._id, partial ? "partially_completed" : "failed", "deadline");
      return { done: true };
    }
    const grant = await loadGrant(ctx, run);
    const authority = await resolveAuthority(ctx, run, grant);
    if ("blocked" in authority) {
      await finishRun(ctx, run._id, partial ? "partially_completed" : "failed", authority.blocked);
      return { done: true };
    }
    const settings = await aiSettingsFor(ctx, run.organizationId);
    const env: PlaybookStepEnv = {
      run: (await ctx.db.get(run._id))!,
      grant: grant!,
      actor: authority.actor,
      entitled: authority.entitled,
      externalProcessing: settings?.externalProcessing ?? false,
      toolRequest: (toolKey: string, seq: number) => {
        const tool = TOOLS[toolKey];
        // Each tool acts with only its own declared permissions on top of the owner's current role.
        return delegatedRequest({ organizationId: publicOrganizationId(authority.actor.organization), ...(run.branchPublicId ? { activeBranchId: run.branchPublicId } : {}), correlationId: `ai-${run.publicId}-${seq}` }, { ...authority.principal, allowedPermissions: tool ? [...tool.permissions, ...(tool.optionalPermissions ?? [])] : [], tool: toolKey });
      },
      toolBlocked: async (toolKey: string) => {
        const tool = TOOLS[toolKey];
        if (!tool) return "validation";
        return toolBlocked(tool, { ...(await authorityInput(ctx, authority.actor, tool.capability, authority.entitled)), grantTools: grant!.tools, grantActive: grant!.status === "active" });
      },
      finish: async (status: AiRunStatus, category?: AiErrorCategory) => await finishRun(ctx, run._id, status, category),
      ...(args.modelOutput ? { modelOutput: args.modelOutput as { subjectId: string; result: ModelTaskOutput | { failed: AiErrorCategory } } } : {}),
      executeQuery: async (operation, input, request) => await executeDomainQuery(ctx, operation, input, request),
      executeMutation: async (operation, input, request) => await executeDomainMutation(ctx, operation, input, request),
      renewalFacts: async (memberId, membershipId) => await renewalFactsForMember(ctx, authority.actor, memberId, membershipId),
      cashShiftFacts: async (shiftId) => await cashShiftFactsFor(ctx, authority.actor, shiftId),
      leadFacts: async (leadId) => await leadFollowUpFactsFor(ctx, authority.actor, leadId),
      classOptionFacts: async (memberId, from, to) => await classOptionFactsFor(ctx, authority.actor, memberId, from, to),
      classBookingStatus: async (occurrenceKey, memberId) => await classBookingStatusFor(ctx, authority.actor, occurrenceKey, memberId),
    };
    return await runPlaybookStep(ctx, env);
  },
});

export const recordStepFailure = internalMutation({
  args: { ...runArgs, leaseToken: v.string(), category: v.string() },
  handler: async (ctx, args): Promise<{ done: boolean }> => {
    const run = await loadRun(ctx, args.organizationId, args.runPublicId);
    if (!run || isTerminalRunStatus(run.status as AiRunStatus) || run.leaseToken !== args.leaseToken) return { done: true };
    const now = Date.now();
    const subject = run.plannedSubjects[run.cursor];
    if (!subject) {
      // A planning step failed: there is no subject to skip, so the run stops here.
      await finishRun(ctx, run._id, run.counts.created > 0 ? "partially_completed" : "failed", args.category as AiErrorCategory);
      return { done: true };
    }
    await ctx.db.insert("aiRunSteps", { organizationId: run.organizationId, runPublicId: run.publicId, seq: run.cursor + 1, tool: "step", subjectId: subject.id, subjectName: subject.name, status: "failed", reason: args.category, attempts: 1, createdAt: now, updatedAt: now });
    const failed = run.counts.failed + 1;
    await ctx.db.patch(run._id, { cursor: run.cursor + 1, counts: { ...run.counts, failed }, updatedAt: now });
    // Repeated failures mean something systemic; stop rather than grind through every member.
    if (failed >= 5 && failed > run.counts.created) {
      await finishRun(ctx, run._id, run.counts.created + run.counts.linked > 0 ? "partially_completed" : "failed", args.category as AiErrorCategory);
      return { done: true };
    }
    return { done: false };
  },
});

/** Resume runs whose worker stopped mid-way (crash, deploy, timeout): their lease simply expires. */
export const recoverExpiredLeases = internalMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const now = Date.now();
    const expired = await ctx.db.query("aiRuns").withIndex("by_status_lease", (q) => q.eq("status", "running").lt("leaseExpiresAt", now)).take(50);
    const stalled = (await ctx.db.query("aiRuns").withIndex("by_status_lease", (q) => q.eq("status", "queued")).take(50)).filter((run) => run.updatedAt < now - 60_000);
    for (const run of [...expired, ...stalled]) await ctx.scheduler.runAfter(0, internal.aiRuns.tick, { organizationId: run.organizationId, runPublicId: run.publicId });
    return expired.length + stalled.length;
  },
});

/** Start due standing instructions, one run per scheduled slot, only while their owner still holds the authority. */
export const dispatchStanding = internalMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const now = Date.now();
    const due = await ctx.db.query("aiGrants").withIndex("by_status_next_run", (q) => q.eq("status", "active").lte("nextRunAt", now)).take(50);
    let started = 0;
    for (const grant of due) {
      if (grant.kind !== "standing" || !grant.schedule || !grant.nextRunAt) continue;
      const organization = await ctx.db.get(grant.organizationId);
      const slot = grant.nextRunAt;
      const next = organization ? nextStandingSlot(grant.schedule, organization.timezone, now) : undefined;
      if (!organization) continue;
      const allowedPermissions = [...new Set(grant.tools.flatMap((key) => [...(TOOLS[key]?.permissions ?? []), ...(TOOLS[key]?.optionalPermissions ?? [])]))];
      const request = delegatedRequest({ organizationId: publicOrganizationId(organization), ...(grant.branchPublicId ? { activeBranchId: grant.branchPublicId } : {}), correlationId: `ai-standing-${grant.publicId}` }, { userId: grant.ownerUserId, organizationId: grant.organizationId, allowedPermissions, runPublicId: `slot-${slot}`, grantPublicId: grant.publicId, tool: "standing" });
      let actor: ActorContext;
      try {
        actor = await requireActor(ctx, request);
      } catch {
        // The owner lost access: the instruction must not keep running by accident.
        await ctx.db.patch(grant._id, { status: "revoked", revokedAt: now, revokedReason: "owner_lost_access", nextRunAt: undefined, updatedAt: now });
        continue;
      }
      const definition = PLAYBOOKS[grant.playbook as AiPlaybookKey];
      const entitled = await aiDomainPort.entitledModules(ctx, actor);
      const blocked = definition ? playbookBlocked(definition, await authorityInput(ctx, actor, definition.capability, entitled)) : "validation";
      if (blocked) {
        // Assistance is off or narrowed for now: skip this slot without changing the instruction.
        await ctx.db.patch(grant._id, { nextRunAt: next, lastSlotKey: String(slot), updatedAt: now });
        continue;
      }
      const { requestKey: _ignored, ...params } = (grant.params ?? {}) as Record<string, string | number | boolean>;
      const run = await createRun(ctx, actor, { playbook: grant.playbook as AiPlaybookKey, params, ...(grant.branchPublicId ? { branchPublicId: grant.branchPublicId } : actor.branch ? { branchPublicId: publicBranchId(actor.branch) } : {}), requestKey: `standing:${grant.publicId}:${slot}`, trigger: "schedule", grant });
      await ctx.db.patch(grant._id, { lastRunAt: now, lastRunPublicId: run.publicId, lastSlotKey: String(slot), nextRunAt: next, updatedAt: now });
      started += 1;
    }
    return started;
  },
});

export const expireArtifacts = internalMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const rows = await ctx.db.query("aiArtifacts").withIndex("by_expires", (q) => q.lt("expiresAt", Date.now())).take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});
