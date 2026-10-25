import type { SubscriptionAddOns, SubscriptionInvoiceLine } from "../../../convex/subscriptionAddOns";
import type { MemberImportErrorMessage } from "../imports/member-import-errors";
import type { PromoDiscount, PromoTarget, PromoUnavailableReason } from "../../../convex/firstPayment";
export type { PromoDiscount, PromoTarget, PromoUnavailableReason };
import type { SystemMessage } from "../i18n/system-messages";
import type {
  AuditCategory,
  AuditEvent,
  AtRiskMemberItem,
  AtRiskMemberQuery,
  AccountingAccount,
  AccountingJournalEntryDetail,
  AccountingJournalEntrySummary,
  AccountingJournalQuery,
  AccountingPeriod,
  AccountingSourcePosting,
  AccountingSourcePostingQuery,
  RefreshAccountingSourceQueueInput,
  RefreshAccountingSourceQueueResult,
  AccountingTrialBalance,
  BalanceSheet,
  CashflowStatement,
  PostAccountingSourceInput,
  ReviewAccountingSourceInput,
  PostManualJournalInput,
  AutomationExecution,
  AutomationExecutionDetail,
  AutomationRule,
  AutomationRunPreview,
  Branch,
  BrandKit,
  CancelMembershipInput,
  CashShift,
  CheckInPreview,
  CheckInResult,
  CheckInSummary,
  CloseCashShiftInput,
  CompleteTaskInput,
  CompleteLeadSaleInput,
  CompleteLeadSaleResult,
  ContactAttemptInput,
  CreateAutomationRuleInput,
  CreateCheckInInput,
  CreateLeadInput,
  CreateMemberInput,
  CreateMemberMembershipSaleInput,
  CreateMemberMembershipSaleResult,
  CreateMemberResult,
  CreateMembershipSaleInput,
  ChangeMembershipPlanInput,
  CreatePaymentInput,
  CreatePlanInput,
  CreateTaskInput,
  DashboardData,
  DeleteProductInput,
  DeleteProductResult,
  DuplicateMatch,
  ExtendMembershipInput,
  FreezeMembershipInput,
  InviteUserInput,
  LeadDetail,
  LeadStage,
  LeadSummary,
  ListQuery,
  MemberDetail,
  MemberStatus,
  MemberSummary,
  MembershipDetail,
  MembershipEffectiveStatus,
  MembershipPlan,
  MembershipSaleResult,
  MembershipSummary,
  MessageTemplate,
  Money,
  NotificationSettings,
  OperationalEmailDelivery,
  OccupancySnapshot,
  Offer,
  OfferDeliveryChannel,
  OfferOutcome,
  OpenCashShiftInput,
  OrganizationSettings,
  OperationalPolicies,
  OverrideCheckInInput,
  Page,
  PaymentMethod,
  PaymentMethodKey,
  PaymentStatus,
  ReconciliationReport,
  ReceiptDetail,
  RetailCheckoutInput,
  RefundRetailSaleInput,
  RefundPaymentInput,
  RenewalQueueItem,
  RenewMembershipInput,
  TransferMembershipInput,
  RoleDefinition,
  RoleKey,
  ScheduleLeadTrialInput,
  Session,
  StaffUser,
  Task,
  TimelineEvent,
  TimelineEventType,
  TransactionSummary,
  TransactionType,
  UpdateAutomationRuleInput,
  UpdateLeadInput,
  UpdateMemberInput,
  UpdateOrganizationSettingsInput,
  UpdateBrandKitInput,
  UpdateWorkspaceModulePreferencesInput,
  WorkspaceAccess,
  OrganizationEntitlements,
  GeneralManagerAnalysis,
  IncomeStatement,
  ManagementReportInput,
  WorkspaceModulePreferences,
  WorkspaceModuleKey,
  WorkspaceModuleStatus,
  Zone,
  UpsertZoneInput,
  UpdatePlanInput,
  UpdateRolePermissionsInput,
  UpdateUserAccessInput,
  UpdateUserProfileInput,
  UserProfile,
  VoidPaymentInput,
  VoidRetailSaleInput,
  ISODate,
  UUID,
} from "@/lib/domain/types";
import type { CustomerMembership, CustomerPersona, CustomerProfileInput, CustomerReferralProgram, MarketplaceGym, TrialBooking } from "@/lib/public/experience-data";
import type {
  CustomerFinancialSummary,
  CustomerReceipt,
  CustomerTransaction,
  CustomerTransactionQuery,
  BulkOperationInput,
  BulkOperationJob,
  SavedView,
  SavedViewSurface,
  DuplicateCase,
  DuplicateCaseQuery,
  MergeMemberInput,
  OnboardingAudience,
  OnboardingExperience,
  PushSubscriptionInput,
  PushSubscriptionSummary,
  AutomationMonitoringSummary,
  ExportJob,
  ExportRequestInput,
  WorkspaceSearchResult,
  RecentWorkspaceItem,
  PinnedWorkspaceItem,
} from "@/lib/domain/qol";

// ---------------------------------------------------------------------------
// Query inputs
// ---------------------------------------------------------------------------

export interface MemberListQuery extends ListQuery {
  status?: MemberStatus;
  membershipStatus?: MembershipEffectiveStatus | "outstanding";
  branchId?: UUID;
  planId?: UUID;
}

export interface TimelineQuery extends ListQuery {
  types?: TimelineEventType[];
}

export interface PlanListQuery extends ListQuery {
  status?: "active" | "archived";
}

export interface MembershipListQuery extends ListQuery {
  status?: MembershipEffectiveStatus;
  branchId?: UUID;
  memberId?: UUID;
  paymentStatus?: PaymentStatus;
}

export interface LeadListQuery extends ListQuery {
  stage?: LeadStage | LeadStage[];
  ownerId?: UUID | "unassigned";
  branchId?: UUID;
  overdueOnly?: boolean;
}

export interface TaskListQuery extends ListQuery {
  status?: "open" | "completed" | "cancelled";
  ownerId?: UUID;
  /** Only tasks about this member / lead; the member record must never list the whole gym's work. */
  memberId?: UUID;
  leadId?: UUID;
  dueBefore?: string;
  overdueOnly?: boolean;
}

export interface RenewalQueueQuery extends ListQuery {
  branchId?: UUID;
  bucket?: "expiring" | "expired";
  /** Maximum number of days to look forward/back from the tenant-local today. */
  days?: number;
  /** Optional inclusive end-date range. The server caps this to the previous year. */
  fromDate?: ISODate;
  toDate?: ISODate;
}

export interface RecentCheckInQuery extends ListQuery {
  branchId?: UUID;
  memberId?: UUID;
  since?: string;
  /** Tenant-local business date (YYYY-MM-DD). */
  date?: ISODate;
  /** Excludes blocked entry attempts so attendance views show actual visits. */
  acceptedOnly?: boolean;
}

export interface TransactionListQuery extends ListQuery {
  branchId?: UUID;
  method?: PaymentMethodKey;
  type?: TransactionType;
  memberId?: UUID;
  from?: string;
  to?: string;
}

export interface ExecutionQuery extends ListQuery {
  ruleId?: UUID;
}

export interface AuditQuery extends ListQuery {
  category?: AuditCategory;
  approvalStatus?: "pending" | "approved" | "rejected";
  actorId?: UUID;
  entityId?: UUID;
  branchId?: UUID;
  from?: string;
  to?: string;
}

export interface UserListQuery extends ListQuery {
  role?: RoleKey;
  status?: "active" | "invited" | "deactivated";
}

export interface MemberImportRow {
  rowNumber: number;
  fullName: string;
  phone: string;
  gender?: "male" | "female";
  email?: string;
  status: "valid" | "duplicate" | "invalid" | "committed" | "skipped";
  errors: string[];
  /** Optional structured projection; original row errors remain unchanged. */
  errorMessages?: MemberImportErrorMessage[];
  duplicateMemberIds: string[];
  memberId?: string;
  sourcePlanName?: string;
  planId?: UUID;
  planName?: string;
  membershipStartDate?: string;
  membershipEndDate?: string;
  remainingVisits?: number;
  freezeStartDate?: string;
  freezeEndDate?: string;
  openingBalanceMinor?: number;
  historicalPaidMinor?: number;
  historicalPaymentDate?: string;
  historicalPaymentReference?: string;
}

export type MemberImportField =
  | "fullName"
  | "phone"
  | "gender"
  | "email"
  | "sourcePlanName"
  | "membershipStartDate"
  | "membershipEndDate"
  | "remainingVisits"
  | "freezeStartDate"
  | "freezeEndDate"
  | "openingBalance"
  | "historicalPaidTotal"
  | "historicalPaymentDate"
  | "historicalPaymentReference";
export type MemberImportColumnMapping = Partial<Record<MemberImportField, number>>;
export type MemberImportPlanMapping = Record<string, UUID>;
export type MemberImportStatus = "preview" | "processing" | "completed" | "undoing" | "undone";

export interface MemberImportPreviewInput {
  csv: string;
  branchId: UUID;
  sourceFileName?: string;
  sourceKind?: "csv" | "xlsx" | "pasted";
  sourceHeaders?: string[];
  columnMapping?: MemberImportColumnMapping;
  migrationCutoffDate?: string;
  planMappings?: MemberImportPlanMapping;
}

export interface MemberImportPreview {
  id: string;
  branchId: string;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
  rows: MemberImportRow[];
  status?: MemberImportStatus;
  cursor?: number;
  committedCount?: number;
  skippedCount?: number;
  sourceFileName?: string;
  sourceKind?: "csv" | "xlsx" | "pasted";
  sourceHeaders?: string[];
  columnMapping?: MemberImportColumnMapping;
  migrationCutoffDate?: string;
  planMappings?: MemberImportPlanMapping;
  membershipRows?: number;
  openingBalanceRows?: number;
  historicalEvidenceRows?: number;
  currency?: string;
  undoExpiresAt?: string;
  createdAt: string;
  completedAt?: string;
  undoneAt?: string;
  undoCursor?: number;
  undoArchivedCount?: number;
  undoSkippedCount?: number;
}

export type MemberImportSummary = Omit<MemberImportPreview, "rows">;

export interface MemberImportCommitInput {
  importId: string;
  cursor?: number;
  chunkSize?: number;
  idempotencyKey: string;
}

export interface MemberImportCommitResult {
  importId: string;
  status: "processing" | "completed";
  cursor: number;
  totalRows: number;
  committedCount: number;
  skippedCount: number;
  failedCount: number;
  createdMemberIds: string[];
  errors: Array<{ rowNumber: number; message: string }>;
}

export interface MemberImportUndoInput {
  importId: string;
  cursor?: number;
  chunkSize?: number;
  idempotencyKey: string;
  reason: string;
}

export interface MemberImportUndoResult {
  importId: string;
  status: "undoing" | "undone";
  cursor: number;
  totalCreated: number;
  archivedCount: number;
  skippedCount: number;
}

