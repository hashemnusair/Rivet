/**
 * Shared contracts for RIVET assistance and delegated work.
 *
 * Imported by the Convex functions, the explicit preview adapter and the
 * pages, so this module uses relative imports only (the Convex program cannot
 * resolve the `@/` alias) and contains no runtime dependencies on either side.
 *
 * Vocabulary: a *capability* is a governed, typed tool around an existing
 * domain operation; a *playbook* is a versioned fixed workflow over permitted
 * capabilities; a *grant* is the authority a person delegated (one-off or
 * standing); a *run* is one execution of a playbook under one grant.
 */

export const AI_CONTRACT_VERSION = "2026-10-24.1";

/** Deployment-wide adapter mode from `RIVET_AI_MODE`. Anything unrecognised is `off`. */
export type AiAdapterMode = "off" | "fixture" | "live";

/** What a gym allows. `prepare` never mutates business records; `execute` permits granted writes. */
export type AiTenantMode = "off" | "prepare" | "execute";

export const AI_TENANT_MODES: readonly AiTenantMode[] = ["off", "prepare", "execute"];

export type AiCapabilityKey =
  | "member_context"
  | "note_extraction"
  | "followup_batch"
  | "report_job"
  | "handover_job"
  | "cash_difference"
  | "sales_followups"
  | "ops_triage"
  | "import_assist"
  | "class_finder"
  | "nl_filters"
  | "collections_prep"
  | "member_class_finder"
  | "platform_review";

export type AiRunStatus =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "waiting_for_input"
  | "waiting_for_event"
  | "completed"
  | "partially_completed"
  | "failed"
  | "cancelled";

export const AI_TERMINAL_RUN_STATUSES: readonly AiRunStatus[] = ["completed", "partially_completed", "failed", "cancelled"];
export const AI_ACTIVE_RUN_STATUSES: readonly AiRunStatus[] = ["queued", "running", "waiting_for_approval", "waiting_for_input", "waiting_for_event"];

export function isTerminalRunStatus(status: AiRunStatus): boolean {
  return AI_TERMINAL_RUN_STATUSES.includes(status);
}

export type AiStepStatus = "planned" | "skipped" | "committed" | "verified" | "failed" | "cancelled" | "handed_over";

/** Safe failure categories: never raw provider or exception text. */
export type AiErrorCategory =
  | "ai_off"
  | "capability_off"
  | "tenant_off"
  | "global_stop"
  | "authority_revoked"
  | "permission_denied"
  | "grant_expired"
  | "budget_exhausted"
  | "limit_reached"
  | "model_unavailable"
  | "model_timeout"
  | "model_malformed"
  | "model_refused"
  | "data_policy"
  | "source_changed"
  | "validation"
  | "deadline"
  | "internal";

export type AiSourceKind = "fixture" | "live" | "rules";

export type AiPlaybookKey =
  | "renewal_followups"
  | "management_report"
  | "shift_handover"
  | "cash_difference"
  | "sales_followups"
  | "ops_triage"
  | "class_finder";

/**
 * A message parameter. Mirrors the timeline descriptor shapes so pages format
 * dates in the gym's timezone and money with its real precision; names and
 * free text stay verbatim and are isolated for direction, never translated.
 */
export type AiMessageParam =
  | string
  | number
  | { date: string }
  | { at: string }
  | { clock: string }
  | { amountMinor: number; currency: string }
  | { enum: "contactOutcome" | "exclusion" | "timeOfDay" | "renewalInterest" | "weekday" | "paymentMethod"; value: string };

export interface AiMessage {
  key: string;
  params?: Record<string, AiMessageParam>;
}

/** A link back to the authoritative record a statement depends on. */
export interface AiSourceRef {
  kind: "timeline" | "member" | "membership" | "task" | "payment" | "charge" | "check_in" | "shift" | "checklist" | "facility_task" | "equipment_issue" | "lead" | "report" | "class" | "artifact" | "memory";
  id: string;
  /** Workspace route to the source; every link is checked against the reader's access when produced. */
  href?: string;
  label?: string;
  occurredAt?: string;
}

