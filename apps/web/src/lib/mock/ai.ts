import { ApiError, ERR } from "@/lib/api/errors";
import { hasCatalogue, loadCatalogue } from "@/lib/i18n/core";
import type { MemberFollowUpContext } from "../../../convex/followupAssist";
import {
  CAPABILITY_KEYS,
  effectiveCapabilityMode,
  parsePlaybookParams,
  PLAYBOOKS,
  playbookBlocked,
  TOOLS,
  toolBlocked,
  type AuthorityInput,
} from "@/lib/ai/capabilities";
import {
  AI_TENANT_MODES,
  isTerminalRunStatus,
  type AiCapabilityKey,
  type AiErrorCategory,
  type AiExclusionReason,
  type AiExtractNoteResult,
  type AiFeedbackInput,
  type AiInterpretFiltersResult,
  type AiCollectionsResult,
  type AiClassOptionsResult,
  type AiPlatformStatus,
  type AiInterpretRevisionResult,
  type AiMemberBriefResult,
  type AiMemoryView,
  type AiPlaybookKey,
  type AiProposalView,
  type AiRunExclusion,
  type AiRunLimits,
  type AiRunResultRef,
  type AiRunRevision,
  type AiRunStatus,
  type AiRunStepView,
  type AiRunView,
  type AiArtifactView,
  type AiSettingsView,
  type AiStandingInstructionView,
  type AiStandingPreview,
  type AiTenantMode,
  type CreateStandingInstructionInput,
  type StartAiRunInput,
  type UpdateAiSettingsInput,
} from "@/lib/ai/contracts";
import { buildMemberBrief, type MemberAttendance } from "@/lib/ai/member-brief";
import { runFixtureTask } from "@/lib/ai/model";
import { composeRenewalFacts, evaluateRenewalCandidate, renewalOperationKey, renewalTaskTitle, type RenewalMemberFacts } from "@/lib/ai/renewal-batch";
import { nextStandingSlot, previewDigest } from "@/lib/ai/schedule";
import { composeHandover, composeManagementReport, type HandoverInputs, type ReportInputs } from "@/lib/ai/jobs";
import { composeCashDifference, investigateCashDifference, shouldPrepareVarianceReview, varianceReviewProposal, type CashShiftFacts } from "@/lib/ai/cash-difference";
import { evaluateLeadCandidate, leadOperationKey, leadTaskTitle, type LeadFollowUpFacts } from "@/lib/ai/sales-batch";
import { COLLECTION_LIST_LIMIT, prepareCollectionItem, rankCollections, type CollectionItem, type CollectionMemberFacts } from "@/lib/ai/collections";
import { CLASS_FINDER_DAYS, classExclusion, classOptions, type ClassOptionFacts, type ClassTimeOfDay } from "@/lib/ai/class-finder";
import { addDays, diffDays, localDateTimeToISO, partsInTimeZone } from "@/lib/utils/dates";
import type * as T from "@/lib/domain/types";
import type { MockDb } from "./store";
import { mockUuid } from "./store";

/**
 * The explicit preview implementation of RIVET assistance. It uses the same
 * shared decision code as Convex (capability registry, authority
 * intersection, brief, renewal facts and decisions, scheduling) over the
 * preview data, and simulates durable progress with timers so pages can show
 * the same states. It is never a production fallback: production always uses
 * Convex, which owns authorization, leases and receipts.
 */

export interface MockAiHost {
  db: MockDb;
  today(): string;
  timezone(): string;
  actor(): { id: string; name: string };
  role(): string;
  permissions(): string[];
  branchVisible(branchId: string | undefined): boolean;
  activeBranchId(): string | undefined;
  entitledModules(): string[];
  memberFollowUpContext(memberId: string): MemberFollowUpContext;
  renewalQueue(query: { branchId?: string; bucket: "expiring" | "expired"; days?: number }): T.RenewalQueueItem[];
  snoozedUntil(memberId: string): string | undefined;
  classSessions(): Array<{ branchId: string; startMinute?: number; status?: string }>;
  createTask(input: Omit<T.Task, "id" | "organizationId" | "ownerName" | "subjectName" | "createdById" | "createdAt" | "status"> & { origin: NonNullable<T.Task["origin"]>; aiContext?: T.Task["aiContext"] }): T.Task;
  audit(input: { action: string; entityId: string; entityLabel: string; summary: string }): void;
  /** Simulated time between steps; zero in tests that remove preview latency. */
  stepDelayMs?(): number;
  /** Existing preview reads for reports; a missing piece means the actor cannot read it. */
  reportInputs(range: { from: string; to: string; branchId?: string }): Promise<ReportInputs>;
  handoverInputs(branchId: string, date: string): Promise<HandoverInputs>;
  requestExport(input: { kind: "payments"; filters: Record<string, string>; idempotencyKey: string }): Promise<{ id: string }>;
  /** The recorded drawer story for one shift, read as the server reads it; throws without access. */
  cashShiftFacts(shiftId: string): CashShiftFacts;
  /** The existing cash-difference review, as the signed-in person. */
  reviewVariance(shiftId: string, input: { decision: "approved"; note: string }): void;
  /** Open leads due by the end of today, as the server's lead list filters them. */
  dueLeads(branchId: string | undefined, endOfTodayIso: string): Array<{ id: string; name: string }>;
  /** Recorded facts for one lead; null when it is outside the person's access. */
  leadFollowUpFacts(leadId: string): LeadFollowUpFacts | null;
  /** Members owing collectible money with their last receipt and contact; throws without access. */
  collectionFacts(branchId: string | undefined, limit: number): { facts: CollectionMemberFacts[]; considered: number };
  /** Upcoming classes with the member's eligibility and booking state; throws without access. */
  classOptionFacts(memberId: string, from: string, to: string): { enabled: boolean; facts: ClassOptionFacts[] };
  /** The existing staff roster add; returns the member's booking status afterwards. */
  bookClass(occurrenceKey: string, memberId: string): string | undefined;
}

interface MockProposal {
  id: string;
  runId: string;
  tool: string;
  subjectLabel: string;
  changes: AiProposalView["changes"];
  payload: { shiftId: string; decision: "approved"; note: string; varianceMinor: number };
  changesetHash: string;
  requiredPermission: string;
  status: AiProposalView["status"];
  proposedAt: number;
  expiresAt: number;
  decidedByName?: string;
  invalidationReason?: AiErrorCategory;
}

interface MockGrant {
  id: string;
  kind: "one_off" | "standing";
  playbook: AiPlaybookKey;
  ownerId: string;
  ownerName: string;
  createdById: string;
  branchId?: string;
  tools: string[];
  params: Record<string, string | number | boolean>;
  schedule?: { weekdays: number[]; time: string };
  status: "active" | "paused" | "revoked" | "expired";
  revision: number;
  limits: AiRunLimits;
  nextRunAt?: number;
  lastRunAt?: number;
  lastRunId?: string;
  revokedReason?: string;
  requestKey?: string;
  createdAt: number;
  updatedAt: number;
}

interface MockRun {
  id: string;
  grantId: string;
  playbook: AiPlaybookKey;
  branchId?: string;
  requestedById: string;
  requestedByName: string;
  ownerId: string;
  ownerName: string;
  trigger: "user" | "schedule" | "event";
  requestKey: string;
  params: Record<string, string | number | boolean>;
  status: AiRunStatus;
  stage: string;
  planned: Array<{ id: string; name: string; ref?: string }>;
  cursor: number;
  counts: AiRunView["counts"];
  results: AiRunResultRef[];
  exclusions: AiRunExclusion[];
  steps: AiRunStepView[];
  revisions: AiRunView["revisions"];
  errorCategory?: AiErrorCategory;
  cancelRequested: boolean;
  takenOverByName?: string;
  writes: number;
  maxWrites: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

const DEFAULT_STEP_DELAY_MS = 220;
const PREVIEW_SETTINGS_KEY = "rivet.preview.assistance";

export class MockAiEngine {
  private tenantMode: AiTenantMode = "off";
  private platformStop?: { stopped: boolean; reason: string; changedAt: string; changedByName: string };
  private externalProcessing = false;
  private capabilityModes: Partial<Record<AiCapabilityKey, AiTenantMode>> = {};
  private revision = 0;
  private updatedAt?: number;
  private updatedByName?: string;
  private readonly grants = new Map<string, MockGrant>();
  private readonly runs = new Map<string, MockRun>();
  private readonly runSubscribers = new Map<string, Set<{ onValue: (run: AiRunView) => void; onError?: (error: unknown) => void }>>();
  private readonly memories: Array<AiMemoryView & { createdAt: number }> = [];
  private readonly artifacts = new Map<string, AiArtifactView & { requiredPermissions: string[] }>();
  private readonly proposals = new Map<string, MockProposal>();
  private readonly operationKeys = new Map<string, string>();
  private readonly feedback: AiFeedbackInput[] = [];
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private arabicLoadAttempted = false;
  /** Test seam: the last error a simulated step raised. */
  lastStepError: unknown;

  constructor(private readonly host: MockAiHost) {
    this.restorePreviewSettings();
  }

