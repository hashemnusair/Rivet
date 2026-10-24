import { z } from "zod";
import type { AiAdapterMode, AiCapabilityKey, AiErrorCategory, AiPlaybookKey, AiRunLimits, AiTenantMode } from "./contracts";
import { DEFAULT_RUN_LIMITS } from "./contracts";

/**
 * Governed capability registry. A tool is a typed wrapper around an existing
 * domain operation; its declared permissions are checked before planning and
 * the wrapped operation checks them again inside its own transaction. An
 * allowed tool name is never permission to act on an arbitrary record: the
 * executor still loads every record through the delegated actor's scope.
 *
 * Changing this file never widens server authority on its own: the domain
 * operations remain the final authority, and the grant names exact tools.
 */

export type SideEffectClass = "read" | "prepare" | "internal_write" | "consequential" | "external";
export type ApprovalRule = "none" | "existing_reason" | "proposal";
export type WorkspaceModule = "revenue" | "operations" | "finance" | "reporting";

export interface ToolDefinition {
  key: string;
  version: string;
  capability: AiCapabilityKey;
  sideEffect: SideEffectClass;
  /** All are required. The wrapped domain operation checks again at commit. */
  permissions: readonly string[];
  /** Read only when the person also has them; otherwise that source becomes a visible gap. */
  optionalPermissions?: readonly string[];
  module?: WorkspaceModule;
  domainOperation?: string;
  approval: ApprovalRule;
  /** Writes derive a stable operation key and record it in the same transaction as the domain write. */
  idempotent: boolean;
  /** How the executor confirms the persisted result before reporting success. */
  verification: "reread_record" | "reread_list" | "none";
  /** What cancellation can undo. Financial and sent effects are never "rolled back". */
  compensation: "none" | "complete_task" | "revoke_memory" | "expire_artifact";
  /** Facts rechecked from current records immediately before the write. */
  preconditions: readonly string[];
}

