import type { Money } from "../domain/money";
import { TENANT_TIMEZONE } from "../utils/dates";
import { formatMoney, type FormatMoneyOptions } from "../utils/money";
import { numberingLocale, type Locale } from "./locale";

/** The approved Jordanian Gregorian names, independent of ICU abbreviations. */
export const JORDANIAN_MONTHS = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"] as const;
const EM_DASH = "—";

export interface Formatters {
  date: (iso: string | undefined | null) => string;
  dateShort: (iso: string | undefined | null) => string;
  dateTime: (iso: string | undefined | null) => string;
  time: (iso: string | undefined | null) => string;
  weekday: (iso: string) => string;
  monthYear: (iso: string) => string;
  relative: (iso: string, now?: Date) => string;
  relativeDays: (days: number) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  percent: (value: number) => string;
  money: (value: Money, options?: Omit<FormatMoneyOptions, "locale">) => string;
}

/** Pure: safe in server jobs, PDFs and browser code. No browser-global locale. */
export function makeFormatters(locale: Locale, justNow: string, timeZone = TENANT_TIMEZONE): Formatters {
  const numeric = numberingLocale(locale);
  const rtf = new Intl.RelativeTimeFormat(numeric, { numeric: "auto" });
  const dateOnly = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const dateValue = (iso: string) => new Date(dateOnly(iso) ? `${iso}T12:00:00Z` : iso);
  const valid = (iso: string | null | undefined): iso is string => Boolean(iso && Number.isFinite(dateValue(iso).getTime()));
  const dtf = (iso: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(numeric, {
    ...options, calendar: "gregory", numberingSystem: "latn", timeZone: dateOnly(iso) ? "UTC" : timeZone,
  });
  const calendarParts = (iso: string) => {
    const parts = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "numeric", day: "numeric", timeZone: dateOnly(iso) ? "UTC" : timeZone }).formatToParts(dateValue(iso));
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    return { day: get("day"), month: get("month"), year: get("year") };
  };
  const date = (iso: string | undefined | null, year = true): string => {
    if (!valid(iso)) return EM_DASH;
    if (locale === "en") return dtf(iso, { day: "numeric", month: "short", ...(year ? { year: "numeric" } as const : {}) }).format(dateValue(iso));
    const parts = calendarParts(iso);
    return `${parts.day} ${JORDANIAN_MONTHS[parts.month - 1]}${year ? ` ${parts.year}` : ""}`;
  };
  const time = (iso: string | undefined | null): string => {
    if (!valid(iso)) return EM_DASH;
    if (locale === "en") return dtf(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(dateValue(iso));
    const parts = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hourCycle: "h12", timeZone }).formatToParts(dateValue(iso));
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("hour")}:${get("minute")} ${get("dayPeriod") === "AM" ? "ص" : "م"}`;
  };
  return {
    date,
    dateShort: (iso) => date(iso, false),
    dateTime: (iso) => !valid(iso) ? EM_DASH : locale === "ar" ? `${date(iso, false)}، ${time(iso)}` : dtf(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(dateValue(iso)),
    time,
    weekday: (iso) => valid(iso) ? dtf(iso, { weekday: "short" }).format(dateValue(iso)) : EM_DASH,
    monthYear: (iso) => {
      if (!valid(iso)) return EM_DASH;
      if (locale === "en") return dtf(iso, { month: "long", year: "numeric" }).format(dateValue(iso));
      const parts = calendarParts(iso);
      return `${JORDANIAN_MONTHS[parts.month - 1]} ${parts.year}`;
    },
    relative: (iso, now = new Date()) => {
      if (!valid(iso)) return EM_DASH;
      const diff = dateValue(iso).getTime() - now.getTime();
      const abs = Math.abs(diff);
      if (abs < 60_000) return justNow;
      if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), "minute");
      if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), "hour");
      if (abs < 30 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), "day");
      return date(iso);
    },
    relativeDays: (days) => rtf.format(days, "day"),
    number: (value, options) => new Intl.NumberFormat(numeric, { ...options, numberingSystem: "latn" }).format(value),
    percent: (value) => new Intl.NumberFormat(numeric, { style: "percent", maximumFractionDigits: 0, numberingSystem: "latn" }).format(value / 100),
    money: (value, options) => formatMoney(value, { ...options, locale: locale === "ar" ? numeric : "en-JO" }),
  };
}
