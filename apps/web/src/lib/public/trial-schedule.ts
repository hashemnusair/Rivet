import type { MarketplaceBranch } from "./experience-data";
import type { WeekdayKey } from "@/lib/domain/types";

const WEEKDAYS: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function trialWeekday(date: string): WeekdayKey | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return undefined;
  return WEEKDAYS[parsed.getUTCDay()];
}

export function trialSlotsForDate(branch: MarketplaceBranch | undefined, date: string): string[] {
  if (!branch) return [];
  const weekday = trialWeekday(date);
  if (!weekday) return [];
  if (branch.trialSchedule) return [...branch.trialSchedule[weekday].slots];
  // Static seed data is permitted only by the explicit mock adapter.
  return [...branch.trialSlots];
}
