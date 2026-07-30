import type {
  AutomationExecution,
  AutomationRule,
  AuditEvent,
  Branch,
  CashShift,
  Charge,
  CheckInSummary,
  FreezePeriod,
  Lead,
  MembershipAdjustment,
  MembershipPlan,
  MessageTemplate,
  Money,
  NotificationSettings,
  Offer,
  Organization,
  Payment,
  PaymentMethod,
  Receipt,
  RoleDefinition,
  RoleKey,
  StaffUser,
  Task,
  TimelineEvent,
  UUID,
} from "@/lib/domain/types";


// ---------------------------------------------------------------------------
// Internal records (derived/denormalized fields are computed by mappers,
// not stored — mirrors docs/05 derived-status guidance).
// ---------------------------------------------------------------------------

export interface MemberRecord {
  id: UUID;
  memberNumber: string;
  fullName: string;
  fullNameAr?: string;
  phone: string;
  email?: string;
  gender?: "male" | "female";
  dateOfBirth?: string;
  homeBranchId: UUID;
  status: "active" | "inactive" | "archived";
  tags: string[];
  preferredLanguage: "en" | "ar";
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  source?: Lead["source"];
  assignedSalespersonId?: UUID;
  marketingOptIn: boolean;
  notes?: string;
  sensitiveNotes?: string;
  archivedAt?: string;
  createdAt: string;
}

export interface MembershipRecord {
  id: UUID;
  organizationId: UUID;
  memberId: UUID;
  planId: UUID;
  homeBranchId: UUID;
  startDate: string;
  endDate: string;
  totalVisits?: number;
  remainingVisits?: number;
  salePrice: Money;
  discount: Money;
  discountReason?: string;
  discountApprovalStatus: "none" | "pending" | "approved" | "rejected";
  soldById: UUID;
  previousMembershipId?: UUID;
  frozenDaysUsed: number;
  activeFreeze?: FreezePeriod;
  freezes: FreezePeriod[];
  adjustments: MembershipAdjustment[];
  cancelledAt?: string;
  cancellationReason?: string;
  createdAt: string;
}

export interface LeadRecord extends Lead {
  notes?: string;
}

export interface MockDb {
  organization: Organization;
  branches: Branch[];
  users: StaffUser[];
  roles: RoleDefinition[];
  paymentMethods: PaymentMethod[];
  notificationSettings: NotificationSettings;
  members: MemberRecord[];
  memberships: MembershipRecord[];
  plans: MembershipPlan[];
  charges: Charge[];
  payments: Payment[];
  receipts: Receipt[];
  shifts: CashShift[];
  checkIns: CheckInSummary[];
  leads: LeadRecord[];
  offers: Offer[];
  tasks: Task[];
  activities: TimelineEvent[];
  audits: AuditEvent[];
  rules: AutomationRule[];
  executions: AutomationExecution[];
  templates: MessageTemplate[];
  session: { userId: UUID; activeBranchId?: UUID };
  counters: { receiptNumber: number; memberNumber: number };
}

// ---------------------------------------------------------------------------
// Deterministic UUID generation for the mock (UUID-shaped, stable per seed).
// ---------------------------------------------------------------------------

let uuidCounter = 0;

export function resetUuidCounter() {
  uuidCounter = 0;
}

export function mockUuid(): UUID {
  uuidCounter += 1;
  const hex = uuidCounter.toString(16).padStart(12, "0");
  return `00000000-0000-4a00-8a00-${hex}`;
}

/** A stable, well-known ID namespace for seed entities so tests can rely on them. */
export function seedUuid(n: number): UUID {
  const hex = n.toString(16).padStart(12, "0");
  return `10000000-0000-4a00-8a00-${hex}`;
}

export function currentUser(db: MockDb): StaffUser {
  const u = db.users.find((x) => x.id === db.session.userId);
  if (!u) throw new Error("Mock session user missing");
  return u;
}

export function currentRole(db: MockDb): RoleKey {
  return currentUser(db).role;
}

export function permissionsFor(db: MockDb, role: RoleKey): string[] {
  return db.roles.find((r) => r.key === role)?.permissions ?? [];
}
