"use client";

import { useCallback } from "react";
import type { AiErrorCategory, AiMessage, AiMessageParam } from "@/lib/ai/contracts";
import type { TKey } from "@/lib/i18n/core";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";

/**
 * Presents a server-built assistance message in the reader's language and
 * the gym's timezone. Only `aiWork.*` keys are rendered; anything else falls
 * back to a plain generic sentence, never a raw key.
 */
export function useAiMessage(): (message: AiMessage) => string {
  const { t, isolate } = useLocale();
  const format = useFormat();
  return useCallback((message: AiMessage) => {
    if (!message.key.startsWith("aiWork.")) return t("aiWork.goal.generic");
    const vars: Record<string, string | number> = {};
    for (const [name, value] of Object.entries(message.params ?? {}) as Array<[string, AiMessageParam]>) {
      if (typeof value === "number") vars[name] = name === "count" ? value : format.number(value);
      else if (typeof value === "string") vars[name] = value ? isolate(value) : value;
      else if ("date" in value) vars[name] = format.date(value.date);
      else if ("at" in value) vars[name] = format.dateTime(value.at);
      else if ("clock" in value) vars[name] = format.clock(value.clock);
      else if ("amountMinor" in value) vars[name] = format.money({ amount: value.amountMinor, currency: value.currency });
      else if ("enum" in value) {
        const key = value.enum === "contactOutcome" ? `memberProfile.contact.outcome.${value.value}` : value.enum === "exclusion" ? `aiWork.exclusion.${value.value}` : value.enum === "timeOfDay" ? `aiWork.timeOfDay.${value.value}` : value.enum === "renewalInterest" ? `aiWork.extract.interest.${value.value}` : `aiWork.settings.weekday.${value.value}`;
        vars[name] = t(key as TKey);
      }
    }
    return t(message.key as TKey, vars);
  }, [format, isolate, t]);
}

export function useAiErrorText(): (category: AiErrorCategory | undefined) => string {
  const { t } = useLocale();
  return useCallback((category) => t(`aiWork.error.${category ?? "internal"}` as TKey), [t]);
}
