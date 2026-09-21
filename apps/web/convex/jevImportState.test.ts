import { describe, expect, it } from "vitest";
import {
  COLUMN_LEAVE_UNMAPPED,
  COLUMN_UNCLEAR,
  PLAN_NEEDS_REVIEW,
  PLAN_NO_EQUIVALENT,
  buildColumnTargetState,
  buildPlanMatchState,
  columnCompatibleWith,
  columnValueKinds,
  comparePlanToLabel,
  parseLegacyPlanLabel,
  resolveColumnSuggestion,
  resolveColumnTargetFixture,
  resolvePlanMatchFixture,
  resolvePlanSuggestion,
  summarizeImportColumn,
  summarizeImportColumns,
  type ImportAssistDraftData,
  type PlanTerms,
} from "./jevImportState";
import { getJevQuestion } from "./jevQuestions";
import { evaluateJevFixture } from "./jevAnswers";

const phones = ["0798765432", "0798123456", "+962797000000", "079 555 0101"];
const names = ["Rana Odeh", "Mira Nasser", "Omar Haddad", "لينا حداد"];
const dates = ["2027-01-31", "2026-12-15", "31/03/2027", "2027-02-10"];
const emails = ["rana@example.com", "mira@example.com", "omar@example.com", ""];
const genders = ["female", "female", "male", "أنثى"];
const labels = ["10 visits", "Monthly 40 USD", "شهري", "Gold 12 months"];

const plans: PlanTerms[] = [
  { id: "monthly", name: "Monthly Standard", code: "M1", kind: "time", durationDays: 30, priceMinor: 40_000, currency: "JOD", branchAccess: "selected", branchIds: ["branch-a"], status: "active" },
  { id: "student", name: "Student Monthly", code: "STU", kind: "time", durationDays: 30, priceMinor: 30_000, currency: "JOD", branchAccess: "all", branchIds: [], status: "active" },
  { id: "quarterly", name: "Quarterly", code: "Q3", kind: "time", durationDays: 90, priceMinor: 105_000, currency: "JOD", branchAccess: "all", branchIds: [], status: "active" },
  { id: "annual", name: "Annual All-Access", code: "A12", kind: "time", durationDays: 365, priceMinor: 350_000, currency: "JOD", branchAccess: "all", branchIds: [], status: "active" },
  { id: "visits10", name: "10-Visit Pass", code: "V10", kind: "visits", visitAllowance: 10, visitValidityDays: 90, priceMinor: 50_000, currency: "JOD", branchAccess: "all", branchIds: [], status: "active" },
  { id: "elsewhere", name: "Other Branch Only", code: "OB", kind: "time", durationDays: 30, priceMinor: 40_000, currency: "JOD", branchAccess: "selected", branchIds: ["branch-b"], status: "active" },
  { id: "old", name: "Summer Promo", code: "SUM", kind: "time", durationDays: 90, priceMinor: 89_000, currency: "JOD", branchAccess: "all", branchIds: [], status: "archived" },
];

const draft: ImportAssistDraftData = {
  id: "draft-1",
  branchId: "branch-a",
  headers: ["Name", "Tel", "Sex", "Pkg", "Exp.", "Notes", "ID"],
  columns: [
    summarizeImportColumn(0, "Name", names),
    summarizeImportColumn(1, "Tel", phones),
    summarizeImportColumn(2, "Sex", genders),
    summarizeImportColumn(3, "Pkg", labels),
    summarizeImportColumn(4, "Exp.", dates),
    summarizeImportColumn(5, "Notes", ["Prefers mornings", "Asked about PT", "", "Referred by Rana"]),
    summarizeImportColumn(6, "ID", ["A-1", "A-2", "A-3", "A-4"]),
  ],
  sourcePlanLabels: [{ label: "10 visits", rows: 1 }, { label: "Monthly 40 USD", rows: 1 }, { label: "شهري", rows: 1 }, { label: "Gold 12 months", rows: 1 }],
};

