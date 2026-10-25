import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  assertBranchAccess,
  domainError,
  publicBranchId,
  publicOrganizationId,
  publicUserId,
  requireActor,
  requirePermission,
  requirePlatformAdmin,
  type ActorContext,
  type RequestArgs,
} from "./security";
import {
  activeMemories,
  adapterConfig,
  aiSettingsFor,
  artifactView,
  authorityInput,
  availabilityFor,
  branchInScope,
  canControlRun,
  canReadRun,
  GLOBAL_CONTROL_KEY,
  memoryView,
  monthKey,
  monthLowerBound,
  newAiPublicId,
  platformAvailable,
  proposalView,
  runView,
  settingsView,
  standingView,
  workBranchPublicId,
  type AiRunDoc,
} from "./aiPolicy";
import { CAPABILITY_KEYS, parsePlaybookParams, PLAYBOOKS, playbookBlocked, TOOLS, toolBlocked } from "../src/lib/ai/capabilities";
import {
  AI_TENANT_MODES,
  isTerminalRunStatus,
  type AiCapabilityKey,
  type AiMemberBriefResult,
  type AiCollectionsResult,
  type AiClassOptionsResult,
  AI_APPROVE_ALL_MAX,
  type AiApproveAllOutcome,
  type AiApproveAllResult,
  type AiErrorCategory,
  type AiGymAvailability,
  type AiPlatformAvailability,
  type AiProposalView,
  type AiPlatformStatus,
  type AiOutcomeSummary,
  type AiMemberHeadlinesResult,
  type AiMessage,
  type AiPlaybookKey,
  type AiRunRevision,
  type AiRunStatus,
  type AiTenantMode,
} from "../src/lib/ai/contracts";
import { buildMemberBrief, listRowFact, type MemberAttendance, type MemberClassOptions } from "../src/lib/ai/member-brief";
import { modelTaskBlocked } from "../src/lib/ai/model";
import { investigateCashDifference, shouldPrepareVarianceReview, varianceReviewProposal, type CashShiftFacts } from "../src/lib/ai/cash-difference";
import { COLLECTION_LIST_LIMIT, prepareCollectionItem, rankCollections, type CollectionItem, type CollectionMemberFacts } from "../src/lib/ai/collections";
import { CLASS_FINDER_DAYS, classOptions, type ClassOptionFacts, type ClassTimeOfDay } from "../src/lib/ai/class-finder";
import { addDays } from "../src/lib/utils/dates";
import { nextStandingSlot as nextSlot } from "../src/lib/ai/schedule";
import type { MemberFollowUpContext } from "./followupAssist";

/**
 * RIVET assistance operations on the existing `domain.query` / `domain.mutate`
 * transport. Every handler resolves the actor exactly like other domain
 * operations; the AI layer adds its own policy (deployment mode, platform
 * stop, gym and capability modes, grants) on top and never below it.
 */

type ReadCtx = QueryCtx | MutationCtx;
type Data = Record<string, unknown>;

export interface MemberBriefFacts {
  context: MemberFollowUpContext;
  attendance: MemberAttendance;
  activeFreeze?: { startDate: string; endDate?: string };
  classOptions?: MemberClassOptions;
  memberBranchId?: Id<"branches">;
}

export interface AiAuditInput {
  category: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  summary: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  branchId?: string;
}

/** Domain helpers injected by `domain.ts`, so this module never imports it. */
export interface AiDomainPort {
  memberBriefFacts(ctx: ReadCtx, actor: ActorContext, memberId: string): Promise<MemberBriefFacts>;
  entitledModules(ctx: ReadCtx, actor: ActorContext): Promise<string[]>;
  insertAudit(ctx: MutationCtx, actor: ActorContext, value: AiAuditInput): Promise<unknown>;
  scopedMember(ctx: ReadCtx, actor: ActorContext, memberId: string): Promise<{ publicId: string; fullName: string; branchPublicId?: string }>;
  tenantToday(actor: ActorContext): string;
  previewPlaybook(ctx: QueryCtx, actor: ActorContext, playbook: AiPlaybookKey, params: Record<string, string | number | boolean>, request: RequestArgs): Promise<{ subjects: Array<{ id: string; name: string; decision: string; reason?: string }>; digest: string }>;
  staffMembers(ctx: ReadCtx, actor: ActorContext): Promise<Array<{ id: string; userId: Id<"users">; name: string; active: boolean }>>;
  cashShiftFacts(ctx: ReadCtx, actor: ActorContext, shiftId: string): Promise<CashShiftFacts>;
  collectionFacts(ctx: ReadCtx, actor: ActorContext, branchId: string | undefined, limit: number): Promise<{ facts: CollectionMemberFacts[]; considered: number }>;
  classOptionFacts(ctx: ReadCtx, actor: ActorContext, memberId: string, from: string, to: string): Promise<{ enabled: boolean; facts: ClassOptionFacts[] }>;
  /** Current versions of bound records, in order; -1 when a record no longer exists. */
  sourceVersions(ctx: ReadCtx, actor: ActorContext, sources: Array<{ table: string; id: string }>): Promise<number[]>;
  /** Runs an existing domain operation as the signed-in approver, with every check it already has. */
  executeApproved(ctx: MutationCtx, operation: string, input: Data, request: RequestArgs): Promise<unknown>;
  /**
   * A task RIVET prepared, read through the person's own scope, closed as not
   * needed if it is still open. Refuses tasks people created themselves.
   */
  closePreparedTaskAsNotNeeded(ctx: MutationCtx, actor: ActorContext, taskId: string): Promise<{ runId: string; title: string; branchId?: string; closed: boolean }>;
}

/**
 * How an approved proposal executes: an allowlisted existing operation with
 * input rebuilt from the stored payload, and a re-derivation of the changeset
 * from current records. Anything that no longer derives the same changeset is
 * a material change and invalidates the approval.
 */
const PROPOSAL_EXECUTORS: Record<string, {
  operation: string;
  input(payload: Data): Data | null;
  rederive(ctx: ReadCtx, actor: ActorContext, port: AiDomainPort, payload: Data): Promise<string | null>;
}> = {
  "shift.propose_variance_review": {
    operation: "shifts.review",
    input: (payload) => {
      const shiftId = text(payload.shiftId);
      const note = text(payload.note);
      return shiftId && note && payload.decision === "approved" ? { shiftId, decision: "approved", note } : null;
    },
    rederive: async (ctx, actor, port, payload) => {
      const facts = await port.cashShiftFacts(ctx, actor, text(payload.shiftId));
      const investigation = investigateCashDifference(facts);
      return shouldPrepareVarianceReview(facts, investigation) ? varianceReviewProposal(facts, investigation).changesetHash : null;
    },
  },
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const TENANT_MODE_RANK: Record<AiTenantMode, number> = { off: 0, prepare: 1, execute: 2 };

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {};
}

async function runByPublicId(ctx: ReadCtx, actor: ActorContext, publicId: string): Promise<AiRunDoc> {
  const run = await ctx.db.query("aiRuns").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", publicId)).unique();
  if (!run || !canReadRun(actor, run)) domainError("NOT_FOUND", "Record not found.", { correlationId: actor.correlationId });
  return run;
}

async function grantByPublicId(ctx: ReadCtx, actor: ActorContext, publicId: string): Promise<Doc<"aiGrants">> {
  const grant = await ctx.db.query("aiGrants").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", publicId)).unique();
  if (!grant) domainError("NOT_FOUND", "Record not found.", { correlationId: actor.correlationId });
  return grant;
}

function requireHuman(actor: ActorContext): void {
  if (actor.delegation) domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", { correlationId: actor.correlationId });
}

async function availabilityView(ctx: ReadCtx, organization: Doc<"organizations">, row: Doc<"aiAvailability"> | null, names: Map<string, string>): Promise<AiGymAvailability> {
  const key = row ? String(row.changedByUserId) : "";
  if (row && !names.has(key)) names.set(key, (await ctx.db.get(row.changedByUserId))?.fullName ?? "");
  return {
    organizationId: publicOrganizationId(organization),
    name: organization.name,
    status: organization.status,
    available: Boolean(row?.available),
    ...(row ? { reason: row.reason, changedAt: new Date(row.changedAt).toISOString(), changedByName: names.get(key) ?? "" } : {}),
  };
}

