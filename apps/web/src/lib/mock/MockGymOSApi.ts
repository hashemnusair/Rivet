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
  PlatformBillingInvoice,
  PlatformGymDetail,
  PlatformGymActivity,
  PlatformData,
  PlatformGymApplication,
  PlatformSnapshot,
  PlatformSupportCase,
  PlatformSaasPlan,
  EntryPass,
  SubmitGymApplicationInput,
  SubmitGymApplicationResult,
  ReviewGymApplicationInput,
  SaveGymApplicationReviewNoteInput,
  ProvisionGymInput,
  GymProvisioningResult,
  ArchivePlatformGymInput,
  UpdatePlatformGymInput,
  UpdatePlatformPlanInput,
  CreatePlatformInvoiceInput,
  RecordPlatformInvoicePaymentInput,
  CreateSupportCaseInput,
  OperationalNotification,
  MemberImportCommitInput,
  MemberImportCommitResult,
  MemberImportPreview,
  MemberImportRow,
  CustomerExperience,
} from "@/lib/api/GymOSApi";
import { DEFAULT_BEHAVIOR } from "@/lib/api/GymOSApi";
import { ApiError, ERR } from "@/lib/api/errors";
import { discountNeedsApproval, effectiveRolePermissions, PERMISSION_CATALOG_VERSION, PERMISSIONS, type Permission } from "@/lib/domain/permissions";
import { BRAND_PALETTE_PRESETS, deriveBrandTokens, isBrandPaletteKey, normalizeBrandHex } from "@/lib/domain/brand";
import {
  buildWorkspaceAccess,
  defaultWorkspacePreferences,
  allWorkspaceModuleKeys,
  entitledModulesForPlanSelection,
  validateWorkspaceModuleSelection,
  WORKSPACE_MODULE_CATALOG_VERSION,
} from "@/lib/domain/workspace-modules";
import { ptAvailableCredits, ptCancellationResult, ptPackageLadderIsValid, selectPtEntitlement } from "@/lib/domain/personal-training";
import { deriveMembershipStatus, evaluateCheckIn, isMembershipUsable } from "@/lib/domain/status";
import { chargeIsCollectible, collectibleOutstandingMinor } from "@/lib/domain/charges";
import type * as T from "@/lib/domain/types";
import { addDays, daysFromToday, diffDays, nowISO, todayISODate } from "@/lib/utils/dates";
import { exponentFor, money, zeroMoney } from "@/lib/utils/money";
import { buildSeed } from "./seed";
import { buildPlatformOverview } from "../../../convex/platformOverview";
import { manualJournalRequestFingerprint, reversalRequestFingerprint } from "../../../convex/accountingLedger";
import {
  CUSTOMER_PERSONAS,
  INITIAL_CUSTOMER_MEMBERSHIPS,
  INITIAL_TRIAL_BOOKINGS,
  MARKETPLACE_GYMS,
} from "@/lib/public/experience-data";
import type { CustomerMarketingPreference, CustomerPersona, CustomerProfileInput, MarketplaceGym, TrialBooking } from "@/lib/public/experience-data";
import { publicMarketplaceGyms } from "@/lib/public/marketplace-filters";
import { isTimeInTrialWindow } from "@/lib/public/trial-schedule";
import {
  currentRole,
  currentUser,
  mockUuid,
  permissionsFor,
  type MemberRecord,
  type MembershipRecord,
  type MockDb,
} from "./store";

const TZ = "Asia/Amman";
const MARKETING_WORDING_VERSION = "2026-08-default-opt-in-v1";
const MOCK_EQUIPMENT_ASSET_STATUSES: readonly T.EquipmentAssetStatus[] = ["active", "maintenance", "retired", "replaced"];
const MOCK_EQUIPMENT_ISSUE_SEVERITIES: readonly T.EquipmentIssueSeverity[] = ["low", "medium", "high", "critical"];
const MOCK_EQUIPMENT_ISSUE_STATUSES: readonly T.EquipmentIssueStatus[] = ["open", "in_progress", "resolved", "cancelled"];
const MOCK_EQUIPMENT_SAFETY_STATUSES: readonly T.EquipmentIssue["safetyStatus"][] = ["unknown", "safe_to_operate", "out_of_service"];
const MOCK_EQUIPMENT_WORK_ORDER_STATUSES: readonly T.EquipmentWorkOrder["status"][] = ["draft", "approved", "in_progress", "completed", "cancelled"];
type MockOperationalNotification = OperationalNotification & { recipientId: string };

function exactCostTotal(unitCost: T.Money | undefined, quantity: number): T.Money | undefined {
  if (!unitCost || !Number.isSafeInteger(unitCost.amount) || unitCost.amount < 0 || !Number.isSafeInteger(quantity) || quantity < 0) return undefined;
  const amount = unitCost.amount * quantity;
  return Number.isSafeInteger(amount) ? { amount, currency: unitCost.currency } : undefined;
}

function allocateExactCost(totalMinor: number | undefined, quantityOnHand: number, quantity: number): number | undefined {
  if (typeof totalMinor !== "number" || !Number.isSafeInteger(totalMinor) || totalMinor < 0 || !Number.isSafeInteger(quantityOnHand) || quantityOnHand <= 0 || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > quantityOnHand) return undefined;
  const exactTotal = totalMinor as number;
  if (quantity === quantityOnHand) return exactTotal;
  const numerator = exactTotal * quantity;
  return Number.isSafeInteger(numerator) ? Math.floor(numerator / quantityOnHand) : undefined;
}

/**
 * Retail refunds are payment facts, but a guest has no member id. Keep the
 * customer and sale links on the mock payment projection so receipt and
 * transaction views can represent the same shape as Convex without inventing
 * a member record. The public Payment type remains the legacy membership
 * payment contract, so callers only see these extra fields when the payment
 * is a retail adjustment.
 */
type MockRetailAdjustmentPayment = T.Payment & {
  customer: T.RetailSaleCustomer;
  retailSaleId: T.UUID;
};

function managementLocalDate(value: string | number, timezone: string): string {
  return todayISODate(timezone, new Date(value));
}

/**
 * Mirror of the Convex tenant-date anchoring: a monthly or date-only
 * accounting fact's timestamp must land on the same tenant-local calendar
 * date it names, in every timezone.
 */
function tenantDateIso(date: string, timezone: string): string {
  let timestamp = Date.parse(`${date}T12:00:00.000Z`);
  for (let step = 0; step < 15 && managementLocalDate(timestamp, timezone) > date; step += 1) timestamp -= 3_600_000;
  for (let step = 0; step < 15 && managementLocalDate(timestamp, timezone) < date; step += 1) timestamp += 3_600_000;
  return new Date(timestamp).toISOString();
}

function publicApplicationKey(email: string, gymName: string): string {
  const normalizedGym = gymName.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "gym";
  return `${email.trim().toLowerCase()}::${normalizedGym}`;
}

function publicRequestSignature(value: unknown): string {
  return JSON.stringify(value);
}

function enforceMockRateLimit(
  limits: Map<string, { windowStartedAt: number; requestCount: number }>,
  key: string,
  maxRequests: number,
  windowMs: number,
): void {
  const now = Date.now();
  const existing = limits.get(key);
  if (existing && now - existing.windowStartedAt < windowMs) {
    if (existing.requestCount >= maxRequests) throw ApiError.of(ERR.RATE_LIMITED, "Too many requests. Please wait and try again.");
    existing.requestCount += 1;
    return;
  }
  limits.set(key, { windowStartedAt: now, requestCount: 1 });
}

function ledgerDate(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? new Date(`${candidate}T00:00:00.000Z`) : undefined;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate) {
    throw ApiError.of(ERR.VALIDATION, "Posting date must use a real YYYY-MM-DD calendar date.");
  }
  return candidate;
}

const MOCK_ACCOUNT_DEFINITIONS: Array<Pick<T.AccountingAccount, "code" | "name" | "accountType" | "statementGroup" | "cashflowGroup" | "normalBalance">> = [
  { code: "1100", name: "Cash on hand", accountType: "asset", statementGroup: "asset_current", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "1110", name: "Card clearing", accountType: "asset", statementGroup: "asset_current", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "1120", name: "Bank transfer clearing", accountType: "asset", statementGroup: "asset_current", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "1200", name: "Accounts receivable", accountType: "asset", statementGroup: "asset_current", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "1300", name: "Inventory", accountType: "asset", statementGroup: "asset_current", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "1500", name: "Gym equipment", accountType: "asset", statementGroup: "asset_noncurrent", cashflowGroup: "investing", normalBalance: "debit" },
  { code: "1550", name: "Accumulated depreciation — equipment", accountType: "asset", statementGroup: "asset_noncurrent", cashflowGroup: "non_cash", normalBalance: "credit" },
  { code: "2100", name: "Supplier payables", accountType: "liability", statementGroup: "liability_current", cashflowGroup: "operating", normalBalance: "credit" },
  { code: "2200", name: "Deferred membership revenue", accountType: "liability", statementGroup: "liability_current", cashflowGroup: "operating", normalBalance: "credit" },
  { code: "3000", name: "Owner equity", accountType: "equity", statementGroup: "equity", cashflowGroup: "financing", normalBalance: "credit" },
  { code: "4100", name: "Membership revenue", accountType: "revenue", statementGroup: "revenue", cashflowGroup: "operating", normalBalance: "credit" },
  { code: "4200", name: "Retail sales revenue", accountType: "revenue", statementGroup: "revenue", cashflowGroup: "operating", normalBalance: "credit" },
  { code: "5100", name: "Cost of supplies and inventory", accountType: "expense", statementGroup: "cost_of_sales", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "5200", name: "Repairs and maintenance", accountType: "expense", statementGroup: "operating_expense", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "5300", name: "Facility supplies", accountType: "expense", statementGroup: "operating_expense", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "5600", name: "Depreciation expense", accountType: "expense", statementGroup: "operating_expense", cashflowGroup: "non_cash", normalBalance: "debit" },
];

function mockAccount(orgId: string, definition: (typeof MOCK_ACCOUNT_DEFINITIONS)[number]): T.AccountingAccount {
  const timestamp = "2026-08-19T00:00:00.000Z";
  return { id: `acct-${definition.code}`, organizationId: orgId, ...definition, active: true, isSystem: true, createdAt: timestamp, updatedAt: timestamp };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

type MockAccountingSourceDecisionStatus = Extract<T.AccountingSourceStatus, "unconfigured" | "excluded">;
interface MockAccountingSourceAttempt {
  id: T.UUID;
  sourceType: T.AccountingSourceType;
  sourceId: T.UUID;
  sourcePostingId?: T.UUID;
  branchId?: T.UUID;
  idempotencyKey: string;
  requestFingerprint: string;
  status: MockAccountingSourceDecisionStatus;
  amount?: T.Money;
  currency: string;
  policyCode?: string;
  policyVersion?: number;
  reason?: string;
  details?: Record<string, unknown>;
  occurredAt: T.ISODateTime;
  createdAt: T.ISODateTime;
  updatedAt: T.ISODateTime;
}

function accountingSourceKey(sourceType: T.AccountingSourceType, sourceId: T.UUID): string {
  return `${sourceType}:${sourceId}`;
}

function accountingSourceAttemptKey(sourceType: T.AccountingSourceType, sourceId: T.UUID, idempotencyKey: string): string {
  return `${accountingSourceKey(sourceType, sourceId)}:${idempotencyKey}`;
}

function accountingSourceRequestFingerprint(input: { sourceType: T.AccountingSourceType; sourceId: T.UUID; idempotencyKey: string; reason?: string }): string {
  return stableJson({ sourceType: input.sourceType, sourceId: input.sourceId, idempotencyKey: input.idempotencyKey, reason: input.reason?.trim() ?? "" });
}

function accountingPolicyVersion(policyCode?: string): number | undefined {
  const match = policyCode?.match(/\.v(\d+)$/);
  if (!match?.[1]) return undefined;
  const version = Number(match[1]);
  return Number.isSafeInteger(version) && version > 0 ? version : undefined;
}

type MockMonthlyAllocation = { month: string; serviceStart: string; serviceEnd: string; days: number; amount: number };
const MOCK_MAX_MEMBERSHIP_SERVICE_MONTHS = 120;
const MOCK_MAX_EQUIPMENT_USEFUL_LIFE_MONTHS = 600;

function validAccountingDate(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

function accountingMonthEnd(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, monthNumber!, 0)).toISOString().slice(0, 10);
}

function accountingAddMonths(month: string, count: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, monthNumber! - 1 + count, 1)).toISOString().slice(0, 7);
}

function mockMembershipAllocations(amount: number, start: string | undefined, end: string | undefined, options?: { cancellationDate?: string; freezes?: readonly T.FreezePeriod[] }): MockMonthlyAllocation[] {
  if (!start || !end || start > end || !Number.isSafeInteger(amount) || amount < 0) return [];
  const monthSpan = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7)) + 1;
  if (monthSpan > MOCK_MAX_MEMBERSHIP_SERVICE_MONTHS) return [];
  const excluded = new Set<string>();
  for (const freeze of options?.freezes ?? []) {
    if (freeze.status !== "active" && freeze.status !== "completed") continue;
    let date = freeze.startDate < start ? start : freeze.startDate;
    const freezeEnd = freeze.endDate > end ? end : freeze.endDate;
    while (date <= freezeEnd) {
      excluded.add(date);
      date = new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
    }
  }
  const serviceDates: string[] = [];
  for (let date = start; date <= end; date = new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10)) if (!excluded.has(date)) serviceDates.push(date);
  if (serviceDates.length === 0) return [];
  const quotient = Math.floor(amount / serviceDates.length);
  const residual = amount - quotient * serviceDates.length;
  const earnedThrough = options?.cancellationDate && options.cancellationDate < end ? options.cancellationDate : end;
  const rows = new Map<string, MockMonthlyAllocation>();
  for (let index = 0; index < serviceDates.length; index += 1) {
    const date = serviceDates[index]!;
    if (date > earnedThrough) continue;
    const dailyAmount = quotient + (index < residual ? 1 : 0);
    if (dailyAmount <= 0) continue;
    const month = date.slice(0, 7);
    const row = rows.get(month) ?? { month, serviceStart: date, serviceEnd: date, days: 0, amount: 0 };
    row.serviceEnd = date;
    row.days += 1;
    row.amount += dailyAmount;
    rows.set(month, row);
  }
  return [...rows.values()].filter((row) => row.amount > 0);
}

function mockMonthlyDepreciationAmount(cost: number | undefined, usefulLife: number | undefined, monthIndex: number): number | undefined {
  if (cost === undefined || usefulLife === undefined || !Number.isSafeInteger(cost) || cost <= 0 || !Number.isSafeInteger(usefulLife) || usefulLife < 1 || usefulLife > MOCK_MAX_EQUIPMENT_USEFUL_LIFE_MONTHS || monthIndex < 0 || monthIndex >= usefulLife) return undefined;
  const base = Math.floor(cost / usefulLife);
  return base + (monthIndex < cost - base * usefulLife ? 1 : 0);
}

type MockSourceCandidateDateRange = { fromDate?: string; toDate?: string };

function mockTimestampInDateRange(value: string | number, timezone: string, range?: MockSourceCandidateDateRange): boolean {
  if (!range?.fromDate && !range?.toDate) return true;
  const date = managementLocalDate(value, timezone);
  return (!range.fromDate || date >= range.fromDate) && (!range.toDate || date <= range.toDate);
}

function mockMonthInDateRange(month: string, range?: MockSourceCandidateDateRange): boolean {
  if (!range?.fromDate && !range?.toDate) return true;
  const monthStart = `${month}-01`;
  const monthEnd = accountingMonthEnd(month);
  return (!range.toDate || monthStart <= range.toDate) && (!range.fromDate || monthEnd >= range.fromDate);
}

function mockServiceDateRangeThroughToday(range?: MockSourceCandidateDateRange): MockSourceCandidateDateRange {
  const today = managementLocalDate(Date.now(), TZ);
  return { fromDate: range?.fromDate, toDate: !range?.toDate || range.toDate > today ? today : range.toDate };
}

function mockSourceProjectionFingerprint(fact: { sourceType: T.AccountingSourceType; sourceId: T.UUID; branchId?: T.UUID; amount?: number; currency?: string; occurredAt: string; debitCode?: string; creditCode?: string; policyCode?: string; status?: T.AccountingSourceStatus; reason?: string; details?: Record<string, unknown> }, status: T.AccountingSourceStatus): string {
  return stableJson({ sourceType: fact.sourceType, sourceId: fact.sourceId, branchId: fact.branchId, amount: fact.amount, currency: fact.currency, occurredAt: fact.occurredAt, debitCode: fact.debitCode, creditCode: fact.creditCode, policyCode: fact.policyCode, status, reason: fact.reason, details: fact.details ?? null });
}

function mockSourceTypesDigest(sourceTypes: readonly T.AccountingSourceType[]): string {
  return [...new Set(sourceTypes)].sort().join(",");
}

const MOCK_ACCOUNTING_SOURCE_TYPES: readonly T.AccountingSourceType[] = ["payment", "refund", "void", "membership_sale", "membership_renewal", "membership_revenue_recognition", "purchase_order_receipt", "stock_movement", "facility_supplies", "equipment_acquisition", "equipment_depreciation", "equipment_repair"];

type MockAccountingFact = {
  amount?: number;
  currency?: string;
  branchId?: T.UUID;
  occurredAt: string;
  debitCode?: string;
  creditCode?: string;
  policyCode?: string;
  reason?: string;
  status?: T.AccountingSourceStatus;
  details?: Record<string, unknown>;
};

/**
 * Pending source rows are historical decisions, not disposable cache rows.
 * If a source was queued under a prior policy version, refresh/post must keep
 * that version until an operator explicitly creates a new source fact. This
 * mirrors Convex's code-owned policy preservation and prevents a queue
 * refresh from silently changing the accounting meaning of an old item.
 */
function preserveMockSourcePolicy<TFact extends { policyCode?: string; debitCode?: string; creditCode?: string }>(fact: TFact, existing?: { status: T.AccountingSourceStatus; policyCode?: string }): TFact {
  if (!existing || existing.status === "posted" || existing.status === "reversed" || !existing.policyCode || existing.policyCode === fact.policyCode) return fact;
  const policyCode = existing.policyCode;
  if (/^retail-sale-(cash|card|cliq)\.v1$/.test(policyCode)) return { ...fact, policyCode, creditCode: "4100" };
  if (/^retail-(refund|void)-(cash|card|cliq)\.v1$/.test(policyCode)) return { ...fact, policyCode, debitCode: "1200" };
  // Other policy families have remained stable. Preserve the source's
  // historical code even when the current fact happens to use a newer code.
  return { ...fact, policyCode };
}

function createMockMediaUrl(file: Blob, fallbackId: string): string {
  return typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : `mock-media://${fallbackId}`;
}

function revokeMockMediaUrl(url?: string): void {
  if (url && typeof URL.revokeObjectURL === "function" && url.startsWith("blob:")) URL.revokeObjectURL(url);
}

const MOCK_INVOICES: PlatformBillingInvoice[] = [
  { id: "RV-1048", gymId: "pulse-lab", gym: "Pulse Lab", amount: "JD 149.000", date: "31 Jul 2026", status: "failed" },
  { id: "RV-1047", gymId: "her-house", gym: "Her House Fitness", amount: "JD 249.000", date: "28 Jul 2026", status: "paid" },
  { id: "RV-1046", gymId: "forge-fitness", gym: "Forge Fitness Club", amount: "JD 249.000", date: "18 Jul 2026", status: "paid" },
  { id: "RV-1045", gymId: "district-strength", gym: "District Strength", amount: "JD 0.000", date: "5 Jul 2026", status: "trial" },
  { id: "RV-1044", gymId: "pulse-lab", gym: "Pulse Lab", amount: "JD 149.000", date: "30 Jun 2026", status: "paid" },
];

const MOCK_SUPPORT_CASES: PlatformSupportCase[] = [
  { id: "SUP-218", gymId: "pulse-lab", gym: "Pulse Lab", subject: "Payment retry failed", age: "18m", priority: "urgent", status: "open" },
  { id: "SUP-217", gymId: "forge-fitness", gym: "Forge Fitness", subject: "New staff permission question", age: "1h", priority: "normal", status: "open" },
  { id: "SUP-216", gymId: "district-strength", gym: "District Strength", subject: "Member import formatting", age: "3h", priority: "normal", status: "waiting" },
  { id: "SUP-214", gymId: "her-house", gym: "Her House", subject: "Add a Shmeisani kiosk", age: "1d", priority: "normal", status: "open" },
];

const MOCK_SAAS_PLANS: PlatformSaasPlan[] = [
  { name: "Starter", priceMinor: 79_000, branches: 1, staff: 8, members: 500, tone: "paper", entitledModules: ["foundation", "revenue"] },
  { name: "Growth", priceMinor: 149_000, branches: 3, staff: 25, members: 2_500, tone: "signal", entitledModules: ["foundation", "revenue", "operations"] },
  { name: "Pro", priceMinor: 249_000, branches: 8, staff: 80, members: 10_000, tone: "night", entitledModules: ["foundation", "revenue", "operations", "finance", "reporting"] },
  { name: "Enterprise", priceMinor: 500_000, branches: 25, staff: 250, members: 50_000, tone: "night", entitledModules: ["foundation", "revenue", "operations", "finance", "reporting"] },
];

const INITIAL_GYM_APPLICATIONS: PlatformGymApplication[] = [
  {
    id: "20000000-0000-4a00-8a00-000000000001",
    gymName: "Northline Strength",
    ownerName: "Karim Haddad",
    email: "karim@northline.example",
    contactNumber: "+962 79 555 0144",
    plan: "Growth",
    billingInterval: "monthly",
    status: "pending",
    notificationStatus: "sent",
    reviewNotificationStatus: "not_configured",
    submittedAt: "2026-08-06T08:42:00.000Z",
    updatedAt: "2026-08-06T08:42:00.000Z",
  },
  {
    id: "20000000-0000-4a00-8a00-000000000002",
    gymName: "Mosaic Women’s Fitness",
    ownerName: "Dina Al-Saleh",
    email: "dina@mosaic.example",
    contactNumber: "+962 78 222 0908",
    plan: "Pro",
    billingInterval: "monthly",
    status: "under_review",
    notificationStatus: "sent",
    reviewNotificationStatus: "not_configured",
    submittedAt: "2026-08-05T14:18:00.000Z",
    updatedAt: "2026-08-05T16:05:00.000Z",
    reviewedBy: "Elias RIVET",
    reviewNotes: "Confirm the second branch address before approval.",
  },
];

type PageParams = { page?: number; pageSize?: number; sort?: string; search?: string };

type MockPlatformAuditEvent = PlatformGymActivity & {
  entityType: "platform_gym" | "platform_plan";
  entityPublicId: string;
  entityLabel: string;
  reason: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
};

/**
 * A provisioned application gets its own tenant-shaped projection in the
 * mock. The rest of the demo database still represents the signed-in Forge
 * workspace, so keeping these facts separately prevents a second provisioning
 * run from overwriting the active demo tenant while still exercising the
 * platform/public projection contracts.
 */
type MockProvisionedTenant = {
  organization: T.Organization;
  branch: T.Branch;
  owner: T.StaffUser;
  membershipStatus: "pending" | "accepted";
  clerkInvitationId: string;
  listingId: string;
};

const PUBLIC_SUBSCRIPTION_STATUSES: ReadonlySet<MarketplaceGym["subscriptionStatus"]> = new Set(["active", "trial"]);
const PROVISIONED_MOCK_GYM_ID = "forge-fitness";
const UNPROVISIONED_GYM_REASON = "Organization is not provisioned.";

function organizationStatusForPlatform(status: MarketplaceGym["subscriptionStatus"]): T.Organization["status"] {
  return status === "overdue" ? "past_due" : status;
}

function platformStatusForOrganization(status: T.Organization["status"]): MarketplaceGym["subscriptionStatus"] {
  return status === "past_due" ? "overdue" : status;
}

function addCalendarMonths(timestamp: number, months: number): number {
  const source = new Date(timestamp);
  const day = source.getUTCDate();
  const target = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + months, 1, source.getUTCHours(), source.getUTCMinutes(), source.getUTCSeconds(), source.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.getTime();
}

function addBillingInterval(timestamp: number, interval: "monthly" | "annual"): number {
  return addCalendarMonths(timestamp, interval === "annual" ? 12 : 1);
}

function validSubscriptionTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.trim();
  const datePrefix = normalized.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePrefix)) {
    const dateOnlyTimestamp = Date.parse(`${datePrefix}T00:00:00.000Z`);
    if (!Number.isFinite(dateOnlyTimestamp) || new Date(dateOnlyTimestamp).toISOString().slice(0, 10) !== datePrefix) return undefined;
  }
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function sameCalendarDate(left: number | undefined, right: number | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return new Date(left).toISOString().slice(0, 10) === new Date(right).toISOString().slice(0, 10);
}

function cloneMarketplaceGym(gym: MarketplaceGym): MarketplaceGym {
  return {
    ...gym,
    areas: [...gym.areas],
    amenities: [...gym.amenities],
    branches: gym.branches.map((branch) => ({ ...branch, trialSlots: [...branch.trialSlots], trialSchedule: branch.trialSchedule ? { ...branch.trialSchedule } : undefined })),
  };
}

function safeMockLogoUrl(logo: T.MediaAsset | undefined, organizationId: string): string | undefined {
  if (!logo || logo.organizationId !== organizationId || logo.ownerType !== "gym_logo" || logo.ownerId !== organizationId || logo.visibility !== "public" || logo.status !== "active") return undefined;
  return logo.url;
}

function safeMockGymLogoUrl(gym: MarketplaceGym, organizationId: string): string | undefined {
  return safeMockLogoUrl(gym.logo, organizationId);
}

function initialPlatformGyms(organization: MockDb["organization"]): MarketplaceGym[] {
  return MARKETPLACE_GYMS.map((gym) => {
    const cloned = cloneMarketplaceGym(gym);
    if (cloned.id === PROVISIONED_MOCK_GYM_ID) {
      // The organization is authoritative for lifecycle facts. Keeping the
      // platform projection derived from it prevents the demo directory from
      // drifting back to "Not configured" after a reset.
      return {
        ...cloned,
        billingInterval: organization.billingInterval ?? cloned.billingInterval ?? "monthly",
        subscriptionStartedAt: organization.subscriptionStartedAt,
        currentPeriodEndsAt: organization.currentPeriodEndsAt,
        trialEndsAt: organization.trialEndsAt,
        cancelledAt: organization.cancelledAt,
        subscriptionStatusReason: organization.subscriptionStatusReason,
      };
    }
    return {
      ...cloned,
      subscriptionStatus: "suspended",
      isPublic: false,
      trialEndsAt: undefined,
      subscriptionStartedAt: undefined,
      currentPeriodEndsAt: undefined,
      cancelledAt: undefined,
      subscriptionStatusReason: UNPROVISIONED_GYM_REASON,
    };
  });
}

function paginate<I>(items: I[], q: PageParams): T.Page<I> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page, pageSize, totalItems, totalPages };
}

function parseImportCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    const next = csv[index + 1];
    if (character === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (character === '"') { quoted = !quoted; continue; }
    if (character === "," && !quoted) { row.push(cell.trim()); cell = ""; continue; }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell.trim()); cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
      continue;
    }
    cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function applySort<I>(items: I[], sort: string | undefined, getter: (item: I, key: string) => string | number | undefined): I[] {
  if (!sort) return items;
  const desc = sort.startsWith("-");
  const key = desc ? sort.slice(1) : sort;
  return [...items].sort((a, b) => {
    const va = getter(a, key);
    const vb = getter(b, key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (va < vb) return desc ? 1 : -1;
    if (va > vb) return desc ? -1 : 1;
    return 0;
  });
}

export class MockGymOSApi implements GymOSApi {
  private db: MockDb;
  private behavior: MockBehavior = { ...DEFAULT_BEHAVIOR };
  private gymApplications: PlatformGymApplication[];
  private platformGyms: MarketplaceGym[];
  private archivedGymIds = new Set<string>();
  private provisionedMockGymIds = new Set<string>([PROVISIONED_MOCK_GYM_ID]);
  private provisionedTenants = new Map<string, MockProvisionedTenant>();
  private platformAuditEvents: MockPlatformAuditEvent[] = [];
  private readonly marketplaceSubscribers = new Map<(gyms: MarketplaceGym[]) => void, ((error: unknown) => void) | undefined>();
  private readonly publicPlanSubscribers = new Map<(plans: PlatformSaasPlan[]) => void, ((error: unknown) => void) | undefined>();
  private readonly platformSnapshotSubscribers = new Map<(snapshot: PlatformSnapshot) => void, ((error: unknown) => void) | undefined>();
  private readonly platformGymDetailSubscribers = new Map<(detail: PlatformGymDetail) => void, { gymId: string; onError?: (error: unknown) => void }>();
  private readonly workspaceAccessSubscribers = new Map<(access: T.WorkspaceAccess) => void, ((error: unknown) => void) | undefined>();
  private platformPlans: PlatformSaasPlan[];
  private platformInvoices: PlatformBillingInvoice[];
  private platformSupportCases: PlatformSupportCase[];
  private readonly provisioningInFlight = new Set<string>();
  private operationalNotifications: MockOperationalNotification[] = [];
  private trialBookings: TrialBooking[];
  private customerPreferenceHistory = new Map<string, CustomerMarketingPreference[]>();
  private registeredCustomers = new Map<string, CustomerPersona>();
  private memberImports = new Map<string, MemberImportPreview>();
  private memberImportIdempotency = new Map<string, { signature: string; result: MemberImportCommitResult }>();
  private publicApplicationIdempotency = new Map<string, { signature: string; result: SubmitGymApplicationResult }>();
  private publicApplicationRateLimits = new Map<string, { windowStartedAt: number; requestCount: number }>();
  private trialIdempotency = new Map<string, { signature: string; result: TrialBooking }>();
  private trialRateLimits = new Map<string, { windowStartedAt: number; requestCount: number }>();
  private membershipSaleIdempotency = new Map<string, { signature: string; result: T.MembershipSaleResult }>();
  private membershipTransferIdempotency = new Map<string, { signature: string; result: T.MembershipDetail }>();
  private ptCancellationIdempotency = new Map<string, { signature: string; result: T.PtPackageOrder }>();
  private activeCustomerId = CUSTOMER_PERSONAS[0]?.id ?? "customer-lina";
  private ptTrainers: T.PtTrainerProfile[] = [];
  private ptPackages: T.PtPackage[] = [];
  private ptRules: T.PtAvailabilityRule[] = [];
  private ptExceptions: T.PtAvailabilityException[] = [];
  private ptEntitlements: T.PtEntitlement[] = [];
  private ptBookings: T.PtBooking[] = [];
  private ptOrders: T.PtPackageOrder[] = [];
  private operationsIdempotency = new Map<string, { signature: string; result: unknown; expiresAt?: number }>();
  private accountingAccounts: T.AccountingAccount[];
  private accountingPeriods: T.AccountingPeriod[] = [];
  private accountingEntries: T.AccountingJournalEntryDetail[] = [];
  private accountingSources: T.AccountingSourcePosting[] = [];
  private accountingSourceAttempts = new Map<string, MockAccountingSourceAttempt>();
  private accountingSourceQueueRuns: Array<{ branchId?: T.UUID; fromDate?: T.ISODate; toDate?: T.ISODate; sourceTypes: T.AccountingSourceType[]; candidateDigest: string; candidateCount: number; scannedAt: T.ISODateTime }> = [];
  private accountingEntryFingerprints = new Map<string, string>();
  private gymPublicProfile!: T.GymPublicProfile;
  private gymProfileVersions: T.GymProfileVersion[] = [];
  private mediaAssets = new Map<string, T.MediaAsset>();
  /** Internal linkage kept out of the public trainer DTO, matching Convex's photoAssetId field. */
  private ptTrainerPhotoAssetIds = new Map<string, string>();
  private operationalEmailKinds: string[] = [];
  private operationalEmailUpdate?: Pick<T.OperationalEmailActivationSettings, "ownerConfirmed" | "ownerConfirmedAt" | "ownerConfirmedBy" | "updatedAt" | "updatedBy" | "reason">;

  constructor(db?: MockDb) {
    this.db = db ?? buildSeed();
    this.accountingAccounts = MOCK_ACCOUNT_DEFINITIONS.map((definition) => mockAccount(this.db.organization.id, definition));
    this.gymApplications = INITIAL_GYM_APPLICATIONS.map((application) => ({ ...application }));
    this.platformGyms = initialPlatformGyms(this.db.organization);
    this.platformPlans = MOCK_SAAS_PLANS.map((plan) => ({ ...plan }));
    this.platformInvoices = MOCK_INVOICES.map((invoice) => ({ ...invoice }));
    this.platformSupportCases = MOCK_SUPPORT_CASES.map((supportCase) => ({ ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) }));
    this.trialBookings = INITIAL_TRIAL_BOOKINGS.map((booking) => ({ ...booking }));
    const trainer = this.db.users.find((user) => user.role === "trainer" && user.status === "active");
    if (trainer) {
      const createdAt = nowISO();
      const profileId = mockUuid();
      this.ptTrainers = [{ id: profileId, organizationId: this.db.organization.id, userId: trainer.id, displayName: trainer.name, specialties: ["Strength", "Mobility"], languages: ["en", "ar"], branchIds: trainer.branchScope === "all" ? this.db.branches.map((branch) => branch.id) : trainer.branchIds, status: "published", createdAt, updatedAt: createdAt }];
      this.ptRules = this.ptTrainers[0]!.branchIds.flatMap((branchId) => (["sun", "mon", "tue", "wed", "thu"] as T.WeekdayKey[]).map((weekday) => ({ id: mockUuid(), trainerProfileId: profileId, branchId, weekday, startMinute: 8 * 60, endMinute: 17 * 60, active: true })));
    }
    this.ptPackages = ([
      [12, 240_000, 90],
      [20, 300_000, 120],
      [30, 400_000, 180],
    ] as const).map(([sessionCount, amount, validityDays]) => ({ id: mockUuid(), organizationId: this.db.organization.id, name: `${sessionCount} PT sessions`, sessionCount, totalPrice: money(amount), validityDays, branchAccess: "all", branchIds: [], status: "active", createdAt: nowISO(), updatedAt: nowISO() }));
    const listing = this.platformGyms[0];
    this.gymPublicProfile = { organizationId: this.db.organization.id, version: 1, status: "published", shortName: listing?.shortName ?? this.db.organization.name.slice(0, 12), taglineEn: listing?.tagline ?? "", descriptionEn: listing?.description ?? "", category: listing?.category ?? "Gym", audience: listing?.audience ?? "All members", amenities: listing?.amenities ?? [], accentColor: listing?.accent ?? "#15140f", gallery: [], trainers: this.ptTrainers.filter((item) => item.status === "published").map((item) => this.ptTrainerView(item)), ptPackages: this.ptPackages.filter((item) => item.status === "active"), publishedAt: nowISO(), updatedAt: nowISO() };
    this.gymProfileVersions = [{ id: mockUuid(), organizationId: this.db.organization.id, version: 1, status: "published", profile: { ...this.gymPublicProfile }, publishedAt: this.gymPublicProfile.publishedAt, updatedAt: this.gymPublicProfile.updatedAt }];
  }

  /** The seeded Forge row is the only mock directory record linked to the tenant database. */
  private isProvisionedGym(gym: MarketplaceGym): boolean {
    return this.provisionedMockGymIds.has(gym.id);
  }

  private ptTrainerView(trainer: T.PtTrainerProfile): T.PtTrainerProfile {
    const assetId = this.ptTrainerPhotoAssetIds.get(trainer.id);
    const asset = assetId ? this.mediaAssets.get(assetId) : undefined;
    const photoUrl = asset
      && asset.organizationId === this.db.organization.id
      && asset.ownerType === "trainer_photo"
      && asset.ownerId === trainer.id
      && asset.visibility === "public"
      && asset.status === "active"
      ? asset.url
      : undefined;
    return { ...trainer, photoUrl };
  }

  private tenantForGym(gym: MarketplaceGym): MockProvisionedTenant | undefined {
    return [...this.provisionedTenants.values()].find((tenant) => tenant.listingId === gym.id);
  }

  private provisionedOrganizationsForOverview(): Array<{ id: string; status: T.Organization["status"]; subscriptionPlan?: T.Organization["subscriptionPlan"]; billingInterval?: "monthly" | "annual"; provisioned: boolean }> {
    return [
      { id: this.db.organization.id, status: this.db.organization.status, subscriptionPlan: this.db.organization.subscriptionPlan, billingInterval: this.db.organization.billingInterval ?? "monthly", provisioned: !this.db.organization.archivedAt },
      ...[...this.provisionedTenants.values()].map(({ organization }) => ({ id: organization.id, status: organization.status, subscriptionPlan: organization.subscriptionPlan, billingInterval: organization.billingInterval ?? "monthly", provisioned: !organization.archivedAt })),
    ];
  }

  private platformGymLogoUrl(gym: MarketplaceGym): string | undefined {
    const organizationId = this.db.organization.id;
    return safeMockGymLogoUrl(gym, organizationId)
      ?? (this.db.brand.logoAssetId ? safeMockLogoUrl(this.mediaAssets.get(this.db.brand.logoAssetId), organizationId) : undefined);
  }

  listMarketplaceGyms(): Promise<MarketplaceGym[]> {
    return this.respond(() => publicMarketplaceGyms(this.platformGyms
      .filter((gym) => this.isProvisionedGym(gym) && !this.archivedGymIds.has(gym.id))
      .map((gym) => {
        const cloned = cloneMarketplaceGym(gym);
        delete cloned.logoUrl;
        delete cloned.isProvisioned;
        delete cloned.isArchived;
        delete cloned.archivedAt;
        delete cloned.archiveReason;
        return cloned;
      })));
  }

  async subscribeMarketplaceGyms(onValue: (gyms: MarketplaceGym[]) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try {
      onValue(await this.listMarketplaceGyms());
      this.marketplaceSubscribers.set(onValue, onError);
    } catch (error) {
      onError?.(error);
    }
    return () => { this.marketplaceSubscribers.delete(onValue); };
  }

  getGymPublicProfile(): Promise<T.GymPublicProfile> {
    return this.respond(() => ({ ...this.gymPublicProfile, amenities: [...this.gymPublicProfile.amenities], gallery: [...this.gymPublicProfile.gallery], trainers: this.ptTrainers.filter((item) => item.status === "published").map((item) => this.ptTrainerView(item)), ptPackages: this.ptPackages.filter((item) => item.status === "active") }));
  }

  subscribeGymPublicProfile(onValue: (profile: T.GymPublicProfile) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getGymPublicProfile(), onValue, onError);
  }

  listGymProfileVersions(): Promise<T.GymProfileVersion[]> {
    return this.respond(() => this.gymProfileVersions.map((item) => ({ ...item, profile: { ...item.profile, amenities: [...item.profile.amenities], gallery: [...item.profile.gallery] } })));
  }

  saveGymPublicProfile(input: T.UpdateGymPublicProfileInput): Promise<T.GymPublicProfile> {
    return this.respond(() => {
      this.require("profiles.manage");
      if (!input.shortName.trim() || !input.taglineEn.trim() || !input.descriptionEn.trim()) throw ApiError.of(ERR.VALIDATION, "Short name, tagline, and description are required.");
      if (!/^#[0-9a-f]{6}$/i.test(input.accentColor)) throw ApiError.of(ERR.VALIDATION, "Accent color must be a six-digit hex color.");
      const nextVersion = this.gymPublicProfile.status === "published" ? this.gymPublicProfile.version + 1 : this.gymPublicProfile.version;
      const referenced = (id: string | undefined) => id ? this.mediaAssets.get(id) : undefined;
      const now = nowISO();
      const activate = (asset: T.MediaAsset | undefined): T.MediaAsset | undefined => {
        if (!asset) return undefined;
        const { deleteAfter: _deleteAfter, ...withoutDeletion } = asset;
        const active: T.MediaAsset = { ...withoutDeletion, status: "active", updatedAt: now };
        this.mediaAssets.set(active.id, active);
        return active;
      };
      const logo = activate(referenced(input.logoAssetId));
      const cover = activate(referenced(input.coverAssetId));
      const gallery = input.galleryAssetIds.map((id) => activate(referenced(id))).filter((asset): asset is T.MediaAsset => Boolean(asset));
      this.gymPublicProfile = { ...this.gymPublicProfile, ...input, logo, cover, version: nextVersion, status: "draft", amenities: [...input.amenities], gallery, trainers: this.ptTrainers.filter((item) => item.status === "published").map((item) => this.ptTrainerView(item)), ptPackages: this.ptPackages.filter((item) => item.status === "active"), publishedAt: undefined, updatedAt: now };
      return { ...this.gymPublicProfile };
    });
  }

  async publishGymPublicProfile(): Promise<T.GymPublicProfile> {
    const result = await this.respond(() => {
      this.require("profiles.manage");
      const now = nowISO();
      this.gymProfileVersions = this.gymProfileVersions.map((item) => item.status === "published" ? { ...item, status: "unpublished", unpublishedAt: now } : item);
      this.gymPublicProfile = { ...this.gymPublicProfile, status: "published", publishedAt: now, updatedAt: now, trainers: this.ptTrainers.filter((item) => item.status === "published").map((item) => this.ptTrainerView(item)) };
      this.gymProfileVersions.unshift({ id: mockUuid(), organizationId: this.db.organization.id, version: this.gymPublicProfile.version, status: "published", profile: { ...this.gymPublicProfile }, publishedAt: now, updatedAt: now });
      const listing = this.platformGyms[0];
      if (listing) Object.assign(listing, { shortName: this.gymPublicProfile.shortName, tagline: this.gymPublicProfile.taglineEn, description: this.gymPublicProfile.descriptionEn, category: this.gymPublicProfile.category, audience: this.gymPublicProfile.audience, amenities: [...this.gymPublicProfile.amenities], accent: this.gymPublicProfile.accentColor, profileVersion: this.gymPublicProfile.version, logo: this.gymPublicProfile.logo, cover: this.gymPublicProfile.cover, gallery: [...this.gymPublicProfile.gallery] });
      return { ...this.gymPublicProfile };
    });
    await Promise.all([this.emitMarketplaceSubscribers(), this.emitPlatformSnapshotSubscribers(), this.emitPlatformGymDetailSubscribers()]);
    return result;
  }

  unpublishGymPublicProfile(reason: string): Promise<T.GymPublicProfile> {
    return this.respond(() => {
      this.require("profiles.manage");
      if (!reason.trim()) throw ApiError.of(ERR.VALIDATION, "A reason is required to unpublish the gym profile.");
      this.gymPublicProfile = { ...this.gymPublicProfile, status: "unpublished", updatedAt: nowISO() };
      return { ...this.gymPublicProfile };
    });
  }

  uploadMediaAsset(input: { ownerType: T.MediaAssetOwnerType; ownerId: string; altText?: string; file: Blob }): Promise<T.MediaAsset> {
    return this.respond(() => {
      if (input.ownerType === "member_photo") {
        this.require("members.write");
        const member = this.db.members.find((candidate) => candidate.id === input.ownerId);
        const branch = member ? this.db.branches.find((candidate) => candidate.id === member.homeBranchId) : undefined;
        if (!member || !branch || branch.status !== "active") throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
        if (!this.branchIsVisible(branch.id)) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this branch.");
      }
      if (!( ["image/jpeg", "image/png", "image/webp"] as string[]).includes(input.file.type) || input.file.size > 5 * 1024 * 1024) throw ApiError.of(ERR.VALIDATION, "Use a JPEG, PNG, or WebP image up to 5 MB.");
      const now = nowISO();
      const assetId = mockUuid();
      const isProfileDraft = input.ownerType.startsWith("gym_") || input.ownerType === "trainer_photo";
      const asset = { id: assetId, organizationId: this.db.organization.id, ownerType: input.ownerType, ownerId: input.ownerId, storageId: `mock-storage-${mockUuid()}`, contentType: input.file.type as T.MediaAsset["contentType"], sizeBytes: input.file.size, altText: input.altText, visibility: input.ownerType === "member_photo" ? "private" : "public", status: isProfileDraft ? "pending" : "active", deleteAfter: isProfileDraft ? new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString() : undefined, url: createMockMediaUrl(input.file, assetId), createdAt: now, updatedAt: now } satisfies T.MediaAsset;
      this.mediaAssets.set(asset.id, asset);
      return asset;
    });
  }

  discardDraftMediaAsset(assetId: T.UUID): Promise<void> { return this.respond(() => { const asset = this.mediaAssets.get(assetId); if (asset && (asset.ownerType.startsWith("gym_") || asset.ownerType === "trainer_photo") && asset.status === "pending") { revokeMockMediaUrl(asset.url); this.mediaAssets.delete(assetId); } }); }

  private customerWithPreference(persona: CustomerPersona): CustomerPersona {
    const history = this.customerPreferenceHistory.get(persona.id) ?? [];
    const fallback: CustomerMarketingPreference = { optedIn: true, source: "system_default", wordingVersion: MARKETING_WORDING_VERSION };
    const preference = history[history.length - 1] ?? fallback;
    return { ...persona, marketingPreference: preference, marketingPreferenceHistory: history.length > 0 ? history.map((item) => ({ ...item })) : [fallback] };
  }

  getCustomerExperience(): Promise<CustomerExperience> {
    return this.respond(() => {
      const persona = this.registeredCustomers.get(this.activeCustomerId) ?? CUSTOMER_PERSONAS.find((item) => item.id === this.activeCustomerId) ?? CUSTOMER_PERSONAS[0]!;
      return { customer: this.customerWithPreference(persona), memberships: INITIAL_CUSTOMER_MEMBERSHIPS, bookings: this.trialBookings.map((booking) => ({ ...booking })) };
    });
  }

  async subscribeCustomerExperience(onValue: (experience: CustomerExperience) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try {
      onValue(await this.getCustomerExperience());
    } catch (error) {
      onError?.(error);
    }
    // Mock mode has no server socket. Returning the same disposer contract
    // keeps provider lifecycle code identical in preview and production.
    return () => undefined;
  }

  registerCustomer(input: CustomerProfileInput & { fullName: string; email: string }): Promise<CustomerPersona> {
    return this.respond(() => {
      const persona = {
        id: `customer-${Date.now()}`,
        name: input.fullName,
        nameAr: input.fullName,
        email: input.email.trim().toLowerCase(),
        phone: input.phone ?? "",
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        preferredLanguage: input.preferredLanguage ?? "en",
        addressLine1: input.addressLine1,
        city: input.city,
        emergencyContactName: input.emergencyContactName,
        emergencyContactRelationship: input.emergencyContactRelationship,
        emergencyContactPhone: input.emergencyContactPhone,
        initials: input.fullName.split(/\s+/).map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase(),
        context: "New member account",
      };
      this.registeredCustomers.set(persona.id, persona);
      this.activeCustomerId = persona.id;
      return this.customerWithPreference(persona);
    });
  }

  updateCustomerProfile(input: CustomerProfileInput): Promise<CustomerPersona> {
    return this.respond(() => {
      const current = this.registeredCustomers.get(this.activeCustomerId) ?? CUSTOMER_PERSONAS.find((item) => item.id === this.activeCustomerId) ?? CUSTOMER_PERSONAS[0]!;
      const next: CustomerPersona = {
        ...current,
        name: input.fullName?.trim() || current.name,
        nameAr: input.fullName?.trim() || current.nameAr,
        phone: input.phone ?? current.phone,
        dateOfBirth: input.dateOfBirth || undefined,
        gender: input.gender,
        preferredLanguage: input.preferredLanguage ?? current.preferredLanguage ?? "en",
        addressLine1: input.addressLine1 || undefined,
        city: input.city || undefined,
        emergencyContactName: input.emergencyContactName || undefined,
        emergencyContactRelationship: input.emergencyContactRelationship || undefined,
        emergencyContactPhone: input.emergencyContactPhone || undefined,
        initials: (input.fullName?.trim() || current.name).split(/\s+/).map((part) => part[0] ?? "").join("").slice(0, 2).toUpperCase(),
      };
      this.registeredCustomers.set(next.id, next);
      return this.customerWithPreference(next);
    });
  }

  updateCustomerMarketingPreference(input: { optedIn: boolean; customerId?: string }): Promise<CustomerPersona> {
    return this.respond(() => {
      if (typeof input.optedIn !== "boolean") throw ApiError.of(ERR.VALIDATION, "Choose whether to receive marketing messages.");
      const customerId = input.customerId ?? this.activeCustomerId;
      const persona = this.registeredCustomers.get(customerId) ?? CUSTOMER_PERSONAS.find((item) => item.id === customerId);
      const current = persona ?? {
        id: customerId,
        name: "RIVET member",
        nameAr: "RIVET member",
        email: "member@example.com",
        phone: "",
        initials: "RM",
        context: "RIVET member",
      };
      const history = this.customerPreferenceHistory.get(current.id) ?? [{ optedIn: true, source: "system_default" as const, wordingVersion: MARKETING_WORDING_VERSION }];
      const previous = history[history.length - 1];
      if (!previous || previous.optedIn !== input.optedIn || previous.source !== "member_selected") {
        history.push({ optedIn: input.optedIn, source: "member_selected", changedAt: nowISO(), wordingVersion: MARKETING_WORDING_VERSION });
        this.customerPreferenceHistory.set(current.id, history);
      }
      this.activeCustomerId = current.id;
      return this.customerWithPreference(current);
    });
  }

  createTrialBooking(input: Omit<TrialBooking, "id" | "createdAt" | "status" | "customerId" | "leadId"> & { customerId?: string }): Promise<TrialBooking> {
    return this.respond(() => {
      const gym = this.platformGyms.find((item) => item.id === input.gymId);
      const directoryBranch = gym?.branches.find((item) => item.id === input.branchId);
      if (!gym || !this.isProvisionedGym(gym) || !publicMarketplaceGyms([gym]).length || !directoryBranch) throw ApiError.of(ERR.NOT_FOUND, "Gym branch not found.");
      if (!isTimeInTrialWindow(directoryBranch, input.preferredDate, input.preferredTime)) throw ApiError.of(ERR.CONFLICT, "That trial time is outside this branch's trial-request hours.");
      const idempotencyKey = input.idempotencyKey?.trim();
      const signature = publicRequestSignature({ gymId: input.gymId, branchId: input.branchId, fullName: input.fullName.trim(), email: input.email.trim().toLowerCase(), phone: input.phone.trim(), preferredDate: input.preferredDate, preferredTime: input.preferredTime, goal: input.goal.trim(), customerId: input.customerId });
      const idempotencyScope = input.customerId ?? `anonymous:${input.email.trim().toLowerCase()}`;
      const idempotencyMapKey = idempotencyKey ? `${idempotencyScope}:${idempotencyKey}` : undefined;
      if (idempotencyMapKey) {
        if (idempotencyKey!.length < 8 || idempotencyKey!.length > 200) throw ApiError.of(ERR.VALIDATION, "The trial request could not be processed.");
        const existingRequest = this.trialIdempotency.get(idempotencyMapKey);
        if (existingRequest) {
          if (existingRequest.signature !== signature) throw ApiError.of(ERR.CONFLICT, "This trial request has already been used.");
          return { ...existingRequest.result };
        }
      }
      // The browser experience owns whether a member is signed in. Falling
      // back to the mock adapter's last persona would silently attach a guest
      // request to an unrelated seeded member after navigation or test reuse.
      const customerId = input.customerId;
      if (customerId && this.trialBookings.some((booking) => booking.customerId === customerId && booking.gymId === input.gymId && (booking.status === "requested" || booking.status === "confirmed"))) throw ApiError.of(ERR.CONFLICT, "You already have an open trial request with this gym.");
      enforceMockRateLimit(this.trialRateLimits, `${customerId ?? input.email.trim().toLowerCase()}|${input.phone.trim()}`, 10, 24 * 60 * 60 * 1000);
      const internalBranchId = directoryBranch?.internalBranchId;
      let leadId: string | undefined;
      if (gym && internalBranchId) {
        leadId = mockUuid();
        const followUp = new Date(`${input.preferredDate}T${input.preferredTime}:00+03:00`).toISOString();
        const lead: T.Lead = {
          id: leadId,
          organizationId: this.db.organization.id,
          branchId: internalBranchId,
          fullName: input.fullName.trim(),
          phone: input.phone.trim(),
          email: input.email.trim().toLowerCase(),
          stage: "trial_booked",
          source: "other",
          ownerId: this.actor().id,
          expectedValue: { amount: gym.fromPriceMinor, currency: "JOD" },
          nextFollowUpAt: followUp,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        (lead as T.Lead & { notes?: string }).notes = `Free trial requested through RIVET Member for ${directoryBranch.name}. Goal: ${input.goal}`;
        this.db.leads.push(lead);
        this.activity({ leadId, type: "member_created", title: "Free trial requested", body: input.goal, actorName: "RIVET Member" });
      }
      const booking: TrialBooking = { ...input, customerId, id: `trial-${Date.now()}`, createdAt: nowISO(), status: "requested", ...(leadId ? { leadId } : {}) };
      this.trialBookings.unshift(booking);
      if (idempotencyMapKey) this.trialIdempotency.set(idempotencyMapKey, { signature, result: { ...booking } });
      return { ...booking };
    });
  }

  getEntryPass(membershipId: string): Promise<EntryPass> {
    return this.respond(() => {
      const membership = INITIAL_CUSTOMER_MEMBERSHIPS.find((item) => item.id === membershipId);
      if (!membership) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      return { token: membership.qrValue, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), membershipId };
    });
  }

  previewMemberImport(input: { csv: string; branchId: T.UUID }): Promise<MemberImportPreview> {
    return this.respond(() => {
      this.require("members.write");
      const branch = this.db.branches.find((item) => item.id === input.branchId && item.status === "active");
      if (!branch || !this.branchIsVisible(branch.id)) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
      const rows = parseImportCsv(input.csv);
      const header = (rows.shift() ?? []).map((item) => item.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
      const nameIndex = header.findIndex((item) => ["full_name", "name", "member_name"].includes(item));
      const phoneIndex = header.findIndex((item) => ["phone", "mobile", "mobile_number"].includes(item));
      const emailIndex = header.findIndex((item) => item === "email" || item === "email_address");
      const previewRows: MemberImportRow[] = rows.map((values, index) => {
        const fullName = nameIndex >= 0 ? values[nameIndex] ?? "" : "";
        const phone = phoneIndex >= 0 ? values[phoneIndex] ?? "" : "";
        const email = emailIndex >= 0 ? values[emailIndex] || undefined : undefined;
        const duplicateIds = this.findDuplicates({ phone, email }).map((match) => match.memberId);
        const errors = [
          ...(fullName ? [] : ["Full name is required"]),
          ...(phone ? [] : ["Phone is required"]),
          ...(duplicateIds.length ? ["A member with this phone or email already exists"] : []),
        ];
        return { rowNumber: index + 2, fullName, phone, email, status: duplicateIds.length ? "duplicate" : errors.length ? "invalid" : "valid", errors, duplicateMemberIds: duplicateIds };
      });
      const preview: MemberImportPreview = { id: mockUuid(), branchId: input.branchId, totalRows: previewRows.length, validRows: previewRows.filter((row) => row.status === "valid").length, duplicateRows: previewRows.filter((row) => row.status === "duplicate").length, errorRows: previewRows.filter((row) => row.status === "invalid").length, rows: previewRows, createdAt: nowISO() };
      this.memberImports.set(preview.id, preview);
      return preview;
    });
  }

  commitMemberImport(input: MemberImportCommitInput): Promise<MemberImportCommitResult> {
    return this.respond(() => {
      this.require("members.write");
      const cursor = input.cursor ?? 0;
      const chunkSize = Math.min(100, Math.max(1, input.chunkSize ?? 25));
      const signature = JSON.stringify({ importId: input.importId, cursor, chunkSize });
      const existingResult = this.memberImportIdempotency.get(input.idempotencyKey);
      if (existingResult) {
        if (existingResult.signature !== signature) throw ApiError.of(ERR.VALIDATION, "This import idempotency key was already used for a different chunk.");
        return existingResult.result;
      }
      const preview = this.memberImports.get(input.importId);
      if (!preview) throw ApiError.of(ERR.NOT_FOUND, "Import preview not found.");
      const previewBranch = this.db.branches.find((item) => item.id === preview.branchId && item.status === "active");
      if (!previewBranch || !this.branchIsVisible(previewBranch.id)) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
      const end = Math.min(preview.rows.length, cursor + chunkSize);
      const createdMemberIds: string[] = [];
      const errors: Array<{ rowNumber: number; message: string }> = [];
      let skippedCount = 0;
      for (let index = cursor; index < end; index += 1) {
        const row = preview.rows[index]!;
        if (row.status !== "valid") { skippedCount += 1; row.status = "skipped"; continue; }
        const branch = previewBranch;
        this.db.counters.memberNumber += 1;
        const member: MemberRecord = { id: mockUuid(), memberNumber: `${branch.code}-${this.db.counters.memberNumber}`, fullName: row.fullName, phone: row.phone, email: row.email, homeBranchId: branch.id, status: "active", tags: [], preferredLanguage: "en", marketingOptIn: true, createdAt: nowISO() };
        this.db.members.push(member);
        this.activity({ memberId: member.id, type: "member_created", title: "Member imported", actorId: this.actor().id, actorName: this.actor().name });
        this.audit({ category: "members", action: "member.imported", entityType: "member", entityId: member.id, entityLabel: `${member.fullName} · ${member.memberNumber}`, summary: `Imported from CSV row ${row.rowNumber}` });
        row.status = "committed";
        row.memberId = member.id;
        createdMemberIds.push(member.id);
      }
      const nextCursor = end;
      const result: MemberImportCommitResult = { importId: preview.id, status: nextCursor >= preview.rows.length ? "completed" : "processing", cursor: nextCursor, totalRows: preview.rows.length, committedCount: createdMemberIds.length, skippedCount, failedCount: errors.length, createdMemberIds, errors };
      this.memberImports.set(preview.id, preview);
      this.memberImportIdempotency.set(input.idempotencyKey, { signature, result });
      return result;
    });
  }

  getPlatformSnapshot(): Promise<PlatformSnapshot> {
    return this.respond(() => ({
      // This flag belongs to the platform projection only. Public directory
      // reads continue through listMarketplaceGyms(), which filters and
      // returns only provisioned rows.
      // Platform snapshots retain archived rows for audit/history. The admin
      // directory decides whether to hide rows using isArchived; public
      // marketplace reads remain filtered by listMarketplaceGyms().
      gyms: this.platformGyms.map((gym) => {
        const cloned = cloneMarketplaceGym(gym);
        delete cloned.logoUrl;
        const tenant = this.tenantForGym(gym);
        const logoUrl = this.isProvisionedGym(gym) ? (tenant ? safeMockGymLogoUrl(gym, tenant.organization.id) : this.platformGymLogoUrl(gym)) : undefined;
        return { ...cloned, ...(logoUrl ? { logoUrl } : {}), isProvisioned: this.isProvisionedGym(gym) };
      }),
      bookings: this.trialBookings.map((booking) => ({ ...booking })),
      invoices: this.platformInvoices.map((invoice) => ({ ...invoice })),
      supportCases: this.platformSupportCases.map((supportCase) => ({ ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) })),
      applications: this.gymApplications.map((application) => ({ ...application })),
      auditEvents: this.platformAuditEvents.map((event) => ({ ...event })),
      plans: this.platformPlans.map((plan) => ({ ...plan })),
      overview: buildPlatformOverview({
        gyms: this.platformGyms.map((gym) => {
          const tenant = this.tenantForGym(gym);
          return { id: gym.id, organizationId: tenant?.organization.id ?? (this.isProvisionedGym(gym) ? this.db.organization.id : undefined), subscriptionStatus: gym.subscriptionStatus, trialEndsAt: gym.trialEndsAt, provisioned: this.isProvisionedGym(gym) && !gym.isArchived && !tenant?.organization.archivedAt };
        }),
        organizations: this.provisionedOrganizationsForOverview(),
        plans: this.platformPlans.map((plan) => ({ name: plan.name, priceMinor: plan.priceMinor })),
        branches: [
          ...this.db.branches.map((branch) => ({ organizationId: this.db.organization.id, active: branch.status === "active", status: branch.status })),
          ...[...this.provisionedTenants.values()].map(({ organization, branch }) => ({ organizationId: organization.id, active: branch.status === "active", status: branch.status })),
        ],
        members: this.db.members.map((member) => ({ organizationId: this.db.organization.id, status: member.status })),
        staffMemberships: [
          ...this.db.users.map((user) => ({ organizationId: user.organizationId, active: user.status === "active" })),
          ...[...this.provisionedTenants.values()].map(({ organization, owner }) => ({ organizationId: organization.id, active: owner.status === "active" })),
        ],
        bookings: this.trialBookings.map((booking) => ({ gymId: booking.gymId, status: booking.status })),
        applications: this.gymApplications.map((application) => ({
          id: application.id,
          gymName: application.gymName,
          plan: application.plan,
          status: application.status,
          updatedAt: application.updatedAt,
          provisioningStatus: application.provisioningStatus,
          provisioningOutcome: application.provisioningOutcome,
          provisioningError: application.provisioningError,
        })),
        invoices: this.platformInvoices,
        supportCases: this.platformSupportCases,
      }),
    }));
  }

  /** Deterministic preview equivalent of the Convex subscription cron. */
  async reconcilePlatformSubscriptions(now = Date.now()): Promise<{ processed: number; invoicesCreated: number; markedPastDue: number; suspended: number }> {
    const organization = this.db.organization;
    const gym = this.platformGyms.find((item) => this.isProvisionedGym(item));
    if (!gym || !["trial", "active", "past_due"].includes(organization.status)) return { processed: 0, invoicesCreated: 0, markedPastDue: 0, suspended: 0 };
    const boundaryValue = organization.trialEndsAt ?? organization.currentPeriodEndsAt;
    if (!boundaryValue) return { processed: 1, invoicesCreated: 0, markedPastDue: 0, suspended: 0 };
    const boundary = Date.parse(boundaryValue);
    if (!Number.isFinite(boundary)) return { processed: 1, invoicesCreated: 0, markedPastDue: 0, suspended: 0 };
    const billingInterval = organization.billingInterval ?? gym.billingInterval ?? "monthly";
    const periodEnd = addBillingInterval(boundary, billingInterval);
    const cycleKey = `subscription:${organization.id}:${billingInterval}:${boundary}`;
    let invoice = this.platformInvoices.find((item) => item.cycleKey === cycleKey);
    let invoicesCreated = 0;
    if (now >= boundary - 3 * 86_400_000 && !invoice) {
      const plan = this.platformPlans.find((item) => item.name === organization.subscriptionPlan)?.priceMinor ?? 0;
      const amountMinor = billingInterval === "annual" ? Math.round(plan * 12 * 0.8) : plan;
      invoice = {
        id: `INV-${crypto.randomUUID()}`,
        gymId: gym.id,
        gym: gym.name,
        amountMinor,
        amount: `JOD ${(amountMinor / 1_000).toFixed(3)}`,
        currency: "JOD",
        date: new Date(now).toISOString(),
        issuedAt: new Date(now).toISOString(),
        dueAt: new Date(boundary).toISOString(),
        periodStart: new Date(boundary).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        cycleKey,
        billingInterval,
        status: "open",
      };
      this.platformInvoices.unshift(invoice);
      this.operationalEmailKinds.push("platform_invoice_reminder");
      invoicesCreated = 1;
    }
    if (!invoice) return { processed: 1, invoicesCreated, markedPastDue: 0, suspended: 0 };
    if (invoice.status === "void") return { processed: 1, invoicesCreated, markedPastDue: 0, suspended: 0 };
    let markedPastDue = 0;
    if (now >= boundary && ["draft", "open"].includes(invoice.status)) {
      invoice.status = "past_due";
      invoice.pastDueAt = new Date(now).toISOString();
      organization.status = "past_due";
      organization.subscriptionStatusReason = `Subscription invoice ${invoice.id} is due.`;
      gym.subscriptionStatus = "overdue";
      gym.subscriptionStatusReason = organization.subscriptionStatusReason;
      this.operationalEmailKinds.push("platform_invoice_past_due");
      markedPastDue = 1;
    }
    if (now < boundary + 2 * 86_400_000 || ["paid", "void"].includes(invoice.status)) return { processed: 1, invoicesCreated, markedPastDue, suspended: 0 };
    organization.status = "suspended";
    organization.subscriptionStatusReason = `Subscription invoice ${invoice.id} remained unpaid after the 2-day grace period.`;
    gym.subscriptionStatus = "suspended";
    gym.isPublic = false;
    gym.subscriptionStatusReason = organization.subscriptionStatusReason;
    this.operationalEmailKinds.push("platform_subscription_suspended");
    await this.emitPlatformSnapshotSubscribers();
    await this.emitMarketplaceSubscribers();
    await this.emitWorkspaceAccessSubscribers();
    return { processed: 1, invoicesCreated, markedPastDue, suspended: 1 };
  }

  async previewMarketingPreferenceMigration(): Promise<import("@/lib/api/GymOSApi").MarketingPreferenceMigrationPreview> {
    return { profileCount: 0, memberCount: 0, totalCount: 0, targetStatus: "unknown", marketingDelivery: "suppressed" };
  }

  async applyMarketingPreferenceMigration(): Promise<import("@/lib/api/GymOSApi").MarketingPreferenceMigrationProgress> {
    return { id: `mock-marketing-${Date.now()}`, status: "completed", previewCount: 0, processedCount: 0, failedCount: 0, remainingCount: 0 };
  }

  async subscribePlatformSnapshot(onValue: (snapshot: PlatformSnapshot) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try {
      onValue(await this.getPlatformSnapshot());
      this.platformSnapshotSubscribers.set(onValue, onError);
    } catch (error) {
      onError?.(error);
    }
    return () => { this.platformSnapshotSubscribers.delete(onValue); };
  }

  async subscribePublicSaasPlans(onValue: (plans: PlatformSaasPlan[]) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try {
      onValue(this.platformPlans.map((plan) => ({ ...plan })));
      this.publicPlanSubscribers.set(onValue, onError);
    } catch (error) {
      onError?.(error);
    }
    return () => { this.publicPlanSubscribers.delete(onValue); };
  }

  async subscribeWorkspaceAccess(onValue: (access: T.WorkspaceAccess) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try {
      onValue(await this.getWorkspaceAccess());
      this.workspaceAccessSubscribers.set(onValue, onError);
    } catch (error) {
      onError?.(error);
    }
    return () => { this.workspaceAccessSubscribers.delete(onValue); };
  }

  getPlatformGymDetail(gymId: string): Promise<PlatformGymDetail> {
    return this.respond(() => {
      const gym = this.platformGyms.find((item) => item.id === gymId);
      if (!gym) throw ApiError.of(ERR.NOT_FOUND, "Gym not found.");

      const available = <T,>(value: T): PlatformData<T> => ({ state: "available", value });
      const notAvailable = <T,>(): PlatformData<T> => ({ state: "not_available" });
      const notConfigured = <T,>(): PlatformData<T> => ({ state: "not_configured" });
      // Forge is backed by the signed-in demo database. Newly provisioned
      // applications use a tenant-shaped mock projection so their listing,
      // branch, owner invitation, and subscription facts are not borrowed
      // from Forge.
      const tenant = this.tenantForGym(gym);
      const isSeedTenant = this.isProvisionedGym(gym);
      const organization = tenant?.organization ?? (isSeedTenant ? this.db.organization : undefined);
      const branches = tenant
        ? [{ id: tenant.branch.id, name: tenant.branch.name, code: tenant.branch.code, address: tenant.branch.address || undefined, phone: tenant.branch.phone || undefined, status: tenant.branch.status }]
        : isSeedTenant
          ? this.db.branches.map((branch) => ({ id: branch.id, name: branch.name, code: branch.code, address: branch.address || undefined, phone: branch.phone || undefined, status: branch.status }))
          : [];
      const owner = tenant?.owner ?? (organization ? this.db.users.find((user) => user.role === "owner" && user.status !== "deactivated") : undefined);
      const effectiveStatus = organization ? platformStatusForOrganization(organization.status) : gym.subscriptionStatus;
      const effectivePlan = organization?.subscriptionPlan ?? gym.rivetPlan;
      const isArchived = Boolean(gym.isArchived || organization?.archivedAt);
      const plan = organization?.subscriptionPlan ? this.platformPlans.find((item) => item.name === organization.subscriptionPlan) : undefined;
      const activeMemberCount = tenant ? 0 : organization ? this.db.members.filter((member) => member.status === "active").length : 0;
      const activeStaffCount = tenant ? (tenant.owner.status === "active" ? 1 : 0) : organization ? this.db.users.filter((user) => user.status === "active").length : 0;
      const field = <T,>(value: T | undefined, missing: "not_available" | "not_configured" = "not_available"): PlatformData<T> => value === undefined ? (missing === "not_available" ? notAvailable<T>() : notConfigured<T>()) : available(value);
      const logoUrl = organization ? (tenant ? safeMockGymLogoUrl(gym, organization.id) : this.platformGymLogoUrl(gym)) : undefined;

      return {
        id: gym.id,
        name: gym.name,
        shortName: gym.shortName,
        accent: gym.accent,
        logoUrl: organization ? field(logoUrl, "not_configured") : notAvailable(),
        controls: { status: effectiveStatus, plan: effectivePlan, isPublic: Boolean(organization && PUBLIC_SUBSCRIPTION_STATUSES.has(effectiveStatus) && gym.isPublic), isArchived, archivedAt: gym.archivedAt ?? (organization?.archivedAt ? new Date(organization.archivedAt).toISOString() : undefined), archiveReason: gym.archiveReason ?? organization?.archiveReason },
        organization: organization
          ? available({ id: organization.id, name: organization.name, status: organization.status, currency: organization.currency, timezone: organization.timezone })
          : notAvailable(),
        joinedAt: notAvailable(),
        branches: organization ? available(branches) : notAvailable(),
        owner: owner ? available({ name: owner.name, email: owner.email, phone: owner.phone || undefined }) : notAvailable(),
        usage: {
          memberCount: organization ? available(activeMemberCount) : notAvailable(),
          activeStaffCount: organization ? available(activeStaffCount) : notAvailable(),
          staffLimit: organization ? field(plan?.staff, "not_configured") : notAvailable(),
          automationRuleCount: organization ? available(tenant ? 0 : this.db.rules.length) : notAvailable(),
          paymentTransactionCount: organization ? available(tenant ? 0 : this.db.payments.length) : notAvailable(),
          storage: notConfigured(),
        },
        subscription: {
          plan: organization ? field(organization.subscriptionPlan, "not_configured") : notAvailable(),
          billingInterval: organization ? field(organization.billingInterval ?? gym.billingInterval ?? "monthly", "not_configured") : notAvailable(),
          status: organization ? available(effectiveStatus) : notAvailable(),
          startedAt: organization ? field(organization.subscriptionStartedAt ?? gym.subscriptionStartedAt, "not_configured") : notAvailable(),
          trialEndsAt: organization ? field(organization.trialEndsAt ?? gym.trialEndsAt, "not_configured") : notAvailable(),
          currentPeriodEndsAt: organization ? field(organization.currentPeriodEndsAt ?? gym.currentPeriodEndsAt, "not_configured") : notAvailable(),
          cancelledAt: organization ? field(organization.cancelledAt ?? gym.cancelledAt, "not_configured") : notAvailable(),
          statusReason: organization ? field(organization.subscriptionStatusReason ?? gym.subscriptionStatusReason, "not_configured") : notAvailable(),
          // Mirror the Convex derivation: the catalog price with the shared
          // annual formula, and the platform invoices scoped to this gym.
          recurringAmount: organization && plan
            ? available({ amount: (organization.billingInterval ?? gym.billingInterval ?? "monthly") === "annual" ? Math.round(plan.priceMinor * 12 * 0.8) : plan.priceMinor, currency: organization.currency ?? "JOD" })
            : organization ? notConfigured() : notAvailable(),
          renewalDate: organization ? field(organization.currentPeriodEndsAt ?? gym.currentPeriodEndsAt, "not_configured") : notAvailable(),
          paymentMethod: notConfigured(),
          invoices: organization ? available(this.platformInvoices.filter((invoice) => invoice.gymId === gym.id).map((invoice) => ({ ...invoice }))) : notAvailable(),
        },
        activity: organization
          ? available(this.platformAuditEvents.filter((event) => event.entityType === "platform_gym" && event.entityPublicId === gym.id).map(({ entityType: _entityType, entityPublicId: _entityPublicId, entityLabel: _entityLabel, reason: _reason, ...event }) => ({ ...event })))
          : notAvailable(),
      };
    });
  }

  subscribePlatformGymDetail(gymId: string, onValue: (detail: PlatformGymDetail) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return (async () => {
      try {
        onValue(await this.getPlatformGymDetail(gymId));
        this.platformGymDetailSubscribers.set(onValue, { gymId, onError });
      } catch (error) {
        onError?.(error);
      }
      return () => { this.platformGymDetailSubscribers.delete(onValue); };
    })();
  }

  listPublicSaasPlans(): Promise<PlatformSaasPlan[]> {
    return this.respond(() => this.platformPlans);
  }

  submitGymApplication(input: SubmitGymApplicationInput): Promise<SubmitGymApplicationResult> {
    return this.respond(() => {
      if (input.website?.trim()) {
        return { applicationId: mockUuid(), status: "pending" as const, notificationStatus: "pending" as const, submittedAt: nowISO(), duplicate: false };
      }
      const normalizedEmail = input.email.trim().toLowerCase();
      const applicationKey = publicApplicationKey(normalizedEmail, input.gymName);
      const signature = publicRequestSignature({ gymName: input.gymName.trim(), ownerName: input.ownerName.trim(), email: normalizedEmail, contactNumber: input.contactNumber.trim(), plan: input.plan, billingInterval: input.billingInterval ?? "monthly" });
      const idempotencyKey = input.idempotencyKey?.trim();
      if (idempotencyKey) {
        if (idempotencyKey.length > 200) throw ApiError.of(ERR.VALIDATION, "The application request could not be processed.");
        const existingRequest = this.publicApplicationIdempotency.get(idempotencyKey);
        if (existingRequest) {
          if (existingRequest.signature !== signature) throw ApiError.of(ERR.CONFLICT, "This application request has already been used.");
          return { ...existingRequest.result, duplicate: true };
        }
      }
      const existing = this.gymApplications.find((application) => application.status !== "rejected" && publicApplicationKey(application.email, application.gymName) === applicationKey);
      if (existing) return { applicationId: existing.id, status: existing.status, notificationStatus: existing.notificationStatus, submittedAt: existing.submittedAt, duplicate: true };
      enforceMockRateLimit(this.publicApplicationRateLimits, `${normalizedEmail}|${input.contactNumber.trim()}`, 5, 60 * 60 * 1000);
      const submittedAt = nowISO();
      const applicationId = `application-${Date.now()}`;
      const result = { applicationId, status: "pending" as const, notificationStatus: "sent" as const, submittedAt, duplicate: false };
      this.gymApplications.unshift({
        id: applicationId,
        gymName: input.gymName.trim(),
        ownerName: input.ownerName.trim(),
        email: normalizedEmail,
        contactNumber: input.contactNumber.trim(),
        plan: input.plan,
        billingInterval: input.billingInterval ?? "monthly",
        status: "pending",
        notificationStatus: "sent",
        reviewNotificationStatus: "not_configured",
        submittedAt,
        updatedAt: submittedAt,
      });
      if (idempotencyKey) this.publicApplicationIdempotency.set(idempotencyKey, { signature, result });
      return result;
    });
  }

  listGymApplications(query: { status?: PlatformGymApplication["status"]; search?: string } = {}): Promise<PlatformGymApplication[]> {
    return this.respond(() => {
      const search = query.search?.trim().toLowerCase();
      return this.gymApplications
        .filter((application) => !query.status || application.status === query.status)
        .filter((application) => !search || [application.gymName, application.ownerName, application.email, application.contactNumber, application.plan, application.status].some((value) => value.toLowerCase().includes(search)))
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
        .map((application) => ({ ...application }));
    });
  }

  async subscribePlatformApplications(onValue: (applications: PlatformGymApplication[]) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try {
      onValue(await this.listGymApplications());
    } catch (error) {
      onError?.(error);
    }
    return () => undefined;
  }

  reviewGymApplication(input: ReviewGymApplicationInput): Promise<PlatformGymApplication> {
    return this.respond(() => {
      const application = this.gymApplications.find((item) => item.id === input.applicationId);
      if (!application) throw ApiError.of(ERR.NOT_FOUND, "Gym application not found.");
      if (application.status === "approved" || application.status === "rejected") throw ApiError.of(ERR.VALIDATION, "This gym application has already been finalized.");
      if (input.decision === "rejected" && !input.note?.trim()) throw ApiError.of(ERR.VALIDATION, "Add a reason before rejecting an application.", { fieldErrors: { note: ["Required when rejecting an application"] } });
      const now = nowISO();
      application.status = input.decision;
      application.updatedAt = now;
      application.reviewedBy = this.actor().name;
      application.reviewNotes = input.note?.trim() || undefined;
      application.reviewedAt = input.decision === "under_review" ? undefined : now;
      application.reviewNotificationStatus = input.decision === "under_review" ? "not_configured" : "sent";
      application.reviewNotificationError = undefined;
      this.audit({
        category: "settings",
        action: `gym_application.${input.decision}`,
        entityType: "gym_application",
        entityId: application.id,
        entityLabel: application.gymName,
        summary: `${input.decision === "under_review" ? "Moved to review" : input.decision === "approved" ? "Approved" : "Rejected"} gym application`,
        reason: input.note,
      });
      return { ...application };
    });
  }

  saveGymApplicationReviewNote(input: SaveGymApplicationReviewNoteInput): Promise<PlatformGymApplication> {
    return this.respond(() => {
      const application = this.gymApplications.find((item) => item.id === input.applicationId);
      if (!application) throw ApiError.of(ERR.NOT_FOUND, "Gym application not found.");
      const note = input.note.trim();
      if (note.length > 2_000) throw ApiError.of(ERR.VALIDATION, "Review note must be 2,000 characters or fewer.", { fieldErrors: { note: ["Must be 2,000 characters or fewer"] } });
      const previousNote = application.reviewNotes;
      application.reviewNotes = note || undefined;
      application.updatedAt = nowISO();
      this.audit({
        category: "settings",
        action: "gym_application.review_note_update",
        entityType: "gym_application",
        entityId: application.id,
        entityLabel: application.gymName,
        summary: note ? "Updated gym application review note" : "Cleared gym application review note",
        before: { reviewNotes: previousNote ?? null },
        after: { reviewNotes: application.reviewNotes ?? null },
      });
      return { ...application };
    });
  }

  provisionGym(input: ProvisionGymInput): Promise<GymProvisioningResult> {
    if (this.provisioningInFlight.has(input.applicationId)) {
      return Promise.reject(ApiError.of(ERR.CONFLICT, "Gym provisioning is already in progress. Refresh the application before retrying."));
    }
    this.provisioningInFlight.add(input.applicationId);
    return this.respond(() => {
      const application = this.gymApplications.find((item) => item.id === input.applicationId);
      if (!application) throw ApiError.of(ERR.NOT_FOUND, "Gym application not found.");
      if (application.status !== "approved") throw ApiError.of(ERR.VALIDATION, "Only approved applications can be provisioned.");
      if (application.provisioningStatus === "failed" && application.provisioningOutcome === "permanent") {
        throw ApiError.of(ERR.CONFLICT, application.provisioningError ?? "Provisioning requires manual correction before it can be retried.");
      }
      if (application.provisioningStatus === "completed" && application.provisionedOrganizationId && application.provisionedBranchId) {
        return {
          applicationId: application.id,
          status: "completed" as const,
          organizationId: application.provisionedOrganizationId,
          organizationName: application.gymName,
          branchId: application.provisionedBranchId,
          branchName: `${application.gymName} — Main branch`,
          plan: application.plan,
          billingInterval: application.billingInterval ?? "monthly",
          ownerName: application.ownerName,
          ownerEmail: application.email,
          clerkOrganizationId: application.clerkOrganizationId ?? `clerk-org-${application.id.slice(0, 8)}`,
          clerkInvitationId: application.clerkInvitationId ?? `clerk-inv-${application.id.slice(0, 8)}`,
        };
      }
      const now = nowISO();
      application.provisioningStatus = "in_progress";
      application.provisioningCheckpoint = "claimed";
      application.provisioningOutcome = "partial";
      application.provisioningAttemptCount = (application.provisioningAttemptCount ?? 0) + 1;
      application.provisioningLastCorrelationId = `mock-provision:${application.id}:${application.provisioningAttemptCount}`;
      application.provisioningError = undefined;
      application.updatedAt = now;

      // Keep the mock's signed-in Forge database intact while creating the
      // same durable tenant-shaped facts that the live provisioning action
      // projects: organization, first branch, owner invitation state, and a
      // marketplace listing. The application id makes retries converge on the
      // same tenant instead of appending duplicate directory rows.
      const organizationId = mockUuid();
      const branchId = mockUuid();
      const ownerId = mockUuid();
      const clerkOrganizationId = `clerk-org-${application.id.slice(0, 8)}`;
      const clerkInvitationId = `clerk-inv-${application.id.slice(0, 8)}`;
      const listingId = `gym-${application.id}`;
      const startedAt = now;
      const trialEndsAt = new Date(addCalendarMonths(Date.parse(now), 1)).toISOString();
      const template = this.platformGyms.find((item) => item.id === PROVISIONED_MOCK_GYM_ID) ?? MARKETPLACE_GYMS[0]!;
      const existingOwner = this.db.users.find((user) => user.email.trim().toLowerCase() === application.email.trim().toLowerCase() && user.status !== "deactivated");
      const owner = existingOwner ?? {
        id: ownerId,
        organizationId,
        name: application.ownerName,
        email: application.email,
        phone: application.contactNumber,
        role: "owner" as const,
        branchScope: "all" as const,
        branchIds: [branchId],
        status: "invited" as const,
        invitedAt: now,
      } satisfies T.StaffUser;
      const membershipStatus = existingOwner?.status === "active" ? "accepted" as const : "pending" as const;
      const organization: T.Organization = {
        ...this.db.organization,
        id: organizationId,
        name: application.gymName,
        slug: `${application.gymName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "gym"}-${application.id.slice(0, 8)}`,
        subscriptionPlan: application.plan,
        billingInterval: application.billingInterval ?? "monthly",
        status: "trial",
        subscriptionStartedAt: startedAt,
        trialEndsAt,
        currentPeriodEndsAt: undefined,
        cancelledAt: undefined,
        archivedAt: undefined,
        archiveReason: undefined,
        subscriptionStatusReason: "Provisioned from approved application.",
        updatedAt: now,
      };
      const branch: T.Branch = {
        id: branchId,
        organizationId,
        name: `${application.gymName} — Main branch`,
        code: "MAIN",
        address: "Amman",
        phone: application.contactNumber,
        capacity: 0,
        status: "active",
      };
      const listing = cloneMarketplaceGym(template);
      listing.id = listingId;
      listing.name = application.gymName;
      listing.shortName = application.gymName.slice(0, 32);
      listing.tagline = `${application.plan} workspace on RIVET`;
      listing.description = `The ${application.gymName} workspace is ready for its owner onboarding.`;
      listing.city = "Amman";
      listing.areas = ["Amman"];
      listing.memberCount = 0;
      listing.branchCount = 1;
      listing.rating = 0;
      listing.reviewCount = 0;
      listing.fromPriceMinor = 0;
      listing.amenities = [];
      listing.featured = false;
      listing.subscriptionStatus = "trial";
      listing.rivetPlan = application.plan;
      listing.billingInterval = application.billingInterval ?? "monthly";
      listing.joinedAt = startedAt;
      listing.lastActiveAt = startedAt;
      listing.monthlyRevenueMinor = 0;
      listing.isPublic = true;
      listing.isProvisioned = true;
      listing.trialEndsAt = trialEndsAt;
      listing.subscriptionStartedAt = startedAt;
      listing.currentPeriodEndsAt = undefined;
      listing.subscriptionStatusReason = organization.subscriptionStatusReason;
      listing.branches = [{ id: branchId, name: branch.name, area: "Amman", address: branch.address, trialSlots: [], internalBranchId: branchId }];
      this.provisionedTenants.set(application.id, { organization, branch, owner, membershipStatus, clerkInvitationId, listingId });
      this.provisionedMockGymIds.add(listing.id);
      this.platformGyms = [...this.platformGyms.filter((item) => item.id !== listing.id), listing];
      application.provisioningStatus = "completed";
      application.provisioningCheckpoint = "completed";
      application.provisioningOutcome = "complete";
      application.provisionedAt = now;
      application.provisionedOrganizationId = organizationId;
      application.provisionedBranchId = branchId;
      application.clerkOrganizationId = clerkOrganizationId;
      application.clerkInvitationId = clerkInvitationId;
      application.clerkInvitationStatus = membershipStatus === "accepted" ? "accepted" : "pending";
      application.provisioningError = undefined;
      application.updatedAt = now;
      this.recordPlatformAudit({
        action: "gym.provisioned",
        entityType: "platform_gym",
        entityPublicId: listing.id,
        entityLabel: listing.name,
        summary: `Provisioned ${listing.name} with a ${application.plan} trial`,
        reason: "Approved gym application provisioned",
        after: { organizationId, branchId, ownerMembershipStatus: membershipStatus, clerkInvitationStatus: application.clerkInvitationStatus },
      });
      return {
        applicationId: application.id,
        status: "completed" as const,
        organizationId: application.provisionedOrganizationId,
        organizationName: application.gymName,
        branchId: application.provisionedBranchId,
        branchName: `${application.gymName} — Main branch`,
        plan: application.plan,
        billingInterval: application.billingInterval ?? "monthly",
        ownerName: application.ownerName,
        ownerEmail: application.email,
        clerkOrganizationId: application.clerkOrganizationId,
        clerkInvitationId: application.clerkInvitationId,
      };
    }).then(async (result) => {
      await Promise.all([
        this.emitPlatformSnapshotSubscribers(),
        this.emitMarketplaceSubscribers(),
        this.emitPlatformGymDetailSubscribers(),
      ]);
      return result;
    }).finally(() => {
      this.provisioningInFlight.delete(input.applicationId);
    });
  }

  async updatePlatformGym(input: UpdatePlatformGymInput): Promise<MarketplaceGym> {
    const result = await this.respond(() => {
      this.requireReason(input.reason);
      const rawInput = input as UpdatePlatformGymInput & Record<string, unknown>;
      if (["trialEndsAt", "subscriptionStartedAt", "cancelledAt"].some((field) => rawInput[field] !== undefined)) {
        throw ApiError.of(ERR.VALIDATION, "Trial, subscription start, and cancellation dates are derived automatically.");
      }
      const gym = this.platformGyms.find((item) => item.id === input.gymId);
      if (!gym) throw ApiError.of(ERR.NOT_FOUND, "Gym not found.");
      const tenant = this.tenantForGym(gym);
      const organization = tenant?.organization ?? (this.isProvisionedGym(gym) ? this.db.organization : undefined);
      if (gym.isArchived || organization?.archivedAt) throw ApiError.of(ERR.CONFLICT, "Archived gyms cannot be changed through the subscription controls.");
      const nextStatus = input.status ?? (organization ? platformStatusForOrganization(organization.status) : gym.subscriptionStatus);
      const persistedStatus = organization ? platformStatusForOrganization(organization.status) : gym.subscriptionStatus;
      if (nextStatus === "trial" && persistedStatus !== "trial") throw ApiError.of(ERR.VALIDATION, "A provisioned gym cannot be moved back into trial; trials start automatically during onboarding.");
      const nextPlan = input.plan ?? organization?.subscriptionPlan ?? this.db.organizationEntitlements.subscriptionPlan ?? gym.rivetPlan;
      if (input.billingInterval !== undefined && input.billingInterval !== "monthly" && input.billingInterval !== "annual") throw ApiError.of(ERR.VALIDATION, "Billing cadence is invalid.");
      const requestedPeriodEndsAtInput = input.currentPeriodEndsAt;
      const requestedPeriodEndsAt = requestedPeriodEndsAtInput === undefined ? undefined : validSubscriptionTimestamp(requestedPeriodEndsAtInput);
      if (requestedPeriodEndsAtInput !== undefined && requestedPeriodEndsAt === undefined) throw ApiError.of(ERR.VALIDATION, "The membership end date must be a valid calendar date.");
      const hasControlChange = input.status !== undefined || input.plan !== undefined || input.billingInterval !== undefined || requestedPeriodEndsAtInput !== undefined || input.isPublic !== undefined;
      if (!hasControlChange) throw ApiError.of(ERR.VALIDATION, "Choose a status, plan, listing, or lifecycle change.");
      if (!organization) {
        if (input.isPublic !== false || input.status !== undefined || input.plan !== undefined || input.billingInterval !== undefined || requestedPeriodEndsAtInput !== undefined) {
          throw ApiError.of(ERR.CONFIGURATION, "This directory row is not linked to a provisioned organization; only hiding it is supported.");
        }
        gym.isPublic = false;
        gym.subscriptionStatus = "suspended";
        gym.trialEndsAt = undefined;
        gym.subscriptionStartedAt = undefined;
        gym.currentPeriodEndsAt = undefined;
        gym.cancelledAt = undefined;
        gym.subscriptionStatusReason = input.reason.trim();
        this.recordPlatformAudit({
          action: "gym.subscription.update",
          entityType: "platform_gym",
          entityPublicId: gym.id,
          entityLabel: gym.name,
          summary: `Hid unprovisioned directory row ${gym.name}`,
          reason: input.reason.trim(),
        });
        return cloneMarketplaceGym(gym);
      }
      if (input.isPublic !== undefined && typeof input.isPublic !== "boolean") throw ApiError.of(ERR.VALIDATION, "Public listing must be a boolean.");

      const nowTimestamp = Date.now();
      const existingBillingInterval = organization?.billingInterval ?? gym.billingInterval ?? "monthly";
      const billingInterval = input.billingInterval ?? existingBillingInterval;
      const storedSubscriptionStartedAt = organization?.subscriptionStartedAt ? Date.parse(organization.subscriptionStartedAt) : undefined;
      const storedTrialEndsAt = organization?.trialEndsAt ? Date.parse(organization.trialEndsAt) : undefined;
      const storedCurrentPeriodEndsAt = organization?.currentPeriodEndsAt ? Date.parse(organization.currentPeriodEndsAt) : undefined;
      const currentStatus = organization ? platformStatusForOrganization(organization.status) : gym.subscriptionStatus;
      const currentPlan = organization?.subscriptionPlan ?? this.db.organizationEntitlements.subscriptionPlan ?? gym.rivetPlan;
      const materialMembershipChange = (input.status !== undefined && nextStatus !== currentStatus)
        || (input.plan !== undefined && input.plan !== currentPlan)
        || (input.billingInterval !== undefined && billingInterval !== existingBillingInterval);
      const periodBoundaryChanged = requestedPeriodEndsAt !== undefined && !sameCalendarDate(requestedPeriodEndsAt, Number.isFinite(storedCurrentPeriodEndsAt) ? storedCurrentPeriodEndsAt : undefined);
      if (nextStatus === "trial" && requestedPeriodEndsAtInput !== undefined) throw ApiError.of(ERR.VALIDATION, "Trial end is fixed automatically from onboarding; do not provide a paid period end date.");
      // Parity with Convex: a material change landing on an active
      // subscription starts a new server-derived paid term today, rolls the
      // unused paid days forward, and issues the term invoice below.
      const startsNewPaidTerm = materialMembershipChange && nextStatus === "active";
      const DAY_MS = 86_400_000;
      const creditDays = startsNewPaidTerm
        && (currentStatus === "active" || currentStatus === "overdue")
        && Number.isFinite(storedCurrentPeriodEndsAt) && storedCurrentPeriodEndsAt! > nowTimestamp
        ? Math.ceil((storedCurrentPeriodEndsAt! - nowTimestamp) / DAY_MS)
        : 0;
      const computedPeriodEndsAt = startsNewPaidTerm
        ? addCalendarMonths(nowTimestamp, billingInterval === "annual" ? 12 : 1) + creditDays * DAY_MS
        : undefined;
      const nextSubscriptionStartedAt = Number.isFinite(storedSubscriptionStartedAt) ? storedSubscriptionStartedAt : PUBLIC_SUBSCRIPTION_STATUSES.has(nextStatus) ? nowTimestamp : undefined;
      const nextTrialEndsAt = nextStatus === "trial" ? (Number.isFinite(storedTrialEndsAt) ? storedTrialEndsAt : nextSubscriptionStartedAt === undefined ? undefined : addCalendarMonths(nextSubscriptionStartedAt, 1)) : storedTrialEndsAt;
      if (nextStatus === "trial" && nextTrialEndsAt !== undefined && nextTrialEndsAt <= nowTimestamp) throw ApiError.of(ERR.VALIDATION, "A trial must end in the future; its end date is derived from onboarding.");
      const selectedPeriodEndsAt = periodBoundaryChanged ? requestedPeriodEndsAt : computedPeriodEndsAt ?? (Number.isFinite(storedCurrentPeriodEndsAt) ? storedCurrentPeriodEndsAt : undefined);
      if ((materialMembershipChange || periodBoundaryChanged) && selectedPeriodEndsAt !== undefined && Number.isFinite(storedSubscriptionStartedAt) && selectedPeriodEndsAt < storedSubscriptionStartedAt!) throw ApiError.of(ERR.VALIDATION, "The membership end date must be on or after the subscription start date.");
      if ((materialMembershipChange || periodBoundaryChanged) && nextStatus === "active" && selectedPeriodEndsAt !== undefined && selectedPeriodEndsAt <= nowTimestamp) throw ApiError.of(ERR.VALIDATION, "An active subscription must end in the future.");
      const nextCurrentPeriodEndsAt = nextStatus === "trial" ? undefined : selectedPeriodEndsAt;
      const nextCancelledAt = nextStatus === "cancelled" ? nowTimestamp : undefined;
      if (nextStatus === "trial" && nextTrialEndsAt === undefined) throw ApiError.of(ERR.CONFIGURATION, "A trial cannot start until its onboarding date is established.");

      const previousStatus = gym.subscriptionStatus;
      const previousPlan = gym.rivetPlan;
      const previousIsPublic = gym.isPublic === true;
      const beforeAudit = { subscriptionStatus: previousStatus, rivetPlan: previousPlan, billingInterval: existingBillingInterval, isPublic: previousIsPublic };
      gym.subscriptionStatus = nextStatus;
      gym.rivetPlan = nextPlan;
      gym.isPublic = PUBLIC_SUBSCRIPTION_STATUSES.has(nextStatus) ? input.isPublic ?? previousIsPublic : false;
      gym.trialEndsAt = nextTrialEndsAt === undefined ? undefined : new Date(nextTrialEndsAt).toISOString();
      gym.subscriptionStartedAt = nextSubscriptionStartedAt === undefined ? undefined : new Date(nextSubscriptionStartedAt).toISOString();
      gym.currentPeriodEndsAt = nextCurrentPeriodEndsAt === undefined ? undefined : new Date(nextCurrentPeriodEndsAt).toISOString();
      gym.cancelledAt = nextCancelledAt === undefined ? undefined : new Date(nextCancelledAt).toISOString();
      gym.billingInterval = billingInterval;
      gym.subscriptionStatusReason = input.reason.trim();
      if (PUBLIC_SUBSCRIPTION_STATUSES.has(nextStatus)) gym.lastActiveAt = nowISO();

      if (organization) {
        const previousModulePlan = organization.subscriptionPlan;
        organization.status = organizationStatusForPlatform(nextStatus);
        organization.subscriptionPlan = nextPlan as T.Organization["subscriptionPlan"];
        organization.billingInterval = billingInterval;
        organization.subscriptionStartedAt = gym.subscriptionStartedAt;
        organization.trialEndsAt = gym.trialEndsAt;
        organization.currentPeriodEndsAt = gym.currentPeriodEndsAt;
        organization.cancelledAt = gym.cancelledAt;
        organization.subscriptionStatusReason = gym.subscriptionStatusReason;
        organization.updatedAt = nowISO();
        const modulePlan = nextPlan as T.WorkspaceModulePlan;
        const catalogPlan = this.platformPlans.find((candidate) => candidate.name === modulePlan);
        const entitledModules = entitledModulesForPlanSelection(modulePlan, catalogPlan?.entitledModules);
        if (!tenant) {
          this.db.organizationEntitlements = {
            ...this.db.organizationEntitlements,
            organizationId: organization.id,
            catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
            subscriptionPlan: modulePlan,
            entitledModules,
            source: "subscription_plan",
            updatedAt: organization.updatedAt,
          };
        }
        // A newly purchased tier is immediately usable. Keep hidden modules
        // in the stored preference row on downgrades so a later upgrade can
        // restore prior operator choices while read-time filtering locks them
        // for the lower tier.
        if (!tenant && input.plan !== undefined && previousModulePlan !== modulePlan) {
          const previousEntitled = previousModulePlan ? entitledModulesForPlanSelection(previousModulePlan, this.platformPlans.find((candidate) => candidate.name === previousModulePlan)?.entitledModules) : [];
          const nextEntitled = entitledModules;
          const newlyEntitled = nextEntitled.filter((module) => !previousEntitled.includes(module));
          if (newlyEntitled.length > 0) {
            let enabledModules: T.WorkspaceModuleKey[];
            try {
              enabledModules = validateWorkspaceModuleSelection([...this.db.workspaceModulePreferences.enabledModules, ...newlyEntitled], nextEntitled);
            } catch {
              enabledModules = defaultWorkspacePreferences(nextEntitled);
            }
            this.db.workspaceModulePreferences = { ...this.db.workspaceModulePreferences, catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION, enabledModules, updatedAt: organization.updatedAt };
          }
        }
      }

      let issuedTermInvoiceId: string | undefined;
      if (startsNewPaidTerm && nextCurrentPeriodEndsAt !== undefined) {
        // Parity with Convex: unpaid subscription-cycle invoices are
        // superseded by the new term; manual invoices (no cycle key) stay.
        const appliedCreditDays = periodBoundaryChanged ? 0 : creditDays;
        const nowIso = new Date(nowTimestamp).toISOString();
        for (const invoice of this.platformInvoices) {
          if (invoice.gymId === gym.id && invoice.cycleKey && ["draft", "open", "past_due", "failed"].includes(invoice.status)) {
            invoice.status = "void";
            invoice.voidedAt = nowIso;
          }
        }
        const priceMinor = this.platformPlans.find((item) => item.name === nextPlan)?.priceMinor ?? 0;
        const amountMinor = billingInterval === "annual" ? Math.round(priceMinor * 12 * 0.8) : priceMinor;
        issuedTermInvoiceId = `INV-${crypto.randomUUID()}`;
        this.platformInvoices.unshift({
          id: issuedTermInvoiceId,
          gymId: gym.id,
          gym: gym.name,
          amountMinor,
          amount: `JOD ${(amountMinor / 1_000).toFixed(3)}`,
          currency: "JOD",
          date: nowIso,
          issuedAt: nowIso,
          dueAt: nowIso,
          periodStart: nowIso,
          periodEnd: new Date(nextCurrentPeriodEndsAt).toISOString(),
          cycleKey: `change:${organization.id}:${nowTimestamp}`,
          billingInterval,
          ...(appliedCreditDays > 0 ? { creditDays: appliedCreditDays } : {}),
          status: "open",
        });
      }

      this.recordPlatformAudit({
        action: "gym.subscription.update",
        entityType: "platform_gym",
        entityPublicId: gym.id,
        entityLabel: gym.name,
        summary: `Updated ${gym.name} subscription: ${previousStatus} → ${nextStatus}${previousPlan === nextPlan ? "" : ` · ${previousPlan} → ${nextPlan}`}${previousIsPublic === gym.isPublic ? "" : ` · public listing ${gym.isPublic ? "enabled" : "suppressed"}`}${issuedTermInvoiceId ? ` · issued ${issuedTermInvoiceId}` : ""}`,
        reason: input.reason.trim(),
        before: beforeAudit,
        after: { subscriptionStatus: gym.subscriptionStatus, rivetPlan: gym.rivetPlan, billingInterval: gym.billingInterval, isPublic: gym.isPublic },
      });
      return cloneMarketplaceGym(gym);
    });
    await Promise.all([this.emitMarketplaceSubscribers(), this.emitPlatformSnapshotSubscribers(), this.emitWorkspaceAccessSubscribers()]);
    return result;
  }

  async archivePlatformGym(input: ArchivePlatformGymInput): Promise<void> {
    await this.respond(() => {
      this.requireReason(input.reason);
      const gym = this.platformGyms.find((item) => item.id === input.gymId);
      if (!gym) throw ApiError.of(ERR.NOT_FOUND, "Gym not found.");
      if (input.confirmation !== gym.name) throw ApiError.of(ERR.VALIDATION, "Type the gym name exactly to confirm archiving.", { fieldErrors: { confirmation: ["Must match the gym name exactly"] } });
      const tenant = this.tenantForGym(gym);
      const organization = tenant?.organization ?? (this.isProvisionedGym(gym) ? this.db.organization : undefined);
      if (gym.isArchived || organization?.archivedAt) throw ApiError.of(ERR.CONFLICT, "This gym is already archived and cannot be changed through the subscription controls.");

      // Archive removes access and public discovery but deliberately leaves
      // the directory row, subscription facts, and audit/financial records in
      // memory so the platform history remains reviewable by the lifecycle
      // worker when it is introduced.
      gym.subscriptionStatus = "suspended";
      gym.isPublic = false;
      gym.subscriptionStatusReason = input.reason.trim();
      gym.isArchived = true;
      gym.archivedAt = nowISO();
      gym.archiveReason = input.reason.trim();
      if (organization) {
        organization.status = "suspended";
        organization.archivedAt = gym.archivedAt;
        organization.archiveReason = input.reason.trim();
        organization.subscriptionStatusReason = input.reason.trim();
        organization.updatedAt = gym.archivedAt;
      }
      this.archivedGymIds.add(gym.id);
      this.recordPlatformAudit({
        action: "gym.archive",
        entityType: "platform_gym",
        entityPublicId: gym.id,
        entityLabel: gym.name,
        summary: `Archived ${gym.name} and removed platform access`,
        reason: input.reason.trim(),
      });
    });
    await Promise.all([this.emitMarketplaceSubscribers(), this.emitPlatformSnapshotSubscribers(), this.emitWorkspaceAccessSubscribers()]);
  }

  async updatePlatformPlan(input: UpdatePlatformPlanInput): Promise<PlatformSaasPlan> {
    const result = await this.respond(() => {
      this.requireReason(input.reason);
      const plan = this.platformPlans.find((item) => item.name === input.name);
      if (!plan) throw ApiError.of(ERR.NOT_FOUND, "Plan not found.");
      const previousEntitled = entitledModulesForPlanSelection(plan.name, plan.entitledModules);
      let entitledModules = entitledModulesForPlanSelection(plan.name, plan.entitledModules);
      if (input.entitledModules !== undefined) {
        try {
          entitledModules = validateWorkspaceModuleSelection(input.entitledModules, allWorkspaceModuleKeys());
        } catch (error) {
          throw ApiError.of(ERR.VALIDATION, error instanceof Error ? error.message : "Workspace capabilities are invalid.");
        }
      }
      if (input.priceMinor !== undefined) plan.priceMinor = Math.max(0, Math.round(input.priceMinor));
      if (input.branches !== undefined) plan.branches = Math.max(1, Math.round(input.branches));
      if (input.staff !== undefined) plan.staff = Math.max(1, Math.round(input.staff));
      if (input.members !== undefined) plan.members = Math.max(1, Math.round(input.members));
      plan.entitledModules = entitledModules;
      if (this.db.organization.subscriptionPlan === plan.name) {
        const previousOrganizationEntitled = this.db.organizationEntitlements.entitledModules;
        this.db.organizationEntitlements = {
          ...this.db.organizationEntitlements,
          catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
          subscriptionPlan: plan.name,
          entitledModules,
          source: "subscription_plan",
          updatedAt: nowISO(),
        };
        const newlyEntitled = entitledModules.filter((module) => !previousOrganizationEntitled.includes(module));
        const candidate = [...this.db.workspaceModulePreferences.enabledModules.filter((module) => entitledModules.includes(module)), ...newlyEntitled];
        try {
          this.db.workspaceModulePreferences = {
            ...this.db.workspaceModulePreferences,
            catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
            enabledModules: validateWorkspaceModuleSelection(candidate, entitledModules),
            updatedAt: nowISO(),
          };
        } catch {
          this.db.workspaceModulePreferences = {
            ...this.db.workspaceModulePreferences,
            catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
            enabledModules: defaultWorkspacePreferences(entitledModules),
            updatedAt: nowISO(),
          };
        }
      }
      this.recordPlatformAudit({
        action: "plan.catalog_update",
        entityType: "platform_plan",
        entityPublicId: plan.name,
        entityLabel: plan.name,
        summary: `Updated ${plan.name} plan catalog limits and capabilities`,
        reason: input.reason.trim(),
        before: { entitledModules: previousEntitled.join(",") },
        after: { entitledModules: entitledModules.join(",") },
      });
      return { ...plan };
    });
    await Promise.all([this.emitPlatformSnapshotSubscribers(), this.emitPublicPlanSubscribers(), this.emitWorkspaceAccessSubscribers()]);
    return result;
  }

  createPlatformInvoice(input: CreatePlatformInvoiceInput): Promise<PlatformBillingInvoice> {
    return this.respond(() => {
      const gym = this.platformGyms.find((item) => item.id === input.gymId);
      if (!gym) throw ApiError.of(ERR.NOT_FOUND, "Gym not found.");
      if (!this.isProvisionedGym(gym)) throw ApiError.of(ERR.CONFIGURATION, "This gym is not linked to a provisioned organization.");
      if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw ApiError.of(ERR.VALIDATION, "Invoice amount must be a positive integer.");
      const periodStart = Date.parse(input.periodStart);
      const periodEnd = Date.parse(input.periodEnd);
      const dueAt = Date.parse(input.dueAt);
      if (![periodStart, periodEnd, dueAt].every(Number.isFinite) || periodEnd < periodStart) throw ApiError.of(ERR.VALIDATION, "Invoice dates are invalid.");
      const currency = input.currency === undefined
        ? "JOD"
        : typeof input.currency === "string"
          ? input.currency.trim().toUpperCase()
          : "";
      if (currency !== "JOD") throw ApiError.of(ERR.VALIDATION, "Platform invoices must use JOD in the MVP.", { fieldErrors: { currency: ["Only JOD is supported"] } });
      const exponent = exponentFor(currency);
      const billingInterval = input.billingInterval ?? this.db.organization.billingInterval ?? gym.billingInterval ?? "monthly";
      if (input.cycleKey) {
        const existing = this.platformInvoices.find((item) => item.gymId === gym.id && item.cycleKey === input.cycleKey && item.status !== "void");
        if (existing) return { ...existing };
      }
      const invoice: PlatformBillingInvoice = {
        id: `INV-${crypto.randomUUID()}`,
        gymId: gym.id,
        gym: gym.name,
        amountMinor: input.amountMinor,
        amount: `${currency} ${(input.amountMinor / 10 ** exponent).toFixed(exponent)}`,
        currency,
        date: "Not issued",
        dueAt: new Date(dueAt).toISOString(),
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        billingInterval,
        cycleKey: input.cycleKey,
        status: "draft",
      };
      this.platformInvoices.unshift(invoice);
      return { ...invoice };
    });
  }

  issuePlatformInvoice(invoiceId: string): Promise<PlatformBillingInvoice> {
    return this.respond(() => {
      const invoice = this.platformInvoices.find((item) => item.id === invoiceId);
      if (!invoice) throw ApiError.of(ERR.NOT_FOUND, "Invoice not found.");
      if (invoice.status !== "draft") throw ApiError.of(ERR.VALIDATION, "Only draft invoices can be issued.");
      invoice.status = "open";
      invoice.issuedAt = nowISO();
      invoice.date = invoice.issuedAt;
      return { ...invoice };
    });
  }

  markPlatformInvoicePastDue(invoiceId: string, reason: string): Promise<PlatformBillingInvoice> {
    return this.respond(() => {
      this.requireReason(reason);
      const invoice = this.platformInvoices.find((item) => item.id === invoiceId);
      if (!invoice) throw ApiError.of(ERR.NOT_FOUND, "Invoice not found.");
      if (invoice.status !== "open") throw ApiError.of(ERR.VALIDATION, "Only an open invoice can be marked past due.");
      invoice.status = "past_due";
      return { ...invoice };
    });
  }

  recordPlatformInvoicePayment(input: RecordPlatformInvoicePaymentInput): Promise<PlatformBillingInvoice> {
    return this.respond(() => {
      this.requireReason(input.reason);
      if (!input.reference.trim()) throw ApiError.of(ERR.VALIDATION, "A payment reference is required.");
      const invoice = this.platformInvoices.find((item) => item.id === input.invoiceId);
      if (!invoice) throw ApiError.of(ERR.NOT_FOUND, "Invoice not found.");
      if (!["open", "past_due", "failed"].includes(invoice.status)) throw ApiError.of(ERR.VALIDATION, "Only an outstanding invoice can be marked paid.");
      const gym = invoice.gymId ? this.platformGyms.find((item) => item.id === invoice.gymId) : undefined;
      if (gym && this.isProvisionedGym(gym) && this.db.organization.archivedAt) throw ApiError.of(ERR.CONFLICT, "Archived gyms cannot be reactivated by recording a subscription payment.");
      invoice.status = "paid";
      invoice.paidAt = input.paidAt ? new Date(input.paidAt).toISOString() : nowISO();
      invoice.paymentReference = input.reference.trim();
      if (gym && this.isProvisionedGym(gym) && invoice.periodEnd) {
        const periodEnd = Date.parse(invoice.periodEnd);
        if (Number.isFinite(periodEnd) && this.db.organization.status !== "cancelled") {
          const startedAt = this.db.organization.subscriptionStartedAt ?? invoice.periodStart ?? nowISO();
          this.db.organization.status = "active";
          this.db.organization.billingInterval = invoice.billingInterval ?? this.db.organization.billingInterval ?? "monthly";
          this.db.organization.subscriptionStartedAt = startedAt;
          this.db.organization.trialEndsAt = undefined;
          this.db.organization.currentPeriodEndsAt = new Date(periodEnd).toISOString();
          this.db.organization.cancelledAt = undefined;
          this.db.organization.subscriptionStatusReason = input.reason.trim();
          gym.subscriptionStatus = "active";
          gym.billingInterval = this.db.organization.billingInterval;
          gym.isPublic = true;
          gym.trialEndsAt = undefined;
          gym.currentPeriodEndsAt = this.db.organization.currentPeriodEndsAt;
          gym.cancelledAt = undefined;
          gym.subscriptionStatusReason = input.reason.trim();
          gym.lastActiveAt = invoice.paidAt;
        }
      }
      return { ...invoice };
    });
  }

  voidPlatformInvoice(invoiceId: string, reason: string): Promise<PlatformBillingInvoice> {
    return this.respond(() => {
      this.requireReason(reason);
      const invoice = this.platformInvoices.find((item) => item.id === invoiceId);
      if (!invoice) throw ApiError.of(ERR.NOT_FOUND, "Invoice not found.");
      if (invoice.status === "paid" || invoice.status === "void") throw ApiError.of(ERR.VALIDATION, "Paid or void invoices cannot be voided.");
      invoice.status = "void";
      invoice.voidedAt = nowISO();
      return { ...invoice };
    });
  }

  listSupportCases(): Promise<PlatformSupportCase[]> {
    return this.respond(() => {
      const actor = this.actor();
      const canViewAll = currentRole(this.db) === "owner" || currentRole(this.db) === "manager";
      return this.platformSupportCases
        .filter((supportCase) => canViewAll || supportCase.creatorId === actor.id)
        .map((supportCase) => ({ ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) }));
    });
  }

  async subscribeSupportCases(onValue: (cases: PlatformSupportCase[]) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try { onValue(await this.listSupportCases()); } catch (error) { onError?.(error); }
    return () => undefined;
  }

  async createSupportCase(input: CreateSupportCaseInput): Promise<PlatformSupportCase> {
    const result = await this.respond(() => {
      if (!input.email.trim() || !input.subject.trim() || !input.body.trim()) throw ApiError.of(ERR.VALIDATION, "Email, subject, and message are required.");
      if (!["normal", "urgent"].includes(input.priority)) throw ApiError.of(ERR.VALIDATION, "Support priority is invalid.");
      if (input.requestType && !["general", "plan_upgrade"].includes(input.requestType)) throw ApiError.of(ERR.VALIDATION, "Support request type is invalid.");
      if (input.requestType === "plan_upgrade" && !["Starter", "Growth", "Pro", "Enterprise"].includes(input.requestedPlan ?? "")) throw ApiError.of(ERR.VALIDATION, "A requested plan is required for upgrade requests.");
      if (input.billingInterval && !["monthly", "annual"].includes(input.billingInterval)) throw ApiError.of(ERR.VALIDATION, "Billing cadence is invalid.");
      const actor = this.actor();
      const createdAt = nowISO();
      const caseId = `SUP-${crypto.randomUUID()}`;
      const supportCase: PlatformSupportCase = {
        id: caseId,
        gymId: this.db.organization.id,
        gym: this.db.organization.name,
        branchId: input.branchId,
        branchName: this.db.branches.find((branch) => branch.id === input.branchId)?.name,
        creatorId: actor.id,
        creatorName: actor.name,
        creatorEmail: input.email.trim().toLowerCase(),
        subject: input.subject.trim(),
        body: input.body.trim(),
        priority: input.priority,
        requestType: input.requestType ?? "general",
        requestedPlan: input.requestType === "plan_upgrade" ? input.requestedPlan : undefined,
        billingInterval: input.requestType === "plan_upgrade" ? input.billingInterval : undefined,
        status: "open",
        createdAt,
        updatedAt: createdAt,
        messages: [{ id: `SUP-MSG-${crypto.randomUUID()}`, caseId, authorType: "gym", authorId: actor.id, authorName: actor.name, body: input.body.trim(), createdAt }],
      };
      this.platformSupportCases.unshift(supportCase);
      return { ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) };
    });
    await this.emitPlatformSnapshotSubscribers();
    return result;
  }

  replyToSupportCase(caseId: string, body: string): Promise<PlatformSupportCase> {
    return this.respond(() => {
      if (!body.trim()) throw ApiError.of(ERR.VALIDATION, "A reply is required.");
      const actor = this.actor();
      const supportCase = this.platformSupportCases.find((item) => item.id === caseId);
      const canViewAll = currentRole(this.db) === "owner" || currentRole(this.db) === "manager";
      if (!supportCase || (!canViewAll && supportCase.creatorId !== actor.id)) throw ApiError.of(ERR.NOT_FOUND, "Support case not found.");
      if (supportCase.status === "resolved") throw ApiError.of(ERR.VALIDATION, "Resolved support cases cannot receive new replies.");
      const createdAt = nowISO();
      supportCase.messages = [...(supportCase.messages ?? []), { id: `SUP-MSG-${crypto.randomUUID()}`, caseId, authorType: "gym", authorId: actor.id, authorName: actor.name, body: body.trim(), createdAt }];
      supportCase.status = "open";
      supportCase.updatedAt = createdAt;
      return { ...supportCase, messages: supportCase.messages.map((message) => ({ ...message })) };
    });
  }

  resolvePlatformSupportCase(caseId: string, resolutionSummary: string): Promise<PlatformSupportCase> {
    return this.respond(() => {
      this.requireReason(resolutionSummary, "resolutionSummary");
      const supportCase = this.platformSupportCases.find((item) => item.id === caseId);
      if (!supportCase) throw ApiError.of(ERR.NOT_FOUND, "Support case not found.");
      supportCase.status = "resolved";
      supportCase.resolutionSummary = resolutionSummary.trim();
      supportCase.resolvedAt = nowISO();
      supportCase.updatedAt = supportCase.resolvedAt;
      return { ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) };
    });
  }

  reopenPlatformSupportCase(caseId: string): Promise<PlatformSupportCase> {
    return this.respond(() => {
      const supportCase = this.platformSupportCases.find((item) => item.id === caseId);
      if (!supportCase) throw ApiError.of(ERR.NOT_FOUND, "Support case not found.");
      if (supportCase.status !== "resolved") throw ApiError.of(ERR.VALIDATION, "Only resolved cases can be reopened.");
      supportCase.status = "open";
      supportCase.resolvedAt = undefined;
      supportCase.resolutionSummary = undefined;
      supportCase.updatedAt = nowISO();
      return { ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) };
    });
  }

  assignPlatformSupportCase(caseId: string, assigneeId?: string): Promise<PlatformSupportCase> {
    return this.respond(() => {
      const supportCase = this.platformSupportCases.find((item) => item.id === caseId);
      if (!supportCase) throw ApiError.of(ERR.NOT_FOUND, "Support case not found.");
      supportCase.assigneeId = assigneeId;
      supportCase.assigneeName = assigneeId ? this.actor().name : undefined;
      supportCase.updatedAt = nowISO();
      return { ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) };
    });
  }

  replyToPlatformSupportCase(caseId: string, body: string): Promise<PlatformSupportCase> {
    return this.respond(() => {
      if (!body.trim()) throw ApiError.of(ERR.VALIDATION, "A reply is required.");
      const supportCase = this.platformSupportCases.find((item) => item.id === caseId);
      if (!supportCase) throw ApiError.of(ERR.NOT_FOUND, "Support case not found.");
      const createdAt = nowISO();
      supportCase.messages = [...(supportCase.messages ?? []), { id: `SUP-MSG-${crypto.randomUUID()}`, caseId, authorType: "platform", authorId: this.actor().id, authorName: this.actor().name, body: body.trim(), createdAt }];
      supportCase.firstResponseAt ??= createdAt;
      supportCase.updatedAt = createdAt;
      supportCase.status = "waiting";
      if (supportCase.creatorId) this.operationalNotifications.unshift({ id: `NOT-${crypto.randomUUID()}`, kind: "support_reply", title: "RIVET replied to your support case", body: supportCase.subject, href: `/support?case=${supportCase.id}`, dedupeKey: `support-reply:${supportCase.id}:${createdAt}`, createdAt, organizationId: this.db.organization.id, branchId: supportCase.branchId, recipientId: supportCase.creatorId });
      return { ...supportCase, messages: supportCase.messages.map((message) => ({ ...message })) };
    });
  }

  listNotifications(): Promise<OperationalNotification[]> {
    return this.respond(() => {
      const actorId = this.actor().id;
      return this.operationalNotifications
        .filter((notification) => notification.recipientId === actorId)
        .map((notification) => ({ ...notification }));
    });
  }

  async subscribeNotifications(onValue: (notifications: OperationalNotification[]) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try { onValue(await this.listNotifications()); } catch (error) { onError?.(error); }
    return () => undefined;
  }

  setNotificationRead(notificationId: string, read: boolean): Promise<OperationalNotification> {
    return this.respond(() => {
      const actorId = this.actor().id;
      const notification = this.operationalNotifications.find((item) => item.id === notificationId && item.recipientId === actorId);
      if (!notification) throw ApiError.of(ERR.NOT_FOUND, "Notification not found.");
      notification.readAt = read ? nowISO() : undefined;
      return { ...notification };
    });
  }

  markAllNotificationsRead(): Promise<void> {
    return this.respond(() => {
      const actorId = this.actor().id;
      const now = nowISO();
      this.operationalNotifications.filter((item) => item.recipientId === actorId).forEach((notification) => { notification.readAt = now; });
    });
  }

  // -------------------------------------------------------------------------
  // infrastructure
  // -------------------------------------------------------------------------

  setBehavior(behavior: Partial<MockBehavior>): void {
    this.behavior = { ...this.behavior, ...behavior };
  }

  getBehavior(): MockBehavior {
    return { ...this.behavior };
  }

  resetDemo(): Promise<void> {
    const role = currentRole(this.db);
    const branch = this.db.session.activeBranchId;
    this.db = buildSeed();
    this.memberImports.clear();
    this.memberImportIdempotency.clear();
    this.publicApplicationIdempotency.clear();
    this.publicApplicationRateLimits.clear();
    this.trialIdempotency.clear();
    this.trialRateLimits.clear();
    this.operationsIdempotency.clear();
    this.mediaAssets.clear();
    this.ptTrainerPhotoAssetIds.clear();
    this.gymApplications = INITIAL_GYM_APPLICATIONS.map((application) => ({ ...application }));
    this.platformGyms = initialPlatformGyms(this.db.organization);
    this.provisionedMockGymIds = new Set([PROVISIONED_MOCK_GYM_ID]);
    this.provisionedTenants.clear();
    this.archivedGymIds.clear();
    this.platformAuditEvents = [];
    this.platformPlans = MOCK_SAAS_PLANS.map((plan) => ({ ...plan }));
    this.platformInvoices = MOCK_INVOICES.map((invoice) => ({ ...invoice }));
    this.platformSupportCases = MOCK_SUPPORT_CASES.map((supportCase) => ({ ...supportCase, messages: supportCase.messages?.map((message) => ({ ...message })) }));
    this.operationalNotifications = [];
    this.trialBookings = INITIAL_TRIAL_BOOKINGS.map((booking) => ({ ...booking }));
    this.membershipSaleIdempotency.clear();
    this.membershipTransferIdempotency.clear();
    this.ptTrainers = [];
    this.ptPackages = [];
    this.ptRules = [];
    this.ptExceptions = [];
    this.ptEntitlements = [];
    this.ptBookings = [];
    this.ptOrders = [];
    this.operationalEmailKinds = [];
    this.operationalEmailUpdate = undefined;
    const trainer = this.db.users.find((user) => user.role === "trainer" && user.status === "active");
    if (trainer) {
      const createdAt = nowISO();
      const profileId = mockUuid();
      this.ptTrainers = [{ id: profileId, organizationId: this.db.organization.id, userId: trainer.id, displayName: trainer.name, specialties: ["Strength", "Mobility"], languages: ["en", "ar"], branchIds: trainer.branchScope === "all" ? this.db.branches.map((branch) => branch.id) : trainer.branchIds, status: "published", createdAt, updatedAt: createdAt }];
      this.ptRules = this.ptTrainers[0]!.branchIds.flatMap((branchId) => (["sun", "mon", "tue", "wed", "thu"] as T.WeekdayKey[]).map((weekday) => ({ id: mockUuid(), trainerProfileId: profileId, branchId, weekday, startMinute: 8 * 60, endMinute: 17 * 60, active: true })));
    }
    this.ptPackages = ([
      [12, 240_000, 90],
      [20, 300_000, 120],
      [30, 400_000, 180],
    ] as const).map(([sessionCount, amount, validityDays]) => ({ id: mockUuid(), organizationId: this.db.organization.id, name: `${sessionCount} PT sessions`, sessionCount, totalPrice: money(amount), validityDays, branchAccess: "all", branchIds: [], status: "active", createdAt: nowISO(), updatedAt: nowISO() }));
    const listing = this.platformGyms[0];
    this.gymPublicProfile = { organizationId: this.db.organization.id, version: 1, status: "published", shortName: listing?.shortName ?? this.db.organization.name.slice(0, 12), taglineEn: listing?.tagline ?? "", descriptionEn: listing?.description ?? "", category: listing?.category ?? "Gym", audience: listing?.audience ?? "All members", amenities: listing?.amenities ?? [], accentColor: listing?.accent ?? "#15140f", gallery: [], trainers: this.ptTrainers.filter((item) => item.status === "published").map((item) => this.ptTrainerView(item)), ptPackages: this.ptPackages.filter((item) => item.status === "active"), publishedAt: nowISO(), updatedAt: nowISO() };
    this.gymProfileVersions = [{ id: mockUuid(), organizationId: this.db.organization.id, version: 1, status: "published", profile: { ...this.gymPublicProfile }, publishedAt: this.gymPublicProfile.publishedAt, updatedAt: this.gymPublicProfile.updatedAt }];
    // keep the persona the reviewer is using
    const userForRole = this.db.users.find((u) => u.role === role && u.status === "active");
    if (userForRole) this.db.session.userId = userForRole.id;
    this.db.session.activeBranchId = branch;
    return Promise.all([this.emitMarketplaceSubscribers(), this.emitPlatformSnapshotSubscribers(), this.emitWorkspaceAccessSubscribers()]).then(() => undefined);
  }

  private async respond<R>(fn: () => R | Promise<R>): Promise<R> {
    const latency = this.behavior.latencyMs;
    if (latency > 0) await new Promise((r) => setTimeout(r, latency));
    if (this.behavior.failNextRequest) {
      this.behavior.failNextRequest = false;
      throw ApiError.of(ERR.FORCED_FAILURE, "Simulated failure (demo controls). Disable “Fail next request” and retry.");
    }
    return await fn();
  }

  private async subscribeOnce<R>(load: () => Promise<R>, onValue: (value: R) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try { onValue(await load()); } catch (error) { onError?.(error); }
    return () => undefined;
  }

  private async emitMarketplaceSubscribers(): Promise<void> {
    if (this.marketplaceSubscribers.size === 0) return;
    try {
      const gyms = await this.listMarketplaceGyms();
      for (const onValue of this.marketplaceSubscribers.keys()) onValue(gyms);
    } catch (error) {
      for (const onError of this.marketplaceSubscribers.values()) onError?.(error);
    }
  }

  private async emitPlatformSnapshotSubscribers(): Promise<void> {
    if (this.platformSnapshotSubscribers.size === 0) return;
    try {
      const snapshot = await this.getPlatformSnapshot();
      for (const onValue of this.platformSnapshotSubscribers.keys()) onValue(snapshot);
    } catch (error) {
      for (const onError of this.platformSnapshotSubscribers.values()) onError?.(error);
    }
  }

  private async emitPlatformGymDetailSubscribers(): Promise<void> {
    await Promise.all([...this.platformGymDetailSubscribers.entries()].map(async ([onValue, subscription]) => {
      try {
        onValue(await this.getPlatformGymDetail(subscription.gymId));
      } catch (error) {
        subscription.onError?.(error);
      }
    }));
  }

  private async emitPublicPlanSubscribers(): Promise<void> {
    if (this.publicPlanSubscribers.size === 0) return;
    try {
      const plans = this.platformPlans.map((plan) => ({ ...plan }));
      for (const onValue of this.publicPlanSubscribers.keys()) onValue(plans);
    } catch (error) {
      for (const onError of this.publicPlanSubscribers.values()) onError?.(error);
    }
  }

  private async emitWorkspaceAccessSubscribers(): Promise<void> {
    if (this.workspaceAccessSubscribers.size === 0) return;
    try {
      const access = await this.getWorkspaceAccess();
      for (const onValue of this.workspaceAccessSubscribers.keys()) onValue(access);
    } catch (error) {
      for (const onError of this.workspaceAccessSubscribers.values()) onError?.(error);
    }
  }

  private recordPlatformAudit(input: Omit<MockPlatformAuditEvent, "id" | "actorName" | "occurredAt">): void {
    this.platformAuditEvents.unshift({
      ...input,
      id: mockUuid(),
      actorName: this.actor().name,
      occurredAt: nowISO(),
    });
  }

  private today(): string {
    return todayISODate(TZ);
  }

  /**
   * Sensitive adjustments are auditable only if the reason is real. Enforced
   * here, not just in the dialogs, so the audit trail can never hold a blank.
   */
  private requireReason(reason: string | undefined, field = "reason") {
    if (!reason || !reason.trim()) {
      throw ApiError.of(ERR.VALIDATION, "A reason is required for this action.", {
        fieldErrors: { [field]: ["Required"] },
      });
    }
  }

  private require(permission: Permission) {
    const role = currentRole(this.db);
    const perms = permissionsFor(this.db, role);
    if (!perms.includes(permission)) {
      throw ApiError.of(ERR.FORBIDDEN, `Your role (${role}) is missing the “${permission}” permission.`);
    }
  }

  private requireOwner() {
    if (currentRole(this.db) !== "owner") {
      throw ApiError.of(ERR.FORBIDDEN, "Only an organization owner can change workspace module preferences.");
    }
  }

  private requireOwnerOrManager() {
    const role = currentRole(this.db);
    if (role !== "owner" && role !== "manager") throw ApiError.of(ERR.FORBIDDEN, "Only an organization owner or manager can manage zones.");
  }

  private requireOperations() {
    const status = this.workspaceAccess().modules.find((module) => module.key === "operations");
    if (!status?.entitled || !status.enabled) throw ApiError.of(ERR.FEATURE_NOT_AVAILABLE, "The operations workspace module is not enabled for this organization.");
  }

  private requireOperationsRead() {
    this.requireOperations();
    this.require("members.read");
  }

  private requireOperationsWrite() {
    // Writes are governed by the dedicated write permission. Do not make a
    // manager's unrelated member-directory read permission an accidental
    // prerequisite for operations mutations.
    this.requireOperations();
    this.require("operations.manage");
    this.requireOwnerOrManager();
  }

  private requireFinanceModule() {
    const status = this.workspaceAccess().modules.find((module) => module.key === "finance");
    if (!status?.entitled || !status.enabled) throw ApiError.of(ERR.FEATURE_NOT_AVAILABLE, "The finance workspace module is not enabled for this organization.");
  }

  private requireFinanceRead() {
    this.requireFinanceModule();
    this.require("reports.financial.read");
  }

  private requireReportingRead() {
    const status = this.workspaceAccess().modules.find((module) => module.key === "reporting");
    if (!status?.entitled || !status.enabled) throw ApiError.of(ERR.FEATURE_NOT_AVAILABLE, "The reporting workspace module is not enabled for this organization.");
    this.require("reports.financial.read");
  }

  private requireAccountingPosting() {
    // Posting is a write boundary, not a financial-report read. Keep it
    // aligned with Convex so a deliberately scoped posting role need not also
    // hold the unrelated reports.financial.read permission.
    this.requireFinanceModule();
    this.require("accounting.post");
    this.requireOwnerOrManager();
  }

  private requireAccountingOwner() {
    this.requireFinanceModule();
    this.requireOwner();
  }

  private accountingPeriodFor(date = this.today()): T.AccountingPeriod {
    const id = date.slice(0, 7);
    const existing = this.accountingPeriods.find((period) => period.id === id);
    if (existing) {
      if (existing.status === "closed") throw ApiError.of(ERR.CONFLICT, "The accounting period is closed.");
      return existing;
    }
    const start = `${id}-01`;
    const [year = 0, month = 0] = id.split("-").map(Number);
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const period: T.AccountingPeriod = { id, organizationId: this.db.organization.id, periodStart: start, periodEnd: end, status: "open", createdAt: nowISO(), updatedAt: nowISO() };
    this.accountingPeriods.push(period);
    return period;
  }

  private accountingBranch(branchId?: T.UUID): T.Branch | undefined {
    if (!branchId) return undefined;
    const branch = this.db.branches.find((candidate) => candidate.id === branchId && candidate.status === "active");
    if (!branch || !this.branchIsVisible(branch.id)) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
    return branch;
  }

  private immutableAccountingStatus(sourceType: T.AccountingSourceType, sourceId: T.UUID): Extract<T.AccountingSourceStatus, "posted" | "reversed"> | undefined {
    const source = this.accountingSources.find((row) => row.sourceType === sourceType && row.sourceId === sourceId);
    return source?.status === "posted" || source?.status === "reversed" ? source.status : undefined;
  }

  private rejectImmutableAccountingMutation(entityLabel: string, status: Extract<T.AccountingSourceStatus, "posted" | "reversed">): never {
    throw ApiError.of(ERR.CONFLICT, `${entityLabel} is ${status} in accounting and its source facts are immutable. Reverse the posting and create a new version before changing source fields.`);
  }

  private accountingAccount(accountId: T.UUID): T.AccountingAccount {
    const account = this.accountingAccounts.find((candidate) => candidate.id === accountId || candidate.code === accountId);
    if (!account || !account.active) throw ApiError.of(ERR.NOT_FOUND, "Accounting account not found.");
    return account;
  }

  private accountingEntry(entryId: T.UUID): T.AccountingJournalEntryDetail {
    const entry = this.accountingEntries.find((candidate) => candidate.id === entryId);
    if (!entry || !this.accountingBranchIsVisible(entry.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Journal entry not found.");
    return entry;
  }

  private operationsBranch(id: T.UUID): T.Branch {
    const branch = this.db.branches.find((candidate) => candidate.id === id && candidate.status === "active");
    if (!branch || !this.branchIsVisible(branch.id)) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
    return branch;
  }

  private operationsTransferBranch(id: T.UUID): T.Branch {
    const branch = this.db.branches.find((candidate) => candidate.id === id);
    if (!branch || !this.branchIsVisible(branch.id)) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
    return branch;
  }

  private operationsZone(branchId: T.UUID, zoneId: T.UUID): T.Zone {
    const zone = this.db.zones.find((candidate) => candidate.id === zoneId && candidate.branchId === branchId && candidate.status === "active");
    if (!zone || !this.branchIsVisible(branchId)) throw ApiError.of(ERR.NOT_FOUND, "Zone not found.");
    return zone;
  }

  private operationsIdempotent(operation: string, key: string, signature: string): unknown | undefined {
    const existing = this.operationsIdempotency.get(`${operation}:${key}`);
    if (!existing) return undefined;
    if (existing.expiresAt !== undefined && existing.expiresAt <= Date.now()) {
      this.operationsIdempotency.delete(`${operation}:${key}`);
      return undefined;
    }
    if (existing.signature !== signature) throw ApiError.of(ERR.CONFLICT, "This idempotency key was already used for a different request.");
    return existing.result;
  }

  private actor() {
    return currentUser(this.db);
  }

  /**
   * Resolve PT order ownership and branch scope before idempotent replays.
   * Mock mode mirrors Convex: a known key is not an authorization token, but
   * an already-created order may still be replayed after its branch is
   * deactivated. New mutations request the active-branch variant below.
   */
  private ptMembershipScope(membershipId: T.UUID, memberId?: T.UUID, requireActive = false) {
    const membership = this.db.memberships.find((candidate) => candidate.id === membershipId && candidate.organizationId === this.db.organization.id);
    if (!membership || (memberId && membership.memberId !== memberId)) throw ApiError.of(ERR.NOT_FOUND, "PT package order not found.");
    const branch = this.db.branches.find((candidate) => candidate.id === membership.homeBranchId && candidate.organizationId === this.db.organization.id);
    if (!branch) throw ApiError.of(ERR.NOT_FOUND, "PT package order branch not found.");
    if (!this.branchIsVisible(branch.id)) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this branch.");
    if (requireActive && branch.status !== "active") throw ApiError.of(ERR.NOT_FOUND, "PT package order branch not found.");
    return { membership, branch };
  }

  private ptOrderScope(order: T.PtPackageOrder, requireActive = false) {
    if (order.organizationId !== this.db.organization.id) throw ApiError.of(ERR.NOT_FOUND, "PT package order not found.");
    const charge = this.db.charges.find((candidate) => candidate.id === order.chargeId && candidate.organizationId === this.db.organization.id && candidate.memberId === order.memberId);
    if (!charge?.membershipId) throw ApiError.of(ERR.NOT_FOUND, "PT package order not found.");
    const scope = this.ptMembershipScope(charge.membershipId, order.memberId, requireActive);
    if (charge.membershipId !== scope.membership.id) throw ApiError.of(ERR.NOT_FOUND, "PT package order not found.");
    return { ...scope, charge };
  }

  private marketingPreferenceFor(input: { marketingOptIn?: boolean; marketingPreferenceSource?: T.MarketingPreferenceSource }, fallbackOptedIn = true): T.MarketingPreference {
    const optedIn = input.marketingOptIn === undefined ? fallbackOptedIn : input.marketingOptIn !== false;
    const source = input.marketingPreferenceSource ?? (input.marketingOptIn === undefined ? "system_default" : "staff_selected");
    return {
      optedIn,
      source,
      changedAt: nowISO(),
      changedById: source === "system_default" ? undefined : this.actor().id,
      wordingVersion: MARKETING_WORDING_VERSION,
    };
  }

  private branchScopedBranchId(requested?: T.UUID): T.UUID | undefined {
    // Resolve a read scope without silently moving a request to the first
    // branch. Organization-wide actors intentionally get `undefined` when no
    // branch is requested: that is the explicit All branches read-only view.
    // Selected-branch actors may use their existing active selection, or the
    // only branch they can access. Multiple accessible branches require an
    // explicit choice.
    const user = this.actor();
    const requestedBranch = requested?.trim();
    if (requestedBranch) {
      const branch = this.db.branches.find((candidate) => candidate.id === requestedBranch);
      if (!branch || branch.status !== "active") throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
      if (!this.branchIsVisible(requestedBranch)) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this branch.");
      return requestedBranch;
    }
    if (user.branchScope === "all") return undefined;

    const visibleBranches = this.db.branches.filter((branch) => branch.status === "active" && user.branchIds.includes(branch.id));
    const activeSelection = this.db.session.activeBranchId;
    if (activeSelection) {
      if (!visibleBranches.some((branch) => branch.id === activeSelection)) throw ApiError.of(ERR.NOT_FOUND, "The selected branch is no longer available.");
      return activeSelection;
    }
    if (visibleBranches.length === 1) return visibleBranches[0]!.id;
    if (visibleBranches.length > 1) throw ApiError.of(ERR.ORGANIZATION_SELECTION_REQUIRED, "Select a branch before continuing.");
    throw ApiError.of(ERR.NOT_FOUND, "No active branch is available.");
  }

  private branchIsVisible(branchId?: T.UUID): boolean {
    const user = this.actor();
    return user.branchScope === "all" || !branchId || user.branchIds.includes(branchId);
  }

  /**
   * Ledger/report rows use stricter visibility than ordinary branch-scoped
   * records: a missing branch means consolidated or unattributed financial
   * data, which is organization-wide and must not be exposed to a selected
   * branch actor.
   */
  private accountingBranchIsVisible(branchId?: T.UUID): boolean {
    const user = this.actor();
    return user.branchScope === "all" || Boolean(branchId && user.branchIds.includes(branchId));
  }

  private accountingSourceAttemptView(attempt: MockAccountingSourceAttempt): T.AccountingSourcePosting {
    if (!this.accountingBranchIsVisible(attempt.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Accounting source posting not found.");
    return {
      id: attempt.sourcePostingId ?? attempt.id,
      organizationId: this.db.organization.id,
      sourceType: attempt.sourceType,
      sourceId: attempt.sourceId,
      branchId: attempt.branchId,
      status: attempt.status,
      amount: attempt.amount ? { ...attempt.amount } : undefined,
      currency: attempt.currency,
      policyCode: attempt.policyCode,
      policyVersion: attempt.policyVersion,
      journalEntryId: undefined,
      idempotencyKey: attempt.idempotencyKey,
      reason: attempt.reason,
      details: attempt.details ? { ...attempt.details } : undefined,
      occurredAt: attempt.occurredAt,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt,
    };
  }

  private audit(input: Omit<T.AuditEvent, "id" | "organizationId" | "correlationId" | "occurredAt" | "actorId" | "actorName" | "actorRole">) {
    const actor = this.actor();
    const event: T.AuditEvent = {
      ...input,
      id: mockUuid(),
      organizationId: this.db.organization.id,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      correlationId: `mock-${mockUuid()}`,
      occurredAt: nowISO(),
    };
    this.db.audits.unshift(event);
    return event;
  }

  private activity(input: Omit<T.TimelineEvent, "id" | "organizationId" | "occurredAt"> & { occurredAt?: string }) {
    const event: T.TimelineEvent = {
      ...input,
      id: mockUuid(),
      organizationId: this.db.organization.id,
      occurredAt: input.occurredAt ?? nowISO(),
    };
    this.db.activities.unshift(event);
    return event;
  }

  // -------------------------------------------------------------------------
  // mappers
  // -------------------------------------------------------------------------

  private membershipStatusOf(m: MembershipRecord): T.MembershipEffectiveStatus {
    return deriveMembershipStatus(
      {
        cancelledAt: m.cancelledAt,
        activeFreeze: m.activeFreeze,
        startDate: m.startDate,
        endDate: m.endDate,
        remainingVisits: m.remainingVisits,
        totalVisits: m.totalVisits,
      },
      this.today(),
    );
  }

  private currentMembership(memberId: T.UUID): MembershipRecord | undefined {
    const terms = this.db.memberships.filter((m) => m.memberId === memberId);
    if (terms.length === 0) return undefined;
    const rank: Record<T.MembershipEffectiveStatus, number> = { active: 0, expiring: 0, frozen: 0, depleted: 1, scheduled: 2, expired: 3, cancelled: 4 };
    return terms.sort((a, b) => rank[this.membershipStatusOf(a)] - rank[this.membershipStatusOf(b)] || b.endDate.localeCompare(a.endDate))[0];
  }

  private outstandingForMember(memberId: T.UUID): T.Money {
    const total = this.db.charges
      .filter((c) => c.memberId === memberId)
      .reduce((s, c) => s + collectibleOutstandingMinor(c, this.today()), 0);
    return money(total);
  }

  private chargeProjection(charge: T.Charge | undefined): T.Charge | undefined {
    if (!charge) return undefined;
    return {
      ...charge,
      issueDate: charge.issueDate ?? charge.createdAt.slice(0, 10),
      dueDate: charge.dueDate ?? charge.issueDate ?? charge.createdAt.slice(0, 10),
      collectible: chargeIsCollectible(charge, this.today()),
    };
  }

  private toMemberSummary(m: MemberRecord): T.MemberSummary {
    const current = this.currentMembership(m.id);
    const plan = current ? this.db.plans.find((p) => p.id === current.planId) : undefined;
    const lastCheckIn = this.db.checkIns.find((c) => c.memberId === m.id && c.decision !== "blocked");
    return {
      id: m.id,
      memberNumber: m.memberNumber,
      fullName: m.fullName,
      fullNameAr: m.fullNameAr,
      phone: m.phone,
      email: m.email,
      homeBranchId: m.homeBranchId,
      status: m.status,
      tags: m.tags,
      membershipStatus: current ? this.membershipStatusOf(current) : undefined,
      currentPlanName: plan?.name,
      membershipEndDate: current?.endDate,
      outstanding: this.outstandingForMember(m.id),
      outstandingCharges: this.db.charges
        .filter((charge) => charge.memberId === m.id && collectibleOutstandingMinor(charge, this.today()) > 0)
        .map((charge) => this.chargeProjection(charge)!),
      lastCheckInAt: lastCheckIn?.occurredAt,
      createdAt: m.createdAt,
    };
  }

  private toMemberDetail(m: MemberRecord, viewerPerms?: string[]): T.MemberDetail {
    const perms = viewerPerms ?? permissionsFor(this.db, currentRole(this.db));
    const summary = this.toMemberSummary(m);
    const checkIns30 = this.db.checkIns.filter(
      (c) => c.memberId === m.id && c.decision !== "blocked" && daysFromToday(c.occurredAt.slice(0, 10)) >= -30,
    ).length;
    const allCheckIns = this.db.checkIns.filter((c) => c.memberId === m.id && c.decision !== "blocked");
    const lifetime = this.db.payments
      .filter((p) => p.memberId === m.id && p.status !== "voided")
      .reduce((s, p) => s + p.amount.amount, 0);
    const last = allCheckIns[0];
    return {
      ...summary,
      gender: m.gender,
      dateOfBirth: m.dateOfBirth,
      preferredLanguage: m.preferredLanguage,
      emergencyContactName: m.emergencyContactName,
      emergencyContactRelationship: m.emergencyContactRelationship,
      emergencyContactPhone: m.emergencyContactPhone,
      addressLine1: m.addressLine1,
      city: m.city,
      customerProfileId: m.customerProfileId,
      customerProfileSyncedAt: m.customerProfileSyncedAt,
      source: m.source,
      assignedSalespersonId: m.assignedSalespersonId,
      marketingOptIn: m.marketingOptIn,
      marketingPreference: m.marketingPreference ?? { optedIn: m.marketingOptIn, source: "system_default", wordingVersion: "legacy-boolean" },
      notes: m.notes,
      sensitiveNotes: perms.includes("members.sensitive_notes.read") ? m.sensitiveNotes : undefined,
      archivedAt: m.archivedAt,
      stats: {
        checkInsLast30Days: checkIns30,
        totalCheckIns: allCheckIns.length,
        lifetimeValue: money(lifetime),
        outstanding: summary.outstanding,
        daysSinceLastCheckIn: last ? Math.max(0, -daysFromToday(last.occurredAt.slice(0, 10))) : undefined,
      },
    };
  }

  private toMembership(record: MembershipRecord): T.Membership {
    return {
      id: record.id,
      organizationId: record.organizationId,
      memberId: record.memberId,
      planId: record.planId,
      homeBranchId: record.homeBranchId,
      startDate: record.startDate,
      endDate: record.endDate,
      status: this.membershipStatusOf(record),
      totalVisits: record.totalVisits,
      remainingVisits: record.remainingVisits,
      salePrice: record.salePrice,
      discount: record.discount,
      discountReason: record.discountReason,
      discountApprovalStatus: record.discountApprovalStatus,
      paymentStatus: this.paymentStatusForMembership(record),
      soldById: record.soldById,
      previousMembershipId: record.previousMembershipId,
      frozenDaysUsed: record.frozenDaysUsed,
      activeFreeze: record.activeFreeze,
      cancelledAt: record.cancelledAt,
      cancellationReason: record.cancellationReason,
      createdAt: record.createdAt,
    };
  }

  private paymentStatusForMembership(record: MembershipRecord): T.PaymentStatus {
    const charge = this.db.charges.find((c) => c.membershipId === record.id);
    return charge?.status ?? "unpaid";
  }

  private toMembershipSummary(record: MembershipRecord): T.MembershipSummary {
    const member = this.db.members.find((m) => m.id === record.memberId);
    const plan = this.db.plans.find((p) => p.id === record.planId);
    const branch = this.db.branches.find((b) => b.id === record.homeBranchId);
    const charge = this.db.charges.find((c) => c.membershipId === record.id);
    return {
      ...this.toMembership(record),
      memberName: member?.fullName ?? "Unknown member",
      memberNumber: member?.memberNumber ?? "—",
      planName: plan?.name ?? "Unknown plan",
      branchName: branch?.name ?? "—",
      planFreezeAllowanceDays: plan?.freezeAllowanceDays ?? 0,
      outstanding: charge && chargeIsCollectible(charge, this.today()) ? charge.outstandingAmount : zeroMoney(),
      upcomingAmount: charge && !chargeIsCollectible(charge, this.today()) && charge.status !== "void" && charge.status !== "refunded" ? charge.outstandingAmount : zeroMoney(),
    };
  }

  private toPlan(plan: T.MembershipPlan): T.MembershipPlan {
    const activeSubscribers = this.db.memberships.filter((m) => {
      if (m.planId !== plan.id) return false;
      const s = this.membershipStatusOf(m);
      return s === "active" || s === "expiring" || s === "frozen";
    }).length;
    return { ...plan, includedPtSessions: plan.includedPtSessions ?? 0, activeSubscribers };
  }

  private ensureIncludedPtEntitlement(membershipId: T.UUID): T.PtEntitlement | undefined {
    const existing = this.ptEntitlements.find((item) => item.membershipId === membershipId && item.source === "included");
    if (existing) return existing;
    const membership = this.db.memberships.find((item) => item.id === membershipId);
    if (!membership) return undefined;
    const plan = this.db.plans.find((item) => item.id === membership.planId);
    const sessions = plan?.includedPtSessions ?? 0;
    if (sessions <= 0) return undefined;
    const now = nowISO();
    const entitlement: T.PtEntitlement = { id: mockUuid(), organizationId: this.db.organization.id, memberId: membership.memberId, source: "included", membershipId, granted: sessions, reserved: 0, consumed: 0, revoked: 0, available: sessions, expiresAt: `${membership.endDate}T23:59:59.999Z`, status: "active", createdAt: now, updatedAt: now };
    this.ptEntitlements.push(entitlement);
    this.activity({ memberId: membership.memberId, type: "pt_credit_granted", title: `${sessions} included PT session${sessions === 1 ? "" : "s"} granted`, meta: { membershipId, entitlementId: entitlement.id } });
    return entitlement;
  }

  private ptBookingView(booking: T.PtBooking): T.PtBooking {
    return { ...booking };
  }

  private toLeadSummary(lead: T.Lead): T.LeadSummary {
    const owner = lead.ownerId ? this.db.users.find((u) => u.id === lead.ownerId) : undefined;
    const branch = this.db.branches.find((b) => b.id === lead.branchId);
    const attempts = this.db.activities.filter((a) => a.leadId === lead.id && a.type === "call_attempt");
    const last = attempts[0];
    const open = lead.stage !== "won" && lead.stage !== "lost";
    return {
      ...lead,
      ownerName: owner?.name,
      branchName: branch?.name ?? "—",
      lastContactOutcome: last?.meta?.outcome ? String(last.meta.outcome) : undefined,
      lastContactAt: last?.occurredAt,
      overdue: open && Boolean(lead.nextFollowUpAt && lead.nextFollowUpAt < nowISO()),
    };
  }

  private retailPaymentProjection(sale: T.RetailSale): T.RetailPayment {
    return {
      id: `retail-payment-${sale.id}`,
      organizationId: sale.organizationId,
      branchId: sale.branchId,
      type: "retail_sale",
      customer: sale.customer,
      amount: { ...sale.total },
      method: sale.method,
      status: sale.status,
      refundedAmount: sale.refundedAmount ? { ...sale.refundedAmount } : undefined,
      refundReason: sale.refundReason,
      voidReason: sale.voidReason,
      receiptId: sale.receiptId,
      receiptNumber: sale.receiptNumber,
      collectedById: sale.createdById,
      collectedByName: sale.createdByName,
      shiftId: sale.shiftId,
      externalReference: sale.externalReference,
      idempotencyKey: sale.idempotencyKey,
      occurredAt: sale.createdAt,
    };
  }

  /**
   * Derive a conservative moving-average cost from branch movement facts.
   * Product master data intentionally contains only the customer-facing
   * selling price; purchase receipt movements are the cost source. Unknown
   * units keep checkout/accounting truthful by leaving the cost snapshot
   * unset instead of inventing a supplier cost.
   */
  private retailInventoryCostBasis(branchId: T.UUID, productId: T.UUID): T.Money | undefined {
    const movements = this.db.stockMovements
      .filter((movement) => movement.branchId === branchId && movement.productId === productId)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
    let quantity = 0;
    let unpricedQuantity = 0;
    let knownCostMinor = 0;
    for (const movement of movements) {
      const delta = movement.quantityDelta;
      if (!Number.isSafeInteger(delta) || delta === 0) continue;
      if (delta > 0) {
        const unitCost = movement.unitCost;
        const exactCost = movement.totalCost;
        const exactPriced = exactCost && exactCost.currency === this.db.organization.currency && Number.isSafeInteger(exactCost.amount) && exactCost.amount >= 0;
        const priced = unitCost && unitCost.currency === this.db.organization.currency && Number.isSafeInteger(unitCost.amount) && unitCost.amount >= 0;
        if (exactPriced && Number.isSafeInteger(knownCostMinor + exactCost.amount)) knownCostMinor += exactCost.amount;
        else if (priced && Number.isSafeInteger(delta * unitCost.amount)) knownCostMinor += delta * unitCost.amount;
        else unpricedQuantity += delta;
        quantity += delta;
        continue;
      }
      const outgoing = Math.min(quantity, Math.abs(delta));
      const pricedQuantityBefore = quantity - unpricedQuantity;
      const unpricedUsed = Math.min(unpricedQuantity, outgoing);
      unpricedQuantity -= unpricedUsed;
      const pricedUsed = outgoing - unpricedUsed;
      const exactOutgoing = movement.totalCost && movement.totalCost.currency === this.db.organization.currency && Number.isSafeInteger(movement.totalCost.amount) && movement.totalCost.amount >= 0;
      if (exactOutgoing && pricedUsed === outgoing) knownCostMinor = Math.max(0, knownCostMinor - movement.totalCost!.amount);
      else if (pricedUsed > 0 && pricedQuantityBefore > 0) {
        knownCostMinor = Math.max(0, knownCostMinor - Math.round((knownCostMinor / pricedQuantityBefore) * pricedUsed));
      }
      quantity = Math.max(0, quantity - outgoing);
    }
    if (quantity <= 0 || unpricedQuantity > 0 || !Number.isSafeInteger(knownCostMinor) || knownCostMinor < 0) return undefined;
    const amount = Math.round(knownCostMinor / quantity);
    return Number.isSafeInteger(amount) && amount >= 0 ? money(amount, this.db.organization.currency) : undefined;
  }

  private toTransaction(p: T.Payment | T.RetailPayment): T.TransactionSummary {
    const memberId = "memberId" in p ? p.memberId : p.customer.kind === "member" ? p.customer.memberId : undefined;
    const member = memberId ? this.db.members.find((m) => m.id === memberId) : undefined;
    const branch = this.db.branches.find((b) => b.id === p.branchId);
    if ("customer" in p) {
      return { ...p, memberName: p.customer.fullName, memberNumber: p.customer.memberNumber ?? (p.customer.kind === "guest" ? "Guest" : "—"), branchName: branch?.name ?? "—" };
    }
    return { ...p, memberName: member?.fullName ?? "—", memberNumber: member?.memberNumber ?? "—", branchName: branch?.name ?? "—" };
  }

  private matchesSearch(haystack: Array<string | undefined>, search?: string): boolean {
    if (!search) return true;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const normalized = q.replace(/[\s-]/g, "");
    return haystack.some((h) => {
      if (!h) return false;
      const s = h.toLowerCase();
      return s.includes(q) || s.replace(/[\s-]/g, "").includes(normalized);
    });
  }

  private maybeEmpty<I>(items: I[]): I[] {
    return this.behavior.forceEmptyLists ? [] : items;
  }

  // -------------------------------------------------------------------------
  // session
  // -------------------------------------------------------------------------

  getSession(): Promise<T.Session> {
    return this.respond(() => {
      if (this.db.organization.archivedAt) throw ApiError.of(ERR.FORBIDDEN, "This organization is archived.");
      return this.buildSession();
    });
  }

  selectOrganization(_organizationId: T.UUID): Promise<T.Session> {
    return this.getSession();
  }

  private buildSession(): T.Session {
    const user = this.actor();
    const org = this.db.organization;
    const visibleBranches = this.db.branches.filter((branch) => branch.status === "active" && (user.branchScope === "all" || user.branchIds.includes(branch.id)));
    const activeBranchId = this.db.session.activeBranchId;
    if (activeBranchId && !visibleBranches.some((branch) => branch.id === activeBranchId)) {
      throw ApiError.of(ERR.NOT_FOUND, "The selected branch is no longer available.");
    }
    if (user.branchScope === "selected" && !activeBranchId && visibleBranches.length > 1) {
      throw ApiError.of(ERR.ORGANIZATION_SELECTION_REQUIRED, "Select a branch before continuing.");
    }
    return {
      user: { id: user.id, name: user.name, email: user.email },
      organization: { id: org.id, name: org.name, currency: org.currency, timezone: org.timezone, locale: org.locale, brand: this.db.brand },
      branches: this.db.branches.map((b) => ({ id: b.id, name: b.name, code: b.code })),
      activeBranchId: activeBranchId ?? (user.branchScope === "selected" && visibleBranches.length === 1 ? visibleBranches[0]!.id : undefined),
      roles: [user.role],
      permissions: permissionsFor(this.db, user.role),
      workspace: this.workspaceAccess(),
    };
  }

  switchDemoRole(
    role: T.RoleKey,
    branchId?: T.UUID,
    identity?: Pick<T.Session["user"], "name" | "email">,
  ): Promise<T.Session> {
    return this.respond(() => {
      const user = this.db.users.find((u) => u.role === role && u.status === "active");
      if (!user) throw ApiError.of(ERR.NOT_FOUND, `No active demo user for role ${role}.`);
      const visibleBranches = this.db.branches.filter((branch) => branch.status === "active" && (user.branchScope === "all" || user.branchIds.includes(branch.id)));
      let nextActiveBranchId: T.UUID | undefined;
      if (branchId) {
        const branch = this.db.branches.find((candidate) => candidate.id === branchId);
        if (!branch || branch.status !== "active") throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
        if (user.branchScope !== "all" && !user.branchIds.includes(branchId)) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this branch.");
        nextActiveBranchId = branchId;
      } else if (user.branchScope === "selected" && visibleBranches.length > 1) {
        throw ApiError.of(ERR.ORGANIZATION_SELECTION_REQUIRED, "Select a branch before continuing.");
      } else {
        nextActiveBranchId = user.branchScope === "selected" ? visibleBranches[0]?.id : undefined;
      }
      // Convex supplies the real role while the operating data is still mocked.
      // Rebind the seeded actor to the authenticated profile so current-user UI
      // and newly created audit events never impersonate the seed persona.
      if (identity) {
        user.name = identity.name;
        user.email = identity.email;
      }
      this.db.session.userId = user.id;
      this.db.session.activeBranchId = nextActiveBranchId;
      return this.buildSession();
    });
  }

  setActiveBranch(branchId: T.UUID | undefined): Promise<T.Session> {
    return this.respond(() => {
      const user = this.actor();
      if (branchId) {
        const branch = this.db.branches.find((candidate) => candidate.id === branchId);
        if (!branch || branch.status !== "active") throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
        if (user.branchScope !== "all" && !user.branchIds.includes(branchId)) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to this branch.");
        this.db.session.activeBranchId = branchId;
      } else {
        const visibleBranches = this.db.branches.filter((branch) => branch.status === "active" && (user.branchScope === "all" || user.branchIds.includes(branch.id)));
        if (user.branchScope === "selected" && visibleBranches.length > 1) throw ApiError.of(ERR.ORGANIZATION_SELECTION_REQUIRED, "Select a branch before continuing.");
        this.db.session.activeBranchId = user.branchScope === "selected" ? visibleBranches[0]?.id : undefined;
      }
      return this.buildSession();
    });
  }

  signOut(): Promise<void> {
    return this.respond(() => undefined);
  }

  // -------------------------------------------------------------------------
  // dashboard
  // -------------------------------------------------------------------------

  getDashboard(query: DashboardQuery): Promise<T.DashboardData> {
    return this.respond(() => {
      const today = this.today();
      const branchId = this.branchScopedBranchId(query.branchId);
      const inBranch = <X extends { branchId?: T.UUID; homeBranchId?: T.UUID }>(x: X) =>
        !branchId || x.branchId === branchId || x.homeBranchId === branchId;

      const validPayments: Array<T.Payment | T.RetailPayment> = [...this.db.payments, ...this.db.retailSales.map((sale) => this.retailPaymentProjection(sale))].filter((p) => p.status !== "voided" && inBranch(p));
      const dayOf = (isoStr: string) => todayISODate(TZ, new Date(isoStr));
      const revenueOn = (date: string) =>
        validPayments.filter((p) => dayOf(p.occurredAt) === date).reduce((s, p) => s + p.amount.amount, 0);

      const monthStart = today.slice(0, 8) + "01";
      const prevMonthDate = addDays(monthStart, -1);
      const prevMonthStart = prevMonthDate.slice(0, 8) + "01";
      const revenueBetween = (from: string, to: string) =>
        validPayments
          .filter((p) => {
            const d = dayOf(p.occurredAt);
            return d >= from && d <= to;
          })
          .reduce((s, p) => s + p.amount.amount, 0);

      const outstandingTotal = this.db.charges
        .filter((c) => c.status !== "refunded")
        .filter((c) => {
          if (!branchId) return true;
          const ms = this.db.memberships.find((m) => m.id === c.membershipId);
          return ms ? ms.homeBranchId === branchId : true;
        })
        .reduce((s, c) => s + c.outstandingAmount.amount, 0);

      const statuses = this.db.memberships.map((m) => ({ m, s: this.membershipStatusOf(m) }));
      const renewalsDue = statuses.filter(
        ({ m, s }) => (s === "active" || s === "expiring") && inBranch(m) && diffDays(today, m.endDate) >= 0 && diffDays(today, m.endDate) <= 7,
      ).length;
      const expiredUnactioned = statuses.filter(({ m, s }) => {
        if (s !== "expired" || !inBranch(m)) return false;
        const daysExpired = diffDays(m.endDate, today);
        return daysExpired <= 30;
      }).length;

      const openTasks = this.db.tasks.filter((t) => t.status === "open");
      const overdueTasks = openTasks.filter((t) => t.dueAt < nowISO());

      const leads = this.db.leads.filter((l) => inBranch(l));
      const activeLeads = leads.filter((l) => l.stage !== "won" && l.stage !== "lost").length;

      const checkInsToday = this.db.checkIns.filter((c) => inBranch(c) && dayOf(c.occurredAt) === today && c.decision !== "blocked").length;

      const revenueSeries: T.RevenuePoint[] = [];
      for (let d = 29; d >= 0; d--) {
        const date = addDays(today, -d);
        const collected = validPayments.filter((p) => (p.type === "payment" || p.type === "retail_sale") && dayOf(p.occurredAt) === date).reduce((s, p) => s + p.amount.amount, 0);
        const refunds = validPayments.filter((p) => p.type === "refund" && dayOf(p.occurredAt) === date).reduce((s, p) => s + Math.abs(p.amount.amount), 0);
        revenueSeries.push({ date, collected, refunds });
      }

      const branchRevenue: T.BranchRevenue[] = this.db.branches
        .filter((b) => !branchId || b.id === branchId)
        .map((b) => ({
          branchId: b.id,
          branchName: b.name,
          collected: money(this.branchRevenue(b.id, addDays(today, -29), today)),
          checkInsToday: this.db.checkIns.filter((c) => c.branchId === b.id && dayOf(c.occurredAt) === today && c.decision !== "blocked").length,
          activeMembers: this.db.members.filter((m) => {
            if (m.homeBranchId !== b.id || m.status !== "active") return false;
            const cur = this.currentMembership(m.id);
            return cur && isMembershipUsable(this.membershipStatusOf(cur));
          }).length,
        }));

      const funnelOrder: T.LeadStage[] = ["new", "attempted", "contacted", "trial_booked", "trial_completed", "offer_sent", "won", "lost"];
      const funnelLabels: Record<T.LeadStage, string> = {
        new: "New",
        attempted: "Attempted",
        contacted: "Contacted",
        trial_booked: "Trial booked",
        trial_completed: "Trial done",
        offer_sent: "Offer sent",
        won: "Won",
        lost: "Lost",
      };
      const funnel: T.FunnelStage[] = funnelOrder.map((stage) => ({
        stage,
        label: funnelLabels[stage],
        count: leads.filter((l) => l.stage === stage).length,
      }));

      const leaderboard: T.SalespersonStat[] = this.db.users
        .filter((u) => u.role === "salesperson" && u.status === "active")
        .map((u) => {
          const collected = validPayments
            .filter((p) => p.collectedById === u.id && (p.type === "payment" || p.type === "retail_sale") && dayOf(p.occurredAt) >= monthStart)
            .reduce((s, p) => s + p.amount.amount, 0);
          const sold = this.db.memberships.filter((m) => m.soldById === u.id && dayOf(m.createdAt) >= monthStart);
          return {
            userId: u.id,
            name: u.name,
            revenueCollected: money(collected),
            newSales: sold.filter((m) => !m.previousMembershipId).length,
            renewals: sold.filter((m) => m.previousMembershipId).length,
            leadsConverted: this.db.leads.filter((l) => l.ownerId === u.id && l.stage === "won").length,
            followUpsCompleted: this.db.tasks.filter((t) => t.ownerId === u.id && t.status === "completed" && dayOf(t.completedAt ?? t.createdAt) >= monthStart).length,
            overdueFollowUps: overdueTasks.filter((t) => t.ownerId === u.id).length,
          };
        })
        .sort((a, b) => b.revenueCollected.amount - a.revenueCollected.amount);

      const alerts = this.buildAlerts(branchId);

      const recentActivity = this.db.activities
        .filter((a) => !a.leadId)
        .slice(0, 14);

      return {
        kpis: {
          revenueToday: money(revenueOn(today)),
          revenueThisMonth: money(revenueBetween(monthStart, today)),
          revenuePrevMonth: money(revenueBetween(prevMonthStart, prevMonthDate)),
          outstandingTotal: money(outstandingTotal),
          newMembersThisMonth: this.db.members.filter((m) => dayOf(m.createdAt) >= monthStart).length,
          renewalsDueNext7Days: renewalsDue,
          expiredUnactioned,
          checkInsToday,
          activeLeads,
          overdueFollowUps: overdueTasks.length,
        },
        revenueSeries,
        branchRevenue,
        funnel,
        leaderboard,
        alerts,
        recentActivity,
      };
    });
  }

  subscribeDashboard(query: DashboardQuery, onValue: (dashboard: T.DashboardData) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getDashboard(query), onValue, onError);
  }

  private branchRevenue(branchId: T.UUID, from: string, to: string): number {
    return [...this.db.payments, ...this.db.retailSales.map((sale) => this.retailPaymentProjection(sale))]
      .filter((p) => {
        if (p.branchId !== branchId || p.status === "voided") return false;
        const d = todayISODate(TZ, new Date(p.occurredAt));
        return d >= from && d <= to;
      })
      .reduce((s, p) => s + p.amount.amount, 0);
  }

  private buildAlerts(branchId?: T.UUID): T.DashboardAlert[] {
    const alerts: T.DashboardAlert[] = [];
    // Alerts follow the selected branch: an owner filtering to one location
    // must not be shown another branch's exceptions. Events with no branch
    // (organization-wide changes) stay visible either way.
    const inScope = (a: T.AuditEvent) => !branchId || !a.branchId || a.branchId === branchId;
    const pendingApprovals = this.db.audits.filter((a) => a.approvalStatus === "pending" && inScope(a));
    for (const a of pendingApprovals) {
      if (a.action === "membership.discount") {
        alerts.push({
          id: `alert-${a.id}`,
          kind: "pending_discount",
          title: "Discount awaiting approval",
          detail: `${a.summary} — ${a.entityLabel}`,
          actorName: a.actorName,
          href: "/audit?approval=pending",
          severity: "warning",
          occurredAt: a.occurredAt,
        });
      } else if (a.action === "shift.close_variance") {
        alerts.push({
          id: `alert-${a.id}`,
          kind: "cash_variance",
          title: "Cash variance to review",
          detail: a.summary,
          actorName: a.actorName,
          href: "/payments/shifts",
          severity: "critical",
          occurredAt: a.occurredAt,
        });
      } else if (a.action === "payment.refund") {
        alerts.push({
          id: `alert-${a.id}`,
          kind: "refund",
          title: "Refund awaiting review",
          detail: a.summary,
          actorName: a.actorName,
          href: "/audit?approval=pending",
          severity: "warning",
          occurredAt: a.occurredAt,
        });
      }
    }
    const overrides = this.db.audits.filter((a) => a.action === "checkin.override" && inScope(a)).slice(0, 2);
    for (const a of overrides) {
      alerts.push({
        id: `alert-${a.id}`,
        kind: "checkin_override",
        title: "Check-in override used",
        detail: `${a.entityLabel} — ${a.reason ?? ""}`,
        actorName: a.actorName,
        href: "/audit?category=checkins",
        severity: "info",
        occurredAt: a.occurredAt,
      });
    }
    return alerts.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  }

  // -------------------------------------------------------------------------
  // members
  // -------------------------------------------------------------------------

  listMembers(query: MemberListQuery): Promise<T.Page<T.MemberSummary>> {
    return this.respond(() => {
      this.require("members.read");
      const branchId = this.branchScopedBranchId(query.branchId);
      let items = this.db.members.map((m) => this.toMemberSummary(m));
      if (branchId) items = items.filter((m) => m.homeBranchId === branchId);
      if (query.status) items = items.filter((m) => m.status === query.status);
      if (query.planId) {
        items = items.filter((m) => {
          const cur = this.currentMembership(m.id);
          return cur?.planId === query.planId;
        });
      }
      if (query.membershipStatus) {
        if (query.membershipStatus === "outstanding") {
          items = items.filter((m) => m.outstanding.amount > 0);
        } else {
          items = items.filter((m) => m.membershipStatus === query.membershipStatus);
        }
      }
      items = items.filter((m) => this.matchesSearch([m.fullName, m.fullNameAr, m.phone, m.memberNumber, m.email], query.search));
      items = applySort(items, query.sort ?? "fullName", (m, k) => {
        switch (k) {
          case "fullName": return m.fullName;
          case "memberNumber": return m.memberNumber;
          case "membershipEndDate": return m.membershipEndDate;
          case "lastCheckInAt": return m.lastCheckInAt;
          case "outstanding": return m.outstanding.amount;
          case "createdAt": return m.createdAt;
          default: return m.fullName;
        }
      });
      return paginate(this.maybeEmpty(items), query);
    });
  }

  getMember(memberId: T.UUID): Promise<T.MemberDetail> {
    return this.respond(() => {
      this.require("members.read");
      const m = this.db.members.find((x) => x.id === memberId);
      if (!m) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      return this.toMemberDetail(m);
    });
  }

  subscribeMember(memberId: T.UUID, onValue: (member: T.MemberDetail) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getMember(memberId), onValue, onError);
  }

  checkMemberDuplicates(input: { phone?: string; email?: string }): Promise<T.DuplicateMatch[]> {
    return this.respond(() => this.findDuplicates(input));
  }

  /** Phone/email match ignoring formatting. Shared by the check and by create. */
  private findDuplicates(input: { phone?: string; email?: string }): T.DuplicateMatch[] {
    const norm = (s?: string) => (s ?? "").replace(/[\s+()-]/g, "").toLowerCase();
    const matches: T.DuplicateMatch[] = [];
    for (const m of this.db.members) {
      if (m.status === "archived") continue;
      if (input.phone && norm(m.phone) === norm(input.phone)) {
        matches.push({ memberId: m.id, fullName: m.fullName, memberNumber: m.memberNumber, matchedOn: "phone" });
      } else if (input.email && m.email && norm(m.email) === norm(input.email)) {
        matches.push({ memberId: m.id, fullName: m.fullName, memberNumber: m.memberNumber, matchedOn: "email" });
      }
    }
    return matches;
  }

  createMember(input: T.CreateMemberInput): Promise<T.CreateMemberResult> {
    return this.respond(() => {
      this.require("members.write");
      if (!input.fullName.trim() || !input.phone.trim()) {
        throw ApiError.of(ERR.VALIDATION, "Name and phone are required.", {
          fieldErrors: {
            ...(input.fullName.trim() ? {} : { fullName: ["Full name is required"] }),
            ...(input.phone.trim() ? {} : { phone: ["Phone is required"] }),
          },
        });
      }
      const branch = this.db.branches.find((b) => b.id === input.homeBranchId);
      if (!branch || branch.status !== "active" || !this.branchIsVisible(branch.id)) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
      this.db.counters.memberNumber += 1;
      const record: MemberRecord = {
        id: mockUuid(),
        memberNumber: `${branch.code}-${this.db.counters.memberNumber}`,
        fullName: input.fullName.trim(),
        fullNameAr: input.fullNameAr,
        phone: input.phone.trim(),
        email: input.email?.trim().toLowerCase() || undefined,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth,
        homeBranchId: branch.id,
        status: "active",
        tags: input.tags ?? [],
        preferredLanguage: input.preferredLanguage,
        emergencyContactName: input.emergencyContactName,
        emergencyContactRelationship: input.emergencyContactRelationship,
        emergencyContactPhone: input.emergencyContactPhone,
        addressLine1: input.addressLine1,
        city: input.city,
        source: input.source,
        assignedSalespersonId: input.assignedSalespersonId,
        marketingOptIn: input.marketingOptIn !== false,
        marketingPreference: this.marketingPreferenceFor(input),
        notes: input.notes,
        createdAt: nowISO(),
      };
      // Duplicate detection runs against the directory *before* the new record
      // is inserted, so the member never matches themselves. The record is still
      // created — reception decides whether to merge — but the caller is warned.
      const duplicates = this.findDuplicates({ phone: input.phone, email: input.email });

      this.db.members.push(record);
      this.activity({
        memberId: record.id,
        type: "member_created",
        title: "Member profile created",
        actorId: this.actor().id,
        actorName: this.actor().name,
      });
      return {
        member: this.toMemberDetail(record),
        duplicates,
      };
    });
  }

  updateMember(memberId: T.UUID, input: T.UpdateMemberInput): Promise<T.MemberDetail> {
    return this.respond(() => {
      this.require("members.write");
      const m = this.db.members.find((x) => x.id === memberId);
      if (!m) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      const marketingChanged = input.marketingOptIn !== undefined || input.marketingPreferenceSource !== undefined;
      const beforePreference = m.marketingPreference ?? { optedIn: m.marketingOptIn, source: "system_default" as const };
      Object.assign(m, {
        ...input,
        email: input.email === undefined ? m.email : input.email || undefined,
      });
      delete (m as MemberRecord & { marketingPreferenceSource?: unknown }).marketingPreferenceSource;
      if (marketingChanged) {
        m.marketingOptIn = input.marketingOptIn === undefined ? m.marketingOptIn : input.marketingOptIn !== false;
        m.marketingPreference = this.marketingPreferenceFor(input, m.marketingOptIn);
        this.activity({
          memberId: m.id,
          type: "marketing_preference_changed",
          title: `Marketing messages ${m.marketingOptIn ? "enabled" : "disabled"}`,
          body: `Preference changed from ${beforePreference.optedIn ? "opted in" : "opted out"} to ${m.marketingOptIn ? "opted in" : "opted out"}.`,
          actorId: this.actor().id,
          actorName: this.actor().name,
          meta: { optedIn: m.marketingOptIn, source: m.marketingPreference.source },
        });
        this.audit({
          category: "members",
          action: "member.marketing_preference.update",
          entityType: "member",
          entityId: m.id,
          entityLabel: `${m.fullName} · ${m.memberNumber}`,
          summary: `Marketing messages ${m.marketingOptIn ? "enabled" : "disabled"}`,
          before: { optedIn: beforePreference.optedIn ? "true" : "false", source: beforePreference.source },
          after: { optedIn: m.marketingOptIn ? "true" : "false", source: m.marketingPreference.source },
          branchId: m.homeBranchId,
        });
      }
      return this.toMemberDetail(m);
    });
  }

  archiveMember(memberId: T.UUID, input: { reason: string }): Promise<void> {
    return this.respond(() => {
      this.require("members.archive");
      this.requireReason(input.reason);
      const m = this.db.members.find((x) => x.id === memberId);
      if (!m) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      m.status = "archived";
      m.archivedAt = nowISO();
      this.audit({
        category: "members",
        action: "member.archive",
        entityType: "member",
        entityId: m.id,
        entityLabel: `${m.fullName} · ${m.memberNumber}`,
        summary: "Member archived",
        reason: input.reason,
        before: { status: "active" },
        after: { status: "archived" },
        branchId: m.homeBranchId,
      });
    });
  }

  deleteMember(memberId: T.UUID, input: { reason: string; confirmation: string }): Promise<void> {
    return this.respond(() => {
      this.require("members.archive");
      this.requireReason(input.reason);
      if (!["owner", "manager"].includes(this.actor().role)) throw ApiError.of(ERR.FORBIDDEN, "Only an owner or manager can permanently delete a member.");
      const member = this.db.members.find((candidate) => candidate.id === memberId);
      if (!member) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      if (member.status !== "archived") throw ApiError.of(ERR.VALIDATION, "Only archived members can be permanently deleted.");
      if (input.confirmation.trim() !== member.fullName) throw ApiError.of(ERR.VALIDATION, "Type the member's full name to confirm deletion.");
      const blockingMembership = this.db.memberships
        .filter((membership) => membership.memberId === memberId)
        .find((membership) => ["active", "expiring", "frozen", "scheduled"].includes(this.membershipStatusOf(membership)));
      if (blockingMembership) throw ApiError.of(ERR.CONFLICT, "This archived member still has an active or scheduled membership.");
      if (this.outstandingForMember(memberId).amount > 0) throw ApiError.of(ERR.CONFLICT, "Settle the member's outstanding balance before deletion.");
      const hasFutureBooking = this.ptBookings.some((booking) => booking.memberId === memberId && ["reserved", "confirmed"].includes(booking.status) && Date.parse(booking.startsAt) > Date.now());
      if (hasFutureBooking) throw ApiError.of(ERR.CONFLICT, "Cancel or reassign future PT bookings before deletion.");
      this.audit({
        category: "members",
        action: "member.delete",
        entityType: "member",
        entityId: member.id,
        entityLabel: member.fullName + " · " + member.memberNumber,
        summary: "Archived member permanently deleted",
        reason: input.reason,
        before: { status: member.status, fullName: member.fullName, phone: member.phone, email: member.email ?? null },
        after: { deleted: "true" },
        branchId: member.homeBranchId,
      });
      this.db.members = this.db.members.filter((candidate) => candidate.id !== memberId);
    });
  }

  listMemberTimeline(memberId: T.UUID, query?: TimelineQuery): Promise<T.Page<T.TimelineEvent>> {
    return this.respond(() => {
      this.require("members.read");
      let items = this.db.activities.filter((a) => a.memberId === memberId);
      if (query?.types && query.types.length > 0) items = items.filter((a) => query.types!.includes(a.type));
      return paginate(this.maybeEmpty(items), query ?? {});
    });
  }

  logMemberContactAttempt(memberId: T.UUID, input: T.ContactAttemptInput): Promise<T.TimelineEvent> {
    return this.respond(() => {
      this.require("crm.write");
      const m = this.db.members.find((x) => x.id === memberId);
      if (!m) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      if (input.nextFollowUpAt) {
        // surface as an open renewal/follow-up task owned by the actor
        this.db.tasks.push({
          id: mockUuid(),
          organizationId: this.db.organization.id,
          type: "follow_up",
          title: `Follow up — ${m.fullName}`,
          ownerId: this.actor().id,
          ownerName: this.actor().name,
          dueAt: input.nextFollowUpAt,
          priority: "normal",
          status: "open",
          memberId: m.id,
          subjectName: m.fullName,
          createdById: this.actor().id,
          createdAt: nowISO(),
        });
      }
      return this.activity({
        memberId,
        type: "call_attempt",
        title: `Call — ${input.outcome.replace(/_/g, " ")}`,
        body: input.notes,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { outcome: input.outcome },
      });
    });
  }

  addMemberNote(memberId: T.UUID, input: { body: string }): Promise<T.TimelineEvent> {
    return this.respond(() => {
      this.require("members.write");
      const m = this.db.members.find((x) => x.id === memberId);
      if (!m) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      return this.activity({
        memberId,
        type: "note",
        title: "Note added",
        body: input.body,
        actorId: this.actor().id,
        actorName: this.actor().name,
      });
    });
  }

  // -------------------------------------------------------------------------
  // plans
  // -------------------------------------------------------------------------

  listPlans(query: PlanListQuery): Promise<T.Page<T.MembershipPlan>> {
    return this.respond(() => {
      let items = this.db.plans.map((p) => this.toPlan(p));
      if (query.status) items = items.filter((p) => p.status === query.status);
      else items = items.filter((p) => p.status === "active");
      items = items.filter((p) => this.matchesSearch([p.name, p.code], query.search));
      return paginate(this.maybeEmpty(items), query);
    });
  }

  createPlan(input: T.CreatePlanInput): Promise<T.MembershipPlan> {
    return this.respond(() => {
      this.require("settings.manage");
      const plan: T.MembershipPlan = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        activeSubscribers: 0,
        status: "active",
        includedPtSessions: input.includedPtSessions ?? 0,
        ...input,
      };
      this.db.plans.push(plan);
      this.audit({
        category: "settings",
        action: "plan.create",
        entityType: "plan",
        entityId: plan.id,
        entityLabel: plan.name,
        summary: `Plan created — JOD ${(plan.basePrice.amount / 1000).toFixed(3)}`,
      });
      return this.toPlan(plan);
    });
  }

  updatePlan(planId: T.UUID, input: T.UpdatePlanInput): Promise<T.MembershipPlan> {
    return this.respond(() => {
      this.require("settings.manage");
      const plan = this.db.plans.find((p) => p.id === planId);
      if (!plan) throw ApiError.of(ERR.NOT_FOUND, "Plan not found.");
      const before = { basePrice: plan.basePrice.amount, status: plan.status };
      Object.assign(plan, input);
      this.audit({
        category: "settings",
        action: "plan.update",
        entityType: "plan",
        entityId: plan.id,
        entityLabel: plan.name,
        summary: "Plan updated",
        before,
        after: { basePrice: plan.basePrice.amount, status: plan.status },
      });
      return this.toPlan(plan);
    });
  }

  // -------------------------------------------------------------------------
  // personal training
  getPtWorkspace(): Promise<T.PtWorkspace> {
    return this.respond(() => {
      this.require("pt.reports.read");
      const paidOrderIds = new Set(this.ptOrders.filter((order) => order.status !== "pending_payment" && order.status !== "cancelled").map((order) => order.id));
      const packageRevenue = this.ptOrders.reduce((total, order) => {
        if (!paidOrderIds.has(order.id)) return total;
        return total + (order.totalPriceSnapshot?.amount ?? this.ptPackages.find((item) => item.id === order.packageId)?.totalPrice.amount ?? 0);
      }, 0);
      return {
        trainers: this.ptTrainers.map((item) => ({ ...this.ptTrainerView(item), availabilityRules: this.ptRules.filter((rule) => rule.trainerProfileId === item.id).map((rule) => ({ ...rule })), availabilityExceptions: this.ptExceptions.filter((exception) => exception.trainerProfileId === item.id).map((exception) => ({ ...exception })) })),
        packages: this.ptPackages.map((item) => ({ ...item })),
        bookings: [...this.ptBookings].sort((a, b) => a.startsAt.localeCompare(b.startsAt)).map((item) => this.ptBookingView(item)),
        pendingOrders: this.ptOrders.filter((order) => order.status === "pending_payment").map((item) => ({ ...item, memberName: this.db.members.find((member) => member.id === item.memberId)?.fullName ?? "Member", packageName: item.packageNameSnapshot ?? this.ptPackages.find((pkg) => pkg.id === item.packageId)?.name ?? "PT package", paymentReference: `PT order ${item.id.slice(-6).toUpperCase()}` })),
        metrics: {
          packageRevenue: money(packageRevenue),
          sessionsUsed: this.ptEntitlements.reduce((total, item) => total + item.consumed, 0),
          sessionsReserved: this.ptEntitlements.reduce((total, item) => total + item.reserved, 0),
          upcomingBookings: this.ptBookings.filter((item) => ["reserved", "confirmed"].includes(item.status) && Date.parse(item.startsAt) > Date.now()).length,
          noShows: this.ptBookings.filter((item) => item.status === "no_show").length,
        },
      };
    });
  }

  subscribePtWorkspace(onValue: (workspace: T.PtWorkspace) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getPtWorkspace(), onValue, onError);
  }

  getPtMemberExperience(membershipId: T.UUID): Promise<T.PtMemberExperience> {
    return this.respond(() => {
      this.require("members.read");
      const membership = this.db.memberships.find((item) => item.id === membershipId);
      if (!membership) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      this.ensureIncludedPtEntitlement(membershipId);
      const entitlements = this.ptEntitlements.filter((item) => item.memberId === membership.memberId).map((item) => ({ ...item, available: ptAvailableCredits(item) }));
      return {
        organizationId: this.db.organization.id,
        membershipId,
        availableSessions: entitlements.reduce((total, item) => total + item.available, 0),
        reservedSessions: entitlements.reduce((total, item) => total + item.reserved, 0),
        entitlements,
        upcomingBookings: this.ptBookings.filter((item) => item.memberId === membership.memberId && ["reserved", "confirmed"].includes(item.status)).map((item) => this.ptBookingView(item)),
        orders: this.ptOrders.filter((item) => item.memberId === membership.memberId).map((item) => ({ ...item })),
        trainers: this.ptTrainers.filter((item) => item.status === "published").map((item) => this.ptTrainerView(item)),
        packages: this.ptPackages.filter((item) => item.status === "active").map((item) => ({ ...item })),
      };
    });
  }

  subscribePtMemberExperience(membershipId: T.UUID, onValue: (experience: T.PtMemberExperience) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getPtMemberExperience(membershipId), onValue, onError);
  }

  getCustomerPtExperience(membershipId: T.UUID): Promise<T.PtMemberExperience> {
    const internal = this.db.memberships.find((item) => item.id === membershipId);
    if (internal) return this.getPtMemberExperience(membershipId);
    return this.respond(() => ({ organizationId: this.db.organization.id, membershipId, availableSessions: 0, reservedSessions: 0, entitlements: [], upcomingBookings: [], orders: [], trainers: this.ptTrainers.filter((item) => item.status === "published").map((item) => this.ptTrainerView(item)), packages: this.ptPackages.filter((item) => item.status === "active") }));
  }

  subscribeCustomerPtExperience(membershipId: T.UUID, onValue: (experience: T.PtMemberExperience) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getCustomerPtExperience(membershipId), onValue, onError);
  }

  upsertPtTrainerProfile(input: T.UpsertPtTrainerProfileInput): Promise<T.PtTrainerProfile> {
    return this.respond(() => {
      this.require("pt.manage");
      const staff = this.db.users.find((item) => item.id === input.userId && item.role === "trainer" && item.status === "active");
      if (!staff) throw ApiError.of(ERR.VALIDATION, "Trainer profiles must link to an active trainer account.");
      if (input.status === "published" && input.photoAssetId && !input.photoAlt?.trim()) throw ApiError.of(ERR.VALIDATION, "Published trainer photos require alt text.");
      const existing = input.id ? this.ptTrainers.find((item) => item.id === input.id) : undefined;
      const photoAssetId = input.photoAssetId ?? (existing ? this.ptTrainerPhotoAssetIds.get(existing.id) : undefined);
      const photoAsset = photoAssetId ? this.mediaAssets.get(photoAssetId) : undefined;
      if (photoAssetId && (!photoAsset || photoAsset.ownerType !== "trainer_photo" || photoAsset.ownerId !== (existing?.id ?? input.id) || photoAsset.visibility !== "public" || !["pending", "active"].includes(photoAsset.status))) throw ApiError.of(ERR.NOT_FOUND, "Trainer photo not found.");
      const now = nowISO();
      const value: T.PtTrainerProfile = { id: existing?.id ?? mockUuid(), organizationId: this.db.organization.id, userId: input.userId, displayName: input.displayName.trim(), bioEn: input.bioEn?.trim() || undefined, bioAr: input.bioAr?.trim() || undefined, specialties: [...input.specialties], languages: [...input.languages], branchIds: [...input.branchIds], photoAlt: input.photoAlt?.trim() || undefined, status: input.status, createdAt: existing?.createdAt ?? now, updatedAt: now };
      if (existing) this.ptTrainers.splice(this.ptTrainers.indexOf(existing), 1, value); else this.ptTrainers.push(value);
      if (photoAssetId) {
        this.ptTrainerPhotoAssetIds.set(value.id, photoAssetId);
        if (photoAsset?.status === "pending") { photoAsset.status = "active"; delete photoAsset.deleteAfter; photoAsset.updatedAt = now; }
      }
      this.audit({ category: "users", action: existing ? "pt.trainer.update" : "pt.trainer.create", entityType: "pt_trainer", entityId: value.id, entityLabel: value.displayName, summary: existing ? "Updated trainer profile" : "Created trainer profile" });
      return this.ptTrainerView(value);
    });
  }

  upsertPtPackage(input: T.UpsertPtPackageInput): Promise<T.PtPackage> {
    return this.respond(() => {
      this.require("pt.manage");
      if (!Number.isSafeInteger(input.sessionCount) || input.sessionCount < 1 || input.sessionCount > 1_000 || !Number.isSafeInteger(input.totalPrice.amount) || input.totalPrice.amount <= 0 || input.validityDays < 1) throw ApiError.of(ERR.VALIDATION, "Package sessions, price, and validity must be positive.");
      const existing = input.id ? this.ptPackages.find((item) => item.id === input.id) : undefined;
      const now = nowISO();
      const value: T.PtPackage = { id: existing?.id ?? mockUuid(), organizationId: this.db.organization.id, name: input.name.trim(), sessionCount: input.sessionCount, totalPrice: { ...input.totalPrice }, validityDays: input.validityDays, branchAccess: input.branchAccess, branchIds: input.branchAccess === "all" ? [] : [...input.branchIds], status: input.status, createdAt: existing?.createdAt ?? now, updatedAt: now };
      const candidate = [...this.ptPackages.filter((item) => item.id !== value.id && item.status === "active"), value].filter((item) => item.status === "active");
      if (!ptPackageLadderIsValid(candidate)) throw ApiError.of(ERR.VALIDATION, "Larger PT packages cannot cost more per session than smaller packages.");
      if (existing) {
        for (const order of this.ptOrders.filter((item) => item.packageId === existing.id)) {
          order.packageNameSnapshot ??= existing.name;
          order.sessionCountSnapshot ??= existing.sessionCount;
          order.totalPriceSnapshot ??= { ...existing.totalPrice };
          order.validityDaysSnapshot ??= existing.validityDays;
        }
        this.ptPackages.splice(this.ptPackages.indexOf(existing), 1, value);
      } else this.ptPackages.push(value);
      this.audit({ category: "settings", action: existing ? "pt.package.update" : "pt.package.create", entityType: "pt_package", entityId: value.id, entityLabel: value.name, summary: existing ? "Updated PT package" : "Created PT package" });
      return { ...value };
    });
  }

  deletePtPackage(packageId: T.UUID, reason: string): Promise<void> {
    return this.respond(() => {
      this.require("pt.manage");
      this.requireReason(reason);
      const packageValue = this.ptPackages.find((item) => item.id === packageId);
      if (!packageValue) throw ApiError.of(ERR.NOT_FOUND, "PT package not found.");
      if (this.ptOrders.some((order) => order.packageId === packageId)) throw ApiError.of(ERR.CONFLICT, "Packages with historical orders cannot be deleted; archive them instead.");
      this.ptPackages.splice(this.ptPackages.indexOf(packageValue), 1);
      this.audit({ category: "settings", action: "pt.package.delete", entityType: "pt_package", entityId: packageId, entityLabel: packageValue.name, summary: "Deleted unused PT package", reason });
    });
  }

  replacePtAvailability(input: T.ReplacePtAvailabilityInput): Promise<T.PtTrainerProfile> {
    return this.respond(() => {
      const profile = this.ptTrainers.find((item) => item.id === input.trainerProfileId);
      if (!profile) throw ApiError.of(ERR.NOT_FOUND, "Trainer profile not found.");
      const actor = this.actor();
      if (profile.userId !== actor.id) this.require("pt.manage"); else this.require("pt.schedule.self");
      for (const rule of input.rules) {
        if (rule.startMinute < 0 || rule.endMinute > 1440 || rule.endMinute - rule.startMinute < 60) throw ApiError.of(ERR.VALIDATION, "Availability windows must contain at least one 60-minute session.");
        if (input.rules.some((other) => other !== rule && other.branchId === rule.branchId && other.weekday === rule.weekday && rule.startMinute < other.endMinute && other.startMinute < rule.endMinute)) throw ApiError.of(ERR.CONFLICT, "Availability windows cannot overlap.");
      }
      this.ptRules = this.ptRules.filter((item) => item.trainerProfileId !== profile.id).concat(input.rules.map((rule) => ({ ...rule, id: mockUuid(), trainerProfileId: profile.id })));
      this.ptExceptions = this.ptExceptions.filter((item) => item.trainerProfileId !== profile.id).concat(input.exceptions.map((exception) => ({ ...exception, id: mockUuid(), trainerProfileId: profile.id })));
      this.audit({ category: "settings", action: "pt.availability.replace", entityType: "pt_trainer", entityId: profile.id, entityLabel: profile.displayName, summary: "Updated trainer availability" });
      return { ...profile };
    });
  }

  listPtAvailableSlots(input: { trainerProfileId: T.UUID; branchId: T.UUID; from: T.ISODate; to: T.ISODate }): Promise<T.PtAvailableSlot[]> {
    return this.respond(() => {
      const profile = this.ptTrainers.find((item) => item.id === input.trainerProfileId && item.status === "published");
      if (!profile || !profile.branchIds.includes(input.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Trainer is not available at this branch.");
      const slots: T.PtAvailableSlot[] = [];
      for (let date = input.from; date <= input.to; date = addDays(date, 1)) {
        const weekday = (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as T.WeekdayKey[])[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
        const blocked = this.ptExceptions.filter((item) => item.trainerProfileId === profile.id && item.branchId === input.branchId && item.date === date);
        for (const rule of this.ptRules.filter((item) => item.trainerProfileId === profile.id && item.branchId === input.branchId && item.weekday === weekday && item.active)) {
          for (let minute = rule.startMinute; minute + 60 <= rule.endMinute; minute += 60) {
            if (blocked.some((item) => item.startMinute === undefined || (minute < (item.endMinute ?? 1440) && (item.startMinute ?? 0) < minute + 60))) continue;
            const hour = String(Math.floor(minute / 60)).padStart(2, "0");
            const min = String(minute % 60).padStart(2, "0");
            const startsAt = new Date(`${date}T${hour}:${min}:00+03:00`).toISOString();
            const endsAt = new Date(Date.parse(startsAt) + 3_600_000).toISOString();
            if (Date.parse(startsAt) <= Date.now()) continue;
            if (this.ptBookings.some((item) => item.trainerProfileId === profile.id && ["reserved", "confirmed"].includes(item.status) && item.startsAt < endsAt && startsAt < item.endsAt)) continue;
            slots.push({ trainerProfileId: profile.id, branchId: input.branchId, startsAt, endsAt });
          }
        }
      }
      return slots;
    });
  }

  listCustomerPtAvailableSlots(input: { membershipId: T.UUID; trainerProfileId: T.UUID; branchId: T.UUID; from: T.ISODate; to: T.ISODate }): Promise<T.PtAvailableSlot[]> {
    return this.listPtAvailableSlots(input);
  }

  createPtBooking(input: T.CreatePtBookingInput): Promise<T.PtBooking> {
    return this.respond(async () => {
      this.require("pt.book_for_member");
      const existing = this.ptBookings.find((item) => item.id === input.idempotencyKey);
      if (existing) return { ...existing };
      const membership = this.db.memberships.find((item) => item.id === input.membershipId);
      if (!membership || !["active", "expiring"].includes(this.membershipStatusOf(membership))) throw ApiError.of(ERR.VALIDATION, "An active, unfrozen membership is required for the session date.");
      const member = this.db.members.find((item) => item.id === membership.memberId)!;
      const trainer = this.ptTrainers.find((item) => item.id === input.trainerProfileId && item.status === "published");
      const branch = this.db.branches.find((item) => item.id === input.branchId);
      if (!trainer || !branch) throw ApiError.of(ERR.NOT_FOUND, "Trainer or branch not found.");
      const date = input.startsAt.slice(0, 10) as T.ISODate;
      const slots = await this.listPtAvailableSlots({ trainerProfileId: trainer.id, branchId: branch.id, from: date, to: date });
      if (!slots.some((slot) => slot.startsAt === input.startsAt)) throw ApiError.of(ERR.CONFLICT, "This PT slot is no longer available.");
      this.ensureIncludedPtEntitlement(membership.id);
      const entitlement = selectPtEntitlement(this.ptEntitlements.filter((item) => item.memberId === member.id), Date.parse(input.startsAt));
      if (!entitlement) throw ApiError.of(ERR.VALIDATION, "No PT session credit is available.");
      entitlement.reserved += 1; entitlement.available = ptAvailableCredits(entitlement); entitlement.updatedAt = nowISO();
      const now = nowISO();
      const booking: T.PtBooking = { id: input.idempotencyKey, organizationId: this.db.organization.id, memberId: member.id, memberName: member.fullName, trainerProfileId: trainer.id, trainerName: trainer.displayName, branchId: branch.id, branchName: branch.name, entitlementId: entitlement.id, startsAt: input.startsAt, endsAt: new Date(Date.parse(input.startsAt) + 3_600_000).toISOString(), status: "reserved", bookedById: this.actor().id, createdAt: now, updatedAt: now };
      this.ptBookings.push(booking);
      this.activity({ memberId: member.id, type: "pt_booking_reserved", title: `PT booked with ${trainer.displayName}`, meta: { bookingId: booking.id } });
      this.audit({ category: "memberships", action: "pt.booking.create", entityType: "pt_booking", entityId: booking.id, entityLabel: `${member.fullName} · ${trainer.displayName}`, summary: "Reserved one PT credit", branchId: branch.id });
      return { ...booking };
    });
  }

  createCustomerPtBooking(input: T.CreatePtBookingInput): Promise<T.PtBooking> { return this.createPtBooking(input); }

  cancelPtBooking(bookingId: T.UUID, input: { reason: string; cancelledByGym?: boolean }): Promise<T.PtBooking> {
    return this.respond(() => {
      this.requireReason(input.reason);
      const booking = this.ptBookings.find((item) => item.id === bookingId);
      if (!booking || !["reserved", "confirmed"].includes(booking.status)) throw ApiError.of(ERR.NOT_FOUND, "Active PT booking not found.");
      const policy = this.db.operationalPolicies.personalTraining;
      const result = ptCancellationResult({ startsAt: Date.parse(booking.startsAt), cancelledAt: Date.now(), cutoffHours: policy.cancellationCutoffHours, cancelledByGym: Boolean(input.cancelledByGym) });
      const entitlement = this.ptEntitlements.find((item) => item.id === booking.entitlementId)!;
      entitlement.reserved = Math.max(0, entitlement.reserved - 1);
      if (!result.restoreCredit) entitlement.consumed += 1;
      entitlement.available = ptAvailableCredits(entitlement); entitlement.updatedAt = nowISO();
      booking.status = result.status; booking.cancellationReason = input.reason.trim(); booking.updatedAt = nowISO();
      this.activity({ memberId: booking.memberId, type: "pt_booking_cancelled", title: result.restoreCredit ? "PT booking cancelled — credit restored" : "PT booking cancelled after cutoff — credit used", body: input.reason, meta: { bookingId } });
      return { ...booking };
    });
  }

  cancelCustomerPtBooking(bookingId: T.UUID, reason: string): Promise<T.PtBooking> { return this.cancelPtBooking(bookingId, { reason }); }

  reschedulePtBooking(input: T.ReschedulePtBookingInput): Promise<T.PtBooking> {
    return this.respond(async () => {
      this.requireReason(input.reason);
      const booking = this.ptBookings.find((item) => item.id === input.bookingId);
      if (!booking || !["reserved", "confirmed"].includes(booking.status)) throw ApiError.of(ERR.NOT_FOUND, "Active PT booking not found.");
      const entitlement = this.ptEntitlements.find((item) => item.id === booking.entitlementId);
      const trainer = this.ptTrainers.find((item) => item.id === input.trainerProfileId && item.status === "published");
      const branch = this.db.branches.find((item) => item.id === input.branchId);
      if (!trainer || !branch || !entitlement || Date.parse(input.startsAt) > Date.parse(entitlement.expiresAt)) throw ApiError.of(ERR.NOT_FOUND, "The new PT slot or its reserved credit is unavailable.");
      const date = input.startsAt.slice(0, 10) as T.ISODate;
      const priorStatus = booking.status;
      booking.status = "cancelled";
      const slots = await this.listPtAvailableSlots({ trainerProfileId: trainer.id, branchId: branch.id, from: date, to: date });
      booking.status = priorStatus;
      if (!slots.some((slot) => slot.startsAt === input.startsAt)) throw ApiError.of(ERR.CONFLICT, "This PT slot is no longer available.");
      const collision = this.ptBookings.some((item) => item.id !== booking.id && item.memberId === booking.memberId && ["reserved", "confirmed"].includes(item.status) && item.startsAt < new Date(Date.parse(input.startsAt) + 3_600_000).toISOString() && input.startsAt < item.endsAt);
      if (collision) throw ApiError.of(ERR.CONFLICT, "The member already has a PT booking at this time.");
      booking.trainerProfileId = trainer.id; booking.trainerName = trainer.displayName; booking.branchId = branch.id; booking.branchName = branch.name; booking.startsAt = input.startsAt; booking.endsAt = new Date(Date.parse(input.startsAt) + 3_600_000).toISOString(); booking.updatedAt = nowISO();
      this.activity({ memberId: booking.memberId, type: "pt_booking_rescheduled", title: `PT rescheduled with ${trainer.displayName}`, body: input.reason, meta: { bookingId: booking.id, startsAt: booking.startsAt } });
      this.audit({ category: "memberships", action: "pt.booking.reschedule", entityType: "pt_booking", entityId: booking.id, entityLabel: booking.memberName, summary: "Rescheduled PT booking without changing credit balance", reason: input.reason, branchId: branch.id });
      return { ...booking };
    });
  }

  rescheduleCustomerPtBooking(input: T.ReschedulePtBookingInput): Promise<T.PtBooking> { return this.reschedulePtBooking(input); }

  completePtBooking(bookingId: T.UUID, input: { reason?: string } = {}): Promise<T.PtBooking> { return this.finishPtBooking(bookingId, "completed", input.reason); }
  markPtBookingNoShow(bookingId: T.UUID, input: { reason?: string } = {}): Promise<T.PtBooking> { return this.finishPtBooking(bookingId, "no_show", input.reason); }

  private finishPtBooking(bookingId: T.UUID, status: "completed" | "no_show", reason?: string): Promise<T.PtBooking> {
    return this.respond(() => {
      const booking = this.ptBookings.find((item) => item.id === bookingId);
      if (!booking || !["reserved", "confirmed"].includes(booking.status)) throw ApiError.of(ERR.NOT_FOUND, "Active PT booking not found.");
      const trainer = this.ptTrainers.find((item) => item.id === booking.trainerProfileId);
      if (trainer?.userId !== this.actor().id) this.require("pt.manage"); else this.require("pt.outcome.self");
      if (status === "no_show") this.requireReason(reason);
      const entitlement = this.ptEntitlements.find((item) => item.id === booking.entitlementId)!;
      entitlement.reserved = Math.max(0, entitlement.reserved - 1); entitlement.consumed += 1; entitlement.available = ptAvailableCredits(entitlement); entitlement.updatedAt = nowISO();
      booking.status = status; booking.outcomeReason = reason?.trim() || undefined; booking.updatedAt = nowISO();
      this.activity({ memberId: booking.memberId, type: status === "completed" ? "pt_session_completed" : "pt_session_no_show", title: status === "completed" ? "PT session completed" : "PT session marked no-show", body: reason, meta: { bookingId } });
      return { ...booking };
    });
  }

  requestPtPackage(input: T.RequestPtPackageInput): Promise<T.PtPackageOrder> {
    return this.respond(() => {
      const membershipScope = this.ptMembershipScope(input.membershipId);
      const prior = this.ptOrders.find((item) => item.id === input.idempotencyKey);
      if (prior) {
        if (prior.memberId !== membershipScope.membership.memberId || prior.packageId !== input.packageId) throw ApiError.of(ERR.CONFLICT, "This idempotency key was already used for a different package request.");
        this.ptOrderScope(prior);
        return { ...prior };
      }
      const membership = membershipScope.membership;
      const ptPackage = this.ptPackages.find((item) => item.id === input.packageId && item.status === "active");
      if (!membership || !ptPackage) throw ApiError.of(ERR.NOT_FOUND, "Membership or PT package not found.");
      this.ptMembershipScope(membership.id, membership.memberId, true);
      const charge: T.Charge = { id: mockUuid(), organizationId: this.db.organization.id, memberId: membership.memberId, membershipId: membership.id, description: ptPackage.name, subtotal: { ...ptPackage.totalPrice }, discount: money(0), tax: money(0), total: { ...ptPackage.totalPrice }, paidAmount: money(0), outstandingAmount: { ...ptPackage.totalPrice }, status: "unpaid", createdAt: nowISO() };
      this.db.charges.push(charge);
      const now = nowISO();
      const order: T.PtPackageOrder = { id: input.idempotencyKey, organizationId: this.db.organization.id, memberId: membership.memberId, packageId: ptPackage.id, chargeId: charge.id, packageNameSnapshot: ptPackage.name, sessionCountSnapshot: ptPackage.sessionCount, totalPriceSnapshot: { ...ptPackage.totalPrice }, validityDaysSnapshot: ptPackage.validityDays, status: "pending_payment", createdAt: now, updatedAt: now };
      this.ptOrders.push(order);
      this.activity({ memberId: membership.memberId, type: "pt_package_requested", title: `${ptPackage.name} requested`, meta: { orderId: order.id, chargeId: charge.id } });
      return { ...order };
    });
  }

  requestCustomerPtPackage(input: T.RequestPtPackageInput): Promise<T.PtPackageOrder> { return this.requestPtPackage(input); }

  cancelPtPackageOrder(orderId: T.UUID, input: T.CancelPtPackageInput): Promise<T.PtPackageOrder> {
    return this.respond(() => {
      this.require("pt.refund");
      this.requireReason(input.reason);
      const idempotencyKey = input.idempotencyKey.trim();
      if (!idempotencyKey) throw ApiError.of(ERR.VALIDATION, "An idempotency key is required.");
      const signature = JSON.stringify({ orderId, reason: input.reason.trim() });
      const order = this.ptOrders.find((item) => item.id === orderId);
      if (!order) throw ApiError.of(ERR.NOT_FOUND, "PT package order not found.");
      const orderScope = this.ptOrderScope(order);
      const prior = this.ptCancellationIdempotency.get(idempotencyKey);
      if (prior) {
        if (prior.signature !== signature) throw ApiError.of(ERR.CONFLICT, "This cancellation key was already used for a different request.");
        if (prior.result.id !== order.id) throw ApiError.of(ERR.CONFLICT, "The cancellation idempotency record does not match the requested order.");
        this.ptOrderScope(prior.result);
        return { ...prior.result };
      }
      this.ptOrderScope(order, true);
      if (order.status !== "pending_payment") throw ApiError.of(ERR.VALIDATION, "Only a pending PT package order can be cancelled. Use the PT refund flow after activation.");
      const charge = orderScope.charge;
      if (charge.paidAmount.amount > 0) throw ApiError.of(ERR.VALIDATION, "Refund or void the collected payment before cancelling this PT order.");
      charge.status = "void";
      charge.outstandingAmount = money(0);
      order.status = "cancelled";
      order.cancelledAt = nowISO();
      order.cancellationReason = input.reason.trim();
      order.updatedAt = nowISO();
      this.activity({ memberId: order.memberId, type: "pt_package_cancelled", title: "PT package order cancelled", body: input.reason, meta: { orderId: order.id, chargeId: order.chargeId } });
      this.audit({ category: "payments", action: "pt.package.cancel", entityType: "pt_package_order", entityId: order.id, entityLabel: order.memberId, summary: "Cancelled pending PT package order and voided unpaid charge", reason: input.reason });
      this.ptCancellationIdempotency.set(idempotencyKey, { signature, result: { ...order } });
      return { ...order };
    });
  }

  refundPtPackage(orderId: T.UUID, input: T.RefundPtPackageInput): Promise<T.PtPackageOrder> {
    return this.respond(() => {
      this.require("pt.refund"); this.requireReason(input.reason);
      const order = this.ptOrders.find((item) => item.id === orderId);
      const entitlement = order?.entitlementId ? this.ptEntitlements.find((item) => item.id === order.entitlementId) : undefined;
      if (!order || !entitlement || input.sessions < 1 || input.sessions > ptAvailableCredits(entitlement)) throw ApiError.of(ERR.VALIDATION, "Only unused PT credits can be refunded.");
      entitlement.revoked += input.sessions; entitlement.available = ptAvailableCredits(entitlement); entitlement.updatedAt = nowISO();
      const ptPackage = this.ptPackages.find((item) => item.id === order.packageId);
      const totalPriceMinor = order.totalPriceSnapshot?.amount ?? ptPackage?.totalPrice.amount ?? 0;
      const totalSessions = order.sessionCountSnapshot ?? ptPackage?.sessionCount ?? 0;
      if (totalPriceMinor <= 0 || totalSessions <= 0) throw ApiError.of(ERR.NOT_FOUND, "PT package terms not found.");
      const refundedSessions = (order.refundedSessions ?? 0) + input.sessions;
      order.refundedSessions = refundedSessions;
      order.refundedAmount = money(Math.floor((totalPriceMinor * refundedSessions) / totalSessions));
      order.status = entitlement.available === 0 ? "refunded" : "partially_refunded"; order.updatedAt = nowISO();
      this.activity({ memberId: order.memberId, type: "pt_credit_refunded", title: `${input.sessions} PT credit${input.sessions === 1 ? "" : "s"} refunded`, body: input.reason, meta: { orderId } });
      return { ...order };
    });
  }

  previewPtIntroductoryCredits(sessionCount = 2): Promise<T.PtIntroductoryCreditPreview> {
    return this.respond(() => {
      this.require("pt.manage");
      const active = this.db.memberships.filter((membership) => ["active", "expiring"].includes(this.membershipStatusOf(membership)));
      const alreadyGranted = active.filter((membership) => this.ptEntitlements.some((item) => item.membershipId === membership.id && item.source === "manual")).length;
      return { eligibleMemberships: active.length - alreadyGranted, alreadyGranted, sessionCount };
    });
  }

  applyPtIntroductoryCredits(input: { sessionCount: number; reason: string; idempotencyKey: string }): Promise<T.PtIntroductoryCreditApplyResult> {
    return this.respond(() => {
      this.require("pt.manage"); this.requireReason(input.reason);
      const preview = this.db.memberships.filter((membership) => ["active", "expiring"].includes(this.membershipStatusOf(membership)));
      let grantedMemberships = 0;
      for (const membership of preview) {
        if (this.ptEntitlements.some((item) => item.membershipId === membership.id && item.source === "manual")) continue;
        const now = nowISO();
        this.ptEntitlements.push({ id: mockUuid(), organizationId: this.db.organization.id, memberId: membership.memberId, source: "manual", membershipId: membership.id, granted: input.sessionCount, reserved: 0, consumed: 0, revoked: 0, available: input.sessionCount, expiresAt: `${membership.endDate}T23:59:59.999Z`, status: "active", createdAt: now, updatedAt: now });
        grantedMemberships += 1;
      }
      this.audit({ category: "memberships", action: "pt.introductory_credits.apply", entityType: "pt_credit_migration", entityId: input.idempotencyKey, entityLabel: "Existing active memberships", summary: `Granted introductory PT credits to ${grantedMemberships} memberships`, reason: input.reason });
      return { eligibleMemberships: 0, alreadyGranted: preview.length, sessionCount: input.sessionCount, grantedMemberships, migrationId: input.idempotencyKey };
    });
  }

  // -------------------------------------------------------------------------
  // memberships
  listMemberships(query: MembershipListQuery): Promise<T.Page<T.MembershipSummary>> {
    return this.respond(() => {
      this.require("members.read");
      const branchId = this.branchScopedBranchId(query.branchId);
      let items = this.db.memberships.map((m) => this.toMembershipSummary(m));
      if (branchId) items = items.filter((m) => m.homeBranchId === branchId);
      if (query.memberId) items = items.filter((m) => m.memberId === query.memberId);
      if (query.status) items = items.filter((m) => m.status === query.status);
      if (query.paymentStatus) items = items.filter((m) => m.paymentStatus === query.paymentStatus);
      items = items.filter((m) => this.matchesSearch([m.memberName, m.memberNumber, m.planName], query.search));
      items = applySort(items, query.sort ?? "-endDate", (m, k) => {
        switch (k) {
          case "endDate": return m.endDate;
          case "startDate": return m.startDate;
          case "memberName": return m.memberName;
          default: return m.endDate;
        }
      });
      return paginate(this.maybeEmpty(items), query);
    });
  }

  getMembership(membershipId: T.UUID): Promise<T.MembershipDetail> {
    return this.respond(() => {
      this.require("members.read");
      const record = this.db.memberships.find((m) => m.id === membershipId);
      if (!record) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      const member = this.db.members.find((m) => m.id === record.memberId)!;
      const plan = this.db.plans.find((p) => p.id === record.planId)!;
      return {
        ...this.toMembership(record),
        member: this.toMemberSummary(member),
        plan: this.toPlan(plan),
        charge: this.chargeProjection(this.db.charges.find((c) => c.membershipId === record.id)),
        adjustments: record.adjustments,
        freezes: record.freezes,
      };
    });
  }

  subscribeMembership(membershipId: T.UUID, onValue: (membership: T.MembershipDetail) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getMembership(membershipId), onValue, onError);
  }

  private buildSale(args: {
    memberId: T.UUID;
    planId: T.UUID;
    startDate: T.ISODate;
    priceOverride?: T.Money;
    overrideReason?: string;
    discount?: T.Money;
    discountReason?: string;
    payment?: { amount: T.Money; method: T.PaymentMethodKey; externalReference?: string };
    previousMembershipId?: T.UUID;
    operation?: "sale" | "renewal" | "plan_change";
    previousPlanId?: T.UUID;
    reason?: string;
    standardStartDate?: T.ISODate;
    idempotencyKey?: string;
    soldBy: T.UUID;
  }): T.MembershipSaleResult {
    const member = this.db.members.find((m) => m.id === args.memberId);
    if (!member) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
    const plan = this.db.plans.find((p) => p.id === args.planId);
    if (!plan || plan.status !== "active") throw ApiError.of(ERR.NOT_FOUND, "Plan not found or inactive.");

    const priceMinor = args.priceOverride?.amount ?? plan.basePrice.amount;
    const priceOverride = Boolean(args.priceOverride && args.priceOverride.amount !== plan.basePrice.amount);
    const dateOverride = Boolean(args.standardStartDate && args.startDate !== args.standardStartDate);
    if (priceOverride || dateOverride) {
      this.require("memberships.override_dates");
      this.requireReason(args.overrideReason);
    }
    const discountMinor = Math.min(args.discount?.amount ?? 0, priceMinor);
    if (discountMinor > 0) {
      this.require("payments.discount");
      if (!args.discountReason?.trim()) {
        throw ApiError.of(ERR.VALIDATION, "A reason is required for discounts.", { fieldErrors: { discountReason: ["Required when a discount is applied"] } });
      }
    }
    const approvalPending = discountNeedsApproval(this.db.roles, currentRole(this.db), discountMinor);
    const operation = args.operation ?? (args.previousMembershipId ? "renewal" : "sale");
    const idempotencyKey = args.idempotencyKey?.trim();
    const idempotencyMapKey = idempotencyKey ? `${operation}:${idempotencyKey}` : undefined;
    const idempotencySignature = idempotencyKey ? JSON.stringify({ ...args, idempotencyKey }) : undefined;
    if (idempotencyMapKey && idempotencySignature) {
      const existing = this.membershipSaleIdempotency.get(idempotencyMapKey);
      if (existing) {
        if (existing.signature !== idempotencySignature) throw ApiError.of(ERR.VALIDATION, "This idempotency key was already used for a different membership sale.");
        return existing.result;
      }
    }

    const duration = plan.kind === "visits" ? (plan.visitValidityDays ?? 90) : (plan.durationDays ?? 30);
    const endDate = addDays(args.startDate, duration);
    if (!this.db.operationalPolicies.membership.allowOverlappingMemberships) {
      const overlap = this.db.memberships.some((membership) =>
        membership.memberId === member.id &&
        membership.id !== args.previousMembershipId &&
        !membership.cancelledAt &&
        args.startDate <= membership.endDate &&
        membership.startDate <= endDate,
      );
      if (overlap) throw ApiError.of(ERR.CONFLICT, "This member already has a membership covering part of the selected term.");
    }
    const recordId = mockUuid();
    const record: MembershipRecord = {
      id: recordId,
      organizationId: this.db.organization.id,
      memberId: member.id,
      planId: plan.id,
      homeBranchId: member.homeBranchId,
      startDate: args.startDate,
      endDate,
      totalVisits: plan.kind === "visits" ? plan.visitAllowance : undefined,
      remainingVisits: plan.kind === "visits" ? plan.visitAllowance : undefined,
      salePrice: money(priceMinor),
      discount: money(discountMinor),
      discountReason: args.discountReason,
      discountApprovalStatus: discountMinor > 0 ? (approvalPending ? "pending" : "approved") : "none",
      soldById: args.soldBy,
      previousMembershipId: args.previousMembershipId,
      frozenDaysUsed: 0,
      freezes: [],
      adjustments: args.operation === "plan_change" ? [{
        id: mockUuid(),
        membershipId: recordId,
        type: "plan_change",
        reason: args.reason ?? "Membership plan changed",
        actorId: args.soldBy,
        before: { planId: args.previousPlanId ?? "" },
        after: { planId: plan.id, effectiveDate: args.startDate },
        approvalStatus: "not_required",
        createdAt: nowISO(),
      }] : [],
      createdAt: nowISO(),
    };
    this.db.memberships.push(record);

    const totalMinor = priceMinor - discountMinor;
    const charge: T.Charge = {
      id: mockUuid(),
      organizationId: this.db.organization.id,
      memberId: member.id,
      membershipId: record.id,
      description: `${plan.name} membership`,
      subtotal: money(priceMinor),
      discount: money(discountMinor),
      tax: money(0),
      total: money(totalMinor),
      paidAmount: money(0),
      outstandingAmount: money(totalMinor),
      status: totalMinor === 0 ? "paid" : "unpaid",
      issueDate: this.today(),
      dueDate: args.startDate > this.today() ? args.startDate : this.today(),
      createdAt: nowISO(),
    };
    this.db.charges.push(charge);

    const isPlanChange = operation === "plan_change";
    const isRenewal = operation === "renewal";
    const timelineIds: T.UUID[] = [];
    timelineIds.push(
      this.activity({
        memberId: member.id,
        type: isPlanChange ? "membership_plan_changed" : isRenewal ? "membership_renewed" : "membership_sold",
        title: isPlanChange ? `Membership plan changed to ${plan.name}` : `${plan.name} ${isRenewal ? "membership renewed" : "membership sold"}`,
        body: isPlanChange ? `${args.reason ?? "Plan change"} Effective ${record.startDate}; no proration applied.` : `Term ${record.startDate} → ${record.endDate}.`,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { membershipId: record.id },
      }).id,
    );

    if (discountMinor > 0) {
      this.audit({
        category: "payments",
        action: "membership.discount",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: approvalPending
          ? `Discount of JOD ${(discountMinor / 1000).toFixed(3)} exceeds limit — approval requested`
          : `Discount of JOD ${(discountMinor / 1000).toFixed(3)} applied`,
        reason: args.discountReason,
        before: { price: priceMinor, discount: 0, approvalStatus: "none" },
        after: { price: priceMinor, discount: discountMinor, approvalStatus: approvalPending ? "pending" : "approved" },
        approvalStatus: approvalPending ? "pending" : "approved",
        branchId: member.homeBranchId,
      });
    }

    if (priceOverride) {
      this.audit({
        category: "payments",
        action: "membership.price_override",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: `Price override: JOD ${(priceMinor / 1000).toFixed(3)}`,
        reason: args.overrideReason,
        before: { price: plan.basePrice.amount },
        after: { price: priceMinor },
        branchId: member.homeBranchId,
      });
    }
    if (dateOverride) {
      this.audit({
        category: "memberships",
        action: "membership.date_override",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: `Start date overridden to ${args.startDate}`,
        reason: args.overrideReason,
        before: { startDate: args.standardStartDate ?? null },
        after: { startDate: args.startDate },
        branchId: member.homeBranchId,
      });
    }

    let payment: T.Payment | undefined;
    let receipt: T.Receipt | undefined;
    if (args.payment && args.payment.amount.amount > 0) {
      const result = this.recordPayment({
        memberId: member.id,
        chargeId: charge.id,
        amount: args.payment.amount,
        method: args.payment.method,
        externalReference: args.payment.externalReference,
        idempotencyKey: `sale-${record.id}`,
      });
      payment = result.payment;
      receipt = result.receipt;
      timelineIds.push(result.timelineEventId);
    }

    this.audit({
      category: "memberships",
      action: isPlanChange ? "membership.plan_change" : isRenewal ? "membership.renew" : "membership.sale",
      entityType: "membership",
      entityId: record.id,
      entityLabel: `${member.fullName} · ${member.memberNumber}`,
      summary: `${plan.name} — JOD ${(totalMinor / 1000).toFixed(3)}`,
      after: { startDate: record.startDate, endDate: record.endDate, total: totalMinor },
      branchId: member.homeBranchId,
    });

    const result = { membership: this.toMembership(record), charge, payment, receipt, timelineEventIds: timelineIds };
    if (idempotencyMapKey && idempotencySignature) this.membershipSaleIdempotency.set(idempotencyMapKey, { signature: idempotencySignature, result });
    return result;
  }

  createMembershipSale(input: T.CreateMembershipSaleInput): Promise<T.MembershipSaleResult> {
    return this.respond(() => {
      this.require("memberships.sell");
      return this.buildSale({ ...input, standardStartDate: this.today(), soldBy: this.actor().id });
    });
  }

  renewMembership(membershipId: T.UUID, input: T.RenewMembershipInput): Promise<T.MembershipSaleResult> {
    return this.respond(() => {
      this.require("memberships.sell");
      const old = this.db.memberships.find((m) => m.id === membershipId);
      if (!old) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      const status = this.membershipStatusOf(old);
      if (status === "cancelled") throw ApiError.of(ERR.MEMBERSHIP_NOT_ACTIVE, "Cancelled memberships cannot be renewed; create a new sale.");
      const today = this.today();
      const startDate = input.startDate ?? (old.endDate >= today ? addDays(old.endDate, 1) : today);
      return this.buildSale({
        memberId: old.memberId,
        planId: input.planId ?? old.planId,
        startDate,
        priceOverride: input.priceOverride,
        overrideReason: input.overrideReason,
        discount: input.discount,
        discountReason: input.discountReason,
        payment: input.payment,
        idempotencyKey: input.idempotencyKey,
        previousMembershipId: old.id,
        operation: "renewal",
        standardStartDate: old.endDate >= today ? addDays(old.endDate, 1) : today,
        soldBy: this.actor().id,
      });
    });
  }

  changeMembershipPlan(membershipId: T.UUID, input: T.ChangeMembershipPlanInput): Promise<T.MembershipSaleResult> {
    return this.respond(() => {
      this.require("memberships.sell");
      this.requireReason(input.reason);
      const old = this.db.memberships.find((membership) => membership.id === membershipId);
      if (!old) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      const status = this.membershipStatusOf(old);
      if (status === "cancelled") throw ApiError.of(ERR.MEMBERSHIP_NOT_ACTIVE, "Cancelled memberships cannot change plans.");
      if (old.planId === input.planId) throw ApiError.of(ERR.VALIDATION, "Choose a different plan.");
      const effectiveDate = input.effectiveDate ?? "next_renewal";
      if (effectiveDate === "immediate") {
        this.require("memberships.override_dates");
        if (status !== "active" && status !== "expiring") throw ApiError.of(ERR.MEMBERSHIP_NOT_ACTIVE, "Immediate plan changes require an active membership.");
      }
      const result = this.buildSale({
        memberId: old.memberId,
        planId: input.planId,
        startDate: effectiveDate === "immediate" ? this.today() : old.endDate >= this.today() ? addDays(old.endDate, 1) : this.today(),
        previousMembershipId: old.id,
        previousPlanId: old.planId,
        operation: "plan_change",
        reason: input.reason,
        soldBy: this.actor().id,
      });
      if (effectiveDate === "immediate") {
        const previousEndDate = old.endDate;
        old.cancelledAt = nowISO();
        old.cancellationReason = `Superseded by plan change: ${input.reason}`;
        old.adjustments.push({
          id: mockUuid(),
          membershipId: old.id,
          type: "plan_change",
          reason: input.reason,
          actorId: this.actor().id,
          before: { planId: old.planId, endDate: previousEndDate },
          after: { planId: input.planId, successorMembershipId: result.membership.id },
          approvalStatus: "not_required",
          createdAt: nowISO(),
        });
      }
      this.audit({
        category: "memberships",
        action: "membership.plan_change",
        entityType: "membership",
        entityId: result.membership.id,
        entityLabel: `${this.db.members.find((member) => member.id === old.memberId)?.fullName ?? "Member"}`,
        summary: `Plan changed (${effectiveDate === "immediate" ? "immediate" : "next renewal"}) — no proration`,
        reason: input.reason,
        before: { planId: old.planId, effectiveDate },
        after: { planId: input.planId, successorMembershipId: result.membership.id },
        branchId: old.homeBranchId,
      });
      return result;
    });
  }

  freezeMembership(membershipId: T.UUID, input: T.FreezeMembershipInput): Promise<T.MembershipDetail> {
    return this.respond(() => {
      this.require("memberships.freeze");
      this.requireReason(input.reason);
      const record = this.db.memberships.find((m) => m.id === membershipId);
      if (!record) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      const status = this.membershipStatusOf(record);
      if (status !== "active" && status !== "expiring") {
        throw ApiError.of(ERR.MEMBERSHIP_NOT_ACTIVE, `Cannot freeze a membership in “${status}” state.`);
      }
      const plan = this.db.plans.find((p) => p.id === record.planId)!;
      const today = this.today();
      if (record.activeFreeze?.status === "active") {
        if (record.activeFreeze.endDate >= today) throw ApiError.of(ERR.CONFLICT, "This membership already has a scheduled or active freeze.");
        record.frozenDaysUsed += diffDays(record.activeFreeze.startDate, record.activeFreeze.endDate) + 1;
        record.activeFreeze.status = "completed";
        record.activeFreeze = undefined;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) throw ApiError.of(ERR.VALIDATION, "Freeze dates must be calendar dates.");
      if (input.startDate < today) throw ApiError.of(ERR.VALIDATION, "A freeze cannot begin before today.");
      if (input.startDate > record.endDate) throw ApiError.of(ERR.VALIDATION, "A freeze must begin during the current membership term.");
      const days = diffDays(input.startDate, input.endDate) + 1;
      if (days <= 0) throw ApiError.of(ERR.VALIDATION, "Freeze end must be on or after the start date.");
      if (days < this.db.operationalPolicies.membership.minimumFreezeDays) throw ApiError.of(ERR.VALIDATION, `A freeze must be at least ${this.db.operationalPolicies.membership.minimumFreezeDays} days.`);
      const remainingAllowance = plan.freezeAllowanceDays - record.frozenDaysUsed;
      if (days > remainingAllowance) {
        throw ApiError.of(
          ERR.FREEZE_ALLOWANCE_EXCEEDED,
          `This plan allows ${plan.freezeAllowanceDays} freeze days total; ${Math.max(0, remainingAllowance)} remain.`,
        );
      }
      const freeze: T.FreezePeriod = {
        id: mockUuid(),
        membershipId: record.id,
        startDate: input.startDate,
        endDate: input.endDate,
        status: "active",
        reason: input.reason,
        createdById: this.actor().id,
        createdAt: nowISO(),
      };
      const oldEnd = record.endDate;
      record.freezes.push(freeze);
      record.activeFreeze = freeze;
      record.endDate = addDays(record.endDate, days);
      record.adjustments.push({
        id: mockUuid(),
        membershipId: record.id,
        type: "freeze",
        reason: input.reason,
        actorId: this.actor().id,
        before: { endDate: oldEnd },
        after: { endDate: record.endDate },
        approvalStatus: "not_required",
        createdAt: nowISO(),
      });
      const member = this.db.members.find((m) => m.id === record.memberId)!;
      this.activity({
        memberId: record.memberId,
        type: "membership_frozen",
        title: `Membership frozen ${input.startDate} → ${input.endDate}`,
        body: input.reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { membershipId: record.id },
      });
      this.audit({
        category: "memberships",
        action: "membership.freeze",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: `Frozen ${days} day${days === 1 ? "" : "s"} — expiry ${oldEnd} → ${record.endDate}`,
        reason: input.reason,
        before: { endDate: oldEnd },
        after: { endDate: record.endDate },
        branchId: record.homeBranchId,
      });
      return this.getMembershipSync(record);
    });
  }

  unfreezeMembership(membershipId: T.UUID, input: { reason: string }): Promise<T.MembershipDetail> {
    return this.respond(() => {
      this.require("memberships.freeze");
      this.requireReason(input.reason);
      const record = this.db.memberships.find((m) => m.id === membershipId);
      if (!record?.activeFreeze) throw ApiError.of(ERR.NOT_FOUND, "No active freeze on this membership.");
      const freeze = record.activeFreeze;
      const today = this.today();
      if (freeze.startDate > today || freeze.endDate < today) throw ApiError.of(ERR.VALIDATION, "Only a freeze currently in progress can be ended early.");
      const plannedDays = diffDays(freeze.startDate, freeze.endDate) + 1;
      const usedDays = Math.max(1, diffDays(freeze.startDate, today) + 1);
      const unusedDays = Math.max(0, plannedDays - usedDays);
      const oldEnd = record.endDate;
      freeze.status = "completed";
      freeze.endDate = today;
      record.activeFreeze = undefined;
      record.frozenDaysUsed += usedDays;
      record.endDate = addDays(record.endDate, -unusedDays);
      record.adjustments.push({
        id: mockUuid(),
        membershipId: record.id,
        type: "unfreeze",
        reason: input.reason,
        actorId: this.actor().id,
        before: { endDate: oldEnd, freezeEnd: freeze.endDate },
        after: { endDate: record.endDate },
        approvalStatus: "not_required",
        createdAt: nowISO(),
      });
      const member = this.db.members.find((m) => m.id === record.memberId)!;
      this.activity({
        memberId: record.memberId,
        type: "membership_unfrozen",
        title: "Freeze ended early",
        body: input.reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { membershipId: record.id },
      });
      this.audit({
        category: "memberships",
        action: "membership.unfreeze",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: `Freeze ended early — expiry ${oldEnd} → ${record.endDate}`,
        reason: input.reason,
        before: { endDate: oldEnd },
        after: { endDate: record.endDate },
        branchId: record.homeBranchId,
      });
      return this.getMembershipSync(record);
    });
  }

  extendMembership(membershipId: T.UUID, input: T.ExtendMembershipInput): Promise<T.MembershipDetail> {
    return this.respond(() => {
      this.require("memberships.override_dates");
      this.requireReason(input.reason);
      const maximumExtensionDays = this.db.operationalPolicies.membership.maximumExtensionDays;
      if (input.days <= 0 || input.days > maximumExtensionDays) throw ApiError.of(ERR.VALIDATION, `Extension must be between 1 and ${maximumExtensionDays} days.`);
      const record = this.db.memberships.find((m) => m.id === membershipId);
      if (!record) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      const oldEnd = record.endDate;
      record.endDate = addDays(record.endDate, input.days);
      record.adjustments.push({
        id: mockUuid(),
        membershipId: record.id,
        type: "extension",
        reason: input.reason,
        actorId: this.actor().id,
        before: { endDate: oldEnd },
        after: { endDate: record.endDate },
        approvalStatus: "not_required",
        createdAt: nowISO(),
      });
      const member = this.db.members.find((m) => m.id === record.memberId)!;
      this.activity({
        memberId: record.memberId,
        type: "membership_extended",
        title: `Membership extended by ${input.days} day${input.days === 1 ? "" : "s"}`,
        body: input.reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { membershipId: record.id },
      });
      this.audit({
        category: "memberships",
        action: "membership.date_override",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: `Extended ${input.days} days — expiry ${oldEnd} → ${record.endDate}`,
        reason: input.reason,
        before: { endDate: oldEnd },
        after: { endDate: record.endDate },
        branchId: record.homeBranchId,
      });
      return this.getMembershipSync(record);
    });
  }

  cancelMembership(membershipId: T.UUID, input: T.CancelMembershipInput): Promise<T.MembershipDetail> {
    return this.respond(() => {
      this.require("memberships.freeze"); // managers+ only via role matrix
      this.requireReason(input.reason);
      const record = this.db.memberships.find((m) => m.id === membershipId);
      if (!record) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      if (record.cancelledAt) throw ApiError.of(ERR.VALIDATION, "Membership is already cancelled.");
      const wasScheduled = this.membershipStatusOf(record) === "scheduled";
      record.cancelledAt = nowISO();
      record.cancellationReason = input.reason;
      record.activeFreeze = undefined;
      if (wasScheduled) {
        const charge = this.db.charges.find((candidate) => candidate.membershipId === record.id);
        if (charge && charge.paidAmount.amount === 0) {
          charge.status = "void";
          charge.outstandingAmount = money(0);
        }
      }
      record.adjustments.push({
        id: mockUuid(),
        membershipId: record.id,
        type: "cancellation",
        reason: input.reason,
        actorId: this.actor().id,
        before: { status: "active" },
        after: { status: "cancelled" },
        approvalStatus: "not_required",
        createdAt: nowISO(),
      });
      const member = this.db.members.find((m) => m.id === record.memberId)!;
      this.activity({
        memberId: record.memberId,
        type: "membership_cancelled",
        title: "Membership cancelled",
        body: input.reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { membershipId: record.id },
      });
      this.audit({
        category: "memberships",
        action: "membership.cancel",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: "Membership cancelled",
        reason: input.reason,
        before: { endDate: record.endDate },
        after: { status: "cancelled" },
        branchId: record.homeBranchId,
      });
      return this.getMembershipSync(record);
    });
  }

  transferMembership(membershipId: T.UUID, input: T.TransferMembershipInput): Promise<T.MembershipDetail> {
    return this.respond(() => {
      this.require("memberships.override_dates");
      this.requireReason(input.reason);
      const record = this.db.memberships.find((membership) => membership.id === membershipId);
      if (!record) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      if (!this.branchIsVisible(record.homeBranchId)) throw ApiError.of(ERR.NOT_FOUND, "Membership not found.");
      if (record.cancelledAt) throw ApiError.of(ERR.VALIDATION, "Cancelled memberships cannot be transferred.");
      const branch = this.db.branches.find((candidate) => candidate.id === input.branchId && candidate.status === "active");
      if (!branch) throw ApiError.of(ERR.NOT_FOUND, "Destination branch not found or inactive.");
      if (!this.branchIsVisible(input.branchId)) throw ApiError.of(ERR.FORBIDDEN, "You do not have access to the destination branch.");
      const transferKey = input.idempotencyKey?.trim();
      const transferSignature = transferKey ? JSON.stringify({ membershipId, branchId: input.branchId, reason: input.reason }) : undefined;
      if (transferKey && transferSignature) {
        const existing = this.membershipTransferIdempotency.get(transferKey);
        if (existing) {
          if (existing.signature !== transferSignature) throw ApiError.of(ERR.VALIDATION, "This idempotency key was already used for a different membership transfer.");
          return existing.result;
        }
      }
      const plan = this.db.plans.find((candidate) => candidate.id === record.planId);
      if (plan?.branchAccess === "selected" && !plan.branchIds.includes(input.branchId)) {
        throw ApiError.of(ERR.VALIDATION, "This membership plan is not available at the destination branch.");
      }
      if (record.homeBranchId === input.branchId) throw ApiError.of(ERR.VALIDATION, "Membership is already assigned to this branch.");
      const previousBranchId = record.homeBranchId;
      record.homeBranchId = input.branchId;
      record.adjustments.push({
        id: mockUuid(),
        membershipId: record.id,
        type: "branch_transfer",
        reason: input.reason,
        actorId: this.actor().id,
        before: { branchId: previousBranchId },
        after: { branchId: input.branchId },
        approvalStatus: "not_required",
        createdAt: nowISO(),
      });
      const member = this.db.members.find((candidate) => candidate.id === record.memberId)!;
      if (member.homeBranchId === previousBranchId) member.homeBranchId = input.branchId;
      const previousBranch = this.db.branches.find((candidate) => candidate.id === previousBranchId);
      this.activity({
        memberId: record.memberId,
        type: "membership_transferred",
        title: `Membership transferred to ${branch.name}`,
        body: input.reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { membershipId: record.id, previousBranchId, branchId: input.branchId },
      });
      this.audit({
        category: "memberships",
        action: "membership.branch_transfer",
        entityType: "membership",
        entityId: record.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: `Transferred ${previousBranch?.name ?? "branch"} → ${branch.name}`,
        reason: input.reason,
        before: { branchId: previousBranchId },
        after: { branchId: input.branchId },
        branchId: input.branchId,
      });
      const result = this.getMembershipSync(record);
      if (transferKey && transferSignature) this.membershipTransferIdempotency.set(transferKey, { signature: transferSignature, result });
      return result;
    });
  }

  private getMembershipSync(record: MembershipRecord): T.MembershipDetail {
    const member = this.db.members.find((m) => m.id === record.memberId)!;
    const plan = this.db.plans.find((p) => p.id === record.planId)!;
    return {
      ...this.toMembership(record),
      member: this.toMemberSummary(member),
      plan: this.toPlan(plan),
      charge: this.chargeProjection(this.db.charges.find((c) => c.membershipId === record.id)),
      adjustments: record.adjustments,
      freezes: record.freezes,
    };
  }

  // -------------------------------------------------------------------------
  // CRM
  // -------------------------------------------------------------------------

  listLeads(query: LeadListQuery): Promise<T.Page<T.LeadSummary>> {
    return this.respond(() => {
      this.require("crm.read");
      const branchId = this.branchScopedBranchId(query.branchId);
      const memberById = new Map(this.db.members.map((member) => [member.id, member]));
      // Converted leads are no longer actionable. Hide their old CRM record
      // when the linked member is archived (or permanently removed), so the
      // follow-up queues cannot resurrect stale work.
      let items = this.db.leads
        .filter((lead) => {
          if (!lead.convertedMemberId) return true;
          const member = memberById.get(lead.convertedMemberId);
          return Boolean(member && member.status !== "archived");
        })
        .map((l) => this.toLeadSummary(l));
      if (branchId) items = items.filter((l) => l.branchId === branchId);
      if (query.stage) {
        const stages = Array.isArray(query.stage) ? query.stage : [query.stage];
        items = items.filter((l) => stages.includes(l.stage));
      }
      if (query.ownerId === "unassigned") items = items.filter((l) => !l.ownerId);
      else if (query.ownerId) items = items.filter((l) => l.ownerId === query.ownerId);
      if (query.overdueOnly) items = items.filter((l) => l.overdue);
      items = items.filter((l) => this.matchesSearch([l.fullName, l.phone, l.email], query.search));
      items = applySort(items, query.sort ?? "-createdAt", (l, k) => {
        switch (k) {
          case "createdAt": return l.createdAt;
          case "nextFollowUpAt": return l.nextFollowUpAt;
          case "expectedValue": return l.expectedValue?.amount;
          case "fullName": return l.fullName;
          default: return l.createdAt;
        }
      });
      return paginate(this.maybeEmpty(items), query);
    });
  }

  async subscribeLeads(query: LeadListQuery, onValue: (page: T.Page<T.LeadSummary>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    try {
      onValue(await this.listLeads(query));
    } catch (error) {
      onError?.(error);
    }
    return () => undefined;
  }

  getLead(leadId: T.UUID): Promise<T.LeadDetail> {
    return this.respond(() => {
      this.require("crm.read");
      const lead = this.db.leads.find((l) => l.id === leadId);
      if (!lead) throw ApiError.of(ERR.NOT_FOUND, "Lead not found.");
      const activities = this.db.activities.filter((a) => a.leadId === leadId);
      const offers = this.db.offers.filter((o) => o.leadId === leadId).map((offer) => this.projectOffer(offer));
      const trialBooking = this.trialBookings.find((booking) => booking.leadId === leadId);
      return { ...this.toLeadSummary(lead), notes: lead.notes, activities, offers, ...(trialBooking ? { trialBooking: { ...trialBooking } } : {}) };
    });
  }

  subscribeLead(leadId: T.UUID, onValue: (lead: T.LeadDetail) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getLead(leadId), onValue, onError);
  }

  createLead(input: T.CreateLeadInput): Promise<T.LeadDetail> {
    return this.respond(() => {
      this.require("crm.write");
      const requestedOwnerId = input.ownerId;
      if (requestedOwnerId && requestedOwnerId !== "unassigned" && requestedOwnerId !== this.actor().id) {
        this.require("crm.assign");
        const owner = this.db.users.find((user) => user.id === requestedOwnerId && user.status === "active");
        if (!owner || !["owner", "manager", "salesperson"].includes(owner.role)) throw ApiError.of(ERR.NOT_FOUND, "Lead owner not found.");
      }
      const lead: T.Lead = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        branchId: input.branchId,
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim().toLowerCase() || undefined,
        stage: "new",
        source: input.source,
        ownerId: input.ownerId === "unassigned" ? undefined : input.ownerId ?? this.actor().id,
        expectedValue: input.expectedValue,
        nextFollowUpAt: input.nextFollowUpAt,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      this.db.leads.push(lead);
      if (input.notes) {
        (this.db.leads.find((l) => l.id === lead.id) as { notes?: string }).notes = input.notes;
      }
      this.activity({
        leadId: lead.id,
        type: "member_created",
        title: "Lead captured",
        body: input.notes,
        actorId: this.actor().id,
        actorName: this.actor().name,
      });
      return this.getLeadSync(lead.id);
    });
  }

  private getLeadSync(leadId: T.UUID): T.LeadDetail {
    const lead = this.db.leads.find((l) => l.id === leadId)!;
    return {
      ...this.toLeadSummary(lead),
      notes: lead.notes,
      activities: this.db.activities.filter((a) => a.leadId === leadId),
      offers: this.db.offers.filter((o) => o.leadId === leadId).map((offer) => this.projectOffer(offer)),
      trialBooking: this.trialBookings.find((booking) => booking.leadId === leadId),
    };
  }

  updateLead(leadId: T.UUID, input: T.UpdateLeadInput): Promise<T.LeadDetail> {
    return this.respond(() => {
      this.require("crm.write");
      const lead = this.db.leads.find((l) => l.id === leadId);
      if (!lead) throw ApiError.of(ERR.NOT_FOUND, "Lead not found.");
      if (input.ownerId && input.ownerId !== lead.ownerId) this.require("crm.assign");
      Object.assign(lead, input, { updatedAt: nowISO() });
      return this.getLeadSync(leadId);
    });
  }

  logContactAttempt(leadId: T.UUID, input: T.ContactAttemptInput): Promise<T.LeadDetail> {
    return this.respond(() => {
      this.require("crm.write");
      const lead = this.db.leads.find((l) => l.id === leadId);
      if (!lead) throw ApiError.of(ERR.NOT_FOUND, "Lead not found.");
      if (input.stage) lead.stage = input.stage;
      else if (lead.stage === "new") lead.stage = "attempted";
      if (input.nextFollowUpAt !== undefined) lead.nextFollowUpAt = input.nextFollowUpAt || undefined;
      lead.updatedAt = nowISO();
      const outcomeLabels: Record<T.ContactOutcome, string> = {
        no_answer: "No answer",
        answered_interested: "Answered — interested",
        answered_not_interested: "Answered — not interested",
        answered_call_back: "Asked for a callback",
        wrong_number: "Wrong number",
        whatsapp_sent: "WhatsApp sent",
        trial_booked: "Trial booked",
        trial_completed: "Trial completed",
      };
      this.activity({
        leadId,
        type: "call_attempt",
        title: `Call — ${outcomeLabels[input.outcome].toLowerCase()}`,
        body: input.notes,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { outcome: input.outcome },
      });
      return this.getLeadSync(leadId);
    });
  }

  scheduleLeadTrial(leadId: T.UUID, input: T.ScheduleLeadTrialInput): Promise<T.LeadDetail> {
    return this.respond(() => {
      this.require("crm.write");
      const lead = this.db.leads.find((item) => item.id === leadId);
      if (!lead || !this.branchIsVisible(lead.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Lead not found.");
      if (lead.stage === "won" || lead.stage === "lost") throw ApiError.of(ERR.VALIDATION, "Closed leads cannot be scheduled for a trial.");
      if (this.trialBookings.some((booking) => booking.leadId === leadId)) throw ApiError.of(ERR.CONFLICT, "This lead already has a trial.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.preferredDate) || !/^\d{2}:\d{2}$/.test(input.preferredTime) || new Date(`${input.preferredDate}T${input.preferredTime}:00+03:00`).getTime() <= Date.now()) throw ApiError.of(ERR.VALIDATION, "Choose a future trial date and time.");
      const booking: T.LeadTrialBooking = {
        id: mockUuid(),
        gymId: this.db.organization.id,
        branchId: lead.branchId,
        leadId: lead.id,
        fullName: lead.fullName,
        email: lead.email ?? "",
        phone: lead.phone,
        preferredDate: input.preferredDate,
        preferredTime: input.preferredTime,
        goal: input.goal?.trim() || "Gym trial",
        status: "confirmed",
        createdAt: nowISO(),
      };
      this.trialBookings.unshift(booking);
      lead.stage = "trial_booked";
      lead.nextFollowUpAt = new Date(`${input.preferredDate}T${input.preferredTime}:00+03:00`).toISOString();
      lead.updatedAt = nowISO();
      this.activity({ leadId, type: "trial_confirmed", title: "Trial scheduled", body: `${input.preferredDate} · ${input.preferredTime}`, actorId: this.actor().id, actorName: this.actor().name, meta: { bookingId: booking.id } });
      this.audit({ category: "crm", action: "trial.scheduled", entityType: "trial_booking", entityId: booking.id, entityLabel: `${lead.fullName} · ${input.preferredDate} ${input.preferredTime}`, summary: "Trial scheduled by staff", branchId: lead.branchId });
      return this.getLeadSync(lead.id);
    });
  }

  updateTrialBooking(bookingId: T.UUID, input: { status: Extract<T.TrialBookingStatus, "confirmed" | "completed" | "no_show" | "cancelled">; note?: string }): Promise<T.LeadDetail> {
    return this.respond(() => {
      this.require("crm.write");
      const booking = this.trialBookings.find((item) => item.id === bookingId);
      if (!booking?.leadId) throw ApiError.of(ERR.NOT_FOUND, "Trial booking not found.");
      const lead = this.db.leads.find((item) => item.id === booking.leadId);
      if (!lead || !this.branchIsVisible(lead.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Trial booking not found.");
      const transitions: Record<T.TrialBookingStatus, T.TrialBookingStatus[]> = {
        requested: ["confirmed", "completed", "no_show", "cancelled"],
        confirmed: ["completed", "no_show", "cancelled"],
        completed: [],
        no_show: [],
        cancelled: [],
        converted: [],
      };
      if (!transitions[booking.status].includes(input.status)) throw ApiError.of(ERR.VALIDATION, `Trial cannot move from ${booking.status.replaceAll("_", " ")} to ${input.status.replaceAll("_", " ")}.`);
      if ((input.status === "no_show" || input.status === "cancelled") && !input.note?.trim()) throw ApiError.of(ERR.VALIDATION, "Record a reason for this trial outcome.");
      const previous = booking.status;
      booking.status = input.status;
      const followUpAt = new Date(Date.now() + 86_400_000).toISOString();
      if (input.status === "completed") Object.assign(lead, { stage: "trial_completed", nextFollowUpAt: followUpAt });
      else if (input.status === "cancelled") Object.assign(lead, { stage: "lost", lostReason: `Trial cancelled — ${input.note}`, nextFollowUpAt: undefined });
      else if (input.status === "no_show") Object.assign(lead, { stage: "contacted", nextFollowUpAt: followUpAt });
      else lead.stage = "trial_booked";
      lead.updatedAt = nowISO();
      const labels = { confirmed: "Trial confirmed", completed: "Trial completed", no_show: "Trial marked as no-show", cancelled: "Trial cancelled" } as const;
      const eventTypes = { confirmed: "trial_confirmed", completed: "trial_completed", no_show: "trial_no_show", cancelled: "trial_cancelled" } as const;
      this.activity({ leadId: lead.id, type: eventTypes[input.status], title: labels[input.status], body: input.note, actorId: this.actor().id, actorName: this.actor().name, meta: { bookingId, status: input.status } });
      if ((input.status === "completed" || input.status === "no_show") && !this.db.tasks.some((task) => task.leadId === lead.id && task.type === "trial_follow_up" && task.status === "open")) {
        this.db.tasks.push({ id: mockUuid(), organizationId: this.db.organization.id, type: "trial_follow_up", title: input.status === "no_show" ? "Reschedule missed trial" : "Follow up after trial", ownerId: lead.ownerId ?? this.actor().id, ownerName: this.db.users.find((user) => user.id === lead.ownerId)?.name ?? this.actor().name, dueAt: followUpAt, priority: input.status === "no_show" ? "high" : "normal", status: "open", leadId: lead.id, subjectName: lead.fullName, createdById: this.actor().id, createdAt: nowISO() });
      }
      this.audit({ category: "crm", action: `trial.${input.status}`, entityType: "trial_booking", entityId: booking.id, entityLabel: `${booking.fullName} · ${booking.preferredDate} ${booking.preferredTime}`, summary: labels[input.status], reason: input.note, before: { status: previous }, after: { status: input.status }, branchId: lead.branchId });
      return this.getLeadSync(lead.id);
    });
  }

  createOffer(input: { leadId: T.UUID; planId: T.UUID; price: T.Money; expiresInDays?: number }): Promise<T.Offer> {
    return this.respond(() => {
      this.require("crm.write");
      const lead = this.db.leads.find((l) => l.id === input.leadId);
      if (!lead || !this.branchIsVisible(lead.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Lead not found.");
      const plan = this.db.plans.find((p) => p.id === input.planId);
      if (!plan) throw ApiError.of(ERR.NOT_FOUND, "Plan not found.");
      const offer: T.Offer = {
        id: mockUuid(),
        leadId: lead.id,
        planId: plan.id,
        planName: plan.name,
        price: input.price,
        expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000).toISOString() : undefined,
        status: "draft",
        createdById: this.actor().id,
        createdAt: nowISO(),
      };
      this.db.offers.push(offer);
      this.activity({
        leadId: lead.id,
        type: "offer_drafted",
        title: `Offer drafted — ${plan.name} at JOD ${(input.price.amount / 1000).toFixed(3)}`,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { offerId: offer.id },
      });
      return offer;
    });
  }

  markOfferDelivered(offerId: T.UUID, input: { channel: T.OfferDeliveryChannel; reference?: string }): Promise<T.Offer> {
    return this.respond(() => {
      this.require("crm.write");
      const offer = this.db.offers.find((item) => item.id === offerId);
      const lead = offer?.leadId ? this.db.leads.find((item) => item.id === offer.leadId) : undefined;
      if (!offer || !lead || !this.branchIsVisible(lead.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Offer not found.");
      if (offer.status !== "draft") throw ApiError.of(ERR.CONFLICT, "This offer has already been delivered or closed.");
      if (!["email", "whatsapp", "sms", "manual"].includes(input.channel)) throw ApiError.of(ERR.VALIDATION, "Choose a valid delivery channel.");
      if ((input.channel === "email" && !lead.email) || ((input.channel === "whatsapp" || input.channel === "sms") && !lead.phone)) {
        throw ApiError.of(ERR.VALIDATION, `This lead has no ${input.channel === "email" ? "email address" : "phone number"} to record delivery against.`);
      }
      const deliveredAt = nowISO();
      Object.assign(offer, {
        status: "sent" as const,
        deliveryChannel: input.channel,
        deliveredAt,
        deliveredById: this.actor().id,
        deliveryReference: input.reference?.trim() || undefined,
      });
      lead.stage = "offer_sent";
      lead.updatedAt = deliveredAt;
      this.activity({
        leadId: lead.id,
        type: "offer_sent",
        title: `Offer delivery confirmed — ${offer.planName}`,
        body: `${input.channel === "manual" ? "Manual delivery" : input.channel} confirmed${input.reference?.trim() ? ` · ${input.reference.trim()}` : ""}.`,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { offerId: offer.id, channel: input.channel },
      });
      this.audit({
        category: "crm",
        action: "offer.delivered",
        entityType: "offer",
        entityId: offer.id,
        entityLabel: `${offer.planName} · ${lead.fullName}`,
        summary: `Offer delivery confirmed via ${input.channel}`,
        reason: input.reference?.trim() || `Manual ${input.channel} delivery confirmation`,
        before: { status: "draft" },
        after: { status: "sent", deliveryChannel: input.channel },
        branchId: lead.branchId,
      });
      return offer;
    });
  }

  recordOfferOutcome(offerId: T.UUID, input: { outcome: T.OfferOutcome; reason?: string }): Promise<T.Offer> {
    return this.respond(() => {
      this.require("crm.write");
      const offer = this.db.offers.find((item) => item.id === offerId);
      const lead = offer?.leadId ? this.db.leads.find((item) => item.id === offer.leadId) : undefined;
      if (!offer || !lead || !this.branchIsVisible(lead.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Offer not found.");
      if (offer.status !== "sent") throw ApiError.of(ERR.CONFLICT, "Only a delivered offer can receive an outcome.");
      if (offer.expiresAt && new Date(offer.expiresAt).getTime() <= Date.now()) {
        throw ApiError.of(ERR.CONFLICT, "This offer has expired.");
      }
      const reason = input.reason?.trim();
      if (input.outcome === "declined" && (!reason || reason.length < 3)) throw ApiError.of(ERR.VALIDATION, "Record why the offer was declined.");
      if (input.outcome !== "accepted" && input.outcome !== "declined") throw ApiError.of(ERR.VALIDATION, "Choose a valid offer outcome.");
      const respondedAt = nowISO();
      Object.assign(offer, { status: input.outcome, respondedAt, respondedById: this.actor().id, responseReason: reason || undefined });
      if (input.outcome === "declined") {
        lead.stage = "contacted";
        lead.nextFollowUpAt = new Date(Date.now() + 86_400_000).toISOString();
      }
      lead.updatedAt = respondedAt;
      this.activity({
        leadId: lead.id,
        type: input.outcome === "accepted" ? "offer_accepted" : "offer_declined",
        title: `Offer ${input.outcome} — ${offer.planName}`,
        body: reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
        meta: { offerId: offer.id, outcome: input.outcome },
      });
      this.audit({
        category: "crm",
        action: `offer.${input.outcome}`,
        entityType: "offer",
        entityId: offer.id,
        entityLabel: `${offer.planName} · ${lead.fullName}`,
        summary: `Offer ${input.outcome}`,
        reason,
        before: { status: "sent" },
        after: { status: input.outcome },
        branchId: lead.branchId,
      });
      return offer;
    });
  }

  private projectOffer(offer: T.Offer): T.Offer {
    return offer.status === "sent" && offer.expiresAt && Date.parse(offer.expiresAt) <= Date.now()
      ? { ...offer, status: "expired" }
      : offer;
  }

  listTasks(query: TaskListQuery): Promise<T.Page<T.Task>> {
    return this.respond(() => {
      this.require("crm.read");
      const leadById = new Map(this.db.leads.map((lead) => [lead.id, lead]));
      const memberById = new Map(this.db.members.map((member) => [member.id, member]));
      // Keep the mock contract aligned with Convex: closed or deleted
      // records cannot leave actionable follow-up tasks behind. Completed and
      // cancelled tasks remain available as history.
      let items = this.db.tasks.filter((task) => {
        if (task.status !== "open") return true;
        if (task.leadId) {
          const lead = leadById.get(task.leadId);
          if (!lead || lead.stage === "won" || lead.stage === "lost") return false;
          if (lead.convertedMemberId) {
            const member = memberById.get(lead.convertedMemberId);
            if (!member || member.status === "archived") return false;
          }
        }
        if (task.memberId) {
          const member = memberById.get(task.memberId);
          if (!member || member.status === "archived") return false;
        }
        return true;
      });
      if (query.status) items = items.filter((t) => t.status === query.status);
      if (query.ownerId) items = items.filter((t) => t.ownerId === query.ownerId);
      if (query.overdueOnly) items = items.filter((t) => t.status === "open" && t.dueAt < nowISO());
      const dueBefore = query.dueBefore;
      if (dueBefore) items = items.filter((t) => t.dueAt <= dueBefore);
      items = applySort(items, query.sort ?? "dueAt", (t, k) => (k === "dueAt" ? t.dueAt : t.createdAt));
      return paginate(this.maybeEmpty(items), query);
    });
  }

  subscribeTasks(query: TaskListQuery, onValue: (page: T.Page<T.Task>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listTasks(query), onValue, onError);
  }

  createFollowUp(input: T.CreateTaskInput): Promise<T.Task> {
    return this.respond(() => {
      this.require("crm.write");
      const subject = input.leadId
        ? this.db.leads.find((l) => l.id === input.leadId)?.fullName
        : this.db.members.find((m) => m.id === input.memberId)?.fullName;
      const task: T.Task = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        type: input.type,
        title: input.title,
        ownerId: input.ownerId,
        ownerName: this.db.users.find((u) => u.id === input.ownerId)?.name ?? "Staff",
        dueAt: input.dueAt,
        priority: input.priority ?? "normal",
        status: "open",
        leadId: input.leadId,
        memberId: input.memberId,
        subjectName: subject ?? "—",
        createdById: this.actor().id,
        createdAt: nowISO(),
      };
      this.db.tasks.push(task);
      if (input.memberId) {
        this.activity({
          memberId: input.memberId,
          type: "task_created",
          title: `Task: ${input.title}`,
          actorId: this.actor().id,
          actorName: this.actor().name,
        });
      }
      return task;
    });
  }

  completeTask(taskId: T.UUID, input: T.CompleteTaskInput): Promise<T.Task> {
    return this.respond(() => {
      this.require("crm.write");
      const task = this.db.tasks.find((t) => t.id === taskId);
      if (!task) throw ApiError.of(ERR.NOT_FOUND, "Task not found.");
      task.status = "completed";
      task.outcome = input.outcome;
      task.completedAt = nowISO();
      if (task.memberId) {
        this.activity({
          memberId: task.memberId,
          type: "task_completed",
          title: `Task completed: ${task.title}`,
          body: input.outcome,
          actorId: this.actor().id,
          actorName: this.actor().name,
        });
      }
      return task;
    });
  }

  completeLeadSale(leadId: T.UUID, input: T.CompleteLeadSaleInput): Promise<T.CompleteLeadSaleResult> {
    return this.respond(() => {
      this.require("crm.write");
      this.require("members.write");
      this.require("memberships.sell");
      const saleBranch = this.db.branches.find((branch) => branch.id === input.homeBranchId && branch.status === "active");
      if (!saleBranch || !this.branchIsVisible(saleBranch.id)) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
      const lead = this.db.leads.find((item) => item.id === leadId);
      if (!lead) throw ApiError.of(ERR.NOT_FOUND, "Lead not found.");
      if (lead.stage === "won" && lead.convertedMemberId) throw ApiError.of(ERR.VALIDATION, "Lead was already converted.");
      const trial = this.trialBookings.find((booking) => booking.leadId === lead.id);
      if (!trial || trial.status !== "completed") throw ApiError.of(ERR.VALIDATION, "Complete the trial before recording a successful membership sale.");
      const duplicates = this.findDuplicates({ phone: lead.phone, email: lead.email });
      const duplicateMemberIds = [...new Set(duplicates.map((match) => match.memberId))];
      if (duplicateMemberIds.length > 1) {
        throw ApiError.of(ERR.DUPLICATE_MEMBER, "More than one member matches this lead. Open the correct member and resolve the duplicate records before selling a membership.", { details: { matches: duplicates } });
      }
      const existingMember = duplicateMemberIds[0] ? this.db.members.find((member) => member.id === duplicateMemberIds[0]) : undefined;
      if (existingMember && existingMember.status !== "active") throw ApiError.of(ERR.VALIDATION, "The matching member is inactive. Reactivate the member before selling a membership.");

      const selection = input.membership;
      let plan: T.MembershipPlan;
      if (selection.mode === "existing") {
        const existing = this.db.plans.find((item) => item.id === selection.planId && item.status === "active");
        if (!existing) throw ApiError.of(ERR.NOT_FOUND, "Plan not found or inactive.");
        plan = this.toPlan(existing);
      } else {
        const name = selection.name.trim();
        if (name.length < 2 || name.length > 80) throw ApiError.of(ERR.VALIDATION, "Custom membership name must be between 2 and 80 characters.");
        if (!Number.isInteger(selection.durationDays) || selection.durationDays < 1 || selection.durationDays > 730) throw ApiError.of(ERR.VALIDATION, "Membership duration must be between 1 and 730 days.");
        if (!Number.isInteger(selection.includedPtSessions) || selection.includedPtSessions < 0 || selection.includedPtSessions > 100) throw ApiError.of(ERR.VALIDATION, "Included PT sessions must be between 0 and 100.");
        if (!Number.isInteger(selection.price.amount) || selection.price.amount < 0) throw ApiError.of(ERR.VALIDATION, "Membership price must be zero or greater.");
        plan = {
          id: mockUuid(),
          organizationId: this.db.organization.id,
          name,
          code: `CRM-${mockUuid().slice(0, 8).toUpperCase()}`,
          kind: "time",
          durationDays: selection.durationDays,
          basePrice: { amount: selection.price.amount, currency: this.db.organization.currency },
          branchAccess: "selected",
          branchIds: [input.homeBranchId],
          freezeAllowanceDays: 0,
          includedPtSessions: selection.includedPtSessions,
          status: "active",
          activeSubscribers: 0,
        };
        this.db.plans.push(plan);
        this.audit({ category: "settings", action: "plan.create_from_crm", entityType: "plan", entityId: plan.id, entityLabel: `${plan.name} · ${plan.code}`, summary: "Custom membership created during CRM sale", branchId: input.homeBranchId });
      }

      const member = existingMember ?? this.createMemberSync({
        fullName: lead.fullName,
        phone: lead.phone,
        email: lead.email,
        homeBranchId: input.homeBranchId,
        preferredLanguage: input.preferredLanguage,
        marketingOptIn: input.marketingOptIn,
        marketingPreferenceSource: input.marketingPreferenceSource,
        source: lead.source,
        assignedSalespersonId: lead.ownerId,
      });
      const sale = this.buildSale({ memberId: member.id, planId: plan.id, startDate: input.startDate, idempotencyKey: `lead-sale:${input.idempotencyKey}`, standardStartDate: this.today(), soldBy: this.actor().id });
      lead.stage = "won";
      lead.convertedMemberId = member.id;
      lead.nextFollowUpAt = undefined;
      lead.updatedAt = nowISO();
      trial.status = "converted";
      for (const task of this.db.tasks.filter((item) => item.leadId === lead.id && item.status === "open")) {
        task.status = "completed";
        task.outcome = "Membership sold";
        task.completedAt = nowISO();
      }
      this.activity({ leadId: lead.id, memberId: member.id, type: "lead_converted", title: `Membership sold — ${plan.name}`, actorId: this.actor().id, actorName: this.actor().name, meta: { membershipId: sale.membership.id, planId: plan.id } });
      this.audit({ category: "crm", action: "lead.membership_sale_completed", entityType: "lead", entityId: lead.id, entityLabel: lead.fullName, summary: `${existingMember ? "Existing member sold" : "Lead converted with"} ${plan.name} membership`, before: { stage: "trial_completed" }, after: { stage: "won", memberId: member.id, membershipId: sale.membership.id, planId: plan.id, reusedExistingMember: existingMember ? "yes" : "no" }, branchId: lead.branchId });
      return { member: this.toMemberDetail(member), plan: this.toPlan(plan), membership: sale.membership, charge: sale.charge };
    });
  }

  private createMemberSync(input: T.CreateMemberInput): MemberRecord {
    const branch = this.db.branches.find((b) => b.id === input.homeBranchId);
    if (!branch || branch.status !== "active" || !this.branchIsVisible(branch.id)) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
    this.db.counters.memberNumber += 1;
    const record: MemberRecord = {
      id: mockUuid(),
      memberNumber: `${branch.code}-${this.db.counters.memberNumber}`,
      fullName: input.fullName.trim(),
      fullNameAr: input.fullNameAr,
      phone: input.phone.trim(),
      email: input.email?.trim() || undefined,
      gender: input.gender,
      dateOfBirth: input.dateOfBirth,
      homeBranchId: branch.id,
      status: "active",
      tags: input.tags ?? [],
      preferredLanguage: input.preferredLanguage,
      emergencyContactName: input.emergencyContactName,
      emergencyContactRelationship: input.emergencyContactRelationship,
      emergencyContactPhone: input.emergencyContactPhone,
      addressLine1: input.addressLine1,
      city: input.city,
      source: input.source,
      assignedSalespersonId: input.assignedSalespersonId,
      marketingOptIn: input.marketingOptIn !== false,
      marketingPreference: this.marketingPreferenceFor(input),
      notes: input.notes,
      createdAt: nowISO(),
    };
    this.db.members.push(record);
    this.activity({
      memberId: record.id,
      type: "member_created",
      title: "Member profile created",
      actorId: this.actor().id,
      actorName: this.actor().name,
    });
    return record;
  }

  listRenewalQueue(query: RenewalQueueQuery): Promise<T.Page<T.RenewalQueueItem>> {
    return this.respond(() => {
      this.require("crm.read");
      const branchId = this.branchScopedBranchId(query.branchId);
      const today = this.today();
      const bucket = query.bucket ?? "expiring";
      const requestedDays = query.days ?? (bucket === "expired" ? 45 : this.db.operationalPolicies.membership.renewalWindowDays);
      if (!Number.isInteger(requestedDays) || requestedDays < 1 || requestedDays > 365) throw ApiError.of(ERR.VALIDATION, "Follow-up days must be between 1 and 365.");
      const fromDate = query.fromDate;
      const toDate = query.toDate;
      if ((fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) || (toDate && !/^\d{4}-\d{2}-\d{2}$/.test(toDate))) throw ApiError.of(ERR.VALIDATION, "Follow-up dates must use YYYY-MM-DD.");
      if (fromDate && diffDays(addDays(today, -365), fromDate) < 0) throw ApiError.of(ERR.VALIDATION, "Follow-up dates cannot be earlier than one year ago.");
      if (toDate && diffDays(addDays(today, -365), toDate) < 0) throw ApiError.of(ERR.VALIDATION, "Follow-up dates cannot be earlier than one year ago.");
      if (toDate && diffDays(today, toDate) > 365) throw ApiError.of(ERR.VALIDATION, "Follow-up dates cannot be more than one year ahead.");
      if (fromDate && toDate && diffDays(fromDate, toDate) < 0) throw ApiError.of(ERR.VALIDATION, "The follow-up start date must be before the end date.");
      const items: T.RenewalQueueItem[] = [];
      for (const record of this.db.memberships) {
        if (branchId && record.homeBranchId !== branchId) continue;
        const daysUntil = diffDays(today, record.endDate);
        const member = this.db.members.find((m) => m.id === record.memberId);
        if (!member || member.status !== "active") continue;
        // Exclude memberships that already have a newer term (renewed)
        const hasNewerTerm = this.db.memberships.some((m) => m.previousMembershipId === record.id);
        if (hasNewerTerm) continue;
        if (fromDate || toDate) {
          const lower = fromDate ?? (bucket === "expired" ? addDays(today, -requestedDays) : today);
          const upper = toDate ?? (bucket === "expired" ? today : addDays(today, requestedDays));
          if (bucket === "expired" ? !(daysUntil < 0 && record.endDate >= lower && record.endDate <= upper) : !(daysUntil >= 0 && record.endDate >= lower && record.endDate <= upper)) continue;
        } else if (bucket === "expired" ? !(daysUntil < 0 && daysUntil >= -requestedDays) : !(daysUntil >= 0 && daysUntil <= requestedDays)) continue;
        const calls = this.db.activities.filter((a) => a.memberId === record.memberId && a.type === "call_attempt");
        const openTask = this.db.tasks.find((t) => t.memberId === record.memberId && t.status === "open" && t.type === "renewal_call");
        items.push({
          member: this.toMemberSummary(member),
          membership: this.toMembershipSummary(record),
          daysUntilExpiry: daysUntil,
          lastContactAt: calls[0]?.occurredAt,
          lastContactOutcome: calls[0]?.meta?.outcome ? String(calls[0].meta.outcome) : undefined,
          openTaskId: openTask?.id,
        });
      }
      items.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
      return paginate(this.maybeEmpty(items), query);
    });
  }

  // -------------------------------------------------------------------------
  // check-in
  // -------------------------------------------------------------------------

  subscribeRenewalQueue(query: RenewalQueueQuery, onValue: (page: T.Page<T.RenewalQueueItem>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listRenewalQueue(query), onValue, onError);
  }

  private evaluateForMember(member: MemberRecord, branchId: T.UUID): {
    decision: T.CheckInDecision;
    reasonCodes: T.CheckInReasonCode[];
    message: string;
    membership?: MembershipRecord;
  } {
    const today = this.today();
    const current = this.currentMembership(member.id);
    const plan = current ? this.db.plans.find((p) => p.id === current.planId) : undefined;
    // duplicate scan suppression (2 minutes, same branch)
    const lastCheckIn = this.db.checkIns.find(
      (c) => c.memberId === member.id && c.branchId === branchId && c.decision !== "blocked",
    );
    const duplicate = lastCheckIn ? Date.now() - new Date(lastCheckIn.occurredAt).getTime() < 2 * 60_000 : false;

    const result = evaluateCheckIn({
      memberStatus: member.status,
      membership: current
        ? {
            status: this.membershipStatusOf(current),
            planBranchAccess: plan?.branchAccess ?? "all",
            planBranchIds: plan?.branchIds ?? [],
            remainingVisits: current.remainingVisits,
            endDate: current.endDate,
          }
        : undefined,
      checkInBranchId: branchId,
      memberHomeBranchId: member.homeBranchId,
      outstanding: this.outstandingForMember(member.id),
      today,
      duplicateWithinMinutes: duplicate,
    });
    return { ...result, membership: current };
  }

  previewCheckIn(input: { branchId: T.UUID; query: string }): Promise<T.CheckInPreview> {
    return this.respond(() => {
      this.require("members.read");
      const q = input.query.trim();
      if (!q) return { found: false, decision: "blocked", reasonCodes: [], message: "Type a name, phone, or member number." };
      if (q.length < 3) {
        return { found: false, decision: "blocked", reasonCodes: [], message: "Keep typing — at least 3 characters." };
      }
      const member = this.db.members.find((m) =>
        this.matchesSearch([m.fullName, m.fullNameAr, m.phone, m.memberNumber, m.email], q),
      );
      if (!member) {
        return { found: false, decision: "blocked", reasonCodes: [], message: `No member matches “${q}”.` };
      }
      const evaluation = this.evaluateForMember(member, input.branchId);
      const summary = this.toMemberSummary(member);
      return {
        found: true,
        member: summary,
        membership: evaluation.membership ? this.toMembershipSummary(evaluation.membership) : undefined,
        decision: evaluation.decision,
        reasonCodes: evaluation.reasonCodes,
        message: evaluation.message,
        criticalNotes: member.sensitiveNotes && permissionsFor(this.db, currentRole(this.db)).includes("members.sensitive_notes.read") ? member.sensitiveNotes : undefined,
      };
    });
  }

  createCheckIn(input: T.CreateCheckInInput): Promise<T.CheckInResult> {
    return this.respond(() => {
      this.require("members.read");
      const member = this.db.members.find((m) => m.id === input.memberId);
      if (!member) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      const evaluation = this.evaluateForMember(member, input.branchId);
      const summary = this.toMemberSummary(member);
      if (evaluation.decision === "blocked") {
        // record the blocked attempt for the audit trail
        this.db.checkIns.unshift({
          id: mockUuid(),
          memberId: member.id,
          memberName: member.fullName,
          memberNumber: member.memberNumber,
          branchId: input.branchId,
          branchName: this.db.branches.find((b) => b.id === input.branchId)?.name ?? "—",
          decision: "blocked",
          reasonCodes: evaluation.reasonCodes,
          actorId: this.actor().id,
          actorName: this.actor().name,
          occurredAt: nowISO(),
        });
        return {
          decision: "blocked",
          reasonCodes: evaluation.reasonCodes,
          member: summary,
          membership: evaluation.membership ? this.toMembershipSummary(evaluation.membership) : undefined,
          message: evaluation.message,
        };
      }
      return this.recordCheckIn(member, input.branchId, evaluation, undefined);
    });
  }

  overrideCheckIn(input: T.OverrideCheckInInput): Promise<T.CheckInResult> {
    return this.respond(() => {
      this.require("checkins.override");
      if (!input.reason.trim()) {
        throw ApiError.of(ERR.VALIDATION, "An override reason is required.", { fieldErrors: { reason: ["Required"] } });
      }
      const member = this.db.members.find((m) => m.id === input.memberId);
      if (!member) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
      const evaluation = this.evaluateForMember(member, input.branchId);
      const result = this.recordCheckIn(member, input.branchId, evaluation, input.reason);
      this.audit({
        category: "checkins",
        action: "checkin.override",
        entityType: "member",
        entityId: member.id,
        entityLabel: `${member.fullName} · ${member.memberNumber}`,
        summary: `Manual check-in override (${evaluation.reasonCodes.join(", ") || "no block reason"})`,
        reason: input.reason,
        before: { decision: evaluation.decision },
        after: { decision: "overridden" },
        branchId: input.branchId,
      });
      return result;
    });
  }

  private recordCheckIn(
    member: MemberRecord,
    branchId: T.UUID,
    evaluation: { decision: T.CheckInDecision; reasonCodes: T.CheckInReasonCode[]; message: string; membership?: MembershipRecord },
    overrideReason?: string,
  ): T.CheckInResult {
    const decision: T.CheckInDecision = overrideReason ? "overridden" : evaluation.decision;
    const checkIn: T.CheckInSummary = {
      id: mockUuid(),
      memberId: member.id,
      memberName: member.fullName,
      memberNumber: member.memberNumber,
      branchId,
      branchName: this.db.branches.find((b) => b.id === branchId)?.name ?? "—",
      decision,
      reasonCodes: overrideReason ? [...evaluation.reasonCodes.filter((c) => c !== "OK"), "MANUAL_OVERRIDE"] : evaluation.reasonCodes,
      actorId: this.actor().id,
      actorName: this.actor().name,
      overrideReason,
      occurredAt: nowISO(),
    };
    this.db.checkIns.unshift(checkIn);
    if (evaluation.membership?.totalVisits != null && evaluation.membership.remainingVisits != null) {
      evaluation.membership.remainingVisits = Math.max(0, evaluation.membership.remainingVisits - 1);
    }
    this.activity({
      memberId: member.id,
      type: "check_in",
      title: `Checked in — ${checkIn.branchName}`,
      actorId: this.actor().id,
      actorName: this.actor().name,
      meta: { decision },
    });
    return {
      checkInId: checkIn.id,
      decision,
      reasonCodes: checkIn.reasonCodes,
      member: this.toMemberSummary(member),
      membership: evaluation.membership ? this.toMembershipSummary(evaluation.membership) : undefined,
      occurredAt: checkIn.occurredAt,
      message: overrideReason ? `Overridden by ${this.actor().name}: ${overrideReason}` : evaluation.message,
    };
  }

  listRecentCheckIns(query: RecentCheckInQuery): Promise<T.Page<T.CheckInSummary>> {
    return this.respond(() => {
      this.require("members.read");
      let items = [...this.db.checkIns];
      const branchId = this.branchScopedBranchId(query.branchId);
      if (branchId) items = items.filter((c) => c.branchId === branchId);
      if (query.memberId) items = items.filter((c) => c.memberId === query.memberId);
      const since = query.since;
      if (since) items = items.filter((c) => c.occurredAt >= since);
      if (query.date) items = items.filter((c) => todayISODate(TZ, new Date(c.occurredAt)) === query.date);
      if (query.acceptedOnly) items = items.filter((c) => c.decision !== "blocked");
      items.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
      return paginate(this.maybeEmpty(items), query);
    });
  }

  subscribeRecentCheckIns(query: RecentCheckInQuery, onValue: (page: T.Page<T.CheckInSummary>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listRecentCheckIns(query), onValue, onError);
  }

  getOccupancy(branchId: T.UUID): Promise<T.OccupancySnapshot> {
    return this.respond(() => {
      const branch = this.db.branches.find((b) => b.id === branchId);
      if (!branch) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
      const today = this.today();
      const cutoff = Date.now() - 90 * 60_000;
      const current = this.db.checkIns.filter(
        (c) => c.branchId === branchId && c.decision !== "blocked" && new Date(c.occurredAt).getTime() >= cutoff,
      ).length;
      const todayCheckIns = this.db.checkIns.filter(
        (c) => c.branchId === branchId && c.decision !== "blocked" && todayISODate(TZ, new Date(c.occurredAt)) === today,
      );
      const hourCounts = new Map<number, number>();
      for (const c of todayCheckIns) {
        const h = Number(new Date(c.occurredAt).toLocaleString("en-US", { timeZone: TZ, hour: "2-digit", hour12: false }));
        hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
      }
      let peakHour = "—";
      let peak = 0;
      for (const [h, count] of hourCounts) {
        if (count > peak) {
          peak = count;
          peakHour = `${String(h).padStart(2, "0")}:00`;
        }
      }
      return { branchId, current, capacity: branch.capacity, checkInsToday: todayCheckIns.length, peakHour };
    });
  }

  // -------------------------------------------------------------------------
  // payments
  // -------------------------------------------------------------------------

  subscribeOccupancy(branchId: T.UUID, onValue: (occupancy: T.OccupancySnapshot) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getOccupancy(branchId), onValue, onError);
  }

  private nextReceiptNumber(): string {
    const n = `${this.db.organization.receiptPrefix}${this.db.counters.receiptNumber}`;
    this.db.counters.receiptNumber += 1;
    return n;
  }

  private recordPayment(args: {
    memberId: T.UUID;
    chargeId?: T.UUID;
    amount: T.Money;
    method: T.PaymentMethodKey;
    idempotencyKey: string;
    externalReference?: string;
  }): { payment: T.Payment; receipt: T.Receipt; timelineEventId: T.UUID } {
    const member = this.db.members.find((m) => m.id === args.memberId);
    if (!member) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
    const method = this.db.paymentMethods.find((m) => m.key === args.method);
    if (!method?.enabled) throw ApiError.of(ERR.VALIDATION, `Payment method “${args.method}” is disabled.`);
    if (args.amount.currency !== this.db.organization.currency) throw ApiError.of(ERR.VALIDATION, "Payment currency does not match the organization.");
    if (["card", "bank_transfer", "cliq"].includes(args.method) && !args.externalReference?.trim()) {
      throw ApiError.of(ERR.VALIDATION, "An external reference is required for card, bank transfer, and CliQ payments.");
    }

    // idempotency
    const existing = this.db.payments.find((p) => p.idempotencyKey === args.idempotencyKey);
    if (existing) {
      if (existing.memberId !== args.memberId || (args.chargeId !== undefined && existing.chargeId !== args.chargeId) || existing.amount.amount !== args.amount.amount || existing.amount.currency !== args.amount.currency || existing.method !== args.method) {
        throw ApiError.of(ERR.VALIDATION, "This idempotency key was already used for a different payment.");
      }
      const receipt = this.db.receipts.find((r) => r.id === existing.receiptId)!;
      return { payment: existing, receipt, timelineEventId: "" };
    }

    let charge: T.Charge | undefined;
    if (args.chargeId) {
      charge = this.db.charges.find((c) => c.id === args.chargeId);
    } else {
      charge = this.db.charges
        .filter((c) => c.memberId === member.id && c.outstandingAmount.amount > 0 && chargeIsCollectible(c, this.today()))
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
    }
    if (!charge) throw ApiError.of(ERR.NO_OUTSTANDING_BALANCE, "This member has no outstanding balance to collect.");
    if (!chargeIsCollectible(charge, this.today())) throw ApiError.of(ERR.VALIDATION, `This invoice becomes collectible on ${charge.dueDate ?? charge.createdAt.slice(0, 10)}.`);
    if (charge.outstandingAmount.amount <= 0) {
      throw ApiError.of(ERR.NO_OUTSTANDING_BALANCE, "This charge is already fully paid.");
    }
    if (!Number.isSafeInteger(args.amount.amount) || args.amount.amount <= 0) throw ApiError.of(ERR.VALIDATION, "Amount must be a positive integer.");
    if (args.amount.amount > charge.outstandingAmount.amount) throw ApiError.of(ERR.VALIDATION, "Payment cannot exceed the outstanding balance.");
    const amount = args.amount.amount;

    // cash requires an open shift at the member's home branch
    const branchId = member.homeBranchId;
    let shift: T.CashShift | undefined;
    if (method.affectsCashDrawer) {
      shift = this.db.shifts.find((s) => s.branchId === branchId && s.status === "open");
      if (!shift) {
        throw ApiError.of(ERR.NO_OPEN_SHIFT, `No open cash shift at this branch. Open a shift before collecting cash.`);
      }
    }

    const payment: T.Payment = {
      id: mockUuid(),
      organizationId: this.db.organization.id,
      branchId,
      memberId: member.id,
      chargeId: charge.id,
      type: "payment",
      amount: money(amount),
      method: args.method,
      status: "completed",
      receiptId: "",
      receiptNumber: "",
      collectedById: this.actor().id,
      collectedByName: this.actor().name,
      shiftId: shift?.id,
      externalReference: args.externalReference,
      idempotencyKey: args.idempotencyKey,
      occurredAt: nowISO(),
    };
    const receiptNumber = this.nextReceiptNumber();
    const receipt: T.Receipt = { id: mockUuid(), receiptNumber, paymentId: payment.id, issuedAt: payment.occurredAt };
    payment.receiptId = receipt.id;
    payment.receiptNumber = receiptNumber;
    this.db.payments.push(payment);
    this.db.receipts.push(receipt);

    charge.paidAmount = money(charge.paidAmount.amount + amount);
    charge.outstandingAmount = money(charge.outstandingAmount.amount - amount);
    charge.status = charge.outstandingAmount.amount <= 0 ? "paid" : "partial";

    const event = this.activity({
      memberId: member.id,
      type: "payment_collected",
      title: `Payment collected — JOD ${(amount / 1000).toFixed(3)} ${args.method.replace("_", " ")}`,
      actorId: this.actor().id,
      actorName: this.actor().name,
      meta: { receiptNumber, receiptId: receipt.id },
    });
    return { payment, receipt, timelineEventId: event.id };
  }

  checkoutRetail(input: T.RetailCheckoutInput): Promise<T.ReceiptDetail & { receiptId: T.UUID; retailSale: T.RetailSale }> {
    return this.respond(() => {
      this.requireOperations();
      this.require("payments.collect");
      const branch = this.operationsBranch(input.branchId);
      const method = input.method;
      if (!["cash", "cliq", "card"].includes(method)) throw ApiError.of(ERR.VALIDATION, "Retail payment method is invalid.");
      const configuredMethod = this.db.paymentMethods.find((candidate) => candidate.key === method);
      if (configuredMethod && !configuredMethod.enabled) throw ApiError.of(ERR.VALIDATION, "This payment method is disabled for the gym.");
      const idempotencyKey = input.idempotencyKey.trim();
      if (!idempotencyKey || idempotencyKey.length > 160) throw ApiError.of(ERR.VALIDATION, "A bounded idempotency key is required.");
      const guest = input.guest ? { fullName: input.guest.fullName.trim(), phone: input.guest.phone.trim() } : undefined;
      if ((input.memberId && guest) || (!input.memberId && !guest)) throw ApiError.of(ERR.VALIDATION, "Choose an existing member or enter guest details, not both.");
      const linesInput = [...input.lines].map((line) => ({ productId: line.productId, quantity: line.quantity })).sort((a, b) => a.productId.localeCompare(b.productId));
      const externalReference = input.externalReference?.trim() || undefined;
      const signature = JSON.stringify({ branchId: branch.id, memberId: input.memberId, guest, lines: linesInput, method, externalReference });
      const replay = this.operationsIdempotent("retail_checkout", idempotencyKey, signature) as T.ReceiptDetail & { receiptId: T.UUID; retailSale: T.RetailSale } | undefined;
      if (replay) return replay;
      if (method !== "cash" && !externalReference) throw ApiError.of(ERR.VALIDATION, "An external reference is required for CliQ and Visa/card payments.");
      if (guest && (!guest.fullName || guest.fullName.length > 120 || !guest.phone || guest.phone.length > 40)) throw ApiError.of(ERR.VALIDATION, "Guest name and phone are required.");
      if (linesInput.length === 0 || linesInput.length > 100) throw ApiError.of(ERR.VALIDATION, "A checkout must contain 1 to 100 product lines.");
      const seen = new Set<string>();
      const lines: Array<{ product: T.Product; quantity: number; balance: T.InventoryBalance; unitPriceMinor: number; lineTotalMinor: number; unitCost?: T.Money }> = [];
      let totalMinor = 0;
      for (const lineInput of linesInput) {
        if (seen.has(lineInput.productId)) throw ApiError.of(ERR.VALIDATION, "A checkout cannot repeat a product line.");
        seen.add(lineInput.productId);
        if (!Number.isSafeInteger(lineInput.quantity) || lineInput.quantity <= 0) throw ApiError.of(ERR.VALIDATION, "Product quantities must be positive whole numbers.");
        const product = this.db.products.find((candidate) => candidate.id === lineInput.productId);
        if (!product) throw ApiError.of(ERR.NOT_FOUND, "Product not found.");
        if (product.status !== "active") throw ApiError.of(ERR.CONFLICT, "Archived products cannot be sold.");
        if (!product.retailPrice || product.retailPrice.amount <= 0 || product.retailPrice.currency !== this.db.organization.currency || !Number.isSafeInteger(product.retailPrice.amount)) throw ApiError.of(ERR.CONFLICT, `Set a retail price for ${product.name} before selling it.`);
        const balance = this.db.inventoryBalances.find((candidate) => candidate.branchId === branch.id && candidate.productId === product.id);
        const available = (balance?.quantityOnHand ?? 0) - (balance?.committedQuantity ?? 0);
        if (!balance || available < lineInput.quantity) throw ApiError.of(ERR.CONFLICT, `${product.name} has only ${available} available.`);
        const lineTotalMinor = product.retailPrice.amount * lineInput.quantity;
        if (!Number.isSafeInteger(lineTotalMinor) || !Number.isSafeInteger(totalMinor + lineTotalMinor)) throw ApiError.of(ERR.VALIDATION, "Checkout total is too large.");
        totalMinor += lineTotalMinor;
        lines.push({ product, quantity: lineInput.quantity, balance, unitPriceMinor: product.retailPrice.amount, lineTotalMinor, unitCost: this.retailInventoryCostBasis(branch.id, product.id) });
      }
      if (totalMinor <= 0) throw ApiError.of(ERR.VALIDATION, "Checkout total must be greater than zero.");
      let customer: T.RetailSaleCustomer;
      let member: MemberRecord | undefined;
      if (input.memberId) {
        member = this.db.members.find((candidate) => candidate.id === input.memberId);
        if (!member) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
        if (member.homeBranchId !== branch.id) throw ApiError.of(ERR.NOT_FOUND, "Member not found.");
        customer = { kind: "member", fullName: member.fullName, phone: member.phone, memberId: member.id, memberNumber: member.memberNumber };
      } else {
        customer = { kind: "guest", fullName: guest!.fullName, phone: guest!.phone };
      }
      const shift = method === "cash" ? this.db.shifts.find((candidate) => candidate.branchId === branch.id && candidate.status === "open") : undefined;
      if (method === "cash" && !shift) throw ApiError.of(ERR.NO_OPEN_SHIFT, "Open a cash shift before checking out cash sales.");
      const now = nowISO();
      const receiptNumber = this.nextReceiptNumber();
      const sale: T.RetailSale = { id: mockUuid(), organizationId: this.db.organization.id, branchId: branch.id, receiptId: mockUuid(), receiptNumber, customer, lines: lines.map(({ product, quantity, unitPriceMinor, lineTotalMinor, unitCost }) => ({ productId: product.id, sku: product.sku, productName: product.name, quantity, unitPrice: money(unitPriceMinor, this.db.organization.currency), lineTotal: money(lineTotalMinor, this.db.organization.currency), unitCost })), subtotal: money(totalMinor, this.db.organization.currency), total: money(totalMinor, this.db.organization.currency), status: "completed", refundedAmount: money(0, this.db.organization.currency), returnedLines: [], method, externalReference, shiftId: shift?.id, idempotencyKey, createdById: this.actor().id, createdByName: this.actor().name, createdAt: now, updatedAt: now };
      const receipt: T.Receipt = { id: sale.receiptId, receiptNumber, paymentId: `retail-payment-${sale.id}`, retailSaleId: sale.id, issuedAt: now };
      const payment: T.RetailPayment = { id: receipt.paymentId, organizationId: this.db.organization.id, branchId: branch.id, type: "retail_sale", customer, amount: money(totalMinor, this.db.organization.currency), method, status: "completed", receiptId: receipt.id, receiptNumber, collectedById: this.actor().id, collectedByName: this.actor().name, shiftId: shift?.id, externalReference, idempotencyKey, occurredAt: now };
      this.db.retailSales.push(sale);
      this.db.receipts.push(receipt);
      for (const line of lines) {
        line.balance.quantityOnHand -= line.quantity;
        line.balance.availableQuantity = line.balance.quantityOnHand - line.balance.committedQuantity;
        line.balance.lastMovementAt = now;
        line.balance.updatedAt = now;
        const movement: T.StockMovement = { id: mockUuid(), organizationId: this.db.organization.id, branchId: branch.id, productId: line.product.id, productSku: line.product.sku, productName: line.product.name, productUnit: line.product.unit, type: "sale", quantityDelta: -line.quantity, quantity: line.quantity, unitCost: line.unitCost, reason: `Retail sale ${receiptNumber}`, referenceType: "retail_sale", referenceId: sale.id, idempotencyKey: `${idempotencyKey}:${line.product.id}`, financialPostingStatus: "not_posted", occurredAt: now, createdAt: now, createdById: this.actor().id };
        this.db.stockMovements.unshift(movement);
      }
      if (member) this.activity({ memberId: member.id, type: "payment_collected", title: `Retail sale — ${this.db.organization.currency} ${(totalMinor / 1000).toFixed(3)}`, actorId: this.actor().id, actorName: this.actor().name, meta: { receiptNumber, receiptId: receipt.id, retailSaleId: sale.id, saleType: "retail" } });
      this.audit({ category: "operations", action: "operations.retail_sale.create", entityType: "retail_sale", entityId: sale.id, entityLabel: receiptNumber, summary: `Retail sale ${receiptNumber} · ${this.db.organization.currency} ${(totalMinor / 1000).toFixed(3)}`, after: { receiptId: receipt.id, total: totalMinor, method, customer: customer.kind }, branchId: branch.id });
      const detail: T.ReceiptDetail & { receiptId: T.UUID; retailSale: T.RetailSale } = { receipt, receiptId: receipt.id, organization: { name: this.db.organization.name, receiptFooter: this.db.organization.receiptFooter, taxRatePercent: this.db.organization.taxRatePercent }, branch: { name: branch.name, code: branch.code, address: branch.address, phone: branch.phone }, member: member ? { fullName: member.fullName, memberNumber: member.memberNumber } : undefined, customer, payment, retailSale: sale, relatedPayments: [] };
      this.operationsIdempotency.set(`retail_checkout:${idempotencyKey}`, { signature, result: detail });
      return detail;
    });
  }

  refundRetailSale(saleId: T.UUID, input: T.RefundRetailSaleInput): Promise<T.ReceiptDetail & { retailSale: T.RetailSale }> {
    return this.respond(() => {
      this.requireOperations();
      this.require("payments.refund");
      const reason = input.reason.trim();
      if (reason.length < 5) throw ApiError.of(ERR.VALIDATION, "A reason is required for retail refunds.");
      const sale = this.db.retailSales.find((candidate) => candidate.id === saleId);
      if (!sale || !this.branchIsVisible(sale.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Retail sale not found.");
      // Sale/branch authorization must precede idempotent replay. A scoped
      // actor must not be able to learn a receipt from another branch by
      // guessing a request key that was already used there.
      const lines = [...input.lines]
        .map((line) => ({ productId: line.productId, quantity: line.quantity }))
        .sort((left, right) => left.productId.localeCompare(right.productId));
      const signature = JSON.stringify({ saleId, lines, reason });
      const replay = this.operationsIdempotent("retail_refund", input.idempotencyKey, signature) as T.ReceiptDetail & { retailSale: T.RetailSale } | undefined;
      if (replay) return replay;
      if (sale.status === "voided" || sale.status === "refunded") throw ApiError.of(ERR.CONFLICT, "This retail sale can no longer be refunded.");
      if (!lines.length) throw ApiError.of(ERR.VALIDATION, "Choose at least one sold item to refund.");
      const returned = new Map((sale.returnedLines ?? []).map((line) => [line.productId, line.quantity]));
      const seen = new Set<string>();
      let refundMinor = 0;
      for (const line of lines) {
        const sold = sale.lines.find((candidate) => candidate.productId === line.productId);
        if (!sold || seen.has(line.productId) || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) throw ApiError.of(ERR.VALIDATION, "Refund lines must be unique sold products with positive whole quantities.");
        seen.add(line.productId);
        if ((returned.get(line.productId) ?? 0) + line.quantity > sold.quantity) throw ApiError.of(ERR.CONFLICT, `${sold.productName} exceeds the remaining refundable quantity.`);
        refundMinor += sold.unitPrice.amount * line.quantity;
      }
      const refundShift = sale.method === "cash" ? this.db.shifts.find((candidate) => candidate.branchId === sale.branchId && candidate.status === "open") : undefined;
      if (sale.method === "cash" && !refundShift) throw ApiError.of(ERR.NO_OPEN_SHIFT, "Open a cash shift before recording a cash refund.");
      const now = nowISO();
      for (const line of lines) {
        let balance = this.db.inventoryBalances.find((candidate) => candidate.branchId === sale.branchId && candidate.productId === line.productId);
        const sold = sale.lines.find((candidate) => candidate.productId === line.productId);
        const tombstone = this.db.productTombstones.find((candidate) => candidate.productId === line.productId);
        // Resolve the original identity first. If its SKU was reused, a
        // refund must not put stock into the replacement catalog row.
        const product = tombstone ? undefined : this.db.products.find((candidate) => candidate.id === line.productId);
        if (!product && !tombstone) throw ApiError.of(ERR.NOT_FOUND, "Product identity not found for this sale.");
        const productId = product?.id ?? tombstone?.productId ?? line.productId;
        if (!balance && (product || tombstone)) {
          balance = { id: mockUuid(), organizationId: sale.organizationId, branchId: sale.branchId, productId, quantityOnHand: 0, committedQuantity: 0, availableQuantity: 0, sellable: tombstone ? false : true, updatedAt: now };
          this.db.inventoryBalances.push(balance);
        }
        if (balance) {
          balance.quantityOnHand += line.quantity;
          balance.availableQuantity = balance.quantityOnHand - balance.committedQuantity;
          if (tombstone) balance.sellable = false;
          balance.lastMovementAt = now;
          balance.updatedAt = now;
        }
        this.db.stockMovements.unshift({ id: mockUuid(), organizationId: sale.organizationId, branchId: sale.branchId, productId, productSku: product?.sku ?? tombstone?.sku ?? sold?.sku, productName: product?.name ?? tombstone?.name ?? sold?.productName, productUnit: product?.unit ?? tombstone?.unit, type: "return", quantityDelta: line.quantity, quantity: line.quantity, unitCost: sold?.unitCost, reason, referenceType: "retail_refund", referenceId: sale.id, idempotencyKey: `${input.idempotencyKey}:${productId}`, financialPostingStatus: "not_posted", occurredAt: now, createdAt: now, createdById: this.actor().id });
        returned.set(line.productId, (returned.get(line.productId) ?? 0) + line.quantity);
      }
      sale.returnedLines = [...returned].map(([productId, quantity]) => ({ productId, quantity }));
      sale.refundedAmount = money((sale.refundedAmount?.amount ?? 0) + refundMinor, sale.total.currency);
      sale.refundReason = reason;
      sale.status = sale.refundedAmount.amount >= sale.total.amount ? "refunded" : "partially_refunded";
      sale.updatedAt = now;

      // Keep the refund as its own immutable payment and receipt fact. The
      // original retail sale is updated only with its lifecycle projection;
      // this is what lets transactions, reconciliation, and receipt history
      // show the negative amount without fabricating a member for guests.
      const refundPaymentId = mockUuid();
      const refundReceipt: T.Receipt = { id: mockUuid(), receiptNumber: this.nextReceiptNumber(), paymentId: refundPaymentId, retailSaleId: sale.id, issuedAt: now };
      const refundPayment: MockRetailAdjustmentPayment = {
        id: refundPaymentId,
        organizationId: sale.organizationId,
        branchId: sale.branchId,
        memberId: sale.customer.memberId ?? "",
        type: "refund",
        customer: sale.customer,
        retailSaleId: sale.id,
        amount: money(-refundMinor, sale.total.currency),
        method: sale.method,
        status: "completed",
        receiptId: refundReceipt.id,
        receiptNumber: refundReceipt.receiptNumber,
        collectedById: this.actor().id,
        collectedByName: this.actor().name,
        shiftId: refundShift?.id,
        idempotencyKey: input.idempotencyKey,
        originalPaymentId: `retail-payment-${sale.id}`,
        refundReason: reason,
        occurredAt: now,
      };
      this.db.payments.push(refundPayment);
      this.db.receipts.push(refundReceipt);
      if (sale.customer.kind === "member" && sale.customer.memberId) {
        this.activity({ memberId: sale.customer.memberId, type: "payment_refunded", title: `Retail sale refunded — ${sale.total.currency} ${(refundMinor / 1000).toFixed(3)}`, body: reason, actorId: this.actor().id, actorName: this.actor().name, meta: { receiptNumber: refundReceipt.receiptNumber, receiptId: refundReceipt.id, retailSaleId: sale.id, saleType: "retail" } });
      }
      this.audit({ category: "payments", action: "operations.retail_sale.refund", entityType: "retail_sale", entityId: sale.id, entityLabel: sale.receiptNumber, summary: `Refunded ${sale.total.currency} ${(refundMinor / 1000).toFixed(3)} from retail sale`, reason, before: { status: "completed", refunded: (sale.refundedAmount.amount - refundMinor) }, after: { status: sale.status, refunded: sale.refundedAmount.amount, refundReceiptId: refundReceipt.id, refundPaymentId }, branchId: sale.branchId });
      const result = this.getReceiptSync(refundReceipt.id) as T.ReceiptDetail & { retailSale: T.RetailSale };
      this.operationsIdempotency.set(`retail_refund:${input.idempotencyKey}`, { signature, result });
      return result;
    });
  }

  voidRetailSale(saleId: T.UUID, input: T.VoidRetailSaleInput): Promise<T.ReceiptDetail & { retailSale: T.RetailSale }> {
    return this.respond(() => {
      this.requireOperations();
      this.require("payments.void");
      const reason = input.reason.trim();
      if (reason.length < 5) throw ApiError.of(ERR.VALIDATION, "A reason is required to void a retail sale.");
      const sale = this.db.retailSales.find((candidate) => candidate.id === saleId);
      if (!sale || !this.branchIsVisible(sale.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Retail sale not found.");
      // Authorize the sale and its branch before exposing any replay result.
      const signature = JSON.stringify({ saleId, reason });
      const replay = this.operationsIdempotent("retail_void", input.idempotencyKey, signature) as T.ReceiptDetail & { retailSale: T.RetailSale } | undefined;
      if (replay) return replay;
      if (sale.status !== "completed") throw ApiError.of(ERR.CONFLICT, "Only an unadjusted retail sale can be voided.");
      if (todayISODate(TZ, new Date(sale.createdAt)) !== this.today()) throw ApiError.of(ERR.VOID_WINDOW_EXPIRED, "Retail sales can only be voided on the same business day. Issue a refund instead.");
      if (sale.method === "cash") {
        const openShift = sale.shiftId ? this.db.shifts.find((candidate) => candidate.branchId === sale.branchId && candidate.status === "open" && candidate.id === sale.shiftId) : undefined;
        if (!openShift) throw ApiError.of(ERR.NO_OPEN_SHIFT, "Cash sales can only be voided while their original cash shift is open.");
      }
      const now = nowISO();
      for (const line of sale.lines) {
        let balance = this.db.inventoryBalances.find((candidate) => candidate.branchId === sale.branchId && candidate.productId === line.productId);
        const tombstone = this.db.productTombstones.find((candidate) => candidate.productId === line.productId);
        const product = tombstone ? undefined : this.db.products.find((candidate) => candidate.id === line.productId);
        if (!product && !tombstone) throw ApiError.of(ERR.NOT_FOUND, "Product identity not found for this sale.");
        const productId = product?.id ?? tombstone?.productId ?? line.productId;
        if (!balance && (product || tombstone)) {
          balance = { id: mockUuid(), organizationId: sale.organizationId, branchId: sale.branchId, productId, quantityOnHand: 0, committedQuantity: 0, availableQuantity: 0, sellable: tombstone ? false : true, updatedAt: now };
          this.db.inventoryBalances.push(balance);
        }
        if (balance) {
          balance.quantityOnHand += line.quantity;
          balance.availableQuantity = balance.quantityOnHand - balance.committedQuantity;
          if (tombstone) balance.sellable = false;
          balance.lastMovementAt = now;
          balance.updatedAt = now;
        }
        this.db.stockMovements.unshift({ id: mockUuid(), organizationId: sale.organizationId, branchId: sale.branchId, productId, productSku: product?.sku ?? tombstone?.sku ?? line.sku, productName: product?.name ?? tombstone?.name ?? line.productName, productUnit: product?.unit ?? tombstone?.unit, type: "return", quantityDelta: line.quantity, quantity: line.quantity, unitCost: line.unitCost, reason, referenceType: "retail_void", referenceId: sale.id, idempotencyKey: `${input.idempotencyKey}:${productId}`, financialPostingStatus: "not_posted", occurredAt: now, createdAt: now, createdById: this.actor().id });
      }
      sale.status = "voided";
      sale.returnedLines = sale.lines.map((line) => ({ productId: line.productId, quantity: line.quantity }));
      sale.voidReason = reason;
      sale.voidedAt = now;
      sale.updatedAt = now;
      this.audit({ category: "payments", action: "operations.retail_sale.void", entityType: "retail_sale", entityId: sale.id, entityLabel: sale.receiptNumber, summary: `Voided retail sale ${sale.receiptNumber}`, reason, after: { status: "voided" }, branchId: sale.branchId });
      const result = this.getReceiptSync(sale.receiptId) as T.ReceiptDetail & { retailSale: T.RetailSale };
      this.operationsIdempotency.set(`retail_void:${input.idempotencyKey}`, { signature, result });
      return result;
    });
  }

  listTransactions(query: TransactionListQuery): Promise<T.Page<T.TransactionSummary>> {
    return this.respond(() => {
      this.require("reports.financial.read");
      const branchId = this.branchScopedBranchId(query.branchId);
      let items = [...this.db.payments.map((p) => this.toTransaction(p)), ...this.db.retailSales.map((sale) => this.toTransaction(this.retailPaymentProjection(sale)))];
      if (branchId) items = items.filter((p) => p.branchId === branchId);
      if (query.memberId) items = items.filter((p) => ("memberId" in p ? p.memberId : p.customer?.memberId) === query.memberId);
      if (query.method) items = items.filter((p) => p.method === query.method);
      if (query.type) items = items.filter((p) => p.type === query.type);
      const txFrom = query.from;
      const txTo = query.to;
      if (txFrom) items = items.filter((p) => p.occurredAt >= txFrom);
      if (txTo) items = items.filter((p) => p.occurredAt <= `${txTo}T23:59:59.999Z`);
      items = items.filter((p) => this.matchesSearch([p.memberName, p.memberNumber, p.receiptNumber], query.search));
      items = applySort(items, query.sort ?? "-occurredAt", (p, k) => (k === "occurredAt" ? p.occurredAt : p.amount.amount));
      return paginate(this.maybeEmpty(items), query);
    });
  }

  subscribeTransactions(query: TransactionListQuery, onValue: (page: T.Page<T.TransactionSummary>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listTransactions(query), onValue, onError);
  }

  createPayment(input: T.CreatePaymentInput, idempotencyKey: string): Promise<T.ReceiptDetail> {
    return this.respond(() => {
      this.require("payments.collect");
      const { payment } = this.recordPayment({ ...input, idempotencyKey });
      this.audit({
        category: "payments",
        action: "payment.collect",
        entityType: "payment",
        entityId: payment.id,
        entityLabel: `${payment.receiptNumber} · ${this.db.members.find((m) => m.id === payment.memberId)?.fullName ?? ""}`,
        summary: `Collected JOD ${(payment.amount.amount / 1000).toFixed(3)} (${payment.method.replace("_", " ")})`,
        after: { amount: payment.amount.amount, method: payment.method },
        branchId: payment.branchId,
      });
      return this.getReceiptSync(payment.receiptId);
    });
  }

  refundPayment(paymentId: T.UUID, input: T.RefundPaymentInput): Promise<T.ReceiptDetail> {
    return this.respond(() => {
      this.require("payments.refund");
      if (!input.reason.trim()) {
        throw ApiError.of(ERR.VALIDATION, "A reason is required for refunds.", { fieldErrors: { reason: ["Required"] } });
      }
      const original = this.db.payments.find((p) => p.id === paymentId);
      if (!original) throw ApiError.of(ERR.NOT_FOUND, "Payment not found.");
      if (original.type !== "payment") throw ApiError.of(ERR.VALIDATION, "Only payments can be refunded.");
      if (original.status === "voided") throw ApiError.of(ERR.PAYMENT_ALREADY_VOIDED, "Voided payments cannot be refunded.");
      const alreadyRefunded = original.refundedAmount?.amount ?? 0;
      const remaining = original.amount.amount - alreadyRefunded;
      if (remaining <= 0) throw ApiError.of(ERR.PAYMENT_ALREADY_REFUNDED, "This payment was already fully refunded.");
      if (input.amount && input.amount.currency !== this.db.organization.currency) {
        throw ApiError.of(ERR.VALIDATION, "Refund currency does not match the organization.");
      }
      const amount = input.amount?.amount ?? remaining;
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > remaining) {
        throw ApiError.of(ERR.REFUND_EXCEEDS_AMOUNT, "Refund amount exceeds the refundable balance.");
      }

      const receiptNumber = this.nextReceiptNumber();
      const refund: T.Payment = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        branchId: original.branchId,
        memberId: original.memberId,
        chargeId: original.chargeId,
        type: "refund",
        amount: money(-amount),
        method: original.method,
        status: "completed",
        receiptId: "",
        receiptNumber,
        collectedById: this.actor().id,
        collectedByName: this.actor().name,
        shiftId: this.db.shifts.find((s) => s.branchId === original.branchId && s.status === "open")?.id,
        idempotencyKey: `refund-${original.id}-${mockUuid()}`,
        originalPaymentId: original.id,
        refundReason: input.reason,
        occurredAt: nowISO(),
      };
      const receipt: T.Receipt = { id: mockUuid(), receiptNumber, paymentId: refund.id, issuedAt: refund.occurredAt };
      refund.receiptId = receipt.id;
      this.db.payments.push(refund);
      this.db.receipts.push(receipt);

      original.refundedAmount = money(alreadyRefunded + amount);
      original.refundReason = input.reason;
      original.status = alreadyRefunded + amount >= original.amount.amount ? "refunded" : "partially_refunded";

      const charge = this.db.charges.find((c) => c.id === original.chargeId);
      if (charge) {
        charge.paidAmount = money(Math.max(0, charge.paidAmount.amount - amount));
        charge.outstandingAmount = money(charge.total.amount - charge.paidAmount.amount);
        charge.status = charge.paidAmount.amount <= 0 ? "refunded" : "partial";
      }

      const member = this.db.members.find((m) => m.id === original.memberId)!;
      const needsReview = amount > 25_000; // large refunds are flagged for manager review
      this.audit({
        category: "payments",
        action: "payment.refund",
        entityType: "payment",
        entityId: original.id,
        entityLabel: `${original.receiptNumber} · ${member.fullName}`,
        summary: `Refunded JOD ${(amount / 1000).toFixed(3)} (${original.method.replace("_", " ")})`,
        reason: input.reason,
        before: { paymentStatus: "completed", chargePaid: original.amount.amount },
        after: { paymentStatus: original.status, refunded: alreadyRefunded + amount },
        approvalStatus: needsReview ? "pending" : "approved",
        branchId: original.branchId,
      });
      this.activity({
        memberId: original.memberId,
        type: "payment_refunded",
        title: `Payment refunded — JOD ${(amount / 1000).toFixed(3)}`,
        body: input.reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
      });
      return this.getReceiptSync(receipt.id);
    });
  }

  voidPayment(paymentId: T.UUID, input: T.VoidPaymentInput): Promise<T.ReceiptDetail> {
    return this.respond(() => {
      this.require("payments.void");
      if (!input.reason.trim()) {
        throw ApiError.of(ERR.VALIDATION, "A reason is required to void a payment.", { fieldErrors: { reason: ["Required"] } });
      }
      const original = this.db.payments.find((p) => p.id === paymentId);
      if (!original) throw ApiError.of(ERR.NOT_FOUND, "Payment not found.");
      if (original.type !== "payment") throw ApiError.of(ERR.VALIDATION, "Only payments can be voided.");
      if (original.status === "voided") throw ApiError.of(ERR.PAYMENT_ALREADY_VOIDED, "Payment is already voided.");
      if (original.status === "refunded" || original.status === "partially_refunded") {
        throw ApiError.of(ERR.PAYMENT_ALREADY_REFUNDED, "Refunded payments cannot be voided.");
      }
      const paymentDay = todayISODate(TZ, new Date(original.occurredAt));
      if (paymentDay !== this.today()) {
        throw ApiError.of(ERR.VOID_WINDOW_EXPIRED, "Payments can only be voided on the same business day. Issue a refund instead.");
      }
      original.status = "voided";
      original.voidReason = input.reason;
      const charge = this.db.charges.find((c) => c.id === original.chargeId);
      if (charge) {
        charge.paidAmount = money(Math.max(0, charge.paidAmount.amount - original.amount.amount));
        charge.outstandingAmount = money(charge.total.amount - charge.paidAmount.amount);
        charge.status = charge.paidAmount.amount <= 0 ? "unpaid" : "partial";
      }
      const member = this.db.members.find((m) => m.id === original.memberId)!;
      this.audit({
        category: "payments",
        action: "payment.void",
        entityType: "payment",
        entityId: original.id,
        entityLabel: `${original.receiptNumber} · ${member.fullName}`,
        summary: `Voided JOD ${(original.amount.amount / 1000).toFixed(3)} (${original.method.replace("_", " ")})`,
        reason: input.reason,
        before: { status: "completed" },
        after: { status: "voided" },
        branchId: original.branchId,
      });
      this.activity({
        memberId: original.memberId,
        type: "payment_voided",
        title: `Payment voided — ${original.receiptNumber}`,
        body: input.reason,
        actorId: this.actor().id,
        actorName: this.actor().name,
      });
      return this.getReceiptSync(original.receiptId);
    });
  }

  getReceipt(receiptId: T.UUID): Promise<T.ReceiptDetail> {
    return this.respond(() => {
      this.require("members.read");
      return this.getReceiptSync(receiptId);
    });
  }

  private getReceiptSync(receiptId: T.UUID): T.ReceiptDetail {
    const receipt = this.db.receipts.find((r) => r.id === receiptId);
    if (!receipt) throw ApiError.of(ERR.NOT_FOUND, "Receipt not found.");
    if (receipt.retailSaleId) {
      const sale = this.db.retailSales.find((candidate) => candidate.id === receipt.retailSaleId);
      if (!sale) throw ApiError.of(ERR.NOT_FOUND, "Retail sale not found.");
      const branch = this.db.branches.find((b) => b.id === sale.branchId);
      if (!branch) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
      if (!this.branchIsVisible(branch.id)) throw ApiError.of(ERR.NOT_FOUND, "Receipt not found.");
      const receiptPayment = this.db.payments.find((candidate) => candidate.id === receipt.paymentId);
      const retailAdjustment = receiptPayment && receiptPayment.type === "refund" && "retailSaleId" in receiptPayment
        ? receiptPayment as MockRetailAdjustmentPayment
        : undefined;
      if (retailAdjustment?.retailSaleId === sale.id) {
        // A refund receipt points back to the sale so the printed document can
        // retain the item lines, while its payment is the negative adjustment
        // fact. The original retail payment remains linked for audit history.
        const originalPayment = this.retailPaymentProjection(sale) as unknown as T.Payment;
        return { receipt, receiptId: receipt.id, organization: { name: this.db.organization.name, receiptFooter: this.db.organization.receiptFooter, taxRatePercent: this.db.organization.taxRatePercent }, branch: { name: branch.name, code: branch.code, address: branch.address, phone: branch.phone }, member: sale.customer.kind === "member" ? { fullName: sale.customer.fullName, memberNumber: sale.customer.memberNumber ?? "Member" } : undefined, customer: sale.customer, payment: retailAdjustment, retailSale: sale, relatedPayments: [originalPayment] };
      }
      const payment: T.RetailPayment = { id: receipt.paymentId, organizationId: this.db.organization.id, branchId: branch.id, type: "retail_sale", customer: sale.customer, amount: { ...sale.total }, method: sale.method, status: sale.status, refundedAmount: sale.refundedAmount ? { ...sale.refundedAmount } : undefined, refundReason: sale.refundReason, voidReason: sale.voidReason, receiptId: receipt.id, receiptNumber: receipt.receiptNumber, collectedById: sale.createdById, collectedByName: sale.createdByName, shiftId: sale.shiftId, externalReference: sale.externalReference, idempotencyKey: sale.idempotencyKey, occurredAt: sale.createdAt };
      const relatedRefunds = this.db.payments.filter((candidate) => candidate.type === "refund" && candidate.originalPaymentId === payment.id);
      return { receipt, receiptId: receipt.id, organization: { name: this.db.organization.name, receiptFooter: this.db.organization.receiptFooter, taxRatePercent: this.db.organization.taxRatePercent }, branch: { name: branch.name, code: branch.code, address: branch.address, phone: branch.phone }, member: sale.customer.kind === "member" ? { fullName: sale.customer.fullName, memberNumber: sale.customer.memberNumber ?? "Member" } : undefined, customer: sale.customer, payment, retailSale: sale, relatedPayments: relatedRefunds };
    }
    const payment = this.db.payments.find((p) => p.id === receipt.paymentId)!;
    const branch = this.db.branches.find((b) => b.id === payment.branchId)!;
    const member = this.db.members.find((m) => m.id === payment.memberId)!;
    const charge = this.db.charges.find((c) => c.id === payment.chargeId);
    const related = this.db.payments.filter((p) => p.originalPaymentId === payment.id || (payment.originalPaymentId && p.id === payment.originalPaymentId));
    return {
      receipt,
      organization: {
        name: this.db.organization.name,
        receiptFooter: this.db.organization.receiptFooter,
        taxRatePercent: this.db.organization.taxRatePercent,
      },
      branch: { name: branch.name, code: branch.code, address: branch.address, phone: branch.phone },
      member: { fullName: member.fullName, memberNumber: member.memberNumber },
      customer: { kind: "member", fullName: member.fullName, phone: member.phone, memberId: member.id, memberNumber: member.memberNumber },
      payment,
      charge,
      relatedPayments: related,
    };
  }

  // -------------------------------------------------------------------------
  // shifts & reconciliation
  // -------------------------------------------------------------------------

  openCashShift(input: T.OpenCashShiftInput): Promise<T.CashShift> {
    return this.respond(() => {
      this.require("reconciliation.open_shift");
      const existing = this.db.shifts.find((s) => s.branchId === input.branchId && s.status === "open");
      if (existing) {
        throw ApiError.of(ERR.SHIFT_ALREADY_OPEN, `A shift is already open at this branch (opened by ${existing.openedByName}).`);
      }
      const shift: T.CashShift = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        branchId: input.branchId,
        openedById: this.actor().id,
        openedByName: this.actor().name,
        openedAt: nowISO(),
        openingFloat: input.openingFloat,
        status: "open",
      };
      this.db.shifts.push(shift);
      return shift;
    });
  }

  getCurrentCashShift(branchId: T.UUID): Promise<T.CashShift | null> {
    return this.respond(() => {
      return this.db.shifts.find((s) => s.branchId === branchId && s.status === "open") ?? null;
    });
  }

  getCurrentShiftTotals(branchId: T.UUID): Promise<{ shift: T.CashShift; totals: T.ShiftTotals } | null> {
    return this.respond(() => {
      const shift = this.db.shifts.find((s) => s.branchId === branchId && s.status === "open");
      if (!shift) return null;
      return { shift, totals: this.shiftTotals(shift) };
    });
  }

  subscribeCurrentShiftTotals(branchId: T.UUID, onValue: (value: { shift: T.CashShift; totals: T.ShiftTotals } | null) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.getCurrentShiftTotals(branchId), onValue, onError);
  }

  private shiftTotals(shift: T.CashShift): T.ShiftTotals {
    const inShift: Array<T.Payment | T.RetailPayment> = [...this.db.payments, ...this.db.retailSales.map((sale) => this.retailPaymentProjection(sale))].filter((p) => p.shiftId === shift.id && p.status !== "voided");
    const isCollection = (p: T.Payment | T.RetailPayment) => p.type === "payment" || p.type === "retail_sale";
    const sum = (fn: (p: T.Payment | T.RetailPayment) => boolean) => inShift.filter(fn).reduce((s, p) => s + Math.abs(p.amount.amount), 0);
    return {
      cashPayments: money(sum((p) => p.method === "cash" && isCollection(p)), this.db.organization.currency),
      cashRefunds: money(sum((p) => p.method === "cash" && p.type === "refund"), this.db.organization.currency),
      cardPayments: money(sum((p) => p.method === "card" && isCollection(p)), this.db.organization.currency),
      transferPayments: money(sum((p) => (p.method === "bank_transfer" || p.method === "cliq") && isCollection(p)), this.db.organization.currency),
      otherPayments: money(sum((p) => p.method === "other" && isCollection(p)), this.db.organization.currency),
      paymentCount: inShift.filter(isCollection).length,
      refundCount: inShift.filter((p) => p.type === "refund").length,
      discountsTotal: money(
        inShift
          .map((p) => ("chargeId" in p ? this.db.charges.find((c) => c.id === p.chargeId)?.discount.amount ?? 0 : 0))
          .reduce((s, d) => s + d, 0),
      ),
    };
  }

  closeCashShift(shiftId: T.UUID, input: T.CloseCashShiftInput): Promise<T.CashShift> {
    return this.respond(() => {
      this.require("reconciliation.close_shift");
      const shift = this.db.shifts.find((s) => s.id === shiftId);
      if (!shift) throw ApiError.of(ERR.NOT_FOUND, "Shift not found.");
      if (shift.status === "closed") throw ApiError.of(ERR.VALIDATION, "Shift is already closed.");
      const totals = this.shiftTotals(shift);
      const expected = shift.openingFloat.amount + totals.cashPayments.amount - totals.cashRefunds.amount;
      const variance = input.countedCash.amount - expected;
      if (variance !== 0 && !input.varianceExplanation?.trim()) {
        throw ApiError.of(ERR.VALIDATION, "Explain the cash variance before closing.", {
          fieldErrors: { varianceExplanation: ["Required when counted cash does not match expected"] },
        });
      }
      shift.status = "closed";
      shift.closedAt = nowISO();
      shift.closedById = this.actor().id;
      shift.expectedCash = money(expected);
      shift.countedCash = input.countedCash;
      shift.variance = money(variance);
      shift.varianceExplanation = input.varianceExplanation;
      shift.varianceApprovalStatus = variance === 0 ? "none" : "pending";
      if (variance !== 0) {
        const branch = this.db.branches.find((b) => b.id === shift.branchId)!;
        this.audit({
          category: "reconciliation",
          action: "shift.close_variance",
          entityType: "cash_shift",
          entityId: shift.id,
          entityLabel: `${branch.name} · shift ${todayISODate(TZ, new Date(shift.openedAt))}`,
          summary: `Shift closed with ${variance < 0 ? "shortage" : "surplus"} of JOD ${(Math.abs(variance) / 1000).toFixed(3)}`,
          reason: input.varianceExplanation,
          before: { expectedCash: expected },
          after: { countedCash: input.countedCash.amount },
          approvalStatus: "pending",
          branchId: shift.branchId,
        });
      }
      return shift;
    });
  }

  listCashShifts(query: { branchId?: T.UUID; page?: number; pageSize?: number }): Promise<T.Page<T.CashShift>> {
    return this.respond(() => {
      const branchId = this.branchScopedBranchId(query.branchId);
      let items = [...this.db.shifts].sort((a, b) => (a.openedAt < b.openedAt ? 1 : -1));
      if (branchId) items = items.filter((s) => s.branchId === branchId);
      return paginate(this.maybeEmpty(items), query);
    });
  }

  subscribeCashShifts(query: { branchId?: T.UUID; page?: number; pageSize?: number }, onValue: (page: T.Page<T.CashShift>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listCashShifts(query), onValue, onError);
  }

  reviewVariance(shiftId: T.UUID, input: { decision: "approved" | "rejected"; note: string }): Promise<T.CashShift> {
    return this.respond(() => {
      this.require("reconciliation.approve_variance");
      this.requireReason(input.note);
      const shift = this.db.shifts.find((s) => s.id === shiftId);
      if (!shift) throw ApiError.of(ERR.NOT_FOUND, "Shift not found.");
      shift.varianceApprovalStatus = input.decision;
      const audit = this.db.audits.find((a) => a.entityType === "cash_shift" && a.entityId === shift.id && a.approvalStatus === "pending");
      if (audit) audit.approvalStatus = input.decision;
      return shift;
    });
  }

  getDailyReconciliation(query: { branchId: T.UUID; date: T.ISODate }): Promise<T.ReconciliationReport> {
    return this.respond(() => {
      this.require("reports.financial.read");
      const dayPayments: Array<T.Payment | T.RetailPayment> = [...this.db.payments, ...this.db.retailSales.map((sale) => this.retailPaymentProjection(sale))].filter(
        (p) => p.branchId === query.branchId && p.status !== "voided" && todayISODate(TZ, new Date(p.occurredAt)) === query.date,
      );
      const isCollection = (p: T.Payment | T.RetailPayment) => p.type === "payment" || p.type === "retail_sale";
      const methods: T.PaymentMethodKey[] = ["cash", "card", "bank_transfer", "cliq", "other"];
      const totalsByMethod = methods
        .map((method) => {
          const ofMethod = dayPayments.filter((p) => p.method === method);
          const paymentsSum = ofMethod.filter(isCollection).reduce((s, p) => s + p.amount.amount, 0);
          const refundsSum = ofMethod.filter((p) => p.type === "refund").reduce((s, p) => s + Math.abs(p.amount.amount), 0);
          return {
            method,
            payments: money(paymentsSum, this.db.organization.currency),
            refunds: money(refundsSum, this.db.organization.currency),
            net: money(paymentsSum - refundsSum, this.db.organization.currency),
            count: ofMethod.length,
          };
        })
        .filter((row) => row.count > 0);
      const discountsTotal = dayPayments
        .filter(isCollection)
        .map((p) => ("chargeId" in p ? this.db.charges.find((c) => c.id === p.chargeId)?.discount.amount ?? 0 : 0))
        .reduce((s, d) => s + d, 0);
      const shifts = this.db.shifts.filter(
        (s) => s.branchId === query.branchId && todayISODate(TZ, new Date(s.openedAt)) === query.date,
      );
      return {
        branchId: query.branchId,
        date: query.date,
        totalsByMethod,
        totalCollected: money(dayPayments.filter(isCollection).reduce((s, p) => s + p.amount.amount, 0), this.db.organization.currency),
        totalRefunded: money(dayPayments.filter((p) => p.type === "refund").reduce((s, p) => s + Math.abs(p.amount.amount), 0), this.db.organization.currency),
        discountsTotal: money(discountsTotal, this.db.organization.currency),
        shifts,
        totalVariance: money(shifts.reduce((s, sh) => s + (sh.variance?.amount ?? 0), 0)),
      };
    });
  }

  private managementReportInput(input: T.ManagementReportInput): { fromDate: string; toDate: string; branchId?: T.UUID } {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.toDate)) throw ApiError.of(ERR.VALIDATION, "Report dates must use YYYY-MM-DD.");
    const from = new Date(`${input.fromDate}T00:00:00.000Z`);
    const to = new Date(`${input.toDate}T00:00:00.000Z`);
    if (!Number.isFinite(from.getTime()) || from.toISOString().slice(0, 10) !== input.fromDate || !Number.isFinite(to.getTime()) || to.toISOString().slice(0, 10) !== input.toDate) throw ApiError.of(ERR.VALIDATION, "Report dates must use YYYY-MM-DD.");
    if (input.fromDate > input.toDate) throw ApiError.of(ERR.VALIDATION, "Report fromDate must be on or before toDate.");
    const branchId = input.branchId ? this.accountingBranch(input.branchId)?.id : undefined;
    return { fromDate: input.fromDate, toDate: input.toDate, branchId };
  }

  private managementBranchVisible(branchId: T.UUID | undefined, requestedBranchId?: T.UUID): boolean {
    if (requestedBranchId) return branchId === requestedBranchId;
    return branchId ? this.branchIsVisible(branchId) : this.actor().branchScope === "all";
  }

  private managementReportEntries(range: { fromDate: string; toDate: string; branchId?: T.UUID }, throughOnly = false): T.AccountingJournalEntryDetail[] {
    return this.accountingEntries.filter((entry) => {
      if (entry.status !== "posted" && entry.status !== "reversed") return false;
      if (!this.managementBranchVisible(entry.branchId, range.branchId)) return false;
      return throughOnly ? entry.postingDate <= range.toDate : entry.postingDate >= range.fromDate && entry.postingDate <= range.toDate;
    });
  }

  private managementStatementSection(entries: T.AccountingJournalEntryDetail[], groups: T.AccountingStatementGroup[], sign: "debit" | "credit", branchId?: T.UUID): T.ManagementStatementSection {
    const rows = new Map<string, { account: T.AccountingAccount; amount: number; ids: Set<string> }>();
    const groupSet = new Set(groups);
    for (const entry of entries) for (const line of entry.lines.filter((candidate) => groupSet.has(candidate.statementGroup) && this.managementBranchVisible(candidate.branchId, branchId))) {
      const account = this.accountingAccounts.find((candidate) => candidate.code === line.accountCode) ?? this.accountingAccount(line.accountId);
      const amount = sign === "credit" ? line.credit.amount - line.debit.amount : line.debit.amount - line.credit.amount;
      if (amount === 0) continue;
      const current = rows.get(account.code) ?? { account, amount: 0, ids: new Set<string>() };
      current.amount += amount;
      current.ids.add(entry.id);
      rows.set(account.code, current);
    }
    const lines = [...rows.values()].filter((row) => row.amount !== 0).sort((a, b) => a.account.code.localeCompare(b.account.code)).map((row) => ({ accountId: row.account.id, accountCode: row.account.code, accountName: row.account.name, amount: money(row.amount), entryIds: [...row.ids].sort() }));
    return { lines, total: money(lines.reduce((sum, row) => sum + row.amount.amount, 0)) };
  }

  private mockSourceQueueCoverage(range: { fromDate: string; toDate: string; branchId?: T.UUID }): { status: "proven" | "refresh_required"; candidates: Array<{ sourceType: T.AccountingSourceType; sourceId: T.UUID; status: T.AccountingSourceStatus; current: boolean; row?: T.AccountingSourcePosting; fact: MockAccountingFact }>; lastQueueProjectionAt?: string } {
    const allCandidates = this.mockAccountingSourceCandidates(MOCK_ACCOUNTING_SOURCE_TYPES, range.branchId, { fromDate: range.fromDate, toDate: range.toDate });
    const candidates: Array<{ sourceType: T.AccountingSourceType; sourceId: T.UUID; status: T.AccountingSourceStatus; current: boolean; row?: T.AccountingSourcePosting; fact: MockAccountingFact }> = [];
    for (const candidate of allCandidates) {
      const existing = this.accountingSources.find((row) => row.sourceType === candidate.sourceType && row.sourceId === candidate.sourceId);
      const fact = preserveMockSourcePolicy(this.mockAccountingFact(candidate.sourceType, candidate.sourceId), existing);
      const occurredDate = managementLocalDate(fact.occurredAt, this.db.organization.timezone);
      if (occurredDate < range.fromDate || occurredDate > range.toDate) continue;
      const currency = fact.currency ?? this.db.organization.currency;
      const status: T.AccountingSourceStatus = fact.status ?? (!fact.branchId || !fact.policyCode || !fact.debitCode || !fact.creditCode || fact.amount === undefined || fact.amount <= 0 || currency !== this.db.organization.currency ? "unconfigured" : "pending");
      const projectionFingerprint = mockSourceProjectionFingerprint({ ...fact, sourceType: candidate.sourceType, sourceId: candidate.sourceId }, status);
      const postedEvidence = existing?.status === "posted" || existing?.status === "reversed";
      candidates.push({ sourceType: candidate.sourceType, sourceId: candidate.sourceId, status, current: postedEvidence ? Boolean(existing.projectionFingerprint) : existing?.projectionFingerprint === projectionFingerprint, row: existing, fact });
    }
    const digestRows = candidates.map((item) => ({ key: `${item.sourceType}:${item.sourceId}`, fingerprint: item.row && (item.row.status === "posted" || item.row.status === "reversed") ? item.row.projectionFingerprint ?? mockSourceProjectionFingerprint({ ...item.fact, sourceType: item.sourceType, sourceId: item.sourceId }, item.status) : mockSourceProjectionFingerprint({ ...item.fact, sourceType: item.sourceType, sourceId: item.sourceId }, item.status) })).sort((left, right) => left.key.localeCompare(right.key));
    const candidateDigest = stableJson(digestRows);
    const runs = this.accountingSourceQueueRuns;
    const reportRun = runs.find((run) => mockSourceTypesDigest(run.sourceTypes) === mockSourceTypesDigest(MOCK_ACCOUNTING_SOURCE_TYPES) && (range.branchId ? run.branchId === undefined || run.branchId === range.branchId : run.branchId === undefined) && ((!run.fromDate && !run.toDate) || (run.fromDate === range.fromDate && run.toDate === range.toDate)));
    const fullScan = reportRun !== undefined && !reportRun.fromDate && !reportRun.toDate;
    const runMatches = Boolean(reportRun && (fullScan || (reportRun.candidateDigest === candidateDigest && reportRun.candidateCount === candidates.length)));
    const current = candidates.every((candidate) => candidate.current);
    const latest = runs.map((run) => run.scannedAt).sort().at(-1);
    return { status: runMatches && current ? "proven" : "refresh_required", candidates, lastQueueProjectionAt: latest };
  }

  private managementReportMetadata(range: { fromDate: string; toDate: string; branchId?: T.UUID }): T.ManagementReportCompleteness & { membershipRevenueRecognition: T.ManagementMetricStatus; depreciationCoverage: T.ManagementMetricStatus } {
    const sourceRows = this.accountingSources.filter((row) => managementLocalDate(row.occurredAt, this.db.organization.timezone) >= range.fromDate && managementLocalDate(row.occurredAt, this.db.organization.timezone) <= range.toDate && this.managementBranchVisible(row.branchId, range.branchId));
    const sourcePostingCounts: Record<T.AccountingSourceStatus, number> = { pending: 0, posted: 0, unconfigured: 0, excluded: 0, failed: 0, reversed: 0 };
    for (const row of sourceRows) sourcePostingCounts[row.status] += 1;
    const queueCoverage = this.mockSourceQueueCoverage(range);
    const statusFor = (sourceType: T.AccountingSourceType): T.ManagementMetricStatus => {
      const candidates = queueCoverage.candidates.filter((candidate) => candidate.sourceType === sourceType);
      if (candidates.length === 0) return "not_available";
      return candidates.every((candidate) => candidate.current && (candidate.row?.status === "posted" || candidate.row?.status === "reversed") && candidate.fact.status === undefined) ? "available" : "not_configured";
    };
    const membershipRevenueRecognition = statusFor("membership_revenue_recognition");
    const depreciationCoverage = statusFor("equipment_depreciation");
    const warnings = new Set<string>();
    if (queueCoverage.status !== "proven") warnings.add("Accounting source queue coverage is not proven for this report. Refresh the source queue before relying on completeness.");
    if (sourceRows.some((row) => ["pending", "unconfigured", "excluded", "failed"].includes(row.status))) warnings.add("Some authoritative accounting sources are not posted; pending, excluded, or failed facts are omitted from the statements.");
    if (membershipRevenueRecognition === "not_configured") warnings.add("Membership revenue recognition coverage is incomplete; deferred amounts remain unearned until the validated service schedule is posted.");
    if (depreciationCoverage === "not_configured") warnings.add("Fixed assets have incomplete depreciation coverage; affected assets remain gross until acquisition, date, cost, useful life, and lifecycle requirements are posted.");
    const policyVersions = [...new Map(this.accountingEntries
      .filter((entry) => (entry.status === "posted" || entry.status === "reversed") && entry.postingDate >= range.fromDate && entry.postingDate <= range.toDate && this.managementBranchVisible(entry.branchId, range.branchId) && entry.policyCode && entry.policyVersion)
      .map((entry) => [`${entry.policyCode}:${entry.policyVersion}`, { code: entry.policyCode!, version: entry.policyVersion! }])).values()];
    return { organizationId: this.db.organization.id, branchId: range.branchId, fromDate: range.fromDate, toDate: range.toDate, timezone: this.db.organization.timezone, currency: this.db.organization.currency, generatedAt: nowISO(), policyVersions, sourcePostingCounts, queueCoverage: queueCoverage.status, lastQueueProjectionAt: queueCoverage.lastQueueProjectionAt, warnings: [...warnings], membershipRevenueRecognition, depreciationCoverage, disclaimer: "Management accounting projection for operational decision support. This is not statutory, tax, audit, or jurisdiction-specific financial reporting." };
  }

  getIncomeStatement(input: T.ManagementReportInput): Promise<T.IncomeStatement> {
    return this.respond(() => {
      this.requireReportingRead();
      const range = this.managementReportInput(input);
      const entries = this.managementReportEntries(range);
      const revenue = this.managementStatementSection(entries, ["revenue"], "credit");
      const costOfSales = this.managementStatementSection(entries, ["cost_of_sales"], "debit");
      const operatingExpenses = this.managementStatementSection(entries, ["operating_expense"], "debit");
      const otherIncome = this.managementStatementSection(entries, ["other_income"], "credit");
      const otherExpenses = this.managementStatementSection(entries, ["other_expense"], "debit");
      const totalRevenue = revenue.total.amount + otherIncome.total.amount;
      const totalCosts = costOfSales.total.amount + operatingExpenses.total.amount + otherExpenses.total.amount;
      const metadata = this.managementReportMetadata(range);
      return { ...metadata, revenue, costOfSales, operatingExpenses, otherIncome, otherExpenses, totalRevenue: money(totalRevenue), totalCosts: money(totalCosts), netIncome: money(totalRevenue - totalCosts), membershipRevenueRecognition: metadata.membershipRevenueRecognition };
    });
  }

  getBalanceSheet(input: T.ManagementReportInput): Promise<T.BalanceSheet> {
    return this.respond(() => {
      this.requireReportingRead();
      const range = this.managementReportInput(input);
      const entries = this.managementReportEntries(range, true);
      const currentAssets = this.managementStatementSection(entries, ["asset_current"], "debit");
      const noncurrentAssets = this.managementStatementSection(entries, ["asset_noncurrent"], "debit");
      const currentLiabilities = this.managementStatementSection(entries, ["liability_current"], "credit");
      const noncurrentLiabilities = this.managementStatementSection(entries, ["liability_noncurrent"], "credit");
      const equity = this.managementStatementSection(entries, ["equity"], "credit");
      const recognizedRevenue = this.managementStatementSection(entries, ["revenue", "other_income"], "credit").total.amount;
      const recognizedCosts = this.managementStatementSection(entries, ["cost_of_sales", "operating_expense", "other_expense"], "debit").total.amount;
      const currentEarnings = recognizedRevenue - recognizedCosts;
      const totalAssets = currentAssets.total.amount + noncurrentAssets.total.amount;
      const totalLiabilities = currentLiabilities.total.amount + noncurrentLiabilities.total.amount;
      const totalEquity = equity.total.amount + currentEarnings;
      const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
      return { ...this.managementReportMetadata(range), asOfDate: range.toDate, assets: { current: currentAssets, noncurrent: noncurrentAssets }, liabilities: { current: currentLiabilities, noncurrent: noncurrentLiabilities }, equity, currentEarnings: money(currentEarnings), totalAssets: money(totalAssets), totalLiabilities: money(totalLiabilities), totalEquity: money(totalEquity), totalLiabilitiesAndEquity: money(totalLiabilitiesAndEquity), difference: money(totalAssets - totalLiabilitiesAndEquity), balanced: totalAssets === totalLiabilitiesAndEquity };
    });
  }

  getCashflowStatement(input: T.ManagementReportInput): Promise<T.CashflowStatement> {
    return this.respond(() => {
      this.requireReportingRead();
      const range = this.managementReportInput(input);
      const entries = this.managementReportEntries(range);
      const allEntries = this.managementReportEntries({ ...range, fromDate: "0000-01-01" });
      const openingCash = allEntries.filter((entry) => entry.postingDate < range.fromDate).flatMap((entry) => entry.lines).filter((line) => ["1100", "1110", "1120"].includes(line.accountCode)).reduce((sum, line) => sum + line.debit.amount - line.credit.amount, 0);
      const throughCash = allEntries.filter((entry) => entry.postingDate <= range.toDate).flatMap((entry) => entry.lines).filter((line) => ["1100", "1110", "1120"].includes(line.accountCode)).reduce((sum, line) => sum + line.debit.amount - line.credit.amount, 0);
      const rows = new Map<string, { category: T.ManagementCashflowCategory; account: T.AccountingAccount; amount: number; ids: Set<string> }>();
      const sectionFor = (category: T.ManagementCashflowCategory): T.CashflowSection => {
        const lines = [...rows.values()].filter((row) => row.category === category).sort((a, b) => a.account.code.localeCompare(b.account.code)).map((row) => ({ accountId: row.account.id, accountCode: row.account.code, accountName: row.account.name, amount: money(row.amount), entryIds: [...row.ids].sort() }));
        return { category, lines, netChange: money(lines.reduce((sum, line) => sum + line.amount.amount, 0)) };
      };
      for (const entry of entries) {
        for (const cashLine of entry.lines.filter((line) => ["1100", "1110", "1120"].includes(line.accountCode))) {
          const counterparts = entry.lines.filter((line) => line !== cashLine && !["1100", "1110", "1120"].includes(line.accountCode));
          const category: T.ManagementCashflowCategory = counterparts.some((line) => line.statementGroup === "asset_noncurrent") ? "investing" : counterparts.some((line) => line.statementGroup === "equity" || line.statementGroup === "liability_noncurrent") ? "financing" : "operating";
          const account = this.accountingAccounts.find((candidate) => candidate.code === cashLine.accountCode) ?? this.accountingAccount(cashLine.accountId);
          const key = `${category}:${account.code}`;
          const current = rows.get(key) ?? { category, account, amount: 0, ids: new Set<string>() };
          current.amount += cashLine.debit.amount - cashLine.credit.amount;
          current.ids.add(entry.id);
          rows.set(key, current);
        }
      }
      const operating = sectionFor("operating");
      const investing = sectionFor("investing");
      const financing = sectionFor("financing");
      const netChange = operating.netChange.amount + investing.netChange.amount + financing.netChange.amount;
      // Keep the two sides independent: expected closing cash comes from
      // opening cash plus classified movements, while as-of cash comes from
      // the cash-account position through the report end date. A zero
      // difference is not a completeness assertion while queue coverage is
      // still awaiting refresh.
      const expectedClosingCash = openingCash + netChange;
      const asOfCash = throughCash;
      const metadata = this.managementReportMetadata(range);
      const reconciliationStatus: T.ManagementReconciliationStatus = metadata.queueCoverage === "proven"
        ? expectedClosingCash === asOfCash ? "proven" : "not_available"
        : "unproven";
      const reconciliationNote = reconciliationStatus === "unproven"
        ? "Cash arithmetic agrees with the current ledger projection, but source queue coverage is not proven. Refresh the source queue before treating this reconciliation as complete."
        : reconciliationStatus === "not_available"
          ? "The classified cash movement does not agree with the independent cash-account position through the as-of date."
          : undefined;
      return {
        ...metadata,
        openingCash: money(openingCash),
        operating,
        investing,
        financing,
        netChange: money(netChange),
        closingCash: money(asOfCash),
        reconciliationDifference: money(expectedClosingCash - asOfCash),
        reconciliationStatus,
        reconciliation: {
          status: reconciliationStatus,
          expectedClosingCash: money(expectedClosingCash),
          asOfCash: money(asOfCash),
          difference: money(expectedClosingCash - asOfCash),
          note: reconciliationNote,
        },
        balanced: reconciliationStatus === "proven" && expectedClosingCash === asOfCash,
        classificationPolicy: { code: "cashflow-classification.v1", version: 1, description: "Actual cash and clearing account movements are classified as investing when paired with fixed assets, financing when paired with equity or non-current financing, and operating otherwise." },
      };
    });
  }

  getGeneralManagerAnalysis(input: T.ManagementReportInput): Promise<T.GeneralManagerAnalysis> {
    return this.respond(() => {
      this.requireReportingRead();
      const range = this.managementReportInput(input);
      const metadata = this.managementReportMetadata(range);
      const currentSnapshot = range.toDate === todayISODate(this.db.organization.timezone, new Date());
      const sourceRows = this.accountingSources.filter((row) => managementLocalDate(row.occurredAt, this.db.organization.timezone) >= range.fromDate && managementLocalDate(row.occurredAt, this.db.organization.timezone) <= range.toDate && row.status === "posted" && this.managementBranchVisible(row.branchId, range.branchId));
      const moneyMetric = (key: string, label: string, amount: number, ids: string[], note?: string, statusOverride?: T.ManagementMetricStatus): T.ManagementAnalysisMetric => ({ key, label, status: statusOverride ?? (ids.length > 0 ? "available" : "not_available"), value: statusOverride === "not_available" || statusOverride === "not_configured" || (!statusOverride && ids.length === 0) ? undefined : money(amount), unit: "money", sourceCount: ids.length, drilldownIds: ids.slice(0, 100), note });
      const collectionRows = sourceRows.filter((row) => ["payment", "refund", "void"].includes(row.sourceType));
      const membershipRows = sourceRows.filter((row) => ["membership_sale", "membership_renewal"].includes(row.sourceType));
      const metrics: T.ManagementAnalysisMetric[] = [moneyMetric("collections", "Recorded collections", collectionRows.reduce((sum, row) => sum + (row.sourceType === "payment" ? row.amount?.amount ?? 0 : -(row.amount?.amount ?? 0)), 0), collectionRows.map((row) => row.id)), moneyMetric("deferred_membership_sales", "Deferred membership sales", membershipRows.reduce((sum, row) => sum + (row.amount?.amount ?? 0), 0), membershipRows.map((row) => row.id), "Membership sales follow the configured deferred policy.")];
      metrics.push({ key: "renewal_deliveries", label: "Renewal recovery deliveries", status: "not_available", value: undefined, unit: "count", sourceCount: 0, drilldownIds: [], note: "The mock adapter has no provider-neutral renewal delivery ledger." });
      const visibleCharge = (charge: T.Charge): boolean => {
        const membership = charge.membershipId ? this.db.memberships.find((candidate) => candidate.id === charge.membershipId) : undefined;
        const member = this.db.members.find((candidate) => candidate.id === charge.memberId);
        return this.managementBranchVisible(membership?.homeBranchId ?? member?.homeBranchId, range.branchId);
      };
      const outstanding = this.db.charges.filter((charge) => visibleCharge(charge) && (charge.dueDate ?? charge.createdAt.slice(0, 10)) <= range.toDate && !["void", "refunded"].includes(charge.status) && charge.outstandingAmount.amount > 0);
      metrics.push(currentSnapshot
        ? { key: "outstanding_balances", label: "Outstanding collectible balances", status: outstanding.length > 0 ? "available" : "not_available", value: outstanding.length > 0 ? money(outstanding.reduce((sum, charge) => sum + charge.outstandingAmount.amount, 0)) : undefined, unit: "money", sourceCount: outstanding.length, drilldownIds: outstanding.map((charge) => charge.id), note: "Current snapshot from charge records." }
        : { key: "outstanding_balances", label: "Outstanding collectible balances", status: "not_available", value: undefined, unit: "money", sourceCount: 0, drilldownIds: [], note: "Historical outstanding balances are unavailable because the mock charge model has no immutable balance-transition history." });
      const openAlerts = this.db.lowStockAlerts.filter((row) => row.status === "open" && this.managementBranchVisible(row.branchId, range.branchId));
      metrics.push(currentSnapshot
        ? { key: "low_stock", label: "Open low-stock alerts", status: "available", value: openAlerts.length, unit: "count", sourceCount: openAlerts.length, drilldownIds: openAlerts.map((row) => row.id), note: "Current snapshot from inventory alerts." }
        : { key: "low_stock", label: "Open low-stock alerts", status: "not_available", value: undefined, unit: "count", sourceCount: 0, drilldownIds: [], note: "Historical low-stock state is unavailable because inventory alerts are mutable projections without transition history." });
      const openOrders = this.db.purchaseOrders.filter((row) => ["approved", "partially_received"].includes(row.status) && this.managementBranchVisible(row.branchId, range.branchId));
      metrics.push(currentSnapshot
        ? moneyMetric("supplier_commitments", "Open supplier commitments", openOrders.reduce((sum, row) => sum + row.lines.reduce((lineSum, line) => lineSum + Math.max(0, line.orderedQuantity - line.receivedQuantity) * line.unitCost.amount, 0), 0), openOrders.map((row) => row.id), "Current snapshot from purchase order projections.", "available")
        : { key: "supplier_commitments", label: "Open supplier commitments", status: "not_available", value: undefined, unit: "money", sourceCount: 0, drilldownIds: [], note: "Historical supplier commitments are unavailable because purchase-order status is mutable without transition history." });
      const openIssues = this.db.equipmentIssues.filter((row) => ["open", "in_progress"].includes(row.status) && this.managementBranchVisible(row.branchId, range.branchId));
      metrics.push(currentSnapshot
        ? { key: "equipment_downtime", label: "Open equipment issues", status: "available", value: openIssues.reduce((sum, row) => sum + (row.downtimeDays ?? 0), 0), unit: "days", sourceCount: openIssues.length, drilldownIds: openIssues.map((row) => row.id), note: "Current snapshot from equipment issue projections." }
        : { key: "equipment_downtime", label: "Open equipment issues", status: "not_available", value: undefined, unit: "days", sourceCount: 0, drilldownIds: [], note: "Historical equipment issue state is unavailable because issue status is mutable without transition history." });
      const completedFacilities = this.db.facilityTasks.filter((row) => row.status === "completed" && managementLocalDate(row.updatedAt, this.db.organization.timezone) >= range.fromDate && managementLocalDate(row.updatedAt, this.db.organization.timezone) <= range.toDate && this.managementBranchVisible(row.branchId, range.branchId));
      const facilityCostRows = completedFacilities.filter((row) => row.suppliesCost !== undefined);
      metrics.push({ key: "facility_supplies_cost", label: "Recorded facility supplies cost", status: facilityCostRows.length > 0 ? "available" : "not_configured", value: facilityCostRows.length > 0 ? money(facilityCostRows.reduce((sum, row) => sum + (row.suppliesCost?.amount ?? 0), 0)) : undefined, unit: "money", sourceCount: facilityCostRows.length, drilldownIds: facilityCostRows.map((row) => row.id), note: facilityCostRows.length > 0 ? undefined : "No completed facility tasks with configured supplies costs are recorded in this period." });
      const completedRepairs = this.db.equipmentWorkOrders.filter((row) => row.status === "completed" && managementLocalDate(row.updatedAt, this.db.organization.timezone) >= range.fromDate && managementLocalDate(row.updatedAt, this.db.organization.timezone) <= range.toDate && this.managementBranchVisible(row.branchId, range.branchId));
      const repairCostRows = completedRepairs.filter((row) => row.totalCost !== undefined || row.partsCost !== undefined || row.laborCost !== undefined);
      metrics.push({ key: "equipment_repair_cost", label: "Recorded equipment repair cost", status: repairCostRows.length > 0 ? "available" : "not_configured", value: repairCostRows.length > 0 ? money(repairCostRows.reduce((sum, row) => sum + (row.totalCost?.amount ?? (row.partsCost?.amount ?? 0) + (row.laborCost?.amount ?? 0)), 0)) : undefined, unit: "money", sourceCount: repairCostRows.length, drilldownIds: repairCostRows.map((row) => row.id), note: repairCostRows.length > 0 ? undefined : "No completed repair work orders with configured costs are recorded in this period." });
      const variance = this.db.shifts.filter((shift) => this.managementBranchVisible(shift.branchId, range.branchId) && shift.closedAt && managementLocalDate(shift.closedAt, this.db.organization.timezone) >= range.fromDate && managementLocalDate(shift.closedAt, this.db.organization.timezone) <= range.toDate && shift.variance).map((shift) => shift.variance!.amount);
      metrics.push({ key: "cash_variance", label: "Recorded cash shift variance", status: variance.length > 0 ? "available" : "not_available", value: variance.length > 0 ? money(variance.reduce((sum, amount) => sum + amount, 0)) : undefined, unit: "money", sourceCount: variance.length, drilldownIds: [] });
      return { ...metadata, metrics };
    });
  }

  listAccountingAccounts(query: { search?: string } = {}): Promise<T.AccountingAccount[]> {
    return this.respond(() => {
      this.requireFinanceRead();
      const search = query.search?.trim().toLowerCase();
      return this.accountingAccounts.filter((account) => !search || `${account.code} ${account.name}`.toLowerCase().includes(search)).map((account) => ({ ...account }));
    });
  }

  listAccountingPeriods(query: { status?: T.AccountingPeriodStatus } = {}): Promise<T.AccountingPeriod[]> {
    return this.respond(() => {
      this.requireFinanceRead();
      return [...this.accountingPeriods].filter((period) => !query.status || period.status === query.status).sort((a, b) => b.periodStart.localeCompare(a.periodStart)).map((period) => ({ ...period }));
    });
  }

  listAccountingJournalEntries(query: T.AccountingJournalQuery = {}): Promise<T.Page<T.AccountingJournalEntrySummary>> {
    return this.respond(() => {
      this.requireFinanceRead();
      const branchId = query.branchId ? this.accountingBranch(query.branchId)?.id : undefined;
      let rows = this.accountingEntries.filter((entry) => (!branchId || entry.branchId === branchId) && (!query.periodId || entry.periodId === query.periodId) && (!query.status || entry.status === query.status) && (!query.from || entry.postingDate >= query.from) && (!query.to || entry.postingDate <= query.to));
      rows = rows.filter((entry) => this.accountingBranchIsVisible(entry.branchId));
      const items = rows.sort((a, b) => b.postingDate.localeCompare(a.postingDate)).map(({ lines: _lines, reason: _reason, idempotencyKey: _idempotencyKey, reversalOfEntryId: _reversalOfEntryId, reversedByEntryId: _reversedByEntryId, createdById: _createdById, ...summary }) => ({ ...summary }));
      return paginate(items, query);
    });
  }

  getAccountingJournalEntry(entryId: T.UUID): Promise<T.AccountingJournalEntryDetail> {
    return this.respond(() => {
      this.requireFinanceRead();
      const entry = this.accountingEntry(entryId);
      return { ...entry, lines: entry.lines.map((line) => ({ ...line, debit: { ...line.debit }, credit: { ...line.credit } })) };
    });
  }

  getAccountingTrialBalance(query: { branchId?: T.UUID; periodId?: T.UUID } = {}): Promise<T.AccountingTrialBalance> {
    return this.respond(() => {
      this.requireFinanceRead();
      const branchId = query.branchId ? this.accountingBranch(query.branchId)?.id : undefined;
      const balances = new Map(this.accountingAccounts.map((account) => [account.code, { account, debit: 0, credit: 0 }]));
      for (const entry of this.accountingEntries.filter((candidate) => (candidate.status === "posted" || candidate.status === "reversed") && (!query.periodId || candidate.periodId === query.periodId) && (!branchId || candidate.branchId === branchId) && this.accountingBranchIsVisible(candidate.branchId))) {
        for (const line of entry.lines.filter((candidate) => !branchId || candidate.branchId === branchId)) {
          const current = balances.get(line.accountCode);
          if (current) { current.debit += line.debit.amount; current.credit += line.credit.amount; }
        }
      }
      const rows = [...balances.values()].map((row) => ({ ...row, net: row.debit - row.credit })).filter((row) => row.net !== 0).sort((a, b) => a.account.code.localeCompare(b.account.code)).map((row) => ({ accountId: row.account.id, accountCode: row.account.code, accountName: row.account.name, accountType: row.account.accountType, statementGroup: row.account.statementGroup, debit: money(Math.max(row.net, 0)), credit: money(Math.max(-row.net, 0)), balance: money(row.net) }));
      return { organizationId: this.db.organization.id, branchId, periodId: query.periodId, currency: this.db.organization.currency, rows, totalDebit: money(rows.reduce((sum, row) => sum + row.debit.amount, 0)), totalCredit: money(rows.reduce((sum, row) => sum + row.credit.amount, 0)) };
    });
  }

  postManualJournal(input: T.PostManualJournalInput): Promise<T.AccountingJournalEntryDetail> {
    return this.respond(() => {
      this.requireAccountingOwner();
      this.requireReason(input.reason);
      const key = `manual:${input.idempotencyKey}`;
      if (!input.idempotencyKey.trim()) throw ApiError.of(ERR.VALIDATION, "An idempotency key is required.");
      const scope = input.scope ?? "branch";
      if (scope !== "branch" && scope !== "consolidated") throw ApiError.of(ERR.VALIDATION, "Journal scope must be branch or consolidated.");
      if (scope === "consolidated" && this.actor().branchScope !== "all") throw ApiError.of(ERR.FORBIDDEN, "Consolidated journals require organization-wide branch scope.");
      const branch = this.accountingBranch(input.branchId);
      if (scope === "consolidated" && input.branchId) throw ApiError.of(ERR.VALIDATION, "A consolidated journal cannot specify a branch.");
      if (scope === "branch" && !branch) throw ApiError.of(ERR.VALIDATION, "A branch is required for a branch journal.");
      const lines: T.AccountingJournalLine[] = [];
      let debitTotal = 0;
      let creditTotal = 0;
      for (const lineInput of input.lines) {
        const debit = lineInput.debit.amount;
        const credit = lineInput.credit.amount;
        if (lineInput.debit.currency !== this.db.organization.currency || lineInput.credit.currency !== this.db.organization.currency || !Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit < 0 || credit < 0 || (debit === 0 && credit === 0) || (debit > 0 && credit > 0)) throw ApiError.of(ERR.VALIDATION, "Each journal line needs one positive integer debit or credit in the organization currency.");
        const account = this.accountingAccount(lineInput.accountId);
        const nextDebitTotal = debitTotal + debit;
        const nextCreditTotal = creditTotal + credit;
        if (!Number.isSafeInteger(nextDebitTotal) || !Number.isSafeInteger(nextCreditTotal)) throw ApiError.of(ERR.VALIDATION, "Journal totals must remain safe integer minor-unit amounts.");
        debitTotal = nextDebitTotal;
        creditTotal = nextCreditTotal;
        lines.push({ id: mockUuid(), journalEntryId: "pending", branchId: branch?.id, accountId: account.id, accountCode: account.code, accountName: account.name, debit: money(debit), credit: money(credit), description: lineInput.description, statementGroup: account.statementGroup, cashflowGroup: account.cashflowGroup });
      }
      if (lines.length < 2 || debitTotal <= 0 || debitTotal !== creditTotal) throw ApiError.of(ERR.VALIDATION, "Journal debits and credits must be equal and non-zero.");
      const now = nowISO();
      const memo = input.memo.trim() || "Manual journal";
      const postingDate = ledgerDate(input.postingDate, this.today());
      const fingerprint = manualJournalRequestFingerprint({ scope, branchId: branch?.id, postingDate, memo, reason: input.reason.trim(), lines: lines.map((line) => ({ accountId: line.accountId, debitMinor: line.debit.amount, creditMinor: line.credit.amount, description: line.description })) });
      const replay = this.accountingEntries.find((entry) => entry.idempotencyKey === key);
      if (replay) {
        const replayFingerprint = this.accountingEntryFingerprints.get(replay.id) ?? manualJournalRequestFingerprint({ scope: replay.scope, branchId: replay.branchId, postingDate: replay.postingDate, memo: replay.memo, reason: replay.reason ?? "", lines: replay.lines.map((line) => ({ accountId: line.accountId, debitMinor: line.debit.amount, creditMinor: line.credit.amount, description: line.description })) });
        if (replayFingerprint !== fingerprint) throw ApiError.of(ERR.CONFLICT, "This manual journal idempotency key was already used for a different request.");
        return replay;
      }
      const period = this.accountingPeriodFor(postingDate);
      const entryId = mockUuid();
      const entry: T.AccountingJournalEntryDetail = { id: entryId, organizationId: this.db.organization.id, branchId: branch?.id, scope, currency: this.db.organization.currency, postingDate, periodId: period.id, status: "posted", memo, reason: input.reason.trim(), idempotencyKey: key, totalDebit: money(debitTotal), totalCredit: money(creditTotal), lineCount: lines.length, createdAt: now, postedAt: now, createdById: this.actor().id, lines: lines.map((line) => ({ ...line, journalEntryId: entryId })) };
      this.accountingEntries.unshift(entry);
      this.accountingEntryFingerprints.set(entry.id, fingerprint);
      this.audit({ category: "accounting", action: "accounting.manual_post", entityType: "accounting_journal_entry", entityId: entry.id, entityLabel: entry.memo, summary: `Posted manual journal ${entry.id}`, reason: input.reason, branchId: branch?.id });
      return entry;
    });
  }

  listAccountingSourcePostings(query: T.AccountingSourcePostingQuery = {}): Promise<T.Page<T.AccountingSourcePosting>> {
    return this.respond(() => {
      this.requireFinanceRead();
      const branchId = query.branchId ? this.accountingBranch(query.branchId)?.id : undefined;
      const rows = this.accountingSources.filter((row) => (!branchId || row.branchId === branchId) && (!query.status || row.status === query.status) && (!query.sourceType || row.sourceType === query.sourceType) && this.accountingBranchIsVisible(row.branchId)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      return paginate(rows.map((row) => ({ ...row, amount: row.amount ? { ...row.amount } : undefined })), query);
    });
  }

  private mockAccountingSourceCandidates(sourceTypes: readonly T.AccountingSourceType[], requestedBranchId?: T.UUID, dateRange?: MockSourceCandidateDateRange): Array<{ sourceType: T.AccountingSourceType; sourceId: T.UUID; branchId?: T.UUID }> {
    const allowed = new Set(sourceTypes);
    const candidates: Array<{ sourceType: T.AccountingSourceType; sourceId: T.UUID; branchId?: T.UUID }> = [];
    const seen = new Set<string>();
    const add = (sourceType: T.AccountingSourceType, sourceId: T.UUID, branchId?: T.UUID) => {
      if (!allowed.has(sourceType) || (requestedBranchId && branchId !== requestedBranchId) || !this.accountingBranchIsVisible(branchId)) return;
      const key = `${sourceType}:${sourceId}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ sourceType, sourceId, branchId });
    };

    for (const payment of this.db.payments) {
      const sourceType = payment.type === "refund" ? "refund" : payment.status === "voided" ? "void" : "payment";
      if (mockTimestampInDateRange(payment.occurredAt, this.db.organization.timezone, dateRange)) add(sourceType, payment.id, payment.branchId);
    }
    for (const sale of this.db.retailSales) if (mockTimestampInDateRange(sale.createdAt, this.db.organization.timezone, dateRange)) add(sale.status === "voided" ? "void" : "payment", `retail-payment-${sale.id}`, sale.branchId);
    for (const membership of this.db.memberships) if (mockTimestampInDateRange(membership.createdAt, this.db.organization.timezone, dateRange)) add(membership.previousMembershipId ? "membership_renewal" : "membership_sale", membership.id, membership.homeBranchId);
    if (allowed.has("membership_revenue_recognition")) {
      const serviceRange = mockServiceDateRangeThroughToday(dateRange);
      for (const membership of this.db.memberships) {
        const netAmount = membership.salePrice.amount - membership.discount.amount;
        const originalType: T.AccountingSourceType = membership.previousMembershipId ? "membership_renewal" : "membership_sale";
        const original = this.accountingSources.find((row) => row.sourceType === originalType && row.sourceId === membership.id && row.status === "posted");
        const recognitionBase = original?.amount?.amount !== undefined ? Math.min(netAmount, original.amount.amount) : netAmount;
        const cancellationDate = membership.cancelledAt ? managementLocalDate(membership.cancelledAt, this.db.organization.timezone) : undefined;
        const planChangeCutoff = cancellationDate && membership.cancellationReason?.startsWith("Superseded by plan change") ? new Date(Date.parse(`${cancellationDate}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10) : cancellationDate;
        const freezes = membership.activeFreeze ? [membership.activeFreeze] : [];
        const allocations = mockMembershipAllocations(recognitionBase, validAccountingDate(membership.startDate), validAccountingDate(membership.endDate), { cancellationDate: planChangeCutoff, freezes });
        if (allocations.length === 0) {
          if (mockTimestampInDateRange(membership.createdAt, this.db.organization.timezone, dateRange)) add("membership_revenue_recognition", `membership-revenue:${membership.id}:unconfigured`, membership.homeBranchId);
        } else for (const allocation of allocations) if (mockMonthInDateRange(allocation.month, serviceRange)) add("membership_revenue_recognition", `membership-revenue:${membership.id}:${allocation.month}`, membership.homeBranchId);
      }
    }
    for (const order of this.db.purchaseOrders) if (mockTimestampInDateRange(order.receivedAt ?? order.updatedAt, this.db.organization.timezone, dateRange)) add("purchase_order_receipt", order.id, order.branchId);
    for (const movement of this.db.stockMovements) if (mockTimestampInDateRange(movement.occurredAt, this.db.organization.timezone, dateRange)) add("stock_movement", movement.id, movement.branchId);
    for (const task of this.db.facilityTasks) if (mockTimestampInDateRange(task.completedAt ?? task.updatedAt, this.db.organization.timezone, dateRange)) add("facility_supplies", task.id, task.branchId);
    for (const asset of this.db.equipmentAssets) if (mockTimestampInDateRange(asset.purchaseDate ? tenantDateIso(asset.purchaseDate, this.db.organization.timezone) : asset.createdAt, this.db.organization.timezone, dateRange)) add("equipment_acquisition", asset.id, asset.branchId);
    if (allowed.has("equipment_depreciation")) {
      const serviceRange = mockServiceDateRangeThroughToday(dateRange);
      for (const asset of this.db.equipmentAssets) {
        const serviceDate = validAccountingDate(asset.installationDate) ?? validAccountingDate(asset.purchaseDate);
        const usefulLife = asset.expectedUsefulLifeMonths;
        if (!serviceDate || usefulLife === undefined || !Number.isSafeInteger(usefulLife) || usefulLife < 1 || usefulLife > MOCK_MAX_EQUIPMENT_USEFUL_LIFE_MONTHS || asset.status === "retired" || asset.status === "replaced") {
          if (mockTimestampInDateRange(asset.createdAt, this.db.organization.timezone, dateRange)) add("equipment_depreciation", `equipment-depreciation:${asset.id}:unconfigured`, asset.branchId);
          continue;
        }
        const startMonth = serviceDate.slice(0, 7);
        for (let monthIndex = 0; monthIndex < usefulLife; monthIndex += 1) {
          const month = accountingAddMonths(startMonth, monthIndex);
          const amount = mockMonthlyDepreciationAmount(asset.purchaseCost?.amount, usefulLife, monthIndex);
          if (amount !== undefined && amount > 0 && mockMonthInDateRange(month, serviceRange)) add("equipment_depreciation", `equipment-depreciation:${asset.id}:${month}`, asset.branchId);
        }
      }
    }
    for (const workOrder of this.db.equipmentWorkOrders) if (mockTimestampInDateRange(workOrder.completedAt ?? workOrder.updatedAt, this.db.organization.timezone, dateRange)) add("equipment_repair", workOrder.id, workOrder.branchId);
    return candidates;
  }

  refreshAccountingSourceQueue(input: T.RefreshAccountingSourceQueueInput = {}): Promise<T.RefreshAccountingSourceQueueResult> {
    return this.respond(() => {
      this.requireAccountingPosting();
      const supported = [...MOCK_ACCOUNTING_SOURCE_TYPES];
      const sourceTypes = input.sourceTypes ?? supported;
      if (sourceTypes.some((sourceType) => !supported.includes(sourceType))) throw ApiError.of(ERR.VALIDATION, "Source queue refresh contains an unsupported source type.");
      const fromDate = input.fromDate === undefined ? undefined : validAccountingDate(input.fromDate);
      const toDate = input.toDate === undefined ? undefined : validAccountingDate(input.toDate);
      if (input.fromDate !== undefined && !fromDate || input.toDate !== undefined && !toDate) throw ApiError.of(ERR.VALIDATION, "Source queue dates must use real YYYY-MM-DD calendar dates.");
      if (fromDate && toDate && fromDate > toDate) throw ApiError.of(ERR.VALIDATION, "Source queue fromDate must be on or before toDate.");
      const requestedBranchId = input.branchId ? this.accountingBranch(input.branchId)?.id : undefined;
      const candidates = this.mockAccountingSourceCandidates(sourceTypes, requestedBranchId, { fromDate, toDate: toDate ?? managementLocalDate(Date.now(), this.db.organization.timezone) });

      let created = 0;
      let updated = 0;
      let skippedPosted = 0;
      let pending = 0;
      let unconfigured = 0;
      let excluded = 0;
      let coverageProven = sourceTypes.length === supported.length && supported.every((sourceType) => sourceTypes.includes(sourceType));
      const items: T.AccountingSourcePosting[] = [];
      const digestRows: Array<{ key: string; fingerprint?: string }> = [];
      for (const candidate of candidates) {
        const existing = this.accountingSources.find((row) => row.sourceType === candidate.sourceType && row.sourceId === candidate.sourceId);
        const fact = preserveMockSourcePolicy(this.mockAccountingFact(candidate.sourceType, candidate.sourceId), existing);
        const currency = fact.currency ?? this.db.organization.currency;
        const status: T.AccountingSourceStatus = fact.status ?? (!fact.branchId || !fact.policyCode || !fact.debitCode || !fact.creditCode || fact.amount === undefined || fact.amount <= 0 || currency !== this.db.organization.currency ? "unconfigured" : "pending");
        const projectionFingerprint = mockSourceProjectionFingerprint({ ...fact, sourceType: candidate.sourceType, sourceId: candidate.sourceId }, status);
        const inRange = (!fromDate || managementLocalDate(fact.occurredAt, this.db.organization.timezone) >= fromDate) && (!toDate || managementLocalDate(fact.occurredAt, this.db.organization.timezone) <= toDate);
        if (!inRange) continue;
        if (existing?.status === "posted" || existing?.status === "reversed") {
          skippedPosted += 1;
          if (!existing.projectionFingerprint) {
            existing.projectionFingerprint = projectionFingerprint;
            existing.updatedAt = nowISO();
            updated += 1;
          }
          digestRows.push({ key: `${candidate.sourceType}:${candidate.sourceId}`, fingerprint: existing.projectionFingerprint });
          if (!existing.projectionFingerprint) coverageProven = false;
          continue;
        }
        const now = nowISO();
        const policyVersion = accountingPolicyVersion(fact.policyCode);
        const next = { branchId: fact.branchId, status, amount: fact.amount === undefined ? undefined : money(fact.amount, currency), currency, policyCode: fact.policyCode, policyVersion, reason: fact.reason, details: fact.details, projectionFingerprint, occurredAt: fact.occurredAt, journalEntryId: undefined, idempotencyKey: undefined, updatedAt: now };
        let row: T.AccountingSourcePosting;
        if (existing) {
          const changed = existing.branchId !== next.branchId || existing.status !== next.status || existing.amount?.amount !== next.amount?.amount || existing.currency !== next.currency || existing.policyCode !== next.policyCode || existing.policyVersion !== next.policyVersion || existing.journalEntryId !== next.journalEntryId || existing.idempotencyKey !== next.idempotencyKey || existing.reason !== next.reason || existing.occurredAt !== next.occurredAt || existing.projectionFingerprint !== next.projectionFingerprint || stableJson(existing.details ?? null) !== stableJson(next.details ?? null);
          if (changed) { Object.assign(existing, next); updated += 1; }
          row = existing;
        } else {
          row = { id: mockUuid(), organizationId: this.db.organization.id, sourceType: candidate.sourceType, sourceId: candidate.sourceId, ...next, createdAt: now };
          this.accountingSources.unshift(row);
          created += 1;
        }
        if (row.status === "pending") pending += 1;
        if (row.status === "unconfigured") unconfigured += 1;
        if (row.status === "excluded") excluded += 1;
        digestRows.push({ key: `${candidate.sourceType}:${candidate.sourceId}`, fingerprint: row.projectionFingerprint });
        if (!row.projectionFingerprint) coverageProven = false;
        items.push({ ...row, amount: row.amount ? { ...row.amount } : undefined });
      }
      const scannedAt = nowISO();
      const sortedDigestRows = digestRows.sort((left, right) => left.key.localeCompare(right.key));
      this.accountingSourceQueueRuns.unshift({ branchId: requestedBranchId, fromDate, toDate, sourceTypes: [...new Set(sourceTypes)], candidateDigest: stableJson(sortedDigestRows), candidateCount: sortedDigestRows.length, scannedAt });
      this.audit({ category: "accounting", action: "accounting.source_queue.refresh", entityType: "accounting_source_queue_run", entityId: requestedBranchId ?? this.db.organization.id, entityLabel: "Source queue", summary: `Refreshed accounting source queue (${created} created, ${updated} updated)`, branchId: requestedBranchId });
      return { organizationId: this.db.organization.id, branchId: requestedBranchId, scanned: candidates.length, created, updated, skippedPosted, pending, unconfigured, excluded, queueCoverage: coverageProven ? "proven" : "refresh_required", scannedFromDate: fromDate, scannedToDate: toDate, items };
    });
  }

  private mockAccountingFact(sourceType: T.AccountingSourceType, sourceId: T.UUID): MockAccountingFact {
    const accountForMethod = (method: T.PaymentMethodKey) => method === "card" ? "1110" : method === "bank_transfer" || method === "cliq" ? "1120" : "1100";
    if (["payment", "refund", "void"].includes(sourceType)) {
      const retailSale = this.db.retailSales.find((sale) => `retail-payment-${sale.id}` === sourceId);
      const payment: T.Payment | T.RetailPayment | undefined = this.db.payments.find((candidate) => candidate.id === sourceId) ?? (retailSale ? this.retailPaymentProjection(retailSale) : undefined);
      if (!payment) throw ApiError.of(ERR.NOT_FOUND, "Payment source not found.");
      const isRetail = payment.type === "retail_sale" || ("retailSaleId" in payment && Boolean(payment.retailSaleId));
      const valid = sourceType === "payment" ? (payment.type === "payment" || isRetail) && payment.status !== "voided" : sourceType === "refund" ? payment.type === "refund" : (payment.type === "payment" || isRetail) && payment.status === "voided";
      const debitCode = sourceType === "payment" ? accountForMethod(payment.method) : isRetail ? "4200" : "1200";
      const creditCode = sourceType === "payment" ? (isRetail ? "4200" : "1200") : accountForMethod(payment.method);
      const normalizedAmount = sourceType === "refund" ? Math.abs(payment.amount.amount) : payment.amount.amount;
      const currencyMismatch = payment.amount.currency !== this.db.organization.currency;
      const policyPrefix = isRetail ? (sourceType === "payment" ? "retail-sale" : sourceType === "refund" ? "retail-refund" : "retail-void") : sourceType;
      const policyVersion = isRetail ? 2 : 1;
      return { amount: normalizedAmount, currency: payment.amount.currency, branchId: payment.branchId, occurredAt: payment.occurredAt, debitCode, creditCode, policyCode: `${policyPrefix}-${payment.method}.v${policyVersion}`, status: currencyMismatch ? "excluded" : valid && normalizedAmount > 0 ? undefined : "unconfigured", reason: currencyMismatch ? "Payment currency does not match organization currency." : valid ? normalizedAmount > 0 ? undefined : "Payment source has no positive amount." : "Payment lifecycle does not match the requested accounting source type.", details: { method: payment.method, saleType: isRetail ? "retail" : "membership" } };
    }
    if (sourceType === "membership_sale" || sourceType === "membership_renewal") {
      const membership = this.db.memberships.find((candidate) => candidate.id === sourceId);
      if (!membership) throw ApiError.of(ERR.NOT_FOUND, "Membership source not found.");
      const renewal = Boolean(membership.previousMembershipId);
      const netAmount = membership.salePrice.amount - membership.discount.amount;
      const validLifecycle = !membership.cancelledAt && ((sourceType === "membership_renewal" && renewal) || (sourceType === "membership_sale" && !renewal));
      const validDiscount = membership.discount.currency === this.db.organization.currency && Number.isSafeInteger(membership.discount.amount) && membership.discount.amount >= 0 && membership.discount.amount <= membership.salePrice.amount && membership.discountApprovalStatus !== "pending" && membership.discountApprovalStatus !== "rejected";
      const validAmount = Number.isSafeInteger(netAmount) && netAmount >= 0;
      const currencyMismatch = membership.salePrice.currency !== this.db.organization.currency || membership.discount.currency !== this.db.organization.currency;
      return { amount: netAmount, currency: membership.salePrice.currency, branchId: membership.homeBranchId, occurredAt: membership.createdAt, debitCode: "1200", creditCode: "2200", policyCode: `${sourceType === "membership_sale" ? "membership-sale" : "membership-renewal"}.v1`, status: currencyMismatch ? "excluded" : validLifecycle && validDiscount && validAmount ? undefined : "unconfigured", reason: currencyMismatch ? "Membership currency does not match organization currency." : !validLifecycle ? "Membership lifecycle does not match the requested sale or renewal source type." : !validDiscount ? "Membership discount approval or currency is not configured." : !validAmount ? "Membership sale net amount is not a safe non-negative integer." : undefined, details: { previousMembershipId: membership.previousMembershipId, salePriceMinor: membership.salePrice.amount, discountMinor: membership.discount.amount, netAmountMinor: netAmount, discountApprovalStatus: membership.discountApprovalStatus } };
    }
    if (sourceType === "membership_revenue_recognition") {
      const prefix = "membership-revenue:";
      if (!sourceId.startsWith(prefix)) throw ApiError.of(ERR.VALIDATION, "Membership recognition source id is invalid.");
      const remainder = sourceId.slice(prefix.length);
      const separator = remainder.lastIndexOf(":");
      const membershipId = separator > 0 ? remainder.slice(0, separator) : "";
      const serviceMonth = separator > 0 ? remainder.slice(separator + 1) : "";
      if (!membershipId || !serviceMonth) throw ApiError.of(ERR.VALIDATION, "Membership recognition source id is invalid.");
      const membership = this.db.memberships.find((candidate) => candidate.id === membershipId);
      if (!membership) throw ApiError.of(ERR.NOT_FOUND, "Membership recognition source not found.");
      const sourceCurrency = membership.salePrice.currency;
      const netAmount = membership.salePrice.amount - membership.discount.amount;
      const originalType: T.AccountingSourceType = membership.previousMembershipId ? "membership_renewal" : "membership_sale";
      const original = this.accountingSources.find((row) => row.sourceType === originalType && row.sourceId === membership.id);
      const dependencyValid = original?.status === "posted" && original.branchId === membership.homeBranchId && original.currency === this.db.organization.currency && original.amount !== undefined && Number.isSafeInteger(original.amount.amount) && original.amount.amount > 0;
      const recognitionBase = dependencyValid ? Math.min(netAmount, original.amount!.amount) : netAmount;
      const cancellationDate = membership.cancelledAt ? managementLocalDate(membership.cancelledAt, this.db.organization.timezone) : undefined;
      const planChangeCutoff = cancellationDate && membership.cancellationReason?.startsWith("Superseded by plan change") ? new Date(Date.parse(`${cancellationDate}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10) : cancellationDate;
      const allocations = mockMembershipAllocations(recognitionBase, validAccountingDate(membership.startDate), validAccountingDate(membership.endDate), { cancellationDate: planChangeCutoff, freezes: membership.activeFreeze ? [membership.activeFreeze] : [] });
      const selected = allocations.find((allocation) => allocation.month === serviceMonth);
      const occurredAt = selected ? tenantDateIso(accountingMonthEnd(selected.month), this.db.organization.timezone) : membership.createdAt;
      const currencyMismatch = sourceCurrency !== this.db.organization.currency || membership.discount.currency !== this.db.organization.currency;
      const futureMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(serviceMonth) && serviceMonth > managementLocalDate(Date.now(), this.db.organization.timezone).slice(0, 7);
      const valid = dependencyValid && !futureMonth && selected !== undefined && selected.amount > 0 && Number.isSafeInteger(netAmount) && netAmount >= 0 && membership.discount.amount >= 0 && membership.discount.amount <= membership.salePrice.amount && membership.discountApprovalStatus !== "pending" && membership.discountApprovalStatus !== "rejected";
      return { amount: selected?.amount, currency: sourceCurrency, branchId: original?.branchId ?? membership.homeBranchId, occurredAt, debitCode: "2200", creditCode: "4100", policyCode: "membership-revenue-recognition.v1", status: currencyMismatch ? "excluded" : valid ? undefined : "unconfigured", reason: currencyMismatch ? "Membership currency does not match organization currency." : !dependencyValid ? "The original membership sale or renewal must be posted in the same branch and currency before revenue can be recognized." : futureMonth ? "Future membership service months cannot be recognized." : !validAccountingDate(membership.startDate) || !validAccountingDate(membership.endDate) || membership.startDate > membership.endDate ? "Membership service start and end dates must be valid calendar dates." : !Number.isSafeInteger(netAmount) || netAmount < 0 || membership.discount.amount > membership.salePrice.amount ? "Membership net amount is not a safe non-negative integer minor-unit amount." : !selected ? `No positive earned amount exists for ${serviceMonth}.` : selected.amount <= 0 ? "This service month has no positive amount to recognize." : membership.discountApprovalStatus === "pending" || membership.discountApprovalStatus === "rejected" ? "Membership discount approval is not complete." : "Membership recognition source is not configured.", details: { membershipId, serviceMonth, serviceStart: selected?.serviceStart, serviceEnd: selected?.serviceEnd, serviceDays: selected?.days, netAmountMinor: netAmount, postedDeferredAmountMinor: original?.amount?.amount, recognitionBaseMinor: recognitionBase, cancellationDate: planChangeCutoff, allocatedAmountMinor: selected?.amount, allocationPolicy: "daily-weighted-largest-remainder.v1" } };
    }
    if (sourceType === "equipment_depreciation") {
      const prefix = "equipment-depreciation:";
      if (!sourceId.startsWith(prefix)) throw ApiError.of(ERR.VALIDATION, "Equipment depreciation source id is invalid.");
      const remainder = sourceId.slice(prefix.length);
      const separator = remainder.lastIndexOf(":");
      const assetId = separator > 0 ? remainder.slice(0, separator) : "";
      const serviceMonth = separator > 0 ? remainder.slice(separator + 1) : "";
      if (!assetId || !serviceMonth) throw ApiError.of(ERR.VALIDATION, "Equipment depreciation source id is invalid.");
      const asset = this.db.equipmentAssets.find((candidate) => candidate.id === assetId);
      if (!asset) throw ApiError.of(ERR.NOT_FOUND, "Equipment depreciation source not found.");
      const acquisition = this.accountingSources.find((row) => row.sourceType === "equipment_acquisition" && row.sourceId === asset.id);
      const serviceDate = validAccountingDate(asset.installationDate) ?? validAccountingDate(asset.purchaseDate);
      const serviceMonthStart = serviceDate?.slice(0, 7);
      const monthIndex = serviceMonthStart && /^\d{4}-\d{2}$/.test(serviceMonth) ? (Number(serviceMonth.slice(0, 4)) - Number(serviceMonthStart.slice(0, 4))) * 12 + Number(serviceMonth.slice(5, 7)) - Number(serviceMonthStart.slice(5, 7)) : -1;
      const cost = asset.purchaseCost?.amount;
      const usefulLife = asset.expectedUsefulLifeMonths;
      const dependencyValid = acquisition?.status === "posted" && acquisition.branchId === asset.branchId && acquisition.currency === this.db.organization.currency && acquisition.amount !== undefined && Number.isSafeInteger(acquisition.amount.amount) && acquisition.amount.amount > 0;
      const depreciationBase = dependencyValid && cost !== undefined ? Math.min(cost, acquisition.amount!.amount) : cost;
      const amount = mockMonthlyDepreciationAmount(depreciationBase, usefulLife, monthIndex);
      const sourceCurrency = asset.purchaseCost?.currency ?? this.db.organization.currency;
      const currencyMismatch = sourceCurrency !== this.db.organization.currency;
      const futureMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(serviceMonth) && serviceMonth > managementLocalDate(Date.now(), this.db.organization.timezone).slice(0, 7);
      const retiredWithoutEffectiveDate = asset.status === "retired" || asset.status === "replaced";
      const valid = dependencyValid && !futureMonth && !retiredWithoutEffectiveDate && serviceDate !== undefined && cost !== undefined && Number.isSafeInteger(cost) && cost > 0 && usefulLife !== undefined && Number.isSafeInteger(usefulLife) && usefulLife > 0 && usefulLife <= MOCK_MAX_EQUIPMENT_USEFUL_LIFE_MONTHS && amount !== undefined && amount > 0;
      const occurredAt = /^\d{4}-\d{2}$/.test(serviceMonth) ? tenantDateIso(accountingMonthEnd(serviceMonth), this.db.organization.timezone) : asset.createdAt;
      return { amount, currency: sourceCurrency, branchId: asset.branchId, occurredAt, debitCode: "5600", creditCode: "1550", policyCode: "equipment-depreciation.v1", status: currencyMismatch ? "excluded" : valid ? undefined : "unconfigured", reason: currencyMismatch ? "Equipment cost currency does not match organization currency." : !dependencyValid ? "The equipment acquisition must be posted in the same branch and currency before depreciation can be recorded." : retiredWithoutEffectiveDate ? "Retired or replaced equipment needs an audited effective retirement date before its depreciation schedule can continue." : futureMonth ? "Future equipment service months cannot be depreciated." : serviceDate === undefined ? "Equipment needs a valid placed-in-service date or purchase date before depreciation can be configured." : cost === undefined || !Number.isSafeInteger(cost) || cost <= 0 ? "Equipment purchase cost must be a positive integer minor-unit amount before depreciation can be configured." : usefulLife === undefined || !Number.isSafeInteger(usefulLife) || usefulLife <= 0 || usefulLife > MOCK_MAX_EQUIPMENT_USEFUL_LIFE_MONTHS ? `Equipment expected useful life must be between 1 and ${MOCK_MAX_EQUIPMENT_USEFUL_LIFE_MONTHS} months.` : serviceMonth === "unconfigured" ? "Equipment depreciation service month is not configured." : monthIndex < 0 || monthIndex >= usefulLife ? "Equipment depreciation service month falls outside the useful-life schedule." : amount === undefined || amount <= 0 ? "Equipment depreciation amount is not a positive integer minor-unit amount." : "Equipment depreciation source is not configured.", details: { assetId, assetCode: asset.code, serviceMonth, depreciationStartDate: serviceDate, depreciationDateSource: asset.installationDate && validAccountingDate(asset.installationDate) ? "installation" : "purchase", purchaseCostMinor: cost, postedAcquisitionAmountMinor: acquisition?.amount?.amount, depreciationBaseMinor: depreciationBase, usefulLifeMonths: usefulLife, residualValueMinor: 0, monthIndex: monthIndex >= 0 ? monthIndex : undefined, allocatedAmountMinor: amount, allocationPolicy: "straight-line-monthly-remainder.v1" } };
    }
    if (sourceType === "stock_movement") {
      const movement = this.db.stockMovements.find((candidate) => candidate.id === sourceId);
      if (!movement) throw ApiError.of(ERR.NOT_FOUND, "Stock movement source not found.");
      const receive = movement.type === "receive";
      const consumptive = ["sale", "consumption", "waste"].includes(movement.type);
      const internalTransfer = ["transfer_in", "transfer_out"].includes(movement.type);
      const amount = movement.totalCost?.amount ?? (movement.unitCost ? Math.abs(movement.quantity) * movement.unitCost.amount : undefined);
      const purchaseOrderLinked = movement.referenceType?.toLowerCase() === "purchase_order";
      const retailReturn = movement.type === "return" && ["retail_refund", "retail_void"].includes(movement.referenceType?.toLowerCase() ?? "");
      const currencyMismatch = movement.unitCost?.currency !== undefined && movement.unitCost.currency !== this.db.organization.currency;
      return { amount, currency: movement.unitCost?.currency ?? movement.totalCost?.currency ?? this.db.organization.currency, branchId: movement.branchId, occurredAt: movement.occurredAt, debitCode: receive ? "1300" : consumptive ? "5100" : retailReturn ? "1300" : undefined, creditCode: receive ? "2100" : consumptive ? "1300" : retailReturn ? "5100" : undefined, policyCode: receive ? "stock-receive.v1" : consumptive ? "stock-consume.v1" : retailReturn ? "stock-return.v1" : undefined, status: currencyMismatch ? "excluded" : purchaseOrderLinked || internalTransfer ? "excluded" : !receive && !consumptive && !retailReturn || amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? "unconfigured" : undefined, reason: currencyMismatch ? "Stock movement currency does not match organization currency." : purchaseOrderLinked ? "Purchase-order-linked stock movements are excluded to prevent duplicate inventory and AP posting." : internalTransfer ? "Internal branch transfers move stock within the organization and do not create a journal entry." : !receive && !consumptive && !retailReturn ? `No accounting policy exists for stock movement type ${movement.type}.` : movement.unitCost ? undefined : "Stock movement unit cost is not configured.", details: { type: movement.type, referenceType: movement.referenceType } };
    }
    if (sourceType === "purchase_order_receipt") {
      const order = this.db.purchaseOrders.find((candidate) => candidate.id === sourceId);
      if (!order) throw ApiError.of(ERR.NOT_FOUND, "Purchase order source not found.");
      let amount = 0;
      let invalidCost = false;
      let currencyMismatch = order.currency !== this.db.organization.currency;
      for (const line of order.lines) {
        if (line.unitCost.currency !== this.db.organization.currency) currencyMismatch = true;
        const lineTotal = line.receivedQuantity * line.unitCost.amount;
        if (!Number.isSafeInteger(lineTotal) || lineTotal < 0 || !Number.isSafeInteger(amount + lineTotal)) invalidCost = true;
        else amount += lineTotal;
      }
      const fullyReceived = order.status === "received" && order.lines.length > 0 && order.lines.every((line) => line.receivedQuantity >= line.orderedQuantity);
      return { amount: invalidCost ? undefined : amount, currency: order.currency, branchId: order.branchId, occurredAt: order.receivedAt ?? order.updatedAt, debitCode: "1300", creditCode: "2100", policyCode: "purchase-order-receipt.v1", status: currencyMismatch ? "excluded" : invalidCost || order.status === "cancelled" || !fullyReceived || !amount ? "unconfigured" : undefined, reason: currencyMismatch ? "Purchase order currency does not match organization currency." : invalidCost ? "Purchase order receipt cost is not a safe integer minor-unit amount." : order.status === "cancelled" ? "Cancelled purchase orders are excluded." : !fullyReceived ? "Purchase order inventory must be fully received before posting." : !amount ? "No receiving cost is recorded." : undefined };
    }
    if (sourceType === "facility_supplies") {
      const task = this.db.facilityTasks.find((candidate) => candidate.id === sourceId);
      if (!task) throw ApiError.of(ERR.NOT_FOUND, "Facility task source not found.");
      const amount = task.suppliesCost?.amount;
      return { amount, currency: task.suppliesCost?.currency ?? this.db.organization.currency, branchId: task.branchId, occurredAt: task.completedAt ?? task.updatedAt, debitCode: "5300", creditCode: "2100", policyCode: "facility-supplies.v1", status: task.suppliesCost?.currency !== undefined && task.suppliesCost.currency !== this.db.organization.currency ? "excluded" : task.status !== "completed" || amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? "unconfigured" : undefined, reason: task.suppliesCost?.currency !== undefined && task.suppliesCost.currency !== this.db.organization.currency ? "Facility supplies currency does not match organization currency." : task.status !== "completed" ? "Facility supplies post only after completion." : amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? "Facility supplies cost is not a configured safe integer minor-unit amount." : undefined };
    }
    if (sourceType === "equipment_acquisition") {
      const asset = this.db.equipmentAssets.find((candidate) => candidate.id === sourceId);
      if (!asset) throw ApiError.of(ERR.NOT_FOUND, "Equipment asset source not found.");
      const amount = asset.purchaseCost?.amount;
      return { amount, currency: asset.purchaseCost?.currency ?? this.db.organization.currency, branchId: asset.branchId, occurredAt: asset.purchaseDate ? tenantDateIso(asset.purchaseDate, this.db.organization.timezone) : asset.createdAt, debitCode: "1500", creditCode: "2100", policyCode: "equipment-acquisition.v1", status: asset.purchaseCost?.currency !== undefined && asset.purchaseCost.currency !== this.db.organization.currency ? "excluded" : !asset.purchaseDate || amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? "unconfigured" : undefined, reason: asset.purchaseCost?.currency !== undefined && asset.purchaseCost.currency !== this.db.organization.currency ? "Equipment acquisition currency does not match organization currency." : !asset.purchaseDate ? "Equipment purchase date is not configured." : amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? "Equipment purchase cost is not a configured safe integer minor-unit amount." : undefined };
    }
    const workOrder = this.db.equipmentWorkOrders.find((candidate) => candidate.id === sourceId);
    if (!workOrder) throw ApiError.of(ERR.NOT_FOUND, "Equipment work-order source not found.");
    const amount = workOrder.totalCost?.amount ?? (workOrder.partsCost?.amount ?? 0) + (workOrder.laborCost?.amount ?? 0);
    const repairCurrency = workOrder.totalCost?.currency ?? workOrder.partsCost?.currency ?? workOrder.laborCost?.currency ?? this.db.organization.currency;
    return { amount, currency: repairCurrency, branchId: workOrder.branchId, occurredAt: workOrder.completedAt ?? workOrder.updatedAt, debitCode: "5200", creditCode: "2100", policyCode: "equipment-repair.v1", status: repairCurrency !== this.db.organization.currency ? "excluded" : workOrder.status !== "completed" || amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? "unconfigured" : undefined, reason: repairCurrency !== this.db.organization.currency ? "Equipment repair currency does not match organization currency." : workOrder.status !== "completed" ? "Equipment repairs post only after completion." : amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? "Equipment repair cost is not a configured safe integer minor-unit amount." : undefined };
  }

  postAccountingSource(input: T.PostAccountingSourceInput): Promise<T.AccountingSourcePosting> {
    return this.respond(() => {
      this.requireAccountingPosting();
      if (!input.idempotencyKey.trim()) throw ApiError.of(ERR.VALIDATION, "An idempotency key is required.");
      const sourceRows = this.accountingSources.filter((row) => row.sourceType === input.sourceType && row.sourceId === input.sourceId);
      const replay = sourceRows.find((row) => row.status === "posted" || row.status === "reversed") ?? sourceRows[0];
      for (const row of sourceRows) {
        if (!this.accountingBranchIsVisible(row.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Accounting source posting not found.");
      }
      const requestFingerprint = accountingSourceRequestFingerprint({ sourceType: input.sourceType, sourceId: input.sourceId, idempotencyKey: input.idempotencyKey, reason: input.reason });
      const attemptsWithKey = [...this.accountingSourceAttempts.values()].filter((attempt) => attempt.idempotencyKey === input.idempotencyKey);
      for (const attempt of attemptsWithKey) {
        if (!this.accountingBranchIsVisible(attempt.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Accounting source posting not found.");
      }
      if (attemptsWithKey.some((attempt) => attempt.sourceType !== input.sourceType || attempt.sourceId !== input.sourceId)) throw ApiError.of(ERR.CONFLICT, "This accounting idempotency key belongs to another source.");
      const attempt = this.accountingSourceAttempts.get(accountingSourceAttemptKey(input.sourceType, input.sourceId, input.idempotencyKey));
      if (attempt) {
        if (attempt.requestFingerprint !== requestFingerprint) throw ApiError.of(ERR.CONFLICT, "This accounting idempotency key was already used for a different source-posting request.");
        return this.accountingSourceAttemptView(attempt);
      }
      const existingKeyRows = this.accountingSources.filter((row) => row.idempotencyKey === input.idempotencyKey);
      for (const row of existingKeyRows) {
        if (!this.accountingBranchIsVisible(row.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Accounting source posting not found.");
      }
      if (existingKeyRows.some((row) => row.sourceType !== input.sourceType || row.sourceId !== input.sourceId)) throw ApiError.of(ERR.CONFLICT, "This accounting idempotency key belongs to another source.");
      const existingKey = existingKeyRows.find((row) => row.sourceType === input.sourceType && row.sourceId === input.sourceId);
      if (existingKey?.status === "posted" || existingKey?.status === "reversed") return existingKey;
      if (replay?.status === "posted" || replay?.status === "reversed") return replay;
      const historicalSource = sourceRows.find((row) => row.status !== "posted" && row.status !== "reversed");
      const fact = preserveMockSourcePolicy(this.mockAccountingFact(input.sourceType, input.sourceId), historicalSource);
      if (!this.accountingBranchIsVisible(fact.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Accounting source posting not found.");
      if (!fact.branchId && !fact.status) {
        fact.status = "unconfigured";
        fact.reason = "Source fact is missing an active branch.";
      }
      const branch = this.accountingBranch(fact.branchId);
      if (fact.status) {
        const now = nowISO();
        const factCurrency = fact.currency ?? this.db.organization.currency;
        const factMoney = fact.amount === undefined ? undefined : money(fact.amount, factCurrency);
        const policyVersion = accountingPolicyVersion(fact.policyCode);
        const projectionFingerprint = mockSourceProjectionFingerprint({ ...fact, sourceType: input.sourceType, sourceId: input.sourceId }, fact.status);
        const row: T.AccountingSourcePosting = replay ?? { id: mockUuid(), organizationId: this.db.organization.id, sourceType: input.sourceType, sourceId: input.sourceId, branchId: branch?.id, status: fact.status, amount: factMoney, currency: factCurrency, policyCode: fact.policyCode, policyVersion, reason: fact.reason, details: fact.details, projectionFingerprint, occurredAt: fact.occurredAt, createdAt: now, updatedAt: now };
        if (replay) Object.assign(replay, { branchId: branch?.id, status: fact.status, amount: factMoney, currency: factCurrency, policyCode: fact.policyCode, policyVersion, reason: fact.reason, details: fact.details, projectionFingerprint, occurredAt: fact.occurredAt, updatedAt: now }); else this.accountingSources.unshift(row);
        const attempt: MockAccountingSourceAttempt = { id: mockUuid(), sourceType: input.sourceType, sourceId: input.sourceId, sourcePostingId: row.id, branchId: branch?.id, idempotencyKey: input.idempotencyKey, requestFingerprint, status: fact.status as MockAccountingSourceDecisionStatus, amount: factMoney, currency: factCurrency, policyCode: fact.policyCode, policyVersion, reason: fact.reason, details: fact.details, occurredAt: fact.occurredAt, createdAt: now, updatedAt: now };
        this.accountingSourceAttempts.set(accountingSourceAttemptKey(input.sourceType, input.sourceId, input.idempotencyKey), attempt);
        return this.accountingSourceAttemptView(attempt);
      }
      if (!fact.amount || !Number.isSafeInteger(fact.amount) || !fact.debitCode || !fact.creditCode || fact.amount <= 0) throw ApiError.of(ERR.VALIDATION, "Source has no configured positive accounting amount.");
      const postingDate = managementLocalDate(fact.occurredAt, this.db.organization.timezone);
      const period = this.accountingPeriodFor(postingDate);
      const debit = this.accountingAccount(`acct-${fact.debitCode}`);
      const credit = this.accountingAccount(`acct-${fact.creditCode}`);
      const now = nowISO();
      const entryId = mockUuid();
      const policyCode = fact.policyCode ?? `${input.sourceType}.v1`;
      const policyVersion = accountingPolicyVersion(policyCode) ?? 1;
      const entry: T.AccountingJournalEntryDetail = { id: entryId, organizationId: this.db.organization.id, branchId: branch?.id, scope: "branch", currency: this.db.organization.currency, postingDate, periodId: period.id, status: "posted", memo: `${input.sourceType} ${input.sourceId}`, sourceType: input.sourceType, sourceId: input.sourceId, policyCode, policyVersion, idempotencyKey: `source:${input.sourceType}:${input.sourceId}:v${policyVersion}:${input.idempotencyKey}`, totalDebit: money(fact.amount, this.db.organization.currency), totalCredit: money(fact.amount, this.db.organization.currency), lineCount: 2, createdAt: now, postedAt: now, createdById: this.actor().id, lines: [{ id: mockUuid(), journalEntryId: entryId, branchId: branch?.id, accountId: debit.id, accountCode: debit.code, accountName: debit.name, debit: money(fact.amount, this.db.organization.currency), credit: money(0, this.db.organization.currency), description: `${input.sourceType} ${input.sourceId}`, statementGroup: debit.statementGroup, cashflowGroup: debit.cashflowGroup }, { id: mockUuid(), journalEntryId: entryId, branchId: branch?.id, accountId: credit.id, accountCode: credit.code, accountName: credit.name, debit: money(0, this.db.organization.currency), credit: money(fact.amount, this.db.organization.currency), description: `${input.sourceType} ${input.sourceId}`, statementGroup: credit.statementGroup, cashflowGroup: credit.cashflowGroup }] };
      this.accountingEntries.unshift(entry);
      const projectionFingerprint = mockSourceProjectionFingerprint({ ...fact, sourceType: input.sourceType, sourceId: input.sourceId }, "pending");
      const row: T.AccountingSourcePosting = replay ?? { id: mockUuid(), organizationId: this.db.organization.id, sourceType: input.sourceType, sourceId: input.sourceId, branchId: branch?.id, status: "posted", amount: money(fact.amount, this.db.organization.currency), currency: this.db.organization.currency, policyCode: entry.policyCode, policyVersion, journalEntryId: entry.id, idempotencyKey: input.idempotencyKey, reason: input.reason, details: fact.details, projectionFingerprint, occurredAt: fact.occurredAt, createdAt: now, updatedAt: now };
      if (replay) Object.assign(replay, { branchId: branch?.id, status: "posted", amount: money(fact.amount, this.db.organization.currency), currency: this.db.organization.currency, journalEntryId: entry.id, policyCode: entry.policyCode, policyVersion, idempotencyKey: input.idempotencyKey, reason: input.reason, details: fact.details, projectionFingerprint, occurredAt: fact.occurredAt, updatedAt: now }); else this.accountingSources.unshift(row);
      this.audit({ category: "accounting", action: "accounting.source.post", entityType: "accounting_source_posting", entityId: row.id, entityLabel: row.id, summary: `Posted ${input.sourceType} source`, reason: input.reason, branchId: branch?.id });
      return row;
    });
  }

  reverseAccountingEntry(entryId: T.UUID, input: { reason: string; idempotencyKey: string }): Promise<T.AccountingJournalEntryDetail> {
    return this.respond(() => {
      this.requireAccountingOwner();
      this.requireReason(input.reason);
      const replay = this.accountingEntries.find((entry) => entry.idempotencyKey === `reverse:${entryId}:${input.idempotencyKey}`);
      const fingerprint = reversalRequestFingerprint({ entryId, reason: input.reason.trim() });
      if (replay) {
        const replayFingerprint = this.accountingEntryFingerprints.get(replay.id) ?? reversalRequestFingerprint({ entryId: replay.reversalOfEntryId ?? entryId, reason: replay.reason ?? "" });
        if (replayFingerprint !== fingerprint) throw ApiError.of(ERR.CONFLICT, "This reversal idempotency key was already used for a different request.");
        return replay;
      }
      const original = this.accountingEntry(entryId);
      if (original.status !== "posted") throw ApiError.of(ERR.CONFLICT, "Only a posted journal entry can be reversed once.");
      const period = this.accountingPeriodFor(this.today());
      const now = nowISO();
      const reversalId = mockUuid();
      const reversal: T.AccountingJournalEntryDetail = { ...original, id: reversalId, periodId: period.id, postingDate: this.today(), status: "posted", memo: `Reversal of ${original.id}`, reason: input.reason, idempotencyKey: `reverse:${entryId}:${input.idempotencyKey}`, reversalOfEntryId: original.id, reversedByEntryId: undefined, createdAt: now, postedAt: now, createdById: this.actor().id, lines: original.lines.map((line) => ({ ...line, id: mockUuid(), journalEntryId: reversalId, debit: line.credit, credit: line.debit, description: `Reversal of ${original.id}` })) };
      this.accountingEntries.unshift(reversal);
      this.accountingEntryFingerprints.set(reversal.id, fingerprint);
      original.status = "reversed";
      original.reversedByEntryId = reversal.id;
      const source = this.accountingSources.find((row) => row.journalEntryId === original.id);
      if (source) source.status = "reversed";
      this.audit({ category: "accounting", action: "accounting.entry.reverse", entityType: "accounting_journal_entry", entityId: original.id, entityLabel: original.memo, summary: `Reversed journal entry ${original.id}`, reason: input.reason, branchId: original.branchId });
      return reversal;
    });
  }

  closeAccountingPeriod(periodId: T.UUID, reason: string): Promise<T.AccountingPeriod> {
    return this.respond(() => {
      this.requireAccountingOwner();
      this.requireReason(reason);
      const period = this.accountingPeriods.find((candidate) => candidate.id === periodId);
      if (!period) throw ApiError.of(ERR.NOT_FOUND, "Accounting period not found.");
      if (period.status !== "open") throw ApiError.of(ERR.CONFLICT, "Accounting period is already closed.");
      const pending = this.accountingSources.some((source) => source.status === "pending" && managementLocalDate(source.occurredAt, this.db.organization.timezone).slice(0, 7) === period.id);
      if (pending) throw ApiError.of(ERR.CONFLICT, "Resolve pending source postings before closing the period.");
      period.status = "closed";
      period.closedAt = nowISO();
      period.closedById = this.actor().id;
      period.closeReason = reason;
      period.updatedAt = nowISO();
      this.audit({ category: "accounting", action: "accounting.period.close", entityType: "accounting_period", entityId: period.id, entityLabel: period.id, summary: `Closed accounting period ${period.id}`, reason });
      return { ...period };
    });
  }

  reopenAccountingPeriod(periodId: T.UUID, reason: string): Promise<T.AccountingPeriod> {
    return this.respond(() => {
      this.requireAccountingOwner();
      this.requireReason(reason);
      const period = this.accountingPeriods.find((candidate) => candidate.id === periodId);
      if (!period) throw ApiError.of(ERR.NOT_FOUND, "Accounting period not found.");
      if (period.status !== "closed") throw ApiError.of(ERR.CONFLICT, "Only a closed accounting period can be reopened.");
      if (this.accountingPeriods.some((candidate) => candidate.status === "closed" && candidate.periodStart > period.periodStart)) throw ApiError.of(ERR.CONFLICT, "Reopen later accounting periods first.");
      period.status = "open";
      period.reopenedAt = nowISO();
      period.reopenedById = this.actor().id;
      period.reopenReason = reason;
      period.updatedAt = nowISO();
      this.audit({ category: "accounting", action: "accounting.period.reopen", entityType: "accounting_period", entityId: period.id, entityLabel: period.id, summary: `Reopened accounting period ${period.id}`, reason });
      return { ...period };
    });
  }

  // -------------------------------------------------------------------------
  // automations
  // -------------------------------------------------------------------------

  listAutomationRules(): Promise<T.AutomationRule[]> {
    return this.respond(() => {
      return this.maybeEmpty([...this.db.rules]);
    });
  }

  getAutomationRule(id: T.UUID): Promise<T.AutomationRule> {
    return this.respond(() => {
      const rule = this.db.rules.find((r) => r.id === id);
      if (!rule) throw ApiError.of(ERR.NOT_FOUND, "Rule not found.");
      return rule;
    });
  }

  createAutomationRule(input: T.CreateAutomationRuleInput): Promise<T.AutomationRule> {
    return this.respond(() => {
      this.require("automations.manage");
      const rule: T.AutomationRule = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        executionsLast30Days: 0,
        updatedAt: nowISO(),
        ...input,
      };
      this.db.rules.push(rule);
      this.audit({
        category: "automations",
        action: "automation.rule_created",
        entityType: "automation_rule",
        entityId: rule.id,
        entityLabel: rule.name,
        summary: "Automation rule created",
      });
      return rule;
    });
  }

  updateAutomationRule(id: T.UUID, input: T.UpdateAutomationRuleInput): Promise<T.AutomationRule> {
    return this.respond(() => {
      this.require("automations.manage");
      const rule = this.db.rules.find((r) => r.id === id);
      if (!rule) throw ApiError.of(ERR.NOT_FOUND, "Rule not found.");
      const wasEnabled = rule.enabled;
      Object.assign(rule, input, { updatedAt: nowISO() });
      if (input.enabled !== undefined && input.enabled !== wasEnabled) {
        this.audit({
          category: "automations",
          action: input.enabled ? "automation.rule_enabled" : "automation.rule_disabled",
          entityType: "automation_rule",
          entityId: rule.id,
          entityLabel: rule.name,
          summary: input.enabled ? "Rule enabled" : "Rule disabled",
          before: { enabled: wasEnabled ? "yes" : "no" },
          after: { enabled: input.enabled ? "yes" : "no" },
        });
      } else {
        this.audit({
          category: "automations",
          action: "automation.rule_updated",
          entityType: "automation_rule",
          entityId: rule.id,
          entityLabel: rule.name,
          summary: "Rule configuration updated",
          before: { enabled: wasEnabled ? "yes" : "no", name: rule.name },
          after: { enabled: rule.enabled ? "yes" : "no", name: rule.name },
        });
      }
      return rule;
    });
  }

  listAutomationExecutions(query: ExecutionQuery): Promise<T.Page<T.AutomationExecution>> {
    return this.respond(() => {
      let items = [...this.db.executions];
      if (query.ruleId) items = items.filter((e) => e.ruleId === query.ruleId);
      return paginate(this.maybeEmpty(items), query);
    });
  }

  subscribeAutomationExecutions(query: ExecutionQuery, onValue: (page: T.Page<T.AutomationExecution>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listAutomationExecutions(query), onValue, onError);
  }

  getAutomationExecution(id: T.UUID): Promise<T.AutomationExecutionDetail> {
    return this.respond(() => {
      this.require("automations.manage");
      const execution = this.db.executions.find((item) => item.id === id);
      if (!execution) throw ApiError.of(ERR.NOT_FOUND, "Automation execution not found.");
      const action = execution.action ?? "notify_manager";
      const normalizedStatus = execution.status === "success" ? "completed" : execution.status === "skipped_duplicate" ? "suppressed" : execution.status;
      return {
        ...execution,
        status: normalizedStatus,
        actionResults: execution.actionResults ?? [{ key: action, status: normalizedStatus === "failed" ? "failed" : normalizedStatus === "suppressed" ? "suppressed" : "completed" }],
        attemptHistory: execution.attemptHistory ?? [{ action, attempt: 1, status: normalizedStatus === "failed" ? "failed" : normalizedStatus === "suppressed" ? "suppressed" : "completed", occurredAt: execution.executedAt, reason: execution.detail }],
        retryPolicy: execution.retryPolicy ?? { maxAttempts: 3, backoffMinutes: [1, 5, 30] },
      };
    });
  }

  previewAutomationRun(ruleId: T.UUID): Promise<T.AutomationRunPreview> {
    return this.respond(() => {
      this.require("automations.manage");
      const rule = this.db.rules.find((item) => item.id === ruleId);
      if (!rule) throw ApiError.of(ERR.NOT_FOUND, "Automation rule not found.");
      const source = rule.trigger.startsWith("lead") || rule.trigger === "follow_up_overdue" ? this.db.leads : this.db.members;
      const candidates = source.slice(0, 10).map((item) => ({
        subjectType: (rule.trigger.startsWith("lead") || rule.trigger === "follow_up_overdue" ? "lead" : "member") as T.AutomationExecution["subjectType"],
        subjectId: item.id,
        subjectName: item.fullName,
        branchId: "branchId" in item ? item.branchId : item.homeBranchId,
        duplicate: false,
      }));
      return { ruleId, ruleName: rule.name, eligibleCount: candidates.length, duplicateCount: 0, candidates };
    });
  }

  runAutomationRuleNow(ruleId: T.UUID, reason: string): Promise<{ created: number; skippedDuplicates: number }> {
    return this.respond(async () => {
      this.require("automations.manage");
      if (!reason.trim()) throw ApiError.of(ERR.VALIDATION, "A reason is required.");
      const preview = await this.previewAutomationRun(ruleId);
      const rule = this.db.rules.find((item) => item.id === ruleId)!;
      for (const candidate of preview.candidates.filter((item) => !item.duplicate)) {
        const action = rule.actions[0]?.key ?? "notify_manager";
        this.db.executions.unshift({
          id: crypto.randomUUID(),
          ruleId,
          ruleName: rule.name,
          subjectType: candidate.subjectType,
          subjectId: candidate.subjectId,
          subjectName: candidate.subjectName,
          action,
          status: "completed",
          detail: "Executed in explicit mock mode.",
          actionResults: rule.actions.map((item) => ({ key: item.key, status: "completed" as const })),
          attemptHistory: rule.actions.map((item) => ({ action: item.key, attempt: 1, status: "completed" as const, occurredAt: new Date().toISOString() })),
          retryPolicy: { maxAttempts: 3, backoffMinutes: [1, 5, 30] },
          executedAt: new Date().toISOString(),
        });
      }
      this.audit({ category: "automations", action: "automation.rule_run_now", entityType: "automation_rule", entityId: ruleId, entityLabel: rule.name, summary: "Automation rule run manually", reason });
      return { created: preview.eligibleCount, skippedDuplicates: preview.duplicateCount };
    });
  }

  retryAutomationExecution(executionId: T.UUID, reason: string): Promise<T.AutomationExecutionDetail> {
    return this.respond(async () => {
      this.require("automations.manage");
      if (!reason.trim()) throw ApiError.of(ERR.VALIDATION, "A reason is required.");
      const execution = this.db.executions.find((item) => item.id === executionId);
      if (!execution) throw ApiError.of(ERR.NOT_FOUND, "Automation execution not found.");
      if (execution.status !== "failed") throw ApiError.of(ERR.VALIDATION, "Only failed executions can be retried.");
      execution.status = "completed";
      execution.detail = "Retry completed in explicit mock mode.";
      this.audit({ category: "automations", action: "automation.execution_retry", entityType: "automation_execution", entityId: executionId, entityLabel: execution.ruleName, summary: "Automation execution retried", reason });
      return await this.getAutomationExecution(executionId);
    });
  }

  listMessageTemplates(): Promise<T.MessageTemplate[]> {
    return this.respond(() => [...this.db.templates]);
  }

  listOperationalEmailDeliveries(query: T.ListQuery = {}): Promise<T.Page<T.OperationalEmailDelivery>> {
    return this.respond(() => paginate([], query));
  }

  subscribeOperationalEmailDeliveries(query: T.ListQuery, onValue: (page: T.Page<T.OperationalEmailDelivery>) => void, onError?: (error: unknown) => void): Promise<() => void> {
    return this.subscribeOnce(() => this.listOperationalEmailDeliveries(query), onValue, onError);
  }

  // -------------------------------------------------------------------------
  // audit
  // -------------------------------------------------------------------------

  listAuditEvents(query: AuditQuery): Promise<T.Page<T.AuditEvent>> {
    return this.respond(() => {
      this.require("audit.read");
      const branchId = this.branchScopedBranchId(query.branchId);
      let items = [...this.db.audits];
      if (branchId) items = items.filter((a) => (!a.branchId && !a.destinationBranchId) || a.branchId === branchId || a.destinationBranchId === branchId);
      if (query.category) items = items.filter((a) => a.category === query.category);
      if (query.actorId) items = items.filter((a) => a.actorId === query.actorId);
      if (query.entityId) items = items.filter((a) => a.entityId === query.entityId);
      const auditFrom = query.from;
      const auditTo = query.to;
      if (auditFrom) items = items.filter((a) => a.occurredAt >= auditFrom);
      if (auditTo) items = items.filter((a) => a.occurredAt <= `${auditTo}T23:59:59.999Z`);
      items = items.filter((a) => this.matchesSearch([a.summary, a.entityLabel, a.actorName, a.action], query.search));
      return paginate(this.maybeEmpty(items), query);
    });
  }

  listPendingApprovals(): Promise<T.AuditEvent[]> {
    return this.respond(() => {
      this.require("audit.read");
      return this.db.audits.filter((a) => {
        if (a.approvalStatus !== "pending") return false;
        if (!a.branchId && !a.destinationBranchId) return true;
        return Boolean(
          (a.branchId && this.branchIsVisible(a.branchId))
          || (a.destinationBranchId && this.branchIsVisible(a.destinationBranchId)),
        );
      });
    });
  }

  reviewApproval(auditEventId: T.UUID, input: { decision: "approved" | "rejected"; note?: string }): Promise<void> {
    return this.respond(() => {
      const event = this.db.audits.find((a) => a.id === auditEventId);
      if (!event) throw ApiError.of(ERR.NOT_FOUND, "Approval not found.");
      if (!this.branchIsVisible(event.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Approval not found.");
      if (input.decision !== "approved" && input.decision !== "rejected") {
        throw ApiError.of(ERR.VALIDATION, "Approval decision must be approved or rejected.");
      }
      if (event.approvalStatus !== "pending") throw ApiError.of(ERR.VALIDATION, "This approval is not pending.");
      if (event.action === "membership.discount") this.require("payments.discount");
      else if (event.action === "payment.refund") this.require("payments.refund");
      else if (event.action === "shift.close_variance") this.require("reconciliation.approve_variance");
      else throw ApiError.of(ERR.VALIDATION, "This audit event does not support approval review.");
      this.requireReason(input.note, "note");
      const before = { ...event.before, approvalStatus: "pending" as const };
      const after = { ...event.after, approvalStatus: input.decision };
      event.approvalStatus = input.decision;
      if (event.action === "membership.discount") {
        const membership = this.db.memberships.find((m) => m.id === event.entityId);
        if (membership) membership.discountApprovalStatus = input.decision;
      }
      if (event.action === "shift.close_variance") {
        const shift = this.db.shifts.find((s) => s.id === event.entityId);
        if (shift) shift.varianceApprovalStatus = input.decision;
      }
      this.audit({
        category: event.category,
        action: `${event.action}.${input.decision}`,
        entityType: event.entityType,
        entityId: event.entityId,
        entityLabel: event.entityLabel,
        summary: `${input.decision === "approved" ? "Approved" : "Rejected"}: ${event.summary}`,
        reason: input.note,
        before,
        after,
        branchId: event.branchId,
      });
    });
  }

  // -------------------------------------------------------------------------
  // settings & users
  // -------------------------------------------------------------------------

  getOrganizationSettings(): Promise<T.OrganizationSettings> {
    return this.respond(() => ({
      organization: { ...this.db.organization, brand: this.db.brand },
      brand: this.db.brand,
      branches: this.db.branches,
      paymentMethods: this.db.paymentMethods,
      roles: this.db.roles,
      notifications: this.db.notificationSettings,
      operationalPolicies: this.db.operationalPolicies,
      workspace: this.workspaceAccess(),
    }));
  }

  getBrandKit(): Promise<T.BrandKit> {
    return this.respond(() => {
      this.require("settings.manage");
      return { ...this.db.brand, tokens: { ...this.db.brand.tokens } };
    });
  }

  async updateBrandKit(input: T.UpdateBrandKitInput): Promise<T.BrandKit> {
    const result = await this.respond(() => {
      this.requireOwner();
      if (!isBrandPaletteKey(input.paletteKey)) throw ApiError.of(ERR.VALIDATION, "Choose a supported Brand Kit palette.");
      const primaryColor = input.primaryColor === undefined || input.primaryColor === "" ? BRAND_PALETTE_PRESETS[input.paletteKey] : normalizeBrandHex(input.primaryColor);
      if (!primaryColor) throw ApiError.of(ERR.VALIDATION, "Primary color must be a six-digit hex color.");
      const requestedLogoId = input.logoAssetId ?? undefined;
      const logo = requestedLogoId ? this.mediaAssets.get(requestedLogoId) : undefined;
      if (requestedLogoId && (!logo || logo.ownerType !== "gym_logo" || logo.ownerId !== this.db.organization.id || logo.visibility !== "public" || !["pending", "active"].includes(logo.status))) throw ApiError.of(ERR.NOT_FOUND, "Brand logo was not found in this organization.");
      const previousLogoId = this.db.brand.logoAssetId;
      const now = nowISO();
      if (logo?.status === "pending") this.mediaAssets.set(logo.id, { ...logo, status: "active", deleteAfter: undefined, updatedAt: now });
      if (previousLogoId && previousLogoId !== requestedLogoId) {
        const previous = this.mediaAssets.get(previousLogoId);
        if (previous?.status === "active") this.mediaAssets.set(previousLogoId, { ...previous, status: "scheduled_for_deletion", deleteAfter: new Date(Date.parse(now) + 30 * 86_400_000).toISOString(), updatedAt: now });
      }
      const before = this.db.brand;
      const next: T.BrandKit = { organizationId: this.db.organization.id, paletteKey: input.paletteKey, primaryColor, tokens: deriveBrandTokens(primaryColor), logoAssetId: requestedLogoId, logoUrl: logo?.url, logoAltText: logo?.altText, version: before.version + 1, updatedAt: now, updatedById: this.actor().id };
      this.db.brand = next;
      this.db.organization.brand = next;
      this.audit({ category: "settings", action: "settings.brand.update", entityType: "organization_brand", entityId: this.db.organization.id, entityLabel: this.db.organization.name, summary: "Tenant Brand Kit updated", before: { paletteKey: before.paletteKey, primaryColor: before.primaryColor, logoAssetId: before.logoAssetId ?? null, version: before.version }, after: { paletteKey: next.paletteKey, primaryColor: next.primaryColor, logoAssetId: next.logoAssetId ?? null, version: next.version } });
      return { ...next, tokens: { ...next.tokens } };
    });
    await Promise.all([this.emitPlatformSnapshotSubscribers(), this.emitPlatformGymDetailSubscribers()]);
    return result;
  }

  getWorkspaceAccess(): Promise<T.WorkspaceAccess> {
    return this.respond(() => {
      if (this.db.organization.archivedAt) throw ApiError.of(ERR.FORBIDDEN, "This organization is archived.");
      return this.workspaceAccess();
    });
  }

  getOrganizationEntitlements(): Promise<T.OrganizationEntitlements> {
    return this.respond(() => this.workspaceEntitlements());
  }

  getWorkspaceModulePreferences(): Promise<T.WorkspaceModulePreferences> {
    return this.respond(() => this.workspacePreferences(this.workspaceEntitlements().entitledModules));
  }

  getWorkspaceModuleStatus(moduleKey: T.WorkspaceModuleKey): Promise<T.WorkspaceModuleStatus> {
    return this.respond(() => {
      const status = this.workspaceAccess().modules.find((module) => module.key === moduleKey);
      if (!status) throw ApiError.of(ERR.VALIDATION, `Unknown workspace module: ${moduleKey}`);
      if (!status.entitled || !status.enabled) throw ApiError.of(ERR.FEATURE_NOT_AVAILABLE, `The ${moduleKey} workspace module is not enabled for this organization.`);
      return status;
    });
  }

  async updateWorkspaceModulePreferences(input: T.UpdateWorkspaceModulePreferencesInput): Promise<T.WorkspaceAccess> {
    const result = await this.respond(() => {
      this.requireOwner();
      const entitled = this.workspaceAccess().entitlements.entitledModules;
      let enabledModules: T.WorkspaceModuleKey[];
      try {
        enabledModules = validateWorkspaceModuleSelection(Array.isArray(input.enabledModules) ? input.enabledModules : [], entitled);
      } catch (error) {
        throw ApiError.of(ERR.VALIDATION, error instanceof Error ? error.message : "Workspace module preferences are invalid.");
      }
      const before = [...this.workspaceAccess().preferences.enabledModules];
      this.db.workspaceModulePreferences = {
        ...this.db.workspaceModulePreferences,
        catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
        enabledModules,
        updatedAt: nowISO(),
        updatedById: this.actor().id,
      };
      if (JSON.stringify(before) !== JSON.stringify(enabledModules)) {
        this.audit({
          category: "settings",
          action: "workspace.module_preferences.update",
          entityType: "workspace_module_preferences",
          entityId: this.db.organization.id,
          entityLabel: this.db.organization.name,
          summary: "Workspace module preferences updated",
          before: { enabledModules: before.join(",") },
          after: { enabledModules: enabledModules.join(",") },
        });
      }
      return this.workspaceAccess();
    });
    await this.emitWorkspaceAccessSubscribers();
    return result;
  }

  private workspaceEntitlements(): T.OrganizationEntitlements {
    const plan = this.db.organization.subscriptionPlan;
    const stored = this.db.organizationEntitlements;
    return {
      ...stored,
      organizationId: this.db.organization.id,
      catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
      subscriptionPlan: plan,
      entitledModules: plan ? entitledModulesForPlanSelection(plan, stored.subscriptionPlan === plan ? stored.entitledModules : this.platformPlans.find((candidate) => candidate.name === plan)?.entitledModules) : stored.entitledModules,
      source: plan ? "subscription_plan" : "legacy_default",
    };
  }

  private workspacePreferences(entitledModules: readonly T.WorkspaceModuleKey[]): T.WorkspaceModulePreferences {
    const stored = this.db.workspaceModulePreferences;
    const filtered = stored.enabledModules.filter((module): module is T.WorkspaceModuleKey => entitledModules.includes(module as T.WorkspaceModuleKey));
    let enabledModules: T.WorkspaceModuleKey[];
    try {
      enabledModules = validateWorkspaceModuleSelection(filtered, entitledModules);
    } catch {
      enabledModules = defaultWorkspacePreferences(entitledModules);
    }
    return {
      ...stored,
      organizationId: this.db.organization.id,
      catalogVersion: WORKSPACE_MODULE_CATALOG_VERSION,
      enabledModules,
    };
  }

  private workspaceAccess(): T.WorkspaceAccess {
    const entitlements = this.workspaceEntitlements();
    const preferences = this.workspacePreferences(entitlements.entitledModules);
    return buildWorkspaceAccess(entitlements, preferences);
  }

  updateOrganizationSettings(input: T.UpdateOrganizationSettingsInput): Promise<T.OrganizationSettings> {
    return this.respond(() => {
      this.require("settings.manage");
      const before = { name: this.db.organization.name, receiptFooter: this.db.organization.receiptFooter, taxRatePercent: this.db.organization.taxRatePercent };
      Object.assign(this.db.organization, input);
      this.audit({
        category: "settings",
        action: "settings.organization_update",
        entityType: "organization",
        entityId: this.db.organization.id,
        entityLabel: this.db.organization.name,
        summary: "Organization settings updated",
        before,
        after: { name: this.db.organization.name, receiptFooter: this.db.organization.receiptFooter, taxRatePercent: this.db.organization.taxRatePercent },
      });
      return this.getOrganizationSettingsSync();
    });
  }

  private getOrganizationSettingsSync(): T.OrganizationSettings {
    return {
      organization: { ...this.db.organization, brand: this.db.brand },
      brand: this.db.brand,
      branches: this.db.branches,
      paymentMethods: this.db.paymentMethods,
      roles: this.db.roles,
      notifications: this.db.notificationSettings,
      operationalPolicies: this.db.operationalPolicies,
      workspace: this.workspaceAccess(),
    };
  }

  updatePaymentMethods(input: T.PaymentMethod[]): Promise<T.OrganizationSettings> {
    return this.respond(() => {
      this.require("settings.manage");
      this.db.paymentMethods = input;
      this.audit({
        category: "settings",
        action: "settings.payment_methods",
        entityType: "organization",
        entityId: this.db.organization.id,
        entityLabel: this.db.organization.name,
        summary: `Payment methods updated — ${input.filter((m) => m.enabled).map((m) => m.label).join(", ")}`,
      });
      return this.getOrganizationSettingsSync();
    });
  }

  updateNotificationSettings(input: T.NotificationSettings): Promise<T.OrganizationSettings> {
    return this.respond(() => {
      this.require("settings.manage");
      this.db.notificationSettings = input;
      return this.getOrganizationSettingsSync();
    });
  }

  updateOperationalPolicies(input: T.OperationalPolicies): Promise<T.OrganizationSettings> {
    return this.respond(() => {
      this.require("settings.manage");
      this.db.operationalPolicies = structuredClone(input);
      this.audit({
        category: "settings",
        action: "settings.operational_policies",
        entityType: "organization",
        entityId: this.db.organization.id,
        entityLabel: this.db.organization.name,
        summary: "Entry, membership, and operating-hour policies updated",
      });
      return this.getOrganizationSettingsSync();
    });
  }

  getOperationalEmailSettings(): Promise<T.OperationalEmailActivationSettings> {
    return this.respond(() => ({ enabledKinds: [...this.operationalEmailKinds], availableKinds: ["trial_request_confirmation", "trial_status", "payment_receipt", "support_acknowledgement", "support_reply", "support_resolved", "renewal_reminder", "membership_expiry", "pt_booking_confirmation", "pt_booking_reminder", "pt_booking_update", "pt_low_balance", "pt_package_paid"], configurableKinds: ["trial_request_confirmation", "trial_status", "payment_receipt", "support_acknowledgement", "support_reply", "support_resolved", "renewal_reminder", "membership_expiry", "pt_booking_confirmation", "pt_booking_reminder", "pt_booking_update", "pt_low_balance", "pt_package_paid"], mandatoryPlatformKinds: ["platform_invoice_issued", "platform_invoice_paid", "platform_invoice_past_due", "platform_subscription_suspended", "platform_subscription_cancelled"], liveWorkerEnabled: false, providerConfigured: false, webhookConfigured: false, ownerConfirmed: false, ...this.operationalEmailUpdate }));
  }

  updateOperationalEmailSettings(input: { enabledKinds: string[]; reason: string }): Promise<T.OperationalEmailActivationSettings> {
    return this.respond(() => {
      this.require("settings.manage");
      const allowed = ["trial_request_confirmation", "trial_status", "payment_receipt", "support_acknowledgement", "support_reply", "support_resolved", "renewal_reminder", "membership_expiry", "pt_booking_confirmation", "pt_booking_reminder", "pt_booking_update", "pt_low_balance", "pt_package_paid"];
      const next = [...new Set(input.enabledKinds)];
      if (next.some((kind) => !allowed.includes(kind))) throw ApiError.of(ERR.VALIDATION, "Only gym-controlled member service email types can be configured here.");
      const nextKinds = new Set(next);
      if (this.operationalEmailKinds.some((kind) => !nextKinds.has(kind))) this.requireReason(input.reason);
      this.operationalEmailKinds = next;
      const confirmedAt = nowISO();
      this.operationalEmailUpdate = { ownerConfirmed: true, ownerConfirmedAt: confirmedAt, ownerConfirmedBy: this.actor().name, updatedAt: confirmedAt, updatedBy: this.actor().name, reason: input.reason || undefined };
      this.audit({ category: "settings", action: "settings.operational_email.update", entityType: "organization", entityId: this.db.organization.id, entityLabel: this.db.organization.name, summary: `Enabled ${this.operationalEmailKinds.length} gym-controlled service email types`, reason: input.reason || undefined });
      return { enabledKinds: [...this.operationalEmailKinds], availableKinds: allowed, configurableKinds: allowed, mandatoryPlatformKinds: ["platform_invoice_issued", "platform_invoice_paid", "platform_invoice_past_due", "platform_subscription_suspended", "platform_subscription_cancelled"], liveWorkerEnabled: false, providerConfigured: false, webhookConfigured: false, ...this.operationalEmailUpdate! };
    });
  }

  listBranches(): Promise<T.Branch[]> {
    return this.respond(() => [...this.db.branches]);
  }

  upsertBranch(input: { id?: T.UUID; name: string; code: string; address: string; phone: string; capacity: number; status: "active" | "inactive" }): Promise<T.Branch> {
    return this.respond(() => {
      this.require("settings.manage");
      if (input.id) {
        const branch = this.db.branches.find((b) => b.id === input.id);
        if (!branch) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
        Object.assign(branch, input);
        this.audit({
          category: "settings",
          action: "branch.update",
          entityType: "branch",
          entityId: branch.id,
          entityLabel: branch.name,
          summary: "Branch updated",
        });
        return branch;
      }
      const branch: T.Branch = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        name: input.name,
        code: input.code.toUpperCase(),
        address: input.address,
        phone: input.phone,
        capacity: input.capacity,
        status: input.status,
      };
      this.db.branches.push(branch);
      this.audit({
        category: "settings",
        action: "branch.create",
        entityType: "branch",
        entityId: branch.id,
        entityLabel: branch.name,
        summary: "Branch created",
      });
      return branch;
    });
  }

  listZones(input: { branchId?: T.UUID; includeArchived?: boolean } = {}): Promise<T.Zone[]> {
    return this.respond(() => {
      const branchIds = input.branchId ? [input.branchId] : this.db.branches.filter((branch) => this.branchIsVisible(branch.id)).map((branch) => branch.id);
      if (input.branchId && !this.branchIsVisible(input.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
      return this.db.zones.filter((zone) => branchIds.includes(zone.branchId) && (input.includeArchived || zone.status === "active")).sort((left, right) => left.code.localeCompare(right.code));
    });
  }

  upsertZone(input: T.UpsertZoneInput): Promise<T.Zone> {
    return this.respond(() => {
      this.require("settings.manage");
      this.requireOwnerOrManager();
      const branch = this.db.branches.find((candidate) => candidate.id === input.branchId);
      if (!branch || branch.status !== "active" || !this.branchIsVisible(branch.id)) throw ApiError.of(ERR.NOT_FOUND, "Branch not found.");
      const code = input.code.trim().toUpperCase();
      const name = input.name.trim();
      const nameAr = input.nameAr?.trim() || undefined;
      const kinds: T.ZoneKind[] = ["floor", "studio", "weights", "cardio", "functional", "locker_room", "bathroom", "reception", "storage", "other"];
      if (!/^[A-Z0-9][A-Z0-9_-]{0,15}$/.test(code)) throw ApiError.of(ERR.VALIDATION, "Zone code must be 1–16 uppercase letters, numbers, underscores, or hyphens.");
      if (!name || name.length > 80 || (nameAr?.length ?? 0) > 80) throw ApiError.of(ERR.VALIDATION, "Zone names must be between 1 and 80 characters.");
      if (!kinds.includes(input.kind)) throw ApiError.of(ERR.VALIDATION, "Zone kind is not supported.");
      if (input.capacity !== undefined && (!Number.isSafeInteger(input.capacity) || input.capacity < 1 || input.capacity > 100_000)) throw ApiError.of(ERR.VALIDATION, "Zone capacity must be a positive whole number.");
      const existing = input.id ? this.db.zones.find((zone) => zone.id === input.id) : undefined;
      if (input.id && !existing) throw ApiError.of(ERR.NOT_FOUND, "Zone not found.");
      if (existing && existing.branchId !== branch.id) throw ApiError.of(ERR.VALIDATION, "A zone cannot be moved between branches.");
      if (existing && !this.branchIsVisible(existing.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Zone not found.");
      // Archived zones remain in history, but their code can be reused by a
      // new active zone. Only a live zone reserves the branch code.
      const duplicate = this.db.zones.find((zone) => zone.branchId === branch.id && zone.code === code && zone.status === "active" && zone.id !== existing?.id);
      if (duplicate) throw ApiError.of("CONFLICT", "That zone code is already used in this branch.");
      const now = nowISO();
      if (existing) {
        const before = { ...existing };
        Object.assign(existing, { code, name, nameAr, kind: input.kind, capacity: input.capacity, status: input.status === "archived" ? "archived" : "active", updatedAt: now });
        this.audit({ category: "settings", action: "zone.update", entityType: "zone", entityId: existing.id, entityLabel: existing.name, summary: "Zone updated", before, after: { ...existing }, branchId: branch.id });
        return { ...existing };
      }
      const zone: T.Zone = { id: mockUuid(), organizationId: this.db.organization.id, branchId: branch.id, code, name, nameAr, kind: input.kind, capacity: input.capacity, status: input.status === "archived" ? "archived" : "active", createdAt: now, updatedAt: now };
      this.db.zones.push(zone);
      this.audit({ category: "settings", action: "zone.create", entityType: "zone", entityId: zone.id, entityLabel: zone.name, summary: "Zone created", after: { ...zone }, branchId: branch.id });
      return { ...zone };
    });
  }

  archiveZone(zoneId: T.UUID): Promise<T.Zone> {
    return this.respond(() => {
      this.require("settings.manage");
      this.requireOwnerOrManager();
      const zone = this.db.zones.find((candidate) => candidate.id === zoneId);
      if (!zone || !this.branchIsVisible(zone.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Zone not found.");
      if (zone.status === "archived") return { ...zone };
      const before = { ...zone };
      zone.status = "archived";
      zone.updatedAt = nowISO();
      this.audit({ category: "settings", action: "zone.archive", entityType: "zone", entityId: zone.id, entityLabel: zone.name, summary: "Zone archived", before, after: { ...zone }, branchId: zone.branchId });
      return { ...zone };
    });
  }

  listProducts(query: { search?: string; includeArchived?: boolean } = {}): Promise<T.Product[]> {
    return this.respond(() => {
      this.requireOperationsRead();
      const search = query.search?.trim().toLowerCase();
      return this.db.products.filter((product) => (query.includeArchived || product.status === "active") && (!search || `${product.sku} ${product.name}`.toLowerCase().includes(search))).sort((a, b) => a.name.localeCompare(b.name)).map((product) => ({ ...product, retailPrice: product.retailPrice ? { ...product.retailPrice } : undefined }));
    });
  }

  upsertProduct(input: T.UpsertProductInput): Promise<T.Product> {
    return this.respond(async () => {
      this.requireOperationsWrite();
      const sku = input.sku.trim().toUpperCase();
      const name = input.name.trim();
      if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(sku) || !name || name.length > 120) throw ApiError.of(ERR.VALIDATION, "Product SKU and name are invalid.");
      if (!Number.isSafeInteger(input.reorderPoint) || input.reorderPoint < 0) throw ApiError.of(ERR.VALIDATION, "The reorder point must be a non-negative whole number.");
      if (input.availableQuantity !== undefined && (!Number.isSafeInteger(input.availableQuantity) || input.availableQuantity < 0)) throw ApiError.of(ERR.VALIDATION, "Available stock must be a non-negative whole number.");
      if (input.availableQuantity !== undefined && !input.branchId) throw ApiError.of(ERR.VALIDATION, "Select a branch when setting available stock.");
      if (input.retailPrice && (input.retailPrice.amount < 0 || !Number.isSafeInteger(input.retailPrice.amount) || input.retailPrice.currency !== this.db.organization.currency)) throw ApiError.of(ERR.VALIDATION, "Product retail price is invalid.");
      const duplicate = this.db.products.find((product) => product.status !== "archived" && product.sku === sku && product.id !== input.id);
      if (duplicate) throw ApiError.of(ERR.CONFLICT, "That SKU is already used by another product.");
      if (input.preferredSupplierId && !this.db.suppliers.some((supplier) => supplier.id === input.preferredSupplierId)) throw ApiError.of(ERR.NOT_FOUND, "Supplier not found.");
      const now = nowISO();
      const existing = input.id ? this.db.products.find((product) => product.id === input.id) : undefined;
      if (input.id && !existing) throw ApiError.of(ERR.NOT_FOUND, "Product not found.");
      const product: T.Product = existing ? Object.assign(existing, { id: existing.id, organizationId: this.db.organization.id, sku, name, description: input.description?.trim() || undefined, unit: input.unit, reorderPoint: input.reorderPoint, preferredSupplierId: input.preferredSupplierId, retailPrice: input.retailPrice, status: input.status ?? existing.status, updatedAt: now }) : { id: mockUuid(), organizationId: this.db.organization.id, sku, name, description: input.description?.trim() || undefined, unit: input.unit, reorderPoint: input.reorderPoint, preferredSupplierId: input.preferredSupplierId, retailPrice: input.retailPrice, status: input.status ?? "active", createdAt: now, updatedAt: now };
      if (!existing) this.db.products.push(product);
      this.audit({ category: "operations", action: existing ? "operations.product.update" : "operations.product.create", entityType: "product", entityId: product.id, entityLabel: product.name, summary: existing ? "Product updated" : "Product created" });
      if (input.availableQuantity !== undefined && input.branchId) {
        if (product.status !== "active") throw ApiError.of(ERR.CONFLICT, "Archived products cannot have their stock changed.");
        const branch = this.operationsBranch(input.branchId);
        const balance = this.db.inventoryBalances.find((candidate) => candidate.branchId === branch.id && candidate.productId === product.id);
        const currentAvailable = balance ? balance.quantityOnHand - balance.committedQuantity : 0;
        const delta = input.availableQuantity - currentAvailable;
        if (delta !== 0) {
          // Bind the idempotency key to the pre-change balance. This permits a
          // later legitimate return to the same quantity after stock changed,
          // while an immediate retry remains a no-op because its delta is 0.
          const balanceVersion = balance
            ? `${balance.quantityOnHand}:${balance.committedQuantity}:${balance.updatedAt}:${balance.lastMovementAt ?? ""}`
            : "empty";
          await this.recordStockMovement({ branchId: branch.id, productId: product.id, type: "adjustment", quantity: delta, reason: "Product stock availability updated", referenceType: "product_stock_edit", referenceId: product.id, idempotencyKey: `product-stock-edit:${product.id}:${branch.id}:${balanceVersion}:${input.availableQuantity}` });
        }
      }
      return { ...product, retailPrice: product.retailPrice ? { ...product.retailPrice } : undefined };
    });
  }

  archiveProduct(productId: T.UUID, reason: string): Promise<T.Product> {
    return this.respond(() => {
      this.requireOperationsWrite();
      this.requireReason(reason);
      const product = this.db.products.find((candidate) => candidate.id === productId);
      if (!product) throw ApiError.of(ERR.NOT_FOUND, "Product not found.");
      product.status = "archived";
      product.updatedAt = nowISO();
      this.audit({ category: "operations", action: "operations.product.archive", entityType: "product", entityId: product.id, entityLabel: product.name, summary: "Product archived", reason });
      return { ...product };
    });
  }

  deleteProduct(input: T.DeleteProductInput): Promise<T.DeleteProductResult> {
    return this.respond(() => {
      this.requireOperationsWrite();
      this.requireReason(input.reason);
      const confirmation = input.confirmation.trim().toLowerCase();
      if (!confirmation) throw ApiError.of(ERR.VALIDATION, "Type the exact SKU or product name to confirm permanent deletion.");
      const existingTombstone = this.db.productTombstones.find((candidate) => candidate.productId === input.productId);
      if (existingTombstone) {
        if (confirmation !== existingTombstone.sku.toLowerCase() && confirmation !== existingTombstone.name.toLowerCase()) throw ApiError.of(ERR.VALIDATION, "Type the exact SKU or product name to confirm permanent deletion.");
        return { deleted: true, productId: existingTombstone.productId, sku: existingTombstone.sku, name: existingTombstone.name, deletedAt: existingTombstone.deletedAt };
      }
      const product = this.db.products.find((candidate) => candidate.id === input.productId);
      if (!product) throw ApiError.of(ERR.NOT_FOUND, "Product not found.");
      if (confirmation !== product.sku.toLowerCase() && confirmation !== product.name.toLowerCase()) throw ApiError.of(ERR.VALIDATION, "Type the exact SKU or product name to confirm permanent deletion.");
      const balances = this.db.inventoryBalances.filter((candidate) => candidate.productId === product.id);
      if (this.actor().branchScope !== "all" && balances.some((balance) => !this.branchIsVisible(balance.branchId))) throw ApiError.of(ERR.FORBIDDEN, "This product has inventory in a branch outside your access.");
      if (balances.some((balance) => balance.committedQuantity > 0)) throw ApiError.of(ERR.CONFLICT, "This product has inventory committed to an open purchase order. Receive or cancel that order first.");
      if (balances.some((balance) => balance.quantityOnHand > 0)) throw ApiError.of(ERR.CONFLICT, "This product still has stock on hand. Sell, return, or adjust it to zero before permanently deleting the item.");
      const dependentOrders = this.db.purchaseOrders.filter((order) => order.lines.some((line) => line.productId === product.id && line.receivedQuantity < line.orderedQuantity));
      if (this.actor().branchScope !== "all" && dependentOrders.some((order) => !this.branchIsVisible(order.branchId))) throw ApiError.of(ERR.FORBIDDEN, "This product is used by a purchase order in a branch outside your access.");
      const openOrder = dependentOrders.find((order) => order.status === "draft" || order.status === "approved" || order.status === "partially_received");
      if (openOrder) throw ApiError.of(ERR.CONFLICT, "This product is on an open purchase order. Receive or cancel that order before deleting the item.");
      const deletedAt = nowISO();
      const tombstone: T.ProductTombstone = { id: mockUuid(), organizationId: this.db.organization.id, productId: product.id, sku: product.sku, name: product.name, description: product.description, unit: product.unit, retailPrice: product.retailPrice ? { ...product.retailPrice } : undefined, deletedAt, deletedById: this.actor().id, reason: input.reason.trim() };
      this.db.productTombstones.push(tombstone);
      this.db.inventoryBalances = this.db.inventoryBalances.filter((balance) => balance.productId !== product.id);
      this.db.lowStockAlerts = this.db.lowStockAlerts.filter((alert) => alert.productId !== product.id);
      this.db.suppliers.forEach((supplier) => { supplier.preferredProductIds = supplier.preferredProductIds.filter((id) => id !== product.id); });
      this.db.products = this.db.products.filter((candidate) => candidate.id !== product.id);
      this.db.stockMovements = this.db.stockMovements.map((movement) => movement.productId === product.id ? { ...movement, productSku: product.sku, productName: product.name, productUnit: product.unit } : movement);
      this.audit({ category: "operations", action: "operations.product.delete", entityType: "product", entityId: product.id, entityLabel: product.name, summary: "Product permanently deleted; historical records retained", reason: input.reason.trim(), before: { sku: product.sku, name: product.name, status: product.status }, after: { deleted: "true", sku: product.sku, name: product.name, historicalRecordsRetained: "true" } });
      return { deleted: true, productId: tombstone.productId, sku: tombstone.sku, name: tombstone.name, deletedAt: tombstone.deletedAt };
    });
  }

  listSuppliers(query: { search?: string; includeArchived?: boolean } = {}): Promise<T.Supplier[]> {
    return this.respond(() => {
      this.requireOperationsRead();
      const search = query.search?.trim().toLowerCase();
      return this.db.suppliers.filter((supplier) => (query.includeArchived || supplier.status === "active") && (this.actor().branchScope === "all" || supplier.branchIds.some((branchId) => this.branchIsVisible(branchId))) && (!search || `${supplier.name} ${supplier.contactName ?? ""} ${supplier.email ?? ""}`.toLowerCase().includes(search))).sort((a, b) => a.name.localeCompare(b.name)).map((supplier) => ({ ...supplier, branchIds: [...supplier.branchIds], preferredProductIds: [...supplier.preferredProductIds] }));
    });
  }

  upsertSupplier(input: T.UpsertSupplierInput): Promise<T.Supplier> {
    return this.respond(() => {
      this.requireOperationsWrite();
      const name = input.name.trim();
      if (!name || name.length > 120 || input.branchIds.length === 0) throw ApiError.of(ERR.VALIDATION, "Supplier name and at least one branch are required.");
      input.branchIds.forEach((branchId) => this.operationsBranch(branchId));
      input.preferredProductIds?.forEach((productId) => { if (!this.db.products.some((product) => product.id === productId)) throw ApiError.of(ERR.NOT_FOUND, "Preferred product not found."); });
      const existing = input.id ? this.db.suppliers.find((supplier) => supplier.id === input.id) : undefined;
      if (input.id && !existing) throw ApiError.of(ERR.NOT_FOUND, "Supplier not found.");
      const now = nowISO();
      const supplier: T.Supplier = existing ? Object.assign(existing, { id: existing.id, organizationId: this.db.organization.id, name, contactName: input.contactName?.trim() || undefined, email: input.email?.trim().toLowerCase() || undefined, phone: input.phone?.trim() || undefined, terms: input.terms?.trim() || undefined, branchIds: [...input.branchIds], preferredProductIds: [...new Set(input.preferredProductIds ?? [])], status: input.status ?? "active", updatedAt: now }) : { id: mockUuid(), organizationId: this.db.organization.id, name, contactName: input.contactName?.trim() || undefined, email: input.email?.trim().toLowerCase() || undefined, phone: input.phone?.trim() || undefined, terms: input.terms?.trim() || undefined, branchIds: [...input.branchIds], preferredProductIds: [...new Set(input.preferredProductIds ?? [])], status: input.status ?? "active", createdAt: now, updatedAt: now };
      if (!existing) this.db.suppliers.push(supplier);
      this.audit({ category: "operations", action: existing ? "operations.supplier.update" : "operations.supplier.create", entityType: "supplier", entityId: supplier.id, entityLabel: supplier.name, summary: existing ? "Supplier updated" : "Supplier created" });
      return { ...supplier, branchIds: [...supplier.branchIds], preferredProductIds: [...supplier.preferredProductIds] };
    });
  }

  archiveSupplier(supplierId: T.UUID, reason: string): Promise<T.Supplier> {
    return this.respond(() => {
      this.requireOperationsWrite();
      this.requireReason(reason);
      const supplier = this.db.suppliers.find((candidate) => candidate.id === supplierId);
      if (!supplier) throw ApiError.of(ERR.NOT_FOUND, "Supplier not found.");
      supplier.status = "archived";
      supplier.updatedAt = nowISO();
      this.audit({ category: "operations", action: "operations.supplier.archive", entityType: "supplier", entityId: supplier.id, entityLabel: supplier.name, summary: "Supplier archived", reason });
      return { ...supplier, branchIds: [...supplier.branchIds], preferredProductIds: [...supplier.preferredProductIds] };
    });
  }

  listInventory(input: { branchId?: T.UUID; productId?: T.UUID } = {}): Promise<T.InventoryBalance[]> {
    return this.respond(() => {
      this.requireOperationsRead();
      const branchIds = input.branchId ? [this.operationsBranch(input.branchId).id] : this.db.branches.filter((branch) => branch.status === "active" && this.branchIsVisible(branch.id)).map((branch) => branch.id);
      if (input.productId && !this.db.products.some((product) => product.id === input.productId) && !this.db.productTombstones.some((product) => product.productId === input.productId)) throw ApiError.of(ERR.NOT_FOUND, "Product not found.");
      return this.db.inventoryBalances.filter((balance) => balance.sellable !== false && branchIds.includes(balance.branchId) && (!input.productId || balance.productId === input.productId)).map((balance) => ({ ...balance, availableQuantity: balance.quantityOnHand - balance.committedQuantity, lastMovementAt: balance.lastMovementAt }));
    });
  }

  recordStockMovement(input: { branchId: T.UUID; productId: T.UUID; type: T.StockMovementType; quantity: number; unitCost?: T.Money; reason?: string; referenceType?: string; referenceId?: T.UUID; idempotencyKey: string }): Promise<T.StockMovement> {
    return this.respond(() => {
      this.requireOperationsWrite();
      const branch = this.operationsBranch(input.branchId);
      const product = this.db.products.find((candidate) => candidate.id === input.productId && candidate.status === "active");
      if (!product) throw ApiError.of(ERR.NOT_FOUND, "Product not found.");
      if (!Number.isSafeInteger(input.quantity) || input.quantity === 0 || (input.type !== "adjustment" && input.quantity < 0)) throw ApiError.of(ERR.VALIDATION, "Stock movement quantity is invalid.");
      if (input.unitCost && (input.unitCost.amount < 0 || input.unitCost.currency !== this.db.organization.currency)) throw ApiError.of(ERR.VALIDATION, "Unit cost is invalid.");
      const reason = input.reason?.trim() || undefined;
      if (input.type === "adjustment" && !reason) throw ApiError.of(ERR.VALIDATION, "A reason is required for this action.");
      const signature = JSON.stringify({ branchId: branch.id, productId: product.id, type: input.type, quantity: input.quantity, unitCost: input.unitCost, reason, referenceType: input.referenceType, referenceId: input.referenceId });
      const existing = this.operationsIdempotent("stock_movement", input.idempotencyKey, signature) as T.StockMovement | undefined;
      if (existing) return { ...existing, unitCost: existing.unitCost ? { ...existing.unitCost } : undefined };
      const delta = ["receive", "return", "transfer_in"].includes(input.type) ? input.quantity : input.type === "adjustment" ? input.quantity : -input.quantity;
      let balance = this.db.inventoryBalances.find((candidate) => candidate.branchId === branch.id && candidate.productId === product.id);
      if (!balance) { balance = { id: mockUuid(), organizationId: this.db.organization.id, branchId: branch.id, productId: product.id, quantityOnHand: 0, committedQuantity: 0, availableQuantity: 0, sellable: true, updatedAt: nowISO() }; this.db.inventoryBalances.push(balance); }
      if (balance.quantityOnHand + delta < 0) throw ApiError.of(ERR.CONFLICT, "Stock movement would make inventory negative.");
      const basis = this.retailInventoryCostBasis(branch.id, product.id);
      const currentTotalCost = balance.quantityOnHand === 0
        ? { amount: 0, currency: this.db.organization.currency }
        : balance.totalCost && balance.totalCost.currency === this.db.organization.currency && Number.isSafeInteger(balance.totalCost.amount) && balance.totalCost.amount >= 0
          ? { ...balance.totalCost }
          : basis && Number.isSafeInteger(basis.amount * balance.quantityOnHand)
            ? { amount: basis.amount * balance.quantityOnHand, currency: basis.currency }
            : undefined;
      let movementTotalCost: T.Money | undefined;
      let nextTotalCost: T.Money | undefined;
      if (delta < 0) {
        const amount = allocateExactCost(currentTotalCost?.amount, balance.quantityOnHand, Math.abs(delta));
        if (amount !== undefined && currentTotalCost) {
          movementTotalCost = { amount, currency: currentTotalCost.currency };
          nextTotalCost = { amount: currentTotalCost.amount - amount, currency: currentTotalCost.currency };
        }
      } else if (delta > 0) {
        const incoming = exactCostTotal(input.unitCost, delta);
        if (currentTotalCost && incoming && incoming.currency === this.db.organization.currency && Number.isSafeInteger(currentTotalCost.amount + incoming.amount)) {
          movementTotalCost = incoming;
          nextTotalCost = { amount: currentTotalCost.amount + incoming.amount, currency: incoming.currency };
        } else if (incoming && balance.quantityOnHand === 0) {
          movementTotalCost = incoming;
          nextTotalCost = { ...incoming };
        }
      }
      balance.quantityOnHand += delta;
      balance.totalCost = nextTotalCost;
      balance.availableQuantity = balance.quantityOnHand - balance.committedQuantity;
      balance.lastMovementAt = nowISO();
      balance.updatedAt = nowISO();
      const movement: T.StockMovement = { id: mockUuid(), organizationId: this.db.organization.id, branchId: branch.id, productId: product.id, productSku: product.sku, productName: product.name, productUnit: product.unit, type: input.type, quantityDelta: delta, quantity: Math.abs(delta), unitCost: input.unitCost, totalCost: movementTotalCost, reason, referenceType: input.referenceType, referenceId: input.referenceId, idempotencyKey: input.idempotencyKey, financialPostingStatus: "not_posted", occurredAt: nowISO(), createdAt: nowISO(), createdById: this.actor().id };
      this.db.stockMovements.unshift(movement);
      this.operationsIdempotency.set(`stock_movement:${input.idempotencyKey}`, { signature, result: movement });
      this.audit({ category: "operations", action: "operations.stock_movement.create", entityType: "stock_movement", entityId: movement.id, entityLabel: `${product.sku} · ${input.type}`, summary: `Recorded ${input.type} stock movement`, reason, branchId: branch.id });
      return { ...movement };
    });
  }

  transferInventory(input: T.InventoryTransferInput): Promise<T.InventoryTransferResult> {
    return this.respond(() => {
      this.requireOperationsWrite();
      if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw ApiError.of(ERR.VALIDATION, "Transfer quantity must be a positive whole number.");
      const reason = input.reason.trim();
      if (reason.length < 3) throw ApiError.of(ERR.VALIDATION, "A reason is required for this action.");
      const idempotencyKey = input.idempotencyKey.trim();
      if (!idempotencyKey || idempotencyKey.length > 160) throw ApiError.of(ERR.VALIDATION, "A bounded idempotency key is required.");
      const sourceScope = this.operationsTransferBranch(input.sourceBranchId);
      const destinationScope = this.operationsTransferBranch(input.destinationBranchId);
      if (sourceScope.id === destinationScope.id) throw ApiError.of(ERR.VALIDATION, "Choose a different destination branch.");
      const productScope = this.db.products.find((candidate) => candidate.id === input.productId);
      if (!productScope) throw ApiError.of(ERR.NOT_FOUND, "Product not found.");
      const signature = JSON.stringify({ sourceBranchId: sourceScope.id, destinationBranchId: destinationScope.id, productId: productScope.id, quantity: input.quantity, reason });
      const existing = this.operationsIdempotent("inventory_transfer", idempotencyKey, signature) as T.InventoryTransferResult | undefined;
      if (existing) return existing;
      const sourceBranch = this.operationsBranch(sourceScope.id);
      const destinationBranch = this.operationsBranch(destinationScope.id);
      const product = this.db.products.find((candidate) => candidate.id === productScope.id && candidate.status === "active");
      if (!product) throw ApiError.of(ERR.CONFLICT, "Archived products cannot be transferred.");
      const sourceBalance = this.db.inventoryBalances.find((candidate) => candidate.branchId === sourceBranch.id && candidate.productId === product.id);
      const sourceAvailableQuantity = (sourceBalance?.quantityOnHand ?? 0) - (sourceBalance?.committedQuantity ?? 0);
      if (sourceAvailableQuantity < input.quantity) throw ApiError.of(ERR.CONFLICT, "The source branch does not have enough available stock for this transfer.");
      let destinationBalance = this.db.inventoryBalances.find((candidate) => candidate.branchId === destinationBranch.id && candidate.productId === product.id);
      if (!destinationBalance) {
        destinationBalance = { id: mockUuid(), organizationId: this.db.organization.id, branchId: destinationBranch.id, productId: product.id, quantityOnHand: 0, committedQuantity: 0, availableQuantity: 0, sellable: true, updatedAt: nowISO() };
        this.db.inventoryBalances.push(destinationBalance);
      }
      const destinationAvailableQuantity = destinationBalance.quantityOnHand - destinationBalance.committedQuantity;
      const now = nowISO();
      const transferId = mockUuid();
      const sourceMovementKey = `${idempotencyKey}:out`;
      const destinationMovementKey = `${idempotencyKey}:in`;
      const sourceBasis = this.retailInventoryCostBasis(sourceBranch.id, product.id);
      const sourceTotalCost = sourceBalance && sourceBalance.totalCost && sourceBalance.totalCost.currency === this.db.organization.currency
        ? sourceBalance.totalCost.amount
        : sourceBasis && sourceBalance && Number.isSafeInteger(sourceBasis.amount * sourceBalance.quantityOnHand)
          ? sourceBasis.amount * sourceBalance.quantityOnHand
          : undefined;
      const movedTotalCost = sourceBalance ? allocateExactCost(sourceTotalCost, sourceBalance.quantityOnHand, input.quantity) : undefined;
      const sourceRemainingCost = sourceTotalCost !== undefined && movedTotalCost !== undefined ? sourceTotalCost - movedTotalCost : undefined;
      const destinationTotalCost = destinationBalance.quantityOnHand === 0
        ? 0
        : destinationBalance.totalCost && destinationBalance.totalCost.currency === this.db.organization.currency
          ? destinationBalance.totalCost.amount
          : undefined;
      const destinationNextCost = destinationTotalCost !== undefined && movedTotalCost !== undefined && Number.isSafeInteger(destinationTotalCost + movedTotalCost) ? destinationTotalCost + movedTotalCost : undefined;
      const unitCost = sourceBasis ?? (movedTotalCost !== undefined ? money(Math.round(movedTotalCost / input.quantity), this.db.organization.currency) : undefined);
      const movementTotalCost = movedTotalCost === undefined ? undefined : money(movedTotalCost, this.db.organization.currency);
      const sourceMovement: T.StockMovement = { id: mockUuid(), organizationId: this.db.organization.id, branchId: sourceBranch.id, productId: product.id, productSku: product.sku, productName: product.name, productUnit: product.unit, type: "transfer_out", quantityDelta: -input.quantity, quantity: input.quantity, unitCost, totalCost: movementTotalCost, reason, referenceType: "inventory_transfer", referenceId: transferId, idempotencyKey: sourceMovementKey, financialPostingStatus: "not_posted", occurredAt: now, createdAt: now, createdById: this.actor().id };
      const destinationMovement: T.StockMovement = { id: mockUuid(), organizationId: this.db.organization.id, branchId: destinationBranch.id, productId: product.id, productSku: product.sku, productName: product.name, productUnit: product.unit, type: "transfer_in", quantityDelta: input.quantity, quantity: input.quantity, unitCost, totalCost: movementTotalCost, reason, referenceType: "inventory_transfer", referenceId: transferId, idempotencyKey: destinationMovementKey, financialPostingStatus: "not_posted", occurredAt: now, createdAt: now, createdById: this.actor().id };
      if (!sourceBalance) throw ApiError.of(ERR.CONFLICT, "The source branch inventory balance could not be loaded.");
      sourceBalance.quantityOnHand -= input.quantity;
      sourceBalance.totalCost = sourceRemainingCost === undefined ? undefined : money(sourceRemainingCost, this.db.organization.currency);
      sourceBalance.availableQuantity = sourceBalance.quantityOnHand - sourceBalance.committedQuantity;
      sourceBalance.lastMovementAt = now;
      sourceBalance.updatedAt = now;
      destinationBalance.quantityOnHand += input.quantity;
      destinationBalance.totalCost = destinationNextCost === undefined ? undefined : money(destinationNextCost, this.db.organization.currency);
      destinationBalance.availableQuantity = destinationBalance.quantityOnHand - destinationBalance.committedQuantity;
      destinationBalance.lastMovementAt = now;
      destinationBalance.updatedAt = now;
      this.db.stockMovements.unshift(destinationMovement, sourceMovement);
      const result: T.InventoryTransferResult = { id: transferId, organizationId: this.db.organization.id, sourceBranchId: sourceBranch.id, destinationBranchId: destinationBranch.id, productId: product.id, quantity: input.quantity, reason, idempotencyKey, status: "completed", totalCost: movementTotalCost, sourceMovementId: sourceMovement.id, destinationMovementId: destinationMovement.id, sourceMovement, destinationMovement, sourceAvailableQuantity: sourceAvailableQuantity - input.quantity, destinationAvailableQuantity: destinationAvailableQuantity + input.quantity, createdById: this.actor().id, occurredAt: now };
      const transfer: T.InventoryTransfer = { id: transferId, organizationId: this.db.organization.id, sourceBranchId: sourceBranch.id, destinationBranchId: destinationBranch.id, productId: product.id, quantity: input.quantity, reason, status: "completed", sourceMovementId: sourceMovement.id, destinationMovementId: destinationMovement.id, totalCost: movementTotalCost, sourceAvailableBefore: sourceAvailableQuantity, destinationAvailableBefore: destinationAvailableQuantity, sourceAvailableAfter: sourceAvailableQuantity - input.quantity, destinationAvailableAfter: destinationAvailableQuantity + input.quantity, idempotencyKey, createdById: this.actor().id, occurredAt: now };
      this.db.inventoryTransfers.unshift(transfer);
      this.operationsIdempotency.set(`inventory_transfer:${idempotencyKey}`, { signature, result, expiresAt: Date.now() + 90 * 86_400_000 });
      this.audit({ category: "operations", action: "operations.inventory.transfer", entityType: "inventory_transfer", entityId: transferId, entityLabel: `${product.sku} · ${sourceBranch.name} → ${destinationBranch.name}`, summary: "Inventory transferred between branches", reason, branchId: sourceBranch.id, destinationBranchId: destinationBranch.id });
      return result;
    });
  }

  listStockMovements(query: { branchId?: T.UUID; productId?: T.UUID; page?: number; pageSize?: number } = {}): Promise<T.Page<T.StockMovement>> {
    return this.respond(() => {
      this.requireOperationsRead();
      const branchId = query.branchId ? this.operationsBranch(query.branchId).id : undefined;
      const rows = this.db.stockMovements.filter((movement) => (!branchId || movement.branchId === branchId) && (!query.productId || movement.productId === query.productId) && this.branchIsVisible(movement.branchId)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      return paginate(rows.map((row) => {
        const product = this.db.products.find((candidate) => candidate.id === row.productId);
        const tombstone = this.db.productTombstones.find((candidate) => candidate.productId === row.productId);
        return { ...row, productSku: row.productSku ?? product?.sku ?? tombstone?.sku, productName: row.productName ?? product?.name ?? tombstone?.name, productUnit: row.productUnit ?? product?.unit ?? tombstone?.unit, unitCost: row.unitCost ? { ...row.unitCost } : undefined };
      }), { page: query.page, pageSize: query.pageSize });
    });
  }

  private lowStockSnapshot(input: { branchId?: T.UUID; includeDismissed?: boolean } = {}): T.LowStockAlert[] {
    const branchIds = input.branchId ? [this.operationsBranch(input.branchId).id] : this.db.branches.filter((branch) => branch.status === "active" && this.branchIsVisible(branch.id)).map((branch) => branch.id);
    const alerts: T.LowStockAlert[] = [];
    for (const branchId of branchIds) {
      for (const product of this.db.products.filter((candidate) => candidate.status === "active")) {
        const balance = this.db.inventoryBalances.find((candidate) => candidate.branchId === branchId && candidate.productId === product.id);
        const quantityOnHand = balance?.quantityOnHand ?? 0;
        const committedQuantity = balance?.committedQuantity ?? 0;
        const availableQuantity = quantityOnHand - committedQuantity;
        if (availableQuantity > product.reorderPoint) continue;
        const existing = this.db.lowStockAlerts.find((alert) => alert.branchId === branchId && alert.productId === product.id);
        if (!input.includeDismissed && existing?.status === "dismissed") continue;
        alerts.push({ id: existing?.id ?? mockUuid(), organizationId: this.db.organization.id, branchId, productId: product.id, quantityOnHand, committedQuantity, availableQuantity, reorderPoint: product.reorderPoint, status: existing?.status ?? "open", dismissedAt: existing?.dismissedAt, dismissedReason: existing?.dismissedReason, updatedAt: existing?.updatedAt ?? nowISO() });
      }
    }
    return alerts;
  }

  listLowStockAlerts(input: { branchId?: T.UUID; includeDismissed?: boolean } = {}): Promise<T.LowStockAlert[]> {
    return this.respond(() => { this.requireOperationsRead(); return this.lowStockSnapshot(input).map((alert) => ({ ...alert })); });
  }

  refreshLowStockAlerts(input: { branchId?: T.UUID } = {}): Promise<T.LowStockAlert[]> {
    return this.respond(() => {
      this.requireOperationsWrite();
      for (const snapshot of this.lowStockSnapshot({ ...input, includeDismissed: true })) {
        if (!this.db.lowStockAlerts.some((alert) => alert.branchId === snapshot.branchId && alert.productId === snapshot.productId)) this.db.lowStockAlerts.push({ ...snapshot, status: "open" });
      }
      return this.lowStockSnapshot({ ...input, includeDismissed: true });
    });
  }

  dismissLowStockAlert(input: { alertId: T.UUID; reason: string }): Promise<T.LowStockAlert> {
    return this.respond(() => {
      this.requireOperationsWrite();
      this.requireReason(input.reason);
      const alert = this.db.lowStockAlerts.find((candidate) => candidate.id === input.alertId);
      if (!alert || !this.branchIsVisible(alert.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Low-stock alert not found.");
      alert.status = "dismissed";
      alert.dismissedAt = nowISO();
      alert.dismissedReason = input.reason;
      alert.updatedAt = nowISO();
      this.audit({ category: "operations", action: "operations.inventory_alert.dismiss", entityType: "inventory_alert", entityId: alert.id, entityLabel: alert.id, summary: "Low-stock alert dismissed", reason: input.reason, branchId: alert.branchId });
      return { ...alert };
    });
  }

  createPurchaseOrder(input: T.CreatePurchaseOrderInput): Promise<T.PurchaseOrder> {
    return this.respond(() => {
      this.requireOperationsWrite();
      const branch = this.operationsBranch(input.branchId);
      const sourceType = input.sourceType ?? (input.supplierId ? "supplier" : "private");
      if (sourceType !== "supplier" && sourceType !== "private") throw ApiError.of(ERR.VALIDATION, "Purchase source is invalid.");
      const supplier = sourceType === "supplier" ? this.db.suppliers.find((candidate) => candidate.id === input.supplierId && candidate.status === "active") : undefined;
      if (sourceType === "supplier" && (!supplier || (supplier.branchIds.length > 0 && !supplier.branchIds.includes(branch.id)))) throw ApiError.of(ERR.NOT_FOUND, "Supplier not found for this branch.");
      if (!input.lines.length) throw ApiError.of(ERR.VALIDATION, "A purchase order must contain at least one line.");
      const seen = new Set<T.UUID>();
      const lines: T.PurchaseOrderLine[] = input.lines.map((raw) => {
        const product = this.db.products.find((candidate) => candidate.id === raw.productId && candidate.status === "active");
        if (!product || seen.has(raw.productId)) throw ApiError.of(ERR.VALIDATION, "Purchase product is invalid or repeated.");
        seen.add(raw.productId);
        if (!Number.isSafeInteger(raw.quantity) || raw.quantity <= 0 || raw.unitCost.currency !== this.db.organization.currency || raw.unitCost.amount < 0) throw ApiError.of(ERR.VALIDATION, "Purchase line is invalid.");
        return { productId: product.id, sku: product.sku, productName: product.name, orderedQuantity: raw.quantity, receivedQuantity: 0, unitCost: { ...raw.unitCost }, lineTotal: { amount: raw.quantity * raw.unitCost.amount, currency: raw.unitCost.currency } };
      });
      const supplierName = supplier?.name ?? "Private purchase";
      const order: T.PurchaseOrder = { id: mockUuid(), organizationId: this.db.organization.id, branchId: branch.id, sourceType, supplierId: supplier?.id, supplierName, lines, status: "draft", currency: this.db.organization.currency, total: { amount: lines.reduce((sum, line) => sum + line.lineTotal.amount, 0), currency: this.db.organization.currency }, supplierInvoiceReference: input.supplierInvoiceReference, notes: input.notes, createdAt: nowISO(), updatedAt: nowISO() };
      this.db.purchaseOrders.unshift(order);
      this.audit({ category: "operations", action: "operations.purchase_order.create", entityType: "purchase_order", entityId: order.id, entityLabel: supplierName, summary: sourceType === "private" ? "Private purchase order created" : "Purchase order created", branchId: branch.id });
      return { ...order, lines: order.lines.map((line) => ({ ...line, unitCost: { ...line.unitCost }, lineTotal: { ...line.lineTotal } })), total: { ...order.total } };
    });
  }

  approvePurchaseOrder(purchaseOrderId: T.UUID, reason?: string): Promise<T.PurchaseOrder> {
    return this.respond(() => {
      this.requireOperationsWrite();
      const order = this.db.purchaseOrders.find((candidate) => candidate.id === purchaseOrderId);
      if (!order || !this.branchIsVisible(order.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Purchase order not found.");
      if (order.status !== "draft") throw ApiError.of(ERR.CONFLICT, "Only draft purchase orders can be approved.");
      order.status = "approved";
      order.approvedAt = nowISO();
      order.approvedById = this.actor().id;
      order.updatedAt = nowISO();
      for (const line of order.lines) {
        let balance = this.db.inventoryBalances.find((candidate) => candidate.branchId === order.branchId && candidate.productId === line.productId);
        if (!balance) { balance = { id: mockUuid(), organizationId: this.db.organization.id, branchId: order.branchId, productId: line.productId, quantityOnHand: 0, committedQuantity: 0, availableQuantity: 0, sellable: true, updatedAt: nowISO() }; this.db.inventoryBalances.push(balance); }
        balance.committedQuantity += line.orderedQuantity;
        balance.availableQuantity = balance.quantityOnHand - balance.committedQuantity;
        balance.updatedAt = nowISO();
      }
      this.audit({ category: "operations", action: "operations.purchase_order.approve", entityType: "purchase_order", entityId: order.id, entityLabel: order.supplierName, summary: "Purchase order approved", reason, branchId: order.branchId });
      return { ...order, lines: order.lines.map((line) => ({ ...line, unitCost: { ...line.unitCost }, lineTotal: { ...line.lineTotal } })), total: { ...order.total } };
    });
  }

  listPurchaseOrders(query: { branchId?: T.UUID; status?: T.PurchaseOrderStatus } = {}): Promise<T.PurchaseOrder[]> {
    return this.respond(() => {
      this.requireOperationsRead();
      if (query.branchId) this.operationsBranch(query.branchId);
      return this.db.purchaseOrders.filter((order) => (!query.branchId || order.branchId === query.branchId) && (!query.status || order.status === query.status) && this.branchIsVisible(order.branchId)).map((order) => ({ ...order, lines: order.lines.map((line) => ({ ...line, unitCost: { ...line.unitCost }, lineTotal: { ...line.lineTotal } })), total: { ...order.total } }));
    });
  }

  receivePurchaseOrder(input: T.ReceivePurchaseOrderInput): Promise<T.PurchaseOrder> {
    return this.respond(async () => {
      this.requireOperationsWrite();
      const order = this.db.purchaseOrders.find((candidate) => candidate.id === input.purchaseOrderId);
      if (!order || !this.branchIsVisible(order.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Purchase order not found.");
      const signature = JSON.stringify(input);
      const existing = this.operationsIdempotent("purchase_order.receive", input.idempotencyKey, signature) as T.PurchaseOrder | undefined;
      if (existing) return existing;
      if (order.status !== "approved" && order.status !== "partially_received") throw ApiError.of(ERR.CONFLICT, "Only approved purchase orders can be received.");
      const requested: Array<{ productId: T.UUID; quantity: number; unitCost?: T.Money }> = input.lines?.length ? input.lines : order.lines.filter((line) => line.receivedQuantity < line.orderedQuantity).map((line) => ({ productId: line.productId, quantity: line.orderedQuantity - line.receivedQuantity }));
      if (!requested?.length) throw ApiError.of(ERR.CONFLICT, "This purchase order has no remaining quantity to receive.");
      for (const raw of requested) {
        const line = order.lines.find((candidate) => candidate.productId === raw.productId);
        if (!line || !Number.isSafeInteger(raw.quantity) || raw.quantity <= 0 || line.receivedQuantity + raw.quantity > line.orderedQuantity) throw ApiError.of(ERR.VALIDATION, "Received quantity exceeds the remaining purchase order quantity.");
        const product = this.db.products.find((candidate) => candidate.id === raw.productId)!;
        const unitCost = raw.unitCost ?? line.unitCost;
        await this.recordStockMovement({ branchId: order.branchId, productId: product.id, type: "receive", quantity: raw.quantity, unitCost, reason: `Purchase order ${order.id} receiving`, referenceType: "purchase_order", referenceId: order.id, idempotencyKey: `${input.idempotencyKey}:${product.id}` });
        line.receivedQuantity += raw.quantity;
        const balance = this.db.inventoryBalances.find((candidate) => candidate.branchId === order.branchId && candidate.productId === product.id);
        if (balance) { balance.committedQuantity = Math.max(0, balance.committedQuantity - raw.quantity); balance.availableQuantity = balance.quantityOnHand - balance.committedQuantity; }
      }
      order.status = order.lines.every((line) => line.receivedQuantity === line.orderedQuantity) ? "received" : "partially_received";
      order.receivedAt = order.status === "received" ? nowISO() : order.receivedAt;
      order.updatedAt = nowISO();
      const result = { ...order, lines: order.lines.map((line) => ({ ...line, unitCost: { ...line.unitCost }, lineTotal: { ...line.lineTotal } })), total: { ...order.total } };
      this.operationsIdempotency.set(`purchase_order.receive:${input.idempotencyKey}`, { signature, result });
      this.audit({ category: "operations", action: "operations.purchase_order.receive", entityType: "purchase_order", entityId: order.id, entityLabel: order.supplierName, summary: `Purchase order ${order.status}`, branchId: order.branchId });
      return result;
    });
  }

  notifyPurchaseOrderSupplier(input: { purchaseOrderId: T.UUID; channel?: "supplier_email" | "supplier_sms"; reason: string }): Promise<T.SupplierNotificationResult> {
    return this.respond(() => {
      this.requireOperationsWrite();
      this.requireReason(input.reason);
      const order = this.db.purchaseOrders.find((candidate) => candidate.id === input.purchaseOrderId);
      if (!order || !this.branchIsVisible(order.branchId)) throw ApiError.of(ERR.NOT_FOUND, "Purchase order not found.");
      const result: T.SupplierNotificationResult = { purchaseOrderId: order.id, status: "not_configured", channel: input.channel ?? "supplier_email", detail: order.sourceType === "private" || !order.supplierId ? "This is a private purchase, so no supplier contact is recorded or notified." : "No supplier provider is configured; no external notification was sent.", attemptedAt: nowISO() };
      this.audit({ category: "operations", action: "operations.supplier_notification.preview", entityType: "purchase_order", entityId: order.id, entityLabel: order.supplierName, summary: "Supplier notification held in sandbox", reason: input.reason, branchId: order.branchId });
      return result;
    });
  }

  listFacilityTasks(query: { branchId?: T.UUID; zoneId?: T.UUID; status?: T.FacilityTaskStatus; kind?: T.FacilityTaskKind } = {}): Promise<T.FacilityTask[]> {
    return this.respond(() => {
      this.requireOperationsRead();
      if (query.branchId) this.operationsBranch(query.branchId);
      if (query.branchId && query.zoneId) this.operationsZone(query.branchId, query.zoneId);
      return this.db.facilityTasks.filter((task) => (!query.branchId || task.branchId === query.branchId) && (!query.zoneId || task.zoneId === query.zoneId) && (!query.status || task.status === query.status) && (!query.kind || task.kind === query.kind) && this.branchIsVisible(task.branchId)).map((task) => ({ ...task, trafficContext: task.trafficContext ? { ...task.trafficContext } : undefined, suppliesCost: task.suppliesCost ? { ...task.suppliesCost } : undefined }));
    });
  }

  upsertFacilityTask(input: T.UpsertFacilityTaskInput): Promise<T.FacilityTask> {
    return this.respond(() => {
      this.requireOperationsWrite();
      const branch = this.operationsBranch(input.branchId);
      const zone = this.operationsZone(branch.id, input.zoneId);
      const title = input.title.trim();
      if (!title || title.length > 160 || input.suppliesCost?.currency !== undefined && input.suppliesCost.currency !== this.db.organization.currency) throw ApiError.of(ERR.VALIDATION, "Facility task fields are invalid.");
      if (input.trafficContext?.occupancyPercent !== undefined && (input.trafficContext.occupancyPercent < 0 || input.trafficContext.occupancyPercent > 100)) throw ApiError.of(ERR.VALIDATION, "Occupancy must be between 0 and 100.");
      const existing = input.id ? this.db.facilityTasks.find((task) => task.id === input.id) : undefined;
      if (input.id && (!existing || existing.branchId !== branch.id)) throw ApiError.of(ERR.NOT_FOUND, "Facility task not found.");
      const status = input.status ?? existing?.status ?? "open";
      const immutableStatus = existing ? this.immutableAccountingStatus("facility_supplies", existing.id) : undefined;
      const completedAt = immutableStatus && input.status === undefined
        ? existing?.completedAt
        : status === "completed" ? existing?.completedAt ?? nowISO() : undefined;
      const suppliesCost = immutableStatus && input.suppliesCost === undefined ? existing?.suppliesCost : input.suppliesCost;
      if (existing && immutableStatus && (
        zone.id !== existing.zoneId ||
        status !== existing.status ||
        completedAt !== existing.completedAt ||
        suppliesCost?.amount !== existing.suppliesCost?.amount ||
        suppliesCost?.currency !== existing.suppliesCost?.currency
      )) {
        this.rejectImmutableAccountingMutation("This facility task", immutableStatus);
      }
      const now = nowISO();
      const task: T.FacilityTask = existing ? Object.assign(existing, { ...input, id: existing.id, organizationId: this.db.organization.id, branchId: branch.id, zoneId: zone.id, zoneName: zone.name, title, status, assigneeId: input.assigneeId, completedAt, suppliesCost, financialPostingStatus: existing.financialPostingStatus ?? "not_posted", financialSourceId: existing.financialSourceId, updatedAt: now }) : { id: mockUuid(), organizationId: this.db.organization.id, branchId: branch.id, zoneId: zone.id, zoneName: zone.name, kind: input.kind, severity: input.severity, status, title, notes: input.notes?.trim() || undefined, assigneeId: input.assigneeId, dueAt: input.dueAt, trafficContext: input.trafficContext, suppliesCost: input.suppliesCost, financialPostingStatus: "not_posted", createdAt: now, updatedAt: now };
      if (!existing) this.db.facilityTasks.unshift(task);
      this.audit({ category: "operations", action: existing ? "operations.facility_task.update" : "operations.facility_task.create", entityType: "facility_task", entityId: task.id, entityLabel: task.title, summary: existing ? "Facility task updated" : "Facility task created", branchId: branch.id });
      return { ...task, trafficContext: task.trafficContext ? { ...task.trafficContext } : undefined, suppliesCost: task.suppliesCost ? { ...task.suppliesCost } : undefined };
    });
  }




  listEquipmentAssets(query: { branchId?: T.UUID; status?: T.EquipmentAssetStatus } = {}): Promise<T.EquipmentAsset[]> {
    return this.respond(() => {
      this.requireOperationsRead();
      if (query.branchId) this.operationsBranch(query.branchId);
      return this.db.equipmentAssets.filter((asset) => (!query.branchId || asset.branchId === query.branchId) && (!query.status || asset.status === query.status) && this.branchIsVisible(asset.branchId)).map((asset) => ({ ...asset, purchaseCost: asset.purchaseCost ? { ...asset.purchaseCost } : undefined, issueCount: this.db.equipmentIssues.filter((issue) => issue.assetId === asset.id).length }));
    });
  }

  upsertEquipmentAsset(input: T.UpsertEquipmentAssetInput): Promise<T.EquipmentAsset> {
    return this.respond(() => {
      this.requireOperationsWrite();
      const branch = this.operationsBranch(input.branchId);
      if (input.zoneId) this.operationsZone(branch.id, input.zoneId);
      const code = input.code.trim().toUpperCase();
      const name = input.name.trim();
      const existing = input.id ? this.db.equipmentAssets.find((asset) => asset.id === input.id) : undefined;
      const status = input.status ?? existing?.status ?? "active";
      if (!MOCK_EQUIPMENT_ASSET_STATUSES.includes(status) || !/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(code) || !name || name.length > 120 || (input.purchaseCost && (input.purchaseCost.amount < 0 || !Number.isSafeInteger(input.purchaseCost.amount) || input.purchaseCost.currency !== this.db.organization.currency))) throw ApiError.of(ERR.VALIDATION, "Equipment fields are invalid.");
      if ((input.expectedServiceIntervalDays !== undefined && (!Number.isSafeInteger(input.expectedServiceIntervalDays) || input.expectedServiceIntervalDays < 1)) || (input.expectedUsefulLifeMonths !== undefined && (!Number.isSafeInteger(input.expectedUsefulLifeMonths) || input.expectedUsefulLifeMonths < 1 || input.expectedUsefulLifeMonths > 600))) throw ApiError.of(ERR.VALIDATION, "Equipment service intervals must be positive whole numbers and useful life must be between 1 and 600 months.");
      // Retired/replaced assets remain in history, but their code can be
      // reused by a new live asset. Maintenance assets still reserve it.
      const duplicate = this.db.equipmentAssets.find((asset) => asset.branchId === branch.id && asset.code === code && (asset.status === "active" || asset.status === "maintenance") && asset.id !== input.id);
      if (duplicate) throw ApiError.of(ERR.CONFLICT, "That equipment code is already used in this branch.");
      if (input.id && (!existing || !this.branchIsVisible(existing.branchId))) throw ApiError.of(ERR.NOT_FOUND, "Equipment asset not found.");
      if (existing && existing.branchId !== branch.id) throw ApiError.of(ERR.CONFLICT, "Equipment assets cannot be reassigned between branches; use a future transfer workflow.");
      if (existing && input.status !== undefined && input.status !== existing.status) {
        const allowed = existing.status === "active" ? ["maintenance", "retired", "replaced"] : existing.status === "maintenance" ? ["active", "retired", "replaced"] : [];
        if (!allowed.includes(status)) throw ApiError.of(ERR.CONFLICT, `An equipment asset cannot move from ${existing.status} to ${status}.`);
      }
      if (input.status === "active" && existing && this.db.equipmentIssues.some((issue) => issue.assetId === existing.id && !["resolved", "cancelled"].includes(issue.status) && issue.safetyStatus === "out_of_service")) throw ApiError.of(ERR.CONFLICT, "This equipment has an unresolved out-of-service issue. Resolve the issue before marking the asset active.");
      const immutableStatus = existing ? this.immutableAccountingStatus("equipment_acquisition", existing.id) : undefined;
      const purchaseDate = immutableStatus && input.purchaseDate === undefined ? existing?.purchaseDate : input.purchaseDate;
      const purchaseCost = immutableStatus && input.purchaseCost === undefined ? existing?.purchaseCost : input.purchaseCost;
      if (existing && immutableStatus && (
        purchaseDate !== existing.purchaseDate ||
        purchaseCost?.amount !== existing.purchaseCost?.amount ||
        purchaseCost?.currency !== existing.purchaseCost?.currency
      )) {
        this.rejectImmutableAccountingMutation("This equipment acquisition", immutableStatus);
      }
      const now = nowISO();
      const asset: T.EquipmentAsset = existing ? Object.assign(existing, { ...input, id: existing.id, organizationId: this.db.organization.id, branchId: branch.id, code, name, purchaseDate, purchaseCost, status, updatedAt: now }) : { id: mockUuid(), organizationId: this.db.organization.id, branchId: branch.id, zoneId: input.zoneId, code, name, manufacturer: input.manufacturer?.trim() || undefined, model: input.model?.trim() || undefined, serialNumber: input.serialNumber?.trim() || undefined, purchaseDate: input.purchaseDate, installationDate: input.installationDate, purchaseCost: input.purchaseCost, warrantyEndDate: input.warrantyEndDate, status, expectedServiceIntervalDays: input.expectedServiceIntervalDays, expectedUsefulLifeMonths: input.expectedUsefulLifeMonths, createdAt: now, updatedAt: now };
      if (!existing) this.db.equipmentAssets.unshift(asset);
      this.audit({ category: "operations", action: existing ? "operations.equipment_asset.update" : "operations.equipment_asset.create", entityType: "equipment_asset", entityId: asset.id, entityLabel: asset.code, summary: existing ? "Equipment asset updated" : "Equipment asset created", branchId: branch.id });
      return { ...asset, purchaseCost: asset.purchaseCost ? { ...asset.purchaseCost } : undefined, issueCount: this.db.equipmentIssues.filter((issue) => issue.assetId === asset.id).length };
    });
  }

  reportEquipmentIssue(input: { branchId: T.UUID; assetId: T.UUID; title: string; description?: string; severity: T.EquipmentIssueSeverity; downtimeDays?: number; safetyStatus?: T.EquipmentIssue["safetyStatus"] }): Promise<T.EquipmentIssue> {
    return this.respond(() => {
      this.requireOperationsWrite();
      const branch = this.operationsBranch(input.branchId);
      const asset = this.db.equipmentAssets.find((candidate) => candidate.id === input.assetId && candidate.branchId === branch.id);
      if (!asset) throw ApiError.of(ERR.NOT_FOUND, "Equipment asset not found.");
      if (["retired", "replaced"].includes(asset.status)) throw ApiError.of(ERR.CONFLICT, "Retired or replaced equipment cannot receive new issues.");
      const title = input.title.trim();
      const safetyStatus = input.safetyStatus ?? "unknown";
      if (!MOCK_EQUIPMENT_ISSUE_SEVERITIES.includes(input.severity) || !MOCK_EQUIPMENT_SAFETY_STATUSES.includes(safetyStatus) || !title || title.length > 160 || (input.description !== undefined && input.description.trim().length > 2000) || (input.downtimeDays !== undefined && (!Number.isFinite(input.downtimeDays) || input.downtimeDays < 0))) throw ApiError.of(ERR.VALIDATION, "Equipment issue fields are invalid.");
      const issue: T.EquipmentIssue = { id: mockUuid(), organizationId: this.db.organization.id, branchId: branch.id, assetId: asset.id, title, description: input.description?.trim() || undefined, severity: input.severity, status: "open", reportedAt: nowISO(), downtimeDays: input.downtimeDays, safetyStatus, createdById: this.actor().id };
      this.db.equipmentIssues.unshift(issue);
      if (safetyStatus === "out_of_service" && asset.status === "active") {
        const beforeAsset = { ...asset };
        asset.status = "maintenance";
        asset.updatedAt = nowISO();
        this.audit({ category: "operations", action: "operations.equipment_asset.update", entityType: "equipment_asset", entityId: asset.id, entityLabel: asset.code, summary: "Equipment marked for maintenance after an out-of-service issue", before: { status: beforeAsset.status }, after: { status: asset.status }, branchId: branch.id });
      }
      this.audit({ category: "operations", action: "operations.equipment_issue.create", entityType: "equipment_issue", entityId: issue.id, entityLabel: issue.title, summary: "Equipment issue reported", branchId: branch.id });
      return { ...issue };
    });
  }

  updateEquipmentIssue(issueId: T.UUID, input: T.UpdateEquipmentIssueInput): Promise<T.EquipmentIssue> {
    return this.respond(() => {
      this.requireOperationsWrite();
      const issue = this.db.equipmentIssues.find((candidate) => candidate.id === issueId && this.branchIsVisible(candidate.branchId));
      if (!issue) throw ApiError.of(ERR.NOT_FOUND, "Equipment issue not found.");
      const status = input.status ?? issue.status;
      if (!MOCK_EQUIPMENT_ISSUE_STATUSES.includes(status)) throw ApiError.of(ERR.VALIDATION, "Equipment issue status is invalid.");
      const safetyStatus = input.safetyStatus ?? issue.safetyStatus;
      if (!MOCK_EQUIPMENT_SAFETY_STATUSES.includes(safetyStatus)) throw ApiError.of(ERR.VALIDATION, "Equipment safety status is invalid.");
      if (status === "resolved" && safetyStatus !== "safe_to_operate") throw ApiError.of(ERR.VALIDATION, "An issue can only be resolved when the equipment is safe to operate.");
      if (status !== issue.status) {
        const allowed = issue.status === "open" ? ["in_progress", "resolved", "cancelled"] : issue.status === "in_progress" ? ["resolved", "cancelled"] : [];
        if (!allowed.includes(status)) throw ApiError.of(ERR.CONFLICT, `An equipment issue cannot move from ${issue.status} to ${status}.`);
      }
      if (input.downtimeDays !== undefined && (!Number.isFinite(input.downtimeDays) || input.downtimeDays < 0)) throw ApiError.of(ERR.VALIDATION, "Downtime days must be non-negative.");
      const before = { ...issue };
      issue.status = status;
      issue.safetyStatus = safetyStatus;
      issue.downtimeDays = input.downtimeDays ?? issue.downtimeDays;
      issue.resolvedAt = status === "resolved" ? issue.resolvedAt ?? nowISO() : undefined;
      const asset = this.db.equipmentAssets.find((candidate) => candidate.id === issue.assetId);
      if (asset && safetyStatus === "out_of_service" && asset.status === "active") {
        const beforeAsset = { ...asset };
        asset.status = "maintenance";
        asset.updatedAt = nowISO();
        this.audit({ category: "operations", action: "operations.equipment_asset.update", entityType: "equipment_asset", entityId: asset.id, entityLabel: asset.code, summary: "Equipment marked for maintenance after an out-of-service issue", before: { status: beforeAsset.status }, after: { status: asset.status }, branchId: issue.branchId });
      } else if (asset && status === "resolved" && safetyStatus === "safe_to_operate" && asset.status === "maintenance") {
        const remainingIssues = this.db.equipmentIssues.filter((candidate) => candidate.assetId === asset.id && candidate.id !== issue.id);
        if (!remainingIssues.some((candidate) => !["resolved", "cancelled"].includes(candidate.status))) {
          const beforeAsset = { ...asset };
          asset.status = "active";
          asset.updatedAt = nowISO();
          this.audit({ category: "operations", action: "operations.equipment_asset.update", entityType: "equipment_asset", entityId: asset.id, entityLabel: asset.code, summary: "Equipment returned to active use after all issues were resolved", before: { status: beforeAsset.status }, after: { status: asset.status }, branchId: issue.branchId });
        }
      }
      this.audit({ category: "operations", action: "operations.equipment_issue.update", entityType: "equipment_issue", entityId: issue.id, entityLabel: issue.title, summary: status === "resolved" ? "Equipment issue resolved" : "Equipment issue updated", before, after: { ...issue }, branchId: issue.branchId });
      return { ...issue };
    });
  }

  listEquipmentIssues(query: { branchId?: T.UUID; assetId?: T.UUID; status?: T.EquipmentIssueStatus } = {}): Promise<T.EquipmentIssue[]> {
    return this.respond(() => {
      this.requireOperationsRead();
      if (query.branchId) this.operationsBranch(query.branchId);
      return this.db.equipmentIssues.filter((issue) => (!query.branchId || issue.branchId === query.branchId) && (!query.assetId || issue.assetId === query.assetId) && (!query.status || issue.status === query.status) && this.branchIsVisible(issue.branchId)).map((issue) => ({ ...issue }));
    });
  }

  upsertEquipmentWorkOrder(input: T.UpsertEquipmentWorkOrderInput): Promise<T.EquipmentWorkOrder> {
    return this.respond(() => {
      this.requireOperationsWrite();
      const branch = this.operationsBranch(input.branchId);
      const asset = this.db.equipmentAssets.find((candidate) => candidate.id === input.assetId && candidate.branchId === branch.id);
      if (!asset) throw ApiError.of(ERR.NOT_FOUND, "Equipment asset not found.");
      const issue = input.issueId ? this.db.equipmentIssues.find((candidate) => candidate.id === input.issueId && candidate.assetId === asset.id) : undefined;
      if (input.issueId && !issue) throw ApiError.of(ERR.NOT_FOUND, "Equipment issue not found for this asset.");
      const assigneeId = input.assigneeId?.trim() || undefined;
      if (assigneeId) {
        const assignee = this.db.users.find((user) => user.id === assigneeId && user.status !== "deactivated" && (user.branchScope === "all" || user.branchIds.includes(branch.id)));
        if (!assignee) throw ApiError.of(ERR.NOT_FOUND, "Assignee not found for this branch.");
      }
      const description = input.description.trim();
      if (!description || description.length > 240) throw ApiError.of(ERR.VALIDATION, "Work-order description must be between 1 and 240 characters.");
      const costs = [input.partsCost, input.laborCost, input.replacementEstimate].filter(Boolean) as T.Money[];
      if (!MOCK_EQUIPMENT_WORK_ORDER_STATUSES.includes(input.status ?? "draft") || costs.some((cost) => cost.amount < 0 || !Number.isSafeInteger(cost.amount) || cost.currency !== this.db.organization.currency)) throw ApiError.of(ERR.VALIDATION, "Work-order fields are invalid.");
      const existing = input.id ? this.db.equipmentWorkOrders.find((order) => order.id === input.id) : undefined;
      if (input.id && (!existing || existing.assetId !== asset.id)) throw ApiError.of(ERR.NOT_FOUND, "Work order not found.");
      const status = input.status ?? existing?.status ?? "draft";
      if (existing && input.status !== undefined && input.status !== existing.status && !(
        (existing.status === "draft" && ["approved", "cancelled"].includes(input.status)) ||
        (existing.status === "approved" && ["in_progress", "cancelled"].includes(input.status)) ||
        (existing.status === "in_progress" && ["completed", "cancelled"].includes(input.status))
      )) throw ApiError.of(ERR.CONFLICT, `A work order cannot move from ${existing.status} to ${input.status}.`);
      const immutableStatus = existing ? this.immutableAccountingStatus("equipment_repair", existing.id) : undefined;
      const issueId = immutableStatus && input.issueId === undefined ? existing?.issueId : issue?.id;
      const partsCost = immutableStatus && input.partsCost === undefined ? existing?.partsCost : input.partsCost;
      const laborCost = immutableStatus && input.laborCost === undefined ? existing?.laborCost : input.laborCost;
      const totalCost = immutableStatus && input.partsCost === undefined && input.laborCost === undefined
        ? existing?.totalCost
        : input.partsCost || input.laborCost ? money((partsCost?.amount ?? 0) + (laborCost?.amount ?? 0), this.db.organization.currency) : undefined;
      const replacementEstimate = immutableStatus && input.replacementEstimate === undefined ? existing?.replacementEstimate : input.replacementEstimate;
      const completedAt = immutableStatus && input.status === undefined
        ? existing?.completedAt
        : status === "completed" ? existing?.completedAt ?? nowISO() : undefined;
      if (existing && immutableStatus && (
        branch.id !== existing.branchId ||
        asset.id !== existing.assetId ||
        issueId !== existing.issueId ||
        status !== existing.status ||
        completedAt !== existing.completedAt ||
        partsCost?.amount !== existing.partsCost?.amount ||
        partsCost?.currency !== existing.partsCost?.currency ||
        laborCost?.amount !== existing.laborCost?.amount ||
        laborCost?.currency !== existing.laborCost?.currency ||
        totalCost?.amount !== existing.totalCost?.amount ||
        totalCost?.currency !== existing.totalCost?.currency ||
        replacementEstimate?.amount !== existing.replacementEstimate?.amount ||
        replacementEstimate?.currency !== existing.replacementEstimate?.currency
      )) {
        this.rejectImmutableAccountingMutation("This equipment work order", immutableStatus);
      }
      const now = nowISO();
      const order: T.EquipmentWorkOrder = existing ? Object.assign(existing, { ...input, id: existing.id, organizationId: this.db.organization.id, branchId: branch.id, assetId: asset.id, issueId, status, description, assigneeId, totalCost, partsCost, laborCost, replacementEstimate, financialPostingStatus: existing.financialPostingStatus ?? "not_posted", financialSourceId: existing.financialSourceId, completedAt, updatedAt: now }) : { id: mockUuid(), organizationId: this.db.organization.id, branchId: branch.id, assetId: asset.id, issueId: issue?.id, status, description, assigneeId, vendorName: input.vendorName?.trim() || undefined, partsCost: input.partsCost, laborCost: input.laborCost, totalCost, replacementEstimate, financialPostingStatus: "not_posted", openedAt: now, completedAt: status === "completed" ? now : undefined, updatedAt: now };
      if (!existing) this.db.equipmentWorkOrders.unshift(order);
      this.audit({ category: "operations", action: existing ? "operations.equipment_work_order.update" : "operations.equipment_work_order.create", entityType: "equipment_work_order", entityId: order.id, entityLabel: order.description, summary: existing ? "Equipment work order updated" : "Equipment work order created", branchId: branch.id });
      return { ...order, partsCost: order.partsCost ? { ...order.partsCost } : undefined, laborCost: order.laborCost ? { ...order.laborCost } : undefined, totalCost: order.totalCost ? { ...order.totalCost } : undefined, replacementEstimate: order.replacementEstimate ? { ...order.replacementEstimate } : undefined };
    });
  }

  listEquipmentWorkOrders(query: { branchId?: T.UUID; assetId?: T.UUID; status?: T.EquipmentWorkOrder["status"] } = {}): Promise<T.EquipmentWorkOrder[]> {
    return this.respond(() => {
      this.requireOperationsRead();
      if (query.branchId) this.operationsBranch(query.branchId);
      return this.db.equipmentWorkOrders.filter((order) => (!query.branchId || order.branchId === query.branchId) && (!query.assetId || order.assetId === query.assetId) && (!query.status || order.status === query.status) && this.branchIsVisible(order.branchId)).map((order) => ({ ...order, partsCost: order.partsCost ? { ...order.partsCost } : undefined, laborCost: order.laborCost ? { ...order.laborCost } : undefined, totalCost: order.totalCost ? { ...order.totalCost } : undefined, replacementEstimate: order.replacementEstimate ? { ...order.replacementEstimate } : undefined }));
    });
  }

  getEquipmentRecommendation(assetId: T.UUID): Promise<T.EquipmentRecommendation> {
    return this.respond(() => {
      this.requireOperationsRead();
      const asset = this.db.equipmentAssets.find((candidate) => candidate.id === assetId && this.branchIsVisible(candidate.branchId));
      if (!asset) throw ApiError.of(ERR.NOT_FOUND, "Equipment asset not found.");
      const issues = this.db.equipmentIssues.filter((issue) => issue.assetId === asset.id);
      const relevantIssues = issues.filter((issue) => issue.status !== "cancelled");
      const orders = this.db.equipmentWorkOrders.filter((order) => order.assetId === asset.id);
      const repairOrders = orders.filter((order) => order.status === "completed" && order.financialPostingStatus !== "reversed").sort((left, right) => left.openedAt.localeCompare(right.openedAt) || left.id.localeCompare(right.id));
      const repairCostMinor = repairOrders.reduce((sum, order) => sum + (order.totalCost?.amount ?? 0), 0);
      const replacement = orders.filter((order) => order.status !== "cancelled" && order.financialPostingStatus !== "reversed" && order.replacementEstimate).sort((left, right) => left.openedAt.localeCompare(right.openedAt) || left.id.localeCompare(right.id)).at(-1);
      const downtimeDays = relevantIssues.reduce((sum, issue) => sum + (issue.downtimeDays ?? 0), 0);
      const ageMonths = asset.purchaseDate ? Math.max(0, Math.floor((Date.now() - Date.parse(asset.purchaseDate)) / (30.44 * 86_400_000))) : undefined;
      const rationale: string[] = [];
      if (!repairCostMinor) rationale.push("No recorded repair cost is available.");
      if (!replacement?.replacementEstimate) rationale.push("No recorded replacement estimate is available.");
      if (!asset.purchaseDate) rationale.push("Purchase date is not recorded, so age cannot be assessed.");
      if (!asset.expectedUsefulLifeMonths) rationale.push("Expected useful life is not recorded.");
      const safetyIssue = relevantIssues.some((issue) => issue.status !== "resolved" && issue.safetyStatus === "out_of_service");
      let decision: T.EquipmentRecommendation["decision"] = "insufficient_data";
      if (repairCostMinor > 0 && replacement?.replacementEstimate && asset.purchaseDate && asset.expectedUsefulLifeMonths) decision = ageMonths! >= asset.expectedUsefulLifeMonths || repairCostMinor >= replacement.replacementEstimate.amount * 0.6 || safetyIssue ? "replace" : "fix";
      return { assetId: asset.id, decision, confidence: "recorded_inputs_only", repairCost: repairCostMinor ? money(repairCostMinor, this.db.organization.currency) : undefined, replacementEstimate: replacement?.replacementEstimate ? { ...replacement.replacementEstimate } : undefined, issueCount: relevantIssues.length, downtimeDays, assetAgeMonths: ageMonths, expectedUsefulLifeMonths: asset.expectedUsefulLifeMonths, rationale };
    });
  }

  listUsers(query: UserListQuery): Promise<T.Page<T.StaffUser>> {
    return this.respond(() => {
      let items = [...this.db.users];
      if (query.role) items = items.filter((u) => u.role === query.role);
      if (query.status) items = items.filter((u) => u.status === query.status);
      items = items.filter((u) => this.matchesSearch([u.name, u.email, u.phone], query.search));
      items = applySort(items, query.sort ?? "name", (u, k) => (k === "name" ? u.name : u.role));
      return paginate(this.maybeEmpty(items), query);
    });
  }

  inviteUser(input: T.InviteUserInput): Promise<T.StaffUser> {
    return this.respond(() => {
      this.require("users.manage");
      if (input.role === "owner" && currentRole(this.db) !== "owner") throw ApiError.of(ERR.FORBIDDEN, "Only an owner can grant the owner role.");
      const targetPermissions = permissionsFor(this.db, input.role);
      if (targetPermissions.some((permission) => !permissionsFor(this.db, currentRole(this.db)).includes(permission))) {
        throw ApiError.of(ERR.FORBIDDEN, "You cannot grant permissions your role does not possess.");
      }
      const user: T.StaffUser = {
        id: mockUuid(),
        organizationId: this.db.organization.id,
        name: input.name,
        email: input.email,
        phone: input.phone ?? "",
        role: input.role,
        branchScope: input.branchScope,
        branchIds: input.branchIds,
        status: "invited",
        invitedAt: nowISO(),
      };
      this.db.users.push(user);
      this.audit({
        category: "users",
        action: "user.invite",
        entityType: "user",
        entityId: user.id,
        entityLabel: user.name,
        summary: `Invited as ${input.role}`,
      });
      return user;
    });
  }

  updateUserAccess(userId: T.UUID, input: T.UpdateUserAccessInput): Promise<T.StaffUser> {
    return this.respond(() => {
      this.require("users.manage");
      const user = this.db.users.find((u) => u.id === userId);
      if (!user) throw ApiError.of(ERR.NOT_FOUND, "User not found.");
      if (user.id === this.actor().id && input.status === "deactivated") {
        throw ApiError.of(ERR.VALIDATION, "You cannot deactivate your own account.");
      }
      const nextRole = input.role ?? user.role;
      if (nextRole === "owner" && currentRole(this.db) !== "owner") throw ApiError.of(ERR.FORBIDDEN, "Only an owner can grant the owner role.");
      const actorPermissions = permissionsFor(this.db, currentRole(this.db));
      if (nextRole !== user.role && permissionsFor(this.db, nextRole).some((permission) => !actorPermissions.includes(permission))) {
        throw ApiError.of(ERR.FORBIDDEN, "You cannot grant permissions your role does not possess.");
      }
      const before = { role: user.role, status: user.status, branches: user.branchIds.length };
      Object.assign(user, input);
      this.audit({
        category: "users",
        action: input.status === "deactivated" ? "user.deactivate" : "user.access_update",
        entityType: "user",
        entityId: user.id,
        entityLabel: user.name,
        summary: input.status === "deactivated" ? "Account deactivated" : "Access updated",
        reason: input.status === "deactivated" ? "Deactivated by administrator" : undefined,
        before,
        after: { role: user.role, status: user.status, branches: user.branchIds.length },
      });
      return user;
    });
  }

  updateRolePermissions(role: T.RoleKey, input: T.UpdateRolePermissionsInput): Promise<T.RoleDefinition> {
    return this.respond(() => {
      this.require("users.manage");
      const def = this.db.roles.find((r) => r.key === role);
      if (!def) throw ApiError.of(ERR.NOT_FOUND, "Role not found.");
      if (role === "owner") throw ApiError.of(ERR.VALIDATION, "The owner role always has full access.");
      const before = { permissions: def.permissions.length, discountLimit: def.discountLimitMinor };
      const requestedPermissions = input.permissions ?? effectiveRolePermissions(role, def.permissions, def.catalogVersion);
      const invalidPermissions = requestedPermissions.filter((permission) => !PERMISSIONS.includes(permission as Permission));
      if (invalidPermissions.length > 0) throw ApiError.of(ERR.VALIDATION, "One or more permissions are not recognized.");
      const actorPermissions = permissionsFor(this.db, currentRole(this.db));
      if (requestedPermissions.some((permission) => !actorPermissions.includes(permission))) throw ApiError.of(ERR.FORBIDDEN, "You cannot grant permissions your role does not possess.");
      def.permissions = requestedPermissions;
      def.catalogVersion = PERMISSION_CATALOG_VERSION;
      if (input.discountLimitMinor !== undefined) def.discountLimitMinor = input.discountLimitMinor;
      this.audit({
        category: "users",
        action: "role.permissions_change",
        entityType: "role",
        entityId: this.db.users.find((u) => u.role === role)?.id ?? this.db.organization.id,
        entityLabel: def.label,
        summary: `Permissions updated for the ${def.label} role`,
        before,
        after: { permissions: def.permissions.length, discountLimit: def.discountLimitMinor },
      });
      return def;
    });
  }
}
