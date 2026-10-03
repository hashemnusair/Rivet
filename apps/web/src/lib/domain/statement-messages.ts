/** Stable presentation keys. Original report text and accounting facts are retained. */
export const STATEMENT_TEXT_KEYS = {
  "accounting source queue coverage is not proven for this report. refresh the source queue before relying on completeness.": "statements.coverageWarning",
  "membership revenue recognition coverage is incomplete; deferred amounts remain unearned until the validated service schedule is posted.": "statements.membershipWarning",
  "fixed assets have incomplete depreciation coverage; affected assets remain gross until acquisition, date, cost, useful life, and lifecycle requirements are posted.": "statements.equipmentWarning",
  "management accounting projection for operational decision support. this is not statutory, tax, audit, or jurisdiction-specific financial reporting.": "statements.disclaimer",
  "cash arithmetic agrees with the current ledger projection, but source queue coverage is not proven. refresh the source queue before treating this reconciliation as complete.": "statements.cashCoverageWarning",
  "the classified cash movement does not agree with the independent cash-account position through the as-of date.": "statements.cashMismatchWarning",
  "cash on hand and card/bank-transfer clearing accounts are treated as cash. each posted entry's cash movement is classified by its non-cash counterpart lines: investing when any counterpart is a non-current asset, otherwise financing when any counterpart is equity or a non-current liability, otherwise operating. entries that only move money between cash accounts are internal transfers and are excluded from the classified sections.": "statements.cashPolicy",
  "some authoritative source facts are not posted; review the source queue before relying on these figures.": "statements.unpostedWarning",
  "some authoritative accounting sources are not posted; pending or failed facts are omitted from the statements.": "statements.mockUnpostedWarning",
} as const;
export interface StatementTextMessage {
  key: (typeof STATEMENT_TEXT_KEYS)[keyof typeof STATEMENT_TEXT_KEYS] | "statements.postedDrift" | "statements.mixedCash";
  params?: Record<string, string | number>;
}
export function describeStatementText(text: string): StatementTextMessage | undefined {
  const normalized = text.trim().replace(/\s+/g, " ").toLowerCase();
  if (Object.hasOwn(STATEMENT_TEXT_KEYS, normalized)) return { key: STATEMENT_TEXT_KEYS[normalized as keyof typeof STATEMENT_TEXT_KEYS] };
  let match = /^(\d+) posted accounting source postings? no longer match(?:es)? the current operational record \(amount, currency, or branch changed after posting\)\. review the source queue and use an owner reversal plus a corrected posting where needed\.$/.exec(normalized);
  if (match) return { key: "statements.postedDrift", params: { count: Number(match[1]) } };
  match = /^(\d+) journal (?:entry pairs|entries pair) one cash movement with counterparts from more than one activity; the whole movement is classified by priority \(investing, then financing, then operating\) under (cashflow-classification\.v\d+)\. post separate journals to split such movements precisely\.$/.exec(normalized);
  if (match) return { key: "statements.mixedCash", params: { count: Number(match[1]), policy: match[2]! } };
  return undefined;
}
export function statementWarningMessages(warnings: readonly string[]): Array<StatementTextMessage & { original: string }> {
  return warnings.flatMap(original => { const message = describeStatementText(original); return message ? [{ original, ...message }] : []; });
}