export interface DashboardQuery {
  branchId?: UUID;
  from: string;
  to: string;
}

export interface OperatingBriefQuery {
  branchId?: UUID;
}

export interface PlatformBillingInvoice {
  id: string;
  gymId?: string;
  gym: string;
  amount: string;
  amountMinor?: number;
  currency?: string;
  date: string;
  issuedAt?: string;
  dueAt?: string;
  periodStart?: string;
  periodEnd?: string;
  /** Deterministic subscription cycle key; prevents duplicate automation invoices. */
  cycleKey?: string;
  billingInterval?: BillingInterval;
  /** The term at list price, before any credit is applied. */
  lines?: SubscriptionInvoiceLine[];
  addOns?: SubscriptionAddOns;
  subtotalMinor?: number;
  /** One-time setup fee included in the first term invoice, when applicable. */
  onboardingFeeMinor?: number;
  /** What the unfinished part of a replaced term was worth, deducted from the amount. */
  creditMinor?: number;
  /** Unused paid days behind that credit. */
  creditDays?: number;
  paymentReference?: string;
  paidAt?: string;
  pastDueAt?: string;
  voidedAt?: string;
  status: "draft" | "open" | "paid" | "past_due" | "void" | "failed" | "trial";
  /** A new gym's first invoice: its term starts when the payment is confirmed. */
  firstPayment?: boolean;
  /** Website add-on on a first invoice: what it adds, its price before a free place, and whether a free place covered it. */
  websiteMinor?: number;
  websiteListMinor?: number;
  websiteFree?: boolean;
  promoCode?: string;
  promoTarget?: PromoTarget;
  promoPercentOff?: number;
  promoAmountOffMinor?: number;
  discountMinor?: number;
  subscriptionDiscountMinor?: number;
  /** A code the gym applied with that no longer worked when its invoice was made. */
  promoNotApplied?: { code: string; reason: PromoUnavailableReason };
  /** Payment details the gym sent from its payment page. */
  paymentClaim?: PaymentClaim;
  /** Owner asked the operator to return this immutable submitted claim. */
  paymentCorrection?: { claimSubmittedAt: string; claimSubmissionId?: string; requestedAt: string; reason: string };
  /** An upgrade the gym asked for itself; the plan changes when RIVET confirms the payment. */
  planChange?: { from?: PlatformSaasPlan["name"]; to: PlatformSaasPlan["name"] };
  /** Immutable quote funding; old-plan usage is settled only on activation. */
  quoteValidUntil?: string;
  creditBasis?: import("../../../convex/subscriptionTerm").OutgoingTerm;
  upgradeActivation?: import("../../../convex/subscriptionTerm").UpgradeActivation;
  /** The support request that follows this payment, for a gym that can open its workspace. */
  supportCaseId?: string;
}

export type PlatformPaymentMethod = "cliq" | "bank_transfer";

export interface PaymentClaim {
  submissionId?: string;
  status: "submitted" | "rejected" | "confirmed";
  method: PlatformPaymentMethod;
  reference: string;
  payerName: string;
  /** The day the gym says it paid, YYYY-MM-DD. */
  paidOn: string;
  note?: string;
  amountMinor: number;
  submittedAt: string;
  submittedBy?: { id: string; name: string };
  rejectedAt?: string;
  /** Shown to the gym, so it can correct and send again. */
  rejectionReason?: string;
  confirmedAt?: string;
}

/** Where gyms send payments, as RIVET's team set it in the console. Empty strings are not set yet. */
export interface PlatformPaymentDetails {
  cliqAlias: string;
  cliqName: string;
  bankName: string;
  accountName: string;
  iban: string;
  note: string;
}

/** The payment page: the gym, the invoice to pay next and how to pay it. */
export interface BillingCheckout {
  gym: {
    id?: string;
    name: string;
    status: "trial" | "pending_payment" | "active" | "past_due" | "suspended" | "cancelled";
    plan?: "Basic" | "Starter" | "Growth" | "Pro" | "Enterprise";
    billingInterval: BillingInterval;
    currentPeriodEndsAt?: string;
    timezone: string;
  };
  invoice?: PlatformBillingInvoice;
  paymentDetails: PlatformPaymentDetails;
  /** Only the owner (or someone who manages settings) sends payment details. */
  canPay: boolean;
  canRequestCorrection?: boolean;
  /** When a paying gym's access stops if this invoice stays unpaid. */
  accessEndsAt?: string;
}

/** One bigger plan a gym can move to, priced for today. */
export interface PlanChangeOption {
  plan: PlatformSaasPlan["name"];
  monthlyPriceMinor: number;
  /** One term of the new plan at list price. */
  subtotalMinor: number;
  /** What the unused days of the paid term are worth, taken off. */
  creditMinor: number;
  creditDays: number;
  onboardingFeeMinor: number;
  /** What the gym pays to upgrade. */
  amountMinor: number;
}

export interface BillingPlans {
  plan?: PlatformSaasPlan["name"];
  /** What the gym pays a month on its plan now; an Enterprise gym's own quote. */
  monthlyPriceMinor?: number;
  billingInterval: BillingInterval;
  status: BillingCheckout["gym"]["status"];
  currentPeriodEndsAt?: string;
  options: PlanChangeOption[];
  /** Why the plan cannot be changed now, when it cannot. */
  blockedReason?: "owner_only" | "not_active";
  /** An upgrade waiting for its payment or for RIVET to confirm it. */
  pending?: PlatformBillingInvoice;
}

export interface SubmitPlatformPaymentInput {
  organizationId?: string;
  invoiceId: string;
  method: PlatformPaymentMethod;
  reference: string;
  payerName: string;
  paidOn: string;
  note?: string;
}

export interface PromoCodeCheck {
  valid: boolean;
  reason?: PromoUnavailableReason;
  promo?: PromoDiscount;
}

export interface PlatformPromoCode {
  id: string;
  code: string;
  note: string;
  target: PromoTarget;
  percentOff?: number;
  amountOffMinor?: number;
  /** Empty means every plan. */
  plans: Array<PlatformSaasPlan["name"]>;
  maxRedemptions?: number;
  expiresOn?: string;
  active: boolean;
  uses: number;
  state: "active" | "paused" | "expired" | "used_up";
  createdAt: string;
}

export interface CreatePromoCodeInput {
  code: string;
  note: string;
  target: PromoTarget;
  percentOff?: number;
  amountOffMinor?: number;
  plans: Array<PlatformSaasPlan["name"]>;
  maxRedemptions?: number;
  expiresOn?: string;
  reason: string;
}

/** Platform console → Promos. */
export interface PlatformCommerceView {
  websiteOffer: {
    enabled: boolean;
    places: number;
    priceMinor: number;
    claimed: number;
    /** Gyms holding a free place, in the order they got it. */
    holders: Array<{ place: number; gym: string; invoiceId: string; status: string; issuedAt?: string }>;
  };
  paymentDetails: PlatformPaymentDetails;
  promoCodes: PlatformPromoCode[];
}

export type BillingInterval = "monthly" | "annual";

export interface CreatePlatformInvoiceInput {
  gymId: string;
  amountMinor: number;
  currency?: string;
  dueAt: string;
  periodStart: string;
  periodEnd: string;
  billingInterval?: BillingInterval;
  cycleKey?: string;
}

export interface RecordPlatformInvoicePaymentInput {
  invoiceId: string;
  reference: string;
  reason: string;
  paidAt?: string;
}

export type PlatformDataState = "available" | "not_available" | "not_configured";

export type PlatformData<T> =
  | { state: "available"; value: T }
  | { state: "not_available" }
  | { state: "not_configured" };

export interface PlatformGymDetailBranch {
  id: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  status: "active" | "inactive";
}

export interface PlatformGymMember {
  id: string;
  memberNumber: string;
  name: string;
  status: "active" | "inactive" | "archived";
  branchId?: string;
  branchName?: string;
  membershipStatus?: string;
  planName?: string;
  membershipEndDate?: string;
  joinedAt?: string;
}

export interface PlatformGymStaff {
  id: string;
  name: string;
  /** Sign-in identifier for operationally distinguishing same-name invitees. */
  email: string;
  role: string;
  status: "active" | "invited" | "deactivated";
  branchScope: "all" | "selected";
  branchIds: string[];
  branchNames: string[];
  invitationStatus?: "pending" | "accepted" | "revoked";
  joinedAt?: string;
}

export interface PlatformGymOwner {
  name: string;
  email: string;
  phone?: string;
}

export interface PlatformGymActivity {
  id: string;
  action: string;
  summary: string;
  actorName: string;
  occurredAt: string;
}

/**
 * Platform-only detail data. Values are either backed by the selected tenant
 * or deliberately marked unavailable/configuration-dependent. The platform
 * route must not manufacture a value to fill an empty provider boundary.
 */
export interface PlatformGymDetail {
  id: string;
  name: string;
  shortName: string;
  accent: string;
  /** Safe URL for the published gym logo; unavailable/configured states stay
   * explicit so the admin surface can fall back to initials. */
  logoUrl?: PlatformData<string>;
  controls: {
    status: MarketplaceGym["subscriptionStatus"];
    plan: MarketplaceGym["rivetPlan"];
    isPublic: boolean;
    isArchived?: boolean;
    archivedAt?: string;
    archiveReason?: string;
  };
  organization: PlatformData<{
    id: UUID;
    name: string;
    status: "trial" | "pending_payment" | "active" | "past_due" | "suspended" | "cancelled";
    currency: string;
    timezone: string;
    archivedAt?: string;
    archiveReason?: string;
  }>;
  /** Public-page review state: the live version plus any tenant draft
   * awaiting the platform team's publish. */
  publicPage: PlatformData<{ publishedVersion: number; draftVersion?: number; draftStatus?: string; draftUpdatedAt?: string }>;
  joinedAt: PlatformData<string>;
  branches: PlatformData<PlatformGymDetailBranch[]>;
  /** Complete tenant-scoped directory rows; the detail UI paginates these
   * client-side while retaining access to the full result. */
  members: PlatformData<PlatformGymMember[]>;
  staff: PlatformData<PlatformGymStaff[]>;
  owner: PlatformData<PlatformGymOwner>;
  /** The active subscription agreement; not_configured until the owner signs. */
  agreement: PlatformData<import("@/lib/domain/types").PlatformAgreementSummary>;
  usage: {
    memberCount: PlatformData<number>;
    activeStaffCount: PlatformData<number>;
    staffLimit: PlatformData<number>;
    automationRuleCount: PlatformData<number>;
    paymentTransactionCount: PlatformData<number>;
    storage: PlatformData<string>;
  };
  subscription: {
    plan: PlatformData<MarketplaceGym["rivetPlan"]>;
    billingInterval?: PlatformData<BillingInterval>;
    status: PlatformData<MarketplaceGym["subscriptionStatus"]>;
    startedAt: PlatformData<string>;
    trialEndsAt: PlatformData<string>;
    currentPeriodEndsAt: PlatformData<string>;
    cancelledAt: PlatformData<string>;
    statusReason: PlatformData<string>;
    recurringAmount: PlatformData<Money>;
    renewalDate: PlatformData<string>;
    paymentMethod: PlatformData<string>;
    invoices: PlatformData<PlatformBillingInvoice[]>;
  };
  activity: PlatformData<PlatformGymActivity[]>;
}

