import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertBranchAccess, domainError, publicBranchId, publicOrganizationId, requirePermission, type ActorContext } from "./security";
import { requireWorkspaceModule, resolveWorkspaceEntitlements, resolveWorkspacePreferences } from "./workspaceModules";
import { platformPlanEntitledModules } from "./platformPlanCatalog";
import { sourceQueueCoverageForReport, type SourceQueueCandidateFact } from "./accounting";

type Account = Doc<"accountingAccounts">;
type JournalEntry = Doc<"accountingJournalEntries">;
type JournalLine = Doc<"accountingJournalLines">;
type SourcePosting = Doc<"accountingSourcePostings">;
type Branch = Doc<"branches">;
type DomainRecord = Doc<"domainRecords">;
// The reporting boundary reads legacy `domainRecords.data` (a deliberate
// Convex `v.any()` persistence seam) and emits JSON-shaped projections. Keep
// this dynamic type local to that boundary; the public API remains typed.
type JsonObject = Record<string, unknown>;
type MoneyProjection = { amount: number; currency: string };
type StatementLineProjection = {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: MoneyProjection;
  entryIds: string[];
};
type StatementSectionProjection = { lines: StatementLineProjection[]; total: MoneyProjection };
type CashflowSectionProjection = {
  category: "operating" | "investing" | "financing";
  lines: StatementLineProjection[];
  netChange: MoneyProjection;
};
type MetricProjection = {
  key: string;
  label: string;
  status: "available" | "not_available" | "not_configured";
  value?: MoneyProjection | number;
  unit?: "money" | "count" | "days";
  sourceCount: number;
  drilldownIds: string[];
  note?: string;
};

const DISCLAIMER = "Management accounting projection for operational decision support. This is not statutory, tax, audit, or jurisdiction-specific financial reporting.";
const CASHFLOW_POLICY = {
  code: "cashflow-classification.v2",
  version: 2,
  description: "Cash on hand and card/bank-transfer clearing accounts are treated as cash. Each posted entry's cash movement is classified by its non-cash counterpart lines: investing when any counterpart is a non-current asset, otherwise financing when any counterpart is equity or a non-current liability, otherwise operating. Entries that only move money between cash accounts are internal transfers and are excluded from the classified sections.",
};
const CASH_CODES = new Set(["1100", "1110", "1120"]);
type SourceStatus = "pending" | "posted" | "unconfigured" | "excluded" | "failed" | "reversed";
type StatementGroup = JournalLine["statementGroup"];
type QueueCoverage = "proven" | "refresh_required" | "unavailable";
type ReconciliationStatus = "proven" | "unproven" | "not_available";
type ScopedBranchId = Id<"branches"> | undefined | null;
type ManagementMetricStatus = "available" | "not_available" | "not_configured";

function value(input: unknown): JsonObject {
  return input && typeof input === "object" && !Array.isArray(input) ? input as JsonObject : {};
}

function text(input: unknown, fallback = ""): string {
  return typeof input === "string" ? input : fallback;
}

function optionalText(input: unknown): string | undefined {
  const result = text(input).trim();
  return result || undefined;
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function dateOnly(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function localDate(timestamp: number, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // A malformed tenant timezone should not make an otherwise readable
    // management report crash; UTC remains an explicit fallback.
  }
  return dateOnly(timestamp);
}

function tenantToday(timezone: string): string {
  return localDate(Date.now(), timezone);
}

function validDate(input: unknown): string | undefined {
  const candidate = optionalText(input);
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return undefined;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate ? candidate : undefined;
}

function money(amount: number, currency: string): MoneyProjection {
  return { amount, currency };
}

function requireReporting(ctx: QueryCtx, actor: ActorContext): Promise<void> {
  return (async () => {
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
      requireWorkspaceModule("reporting", { entitledModules: entitlements.entitledModules, enabledModules: preferences.enabledModules });
    } catch {
      domainError("FEATURE_NOT_AVAILABLE", "The reporting workspace module is not enabled for this organization.", { correlationId: actor.correlationId, details: { module: "reporting" } });
    }
    requirePermission(actor, "reports.financial.read");
  })();
}

async function selectedBranch(ctx: QueryCtx, actor: ActorContext, branchId?: string): Promise<Branch | undefined> {
  if (!branchId) return undefined;
  const branch = await ctx.db.query("branches").withIndex("by_organization_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", branchId)).unique();
  assertBranchAccess(actor, branch);
  return branch ?? undefined;
}

