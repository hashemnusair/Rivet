import type { OrganizationRole, StoredOrganizationRole } from "./security";

/**
 * Server-owned permission catalogue. The UI imports the same conceptual list,
 * but authorization never trusts a client-supplied permission array.
 */
export const PERMISSIONS = [
  "members.read",
  "members.write",
  "members.archive",
  "members.sensitive_notes.read",
  "memberships.sell",
  "memberships.freeze",
  "memberships.override_dates",
  "payments.collect",
  "payments.discount",
  "payments.refund",
  "payments.void",
  "reconciliation.open_shift",
  "reconciliation.close_shift",
  "reconciliation.approve_variance",
  "reconciliation.read",
  "crm.read",
  "crm.write",
  "crm.assign",
  "reports.financial.read",
  "operations.manage",
  "accounting.post",
  "audit.read",
  "users.manage",
  "settings.manage",
  "checkins.override",
  "automations.manage",
  "profiles.manage",
  "pt.manage",
  "pt.book_for_member",
  "pt.schedule.self",
  "pt.outcome.self",
  "pt.refund",
  "pt.reports.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Increment when a permission is added to the server-owned catalogue. Stored
 * role definitions may omit this field because they predate the catalogue
 * versioning boundary; those rows are handled by effectiveRolePermissions.
 */
export const PERMISSION_CATALOG_VERSION = 2;

const ALL = [...PERMISSIONS] as Permission[];
const MANAGER = ALL.filter((permission) => permission !== "users.manage" && permission !== "settings.manage");
const SALESPERSON: Permission[] = [
  "members.read",
  "members.write",
  "memberships.sell",
  "payments.collect",
  "payments.discount",
  "crm.read",
  "crm.write",
  "pt.book_for_member",
];
const RECEPTIONIST: Permission[] = [
  "members.read",
  "memberships.sell",
  "payments.collect",
  "reconciliation.open_shift",
  "reconciliation.close_shift",
  "crm.read",
  "pt.book_for_member",
];
const TRAINER: Permission[] = ["members.read", "pt.schedule.self", "pt.outcome.self"];

export const DEFAULT_ROLE_DEFINITIONS: Record<OrganizationRole, { label: string; description: string; permissions: Permission[]; discountLimitMinor: number }> = {
  owner: {
    label: "Owner",
    description: "Full access to every branch, setting and report.",
    permissions: ALL,
    discountLimitMinor: Number.MAX_SAFE_INTEGER,
  },
  manager: {
    label: "Manager",
    description: "Operational control: sales, finance, reconciliation, audit.",
    permissions: MANAGER,
    discountLimitMinor: 50_000,
  },
  sales: {
    label: "Sales",
    description: "Leads, pipeline, member sales and collections within limits.",
    permissions: SALESPERSON,
    discountLimitMinor: 10_000,
  },
  receptionist: {
    label: "Reception",
    description: "Front desk: lookup, check-in, collect, open/close own shift.",
    permissions: RECEPTIONIST,
    discountLimitMinor: 0,
  },
  trainer: {
    label: "Trainer",
    description: "Read-only member directory for coaching context.",
    permissions: TRAINER,
    discountLimitMinor: 0,
  },
};

const LEGACY_COMPATIBILITY_PERMISSIONS: Partial<Record<OrganizationRole, Permission[]>> = {
  // Before catalog versioning, stored definitions could not express the
  // operations/accounting or PT capabilities introduced later. Restore only
  // those product-owned additions for legacy rows; once an owner saves the
  // current catalog version, deliberate omissions remain authoritative.
  manager: ["operations.manage", "accounting.post", "pt.manage", "pt.book_for_member", "pt.schedule.self", "pt.outcome.self", "pt.refund", "pt.reports.read"],
  sales: ["pt.book_for_member"],
  receptionist: ["pt.book_for_member"],
  trainer: ["pt.schedule.self", "pt.outcome.self"],
};

export function effectiveRolePermissions(role: StoredOrganizationRole, configured?: string[], catalogVersion?: number): string[] {
  // The retired auditor role keeps no capabilities; its rows only exist as history.
  if (role === "auditor") return [];
  // Owners are never allowed to lock themselves out of a tenant. This also
  // makes the owner guarantee explicit instead of depending on stored data.
  if (role === "owner") return [...ALL];
  const base = configured
    ? configured.filter((permission): permission is Permission => PERMISSIONS.includes(permission as Permission))
    : DEFAULT_ROLE_DEFINITIONS[role].permissions;
  if (configured && (catalogVersion ?? 0) < PERMISSION_CATALOG_VERSION) {
    return [...new Set([...base, ...(LEGACY_COMPATIBILITY_PERMISSIONS[role] ?? [])])];
  }
  return base;
}

/** Backwards-compatible name used by existing server callers and tests. */
export function rolePermissions(role: StoredOrganizationRole, configured?: string[], catalogVersion?: number): string[] {
  return effectiveRolePermissions(role, configured, catalogVersion);
}

export function roleDiscountLimit(role: StoredOrganizationRole, configured?: number): number {
  if (role === "auditor") return 0;
  return configured ?? DEFAULT_ROLE_DEFINITIONS[role].discountLimitMinor;
}

export function toFrontendRole(role: StoredOrganizationRole): string {
  return role === "sales" ? "salesperson" : role;
}