export { nextStandingSlot } from "../src/lib/ai/schedule";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** The member brief from current records, scoped through the reader's own access. */
async function memberBriefResult(ctx: QueryCtx, actor: ActorContext, port: AiDomainPort, memberId: string, entitled: string[]): Promise<AiMemberBriefResult> {
  const facts = await port.memberBriefFacts(ctx, actor, memberId);
  const today = port.tenantToday(actor);
  const memories = await activeMemories(ctx, actor.organization._id, "member", memberId, today);
  const settings = await aiSettingsFor(ctx, actor.organization._id);
  const extractionAuthority = await authorityInput(ctx, actor, "note_extraction", entitled);
  const extractionBlocked = toolBlocked(TOOLS["note.extract"]!, extractionAuthority)
    ?? modelTaskBlocked({ kind: "extract_contact_note", note: "", noteAt: new Date().toISOString(), timezone: actor.organization.timezone, subject: "member" }, adapterConfig(), { externalProcessing: settings?.externalProcessing ?? false });
  const steps = await ctx.db.query("aiRunSteps").withIndex("by_organization_subject", (q) => q.eq("organizationId", actor.organization._id).eq("subjectId", memberId)).order("desc").take(10);
  const draftStep = steps.find((step) => step.draft && step.updatedAt > Date.now() - 14 * 86_400_000 && (step.status === "verified" || step.status === "committed"));
  const activeStep = steps.find((step) => step.status === "planned");
  let openRun: { id: string; status: AiRunStatus } | undefined;
  if (activeStep) {
    const run = await ctx.db.query("aiRuns").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", activeStep.runPublicId)).unique();
    if (run && !isTerminalRunStatus(run.status as AiRunStatus) && canReadRun(actor, run)) openRun = { id: run.publicId, status: run.status as AiRunStatus };
  }
  const brief = buildMemberBrief({
    context: facts.context,
    attendance: facts.attendance,
    memories,
    activeFreeze: facts.activeFreeze,
    classOptions: facts.classOptions,
    today,
    now: new Date().toISOString(),
    extraction: extractionBlocked ? { available: false, reason: extractionBlocked } : { available: true },
    ...(openRun ? { openRun } : {}),
  });
  return {
    available: true,
    brief,
    ...(draftStep?.draft ? { preparedDraft: { ...draftStep.draft, runId: draftStep.runPublicId, preparedAt: new Date(draftStep.updatedAt).toISOString() } } : {}),
  } satisfies AiMemberBriefResult;
}

