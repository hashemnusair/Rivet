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
const FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/;
const CURRENCY_EXPONENTS: Record<string, number> = {
  AED: 2,
  BHD: 3,
  EUR: 2,
  GBP: 2,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  SAR: 2,
  TND: 3,
  USD: 2,
};

/**
 * Escapes one spreadsheet cell and prevents values from being interpreted as
 * formulas when the file is opened in Excel, Numbers, or Google Sheets.
 */
export function csvCell(value: CsvValue): string {
  if (value === undefined || value === null) return "";
  const serialized = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  const safe = FORMULA_PREFIX.test(serialized) ? `'${serialized}` : serialized;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function csvRows(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function exportPreamble(title: string, metadata: CsvMetadataItem[], rowCount?: number): CsvValue[][] {
  return [
    ["RIVET export", title],
    ...metadata.map((item) => [item.label, item.value]),
    ...(rowCount === undefined ? [] : [["Data rows", rowCount] satisfies CsvValue[]]),
    [],
  ];
}

/** Builds a UTF-8, Excel-friendly CSV with a short human-readable preamble. */
export function buildCsvDocument(input: {
  title: string;
  metadata?: CsvMetadataItem[];
  headers: string[];
  rows: CsvValue[][];
  emptyMessage?: string;
}): string {
  const tableRows = input.rows.length > 0
    ? [input.headers, ...input.rows]
    : [[...input.headers], [input.emptyMessage ?? "No records matched this export."]];
  return `${UTF8_BOM}${csvRows([
    ...exportPreamble(input.title, input.metadata ?? [], input.rows.length),
    ...tableRows,
  ])}\r\n`;
}

/**
 * Builds one readable CSV document containing multiple clearly separated
 * tables. This is used for a member's personal archive, where forcing profile,
 * membership, payment, visit, and activity records into one sparse table is
 * less useful than preserving their natural sections.
 */
export function buildSectionedCsvDocument(input: {
  title: string;
  metadata?: CsvMetadataItem[];
  sections: CsvSection[];
}): string {
  const rows: CsvValue[][] = [...exportPreamble(input.title, input.metadata ?? [])];
  for (const [index, section] of input.sections.entries()) {
    if (index > 0) rows.push([]);
    rows.push([section.title]);
    rows.push(section.headers);
    rows.push(...(section.rows.length > 0 ? section.rows : [[section.emptyMessage ?? "No records."]]));
  }
  return `${UTF8_BOM}${csvRows(rows)}\r\n`;
}

export function formatExportDateTime(value: string | number | Date | undefined, timeZone: string): string {
  if (value === undefined || value === "") return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
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
  const exponent = CURRENCY_EXPONENTS[currency.toUpperCase()] ?? 2;
  return (amountMinor / 10 ** exponent).toFixed(exponent);
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
