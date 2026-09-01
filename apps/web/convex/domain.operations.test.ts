import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-operations-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };

async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "operations-org-a", name: "Operations A", slug: "operations-a", status: "active", subscriptionPlan: "Growth", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: organization, publicId: "operations-branch-a", name: "Main", code: "MAIN", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: organization, publicId: "operations-branch-b", name: "Second", code: "SECOND", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "operations-owner", authSubject: "clerk-operations-owner", email: "owner@operations.example", fullName: "Operations Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const manager = await ctx.db.insert("users", { publicId: "operations-manager", authSubject: "clerk-operations-manager", email: "manager@operations.example", fullName: "Operations Manager", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const sales = await ctx.db.insert("users", { publicId: "operations-sales", authSubject: "clerk-operations-sales", email: "sales@operations.example", fullName: "Operations Sales", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const trainer = await ctx.db.insert("users", { publicId: "operations-trainer", authSubject: "clerk-operations-trainer", email: "trainer@operations.example", fullName: "Operations Trainer", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branchA, branchB], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: manager, role: "manager", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: sales, role: "sales", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: trainer, role: "trainer", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
  });
  return { t, owner: t.withIdentity({ subject: "clerk-operations-owner" }), manager: t.withIdentity({ subject: "clerk-operations-manager" }), sales: t.withIdentity({ subject: "clerk-operations-sales" }), trainer: t.withIdentity({ subject: "clerk-operations-trainer" }) };
}