export interface PlatformSupportCase {
  id: string;
  gymId?: string;
  gym: string;
  branchId?: string;
  branchName?: string;
  creatorId?: string;
  creatorName?: string;
  creatorEmail?: string;
  subject: string;
  body?: string;
  age?: string;
  priority: "urgent" | "normal";
  status: "open" | "waiting" | "resolved";
  assigneeId?: string;
  assigneeName?: string;
  createdAt?: string;
  firstResponseAt?: string;
  updatedAt?: string;
  resolvedAt?: string;
  resolutionSummary?: string;
  /** Structured metadata for workflows such as a plan-change request. */
  requestType?: "general" | "plan_upgrade" | "billing";
  /** A payment the gym sent, followed from sent to confirmed. */
  billing?: SupportPaymentRequest;
  requestedPlan?: PlatformSaasPlan["name"];
  billingInterval?: "monthly" | "annual";
  messages?: PlatformSupportMessage[];
}

export interface SupportPaymentRequest {
  invoiceId: string;
  kind: "upgrade" | "payment";
  planFrom?: PlatformSaasPlan["name"];
  planTo?: PlatformSaasPlan["name"];
  currency: string;
  amountMinor: number;
  method?: PlatformPaymentMethod;
  reference?: string;
  state: "sent" | "returned" | "confirmed" | "cancelled";
  sentAt?: string;
  returnedAt?: string;
  /** RIVET's message when it sent the payment back. */
  returnReason?: string;
  confirmedAt?: string;
}

export interface PlatformSupportMessage {
  id: string;
  caseId: string;
  authorType: "gym" | "platform";
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface CreateSupportCaseInput {
  branchId?: string;
  email: string;
  subject: string;
  body: string;
  priority: PlatformSupportCase["priority"];
  requestType?: PlatformSupportCase["requestType"];
  requestedPlan?: PlatformSupportCase["requestedPlan"];
  billingInterval?: PlatformSupportCase["billingInterval"];
}

export interface PlatformOperatorQueueItem {
  id: string;
  severity: "danger" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
  occurredAt?: string;
}

export interface OperationalNotification {
  id: string;
  kind: string;
  /** Original stored text (English); render through `presentNotification` for the reader's language. */
  title: string;
  body: string;
  /** Optional stable descriptors; absent on authored or older records. */
  titleMessage?: SystemMessage;
  bodyMessage?: SystemMessage;
  href: string;
  dedupeKey: string;
  organizationId?: string;
  branchId?: string;
  readAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface PlatformOverview {
  gymCounts: Record<"trial" | "pending_payment" | "active" | "past_due" | "suspended" | "cancelled", number>;
  branchCount: number;
  memberCount: number;
  activeStaffCount: number;
  activeMrr: Money;
  invoiceTotals: {
    collected: Money;
    outstanding: Money;
    overdue: Money;
  };
  /** Count of legacy/invalid invoices excluded from JOD monetary totals. */
  billingCurrencyMismatches: number;
  trialRequests: number;
  trialConversions: number;
  pendingApplications: number;
  provisioningFailures: number;
  pastDueAccounts: number;
  trialsExpiringSoon: number;
  openSupportCases: number;
  urgentSupportCases: number;
  billingHistory: Array<{
    month: string;
    issued: Money;
    collected: Money;
    outstanding: Money;
  }>;
  operatorQueue: PlatformOperatorQueueItem[];
}

export interface PlatformSaasPlan {
  commercialTermsVersion?: string;
  name: "Basic" | "Starter" | "Growth" | "Pro" | "Enterprise";
  priceMinor: number;
  branches: number;
  staff: number;
  members: number;
  /** One-time gym setup fee in JOD minor units; absent on older API payloads. */
  onboardingFeeMinor?: number;
  /** Monthly allowance for operational emails; absent on older API payloads. */
  operationalEmails?: number;
  tone: "paper" | "signal" | "night";
  /** Server-owned workspace modules included in this tier. */
  entitledModules?: WorkspaceModuleKey[];
}

/**
 * The free-website offer on public pricing. `claimed` counts gyms holding a
 * free place, capped at `places`; no gym is named. `enabled` and `priceMinor`
 * are absent on older payloads.
 */
export interface WebsiteOffer {
  places: number;
  claimed: number;
  enabled?: boolean;
  priceMinor?: number;
}

export interface SubmitGymApplicationInput {
  gymName: string;
  /** Physical address where the applicant's gym operates. */
  gymAddress: string;
  ownerName: string;
  email: string;
  contactNumber: string;
  plan: PlatformSaasPlan["name"];
  /** Defaults to monthly for legacy clients. */
  billingInterval?: BillingInterval;
  /** Client retry key; never used as an authorization credential. */
  idempotencyKey?: string;
  /** The applicant's language for their own emails (the form's current language). Absent means English. */
  language?: "en" | "ar";
  /** Deliberately invisible browser honeypot. Bots filling it receive a generic success. */
  website?: string;
  /** Launch offers chosen on the form. */
  websiteRequested?: boolean;
  promoCode?: string;
}

export type GymApplicationStatus = "pending" | "under_review" | "approved" | "rejected";
export type GymApplicationNotificationStatus = "pending" | "sent" | "failed" | "not_configured";
export type GymProvisioningStatus = "not_started" | "in_progress" | "completed" | "failed";
export type GymProvisioningOutcome = "complete" | "partial" | "retryable" | "permanent";

export interface PlatformGymApplication {
  id: UUID;
  gymName: string;
  /** Required for new applications; optional for historical rows created before address capture. */
  gymAddress?: string;
  ownerName: string;
  email: string;
  contactNumber: string;
  plan: PlatformSaasPlan["name"];
  billingInterval?: BillingInterval;
  /** The applicant asked for a custom website; its price is fixed on the first invoice. */
  websiteRequested?: boolean;
  /** A promo code that worked when the gym applied. */
  promoCode?: string;
  /** Enterprise only: the monthly price RIVET quoted, recorded on approval. */
  quotedPriceMinor?: number;
  status: GymApplicationStatus;
  notificationStatus: GymApplicationNotificationStatus;
  notificationError?: string;
  reviewNotificationStatus: GymApplicationNotificationStatus;
  reviewNotificationError?: string;
  submittedAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNotes?: string;
  provisioningStatus?: GymProvisioningStatus;
  provisioningCheckpoint?: "claimed" | "organization_recorded" | "workspace_ready" | "invitation_recorded" | "completed";
  provisioningOutcome?: GymProvisioningOutcome;
  provisioningAttemptCount?: number;
  provisioningLastCorrelationId?: string;
  provisioningProviderStatus?: number;
  provisioningProviderCode?: string;
  provisioningStartedAt?: string;
  provisioningError?: string;
  provisionedAt?: string;
  provisionedOrganizationId?: UUID;
  provisionedBranchId?: UUID;
  clerkOrganizationId?: string;
  clerkInvitationId?: string;
  clerkInvitationStatus?: "pending" | "accepted" | "revoked" | "expired" | "failed";
}

export interface ReviewGymApplicationInput {
  applicationId: UUID;
  decision: Exclude<GymApplicationStatus, "pending">;
  note?: string;
  /** Required to approve an Enterprise application: the quoted monthly price in JOD minor units. */
  quotedPriceMinor?: number;
}

export interface SaveGymApplicationReviewNoteInput {
  applicationId: UUID;
  /** An empty string intentionally clears the platform-only note. */
  note: string;
}

export interface ProvisionGymInput {
  applicationId: UUID;
}

export interface GymProvisioningResult {
  applicationId: UUID;
  status: "completed";
  organizationId: UUID;
  organizationName: string;
  branchId: UUID;
  branchName: string;
  plan: PlatformSaasPlan["name"];
  billingInterval?: BillingInterval;
  ownerName: string;
  ownerEmail: string;
  clerkOrganizationId: string;
  clerkInvitationId: string;
}

export interface SubmitGymApplicationResult {
  applicationId: UUID;
  status: GymApplicationStatus;
  notificationStatus: GymApplicationNotificationStatus;
  submittedAt: string;
  duplicate: boolean;
}

export interface PlatformSnapshot {
  gyms: import("@/lib/public/experience-data").MarketplaceGym[];
  bookings: import("@/lib/public/experience-data").TrialBooking[];
  invoices: PlatformBillingInvoice[];
  supportCases: PlatformSupportCase[];
  plans: PlatformSaasPlan[];
  applications: PlatformGymApplication[];
  auditEvents: PlatformGymActivity[];
  overview: PlatformOverview;
}

export interface MarketingPreferenceMigrationPreview {
  profileCount: number;
  memberCount: number;
  totalCount: number;
  targetStatus: "unknown";
  marketingDelivery: "suppressed";
}

export interface MarketingPreferenceMigrationProgress {
  id: string;
  status: "running" | "completed" | "failed";
  previewCount: number;
  processedCount: number;
  failedCount: number;
  remainingCount: number;
}

export interface CreateOfferInput {
  leadId: UUID;
  planId: UUID;
  price: Money;
  expiresInDays?: number;
}

export interface MarkOfferDeliveredInput {
  channel: OfferDeliveryChannel;
  reference?: string;
}

export interface RecordOfferOutcomeInput {
  outcome: OfferOutcome;
  reason?: string;
}

/** Platform-only controls for a subscribed tenant. The public directory row
 * and the backing Convex organization are updated together when a match is
 * available; this keeps the console from being a read-only mock surface. */
export interface UpdatePlatformGymInput {
  addOns?: SubscriptionAddOns;
  expectedAddOnsRevision?: number;
  gymId: string;
  status?: import("@/lib/public/experience-data").MarketplaceGym["subscriptionStatus"];
  plan?: import("@/lib/public/experience-data").MarketplaceGym["rivetPlan"];
  billingInterval?: BillingInterval;
  /** Optional override for the paid membership boundary. When omitted on a
   * change that activates or re-prices the subscription, the server derives
   * the new term (today + interval + unused-day credit) and issues the term
   * invoice. Trial ends remain server-derived from onboarding. */
  currentPeriodEndsAt?: string;
  isPublic?: boolean;
  /** An Enterprise gym's monthly price in JOD minor units, agreed by quote.
   * Required when moving a gym onto Enterprise; a new quote on an active gym
   * starts a new term billed at it. Refused for any other plan. */
  quotedPriceMinor?: number;
  reason: string;
}

/**
 * Archives a gym from the platform directory while retaining its financial
 * and audit history. This is an archive-only operation: no tenant records are
 * deleted and the platform detail route remains available for audit review.
 */
export interface ArchivePlatformGymInput {
  gymId: string;
  confirmation: string;
  reason: string;
}

export interface UpdatePlatformPlanInput {
  name: PlatformSaasPlan["name"];
  priceMinor?: number;
  branches?: number;
  staff?: number;
  members?: number;
  onboardingFeeMinor?: number;
  operationalEmails?: number;
  entitledModules?: WorkspaceModuleKey[];
  reason: string;
}

export interface EntryPass {
  token: string;
  expiresAt: string;
  membershipId: string;
}

/**
 * Identity-scoped member data used by the My Gyms experience. Keeping this
 * response together at the API boundary lets adapters add a realtime delivery
 * mechanism without exposing Convex records to page components.
 */
export interface CustomerExperience {
  customer?: CustomerPersona;
  memberships: CustomerMembership[];
  bookings: TrialBooking[];
}

// ---------------------------------------------------------------------------
// The page-facing client boundary. Production uses ConvexGymOSApi; mock mode
// remains available only for explicit preview/test workflows.
// ---------------------------------------------------------------------------

export interface GymOSApi {
  // Session
  getSession(): Promise<Session>;
  selectOrganization(organizationId: UUID): Promise<Session>;
  switchDemoRole(
    role: RoleKey,
    branchId?: UUID,
    identity?: Pick<Session["user"], "name" | "email">,
  ): Promise<Session>;
  setActiveBranch(branchId: UUID | undefined): Promise<Session>;
  signOut(): Promise<void>;

