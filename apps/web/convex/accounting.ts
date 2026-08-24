import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertBranchAccess,
  domainError,
  publicBranchId,
  publicOrganizationId,
  publicUserId,
  requirePermission,
  requireReason,
  type ActorContext,
} from "./security";
import { requireWorkspaceModule, resolveWorkspaceEntitlements, resolveWorkspacePreferences } from "./workspaceModules";
import { inspectLedgerBalance, manualJournalRequestFingerprint, reversalRequestFingerprint, sourcePostingIdempotencyKey } from "./accountingLedger";
import { platformPlanEntitledModules } from "./platformPlanCatalog";

type ReadContext = QueryCtx | MutationCtx;
type Account = Doc<"accountingAccounts">;
type Period = Doc<"accountingPeriods">;
type Policy = Doc<"accountingPostingPolicies">;
type JournalEntry = Doc<"accountingJournalEntries">;
type JournalLine = Doc<"accountingJournalLines">;
type SourcePosting = Doc<"accountingSourcePostings">;
type PostingAttempt = Doc<"accountingPostingAttempts">;
type DomainRecord = Doc<"domainRecords">;
type JsonRecord = Record<string, unknown>;
type SourceDecisionStatus = Extract<PostingStatus, "unconfigured" | "excluded">;

export type AccountingSourceType =
  | "payment"
  | "refund"
  | "void"
  | "membership_sale"
  | "membership_renewal"
  | "purchase_order_receipt"
  | "stock_movement"
  | "facility_supplies"
  | "equipment_acquisition"
  | "equipment_repair";

type PostingStatus = "pending" | "posted" | "unconfigured" | "excluded" | "failed" | "reversed";
type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
type StatementGroup =
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
type CashflowGroup = "operating" | "investing" | "financing" | "non_cash";

export interface AccountDefinition {
  code: string;
  name: string;
  nameAr?: string;
  accountType: AccountType;
  statementGroup: StatementGroup;
  cashflowGroup: CashflowGroup;
  normalBalance: "debit" | "credit";
}

/**
 * The chart is deliberately small and code-owned. Gyms can use the metadata
 * immediately, while a later accounting configuration release can add
 * jurisdiction-specific accounts without letting arbitrary account codes
 * enter the posting path.
 */
export const DEFAULT_ACCOUNT_DEFINITIONS: readonly AccountDefinition[] = [
  { code: "1100", name: "Cash on hand", accountType: "asset", statementGroup: "asset_current", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "1110", name: "Card clearing", accountType: "asset", statementGroup: "asset_current", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "1120", name: "Bank transfer clearing", accountType: "asset", statementGroup: "asset_current", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "1200", name: "Accounts receivable", accountType: "asset", statementGroup: "asset_current", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "1300", name: "Inventory", accountType: "asset", statementGroup: "asset_current", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "1500", name: "Gym equipment", accountType: "asset", statementGroup: "asset_noncurrent", cashflowGroup: "investing", normalBalance: "debit" },
  { code: "2100", name: "Supplier payables", accountType: "liability", statementGroup: "liability_current", cashflowGroup: "operating", normalBalance: "credit" },
  { code: "2200", name: "Deferred membership revenue", accountType: "liability", statementGroup: "liability_current", cashflowGroup: "operating", normalBalance: "credit" },
  { code: "3000", name: "Owner equity", accountType: "equity", statementGroup: "equity", cashflowGroup: "financing", normalBalance: "credit" },
  { code: "4100", name: "Membership revenue", accountType: "revenue", statementGroup: "revenue", cashflowGroup: "operating", normalBalance: "credit" },
  { code: "5100", name: "Cost of supplies and inventory", accountType: "expense", statementGroup: "cost_of_sales", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "5200", name: "Repairs and maintenance", accountType: "expense", statementGroup: "operating_expense", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "5300", name: "Facility supplies", accountType: "expense", statementGroup: "operating_expense", cashflowGroup: "operating", normalBalance: "debit" },
  { code: "5900", name: "Other operating expense", accountType: "expense", statementGroup: "operating_expense", cashflowGroup: "operating", normalBalance: "debit" },
];

interface PolicyDefinition {
  policyCode: string;
  sourceType: AccountingSourceType;
  version: number;
  debitAccountCode: string;
  creditAccountCode: string;
  recognition: "immediate" | "deferred" | "excluded";
}

export const DEFAULT_ACCOUNTING_POLICIES: readonly PolicyDefinition[] = [
  { policyCode: "membership-sale.v1", sourceType: "membership_sale", version: 1, debitAccountCode: "1200", creditAccountCode: "2200", recognition: "deferred" },
  { policyCode: "membership-renewal.v1", sourceType: "membership_renewal", version: 1, debitAccountCode: "1200", creditAccountCode: "2200", recognition: "deferred" },
  { policyCode: "payment-cash.v1", sourceType: "payment", version: 1, debitAccountCode: "1100", creditAccountCode: "1200", recognition: "immediate" },
  { policyCode: "payment-card.v1", sourceType: "payment", version: 1, debitAccountCode: "1110", creditAccountCode: "1200", recognition: "immediate" },
  { policyCode: "payment-bank-transfer.v1", sourceType: "payment", version: 1, debitAccountCode: "1120", creditAccountCode: "1200", recognition: "immediate" },
  { policyCode: "payment-cliq.v1", sourceType: "payment", version: 1, debitAccountCode: "1120", creditAccountCode: "1200", recognition: "immediate" },
  { policyCode: "payment-other.v1", sourceType: "payment", version: 1, debitAccountCode: "1100", creditAccountCode: "1200", recognition: "immediate" },
  { policyCode: "refund-cash.v1", sourceType: "refund", version: 1, debitAccountCode: "1200", creditAccountCode: "1100", recognition: "immediate" },
  { policyCode: "refund-card.v1", sourceType: "refund", version: 1, debitAccountCode: "1200", creditAccountCode: "1110", recognition: "immediate" },
  { policyCode: "refund-bank-transfer.v1", sourceType: "refund", version: 1, debitAccountCode: "1200", creditAccountCode: "1120", recognition: "immediate" },
  { policyCode: "refund-cliq.v1", sourceType: "refund", version: 1, debitAccountCode: "1200", creditAccountCode: "1120", recognition: "immediate" },
  { policyCode: "refund-other.v1", sourceType: "refund", version: 1, debitAccountCode: "1200", creditAccountCode: "1100", recognition: "immediate" },
  { policyCode: "void-cash.v1", sourceType: "void", version: 1, debitAccountCode: "1200", creditAccountCode: "1100", recognition: "immediate" },
  { policyCode: "void-card.v1", sourceType: "void", version: 1, debitAccountCode: "1200", creditAccountCode: "1110", recognition: "immediate" },
  { policyCode: "void-bank-transfer.v1", sourceType: "void", version: 1, debitAccountCode: "1200", creditAccountCode: "1120", recognition: "immediate" },
  { policyCode: "void-cliq.v1", sourceType: "void", version: 1, debitAccountCode: "1200", creditAccountCode: "1120", recognition: "immediate" },
  { policyCode: "void-other.v1", sourceType: "void", version: 1, debitAccountCode: "1200", creditAccountCode: "1100", recognition: "immediate" },
  { policyCode: "purchase-order-receipt.v1", sourceType: "purchase_order_receipt", version: 1, debitAccountCode: "1300", creditAccountCode: "2100", recognition: "immediate" },
  { policyCode: "stock-receive.v1", sourceType: "stock_movement", version: 1, debitAccountCode: "1300", creditAccountCode: "2100", recognition: "immediate" },
  { policyCode: "stock-consume.v1", sourceType: "stock_movement", version: 1, debitAccountCode: "5100", creditAccountCode: "1300", recognition: "immediate" },
  { policyCode: "facility-supplies.v1", sourceType: "facility_supplies", version: 1, debitAccountCode: "5300", creditAccountCode: "2100", recognition: "immediate" },
  { policyCode: "equipment-acquisition.v1", sourceType: "equipment_acquisition", version: 1, debitAccountCode: "1500", creditAccountCode: "2100", recognition: "immediate" },
  { policyCode: "equipment-repair.v1", sourceType: "equipment_repair", version: 1, debitAccountCode: "5200", creditAccountCode: "2100", recognition: "immediate" },
];

function objectValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(canonicalJson(item))));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted = Object.keys(record).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = record[key];
      return result;
    }, {});
    return JSON.stringify(sorted, (_key, nested) => {
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        const nestedRecord = nested as Record<string, unknown>;
        return Object.keys(nestedRecord).sort().reduce<Record<string, unknown>>((result, key) => {
          result[key] = nestedRecord[key];
          return result;
        }, {});
      }
      return nested;
    });
  }
  return JSON.stringify(value);
}

function sourcePostingRequestFingerprint(input: { sourceType: AccountingSourceType; sourcePublicId: string; idempotencyKey: string; reason?: string }): string {
  return canonicalJson({ sourceType: input.sourceType, sourcePublicId: input.sourcePublicId, idempotencyKey: input.idempotencyKey, reason: input.reason?.trim() ?? "" });
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalText(value: unknown): string | undefined {
  const trimmed = text(value).trim();
  return trimmed || undefined;
}

function integer(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function dateOnly(value: unknown, fallback = new Date().toISOString().slice(0, 10)): string {
  const raw = text(value).trim();
  if (!raw) return fallback;
  const candidate = raw.slice(0, 10);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? new Date(`${candidate}T00:00:00.000Z`) : undefined;
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate) {
    domainError("VALIDATION_ERROR", "Posting date must use a real YYYY-MM-DD calendar date.");
  }
  return candidate;
}

function localDate(timestamp: number, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // UTC is a safe fallback for a malformed tenant timezone.
  }
  return new Date(timestamp).toISOString().slice(0, 10);
}

function periodBounds(periodId: string): { start: string; end: string } {
  if (!/^\d{4}-\d{2}$/.test(periodId)) domainError("VALIDATION_ERROR", "Accounting period must use YYYY-MM format.");
  const [year = 0, month = 0] = periodId.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month - 1) domainError("VALIDATION_ERROR", "Accounting period is invalid.");
  const end = new Date(Date.UTC(year, month, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

async function requireFinance(ctx: ReadContext, actor: ActorContext): Promise<void> {
  const entitlement = await ctx.db.query("organizationEntitlements").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).unique();
  const preference = await ctx.db.query("workspaceModulePreferences").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).unique();
  const catalogSelection = await platformPlanEntitledModules(ctx, actor.organization.subscriptionPlan);
  const entitlements = resolveWorkspaceEntitlements(actor.organization.subscriptionPlan, entitlement ? {
    subscriptionPlan: entitlement.subscriptionPlan,
    entitledModules: entitlement.entitledModules,
    source: entitlement.source,
    updatedAt: entitlement.updatedAt,
  } : undefined, catalogSelection);
  const preferences = resolveWorkspacePreferences(entitlements.entitledModules, preference ? {
    enabledModules: preference.enabledModules,
    updatedAt: preference.updatedAt,
  } : undefined);
  try {
    requireWorkspaceModule("finance", { entitledModules: entitlements.entitledModules, enabledModules: preferences.enabledModules });
  } catch {
    domainError("FEATURE_NOT_AVAILABLE", "The finance workspace module is not enabled for this organization.", { correlationId: actor.correlationId, details: { module: "finance" } });
  }
}

