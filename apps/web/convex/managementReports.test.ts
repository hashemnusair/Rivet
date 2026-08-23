import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}, request: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-reports-${name}`, ...request });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "reports-org-a", name: "Reports Gym", slug: "reports-gym", status: "active", subscriptionPlan: "Pro", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: organization, publicId: "reports-branch-a", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: organization, publicId: "reports-branch-b", name: "Second", code: "SECOND", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "reports-owner", authSubject: "clerk-reports-owner", email: "owner@reports.example", fullName: "Reports Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const manager = await ctx.db.insert("users", { publicId: "reports-manager", authSubject: "clerk-reports-manager", email: "manager@reports.example", fullName: "Reports Manager", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const receptionist = await ctx.db.insert("users", { publicId: "reports-reception", authSubject: "clerk-reports-reception", email: "reception@reports.example", fullName: "Reports Reception", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branchA, branchB], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: manager, role: "manager", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: receptionist, role: "receptionist", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
  });
  return { t, owner: t.withIdentity({ subject: "clerk-reports-owner" }), manager: t.withIdentity({ subject: "clerk-reports-manager" }), receptionist: t.withIdentity({ subject: "clerk-reports-reception" }) };
}

const journal = (branchId: string, memo: string, key: string, lines: Array<{ accountId: string; debit: number; credit: number }>) => ({ scope: "branch", branchId, postingDate: "2026-08-10", memo, reason: "Controlled report fixture", idempotencyKey: key, lines: lines.map((line) => ({ accountId: line.accountId, debit: { amount: line.debit, currency: "JOD" }, credit: { amount: line.credit, currency: "JOD" } })) });

describe("management reporting projections", () => {
  it("uses the organization plan when a materialized entitlement row is stale", async () => {
    const { owner, t } = await seeded();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "reports-org-a")).unique();
      await ctx.db.insert("organizationEntitlements", { organizationId: organization!._id, catalogVersion: 1, subscriptionPlan: "Pro", entitledModules: ["foundation", "revenue", "operations"], source: "subscription_plan", createdAt: Date.now(), updatedAt: Date.now() });
    });
    await expect(owner.query(api.domain.query, operation("reports.income_statement", { fromDate: "2026-08-01", toDate: "2026-08-31" }))).resolves.toMatchObject({ organizationId: "reports-org-a" });
  });

  it("calculates income, balance equation, and cash reconciliation from effective posted facts", async () => {
    const { owner } = await seeded();
    await owner.mutation(api.domain.mutate, operation("accounting.manual_journal.post", { scope: "branch", branchId: "reports-branch-a", postingDate: "2026-07-31", memo: "Opening equity", reason: "Controlled prior-period fixture", idempotencyKey: "report-opening", lines: [{ accountId: "acct-1100", debit: { amount: 50_000, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: "acct-3000", debit: { amount: 0, currency: "JOD" }, credit: { amount: 50_000, currency: "JOD" } }] }));
    const revenue = await owner.mutation(api.domain.mutate, operation("accounting.manual_journal.post", journal("reports-branch-a", "Revenue", "report-revenue", [{ accountId: "acct-1100", debit: 100_000, credit: 0 }, { accountId: "acct-4100", debit: 0, credit: 100_000 }]))) as { id: string };
    await owner.mutation(api.domain.mutate, operation("accounting.manual_journal.post", journal("reports-branch-a", "Repair expense", "report-repair", [{ accountId: "acct-5200", debit: 20_000, credit: 0 }, { accountId: "acct-2100", debit: 0, credit: 20_000 }])));

    const input = { fromDate: "2026-08-01", toDate: "2026-08-31", branchId: "reports-branch-a" };
    const income = await owner.query(api.domain.query, operation("reports.income_statement", input)) as { netIncome: { amount: number }; totalRevenue: { amount: number }; totalCosts: { amount: number }; membershipRevenueRecognition: string; warnings: string[] };
    expect(income).toMatchObject({ totalRevenue: { amount: 100_000 }, totalCosts: { amount: 20_000 }, netIncome: { amount: 80_000 }, membershipRevenueRecognition: "not_configured" });
    expect(income.warnings.some((warning) => warning.includes("revenue recognition"))).toBe(true);

    const balance = await owner.query(api.domain.query, operation("reports.balance_sheet", input)) as { totalAssets: { amount: number }; totalLiabilities: { amount: number }; currentEarnings: { amount: number }; totalEquity: { amount: number }; difference: { amount: number }; balanced: boolean };
    expect(balance).toMatchObject({ totalAssets: { amount: 150_000 }, totalLiabilities: { amount: 20_000 }, currentEarnings: { amount: 80_000 }, totalEquity: { amount: 130_000 }, difference: { amount: 0 }, balanced: true });

    const cashflow = await owner.query(api.domain.query, operation("reports.cashflow_statement", input)) as { openingCash: { amount: number }; netChange: { amount: number }; closingCash: { amount: number }; reconciliationDifference: { amount: number }; reconciliationStatus: string; reconciliation: { status: string; expectedClosingCash: { amount: number }; asOfCash: { amount: number }; difference: { amount: number } }; balanced: boolean };
    expect(cashflow).toMatchObject({ openingCash: { amount: 50_000 }, netChange: { amount: 100_000 }, closingCash: { amount: 150_000 }, reconciliationDifference: { amount: 0 }, reconciliationStatus: "unproven", reconciliation: { status: "unproven", expectedClosingCash: { amount: 150_000 }, asOfCash: { amount: 150_000 }, difference: { amount: 0 } }, balanced: false });

    await owner.mutation(api.domain.mutate, operation("accounting.entry.reverse", { entryId: revenue.id, reason: "Correct the controlled fixture", idempotencyKey: "report-reverse" }));
    const reversed = await owner.query(api.domain.query, operation("reports.income_statement", { fromDate: "2026-08-01", toDate: "2099-12-31", branchId: "reports-branch-a" })) as { netIncome: { amount: number }; totalRevenue: { amount: number } };
    expect(reversed.totalRevenue.amount).toBe(0);
    expect(reversed.netIncome.amount).toBe(-20_000);
  });

  it("enforces reporting module, role, branch, and tenant isolation", async () => {
    const { owner, manager, receptionist, t } = await seeded();
    await owner.mutation(api.domain.mutate, operation("accounting.manual_journal.post", { scope: "consolidated", postingDate: "2026-08-10", memo: "Unattributed consolidated fact", reason: "Controlled consolidated fixture", idempotencyKey: "report-consolidated", lines: [{ accountId: "acct-1100", debit: { amount: 5_000, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: "acct-4100", debit: { amount: 0, currency: "JOD" }, credit: { amount: 5_000, currency: "JOD" } }] }));
    const ownerConsolidated = await owner.query(api.domain.query, operation("reports.income_statement", { fromDate: "2026-08-01", toDate: "2026-08-31" })) as { totalRevenue: { amount: number } };
    expect(ownerConsolidated.totalRevenue.amount).toBe(5_000);
    const managerConsolidated = await manager.query(api.domain.query, operation("reports.income_statement", { fromDate: "2026-08-01", toDate: "2026-08-31" })) as { totalRevenue: { amount: number } };
    expect(managerConsolidated.totalRevenue.amount).toBe(0);
    const report = await manager.query(api.domain.query, operation("reports.income_statement", { fromDate: "2026-08-01", toDate: "2026-08-31", branchId: "reports-branch-a" })) as { organizationId: string; branchId: string };
    expect(report).toMatchObject({ organizationId: "reports-org-a", branchId: "reports-branch-a" });
    await expectCode(manager.query(api.domain.query, operation("reports.income_statement", { fromDate: "2026-08-01", toDate: "2026-08-31", branchId: "reports-branch-b" })), "FORBIDDEN");
    await expectCode(receptionist.query(api.domain.query, operation("reports.income_statement", { fromDate: "2026-08-01", toDate: "2026-08-31" })), "FORBIDDEN");
    await expectCode(owner.query(api.domain.query, operation("reports.income_statement", { fromDate: "2026-09-01", toDate: "2026-08-31" })), "VALIDATION_ERROR");

    await t.run(async (ctx) => {
      const now = Date.now();
      const foreignOrg = await ctx.db.insert("organizations", { publicId: "reports-org-b", name: "Foreign Reports", slug: "foreign-reports", status: "active", subscriptionPlan: "Pro", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
      const foreignBranch = await ctx.db.insert("branches", { organizationId: foreignOrg, publicId: "foreign-reports-branch", name: "Foreign", code: "FOREIGN", active: true, status: "active", createdAt: now, updatedAt: now });
      const foreignUser = await ctx.db.insert("users", { publicId: "foreign-reports-owner", authSubject: "clerk-foreign-reports-owner", email: "owner@foreign-reports.example", fullName: "Foreign Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
      await ctx.db.insert("organizationMemberships", { organizationId: foreignOrg, userId: foreignUser, role: "owner", branchIds: [foreignBranch], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    });
    await expectCode(owner.query(api.domain.query, operation("reports.income_statement", { fromDate: "2026-08-01", toDate: "2026-08-31", branchId: "foreign-reports-branch" })), "NOT_FOUND");
  });

  it("does not imply source completeness, resolves legacy branch data, and exposes traceable GM metrics", async () => {
    const { owner, manager, t } = await seeded();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "reports-org-a")).unique();
      if (!organization) throw new Error("Report fixture organization missing.");
      const now = Date.now();
      await ctx.db.insert("domainRecords", {
        organizationId: organization._id,
        entityType: "shift",
        publicId: "legacy-shift-a",
        createdAt: now,
        updatedAt: now,
        data: { branchId: "reports-branch-a", closedAt: "2026-08-10T12:00:00.000Z", variance: { amount: 100, currency: "JOD" } },
      });
      await ctx.db.insert("domainRecords", {
        organizationId: organization._id,
        entityType: "shift",
        publicId: "legacy-shift-b",
        createdAt: now,
        updatedAt: now,
        data: { homeBranchId: "reports-branch-b", closedAt: "2026-08-10T12:00:00.000Z", variance: { amount: 200, currency: "JOD" } },
      });
    });
    const analysis = await owner.query(api.domain.query, operation("reports.gm_analysis", { fromDate: "2026-08-01", toDate: "2026-08-31" })) as { queueCoverage: string; warnings: string[]; metrics: Array<{ key: string; status: string; sourceCount: number; drilldownIds: string[] }> };
    expect(analysis.queueCoverage).toBe("refresh_required");
    expect(analysis.warnings.some((warning) => warning.includes("coverage is not proven"))).toBe(true);
    expect(analysis.metrics.length).toBeGreaterThan(0);
    expect(analysis.metrics.every((metric) => metric.sourceCount === metric.drilldownIds.length || metric.drilldownIds.length === Math.min(metric.sourceCount, 100))).toBe(true);
    const managerAnalysis = await manager.query(api.domain.query, operation("reports.gm_analysis", { fromDate: "2026-08-01", toDate: "2026-08-31" })) as { metrics: Array<{ key: string; status: string; value?: { amount: number }; sourceCount: number; drilldownIds: string[] }> };
    const managerVariance = managerAnalysis.metrics.find((metric) => metric.key === "cash_variance");
    expect(managerVariance).toMatchObject({ status: "available", value: { amount: 100 }, sourceCount: 1, drilldownIds: ["legacy-shift-a"] });
    const ownerVariance = analysis.metrics.find((metric) => metric.key === "cash_variance");
    expect(ownerVariance).toMatchObject({ status: "available", value: { amount: 300 }, sourceCount: 2 });
  });
});
