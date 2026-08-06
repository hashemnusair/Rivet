import type {
  AuditCategory,
  AuditEvent,
  AutomationExecution,
  AutomationRule,
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
  OccupancySnapshot,
  Offer,
  OpenCashShiftInput,
  OrganizationSettings,
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
  gym: string;
  amount: string;
  date: string;
  status: "paid" | "failed" | "trial";
}

export interface PlatformSupportCase {
  id: string;
  gym: string;
  subject: string;
  age: string;
  priority: "urgent" | "normal";
  status: "open" | "waiting" | "resolved";
}

export interface PlatformSaasPlan {
  name: "Starter" | "Growth" | "Pro";
  priceMinor: number;
  branches: number;
  staff: number;
  members: number;
  tone: "paper" | "signal" | "night";
}

export interface CreateGymOnboardingInput {
  gymName: string;
  city: string;
  branchName: string;
  ownerFullName: string;
  ownerPhone?: string;
  plan: PlatformSaasPlan["name"];
  currentActiveMembers?: number;
}

export interface CreateGymOnboardingResult {
  organizationId: UUID;
  organizationSlug: string;
  organizationName: string;
  branchId: UUID;
  branchName: string;
  plan: PlatformSaasPlan["name"];
  trialEndsAt: string;
}

export interface PlatformSnapshot {
  gyms: import("@/lib/public/experience-data").MarketplaceGym[];
  bookings: import("@/lib/public/experience-data").TrialBooking[];
  invoices: PlatformBillingInvoice[];
  supportCases: PlatformSupportCase[];
  plans: PlatformSaasPlan[];
}

export interface EntryPass {
  token: string;
  expiresAt: string;
  membershipId: string;
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
  getCustomerExperience(): Promise<{ customer?: CustomerPersona; memberships: CustomerMembership[]; bookings: TrialBooking[] }>;
  registerCustomer(input: { fullName: string; email: string; phone: string }): Promise<CustomerPersona>;
  createTrialBooking(input: Omit<TrialBooking, "id" | "createdAt" | "status" | "customerId" | "leadId"> & { customerId?: string }): Promise<TrialBooking>;
  getEntryPass(membershipId: string): Promise<EntryPass>;
  getPlatformSnapshot(): Promise<PlatformSnapshot>;
  listPublicSaasPlans(): Promise<PlatformSaasPlan[]>;
  createGymOnboarding(input: CreateGymOnboardingInput): Promise<CreateGymOnboardingResult>;
  retryPlatformInvoice(invoiceId: string): Promise<PlatformBillingInvoice>;
  resolvePlatformSupportCase(caseId: string): Promise<PlatformSupportCase>;
  replyToPlatformSupportCase(caseId: string, body: string): Promise<PlatformSupportCase>;

  // Dashboard
  getDashboard(query: DashboardQuery): Promise<DashboardData>;

  // Members
  listMembers(query: MemberListQuery): Promise<Page<MemberSummary>>;
  getMember(memberId: UUID): Promise<MemberDetail>;
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
  createMembershipSale(input: CreateMembershipSaleInput): Promise<MembershipSaleResult>;
  renewMembership(membershipId: UUID, input: RenewMembershipInput): Promise<MembershipSaleResult>;
  freezeMembership(membershipId: UUID, input: FreezeMembershipInput): Promise<MembershipDetail>;
  unfreezeMembership(membershipId: UUID, input: { reason: string }): Promise<MembershipDetail>;
  extendMembership(membershipId: UUID, input: ExtendMembershipInput): Promise<MembershipDetail>;
  cancelMembership(membershipId: UUID, input: CancelMembershipInput): Promise<MembershipDetail>;

  // CRM
  listLeads(query: LeadListQuery): Promise<Page<LeadSummary>>;
  getLead(leadId: UUID): Promise<LeadDetail>;
  createLead(input: CreateLeadInput): Promise<LeadDetail>;
  updateLead(leadId: UUID, input: UpdateLeadInput): Promise<LeadDetail>;
  logContactAttempt(leadId: UUID, input: ContactAttemptInput): Promise<LeadDetail>;
  createOffer(input: { leadId: UUID; planId: UUID; price: Money; expiresInDays?: number }): Promise<Offer>;
  listTasks(query: TaskListQuery): Promise<Page<Task>>;
  createFollowUp(input: CreateTaskInput): Promise<Task>;
  completeTask(taskId: UUID, input: CompleteTaskInput): Promise<Task>;
  convertLead(leadId: UUID, input: ConvertLeadInput): Promise<MemberDetail>;
  listRenewalQueue(query: RenewalQueueQuery): Promise<Page<RenewalQueueItem>>;

  // Check-in
  previewCheckIn(input: { branchId: UUID; query: string }): Promise<CheckInPreview>;
  createCheckIn(input: CreateCheckInInput): Promise<CheckInResult>;
  overrideCheckIn(input: OverrideCheckInInput): Promise<CheckInResult>;
  listRecentCheckIns(query: RecentCheckInQuery): Promise<Page<CheckInSummary>>;
  getOccupancy(branchId: UUID): Promise<OccupancySnapshot>;

  // Payments & shifts
  listTransactions(query: TransactionListQuery): Promise<Page<TransactionSummary>>;
  createPayment(input: CreatePaymentInput, idempotencyKey: string): Promise<ReceiptDetail>;
  refundPayment(paymentId: UUID, input: RefundPaymentInput): Promise<ReceiptDetail>;
  voidPayment(paymentId: UUID, input: VoidPaymentInput): Promise<ReceiptDetail>;
  getReceipt(receiptId: UUID): Promise<ReceiptDetail>;
  openCashShift(input: OpenCashShiftInput): Promise<CashShift>;
  getCurrentCashShift(branchId: UUID): Promise<CashShift | null>;
  getCurrentShiftTotals(branchId: UUID): Promise<{ shift: CashShift; totals: import("@/lib/domain/types").ShiftTotals } | null>;
  closeCashShift(shiftId: UUID, input: CloseCashShiftInput): Promise<CashShift>;
  listCashShifts(query: { branchId?: UUID; page?: number; pageSize?: number }): Promise<Page<CashShift>>;
  reviewVariance(shiftId: UUID, input: { decision: "approved" | "rejected"; note?: string }): Promise<CashShift>;
  getDailyReconciliation(query: { branchId: UUID; date: ISODate }): Promise<ReconciliationReport>;

  // Automations
  listAutomationRules(): Promise<AutomationRule[]>;
  getAutomationRule(id: UUID): Promise<AutomationRule>;
  createAutomationRule(input: CreateAutomationRuleInput): Promise<AutomationRule>;
  updateAutomationRule(id: UUID, input: UpdateAutomationRuleInput): Promise<AutomationRule>;
  listAutomationExecutions(query: ExecutionQuery): Promise<Page<AutomationExecution>>;
  listMessageTemplates(): Promise<MessageTemplate[]>;

  // Audit
  listAuditEvents(query: AuditQuery): Promise<Page<AuditEvent>>;

  // Settings & users
  getOrganizationSettings(): Promise<OrganizationSettings>;
  updateOrganizationSettings(input: UpdateOrganizationSettingsInput): Promise<OrganizationSettings>;
  updatePaymentMethods(input: PaymentMethod[]): Promise<OrganizationSettings>;
  updateNotificationSettings(input: NotificationSettings): Promise<OrganizationSettings>;
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
