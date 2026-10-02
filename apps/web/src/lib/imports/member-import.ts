import type { MemberImportColumnMapping, MemberImportField, MemberImportRow } from "@/lib/api/GymOSApi";
import { buildCsvDocument, exportStatusLabel, formatMinorUnits } from "@/lib/exports/csv";

export type ImportMatrix = string[][];

const FIELD_ALIASES: Record<MemberImportField, string[]> = {
  fullName: ["full_name", "fullname", "name", "member", "member_name", "customer_name", "client_name", "اسم", "الاسم", "اسم_العضو", "اسم_العميل"],
  phone: ["phone", "phone_number", "mobile", "mobile_number", "telephone", "contact_number", "رقم", "الهاتف", "رقم_الهاتف", "موبايل"],
  gender: ["gender", "sex", "member_gender", "الجنس", "النوع"],
  email: ["email", "email_address", "e_mail", "mail", "البريد", "البريد_الالكتروني", "ايميل"],
  sourcePlanName: ["plan", "plan_name", "membership_plan", "package", "package_name", "subscription", "membership_type", "الخطة", "الباقة", "نوع_الاشتراك"],
  membershipStartDate: ["membership_start", "membership_start_date", "start_date", "subscription_start", "تاريخ_البداية", "بداية_الاشتراك"],
  membershipEndDate: ["membership_end", "membership_end_date", "end_date", "expiry", "expiry_date", "subscription_end", "تاريخ_النهاية", "تاريخ_الانتهاء"],
  remainingVisits: ["remaining_visits", "visits_left", "sessions_left", "remaining_sessions", "الزيارات_المتبقية", "الحصص_المتبقية"],
  freezeStartDate: ["freeze_start", "freeze_start_date", "frozen_from", "بداية_التجميد"],
  freezeEndDate: ["freeze_end", "freeze_end_date", "frozen_until", "نهاية_التجميد"],
  openingBalance: ["opening_balance", "outstanding_balance", "amount_due", "balance_due", "الرصيد_الافتتاحي", "المبلغ_المستحق"],
  historicalPaidTotal: ["historical_paid_total", "total_paid", "paid_to_date", "lifetime_paid", "اجمالي_المدفوع"],
  historicalPaymentDate: ["last_payment_date", "historical_payment_date", "payment_date", "تاريخ_اخر_دفعة"],
  historicalPaymentReference: ["payment_reference", "legacy_payment_reference", "receipt_reference", "مرجع_الدفع"],
};

export const OPTIONAL_MEMBERSHIP_IMPORT_FIELDS: Array<{ field: Exclude<MemberImportField, "fullName" | "phone" | "gender" | "email">; label: string }> = [
  { field: "sourcePlanName", label: "Current plan" },
  { field: "membershipStartDate", label: "Membership starts" },
  { field: "membershipEndDate", label: "Membership ends" },
  { field: "remainingVisits", label: "Visits remaining" },
  { field: "freezeStartDate", label: "Freeze starts" },
  { field: "freezeEndDate", label: "Freeze ends" },
  { field: "openingBalance", label: "Outstanding balance" },
  { field: "historicalPaidTotal", label: "Historical amount paid" },
  { field: "historicalPaymentDate", label: "Last historical payment" },
  { field: "historicalPaymentReference", label: "Historical payment reference" },
];

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
  const fields: MemberImportField[] = ["fullName", "phone", "gender", "email", ...OPTIONAL_MEMBERSHIP_IMPORT_FIELDS.map(({ field }) => field)];
  const headers: Record<MemberImportField, string> = {
    fullName: "full_name",
    phone: "phone",
    gender: "gender",
    email: "email",
    sourcePlanName: "source_plan_name",
    membershipStartDate: "membership_start_date",
    membershipEndDate: "membership_end_date",
    remainingVisits: "remaining_visits",
    freezeStartDate: "freeze_start_date",
    freezeEndDate: "freeze_end_date",
    openingBalance: "opening_balance",
    historicalPaidTotal: "historical_paid_total",
    historicalPaymentDate: "historical_payment_date",
    historicalPaymentReference: "historical_payment_reference",
  };
  return [
    fields.map((field) => headers[field]).join(","),
    ...rows.map((row) => fields.map((field) => mapping[field] == null ? "" : row[mapping[field]!]).map(csvCell).join(",")),
  ].join("\r\n");
}

export function sourcePlanNames(matrix: ImportMatrix, mapping: MemberImportColumnMapping): string[] {
  if (mapping.sourcePlanName == null) return [];
  return [...new Set(matrix.slice(1).map((row) => row[mapping.sourcePlanName!]?.trim()).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right));
}

export function rejectedMemberRowsCsv(rows: MemberImportRow[], currency = "JOD"): string {
  const rejected = rows.filter((row) => row.status === "duplicate" || row.status === "invalid" || row.status === "skipped");
  return buildCsvDocument({
    title: "Member import rows requiring attention",
    headers: ["Source row", "Full name", "Phone", "Gender", "Email", "Source plan", "Membership starts", "Membership ends", "Opening balance", "Currency", "Result", "What needs attention"],
    rows: rejected.map((row) => [row.rowNumber, row.fullName, row.phone, exportStatusLabel(row.gender), row.email, row.sourcePlanName, row.membershipStartDate, row.membershipEndDate, formatMinorUnits(row.openingBalanceMinor, currency), currency, exportStatusLabel(row.status), row.errors.join("; ")]),
    emptyMessage: "Every row passed preview; there are no rejected rows.",
  });
}
