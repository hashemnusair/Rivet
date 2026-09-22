import type { JevSubject } from "./jevAnswers";
import { buildColumnTargetState, buildPlanMatchState, isImportField, normalizePlanLabel, type ImportAssistDraftData, type ImportColumnSummary, type ImportField, type PlanTerms } from "./jevImportState";
import { FOUNDATION_QUESTIONS } from "./jevQuestionsFoundation";
import { followUpRelatedTasks, gymProfileReviewContextData, memberFollowUpContextData, memberResolutionContextData, onboardingExperience, operatingBriefData, supportReviewSource, tenantToday, workspaceAccessData, type PlatformAdminContext } from "./domain";
import { buildBriefEmphasisState, buildBriefRelatedState } from "./operatingBrief";
import { buildLanguageGapState, buildProfileClaimState, languageGapUnavailableReason } from "./profileAssist";
import { BRANCHOPS_DESCRIPTION_MAX_LENGTH, BRANCHOPS_DESCRIPTION_MIN_LENGTH, buildHandoverRelatedState, buildNotificationTopicState, buildReportCategoryState, buildReportTargetState, buildSameFaultState, groupNotifications, handoverItemKey, type HandoverItem, type IssueLike, type NotificationLike } from "./branchOpsAssist";
import { branchByPublicId as operationsBranch, requireOperations } from "./operations";
import { buildSupportCategoryState, buildSupportClaimState, buildSupportClarificationState, buildSupportInvoiceMatchState, buildSupportUnansweredState, isSupportCategoryId, supportClaimPassages, supportRequestPassages } from "./supportAssist";
import { buildClassPickState, buildPlanPriorityState, buildResolutionIntentState, buildTrainerPickState, permittedResolutionClarifications, permittedResolutionPanels } from "./resolutionAssist";
import { FOLLOWUP_NOTE_MIN_LENGTH, REASON_ACTIONS, buildContactNoteState, buildReasonCheckState, buildRelatedTaskState, buildReminderTemplateState, buildRenewalContextState, isReasonAction, reminderTemplateUnavailableReason, type ContactSubjectKind } from "./followupAssist";
import type { Id } from "./_generated/dataModel";
import type { Permission } from "./permissions";
import { NAVIGATION_QUERY_MAX_LENGTH, buildNavigationIntentState, buildOnboardingNextStepState, buildReportFinderState, permittedClarifications, permittedNavigationEntries, type NavigationAccess, type OnboardingStepCandidate } from "./navigationCatalogue";
import type { JevCandidate, JevQuestion, JevState } from "./jevRegistry";
import { assertBranchAccess, domainError, publicBranchId, publicOrganizationId, publicUserId, requirePermission, type ActorContext, type ReadCtx } from "./security";

/**
 * Server-side state loaders, one per registered question. A loader runs
 * inside the authenticated request with the resolved actor: it re-checks
 * access to every subject it touches (cross-tenant records are `NOT_FOUND`,
 * as everywhere else), builds the bounded state Jev may see, and names the
 * scope the judgment belongs to so cache rows are never shared across gyms
 * or records. `sourceVersion` changes whenever the projection changes, which
 * invalidates cached judgments without touching the question version.
 *
 * Feature agents add their loader here next to their question module.
 */
export interface JevLoadedState {
  state: JevState;
  /** Dynamic options for candidate-based choice questions; ids are re-scoped before the model sees them. */
  candidates?: JevCandidate[];
  /** For example `lead:<publicId>`; combined with the organization in every cache lookup. */
  scopeKey: string;
  sourceVersion: string;
}

export type JevStateLoader = (ctx: ReadCtx, actor: ActorContext, subject: JevSubject) => Promise<JevLoadedState>;

/**
 * A platform-scoped loader runs for a platform administrator instead of a
 * gym actor. It must name the gym the judgment belongs to: that gym's switch,
 * cache rows and counters apply, so a gym that keeps Jev off is never sent
 * anywhere, not even by the support team reading its case.
 */
export type JevPlatformStateLoader = (ctx: ReadCtx, admin: PlatformAdminContext, subject: JevSubject) => Promise<JevLoadedState & { organizationDocId: Id<"organizations"> }>;

function syntheticLoader(question: JevQuestion): JevStateLoader {
  return async () => ({
    state: question.fixture.state,
    ...(question.fixture.candidates ? { candidates: question.fixture.candidates.map((candidate) => ({ ...candidate })) } : {}),
    scopeKey: "synthetic",
    sourceVersion: `fixture:${question.version}`,
  });
}

