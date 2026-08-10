import type {
  AuditCategory,
  AuditEvent,
  AutomationExecution,
  AutomationExecutionDetail,
  AutomationRule,
  AutomationRunPreview,
  Branch,
  CancelMembershipInput,
  CashShift,
  CheckInPreview,
  CheckInResult,
  CheckInSummary,
  CloseCashShiftInput,
  CompleteTaskInput,
  ContactAttemptInput,
  ConvertLeadInput,
  CreateAutomationRuleInput,
  CreateCheckInInput,
  CreateLeadInput,
  CreateMemberInput,
  CreateMemberResult,
  CreateMembershipSaleInput,
  ChangeMembershipPlanInput,
  CreatePaymentInput,
  CreatePlanInput,
  CreateTaskInput,
  DashboardData,
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
  RefundPaymentInput,
  RenewalQueueItem,
  RenewMembershipInput,
  TransferMembershipInput,
  RoleDefinition,
  RoleKey,
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
  UpdatePlanInput,
  UpdateRolePermissionsInput,
  UpdateUserAccessInput,
  VoidPaymentInput,
  ISODate,
  UUID,
} from "@/lib/domain/types";
import type { CustomerMembership, CustomerPersona, MarketplaceGym, TrialBooking } from "@/lib/public/experience-data";

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
  dueBefore?: string;
  overdueOnly?: boolean;
}

export interface RenewalQueueQuery extends ListQuery {
  branchId?: UUID;
  bucket?: "expiring" | "expired";
}

export interface RecentCheckInQuery extends ListQuery {
  branchId?: UUID;
  memberId?: UUID;
  since?: string;
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
  email?: string;
  status: "valid" | "duplicate" | "invalid" | "committed" | "skipped";
  errors: string[];
  duplicateMemberIds: string[];
  memberId?: string;
}

export interface MemberImportPreview {
  id: string;
  branchId: string;
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  errorRows: number;
  rows: MemberImportRow[];
  createdAt: string;
}

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

export interface DashboardQuery {
  branchId?: UUID;
  from: string;
  to: string;
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
  paymentReference?: string;
  paidAt?: string;
  pastDueAt?: string;
  voidedAt?: string;
  status: "draft" | "open" | "paid" | "past_due" | "void" | "failed" | "trial";
}

