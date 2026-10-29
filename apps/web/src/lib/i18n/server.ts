import { cache } from "react";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { ARABIC_ENABLED, DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "./config";
import { UI_PREFERENCE_COOKIE, parseUiPreference, resolveUiPreference, type UiLocalePreference } from "./preference";

/** Request-scoped: no account's preference can enter a process-wide cache. */
export const getRequestUiPreference = cache(async (): Promise<UiLocalePreference> => {
  if (!ARABIC_ENABLED) return { version: 1, locale: DEFAULT_LOCALE, owner: null };
  const store = await cookies();
  const cookie = parseUiPreference(store.get(UI_PREFERENCE_COOKIE)?.value);
  let owner: string | null = null;
  let savedLocale: Locale | undefined;
  if (!DEMO_AUTH_BYPASS && process.env.NEXT_PUBLIC_DATA_MODE !== "mock" && process.env.NEXT_PUBLIC_CONVEX_URL && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    try {
      const session = await auth();
      owner = session.userId;
      // The shared cookie is written from this account's saved language every
      // time a RIVET page binds it, so when it already names this account the
      // page can paint from it. Asking Clerk for a token and Convex for the
      // account cost two network trips on every signed-in page load; a
      // language changed on another device still arrives once the page binds.
      if (owner && cookie?.owner !== owner) {
        const token = await session.getToken({ template: "convex" });
        if (token) savedLocale = (await fetchQuery(api.users.current, {}, { token }))?.uiLocale;
      }
    } catch {
      // Offline/provider failures fall back to this account's cookie. Tokens and
      // provider responses must never be logged or written to preference storage.
    }
  }
  return resolveUiPreference({ owner, savedLocale, cookie, legacyLocale: store.get(LOCALE_COOKIE)?.value });
});

export async function getRequestLocale(): Promise<Locale> { return (await getRequestUiPreference()).locale; }
