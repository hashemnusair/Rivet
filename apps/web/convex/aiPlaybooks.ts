import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { publicOrganizationId, publicUserId, type ActorContext, type RequestArgs } from "./security";
import { adapterConfig, monthKey, type AiGrantDoc, type AiRunDoc } from "./aiPolicy";
import type { RenewalMemberFacts } from "../src/lib/ai/renewal-batch";
import { evaluateRenewalCandidate, renewalOperationKey, renewalTaskTitle } from "../src/lib/ai/renewal-batch";
import { modelTaskBlocked, runFixtureTask, type DraftFollowUpTask, type ModelTaskOutput } from "../src/lib/ai/model";
import type { AiErrorCategory, AiExclusionReason, AiRunExclusion, AiRunResultRef, AiRunRevision, AiRunStatus } from "../src/lib/ai/contracts";
import { addDays, localDateTimeToISO, todayISODate } from "../src/lib/utils/dates";
import type { AdvanceResult } from "./aiRuns";

/**
 * Playbook steps. Each call performs exactly one unit of work inside the
 * caller's transaction and records its receipt; the worker loops. Every write
 * goes through an existing domain operation with a per-tool delegated request,
 * is idempotent by a stable operation key, and is read back before success is
 * reported.
 */

type Data = Record<string, unknown>;

export interface PlaybookStepEnv {
  run: AiRunDoc;
  grant: AiGrantDoc;
  actor: ActorContext;
  entitled: string[];
  externalProcessing: boolean;
  modelOutput?: { subjectId: string; result: ModelTaskOutput | { failed: AiErrorCategory } };
  toolRequest(toolKey: string, seq: number): RequestArgs;
  toolBlocked(toolKey: string): Promise<AiErrorCategory | undefined>;
  finish(status: AiRunStatus, category?: AiErrorCategory): Promise<void>;
  executeQuery(operation: string, input: Data, request: RequestArgs): Promise<unknown>;
  executeMutation(operation: string, input: Data, request: RequestArgs): Promise<unknown>;
  renewalFacts(memberId: string, membershipId: string | undefined): Promise<RenewalMemberFacts | null>;
}

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function resultRef(kind: AiRunResultRef["kind"], id: string, label: string, extra: Partial<AiRunResultRef> = {}): AiRunResultRef {
  return { kind, id, label, ...extra };
}

async function recordStep(ctx: MutationCtx, run: AiRunDoc, step: Omit<Doc<"aiRunSteps">, "_id" | "_creationTime" | "organizationId" | "runPublicId" | "createdAt" | "updatedAt" | "attempts">): Promise<void> {
  const now = Date.now();
  await ctx.db.insert("aiRunSteps", { organizationId: run.organizationId, runPublicId: run.publicId, attempts: 1, createdAt: now, updatedAt: now, ...step });
}

async function recordFixtureUsage(ctx: MutationCtx, run: AiRunDoc, task: string, promptVersion: string): Promise<void> {
  const now = Date.now();
  await ctx.db.insert("aiUsage", { organizationId: run.organizationId, runPublicId: run.publicId, task, capability: task, source: "fixture", promptVersion, latencyMs: 0, costMicros: 0, outcome: "ok", month: monthKey(now), createdAt: now });
}

/** Whether the task id recorded under an operation key still exists, and is open. */
async function priorTaskState(ctx: MutationCtx, run: AiRunDoc, operation: string, key: string): Promise<{ taskId: string; open: boolean; title: string } | undefined> {
  const prior = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", run.organizationId).eq("operation", operation).eq("key", key)).unique();
  if (!prior) return undefined;
  const taskId = text(record(prior.result).taskId);
  const task = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", run.organizationId).eq("entityType", "task").eq("publicId", taskId)).unique();
  if (!task) return undefined;
  const value = record(task.data);
  return { taskId, open: text(value.status) === "open" || !value.status, title: text(value.title) };
}

// ---------------------------------------------------------------------------
// Renewal follow-ups (AI-2.4)
// ---------------------------------------------------------------------------

