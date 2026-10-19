import type { TFunction, TKey } from "@/lib/i18n/provider";
import { PROSPECT_FIELD_ERRORS, type ProspectBatch, type ProspectDraftStatus, type ProspectEvidence, type ProspectField, type ProspectFieldError, type ProspectStage, type ProspectStageGroup } from "@/lib/platform/prospects";

type BadgeTone = "neutral" | "outline" | "success" | "warning" | "danger" | "ink";

export const STAGE_COPY: Record<ProspectStage, { labelKey: TKey; tone: BadgeTone }> = {
  not_contacted: { labelKey: "platformConsole.prospects.stage.notContacted", tone: "outline" },
  contacted: { labelKey: "platformConsole.prospects.stage.contacted", tone: "neutral" },
  replied: { labelKey: "platformConsole.prospects.stage.replied", tone: "neutral" },
  demo_scheduled: { labelKey: "platformConsole.prospects.stage.demoScheduled", tone: "warning" },
  pilot_agreed: { labelKey: "platformConsole.prospects.stage.pilotAgreed", tone: "success" },
  pilot_active: { labelKey: "platformConsole.prospects.stage.pilotActive", tone: "success" },
  paid: { labelKey: "platformConsole.prospects.stage.paid", tone: "ink" },
  not_interested: { labelKey: "platformConsole.prospects.stage.notInterested", tone: "neutral" },
  on_hold: { labelKey: "platformConsole.prospects.stage.onHold", tone: "neutral" },
};

export const NEXT_STEP_KEYS: Partial<Record<ProspectStage, TKey>> = {
  contacted: "platformConsole.prospects.nextStep.contacted",
  replied: "platformConsole.prospects.nextStep.replied",
  demo_scheduled: "platformConsole.prospects.nextStep.demoScheduled",
  pilot_agreed: "platformConsole.prospects.nextStep.pilotAgreed",
  pilot_active: "platformConsole.prospects.nextStep.pilotActive",
  paid: "platformConsole.prospects.nextStep.paid",
};

export const BATCH_KEYS: Record<ProspectBatch, TKey> = {
  selected: "platformConsole.prospects.batch.selected",
  reserve: "platformConsole.prospects.batch.reserve",
  hold: "platformConsole.prospects.batch.hold",
};

export const DRAFT_STATUS_COPY: Record<ProspectDraftStatus, { labelKey: TKey; tone: BadgeTone }> = {
  needs_review: { labelKey: "platformConsole.prospects.draftStatus.needsReview", tone: "warning" },
  approved: { labelKey: "platformConsole.prospects.draftStatus.approved", tone: "success" },
  needs_revision: { labelKey: "platformConsole.prospects.draftStatus.needsRevision", tone: "danger" },
  sent: { labelKey: "platformConsole.prospects.draftStatus.sent", tone: "neutral" },
};

export const EVIDENCE_COPY: Record<ProspectEvidence, { labelKey: TKey; tone: BadgeTone }> = {
  official: { labelKey: "platformConsole.prospects.evidence.official", tone: "success" },
  corroborated: { labelKey: "platformConsole.prospects.evidence.corroborated", tone: "neutral" },
  recheck: { labelKey: "platformConsole.prospects.evidence.recheck", tone: "warning" },
};

/** The open gym is split into these few tabs, so each one fits on screen. */
export const PROSPECT_TABS = ["progress", "contact", "messages", "history"] as const;
export type ProspectTab = (typeof PROSPECT_TABS)[number];

export const TAB_KEYS: Record<ProspectTab, TKey> = {
  progress: "platformConsole.prospects.detail.progress",
  contact: "platformConsole.prospects.detail.contact",
  messages: "platformConsole.prospects.detail.messages",
  history: "platformConsole.prospects.detail.history",
};

export type ProspectFilter = "all" | ProspectStageGroup | "due";

export const FILTERS: Array<{ value: ProspectFilter; labelKey: TKey }> = [
  { value: "all", labelKey: "platformConsole.prospects.filter.all" },
  { value: "to_contact", labelKey: "platformConsole.prospects.filter.toContact" },
  { value: "in_talks", labelKey: "platformConsole.prospects.filter.inTalks" },
  { value: "pilot", labelKey: "platformConsole.prospects.filter.pilot" },
  { value: "closed", labelKey: "platformConsole.prospects.filter.closed" },
  { value: "due", labelKey: "platformConsole.prospects.filter.due" },
];

export const FIELD_KEYS: Record<ProspectField, TKey> = {
  gymName: "platformConsole.prospects.field.gymName",
  area: "platformConsole.prospects.field.area",
  batch: "platformConsole.prospects.field.batch",
  stage: "platformConsole.prospects.field.stage",
  ownerId: "platformConsole.prospects.field.ownerId",
  nextAction: "platformConsole.prospects.field.nextAction",
  followUpOn: "platformConsole.prospects.field.followUpOn",
  notes: "platformConsole.prospects.field.notes",
  route: "platformConsole.prospects.field.route",
  phone: "platformConsole.prospects.field.phone",
  whatsapp: "platformConsole.prospects.field.whatsapp",
  instagram: "platformConsole.prospects.field.instagram",
  facebook: "platformConsole.prospects.field.facebook",
  email: "platformConsole.prospects.field.email",
  evidence: "platformConsole.prospects.field.evidence",
  checkedOn: "platformConsole.prospects.field.checkedOn",
  contactNotes: "platformConsole.prospects.field.contactNotes",
  sources: "platformConsole.prospects.field.sources",
  draftStatus: "platformConsole.prospects.field.draftStatus",
  openingMessage: "platformConsole.prospects.field.openingMessage",
  proposalMessage: "platformConsole.prospects.field.proposalMessage",
  draftNotes: "platformConsole.prospects.field.draftNotes",
};

const ERROR_KEYS: Record<ProspectFieldError, TKey> = {
  required: "platformConsole.prospects.errors.required",
  tooLong: "platformConsole.prospects.errors.tooLong",
  invalidPhone: "platformConsole.prospects.errors.invalidPhone",
  invalidUrl: "platformConsole.prospects.errors.invalidUrl",
  invalidEmail: "platformConsole.prospects.errors.invalidEmail",
  invalidDate: "platformConsole.prospects.errors.invalidDate",
  invalidChoice: "platformConsole.prospects.errors.invalidChoice",
  tooMany: "platformConsole.prospects.errors.tooMany",
  duplicate: "platformConsole.prospects.errors.duplicate",
  unknownOwner: "platformConsole.prospects.errors.unknownOwner",
};

/** Field error codes (from the shared rules or the server) in words. */
export function fieldErrorMessages(errors: Partial<Record<string, string | string[]>> | undefined, t: TFunction): Partial<Record<ProspectField, string>> {
  const out: Partial<Record<ProspectField, string>> = {};
  for (const [field, raw] of Object.entries(errors ?? {})) {
    const code = Array.isArray(raw) ? raw[0] : raw;
    if (field in FIELD_KEYS && code && (PROSPECT_FIELD_ERRORS as readonly string[]).includes(code)) out[field as ProspectField] = t(ERROR_KEYS[code as ProspectFieldError]);
  }
  return out;
}

/** Fields whose history line names the new value; long text only says it changed. */
export const SHORT_VALUE_FIELDS: ReadonlySet<ProspectField> = new Set(["gymName", "area", "batch", "stage", "ownerId", "nextAction", "followUpOn", "route", "phone", "whatsapp", "email", "evidence", "checkedOn", "draftStatus"]);
