import { describe, expect, it } from "vitest";
import { NAV_SECTIONS } from "@/components/shell/nav-config";
import { deviceIsPhone, phoneAllowsHref } from "./phone-pages";

describe("phone pages", () => {
  it("keeps only the agreed pages in the phone menu", () => {
    const phoneMenu = NAV_SECTIONS.flatMap((section) => section.items).filter((item) => phoneAllowsHref(item.href)).map((item) => item.href);
    expect(phoneMenu).toEqual(["/dashboard", "/reception", "/members", "/classes", "/pt"]);
  });

  it("opens member profiles, adding a member and receipts on a phone", () => {
    expect(phoneAllowsHref("/members/m-1")).toBe(true);
    expect(phoneAllowsHref("/members/m-1?tab=pt")).toBe(true);
    expect(phoneAllowsHref("/members/new")).toBe(true);
    expect(phoneAllowsHref("/payments/receipts/view#r-1")).toBe(true);
    expect(phoneAllowsHref("/onboarding/agreement")).toBe(true);
  });

  it("keeps bulk member work, money and admin pages off phones", () => {
    for (const href of ["/members/import", "/members/duplicates", "/payments", "/payments?collect=1", "/payments/shifts", "/crm/queues", "/crm/leads/l-1", "/finance", "/reports", "/settings", "/getting-started", "/checkout", "/audit"]) {
      expect(phoneAllowsHref(href), href).toBe(false);
    }
  });

  it("does not match a page that only shares a prefix", () => {
    expect(phoneAllowsHref("/membership")).toBe(false);
    expect(phoneAllowsHref("/memberships")).toBe(false);
    expect(phoneAllowsHref("/ptx")).toBe(false);
  });

  it("treats a phone as a phone in either orientation and a tablet as a tablet", () => {
    expect(deviceIsPhone({ width: 390, height: 844 }, true)).toBe(true);
    expect(deviceIsPhone({ width: 932, height: 430 }, true)).toBe(true);
    expect(deviceIsPhone({ width: 600, height: 960 }, true)).toBe(false);
    expect(deviceIsPhone({ width: 744, height: 1133 }, true)).toBe(false);
    expect(deviceIsPhone({ width: 0, height: 0 }, true)).toBe(false);
  });

  it("never treats a mouse-driven screen as a phone, however small", () => {
    expect(deviceIsPhone({ width: 390, height: 844 }, false)).toBe(false);
    expect(deviceIsPhone({ width: 1440, height: 900 }, false)).toBe(false);
  });
});
