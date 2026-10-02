import { describe, expect, it } from "vitest";
import { deriveLeadProgressFacts, leadProgressStageCompleted } from "./lead-progression";

const event = (type: string, outcome?: string) => ({
  type,
  ...(outcome ? { meta: { outcome } } : {}),
});

describe("deriveLeadProgressFacts", () => {
  it("uses persisted trial, offer, and conversion facts instead of ordinal stages", () => {
    const facts = deriveLeadProgressFacts({
      stage: "offer_sent",
      activities: [event("call_attempt", "answered_interested"), event("trial_confirmed"), event("trial_completed"), event("offer_sent")],
      offers: [{ status: "sent" }],
      trialBooking: { status: "completed" },
    });

    expect(facts).toEqual({
      hasLeadRecord: true,
      hasAttempt: true,
      hasContact: true,
      hasTrialBooking: true,
      hasTrialCompletion: true,
      hasTrialNoShow: false,
      hasTrialCancellation: false,
      hasOfferDelivery: true,
      hasOfferAcceptance: false,
      hasOfferDecline: false,
      hasConversion: false,
      hasLoss: false,
    });
  });

  it("keeps no-show and cancellation outcomes distinct from completion", () => {
    const noShow = deriveLeadProgressFacts({ stage: "contacted", trialBooking: { status: "no_show" }, activities: [event("trial_no_show")] });
    const cancelled = deriveLeadProgressFacts({ stage: "lost", lostReason: "Trial cancelled", trialBooking: { status: "cancelled" }, activities: [event("trial_cancelled")] });

    expect(noShow).toMatchObject({ hasTrialBooking: true, hasTrialCompletion: false, hasTrialNoShow: true, hasTrialCancellation: false, hasLoss: false });
    expect(cancelled).toMatchObject({ hasTrialBooking: true, hasTrialCompletion: false, hasTrialNoShow: false, hasTrialCancellation: true, hasLoss: true });
  });

  it("recognizes manual delivery and accepted or declined offer outcomes", () => {
    const accepted = deriveLeadProgressFacts({ offers: [{ status: "accepted" }] });
    const declined = deriveLeadProgressFacts({ activities: [event("offer_declined")] });

    expect(accepted).toMatchObject({ hasOfferDelivery: true, hasOfferAcceptance: true, hasOfferDecline: false });
    expect(declined).toMatchObject({ hasOfferDelivery: true, hasOfferAcceptance: false, hasOfferDecline: true });
  });

  it("requires a conversion fact for won and accepts an explicit loss record", () => {
    const ordinalOnly = deriveLeadProgressFacts({ stage: "won" });
    const converted = deriveLeadProgressFacts({ stage: "won", convertedMemberId: "member-1", activities: [event("lead_converted")] });
    const lost = deriveLeadProgressFacts({ stage: "lost", lostReason: "Could not reach" });

    expect(ordinalOnly).toMatchObject({ hasConversion: false, hasLoss: false });
    expect(converted).toMatchObject({ hasConversion: true });
    expect(lost).toMatchObject({ hasLoss: true });
    expect(leadProgressStageCompleted(ordinalOnly, "won")).toBe(false);
    expect(leadProgressStageCompleted(converted, "won")).toBe(true);
  });
});
