import { describe, expect, it } from "vitest";
import type { Payable } from "./types";
import { calendarDaysBetween, matchesPayableFilters, payableAgingBucket, payableStatusFor, suggestPayableAllocations, summarizePayables } from "./payables";

const payable = (overrides: Partial<Payable>): Payable => ({
  id: "purchase_order:po-1",
  sourceType: "purchase_order",
  sourceId: "po-1",
  sourceLabel: "Purchase order · Creatine × 100",
  supplierId: "supplier-1",
  supplierName: "Jordan Sports Supply",
  branchId: "branch-1",
  branchName: "Abdoun",
  currency: "JOD",
  receivedAt: "2026-08-01T10:00:00.000Z",
  ageDays: 31,
  original: { amount: 1_650_000, currency: "JOD" },
  paid: { amount: 0, currency: "JOD" },
  remaining: { amount: 1_650_000, currency: "JOD" },
  status: "unpaid",
  ledgerPostingStatus: "not_posted",
  href: "/operations?tab=orders&order=po-1",
  ...overrides,
});

describe("payables domain helpers", () => {
  it("ages payables on whole calendar days and buckets them honestly", () => {
    expect(calendarDaysBetween("2026-08-01", "2026-09-01")).toBe(31);
    expect(calendarDaysBetween("2026-09-01", "2026-08-01")).toBe(0);
    expect(calendarDaysBetween("bad", "2026-09-01")).toBe(0);
    expect(payableAgingBucket(0)).toBe("0-30");
    expect(payableAgingBucket(30)).toBe("0-30");
    expect(payableAgingBucket(31)).toBe("31-60");
    expect(payableAgingBucket(90)).toBe("61-90");
    expect(payableAgingBucket(91)).toBe("90+");
  });

  it("derives the payable status from ledger reversal and paid amounts", () => {
    expect(payableStatusFor(false, 0, 1_000)).toBe("unpaid");
    expect(payableStatusFor(false, 500, 500)).toBe("partially_paid");
    expect(payableStatusFor(false, 1_000, 0)).toBe("paid");
    expect(payableStatusFor(true, 0, 1_000)).toBe("reversed");
  });

  it("filters by supplier, status, and readable search terms", () => {
    const open = payable({});
    const paid = payable({ id: "purchase_order:po-2", sourceId: "po-2", paid: { amount: 1_650_000, currency: "JOD" }, remaining: { amount: 0, currency: "JOD" }, status: "paid", externalReference: "JSS-INV-0147" });
    expect(matchesPayableFilters(open, {})).toBe(true);
    expect(matchesPayableFilters(paid, {})).toBe(false);
    expect(matchesPayableFilters(paid, { status: "all" })).toBe(true);
    expect(matchesPayableFilters(paid, { status: "paid", search: "inv-0147" })).toBe(true);
    expect(matchesPayableFilters(open, { supplierId: "someone-else" })).toBe(false);
    expect(matchesPayableFilters(open, { search: "abdoun" })).toBe(true);
  });

  it("summarizes outstanding totals per supplier and aging bucket over open payables only", () => {
    const rows = [
      payable({ ageDays: 10, paid: { amount: 650_000, currency: "JOD" }, remaining: { amount: 1_000_000, currency: "JOD" }, status: "partially_paid" }),
      payable({ id: "purchase_order:po-2", sourceId: "po-2", supplierId: "supplier-2", supplierName: "Amman Nutrition", ageDays: 95, receivedAt: "2026-05-01T10:00:00.000Z", original: { amount: 200_000, currency: "JOD" }, remaining: { amount: 200_000, currency: "JOD" } }),
      payable({ id: "purchase_order:po-3", sourceId: "po-3", paid: { amount: 300_000, currency: "JOD" }, original: { amount: 300_000, currency: "JOD" }, remaining: { amount: 0, currency: "JOD" }, status: "paid" }),
    ];
    const summary = summarizePayables(rows, "JOD");
    expect(summary.totals).toEqual({ outstanding: { amount: 1_200_000, currency: "JOD" }, original: { amount: 2_150_000, currency: "JOD" }, paid: { amount: 950_000, currency: "JOD" }, openCount: 2 });
    expect(summary.supplierTotals.map((row) => [row.supplierName, row.outstanding.amount, row.openCount])).toEqual([["Jordan Sports Supply", 1_000_000, 1], ["Amman Nutrition", 200_000, 1]]);
    expect(summary.aging.find((bucket) => bucket.bucket === "0-30")).toMatchObject({ outstanding: { amount: 1_000_000 }, count: 1 });
    expect(summary.aging.find((bucket) => bucket.bucket === "90+")).toMatchObject({ outstanding: { amount: 200_000 }, count: 1 });
  });

  it("suggests oldest-first allocations that never exceed a payable or the payment", () => {
    const oldest = payable({ id: "purchase_order:po-old", sourceId: "po-old", receivedAt: "2026-06-01T10:00:00.000Z", original: { amount: 400_000, currency: "JOD" }, remaining: { amount: 400_000, currency: "JOD" } });
    const newer = payable({ id: "purchase_order:po-new", sourceId: "po-new", receivedAt: "2026-08-01T10:00:00.000Z", original: { amount: 1_000_000, currency: "JOD" }, remaining: { amount: 1_000_000, currency: "JOD" } });
    const paid = payable({ id: "purchase_order:po-paid", sourceId: "po-paid", receivedAt: "2026-01-01T10:00:00.000Z", remaining: { amount: 0, currency: "JOD" }, status: "paid" });
    expect(suggestPayableAllocations([newer, paid, oldest], 650_000)).toEqual({ allocations: [{ payableId: "purchase_order:po-old", amountMinor: 400_000 }, { payableId: "purchase_order:po-new", amountMinor: 250_000 }], unallocatedMinor: 0 });
    expect(suggestPayableAllocations([newer, oldest], 2_000_000)).toEqual({ allocations: [{ payableId: "purchase_order:po-old", amountMinor: 400_000 }, { payableId: "purchase_order:po-new", amountMinor: 1_000_000 }], unallocatedMinor: 600_000 });
    expect(suggestPayableAllocations([newer], 0)).toEqual({ allocations: [], unallocatedMinor: 0 });
  });
});
