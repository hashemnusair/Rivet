import { describe, expect, it } from "vitest";
import { deriveLeadProgressFacts } from "./lead-progression";
import { leadStatusKey } from "./lead-status";

const call = (outcome: string) => ({ type: "call_attempt", meta: { outcome } });

describe("one lead status from what happened", () => {
  it("ignores a stored stage the facts do not support", () => {
    // An old call outcome left the stage at "trial done" for a trial that never had a date.
    expect(leadStatusKey(deriveLeadProgressFacts({ stage: "trial_completed", activities: [call("trial_booked")] }))).toBe("trial_booked");
  });

  it("reads the furthest step that happened", () => {
    expect(leadStatusKey(deriveLeadProgressFacts({}))).toBe("new");
    expect(leadStatusKey(deriveLeadProgressFacts({ activities: [call("answered_call_back")] }))).toBe("contacted");
    expect(leadStatusKey(deriveLeadProgressFacts({ activities: [call("no_answer")] }), "no_answer")).toBe("no_answer");
    expect(leadStatusKey(deriveLeadProgressFacts({ trialBooking: { status: "confirmed" } }))).toBe("trial_booked");
    expect(leadStatusKey(deriveLeadProgressFacts({ trialBooking: { status: "completed" } }))).toBe("trial_done");
    expect(leadStatusKey(deriveLeadProgressFacts({ trialBooking: { status: "completed" }, offers: [{ status: "sent" }] }))).toBe("offer_sent");
    expect(leadStatusKey(deriveLeadProgressFacts({ trialBooking: { status: "no_show" }, activities: [call("answered_interested")] }))).toBe("contacted");
    expect(leadStatusKey(deriveLeadProgressFacts({ convertedMemberId: "member-1" }))).toBe("sold");
    expect(leadStatusKey(deriveLeadProgressFacts({ stage: "lost", lostReason: "Too far" }))).toBe("not_sold");
  });
});
