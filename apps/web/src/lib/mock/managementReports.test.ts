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

  it("keeps a completed historical freeze excluded from recognition after the active flag clears", async () => {
    const api = new MockGymOSApi();
    const today = todayISODate("Asia/Amman");
    const month = today.slice(0, 7);
    await api.refreshAccountingSourceQueue({});
    const rows = await api.listAccountingSourcePostings({ sourceType: "membership_revenue_recognition", pageSize: 100 });
    const memberships = await api.listMemberships({ status: "active", pageSize: 100 });
    const candidate = memberships.items.find((membership) =>
      membership.planFreezeAllowanceDays - membership.frozenDaysUsed >= 1 &&
      !membership.activeFreeze &&
      membership.startDate <= today && membership.endDate > today &&
      rows.items.some((row) => row.sourceId === `membership-revenue:${membership.id}:${month}`));
    if (!candidate) throw new Error("Seed must provide an active membership with freeze allowance and a current-month recognition row.");
    const before = rows.items.find((row) => row.sourceId === `membership-revenue:${candidate.id}:${month}`);
    const beforeDays = (before?.details as { serviceDays?: number } | undefined)?.serviceDays;
    expect(typeof beforeDays).toBe("number");

    // One-day freeze today, ended immediately: it completes and the active
    // flag clears, but today stays a frozen (non-service) day forever.
    await api.freezeMembership(candidate.id, { startDate: today, endDate: today, reason: "Forensic freeze fixture" });
    await api.unfreezeMembership(candidate.id, { reason: "Forensic unfreeze fixture" });
    await api.refreshAccountingSourceQueue({});
    const after = await api.listAccountingSourcePostings({ sourceType: "membership_revenue_recognition", pageSize: 100 });
    const afterRow = after.items.find((row) => row.sourceId === `membership-revenue:${candidate.id}:${month}`);
    const afterDays = (afterRow?.details as { serviceDays?: number } | undefined)?.serviceDays;
    expect(afterDays).toBe((beforeDays ?? 0) - 1);
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
