import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}, request: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-accounting-${name}`, ...request });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

/**
 * Seeds a membership sale that was posted under the retired deferred v1
 * policy. New sales post as immediate revenue (v2), so the deferred
 * recognition engine is reachable only through rows like these — exactly the
 * legacy shape production still carries.
 */
async function seedPostedDeferredSale(t: TestConvex<typeof schema>, membershipPublicId: string, amountMinor: number) {
  await t.run(async (ctx) => {
    const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
    const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "accounting-branch-a")).unique();
    const now = Date.now();
    await ctx.db.insert("accountingSourcePostings", { organizationId: organization!._id, publicId: `source-legacy-${membershipPublicId}`, sourceType: "membership_sale", sourcePublicId: membershipPublicId, branchId: branch!._id, status: "posted", amountMinor, currency: "JOD", policyCode: "membership-sale.v1", policyVersion: 1, journalEntryPublicId: `je-legacy-${membershipPublicId}`, occurredAt: now, createdAt: now, updatedAt: now });
  });
}

async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "accounting-org-a", name: "Ledger Gym", slug: "ledger-gym", status: "active", subscriptionPlan: "Pro", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: organization, publicId: "accounting-branch-a", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: organization, publicId: "accounting-branch-b", name: "Second", code: "SECOND", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "accounting-owner", authSubject: "clerk-accounting-owner", email: "owner@accounting.example", fullName: "Ledger Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const manager = await ctx.db.insert("users", { publicId: "accounting-manager", authSubject: "clerk-accounting-manager", email: "manager@accounting.example", fullName: "Ledger Manager", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const receptionist = await ctx.db.insert("users", { publicId: "accounting-reception", authSubject: "clerk-accounting-reception", email: "reception@accounting.example", fullName: "Ledger Reception", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branchA, branchB], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: manager, role: "manager", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: receptionist, role: "receptionist", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "payment", publicId: "accounting-payment-a", branchId: branchA, createdAt: now, updatedAt: now, data: { id: "accounting-payment-a", branchId: "accounting-branch-a", type: "payment", status: "completed", amount: { amount: 25_000, currency: "JOD" }, method: "cash", occurredAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "payment", publicId: "accounting-payment-void", branchId: branchA, createdAt: now, updatedAt: now, data: { id: "accounting-payment-void", branchId: "accounting-branch-a", type: "payment", status: "voided", amount: { amount: 10_000, currency: "JOD" }, method: "card", occurredAt: new Date(now).toISOString() } });
    await ctx.db.insert("domainRecords", { organizationId: organization, entityType: "membership", publicId: "accounting-membership-a", branchId: branchA, createdAt: now, updatedAt: now, data: { id: "accounting-membership-a", homeBranchId: "accounting-branch-a", startDate: new Date(now).toISOString().slice(0, 10), endDate: "2099-12-31", salePrice: { amount: 40_000, currency: "JOD" }, frozenDaysUsed: 0 } });
  });
  return { t, owner: t.withIdentity({ subject: "clerk-accounting-owner" }), manager: t.withIdentity({ subject: "clerk-accounting-manager" }), receptionist: t.withIdentity({ subject: "clerk-accounting-reception" }) };
}

describe("immutable management-accounting ledger", () => {
  it("uses the organization plan when a materialized entitlement row is stale", async () => {
    const { owner, t } = await seeded();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      await ctx.db.insert("organizationEntitlements", { organizationId: organization!._id, catalogVersion: 1, subscriptionPlan: "Pro", entitledModules: ["foundation", "revenue", "operations"], source: "subscription_plan", createdAt: Date.now(), updatedAt: Date.now() });
    });
    await expect(owner.query(api.domain.query, operation("accounting.accounts.list"))).resolves.toEqual(expect.any(Array));
  });

  it("seeds a code-owned chart and rejects invalid manual journals", async () => {
    const { owner } = await seeded();
    const accounts = await owner.query(api.domain.query, operation("accounting.accounts.list")) as Array<{ id: string; code: string }>;
    expect(accounts.map((account) => account.code)).toEqual(expect.arrayContaining(["1100", "1200", "2200", "5300"]));
    const lines = [{ accountId: "acct-1100", debit: { amount: 100, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: "acct-1200", debit: { amount: 0, currency: "JOD" }, credit: { amount: 99, currency: "JOD" } }];
    await expectCode(owner.mutation(api.domain.mutate, operation("accounting.manual_journal.post", { scope: "branch", branchId: "accounting-branch-a", memo: "Unbalanced", reason: "Test invalid balance", idempotencyKey: "manual-invalid", lines })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("accounting.manual_journal.post", { scope: "branch", branchId: "accounting-branch-a", memo: "Wrong currency", reason: "Test currency guard", idempotencyKey: "manual-currency", lines: [{ accountId: "acct-1100", debit: { amount: 1, currency: "USD" }, credit: { amount: 0, currency: "USD" } }, { accountId: "acct-1200", debit: { amount: 0, currency: "USD" }, credit: { amount: 1, currency: "USD" } }] })), "VALIDATION_ERROR");
    const entry = await owner.mutation(api.domain.mutate, operation("accounting.manual_journal.post", { scope: "branch", branchId: "accounting-branch-a", memo: "Balanced journal", reason: "Owner-approved management adjustment", idempotencyKey: "manual-valid", lines: [{ accountId: "acct-1100", debit: { amount: 1_000, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: "acct-1200", debit: { amount: 0, currency: "JOD" }, credit: { amount: 1_000, currency: "JOD" } }] })) as { id: string; lines: Array<{ debit: { amount: number }; credit: { amount: number } }> };
    expect(entry.lines).toHaveLength(2);
    const replay = await owner.mutation(api.domain.mutate, operation("accounting.manual_journal.post", { scope: "branch", branchId: "accounting-branch-a", memo: "Balanced journal", reason: "Owner-approved management adjustment", idempotencyKey: "manual-valid", lines: [{ accountId: "acct-1100", debit: { amount: 1_000, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: "acct-1200", debit: { amount: 0, currency: "JOD" }, credit: { amount: 1_000, currency: "JOD" } }] })) as { id: string };
    expect(replay.id).toBe(entry.id);
    await expectCode(owner.mutation(api.domain.mutate, operation("accounting.manual_journal.post", { scope: "branch", branchId: "accounting-branch-a", memo: "Changed memo", reason: "Owner-approved management adjustment", idempotencyKey: "manual-valid", lines: [{ accountId: "acct-1100", debit: { amount: 1_000, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: "acct-1200", debit: { amount: 0, currency: "JOD" }, credit: { amount: 1_000, currency: "JOD" } }] })), "CONFLICT");
    await expectCode(owner.mutation(api.domain.mutate, operation("accounting.manual_journal.post", { scope: "branch", branchId: "accounting-branch-a", postingDate: "2026-02-30", memo: "Invalid date", reason: "Reject malformed calendar date", idempotencyKey: "manual-invalid-date", lines: [{ accountId: "acct-1100", debit: { amount: 1_000, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: "acct-1200", debit: { amount: 0, currency: "JOD" }, credit: { amount: 1_000, currency: "JOD" } }] })), "VALIDATION_ERROR");
  });

  it("returns the actual poster identity and public account ids in journal detail", async () => {
    const { owner, manager } = await seeded();
    const posted = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-a", idempotencyKey: "detail-poster", reason: "Verified cash collection" })) as { journalEntryId: string };
    const detail = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: posted.journalEntryId })) as { createdById: string; lines: Array<{ accountId: string }> };
    expect(detail.createdById).toBe("accounting-manager");
    expect(detail.lines.map((line) => line.accountId)).toEqual(["acct-1100", "acct-1200"]);
  });

  it("posts source events into the tenant-local accounting period", async () => {
    const { owner, t } = await seeded();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      const payment = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization!._id).eq("entityType", "payment").eq("publicId", "accounting-payment-a")).unique();
      await ctx.db.patch(organization!._id, { timezone: "Asia/Amman" });
      await ctx.db.patch(payment!._id, { data: { ...(payment!.data as Record<string, unknown>), occurredAt: "2026-01-31T22:30:00.000Z" } });
    });
    const posted = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-a", idempotencyKey: "local-period", reason: "Local period test" })) as { journalEntryId: string };
    const detail = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: posted.journalEntryId })) as { postingDate: string; periodId: string };
    expect(detail).toMatchObject({ postingDate: "2026-02-01", periodId: "2026-02" });
  });

  it("anchors monthly revenue recognition to the tenant-local service month end", async () => {
    const { owner, t } = await seeded();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      // Ahead-of-UTC tenants must not see a UTC month-end drift into the next
      // local day and therefore the next accounting period.
      await ctx.db.patch(organization!._id, { timezone: "Asia/Amman" });
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "accounting-branch-a")).unique();
      const now = Date.now();
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "membership", publicId: "accounting-membership-may", branchId: branch!._id, createdAt: now, updatedAt: now, data: { id: "accounting-membership-may", homeBranchId: "accounting-branch-a", startDate: "2026-05-01", endDate: "2026-05-31", salePrice: { amount: 31_000, currency: "JOD" }, frozenDaysUsed: 0 } });
    });
    await seedPostedDeferredSale(t, "accounting-membership-may", 31_000);
    const recognition = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "membership_revenue_recognition", sourceId: "membership-revenue:accounting-membership-may:2026-05", idempotencyKey: "may-recognition", reason: "Recognize May service" })) as { status: string; amount: { amount: number }; journalEntryId: string };
    expect(recognition).toMatchObject({ status: "posted", amount: { amount: 31_000 } });
    const detail = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: recognition.journalEntryId })) as { postingDate: string; periodId: string };
    expect(detail).toMatchObject({ postingDate: "2026-05-31", periodId: "2026-05" });
  });

  it("anchors an equipment purchase date to the same tenant-local calendar day", async () => {
    const { owner, t } = await seeded();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      // Behind-UTC tenants must not see a UTC-midnight purchase date drift
      // into the previous local day.
      await ctx.db.patch(organization!._id, { timezone: "America/New_York" });
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "accounting-branch-a")).unique();
      const now = Date.now();
      await ctx.db.insert("equipmentAssets", { organizationId: organization!._id, publicId: "accounting-asset-a", branchId: branch!._id, code: "TREAD-01", name: "Treadmill", status: "active", purchaseDate: "2026-03-10", purchaseCostMinor: 240_000, purchaseCostCurrency: "JOD", expectedUsefulLifeMonths: 24, createdAt: now, updatedAt: now });
    });
    const acquisition = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "equipment_acquisition", sourceId: "accounting-asset-a", idempotencyKey: "asset-acquisition", reason: "Post treadmill acquisition" })) as { status: string; journalEntryId: string };
    expect(acquisition.status).toBe("posted");
    const detail = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: acquisition.journalEntryId })) as { postingDate: string; periodId: string };
    expect(detail).toMatchObject({ postingDate: "2026-03-10", periodId: "2026-03" });
  });

  it("sorts the journal register by posting date instead of insertion order", async () => {
    const { owner } = await seeded();
    const lines = [{ accountId: "acct-1100", debit: { amount: 100, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: "acct-1200", debit: { amount: 0, currency: "JOD" }, credit: { amount: 100, currency: "JOD" } }];
    await owner.mutation(api.domain.mutate, operation("accounting.manual_journal.post", { scope: "branch", branchId: "accounting-branch-a", postingDate: "2026-08-02", memo: "Earlier journal", reason: "Date ordering test", idempotencyKey: "ordered-earlier", lines }));
    await owner.mutation(api.domain.mutate, operation("accounting.manual_journal.post", { scope: "branch", branchId: "accounting-branch-a", postingDate: "2026-08-19", memo: "Later journal", reason: "Date ordering test", idempotencyKey: "ordered-later", lines }));
    const register = await owner.query(api.domain.query, operation("accounting.journal_entries.list", { branchId: "accounting-branch-a" })) as { items: Array<{ memo: string; postingDate: string }> };
    expect(register.items.slice(0, 2).map((item) => item.memo)).toEqual(["Later journal", "Earlier journal"]);
  });

  it("enforces role, branch, and tenant isolation", async () => {
    const { owner, manager, receptionist, t } = await seeded();
    await expectCode(manager.mutation(api.domain.mutate, operation("accounting.manual_journal.post", { scope: "branch", branchId: "accounting-branch-a", memo: "Manager manual", reason: "Should be owner only", idempotencyKey: "manager-manual", lines: [{ accountId: "acct-1100", debit: { amount: 1, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: "acct-1200", debit: { amount: 0, currency: "JOD" }, credit: { amount: 1, currency: "JOD" } }] })), "FORBIDDEN");
    await expectCode(receptionist.query(api.domain.query, operation("accounting.accounts.list")), "FORBIDDEN");
    await expectCode(manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-a", idempotencyKey: "manager-payment", reason: "Post verified collection" }, { activeBranchId: "accounting-branch-b" })), "FORBIDDEN");
    await t.run(async (ctx) => {
      const now = Date.now();
      const foreignOrg = await ctx.db.insert("organizations", { publicId: "accounting-org-b", name: "Foreign Ledger", slug: "foreign-ledger", status: "active", subscriptionPlan: "Pro", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
      await ctx.db.insert("domainRecords", { organizationId: foreignOrg, entityType: "payment", publicId: "foreign-payment", createdAt: now, updatedAt: now, data: { id: "foreign-payment", type: "payment", status: "completed", amount: { amount: 1_000, currency: "JOD" }, method: "cash" } });
    });
    await expectCode(owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "foreign-payment", idempotencyKey: "foreign-payment", reason: "Cross-tenant attempt" })), "NOT_FOUND");
  });

  it("posts a supported payment exactly once, updates source state, and reverses with swapped lines", async () => {
    const { owner, manager, t } = await seeded();
    const posted = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-a", idempotencyKey: "payment-post-1", reason: "Verified cash collection" })) as { id: string; status: string; journalEntryId: string; amount: { amount: number } };
    expect(posted).toMatchObject({ status: "posted", amount: { amount: 25_000 } });
    const replay = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-a", idempotencyKey: "payment-post-2", reason: "Replay source" })) as { journalEntryId: string };
    expect(replay.journalEntryId).toBe(posted.journalEntryId);
    const detail = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: posted.journalEntryId })) as { lines: Array<{ debit: { amount: number }; credit: { amount: number } }>; status: string };
    expect(detail.lines.reduce((sum, line) => sum + line.debit.amount, 0)).toBe(25_000);
    expect(detail.lines.reduce((sum, line) => sum + line.credit.amount, 0)).toBe(25_000);
    const reversal = await owner.mutation(api.domain.mutate, operation("accounting.entry.reverse", { entryId: posted.journalEntryId, reason: "Owner-approved correction", idempotencyKey: "reverse-payment-1" })) as { reversalOfEntryId: string; lines: Array<{ debit: { amount: number }; credit: { amount: number } }> };
    expect(reversal.reversalOfEntryId).toBe(posted.journalEntryId);
    expect(reversal.lines[0]?.debit.amount).toBe(detail.lines[0]?.credit.amount);
    const reversalReplay = await owner.mutation(api.domain.mutate, operation("accounting.entry.reverse", { entryId: posted.journalEntryId, reason: "Owner-approved correction", idempotencyKey: "reverse-payment-1" })) as { id: string };
    expect(reversalReplay.id).toBeDefined();
    await expectCode(owner.mutation(api.domain.mutate, operation("accounting.entry.reverse", { entryId: posted.journalEntryId, reason: "Different approved correction", idempotencyKey: "reverse-payment-1" })), "CONFLICT");
    const trialBalance = await owner.query(api.domain.query, operation("accounting.trial_balance")) as { rows: Array<unknown>; totalDebit: { amount: number }; totalCredit: { amount: number } };
    expect(trialBalance).toMatchObject({ rows: [], totalDebit: { amount: 0 }, totalCredit: { amount: 0 } });
    const source = await owner.query(api.domain.query, operation("accounting.source_postings.list", { sourceType: "payment" })) as { items: Array<{ sourceId: string; status: string }> };
    expect(source.items).toEqual(expect.arrayContaining([expect.objectContaining({ sourceId: "accounting-payment-a", status: "reversed" })]));
    const stored = await t.run(async (ctx) => ctx.db.query("accountingJournalLines").collect());
    expect(stored).toHaveLength(4);
  });

  it("scopes source idempotency keys by full source identity", async () => {
    const { manager } = await seeded();
    const posted = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-a", idempotencyKey: "shared-payment-void-key", reason: "Verified cash collection" })) as { status: string; journalEntryId: string };
    expect(posted.status).toBe("posted");
    const replay = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-a", idempotencyKey: "shared-payment-void-key", reason: "Verified cash collection" })) as { journalEntryId: string };
    expect(replay.journalEntryId).toBe(posted.journalEntryId);
    await expectCode(manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "void", sourceId: "accounting-payment-a", idempotencyKey: "shared-payment-void-key", reason: "Attempted void with a reused key" })), "CONFLICT");
    const differentKey = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "void", sourceId: "accounting-payment-a", idempotencyKey: "different-void-key", reason: "Void lifecycle is not complete" })) as { status: string; journalEntryId?: string };
    expect(differentKey).toMatchObject({ status: "unconfigured" });
    expect(differentKey.journalEntryId).toBeUndefined();
    const journal = await manager.query(api.domain.query, operation("accounting.journal_entries.list", { sourceType: "payment" })) as { items: Array<{ sourceId: string; sourceType?: string }> };
    expect(journal.items.filter((item) => item.sourceId === "accounting-payment-a")).toHaveLength(1);
  });

  it("uses net membership sale value and conservative purchase/stock source policies", async () => {
    const { owner, manager, t } = await seeded();
    const createdAt = Date.now() - 5 * 86_400_000;
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "accounting-branch-a")).unique();
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "membership", publicId: "accounting-membership-discounted", branchId: branch!._id, createdAt, updatedAt: createdAt, data: { id: "accounting-membership-discounted", homeBranchId: "accounting-branch-a", startDate: "2099-01-01", salePrice: { amount: 50_000, currency: "JOD" }, discount: { amount: 5_000, currency: "JOD" }, discountApprovalStatus: "approved", frozenDaysUsed: 0 } });
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "membership", publicId: "accounting-membership-pending", branchId: branch!._id, createdAt, updatedAt: createdAt, data: { id: "accounting-membership-pending", homeBranchId: "accounting-branch-a", startDate: "2099-01-01", salePrice: { amount: 50_000, currency: "JOD" }, discount: { amount: 5_000, currency: "JOD" }, discountApprovalStatus: "pending", frozenDaysUsed: 0 } });
    });
    const discounted = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "membership_sale", sourceId: "accounting-membership-discounted", idempotencyKey: "membership-net-1" })) as { status: string; amount: { amount: number }; journalEntryId: string };
    expect(discounted).toMatchObject({ status: "posted", amount: { amount: 45_000 } });
    const discountedEntry = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: discounted.journalEntryId })) as { postingDate: string };
    expect(discountedEntry.postingDate).toBe(new Date(createdAt).toISOString().slice(0, 10));
    const pendingDiscount = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "membership_sale", sourceId: "accounting-membership-pending", idempotencyKey: "membership-pending-1" })) as { status: string };
    expect(pendingDiscount.status).toBe("unconfigured");

    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "LEDGER-PROTEIN", name: "Ledger Protein", unit: "each", reorderPoint: 1 })) as { id: string };
    const supplier = await owner.mutation(api.domain.mutate, operation("operations.supplier.upsert", { name: "Ledger Supplier", branchIds: ["accounting-branch-a"], preferredProductIds: [product.id] })) as { id: string };
    const order = await owner.mutation(api.domain.mutate, operation("operations.purchase_order.create", { branchId: "accounting-branch-a", supplierId: supplier.id, lines: [{ productId: product.id, quantity: 5, unitCost: { amount: 100, currency: "JOD" } }] })) as { id: string };
    await manager.mutation(api.domain.mutate, operation("operations.purchase_order.approve", { id: order.id }));
    await manager.mutation(api.domain.mutate, operation("operations.purchase_order.receive", { purchaseOrderId: order.id, lines: [{ productId: product.id, quantity: 2 }], idempotencyKey: "ledger-po-partial" }));
    const partial = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "purchase_order_receipt", sourceId: order.id, idempotencyKey: "ledger-po-partial-post" })) as { status: string };
    expect(partial.status).toBe("unconfigured");
    await manager.mutation(api.domain.mutate, operation("operations.purchase_order.receive", { purchaseOrderId: order.id, idempotencyKey: "ledger-po-full" }));
    const full = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "purchase_order_receipt", sourceId: order.id, idempotencyKey: "ledger-po-full-post" })) as { status: string; amount: { amount: number } };
    expect(full).toMatchObject({ status: "posted", amount: { amount: 500 } });
    const linkedMovement = await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      const movements = await ctx.db.query("stockMovements").withIndex("by_organization", (q) => q.eq("organizationId", organization!._id)).collect();
      return movements.find((movement) => movement.referenceType === "purchase_order");
    });
    expect(linkedMovement).toBeDefined();
    const doubleSource = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "stock_movement", sourceId: linkedMovement!.publicId, idempotencyKey: "ledger-linked-stock" })) as { status: string };
    expect(doubleSource.status).toBe("excluded");
  });

  it("refreshes a branch-safe source queue without auto-posting and is idempotent", async () => {
    const { manager } = await seeded();
    const first = await manager.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["payment", "void", "membership_sale"] })) as { scanned: number; created: number; updated: number; pending: number; items: Array<{ status: string; journalEntryId?: string }> };
    expect(first).toMatchObject({ scanned: 3, created: 3, updated: 0 });
    expect(first.pending).toBeGreaterThan(0);
    expect(first.items.every((item) => !item.journalEntryId)).toBe(true);
    const replay = await manager.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["payment", "void", "membership_sale"] })) as { scanned: number; created: number; updated: number };
    expect(replay).toMatchObject({ scanned: 3, created: 0, updated: 0 });
    await expectCode(manager.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { branchId: "accounting-branch-b" })), "FORBIDDEN");
  });

  it("records truthful unconfigured source state and protects closed periods", async () => {
    const { owner, manager } = await seeded();
    const missing = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-void", idempotencyKey: "voided-payment", reason: "Review voided source" })) as { status: string; journalEntryId?: string };
    // A voided fact is recorded truthfully, never turned into an invented entry.
    expect(missing).toMatchObject({ status: "unconfigured" });
    expect(missing.journalEntryId).toBeUndefined();
    const posting = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-a", idempotencyKey: "closed-payment-1", reason: "Post before close" })) as { journalEntryId: string };
    const entry = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: posting.journalEntryId })) as { periodId: string };
    await owner.mutation(api.domain.mutate, operation("accounting.period.close", { periodId: entry.periodId, reason: "Month-end owner review complete" }));
    await expectCode(owner.mutation(api.domain.mutate, operation("accounting.manual_journal.post", { scope: "branch", branchId: "accounting-branch-a", postingDate: `${entry.periodId}-15`, memo: "Closed-period attempt", reason: "Should be blocked", idempotencyKey: "closed-period-manual", lines: [{ accountId: "acct-1100", debit: { amount: 1, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: "acct-1200", debit: { amount: 0, currency: "JOD" }, credit: { amount: 1, currency: "JOD" } }] })), "CONFLICT");
  });

  it("replays failed source decisions by key while allowing a new key to retry", async () => {
    const { manager, t } = await seeded();
    const first = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-void", idempotencyKey: "stable-source-attempt", reason: "Review the voided collection" })) as { status: string; journalEntryId?: string };
    expect(first).toMatchObject({ status: "unconfigured" });
    expect(first.journalEntryId).toBeUndefined();

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      const payment = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization!._id).eq("entityType", "payment").eq("publicId", "accounting-payment-void")).unique();
      await ctx.db.patch(payment!._id, { data: { ...(payment!.data as Record<string, unknown>), status: "completed" }, updatedAt: Date.now() });
    });

    const refreshed = await manager.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["payment"] })) as { items: Array<{ sourceId: string; status: string; journalEntryId?: string }> };
    const refreshedDecision = refreshed.items.find((item) => item.sourceId === "accounting-payment-void");
    expect(refreshedDecision).toMatchObject({ sourceId: "accounting-payment-void", status: "pending" });
    expect(refreshedDecision?.journalEntryId).toBeUndefined();

    const replay = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-void", idempotencyKey: "stable-source-attempt", reason: "Review the voided collection" })) as { status: string; journalEntryId?: string };
    expect(replay).toMatchObject({ status: "unconfigured" });
    expect(replay.journalEntryId).toBeUndefined();
    await expectCode(manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-void", idempotencyKey: "stable-source-attempt", reason: "A materially different review reason" })), "CONFLICT");

    const retried = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-void", idempotencyKey: "stable-source-retry", reason: "Post after the source was corrected" })) as { status: string; journalEntryId?: string };
    expect(retried.status).toBe("posted");
    expect(retried.journalEntryId).toBeDefined();
    const replayAfterRetry = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-void", idempotencyKey: "stable-source-attempt", reason: "Review the voided collection" })) as { status: string; journalEntryId?: string };
    expect(replayAfterRetry).toMatchObject({ status: "unconfigured" });
    expect(replayAfterRetry.journalEntryId).toBeUndefined();
    await expectCode(manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-void", idempotencyKey: "stable-source-attempt", reason: "A materially different review reason" })), "CONFLICT");
  });

  it("keeps consolidated and unknown-branch ledger rows out of selected-branch views", async () => {
    const { owner, manager, t } = await seeded();

    const normal = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-a", idempotencyKey: "scope-normal-payment", reason: "Branch collection" })) as { journalEntryId: string };
    const consolidated = await owner.mutation(api.domain.mutate, operation("accounting.manual_journal.post", { scope: "consolidated", memo: "Organization-wide adjustment", reason: "Owner-approved consolidated correction", idempotencyKey: "scope-consolidated", lines: [{ accountId: "acct-1100", debit: { amount: 7_500, currency: "JOD" }, credit: { amount: 0, currency: "JOD" } }, { accountId: "acct-1200", debit: { amount: 0, currency: "JOD" }, credit: { amount: 7_500, currency: "JOD" } }] })) as { id: string };

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      const now = Date.now();
      // This simulates a legacy/unattributed source projection. It has no
      // branch and must be visible only to organization-wide actors.
      await ctx.db.insert("accountingSourcePostings", { organizationId: organization!._id, publicId: "source-consolidated-unknown", sourceType: "payment", sourcePublicId: "accounting-payment-consolidated", status: "posted", amountMinor: 9_900, currency: "JOD", journalEntryPublicId: "je-consolidated-unknown", occurredAt: now, createdAt: now, updatedAt: now });
    });

    const managerEntries = await manager.query(api.domain.query, operation("accounting.journal_entries.list")) as { items: Array<{ id: string; branchId?: string }> };
    expect(managerEntries.items.map((item) => item.id)).toContain(normal.journalEntryId);
    expect(managerEntries.items.map((item) => item.id)).not.toContain(consolidated.id);
    await expectCode(manager.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: consolidated.id })), "NOT_FOUND");

    const managerTrialBalance = await manager.query(api.domain.query, operation("accounting.trial_balance")) as { rows: Array<{ balance: { amount: number } }>; totalDebit: { amount: number }; totalCredit: { amount: number } };
    expect(managerTrialBalance.rows.some((row) => row.balance.amount === 7_500 || row.balance.amount === -7_500)).toBe(false);
    expect(managerTrialBalance.totalDebit.amount).toBe(25_000);
    expect(managerTrialBalance.totalCredit.amount).toBe(25_000);

    const managerSources = await manager.query(api.domain.query, operation("accounting.source_postings.list")) as { items: Array<{ sourceId: string; branchId?: string }> };
    expect(managerSources.items.map((item) => item.sourceId)).toContain("accounting-payment-a");
    expect(managerSources.items.map((item) => item.sourceId)).not.toContain("accounting-payment-consolidated");
    await expectCode(manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-consolidated", idempotencyKey: "scope-hidden-source", reason: "Should not disclose consolidated source" })), "NOT_FOUND");

    const ownerSources = await owner.query(api.domain.query, operation("accounting.source_postings.list")) as { items: Array<{ sourceId: string; branchId?: string }> };
    expect(ownerSources.items.map((item) => item.sourceId)).toContain("accounting-payment-consolidated");
  });

  it("recognizes membership revenue by persisted service days with exact allocation and idempotent posting", async () => {
    const { owner, manager, t } = await seeded();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "accounting-branch-a")).unique();
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "membership", publicId: "accounting-membership-recognition", branchId: branch!._id, createdAt: Date.parse("2026-01-01T00:00:00.000Z"), updatedAt: Date.parse("2026-01-01T00:00:00.000Z"), data: { id: "accounting-membership-recognition", homeBranchId: "accounting-branch-a", startDate: "2026-01-15", endDate: "2026-03-14", salePrice: { amount: 100_000, currency: "JOD" }, discount: { amount: 10_000, currency: "JOD" }, discountApprovalStatus: "approved", frozenDaysUsed: 0 } });
    });

    await seedPostedDeferredSale(t, "accounting-membership-recognition", 90_000);

    const refreshed = await manager.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["membership_revenue_recognition"], fromDate: "2026-01-01", toDate: "2026-03-31" })) as { items: Array<{ sourceId: string; status: string; amount?: { amount: number }; details?: Record<string, unknown> }>; queueCoverage?: string };
    expect(refreshed.queueCoverage).toBe("refresh_required");
    expect(refreshed.items).toHaveLength(3);
    expect(refreshed.items.reduce((sum, item) => sum + (item.amount?.amount ?? 0), 0)).toBe(90_000);
    expect(refreshed.items.map((item) => item.details?.serviceMonth)).toEqual(["2026-01", "2026-02", "2026-03"]);

    const firstSource = refreshed.items[0]!;
    const posted = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "membership_revenue_recognition", sourceId: firstSource.sourceId, idempotencyKey: "membership-recognition-post", reason: "Recognize earned January service" })) as { status: string; amount: { amount: number }; journalEntryId: string };
    expect(posted).toMatchObject({ status: "posted", amount: { amount: firstSource.amount?.amount } });
    const detail = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: posted.journalEntryId })) as { lines: Array<{ accountCode: string; debit: { amount: number }; credit: { amount: number } }> };
    expect(detail.lines.map((line) => line.accountCode)).toEqual(["2200", "4100"]);
    expect(detail.lines.reduce((sum, line) => sum + line.debit.amount, 0)).toBe(firstSource.amount?.amount);
    const replay = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "membership_revenue_recognition", sourceId: firstSource.sourceId, idempotencyKey: "membership-recognition-retry", reason: "Retry after receipt" })) as { journalEntryId: string };
    expect(replay.journalEntryId).toBe(posted.journalEntryId);

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "accounting-branch-a")).unique();
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "membership", publicId: "accounting-membership-cutoff", branchId: branch!._id, createdAt: Date.parse("2026-01-01T00:00:00.000Z"), updatedAt: Date.parse("2026-01-01T00:00:00.000Z"), data: { id: "accounting-membership-cutoff", homeBranchId: "accounting-branch-a", startDate: "2026-01-01", endDate: "2026-03-31", salePrice: { amount: 9_000, currency: "JOD" }, discount: { amount: 0, currency: "JOD" }, discountApprovalStatus: "approved", frozenDaysUsed: 28 } });
    });
    await seedPostedDeferredSale(t, "accounting-membership-cutoff", 9_000);
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      const membership = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization!._id).eq("entityType", "membership").eq("publicId", "accounting-membership-cutoff")).unique();
      await ctx.db.patch(membership!._id, { data: { ...(membership!.data as Record<string, unknown>), cancelledAt: "2026-03-15T12:00:00.000Z", freezes: [{ id: "freeze-accounting", startDate: "2026-02-01", endDate: "2026-02-28", status: "completed", reason: "Medical", createdAt: "2026-01-20T00:00:00.000Z" }] }, updatedAt: Date.now() });
    });
    const cutoff = await manager.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["membership_revenue_recognition"], fromDate: "2026-01-01", toDate: "2026-03-31" })) as { items: Array<{ sourceId: string; amount?: { amount: number }; details?: Record<string, unknown> }> };
    const cutoffRows = cutoff.items.filter((item) => item.sourceId.includes("accounting-membership-cutoff"));
    expect(cutoffRows.map((item) => item.details?.serviceMonth)).toEqual(["2026-01", "2026-03"]);
    expect(cutoffRows.reduce((sum, item) => sum + (item.amount?.amount ?? 0), 0)).toBeLessThan(9_000);
    const futureRecognition = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "membership_revenue_recognition", sourceId: "membership-revenue:accounting-membership-cutoff:2027-01", idempotencyKey: "membership-recognition-future", reason: "Reject future period" })) as { status: string; reason?: string };
    expect(futureRecognition).toMatchObject({ status: "unconfigured", reason: "Future membership service months cannot be recognized." });
  });

  it("posts new membership sales as immediate whole-price revenue with no recognition schedule", async () => {
    const { owner, manager } = await seeded();
    const sale = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "membership_sale", sourceId: "accounting-membership-a", idempotencyKey: "immediate-sale", reason: "Post membership sale" })) as { status: string; policyCode?: string; amount: { amount: number }; journalEntryId: string };
    expect(sale).toMatchObject({ status: "posted", policyCode: "membership-sale.v2", amount: { amount: 40_000 } });
    const detail = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: sale.journalEntryId })) as { lines: Array<{ accountCode: string; debit: { amount: number }; credit: { amount: number } }> };
    expect(detail.lines.map((line) => ({ code: line.accountCode, debit: line.debit.amount, credit: line.credit.amount }))).toEqual([
      { code: "1200", debit: 40_000, credit: 0 },
      { code: "4100", debit: 0, credit: 40_000 },
    ]);
    // No deferred balance exists, so no service month may ever be recognized.
    const recognition = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "membership_revenue_recognition", sourceId: `membership-revenue:accounting-membership-a:${new Date().toISOString().slice(0, 7)}`, idempotencyKey: "immediate-recognition", reason: "Attempt recognition of an immediate sale" })) as { status: string; reason?: string };
    expect(recognition).toMatchObject({ status: "unconfigured", reason: "This membership was posted as immediate revenue; no recognition schedule exists." });
    const refreshed = await manager.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["membership_revenue_recognition"] })) as { scanned: number };
    expect(refreshed.scanned).toBe(0);
  });

  it("posts straight-line equipment depreciation with a date fallback and keeps incomplete assets unconfigured", async () => {
    const { owner, manager, t } = await seeded();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "accounting-branch-a")).unique();
      const now = Date.parse("2026-01-01T00:00:00.000Z");
      await ctx.db.insert("equipmentAssets", { organizationId: organization!._id, publicId: "accounting-equipment-depreciable", branchId: branch!._id, code: "TREAD-01", name: "Treadmill", purchaseDate: "2026-01-01", installationDate: "2026-01-15", purchaseCostMinor: 1_000, purchaseCostCurrency: "JOD", status: "active", expectedUsefulLifeMonths: 3, createdAt: now, updatedAt: now });
      await ctx.db.insert("equipmentAssets", { organizationId: organization!._id, publicId: "accounting-equipment-incomplete", branchId: branch!._id, code: "BIKE-01", name: "Bike", status: "active", createdAt: now, updatedAt: now });
    });

    const beforeAcquisition = await manager.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["equipment_depreciation"], fromDate: "2026-01-01", toDate: "2026-03-31" })) as { items: Array<{ sourceId: string; status: string; reason?: string }> };
    expect(beforeAcquisition.items.filter((item) => item.sourceId.includes("accounting-equipment-depreciable")).every((item) => item.status === "unconfigured" && item.reason?.includes("acquisition must be posted"))).toBe(true);

    const acquisitionPosting = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "equipment_acquisition", sourceId: "accounting-equipment-depreciable", idempotencyKey: "equipment-acquisition-before-depreciation", reason: "Post equipment acquisition" })) as { status: string };
    expect(acquisitionPosting.status).toBe("posted");

    const refreshed = await manager.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["equipment_depreciation"], fromDate: "2026-01-01", toDate: "2026-03-31" })) as { items: Array<{ sourceId: string; status: string; amount?: { amount: number }; reason?: string; details?: Record<string, unknown> }> };
    const validItems = refreshed.items.filter((item) => item.sourceId.includes("accounting-equipment-depreciable"));
    expect(validItems).toHaveLength(3);
    expect(validItems.map((item) => item.amount?.amount)).toEqual([334, 333, 333]);
    expect(validItems.reduce((sum, item) => sum + (item.amount?.amount ?? 0), 0)).toBe(1_000);
    const incomplete = refreshed.items.find((item) => item.sourceId.includes("accounting-equipment-incomplete"));
    expect(incomplete).toMatchObject({ status: "unconfigured", reason: "Equipment needs a valid placed-in-service date or purchase date before depreciation can be configured." });

    const posted = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "equipment_depreciation", sourceId: validItems[0]!.sourceId, idempotencyKey: "equipment-depreciation-post", reason: "Post January depreciation" })) as { status: string; journalEntryId: string };
    expect(posted.status).toBe("posted");
    const detail = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: posted.journalEntryId })) as { lines: Array<{ accountCode: string }> };
    expect(detail.lines.map((line) => line.accountCode)).toEqual(["5600", "1550"]);
    const invalidPost = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "equipment_depreciation", sourceId: incomplete!.sourceId, idempotencyKey: "equipment-depreciation-invalid", reason: "Record incomplete depreciation fact" })) as { status: string; journalEntryId?: string };
    expect(invalidPost).toMatchObject({ status: "unconfigured" });
    expect(invalidPost.journalEntryId).toBeUndefined();

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      const asset = await ctx.db.query("equipmentAssets").withIndex("by_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "accounting-equipment-depreciable")).unique();
      await ctx.db.patch(asset!._id, { status: "retired", updatedAt: Date.now() });
    });
    const retired = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "equipment_depreciation", sourceId: validItems[1]!.sourceId, idempotencyKey: "equipment-depreciation-retired", reason: "Do not post retired asset" })) as { status: string; reason?: string };
    expect(retired).toMatchObject({ status: "unconfigured", reason: expect.stringContaining("effective retirement date") });
    const future = await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "equipment_depreciation", sourceId: "equipment-depreciation:accounting-equipment-depreciable:2027-01", idempotencyKey: "equipment-depreciation-future", reason: "Reject future period" })) as { status: string; reason?: string };
    expect(future).toMatchObject({ status: "unconfigured" });
  });

  it("proves queue coverage only after a complete scan and invalidates it when a new source appears", async () => {
    const { owner, manager, t } = await seeded();
    const reportInput = { fromDate: "2026-08-01", toDate: "2026-08-31", branchId: "accounting-branch-a" };
    const before = await owner.query(api.domain.query, operation("reports.income_statement", reportInput)) as { queueCoverage: string };
    expect(before.queueCoverage).toBe("refresh_required");

    const firstRefresh = await manager.mutation(api.domain.mutate, operation("accounting.source_postings.refresh")) as { queueCoverage?: string; scanned: number };
    expect(firstRefresh.scanned).toBeGreaterThan(0);
    expect(firstRefresh.queueCoverage).toBe("proven");
    const afterRefresh = await owner.query(api.domain.query, operation("reports.income_statement", reportInput)) as { queueCoverage: string; warnings: string[] };
    expect(afterRefresh.queueCoverage).toBe("proven");
    expect(afterRefresh.warnings.some((warning) => warning.includes("source queue coverage"))).toBe(false);

    await manager.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: "accounting-payment-a", idempotencyKey: "legacy-fingerprint-payment", reason: "Post source before legacy migration check" }));
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      const source = await ctx.db.query("accountingSourcePostings").withIndex("by_organization_source", (q) => q.eq("organizationId", organization!._id).eq("sourceType", "payment").eq("sourcePublicId", "accounting-payment-a")).unique();
      await ctx.db.patch(source!._id, { projectionFingerprint: undefined, updatedAt: Date.now() });
    });
    const migrated = await manager.mutation(api.domain.mutate, operation("accounting.source_postings.refresh")) as { updated: number };
    expect(migrated.updated).toBeGreaterThan(0);
    const migratedSources = await owner.query(api.domain.query, operation("accounting.source_postings.list", { sourceType: "payment" })) as { items: Array<{ sourceId: string; projectionFingerprint?: string }> };
    expect(migratedSources.items.find((item) => item.sourceId === "accounting-payment-a")?.projectionFingerprint).toBeTruthy();

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "accounting-branch-a")).unique();
      const now = Date.now();
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "payment", publicId: "accounting-payment-after-refresh", branchId: branch!._id, createdAt: now, updatedAt: now, data: { id: "accounting-payment-after-refresh", branchId: "accounting-branch-a", type: "payment", status: "completed", amount: { amount: 1_500, currency: "JOD" }, method: "cash", occurredAt: "2026-08-15T12:00:00.000Z" } });
    });
    const stale = await owner.query(api.domain.query, operation("reports.income_statement", reportInput)) as { queueCoverage: string };
    expect(stale.queueCoverage).toBe("refresh_required");
    await manager.mutation(api.domain.mutate, operation("accounting.source_postings.refresh"));
    const provenAgain = await owner.query(api.domain.query, operation("reports.income_statement", reportInput)) as { queueCoverage: string };
    expect(provenAgain.queueCoverage).toBe("proven");

    const emptyRange = await owner.query(api.domain.query, operation("reports.income_statement", { fromDate: "2030-01-01", toDate: "2030-01-31", branchId: "accounting-branch-a" })) as { queueCoverage: string };
    expect(emptyRange.queueCoverage).toBe("proven");
  });
});

describe("supplier payment settlement sources", () => {
  async function seededSupplierPayments() {
    const { owner, t } = await seeded();
    await t.run(async (ctx) => {
      const organization = (await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "accounting-org-a")).unique())!;
      const branch = (await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization._id).eq("publicId", "accounting-branch-a")).unique())!;
      const user = (await ctx.db.query("users").collect()).find((row) => row.publicId === "accounting-owner")!;
      const now = Date.now();
      const supplier = await ctx.db.insert("suppliers", { organizationId: organization._id, publicId: "accounting-supplier-a", name: "Jordan Sports Supply", branchIds: [branch._id], preferredProductIds: [], status: "active", createdAt: now, updatedAt: now });
      const base = { organizationId: organization._id, supplierId: supplier, supplierName: "Jordan Sports Supply", branchId: branch._id, currency: "JOD", allocations: [{ payableId: "purchase_order:accounting-po-a", payableSourceType: "purchase_order" as const, amountMinor: 650_000 }], recordedByUserId: user._id, recordedByName: "Ledger Owner", occurredAt: now, financialPostingStatus: "not_posted" as const, createdAt: now, updatedAt: now };
      await ctx.db.insert("supplierPayments", { ...base, publicId: "supplier-payment-cash", method: "cash", amountMinor: 650_000, status: "recorded", shiftPublicId: "accounting-shift-a", idempotencyKey: "sp-cash" });
      await ctx.db.insert("supplierPayments", { ...base, publicId: "supplier-payment-transfer", method: "bank_transfer", amountMinor: 1_000_000, reference: "TRF-2026-0001", status: "reversed", reversedAt: now, reversedByUserId: user._id, reversedByName: "Ledger Owner", reversalReason: "Transfer was sent twice", idempotencyKey: "sp-transfer" });
    });
    return { owner, t };
  }

  it("defines stable per-method settlement and reversal policies", async () => {
    const { DEFAULT_ACCOUNTING_POLICIES } = await import("./accounting");
    const byCode = new Map(DEFAULT_ACCOUNTING_POLICIES.map((policy) => [policy.policyCode, policy]));
    expect(byCode.get("supplier-payment-cash.v1")).toMatchObject({ sourceType: "supplier_payment", debitAccountCode: "2100", creditAccountCode: "1100", recognition: "immediate" });
    expect(byCode.get("supplier-payment-bank-transfer.v1")).toMatchObject({ sourceType: "supplier_payment", debitAccountCode: "2100", creditAccountCode: "1120" });
    expect(byCode.get("supplier-payment-cliq.v1")).toMatchObject({ sourceType: "supplier_payment", debitAccountCode: "2100", creditAccountCode: "1120" });
    expect(byCode.get("supplier-payment-reversal-cash.v1")).toMatchObject({ sourceType: "supplier_payment_reversal", debitAccountCode: "1100", creditAccountCode: "2100" });
    expect(byCode.get("supplier-payment-reversal-bank-transfer.v1")).toMatchObject({ sourceType: "supplier_payment_reversal", debitAccountCode: "1120", creditAccountCode: "2100" });
    expect(byCode.get("supplier-payment-reversal-cliq.v1")).toMatchObject({ sourceType: "supplier_payment_reversal", debitAccountCode: "1120", creditAccountCode: "2100" });
  });

  it("posts a cash settlement against payables and only posts a reversal after the original reached the ledger", async () => {
    const { owner, t } = await seededSupplierPayments();
    const refreshed = await owner.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["supplier_payment", "supplier_payment_reversal"] })) as { items: Array<{ sourceType: string; sourceId: string; status: string; policyCode?: string; reason?: string }> };
    const find = (sourceType: string, sourceId: string) => refreshed.items.find((item) => item.sourceType === sourceType && item.sourceId === sourceId);
    expect(find("supplier_payment", "supplier-payment-cash")).toMatchObject({ status: "pending", policyCode: "supplier-payment-cash.v1" });
    // Reversed before it ever posted: neither the original nor the reversal
    // may fabricate a bank outflow the ledger never saw.
    expect(find("supplier_payment", "supplier-payment-transfer")).toMatchObject({ status: "excluded", reason: expect.stringMatching(/reversed before it reached the ledger/i) });
    expect(find("supplier_payment_reversal", "supplier-payment-transfer")).toMatchObject({ status: "excluded", reason: expect.stringMatching(/never posted/i) });
    expect(find("supplier_payment_reversal", "supplier-payment-cash")).toBeUndefined();

    const posted = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "supplier_payment", sourceId: "supplier-payment-cash", idempotencyKey: "post-supplier-cash" })) as { status: string; policyCode?: string; journalEntryId?: string };
    expect(posted).toMatchObject({ status: "posted", policyCode: "supplier-payment-cash.v1", journalEntryId: expect.any(String) });
    const journal = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: posted.journalEntryId })) as { lines: Array<{ accountCode: string; debit: { amount: number }; credit: { amount: number } }> };
    expect(journal.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: "2100", debit: expect.objectContaining({ amount: 650_000 }) }),
      expect.objectContaining({ accountCode: "1100", credit: expect.objectContaining({ amount: 650_000 }) }),
    ]));
    const marked = await t.run(async (ctx) => (await ctx.db.query("supplierPayments").collect()).find((row) => row.publicId === "supplier-payment-cash"));
    expect(marked).toMatchObject({ financialPostingStatus: "posted", financialSourceId: "source-supplier_payment-supplier-payment-cash" });

    await t.run(async (ctx) => {
      const row = (await ctx.db.query("supplierPayments").collect()).find((candidate) => candidate.publicId === "supplier-payment-cash")!;
      await ctx.db.patch(row._id, { status: "reversed", reversedAt: Date.now(), reversalReason: "Paid the same invoice twice", reversalShiftPublicId: "accounting-shift-b", updatedAt: Date.now() });
    });
    const afterReversal = await owner.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["supplier_payment", "supplier_payment_reversal"] })) as { items: Array<{ sourceType: string; sourceId: string; status: string; policyCode?: string }> };
    // Posted rows are skipped by the refresh and stay posted: the original
    // settlement is immutable and only its reversal enters the queue.
    expect(afterReversal.items.find((item) => item.sourceType === "supplier_payment" && item.sourceId === "supplier-payment-cash")).toBeUndefined();
    const original = await t.run(async (ctx) => (await ctx.db.query("accountingSourcePostings").collect()).find((row) => row.sourceType === "supplier_payment" && row.sourcePublicId === "supplier-payment-cash"));
    expect(original?.status).toBe("posted");
    expect(afterReversal.items.find((item) => item.sourceType === "supplier_payment_reversal" && item.sourceId === "supplier-payment-cash")).toMatchObject({ status: "pending", policyCode: "supplier-payment-reversal-cash.v1" });

    const reversalPosted = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "supplier_payment_reversal", sourceId: "supplier-payment-cash", idempotencyKey: "post-supplier-cash-reversal" })) as { status: string; journalEntryId?: string };
    const reversalJournal = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: reversalPosted.journalEntryId })) as { lines: Array<{ accountCode: string; debit: { amount: number }; credit: { amount: number } }> };
    expect(reversalJournal.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountCode: "1100", debit: expect.objectContaining({ amount: 650_000 }) }),
      expect.objectContaining({ accountCode: "2100", credit: expect.objectContaining({ amount: 650_000 }) }),
    ]));
    const reversalMarked = await t.run(async (ctx) => (await ctx.db.query("supplierPayments").collect()).find((row) => row.publicId === "supplier-payment-cash"));
    expect(reversalMarked).toMatchObject({ financialPostingStatus: "posted", reversalFinancialPostingStatus: "posted" });
  });
});
