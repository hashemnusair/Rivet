import type { MemberImportColumnMapping, MemberImportField, MemberImportRow } from "@/lib/api/GymOSApi";

export type ImportMatrix = string[][];

const FIELD_ALIASES: Record<MemberImportField, string[]> = {
  fullName: ["full_name", "fullname", "name", "member_name", "customer_name", "client_name", "اسم", "الاسم", "اسم_العضو", "اسم_العميل"],
  phone: ["phone", "phone_number", "mobile", "mobile_number", "telephone", "contact_number", "رقم", "الهاتف", "رقم_الهاتف", "موبايل"],
  email: ["email", "email_address", "e_mail", "mail", "البريد", "البريد_الالكتروني", "ايميل"],
};

export function parseCsvMatrix(value: string): ImportMatrix {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const next = value[index + 1];
    if (character === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === "," && !quoted) { row.push(cell.trim()); cell = ""; continue; }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell.trim()); cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export function normalizeImportHeader(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
}

export function inferMemberImportMapping(headers: string[]): MemberImportColumnMapping {
  const normalized = headers.map(normalizeImportHeader);
  const mapping: MemberImportColumnMapping = {};
  for (const field of Object.keys(FIELD_ALIASES) as MemberImportField[]) {
    const index = normalized.findIndex((header) => FIELD_ALIASES[field].includes(header));
    if (index >= 0) mapping[field] = index;
  }
  return mapping;
}

function csvCell(value: string | number | undefined): string {
  const raw = value == null ? "" : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

export function mappedMemberCsv(matrix: ImportMatrix, mapping: MemberImportColumnMapping): string {
  const rows = matrix.slice(1).filter((row) => row.some((cell) => cell.trim()));
  return [
    "full_name,phone,email",
    ...rows.map((row) => [mapping.fullName == null ? "" : row[mapping.fullName], mapping.phone == null ? "" : row[mapping.phone], mapping.email == null ? "" : row[mapping.email]].map(csvCell).join(",")),
  ].join("\r\n");
}

export function rejectedMemberRowsCsv(rows: MemberImportRow[]): string {
  const rejected = rows.filter((row) => row.status === "duplicate" || row.status === "invalid" || row.status === "skipped");
  return [
    "source_row,full_name,phone,email,result,reason",
    ...rejected.map((row) => [row.rowNumber, row.fullName, row.phone, row.email, row.status, row.errors.join("; ")].map(csvCell).join(",")),
  ].join("\r\n");
}
