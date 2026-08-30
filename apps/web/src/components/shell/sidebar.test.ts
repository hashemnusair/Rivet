import { describe, expect, it } from "vitest";
import { navIsActive } from "./sidebar";

describe("navIsActive", () => {
  it("does not treat similarly prefixed routes as active", () => {
    expect(navIsActive("/members", "/memberships")).toBe(false);
    expect(navIsActive("/members", "/memberships/plan-1")).toBe(false);
  });

  it("keeps the parent active for its own descendants", () => {
    expect(navIsActive("/members", "/members")).toBe(true);
    expect(navIsActive("/members", "/members/new")).toBe(true);
    expect(navIsActive("/members", "/members/member-1")).toBe(true);
  });

  it("keeps dashboard and payment route exceptions intact", () => {
    expect(navIsActive("/dashboard", "/dashboard")).toBe(true);
    expect(navIsActive("/dashboard", "/dashboard/settings")).toBe(false);
    expect(navIsActive("/payments", "/payments/receipts/receipt-1")).toBe(true);
  });

  it("keeps the Payments entry active across the whole finance cluster", () => {
    expect(navIsActive("/payments", "/payments/shifts")).toBe(true);
    expect(navIsActive("/payments", "/reports")).toBe(true);
    expect(navIsActive("/finance", "/reports")).toBe(false);
  });

  it("keeps the pipeline entry active on lead detail pages", () => {
    expect(navIsActive("/crm/pipeline", "/crm/leads/lead-1")).toBe(true);
    expect(navIsActive("/crm/queues", "/crm/leads/lead-1")).toBe(false);
  });
});