  // Public directory, customer identity, and platform snapshots
  listMarketplaceGyms(): Promise<MarketplaceGym[]>;
  subscribeMarketplaceGyms(onValue: (gyms: MarketplaceGym[]) => void, onError?: (error: unknown) => void): Promise<() => void>;
  getPublicOffer(token: string): Promise<import("@/lib/domain/types").PublicOffer>;
  respondToPublicOffer(token: string, input: { outcome: OfferOutcome; reason?: string }): Promise<import("@/lib/domain/types").PublicOffer>;
  getCustomerExperience(): Promise<CustomerExperience>;
  /**
   * Subscribe to identity-scoped member changes. The disposer is returned in
   * a promise so a native Convex watch can perform its initial read before the
   * caller considers the subscription established.
   */
  subscribeCustomerExperience(onValue: (experience: CustomerExperience) => void, onError?: (error: unknown) => void): Promise<() => void>;
  registerCustomer(input: CustomerProfileInput & { fullName: string; email: string }): Promise<CustomerPersona>;
  updateCustomerProfile(input: CustomerProfileInput): Promise<CustomerPersona>;
  /** The optional customerId is used only by the deterministic mock; Convex derives identity from Clerk. */
  updateCustomerMarketingPreference(input: { optedIn: boolean; customerId?: string }): Promise<CustomerPersona>;
  createTrialBooking(input: Omit<TrialBooking, "id" | "createdAt" | "status" | "customerId" | "leadId"> & { customerId?: string; referralToken?: string }): Promise<TrialBooking>;
  ensureCustomerReferralLink(membershipId: UUID): Promise<CustomerReferralProgram>;

  // --- Read-only operational analytics (Reports area) ---
  getPeakHoursReport(input: import("@/lib/domain/types").AnalyticsReportInput): Promise<import("@/lib/domain/types").PeakHoursReport>;
  getClassUtilizationReport(input: import("@/lib/domain/types").AnalyticsReportInput): Promise<import("@/lib/domain/types").ClassUtilizationReport>;
  getRetentionReport(input: import("@/lib/domain/types").AnalyticsBranchInput): Promise<import("@/lib/domain/types").RetentionReport>;
  getRenewalForecastReport(input: import("@/lib/domain/types").AnalyticsBranchInput): Promise<import("@/lib/domain/types").RenewalForecastReport>;
  getCollectionsReport(input: import("@/lib/domain/types").AnalyticsReportInput): Promise<import("@/lib/domain/types").CollectionsReport>;
  getCrmFunnelReport(input: import("@/lib/domain/types").AnalyticsReportInput): Promise<import("@/lib/domain/types").CrmFunnelReport>;
  getControlTrendsReport(input: import("@/lib/domain/types").AnalyticsReportInput): Promise<import("@/lib/domain/types").ControlTrendsReport>;

  // --- Daily branch checklists ---
  listChecklistAssignees(branchId: UUID): Promise<Array<{ id: UUID; name: string }>>;
  assignChecklistRun(input: { templateId: UUID; date?: string; assignedUserId?: UUID }): Promise<import("@/lib/domain/types").ChecklistRun>;
  listChecklistTemplates(input?: { branchId?: UUID }): Promise<import("@/lib/domain/types").ChecklistTemplate[]>;
  upsertChecklistTemplate(input: import("@/lib/domain/types").UpsertChecklistTemplateInput): Promise<import("@/lib/domain/types").ChecklistTemplate>;
  getChecklistDay(input: { branchId: UUID; date?: string }): Promise<import("@/lib/domain/types").ChecklistDay>;
  setChecklistItem(input: import("@/lib/domain/types").SetChecklistItemInput): Promise<import("@/lib/domain/types").ChecklistRun>;
  createChecklistMaintenanceTask(input: import("@/lib/domain/types").CreateChecklistTaskInput): Promise<import("@/lib/domain/types").ChecklistRun>;
  getEntryPass(membershipId: string): Promise<EntryPass>;
  getCustomerFinancialSummary(): Promise<CustomerFinancialSummary>;
  listCustomerTransactions(query: CustomerTransactionQuery): Promise<Page<CustomerTransaction>>;
  getCustomerReceipt(receiptId: UUID): Promise<CustomerReceipt>;
  listSavedViews(surface: SavedViewSurface): Promise<SavedView[]>;
  saveSavedView(input: { id?: UUID; surface: SavedViewSurface; name: string; state: Record<string, unknown>; isDefault?: boolean }): Promise<SavedView>;
  deleteSavedView(viewId: UUID): Promise<void>;
  runBulkOperation(input: BulkOperationInput): Promise<BulkOperationJob>;
  listBulkOperationJobs(): Promise<BulkOperationJob[]>;
  listDuplicateCases(query?: DuplicateCaseQuery): Promise<Page<DuplicateCase>>;
  getDuplicateCase(caseId: UUID): Promise<DuplicateCase>;
  ignoreDuplicateCase(caseId: UUID, reason: string): Promise<DuplicateCase>;
  mergeDuplicateMembers(input: MergeMemberInput): Promise<DuplicateCase>;
  getOnboardingExperience(audience: OnboardingAudience): Promise<OnboardingExperience>;
  updateOnboardingProgress(input: { audience: OnboardingAudience; completedStepKey?: string; dismissed?: boolean; restart?: boolean }): Promise<OnboardingExperience>;
  listPushSubscriptions(): Promise<PushSubscriptionSummary[]>;
  savePushSubscription(input: PushSubscriptionInput): Promise<PushSubscriptionSummary>;
  revokePushSubscription(subscriptionId: UUID): Promise<void>;
  getPlatformSnapshot(): Promise<PlatformSnapshot>;
  subscribePlatformSnapshot(onValue: (snapshot: PlatformSnapshot) => void, onError?: (error: unknown) => void): Promise<() => void>;
  getPlatformGymDetail(gymId: string): Promise<PlatformGymDetail>;
  subscribePlatformGymDetail(gymId: string, onValue: (detail: PlatformGymDetail) => void, onError?: (error: unknown) => void): Promise<() => void>;
  listPublicSaasPlans(): Promise<PlatformSaasPlan[]>;
  subscribePublicSaasPlans(onValue: (plans: PlatformSaasPlan[]) => void, onError?: (error: unknown) => void): Promise<() => void>;
  subscribeWebsiteOffer(onValue: (offer: WebsiteOffer) => void, onError?: (error: unknown) => void): Promise<() => void>;
  checkPromoCode(input: { code: string; plan: PlatformSaasPlan["name"] }): Promise<PromoCodeCheck>;
  getPlatformCommerce(): Promise<PlatformCommerceView>;
  updateWebsiteOffer(input: { enabled: boolean; places: number; priceMinor: number; reason: string }): Promise<PlatformCommerceView>;
  updatePaymentDetails(input: PlatformPaymentDetails & { reason: string }): Promise<PlatformCommerceView>;
  createPromoCode(input: CreatePromoCodeInput): Promise<PlatformCommerceView>;
  setPromoCodeActive(input: { promoId: string; active: boolean; reason: string }): Promise<PlatformCommerceView>;
  rejectPlatformInvoicePayment(input: { invoiceId: string; reason: string }): Promise<PlatformBillingInvoice>;
  getBillingCheckout(organizationId?: string): Promise<BillingCheckout>;
  submitPlatformPayment(input: SubmitPlatformPaymentInput): Promise<BillingCheckout>;
  requestPaymentCorrection(input: { invoiceId: string; reason: string; organizationId?: string }): Promise<BillingCheckout>;
  getBillingPlans(): Promise<BillingPlans>;
  /** Asks to move up to a bigger plan; returns the payment page for the new invoice. */
  requestPlanChange(input: { plan: PlatformSaasPlan["name"]; organizationId?: string }): Promise<BillingCheckout>;
  cancelPlanChange(input: { invoiceId: string }): Promise<BillingPlans>;
  submitGymApplication(input: SubmitGymApplicationInput): Promise<SubmitGymApplicationResult>;
  listGymApplications(query?: { status?: GymApplicationStatus; search?: string }): Promise<PlatformGymApplication[]>;
  subscribePlatformApplications(onValue: (applications: PlatformGymApplication[]) => void, onError?: (error: unknown) => void): Promise<() => void>;
  reviewGymApplication(input: ReviewGymApplicationInput): Promise<PlatformGymApplication>;
  saveGymApplicationReviewNote(input: SaveGymApplicationReviewNoteInput): Promise<PlatformGymApplication>;
  provisionGym(input: ProvisionGymInput): Promise<GymProvisioningResult>;
  updatePlatformGym(input: UpdatePlatformGymInput): Promise<import("@/lib/public/experience-data").MarketplaceGym>;
  archivePlatformGym?(input: ArchivePlatformGymInput): Promise<void>;
  /** Reviews and publishes the tenant's saved public-page draft. */
  publishPlatformGymProfile(input: { gymId: string; reason: string }): Promise<{ id: string; publishedVersion: number }>;
  updatePlatformPlan(input: UpdatePlatformPlanInput): Promise<PlatformSaasPlan>;
  /** The gym's own platform invoices, newest first; drafts are not shown. */
  listMyPlatformInvoices(): Promise<PlatformBillingInvoice[]>;
  createPlatformInvoice(input: CreatePlatformInvoiceInput): Promise<PlatformBillingInvoice>;
  issuePlatformInvoice(invoiceId: string): Promise<PlatformBillingInvoice>;
  markPlatformInvoicePastDue(invoiceId: string, reason: string): Promise<PlatformBillingInvoice>;
  recordPlatformInvoicePayment(input: RecordPlatformInvoicePaymentInput): Promise<PlatformBillingInvoice>;
  voidPlatformInvoice(invoiceId: string, reason: string): Promise<PlatformBillingInvoice>;
  listSupportCases(): Promise<PlatformSupportCase[]>;
  subscribeSupportCases(onValue: (cases: PlatformSupportCase[]) => void, onError?: (error: unknown) => void): Promise<() => void>;
  createSupportCase(input: CreateSupportCaseInput): Promise<PlatformSupportCase>;
  replyToSupportCase(caseId: string, body: string): Promise<PlatformSupportCase>;
  resolvePlatformSupportCase(caseId: string, resolutionSummary: string): Promise<PlatformSupportCase>;
  reopenPlatformSupportCase(caseId: string): Promise<PlatformSupportCase>;
  assignPlatformSupportCase(caseId: string, assigneeId?: string): Promise<PlatformSupportCase>;
  replyToPlatformSupportCase(caseId: string, body: string): Promise<PlatformSupportCase>;
  listNotifications(): Promise<OperationalNotification[]>;
  subscribeNotifications(onValue: (notifications: OperationalNotification[]) => void, onError?: (error: unknown) => void): Promise<() => void>;
  setNotificationRead(notificationId: string, read: boolean): Promise<OperationalNotification>;
  markAllNotificationsRead(): Promise<void>;
  previewMarketingPreferenceMigration(): Promise<MarketingPreferenceMigrationPreview>;
  applyMarketingPreferenceMigration(input: { migrationId?: string; batchSize?: number; reason: string }): Promise<MarketingPreferenceMigrationProgress>;

