import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { canonicalJson, jevStateBytes, jevStateHash, sanitizeJevSubject } from "./jevAnswers";
import { jevStateLoader } from "./jevLoaders";
import { gateJevRequest, resolveJevMode, utcDay, type JevGate, type JevModeResolution } from "./jevMode";
import { JEV_FEATURES, JEV_QUESTIONS, getJevQuestion } from "./jevQuestions";
import {
  JEV_MAX_STATE_BYTES,
  JEV_MODEL_ID,
  JEV_REGISTRY_VERSION,
  JEV_SIMULATIONS,
  jevTimeoutMs,
  type JevBlockReason,
  type JevCandidate,
  type JevFeatureStatus,
  type JevJudgeResult,
  type JevJudgment,
  type JevQuestion,
  type JevSimulation,
  type JevState,
  type JevStatusView,
} from "./jevRegistry";
import { PERMISSIONS, type Permission } from "./permissions";
import { domainError, hasPermission, publicOrganizationId, publicUserId, requireActor, requirePermission, type ActorContext, type ReadCtx } from "./security";

/**
 * Jev judgments, default runtime side: who may ask, whether anything may be
 * asked at all, what state is sent, what was already answered, and what is
 * kept. The model call itself lives in `jevInference.ts` (Node runtime).
 *
 * Every read here is tenant-scoped through the resolved actor. Cache rows,
 * leases, usage counters and the gym's own switch all carry the organization;
 * the only global rows are the breaker and the platform-wide daily counter.
 */

const BREAKER_KEY = "breaker";
const GLOBAL_USAGE_KEY = "global-usage";
const LEASE_GRACE_MS = 5_000;
const IN_PROGRESS_RETRY_MS = 1_500;
const REQUEST_RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_BATCH = 200;

const scopedArgs = {
  organizationId: v.optional(v.string()),
  activeBranchId: v.optional(v.string()),
  correlationId: v.string(),
};

export interface JevPreparedRequest {
  organizationDocId: Id<"organizations">;
  userId: Id<"users">;
  questionKey: string;
  mode: "fixture" | "live";
  state: JevState;
  candidates?: JevCandidate[];
  scopeKey: string;
  sourceVersion: string;
  stateHash: string;
  timeoutMs: number;
  zeroDataRetention: boolean;
  simulate?: JevSimulation;
}

export type JevPrepareResult = { status: "prepared"; request: JevPreparedRequest } | { status: "resolved"; result: JevJudgeResult };
export type JevBeginResult = { status: "started"; requestId: Id<"jevRequests"> } | { status: "resolved"; result: JevJudgeResult };

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function resolved(result: JevJudgeResult): { status: "resolved"; result: JevJudgeResult } {
  return { status: "resolved", result };
}

function blockedResult(gate: Extract<JevGate, { allowed: false }>): JevJudgeResult {
  return { status: "blocked", reason: gate.reason, message: gate.message };
}

async function controlRow(ctx: ReadCtx, key: string): Promise<Doc<"jevControlState"> | null> {
  return await ctx.db.query("jevControlState").withIndex("by_key", (q) => q.eq("key", key)).unique();
}

async function breakerState(ctx: ReadCtx): Promise<{ tripped: boolean; reason?: string; trippedAt?: number }> {
  const row = await controlRow(ctx, BREAKER_KEY);
  return row?.trippedAt ? { tripped: true, reason: row.tripReason, trippedAt: row.trippedAt } : { tripped: false };
}

async function globalRequestsToday(ctx: ReadCtx, day: string): Promise<number> {
  const row = await controlRow(ctx, GLOBAL_USAGE_KEY);
  return row && row.day === day ? row.requests ?? 0 : 0;
}

async function tenantUsage(ctx: ReadCtx, organizationId: Id<"organizations">, day: string): Promise<Doc<"jevUsage"> | null> {
  return await ctx.db.query("jevUsage").withIndex("by_organization_day", (q) => q.eq("organizationId", organizationId).eq("day", day)).unique();
}

