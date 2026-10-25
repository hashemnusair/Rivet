import { investigateCashDifference, recomputeExpectedCash, shouldPrepareVarianceReview, type CashCandidateKind, type CashShiftFacts, type CashShiftTransaction } from "../cash-difference";
import { memberFilterPlan } from "../list-filters";
import { interpretFiltersDeterministic, interpretRevisionDeterministic } from "../model";
import { extractNoteDeterministic } from "../note-extraction";
import { evaluateLeadCandidate, type LeadDecision, type LeadFollowUpFacts } from "../sales-batch";
import { preselectedMachine } from "../fault-triage";
import { EVAL_MACHINES, MACHINE_CASES, EVAL_BRANCHES, EVAL_SET_VERSION, FILTER_CASES, FILTER_CASES_V2, HELD_OUT_SET_VERSION, NOTE_AT, NOTE_CASES, NOTE_CASES_V2, NOTE_CASES_V2_MIXED, REVISION_CANDIDATES, REVISION_CASES, REVISION_CASES_V2, TIMEZONE, type FilterCase, type Language, type NoteCase, type RevisionCase } from "./cases";

/**
 * Deterministic evaluation of RIVET's assistance readers and decisions. It
 * runs without a provider, network or credentials, so it runs in CI and as
 * `pnpm ai:eval`. Language readers are scored per field with fabrication
 * counted separately; rule-based decisions must be exactly right. The live
 * provider evaluation (AI-5.2) is a separate opt-in command.
 */

export interface TaskReport {
  task: string;
  kind: "reader" | "decision";
  cases: number;
  byLanguage: Partial<Record<Language, { cases: number; passed: number }>>;
  passedCases: number;
  /** Scored fields and how many were right (readers only). */
  fields?: { scored: number; correct: number };
  /** A value produced where the note or request gave none. */
  fabrications: number;
  minimum: { metric: "field_accuracy" | "case_accuracy"; value: number; fabrications: 0 };
  failures: Array<{ id: string; detail: string }>;
  meetsMinimum: boolean;
}

export interface EvalReport {
  /** The set that gates: written before the readers were last changed. */
  set: string;
  /** The earlier set, used to find and fix defects; reported, never gating. */
  developmentSet: string;
  reader: "deterministic";
  ranAt: string;
  tasks: TaskReport[];
  development: TaskReport[];
  meetsMinimums: boolean;
}

/** Release minimums. Raising them is fine; lowering one needs a recorded decision in docs/09. */
export const MINIMUMS = {
  note_extraction: 0.85,
  filter_interpretation: 0.75,
  revision_interpretation: 0.8,
  machine_matching: 0.75,
} as const;

function tally(report: TaskReport, language: Language | undefined, passed: boolean): void {
  report.cases += 1;
  if (passed) report.passedCases += 1;
  if (language) {
    const bucket = report.byLanguage[language] ?? { cases: 0, passed: 0 };
    bucket.cases += 1;
    if (passed) bucket.passed += 1;
    report.byLanguage[language] = bucket;
  }
}

function emptyReport(task: string, kind: TaskReport["kind"], minimum: TaskReport["minimum"]): TaskReport {
  return { task, kind, cases: 0, byLanguage: {}, passedCases: 0, fabrications: 0, minimum, failures: [], meetsMinimum: false, ...(kind === "reader" ? { fields: { scored: 0, correct: 0 } } : {}) };
}

function finishReport(report: TaskReport): TaskReport {
  const value = report.minimum.metric === "field_accuracy" ? (report.fields && report.fields.scored ? report.fields.correct / report.fields.scored : 0) : (report.cases ? report.passedCases / report.cases : 0);
  report.meetsMinimum = value >= report.minimum.value && report.fabrications === 0;
  return report;
}

function evaluateNotes(cases: NoteCase[]): TaskReport {
  const report = emptyReport("note_extraction", "reader", { metric: "field_accuracy", value: MINIMUMS.note_extraction, fabrications: 0 });
  for (const item of cases) {
    const result = extractNoteDeterministic({ note: item.note, noteAt: NOTE_AT, timezone: TIMEZONE, subject: "member" });
    const actual: Record<string, unknown> = {
      outcome: result.outcome?.value ?? null,
      followUpDate: result.followUp?.value.date ?? null,
      followUpTime: result.followUp?.value.time,
      travelUntil: result.travelUntil?.value.date ?? null,
      renewalInterest: result.renewalInterest?.value ?? null,
      preferredContactTime: result.preferredContactTime?.value ?? null,
      ignoredInstructions: result.ignoredInstructions,
    };
    let casePassed = true;
    for (const [field, expected] of Object.entries(item.expect)) {
      const got = actual[field];
      const ok = Array.isArray(expected) ? expected.includes(got as never) : got === expected;
      report.fields!.scored += 1;
      if (ok) report.fields!.correct += 1;
      else {
        casePassed = false;
        if (expected === null && got !== null && got !== undefined) report.fabrications += 1;
        report.failures.push({ id: item.id, detail: `${field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(got ?? null)}` });
      }
    }
    tally(report, item.language, casePassed);
  }
  return finishReport(report);
}