// --- Member import assistance ---------------------------------------------------

type Data = Record<string, unknown>;

function record(value: unknown): Data {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Data) : {};
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function columnSummary(value: unknown, index: number, headers: string[]): ImportColumnSummary {
  const data = record(value);
  return {
    index,
    heading: headers[index] ?? "",
    filled: count(data.filled),
    empty: count(data.empty),
    distinct: count(data.distinct),
    numeric: count(data.numeric),
    dateLike: count(data.dateLike),
    phoneLike: count(data.phoneLike),
    emailLike: count(data.emailLike),
    alphabetic: count(data.alphabetic),
    arabicScript: count(data.arabicScript),
    minLength: count(data.minLength),
    maxLength: count(data.maxLength),
  };
}

/**
 * The assist draft holds headings, value-shape summaries and legacy plan
 * labels for one file, saved by `members.import.draft`. It is tenant-scoped
 * through the organization and branch of the record; a draft from another gym
 * or an expired one is simply not found.
 */
async function importDraft(ctx: ReadCtx, actor: ActorContext, subject: JevSubject): Promise<ImportAssistDraftData> {
  const draftId = typeof subject.draftId === "string" ? subject.draftId.trim() : "";
  const row = draftId
    ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "memberImportDraft").eq("publicId", draftId)).unique()
    : null;
  const value = record(row?.data);
  // The draft belongs to the person who loaded the file; a colleague with the same permission asks about their own.
  if (!row || (typeof value.expiresAt === "number" && value.expiresAt < Date.now()) || (typeof value.createdById === "string" && value.createdById !== publicUserId(actor.user))) {
    domainError("NOT_FOUND", "The import draft was not found or has expired. Load the file again to continue.", { correlationId: actor.correlationId });
  }
  const branch = row.branchId ? await ctx.db.get(row.branchId) : null;
  assertBranchAccess(actor, branch);
  const headers = (Array.isArray(value.headers) ? value.headers : []).map((header) => String(header));
  const columns = (Array.isArray(value.columns) ? value.columns : []).map((column, index) => columnSummary(column, index, headers));
  const sourcePlanLabels = (Array.isArray(value.sourcePlanLabels) ? value.sourcePlanLabels : []).map((entry) => { const data = record(entry); return { label: String(data.label ?? ""), rows: count(data.rows) }; }).filter((entry) => entry.label);
  return { id: draftId, branchId: String(value.branchId ?? ""), headers, columns, sourcePlanLabels };
}

async function currentPlans(ctx: ReadCtx, actor: ActorContext): Promise<PlanTerms[]> {
  const rows = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "plan")).collect();
  return rows.map((row) => {
    const plan = record(row.data);
    const price = record(plan.basePrice);
    return {
      id: row.publicId,
      name: String(plan.name ?? row.publicId),
      code: typeof plan.code === "string" ? plan.code : undefined,
      kind: plan.kind === "visits" ? "visits" : "time",
      durationDays: typeof plan.durationDays === "number" ? plan.durationDays : undefined,
      visitAllowance: typeof plan.visitAllowance === "number" ? plan.visitAllowance : undefined,
      visitValidityDays: typeof plan.visitValidityDays === "number" ? plan.visitValidityDays : undefined,
      priceMinor: typeof price.amount === "number" ? price.amount : 0,
      currency: typeof price.currency === "string" ? price.currency : actor.organization.currency,
      branchAccess: plan.branchAccess === "selected" ? "selected" : "all",
      branchIds: (Array.isArray(plan.branchIds) ? plan.branchIds : []).map(String),
      status: plan.status === "archived" ? "archived" : "active",
    } satisfies PlanTerms;
  });
}

function assignedFields(subject: JevSubject): ImportField[] {
  const raw = typeof subject.assigned === "string" ? subject.assigned : "";
  return [...new Set(raw.split(",").map((item) => item.trim()).filter(isImportField))];
}

const columnTargetLoader: JevStateLoader = async (ctx, actor, subject) => {
  const draft = await importDraft(ctx, actor, subject);
  const columnIndex = typeof subject.column === "number" ? subject.column : Number(subject.column);
  const built = Number.isInteger(columnIndex) ? buildColumnTargetState({ draft, columnIndex, assignedFields: assignedFields(subject), currency: actor.organization.currency }) : undefined;
  if (!built) domainError("NOT_FOUND", "That column is not part of the import draft.", { correlationId: actor.correlationId });
  return { state: built.state, candidates: built.candidates, scopeKey: built.scopeKey, sourceVersion: built.sourceVersion };
};

