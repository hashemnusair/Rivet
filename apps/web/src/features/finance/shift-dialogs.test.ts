import { describe, expect, it } from "vitest";
import type { CashShift, ShiftTotals } from "@/lib/domain/types";
import { money } from "@/lib/utils/money";
import { authoritativeExpectedCash, openShiftSchema } from "./shift-dialogs";

const shift: CashShift = {
  id: "shift-current",
  organizationId: "org-1",
  branchId: "branch-1",
  openedById: "user-1",
  openedByName: "Operator",
  openingFloat: money(50_000),
  openedAt: "2026-08-29T06:00:00.000Z",
  status: "open",
};

const totals: ShiftTotals = {
  cashPayments: money(30_000),
  cardPayments: money(20_000),
  transferPayments: money(10_000),
  cashRefunds: money(5_000),
  otherPayments: money(0),
  paymentCount: 3,
  refundCount: 2,
  discountsTotal: money(0),
};

describe("openShiftSchema", () => {
  it("requires the operator to enter the counted float", () => {
    expect(openShiftSchema.safeParse({ float: "" }).success).toBe(false);
    expect(openShiftSchema.safeParse({ float: "   " }).success).toBe(false);
  });

  it("accepts zero and valid JOD amounts", () => {
    expect(openShiftSchema.safeParse({ float: "0" }).success).toBe(true);
    expect(openShiftSchema.safeParse({ float: "50.000" }).success).toBe(true);
  });

  it("rejects invalid and negative amounts", () => {
    expect(openShiftSchema.safeParse({ float: "not money" }).success).toBe(false);
    expect(openShiftSchema.safeParse({ float: "-1.000" }).success).toBe(false);
  });
});

describe("authoritativeExpectedCash", () => {
  it("uses only matching open-shift server totals", () => {
    expect(authoritativeExpectedCash(shift, { shift, totals })).toBe(75_000);
    expect(authoritativeExpectedCash(shift, undefined)).toBeUndefined();
    expect(authoritativeExpectedCash(shift, null)).toBeUndefined();
    expect(authoritativeExpectedCash(shift, { shift: { ...shift, id: "stale-shift" }, totals })).toBeUndefined();
    expect(authoritativeExpectedCash(shift, { shift: { ...shift, status: "closed" }, totals })).toBeUndefined();
  });
});
