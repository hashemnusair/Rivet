/**
 * RIVET speaks English and Arabic. The language is a presentation choice held
 * per browser — not part of the URL — so a member or a receptionist can flip it
 * mid-task without losing the page they are on.
 *
 * Direction, font stack and every Intl formatter are derived from the locale
 * rather than toggled independently: there is exactly one switch.
 */
export const LOCALES = ["en", "ar"] as const;

export type Locale = (typeof LOCALES)[number];

export type Direction = "ltr" | "rtl";

export const DEFAULT_LOCALE: Locale = "en";

/** Persisted in localStorage so the choice survives a session, and mirrored to
 *  a cookie so the server can paint the right direction on first byte. */
export const LOCALE_STORAGE_KEY = "rivet.locale";
export const LOCALE_COOKIE = "rivet_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * The BCP 47 tag handed to Intl. Arabic uses `ar-JO` so dates, relative times
 * and currency read the way they do in Amman; English stays on `en-GB` to keep
 * day-month order, which is what the existing formatters already produced.
 */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-JO" : "en-GB";
}

/**
 * Arabic-Indic digits are correct for prose but wrong for an operations
 * console: money columns, member numbers and receipt references have to line up
 * and be read aloud against a printed receipt. Force Latin digits in both
 * languages by pinning the numbering system.
 */
export function numberingLocale(locale: Locale): string {
  return locale === "ar" ? "ar-JO-u-nu-latn" : "en-GB";
}

export const LOCALE_LABELS: Record<Locale, { native: string; english: string; short: string }> = {
  en: { native: "English", english: "English", short: "EN" },
  ar: { native: "العربية", english: "Arabic", short: "ع" },
};

export function otherLocale(locale: Locale): Locale {
  return locale === "ar" ? "en" : "ar";
}
