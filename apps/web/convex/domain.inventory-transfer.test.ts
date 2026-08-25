import { describe, expect, it } from "vitest";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

declare global { interface ImportMeta { glob(pattern: string): Record<string, () => Promise<unknown>>; } }
const modules = import.meta.glob("./**/*.ts");
const operation = (name: string, input: Record<string, unknown> = {}) => ({ operation: name, input, correlationId: `cor-inventory-transfer-${name}` });
const expectCode = async (request: Promise<unknown>, code: string) => { await expect(request).rejects.toMatchObject({ data: expect.objectContaining({ code }) }); };
type TransferActor = ReturnType<TestConvex<typeof schema>["withIdentity"]>;

async function seeded() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const now = Date.now();
    const organization = await ctx.db.insert("organizations", { publicId: "transfer-org", name: "Transfer Gym", slug: "transfer-gym", status: "active", subscriptionPlan: "Growth", timezone: "UTC", currency: "JOD", createdAt: now, updatedAt: now });
    const branchA = await ctx.db.insert("branches", { organizationId: organization, publicId: "transfer-branch-a", name: "Source", code: "SRC", active: true, status: "active", createdAt: now, updatedAt: now });
    const branchB = await ctx.db.insert("branches", { organizationId: organization, publicId: "transfer-branch-b", name: "Destination", code: "DST", active: true, status: "active", createdAt: now, updatedAt: now });
    const owner = await ctx.db.insert("users", { publicId: "transfer-owner", authSubject: "clerk-transfer-owner", email: "transfer-owner@example.test", fullName: "Transfer Owner", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    const manager = await ctx.db.insert("users", { publicId: "transfer-manager", authSubject: "clerk-transfer-manager", email: "transfer-manager@example.test", fullName: "Transfer Manager", platformAdmin: false, status: "active", createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: owner, role: "owner", branchIds: [branchA, branchB], branchScope: "all", active: true, createdAt: now, updatedAt: now });
    await ctx.db.insert("organizationMemberships", { organizationId: organization, userId: manager, role: "manager", branchIds: [branchA], branchScope: "selected", active: true, createdAt: now, updatedAt: now });
  });
  return { t, owner: t.withIdentity({ subject: "clerk-transfer-owner" }), manager: t.withIdentity({ subject: "clerk-transfer-manager" }) };
}

async function productWithStock(owner: TransferActor, quantity = 10) {
  const product = await owner.mutation(api.domain.mutate, operation("operations.product.upsert", { sku: `TRANSFER-${quantity}`, name: "Transfer item", unit: "each", reorderPoint: 1, retailPrice: { amount: 1_000, currency: "JOD" } })) as { id: string };
  await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "transfer-branch-a", productId: product.id, type: "receive", quantity, unitCost: { amount: 400, currency: "JOD" }, idempotencyKey: `transfer-opening-${quantity}` }));
  return product;
}

