"use client";

import { useLocale, useLocaleDirection } from "gt-next";
import { useEffect, useRef } from "react";
import { useApp } from "@/lib/providers/app-providers";

const DIR_STORAGE_KEY = "rivet.demo.dir";

/**
 * Keep document metadata and direction aligned when the GT locale changes.
 * This component is mounted only inside the production GTProvider boundary.
 * A stored direction remains authoritative on first mount so the existing
 * manual RTL layout preference is not overwritten.
 */
export function GeneralTranslationDocumentState() {
  const locale = useLocale();
  const localeDirection = useLocaleDirection(locale);
  const { setDir } = useApp();
  const initialLocale = useRef<string | null>(null);

  useEffect(() => {
    document.documentElement.lang = locale;

    const storedDir = window.sessionStorage.getItem(DIR_STORAGE_KEY);
    if (initialLocale.current === null) {
      initialLocale.current = locale;
      if (storedDir !== "ltr" && storedDir !== "rtl") setDir(localeDirection);
      return;
    }

    if (initialLocale.current !== locale) {
      initialLocale.current = locale;
      setDir(localeDirection);
    }
  }, [locale, localeDirection, setDir]);

  return null;
}