const planMatchLoader: JevStateLoader = async (ctx, actor, subject) => {
  const draft = await importDraft(ctx, actor, subject);
  const wanted = typeof subject.label === "string" ? normalizePlanLabel(subject.label) : "";
  const entry = draft.sourcePlanLabels.find((candidate) => normalizePlanLabel(candidate.label) === wanted);
  if (!wanted || !entry) domainError("NOT_FOUND", "That plan label is not part of the import draft.", { correlationId: actor.correlationId });
  const built = buildPlanMatchState({ draft, label: entry.label, rows: entry.rows, plans: await currentPlans(ctx, actor), currency: actor.organization.currency });
  return { state: built.state, candidates: built.candidates, scopeKey: built.scopeKey, sourceVersion: built.sourceVersion };
};

// --- Intent-aware navigation --------------------------------------------------

/** What this actor may open: role permissions plus the server-owned module boundary, resolved here, never from the client. */
async function navigationAccess(ctx: ReadCtx, actor: ActorContext): Promise<NavigationAccess> {
  const access = await workspaceAccessData(ctx, actor);
  const modules = (Array.isArray(access.modules) ? access.modules : []).map((item) => {
    const status = record(item);
    return { key: String(status.key ?? ""), entitled: status.entitled === true, enabled: status.enabled === true };
  });
  return { permissions: actor.permissions, role: actor.role, modules };
}

function requestText(subject: JevSubject, key: string, actor: ActorContext): string {
  const text = typeof subject[key] === "string" ? subject[key].trim().slice(0, NAVIGATION_QUERY_MAX_LENGTH) : "";
  if (text.length < 2) domainError("VALIDATION_ERROR", "Type a few words first.", { correlationId: actor.correlationId });
  return text;
}

const navigationIntentLoader: JevStateLoader = async (ctx, actor, subject) => {
  const query = requestText(subject, "query", actor);
  const path = typeof subject.path === "string" && subject.path.startsWith("/") ? subject.path.slice(0, 200) : undefined;
  const entries = permittedNavigationEntries(await navigationAccess(ctx, actor));
  const built = buildNavigationIntentState({ query, currentPath: path, entries, clarifications: permittedClarifications(entries), role: actor.role });
  return { state: built.state, candidates: built.candidates, scopeKey: built.scopeKey, sourceVersion: built.sourceVersion };
};

const onboardingNextStepLoader: JevStateLoader = async (ctx, actor, subject) => {
  const audience = subject.audience === "owner" ? "owner" : "staff";
  const experience = await onboardingExperience(ctx, { audience }, { organizationId: publicOrganizationId(actor.organization), activeBranchId: actor.branch?.publicId, correlationId: actor.correlationId });
  const tasks: OnboardingStepCandidate[] = (Array.isArray(experience.tasks) ? experience.tasks : []).map((item) => {
    const task = record(item);
    return {
      key: String(task.key ?? ""),
      title: String(task.title ?? ""),
      description: String(task.description ?? ""),
      category: (task.category === "required" ? "required" : task.category === "optional" ? "optional" : "recommended") as OnboardingStepCandidate["category"],
      href: String(task.href ?? ""),
      complete: task.complete === true,
      unavailableReason: typeof task.unavailableReason === "string" ? task.unavailableReason : undefined,
    };
  }).filter((task) => task.key);
  const facts = {
    openRequired: tasks.filter((task) => task.category === "required" && !task.complete).length,
    openRecommended: tasks.filter((task) => task.category !== "required" && !task.complete).length,
    completed: tasks.filter((task) => task.complete).length,
  };
  const built = buildOnboardingNextStepState({ audience, organizationName: actor.organization.name, tasks, facts });
  return { state: built.state, candidates: built.candidates, scopeKey: built.scopeKey, sourceVersion: built.sourceVersion };
};

const reportFinderLoader: JevStateLoader = async (ctx, actor, subject) => {
  const question = requestText(subject, "question", actor);
  const built = buildReportFinderState({ question, entries: permittedNavigationEntries(await navigationAccess(ctx, actor)) });
  return { state: built.state, candidates: built.candidates, scopeKey: built.scopeKey, sourceVersion: built.sourceVersion };
};

// --- Connected staff follow-up assistance -------------------------------------

/** A tenant record the actor may see, by public id; foreign or branch-hidden records are simply not found. */
async function visibleRecord(ctx: ReadCtx, actor: ActorContext, entityType: string, id: string): Promise<Data> {
  const row = id
    ? await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", entityType).eq("publicId", id)).unique()
    : null;
  if (!row || (row.branchId && actor.branchScope === "selected" && !actor.branchIds.includes(row.branchId))) domainError("NOT_FOUND", "Record not found.", { correlationId: actor.correlationId });
  return record(row.data);
}

