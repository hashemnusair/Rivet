import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalQuery } from "./_generated/server";
import { domainError, publicBranchId, requireActor } from "./security";
import { aiDomainPort } from "./domain";
import { adapterConfig, aiSettingsFor, authorityInput, canControlRun } from "./aiPolicy";
import { TOOLS, toolBlocked } from "../src/lib/ai/capabilities";
import { modelTaskBlocked, type ModelTask, type ModelTaskOutput } from "../src/lib/ai/model";
import { NOTE_MAX_LENGTH } from "../src/lib/ai/note-extraction";
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

type Prepared = { blocked: AiErrorCategory } | { task: ModelTask; organizationId: Id<"organizations">; capability: string };

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
      // Same access as saving the contact itself, and the record must be in scope.
      if (subject === "member") {
        if (!actor.permissions.includes("members.write")) domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", { correlationId: actor.correlationId });
        await aiDomainPort.scopedMember(ctx, actor, text(input.memberId));
      } else {
        if (!actor.permissions.includes("crm.write")) domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", { correlationId: actor.correlationId });
        const lead = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "lead").eq("publicId", text(input.leadId))).unique();
        if (!lead || (lead.branchId && actor.branchScope === "selected" && !actor.branchIds.includes(lead.branchId))) domainError("NOT_FOUND", "Record not found.", { correlationId: actor.correlationId });
      }
      const blocked = toolBlocked(TOOLS["note.extract"]!, await authorityInput(ctx, actor, "note_extraction", entitled));
      if (blocked) return { blocked };
      const noteAt = text(input.noteAt) && Number.isFinite(Date.parse(text(input.noteAt))) && Math.abs(Date.parse(text(input.noteAt)) - Date.now()) < 86_400_000 ? new Date(Date.parse(text(input.noteAt))).toISOString() : new Date().toISOString();
      const task: ModelTask = { kind: "extract_contact_note", note, noteAt, timezone: actor.organization.timezone || "Asia/Amman", subject };
      const gated = modelTaskBlocked(task, config, { externalProcessing: settings?.externalProcessing ?? false });
      return gated ? { blocked: gated } : { task, organizationId: actor.organization._id, capability: "note_extraction" };
    }
    if (args.operation === "interpret_revision") {
      const run = await ctx.db.query("aiRuns").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", text(input.runId))).unique();
      if (!run || !canControlRun(actor, run)) domainError("NOT_FOUND", "Record not found.", { correlationId: actor.correlationId });
      const blocked = toolBlocked(TOOLS["renewal.candidates"]!, await authorityInput(ctx, actor, "followup_batch", entitled));
      if (blocked) return { blocked };
      const staff = await aiDomainPort.staffMembers(ctx, actor);
      const remaining = run.plannedSubjects.slice(run.cursor);
      const task: ModelTask = { kind: "interpret_revision", text: text(input.text).slice(0, 300), candidates: [...remaining.map((subject) => ({ id: subject.id, name: subject.name, kind: "member" as const })), ...staff.map((person) => ({ id: person.id, name: person.name, kind: "staff" as const }))], today: aiDomainPort.tenantToday(actor) };
      const gated = modelTaskBlocked(task, config, { externalProcessing: settings?.externalProcessing ?? false });
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
    const gated = modelTaskBlocked(task, config, { externalProcessing: settings?.externalProcessing ?? false });
    return gated ? { blocked: gated } : { task, organizationId: actor.organization._id, capability: "nl_filters" };
  },
});

export const prepare = action({
  args: prepareArgs,
  handler: async (ctx, args): Promise<PrepareResult> => {
    const prepared: Prepared = await ctx.runQuery(internal.aiActions.prepareContext, args);
    if ("blocked" in prepared) return { ok: false, reason: prepared.blocked };
    const config = adapterConfig();
    const outcome = await callModel(prepared.task, config);
    await ctx.runMutation(internal.aiRuns.recordUsage, {
      organizationId: prepared.organizationId,
      task: prepared.task.kind,
      source: config.mode === "live" ? "live" : "fixture",
      promptVersion: outcome.promptVersion,
      latencyMs: outcome.latencyMs,
      outcome: outcome.ok ? "ok" : outcome.category === "model_timeout" ? "timeout" : outcome.category === "model_malformed" ? "malformed" : outcome.category === "model_refused" ? "refused" : "unavailable",
      ...(outcome.ok ? { inputTokens: outcome.usage.inputTokens, outputTokens: outcome.usage.outputTokens, costMicros: outcome.usage.costMicros } : { errorCategory: outcome.category }),
      ...(config.model ? { model: config.model } : {}),
    });
    if (!outcome.ok) return { ok: false, reason: outcome.category };
    const output: ModelTaskOutput = outcome.output;
    switch (output.kind) {
      case "extract_contact_note": return { ok: true, kind: "extract_note", extraction: output.extraction };
      case "interpret_revision": return { ok: true, kind: "interpret_revision", revision: output.revision };
      case "interpret_filters": return { ok: true, kind: "interpret_filters", filters: output.filters };
      default: return { ok: false, reason: "model_malformed" };
    }
  },
});
