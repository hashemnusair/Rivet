import { describe, expect, it } from "vitest";
import { classExclusion, classOptions, classTimeOfDay, memberClassSuggestions, usualClassTime, type ClassOptionFacts } from "./class-finder";

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

describe("member class suggestions", () => {
  it("learns the usual time only from three or more attended classes with a clear majority", () => {
    expect(usualClassTime([18 * 60, 19 * 60])).toBeUndefined();
    expect(usualClassTime([18 * 60, 19 * 60, 9 * 60])).toBe("evening");
    expect(usualClassTime([18 * 60, 9 * 60, 13 * 60])).toBeUndefined();
  });

  it("suggests only the member's own bookable classes with an open spot, soonest first", () => {
    const item = (id: string, minute: number, startsAt: string, extra: Partial<{ canBook: boolean; spotsRemaining: number; booking: unknown }> = {}) => ({ id, startMinuteLocal: minute, startsAt, canBook: true, spotsRemaining: 3, ...extra });
    const list = [
      item("late", 18 * 60, "2026-10-24T15:00:00.000Z"),
      item("soon", 18 * 60, "2026-10-23T15:00:00.000Z"),
      item("full", 18 * 60, "2026-10-23T16:00:00.000Z", { spotsRemaining: 0 }),
      item("blocked", 18 * 60, "2026-10-23T17:00:00.000Z", { canBook: false }),
      item("mine", 18 * 60, "2026-10-23T14:00:00.000Z", { booking: { status: "booked" } }),
      item("morning", 9 * 60, "2026-10-23T06:00:00.000Z"),
    ];
    expect(memberClassSuggestions(list, "evening").map((entry) => entry.id)).toEqual(["soon", "late"]);
    expect(memberClassSuggestions(list, undefined).map((entry) => entry.id)).toEqual(["morning", "soon", "late"]);
  });
});