function requireRead(actor: ActorContext): void {
  requirePermission(actor, "reports.financial.read");
}

function requireOwner(actor: ActorContext): void {
  if (actor.role !== "owner") domainError("FORBIDDEN", "Only the organization owner can perform this accounting action.", { correlationId: actor.correlationId });
}

function requirePostingRole(actor: ActorContext): void {
  requirePermission(actor, "accounting.post");
  if (actor.role !== "owner" && actor.role !== "manager") domainError("FORBIDDEN", "Only an organization owner or manager can post operational accounting facts.", { correlationId: actor.correlationId });
}

async function branchByPublicId(ctx: ReadContext, actor: ActorContext, branchPublicId: string | undefined): Promise<Doc<"branches"> | undefined> {
  if (!branchPublicId) return undefined;
  const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", branchPublicId)).unique();
  assertBranchAccess(actor, branch);
  return branch;
}

async function branchById(ctx: ReadContext, actor: ActorContext, branchId: Id<"branches">): Promise<Doc<"branches">> {
  const branch = await ctx.db.get(branchId);
  assertBranchAccess(actor, branch);
  return branch;
}

export async function seedAccountingMetadata(ctx: MutationCtx, organizationId: Id<"organizations">, now = Date.now()): Promise<{ accounts: Account[]; policies: Policy[] }> {
  const accounts = await ctx.db.query("accountingAccounts").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
  for (const definition of DEFAULT_ACCOUNT_DEFINITIONS) {
    if (accounts.some((account) => account.code === definition.code)) continue;
    const id = await ctx.db.insert("accountingAccounts", {
      organizationId,
      publicId: `acct-${definition.code}`,
      ...definition,
      active: true,
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    });
    const inserted = await ctx.db.get(id);
    if (inserted) accounts.push(inserted);
  }
  const policies = await ctx.db.query("accountingPostingPolicies").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).collect();
  for (const definition of DEFAULT_ACCOUNTING_POLICIES) {
    if (policies.some((policy) => policy.policyCode === definition.policyCode && policy.version === definition.version)) continue;
    const id = await ctx.db.insert("accountingPostingPolicies", {
      organizationId,
      publicId: `policy-${definition.policyCode}`,
      ...definition,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const inserted = await ctx.db.get(id);
    if (inserted) policies.push(inserted);
  }
  return { accounts, policies };
}

async function ensureMetadata(ctx: MutationCtx, actor: ActorContext): Promise<{ accounts: Account[]; policies: Policy[] }> {
  return await seedAccountingMetadata(ctx, actor.organization._id);
}

function accountView(account: Account, organizationId: string): JsonRecord {
  return {
    id: account.publicId,
    organizationId,
    code: account.code,
    name: account.name,
    nameAr: account.nameAr,
    accountType: account.accountType,
    statementGroup: account.statementGroup,
    cashflowGroup: account.cashflowGroup,
    normalBalance: account.normalBalance,
    active: account.active,
    isSystem: account.isSystem,
    createdAt: iso(account.createdAt),
    updatedAt: iso(account.updatedAt),
  };
}

function periodView(period: Period, organizationId: string): JsonRecord {
  return {
    id: period.publicId,
    organizationId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    status: period.status,
    closedAt: period.closedAt ? iso(period.closedAt) : undefined,
    closedById: period.closedByUserId ? String(period.closedByUserId) : undefined,
    closeReason: period.closeReason,
    reopenedAt: period.reopenedAt ? iso(period.reopenedAt) : undefined,
    reopenedById: period.reopenedByUserId ? String(period.reopenedByUserId) : undefined,
    reopenReason: period.reopenReason,
    createdAt: iso(period.createdAt),
    updatedAt: iso(period.updatedAt),
  };
}

function policyDefinition(policyCode: string): PolicyDefinition | undefined {
  return DEFAULT_ACCOUNTING_POLICIES.find((policy) => policy.policyCode === policyCode);
}

async function policyByCode(ctx: ReadContext, actor: ActorContext, policyCode: string): Promise<Policy | undefined> {
  const policy = await ctx.db.query("accountingPostingPolicies").withIndex("by_organization_code", (q) => q.eq("organizationId", actor.organization._id).eq("policyCode", policyCode)).collect();
  return policy.find((candidate) => candidate.status === "active" && candidate.version === Math.max(...policy.map((item) => item.version))) ?? policy.find((candidate) => candidate.status === "active");
}

async function periodForDate(ctx: ReadContext, actor: ActorContext, postingDate: string): Promise<Period | undefined> {
  const id = postingDate.slice(0, 7);
  const period = await ctx.db.query("accountingPeriods").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", id)).unique();
  return period ?? undefined;
}

async function ensureOpenPeriod(ctx: MutationCtx, actor: ActorContext, postingDate: string): Promise<Period> {
  const id = postingDate.slice(0, 7);
  const existing = await periodForDate(ctx, actor, postingDate);
  if (existing) {
    if (existing.status !== "open") domainError("CONFLICT", "The accounting period is closed.", { correlationId: actor.correlationId, details: { periodId: existing.publicId } });
    return existing;
  }
  const bounds = periodBounds(id);
  const now = Date.now();
  const periodId = await ctx.db.insert("accountingPeriods", {
    organizationId: actor.organization._id,
    publicId: id,
    periodStart: bounds.start,
    periodEnd: bounds.end,
    status: "open",
    createdAt: now,
    updatedAt: now,
  });
  const period = await ctx.db.get(periodId);
  if (!period) domainError("INTERNAL_ERROR", "Accounting period could not be created.", { correlationId: actor.correlationId });
  return period;
}

function page<T>(items: T[], input: JsonRecord): JsonRecord {
  const requestedPage = integer(input.page) ?? 1;
  const requestedSize = integer(input.pageSize) ?? 25;
  const pageNumber = Math.max(1, requestedPage);
  const pageSize = Math.min(100, Math.max(1, requestedSize));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const start = (pageNumber - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: pageNumber, pageSize, totalItems, totalPages };
}

async function accountByPublicId(ctx: ReadContext, actor: ActorContext, publicId: string): Promise<Account> {
  const byPublicId = await ctx.db.query("accountingAccounts").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", publicId)).unique();
  const account = byPublicId ?? await ctx.db.query("accountingAccounts").withIndex("by_organization_code", (q) => q.eq("organizationId", actor.organization._id).eq("code", publicId.startsWith("acct-") ? publicId.slice(5) : publicId)).unique();
  if (!account || !account.active) domainError("NOT_FOUND", `Accounting account ${publicId} is not configured.`, { correlationId: actor.correlationId });
  return account;
}

/**
 * Financial records without a branch are consolidated/unattributed records.
 * They may be read only by an actor whose scope is explicitly organization-wide.
 * Do not use the general branch predicate here: that predicate intentionally
 * treats an omitted branch as visible for non-financial workflows, while an
 * omitted branch on a ledger row can disclose organization-wide amounts.
 */
function accountingRecordVisible(actor: ActorContext, branchId?: Id<"branches">): boolean {
  return actor.branchScope === "all" || Boolean(branchId && actor.branchIds.includes(branchId));
}

function requireAccountingRecordVisible(actor: ActorContext, branchId?: Id<"branches">): void {
  if (!accountingRecordVisible(actor, branchId)) domainError("NOT_FOUND", "Accounting record not found.", { correlationId: actor.correlationId });
}

function sourceView(row: SourcePosting, organizationId: string, branchPublicId?: string): JsonRecord {
  return {
    id: row.publicId,
    organizationId,
    sourceType: row.sourceType,
    sourceId: row.sourcePublicId,
    branchId: branchPublicId,
    status: row.status,
    amount: row.amountMinor === undefined ? undefined : { amount: row.amountMinor, currency: row.currency },
    currency: row.currency,
    policyCode: row.policyCode,
    policyVersion: row.policyVersion,
    journalEntryId: row.journalEntryPublicId,
    idempotencyKey: row.idempotencyKey,
    reason: row.reason,
    details: row.details,
    occurredAt: iso(row.occurredAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

async function sourcePostingAttemptView(ctx: ReadContext, actor: ActorContext, attempt: PostingAttempt): Promise<JsonRecord> {
  requireAccountingRecordVisible(actor, attempt.branchId);
  const branch = attempt.branchId ? await branchById(ctx, actor, attempt.branchId) : undefined;
  return {
    id: attempt.sourcePostingPublicId ?? attempt.publicId,
    organizationId: publicOrganizationId(actor.organization),
    sourceType: attempt.sourceType,
    sourceId: attempt.sourcePublicId,
    branchId: branch ? publicBranchId(branch) : undefined,
    status: attempt.status,
    amount: attempt.amountMinor === undefined ? undefined : { amount: attempt.amountMinor, currency: attempt.currency },
    currency: attempt.currency,
    policyCode: attempt.policyCode,
    policyVersion: attempt.policyVersion,
    journalEntryId: undefined,
    idempotencyKey: attempt.idempotencyKey,
    reason: attempt.reason,
    details: attempt.details,
    occurredAt: iso(attempt.occurredAt),
    createdAt: iso(attempt.createdAt),
    updatedAt: iso(attempt.updatedAt),
  };
}

async function sourcePostingAttemptByKey(ctx: ReadContext, actor: ActorContext, sourceType: AccountingSourceType, sourcePublicId: string, idempotencyKey: string): Promise<PostingAttempt | undefined> {
  return (await ctx.db.query("accountingPostingAttempts").withIndex("by_organization_source_key", (q) => q.eq("organizationId", actor.organization._id).eq("sourceType", sourceType).eq("sourcePublicId", sourcePublicId).eq("idempotencyKey", idempotencyKey)).unique()) ?? undefined;
}

async function journalLineView(ctx: ReadContext, actor: ActorContext, line: JournalLine): Promise<JsonRecord> {
  const branch = line.branchId ? await branchById(ctx, actor, line.branchId) : undefined;
  const account = await ctx.db.get(line.accountId);
  return {
    id: line.publicId,
    journalEntryId: String(line.journalEntryId),
    branchId: branch ? publicBranchId(branch) : undefined,
    accountId: account?.publicId ?? String(line.accountId),
    accountCode: line.accountCode,
    accountName: line.accountName,
    debit: { amount: line.debitMinor, currency: actor.organization.currency },
    credit: { amount: line.creditMinor, currency: actor.organization.currency },
    description: line.description,
    statementGroup: line.statementGroup,
    cashflowGroup: line.cashflowGroup,
  };
}

async function journalEntryView(ctx: ReadContext, actor: ActorContext, entry: JournalEntry): Promise<JsonRecord> {
  requireAccountingRecordVisible(actor, entry.branchId);
  const branch = entry.branchId ? await branchById(ctx, actor, entry.branchId) : undefined;
  const createdBy = await ctx.db.get(entry.createdByUserId);
  const lines = await ctx.db.query("accountingJournalLines").withIndex("by_entry", (q) => q.eq("organizationId", actor.organization._id).eq("journalEntryId", entry._id)).collect();
  return {
    id: entry.publicId,
    organizationId: publicOrganizationId(actor.organization),
    branchId: branch ? publicBranchId(branch) : undefined,
    scope: entry.scope,
    currency: entry.currency,
    postingDate: entry.postingDate,
    periodId: (await ctx.db.get(entry.accountingPeriodId))?.publicId,
    status: entry.status,
    memo: entry.memo,
    reason: entry.reason,
    sourceType: entry.sourceType,
    sourceId: entry.sourcePublicId,
    policyCode: entry.policyCode,
    policyVersion: entry.policyVersion,
    idempotencyKey: entry.idempotencyKey,
    reversalOfEntryId: entry.reversalOfEntryPublicId,
    reversedByEntryId: entry.reversedByEntryPublicId,
    createdById: createdBy ? publicUserId(createdBy) : String(entry.createdByUserId),
    createdAt: iso(entry.createdAt),
    postedAt: iso(entry.postedAt),
    lines: await Promise.all(lines.map((line) => journalLineView(ctx, actor, line))),
  };
}

async function sourceBranchForRecord(ctx: ReadContext, actor: ActorContext, record: DomainRecord): Promise<{ branch?: Doc<"branches">; branchPublicId?: string }> {
  if (!record.branchId) {
    const branchPublic = optionalText(objectValue(record.data).branchId) ?? optionalText(objectValue(record.data).homeBranchId);
    const branch = await branchByPublicId(ctx, actor, branchPublic);
    return { branch, branchPublicId: branch ? publicBranchId(branch) : undefined };
  }
  const branch = await branchById(ctx, actor, record.branchId);
  return { branch, branchPublicId: branch ? publicBranchId(branch) : undefined };
}

interface SourceFact {
  sourceType: AccountingSourceType;
  sourcePublicId: string;
  branch?: Doc<"branches">;
  branchPublicId?: string;
  amountMinor?: number;
  currency: string;
  occurredAt: number;
  memo: string;
  policyCode?: string;
  debitAccountCode?: string;
  creditAccountCode?: string;
  reason?: string;
  details?: JsonRecord;
  status?: Extract<PostingStatus, "unconfigured" | "excluded">;
}

function amountObject(value: unknown): { amount?: number; currency?: string } {
  const item = objectValue(value);
  return { amount: integer(item.amount), currency: optionalText(item.currency)?.toUpperCase() };
}

function paymentAccount(method: string): string {
  if (method === "card") return "1110";
  if (method === "bank_transfer" || method === "cliq") return "1120";
  return "1100";
}

async function domainSource(ctx: ReadContext, actor: ActorContext, entityType: string, sourceId: string): Promise<DomainRecord | undefined> {
  return await ctx.db.query("domainRecords").withIndex("by_organization_type_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", entityType).eq("publicId", sourceId)).unique() ?? undefined;
}

async function sourceFact(ctx: ReadContext, actor: ActorContext, sourceType: AccountingSourceType, sourceId: string): Promise<SourceFact> {
  const currency = actor.organization.currency.toUpperCase();
  if (!sourceId.trim()) domainError("VALIDATION_ERROR", "A source id is required.", { correlationId: actor.correlationId });

  if (["payment", "refund", "void"].includes(sourceType)) {
    const record = await domainSource(ctx, actor, "payment", sourceId);
    if (!record) domainError("NOT_FOUND", "Payment source not found.", { correlationId: actor.correlationId });
    const value = objectValue(record.data);
    const amount = amountObject(value.amount);
    const method = text(value.method, "cash");
    const sourcePaymentType = text(value.type, "payment");
    const sourceStatus = text(value.status);
    const expectedType = sourceType === "payment" ? "payment" : sourceType === "refund" ? "refund" : "payment";
    const sourceBranch = await sourceBranchForRecord(ctx, actor, record);
    const occurredAt = Date.parse(text(value.occurredAt)) || record.createdAt;
    const sourceCurrency = amount.currency ?? currency;
    const invalidCurrency = sourceCurrency !== currency;
    const invalidType = sourcePaymentType !== expectedType || (sourceType === "payment" && sourceStatus === "voided") || (sourceType === "void" && sourceStatus !== "voided");
    const normalizedAmount = amount.amount === undefined ? undefined : sourceType === "refund" ? Math.abs(amount.amount) : amount.amount;
    const invalidAmount = normalizedAmount === undefined || normalizedAmount <= 0;
    const debit = sourceType === "payment" ? paymentAccount(method) : "1200";
    const credit = sourceType === "payment" ? "1200" : paymentAccount(method);
    // Policy codes are code-owned and use a stable hyphenated namespace.
    // Keep the source fact's method mapping explicit so a payment cannot
    // silently fall through to an unconfigured policy because of punctuation.
    const policyCode = `${sourceType}-${method}.v1`;
    return {
      sourceType,
      sourcePublicId: sourceId,
      ...sourceBranch,
      amountMinor: normalizedAmount,
      currency: sourceCurrency,
      occurredAt,
      memo: `${sourceType === "payment" ? "Payment" : sourceType === "refund" ? "Refund" : "Void"} ${sourceId}`,
      policyCode,
      debitAccountCode: debit,
      creditAccountCode: credit,
      details: { method, sourcePaymentType, sourceStatus },
      status: invalidCurrency ? "excluded" : invalidType || invalidAmount ? "unconfigured" : undefined,
      reason: invalidCurrency ? `Source currency ${sourceCurrency} does not match organization currency ${currency}.` : invalidType ? "The source fact does not match the requested accounting source type or lifecycle status." : invalidAmount ? "The source fact has no positive amount." : undefined,
    };
  }

  if (sourceType === "membership_sale" || sourceType === "membership_renewal") {
    const record = await domainSource(ctx, actor, "membership", sourceId);
    if (!record) domainError("NOT_FOUND", "Membership source not found.", { correlationId: actor.correlationId });
    const value = objectValue(record.data);
    const sale = amountObject(value.salePrice);
    const discountPresent = value.discount !== undefined;
    const discount = discountPresent ? amountObject(value.discount) : { amount: 0, currency: sale.currency ?? currency };
    const sourceBranch = await sourceBranchForRecord(ctx, actor, record);
    const previous = optionalText(value.previousMembershipId);
    const invalidLifecycle = Boolean(value.cancelledAt) || (sourceType === "membership_sale" ? Boolean(previous) : !previous);
    const sourceCurrency = sale.currency ?? currency;
    const invalidCurrency = sourceCurrency !== currency || (discount.currency !== undefined && discount.currency !== currency);
    const discountAmount = discount.amount;
    const netAmount = sale.amount !== undefined && discountAmount !== undefined && Number.isSafeInteger(sale.amount - discountAmount) ? sale.amount - discountAmount : undefined;
    const approvalStatus = text(value.discountApprovalStatus, "none");
    const invalidDiscount = discountAmount === undefined || discountAmount < 0 || (sale.amount !== undefined && discountAmount > sale.amount) || approvalStatus === "pending" || approvalStatus === "rejected";
    const invalidAmount = netAmount === undefined || netAmount < 0;
    // Membership start dates describe service delivery. The authoritative
    // accounting fact is when the sale/renewal record was created.
    const occurredAt = record.createdAt;
    return {
      sourceType,
      sourcePublicId: sourceId,
      ...sourceBranch,
      amountMinor: netAmount,
      currency: sourceCurrency,
      occurredAt,
      memo: `${sourceType === "membership_sale" ? "Membership sale" : "Membership renewal"} ${sourceId}`,
      policyCode: sourceType === "membership_sale" ? "membership-sale.v1" : "membership-renewal.v1",
      debitAccountCode: "1200",
      creditAccountCode: "2200",
      details: { previousMembershipId: previous, startDate: optionalText(value.startDate), endDate: optionalText(value.endDate), salePriceMinor: sale.amount, discountMinor: discountAmount, netAmountMinor: netAmount, discountApprovalStatus: approvalStatus },
      status: invalidCurrency ? "excluded" : invalidLifecycle || invalidDiscount || invalidAmount ? "unconfigured" : undefined,
      reason: invalidCurrency ? `Membership currency does not match organization currency ${currency}.` : invalidLifecycle ? "The membership lifecycle does not match the requested sale or renewal source type." : approvalStatus === "pending" ? "A pending membership discount approval cannot be posted." : approvalStatus === "rejected" ? "A rejected membership discount cannot be posted." : invalidDiscount ? "Membership discount is missing, negative, or exceeds the sale price." : invalidAmount ? "Membership sale net amount is not a safe non-negative integer minor-unit amount." : undefined,
    };
  }

  if (sourceType === "purchase_order_receipt") {
    const order = await ctx.db.query("purchaseOrders").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", sourceId)).unique();
    if (!order) domainError("NOT_FOUND", "Purchase order source not found.", { correlationId: actor.correlationId });
    const branch = await branchById(ctx, actor, order.branchId);
    let total = 0;
    let invalidCurrency = order.currency !== currency;
    let received = 0;
    for (const line of order.lines) {
      const quantity = integer(line.receivedQuantity) ?? 0;
      if (quantity <= 0) continue;
      received += quantity;
      if (line.unitCostCurrency !== currency) invalidCurrency = true;
      const lineTotal = quantity * line.unitCostMinor;
      if (!Number.isSafeInteger(lineTotal) || lineTotal <= 0) return { sourceType, sourcePublicId: sourceId, branch, branchPublicId: publicBranchId(branch), currency: line.unitCostCurrency, occurredAt: order.receivedAt ?? order.updatedAt, memo: `Purchase order receipt ${sourceId}`, policyCode: "purchase-order-receipt.v1", debitAccountCode: "1300", creditAccountCode: "2100", status: "unconfigured", reason: "Purchase order receipt cost is not a safe integer minor-unit amount." };
      if (!Number.isSafeInteger(total + lineTotal)) return { sourceType, sourcePublicId: sourceId, branch, branchPublicId: publicBranchId(branch), currency: line.unitCostCurrency, occurredAt: order.receivedAt ?? order.updatedAt, memo: `Purchase order receipt ${sourceId}`, policyCode: "purchase-order-receipt.v1", debitAccountCode: "1300", creditAccountCode: "2100", status: "unconfigured", reason: "Purchase order receipt cost is not a safe integer minor-unit amount." };
      total += lineTotal;
    }
    const fullyReceived = order.status === "received" && order.lines.length > 0 && order.lines.every((line) => line.receivedQuantity >= line.orderedQuantity);
    return {
      sourceType,
      sourcePublicId: sourceId,
      branch,
      branchPublicId: publicBranchId(branch),
      amountMinor: total || undefined,
      currency: order.currency,
      occurredAt: order.receivedAt ?? order.updatedAt,
      memo: `Purchase order receipt ${sourceId}`,
      policyCode: "purchase-order-receipt.v1",
      debitAccountCode: "1300",
      creditAccountCode: "2100",
      details: { status: order.status, receivedLines: received },
      status: invalidCurrency ? "excluded" : order.status === "cancelled" || !fullyReceived || received === 0 || total === 0 ? "unconfigured" : undefined,
      reason: invalidCurrency ? `Purchase order currency does not match organization currency ${currency}.` : order.status === "cancelled" ? "Cancelled purchase orders are excluded from the ledger." : !fullyReceived ? "Purchase order inventory must be fully received before posting." : received === 0 ? "No receiving fact is recorded on this purchase order." : total === 0 ? "Received purchase order cost is zero." : undefined,
    };
  }

  if (sourceType === "stock_movement") {
    const movement = await ctx.db.query("stockMovements").withIndex("by_idempotency", (q) => q.eq("organizationId", actor.organization._id)).collect().then((rows) => rows.find((row) => row.publicId === sourceId));
    if (!movement) domainError("NOT_FOUND", "Stock movement source not found.", { correlationId: actor.correlationId });
    const branch = await branchById(ctx, actor, movement.branchId);
    const unitCost = movement.unitCostMinor;
    const quantity = Math.abs(movement.quantity);
    const amount = unitCost === undefined ? undefined : quantity * unitCost;
    const receive = movement.type === "receive";
    const consumptive = ["sale", "consumption", "waste"].includes(movement.type);
    const policyCode = receive ? "stock-receive.v1" : consumptive ? "stock-consume.v1" : undefined;
    const purchaseOrderLinked = text(movement.referenceType).toLowerCase() === "purchase_order";
    const excludedMovementType = ["return", "transfer_in", "transfer_out", "adjustment"].includes(movement.type);
    const excluded = purchaseOrderLinked || excludedMovementType;
    return {
      sourceType,
      sourcePublicId: sourceId,
      branch,
      branchPublicId: publicBranchId(branch),
      amountMinor: amount,
      currency: movement.unitCostCurrency ?? currency,
      occurredAt: movement.occurredAt,
      memo: `Stock ${movement.type} ${sourceId}`,
      policyCode,
      debitAccountCode: receive ? "1300" : consumptive ? "5100" : undefined,
      creditAccountCode: receive ? "2100" : consumptive ? "1300" : undefined,
      details: { movementType: movement.type, productId: String(movement.productId), quantity },
      status: movement.unitCostCurrency && movement.unitCostCurrency !== currency ? "excluded" : excluded ? "excluded" : !receive && !consumptive || amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? "unconfigured" : undefined,
      reason: movement.unitCostCurrency && movement.unitCostCurrency !== currency ? `Stock movement currency does not match organization currency ${currency}.` : purchaseOrderLinked ? "Purchase-order-linked stock movements are excluded because the purchase receipt owns inventory and AP posting." : excludedMovementType ? `Stock movement type ${movement.type} has no configured accounting policy.` : !receive && !consumptive ? `No accounting policy exists for stock movement type ${movement.type}.` : amount === undefined ? "Stock movement unit cost is not configured." : !Number.isSafeInteger(amount) || amount <= 0 ? "Stock movement cost is not a positive integer minor-unit amount." : undefined,
    };
  }

  if (sourceType === "facility_supplies") {
    const task = await ctx.db.query("facilityTasks").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", sourceId)).unique();
    if (!task) domainError("NOT_FOUND", "Facility task source not found.", { correlationId: actor.correlationId });
    const branch = await branchById(ctx, actor, task.branchId);
    const amount = task.suppliesCostMinor;
    const sourceCurrency = task.suppliesCostCurrency ?? currency;
    return {
      sourceType,
      sourcePublicId: sourceId,
      branch,
      branchPublicId: publicBranchId(branch),
      amountMinor: amount,
      currency: sourceCurrency,
      occurredAt: task.completedAt ?? task.updatedAt,
      memo: `Facility supplies ${sourceId}`,
      policyCode: "facility-supplies.v1",
      debitAccountCode: "5300",
      creditAccountCode: "2100",
      details: { taskKind: task.kind, status: task.status },
      status: sourceCurrency !== currency ? "excluded" : task.status !== "completed" || amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? "unconfigured" : undefined,
      reason: sourceCurrency !== currency ? `Facility supplies currency does not match organization currency ${currency}.` : task.status !== "completed" ? "Facility supplies are posted only after the task is completed." : amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? "Facility supplies cost is not a configured safe integer minor-unit amount." : undefined,
    };
  }

  if (sourceType === "equipment_acquisition") {
    const asset = await ctx.db.query("equipmentAssets").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", sourceId)).unique();
    if (!asset) domainError("NOT_FOUND", "Equipment asset source not found.", { correlationId: actor.correlationId });
    const branch = await branchById(ctx, actor, asset.branchId);
    const amount = asset.purchaseCostMinor;
    const sourceCurrency = asset.purchaseCostCurrency ?? currency;
    const purchaseDate = optionalText(asset.purchaseDate);
    const purchaseTimestamp = purchaseDate && /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ? new Date(`${purchaseDate}T00:00:00.000Z`) : undefined;
    const occurredAt = purchaseTimestamp && purchaseTimestamp.toISOString().slice(0, 10) === purchaseDate ? purchaseTimestamp.getTime() : asset.createdAt;
    return {
      sourceType,
      sourcePublicId: sourceId,
      branch,
      branchPublicId: publicBranchId(branch),
      amountMinor: amount,
      currency: sourceCurrency,
      occurredAt,
      memo: `Equipment acquisition ${asset.code}`,
      policyCode: "equipment-acquisition.v1",
      debitAccountCode: "1500",
      creditAccountCode: "2100",
      details: { assetCode: asset.code, assetName: asset.name },
      status: sourceCurrency !== currency ? "excluded" : !purchaseTimestamp || purchaseTimestamp.toISOString().slice(0, 10) !== purchaseDate || amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? "unconfigured" : undefined,
      reason: sourceCurrency !== currency ? `Equipment acquisition currency does not match organization currency ${currency}.` : !purchaseTimestamp || purchaseTimestamp.toISOString().slice(0, 10) !== purchaseDate ? "Equipment purchase date is not configured as a real calendar date." : amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? "Equipment purchase cost is not a configured safe integer minor-unit amount." : undefined,
    };
  }

  const workOrder = await ctx.db.query("equipmentWorkOrders").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", sourceId)).unique();
  if (!workOrder) domainError("NOT_FOUND", "Equipment work-order source not found.", { correlationId: actor.correlationId });
  const branch = await branchById(ctx, actor, workOrder.branchId);
  const partsCost = workOrder.partsCostMinor ?? 0;
  const laborCost = workOrder.laborCostMinor ?? 0;
  const combinedCost = Number.isSafeInteger(partsCost) && Number.isSafeInteger(laborCost) && Number.isSafeInteger(partsCost + laborCost) ? partsCost + laborCost : undefined;
  const amount = workOrder.totalCostMinor ?? combinedCost;
  const sourceCurrency = workOrder.costCurrency ?? currency;
  return {
    sourceType,
    sourcePublicId: sourceId,
    branch,
    branchPublicId: publicBranchId(branch),
    amountMinor: amount || undefined,
    currency: sourceCurrency,
    occurredAt: workOrder.completedAt ?? workOrder.updatedAt,
    memo: `Equipment repair ${sourceId}`,
    policyCode: "equipment-repair.v1",
    debitAccountCode: "5200",
    creditAccountCode: "2100",
    details: { status: workOrder.status, assetId: String(workOrder.assetId) },
    status: sourceCurrency !== currency ? "excluded" : workOrder.status !== "completed" || amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? "unconfigured" : undefined,
    reason: sourceCurrency !== currency ? `Equipment repair currency does not match organization currency ${currency}.` : workOrder.status !== "completed" ? "Equipment repair is posted only after the work order is completed." : amount === undefined || !Number.isSafeInteger(amount) || amount <= 0 ? "Equipment repair cost is not a configured safe integer minor-unit amount." : undefined,
  };
}

async function insertAudit(ctx: MutationCtx, actor: ActorContext, input: { action: string; entityType: string; entityId: string; summary: string; reason?: string; branchId?: Id<"branches">; before?: unknown; after?: unknown }): Promise<void> {
  await ctx.db.insert("auditEvents", {
    organizationId: actor.organization._id,
    publicId: `audit-${crypto.randomUUID()}`,
    branchId: input.branchId,
    actorUserId: actor.user._id,
    actorPublicId: publicUserId(actor.user),
    actorName: actor.user.fullName,
    actorRole: actor.role,
    category: "accounting",
    action: input.action,
    entityType: input.entityType,
    entityPublicId: input.entityId,
    entityLabel: input.entityId,
    summary: input.summary,
    reason: input.reason,
    before: input.before,
    after: input.after,
    correlationId: actor.correlationId,
    occurredAt: Date.now(),
  });
}

async function markOperationalSource(ctx: MutationCtx, actor: ActorContext, fact: SourceFact, sourcePublicId: string, status: "posted" | "reversed"): Promise<void> {
  if (fact.sourceType === "purchase_order_receipt") {
    const order = await ctx.db.query("purchaseOrders").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", sourcePublicId)).unique();
    if (order) await ctx.db.patch(order._id, { financialPostingStatus: status, financialSourceId: `source-${fact.sourceType}-${sourcePublicId}` });
    return;
  }
  if (fact.sourceType === "stock_movement") {
    const rows = await ctx.db.query("stockMovements").withIndex("by_idempotency", (q) => q.eq("organizationId", actor.organization._id)).collect();
    const movement = rows.find((row) => row.publicId === sourcePublicId);
    if (movement) await ctx.db.patch(movement._id, { financialPostingStatus: status, financialSourceId: `source-${fact.sourceType}-${sourcePublicId}` });
    return;
  }
  if (fact.sourceType === "facility_supplies") {
    const task = await ctx.db.query("facilityTasks").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", sourcePublicId)).unique();
    if (task) await ctx.db.patch(task._id, { financialPostingStatus: status, financialSourceId: `source-${fact.sourceType}-${sourcePublicId}` });
    return;
  }
  if (fact.sourceType === "equipment_acquisition") {
    const asset = await ctx.db.query("equipmentAssets").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", sourcePublicId)).unique();
    // Equipment assets do not currently carry financialPostingStatus. The
    // journal/source row is therefore authoritative for this stable source.
    void asset;
    return;
  }
  if (fact.sourceType === "equipment_repair") {
    const workOrder = await ctx.db.query("equipmentWorkOrders").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", sourcePublicId)).unique();
    if (workOrder) await ctx.db.patch(workOrder._id, { financialPostingStatus: status, financialSourceId: `source-${fact.sourceType}-${sourcePublicId}` });
    return;
  }
  const entity = fact.sourceType === "payment" || fact.sourceType === "refund" || fact.sourceType === "void" ? "payment" : "membership";
  const record = await domainSource(ctx, actor, entity, sourcePublicId);
  if (record) await ctx.db.patch(record._id, { data: { ...objectValue(record.data), financialPostingStatus: status, financialSourceId: `source-${fact.sourceType}-${sourcePublicId}` }, updatedAt: Date.now() });
}

async function sourcePostingView(ctx: ReadContext, actor: ActorContext, row: SourcePosting): Promise<JsonRecord> {
  requireAccountingRecordVisible(actor, row.branchId);
  const branch = row.branchId ? await branchById(ctx, actor, row.branchId) : undefined;
  return sourceView(row, publicOrganizationId(actor.organization), branch ? publicBranchId(branch) : undefined);
}

async function listAccountingAccounts(ctx: QueryCtx, actor: ActorContext, input: JsonRecord): Promise<JsonRecord[]> {
  requireRead(actor);
  await requireFinance(ctx, actor);
  const stored = await ctx.db.query("accountingAccounts").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const rows = stored.length > 0 ? stored : DEFAULT_ACCOUNT_DEFINITIONS.map((definition) => ({ ...definition, publicId: `acct-${definition.code}`, organizationId: actor.organization._id, active: true, isSystem: true, createdAt: actor.organization.createdAt, updatedAt: actor.organization.updatedAt } as Account));
  const search = optionalText(input.search)?.toLowerCase();
  return rows.filter((row) => !search || `${row.code} ${row.name}`.toLowerCase().includes(search)).sort((left, right) => left.code.localeCompare(right.code)).map((row) => accountView(row, publicOrganizationId(actor.organization)));
}

async function listAccountingPeriods(ctx: QueryCtx, actor: ActorContext, input: JsonRecord): Promise<JsonRecord[]> {
  requireRead(actor);
  await requireFinance(ctx, actor);
  const rows = await ctx.db.query("accountingPeriods").withIndex("by_organization_start", (q) => q.eq("organizationId", actor.organization._id)).order("desc").collect();
  const status = optionalText(input.status);
  return rows.filter((row) => !status || row.status === status).map((row) => periodView(row, publicOrganizationId(actor.organization)));
}

async function listJournalEntries(ctx: QueryCtx, actor: ActorContext, input: JsonRecord): Promise<JsonRecord> {
  requireRead(actor);
  await requireFinance(ctx, actor);
  const requestedBranch = optionalText(input.branchId);
  const branch = await branchByPublicId(ctx, actor, requestedBranch);
  let rows = await ctx.db.query("accountingJournalEntries").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).order("desc").collect();
  rows = rows.filter((row) => accountingRecordVisible(actor, row.branchId));
  if (branch) rows = rows.filter((row) => row.branchId === branch._id);
  const periodId = optionalText(input.periodId);
  const period = periodId ? await ctx.db.query("accountingPeriods").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", periodId)).unique() : undefined;
  if (periodId && !period) domainError("NOT_FOUND", "Accounting period not found.", { correlationId: actor.correlationId });
  if (period) rows = rows.filter((row) => row.accountingPeriodId === period._id);
  const status = optionalText(input.status);
  if (status) rows = rows.filter((row) => row.status === status);
  const fromInput = optionalText(input.from);
  const toInput = optionalText(input.to);
  const from = fromInput ? dateOnly(fromInput) : undefined;
  const to = toInput ? dateOnly(toInput) : undefined;
  if (from && to && from > to) domainError("VALIDATION_ERROR", "Journal from date must be on or before the to date.", { correlationId: actor.correlationId });
  if (from) rows = rows.filter((row) => row.postingDate >= from);
  if (to) rows = rows.filter((row) => row.postingDate <= to);
  const requestedSort = optionalText(input.sort) ?? "-postingDate";
  const descending = requestedSort.startsWith("-");
  const sortKey = (descending ? requestedSort.slice(1) : requestedSort) === "createdAt" ? "createdAt" : (descending ? requestedSort.slice(1) : requestedSort) === "postedAt" ? "postedAt" : "postingDate";
  rows.sort((left, right) => {
    const leftValue = sortKey === "postingDate" ? left.postingDate : iso(sortKey === "createdAt" ? left.createdAt : left.postedAt);
    const rightValue = sortKey === "postingDate" ? right.postingDate : iso(sortKey === "createdAt" ? right.createdAt : right.postedAt);
    const comparison = leftValue.localeCompare(rightValue);
    if (comparison !== 0) return descending ? -comparison : comparison;
    return descending ? right._creationTime - left._creationTime : left._creationTime - right._creationTime;
  });
  const items: JsonRecord[] = [];
  for (const row of rows) {
    const lines = await ctx.db.query("accountingJournalLines").withIndex("by_entry", (q) => q.eq("organizationId", actor.organization._id).eq("journalEntryId", row._id)).collect();
    const rowBranch = row.branchId ? await ctx.db.get(row.branchId) : undefined;
    if (row.branchId && !rowBranch) continue;
    items.push({ id: row.publicId, organizationId: publicOrganizationId(actor.organization), branchId: rowBranch ? publicBranchId(rowBranch) : undefined, scope: row.scope, currency: row.currency, postingDate: row.postingDate, periodId: (await ctx.db.get(row.accountingPeriodId))?.publicId, status: row.status, memo: row.memo, sourceType: row.sourceType, sourceId: row.sourcePublicId, policyCode: row.policyCode, policyVersion: row.policyVersion, totalDebit: { amount: lines.reduce((sum, line) => sum + line.debitMinor, 0), currency: row.currency }, totalCredit: { amount: lines.reduce((sum, line) => sum + line.creditMinor, 0), currency: row.currency }, lineCount: lines.length, createdAt: iso(row.createdAt), postedAt: iso(row.postedAt) });
  }
  return page(items, input);
}

async function getJournalEntry(ctx: QueryCtx, actor: ActorContext, input: JsonRecord): Promise<JsonRecord> {
  requireRead(actor);
  await requireFinance(ctx, actor);
  const id = optionalText(input.entryId) ?? optionalText(input.id);
  const entry = id ? await ctx.db.query("accountingJournalEntries").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", id)).unique() : null;
  if (!entry) domainError("NOT_FOUND", "Journal entry not found.", { correlationId: actor.correlationId });
  requireAccountingRecordVisible(actor, entry.branchId);
  if (entry.branchId) await branchById(ctx, actor, entry.branchId);
  return await journalEntryView(ctx, actor, entry);
}

async function trialBalance(ctx: QueryCtx, actor: ActorContext, input: JsonRecord): Promise<JsonRecord> {
  requireRead(actor);
  await requireFinance(ctx, actor);
  const requestedBranch = optionalText(input.branchId);
  const branch = await branchByPublicId(ctx, actor, requestedBranch);
  const periodId = optionalText(input.periodId);
  const period = periodId ? await ctx.db.query("accountingPeriods").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", periodId)).unique() : undefined;
  if (periodId && !period) domainError("NOT_FOUND", "Accounting period not found.", { correlationId: actor.correlationId });
  let entries = await ctx.db.query("accountingJournalEntries").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  // Reversed entries remain immutable facts. Include both the original
  // (marked reversed) and its posted reversing entry so a same-period
  // correction nets to zero rather than disappearing from the report.
  entries = entries.filter((entry) => (entry.status === "posted" || entry.status === "reversed") && (!period || entry.accountingPeriodId === period._id) && accountingRecordVisible(actor, entry.branchId) && (!branch || entry.branchId === branch._id));
  const accountRows = await ctx.db.query("accountingAccounts").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const balances = new Map<string, { account: Account; debit: number; credit: number }>();
  for (const account of accountRows) balances.set(account.code, { account, debit: 0, credit: 0 });
  for (const entry of entries) {
    const lines = await ctx.db.query("accountingJournalLines").withIndex("by_entry", (q) => q.eq("organizationId", actor.organization._id).eq("journalEntryId", entry._id)).collect();
    for (const line of lines) {
      if (branch && line.branchId !== branch._id) continue;
      const current = balances.get(line.accountCode);
      if (current) { current.debit += line.debitMinor; current.credit += line.creditMinor; }
    }
  }
  // A trial balance presents each account's net position. This matters for
  // immutable corrections: a reversed original and its swapped-line
  // reversing entry are both included above, but their account-level net is
  // zero. Keeping gross debit/credit accumulation here would make a fully
  // reversed entry appear as a new balance instead of cancelling out.
  const rows = [...balances.values()].map((row) => {
    const net = row.debit - row.credit;
    return { ...row, net };
  }).filter((row) => row.net !== 0).sort((left, right) => left.account.code.localeCompare(right.account.code)).map((row) => ({ accountId: row.account.publicId, accountCode: row.account.code, accountName: row.account.name, accountType: row.account.accountType, statementGroup: row.account.statementGroup, debit: { amount: Math.max(row.net, 0), currency: actor.organization.currency }, credit: { amount: Math.max(-row.net, 0), currency: actor.organization.currency }, balance: { amount: row.net, currency: actor.organization.currency } }));
  return { organizationId: publicOrganizationId(actor.organization), branchId: branch ? publicBranchId(branch) : undefined, periodId: period?.publicId, currency: actor.organization.currency, rows, totalDebit: { amount: rows.reduce((sum, row) => sum + (row.debit as { amount: number }).amount, 0), currency: actor.organization.currency }, totalCredit: { amount: rows.reduce((sum, row) => sum + (row.credit as { amount: number }).amount, 0), currency: actor.organization.currency } };
}

async function listSourcePostings(ctx: QueryCtx, actor: ActorContext, input: JsonRecord): Promise<JsonRecord> {
  requireRead(actor);
  await requireFinance(ctx, actor);
  const requestedBranch = optionalText(input.branchId);
  const branch = await branchByPublicId(ctx, actor, requestedBranch);
  let rows = await ctx.db.query("accountingSourcePostings").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).order("desc").collect();
  rows = rows.filter((row) => accountingRecordVisible(actor, row.branchId));
  if (branch) rows = rows.filter((row) => row.branchId === branch._id);
  const status = optionalText(input.status);
  if (status) rows = rows.filter((row) => row.status === status);
  const sourceType = optionalText(input.sourceType);
  if (sourceType) rows = rows.filter((row) => row.sourceType === sourceType);
  const values = await Promise.all(rows.map((row) => sourcePostingView(ctx, actor, row)));
  return page(values, input);
}

type QueueSourceStatus = Extract<PostingStatus, "pending" | "unconfigured" | "excluded">;
interface SourceCandidate {
  sourceType: AccountingSourceType;
  sourcePublicId: string;
  branchId?: Id<"branches">;
}

const SUPPORTED_SOURCE_TYPES: readonly AccountingSourceType[] = ["payment", "refund", "void", "membership_sale", "membership_renewal", "purchase_order_receipt", "stock_movement", "facility_supplies", "equipment_acquisition", "equipment_repair"];

function queueSourceStatus(fact: SourceFact, currency: string): QueueSourceStatus {
  if (fact.status) return fact.status;
  if (!fact.branch) return "unconfigured";
  if (!fact.policyCode || !fact.debitAccountCode || !fact.creditAccountCode || fact.amountMinor === undefined || fact.amountMinor <= 0 || fact.currency !== currency) return "unconfigured";
  return "pending";
}

async function sourceRecordBranchId(ctx: ReadContext, actor: ActorContext, record: DomainRecord): Promise<Id<"branches"> | undefined> {
  if (record.branchId) return record.branchId;
  const value = objectValue(record.data);
  const branchPublic = optionalText(value.branchId) ?? optionalText(value.homeBranchId);
  if (!branchPublic) return undefined;
  const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", branchPublic)).unique();
  return branch?._id;
}

async function discoverSourceCandidates(ctx: ReadContext, actor: ActorContext, sourceTypes: readonly AccountingSourceType[], requestedBranch?: Doc<"branches">): Promise<SourceCandidate[]> {
  const candidates: SourceCandidate[] = [];
  const seen = new Set<string>();
  const allowed = new Set(sourceTypes);
  const canSee = (branchId: Id<"branches"> | undefined): boolean => accountingRecordVisible(actor, branchId);
  const add = (sourceType: AccountingSourceType, sourcePublicId: string, branchId?: Id<"branches">): void => {
    if (!allowed.has(sourceType) || !canSee(branchId) || (requestedBranch && branchId !== requestedBranch._id)) return;
    const key = `${sourceType}:${sourcePublicId}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ sourceType, sourcePublicId, branchId });
  };

  if (["payment", "refund", "void"].some((sourceType) => allowed.has(sourceType as AccountingSourceType))) {
    const records = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "payment")).collect();
    for (const record of records) {
      const value = objectValue(record.data);
      const paymentType = text(value.type, "payment");
      const paymentStatus = text(value.status).toLowerCase();
      const sourceType: AccountingSourceType | undefined = paymentType === "refund" ? "refund" : paymentType === "payment" && ["voided", "void"].includes(paymentStatus) ? "void" : paymentType === "payment" ? "payment" : undefined;
      if (sourceType) add(sourceType, record.publicId, await sourceRecordBranchId(ctx, actor, record));
    }
  }

  if (["membership_sale", "membership_renewal"].some((sourceType) => allowed.has(sourceType as AccountingSourceType))) {
    const records = await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", "membership")).collect();
    for (const record of records) {
      const sourceType: AccountingSourceType = optionalText(objectValue(record.data).previousMembershipId) ? "membership_renewal" : "membership_sale";
      add(sourceType, record.publicId, await sourceRecordBranchId(ctx, actor, record));
    }
  }

  if (allowed.has("purchase_order_receipt")) {
    const orders = await ctx.db.query("purchaseOrders").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
    for (const order of orders) add("purchase_order_receipt", order.publicId, order.branchId);
  }
  if (allowed.has("stock_movement")) {
    const movements = await ctx.db.query("stockMovements").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
    for (const movement of movements) add("stock_movement", movement.publicId, movement.branchId);
  }
  if (allowed.has("facility_supplies")) {
    const tasks = await ctx.db.query("facilityTasks").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
    for (const task of tasks) add("facility_supplies", task.publicId, task.branchId);
  }
  if (allowed.has("equipment_acquisition")) {
    const assets = await ctx.db.query("equipmentAssets").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
    for (const asset of assets) add("equipment_acquisition", asset.publicId, asset.branchId);
  }
  if (allowed.has("equipment_repair")) {
    const workOrders = await ctx.db.query("equipmentWorkOrders").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
    for (const workOrder of workOrders) add("equipment_repair", workOrder.publicId, workOrder.branchId);
  }
  return candidates;
}

async function refreshSourceProjection(ctx: MutationCtx, actor: ActorContext, fact: SourceFact, status: QueueSourceStatus): Promise<{ row: SourcePosting; created: boolean; updated: boolean; skippedPosted: boolean }> {
  const existing = await ctx.db.query("accountingSourcePostings").withIndex("by_organization_source", (q) => q.eq("organizationId", actor.organization._id).eq("sourceType", fact.sourceType).eq("sourcePublicId", fact.sourcePublicId)).unique();
  if (existing?.status === "posted" || existing?.status === "reversed") return { row: existing, created: false, updated: false, skippedPosted: true };
  const now = Date.now();
  const patch = {
    branchId: fact.branch?._id,
    status,
    amountMinor: fact.amountMinor,
    currency: fact.currency,
    policyCode: fact.policyCode,
    policyVersion: policyDefinition(fact.policyCode ?? "")?.version,
    reason: fact.reason,
    details: fact.details,
    occurredAt: fact.occurredAt,
    journalEntryPublicId: undefined,
    idempotencyKey: undefined,
    updatedAt: now,
  };
  if (existing) {
    const changed = existing.branchId !== patch.branchId || existing.status !== patch.status || existing.amountMinor !== patch.amountMinor || existing.currency !== patch.currency || existing.policyCode !== patch.policyCode || existing.policyVersion !== patch.policyVersion || existing.journalEntryPublicId !== patch.journalEntryPublicId || existing.idempotencyKey !== patch.idempotencyKey || existing.reason !== patch.reason || existing.occurredAt !== patch.occurredAt || canonicalJson(existing.details ?? null) !== canonicalJson(patch.details ?? null);
    if (changed) await ctx.db.patch(existing._id, patch);
    return { row: (await ctx.db.get(existing._id))!, created: false, updated: changed, skippedPosted: false };
  }
  const id = await ctx.db.insert("accountingSourcePostings", { organizationId: actor.organization._id, publicId: `source-${crypto.randomUUID()}`, sourceType: fact.sourceType, sourcePublicId: fact.sourcePublicId, ...patch, createdAt: now });
  return { row: (await ctx.db.get(id))!, created: true, updated: false, skippedPosted: false };
}

async function refreshSourceQueue(ctx: MutationCtx, actor: ActorContext, input: JsonRecord): Promise<JsonRecord> {
  await requireFinance(ctx, actor);
  requirePostingRole(actor);
  const requestedTypes = Array.isArray(input.sourceTypes) ? input.sourceTypes.map((value) => text(value)) : [...SUPPORTED_SOURCE_TYPES];
  if (requestedTypes.some((sourceType) => !SUPPORTED_SOURCE_TYPES.includes(sourceType as AccountingSourceType))) domainError("VALIDATION_ERROR", "Source queue refresh contains an unsupported source type.", { correlationId: actor.correlationId });
  const requestedBranchId = optionalText(input.branchId);
  const requestedBranch = await branchByPublicId(ctx, actor, requestedBranchId);
  const candidates = await discoverSourceCandidates(ctx, actor, requestedTypes as AccountingSourceType[], requestedBranch);
  const items: JsonRecord[] = [];
  let created = 0;
  let updated = 0;
  let skippedPosted = 0;
  let pending = 0;
  let unconfigured = 0;
  let excluded = 0;
  for (const candidate of candidates) {
    const rawFact = await sourceFact(ctx, actor, candidate.sourceType, candidate.sourcePublicId);
    const fact = !rawFact.branch && !rawFact.status ? { ...rawFact, status: "unconfigured" as const, reason: "Source fact is missing an active branch." } : rawFact;
    const status = queueSourceStatus(fact, actor.organization.currency.toUpperCase());
    const result = await refreshSourceProjection(ctx, actor, fact, status);
    if (result.created) created += 1;
    if (result.updated) updated += 1;
    if (result.skippedPosted) skippedPosted += 1;
    if (result.row.status === "pending") pending += 1;
    if (result.row.status === "unconfigured") unconfigured += 1;
    if (result.row.status === "excluded") excluded += 1;
    if (!result.skippedPosted) items.push(await sourcePostingView(ctx, actor, result.row));
  }
  if (created > 0 || updated > 0) await insertAudit(ctx, actor, { action: "accounting.source_queue.refresh", entityType: "accounting_source_posting", entityId: requestedBranch?.publicId ?? "organization", summary: `Refreshed accounting source queue (${created} created, ${updated} updated)`, branchId: requestedBranch?._id, after: { scanned: candidates.length, created, updated, pending, unconfigured, excluded } });
  return { organizationId: publicOrganizationId(actor.organization), branchId: requestedBranch?.publicId, scanned: candidates.length, created, updated, skippedPosted, pending, unconfigured, excluded, items };
}

function validateLineAmounts(lines: JsonRecord[], currency: string, correlationId: string): { accountId: string; debit: number; credit: number; description?: string }[] {
  const validated: { accountId: string; debit: number; credit: number; description?: string }[] = [];
  const ledgerLines: { accountId: string; debitMinor: number; creditMinor: number; currency: string }[] = [];
  for (const raw of lines) {
    const line = objectValue(raw);
    const accountId = optionalText(line.accountId) ?? optionalText(line.accountCode);
    const debit = integer(line.debitMinor ?? objectValue(line.debit).amount) ?? 0;
    const credit = integer(line.creditMinor ?? objectValue(line.credit).amount) ?? 0;
    const lineCurrency = optionalText(line.currency ?? objectValue(line.debit).currency ?? objectValue(line.credit).currency)?.toUpperCase() ?? currency;
    ledgerLines.push({ accountId: accountId ?? "", debitMinor: debit, creditMinor: credit, currency: lineCurrency });
    validated.push({ accountId: accountId ?? "", debit, credit, description: optionalText(line.description) });
  }
  const balance = inspectLedgerBalance(ledgerLines, currency);
  if (!balance.balanced) {
    if (balance.reason === "too_few_lines") domainError("VALIDATION_ERROR", "A journal needs at least two lines.", { correlationId });
    if (balance.reason === "invalid_line" || balance.reason === "currency_mismatch") domainError("VALIDATION_ERROR", "Each journal line needs one positive integer debit or credit in the organization currency.", { correlationId });
    domainError("VALIDATION_ERROR", "Journal debits and credits must be equal and non-zero.", { correlationId, details: { debitTotal: balance.totalDebitMinor, creditTotal: balance.totalCreditMinor } });
  }
  return validated;
}

async function insertJournal(ctx: MutationCtx, actor: ActorContext, input: { branch?: Doc<"branches">; scope: "branch" | "consolidated"; postingDate: string; memo: string; reason?: string; sourceType?: AccountingSourceType; sourcePublicId?: string; policyCode?: string; policyVersion?: number; requestFingerprint?: string; reversalOfEntryPublicId?: string; idempotencyKey: string; lines: { accountId: string; debit: number; credit: number; description?: string }[] }): Promise<JournalEntry> {
  const period = await ensureOpenPeriod(ctx, actor, input.postingDate);
  const accounts = await Promise.all(input.lines.map((line) => accountByPublicId(ctx, actor, line.accountId)));
  const now = Date.now();
  const entryId = await ctx.db.insert("accountingJournalEntries", {
    organizationId: actor.organization._id,
    publicId: `je-${crypto.randomUUID()}`,
    branchId: input.branch?._id,
    scope: input.scope,
    currency: actor.organization.currency,
    postingDate: input.postingDate,
    accountingPeriodId: period._id,
    status: "posted",
    memo: input.memo,
    reason: input.reason,
    sourceType: input.sourceType,
    sourcePublicId: input.sourcePublicId,
    policyCode: input.policyCode,
    policyVersion: input.policyVersion,
    reversalOfEntryPublicId: input.reversalOfEntryPublicId,
    requestFingerprint: input.requestFingerprint,
    idempotencyKey: input.idempotencyKey,
    createdByUserId: actor.user._id,
    createdAt: now,
    postedAt: now,
  });
  for (let index = 0; index < input.lines.length; index += 1) {
    const line = input.lines[index]!;
    const account = accounts[index]!;
    await ctx.db.insert("accountingJournalLines", {
      organizationId: actor.organization._id,
      publicId: `jel-${crypto.randomUUID()}`,
      journalEntryId: entryId,
      branchId: input.branch?._id,
      accountId: account._id,
      accountCode: account.code,
      accountName: account.name,
      debitMinor: line.debit,
      creditMinor: line.credit,
      description: line.description,
      statementGroup: account.statementGroup,
      cashflowGroup: account.cashflowGroup,
      createdAt: now,
    });
  }
  const entry = await ctx.db.get(entryId);
  if (!entry) domainError("INTERNAL_ERROR", "Journal entry could not be posted.", { correlationId: actor.correlationId });
  return entry;
}

async function postManualJournal(ctx: MutationCtx, actor: ActorContext, input: JsonRecord): Promise<JsonRecord> {
  await requireFinance(ctx, actor);
  requireOwner(actor);
  const reason = text(input.reason).trim();
  requireReason(reason, actor.correlationId);
  const idempotencyKey = text(input.idempotencyKey).trim();
  if (!idempotencyKey) domainError("VALIDATION_ERROR", "An idempotency key is required.", { correlationId: actor.correlationId });
  const currency = actor.organization.currency.toUpperCase();
  const requestedScope = text(input.scope, "branch");
  if (requestedScope !== "branch" && requestedScope !== "consolidated") domainError("VALIDATION_ERROR", "Journal scope must be branch or consolidated.", { correlationId: actor.correlationId });
  const scope = requestedScope as "branch" | "consolidated";
  if (scope === "consolidated" && actor.branchScope !== "all") domainError("FORBIDDEN", "Consolidated journals require organization-wide branch scope.", { correlationId: actor.correlationId });
  const requestedBranchId = optionalText(input.branchId);
  const branch = await branchByPublicId(ctx, actor, requestedBranchId);
  if (scope === "consolidated" && requestedBranchId) domainError("VALIDATION_ERROR", "A consolidated journal cannot specify a branch.", { correlationId: actor.correlationId });
  if (scope === "branch" && !branch) domainError("VALIDATION_ERROR", "A branch is required for a branch journal.", { correlationId: actor.correlationId });
  const lines = validateLineAmounts(Array.isArray(input.lines) ? input.lines.map(objectValue) : [], currency, actor.correlationId);
  const postingDate = dateOnly(input.postingDate);
  const memo = text(input.memo).trim() || "Manual journal";
  const requestFingerprint = manualJournalRequestFingerprint({ scope, branchId: requestedBranchId, postingDate, memo, reason, lines: lines.map((line) => ({ accountId: line.accountId, debitMinor: line.debit, creditMinor: line.credit, description: line.description })) });
  const existing = await ctx.db.query("accountingJournalEntries").withIndex("by_organization_idempotency", (q) => q.eq("organizationId", actor.organization._id).eq("idempotencyKey", `manual:${idempotencyKey}`)).unique();
  if (existing) {
    const existingBranch = existing.branchId ? await ctx.db.get(existing.branchId) : undefined;
    const existingLines = await ctx.db.query("accountingJournalLines").withIndex("by_entry", (q) => q.eq("organizationId", actor.organization._id).eq("journalEntryId", existing._id)).collect();
    const existingFingerprint = existing.requestFingerprint ?? manualJournalRequestFingerprint({ scope: existing.scope, branchId: existingBranch?.publicId, postingDate: existing.postingDate, memo: existing.memo, reason: existing.reason ?? "", lines: existingLines.map((line) => ({ accountId: line.accountCode, debitMinor: line.debitMinor, creditMinor: line.creditMinor, description: line.description })) });
    if (existingFingerprint !== requestFingerprint) domainError("CONFLICT", "This manual journal idempotency key was already used for a different request.", { correlationId: actor.correlationId });
    return await journalEntryView(ctx, actor, existing);
  }
  await ensureMetadata(ctx, actor);
  const entry = await insertJournal(ctx, actor, { branch, scope, postingDate, memo, reason, requestFingerprint, idempotencyKey: `manual:${idempotencyKey}`, lines });
  await insertAudit(ctx, actor, { action: "accounting.manual_post", entityType: "accounting_journal_entry", entityId: entry.publicId, summary: `Posted manual journal ${entry.publicId}`, reason, branchId: branch?._id, after: { id: entry.publicId, lineCount: lines.length } });
  return await journalEntryView(ctx, actor, entry);
}

async function persistSourceDecision(ctx: MutationCtx, actor: ActorContext, fact: SourceFact, status: SourceDecisionStatus, idempotencyKey: string, requestFingerprint: string): Promise<JsonRecord> {
  const existing = await ctx.db.query("accountingSourcePostings").withIndex("by_organization_source", (q) => q.eq("organizationId", actor.organization._id).eq("sourceType", fact.sourceType).eq("sourcePublicId", fact.sourcePublicId)).unique();
  const now = Date.now();
  const branchId = fact.branch?._id ?? existing?.branchId;
  const payload = { branchId, status, amountMinor: fact.amountMinor, currency: fact.currency, policyCode: fact.policyCode, policyVersion: policyDefinition(fact.policyCode ?? "")?.version, idempotencyKey, journalEntryPublicId: undefined, reason: fact.reason, details: fact.details, updatedAt: now };
  let row: SourcePosting;
  if (existing) { await ctx.db.patch(existing._id, payload); row = (await ctx.db.get(existing._id))!; } else { const id = await ctx.db.insert("accountingSourcePostings", { organizationId: actor.organization._id, publicId: `source-${crypto.randomUUID()}`, sourceType: fact.sourceType, sourcePublicId: fact.sourcePublicId, ...payload, occurredAt: fact.occurredAt, createdAt: now }); row = (await ctx.db.get(id))!; }
  const attemptId = await ctx.db.insert("accountingPostingAttempts", { organizationId: actor.organization._id, publicId: `attempt-${crypto.randomUUID()}`, sourceType: fact.sourceType, sourcePublicId: fact.sourcePublicId, sourcePostingPublicId: row.publicId, branchId, idempotencyKey, requestFingerprint, status, amountMinor: fact.amountMinor, currency: fact.currency, policyCode: fact.policyCode, policyVersion: policyDefinition(fact.policyCode ?? "")?.version, reason: fact.reason, details: fact.details, occurredAt: fact.occurredAt, createdAt: now, updatedAt: now });
  const attempt = await ctx.db.get(attemptId);
  if (!attempt) domainError("INTERNAL_ERROR", "Accounting source-posting attempt could not be persisted.", { correlationId: actor.correlationId });
  await insertAudit(ctx, actor, { action: `accounting.source.${status}`, entityType: "accounting_source_posting", entityId: row.publicId, summary: `${fact.sourceType} source is ${status}`, reason: fact.reason, branchId: fact.branch?._id, after: { status, sourceId: fact.sourcePublicId } });
  return await sourcePostingAttemptView(ctx, actor, attempt);
}

async function postAccountingSource(ctx: MutationCtx, actor: ActorContext, input: JsonRecord): Promise<JsonRecord> {
  await requireFinance(ctx, actor);
  requirePostingRole(actor);
  const sourceType = text(input.sourceType) as AccountingSourceType;
  const supported: readonly AccountingSourceType[] = ["payment", "refund", "void", "membership_sale", "membership_renewal", "purchase_order_receipt", "stock_movement", "facility_supplies", "equipment_acquisition", "equipment_repair"];
  if (!supported.includes(sourceType)) domainError("VALIDATION_ERROR", "Accounting source type is unsupported.", { correlationId: actor.correlationId });
  const sourceId = text(input.sourceId ?? input.sourcePublicId).trim();
  const idempotencyKey = text(input.idempotencyKey).trim();
  if (!idempotencyKey) domainError("VALIDATION_ERROR", "An idempotency key is required.", { correlationId: actor.correlationId });
  const requestFingerprint = sourcePostingRequestFingerprint({ sourceType, sourcePublicId: sourceId, idempotencyKey, reason: optionalText(input.reason) });
  const sourceExisting = await ctx.db.query("accountingSourcePostings").withIndex("by_organization_source", (q) => q.eq("organizationId", actor.organization._id).eq("sourceType", sourceType).eq("sourcePublicId", sourceId)).unique();
  if (sourceExisting) requireAccountingRecordVisible(actor, sourceExisting.branchId);
  const attemptsWithKey = await ctx.db.query("accountingPostingAttempts").withIndex("by_organization_idempotency", (q) => q.eq("organizationId", actor.organization._id).eq("idempotencyKey", idempotencyKey)).collect();
  for (const attempt of attemptsWithKey) requireAccountingRecordVisible(actor, attempt.branchId);
  if (attemptsWithKey.some((attempt) => attempt.sourceType !== sourceType || attempt.sourcePublicId !== sourceId)) domainError("CONFLICT", "This accounting idempotency key belongs to another source.", { correlationId: actor.correlationId });
  const existingAttempt = await sourcePostingAttemptByKey(ctx, actor, sourceType, sourceId, idempotencyKey);
  if (existingAttempt) {
    if (existingAttempt.requestFingerprint !== requestFingerprint) domainError("CONFLICT", "This accounting idempotency key was already used for a different source-posting request.", { correlationId: actor.correlationId });
    return await sourcePostingAttemptView(ctx, actor, existingAttempt);
  }
  const existingKeyRows = await ctx.db.query("accountingSourcePostings").withIndex("by_organization_idempotency", (q) => q.eq("organizationId", actor.organization._id).eq("idempotencyKey", idempotencyKey)).collect();
  for (const row of existingKeyRows) requireAccountingRecordVisible(actor, row.branchId);
  if (existingKeyRows.some((row) => row.sourceType !== sourceType || row.sourcePublicId !== sourceId)) domainError("CONFLICT", "This accounting idempotency key belongs to another source.", { correlationId: actor.correlationId });
  const existingKey = existingKeyRows.find((row) => row.sourceType === sourceType && row.sourcePublicId === sourceId);
  if (existingKey?.status === "posted" || existingKey?.status === "reversed") return await sourcePostingView(ctx, actor, existingKey);
  if (sourceExisting?.status === "posted" || sourceExisting?.status === "reversed") return await sourcePostingView(ctx, actor, sourceExisting);
  const fact = await sourceFact(ctx, actor, sourceType, sourceId);
  if (fact.status) return await persistSourceDecision(ctx, actor, fact, fact.status, idempotencyKey, requestFingerprint);
  if (!fact.policyCode || !fact.debitAccountCode || !fact.creditAccountCode || fact.amountMinor === undefined || fact.amountMinor <= 0 || fact.currency !== actor.organization.currency.toUpperCase()) return await persistSourceDecision(ctx, actor, fact, "unconfigured", idempotencyKey, requestFingerprint);
  // Source policies are lazily seeded for organizations created before the
  // accounting module existed. Ensure the metadata exists before looking up
  // the policy; otherwise every first source post is incorrectly recorded as
  // unconfigured and can never reach the journal.
  await ensureMetadata(ctx, actor);
  const policy = await policyByCode(ctx, actor, fact.policyCode);
  if (!policy || policy.status !== "active") return await persistSourceDecision(ctx, actor, { ...fact, reason: "The source posting policy is not configured." }, "unconfigured", idempotencyKey, requestFingerprint);
  const branch = fact.branch;
  if (!branch) domainError("UNCONFIGURED", "A branch-scoped source is missing its branch.", { correlationId: actor.correlationId });
  const entryKey = sourcePostingIdempotencyKey({ sourceType, sourcePublicId: sourceId, policyCode: policy.policyCode, policyVersion: policy.version, idempotencyKey });
  const existingEntry = await ctx.db.query("accountingJournalEntries").withIndex("by_organization_idempotency", (q) => q.eq("organizationId", actor.organization._id).eq("idempotencyKey", entryKey)).unique();
  if (existingEntry) return await sourcePostingView(ctx, actor, sourceExisting ?? (await ctx.db.query("accountingSourcePostings").withIndex("by_organization_source", (q) => q.eq("organizationId", actor.organization._id).eq("sourceType", sourceType).eq("sourcePublicId", sourceId)).unique())!);
  // Accounting periods follow the tenant's local business day. Keeping this
  // aligned with the source queue's local-date projection prevents a late
  // UTC event from being displayed in one period but posted into the next.
  const postingDate = localDate(fact.occurredAt, actor.organization.timezone);
  const entry = await insertJournal(ctx, actor, { branch, scope: "branch", postingDate, memo: fact.memo, reason: optionalText(input.reason), sourceType, sourcePublicId: sourceId, policyCode: policy.policyCode, policyVersion: policy.version, idempotencyKey: entryKey, lines: [{ accountId: `acct-${fact.debitAccountCode}`, debit: fact.amountMinor, credit: 0, description: fact.memo }, { accountId: `acct-${fact.creditAccountCode}`, debit: 0, credit: fact.amountMinor, description: fact.memo }] });
  const now = Date.now();
  const sourceIdValue = sourceExisting?._id ?? await ctx.db.insert("accountingSourcePostings", { organizationId: actor.organization._id, publicId: `source-${crypto.randomUUID()}`, sourceType, sourcePublicId: sourceId, branchId: branch._id, status: "posted", amountMinor: fact.amountMinor, currency: fact.currency, policyCode: policy.policyCode, policyVersion: policy.version, journalEntryPublicId: entry.publicId, idempotencyKey, reason: optionalText(input.reason), details: fact.details, occurredAt: fact.occurredAt, createdAt: now, updatedAt: now });
  if (sourceExisting) await ctx.db.patch(sourceExisting._id, { branchId: branch._id, status: "posted", amountMinor: fact.amountMinor, currency: fact.currency, policyCode: policy.policyCode, policyVersion: policy.version, journalEntryPublicId: entry.publicId, idempotencyKey, reason: optionalText(input.reason), details: fact.details, updatedAt: now });
  await markOperationalSource(ctx, actor, fact, sourceId, "posted");
  await insertAudit(ctx, actor, { action: "accounting.source.post", entityType: "accounting_source_posting", entityId: sourceId, summary: `Posted ${sourceType} source ${sourceId}`, reason: optionalText(input.reason), branchId: branch._id, after: { amountMinor: fact.amountMinor, journalEntryId: entry.publicId, policyCode: policy.policyCode, policyVersion: policy.version } });
  const row = await ctx.db.get(sourceIdValue);
  if (!row) domainError("INTERNAL_ERROR", "Source posting could not be persisted.", { correlationId: actor.correlationId });
  return await sourcePostingView(ctx, actor, row);
}

async function reverseEntry(ctx: MutationCtx, actor: ActorContext, input: JsonRecord): Promise<JsonRecord> {
  await requireFinance(ctx, actor);
  requireOwner(actor);
  const reason = text(input.reason).trim();
  requireReason(reason, actor.correlationId);
  const id = optionalText(input.entryId) ?? optionalText(input.id);
  const idempotencyKey = text(input.idempotencyKey).trim();
  if (!id || !idempotencyKey) domainError("VALIDATION_ERROR", "An entry id and idempotency key are required.", { correlationId: actor.correlationId });
  const requestFingerprint = reversalRequestFingerprint({ entryId: id, reason });
  const existing = await ctx.db.query("accountingJournalEntries").withIndex("by_organization_idempotency", (q) => q.eq("organizationId", actor.organization._id).eq("idempotencyKey", `reverse:${id}:${idempotencyKey}`)).unique();
  if (existing) {
    const existingFingerprint = existing.requestFingerprint ?? reversalRequestFingerprint({ entryId: existing.reversalOfEntryPublicId ?? id, reason: existing.reason ?? "" });
    if (existingFingerprint !== requestFingerprint) domainError("CONFLICT", "This reversal idempotency key was already used for a different request.", { correlationId: actor.correlationId });
    return await journalEntryView(ctx, actor, existing);
  }
  const original = await ctx.db.query("accountingJournalEntries").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", id)).unique();
  if (!original) domainError("NOT_FOUND", "Journal entry not found.", { correlationId: actor.correlationId });
  requireAccountingRecordVisible(actor, original.branchId);
  if (original.branchId) await branchById(ctx, actor, original.branchId);
  if (original.status !== "posted") domainError("CONFLICT", "Only a posted journal entry can be reversed once.", { correlationId: actor.correlationId });
  const lines = await ctx.db.query("accountingJournalLines").withIndex("by_entry", (q) => q.eq("organizationId", actor.organization._id).eq("journalEntryId", original._id)).collect();
  const reversal = await insertJournal(ctx, actor, { branch: original.branchId ? (await ctx.db.get(original.branchId))! : undefined, scope: original.scope, postingDate: localDate(Date.now(), actor.organization.timezone), memo: `Reversal of ${original.publicId}`, reason, sourceType: original.sourceType, sourcePublicId: original.sourcePublicId, policyCode: original.policyCode, policyVersion: original.policyVersion, requestFingerprint, reversalOfEntryPublicId: original.publicId, idempotencyKey: `reverse:${id}:${idempotencyKey}`, lines: lines.map((line) => ({ accountId: `acct-${line.accountCode}`, debit: line.creditMinor, credit: line.debitMinor, description: `Reversal of ${original.publicId}` })) });
  await ctx.db.patch(original._id, { status: "reversed", reversedByEntryPublicId: reversal.publicId });
  if (original.sourceType && original.sourcePublicId) {
    const source = await ctx.db.query("accountingSourcePostings").withIndex("by_organization_source", (q) => q.eq("organizationId", actor.organization._id).eq("sourceType", original.sourceType!).eq("sourcePublicId", original.sourcePublicId!)).unique();
    if (source) { await ctx.db.patch(source._id, { status: "reversed", updatedAt: Date.now() }); const fact = await sourceFact(ctx, actor, original.sourceType, original.sourcePublicId); await markOperationalSource(ctx, actor, fact, original.sourcePublicId, "reversed"); }
  }
  await insertAudit(ctx, actor, { action: "accounting.entry.reverse", entityType: "accounting_journal_entry", entityId: original.publicId, summary: `Reversed journal entry ${original.publicId}`, reason, branchId: original.branchId, before: { status: original.status }, after: { status: "reversed", reversalEntryId: reversal.publicId } });
  return await journalEntryView(ctx, actor, reversal);
}

async function closePeriod(ctx: MutationCtx, actor: ActorContext, input: JsonRecord, reopen: boolean): Promise<JsonRecord> {
  await requireFinance(ctx, actor);
  requireOwner(actor);
  const reason = text(input.reason).trim();
  requireReason(reason, actor.correlationId);
  const id = optionalText(input.periodId) ?? optionalText(input.id);
  const period = id ? await ctx.db.query("accountingPeriods").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", id)).unique() : null;
  if (!period) domainError("NOT_FOUND", "Accounting period not found.", { correlationId: actor.correlationId });
  if (reopen) {
    if (period.status !== "closed") domainError("CONFLICT", "Only a closed accounting period can be reopened.", { correlationId: actor.correlationId });
    const laterClosed = await ctx.db.query("accountingPeriods").withIndex("by_organization_status", (q) => q.eq("organizationId", actor.organization._id).eq("status", "closed")).collect();
    if (laterClosed.some((candidate) => candidate.periodStart > period.periodStart)) domainError("CONFLICT", "Reopen later accounting periods first.", { correlationId: actor.correlationId });
    const now = Date.now();
    await ctx.db.patch(period._id, { status: "open", reopenedAt: now, reopenedByUserId: actor.user._id, reopenReason: reason, updatedAt: now });
    await insertAudit(ctx, actor, { action: "accounting.period.reopen", entityType: "accounting_period", entityId: period.publicId, summary: `Reopened accounting period ${period.publicId}`, reason, before: { status: period.status }, after: { status: "open" } });
  } else {
    if (period.status !== "open") domainError("CONFLICT", "Accounting period is already closed.", { correlationId: actor.correlationId });
    const pending = await ctx.db.query("accountingSourcePostings").withIndex("by_organization_status", (q) => q.eq("organizationId", actor.organization._id).eq("status", "pending")).collect();
    if (pending.some((source) => { const day = localDate(source.occurredAt, actor.organization.timezone); return day >= period.periodStart && day <= period.periodEnd; })) domainError("CONFLICT", "Resolve pending source postings before closing the period.", { correlationId: actor.correlationId });
    const now = Date.now();
    await ctx.db.patch(period._id, { status: "closed", closedAt: now, closedByUserId: actor.user._id, closeReason: reason, updatedAt: now });
    await insertAudit(ctx, actor, { action: "accounting.period.close", entityType: "accounting_period", entityId: period.publicId, summary: `Closed accounting period ${period.publicId}`, reason, before: { status: period.status }, after: { status: "closed" } });
  }
  return periodView((await ctx.db.get(period._id))!, publicOrganizationId(actor.organization));
}

export async function accountingQuery(ctx: QueryCtx, actor: ActorContext, operation: string, input: JsonRecord): Promise<unknown> {
  switch (operation) {
    case "accounting.accounts.list":
    case "finance.accounts.list": return await listAccountingAccounts(ctx, actor, input);
    case "accounting.periods.list":
    case "finance.periods.list": return await listAccountingPeriods(ctx, actor, input);
    case "accounting.journal_entries.list":
    case "finance.journal_entries.list": return await listJournalEntries(ctx, actor, input);
    case "accounting.journal_entries.get":
    case "finance.journal_entries.get": return await getJournalEntry(ctx, actor, input);
    case "accounting.trial_balance":
    case "finance.trial_balance": return await trialBalance(ctx, actor, input);
    case "accounting.source_postings.list":
    case "finance.source_postings.list": return await listSourcePostings(ctx, actor, input);
    default: domainError("NOT_FOUND", `Unknown accounting query operation ${operation}.`, { correlationId: actor.correlationId });
  }
}

export async function accountingMutation(ctx: MutationCtx, actor: ActorContext, operation: string, input: JsonRecord): Promise<unknown> {
  switch (operation) {
    case "accounting.manual_journal.post":
    case "finance.manual_journal.post": return await postManualJournal(ctx, actor, input);
    case "accounting.source.post":
    case "finance.source.post": return await postAccountingSource(ctx, actor, input);
    case "accounting.source_postings.refresh":
    case "finance.source_postings.refresh": return await refreshSourceQueue(ctx, actor, input);
    case "accounting.entry.reverse":
    case "finance.entry.reverse": return await reverseEntry(ctx, actor, input);
    case "accounting.period.close":
    case "finance.period.close": return await closePeriod(ctx, actor, input, false);
    case "accounting.period.reopen":
    case "finance.period.reopen": return await closePeriod(ctx, actor, input, true);
    default: domainError("NOT_FOUND", `Unknown accounting mutation operation ${operation}.`, { correlationId: actor.correlationId });
  }
}