export async function aiQuery(ctx: QueryCtx, operation: string, input: Data, request: RequestArgs, port: AiDomainPort): Promise<unknown> {
  if (operation === "ai.platform.status") {
    // Operators only; no tenant actor is involved and no gym data is read.
    await requirePlatformAdmin(ctx, request.correlationId);
    const control = await ctx.db.query("aiControls").withIndex("by_key", (q) => q.eq("key", GLOBAL_CONTROL_KEY)).unique();
    const changedBy = control?.changedByUserId ? await ctx.db.get(control.changedByUserId) : null;
    return { adapterMode: adapterConfig().mode, stopped: Boolean(control?.stopped), ...(control?.reason ? { reason: control.reason } : {}), ...(control ? { changedAt: new Date(control.changedAt).toISOString() } : {}), ...(changedBy ? { changedByName: changedBy.fullName } : {}) } satisfies AiPlatformStatus;
  }
  if (operation === "ai.platform.availability") {
    // Operators only: gym names and statuses, plus whether each may use assistance. No gym data is read.
    await requirePlatformAdmin(ctx, request.correlationId);
    const organizations = await ctx.db.query("organizations").take(1_000);
    const names = new Map<string, string>();
    const gyms: AiGymAvailability[] = [];
    for (const organization of organizations) {
      const row = await availabilityFor(ctx, organization._id);
      gyms.push(await availabilityView(ctx, organization, row, names));
    }
    return { gyms: gyms.sort((left, right) => Number(right.available) - Number(left.available) || left.name.localeCompare(right.name)) } satisfies AiPlatformAvailability;
  }
  const actor = await requireActor(ctx, request);
  switch (operation) {
    case "ai.settings.get":
      return await settingsView(ctx, actor);

    case "ai.member.brief": {
      requirePermission(actor, "members.read");
      const memberId = text(input.memberId);
      const entitled = await port.entitledModules(ctx, actor);
      const authority = await authorityInput(ctx, actor, "member_context", entitled);
      const blocked = toolBlocked(TOOLS["member.context"]!, authority);
      if (blocked) {
        // Still prove the member is in scope, so a disabled feature never confirms a foreign record.
        await port.scopedMember(ctx, actor, memberId);
        return { available: false, reason: blocked } satisfies AiMemberBriefResult;
      }
      return await memberBriefResult(ctx, actor, port, memberId, entitled);
    }

    case "ai.member.headlines": {
      requirePermission(actor, "members.read");
      const entitled = await port.entitledModules(ctx, actor);
      const blocked = toolBlocked(TOOLS["member.context"]!, await authorityInput(ctx, actor, "member_context", entitled));
      if (blocked) return { available: false, reason: blocked } satisfies AiMemberHeadlinesResult;
      const ids = (Array.isArray(input.memberIds) ? input.memberIds : []).map(text).filter(Boolean).slice(0, 25);
      const items: Array<{ memberId: string; fact: AiMessage }> = [];
      for (const memberId of [...new Set(ids)]) {
        try {
          const result = await memberBriefResult(ctx, actor, port, memberId, entitled);
          const fact = result.available ? listRowFact(result.brief) : undefined;
          if (fact) items.push({ memberId, fact });
        } catch {
          // Outside the reader's scope: left out, never confirmed.
        }
      }
      return { available: true, items } satisfies AiMemberHeadlinesResult;
    }

    case "ai.collections.prepare": {
      requirePermission(actor, "members.read");
      const entitled = await port.entitledModules(ctx, actor);
      const blocked = toolBlocked(TOOLS["collections.prepare"]!, await authorityInput(ctx, actor, "collections_prep", entitled));
      if (blocked) return { available: false, reason: blocked } satisfies AiCollectionsResult;
      const branchId = text(input.branchId) || (actor.branch ? publicBranchId(actor.branch) : undefined);
      const { facts, considered } = await port.collectionFacts(ctx, actor, branchId, COLLECTION_LIST_LIMIT);
      const context = { today: port.tenantToday(actor), now: new Date().toISOString(), gymName: actor.organization.name, currency: actor.organization.currency };
      const items = rankCollections(facts.map((item) => prepareCollectionItem(item, context)).filter((item): item is CollectionItem => Boolean(item)));
      return { available: true, items, considered, limited: considered > COLLECTION_LIST_LIMIT } satisfies AiCollectionsResult;
    }

    case "ai.classes.options": {
      requirePermission(actor, "members.read");
      const memberId = text(input.memberId);
      const entitled = await port.entitledModules(ctx, actor);
      const authority = await authorityInput(ctx, actor, "class_finder", entitled);
      const blocked = toolBlocked(TOOLS["classes.eligible"]!, authority);
      if (blocked) {
        await port.scopedMember(ctx, actor, memberId);
        return { available: false, reason: blocked } satisfies AiClassOptionsResult;
      }
      const today = port.tenantToday(actor);
      const { enabled, facts } = await port.classOptionFacts(ctx, actor, memberId, today, addDays(today, CLASS_FINDER_DAYS - 1));
      if (!enabled) return { available: false, reason: "classes_paused" } satisfies AiClassOptionsResult;
      const wanted = text(input.timeOfDay);
      const timeOfDay = wanted === "morning" || wanted === "afternoon" || wanted === "evening" ? wanted as ClassTimeOfDay : undefined;
      const { options, excluded } = classOptions(facts, { now: new Date().toISOString(), ...(timeOfDay ? { timeOfDay } : {}) });
      // Booking needs execute mode and the roster access the booking operation itself checks.
      const canBook = !playbookBlocked(PLAYBOOKS.class_finder, authority) && (actor.permissions.includes("members.write") || actor.permissions.includes("pt.book_for_member"));
      return { available: true, options, excluded, canBook } satisfies AiClassOptionsResult;
    }

    case "ai.outcomes.summary": {
      requirePermission(actor, "settings.manage");
      const now = Date.now();
      const month = monthKey(now, actor.organization.timezone);
      const runs = (await ctx.db.query("aiRuns").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id).gte("createdAt", monthLowerBound(month))).take(1000))
        .filter((run) => monthKey(run.createdAt, actor.organization.timezone) === month);
      const preparedTaskIds: string[] = [];
      for (const run of runs) {
        const steps = await ctx.db.query("aiRunSteps").withIndex("by_organization_run", (q) => q.eq("organizationId", actor.organization._id).eq("runPublicId", run.publicId)).collect();
        for (const step of steps) {
          const ref = record(step.resultRef);
          // Linked work was already open; only tasks RIVET saved count as prepared.
          if (step.status === "verified" && ref.kind === "task" && step.reason !== "has_open_followup") preparedTaskIds.push(text(ref.id));
        }
      }
      const tasks = { prepared: preparedTaskIds.length, done: 0, open: 0, closedOther: 0 };
      for (const taskId of preparedTaskIds.slice(0, 1000)) {
        const row = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "task").eq("publicId", taskId)).unique();
        const status = text(record(row?.data).status) || "open";
        if (status === "completed") tasks.done += 1;
        else if (status === "open") tasks.open += 1;
        else tasks.closedOther += 1;
      }
      const inMonth = (at: number) => monthKey(at, actor.organization.timezone) === month;
      const proposals = (await ctx.db.query("aiProposals").withIndex("by_organization_status", (q) => q.eq("organizationId", actor.organization._id)).collect()).filter((row) => inMonth(row.proposedAt));
      const usage = await ctx.db.query("aiUsage").withIndex("by_organization_month", (q) => q.eq("organizationId", actor.organization._id).eq("month", month)).collect();
      const live = usage.filter((row) => row.source === "live");
      const feedback = (await ctx.db.query("aiFeedback").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id).gte("createdAt", monthLowerBound(month))).collect()).filter((row) => inMonth(row.createdAt));
      const rated = (rating: Doc<"aiFeedback">["rating"]) => feedback.filter((row) => row.rating === rating).length;
      const count = (status: string) => runs.filter((run) => run.status === status).length;
      return {
        month,
        runs: { total: runs.length, completed: count("completed"), partly: count("partially_completed"), failed: count("failed"), cancelled: count("cancelled") },
        tasks,
        proposals: {
          prepared: proposals.length,
          approved: proposals.filter((row) => row.status === "executed").length,
          rejected: proposals.filter((row) => row.status === "rejected").length,
          invalidated: proposals.filter((row) => row.status === "invalidated").length,
          expired: proposals.filter((row) => row.status === "expired" || (row.status === "pending" && row.expiresAt <= now)).length,
          pending: proposals.filter((row) => row.status === "pending" && row.expiresAt > now).length,
        },
        revisions: runs.reduce((sum, run) => sum + run.revisions.length, 0),
        model: { liveCalls: live.length, testCalls: usage.length - live.length, failures: usage.filter((row) => row.outcome !== "ok").length, ...(live.length ? { averageLatencyMs: Math.round(live.reduce((sum, row) => sum + row.latencyMs, 0) / live.length) } : {}), costMicros: usage.reduce((sum, row) => sum + (row.costMicros ?? 0), 0) },
        feedback: { useful: rated("useful"), notUseful: rated("not_useful") },
        dismissals: rated("dismissed"),
        unnecessaryContacts: rated("unnecessary"),
      } satisfies AiOutcomeSummary;
    }

    case "ai.memories.list": {
      requirePermission(actor, "members.read");
      const memberId = text(input.memberId);
      await port.scopedMember(ctx, actor, memberId);
      return await activeMemories(ctx, actor.organization._id, "member", memberId, port.tenantToday(actor));
    }

    case "ai.run.get": {
      const run = await runByPublicId(ctx, actor, text(input.runId));
      return await runView(ctx, actor, run);
    }

    case "ai.runs.list": {
      const limit = Math.max(1, Math.min(25, Number(input.limit) || 10));
      const playbook = text(input.playbook);
      const rows = await ctx.db.query("aiRuns").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).order("desc").take(200);
      const visible = rows.filter((run) => canReadRun(actor, run) && (!playbook || run.playbook === playbook) && (!input.branchId || run.branchPublicId === text(input.branchId) || !run.branchPublicId)).slice(0, limit);
      return await Promise.all(visible.map((run) => runView(ctx, actor, run, { includeSteps: false })));
    }

    case "ai.standing.list": {
      const rows = await ctx.db.query("aiGrants").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).order("desc").take(200);
      const managers = actor.role === "owner" || actor.role === "manager";
      // Owners and managers see the repeating work of the branches they cover; everyone sees their own.
      const visible = rows.filter((grant) => grant.kind === "standing" && grant.status !== "revoked" && (grant.ownerUserId === actor.user._id || grant.grantorUserId === actor.user._id || (managers && branchInScope(actor, grant.branchPublicId))));
      return await Promise.all(visible.map((grant) => standingView(ctx, grant)));
    }

    case "ai.standing.preview": {
      requireHuman(actor);
      const playbook = text(input.playbook) as AiPlaybookKey;
      const definition = PLAYBOOKS[playbook];
      if (!definition?.standingAllowed) domainError("VALIDATION_ERROR", "This work cannot repeat on a schedule.", { correlationId: actor.correlationId });
      const parsed = parsePlaybookParams(playbook, input.params);
      if (!parsed.ok) domainError("VALIDATION_ERROR", "Check the details and try again.", { correlationId: actor.correlationId });
      const entitled = await port.entitledModules(ctx, actor);
      const blocked = playbookBlocked(definition, await authorityInput(ctx, actor, definition.capability, entitled));
      if (blocked) domainError("FORBIDDEN", "This work is turned off for your gym.", { correlationId: actor.correlationId, details: { reason: blocked } });
      return await port.previewPlaybook(ctx, actor, playbook, parsed.params, request);
    }

    case "ai.proposals.list": {
      const runId = text(input.runId);
      const rows = runId
        ? await ctx.db.query("aiProposals").withIndex("by_organization_run", (q) => q.eq("organizationId", actor.organization._id).eq("runPublicId", runId)).take(50)
        : await ctx.db.query("aiProposals").withIndex("by_organization_status", (q) => q.eq("organizationId", actor.organization._id).eq("status", "pending")).take(50);
      const views = [];
      const blockedByTool = new Map<string, boolean>();
      for (const proposal of rows) {
        const run = await ctx.db.query("aiRuns").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", proposal.runPublicId)).unique();
        if (!run || !canReadRun(actor, run)) continue;
        if (!blockedByTool.has(proposal.tool)) blockedByTool.set(proposal.tool, Boolean(await proposalApprovalBlocked(ctx, actor, port, proposal)));
        views.push(await proposalView(ctx, actor, proposal, { approvalBlocked: blockedByTool.get(proposal.tool) }));
      }
      return views;
    }

    case "ai.artifact.get": {
      const artifact = await ctx.db.query("aiArtifacts").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", text(input.artifactId))).unique();
      if (!artifact) domainError("NOT_FOUND", "Record not found.", { correlationId: actor.correlationId });
      return await artifactView(ctx, actor, artifact);
    }

    default:
      domainError("NOT_FOUND", `Unknown operation ${operation}.`, { message: { key: "apiErrors.unexpected" }, correlationId: actor.correlationId });
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

async function scheduleTick(ctx: MutationCtx, run: { publicId: string; organizationId: Id<"organizations"> }, delayMs = 0): Promise<void> {
  await ctx.scheduler.runAfter(delayMs, internal.aiRuns.tick, { organizationId: run.organizationId, runPublicId: run.publicId });
}

/** Queued and running work for one gym stops at its next step; whatever it already saved stays reported. */
async function requestStopForGym(ctx: MutationCtx, organizationId: Id<"organizations">, byUserId: Id<"users">, now: number): Promise<void> {
  for (const status of ["queued", "running"] as const) {
    const active = await ctx.db.query("aiRuns").withIndex("by_organization_status", (q) => q.eq("organizationId", organizationId).eq("status", status)).take(100);
    for (const run of active) await ctx.db.patch(run._id, { cancelRequestedAt: now, cancelRequestedByUserId: byUserId, updatedAt: now });
  }
}