async function tenantPreference(ctx: ReadCtx, organizationId: Id<"organizations">): Promise<Doc<"jevTenantPreferences"> | null> {
  return await ctx.db.query("jevTenantPreferences").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).unique();
}

interface GateContext {
  resolution: JevModeResolution;
  gate: JevGate;
  preference: Doc<"jevTenantPreferences"> | null;
  breaker: { tripped: boolean; reason?: string; trippedAt?: number };
  day: string;
  tenantRequests: number;
  globalRequests: number;
}

async function gateContext(ctx: ReadCtx, organizationId: Id<"organizations">, featureKey: string | undefined, now: number): Promise<GateContext> {
  const resolution = resolveJevMode(process.env, now);
  const day = utcDay(now);
  const [preference, breaker, usage, globalRequests] = await Promise.all([
    tenantPreference(ctx, organizationId),
    breakerState(ctx),
    tenantUsage(ctx, organizationId, day),
    globalRequestsToday(ctx, day),
  ]);
  const tenantRequests = usage?.requests ?? 0;
  const gate = gateJevRequest({ resolution, featureKey, tenantEnabled: preference?.enabled === true, breakerTripped: breaker.tripped, globalRequestsToday: globalRequests, tenantRequestsToday: tenantRequests });
  return { resolution, gate, preference, breaker, day, tenantRequests, globalRequests };
}

async function statusView(ctx: ReadCtx, actor: ActorContext): Promise<JevStatusView> {
  const now = Date.now();
  const context = await gateContext(ctx, actor.organization._id, undefined, now);
  const { resolution, preference, breaker } = context;
  const updatedBy = preference ? await ctx.db.get(preference.updatedByUserId) : null;
  const features: JevFeatureStatus[] = JEV_FEATURES.map((feature) => {
    const gate = gateJevRequest({ resolution, featureKey: feature.key, tenantEnabled: preference?.enabled === true, breakerTripped: breaker.tripped, globalRequestsToday: context.globalRequests, tenantRequestsToday: context.tenantRequests });
    return {
      key: feature.key,
      label: feature.label,
      description: feature.description,
      enabledGlobally: resolution.mode === "fixture" || resolution.features.includes(feature.key),
      ready: gate.allowed,
      ...(gate.allowed ? {} : { blockedReason: gate.reason }),
      questions: JEV_QUESTIONS.filter((question) => question.feature === feature.key).map((question) => ({
        key: question.key,
        label: question.label,
        description: question.description,
        kind: question.kind,
        version: question.version,
        permission: question.permission,
        synthetic: question.synthetic,
        cacheTtlMs: question.cacheTtlMs,
      })),
    };
  });
  const readyFeature = features.find((feature) => feature.ready);
  return {
    mode: resolution.mode,
    modeSource: resolution.source,
    modelId: JEV_MODEL_ID,
    registryVersion: JEV_REGISTRY_VERSION,
    keyConfigured: resolution.keyConfigured,
    freeUntil: resolution.freeUntil,
    freeTerms: resolution.freeTerms,
    zeroDataRetention: resolution.zeroDataRetention,
    breaker: { tripped: breaker.tripped, reason: breaker.reason, trippedAt: breaker.trippedAt ? iso(breaker.trippedAt) : undefined },
    tenant: { enabled: preference?.enabled === true, updatedAt: preference ? iso(preference.updatedAt) : undefined, updatedBy: updatedBy?.fullName, reason: preference?.reason },
    usage: { day: context.day, tenantRequests: context.tenantRequests, tenantDailyCap: resolution.tenantDailyCap, globalRequests: context.globalRequests, globalDailyCap: resolution.dailyCap },
    features,
    ready: Boolean(readyFeature),
    readyMode: context.gate.allowed && readyFeature ? context.gate.mode : undefined,
    blockedReason: context.gate.allowed ? (readyFeature ? undefined : "feature_off") : context.gate.reason,
    blockedMessage: context.gate.allowed ? (readyFeature ? undefined : "No feature is enabled for live Jev calls in this environment.") : context.gate.message,
    warnings: resolution.warnings,
    canManage: hasPermission(actor, "settings.manage"),
  };
}

