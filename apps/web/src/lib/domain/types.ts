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

export type AuditActorRole = RoleKey | "member";

export type BranchScope = "all" | "selected";

export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  subscriptionPlan?: "Starter" | "Growth" | "Pro";
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
  photoUrl?: string;
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
  /** Attributable consent state; legacy records may omit this detail. */
  marketingPreference?: MarketingPreference;
  notes?: string;
  sensitiveNotes?: string; // requires members.sensitive_notes.read
  archivedAt?: ISODateTime;
  stats: MemberStats;
}

export type MarketingPreferenceSource = "system_default" | "staff_selected" | "member_selected" | "imported";

export interface MarketingPreference {
  optedIn: boolean;
  /** Missing legacy values are migrated to unknown and suppressed for marketing. */
  status?: "explicit_opt_in" | "explicit_opt_out" | "unknown";
  source: MarketingPreferenceSource;
  changedAt?: ISODateTime;
  changedById?: UUID;
  wordingVersion?: string;
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
  marketingPreferenceSource?: MarketingPreferenceSource;
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
  /** PT credits granted for each new membership term. Legacy plans default to zero. */
  includedPtSessions: number;
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

export type PaymentStatus = "paid" | "partial" | "unpaid" | "refunded" | "void";

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
  /** Non-collectible balance for a successor term that has not begun yet. */
  upcomingAmount?: Money;
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
  | "branch_transfer"
  | "visit_adjustment"
  | "date_correction"
  | "plan_change";

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
  includedPtSessions?: number;
}

export type UpdatePlanInput = Partial<CreatePlanInput> & { status?: "active" | "archived" };

export interface CreateMembershipSaleInput {
  memberId: UUID;
  planId: UUID;
  startDate: ISODate;
  /** Replays the complete sale, including its charge/payment, safely. */
  idempotencyKey?: string;
  priceOverride?: Money;
  /** Required only when the listed price or standard start date is overridden. */
  overrideReason?: string;
  discount?: Money;
  discountReason?: string;
  payment?: {
    amount: Money;
    method: PaymentMethodKey;
    externalReference?: string;
  };
}

export interface RenewMembershipInput {
  planId?: UUID; // defaults to same plan
  startDate?: ISODate; // defaults to day after current end (or today if expired)
  /** Replays the complete renewal, including its charge/payment, safely. */
  idempotencyKey?: string;
  priceOverride?: Money;
  /** Required only when the listed price or standard renewal date is overridden. */
  overrideReason?: string;
  discount?: Money;
  discountReason?: string;
  payment?: { amount: Money; method: PaymentMethodKey; externalReference?: string };
}

export type MembershipPlanChangeEffectiveDate = "immediate" | "next_renewal";

