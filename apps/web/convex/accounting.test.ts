import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}, request: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-accounting-${name}`, ...request });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

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

    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "LEDGER-PROTEIN", name: "Ledger Protein", unit: "each", reorderPoint: 1, targetLevel: 5, supplierLeadTimeDays: 2 })) as { id: string };
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
});
