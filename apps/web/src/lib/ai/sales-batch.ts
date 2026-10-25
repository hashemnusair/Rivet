import type { AiExclusionReason } from "./contracts";
import { stableHash } from "./note-extraction";
import { systemMessage, type SystemMessage } from "../i18n/system-messages";

/**
 * Lead follow-up preparation shared by the Convex playbook and the preview
 * adapter. It works only from recorded facts: a lead is never described as
 * contacted, offered a price or given a discount by RIVET. Prepared work is a
 * call task with a draft in approved catalogue wording; a person makes the
 * call and records what happened.
 */

export const OPEN_LEAD_STAGES = ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent"] as const;

/** Hours after a recorded contact during which RIVET prepares no further call. */
export const LEAD_RECENT_CONTACT_HOURS = 24;

export interface LeadFollowUpFacts {
  leadId: string;
  leadName: string;
  stage: string;
  branchId?: string;
  ownerId?: string;
  phone?: string;
  nextFollowUpAt?: string;
  lastContactAt?: string;
  convertedMemberId?: string;
  /** The lead asked not to be contacted. */
  doNotContact?: boolean;
  openTasks: Array<{ id: string; title: string }>;
  draft?: { language: "en" | "ar"; text: string };
}

export type LeadDecision =
  | { decision: "exclude"; reason: AiExclusionReason }
  | { decision: "link"; taskId: string; taskTitle: string }
  | { decision: "create"; dueAt: string; priority: "high" | "normal" };

/** Due: an open lead whose follow-up date is today or earlier, or a new lead nobody has a date for yet. */
export function leadIsDue(lead: { stage: string; nextFollowUpAt?: string; convertedMemberId?: string }, endOfTodayIso: string): boolean {
  if (!(OPEN_LEAD_STAGES as readonly string[]).includes(lead.stage) || lead.convertedMemberId) return false;
  if (lead.nextFollowUpAt) return lead.nextFollowUpAt <= endOfTodayIso;
  return lead.stage === "new";
}

export function evaluateLeadCandidate(facts: LeadFollowUpFacts, context: { now: string }): LeadDecision {
  if (!(OPEN_LEAD_STAGES as readonly string[]).includes(facts.stage) || facts.convertedMemberId) return { decision: "exclude", reason: "lead_closed" };
  // Before anything else that would lead to a call, including linking open work.
  if (facts.doNotContact) return { decision: "exclude", reason: "opted_out" };
  if (!facts.phone?.trim()) return { decision: "exclude", reason: "no_phone" };
  if (facts.lastContactAt && Date.parse(context.now) - Date.parse(facts.lastContactAt) < LEAD_RECENT_CONTACT_HOURS * 3_600_000) return { decision: "exclude", reason: "lead_contacted_recently" };
  const open = facts.openTasks[0];
  if (open) return { decision: "link", taskId: open.id, taskTitle: open.title };
  const nowMs = Date.parse(context.now);
  const plannedMs = facts.nextFollowUpAt ? Date.parse(facts.nextFollowUpAt) : Number.NaN;
  // A date in the past becomes due within the hour; a later date today is kept as recorded.
  const dueMs = Number.isFinite(plannedMs) && plannedMs > nowMs ? plannedMs : nowMs + 3_600_000;
  const overdueDays = Number.isFinite(plannedMs) ? (nowMs - plannedMs) / 86_400_000 : 0;
  return { decision: "create", dueAt: new Date(dueMs).toISOString(), priority: overdueDays >= 2 ? "high" : "normal" };
}

/** One prepared call per lead and follow-up date: a second run links instead of duplicating. */
export function leadOperationKey(organizationId: string, leadId: string, nextFollowUpAt: string | undefined): string {
  return `lead-followup:${stableHash(`${organizationId}|${leadId}|${nextFollowUpAt ?? "none"}`)}`;
}

/** Stored in English like other system-created task titles; the descriptor beside it shows each reader their language. */
export function leadTaskTitle(leadName: string): string {
  return `Follow up with ${leadName}`;
}

export function leadTaskTitleMessage(leadName: string): SystemMessage {
  return systemMessage("communicationCompletion.tasks.leadFollowUp", { name: leadName });
}
