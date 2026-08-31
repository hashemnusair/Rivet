import { describe, expect, it } from "vitest";
import { allocateMembershipByMonth, monthlyDepreciationAmount, MAX_MEMBERSHIP_SERVICE_MONTHS } from "./accounting";

/**
 * Independent recomputation of the recognition and depreciation allocators.
 * Every expected value here was hand-calculated from the documented policy
 * (daily-weighted-largest-remainder.v1 / straight-line-monthly-remainder.v1),
 * never copied from the implementation's own output.
 */

const sum = (rows: Array<{ amount: number }>): number => rows.reduce((total, row) => total + row.amount, 0);

describe("membership daily allocation (daily-weighted-largest-remainder.v1)", () => {
  it("splits a two-month crossing term exactly, front-loading the remainder", () => {
    // 2026-01-15..2026-03-14 = 17 + 28 + 14 = 59 days. 90000/59 = 1525 r 25.
    // Extras land on the first 25 service days: all 17 January days and the
    // first 8 February days.
    const rows = allocateMembershipByMonth(90_000, "2026-01-15", "2026-03-14");
    expect(rows).toEqual([
      { month: "2026-01", serviceStart: "2026-01-15", serviceEnd: "2026-01-31", days: 17, amount: 17 * 1526 },
      { month: "2026-02", serviceStart: "2026-02-01", serviceEnd: "2026-02-28", days: 28, amount: 28 * 1525 + 8 },
      { month: "2026-03", serviceStart: "2026-03-01", serviceEnd: "2026-03-14", days: 14, amount: 14 * 1525 },
    ]);
    expect(sum(rows)).toBe(90_000);
  });

  it("handles leap and non-leap February day counts", () => {
    const leap = allocateMembershipByMonth(29_001, "2024-02-01", "2024-02-29");
    expect(leap).toEqual([{ month: "2024-02", serviceStart: "2024-02-01", serviceEnd: "2024-02-29", days: 29, amount: 29_001 }]);
    const nonLeap = allocateMembershipByMonth(28_000, "2026-02-01", "2026-02-28");
    expect(nonLeap).toEqual([{ month: "2026-02", serviceStart: "2026-02-01", serviceEnd: "2026-02-28", days: 28, amount: 28_000 }]);
  });

  it("conserves a full-year term with an awkward remainder", () => {
    // 365 days in 2026; 365003/365 = 1000 r 3 → the 3 extra fils are all in
    // the first three January days.
    const rows = allocateMembershipByMonth(365_003, "2026-01-01", "2026-12-31");
    expect(rows).toHaveLength(12);
    expect(rows[0]).toMatchObject({ month: "2026-01", days: 31, amount: 31_000 + 3 });
    expect(rows[1]).toMatchObject({ month: "2026-02", days: 28, amount: 28_000 });
    expect(rows[11]).toMatchObject({ month: "2026-12", days: 31, amount: 31_000 });
    expect(sum(rows)).toBe(365_003);
  });

  it("crosses a year boundary without drifting a day into the wrong month", () => {
    // 2025-12-25..2026-01-05 = 12 days at exactly 100/day.
    const rows = allocateMembershipByMonth(1_200, "2025-12-25", "2026-01-05");
    expect(rows).toEqual([
      { month: "2025-12", serviceStart: "2025-12-25", serviceEnd: "2025-12-31", days: 7, amount: 700 },
      { month: "2026-01", serviceStart: "2026-01-01", serviceEnd: "2026-01-05", days: 5, amount: 500 },
    ]);
  });

  it("allocates an amount smaller than the day count without inventing value", () => {
    const rows = allocateMembershipByMonth(7, "2026-03-01", "2026-03-30");
    expect(rows).toEqual([{ month: "2026-03", serviceStart: "2026-03-01", serviceEnd: "2026-03-07", days: 7, amount: 7 }]);
  });

  it("returns nothing for zero, negative, fractional, or inverted inputs", () => {
    expect(allocateMembershipByMonth(0, "2026-01-01", "2026-01-31")).toEqual([]);
    expect(allocateMembershipByMonth(-1, "2026-01-01", "2026-01-31")).toEqual([]);
    expect(allocateMembershipByMonth(10.5, "2026-01-01", "2026-01-31")).toEqual([]);
    expect(allocateMembershipByMonth(1_000, "2026-02-01", "2026-01-01")).toEqual([]);
  });

  it("excludes frozen days once even when freeze windows overlap or duplicate", () => {
    const freezes = [
      { startDate: "2026-01-10", endDate: "2026-01-19", status: "completed" },
      { startDate: "2026-01-15", endDate: "2026-01-19", status: "active" },
      { startDate: "2026-01-10", endDate: "2026-01-19", status: "completed" },
    ];
    // 31 days minus the 10 distinct frozen days = 21 service days at 100.
    const rows = allocateMembershipByMonth(2_100, "2026-01-01", "2026-01-31", { freezes });
    expect(rows).toEqual([{ month: "2026-01", serviceStart: "2026-01-01", serviceEnd: "2026-01-31", days: 21, amount: 2_100 }]);
  });

  it("ignores cancelled/rejected freeze rows and clips windows to the term", () => {
    const rows = allocateMembershipByMonth(3_100, "2026-01-01", "2026-01-31", {
      freezes: [
        { startDate: "2026-01-05", endDate: "2026-01-09", status: "cancelled" },
        { startDate: "2025-12-01", endDate: "2025-12-31", status: "completed" },
      ],
    });
    expect(rows).toEqual([{ month: "2026-01", serviceStart: "2026-01-01", serviceEnd: "2026-01-31", days: 31, amount: 3_100 }]);
  });

  it("returns nothing for a fully frozen term", () => {
    expect(allocateMembershipByMonth(5_000, "2026-01-01", "2026-01-31", { freezes: [{ startDate: "2026-01-01", endDate: "2026-01-31", status: "active" }] })).toEqual([]);
  });

  it("stops earning at the cancellation date without repricing earlier days", () => {
    // 90 days at exactly 100/day; cancelled 2026-02-15.
    const rows = allocateMembershipByMonth(9_000, "2026-01-01", "2026-03-31", { cancellationDate: "2026-02-15" });
    expect(rows).toEqual([
      { month: "2026-01", serviceStart: "2026-01-01", serviceEnd: "2026-01-31", days: 31, amount: 3_100 },
      { month: "2026-02", serviceStart: "2026-02-01", serviceEnd: "2026-02-15", days: 15, amount: 1_500 },
    ]);
  });

  it("earns nothing when cancelled before the start date and everything when cancelled after the end", () => {
    expect(allocateMembershipByMonth(9_000, "2026-01-01", "2026-03-31", { cancellationDate: "2025-12-31" })).toEqual([]);
    expect(sum(allocateMembershipByMonth(9_000, "2026-01-01", "2026-03-31", { cancellationDate: "2026-04-15" }))).toBe(9_000);
  });

  it("refuses schedules longer than the documented bound", () => {
    expect(allocateMembershipByMonth(1_000, "2026-01-01", `${2026 + Math.ceil((MAX_MEMBERSHIP_SERVICE_MONTHS + 1) / 12)}-01-31`)).toEqual([]);
  });

  it("conserves large safe-integer amounts exactly", () => {
    const amount = 9_007_199_254_740_000;
    const rows = allocateMembershipByMonth(amount, "2026-01-30", "2026-02-01");
    expect(rows).toHaveLength(2);
    expect(sum(rows)).toBe(amount);
    for (const row of rows) expect(Number.isSafeInteger(row.amount)).toBe(true);
  });

  it("handles a one-day term and a single minor unit", () => {
    expect(allocateMembershipByMonth(123, "2026-05-10", "2026-05-10")).toEqual([{ month: "2026-05", serviceStart: "2026-05-10", serviceEnd: "2026-05-10", days: 1, amount: 123 }]);
    expect(allocateMembershipByMonth(1, "2026-05-10", "2026-05-11")).toEqual([{ month: "2026-05", serviceStart: "2026-05-10", serviceEnd: "2026-05-10", days: 1, amount: 1 }]);
  });
});

