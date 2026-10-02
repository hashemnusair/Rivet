import { describe, expect, it } from "vitest";
import { PORTALS } from "./portals";

describe("login portal ownership", () => {
  it("keeps staff, member, and admin forms on their own routes", () => {
    expect(PORTALS.account.href).toBe("/login");
    expect(PORTALS.staff.href).toBe("/login/gym");
    expect(PORTALS.member.href).toBe("/login/member");
    expect(PORTALS.admin.href).toBe("/login/admin");
  });

  it("uses portal-owned routes for Clerk redirects", () => {
    expect(PORTALS.staff.signUpUrl).toBeUndefined();
    expect(PORTALS.staff.destination).toBe("/dashboard");
    expect(PORTALS.member.signUpUrl).toBe("/login/member/create");
    expect(PORTALS.admin.signUpUrl).toBeUndefined();
  });
});