export interface CreatePlatformInvoiceInput {
  gymId: string;
  amountMinor: number;
  currency?: string;
  dueAt: string;
  periodStart: string;
  periodEnd: string;
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
  controls: {
    status: MarketplaceGym["subscriptionStatus"];
    plan: MarketplaceGym["rivetPlan"];
    isPublic: boolean;
  };
  organization: PlatformData<{
    id: UUID;
    name: string;
    status: "trial" | "active" | "past_due" | "suspended" | "cancelled";
    currency: string;
    timezone: string;
  }>;
  joinedAt: PlatformData<string>;
  branches: PlatformData<PlatformGymDetailBranch[]>;
  owner: PlatformData<PlatformGymOwner>;
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
  health: PlatformData<number>;
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
  messages?: PlatformSupportMessage[];
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
  title: string;
  body: string;
  href: string;
  dedupeKey: string;
  organizationId?: string;
  branchId?: string;
  readAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface PlatformOverview {
  gymCounts: Record<"trial" | "active" | "past_due" | "suspended" | "cancelled", number>;
  branchCount: number;
  memberCount: number;
  activeStaffCount: number;
  activeMrr: Money;
  invoiceTotals: {
    collected: Money;
    outstanding: Money;
    overdue: Money;
  };
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
  name: "Starter" | "Growth" | "Pro";
  priceMinor: number;
  branches: number;
  staff: number;
  members: number;
  tone: "paper" | "signal" | "night";
}

export interface SubmitGymApplicationInput {
  gymName: string;
  ownerName: string;
  email: string;
  contactNumber: string;
  plan: PlatformSaasPlan["name"];
}

export type GymApplicationStatus = "pending" | "under_review" | "approved" | "rejected";
export type GymApplicationNotificationStatus = "pending" | "sent" | "failed" | "not_configured";
export type GymProvisioningStatus = "not_started" | "in_progress" | "completed" | "failed";

export interface PlatformGymApplication {
  id: UUID;
  gymName: string;
  ownerName: string;
  email: string;
  contactNumber: string;
  plan: PlatformSaasPlan["name"];
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
  provisioningStartedAt?: string;
  provisioningError?: string;
  provisionedAt?: string;
  provisionedOrganizationId?: UUID;
  provisionedBranchId?: UUID;
  clerkOrganizationId?: string;
  clerkInvitationId?: string;
}

export interface ReviewGymApplicationInput {
  applicationId: UUID;
  decision: Exclude<GymApplicationStatus, "pending">;
  note?: string;
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

/** Platform-only controls for a subscribed tenant. The public directory row
 * and the backing Convex organization are updated together when a match is
 * available; this keeps the console from being a read-only mock surface. */
export interface UpdatePlatformGymInput {
  gymId: string;
  status?: import("@/lib/public/experience-data").MarketplaceGym["subscriptionStatus"];
  plan?: import("@/lib/public/experience-data").MarketplaceGym["rivetPlan"];
  isPublic?: boolean;
  trialEndsAt?: string;
  subscriptionStartedAt?: string;
  currentPeriodEndsAt?: string;
  cancelledAt?: string;
  reason: string;
}

export interface UpdatePlatformPlanInput {
  name: PlatformSaasPlan["name"];
  priceMinor?: number;
  branches?: number;
  staff?: number;
  members?: number;
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
  getCustomerExperience(): Promise<CustomerExperience>;
  /**
   * Subscribe to identity-scoped member changes. The disposer is returned in
   * a promise so a native Convex watch can perform its initial read before the
   * caller considers the subscription established.
   */
  subscribeCustomerExperience(onValue: (experience: CustomerExperience) => void, onError?: (error: unknown) => void): Promise<() => void>;
  registerCustomer(input: { fullName: string; email: string; phone: string }): Promise<CustomerPersona>;
  /** The optional customerId is used only by the deterministic mock; Convex derives identity from Clerk. */
  updateCustomerMarketingPreference(input: { optedIn: boolean; customerId?: string }): Promise<CustomerPersona>;
  createTrialBooking(input: Omit<TrialBooking, "id" | "createdAt" | "status" | "customerId" | "leadId"> & { customerId?: string }): Promise<TrialBooking>;
  getEntryPass(membershipId: string): Promise<EntryPass>;
  getPlatformSnapshot(): Promise<PlatformSnapshot>;
  subscribePlatformSnapshot(onValue: (snapshot: PlatformSnapshot) => void, onError?: (error: unknown) => void): Promise<() => void>;
  getPlatformGymDetail(gymId: string): Promise<PlatformGymDetail>;
  subscribePlatformGymDetail(gymId: string, onValue: (detail: PlatformGymDetail) => void, onError?: (error: unknown) => void): Promise<() => void>;
  listPublicSaasPlans(): Promise<PlatformSaasPlan[]>;
  submitGymApplication(input: SubmitGymApplicationInput): Promise<SubmitGymApplicationResult>;
  listGymApplications(query?: { status?: GymApplicationStatus; search?: string }): Promise<PlatformGymApplication[]>;
  subscribePlatformApplications(onValue: (applications: PlatformGymApplication[]) => void, onError?: (error: unknown) => void): Promise<() => void>;
  reviewGymApplication(input: ReviewGymApplicationInput): Promise<PlatformGymApplication>;
  saveGymApplicationReviewNote(input: SaveGymApplicationReviewNoteInput): Promise<PlatformGymApplication>;
  provisionGym(input: ProvisionGymInput): Promise<GymProvisioningResult>;
  updatePlatformGym(input: UpdatePlatformGymInput): Promise<import("@/lib/public/experience-data").MarketplaceGym>;
  updatePlatformPlan(input: UpdatePlatformPlanInput): Promise<PlatformSaasPlan>;
  createPlatformInvoice(input: CreatePlatformInvoiceInput): Promise<PlatformBillingInvoice>;
  issuePlatformInvoice(invoiceId: string): Promise<PlatformBillingInvoice>;
  markPlatformInvoicePastDue(invoiceId: string, reason: string): Promise<PlatformBillingInvoice>;
  recordPlatformInvoicePayment(input: RecordPlatformInvoicePaymentInput): Promise<PlatformBillingInvoice>;
  voidPlatformInvoice(invoiceId: string, reason: string): Promise<PlatformBillingInvoice>;
  listSupportCases(): Promise<PlatformSupportCase[]>;
  subscribeSupportCases(onValue: (cases: PlatformSupportCase[]) => void, onError?: (error: unknown) => void): Promise<() => void>;
  createSupportCase(input: CreateSupportCaseInput): Promise<PlatformSupportCase>;
  resolvePlatformSupportCase(caseId: string, resolutionSummary: string): Promise<PlatformSupportCase>;
  reopenPlatformSupportCase(caseId: string): Promise<PlatformSupportCase>;
  assignPlatformSupportCase(caseId: string, assigneeId?: string): Promise<PlatformSupportCase>;
  replyToPlatformSupportCase(caseId: string, body: string): Promise<PlatformSupportCase>;
  listNotifications(): Promise<OperationalNotification[]>;
  subscribeNotifications(onValue: (notifications: OperationalNotification[]) => void, onError?: (error: unknown) => void): Promise<() => void>;
  setNotificationRead(notificationId: string, read: boolean): Promise<OperationalNotification>;
  markAllNotificationsRead(): Promise<void>;

