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

/** Decimal major units -> minor units integer. */
export function fromMajor(major: number, currency = "JOD"): Money {
  const exp = exponentFor(currency);
  return { amount: Math.round(major * 10 ** exp), currency };
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string, locale: string, signDisplay?: Intl.NumberFormatOptions["signDisplay"]): Intl.NumberFormat {
  const key = `${locale}:${currency}:${signDisplay ?? "auto"}`;
  let f = formatterCache.get(key);
  if (!f) {
    const exp = exponentFor(currency);
    f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
      currencyDisplay: "code",
      signDisplay,
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
  /**
   * Let Intl place the sign. It belongs to the formatter because the position
   * differs by locale and the bidi marks around it have to match: Arabic emits
   * "\u200F\u200E-7.000 JOD", which a hand-prepended "−" cannot reproduce.
   */
  signDisplay?: Intl.NumberFormatOptions["signDisplay"];
}

export function formatMoney(m: Money, opts: FormatMoneyOptions = {}): string {
  const locale = opts.locale ?? "en-JO";
  const exp = exponentFor(m.currency);
  const major = m.amount / 10 ** exp;
  if (opts.compact && Math.abs(major) >= 1000) {
    if (opts.hideCurrency) {
      return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(major);
    }
    // One formatter call rather than currency + number concatenated: in Arabic
    // the compact suffix is a word ("ألف"), and gluing it to a code by hand
    // leaves bidi free to reorder the result.
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: m.currency,
      currencyDisplay: "code",
      notation: "compact",
      maximumFractionDigits: 1,
      signDisplay: opts.signDisplay,
    }).format(major);
  }
  if (opts.hideCurrency) {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: exp,
      maximumFractionDigits: exp,
      signDisplay: opts.signDisplay,
    }).format(major);
  }
  return formatterFor(m.currency, locale, opts.signDisplay).format(major);
}

/** "JOD 40.000" -> minor units. Accepts "40", "40.0", "40.000". */
export function parseMoneyInput(raw: string, currency = "JOD"): Money | null {
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return fromMajor(value, currency);
}
