import { beforeEach, describe, expect, it } from "vitest";
import { ERR } from "@/lib/api/errors";
import { MockGymOSApi } from "./MockGymOSApi";

let api: MockGymOSApi;

beforeEach(async () => {
  api = new MockGymOSApi();
  api.setBehavior({ latencyMs: 0 });
  await api.switchDemoRole("owner");
});

describe("mock daily operations parity", () => {
  it("uses explicit write permissions for manager actions and keeps auditor read-only", async () => {
    const managerSession = await api.switchDemoRole("manager");
    expect(managerSession.permissions).toEqual(expect.arrayContaining(["operations.manage", "accounting.post"]));
    const managerPermissions = [...managerSession.permissions];

    await api.switchDemoRole("owner");
    await api.updateRolePermissions("manager", { permissions: ["operations.manage", "accounting.post"] });
    await api.switchDemoRole("manager");
    await expect(api.upsertProduct({ sku: "WRITE-ONLY", name: "Write-only stock", unit: "each", reorderPoint: 1, targetLevel: 2, supplierLeadTimeDays: 1 })).resolves.toBeDefined();
    await expect(api.refreshAccountingSourceQueue()).resolves.toBeDefined();

    await api.switchDemoRole("owner");
    await api.updateRolePermissions("manager", { permissions: managerPermissions.filter((permission) => permission !== "operations.manage") });
    await api.switchDemoRole("manager");
    await expect(api.upsertProduct({ sku: "NO-OPERATIONS", name: "Blocked stock", unit: "each", reorderPoint: 1, targetLevel: 2, supplierLeadTimeDays: 1 })).rejects.toMatchObject({ code: ERR.FORBIDDEN });

    await api.switchDemoRole("owner");
    await api.updateRolePermissions("manager", { permissions: managerPermissions.filter((permission) => permission !== "accounting.post") });
    await api.switchDemoRole("manager");
    await expect(api.refreshAccountingSourceQueue()).rejects.toMatchObject({ code: ERR.FORBIDDEN });

    await api.switchDemoRole("auditor");
    await expect(api.listAccountingAccounts()).resolves.toBeDefined();
    await expect(api.upsertProduct({ sku: "AUDITOR", name: "Blocked stock", unit: "each", reorderPoint: 1, targetLevel: 2, supplierLeadTimeDays: 1 })).rejects.toMatchObject({ code: ERR.FORBIDDEN });
    await expect(api.refreshAccountingSourceQueue()).rejects.toMatchObject({ code: ERR.FORBIDDEN });
  });

  it("returns deterministic seeded inventory, facility, and equipment records", async () => {
    const products = await api.listProducts();
    expect(products).toEqual(expect.arrayContaining([expect.objectContaining({ sku: "SUP-CREATINE" })]));
    expect((await api.listFacilityTasks()).at(0)).toMatchObject({ kind: "cleaning", zoneId: expect.any(String) });
    expect((await api.listEquipmentAssets()).at(0)).toMatchObject({ code: "TREAD-01", issueCount: 1 });
  });

  it("enforces manager writes and movement idempotency", async () => {
    const product = (await api.listProducts()).find((item) => item.sku === "SUP-PROTEIN")!;
    await api.switchDemoRole("salesperson");
    await expect(api.recordStockMovement({ branchId: (await api.getSession()).branches[0]!.id, productId: product.id, type: "sale", quantity: 1, idempotencyKey: "mock-denied" })).rejects.toMatchObject({ code: ERR.FORBIDDEN });
    await api.switchDemoRole("owner");
    const branchId = (await api.getSession()).branches[0]!.id;
    const first = await api.recordStockMovement({ branchId, productId: product.id, type: "receive", quantity: 2, idempotencyKey: "mock-movement" });
    const second = await api.recordStockMovement({ branchId, productId: product.id, type: "receive", quantity: 2, idempotencyKey: "mock-movement" });
    expect(second.id).toBe(first.id);
    expect((await api.listStockMovements({ branchId })).items.filter((item) => item.id === first.id)).toHaveLength(1);
  });

  it("keeps recommendation explicitly unavailable when inputs are missing", async () => {
    const asset = await api.upsertEquipmentAsset({ branchId: (await api.getSession()).branches[0]!.id, code: "NEW-01", name: "New asset" });
    const recommendation = await api.getEquipmentRecommendation(asset.id);
    expect(recommendation).toMatchObject({ decision: "insufficient_data", confidence: "recorded_inputs_only" });
    expect(recommendation.rationale.join(" ")).toMatch(/repair cost|replacement estimate|purchase date|useful life/i);
  });

  it("approves and receives a seeded mock purchase order idempotently", async () => {
    const branchId = (await api.getSession()).branches[0]!.id;
    const product = (await api.listProducts()).find((item) => item.sku === "SUP-PROTEIN")!;
    const supplier = (await api.listSuppliers()).at(0)!;
    const order = await api.createPurchaseOrder({ branchId, supplierId: supplier.id, lines: [{ productId: product.id, quantity: 3, unitCost: { amount: 500, currency: "JOD" } }] });
    await api.approvePurchaseOrder(order.id);
    const received = await api.receivePurchaseOrder({ purchaseOrderId: order.id, lines: [{ productId: product.id, quantity: 1 }], idempotencyKey: "mock-po-receive" });
    const replay = await api.receivePurchaseOrder({ purchaseOrderId: order.id, lines: [{ productId: product.id, quantity: 1 }], idempotencyKey: "mock-po-receive" });
    expect(received.status).toBe("partially_received");
    expect(replay.lines[0]?.receivedQuantity).toBe(1);
  });

  it("protects posted source facts, rejects asset branch reassignment, and requires adjustment reasons", async () => {
    const session = await api.getSession();
    const branchA = session.branches[0]!;
    const branchB = session.branches[1]!;
    const seededTask = (await api.listFacilityTasks({ branchId: branchA.id }))[0]!;
    const postedTask = await api.upsertFacilityTask({ branchId: branchA.id, zoneId: seededTask.zoneId, kind: "cleaning", severity: "medium", status: "completed", title: "Mock posted task", suppliesCost: { amount: 500, currency: "JOD" } });
    await api.postAccountingSource({ sourceType: "facility_supplies", sourceId: postedTask.id, idempotencyKey: "mock-posted-facility" });
    const renamedTask = await api.upsertFacilityTask({ id: postedTask.id, branchId: branchA.id, zoneId: postedTask.zoneId, kind: postedTask.kind, severity: postedTask.severity, title: "Mock posted task renamed" });
    expect(renamedTask).toMatchObject({ title: "Mock posted task renamed", suppliesCost: { amount: 500 } });
    await expect(api.upsertFacilityTask({ id: postedTask.id, branchId: branchA.id, zoneId: postedTask.zoneId, kind: postedTask.kind, severity: postedTask.severity, title: "Mock cost change", suppliesCost: { amount: 600, currency: "JOD" } })).rejects.toMatchObject({ code: ERR.CONFLICT });

    const asset = await api.upsertEquipmentAsset({ branchId: branchA.id, code: "MOCK-POSTED", name: "Mock posted asset", purchaseDate: "2025-01-01", purchaseCost: { amount: 10_000, currency: "JOD" } });
    await expect(api.upsertEquipmentAsset({ id: asset.id, branchId: branchB.id, code: "MOCK-POSTED", name: "Mock posted asset" })).rejects.toMatchObject({ code: ERR.CONFLICT });
    await api.postAccountingSource({ sourceType: "equipment_acquisition", sourceId: asset.id, idempotencyKey: "mock-posted-acquisition" });
    await expect(api.upsertEquipmentAsset({ id: asset.id, branchId: branchA.id, code: "MOCK-POSTED", name: "Mock posted asset", purchaseDate: "2025-01-01", purchaseCost: { amount: 11_000, currency: "JOD" } })).rejects.toMatchObject({ code: ERR.CONFLICT });

    const workOrder = await api.upsertEquipmentWorkOrder({ branchId: branchA.id, assetId: asset.id, status: "completed", description: "Mock posted repair", partsCost: { amount: 800, currency: "JOD" }, laborCost: { amount: 200, currency: "JOD" } });
    await api.postAccountingSource({ sourceType: "equipment_repair", sourceId: workOrder.id, idempotencyKey: "mock-posted-repair" });
    const renamedWorkOrder = await api.upsertEquipmentWorkOrder({ id: workOrder.id, branchId: branchA.id, assetId: asset.id, status: "completed", description: "Mock posted repair note" });
    expect(renamedWorkOrder).toMatchObject({ description: "Mock posted repair note", totalCost: { amount: 1_000 } });
    await expect(api.upsertEquipmentWorkOrder({ id: workOrder.id, branchId: branchA.id, assetId: asset.id, status: "completed", description: "Mock cost change", partsCost: { amount: 900, currency: "JOD" } })).rejects.toMatchObject({ code: ERR.CONFLICT });

    const product = (await api.listProducts()).find((item) => item.sku === "SUP-CREATINE")!;
    await expect(api.recordStockMovement({ branchId: branchA.id, productId: product.id, type: "adjustment", quantity: 1, idempotencyKey: "mock-adjustment-without-reason" })).rejects.toMatchObject({ code: ERR.VALIDATION });
    await expect(api.recordStockMovement({ branchId: branchA.id, productId: product.id, type: "adjustment", quantity: 1, reason: "Cycle count correction", idempotencyKey: "mock-adjustment-with-reason" })).resolves.toMatchObject({ reason: "Cycle count correction" });
  });
});
