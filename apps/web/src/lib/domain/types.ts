import type { LeadProgressFacts } from "@/lib/crm/lead-progression";

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

export type BrandPaletteKey = "rivet" | "gold" | "red" | "green" | "blue" | "violet";

export interface BrandTokens {
  primary: string;
  primaryHover: string;
  primaryForeground: string;
  primarySoft: string;
  primarySoftForeground: string;
  focusRing: string;
}

export interface BrandKit {
  organizationId: UUID;
  paletteKey: BrandPaletteKey;
  primaryColor: string;
  tokens: BrandTokens;
  logoAssetId?: UUID;
  logoUrl?: string;
  logoAltText?: string;
  version: number;
  updatedAt?: ISODateTime;
  updatedById?: UUID;
}

export type ZoneKind = "floor" | "studio" | "weights" | "cardio" | "functional" | "locker_room" | "bathroom" | "reception" | "storage" | "other";

export interface Zone {
  id: UUID;
  organizationId: UUID;
  branchId: UUID;
  code: string;
  name: string;
  nameAr?: string;
  kind: ZoneKind;
  capacity?: number;
  status: "active" | "archived";
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface UpsertZoneInput {
  id?: UUID;
  branchId: UUID;
  code: string;
  name: string;
  nameAr?: string;
  kind: ZoneKind;
  capacity?: number;
  status?: "active" | "archived";
}

// ---------------------------------------------------------------------------
// Daily operations
// ---------------------------------------------------------------------------

export type OperationsRecordStatus = "active" | "archived";
export type FinancialPostingStatus = "not_posted" | "pending" | "posted" | "failed" | "reversed";

export type ProductUnit = "each" | "kg" | "liter" | "box" | "serving";

export interface Product {
  id: UUID;
  organizationId: UUID;
  sku: string;
  name: string;
  description?: string;
  unit: ProductUnit;
  reorderPoint: number;
  preferredSupplierId?: UUID;
  /** Customer-facing price used by retail checkout. Supplier cost is separate. */
  retailPrice?: Money;
  status: OperationsRecordStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface UpsertProductInput {
  id?: UUID;
  /** Branch whose available quantity should be set through an audited adjustment. */
  branchId?: UUID;
  /** Current available stock for the selected branch. */
  availableQuantity?: number;
  sku: string;
  name: string;
  description?: string;
  unit: ProductUnit;
  reorderPoint: number;
  preferredSupplierId?: UUID;
  /** Customer-facing price used by retail checkout. Omit to keep the item unsellable. */
  retailPrice?: Money;
  status?: OperationsRecordStatus;
}

/**
 * A permanent product-master deletion only removes the mutable catalog row.
 * The backend keeps this identity snapshot so stock history, purchase orders,
 * and retail-sale refunds remain explainable after the SKU is reused.
 */
export interface ProductTombstone {
  id: UUID;
  organizationId: UUID;
  productId: UUID;
  sku: string;
  name: string;
  unit: ProductUnit;
  description?: string;
  retailPrice?: Money;
  deletedAt: ISODateTime;
  deletedById: UUID;
  reason: string;
}

export interface DeleteProductInput {
  productId: UUID;
  reason: string;
  /** Required typed confirmation; the server accepts the SKU or name. */
  confirmation: string;
}

export interface DeleteProductResult {
  deleted: true;
  productId: UUID;
  sku: string;
  name: string;
  deletedAt: ISODateTime;
}

export interface Supplier {
  id: UUID;
  organizationId: UUID;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  terms?: string;
  branchIds: UUID[];
  preferredProductIds: UUID[];
  status: OperationsRecordStatus;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface UpsertSupplierInput {
  id?: UUID;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  terms?: string;
  branchIds: UUID[];
  preferredProductIds?: UUID[];
  status?: OperationsRecordStatus;
}

export interface InventoryBalance {
  id: UUID;
  organizationId: UUID;
  branchId: UUID;
  productId: UUID;
  quantityOnHand: number;
  committedQuantity: number;
  availableQuantity: number;
  /** Moving-average inventory valuation for the on-hand quantity. */
  totalCost?: Money;
  /** False for retained deleted-product tombstone balances. */
  sellable?: boolean;
  lastMovementAt?: ISODateTime;
  updatedAt: ISODateTime;
}

export type StockMovementType = "receive" | "sale" | "consumption" | "adjustment" | "return" | "transfer_in" | "transfer_out" | "waste";

export interface StockMovement {
  id: UUID;
  organizationId: UUID;
  branchId: UUID;
  productId: UUID;
  /** Snapshot fallback used when the product master is permanently deleted. */
  productSku?: string;
  productName?: string;
  productUnit?: ProductUnit;
  type: StockMovementType;
  quantityDelta: number;
  quantity: number;
  unitCost?: Money;
  /** Exact valuation for this movement. Unit cost is display-only and may round. */
  totalCost?: Money;
  reason?: string;
  referenceType?: string;
  referenceId?: UUID;
  idempotencyKey: string;
  financialPostingStatus: FinancialPostingStatus;
  financialSourceId?: UUID;
  occurredAt: ISODateTime;
  createdAt: ISODateTime;
  createdById: UUID;
}

/**
 * Moves sellable stock between two active branches in the same gym. The
 * server records a paired transfer_out/transfer_in movement atomically.
 */
export interface InventoryTransferInput {
  sourceBranchId: UUID;
  destinationBranchId: UUID;
  productId: UUID;
  quantity: number;
  reason: string;
  idempotencyKey: string;
}

export interface InventoryTransferResult {
  id: UUID;
  organizationId: UUID;
  sourceBranchId: UUID;
  destinationBranchId: UUID;
  productId: UUID;
  quantity: number;
  reason: string;
  idempotencyKey: string;
  status: "completed";
  totalCost?: Money;
  sourceMovementId: UUID;
  destinationMovementId: UUID;
  sourceMovement: StockMovement;
  destinationMovement: StockMovement;
  sourceAvailableQuantity: number;
  destinationAvailableQuantity: number;
  createdById: UUID;
  occurredAt: ISODateTime;
}

/** Immutable transfer facts retained for branch reconciliation and history. */
export interface InventoryTransfer {
  id: UUID;
  organizationId: UUID;
  sourceBranchId: UUID;
  destinationBranchId: UUID;
  productId: UUID;
  quantity: number;
  reason: string;
  status: "completed";
  sourceMovementId: UUID;
  destinationMovementId: UUID;
  totalCost?: Money;
  sourceAvailableBefore: number;
  destinationAvailableBefore: number;
  sourceAvailableAfter: number;
  destinationAvailableAfter: number;
  idempotencyKey: string;
  createdById: UUID;
  occurredAt: ISODateTime;
}

export interface LowStockAlert {
  id: UUID;
  organizationId: UUID;
  branchId: UUID;
  productId: UUID;
  quantityOnHand: number;
  committedQuantity: number;
  availableQuantity: number;
  reorderPoint: number;
  status: "open" | "dismissed";
  dismissedAt?: ISODateTime;
  dismissedReason?: string;
  updatedAt: ISODateTime;
}

export type PurchaseOrderStatus = "draft" | "approved" | "partially_received" | "received" | "cancelled";
export type PurchaseOrderSourceType = "supplier" | "private";

export interface PurchaseOrderLine {
  productId: UUID;
  sku: string;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  unitCost: Money;
  lineTotal: Money;
}

export interface PurchaseOrder {
  id: UUID;
  organizationId: UUID;
  branchId: UUID;
  sourceType: PurchaseOrderSourceType;
  supplierId?: UUID;
  supplierName: string;
  lines: PurchaseOrderLine[];
  status: PurchaseOrderStatus;
  currency: string;
  total: Money;
  supplierInvoiceReference?: string;
  notes?: string;
  approvedAt?: ISODateTime;
  approvedById?: UUID;
  receivedAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CreatePurchaseOrderInput {
  branchId: UUID;
  /** Use `supplier` for a known supplier or `private` for an undisclosed source. */
  sourceType?: PurchaseOrderSourceType;
  supplierId?: UUID;
  lines: Array<{ productId: UUID; quantity: number; unitCost: Money }>;
  supplierInvoiceReference?: string;
  notes?: string;
}

export interface ReceivePurchaseOrderInput {
  purchaseOrderId: UUID;
  lines?: Array<{ productId: UUID; quantity: number; unitCost?: Money }>;
  idempotencyKey: string;
}

export interface SupplierNotificationResult {
  purchaseOrderId: UUID;
  status: "not_configured" | "sandboxed";
  channel: "supplier_email" | "supplier_sms";
  detail: string;
  attemptedAt: ISODateTime;
}

export type FacilityTaskKind = "cleaning" | "inspection" | "incident";
export type FacilityTaskSeverity = "low" | "medium" | "high" | "critical";
export type FacilityTaskStatus = "open" | "in_progress" | "blocked" | "completed" | "cancelled";

export interface TrafficContext {
  checkInsLastHour?: number;
  occupancyPercent?: number;
  capturedAt?: ISODateTime;
}

export type ClassSessionStatus = "scheduled" | "cancelled";

export interface ClassRosterEntry {
  memberId: UUID;
  name: string;
  bookedAt: string;
  attended: boolean;
}

export interface ClassSession {
  id: UUID;
  branchId: UUID;
  name: string;
  coachUserId?: UUID;
  coachName?: string;
  /** ISO start time; the calendar renders it in the tenant timezone. */
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  imageAssetId?: string;
  imageUrl?: string;
  imageAltText?: string;
  notes?: string;
  status: ClassSessionStatus;
  cancelReason?: string;
  roster: ClassRosterEntry[];
  attendedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClassSessionQuery {
  branchId: UUID;
  /** Inclusive ISO window; defaults to the current week when omitted. */
  from?: string;
  to?: string;
}

export interface UpsertClassSessionInput {
  /** Provide to update; omit to create. The create dialog may pre-generate it
   * so a class image can be uploaded before the first save. */
  sessionId?: UUID;
  branchId: UUID;
  name: string;
  coachUserId?: UUID;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  imageAssetId?: string;
  notes?: string;
}

export interface ClassRosterInput {
  sessionId: UUID;
  memberId: UUID;
}

export interface ClassAttendanceInput extends ClassRosterInput {
  attended: boolean;
}

export interface FacilityTask {
  id: UUID;
  organizationId: UUID;
  branchId: UUID;
  zoneId: UUID;
  zoneName: string;
  kind: FacilityTaskKind;
  severity: FacilityTaskSeverity;
  status: FacilityTaskStatus;
  title: string;
  notes?: string;
  assigneeId?: UUID;
  dueAt?: ISODateTime;
  completedAt?: ISODateTime;
  trafficContext?: TrafficContext;
  suppliesCost?: Money;
  financialPostingStatus: FinancialPostingStatus;
  financialSourceId?: UUID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface UpsertFacilityTaskInput {
  id?: UUID;
  branchId: UUID;
  zoneId: UUID;
  kind: FacilityTaskKind;
  severity: FacilityTaskSeverity;
  status?: FacilityTaskStatus;
  title: string;
  notes?: string;
  assigneeId?: UUID;
  dueAt?: ISODateTime;
  trafficContext?: TrafficContext;
  suppliesCost?: Money;
}

export type EquipmentAssetStatus = "active" | "maintenance" | "retired" | "replaced";

export interface EquipmentAsset {
  id: UUID;
  organizationId: UUID;
  branchId: UUID;
  zoneId?: UUID;
  code: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: ISODate;
  installationDate?: ISODate;
  purchaseCost?: Money;
  warrantyEndDate?: ISODate;
  status: EquipmentAssetStatus;
  expectedServiceIntervalDays?: number;
  expectedUsefulLifeMonths?: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface UpsertEquipmentAssetInput {
  id?: UUID;
  branchId: UUID;
  zoneId?: UUID;
  code: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  purchaseDate?: ISODate;
  installationDate?: ISODate;
  purchaseCost?: Money;
  warrantyEndDate?: ISODate;
  status?: EquipmentAssetStatus;
  expectedServiceIntervalDays?: number;
  expectedUsefulLifeMonths?: number;
}

export type EquipmentIssueSeverity = "low" | "medium" | "high" | "critical";
export type EquipmentIssueStatus = "open" | "in_progress" | "resolved" | "cancelled";

export interface EquipmentIssue {
  id: UUID;
  organizationId: UUID;
  branchId: UUID;
  assetId: UUID;
  title: string;
  description?: string;
  severity: EquipmentIssueSeverity;
  status: EquipmentIssueStatus;
  reportedAt: ISODateTime;
  resolvedAt?: ISODateTime;
  downtimeDays?: number;
  safetyStatus: "unknown" | "safe_to_operate" | "out_of_service";
  createdById: UUID;
}

export interface UpdateEquipmentIssueInput {
  status?: EquipmentIssueStatus;
  safetyStatus?: EquipmentIssue["safetyStatus"];
  downtimeDays?: number;
}

export interface EquipmentWorkOrder {
  id: UUID;
  organizationId: UUID;
  branchId: UUID;
  assetId: UUID;
  issueId?: UUID;
  status: "draft" | "approved" | "in_progress" | "completed" | "cancelled";
  description: string;
  assigneeId?: UUID;
  vendorName?: string;
  partsCost?: Money;
  laborCost?: Money;
  totalCost?: Money;
  replacementEstimate?: Money;
  financialPostingStatus: FinancialPostingStatus;
  financialSourceId?: UUID;
  openedAt: ISODateTime;
  completedAt?: ISODateTime;
  updatedAt: ISODateTime;
}

export interface UpsertEquipmentWorkOrderInput {
  id?: UUID;
  branchId: UUID;
  assetId: UUID;
  issueId?: UUID;
  status?: EquipmentWorkOrder["status"];
  description: string;
  assigneeId?: UUID;
  vendorName?: string;
  partsCost?: Money;
  laborCost?: Money;
  replacementEstimate?: Money;
}

export interface EquipmentRecommendation {
  assetId: UUID;
  decision: "fix" | "replace" | "insufficient_data";
  confidence: "recorded_inputs_only";
  repairCost?: Money;
  replacementEstimate?: Money;
  issueCount: number;
  downtimeDays: number;
  assetAgeMonths?: number;
  expectedUsefulLifeMonths?: number;
  rationale: string[];
}


/**
 * The five launch pillars of the gym operating system. These keys are a
 * product contract, not route names: a route may consume more than one
 * module, and role/branch permissions remain a separate authorization layer.
 */
export type WorkspaceModuleKey =
  | "foundation"
  | "revenue"
  | "operations"
  | "finance"
  | "reporting";

export type WorkspaceModulePlan = "Starter" | "Growth" | "Pro" | "Enterprise";

export interface WorkspaceModuleCatalogEntry {
  key: WorkspaceModuleKey;
  version: number;
  label: string;
  description: string;
  dependencies: WorkspaceModuleKey[];
  required: boolean;
  configurable: boolean;
  availableOn: WorkspaceModulePlan[];
  routePrefixes: string[];
}

export interface OrganizationEntitlements {
  organizationId: UUID;
  catalogVersion: number;
  subscriptionPlan?: WorkspaceModulePlan;
  entitledModules: WorkspaceModuleKey[];
  source: "subscription_plan" | "legacy_default";
  updatedAt?: ISODateTime;
}

export interface WorkspaceModulePreferences {
  organizationId: UUID;
  catalogVersion: number;
  enabledModules: WorkspaceModuleKey[];
  updatedAt?: ISODateTime;
  updatedById?: UUID;
}

export interface WorkspaceModuleStatus extends WorkspaceModuleCatalogEntry {
  entitled: boolean;
  enabled: boolean;
  lockedReason?: "not_entitled" | "dependency_disabled" | "required";
}

export interface WorkspaceAccess {
  catalogVersion: number;
  catalog: WorkspaceModuleCatalogEntry[];
  entitlements: OrganizationEntitlements;
  preferences: WorkspaceModulePreferences;
  modules: WorkspaceModuleStatus[];
}

export interface UpdateWorkspaceModulePreferencesInput {
  enabledModules: WorkspaceModuleKey[];
}

export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  subscriptionPlan?: WorkspaceModulePlan;
  billingInterval?: "monthly" | "annual";
  /** Platform subscription state mirrored by the preview adapter. */
  status: "trial" | "active" | "past_due" | "suspended" | "cancelled";
  subscriptionStartedAt?: ISODateTime;
  trialEndsAt?: ISODateTime;
  currentPeriodEndsAt?: ISODateTime;
  cancelledAt?: ISODateTime;
  subscriptionStatusReason?: string;
  /** Platform lifecycle marker. Archiving is reversible at the data layer and
   * never deletes tenant financial or operational history. */
  archivedAt?: ISODateTime;
  archiveReason?: string;
  updatedAt?: ISODateTime;
  currency: string;
  timezone: string;
  locale: string;
  /** Digits only (for example `962`). Used only when a phone omits `+`/`00`. */
  phoneCountryCallingCode: string;
  defaultLanguage: "en" | "ar";
  taxRatePercent: number; // 0 means tax disabled
  receiptPrefix: string;
  nextReceiptNumber: number;
  receiptFooter: string;
  brand?: BrandKit;
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
    phoneCountryCallingCode?: string;
    brand?: BrandKit;
  };
  branches: Array<{ id: UUID; name: string; code: string }>;
  activeBranchId?: UUID;
  roles: RoleKey[];
  permissions: string[];
  /** Workspace entitlements/preferences are distinct from role permissions. */
  workspace?: WorkspaceAccess;
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
  /** Collectible charge line items used by the payment flow. */
  outstandingCharges?: Charge[];
  lastCheckInAt?: ISODateTime;
  createdAt: ISODateTime;
  photoUrl?: string;
}

export interface MemberDetail extends MemberSummary {
  gender?: "male" | "female";
  dateOfBirth?: ISODate;
  preferredLanguage: PreferredLanguage;
  emergencyContactName?: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  addressLine1?: string;
  city?: string;
  customerProfileId?: string;
  customerProfileSyncedAt?: ISODateTime;
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
  emergencyContactRelationship?: string;
  emergencyContactPhone?: string;
  addressLine1?: string;
  city?: string;
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

/**
 * One front-desk transaction for a brand-new member and their first term.
 * The member and sale are committed together, or neither is committed.
 */
export interface CreateMemberMembershipSaleInput {
  member: CreateMemberInput;
  sale: Omit<CreateMembershipSaleInput, "memberId" | "idempotencyKey">;
  /** Exact matches the operator reviewed and confirmed belong to a different person. */
  confirmedDuplicateMemberIds?: UUID[];
  idempotencyKey: string;
}

export interface CreateMemberMembershipSaleResult {
  member: MemberDetail;
  sale: MembershipSaleResult;
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

/** PT packages may use any positive whole-number session count. */
export type PtPackageSize = number;
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
  /** Immutable commercial terms captured when this order was created. */
  packageNameSnapshot?: string;
  sessionCountSnapshot?: number;
  totalPriceSnapshot?: Money;
  validityDaysSnapshot?: number;
  /** Presentation-only payment context; public IDs stay out of operator copy. */
  memberName?: string;
  packageName?: string;
  paymentReference?: string;
  status: "pending_payment" | "active" | "partially_refunded" | "refunded" | "cancelled";
  entitlementId?: UUID;
  paidAt?: ISODateTime;
  refundedSessions?: number;
  refundedAmount?: Money;
  cancelledAt?: ISODateTime;
  cancellationReason?: string;
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

export interface CancelPtPackageInput {
  reason: string;
  idempotencyKey: string;
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
  progressFacts?: LeadProgressFacts;
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

export interface ScheduleLeadTrialInput {
  preferredDate: ISODate;
  preferredTime: string;
  goal?: string;
}

export interface LeadDetail extends LeadSummary {
  notes?: string;
  activities: TimelineEvent[];
  offers: Offer[];
  trialBooking?: LeadTrialBooking;
}

export interface UpdateLeadContactInput {
  fullName: string;
  phone: string;
  email?: string;
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
  respondedAt?: ISODateTime;
  respondedById?: UUID;
  responseReason?: string;
  /** High-entropy bearer token for the prospect-facing offer page. */
  publicToken?: string;
  createdById: UUID;
  createdAt: ISODateTime;
}

export interface PublicOffer {
  token: string;
  recipientName: string;
  organizationName: string;
  planName: string;
  price: Money;
  expiresAt?: ISODateTime;
  status: "preparing" | "available" | "accepted" | "declined" | "expired";
  respondedAt?: ISODateTime;
  responseReason?: string;
  brand: Pick<BrandKit, "paletteKey" | "primaryColor" | "tokens" | "logoUrl" | "logoAltText">;
}

export type OfferDeliveryChannel = "email" | "whatsapp" | "sms" | "manual";
export type OfferOutcome = "accepted" | "declined";

export type ContactOutcome =
  | "no_answer"
  | "answered_interested"
  | "answered_not_interested"
  | "answered_call_back"
  | "wrong_number"
  | "whatsapp_sent"
  | "whatsapp_opened"
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
  Pick<Lead, "stage" | "expectedValue" | "nextFollowUpAt" | "lostReason">
> & { ownerId?: UUID | "unassigned" };

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

export type LeadMembershipSelection =
  | { mode: "existing"; planId: UUID }
  | {
      mode: "custom";
      name: string;
      price: Money;
      durationDays: number;
      includedPtSessions: number;
    };

/**
 * Completes the simple CRM journey in one atomic operation. A won lead must
 * never exist as a member without the membership that was sold.
 */
export interface CompleteLeadSaleInput extends ConvertLeadInput {
  membership: LeadMembershipSelection;
  startDate: ISODate;
  idempotencyKey: string;
}

export interface CompleteLeadSaleResult {
  member: MemberDetail;
  plan: MembershipPlan;
  membership: Membership;
  charge: Charge;
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
  | "offer_accepted"
  | "offer_declined"
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
  | "lead_contact_updated"
  | "lead_converted"
  | "pt_credit_granted"
  | "pt_package_requested"
  | "pt_package_cancelled"
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

export type TransactionType = "payment" | "refund" | "void" | "retail_sale";
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

export interface TransactionSummaryBase {
  memberName: string;
  memberNumber: string;
  branchName: string;
  /** Guest retail transactions carry a customer snapshot instead of memberId. */
  customer?: RetailSaleCustomer;
}

export type TransactionSummary = (Payment | RetailPayment) & TransactionSummaryBase;

export interface Receipt {
  id: UUID;
  receiptNumber: string;
  paymentId: UUID;
  /** Set for a retail receipt; paymentId remains the receipt source identifier for compatibility. */
  retailSaleId?: UUID;
  issuedAt: ISODateTime;
}

export interface RetailSaleLine {
  productId: UUID;
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
  /** Internal accounting snapshot captured from branch stock at checkout. */
  unitCost?: Money;
}

export interface RetailSaleCustomer {
  kind: "member" | "guest";
  fullName: string;
  phone?: string;
  memberId?: UUID;
  memberNumber?: string;
}

export interface RetailSale {
  id: UUID;
  organizationId: UUID;
  branchId: UUID;
  receiptId: UUID;
  receiptNumber: string;
  customer: RetailSaleCustomer;
  lines: RetailSaleLine[];
  subtotal: Money;
  total: Money;
  status: "completed" | "partially_refunded" | "refunded" | "voided";
  refundedAmount?: Money;
  returnedLines?: Array<{ productId: UUID; quantity: number }>;
  refundReason?: string;
  voidReason?: string;
  voidedAt?: ISODateTime;
  method: Extract<PaymentMethodKey, "cash" | "cliq" | "card">;
  externalReference?: string;
  shiftId?: UUID;
  idempotencyKey: string;
  createdById: UUID;
  createdByName: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Receipt payment projection for a retail sale. It is not a member payment. */
export interface RetailPayment {
  id: UUID;
  organizationId: UUID;
  branchId: UUID;
  type: "retail_sale";
  /** Stable customer snapshot; guests never receive a synthetic memberId. */
  customer: RetailSaleCustomer;
  amount: Money;
  method: Extract<PaymentMethodKey, "cash" | "cliq" | "card">;
  status: "completed" | "partially_refunded" | "refunded" | "voided";
  refundedAmount?: Money;
  refundReason?: string;
  voidReason?: string;
  receiptId: UUID;
  receiptNumber: string;
  collectedById: UUID;
  collectedByName: string;
  shiftId?: UUID;
  externalReference?: string;
  idempotencyKey: string;
  occurredAt: ISODateTime;
}

export interface ReceiptDetail {
  receipt: Receipt;
  /** Convenience projection used by retail checkout responses; legacy callers use receipt.id. */
  receiptId?: UUID;
  organization: { name: string; receiptFooter: string; taxRatePercent: number };
  branch: { name: string; code: string; address: string; phone: string };
  /** Legacy member projection. Retail guest receipts expose customer instead. */
  member?: { fullName: string; memberNumber: string };
  payment: Payment | RetailPayment;
  charge?: Charge;
  retailSale?: RetailSale;
  customer?: RetailSaleCustomer;
  relatedPayments: Payment[]; // refunds/voids linked to this payment
}

export interface RetailCheckoutInput {
  branchId: UUID;
  memberId?: UUID;
  guest?: { fullName: string; phone: string };
  lines: Array<{ productId: UUID; quantity: number }>;
  method: Extract<PaymentMethodKey, "cash" | "cliq" | "card">;
  externalReference?: string;
  idempotencyKey: string;
}

export interface RefundRetailSaleInput {
  lines: Array<{ productId: UUID; quantity: number }>;
  reason: string;
  idempotencyKey: string;
}

export interface VoidRetailSaleInput {
  reason: string;
  idempotencyKey: string;
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
// Management accounting ledger
// ---------------------------------------------------------------------------

export type AccountingAccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type AccountingStatementGroup =
  | "asset_current"
  | "asset_noncurrent"
  | "liability_current"
  | "liability_noncurrent"
  | "equity"
  | "revenue"
  | "cost_of_sales"
  | "operating_expense"
  | "other_income"
  | "other_expense";
export type AccountingCashflowGroup = "operating" | "investing" | "financing" | "non_cash";
export type AccountingNormalBalance = "debit" | "credit";
export type AccountingPeriodStatus = "open" | "closed";
export type AccountingJournalStatus = "posted" | "reversed";
export type AccountingSourceStatus = "pending" | "posted" | "unconfigured" | "excluded" | "failed" | "reversed";
export type AccountingSourceType =
  | "payment"
  | "refund"
  | "void"
  | "membership_sale"
  | "membership_renewal"
  | "membership_revenue_recognition"
  | "purchase_order_receipt"
  | "stock_movement"
  | "facility_supplies"
  | "equipment_acquisition"
  | "equipment_depreciation"
  | "equipment_repair";

export interface AccountingAccount {
  id: UUID;
  organizationId: UUID;
  code: string;
  name: string;
  nameAr?: string;
  accountType: AccountingAccountType;
  statementGroup: AccountingStatementGroup;
  cashflowGroup: AccountingCashflowGroup;
  normalBalance: AccountingNormalBalance;
  active: boolean;
  isSystem: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface AccountingPeriod {
  id: UUID;
  organizationId: UUID;
  periodStart: ISODate;
  periodEnd: ISODate;
  status: AccountingPeriodStatus;
  closedAt?: ISODateTime;
  closedById?: UUID;
  closeReason?: string;
  reopenedAt?: ISODateTime;
  reopenedById?: UUID;
  reopenReason?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface AccountingJournalLine {
  id: UUID;
  journalEntryId: UUID;
  branchId?: UUID;
  accountId: UUID;
  accountCode: string;
  accountName: string;
  debit: Money;
  credit: Money;
  description?: string;
  statementGroup: AccountingStatementGroup;
  cashflowGroup: AccountingCashflowGroup;
}

export interface AccountingJournalEntrySummary {
  id: UUID;
  organizationId: UUID;
  branchId?: UUID;
  scope: "branch" | "consolidated";
  currency: string;
  postingDate: ISODate;
  periodId?: UUID;
  status: AccountingJournalStatus;
  memo: string;
  sourceType?: AccountingSourceType;
  sourceId?: UUID;
  policyCode?: string;
  policyVersion?: number;
  totalDebit: Money;
  totalCredit: Money;
  lineCount: number;
  createdAt: ISODateTime;
  postedAt: ISODateTime;
}

export interface AccountingJournalEntryDetail extends AccountingJournalEntrySummary {
  reason?: string;
  idempotencyKey: string;
  reversalOfEntryId?: UUID;
  reversedByEntryId?: UUID;
  createdById: UUID;
  lines: AccountingJournalLine[];
}

export interface AccountingTrialBalanceRow {
  accountId: UUID;
  accountCode: string;
  accountName: string;
  accountType: AccountingAccountType;
  statementGroup: AccountingStatementGroup;
  debit: Money;
  credit: Money;
  balance: Money;
}

export interface AccountingTrialBalance {
  organizationId: UUID;
  branchId?: UUID;
  periodId?: UUID;
  currency: string;
  rows: AccountingTrialBalanceRow[];
  totalDebit: Money;
  totalCredit: Money;
}

export interface AccountingSourcePosting {
  id: UUID;
  organizationId: UUID;
  sourceType: AccountingSourceType;
  sourceId: UUID;
  branchId?: UUID;
  status: AccountingSourceStatus;
  amount?: Money;
  currency: string;
  policyCode?: string;
  policyVersion?: number;
  journalEntryId?: UUID;
  idempotencyKey?: string;
  reason?: string;
  details?: Record<string, unknown>;
  projectionFingerprint?: string;
  occurredAt: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface AccountingJournalQuery extends ListQuery {
  branchId?: UUID;
  periodId?: UUID;
  status?: AccountingJournalStatus;
  from?: ISODate;
  to?: ISODate;
}

export interface AccountingSourcePostingQuery extends ListQuery {
  branchId?: UUID;
  sourceType?: AccountingSourceType;
  status?: AccountingSourceStatus;
}

export interface RefreshAccountingSourceQueueInput {
  branchId?: UUID;
  sourceTypes?: AccountingSourceType[];
  /** Optional report window. Omitted means all authoritative source dates. */
  fromDate?: ISODate;
  toDate?: ISODate;
}

export interface RefreshAccountingSourceQueueResult {
  organizationId: UUID;
  branchId?: UUID;
  scanned: number;
  created: number;
  updated: number;
  skippedPosted: number;
  pending: number;
  unconfigured: number;
  excluded: number;
  /** Whether this refresh completely covers its requested scope. */
  queueCoverage?: "proven" | "refresh_required";
  scannedFromDate?: ISODate;
  scannedToDate?: ISODate;
  items: AccountingSourcePosting[];
}

export interface PostManualJournalInput {
  branchId?: UUID;
  scope?: "branch" | "consolidated";
  postingDate?: ISODate;
  memo: string;
  reason: string;
  idempotencyKey: string;
  lines: Array<{ accountId: UUID; debit: Money; credit: Money; description?: string }>;
}

export interface PostAccountingSourceInput {
  sourceType: AccountingSourceType;
  sourceId: UUID;
  idempotencyKey: string;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Management reporting projections
// ---------------------------------------------------------------------------

export interface ManagementReportInput {
  fromDate: ISODate;
  toDate: ISODate;
  branchId?: UUID;
}

export type ManagementMetricStatus = "available" | "not_available" | "not_configured";
export type ManagementQueueCoverage = "proven" | "refresh_required" | "unavailable";
export type ManagementReconciliationStatus = "proven" | "unproven" | "not_available";

export interface ManagementReportPolicyVersion {
  code: string;
  version: number;
}

export interface ManagementReportCompleteness {
  organizationId: UUID;
  branchId?: UUID;
  fromDate: ISODate;
  toDate: ISODate;
  timezone: string;
  currency: string;
  generatedAt: ISODateTime;
  policyVersions: ManagementReportPolicyVersion[];
  sourcePostingCounts: Record<AccountingSourceStatus, number>;
  queueCoverage: ManagementQueueCoverage;
  lastQueueProjectionAt?: ISODateTime;
  warnings: string[];
  disclaimer: string;
}

export interface ManagementStatementLine {
  accountId: UUID;
  accountCode: string;
  accountName: string;
  amount: Money;
  entryIds: UUID[];
}

export interface ManagementStatementSection {
  lines: ManagementStatementLine[];
  total: Money;
}

export interface IncomeStatement extends ManagementReportCompleteness {
  revenue: ManagementStatementSection;
  costOfSales: ManagementStatementSection;
  operatingExpenses: ManagementStatementSection;
  otherIncome: ManagementStatementSection;
  otherExpenses: ManagementStatementSection;
  totalRevenue: Money;
  totalCosts: Money;
  netIncome: Money;
  membershipRevenueRecognition: ManagementMetricStatus;
}

export interface BalanceSheetSections {
  current: ManagementStatementSection;
  noncurrent: ManagementStatementSection;
}

export interface BalanceSheet extends ManagementReportCompleteness {
  asOfDate: ISODate;
  assets: BalanceSheetSections;
  liabilities: BalanceSheetSections;
  equity: ManagementStatementSection;
  currentEarnings: Money;
  totalAssets: Money;
  totalLiabilities: Money;
  totalEquity: Money;
  totalLiabilitiesAndEquity: Money;
  difference: Money;
  balanced: boolean;
  depreciationCoverage?: ManagementMetricStatus;
}

export type ManagementCashflowCategory = "operating" | "investing" | "financing";

export interface CashflowSection {
  category: ManagementCashflowCategory;
  lines: ManagementStatementLine[];
  netChange: Money;
}

export interface CashflowReconciliation {
  status: ManagementReconciliationStatus;
  /** Closing cash implied by opening cash plus classified in-period movement. */
  expectedClosingCash: Money;
  /** Independent cash-account/trial-balance position through the as-of date. */
  asOfCash: Money;
  /** expectedClosingCash - asOfCash; zero is arithmetic agreement only. */
  difference: Money;
  note?: string;
}

export interface CashflowStatement extends ManagementReportCompleteness {
  openingCash: Money;
  operating: CashflowSection;
  investing: CashflowSection;
  financing: CashflowSection;
  netChange: Money;
  closingCash: Money;
  reconciliationDifference: Money;
  reconciliationStatus: ManagementReconciliationStatus;
  reconciliation: CashflowReconciliation;
  balanced: boolean;
  classificationPolicy: { code: string; version: number; description: string };
}

export interface ManagementAnalysisMetric {
  key: string;
  label: string;
  status: ManagementMetricStatus;
  value?: Money | number;
  unit?: "money" | "count" | "days";
  sourceCount: number;
  drilldownIds: UUID[];
  note?: string;
}

export interface GeneralManagerAnalysis extends ManagementReportCompleteness {
  metrics: ManagementAnalysisMetric[];
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
  | "operations"
  | "accounting"
  | "users"
  | "settings";

export interface AuditEvent {
  id: UUID;
  organizationId: UUID;
  branchId?: UUID;
  /** Optional second branch for cross-branch operational events. */
  destinationBranchId?: UUID;
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

export type TodayQueueKind =
  | "follow_up"
  | "renewal"
  | "outstanding_balance"
  | "access_denial"
  | "approval"
  | "cash_variance"
  | "facility_task";

export type TodayQueuePriority = "urgent" | "high" | "normal";

export interface TodayQueueAction {
  kind: "navigate" | "complete_task";
  label: string;
  taskId?: UUID;
}

/**
 * A role-safe unit of work for the dashboard. The backend chooses what the
 * actor may see and do; the client only renders the supplied action.
 */
export interface TodayQueueItem {
  id: string;
  kind: TodayQueueKind;
  priority: TodayQueuePriority;
  title: string;
  detail: string;
  href: string;
  action: TodayQueueAction;
  subjectName?: string;
  branchName?: string;
  dueAt?: ISODateTime;
  occurredAt?: ISODateTime;
  overdue?: boolean;
  amount?: Money;
}

export interface TodayQueueData {
  generatedAt: ISODateTime;
  items: TodayQueueItem[];
  totalItems: number;
  urgentItems: number;
  highPriorityItems: number;
  kindCounts: Partial<Record<TodayQueueKind, number>>;
  overdueItems: number;
  overdueKindCounts: Partial<Record<TodayQueueKind, number>>;
}

export interface DashboardData {
  kpis: DashboardKpis;
  revenueSeries: RevenuePoint[]; // last 30 days
  branchRevenue: BranchRevenue[];
  funnel: FunnelStage[];
  leaderboard: SalespersonStat[];
  alerts: DashboardAlert[];
  todayQueue: TodayQueueData;
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
  /** Server-owned permission catalogue version, absent on legacy rows. */
  catalogVersion?: number;
}

export interface OrganizationSettings {
  organization: Organization;
  brand: BrandKit;
  branches: Branch[];
  paymentMethods: PaymentMethod[];
  roles: RoleDefinition[];
  notifications: NotificationSettings;
  operationalPolicies: OperationalPolicies;
  workspace?: WorkspaceAccess;
}

export type MediaAssetOwnerType = "gym_logo" | "gym_cover" | "gym_gallery" | "trainer_photo" | "member_photo" | "class_image";

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
  /** True once any version has been published: later changes are saved as
   * drafts and sent to RIVET support for review instead of self-publishing. */
  publishLocked: boolean;
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
  /** Tenant-local window in which a member may request any preferred time. */
  enabled: boolean;
  opensAt: string;
  closesAt: string;
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
  /**
   * The scheduled renewal journey is opt-in. Missing legacy values are false
   * so a backend deploy cannot silently create member timelines or staff tasks.
   */
  renewalRecoveryEnabled?: boolean;
  automationDeliveryMode: "sandbox" | "live";
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export type UpdateOrganizationSettingsInput = Partial<{
  name: string;
  timezone: string;
  locale: string;
  phoneCountryCallingCode: string;
  defaultLanguage: "en" | "ar";
  taxRatePercent: number;
  receiptPrefix: string;
  receiptFooter: string;
}>;

export interface UpdateBrandKitInput {
  paletteKey: BrandPaletteKey;
  primaryColor?: string;
  logoAssetId?: UUID | null;
}

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
