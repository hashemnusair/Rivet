import type { Money } from "@/lib/domain/types";

/** ISO 4217 minor-unit exponents for the currencies we care about. */
const EXPONENTS: Record<string, number> = {
  JOD: 3,
  USD: 2,
  EUR: 2,
  SAR: 2,
  AED: 2,
  KWD: 3,
  BHD: 3,
  OMR: 3,
};

export function exponentFor(currency: string): number {
  return EXPONENTS[currency.toUpperCase()] ?? 2;
}

export function money(amountMinor: number, currency = "JOD"): Money {
  return { amount: Math.round(amountMinor), currency };
}

export function zeroMoney(currency = "JOD"): Money {
  return { amount: 0, currency };
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount + b.amount, currency: a.currency };
}

export function subMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { amount: a.amount - b.amount, currency: a.currency };
}

export function negateMoney(a: Money): Money {
  return { amount: -a.amount, currency: a.currency };
}

export function isZero(a: Money): boolean {
  return a.amount === 0;
}

export function isPositive(a: Money): boolean {
  return a.amount > 0;
}

export function minMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return a.amount <= b.amount ? a : b;
}

export function maxMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return a.amount >= b.amount ? a : b;
}

function assertSameCurrency(a: Money, b: Money) {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

/** Minor units -> decimal string in major units, e.g. 40000 -> "40.000" (JOD). */
export function toMajor(m: Money): number {
  return m.amount / 10 ** exponentFor(m.currency);
}

/**
 * Minor units -> plain decimal text in major units at the currency's own
 * precision and with no grouping: 40000 JOD -> "40.000", 4000 USD -> "40.00".
 * Integer arithmetic only, so nothing drifts on the way to a receipt, a
 * prefilled input or a button label.
 */
export function toMajorString(m: Money): string {
  const exp = exponentFor(m.currency);
  const scale = 10 ** exp;
  const abs = Math.abs(Math.round(m.amount));
  const whole = Math.floor(abs / scale);
  const fraction = abs % scale;
  const digits = exp > 0 ? `.${String(fraction).padStart(exp, "0")}` : "";
  return `${m.amount < 0 ? "-" : ""}${whole}${digits}`;
}

/** "JOD" -> "Jordanian Dinar" for receipt footers; falls back to the code. */
export function currencyDisplayName(currency: string, locale = "en"): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.DisplayNames([locale], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Decimal major units -> minor units integer. */
export function fromMajor(major: number, currency = "JOD"): Money {
  const exp = exponentFor(currency);
  return { amount: Math.round(major * 10 ** exp), currency };
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string, locale: string): Intl.NumberFormat {
  const key = `${locale}:${currency}`;
  let f = formatterCache.get(key);
  if (!f) {
    const exp = exponentFor(currency);
    f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
      currencyDisplay: "code",
    });
    formatterCache.set(key, f);
  }
  return f;
}

export interface FormatMoneyOptions {
  locale?: string;
  /** Drop the currency code (useful inside tables where a column header carries it). */
  hideCurrency?: boolean;
  /** Render as compact thousands, e.g. JOD 12.5K — dashboards only. */
  compact?: boolean;
}

export function formatMoney(m: Money, opts: FormatMoneyOptions = {}): string {
  const locale = opts.locale ?? "en-JO";
  const exp = exponentFor(m.currency);
  const major = m.amount / 10 ** exp;
  if (opts.compact && Math.abs(major) >= 1000) {
    const compacted = new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(major);
    return opts.hideCurrency ? compacted : `${m.currency} ${compacted}`;
  }
  if (opts.hideCurrency) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
    }).format(major);
  }
  return formatterFor(m.currency, locale).format(major);
}

// ---------------------------------------------------------------------------
// Typed and pasted amounts
// ---------------------------------------------------------------------------

/**
 * Why an amount could not be read. The message is written for the operator
 * and names the rule, so a paste that was silently misread before now fails
 * loudly instead of charging the wrong number.
 */
export type MoneyInputProblem =
  | "empty"
  | "not_a_number"
  | "ambiguous_separator"
  | "negative"
  | "too_precise"
  | "currency_mismatch"
  | "too_large";

export type MoneyInputResult =
  | { ok: true; money: Money }
  | { ok: false; problem: MoneyInputProblem; message: string };

/**
 * Text staff type or paste for a currency beyond its ISO code. The gym's own
 * currency is stripped; any other currency's text is a mismatch, never a hint.
 */
const CURRENCY_ALIASES: Record<string, string[]> = {
  JOD: ["JD", "JDS", "DINAR", "DINARS", "د.ا", "دينار", "دنانير"],
  USD: ["$", "US$", "DOLLAR", "DOLLARS"],
  EUR: ["€", "EURO", "EUROS"],
  SAR: ["SR", "RIYAL", "RIYALS", "ر.س", "ريال"],
  AED: ["DH", "DHS", "DIRHAM", "DIRHAMS", "د.إ", "درهم"],
  KWD: ["KD", "د.ك"],
  BHD: ["BD", "د.ب"],
  OMR: ["RO", "ر.ع."],
};

const ALIAS_TO_CURRENCY = new Map<string, string>();
for (const [code, aliases] of Object.entries(CURRENCY_ALIASES)) {
  ALIAS_TO_CURRENCY.set(code, code);
  for (const alias of aliases) ALIAS_TO_CURRENCY.set(alias.toUpperCase(), code);
}

