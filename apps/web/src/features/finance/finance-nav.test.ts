import { describe, expect, it } from "vitest";
import { buildWorkspaceAccess, entitledModulesForPlan, WORKSPACE_MODULE_CATALOG_VERSION } from "@/lib/domain/workspace-modules";
import type { Session } from "@/lib/domain/types";
import { FINANCE_LINKS, financeLinkIsVisible } from "./finance-nav";

function sessionFor(plan: "Starter" | "Growth" | "Pro" | "Enterprise"): Pick<Session, "permissions" | "workspace"> {
  const entitledModules = entitledModulesForPlan(plan);
  return {
    permissions: ["reports.financial.read"],
    workspace: buildWorkspaceAccess(
      { organizationId: "org-1", catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, subscriptionPlan: plan, entitledModules, source: "subscription_plan" },
      { organizationId: "org-1", catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, enabledModules: entitledModules },
    ),
  };
}

describe("finance secondary navigation", () => {
  it("keeps only the closely related payments and cash-shift destinations", () => {
    expect(FINANCE_LINKS.map((item) => item.href)).toEqual(["/payments", "/payments/shifts"]);
    expect(FINANCE_LINKS.some((item) => item.href === "/reports")).toBe(false);
    expect(FINANCE_LINKS.some((item) => item.href === "/finance")).toBe(false);
    expect(FINANCE_LINKS.some((item) => item.href === "/reports/statements")).toBe(false);
  });

  it("keeps legacy sessions compatible when the workspace snapshot is absent", () => {
    const payments = FINANCE_LINKS.find((item) => item.href === "/payments");
    expect(payments).toBeDefined();
    // Legacy sessions with no explicit entitlement snapshot remain compatible;
    // the backend still enforces access if a user reaches a report route.
    expect(financeLinkIsVisible(payments!, { permissions: ["reports.financial.read"] })).toBe(true);
  });

  it("requires the role permission even for an entitled Pro module", () => {
    const payments = FINANCE_LINKS.find((item) => item.href === "/payments");
    const pro = sessionFor("Pro");
    expect(financeLinkIsVisible(payments!, { ...pro, permissions: [] })).toBe(false);
  });
});
