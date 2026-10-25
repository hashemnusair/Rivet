import { describe, expect, it } from "vitest";
import { composeCashDifference, investigateCashDifference, recomputeExpectedCash, shouldPrepareVarianceReview, varianceReviewProposal, type CashShiftFacts, type CashShiftTransaction } from "./cash-difference";

let seq = 0;
function txn(partial: Partial<CashShiftTransaction>): CashShiftTransaction {
  seq += 1;
  return { id: `p-${seq}`, receiptNumber: `R-${seq}`, type: "payment", method: "cash", status: "completed", amountMinor: 10_000, occurredAt: `2026-10-22T0${seq % 10}:00:00.000Z`, updatedAt: 1, ...partial };
}

function shift(transactions: CashShiftTransaction[], countedCashMinor: number, overrides: Partial<CashShiftFacts> = {}): CashShiftFacts {
  const base: CashShiftFacts = { shiftId: "s-1", branchId: "b-1", status: "closed", openedAt: "2026-10-22T05:00:00.000Z", currency: "JOD", timezone: "Asia/Amman", openingFloatMinor: 10_000, varianceApprovalStatus: "pending", supplierCashPaidMinor: 0, supplierCashReversedMinor: 0, transactions, updatedAt: 1 };
  const expected = recomputeExpectedCash({ ...base, ...overrides });
  return { ...base, expectedCashMinor: expected, countedCashMinor: countedCashMinor, varianceMinor: countedCashMinor - expected, ...overrides };
}