describe("daily operations typed contracts", () => {
  it("reuses archived zone and retired equipment codes without deleting history", async () => {
    const { owner, t } = await seeded();

    const archivedZone = await owner.mutation(api.domain.mutate, operation("zones.upsert", { branchId: "operations-branch-a", code: "REUSE-01", name: "Old training zone", kind: "weights" })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("zones.archive", { id: archivedZone.id }));
    const liveZone = await owner.mutation(api.domain.mutate, operation("zones.upsert", { branchId: "operations-branch-a", code: "REUSE-01", name: "New training zone", kind: "cardio" })) as { id: string; status: string };
    expect(liveZone).toMatchObject({ status: "active" });
    expect(liveZone.id).not.toBe(archivedZone.id);

    const retiredAsset = await owner.mutation(api.domain.mutate, operation("operations.equipment_asset.upsert", { branchId: "operations-branch-a", code: "ASSET-REUSE", name: "Retired treadmill", status: "retired" })) as { id: string };
    const liveAsset = await owner.mutation(api.domain.mutate, operation("operations.equipment_asset.upsert", { branchId: "operations-branch-a", code: "ASSET-REUSE", name: "Replacement treadmill" })) as { id: string; status: string };
    expect(liveAsset).toMatchObject({ status: "active" });
    expect(liveAsset.id).not.toBe(retiredAsset.id);

    const historical = await t.run(async (ctx) => ({
      zones: await ctx.db.query("zones").withIndex("by_organization").collect(),
      assets: await ctx.db.query("equipmentAssets").withIndex("by_organization").collect(),
    }));
    expect(historical.zones.filter((zone) => zone.code === "REUSE-01")).toHaveLength(2);
    expect(historical.zones.map((zone) => zone.status)).toEqual(expect.arrayContaining(["archived", "active"]));
    expect(historical.assets.filter((asset) => asset.code === "ASSET-REUSE")).toHaveLength(2);
    expect(historical.assets.map((asset) => asset.status)).toEqual(expect.arrayContaining(["retired", "active"]));
  });

  it("checks out retail stock atomically for members and guests", async () => {
    const { owner, sales, t } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "RETAIL-01", name: "Protein drink", unit: "each", reorderPoint: 1, retailPrice: { amount: 2_000, currency: "JOD" } })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "receive", quantity: 3, unitCost: { amount: 500, currency: "JOD" }, idempotencyKey: "retail-opening" }));
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "operations-branch-a")).unique();
      const user = await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", "operations-sales")).unique();
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "member", publicId: "retail-member", branchId: branch!._id, memberPublicId: "retail-member", createdAt: Date.now(), updatedAt: Date.now(), data: { id: "retail-member", fullName: "Retail Member", memberNumber: "M-100", phone: "+962790000000", homeBranchId: "operations-branch-a" } });
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "shift", publicId: "retail-shift", branchId: branch!._id, createdAt: Date.now(), updatedAt: Date.now(), data: { id: "retail-shift", branchId: "operations-branch-a", status: "open", openedById: user!.publicId } });
    });
    const memberSale = await sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", memberId: "retail-member", lines: [{ productId: product.id, quantity: 1 }], method: "cash", idempotencyKey: "retail-member-sale" })) as { receiptId: string; retailSale: { customer: { kind: string }; total: { amount: number } } };
    expect(memberSale).toMatchObject({ receiptId: expect.any(String), retailSale: { customer: { kind: "member" }, total: { amount: 2_000 }, lines: [{ unitCost: { amount: 500, currency: "JOD" } }] } });
    const replay = await sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", memberId: "retail-member", lines: [{ productId: product.id, quantity: 1 }], method: "cash", idempotencyKey: "retail-member-sale" })) as { receiptId: string };
    expect(replay.receiptId).toBe(memberSale.receiptId);
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", memberId: "retail-member", lines: [{ productId: product.id, quantity: 2 }], method: "cash", idempotencyKey: "retail-member-sale" })), "CONFLICT");
    const timeline = await sales.query(api.domain.query, operation("members.timeline", { memberId: "retail-member" })) as { items: Array<{ type: string; meta?: { receiptId?: string } }> };
    expect(timeline.items).toEqual(expect.arrayContaining([expect.objectContaining({ type: "payment_collected", meta: expect.objectContaining({ receiptId: memberSale.receiptId }) })]));
    const guestSale = await sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", guest: { fullName: "Guest Buyer", phone: "+962790000001" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "VISA-1", idempotencyKey: "retail-guest-sale" })) as { receiptId: string; customer?: { kind: string } };
    const guestReceipt = await sales.query(api.domain.query, operation("receipts.get", { receiptId: guestSale.receiptId })) as { member?: unknown; customer: { kind: string; fullName: string }; retailSale: { lines: Array<{ quantity: number }> } };
    expect(guestReceipt).toMatchObject({ customer: { kind: "guest", fullName: "Guest Buyer" }, retailSale: { lines: [{ quantity: 1 }] } });
    expect(guestReceipt.member).toBeUndefined();
    const today = new Date().toISOString().slice(0, 10);
    const shift = await owner.query(api.domain.query, operation("shifts.current", { branchId: "operations-branch-a" })) as { totals: { cashPayments: { amount: number }; paymentCount: number } };
    expect(shift.totals).toMatchObject({ cashPayments: { amount: 2_000 }, paymentCount: 1 });
    const reconciliation = await owner.query(api.domain.query, operation("reconciliation.daily", { branchId: "operations-branch-a", date: today })) as { totalCollected: { amount: number }; totalsByMethod: Array<{ method: string; payments: { amount: number } }> };
    expect(reconciliation.totalCollected.amount).toBe(4_000);
    expect(reconciliation.totalsByMethod).toEqual(expect.arrayContaining([expect.objectContaining({ method: "cash", payments: expect.objectContaining({ amount: 2_000 }) }), expect.objectContaining({ method: "card", payments: expect.objectContaining({ amount: 2_000 }) })]));
    const transactions = await owner.query(api.domain.query, operation("transactions.list", { branchId: "operations-branch-a", type: "retail_sale" })) as { items: Array<{ type: string; customer?: { kind: string } }> };
    expect(transactions.items).toHaveLength(2);
    expect(transactions.items).toEqual(expect.arrayContaining([expect.objectContaining({ type: "retail_sale", customer: expect.objectContaining({ kind: "guest" }) })]));
    const dashboard = await owner.query(api.domain.query, operation("dashboard", { branchId: "operations-branch-a", from: today, to: today })) as { kpis: { revenueToday: { amount: number } }; branchRevenue: Array<{ collected: { amount: number } }> };
    expect(dashboard.kpis.revenueToday).toMatchObject({ amount: 4_000 });
    expect(dashboard.branchRevenue[0]?.collected).toMatchObject({ amount: 4_000 });
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      await ctx.db.patch(organization!._id, { subscriptionPlan: "Pro", updatedAt: Date.now() });
    });
    const refreshed = await owner.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["payment"] })) as { items: Array<{ sourceId: string; status: string; policyCode?: string }> };
    const retailSource = refreshed.items.find((item) => item.policyCode === "retail-sale-card.v2");
    expect(retailSource).toMatchObject({ status: "pending", policyCode: "retail-sale-card.v2" });
    const posted = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: retailSource!.sourceId, idempotencyKey: "retail-accounting-post" })) as { status: string; journalEntryId?: string };
    expect(posted).toMatchObject({ status: "posted", journalEntryId: expect.any(String) });
    const saleMovements = await t.run(async (ctx) => (await ctx.db.query("stockMovements").withIndex("by_organization").collect()).filter((movement) => movement.type === "sale"));
    for (const [index, movement] of saleMovements.entries()) {
      const movementPosting = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "stock_movement", sourceId: movement.publicId, idempotencyKey: `retail-cogs-${index}` })) as { status: string };
      expect(movementPosting.status).toBe("posted");
    }
    const income = await owner.query(api.domain.query, operation("reports.income_statement", { branchId: "operations-branch-a", fromDate: new Date().toISOString().slice(0, 10), toDate: new Date().toISOString().slice(0, 10) })) as { revenue: { lines: Array<{ accountCode: string; amount: { amount: number } }> }; costOfSales: { lines: Array<{ accountCode: string; amount: { amount: number } }> } };
    expect(income.revenue.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: "4200", amount: expect.objectContaining({ amount: 2_000 }) })]));
    expect(income.costOfSales.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: "5100", amount: expect.objectContaining({ amount: 1_000 }) })]));
    const inventory = await sales.query(api.domain.query, operation("operations.inventory.list", { branchId: "operations-branch-a", productId: product.id })) as Array<{ availableQuantity: number }>;
    expect(inventory[0]?.availableQuantity).toBe(1);
    const movements = await t.run(async (ctx) => ctx.db.query("stockMovements").withIndex("by_organization").collect());
    expect(movements.filter((movement) => movement.type === "sale")).toHaveLength(2);
  });

  it("rejects missing prices, missing references, insufficient stock, and missing cash shifts before mutation", async () => {
    const { owner, sales, t } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "RETAIL-02", name: "Unpriced drink", unit: "each", reorderPoint: 1 })) as { id: string };
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", guest: { fullName: "Guest", phone: "+962790000002" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "VISA-2", idempotencyKey: "retail-unpriced" })), "CONFLICT");
    await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { id: product.id, sku: "RETAIL-02", name: "Unpriced drink", unit: "each", reorderPoint: 1, retailPrice: { amount: 1_000, currency: "JOD" } }));
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "receive", quantity: 1, idempotencyKey: "retail-opening-2" }));
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", guest: { fullName: "Guest", phone: "+962790000002" }, lines: [{ productId: product.id, quantity: 1 }], method: "cash", idempotencyKey: "retail-no-shift" })), "NO_OPEN_SHIFT");
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", guest: { fullName: "Guest", phone: "+962790000002" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", idempotencyKey: "retail-no-ref" })), "VALIDATION_ERROR");
    const secondProduct = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "RETAIL-03", name: "Second drink", unit: "each", reorderPoint: 1, retailPrice: { amount: 1_500, currency: "JOD" } })) as { id: string };
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", guest: { fullName: "Guest", phone: "+962790000002" }, lines: [{ productId: product.id, quantity: 1 }, { productId: secondProduct.id, quantity: 1 }], method: "card", externalReference: "VISA-3", idempotencyKey: "retail-later-line-stock" })), "CONFLICT");
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", guest: { fullName: "Guest", phone: "+962790000002" }, lines: [{ productId: product.id, quantity: 2 }], method: "card", externalReference: "VISA-4", idempotencyKey: "retail-overstock" })), "CONFLICT");
    const before = await t.run(async (ctx) => ({ sales: (await ctx.db.query("stockMovements").withIndex("by_organization").collect()).filter((movement) => movement.type === "sale").length, receipts: (await ctx.db.query("domainRecords").withIndex("by_entity_type").collect()).filter((record) => record.entityType === "receipt").length }));
    expect(before).toEqual({ sales: 0, receipts: 0 });
    const inventory = await sales.query(api.domain.query, operation("operations.inventory.list", { branchId: "operations-branch-a", productId: product.id })) as Array<{ availableQuantity: number }>;
    expect(inventory[0]?.availableQuantity).toBe(1);
  });

  it("preserves a historical pending retail policy across refresh and post", async () => {
    const { owner, t } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "RETAIL-HISTORICAL", name: "Historical policy item", unit: "each", reorderPoint: 1, retailPrice: { amount: 1_000, currency: "JOD" } })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "receive", quantity: 1, unitCost: { amount: 300, currency: "JOD" }, idempotencyKey: "historical-policy-opening" }));
    const sale = await owner.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", guest: { fullName: "Historical policy guest", phone: "+962790000099" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "HISTORICAL-POLICY", idempotencyKey: "historical-policy-sale" })) as { retailSale: { id: string } };
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      await ctx.db.patch(organization!._id, { subscriptionPlan: "Pro", updatedAt: Date.now() });
    });
    const initial = await owner.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["payment"] })) as { items: Array<{ sourceId: string; policyCode?: string }> };
    const source = initial.items.find((item) => item.policyCode === "retail-sale-card.v2");
    expect(source).toBeDefined();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      const row = await ctx.db.query("accountingSourcePostings").withIndex("by_organization_source", (q) => q.eq("organizationId", organization!._id).eq("sourceType", "payment").eq("sourcePublicId", source!.sourceId)).unique();
      if (!row) throw new Error("retail source fixture missing");
      await ctx.db.patch(row._id, { status: "unconfigured", policyCode: "retail-sale-card.v1", policyVersion: 1, reason: "Historical source awaiting review.", updatedAt: Date.now() });
    });
    const refreshed = await owner.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["payment"] })) as { items: Array<{ sourceId: string; status: string; policyCode?: string; policyVersion?: number }> };
    expect(refreshed.items.find((item) => item.sourceId === source!.sourceId)).toMatchObject({ status: "pending", policyCode: "retail-sale-card.v1", policyVersion: 1 });
    const posted = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "payment", sourceId: source!.sourceId, idempotencyKey: "historical-policy-post" })) as { policyCode?: string; policyVersion?: number; journalEntryId?: string };
    expect(posted).toMatchObject({ policyCode: "retail-sale-card.v1", policyVersion: 1, journalEntryId: expect.any(String) });
    const journal = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: posted.journalEntryId })) as { policyCode?: string; policyVersion?: number; lines: Array<{ accountCode: string; credit: { amount: number } }> };
    expect(journal).toMatchObject({ policyCode: "retail-sale-card.v1", policyVersion: 1 });
    expect(journal.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: "4100", credit: expect.objectContaining({ amount: 1_000 }) })]));
    expect(sale.retailSale.id).toBeTruthy();
  });

  it("reason-gates retail refunds and voids while restoring stock and emitting reversal facts", async () => {
    const { owner, t } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "RETAIL-RETURN", name: "Returnable item", unit: "each", reorderPoint: 1, retailPrice: { amount: 2_000, currency: "JOD" } })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "receive", quantity: 4, unitCost: { amount: 500, currency: "JOD" }, idempotencyKey: "return-opening" }));
    const sale = await owner.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", guest: { fullName: "Return Guest", phone: "+962790000088" }, lines: [{ productId: product.id, quantity: 2 }], method: "card", externalReference: "RETURN-CARD", idempotencyKey: "return-sale" })) as { retailSale: { id: string }; receiptId: string };
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.retail.refund", { saleId: sale.retailSale.id, lines: [{ productId: product.id, quantity: 1 }], reason: "", idempotencyKey: "return-refund-invalid" })), "VALIDATION_ERROR");
    const refunded = await owner.mutation(api.domain.mutate, operation("operations.retail.refund", { saleId: sale.retailSale.id, lines: [{ productId: product.id, quantity: 1 }], reason: "Customer returned an unopened item", idempotencyKey: "return-refund" })) as { receiptId: string; payment: { id: string; type: string; amount: { amount: number }; receiptId: string }; retailSale: { status: string; refundedAmount: { amount: number }; returnedLines: Array<{ quantity: number }> } };
    expect(refunded.retailSale).toMatchObject({ status: "partially_refunded", refundedAmount: { amount: 2_000 }, returnedLines: [{ quantity: 1 }] });
    expect(refunded.receiptId).not.toBe(sale.receiptId);
    expect(refunded.payment).toMatchObject({ type: "refund", amount: { amount: -2_000 }, receiptId: refunded.receiptId });
    const replay = await owner.mutation(api.domain.mutate, operation("operations.retail.refund", { saleId: sale.retailSale.id, lines: [{ productId: product.id, quantity: 1 }], reason: "Customer returned an unopened item", idempotencyKey: "return-refund" })) as { retailSale: { refundedAmount: { amount: number } } };
    expect(replay.retailSale.refundedAmount.amount).toBe(2_000);
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.retail.void", { saleId: sale.retailSale.id, reason: "Wrong sale", idempotencyKey: "return-void-blocked" })), "CONFLICT");

    const voidSale = await owner.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", guest: { fullName: "Void Guest", phone: "+962790000089" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "VOID-CARD", idempotencyKey: "void-sale" })) as { retailSale: { id: string } };
    const voided = await owner.mutation(api.domain.mutate, operation("operations.retail.void", { saleId: voidSale.retailSale.id, reason: "Duplicate terminal entry", idempotencyKey: "void-sale-action" })) as { retailSale: { status: string; voidReason: string } };
    expect(voided.retailSale).toMatchObject({ status: "voided", voidReason: "Duplicate terminal entry" });
    const state = await t.run(async (ctx) => ({
      balance: await ctx.db.query("inventoryBalances").first(),
      returns: (await ctx.db.query("stockMovements").collect()).filter((movement) => movement.type === "return"),
      payments: (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "payment")).collect()).map((row) => row.data),
      audits: await ctx.db.query("auditEvents").collect(),
    }));
    expect(state.balance?.quantityOnHand).toBe(3);
    expect(state.returns).toHaveLength(2);
    expect(state.returns.every((movement) => movement.unitCostMinor === 500 && movement.unitCostCurrency === "JOD")).toBe(true);
    expect(state.payments).toEqual(expect.arrayContaining([expect.objectContaining({ type: "refund", amount: expect.objectContaining({ amount: -2_000 }), originalPaymentId: expect.stringContaining("retail-payment-") }), expect.objectContaining({ type: "retail_sale", status: "voided" })]));
    expect(state.audits.map((event) => event.action)).toEqual(expect.arrayContaining(["operations.retail_sale.refund", "operations.retail_sale.void"]));
  });

  it("requires an open cash shift for refunds and posts retail reversal facts to revenue and COGS", async () => {
    const { owner, t } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "RETAIL-CASH-REFUND", name: "Cash refund item", unit: "each", reorderPoint: 1, retailPrice: { amount: 2_000, currency: "JOD" } })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "receive", quantity: 2, unitCost: { amount: 600, currency: "JOD" }, idempotencyKey: "cash-refund-opening" }));
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "operations-branch-a")).unique();
      const user = await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", "operations-owner")).unique();
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "shift", publicId: "cash-refund-shift", branchId: branch!._id, createdAt: Date.now(), updatedAt: Date.now(), data: { id: "cash-refund-shift", branchId: "operations-branch-a", status: "open", openedById: user!.publicId } });
      await ctx.db.patch(organization!._id, { subscriptionPlan: "Pro", updatedAt: Date.now() });
    });
    const sale = await owner.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", guest: { fullName: "Cash refund guest", phone: "+962790000091" }, lines: [{ productId: product.id, quantity: 1 }], method: "cash", idempotencyKey: "cash-refund-sale" })) as { retailSale: { id: string } };
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      const shift = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization!._id).eq("entityType", "shift").eq("publicId", "cash-refund-shift")).unique();
      if (!shift) throw new Error("cash refund shift fixture missing");
      await ctx.db.patch(shift._id, { data: { ...shift.data, status: "closed" }, updatedAt: Date.now() });
    });
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.retail.void", { saleId: sale.retailSale.id, reason: "Cash void after close", idempotencyKey: "cash-void-after-close" })), "NO_OPEN_SHIFT");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.retail.refund", { saleId: sale.retailSale.id, lines: [{ productId: product.id, quantity: 1 }], reason: "Cash refund without shift", idempotencyKey: "cash-refund-no-shift" })), "NO_OPEN_SHIFT");
    const afterRejected = await owner.query(api.domain.query, operation("operations.inventory.list", { branchId: "operations-branch-a", productId: product.id })) as Array<{ availableQuantity: number }>;
    expect(afterRejected[0]?.availableQuantity).toBe(1);
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      const shift = await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", organization!._id).eq("entityType", "shift").eq("publicId", "cash-refund-shift")).unique();
      if (!shift) throw new Error("cash refund shift fixture missing");
      await ctx.db.patch(shift._id, { data: { ...shift.data, status: "open" }, updatedAt: Date.now() });
    });
    const refunded = await owner.mutation(api.domain.mutate, operation("operations.retail.refund", { saleId: sale.retailSale.id, lines: [{ productId: product.id, quantity: 1 }], reason: "Customer paid cash and returned item", idempotencyKey: "cash-refund-success" })) as { payment: { type: string; shiftId?: string }; retailSale: { status: string } };
    expect(refunded).toMatchObject({ retailSale: { status: "refunded" }, payment: { type: "refund", shiftId: "cash-refund-shift" } });
    const movement = await t.run(async (ctx) => (await ctx.db.query("stockMovements").withIndex("by_organization").collect()).find((row) => row.referenceType === "retail_refund"));
    const refundPayment = await t.run(async (ctx) => (await ctx.db.query("domainRecords").withIndex("by_entity_type", (q) => q.eq("entityType", "payment")).collect()).find((row) => (row.data as Record<string, unknown>).type === "refund"));
    expect(movement).toMatchObject({ unitCostMinor: 600, unitCostCurrency: "JOD" });
    expect(refundPayment).toBeDefined();
    await owner.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["refund", "stock_movement"] }));
    const refundPosting = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "refund", sourceId: (refundPayment!.data as Record<string, unknown>).id as string, idempotencyKey: "cash-refund-accounting" })) as { journalEntryId: string };
    const returnPosting = await owner.mutation(api.domain.mutate, operation("accounting.source.post", { sourceType: "stock_movement", sourceId: movement!.publicId, idempotencyKey: "cash-refund-cogs" })) as { journalEntryId: string };
    const refundJournal = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: refundPosting.journalEntryId })) as { lines: Array<{ accountCode: string; debit: { amount: number }; credit: { amount: number } }> };
    const returnJournal = await owner.query(api.domain.query, operation("accounting.journal_entries.get", { entryId: returnPosting.journalEntryId })) as { lines: Array<{ accountCode: string; debit: { amount: number }; credit: { amount: number } }> };
    expect(refundJournal.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: "4200", debit: expect.objectContaining({ amount: 2_000 }) }), expect.objectContaining({ accountCode: "1100", credit: expect.objectContaining({ amount: 2_000 }) })]));
    expect(returnJournal.lines).toEqual(expect.arrayContaining([expect.objectContaining({ accountCode: "1300", debit: expect.objectContaining({ amount: 600 }) }), expect.objectContaining({ accountCode: "5100", credit: expect.objectContaining({ amount: 600 }) })]));
  });

  it("keeps member checkout branch-scoped and honours disabled payment methods", async () => {
    const { owner, sales, t } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "RETAIL-BRANCH", name: "Branch item", unit: "each", reorderPoint: 1, retailPrice: { amount: 1_000, currency: "JOD" } })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "receive", quantity: 2, idempotencyKey: "retail-branch-opening" }));
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "operations-branch-b")).unique();
      const now = Date.now();
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "member", publicId: "branch-b-member", branchId: branch!._id, memberPublicId: "branch-b-member", createdAt: now, updatedAt: now, data: { id: "branch-b-member", fullName: "Branch B Member", memberNumber: "M-B", phone: "+962790000099", homeBranchId: "operations-branch-b" } });
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "settings", publicId: "settings", createdAt: now, updatedAt: now, data: { paymentMethods: [{ key: "cash", enabled: true }, { key: "card", enabled: false }, { key: "cliq", enabled: true }] } });
    });
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", memberId: "branch-b-member", lines: [{ productId: product.id, quantity: 1 }], method: "cash", idempotencyKey: "retail-branch-member" })), "NOT_FOUND");
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", guest: { fullName: "Disabled card guest", phone: "+962790000098" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "VISA-DISABLED", idempotencyKey: "retail-disabled-card" })), "VALIDATION_ERROR");
    const inventory = await sales.query(api.domain.query, operation("operations.inventory.list", { branchId: "operations-branch-a", productId: product.id })) as Array<{ availableQuantity: number }>;
    expect(inventory[0]?.availableQuantity).toBe(2);
  });

  it("allows front-desk collection but denies checkout without payments.collect", async () => {
    const { owner, sales, trainer } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "RETAIL-04", name: "Front desk item", unit: "each", reorderPoint: 1, retailPrice: { amount: 1_000, currency: "JOD" } })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "receive", quantity: 1, idempotencyKey: "retail-opening-4" }));
    const input = { branchId: "operations-branch-a", guest: { fullName: "Front Desk Guest", phone: "+962790000005" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "VISA-5", idempotencyKey: "retail-front-desk" };
    await expectCode(trainer.mutation(api.domain.mutate, operation("operations.retail.checkout", input)), "FORBIDDEN");
    await expect(sales.mutation(api.domain.mutate, operation("operations.retail.checkout", input))).resolves.toMatchObject({ retailSale: { customer: { kind: "guest" } } });
  });

  it("uses the organization plan when a materialized entitlement row is stale", async () => {
    const { owner, t } = await seeded();
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      await ctx.db.insert("organizationEntitlements", { organizationId: organization!._id, catalogVersion: 1, subscriptionPlan: "Growth", entitledModules: ["foundation", "revenue"], source: "subscription_plan", createdAt: Date.now(), updatedAt: Date.now() });
    });
    await expect(owner.query(api.domain.query, operation("operations.products.list"))).resolves.toEqual([]);
  });

  it("enforces operations entitlement, owner/manager writes, and branch isolation", async () => {
    const { owner, manager, sales, t } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "SUP-CREATINE", name: "Creatine", unit: "serving", reorderPoint: 5 })) as { id: string };
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "SUP-OTHER", name: "Other", unit: "each", reorderPoint: 1 })), "FORBIDDEN");
    await expectCode(manager.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-b", productId: product.id, type: "receive", quantity: 5, idempotencyKey: "branch-b-movement" })), "FORBIDDEN");
    const outOfScopeSupplier = await owner.mutation(api.domain.mutate, operation("operations.supplier.upsert", { name: "Second branch supplier", branchIds: ["operations-branch-b"], preferredProductIds: [product.id] })) as { id: string };
    const managerSuppliers = await manager.query(api.domain.query, operation("operations.suppliers.list")) as Array<{ id: string }>;
    expect(managerSuppliers.some((supplier) => supplier.id === outOfScopeSupplier.id)).toBe(false);
    await expectCode(manager.mutation(api.domain.mutate, operation("operations.supplier.archive", { id: outOfScopeSupplier.id, reason: "Scope regression test" })), "NOT_FOUND");
    await t.run(async (ctx) => {
      const now = Date.now();
      const foreignOrg = await ctx.db.insert("organizations", { publicId: "operations-org-b", name: "Operations B", slug: "operations-b", status: "active", subscriptionPlan: "Growth", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
      await ctx.db.insert("products", { organizationId: foreignOrg, publicId: "foreign-product", sku: "FOREIGN", name: "Foreign stock", unit: "each", reorderPoint: 1, status: "active", createdAt: now, updatedAt: now });
    });
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: "foreign-product", type: "receive", quantity: 1, idempotencyKey: "foreign-product-movement" })), "NOT_FOUND");
    const branchA = await manager.query(api.domain.query, operation("operations.inventory.list", { branchId: "operations-branch-a" })) as unknown[];
    expect(branchA).toEqual([]);
  });

  it("keeps stock movements idempotent and projects low stock", async () => {
    const { owner, t } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "SUP-CREATINE", name: "Creatine", unit: "serving", reorderPoint: 5 })) as { id: string };
    const received = await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "receive", quantity: 10, idempotencyKey: "movement-1", financialPostingStatus: "posted", financialSourceId: "forged-finance-source" })) as { id: string; quantityDelta: number; financialPostingStatus: string; financialSourceId?: string };
    expect(received).toMatchObject({ financialPostingStatus: "not_posted" });
    expect(received.financialSourceId).toBeUndefined();
    const replay = await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "receive", quantity: 10, idempotencyKey: "movement-1" })) as { id: string };
    expect(replay.id).toBe(received.id);
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "sale", quantity: 8, idempotencyKey: "movement-2" }));
    const alerts = await owner.query(api.domain.query, operation("operations.low_stock.list", { branchId: "operations-branch-a" })) as Array<{ productId: string; availableQuantity: number; reorderPoint: number }>;
    expect(alerts).toEqual([expect.objectContaining({ productId: product.id, availableQuantity: 2, reorderPoint: 5 })]);
    const movements = await t.run(async (ctx) => ctx.db.query("stockMovements").collect());
    expect(movements).toHaveLength(2);
  });

  it("sets product availability with an audited adjustment and allows private purchase sources", async () => {
    const { owner, t } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "AVAILABILITY-01", name: "Availability item", unit: "each", reorderPoint: 2, branchId: "operations-branch-a", availableQuantity: 7 })) as { id: string };
    const initial = await owner.query(api.domain.query, operation("operations.inventory.list", { branchId: "operations-branch-a", productId: product.id })) as Array<{ availableQuantity: number }>;
    expect(initial[0]?.availableQuantity).toBe(7);
    const same = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { id: product.id, sku: "AVAILABILITY-01", name: "Availability item", unit: "each", reorderPoint: 2, branchId: "operations-branch-a", availableQuantity: 7 })) as { id: string };
    expect(same.id).toBe(product.id);
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "sale", quantity: 5, idempotencyKey: "availability-sale" }));
    await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { id: product.id, sku: "AVAILABILITY-01", name: "Availability item", unit: "each", reorderPoint: 2, branchId: "operations-branch-a", availableQuantity: 7 }));
    const restored = await owner.query(api.domain.query, operation("operations.inventory.list", { branchId: "operations-branch-a", productId: product.id })) as Array<{ availableQuantity: number }>;
    expect(restored[0]?.availableQuantity).toBe(7);
    const movements = await t.run(async (ctx) => ctx.db.query("stockMovements").withIndex("by_organization").collect());
    expect(movements.filter((movement) => movement.referenceType === "product_stock_edit")).toHaveLength(2);

    const order = await owner.mutation(api.domain.mutate, operation("operations.purchase_order.create", { branchId: "operations-branch-a", sourceType: "private", lines: [{ productId: product.id, quantity: 2, unitCost: { amount: 500, currency: "JOD" } }] })) as { id: string; sourceType: string; supplierName: string };
    expect(order).toMatchObject({ sourceType: "private", supplierName: "Private purchase" });
    await owner.mutation(api.domain.mutate, operation("operations.purchase_order.approve", { id: order.id }));
    const received = await owner.mutation(api.domain.mutate, operation("operations.purchase_order.receive", { purchaseOrderId: order.id, idempotencyKey: "private-po-receive" })) as { status: string };
    expect(received.status).toBe("received");
  });

  it("approves and partially receives a purchase order without double receiving", async () => {
    const { owner, manager } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "SUP-PROTEIN", name: "Protein", unit: "each", reorderPoint: 5 })) as { id: string };
    const supplier = await owner.mutation(api.domain.mutate, operation("operations.supplier.upsert", { name: "Supplier", branchIds: ["operations-branch-a"], preferredProductIds: [product.id] })) as { id: string };
    const order = await owner.mutation(api.domain.mutate, operation("operations.purchase_order.create", { branchId: "operations-branch-a", supplierId: supplier.id, lines: [{ productId: product.id, quantity: 5, unitCost: { amount: 100, currency: "JOD" } }] })) as { id: string; status: string; lines: Array<{ productId: string }> };
    expect(order.lines[0]?.productId).toBe(product.id);
    await manager.mutation(api.domain.mutate, operation("operations.purchase_order.approve", { id: order.id }));
    const received = await manager.mutation(api.domain.mutate, operation("operations.purchase_order.receive", { purchaseOrderId: order.id, lines: [{ productId: product.id, quantity: 2 }], idempotencyKey: "po-receive-1" })) as { status: string; lines: Array<{ receivedQuantity: number }> };
    const replay = await manager.mutation(api.domain.mutate, operation("operations.purchase_order.receive", { purchaseOrderId: order.id, lines: [{ productId: product.id, quantity: 2 }], idempotencyKey: "po-receive-1" })) as { status: string; lines: Array<{ receivedQuantity: number }> };
    expect(received).toMatchObject({ status: "partially_received", lines: [{ receivedQuantity: 2 }] });
    expect(replay).toMatchObject({ status: "partially_received", lines: [{ receivedQuantity: 2 }] });
    const completed = await manager.mutation(api.domain.mutate, operation("operations.purchase_order.receive", { purchaseOrderId: order.id, idempotencyKey: "po-receive-2" })) as { status: string; lines: Array<{ receivedQuantity: number }> };
    expect(completed).toMatchObject({ status: "received", lines: [{ receivedQuantity: 5 }] });
  });

  it("authorizes purchase-order receive replays before returning a known result", async () => {
    const { owner, manager, t } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "SUP-REPLAY-SCOPE", name: "Replay scoped protein", unit: "each", reorderPoint: 1 })) as { id: string };
    const supplier = await owner.mutation(api.domain.mutate, operation("operations.supplier.upsert", { name: "Replay supplier", branchIds: ["operations-branch-a"], preferredProductIds: [product.id] })) as { id: string };
    const order = await owner.mutation(api.domain.mutate, operation("operations.purchase_order.create", { branchId: "operations-branch-a", supplierId: supplier.id, lines: [{ productId: product.id, quantity: 3, unitCost: { amount: 100, currency: "JOD" } }] })) as { id: string };
    await manager.mutation(api.domain.mutate, operation("operations.purchase_order.approve", { id: order.id }));
    const first = await manager.mutation(api.domain.mutate, operation("operations.purchase_order.receive", { purchaseOrderId: order.id, lines: [{ productId: product.id, quantity: 1 }], idempotencyKey: "po-replay-scope" })) as { status: string; lines: Array<{ receivedQuantity: number }> };
    expect(first).toMatchObject({ status: "partially_received", lines: [{ receivedQuantity: 1 }] });

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      const user = await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", "operations-manager")).unique();
      const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organization!._id).eq("userId", user!._id)).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "operations-branch-b")).unique();
      await ctx.db.patch(membership!._id, { branchIds: [branch!._id], branchScope: "selected", updatedAt: Date.now() });
    });
    await expectCode(manager.mutation(api.domain.mutate, operation("operations.purchase_order.receive", { purchaseOrderId: order.id, lines: [{ productId: product.id, quantity: 1 }], idempotencyKey: "po-replay-scope" })), "FORBIDDEN");

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      const user = await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", "operations-manager")).unique();
      const membership = await ctx.db.query("organizationMemberships").withIndex("by_organization_user", (q) => q.eq("organizationId", organization!._id).eq("userId", user!._id)).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "operations-branch-a")).unique();
      await ctx.db.patch(membership!._id, { branchIds: [branch!._id], branchScope: "selected", updatedAt: Date.now() });
    });
    await manager.mutation(api.domain.mutate, operation("operations.purchase_order.receive", { purchaseOrderId: order.id, idempotencyKey: "po-replay-complete" }));
    const replayAfterLifecycleChange = await manager.mutation(api.domain.mutate, operation("operations.purchase_order.receive", { purchaseOrderId: order.id, lines: [{ productId: product.id, quantity: 1 }], idempotencyKey: "po-replay-scope" })) as { status: string; lines: Array<{ receivedQuantity: number }> };
    expect(replayAfterLifecycleChange).toMatchObject({ status: "partially_received", lines: [{ receivedQuantity: 1 }] });
  });

  it("links facilities and equipment to zones and reports missing recommendation data", async () => {
    const { owner, manager } = await seeded();
    const zone = await owner.mutation(api.domain.mutate, operation("zones.upsert", { branchId: "operations-branch-a", code: "CARDIO", name: "Cardio", kind: "cardio" })) as { id: string };
    const task = await manager.mutation(api.domain.mutate, operation("operations.facility_task.upsert", { branchId: "operations-branch-a", zoneId: zone.id, kind: "cleaning", severity: "medium", title: "Inspect floor", trafficContext: { occupancyPercent: 72 }, financialPostingStatus: "posted", financialSourceId: "forged-facility-source" })) as { zoneId: string; financialPostingStatus: string; financialSourceId?: string };
    expect(task.zoneId).toBe(zone.id);
    expect(task).toMatchObject({ financialPostingStatus: "not_posted" });
    expect(task.financialSourceId).toBeUndefined();
    const asset = await owner.mutation(api.domain.mutate, operation("operations.equipment_asset.upsert", { branchId: "operations-branch-a", zoneId: zone.id, code: "TREAD-01", name: "Treadmill" })) as { id: string };
    const issue = await owner.mutation(api.domain.mutate, operation("operations.equipment_issue.report", { branchId: "operations-branch-a", assetId: asset.id, title: "Noise", severity: "medium", safetyStatus: "out_of_service" })) as { id: string; status: string };
    expect(issue.status).toBe("open");
    expect(await owner.query(api.domain.query, operation("operations.equipment_assets.list", { branchId: "operations-branch-a" }))).toEqual(expect.arrayContaining([expect.objectContaining({ id: asset.id, status: "maintenance" })]));
    await expectCode(manager.mutation(api.domain.mutate, operation("operations.equipment_issue.update", { id: issue.id, status: "resolved" })), "VALIDATION_ERROR");
    const resolvedIssue = await manager.mutation(api.domain.mutate, operation("operations.equipment_issue.update", { id: issue.id, status: "resolved", safetyStatus: "safe_to_operate" })) as { status: string; safetyStatus: string; resolvedAt?: string };
    expect(resolvedIssue).toMatchObject({ status: "resolved", safetyStatus: "safe_to_operate", resolvedAt: expect.any(String) });
    expect(await owner.query(api.domain.query, operation("operations.equipment_assets.list", { branchId: "operations-branch-a" }))).toEqual(expect.arrayContaining([expect.objectContaining({ id: asset.id, status: "active" })]));
    await expectCode(manager.mutation(api.domain.mutate, operation("operations.equipment_issue.update", { id: issue.id, status: "in_progress" })), "CONFLICT");
    const workOrder = await manager.mutation(api.domain.mutate, operation("operations.equipment_work_order.upsert", { branchId: "operations-branch-a", assetId: asset.id, description: "Inspect motor", partsCost: { amount: 100, currency: "JOD" }, financialPostingStatus: "posted", financialSourceId: "forged-work-order-source" })) as { financialPostingStatus: string; financialSourceId?: string };
    expect(workOrder).toMatchObject({ financialPostingStatus: "not_posted" });
    expect(workOrder.financialSourceId).toBeUndefined();
    const recommendation = await owner.query(api.domain.query, operation("operations.equipment.recommendation", { id: asset.id })) as { decision: string; rationale: string[] };
    expect(recommendation.decision).toBe("insufficient_data");
    expect(recommendation.rationale.join(" ")).toMatch(/replacement estimate|repair cost|purchase date|useful life/i);
  });

  it("keeps indexed facility working sets correct at realistic branch volume", async () => {
    const { owner, manager, t } = await seeded();
    const zoneA = await owner.mutation(api.domain.mutate, operation("zones.upsert", { branchId: "operations-branch-a", code: "FLOOR-A", name: "Main floor", kind: "floor" })) as { id: string };
    const zoneB = await owner.mutation(api.domain.mutate, operation("zones.upsert", { branchId: "operations-branch-b", code: "FLOOR-B", name: "Second floor", kind: "floor" })) as { id: string };

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      const branches = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", organization!._id)).collect();
      const zones = await ctx.db.query("zones").withIndex("by_organization", (q) => q.eq("organizationId", organization!._id)).collect();
      const branchByPublicId = new Map(branches.map((branch) => [branch.publicId, branch._id]));
      const zoneByPublicId = new Map(zones.map((zone) => [zone.publicId, zone._id]));
      const statuses = ["open", "in_progress", "blocked"] as const;
      const now = Date.now();
      for (let index = 0; index < 600; index += 1) {
        const branchPublicId = index % 2 === 0 ? "operations-branch-a" : "operations-branch-b";
        const zonePublicId = branchPublicId === "operations-branch-a" ? zoneA.id : zoneB.id;
        await ctx.db.insert("facilityTasks", { organizationId: organization!._id, publicId: `scale-facility-${index}`, branchId: branchByPublicId.get(branchPublicId)!, zoneId: zoneByPublicId.get(zonePublicId)!, kind: index % 5 === 0 ? "incident" : "cleaning", severity: index % 10 === 0 ? "critical" : "medium", status: statuses[index % statuses.length]!, title: `Scale task ${index}`, financialPostingStatus: "not_posted", createdAt: now - index, updatedAt: now - index });
      }
    });

    const branchOpen = await manager.query(api.domain.query, operation("operations.facility_tasks.list", { branchId: "operations-branch-a", status: "open" })) as Array<{ id: string; status: string; branchId: string }>;
    expect(branchOpen).toHaveLength(100);
    expect(branchOpen.every((task) => task.branchId === "operations-branch-a" && task.status === "open")).toBe(true);
    const organizationBlocked = await owner.query(api.domain.query, operation("operations.facility_tasks.list", { status: "blocked" })) as Array<{ status: string }>;
    expect(organizationBlocked).toHaveLength(200);
    expect(organizationBlocked.every((task) => task.status === "blocked")).toBe(true);
  });

  it("keeps posted operational source facts immutable and audits inventory adjustments", async () => {
    const { owner, t } = await seeded();
    const zoneA = await owner.mutation(api.domain.mutate, operation("zones.upsert", { branchId: "operations-branch-a", code: "POSTED-A", name: "Posted A", kind: "weights" })) as { id: string };
    const zoneB = await owner.mutation(api.domain.mutate, operation("zones.upsert", { branchId: "operations-branch-a", code: "POSTED-B", name: "Posted B", kind: "weights" })) as { id: string };
    const task = await owner.mutation(api.domain.mutate, operation("operations.facility_task.upsert", { branchId: "operations-branch-a", zoneId: zoneA.id, kind: "cleaning", severity: "medium", status: "completed", title: "Posted task", suppliesCost: { amount: 500, currency: "JOD" } })) as { id: string };
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "operations-branch-a")).unique();
      const now = Date.now();
      await ctx.db.insert("accountingSourcePostings", { organizationId: organization!._id, publicId: "source-facility-posted", sourceType: "facility_supplies", sourcePublicId: task.id, branchId: branch!._id, status: "posted", currency: "JOD", occurredAt: now, createdAt: now, updatedAt: now });
    });
    const harmlessTaskEdit = await owner.mutation(api.domain.mutate, operation("operations.facility_task.upsert", { id: task.id, branchId: "operations-branch-a", zoneId: zoneA.id, kind: "cleaning", severity: "medium", title: "Posted task renamed" })) as { title: string; suppliesCost?: { amount: number } };
    expect(harmlessTaskEdit).toMatchObject({ title: "Posted task renamed", suppliesCost: { amount: 500 } });
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.facility_task.upsert", { id: task.id, branchId: "operations-branch-a", zoneId: zoneB.id, kind: "cleaning", severity: "medium", title: "Move posted task" })), "CONFLICT");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.facility_task.upsert", { id: task.id, branchId: "operations-branch-a", zoneId: zoneA.id, kind: "cleaning", severity: "medium", title: "Change posted cost", suppliesCost: { amount: 600, currency: "JOD" } })), "CONFLICT");

    const asset = await owner.mutation(api.domain.mutate, operation("operations.equipment_asset.upsert", { branchId: "operations-branch-a", zoneId: zoneA.id, code: "POSTED-01", name: "Posted asset", purchaseDate: "2025-01-01", purchaseCost: { amount: 10_000, currency: "JOD" } })) as { id: string };
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "operations-branch-a")).unique();
      const now = Date.now();
      await ctx.db.insert("accountingSourcePostings", { organizationId: organization!._id, publicId: "source-equipment-acquisition-posted", sourceType: "equipment_acquisition", sourcePublicId: asset.id, branchId: branch!._id, status: "posted", currency: "JOD", occurredAt: now, createdAt: now, updatedAt: now });
    });
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.equipment_asset.upsert", { id: asset.id, branchId: "operations-branch-a", zoneId: zoneA.id, code: "POSTED-01", name: "Posted asset", purchaseDate: "2025-01-01", purchaseCost: { amount: 11_000, currency: "JOD" } })), "CONFLICT");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.equipment_asset.upsert", { id: asset.id, branchId: "operations-branch-b", code: "POSTED-01", name: "Posted asset" })), "CONFLICT");

    const workOrder = await owner.mutation(api.domain.mutate, operation("operations.equipment_work_order.upsert", { branchId: "operations-branch-a", assetId: asset.id, status: "completed", description: "Posted repair", partsCost: { amount: 800, currency: "JOD" }, laborCost: { amount: 200, currency: "JOD" } })) as { id: string };
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "operations-branch-a")).unique();
      const now = Date.now();
      await ctx.db.insert("accountingSourcePostings", { organizationId: organization!._id, publicId: "source-equipment-repair-posted", sourceType: "equipment_repair", sourcePublicId: workOrder.id, branchId: branch!._id, status: "posted", currency: "JOD", occurredAt: now, createdAt: now, updatedAt: now });
    });
    const harmlessWorkOrderEdit = await owner.mutation(api.domain.mutate, operation("operations.equipment_work_order.upsert", { id: workOrder.id, branchId: "operations-branch-a", assetId: asset.id, status: "completed", description: "Posted repair note" })) as { description: string; totalCost?: { amount: number } };
    expect(harmlessWorkOrderEdit).toMatchObject({ description: "Posted repair note", totalCost: { amount: 1_000 } });
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.equipment_work_order.upsert", { id: workOrder.id, branchId: "operations-branch-a", assetId: asset.id, status: "completed", description: "Change posted repair", partsCost: { amount: 900, currency: "JOD" } })), "CONFLICT");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.equipment_work_order.upsert", { id: workOrder.id, branchId: "operations-branch-a", assetId: asset.id, status: "in_progress", description: "Reopen posted repair" })), "CONFLICT");

    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "ADJUST-01", name: "Adjustment product", unit: "each", reorderPoint: 1 })) as { id: string };
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "adjustment", quantity: 1, idempotencyKey: "adjustment-without-reason" })), "VALIDATION_ERROR");
    const adjustment = await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "adjustment", quantity: 1, reason: "Cycle count correction", idempotencyKey: "adjustment-with-reason" })) as { reason?: string };
    expect(adjustment.reason).toBe("Cycle count correction");
    await expect(owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "adjustment", quantity: -1, reason: "Reverse cycle count correction", idempotencyKey: "adjustment-negative" }))).resolves.toMatchObject({ quantityDelta: -1, quantity: 1 });
  });

  it("keeps equipment assignees and work-order transitions branch-safe", async () => {
    const { owner } = await seeded();
    const asset = await owner.mutation(api.domain.mutate, operation("operations.equipment_asset.upsert", { branchId: "operations-branch-b", code: "SECOND-01", name: "Second branch machine" })) as { id: string };
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.equipment_work_order.upsert", { branchId: "operations-branch-b", assetId: asset.id, assigneeId: "operations-manager", description: "Wrong branch assignee" })), "VALIDATION_ERROR");
    const order = await owner.mutation(api.domain.mutate, operation("operations.equipment_work_order.upsert", { branchId: "operations-branch-b", assetId: asset.id, description: "Replace emergency-stop switch" })) as { id: string; status: string; description: string };
    expect(order.status).toBe("draft");
    await owner.mutation(api.domain.mutate, operation("operations.equipment_work_order.upsert", { id: order.id, branchId: "operations-branch-b", assetId: asset.id, status: "approved", description: order.description }));
    await owner.mutation(api.domain.mutate, operation("operations.equipment_work_order.upsert", { id: order.id, branchId: "operations-branch-b", assetId: asset.id, status: "in_progress", description: order.description }));
    const completed = await owner.mutation(api.domain.mutate, operation("operations.equipment_work_order.upsert", { id: order.id, branchId: "operations-branch-b", assetId: asset.id, status: "completed", description: order.description })) as { status: string };
    expect(completed.status).toBe("completed");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.equipment_work_order.upsert", { id: order.id, branchId: "operations-branch-b", assetId: asset.id, status: "draft", description: order.description })), "CONFLICT");
  });

  it("permanently deletes a product, releases its SKU, and keeps history readable", async () => {
    const { owner, sales, t } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "DELETE-ME", name: "Disposable stock", unit: "each", reorderPoint: 1 })) as { id: string };
    const supplier = await owner.mutation(api.domain.mutate, operation("operations.supplier.upsert", { name: "Delete supplier", branchIds: ["operations-branch-a"], preferredProductIds: [product.id] })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "receive", quantity: 2, idempotencyKey: "delete-me-receive" }));
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.product.delete", { productId: product.id, reason: "Created only for deletion coverage", confirmation: "delete-me" })), "FORBIDDEN");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.product.delete", { productId: product.id, reason: "Stock must be cleared first", confirmation: "delete-me" })), "CONFLICT");
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "adjustment", quantity: -2, reason: "Clearing stock before permanent deletion", idempotencyKey: "delete-me-clear" }));
    const deleted = await owner.mutation(api.domain.mutate, operation("operations.product.delete", { productId: product.id, reason: "No longer sold by this gym", confirmation: "delete-me" })) as { deleted: boolean; productId: string; sku: string };
    expect(deleted).toMatchObject({ deleted: true, productId: product.id, sku: "DELETE-ME" });
    const replay = await owner.mutation(api.domain.mutate, operation("operations.product.delete", { productId: product.id, reason: "Retry delete", confirmation: "delete-me" })) as { deleted: boolean; productId: string };
    expect(replay).toMatchObject({ deleted: true, productId: product.id });
    const replacement = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "DELETE-ME", name: "Replacement stock", unit: "each", reorderPoint: 1 })) as { id: string; sku: string };
    expect(replacement).toMatchObject({ sku: "DELETE-ME" });
    expect(replacement.id).not.toBe(product.id);
    const suppliers = await owner.query(api.domain.query, operation("operations.suppliers.list")) as Array<{ id: string; preferredProductIds: string[] }>;
    expect(suppliers).toEqual(expect.arrayContaining([expect.objectContaining({ id: supplier.id })]));
    expect(suppliers.find((row) => row.id === supplier.id)?.preferredProductIds ?? []).not.toContain(product.id);
    const movements = await owner.query(api.domain.query, operation("operations.stock_movements.list")) as { items: Array<{ productId: string; productSku?: string; productName?: string }> };
    expect(movements.items).toEqual(expect.arrayContaining([expect.objectContaining({ productId: product.id, productSku: "DELETE-ME", productName: "Disposable stock" })]));
    const audits = await t.run(async (ctx) => ctx.db.query("auditEvents").withIndex("by_organization_occurred").collect());
    expect(audits.some((event) => event.action === "operations.product.delete" && event.entityPublicId === product.id)).toBe(true);
  });

  it("blocks permanent deletion while an open purchase order still references the product", async () => {
    const { owner } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "DELETE-OPEN-PO", name: "Open PO stock", unit: "each", reorderPoint: 1 })) as { id: string };
    const supplier = await owner.mutation(api.domain.mutate, operation("operations.supplier.upsert", { name: "Open PO supplier", branchIds: ["operations-branch-a"], preferredProductIds: [product.id] })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("operations.purchase_order.create", { branchId: "operations-branch-a", supplierId: supplier.id, lines: [{ productId: product.id, quantity: 4, unitCost: { amount: 100, currency: "JOD" } }] }));
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.product.delete", { productId: product.id, reason: "Cannot fulfil this order", confirmation: "DELETE-OPEN-PO" })), "CONFLICT");
  });

  it("keeps retail refunds working from the deleted product snapshot", async () => {
    const { owner, t } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "DELETE-REFUND", name: "Refundable deleted stock", unit: "each", reorderPoint: 1, retailPrice: { amount: 1_000, currency: "JOD" } })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "receive", quantity: 1, unitCost: { amount: 400, currency: "JOD" }, idempotencyKey: "delete-refund-receive" }));
    const sale = await owner.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", guest: { fullName: "Deleted item guest", phone: "+962790000011" }, lines: [{ productId: product.id, quantity: 1 }], method: "card", externalReference: "DELETE-REFUND-CARD", idempotencyKey: "delete-refund-sale" })) as { retailSale: { id: string } };
    await owner.mutation(api.domain.mutate, operation("operations.product.delete", { productId: product.id, reason: "Retiring this retail item", confirmation: "DELETE-REFUND" }));
    const replacement = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "DELETE-REFUND", name: "Replacement retail stock", unit: "each", reorderPoint: 1 })) as { id: string };
    expect(replacement.id).not.toBe(product.id);
    const refunded = await owner.mutation(api.domain.mutate, operation("operations.retail.refund", { saleId: sale.retailSale.id, lines: [{ productId: product.id, quantity: 1 }], reason: "Customer returned the retired item", idempotencyKey: "delete-refund-action" })) as { retailSale: { status: string } };
    expect(refunded.retailSale.status).toBe("refunded");
    const remaining = await owner.query(api.domain.query, operation("operations.inventory.list", { branchId: "operations-branch-a" })) as Array<{ productId: string; availableQuantity: number }>;
    // Returned units remain as immutable tombstone evidence, never as sellable
    // inventory for the deleted identity or a replacement reusing its SKU.
    expect(remaining.some((row) => row.productId === product.id)).toBe(false);
    expect(remaining.some((row) => row.productId === replacement.id)).toBe(false);
    const state = await t.run(async (ctx) => {
      const returnMovement = (await ctx.db.query("stockMovements").withIndex("by_organization").collect()).find((movement) => movement.type === "return");
      const tombstone = (await ctx.db.query("productTombstones").withIndex("by_organization").collect()).find((row) => row.productPublicId === product.id);
      const tombstoneBalance = tombstone ? (await ctx.db.query("inventoryBalances").withIndex("by_organization").collect()).find((balance) => String(balance.productId) === tombstone.originalProductId) : undefined;
      return { returnMovement, tombstoneBalance };
    });
    expect(state.returnMovement).toMatchObject({ productId: expect.anything(), productSku: "DELETE-REFUND", unitCostMinor: 400, unitCostCurrency: "JOD" });
    expect(state.tombstoneBalance).toMatchObject({ quantityOnHand: 1, sellable: false });
  });
});