function subjectKind(subject: JevSubject): ContactSubjectKind {
  return subject.subject === "lead" ? "lead" : "member";
}

function requiredText(subject: JevSubject, key: string, minLength: number, message: string, actor: ActorContext): string {
  const value = typeof subject[key] === "string" ? subject[key].trim() : "";
  if (value.length < minLength) domainError("VALIDATION_ERROR", message, { correlationId: actor.correlationId });
  return value;
}

/** The note review needs the same permission as logging the contact itself. */
const contactOutcomeLoader: JevStateLoader = async (ctx, actor, subject) => {
  const kind = subjectKind(subject);
  const note = requiredText(subject, "note", FOLLOWUP_NOTE_MIN_LENGTH, "Write a few more words in the note first.", actor);
  if (kind === "lead") {
    requirePermission(actor, "crm.write");
    const lead = await visibleRecord(ctx, actor, "lead", String(subject.leadId ?? ""));
    return buildContactNoteState({ subject: "lead", subjectId: String(lead.id ?? ""), note, currentStage: typeof lead.stage === "string" ? lead.stage : undefined });
  }
  requirePermission(actor, "members.write");
  const member = await visibleRecord(ctx, actor, "member", String(subject.memberId ?? ""));
  return buildContactNoteState({ subject: "member", subjectId: String(member.id ?? ""), note });
};

const relatedTaskLoader: JevStateLoader = async (ctx, actor, subject) => {
  const kind = subjectKind(subject);
  const id = String((kind === "lead" ? subject.leadId : subject.memberId) ?? "");
  const person = await visibleRecord(ctx, actor, kind, id);
  const title = requiredText(subject, "title", 3, "Give the task a title first.", actor);
  const dueDate = typeof subject.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(subject.dueDate) ? subject.dueDate : "";
  if (!dueDate) domainError("VALIDATION_ERROR", "Choose a due date first.", { correlationId: actor.correlationId });
  const tasks = await followUpRelatedTasks(ctx, actor, kind === "lead" ? { leadId: id } : { memberId: id });
  const draft = { type: typeof subject.type === "string" ? subject.type : "general", title, dueDate, ownerName: typeof subject.ownerName === "string" ? subject.ownerName.slice(0, 80) : undefined };
  return buildRelatedTaskState({ subject: kind, subjectId: id, personName: String(person.fullName ?? ""), draft, tasks });
};

const renewalContextLoader: JevStateLoader = async (ctx, actor, subject) => {
  requirePermission(actor, "crm.read");
  const context = await memberFollowUpContextData(ctx, actor, String(subject.memberId ?? ""));
  return buildRenewalContextState({ context, today: tenantToday(actor) });
};

const reminderTemplateLoader: JevStateLoader = async (ctx, actor, subject) => {
  requirePermission(actor, "crm.read");
  const context = await memberFollowUpContextData(ctx, actor, String(subject.memberId ?? ""));
  const blocked = reminderTemplateUnavailableReason(context);
  if (blocked) domainError("VALIDATION_ERROR", blocked, { correlationId: actor.correlationId });
  return buildReminderTemplateState({ context, today: tenantToday(actor) });
};

/** Reads no tenant data; the action's own permission gates it so a check never reveals what someone may not do. */
const reasonCheckLoader: JevStateLoader = async (_ctx, actor, subject) => {
  const action = subject.action;
  if (!isReasonAction(action)) domainError("VALIDATION_ERROR", "Unknown action for a reason check.", { correlationId: actor.correlationId });
  requirePermission(actor, REASON_ACTIONS[action].permission as Permission);
  const reason = requiredText(subject, "reason", 1, "Type a reason first.", actor);
  return buildReasonCheckState({ action, reason });
};


// --- Member resolution workspace ---------------------------------------------

const resolutionIntentLoader: JevStateLoader = async (ctx, actor, subject) => {
  const goal = requiredText(subject, "goal", 3, "Write what you are helping with first.", actor);
  const context = await memberResolutionContextData(ctx, actor, String(subject.memberId ?? ""));
  const panels = permittedResolutionPanels(actor.permissions).filter((panel) => context.panels.includes(panel.id));
  return buildResolutionIntentState({ goal, memberId: context.memberId, facts: context.facts, panels, clarifications: permittedResolutionClarifications(panels) });
};

