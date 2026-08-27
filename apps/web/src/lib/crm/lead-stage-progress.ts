import type { LeadDetail, LeadStage } from "@/lib/domain/types";
import { deriveLeadProgressFacts, leadProgressStageCompleted, type LeadProgressFacts } from "./lead-progression";

export const LEAD_STAGE_PROGRESS: readonly LeadStage[] = [
  "new",
  "attempted",
  "contacted",
  "trial_booked",
  "trial_completed",
  "offer_sent",
  "won",
];

export type LeadStageProgressState = "completed" | "current" | "skipped" | "pending";

export interface LeadStageProgressItem {
  stage: LeadStage;
  state: LeadStageProgressState;
}

/**
 * Returns the facts-backed state for each pipeline milestone. A stage that is
 * merely earlier in the enum is not treated as completed: skipped trials and
 * unissued offers must remain visibly different from real history.
 */
export function leadStageProgress(lead: Pick<LeadDetail, "stage" | "convertedMemberId" | "lostReason" | "activities" | "offers" | "trialBooking"> & { progressFacts?: LeadProgressFacts }): LeadStageProgressItem[] {
  const derived = lead.progressFacts ?? deriveLeadProgressFacts(lead);
  const facts: Record<LeadStage, boolean> = {
    new: leadProgressStageCompleted(derived, "new"),
    attempted: leadProgressStageCompleted(derived, "attempted"),
    contacted: leadProgressStageCompleted(derived, "contacted"),
    trial_booked: leadProgressStageCompleted(derived, "trial_booked"),
    trial_completed: leadProgressStageCompleted(derived, "trial_completed"),
    offer_sent: leadProgressStageCompleted(derived, "offer_sent"),
    won: leadProgressStageCompleted(derived, "won"),
    lost: leadProgressStageCompleted(derived, "lost"),
  };

  const currentIndex = facts[lead.stage] ? LEAD_STAGE_PROGRESS.indexOf(lead.stage) : -1;
  return LEAD_STAGE_PROGRESS.map((stage, index) => {
    if (lead.stage === stage && facts[stage]) return { stage, state: "current" };
    if (facts[stage]) return { stage, state: "completed" };
    if (currentIndex >= 0 && index < currentIndex) return { stage, state: "skipped" };
    return { stage, state: "pending" };
  });
}