  // Dashboard
  getDashboard(query: DashboardQuery): Promise<DashboardData>;
  /** The evidence-backed daily operating brief for the caller's own scope: exact queues, figures, sources and mandatory items, read on open or explicit refresh only. */
  getOperatingBrief(query: OperatingBriefQuery): Promise<import("@/lib/domain/types").OperatingBrief>;
  subscribeDashboard(query: DashboardQuery, onValue: (dashboard: DashboardData) => void, onError?: (error: unknown) => void): Promise<() => void>;

  // Members
  listMembers(query: MemberListQuery): Promise<Page<MemberSummary>>;
  getMember(memberId: UUID): Promise<MemberDetail>;
  subscribeMember(memberId: UUID, onValue: (member: MemberDetail) => void, onError?: (error: unknown) => void): Promise<() => void>;
  createMember(input: CreateMemberInput): Promise<CreateMemberResult>;
  createMemberMembershipSale(input: CreateMemberMembershipSaleInput): Promise<CreateMemberMembershipSaleResult>;
  updateMember(memberId: UUID, input: UpdateMemberInput): Promise<MemberDetail>;
  archiveMember(memberId: UUID, input: { reason: string }): Promise<void>;
  deleteMember(memberId: UUID, input: { reason: string; confirmation: string }): Promise<void>;
  checkMemberDuplicates(input: { phone?: string; email?: string }): Promise<DuplicateMatch[]>;
  listMemberTimeline(memberId: UUID, query?: TimelineQuery): Promise<Page<TimelineEvent>>;
  addMemberNote(memberId: UUID, input: { body: string }): Promise<TimelineEvent>;
  logMemberContactAttempt(memberId: UUID, input: ContactAttemptInput): Promise<TimelineEvent>;
  /** The deterministic follow-up context for one member: renewal target, journey status, consent and suppression, quiet hours, queued reminders with truthful wording, recorded evidence and open work. */
  getMemberFollowUpContext(memberId: UUID): Promise<import("@/lib/domain/types").MemberFollowUpContext>;

  // Plans
  listPlans(query: PlanListQuery): Promise<Page<MembershipPlan>>;
  createPlan(input: CreatePlanInput): Promise<MembershipPlan>;
  updatePlan(planId: UUID, input: UpdatePlanInput): Promise<MembershipPlan>;

  // Public gym profile
  getGymPublicProfile(): Promise<import("@/lib/domain/types").GymPublicProfile>;
  subscribeGymPublicProfile(onValue: (profile: import("@/lib/domain/types").GymPublicProfile) => void, onError?: (error: unknown) => void): Promise<() => void>;
  listGymProfileVersions(): Promise<import("@/lib/domain/types").GymProfileVersion[]>;
  saveGymPublicProfile(input: import("@/lib/domain/types").UpdateGymPublicProfileInput): Promise<import("@/lib/domain/types").GymPublicProfile>;
  publishGymPublicProfile(): Promise<import("@/lib/domain/types").GymPublicProfile>;
  unpublishGymPublicProfile(reason: string): Promise<import("@/lib/domain/types").GymPublicProfile>;
  uploadMediaAsset(input: { ownerType: import("@/lib/domain/types").MediaAssetOwnerType; ownerId: UUID; altText?: string; file: Blob }): Promise<import("@/lib/domain/types").MediaAsset>;
  discardDraftMediaAsset(assetId: UUID): Promise<void>;

  // Personal training
  getPtWorkspace(): Promise<import("@/lib/domain/types").PtWorkspace>;
  subscribePtWorkspace(onValue: (workspace: import("@/lib/domain/types").PtWorkspace) => void, onError?: (error: unknown) => void): Promise<() => void>;
  getPtMemberExperience(membershipId: UUID): Promise<import("@/lib/domain/types").PtMemberExperience>;
  subscribePtMemberExperience(membershipId: UUID, onValue: (experience: import("@/lib/domain/types").PtMemberExperience) => void, onError?: (error: unknown) => void): Promise<() => void>;
  getCustomerPtExperience(membershipId: UUID): Promise<import("@/lib/domain/types").PtMemberExperience>;
  subscribeCustomerPtExperience(membershipId: UUID, onValue: (experience: import("@/lib/domain/types").PtMemberExperience) => void, onError?: (error: unknown) => void): Promise<() => void>;
  upsertPtTrainerProfile(input: import("@/lib/domain/types").UpsertPtTrainerProfileInput): Promise<import("@/lib/domain/types").PtTrainerProfile>;
  upsertPtPackage(input: import("@/lib/domain/types").UpsertPtPackageInput): Promise<import("@/lib/domain/types").PtPackage>;
  deletePtPackage(packageId: UUID, reason: string): Promise<void>;
  replacePtAvailability(input: import("@/lib/domain/types").ReplacePtAvailabilityInput): Promise<import("@/lib/domain/types").PtTrainerProfile>;
  listPtAvailableSlots(input: { trainerProfileId: UUID; branchId: UUID; from: ISODate; to: ISODate }): Promise<import("@/lib/domain/types").PtAvailableSlot[]>;
  listCustomerPtAvailableSlots(input: { membershipId: UUID; trainerProfileId: UUID; branchId: UUID; from: ISODate; to: ISODate }): Promise<import("@/lib/domain/types").PtAvailableSlot[]>;
  createPtBooking(input: import("@/lib/domain/types").CreatePtBookingInput): Promise<import("@/lib/domain/types").PtBooking>;
  createCustomerPtBooking(input: import("@/lib/domain/types").CreatePtBookingInput): Promise<import("@/lib/domain/types").PtBooking>;
  cancelPtBooking(bookingId: UUID, input: { reason: string; cancelledByGym?: boolean }): Promise<import("@/lib/domain/types").PtBooking>;
  cancelCustomerPtBooking(bookingId: UUID, reason: string): Promise<import("@/lib/domain/types").PtBooking>;
  reschedulePtBooking(input: import("@/lib/domain/types").ReschedulePtBookingInput): Promise<import("@/lib/domain/types").PtBooking>;
  rescheduleCustomerPtBooking(input: import("@/lib/domain/types").ReschedulePtBookingInput): Promise<import("@/lib/domain/types").PtBooking>;
  completePtBooking(bookingId: UUID, input?: { reason?: string }): Promise<import("@/lib/domain/types").PtBooking>;
  markPtBookingNoShow(bookingId: UUID, input?: { reason?: string }): Promise<import("@/lib/domain/types").PtBooking>;
  requestPtPackage(input: import("@/lib/domain/types").RequestPtPackageInput): Promise<import("@/lib/domain/types").PtPackageOrder>;
  requestCustomerPtPackage(input: import("@/lib/domain/types").RequestPtPackageInput): Promise<import("@/lib/domain/types").PtPackageOrder>;
  cancelPtPackageOrder(orderId: UUID, input: import("@/lib/domain/types").CancelPtPackageInput): Promise<import("@/lib/domain/types").PtPackageOrder>;
  refundPtPackage(orderId: UUID, input: import("@/lib/domain/types").RefundPtPackageInput): Promise<import("@/lib/domain/types").PtPackageOrder>;
  previewPtIntroductoryCredits(sessionCount?: number): Promise<import("@/lib/domain/types").PtIntroductoryCreditPreview>;
  applyPtIntroductoryCredits(input: { sessionCount: number; reason: string; idempotencyKey: string }): Promise<import("@/lib/domain/types").PtIntroductoryCreditApplyResult>;

  // Memberships
  listMemberships(query: MembershipListQuery): Promise<Page<MembershipSummary>>;
  getMembership(membershipId: UUID): Promise<MembershipDetail>;
  subscribeMembership(membershipId: UUID, onValue: (membership: MembershipDetail) => void, onError?: (error: unknown) => void): Promise<() => void>;
  createMembershipSale(input: CreateMembershipSaleInput): Promise<MembershipSaleResult>;
  renewMembership(membershipId: UUID, input: RenewMembershipInput): Promise<MembershipSaleResult>;
  changeMembershipPlan(membershipId: UUID, input: ChangeMembershipPlanInput): Promise<MembershipSaleResult>;
  freezeMembership(membershipId: UUID, input: FreezeMembershipInput): Promise<MembershipDetail>;
  /** Member self-service freeze requests, decided by staff under the gym's policy. */
  requestMembershipFreeze(input: import("@/lib/domain/types").RequestMembershipFreezeInput): Promise<import("@/lib/domain/types").MembershipFreezeRequest>;
  getCustomerFreezePolicy(membershipId: UUID): Promise<import("@/lib/domain/types").CustomerFreezePolicy>;
  listCustomerFreezeRequests(membershipId: UUID): Promise<import("@/lib/domain/types").MembershipFreezeRequest[]>;
  listFreezeRequests(query?: { status?: import("@/lib/domain/types").FreezeRequestStatus }): Promise<import("@/lib/domain/types").MembershipFreezeRequest[]>;
  decideFreezeRequest(input: import("@/lib/domain/types").DecideFreezeRequestInput): Promise<import("@/lib/domain/types").MembershipFreezeRequest>;
  unfreezeMembership(membershipId: UUID, input: { reason: string }): Promise<MembershipDetail>;
  extendMembership(membershipId: UUID, input: ExtendMembershipInput): Promise<MembershipDetail>;
  cancelMembership(membershipId: UUID, input: CancelMembershipInput): Promise<MembershipDetail>;
  transferMembership(membershipId: UUID, input: TransferMembershipInput): Promise<MembershipDetail>;