  // Dashboard
  getDashboard(query: DashboardQuery): Promise<DashboardData>;
  subscribeDashboard(query: DashboardQuery, onValue: (dashboard: DashboardData) => void, onError?: (error: unknown) => void): Promise<() => void>;

  // Members
  listMembers(query: MemberListQuery): Promise<Page<MemberSummary>>;
  getMember(memberId: UUID): Promise<MemberDetail>;
  subscribeMember(memberId: UUID, onValue: (member: MemberDetail) => void, onError?: (error: unknown) => void): Promise<() => void>;
  createMember(input: CreateMemberInput): Promise<CreateMemberResult>;
  updateMember(memberId: UUID, input: UpdateMemberInput): Promise<MemberDetail>;
  archiveMember(memberId: UUID, input: { reason: string }): Promise<void>;
  checkMemberDuplicates(input: { phone?: string; email?: string }): Promise<DuplicateMatch[]>;
  listMemberTimeline(memberId: UUID, query?: TimelineQuery): Promise<Page<TimelineEvent>>;
  addMemberNote(memberId: UUID, input: { body: string }): Promise<TimelineEvent>;
  logMemberContactAttempt(memberId: UUID, input: ContactAttemptInput): Promise<TimelineEvent>;

  // Plans
  listPlans(query: PlanListQuery): Promise<Page<MembershipPlan>>;
  createPlan(input: CreatePlanInput): Promise<MembershipPlan>;
  updatePlan(planId: UUID, input: UpdatePlanInput): Promise<MembershipPlan>;

