import { addDays, diffDays, partsInTimeZone } from "../utils/dates";
import { latinDigits } from "../utils/text";
import type { AiDateResolution } from "./contracts";

/**
 * Resolve dates written in a staff note ("call Monday evening", "بكرة
 * المسا", "back on 3/11") against the moment the note was written and the
 * gym's timezone. Deterministic: the same note, time and timezone always give
 * the same reading. When a phrase has two reasonable readings the primary
 * one is returned with `alternatives`, and the page asks the person to pick;
 * RIVET never silently chooses between them.
 */

export type TimeOfDay = "morning" | "afternoon" | "evening";

export const TIME_OF_DAY_CLOCK: Record<TimeOfDay, string> = { morning: "10:00", afternoon: "14:00", evening: "18:00" };

const WEEKDAYS_EN: Array<[RegExp, number]> = [
  [/\bsun(day)?\b/, 0],
  [/\bmon(day)?\b/, 1],
  [/\btue(s|sday)?\b/, 2],
  [/\bwed(nesday)?\b/, 3],
  [/\bthu(r|rs|rsday)?\b/, 4],
  [/\bfri(day)?\b/, 5],
  [/\bsat(urday)?\b/, 6],
];

// Arabic weekday names, with and without the definite article and common
// spoken spellings. Matched as substrings: Arabic has no \b word boundary.
const WEEKDAYS_AR: Array<[RegExp, number]> = [
  [/(الأحد|الاحد|احد\b)/u, 0],
  [/(الاثنين|الإثنين|الاتنين|التنين|اثنين)/u, 1],
  [/(الثلاثاء|الثلاثا|التلات|التلاتا)/u, 2],
  [/(الأربعاء|الاربعاء|الاربعا|الأربعا)/u, 3],
  [/(الخميس)/u, 4],
  [/(الجمعة|الجمعه)/u, 5],
  [/(السبت)/u, 6],
];

const MONTHS_EN: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MONTHS_AR: Array<[RegExp, number]> = [
  [/(كانون الثاني|يناير)/u, 1], [/(شباط|فبراير)/u, 2], [/(آذار|اذار|مارس)/u, 3], [/(نيسان|أبريل|ابريل)/u, 4],
  [/(أيار|ايار|مايو)/u, 5], [/(حزيران|يونيو)/u, 6], [/(تموز|يوليو)/u, 7], [/(آب|اب|أغسطس|اغسطس)/u, 8],
  [/(أيلول|ايلول|سبتمبر)/u, 9], [/(تشرين الأول|تشرين الاول|أكتوبر|اكتوبر)/u, 10], [/(تشرين الثاني|نوفمبر)/u, 11], [/(كانون الأول|كانون الاول|ديسمبر)/u, 12],
];

export function normalizeNoteText(value: string): string {
  return latinDigits(value.normalize("NFKC")).replace(/[ً-ٟـ]/g, "").replace(/\s+/g, " ").trim();
}