const planPriorityLoader: JevStateLoader = async (ctx, actor, subject) => {
  const goal = requiredText(subject, "goal", 3, "Write what matters to the member first.", actor);
  const context = await memberResolutionContextData(ctx, actor, String(subject.memberId ?? ""));
  return buildPlanPriorityState({ goal, memberId: context.memberId, current: context.membership, planCount: context.plans.length });
};

/** Only joinable classes are offered; with none there is nothing to ask, so the page keeps its deterministic "none" instead. */
const classPickLoader: JevStateLoader = async (ctx, actor, subject) => {
  const goal = requiredText(subject, "goal", 3, "Write what the member asked for first.", actor);
  const context = await memberResolutionContextData(ctx, actor, String(subject.memberId ?? ""));
  if (!context.classes.options.some((option) => option.eligible)) domainError("VALIDATION_ERROR", "No class the member can join in the next two weeks.", { correlationId: actor.correlationId });
  return buildClassPickState({ goal, memberId: context.memberId, context });
};

const trainerPickLoader: JevStateLoader = async (ctx, actor, subject) => {
  const goal = requiredText(subject, "goal", 3, "Write what the member asked for first.", actor);
  const context = await memberResolutionContextData(ctx, actor, String(subject.memberId ?? ""));
  if (!context.trainers.options.some((option) => option.published && option.nextSlotAt)) domainError("VALIDATION_ERROR", "No trainer has an open slot at the member's branch in the next two weeks.", { correlationId: actor.correlationId });
  return buildTrainerPickState({ goal, memberId: context.memberId, context });
};


// --- Public page draft review ------------------------------------------------

const profileClaimLoader: JevStateLoader = async (ctx, actor) => {
  const context = await gymProfileReviewContextData(ctx, actor);
  if (!context.passages.length) domainError("VALIDATION_ERROR", "Save a tagline or description before asking for a review.", { correlationId: actor.correlationId });
  return buildProfileClaimState({ context });
};

const languageGapLoader: JevStateLoader = async (ctx, actor) => {
  const context = await gymProfileReviewContextData(ctx, actor);
  const blocked = languageGapUnavailableReason(context);
  if (blocked) domainError("VALIDATION_ERROR", blocked, { correlationId: actor.correlationId });
  return buildLanguageGapState({ context });
};

// --- Support inbox review (platform administrators) ---------------------------

function caseIdOf(subject: JevSubject, admin: PlatformAdminContext): string {
  const caseId = typeof subject.caseId === "string" ? subject.caseId.trim() : "";
  if (!caseId) domainError("VALIDATION_ERROR", "Choose a support case first.", { correlationId: admin.correlationId });
  return caseId;
}

const supportCategoryLoader: JevPlatformStateLoader = async (ctx, admin, subject) => {
  const { context, organizationId } = await supportReviewSource(ctx, admin, caseIdOf(subject, admin));
  if (!context.passages.length) domainError("VALIDATION_ERROR", "This case has no message text to read.", { correlationId: admin.correlationId });
  return { ...buildSupportCategoryState({ context }), organizationDocId: organizationId };
};

/** Only recorded invoices are offered; a gym with none has nothing to match, so the page keeps its deterministic "no invoices" line. */
const supportInvoiceMatchLoader: JevPlatformStateLoader = async (ctx, admin, subject) => {
  const { context, organizationId } = await supportReviewSource(ctx, admin, caseIdOf(subject, admin));
  if (!context.facts.invoices.length) domainError("VALIDATION_ERROR", "No invoice is recorded for this gym.", { correlationId: admin.correlationId });
  return { ...buildSupportInvoiceMatchState({ context }), organizationDocId: organizationId };
};

const supportClarificationLoader: JevPlatformStateLoader = async (ctx, admin, subject) => {
  const { context, organizationId } = await supportReviewSource(ctx, admin, caseIdOf(subject, admin));
  if (context.status === "resolved") domainError("VALIDATION_ERROR", "This case is resolved; reopen it before asking for a clarification.", { correlationId: admin.correlationId });
  return { ...buildSupportClarificationState({ context, category: isSupportCategoryId(subject.category) ? subject.category : undefined }), organizationDocId: organizationId };
};

const supportUnansweredLoader: JevPlatformStateLoader = async (ctx, admin, subject) => {
  const { context, organizationId } = await supportReviewSource(ctx, admin, caseIdOf(subject, admin));
  if (context.status === "resolved") domainError("VALIDATION_ERROR", "This case is already resolved.", { correlationId: admin.correlationId });
  if (!supportRequestPassages(context.passages).length) domainError("VALIDATION_ERROR", "No explicit request was found in the gym's messages.", { correlationId: admin.correlationId });
  return { ...buildSupportUnansweredState({ context, summaryDraft: typeof subject.summary === "string" ? subject.summary : undefined }), organizationDocId: organizationId };
};