  /**
   * Preview convenience only: the gym-level switch survives a page load in
   * the same browser tab, as a real setting would. Runs and records stay in
   * memory, like the rest of the preview data.
   */
  private restorePreviewSettings(): void {
    try {
      const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(PREVIEW_SETTINGS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { tenantMode?: AiTenantMode; externalProcessing?: boolean; capabilityModes?: MockAiEngine["capabilityModes"]; revision?: number };
      if (saved.tenantMode && AI_TENANT_MODES.includes(saved.tenantMode)) this.tenantMode = saved.tenantMode;
      this.externalProcessing = saved.externalProcessing === true;
      this.capabilityModes = saved.capabilityModes ?? {};
      this.revision = Number(saved.revision) || 0;
    } catch {
      // Storage can be unavailable; the preview then starts with assistance off.
    }
  }

  private savePreviewSettings(): void {
    try {
      if (typeof window !== "undefined") window.sessionStorage.setItem(PREVIEW_SETTINGS_KEY, JSON.stringify({ tenantMode: this.tenantMode, externalProcessing: this.externalProcessing, capabilityModes: this.capabilityModes, revision: this.revision }));
    } catch {
      // Not persisted; the in-memory value still applies.
    }
  }

  private get stepDelayMs(): number {
    return this.host.stepDelayMs?.() ?? DEFAULT_STEP_DELAY_MS;
  }

  // ---------------------------------------------------------------------------
  // Policy
  // ---------------------------------------------------------------------------

  private authority(capability: AiCapabilityKey): Omit<AuthorityInput, "grantTools" | "grantActive"> {
    return {
      adapterMode: "fixture",
      globalStop: this.platformStop?.stopped ?? false,
      tenantMode: this.tenantMode,
      capabilityMode: effectiveCapabilityMode(this.tenantMode, this.capabilityModes[capability], capability),
      actorPermissions: this.host.permissions(),
      entitledModules: this.host.entitledModules(),
    };
  }

  private requireHumanPermission(permission: string): void {
    if (!this.host.permissions().includes(permission)) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this action. Ask your gym owner.", { message: { key: "apiErrors.forbidden" } });
  }

  settings(): AiSettingsView {
    return {
      adapterMode: "fixture",
      adapterReady: true,
      globalStop: this.platformStop?.stopped ?? false,
      tenantMode: this.tenantMode,
      externalProcessing: this.externalProcessing,
      memberDataApproved: false,
      capabilities: CAPABILITY_KEYS.map((key) => {
        const own = this.capabilityModes[key];
        const effective = effectiveCapabilityMode(this.tenantMode, own, key);
        return { key, mode: own ?? effectiveCapabilityMode("execute", undefined, key), effective, available: effective !== "off" && !this.platformStop?.stopped };
      }),
      usage: { monthModelCalls: 0, monthCostMicros: 0, monthRuns: this.runs.size },
      revision: this.revision,
      ...(this.updatedAt ? { updatedAt: new Date(this.updatedAt).toISOString(), updatedByName: this.updatedByName } : {}),
      canManage: this.host.permissions().includes("settings.manage"),
    };
  }

  updateSettings(input: UpdateAiSettingsInput): AiSettingsView {
    this.requireHumanPermission("settings.manage");
    if (input.expectedRevision !== this.revision) throw ApiError.of(ERR.CONFLICT, "This record changed. Refresh and try again.");
    if (input.tenantMode !== undefined) {
      if (!AI_TENANT_MODES.includes(input.tenantMode)) throw ApiError.of(ERR.VALIDATION, "Choose off, prepare or execute.");
      this.tenantMode = input.tenantMode;
    }
    if (typeof input.externalProcessing === "boolean") this.externalProcessing = input.externalProcessing;
    for (const [key, mode] of Object.entries(input.capabilities ?? {})) {
      if (!CAPABILITY_KEYS.includes(key as AiCapabilityKey) || !mode || !AI_TENANT_MODES.includes(mode)) throw ApiError.of(ERR.VALIDATION, "Check the details and try again.");
      this.capabilityModes[key as AiCapabilityKey] = mode;
    }
    this.revision += 1;
    this.updatedAt = Date.now();
    this.updatedByName = this.host.actor().name;
    this.savePreviewSettings();
    this.host.audit({ action: "ai.settings.update", entityId: this.host.db.organization.id, entityLabel: this.host.db.organization.name, summary: `RIVET assistance set to ${this.tenantMode}` });
    if (this.tenantMode === "off") for (const run of this.runs.values()) if (!isTerminalRunStatus(run.status)) run.cancelRequested = true;
    return this.settings();
  }

  // ---------------------------------------------------------------------------
  // Member context and note reading
  // ---------------------------------------------------------------------------

  private attendance(memberId: string, homeBranchId: string): { attendance: MemberAttendance; localHours: number[] } {
    const timezone = this.host.timezone();
    const today = this.host.today();
    const visits = this.host.db.checkIns.filter((visit) => visit.memberId === memberId && visit.decision !== "blocked").sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    const localDate = (instant: string) => partsInTimeZone(new Date(instant), timezone).date;
    const captured = visits.length > 0 || this.host.db.checkIns.some((visit) => visit.branchId === homeBranchId);
    const last = visits[0];
    return {
      attendance: {
        captured,
        ...(last ? { lastVisitAt: last.occurredAt, lastVisitId: last.id } : {}),
        visitsLast28Days: visits.filter((visit) => localDate(visit.occurredAt) > addDays(today, -28)).length,
        visitsPrior56Days: visits.filter((visit) => localDate(visit.occurredAt) > addDays(today, -84) && localDate(visit.occurredAt) <= addDays(today, -28)).length,
      },
      localHours: visits.filter((visit) => localDate(visit.occurredAt) > addDays(today, -60)).map((visit) => partsInTimeZone(new Date(visit.occurredAt), timezone).hour),
    };
  }

  private eveningClasses(branchId: string): number {
    return this.host.classSessions().filter((session) => session.branchId === branchId && session.status !== "cancelled" && (session.startMinute ?? 0) >= 17 * 60).length;
  }

  private activeMemoriesFor(memberId: string): AiMemoryView[] {
    const today = this.host.today();
    return this.memories.filter((memory) => memory.subjectId === memberId && memory.status === "active" && (!memory.effectiveUntil || memory.effectiveUntil >= today)).map(({ createdAt: _createdAt, ...memory }) => memory);
  }

  memberBrief(memberId: string): AiMemberBriefResult {
    this.requireHumanPermission("members.read");
    const context = this.host.memberFollowUpContext(memberId);
    const blocked = toolBlocked(TOOLS["member.context"]!, this.authority("member_context"));
    if (blocked) return { available: false, reason: blocked };
    const member = this.host.db.members.find((item) => item.id === memberId)!;
    const today = this.host.today();
    const terms = this.host.db.memberships.filter((term) => term.memberId === memberId);
    const freeze = terms.map((term) => term.activeFreeze).find((item) => item && item.status === "active" && item.startDate <= today && (!item.endDate || item.endDate >= today));
    const extractionBlocked = toolBlocked(TOOLS["note.extract"]!, this.authority("note_extraction"));
    const draftStep = [...this.runs.values()].flatMap((run) => run.steps.map((step) => ({ step, run }))).filter(({ step }) => step.subjectId === memberId && step.draft).sort((left, right) => right.step.updatedAt.localeCompare(left.step.updatedAt))[0];
    const branch = this.host.db.branches.find((item) => item.id === member.homeBranchId);
    const brief = buildMemberBrief({
      context,
      attendance: this.attendance(memberId, member.homeBranchId).attendance,
      memories: this.activeMemoriesFor(memberId),
      ...(freeze ? { activeFreeze: { startDate: freeze.startDate, ...(freeze.endDate ? { endDate: freeze.endDate } : {}) } } : {}),
      classOptions: { branchName: branch?.name, eveningNext7Days: this.eveningClasses(member.homeBranchId), morningNext7Days: 0 },
      today,
      now: new Date().toISOString(),
      extraction: extractionBlocked ? { available: false, reason: extractionBlocked } : { available: true },
      // Built from records, exactly as on the server; no model reads anything here.
      source: "rules",
    });
    return { available: true, brief, ...(draftStep?.step.draft ? { preparedDraft: { ...draftStep.step.draft, runId: draftStep.run.id, preparedAt: draftStep.step.updatedAt } } : {}) };
  }

  extractNote(input: { memberId?: string; leadId?: string; note: string; noteAt?: string }): AiExtractNoteResult {
    const subject = input.leadId ? "lead" : "member";
    this.requireHumanPermission(subject === "lead" ? "crm.write" : "members.write");
    if (subject === "member") this.host.memberFollowUpContext(input.memberId ?? "");
    if (input.note.trim().length < 3) throw ApiError.of(ERR.VALIDATION, "Write a short note first.");
    const blocked = toolBlocked(TOOLS["note.extract"]!, this.authority("note_extraction"));
    if (blocked) return { ok: false, reason: blocked };
    const result = runFixtureTask({ kind: "extract_contact_note", note: input.note.slice(0, 2_000), noteAt: input.noteAt ?? new Date().toISOString(), timezone: this.host.timezone(), subject });
    return result.output.kind === "extract_contact_note" ? { ok: true, kind: "extract_note", extraction: result.output.extraction } : { ok: false, reason: "model_malformed" };
  }

  interpretRevision(input: { runId: string; text: string }): AiInterpretRevisionResult {
    const run = this.readableRun(input.runId);
    if (!this.canControl(run)) throw ApiError.of(ERR.NOT_FOUND, "Record not found.");
    const staff = this.host.db.users.filter((user) => user.status === "active").map((user) => ({ id: user.id, name: user.name, kind: "staff" as const }));
    const result = runFixtureTask({ kind: "interpret_revision", text: input.text.slice(0, 300), candidates: [...run.planned.slice(run.cursor).map((subject) => ({ id: subject.id, name: subject.name, kind: "member" as const })), ...staff], today: this.host.today() });
    return result.output.kind === "interpret_revision" ? { ok: true, kind: "interpret_revision", revision: result.output.revision } : { ok: false, reason: "model_malformed" };
  }

  classOptions(memberId: string, timeOfDay: ClassTimeOfDay | undefined): AiClassOptionsResult {
    this.requireHumanPermission("members.read");
    const authority = this.authority("class_finder");
    const blocked = toolBlocked(TOOLS["classes.eligible"]!, authority);
    if (blocked) return { available: false, reason: blocked };
    const today = this.host.today();
    const { enabled, facts } = this.host.classOptionFacts(memberId, today, addDays(today, CLASS_FINDER_DAYS - 1));
    if (!enabled) return { available: false, reason: "classes_paused" };
    const { options, excluded } = classOptions(facts, { now: new Date().toISOString(), ...(timeOfDay ? { timeOfDay } : {}) });
    const permissions = this.host.permissions();
    const canBook = !playbookBlocked(PLAYBOOKS.class_finder, authority) && (permissions.includes("members.write") || permissions.includes("pt.book_for_member"));
    return { available: true, options, excluded, canBook };
  }

  /** Member-facing capability switch, as the member portal sees it. */
  memberCapabilityOn(capability: AiCapabilityKey): boolean {
    if (this.platformStop?.stopped) return false;
    return effectiveCapabilityMode(this.tenantMode, this.capabilityModes[capability], capability) !== "off";
  }

  platformStatus(): AiPlatformStatus {
    return { adapterMode: "fixture", stopped: this.platformStop?.stopped ?? false, ...(this.platformStop ? { reason: this.platformStop.reason, changedAt: this.platformStop.changedAt, changedByName: this.platformStop.changedByName } : {}) };
  }

  setPlatformStop(input: { stopped: boolean; reason: string }, byName: string): { stopped: boolean; reason: string } {
    const reason = input.reason.trim();
    if (!reason) throw ApiError.of(ERR.VALIDATION, "A reason is required for this action.", { fieldErrors: { reason: ["Required"] } });
    this.platformStop = { stopped: input.stopped, reason, changedAt: new Date().toISOString(), changedByName: byName };
    return { stopped: input.stopped, reason };
  }

  prepareCollections(branchId: string | undefined): AiCollectionsResult {
    this.requireHumanPermission("members.read");
    const blocked = toolBlocked(TOOLS["collections.prepare"]!, this.authority("collections_prep"));
    if (blocked) return { available: false, reason: blocked };
    const { facts, considered } = this.host.collectionFacts(branchId, COLLECTION_LIST_LIMIT);
    const context = { today: this.host.today(), now: new Date().toISOString(), gymName: this.host.db.organization.name, currency: this.host.db.organization.currency };
    const items = rankCollections(facts.map((item) => prepareCollectionItem(item, context)).filter((item): item is CollectionItem => Boolean(item)));
    return { available: true, items, considered, limited: considered > COLLECTION_LIST_LIMIT };
  }

  interpretFilters(input: { surface: "members" | "leads"; text: string }): AiInterpretFiltersResult {
    this.requireHumanPermission(input.surface === "leads" ? "crm.read" : "members.read");
    const blocked = toolBlocked(TOOLS["filters.interpret"]!, this.authority("nl_filters"));
    if (blocked) return { ok: false, reason: blocked };
    const branches = this.host.db.branches.filter((branch) => this.host.branchVisible(branch.id)).map((branch) => ({ id: branch.id, name: branch.name }));
    const result = runFixtureTask({ kind: "interpret_filters", surface: input.surface, text: input.text.slice(0, 300), branches });
    return result.output.kind === "interpret_filters" ? { ok: true, kind: "interpret_filters", filters: result.output.filters } : { ok: false, reason: "model_malformed" };
  }

  // ---------------------------------------------------------------------------
  // Runs
  // ---------------------------------------------------------------------------

  private canRead(run: MockRun): boolean {
    const actor = this.host.actor();
    if (run.requestedById === actor.id || run.ownerId === actor.id) return true;
    if (this.host.role() === "owner" || this.host.role() === "manager") return true;
    const permission = PLAYBOOKS[run.playbook].startPermissions[0];
    return Boolean(permission && this.host.permissions().includes(permission) && this.host.branchVisible(run.branchId));
  }

  private canControl(run: MockRun): boolean {
    const actor = this.host.actor();
    return run.requestedById === actor.id || run.ownerId === actor.id || this.host.role() === "owner" || this.host.role() === "manager";
  }

  private readableRun(runId: string): MockRun {
    const run = this.runs.get(runId);
    if (!run || !this.canRead(run)) throw ApiError.of(ERR.NOT_FOUND, "Record not found.");
    return run;
  }

  runView(run: MockRun): AiRunView {
    const terminal = isTerminalRunStatus(run.status);
    const control = this.canControl(run);
    const branch = run.branchId ? this.host.db.branches.find((item) => item.id === run.branchId) : undefined;
    const grant = this.grants.get(run.grantId);
    return {
      id: run.id,
      playbook: run.playbook,
      playbookVersion: PLAYBOOKS[run.playbook].version,
      status: run.status,
      stageKey: run.stage,
      goal: { key: PLAYBOOKS[run.playbook].goalKey, params: { branch: branch?.name ?? "" } },
      ...(run.branchId ? { branchId: run.branchId, branchName: branch?.name ?? "" } : {}),
      requestedById: run.requestedById,
      requestedByName: run.requestedByName,
      ownerId: run.ownerId,
      ownerName: run.ownerName,
      grantId: run.grantId,
      ...(grant?.kind === "standing" ? { standingInstructionId: grant.id } : {}),
      trigger: run.trigger,
      counts: { ...run.counts },
      results: [...run.results],
      exclusions: [...run.exclusions],
      steps: run.steps.map((step) => ({ ...step })),
      revisions: [...run.revisions],
      ...(run.errorCategory ? { errorCategory: run.errorCategory } : {}),
      cancelRequested: run.cancelRequested,
      ...(run.takenOverByName ? { takenOverByName: run.takenOverByName } : {}),
      committedEffects: run.counts.created,
      budget: { modelCalls: 0, writes: run.writes, maxWrites: run.maxWrites, costMicros: 0 },
      source: "fixture",
      createdAt: new Date(run.createdAt).toISOString(),
      updatedAt: new Date(run.updatedAt).toISOString(),
      ...(run.completedAt ? { completedAt: new Date(run.completedAt).toISOString() } : {}),
      allowed: {
        cancel: control && !terminal,
        revise: control && !terminal && run.playbook === "renewal_followups",
        takeOver: control && !terminal && run.planned.length > run.cursor,
        retry: control && (run.status === "failed" || run.status === "partially_completed") && run.errorCategory !== "authority_revoked" && !run.takenOverByName,
      },
    };
  }

  private notify(run: MockRun): void {
    const view = this.runView(run);
    for (const subscriber of this.runSubscribers.get(run.id) ?? []) subscriber.onValue(view);
  }

  private schedule(run: MockRun): void {
    if (this.timers.has(run.id)) return;
    // Drafts follow the member's language. The browser loads the Arabic
    // catalogue on demand (the server bundles it), so wait for it first.
    if (!hasCatalogue("ar") && !this.arabicLoadAttempted) {
      this.arabicLoadAttempted = true;
      this.timers.set(run.id, setTimeout(() => undefined, 0));
      void loadCatalogue("ar").catch(() => undefined).finally(() => {
        this.timers.delete(run.id);
        this.schedule(run);
      });
      return;
    }
    this.timers.set(run.id, setTimeout(() => {
      this.timers.delete(run.id);
      void this.step(run).finally(() => {
        this.notify(run);
        if (!isTerminalRunStatus(run.status)) this.schedule(run);
      });
    }, this.stepDelayMs));
  }

  private async step(run: MockRun): Promise<void> {
      try {
        if (run.playbook === "management_report" || run.playbook === "shift_handover" || run.playbook === "cash_difference" || run.playbook === "class_finder") await this.advanceJob(run);
        else this.advance(run);
      } catch (error) {
        // As on the server: the step's write did not happen; record it as failed and move on.
        const subject = run.planned[run.cursor];
        const code = error instanceof ApiError ? error.code : "";
        run.steps.push({ id: mockUuid(), seq: run.cursor + 1, capability: "step", ...(subject ? { subjectId: subject.id, subjectName: subject.name } : {}), status: "failed", reason: code === ERR.FORBIDDEN ? "permission_denied" : code === ERR.VALIDATION || code === ERR.CONFLICT ? "validation" : code === ERR.NOT_FOUND ? "source_changed" : "internal", updatedAt: new Date().toISOString() });
        run.counts.failed += 1;
        run.cursor += 1;
        run.updatedAt = Date.now();
        if (!subject) this.finish(run, run.counts.created > 0 || run.results.length > 0 ? "partially_completed" : "failed", "internal");
        this.lastStepError = error;
      }
  }

  /** Report and handover jobs: the same composition as the server, over preview reads. */
  private async advanceJob(run: MockRun): Promise<void> {
    if (isTerminalRunStatus(run.status)) return;
    run.status = "running";
    if (run.cancelRequested) return this.finish(run, "cancelled");
    const grant = this.grants.get(run.grantId);
    const definition = PLAYBOOKS[run.playbook];
    if (!grant || grant.status !== "active") return this.finish(run, run.results.length ? "partially_completed" : "failed", "authority_revoked");
    const blocked = playbookBlocked(definition, this.authority(definition.capability));
    if (blocked) return this.finish(run, run.results.length ? "partially_completed" : "failed", blocked === "permission_denied" ? "authority_revoked" : blocked);
    const stamp = () => new Date().toISOString();
    if (run.playbook === "cash_difference") return this.advanceCashDifference(run);
    if (run.playbook === "class_finder") return this.advanceClassBooking(run);
    if (run.playbook === "management_report") {
      const params = run.params as { from: string; to: string; includeExport?: boolean };
      if (run.stage === "aiWork.stage.queued" || run.stage === "aiWork.stage.starting") {
        const composed = composeManagementReport(await this.host.reportInputs({ from: params.from, to: params.to, ...(run.branchId ? { branchId: run.branchId } : {}) }), params, this.host.db.organization.currency);
        const artifact = this.saveArtifact(run, "management_report", "aiWork.report.title", composed, ["reports.financial.read"]);
        const ref: AiRunResultRef = { kind: "artifact", id: artifact.id, label: artifact.title, href: `/reports?run=${run.id}` };
        run.steps.push({ id: mockUuid(), seq: 1, capability: "artifact.save_report", status: "verified", resultRef: ref, updatedAt: stamp() });
        run.results.push(ref);
        run.writes += 1;
        run.stage = params.includeExport ? "aiWork.stage.savingReport" : "aiWork.stage.done";
        if (!params.includeExport) this.finish(run, composed.verification.verified ? "completed" : "partially_completed", composed.verification.verified ? undefined : "source_changed");
        return;
      }
      const job = await this.host.requestExport({ kind: "payments", filters: { from: params.from, to: params.to, ...(run.branchId ? { branchId: run.branchId } : {}) }, idempotencyKey: `ai-export-${run.id}` });
      const ref: AiRunResultRef = { kind: "export", id: job.id, label: "aiWork.report.export", href: "/exports" };
      run.steps.push({ id: mockUuid(), seq: 2, capability: "export.request", status: "verified", resultRef: ref, updatedAt: stamp() });
      run.results.push(ref);
      run.writes += 1;
      const verified = [...this.artifacts.values()].find((item) => item.runId === run.id)?.verification.verified ?? false;
      return this.finish(run, verified ? "completed" : "partially_completed", verified ? undefined : "source_changed");
    }
    const params = run.params as { date?: string; assigneeId?: string };
    const branchId = run.branchId;
    if (!branchId) return this.finish(run, "failed", "validation");
    const date = params.date ?? this.host.today();
    if (run.stage === "aiWork.stage.queued" || run.stage === "aiWork.stage.starting") {
      const composed = composeHandover(await this.host.handoverInputs(branchId, date), { date, branchId });
      const artifact = this.saveArtifact(run, "shift_handover", "aiWork.handover.title", composed, ["members.read"]);
      const ref: AiRunResultRef = { kind: "artifact", id: artifact.id, label: artifact.title, href: `/checklists?run=${run.id}` };
      run.steps.push({ id: mockUuid(), seq: 1, capability: "artifact.save_handover", status: "verified", resultRef: ref, updatedAt: stamp() });
      run.results.push(ref);
      run.writes += 1;
      run.stage = params.assigneeId ? "aiWork.stage.assigning" : "aiWork.stage.done";
      if (!params.assigneeId) this.finish(run, "completed");
      return;
    }
    const key = `handover:${branchId}:${date}:${params.assigneeId}`;
    const priorId = this.operationKeys.get(key);
    const prior = priorId ? this.host.db.tasks.find((task) => task.id === priorId && task.status === "open") : undefined;
    if (prior) {
      run.results.push({ kind: "task", id: prior.id, label: prior.title, href: "/crm/queues" });
      run.counts.linked += 1;
    } else {
      const task = this.host.createTask({ type: "general", title: `Read the handover for ${date}`, ownerId: params.assigneeId!, dueAt: new Date(Date.now() + 2 * 3_600_000).toISOString(), priority: "normal", origin: { kind: "ai_run", runId: run.id, grantId: run.grantId }, aiContext: { purpose: "handover" } });
      this.operationKeys.set(key, task.id);
      run.results.push({ kind: "task", id: task.id, label: task.title, href: "/crm/queues" });
      run.counts.created += 1;
      run.writes += 1;
    }
    this.finish(run, "completed");
  }

  /** Class booking: the spot is rechecked right before the existing roster add, as on the server. */
  private advanceClassBooking(run: MockRun): void {
    const params = run.params as { memberId: string; book?: boolean; occurrenceKey?: string };
    if (!params.book || !params.occurrenceKey) return this.finish(run, "failed", "validation");
    const permissions = this.host.permissions();
    if (!permissions.includes("members.write") && !permissions.includes("pt.book_for_member")) return this.finish(run, "failed", "permission_denied");
    const today = this.host.today();
    const { enabled, facts } = this.host.classOptionFacts(params.memberId, today, addDays(today, CLASS_FINDER_DAYS - 1));
    const target = facts.find((item) => item.occurrenceId === params.occurrenceKey);
    if (!enabled || !target || classExclusion(target, new Date().toISOString())) return this.finish(run, "failed", "source_changed");
    const status = this.host.bookClass(params.occurrenceKey, params.memberId);
    if (status !== "booked") return this.finish(run, "failed", "source_changed");
    const ref: AiRunResultRef = { kind: "class_booking", id: params.occurrenceKey, label: target.name, href: `/classes?date=${target.date}`, subjectName: target.branchName };
    run.steps.push({ id: mockUuid(), seq: 1, capability: "class.book", subjectId: params.memberId, status: "verified", resultRef: ref, updatedAt: new Date().toISOString() });
    run.results.push(ref);
    run.counts.created += 1;
    run.writes += 1;
    this.finish(run, "completed");
  }

  /** Cash-difference investigation: the same matching and binding as the server, over preview records. */
  private advanceCashDifference(run: MockRun): void {
    const params = run.params as { shiftId: string };
    let facts: CashShiftFacts;
    try {
      facts = this.host.cashShiftFacts(params.shiftId);
    } catch {
      return this.finish(run, "failed", "permission_denied");
    }
    if (facts.status !== "closed" || !facts.varianceMinor) return this.finish(run, "failed", "validation");
    const investigation = investigateCashDifference(facts);
    const composed = composeCashDifference(facts, investigation);
    const artifact = this.saveArtifact(run, "cash_difference", "aiWork.cash.title", composed, ["reconciliation.read"]);
    const stamp = new Date().toISOString();
    const ref: AiRunResultRef = { kind: "artifact", id: artifact.id, label: artifact.title, href: `/payments/shifts?run=${run.id}` };
    run.steps.push({ id: mockUuid(), seq: 1, capability: "artifact.save_cash_difference", status: "verified", resultRef: ref, updatedAt: stamp });
    run.results.push(ref);
    run.writes += 1;
    if (shouldPrepareVarianceReview(facts, investigation)) {
      const prepared = varianceReviewProposal(facts, investigation);
      const existing = [...this.proposals.values()].find((item) => item.runId === run.id);
      const proposal: MockProposal = existing ?? { id: `proposal-${mockUuid()}`, runId: run.id, tool: "shift.propose_variance_review", subjectLabel: facts.shiftId, changes: prepared.changes, payload: prepared.payload, changesetHash: prepared.changesetHash, requiredPermission: "reconciliation.approve_variance", status: "pending", proposedAt: Date.now(), expiresAt: Date.now() + 24 * 3_600_000 };
      if (!existing) {
        this.proposals.set(proposal.id, proposal);
        run.writes += 1;
      }
      const proposalRef: AiRunResultRef = { kind: "proposal", id: proposal.id, label: "aiWork.proposal.varianceReview", href: `/payments/shifts?run=${run.id}` };
      run.steps.push({ id: mockUuid(), seq: 2, capability: "shift.propose_variance_review", status: "verified", resultRef: proposalRef, updatedAt: stamp });
      run.results.push(proposalRef);
    }
    this.finish(run, composed.verification.verified ? "completed" : "partially_completed", composed.verification.verified ? undefined : "source_changed");
  }

  private proposalView(proposal: MockProposal): AiProposalView {
    const expired = proposal.status === "pending" && proposal.expiresAt <= Date.now();
    const pending = proposal.status === "pending" && !expired;
    const mayDecide = pending && this.host.permissions().includes(proposal.requiredPermission);
    return {
      id: proposal.id,
      runId: proposal.runId,
      capability: proposal.tool,
      changes: proposal.changes.map((change) => ({ ...change })),
      subjectLabel: proposal.subjectLabel,
      changesetHash: proposal.changesetHash,
      requiredPermissionKey: proposal.requiredPermission,
      status: expired ? "expired" : proposal.status,
      proposedAt: new Date(proposal.proposedAt).toISOString(),
      expiresAt: new Date(proposal.expiresAt).toISOString(),
      ...(proposal.decidedByName ? { decidedByName: proposal.decidedByName } : {}),
      ...(proposal.invalidationReason ? { invalidationReason: proposal.invalidationReason } : {}),
      allowed: { approve: mayDecide, reject: mayDecide },
    };
  }

  listProposals(query: { runId?: string }): AiProposalView[] {
    const rows = [...this.proposals.values()].filter((proposal) => (query.runId ? proposal.runId === query.runId : proposal.status === "pending"));
    return rows.filter((proposal) => {
      const run = this.runs.get(proposal.runId);
      return Boolean(run && this.canRead(run));
    }).map((proposal) => this.proposalView(proposal));
  }

  /** A person decides; approval reruns the existing review only if the records still derive the same change. */
  decideProposal(input: { proposalId: string; decision: "approve" | "reject"; changesetHash: string }): AiProposalView {
    const proposal = this.proposals.get(input.proposalId);
    const run = proposal ? this.runs.get(proposal.runId) : undefined;
    if (!proposal || !run || !this.canRead(run)) throw ApiError.of(ERR.NOT_FOUND, "Record not found.");
    this.requireHumanPermission(proposal.requiredPermission);
    if (proposal.status !== "pending") throw ApiError.of(ERR.CONFLICT, "This change was already decided.");
    if (proposal.expiresAt <= Date.now()) throw ApiError.of(ERR.CONFLICT, "This prepared change expired. Prepare it again.");
    if (input.changesetHash !== proposal.changesetHash) throw ApiError.of(ERR.CONFLICT, "This record changed. Refresh and try again.");
    const actor = this.host.actor();
    if (input.decision === "reject") {
      Object.assign(proposal, { status: "rejected", decidedByName: actor.name });
      this.host.audit({ action: "ai.proposal.reject", entityId: proposal.id, entityLabel: proposal.subjectLabel, summary: "Prepared change rejected" });
      return this.proposalView(proposal);
    }
    let rederived: string | null = null;
    try {
      const facts = this.host.cashShiftFacts(proposal.payload.shiftId);
      const investigation = investigateCashDifference(facts);
      rederived = shouldPrepareVarianceReview(facts, investigation) ? varianceReviewProposal(facts, investigation).changesetHash : null;
    } catch {
      rederived = null;
    }
    if (rederived !== proposal.changesetHash) {
      Object.assign(proposal, { status: "invalidated", invalidationReason: "source_changed", decidedByName: actor.name });
      this.host.audit({ action: "ai.proposal.invalidate", entityId: proposal.id, entityLabel: proposal.subjectLabel, summary: "Prepared change no longer matched the records" });
      return this.proposalView(proposal);
    }
    this.host.reviewVariance(proposal.payload.shiftId, { decision: "approved", note: proposal.payload.note });
    Object.assign(proposal, { status: "executed", decidedByName: actor.name });
    this.host.audit({ action: "ai.proposal.approve", entityId: proposal.id, entityLabel: proposal.subjectLabel, summary: "Prepared change approved and saved" });
    return this.proposalView(proposal);
  }

  private saveArtifact(run: MockRun, kind: AiArtifactView["kind"], title: string, composed: ReturnType<typeof composeManagementReport>, requiredPermissions: string[]): AiArtifactView {
    const existing = [...this.artifacts.values()].find((item) => item.runId === run.id && item.kind === kind);
    if (existing) return existing;
    const branch = run.branchId ? this.host.db.branches.find((item) => item.id === run.branchId) : undefined;
    const now = Date.now();
    const artifact = { id: `artifact-${mockUuid()}`, kind, title, titleParams: composed.titleParams, ...(branch ? { branchId: branch.id, branchName: branch.name } : {}), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 30 * 86_400_000).toISOString(), runId: run.id, sections: composed.sections, verification: composed.verification, coverage: composed.coverage, requiredPermissions };
    this.artifacts.set(artifact.id, artifact);
    return artifact;
  }

