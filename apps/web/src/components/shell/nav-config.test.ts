import { describe, expect, it } from "vitest";
import { buildWorkspaceAccess, entitledModulesForPlan, WORKSPACE_MODULE_CATALOG_VERSION } from "@/lib/domain/workspace-modules";
import type { Session } from "@/lib/domain/types";
import { NAV_SECTIONS, navItemIsVisible } from "./nav-config";

describe("primary workspace navigation", () => {
  it("keeps one simple entry point for each core workflow", () => {
    const items = NAV_SECTIONS.flatMap((section) => section.items);
    expect(items.map((item) => item.label)).toEqual([
      "Dashboard",
      "Reception",
      "Checkout",
      "Daily checklist",
      "Members",
      "Classes",
      "Personal training",
      "Stock & purchasing",
      "Leads",
      "Follow-ups",
      "Payments",
      "Reports",
      "Statements",
      "Audit log",
      "Data exports",
      "Support",
      "Settings",
    ]);
  });

  it("keeps the remaining secondary and deferred routes out of the primary navigation", () => {
    const hrefs = NAV_SECTIONS.flatMap((section) => section.items).map((item) => item.href);
    expect(hrefs).not.toEqual(expect.arrayContaining([
      "/memberships",
      "/plans",
      "/payments/shifts",
      "/automations",
    ]));
    expect(hrefs.some((href) => href.includes("facilit"))).toBe(false);
    expect(NAV_SECTIONS.flatMap((section) => section.items).map((item) => item.label).some((label) => /facilit|automation/i.test(label))).toBe(false);
  });

  it("filters capability routes using the server-owned workspace state", () => {
    const items = NAV_SECTIONS.flatMap((section) => section.items);
    const operations = items.find((item) => item.href === "/operations");
    const finance = items.find((item) => item.href === "/finance");
    const access = (plan: "Starter" | "Pro"): Session["workspace"] => buildWorkspaceAccess(
      { organizationId: "org-1", catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, subscriptionPlan: plan, entitledModules: entitledModulesForPlan(plan), source: "subscription_plan" },
      { organizationId: "org-1", catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, enabledModules: entitledModulesForPlan(plan) },
    );
    const starter: Pick<Session, "permissions" | "workspace"> = { permissions: ["members.read", "reports.financial.read"], workspace: access("Starter") };
    const pro: Pick<Session, "permissions" | "workspace"> = { permissions: ["members.read", "reports.financial.read"], workspace: access("Pro") };

    expect(operations).toBeDefined();
    expect(finance).toBeDefined();
    expect(finance?.moduleKey).toBe("reporting");
    expect(navItemIsVisible(operations!, starter)).toBe(false);
    expect(navItemIsVisible(finance!, starter)).toBe(false);
    expect(navItemIsVisible(operations!, pro)).toBe(true);
    expect(navItemIsVisible(finance!, pro)).toBe(true);
  });

  it("keeps statements in their own primary navigation section", () => {
    const finance = NAV_SECTIONS.find((section) => section.label === "Finance");
    const ledger = NAV_SECTIONS.find((section) => section.label === "Management ledger");

    expect(finance?.items.some((item) => item.href === "/finance")).toBe(false);
    expect(finance?.items.map((item) => item.href)).toEqual(["/payments", "/reports"]);
    expect(ledger?.items).toEqual(expect.arrayContaining([expect.objectContaining({ href: "/finance", label: "Statements" })]));
  });

  it("does not hide legacy routes while the workspace capability snapshot is absent", () => {
    const finance = NAV_SECTIONS.flatMap((section) => section.items).find((item) => item.href === "/finance");
    expect(finance).toBeDefined();
    expect(navItemIsVisible(finance!, { permissions: ["reports.financial.read"] })).toBe(true);
  });
});
