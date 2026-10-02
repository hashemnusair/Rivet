/** Shared by Convex, preview and all occupancy consumers. No identities leave this module's aggregate output. */
export interface AttendanceSettings {
  windowMinutes: number;
  capacity?: number;
  timezone: string;
  publicEnabled: boolean;
  feedMode: "reception" | "external" | "paused";
}
export interface AttendanceEvent {
  id: string;
  personId: string;
  occurredAt: number;
  kind: "entry" | "exit";
  accepted: boolean;
  source: string;
  windowMinutes?: number;
}
export interface PresenceWindow { personId: string; start: number; end: number }
export interface OccupancySnapshot {
  branchId: string;
  current: number | null;
  capacity: number | null;
  status: "quiet" | "moderate" | "busy" | "learning" | "unavailable";
  availability: "available" | "stale" | "unavailable";
  basis: "capacity" | "history" | "insufficient_history";
  generatedAt: number;
  validUntil: number;
  nextExpiryAt: number | null;
  timezone: string;
  checkInsToday: number;
  peakHour: string;
}
export interface AttendanceCell { weekday: number; hour: number; average: number; entries: number; days: number }
export interface AttendanceInsights {
  snapshot: OccupancySnapshot;
  date: string;
  entriesOnDate: number;
  curve: Array<{ at: number; label: string; occupancy: number; entries: number }>;
  cells: AttendanceCell[];
  observedDays: number;
  enoughHistory: boolean;
  peak: AttendanceCell | null;
  quiet: AttendanceCell | null;
}
const MINUTE = 60_000;
const DAY = 86_400_000;
export const DEFAULT_WINDOW_MINUTES = 90;
export function attendanceSettings(value?: Partial<AttendanceSettings>, timezone = "Asia/Amman", capacity?: number): AttendanceSettings {
  return { windowMinutes: value?.windowMinutes ?? 90, timezone: value?.timezone ?? timezone, capacity: value ? value.capacity : capacity, publicEnabled: value?.publicEnabled ?? false, feedMode: value?.feedMode ?? "reception" };
}
/** Legacy decisions are normalized here; a denied scan is never a presence fact. */
export function checkInEvent(row: { id: string; memberId: string; occurredAt: string; decision: string; attendanceWindowMinutes?: number; attendanceSource?: string }): AttendanceEvent {
  return { id: row.id, personId: row.memberId, occurredAt: Date.parse(row.occurredAt), kind: "entry", accepted: ["allowed", "warning", "overridden"].includes(row.decision), source: row.attendanceSource ?? "reception", windowMinutes: row.attendanceWindowMinutes ?? 90 };
}
/** Stable event-time ordering handles delayed delivery. A scan during an open window never extends it. */
export function presenceWindows(events: AttendanceEvent[], now: number): PresenceWindow[] {
  const seen = new Set<string>();
  const active = new Map<string, PresenceWindow>();
  const windows: PresenceWindow[] = [];
  for (const event of [...events].sort((a, b) => a.occurredAt - b.occurredAt || (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === "exit" ? -1 : 1))) {
    const eventKey = JSON.stringify([event.source, event.id]);
    if (!event.accepted || !event.personId || !Number.isFinite(event.occurredAt) || event.occurredAt > now || seen.has(eventKey)) continue;
    seen.add(eventKey);
    const previous = active.get(event.personId);
    if (event.kind === "exit") {
      if (previous && event.occurredAt >= previous.start) previous.end = Math.min(previous.end, event.occurredAt);
      active.delete(event.personId);
    } else if (!previous || previous.end <= event.occurredAt) {
      const window = { personId: event.personId, start: event.occurredAt, end: event.occurredAt + (event.windowMinutes ?? 90) * MINUTE };
      windows.push(window);
      active.set(event.personId, window);
    }
  }
  return windows;
}
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const timeFormatters = new Map<string, Intl.DateTimeFormat>();
export function localDate(at: number, timezone: string): string {
  let format = dateFormatters.get(timezone);
  if (!format) { format = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }); dateFormatters.set(timezone, format); }
  return format.format(at);
}
function clock(at: number, timezone: string) {
  let format = timeFormatters.get(timezone);
  if (!format) { format = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); timeFormatters.set(timezone, format); }
  const parts = format.format(at);
  return { label: parts, hour: Number(parts.slice(0, 2)) };
}
/** Samples actual UTC instants, so missing/repeated DST hours are not invented. */
export function attendanceInsights(input: { branchId: string; settings: AttendanceSettings; events: AttendanceEvent[]; now: number; date?: string; feedHeartbeatAt?: number; truncated?: boolean }): AttendanceInsights {
  const { now, settings, events, branchId } = input;
  const timezone = settings.timezone;
  const date = input.date ?? localDate(now, timezone);
  const windows = presenceWindows(events, now);
  const current = windows.filter((w) => w.start <= now && w.end > now);
  const start = now - 28 * DAY;
  const first = Math.max(start, Math.min(now, ...windows.map((w) => w.start)));
  const today = localDate(now, timezone);
  const firstDate = localDate(first, timezone);
  const dates = new Set<string>();
  const curve: AttendanceInsights["curve"] = [];
  const samples = new Map<string, { total: number; samples: number; entries: number; dates: Set<string> }>();
  // Sweep intervals rather than scanning every event for every sample.
  const starts = windows.map((w) => w.start).sort((a, b) => a - b);
  const ends = windows.map((w) => w.end).sort((a, b) => a - b);
  let si = 0; let ei = 0; let count = 0;
  const entryByCell = new Map<string, number>();
  for (const w of windows) {
    if (w.start < first) continue;
    const d = localDate(w.start, timezone);
    if (d === firstDate || d === today) continue;
    const weekday = new Date(`${d}T12:00:00Z`).getUTCDay();
    const key = `${weekday}:${clock(w.start, timezone).hour}`;
    entryByCell.set(key, (entryByCell.get(key) ?? 0) + 1);
  }
  for (let at = Math.floor(first / (15 * MINUTE)) * 15 * MINUTE; at <= now; at += 15 * MINUTE) {
    let entries = 0;
    while (si < starts.length && starts[si]! <= at) { if (starts[si]! > at - 15 * MINUTE) entries++; count++; si++; }
    while (ei < ends.length && ends[ei]! <= at) { count--; ei++; }
    const d = localDate(at, timezone);
    const c = clock(at, timezone);
    if (d === date) curve.push({ at, label: c.label, occupancy: count, entries });
    // Exclude first partial and current days from typical-time learning.
    if (d === firstDate || d === today) continue;
    dates.add(d);
    const key = `${new Date(`${d}T12:00:00Z`).getUTCDay()}:${c.hour}`;
    const cell = samples.get(key) ?? { total: 0, samples: 0, entries: 0, dates: new Set<string>() };
    cell.total += count; cell.samples++; cell.dates.add(d); samples.set(key, cell);
  }
  const cells = [...samples].map(([key, cell]) => { const [weekday, hour] = key.split(":").map(Number); return { weekday: weekday!, hour: hour!, average: Math.round(cell.total / cell.samples * 10) / 10, entries: entryByCell.get(key) ?? 0, days: cell.dates.size }; });
  const enoughHistory = dates.size >= 7 && windows.filter((w) => w.start >= first).length >= 20 && !input.truncated;
  // Without an opening-hours integration, suggest only hours with recorded entry activity.
  const candidates = enoughHistory ? cells.filter((c) => c.entries > 0 && c.days >= 2) : [];
  const ordered = [...candidates].sort((a, b) => a.average - b.average || a.weekday - b.weekday || a.hour - b.hour);
  const historyValues = cells.filter((c) => c.average > 0).map((c) => c.average).sort((a, b) => a - b);
  const capacity = settings.capacity && settings.capacity > 0 ? settings.capacity : null;
  const basis = capacity ? "capacity" : enoughHistory && historyValues.length ? "history" : "insufficient_history";
  const healthy = settings.feedMode !== "paused" && !input.truncated;
  const stale = settings.feedMode === "external" && (!input.feedHeartbeatAt || now - input.feedHeartbeatAt > 120_000);
  const availability = !healthy ? "unavailable" : stale ? "stale" : "available";
  const headcount = new Set(current.map((w) => w.personId)).size;
  const quietThreshold = capacity ? capacity * 0.35 : historyValues[Math.floor(historyValues.length * 0.35)] ?? 0;
  const busyThreshold = capacity ? capacity * 0.7 : historyValues[Math.floor(historyValues.length * 0.8)] ?? 0;
  const todayWindows = windows.filter((w) => localDate(w.start, timezone) === today);
  const entryHours = new Map<number, number>();
  todayWindows.forEach((w) => { const h = clock(w.start, timezone).hour; entryHours.set(h, (entryHours.get(h) ?? 0) + 1); });
  const peakHour = [...entryHours].sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    snapshot: { branchId, current: availability === "available" ? headcount : null, capacity, availability, status: availability !== "available" ? "unavailable" : basis === "insufficient_history" ? "learning" : headcount < quietThreshold || headcount === 0 ? "quiet" : headcount < busyThreshold ? "moderate" : "busy", basis, generatedAt: now, validUntil: now + 45_000, nextExpiryAt: current.length ? Math.min(...current.map((w) => w.end)) : null, timezone, checkInsToday: todayWindows.length, peakHour: peakHour === undefined ? "—" : `${String(peakHour).padStart(2, "0")}:00` },
    date, entriesOnDate: input.truncated ? 0 : windows.filter(w => localDate(w.start, timezone) === date).length, curve: input.truncated ? [] : curve, cells: input.truncated ? [] : cells, observedDays: input.truncated ? 0 : dates.size, enoughHistory, peak: ordered.at(-1) ?? null, quiet: ordered[0] ?? null,
  };
}