  getArtifact(artifactId: string): AiArtifactView {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact || Date.parse(artifact.expiresAt) <= Date.now()) throw ApiError.of(ERR.NOT_FOUND, "Record not found.");
    if (artifact.requiredPermissions.some((permission) => !this.host.permissions().includes(permission))) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this action. Ask your gym owner.");
    if (artifact.branchId && !this.host.branchVisible(artifact.branchId)) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this branch.");
    const { requiredPermissions: _required, ...view } = artifact;
    return view;
  }

  private finish(run: MockRun, status: AiRunStatus, category?: AiErrorCategory): void {
    run.status = status;
    run.stage = status === "completed" ? "aiWork.stage.done" : status === "cancelled" ? "aiWork.stage.stopped" : status === "partially_completed" ? "aiWork.stage.partly" : "aiWork.stage.failed";
    if (category) run.errorCategory = category;
    run.completedAt = Date.now();
    run.updatedAt = Date.now();
  }

  private renewalFacts(memberId: string, membershipId: string | undefined): RenewalMemberFacts | null {
    let context: MemberFollowUpContext;
    try {
      context = this.host.memberFollowUpContext(memberId);
    } catch {
      return null;
    }
    const member = this.host.db.members.find((item) => item.id === memberId);
    if (!member) return null;
    return composeRenewalFacts({
      context,
      member: { status: member.status, preferredLanguage: member.preferredLanguage, assignedSalespersonId: member.assignedSalespersonId, homeBranchId: member.homeBranchId },
      memberships: this.host.db.memberships.filter((term) => term.memberId === memberId).map((term) => ({ id: term.id, startDate: term.startDate, endDate: term.endDate, previousMembershipId: term.previousMembershipId, cancelledAt: term.cancelledAt, ...(term.activeFreeze ? { activeFreeze: { status: term.activeFreeze.status, startDate: term.activeFreeze.startDate, endDate: term.activeFreeze.endDate } } : {}) })),
      plannedMembershipId: membershipId,
      snoozedUntil: this.host.snoozedUntil(memberId),
      memories: this.activeMemoriesFor(memberId).map((memory) => ({ topic: memory.topic, status: memory.status, effectiveUntil: memory.effectiveUntil, text: memory.text })),
      localVisitHours: this.attendance(memberId, member.homeBranchId).localHours,
      eveningClassesNext7Days: this.eveningClasses(member.homeBranchId),
      gymName: this.host.db.organization.name,
      gymDefaultLanguage: this.host.db.organization.defaultLanguage,
      today: this.host.today(),
    });
  }