export const TOOLS: Record<string, ToolDefinition> = {
  "member.context": { key: "member.context", version: "1", capability: "member_context", sideEffect: "read", permissions: ["members.read"], domainOperation: "members.followup_context", approval: "none", idempotent: false, verification: "none", compensation: "none", preconditions: [] },
  "note.extract": { key: "note.extract", version: "1", capability: "note_extraction", sideEffect: "prepare", permissions: ["members.write"], approval: "none", idempotent: false, verification: "none", compensation: "none", preconditions: [] },
  "renewal.candidates": { key: "renewal.candidates", version: "1", capability: "followup_batch", sideEffect: "read", permissions: ["crm.read"], module: "revenue", domainOperation: "renewal.queue", approval: "none", idempotent: false, verification: "none", compensation: "none", preconditions: [] },
  "task.create_followup": { key: "task.create_followup", version: "1", capability: "followup_batch", sideEffect: "internal_write", permissions: ["crm.write"], domainOperation: "tasks.create", approval: "none", idempotent: true, verification: "reread_record", compensation: "complete_task", preconditions: ["member_active", "not_renewed", "no_recent_contact", "no_open_followup", "not_frozen", "contact_allowed"] },
  "memory.record_statement": { key: "memory.record_statement", version: "1", capability: "note_extraction", sideEffect: "internal_write", permissions: ["members.write"], approval: "none", idempotent: true, verification: "reread_record", compensation: "revoke_memory", preconditions: ["subject_in_scope"] },
  "report.figures": { key: "report.figures", version: "1", capability: "report_job", sideEffect: "read", permissions: ["reports.financial.read"], optionalPermissions: ["crm.read"], domainOperation: "analytics.*", approval: "none", idempotent: false, verification: "none", compensation: "none", preconditions: [] },
  "artifact.save_report": { key: "artifact.save_report", version: "1", capability: "report_job", sideEffect: "internal_write", permissions: ["reports.financial.read"], approval: "none", idempotent: true, verification: "reread_record", compensation: "expire_artifact", preconditions: ["totals_verified"] },
  "export.request": { key: "export.request", version: "1", capability: "report_job", sideEffect: "internal_write", permissions: ["reports.financial.read"], domainOperation: "exports.request", approval: "none", idempotent: true, verification: "reread_record", compensation: "none", preconditions: ["export_permission"] },
  "handover.gather": { key: "handover.gather", version: "1", capability: "handover_job", sideEffect: "read", permissions: ["members.read"], optionalPermissions: ["crm.read", "reconciliation.open_shift", "operations.manage"], domainOperation: "checklists.day", approval: "none", idempotent: false, verification: "none", compensation: "none", preconditions: [] },
  "artifact.save_handover": { key: "artifact.save_handover", version: "1", capability: "handover_job", sideEffect: "internal_write", permissions: ["members.read"], approval: "none", idempotent: true, verification: "reread_record", compensation: "expire_artifact", preconditions: ["branch_in_scope"] },
  "task.assign_handover": { key: "task.assign_handover", version: "1", capability: "handover_job", sideEffect: "internal_write", permissions: ["crm.write"], domainOperation: "tasks.create", approval: "none", idempotent: true, verification: "reread_record", compensation: "complete_task", preconditions: ["assignee_active"] },
  "shift.investigate": { key: "shift.investigate", version: "1", capability: "cash_difference", sideEffect: "read", permissions: ["reconciliation.read"], domainOperation: "shifts.list", approval: "none", idempotent: false, verification: "none", compensation: "none", preconditions: [] },
  "artifact.save_cash_difference": { key: "artifact.save_cash_difference", version: "1", capability: "cash_difference", sideEffect: "internal_write", permissions: ["reconciliation.read"], approval: "none", idempotent: true, verification: "reread_record", compensation: "expire_artifact", preconditions: ["shift_in_scope"] },
  "shift.propose_variance_review": { key: "shift.propose_variance_review", version: "1", capability: "cash_difference", sideEffect: "consequential", permissions: ["reconciliation.read"], domainOperation: "shifts.review", approval: "proposal", idempotent: true, verification: "reread_record", compensation: "none", preconditions: ["variance_pending", "single_exact_match", "records_unchanged_since_close"] },
  "leads.due": { key: "leads.due", version: "1", capability: "sales_followups", sideEffect: "read", permissions: ["crm.read"], module: "revenue", domainOperation: "leads.list", approval: "none", idempotent: false, verification: "none", compensation: "none", preconditions: [] },
  "task.create_lead_followup": { key: "task.create_lead_followup", version: "1", capability: "sales_followups", sideEffect: "internal_write", permissions: ["crm.write"], module: "revenue", domainOperation: "tasks.create", approval: "none", idempotent: true, verification: "reread_record", compensation: "complete_task", preconditions: ["lead_open", "no_open_followup", "no_recent_contact"] },
  "operations.report_issue": { key: "operations.report_issue", version: "1", capability: "ops_triage", sideEffect: "internal_write", permissions: ["members.read"], module: "operations", domainOperation: "operations.equipment_issue.report", approval: "none", idempotent: true, verification: "reread_record", compensation: "none", preconditions: ["asset_in_scope"] },
  "classes.eligible": { key: "classes.eligible", version: "1", capability: "class_finder", sideEffect: "read", permissions: ["members.read"], domainOperation: "classes.occurrences.list", approval: "none", idempotent: false, verification: "none", compensation: "none", preconditions: [] },
  "class.book": { key: "class.book", version: "1", capability: "class_finder", sideEffect: "internal_write", permissions: ["members.read"], domainOperation: "classes.occurrence.roster.add", approval: "none", idempotent: true, verification: "reread_record", compensation: "none", preconditions: ["capacity_available", "member_eligible"] },
  "filters.interpret": { key: "filters.interpret", version: "1", capability: "nl_filters", sideEffect: "prepare", permissions: ["members.read"], approval: "none", idempotent: false, verification: "none", compensation: "none", preconditions: [] },
};

export interface PlaybookDefinition {
  key: AiPlaybookKey;
  version: string;
  capability: AiCapabilityKey;
  tools: readonly string[];
  /** Needed to start; each write tool's own permissions are checked again before it runs. */
  startPermissions: readonly string[];
  module?: WorkspaceModule;
  writes: boolean;
  /** Works through a list of people and reports created/linked/skipped counts. */
  batch: boolean;
  /** Uses model output (drafts, interpretation); otherwise everything comes from records. */
  usesModel: boolean;
  standingAllowed: boolean;
  goalKey: string;
  limits: AiRunLimits;
}

