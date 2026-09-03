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
  MemberImportPreviewInput,
  MemberImportSummary,
  MemberImportUndoInput,
  MemberImportUndoResult,
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
  ArchivePlatformGymInput,
  UpdatePlatformPlanInput,
  CreatePlatformInvoiceInput,
  RecordPlatformInvoicePaymentInput,
  CreateSupportCaseInput,
  OperationalNotification,
  CreateOfferInput,
  MarkOfferDeliveredInput,
  RecordOfferOutcomeInput,
  CustomerExperience,
  MarketingPreferenceMigrationPreview,
  MarketingPreferenceMigrationProgress,
} from "./GymOSApi";
import { ApiError, ERR } from "./errors";
import { convexClient } from "@/lib/providers/convex-client-provider";
import type * as T from "@/lib/domain/types";
import type { CustomerPersona, CustomerProfileInput, CustomerReferralProgram, MarketplaceGym, TrialBooking } from "@/lib/public/experience-data";
import { publicMarketplaceGyms } from "@/lib/public/marketplace-filters";

export type ConvexOperationArgs = {
  operation: string;
  input: Record<string, unknown>;
  organizationId?: string;
  activeBranchId?: string;
  correlationId: string;
};

type InvitationActionArgs = {
  input: Record<string, unknown>;
  organizationId: string;
  correlationId: string;
};

export interface ConvexTransport {
  query(reference: typeof api.domain.query, args: ConvexOperationArgs): Promise<unknown>;
  mutation(reference: typeof api.domain.mutate, args: ConvexOperationArgs): Promise<unknown>;
  mutation(reference: typeof api.media.generateUploadUrl, args: { organizationId: string; activeBranchId?: string; correlationId: string; ownerType: T.MediaAssetOwnerType; ownerPublicId: string }): Promise<unknown>;
  mutation(reference: typeof api.media.discardDraft, args: { organizationId: string; activeBranchId?: string; correlationId: string; assetId: string }): Promise<unknown>;
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
  action(reference: typeof api.invitations.send, args: InvitationActionArgs): Promise<unknown>;
  action(reference: typeof api.media.finalizeUpload, args: { organizationId: string; activeBranchId?: string; correlationId: string; ownerType: T.MediaAssetOwnerType; ownerPublicId: string; altText?: string; storageId: string }): Promise<unknown>;
}