function evaluateFilters(cases: FilterCase[]): TaskReport {
  const report = emptyReport("filter_interpretation", "reader", { metric: "case_accuracy", value: MINIMUMS.filter_interpretation, fabrications: 0 });
  for (const item of cases) {
    const result = interpretFiltersDeterministic({ kind: "interpret_filters", surface: "members", text: item.text, branches: EVAL_BRANCHES });
    const problems: string[] = [];
    const keys = ["membership", "expiringWithinDays", "notVisitedForDays", "owes", "branchId"] as const;
    if (item.expect.unrecognisedOnly) {
      const produced = keys.filter((key) => result[key] !== undefined);
      if (produced.length) { problems.push(`invented ${produced.join(", ")}`); report.fabrications += 1; }
      if (!result.unrecognised.length) problems.push("did not say it could not read the request");
    } else {
      for (const key of keys) {
        const expected = item.expect[key];
        if (expected === undefined) continue;
        report.fields!.scored += 1;
        if (result[key] === expected) report.fields!.correct += 1;
        else problems.push(`${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(result[key] ?? null)}`);
      }
      // A filter the request never asked for narrows the list wrongly.
      for (const key of keys) {
        if (item.expect[key] === undefined && result[key] !== undefined && !(key === "expiringWithinDays" && item.expect.membership === "expiring")) {
          problems.push(`invented ${key}=${JSON.stringify(result[key])}`);
          report.fabrications += 1;
        }
      }
    }
    for (const detail of problems) report.failures.push({ id: item.id, detail });
    tally(report, item.language, problems.length === 0);
  }
  return finishReport(report);
}

function evaluateRevisions(cases: RevisionCase[]): TaskReport {
  const report = emptyReport("revision_interpretation", "reader", { metric: "case_accuracy", value: MINIMUMS.revision_interpretation, fabrications: 0 });
  for (const item of cases) {
    const result = interpretRevisionDeterministic({ kind: "interpret_revision", text: item.text, candidates: REVISION_CANDIDATES, today: "2026-10-22" });
    const expected = item.expect;
    let ok = result.kind === expected.kind;
    if (ok && expected.kind === "time_of_day" && result.kind === "time_of_day") ok = result.value === expected.value;
    if (ok && expected.kind === "exclude_member" && result.kind === "exclude_member") ok = result.memberId === expected.memberId;
    if (ok && expected.kind === "owner" && result.kind === "owner") ok = result.ownerId === expected.ownerId;
    report.fields!.scored += 1;
    if (ok) report.fields!.correct += 1;
    else {
      // Acting on a person or a time nobody asked for is a fabrication; "unsupported" is a safe miss.
      if (expected.kind === "unsupported" || (result.kind !== "unsupported" && result.kind !== expected.kind)) report.fabrications += 1;
      report.failures.push({ id: item.id, detail: `expected ${JSON.stringify(expected)}, got ${JSON.stringify(result)}` });
    }
    tally(report, item.language, ok);
  }
  return finishReport(report);
}

let txnSeq = 0;
const txn = (partial: Partial<CashShiftTransaction>): CashShiftTransaction => ({ id: `t-${++txnSeq}`, receiptNumber: `R-${txnSeq}`, type: "payment", method: "cash", status: "completed", amountMinor: 10_000, occurredAt: `2026-10-22T0${txnSeq % 10}:00:00.000Z`, updatedAt: 1, ...partial });

function drawer(transactions: CashShiftTransaction[], varianceMinor: number, overrides: Partial<CashShiftFacts> = {}): CashShiftFacts {
  const base: CashShiftFacts = { shiftId: "s", branchId: "b", status: "closed", openedAt: "2026-10-22T05:00:00.000Z", currency: "JOD", timezone: TIMEZONE, openingFloatMinor: 10_000, varianceApprovalStatus: "pending", supplierCashPaidMinor: 0, supplierCashReversedMinor: 0, transactions, updatedAt: 1 };
  const expected = recomputeExpectedCash(base);
  return { ...base, expectedCashMinor: expected, countedCashMinor: expected + varianceMinor, varianceMinor, ...overrides };
}

