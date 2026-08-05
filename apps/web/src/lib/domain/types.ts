/**
 * RIVET / GymOS domain types.
 *
 * These types define the seam between the frontend and the future backend
 * (docs/06_API_AND_MOCK_CONTRACT.md). JSON boundary conventions:
 *  - IDs are UUID strings.
 *  - Timestamps are ISO 8601 UTC strings.
 *  - Dates without time are YYYY-MM-DD.
 *  - Money is integer minor units + ISO 4217 currency.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export type UUID = string;
export type ISODateTime = string;
export type ISODate = string;

export interface Money {
  /** Integer minor units. JOD has 3 decimal places: 40_000 = JOD 40.000 */
  amount: number;
  currency: string; // ISO 4217, e.g. "JOD"
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string; // e.g. "createdAt" or "-createdAt" for desc
}

// ---------------------------------------------------------------------------
// Identity & tenancy
// ---------------------------------------------------------------------------

export type RoleKey =
  | "owner"
  | "manager"
  | "salesperson"
  | "receptionist"
  | "trainer"
  | "auditor";

export type BranchScope = "all" | "selected";

export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  locale: string;
  defaultLanguage: "en" | "ar";
  taxRatePercent: number; // 0 means tax disabled
  receiptPrefix: string;
  nextReceiptNumber: number;
  receiptFooter: string;
  status: "active" | "suspended";
}

export interface Branch {
  id: UUID;
  organizationId: UUID;
  name: string;
  code: string;
  address: string;
  phone: string;
  capacity: number;
  status: "active" | "inactive";
}

export interface StaffUser {
  id: UUID;
  organizationId: UUID;
  name: string;
  email: string;
  phone: string;
  role: RoleKey;
  branchScope: BranchScope;
  branchIds: UUID[];
  status: "active" | "invited" | "deactivated";
  lastActiveAt?: ISODateTime;
  invitedAt?: ISODateTime;
}

