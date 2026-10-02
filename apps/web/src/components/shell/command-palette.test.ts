import { describe, expect, it } from "vitest";
import { buildWorkspaceAccess, entitledModulesForPlan, WORKSPACE_MODULE_CATALOG_VERSION } from "@/lib/domain/workspace-modules";
import { canOpenManagementLedgerFromSession } from "./command-palette";

function sessionFor(plan: "Starter" | "Pro", permissions: string[] = ["reports.financial.read"]) {
  return {
    permissions,
    workspace: buildWorkspaceAccess(
      {
        organizationId: "org-1",
        catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
        subscriptionPlan: plan,
        entitledModules: entitledModulesForPlan(plan),
        source: "subscription_plan",
      },
      {
        organizationId: "org-1",
        catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
        enabledModules: entitledModulesForPlan(plan),
      },
    ),
  };
}

describe("command palette management ledger gate", () => {
  it("requires both reporting entitlement and the financial-report permission", () => {
    expect(canOpenManagementLedgerFromSession(sessionFor("Starter"))).toBe(false);
    expect(canOpenManagementLedgerFromSession(sessionFor("Pro"))).toBe(true);
    expect(canOpenManagementLedgerFromSession(sessionFor("Pro", []))).toBe(false);
  });

  it("does not advertise a ledger route before workspace access is known", () => {
    expect(canOpenManagementLedgerFromSession({ permissions: ["reports.financial.read"] })).toBe(false);
    expect(canOpenManagementLedgerFromSession(undefined)).toBe(false);
  });
});
