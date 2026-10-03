"use client";

import type { ReactNode } from "react";
import type { Money } from "@/lib/domain/types";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { isCalendarDate } from "@/lib/utils/dates";
import { exponentFor, money, readMoneyInput, toMajorString, type MoneyInputResult } from "@/lib/utils/money";

/**
 * Small display helpers shared by the renew / collect payment / receipt
 * dialogs. English output is byte-identical to what these screens always
 * showed; other languages get the locale formatters and isolated values.
 */

/**
 * An amount embedded in a sentence or button ("Collect 20.000 JOD"). English
 * keeps its long-standing "20.000 JOD" shape; Arabic uses the product's
 * `JOD 20.000` shape, isolated so the sentence cannot reorder it.
 */
export function useAmountText(): (value: Money) => string {
  const { locale, isolateLtr } = useLocale();
  const format = useFormat();
  return (value) => (locale === "en" ? `${toMajorString(value)} ${value.currency}` : isolateLtr(format.money(value)));
}

/** A date people can read at a glance ("18 Nov 2026"). Half-typed input stays as typed. */
export function useReadableDate(): (value: string | undefined) => string {
  const format = useFormat();
  return (value) => (value && isCalendarDate(value) ? format.date(value) : value || "—");
}

type MoneyFailure = Extract<MoneyInputResult, { ok: false }>;

/**
 * The reason an amount could not be read. The reader in `lib/utils/money`
 * writes English, so English shows its own message unchanged; every other
 * language shows the matching catalogue sentence.
 */
export function useMoneyProblemText(): (failure: MoneyFailure, currency: string) => string {
  const { t, locale, isolateLtr } = useLocale();
  return (failure, currency) => {
    if (locale === "en") return failure.message;
    const code = currency.toUpperCase();
    const exp = exponentFor(code);
    switch (failure.problem) {
      case "empty":
        return t("renewFlow.moneyProblem.empty");
      case "not_a_number":
        return t("renewFlow.moneyProblem.not_a_number", { example: isolateLtr(toMajorString(money(40 * 10 ** exp, code))) });
      case "ambiguous_separator":
        return t("renewFlow.moneyProblem.ambiguous_separator", { grouped: isolateLtr(`1,250${exp ? `.${"0".repeat(exp)}` : ""}`) });
      case "negative":
        return t("renewFlow.moneyProblem.negative");
      case "too_precise":
        return exp === 0
          ? t("renewFlow.moneyProblem.whole_numbers", { code: isolateLtr(code) })
          : t("renewFlow.moneyProblem.too_precise", { code: isolateLtr(code), count: exp });
      case "currency_mismatch":
        return t("renewFlow.moneyProblem.currency_mismatch", { code: isolateLtr(code) });
      case "too_large":
        return t("renewFlow.moneyProblem.too_large");
      default:
        return failure.message;
    }
  };
}

/** Reads an amount typed by staff and returns the translated reason it cannot be used, or nothing when it reads cleanly. */
export function useMoneyInputError(): (raw: string, currency: string) => string | undefined {
  const problemText = useMoneyProblemText();
  return (raw, currency) => {
    const result = readMoneyInput(raw, currency);
    return result.ok ? undefined : problemText(result, currency);
  };
}

/** Wraps the first occurrence of `value` inside `text` in <strong>; plain text when it is not spelled as a digit. */
export function emphasize(text: string, value: string): ReactNode {
  const index = text.indexOf(value);
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <strong>{value}</strong>
      {text.slice(index + value.length)}
    </>
  );
}
