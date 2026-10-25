import type { AiArtifactSection, AiArtifactView, AiMessage, AiMessageParam, AiSourceRef } from "./contracts";
import { stableHash } from "./note-extraction";
import { toMajorString } from "../utils/money";
import { todayISODate } from "../utils/dates";

/**
 * Cash-difference investigation shared by the Convex playbook and the preview
 * adapter. It only reads recorded movements: RIVET cannot see the drawer, so
 * every match is a possibility for a person to confirm, never a finding.
 * Matching is exact to the minor unit; nothing is rounded to make it fit.
 */

export interface CashShiftTransaction {
  id: string;
  receiptId?: string;
  receiptNumber?: string;
  /** payment, retail_sale or refund. */
  type: string;
  method: string;
  status: string;
  /** Always positive; the type says which way the money moved. */
  amountMinor: number;
  occurredAt: string;
  memberName?: string;
  updatedAt: number;
}

export interface CashShiftFacts {
  shiftId: string;
  branchId: string;
  status: string;
  openedAt: string;
  closedAt?: string;
  openedByName?: string;
  closedByName?: string;
  currency: string;
  /** The gym's timezone, so the shift is named by its local business day. */
  timezone: string;
  openingFloatMinor: number;
  expectedCashMinor?: number;
  countedCashMinor?: number;
  varianceMinor?: number;
  varianceApprovalStatus: string;
  varianceExplanation?: string;
  supplierCashPaidMinor: number;
  supplierCashReversedMinor: number;
  transactions: CashShiftTransaction[];
  /** The shift record's version, for binding a prepared review to it. */
  updatedAt: number;
}

export type CashCandidateKind = "non_cash_payment" | "voided_cash_payment" | "cash_refund" | "cash_payment" | "non_cash_refund" | "cash_payment_pair";

export interface CashCandidate {
  kind: CashCandidateKind;
  transactions: CashShiftTransaction[];
}

export interface CashInvestigation {
  varianceMinor: number;
  /** Expected cash recomputed from the shift's current records. */
  recomputedExpectedMinor: number;
  /** False when a recorded movement changed after the drawer was closed. */
  expectedStillMatches: boolean;
  candidates: CashCandidate[];
  /**
   * True when exactly one recorded movement, and nothing else, matches the
   * difference. Two equal receipts, or a receipt and a pair, leave the cause to
   * the person: RIVET prepares no approval that names one of them.
   */
  singleMatch: boolean;
}

const COLLECTION_TYPES = new Set(["payment", "retail_sale"]);
const MAX_CANDIDATES = 8;
const MAX_PAIR_SCAN = 200;

function isCollection(txn: CashShiftTransaction): boolean {
  return COLLECTION_TYPES.has(txn.type);
}

export function recomputeExpectedCash(facts: CashShiftFacts): number {
  let expected = facts.openingFloatMinor - facts.supplierCashPaidMinor + facts.supplierCashReversedMinor;
  for (const txn of facts.transactions) {
    if (txn.status === "voided" || txn.method !== "cash") continue;
    if (isCollection(txn)) expected += txn.amountMinor;
    else if (txn.type === "refund") expected -= txn.amountMinor;
  }
  return expected;
}

export function investigateCashDifference(facts: CashShiftFacts): CashInvestigation {
  const variance = facts.varianceMinor ?? 0;
  const recomputed = recomputeExpectedCash(facts);
  const expectedStillMatches = facts.expectedCashMinor === undefined || facts.expectedCashMinor === recomputed;
  const target = Math.abs(variance);
  const live = facts.transactions.filter((txn) => txn.status !== "voided");
  const sorted = [...facts.transactions].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const candidates: CashCandidate[] = [];
  const add = (kind: CashCandidateKind, transactions: CashShiftTransaction[]) => {
    if (candidates.length < MAX_CANDIDATES) candidates.push({ kind, transactions });
  };
  if (target > 0) {
    if (variance > 0) {
      // More cash than recorded: money came in that was recorded another way, voided, or refunded on paper only.
      for (const txn of sorted) {
        if (txn.amountMinor !== target) continue;
        if (txn.status !== "voided" && isCollection(txn) && txn.method !== "cash") add("non_cash_payment", [txn]);
        else if (txn.status === "voided" && isCollection(txn) && txn.method === "cash") add("voided_cash_payment", [txn]);
        else if (txn.status !== "voided" && txn.type === "refund" && txn.method === "cash") add("cash_refund", [txn]);
      }
    } else {
      // Less cash than recorded: a cash payment that was not cash, or money paid out that was recorded another way.
      for (const txn of sorted) {
        if (txn.amountMinor !== target || txn.status === "voided") continue;
        if (isCollection(txn) && txn.method === "cash") add("cash_payment", [txn]);
        else if (txn.type === "refund" && txn.method !== "cash") add("non_cash_refund", [txn]);
      }
    }
    if (variance < 0) {
      const cash = live.filter((txn) => isCollection(txn) && txn.method === "cash" && txn.amountMinor < target).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).slice(0, MAX_PAIR_SCAN);
      for (let i = 0; i < cash.length && candidates.length < MAX_CANDIDATES; i += 1) {
        for (let j = i + 1; j < cash.length && candidates.length < MAX_CANDIDATES; j += 1) {
          if (cash[i]!.amountMinor + cash[j]!.amountMinor === target) add("cash_payment_pair", [cash[i]!, cash[j]!]);
        }
      }
    }
    const singleMatch = candidates.length === 1 && candidates[0]!.transactions.length === 1;
    return { varianceMinor: variance, recomputedExpectedMinor: recomputed, expectedStillMatches, candidates, singleMatch };
  }
  return { varianceMinor: variance, recomputedExpectedMinor: recomputed, expectedStillMatches, candidates, singleMatch: false };
}