  // Memberships
  listMemberships(query: MembershipListQuery): Promise<Page<MembershipSummary>>;
  getMembership(membershipId: UUID): Promise<MembershipDetail>;
  subscribeMembership(membershipId: UUID, onValue: (membership: MembershipDetail) => void, onError?: (error: unknown) => void): Promise<() => void>;
  createMembershipSale(input: CreateMembershipSaleInput): Promise<MembershipSaleResult>;
  renewMembership(membershipId: UUID, input: RenewMembershipInput): Promise<MembershipSaleResult>;
  changeMembershipPlan(membershipId: UUID, input: ChangeMembershipPlanInput): Promise<MembershipSaleResult>;
  freezeMembership(membershipId: UUID, input: FreezeMembershipInput): Promise<MembershipDetail>;
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
  logContactAttempt(leadId: UUID, input: ContactAttemptInput): Promise<LeadDetail>;
  updateTrialBooking(
    bookingId: UUID,
    input: { status: Extract<import("@/lib/domain/types").TrialBookingStatus, "confirmed" | "completed" | "no_show" | "cancelled">; note?: string },
  ): Promise<LeadDetail>;
  createOffer(input: CreateOfferInput): Promise<Offer>;
  markOfferDelivered(offerId: UUID, input: MarkOfferDeliveredInput): Promise<Offer>;
  listTasks(query: TaskListQuery): Promise<Page<Task>>;
  subscribeTasks(query: TaskListQuery, onValue: (page: Page<Task>) => void, onError?: (error: unknown) => void): Promise<() => void>;
  createFollowUp(input: CreateTaskInput): Promise<Task>;
  completeTask(taskId: UUID, input: CompleteTaskInput): Promise<Task>;
  convertLead(leadId: UUID, input: ConvertLeadInput): Promise<MemberDetail>;
  listRenewalQueue(query: RenewalQueueQuery): Promise<Page<RenewalQueueItem>>;
  subscribeRenewalQueue(query: RenewalQueueQuery, onValue: (page: Page<RenewalQueueItem>) => void, onError?: (error: unknown) => void): Promise<() => void>;

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
  openCashShift(input: OpenCashShiftInput): Promise<CashShift>;
  getCurrentCashShift(branchId: UUID): Promise<CashShift | null>;
  getCurrentShiftTotals(branchId: UUID): Promise<{ shift: CashShift; totals: import("@/lib/domain/types").ShiftTotals } | null>;
  subscribeCurrentShiftTotals(branchId: UUID, onValue: (value: { shift: CashShift; totals: import("@/lib/domain/types").ShiftTotals } | null) => void, onError?: (error: unknown) => void): Promise<() => void>;
  closeCashShift(shiftId: UUID, input: CloseCashShiftInput): Promise<CashShift>;
  listCashShifts(query: { branchId?: UUID; page?: number; pageSize?: number }): Promise<Page<CashShift>>;
  subscribeCashShifts(query: { branchId?: UUID; page?: number; pageSize?: number }, onValue: (page: Page<CashShift>) => void, onError?: (error: unknown) => void): Promise<() => void>;
  reviewVariance(shiftId: UUID, input: { decision: "approved" | "rejected"; note?: string }): Promise<CashShift>;
  getDailyReconciliation(query: { branchId: UUID; date: ISODate }): Promise<ReconciliationReport>;

  // Automations
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

  // Audit
  listAuditEvents(query: AuditQuery): Promise<Page<AuditEvent>>;

  // Settings & users
  getOrganizationSettings(): Promise<OrganizationSettings>;
  updateOrganizationSettings(input: UpdateOrganizationSettingsInput): Promise<OrganizationSettings>;
  updatePaymentMethods(input: PaymentMethod[]): Promise<OrganizationSettings>;
  updateNotificationSettings(input: NotificationSettings): Promise<OrganizationSettings>;
  updateOperationalPolicies(input: OperationalPolicies): Promise<OrganizationSettings>;
  listBranches(): Promise<Branch[]>;
  upsertBranch(input: { id?: UUID; name: string; code: string; address: string; phone: string; capacity: number; status: "active" | "inactive" }): Promise<Branch>;
  listUsers(query: UserListQuery): Promise<Page<StaffUser>>;
  previewMemberImport(input: { csv: string; branchId: UUID }): Promise<MemberImportPreview>;
  commitMemberImport(input: MemberImportCommitInput): Promise<MemberImportCommitResult>;
  inviteUser(input: InviteUserInput): Promise<StaffUser>;
  updateUserAccess(userId: UUID, input: UpdateUserAccessInput): Promise<StaffUser>;
  updateRolePermissions(role: RoleKey, input: UpdateRolePermissionsInput): Promise<RoleDefinition>;

  // Approvals
  listPendingApprovals(): Promise<import("@/lib/domain/types").AuditEvent[]>;
  reviewApproval(auditEventId: UUID, input: { decision: "approved" | "rejected"; note?: string }): Promise<void>;

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
  /** return empty pages for list endpoints */
  forceEmptyLists: boolean;
}

export const DEFAULT_BEHAVIOR: MockBehavior = {
  latencyMs: 120,
  failNextRequest: false,
  forceEmptyLists: false,
};
