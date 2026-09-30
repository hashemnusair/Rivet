"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ARABIC_ENABLED, DEFAULT_LOCALE, LOCALE_COOKIE, dirFor, type Direction, type Locale } from "./config";
import { isolate as isolateText, isolateLtr as isolateLtrText } from "./bidi";
import { translate, type MessagePath, type MessageTree, type MessageVars } from "./dictionary";
import { ar, en, type Messages } from "./messages";

const CATALOGUES = { en, ar } as unknown as Record<Locale, MessageTree>;

/** Every dot-path in the English catalogue that resolves to a string or plural group. */
export type TKey = MessagePath<Messages>;

export type TFunction = (key: TKey, vars?: MessageVars) => string;

interface LocaleContextValue {
  locale: Locale;
  dir: Direction;
  /** False when Arabic is hidden from this deployment; the switch must not render. */
  switchEnabled: boolean;
  setLocale: (locale: Locale) => void;
  t: TFunction;
  /**
   * Wrap a name, email or other user text before passing it to `t()` as a
   * variable. A no-op in English (so English output is byte-for-byte unchanged);
   * in Arabic it adds Unicode isolates so the sentence cannot reorder it.
   */
  isolate: (value: string | number) => string;
  /** Same, for values that must stay left-to-right: phones, ids, receipt numbers, amounts, ranges. */
  isolateLtr: (value: string | number) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** Direction and language are also applied to the live document so a switch repaints without a reload. */
function applyToDocument(locale: Locale) {
  const root = document.documentElement;
  root.lang = locale;
  root.dir = dirFor(locale);
  root.classList.toggle("rtl-font", locale === "ar");
}

function makeT(locale: Locale): TFunction {
  const messages = CATALOGUES[locale];
  const fallback = CATALOGUES.en;
  return (key, vars) => translate({ messages, fallback, locale }, key, vars);
}

export function LocaleProvider({ children, initialLocale = DEFAULT_LOCALE }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    if (!ARABIC_ENABLED) return;
    setLocaleState(next);
    applyToDocument(next);
    // The server reads this cookie so the next full page load paints the right
    // language and direction before hydration. A per-user saved preference is a follow-up.
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const t = useMemo(() => makeT(locale), [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dir: dirFor(locale),
      switchEnabled: ARABIC_ENABLED,
      setLocale,
      t,
      isolate: locale === "ar" ? isolateText : String,
      isolateLtr: locale === "ar" ? isolateLtrText : String,
    }),
    [locale, setLocale, t],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/**
 * Outside a provider (a unit test rendering one component, a fragment rendered
 * outside the tree) every component shows English instead of crashing over a
 * presentation concern. This is also what keeps every existing English test intact.
 */
const FALLBACK: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
  dir: dirFor(DEFAULT_LOCALE),
  switchEnabled: false,
  setLocale: () => undefined,
  t: makeT(DEFAULT_LOCALE),
  isolate: String,
  isolateLtr: String,
};

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext) ?? FALLBACK;
}

/** The common case: just the translate function. */
export function useT(): TFunction {
  return useLocale().t;
}
