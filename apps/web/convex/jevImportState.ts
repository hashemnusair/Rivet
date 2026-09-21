import type { JevCandidate, JevJudgment, JevState } from "./jevRegistry";

/**
 * Import assistance, the deterministic half. Everything Jev is asked about a
 * spreadsheet passes through here: how a column is summarised without its
 * values, which RIVET fields a column may legitimately fill, how a legacy plan
 * label is parsed and compared with a current plan's exact terms, and how a
 * judgment becomes an outcome the page may offer. Pure and shared by the
 * Convex loaders, the preview adapter and the page. No Convex imports.
 */

// ---------------------------------------------------------------------------
// Destination fields
// ---------------------------------------------------------------------------

export type ImportField =
  | "fullName"
  | "phone"
  | "gender"
  | "email"
  | "sourcePlanName"
  | "membershipStartDate"
  | "membershipEndDate"
  | "remainingVisits"
  | "freezeStartDate"
  | "freezeEndDate"
  | "openingBalance"
  | "historicalPaidTotal"
  | "historicalPaymentDate"
  | "historicalPaymentReference";

export type ImportValueKind = "text" | "number" | "date" | "phone" | "email" | "category" | "any";

export interface ImportFieldSpec {
  field: ImportField;
  label: string;
  description: string;
  expects: ImportValueKind;
}

/** What each RIVET field holds, in the words the model and the page both see. */
export const IMPORT_FIELD_SPECS: readonly ImportFieldSpec[] = [
  { field: "fullName", label: "Full name", description: "The member's full name as written by the previous system.", expects: "text" },
  { field: "phone", label: "Phone", description: "The member's mobile or phone number; Jordanian local formats and international numbers.", expects: "phone" },
  { field: "gender", label: "Gender", description: "Male or female, also M/F or the Arabic equivalents; a column with very few distinct values.", expects: "category" },
  { field: "email", label: "Email", description: "The member's email address.", expects: "email" },
  { field: "sourcePlanName", label: "Current plan", description: "The name or label of the membership plan or package the member is on in the previous system.", expects: "category" },
  { field: "membershipStartDate", label: "Membership starts", description: "The date the current membership term started.", expects: "date" },
  { field: "membershipEndDate", label: "Membership ends", description: "The date the current membership term ends or expires.", expects: "date" },
  { field: "remainingVisits", label: "Visits remaining", description: "Whole number of visits or sessions still unused on a visit-based plan.", expects: "number" },
  { field: "freezeStartDate", label: "Freeze starts", description: "The date a currently active freeze began.", expects: "date" },
  { field: "freezeEndDate", label: "Freeze ends", description: "The date the current freeze ends.", expects: "date" },
  { field: "openingBalance", label: "Outstanding balance", description: "Money the member still owes at the migration cutoff, in the gym's currency.", expects: "number" },
  { field: "historicalPaidTotal", label: "Historical amount paid", description: "Money the member has paid in the previous system, kept as read-only history.", expects: "number" },
  { field: "historicalPaymentDate", label: "Last historical payment", description: "The date of the member's last payment in the previous system.", expects: "date" },
  { field: "historicalPaymentReference", label: "Historical payment reference", description: "A receipt or payment reference from the previous system, kept as text.", expects: "text" },
];

export const IMPORT_FIELDS: readonly ImportField[] = IMPORT_FIELD_SPECS.map((spec) => spec.field);
const FIELD_BY_KEY = new Map(IMPORT_FIELD_SPECS.map((spec) => [spec.field, spec] as const));

export function importFieldSpec(field: string): ImportFieldSpec | undefined {
  return FIELD_BY_KEY.get(field as ImportField);
}

export function isImportField(value: unknown): value is ImportField {
  return typeof value === "string" && FIELD_BY_KEY.has(value as ImportField);
}

// ---------------------------------------------------------------------------
// Column summaries: shape without content
// ---------------------------------------------------------------------------

export const IMPORT_MAX_COLUMNS = 100;
export const IMPORT_MAX_HEADING_LENGTH = 160;
export const IMPORT_MAX_PLAN_LABELS = 200;
export const IMPORT_MAX_PLAN_LABEL_LENGTH = 120;
export const IMPORT_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
/** Distinct values are counted up to this cap; the summary never carries the values themselves. */
const DISTINCT_CAP = 1_000;

