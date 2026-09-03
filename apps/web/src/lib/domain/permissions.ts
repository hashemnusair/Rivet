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

/**
 * Plain-language names for the permission matrix. The code stays the stable
 * server contract; the label is what an owner reads when deciding who can do
 * what.
 */
export const PERMISSION_LABELS: Record<Permission, { label: string; hint: string }> = {
  "members.read": { label: "View members", hint: "Open the member directory and profiles" },
  "members.write": { label: "Add and edit members", hint: "Create members and change their details" },
  "members.archive": { label: "Archive members", hint: "Remove members from the active directory" },
  "members.sensitive_notes.read": { label: "Read private notes", hint: "See notes marked sensitive on a profile" },
  "memberships.sell": { label: "Sell memberships", hint: "Sell new plans and renewals" },
  "memberships.freeze": { label: "Freeze memberships", hint: "Pause a membership and extend its end date" },
  "memberships.override_dates": { label: "Change membership dates", hint: "Move start or end dates and transfer branches" },
  "payments.collect": { label: "Collect payments", hint: "Take payments and run checkout" },
  "payments.discount": { label: "Give discounts", hint: "Apply discounts up to the role limit" },
  "payments.refund": { label: "Issue refunds", hint: "Return money against a receipt" },
  "payments.void": { label: "Void payments", hint: "Cancel a same-day payment" },
  "reconciliation.open_shift": { label: "Open cash shift", hint: "Start a drawer with an opening float" },
  "reconciliation.close_shift": { label: "Close cash shift", hint: "Count the drawer and close the shift" },
  "reconciliation.approve_variance": { label: "Approve cash variances", hint: "Sign off on a drawer that did not balance" },
  "reconciliation.read": { label: "View shift history", hint: "See past shifts and daily reconciliation" },
  "crm.read": { label: "View leads", hint: "See the pipeline and follow-up queues" },
  "crm.write": { label: "Work leads", hint: "Add leads, log contact, and update stages" },
  "crm.assign": { label: "Assign leads", hint: "Hand leads to other staff" },
  "reports.financial.read": { label: "View financial reports", hint: "Open reports, statements, and payables" },
  "operations.manage": { label: "Manage stock and purchasing", hint: "Inventory, suppliers, purchase orders, supplier payments, equipment" },
  "accounting.post": { label: "Post to the ledger", hint: "Refresh and post the accounting source queue" },
  "audit.read": { label: "View audit log", hint: "Read the immutable record of sensitive actions" },
  "users.manage": { label: "Manage staff", hint: "Invite staff and change their access" },
  "settings.manage": { label: "Manage settings", hint: "Change gym-wide settings" },
  "checkins.override": { label: "Override check-in blocks", hint: "Let a blocked member in with a reason" },
  "automations.manage": { label: "Manage automations", hint: "Create and edit automation rules" },
  "profiles.manage": { label: "Manage gym profile", hint: "Edit the public gym profile and brand" },
  "pt.manage": { label: "Manage personal training", hint: "Packages, trainers, and PT settings" },
  "pt.book_for_member": { label: "Book PT for members", hint: "Schedule sessions on a member's behalf" },
  "pt.schedule.self": { label: "Manage own PT schedule", hint: "Trainers set their own availability" },
  "pt.outcome.self": { label: "Record own PT sessions", hint: "Trainers mark their sessions delivered" },
  "pt.refund": { label: "Refund PT packages", hint: "Return money for unused PT credits" },
  "pt.reports.read": { label: "View PT reports", hint: "See PT sales and delivery reports" },
};

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

const LEGACY_COMPATIBILITY_PERMISSIONS: Partial<Record<RoleKey, Permission[]>> = {
  manager: ["operations.manage", "accounting.post", "pt.manage", "pt.book_for_member", "pt.schedule.self", "pt.outcome.self", "pt.refund", "pt.reports.read"],
  salesperson: ["pt.book_for_member"],
  receptionist: ["pt.book_for_member"],
  trainer: ["pt.schedule.self", "pt.outcome.self"],
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  owner: "Owner",
  manager: "Manager",
  salesperson: "Sales",
  receptionist: "Reception",
  trainer: "Trainer",
};

/** JOD minor units (3 decimals). */
export const DEFAULT_DISCOUNT_LIMITS: Record<RoleKey, number> = {
  owner: Number.MAX_SAFE_INTEGER,
  manager: 50_000, // JOD 50.000
  salesperson: 10_000, // JOD 10.000
  receptionist: 0,
  trainer: 0,
};

export function defaultRoleDefinitions(): RoleDefinition[] {
  const defs: Array<[RoleKey, string, string, Permission[]]> = [
    ["owner", "Owner", "Full access to every branch, setting and report.", ALL],
    ["manager", "Manager", "Operational control: sales, finance, reconciliation, audit.", MANAGER],
    ["salesperson", "Sales", "Leads, pipeline, member sales and collections within limits.", SALESPERSON],
    ["receptionist", "Reception", "Front desk: lookup, check-in, collect, open/close own shift.", RECEPTIONIST],
    ["trainer", "Trainer", "Read-only member directory for coaching context.", TRAINER],
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
