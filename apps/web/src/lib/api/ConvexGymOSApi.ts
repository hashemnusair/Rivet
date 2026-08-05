import { api } from "../../../convex/_generated/api";
import type {
  AuditQuery,
  DashboardQuery,
  ExecutionQuery,
  GymOSApi,
  LeadListQuery,
  MemberListQuery,
  MembershipListQuery,
  MockBehavior,
  PlanListQuery,
  RecentCheckInQuery,
  RenewalQueueQuery,
  TaskListQuery,
  TimelineQuery,
  TransactionListQuery,
  UserListQuery,
  MemberImportCommitInput,
  MemberImportCommitResult,
  MemberImportPreview,
  PlatformBillingInvoice,
  PlatformSnapshot,
  PlatformSupportCase,
  PlatformSaasPlan,
  EntryPass,
} from "./GymOSApi";
import { ApiError, ERR } from "./errors";
import { convexClient } from "@/lib/providers/convex-client-provider";
import type * as T from "@/lib/domain/types";
import type { CustomerMembership, CustomerPersona, MarketplaceGym, TrialBooking } from "@/lib/public/experience-data";

export type ConvexOperationArgs = {
  operation: string;
  input: Record<string, unknown>;
  organizationId?: string;
  activeBranchId?: string;
  correlationId: string;
};

export interface ConvexTransport {
  query(reference: typeof api.domain.query, args: ConvexOperationArgs): Promise<unknown>;
  mutation(reference: typeof api.domain.mutate, args: ConvexOperationArgs): Promise<unknown>;
  action(reference: typeof api.invitations.send, args: ConvexOperationArgs): Promise<unknown>;
}

