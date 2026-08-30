import type { ISODateTime, Money, ReceiptDetail, TransactionStatus, TransactionType, UUID } from "./types";

export type SavedViewSurface = "members" | "leads" | "customer_finance";

export interface SavedView {
  id: UUID;
  surface: SavedViewSurface;
  name: string;
  state: Record<string, unknown>;
  isDefault: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type BulkOperationKind =
  | "members_add_tags"
  | "members_remove_tags"
  | "members_assign_branch"
  | "members_create_follow_up"
  | "members_archive"
  | "leads_assign_owner"
  | "leads_create_follow_up"
  | "leads_close_lost";

export type JobStatus = "queued" | "running" | "partially_completed" | "completed" | "failed" | "cancelled";

export interface JobFailure {
  recordId: UUID;
  label?: string;
  message: string;
}

export interface BulkOperationJob {
  id: UUID;
  kind: BulkOperationKind;
  status: JobStatus;
  requestedCount: number;
  succeededCount: number;
  skippedCount: number;
  failedCount: number;
  failures: JobFailure[];
  correlationId: string;
  createdAt: ISODateTime;
  completedAt?: ISODateTime;
}

export interface BulkOperationInput {
  kind: BulkOperationKind;
  recordIds: UUID[];
  idempotencyKey: string;
  tags?: string[];
  branchId?: UUID;
  ownerId?: UUID;
  dueAt?: ISODateTime;
  reason?: string;
}

export type DuplicateCaseStatus = "open" | "ignored" | "merged" | "no_longer_matching";
export type DuplicateMatchReason = "phone" | "email" | "member_number" | "name_and_contact";

export interface DuplicateMemberSummary {
  id: UUID;
  memberNumber: string;
  fullName: string;
  phone: string;
  email?: string;
  homeBranchId: UUID;
  status: "active" | "inactive" | "archived" | "merged";
  balance: Money;
  membershipCount: number;
  visitCount: number;
  timelineCount: number;
  mergedIntoMemberId?: UUID;
  version: string;
}

export interface DuplicateCase {
  id: UUID;
  status: DuplicateCaseStatus;
  reasons: DuplicateMatchReason[];
  confidence: "strong" | "possible";
  primary: DuplicateMemberSummary;
  candidate: DuplicateMemberSummary;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  resolutionReason?: string;
  survivingMemberId?: UUID;
  correlationId?: string;
}

export interface DuplicateCaseQuery {
  status?: DuplicateCaseStatus;
  page?: number;
  pageSize?: number;
}

export interface MergeMemberInput {
  caseId: UUID;
  survivingMemberId: UUID;
  mergedMemberId: UUID;
  primaryVersion: string;
  candidateVersion: string;
  reason: string;
  fieldSourceMemberIds?: Partial<Record<"fullName" | "fullNameAr" | "phone" | "email" | "dateOfBirth" | "gender" | "preferredLanguage" | "addressLine1" | "city" | "emergencyContactName" | "emergencyContactRelationship" | "emergencyContactPhone" | "homeBranchId", UUID>>;
}

export type OnboardingAudience = "owner" | "staff" | "member";

export interface OnboardingProgress {
  audience: OnboardingAudience;
  version: number;
  completedStepKeys: string[];
  dismissedAt?: ISODateTime;
  completedAt?: ISODateTime;
  updatedAt: ISODateTime;
}

export interface OnboardingTaskState {
  key: string;
  title: string;
  description: string;
  href: string;
  category: "required" | "recommended" | "optional";
  complete: boolean;
  completionMode: "state" | "manual";
  unavailableReason?: string;
}

export interface OnboardingExperience {
  progress: OnboardingProgress;
  tasks: OnboardingTaskState[];
  role?: string;
  organizationName?: string;
}

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  label?: string;
}

export interface PushSubscriptionSummary {
  id: UUID;
  label: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type ExportKind =
  | "members"
  | "leads"
  | "payments"
  | "audit"
  | "membership_liabilities"
  | "personal_training"
  | "operations"
  | "member_personal_data";

export interface ExportJob {
  id: UUID;
  kind: ExportKind;
  status: JobStatus;
  fileName?: string;
  mimeType?: string;
  rowCount?: number;
  /** Number of authorized rows before export-size limits are applied. */
  totalRows?: number;
  downloadUrl?: string;
  /** Present only on an authorized export response; never exposed through a public URL. */
  content?: string;
  timezone?: string;
  branchScope?: string;
  filters?: Record<string, unknown>;
  failureMessage?: string;
  createdAt: ISODateTime;
  completedAt?: ISODateTime;
  expiresAt?: ISODateTime;
}

export interface ExportRequestInput {
  kind: ExportKind;
  filters?: Record<string, unknown>;
  idempotencyKey: string;
}

export type WorkspaceSearchKind = "member" | "lead" | "receipt" | "page" | "action";

export interface WorkspaceSearchResult {
  kind: WorkspaceSearchKind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  keywords?: string[];
}

export interface RecentWorkspaceItem {
  kind: Exclude<WorkspaceSearchKind, "action">;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  viewedAt: ISODateTime;
}

export interface PinnedWorkspaceItem {
  id: UUID;
  targetKey: string;
  kind: "action" | "saved_view";
  label: string;
  href: string;
  position: number;
  createdAt: ISODateTime;
}

export interface CustomerFinancialSummary {
  outstanding: Money;
  paidLifetime: Money;
  receiptCount: number;
  lastPaymentAt?: ISODateTime;
  gyms: Array<{ id: UUID; name: string }>;
}

export interface CustomerTransaction {
  id: UUID;
  gymId: UUID;
  gymName: string;
  branchName: string;
  membershipId?: UUID;
  receiptId?: UUID;
  receiptNumber: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: Money;
  method: string;
  occurredAt: ISODateTime;
  explanation: string;
}

export interface CustomerTransactionQuery {
  gymId?: UUID;
  status?: TransactionStatus;
  type?: TransactionType;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sort?: string;
}

export interface CustomerReceipt extends ReceiptDetail {
  gymId: UUID;
}

export interface AutomationMonitoringSummary {
  globallyPaused: boolean;
  pauseReason: string;
  ruleCount: number;
  persistedEnabledCount: number;
  executionsLast30Days: number;
  successCount: number;
  suppressedCount: number;
  retryCount: number;
  failureCount: number;
  providers: Array<{ key: string; label: string; configured: boolean; live: boolean; detail: string }>;
}
