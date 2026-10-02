import type { LeadSource, LeadStage, RetentionRiskKind, RetentionRiskReason, TodayQueuePriority } from "@/lib/domain/types";
import type { ContactOutcome } from "@/lib/crm/contact-outcomes";
import type { TFunction, TKey } from "@/lib/i18n/provider";

const CONTACT_OUTCOME_KEYS = {
  no_answer: "memberProfile.contact.outcome.no_answer",
  answered_interested: "memberProfile.contact.outcome.answered_interested",
  answered_not_interested: "memberProfile.contact.outcome.answered_not_interested",
  answered_call_back: "memberProfile.contact.outcome.answered_call_back",
  wrong_number: "memberProfile.contact.outcome.wrong_number",
  whatsapp_sent: "memberProfile.contact.outcome.whatsapp_sent",
  whatsapp_opened: "memberProfile.contact.outcome.whatsapp_opened",
  trial_booked: "memberProfile.contact.outcome.trial_booked",
  trial_completed: "memberProfile.contact.outcome.trial_completed",
} satisfies Record<ContactOutcome, TKey>;

const LEAD_SOURCE_KEYS = {
  instagram: "domain.leadSource.instagram",
  walk_in: "domain.leadSource.walk_in",
  referral: "domain.leadSource.referral",
  whatsapp: "domain.leadSource.whatsapp",
  google: "domain.leadSource.google",
  phone_call: "domain.leadSource.phone_call",
  other: "domain.leadSource.other",
} satisfies Record<LeadSource, TKey>;

export const LEAD_SOURCE_OPTIONS = Object.entries(LEAD_SOURCE_KEYS).map(([value, labelKey]) => ({
  value: value as LeadSource,
  labelKey,
}));

const LEAD_STAGE_KEYS = {
  new: "domain.leadStage.new",
  attempted: "domain.leadStage.attempted",
  contacted: "domain.leadStage.contacted",
  trial_booked: "domain.leadStage.trial_booked",
  trial_completed: "domain.leadStage.trial_completed",
  offer_sent: "domain.leadStage.offer_sent",
  won: "domain.leadStage.won",
  lost: "domain.leadStage.lost",
} satisfies Record<LeadStage, TKey>;

const RISK_KIND_KEYS = {
  inactive: "crmCompletion.queues.riskReason.inactive",
  expiring: "crmCompletion.queues.riskReason.expiring",
  expired: "crmCompletion.queues.riskReason.expired",
} satisfies Record<RetentionRiskKind, TKey>;

const RISK_PRIORITY_KEYS = {
  urgent: "crmCompletion.queues.riskPriority.urgent",
  high: "crmCompletion.queues.riskPriority.high",
  normal: "crmCompletion.queues.riskPriority.normal",
} satisfies Record<TodayQueuePriority, TKey>;

export function contactOutcomeLabel(t: TFunction, outcome?: string | null): string | undefined {
  if (!outcome) return undefined;
  return Object.hasOwn(CONTACT_OUTCOME_KEYS, outcome)
    ? t(CONTACT_OUTCOME_KEYS[outcome as ContactOutcome])
    : outcome;
}

export function leadSourceLabel(t: TFunction, source: string): string {
  return Object.hasOwn(LEAD_SOURCE_KEYS, source)
    ? t(LEAD_SOURCE_KEYS[source as LeadSource])
    : source;
}

export function leadStageLabel(t: TFunction, stage: string): string {
  return Object.hasOwn(LEAD_STAGE_KEYS, stage)
    ? t(LEAD_STAGE_KEYS[stage as LeadStage])
    : stage;
}

export function retentionReasonLabel(t: TFunction, reason: string | RetentionRiskReason, hasLastVisit = true): string {
  const risk = typeof reason === "string" ? undefined : reason;
  const kind = risk?.kind ?? reason as string;
  if (risk) {
    if (kind === "inactive" && typeof risk.daysInactive === "number") {
      return t(hasLastVisit ? "crmCompletion.queues.riskReason.inactiveDays" : "crmCompletion.queues.riskReason.noFirstVisitDays", { count: risk.daysInactive });
    }
    if (kind === "expiring" && typeof risk.daysUntilExpiry === "number") {
      return t("crmCompletion.queues.riskReason.expiringDays", { count: risk.daysUntilExpiry });
    }
    if (kind === "expired" && typeof risk.daysSinceExpiry === "number") {
      return t("crmCompletion.queues.riskReason.expiredDays", { count: risk.daysSinceExpiry });
    }
  }
  return Object.hasOwn(RISK_KIND_KEYS, kind)
    ? t(RISK_KIND_KEYS[kind as RetentionRiskKind])
    : kind;
}

export function riskPriorityLabel(t: TFunction, priority: string): string {
  return Object.hasOwn(RISK_PRIORITY_KEYS, priority)
    ? t(RISK_PRIORITY_KEYS[priority as TodayQueuePriority])
    : priority;
}
