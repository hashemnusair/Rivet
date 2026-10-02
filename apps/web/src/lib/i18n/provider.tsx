"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ARABIC_ENABLED, DEFAULT_LOCALE, LOCALE_COOKIE, dirFor, isLocale, type Direction, type Locale } from "./config";
import { isolate as isolateText, isolateLtr as isolateLtrText } from "./bidi";
import { createTranslator, type TFunction } from "./core";
import { UI_PREFERENCE_COOKIE, UI_PREFERENCE_STORAGE, encodeUiPreference, localeCookieSuffix, parseUiPreference, type UiLocalePreference } from "./preference";
export type { TKey, TFunction } from "./core";

type SaveLocale = (locale: Locale) => Promise<unknown>;
type PreferenceStatus = "device" | "saving" | "saved" | "pending";
interface LocaleContextValue {
  locale: Locale;
  dir: Direction;
  switchEnabled: boolean;
  setLocale: (locale: Locale) => void;
  /** Bound only after authenticated identity resolution, independently of communication preferences. */
  bindAccount: (owner: string | null, savedLocale?: Locale, save?: SaveLocale) => void;
  preferenceStatus: PreferenceStatus;
  t: TFunction;
  isolate: (value: string | number) => string;
  isolateLtr: (value: string | number) => string;
}
const LocaleContext = createContext<LocaleContextValue | null>(null);

function applyToDocument(locale: Locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = dirFor(locale);
  document.documentElement.classList.toggle("rtl-font", locale === "ar");
}

function persistBrowser(preference: UiLocalePreference, broadcast = true) {
  try {
    const suffix = localeCookieSuffix(location.hostname, location.protocol === "https:");
    // Remove older host-only copies before writing a shared production preference.
    if (suffix.includes("domain=")) {
      document.cookie = `${LOCALE_COOKIE}=; path=/; max-age=0; samesite=lax`;
      document.cookie = `${UI_PREFERENCE_COOKIE}=; path=/; max-age=0; samesite=lax`;
    }
    document.cookie = `${LOCALE_COOKIE}=${preference.locale}${suffix}`;
    document.cookie = `${UI_PREFERENCE_COOKIE}=${encodeUiPreference(preference)}${suffix}`;
  } catch { /* A blocked cookie must not discard an in-progress form. */ }
  if (broadcast) {
    try { localStorage.setItem(UI_PREFERENCE_STORAGE, encodeUiPreference(preference)); }
    catch { /* The active tab remains usable when storage is denied. */ }
  }
}

export function LocaleProvider({ children, initialLocale = DEFAULT_LOCALE, initialOwner = null, initialPending }: {
  children: ReactNode; initialLocale?: Locale; initialOwner?: string | null; initialPending?: string;
}) {
  const initial: UiLocalePreference = { version: 1, locale: initialLocale, owner: initialOwner, ...(initialPending ? { pending: initialPending } : {}) };
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [preferenceStatus, setPreferenceStatus] = useState<PreferenceStatus>(initialPending ? "pending" : initialOwner ? "saved" : "device");
  const preference = useRef(initial);
  const saveLocale = useRef<SaveLocale | undefined>(undefined);
  const syncing = useRef(false);

  const apply = useCallback((next: UiLocalePreference, broadcast = true) => {
    preference.current = next;
    setLocaleState(next.locale);
    applyToDocument(next.locale);
    persistBrowser(next, broadcast);
  }, []);

  const flush = useCallback(() => {
    if (syncing.current || !saveLocale.current || !preference.current.owner || !preference.current.pending) return;
    syncing.current = true;
    void (async () => {
      try {
        while (saveLocale.current && preference.current.owner && preference.current.pending) {
          const choice = preference.current;
          const save = saveLocale.current;
          setPreferenceStatus("saving");
          try { await save(choice.locale); }
          catch {
            if (preference.current.owner === choice.owner) { setPreferenceStatus("pending"); break; }
            continue;
          }
          // A response for the previous account or an older choice cannot clear a newer choice.
          if (preference.current.owner === choice.owner && preference.current.pending === choice.pending) {
            apply({ version: 1, owner: choice.owner, locale: choice.locale });
            setPreferenceStatus("saved");
          }
        }
      } finally { syncing.current = false; }
    })();
  }, [apply]);

  const setLocale = useCallback((next: Locale) => {
    if (!ARABIC_ENABLED || !isLocale(next)) return;
    apply({ version: 1, owner: preference.current.owner, locale: next, pending: crypto.randomUUID() });
    setPreferenceStatus(preference.current.owner ? "pending" : "device");
    flush();
  }, [apply, flush]);

  const bindAccount = useCallback((owner: string | null, savedLocale?: Locale, save?: SaveLocale) => {
    const previous = preference.current;
    saveLocale.current = save;
    if (owner !== previous.owner) {
      // An explicit choice made while signing in follows that sign-in. An old
      // account's setting never becomes the next account's default.
      const pending = previous.owner === null && owner !== null ? previous.pending : undefined;
      apply({ version: 1, owner, locale: pending ? previous.locale : savedLocale ?? DEFAULT_LOCALE, ...(pending ? { pending } : {}) });
    } else if (!previous.pending && savedLocale && previous.locale !== savedLocale) {
      apply({ version: 1, owner, locale: savedLocale });
    }
    setPreferenceStatus(preference.current.pending && owner ? "pending" : owner ? "saved" : "device");
    flush();
  }, [apply, flush]);

  useEffect(() => {
    // Server/cookie resolution wins hydration; stale localStorage is only a mirror.
    persistBrowser(preference.current, false);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== UI_PREFERENCE_STORAGE) return;
      const incoming = parseUiPreference(event.newValue);
      if (incoming && incoming.owner === preference.current.owner) {
        apply(incoming, false);
        setPreferenceStatus(incoming.pending && incoming.owner ? "pending" : incoming.owner ? "saved" : "device");
        if (incoming.pending && incoming.owner) flush();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("online", flush);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("online", flush); };
  }, [apply, flush]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    const notify = () => {
      navigator.serviceWorker.controller?.postMessage({ type: "rivet:ui-locale", locale });
      void navigator.serviceWorker.getRegistration().then(registration => {
        if (!cancelled) registration?.active?.postMessage({ type: "rivet:ui-locale", locale });
      }).catch(() => undefined);
    };
    notify();
    navigator.serviceWorker.addEventListener("controllerchange", notify);
    return () => { cancelled = true; navigator.serviceWorker.removeEventListener("controllerchange", notify); };
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({ locale, dir: dirFor(locale), switchEnabled: ARABIC_ENABLED, setLocale, bindAccount, preferenceStatus, t: createTranslator(locale), isolate: locale === "ar" ? isolateText : String, isolateLtr: locale === "ar" ? isolateLtrText : String }), [locale, setLocale, bindAccount, preferenceStatus]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

const FALLBACK: LocaleContextValue = {
  locale: DEFAULT_LOCALE, dir: dirFor(DEFAULT_LOCALE), switchEnabled: false, setLocale: () => undefined, bindAccount: () => undefined,
  preferenceStatus: "device", t: createTranslator(DEFAULT_LOCALE), isolate: String, isolateLtr: String,
};
export function useLocale(): LocaleContextValue { return useContext(LocaleContext) ?? FALLBACK; }
export function useT(): TFunction { return useLocale().t; }
