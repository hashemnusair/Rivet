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
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branchA, branchB], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: manager, role: "manager", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: sales, role: "sales", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
  });
  return { t, owner: t.withIdentity({ subject: "clerk-operations-owner" }), manager: t.withIdentity({ subject: "clerk-operations-manager" }), sales: t.withIdentity({ subject: "clerk-operations-sales" }) };
}

describe("daily operations typed contracts", () => {
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
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "SUP-CREATINE", name: "Creatine", unit: "serving", reorderPoint: 5, targetLevel: 20, supplierLeadTimeDays: 5 })) as { id: string };
    await expectCode(sales.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "SUP-OTHER", name: "Other", unit: "each", reorderPoint: 1, targetLevel: 2, supplierLeadTimeDays: 1 })), "FORBIDDEN");
    await expectCode(manager.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-b", productId: product.id, type: "receive", quantity: 5, idempotencyKey: "branch-b-movement" })), "FORBIDDEN");
    const outOfScopeSupplier = await owner.mutation(api.domain.mutate, operation("operations.supplier.upsert", { name: "Second branch supplier", branchIds: ["operations-branch-b"], preferredProductIds: [product.id] })) as { id: string };
    const managerSuppliers = await manager.query(api.domain.query, operation("operations.suppliers.list")) as Array<{ id: string }>;
    expect(managerSuppliers.some((supplier) => supplier.id === outOfScopeSupplier.id)).toBe(false);
    await expectCode(manager.mutation(api.domain.mutate, operation("operations.supplier.archive", { id: outOfScopeSupplier.id, reason: "Scope regression test" })), "NOT_FOUND");
    await t.run(async (ctx) => {
      const now = Date.now();
      const foreignOrg = await ctx.db.insert("organizations", { publicId: "operations-org-b", name: "Operations B", slug: "operations-b", status: "active", subscriptionPlan: "Growth", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
      await ctx.db.insert("products", { organizationId: foreignOrg, publicId: "foreign-product", sku: "FOREIGN", name: "Foreign stock", unit: "each", reorderPoint: 1, targetLevel: 2, supplierLeadTimeDays: 1, status: "active", createdAt: now, updatedAt: now });
    });
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: "foreign-product", type: "receive", quantity: 1, idempotencyKey: "foreign-product-movement" })), "NOT_FOUND");
    const branchA = await manager.query(api.domain.query, operation("operations.inventory.list", { branchId: "operations-branch-a" })) as unknown[];
    expect(branchA).toEqual([]);
  });

  it("keeps stock movements idempotent and projects low stock", async () => {
    const { owner, t } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "SUP-CREATINE", name: "Creatine", unit: "serving", reorderPoint: 5, targetLevel: 20, supplierLeadTimeDays: 5 })) as { id: string };
    const received = await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "receive", quantity: 10, idempotencyKey: "movement-1", financialPostingStatus: "posted", financialSourceId: "forged-finance-source" })) as { id: string; quantityDelta: number; financialPostingStatus: string; financialSourceId?: string };
    expect(received).toMatchObject({ financialPostingStatus: "not_posted" });
    expect(received.financialSourceId).toBeUndefined();
    const replay = await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "receive", quantity: 10, idempotencyKey: "movement-1" })) as { id: string };
    expect(replay.id).toBe(received.id);
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "sale", quantity: 8, idempotencyKey: "movement-2" }));
    const alerts = await owner.query(api.domain.query, operation("operations.low_stock.list", { branchId: "operations-branch-a" })) as Array<{ productId: string; availableQuantity: number; projectedQuantityAtLeadTime: number }>;
    expect(alerts).toEqual([expect.objectContaining({ productId: product.id, availableQuantity: 2, projectedQuantityAtLeadTime: expect.closeTo(2 - (8 / 30) * 5, 8) })]);
    const movements = await t.run(async (ctx) => ctx.db.query("stockMovements").collect());
    expect(movements).toHaveLength(2);
  });

  it("approves and partially receives a purchase order without double receiving", async () => {
    const { owner, manager } = await seeded();
    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "SUP-PROTEIN", name: "Protein", unit: "each", reorderPoint: 5, targetLevel: 20, supplierLeadTimeDays: 3 })) as { id: string };
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

  it("links facilities and equipment to zones and reports missing recommendation data", async () => {
    const { owner, manager } = await seeded();
    const zone = await owner.mutation(api.domain.mutate, operation("zones.upsert", { branchId: "operations-branch-a", code: "CARDIO", name: "Cardio", kind: "cardio" })) as { id: string };
    const task = await manager.mutation(api.domain.mutate, operation("operations.facility_task.upsert", { branchId: "operations-branch-a", zoneId: zone.id, kind: "cleaning", severity: "medium", title: "Inspect floor", trafficContext: { occupancyPercent: 72 }, financialPostingStatus: "posted", financialSourceId: "forged-facility-source" })) as { zoneId: string; financialPostingStatus: string; financialSourceId?: string };
    expect(task.zoneId).toBe(zone.id);
    expect(task).toMatchObject({ financialPostingStatus: "not_posted" });
    expect(task.financialSourceId).toBeUndefined();
    const asset = await owner.mutation(api.domain.mutate, operation("operations.equipment_asset.upsert", { branchId: "operations-branch-a", zoneId: zone.id, code: "TREAD-01", name: "Treadmill" })) as { id: string };
    await owner.mutation(api.domain.mutate, operation("operations.equipment_issue.report", { branchId: "operations-branch-a", assetId: asset.id, title: "Noise", severity: "medium" }));
    const workOrder = await manager.mutation(api.domain.mutate, operation("operations.equipment_work_order.upsert", { branchId: "operations-branch-a", assetId: asset.id, description: "Inspect motor", partsCost: { amount: 100, currency: "JOD" }, financialPostingStatus: "posted", financialSourceId: "forged-work-order-source" })) as { financialPostingStatus: string; financialSourceId?: string };
    expect(workOrder).toMatchObject({ financialPostingStatus: "not_posted" });
    expect(workOrder.financialSourceId).toBeUndefined();
    const recommendation = await owner.query(api.domain.query, operation("operations.equipment.recommendation", { id: asset.id })) as { decision: string; rationale: string[] };
    expect(recommendation.decision).toBe("insufficient_data");
    expect(recommendation.rationale.join(" ")).toMatch(/replacement estimate|repair cost|purchase date|useful life/i);
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

    const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: "ADJUST-01", name: "Adjustment product", unit: "each", reorderPoint: 1, targetLevel: 2, supplierLeadTimeDays: 1 })) as { id: string };
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "adjustment", quantity: 1, idempotencyKey: "adjustment-without-reason" })), "VALIDATION_ERROR");
    const adjustment = await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "operations-branch-a", productId: product.id, type: "adjustment", quantity: 1, reason: "Cycle count correction", idempotencyKey: "adjustment-with-reason" })) as { reason?: string };
    expect(adjustment.reason).toBe("Cycle count correction");
  });
});
