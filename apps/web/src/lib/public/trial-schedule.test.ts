import { describe, expect, it } from "vitest";
import { trialSlotsForDate, trialWeekday } from "./trial-schedule";
import type { MarketplaceBranch } from "./experience-data";
import type { WeekdayKey } from "@/lib/domain/types";

const days = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, { slots: day === "sun" ? ["09:00", "18:00"] : [] }])) as Record<WeekdayKey, { slots: string[] }>;
const branch: MarketplaceBranch = { id: "branch", name: "Main", area: "Amman", address: "Amman", trialSlots: ["legacy"], trialSchedule: days };

describe("public trial schedule", () => {
  it("maps ISO calendar dates to stable weekday keys", () => {
    expect(trialWeekday("2026-08-16")).toBe("sun");
    expect(trialWeekday("2026-08-17")).toBe("mon");
    expect(trialWeekday("not-a-date")).toBeUndefined();
  });

  it("returns only the selected weekday's persisted times", () => {
    expect(trialSlotsForDate(branch, "2026-08-16")).toEqual(["09:00", "18:00"]);
    expect(trialSlotsForDate(branch, "2026-08-17")).toEqual([]);
  });

  it("uses static trial slots only for explicit mock branches", () => {
    expect(trialSlotsForDate({ ...branch, trialSchedule: undefined, trialSlots: ["08:00"] }, "2026-08-17")).toEqual(["08:00"]);
  });
});