export const PLAYBOOKS: Record<AiPlaybookKey, PlaybookDefinition> = {
  renewal_followups: { key: "renewal_followups", version: "renewal-followups.v1", capability: "followup_batch", tools: ["renewal.candidates", "member.context", "task.create_followup"], startPermissions: ["crm.read", "crm.write"], module: "revenue", writes: true, batch: true, usesModel: true, standingAllowed: true, goalKey: "aiWork.goal.renewalFollowups", limits: DEFAULT_RUN_LIMITS },
  management_report: { key: "management_report", version: "management-report.v1", capability: "report_job", tools: ["report.figures", "artifact.save_report", "export.request"], startPermissions: ["reports.financial.read"], writes: true, batch: false, usesModel: false, standingAllowed: true, goalKey: "aiWork.goal.managementReport", limits: { ...DEFAULT_RUN_LIMITS, maxWrites: 2, maxSubjects: 10 } },
  shift_handover: { key: "shift_handover", version: "shift-handover.v1", capability: "handover_job", tools: ["handover.gather", "artifact.save_handover", "task.assign_handover"], startPermissions: ["members.read"], writes: true, batch: false, usesModel: false, standingAllowed: true, goalKey: "aiWork.goal.shiftHandover", limits: { ...DEFAULT_RUN_LIMITS, maxWrites: 5, maxSubjects: 200 } },
  cash_difference: { key: "cash_difference", version: "cash-difference.v1", capability: "cash_difference", tools: ["shift.investigate", "artifact.save_cash_difference", "shift.propose_variance_review"], startPermissions: ["reconciliation.read"], writes: true, batch: false, usesModel: false, standingAllowed: false, goalKey: "aiWork.goal.cashDifference", limits: { ...DEFAULT_RUN_LIMITS, maxWrites: 2, maxSubjects: 500 } },
  sales_followups: { key: "sales_followups", version: "sales-followups.v1", capability: "sales_followups", tools: ["leads.due", "task.create_lead_followup"], startPermissions: ["crm.read", "crm.write"], module: "revenue", writes: true, batch: true, usesModel: true, standingAllowed: true, goalKey: "aiWork.goal.salesFollowups", limits: DEFAULT_RUN_LIMITS },
  ops_triage: { key: "ops_triage", version: "ops-triage.v1", capability: "ops_triage", tools: ["operations.report_issue"], startPermissions: ["members.read"], module: "operations", writes: true, batch: false, usesModel: true, standingAllowed: false, goalKey: "aiWork.goal.opsTriage", limits: { ...DEFAULT_RUN_LIMITS, maxWrites: 1, maxSubjects: 1 } },
  class_finder: { key: "class_finder", version: "class-finder.v1", capability: "class_finder", tools: ["classes.eligible", "class.book"], startPermissions: ["members.read"], writes: true, batch: false, usesModel: false, standingAllowed: false, goalKey: "aiWork.goal.classFinder", limits: { ...DEFAULT_RUN_LIMITS, maxWrites: 1, maxSubjects: 50 } },
};

export const CAPABILITY_KEYS: readonly AiCapabilityKey[] = ["member_context", "note_extraction", "followup_batch", "report_job", "handover_job", "cash_difference", "sales_followups", "ops_triage", "import_assist", "class_finder", "nl_filters", "collections_prep", "member_class_finder", "platform_review"];

/** Capabilities that never mutate business records; `prepare` is enough for them. */
export const PREPARE_ONLY_CAPABILITIES: ReadonlySet<AiCapabilityKey> = new Set(["member_context", "nl_filters", "import_assist", "collections_prep", "member_class_finder", "platform_review"]);

export interface AuthorityInput {
  adapterMode: AiAdapterMode;
  globalStop: boolean;
  tenantMode: AiTenantMode;
  capabilityMode: AiTenantMode;
  actorPermissions: readonly string[];
  entitledModules: readonly string[];
  /** Tools listed on the grant; undefined for contextual preparation without a grant. */
  grantTools?: readonly string[];
  grantActive?: boolean;
}

/**
 * Effective authority = deployment mode ∩ platform stop ∩ gym mode ∩
 * capability mode ∩ actor permissions ∩ plan entitlement ∩ grant. Returns the
 * first reason the tool may not run, or undefined. Called while planning and
 * again inside each write transaction with freshly loaded facts.
 */
