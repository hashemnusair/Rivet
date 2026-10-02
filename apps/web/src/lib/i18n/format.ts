"use client";

import { useMemo } from "react";
import type { Money } from "@/lib/domain/types";
import { TENANT_TIMEZONE } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import { numberingLocale, type Locale } from "./config";
import { useLocale } from "./provider";

/**
 * Locale-aware versions of the display formatters in `lib/utils/dates` and
 * `lib/utils/money`. Those stay pure and English-defaulted so non-React code
 * (exports, receipts, tests) keeps working unchanged; components take these.
 *
 * Dates follow the reader's language: Gregorian, with Arabic month names in
 * Arabic. Digits deliberately do not follow the language: `numberingLocale`
 * pins Latin digits, because a receipt number read aloud at the desk has to
 * match the printed one. Money keeps its documented shape, `JOD 40.000`.
 * Ported from origin/arabic-localisation and adapted to current main.
 */
const cache = new Map<string, Intl.DateTimeFormat>();

function dtf(locale: Locale, key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const cacheKey = `${locale}:${key}`;
  let formatter = cache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(numberingLocale(locale), { timeZone: TENANT_TIMEZONE, ...options });
    cache.set(cacheKey, formatter);
  }
  return formatter;
}

/** Dates stored as `YYYY-MM-DD` are calendar days, not instants; read them at
 *  midday UTC so no timezone can push them onto the wrong day. */
function toDate(iso: string): Date {
  return new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
}

const EM_DASH = "—";

export interface Formatters {
  date: (iso: string | undefined | null) => string;
  dateShort: (iso: string | undefined | null) => string;
  dateTime: (iso: string | undefined | null) => string;
  time: (iso: string | undefined | null) => string;
  weekday: (iso: string) => string;
  monthYear: (iso: string) => string;
  /** "just now", "5 minutes ago", "in 3 days". */
  relative: (iso: string, now?: Date) => string;
  /** Signed day offset as words: "in 4 days" / "3 days ago". */
  relativeDays: (days: number) => string;
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  percent: (value: number) => string;
  money: (value: Money, options?: { compact?: boolean; hideCurrency?: boolean }) => string;
}

export function makeFormatters(locale: Locale, justNow: string): Formatters {
  const numeric = numberingLocale(locale);
  // Pinned numbering: the Arabic default would print Arabic-Indic digits here.
  const rtf = new Intl.RelativeTimeFormat(numeric, { numeric: "auto" });

  const date = (iso: string | undefined | null) =>
    iso ? dtf(locale, "date", { day: "numeric", month: "short", year: "numeric" }).format(toDate(iso)) : EM_DASH;

  return {
    date,
    dateShort: (iso) => (iso ? dtf(locale, "dateShort", { day: "numeric", month: "short" }).format(toDate(iso)) : EM_DASH),
    dateTime: (iso) =>
      iso
        ? dtf(locale, "dateTime", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso))
        : EM_DASH,
    time: (iso) =>
      iso ? dtf(locale, "time", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)) : EM_DASH,
    weekday: (iso) => dtf(locale, "weekday", { weekday: "short" }).format(toDate(iso)),
    monthYear: (iso) => dtf(locale, "monthYear", { month: "long", year: "numeric" }).format(toDate(iso)),

    relative: (iso, now = new Date()) => {
      const diffMs = new Date(iso).getTime() - now.getTime();
      const abs = Math.abs(diffMs);
      if (abs < 60_000) return justNow;
      if (abs < 3_600_000) return rtf.format(Math.round(diffMs / 60_000), "minute");
      if (abs < 86_400_000) return rtf.format(Math.round(diffMs / 3_600_000), "hour");
      if (abs < 30 * 86_400_000) return rtf.format(Math.round(diffMs / 86_400_000), "day");
      return date(iso);
    },

    relativeDays: (days) => rtf.format(days, "day"),

    number: (value, options) => new Intl.NumberFormat(numeric, options).format(value),
    percent: (value) => new Intl.NumberFormat(numeric, { style: "percent", maximumFractionDigits: 0 }).format(value / 100),
    // Always the product's own money shape (`JOD 40.000`, Latin digits). Intl's
    // Arabic currency output puts the code after the figure and adds marks that
    // fight a pinned direction, so it is deliberately not used.
    money: (value, options) => formatMoney(value, options),
  };
}

/** Formatters bound to the reader's current language. */
export function useFormat(): Formatters {
  const { locale, t } = useLocale();
  const justNow = t("common.time.now");
  return useMemo(() => makeFormatters(locale, justNow), [locale, justNow]);
}