/** How much a reader can trust a line: a recorded fact, what a staff member wrote down, RIVET's suggestion, or an unknown. */
export type AiStatementBasis = "observed" | "staff_statement" | "suggestion" | "unknown";

export interface AiBriefLine {
  key: string;
  basis: AiStatementBasis;
  /** Stable message key and parameters, so both languages present the same fact. */
  message: AiMessage;
  sources: AiSourceRef[];
  tone?: "neutral" | "attention" | "positive";
}

export interface AiMemberBrief {
  memberId: string;
  generatedAt: string;
  /** One useful sentence first (message key + params). */
  headline: AiMessage;
  lines: AiBriefLine[];
  /** Missing or stale sources are shown plainly; empty never means "everything is fine". */
  gaps: AiMessage[];
  freshness: { oldestSourceAt?: string; newestSourceAt?: string; stale: boolean };
  activeStatements: AiMemoryView[];
  openRun?: { id: string; status: AiRunStatus };
  /** Whether a note can be read into fields right now, and why not. */
  extraction: { available: boolean; reason?: AiErrorCategory };
  source: AiSourceKind;
}

export type AiMemberBriefResult =
  | { available: true; brief: AiMemberBrief; preparedDraft?: { language: "en" | "ar"; text: string; runId: string; preparedAt: string } }
  | { available: false; reason: AiErrorCategory };

export type AiMemoryKind = "staff_statement" | "preference" | "policy";
export type AiMemoryStatus = "active" | "revoked" | "expired" | "superseded";

export interface AiMemoryView {
  id: string;
  kind: AiMemoryKind;
  topic: "travel" | "contact_time" | "language" | "no_contact" | "other";
  subjectType: "member" | "lead" | "branch" | "gym" | "user";
  subjectId: string;
  /** Plain description, stored as written by staff or generated from structured fields. */
  text: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  status: AiMemoryStatus;
  provenance: { sourceKind: "contact_note" | "staff_explicit" | "settings"; sourceId?: string; recordedById: string; recordedByName: string; recordedAt: string };
  revision: number;
}

/** A value RIVET read from a note; the person accepts each field individually. */
export interface AiExtractedField<T> {
  value: T;
  /** The words in the note this came from, verbatim. */
  evidence: string;
}

export interface AiDateResolution {
  /** YYYY-MM-DD in the gym's timezone. */
  date: string;
  /** HH:mm in the gym's timezone, when a time of day was stated or implied. */
  time?: string;
  /** The words that produced this date. */
  phrase: string;
  /** Other readings when the phrase is ambiguous; the person picks one. */
  alternatives?: Array<{ date: string; time?: string; reasonKey: string }>;
}

export interface AiNoteExtraction {
  noteHash: string;
  outcome?: AiExtractedField<"no_answer" | "answered_interested" | "answered_not_interested" | "answered_call_back" | "wrong_number" | "whatsapp_sent">;
  followUp?: AiExtractedField<AiDateResolution>;
  travelUntil?: AiExtractedField<AiDateResolution>;
  renewalInterest?: AiExtractedField<"interested" | "not_interested" | "undecided">;
  preferredContactTime?: AiExtractedField<"morning" | "afternoon" | "evening">;
  topics: Array<"callback" | "travel" | "complaint" | "price" | "schedule" | "injury" | "renewal">;
  /** Things RIVET could not settle; the person sees each one. */
  clarifications: Array<{ field: "followUp" | "travelUntil" | "outcome"; messageKey: string }>;
  /** Text in the note that tried to give RIVET instructions; ignored and shown. */
  ignoredInstructions: boolean;
  source: AiSourceKind;
  promptVersion: string;
}

export interface MemberFilterInterpretation {
  status?: "active" | "inactive";
  membership?: "active" | "expiring" | "expired" | "frozen" | "none";
  expiringWithinDays?: number;
  notVisitedForDays?: number;
  owes?: boolean;
  branchId?: string;
  search?: string;
  /** Parts of the request RIVET could not turn into a filter; shown to the person. */
  unrecognised: string[];
}