function evaluateCashMatching(): TaskReport {
  const report = emptyReport("cash_difference_matching", "decision", { metric: "case_accuracy", value: 1, fabrications: 0 });
  const cases: Array<{ id: string; facts: CashShiftFacts; kinds: CashCandidateKind[]; review: boolean }> = [
    { id: "c-01", facts: drawer([txn({ method: "card", amountMinor: 5_000 })], 5_000), kinds: ["non_cash_payment"], review: true },
    { id: "c-02", facts: drawer([txn({ amountMinor: 3_000 })], -3_000), kinds: ["cash_payment"], review: true },
    { id: "c-03", facts: drawer([txn({ amountMinor: 1_000 }), txn({ amountMinor: 2_000 })], -3_000), kinds: ["cash_payment_pair"], review: false },
    { id: "c-04", facts: drawer([txn({ status: "voided", amountMinor: 2_500 })], 2_500), kinds: ["voided_cash_payment"], review: true },
    { id: "c-05", facts: drawer([txn({ method: "card", amountMinor: 1_235 })], 1_234), kinds: [], review: false },
    { id: "c-06", facts: drawer([txn({ type: "refund", method: "card", amountMinor: 4_000 })], -4_000), kinds: ["non_cash_refund"], review: true },
    { id: "c-07", facts: drawer([txn({ type: "refund", amountMinor: 700 })], 700), kinds: ["cash_refund"], review: true },
    { id: "c-08", facts: { ...drawer([txn({ method: "card", amountMinor: 5_000 })], 5_000), expectedCashMinor: 1 }, kinds: ["non_cash_payment"], review: false },
  ];
  for (const item of cases) {
    const result = investigateCashDifference(item.facts);
    const kinds = result.candidates.map((candidate) => candidate.kind);
    const review = shouldPrepareVarianceReview(item.facts, result);
    const ok = JSON.stringify(kinds) === JSON.stringify(item.kinds) && review === item.review;
    if (!ok) report.failures.push({ id: item.id, detail: `expected ${JSON.stringify(item.kinds)} review=${item.review}, got ${JSON.stringify(kinds)} review=${review}` });
    if (review && !item.review) report.fabrications += 1;
    tally(report, undefined, ok);
  }
  return finishReport(report);
}

function evaluateLeadDecisions(): TaskReport {
  const report = emptyReport("lead_followup_decisions", "decision", { metric: "case_accuracy", value: 1, fabrications: 0 });
  const now = "2026-10-22T08:30:00.000Z";
  const base: LeadFollowUpFacts = { leadId: "l", leadName: "Lead", stage: "contacted", phone: "+962790000000", nextFollowUpAt: "2026-10-21T15:00:00.000Z", openTasks: [] };
  const cases: Array<{ id: string; facts: LeadFollowUpFacts; expect: Partial<LeadDecision> & { decision: LeadDecision["decision"] } }> = [
    { id: "l-01", facts: { ...base, stage: "lost" }, expect: { decision: "exclude", reason: "lead_closed" } },
    { id: "l-02", facts: { ...base, convertedMemberId: "m" }, expect: { decision: "exclude", reason: "lead_closed" } },
    { id: "l-03", facts: { ...base, phone: "" }, expect: { decision: "exclude", reason: "no_phone" } },
    { id: "l-04", facts: { ...base, lastContactAt: "2026-10-22T05:30:00.000Z" }, expect: { decision: "exclude", reason: "lead_contacted_recently" } },
    { id: "l-05", facts: { ...base, lastContactAt: "2026-10-21T02:30:00.000Z" }, expect: { decision: "create" } },
    { id: "l-06", facts: { ...base, openTasks: [{ id: "t", title: "Call" }] }, expect: { decision: "link", taskId: "t" } },
    { id: "l-07", facts: { ...base, nextFollowUpAt: "2026-10-22T14:00:00.000Z" }, expect: { decision: "create", dueAt: "2026-10-22T14:00:00.000Z", priority: "normal" } },
    { id: "l-08", facts: { ...base, nextFollowUpAt: "2026-10-19T08:00:00.000Z" }, expect: { decision: "create", priority: "high" } },
  ];
  for (const item of cases) {
    const result = evaluateLeadCandidate(item.facts, { now }) as Record<string, unknown>;
    const ok = Object.entries(item.expect).every(([key, value]) => result[key] === value);
    if (!ok) report.failures.push({ id: item.id, detail: `expected ${JSON.stringify(item.expect)}, got ${JSON.stringify(result)}` });
    if (!ok && result.decision === "create" && item.expect.decision !== "create") report.fabrications += 1;
    tally(report, undefined, ok);
  }
  return finishReport(report);
}