export interface ImportColumnSummary {
  index: number;
  heading: string;
  filled: number;
  empty: number;
  /** Distinct non-empty values, capped; a cardinality signal only. */
  distinct: number;
  numeric: number;
  dateLike: number;
  phoneLike: number;
  emailLike: number;
  alphabetic: number;
  arabicScript: number;
  minLength: number;
  maxLength: number;
}

const NUMERIC = /^[+-]?(?:\d{1,3}(?:[,\s]\d{3})+|\d+)(?:[.,]\d+)?$/;
const DATE_LIKE = /^(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/;
const PHONE_LIKE = /^\+?[\d\s().-]{7,20}$/;
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ARABIC_LETTER = /[؀-ۿ]/;
const LETTER = /\p{L}/u;
const ARABIC_DIGITS = /[٠-٩]/g;

function westernDigits(value: string): string {
  return value.replace(ARABIC_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x0660));
}

export function summarizeImportColumn(index: number, heading: string, values: readonly string[]): ImportColumnSummary {
  const summary: ImportColumnSummary = { index, heading: heading.slice(0, IMPORT_MAX_HEADING_LENGTH), filled: 0, empty: 0, distinct: 0, numeric: 0, dateLike: 0, phoneLike: 0, emailLike: 0, alphabetic: 0, arabicScript: 0, minLength: 0, maxLength: 0 };
  const seen = new Set<string>();
  for (const raw of values) {
    const value = (raw ?? "").trim();
    if (!value) { summary.empty += 1; continue; }
    summary.filled += 1;
    if (seen.size < DISTINCT_CAP) seen.add(value.toLocaleLowerCase());
    const length = value.length;
    summary.minLength = summary.minLength === 0 && summary.filled === 1 ? length : Math.min(summary.minLength, length);
    summary.maxLength = Math.max(summary.maxLength, length);
    const western = westernDigits(value);
    const digits = western.replace(/\D/g, "").length;
    if (EMAIL_LIKE.test(value)) summary.emailLike += 1;
    else if (DATE_LIKE.test(western)) summary.dateLike += 1;
    else if (NUMERIC.test(western)) { summary.numeric += 1; if (digits >= 7 && digits <= 15 && !/[.,]\d{1,2}$/.test(western)) summary.phoneLike += 1; }
    else if (PHONE_LIKE.test(western) && digits >= 7) summary.phoneLike += 1;
    if (ARABIC_LETTER.test(value)) summary.arabicScript += 1;
    if (LETTER.test(value) && digits < value.length / 2) summary.alphabetic += 1;
  }
  summary.distinct = seen.size;
  return summary;
}

export function summarizeImportColumns(matrix: readonly (readonly string[])[]): ImportColumnSummary[] {
  const headers = matrix[0] ?? [];
  const rows = matrix.slice(1);
  return headers.slice(0, IMPORT_MAX_COLUMNS).map((heading, index) => summarizeImportColumn(index, heading, rows.map((row) => row[index] ?? "")));
}

/** Which kinds of value a column's summary makes plausible, from its shape alone. */
export function columnValueKinds(summary: ImportColumnSummary): ImportValueKind[] {
  if (summary.filled === 0) return ["any"];
  const share = (count: number) => count / summary.filled;
  const kinds: ImportValueKind[] = [];
  if (share(summary.emailLike) >= 0.6) kinds.push("email");
  if (share(summary.dateLike) >= 0.6) kinds.push("date");
  if (share(summary.phoneLike) >= 0.6) kinds.push("phone");
  if (share(summary.numeric) >= 0.6) kinds.push("number");
  if (share(summary.alphabetic) >= 0.5 && share(summary.numeric) < 0.5 && share(summary.emailLike) < 0.5) kinds.push("text");
  if (summary.distinct <= Math.max(6, Math.ceil(summary.filled * 0.05)) && share(summary.dateLike) < 0.6 && share(summary.emailLike) < 0.6 && share(summary.numeric) < 0.6 && share(summary.phoneLike) < 0.6) kinds.push("category");
  return kinds.length ? kinds : ["text"];
}

