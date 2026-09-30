import { DEFAULT_LOCALE, type Locale } from "./config";

/**
 * Message catalogue plumbing.
 *
 * Leaves are plain strings, except where a count changes the wording; those are
 * plural groups. Arabic uses all six CLDR categories (zero, one, two, few, many,
 * other), so selection goes through `Intl.PluralRules` rather than an `n === 1`
 * check. Plural groups are branded, not detected by shape, because ordinary
 * vocabulary such as `leadSource.other` also has an `other` key.
 */
const PLURAL_BRAND: unique symbol = Symbol("rivet.plural");

export interface PluralCategories {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  /** Required: the form used when no more specific category matches. */
  other: string;
}

export type PluralForms = PluralCategories & { readonly [PLURAL_BRAND]: true };

export type MessageLeaf = string | PluralForms;

/**
 * Marks a plural group so its inferred type is the full `PluralForms` rather
 * than just the categories English happens to use. Usage: `plural({ one: "{count} member", other: "{count} members" })`.
 */
export function plural(forms: PluralCategories): PluralForms {
  return Object.defineProperty({ ...forms }, PLURAL_BRAND, { value: true }) as PluralForms;
}

export interface MessageTree {
  [key: string]: MessageLeaf | MessageTree;
}

/** An Arabic catalogue may lag English; the Vitest parity check enforces completeness. */
export type DeepPartial<T> = T extends string | PluralForms ? T : { [K in keyof T]?: DeepPartial<T[K]> };

type Join<K extends string, Rest extends string> = Rest extends "" ? K : `${K}.${Rest}`;

/** Every dot-path that resolves to a leaf, so `t()` cannot be handed a branch. */
export type MessagePath<T> = T extends string
  ? ""
  : T extends PluralForms
    ? ""
    : {
        [K in Extract<keyof T, string>]: Join<K, MessagePath<T[K]>>;
      }[Extract<keyof T, string>];

export type MessageVars = Record<string, string | number>;

export function isPluralForms(node: unknown): node is PluralForms {
  return typeof node === "object" && node !== null && (node as Record<symbol, unknown>)[PLURAL_BRAND] === true;
}

function resolve(tree: MessageTree, path: string): MessageLeaf | undefined {
  let node: MessageLeaf | MessageTree | undefined = tree;
  for (const segment of path.split(".")) {
    if (node === undefined || typeof node === "string") return undefined;
    node = (node as MessageTree)[segment];
  }
  if (node === undefined) return undefined;
  if (typeof node === "string") return node;
  // A branch reached instead of a leaf means `t()` was handed a partial path.
  return isPluralForms(node) ? node : undefined;
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();

function pluralRules(locale: Locale): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

export function selectPluralForm(forms: PluralCategories, locale: Locale, count: number): string {
  const category = pluralRules(locale).select(count);
  return forms[category] ?? forms.other;
}

/** `{name}` placeholders. A missing variable stays visible so review catches it. */
export function interpolate(template: string, vars: MessageVars | undefined): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Names of the `{param}` placeholders in one template. */
export function placeholdersOf(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string);
}

export interface TranslateOptions {
  /** The active catalogue. */
  messages: MessageTree;
  /** English, used when a key is missing from a non-default catalogue. */
  fallback: MessageTree;
  locale: Locale;
}

const warned = new Set<string>();

export function translate({ messages, fallback, locale }: TranslateOptions, path: string, vars?: MessageVars): string {
  let leaf = resolve(messages, path);
  let leafLocale = locale;

  if (leaf === undefined && locale !== DEFAULT_LOCALE) {
    leaf = resolve(fallback, path);
    leafLocale = DEFAULT_LOCALE;
    if (leaf !== undefined && process.env.NODE_ENV !== "production") {
      const id = `${locale}:${path}`;
      if (!warned.has(id)) {
        warned.add(id);
        console.warn(`[i18n] missing "${locale}" message "${path}"; showing English`);
      }
    }
  }

  if (leaf === undefined) {
    if (process.env.NODE_ENV !== "production") console.warn(`[i18n] unknown message key "${path}"`);
    // The key is obviously wrong in review but never renders as an empty region.
    return path;
  }

  if (typeof leaf === "string") return interpolate(leaf, vars);

  const count = typeof vars?.count === "number" ? vars.count : 0;
  return interpolate(selectPluralForm(leaf, leafLocale, count), vars);
}