  // CRM
  listLeads(query: LeadListQuery): Promise<Page<LeadSummary>>;
  subscribeLeads(query: LeadListQuery, onValue: (page: Page<LeadSummary>) => void, onError?: (error: unknown) => void): Promise<() => void>;
  getLead(leadId: UUID): Promise<LeadDetail>;
  subscribeLead(leadId: UUID, onValue: (lead: LeadDetail) => void, onError?: (error: unknown) => void): Promise<() => void>;
  createLead(input: CreateLeadInput): Promise<LeadDetail>;
  updateLead(leadId: UUID, input: UpdateLeadInput): Promise<LeadDetail>;
  updateLeadContact(leadId: UUID, input: import("@/lib/domain/types").UpdateLeadContactInput): Promise<LeadDetail>;
  logContactAttempt(leadId: UUID, input: ContactAttemptInput): Promise<LeadDetail>;
  updateTrialBooking(
    bookingId: UUID,
    input: { status: Extract<import("@/lib/domain/types").TrialBookingStatus, "confirmed" | "completed" | "no_show" | "cancelled">; note?: string },
  ): Promise<LeadDetail>;
  scheduleLeadTrial(leadId: UUID, input: ScheduleLeadTrialInput): Promise<LeadDetail>;
  createOffer(input: CreateOfferInput): Promise<Offer>;
  markOfferDelivered(offerId: UUID, input: MarkOfferDeliveredInput): Promise<Offer>;
  recordOfferOutcome(offerId: UUID, input: RecordOfferOutcomeInput): Promise<Offer>;
  listTasks(query: TaskListQuery): Promise<Page<Task>>;
  subscribeTasks(query: TaskListQuery, onValue: (page: Page<Task>) => void, onError?: (error: unknown) => void): Promise<() => void>;
  createFollowUp(input: CreateTaskInput): Promise<Task>;
  completeTask(taskId: UUID, input: CompleteTaskInput): Promise<Task>;
  completeLeadSale(leadId: UUID, input: CompleteLeadSaleInput): Promise<CompleteLeadSaleResult>;
  listRenewalQueue(query: RenewalQueueQuery): Promise<Page<RenewalQueueItem>>;
  subscribeRenewalQueue(query: RenewalQueueQuery, onValue: (page: Page<RenewalQueueItem>) => void, onError?: (error: unknown) => void): Promise<() => void>;
  listAtRiskMembers(query: AtRiskMemberQuery): Promise<Page<AtRiskMemberItem>>;
  subscribeAtRiskMembers(query: AtRiskMemberQuery, onValue: (page: Page<AtRiskMemberItem>) => void, onError?: (error: unknown) => void): Promise<() => void>;
  snoozeAtRiskMember(input: import("@/lib/domain/types").SnoozeAtRiskMemberInput): Promise<void>;

  // Check-in
  previewCheckIn(input: { branchId: UUID; query: string }): Promise<CheckInPreview>;
  createCheckIn(input: CreateCheckInInput): Promise<CheckInResult>;
  overrideCheckIn(input: OverrideCheckInInput): Promise<CheckInResult>;
  listRecentCheckIns(query: RecentCheckInQuery): Promise<Page<CheckInSummary>>;
  subscribeRecentCheckIns(query: RecentCheckInQuery, onValue: (page: Page<CheckInSummary>) => void, onError?: (error: unknown) => void): Promise<() => void>;
  getOccupancy(branchId: UUID): Promise<OccupancySnapshot>;
  subscribeOccupancy(branchId: UUID, onValue: (occupancy: OccupancySnapshot) => void, onError?: (error: unknown) => void): Promise<() => void>;

  // Payments & shifts
  listTransactions(query: TransactionListQuery): Promise<Page<TransactionSummary>>;
  subscribeTransactions(query: TransactionListQuery, onValue: (page: Page<TransactionSummary>) => void, onError?: (error: unknown) => void): Promise<() => void>;
  createPayment(input: CreatePaymentInput, idempotencyKey: string): Promise<ReceiptDetail>;
  refundPayment(paymentId: UUID, input: RefundPaymentInput): Promise<ReceiptDetail>;
  voidPayment(paymentId: UUID, input: VoidPaymentInput): Promise<ReceiptDetail>;
  getReceipt(receiptId: UUID): Promise<ReceiptDetail>;
  checkoutRetail(input: RetailCheckoutInput): Promise<ReceiptDetail & { receiptId: UUID; retailSale: import("@/lib/domain/types").RetailSale }>;
  refundRetailSale(saleId: UUID, input: RefundRetailSaleInput): Promise<ReceiptDetail & { retailSale: import("@/lib/domain/types").RetailSale }>;
  voidRetailSale(saleId: UUID, input: VoidRetailSaleInput): Promise<ReceiptDetail & { retailSale: import("@/lib/domain/types").RetailSale }>;
  openCashShift(input: OpenCashShiftInput): Promise<CashShift>;
  getCurrentCashShift(branchId: UUID): Promise<CashShift | null>;
  getCurrentShiftTotals(branchId: UUID): Promise<{ shift: CashShift; totals: import("@/lib/domain/types").ShiftTotals } | null>;
  subscribeCurrentShiftTotals(branchId: UUID, onValue: (value: { shift: CashShift; totals: import("@/lib/domain/types").ShiftTotals } | null) => void, onError?: (error: unknown) => void): Promise<() => void>;
  closeCashShift(shiftId: UUID, input: CloseCashShiftInput): Promise<CashShift>;
  listCashShifts(query: { branchId?: UUID; page?: number; pageSize?: number }): Promise<Page<CashShift>>;
  subscribeCashShifts(query: { branchId?: UUID; page?: number; pageSize?: number }, onValue: (page: Page<CashShift>) => void, onError?: (error: unknown) => void): Promise<() => void>;
  reviewVariance(shiftId: UUID, input: { decision: "approved" | "rejected"; note: string }): Promise<CashShift>;
  getDailyReconciliation(query: { branchId: UUID; date: ISODate }): Promise<ReconciliationReport>;

  // Immutable management-accounting ledger (Pro finance workspace)
  listAccountingAccounts(query?: { search?: string }): Promise<AccountingAccount[]>;
  listAccountingPeriods(query?: { status?: import("@/lib/domain/types").AccountingPeriodStatus }): Promise<AccountingPeriod[]>;
  listAccountingJournalEntries(query?: AccountingJournalQuery): Promise<Page<AccountingJournalEntrySummary>>;
  getAccountingJournalEntry(entryId: UUID): Promise<AccountingJournalEntryDetail>;
  getAccountingTrialBalance(query?: { branchId?: UUID; periodId?: UUID }): Promise<AccountingTrialBalance>;
  postManualJournal(input: PostManualJournalInput): Promise<AccountingJournalEntryDetail>;
  listAccountingSourcePostings(query?: AccountingSourcePostingQuery): Promise<Page<AccountingSourcePosting>>;
  refreshAccountingSourceQueue(input?: RefreshAccountingSourceQueueInput): Promise<RefreshAccountingSourceQueueResult>;
  postAccountingSource(input: PostAccountingSourceInput): Promise<AccountingSourcePosting>;
  /** Owner/manager review: permanently exclude a never-postable fact from the books (audited). */
  excludeAccountingSource(input: ReviewAccountingSourceInput): Promise<AccountingSourcePosting>;
  /** Reverses a review exclusion; the row returns to what the operational fact says. */
  reconsiderAccountingSource(input: ReviewAccountingSourceInput): Promise<AccountingSourcePosting>;
  reverseAccountingEntry(entryId: UUID, input: { reason: string; idempotencyKey: string }): Promise<AccountingJournalEntryDetail>;
  closeAccountingPeriod(periodId: UUID, reason: string): Promise<AccountingPeriod>;
  reopenAccountingPeriod(periodId: UUID, reason: string): Promise<AccountingPeriod>;

  // Management statements and general-manager analysis (Pro reporting workspace)
  getIncomeStatement(input: ManagementReportInput): Promise<IncomeStatement>;
  getBalanceSheet(input: ManagementReportInput): Promise<BalanceSheet>;
  getCashflowStatement(input: ManagementReportInput): Promise<CashflowStatement>;
  getGeneralManagerAnalysis(input: ManagementReportInput): Promise<GeneralManagerAnalysis>;

  // Automations
  getAutomationMonitoringSummary(): Promise<AutomationMonitoringSummary>;
  listAutomationRules(): Promise<AutomationRule[]>;
  getAutomationRule(id: UUID): Promise<AutomationRule>;
  createAutomationRule(input: CreateAutomationRuleInput): Promise<AutomationRule>;
  updateAutomationRule(id: UUID, input: UpdateAutomationRuleInput): Promise<AutomationRule>;
  listAutomationExecutions(query: ExecutionQuery): Promise<Page<AutomationExecution>>;
  subscribeAutomationExecutions(query: ExecutionQuery, onValue: (page: Page<AutomationExecution>) => void, onError?: (error: unknown) => void): Promise<() => void>;
  getAutomationExecution(id: UUID): Promise<AutomationExecutionDetail>;
  previewAutomationRun(ruleId: UUID): Promise<AutomationRunPreview>;
  runAutomationRuleNow(ruleId: UUID, reason: string): Promise<{ created: number; skippedDuplicates: number }>;
  retryAutomationExecution(executionId: UUID, reason: string): Promise<AutomationExecutionDetail>;
  listMessageTemplates(): Promise<MessageTemplate[]>;
  listOperationalEmailDeliveries(query?: ListQuery): Promise<Page<OperationalEmailDelivery>>;
  subscribeOperationalEmailDeliveries(query: ListQuery, onValue: (page: Page<OperationalEmailDelivery>) => void, onError?: (error: unknown) => void): Promise<() => void>;

  // Data portability
  requestExport(input: ExportRequestInput): Promise<ExportJob>;
  listExportJobs(organizationId?: string): Promise<ExportJob[]>;
  requestMemberPersonalDataExport(idempotencyKey: string, locale?: "en" | "ar"): Promise<ExportJob>;
  searchWorkspace(query: string): Promise<WorkspaceSearchResult[]>;
  listRecentWorkspaceItems(): Promise<RecentWorkspaceItem[]>;
  recordRecentWorkspaceItem(item: Omit<RecentWorkspaceItem, "viewedAt">): Promise<void>;
  clearRecentWorkspaceItems(): Promise<void>;
  listPinnedWorkspaceItems(): Promise<PinnedWorkspaceItem[]>;
  pinWorkspaceItem(item: Omit<PinnedWorkspaceItem, "id" | "position" | "createdAt"> & { position?: number }): Promise<PinnedWorkspaceItem>;
  unpinWorkspaceItem(id: UUID): Promise<void>;

