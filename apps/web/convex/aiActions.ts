import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { domainError, publicBranchId, requireActor } from "./security";
import { aiDomainPort } from "./domain";
import { adapterConfig, aiSettingsFor, authorityInput, canControlRun, spentMicros } from "./aiPolicy";
import { TOOLS, toolBlocked } from "../src/lib/ai/capabilities";
import { budgetBlocked, modelTaskBlocked, normalizeLiveOutput, PROMPT_VERSIONS, type ModelTask, type ModelTaskOutput } from "../src/lib/ai/model";
import { normalizeNoteText } from "../src/lib/ai/relative-dates";
import { NOTE_MAX_LENGTH } from "../src/lib/ai/note-extraction";
import { accessScope, MODEL_CACHE_TTL_MS, modelCacheKey } from "../src/lib/ai/model-cache";
import type { AiErrorCategory, AiExtractNoteResult, AiInterpretFiltersResult, AiInterpretRevisionResult } from "../src/lib/ai/contracts";
import { callModel } from "./aiModelCall";

/**
 * On-demand preparation that needs a model: reading a contact note into
 * fields, interpreting a short correction to running work, and turning a
 * request into list filters. Nothing here writes business records; the
 * person reviews and saves through the ordinary form or operation.
 */

const prepareArgs = {
  operation: v.union(v.literal("extract_note"), v.literal("interpret_revision"), v.literal("interpret_filters")),
  input: v.any(),
  organizationId: v.optional(v.string()),
  activeBranchId: v.optional(v.string()),
  correlationId: v.optional(v.string()),
};

/** Where a live note reading may be kept and found again (AI-1.9); `answer` is set when a fresh one is already kept. */
type CacheSlot = { key: string; subjectType: "member" | "lead"; subjectId: string; answer?: unknown };

type Prepared = { blocked: AiErrorCategory } | { task: ModelTask; organizationId: Id<"organizations">; capability: string; cache?: CacheSlot };

