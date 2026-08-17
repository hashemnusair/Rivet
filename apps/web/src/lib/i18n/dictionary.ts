import type { Locale } from "./config";
import { DEFAULT_LOCALE } from "./config";

/**
 * Message catalogue plumbing.
 *
 * Leaves are plain strings, except where a count changes the wording — those
 * are CLDR plural groups. Arabic genuinely uses all six categories (١ عضو,
 * عضوان, ٣ أعضاء, ١١ عضوًا …), so the selection goes through `Intl.PluralRules`
 * rather than the `n === 1` check an English-only codebase gets away with.
 */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  /** Required — the form used when no more specific category matches. */
  other: string;
}

export type MessageLeaf = string | PluralForms;

/**
 * Marks a plural group so its inferred type is the full `PluralForms` rather
 * than just the categories English happens to use. Without this, an English
 * catalogue with `{ one, other }` would forbid Arabic's `zero/two/few/many`.
 */
export function plural(forms: PluralForms): PluralForms {
  return forms;
}

export interface MessageTree {
  [key: string]: MessageLeaf | MessageTree;
}

type Join<K extends string, Rest extends string> = Rest extends "" ? K : `${K}.${Rest}`;

/** Every dot-path that resolves to a leaf, so `t()` cannot be handed a branch. */
export type MessagePath<T> = T extends string
  ? ""
  : T extends { other: string }
    ? ""
    : {
        [K in Extract<keyof T, string>]: Join<K, MessagePath<T[K]>>;
      }[Extract<keyof T, string>];

export type MessageVars = Record<string, string | number>;

function resolve(tree: MessageTree, path: string): MessageLeaf | undefined {
  let node: MessageLeaf | MessageTree | undefined = tree;
  for (const segment of path.split(".")) {
    if (node === undefined || typeof node === "string") return undefined;
    node = (node as MessageTree)[segment];
  }
  if (node === undefined) return undefined;
  if (typeof node === "string") return node;
  return "other" in node ? (node as PluralForms) : undefined;
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();

function pluralRules(locale: Locale): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale === "ar" ? "ar" : "en");
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

function selectForm(forms: PluralForms, locale: Locale, count: number): string {
  const category = pluralRules(locale).select(count);
  return forms[category] ?? forms.other;
}

/** `{name}` placeholders. Unknown placeholders are left visible rather than
 *  blanked, so a missing variable shows up in review instead of shipping. */
function interpolate(template: string, vars: MessageVars | undefined): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export interface TranslateOptions {
  /** The active catalogue. */
  messages: MessageTree;
  /** English, used when a key is missing from a non-default catalogue. */
  fallback: MessageTree;
  locale: Locale;
}

export function translate(
  { messages, fallback, locale }: TranslateOptions,
  path: string,
  vars?: MessageVars,
): string {
  const leaf = resolve(messages, path) ?? (locale === DEFAULT_LOCALE ? undefined : resolve(fallback, path));

  if (leaf === undefined) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] missing message "${path}" for locale "${locale}"`);
    }
    // The path itself is the least-bad visible fallback: it is obviously wrong
    // in review but never renders as an empty region in production.
    return path;
  }

  if (typeof leaf === "string") return interpolate(leaf, vars);

  const count = typeof vars?.count === "number" ? vars.count : 0;
  return interpolate(selectForm(leaf, locale, count), vars);
}
