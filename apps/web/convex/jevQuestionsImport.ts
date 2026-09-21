import {
  COLUMN_LEAVE_UNMAPPED,
  COLUMN_UNCLEAR,
  PLAN_NEEDS_REVIEW,
  PLAN_NO_EQUIVALENT,
  buildColumnTargetState,
  buildPlanMatchState,
  resolveColumnTargetFixture,
  resolvePlanMatchFixture,
  summarizeImportColumn,
  type ImportAssistDraftData,
  type PlanTerms,
} from "./jevImportState";
import type { JevFeature, JevQuestion } from "./jevRegistry";

/**
 * Import assistance questions. Both are candidate-based choices whose options
 * are built server-side from what actually exists: the RIVET fields a column
 * may still fill, or the gym's current plans. Jev only ever sees headings, a
 * value-shape summary and legacy plan labels; member rows never leave the
 * browser until the person runs the normal preview.
 */
export const IMPORT_FEATURE: JevFeature = {
  key: "import",
  label: "Member import assistance",
  description: "Suggests which RIVET field an unfamiliar spreadsheet column fills and which current plan a legacy plan label corresponds to. Sends headings, value-shape summaries and plan labels only, never member rows.",
};

const SYNTHETIC_DRAFT: ImportAssistDraftData = {
  id: "draft-fixture",
  branchId: "branch-fixture",
  headers: ["Member", "Tel", "Pkg", "Exp."],
  columns: [
    summarizeImportColumn(0, "Member", ["Member A", "Member B", "Member C", "Member D"]),
    summarizeImportColumn(1, "Tel", ["0790000001", "0790000002", "+962790000003", "0790000004"]),
    summarizeImportColumn(2, "Pkg", ["Gold 12 months", "Silver", "Gold 12 months", "Silver"]),
    summarizeImportColumn(3, "Exp.", ["2027-01-31", "2026-12-15", "2027-03-01", "2027-02-10"]),
  ],
  sourcePlanLabels: [
    { label: "Gold 12 months", rows: 2 },
    { label: "Silver", rows: 2 },
  ],
};

const SYNTHETIC_PLANS: PlanTerms[] = [
  { id: "plan_monthly", name: "Monthly", code: "M1", kind: "time", durationDays: 30, priceMinor: 40_000, currency: "JOD", branchAccess: "all", branchIds: [], status: "active" },
  { id: "plan_annual", name: "Annual", code: "A12", kind: "time", durationDays: 365, priceMinor: 350_000, currency: "JOD", branchAccess: "all", branchIds: [], status: "active" },
  { id: "plan_visits", name: "10-Visit Pass", code: "V10", kind: "visits", visitAllowance: 10, visitValidityDays: 90, priceMinor: 50_000, currency: "JOD", branchAccess: "all", branchIds: [], status: "active" },
];

const columnFixture = buildColumnTargetState({ draft: SYNTHETIC_DRAFT, columnIndex: 1, assignedFields: ["fullName"], currency: "JOD" })!;
const planFixture = buildPlanMatchState({ draft: SYNTHETIC_DRAFT, label: "Gold 12 months", rows: 2, plans: SYNTHETIC_PLANS, currency: "JOD" });

export const IMPORT_QUESTIONS: readonly JevQuestion[] = [
  {
    kind: "choice",
    key: "import.column_target",
    feature: "import",
    version: 1,
    label: "Column target",
    description: "Which RIVET field an unfamiliar spreadsheet column should fill, from its heading and a summary of the shape of its values.",
    instructions: "A gym is importing a spreadsheet of members from its previous system into RIVET. You see one column's heading (English or Arabic), the other headings for context, and a summary of the shape of the column's values (never the values themselves). Pick the RIVET field this column should fill. Choose leave_unmapped when the column holds nothing RIVET imports, and unclear when the heading and the value shape do not identify one field.",
    maxCandidates: 20,
    permission: "members.write",
    cacheTtlMs: 6 * 60 * 60 * 1000,
    timeoutMs: 8_000,
    synthetic: false,
    fixtureResolver: resolveColumnTargetFixture,
    fixture: {
      state: columnFixture.state,
      candidates: columnFixture.candidates,
      judgment: resolveColumnTargetFixture({ state: columnFixture.state, candidates: columnFixture.candidates }) ?? { kind: "choice", choice: COLUMN_UNCLEAR, probabilities: { [COLUMN_UNCLEAR]: 1 } },
    },
  },
  {
    kind: "choice",
    key: "import.plan_match",
    feature: "import",
    version: 1,
    label: "Legacy plan match",
    description: "Which current RIVET plan a membership plan label from the previous system corresponds to.",
    instructions: "A gym is importing members whose membership plan is named by a label from its previous system. You see the label (English or Arabic), how many members use it, the duration, visits, price and currency its wording states, and the gym's current plans with their exact terms. Pick the plan the label most plausibly corresponds to by name, duration, visits and price. Choose no_equivalent when no listed plan corresponds, and needs_review when two or more plans are equally plausible.",
    maxCandidates: 40,
    permission: "members.write",
    cacheTtlMs: 6 * 60 * 60 * 1000,
    timeoutMs: 8_000,
    synthetic: false,
    fixtureResolver: resolvePlanMatchFixture,
    fixture: {
      state: planFixture.state,
      candidates: planFixture.candidates,
      judgment: resolvePlanMatchFixture({ state: planFixture.state, candidates: planFixture.candidates }) ?? { kind: "choice", choice: PLAN_NEEDS_REVIEW, probabilities: { [PLAN_NEEDS_REVIEW]: 1 } },
    },
  },
];

export const IMPORT_OUTCOME_IDS = { COLUMN_LEAVE_UNMAPPED, COLUMN_UNCLEAR, PLAN_NO_EQUIVALENT, PLAN_NEEDS_REVIEW } as const;