/** A field may be offered for a column only when the column's shape can hold that field's values. */
export function columnCompatibleWith(summary: ImportColumnSummary, field: ImportField): boolean {
  const spec = FIELD_BY_KEY.get(field);
  if (!spec) return false;
  const kinds = columnValueKinds(summary);
  if (kinds.includes("any")) return true;
  switch (spec.expects) {
    case "email": return kinds.includes("email");
    case "date": return kinds.includes("date");
    case "phone": return kinds.includes("phone") || (kinds.includes("number") && summary.maxLength >= 7);
    case "number": return kinds.includes("number") && !kinds.includes("phone");
    case "category": return kinds.includes("category") || kinds.includes("text");
    case "text": return kinds.includes("text") || kinds.includes("category");
    default: return true;
  }
}

// ---------------------------------------------------------------------------
// Column question: state and candidates
// ---------------------------------------------------------------------------

export const COLUMN_LEAVE_UNMAPPED = "leave_unmapped";
export const COLUMN_UNCLEAR = "unclear";
export const PLAN_NO_EQUIVALENT = "no_equivalent";
export const PLAN_NEEDS_REVIEW = "needs_review";

export interface ImportAssistDraftData {
  id: string;
  branchId: string;
  headers: string[];
  columns: ImportColumnSummary[];
  sourcePlanLabels: Array<{ label: string; rows: number }>;
}

export function normalizeHeading(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "");
}