export type PrepareResult = AiExtractNoteResult | AiInterpretRevisionResult | AiInterpretFiltersResult;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export const prepareContext = internalQuery({
  args: prepareArgs,
  handler: async (ctx, args): Promise<Prepared> => {
    const request = { organizationId: args.organizationId, activeBranchId: args.activeBranchId, correlationId: args.correlationId };
    const actor = await requireActor(ctx, request);
    const input = (args.input ?? {}) as Record<string, unknown>;
    const entitled = await aiDomainPort.entitledModules(ctx, actor);
    const settings = await aiSettingsFor(ctx, actor.organization._id);
    const config = adapterConfig();
    if (args.operation === "extract_note") {
      const note = text(input.note).slice(0, NOTE_MAX_LENGTH);
      if (note.length < 3) domainError("VALIDATION_ERROR", "Write a short note first.", { correlationId: actor.correlationId });
      const subject = text(input.leadId) ? "lead" : "member";
      const subjectId = text(subject === "lead" ? input.leadId : input.memberId);
      // Same access as saving the contact itself, and the record must be in scope.
      if (subject === "member") {
        if (!actor.permissions.includes("members.write")) domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", { correlationId: actor.correlationId });
        await aiDomainPort.scopedMember(ctx, actor, subjectId);
      } else {
        if (!actor.permissions.includes("crm.write")) domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", { correlationId: actor.correlationId });
        const lead = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "lead").eq("publicId", subjectId)).unique();
        if (!lead || (lead.branchId && actor.branchScope === "selected" && !actor.branchIds.includes(lead.branchId))) domainError("NOT_FOUND", "Record not found.", { correlationId: actor.correlationId });
      }
      const blocked = toolBlocked(TOOLS["note.extract"]!, await authorityInput(ctx, actor, "note_extraction", entitled));
      if (blocked) return { blocked };
      const noteAt = text(input.noteAt) && Number.isFinite(Date.parse(text(input.noteAt))) && Math.abs(Date.parse(text(input.noteAt)) - Date.now()) < 86_400_000 ? new Date(Date.parse(text(input.noteAt))).toISOString() : new Date().toISOString();
      const task: ModelTask = { kind: "extract_contact_note", note, noteAt, timezone: actor.organization.timezone || "Asia/Amman", subject };
      const gated = modelTaskBlocked(task, config, { externalProcessing: settings?.externalProcessing ?? false });
      if (gated) return { blocked: gated };
      const prepared = { task, organizationId: actor.organization._id, capability: "note_extraction" };
      // Test readings are free and deterministic; only live answers are kept.
      if (config.mode !== "live") return prepared;
      // Every check above ran for this reader first; only then may a kept answer be served.
      const record = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", subject).eq("publicId", subjectId)).unique();
      if (!record) domainError("NOT_FOUND", "Record not found.", { correlationId: actor.correlationId });
      const key = await modelCacheKey({
        organizationId: String(actor.organization._id),
        task: task.kind,
        promptVersion: PROMPT_VERSIONS[task.kind],
        protocol: config.protocol ?? "",
        model: config.model ?? "",
        subjectType: subject,
        subjectId,
        subjectVersion: record.updatedAt,
        scope: accessScope({ role: actor.role, branchScope: actor.branchScope, branchIds: actor.branchIds.map(String), permissions: actor.permissions }),
        locale: input.locale === "ar" ? "ar" : "en",
        input: normalizeNoteText(note),
      });
      const kept = await ctx.db.query("aiModelCache").withIndex("by_organization_key", (q) => q.eq("organizationId", actor.organization._id).eq("key", key)).unique();
      const slot: CacheSlot = { key, subjectType: subject, subjectId };
      // A kept answer costs nothing, so the spend gate applies only to a new call.
      if (kept && kept.expiresAt > Date.now()) return { ...prepared, cache: { ...slot, answer: kept.answer } };
      const overBudget = budgetBlocked(config, await spentMicros(ctx, actor.organization._id));
      return overBudget ? { blocked: overBudget } : { ...prepared, cache: slot };
    }
    if (args.operation === "interpret_revision") {
      const run = await ctx.db.query("aiRuns").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", text(input.runId))).unique();
      if (!run || !canControlRun(actor, run)) domainError("NOT_FOUND", "Record not found.", { correlationId: actor.correlationId });
      const blocked = toolBlocked(TOOLS["renewal.candidates"]!, await authorityInput(ctx, actor, "followup_batch", entitled));
      if (blocked) return { blocked };
      const staff = await aiDomainPort.staffMembers(ctx, actor);
      const remaining = run.plannedSubjects.slice(run.cursor);
      const task: ModelTask = { kind: "interpret_revision", text: text(input.text).slice(0, 300), candidates: [...remaining.map((subject) => ({ id: subject.id, name: subject.name, kind: "member" as const })), ...staff.map((person) => ({ id: person.id, name: person.name, kind: "staff" as const }))], today: aiDomainPort.tenantToday(actor) };
      const gated = modelTaskBlocked(task, config, { externalProcessing: settings?.externalProcessing ?? false }) ?? budgetBlocked(config, await spentMicros(ctx, actor.organization._id));
      return gated ? { blocked: gated } : { task, organizationId: actor.organization._id, capability: "followup_batch" };
    }
    const surface = input.surface === "leads" ? "leads" : "members";
    if (!actor.permissions.includes(surface === "leads" ? "crm.read" : "members.read")) domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", { correlationId: actor.correlationId });
    const blocked = toolBlocked(TOOLS["filters.interpret"]!, await authorityInput(ctx, actor, "nl_filters", entitled));
    if (blocked) return { blocked };
    const branches = (await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect())
      .filter((branch) => branch.active && (actor.branchScope === "all" || actor.branchIds.includes(branch._id)))
      .map((branch) => ({ id: publicBranchId(branch), name: branch.name }));
    const task: ModelTask = { kind: "interpret_filters", surface, text: text(input.text).slice(0, 300), branches };
    const gated = modelTaskBlocked(task, config, { externalProcessing: settings?.externalProcessing ?? false }) ?? budgetBlocked(config, await spentMicros(ctx, actor.organization._id));
    return gated ? { blocked: gated } : { task, organizationId: actor.organization._id, capability: "nl_filters" };
  },
});