function inActorBranchScope(actor: ActorContext, branchId: ScopedBranchId): boolean {
  // Unattributed/consolidated entries are organization-level facts. A
  // selected-branch actor must not receive them through a consolidated
  // report, because that would bypass the branch boundary.
  // A legacy public branch ID that cannot be resolved is also excluded rather
  // than being treated as an unattributed fact.
  if (branchId === null) return false;
  return branchId ? actor.branchScope === "all" || actor.branchIds.includes(branchId) : actor.branchScope === "all";
}

function inScope(actor: ActorContext, branch: Branch | undefined, entryBranchId: ScopedBranchId): boolean {
  if (!inActorBranchScope(actor, entryBranchId)) return false;
  if (branch) return entryBranchId === branch._id;
  return true;
}

function lineInScope(actor: ActorContext, branch: Branch | undefined, line: JournalLine): boolean {
  if (!inActorBranchScope(actor, line.branchId)) return false;
  if (branch) return line.branchId === branch._id;
  return true;
}

interface JournalBundle {
  entry: JournalEntry;
  lines: JournalLine[];
}

async function effectiveEntries(ctx: QueryCtx, actor: ActorContext, entries: JournalEntry[], branch: Branch | undefined, from?: string, to?: string): Promise<JournalBundle[]> {
  const selected = entries.filter((entry) => (entry.status === "posted" || entry.status === "reversed") && (!from || entry.postingDate >= from) && (!to || entry.postingDate <= to) && inScope(actor, branch, entry.branchId));
  const bundles: JournalBundle[] = [];
  for (const entry of selected) {
    const lines = (await ctx.db.query("accountingJournalLines").withIndex("by_entry", (q) => q.eq("organizationId", actor.organization._id).eq("journalEntryId", entry._id)).collect()).filter((line) => lineInScope(actor, branch, line));
    if (lines.length > 0) bundles.push({ entry, lines });
  }
  return bundles;
}

interface ReportContext {
  branch?: Branch;
  branchIdsByPublicId: Map<string, Id<"branches">>;
  fromDate: string;
  toDate: string;
  generatedAt: string;
  accounts: Map<string, Account>;
  sourceCounts: Record<SourceStatus, number>;
  sourceRows: SourcePosting[];
  // All journal entries for the organization, collected once per report
  // request and shared by the policy scan and the statement builders.
  entries: JournalEntry[];
  policies: Array<{ code: string; version: number }>;
  queueCoverage: QueueCoverage;
  warnings: string[];
  lastQueueProjectionAt?: string;
  membershipRevenueRecognition: ManagementMetricStatus;
  depreciationCoverage: ManagementMetricStatus;
}

