import { describe, expect, it } from "vitest";
import {
  buildWorkspaceAccess,
  defaultWorkspacePreferences,
  entitledModulesForPlan,
  validateWorkspaceModuleSelection,
  WORKSPACE_MODULE_CATALOG_VERSION,
  WORKSPACE_MODULE_CATALOG,
} from "./workspace-modules";

describe("workspace module catalog", () => {
  it("maps Starter, Growth, and Pro from the code-owned catalog", () => {
    expect(entitledModulesForPlan("Starter")).toEqual(["foundation", "revenue"]);
    expect(entitledModulesForPlan("Growth")).toEqual(["foundation", "revenue", "operations"]);
    expect(entitledModulesForPlan("Pro")).toEqual(["foundation", "revenue", "operations", "finance", "reporting"]);
  });

  it("keeps legacy tenants fully operational until a subscription plan exists", () => {
    expect(entitledModulesForPlan()).toEqual(WORKSPACE_MODULE_CATALOG.map((module) => module.key));
    expect(defaultWorkspacePreferences(entitledModulesForPlan())).toEqual(entitledModulesForPlan());
  });

  it("rejects unknown, unentitled, and dependency-breaking selections", () => {
    expect(() => validateWorkspaceModuleSelection(["foundation", "future"], entitledModulesForPlan("Starter"))).toThrow(/Unknown workspace module/);
    expect(() => validateWorkspaceModuleSelection(["foundation", "operations"], entitledModulesForPlan("Starter"))).toThrow(/not included/);
    expect(() => validateWorkspaceModuleSelection(["foundation", "reporting"], entitledModulesForPlan("Pro"))).toThrow(/requires finance/);
    expect(() => validateWorkspaceModuleSelection(["revenue"], entitledModulesForPlan("Starter"))).toThrow(/Required workspace module/);
  });

  it("reports entitlement and preference state independently", () => {
    const access = buildWorkspaceAccess(
      { organizationId: "org-1", catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, subscriptionPlan: "Growth", entitledModules: entitledModulesForPlan("Growth"), source: "subscription_plan" },
      { organizationId: "org-1", catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, enabledModules: ["foundation", "revenue"] },
    );
    expect(access.entitlements.entitledModules).toContain("operations");
    expect(access.preferences.enabledModules).not.toContain("operations");
    expect(access.modules.find((module) => module.key === "operations")).toMatchObject({ entitled: true, enabled: false });
    expect(access.modules.find((module) => module.key === "finance")).toMatchObject({ entitled: false, enabled: false, lockedReason: "not_entitled" });
  });
});
