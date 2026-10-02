/**
 * RIVET speaks English and Arabic. The language is a presentation choice kept
 * in a cookie, not in the URL, so a receptionist can flip it mid-task without
 * losing the page they are on. The cookie is read on the server so the root
 * layout paints `<html lang dir>` correctly before anything hydrates.
 *
 * Direction, font and every Intl formatter derive from the locale; there is
 * exactly one switch.
 */
export const LOCALES = ["en", "ar"] as const;

export type Locale = (typeof LOCALES)[number];

export type Direction = "ltr" | "rtl";

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "rivet_locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}

/**
 * The BCP 47 tag handed to Intl for wording (months, weekdays, relative time).
 * `ar-JO` gives the Jordanian month names (تشرين الأول); English keeps `en-GB`
 * so day-month order matches the existing formatters.
 */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-JO" : "en-GB";
}

/**
 * Gregorian dates and Latin digits (0-9) in both languages. Receipt numbers,
 * member numbers and amounts are read aloud against a printed receipt, so the
 * digits never change with the language. Pinning the calendar and numbering
 * system here is the one place to change if the founders choose otherwise.
 */
export function numberingLocale(locale: Locale): string {
  return locale === "ar" ? "ar-JO-u-nu-latn-ca-gregory" : "en-GB";
}

export const LOCALE_LABELS: Record<Locale, { native: string; english: string }> = {
  en: { native: "English", english: "English" },
  ar: { native: "العربية", english: "Arabic" },
};
