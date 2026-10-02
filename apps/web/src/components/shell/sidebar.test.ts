import { describe, expect, it } from "vitest";
import { navIsActive } from "./sidebar";

describe("navIsActive", () => {
  it("does not treat similarly prefixed routes as active", () => {
    expect(navIsActive("/reports", "/reportsx")).toBe(false);
    expect(navIsActive("/classes", "/classesroom/1")).toBe(false);
    expect(navIsActive("/pt", "/ptx")).toBe(false);
  });

  it("keeps the parent active for its own descendants", () => {
    expect(navIsActive("/members", "/members")).toBe(true);
    expect(navIsActive("/members", "/members/new")).toBe(true);
    expect(navIsActive("/members", "/members/member-1")).toBe(true);
  });

  it("keeps Members selected on the memberships and plans pages, which have no entry of their own", () => {
    expect(navIsActive("/members", "/memberships")).toBe(true);
    expect(navIsActive("/members", "/plans")).toBe(true);
    expect(navIsActive("/classes", "/memberships")).toBe(false);
    expect(navIsActive("/settings", "/plans")).toBe(false);
  });

  it("keeps Stock & purchasing selected on the maintenance page it links to", () => {
    expect(navIsActive("/operations", "/maintenance")).toBe(true);
    expect(navIsActive("/operations", "/operations/payables/payments/p-1")).toBe(true);
    expect(navIsActive("/checklists", "/maintenance")).toBe(false);
  });

  it("keeps dashboard and payment route exceptions intact", () => {
    expect(navIsActive("/dashboard", "/dashboard")).toBe(true);
    expect(navIsActive("/dashboard", "/dashboard/settings")).toBe(false);
    expect(navIsActive("/payments", "/payments/receipts/receipt-1")).toBe(true);
  });

  it("keeps Payments and Reports as separate primary destinations", () => {
    expect(navIsActive("/payments", "/payments/shifts")).toBe(true);
    expect(navIsActive("/payments", "/reports")).toBe(false);
    expect(navIsActive("/reports", "/reports")).toBe(true);
  });

  it("keeps the pipeline entry active on lead detail pages", () => {
    expect(navIsActive("/crm/pipeline", "/crm/leads/lead-1")).toBe(true);
    expect(navIsActive("/crm/queues", "/crm/leads/lead-1")).toBe(false);
  });
});
