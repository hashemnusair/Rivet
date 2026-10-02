import { describe, expect, it, vi } from "vitest";
import type { GymOSApi } from "@/lib/api/GymOSApi";
import type { TransactionSummary } from "@/lib/domain/types";
import { countLabel, loadTransactionsInRange, summarizeRange } from "./overview-totals";

function transaction(overrides: Omit<Partial<TransactionSummary>, "amount"> & { amount: number }): TransactionSummary {
  return {
    id: overrides.id ?? `tx-${Math.random().toString(36).slice(2)}`,
    type: "payment",
    status: "completed",
    method: "cash",
    branchName: "Forge — Abdoun",
    memberName: "Member",
    memberNumber: "ABD-1000",
    receiptNumber: "R-1",
    occurredAt: "2026-09-05T07:00:00.000Z",
    ...overrides,
    amount: { amount: overrides.amount, currency: "JOD" },
  } as unknown as TransactionSummary;
}

describe("summarizeRange", () => {
  it("separates collected money from refunds and voids and breaks it down by method and branch", () => {
    const totals = summarizeRange([
      transaction({ amount: 50_000, method: "cash" }),
      transaction({ amount: 190_000, method: "card", branchName: "Forge — Sweifieh" }),
      transaction({ amount: 40_000, method: "card", status: "voided" }),
      transaction({ amount: -40_000, method: "card", type: "refund", branchName: "Forge — Sweifieh" }),
      transaction({ amount: 8_000, method: "cliq", type: "retail_sale" }),
    ]);
    expect(totals.collected).toBe(248_000);
    expect(totals.paymentCount).toBe(3);
    expect(totals.refunded).toBe(40_000);
    expect(totals.refundCount).toBe(1);
    expect(totals.voided).toBe(40_000);
    expect(totals.voidCount).toBe(1);
    expect(totals.byMethod).toEqual([
      { key: "card", amount: 190_000, refunds: 40_000, count: 1 },
      { key: "cash", amount: 50_000, refunds: 0, count: 1 },
      { key: "cliq", amount: 8_000, refunds: 0, count: 1 },
    ]);
    expect(totals.byBranch.map((row) => row.key)).toEqual(["Forge — Sweifieh", "Forge — Abdoun"]);
  });

  it("reads every page of the range and flags when the cap is reached", async () => {
    const listTransactions = vi.fn(async ({ page }: { page: number }) => ({ items: [transaction({ id: `tx-${page}`, amount: 1_000 })], page, pageSize: 100, totalItems: 3, totalPages: 3 }));
    const api = { listTransactions } as unknown as GymOSApi;
    const full = await loadTransactionsInRange(api, { from: "2026-08-07", to: "2026-09-05" });
    expect(full.items.map((item) => item.id)).toEqual(["tx-1", "tx-2", "tx-3"]);
    expect(full.truncated).toBe(false);
    const capped = await loadTransactionsInRange(api, { from: "2026-08-07", to: "2026-09-05" }, 2);
    expect(capped.items).toHaveLength(2);
    expect(capped.truncated).toBe(true);
    expect(listTransactions).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 100, sort: "-occurredAt" }));
  });

  it("pluralises counts in plain language", () => {
    expect(countLabel(1, "refund")).toBe("1 refund");
    expect(countLabel(3, "payment")).toBe("3 payments");
  });
});