const money = (amountMinor: number, currency: string): AiMessageParam => ({ amountMinor, currency });

function receiptSource(txn: CashShiftTransaction): AiSourceRef {
  return { kind: "payment", id: txn.id, ...(txn.receiptId ? { href: `/payments/receipts/${txn.receiptId}` } : {}), ...(txn.receiptNumber ? { label: txn.receiptNumber } : {}), occurredAt: txn.occurredAt };
}

function candidateMessage(candidate: CashCandidate, currency: string): AiMessage {
  const [first, second] = candidate.transactions;
  const receipt = first?.receiptNumber ?? "";
  const base = { amount: money(first?.amountMinor ?? 0, currency), receipt, at: { at: first?.occurredAt ?? "" } };
  switch (candidate.kind) {
    case "non_cash_payment":
      return { key: "aiWork.cash.candidateNonCashPayment", params: { ...base, method: { enum: "paymentMethod", value: first?.method ?? "other" } } };
    case "voided_cash_payment":
      return { key: "aiWork.cash.candidateVoidedCash", params: base };
    case "cash_refund":
      return { key: "aiWork.cash.candidateCashRefund", params: base };
    case "cash_payment":
      return { key: "aiWork.cash.candidateCashPayment", params: base };
    case "non_cash_refund":
      return { key: "aiWork.cash.candidateNonCashRefund", params: { ...base, method: { enum: "paymentMethod", value: first?.method ?? "other" } } };
    case "cash_payment_pair":
      return { key: "aiWork.cash.candidatePair", params: { amount: money((first?.amountMinor ?? 0) + (second?.amountMinor ?? 0), currency), first: receipt, second: second?.receiptNumber ?? "" } };
  }
}

type Composed = Pick<AiArtifactView, "sections" | "verification" | "coverage"> & { titleParams: Record<string, AiMessageParam> };

export function composeCashDifference(facts: CashShiftFacts, investigation: CashInvestigation): Composed {
  const currency = facts.currency;
  // No link: the summary is read on the shifts page itself; receipts keep theirs.
  const shiftSource: AiSourceRef = { kind: "shift", id: facts.shiftId };
  const variance = investigation.varianceMinor;
  const summary: AiArtifactSection["items"] = [
    { key: "expected", message: { key: "aiWork.cash.expected", params: { amount: money(facts.expectedCashMinor ?? investigation.recomputedExpectedMinor, currency) } }, sources: [shiftSource] },
    { key: "counted", message: { key: "aiWork.cash.counted", params: { amount: money(facts.countedCashMinor ?? 0, currency), name: facts.closedByName ?? "" } }, sources: [shiftSource] },
    { key: "difference", message: { key: variance > 0 ? "aiWork.cash.over" : variance < 0 ? "aiWork.cash.short" : "aiWork.cash.none", params: { amount: money(Math.abs(variance), currency) } }, sources: [shiftSource], tone: variance === 0 ? "neutral" : "attention" },
    { key: "approval", message: { key: `aiWork.cash.approval.${["pending", "approved", "rejected"].includes(facts.varianceApprovalStatus) ? facts.varianceApprovalStatus : "none"}` }, sources: [shiftSource] },
  ];
  const candidateItems: AiArtifactSection["items"] = investigation.candidates.map((candidate, index) => ({
    key: `candidate-${index}`,
    message: candidateMessage(candidate, currency),
    sources: candidate.transactions.map(receiptSource),
  }));
  if (variance !== 0 && candidateItems.length === 0) {
    candidateItems.push({ key: "no-match", message: { key: "aiWork.cash.noMatch" }, sources: [shiftSource], tone: "attention" });
  }
  if (variance !== 0) {
    candidateItems.push({ key: "confirm", message: { key: "aiWork.cash.personConfirms" }, sources: [shiftSource] });
  }
  const checks: Composed["verification"]["checks"] = [{
    key: "expected",
    ok: investigation.expectedStillMatches,
    message: investigation.expectedStillMatches
      ? { key: "aiWork.cash.checkExpectedOk" }
      : { key: "aiWork.cash.checkExpectedChanged", params: { amount: money(investigation.recomputedExpectedMinor, currency) } },
  }];
  const coverage: Composed["coverage"] = [
    { key: "payments", complete: true, message: { key: "aiWork.cash.coveragePayments", params: { count: facts.transactions.length } } },
    { key: "supplier", complete: true, message: { key: "aiWork.cash.coverageSupplier" } },
  ];
  return {
    titleParams: { date: { date: todayISODate(facts.timezone, new Date(facts.openedAt)) } },
    sections: [
      { key: "difference", titleKey: "aiWork.cash.differenceTitle", items: summary },
      { key: "candidates", titleKey: "aiWork.cash.candidatesTitle", items: candidateItems },
    ],
    verification: { verified: investigation.expectedStillMatches, checks },
    coverage,
  };
}