async function contextFor(ctx: QueryCtx, actor: ActorContext, input: JsonObject): Promise<ReportContext> {
  await requireReporting(ctx, actor);
  const fromDate = validDate(input.fromDate);
  const toDate = validDate(input.toDate);
  if (!fromDate || !toDate) domainError("VALIDATION_ERROR", "Report dates must use YYYY-MM-DD.", { correlationId: actor.correlationId });
  if (fromDate > toDate) domainError("VALIDATION_ERROR", "Report fromDate must be on or before toDate.", { correlationId: actor.correlationId });
  const branch = await selectedBranch(ctx, actor, optionalText(input.branchId));
  const branches = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const branchIdsByPublicId = new Map<string, Id<"branches">>();
  for (const candidate of branches) if (candidate.publicId) branchIdsByPublicId.set(candidate.publicId, candidate._id);
  const rows = await ctx.db.query("accountingSourcePostings").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const sourceRows = rows.filter((row) => {
    const occurred = localDate(row.occurredAt, actor.organization.timezone);
    return occurred >= fromDate && occurred <= toDate && inScope(actor, branch, row.branchId);
  });
  const sourceCounts: Record<SourceStatus, number> = { pending: 0, posted: 0, unconfigured: 0, excluded: 0, failed: 0, reversed: 0 };
  for (const row of sourceRows) sourceCounts[row.status] += 1;
  const accountRows = await ctx.db.query("accountingAccounts").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const accounts = new Map(accountRows.map((account) => [account.code, account]));
  const entries = await ctx.db.query("accountingJournalEntries").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const policies = [...new Map(entries
    .filter((entry) => (entry.status === "posted" || entry.status === "reversed") && entry.postingDate >= fromDate && entry.postingDate <= toDate && inScope(actor, branch, entry.branchId) && entry.policyCode && entry.policyVersion)
    .map((entry) => [`${entry.policyCode}:${entry.policyVersion}`, { code: entry.policyCode!, version: entry.policyVersion! }])).values()];
  const queueCoverage = await sourceQueueCoverageForReport(ctx, actor, { branch, fromDate, toDate });
  const recognitionCandidates = queueCoverage.candidates.filter((candidate: SourceQueueCandidateFact) => candidate.candidate.sourceType === "membership_revenue_recognition");
  const depreciationCandidates = queueCoverage.candidates.filter((candidate: SourceQueueCandidateFact) => candidate.candidate.sourceType === "equipment_depreciation");
  const recognitionStatus: ManagementMetricStatus = recognitionCandidates.length === 0
    ? "not_available"
    : recognitionCandidates.every((candidate) => candidate.current && candidate.row && (candidate.row.status === "posted" || candidate.row.status === "reversed") && candidate.fact.status === undefined)
      ? "available"
      : "not_configured";
  const depreciationStatus: ManagementMetricStatus = depreciationCandidates.length === 0
    ? "not_available"
    : depreciationCandidates.every((candidate) => candidate.current && candidate.row && (candidate.row.status === "posted" || candidate.row.status === "reversed") && candidate.fact.status === undefined)
      ? "available"
      : "not_configured";
  const warnings = new Set<string>();
  if (queueCoverage.status !== "proven") warnings.add("Accounting source queue coverage is not proven for this report. Refresh the source queue before relying on completeness.");
  const unresolvedPostingCount = sourceRows.filter((row) => ["pending", "unconfigured", "excluded", "failed"].includes(row.status)).length;
  if (unresolvedPostingCount > 0) warnings.add("Some authoritative source facts are not posted; review the source queue before relying on these figures.");
  if (queueCoverage.postedDriftCount > 0) warnings.add(`${queueCoverage.postedDriftCount} posted accounting ${queueCoverage.postedDriftCount === 1 ? "source posting no longer matches" : "source postings no longer match"} the current operational record (amount, currency, or branch changed after posting). Review the source queue and use an owner reversal plus a corrected posting where needed.`);
  if (recognitionStatus === "not_configured") warnings.add("Membership revenue recognition coverage is incomplete; deferred amounts remain unearned until the validated service schedule is posted.");
  if (depreciationStatus === "not_configured") warnings.add("Fixed assets have incomplete depreciation coverage; affected assets remain gross until acquisition, date, cost, useful life, and lifecycle requirements are posted.");
  return { branch, branchIdsByPublicId, fromDate, toDate, generatedAt: iso(Date.now()), accounts, sourceCounts, sourceRows, entries, policies, queueCoverage: queueCoverage.status, warnings: [...warnings], lastQueueProjectionAt: queueCoverage.lastQueueProjectionAt, membershipRevenueRecognition: recognitionStatus, depreciationCoverage: depreciationStatus };
}

function reportMeta(actor: ActorContext, report: ReportContext): JsonObject {
  return {
    organizationId: publicOrganizationId(actor.organization),
    branchId: report.branch ? publicBranchId(report.branch) : undefined,
    fromDate: report.fromDate,
    toDate: report.toDate,
    timezone: actor.organization.timezone,
    currency: actor.organization.currency,
    generatedAt: report.generatedAt,
    policyVersions: report.policies,
    sourcePostingCounts: report.sourceCounts,
    queueCoverage: report.queueCoverage,
    lastQueueProjectionAt: report.lastQueueProjectionAt,
    depreciationCoverage: report.depreciationCoverage,
    warnings: report.warnings,
    disclaimer: DISCLAIMER,
  };
}

function accountId(account: Account | undefined, code: string): string {
  return account?.publicId ?? `acct-${code}`;
}

function lineAmount(line: JournalLine, group: StatementGroup): number {
  const creditNormal = group === "revenue" || group === "other_income" || group === "liability_current" || group === "liability_noncurrent" || group === "equity";
  return creditNormal ? line.creditMinor - line.debitMinor : line.debitMinor - line.creditMinor;
}

interface AccumulatedLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
  entryIds: Set<string>;
}