describe("column summaries", () => {
  it("records shape counts and never the values", () => {
    const tel = summarizeImportColumn(1, "Tel", phones);
    expect(tel).toMatchObject({ filled: 4, empty: 0, distinct: 4, phoneLike: 4, emailLike: 0, dateLike: 0 });
    expect(JSON.stringify(tel)).not.toContain("0798765432");
    expect(summarizeImportColumn(0, "Name", names)).toMatchObject({ alphabetic: 4, arabicScript: 1, numeric: 0 });
    expect(summarizeImportColumn(4, "Exp.", dates)).toMatchObject({ dateLike: 4 });
    expect(summarizeImportColumn(3, "Email", emails)).toMatchObject({ filled: 3, empty: 1, emailLike: 3 });
    expect(summarizeImportColumn(7, "Arabic digits", ["٠٧٩١٢٣٤٥٦٧", "٠٧٨٧٦٥٤٣٢١"])).toMatchObject({ phoneLike: 2, numeric: 2 });
    expect(summarizeImportColumns([["A", "B"], ["1", "x"], ["2", ""]]).map((column) => column.filled)).toEqual([2, 1]);
  });

  it("derives plausible kinds and refuses incompatible fields", () => {
    const tel = summarizeImportColumn(1, "Tel", phones);
    expect(columnValueKinds(tel)).toEqual(expect.arrayContaining(["phone", "number"]));
    expect(columnCompatibleWith(tel, "phone")).toBe(true);
    expect(columnCompatibleWith(tel, "email")).toBe(false);
    expect(columnCompatibleWith(tel, "fullName")).toBe(false);
    expect(columnCompatibleWith(tel, "membershipEndDate")).toBe(false);
    expect(columnCompatibleWith(tel, "openingBalance")).toBe(false);
    const gender = summarizeImportColumn(2, "Sex", genders);
    expect(columnValueKinds(gender)).toEqual(expect.arrayContaining(["category", "text"]));
    expect(columnCompatibleWith(gender, "gender")).toBe(true);
    expect(columnCompatibleWith(gender, "phone")).toBe(false);
    const expiry = summarizeImportColumn(4, "Exp.", dates);
    expect(columnCompatibleWith(expiry, "membershipEndDate")).toBe(true);
    expect(columnCompatibleWith(expiry, "fullName")).toBe(false);
    expect(columnCompatibleWith(summarizeImportColumn(9, "Empty", ["", ""]), "email")).toBe(true);
  });
});

describe("column target state", () => {
  it("offers only compatible, unassigned fields plus the two non-field outcomes, with no cell values", () => {
    const built = buildColumnTargetState({ draft, columnIndex: 1, assignedFields: ["fullName", "gender"], currency: "JOD" })!;
    expect(built.offeredFields).toEqual(["phone"]);
    expect(built.candidates.map((candidate) => candidate.id)).toEqual(["phone", COLUMN_LEAVE_UNMAPPED, COLUMN_UNCLEAR]);
    expect(JSON.stringify(built)).not.toContain("0798765432");
    expect(built.state).toMatchObject({ column: { heading: "Tel", normalizedHeading: "tel", position: 2 }, alreadyAssigned: ["Full name", "Gender"], gymCurrency: "JOD" });
    expect((built.state as { otherHeadings: string[] }).otherHeadings).not.toContain("Tel");
    expect(built.scopeKey).toBe("import-draft:draft-1:column:1");
    expect(buildColumnTargetState({ draft, columnIndex: 42, assignedFields: [], currency: "JOD" })).toBeUndefined();
  });

  it("never offers a field that is already assigned, so a duplicate target cannot be suggested", () => {
    const built = buildColumnTargetState({ draft, columnIndex: 1, assignedFields: ["fullName", "gender", "phone"], currency: "JOD" })!;
    expect(built.offeredFields).toEqual([]);
    const judgment = resolveColumnTargetFixture({ state: built.state, candidates: built.candidates })!;
    expect(judgment.kind === "choice" && judgment.choice).not.toBe("phone");
    expect(resolveColumnSuggestion({ kind: "choice", choice: "phone", probabilities: { phone: 1 } }, built.offeredFields)).toEqual({ kind: "unclear", probability: 1 });
  });

  it("resolves ambiguous, Arabic and abbreviated headings deterministically in previews", () => {
    const pick = (columnIndex: number, assigned: Parameters<typeof buildColumnTargetState>[0]["assignedFields"] = []) => {
      const built = buildColumnTargetState({ draft, columnIndex, assignedFields: assigned, currency: "JOD" })!;
      const judgment = resolveColumnTargetFixture({ state: built.state, candidates: built.candidates })!;
      return resolveColumnSuggestion(judgment, built.offeredFields);
    };
    expect(pick(1)).toMatchObject({ kind: "field", field: "phone" });
    expect(pick(3, ["fullName", "phone", "gender"])).toMatchObject({ kind: "field", field: "sourcePlanName" });
    expect(pick(4)).toMatchObject({ kind: "field", field: "membershipEndDate" });
    expect(pick(5)).toMatchObject({ kind: "leave_unmapped" });
    expect(pick(6)).toMatchObject({ kind: "unclear" });
    const arabic: ImportAssistDraftData = { ...draft, headers: ["الاسم", "الجوال"], columns: [summarizeImportColumn(0, "الاسم", names), summarizeImportColumn(1, "الجوال", phones)] };
    const built = buildColumnTargetState({ draft: arabic, columnIndex: 1, assignedFields: ["fullName"], currency: "JOD" })!;
    expect(resolveColumnSuggestion(resolveColumnTargetFixture({ state: built.state, candidates: built.candidates })!, built.offeredFields)).toMatchObject({ kind: "field", field: "phone" });
  });
});

