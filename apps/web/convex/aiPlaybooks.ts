import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { publicOrganizationId, publicUserId, type ActorContext, type RequestArgs } from "./security";
import { adapterConfig, monthKey, type AiGrantDoc, type AiRunDoc } from "./aiPolicy";
import type { RenewalMemberFacts } from "../src/lib/ai/renewal-batch";
import { evaluateRenewalCandidate, renewalOperationKey, renewalTaskTitle, renewalTaskTitleMessage } from "../src/lib/ai/renewal-batch";
import { modelTaskBlocked, runFixtureTask, type DraftFollowUpTask, type ModelTaskOutput } from "../src/lib/ai/model";
import type { AiErrorCategory, AiExclusionReason, AiRunExclusion, AiRunResultRef, AiRunRevision, AiRunStatus } from "../src/lib/ai/contracts";
import { addDays, localDateTimeToISO, todayISODate } from "../src/lib/utils/dates";
import { composeHandover, composeManagementReport, ledgerTotals } from "../src/lib/ai/jobs";
import { composeCashDifference, investigateCashDifference, shouldPrepareVarianceReview, varianceReviewProposal, type CashShiftFacts } from "../src/lib/ai/cash-difference";
import { evaluateLeadCandidate, leadIsDue, leadOperationKey, leadTaskTitle, leadTaskTitleMessage, OPEN_LEAD_STAGES, type LeadFollowUpFacts } from "../src/lib/ai/sales-batch";
import { isRenderableSystemMessage, systemMessage, type SystemMessage } from "../src/lib/i18n/system-messages";
import { CLASS_FINDER_DAYS, classExclusion, type ClassOptionFacts } from "../src/lib/ai/class-finder";
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
  cashShiftFacts(shiftId: string): Promise<CashShiftFacts>;
  leadFacts(leadId: string): Promise<LeadFollowUpFacts | null>;
  classOptionFacts(memberId: string, from: string, to: string): Promise<{ enabled: boolean; facts: ClassOptionFacts[] }>;
  classBookingStatus(occurrenceKey: string, memberId: string): Promise<string | undefined>;
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
async function priorTaskState(ctx: MutationCtx, run: AiRunDoc, operation: string, key: string): Promise<{ taskId: string; open: boolean; title: string; titleMessage?: SystemMessage } | undefined> {
  const prior = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", run.organizationId).eq("operation", operation).eq("key", key)).unique();
  if (!prior) return undefined;
  const taskId = text(record(prior.result).taskId);
  const task = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", run.organizationId).eq("entityType", "task").eq("publicId", taskId)).unique();
  if (!task) return undefined;
  const value = record(task.data);
  return { taskId, open: text(value.status) === "open" || !value.status, title: text(value.title), ...(isRenderableSystemMessage(value.titleMessage) ? { titleMessage: value.titleMessage } : {}) };
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
    const labelMessage = decision.decision === "link" ? undefined : prior!.titleMessage;
    const ref = resultRef("task", taskId, title, { href: memberHref, subjectName: subject.name, ...(labelMessage ? { labelMessage } : {}) });
    await recordStep(ctx, run, { seq, tool: "task.create_followup", subjectId: subject.id, subjectName: subject.name, operationKey, status: "verified", reason: "has_open_followup", resultRef: ref });
    return await advance({ counts: { ...run.counts, linked: run.counts.linked + 1 }, resultRefs: [...run.resultRefs, ref] });
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
  const titleMessage = renewalTaskTitleMessage(facts.memberName, decision.topic);
  const created = record(await env.executeMutation("tasks.create", {
    type: "renewal_call",
    title,
    titleMessage,
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
  const ref = resultRef("task", taskId, title, { href: memberHref, subjectName: subject.name, labelMessage: titleMessage });
  await recordStep(ctx, run, { seq, tool: "task.create_followup", subjectId: subject.id, subjectName: subject.name, operationKey, status: "verified", resultRef: ref, ...(draft ? { draft } : {}) });
  return await advance({ counts: { ...run.counts, created: run.counts.created + 1, prepared: run.counts.prepared + (draft ? 1 : 0) }, budget: { ...run.budget, writes: run.budget.writes + 1 }, resultRefs: [...run.resultRefs, ref] });
}


// ---------------------------------------------------------------------------
// Lead follow-ups (AI-4.2)
// ---------------------------------------------------------------------------

async function salesFollowupsStep(ctx: MutationCtx, env: PlaybookStepEnv): Promise<AdvanceResult> {
  const { run, actor } = env;
  const params = run.params as { owner?: "me" | "lead_owner" };
  const now = Date.now();
  const timezone = actor.organization.timezone || "Asia/Amman";
  const today = todayISODate(timezone);

  if (run.stage === "aiWork.stage.starting" || run.stage === "aiWork.stage.queued") {
    const blocked = await env.toolBlocked("leads.due");
    if (blocked) {
      await env.finish("failed", blocked);
      return { done: true };
    }
    const page = record(await env.executeQuery("leads.list", { stage: [...OPEN_LEAD_STAGES], ...(run.branchPublicId ? { branchId: run.branchPublicId } : {}), sort: "nextFollowUpAt", page: 1, pageSize: 500 }, env.toolRequest("leads.due", 0)));
    const endOfToday = localDateTimeToISO(today, "23:59", timezone);
    const due = (Array.isArray(page.items) ? page.items : []).map(record).filter((lead) => leadIsDue({ stage: text(lead.stage), ...(text(lead.nextFollowUpAt) ? { nextFollowUpAt: text(lead.nextFollowUpAt) } : {}), ...(text(lead.convertedMemberId) ? { convertedMemberId: text(lead.convertedMemberId) } : {}) }, endOfToday));
    const planned = due.slice(0, run.limits.maxSubjects).map((lead) => ({ id: text(lead.id), name: text(lead.fullName) })).filter((subject) => subject.id);
    await ctx.db.patch(run._id, { plannedSubjects: planned, counts: { ...run.counts, considered: due.length }, stage: planned.length ? "aiWork.stage.checkingContacts" : "aiWork.stage.nothingToDo", updatedAt: now });
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
  const leadHref = `/crm/leads/${subject.id}`;
  const advance = async (patch: Partial<AiRunDoc>) => {
    await ctx.db.patch(run._id, { ...patch, cursor: run.cursor + 1, stage: "aiWork.stage.preparingFollowUps", updatedAt: Date.now() });
    return { done: false } as AdvanceResult;
  };
  const exclude = async (reason: AiExclusionReason) => {
    await recordStep(ctx, run, { seq, tool: "task.create_lead_followup", subjectId: subject.id, subjectName: subject.name, status: "skipped", reason });
    return await advance({ counts: { ...run.counts, skipped: run.counts.skipped + 1 }, exclusions: [...run.exclusions, { subjectId: subject.id, subjectName: subject.name, reason, sources: [{ kind: "lead", id: subject.id, href: leadHref }] }] });
  };

  // Reloaded now, inside this transaction: a call logged a moment ago changes the decision.
  const facts = await env.leadFacts(subject.id);
  if (!facts) return await exclude("outside_scope");
  const decision = evaluateLeadCandidate(facts, { now: new Date(now).toISOString() });
  if (decision.decision === "exclude") return await exclude(decision.reason);
  const operationKey = leadOperationKey(publicOrganizationId(actor.organization), subject.id, facts.nextFollowUpAt);
  const prior = await priorTaskState(ctx, run, "ai.task.create_lead_followup", operationKey);
  if (prior && !prior.open) return await exclude("lead_already_prepared");
  if (decision.decision === "link" || prior) {
    const taskId = decision.decision === "link" ? decision.taskId : prior!.taskId;
    const title = decision.decision === "link" ? decision.taskTitle : prior!.title;
    const labelMessage = decision.decision === "link" ? undefined : prior!.titleMessage;
    const ref = resultRef("task", taskId, title, { href: leadHref, subjectName: subject.name, ...(labelMessage ? { labelMessage } : {}) });
    await recordStep(ctx, run, { seq, tool: "task.create_lead_followup", subjectId: subject.id, subjectName: subject.name, operationKey, status: "verified", reason: "has_open_followup", resultRef: ref });
    return await advance({ counts: { ...run.counts, linked: run.counts.linked + 1 }, resultRefs: [...run.resultRefs, ref] });
  }

  if (run.budget.writes >= run.limits.maxWrites) {
    await env.finish(run.counts.created + run.counts.linked > 0 ? "partially_completed" : "failed", "limit_reached");
    return { done: true };
  }
  const blocked = await env.toolBlocked("task.create_lead_followup");
  if (blocked) {
    await env.finish(run.counts.created + run.counts.linked > 0 ? "partially_completed" : "failed", blocked === "permission_denied" ? "authority_revoked" : blocked);
    return { done: true };
  }
  const ownerId = params.owner === "me" || !facts.ownerId ? publicUserId(actor.user) : facts.ownerId;
  const title = leadTaskTitle(facts.leadName);
  const titleMessage = leadTaskTitleMessage(facts.leadName);
  const created = record(await env.executeMutation("tasks.create", { type: "follow_up", title, titleMessage, ownerId, dueAt: decision.dueAt, priority: decision.priority, leadId: subject.id, aiContext: { purpose: "lead" } }, env.toolRequest("task.create_lead_followup", seq)));
  const taskId = text(created.id);
  const persisted = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", run.organizationId).eq("entityType", "task").eq("publicId", taskId)).unique();
  const saved = record(persisted?.data);
  if (!persisted || saved.leadId !== subject.id || saved.status !== "open" || saved.ownerId !== ownerId || record(saved.origin).runId !== run.publicId) {
    throw new Error("Saved lead follow-up did not match what was requested.");
  }
  await ctx.db.insert("idempotencyRecords", { organizationId: run.organizationId, operation: "ai.task.create_lead_followup", key: operationKey, requestHash: `${run.publicId}:${subject.id}`, result: { taskId, runId: run.publicId }, createdAt: now, expiresAt: now + 90 * 86_400_000 });
  const ref = resultRef("task", taskId, title, { href: leadHref, subjectName: subject.name, labelMessage: titleMessage });
  await recordStep(ctx, run, { seq, tool: "task.create_lead_followup", subjectId: subject.id, subjectName: subject.name, operationKey, status: "verified", resultRef: ref, ...(facts.draft ? { draft: facts.draft } : {}) });
  return await advance({ counts: { ...run.counts, created: run.counts.created + 1, prepared: run.counts.prepared + (facts.draft ? 1 : 0) }, budget: { ...run.budget, writes: run.budget.writes + 1 }, resultRefs: [...run.resultRefs, ref] });
}

// ---------------------------------------------------------------------------
// Class booking (AI-4.5)
// ---------------------------------------------------------------------------

async function classFinderStep(ctx: MutationCtx, env: PlaybookStepEnv): Promise<AdvanceResult> {
  const { run, actor } = env;
  const params = run.params as { memberId: string; book?: boolean; occurrenceKey?: string };
  if (!params.book || !params.occurrenceKey) {
    await env.finish("failed", "validation");
    return { done: true };
  }
  const blocked = (await env.toolBlocked("classes.eligible")) ?? (await env.toolBlocked("class.book"));
  if (blocked) {
    await env.finish("failed", blocked);
    return { done: true };
  }
  // The roster operation accepts either access; without one, stop before planning a write it would refuse.
  if (!actor.permissions.includes("members.write") && !actor.permissions.includes("pt.book_for_member")) {
    await env.finish("failed", "permission_denied");
    return { done: true };
  }
  // Rechecked in this transaction: a spot taken a moment ago stops the booking instead of joining a waitlist.
  const today = todayISODate(actor.organization.timezone || "Asia/Amman");
  const { enabled, facts } = await env.classOptionFacts(params.memberId, today, addDays(today, CLASS_FINDER_DAYS - 1));
  const target = facts.find((item) => item.occurrenceId === params.occurrenceKey);
  const reason = !enabled || !target ? "outside" : classExclusion(target, new Date().toISOString());
  if (reason) {
    await recordStep(ctx, run, { seq: 1, tool: "class.book", subjectId: params.memberId, status: "skipped", reason: reason === "full" || reason === "started" ? "changed_since_planning" : "outside_scope" });
    await env.finish("failed", "source_changed");
    return { done: true };
  }
  await env.executeMutation("classes.occurrence.roster.add", { occurrenceId: params.occurrenceKey, memberId: params.memberId }, env.toolRequest("class.book", 1));
  const status = await env.classBookingStatus(params.occurrenceKey, params.memberId);
  if (status !== "booked") throw new Error("Saved class booking did not match what was requested.");
  const ref = resultRef("class_booking", params.occurrenceKey, target!.name, { href: `/classes?date=${target!.date}`, subjectName: target!.branchName });
  await recordStep(ctx, run, { seq: 1, tool: "class.book", subjectId: params.memberId, status: "verified", resultRef: ref });
  await ctx.db.patch(run._id, { stage: "aiWork.stage.done", resultRefs: [...run.resultRefs, ref], counts: { ...run.counts, created: run.counts.created + 1 }, budget: { ...run.budget, writes: run.budget.writes + 1 }, updatedAt: Date.now() });
  await env.finish("completed");
  return { done: true };
}

// ---------------------------------------------------------------------------
// Shared helpers for report-style jobs
// ---------------------------------------------------------------------------

/** Read one source; a missing permission or feature becomes a gap instead of failing the job. */
async function optionalSource<T>(read: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await read() };
  } catch {
    return { ok: false };
  }
}

async function saveArtifact(ctx: MutationCtx, run: AiRunDoc, input: { kind: Doc<"aiArtifacts">["kind"]; title: string; branchPublicId?: string; content: unknown; requiredPermissions: string[]; createdByUserId: Doc<"aiArtifacts">["createdByUserId"]; sourceDigest: string }): Promise<string> {
  const operation = `ai.artifact.${input.kind}`;
  const key = `${run.publicId}`;
  const prior = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", run.organizationId).eq("operation", operation).eq("key", key)).unique();
  if (prior) return text(record(prior.result).artifactId);
  const branch = input.branchPublicId ? await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", run.organizationId).eq("publicId", input.branchPublicId)).unique() : null;
  const now = Date.now();
  const artifactId = `artifact-${crypto.randomUUID()}`;
  await ctx.db.insert("aiArtifacts", { organizationId: run.organizationId, publicId: artifactId, kind: input.kind, runPublicId: run.publicId, ...(branch ? { branchId: branch._id } : {}), title: input.title, content: input.content, requiredPermissions: input.requiredPermissions, createdByUserId: input.createdByUserId, sourceDigest: input.sourceDigest, createdAt: now, expiresAt: now + 30 * 86_400_000 });
  // Read back before reporting success.
  const saved = await ctx.db.query("aiArtifacts").withIndex("by_organization_public_id", (q) => q.eq("organizationId", run.organizationId).eq("publicId", artifactId)).unique();
  if (!saved || saved.runPublicId !== run.publicId) throw new Error("Saved artifact did not match what was requested.");
  await ctx.db.insert("idempotencyRecords", { organizationId: run.organizationId, operation, key, requestHash: run.publicId, result: { artifactId }, createdAt: now, expiresAt: now + 31 * 86_400_000 });
  return artifactId;
}

// ---------------------------------------------------------------------------
// Management report (AI-3.5)
// ---------------------------------------------------------------------------

async function managementReportStep(ctx: MutationCtx, env: PlaybookStepEnv): Promise<AdvanceResult> {
  const { run, actor } = env;
  const params = run.params as { from: string; to: string; includeExport?: boolean };
  const currency = actor.organization.currency;
  const now = Date.now();
  if (run.stage === "aiWork.stage.starting" || run.stage === "aiWork.stage.queued") {
    const blocked = (await env.toolBlocked("report.figures")) ?? (await env.toolBlocked("artifact.save_report"));
    if (blocked) {
      await env.finish("failed", blocked);
      return { done: true };
    }
    const request = env.toolRequest("report.figures", 0);
    const range = { from: params.from, to: params.to, ...(run.branchPublicId ? { branchId: run.branchPublicId } : {}) };
    const collections = await optionalSource(async () => record(await env.executeQuery("analytics.collections", range, request)));
    const renewals = await optionalSource(async () => record(await env.executeQuery("analytics.renewal_forecast", run.branchPublicId ? { branchId: run.branchPublicId } : {}, request)));
    const crm = await optionalSource(async () => record(await env.executeQuery("analytics.crm_funnel", range, request)));
    // Read the payment ledger in full (bounded) so the totals can be cross-checked.
    let ledger: Data[] | undefined = [];
    for (let page = 1; page <= 10 && ledger; page += 1) {
      const result = await optionalSource(async () => record(await env.executeQuery("transactions.list", { ...range, page, pageSize: 100 }, request)));
      if (!result.ok) { ledger = undefined; break; }
      ledger.push(...(Array.isArray(result.value.items) ? result.value.items : []).map(record));
      if (page >= Number(result.value.totalPages ?? 1)) break;
      if (page === 10) ledger = undefined;
    }
    const composed = composeManagementReport({ ...(collections.ok ? { collections: collections.value } : {}), ...(renewals.ok ? { renewals: renewals.value } : {}), ...(crm.ok ? { crm: crm.value } : {}), ...(ledger ? { ledger } : {}) }, params, currency);
    const verified = composed.verification.verified;
    const totals = ledger ? ledgerTotals(ledger) : { collectedMinor: -1, refundedMinor: -1 };
    const artifactId = await saveArtifact(ctx, run, {
      kind: "management_report",
      title: "aiWork.report.title",
      branchPublicId: run.branchPublicId,
      content: composed,
      requiredPermissions: ["reports.financial.read"],
      createdByUserId: run.ownerUserId,
      sourceDigest: `${params.from}:${params.to}:${totals.collectedMinor}:${totals.refundedMinor}`,
    });
    const ref = resultRef("artifact", artifactId, "aiWork.report.title", { href: `/reports?run=${run.publicId}` });
    await recordStep(ctx, run, { seq: 1, tool: "artifact.save_report", status: "verified", resultRef: ref });
    await ctx.db.patch(run._id, { stage: params.includeExport ? "aiWork.stage.savingReport" : "aiWork.stage.done", artifactPublicId: artifactId, resultRefs: [...run.resultRefs, ref], budget: { ...run.budget, writes: run.budget.writes + 1 }, updatedAt: now });
    if (!params.includeExport) {
      await env.finish(verified ? "completed" : "partially_completed", verified ? undefined : "source_changed");
      return { done: true };
    }
    return { done: false };
  }
  // Optional protected download through the existing export job and its expiry.
  const blocked = await env.toolBlocked("export.request");
  if (blocked) {
    await env.finish("partially_completed", blocked);
    return { done: true };
  }
  const exported = record(await env.executeMutation("exports.request", { kind: "payments", filters: { from: params.from, to: params.to, ...(run.branchPublicId ? { branchId: run.branchPublicId } : {}) }, idempotencyKey: `ai-export-${run.publicId}`, locale: "en" }, env.toolRequest("export.request", 2)));
  const exportId = text(exported.id);
  const ref = resultRef("export", exportId, "aiWork.report.export", { href: "/exports" });
  await recordStep(ctx, run, { seq: 2, tool: "export.request", status: exportId ? "verified" : "failed", ...(exportId ? { resultRef: ref } : { reason: "internal" }) });
  await ctx.db.patch(run._id, { resultRefs: exportId ? [...run.resultRefs, ref] : run.resultRefs, budget: { ...run.budget, writes: run.budget.writes + 1 }, updatedAt: now });
  const artifact = run.artifactPublicId ? await ctx.db.query("aiArtifacts").withIndex("by_organization_public_id", (q) => q.eq("organizationId", run.organizationId).eq("publicId", run.artifactPublicId!)).unique() : null;
  const verified = Boolean(record(record(artifact?.content).verification).verified);
  await env.finish(exportId && verified ? "completed" : "partially_completed", exportId ? (verified ? undefined : "source_changed") : "internal");
  return { done: true };
}

// ---------------------------------------------------------------------------
// Shift handover (AI-3.6)
// ---------------------------------------------------------------------------

async function shiftHandoverStep(ctx: MutationCtx, env: PlaybookStepEnv): Promise<AdvanceResult> {
  const { run, actor } = env;
  const params = run.params as { date?: string; assigneeId?: string };
  const timezone = actor.organization.timezone || "Asia/Amman";
  const date = params.date ?? todayISODate(timezone);
  const branchId = run.branchPublicId;
  const now = Date.now();
  if (!branchId) {
    await env.finish("failed", "validation");
    return { done: true };
  }
  if (run.stage === "aiWork.stage.starting" || run.stage === "aiWork.stage.queued") {
    const blocked = (await env.toolBlocked("handover.gather")) ?? (await env.toolBlocked("artifact.save_handover"));
    if (blocked) {
      await env.finish("failed", blocked);
      return { done: true };
    }
    const request = env.toolRequest("handover.gather", 0);
    const checklist = await optionalSource(async () => record(await env.executeQuery("checklists.day", { branchId, date }, request)));
    const facility = await optionalSource(async () => ((await env.executeQuery("operations.facility_tasks.list", { branchId }, request)) as unknown[]).map(record));
    const issues = await optionalSource(async () => ((await env.executeQuery("operations.equipment_issues.list", { branchId }, request)) as unknown[]).map(record));
    const followUps = await optionalSource(async () => {
      const page = record(await env.executeQuery("tasks.list", { status: "open", dueBefore: new Date(now + 86_400_000).toISOString(), pageSize: 100 }, request));
      return (Array.isArray(page.items) ? page.items : []).map(record);
    });
    const shift = await optionalSource(async () => (await env.executeQuery("shifts.current", { branchId }, request)) as Data | null);
    const composed = composeHandover({ ...(checklist.ok ? { checklist: checklist.value } : {}), ...(facility.ok ? { facilityTasks: facility.value } : {}), ...(issues.ok ? { equipmentIssues: issues.value } : {}), ...(followUps.ok ? { followUps: followUps.value } : {}), ...(shift.ok ? { shift: shift.value } : {}) }, { date, branchId });
    const artifactId = await saveArtifact(ctx, run, {
      kind: "shift_handover",
      title: "aiWork.handover.title",
      branchPublicId: branchId,
      content: composed,
      requiredPermissions: ["members.read"],
      createdByUserId: run.ownerUserId,
      sourceDigest: `${branchId}:${date}`,
    });
    const ref = resultRef("artifact", artifactId, "aiWork.handover.title", { href: `/checklists?run=${run.publicId}` });
    await recordStep(ctx, run, { seq: 1, tool: "artifact.save_handover", status: "verified", resultRef: ref });
    await ctx.db.patch(run._id, { stage: params.assigneeId ? "aiWork.stage.assigning" : "aiWork.stage.done", artifactPublicId: artifactId, resultRefs: [...run.resultRefs, ref], budget: { ...run.budget, writes: run.budget.writes + 1 }, updatedAt: now });
    if (!params.assigneeId) {
      await env.finish("completed");
      return { done: true };
    }
    return { done: false };
  }
  // Assign the handover to the next person as a real task, once per branch, date and person.
  const blocked = await env.toolBlocked("task.assign_handover");
  if (blocked) {
    await env.finish("partially_completed", blocked);
    return { done: true };
  }
  const operationKey = `handover:${branchId}:${date}:${params.assigneeId}`;
  const prior = await priorTaskState(ctx, run, "ai.task.assign_handover", operationKey);
  let ref: AiRunResultRef;
  if (prior) {
    ref = resultRef("task", prior.taskId, prior.title, { href: "/crm/queues", ...(prior.titleMessage ? { labelMessage: prior.titleMessage } : {}) });
    await recordStep(ctx, run, { seq: 2, tool: "task.assign_handover", operationKey, status: "verified", reason: "has_open_followup", resultRef: ref });
  } else {
    const title = `Read the handover for ${date}`;
    const titleMessage = systemMessage("communicationCompletion.tasks.readHandover", { date: { date } });
    const created = record(await env.executeMutation("tasks.create", { type: "general", title, titleMessage, ownerId: params.assigneeId, dueAt: new Date(now + 2 * 3_600_000).toISOString(), priority: "normal", aiContext: { purpose: "handover" } }, env.toolRequest("task.assign_handover", 2)));
    const taskId = text(created.id);
    const persisted = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", run.organizationId).eq("entityType", "task").eq("publicId", taskId)).unique();
    if (!persisted || record(persisted.data).ownerId !== params.assigneeId || record(record(persisted.data).origin).runId !== run.publicId) throw new Error("Saved handover task did not match what was requested.");
    await ctx.db.insert("idempotencyRecords", { organizationId: run.organizationId, operation: "ai.task.assign_handover", key: operationKey, requestHash: run.publicId, result: { taskId }, createdAt: now, expiresAt: now + 30 * 86_400_000 });
    ref = resultRef("task", taskId, title, { href: "/crm/queues", labelMessage: titleMessage });
    await recordStep(ctx, run, { seq: 2, tool: "task.assign_handover", operationKey, status: "verified", resultRef: ref });
  }
  await ctx.db.patch(run._id, { resultRefs: [...run.resultRefs, ref], counts: { ...run.counts, created: run.counts.created + (prior ? 0 : 1), linked: run.counts.linked + (prior ? 1 : 0) }, budget: { ...run.budget, writes: run.budget.writes + (prior ? 0 : 1) }, updatedAt: now });
  await env.finish("completed");
  return { done: true };
}

// ---------------------------------------------------------------------------
// Cash-difference investigation (AI-4.1) with a bound approval (AI-3.4)
// ---------------------------------------------------------------------------

/** Proposals stay open for one day; a cash review older than that should be prepared again. */
const PROPOSAL_TTL_MS = 24 * 3_600_000;

async function cashDifferenceStep(ctx: MutationCtx, env: PlaybookStepEnv): Promise<AdvanceResult> {
  const { run } = env;
  const params = run.params as { shiftId: string };
  const now = Date.now();
  const blocked = (await env.toolBlocked("shift.investigate")) ?? (await env.toolBlocked("artifact.save_cash_difference"));
  if (blocked) {
    await env.finish("failed", blocked);
    return { done: true };
  }
  let facts: CashShiftFacts;
  try {
    facts = await env.cashShiftFacts(params.shiftId);
  } catch {
    await env.finish("failed", "permission_denied");
    return { done: true };
  }
  // RIVET cannot count a drawer: an open shift or a shift without a difference has nothing to investigate.
  if (facts.status !== "closed" || !facts.varianceMinor) {
    await env.finish("failed", "validation");
    return { done: true };
  }
  const investigation = investigateCashDifference(facts);
  const composed = composeCashDifference(facts, investigation);
  const artifactId = await saveArtifact(ctx, run, {
    kind: "cash_difference",
    title: "aiWork.cash.title",
    branchPublicId: facts.branchId,
    content: composed,
    requiredPermissions: ["reconciliation.read"],
    createdByUserId: run.ownerUserId,
    sourceDigest: `${facts.shiftId}:${facts.updatedAt}:${investigation.recomputedExpectedMinor}`,
  });
  const artifactRef = resultRef("artifact", artifactId, "aiWork.cash.title", { href: `/payments/shifts?run=${run.publicId}` });
  await recordStep(ctx, run, { seq: 1, tool: "artifact.save_cash_difference", status: "verified", resultRef: artifactRef });
  const refs = [...run.resultRefs, artifactRef];
  let writes = run.budget.writes + 1;
  if (shouldPrepareVarianceReview(facts, investigation) && !(await env.toolBlocked("shift.propose_variance_review"))) {
    const proposal = varianceReviewProposal(facts, investigation);
    const operationKey = `variance-review:${facts.shiftId}:${proposal.changesetHash}`;
    const prior = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", run.organizationId).eq("operation", "ai.proposal.variance_review").eq("key", operationKey)).unique();
    let proposalId = prior ? text(record(prior.result).proposalId) : "";
    if (!proposalId) {
      proposalId = `proposal-${crypto.randomUUID()}`;
      await ctx.db.insert("aiProposals", { organizationId: run.organizationId, publicId: proposalId, runPublicId: run.publicId, tool: "shift.propose_variance_review", subjectLabel: facts.shiftId, changes: proposal.changes, payload: proposal.payload, changesetHash: proposal.changesetHash, sourceVersions: proposal.sourceVersions, requiredPermission: "reconciliation.approve_variance", status: "pending", proposedAt: now, expiresAt: now + PROPOSAL_TTL_MS });
      const saved = await ctx.db.query("aiProposals").withIndex("by_organization_public_id", (q) => q.eq("organizationId", run.organizationId).eq("publicId", proposalId)).unique();
      if (!saved || saved.changesetHash !== proposal.changesetHash) throw new Error("Saved proposal did not match what was prepared.");
      await ctx.db.insert("idempotencyRecords", { organizationId: run.organizationId, operation: "ai.proposal.variance_review", key: operationKey, requestHash: run.publicId, result: { proposalId }, createdAt: now, expiresAt: now + PROPOSAL_TTL_MS });
      writes += 1;
    }
    const proposalRef = resultRef("proposal", proposalId, "aiWork.proposal.varianceReview", { href: `/payments/shifts?run=${run.publicId}` });
    await recordStep(ctx, run, { seq: 2, tool: "shift.propose_variance_review", operationKey, status: "verified", resultRef: proposalRef });
    refs.push(proposalRef);
  }
  await ctx.db.patch(run._id, { stage: "aiWork.stage.done", artifactPublicId: artifactId, resultRefs: refs, budget: { ...run.budget, writes }, updatedAt: now });
  await env.finish(composed.verification.verified ? "completed" : "partially_completed", composed.verification.verified ? undefined : "source_changed");
  return { done: true };
}

export async function runPlaybookStep(ctx: MutationCtx, env: PlaybookStepEnv): Promise<AdvanceResult> {
  switch (env.run.playbook) {
    case "renewal_followups":
      return await renewalFollowupsStep(ctx, env);
    case "management_report":
      return await managementReportStep(ctx, env);
    case "shift_handover":
      return await shiftHandoverStep(ctx, env);
    case "cash_difference":
      return await cashDifferenceStep(ctx, env);
    case "sales_followups":
      return await salesFollowupsStep(ctx, env);
    case "class_finder":
      return await classFinderStep(ctx, env);
    default:
      await env.finish("failed", "validation");
      return { done: true };
  }
}