/** Where a gym stands: environment switches, its own switch, usage and every registered question. */
export const status = query({
  args: scopedArgs,
  returns: v.any(),
  handler: async (ctx, args): Promise<JevStatusView> => {
    const actor = await requireActor(ctx, args);
    return await statusView(ctx, actor);
  },
});

/** The gym's own switch. Off by default; only a settings manager may change it, and every change is audited. */
export const updateTenantPreference = mutation({
  args: { ...scopedArgs, enabled: v.boolean(), reason: v.optional(v.string()) },
  returns: v.any(),
  handler: async (ctx, args): Promise<JevStatusView> => {
    const actor = await requireActor(ctx, args);
    requirePermission(actor, "settings.manage");
    const existing = await tenantPreference(ctx, actor.organization._id);
    const now = Date.now();
    const reason = (args.reason ?? "").trim().slice(0, 500) || undefined;
    if (existing) {
      await ctx.db.patch(existing._id, { enabled: args.enabled, reason, updatedByUserId: actor.user._id, updatedAt: now });
    } else {
      await ctx.db.insert("jevTenantPreferences", { organizationId: actor.organization._id, enabled: args.enabled, reason, updatedByUserId: actor.user._id, createdAt: now, updatedAt: now });
    }
    await ctx.db.insert("auditEvents", {
      organizationId: actor.organization._id,
      publicId: crypto.randomUUID(),
      actorUserId: actor.user._id,
      actorPublicId: publicUserId(actor.user),
      actorName: actor.user.fullName,
      actorRole: actor.role,
      category: "settings",
      action: "settings.assist.update",
      entityType: "organization",
      entityPublicId: publicOrganizationId(actor.organization),
      entityLabel: actor.organization.name,
      summary: args.enabled ? "Jev suggestions switched on for this gym" : "Jev suggestions switched off for this gym",
      reason,
      before: { enabled: existing?.enabled === true },
      after: { enabled: args.enabled },
      correlationId: actor.correlationId,
      occurredAt: now,
    });
    return await statusView(ctx, actor);
  },
});

async function cachedJudgment(ctx: ReadCtx, organizationId: Id<"organizations">, question: JevQuestion, scopeKey: string, stateHash: string, mode: "fixture" | "live", now: number): Promise<Doc<"jevJudgments"> | undefined> {
  const rows = await ctx.db
    .query("jevJudgments")
    .withIndex("by_organization_lookup", (q) => q.eq("organizationId", organizationId).eq("questionKey", question.key).eq("scopeKey", scopeKey).eq("stateHash", stateHash))
    .collect();
  return rows
    .filter((row) => row.expiresAt > now && row.source === mode && row.questionVersion === question.version && row.registryVersion === JEV_REGISTRY_VERSION && row.modelId === JEV_MODEL_ID)
    .sort((left, right) => right.createdAt - left.createdAt)[0];
}

function permissionOf(question: JevQuestion): Permission | undefined {
  return (PERMISSIONS as readonly string[]).includes(question.permission) ? (question.permission as Permission) : undefined;
}

/**
 * Everything that must be true before the model is contacted, resolved in one
 * tenant-scoped read: the caller's permission for this question, every
 * switch, the server-loaded state, its hash, and a cached answer if one
 * exists for this gym, record and state.
 */
