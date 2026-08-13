import { describe, expect, it } from "vitest";
import { isTimeInTrialWindow, trialWeekday, trialWindowForDate } from "./trial-schedule";
import type { MarketplaceBranch } from "./experience-data";
import type { WeekdayKey } from "@/lib/domain/types";

const days = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, { enabled: day === "sun", opensAt: "09:00", closesAt: "18:00" }])) as Record<WeekdayKey, { enabled: boolean; opensAt: string; closesAt: string }>;
const branch: MarketplaceBranch = { id: "branch", name: "Main", area: "Amman", address: "Amman", trialSlots: ["legacy"], trialSchedule: days };

describe("public trial schedule", () => {
  it("maps ISO calendar dates to stable weekday keys", () => {
    expect(trialWeekday("2026-08-16")).toBe("sun");
    expect(trialWeekday("2026-08-17")).toBe("mon");
    expect(trialWeekday("not-a-date")).toBeUndefined();
  });

  it("returns the selected weekday's persisted request window", () => {
    expect(trialWindowForDate(branch, "2026-08-16")).toEqual({ opensAt: "09:00", closesAt: "18:00" });
    expect(trialWindowForDate(branch, "2026-08-17")).toBeUndefined();
  });

  it("accepts any time inside the configured window", () => {
    expect(isTimeInTrialWindow(branch, "2026-08-16", "13:45")).toBe(true);
    expect(isTimeInTrialWindow(branch, "2026-08-16", "18:15")).toBe(false);
  });

  it("keeps the previously deployed exact-slot shape readable during rollout", () => {
    const legacyDays = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, { slots: day === "sun" ? ["09:00", "18:00"] : [] }]));
    const legacyBranch = { ...branch, trialSchedule: legacyDays } as unknown as MarketplaceBranch;
    expect(trialWindowForDate(legacyBranch, "2026-08-16")).toEqual({ opensAt: "09:00", closesAt: "18:00" });
  });
});