const supportClaimLoader: JevPlatformStateLoader = async (ctx, admin, subject) => {
  const { context, organizationId } = await supportReviewSource(ctx, admin, caseIdOf(subject, admin));
  if (context.status === "resolved") domainError("VALIDATION_ERROR", "This case is already resolved.", { correlationId: admin.correlationId });
  if (!supportClaimPassages(context.passages).length) domainError("VALIDATION_ERROR", "No passage on this case asserts an outcome to check.", { correlationId: admin.correlationId });
  return { ...buildSupportClaimState({ context }), organizationDocId: organizationId };
};

export const JEV_PLATFORM_STATE_LOADERS: Readonly<Record<string, JevPlatformStateLoader>> = {
  "support.category": supportCategoryLoader,
  "support.invoice_match": supportInvoiceMatchLoader,
  "support.clarification": supportClarificationLoader,
  "support.unanswered": supportUnansweredLoader,
  "support.claim_check": supportClaimLoader,
};

export function jevPlatformStateLoader(questionKey: string): JevPlatformStateLoader | undefined {
  return JEV_PLATFORM_STATE_LOADERS[questionKey];
}

// --- Branch operations -------------------------------------------------------

function describedText(subject: JevSubject, actor: ActorContext): string {
  const description = typeof subject.description === "string" ? subject.description.trim().slice(0, BRANCHOPS_DESCRIPTION_MAX_LENGTH) : "";
  if (description.length < BRANCHOPS_DESCRIPTION_MIN_LENGTH) domainError("VALIDATION_ERROR", "Describe what you found in a few more words first.", { correlationId: actor.correlationId });
  return description;
}

async function branchMachinesAndSpaces(ctx: ReadCtx, actor: ActorContext, branchPublicId: string) {
  await requireOperations(ctx, actor);
  const branch = await operationsBranch(ctx, actor, branchPublicId);
  const zones = (await ctx.db.query("zones").withIndex("by_branch", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id)).collect()).filter((zone) => zone.status === "active");
  const assets = await ctx.db.query("equipmentAssets").withIndex("by_branch", (q) => q.eq("organizationId", actor.organization._id).eq("branchId", branch._id)).collect();
  const zoneById = new Map(zones.map((zone) => [String(zone._id), zone.publicId] as const));
  return {
    branch,
    machines: assets.map((asset) => ({ id: asset.publicId, code: asset.code, name: asset.name, manufacturer: asset.manufacturer, model: asset.model, zoneId: asset.zoneId ? zoneById.get(String(asset.zoneId)) : undefined, status: asset.status })),
    spaces: zones.map((zone) => ({ id: zone.publicId, name: zone.name, nameAr: zone.nameAr, kind: zone.kind })),
  };
}

const reportCategoryLoader: JevStateLoader = async (ctx, actor, subject) => {
  const description = describedText(subject, actor);
  const { branch, machines, spaces } = await branchMachinesAndSpaces(ctx, actor, String(subject.branchId ?? ""));
  return buildReportCategoryState({ description, branchId: publicBranchId(branch), machineCount: machines.length, spaceCount: spaces.length });
};

/** Only this branch's registered machines and spaces are offered; with none there is nothing to point at. */
const reportTargetLoader: JevStateLoader = async (ctx, actor, subject) => {
  const description = describedText(subject, actor);
  const { branch, machines, spaces } = await branchMachinesAndSpaces(ctx, actor, String(subject.branchId ?? ""));
  if (!machines.some((machine) => machine.status !== "retired" && machine.status !== "replaced") && !spaces.length) domainError("VALIDATION_ERROR", "This branch has no registered machine or gym space to file against.", { correlationId: actor.correlationId });
  return buildReportTargetState({ description, branchId: publicBranchId(branch), machines, spaces });
};