export type AiPrepareResult<T> = ({ ok: true } & T) | { ok: false; reason: AiErrorCategory };
export type AiExtractNoteResult = AiPrepareResult<{ kind: "extract_note"; extraction: AiNoteExtraction }>;
export type AiInterpretRevisionResult = AiPrepareResult<{ kind: "interpret_revision"; revision: AiRunRevision }>;
export type AiInterpretFiltersResult = AiPrepareResult<{ kind: "interpret_filters"; filters: MemberFilterInterpretation }>;

export interface AiStandingPreview {
  subjects: Array<{ id: string; name: string; decision: string; reason?: string }>;
  digest: string;
}

export interface AiRunCounts {
  considered: number;
  prepared: number;
  created: number;
  linked: number;
  skipped: number;
  failed: number;
}

export interface AiRunResultRef {
  kind: "task" | "artifact" | "export" | "facility_task" | "equipment_issue" | "class_booking" | "proposal";
  id: string;
  href?: string;
  label: string;
  /** The label as a descriptor (a task RIVET prepared), shown in the reader's language; `label` stays the stored English. */
  labelMessage?: import("../i18n/system-messages").SystemMessage;
  subjectName?: string;
}

export interface AiRunExclusion {
  subjectId: string;
  subjectName: string;
  reason: AiExclusionReason;
  sources: AiSourceRef[];
}

export type AiExclusionReason =
  | "renewed"
  | "recently_contacted"
  | "opted_out"
  | "frozen"
  | "travelling"
  | "has_open_followup"
  | "not_active"
  | "no_phone"
  | "outside_scope"
  | "revision_excluded"
  | "snoozed"
  | "already_prepared"
  | "changed_since_planning"
  | "lead_closed"
  | "lead_contacted_recently"
  | "lead_already_prepared";

export interface AiRunRevisionView {
  id: string;
  at: string;
  byName: string;
  text: string;
  /** What RIVET understood, as a visible structured change. */
  interpreted: AiRunRevision;
  appliedToRemaining: number;
}

export type AiRunRevision =
  | { kind: "time_of_day"; value: "morning" | "afternoon" | "evening" }
  | { kind: "exclude_member"; memberId: string; memberName: string }
  | { kind: "owner"; ownerId: string; ownerName: string }
  | { kind: "unsupported"; messageKey: string };

export interface AiRunStepView {
  id: string;
  seq: number;
  capability: string;
  subjectId?: string;
  subjectName?: string;
  status: AiStepStatus;
  reason?: AiExclusionReason | AiErrorCategory;
  resultRef?: AiRunResultRef;
  draft?: { language: "en" | "ar"; text: string };
  updatedAt: string;
}

export interface AiRunView {
  id: string;
  playbook: AiPlaybookKey;
  playbookVersion: string;
  status: AiRunStatus;
  /** Plain stage key for status copy ("Checking recent contacts"); never a technical state name. */
  stageKey: string;
  goal: AiMessage;
  branchId?: string;
  branchName?: string;
  requestedById: string;
  requestedByName: string;
  ownerId: string;
  ownerName: string;
  grantId: string;
  standingInstructionId?: string;
  trigger: "user" | "schedule" | "event";
  counts: AiRunCounts;
  results: AiRunResultRef[];
  exclusions: AiRunExclusion[];
  steps: AiRunStepView[];
  revisions: AiRunRevisionView[];
  errorCategory?: AiErrorCategory;
  cancelRequested: boolean;
  takenOverByName?: string;
  /** Effects already committed when the run stopped; reported, never hidden. */
  committedEffects: number;
  budget: { modelCalls: number; writes: number; maxWrites: number; costMicros: number };
  source: AiSourceKind;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** Actions the current reader may take now (already authority-checked server-side). */
  allowed: { cancel: boolean; revise: boolean; takeOver: boolean; retry: boolean };
}