function sectionFromGroups(bundles: JournalBundle[], groups: Set<StatementGroup>, accounts: Map<string, Account>, currency: string): StatementSectionProjection {
  const rows = new Map<string, AccumulatedLine>();
  for (const bundle of bundles) {
    for (const line of bundle.lines) {
      if (!groups.has(line.statementGroup)) continue;
      const amount = lineAmount(line, line.statementGroup);
      if (amount === 0) continue;
      const key = line.accountCode;
      const current = rows.get(key) ?? { accountId: accountId(accounts.get(key), key), accountCode: key, accountName: line.accountName, amount: 0, entryIds: new Set<string>() };
      current.amount += amount;
      current.entryIds.add(bundle.entry.publicId);
      rows.set(key, current);
    }
  }
  const lines = [...rows.values()].filter((line) => line.amount !== 0).sort((left, right) => left.accountCode.localeCompare(right.accountCode)).map((line): StatementLineProjection => ({ accountId: line.accountId, accountCode: line.accountCode, accountName: line.accountName, amount: money(line.amount, currency), entryIds: [...line.entryIds].sort() }));
  return { lines, total: money(lines.reduce((sum, line) => sum + line.amount.amount, 0), currency) };
}

function amountOf(valueInput: unknown): number {
  if (typeof valueInput === "number" && Number.isSafeInteger(valueInput)) return valueInput;
  const amount = value(valueInput).amount;
  return typeof amount === "number" && Number.isSafeInteger(amount) ? amount : 0;
}

function metric(key: string, label: string, status: "available" | "not_available" | "not_configured", valueInput: MoneyProjection | number | undefined, unit: "money" | "count" | "days" | undefined, ids: string[], note?: string): MetricProjection {
  return { key, label, status, value: valueInput, unit, sourceCount: ids.length, drilldownIds: ids.slice(0, 100), note };
}

async function domainRows(ctx: QueryCtx, actor: ActorContext, entityType: string): Promise<DomainRecord[]> {
  return await ctx.db.query("domainRecords").withIndex("by_organization_type", (q) => q.eq("organizationId", actor.organization._id).eq("entityType", entityType)).collect();
}

function rowBranchId(row: DomainRecord): Id<"branches"> | undefined {
  return row.branchId;
}

function domainRowBranchId(report: ReportContext, row: DomainRecord): ScopedBranchId {
  const directBranchId = rowBranchId(row);
  if (directBranchId) return directBranchId;
  const legacyBranchPublicId = optionalText(value(row.data).branchId) ?? optionalText(value(row.data).homeBranchId);
  if (!legacyBranchPublicId) return undefined;
  return report.branchIdsByPublicId.get(legacyBranchPublicId) ?? null;
}

function inDomainScope(actor: ActorContext, report: ReportContext, row: DomainRecord): boolean {
  return inScope(actor, report.branch, domainRowBranchId(report, row));
}

function rowDate(row: DomainRecord, field = "createdAt", timezone = "UTC"): string {
  const data = value(row.data);
  const raw = data[field];
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (Number.isFinite(parsed)) return localDate(parsed, timezone);
    return raw.slice(0, 10);
  }
  return dateOnly(row.createdAt);
}

async function incomeStatement(ctx: QueryCtx, actor: ActorContext, input: JsonObject): Promise<JsonObject> {
  const report = await contextFor(ctx, actor, input);
  const bundles = await effectiveEntries(ctx, actor, report.entries, report.branch, report.fromDate, report.toDate);
  const currency = actor.organization.currency;
  const revenue = sectionFromGroups(bundles, new Set(["revenue"]), report.accounts, currency);
  const costOfSales = sectionFromGroups(bundles, new Set(["cost_of_sales"]), report.accounts, currency);
  const operatingExpenses = sectionFromGroups(bundles, new Set(["operating_expense"]), report.accounts, currency);
  const otherIncome = sectionFromGroups(bundles, new Set(["other_income"]), report.accounts, currency);
  const otherExpenses = sectionFromGroups(bundles, new Set(["other_expense"]), report.accounts, currency);
  const totalRevenue = revenue.total.amount + otherIncome.total.amount;
  const totalCosts = costOfSales.total.amount + operatingExpenses.total.amount + otherExpenses.total.amount;
  return { ...reportMeta(actor, report), revenue, costOfSales, operatingExpenses, otherIncome, otherExpenses, totalRevenue: money(totalRevenue, currency), totalCosts: money(totalCosts, currency), netIncome: money(totalRevenue - totalCosts, currency), membershipRevenueRecognition: report.membershipRevenueRecognition };
}

