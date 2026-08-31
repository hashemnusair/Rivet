import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}, request: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-forensic-${name}`, ...request });

/**
 * Forensic lifecycle fixtures with hand-calculated expected journals and
 * statements. Every number asserted here was derived independently from the
 * documented accounting contract (docs/18) — none was copied from the
 * implementation's own output.
 */

async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "forensic-org", name: "Forensic Gym", slug: "forensic-gym", status: "active", subscriptionPlan: "Pro", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branch = await ctx.db.insert("branches", { organizationId: organization, publicId: "forensic-branch", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "forensic-owner", authSubject: "clerk-forensic-owner", email: "owner@forensic.example", fullName: "Forensic Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
  });
  return { t, owner: t.withIdentity({ subject: "clerk-forensic-owner" }) };
}

type Line = { accountCode: string; debit: { amount: number }; credit: { amount: number } };
type Section = { lines: Array<{ accountCode: string; amount: { amount: number }; entryIds: string[] }>; total: { amount: number } };

function lineAmount(section: Section, code: string): number | undefined {
  return section.lines.find((line) => line.accountCode === code)?.amount.amount;
}

describe("forensic statement lifecycles", () => {
  it("carries a membership from sale through recognition, refund, cancellation drift, and reversal", async () => {
    const { t, owner } = await seeded();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "forensic-org")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "forensic-branch")).unique();
      const createdAt = Date.parse("2026-01-01T00:00:00.000Z");
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "membership", publicId: "forensic-m1", branchId: branch!._id, createdAt, updatedAt: createdAt, data: { id: "forensic-m1", homeBranchId: "forensic-branch", startDate: "2026-01-15", endDate: "2026-03-14", salePrice: { amount: 100_000, currency: "JOD" }, discount: { amount: 10_000, currency: "JOD" }, discountApprovalStatus: "approved", frozenDaysUsed: 0 } });
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "payment", publicId: "forensic-p1", branchId: branch!._id, createdAt, updatedAt: createdAt, data: { id: "forensic-p1", branchId: "forensic-branch", type: "payment", status: "completed", amount: { amount: 50_000, currency: "JOD" }, method: "cash", occurredAt: "2026-01-20T10:00:00.000Z" } });
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "payment", publicId: "forensic-r1", branchId: branch!._id, createdAt, updatedAt: createdAt, data: { id: "forensic-r1", branchId: "forensic-branch", type: "refund", status: "completed", amount: { amount: -10_000, currency: "JOD" }, method: "cash", occurredAt: "2026-02-10T10:00:00.000Z" } });
    });

    // Post the deferred sale, the collection, both earned months, and the refund.
    const sale = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "membership_sale", sourceId: "forensic-m1", idempotencyKey: "f-sale", reason: "Post deferred sale" })) as { status: string; amount: { amount: number } };
    expect(sale).toMatchObject({ status: "posted", amount: { amount: 90_000 } });
    const payment = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "forensic-p1", idempotencyKey: "f-pay", reason: "Post collection" })) as { status: string };
    expect(payment.status).toBe("posted");
    // Hand-derived allocation: 59 service days, 90000 = 1525/day remainder 25.
    const january = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "membership_revenue_recognition", sourceId: "membership-revenue:forensic-m1:2026-01", idempotencyKey: "f-rec-jan", reason: "Recognize January" })) as { status: string; amount: { amount: number }; journalEntryId: string };
    expect(january).toMatchObject({ status: "posted", amount: { amount: 25_942 } });
    const february = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "membership_revenue_recognition", sourceId: "membership-revenue:forensic-m1:2026-02", idempotencyKey: "f-rec-feb", reason: "Recognize February" })) as { status: string; amount: { amount: number }; journalEntryId: string };
    expect(february).toMatchObject({ status: "posted", amount: { amount: 42_708 } });
    const refund = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "refund", sourceId: "forensic-r1", idempotencyKey: "f-refund", reason: "Post refund" })) as { status: string; amount: { amount: number } };
    expect(refund).toMatchObject({ status: "posted", amount: { amount: 10_000 } });

    // Income statement for the earned window.
    const income = await owner.query(api.domain.query, operation("reports.income_statement", { fromDate: "2026-01-01", toDate: "2026-02-28" })) as { totalRevenue: { amount: number }; totalCosts: { amount: number }; netIncome: { amount: number }; revenue: Section };
    expect(income).toMatchObject({ totalRevenue: { amount: 68_650 }, totalCosts: { amount: 0 }, netIncome: { amount: 68_650 } });
    expect(lineAmount(income.revenue, "4100")).toBe(68_650);

    // Balance sheet as of the end of February: every figure hand-derived.
    const balance = await owner.query(api.domain.query, operation("reports.balance_sheet", { fromDate: "2026-02-01", toDate: "2026-02-28" })) as { assets: { current: Section }; liabilities: { current: Section }; cumulativeEarnings: { amount: number }; currentEarnings: { amount: number }; totalAssets: { amount: number }; balanced: boolean; difference: { amount: number } };
    expect(lineAmount(balance.assets.current, "1100")).toBe(40_000);
    expect(lineAmount(balance.assets.current, "1200")).toBe(50_000);
    expect(lineAmount(balance.liabilities.current, "2200")).toBe(21_350);
    expect(balance.cumulativeEarnings.amount).toBe(68_650);
    expect(balance.currentEarnings.amount).toBe(68_650);
    expect(balance).toMatchObject({ totalAssets: { amount: 90_000 }, balanced: true, difference: { amount: 0 } });

    // February cash flow: refund is the only cash movement, classified operating.
    const cashflow = await owner.query(api.domain.query, operation("reports.cashflow_statement", { fromDate: "2026-02-01", toDate: "2026-02-28" })) as { openingCash: { amount: number }; netChange: { amount: number }; closingCash: { amount: number }; operating: { netChange: { amount: number } }; reconciliation: { difference: { amount: number } } };
    expect(cashflow).toMatchObject({ openingCash: { amount: 50_000 }, netChange: { amount: -10_000 }, closingCash: { amount: 40_000 }, operating: { netChange: { amount: -10_000 } }, reconciliation: { difference: { amount: 0 } } });

    // Cancellation after posting February: the posted month no longer matches
    // the earned schedule (Feb 1–15 = 8×1526 + 7×1525 = 22,883), and the
    // statements must say so instead of silently looking current.
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "forensic-org")).unique();
      const membership = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization!._id).eq("entityType", "membership").eq("publicId", "forensic-m1")).unique();
      await ctx.db.patch(membership!._id, { data: { ...(membership!.data as Record<string, unknown>), cancelledAt: "2026-02-15T12:00:00.000Z" }, updatedAt: Date.now() });
    });
    const drifted = await owner.query(api.domain.query, operation("reports.income_statement", { fromDate: "2026-01-01", toDate: "2026-03-31" })) as { warnings: string[] };
    expect(drifted.warnings.some((warning) => warning.includes("1 posted accounting source posting no longer matches"))).toBe(true);

    // Owner reversal of the February recognition restores deferred revenue exactly.
    const reversal = await owner.mutation(api.domain.mutate, operation("accounting.entry.reverse", { entryId: february.journalEntryId, reason: "Cancelled mid-February; correct the over-recognized month", idempotencyKey: "f-reverse-feb" })) as { lines: Line[] };
    expect(reversal.lines.map((line) => ({ code: line.accountCode, debit: line.debit.amount, credit: line.credit.amount }))).toEqual([
      { code: "2200", debit: 0, credit: 42_708 },
      { code: "4100", debit: 42_708, credit: 0 },
    ]);
    const afterReversal = await owner.query(api.domain.query, operation("reports.balance_sheet", { fromDate: "2026-01-01", toDate: "2099-12-31" })) as { liabilities: { current: Section }; cumulativeEarnings: { amount: number }; balanced: boolean; warnings: string[] };
    expect(lineAmount(afterReversal.liabilities.current, "2200")).toBe(64_058);
    expect(afterReversal.cumulativeEarnings.amount).toBe(25_942);
    expect(afterReversal.balanced).toBe(true);
    // The reversed row is a completed correction, not drift.
    expect(afterReversal.warnings.some((warning) => warning.includes("no longer match the current operational record"))).toBe(false);
  });

  it("refuses to fabricate a cash outflow for a void whose payment was never posted, then reverses a posted one exactly", async () => {
    const { t, owner } = await seeded();
    const insertPayment = async (publicId: string, amount: number, status: string, occurredAt: string) => {
      await t.run(async (ctx) => {
        const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "forensic-org")).unique();
        const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "forensic-branch")).unique();
        const now = Date.now();
        await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "payment", publicId, branchId: branch!._id, createdAt: now, updatedAt: now, data: { id: publicId, branchId: "forensic-branch", type: "payment", status, amount: { amount, currency: "JOD" }, method: "cash", occurredAt } });
      });
    };
    const voidPaymentRecord = async (publicId: string) => {
      await t.run(async (ctx) => {
        const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "forensic-org")).unique();
        const payment = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization!._id).eq("entityType", "payment").eq("publicId", publicId)).unique();
        await ctx.db.patch(payment!._id, { data: { ...(payment!.data as Record<string, unknown>), status: "voided" }, updatedAt: Date.now() });
      });
    };

    // Case 1: voided before any posting — there is no ledger effect to reverse.
    await insertPayment("forensic-v1", 30_000, "completed", "2026-04-05T10:00:00.000Z");
    await voidPaymentRecord("forensic-v1");
    const unbacked = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "void", sourceId: "forensic-v1", idempotencyKey: "f-void-unbacked", reason: "Attempt unbacked void" })) as { status: string; reason?: string; journalEntryId?: string };
    expect(unbacked).toMatchObject({ status: "excluded", reason: "The voided payment was never posted to the ledger, so the void has no ledger effect to reverse." });
    expect(unbacked.journalEntryId).toBeUndefined();

    // Case 2: payment posted first, then voided — the void backs it out exactly.
    await insertPayment("forensic-v2", 20_000, "completed", "2026-04-06T10:00:00.000Z");
    const posted = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "forensic-v2", idempotencyKey: "f-v2-pay", reason: "Post collection" })) as { status: string };
    expect(posted.status).toBe("posted");
    await voidPaymentRecord("forensic-v2");
    const voided = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "void", sourceId: "forensic-v2", idempotencyKey: "f-v2-void", reason: "Back out the voided collection" })) as { status: string; journalEntryId: string };
    expect(voided.status).toBe("posted");
    const detail = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: voided.journalEntryId })) as { lines: Line[] };
    expect(detail.lines.map((line) => ({ code: line.accountCode, debit: line.debit.amount, credit: line.credit.amount }))).toEqual([
      { code: "1200", debit: 20_000, credit: 0 },
      { code: "1100", debit: 0, credit: 20_000 },
    ]);
    // Conservation: payment and void net to zero on every account.
    const trialBalance = await owner.query(api.domain.query, operation("accounting.trial_balance")) as { rows: unknown[]; totalDebit: { amount: number }; totalCredit: { amount: number } };
    expect(trialBalance).toMatchObject({ rows: [], totalDebit: { amount: 0 }, totalCredit: { amount: 0 } });
  });

  it("runs the retail lifecycle: receipt, sale, COGS, refund, and stock restoration across all three statements", async () => {
    const { t, owner } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "FORENSIC-WATER", name: "Forensic Water", unit: "each", reorderPoint: 1 })) as { id: string };
    const supplier = await owner.mutation(api.domain.mutate, operation("operations.supplier.upsert", { name: "Forensic Supplier", branchIds: ["forensic-branch"], preferredProductIds: [product.id] })) as { id: string };
    const order = await owner.mutation(api.domain.mutate, operation("operations.purchase_order.create", { branchId: "forensic-branch", supplierId: supplier.id, lines: [{ productId: product.id, quantity: 10, unitCost: { amount: 500, currency: "JOD" } }] })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("operations.purchase_order.approve", { id: order.id }));
    await owner.mutation(api.domain.mutate, operation("operations.purchase_order.receive", { purchaseOrderId: order.id, idempotencyKey: "f-po-receive" }));
    const receipt = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "purchase_order_receipt", sourceId: order.id, idempotencyKey: "f-po-post", reason: "Post received inventory" })) as { status: string; amount: { amount: number } };
    expect(receipt).toMatchObject({ status: "posted", amount: { amount: 5_000 } });

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "forensic-org")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "forensic-branch")).unique();
      const ownerUser = await ctx.db.query("users").withIndex("by_auth_subject", (q) => q.eq("authSubject", "clerk-forensic-owner")).unique();
      const productRow = (await ctx.db.query("products").withIndex("by_organization", (q) => q.eq("organizationId", organization!._id)).collect())[0]!;
      const now = Date.now();
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "payment", publicId: "forensic-rt-sale", branchId: branch!._id, createdAt: now, updatedAt: now, data: { id: "forensic-rt-sale", branchId: "forensic-branch", type: "retail_sale", status: "completed", amount: { amount: 3_000, currency: "JOD" }, method: "cash", occurredAt: "2026-05-02T10:00:00.000Z" } });
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "payment", publicId: "forensic-rt-refund", branchId: branch!._id, createdAt: now, updatedAt: now, data: { id: "forensic-rt-refund", branchId: "forensic-branch", type: "refund", status: "completed", retailSaleId: "forensic-rt-sale", amount: { amount: -1_500, currency: "JOD" }, method: "cash", occurredAt: "2026-05-03T10:00:00.000Z" } });
      await ctx.db.insert("stockMovements", { organizationId: organization!._id, publicId: "forensic-move-sale", branchId: branch!._id, productId: productRow._id, type: "sale", quantityDelta: -4, quantity: 4, unitCostMinor: 500, unitCostCurrency: "JOD", idempotencyKey: "f-move-sale", financialPostingStatus: "not_posted", occurredAt: Date.parse("2026-05-02T10:00:00.000Z"), createdAt: now, createdByUserId: ownerUser!._id });
      await ctx.db.insert("stockMovements", { organizationId: organization!._id, publicId: "forensic-move-return", branchId: branch!._id, productId: productRow._id, type: "return", referenceType: "retail_refund", quantityDelta: 2, quantity: 2, unitCostMinor: 500, unitCostCurrency: "JOD", idempotencyKey: "f-move-return", financialPostingStatus: "not_posted", occurredAt: Date.parse("2026-05-03T10:00:00.000Z"), createdAt: now, createdByUserId: ownerUser!._id });
    });

    const saleSource = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "forensic-rt-sale", idempotencyKey: "f-rt-sale", reason: "Post retail sale" })) as { status: string; policyCode?: string };
    expect(saleSource).toMatchObject({ status: "posted", policyCode: "retail-sale-cash.v2" });
    const cogs = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "stock_movement", sourceId: "forensic-move-sale", idempotencyKey: "f-rt-cogs", reason: "Post retail COGS" })) as { status: string; amount: { amount: number } };
    expect(cogs).toMatchObject({ status: "posted", amount: { amount: 2_000 } });
    const refundSource = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "refund", sourceId: "forensic-rt-refund", idempotencyKey: "f-rt-refund", reason: "Post retail refund" })) as { status: string; policyCode?: string; amount: { amount: number } };
    expect(refundSource).toMatchObject({ status: "posted", policyCode: "retail-refund-cash.v2", amount: { amount: 1_500 } });
    const restock = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "stock_movement", sourceId: "forensic-move-return", idempotencyKey: "f-rt-restock", reason: "Restore returned stock" })) as { status: string; amount: { amount: number } };
    expect(restock).toMatchObject({ status: "posted", amount: { amount: 1_000 } });

    // Income for May: net retail revenue 1,500; net COGS 1,000.
    const income = await owner.query(api.domain.query, operation("reports.income_statement", { fromDate: "2026-05-01", toDate: "2026-05-31" })) as { totalRevenue: { amount: number }; totalCosts: { amount: number }; netIncome: { amount: number }; revenue: Section; costOfSales: Section };
    expect(income).toMatchObject({ totalRevenue: { amount: 1_500 }, totalCosts: { amount: 1_000 }, netIncome: { amount: 500 } });
    expect(lineAmount(income.revenue, "4200")).toBe(1_500);
    expect(lineAmount(income.costOfSales, "5100")).toBe(1_000);

    // Balance sheet through today: cash 1,500 + inventory 4,000 = payables 5,000 + earnings 500.
    const balance = await owner.query(api.domain.query, operation("reports.balance_sheet", { fromDate: "2026-01-01", toDate: "2099-12-31" })) as { assets: { current: Section }; liabilities: { current: Section }; cumulativeEarnings: { amount: number }; balanced: boolean };
    expect(lineAmount(balance.assets.current, "1100")).toBe(1_500);
    expect(lineAmount(balance.assets.current, "1300")).toBe(4_000);
    expect(lineAmount(balance.liabilities.current, "2100")).toBe(5_000);
    expect(balance.cumulativeEarnings.amount).toBe(500);
    expect(balance.balanced).toBe(true);

    // Cash flow for May: only the retail collection and its refund moved cash.
    const cashflow = await owner.query(api.domain.query, operation("reports.cashflow_statement", { fromDate: "2026-05-01", toDate: "2026-05-31" })) as { operating: { netChange: { amount: number } }; investing: { netChange: { amount: number } }; financing: { netChange: { amount: number } }; closingCash: { amount: number }; reconciliation: { difference: { amount: number } } };
    expect(cashflow).toMatchObject({ operating: { netChange: { amount: 1_500 } }, investing: { netChange: { amount: 0 } }, financing: { netChange: { amount: 0 } }, closingCash: { amount: 1_500 }, reconciliation: { difference: { amount: 0 } } });
  });

  it("queues a valid recognition month as pending with no contradictory reason text", async () => {
    const { t, owner } = await seeded();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "forensic-org")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "forensic-branch")).unique();
      const createdAt = Date.parse("2026-02-01T00:00:00.000Z");
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "membership", publicId: "forensic-reason-m1", branchId: branch!._id, createdAt, updatedAt: createdAt, data: { id: "forensic-reason-m1", homeBranchId: "forensic-branch", startDate: "2026-02-01", endDate: "2026-02-28", salePrice: { amount: 28_000, currency: "JOD" }, frozenDaysUsed: 0 } });
    });
    await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "membership_sale", sourceId: "forensic-reason-m1", idempotencyKey: "f-reason-sale", reason: "Post deferred sale" }));
    const refreshed = await owner.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["membership_revenue_recognition"], fromDate: "2026-02-01", toDate: "2026-02-28" })) as { items: Array<{ sourceId: string; status: string; reason?: string }> };
    const pendingRow = refreshed.items.find((item) => item.sourceId === "membership-revenue:forensic-reason-m1:2026-02");
    // A valid pending fact must not display the unconfigured fallback text.
    expect(pendingRow).toMatchObject({ status: "pending" });
    expect(pendingRow?.reason).toBeUndefined();
  });

  it("classifies cash movements honestly: financing, investing, excluded internal transfers, and flagged mixed entries", async () => {
    const { owner } = await seeded();
    const journal = (memo: string, key: string, postingDate: string, lines: Array<{ accountId: string; debit: number; credit: number }>) => operation("accounting.manual_journal.post", { scope: "branch", branchId: "forensic-branch", postingDate, memo, reason: "Controlled cash flow fixture", idempotencyKey: key, lines: lines.map((line) => ({ accountId: line.accountId, debit: { amount: line.debit, currency: "JOD" }, credit: { amount: line.credit, currency: "JOD" } })) });
    await owner.mutation(api.domain.mutate, journal("Owner contribution", "cf-equity", "2026-06-01", [{ accountId: "acct-1100", debit: 100_000, credit: 0 }, { accountId: "acct-3000", debit: 0, credit: 100_000 }]));
    await owner.mutation(api.domain.mutate, journal("Equipment cash purchase", "cf-equipment", "2026-06-05", [{ accountId: "acct-1500", debit: 40_000, credit: 0 }, { accountId: "acct-1100", debit: 0, credit: 40_000 }]));
    const transfer = await owner.mutation(api.domain.mutate, journal("Bank deposit of drawer cash", "cf-transfer", "2026-06-10", [{ accountId: "acct-1120", debit: 25_000, credit: 0 }, { accountId: "acct-1100", debit: 0, credit: 25_000 }])) as { id: string };
    await owner.mutation(api.domain.mutate, journal("Mixed contribution and sale", "cf-mixed", "2026-06-15", [{ accountId: "acct-1100", debit: 10_000, credit: 0 }, { accountId: "acct-3000", debit: 0, credit: 4_000 }, { accountId: "acct-4100", debit: 0, credit: 6_000 }]));

    const cashflow = await owner.query(api.domain.query, operation("reports.cashflow_statement", { fromDate: "2026-06-01", toDate: "2026-06-30" })) as {
      operating: { netChange: { amount: number }; lines: Array<{ entryIds: string[] }> };
      investing: { netChange: { amount: number }; lines: Array<{ entryIds: string[] }> };
      financing: { netChange: { amount: number }; lines: Array<{ entryIds: string[] }> };
      netChange: { amount: number };
      openingCash: { amount: number };
      closingCash: { amount: number };
      reconciliation: { difference: { amount: number } };
      warnings: string[];
      classificationPolicy: { code: string; version: number };
    };
    expect(cashflow.financing.netChange.amount).toBe(110_000);
    expect(cashflow.investing.netChange.amount).toBe(-40_000);
    expect(cashflow.operating.netChange.amount).toBe(0);
    expect(cashflow.netChange.amount).toBe(70_000);
    expect(cashflow.openingCash.amount).toBe(0);
    expect(cashflow.closingCash.amount).toBe(70_000);
    expect(cashflow.reconciliation.difference.amount).toBe(0);
    // The internal transfer must not appear in any classified section.
    const allEntryIds = [...cashflow.operating.lines, ...cashflow.investing.lines, ...cashflow.financing.lines].flatMap((line) => line.entryIds);
    expect(allEntryIds).not.toContain(transfer.id);
    // The mixed entry is classified by priority and called out.
    expect(cashflow.warnings.some((warning) => warning.includes("more than one activity"))).toBe(true);
    expect(cashflow.classificationPolicy).toMatchObject({ code: "cashflow-classification.v2", version: 2 });
  });
});
