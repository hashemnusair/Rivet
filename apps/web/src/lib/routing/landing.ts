import { ARABIC_ENABLED, DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { UI_PREFERENCE_COOKIE, parseUiPreference, resolveUiPreference } from "@/lib/i18n/preference";

/**
 * The landing is built ahead once per language (src/app/(site)/[lang]) so
 * Vercel's edge can serve it without asking the server. Its addresses carry
 * the language: English at "/", Arabic at "/ar". The English page is built at
 * "/en", and "/" is answered with it.
 */
export const LANDING_PATHS: Record<Locale, string> = { en: "/", ar: "/ar" };
export const ENGLISH_LANDING_BUILD_PATH = "/en";

export function isLandingPath(pathname: string): boolean {
  return pathname === LANDING_PATHS.en || pathname === LANDING_PATHS.ar;
}

/**
 * The language a visitor to "/" should land in, from the presentation cookies
 * alone. It follows the product's rule for someone not signed in: their own
 * device choice counts, an earlier account's setting does not (the product
 * root layout resolves the same way). Signed-in visitors never see the
 * landing; they are sent to their area first.
 */
export function landingLocale(cookies: { get(name: string): { value: string } | undefined }): Locale {
  if (!ARABIC_ENABLED) return DEFAULT_LOCALE;
  return resolveUiPreference({
    owner: null,
    cookie: parseUiPreference(cookies.get(UI_PREFERENCE_COOKIE)?.value),
    legacyLocale: cookies.get(LOCALE_COOKIE)?.value,
  }).locale;
}

/**
 * Before the English landing paints, an Arabic reader who reached it anyway
 * (the server normally redirects them) is sent to "/ar". Mirrors
 * `landingLocale`; only ever moves from the English page, so it cannot loop.
 */
export function landingLanguagePrePaintScript(): string {
  const ui = new RegExp(`(?:^|; )${UI_PREFERENCE_COOKIE}=([^;]*)`).toString();
  const legacy = new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`).toString();
  return (
    "(function(){try{" +
    `if(location.pathname!==${JSON.stringify(LANDING_PATHS.en)}||document.documentElement.lang!=="en")return;` +
    `var c=document.cookie,u=c.match(${ui}),l=c.match(${legacy}),want;` +
    "if(u){var p=JSON.parse(decodeURIComponent(u[1]));if(p&&p.owner===null)want=p.locale;}else if(l){want=l[1];}" +
    `if(want==="ar")location.replace(${JSON.stringify(LANDING_PATHS.ar)}+location.search+location.hash);` +
    "}catch(e){}})();"
  );
}