describe("inventory branch transfers", () => {
  it("moves one product atomically, links the pair, and replays without duplication", async () => {
    const { owner, t } = await seeded();
    const product = await productWithStock(owner, 10);
    const input = { sourceBranchId: "transfer-branch-a", destinationBranchId: "transfer-branch-b", productId: product.id, quantity: 4, reason: "Restock destination branch", idempotencyKey: "transfer-success" };
    const first = await owner.mutation(api.domain.mutate, operation("operations.inventory.transfer", input)) as { id: string; sourceAvailableQuantity: number; destinationAvailableQuantity: number; sourceMovement: { id: string; type: string; referenceId?: string; totalCost?: { amount: number } }; destinationMovement: { id: string; type: string; referenceId?: string; totalCost?: { amount: number } }; status: string; sourceMovementId: string; destinationMovementId: string };
    const replay = await owner.mutation(api.domain.mutate, operation("operations.inventory.transfer", input)) as typeof first;
    expect(first).toMatchObject({ id: expect.any(String), status: "completed", sourceMovementId: expect.any(String), destinationMovementId: expect.any(String), sourceAvailableQuantity: 6, destinationAvailableQuantity: 4, sourceMovement: { type: "transfer_out", totalCost: { amount: 1600 } }, destinationMovement: { type: "transfer_in", totalCost: { amount: 1600 } } });
    expect(first.sourceMovement.referenceId).toBe(first.id);
    expect(first.destinationMovement.referenceId).toBe(first.id);
    expect(replay.id).toBe(first.id);
    const source = await owner.query(api.domain.query, operation("operations.inventory.list", { branchId: "transfer-branch-a", productId: product.id })) as Array<{ availableQuantity: number }>;
    const destination = await owner.query(api.domain.query, operation("operations.inventory.list", { branchId: "transfer-branch-b", productId: product.id })) as Array<{ availableQuantity: number }>;
    expect(source[0]?.availableQuantity).toBe(6);
    expect(destination[0]?.availableQuantity).toBe(4);
    const facts = await t.run(async (ctx) => ({ movements: await ctx.db.query("stockMovements").withIndex("by_organization").collect(), audits: await ctx.db.query("auditEvents").collect() }));
    const pair = facts.movements.filter((movement) => movement.referenceType === "inventory_transfer" && movement.referenceId === first.id);
    expect(pair).toHaveLength(2);
    expect(facts.audits.filter((audit) => audit.action === "operations.inventory.transfer" && audit.entityPublicId === first.id)).toEqual([expect.objectContaining({ destinationBranchId: expect.anything() })]);
    const aggregate = await t.run(async (ctx) => ctx.db.query("inventoryTransfers").withIndex("by_organization").collect());
    expect(aggregate).toEqual([expect.objectContaining({ publicId: first.id, status: "completed", sourceMovementId: first.sourceMovementId, destinationMovementId: first.destinationMovementId, totalCostMinor: 1600 })]);
  });

  it("conserves exact moving-average valuation and replays after lifecycle changes", async () => {
    const { owner, t } = await seeded();
    const product = await productWithStock(owner, 1);
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "transfer-branch-a", productId: product.id, type: "receive", quantity: 2, unitCost: { amount: 333, currency: "JOD" }, idempotencyKey: "transfer-fractional-a" }));
    await owner.mutation(api.domain.mutate, operation("operations.stock_movement.record", { branchId: "transfer-branch-a", productId: product.id, type: "receive", quantity: 2, unitCost: { amount: 334, currency: "JOD" }, idempotencyKey: "transfer-fractional-b" }));
    const input = { sourceBranchId: "transfer-branch-a", destinationBranchId: "transfer-branch-b", productId: product.id, quantity: 2, reason: "Balance fractional valuation", idempotencyKey: "transfer-fractional" };
    const first = await owner.mutation(api.domain.mutate, operation("operations.inventory.transfer", input)) as { id: string; totalCost: { amount: number }; sourceMovement: { totalCost: { amount: number } } };
    expect(first.totalCost.amount).toBe(693);
    // The movement pair is the durable conservation assertion.
    const facts = await t.run(async (ctx) => {
      const movements = await ctx.db.query("stockMovements").withIndex("by_organization").collect();
      const transfers = await ctx.db.query("inventoryTransfers").withIndex("by_organization").collect();
      const branches = await ctx.db.query("branches").withIndex("by_organization").collect();
      const productRow = (await ctx.db.query("products").withIndex("by_organization").collect()).find((row) => row.publicId === product.id)!;
      const balances = await ctx.db.query("inventoryBalances").withIndex("by_organization").collect();
      return { movements, transfers, balances: balances.filter((row) => row.productId === productRow._id).map((row) => ({ branchId: branches.find((branch) => branch._id === row.branchId)?.publicId, quantityOnHand: row.quantityOnHand, totalCostMinor: row.totalCostMinor })) };
    });
    const pair = facts.movements.filter((movement) => movement.referenceId === first.id);
    expect(pair.map((movement) => movement.totalCostMinor)).toEqual([693, 693]);
    expect(facts.transfers[0]).toMatchObject({ totalCostMinor: 693 });
    expect(facts.balances).toEqual(expect.arrayContaining([{ branchId: "transfer-branch-a", quantityOnHand: 3, totalCostMinor: 1041 }, { branchId: "transfer-branch-b", quantityOnHand: 2, totalCostMinor: 693 }]));
    await t.run(async (ctx) => {
      const branches = await ctx.db.query("branches").withIndex("by_organization").collect();
      const productRow = await ctx.db.query("products").withIndex("by_organization").collect();
      await ctx.db.patch(branches.find((branch) => branch.publicId === "transfer-branch-a")!._id, { active: false, status: "inactive" });
      await ctx.db.patch(branches.find((branch) => branch.publicId === "transfer-branch-b")!._id, { active: false, status: "inactive" });
      await ctx.db.patch(productRow.find((row) => row.publicId === product.id)!._id, { status: "archived", updatedAt: Date.now() });
    });
    const replay = await owner.mutation(api.domain.mutate, operation("operations.inventory.transfer", input)) as { id: string };
    expect(replay.id).toBe(first.id);
  });

  it("cleans expired transfer idempotency records before reusing a key", async () => {
    const { owner, t } = await seeded();
    const product = await productWithStock(owner, 10);
    const input = { sourceBranchId: "transfer-branch-a", destinationBranchId: "transfer-branch-b", productId: product.id, quantity: 2, reason: "Expired retry", idempotencyKey: "transfer-expired" };
    const first = await owner.mutation(api.domain.mutate, operation("operations.inventory.transfer", input)) as { id: string };
    await t.run(async (ctx) => {
      const organization = (await ctx.db.query("organizations").collect())[0]!;
      const rows = await ctx.db.query("idempotencyRecords").withIndex("by_organization_operation_key", (q) => q.eq("organizationId", organization._id).eq("operation", "operations.inventory.transfer").eq("key", input.idempotencyKey)).collect();
      await ctx.db.patch(rows[0]!._id, { expiresAt: Date.now() - 1 });
    });
    const second = await owner.mutation(api.domain.mutate, operation("operations.inventory.transfer", input)) as { id: string };
    expect(second.id).not.toBe(first.id);
  });

  it("rejects same-branch, insufficient, foreign, and out-of-scope transfers before mutation", async () => {
    const { owner, manager, t } = await seeded();
    const product = await productWithStock(owner, 3);
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.inventory.transfer", { sourceBranchId: "transfer-branch-a", destinationBranchId: "transfer-branch-a", productId: product.id, quantity: 1, reason: "Same branch", idempotencyKey: "transfer-same" })), "VALIDATION_ERROR");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.inventory.transfer", { sourceBranchId: "transfer-branch-a", destinationBranchId: "transfer-branch-b", productId: product.id, quantity: 4, reason: "Too much", idempotencyKey: "transfer-too-much" })), "CONFLICT");
    await expectCode(owner.mutation(api.domain.mutate, operation("operations.inventory.transfer", { sourceBranchId: "transfer-branch-a", destinationBranchId: "foreign-branch", productId: product.id, quantity: 1, reason: "Foreign branch", idempotencyKey: "transfer-foreign" })), "NOT_FOUND");
    await expectCode(manager.mutation(api.domain.mutate, operation("operations.inventory.transfer", { sourceBranchId: "transfer-branch-a", destinationBranchId: "transfer-branch-b", productId: product.id, quantity: 1, reason: "Out of scope", idempotencyKey: "transfer-scope" })), "FORBIDDEN");
    const movements = await t.run(async (ctx) => ctx.db.query("stockMovements").withIndex("by_organization").collect());
    expect(movements.filter((movement) => movement.referenceType === "inventory_transfer")).toHaveLength(0);
  });

  it("serializes concurrent transfers so stock cannot go negative or partially transfer", async () => {
    const { owner } = await seeded();
    const product = await productWithStock(owner, 5);
    const results = await Promise.allSettled([
      owner.mutation(api.domain.mutate, operation("operations.inventory.transfer", { sourceBranchId: "transfer-branch-a", destinationBranchId: "transfer-branch-b", productId: product.id, quantity: 4, reason: "Concurrent transfer one", idempotencyKey: "transfer-concurrent-1" })),
      owner.mutation(api.domain.mutate, operation("operations.inventory.transfer", { sourceBranchId: "transfer-branch-a", destinationBranchId: "transfer-branch-b", productId: product.id, quantity: 4, reason: "Concurrent transfer two", idempotencyKey: "transfer-concurrent-2" })),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const inventory = await owner.query(api.domain.query, operation("operations.inventory.list", { productId: product.id })) as Array<{ branchId: string; availableQuantity: number }>;
    expect(inventory).toEqual(expect.arrayContaining([expect.objectContaining({ branchId: "transfer-branch-a", availableQuantity: 1 }), expect.objectContaining({ branchId: "transfer-branch-b", availableQuantity: 4 })]));
  });
});
