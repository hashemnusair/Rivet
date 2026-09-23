import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx } from "./_generated/server";
import { buildJevQuestions, canonicalJson, jevStateBytes, jevStateHash, sanitizeJevSubject } from "./jevAnswers";
import { jevPlatformStateLoader, jevStateLoader } from "./jevLoaders";
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
import { domainError, hasPermission, publicOrganizationId, publicUserId, requireActor, requirePermission, requirePlatformAdmin, type ActorContext, type ReadCtx } from "./security";

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

type JevLoadedStateResult = { state: JevState; candidates?: JevCandidate[]; scopeKey: string; sourceVersion: string };

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
  return await statusViewFor(ctx, actor.organization._id, hasPermission(actor, "settings.manage"));
}

async function statusViewFor(ctx: ReadCtx, organizationId: Id<"organizations">, canManage: boolean): Promise<JevStatusView> {
  const now = Date.now();
  const context = await gateContext(ctx, organizationId, undefined, now);
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
        scope: question.scope ?? "tenant",
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
    warnings: [
      ...resolution.warnings,
      ...resolution.features.filter((key) => !JEV_FEATURES.some((feature) => feature.key === key)).map((key) => `RIVET_JEV_FEATURES lists "${key}", which is not a registered feature; check the spelling.`),
    ],
    canManage,
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

/**
 * The same view for a platform administrator reading one gym's case: whether
 * that gym has Jev on and which features could answer. Never lets the
 * console change the gym's switch.
 */
export const platformStatus = query({
  args: { organizationId: v.string(), correlationId: v.string() },
  returns: v.any(),
  handler: async (ctx, args): Promise<JevStatusView> => {
    const admin = await requirePlatformAdmin(ctx, args.correlationId);
    const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", args.organizationId.trim())).unique();
    if (!organization) domainError("NOT_FOUND", "Gym not found.", { correlationId: admin.correlationId });
    return await statusViewFor(ctx, organization._id, false);
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
    const question = getJevQuestion(args.questionKey);
    if (!question) return resolved({ status: "blocked", reason: "unknown_question", message: "This suggestion is not registered." });
    const subject = sanitizeJevSubject(args.subject);
    const simulate = question.synthetic && typeof subject.simulate === "string" && (JEV_SIMULATIONS as readonly string[]).includes(subject.simulate) ? (subject.simulate as JevSimulation) : undefined;
    // Who may ask, and which gym the judgment belongs to. Tenant questions
    // resolve a gym actor; platform questions resolve an administrator and
    // let the loader name the gym from the record it found.
    const now = Date.now();
    let organizationDocId: Id<"organizations">;
    let userId: Id<"users">;
    let correlationId: string;
    let loaded: JevLoadedStateResult;
    let context: GateContext;
    if (question.scope === "platform") {
      const admin = await requirePlatformAdmin(ctx, args.correlationId);
      const loader = jevPlatformStateLoader(question.key);
      if (!loader) return resolved({ status: "blocked", reason: "unknown_question", message: "This suggestion has no state loader." });
      // The environment switches are checked before the case is read; the
      // gym's own switch and counters follow once the loader has named it.
      const environmentGate = gateJevRequest({ resolution: resolveJevMode(process.env, now), featureKey: question.feature, tenantEnabled: true, breakerTripped: false, globalRequestsToday: 0, tenantRequestsToday: 0 });
      if (!environmentGate.allowed) return resolved(blockedResult(environmentGate));
      const platformLoaded = await loader(ctx, admin, subject);
      organizationDocId = platformLoaded.organizationDocId;
      userId = admin.user._id;
      correlationId = admin.correlationId;
      loaded = platformLoaded;
      context = await gateContext(ctx, organizationDocId, question.feature, now);
      if (!context.gate.allowed) return resolved(blockedResult(context.gate));
    } else {
      const actor = await requireActor(ctx, args);
      const permission = permissionOf(question);
      if (!permission) return resolved({ status: "blocked", reason: "unknown_question", message: "This suggestion is not registered." });
      requirePermission(actor, permission);
      const loader = jevStateLoader(question.key);
      if (!loader) return resolved({ status: "blocked", reason: "unknown_question", message: "This suggestion has no state loader." });
      organizationDocId = actor.organization._id;
      userId = actor.user._id;
      correlationId = actor.correlationId;
      // The gate runs before any tenant state is read.
      context = await gateContext(ctx, organizationDocId, question.feature, now);
      if (!context.gate.allowed) return resolved(blockedResult(context.gate));
      loaded = await loader(ctx, actor, subject);
    }
    if (jevStateBytes(canonicalJson({ state: loaded.state, candidates: loaded.candidates ?? null })) > JEV_MAX_STATE_BYTES) return resolved({ status: "blocked", reason: "state_too_large", message: "This record is too large to send for a suggestion." });
    // A candidate list the request cannot honour is refused here, before the
    // cache is read and before `begin` counts a request against the caps.
    const buildable = buildJevQuestions(question, loaded.candidates);
    if (!buildable.ok) return resolved({ status: "unavailable", reason: "request_invalid", message: buildable.message, retryable: false, correlationId });
    const stateHash = jevStateHash({ questionKey: question.key, questionVersion: question.version, sourceVersion: loaded.sourceVersion, state: loaded.state, candidates: loaded.candidates });
    if (question.cacheTtlMs > 0 && !simulate) {
      const cached = await cachedJudgment(ctx, organizationDocId, question, loaded.scopeKey, stateHash, context.gate.mode, now);
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
          correlationId,
        });
      }
    }
    return {
      status: "prepared",
      request: {
        organizationDocId,
        userId,
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
 * stale and never shown or cached. A live answer is shown only when Gateway
 * explicitly reports zero cost; any other cost state trips the breaker.
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
    const question = getJevQuestion(args.questionKey);
    const platformScoped = question?.scope === "platform";
    const admin = platformScoped ? await requirePlatformAdmin(ctx, args.correlationId) : undefined;
    const actor = platformScoped ? undefined : await requireActor(ctx, args);
    const request = await ctx.db.get(args.requestId);
    if (!request || (actor && request.organizationId !== actor.organization._id) || (admin && request.requestedByUserId !== admin.user._id)) domainError("NOT_FOUND", "Suggestion request not found.", { correlationId: args.correlationId });
    const organizationDocId = request.organizationId;
    const userId = actor ? actor.user._id : admin!.user._id;
    const now = Date.now();
    const judgment = args.judgment as JevJudgment | undefined;

    // The permission was checked when the request was prepared; a role that
    // changed while the model was answering must not receive the answer.
    if (actor && question) {
      const permission = permissionOf(question);
      if (!permission || !hasPermission(actor, permission)) {
        await ctx.db.patch(request._id, { status: "failed", finishedAt: now, latencyMs: args.latencyMs, failureReason: "request_invalid", failureMessage: "The caller's access changed while the suggestion was being prepared." });
        return { status: "unavailable", reason: "request_invalid", message: "Your access changed while the suggestion was being prepared, so it was not shown.", retryable: false, correlationId: args.correlationId };
      }
    }

    const usage = await tenantUsage(ctx, organizationDocId, utcDay(now));
    if (usage) {
      await ctx.db.patch(usage._id, {
        inputTokens: usage.inputTokens + (args.inputTokens ?? 0),
        outputTokens: usage.outputTokens + (args.outputTokens ?? 0),
        reportedCostUsd: usage.reportedCostUsd + (args.reportedCostUsd ?? 0),
        updatedAt: now,
      });
    }

    if (args.source === "live" && args.reportedCostUsd !== 0) {
      const knownCost = args.reportedCostUsd !== undefined;
      const reason = knownCost ? "payment_required" : "cost_unconfirmed";
      await tripBreaker(ctx, knownCost
        ? `AI Gateway reported a cost of ${args.reportedCostUsd} USD for a Jev request (correlation ${args.correlationId}).`
        : `AI Gateway did not report a cost for a Jev request (correlation ${args.correlationId}).`, now);
      await ctx.db.patch(request._id, { status: "failed", finishedAt: now, latencyMs: args.latencyMs, failureReason: reason, failureMessage: "Zero cost was not confirmed.", inputTokens: args.inputTokens, outputTokens: args.outputTokens, reportedCostUsd: args.reportedCostUsd });
      console.warn("[rivet.jev.breaker]", JSON.stringify({ correlationId: args.correlationId, reason, reportedCostUsd: args.reportedCostUsd }));
      return { status: "unavailable", reason, message: "Zero-cost access could not be confirmed. Live Jev calls are stopped for operator review.", retryable: false, correlationId: args.correlationId };
    }

    if (!question || !judgment || judgment.kind !== question.kind) {
      await ctx.db.patch(request._id, { status: "failed", finishedAt: now, latencyMs: args.latencyMs, failureReason: "invalid_output", failureMessage: "The judgment did not match the question." });
      return { status: "unavailable", reason: "invalid_output", message: "The model answer could not be used.", retryable: false, correlationId: args.correlationId };
    }

    // Load again with the same authority the request was prepared under, so a
    // record that changed (or moved to another gym) is rejected as stale.
    let loaded: JevLoadedStateResult | undefined;
    try {
      if (admin) {
        const loader = jevPlatformStateLoader(question.key);
        const platformLoaded = loader ? await loader(ctx, admin, sanitizeJevSubject(args.subject)) : undefined;
        loaded = platformLoaded && platformLoaded.organizationDocId === organizationDocId ? platformLoaded : undefined;
      } else if (actor) {
        const loader = jevStateLoader(question.key);
        loaded = loader ? await loader(ctx, actor, sanitizeJevSubject(args.subject)) : undefined;
      }
    } catch {
      // The record moved on (a case resolved, a draft expired, a machine
      // retired) while the model was answering: the answer is stale, the
      // lease is released below, and nothing is cached.
      loaded = undefined;
    }
    const currentHash = loaded ? jevStateHash({ questionKey: question.key, questionVersion: question.version, sourceVersion: loaded.sourceVersion, state: loaded.state, candidates: loaded.candidates }) : undefined;
    if (!loaded || currentHash !== args.stateHash) {
      await ctx.db.patch(request._id, { status: "stale", finishedAt: now, latencyMs: args.latencyMs, inputTokens: args.inputTokens, outputTokens: args.outputTokens, reportedCostUsd: args.reportedCostUsd });
      return { status: "stale", message: "The record changed while the suggestion was being prepared. Refresh to ask again." };
    }

    if (question.cacheTtlMs > 0) {
      await ctx.db.insert("jevJudgments", {
        organizationId: organizationDocId,
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
        requestedByUserId: userId,
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
    };
  },
});

/** Release a lease after a failed call, keeping the classified reason for the request log. */
export const fail = internalMutation({
  args: { requestId: v.id("jevRequests"), reason: v.string(), message: v.string(), latencyMs: v.number(), inputTokens: v.optional(v.number()), outputTokens: v.optional(v.number()), reportedCostUsd: v.optional(v.number()), gatewayAttempted: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) return null;
    const now = Date.now();
    await ctx.db.patch(request._id, { status: "failed", finishedAt: now, latencyMs: args.latencyMs, failureReason: args.reason.slice(0, 64), failureMessage: args.message.slice(0, 500), inputTokens: args.inputTokens, outputTokens: args.outputTokens, reportedCostUsd: args.reportedCostUsd });
    // A response the gateway served and then RIVET rejected (wrong model,
    // unusable answer) may still have been billed: count it and trip the
    // breaker exactly as a completed request would.
    if (args.inputTokens !== undefined || args.outputTokens !== undefined || args.reportedCostUsd !== undefined) {
      const usage = await tenantUsage(ctx, request.organizationId, utcDay(now));
      if (usage) await ctx.db.patch(usage._id, { inputTokens: usage.inputTokens + (args.inputTokens ?? 0), outputTokens: usage.outputTokens + (args.outputTokens ?? 0), reportedCostUsd: usage.reportedCostUsd + (args.reportedCostUsd ?? 0), updatedAt: now });
    }
    if (request.mode === "live" && args.gatewayAttempted && args.reportedCostUsd !== 0) {
      await tripBreaker(ctx, args.reportedCostUsd === undefined
        ? `AI Gateway did not confirm zero cost for a failed Jev request (${args.reason}, correlation ${request.correlationId}).`
        : `AI Gateway reported a cost of ${args.reportedCostUsd} USD for a Jev request that was then rejected (${args.reason}, correlation ${request.correlationId}).`, now);
      console.warn("[rivet.jev.breaker]", JSON.stringify({ correlationId: request.correlationId, reportedCostUsd: args.reportedCostUsd, reason: args.reason }));
    }
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
