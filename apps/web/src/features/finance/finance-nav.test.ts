import { describe, expect, it } from "vitest";
import { buildWorkspaceAccess, entitledModulesForPlan } from "@/lib/domain/workspace-modules";
import type { Session } from "@/lib/domain/types";
import { FINANCE_LINKS, financeLinkIsVisible } from "./finance-nav";

function sessionFor(plan: "Starter" | "Growth" | "Pro" | "Enterprise"): Pick<Session, "permissions" | "workspace"> {
  const entitledModules = entitledModulesForPlan(plan);
  return {
    permissions: ["reports.financial.read"],
    workspace: buildWorkspaceAccess(
      { organizationId: "org-1", catalogVersion: 1, subscriptionPlan: plan, entitledModules, source: "subscription_plan" },
      { organizationId: "org-1", catalogVersion: 1, enabledModules: entitledModules },
    ),
  };
}

describe("finance secondary navigation", () => {
  it("keeps operational reports visible while hiding Pro management statements below Pro", () => {
    const reports = FINANCE_LINKS.find((item) => item.href === "/reports");
    const statements = FINANCE_LINKS.find((item) => item.href === "/reports/statements");
    expect(reports).toBeDefined();
    expect(statements).toBeDefined();

    expect(financeLinkIsVisible(reports!, sessionFor("Starter"))).toBe(true);
    expect(financeLinkIsVisible(statements!, sessionFor("Starter"))).toBe(false);
    expect(financeLinkIsVisible(statements!, sessionFor("Growth"))).toBe(false);
    expect(financeLinkIsVisible(statements!, sessionFor("Pro"))).toBe(true);
    expect(financeLinkIsVisible(statements!, sessionFor("Enterprise"))).toBe(true);
  });

  it("keeps legacy sessions compatible when the workspace snapshot is absent", () => {
    const statements = FINANCE_LINKS.find((item) => item.href === "/reports/statements");
    expect(statements).toBeDefined();
    // Legacy sessions with no explicit entitlement snapshot remain compatible;
    // the backend still enforces the module if a user reaches the route.
    expect(financeLinkIsVisible(statements!, { permissions: ["reports.financial.read"] })).toBe(true);
  });

  it("requires the role permission even for an entitled Pro module", () => {
    const statements = FINANCE_LINKS.find((item) => item.href === "/reports/statements");
    const pro = sessionFor("Pro");
    expect(financeLinkIsVisible(statements!, { ...pro, permissions: [] })).toBe(false);
  });
});
