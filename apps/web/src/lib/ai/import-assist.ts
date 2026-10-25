import { canonicalPhoneKey } from "../utils/contact";
import { normalizeNoteText } from "./relative-dates";

/**
 * Member-import assistance (AI-4.4), deterministic and bilingual. It fills
 * column mappings the header names did not settle by reading sample values,
 * and suggests which RIVET plan each source plan label means. Suggestions
 * only fill empty choices in the existing mapping step; the person reviews
 * them, runs the usual preview, and commits.
 */

export type AssistField = "fullName" | "phone" | "gender" | "email" | "membershipStartDate" | "membershipEndDate";

export interface ColumnSuggestion {
  field: AssistField;
  index: number;
  /** What the values looked like, for the person to check. */
  basis: "phone_numbers" | "gender_words" | "emails" | "names" | "earlier_dates" | "later_dates";
}

const GENDER_WORDS = new Set(["male", "female", "m", "f", "man", "woman", "ذكر", "انثى", "أنثى", "رجل", "امرأة", "سيدة", "شاب", "بنت"]);
const SAMPLE_ROWS = 40;
const SHARE = 0.7;

function share<T>(values: readonly T[], test: (value: T) => boolean): number {
  return values.length ? values.filter(test).length / values.length : 0;
}

function parseDate(value: string): number | undefined {
  const text = normalizeNoteText(value);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  // Jordanian files write day/month/year.
  if (dmy) return Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  return undefined;
}

export function suggestColumns(matrix: readonly string[][], mapped: Partial<Record<AssistField, number>>): ColumnSuggestion[] {
  const header = matrix[0] ?? [];
  const rows = matrix.slice(1, SAMPLE_ROWS + 1);
  const used = new Set(Object.values(mapped).filter((value): value is number => typeof value === "number"));
  const columns = header.map((_name, index) => ({ index, values: rows.map((row) => normalizeNoteText(row[index] ?? "")).filter(Boolean) })).filter((column) => column.values.length > 0 && !used.has(column.index));
  const suggestions: ColumnSuggestion[] = [];
  const take = (field: AssistField, basis: ColumnSuggestion["basis"], test: (value: string) => boolean) => {
    if (mapped[field] !== undefined || suggestions.some((item) => item.field === field)) return;
    const found = columns.find((column) => !suggestions.some((item) => item.index === column.index) && share(column.values, test) >= SHARE);
    if (found) suggestions.push({ field, index: found.index, basis });
  };
  take("email", "emails", (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  take("phone", "phone_numbers", (value) => { const key = canonicalPhoneKey(value); return key.length >= 9 && key.length <= 15 && /^[\d\s+()-]+$/.test(value); });
  take("gender", "gender_words", (value) => GENDER_WORDS.has(value.toLowerCase()));
  take("fullName", "names", (value) => /^[\p{L}][\p{L}'’ .-]+$/u.test(value) && value.trim().split(/\s+/).length >= 2 && value.length <= 60);
  if (mapped.membershipStartDate === undefined && mapped.membershipEndDate === undefined) {
    const dated = columns.filter((column) => !suggestions.some((item) => item.index === column.index) && share(column.values, (value) => parseDate(value) !== undefined) >= SHARE);
    if (dated.length === 2) {
      const average = (values: string[]) => values.map(parseDate).filter((value): value is number => value !== undefined).reduce((sum, value, _i, all) => sum + value / all.length, 0);
      const [earlier, later] = [...dated].sort((left, right) => average(left.values) - average(right.values));
      suggestions.push({ field: "membershipStartDate", index: earlier!.index, basis: "earlier_dates" }, { field: "membershipEndDate", index: later!.index, basis: "later_dates" });
    }
  }
  return suggestions;
}

export interface PlanLike {
  id: string;
  name: string;
  kind: string;
  durationDays?: number;
  visitAllowance?: number;
}

export interface PlanSuggestion {
  sourceName: string;
  planId: string;
  basis: "same_name" | "shared_words" | "same_length" | "same_visits";
}

/** Days or visits written in a plan label, in English or Arabic ("3 months", "شهري", "12 زيارة"). */
export function labelAmount(label: string): { days?: number; visits?: number } {
  const text = normalizeNoteText(label).toLowerCase();
  const visits = text.match(/(\d{1,3})\s*(visits?|sessions?|زيارة|زيارات|حصة|حصص)/u);
  if (visits) return { visits: Number(visits[1]) };
  const counted = text.match(/(\d{1,2})\s*(days?|weeks?|months?|years?|يوم|أيام|ايام|أسبوع|اسبوع|أسابيع|اسابيع|شهر|شهور|أشهر|اشهر|سنة|سنوات)/u);
  if (counted) {
    const amount = Number(counted[1]);
    const unit = counted[2]!;
    return { days: /day|يوم|يام/u.test(unit) ? amount : /week|سبوع|سابيع/u.test(unit) ? amount * 7 : /year|سنة|سنوات/u.test(unit) ? amount * 365 : amount * 30 };
  }
  if (/\b(annual|yearly|year)\b|سنوي|سنة/u.test(text)) return { days: 365 };
  if (/\b(quarterly)\b|ربع سنوي/u.test(text)) return { days: 90 };
  if (/\b(monthly|month)\b|شهري|شهر/u.test(text)) return { days: 30 };
  if (/\b(weekly|week)\b|أسبوعي|اسبوعي/u.test(text)) return { days: 7 };
  return {};
}

function nameWords(value: string): string[] {
  return normalizeNoteText(value).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 3 && !/^\d+$/.test(word));
}

export function suggestPlans(sourceNames: readonly string[], plans: readonly PlanLike[], alreadyMapped: Readonly<Record<string, string>>): PlanSuggestion[] {
  const suggestions: PlanSuggestion[] = [];
  for (const sourceName of sourceNames) {
    if (alreadyMapped[sourceName]) continue;
    const normalized = normalizeNoteText(sourceName).toLowerCase();
    const exact = plans.filter((plan) => normalizeNoteText(plan.name).toLowerCase() === normalized);
    if (exact.length === 1) { suggestions.push({ sourceName, planId: exact[0]!.id, basis: "same_name" }); continue; }
    const amount = labelAmount(sourceName);
    const words = new Set(nameWords(sourceName));
    const scored = plans.map((plan) => {
      const shared = nameWords(plan.name).filter((word) => words.has(word)).length;
      const sameLength = amount.days !== undefined && plan.durationDays !== undefined && Math.abs(plan.durationDays - amount.days) <= 3;
      const sameVisits = amount.visits !== undefined && plan.visitAllowance === amount.visits;
      return { plan, shared, sameLength, sameVisits, score: shared * 2 + (sameLength ? 3 : 0) + (sameVisits ? 3 : 0) };
    }).filter((item) => item.score > 0).sort((left, right) => right.score - left.score);
    const [best, next] = scored;
    // Only a clear winner is suggested; a tie is left for the person.
    if (best && (!next || best.score > next.score)) suggestions.push({ sourceName, planId: best.plan.id, basis: best.sameVisits ? "same_visits" : best.sameLength && best.shared === 0 ? "same_length" : "shared_words" });
  }
  return suggestions;
}