export const keepModelAnswer = internalMutation({
  args: { organizationId: v.id("organizations"), key: v.string(), task: v.string(), subjectType: v.union(v.literal("member"), v.literal("lead")), subjectId: v.string(), promptVersion: v.string(), model: v.string(), answer: v.any(), costMicros: v.number() },
  handler: async (ctx, args): Promise<null> => {
    const now = Date.now();
    const existing = await ctx.db.query("aiModelCache").withIndex("by_organization_key", (q) => q.eq("organizationId", args.organizationId).eq("key", args.key)).unique();
    if (existing) await ctx.db.patch(existing._id, { answer: args.answer, costMicros: args.costMicros, createdAt: now, expiresAt: now + MODEL_CACHE_TTL_MS });
    else await ctx.db.insert("aiModelCache", { ...args, hits: 0, createdAt: now, expiresAt: now + MODEL_CACHE_TTL_MS });
    return null;
  },
});

export const countModelAnswerReuse = internalMutation({
  args: { organizationId: v.id("organizations"), key: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db.query("aiModelCache").withIndex("by_organization_key", (q) => q.eq("organizationId", args.organizationId).eq("key", args.key)).unique();
    if (row) await ctx.db.patch(row._id, { hits: row.hits + 1 });
    return null;
  },
});

/** Kept answers past their window are removed; nothing reads them after expiry anyway. */
export const expireModelAnswers = internalMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const rows = await ctx.db.query("aiModelCache").withIndex("by_expires", (q) => q.lt("expiresAt", Date.now())).take(500);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});

export const prepare = action({
  args: prepareArgs,
  handler: async (ctx, args): Promise<PrepareResult> => {
    const prepared: Prepared = await ctx.runQuery(internal.aiActions.prepareContext, args);
    if ("blocked" in prepared) return { ok: false, reason: prepared.blocked };
    const config = adapterConfig();
    if (prepared.cache?.answer !== undefined) {
      // A kept answer: no call and no new spend. RIVET re-reads it against the current note and time.
      const reused = normalizeLiveOutput(prepared.task, prepared.cache.answer, {});
      await ctx.runMutation(internal.aiActions.countModelAnswerReuse, { organizationId: prepared.organizationId, key: prepared.cache.key });
      if (reused.ok && reused.output.kind === "extract_contact_note") return { ok: true, kind: "extract_note", extraction: reused.output.extraction };
      return { ok: false, reason: "model_malformed" };
    }
    const outcome = await callModel(prepared.task, config);
    await ctx.runMutation(internal.aiRuns.recordUsage, {
      organizationId: prepared.organizationId,
      task: prepared.task.kind,
      source: config.mode === "live" ? "live" : "fixture",
      promptVersion: outcome.promptVersion,
      latencyMs: outcome.latencyMs,
      outcome: outcome.ok ? "ok" : outcome.category === "model_timeout" ? "timeout" : outcome.category === "model_malformed" ? "malformed" : outcome.category === "model_refused" ? "refused" : "unavailable",
      ...(outcome.usage ? { inputTokens: outcome.usage.inputTokens, outputTokens: outcome.usage.outputTokens, costMicros: outcome.usage.costMicros } : {}),
      ...(outcome.ok ? {} : { errorCategory: outcome.category }),
      ...(config.model ? { model: config.model } : {}),
    });
    if (!outcome.ok) return { ok: false, reason: outcome.category };
    if (prepared.cache && outcome.source === "live" && outcome.answer) {
      await ctx.runMutation(internal.aiActions.keepModelAnswer, { organizationId: prepared.organizationId, key: prepared.cache.key, task: prepared.task.kind, subjectType: prepared.cache.subjectType, subjectId: prepared.cache.subjectId, promptVersion: outcome.promptVersion, model: config.model ?? "", answer: outcome.answer, costMicros: outcome.usage?.costMicros ?? 0 });
    }
    const output: ModelTaskOutput = outcome.output;
    switch (output.kind) {
      case "extract_contact_note": return { ok: true, kind: "extract_note", extraction: output.extraction };
      case "interpret_revision": return { ok: true, kind: "interpret_revision", revision: output.revision };
      case "interpret_filters": return { ok: true, kind: "interpret_filters", filters: output.filters };
      default: return { ok: false, reason: "model_malformed" };
    }
  },
});