/** Grant + run for one delegated job. Shared by user starts and standing-instruction slots. */
export async function createRun(ctx: MutationCtx, actor: ActorContext, input: {
  playbook: AiPlaybookKey;
  params: Record<string, string | number | boolean>;
  branchPublicId?: string;
  requestKey: string;
  trigger: "user" | "schedule" | "event";
  grant?: Doc<"aiGrants">;
}): Promise<AiRunDoc> {
  const definition = PLAYBOOKS[input.playbook];
  const existing = await ctx.db.query("aiRuns").withIndex("by_organization_request_key", (q) => q.eq("organizationId", actor.organization._id).eq("requestKey", input.requestKey)).unique();
  if (existing) return existing;
  const now = Date.now();
  let grant = input.grant;
  if (!grant) {
    const grantPublicId = newAiPublicId("grant");
    // The grant lists only tools the requester may use right now; it can never add to their role.
    const tools = definition.tools.filter((key) => {
      const tool = TOOLS[key];
      return tool && tool.permissions.every((permission) => actor.permissions.includes(permission));
    });
    const grantId = await ctx.db.insert("aiGrants", {
      organizationId: actor.organization._id,
      publicId: grantPublicId,
      kind: "one_off",
      playbook: input.playbook,
      playbookVersion: definition.version,
      grantorUserId: actor.user._id,
      ownerUserId: actor.user._id,
      ...(input.branchPublicId ? { branchPublicId: input.branchPublicId } : {}),
      tools,
      params: input.params,
      limits: definition.limits,
      status: "active",
      revision: 1,
      expiresAt: now + 24 * 3_600_000,
      createdAt: now,
      updatedAt: now,
    });
    grant = (await ctx.db.get(grantId))!;
  }
  const runPublicId = newAiPublicId("run");
  const runId = await ctx.db.insert("aiRuns", {
    organizationId: actor.organization._id,
    publicId: runPublicId,
    grantPublicId: grant.publicId,
    playbook: input.playbook,
    playbookVersion: definition.version,
    ...(input.branchPublicId ? { branchPublicId: input.branchPublicId } : {}),
    requestedByUserId: actor.user._id,
    ownerUserId: grant.ownerUserId,
    trigger: input.trigger,
    requestKey: input.requestKey,
    params: input.params,
    status: "queued",
    stage: "aiWork.stage.queued",
    plannedSubjects: [],
    cursor: 0,
    counts: { considered: 0, prepared: 0, created: 0, linked: 0, skipped: 0, failed: 0 },
    budget: { modelCalls: 0, writes: 0, costMicros: 0, inputTokens: 0, outputTokens: 0 },
    limits: grant.limits,
    attempts: 0,
    deadlineAt: now + grant.limits.maxDurationMs,
    revisions: [],
    resultRefs: [],
    exclusions: [],
    source: adapterConfig().mode === "live" ? "live" : adapterConfig().mode === "fixture" ? "fixture" : "rules",
    createdAt: now,
    updatedAt: now,
  });
  const run = (await ctx.db.get(runId))!;
  await scheduleTick(ctx, run);
  return run;
}

function validRevision(raw: unknown, run: AiRunDoc, staff: Array<{ id: string; name: string; active: boolean }>): AiRunRevision | undefined {
  const value = record(raw);
  if (value.kind === "time_of_day" && (value.value === "morning" || value.value === "afternoon" || value.value === "evening")) return { kind: "time_of_day", value: value.value };
  if (value.kind === "exclude_member") {
    const subject = run.plannedSubjects.find((item) => item.id === text(value.memberId));
    return subject ? { kind: "exclude_member", memberId: subject.id, memberName: subject.name } : undefined;
  }
  if (value.kind === "owner") {
    const person = staff.find((item) => item.id === text(value.ownerId) && item.active);
    return person ? { kind: "owner", ownerId: person.id, ownerName: person.name } : undefined;
  }
  return undefined;
}

type ProposalRefusal = Exclude<AiApproveAllOutcome, "approved" | "no_longer_matched" | "not_saved">;

/**
 * Whether RIVET may carry out a prepared change for this person now. The stops,
 * the gym's availability and mode, the capability switch and the tool's own
 * access all apply, exactly as when the change was prepared.
 */
async function proposalApprovalBlocked(ctx: ReadCtx, actor: ActorContext, port: AiDomainPort, proposal: Doc<"aiProposals">): Promise<AiErrorCategory | undefined> {
  const tool = TOOLS[proposal.tool];
  if (!tool) return "validation";
  return toolBlocked(tool, await authorityInput(ctx, actor, tool.capability, await port.entitledModules(ctx, actor)));
}

/** The checks before any decision on a prepared change, for this person, now. Rejecting stays open under a stop. */
async function decidableProposal(ctx: MutationCtx, actor: ActorContext, port: AiDomainPort, proposalId: string, changesetHash: string, options: { runId?: string; approving: boolean }): Promise<{ proposal: Doc<"aiProposals">; run: AiRunDoc } | { refusal: ProposalRefusal }> {
  const runId = options.runId;
  const proposal = await ctx.db.query("aiProposals").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", proposalId)).unique();
  if (!proposal || (runId !== undefined && proposal.runPublicId !== runId)) return { refusal: "not_found" };
  const run = await ctx.db.query("aiRuns").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", proposal.runPublicId)).unique();
  if (!run || !canReadRun(actor, run)) return { refusal: "not_found" };
  if (!actor.permissions.includes(proposal.requiredPermission)) return { refusal: "no_access" };
  if (proposal.status !== "pending") return { refusal: "already_decided" };
  // The view already reads an elapsed proposal as expired; nothing is written for it.
  if (proposal.expiresAt <= Date.now()) return { refusal: "expired" };
  if (changesetHash !== proposal.changesetHash) return { refusal: "changed" };
  if (options.approving) {
    const blocked = await proposalApprovalBlocked(ctx, actor, port, proposal);
    if (blocked) return { refusal: blocked === "permission_denied" ? "no_access" : "not_available" };
  }
  return { proposal, run };
}

function refuseProposalDecision(actor: ActorContext, refusal: ProposalRefusal): never {
  const options = { correlationId: actor.correlationId };
  switch (refusal) {
    case "not_found": domainError("NOT_FOUND", "Record not found.", options);
    case "no_access": domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", options);
    case "already_decided": domainError("CONFLICT", "This change was already decided.", options);
    case "expired": domainError("CONFLICT", "This prepared change expired. Prepare it again.", options);
    case "changed": domainError("CONFLICT", "This record changed. Refresh and try again.", options);
    case "not_available": domainError("FEATURE_NOT_AVAILABLE", "This work is turned off for your gym.", options);
  }
}

/**
 * Approve a prepared change that passed `decidableProposal`: re-derive it from
 * current records, and either record that it no longer matches or run the
 * existing operation as the approving person, with its own checks and audit.
 */
async function approveCheckedProposal(ctx: MutationCtx, actor: ActorContext, port: AiDomainPort, request: RequestArgs, proposal: Doc<"aiProposals">, run: AiRunDoc): Promise<{ outcome: "approved" | "no_longer_matched"; view: AiProposalView }> {
  const now = Date.now();
  const executor = PROPOSAL_EXECUTORS[proposal.tool];
  const executorInput = executor?.input(record(proposal.payload));
  if (!executor || !executorInput) domainError("VALIDATION_ERROR", "This prepared change cannot be approved here.", { correlationId: actor.correlationId });
  const versions = await port.sourceVersions(ctx, actor, proposal.sourceVersions);
  const sourcesMoved = proposal.sourceVersions.some((source, index) => versions[index] !== source.updatedAt);
  const rederived = sourcesMoved ? null : await executor.rederive(ctx, actor, port, record(proposal.payload));
  if (rederived !== proposal.changesetHash) {
    // A material change since it was prepared: record that, change nothing else.
    await ctx.db.patch(proposal._id, { status: "invalidated", invalidationReason: "source_changed", decidedByUserId: actor.user._id, decidedAt: now });
    await port.insertAudit(ctx, actor, { category: "ai", action: "ai.proposal.invalidate", entityType: "ai_proposal", entityId: proposal.publicId, entityLabel: proposal.subjectLabel, summary: "Prepared change no longer matched the records", branchId: run.branchPublicId });
    return { outcome: "no_longer_matched", view: await proposalView(ctx, actor, (await ctx.db.get(proposal._id))!) };
  }
  // The existing operation runs as the approving person, with its own permission, reason and audit.
  const result = record(await port.executeApproved(ctx, executor.operation, executorInput, request));
  await ctx.db.patch(proposal._id, { status: "executed", decidedByUserId: actor.user._id, decidedAt: now, executionReceipt: { operation: executor.operation, recordId: text(result.id), executedAt: now } });
  await port.insertAudit(ctx, actor, { category: "ai", action: "ai.proposal.approve", entityType: "ai_proposal", entityId: proposal.publicId, entityLabel: proposal.subjectLabel, summary: "Prepared change approved and saved", branchId: run.branchPublicId });
  return { outcome: "approved", view: await proposalView(ctx, actor, (await ctx.db.get(proposal._id))!) };
}