/** The local calendar date and weekday at which a note was written. */
export function noteLocalDate(noteAt: string, timezone: string): { date: string; weekday: number } {
  const local = partsInTimeZone(new Date(noteAt), timezone).date;
  const [y, m, d] = local.split("-").map(Number) as [number, number, number];
  return { date: local, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

function upcomingWeekday(from: { date: string; weekday: number }, target: number, includeToday: boolean): string {
  let delta = (target - from.weekday + 7) % 7;
  if (delta === 0 && !includeToday) delta = 7;
  return addDays(from.date, delta);
}

export function timeOfDayIn(text: string): { value: TimeOfDay; phrase: string } | undefined {
  const lower = text.toLowerCase();
  const en = lower.match(/\b(this |in the )?(morning|afternoon|evening|tonight|night)s?\b/);
  if (en) {
    const word = en[2]!;
    return { value: word === "morning" ? "morning" : word === "afternoon" ? "afternoon" : "evening", phrase: en[0]! };
  }
  const ar = text.match(/(الصبح|الصباح|صباحا|صباحاً|بعد الظهر|العصر|المسا|المساء|مساء|مساءً|بالليل|الليلة|الليل)/u);
  if (ar) {
    const word = ar[1]!;
    const value: TimeOfDay = /صب/u.test(word) ? "morning" : /(الظهر|العصر)/u.test(word) ? "afternoon" : "evening";
    return { value, phrase: word };
  }
  return undefined;
}

/** An explicit clock time ("at 6", "6pm", "18:30", "الساعة 7"); afternoon/evening context lifts small hours. */
export function clockTimeIn(text: string, context?: TimeOfDay): { time: string; phrase: string; alternativeTime?: string } | undefined {
  const lower = text.toLowerCase();
  // Only a number that reads as a clock time counts: "at 6", "6pm", "18:30". "3 visits" or "26/10" do not.
  const english = [...lower.matchAll(/(?<![\d/.-])\b(at |after |around |by )?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?![\d/.-])/g)]
    .find((candidate) => Boolean(candidate[1] || candidate[3] || candidate[4]));
  const arabic = text.match(/(?:الساعة|الساعه|(?:^|\s)ع)\s*(\d{1,2})(?::(\d{2}))?/u);
  const match = arabic
    ? { hour: arabic[1]!, minute: arabic[2], suffix: undefined as string | undefined, phrase: arabic[0]! }
    : english
      ? { hour: english[2]!, minute: english[3], suffix: english[4], phrase: english[0]! }
      : undefined;
  if (!match) return undefined;
  let hour = Number(match.hour);
  const minute = Number(match.minute ?? 0);
  if (!Number.isInteger(hour) || hour > 23 || minute > 59) return undefined;
  const suffix = (match.suffix ?? "").replace(/\./g, "");
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  const clock = (value: number) => `${String(value).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const statedContext = context === "evening" || context === "afternoon" || /بعد الظهر|المسا|مساء/u.test(text) ? "late" : context === "morning" || /الصبح|صباح/u.test(text) ? "early" : undefined;
  if (!suffix && hour >= 1 && hour <= 11 && statedContext === "late") hour += 12;
  else if (!suffix && hour >= 1 && hour <= 6 && !statedContext) hour += 12; // "call at 5" at a gym desk means 5 PM
  else if (!suffix && hour >= 7 && hour <= 9 && !statedContext) {
    // "at 7" could be either end of a gym's day: read it as the evening and ask.
    return { time: clock(hour + 12), phrase: match.phrase.trim(), alternativeTime: clock(hour) };
  }
  return { time: clock(hour), phrase: match.phrase.trim() };
}

function weekdayIn(text: string): { weekday: number; phrase: string; qualifier: "next" | "this" | "until" | "none" } | undefined {
  const lower = text.toLowerCase();
  for (const [pattern, weekday] of WEEKDAYS_EN) {
    const found = lower.match(pattern);
    if (!found || found.index === undefined) continue;
    const before = lower.slice(Math.max(0, found.index - 12), found.index);
    const qualifier = /\bnext\s*$/.test(before) ? "next" : /\bthis\s*$/.test(before) ? "this" : /\b(until|till|til|through)\s*$/.test(before) ? "until" : "none";
    return { weekday, phrase: `${qualifier === "none" ? "" : `${before.trim().split(" ").at(-1)} `}${found[0]}`, qualifier };
  }
  for (const [pattern, weekday] of WEEKDAYS_AR) {
    const found = text.match(pattern);
    if (!found || found.index === undefined) continue;
    const around = text.slice(Math.max(0, found.index - 8), found.index + found[0].length + 10);
    const qualifier = /(الجاي|الجاية|القادم|القادمة|اللي جاي)/u.test(around) ? "next" : /(لحد|لغاية|حتى|لعند)/u.test(around) ? "until" : /(هاد|هذا|هالـ)/u.test(around) ? "this" : "none";
    return { weekday, phrase: around.trim(), qualifier };
  }
  return undefined;
}

function explicitDateIn(text: string, from: { date: string }): { date: string; phrase: string; alternative?: string } | undefined {
  const year = Number(from.date.slice(0, 4));
  const pick = (month: number, day: number): string | undefined => {
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    let candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const [cy, cm, cd] = candidate.split("-").map(Number) as [number, number, number];
    const roundTrip = new Date(Date.UTC(cy, cm - 1, cd));
    if (roundTrip.getUTCMonth() !== cm - 1) return undefined;
    // A date written without a year that has already passed this year means next year.
    if (diffDays(from.date, candidate) < -31) candidate = `${year + 1}${candidate.slice(4)}`;
    return candidate;
  };
  const numeric = text.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    // Jordan writes day/month. When both readings are valid and differ, keep month/day as an alternative.
    const primary = pick(second, first);
    const alternative = first !== second && first <= 12 && second <= 12 ? pick(first, second) : undefined;
    if (primary) return { date: primary, phrase: numeric[0]!, alternative };
  }
  const lower = text.toLowerCase();
  const named = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  if (named) {
    const day = Number(named[1] ?? named[4]);
    const month = MONTHS_EN[(named[2] ?? named[3])!]!;
    const date = pick(month, day);
    if (date) return { date, phrase: named[0]! };
  }
  for (const [pattern, month] of MONTHS_AR) {
    const found = text.match(new RegExp(`(\\d{1,2})\\s*${pattern.source}`, "u"));
    if (found) {
      const date = pick(month, Number(found[1]));
      if (date) return { date, phrase: found[0]! };
    }
  }
  return undefined;
}

/**
 * Read the first date expression in a clause. `notBefore` keeps a callback
 * after a stated travel period: "until Sunday, call Monday" never resolves
 * Monday to a day before the member is back.
 */
export function resolveDatePhrase(clause: string, noteAt: string, timezone: string, options: { notBefore?: string } = {}): AiDateResolution | undefined {
  const text = normalizeNoteText(clause);
  if (!text) return undefined;
  const from = noteLocalDate(noteAt, timezone);
  const lower = text.toLowerCase();
  const timeOfDay = timeOfDayIn(text);
  const clock = clockTimeIn(text, timeOfDay?.value);
  const time = clock?.time ?? (timeOfDay ? TIME_OF_DAY_CLOCK[timeOfDay.value] : undefined);
  const withTime = (date: string, phrase: string, dateAlternatives?: AiDateResolution["alternatives"]): AiDateResolution => {
    const alternatives = [...(dateAlternatives ?? []).map((item) => ({ ...item, ...(time && !item.time ? { time } : {}) })), ...(clock?.alternativeTime ? [{ date, time: clock.alternativeTime, reasonKey: "aiWork.dates.amOrPm" }] : [])];
    return {
      date,
      ...(time ? { time } : {}),
      phrase: [phrase, clock?.phrase ?? timeOfDay?.phrase].filter(Boolean).join(" ").trim(),
      ...(alternatives.length ? { alternatives } : {}),
    };
  };
  const respectFloor = (resolution: AiDateResolution): AiDateResolution => {
    if (!options.notBefore || resolution.date > options.notBefore) return resolution;
    // The stated reading falls before the member is back: offer the week after as the primary reading.
    const later = addDays(resolution.date, 7);
    return { ...resolution, date: later, alternatives: [{ date: resolution.date, ...(resolution.time ? { time: resolution.time } : {}), reasonKey: "aiWork.dates.beforeReturn" }, ...(resolution.alternatives ?? [])] };
  };

  const inDays = lower.match(/\bin (\d{1,2}) days?\b/) ?? text.match(/بعد (\d{1,2}) (?:ايام|أيام|يوم)/u);
  if (inDays) return respectFloor(withTime(addDays(from.date, Number(inDays[1])), inDays[0]!));
  if (/\bday after tomorrow\b/.test(lower) || /بعد (بكرة|بكرا|بكره|غدا|غداً)/u.test(text)) return respectFloor(withTime(addDays(from.date, 2), /day after/.test(lower) ? "day after tomorrow" : "بعد بكرة"));
  if (/\btomorrow\b/.test(lower) || /(بكرة|بكرا|بكره|غدا|غداً|غدًا)/u.test(text)) return respectFloor(withTime(addDays(from.date, 1), /tomorrow/.test(lower) ? "tomorrow" : (text.match(/(بكرة|بكرا|بكره|غدا|غداً|غدًا)/u)?.[0] ?? "")));
  if (/\b(today|tonight)\b/.test(lower) || /(اليوم|الليلة)/u.test(text)) return respectFloor(withTime(from.date, /tonight/.test(lower) ? "tonight" : /today/.test(lower) ? "today" : (text.match(/(اليوم|الليلة)/u)?.[0] ?? "")));
  if (/\bafter the weekend\b/.test(lower) || /بعد (العطلة|الويكند|نهاية الأسبوع|نهاية الاسبوع)/u.test(text)) return respectFloor(withTime(upcomingWeekday(from, 0, false), "after the weekend"));
  if (/\bnext week\b/.test(lower) || /(الأسبوع الجاي|الاسبوع الجاي|الأسبوع القادم|الاسبوع القادم|الجمعة الجاية)/u.test(text)) {
    // Next week starts on the gym's working-week Sunday; "next week" alone has no day, so ask.
    const start = upcomingWeekday(from, 0, false);
    return respectFloor(withTime(start, /next week/.test(lower) ? "next week" : "الأسبوع الجاي", [{ date: addDays(start, 1), reasonKey: "aiWork.dates.weekNoDay" }]));
  }
  const explicit = explicitDateIn(text, from);
  if (explicit) return respectFloor(withTime(explicit.date, explicit.phrase, explicit.alternative ? [{ date: explicit.alternative, reasonKey: "aiWork.dates.dayMonthOrder" }] : undefined));
  const weekday = weekdayIn(text);
  if (weekday) {
    const upcoming = upcomingWeekday(from, weekday.weekday, false);
    if (weekday.qualifier === "next") {
      // "Next Monday" means the coming Monday to some people and Monday of next week to others.
      return respectFloor(withTime(upcoming, weekday.phrase, [{ date: addDays(upcoming, 7), reasonKey: "aiWork.dates.nextWeekday" }]));
    }
    if (weekday.weekday === from.weekday) {
      // The note names today's weekday: today, or a week from today.
      return respectFloor(withTime(upcoming, weekday.phrase, [{ date: from.date, reasonKey: "aiWork.dates.sameWeekday" }]));
    }
    return respectFloor(withTime(upcoming, weekday.phrase));
  }
  if (timeOfDay && !/\b(prefers?|usually|always)\b/.test(lower) && !/(بيحب|بتحب|دايما|عادة)/u.test(text)) return respectFloor(withTime(from.date, timeOfDay.phrase));
  return undefined;
}