/**
 * Arabic-Indic (٠…٩) and Extended Arabic-Indic (۰…۹) digits map one-to-one
 * onto 0…9, as do the Arabic decimal (٫) and thousands (٬) separators. That
 * is a lossless translation, not a guess, so it is always applied.
 */
export function toWesternDigits(text: string): string {
  return text
    .replace(/[٠-٩۰-۹]/g, (ch) => {
      const code = ch.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/[−–—]/g, "-");
}

const CURRENCY_WORD = /US\$|[$€£]|[A-Za-z]+|[ء-ي][ء-ي.]*/gi;
const GROUPED_WITH_SPACES = /^-?\d{1,3}( \d{3})+(\.\d*)?$/;
const GROUPED_WITH_COMMAS = /^-?(\d{1,3}(,\d{3})+|\d+)?(\.\d*)?$/;

/**
 * Reads an amount typed or pasted by staff under the product's one number
 * policy: Western digits (Arabic-Indic digits are translated), a dot for
 * decimals, commas or spaces only as thousands groups of three, at most the
 * currency's own number of decimal places, no sign, and the gym's currency
 * only. Anything else is rejected with a reason rather than reinterpreted:
 * "1,2" is not 12, "1e3" is not 13, "USD 40" is not JOD 40, and "40.0005" is
 * not rounded to 40.001 behind the operator's back.
 */
export function readMoneyInput(raw: string, currency = "JOD"): MoneyInputResult {
  const code = currency.toUpperCase();
  const exp = exponentFor(code);
  const example = toMajorString(money(40 * 10 ** exp, code));
  const fail = (problem: MoneyInputProblem, message: string): MoneyInputResult => ({ ok: false, problem, message });

  let text = toWesternDigits(raw).replace(/[\u00a0\u202f\u2009]/g, " ").trim();
  if (!text) return fail("empty", "Enter an amount.");

  let mismatch: string | undefined;
  let unreadable = false;
  text = text.replace(CURRENCY_WORD, (word: string, offset: number, source: string) => {
    const owner = ALIAS_TO_CURRENCY.get(word.toUpperCase());
    if (owner === code) {
      // Currency labels may surround the amount, but must never join digits
      // into a thousands group (for example, "1JOD250" becoming "1 250").
      if (/\d/.test(source.slice(0, offset)) && /\d/.test(source.slice(offset + word.length))) unreadable = true;
      return " ";
    }
    if (owner) mismatch = owner;
    else unreadable = true;
    return " ";
  });
  if (mismatch) return fail("currency_mismatch", `Enter the amount in ${code}, not ${mismatch}.`);
  if (unreadable) return fail("not_a_number", `Enter the amount as a number, e.g. ${example}.`);

  text = text.trim();
  if (!text) return fail("empty", "Enter an amount.");
  if (/\s/.test(text)) {
    if (!GROUPED_WITH_SPACES.test(text)) return fail("ambiguous_separator", `Use a dot for decimals and commas only to group thousands, e.g. 1,250${exp ? `.${"0".repeat(exp)}` : ""}.`);
    text = text.replace(/ /g, "");
  }
  if (!/^[-\d.,]+$/.test(text)) return fail("not_a_number", `Enter the amount as a number, e.g. ${example}.`);
  if (text.includes(",") && !GROUPED_WITH_COMMAS.test(text)) return fail("ambiguous_separator", `Use a dot for decimals and commas only to group thousands, e.g. 1,250${exp ? `.${"0".repeat(exp)}` : ""}.`);
  if ((text.match(/\./g) ?? []).length > 1) return fail("ambiguous_separator", `Use one dot for decimals, e.g. ${example}.`);
  if (!GROUPED_WITH_COMMAS.test(text)) return fail("not_a_number", `Enter the amount as a number, e.g. ${example}.`);

  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [wholeText = "", fractionText = ""] = unsigned.replace(/,/g, "").split(".");
  if (!wholeText && !fractionText) return fail("not_a_number", `Enter the amount as a number, e.g. ${example}.`);
  if (fractionText.length > exp && /[1-9]/.test(fractionText.slice(exp))) {
    return fail("too_precise", exp === 0 ? `${code} amounts are whole numbers.` : `${code} amounts use up to ${exp} decimal place${exp === 1 ? "" : "s"}.`);
  }
  const whole = Number(wholeText || "0");
  const fraction = Number((fractionText.slice(0, exp) || "").padEnd(exp, "0") || "0");
  const minor = whole * 10 ** exp + fraction;
  if (!Number.isSafeInteger(minor)) return fail("too_large", "That amount is too large.");
  if (negative) return fail("negative", "Enter a positive amount.");
  return { ok: true, money: { amount: minor, currency } };
}

/** The operator-facing reason an amount is unusable, or nothing when it reads cleanly. */
export function moneyInputError(raw: string, currency = "JOD"): string | undefined {
  const result = readMoneyInput(raw, currency);
  return result.ok ? undefined : result.message;
}

/** "JOD 40.000" -> minor units, or null when the text cannot be read under the input policy. */
export function parseMoneyInput(raw: string, currency = "JOD"): Money | null {
  const result = readMoneyInput(raw, currency);
  return result.ok ? result.money : null;
}
