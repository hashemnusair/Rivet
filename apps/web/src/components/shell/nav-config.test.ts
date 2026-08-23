import { describe, expect, it } from "vitest";
import { buildWorkspaceAccess, entitledModulesForPlan } from "@/lib/domain/workspace-modules";
import type { Session } from "@/lib/domain/types";
import { NAV_SECTIONS, navItemIsVisible } from "./nav-config";

describe("primary workspace navigation", () => {
  it("keeps one simple entry point for each core workflow", () => {
    const items = NAV_SECTIONS.flatMap((section) => section.items);
    expect(items.map((item) => item.label)).toEqual([
      "Dashboard",
      "Reception",
      "Members",
      "Personal training",
      "Operations",
      "Leads",
      "Follow-ups",
      "Payments",
      "Management ledger",
      "Audit log",
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
      "/reports",
      "/automations",
    ]));
  });

  it("filters capability routes using the server-owned workspace state", () => {
    const items = NAV_SECTIONS.flatMap((section) => section.items);
    const operations = items.find((item) => item.href === "/operations");
    const finance = items.find((item) => item.href === "/finance");
    const access = (plan: "Starter" | "Pro"): Session["workspace"] => buildWorkspaceAccess(
      { organizationId: "org-1", catalogVersion: 1, subscriptionPlan: plan, entitledModules: entitledModulesForPlan(plan), source: "subscription_plan" },
      { organizationId: "org-1", catalogVersion: 1, enabledModules: entitledModulesForPlan(plan) },
    );
    const starter: Pick<Session, "permissions" | "workspace"> = { permissions: ["members.read", "reports.financial.read"], workspace: access("Starter") };
    const pro: Pick<Session, "permissions" | "workspace"> = { permissions: ["members.read", "reports.financial.read"], workspace: access("Pro") };

    expect(operations).toBeDefined();
    expect(finance).toBeDefined();
    expect(navItemIsVisible(operations!, starter)).toBe(false);
    expect(navItemIsVisible(finance!, starter)).toBe(false);
    expect(navItemIsVisible(operations!, pro)).toBe(true);
    expect(navItemIsVisible(finance!, pro)).toBe(true);
  });

  it("does not hide legacy routes while the workspace capability snapshot is absent", () => {
    const finance = NAV_SECTIONS.flatMap((section) => section.items).find((item) => item.href === "/finance");
    expect(finance).toBeDefined();
    expect(navItemIsVisible(finance!, { permissions: ["reports.financial.read"] })).toBe(true);
  });
});