async function visibleIssue(ctx: ReadCtx, actor: ActorContext, publicId: string): Promise<{ issue: IssueLike; assetDocId: string; assetCode: string; assetName: string; assetModel?: string }> {
  const row = publicId ? await ctx.db.query("equipmentIssues").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", publicId)).unique() : null;
  if (!row) domainError("NOT_FOUND", "Equipment issue not found.", { correlationId: actor.correlationId });
  const branch = await ctx.db.get(row.branchId);
  assertBranchAccess(actor, branch);
  const asset = await ctx.db.get(row.assetId);
  if (!asset) domainError("NOT_FOUND", "Equipment asset not found.", { correlationId: actor.correlationId });
  const iso = (value: number | undefined) => (value === undefined ? undefined : new Date(value).toISOString());
  return { issue: { id: row.publicId, branchId: publicBranchId(branch), assetId: asset.publicId, title: row.title, description: row.description, severity: row.severity, status: row.status, safetyStatus: row.safetyStatus, reportedAt: iso(row.reportedAt)!, resolvedAt: iso(row.resolvedAt) }, assetDocId: String(asset._id), assetCode: asset.code, assetName: asset.name, assetModel: asset.model };
}

/** The relationship is the record: both reports must be on the same machine before their wording is compared. */
const sameFaultLoader: JevStateLoader = async (ctx, actor, subject) => {
  await requireOperations(ctx, actor);
  const current = await visibleIssue(ctx, actor, String(subject.issueId ?? ""));
  const other = await visibleIssue(ctx, actor, String(subject.otherIssueId ?? ""));
  if (current.issue.id === other.issue.id) domainError("VALIDATION_ERROR", "Choose two different reports to compare.", { correlationId: actor.correlationId });
  if (current.assetDocId !== other.assetDocId) domainError("VALIDATION_ERROR", "Only reports on the same machine can be compared; a machine with the same name at another branch is a different machine.", { correlationId: actor.correlationId });
  return buildSameFaultState({ current: current.issue, other: other.issue, machine: { code: current.assetCode, name: current.assetName, model: current.assetModel } });
};

async function handoverItemFor(ctx: ReadCtx, actor: ActorContext, templatePublicId: string, localDate: string, itemId: string): Promise<{ item: HandoverItem; branchDocId: string }> {
  const template = templatePublicId ? await ctx.db.query("checklistTemplates").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", templatePublicId)).unique() : null;
  if (!template) domainError("NOT_FOUND", "Checklist not found.", { correlationId: actor.correlationId });
  const branch = await ctx.db.get(template.branchId);
  assertBranchAccess(actor, branch);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) domainError("VALIDATION_ERROR", "Choose a valid checklist date.", { correlationId: actor.correlationId });
  const run = await ctx.db.query("checklistRuns").withIndex("by_template_date", (q) => q.eq("organizationId", actor.organization._id).eq("templateId", template._id).eq("localDate", localDate)).unique();
  const recorded = run?.items.find((candidate) => candidate.itemId === itemId);
  const templateItem = template.items.find((candidate) => candidate.id === itemId);
  if (!recorded && !templateItem) domainError("NOT_FOUND", "Checklist item not found.", { correlationId: actor.correlationId });
  const status = recorded ? recorded.status : "pending";
  const required = recorded ? recorded.required : Boolean(templateItem?.required);
  if (!(status === "failed" || (required && status === "pending"))) domainError("VALIDATION_ERROR", "Only unresolved checklist items can be related.", { correlationId: actor.correlationId });
  return {
    branchDocId: String(branch._id),
    item: {
      key: handoverItemKey(template.publicId, localDate, itemId),
      templateId: template.publicId,
      localDate,
      itemId,
      label: recorded?.label ?? templateItem?.label ?? "",
      runName: run?.templateName ?? template.name,
      runType: template.type,
      dueTime: template.dueTime,
      required,
      status: status === "failed" ? "failed" : "pending",
      zoneId: recorded?.zoneId ?? templateItem?.zoneId,
      note: recorded?.note,
      reason: recorded?.reason,
      actorName: recorded?.actorName,
      responsible: run?.assignedUserName ?? template.assignedUserName ?? template.assignedRole,
      assignedUserId: run?.assignedUserId ?? template.assignedUserId,
      overdue: false,
      facilityTaskId: recorded?.facilityTaskId,
    },
  };
}

const handoverRelatedLoader: JevStateLoader = async (ctx, actor, subject) => {
  const first = await handoverItemFor(ctx, actor, String(subject.firstTemplateId ?? ""), String(subject.firstDate ?? ""), String(subject.firstItemId ?? ""));
  const second = await handoverItemFor(ctx, actor, String(subject.secondTemplateId ?? ""), String(subject.secondDate ?? ""), String(subject.secondItemId ?? ""));
  if (first.branchDocId !== second.branchDocId) domainError("VALIDATION_ERROR", "Only items from the same branch can be related.", { correlationId: actor.correlationId });
  if (first.item.key === second.item.key) domainError("VALIDATION_ERROR", "Choose two different items to relate.", { correlationId: actor.correlationId });
  const zones = await ctx.db.query("zones").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  return buildHandoverRelatedState({ first: first.item, second: second.item, spaces: new Map(zones.map((zone) => [zone.publicId, zone.name] as const)) });
};

