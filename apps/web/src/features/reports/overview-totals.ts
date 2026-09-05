import type { GymOSApi } from "@/lib/api/GymOSApi";
import type { TransactionSummary } from "@/lib/domain/types";

/** Enough for a quarter of a busy gym; anything beyond is flagged, never hidden. */
export const MAX_RANGE_PAGES = 10;

/**
 * The reports overview reads the same transaction contract the desk uses,
 * but reads every page in the range so its totals describe the whole window
 * rather than the rows that happen to be visible.
 */
export async function loadTransactionsInRange(api: GymOSApi, input: { branchId?: string; from: string; to: string }, maxPages = MAX_RANGE_PAGES) {
  const items: TransactionSummary[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await api.listTransactions({ ...input, page, pageSize: 100, sort: "-occurredAt" });
    items.push(...result.items);
    totalPages = result.totalPages;
    page += 1;
  } while (page <= totalPages && page <= maxPages);
  return { items, truncated: totalPages > maxPages };
}

export function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export type BreakdownRow = { key: string; amount: number; refunds: number; count: number };

/** Range totals from the transaction facts themselves; voids never count as collected. */
export function summarizeRange(items: readonly TransactionSummary[]) {
  const byMethod = new Map<string, BreakdownRow>();
  const byBranch = new Map<string, BreakdownRow>();
  const bump = (map: Map<string, BreakdownRow>, key: string, patch: Partial<BreakdownRow>) => {
    const row = map.get(key) ?? { key, amount: 0, refunds: 0, count: 0 };
    map.set(key, { ...row, amount: row.amount + (patch.amount ?? 0), refunds: row.refunds + (patch.refunds ?? 0), count: row.count + (patch.count ?? 0) });
  };
  let collected = 0;
  let refunded = 0;
  let voided = 0;
  let paymentCount = 0;
  let refundCount = 0;
  let voidCount = 0;
  for (const item of items) {
    if (item.type === "refund") {
      const amount = Math.abs(item.amount.amount);
      refunded += amount;
      refundCount += 1;
      bump(byMethod, item.method, { refunds: amount });
      bump(byBranch, item.branchName, { refunds: amount });
      continue;
    }
    if (item.type === "void") continue;
    if (item.status === "voided") {
      voided += item.amount.amount;
      voidCount += 1;
      continue;
    }
    collected += item.amount.amount;
    paymentCount += 1;
    bump(byMethod, item.method, { amount: item.amount.amount, count: 1 });
    bump(byBranch, item.branchName, { amount: item.amount.amount, count: 1 });
  }
  const sortRows = (map: Map<string, BreakdownRow>) => [...map.values()].sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key));
  return { collected, refunded, voided, paymentCount, refundCount, voidCount, byMethod: sortRows(byMethod), byBranch: sortRows(byBranch) };
}
