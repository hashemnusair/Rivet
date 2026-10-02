import { DEMO_AUTH_BYPASS } from "@/lib/auth/demo-auth";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./locale";
export * from "./locale";

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

