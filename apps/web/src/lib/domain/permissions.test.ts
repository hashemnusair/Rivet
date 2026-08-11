import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISCOUNT_LIMITS,
  PERMISSIONS,
  ROLE_LABELS,
  canAny,
  defaultRoleDefinitions,
  discountNeedsApproval,
  hasPermission,
  type Permission,
} from "./permissions";
import type { RoleKey } from "./types";

const roles = defaultRoleDefinitions();
const byKey = (key: RoleKey) => roles.find((r) => r.key === key)!;

describe("role catalogue", () => {
  it("defines every system role with a label", () => {
    const keys: RoleKey[] = ["owner", "manager", "salesperson", "receptionist", "trainer", "auditor"];
    for (const key of keys) {
      expect(byKey(key)).toBeDefined();
      expect(ROLE_LABELS[key]).toBeTruthy();
    }
  });

  it("gives the owner every permission so a tenant cannot lock itself out", () => {
    expect(byKey("owner").permissions).toHaveLength(PERMISSIONS.length);
  });

  it("withholds user and settings management from the manager", () => {
    const manager = byKey("manager").permissions;
    expect(manager).not.toContain("users.manage");
    expect(manager).not.toContain("settings.manage");
    // but they still run the floor
    expect(manager).toContain("payments.refund");
    expect(manager).toContain("reconciliation.approve_variance");
    expect(manager).toContain("audit.read");
  });
});

describe("least privilege per role", () => {
  it("keeps financial reporting away from sales and reception", () => {
    // docs/07 threat scenario 1: reception must not read branch financials.
    expect(byKey("receptionist").permissions).not.toContain("reports.financial.read");
    expect(byKey("salesperson").permissions).not.toContain("reports.financial.read");
  });

  it("stops sales from refunding or voiding money", () => {
    const sales = byKey("salesperson").permissions;
    expect(sales).toContain("payments.collect");
    expect(sales).not.toContain("payments.refund");
    expect(sales).not.toContain("payments.void");
  });

  it("stops reception from overriding a blocked check-in on their own", () => {
    expect(byKey("receptionist").permissions).not.toContain("checkins.override");
  });

  it("lets reception open and close their own drawer but not approve variance", () => {
    const reception = byKey("receptionist").permissions;
    expect(reception).toContain("reconciliation.open_shift");
    expect(reception).toContain("reconciliation.close_shift");
    expect(reception).not.toContain("reconciliation.approve_variance");
  });

  it("keeps the auditor read-only", () => {
    const auditor = byKey("auditor").permissions;
    expect(auditor).toContain("audit.read");
    expect(auditor).toContain("reports.financial.read");
    for (const write of ["members.write", "memberships.sell", "payments.collect", "payments.refund"] as Permission[]) {
      expect(auditor).not.toContain(write);
    }
  });

  it("limits the trainer to member lookup and their own PT schedule/outcomes", () => {
    expect(byKey("trainer").permissions).toEqual(["members.read", "pt.schedule.self", "pt.outcome.self"]);
  });

  it("keeps sensitive notes away from every role except manager and above", () => {
    expect(byKey("receptionist").permissions).not.toContain("members.sensitive_notes.read");
    expect(byKey("trainer").permissions).not.toContain("members.sensitive_notes.read");
    expect(byKey("manager").permissions).toContain("members.sensitive_notes.read");
  });
});

describe("permission helpers", () => {
  it("checks a single permission", () => {
    expect(hasPermission(["members.read"], "members.read")).toBe(true);
    expect(hasPermission(["members.read"], "members.write")).toBe(false);
  });

  it("checks any-of, as the navigation does", () => {
    expect(canAny(["crm.read"], ["crm.read", "crm.write"])).toBe(true);
    expect(canAny(["members.read"], ["crm.read", "crm.write"])).toBe(false);
    expect(canAny([], ["crm.read"])).toBe(false);
  });
});

describe("discount approval thresholds", () => {
  it("never asks for approval on a zero discount", () => {
    expect(discountNeedsApproval(roles, "salesperson", 0)).toBe(false);
  });

  it("lets a salesperson discount up to their limit and no further", () => {
    const limit = DEFAULT_DISCOUNT_LIMITS.salesperson;
    expect(discountNeedsApproval(roles, "salesperson", limit)).toBe(false);
    expect(discountNeedsApproval(roles, "salesperson", limit + 1)).toBe(true);
  });

  it("gives the manager a higher ceiling than sales", () => {
    const salesLimit = DEFAULT_DISCOUNT_LIMITS.salesperson;
    expect(discountNeedsApproval(roles, "manager", salesLimit + 1)).toBe(false);
    expect(discountNeedsApproval(roles, "manager", DEFAULT_DISCOUNT_LIMITS.manager + 1)).toBe(true);
  });

  it("requires approval for any discount by reception, whose limit is zero", () => {
    expect(discountNeedsApproval(roles, "receptionist", 1)).toBe(true);
  });

  it("never blocks the owner", () => {
    expect(discountNeedsApproval(roles, "owner", 500_000_000)).toBe(false);
  });

  it("falls back to the role default when the role is not in the supplied list", () => {
    expect(discountNeedsApproval([], "salesperson", DEFAULT_DISCOUNT_LIMITS.salesperson + 1)).toBe(true);
  });
});
