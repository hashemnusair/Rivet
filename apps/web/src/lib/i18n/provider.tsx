"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  dirFor,
  isLocale,
  type Direction,
  type Locale,
} from "./config";
import { translate, type MessagePath, type MessageTree, type MessageVars } from "./dictionary";
import { en, type Messages } from "./messages/en";
import { ar } from "./messages/ar";

const CATALOGUES: Record<Locale, Messages> = { en, ar };

/** Every dot-path in the catalogue that resolves to a translatable string. */
export type TKey = MessagePath<Messages>;

export type TFunction = (key: TKey, vars?: MessageVars) => string;

interface LocaleContextValue {
  locale: Locale;
  dir: Direction;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: TFunction;
  /** True until the stored preference has been read, so nothing flashes the
   *  wrong direction mid-hydration. */
  ready: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Applies the locale to the document itself. `dir` drives every logical CSS
 * property in the app, and `rtl-font` swaps the Latin stack for IBM Plex Sans
 * Arabic — both are already honoured by globals.css.
 */
function applyToDocument(locale: Locale) {
  const dir = dirFor(locale);
  document.documentElement.lang = locale;
  document.documentElement.dir = dir;
  document.documentElement.classList.toggle("rtl-font", dir === "rtl");
}

export function LocaleProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [ready, setReady] = useState(false);

  // The stored choice is read after mount rather than during render: the server
  // painted `initialLocale`, and reading storage during render would desync the
  // two trees.
  useEffect(() => {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    const next = isLocale(stored) ? stored : initialLocale;
    setLocaleState(next);
    applyToDocument(next);
    setReady(true);
  }, [initialLocale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    applyToDocument(next);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    // Mirrored to a cookie so a future server render can pick the right
    // direction before hydration instead of flipping after it.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === "ar" ? "en" : "ar");
  }, [locale, setLocale]);

  const t = useCallback<TFunction>(
    (key, vars) =>
      translate(
        {
          messages: CATALOGUES[locale] as unknown as MessageTree,
          fallback: en as unknown as MessageTree,
          locale,
        },
        key,
        vars,
      ),
    [locale],
  );

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, dir: dirFor(locale), setLocale, toggleLocale, t, ready }),
    [locale, setLocale, toggleLocale, t, ready],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside <LocaleProvider>");
  return context;
}

/** The common case — just the translate function. */
export function useT(): TFunction {
  return useLocale().t;
}
