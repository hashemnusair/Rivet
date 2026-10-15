import type { Locale } from "./locale";
import { translate, type MessagePath, type MessageTree, type MessageVars } from "./dictionary";
import { en, type Messages } from "./messages/en";
import { bundledArabic } from "./arabic-catalogue";

export type TKey = MessagePath<Messages>;
export type TFunction = (key: TKey, vars?: MessageVars) => string;
export interface MessageDescriptor { key: TKey; params?: MessageVars }

/**
 * English is always here. Server code, Convex and tests get Arabic with it
 * (`arabic-catalogue.ts`). Browser bundles get an empty stand-in instead
 * (`next.config.mjs`), so English readers never download the Arabic
 * catalogue. For Arabic readers the root layout preloads it with the page
 * (`arabic-catalogue-loader.tsx`) and LocaleProvider waits for it before
 * hydrating; everything else waits for `loadCatalogue`. A missing catalogue
 * is an error, never a quiet switch to English.
 */
const CATALOGUES: Partial<Record<Locale, MessageTree>> = { en: en as unknown as MessageTree };
if (bundledArabic) CATALOGUES.ar = bundledArabic;

export function hasCatalogue(locale: Locale): boolean {
  return CATALOGUES[locale] !== undefined;
}

export function registerCatalogue(locale: Locale, messages: Messages): void {
  CATALOGUES[locale] ??= messages as unknown as MessageTree;
}

let arabicLoad: Promise<void> | undefined;

/**
 * Resolves once `locale` can be translated synchronously. The same promise is
 * returned while it loads, so React's `use()` can wait on it. A failed load
 * is forgotten, so the next call tries again.
 */
export function loadCatalogue(locale: Locale): Promise<void> {
  if (hasCatalogue(locale)) return Promise.resolve();
  arabicLoad ??= import(/* webpackChunkName: "i18n-ar" */ "./messages/ar").then(
    (module) => registerCatalogue("ar", module.ar),
    (error: unknown) => { arabicLoad = undefined; throw error; },
  );
  return arabicLoad;
}

/** The Arabic messages, once loaded; for helpers that read one namespace directly. */
export function arabicMessages(): Messages {
  const messages = CATALOGUES.ar;
  if (!messages) throw catalogueMissing("ar");
  return messages as unknown as Messages;
}

function catalogueMissing(locale: Locale): Error {
  return new Error(`[i18n] the "${locale}" catalogue is not loaded; await loadCatalogue("${locale}") or use useTranslatorFor("${locale}") first`);
}

/** Request/recipient scoped, never a mutable process-global language. */
export function createTranslator(locale: Locale): TFunction {
  const messages = CATALOGUES[locale];
  if (!messages) throw catalogueMissing(locale);
  return (key, vars) => translate({ messages, fallback: CATALOGUES.en!, locale }, key, vars);
}