/** One approval inside "approve all", for the internal step that runs each in its own sub-transaction. */
export async function approveProposalForBatch(ctx: MutationCtx, request: RequestArgs, port: AiDomainPort, input: { runId: string; proposalId: string; changesetHash: string }): Promise<{ outcome: AiApproveAllOutcome; subjectLabel?: string }> {
  const actor = await requireActor(ctx, request);
  requireHuman(actor);
  const checked = await decidableProposal(ctx, actor, port, input.proposalId, input.changesetHash, { runId: input.runId, approving: true });
  if ("refusal" in checked) return { outcome: checked.refusal };
  const { outcome } = await approveCheckedProposal(ctx, actor, port, request, checked.proposal, checked.run);
  return { outcome, subjectLabel: checked.proposal.subjectLabel };
}

export async function aiMutation(ctx: MutationCtx, operation: string, input: Data, request: RequestArgs, port: AiDomainPort): Promise<unknown> {
  if (operation === "ai.platform.stop") {
    const admin = await requirePlatformAdmin(ctx, request.correlationId);
    const stopped = input.stopped === true;
    const reason = text(input.reason);
    if (!reason) domainError("VALIDATION_ERROR", "A reason is required for this action.", { fieldErrors: { reason: ["Required"] }, correlationId: admin.correlationId });
    const existing = await ctx.db.query("aiControls").withIndex("by_key", (q) => q.eq("key", GLOBAL_CONTROL_KEY)).unique();
    const now = Date.now();
    if (existing) await ctx.db.patch(existing._id, { stopped, reason, changedByUserId: admin.user._id, changedAt: now });
    else await ctx.db.insert("aiControls", { key: GLOBAL_CONTROL_KEY, stopped, reason, changedByUserId: admin.user._id, changedAt: now });
    await ctx.db.insert("platformAuditEvents", { publicId: newAiPublicId("audit"), actorUserId: admin.user._id, actorPublicId: publicUserId(admin.user), actorName: admin.user.fullName, action: stopped ? "ai.global.stop" : "ai.global.resume", entityType: "ai_control", entityPublicId: GLOBAL_CONTROL_KEY, entityLabel: "RIVET assistance", summary: stopped ? "Stopped RIVET assistance for every gym" : "Resumed RIVET assistance", reason, correlationId: admin.correlationId, occurredAt: now });
    return { stopped, reason };
  }

  if (operation === "ai.platform.availability.set") {
    // Only a platform admin decides which gyms may use assistance; a gym owner cannot.
    const admin = await requirePlatformAdmin(ctx, request.correlationId);
    const available = input.available === true;
    const reason = text(input.reason).slice(0, 300);
    if (!reason) domainError("VALIDATION_ERROR", "A reason is required for this action.", { fieldErrors: { reason: ["Required"] }, correlationId: admin.correlationId });
    const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", text(input.organizationId))).unique();
    if (!organization) domainError("NOT_FOUND", "Record not found.", { correlationId: admin.correlationId });
    const existing = await availabilityFor(ctx, organization._id);
    const names = new Map<string, string>();
    if (Boolean(existing?.available) === available) return await availabilityView(ctx, organization, existing, names);
    const now = Date.now();
    if (existing) await ctx.db.patch(existing._id, { available, reason, changedByUserId: admin.user._id, changedAt: now });
    else await ctx.db.insert("aiAvailability", { organizationId: organization._id, available, reason, changedByUserId: admin.user._id, changedAt: now });
    // Removing availability stops that gym's work at its next step, like the gym's own switch.
    if (!available) await requestStopForGym(ctx, organization._id, admin.user._id, now);
    await ctx.db.insert("platformAuditEvents", { publicId: newAiPublicId("audit"), actorUserId: admin.user._id, actorPublicId: publicUserId(admin.user), actorName: admin.user.fullName, action: available ? "ai.gym.available" : "ai.gym.unavailable", entityType: "organization", entityPublicId: publicOrganizationId(organization), entityLabel: organization.name, summary: available ? `Made RIVET assistance available for ${organization.name}` : `Removed RIVET assistance for ${organization.name}`, reason, before: { available: Boolean(existing?.available) }, after: { available }, correlationId: admin.correlationId, occurredAt: now });
    return await availabilityView(ctx, organization, await availabilityFor(ctx, organization._id), names);
  }

  const actor = await requireActor(ctx, request);
  requireHuman(actor);
  switch (operation) {
    case "ai.settings.update": {
      requirePermission(actor, "settings.manage");
      const current = await aiSettingsFor(ctx, actor.organization._id);
      const expected = Number(input.expectedRevision);
      if ((current?.revision ?? 0) !== expected) domainError("CONFLICT", "This record changed. Refresh and try again.", { correlationId: actor.correlationId });
      const tenantMode = input.tenantMode === undefined ? current?.tenantMode ?? "off" : (AI_TENANT_MODES as readonly string[]).includes(String(input.tenantMode)) ? input.tenantMode as AiTenantMode : domainError("VALIDATION_ERROR", "Choose off, prepare or execute.", { correlationId: actor.correlationId });
      const capabilityModes: Record<string, AiTenantMode> = { ...(current?.capabilityModes ?? {}) };
      for (const [key, mode] of Object.entries(record(input.capabilities))) {
        if (!CAPABILITY_KEYS.includes(key as AiCapabilityKey) || !(AI_TENANT_MODES as readonly string[]).includes(String(mode))) domainError("VALIDATION_ERROR", "Check the details and try again.", { correlationId: actor.correlationId });
        capabilityModes[key] = mode as AiTenantMode;
      }
      const externalProcessing = typeof input.externalProcessing === "boolean" ? input.externalProcessing : current?.externalProcessing ?? false;
      // Until RIVET makes assistance available for this gym, the owner can only keep it off.
      // Keeping or lowering a saved choice is fine; only raising it, or allowing external processing, is refused.
      const turningOn = TENANT_MODE_RANK[tenantMode] > TENANT_MODE_RANK[current?.tenantMode ?? "off"] || (externalProcessing && !current?.externalProcessing);
      if (turningOn && !(await platformAvailable(ctx, actor.organization._id))) domainError("FEATURE_NOT_AVAILABLE", "RIVET has not made assistance available for this gym.", { correlationId: actor.correlationId, details: { reason: "not_available" } });
      const now = Date.now();
      const next = { tenantMode, capabilityModes, externalProcessing, revision: (current?.revision ?? 0) + 1, updatedByUserId: actor.user._id, updatedAt: now };
      if (current) await ctx.db.patch(current._id, next);
      else await ctx.db.insert("aiSettings", { organizationId: actor.organization._id, ...next });
      await port.insertAudit(ctx, actor, { category: "settings", action: "ai.settings.update", entityType: "ai_settings", entityId: publicOrganizationId(actor.organization), entityLabel: actor.organization.name, summary: `RIVET assistance set to ${tenantMode}`, reason: text(input.reason) || undefined, before: current ? { tenantMode: current.tenantMode, externalProcessing: current.externalProcessing, capabilityModes: current.capabilityModes } : undefined, after: { tenantMode, externalProcessing, capabilityModes } });
      // Turning assistance off stops queued and running work at its next step.
      if (tenantMode === "off") await requestStopForGym(ctx, actor.organization._id, actor.user._id, now);
      return await settingsView(ctx, actor);
    }

    case "ai.run.start": {
      const playbook = text(input.playbook) as AiPlaybookKey;
      const definition = PLAYBOOKS[playbook];
      if (!definition) domainError("VALIDATION_ERROR", "Choose what RIVET should prepare.", { correlationId: actor.correlationId });
      const requestKey = text(input.requestKey);
      if (requestKey.length < 8 || requestKey.length > 120) domainError("VALIDATION_ERROR", "A valid request key is required.", { correlationId: actor.correlationId });
      const parsed = parsePlaybookParams(playbook, input.params);
      if (!parsed.ok) domainError("VALIDATION_ERROR", "Check the details and try again.", { correlationId: actor.correlationId });
      const entitled = await port.entitledModules(ctx, actor);
      const blocked = playbookBlocked(definition, await authorityInput(ctx, actor, definition.capability, entitled));
      if (blocked) domainError(blocked === "permission_denied" ? "FORBIDDEN" : "FEATURE_NOT_AVAILABLE", blocked === "permission_denied" ? "You do not have access to this action. Ask your gym owner." : "This work is turned off for your gym.", { correlationId: actor.correlationId, details: { reason: blocked } });
      // A branch-limited person's work always belongs to one of their branches, never to the whole gym.
      const branchPublicId = await workBranchPublicId(ctx, actor, text(input.branchId) || undefined);
      if (branchPublicId) {
        const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", branchPublicId)).unique();
        assertBranchAccess(actor, branch);
      }
      const run = await createRun(ctx, actor, { playbook, params: parsed.params, branchPublicId, requestKey: `user:${publicUserId(actor.user)}:${requestKey}`, trigger: "user" });
      if (run.createdAt === run.updatedAt && run.status === "queued") {
        await port.insertAudit(ctx, actor, { category: "ai", action: "ai.run.start", entityType: "ai_run", entityId: run.publicId, entityLabel: definition.goalKey, summary: `Delegated work started: ${playbook}`, after: { playbook, params: parsed.params, grant: run.grantPublicId }, branchId: branchPublicId });
      }
      return await runView(ctx, actor, run);
    }

    case "ai.run.cancel": {
      const run = await runByPublicId(ctx, actor, text(input.runId));
      if (!canControlRun(actor, run)) domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", { correlationId: actor.correlationId });
      if (isTerminalRunStatus(run.status as AiRunStatus)) return await runView(ctx, actor, run);
      const now = Date.now();
      if (run.status === "queued" && run.cursor === 0 && !run.leaseToken) {
        await ctx.db.patch(run._id, { status: "cancelled", stage: "aiWork.stage.cancelled", cancelRequestedAt: now, cancelRequestedByUserId: actor.user._id, completedAt: now, updatedAt: now });
      } else {
        // A step that is already writing finishes atomically; nothing starts after this.
        await ctx.db.patch(run._id, { cancelRequestedAt: now, cancelRequestedByUserId: actor.user._id, updatedAt: now });
        await scheduleTick(ctx, run);
      }
      await port.insertAudit(ctx, actor, { category: "ai", action: "ai.run.cancel", entityType: "ai_run", entityId: run.publicId, entityLabel: run.playbook, summary: "Delegated work stopped", after: { committedEffects: run.counts.created } , branchId: run.branchPublicId });
      return await runView(ctx, actor, (await ctx.db.get(run._id))!);
    }

    case "ai.run.revise": {
      const run = await runByPublicId(ctx, actor, text(input.runId));
      if (!canControlRun(actor, run) || run.playbook !== "renewal_followups") domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", { correlationId: actor.correlationId });
      if (isTerminalRunStatus(run.status as AiRunStatus)) domainError("CONFLICT", "This work has already finished.", { correlationId: actor.correlationId });
      const revision = validRevision(input.revision, run, await port.staffMembers(ctx, actor));
      if (!revision) domainError("VALIDATION_ERROR", "RIVET could not apply that change. Try different words.", { correlationId: actor.correlationId });
      const remaining = Math.max(0, run.plannedSubjects.length - run.cursor);
      const now = Date.now();
      await ctx.db.patch(run._id, { revisions: [...run.revisions, { id: newAiPublicId("rev"), at: now, byUserId: actor.user._id, text: text(input.text).slice(0, 300), interpreted: revision, appliedToRemaining: remaining }], updatedAt: now });
      await port.insertAudit(ctx, actor, { category: "ai", action: "ai.run.revise", entityType: "ai_run", entityId: run.publicId, entityLabel: run.playbook, summary: "Delegated work changed for the remaining members", after: revision, branchId: run.branchPublicId });
      return await runView(ctx, actor, (await ctx.db.get(run._id))!);
    }

    case "ai.run.take_over": {
      const run = await runByPublicId(ctx, actor, text(input.runId));
      if (!canControlRun(actor, run)) domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", { correlationId: actor.correlationId });
      if (isTerminalRunStatus(run.status as AiRunStatus)) return await runView(ctx, actor, run);
      const now = Date.now();
      const remaining = run.plannedSubjects.slice(run.cursor);
      let seq = (await ctx.db.query("aiRunSteps").withIndex("by_organization_run", (q) => q.eq("organizationId", run.organizationId).eq("runPublicId", run.publicId)).order("desc").first())?.seq ?? 0;
      for (const subject of remaining) {
        seq += 1;
        await ctx.db.insert("aiRunSteps", { organizationId: run.organizationId, runPublicId: run.publicId, seq, tool: "handover", subjectId: subject.id, subjectName: subject.name, status: "handed_over", attempts: 0, createdAt: now, updatedAt: now });
      }
      await ctx.db.patch(run._id, { status: run.counts.created > 0 || run.counts.linked > 0 ? "partially_completed" : "cancelled", stage: "aiWork.stage.takenOver", cursor: run.plannedSubjects.length, takenOverAt: now, takenOverByUserId: actor.user._id, leaseToken: undefined, leaseExpiresAt: undefined, completedAt: now, updatedAt: now });
      await port.insertAudit(ctx, actor, { category: "ai", action: "ai.run.take_over", entityType: "ai_run", entityId: run.publicId, entityLabel: run.playbook, summary: `Took over ${remaining.length} remaining items`, branchId: run.branchPublicId });
      return await runView(ctx, actor, (await ctx.db.get(run._id))!);
    }

    case "ai.run.retry": {
      const run = await runByPublicId(ctx, actor, text(input.runId));
      if (!canControlRun(actor, run)) domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", { correlationId: actor.correlationId });
      if (!(run.status === "failed" || run.status === "partially_completed") || run.errorCategory === "authority_revoked" || run.takenOverAt) domainError("CONFLICT", "This work cannot be retried.", { correlationId: actor.correlationId });
      const definition = PLAYBOOKS[run.playbook as AiPlaybookKey];
      const blocked = playbookBlocked(definition, await authorityInput(ctx, actor, definition.capability, await port.entitledModules(ctx, actor)));
      if (blocked) domainError("FEATURE_NOT_AVAILABLE", "This work is turned off for your gym.", { correlationId: actor.correlationId, details: { reason: blocked } });
      const now = Date.now();
      await ctx.db.patch(run._id, { status: "queued", stage: "aiWork.stage.queued", errorCategory: undefined, leaseToken: undefined, leaseExpiresAt: undefined, deadlineAt: now + run.limits.maxDurationMs, completedAt: undefined, updatedAt: now });
      await scheduleTick(ctx, run);
      return await runView(ctx, actor, (await ctx.db.get(run._id))!);
    }

    case "ai.standing.create": {
      const playbook = text(input.playbook) as AiPlaybookKey;
      const definition = PLAYBOOKS[playbook];
      if (!definition?.standingAllowed) domainError("VALIDATION_ERROR", "This work cannot repeat on a schedule.", { correlationId: actor.correlationId });
      const parsed = parsePlaybookParams(playbook, input.params);
      if (!parsed.ok) domainError("VALIDATION_ERROR", "Check the details and try again.", { correlationId: actor.correlationId });
      // Repeating work covers each day as it comes; a fixed date would repeat the same day.
      if (record(parsed.params).date !== undefined) domainError("VALIDATION_ERROR", "Repeating work uses each day's own date.", { correlationId: actor.correlationId });
      const scheduleInput = record(input.schedule);
      const weekdays = Array.isArray(scheduleInput.weekdays) ? [...new Set(scheduleInput.weekdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort() : [];
      const time = text(scheduleInput.time);
      if (!weekdays.length || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) domainError("VALIDATION_ERROR", "Choose at least one day and a time.", { correlationId: actor.correlationId });
      const entitled = await port.entitledModules(ctx, actor);
      const blocked = playbookBlocked(definition, await authorityInput(ctx, actor, definition.capability, entitled));
      if (blocked) domainError("FEATURE_NOT_AVAILABLE", "This work is turned off for your gym.", { correlationId: actor.correlationId, details: { reason: blocked } });
      const requestKey = text(input.requestKey);
      if (requestKey.length < 8) domainError("VALIDATION_ERROR", "A valid request key is required.", { correlationId: actor.correlationId });
      const branchPublicId = await workBranchPublicId(ctx, actor, text(input.branchId) || undefined);
      if (branchPublicId) assertBranchAccess(actor, await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", branchPublicId)).unique());
      // Enabling a recurring grant is deliberate: the caller must have seen the current preview.
      const preview = await port.previewPlaybook(ctx, actor, playbook, parsed.params, branchPublicId ? { ...request, activeBranchId: branchPublicId } : request);
      if (text(input.previewDigest) !== preview.digest) domainError("CONFLICT", "The preview changed. Review it again before turning this on.", { correlationId: actor.correlationId, details: { reason: "preview_changed" } });
      // A retry returns the same person's instruction; someone else's key never does.
      const existing = (await ctx.db.query("aiGrants").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).order("desc").take(200)).find((grant) => grant.kind === "standing" && grant.grantorUserId === actor.user._id && record(grant.params).requestKey === requestKey);
      if (existing) return await standingView(ctx, existing);
      const limitsInput = record(input.limits);
      const limits = { ...definition.limits, ...(Number.isInteger(limitsInput.maxWrites) && Number(limitsInput.maxWrites) >= 1 && Number(limitsInput.maxWrites) <= definition.limits.maxWrites ? { maxWrites: Number(limitsInput.maxWrites) } : {}) };
      const now = Date.now();
      const tools = definition.tools.filter((key) => TOOLS[key]?.permissions.every((permission) => actor.permissions.includes(permission)));
      const id = await ctx.db.insert("aiGrants", {
        organizationId: actor.organization._id,
        publicId: newAiPublicId("standing"),
        kind: "standing",
        playbook,
        playbookVersion: definition.version,
        grantorUserId: actor.user._id,
        ownerUserId: actor.user._id,
        ...(branchPublicId ? { branchPublicId } : {}),
        tools,
        params: { ...parsed.params, requestKey },
        limits,
        schedule: { weekdays, time },
        status: "active",
        revision: 1,
        nextRunAt: nextSlot({ weekdays, time }, actor.organization.timezone, now),
        createdAt: now,
        updatedAt: now,
      });
      const grant = (await ctx.db.get(id))!;
      await port.insertAudit(ctx, actor, { category: "ai", action: "ai.standing.create", entityType: "ai_standing_instruction", entityId: grant.publicId, entityLabel: definition.goalKey, summary: `Standing instruction turned on: ${playbook}`, after: { schedule: grant.schedule, tools, limits, params: parsed.params, previewSubjects: preview.subjects.length }, branchId: branchPublicId });
      return await standingView(ctx, grant);
    }

    case "ai.standing.pause":
    case "ai.standing.resume":
    case "ai.standing.revoke":
    case "ai.standing.transfer": {
      const grant = await grantByPublicId(ctx, actor, text(input.standingId));
      const managers = actor.role === "owner" || actor.role === "manager";
      if (grant.kind !== "standing" || !(grant.ownerUserId === actor.user._id || (managers && branchInScope(actor, grant.branchPublicId)))) domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", { correlationId: actor.correlationId });
      if (grant.status === "revoked") domainError("CONFLICT", "This instruction was already turned off.", { correlationId: actor.correlationId });
      const now = Date.now();
      let patch: Partial<Doc<"aiGrants">> = {};
      let summary = "";
      if (operation === "ai.standing.pause") { patch = { status: "paused" }; summary = "Standing instruction paused"; }
      if (operation === "ai.standing.resume") {
        const definition = PLAYBOOKS[grant.playbook as AiPlaybookKey];
        const owner = grant.ownerUserId === actor.user._id ? actor : undefined;
        if (owner) {
          const blocked = playbookBlocked(definition, await authorityInput(ctx, owner, definition.capability, await port.entitledModules(ctx, owner)));
          if (blocked) domainError("FEATURE_NOT_AVAILABLE", "This work is turned off for your gym.", { correlationId: actor.correlationId, details: { reason: blocked } });
        }
        patch = { status: "active", nextRunAt: grant.schedule ? nextSlot(grant.schedule, actor.organization.timezone, now) : undefined };
        summary = "Standing instruction resumed";
      }
      if (operation === "ai.standing.revoke") {
        patch = { status: "revoked", revokedAt: now, revokedByUserId: actor.user._id, revokedReason: text(input.reason) || "Turned off", nextRunAt: undefined };
        summary = "Standing instruction turned off";
        // Pending work under this instruction stops before its next write.
        const runs = await ctx.db.query("aiRuns").withIndex("by_grant", (q) => q.eq("grantPublicId", grant.publicId)).take(50);
        for (const run of runs) if (!isTerminalRunStatus(run.status as AiRunStatus)) await ctx.db.patch(run._id, { cancelRequestedAt: now, cancelRequestedByUserId: actor.user._id, updatedAt: now });
      }
      if (operation === "ai.standing.transfer") {
        if (!managers) domainError("FORBIDDEN", "You do not have access to this action. Ask your gym owner.", { correlationId: actor.correlationId });
        const staff = await port.staffMembers(ctx, actor);
        const target = staff.find((item) => item.id === text(input.ownerId) && item.active);
        if (!target) domainError("VALIDATION_ERROR", "Choose an active staff member.", { correlationId: actor.correlationId });
        // The new owner's own current access is checked again on every run.
        patch = { ownerUserId: target.userId, revision: grant.revision + 1 };
        summary = `Standing instruction moved to ${target.name}`;
      }
      await ctx.db.patch(grant._id, { ...patch, revision: (patch.revision ?? grant.revision + 1), updatedAt: now });
      await port.insertAudit(ctx, actor, { category: "ai", action: operation, entityType: "ai_standing_instruction", entityId: grant.publicId, entityLabel: grant.playbook, summary, reason: text(input.reason) || undefined, branchId: grant.branchPublicId });
      return await standingView(ctx, (await ctx.db.get(grant._id))!);
    }

    case "ai.proposal.decide": {
      // RIVET never decides its own proposal; only a signed-in person can.
      requireHuman(actor);
      const decision = text(input.decision);
      if (decision !== "approve" && decision !== "reject") domainError("VALIDATION_ERROR", "Choose approve or reject.", { correlationId: actor.correlationId });
      const checked = await decidableProposal(ctx, actor, port, text(input.proposalId), text(input.changesetHash), { approving: decision === "approve" });
      if ("refusal" in checked) refuseProposalDecision(actor, checked.refusal);
      const { proposal, run } = checked;
      if (decision === "reject") {
        await ctx.db.patch(proposal._id, { status: "rejected", decidedByUserId: actor.user._id, decidedAt: Date.now() });
        await port.insertAudit(ctx, actor, { category: "ai", action: "ai.proposal.reject", entityType: "ai_proposal", entityId: proposal.publicId, entityLabel: proposal.subjectLabel, summary: "Prepared change rejected", branchId: run.branchPublicId });
        return await proposalView(ctx, actor, (await ctx.db.get(proposal._id))!);
      }
      return (await approveCheckedProposal(ctx, actor, port, request, proposal, run)).view;
    }

    case "ai.proposals.approve_all": {
      // One step for several prepared changes in one run. Each runs alone, with every recheck a single
      // approval has; one that fails is rolled back on its own and reported, never hidden.
      requireHuman(actor);
      const run = await runByPublicId(ctx, actor, text(input.runId));
      const requested = (Array.isArray(input.proposals) ? input.proposals : []).map(record).map((item) => ({ proposalId: text(item.proposalId), changesetHash: text(item.changesetHash) })).filter((item) => item.proposalId);
      const items = [...new Map(requested.map((item) => [item.proposalId, item])).values()].slice(0, AI_APPROVE_ALL_MAX);
      if (!items.length) domainError("VALIDATION_ERROR", "Choose the changes to approve.", { correlationId: actor.correlationId });
      const results: AiApproveAllResult["results"] = [];
      for (const item of items) {
        try {
          const one: { outcome: AiApproveAllOutcome; subjectLabel?: string } = await ctx.runMutation(internal.aiRuns.approveProposalStep, { ...(request.organizationId ? { organizationId: request.organizationId } : {}), ...(request.activeBranchId ? { activeBranchId: request.activeBranchId } : {}), ...(request.correlationId ? { correlationId: request.correlationId } : {}), runId: run.publicId, proposalId: item.proposalId, changesetHash: item.changesetHash });
          results.push({ proposalId: item.proposalId, outcome: one.outcome, ...(one.subjectLabel ? { subjectLabel: one.subjectLabel } : {}) });
        } catch {
          // The existing operation refused or failed: its writes were rolled back with it.
          results.push({ proposalId: item.proposalId, outcome: "not_saved" });
        }
      }
      const approved = results.filter((item) => item.outcome === "approved").length;
      await port.insertAudit(ctx, actor, { category: "ai", action: "ai.proposals.approve_all", entityType: "ai_run", entityId: run.publicId, entityLabel: run.playbook, summary: `Approved ${approved} of ${results.length} prepared changes together`, after: { outcomes: results.map((item) => `${item.proposalId}=${item.outcome}`).join(", ") }, branchId: run.branchPublicId });
      return { runId: run.publicId, results, approved } satisfies AiApproveAllResult;
    }

    case "ai.memory.record": {
      requirePermission(actor, "members.write");
      const subjectId = text(input.subjectId);
      const member = await port.scopedMember(ctx, actor, subjectId);
      const topic = text(input.topic);
      if (topic !== "travel" && topic !== "contact_time" && topic !== "no_contact") domainError("VALIDATION_ERROR", "Check the details and try again.", { correlationId: actor.correlationId });
      const today = port.tenantToday(actor);
      const effectiveUntil = text(input.effectiveUntil) || undefined;
      if (topic === "travel") {
        if (!effectiveUntil || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveUntil) || effectiveUntil < today) domainError("VALIDATION_ERROR", "Choose the date the member is back.", { correlationId: actor.correlationId });
        // A travel statement is bounded: it can never silence a member indefinitely.
        const [y, m, d] = today.split("-").map(Number) as [number, number, number];
        const limit = new Date(Date.UTC(y, m - 1, d + 120)).toISOString().slice(0, 10);
        if (effectiveUntil > limit) domainError("VALIDATION_ERROR", "Choose a return date within the next 120 days.", { correlationId: actor.correlationId });
      }
      const value = topic === "contact_time" ? text(input.value) : text(input.text).slice(0, 300);
      if (topic === "contact_time" && !["morning", "afternoon", "evening"].includes(value)) domainError("VALIDATION_ERROR", "Check the details and try again.", { correlationId: actor.correlationId });
      const sourceId = text(input.sourceTimelineId) || undefined;
      if (sourceId) {
        const source = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "timeline").eq("publicId", sourceId)).unique();
        if (!source || source.memberPublicId !== member.publicId) domainError("NOT_FOUND", "Record not found.", { correlationId: actor.correlationId });
      }
      const now = Date.now();
      const existing = await ctx.db.query("aiMemories").withIndex("by_organization_subject", (q) => q.eq("organizationId", actor.organization._id).eq("subjectType", "member").eq("subjectId", member.publicId)).take(50);
      const superseded = existing.find((row) => row.status === "active" && row.topic === topic);
      if (superseded) await ctx.db.patch(superseded._id, { status: "superseded", updatedAt: now });
      const branch = member.branchPublicId ? await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", member.branchPublicId)).unique() : null;
      const id = await ctx.db.insert("aiMemories", {
        organizationId: actor.organization._id,
        publicId: newAiPublicId("memory"),
        kind: topic === "contact_time" ? "preference" : "staff_statement",
        topic,
        subjectType: "member",
        subjectId: member.publicId,
        ...(branch ? { branchId: branch._id } : {}),
        text: value,
        effectiveFrom: today,
        ...(effectiveUntil ? { effectiveUntil } : {}),
        status: "active",
        provenance: { sourceKind: sourceId ? "contact_note" : "staff_explicit", ...(sourceId ? { sourceId } : {}), recordedByUserId: actor.user._id, recordedAt: now },
        revision: (superseded?.revision ?? 0) + 1,
        ...(superseded ? { supersedesPublicId: superseded.publicId } : {}),
        createdAt: now,
        updatedAt: now,
      });
      const saved = (await ctx.db.get(id))!;
      await port.insertAudit(ctx, actor, { category: "crm", action: "ai.memory.record", entityType: "member", entityId: member.publicId, entityLabel: member.fullName, summary: topic === "travel" ? `Travel noted until ${effectiveUntil}` : topic === "contact_time" ? `Preferred contact time: ${value}` : "Asked not to be contacted", after: { topic, effectiveUntil, sourceId }, branchId: member.branchPublicId });
      return memoryView(saved, { id: publicUserId(actor.user), name: actor.user.fullName });
    }

    case "ai.memory.revoke": {
      requirePermission(actor, "members.write");
      const memory = await ctx.db.query("aiMemories").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", text(input.memoryId))).unique();
      if (!memory || memory.subjectType !== "member") domainError("NOT_FOUND", "Record not found.", { correlationId: actor.correlationId });
      const member = await port.scopedMember(ctx, actor, memory.subjectId);
      const now = Date.now();
      await ctx.db.patch(memory._id, { status: "revoked", revokedAt: now, revokedByUserId: actor.user._id, updatedAt: now });
      await port.insertAudit(ctx, actor, { category: "crm", action: "ai.memory.revoke", entityType: "member", entityId: member.publicId, entityLabel: member.fullName, summary: "Staff note removed from RIVET's context", branchId: member.branchPublicId });
      return undefined;
    }

    case "ai.feedback.record": {
      const subjectKind = text(input.subjectKind);
      const rating = text(input.rating);
      // "dismissed": a suggestion closed without being used, counted in the monthly summary (AI-5.3).
      if (!["brief", "extraction", "run", "draft", "artifact"].includes(subjectKind) || !["useful", "not_useful", "dismissed"].includes(rating)) domainError("VALIDATION_ERROR", "Check the details and try again.", { correlationId: actor.correlationId });
      const correctedFields = Array.isArray(input.correctedFields) ? input.correctedFields.map(String).filter((field) => /^[a-zA-Z]{1,40}$/.test(field)).slice(0, 10) : [];
      await ctx.db.insert("aiFeedback", { organizationId: actor.organization._id, publicId: newAiPublicId("feedback"), subjectKind: subjectKind as Doc<"aiFeedback">["subjectKind"], subjectId: text(input.subjectId).slice(0, 120), rating: rating as Doc<"aiFeedback">["rating"], correctedFields, userId: actor.user._id, createdAt: Date.now() });
      return undefined;
    }

    case "ai.task.mark_unnecessary": {
      // A contact RIVET prepared turned out not to be needed: closed if still open, and counted (AI-5.3).
      requirePermission(actor, "crm.write");
      const taskId = text(input.taskId);
      const task = await port.closePreparedTaskAsNotNeeded(ctx, actor, taskId);
      const marked = (await ctx.db.query("aiFeedback").withIndex("by_organization_subject", (q) => q.eq("organizationId", actor.organization._id).eq("subjectKind", "task").eq("subjectId", taskId)).collect()).some((row) => row.rating === "unnecessary");
      if (!marked) {
        const now = Date.now();
        await ctx.db.insert("aiFeedback", { organizationId: actor.organization._id, publicId: newAiPublicId("feedback"), subjectKind: "task", subjectId: taskId, rating: "unnecessary", correctedFields: [], userId: actor.user._id, createdAt: now });
        const steps = await ctx.db.query("aiRunSteps").withIndex("by_organization_run", (q) => q.eq("organizationId", actor.organization._id).eq("runPublicId", task.runId)).take(500);
        for (const step of steps) if (record(step.resultRef).kind === "task" && record(step.resultRef).id === taskId) await ctx.db.patch(step._id, { markedUnnecessaryAt: now, updatedAt: now });
        await port.insertAudit(ctx, actor, { category: "ai", action: "ai.contact.unnecessary", entityType: "task", entityId: taskId, entityLabel: task.title, summary: task.closed ? "Prepared contact closed as not needed" : "Prepared contact marked as not needed", reason: text(input.reason).slice(0, 200) || undefined, after: { closed: task.closed, runId: task.runId }, branchId: task.branchId });
      }
      return { taskId, closed: task.closed, alreadyMarked: marked };
    }

    default:
      domainError("NOT_FOUND", `Unknown operation ${operation}.`, { message: { key: "apiErrors.unexpected" }, correlationId: actor.correlationId });
  }
}

export { previewDigest } from "../src/lib/ai/schedule";