  /** Lead follow-ups: the same decisions and one-per-date key as the server, over preview leads. */
  private advanceSales(run: MockRun, grant: MockGrant): void {
    const params = run.params as { owner?: "me" | "lead_owner" };
    const today = this.host.today();
    if (run.stage === "aiWork.stage.queued" || run.stage === "aiWork.stage.starting") {
      const due = this.host.dueLeads(run.branchId, localDateTimeToISO(today, "23:59", this.host.timezone()));
      run.planned = due.slice(0, 100);
      run.counts.considered = due.length;
      run.stage = run.planned.length ? "aiWork.stage.checkingContacts" : "aiWork.stage.nothingToDo";
      run.updatedAt = Date.now();
      if (!run.planned.length) this.finish(run, "completed");
      return;
    }
    if (run.cursor >= run.planned.length) return this.finish(run, run.counts.failed > 0 ? "partially_completed" : "completed");
    const subject = run.planned[run.cursor]!;
    const seq = run.cursor + 1;
    const stamp = new Date().toISOString();
    const leadHref = `/crm/leads/${subject.id}`;
    const next = () => {
      run.cursor += 1;
      run.stage = "aiWork.stage.preparingFollowUps";
      run.updatedAt = Date.now();
    };
    const exclude = (reason: AiExclusionReason) => {
      run.steps.push({ id: mockUuid(), seq, capability: "task.create_lead_followup", subjectId: subject.id, subjectName: subject.name, status: "skipped", reason, updatedAt: stamp });
      run.counts.skipped += 1;
      run.exclusions.push({ subjectId: subject.id, subjectName: subject.name, reason, sources: [{ kind: "lead", id: subject.id, href: leadHref }] });
      next();
    };
    const facts = this.host.leadFollowUpFacts(subject.id);
    if (!facts) return exclude("outside_scope");
    const decision = evaluateLeadCandidate(facts, { now: stamp });
    if (decision.decision === "exclude") return exclude(decision.reason);
    const key = leadOperationKey(this.host.db.organization.id, subject.id, facts.nextFollowUpAt);
    const priorId = this.operationKeys.get(key);
    const prior = priorId ? this.host.db.tasks.find((task) => task.id === priorId) : undefined;
    if (prior && prior.status !== "open") return exclude("lead_already_prepared");
    if (decision.decision === "link" || prior) {
      const taskId = decision.decision === "link" ? decision.taskId : prior!.id;
      const title = decision.decision === "link" ? decision.taskTitle : prior!.title;
      const ref: AiRunResultRef = { kind: "task", id: taskId, label: title, href: leadHref, subjectName: subject.name };
      run.steps.push({ id: mockUuid(), seq, capability: "task.create_lead_followup", subjectId: subject.id, subjectName: subject.name, status: "verified", reason: "has_open_followup", resultRef: ref, updatedAt: stamp });
      run.counts.linked += 1;
      run.results.push(ref);
      return next();
    }
    if (run.writes >= run.maxWrites) return this.finish(run, run.counts.created + run.counts.linked > 0 ? "partially_completed" : "failed", "limit_reached");
    const writeBlocked = toolBlocked(TOOLS["task.create_lead_followup"]!, { ...this.authority("sales_followups"), grantTools: grant.tools, grantActive: true });
    if (writeBlocked) return this.finish(run, run.counts.created + run.counts.linked > 0 ? "partially_completed" : "failed", writeBlocked === "permission_denied" ? "authority_revoked" : writeBlocked);
    const ownerId = params.owner === "me" || !facts.ownerId ? run.ownerId : facts.ownerId;
    const task = this.host.createTask({ type: "follow_up", title: leadTaskTitle(facts.leadName), ownerId, dueAt: decision.dueAt, priority: decision.priority, leadId: subject.id, origin: { kind: "ai_run", runId: run.id, grantId: grant.id }, aiContext: { purpose: "lead" } });
    this.operationKeys.set(key, task.id);
    const ref: AiRunResultRef = { kind: "task", id: task.id, label: task.title, href: leadHref, subjectName: subject.name };
    run.steps.push({ id: mockUuid(), seq, capability: "task.create_lead_followup", subjectId: subject.id, subjectName: subject.name, status: "verified", resultRef: ref, ...(facts.draft ? { draft: facts.draft } : {}), updatedAt: stamp });
    run.counts.created += 1;
    if (facts.draft) run.counts.prepared += 1;
    run.writes += 1;
    run.results.push(ref);
    next();
  }