async function balanceSheet(ctx: QueryCtx, actor: ActorContext, input: JsonObject): Promise<JsonObject> {
  const report = await contextFor(ctx, actor, input);
  const bundles = await effectiveEntries(ctx, actor, report.entries, report.branch, undefined, report.toDate);
  const currency = actor.organization.currency;
  const currentAssets = sectionFromGroups(bundles, new Set(["asset_current"]), report.accounts, currency);
  const noncurrentAssets = sectionFromGroups(bundles, new Set(["asset_noncurrent"]), report.accounts, currency);
  const currentLiabilities = sectionFromGroups(bundles, new Set(["liability_current"]), report.accounts, currency);
  const noncurrentLiabilities = sectionFromGroups(bundles, new Set(["liability_noncurrent"]), report.accounts, currency);
  const equity = sectionFromGroups(bundles, new Set(["equity"]), report.accounts, currency);
  // All revenue and expense activity from ledger inception through the as-of
  // date. There is no period-close/retained-earnings roll-up yet, so this is
  // cumulative unclosed earnings — not current-period income. The legacy
  // `currentEarnings` field name is kept as an alias for one release so a
  // frontend and backend deployed minutes apart cannot disagree.
  const recognizedRevenue = sectionFromGroups(bundles, new Set(["revenue", "other_income"]), report.accounts, currency).total.amount;
  const cumulativeCosts = sectionFromGroups(bundles, new Set(["cost_of_sales", "operating_expense", "other_expense"]), report.accounts, currency).total.amount;
  const cumulativeEarnings = recognizedRevenue - cumulativeCosts;
  const totalAssets = currentAssets.total.amount + noncurrentAssets.total.amount;
  const totalLiabilities = currentLiabilities.total.amount + noncurrentLiabilities.total.amount;
  const totalEquity = equity.total.amount + cumulativeEarnings;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  const difference = totalAssets - totalLiabilitiesAndEquity;
  return { ...reportMeta(actor, report), asOfDate: report.toDate, assets: { current: currentAssets, noncurrent: noncurrentAssets }, liabilities: { current: currentLiabilities, noncurrent: noncurrentLiabilities }, equity, cumulativeEarnings: money(cumulativeEarnings, currency), currentEarnings: money(cumulativeEarnings, currency), totalAssets: money(totalAssets, currency), totalLiabilities: money(totalLiabilities, currency), totalEquity: money(totalEquity, currency), totalLiabilitiesAndEquity: money(totalLiabilitiesAndEquity, currency), difference: money(difference, currency), balanced: difference === 0 };
}

/** Classification of one non-cash counterpart line under cashflow-classification.v2. */
function counterpartCashflowCategory(line: JournalLine, accounts: Map<string, Account>): "operating" | "investing" | "financing" {
  const account = accounts.get(line.accountCode);
  if (line.accountCode === "1500" || line.statementGroup === "asset_noncurrent" || account?.statementGroup === "asset_noncurrent") return "investing";
  if (line.accountCode === "3000" || line.statementGroup === "equity" || line.statementGroup === "liability_noncurrent" || account?.accountType === "equity") return "financing";
  return "operating";
}