/** The caller's own notifications in this organization only; the grouped view is rebuilt server-side from the same rule. */
const notificationTopicLoader: JevStateLoader = async (ctx, actor, subject) => {
  const rows = (await ctx.db.query("operationalNotifications").withIndex("by_recipient_created", (q) => q.eq("recipientUserId", actor.user._id)).collect())
    .filter((row) => (!row.expiresAt || row.expiresAt > Date.now()) && (!row.organizationId || row.organizationId === actor.organization._id));
  const toLike = (row: (typeof rows)[number]): NotificationLike => ({ id: row.publicId, kind: row.kind, title: row.title, body: row.body, href: row.href, dedupeKey: row.dedupeKey, readAt: row.readAt ? new Date(row.readAt).toISOString() : undefined, createdAt: new Date(row.createdAt).toISOString() });
  const notifications = rows.map(toLike);
  const notification = notifications.find((candidate) => candidate.id === String(subject.notificationId ?? ""));
  if (!notification) domainError("NOT_FOUND", "Notification not found.", { correlationId: actor.correlationId });
  const grouping = groupNotifications(notifications);
  if (!grouping.groups.length) domainError("VALIDATION_ERROR", "There is no group to place this notification in yet.", { correlationId: actor.correlationId });
  return buildNotificationTopicState({ notification, grouping });
};

// --- Daily operating brief -----------------------------------------------------

function briefInput(subject: JevSubject): Record<string, unknown> {
  return typeof subject.branchId === "string" && subject.branchId ? { branchId: subject.branchId } : {};
}

/** The brief is rebuilt for the caller, so the figures Jev sees are exactly the caller's own scope; counts and amounts only. */
const briefEmphasisLoader: JevStateLoader = async (ctx, actor, subject) => {
  const brief = await operatingBriefData(ctx, actor, briefInput(subject));
  return buildBriefEmphasisState({ brief, currency: actor.organization.currency });
};

/** Both items must be in the caller's own brief; an id outside their scope is not found. */
const briefRelatedLoader: JevStateLoader = async (ctx, actor, subject) => {
  const brief = await operatingBriefData(ctx, actor, briefInput(subject));
  const first = brief.queue.find((item) => item.id === String(subject.firstId ?? ""));
  const second = brief.queue.find((item) => item.id === String(subject.secondId ?? ""));
  if (!first || !second) domainError("NOT_FOUND", "Brief item not found.", { correlationId: actor.correlationId });
  if (first.id === second.id) domainError("VALIDATION_ERROR", "Choose two different items to compare.", { correlationId: actor.correlationId });
  return buildBriefRelatedState({ first, second, scope: brief.scope });
};

export const JEV_STATE_LOADERS: Readonly<Record<string, JevStateLoader>> = {
  ...Object.fromEntries(FOUNDATION_QUESTIONS.map((question) => [question.key, syntheticLoader(question)] as const)),
  "import.column_target": columnTargetLoader,
  "import.plan_match": planMatchLoader,
  "navigation.intent": navigationIntentLoader,
  "navigation.next_step": onboardingNextStepLoader,
  "navigation.report_view": reportFinderLoader,
  "followup.contact_outcome": contactOutcomeLoader,
  "followup.related_task": relatedTaskLoader,
  "followup.renewal_context": renewalContextLoader,
  "followup.reminder_template": reminderTemplateLoader,
  "followup.reason_check": reasonCheckLoader,
  "resolution.intent": resolutionIntentLoader,
  "resolution.plan_priority": planPriorityLoader,
  "resolution.class_pick": classPickLoader,
  "resolution.trainer_pick": trainerPickLoader,
  "profile.claim_check": profileClaimLoader,
  "profile.language_gap": languageGapLoader,
  "branchops.report_category": reportCategoryLoader,
  "branchops.report_target": reportTargetLoader,
  "branchops.same_fault": sameFaultLoader,
  "branchops.handover_related": handoverRelatedLoader,
  "branchops.notification_topic": notificationTopicLoader,
  "brief.emphasis": briefEmphasisLoader,
  "brief.related_matter": briefRelatedLoader,
};

export function jevStateLoader(questionKey: string): JevStateLoader | undefined {
  return JEV_STATE_LOADERS[questionKey];
}
