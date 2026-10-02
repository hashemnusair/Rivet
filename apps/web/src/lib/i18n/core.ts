import type { Locale } from "./locale";
import { translate, type MessagePath, type MessageTree, type MessageVars } from "./dictionary";
import { ar, en, type Messages } from "./messages";

export type TKey = MessagePath<Messages>;
export type TFunction = (key: TKey, vars?: MessageVars) => string;
export interface MessageDescriptor { key: TKey; params?: MessageVars }
const CATALOGUES = { en, ar } as unknown as Record<Locale, MessageTree>;

/** Request/recipient scoped, never a mutable process-global language. */
export function createTranslator(locale: Locale): TFunction {
  return (key, vars) => translate({ messages: CATALOGUES[locale], fallback: CATALOGUES.en, locale }, key, vars);
}