  // Audit
  listAuditEvents(query: AuditQuery): Promise<Page<AuditEvent>>;

  // Settings & users
  getMyProfile(): Promise<UserProfile>;
  updateMyProfile(input: UpdateUserProfileInput): Promise<UserProfile>;
  getOrganizationSettings(): Promise<OrganizationSettings>;
  getBrandKit(): Promise<BrandKit>;
  updateBrandKit(input: UpdateBrandKitInput): Promise<BrandKit>;
  /** Tenant entitlement/preferences boundary. These are not role permissions. */
  getWorkspaceAccess(): Promise<WorkspaceAccess>;
  subscribeWorkspaceAccess(onValue: (access: WorkspaceAccess) => void, onError?: (error: unknown) => void): Promise<() => void>;
  getOrganizationEntitlements(): Promise<OrganizationEntitlements>;
  getWorkspaceModulePreferences(): Promise<WorkspaceModulePreferences>;
  getWorkspaceModuleStatus(moduleKey: WorkspaceModuleKey): Promise<WorkspaceModuleStatus>;
  updateWorkspaceModulePreferences(input: UpdateWorkspaceModulePreferencesInput): Promise<WorkspaceAccess>;
  updateOrganizationSettings(input: UpdateOrganizationSettingsInput): Promise<OrganizationSettings>;
  updatePaymentMethods(input: PaymentMethod[]): Promise<OrganizationSettings>;
  updateNotificationSettings(input: NotificationSettings): Promise<OrganizationSettings>;
  updateOperationalPolicies(input: OperationalPolicies): Promise<OrganizationSettings>;
  getOperationalEmailSettings(): Promise<import("@/lib/domain/types").OperationalEmailActivationSettings>;
  updateOperationalEmailSettings(input: { enabledKinds: string[]; reason: string }): Promise<import("@/lib/domain/types").OperationalEmailActivationSettings>;
  listBranches(): Promise<Branch[]>;
  upsertBranch(input: { id?: UUID; name: string; code: string; address: string; phone: string; capacity: number; status: "active" | "inactive" }): Promise<Branch>;
  listZones(input?: { branchId?: UUID; includeArchived?: boolean }): Promise<Zone[]>;
  upsertZone(input: UpsertZoneInput): Promise<Zone>;
  archiveZone(zoneId: UUID): Promise<Zone>;

  // Daily operations (Growth+ workspace module)
  listProducts(query?: { search?: string; includeArchived?: boolean }): Promise<import("@/lib/domain/types").Product[]>;
  upsertProduct(input: import("@/lib/domain/types").UpsertProductInput): Promise<import("@/lib/domain/types").Product>;
  deleteProduct(input: DeleteProductInput): Promise<DeleteProductResult>;
  archiveProduct(productId: UUID, reason: string): Promise<import("@/lib/domain/types").Product>;
  listSuppliers(query?: { search?: string; includeArchived?: boolean }): Promise<import("@/lib/domain/types").Supplier[]>;
  upsertSupplier(input: import("@/lib/domain/types").UpsertSupplierInput): Promise<import("@/lib/domain/types").Supplier>;
  archiveSupplier(supplierId: UUID, reason: string): Promise<import("@/lib/domain/types").Supplier>;
  listInventory(input?: { branchId?: UUID; productId?: UUID }): Promise<import("@/lib/domain/types").InventoryBalance[]>;
  recordStockMovement(input: { branchId: UUID; productId: UUID; type: import("@/lib/domain/types").StockMovementType; quantity: number; unitCost?: import("@/lib/domain/types").Money; reason?: string; referenceType?: string; referenceId?: UUID; idempotencyKey: string }): Promise<import("@/lib/domain/types").StockMovement>;
  transferInventory(input: import("@/lib/domain/types").InventoryTransferInput): Promise<import("@/lib/domain/types").InventoryTransferResult>;
  listStockMovements(query?: { branchId?: UUID; productId?: UUID; page?: number; pageSize?: number }): Promise<import("@/lib/domain/types").Page<import("@/lib/domain/types").StockMovement>>;
  listLowStockAlerts(input?: { branchId?: UUID; includeDismissed?: boolean }): Promise<import("@/lib/domain/types").LowStockAlert[]>;
  refreshLowStockAlerts(input?: { branchId?: UUID }): Promise<import("@/lib/domain/types").LowStockAlert[]>;
  dismissLowStockAlert(input: { alertId: UUID; reason: string }): Promise<import("@/lib/domain/types").LowStockAlert>;
  createPurchaseOrder(input: import("@/lib/domain/types").CreatePurchaseOrderInput): Promise<import("@/lib/domain/types").PurchaseOrder>;
  updatePurchaseOrderDeliveryDate(input: { purchaseOrderId: UUID; expectedDeliveryDate?: string }): Promise<import("@/lib/domain/types").PurchaseOrder>;
  approvePurchaseOrder(purchaseOrderId: UUID, reason?: string): Promise<import("@/lib/domain/types").PurchaseOrder>;
  listPurchaseOrders(query?: { branchId?: UUID; status?: import("@/lib/domain/types").PurchaseOrderStatus }): Promise<import("@/lib/domain/types").PurchaseOrder[]>;
  receivePurchaseOrder(input: import("@/lib/domain/types").ReceivePurchaseOrderInput): Promise<import("@/lib/domain/types").PurchaseOrder>;
  notifyPurchaseOrderSupplier(input: { purchaseOrderId: UUID; channel?: "supplier_email" | "supplier_sms"; reason: string }): Promise<import("@/lib/domain/types").SupplierNotificationResult>;

  // Retired outbound-messaging compatibility: off status and empty catalogue.
  getMessagingStatus(): Promise<import("@/lib/domain/types").MessagingStatus>;
  listMessageTemplateCatalogue(): Promise<import("@/lib/domain/types").MessageTemplateCatalogueEntry[]>;

  // Subscription agreement (e-signature at onboarding)
  getSubscriptionAgreementContext(options?: { language?: "en" | "ar" }): Promise<import("@/lib/domain/types").SubscriptionAgreementContext>;
  signSubscriptionAgreement(input: import("@/lib/domain/types").SignSubscriptionAgreementInput): Promise<import("@/lib/domain/types").SubscriptionAgreement>;
  listPlatformAgreements(): Promise<import("@/lib/domain/types").PlatformAgreementSummary[]>;
  getPlatformAgreement(agreementId: UUID): Promise<import("@/lib/domain/types").SubscriptionAgreement>;
  revealPlatformAgreementId(input: import("@/lib/domain/types").RevealAgreementIdInput): Promise<import("@/lib/domain/types").RevealAgreementIdResult>;
  /** The last hundred operational emails across every gym, with what happened to each. */
  listPlatformEmailDeliveries(): Promise<import("@/lib/domain/types").PlatformEmailDelivery[]>;
  /** Re-queue the emailed copies of a signed agreement, rendered as the record stands now. */
  resendPlatformAgreementCopies(input: import("@/lib/domain/types").ResendAgreementCopiesInput): Promise<import("@/lib/domain/types").ResendAgreementCopiesResult>;
  countersignPlatformAgreement(input: import("@/lib/domain/types").CountersignAgreementInput): Promise<import("@/lib/domain/types").SubscriptionAgreement>;
  /** Retire a signed agreement with a reason; the owner is asked to sign again. */
  voidPlatformAgreement(input: import("@/lib/domain/types").VoidAgreementInput): Promise<import("@/lib/domain/types").SubscriptionAgreement>;
  /** Fill in the printable twin of a drawn signature stored before the PDF existed. */
  attachAgreementPrintSignature(input: import("@/lib/domain/types").AttachPrintSignatureInput): Promise<import("@/lib/domain/types").SubscriptionAgreement>;

  // Platform console → Prospects (gyms RIVET plans to invite to a pilot)
  listPlatformProspects(): Promise<import("@/lib/platform/prospects").PlatformProspectsView>;
  /** Newest first, ending with how the prospect was added. */
  listPlatformProspectHistory(prospectId: UUID): Promise<import("@/lib/platform/prospects").PlatformProspectHistoryEntry[]>;
  createPlatformProspect(input: import("@/lib/platform/prospects").CreatePlatformProspectInput): Promise<import("@/lib/platform/prospects").PlatformProspect>;
  updatePlatformProspect(input: import("@/lib/platform/prospects").UpdatePlatformProspectInput): Promise<import("@/lib/platform/prospects").PlatformProspect>;
  /** Loads the Amman pilot list; codes already present are left as they are. */
  importAmmanPilotProspects(): Promise<import("@/lib/platform/prospects").ImportPilotProspectsResult>;

  // Supplier payables and supplier payments (Growth+ operations module)
  listPayables(query?: import("@/lib/domain/types").PayablesQuery): Promise<import("@/lib/domain/types").PayablesPage>;
  exportPayables(query?: import("@/lib/domain/types").PayablesQuery): Promise<import("@/lib/domain/types").PayablesExport>;
  listPayablesReconciliation(query?: { branchId?: UUID }): Promise<import("@/lib/domain/types").PayablesReconciliation>;
  listSupplierPayments(query?: import("@/lib/domain/types").SupplierPaymentsQuery): Promise<Page<import("@/lib/domain/types").SupplierPayment>>;
  getSupplierPayment(paymentId: UUID): Promise<import("@/lib/domain/types").SupplierPaymentDetail>;
  recordSupplierPayment(input: import("@/lib/domain/types").RecordSupplierPaymentInput): Promise<import("@/lib/domain/types").SupplierPaymentDetail>;
  reverseSupplierPayment(input: import("@/lib/domain/types").ReverseSupplierPaymentInput): Promise<import("@/lib/domain/types").SupplierPaymentDetail>;

