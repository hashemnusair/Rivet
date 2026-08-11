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
  SubmitGymApplicationInput,
  SubmitGymApplicationResult,
  PlatformGymApplication,
  ReviewGymApplicationInput,
  SaveGymApplicationReviewNoteInput,
  PlatformBillingInvoice,
  PlatformGymDetail,
  PlatformSnapshot,
  PlatformSupportCase,
  PlatformSaasPlan,
  EntryPass,
  ProvisionGymInput,
  GymProvisioningResult,
  UpdatePlatformGymInput,
  UpdatePlatformPlanInput,
  CreatePlatformInvoiceInput,
  RecordPlatformInvoicePaymentInput,
  CreateSupportCaseInput,
  OperationalNotification,
  CreateOfferInput,
  MarkOfferDeliveredInput,
  CustomerExperience,
} from "./GymOSApi";
import { ApiError, ERR } from "./errors";
import { convexClient } from "@/lib/providers/convex-client-provider";
import type * as T from "@/lib/domain/types";
import type { CustomerPersona, MarketplaceGym, TrialBooking } from "@/lib/public/experience-data";

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
  /** Optional injectable seam used by tests and alternate Convex transports. */
  subscribe?: (
    reference: typeof api.domain.query,
    args: ConvexOperationArgs,
    onValue: (value: unknown) => void,
    onError: (error: unknown) => void,
  ) => () => void;
  action(reference: typeof api.gymApplications.submit, args: SubmitGymApplicationInput): Promise<unknown>;
  action(reference: typeof api.gymApplications.review, args: ReviewGymApplicationInput & { correlationId: string }): Promise<unknown>;
  action(reference: typeof api.platformProvisioningAction.provision, args: ProvisionGymInput & { correlationId: string }): Promise<unknown>;
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

  private async subscribeQuery<T>(operation: string, input: object, onValue: (value: T) => void, onError?: (error: unknown) => void): Promise<() => void> {
    if (!this.transport) {
      const error = ApiError.of(ERR.CONFIGURATION, "Convex is not configured for this deployment.");
      onError?.(error);
      return () => undefined;
    }

    const args: ConvexOperationArgs = {
      operation,
      input: this.input(input),
      organizationId: this.organizationId,
      activeBranchId: this.activeBranchId,
      correlationId: correlationId(),
    };

    if (this.transport.subscribe) {
      try {
        return this.transport.subscribe(
          api.domain.query,
          args,
          (value) => onValue(value as T),
          (error) => onError?.(error instanceof ApiError ? error : errorFromConvex(error)),
        );
      } catch (error) {
        onError?.(error instanceof ApiError ? error : errorFromConvex(error));
        return () => undefined;
      }
    }

    // ConvexReactClient exposes reactive watches rather than a browser-style
    // onUpdate method. Keep this implementation here so pages stay unaware
    // of Convex and test transports can still inject a deterministic stream.
    if (!convexClient) {
      const error = ApiError.of(ERR.CONFIGURATION, "Convex is not configured for this deployment.");
      onError?.(error);
      return () => undefined;
    }

    const watch = convexClient.watchQuery(api.domain.query, args);
    const stop = watch.onUpdate(() => {
      try {
        const value = watch.localQueryResult();
        if (value !== undefined) onValue(value as T);
      } catch (error) {
        onError?.(error instanceof ApiError ? error : errorFromConvex(error));
      }
    });

    try {
      onValue(await this.query<T>(operation, input));
    } catch (error) {
      onError?.(error instanceof ApiError ? error : errorFromConvex(error));
    }
    return stop;
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
  getCustomerExperience(): Promise<CustomerExperience> { return this.query("customer.experience"); }
  subscribeCustomerExperience(onValue: (experience: CustomerExperience) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeQuery("customer.experience", {}, onValue, onError);
  }
  registerCustomer(input: { fullName: string; email: string; phone: string }): Promise<CustomerPersona> { return this.mutate("customer.register", input); }
  updateCustomerMarketingPreference(input: { optedIn: boolean; customerId?: string }): Promise<CustomerPersona> { return this.mutate("customer.marketingPreference.update", input); }
  createTrialBooking(input: Omit<TrialBooking, "id" | "createdAt" | "status" | "customerId" | "leadId"> & { customerId?: string }): Promise<TrialBooking> { return this.mutate("customer.trial.create", input); }
  getEntryPass(membershipId: string): Promise<EntryPass> { return this.mutate("customer.entryPass", { membershipId }); }
  getPlatformSnapshot(): Promise<PlatformSnapshot> { return this.query("platform.snapshot"); }
  subscribePlatformSnapshot(onValue: (snapshot: PlatformSnapshot) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("platform.snapshot", {}, onValue, onError); }
  getPlatformGymDetail(gymId: string): Promise<PlatformGymDetail> { return this.query("platform.gym.detail", { gymId }); }
  subscribePlatformGymDetail(gymId: string, onValue: (detail: PlatformGymDetail) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("platform.gym.detail", { gymId }, onValue, onError); }
  listPublicSaasPlans(): Promise<PlatformSaasPlan[]> { return this.query("public.catalog"); }
  async submitGymApplication(input: SubmitGymApplicationInput): Promise<SubmitGymApplicationResult> {
    try {
      if (!this.transport) throw ApiError.of(ERR.CONFIGURATION, "Convex is not configured for this deployment.");
      return await this.transport.action(api.gymApplications.submit, input) as SubmitGymApplicationResult;
    } catch (error) {
      throw error instanceof ApiError ? error : errorFromConvex(error);
    }
  }
  listGymApplications(query: { status?: PlatformGymApplication["status"]; search?: string } = {}): Promise<PlatformGymApplication[]> {
    return this.query("platform.applications", query);
  }
  subscribePlatformApplications(onValue: (applications: PlatformGymApplication[]) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeQuery("platform.applications", {}, onValue, onError);
  }
  async reviewGymApplication(input: ReviewGymApplicationInput): Promise<PlatformGymApplication> {
    try {
      if (!this.transport) throw ApiError.of(ERR.CONFIGURATION, "Convex is not configured for this deployment.");
      return await this.transport.action(api.gymApplications.review, { ...input, correlationId: correlationId() }) as PlatformGymApplication;
    } catch (error) {
      throw error instanceof ApiError ? error : errorFromConvex(error);
    }
  }
  saveGymApplicationReviewNote(input: SaveGymApplicationReviewNoteInput): Promise<PlatformGymApplication> {
    return this.mutate("platform.application.note", input);
  }
  async provisionGym(input: ProvisionGymInput): Promise<GymProvisioningResult> {
    try {
      if (!this.transport) throw ApiError.of(ERR.CONFIGURATION, "Convex is not configured for this deployment.");
      return await this.transport.action(api.platformProvisioningAction.provision, { ...input, correlationId: correlationId() }) as GymProvisioningResult;
    } catch (error) {
      throw error instanceof ApiError ? error : errorFromConvex(error);
    }
  }
  updatePlatformGym(input: UpdatePlatformGymInput): Promise<MarketplaceGym> { return this.mutate("platform.gym.update", input); }
  updatePlatformPlan(input: UpdatePlatformPlanInput): Promise<PlatformSaasPlan> { return this.mutate("platform.plan.update", input); }
  createPlatformInvoice(input: CreatePlatformInvoiceInput): Promise<PlatformBillingInvoice> { return this.mutate("platform.invoice.create", input); }
  issuePlatformInvoice(invoiceId: string): Promise<PlatformBillingInvoice> { return this.mutate("platform.invoice.issue", { invoiceId }); }
  markPlatformInvoicePastDue(invoiceId: string, reason: string): Promise<PlatformBillingInvoice> { return this.mutate("platform.invoice.past_due", { invoiceId, reason }); }
  recordPlatformInvoicePayment(input: RecordPlatformInvoicePaymentInput): Promise<PlatformBillingInvoice> { return this.mutate("platform.invoice.payment", input); }
  voidPlatformInvoice(invoiceId: string, reason: string): Promise<PlatformBillingInvoice> { return this.mutate("platform.invoice.void", { invoiceId, reason }); }
  listSupportCases(): Promise<PlatformSupportCase[]> { return this.query("support.list"); }
  subscribeSupportCases(onValue: (cases: PlatformSupportCase[]) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("support.list", {}, onValue, onError); }
  createSupportCase(input: CreateSupportCaseInput): Promise<PlatformSupportCase> { return this.mutate("support.create", input); }
  resolvePlatformSupportCase(caseId: string, resolutionSummary: string): Promise<PlatformSupportCase> { return this.mutate("platform.support.resolve", { caseId, resolutionSummary }); }
  reopenPlatformSupportCase(caseId: string): Promise<PlatformSupportCase> { return this.mutate("platform.support.reopen", { caseId }); }
  assignPlatformSupportCase(caseId: string, assigneeId?: string): Promise<PlatformSupportCase> { return this.mutate("platform.support.assign", { caseId, assigneeId }); }
  replyToPlatformSupportCase(caseId: string, body: string): Promise<PlatformSupportCase> { return this.mutate("platform.support.reply", { caseId, body }); }
  listNotifications(): Promise<OperationalNotification[]> { return this.query("notifications.list"); }
  subscribeNotifications(onValue: (notifications: OperationalNotification[]) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("notifications.list", {}, onValue, onError); }
  setNotificationRead(notificationId: string, read: boolean): Promise<OperationalNotification> { return this.mutate("notifications.read", { notificationId, read }); }
  async markAllNotificationsRead(): Promise<void> { await this.mutate("notifications.readAll", {}); }

  getDashboard(query: DashboardQuery): Promise<T.DashboardData> { return this.query("dashboard", query); }
  subscribeDashboard(query: DashboardQuery, onValue: (dashboard: T.DashboardData) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("dashboard", query, onValue, onError); }
  listMembers(query: MemberListQuery): Promise<T.Page<T.MemberSummary>> { return this.query("members.list", query); }
  getMember(memberId: T.UUID): Promise<T.MemberDetail> { return this.query("members.get", { memberId }); }
  subscribeMember(memberId: T.UUID, onValue: (member: T.MemberDetail) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("members.get", { memberId }, onValue, onError); }
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
  subscribeMembership(membershipId: T.UUID, onValue: (membership: T.MembershipDetail) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("memberships.get", { membershipId }, onValue, onError); }
  createMembershipSale(input: T.CreateMembershipSaleInput): Promise<T.MembershipSaleResult> { return this.mutate("memberships.sale", input); }
  renewMembership(membershipId: T.UUID, input: T.RenewMembershipInput): Promise<T.MembershipSaleResult> { return this.mutate("memberships.renew", { membershipId, ...input }); }
  changeMembershipPlan(membershipId: T.UUID, input: T.ChangeMembershipPlanInput): Promise<T.MembershipSaleResult> { return this.mutate("memberships.plan_change", { membershipId, ...input }); }
  freezeMembership(membershipId: T.UUID, input: T.FreezeMembershipInput): Promise<T.MembershipDetail> { return this.mutate("memberships.freeze", { membershipId, ...input }); }
  unfreezeMembership(membershipId: T.UUID, input: { reason: string }): Promise<T.MembershipDetail> { return this.mutate("memberships.unfreeze", { membershipId, ...input }); }
  extendMembership(membershipId: T.UUID, input: T.ExtendMembershipInput): Promise<T.MembershipDetail> { return this.mutate("memberships.extend", { membershipId, ...input }); }
  cancelMembership(membershipId: T.UUID, input: T.CancelMembershipInput): Promise<T.MembershipDetail> { return this.mutate("memberships.cancel", { membershipId, ...input }); }
  transferMembership(membershipId: T.UUID, input: T.TransferMembershipInput): Promise<T.MembershipDetail> { return this.mutate("memberships.transfer", { membershipId, ...input }); }

  listLeads(query: LeadListQuery): Promise<T.Page<T.LeadSummary>> { return this.query("leads.list", query); }
  subscribeLeads(query: LeadListQuery, onValue: (page: T.Page<T.LeadSummary>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeQuery("leads.list", query, onValue, onError);
  }
  getLead(leadId: T.UUID): Promise<T.LeadDetail> { return this.query("leads.get", { leadId }); }
  subscribeLead(leadId: T.UUID, onValue: (lead: T.LeadDetail) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("leads.get", { leadId }, onValue, onError); }
  createLead(input: T.CreateLeadInput): Promise<T.LeadDetail> { return this.mutate("leads.create", input); }
  updateLead(leadId: T.UUID, input: T.UpdateLeadInput): Promise<T.LeadDetail> { return this.mutate("leads.update", { leadId, ...input }); }
  logContactAttempt(leadId: T.UUID, input: T.ContactAttemptInput): Promise<T.LeadDetail> { return this.mutate("leads.contact", { leadId, ...input }); }
  updateTrialBooking(bookingId: T.UUID, input: { status: Extract<T.TrialBookingStatus, "confirmed" | "completed" | "no_show" | "cancelled">; note?: string }): Promise<T.LeadDetail> { return this.mutate("trials.update", { bookingId, ...input }); }
  createOffer(input: CreateOfferInput): Promise<T.Offer> { return this.mutate("offers.create", input); }
  markOfferDelivered(offerId: T.UUID, input: MarkOfferDeliveredInput): Promise<T.Offer> { return this.mutate("offers.deliver", { offerId, ...input }); }
  listTasks(query: TaskListQuery): Promise<T.Page<T.Task>> { return this.query("tasks.list", query); }
  subscribeTasks(query: TaskListQuery, onValue: (page: T.Page<T.Task>) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("tasks.list", query, onValue, onError); }
  createFollowUp(input: T.CreateTaskInput): Promise<T.Task> { return this.mutate("tasks.create", input); }
  completeTask(taskId: T.UUID, input: T.CompleteTaskInput): Promise<T.Task> { return this.mutate("tasks.complete", { taskId, ...input }); }
  convertLead(leadId: T.UUID, input: T.ConvertLeadInput): Promise<T.MemberDetail> { return this.mutate("leads.convert", { leadId, ...input }); }
  listRenewalQueue(query: RenewalQueueQuery): Promise<T.Page<T.RenewalQueueItem>> { return this.query("renewal.queue", query); }
  subscribeRenewalQueue(query: RenewalQueueQuery, onValue: (page: T.Page<T.RenewalQueueItem>) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("renewal.queue", query, onValue, onError); }

  previewCheckIn(input: { branchId: T.UUID; query: string }): Promise<T.CheckInPreview> { return this.query("checkins.preview", input); }
  createCheckIn(input: T.CreateCheckInInput): Promise<T.CheckInResult> { return this.mutate("checkins.create", input); }
  overrideCheckIn(input: T.OverrideCheckInInput): Promise<T.CheckInResult> { return this.mutate("checkins.override", input); }
  listRecentCheckIns(query: RecentCheckInQuery): Promise<T.Page<T.CheckInSummary>> { return this.query("checkins.list", query); }
  subscribeRecentCheckIns(query: RecentCheckInQuery, onValue: (page: T.Page<T.CheckInSummary>) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("checkins.list", query, onValue, onError); }
  getOccupancy(branchId: T.UUID): Promise<T.OccupancySnapshot> { return this.query("checkins.occupancy", { branchId }); }
  subscribeOccupancy(branchId: T.UUID, onValue: (occupancy: T.OccupancySnapshot) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("checkins.occupancy", { branchId }, onValue, onError); }

  listTransactions(query: TransactionListQuery): Promise<T.Page<T.TransactionSummary>> { return this.query("transactions.list", query); }
  subscribeTransactions(query: TransactionListQuery, onValue: (page: T.Page<T.TransactionSummary>) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("transactions.list", query, onValue, onError); }
  createPayment(input: T.CreatePaymentInput, idempotencyKey: string): Promise<T.ReceiptDetail> { return this.mutate("payments.create", { ...input, idempotencyKey }); }
  refundPayment(paymentId: T.UUID, input: T.RefundPaymentInput): Promise<T.ReceiptDetail> { return this.mutate("payments.refund", { paymentId, ...input }); }
  voidPayment(paymentId: T.UUID, input: T.VoidPaymentInput): Promise<T.ReceiptDetail> { return this.mutate("payments.void", { paymentId, ...input }); }
  getReceipt(receiptId: T.UUID): Promise<T.ReceiptDetail> { return this.query("receipts.get", { receiptId }); }
  openCashShift(input: T.OpenCashShiftInput): Promise<T.CashShift> { return this.mutate("shifts.open", input); }
  async getCurrentCashShift(branchId: T.UUID): Promise<T.CashShift | null> {
    const current = await this.query<{ shift: T.CashShift; totals: T.ShiftTotals } | null>("shifts.current", { branchId });
    return current?.shift ?? null;
  }
  getCurrentShiftTotals(branchId: T.UUID): Promise<{ shift: T.CashShift; totals: T.ShiftTotals } | null> { return this.query("shifts.current", { branchId }); }
  subscribeCurrentShiftTotals(branchId: T.UUID, onValue: (value: { shift: T.CashShift; totals: T.ShiftTotals } | null) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("shifts.current", { branchId }, onValue, onError); }
  closeCashShift(shiftId: T.UUID, input: T.CloseCashShiftInput): Promise<T.CashShift> { return this.mutate("shifts.close", { shiftId, ...input }); }
  listCashShifts(query: { branchId?: T.UUID; page?: number; pageSize?: number }): Promise<T.Page<T.CashShift>> { return this.query("shifts.list", query); }
  subscribeCashShifts(query: { branchId?: T.UUID; page?: number; pageSize?: number }, onValue: (page: T.Page<T.CashShift>) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("shifts.list", query, onValue, onError); }
  reviewVariance(shiftId: T.UUID, input: { decision: "approved" | "rejected"; note: string }): Promise<T.CashShift> { return this.mutate("shifts.review", { shiftId, ...input }); }
  getDailyReconciliation(query: { branchId: T.UUID; date: T.ISODate }): Promise<T.ReconciliationReport> { return this.query("reconciliation.daily", query); }

  listAutomationRules(): Promise<T.AutomationRule[]> { return this.query("automations.rules"); }
  getAutomationRule(id: T.UUID): Promise<T.AutomationRule> { return this.query("automations.rule", { id }); }
  createAutomationRule(input: T.CreateAutomationRuleInput): Promise<T.AutomationRule> { return this.mutate("automations.rule.create", input); }
  updateAutomationRule(id: T.UUID, input: T.UpdateAutomationRuleInput): Promise<T.AutomationRule> { return this.mutate("automations.rule.update", { id, ...input }); }
  listAutomationExecutions(query: ExecutionQuery): Promise<T.Page<T.AutomationExecution>> { return this.query("automations.executions", query); }
  subscribeAutomationExecutions(query: ExecutionQuery, onValue: (page: T.Page<T.AutomationExecution>) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("automations.executions", query, onValue, onError); }
  getAutomationExecution(id: T.UUID): Promise<T.AutomationExecutionDetail> { return this.query("automations.execution", { id }); }
  previewAutomationRun(ruleId: T.UUID): Promise<T.AutomationRunPreview> { return this.query("automations.run.preview", { ruleId }); }
  runAutomationRuleNow(ruleId: T.UUID, reason: string): Promise<{ created: number; skippedDuplicates: number }> { return this.mutate("automations.run", { ruleId, reason }); }
  retryAutomationExecution(executionId: T.UUID, reason: string): Promise<T.AutomationExecutionDetail> { return this.mutate("automations.execution.retry", { executionId, reason }); }
  listMessageTemplates(): Promise<T.MessageTemplate[]> { return this.query("automations.templates"); }
  listOperationalEmailDeliveries(query: T.ListQuery = {}): Promise<T.Page<T.OperationalEmailDelivery>> { return this.query("operationalEmails.list", query); }
  subscribeOperationalEmailDeliveries(query: T.ListQuery, onValue: (page: T.Page<T.OperationalEmailDelivery>) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("operationalEmails.list", query, onValue, onError); }
  listAuditEvents(query: AuditQuery): Promise<T.Page<T.AuditEvent>> { return this.query("audit.list", query); }

  getOrganizationSettings(): Promise<T.OrganizationSettings> { return this.query("settings.get"); }
  updateOrganizationSettings(input: T.UpdateOrganizationSettingsInput): Promise<T.OrganizationSettings> { return this.mutate("settings.organization.update", input); }
  updatePaymentMethods(input: T.PaymentMethod[]): Promise<T.OrganizationSettings> { return this.mutate("settings.paymentMethods", { paymentMethods: input }); }
  updateNotificationSettings(input: T.NotificationSettings): Promise<T.OrganizationSettings> { return this.mutate("settings.notifications", { notifications: input }); }
  updateOperationalPolicies(input: T.OperationalPolicies): Promise<T.OrganizationSettings> { return this.mutate("settings.operationalPolicies", { operationalPolicies: input }); }
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
  // Vercel Preview is also a production-mode Next.js build. An explicit
  // environment value must therefore win before the production default, or a
  // Preview deployment configured for the deterministic mock experience will
  // still try to connect to Convex.
  if (configured === "mock" || configured === "convex") return configured;
  if (process.env.NODE_ENV === "production") return "convex";
  // The preview auth bypass and mock adapter are one explicit test contract.
  // Treat the bypass as the stronger selector so the first dev-bundle request
  // cannot transiently construct a fail-closed Convex client before the public
  // data-mode variable is available to Next's client compilation.
  if (process.env.NEXT_PUBLIC_RIVET_DEMO_AUTH === "1") return "mock";
  return "mock";
}

export function isConvexMode(): boolean {
  return dataMode() === "convex";
}
