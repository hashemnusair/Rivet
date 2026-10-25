import { describe, expect, it } from "vitest";
import { classExclusion, classOptions, classTimeOfDay, type ClassOptionFacts } from "./class-finder";

const NOW = "2026-10-22T08:30:00.000Z";
const base: ClassOptionFacts = { occurrenceId: "occ:a:2026-10-23", name: "Spin", branchId: "b", branchName: "Main", date: "2026-10-23", startsAt: "2026-10-23T15:00:00.000Z", endsAt: "2026-10-23T16:00:00.000Z", startMinuteLocal: 18 * 60, audience: "mixed", status: "scheduled", capacity: 10, bookedCount: 4, memberBooked: false, memberEligible: true, audienceFits: true };

describe("class finder", () => {
  it("reads the local start as morning, afternoon or evening", () => {
    expect([classTimeOfDay(9 * 60), classTimeOfDay(13 * 60), classTimeOfDay(17 * 60)]).toEqual(["morning", "afternoon", "evening"]);
  });

  it("offers only classes with an open spot the member may take, and counts why the rest are hidden", () => {
    const facts = [
      base,
      { ...base, occurrenceId: "full", bookedCount: 10 },
      { ...base, occurrenceId: "plan", memberEligible: false },
      { ...base, occurrenceId: "women", audienceFits: false },
      { ...base, occurrenceId: "booked", memberBooked: true },
      { ...base, occurrenceId: "past", startsAt: "2026-10-22T06:00:00.000Z" },
      { ...base, occurrenceId: "morning", startMinuteLocal: 9 * 60, startsAt: "2026-10-23T06:00:00.000Z" },
    ];
    const result = classOptions(facts, { now: NOW });
    expect(result.options.map((option) => option.occurrenceId)).toEqual(["morning", "occ:a:2026-10-23"]);
    expect(result.options[1]).toMatchObject({ spotsLeft: 6, timeOfDay: "evening" });
    expect(result.excluded).toEqual({ full: 1, not_eligible: 1, audience: 1, already_booked: 1, started: 1 });
    expect(classOptions(facts, { now: NOW, timeOfDay: "morning" }).options.map((option) => option.occurrenceId)).toEqual(["morning"]);
  });

  it("treats a class that filled after listing as no longer bookable", () => {
    expect(classExclusion({ ...base, bookedCount: 10 }, NOW)).toBe("full");
    expect(classExclusion(base, NOW)).toBeUndefined();
  });
});
