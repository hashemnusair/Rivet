import type { RoleDefinition, RoleKey } from "./types";

/**
 * Permission catalogue (docs/07 + backend task). Frontend checks are usability
 * only; the backend must re-enforce every one of these server-side.
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

export const PERMISSION_CATALOG_VERSION = 2;

const ALL: Permission[] = [...PERMISSIONS];

const MANAGER: Permission[] = ALL.filter(
  (p) => p !== "users.manage" && p !== "settings.manage",
);

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

const AUDITOR: Permission[] = [
  "members.read",
  "crm.read",
  "reports.financial.read",
  "audit.read",
  "reconciliation.read",
];

const LEGACY_COMPATIBILITY_PERMISSIONS: Partial<Record<RoleKey, Permission[]>> = {
  manager: ["operations.manage", "accounting.post"],
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  owner: "Owner",
  manager: "Manager",
  salesperson: "Sales",
  receptionist: "Reception",
  trainer: "Trainer",
  auditor: "Auditor",
};

/** JOD minor units (3 decimals). */
export const DEFAULT_DISCOUNT_LIMITS: Record<RoleKey, number> = {
  owner: Number.MAX_SAFE_INTEGER,
  manager: 50_000, // JOD 50.000
  salesperson: 10_000, // JOD 10.000
  receptionist: 0,
  trainer: 0,
  auditor: 0,
};

export function defaultRoleDefinitions(): RoleDefinition[] {
  const defs: Array<[RoleKey, string, string, Permission[]]> = [
    ["owner", "Owner", "Full access to every branch, setting and report.", ALL],
    ["manager", "Manager", "Operational control: sales, finance, reconciliation, audit.", MANAGER],
    ["salesperson", "Sales", "Leads, pipeline, member sales and collections within limits.", SALESPERSON],
    ["receptionist", "Reception", "Front desk: lookup, check-in, collect, open/close own shift.", RECEPTIONIST],
    ["trainer", "Trainer", "Read-only member directory for coaching context.", TRAINER],
    ["auditor", "Read-only auditor", "Inspect records, finances and the audit trail.", AUDITOR],
  ];
  return defs.map(([key, label, description, permissions]) => ({
    key,
    label,
    description,
    permissions,
    discountLimitMinor: DEFAULT_DISCOUNT_LIMITS[key],
    isSystem: true,
    catalogVersion: PERMISSION_CATALOG_VERSION,
  }));
}

export function effectiveRolePermissions(role: RoleKey, configured?: string[], catalogVersion?: number): string[] {
  if (role === "owner") return [...ALL];
  const base = configured
    ? configured.filter((permission): permission is Permission => PERMISSIONS.includes(permission as Permission))
    : (defaultRoleDefinitions().find((definition) => definition.key === role)?.permissions ?? []);
  if (configured && (catalogVersion ?? 0) < PERMISSION_CATALOG_VERSION) {
    return [...new Set([...base, ...(LEGACY_COMPATIBILITY_PERMISSIONS[role] ?? [])])];
  }
  return base;
}

export function hasPermission(userPermissions: string[], permission: Permission): boolean {
  return userPermissions.includes(permission);
}

export function canAny(userPermissions: string[], permissions: Permission[]): boolean {
  return permissions.some((p) => userPermissions.includes(p));
}

/** True when the actor must request approval for this discount amount. */
export function discountNeedsApproval(
  roles: RoleDefinition[],
  role: RoleKey,
  discountMinor: number,
): boolean {
  if (discountMinor <= 0) return false;
  const def = roles.find((r) => r.key === role);
  const limit = def?.discountLimitMinor ?? DEFAULT_DISCOUNT_LIMITS[role];
  return discountMinor > limit;
}
