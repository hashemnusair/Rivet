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

  it("drives membership revenue from queue refresh through recognition into a proven statement", async () => {
    const api = new MockGymOSApi();
    const fromDate = "2024-01-01";
    const toDate = todayISODate("Asia/Amman");

    // Organization-wide refresh — the only run kind able to prove
    // consolidated statement coverage.
    const firstRefresh = await api.refreshAccountingSourceQueue({});
    expect(firstRefresh.scanned).toBeGreaterThan(0);
    expect(firstRefresh.pending).toBeGreaterThan(0);

    const pending = await api.listAccountingSourcePostings({ status: "pending", pageSize: 100 });
    const allMembershipRows = pending.items.filter((row) => row.sourceType === "membership_sale" || row.sourceType === "membership_renewal");
    const loopBranchId = allMembershipRows[0]?.branchId;
    const membershipRows = allMembershipRows.filter((row) => row.branchId === loopBranchId);
    if (membershipRows.length === 0) throw new Error("seed must provide a pending membership fact");
    for (const row of membershipRows) {
      const original = await api.postAccountingSource({ sourceType: row.sourceType, sourceId: row.sourceId, idempotencyKey: `loop-original-${row.sourceId}`, reason: "Post the deferred membership fact." });
      expect(original.status).toBe("posted");
    }

    // Recognition schedules become postable only after the deferred original
    // is on the ledger and the queue has been re-projected.
    await api.refreshAccountingSourceQueue({});
    const recognitions = await api.listAccountingSourcePostings({ status: "pending", sourceType: "membership_revenue_recognition", pageSize: 100 });
    const recognitionRow = recognitions.items.find((row) => row.amount && row.branchId === loopBranchId);
    if (!recognitionRow?.amount) throw new Error("posted memberships must expose a pending recognition month");
    const recognition = await api.postAccountingSource({ sourceType: "membership_revenue_recognition", sourceId: recognitionRow.sourceId, idempotencyKey: "loop-recognition", reason: "Recognize the earned service month." });
    expect(recognition.status).toBe("posted");

    // A final full refresh re-fingerprints every candidate so both branch and
    // consolidated statements can claim proven coverage. The recognition
    // journal is dated at the tenant-local service-month end, which can sit a
    // few days ahead of today inside the current month — report through it.
    const reportToDate = recognitionRow.occurredAt.slice(0, 10) > toDate ? recognitionRow.occurredAt.slice(0, 10) : toDate;
    await api.refreshAccountingSourceQueue({});
    const branchIncome = await api.getIncomeStatement({ fromDate, toDate: reportToDate, branchId: recognitionRow.branchId });
    const revenueLine = branchIncome.revenue.lines.find((line) => line.accountCode === "4100");
    expect(revenueLine?.amount.amount).toBe(recognitionRow.amount.amount);
    expect(branchIncome.queueCoverage).toBe("proven");
    const consolidatedIncome = await api.getIncomeStatement({ fromDate, toDate: reportToDate });
    expect(consolidatedIncome.queueCoverage).toBe("proven");
  }, 30_000);

  it("marks mutable GM snapshots unavailable for historical ranges", async () => {
    const api = new MockGymOSApi();
    const analysis = await api.getGeneralManagerAnalysis({ fromDate: "2020-01-01", toDate: "2020-01-31" });
    expect(analysis.metrics.find((metric) => metric.key === "low_stock")).toMatchObject({ status: "not_available", sourceCount: 0 });
    expect(analysis.metrics.find((metric) => metric.key === "supplier_commitments")).toMatchObject({ status: "not_available", sourceCount: 0 });
  });
});