describe("anonymous walk-in checkout", () => {
  it("sells to a walk-in customer without creating any customer record and keeps member attach optional", async () => {
    const { owner, sales, t } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "WALKIN-01", name: "Water bottle", unit: "each", reorderPoint: 1, retailPrice: { amount: 1_500, currency: "JOD" } })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "receive", quantity: 5, unitCost: { amount: 400, currency: "JOD" }, idempotencyKey: "walkin-opening" }));
    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", organization!._id).eq("publicId", "operations-branch-a")).unique();
      const user = await ctx.db.query("users").withIndex("by_public_id", (q) => q.eq("publicId", "operations-sales")).unique();
      await ctx.db.insert("domainRecords", { organizationId: organization!._id, entityType: "shift", publicId: "walkin-shift", branchId: branch!._id, createdAt: Date.now(), updatedAt: Date.now(), data: { id: "walkin-shift", branchId: "operations-branch-a", status: "open", openedById: user!.publicId, openingFloat: { amount: 0, currency: "JOD" } } });
    });
    const recordsBefore = await t.run(async (ctx) => (await ctx.db.query("domainRecords").collect()).filter((record) => ["member", "lead", "customer"].includes(record.entityType)).length);

    const sale = await sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", lines: [{ productId: product.id, quantity: 2 }], method: "cash", idempotencyKey: "walkin-cash" })) as { receiptId: string; retailSale: { id: string; customer: { kind: string; fullName: string; memberId?: string; phone?: string }; total: { amount: number }; shiftId?: string } };
    expect(sale.retailSale).toMatchObject({ customer: { kind: "walk_in", fullName: "Walk-in customer" }, total: { amount: 3_000 }, shiftId: "walkin-shift" });
    expect(sale.retailSale.customer.memberId).toBeUndefined();
    expect(sale.retailSale.customer.phone).toBeUndefined();

    const receipt = await sales.query(api.domain.query, operation("receipts.get", { receiptId: sale.receiptId })) as { member?: unknown; customer: { kind: string; fullName: string }; retailSale: { lines: Array<{ quantity: number }> } };
    expect(receipt).toMatchObject({ customer: { kind: "walk_in", fullName: "Walk-in customer" }, retailSale: { lines: [{ quantity: 2 }] } });
    expect(receipt.member).toBeUndefined();

    const recordsAfter = await t.run(async (ctx) => (await ctx.db.query("domainRecords").collect()).filter((record) => ["member", "lead", "customer"].includes(record.entityType)).length);
    expect(recordsAfter).toBe(recordsBefore);
    const replay = await sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", lines: [{ productId: product.id, quantity: 2 }], method: "cash", idempotencyKey: "walkin-cash" })) as { receiptId: string };
    expect(replay.receiptId).toBe(sale.receiptId);

    const shift = await owner.query(api.domain.query, operation("shifts.current", { branchId: "operations-branch-a" })) as { totals: { cashPayments: { amount: number }; paymentCount: number } };
    expect(shift.totals).toMatchObject({ cashPayments: { amount: 3_000 }, paymentCount: 1 });
    const inventory = await sales.query(api.domain.query, operation("operations.inventory.list", { branchId: "operations-branch-a", productId: product.id })) as Array<{ availableQuantity: number }>;
    expect(inventory[0]?.availableQuantity).toBe(3);
    const transactions = await owner.query(api.domain.query, operation("transactions.list", { branchId: "operations-branch-a", type: "retail_sale" })) as { items: Array<{ memberName: string; memberNumber: string; customer?: { kind: string } }> };
    expect(transactions.items).toEqual([expect.objectContaining({ memberName: "Walk-in customer", memberNumber: "Walk-in", customer: expect.objectContaining({ kind: "walk_in" }) })]);
    const audits = await t.run(async (ctx) => (await ctx.db.query("auditEvents").collect()).filter((event) => event.action === "operations.retail_sale.create"));
    expect(audits).toHaveLength(1);
    expect(audits[0]?.after).toMatchObject({ customer: "walk_in", method: "cash" });

    await t.run(async (ctx) => {
      const organization = await ctx.db.query("organizations").withIndex("by_public_id", (q) => q.eq("publicId", "operations-org-a")).unique();
      await ctx.db.patch(organization!._id, { subscriptionPlan: "Pro", updatedAt: Date.now() });
    });
    const refreshed = await owner.mutation(api.domain.mutate, operation("accounting.source_postings.refresh", { sourceTypes: ["payment"] })) as { items: Array<{ sourceId: string; status: string; policyCode?: string }> };
    expect(refreshed.items.find((item) => item.sourceId === `retail-payment-${sale.retailSale.id}`)).toMatchObject({ status: "pending", policyCode: "retail-sale-cash.v2" });

    // Attaching a member remains optional and both-at-once is still rejected.
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", memberId: "someone", guest: { fullName: "Guest", phone: "+962790000009" }, lines: [{ productId: product.id, quantity: 1 }], method: "cash", idempotencyKey: "walkin-both" })), "VALIDATION_ERROR");
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", lines: [{ productId: product.id, quantity: 1 }], method: "card", idempotencyKey: "walkin-card-no-ref" })), "VALIDATION_ERROR");
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.retail.checkout", { branchId: "operations-branch-a", lines: [{ productId: product.id, quantity: 4 }], method: "cash", idempotencyKey: "walkin-overstock" })), "CONFLICT");
  });
});