export function toolBlocked(tool: ToolDefinition, input: AuthorityInput): AiErrorCategory | undefined {
  if (input.adapterMode === "off") return "ai_off";
  if (input.globalStop) return "global_stop";
  if (input.tenantMode === "off") return "tenant_off";
  if (input.capabilityMode === "off") return "capability_off";
  const writes = tool.sideEffect === "internal_write" || tool.sideEffect === "consequential" || tool.sideEffect === "external";
  if (writes && (input.tenantMode !== "execute" || input.capabilityMode !== "execute")) return "capability_off";
  if (tool.sideEffect === "external") return "capability_off"; // no external delivery through agents in this release
  if (tool.module && !input.entitledModules.includes(tool.module)) return "permission_denied";
  if (tool.permissions.some((permission) => !input.actorPermissions.includes(permission))) return "permission_denied";
  if (input.grantTools) {
    if (input.grantActive === false) return "authority_revoked";
    if (!input.grantTools.includes(tool.key)) return "permission_denied";
  }
  return undefined;
}

export function playbookBlocked(playbook: PlaybookDefinition, input: Omit<AuthorityInput, "grantTools" | "grantActive">): AiErrorCategory | undefined {
  if (input.adapterMode === "off") return "ai_off";
  if (input.globalStop) return "global_stop";
  if (input.tenantMode === "off") return "tenant_off";
  if (input.capabilityMode === "off") return "capability_off";
  if (playbook.writes && (input.tenantMode !== "execute" || input.capabilityMode !== "execute")) return "capability_off";
  if (playbook.module && !input.entitledModules.includes(playbook.module)) return "permission_denied";
  if (playbook.startPermissions.some((permission) => !input.actorPermissions.includes(permission))) return "permission_denied";
  return undefined;
}

/** The capability's effective mode: the narrower of the gym mode and the capability's own setting. */
export function effectiveCapabilityMode(tenantMode: AiTenantMode, capabilityMode: AiTenantMode | undefined, capability: AiCapabilityKey): AiTenantMode {
  const order: AiTenantMode[] = ["off", "prepare", "execute"];
  const own = capabilityMode ?? (PREPARE_ONLY_CAPABILITIES.has(capability) ? "prepare" : "execute");
  const narrower = order[Math.min(order.indexOf(tenantMode), order.indexOf(own))]!;
  return PREPARE_ONLY_CAPABILITIES.has(capability) && narrower === "execute" ? "prepare" : narrower;
}

// ---------------------------------------------------------------------------
// Playbook parameters, validated on the server before a grant is created.
// ---------------------------------------------------------------------------


const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PLAYBOOK_PARAMS = {
  renewal_followups: z.object({ bucket: z.enum(["expiring", "expired"]).default("expiring"), days: z.number().int().min(1).max(90).optional(), owner: z.enum(["me", "assigned"]).default("me") }).strict(),
  management_report: z.object({ from: isoDate, to: isoDate, includeExport: z.boolean().default(false) }).strict(),
  shift_handover: z.object({ date: isoDate.optional(), assigneeId: z.string().min(1).max(80).optional() }).strict(),
  cash_difference: z.object({ shiftId: z.string().min(1).max(120) }).strict(),
  sales_followups: z.object({ owner: z.enum(["me", "lead_owner"]).default("lead_owner") }).strict(),
  ops_triage: z.object({ description: z.string().trim().min(8).max(500), assetId: z.string().max(120).optional() }).strict(),
  class_finder: z.object({ memberId: z.string().min(1).max(120), timeOfDay: z.enum(["morning", "afternoon", "evening"]).optional(), book: z.boolean().default(false), occurrenceKey: z.string().max(200).optional() }).strict(),
} satisfies Record<AiPlaybookKey, z.ZodType>;

export type PlaybookParams<K extends AiPlaybookKey> = z.infer<(typeof PLAYBOOK_PARAMS)[K]>;

export function parsePlaybookParams(playbook: AiPlaybookKey, raw: unknown): { ok: true; params: Record<string, string | number | boolean> } | { ok: false } {
  const schema = PLAYBOOK_PARAMS[playbook] as z.ZodType;
  const parsed = schema.safeParse(raw ?? {});
  return parsed.success ? { ok: true, params: parsed.data as Record<string, string | number | boolean> } : { ok: false };
}
