export interface LeadProgressEvent {
  type?: string;
  meta?: Record<string, unknown>;
}

export interface LeadProgressOffer {
  status?: string;
}

export interface LeadProgressInput {
  stage?: string;
  lostReason?: string;
  convertedMemberId?: string;
  activities?: readonly LeadProgressEvent[];
  offers?: readonly LeadProgressOffer[];
  trialBooking?: { status?: string };
}

export interface LeadProgressFacts {
  hasLeadRecord: boolean;
  hasAttempt: boolean;
  hasContact: boolean;
  hasTrialBooking: boolean;
  hasTrialCompletion: boolean;
  hasTrialNoShow: boolean;
  hasTrialCancellation: boolean;
  hasOfferDelivery: boolean;
  hasOfferAcceptance: boolean;
  hasOfferDecline: boolean;
  hasConversion: boolean;
  hasLoss: boolean;
}

export function leadProgressStageCompleted(facts: LeadProgressFacts, stage: string): boolean {
  switch (stage) {
    case "new": return facts.hasLeadRecord;
    case "attempted": return facts.hasAttempt;
    case "contacted": return facts.hasContact;
    case "trial_booked": return facts.hasTrialBooking;
    case "trial_completed": return facts.hasTrialCompletion;
    case "offer_sent": return facts.hasOfferDelivery;
    case "won": return facts.hasConversion;
    case "lost": return facts.hasLoss;
    default: return false;
  }
}

const CONTACTED_OUTCOMES = new Set([
  "answered_interested",
  "answered_call_back",
  "answered_not_interested",
  "whatsapp_sent",
  "whatsapp_opened",
  "trial_booked",
  "trial_completed",
]);

export function deriveLeadProgressFacts(input: LeadProgressInput): LeadProgressFacts {
  const events = input.activities ?? [];
  const outcomes = new Set(
    events.flatMap((event) => typeof event.meta?.outcome === "string" ? [event.meta.outcome] : []),
  );
  const hasTrialBooking = Boolean(input.trialBooking)
    || events.some((event) => ["trial_confirmed", "trial_completed", "trial_no_show", "trial_cancelled"].includes(event.type ?? ""))
    || outcomes.has("trial_booked")
    || outcomes.has("trial_completed");
  const hasTrialCompletion = input.trialBooking?.status === "completed"
    || input.trialBooking?.status === "converted"
    || events.some((event) => event.type === "trial_completed")
    || outcomes.has("trial_completed");
  const hasOfferDelivery = (input.offers ?? []).some((offer) => offer.status !== "draft")
    || events.some((event) => ["offer_sent", "offer_accepted", "offer_declined"].includes(event.type ?? ""));

  return {
    hasLeadRecord: true,
    hasAttempt: events.some((event) => event.type === "call_attempt"),
    hasContact: events.some((event) => event.type === "call_attempt" && typeof event.meta?.outcome === "string" && CONTACTED_OUTCOMES.has(event.meta.outcome)),
    hasTrialBooking,
    hasTrialCompletion,
    hasTrialNoShow: input.trialBooking?.status === "no_show" || events.some((event) => event.type === "trial_no_show"),
    hasTrialCancellation: input.trialBooking?.status === "cancelled" || events.some((event) => event.type === "trial_cancelled"),
    hasOfferDelivery,
    hasOfferAcceptance: (input.offers ?? []).some((offer) => offer.status === "accepted") || events.some((event) => event.type === "offer_accepted"),
    hasOfferDecline: (input.offers ?? []).some((offer) => offer.status === "declined") || events.some((event) => event.type === "offer_declined"),
    hasConversion: Boolean(input.convertedMemberId) || events.some((event) => event.type === "lead_converted"),
    hasLoss: input.stage === "lost" || Boolean(input.lostReason?.trim()),
  };
}