  private advance(run: MockRun): void {
    if (isTerminalRunStatus(run.status)) return;
    run.status = "running";
    const partial = run.counts.created + run.counts.linked > 0;
    if (run.cancelRequested) return this.finish(run, "cancelled");
    const grant = this.grants.get(run.grantId);
    if (!grant || grant.status !== "active") return this.finish(run, partial ? "partially_completed" : "failed", "authority_revoked");
    const blocked = playbookBlocked(PLAYBOOKS[run.playbook], this.authority(PLAYBOOKS[run.playbook].capability));
    if (blocked) return this.finish(run, partial ? "partially_completed" : "failed", blocked === "permission_denied" ? "authority_revoked" : blocked);
    if (run.playbook === "sales_followups") return this.advanceSales(run, grant);
    if (run.playbook !== "renewal_followups") return this.finish(run, "failed", "validation"); // other playbooks run in advanceJob or are not offered in the preview
    const params = run.params as { bucket?: "expiring" | "expired"; days?: number; owner?: "me" | "assigned" };
    const today = this.host.today();
    if (run.stage === "aiWork.stage.queued" || run.stage === "aiWork.stage.starting") {
      const items = this.host.renewalQueue({ branchId: run.branchId, bucket: params.bucket ?? "expiring", ...(params.days ? { days: params.days } : {}) });
      run.planned = items.slice(0, 100).map((item) => ({ id: item.member.id, name: item.member.fullName, ref: item.membership.id }));
      run.counts.considered = items.length;
      run.stage = run.planned.length ? "aiWork.stage.checkingContacts" : "aiWork.stage.nothingToDo";
      run.updatedAt = Date.now();
      if (!run.planned.length) this.finish(run, "completed");
      return;
    }
    if (run.cursor >= run.planned.length) return this.finish(run, run.counts.failed > 0 ? "partially_completed" : "completed");
    const subject = run.planned[run.cursor]!;
    const seq = run.cursor + 1;
    const stamp = () => new Date().toISOString();
    const next = () => {
      run.cursor += 1;
      run.stage = "aiWork.stage.preparingFollowUps";
      run.updatedAt = Date.now();
    };
    const exclude = (reason: AiExclusionReason) => {
      run.steps.push({ id: mockUuid(), seq, capability: "task.create_followup", subjectId: subject.id, subjectName: subject.name, status: "skipped", reason, updatedAt: stamp() });
      run.counts.skipped += 1;
      run.exclusions.push({ subjectId: subject.id, subjectName: subject.name, reason, sources: [{ kind: "member", id: subject.id, href: `/members/${subject.id}` }] });
      next();
    };
    const facts = this.renewalFacts(subject.id, subject.ref);
    if (!facts) return exclude("outside_scope");
    const decision = evaluateRenewalCandidate(facts, { today, now: new Date().toISOString(), revisions: run.revisions.map((revision) => revision.interpreted), latestUsefulDate: params.bucket === "expired" ? addDays(today, 14) : facts.membershipEndDate });
    const key = renewalOperationKey(this.host.db.organization.id, subject.id, facts.membershipId, facts.membershipEndDate);
    const memberHref = `/members/${subject.id}?tab=tasks`;
    if (decision.decision === "exclude") return exclude(decision.reason);
    const priorId = this.operationKeys.get(key);
    const prior = priorId ? this.host.db.tasks.find((task) => task.id === priorId) : undefined;
    if (prior && prior.status !== "open") return exclude("already_prepared");
    if (decision.decision === "link" || prior) {
      const taskId = decision.decision === "link" ? decision.taskId : prior!.id;
      const title = decision.decision === "link" ? decision.taskTitle : prior!.title;
      const ref: AiRunResultRef = { kind: "task", id: taskId, label: title, href: memberHref, subjectName: subject.name };
      run.steps.push({ id: mockUuid(), seq, capability: "task.create_followup", subjectId: subject.id, subjectName: subject.name, status: "verified", reason: "has_open_followup", resultRef: ref, updatedAt: stamp() });
      run.counts.linked += 1;
      run.results.push(ref);
      return next();
    }
    if (run.writes >= run.maxWrites) return this.finish(run, run.counts.created + run.counts.linked > 0 ? "partially_completed" : "failed", "limit_reached");
    const writeBlocked = toolBlocked(TOOLS["task.create_followup"]!, { ...this.authority("followup_batch"), grantTools: grant.tools, grantActive: true });
    if (writeBlocked) return this.finish(run, run.counts.created + run.counts.linked > 0 ? "partially_completed" : "failed", writeBlocked === "permission_denied" ? "authority_revoked" : writeBlocked);
    let draft = decision.draft === "message" ? facts.draft : undefined;
    if (draft) {
      const allowedFacts = [...(decision.topic === "evening_classes" && facts.eveningClassesAvailable ? ["evening_classes_available" as const] : []), ...(decision.adjustedFor === "travel" ? ["returning_from_travel" as const] : [])];
      if (allowedFacts.length) {
        const result = runFixtureTask({ kind: "draft_followup_message", language: draft.language, firstName: facts.memberName.split(/\s+/)[0] ?? facts.memberName, gymName: this.host.db.organization.name, baseText: draft.text, allowedFacts });
        if (result.output.kind === "draft_followup_message") draft = { language: result.output.language, text: result.output.text };
      }
    }
    const ownerRevision = [...run.revisions].reverse().map((revision) => revision.interpreted).find((revision): revision is Extract<AiRunRevision, { kind: "owner" }> => revision.kind === "owner");
    const ownerId = ownerRevision?.ownerId ?? (params.owner === "assigned" && facts.assignedSalespersonId ? facts.assignedSalespersonId : run.ownerId);
    const task = this.host.createTask({
      type: "renewal_call",
      title: renewalTaskTitle(facts.memberName, decision.topic),
      ownerId,
      dueAt: localDateTimeToISO(decision.dueDate, decision.dueTime, this.host.timezone()),
      priority: diffDays(today, facts.membershipEndDate) <= 3 ? "high" : "normal",
      memberId: subject.id,
      origin: { kind: "ai_run", runId: run.id, grantId: grant.id },
      aiContext: { purpose: "renewal", membershipId: facts.membershipId, ...(decision.topic ? { topic: decision.topic } : {}) },
    });
    // Verify the saved record before reporting success, as the server does.
    const saved = this.host.db.tasks.find((item) => item.id === task.id);
    if (!saved || saved.memberId !== subject.id || saved.status !== "open" || saved.origin?.runId !== run.id) throw ApiError.of("INTERNAL_ERROR", "Saved follow-up did not match what was requested.");
    this.operationKeys.set(key, task.id);
    const ref: AiRunResultRef = { kind: "task", id: task.id, label: task.title, href: memberHref, subjectName: subject.name };
    run.steps.push({ id: mockUuid(), seq, capability: "task.create_followup", subjectId: subject.id, subjectName: subject.name, status: "verified", resultRef: ref, ...(draft ? { draft } : {}), updatedAt: stamp() });
    run.counts.created += 1;
    if (draft) run.counts.prepared += 1;
    run.writes += 1;
    run.results.push(ref);
    next();
  }

