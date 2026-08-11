import type { OrganizationRole } from "./security";

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
const AUDITOR: Permission[] = ["members.read", "crm.read", "reports.financial.read", "audit.read", "reconciliation.read"];

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
  auditor: {
    label: "Read-only auditor",
    description: "Inspect records, finances and the audit trail.",
    permissions: AUDITOR,
    discountLimitMinor: 0,
  },
};

export function rolePermissions(role: OrganizationRole, configured?: string[]): string[] {
  if (configured) return configured.filter((permission): permission is Permission => PERMISSIONS.includes(permission as Permission));
  return DEFAULT_ROLE_DEFINITIONS[role].permissions;
}

export function roleDiscountLimit(role: OrganizationRole, configured?: number): number {
  return configured ?? DEFAULT_ROLE_DEFINITIONS[role].discountLimitMinor;
}

export function toFrontendRole(role: OrganizationRole): string {
  return role === "sales" ? "salesperson" : role;
}