export interface ChangeMembershipPlanInput {
  planId: UUID;
  effectiveDate?: MembershipPlanChangeEffectiveDate;
  reason: string;
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

export interface TransferMembershipInput {
  branchId: UUID;
  reason: string;
  /** Replays the transfer without appending another timeline or audit fact. */
  idempotencyKey?: string;
}

// ---------------------------------------------------------------------------
// Personal training
// ---------------------------------------------------------------------------

export type PtPackageSize = 12 | 20 | 30;
export type PtBookingStatus =
  | "reserved"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "late_cancelled"
  | "no_show"
  | "gym_cancelled";
export type PtEntitlementSource = "included" | "package" | "manual";
export type PtEntitlementStatus = "active" | "expired" | "revoked";
export type PtCreditLedgerType = "grant" | "reserve" | "release" | "consume" | "expire" | "refund_revoke" | "adjustment";

export interface PtTrainerProfile {
  id: UUID;
  organizationId: UUID;
  userId: UUID;
  displayName: string;
  bioEn?: string;
  bioAr?: string;
  specialties: string[];
  languages: PreferredLanguage[];
  branchIds: UUID[];
  photoUrl?: string;
  photoAlt?: string;
  status: "draft" | "published" | "archived";
  availabilityRules?: PtAvailabilityRule[];
  availabilityExceptions?: PtAvailabilityException[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PtAvailabilityRule {
  id: UUID;
  trainerProfileId: UUID;
  branchId: UUID;
  weekday: WeekdayKey;
  startMinute: number;
  endMinute: number;
  active: boolean;
}

export interface PtAvailabilityException {
  id: UUID;
  trainerProfileId: UUID;
  branchId: UUID;
  date: ISODate;
  startMinute?: number;
  endMinute?: number;
  reason?: string;
}

export interface PtPackage {
  id: UUID;
  organizationId: UUID;
  name: string;
  sessionCount: PtPackageSize;
  totalPrice: Money;
  validityDays: number;
  branchAccess: "all" | "selected";
  branchIds: UUID[];
  status: "active" | "archived";
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PtPackageOrder {
  id: UUID;
  organizationId: UUID;
  memberId: UUID;
  packageId: UUID;
  chargeId: UUID;
  /** Presentation-only payment context; public IDs stay out of operator copy. */
  memberName?: string;
  packageName?: string;
  paymentReference?: string;
  status: "pending_payment" | "active" | "partially_refunded" | "refunded" | "cancelled";
  entitlementId?: UUID;
  paidAt?: ISODateTime;
  refundedSessions?: number;
  refundedAmount?: Money;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PtEntitlement {
  id: UUID;
  organizationId: UUID;
  memberId: UUID;
  source: PtEntitlementSource;
  membershipId?: UUID;
  packageOrderId?: UUID;
  granted: number;
  reserved: number;
  consumed: number;
  revoked: number;
  available: number;
  startsAt?: ISODateTime;
  expiresAt: ISODateTime;
  status: PtEntitlementStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PtCreditLedgerEntry {
  id: UUID;
  entitlementId: UUID;
  memberId: UUID;
  bookingId?: UUID;
  type: PtCreditLedgerType;
  quantity: number;
  reason?: string;
  actorId?: UUID;
  occurredAt: ISODateTime;
}

export interface PtBooking {
  id: UUID;
  organizationId: UUID;
  memberId: UUID;
  memberName: string;
  trainerProfileId: UUID;
  trainerName: string;
  branchId: UUID;
  branchName: string;
  entitlementId: UUID;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  status: PtBookingStatus;
  cancellationReason?: string;
  outcomeReason?: string;
  bookedById?: UUID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PtAvailableSlot {
  trainerProfileId: UUID;
  branchId: UUID;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
}

export interface PtMemberExperience {
  organizationId: UUID;
  membershipId: UUID;
  availableSessions: number;
  reservedSessions: number;
  entitlements: PtEntitlement[];
  upcomingBookings: PtBooking[];
  orders: PtPackageOrder[];
  trainers: PtTrainerProfile[];
  packages: PtPackage[];
}

export interface PtWorkspace {
  trainers: PtTrainerProfile[];
  packages: PtPackage[];
  bookings: PtBooking[];
  pendingOrders: PtPackageOrder[];
  metrics: {
    packageRevenue: Money;
    sessionsUsed: number;
    sessionsReserved: number;
    upcomingBookings: number;
    noShows: number;
  };
}

export interface UpsertPtTrainerProfileInput {
  id?: UUID;
  userId: UUID;
  displayName: string;
  bioEn?: string;
  bioAr?: string;
  specialties: string[];
  languages: PreferredLanguage[];
  branchIds: UUID[];
  photoAssetId?: UUID;
  photoAlt?: string;
  status: "draft" | "published" | "archived";
}

export interface UpsertPtPackageInput {
  id?: UUID;
  name: string;
  sessionCount: PtPackageSize;
  totalPrice: Money;
  validityDays: number;
  branchAccess: "all" | "selected";
  branchIds: UUID[];
  status: "active" | "archived";
}

export interface ReplacePtAvailabilityInput {
  trainerProfileId: UUID;
  rules: Omit<PtAvailabilityRule, "id" | "trainerProfileId">[];
  exceptions: Omit<PtAvailabilityException, "id" | "trainerProfileId">[];
}

export interface CreatePtBookingInput {
  membershipId: UUID;
  trainerProfileId: UUID;
  branchId: UUID;
  startsAt: ISODateTime;
  idempotencyKey: string;
}

export interface ReschedulePtBookingInput {
  bookingId: UUID;
  trainerProfileId: UUID;
  branchId: UUID;
  startsAt: ISODateTime;
  reason: string;
  idempotencyKey: string;
}

export interface PtIntroductoryCreditPreview {
  eligibleMemberships: number;
  alreadyGranted: number;
  sessionCount: number;
}

export interface PtIntroductoryCreditApplyResult extends PtIntroductoryCreditPreview {
  grantedMemberships: number;
  migrationId: UUID;
}

export interface OperationalEmailActivationSettings {
  enabledKinds: string[];
  availableKinds: string[];
  /** Gym-controlled member service messages. */
  configurableKinds: string[];
  /** RIVET-controlled billing, subscription, and access notices. */
  mandatoryPlatformKinds: string[];
  liveWorkerEnabled: boolean;
  providerConfigured: boolean;
  webhookConfigured: boolean;
  ownerConfirmed: boolean;
  ownerConfirmedAt?: ISODateTime;
  ownerConfirmedBy?: string;
  updatedAt?: ISODateTime;
  updatedBy?: string;
  reason?: string;
}

export interface RequestPtPackageInput {
  membershipId: UUID;
  packageId: UUID;
  idempotencyKey: string;
}

export interface RefundPtPackageInput {
  sessions: number;
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

export type TrialBookingStatus =
  | "requested"
  | "confirmed"
  | "completed"
  | "no_show"
  | "cancelled"
  | "converted";

export interface LeadTrialBooking {
  id: UUID;
  customerId?: UUID;
  gymId: UUID;
  branchId: UUID;
  fullName: string;
  email: string;
  phone: string;
  preferredDate: ISODate;
  preferredTime: string;
  goal: string;
  status: TrialBookingStatus;
  createdAt: ISODateTime;
  leadId?: UUID;
}

export interface LeadDetail extends LeadSummary {
  notes?: string;
  activities: TimelineEvent[];
  offers: Offer[];
  trialBooking?: LeadTrialBooking;
}

export interface Offer {
  id: UUID;
  leadId?: UUID;
  memberId?: UUID;
  planId: UUID;
  planName: string;
  price: Money;
  expiresAt?: ISODateTime;
  status: "draft" | "sent" | "accepted" | "declined" | "expired";
  deliveryChannel?: OfferDeliveryChannel;
  deliveredAt?: ISODateTime;
  deliveredById?: UUID;
  deliveryReference?: string;
  createdById: UUID;
  createdAt: ISODateTime;
}

export type OfferDeliveryChannel = "email" | "whatsapp" | "sms" | "manual";

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
  ownerId?: UUID | "unassigned";
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
  marketingOptIn?: boolean;
  marketingPreferenceSource?: MarketingPreferenceSource;
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
  | "offer_drafted"
  | "offer_sent"
  | "membership_sold"
  | "membership_renewed"
  | "membership_plan_changed"
  | "marketing_preference_changed"
  | "membership_frozen"
  | "membership_unfrozen"
  | "membership_extended"
  | "membership_cancelled"
  | "membership_transferred"
  | "payment_collected"
  | "payment_refunded"
  | "payment_voided"
  | "check_in"
  | "trial_confirmed"
  | "trial_completed"
  | "trial_no_show"
  | "trial_cancelled"
  | "lead_converted"
  | "pt_credit_granted"
  | "pt_package_requested"
  | "pt_package_activated"
  | "pt_booking_reserved"
  | "pt_booking_rescheduled"
  | "pt_booking_cancelled"
  | "pt_session_completed"
  | "pt_session_no_show"
  | "pt_credit_refunded"
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
  | "OUTSIDE_OPERATING_HOURS"
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
  /** Tenant-local calendar date on which the invoice was issued. */
  issueDate?: ISODate;
  /** Tenant-local calendar date on which collection becomes permitted. */
  dueDate?: ISODate;
  /** Server-derived. False for future, void, and refunded invoices. */
  collectible?: boolean;
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
  idempotencyKey: string;
}

export interface VoidPaymentInput {
  reason: string;
  idempotencyKey: string;
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
  subjectType: "member" | "membership" | "lead" | "task" | "charge";
  subjectId: UUID;
  subjectName: string;
  action?: AutomationActionKey;
  status: "queued" | "running" | "completed" | "suppressed" | "retrying" | "failed" | "success" | "skipped_duplicate";
  detail?: string;
  dedupeKey?: string;
  suppressionReason?: string;
  actionResults?: Array<{
    key: AutomationActionKey;
    status: "queued" | "completed" | "suppressed" | "retrying" | "failed";
    taskId?: UUID;
    messageId?: UUID;
    notificationId?: UUID;
    suppressionReason?: string;
  }>;
  attemptHistory?: Array<{
    action: AutomationActionKey;
    attempt: number;
    status: "queued" | "completed" | "suppressed" | "retrying" | "failed";
    occurredAt: ISODateTime;
    reason?: string;
    nextAttemptAt?: ISODateTime;
  }>;
  retryPolicy?: { maxAttempts: number; backoffMinutes: number[] };
  nextAttemptAt?: ISODateTime;
  executedAt: ISODateTime;
}

export interface AutomationExecutionDetail extends AutomationExecution {
  actionResults: NonNullable<AutomationExecution["actionResults"]>;
  attemptHistory: NonNullable<AutomationExecution["attemptHistory"]>;
  retryPolicy: NonNullable<AutomationExecution["retryPolicy"]>;
}

export interface AutomationRunPreview {
  ruleId: UUID;
  ruleName: string;
  eligibleCount: number;
  duplicateCount: number;
  candidates: Array<{
    subjectType: AutomationExecution["subjectType"];
    subjectId: UUID;
    subjectName: string;
    branchId?: UUID;
    duplicate: boolean;
  }>;
}

export interface MessageTemplate {
  id: UUID;
  name: string;
  channel: "whatsapp" | "sms";
  bodyEn: string;
  bodyAr: string;
  variables: string[];
}

export interface OperationalEmailDelivery {
  id: UUID;
  kind: string;
  templateVersion: string;
  language: "en" | "ar";
  recipientReference: string;
  recipientEmail?: string;
  dedupeKey: string;
  providerId?: string;
  attempts: Array<{ attempt: number; status: string; occurredAt: ISODateTime; error?: string }>;
  retryPolicy: { maxAttempts: number; backoffMinutes: number[] };
  nextAttemptAt?: ISODateTime;
  status: "queued" | "provider_accepted" | "delivered" | "failed" | "suppressed";
  suppressionReason?: string;
  queuedAt: ISODateTime;
  updatedAt: ISODateTime;
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
  | "crm"
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
  actorRole: AuditActorRole;
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
  operationalPolicies: OperationalPolicies;
}

export type MediaAssetOwnerType = "gym_logo" | "gym_cover" | "gym_gallery" | "trainer_photo" | "member_photo";

export interface MediaAsset {
  id: UUID;
  organizationId: UUID;
  ownerType: MediaAssetOwnerType;
  ownerId: UUID;
  storageId: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
  altText?: string;
  visibility: "public" | "private";
  status: "pending" | "active" | "replaced" | "scheduled_for_deletion";
  url?: string;
  deleteAfter?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface GymPublicProfile {
  organizationId: UUID;
  version: number;
  status: "draft" | "published" | "unpublished";
  shortName: string;
  taglineEn: string;
  taglineAr?: string;
  descriptionEn: string;
  descriptionAr?: string;
  category: string;
  audience: string;
  amenities: string[];
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  accentColor: string;
  logo?: MediaAsset;
  cover?: MediaAsset;
  gallery: MediaAsset[];
  trainers: PtTrainerProfile[];
  ptPackages: PtPackage[];
  publishedAt?: ISODateTime;
  updatedAt: ISODateTime;
}

export interface GymProfileVersion {
  id: UUID;
  organizationId: UUID;
  version: number;
  status: "published" | "unpublished";
  profile: GymPublicProfile;
  publishedAt?: ISODateTime;
  unpublishedAt?: ISODateTime;
  updatedAt: ISODateTime;
}

export interface UpdateGymPublicProfileInput {
  shortName: string;
  taglineEn: string;
  taglineAr?: string;
  descriptionEn: string;
  descriptionAr?: string;
  category: string;
  audience: string;
  amenities: string[];
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
  instagramUrl?: string;
  accentColor: string;
  logoAssetId?: UUID;
  coverAssetId?: UUID;
  galleryAssetIds: UUID[];
}

export type WeekdayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export interface OperatingHoursDay {
  enabled: boolean;
  opensAt: string;
  closesAt: string;
}

export interface BranchOperatingHours {
  branchId: UUID;
  days: Record<WeekdayKey, OperatingHoursDay>;
}

export interface TrialScheduleDay {
  /** Exact tenant-local start times offered for trial requests on this weekday. */
  slots: string[];
}

export interface BranchTrialSchedule {
  branchId: UUID;
  days: Record<WeekdayKey, TrialScheduleDay>;
}

export interface OperationalPolicies {
  entry: {
    outstandingBalance: "allow" | "warn" | "block";
    expiryWarningDays: number;
    duplicateScanWindowMinutes: number;
    enforceOperatingHours: boolean;
  };
  membership: {
    allowOverlappingMemberships: boolean;
    renewalWindowDays: number;
    minimumFreezeDays: number;
    maximumExtensionDays: number;
  };
  operatingHours: BranchOperatingHours[];
  trialSchedules: BranchTrialSchedule[];
  personalTraining: {
    sessionDurationMinutes: 60;
    bookingHorizonDays: number;
    cancellationCutoffHours: number;
  };
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