  private createGrant(playbook: AiPlaybookKey, params: Record<string, string | number | boolean>, branchId: string | undefined, kind: "one_off" | "standing", extra: Partial<MockGrant> = {}): MockGrant {
    const actor = this.host.actor();
    const now = Date.now();
    const definition = PLAYBOOKS[playbook];
    const grant: MockGrant = {
      id: `${kind === "standing" ? "standing" : "grant"}-${mockUuid()}`,
      kind,
      playbook,
      ownerId: actor.id,
      ownerName: actor.name,
      createdById: actor.id,
      ...(branchId ? { branchId } : {}),
      tools: definition.tools.filter((key) => TOOLS[key]?.permissions.every((permission) => this.host.permissions().includes(permission))),
      params,
      status: "active",
      revision: 1,
      limits: definition.limits,
      createdAt: now,
      updatedAt: now,
      ...extra,
    };
    this.grants.set(grant.id, grant);
    return grant;
  }

  private createRun(playbook: AiPlaybookKey, params: Record<string, string | number | boolean>, branchId: string | undefined, requestKey: string, trigger: MockRun["trigger"], grant: MockGrant): MockRun {
    const existing = [...this.runs.values()].find((run) => run.requestKey === requestKey);
    if (existing) return existing;
    const actor = this.host.actor();
    const now = Date.now();
    const run: MockRun = {
      id: `run-${mockUuid()}`,
      grantId: grant.id,
      playbook,
      ...(branchId ? { branchId } : {}),
      requestedById: actor.id,
      requestedByName: actor.name,
      ownerId: grant.ownerId,
      ownerName: grant.ownerName,
      trigger,
      requestKey,
      params,
      status: "queued",
      stage: "aiWork.stage.queued",
      planned: [],
      cursor: 0,
      counts: { considered: 0, prepared: 0, created: 0, linked: 0, skipped: 0, failed: 0 },
      results: [],
      exclusions: [],
      steps: [],
      revisions: [],
      cancelRequested: false,
      writes: 0,
      maxWrites: grant.limits.maxWrites,
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.id, run);
    this.schedule(run);
    return run;
  }