/**
 * A prepared approval exists only when one recorded movement alone matches the
 * difference, the difference is still waiting for approval, and the shift's
 * records have not changed since closing. Anything else is for a person to
 * work out with the drawer in front of them.
 */
export function shouldPrepareVarianceReview(facts: CashShiftFacts, investigation: CashInvestigation): boolean {
  return facts.status === "closed" && facts.varianceApprovalStatus === "pending" && investigation.varianceMinor !== 0 && investigation.singleMatch && investigation.expectedStillMatches;
}

/** The note saved with the approval; it says what RIVET matched and that a person confirmed it. */
export function varianceReviewNote(facts: CashShiftFacts, investigation: CashInvestigation): string {
  const candidate = investigation.candidates.find((item) => item.transactions.length === 1);
  const txn = candidate?.transactions[0];
  const amount = toMajorString({ amount: Math.abs(investigation.varianceMinor), currency: facts.currency });
  const direction = investigation.varianceMinor > 0 ? "over" : "short";
  const receipt = txn?.receiptNumber ? `receipt ${txn.receiptNumber}` : "a recorded movement";
  const reason: Record<CashCandidateKind, string> = {
    non_cash_payment: `recorded as ${txn?.method ?? "another method"} but likely paid in cash`,
    voided_cash_payment: "voided while the cash stayed in the drawer",
    cash_refund: "recorded as a cash refund but the money was not handed back",
    cash_payment: "recorded as cash but not paid in cash",
    non_cash_refund: `recorded as a ${txn?.method ?? "non-cash"} refund but paid out from the drawer`,
    cash_payment_pair: "two cash payments recorded in error",
  };
  return `Cash ${direction} ${facts.currency} ${amount} matches ${receipt}, ${candidate ? reason[candidate.kind] : "a recorded movement"}. Matched by RIVET; confirmed by the approving manager.`;
}

export interface VarianceReviewProposal {
  changes: Array<{ field: string; from?: string; to: string }>;
  payload: { shiftId: string; decision: "approved"; note: string; varianceMinor: number };
  sourceVersions: Array<{ table: string; id: string; updatedAt: number }>;
  changesetHash: string;
}

export function varianceReviewProposal(facts: CashShiftFacts, investigation: CashInvestigation): VarianceReviewProposal {
  const note = varianceReviewNote(facts, investigation);
  const matched = investigation.candidates.find((item) => item.transactions.length === 1)?.transactions ?? [];
  const sourceVersions = [
    { table: "shift", id: facts.shiftId, updatedAt: facts.updatedAt },
    ...matched.map((txn) => ({ table: "payment", id: txn.id, updatedAt: txn.updatedAt })),
  ];
  const payload = { shiftId: facts.shiftId, decision: "approved" as const, note, varianceMinor: investigation.varianceMinor };
  const changes = [
    { field: "cashDifference", from: "pending", to: "approved" },
    { field: "note", to: note },
  ];
  return { changes, payload, sourceVersions, changesetHash: changesetHash("shift.propose_variance_review", payload, sourceVersions) };
}

export function changesetHash(tool: string, payload: unknown, sourceVersions: Array<{ table: string; id: string; updatedAt: number }>): string {
  const body = JSON.stringify({ tool, payload, sources: sourceVersions.map((source) => `${source.table}:${source.id}:${source.updatedAt}`) });
  // Two independent passes keep accidental collisions out of reach; the server executes its stored payload, never the client's.
  return `${stableHash(body)}${stableHash(`${body.length}|${body}`)}`;
}
