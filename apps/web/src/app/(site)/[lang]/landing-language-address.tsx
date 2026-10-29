"use client";

import { useEffect } from "react";
import { useLocale } from "@/lib/i18n/provider";
import { LANDING_PATHS, isLandingPath } from "@/lib/routing/landing";

/**
 * The landing's language switch changes the page in place, like everywhere
 * else in RIVET. Its address follows, so a shared or reloaded link opens in
 * the language on screen.
 */
export function LandingLanguageAddress() {
  const { locale } = useLocale();
  useEffect(() => {
    const path = LANDING_PATHS[locale];
    if (location.pathname === path || !isLandingPath(location.pathname)) return;
    window.history.replaceState(null, "", path + location.search + location.hash);
  }, [locale]);
  return null;
}