  startRun(input: StartAiRunInput): AiRunView {
    const definition = PLAYBOOKS[input.playbook];
    if (!definition) throw ApiError.of(ERR.VALIDATION, "Choose what RIVET should prepare.");
    if (!input.requestKey || input.requestKey.length < 8) throw ApiError.of(ERR.VALIDATION, "A valid request key is required.");
    const parsed = parsePlaybookParams(input.playbook, input.params);
    if (!parsed.ok) throw ApiError.of(ERR.VALIDATION, "Check the details and try again.");
    const blocked = playbookBlocked(definition, this.authority(definition.capability));
    if (blocked) throw ApiError.of(blocked === "permission_denied" ? ERR.FORBIDDEN : ERR.FEATURE_NOT_AVAILABLE, blocked === "permission_denied" ? "You do not have access to this action. Ask your gym owner." : "This work is turned off for your gym.", { details: { reason: blocked } });
    const branchId = input.branchId ?? this.host.activeBranchId();
    if (branchId && !this.host.branchVisible(branchId)) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this branch.");
    const requestKey = `user:${this.host.actor().id}:${input.requestKey}`;
    const existing = [...this.runs.values()].find((run) => run.requestKey === requestKey);
    if (existing) return this.runView(existing);
    const grant = this.createGrant(input.playbook, parsed.params, branchId, "one_off");
    const run = this.createRun(input.playbook, parsed.params, branchId, requestKey, "user", grant);
    this.host.audit({ action: "ai.run.start", entityId: run.id, entityLabel: definition.goalKey, summary: `Delegated work started: ${input.playbook}` });
    return this.runView(run);
  }

  getRun(runId: string): AiRunView {
    return this.runView(this.readableRun(runId));
  }

  subscribeRun(runId: string, onValue: (run: AiRunView) => void, onError?: (error: unknown) => void): () => void {
    const subscriber = { onValue, onError };
    const set = this.runSubscribers.get(runId) ?? new Set();
    set.add(subscriber);
    this.runSubscribers.set(runId, set);
    try {
      onValue(this.getRun(runId));
    } catch (error) {
      onError?.(error);
    }
    return () => { set.delete(subscriber); };
  }

