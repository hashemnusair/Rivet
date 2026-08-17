import { describe, expect, it } from "vitest";
import { NAV_SECTIONS } from "./nav-config";

describe("primary workspace navigation", () => {
  it("keeps one simple entry point for each core workflow", () => {
    const items = NAV_SECTIONS.flatMap((section) => section.items);
    expect(items.map((item) => item.label)).toEqual([
      "Dashboard",
      "Reception",
      "Members",
      "Personal training",
      "Leads",
      "Follow-ups",
      "Payments",
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
});
