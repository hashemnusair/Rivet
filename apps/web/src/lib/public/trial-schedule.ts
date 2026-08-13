import type { MarketplaceBranch } from "./experience-data";
import type { TrialScheduleDay, WeekdayKey } from "@/lib/domain/types";

const WEEKDAYS: WeekdayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function trialWeekday(date: string): WeekdayKey | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const parsed = new Date(`${date}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return undefined;
  return WEEKDAYS[parsed.getUTCDay()];
}

export interface TrialWindow {
  opensAt: string;
  closesAt: string;
}

export function trialWindowForDate(branch: MarketplaceBranch | undefined, date: string): TrialWindow | undefined {
  if (!branch) return undefined;
  const weekday = trialWeekday(date);
  if (!weekday) return undefined;
  const day = branch.trialSchedule?.[weekday] as (TrialScheduleDay & { slots?: string[] }) | undefined;
  if (day?.enabled && day.opensAt && day.closesAt) return { opensAt: day.opensAt, closesAt: day.closesAt };
  const legacySlots = [...(day?.slots ?? [])].sort();
  if (legacySlots.length === 0) return undefined;
  if (legacySlots.length > 1) return { opensAt: legacySlots[0]!, closesAt: legacySlots.at(-1)! };
  const opensAt = legacySlots[0]!;
  const [hour = 0, minute = 0] = opensAt.split(":").map(Number);
  const closingMinutes = Math.min(23 * 60 + 59, hour * 60 + minute + 60);
  return { opensAt, closesAt: `${String(Math.floor(closingMinutes / 60)).padStart(2, "0")}:${String(closingMinutes % 60).padStart(2, "0")}` };
}

export function isTimeInTrialWindow(branch: MarketplaceBranch | undefined, date: string, time: string): boolean {
  const window = trialWindowForDate(branch, date);
  return Boolean(window && time >= window.opensAt && time <= window.closesAt);
}
