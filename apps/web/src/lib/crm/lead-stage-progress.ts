import type { LeadDetail, LeadStage, TimelineEvent } from "@/lib/domain/types";

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

const CONTACTED_OUTCOMES = new Set([
  "answered_interested",
  "answered_call_back",
  "answered_not_interested",
  "whatsapp_sent",
  "trial_booked",
  "trial_completed",
]);

function eventOutcomes(events: TimelineEvent[]) {
  return new Set(
    events.flatMap((event) => {
      const outcome = event.meta?.outcome;
      return typeof outcome === "string" ? [outcome] : [];
    }),
  );
}

/**
 * Returns the facts-backed state for each pipeline milestone. A stage that is
 * merely earlier in the enum is not treated as completed: skipped trials and
 * unissued offers must remain visibly different from real history.
 */
export function leadStageProgress(lead: Pick<LeadDetail, "stage" | "convertedMemberId" | "activities" | "offers" | "trialBooking">): LeadStageProgressItem[] {
  const events = lead.activities ?? [];
  const outcomes = eventOutcomes(events);
  const hasCall = events.some((event) => event.type === "call_attempt");
  const hasContact = events.some((event) => event.type === "call_attempt" && typeof event.meta?.outcome === "string" && CONTACTED_OUTCOMES.has(event.meta.outcome));
  const hasTrialBooking = Boolean(lead.trialBooking) || events.some((event) => event.type === "trial_confirmed") || outcomes.has("trial_booked") || outcomes.has("trial_completed");
  const hasTrialCompletion = lead.trialBooking?.status === "completed" || lead.trialBooking?.status === "converted" || events.some((event) => event.type === "trial_completed") || outcomes.has("trial_completed");
  const hasOfferDelivery = lead.offers.some((offer) => offer.status !== "draft") || events.some((event) => event.type === "offer_sent");
  const facts: Record<LeadStage, boolean> = {
    new: true,
    attempted: hasCall,
    contacted: hasContact,
    trial_booked: hasTrialBooking,
    trial_completed: hasTrialCompletion,
    offer_sent: hasOfferDelivery,
    won: lead.stage === "won" || Boolean(lead.convertedMemberId) || events.some((event) => event.type === "lead_converted"),
    lost: lead.stage === "lost",
  };

  const currentIndex = LEAD_STAGE_PROGRESS.indexOf(lead.stage);
  return LEAD_STAGE_PROGRESS.map((stage, index) => {
    if (lead.stage === stage) return { stage, state: "current" };
    if (facts[stage]) return { stage, state: "completed" };
    if (currentIndex >= 0 && index < currentIndex) return { stage, state: "skipped" };
    return { stage, state: "pending" };
  });
}
