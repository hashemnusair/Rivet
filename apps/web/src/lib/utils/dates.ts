/**
 * Date/time helpers. Storage is UTC ISO; display is tenant-local
 * (Asia/Amman for the demo tenant). All "today"-style logic goes through
 * timezone-aware day boundaries.
 */

export const TENANT_TIMEZONE = "Asia/Amman";

export function nowISO(): string {
  return new Date().toISOString();
}

export function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISODate(tz: string = TENANT_TIMEZONE, now: Date = new Date()): string {
  return partsInTimeZone(now, tz).date;
}

interface TzParts {
  date: string; // YYYY-MM-DD in tz
  time: string; // HH:mm:ss in tz
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function dtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function partsInTimeZone(date: Date, tz: string = TENANT_TIMEZONE): TzParts {
  const parts = dtf(tz).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const second = Number(get("second"));
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}:${pad(second)}`,
    year,
    month,
    day,
    hour,
    minute,
    second,
  };
}

/** Offset of `tz` from UTC in minutes at the given instant. */
export function timeZoneOffsetMinutes(tz: string, at: Date): number {
  const p = partsInTimeZone(at, tz);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - at.getTime()) / 60_000);
}

/** UTC instant of local midnight for the given YYYY-MM-DD in `tz`. */
export function startOfDayInTz(date: string, tz: string = TENANT_TIMEZONE): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = timeZoneOffsetMinutes(tz, new Date(guess));
  return new Date(guess - offset * 60_000);
}

export function endOfDayInTz(date: string, tz: string = TENANT_TIMEZONE): Date {
  return new Date(startOfDayInTz(addDays(date, 1), tz).getTime() - 1);
}

/** Convert a tenant-local form date/time into its UTC storage instant. */
export function localDateTimeToISO(date: string, time: string, tz: string = TENANT_TIMEZONE): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const [hour, minute, second = 0] = time.split(":").map(Number) as [number, number, number?];
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = wallClock;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = wallClock - timeZoneOffsetMinutes(tz, new Date(instant)) * 60_000;
    if (next === instant) break;
    instant = next;
  }
  return new Date(instant).toISOString();
}

export function instantFallsInTenantDateRange(
  value: string | number | Date,
  timezone: string,
  from?: string,
  to?: string,
): boolean {
  const date = todayISODate(timezone, value instanceof Date ? value : new Date(value));
  return (!from || date >= from) && (!to || date <= to);
}

/** Add days to a YYYY-MM-DD date, staying in calendar space. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d + days);
  return toISODate(new Date(t));
}

/** Whole days between two YYYY-MM-DD dates (b - a). */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number) as [number, number, number];
  const [by, bm, bd] = b.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TENANT_TIMEZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateShortFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TENANT_TIMEZONE,
  day: "numeric",
  month: "short",
});

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TENANT_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TENANT_TIMEZONE,
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const weekdayFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TENANT_TIMEZONE,
  weekday: "short",
});

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  return dateFmt.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
}

export function formatDateShort(iso: string | undefined | null): string {
  if (!iso) return "—";
  return dateShortFmt.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
}

export function formatWeekday(iso: string): string {
  return weekdayFmt.format(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso));
}

export function formatTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  return timeFmt.format(new Date(iso));
}

export function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  return dateTimeFmt.format(new Date(iso));
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "in 3 days" / "2 hours ago" style relative labels. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diffMs = then - now.getTime();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(diffMs / 60_000);
  const hours = Math.round(diffMs / 3_600_000);
  const days = Math.round(diffMs / 86_400_000);
  if (abs < 60_000) return "just now";
  if (abs < 3_600_000) return rtf.format(minutes, "minute");
  if (abs < 86_400_000) return rtf.format(hours, "hour");
  if (abs < 30 * 86_400_000) return rtf.format(days, "day");
  return formatDate(iso);
}

/** Days from today (tenant tz) until the given YYYY-MM-DD date. Negative = past. */
export function daysFromToday(date: string, tz: string = TENANT_TIMEZONE, now: Date = new Date()): number {
  return diffDays(todayISODate(tz, now), date);
}