export function normalizePlanLabel(value: string): string {
  return westernDigits(value.normalize("NFKC")).toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function shares(summary: ImportColumnSummary): Record<string, number> {
  const share = (count: number) => (summary.filled ? Math.round((count / summary.filled) * 100) / 100 : 0);
  return { numeric: share(summary.numeric), dateLike: share(summary.dateLike), phoneLike: share(summary.phoneLike), emailLike: share(summary.emailLike), alphabetic: share(summary.alphabetic), arabicScript: share(summary.arabicScript) };
}

export interface ColumnTargetBuild {
  state: JevState;
  candidates: JevCandidate[];
  scopeKey: string;
  sourceVersion: string;
  offeredFields: ImportField[];
}

/**
 * The state Jev sees for one column: its heading, the other headings (as
 * context only), a shape summary and which fields are already taken. The
 * candidates are the compatible, still-unassigned fields plus the two
 * non-field outcomes. No cell values are ever included.
 */
export function buildColumnTargetState(input: { draft: ImportAssistDraftData; columnIndex: number; assignedFields: ImportField[]; currency: string }): ColumnTargetBuild | undefined {
  const column = input.draft.columns.find((candidate) => candidate.index === input.columnIndex);
  if (!column) return undefined;
  const assigned = new Set(input.assignedFields);
  const offeredFields = IMPORT_FIELDS.filter((field) => !assigned.has(field) && columnCompatibleWith(column, field));
  const candidates: JevCandidate[] = [
    ...offeredFields.map((field) => {
      const spec = FIELD_BY_KEY.get(field)!;
      return { id: field, description: `${spec.label}: ${spec.description} Expects ${spec.expects === "any" ? "any value" : `${spec.expects} values`}.` };
    }),
    { id: COLUMN_LEAVE_UNMAPPED, description: "This column holds nothing RIVET imports (for example notes, addresses, internal ids or a second phone). Leave it out." },
    { id: COLUMN_UNCLEAR, description: "The heading and the value summary do not identify one RIVET field; a person should decide." },
  ];
  const state: JevState = {
    task: "Match one spreadsheet column from a gym's previous member system to the RIVET field it should fill.",
    column: { position: column.index + 1, heading: column.heading, normalizedHeading: normalizeHeading(column.heading) },
    otherHeadings: input.draft.headers.filter((_, index) => index !== column.index).slice(0, IMPORT_MAX_COLUMNS),
    valueShape: {
      filledCells: column.filled,
      emptyCells: column.empty,
      distinctValues: column.distinct,
      shares: shares(column),
      lengthRange: [column.minLength, column.maxLength],
      plausibleKinds: columnValueKinds(column),
    },
    alreadyAssigned: [...assigned].map((field) => FIELD_BY_KEY.get(field)?.label ?? field),
    gymCurrency: input.currency,
  };
  return { state, candidates, scopeKey: `import-draft:${input.draft.id}:column:${column.index}`, sourceVersion: "import-column:1", offeredFields };
}

export type ColumnSuggestionOutcome =
  | { kind: "field"; field: ImportField; label: string; probability: number }
  | { kind: "leave_unmapped"; probability: number }
  | { kind: "unclear"; probability: number };

/** Turn a validated judgment into an outcome; anything outside the offered fields is treated as unclear. */
export function resolveColumnSuggestion(judgment: JevJudgment, offeredFields: readonly ImportField[]): ColumnSuggestionOutcome {
  if (judgment.kind !== "choice") return { kind: "unclear", probability: 0 };
  const probability = judgment.probabilities[judgment.choice] ?? 0;
  if (judgment.choice === COLUMN_LEAVE_UNMAPPED) return { kind: "leave_unmapped", probability };
  if (isImportField(judgment.choice) && offeredFields.includes(judgment.choice)) return { kind: "field", field: judgment.choice, label: FIELD_BY_KEY.get(judgment.choice)!.label, probability };
  return { kind: "unclear", probability };
}

// ---------------------------------------------------------------------------
// Legacy plan labels: deterministic parsing and comparison
// ---------------------------------------------------------------------------

export interface PlanTerms {
  id: string;
  name: string;
  code?: string;
  kind: "time" | "visits";
  durationDays?: number;
  visitAllowance?: number;
  visitValidityDays?: number;
  priceMinor: number;
  currency: string;
  branchAccess: "all" | "selected";
  branchIds: string[];
  status: "active" | "archived";
}

export interface ParsedPlanLabel {
  durationDays?: number;
  visits?: number;
  priceMinor?: number;
  currency?: string;
  tokens: string[];
}

const START = "(?<![\\p{L}\\p{N}])";
const END = "(?![\\p{L}\\p{N}])";
const words = (alternatives: string) => new RegExp(`${START}(?:${alternatives})${END}`, "u");
const MONTH_WORDS = words("months?|mos?|mths?|m|monthly|شهر|شهور|أشهر|اشهر|شهري|شهرية");
const YEAR_WORDS = words("years?|yrs?|y|annual|annually|yearly|سنة|سنوات|سنوي|سنوية");
const WEEK_WORDS = words("weeks?|wks?|w|weekly|أسبوع|اسبوع|أسابيع|اسابيع|أسبوعي|اسبوعي");
const DAY_WORDS = words("days?|d|daily|يوم|أيام|ايام|يومي");
const VISIT_WORDS = words("visits?|sessions?|classes|entries|punches?|زيارة|زيارات|حصة|حصص|جلسة|جلسات|دخول");
const CURRENCY_WORDS: Array<[RegExp, string]> = [[words("jod|jd|دينار|د\\.ا|دينار أردني"), "JOD"], [words("usd|\\$|دولار"), "USD"], [words("sar|ريال"), "SAR"], [words("aed|درهم"), "AED"], [words("eur|€|يورو"), "EUR"], [words("gbp|£"), "GBP"]];
const DIGITS_FOR_CURRENCY: Record<string, number> = { JOD: 3, KWD: 3, BHD: 3, OMR: 3, IQD: 3, LYD: 3, TND: 3, JPY: 0, KRW: 0, CLP: 0, ISK: 0 };

export function currencyMinorDigits(currency: string): number {
  return DIGITS_FOR_CURRENCY[currency.toUpperCase()] ?? 2;
}

function toMinor(amount: number, currency: string): number {
  return Math.round(amount * 10 ** currencyMinorDigits(currency));
}

/**
 * Pull duration, visits, price and currency out of a label such as
 * "Gold 12 months 400 JD", "10 visits", "شهري" or "Annual". Anything not
 * stated stays undefined; nothing is guessed.
 */
export function parseLegacyPlanLabel(label: string, gymCurrency: string): ParsedPlanLabel {
  const text = normalizePlanLabel(label).replace(/(\d)([\p{L}])/gu, "$1 $2").replace(/([\p{L}])(\d)/gu, "$1 $2");
  const tokens = text.split(/[^\p{L}\p{N}$€£.]+/u).filter(Boolean);
  const parsed: ParsedPlanLabel = { tokens };
  for (const [pattern, currency] of CURRENCY_WORDS) if (pattern.test(text)) { parsed.currency = currency; break; }
  const quantity = (words: RegExp): number | undefined => {
    const match = text.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${words.source}`, "u"));
    return match ? Number(match[1]!.replace(",", ".")) : undefined;
  };
  const years = quantity(YEAR_WORDS);
  const months = quantity(MONTH_WORDS);
  const weeks = quantity(WEEK_WORDS);
  const days = quantity(DAY_WORDS);
  if (years !== undefined) parsed.durationDays = Math.round(years * 365);
  else if (months !== undefined) parsed.durationDays = months >= 12 && months % 12 === 0 ? (months / 12) * 365 : Math.round(months * 30);
  else if (weeks !== undefined) parsed.durationDays = Math.round(weeks * 7);
  else if (days !== undefined) parsed.durationDays = Math.round(days);
  else if (YEAR_WORDS.test(text)) parsed.durationDays = 365;
  else if (MONTH_WORDS.test(text)) parsed.durationDays = 30;
  else if (WEEK_WORDS.test(text)) parsed.durationDays = 7;
  else if (DAY_WORDS.test(text)) parsed.durationDays = 1;
  const visits = quantity(VISIT_WORDS);
  if (visits !== undefined && Number.isInteger(visits)) parsed.visits = visits;
  const priceMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:jod|jd|دينار|usd|\$|sar|ريال|aed|درهم|eur|€|gbp|£)/u) ?? text.match(/(?:jod|jd|دينار|usd|\$|sar|ريال|aed|درهم|eur|€|gbp|£)\s*(\d+(?:[.,]\d+)?)/u);
  if (priceMatch) parsed.priceMinor = toMinor(Number(priceMatch[1]!.replace(",", ".")), parsed.currency ?? gymCurrency);
  return parsed;
}

export type TermComparison = "match" | "mismatch" | "unknown";

export interface PlanComparison {
  planId: string;
  kind: TermComparison;
  duration: TermComparison;
  visits: TermComparison;
  price: TermComparison;
  currency: TermComparison;
  /** A currency or kind mismatch can never be accepted; duration and price differences need a person. */
  verdict: "match" | "needs_review" | "incompatible";
  differences: string[];
}

const DURATION_TOLERANCE_DAYS = 3;

export function comparePlanToLabel(parsed: ParsedPlanLabel, plan: PlanTerms, gymCurrency: string): PlanComparison {
  const differences: string[] = [];
  let kind: TermComparison = "unknown";
  if (parsed.visits !== undefined && parsed.durationDays === undefined) kind = plan.kind === "visits" ? "match" : "mismatch";
  else if (parsed.durationDays !== undefined && parsed.visits === undefined) kind = plan.kind === "time" ? "match" : "mismatch";
  else if (parsed.visits !== undefined && parsed.durationDays !== undefined) kind = plan.kind === "visits" ? "match" : "mismatch";
  if (kind === "mismatch") differences.push(plan.kind === "visits" ? "The label describes a time-based plan; this plan counts visits." : "The label describes visits; this plan is time-based.");

  let duration: TermComparison = "unknown";
  const planDuration = plan.kind === "time" ? plan.durationDays : plan.visitValidityDays;
  if (parsed.durationDays !== undefined && planDuration !== undefined) {
    duration = Math.abs(parsed.durationDays - planDuration) <= DURATION_TOLERANCE_DAYS ? "match" : "mismatch";
    if (duration === "mismatch") differences.push(`Duration: label says ${parsed.durationDays} days, plan runs ${planDuration} days.`);
  }

  let visits: TermComparison = "unknown";
  if (parsed.visits !== undefined && plan.visitAllowance !== undefined) {
    visits = parsed.visits === plan.visitAllowance ? "match" : "mismatch";
    if (visits === "mismatch") differences.push(`Visits: label says ${parsed.visits}, plan includes ${plan.visitAllowance}.`);
  }

  let currency: TermComparison = "unknown";
  if (parsed.currency !== undefined) {
    currency = parsed.currency === plan.currency ? "match" : "mismatch";
    if (currency === "mismatch") differences.push(`Currency: label is in ${parsed.currency}, plan is priced in ${plan.currency}.`);
  } else if (plan.currency !== gymCurrency) {
    currency = "mismatch";
    differences.push(`Currency: plan is priced in ${plan.currency}, the gym bills in ${gymCurrency}.`);
  }

  let price: TermComparison = "unknown";
  if (parsed.priceMinor !== undefined && currency !== "mismatch") {
    price = parsed.priceMinor === plan.priceMinor ? "match" : "mismatch";
    if (price === "mismatch") differences.push(`Price: label says ${formatMinor(parsed.priceMinor, plan.currency)}, plan costs ${formatMinor(plan.priceMinor, plan.currency)}.`);
  }

  const verdict: PlanComparison["verdict"] = kind === "mismatch" || currency === "mismatch" ? "incompatible" : duration === "mismatch" || visits === "mismatch" || price === "mismatch" ? "needs_review" : "match";
  return { planId: plan.id, kind, duration, visits, price, currency, verdict, differences };
}

export function formatMinor(amount: number, currency: string): string {
  const digits = currencyMinorDigits(currency);
  return `${currency} ${(amount / 10 ** digits).toFixed(digits)}`;
}

export function describePlanTerms(plan: PlanTerms): string {
  const terms = plan.kind === "visits"
    ? `${plan.visitAllowance ?? 0} visits${plan.visitValidityDays ? ` valid ${plan.visitValidityDays} days` : ""}`
    : `${plan.durationDays ?? 0} days`;
  const access = plan.branchAccess === "all" ? "all branches" : "selected branches";
  return `${terms} · ${formatMinor(plan.priceMinor, plan.currency)} · ${access}`;
}

export interface PlanMatchBuild {
  state: JevState;
  candidates: JevCandidate[];
  scopeKey: string;
  sourceVersion: string;
  parsed: ParsedPlanLabel;
  comparisons: PlanComparison[];
}

/**
 * The state Jev sees for one legacy label: the label, how many rows use it,
 * what its wording states deterministically, and the gym's currency. Each
 * current plan is a candidate described by its exact terms; the two
 * non-plan outcomes are always offered.
 */
export function buildPlanMatchState(input: { draft: ImportAssistDraftData; label: string; rows: number; plans: PlanTerms[]; currency: string }): PlanMatchBuild {
  const parsed = parseLegacyPlanLabel(input.label, input.currency);
  const plans = [...input.plans].filter((plan) => plan.status === "active" && (plan.branchAccess === "all" || plan.branchIds.includes(input.draft.branchId))).sort((left, right) => left.name.localeCompare(right.name));
  const comparisons = plans.map((plan) => comparePlanToLabel(parsed, plan, input.currency));
  const candidates: JevCandidate[] = [
    ...plans.map((plan) => ({ id: plan.id, description: `${plan.name}${plan.code ? ` (${plan.code})` : ""}: ${plan.kind === "visits" ? "visit-based" : "time-based"}, ${describePlanTerms(plan)}.` })),
    { id: PLAN_NO_EQUIVALENT, description: "No listed plan corresponds to this label; the gym must create one or leave these members without a term." },
    { id: PLAN_NEEDS_REVIEW, description: "Two or more listed plans are equally plausible; a person must choose." },
  ];
  const state: JevState = {
    task: "Match a membership plan label from a gym's previous system to the current RIVET plan it corresponds to.",
    sourceLabel: input.label,
    normalizedLabel: normalizePlanLabel(input.label),
    memberRowsUsingLabel: input.rows,
    statedInLabel: {
      durationDays: parsed.durationDays ?? null,
      visits: parsed.visits ?? null,
      price: parsed.priceMinor !== undefined ? formatMinor(parsed.priceMinor, parsed.currency ?? input.currency) : null,
      currency: parsed.currency ?? null,
    },
    gymCurrency: input.currency,
    availablePlans: plans.length,
  };
  const planVersion = plans.map((plan) => `${plan.id}:${plan.kind}:${plan.durationDays ?? ""}:${plan.visitAllowance ?? ""}:${plan.visitValidityDays ?? ""}:${plan.priceMinor}:${plan.currency}:${plan.branchAccess}`).join("|");
  return { state, candidates, scopeKey: `import-draft:${input.draft.id}:plan:${normalizePlanLabel(input.label)}`, sourceVersion: `import-plan:1:${plans.length}:${simpleHash(planVersion)}`, parsed, comparisons };
}

function simpleHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  return (hash >>> 0).toString(16);
}

export type PlanSuggestionOutcome =
  | { kind: "match"; plan: PlanTerms; comparison: PlanComparison; probability: number }
  | { kind: "needs_review"; plan: PlanTerms; comparison: PlanComparison; probability: number }
  | { kind: "incompatible"; plan: PlanTerms; comparison: PlanComparison; probability: number }
  | { kind: "no_equivalent"; probability: number }
  | { kind: "unclear"; probability: number };

/**
 * The model's pick never bypasses the deterministic comparison: a plan whose
 * terms contradict the label's stated terms is downgraded to needs-review or
 * rejected outright, whatever probability it carried.
 */
export function resolvePlanSuggestion(judgment: JevJudgment, plans: readonly PlanTerms[], parsed: ParsedPlanLabel, gymCurrency: string): PlanSuggestionOutcome {
  if (judgment.kind !== "choice") return { kind: "unclear", probability: 0 };
  const probability = judgment.probabilities[judgment.choice] ?? 0;
  if (judgment.choice === PLAN_NO_EQUIVALENT) return { kind: "no_equivalent", probability };
  if (judgment.choice === PLAN_NEEDS_REVIEW) return { kind: "unclear", probability };
  const plan = plans.find((candidate) => candidate.id === judgment.choice);
  if (!plan || plan.status !== "active") return { kind: "unclear", probability };
  const comparison = comparePlanToLabel(parsed, plan, gymCurrency);
  if (comparison.verdict === "incompatible") return { kind: "incompatible", plan, comparison, probability };
  if (comparison.verdict === "needs_review") return { kind: "needs_review", plan, comparison, probability };
  return { kind: "match", plan, comparison, probability };
}

// ---------------------------------------------------------------------------
// Fixture resolvers: the preview's stand-in for the model
// ---------------------------------------------------------------------------

const HEADING_HINTS: Array<{ field: ImportField; hints: string[] }> = [
  { field: "phone", hints: ["tel", "phone", "mobile", "cell", "whatsapp", "gsm", "هاتف", "جوال", "موبايل", "تلفون", "خلوي"] },
  { field: "email", hints: ["mail", "email", "e_mail", "ايميل", "بريد"] },
  { field: "fullName", hints: ["name", "member", "client", "customer", "اسم", "عضو", "عميل"] },
  { field: "gender", hints: ["gender", "sex", "male", "female", "جنس", "نوع"] },
  { field: "sourcePlanName", hints: ["plan", "package", "pkg", "subscription", "membership_type", "tier", "خطة", "باقة", "اشتراك"] },
  { field: "membershipEndDate", hints: ["end", "expiry", "expire", "exp", "until", "valid_to", "انتهاء", "نهاية"] },
  { field: "membershipStartDate", hints: ["start", "begin", "from", "joined", "join", "بداية", "بدء"] },
  { field: "remainingVisits", hints: ["remaining", "left", "balance_visits", "visits", "sessions", "متبقي", "زيارات", "حصص"] },
  { field: "freezeStartDate", hints: ["freeze_start", "frozen_from", "تجميد_من"] },
  { field: "freezeEndDate", hints: ["freeze_end", "frozen_until", "تجميد_الى", "تجميد_إلى"] },
  { field: "openingBalance", hints: ["due", "owed", "outstanding", "balance", "debt", "مستحق", "رصيد", "دين"] },
  { field: "historicalPaidTotal", hints: ["paid", "total_paid", "payments", "مدفوع", "المدفوع"] },
  { field: "historicalPaymentDate", hints: ["paid_on", "payment_date", "last_payment", "تاريخ_الدفع"] },
  { field: "historicalPaymentReference", hints: ["receipt", "reference", "ref", "invoice", "مرجع", "ايصال", "إيصال"] },
];

function distribution(candidates: readonly JevCandidate[] | undefined, choice: string, confidence: number): JevJudgment {
  const ids = (candidates ?? []).map((candidate) => candidate.id);
  const others = ids.filter((id) => id !== choice);
  const rest = others.length ? (1 - confidence) / others.length : 0;
  const probabilities = Object.fromEntries(ids.map((id) => [id, id === choice ? (others.length ? confidence : 1) : rest]));
  return { kind: "choice", choice, probabilities, confidence };
}

/** Heading tokens against the field hints, restricted to what was actually offered. Deterministic, for previews and tests. */
export function resolveColumnTargetFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  if (typeof input.state !== "object" || input.state === null || Array.isArray(input.state)) return undefined;
  const column = input.state.column;
  const heading = typeof column === "object" && column !== null && !Array.isArray(column) && typeof column.normalizedHeading === "string" ? column.normalizedHeading : "";
  const offered = new Set((input.candidates ?? []).map((candidate) => candidate.id));
  const tokens = new Set(heading.split("_").filter(Boolean));
  for (const { field, hints } of HEADING_HINTS) {
    if (!offered.has(field)) continue;
    if (hints.some((hint) => heading === hint || tokens.has(hint) || (hint.length >= 4 && heading.includes(hint)))) return distribution(input.candidates, field, 0.88);
  }
  if (!heading || heading.length <= 2) return distribution(input.candidates, offered.has(COLUMN_UNCLEAR) ? COLUMN_UNCLEAR : COLUMN_LEAVE_UNMAPPED, 0.7);
  return distribution(input.candidates, offered.has(COLUMN_LEAVE_UNMAPPED) ? COLUMN_LEAVE_UNMAPPED : COLUMN_UNCLEAR, 0.62);
}

/** Name overlap and stated terms against the offered plans. Deterministic, for previews and tests. */
export function resolvePlanMatchFixture(input: { state: JevState; candidates?: JevCandidate[] }): JevJudgment | undefined {
  if (typeof input.state !== "object" || input.state === null || Array.isArray(input.state)) return undefined;
  const label = typeof input.state.normalizedLabel === "string" ? input.state.normalizedLabel : "";
  const stated = typeof input.state.statedInLabel === "object" && input.state.statedInLabel !== null && !Array.isArray(input.state.statedInLabel) ? input.state.statedInLabel : {};
  const labelTokens = new Set(label.split(/[^\p{L}\p{N}]+/u).filter((token) => token.length >= 3));
  const plans = (input.candidates ?? []).filter((candidate) => candidate.id !== PLAN_NO_EQUIVALENT && candidate.id !== PLAN_NEEDS_REVIEW);
  const synonyms: Record<string, string[]> = { monthly: ["month", "شهري", "شهر"], annual: ["year", "annual", "yearly", "سنوي", "سنة"], weekly: ["week", "أسبوعي", "اسبوعي"], visits: ["visit", "visits", "session", "زيارة", "زيارات", "حصص"] };
  const scored = plans.map((candidate) => {
    const description = candidate.description.toLocaleLowerCase();
    let score = 0;
    for (const token of labelTokens) if (description.includes(token)) score += 2;
    for (const [word, alternatives] of Object.entries(synonyms)) {
      if (alternatives.some((alternative) => label.includes(alternative)) && description.includes(word)) score += 1;
    }
    const durationDays = typeof stated.durationDays === "number" ? stated.durationDays : undefined;
    if (durationDays !== undefined && description.includes(`${durationDays} days`)) score += 2;
    const visits = typeof stated.visits === "number" ? stated.visits : undefined;
    if (visits !== undefined && description.includes(`${visits} visits`)) score += 2;
    const nameFirstWord = description.split(":")[0]?.split(/[^\p{L}\p{N}]+/u).filter(Boolean)[0];
    const labelFirstWord = label.split(/[^\p{L}\p{N}]+/u).filter(Boolean)[0];
    if (nameFirstWord && labelFirstWord && nameFirstWord === labelFirstWord) score += 1;
    return { id: candidate.id, score };
  }).sort((left, right) => right.score - left.score);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.score === 0) return distribution(input.candidates, PLAN_NO_EQUIVALENT, 0.66);
  if (second && second.score === best.score) return distribution(input.candidates, PLAN_NEEDS_REVIEW, 0.6);
  return distribution(input.candidates, best.id, best.score >= 3 ? 0.9 : 0.72);
}
