import { describe, expect, it } from "vitest";
import { MockGymOSApi } from "./MockGymOSApi";
import { BRANCH_ABD } from "./seed";
import { todayISODate } from "@/lib/utils/dates";

describe("MockGymOSApi management reporting parity", () => {
  it("projects posted journals with an equation and cash reconciliation", async () => {
    const api = new MockGymOSApi();
    const date = todayISODate("Asia/Amman", new Date());
    await api.postManualJournal({ branchId: BRANCH_ABD, postingDate: date, memo: "Mock revenue", reason: "Controlled fixture", idempotencyKey: "mock-report-revenue", lines: [{ accountId: "acct-1100", debit: { amount: 100_000, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: "acct-4100", debit: { amount: 0, currency: "JOD" }, credit: { amount: 100_000, currency: "JOD" } }] });
    await api.postManualJournal({ branchId: BRANCH_ABD, postingDate: date, memo: "Mock repair", reason: "Controlled fixture", idempotencyKey: "mock-report-repair", lines: [{ accountId: "acct-5200", debit: { amount: 20_000, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: "acct-2100", debit: { amount: 0, currency: "JOD" }, credit: { amount: 20_000, currency: "JOD" } }] });
    const input = { fromDate: date, toDate: date, branchId: BRANCH_ABD };
    const income = await api.getIncomeStatement(input);
    expect(income.netIncome.amount).toBe(80_000);
    const balance = await api.getBalanceSheet(input);
    expect(balance.balanced).toBe(true);
    expect(balance.difference.amount).toBe(0);
    const cashflow = await api.getCashflowStatement(input);
    expect(cashflow.openingCash.amount + cashflow.netChange.amount).toBe(cashflow.closingCash.amount);
    expect(cashflow.reconciliationDifference.amount).toBe(0);
    expect(cashflow).toMatchObject({ reconciliationStatus: "unproven", reconciliation: { status: "unproven", expectedClosingCash: { amount: cashflow.closingCash.amount }, asOfCash: { amount: cashflow.closingCash.amount }, difference: { amount: 0 } }, balanced: false });
  });

  it("marks mutable GM snapshots unavailable for historical ranges", async () => {
    const api = new MockGymOSApi();
    const analysis = await api.getGeneralManagerAnalysis({ fromDate: "2020-01-01", toDate: "2020-01-31" });
    expect(analysis.metrics.find((metric) => metric.key === "low_stock")).toMatchObject({ status: "not_available", sourceCount: 0 });
    expect(analysis.metrics.find((metric) => metric.key === "supplier_commitments")).toMatchObject({ status: "not_available", sourceCount: 0 });
  });
});