async function cashflowStatement(ctx: QueryCtx, actor: ActorContext, input: JsonObject): Promise<JsonObject> {
  const report = await contextFor(ctx, actor, input);
  const before = await effectiveEntries(ctx, actor, report.entries, report.branch, undefined, undefined);
  const period = before.filter((bundle) => bundle.entry.postingDate >= report.fromDate && bundle.entry.postingDate <= report.toDate);
  const currency = actor.organization.currency;
  const categoryRows = new Map<string, { category: "operating" | "investing" | "financing"; code: string; name: string; amount: number; ids: Set<string> }>();
  let opening = 0;
  let through = 0;
  for (const bundle of before) {
    for (const line of bundle.lines) {
      if (!CASH_CODES.has(line.accountCode)) continue;
      const delta = line.debitMinor - line.creditMinor;
      if (bundle.entry.postingDate < report.fromDate) opening += delta;
      if (bundle.entry.postingDate <= report.toDate) through += delta;
    }
  }
  const mixedEntryIds: string[] = [];
  for (const bundle of period) {
    const cashLines = bundle.lines.filter((line) => CASH_CODES.has(line.accountCode));
    if (cashLines.length === 0) continue;
    const counterparts = bundle.lines.filter((line) => !CASH_CODES.has(line.accountCode));
    // Every line is a cash account: an internal transfer between cash and
    // clearing accounts. Its net cash change is exactly zero, so excluding it
    // keeps the reconciliation intact while the classified sections stop
    // reporting money the business never received or spent.
    if (counterparts.length === 0) continue;
    const categories = new Set(counterparts.map((line) => counterpartCashflowCategory(line, report.accounts)));
    const category: "operating" | "investing" | "financing" = categories.has("investing") ? "investing" : categories.has("financing") ? "financing" : "operating";
    if (categories.size > 1) mixedEntryIds.push(bundle.entry.publicId);
    for (const line of cashLines) {
      const key = `${category}:${line.accountCode}`;
      const current = categoryRows.get(key) ?? { category, code: line.accountCode, name: line.accountName, amount: 0, ids: new Set<string>() };
      current.amount += line.debitMinor - line.creditMinor;
      current.ids.add(bundle.entry.publicId);
      categoryRows.set(key, current);
    }
  }
  if (mixedEntryIds.length > 0) {
    report.warnings.push(`${mixedEntryIds.length} journal ${mixedEntryIds.length === 1 ? "entry pairs" : "entries pair"} one cash movement with counterparts from more than one activity; the whole movement is classified by priority (investing, then financing, then operating) under ${CASHFLOW_POLICY.code}. Post separate journals to split such movements precisely.`);
  }
  const section = (category: "operating" | "investing" | "financing"): CashflowSectionProjection => {
    const lines = [...categoryRows.values()].filter((row) => row.category === category).sort((left, right) => left.code.localeCompare(right.code)).map((row): StatementLineProjection => ({ accountId: accountId(report.accounts.get(row.code), row.code), accountCode: row.code, accountName: row.name, amount: money(row.amount, currency), entryIds: [...row.ids].sort() }));
    return { category, lines, netChange: money(lines.reduce((sum, line) => sum + line.amount.amount, 0), currency) };
  };
  const operating = section("operating");
  const investing = section("investing");
  const financing = section("financing");
  const netChange = operating.netChange.amount + investing.netChange.amount + financing.netChange.amount;
  // Keep the two sides independent: expected closing cash comes from opening
  // cash plus classified movements, while as-of cash comes directly from the
  // cash-account position through the report end date. A zero difference is
  // only an arithmetic agreement; it is not a completeness assertion while
  // the source queue still requires a refresh.
  const expectedClosingCash = opening + netChange;
  const asOfCash = through;
  const difference = expectedClosingCash - asOfCash;
  const reconciliationStatus: ReconciliationStatus = report.queueCoverage === "proven"
    ? difference === 0 ? "proven" : "not_available"
    : "unproven";
  const reconciliationNote = reconciliationStatus === "unproven"
    ? "Cash arithmetic agrees with the current ledger projection, but source queue coverage is not proven. Refresh the source queue before treating this reconciliation as complete."
    : reconciliationStatus === "not_available"
      ? "The classified cash movement does not agree with the independent cash-account position through the as-of date."
      : undefined;
  return {
    ...reportMeta(actor, report),
    openingCash: money(opening, currency),
    operating,
    investing,
    financing,
    netChange: money(netChange, currency),
    closingCash: money(asOfCash, currency),
    reconciliationDifference: money(difference, currency),
    reconciliationStatus,
    reconciliation: {
      status: reconciliationStatus,
      expectedClosingCash: money(expectedClosingCash, currency),
      asOfCash: money(asOfCash, currency),
      difference: money(difference, currency),
      note: reconciliationNote,
    },
    balanced: reconciliationStatus === "proven" && difference === 0,
    classificationPolicy: CASHFLOW_POLICY,
  };
}

