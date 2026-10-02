import { makeFormatters } from "../i18n/formatters";
import type { Locale } from "../i18n/locale";
import { createTranslator } from "../i18n/core";
import { toMajorString } from "../utils/money";

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvMetadataItem {
  label: string;
  value: CsvValue;
}

export interface CsvSection {
  title: string;
  headers: string[];
  rows: CsvValue[][];
  emptyMessage?: string;
}

const UTF8_BOM = "\uFEFF";
const FORMULA_PREFIX = /^\s*[=+\-@]/;

/**
 * Escapes one spreadsheet cell and prevents values from being interpreted as
 * formulas when the file is opened in Excel, Numbers, or Google Sheets.
 */
export function csvCell(value: CsvValue, locale: Locale = "en"): string {
  if (value === undefined || value === null) return "";
  const serialized = typeof value === "boolean" ? createTranslator(locale)(value ? "exportDocuments.phrases.yes" : "exportDocuments.phrases.no") : String(value);
  const safe = FORMULA_PREFIX.test(serialized) ? `'${serialized}` : serialized;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function csvRows(rows: CsvValue[][], locale: Locale = "en"): string {
  return rows.map((row) => row.map((value) => csvCell(value, locale)).join(",")).join("\r\n");
}

function exportPreamble(title: string, metadata: CsvMetadataItem[], rowCount?: number, locale: Locale = "en"): CsvValue[][] {
  const t = createTranslator(locale);
  return [
    [t("documents.csvTitle"), title],
    ...metadata.map((item) => [item.label, item.value]),
    ...(rowCount === undefined ? [] : [[t("documents.csvRowCount"), rowCount] satisfies CsvValue[]]),
    [],
  ];
}

/** Builds a UTF-8, Excel-friendly CSV with a short human-readable preamble. */
export function buildCsvDocument(input: {
  locale?: Locale;
  title: string;
  metadata?: CsvMetadataItem[];
  headers: string[];
  rows: CsvValue[][];
  emptyMessage?: string;
}): string {
  const tableRows = input.rows.length > 0
    ? [input.headers, ...input.rows]
    : [[...input.headers], [input.emptyMessage ?? createTranslator(input.locale ?? "en")("documents.csvNoRecords")]];
  return `${UTF8_BOM}${csvRows([
    ...exportPreamble(input.title, input.metadata ?? [], input.rows.length, input.locale),
    ...tableRows,
  ], input.locale)}\r\n`;
}

/**
 * Builds one readable CSV document containing multiple clearly separated
 * tables. This is used for a member's personal archive, where forcing profile,
 * membership, payment, visit, and activity records into one sparse table is
 * less useful than preserving their natural sections.
 */
export function buildSectionedCsvDocument(input: {
  locale?: Locale;
  title: string;
  metadata?: CsvMetadataItem[];
  sections: CsvSection[];
}): string {
  const rows: CsvValue[][] = [...exportPreamble(input.title, input.metadata ?? [], undefined, input.locale)];
  for (const [index, section] of input.sections.entries()) {
    if (index > 0) rows.push([]);
    rows.push([section.title]);
    rows.push(section.headers);
    rows.push(...(section.rows.length > 0 ? section.rows : [[section.emptyMessage ?? createTranslator(input.locale ?? "en")("documents.csvEmpty")]]));
  }
  return `${UTF8_BOM}${csvRows(rows, input.locale)}\r\n`;
}

export function formatExportDateTime(value: string | number | Date | undefined, timeZone: string, locale: Locale = "en"): string {
  if (value === undefined || value === "") return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  if (locale === "ar") {
    const f = makeFormatters(locale, createTranslator(locale)("common.time.now"), timeZone);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", second: "2-digit", hourCycle: "h12", numberingSystem: "latn" }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
    return `${f.date(date.toISOString())} ${part("hour")}:${part("minute")}:${part("second")} ${part("dayPeriod") === "AM" ? "ص" : "م"}`;
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")}`;
}

export function formatMinorUnits(amountMinor: number | undefined, currency = "JOD"): string {
  if (amountMinor === undefined || !Number.isFinite(amountMinor)) return "";
  return toMajorString({ amount: amountMinor, currency });
}

export function exportStatusLabel(value: string | undefined): string {
  if (!value) return "";
  const normalized = value.replaceAll("_", " ").replaceAll("-", " ").trim();
  return normalized ? normalized[0]!.toUpperCase() + normalized.slice(1) : "";
}

export function exportList(values: unknown): string {
  return Array.isArray(values)
    ? values.filter((value): value is string | number => typeof value === "string" || typeof value === "number").join("; ")
    : "";
}