function evaluateFilterMapping(): TaskReport {
  const report = emptyReport("member_filter_mapping", "decision", { metric: "case_accuracy", value: 1, fabrications: 0 });
  const cases = [
    { id: "m-01", input: { membership: "expiring" as const, expiringWithinDays: 30, unrecognised: [] }, membership: "expiring", notApplied: 0, notes: 1 },
    { id: "m-02", input: { owes: true, unrecognised: [] }, membership: "outstanding", notApplied: 0, notes: 0 },
    { id: "m-03", input: { membership: "frozen" as const, owes: true, unrecognised: [] }, membership: "frozen", notApplied: 1, notes: 0 },
    { id: "m-04", input: { notVisitedForDays: 21, unrecognised: ["tall"] }, membership: undefined, notApplied: 2, notes: 0 },
  ];
  for (const item of cases) {
    const plan = memberFilterPlan(item.input, { activeBranchId: "b-abd" });
    const ok = plan.apply.membership === item.membership && plan.notApplied.length === item.notApplied && plan.notes.length === item.notes;
    if (!ok) report.failures.push({ id: item.id, detail: JSON.stringify(plan) });
    tally(report, undefined, ok);
  }
  return finishReport(report);
}

function evaluateMachines(): TaskReport {
  const report = emptyReport("machine_matching", "reader", { metric: "case_accuracy", value: MINIMUMS.machine_matching, fabrications: 0 });
  for (const item of MACHINE_CASES) {
    const chosen = preselectedMachine(item.text, EVAL_MACHINES)?.id ?? null;
    const ok = chosen === item.expect;
    report.fields!.scored += 1;
    if (ok) report.fields!.correct += 1;
    else {
      // Preselecting the wrong machine, or one when none was meant, is worse than choosing none.
      if (chosen !== null) report.fabrications += 1;
      report.failures.push({ id: item.id, detail: `expected ${JSON.stringify(item.expect)}, got ${JSON.stringify(chosen)}` });
    }
    tally(report, item.language, ok);
  }
  return finishReport(report);
}

export function runEvaluations(now = new Date()): EvalReport {
  txnSeq = 0;
  const tasks = [evaluateNotes([...NOTE_CASES_V2, ...NOTE_CASES_V2_MIXED]), evaluateFilters(FILTER_CASES_V2), evaluateRevisions(REVISION_CASES_V2), evaluateMachines(), evaluateCashMatching(), evaluateLeadDecisions(), evaluateFilterMapping()];
  const development = [evaluateNotes(NOTE_CASES), evaluateFilters(FILTER_CASES), evaluateRevisions(REVISION_CASES)];
  return { set: HELD_OUT_SET_VERSION, developmentSet: EVAL_SET_VERSION, reader: "deterministic", ranAt: now.toISOString(), tasks, development, meetsMinimums: tasks.every((task) => task.meetsMinimum) };
}

export function formatReport(report: EvalReport): string {
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const lines = [`RIVET assistance evaluation · gate ${report.set} · ${report.reader} reader · ${report.ranAt}`];
  const describe = (task: TaskReport, gating: boolean) => {
    const languages = Object.entries(task.byLanguage).map(([language, bucket]) => `${language} ${bucket.passed}/${bucket.cases}`).join(", ");
    const fields = task.fields ? ` · fields ${task.fields.correct}/${task.fields.scored} (${percent(task.fields.scored ? task.fields.correct / task.fields.scored : 0)})` : "";
    lines.push(`${gating ? (task.meetsMinimum ? "PASS" : "FAIL") : "INFO"} ${task.task}: cases ${task.passedCases}/${task.cases}${languages ? ` (${languages})` : ""}${fields} · fabrications ${task.fabrications}${gating ? ` · minimum ${task.minimum.metric} ≥ ${percent(task.minimum.value)}` : ""}`);
    for (const failure of task.failures) lines.push(`    ${failure.id}: ${failure.detail}`);
  };
  for (const task of report.tasks) describe(task, true);
  lines.push(`Development set ${report.developmentSet} (used to fix readers; not gating):`);
  for (const task of report.development) describe(task, false);
  lines.push(report.meetsMinimums ? "All minimums met." : "Some minimums are not met.");
  return lines.join("\n");
}