async function generalManagerAnalysis(ctx: QueryCtx, actor: ActorContext, input: JsonObject): Promise<JsonObject> {
  const report = await contextFor(ctx, actor, input);
  const currency = actor.organization.currency;
  const currentSnapshot = report.toDate === tenantToday(actor.organization.timezone);
  const sourceRows = report.sourceRows;
  const postedSources = sourceRows.filter((row) => row.status === "posted");
  const membershipRows = postedSources.filter((row) => row.sourceType === "membership_sale" || row.sourceType === "membership_renewal");
  const collectionRows = postedSources.filter((row) => row.sourceType === "payment" || row.sourceType === "refund" || row.sourceType === "void");
  const collectionValue = collectionRows.reduce((sum, row) => sum + (row.sourceType === "payment" ? row.amountMinor ?? 0 : -(row.amountMinor ?? 0)), 0);
  const deferredValue = membershipRows.reduce((sum, row) => sum + (row.amountMinor ?? 0), 0);
  const metrics: MetricProjection[] = [
    metric("collections", "Recorded collections", collectionRows.length > 0 ? "available" : "not_available", collectionRows.length > 0 ? money(collectionValue, currency) : undefined, "money", collectionRows.map((row) => row.publicId), collectionRows.length > 0 ? undefined : "No posted payment source facts are available in this period."),
    metric("deferred_membership_sales", "Deferred membership sales", membershipRows.length > 0 ? "available" : "not_available", membershipRows.length > 0 ? money(deferredValue, currency) : undefined, "money", membershipRows.map((row) => row.publicId), membershipRows.length > 0 ? "Membership sales follow the configured deferred policy." : "No posted membership source facts are available in this period."),
  ];

  const deliveryRows = await ctx.db.query("renewalDeliveries").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const deliveries = deliveryRows.filter((row) => localDate(row.createdAt, actor.organization.timezone) >= report.fromDate && localDate(row.createdAt, actor.organization.timezone) <= report.toDate && inScope(actor, report.branch, row.branchId));
  metrics.push(metric("renewal_deliveries", "Renewal recovery deliveries", deliveries.length > 0 ? "available" : "not_available", deliveries.length > 0 ? deliveries.length : undefined, "count", deliveries.map((row) => row.publicId), deliveries.length > 0 ? `Outcomes: ${["completed", "sent", "sandboxed", "suppressed", "cancelled", "failed"].map((status) => `${status}=${deliveries.filter((row) => row.status === status).length}`).join(", ")}.` : "No renewal delivery decisions were recorded in this period."));

  const charges = (await domainRows(ctx, actor, "charge")).filter((row) => inDomainScope(actor, report, row));
  const outstanding = charges.filter((row) => {
    const charge = value(row.data);
    const due = optionalText(charge.dueDate) ?? rowDate(row, "createdAt", actor.organization.timezone);
    return due <= report.toDate && !["void", "refunded"].includes(text(charge.status)) && amountOf(charge.outstandingAmount) > 0;
  });
  metrics.push(currentSnapshot
    ? metric("outstanding_balances", "Outstanding collectible balances", outstanding.length > 0 ? "available" : "not_available", outstanding.length > 0 ? money(outstanding.reduce((sum, row) => sum + amountOf(value(row.data).outstandingAmount), 0), currency) : undefined, "money", outstanding.map((row) => row.publicId), outstanding.length > 0 ? "Current snapshot from charge records." : "No collectible outstanding charge facts are available as of the report date.")
    : metric("outstanding_balances", "Outstanding collectible balances", "not_available", undefined, "money", [], "Historical outstanding balances are unavailable because the charge model has no immutable balance-transition history."));

  const alerts = await ctx.db.query("inventoryAlerts").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const openAlerts = alerts.filter((row) => row.status === "open" && inScope(actor, report.branch, row.branchId));
  metrics.push(currentSnapshot
    ? metric("low_stock", "Open low-stock alerts", "available", openAlerts.length, "count", openAlerts.map((row) => row.publicId), openAlerts.length > 0 ? "Current snapshot from inventory alerts." : "No open low-stock alerts are recorded.")
    : metric("low_stock", "Open low-stock alerts", "not_available", undefined, "count", [], "Historical low-stock state is unavailable because inventory alerts are mutable projections without transition history."));

  const orders = await ctx.db.query("purchaseOrders").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const openOrders = orders.filter((row) => ["approved", "partially_received"].includes(row.status) && inScope(actor, report.branch, row.branchId));
  const commitment = openOrders.reduce((sum, row) => sum + row.lines.reduce((lineSum, line) => lineSum + Math.max(0, line.orderedQuantity - line.receivedQuantity) * line.unitCostMinor, 0), 0);
  metrics.push(currentSnapshot
    ? metric("supplier_commitments", "Open supplier commitments", "available", money(commitment, currency), "money", openOrders.map((row) => row.publicId), openOrders.length > 0 ? "Current snapshot from purchase order projections." : "No open approved supplier commitments are recorded.")
    : metric("supplier_commitments", "Open supplier commitments", "not_available", undefined, "money", [], "Historical supplier commitments are unavailable because purchase-order status is mutable without transition history."));

  const facilities = await ctx.db.query("facilityTasks").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const completedFacilities = facilities.filter((row) => row.status === "completed" && localDate(row.completedAt ?? row.updatedAt, actor.organization.timezone) >= report.fromDate && localDate(row.completedAt ?? row.updatedAt, actor.organization.timezone) <= report.toDate && inScope(actor, report.branch, row.branchId));
  const facilityCost = completedFacilities.reduce((sum, row) => sum + (row.suppliesCostMinor ?? 0), 0);
  metrics.push(metric("facility_supplies_cost", "Recorded facility supplies cost", completedFacilities.some((row) => row.suppliesCostMinor !== undefined) ? "available" : "not_configured", completedFacilities.some((row) => row.suppliesCostMinor !== undefined) ? money(facilityCost, currency) : undefined, "money", completedFacilities.filter((row) => row.suppliesCostMinor !== undefined).map((row) => row.publicId), completedFacilities.some((row) => row.suppliesCostMinor !== undefined) ? undefined : "Facility task records exist, but no completed supplies costs are configured."));

  const issues = await ctx.db.query("equipmentIssues").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const openIssues = issues.filter((row) => ["open", "in_progress"].includes(row.status) && inScope(actor, report.branch, row.branchId));
  metrics.push(currentSnapshot
    ? metric("equipment_downtime", "Open equipment issues", "available", openIssues.reduce((sum, row) => sum + (row.downtimeDays ?? 0), 0), "days", openIssues.map((row) => row.publicId), openIssues.length > 0 ? "Current snapshot from equipment issue projections." : "No open equipment issues are recorded.")
    : metric("equipment_downtime", "Open equipment issues", "not_available", undefined, "days", [], "Historical equipment issue state is unavailable because issue status is mutable without transition history."));
  const workOrders = await ctx.db.query("equipmentWorkOrders").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  const completedRepairs = workOrders.filter((row) => row.status === "completed" && localDate(row.completedAt ?? row.updatedAt, actor.organization.timezone) >= report.fromDate && localDate(row.completedAt ?? row.updatedAt, actor.organization.timezone) <= report.toDate && inScope(actor, report.branch, row.branchId));
  const repairCostConfigured = completedRepairs.some((row) => row.totalCostMinor !== undefined || row.partsCostMinor !== undefined || row.laborCostMinor !== undefined);
  metrics.push(metric("equipment_repair_cost", "Recorded equipment repair cost", repairCostConfigured ? "available" : "not_configured", repairCostConfigured ? money(completedRepairs.reduce((sum, row) => sum + (row.totalCostMinor ?? (row.partsCostMinor ?? 0) + (row.laborCostMinor ?? 0)), 0), currency) : undefined, "money", completedRepairs.filter((row) => row.totalCostMinor !== undefined || row.partsCostMinor !== undefined || row.laborCostMinor !== undefined).map((row) => row.publicId), repairCostConfigured ? undefined : "No completed repair work orders with configured costs are recorded in this period."));

  const shifts = (await domainRows(ctx, actor, "shift")).filter((row) => inDomainScope(actor, report, row) && rowDate(row, "closedAt", actor.organization.timezone) >= report.fromDate && rowDate(row, "closedAt", actor.organization.timezone) <= report.toDate);
  const varianceRows = shifts.filter((row) => typeof value(row.data).variance === "object" || typeof value(row.data).variance === "number");
  if (varianceRows.length > 0) {
    metrics.push(metric("cash_variance", "Recorded cash shift variance", "available", money(varianceRows.reduce((sum, row) => sum + amountOf(value(row.data).variance), 0), currency), "money", varianceRows.map((row) => row.publicId)));
  } else {
    metrics.push(metric("cash_variance", "Recorded cash shift variance", "not_available", undefined, "money", [], "No authoritative closed cash-shift variance records are available in this period."));
  }

  return { ...reportMeta(actor, report), metrics };
}

export async function managementReportQuery(ctx: QueryCtx, actor: ActorContext, operation: string, input: JsonObject): Promise<unknown> {
  switch (operation) {
    case "reports.income_statement": return await incomeStatement(ctx, actor, input);
    case "reports.balance_sheet": return await balanceSheet(ctx, actor, input);
    case "reports.cashflow_statement": return await cashflowStatement(ctx, actor, input);
    case "reports.gm_analysis": return await generalManagerAnalysis(ctx, actor, input);
    default: domainError("NOT_FOUND", `Unknown management report operation ${operation}.`, { correlationId: actor.correlationId });
  }
}
