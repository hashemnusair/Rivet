import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { translate, type MessageTree } from "@/lib/i18n/dictionary";
import type { TFunction } from "@/lib/i18n/provider";
import { en } from "@/lib/i18n/messages";

/**
 * A translate function that is always English. It is the default for the
 * exported form schemas and error helpers, which are plain functions (and are
 * tested as such); components pass the reader's own `t()` instead.
 */
const english = en as unknown as MessageTree;

export const englishT: TFunction = (key, vars) =>
  translate({ messages: english, fallback: english, locale: DEFAULT_LOCALE }, key, vars);
