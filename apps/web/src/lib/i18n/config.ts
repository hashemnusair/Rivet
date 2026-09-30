import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";

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
 * Arabic stays hidden from real customers until the founders' terminology list
 * is applied. It is available when `NEXT_PUBLIC_RIVET_ARABIC=1`, or in the
 * mock/demo preview (the same condition that shows the demo controls).
 * Everything else behaves exactly as before: English, no switch, no cookie read.
 *
 * Every `process.env.X` is a literal member expression so Next inlines it into
 * the client bundle.
 */
export function arabicEnabledFor(env: {
  flag: string | undefined;
  demoAuthBypass: boolean;
  convexUrl: string | undefined;
}): boolean {
  return env.flag === "1" || env.demoAuthBypass || !env.convexUrl;
}

export const ARABIC_ENABLED = arabicEnabledFor({
  flag: process.env.NEXT_PUBLIC_RIVET_ARABIC,
  demoAuthBypass: DEMO_AUTH_BYPASS,
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
});

/** A cookie value, or nothing, resolved against the feature gate. */
export function resolveLocale(cookieValue: string | undefined, enabled: boolean = ARABIC_ENABLED): Locale {
  return enabled && isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;
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
