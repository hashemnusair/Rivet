import type { LeadProgressFacts } from "./lead-progression";

/**
 * One status per lead, read from what actually happened (calls, a trial
 * booking, offers, the sale), so the leads list and the lead page always say
 * the same thing. The stored stage is not used: an old call outcome could set
 * it to "trial done" for a trial that never had a date.
 */
export type LeadStatusKey = "sold" | "not_sold" | "offer_sent" | "trial_done" | "trial_booked" | "no_answer" | "contacted" | "new";

export function leadStatusKey(facts: LeadProgressFacts, lastContactOutcome?: string): LeadStatusKey {
  if (facts.hasConversion) return "sold";
  if (facts.hasLoss) return "not_sold";
  if (facts.hasOfferDelivery) return "offer_sent";
  if (facts.hasTrialCompletion) return "trial_done";
  if (facts.hasTrialBooking && !facts.hasTrialNoShow && !facts.hasTrialCancellation) return "trial_booked";
  if (facts.hasAttempt && lastContactOutcome === "no_answer") return "no_answer";
  if (facts.hasContact || facts.hasAttempt) return "contacted";
  return "new";
}

/** The catalogue label of each status (the lead-stage wording staff already know). */
export const LEAD_STATUS_LABEL_KEYS = {
  sold: "domain.leadStage.won",
  not_sold: "domain.leadStage.lost",
  offer_sent: "domain.leadStage.offer_sent",
  trial_done: "domain.leadStage.trial_completed",
  trial_booked: "domain.leadStage.trial_booked",
  no_answer: "domain.leadStage.attempted",
  contacted: "domain.leadStage.contacted",
  new: "domain.leadStage.new",
} as const satisfies Record<LeadStatusKey, string>;
