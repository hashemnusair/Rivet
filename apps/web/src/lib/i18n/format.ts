"use client";

import { createContext, createElement, useContext, useMemo, type ReactNode } from "react";
import { TENANT_TIMEZONE } from "@/lib/utils/dates";
import { makeFormatters, type Formatters } from "./formatters";
import { useLocale } from "./provider";
export { makeFormatters, type Formatters } from "./formatters";

const TimeZoneContext = createContext(TENANT_TIMEZONE);

export function FormattingProvider({ timeZone, children }: { timeZone?: string; children: ReactNode }) {
  return createElement(TimeZoneContext.Provider, { value: timeZone ?? TENANT_TIMEZONE }, children);
}

export function useFormattingTimeZone(): string { return useContext(TimeZoneContext); }

export function useFormat(): Formatters {
  const { locale, t } = useLocale();
  const timeZone = useContext(TimeZoneContext);
  const justNow = t("common.time.now");
  return useMemo(() => makeFormatters(locale, justNow, timeZone), [locale, justNow, timeZone]);
}