describe("legacy plan labels", () => {
  it("parses duration, visits, price and currency from English and Arabic wording without guessing", () => {
    expect(parseLegacyPlanLabel("Gold 12 months 350 JD", "JOD")).toMatchObject({ durationDays: 365, priceMinor: 350_000, currency: "JOD" });
    expect(parseLegacyPlanLabel("3 أشهر", "JOD")).toMatchObject({ durationDays: 90 });
    expect(parseLegacyPlanLabel("شهري", "JOD")).toMatchObject({ durationDays: 30 });
    expect(parseLegacyPlanLabel("Annual", "JOD")).toMatchObject({ durationDays: 365 });
    expect(parseLegacyPlanLabel("10 visits", "JOD")).toMatchObject({ visits: 10 });
    expect(parseLegacyPlanLabel("١٠ زيارات", "JOD")).toMatchObject({ visits: 10 });
    expect(parseLegacyPlanLabel("Monthly 40 USD", "JOD")).toMatchObject({ durationDays: 30, priceMinor: 4_000, currency: "USD" });
    expect(parseLegacyPlanLabel("Platinum", "JOD")).toEqual({ tokens: ["platinum"] });
  });

  it("compares stated terms with a plan's exact terms and classifies the verdict", () => {
    const monthly = plans[0]!;
    const visits = plans[4]!;
    expect(comparePlanToLabel(parseLegacyPlanLabel("شهري", "JOD"), monthly, "JOD")).toMatchObject({ kind: "match", duration: "match", price: "unknown", currency: "unknown", verdict: "match" });
    expect(comparePlanToLabel(parseLegacyPlanLabel("Monthly 45 JD", "JOD"), monthly, "JOD")).toMatchObject({ price: "mismatch", verdict: "needs_review", differences: [expect.stringContaining("Price")] });
    expect(comparePlanToLabel(parseLegacyPlanLabel("3 months", "JOD"), monthly, "JOD")).toMatchObject({ duration: "mismatch", verdict: "needs_review" });
    expect(comparePlanToLabel(parseLegacyPlanLabel("Monthly 40 USD", "JOD"), monthly, "JOD")).toMatchObject({ currency: "mismatch", verdict: "incompatible" });
    expect(comparePlanToLabel(parseLegacyPlanLabel("12 months", "JOD"), visits, "JOD")).toMatchObject({ kind: "mismatch", verdict: "incompatible" });
    expect(comparePlanToLabel(parseLegacyPlanLabel("10 visits", "JOD"), visits, "JOD")).toMatchObject({ kind: "match", visits: "match", verdict: "match" });
    expect(comparePlanToLabel(parseLegacyPlanLabel("8 visits", "JOD"), visits, "JOD")).toMatchObject({ visits: "mismatch", verdict: "needs_review" });
    expect(comparePlanToLabel(parseLegacyPlanLabel("Monthly", "JOD"), { ...monthly, currency: "USD" }, "JOD")).toMatchObject({ currency: "mismatch", verdict: "incompatible" });
  });

  it("offers only current plans available at the draft's branch and changes the source version when terms change", () => {
    const built = buildPlanMatchState({ draft, label: "Gold 12 months", rows: 1, plans, currency: "JOD" });
    expect(built.candidates.map((candidate) => candidate.id)).toEqual(["visits10", "annual", "monthly", "quarterly", "student", PLAN_NO_EQUIVALENT, PLAN_NEEDS_REVIEW]);
    expect(built.state).toMatchObject({ sourceLabel: "Gold 12 months", statedInLabel: { durationDays: 365, visits: null, price: null, currency: null }, availablePlans: 5 });
    const repriced = buildPlanMatchState({ draft, label: "Gold 12 months", rows: 1, plans: plans.map((plan) => (plan.id === "annual" ? { ...plan, priceMinor: 360_000 } : plan)), currency: "JOD" });
    expect(repriced.sourceVersion).not.toBe(built.sourceVersion);
    expect(built.scopeKey).toBe("import-draft:draft-1:plan:gold 12 months");
  });

  it("resolves previews by name, stated terms and ties, and lets the deterministic comparison override the pick", () => {
    const outcome = (label: string) => {
      const built = buildPlanMatchState({ draft, label, rows: 1, plans, currency: "JOD" });
      const judgment = resolvePlanMatchFixture({ state: built.state, candidates: built.candidates })!;
      return resolvePlanSuggestion(judgment, plans, built.parsed, "JOD");
    };
    expect(outcome("Gold 12 months")).toMatchObject({ kind: "match", plan: { id: "annual" }, comparison: { duration: "match" } });
    expect(outcome("10 visits")).toMatchObject({ kind: "match", plan: { id: "visits10" } });
    expect(outcome("شهري")).toMatchObject({ kind: "unclear" });
    expect(outcome("Platinum")).toMatchObject({ kind: "no_equivalent" });
    expect(outcome("Monthly 40 USD")).toMatchObject({ kind: "incompatible", plan: { id: "monthly" }, comparison: { currency: "mismatch" } });
    expect(outcome("Monthly 45 JD")).toMatchObject({ kind: "needs_review", plan: { id: "monthly" } });
    expect(resolvePlanSuggestion({ kind: "choice", choice: "old", probabilities: { old: 1 } }, plans, parseLegacyPlanLabel("Summer", "JOD"), "JOD")).toMatchObject({ kind: "unclear" });
    expect(resolvePlanSuggestion({ kind: "choice", choice: PLAN_NEEDS_REVIEW, probabilities: { [PLAN_NEEDS_REVIEW]: 1 } }, plans, parseLegacyPlanLabel("x", "JOD"), "JOD")).toMatchObject({ kind: "unclear" });
  });
});

describe("import questions through the fixture path", () => {
  it("answer from the request's own candidates, so a preview never names an option that was not offered", () => {
    const column = getJevQuestion("import.column_target")!;
    const built = buildColumnTargetState({ draft, columnIndex: 1, assignedFields: ["fullName", "gender"], currency: "JOD" })!;
    const outcome = evaluateJevFixture(column, undefined, 0, { state: built.state, candidates: built.candidates });
    expect(outcome).toMatchObject({ ok: true, judgment: { kind: "choice", choice: "phone" } });
    const plan = getJevQuestion("import.plan_match")!;
    const planBuilt = buildPlanMatchState({ draft, label: "10 visits", rows: 1, plans, currency: "JOD" });
    const planOutcome = evaluateJevFixture(plan, undefined, 0, { state: planBuilt.state, candidates: planBuilt.candidates });
    expect(planOutcome).toMatchObject({ ok: true, judgment: { kind: "choice", choice: "visits10" } });
    expect(evaluateJevFixture(plan, "invalid_output", 0, { state: planBuilt.state, candidates: planBuilt.candidates })).toMatchObject({ ok: false, reason: "invalid_output" });
  });
});
