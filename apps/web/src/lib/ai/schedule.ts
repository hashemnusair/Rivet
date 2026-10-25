import { stableHash } from "./note-extraction";

/**
 * Standing-instruction scheduling, shared by Convex and the preview adapter.
 * Slots are wall-clock times in the gym's timezone; 0 = Sunday … 6 = Saturday.
 */
export function nextStandingSlot(schedule: { weekdays: number[]; time: string }, timezone: string, after: number): number | undefined {
  if (!schedule.weekdays.length || !/^\d{2}:\d{2}$/.test(schedule.time)) return undefined;
  const [hour, minute] = schedule.time.split(":").map(Number) as [number, number];
  for (let offset = 0; offset <= 7; offset += 1) {
    const day = new Date(after + offset * 86_400_000);
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(day);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
    if (!schedule.weekdays.includes(weekday)) continue;
    const wall = Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")), hour, minute);
    // Convert the gym's wall clock to an instant using the zone offset at that moment.
    const offsetParts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(wall));
    const value = (type: string) => Number(offsetParts.find((part) => part.type === type)?.value ?? 0);
    const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"));
    const instant = wall - (asUtc - wall);
    if (instant > after) return instant;
  }
  return undefined;
}


/** Stable digest of a preview, so a standing instruction is enabled against what the person saw. */
export function previewDigest(subjects: Array<{ id: string; decision: string }>): string {
  return stableHash(subjects.map((subject) => `${subject.id}:${subject.decision}`).sort().join("|"));
}
