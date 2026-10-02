import { createTranslator, type TKey } from "../i18n/core";
import type { Locale } from "../i18n/locale";
import { makeFormatters } from "../i18n/formatters";
import { exportDocuments } from "../i18n/messages/en/exportDocuments";
import { domain } from "../i18n/messages/en/domain";
import { errorValues } from "../i18n/messages/en/errorValues";
import { exportStatusLabel, formatExportDateTime } from "./csv";
import { presentSystemText } from "../i18n/system-messages";

// Used only at code-owned header/label callsites. Never translate cell values by
// comparing their text: a member, note or plan may have the same name as a label.
const LABEL_KEYS = new Map(Object.entries(exportDocuments.labels).map(([key, value]) => [value, `exportDocuments.labels.${key}` as TKey]));
const ENUM_KEYS = new Map<string, TKey>();
for (const group of ["status", "role"] as const) {
  for (const code of Object.keys(errorValues[group])) ENUM_KEYS.set(code, `errorValues.${group}.${code}` as TKey);
}
for (const group of Object.keys(domain) as Array<keyof typeof domain>) {
  for (const code of Object.keys(domain[group])) ENUM_KEYS.set(code, `domain.${group}.${code}` as TKey);
}
for (const code of Object.keys(exportDocuments.values)) ENUM_KEYS.set(code, `exportDocuments.values.${code}` as TKey);

export function exportLocale(value: unknown): Locale { return value === "ar" ? "ar" : "en"; }

/** A human download's language is chosen once when it is requested. */
export function makeExportCopy(locale: Locale) {
  const t = createTranslator(locale);
  const label = (source: string): string => {
    const key = LABEL_KEYS.get(source);
    return key ? t(key) : source;
  };
  const status = (code: string | undefined): string => {
    if (!code) return "";
    // Existing English exports keep their published spelling. Unknown codes in
    // Arabic stay verbatim, rather than guessing a translation of stored text.
    if (locale === "en") return exportStatusLabel(code);
    const key = ENUM_KEYS.get(code);
    return key ? t(key) : code;
  };
  const date = (value: string | undefined): string => {
    if (!value) return "";
    if (locale === "en" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return value;
    return makeFormatters(locale, t("common.time.now"), "UTC").date(value);
  };
  const dateTime = (value: string | number | Date | undefined, timezone: string): string =>
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? date(value) : formatExportDateTime(value, timezone, locale);
  const clock = (value: string | undefined): string => !value ? "" : locale === "ar" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? makeFormatters(locale, t("common.time.now"), "UTC").clock(value) : value;
  const scope = (value: string, branchName?: string): string => {
    if (locale === "en") return branchName ?? value;
    if (value === "all accessible branches" || value === "all branches" || value === "All accessible branches") return label("All accessible branches");
    const assigned = value.match(/^(\d+) assigned branches$/);
    if (assigned) return t("exportDocuments.assignedBranches", { count: Number(assigned[1]) });
    if (value.startsWith("branch:")) return t("exportDocuments.phrases.branch", { value: branchName ?? value.slice(7) });
    return value;
  };
  const filters = (values: Record<string, unknown>): string => {
    const entries = Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== "");
    return entries.length ? entries.map(([key, value]) => {
      const heading = Object.hasOwn(exportDocuments.filters, key) ? t(`exportDocuments.filters.${key}` as TKey) : exportStatusLabel(key);
      const content = typeof value === "string" && (key === "from" || key === "to") ? date(value) : typeof value === "string" && (key === "status" || key === "type") ? status(value) : String(value);
      return `${heading}: ${content}`;
    }).join("; ") : label("None");
  };
  const paymentExplanation = (type: string, state: string, original?: string): string | undefined => {
    if (locale === "en") return original;
    // These finance fields are generated entirely from type/status by both APIs.
    if (state === "voided" || type === "void") return t("customerPortal.voidExplanation");
    if (state === "refunded" || type === "refund") return t("customerPortal.refundExplanation");
    if (state === "partially_refunded") return t("customerPortal.partialRefundExplanation");
    if (type === "retail_sale") return t("customerPortal.retailExplanation");
    if (type === "payment") return t("customerPortal.paymentExplanation");
    return original;
  };
  const systemText = (original: string | undefined, message: unknown, timezone: string): string =>
    presentSystemText(original, message, { locale, t, format: makeFormatters(locale, t("common.time.now"), timezone) });
  return { locale, t, label, status, date, dateTime, clock, scope, filters, paymentExplanation, systemText };
}