  listFacilityTasks(query?: { branchId?: UUID; zoneId?: UUID; status?: import("@/lib/domain/types").FacilityTaskStatus; kind?: import("@/lib/domain/types").FacilityTaskKind }): Promise<import("@/lib/domain/types").FacilityTask[]>;
  /** Fixed weekly class schedule for one branch. */
  listClassSessions(query: import("@/lib/domain/types").ClassSessionQuery): Promise<import("@/lib/domain/types").ClassSession[]>;
  upsertClassSession(input: import("@/lib/domain/types").UpsertClassSessionInput): Promise<import("@/lib/domain/types").ClassSession>;
  deleteClassSession(input: { sessionId: UUID; reason: string }): Promise<{ id: UUID }>;
  addClassAttendee(input: import("@/lib/domain/types").ClassRosterInput): Promise<import("@/lib/domain/types").ClassSession>;
  removeClassAttendee(input: import("@/lib/domain/types").ClassRosterInput): Promise<import("@/lib/domain/types").ClassSession>;
  setClassAttendance(input: import("@/lib/domain/types").ClassAttendanceInput): Promise<import("@/lib/domain/types").ClassSession>;
  listClassOccurrences(query: import("@/lib/domain/types").ClassOccurrenceQuery): Promise<import("@/lib/domain/types").ClassOccurrence[]>;
  getClassCalendarBounds(): Promise<{ startHour?: number; endHour?: number }>;
  getCustomerClassExperience(membershipId: UUID): Promise<import("@/lib/domain/types").CustomerClassExperience>;
  bookCustomerClass(input: { membershipId: UUID; occurrenceId: UUID }): Promise<import("@/lib/domain/types").ClassBookingResult>;
  cancelCustomerClass(input: { membershipId: UUID; occurrenceId: UUID }): Promise<import("@/lib/domain/types").ClassBookingResult>;
  addClassOccurrenceAttendee(input: import("@/lib/domain/types").ClassOccurrenceRosterInput): Promise<import("@/lib/domain/types").ClassOccurrence>;
  removeClassOccurrenceAttendee(input: { occurrenceId: UUID; bookingId: UUID; reason?: string }): Promise<import("@/lib/domain/types").ClassOccurrence>;
  setClassOccurrenceAttendance(input: import("@/lib/domain/types").ClassOccurrenceAttendanceInput): Promise<import("@/lib/domain/types").ClassOccurrence>;
  cancelClassOccurrence(input: { occurrenceId: UUID; reason: string }): Promise<import("@/lib/domain/types").ClassOccurrence>;
  finalizeClassOccurrenceAttendance(input: { occurrenceId: UUID }): Promise<import("@/lib/domain/types").ClassOccurrence>;
  substituteClassOccurrenceCoach(input: import("@/lib/domain/types").SubstituteClassCoachInput): Promise<import("@/lib/domain/types").ClassOccurrence>;
  listClassCoaches(): Promise<import("@/lib/domain/types").ClassCoach[]>;
  upsertClassCoach(input: import("@/lib/domain/types").UpsertClassCoachInput): Promise<import("@/lib/domain/types").ClassCoach>;
  removeClassCoach(coachId: UUID): Promise<{ id: UUID }>;
  upsertFacilityTask(input: import("@/lib/domain/types").UpsertFacilityTaskInput): Promise<import("@/lib/domain/types").FacilityTask>;
  listEquipmentAssets(query?: { branchId?: UUID; status?: import("@/lib/domain/types").EquipmentAssetStatus }): Promise<import("@/lib/domain/types").EquipmentAsset[]>;
  upsertEquipmentAsset(input: import("@/lib/domain/types").UpsertEquipmentAssetInput): Promise<import("@/lib/domain/types").EquipmentAsset>;
  reportEquipmentIssue(input: { branchId: UUID; assetId: UUID; title: string; description?: string; severity: import("@/lib/domain/types").EquipmentIssueSeverity; downtimeDays?: number; safetyStatus?: import("@/lib/domain/types").EquipmentIssue["safetyStatus"] }): Promise<import("@/lib/domain/types").EquipmentIssue>;
  updateEquipmentIssue(issueId: UUID, input: import("@/lib/domain/types").UpdateEquipmentIssueInput): Promise<import("@/lib/domain/types").EquipmentIssue>;
  listEquipmentIssues(query?: { branchId?: UUID; assetId?: UUID; status?: import("@/lib/domain/types").EquipmentIssueStatus }): Promise<import("@/lib/domain/types").EquipmentIssue[]>;
  upsertEquipmentWorkOrder(input: import("@/lib/domain/types").UpsertEquipmentWorkOrderInput): Promise<import("@/lib/domain/types").EquipmentWorkOrder>;
  listEquipmentWorkOrders(query?: { branchId?: UUID; assetId?: UUID; status?: import("@/lib/domain/types").EquipmentWorkOrder["status"] }): Promise<import("@/lib/domain/types").EquipmentWorkOrder[]>;
  getEquipmentRecommendation(assetId: UUID): Promise<import("@/lib/domain/types").EquipmentRecommendation>;
  listUsers(query: UserListQuery): Promise<Page<StaffUser>>;
  previewMemberImport(input: MemberImportPreviewInput): Promise<MemberImportPreview>;
  commitMemberImport(input: MemberImportCommitInput): Promise<MemberImportCommitResult>;
  listMemberImports(): Promise<MemberImportSummary[]>;
  getMemberImport(importId: UUID): Promise<MemberImportPreview>;
  undoMemberImport(input: MemberImportUndoInput): Promise<MemberImportUndoResult>;
  inviteUser(input: InviteUserInput): Promise<StaffUser>;
  updateUserAccess(userId: UUID, input: UpdateUserAccessInput): Promise<StaffUser>;
  updateRolePermissions(role: RoleKey, input: UpdateRolePermissionsInput): Promise<RoleDefinition>;

  // Approvals
  listPendingApprovals(): Promise<import("@/lib/domain/types").AuditEvent[]>;
  reviewApproval(auditEventId: UUID, input: { decision: "approved" | "rejected"; note?: string }): Promise<void>;

  // RIVET assistance and delegated work (docs/23). Convex authorizes every
  // call; the mock simulates the same states with explicit fixtures.
  getAiSettings(): Promise<import("@/lib/ai/contracts").AiSettingsView>;
  updateAiSettings(input: import("@/lib/ai/contracts").UpdateAiSettingsInput): Promise<import("@/lib/ai/contracts").AiSettingsView>;
  getMemberBrief(memberId: UUID): Promise<import("@/lib/ai/contracts").AiMemberBriefResult>;
  /** The brief's first sentence for each visible member in a list; at most 25. */
  getMemberHeadlines(memberIds: UUID[]): Promise<import("@/lib/ai/contracts").AiMemberHeadlinesResult>;
  /** An unsaved collections call list for the displayed branch (AI-4.9). */
  prepareCollections(query: { branchId?: UUID }): Promise<import("@/lib/ai/contracts").AiCollectionsResult>;
  /** Classes the member could be booked into this week (AI-4.5); computed on read. */
  getClassOptions(query: { memberId: UUID; timeOfDay?: "morning" | "afternoon" | "evening" }): Promise<import("@/lib/ai/contracts").AiClassOptionsResult>;
  /** Owner: what RIVET did this month and how it turned out. */
  getAiOutcomeSummary(): Promise<import("@/lib/ai/contracts").AiOutcomeSummary>;
  /** Platform operators: the platform-wide assistance switch. */
  getPlatformAiStatus(): Promise<import("@/lib/ai/contracts").AiPlatformStatus>;
  setPlatformAiStop(input: { stopped: boolean; reason: string }): Promise<{ stopped: boolean; reason: string }>;
  /** Platform operators: which gyms may use assistance at all. No gym is available until one is made available here. */
  getPlatformAiAvailability(): Promise<import("@/lib/ai/contracts").AiPlatformAvailability>;
  setPlatformAiAvailability(input: { organizationId: string; available: boolean; reason: string }): Promise<import("@/lib/ai/contracts").AiGymAvailability>;
  extractContactNote(input: { memberId?: UUID; leadId?: UUID; note: string; noteAt?: string; locale?: "en" | "ar" }): Promise<import("@/lib/ai/contracts").AiExtractNoteResult>;
  interpretRunRevision(input: { runId: string; text: string }): Promise<import("@/lib/ai/contracts").AiInterpretRevisionResult>;
  interpretListFilters(input: { surface: "members" | "leads"; text: string }): Promise<import("@/lib/ai/contracts").AiInterpretFiltersResult>;
  startAiRun(input: import("@/lib/ai/contracts").StartAiRunInput): Promise<import("@/lib/ai/contracts").AiRunView>;
  getAiRun(runId: string): Promise<import("@/lib/ai/contracts").AiRunView>;
  subscribeAiRun(runId: string, onValue: (run: import("@/lib/ai/contracts").AiRunView) => void, onError?: (error: unknown) => void): Promise<() => void>;
  listAiRuns(query: { playbook?: import("@/lib/ai/contracts").AiPlaybookKey; branchId?: UUID; limit?: number }): Promise<import("@/lib/ai/contracts").AiRunView[]>;
  cancelAiRun(runId: string): Promise<import("@/lib/ai/contracts").AiRunView>;
  reviseAiRun(input: { runId: string; text: string; revision: import("@/lib/ai/contracts").AiRunRevision }): Promise<import("@/lib/ai/contracts").AiRunView>;
  takeOverAiRun(runId: string): Promise<import("@/lib/ai/contracts").AiRunView>;
  retryAiRun(runId: string): Promise<import("@/lib/ai/contracts").AiRunView>;
  listStandingInstructions(): Promise<import("@/lib/ai/contracts").AiStandingInstructionView[]>;
  previewStandingInstruction(input: { playbook: import("@/lib/ai/contracts").AiPlaybookKey; params: Record<string, string | number | boolean>; branchId?: UUID }): Promise<import("@/lib/ai/contracts").AiStandingPreview>;
  createStandingInstruction(input: import("@/lib/ai/contracts").CreateStandingInstructionInput & { previewDigest: string }): Promise<import("@/lib/ai/contracts").AiStandingInstructionView>;
  updateStandingInstruction(input: { standingId: string; action: "pause" | "resume" | "revoke" | "transfer"; ownerId?: UUID; reason?: string }): Promise<import("@/lib/ai/contracts").AiStandingInstructionView>;
  listAiProposals(query: { runId?: string }): Promise<import("@/lib/ai/contracts").AiProposalView[]>;
  decideAiProposal(input: { proposalId: string; decision: "approve" | "reject"; changesetHash: string; note?: string }): Promise<import("@/lib/ai/contracts").AiProposalView>;
  getAiArtifact(artifactId: string): Promise<import("@/lib/ai/contracts").AiArtifactView>;
  listMemberMemories(memberId: UUID): Promise<import("@/lib/ai/contracts").AiMemoryView[]>;
  recordMemberMemory(input: { memberId: UUID; topic: "travel" | "contact_time" | "no_contact"; effectiveUntil?: string; value?: string; text?: string; sourceTimelineId?: string }): Promise<import("@/lib/ai/contracts").AiMemoryView>;
  revokeMemberMemory(memoryId: string): Promise<void>;
  recordAiFeedback(input: import("@/lib/ai/contracts").AiFeedbackInput): Promise<void>;

  // Demo utilities
  resetDemo(): Promise<void>;

  // Config
  setBehavior(behavior: Partial<MockBehavior>): void;
}

export interface MockBehavior {
  /** artificial latency in ms */
  latencyMs: number;
  /** fail the next request with FORCED_FAILURE */
  failNextRequest: boolean;
  /** fail the next public catalog or marketplace subscription */
  failNextPublicSubscription: boolean;
  /** return empty pages for list endpoints */
  forceEmptyLists: boolean;
  /** Preview/test seam: pretend the demo gym has not signed its subscription agreement yet. */
  agreementUnsigned?: boolean;
}

export const DEFAULT_BEHAVIOR: MockBehavior = {
  latencyMs: 120,
  failNextRequest: false,
  failNextPublicSubscription: false,
  forceEmptyLists: false,
};