describe("cash-difference matching", () => {
  it("recomputes expected cash the way the close does: float, cash in, cash refunds and supplier cash", () => {
    const facts = shift([txn({ amountMinor: 20_000 }), txn({ type: "refund", amountMinor: 3_000 }), txn({ method: "card", amountMinor: 9_000 }), txn({ status: "voided", amountMinor: 7_000 })], 0, { supplierCashPaidMinor: 2_000, supplierCashReversedMinor: 500 });
    expect(recomputeExpectedCash(facts)).toBe(10_000 + 20_000 - 3_000 - 2_000 + 500);
  });

  it("for a short drawer, offers cash payments and non-cash refunds of the exact amount, then pairs", () => {
    const facts = shift([txn({ amountMinor: 5_000 }), txn({ type: "refund", method: "card", amountMinor: 5_000 }), txn({ amountMinor: 2_000 }), txn({ amountMinor: 3_000 }), txn({ method: "card", amountMinor: 5_000 })], 0);
    // Expected 10 + 5 + 2 + 3 = 20; count 15 → short 5.
    const short = shift(facts.transactions, 15_000);
    const result = investigateCashDifference(short);
    expect(result.varianceMinor).toBe(-5_000);
    expect(result.candidates.map((candidate) => candidate.kind)).toEqual(["cash_payment", "non_cash_refund", "cash_payment_pair"]);
    // Three explanations: the person decides, so no approval is prepared.
    expect(result.singleMatch).toBe(false);
    expect(shouldPrepareVarianceReview(short, result)).toBe(false);
  });

  it("prepares an approval only when exactly one movement explains the difference", () => {
    const one = shift([txn({ method: "card", amountMinor: 5_000 })], 0);
    const over = { ...one, countedCashMinor: (one.expectedCashMinor ?? 0) + 5_000, varianceMinor: 5_000 };
    expect(shouldPrepareVarianceReview(over, investigateCashDifference(over))).toBe(true);
    // Two equal card payments: either could be the cash one, so RIVET names neither.
    const two = shift([txn({ method: "card", amountMinor: 5_000 }), txn({ method: "card", amountMinor: 5_000 })], 0);
    const ambiguous = { ...two, countedCashMinor: (two.expectedCashMinor ?? 0) + 5_000, varianceMinor: 5_000 };
    const result = investigateCashDifference(ambiguous);
    expect(result.candidates).toHaveLength(2);
    expect(result.singleMatch).toBe(false);
    expect(shouldPrepareVarianceReview(ambiguous, result)).toBe(false);
    // A pair is never a single cause either.
    const pair = shift([txn({ amountMinor: 2_000 }), txn({ amountMinor: 3_000 })], 0);
    const short = { ...pair, countedCashMinor: (pair.expectedCashMinor ?? 0) - 5_000, varianceMinor: -5_000 };
    expect(investigateCashDifference(short).singleMatch).toBe(false);
  });

  it("for an over drawer, offers non-cash payments, voided cash payments and cash refunds of the exact amount", () => {
    const facts = shift([txn({ method: "cliq", amountMinor: 4_000 }), txn({ status: "voided", amountMinor: 4_000 }), txn({ type: "refund", amountMinor: 4_000 }), txn({ amountMinor: 4_000 })], 0);
    const over = shift(facts.transactions, recomputeExpectedCash(facts) + 4_000);
    expect(investigateCashDifference(over).candidates.map((candidate) => candidate.kind)).toEqual(["non_cash_payment", "voided_cash_payment", "cash_refund"]);
  });

  it("never rounds to make a match and says when nothing matches", () => {
    const over = shift([txn({ method: "card", amountMinor: 4_999 })], 0);
    const facts = { ...over, countedCashMinor: (over.expectedCashMinor ?? 0) + 5_000, varianceMinor: 5_000 };
    const result = investigateCashDifference(facts);
    expect(result.candidates).toEqual([]);
    expect(shouldPrepareVarianceReview(facts, result)).toBe(false);
    expect(composeCashDifference(facts, result).sections[1]!.items.map((item) => item.message.key)).toEqual(["aiWork.cash.noMatch", "aiWork.cash.personConfirms"]);
  });

  it("treats records that changed after closing as unverified and prepares no approval", () => {
    const base = shift([txn({ method: "card", amountMinor: 5_000 }), txn({ amountMinor: 6_000 })], 0);
    const closed = { ...base, countedCashMinor: (base.expectedCashMinor ?? 0) + 5_000, varianceMinor: 5_000 };
    const changed = { ...closed, transactions: closed.transactions.map((item) => item.amountMinor === 6_000 ? { ...item, status: "voided" } : item) };
    const result = investigateCashDifference(changed);
    expect(result.expectedStillMatches).toBe(false);
    expect(shouldPrepareVarianceReview(changed, result)).toBe(false);
    expect(composeCashDifference(changed, result).verification.verified).toBe(false);
  });

  it("binds the prepared approval to the shift and matched payment versions", () => {
    const base = shift([txn({ id: "card-1", method: "card", amountMinor: 5_000, updatedAt: 7 })], 0);
    const facts = { ...base, countedCashMinor: (base.expectedCashMinor ?? 0) + 5_000, varianceMinor: 5_000, updatedAt: 3 };
    const result = investigateCashDifference(facts);
    expect(shouldPrepareVarianceReview(facts, result)).toBe(true);
    const proposal = varianceReviewProposal(facts, result);
    expect(proposal.sourceVersions).toEqual([{ table: "shift", id: "s-1", updatedAt: 3 }, { table: "payment", id: "card-1", updatedAt: 7 }]);
    expect(proposal.payload.note).toMatch(/^Cash over JOD 5\.000 matches receipt R-\d+/);
    expect(varianceReviewProposal({ ...facts, updatedAt: 4 }, result).changesetHash).not.toBe(proposal.changesetHash);
  });

  it("names the shift by the gym's local day, not the UTC day", () => {
    const base = shift([], 0, { openedAt: "2026-10-22T22:30:00.000Z" });
    const facts = { ...base, countedCashMinor: 1, varianceMinor: 1 - (base.expectedCashMinor ?? 0) };
    expect(composeCashDifference(facts, investigateCashDifference(facts)).titleParams).toEqual({ date: { date: "2026-10-23" } });
  });
});
