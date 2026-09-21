import type { JevSubject } from "./jevAnswers";
import { buildColumnTargetState, buildPlanMatchState, isImportField, normalizePlanLabel, type ImportAssistDraftData, type ImportColumnSummary, type ImportField, type PlanTerms } from "./jevImportState";
import { FOUNDATION_QUESTIONS } from "./jevQuestionsFoundation";
import { followUpRelatedTasks, memberFollowUpContextData, onboardingExperience, tenantToday, workspaceAccessData } from "./domain";
import { FOLLOWUP_NOTE_MIN_LENGTH, REASON_ACTIONS, buildContactNoteState, buildReasonCheckState, buildRelatedTaskState, buildReminderTemplateState, buildRenewalContextState, isReasonAction, reminderTemplateUnavailableReason, type ContactSubjectKind } from "./followupAssist";
import type { Permission } from "./permissions";
import { NAVIGATION_QUERY_MAX_LENGTH, buildNavigationIntentState, buildOnboardingNextStepState, buildReportFinderState, permittedClarifications, permittedNavigationEntries, type NavigationAccess, type OnboardingStepCandidate } from "./navigationCatalogue";
import type { JevCandidate, JevQuestion, JevState } from "./jevRegistry";
import { assertBranchAccess, domainError, publicOrganizationId, requirePermission, type ActorContext, type ReadCtx } from "./security";

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
  if (!row || (typeof value.expiresAt === "number" && value.expiresAt < Date.now())) {
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
};

export function jevStateLoader(questionKey: string): JevStateLoader | undefined {
  return JEV_STATE_LOADERS[questionKey];
}