export interface AiStandingInstructionView {
  id: string;
  playbook: AiPlaybookKey;
  title: string;
  ownerId: string;
  ownerName: string;
  createdById: string;
  branchId?: string;
  branchName?: string;
  schedule: AiSchedule;
  capabilities: string[];
  limits: AiRunLimits;
  params: Record<string, string | number | boolean>;
  status: "active" | "paused" | "revoked" | "expired";
  revision: number;
  lastRunAt?: string;
  nextRunAt?: string;
  lastRunId?: string;
  expiresAt?: string;
  revokedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiSchedule {
  /** 0 = Sunday … 6 = Saturday, in the gym's timezone. */
  weekdays: number[];
  /** HH:mm, gym timezone. */
  time: string;
}

export interface AiRunLimits {
  maxWrites: number;
  maxSubjects: number;
  maxModelCalls: number;
  /** Elapsed-time deadline for one run. */
  maxDurationMs: number;
}

export const DEFAULT_RUN_LIMITS: AiRunLimits = { maxWrites: 50, maxSubjects: 100, maxModelCalls: 60, maxDurationMs: 15 * 60_000 };

export interface AiProposalView {
  id: string;
  runId: string;
  capability: string;
  /** Exact changeset; what the approver sees is what executes. */
  changes: Array<{ field: string; from?: string; to: string }>;
  subjectLabel: string;
  changesetHash: string;
  requiredPermissionKey: string;
  status: "pending" | "approved" | "rejected" | "expired" | "invalidated" | "executed" | "failed";
  proposedAt: string;
  expiresAt: string;
  decidedByName?: string;
  invalidationReason?: AiErrorCategory;
  allowed: { approve: boolean; reject: boolean };
}

/** A prepared, unsaved collections call list (AI-4.9). */
export type AiCollectionsResult =
  | { available: true; items: import("./collections").CollectionItem[]; considered: number; limited: boolean }
  | { available: false; reason: AiErrorCategory };

/** Classes a member could be booked into now (AI-4.5); computed on read, nothing saved. */
export type AiClassOptionsResult =
  | { available: true; options: import("./class-finder").ClassOption[]; excluded: Partial<Record<import("./class-finder").ClassExclusion, number>>; canBook: boolean }
  | { available: false; reason: AiErrorCategory | "classes_paused" };

/** The platform-wide assistance switch, for RIVET operators only. */
export interface AiPlatformStatus {
  adapterMode: AiAdapterMode;
  stopped: boolean;
  reason?: string;
  changedAt?: string;
  changedByName?: string;
}

/**
 * Whether RIVET lets one gym use assistance at all. No gym is available until
 * a platform admin makes it available with a reason; until then the gym's own
 * switch cannot turn assistance on, and every assistance gate reads it as off.
 */
export interface AiGymAvailability {
  organizationId: string;
  name: string;
  status: string;
  available: boolean;
  reason?: string;
  changedAt?: string;
  changedByName?: string;
}

export interface AiPlatformAvailability {
  gyms: AiGymAvailability[];
}

/** What RIVET did for a gym this month and how it turned out (AI-5.3). Counts only; no content. */
export interface AiOutcomeSummary {
  month: string;
  runs: { total: number; completed: number; partly: number; failed: number; cancelled: number };
  /** Tasks RIVET saved this month and what people have done with them since. */
  tasks: { prepared: number; done: number; open: number; closedOther: number };
  proposals: { prepared: number; approved: number; rejected: number; invalidated: number; expired: number; pending: number };
  /** Short corrections people gave to running work. */
  revisions: number;
  model: { liveCalls: number; testCalls: number; failures: number; averageLatencyMs?: number; costMicros: number };
  feedback: { useful: number; notUseful: number };
}

/** For each visible member in a list, the brief fact the row does not already show (AI-2.1); members outside scope are left out. */
export type AiMemberHeadlinesResult =
  | { available: true; items: Array<{ memberId: string; fact: AiMessage }> }
  | { available: false; reason: AiErrorCategory };

export interface AiArtifactView {
  id: string;
  kind: "management_report" | "shift_handover" | "cash_difference";
  /** A message key; `titleParams` fills it. */
  title: string;
  titleParams?: Record<string, AiMessageParam>;
  branchId?: string;
  branchName?: string;
  createdAt: string;
  expiresAt: string;
  runId: string;
  sections: AiArtifactSection[];
  /** Totals RIVET recomputed from domain services before saving. */
  verification: { verified: boolean; checks: Array<{ key: string; ok: boolean; message: AiMessage }> };
  coverage: Array<{ key: string; complete: boolean; message: AiMessage }>;
}

export interface AiArtifactSection {
  key: string;
  titleKey: string;
  items: Array<{ key: string; message: AiMessage; sources: AiSourceRef[]; tone?: "neutral" | "attention" | "positive" }>;
}

export interface AiSettingsView {
  adapterMode: AiAdapterMode;
  adapterReady: boolean;
  /** Plain reason when the deployment cannot use a provider (no key, unverified protocol, stopped). */
  adapterReason?: AiErrorCategory;
  globalStop: boolean;
  /** RIVET has made assistance available for this gym; otherwise every capability is off and the settings stay hidden. */
  platformAvailable: boolean;
  tenantMode: AiTenantMode;
  externalProcessing: boolean;
  memberDataApproved: boolean;
  capabilities: Array<{ key: AiCapabilityKey; mode: AiTenantMode; effective: AiTenantMode; available: boolean }>;
  usage: { monthModelCalls: number; monthCostMicros: number; monthRuns: number; budgetMicros?: number };
  revision: number;
  updatedAt?: string;
  updatedByName?: string;
  canManage: boolean;
}

export interface UpdateAiSettingsInput {
  tenantMode?: AiTenantMode;
  externalProcessing?: boolean;
  capabilities?: Partial<Record<AiCapabilityKey, AiTenantMode>>;
  expectedRevision: number;
  reason?: string;
}

export interface StartAiRunInput {
  playbook: AiPlaybookKey;
  branchId?: string;
  params: Record<string, string | number | boolean>;
  /** Client-generated key; a repeated start returns the same run. */
  requestKey: string;
}

export interface CreateStandingInstructionInput {
  playbook: AiPlaybookKey;
  branchId?: string;
  params: Record<string, string | number | boolean>;
  schedule: AiSchedule;
  limits?: Partial<AiRunLimits>;
  requestKey: string;
}

export interface AiFeedbackInput {
  subjectKind: "brief" | "extraction" | "run" | "draft" | "artifact";
  subjectId: string;
  rating: "useful" | "not_useful";
  correctedFields?: string[];
}

/** Stable operation names on the existing domain query/mutate transport. */
export const AI_QUERY_OPERATIONS = [
  "ai.settings.get",
  "ai.member.brief",
  "ai.run.get",
  "ai.runs.list",
  "ai.standing.list",
  "ai.standing.preview",
  "ai.proposals.list",
  "ai.artifact.get",
  "ai.memories.list",
  "ai.collections.prepare",
  "ai.classes.options",
  "ai.platform.status",
  "ai.platform.availability",
  "ai.outcomes.summary",
  "ai.member.headlines",
] as const;

export const AI_MUTATION_OPERATIONS = [
  "ai.settings.update",
  "ai.run.start",
  "ai.run.cancel",
  "ai.run.revise",
  "ai.run.take_over",
  "ai.run.retry",
  "ai.standing.create",
  "ai.standing.pause",
  "ai.standing.resume",
  "ai.standing.revoke",
  "ai.standing.transfer",
  "ai.proposal.decide",
  "ai.memory.record",
  "ai.memory.revoke",
  "ai.feedback.record",
  "ai.platform.stop",
  "ai.platform.availability.set",
] as const;

export type AiQueryOperation = (typeof AI_QUERY_OPERATIONS)[number];
export type AiMutationOperation = (typeof AI_MUTATION_OPERATIONS)[number];