describe("straight-line depreciation (straight-line-monthly-remainder.v1)", () => {
  it("front-loads the remainder and conserves the cost exactly", () => {
    expect([0, 1, 2].map((index) => monthlyDepreciationAmount(1_000, 3, index))).toEqual([334, 333, 333]);
    const total = Array.from({ length: 7 }, (_, index) => monthlyDepreciationAmount(1_000, 7, index) ?? 0).reduce((a, b) => a + b, 0);
    expect(total).toBe(1_000);
  });

  it("keeps a one-minor-unit asset honest", () => {
    expect(monthlyDepreciationAmount(1, 12, 0)).toBe(1);
    for (let index = 1; index < 12; index += 1) expect(monthlyDepreciationAmount(1, 12, index)).toBe(0);
  });

  it("rejects out-of-schedule and invalid parameters", () => {
    expect(monthlyDepreciationAmount(1_000, 3, 3)).toBeUndefined();
    expect(monthlyDepreciationAmount(1_000, 3, -1)).toBeUndefined();
    expect(monthlyDepreciationAmount(0, 3, 0)).toBeUndefined();
    expect(monthlyDepreciationAmount(-5, 3, 0)).toBeUndefined();
    expect(monthlyDepreciationAmount(10.5, 3, 0)).toBeUndefined();
    expect(monthlyDepreciationAmount(1_000, 0, 0)).toBeUndefined();
  });
});
