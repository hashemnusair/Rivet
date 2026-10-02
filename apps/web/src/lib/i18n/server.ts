import { cookies } from "next/headers";
import { ARABIC_ENABLED, DEFAULT_LOCALE, LOCALE_COOKIE, resolveLocale, type Locale } from "./config";

/**
 * The reader's language for this request. When Arabic is hidden from the
 * deployment the cookie is never read, so the root layout stays statically
 * renderable and nothing changes from today's English-only behavior.
 */
export async function getRequestLocale(): Promise<Locale> {
  if (!ARABIC_ENABLED) return DEFAULT_LOCALE;
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
}
