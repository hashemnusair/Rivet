/**
 * Pure accounting invariants shared by the Convex posting service and its
 * focused unit tests. Keeping these rules free of database context makes the
 * money-safety contract easy to verify without depending on tenant fixtures.
 */

export type LedgerLineInput = {
  accountId: string;
  debitMinor: number;
  creditMinor: number;
  currency?: string;
};

export type LedgerBalanceCheck = {
  balanced: boolean;
  totalDebitMinor: number;
  totalCreditMinor: number;
  reason?: "too_few_lines" | "invalid_line" | "currency_mismatch" | "zero_or_unbalanced";
};

export function inspectLedgerBalance(lines: readonly LedgerLineInput[], currency: string): LedgerBalanceCheck {
  if (lines.length < 2) {
    return { balanced: false, totalDebitMinor: 0, totalCreditMinor: 0, reason: "too_few_lines" };
  }

  let totalDebitMinor = 0;
  let totalCreditMinor = 0;
  for (const line of lines) {
    if (line.currency && line.currency.toUpperCase() !== currency.toUpperCase()) {
      return { balanced: false, totalDebitMinor, totalCreditMinor, reason: "currency_mismatch" };
    }
    if (
      !line.accountId ||
      !Number.isSafeInteger(line.debitMinor) ||
      !Number.isSafeInteger(line.creditMinor) ||
      line.debitMinor < 0 ||
      line.creditMinor < 0 ||
      (line.debitMinor === 0 && line.creditMinor === 0) ||
      (line.debitMinor > 0 && line.creditMinor > 0)
    ) {
      return { balanced: false, totalDebitMinor, totalCreditMinor, reason: "invalid_line" };
    }
    const nextDebit = totalDebitMinor + line.debitMinor;
    const nextCredit = totalCreditMinor + line.creditMinor;
    if (!Number.isSafeInteger(nextDebit) || !Number.isSafeInteger(nextCredit)) {
      return { balanced: false, totalDebitMinor, totalCreditMinor, reason: "invalid_line" };
    }
    totalDebitMinor = nextDebit;
    totalCreditMinor = nextCredit;
  }

  return {
    balanced: totalDebitMinor > 0 && totalCreditMinor > 0 && totalDebitMinor === totalCreditMinor,
    totalDebitMinor,
    totalCreditMinor,
    ...(totalDebitMinor > 0 && totalCreditMinor > 0 && totalDebitMinor === totalCreditMinor ? {} : { reason: "zero_or_unbalanced" as const }),
  };
}

export function sourcePostingIdempotencyKey(input: {
  sourceType: string;
  sourcePublicId: string;
  policyCode: string;
  policyVersion: number;
  idempotencyKey: string;
}): string {
  // A JSON tuple avoids delimiter-collision bugs when a source or caller key
  // itself contains punctuation such as ':'. The policy version is included
  // deliberately so a new policy can post a separately auditable correction.
  return `source:${JSON.stringify([
    input.sourceType,
    input.sourcePublicId,
    input.policyCode,
    input.policyVersion,
    input.idempotencyKey,
  ])}`;
}

/**
 * A deterministic request fingerprint is persisted alongside a journal's
 * idempotency key. It is intentionally a canonical JSON value rather than a
 * runtime-dependent hash: the ledger only needs to detect material request
 * reuse, and retaining the canonical payload makes audits/debugging useful.
 */
export function manualJournalRequestFingerprint(input: {
  scope: "branch" | "consolidated";
  branchId?: string;
  postingDate: string;
  memo: string;
  reason: string;
  lines: readonly { accountId: string; debitMinor: number; creditMinor: number; description?: string }[];
}): string {
  return JSON.stringify([
    "manual",
    input.scope,
    input.branchId ?? null,
    input.postingDate,
    input.memo,
    input.reason,
    input.lines.map((line) => [
      line.accountId.startsWith("acct-") ? line.accountId.slice(5) : line.accountId,
      line.debitMinor,
      line.creditMinor,
      line.description ?? null,
    ]),
  ]);
}

export function reversalRequestFingerprint(input: { entryId: string; reason: string }): string {
  return JSON.stringify(["reversal", input.entryId, input.reason]);
}