  listRuns(query: { playbook?: AiPlaybookKey; branchId?: string; limit?: number }): AiRunView[] {
    return [...this.runs.values()]
      .filter((run) => this.canRead(run) && (!query.playbook || run.playbook === query.playbook) && (!query.branchId || !run.branchId || run.branchId === query.branchId))
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, Math.max(1, Math.min(25, query.limit ?? 10)))
      .map((run) => ({ ...this.runView(run), steps: [] }));
  }

  cancelRun(runId: string): AiRunView {
    const run = this.readableRun(runId);
    if (!this.canControl(run)) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this action. Ask your gym owner.");
    if (isTerminalRunStatus(run.status)) return this.runView(run);
    run.cancelRequested = true;
    run.updatedAt = Date.now();
    if (run.status === "queued" && run.cursor === 0) {
      const timer = this.timers.get(run.id);
      if (timer) clearTimeout(timer);
      this.timers.delete(run.id);
      this.finish(run, "cancelled");
    }
    this.host.audit({ action: "ai.run.cancel", entityId: run.id, entityLabel: run.playbook, summary: "Delegated work stopped" });
    this.notify(run);
    return this.runView(run);
  }

  reviseRun(input: { runId: string; text: string; revision: AiRunRevision }): AiRunView {
    const run = this.readableRun(input.runId);
    if (!this.canControl(run) || run.playbook !== "renewal_followups") throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this action. Ask your gym owner.");
    if (isTerminalRunStatus(run.status)) throw ApiError.of(ERR.CONFLICT, "This work has already finished.");
    const revision = input.revision;
    const valid = revision.kind === "time_of_day"
      || (revision.kind === "exclude_member" && run.planned.some((subject) => subject.id === revision.memberId))
      || (revision.kind === "owner" && this.host.db.users.some((user) => user.id === revision.ownerId && user.status === "active"));
    if (!valid) throw ApiError.of(ERR.VALIDATION, "RIVET could not apply that change. Try different words.");
    run.revisions.push({ id: mockUuid(), at: new Date().toISOString(), byName: this.host.actor().name, text: input.text.slice(0, 300), interpreted: revision, appliedToRemaining: Math.max(0, run.planned.length - run.cursor) });
    run.updatedAt = Date.now();
    this.host.audit({ action: "ai.run.revise", entityId: run.id, entityLabel: run.playbook, summary: "Delegated work changed for the remaining members" });
    this.notify(run);
    return this.runView(run);
  }

  takeOverRun(runId: string): AiRunView {
    const run = this.readableRun(runId);
    if (!this.canControl(run)) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this action. Ask your gym owner.");
    if (isTerminalRunStatus(run.status)) return this.runView(run);
    const timer = this.timers.get(run.id);
    if (timer) clearTimeout(timer);
    this.timers.delete(run.id);
    for (const subject of run.planned.slice(run.cursor)) run.steps.push({ id: mockUuid(), seq: run.steps.length + 1, capability: "handover", subjectId: subject.id, subjectName: subject.name, status: "handed_over", updatedAt: new Date().toISOString() });
    run.cursor = run.planned.length;
    run.takenOverByName = this.host.actor().name;
    this.finish(run, run.counts.created + run.counts.linked > 0 ? "partially_completed" : "cancelled");
    run.stage = "aiWork.stage.takenOver";
    this.host.audit({ action: "ai.run.take_over", entityId: run.id, entityLabel: run.playbook, summary: "Took over remaining items" });
    this.notify(run);
    return this.runView(run);
  }

  retryRun(runId: string): AiRunView {
    const run = this.readableRun(runId);
    if (!this.canControl(run)) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this action. Ask your gym owner.");
    if (!(run.status === "failed" || run.status === "partially_completed") || run.errorCategory === "authority_revoked" || run.takenOverByName) throw ApiError.of(ERR.CONFLICT, "This work cannot be retried.");
    run.status = "queued";
    run.stage = "aiWork.stage.queued";
    delete run.errorCategory;
    delete run.completedAt;
    run.updatedAt = Date.now();
    this.schedule(run);
    return this.runView(run);
  }

  /** A renewal closes RIVET-prepared renewal calls for the member, as the server does in the sale transaction. */
  closeObsoleteRenewalWork(memberId: string, newMembershipId: string): void {
    for (const task of this.host.db.tasks) {
      if (task.memberId !== memberId || task.status !== "open" || task.origin?.kind !== "ai_run" || task.aiContext?.purpose !== "renewal" || task.aiContext.membershipId === newMembershipId) continue;
      task.status = "completed";
      task.outcome = "Renewed — follow-up no longer needed";
      task.completedAt = new Date().toISOString();
    }
  }

  // ---------------------------------------------------------------------------
  // Standing instructions
  // ---------------------------------------------------------------------------

  private standingView(grant: MockGrant): AiStandingInstructionView {
    const branch = grant.branchId ? this.host.db.branches.find((item) => item.id === grant.branchId) : undefined;
    return {
      id: grant.id,
      playbook: grant.playbook,
      title: PLAYBOOKS[grant.playbook].goalKey,
      ownerId: grant.ownerId,
      ownerName: grant.ownerName,
      createdById: grant.createdById,
      ...(grant.branchId ? { branchId: grant.branchId, branchName: branch?.name ?? "" } : {}),
      schedule: grant.schedule ?? { weekdays: [], time: "08:00" },
      capabilities: grant.tools,
      limits: grant.limits,
      params: grant.params,
      status: grant.status,
      revision: grant.revision,
      ...(grant.lastRunAt ? { lastRunAt: new Date(grant.lastRunAt).toISOString() } : {}),
      ...(grant.nextRunAt ? { nextRunAt: new Date(grant.nextRunAt).toISOString() } : {}),
      ...(grant.lastRunId ? { lastRunId: grant.lastRunId } : {}),
      ...(grant.revokedReason ? { revokedReason: grant.revokedReason } : {}),
      createdAt: new Date(grant.createdAt).toISOString(),
      updatedAt: new Date(grant.updatedAt).toISOString(),
    };
  }

  listStanding(): AiStandingInstructionView[] {
    const managers = this.host.role() === "owner" || this.host.role() === "manager";
    const me = this.host.actor().id;
    return [...this.grants.values()].filter((grant) => grant.kind === "standing" && grant.status !== "revoked" && (managers || grant.ownerId === me || grant.createdById === me)).sort((left, right) => right.createdAt - left.createdAt).map((grant) => this.standingView(grant));
  }

  previewStanding(input: { playbook: AiPlaybookKey; params: Record<string, string | number | boolean>; branchId?: string }): AiStandingPreview {
    const definition = PLAYBOOKS[input.playbook];
    if (!definition?.standingAllowed) throw ApiError.of(ERR.VALIDATION, "This work cannot repeat on a schedule.");
    const parsed = parsePlaybookParams(input.playbook, input.params);
    if (!parsed.ok) throw ApiError.of(ERR.VALIDATION, "Check the details and try again.");
    const blocked = playbookBlocked(definition, this.authority(definition.capability));
    if (blocked) throw ApiError.of(ERR.FORBIDDEN, "This work is turned off for your gym.", { details: { reason: blocked } });
    if (input.playbook !== "renewal_followups") return { subjects: [], digest: previewDigest([]) };
    const params = parsed.params as { bucket?: "expiring" | "expired"; days?: number };
    const today = this.host.today();
    const subjects = this.host.renewalQueue({ branchId: input.branchId ?? this.host.activeBranchId(), bucket: params.bucket ?? "expiring", ...(params.days ? { days: params.days } : {}) }).slice(0, 100).flatMap((item) => {
      const facts = this.renewalFacts(item.member.id, item.membership.id);
      if (!facts) return [];
      const decision = evaluateRenewalCandidate(facts, { today, now: new Date().toISOString(), revisions: [] });
      return [{ id: item.member.id, name: facts.memberName, decision: decision.decision, ...(decision.decision === "exclude" ? { reason: decision.reason } : {}) }];
    });
    return { subjects, digest: previewDigest(subjects) };
  }

  createStanding(input: CreateStandingInstructionInput & { previewDigest: string }): AiStandingInstructionView {
    const definition = PLAYBOOKS[input.playbook];
    if (!definition?.standingAllowed) throw ApiError.of(ERR.VALIDATION, "This work cannot repeat on a schedule.");
    const parsed = parsePlaybookParams(input.playbook, input.params);
    if (!parsed.ok) throw ApiError.of(ERR.VALIDATION, "Check the details and try again.");
    const weekdays = [...new Set(input.schedule.weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort();
    if (!weekdays.length || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.schedule.time)) throw ApiError.of(ERR.VALIDATION, "Choose at least one day and a time.");
    const blocked = playbookBlocked(definition, this.authority(definition.capability));
    if (blocked) throw ApiError.of(ERR.FEATURE_NOT_AVAILABLE, "This work is turned off for your gym.", { details: { reason: blocked } });
    const branchId = input.branchId ?? this.host.activeBranchId();
    const preview = this.previewStanding({ playbook: input.playbook, params: parsed.params, branchId });
    if (input.previewDigest !== preview.digest) throw ApiError.of(ERR.CONFLICT, "The preview changed. Review it again before turning this on.", { details: { reason: "preview_changed" } });
    const existing = [...this.grants.values()].find((grant) => grant.kind === "standing" && grant.requestKey === input.requestKey);
    if (existing) return this.standingView(existing);
    const grant = this.createGrant(input.playbook, parsed.params, branchId, "standing", { schedule: { weekdays, time: input.schedule.time }, requestKey: input.requestKey, nextRunAt: nextStandingSlot({ weekdays, time: input.schedule.time }, this.host.timezone(), Date.now()) });
    this.host.audit({ action: "ai.standing.create", entityId: grant.id, entityLabel: definition.goalKey, summary: `Standing instruction turned on: ${input.playbook}` });
    return this.standingView(grant);
  }

  updateStanding(input: { standingId: string; action: "pause" | "resume" | "revoke" | "transfer"; ownerId?: string; reason?: string }): AiStandingInstructionView {
    const grant = this.grants.get(input.standingId);
    const managers = this.host.role() === "owner" || this.host.role() === "manager";
    if (!grant || grant.kind !== "standing") throw ApiError.of(ERR.NOT_FOUND, "Record not found.");
    if (!(managers || grant.ownerId === this.host.actor().id)) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this action. Ask your gym owner.");
    if (grant.status === "revoked") throw ApiError.of(ERR.CONFLICT, "This instruction was already turned off.");
    if (input.action === "pause") grant.status = "paused";
    if (input.action === "resume") {
      grant.status = "active";
      grant.nextRunAt = grant.schedule ? nextStandingSlot(grant.schedule, this.host.timezone(), Date.now()) : undefined;
    }
    if (input.action === "revoke") {
      grant.status = "revoked";
      grant.revokedReason = input.reason || "Turned off";
      delete grant.nextRunAt;
      for (const run of this.runs.values()) if (run.grantId === grant.id && !isTerminalRunStatus(run.status)) run.cancelRequested = true;
    }
    if (input.action === "transfer") {
      if (!managers) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this action. Ask your gym owner.");
      const target = this.host.db.users.find((user) => user.id === input.ownerId && user.status === "active");
      if (!target) throw ApiError.of(ERR.VALIDATION, "Choose an active staff member.");
      grant.ownerId = target.id;
      grant.ownerName = target.name;
    }
    grant.revision += 1;
    grant.updatedAt = Date.now();
    this.host.audit({ action: `ai.standing.${input.action}`, entityId: grant.id, entityLabel: grant.playbook, summary: `Standing instruction ${input.action}` });
    return this.standingView(grant);
  }

  /** Preview seam: start any due standing slot now (the server does this from a cron). */
  dispatchDueStanding(now = Date.now()): number {
    let started = 0;
    for (const grant of this.grants.values()) {
      if (grant.kind !== "standing" || grant.status !== "active" || !grant.nextRunAt || grant.nextRunAt > now || !grant.schedule) continue;
      const slot = grant.nextRunAt;
      grant.nextRunAt = nextStandingSlot(grant.schedule, this.host.timezone(), now);
      const blocked = playbookBlocked(PLAYBOOKS[grant.playbook], this.authority(PLAYBOOKS[grant.playbook].capability));
      if (blocked) continue;
      const run = this.createRun(grant.playbook, grant.params, grant.branchId, `standing:${grant.id}:${slot}`, "schedule", grant);
      grant.lastRunAt = now;
      grant.lastRunId = run.id;
      started += 1;
    }
    return started;
  }

  // ---------------------------------------------------------------------------
  // Memories and feedback
  // ---------------------------------------------------------------------------

  listMemories(memberId: string): AiMemoryView[] {
    this.requireHumanPermission("members.read");
    this.host.memberFollowUpContext(memberId);
    return this.activeMemoriesFor(memberId);
  }

  recordMemory(input: { memberId: string; topic: "travel" | "contact_time" | "no_contact"; effectiveUntil?: string; value?: string; text?: string; sourceTimelineId?: string }): AiMemoryView {
    this.requireHumanPermission("members.write");
    this.host.memberFollowUpContext(input.memberId);
    const today = this.host.today();
    if (input.topic === "travel" && (!input.effectiveUntil || !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveUntil) || input.effectiveUntil < today || input.effectiveUntil > addDays(today, 120))) throw ApiError.of(ERR.VALIDATION, "Choose the date the member is back.");
    const text = input.topic === "contact_time" ? input.value ?? "" : (input.text ?? "").slice(0, 300);
    if (input.topic === "contact_time" && !["morning", "afternoon", "evening"].includes(text)) throw ApiError.of(ERR.VALIDATION, "Check the details and try again.");
    const previous = this.memories.find((memory) => memory.subjectId === input.memberId && memory.topic === input.topic && memory.status === "active");
    if (previous) previous.status = "superseded";
    const actor = this.host.actor();
    const now = Date.now();
    const memory: AiMemoryView & { createdAt: number } = {
      id: `memory-${mockUuid()}`,
      kind: input.topic === "contact_time" ? "preference" : "staff_statement",
      topic: input.topic,
      subjectType: "member",
      subjectId: input.memberId,
      text,
      effectiveFrom: today,
      ...(input.effectiveUntil ? { effectiveUntil: input.effectiveUntil } : {}),
      status: "active",
      provenance: { sourceKind: input.sourceTimelineId ? "contact_note" : "staff_explicit", ...(input.sourceTimelineId ? { sourceId: input.sourceTimelineId } : {}), recordedById: actor.id, recordedByName: actor.name, recordedAt: new Date(now).toISOString() },
      revision: (previous?.revision ?? 0) + 1,
      createdAt: now,
    };
    this.memories.push(memory);
    this.host.audit({ action: "ai.memory.record", entityId: input.memberId, entityLabel: input.memberId, summary: input.topic === "travel" ? `Travel noted until ${input.effectiveUntil}` : "Contact preference noted" });
    const { createdAt: _createdAt, ...view } = memory;
    return view;
  }

  revokeMemory(memoryId: string): void {
    this.requireHumanPermission("members.write");
    const memory = this.memories.find((item) => item.id === memoryId);
    if (!memory) throw ApiError.of(ERR.NOT_FOUND, "Record not found.");
    this.host.memberFollowUpContext(memory.subjectId);
    memory.status = "revoked";
    this.host.audit({ action: "ai.memory.revoke", entityId: memory.subjectId, entityLabel: memory.subjectId, summary: "Staff note removed from RIVET's context" });
  }

  recordFeedback(input: AiFeedbackInput): void {
    this.feedback.push(input);
  }

  /** Test seam: stop every simulated timer. */
  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