export const prepare = internalQuery({
  args: { ...scopedArgs, questionKey: v.string(), subject: v.optional(v.any()) },
  returns: v.any(),
  handler: async (ctx, args): Promise<JevPrepareResult> => {
    const actor = await requireActor(ctx, args);
    const question = getJevQuestion(args.questionKey);
    const permission = question ? permissionOf(question) : undefined;
    if (!question || !permission) return resolved({ status: "blocked", reason: "unknown_question", message: "This suggestion is not registered." });
    requirePermission(actor, permission);
    const now = Date.now();
    const context = await gateContext(ctx, actor.organization._id, question.feature, now);
    if (!context.gate.allowed) return resolved(blockedResult(context.gate));
    const loader = jevStateLoader(question.key);
    if (!loader) return resolved({ status: "blocked", reason: "unknown_question", message: "This suggestion has no state loader." });
    const subject = sanitizeJevSubject(args.subject);
    const simulate = question.synthetic && typeof subject.simulate === "string" && (JEV_SIMULATIONS as readonly string[]).includes(subject.simulate) ? (subject.simulate as JevSimulation) : undefined;
    const loaded = await loader(ctx, actor, subject);
    if (jevStateBytes(canonicalJson(loaded.state)) > JEV_MAX_STATE_BYTES) return resolved({ status: "blocked", reason: "state_too_large", message: "This record is too large to send for a suggestion." });
    const stateHash = jevStateHash({ questionKey: question.key, questionVersion: question.version, sourceVersion: loaded.sourceVersion, state: loaded.state, candidates: loaded.candidates });
    if (question.cacheTtlMs > 0 && !simulate) {
      const cached = await cachedJudgment(ctx, actor.organization._id, question, loaded.scopeKey, stateHash, context.gate.mode, now);
      if (cached) {
        return resolved({
          status: "ready",
          source: "cache",
          judgment: cached.judgment as JevJudgment,
          questionKey: question.key,
          questionVersion: question.version,
          modelId: cached.modelId,
          stateHash,
          latencyMs: 0,
          createdAt: iso(cached.createdAt),
          correlationId: actor.correlationId,
        });
      }
    }
    return {
      status: "prepared",
      request: {
        organizationDocId: actor.organization._id,
        userId: actor.user._id,
        questionKey: question.key,
        mode: context.gate.mode,
        state: loaded.state,
        candidates: loaded.candidates,
        scopeKey: loaded.scopeKey,
        sourceVersion: loaded.sourceVersion,
        stateHash,
        timeoutMs: jevTimeoutMs(question),
        zeroDataRetention: context.resolution.zeroDataRetention,
        simulate,
      },
    };
  },
});

/**
 * Take the lease for one judgment and count it. A second identical request
 * while the first is in flight is told to wait instead of starting another
 * model call; the switches and caps are re-checked here because the mutation,
 * not the query, is the authority for counters.
 */
