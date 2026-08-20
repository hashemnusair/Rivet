import { describe, expect, it } from "vitest";
import { inspectLedgerBalance, manualJournalRequestFingerprint, reversalRequestFingerprint, sourcePostingIdempotencyKey } from "./accountingLedger";

describe("pure accounting ledger invariants", () => {
  it("accepts balanced integer minor-unit lines and rejects unsafe money shapes", () => {
    expect(inspectLedgerBalance([
      { accountId: "acct-1100", debitMinor: 1_250, creditMinor: 0, currency: "JOD" },
      { accountId: "acct-1200", debitMinor: 0, creditMinor: 1_250, currency: "JOD" },
    ], "JOD")).toMatchObject({ balanced: true, totalDebitMinor: 1_250, totalCreditMinor: 1_250 });

    expect(inspectLedgerBalance([
      { accountId: "acct-1100", debitMinor: 1_250, creditMinor: 0, currency: "USD" },
      { accountId: "acct-1200", debitMinor: 0, creditMinor: 1_250, currency: "USD" },
    ], "JOD")).toMatchObject({ balanced: false, reason: "currency_mismatch" });

    expect(inspectLedgerBalance([
      { accountId: "acct-1100", debitMinor: 0, creditMinor: 0, currency: "JOD" },
      { accountId: "acct-1200", debitMinor: 0, creditMinor: 0, currency: "JOD" },
    ], "JOD")).toMatchObject({ balanced: false, reason: "invalid_line" });
  });

  it("derives deterministic source keys while separating policy versions and caller keys", () => {
    const first = sourcePostingIdempotencyKey({ sourceType: "payment", sourcePublicId: "payment:1", policyCode: "payment-cash.v1", policyVersion: 1, idempotencyKey: "capture:1" });
    const replay = sourcePostingIdempotencyKey({ sourceType: "payment", sourcePublicId: "payment:1", policyCode: "payment-cash.v1", policyVersion: 1, idempotencyKey: "capture:1" });
    const policyChange = sourcePostingIdempotencyKey({ sourceType: "payment", sourcePublicId: "payment:1", policyCode: "payment-cash.v1", policyVersion: 2, idempotencyKey: "capture:1" });
    const differentSource = sourcePostingIdempotencyKey({ sourceType: "payment", sourcePublicId: "payment", policyCode: "payment-cash.v1", policyVersion: 1, idempotencyKey: "1:capture" });

    expect(first).toBe(replay);
    expect(policyChange).not.toBe(first);
    expect(differentSource).not.toBe(first);
  });

  it("fingerprints exact manual and reversal requests for idempotency conflict checks", () => {
    const manual = { scope: "branch" as const, branchId: "branch-a", postingDate: "2026-08-19", memo: "Closeout", reason: "Owner review", lines: [{ accountId: "acct-1100", debitMinor: 100, creditMinor: 0 }, { accountId: "acct-1200", debitMinor: 0, creditMinor: 100 }] };
    expect(manualJournalRequestFingerprint(manual)).toBe(manualJournalRequestFingerprint({ ...manual, lines: [{ ...manual.lines[0]!, accountId: "1100" }, manual.lines[1]!] }));
    expect(manualJournalRequestFingerprint(manual)).not.toBe(manualJournalRequestFingerprint({ ...manual, memo: "Different closeout" }));
    expect(reversalRequestFingerprint({ entryId: "je-1", reason: "Correction" })).not.toBe(reversalRequestFingerprint({ entryId: "je-1", reason: "Different correction" }));
  });
});