export interface Session {
  user: { id: UUID; name: string; email: string };
  organization: {
    id: UUID;
    name: string;
    currency: string;
    timezone: string;
    locale: string;
  };
  branches: Array<{ id: UUID; name: string; code: string }>;
  activeBranchId?: UUID;
  roles: RoleKey[];
  permissions: string[];
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export type MemberStatus = "active" | "inactive" | "archived";
export type PreferredLanguage = "en" | "ar";

export interface MemberSummary {
  id: UUID;
  memberNumber: string; // unique within tenant, e.g. "ABD-1042"
  fullName: string;
  fullNameAr?: string;
  phone: string;
  email?: string;
  homeBranchId: UUID;
  status: MemberStatus;
  tags: string[];
  /** Derived: effective status of the most relevant current membership. */
  membershipStatus?: MembershipEffectiveStatus;
  currentPlanName?: string;
  membershipEndDate?: ISODate;
  outstanding: Money;
  lastCheckInAt?: ISODateTime;
  createdAt: ISODateTime;
}

export interface MemberDetail extends MemberSummary {
  gender?: "male" | "female";
  dateOfBirth?: ISODate;
  preferredLanguage: PreferredLanguage;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  source?: LeadSource;
  assignedSalespersonId?: UUID;
  marketingOptIn: boolean;
  notes?: string;
  sensitiveNotes?: string; // requires members.sensitive_notes.read
  archivedAt?: ISODateTime;
  stats: MemberStats;
}

export interface MemberStats {
  checkInsLast30Days: number;
  totalCheckIns: number;
  lifetimeValue: Money;
  outstanding: Money;
  daysSinceLastCheckIn?: number;
}

export interface CreateMemberInput {
  fullName: string;
  fullNameAr?: string;
  phone: string;
  email?: string;
  gender?: "male" | "female";
  dateOfBirth?: ISODate;
  homeBranchId: UUID;
  preferredLanguage: PreferredLanguage;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  source?: LeadSource;
  assignedSalespersonId?: UUID;
  tags?: string[];
  marketingOptIn?: boolean;
  notes?: string;
}

export type UpdateMemberInput = Partial<CreateMemberInput>;

export interface DuplicateMatch {
  memberId: UUID;
  fullName: string;
  memberNumber: string;
  matchedOn: "phone" | "email";
}

export interface CreateMemberResult {
  member: MemberDetail;
  duplicates: DuplicateMatch[];
}

// ---------------------------------------------------------------------------
// Plans & memberships
// ---------------------------------------------------------------------------

export type PlanKind = "time" | "visits";

export interface MembershipPlan {
  id: UUID;
  organizationId: UUID;
  name: string;
  code: string;
  kind: PlanKind;
  durationDays?: number; // for time plans
  visitAllowance?: number; // for visit plans
  visitValidityDays?: number; // visit plans also expire
  basePrice: Money;
  branchAccess: "all" | "selected";
  branchIds: UUID[];
  freezeAllowanceDays: number;
  status: "active" | "archived";
  activeSubscribers: number;
}

export type MembershipEffectiveStatus =
  | "active"
  | "expiring" // derived: active and ends within 14 days
  | "frozen"
  | "expired"
  | "cancelled"
  | "depleted" // visit-based with no visits left
  | "scheduled"; // starts in the future

export type PaymentStatus = "paid" | "partial" | "unpaid" | "refunded";

export interface Membership {
  id: UUID;
  organizationId: UUID;
  memberId: UUID;
  planId: UUID;
  homeBranchId: UUID;
  startDate: ISODate;
  endDate: ISODate;
  status: MembershipEffectiveStatus;
  totalVisits?: number;
  remainingVisits?: number;
  salePrice: Money;
  discount: Money;
  discountReason?: string;
  discountApprovalStatus?: "none" | "pending" | "approved" | "rejected";
  paymentStatus: PaymentStatus;
  soldById: UUID;
  previousMembershipId?: UUID; // renewal lineage
  frozenDaysUsed: number;
  activeFreeze?: FreezePeriod;
  cancelledAt?: ISODateTime;
  cancellationReason?: string;
  createdAt: ISODateTime;
}

export interface MembershipSummary extends Membership {
  memberName: string;
  memberNumber: string;
  planName: string;
  branchName: string;
  planFreezeAllowanceDays: number;
  outstanding: Money;
}

export interface MembershipDetail extends Membership {
  member: MemberSummary;
  plan: MembershipPlan;
  charge?: Charge;
  adjustments: MembershipAdjustment[];
  freezes: FreezePeriod[];
}

export interface FreezePeriod {
  id: UUID;
  membershipId: UUID;
  startDate: ISODate;
  endDate: ISODate;
  status: "active" | "completed" | "cancelled";
  reason: string;
  createdById: UUID;
  createdAt: ISODateTime;
}

export type AdjustmentType =
  | "freeze"
  | "unfreeze"
  | "extension"
  | "cancellation"
  | "visit_adjustment"
  | "date_correction";

export interface MembershipAdjustment {
  id: UUID;
  membershipId: UUID;
  type: AdjustmentType;
  reason: string;
  actorId: UUID;
  before: Record<string, string | number | null>;
  after: Record<string, string | number | null>;
  approvalStatus: "not_required" | "pending" | "approved" | "rejected";
  createdAt: ISODateTime;
}

export interface CreatePlanInput {
  name: string;
  code: string;
  kind: PlanKind;
  durationDays?: number;
  visitAllowance?: number;
  visitValidityDays?: number;
  basePrice: Money;
  branchAccess: "all" | "selected";
  branchIds: UUID[];
  freezeAllowanceDays: number;
}

export type UpdatePlanInput = Partial<CreatePlanInput> & { status?: "active" | "archived" };

export interface CreateMembershipSaleInput {
  memberId: UUID;
  planId: UUID;
  startDate: ISODate;
  priceOverride?: Money;
  discount?: Money;
  discountReason?: string;
  payment?: {
    amount: Money;
    method: PaymentMethodKey;
  };
}

export interface RenewMembershipInput {
  planId?: UUID; // defaults to same plan
  startDate?: ISODate; // defaults to day after current end (or today if expired)
  priceOverride?: Money;
  discount?: Money;
  discountReason?: string;
  payment?: { amount: Money; method: PaymentMethodKey };
}

export interface MembershipSaleResult {
  membership: Membership;
  charge: Charge;
  payment?: Payment;
  receipt?: Receipt;
  timelineEventIds: UUID[];
}

export interface FreezeMembershipInput {
  startDate: ISODate;
  endDate: ISODate;
  reason: string;
}

export interface ExtendMembershipInput {
  days: number;
  reason: string;
}

export interface CancelMembershipInput {
  reason: string;
}

// ---------------------------------------------------------------------------
// CRM
// ---------------------------------------------------------------------------

export type LeadStage =
  | "new"
  | "attempted"
  | "contacted"
  | "trial_booked"
  | "trial_completed"
  | "offer_sent"
  | "won"
  | "lost";

export type LeadSource =
  | "instagram"
  | "walk_in"
  | "referral"
  | "whatsapp"
  | "google"
  | "phone_call"
  | "other";

export interface Lead {
  id: UUID;
  organizationId: UUID;
  branchId: UUID;
  fullName: string;
  phone: string;
  email?: string;
  stage: LeadStage;
  source: LeadSource;
  ownerId?: UUID;
  expectedValue?: Money;
  nextFollowUpAt?: ISODateTime;
  lostReason?: string;
  convertedMemberId?: UUID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface LeadSummary extends Lead {
  ownerName?: string;
  branchName: string;
  lastContactOutcome?: string;
  lastContactAt?: ISODateTime;
  overdue: boolean;
}

export interface LeadDetail extends LeadSummary {
  notes?: string;
  activities: TimelineEvent[];
  offers: Offer[];
}

export interface Offer {
  id: UUID;
  leadId?: UUID;
  memberId?: UUID;
  planId: UUID;
  planName: string;
  price: Money;
  expiresAt?: ISODateTime;
  status: "sent" | "accepted" | "declined" | "expired";
  createdById: UUID;
  createdAt: ISODateTime;
}

export type ContactOutcome =
  | "no_answer"
  | "answered_interested"
  | "answered_not_interested"
  | "answered_call_back"
  | "wrong_number"
  | "whatsapp_sent"
  | "trial_booked"
  | "trial_completed";

export interface ContactAttemptInput {
  outcome: ContactOutcome;
  notes?: string;
  nextFollowUpAt?: ISODateTime;
  stage?: LeadStage;
}

export interface CreateLeadInput {
  fullName: string;
  phone: string;
  email?: string;
  branchId: UUID;
  source: LeadSource;
  ownerId?: UUID;
  expectedValue?: Money;
  nextFollowUpAt?: ISODateTime;
  notes?: string;
}

export type UpdateLeadInput = Partial<
  Pick<Lead, "stage" | "ownerId" | "expectedValue" | "nextFollowUpAt" | "lostReason">
>;

export interface ConvertLeadInput {
  homeBranchId: UUID;
  preferredLanguage: PreferredLanguage;
  gender?: "male" | "female";
  dateOfBirth?: ISODate;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

// Tasks

export type TaskType = "follow_up" | "renewal_call" | "payment_collection" | "trial_follow_up" | "general";
export type TaskStatus = "open" | "completed" | "cancelled";

export interface Task {
  id: UUID;
  organizationId: UUID;
  type: TaskType;
  title: string;
  ownerId: UUID;
  ownerName: string;
  dueAt: ISODateTime;
  priority: "low" | "normal" | "high";
  status: TaskStatus;
  leadId?: UUID;
  memberId?: UUID;
  subjectName: string; // denormalized lead/member name for list display
  outcome?: string;
  completedAt?: ISODateTime;
  createdById: UUID;
  createdAt: ISODateTime;
}

export interface CreateTaskInput {
  type: TaskType;
  title: string;
  ownerId: UUID;
  dueAt: ISODateTime;
  priority?: "low" | "normal" | "high";
  leadId?: UUID;
  memberId?: UUID;
}

export interface CompleteTaskInput {
  outcome: string;
}

// Renewal queue

export interface RenewalQueueItem {
  member: MemberSummary;
  membership: MembershipSummary;
  daysUntilExpiry: number; // negative = already expired
  lastContactAt?: ISODateTime;
  lastContactOutcome?: string;
  openTaskId?: UUID;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export type TimelineEventType =
  | "member_created"
  | "note"
  | "call_attempt"
  | "message"
  | "task_created"
  | "task_completed"
  | "offer_sent"
  | "membership_sold"
  | "membership_renewed"
  | "membership_frozen"
  | "membership_unfrozen"
  | "membership_extended"
  | "membership_cancelled"
  | "payment_collected"
  | "payment_refunded"
  | "payment_voided"
  | "check_in"
  | "lead_converted"
  | "automation";

export interface TimelineEvent {
  id: UUID;
  organizationId: UUID;
  memberId?: UUID;
  leadId?: UUID;
  type: TimelineEventType;
  title: string;
  body?: string;
  actorId?: UUID; // undefined = system/automation
  actorName?: string;
  occurredAt: ISODateTime;
  meta?: Record<string, string | number | boolean | undefined>;
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

export type CheckInDecision = "allowed" | "warning" | "blocked" | "overridden";

export type CheckInReasonCode =
  | "OK"
  | "EXPIRES_SOON"
  | "OUTSTANDING_BALANCE"
  | "MEMBERSHIP_EXPIRED"
  | "NO_ACTIVE_MEMBERSHIP"
  | "WRONG_BRANCH"
  | "VISITS_DEPLETED"
  | "MEMBERSHIP_FROZEN"
  | "MEMBER_INACTIVE"
  | "DUPLICATE_SCAN"
  | "MANUAL_OVERRIDE";

export interface CheckInLookupInput {
  branchId: UUID;
  query: string; // member number, phone, name fragment, or QR payload
}

export interface CheckInPreview {
  found: boolean;
  member?: MemberSummary;
  membership?: MembershipSummary;
  decision: CheckInDecision;
  reasonCodes: CheckInReasonCode[];
  message: string;
  criticalNotes?: string;
}

export interface CreateCheckInInput {
  memberId: UUID;
  branchId: UUID;
  source?: "search" | "qr" | "manual";
  entryPassToken?: string;
}

export interface OverrideCheckInInput extends CreateCheckInInput {
  reason: string;
}

export interface CheckInResult {
  checkInId?: UUID;
  decision: CheckInDecision;
  reasonCodes: CheckInReasonCode[];
  member: MemberSummary;
  membership?: MembershipSummary;
  occurredAt?: ISODateTime;
  message: string;
}

export interface CheckInSummary {
  id: UUID;
  memberId: UUID;
  memberName: string;
  memberNumber: string;
  branchId: UUID;
  branchName: string;
  decision: CheckInDecision;
  reasonCodes: CheckInReasonCode[];
  actorId?: UUID;
  actorName?: string;
  overrideReason?: string;
  occurredAt: ISODateTime;
}

export interface OccupancySnapshot {
  branchId: UUID;
  current: number;
  capacity: number;
  checkInsToday: number;
  peakHour: string;
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------

export type PaymentMethodKey = "cash" | "card" | "bank_transfer" | "cliq" | "other";

export interface PaymentMethod {
  key: PaymentMethodKey;
  label: string;
  enabled: boolean;
  affectsCashDrawer: boolean;
}

export interface Charge {
  id: UUID;
  organizationId: UUID;
  memberId: UUID;
  membershipId?: UUID;
  description: string;
  subtotal: Money;
  discount: Money;
  tax: Money;
  total: Money;
  paidAmount: Money;
  outstandingAmount: Money;
  status: PaymentStatus;
  createdAt: ISODateTime;
}

export type TransactionType = "payment" | "refund" | "void";
export type TransactionStatus = "completed" | "voided" | "refunded" | "partially_refunded";

export interface Payment {
  id: UUID;
  organizationId: UUID;
  branchId: UUID;
  memberId: UUID;
  chargeId?: UUID;
  type: TransactionType;
  amount: Money;
  method: PaymentMethodKey;
  status: TransactionStatus;
  receiptId: UUID;
  receiptNumber: string;
  collectedById: UUID;
  collectedByName: string;
  shiftId?: UUID;
  externalReference?: string;
  idempotencyKey: string;
  refundedAmount?: Money;
  refundReason?: string;
  voidReason?: string;
  originalPaymentId?: UUID; // for refunds
  occurredAt: ISODateTime;
}

export interface TransactionSummary extends Payment {
  memberName: string;
  memberNumber: string;
  branchName: string;
}

export interface Receipt {
  id: UUID;
  receiptNumber: string;
  paymentId: UUID;
  issuedAt: ISODateTime;
}

export interface ReceiptDetail {
  receipt: Receipt;
  organization: { name: string; receiptFooter: string; taxRatePercent: number };
  branch: { name: string; code: string; address: string; phone: string };
  member: { fullName: string; memberNumber: string };
  payment: Payment;
  charge?: Charge;
  relatedPayments: Payment[]; // refunds/voids linked to this payment
}

export interface CreatePaymentInput {
  memberId: UUID;
  chargeId?: UUID; // if omitted, applies to oldest outstanding charge
  amount: Money;
  method: PaymentMethodKey;
  externalReference?: string;
}

export interface RefundPaymentInput {
  amount?: Money; // defaults to full remaining amount
  reason: string;
}

export interface VoidPaymentInput {
  reason: string;
}

// Cash shifts & reconciliation

export interface CashShift {
  id: UUID;
  organizationId: UUID;
  branchId: UUID;
  openedById: UUID;
  openedByName: string;
  openedAt: ISODateTime;
  openingFloat: Money;
  closedAt?: ISODateTime;
  closedById?: UUID;
  expectedCash?: Money;
  countedCash?: Money;
  variance?: Money;
  varianceExplanation?: string;
  varianceApprovalStatus?: "none" | "pending" | "approved" | "rejected";
  status: "open" | "closed";
}

export interface OpenCashShiftInput {
  branchId: UUID;
  openingFloat: Money;
}

export interface CloseCashShiftInput {
  countedCash: Money;
  varianceExplanation?: string;
}

export interface ShiftTotals {
  cashPayments: Money;
  cashRefunds: Money;
  cardPayments: Money;
  transferPayments: Money;
  otherPayments: Money;
  paymentCount: number;
  refundCount: number;
  discountsTotal: Money;
}

export interface ReconciliationReport {
  branchId: UUID;
  date: ISODate;
  totalsByMethod: Array<{ method: PaymentMethodKey; payments: Money; refunds: Money; net: Money; count: number }>;
  totalCollected: Money;
  totalRefunded: Money;
  discountsTotal: Money;
  shifts: CashShift[];
  totalVariance: Money;
}

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

export type AutomationTriggerKey =
  | "membership_expiring" // params: daysBefore[]
  | "membership_expired"
  | "member_inactive" // params: days
  | "lead_untouched" // params: hours
  | "follow_up_overdue"
  | "payment_outstanding"; // params: days

export type AutomationActionKey = "create_task" | "queue_message" | "notify_manager";

export interface AutomationAction {
  key: AutomationActionKey;
  /** for queue_message */
  templateId?: UUID;
  channel?: "whatsapp" | "sms";
  /** for create_task */
  taskOwnerRole?: RoleKey;
  taskTitle?: string;
}

export interface AutomationRule {
  id: UUID;
  organizationId: UUID;
  name: string;
  trigger: AutomationTriggerKey;
  triggerParams: Record<string, number | number[] | string>;
  conditions?: Record<string, string | number>;
  actions: AutomationAction[];
  enabled: boolean;
  dedupeWindowHours: number;
  lastRunAt?: ISODateTime;
  executionsLast30Days: number;
  updatedAt: ISODateTime;
}

export interface CreateAutomationRuleInput {
  name: string;
  trigger: AutomationTriggerKey;
  triggerParams: Record<string, number | number[] | string>;
  actions: AutomationAction[];
  enabled: boolean;
  dedupeWindowHours: number;
}

export type UpdateAutomationRuleInput = Partial<CreateAutomationRuleInput>;

export interface AutomationExecution {
  id: UUID;
  ruleId: UUID;
  ruleName: string;
  subjectType: "member" | "lead" | "task" | "charge";
  subjectId: UUID;
  subjectName: string;
  action: AutomationActionKey;
  status: "success" | "failed" | "skipped_duplicate";
  detail?: string;
  executedAt: ISODateTime;
}

export interface MessageTemplate {
  id: UUID;
  name: string;
  channel: "whatsapp" | "sms";
  bodyEn: string;
  bodyAr: string;
  variables: string[];
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type AuditCategory =
  | "auth"
  | "members"
  | "memberships"
  | "payments"
  | "checkins"
  | "reconciliation"
  | "automations"
  | "users"
  | "settings";

export interface AuditEvent {
  id: UUID;
  organizationId: UUID;
  branchId?: UUID;
  actorId: UUID;
  actorName: string;
  actorRole: RoleKey;
  category: AuditCategory;
  action: string; // e.g. "payment.refund", "membership.freeze"
  entityType: string;
  entityId: UUID;
  entityLabel: string;
  summary: string;
  reason?: string;
  before?: Record<string, string | number | null>;
  after?: Record<string, string | number | null>;
  approvalStatus?: "pending" | "approved" | "rejected";
  correlationId: string;
  occurredAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface DashboardKpis {
  revenueToday: Money;
  revenueThisMonth: Money;
  revenuePrevMonth: Money;
  outstandingTotal: Money;
  newMembersThisMonth: number;
  renewalsDueNext7Days: number;
  expiredUnactioned: number;
  checkInsToday: number;
  activeLeads: number;
  overdueFollowUps: number;
}

export interface RevenuePoint {
  date: ISODate;
  collected: number; // minor units
  refunds: number;
}

export interface BranchRevenue {
  branchId: UUID;
  branchName: string;
  collected: Money;
  checkInsToday: number;
  activeMembers: number;
}

export interface FunnelStage {
  stage: LeadStage;
  label: string;
  count: number;
}

export interface SalespersonStat {
  userId: UUID;
  name: string;
  revenueCollected: Money;
  newSales: number;
  renewals: number;
  leadsConverted: number;
  followUpsCompleted: number;
  overdueFollowUps: number;
}

export interface DashboardAlert {
  id: string;
  kind:
    | "cash_variance"
    | "pending_discount"
    | "pending_variance"
    | "refund"
    | "checkin_override"
    | "payment_outstanding";
  title: string;
  detail: string;
  amount?: Money;
  actorName?: string;
  href: string;
  severity: "info" | "warning" | "critical";
  occurredAt: ISODateTime;
}

export interface DashboardData {
  kpis: DashboardKpis;
  revenueSeries: RevenuePoint[]; // last 30 days
  branchRevenue: BranchRevenue[];
  funnel: FunnelStage[];
  leaderboard: SalespersonStat[];
  alerts: DashboardAlert[];
  recentActivity: TimelineEvent[];
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface RoleDefinition {
  key: RoleKey;
  label: string;
  description: string;
  permissions: string[];
  discountLimitMinor: number; // max discount without approval, in minor units
  isSystem: boolean;
}

export interface OrganizationSettings {
  organization: Organization;
  branches: Branch[];
  paymentMethods: PaymentMethod[];
  roles: RoleDefinition[];
  notifications: NotificationSettings;
}

export interface NotificationSettings {
  managerAlerts: {
    cashVariance: boolean;
    refundOrVoid: boolean;
    checkinOverride: boolean;
    discountApproval: boolean;
  };
  automationDeliveryMode: "sandbox" | "live";
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export type UpdateOrganizationSettingsInput = Partial<{
  name: string;
  timezone: string;
  locale: string;
  defaultLanguage: "en" | "ar";
  taxRatePercent: number;
  receiptPrefix: string;
  receiptFooter: string;
}>;

export interface InviteUserInput {
  name: string;
  email: string;
  phone?: string;
  role: RoleKey;
  branchScope: BranchScope;
  branchIds: UUID[];
}

export interface UpdateUserAccessInput {
  role?: RoleKey;
  branchScope?: BranchScope;
  branchIds?: UUID[];
  status?: "active" | "deactivated";
}

export interface UpdateRolePermissionsInput {
  permissions?: string[];
  discountLimitMinor?: number;
}
