import { describe, expect, it } from "vitest";
import { MockGymOSApi, mockMembershipAllocations, mockMembershipFreezeWindows } from "./MockGymOSApi";
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

  it("drives membership sales from queue refresh to immediate whole-price revenue in a proven statement", async () => {
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
    let postedTotal = 0;
    for (const row of membershipRows) {
      const original = await api.postAccountingSource({ sourceType: row.sourceType, sourceId: row.sourceId, idempotencyKey: `loop-original-${row.sourceId}`, reason: "Post the membership sale." });
      // Owner policy: the whole price is revenue at sale — no deferral.
      expect(original).toMatchObject({ status: "posted" });
      expect(original.policyCode).toMatch(/^membership-(sale|renewal)\.v2$/);
      postedTotal += original.amount?.amount ?? 0;
    }

    // Immediate-revenue sales never grow a recognition schedule.
    await api.refreshAccountingSourceQueue({});
    const recognitions = await api.listAccountingSourcePostings({ sourceType: "membership_revenue_recognition", pageSize: 100 });
    expect(recognitions.items).toHaveLength(0);

    const branchIncome = await api.getIncomeStatement({ fromDate, toDate, branchId: loopBranchId });
    const revenueLine = branchIncome.revenue.lines.find((line) => line.accountCode === "4100");
    expect(revenueLine?.amount.amount).toBe(postedTotal);
    expect(branchIncome.queueCoverage).toBe("proven");
    const consolidatedIncome = await api.getIncomeStatement({ fromDate, toDate });
    expect(consolidatedIncome.queueCoverage).toBe("proven");
  }, 30_000);

  it("marks mutable GM snapshots unavailable for historical ranges", async () => {
    const api = new MockGymOSApi();
    const analysis = await api.getGeneralManagerAnalysis({ fromDate: "2020-01-01", toDate: "2020-01-31" });
    expect(analysis.metrics.find((metric) => metric.key === "low_stock")).toMatchObject({ status: "not_available", sourceCount: 0 });
    expect(analysis.metrics.find((metric) => metric.key === "supplier_commitments")).toMatchObject({ status: "not_available", sourceCount: 0 });
  });

  it("classifies cash movements per cashflow-classification.v2 and reports cumulative earnings", async () => {
    const api = new MockGymOSApi();
    const journal = (memo: string, key: string, postingDate: string, lines: Array<{ accountId: string; debit: number; credit: number }>) =>
      api.postManualJournal({ branchId: BRANCH_ABD, postingDate, memo, reason: "Controlled cash flow fixture", idempotencyKey: key, lines: lines.map((line) => ({ accountId: line.accountId, debit: { amount: line.debit, currency: "JOD" }, credit: { amount: line.credit, currency: "JOD" } })) });
    await journal("Owner contribution", "cf-equity", "2026-06-01", [{ accountId: "acct-1100", debit: 100_000, credit: 0 }, { accountId: "acct-3000", debit: 0, credit: 100_000 }]);
    await journal("Equipment cash purchase", "cf-equipment", "2026-06-05", [{ accountId: "acct-1500", debit: 40_000, credit: 0 }, { accountId: "acct-1100", debit: 0, credit: 40_000 }]);
    const transfer = await journal("Bank deposit of drawer cash", "cf-transfer", "2026-06-10", [{ accountId: "acct-1120", debit: 25_000, credit: 0 }, { accountId: "acct-1100", debit: 0, credit: 25_000 }]);
    await journal("Mixed contribution and sale", "cf-mixed", "2026-06-15", [{ accountId: "acct-1100", debit: 10_000, credit: 0 }, { accountId: "acct-3000", debit: 0, credit: 4_000 }, { accountId: "acct-4100", debit: 0, credit: 6_000 }]);
    // Account 5900 exists (Convex chart parity) and accepts a posting.
    const accounts = await api.listAccountingAccounts();
    expect(accounts.some((account) => account.code === "5900")).toBe(true);
    await journal("Miscellaneous accrual", "cf-5900", "2026-06-20", [{ accountId: "acct-5900", debit: 1_000, credit: 0 }, { accountId: "acct-2100", debit: 0, credit: 1_000 }]);

    const cashflow = await api.getCashflowStatement({ fromDate: "2026-06-01", toDate: "2026-06-30", branchId: BRANCH_ABD });
    expect(cashflow.financing.netChange.amount).toBe(110_000);
    expect(cashflow.investing.netChange.amount).toBe(-40_000);
    expect(cashflow.operating.netChange.amount).toBe(0);
    expect(cashflow.netChange.amount).toBe(70_000);
    expect(cashflow.closingCash.amount).toBe(70_000);
    expect(cashflow.reconciliation.difference.amount).toBe(0);
    const allEntryIds = [...cashflow.operating.lines, ...cashflow.investing.lines, ...cashflow.financing.lines].flatMap((line) => line.entryIds);
    expect(allEntryIds).not.toContain(transfer.id);
    expect(cashflow.warnings.some((warning) => warning.includes("more than one activity"))).toBe(true);
    expect(cashflow.classificationPolicy).toMatchObject({ code: "cashflow-classification.v2", version: 2 });

    const balance = await api.getBalanceSheet({ fromDate: "2026-06-01", toDate: "2099-12-31", branchId: BRANCH_ABD });
    expect(balance.cumulativeEarnings?.amount).toBe(5_000);
    expect(balance.currentEarnings.amount).toBe(5_000);
    expect(balance.balanced).toBe(true);
  });

  it("keeps completed historical freezes excluded from the daily allocator", () => {
    const completed = { id: "freeze-h1", membershipId: "m1", startDate: "2026-01-10", endDate: "2026-01-19", status: "completed", reason: "History", createdById: "u1", createdAt: "2026-01-01T00:00:00.000Z" } as const;
    // The active flag is gone, but the completed window still removed days.
    const windows = mockMembershipFreezeWindows({ freezes: [completed], activeFreeze: undefined });
    expect(windows).toHaveLength(1);
    const rows = mockMembershipAllocations(2_100, "2026-01-01", "2026-01-31", { freezes: windows });
    expect(rows).toEqual([{ month: "2026-01", serviceStart: "2026-01-01", serviceEnd: "2026-01-31", days: 21, amount: 2_100 }]);
    // An active freeze that also sits in the history merges without doubling.
    expect(mockMembershipFreezeWindows({ freezes: [completed], activeFreeze: { ...completed, status: "active" } })).toHaveLength(1);
  });

  it("keeps an owner review exclusion across refreshes and reopens it on reconsideration", async () => {
    const api = new MockGymOSApi();
    await api.refreshAccountingSourceQueue({});
    const listed = await api.listAccountingSourcePostings({ status: "unconfigured", pageSize: 100 });
    const junk = listed.items[0];
    if (!junk) throw new Error("Seed must provide an unconfigured queue row.");
    const excluded = await api.excludeAccountingSource({ sourceType: junk.sourceType, sourceId: junk.sourceId, reason: "Reviewed: cancelled onboarding test data" });
    expect(excluded.status).toBe("excluded");
    expect(excluded.reviewExcludedAt).toBeTruthy();
    await api.refreshAccountingSourceQueue({});
    const after = await api.listAccountingSourcePostings({ status: "excluded", pageSize: 100 });
    expect(after.items.find((row) => row.sourceId === junk.sourceId)).toMatchObject({ status: "excluded" });
    const reopened = await api.reconsiderAccountingSource({ sourceType: junk.sourceType, sourceId: junk.sourceId, reason: "Re-check before close" });
    expect(reopened.status).toBe("unconfigured");
    expect(reopened.reviewExcludedAt).toBeUndefined();
  });

  it("exposes drilldown ids for every available GM metric, including cash variance", async () => {
    const api = new MockGymOSApi();
    const today = todayISODate("Asia/Amman");
    const weekAgo = new Date(Date.parse(`${today}T00:00:00.000Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
    const analysis = await api.getGeneralManagerAnalysis({ fromDate: weekAgo, toDate: today });
    for (const metric of analysis.metrics) {
      expect(metric.drilldownIds.length).toBe(Math.min(metric.sourceCount, 100));
    }
    const variance = analysis.metrics.find((metric) => metric.key === "cash_variance");
    expect(variance).toBeDefined();
    expect(variance!.sourceCount).toBeGreaterThan(0);
    expect(variance!.drilldownIds.length).toBe(variance!.sourceCount);
  });
});