function correlationId(): string {
  return `web-${crypto.randomUUID()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Normalize the deliberately public marketplace contract at the adapter
 * boundary. The server query is the authority that decides which rows are
 * publishable; its public projection omits platform-only controls, including
 * `isPublic`. Marking a row returned by that query as explicitly visible lets
 * the shared client filter fail closed for all other payloads without falling
 * back to the bundled preview catalog.
 */
function publicMarketplaceRows(value: unknown): MarketplaceGym[] {
  if (!Array.isArray(value)) return [];
  const rows = value
    .filter(isRecord)
    .map((row) => {
      // Keep platform linkage metadata out of the public marketplace seam even
      // if a future server projection accidentally includes it.
      const publicRow = { ...row };
      delete publicRow.isProvisioned;
      delete publicRow.isArchived;
      delete publicRow.archivedAt;
      delete publicRow.archiveReason;
      delete publicRow.logoUrl;
      return { ...publicRow, isPublic: typeof publicRow.isPublic === "boolean" ? publicRow.isPublic : true };
    })
    .map((row) => row as unknown as MarketplaceGym);
  return publicMarketplaceGyms(rows);
}

/**
 * Keep the web release compatible with the previous dashboard projection
 * while Convex is deployed separately. The empty queue is intentionally
 * honest: it exposes no guessed work and disappears as soon as the newer
 * server projection is available.
 */
function dashboardWithTodayQueue(dashboard: T.DashboardData): T.DashboardData {
  if (dashboard.todayQueue) return dashboard;

  return {
    ...dashboard,
    todayQueue: {
      generatedAt: new Date().toISOString(),
      items: [],
      totalItems: 0,
      urgentItems: 0,
      highPriorityItems: 0,
      kindCounts: {},
      overdueItems: 0,
      overdueKindCounts: {},
    },
  };
}

function errorFromConvex(error: unknown): ApiError {
  const candidate = error as { data?: unknown; message?: unknown };
  let payload = isRecord(candidate?.data) ? candidate.data : undefined;
  // Convex ACTION failures arrive without structured data: the server error
  // string embeds the ConvexError JSON followed by a stack trace. Extract it
  // so operators see the domain message, never a raw "Uncaught ConvexError"
  // blob.
  if (!payload && typeof candidate?.message === "string") {
    const embedded = candidate.message.match(/ConvexError:\s*(\{[\s\S]*?\})(?:\s+at\s|\s*$)/);
    if (embedded) {
      try {
        const parsed: unknown = JSON.parse(embedded[1]!);
        if (isRecord(parsed)) payload = parsed;
      } catch {
        // A truncated stack keeps the JSON unreadable; fall through to the
        // generic mapping below.
      }
    }
  }
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

  /**
   * Platform mutations are authorized from the authenticated platform-admin
   * identity, not from a selected gym workspace. Keep the request free of any
   * tenant/branch context so a stale workspace binding cannot route an
   * operator action through tenant membership authorization.
   */
  private async mutatePlatform<T>(operation: string, input: object = {}): Promise<T> {
    try {
      if (!this.transport) throw ApiError.of(ERR.CONFIGURATION, "Convex is not configured for this deployment.");
      const result = await this.transport.mutation(api.domain.mutate, { operation, input: input as Record<string, unknown>, correlationId: correlationId() });
      return result as T;
    } catch (error) {
      throw error instanceof ApiError ? error : errorFromConvex(error);
    }
  }

  private async action<T>(reference: typeof api.invitations.send, input: object = {}): Promise<T> {
    try {
      if (!this.transport || !this.organizationId) throw ApiError.of(ERR.CONFIGURATION, "Select a gym workspace before inviting staff.");
      const result = await this.transport.action(reference, { input: input as Record<string, unknown>, organizationId: this.organizationId, correlationId: correlationId() });
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

    // The watch delivers its initial snapshot through onUpdate. Calling the
    // same domain query again here created a duplicate read for every live
    // screen on the native Convex client. useRealtimeApiQuery enables its
    // ordinary query only after the watch enters fallback.
    return stop;
  }

  async getSession(): Promise<T.Session> {
    const session = await this.query<T.Session>("session");
    this.organizationId = session.organization.id;
    this.activeBranchId = session.activeBranchId;
    return session;
  }

  async selectOrganization(organizationId: T.UUID): Promise<T.Session> {
    const previousOrganizationId = this.organizationId;
    const previousBranchId = this.activeBranchId;
    this.organizationId = organizationId;
    this.activeBranchId = undefined;
    try {
      const session = await this.query<T.Session>("session");
      this.activeBranchId = session.activeBranchId;
      return session;
    } catch (error) {
      // A stale/deleted organization must not remain latched in the adapter.
      // Restore the last known-good scope, or leave it empty so the next call
      // fails closed instead of silently selecting another tenant.
      this.organizationId = previousOrganizationId;
      this.activeBranchId = previousBranchId;
      throw error;
    }
  }

  async switchDemoRole(): Promise<T.Session> {
    throw ApiError.of(ERR.FORBIDDEN, "Persona switching is available only in explicit mock mode.");
  }

  async setActiveBranch(branchId: T.UUID | undefined): Promise<T.Session> {
    const previousBranchId = this.activeBranchId;
    this.activeBranchId = branchId;
    try {
      const session = await this.query<T.Session>("session");
      this.organizationId = session.organization.id;
      this.activeBranchId = session.activeBranchId;
      return session;
    } catch (error) {
      this.activeBranchId = previousBranchId;
      throw error;
    }
  }

  async signOut(): Promise<void> {
    return undefined;
  }

  async listMarketplaceGyms(): Promise<MarketplaceGym[]> {
    return publicMarketplaceRows(await this.query<unknown>("public.marketplace"));
  }
  getPublicOffer(token: string): Promise<T.PublicOffer> { return this.query("public.offer", { token }); }
  respondToPublicOffer(token: string, input: { outcome: T.OfferOutcome; reason?: string }): Promise<T.PublicOffer> { return this.mutate("public.offer.respond", { token, ...input }); }
  subscribeMarketplaceGyms(onValue: (gyms: MarketplaceGym[]) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeQuery<unknown>("public.marketplace", {}, (value) => onValue(publicMarketplaceRows(value)), onError);
  }
  getCustomerExperience(): Promise<CustomerExperience> { return this.query("customer.experience"); }
  subscribeCustomerExperience(onValue: (experience: CustomerExperience) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeQuery("customer.experience", {}, onValue, onError);
  }
  registerCustomer(input: CustomerProfileInput & { fullName: string; email: string }): Promise<CustomerPersona> { return this.mutate("customer.register", input); }
  updateCustomerProfile(input: CustomerProfileInput): Promise<CustomerPersona> { return this.mutate("customer.profile.update", input); }
  updateCustomerMarketingPreference(input: { optedIn: boolean; customerId?: string }): Promise<CustomerPersona> { return this.mutate("customer.marketingPreference.update", input); }
  createTrialBooking(input: Omit<TrialBooking, "id" | "createdAt" | "status" | "customerId" | "leadId"> & { customerId?: string; referralToken?: string }): Promise<TrialBooking> { return this.mutate("customer.trial.create", input); }
  ensureCustomerReferralLink(membershipId: T.UUID): Promise<CustomerReferralProgram> { return this.mutate("customer.referral.ensure", { membershipId }); }
  getPeakHoursReport(input: T.AnalyticsReportInput): Promise<T.PeakHoursReport> { return this.query("analytics.peak_hours", input); }
  getClassUtilizationReport(input: T.AnalyticsReportInput): Promise<T.ClassUtilizationReport> { return this.query("analytics.class_utilization", input); }
  getRetentionReport(input: T.AnalyticsBranchInput): Promise<T.RetentionReport> { return this.query("analytics.retention", input); }
  getRenewalForecastReport(input: T.AnalyticsBranchInput): Promise<T.RenewalForecastReport> { return this.query("analytics.renewal_forecast", input); }
  getCollectionsReport(input: T.AnalyticsReportInput): Promise<T.CollectionsReport> { return this.query("analytics.collections", input); }
  getCrmFunnelReport(input: T.AnalyticsReportInput): Promise<T.CrmFunnelReport> { return this.query("analytics.crm_funnel", input); }
  getControlTrendsReport(input: T.AnalyticsReportInput): Promise<T.ControlTrendsReport> { return this.query("analytics.control_trends", input); }
  listChecklistTemplates(input: { branchId?: T.UUID } = {}): Promise<T.ChecklistTemplate[]> { return this.query("checklists.templates.list", input); }
  upsertChecklistTemplate(input: T.UpsertChecklistTemplateInput): Promise<T.ChecklistTemplate> { return this.mutate("checklists.template.upsert", input); }
  getChecklistDay(input: { branchId: T.UUID; date?: string }): Promise<T.ChecklistDay> { return this.query("checklists.day", input); }
  setChecklistItem(input: T.SetChecklistItemInput): Promise<T.ChecklistRun> { return this.mutate("checklists.item.set", input); }
  createChecklistMaintenanceTask(input: T.CreateChecklistTaskInput): Promise<T.ChecklistRun> { return this.mutate("checklists.item.create_task", input); }
  getEntryPass(membershipId: string): Promise<EntryPass> { return this.mutate("customer.entryPass", { membershipId }); }
  getCustomerFinancialSummary(): Promise<import("@/lib/domain/qol").CustomerFinancialSummary> { return this.query("customer.finance.summary"); }
  listCustomerTransactions(query: import("@/lib/domain/qol").CustomerTransactionQuery): Promise<T.Page<import("@/lib/domain/qol").CustomerTransaction>> { return this.query("customer.finance.transactions", query); }
  getCustomerReceipt(receiptId: T.UUID): Promise<import("@/lib/domain/qol").CustomerReceipt> { return this.query("customer.receipt", { receiptId }); }
  listSavedViews(surface: import("@/lib/domain/qol").SavedViewSurface): Promise<import("@/lib/domain/qol").SavedView[]> { return this.query("savedViews.list", { surface }); }
  saveSavedView(input: { id?: T.UUID; surface: import("@/lib/domain/qol").SavedViewSurface; name: string; state: Record<string, unknown>; isDefault?: boolean }): Promise<import("@/lib/domain/qol").SavedView> { return this.mutate("savedViews.save", input); }
  deleteSavedView(viewId: T.UUID): Promise<void> { return this.mutate("savedViews.delete", { viewId }); }
  runBulkOperation(input: import("@/lib/domain/qol").BulkOperationInput): Promise<import("@/lib/domain/qol").BulkOperationJob> { return this.mutate("bulk.run", input); }
  listBulkOperationJobs(): Promise<import("@/lib/domain/qol").BulkOperationJob[]> { return this.query("bulk.jobs"); }
  listDuplicateCases(query: import("@/lib/domain/qol").DuplicateCaseQuery = {}): Promise<T.Page<import("@/lib/domain/qol").DuplicateCase>> { return this.query("duplicates.list", query); }
  getDuplicateCase(caseId: T.UUID): Promise<import("@/lib/domain/qol").DuplicateCase> { return this.query("duplicates.get", { caseId }); }
  ignoreDuplicateCase(caseId: T.UUID, reason: string): Promise<import("@/lib/domain/qol").DuplicateCase> { return this.mutate("duplicates.ignore", { caseId, reason }); }
  mergeDuplicateMembers(input: import("@/lib/domain/qol").MergeMemberInput): Promise<import("@/lib/domain/qol").DuplicateCase> { return this.mutate("duplicates.merge", input); }
  getOnboardingExperience(audience: import("@/lib/domain/qol").OnboardingAudience): Promise<import("@/lib/domain/qol").OnboardingExperience> { return this.query("onboarding.get", { audience }); }
  updateOnboardingProgress(input: { audience: import("@/lib/domain/qol").OnboardingAudience; completedStepKey?: string; dismissed?: boolean; restart?: boolean }): Promise<import("@/lib/domain/qol").OnboardingExperience> { return this.mutate("onboarding.update", input); }
  listPushSubscriptions(): Promise<import("@/lib/domain/qol").PushSubscriptionSummary[]> { return this.query("push.list"); }
  savePushSubscription(input: import("@/lib/domain/qol").PushSubscriptionInput): Promise<import("@/lib/domain/qol").PushSubscriptionSummary> { return this.mutate("push.subscribe", input); }
  revokePushSubscription(subscriptionId: T.UUID): Promise<void> { return this.mutate("push.revoke", { subscriptionId }); }
  getPlatformSnapshot(): Promise<PlatformSnapshot> { return this.query("platform.snapshot"); }
  previewMarketingPreferenceMigration(): Promise<MarketingPreferenceMigrationPreview> { return this.query("platform.marketingMigration.preview"); }
  applyMarketingPreferenceMigration(input: { migrationId?: string; batchSize?: number; reason: string }): Promise<MarketingPreferenceMigrationProgress> { return this.mutate("platform.marketingMigration.apply", input); }
  subscribePlatformSnapshot(onValue: (snapshot: PlatformSnapshot) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("platform.snapshot", {}, onValue, onError); }
  getPlatformGymDetail(gymId: string): Promise<PlatformGymDetail> { return this.query("platform.gym.detail", { gymId }); }
  subscribePlatformGymDetail(gymId: string, onValue: (detail: PlatformGymDetail) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("platform.gym.detail", { gymId }, onValue, onError); }
  listPublicSaasPlans(): Promise<PlatformSaasPlan[]> { return this.query("public.catalog"); }
  subscribePublicSaasPlans(onValue: (plans: PlatformSaasPlan[]) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("public.catalog", {}, onValue, onError); }
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
  /**
   * Platform subscription controls are scoped to the authenticated platform
   * operator, not to whichever gym workspace was last selected in the app.
   * Keeping this on the platform boundary also prevents a stale tenant/branch
   * selection from routing an admin save through member authorization.
   */
  updatePlatformGym(input: UpdatePlatformGymInput): Promise<MarketplaceGym> { return this.mutatePlatform("platform.gym.update", input); }
  async archivePlatformGym(input: ArchivePlatformGymInput): Promise<void> { await this.mutatePlatform("platform.gym.archive", input); }
  publishPlatformGymProfile(input: { gymId: string; reason: string }): Promise<{ id: string; publishedVersion: number }> { return this.mutatePlatform("platform.gym.profile.publish", input); }
  updatePlatformPlan(input: UpdatePlatformPlanInput): Promise<PlatformSaasPlan> { return this.mutate("platform.plan.update", input); }
  createPlatformInvoice(input: CreatePlatformInvoiceInput): Promise<PlatformBillingInvoice> { return this.mutate("platform.invoice.create", input); }
  issuePlatformInvoice(invoiceId: string): Promise<PlatformBillingInvoice> { return this.mutate("platform.invoice.issue", { invoiceId }); }
  markPlatformInvoicePastDue(invoiceId: string, reason: string): Promise<PlatformBillingInvoice> { return this.mutate("platform.invoice.past_due", { invoiceId, reason }); }
  recordPlatformInvoicePayment(input: RecordPlatformInvoicePaymentInput): Promise<PlatformBillingInvoice> { return this.mutate("platform.invoice.payment", input); }
  voidPlatformInvoice(invoiceId: string, reason: string): Promise<PlatformBillingInvoice> { return this.mutate("platform.invoice.void", { invoiceId, reason }); }
  listSupportCases(): Promise<PlatformSupportCase[]> { return this.query("support.list"); }
  subscribeSupportCases(onValue: (cases: PlatformSupportCase[]) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("support.list", {}, onValue, onError); }
  createSupportCase(input: CreateSupportCaseInput): Promise<PlatformSupportCase> { return this.mutate("support.create", input); }
  replyToSupportCase(caseId: string, body: string): Promise<PlatformSupportCase> { return this.mutate("support.reply", { caseId, body }); }
  resolvePlatformSupportCase(caseId: string, resolutionSummary: string): Promise<PlatformSupportCase> { return this.mutate("platform.support.resolve", { caseId, resolutionSummary }); }
  reopenPlatformSupportCase(caseId: string): Promise<PlatformSupportCase> { return this.mutate("platform.support.reopen", { caseId }); }
  assignPlatformSupportCase(caseId: string, assigneeId?: string): Promise<PlatformSupportCase> { return this.mutate("platform.support.assign", { caseId, assigneeId }); }
  replyToPlatformSupportCase(caseId: string, body: string): Promise<PlatformSupportCase> { return this.mutate("platform.support.reply", { caseId, body }); }
  listNotifications(): Promise<OperationalNotification[]> { return this.query("notifications.list"); }
  subscribeNotifications(onValue: (notifications: OperationalNotification[]) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("notifications.list", {}, onValue, onError); }
  setNotificationRead(notificationId: string, read: boolean): Promise<OperationalNotification> { return this.mutate("notifications.read", { notificationId, read }); }
  async markAllNotificationsRead(): Promise<void> { await this.mutate("notifications.readAll", {}); }

  async getDashboard(query: DashboardQuery): Promise<T.DashboardData> {
    return dashboardWithTodayQueue(await this.query("dashboard", query));
  }
  subscribeDashboard(query: DashboardQuery, onValue: (dashboard: T.DashboardData) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeQuery<T.DashboardData>("dashboard", query, (dashboard) => onValue(dashboardWithTodayQueue(dashboard)), onError);
  }
  listMembers(query: MemberListQuery): Promise<T.Page<T.MemberSummary>> { return this.query("members.list", query); }
  getMember(memberId: T.UUID): Promise<T.MemberDetail> { return this.query("members.get", { memberId }); }
  subscribeMember(memberId: T.UUID, onValue: (member: T.MemberDetail) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("members.get", { memberId }, onValue, onError); }
  createMember(input: T.CreateMemberInput): Promise<T.CreateMemberResult> { return this.mutate("members.create", input); }
  createMemberMembershipSale(input: T.CreateMemberMembershipSaleInput): Promise<T.CreateMemberMembershipSaleResult> { return this.mutate("members.create_and_sell", input); }
  updateMember(memberId: T.UUID, input: T.UpdateMemberInput): Promise<T.MemberDetail> { return this.mutate("members.update", { memberId, ...input }); }
  async archiveMember(memberId: T.UUID, input: { reason: string }): Promise<void> { await this.mutate("members.archive", { memberId, ...input }); }
  async deleteMember(memberId: T.UUID, input: { reason: string; confirmation: string }): Promise<void> { await this.mutate("members.delete", { memberId, ...input }); }
  checkMemberDuplicates(input: { phone?: string; email?: string }): Promise<T.DuplicateMatch[]> { return this.query("members.duplicates", input); }
  listMemberTimeline(memberId: T.UUID, query?: TimelineQuery): Promise<T.Page<T.TimelineEvent>> { return this.query("members.timeline", { memberId, ...(query ?? {}) }); }
  addMemberNote(memberId: T.UUID, input: { body: string }): Promise<T.TimelineEvent> { return this.mutate("members.note", { memberId, ...input }); }
  logMemberContactAttempt(memberId: T.UUID, input: T.ContactAttemptInput): Promise<T.TimelineEvent> { return this.mutate("members.contact", { memberId, ...input }); }

  listPlans(query: PlanListQuery): Promise<T.Page<T.MembershipPlan>> { return this.query("plans.list", query); }
  createPlan(input: T.CreatePlanInput): Promise<T.MembershipPlan> { return this.mutate("plans.create", input); }
  updatePlan(planId: T.UUID, input: T.UpdatePlanInput): Promise<T.MembershipPlan> { return this.mutate("plans.update", { planId, ...input }); }

  getGymPublicProfile(): Promise<T.GymPublicProfile> { return this.query("profiles.gym.get"); }
  subscribeGymPublicProfile(onValue: (profile: T.GymPublicProfile) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("profiles.gym.get", {}, onValue, onError); }
  listGymProfileVersions(): Promise<T.GymProfileVersion[]> { return this.query("profiles.gym.versions"); }
  saveGymPublicProfile(input: T.UpdateGymPublicProfileInput): Promise<T.GymPublicProfile> { return this.mutate("profiles.gym.save", input); }
  publishGymPublicProfile(): Promise<T.GymPublicProfile> { return this.mutate("profiles.gym.publish", {}); }
  unpublishGymPublicProfile(reason: string): Promise<T.GymPublicProfile> { return this.mutate("profiles.gym.unpublish", { reason }); }
  async uploadMediaAsset(input: { ownerType: T.MediaAssetOwnerType; ownerId: T.UUID; altText?: string; file: Blob }): Promise<T.MediaAsset> {
    if (!this.transport || !this.organizationId) throw ApiError.of(ERR.CONFIGURATION, "Select a gym workspace before uploading media.");
    const request = { organizationId: this.organizationId, activeBranchId: this.activeBranchId, correlationId: correlationId(), ownerType: input.ownerType, ownerPublicId: input.ownerId };
    try {
      const uploadUrl = await this.transport.mutation(api.media.generateUploadUrl, request) as string;
      const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": input.file.type || "application/octet-stream" }, body: input.file });
      if (!response.ok) throw ApiError.of(ERR.VALIDATION, "The image upload could not be completed.");
      const payload = await response.json() as { storageId?: string };
      if (!payload.storageId) throw ApiError.of(ERR.VALIDATION, "The image upload did not return a storage identifier.");
      return await this.transport.action(api.media.finalizeUpload, { ...request, altText: input.altText, storageId: payload.storageId }) as T.MediaAsset;
    } catch (error) {
      throw error instanceof ApiError ? error : errorFromConvex(error);
    }
  }
  async discardDraftMediaAsset(assetId: T.UUID): Promise<void> {
    if (!this.transport || !this.organizationId) throw ApiError.of(ERR.CONFIGURATION, "Select a gym workspace before discarding media.");
    try {
      await this.transport.mutation(api.media.discardDraft, { organizationId: this.organizationId, activeBranchId: this.activeBranchId, correlationId: correlationId(), assetId });
    } catch (error) {
      throw error instanceof ApiError ? error : errorFromConvex(error);
    }
  }

  getPtWorkspace(): Promise<T.PtWorkspace> { return this.query("pt.workspace"); }
  subscribePtWorkspace(onValue: (workspace: T.PtWorkspace) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("pt.workspace", {}, onValue, onError); }
  getPtMemberExperience(membershipId: T.UUID): Promise<T.PtMemberExperience> { return this.query("pt.member", { membershipId }); }
  subscribePtMemberExperience(membershipId: T.UUID, onValue: (experience: T.PtMemberExperience) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("pt.member", { membershipId }, onValue, onError); }
  getCustomerPtExperience(membershipId: T.UUID): Promise<T.PtMemberExperience> { return this.query("customer.pt", { membershipId }); }
  subscribeCustomerPtExperience(membershipId: T.UUID, onValue: (experience: T.PtMemberExperience) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("customer.pt", { membershipId }, onValue, onError); }
  upsertPtTrainerProfile(input: T.UpsertPtTrainerProfileInput): Promise<T.PtTrainerProfile> { return this.mutate("pt.trainer.upsert", input); }
  upsertPtPackage(input: T.UpsertPtPackageInput): Promise<T.PtPackage> { return this.mutate("pt.package.upsert", input); }
  deletePtPackage(packageId: T.UUID, reason: string): Promise<void> { return this.mutate("pt.package.delete", { packageId, reason }); }
  replacePtAvailability(input: T.ReplacePtAvailabilityInput): Promise<T.PtTrainerProfile> { return this.mutate("pt.availability.replace", input); }
  listPtAvailableSlots(input: { trainerProfileId: T.UUID; branchId: T.UUID; from: T.ISODate; to: T.ISODate }): Promise<T.PtAvailableSlot[]> { return this.query("pt.slots", input); }
  listCustomerPtAvailableSlots(input: { membershipId: T.UUID; trainerProfileId: T.UUID; branchId: T.UUID; from: T.ISODate; to: T.ISODate }): Promise<T.PtAvailableSlot[]> { return this.query("customer.pt.slots", input); }
  createPtBooking(input: T.CreatePtBookingInput): Promise<T.PtBooking> { return this.mutate("pt.booking.create", input); }
  createCustomerPtBooking(input: T.CreatePtBookingInput): Promise<T.PtBooking> { return this.mutate("customer.pt.booking.create", input); }
  cancelPtBooking(bookingId: T.UUID, input: { reason: string; cancelledByGym?: boolean }): Promise<T.PtBooking> { return this.mutate("pt.booking.cancel", { bookingId, ...input }); }
  cancelCustomerPtBooking(bookingId: T.UUID, reason: string): Promise<T.PtBooking> { return this.mutate("customer.pt.booking.cancel", { bookingId, reason }); }
  reschedulePtBooking(input: T.ReschedulePtBookingInput): Promise<T.PtBooking> { return this.mutate("pt.booking.reschedule", input); }
  rescheduleCustomerPtBooking(input: T.ReschedulePtBookingInput): Promise<T.PtBooking> { return this.mutate("customer.pt.booking.reschedule", input); }
  completePtBooking(bookingId: T.UUID, input: { reason?: string } = {}): Promise<T.PtBooking> { return this.mutate("pt.booking.complete", { bookingId, ...input }); }
  markPtBookingNoShow(bookingId: T.UUID, input: { reason?: string } = {}): Promise<T.PtBooking> { return this.mutate("pt.booking.no_show", { bookingId, ...input }); }
  requestPtPackage(input: T.RequestPtPackageInput): Promise<T.PtPackageOrder> { return this.mutate("pt.package.request", input); }
  requestCustomerPtPackage(input: T.RequestPtPackageInput): Promise<T.PtPackageOrder> { return this.mutate("customer.pt.package.request", input); }
  cancelPtPackageOrder(orderId: T.UUID, input: T.CancelPtPackageInput): Promise<T.PtPackageOrder> { return this.mutate("pt.package.cancel", { orderId, ...input }); }
  refundPtPackage(orderId: T.UUID, input: T.RefundPtPackageInput): Promise<T.PtPackageOrder> { return this.mutate("pt.package.refund", { orderId, ...input }); }
  previewPtIntroductoryCredits(sessionCount = 2): Promise<T.PtIntroductoryCreditPreview> { return this.query("pt.introductory.preview", { sessionCount }); }
  applyPtIntroductoryCredits(input: { sessionCount: number; reason: string; idempotencyKey: string }): Promise<T.PtIntroductoryCreditApplyResult> { return this.mutate("pt.introductory.apply", input); }

  listMemberships(query: MembershipListQuery): Promise<T.Page<T.MembershipSummary>> { return this.query("memberships.list", query); }
  getMembership(membershipId: T.UUID): Promise<T.MembershipDetail> { return this.query("memberships.get", { membershipId }); }
  subscribeMembership(membershipId: T.UUID, onValue: (membership: T.MembershipDetail) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("memberships.get", { membershipId }, onValue, onError); }
  createMembershipSale(input: T.CreateMembershipSaleInput): Promise<T.MembershipSaleResult> { return this.mutate("memberships.sale", input); }
  renewMembership(membershipId: T.UUID, input: T.RenewMembershipInput): Promise<T.MembershipSaleResult> { return this.mutate("memberships.renew", { membershipId, ...input }); }
  changeMembershipPlan(membershipId: T.UUID, input: T.ChangeMembershipPlanInput): Promise<T.MembershipSaleResult> { return this.mutate("memberships.plan_change", { membershipId, ...input }); }
  freezeMembership(membershipId: T.UUID, input: T.FreezeMembershipInput): Promise<T.MembershipDetail> { return this.mutate("memberships.freeze", { membershipId, ...input }); }
  requestMembershipFreeze(input: T.RequestMembershipFreezeInput): Promise<T.MembershipFreezeRequest> { return this.mutate("customer.membership.freezeRequest", input); }
  getCustomerFreezePolicy(membershipId: T.UUID): Promise<T.CustomerFreezePolicy> { return this.query("customer.membership.freezePolicy", { membershipId }); }
  listCustomerFreezeRequests(membershipId: T.UUID): Promise<T.MembershipFreezeRequest[]> { return this.query("customer.membership.freezeRequests", { membershipId }); }
  listFreezeRequests(query: { status?: T.FreezeRequestStatus } = {}): Promise<T.MembershipFreezeRequest[]> { return this.query("memberships.freeze_requests.list", query); }
  decideFreezeRequest(input: T.DecideFreezeRequestInput): Promise<T.MembershipFreezeRequest> { return this.mutate("memberships.freeze_request.decide", input); }
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
  updateLeadContact(leadId: T.UUID, input: T.UpdateLeadContactInput): Promise<T.LeadDetail> { return this.mutate("leads.update_contact", { leadId, ...input }); }
  logContactAttempt(leadId: T.UUID, input: T.ContactAttemptInput): Promise<T.LeadDetail> { return this.mutate("leads.contact", { leadId, ...input }); }
  updateTrialBooking(bookingId: T.UUID, input: { status: Extract<T.TrialBookingStatus, "confirmed" | "completed" | "no_show" | "cancelled">; note?: string }): Promise<T.LeadDetail> { return this.mutate("trials.update", { bookingId, ...input }); }
  scheduleLeadTrial(leadId: T.UUID, input: T.ScheduleLeadTrialInput): Promise<T.LeadDetail> { return this.mutate("trials.schedule_for_lead", { leadId, ...input }); }
  createOffer(input: CreateOfferInput): Promise<T.Offer> { return this.mutate("offers.create", input); }
  markOfferDelivered(offerId: T.UUID, input: MarkOfferDeliveredInput): Promise<T.Offer> { return this.mutate("offers.deliver", { offerId, ...input }); }
  recordOfferOutcome(offerId: T.UUID, input: RecordOfferOutcomeInput): Promise<T.Offer> { return this.mutate("offers.respond", { offerId, ...input }); }
  listTasks(query: TaskListQuery): Promise<T.Page<T.Task>> { return this.query("tasks.list", query); }
  subscribeTasks(query: TaskListQuery, onValue: (page: T.Page<T.Task>) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("tasks.list", query, onValue, onError); }
  createFollowUp(input: T.CreateTaskInput): Promise<T.Task> { return this.mutate("tasks.create", input); }
  completeTask(taskId: T.UUID, input: T.CompleteTaskInput): Promise<T.Task> { return this.mutate("tasks.complete", { taskId, ...input }); }
  completeLeadSale(leadId: T.UUID, input: T.CompleteLeadSaleInput): Promise<T.CompleteLeadSaleResult> { return this.mutate("leads.complete_sale", { leadId, ...input }); }
  listRenewalQueue(query: RenewalQueueQuery): Promise<T.Page<T.RenewalQueueItem>> { return this.query("renewal.queue", query); }
  subscribeRenewalQueue(query: RenewalQueueQuery, onValue: (page: T.Page<T.RenewalQueueItem>) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("renewal.queue", query, onValue, onError); }
  listAtRiskMembers(query: T.AtRiskMemberQuery): Promise<T.Page<T.AtRiskMemberItem>> { return this.query("retention.queue", query); }
  subscribeAtRiskMembers(query: T.AtRiskMemberQuery, onValue: (page: T.Page<T.AtRiskMemberItem>) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("retention.queue", query, onValue, onError); }
  async snoozeAtRiskMember(input: T.SnoozeAtRiskMemberInput): Promise<void> { await this.mutate("retention.snooze", input); }

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
  checkoutRetail(input: T.RetailCheckoutInput): Promise<T.ReceiptDetail & { receiptId: T.UUID; retailSale: T.RetailSale }> { return this.mutate("operations.retail.checkout", input); }
  refundRetailSale(saleId: T.UUID, input: T.RefundRetailSaleInput): Promise<T.ReceiptDetail & { retailSale: T.RetailSale }> { return this.mutate("operations.retail.refund", { saleId, ...input }); }
  voidRetailSale(saleId: T.UUID, input: T.VoidRetailSaleInput): Promise<T.ReceiptDetail & { retailSale: T.RetailSale }> { return this.mutate("operations.retail.void", { saleId, ...input }); }
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

  listAccountingAccounts(query: { search?: string } = {}): Promise<T.AccountingAccount[]> { return this.query("accounting.accounts.list", query); }
  listAccountingPeriods(query: { status?: T.AccountingPeriodStatus } = {}): Promise<T.AccountingPeriod[]> { return this.query("accounting.periods.list", query); }
  listAccountingJournalEntries(query: T.AccountingJournalQuery = {}): Promise<T.Page<T.AccountingJournalEntrySummary>> { return this.query("accounting.journal_entries.list", query); }
  getAccountingJournalEntry(entryId: T.UUID): Promise<T.AccountingJournalEntryDetail> { return this.query("accounting.journal_entries.get", { entryId }); }
  getAccountingTrialBalance(query: { branchId?: T.UUID; periodId?: T.UUID } = {}): Promise<T.AccountingTrialBalance> { return this.query("accounting.trial_balance", query); }
  postManualJournal(input: T.PostManualJournalInput): Promise<T.AccountingJournalEntryDetail> { return this.mutate("accounting.manual_journal.post", input); }
  listAccountingSourcePostings(query: T.AccountingSourcePostingQuery = {}): Promise<T.Page<T.AccountingSourcePosting>> { return this.query("accounting.source_postings.list", query); }
  refreshAccountingSourceQueue(input: T.RefreshAccountingSourceQueueInput = {}): Promise<T.RefreshAccountingSourceQueueResult> { return this.mutate("accounting.source_postings.refresh", input); }
  postAccountingSource(input: T.PostAccountingSourceInput): Promise<T.AccountingSourcePosting> { return this.mutate("accounting.source.post", input); }
  excludeAccountingSource(input: T.ReviewAccountingSourceInput): Promise<T.AccountingSourcePosting> { return this.mutate("accounting.source.exclude", input); }
  reconsiderAccountingSource(input: T.ReviewAccountingSourceInput): Promise<T.AccountingSourcePosting> { return this.mutate("accounting.source.reconsider", input); }
  reverseAccountingEntry(entryId: T.UUID, input: { reason: string; idempotencyKey: string }): Promise<T.AccountingJournalEntryDetail> { return this.mutate("accounting.entry.reverse", { entryId, ...input }); }
  closeAccountingPeriod(periodId: T.UUID, reason: string): Promise<T.AccountingPeriod> { return this.mutate("accounting.period.close", { periodId, reason }); }
  reopenAccountingPeriod(periodId: T.UUID, reason: string): Promise<T.AccountingPeriod> { return this.mutate("accounting.period.reopen", { periodId, reason }); }

  getIncomeStatement(input: T.ManagementReportInput): Promise<T.IncomeStatement> { return this.query("reports.income_statement", input); }
  getBalanceSheet(input: T.ManagementReportInput): Promise<T.BalanceSheet> { return this.query("reports.balance_sheet", input); }
  getCashflowStatement(input: T.ManagementReportInput): Promise<T.CashflowStatement> { return this.query("reports.cashflow_statement", input); }
  getGeneralManagerAnalysis(input: T.ManagementReportInput): Promise<T.GeneralManagerAnalysis> { return this.query("reports.gm_analysis", input); }

  getAutomationMonitoringSummary(): Promise<import("@/lib/domain/qol").AutomationMonitoringSummary> { return this.query("automations.monitoring"); }
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
  requestExport(input: import("@/lib/domain/qol").ExportRequestInput): Promise<import("@/lib/domain/qol").ExportJob> { return this.mutate("exports.request", input); }
  listExportJobs(): Promise<import("@/lib/domain/qol").ExportJob[]> { return this.query("exports.list"); }
  requestMemberPersonalDataExport(idempotencyKey: string): Promise<import("@/lib/domain/qol").ExportJob> { return this.mutate("exports.member_personal_data", { idempotencyKey }); }
  searchWorkspace(search: string): Promise<import("@/lib/domain/qol").WorkspaceSearchResult[]> { return this.query("workspace.search", { search }); }
  listRecentWorkspaceItems(): Promise<import("@/lib/domain/qol").RecentWorkspaceItem[]> { return this.query("workspace.recents"); }
  async recordRecentWorkspaceItem(item: Omit<import("@/lib/domain/qol").RecentWorkspaceItem, "viewedAt">): Promise<void> { await this.mutate("workspace.recent.record", item); }
  async clearRecentWorkspaceItems(): Promise<void> { await this.mutate("workspace.recents.clear"); }
  listPinnedWorkspaceItems(): Promise<import("@/lib/domain/qol").PinnedWorkspaceItem[]> { return this.query("workspace.pins"); }
  pinWorkspaceItem(item: Omit<import("@/lib/domain/qol").PinnedWorkspaceItem, "id" | "position" | "createdAt"> & { position?: number }): Promise<import("@/lib/domain/qol").PinnedWorkspaceItem> { return this.mutate("workspace.pin.upsert", item); }
  async unpinWorkspaceItem(id: T.UUID): Promise<void> { await this.mutate("workspace.pin.delete", { id }); }
  listAuditEvents(query: AuditQuery): Promise<T.Page<T.AuditEvent>> { return this.query("audit.list", query); }

  getOrganizationSettings(): Promise<T.OrganizationSettings> { return this.query("settings.get"); }
  getBrandKit(): Promise<T.BrandKit> { return this.query("settings.brand.get"); }
  updateBrandKit(input: T.UpdateBrandKitInput): Promise<T.BrandKit> { return this.mutate("settings.brand.update", input); }
  getWorkspaceAccess(): Promise<T.WorkspaceAccess> { return this.query("workspace.access"); }
  subscribeWorkspaceAccess(onValue: (access: T.WorkspaceAccess) => void, onError?: (error: unknown) => void): Promise<() => void> { return this.subscribeQuery("workspace.access", {}, onValue, onError); }
  getOrganizationEntitlements(): Promise<T.OrganizationEntitlements> { return this.query("workspace.entitlements"); }
  getWorkspaceModulePreferences(): Promise<T.WorkspaceModulePreferences> { return this.query("workspace.preferences"); }
  getWorkspaceModuleStatus(moduleKey: T.WorkspaceModuleKey): Promise<T.WorkspaceModuleStatus> { return this.query("workspace.module", { moduleKey }); }
  updateWorkspaceModulePreferences(input: T.UpdateWorkspaceModulePreferencesInput): Promise<T.WorkspaceAccess> { return this.mutate("workspace.preferences.update", input); }
  updateOrganizationSettings(input: T.UpdateOrganizationSettingsInput): Promise<T.OrganizationSettings> { return this.mutate("settings.organization.update", input); }
  updatePaymentMethods(input: T.PaymentMethod[]): Promise<T.OrganizationSettings> { return this.mutate("settings.paymentMethods", { paymentMethods: input }); }
  updateNotificationSettings(input: T.NotificationSettings): Promise<T.OrganizationSettings> { return this.mutate("settings.notifications", { notifications: input }); }
  updateOperationalPolicies(input: T.OperationalPolicies): Promise<T.OrganizationSettings> { return this.mutate("settings.operationalPolicies", { operationalPolicies: input }); }
  getOperationalEmailSettings(): Promise<T.OperationalEmailActivationSettings> { return this.query("settings.operationalEmail.get"); }
  updateOperationalEmailSettings(input: { enabledKinds: string[]; reason: string }): Promise<T.OperationalEmailActivationSettings> { return this.mutate("settings.operationalEmail.update", input); }
  listBranches(): Promise<T.Branch[]> { return this.query("branches.list"); }
  upsertBranch(input: { id?: T.UUID; name: string; code: string; address: string; phone: string; capacity: number; status: "active" | "inactive" }): Promise<T.Branch> { return this.mutate("branches.upsert", input); }
  listZones(input: { branchId?: T.UUID; includeArchived?: boolean } = {}): Promise<T.Zone[]> { return this.query("zones.list", input); }
  upsertZone(input: T.UpsertZoneInput): Promise<T.Zone> { return this.mutate("zones.upsert", input); }
  archiveZone(zoneId: T.UUID): Promise<T.Zone> { return this.mutate("zones.archive", { id: zoneId }); }
  listProducts(query: { search?: string; includeArchived?: boolean } = {}): Promise<T.Product[]> { return this.query("operations.products.list", query); }
  upsertProduct(input: T.UpsertProductInput): Promise<T.Product> { return this.mutate("operations.product.upsert", input); }
  deleteProduct(input: T.DeleteProductInput): Promise<T.DeleteProductResult> { return this.mutate("operations.product.delete", input); }
  archiveProduct(productId: T.UUID, reason: string): Promise<T.Product> { return this.mutate("operations.product.archive", { id: productId, reason }); }
  listSuppliers(query: { search?: string; includeArchived?: boolean } = {}): Promise<T.Supplier[]> { return this.query("operations.suppliers.list", query); }
  upsertSupplier(input: T.UpsertSupplierInput): Promise<T.Supplier> { return this.mutate("operations.supplier.upsert", input); }
  archiveSupplier(supplierId: T.UUID, reason: string): Promise<T.Supplier> { return this.mutate("operations.supplier.archive", { id: supplierId, reason }); }
  listInventory(input: { branchId?: T.UUID; productId?: T.UUID } = {}): Promise<T.InventoryBalance[]> { return this.query("operations.inventory.list", input); }
  recordStockMovement(input: Parameters<GymOSApi["recordStockMovement"]>[0]): Promise<T.StockMovement> { return this.mutate("operations.stock_movement.record", input); }
  transferInventory(input: T.InventoryTransferInput): Promise<T.InventoryTransferResult> { return this.mutate("operations.inventory.transfer", input); }
  listStockMovements(query: { branchId?: T.UUID; productId?: T.UUID; page?: number; pageSize?: number } = {}): Promise<T.Page<T.StockMovement>> { return this.query("operations.stock_movements.list", query); }
  listLowStockAlerts(input: { branchId?: T.UUID; includeDismissed?: boolean } = {}): Promise<T.LowStockAlert[]> { return this.query("operations.low_stock.list", input); }
  refreshLowStockAlerts(input: { branchId?: T.UUID } = {}): Promise<T.LowStockAlert[]> { return this.mutate("operations.low_stock.refresh", input); }
  dismissLowStockAlert(input: { alertId: T.UUID; reason: string }): Promise<T.LowStockAlert> { return this.mutate("operations.low_stock.dismiss", input); }
  createPurchaseOrder(input: T.CreatePurchaseOrderInput): Promise<T.PurchaseOrder> { return this.mutate("operations.purchase_order.create", input); }
  approvePurchaseOrder(purchaseOrderId: T.UUID, reason?: string): Promise<T.PurchaseOrder> { return this.mutate("operations.purchase_order.approve", { id: purchaseOrderId, reason }); }
  listPurchaseOrders(query: { branchId?: T.UUID; status?: T.PurchaseOrderStatus } = {}): Promise<T.PurchaseOrder[]> { return this.query("operations.purchase_orders.list", query); }
  receivePurchaseOrder(input: T.ReceivePurchaseOrderInput): Promise<T.PurchaseOrder> { return this.mutate("operations.purchase_order.receive", input); }
  notifyPurchaseOrderSupplier(input: { purchaseOrderId: T.UUID; channel?: "supplier_email" | "supplier_sms"; reason: string }): Promise<T.SupplierNotificationResult> { return this.mutate("operations.supplier_notification.preview", input); }
  getMessagingStatus(): Promise<T.MessagingStatus> { return this.query("messaging.status", {}); }
  listMessageTemplateCatalogue(): Promise<T.MessageTemplateCatalogueEntry[]> { return this.query("messaging.templates.catalogue", {}); }
  getSubscriptionAgreementContext(): Promise<T.SubscriptionAgreementContext> { return this.query("legal.agreement.current", {}); }
  signSubscriptionAgreement(input: T.SignSubscriptionAgreementInput): Promise<T.SubscriptionAgreement> { return this.mutate("legal.agreement.sign", input); }
  listPlatformAgreements(): Promise<T.PlatformAgreementSummary[]> { return this.query("platform.agreements.list", {}); }
  getPlatformAgreement(agreementId: T.UUID): Promise<T.SubscriptionAgreement> { return this.query("platform.agreement.get", { agreementId }); }
  revealPlatformAgreementId(input: T.RevealAgreementIdInput): Promise<T.RevealAgreementIdResult> { return this.mutate("platform.agreement.reveal_id", input); }
  countersignPlatformAgreement(input: T.CountersignAgreementInput): Promise<T.SubscriptionAgreement> { return this.mutate("platform.agreement.countersign", input); }
  listPayables(query: T.PayablesQuery = {}): Promise<T.PayablesPage> { return this.query("operations.payables.list", query); }
  exportPayables(query: T.PayablesQuery = {}): Promise<T.PayablesExport> { return this.query("operations.payables.export", query); }
  listPayablesReconciliation(query: { branchId?: T.UUID } = {}): Promise<T.PayablesReconciliation> { return this.query("operations.payables.reconciliation", query); }
  listSupplierPayments(query: T.SupplierPaymentsQuery = {}): Promise<T.Page<T.SupplierPayment>> { return this.query("operations.supplier_payments.list", query); }
  getSupplierPayment(paymentId: T.UUID): Promise<T.SupplierPaymentDetail> { return this.query("operations.supplier_payment.get", { paymentId }); }
  recordSupplierPayment(input: T.RecordSupplierPaymentInput): Promise<T.SupplierPaymentDetail> { return this.mutate("operations.supplier_payment.record", input); }
  reverseSupplierPayment(input: T.ReverseSupplierPaymentInput): Promise<T.SupplierPaymentDetail> { return this.mutate("operations.supplier_payment.reverse", input); }
  listFacilityTasks(query: { branchId?: T.UUID; zoneId?: T.UUID; status?: T.FacilityTaskStatus; kind?: T.FacilityTaskKind } = {}): Promise<T.FacilityTask[]> { return this.query("operations.facility_tasks.list", query); }
  upsertFacilityTask(input: T.UpsertFacilityTaskInput): Promise<T.FacilityTask> { return this.mutate("operations.facility_task.upsert", input); }
  listClassSessions(query: T.ClassSessionQuery): Promise<T.ClassSession[]> { return this.query("classes.sessions.list", query); }
  upsertClassSession(input: T.UpsertClassSessionInput): Promise<T.ClassSession> { return this.mutate("classes.session.upsert", input); }
  deleteClassSession(input: { sessionId: T.UUID; reason: string }): Promise<{ id: T.UUID }> { return this.mutate("classes.session.delete", input); }
  addClassAttendee(input: T.ClassRosterInput): Promise<T.ClassSession> { return this.mutate("classes.roster.add", input); }
  removeClassAttendee(input: T.ClassRosterInput): Promise<T.ClassSession> { return this.mutate("classes.roster.remove", input); }
  setClassAttendance(input: T.ClassAttendanceInput): Promise<T.ClassSession> { return this.mutate("classes.attendance.set", input); }
  listClassOccurrences(query: T.ClassOccurrenceQuery): Promise<T.ClassOccurrence[]> { return this.query("classes.occurrences.list", query); }
  getClassCalendarBounds(): Promise<{ startHour?: number; endHour?: number }> { return this.query("classes.calendar", {}); }
  getCustomerClassExperience(membershipId: T.UUID): Promise<T.CustomerClassExperience> { return this.query("customer.classes", { membershipId }); }
  bookCustomerClass(input: { membershipId: T.UUID; occurrenceId: T.UUID }): Promise<T.ClassBookingResult> { return this.mutate("customer.classes.book", input); }
  cancelCustomerClass(input: { membershipId: T.UUID; occurrenceId: T.UUID }): Promise<T.ClassBookingResult> { return this.mutate("customer.classes.cancel", input); }
  addClassOccurrenceAttendee(input: T.ClassOccurrenceRosterInput): Promise<T.ClassOccurrence> { return this.mutate("classes.occurrence.roster.add", input); }
  removeClassOccurrenceAttendee(input: { occurrenceId: T.UUID; bookingId: T.UUID; reason?: string }): Promise<T.ClassOccurrence> { return this.mutate("classes.occurrence.roster.remove", input); }
  setClassOccurrenceAttendance(input: T.ClassOccurrenceAttendanceInput): Promise<T.ClassOccurrence> { return this.mutate("classes.occurrence.attendance.set", input); }
  finalizeClassOccurrenceAttendance(input: { occurrenceId: T.UUID }): Promise<T.ClassOccurrence> { return this.mutate("classes.occurrence.attendance.finalize", input); }
  substituteClassOccurrenceCoach(input: T.SubstituteClassCoachInput): Promise<T.ClassOccurrence> { return this.mutate("classes.occurrence.coach.substitute", input); }
  listClassCoaches(): Promise<T.ClassCoach[]> { return this.query("classes.coaches.list", {}); }
  upsertClassCoach(input: T.UpsertClassCoachInput): Promise<T.ClassCoach> { return this.mutate("classes.coach.upsert", input); }
  removeClassCoach(coachId: T.UUID): Promise<{ id: T.UUID }> { return this.mutate("classes.coach.remove", { coachId }); }
  listEquipmentAssets(query: { branchId?: T.UUID; status?: T.EquipmentAssetStatus } = {}): Promise<T.EquipmentAsset[]> { return this.query("operations.equipment_assets.list", query); }
  upsertEquipmentAsset(input: T.UpsertEquipmentAssetInput): Promise<T.EquipmentAsset> { return this.mutate("operations.equipment_asset.upsert", input); }
  reportEquipmentIssue(input: Parameters<GymOSApi["reportEquipmentIssue"]>[0]): Promise<T.EquipmentIssue> { return this.mutate("operations.equipment_issue.report", input); }
  updateEquipmentIssue(issueId: T.UUID, input: T.UpdateEquipmentIssueInput): Promise<T.EquipmentIssue> { return this.mutate("operations.equipment_issue.update", { id: issueId, ...input }); }
  listEquipmentIssues(query: { branchId?: T.UUID; assetId?: T.UUID; status?: T.EquipmentIssueStatus } = {}): Promise<T.EquipmentIssue[]> { return this.query("operations.equipment_issues.list", query); }
  upsertEquipmentWorkOrder(input: T.UpsertEquipmentWorkOrderInput): Promise<T.EquipmentWorkOrder> { return this.mutate("operations.equipment_work_order.upsert", input); }
  listEquipmentWorkOrders(query: { branchId?: T.UUID; assetId?: T.UUID; status?: T.EquipmentWorkOrder["status"] } = {}): Promise<T.EquipmentWorkOrder[]> { return this.query("operations.equipment_work_orders.list", query); }
  getEquipmentRecommendation(assetId: T.UUID): Promise<T.EquipmentRecommendation> { return this.query("operations.equipment.recommendation", { id: assetId }); }
  listUsers(query: UserListQuery): Promise<T.Page<T.StaffUser>> { return this.query("users.list", query); }
  previewMemberImport(input: MemberImportPreviewInput): Promise<MemberImportPreview> { return this.mutate("members.import.preview", input); }
  commitMemberImport(input: MemberImportCommitInput): Promise<MemberImportCommitResult> { return this.mutate("members.import.commit", input); }
  listMemberImports(): Promise<MemberImportSummary[]> { return this.query("members.import.list"); }
  getMemberImport(importId: T.UUID): Promise<MemberImportPreview> { return this.query("members.import.get", { importId }); }
  undoMemberImport(input: MemberImportUndoInput): Promise<MemberImportUndoResult> { return this.mutate("members.import.undo", input); }
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
  const isTestRuntime = process.env.NODE_ENV === "test" || process.env.VITEST === "true" || Boolean(process.env.VITEST_WORKER_ID);
  const deploymentClass = process.env.NEXT_PUBLIC_RIVET_DEPLOYMENT_CLASS;
  const approvedPreview = deploymentClass === "preview" && process.env.VERCEL_ENV !== "production";
  const isProductionDeployment = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production" || deploymentClass === "production";
  // A mock adapter is useful for local visual review and unit tests, but it is
  // not a safe production fallback. Fail closed even when a deployment has a
  // stale NEXT_PUBLIC_DATA_MODE=mock value; otherwise a production bundle can
  // silently expose seeded tenant data.
  if (configured === "mock") {
    if (isProductionDeployment && !isTestRuntime && !approvedPreview) {
      throw new Error("RIVET production runtime cannot use mock data mode.");
    }
    return "mock";
  }
  if (configured === "convex") return "convex";
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
