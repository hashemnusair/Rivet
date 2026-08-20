import { describe, expect, it } from "vitest";
import schema from "./schema";

describe("Convex persistence contract", () => {
  it("declares the tenant, commercial, audit, idempotency, and entry-pass tables", () => {
    const tables = Object.keys((schema as unknown as { tables: Record<string, unknown> }).tables);
    expect(tables).toEqual(expect.arrayContaining([
      "organizations",
      "organizationEntitlements",
      "workspaceModulePreferences",
      "branches",
      "zones",
      "products",
      "suppliers",
      "inventoryBalances",
      "stockMovements",
      "inventoryAlerts",
      "purchaseOrders",
      "facilityTasks",
      "equipmentAssets",
      "equipmentIssues",
      "equipmentWorkOrders",
      "users",
      "gymApplications",
      "platformAuditEvents",
      "organizationMemberships",
      "roleDefinitions",
      "domainRecords",
      "auditEvents",
      "idempotencyRecords",
      "sequenceCounters",
      "entryPasses",
    ]));
  });
});