async function renewalFollowupsStep(ctx: MutationCtx, env: PlaybookStepEnv): Promise<AdvanceResult> {
  const { run, actor } = env;
  const params = run.params as { bucket?: "expiring" | "expired"; days?: number; owner?: "me" | "assigned" };
  const now = Date.now();
  const timezone = actor.organization.timezone || "Asia/Amman";
  const today = todayISODate(timezone);

  if (run.stage === "aiWork.stage.starting" || run.stage === "aiWork.stage.queued") {
    const blocked = await env.toolBlocked("renewal.candidates");
    if (blocked) {
      await env.finish("failed", blocked);
      return { done: true };
    }
    const page = record(await env.executeQuery("renewal.queue", { bucket: params.bucket ?? "expiring", ...(params.days ? { days: params.days } : {}), ...(run.branchPublicId ? { branchId: run.branchPublicId } : {}), page: 1, pageSize: run.limits.maxSubjects }, env.toolRequest("renewal.candidates", 0)));
    const items = (Array.isArray(page.items) ? page.items : []).map(record);
    const planned = items.slice(0, run.limits.maxSubjects).map((item) => ({ id: text(record(item.member).id), name: text(record(item.member).fullName), ref: text(record(item.membership).id) || undefined })).filter((subject) => subject.id);
    await ctx.db.patch(run._id, { plannedSubjects: planned, counts: { ...run.counts, considered: Number(page.totalItems ?? planned.length) }, stage: planned.length ? "aiWork.stage.checkingContacts" : "aiWork.stage.nothingToDo", updatedAt: now });
    if (!planned.length) {
      await env.finish("completed");
      return { done: true };
    }
    return { done: false };
  }

  if (run.cursor >= run.plannedSubjects.length) {
    await env.finish(run.counts.failed > 0 ? "partially_completed" : "completed");
    return { done: true };
  }

  const subject = run.plannedSubjects[run.cursor]!;
  const seq = run.cursor + 1;
  const advance = async (patch: Partial<AiRunDoc>) => {
    await ctx.db.patch(run._id, { ...patch, cursor: run.cursor + 1, stage: "aiWork.stage.preparingFollowUps", updatedAt: Date.now() });
    return { done: false } as AdvanceResult;
  };
  const exclude = async (reason: AiExclusionReason, sources: AiRunExclusion["sources"] = []) => {
    await recordStep(ctx, run, { seq, tool: "task.create_followup", subjectId: subject.id, subjectName: subject.name, status: "skipped", reason });
    return await advance({ counts: { ...run.counts, skipped: run.counts.skipped + 1 }, exclusions: [...run.exclusions, { subjectId: subject.id, subjectName: subject.name, reason, sources }] });
  };

  // Facts are reloaded now, inside this transaction: a renewal or contact a moment ago changes the decision.
  const facts = await env.renewalFacts(subject.id, subject.ref);
  if (!facts) return await exclude("outside_scope");
  const revisions = run.revisions.map((revision) => revision.interpreted as AiRunRevision);
  const decision = evaluateRenewalCandidate(facts, { today, now: new Date(now).toISOString(), revisions, latestUsefulDate: params.bucket === "expired" ? addDays(today, 14) : facts.membershipEndDate });
  const operationKey = renewalOperationKey(publicOrganizationId(actor.organization), subject.id, facts.membershipId, facts.membershipEndDate);
  const memberHref = `/members/${subject.id}?tab=tasks`;

  if (decision.decision === "exclude") return await exclude(decision.reason, [{ kind: "member", id: subject.id, href: `/members/${subject.id}` }]);

  const prior = await priorTaskState(ctx, run, "ai.task.create_followup", operationKey);
  if (prior && !prior.open) return await exclude("already_prepared", [{ kind: "task", id: prior.taskId, href: memberHref, label: prior.title }]);
  if (decision.decision === "link" || prior) {
    const taskId = decision.decision === "link" ? decision.taskId : prior!.taskId;
    const title = decision.decision === "link" ? decision.taskTitle : prior!.title;
    await recordStep(ctx, run, { seq, tool: "task.create_followup", subjectId: subject.id, subjectName: subject.name, operationKey, status: "verified", reason: "has_open_followup", resultRef: resultRef("task", taskId, title, { href: memberHref, subjectName: subject.name }) });
    return await advance({ counts: { ...run.counts, linked: run.counts.linked + 1 }, resultRefs: [...run.resultRefs, resultRef("task", taskId, title, { href: memberHref, subjectName: subject.name })] });
  }

  // A write: the run's own limit, then the tool's authority, both checked now.
  if (run.budget.writes >= run.limits.maxWrites) {
    await env.finish(run.counts.created + run.counts.linked > 0 ? "partially_completed" : "failed", "limit_reached");
    return { done: true };
  }
  const blocked = await env.toolBlocked("task.create_followup");
  if (blocked) {
    await env.finish(run.counts.created + run.counts.linked > 0 ? "partially_completed" : "failed", blocked === "permission_denied" ? "authority_revoked" : blocked);
    return { done: true };
  }

  let draft: { language: "en" | "ar"; text: string } | undefined = decision.draft === "message" ? facts.draft : undefined;
  if (draft) {
    const allowedFacts: DraftFollowUpTask["allowedFacts"] = [
      ...(decision.topic === "evening_classes" && facts.eveningClassesAvailable ? ["evening_classes_available" as const] : []),
      ...(decision.adjustedFor === "travel" ? ["returning_from_travel" as const] : []),
    ];
    if (allowedFacts.length) {
      const task: DraftFollowUpTask = { kind: "draft_followup_message", language: draft.language, firstName: facts.memberName.split(/\s+/)[0] ?? facts.memberName, gymName: actor.organization.name, baseText: draft.text, allowedFacts };
      const config = adapterConfig();
      if (config.mode === "fixture") {
        const result = runFixtureTask(task);
        if (result.output.kind === "draft_followup_message") draft = { language: result.output.language, text: result.output.text };
        await recordFixtureUsage(ctx, run, task.kind, result.promptVersion);
      } else if (config.mode === "live" && !modelTaskBlocked(task, config, { externalProcessing: env.externalProcessing })) {
        if (!env.modelOutput || env.modelOutput.subjectId !== subject.id) return { done: false, modelTask: task, subjectId: subject.id };
        const output = env.modelOutput.result;
        // A failed or malformed model draft keeps the approved catalogue text; the task is still useful.
        if ("kind" in output && output.kind === "draft_followup_message") draft = { language: output.language, text: output.text };
      }
    }
  }

  const ownerRevision = [...revisions].reverse().find((revision): revision is Extract<AiRunRevision, { kind: "owner" }> => revision.kind === "owner");
  const ownerId = ownerRevision?.ownerId ?? (params.owner === "assigned" && facts.assignedSalespersonId ? facts.assignedSalespersonId : publicUserId(actor.user));
  const dueAt = localDateTimeToISO(decision.dueDate, decision.dueTime, timezone);
  const title = renewalTaskTitle(facts.memberName, decision.topic);
  const created = record(await env.executeMutation("tasks.create", {
    type: "renewal_call",
    title,
    ownerId,
    dueAt,
    priority: facts.membershipEndDate <= addDays(today, 3) ? "high" : "normal",
    memberId: subject.id,
    aiContext: { purpose: "renewal", membershipId: facts.membershipId, ...(decision.topic ? { topic: decision.topic } : {}) },
  }, env.toolRequest("task.create_followup", seq)));
  const taskId = text(created.id);
  // Verify the saved record, not the returned value: a task exists, open, for this member and owner, attributed to this run.
  const persisted = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", run.organizationId).eq("entityType", "task").eq("publicId", taskId)).unique();
  const saved = record(persisted?.data);
  if (!persisted || saved.memberId !== subject.id || saved.status !== "open" || saved.ownerId !== ownerId || record(saved.origin).runId !== run.publicId) {
    throw new Error("Saved follow-up did not match what was requested.");
  }
  await ctx.db.insert("idempotencyRecords", { organizationId: run.organizationId, operation: "ai.task.create_followup", key: operationKey, requestHash: `${run.publicId}:${subject.id}`, result: { taskId, runId: run.publicId }, createdAt: now, expiresAt: now + 400 * 86_400_000 });
  const ref = resultRef("task", taskId, title, { href: memberHref, subjectName: subject.name });
  await recordStep(ctx, run, { seq, tool: "task.create_followup", subjectId: subject.id, subjectName: subject.name, operationKey, status: "verified", resultRef: ref, ...(draft ? { draft } : {}) });
  return await advance({ counts: { ...run.counts, created: run.counts.created + 1, prepared: run.counts.prepared + (draft ? 1 : 0) }, budget: { ...run.budget, writes: run.budget.writes + 1 }, resultRefs: [...run.resultRefs, ref] });
}

export async function runPlaybookStep(ctx: MutationCtx, env: PlaybookStepEnv): Promise<AdvanceResult> {
  switch (env.run.playbook) {
    case "renewal_followups":
      return await renewalFollowupsStep(ctx, env);
    default:
      await env.finish("failed", "validation");
      return { done: true };
  }
}