export const begin = internalMutation({
  args: {
    organizationDocId: v.id("organizations"),
    userId: v.id("users"),
    feature: v.string(),
    leaseKey: v.string(),
    correlationId: v.string(),
    mode: v.union(v.literal("fixture"), v.literal("live")),
    timeoutMs: v.number(),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<JevBeginResult> => {
    const now = Date.now();
    const organization = await ctx.db.get(args.organizationDocId);
    if (!organization) domainError("NOT_FOUND", "Organization not found.", { correlationId: args.correlationId });
    const context = await gateContext(ctx, organization._id, args.feature, now);
    if (!context.gate.allowed) return resolved(blockedResult(context.gate));
    if (context.gate.mode !== args.mode) return resolved({ status: "blocked", reason: "mode_off", message: "The Jev mode changed while this suggestion was being prepared. Ask again." });

    const pending = await ctx.db
      .query("jevRequests")
      .withIndex("by_organization_lease", (q) => q.eq("organizationId", organization._id).eq("leaseKey", args.leaseKey))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();
    if (pending.some((row) => row.leaseExpiresAt > now)) return resolved({ status: "in_progress", retryAfterMs: IN_PROGRESS_RETRY_MS });

    const requestId = await ctx.db.insert("jevRequests", {
      organizationId: organization._id,
      leaseKey: args.leaseKey,
      status: "pending",
      mode: args.mode,
      requestedByUserId: args.userId,
      correlationId: args.correlationId,
      startedAt: now,
      leaseExpiresAt: now + args.timeoutMs + LEASE_GRACE_MS,
    });

    const usage = await tenantUsage(ctx, organization._id, context.day);
    if (usage) await ctx.db.patch(usage._id, { requests: usage.requests + 1, updatedAt: now });
    else await ctx.db.insert("jevUsage", { organizationId: organization._id, day: context.day, requests: 1, inputTokens: 0, outputTokens: 0, reportedCostUsd: 0, updatedAt: now });
    const global = await controlRow(ctx, GLOBAL_USAGE_KEY);
    if (global) await ctx.db.patch(global._id, { day: context.day, requests: global.day === context.day ? (global.requests ?? 0) + 1 : 1, updatedAt: now });
    else await ctx.db.insert("jevControlState", { key: GLOBAL_USAGE_KEY, day: context.day, requests: 1, updatedAt: now });
    return { status: "started", requestId };
  },
});

async function tripBreaker(ctx: MutationCtx, reason: string, now: number): Promise<void> {
  const row = await controlRow(ctx, BREAKER_KEY);
  if (row) await ctx.db.patch(row._id, { trippedAt: now, tripReason: reason, updatedAt: now });
  else await ctx.db.insert("jevControlState", { key: BREAKER_KEY, trippedAt: now, tripReason: reason, updatedAt: now });
}

/**
 * Record a validated judgment. The state is loaded again and re-hashed: if
 * the record changed while the model was answering, the answer is marked
 * stale and never shown or cached. A reported cost trips the breaker so no
 * further live call is made until an operator has looked.
 */
export const complete = internalMutation({
  args: {
    requestId: v.id("jevRequests"),
    ...scopedArgs,
    questionKey: v.string(),
    subject: v.optional(v.any()),
    stateHash: v.string(),
    source: v.union(v.literal("fixture"), v.literal("live")),
    judgment: v.any(),
    modelId: v.string(),
    modelVersion: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    reportedCostUsd: v.optional(v.number()),
    latencyMs: v.number(),
    warnings: v.array(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<JevJudgeResult> => {
    const actor = await requireActor(ctx, args);
    const request = await ctx.db.get(args.requestId);
    if (!request || request.organizationId !== actor.organization._id) domainError("NOT_FOUND", "Suggestion request not found.", { correlationId: args.correlationId });
    const now = Date.now();
    const question = getJevQuestion(args.questionKey);
    const judgment = args.judgment as JevJudgment | undefined;

    const usage = await tenantUsage(ctx, actor.organization._id, utcDay(now));
    if (usage) {
      await ctx.db.patch(usage._id, {
        inputTokens: usage.inputTokens + (args.inputTokens ?? 0),
        outputTokens: usage.outputTokens + (args.outputTokens ?? 0),
        reportedCostUsd: usage.reportedCostUsd + (args.reportedCostUsd ?? 0),
        updatedAt: now,
      });
    }

    let warning: string | undefined;
    if (args.source === "live" && (args.reportedCostUsd ?? 0) > 0) {
      const reason = `AI Gateway reported a cost of ${args.reportedCostUsd} USD for a Jev request (correlation ${args.correlationId}).`;
      await tripBreaker(ctx, reason, now);
      warning = "AI Gateway reported a cost for this request. Live Jev calls are now stopped until an operator resets the breaker.";
      console.warn("[rivet.jev.breaker]", JSON.stringify({ correlationId: args.correlationId, reportedCostUsd: args.reportedCostUsd }));
    }

    if (!question || !judgment || judgment.kind !== question.kind) {
      await ctx.db.patch(request._id, { status: "failed", finishedAt: now, latencyMs: args.latencyMs, failureReason: "invalid_output", failureMessage: "The judgment did not match the question." });
      return { status: "unavailable", reason: "invalid_output", message: "The model answer could not be used.", retryable: false, correlationId: args.correlationId };
    }

    const loader = jevStateLoader(question.key);
    const loaded = loader ? await loader(ctx, actor, sanitizeJevSubject(args.subject)) : undefined;
    const currentHash = loaded ? jevStateHash({ questionKey: question.key, questionVersion: question.version, sourceVersion: loaded.sourceVersion, state: loaded.state, candidates: loaded.candidates }) : undefined;
    if (!loaded || currentHash !== args.stateHash) {
      await ctx.db.patch(request._id, { status: "stale", finishedAt: now, latencyMs: args.latencyMs, inputTokens: args.inputTokens, outputTokens: args.outputTokens, reportedCostUsd: args.reportedCostUsd });
      return { status: "stale", message: "The record changed while the suggestion was being prepared. Refresh to ask again." };
    }

    if (question.cacheTtlMs > 0) {
      await ctx.db.insert("jevJudgments", {
        organizationId: actor.organization._id,
        questionKey: question.key,
        questionVersion: question.version,
        registryVersion: JEV_REGISTRY_VERSION,
        scopeKey: loaded.scopeKey,
        stateHash: args.stateHash,
        sourceVersion: loaded.sourceVersion,
        source: args.source,
        modelId: args.modelId,
        modelVersion: args.modelVersion,
        judgment,
        inputTokens: args.inputTokens,
        outputTokens: args.outputTokens,
        reportedCostUsd: args.reportedCostUsd,
        latencyMs: args.latencyMs,
        requestedByUserId: actor.user._id,
        correlationId: args.correlationId,
        createdAt: now,
        expiresAt: now + question.cacheTtlMs,
      });
    }
    await ctx.db.patch(request._id, { status: "completed", finishedAt: now, latencyMs: args.latencyMs, inputTokens: args.inputTokens, outputTokens: args.outputTokens, reportedCostUsd: args.reportedCostUsd });
    return {
      status: "ready",
      source: args.source,
      judgment,
      questionKey: question.key,
      questionVersion: question.version,
      modelId: args.modelId,
      stateHash: args.stateHash,
      latencyMs: args.latencyMs,
      createdAt: iso(now),
      correlationId: args.correlationId,
      ...(warning ? { warning } : {}),
    };
  },
});

/** Release a lease after a failed call, keeping the classified reason for the request log. */
export const fail = internalMutation({
  args: { requestId: v.id("jevRequests"), reason: v.string(), message: v.string(), latencyMs: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return null;
    await ctx.db.patch(request._id, { status: "failed", finishedAt: Date.now(), latencyMs: args.latencyMs, failureReason: args.reason.slice(0, 64), failureMessage: args.message.slice(0, 500) });
    return null;
  },
});

/**
 * Operator-only (CLI or dashboard; never callable from the web app): clear
 * the zero-cost breaker after reviewing the AI Gateway bill and the reason.
 */
export const resetBreaker = internalMutation({
  args: { reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reason = args.reason.trim();
    if (reason.length < 10) domainError("VALIDATION_ERROR", "Give a reason of at least ten characters for resetting the Jev breaker.");
    const now = Date.now();
    const row = await controlRow(ctx, BREAKER_KEY);
    if (row) await ctx.db.patch(row._id, { trippedAt: undefined, tripReason: undefined, resetAt: now, resetReason: reason, updatedAt: now });
    else await ctx.db.insert("jevControlState", { key: BREAKER_KEY, resetAt: now, resetReason: reason, updatedAt: now });
    return null;
  },
});

/** Hourly: drop expired cached judgments and request rows older than a day, in bounded pages. */
export const cleanupExpired = internalMutation({
  args: {},
  returns: v.object({ judgments: v.number(), requests: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const judgments = await ctx.db.query("jevJudgments").withIndex("by_expires", (q) => q.lt("expiresAt", now)).take(CLEANUP_BATCH);
    for (const row of judgments) await ctx.db.delete(row._id);
    const requests = await ctx.db.query("jevRequests").withIndex("by_lease_expires", (q) => q.lt("leaseExpiresAt", now - REQUEST_RETENTION_MS)).take(CLEANUP_BATCH);
    for (const row of requests) await ctx.db.delete(row._id);
    return { judgments: judgments.length, requests: requests.length };
  },
});

export type { JevBlockReason };