function correlationId(): string {
  return `web-${crypto.randomUUID()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorFromConvex(error: unknown): ApiError {
  const candidate = error as { data?: unknown; message?: unknown };
  const payload = isRecord(candidate?.data) ? candidate.data : undefined;
  const nested = payload && isRecord(payload.error) ? payload.error : payload;
  const message = typeof candidate?.message === "string" ? candidate.message : "Convex request failed.";
  const code = nested && typeof nested.code === "string" ? nested.code : inferCode(message);
  const safeMessage = nested && typeof nested.message === "string" ? nested.message : message;
  const requestId = nested && typeof nested.requestId === "string" ? nested.requestId : correlationId();
  const details = nested && isRecord(nested.details) ? nested.details : undefined;
  const fieldErrors = nested && isRecord(nested.fieldErrors) ? (nested.fieldErrors as Record<string, string[]>) : undefined;
  return new ApiError({ code, message: safeMessage, requestId, details, fieldErrors });
}

function inferCode(message: string): string {
  const knownCodes = Object.values(ERR);
  const direct = knownCodes.find((code) => message.includes(code));
  if (direct) return direct;
  if (/unauthenticated|authentication is required|not active/i.test(message)) return ERR.UNAUTHENTICATED;
  if (/forbidden|permission|branch access|administrator access/i.test(message)) return ERR.FORBIDDEN;
  if (/not found|could not be found/i.test(message)) return ERR.NOT_FOUND;
  if (/already|duplicate|conflict/i.test(message)) return "CONFLICT";
  return "INTERNAL_ERROR";
}

/**
 * Production adapter for the existing GymOSApi seam. Pages never see Convex
 * references or backend-shaped records; all mapping and error translation is
 * contained here.
 */
export class ConvexGymOSApi implements GymOSApi {
  private readonly transport: ConvexTransport | undefined;
  private organizationId?: string;
  private activeBranchId?: string;

  constructor(transport: ConvexTransport = convexClient as ConvexTransport) {
    this.transport = transport;
  }

  private input(value: object): Record<string, unknown> {
    const record = value as Record<string, unknown>;
    return this.activeBranchId && record.branchId === undefined ? { ...record, branchId: this.activeBranchId } : record;
  }

  private async query<T>(operation: string, input: object = {}): Promise<T> {
    try {
      if (!this.transport) throw ApiError.of(ERR.CONFIGURATION, "Convex is not configured for this deployment.");
      const result = await this.transport.query(api.domain.query, { operation, input: this.input(input), organizationId: this.organizationId, activeBranchId: this.activeBranchId, correlationId: correlationId() });
      return result as T;
    } catch (error) {
      throw error instanceof ApiError ? error : errorFromConvex(error);
    }
  }

  private async mutate<T>(operation: string, input: object = {}): Promise<T> {
    try {
      if (!this.transport) throw ApiError.of(ERR.CONFIGURATION, "Convex is not configured for this deployment.");
      const result = await this.transport.mutation(api.domain.mutate, { operation, input: this.input(input), organizationId: this.organizationId, activeBranchId: this.activeBranchId, correlationId: correlationId() });
      return result as T;
    } catch (error) {
      throw error instanceof ApiError ? error : errorFromConvex(error);
    }
  }

  private async action<T>(reference: typeof api.invitations.send, input: object = {}): Promise<T> {
    try {
      if (!this.transport) throw ApiError.of(ERR.CONFIGURATION, "Convex is not configured for this deployment.");
      const result = await this.transport.action(reference, { operation: "invitations.send", input: this.input(input), organizationId: this.organizationId, activeBranchId: this.activeBranchId, correlationId: correlationId() });
      return result as T;
    } catch (error) {
      throw error instanceof ApiError ? error : errorFromConvex(error);
    }
  }

  async getSession(): Promise<T.Session> {
    const session = await this.query<T.Session>("session");
    this.organizationId = session.organization.id;
    this.activeBranchId = session.activeBranchId;
    return session;
  }

  async selectOrganization(organizationId: T.UUID): Promise<T.Session> {
    this.organizationId = organizationId;
    this.activeBranchId = undefined;
    const session = await this.query<T.Session>("session");
    this.activeBranchId = session.activeBranchId;
    return session;
  }

  async switchDemoRole(): Promise<T.Session> {
    throw ApiError.of(ERR.FORBIDDEN, "Persona switching is available only in explicit mock mode.");
  }

  async setActiveBranch(branchId: T.UUID | undefined): Promise<T.Session> {
    this.activeBranchId = branchId;
    const session = await this.query<T.Session>("session");
    this.organizationId = session.organization.id;
    this.activeBranchId = session.activeBranchId;
    return session;
  }

  async signOut(): Promise<void> {
    return undefined;
  }

  listMarketplaceGyms(): Promise<MarketplaceGym[]> { return this.query("public.marketplace"); }
  getCustomerExperience(): Promise<{ customer?: CustomerPersona; memberships: CustomerMembership[]; bookings: TrialBooking[] }> { return this.query("customer.experience"); }
  registerCustomer(input: { fullName: string; email: string; phone: string }): Promise<CustomerPersona> { return this.mutate("customer.register", input); }
  createTrialBooking(input: Omit<TrialBooking, "id" | "createdAt" | "status" | "customerId" | "leadId"> & { customerId?: string }): Promise<TrialBooking> { return this.mutate("customer.trial.create", input); }
  getEntryPass(membershipId: string): Promise<EntryPass> { return this.mutate("customer.entryPass", { membershipId }); }
  getPlatformSnapshot(): Promise<PlatformSnapshot> { return this.query("platform.snapshot"); }
  listPublicSaasPlans(): Promise<PlatformSaasPlan[]> { return this.query("public.catalog"); }
  retryPlatformInvoice(invoiceId: string): Promise<PlatformBillingInvoice> { return this.mutate("platform.billing.retry", { invoiceId }); }
  resolvePlatformSupportCase(caseId: string): Promise<PlatformSupportCase> { return this.mutate("platform.support.resolve", { caseId }); }
  replyToPlatformSupportCase(caseId: string, body: string): Promise<PlatformSupportCase> { return this.mutate("platform.support.reply", { caseId, body }); }

  getDashboard(query: DashboardQuery): Promise<T.DashboardData> { return this.query("dashboard", query); }
  listMembers(query: MemberListQuery): Promise<T.Page<T.MemberSummary>> { return this.query("members.list", query); }
  getMember(memberId: T.UUID): Promise<T.MemberDetail> { return this.query("members.get", { memberId }); }
  createMember(input: T.CreateMemberInput): Promise<T.CreateMemberResult> { return this.mutate("members.create", input); }
  updateMember(memberId: T.UUID, input: T.UpdateMemberInput): Promise<T.MemberDetail> { return this.mutate("members.update", { memberId, ...input }); }
  async archiveMember(memberId: T.UUID, input: { reason: string }): Promise<void> { await this.mutate("members.archive", { memberId, ...input }); }
  checkMemberDuplicates(input: { phone?: string; email?: string }): Promise<T.DuplicateMatch[]> { return this.query("members.duplicates", input); }
  listMemberTimeline(memberId: T.UUID, query?: TimelineQuery): Promise<T.Page<T.TimelineEvent>> { return this.query("members.timeline", { memberId, ...(query ?? {}) }); }
  addMemberNote(memberId: T.UUID, input: { body: string }): Promise<T.TimelineEvent> { return this.mutate("members.note", { memberId, ...input }); }
  logMemberContactAttempt(memberId: T.UUID, input: T.ContactAttemptInput): Promise<T.TimelineEvent> { return this.mutate("members.contact", { memberId, ...input }); }

  listPlans(query: PlanListQuery): Promise<T.Page<T.MembershipPlan>> { return this.query("plans.list", query); }
  createPlan(input: T.CreatePlanInput): Promise<T.MembershipPlan> { return this.mutate("plans.create", input); }
  updatePlan(planId: T.UUID, input: T.UpdatePlanInput): Promise<T.MembershipPlan> { return this.mutate("plans.update", { planId, ...input }); }

  listMemberships(query: MembershipListQuery): Promise<T.Page<T.MembershipSummary>> { return this.query("memberships.list", query); }
  getMembership(membershipId: T.UUID): Promise<T.MembershipDetail> { return this.query("memberships.get", { membershipId }); }
  createMembershipSale(input: T.CreateMembershipSaleInput): Promise<T.MembershipSaleResult> { return this.mutate("memberships.sale", input); }
  renewMembership(membershipId: T.UUID, input: T.RenewMembershipInput): Promise<T.MembershipSaleResult> { return this.mutate("memberships.renew", { membershipId, ...input }); }
  freezeMembership(membershipId: T.UUID, input: T.FreezeMembershipInput): Promise<T.MembershipDetail> { return this.mutate("memberships.freeze", { membershipId, ...input }); }
  unfreezeMembership(membershipId: T.UUID, input: { reason: string }): Promise<T.MembershipDetail> { return this.mutate("memberships.unfreeze", { membershipId, ...input }); }
  extendMembership(membershipId: T.UUID, input: T.ExtendMembershipInput): Promise<T.MembershipDetail> { return this.mutate("memberships.extend", { membershipId, ...input }); }
  cancelMembership(membershipId: T.UUID, input: T.CancelMembershipInput): Promise<T.MembershipDetail> { return this.mutate("memberships.cancel", { membershipId, ...input }); }

  listLeads(query: LeadListQuery): Promise<T.Page<T.LeadSummary>> { return this.query("leads.list", query); }
  getLead(leadId: T.UUID): Promise<T.LeadDetail> { return this.query("leads.get", { leadId }); }
  createLead(input: T.CreateLeadInput): Promise<T.LeadDetail> { return this.mutate("leads.create", input); }
  updateLead(leadId: T.UUID, input: T.UpdateLeadInput): Promise<T.LeadDetail> { return this.mutate("leads.update", { leadId, ...input }); }
  logContactAttempt(leadId: T.UUID, input: T.ContactAttemptInput): Promise<T.LeadDetail> { return this.mutate("leads.contact", { leadId, ...input }); }
  createOffer(input: { leadId: T.UUID; planId: T.UUID; price: T.Money; expiresInDays?: number }): Promise<T.Offer> { return this.mutate("offers.create", input); }
  listTasks(query: TaskListQuery): Promise<T.Page<T.Task>> { return this.query("tasks.list", query); }
  createFollowUp(input: T.CreateTaskInput): Promise<T.Task> { return this.mutate("tasks.create", input); }
  completeTask(taskId: T.UUID, input: T.CompleteTaskInput): Promise<T.Task> { return this.mutate("tasks.complete", { taskId, ...input }); }
  convertLead(leadId: T.UUID, input: T.ConvertLeadInput): Promise<T.MemberDetail> { return this.mutate("leads.convert", { leadId, ...input }); }
  listRenewalQueue(query: RenewalQueueQuery): Promise<T.Page<T.RenewalQueueItem>> { return this.query("renewal.queue", query); }

  previewCheckIn(input: { branchId: T.UUID; query: string }): Promise<T.CheckInPreview> { return this.query("checkins.preview", input); }
  createCheckIn(input: T.CreateCheckInInput): Promise<T.CheckInResult> { return this.mutate("checkins.create", input); }
  overrideCheckIn(input: T.OverrideCheckInInput): Promise<T.CheckInResult> { return this.mutate("checkins.override", input); }
  listRecentCheckIns(query: RecentCheckInQuery): Promise<T.Page<T.CheckInSummary>> { return this.query("checkins.list", query); }
  getOccupancy(branchId: T.UUID): Promise<T.OccupancySnapshot> { return this.query("checkins.occupancy", { branchId }); }

  listTransactions(query: TransactionListQuery): Promise<T.Page<T.TransactionSummary>> { return this.query("transactions.list", query); }
  createPayment(input: T.CreatePaymentInput, idempotencyKey: string): Promise<T.ReceiptDetail> { return this.mutate("payments.create", { ...input, idempotencyKey }); }
  refundPayment(paymentId: T.UUID, input: T.RefundPaymentInput): Promise<T.ReceiptDetail> { return this.mutate("payments.refund", { paymentId, ...input }); }
  voidPayment(paymentId: T.UUID, input: T.VoidPaymentInput): Promise<T.ReceiptDetail> { return this.mutate("payments.void", { paymentId, ...input }); }
  getReceipt(receiptId: T.UUID): Promise<T.ReceiptDetail> { return this.query("receipts.get", { receiptId }); }
  openCashShift(input: T.OpenCashShiftInput): Promise<T.CashShift> { return this.mutate("shifts.open", input); }
  getCurrentCashShift(branchId: T.UUID): Promise<T.CashShift | null> { return this.query("shifts.current", { branchId }); }
  getCurrentShiftTotals(branchId: T.UUID): Promise<{ shift: T.CashShift; totals: T.ShiftTotals } | null> { return this.query("shifts.current", { branchId }); }
  closeCashShift(shiftId: T.UUID, input: T.CloseCashShiftInput): Promise<T.CashShift> { return this.mutate("shifts.close", { shiftId, ...input }); }
  listCashShifts(query: { branchId?: T.UUID; page?: number; pageSize?: number }): Promise<T.Page<T.CashShift>> { return this.query("shifts.list", query); }
  reviewVariance(shiftId: T.UUID, input: { decision: "approved" | "rejected"; note?: string }): Promise<T.CashShift> { return this.mutate("shifts.review", { shiftId, ...input }); }
  getDailyReconciliation(query: { branchId: T.UUID; date: T.ISODate }): Promise<T.ReconciliationReport> { return this.query("reconciliation.daily", query); }

  listAutomationRules(): Promise<T.AutomationRule[]> { return this.query("automations.rules"); }
  getAutomationRule(id: T.UUID): Promise<T.AutomationRule> { return this.query("automations.rule", { id }); }
  createAutomationRule(input: T.CreateAutomationRuleInput): Promise<T.AutomationRule> { return this.mutate("automations.rule.create", input); }
  updateAutomationRule(id: T.UUID, input: T.UpdateAutomationRuleInput): Promise<T.AutomationRule> { return this.mutate("automations.rule.update", { id, ...input }); }
  listAutomationExecutions(query: ExecutionQuery): Promise<T.Page<T.AutomationExecution>> { return this.query("automations.executions", query); }
  listMessageTemplates(): Promise<T.MessageTemplate[]> { return this.query("automations.templates"); }
  listAuditEvents(query: AuditQuery): Promise<T.Page<T.AuditEvent>> { return this.query("audit.list", query); }

  getOrganizationSettings(): Promise<T.OrganizationSettings> { return this.query("settings.get"); }
  updateOrganizationSettings(input: T.UpdateOrganizationSettingsInput): Promise<T.OrganizationSettings> { return this.mutate("settings.organization.update", input); }
  updatePaymentMethods(input: T.PaymentMethod[]): Promise<T.OrganizationSettings> { return this.mutate("settings.paymentMethods", { paymentMethods: input }); }
  updateNotificationSettings(input: T.NotificationSettings): Promise<T.OrganizationSettings> { return this.mutate("settings.notifications", { notifications: input }); }
  listBranches(): Promise<T.Branch[]> { return this.query("branches.list"); }
  upsertBranch(input: { id?: T.UUID; name: string; code: string; address: string; phone: string; capacity: number; status: "active" | "inactive" }): Promise<T.Branch> { return this.mutate("branches.upsert", input); }
  listUsers(query: UserListQuery): Promise<T.Page<T.StaffUser>> { return this.query("users.list", query); }
  previewMemberImport(input: { csv: string; branchId: T.UUID }): Promise<MemberImportPreview> { return this.mutate("members.import.preview", input); }
  commitMemberImport(input: MemberImportCommitInput): Promise<MemberImportCommitResult> { return this.mutate("members.import.commit", input); }
  inviteUser(input: T.InviteUserInput): Promise<T.StaffUser> { return this.action(api.invitations.send, input); }
  updateUserAccess(userId: T.UUID, input: T.UpdateUserAccessInput): Promise<T.StaffUser> { return this.mutate("users.update", { userId, ...input }); }
  updateRolePermissions(role: T.RoleKey, input: T.UpdateRolePermissionsInput): Promise<T.RoleDefinition> { return this.mutate("roles.update", { role, ...input }); }
  listPendingApprovals(): Promise<T.AuditEvent[]> { return this.query("approvals.list"); }
  async reviewApproval(auditEventId: T.UUID, input: { decision: "approved" | "rejected"; note?: string }): Promise<void> { await this.mutate("approvals.review", { auditEventId, ...input }); }

  async resetDemo(): Promise<void> { await this.mutate("demo.reset"); }
  setBehavior(_behavior: Partial<MockBehavior>): void {
    // Convex owns latency, failure injection and persistence. Demo controls are
    // intentionally unavailable outside MockGymOSApi.
  }
}

export function dataMode(): "mock" | "convex" {
  const configured = process.env.NEXT_PUBLIC_DATA_MODE;
  if (process.env.NODE_ENV === "production") return "convex";
  // The preview auth bypass and mock adapter are one explicit test contract.
  // Treat the bypass as the stronger selector so the first dev-bundle request
  // cannot transiently construct a fail-closed Convex client before the public
  // data-mode variable is available to Next's client compilation.
  if (process.env.NEXT_PUBLIC_RIVET_DEMO_AUTH === "1") return "mock";
  if (configured === "mock" || configured === "convex") return configured;
  return "mock";
}

export function isConvexMode(): boolean {
  return dataMode() === "convex";
}
