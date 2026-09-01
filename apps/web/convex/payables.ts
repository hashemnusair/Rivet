import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  assertBranchAccess,
  domainError,
  hasPermission,
  publicBranchId,
  publicOrganizationId,
  publicUserId,
  requireReason,
  type ActorContext,
} from "./security";
import {
  audit,
  branchByPublicId,
  cashShiftPublicId,
  idempotentResult,
  openCashShiftForBranch,
  requireOperations,
  requireOperationsWrite,
  saveIdempotentResult,
} from "./operations";

type ReadContext = QueryCtx | MutationCtx;
type Data = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Branch = Doc<"branches">;
type SupplierPaymentRow = Doc<"supplierPayments">;
type PayableSourceType = "purchase_order" | "stock_receive" | "facility_supplies" | "equipment_acquisition" | "equipment_repair";
type PostingStatus = "not_posted" | "pending" | "posted" | "failed" | "reversed";
type PayableStatus = "unpaid" | "partially_paid" | "paid" | "reversed";

const PAYMENT_METHODS = ["cash", "bank_transfer", "cliq"] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];
const PAYABLE_STATUSES: readonly PayableStatus[] = ["unpaid", "partially_paid", "paid", "reversed"];
const AGING_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_EXPORT_ROWS = 5_000;
const MAX_RECONCILIATION_ITEMS = 100;
const MAX_ALLOCATIONS = 50;
const MAX_REFERENCE_LENGTH = 120;
const MAX_NOTES_LENGTH = 500;
const MAX_IDEMPOTENCY_KEY_LENGTH = 160;
const DAY_MS = 86_400_000;

export interface SupplierCashShiftMovements {
  /** Cash handed to suppliers from the drawer during this shift. */
  paidMinor: number;
  /** Cash returned to the drawer during this shift by reversing a cash payment. */
  reversedMinor: number;
  paymentCount: number;
  reversalCount: number;
}

interface PayableProjection {
  id: string;
  sourceType: PayableSourceType;
  sourceId: string;
  sourceLabel: string;
  supplierId: Id<"suppliers">;
  supplierPublicId: string;
  supplierName: string;
  branchId: Id<"branches">;
  branchPublicId: string;
  branchName: string;
  currency: string;
  receivedAt: number;
  dueDate?: string;
  ageDays: number;
  originalMinor: number;
  paidMinor: number;
  remainingMinor: number;
  status: PayableStatus;
  externalReference?: string;
  ledgerPostingStatus: PostingStatus;
  href: string;
}

interface ReconciliationItem {
  id: string;
  sourceType: PayableSourceType;
  sourceId: string;
  sourceLabel: string;
  vendorHint?: string;
  branchId: Id<"branches">;
  branchPublicId: string;
  branchName: string;
  recordedAt: number;
  amountMinor: number;
  currency: string;
  reason: string;
  ledgerPostingStatus: PostingStatus;
  href: string;
}

function value(input: unknown): Data {
  return input && typeof input === "object" && !Array.isArray(input) ? input as Data : {};
}

function text(input: unknown, fallback = ""): string {
  return typeof input === "string" ? input : fallback;
}

function optionalText(input: unknown): string | undefined {
  const result = text(input).trim();
  return result || undefined;
}

function integer(input: unknown, fallback = 0): number {
  return typeof input === "number" && Number.isSafeInteger(input) ? input : fallback;
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function money(minor: number, currency: string): { amount: number; currency: string } {
  return { amount: minor, currency };
}

function localDate(timestamp: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
}

/** Whole calendar days between two tenant-local dates; never negative. */
function calendarDaysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / DAY_MS));
}

function agingBucket(ageDays: number): (typeof AGING_BUCKETS)[number] {
  if (ageDays <= 30) return "0-30";
  if (ageDays <= 60) return "31-60";
  if (ageDays <= 90) return "61-90";
  return "90+";
}

function truncateLabel(label: string, max = 96): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function payableIdFor(sourceType: PayableSourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

function payableStatusFor(ledger: PostingStatus, paidMinor: number, remainingMinor: number): PayableStatus {
  if (ledger === "reversed") return "reversed";
  if (remainingMinor === 0) return "paid";
  return paidMinor > 0 ? "partially_paid" : "unpaid";
}

/**
 * Payables are readable by whoever runs purchasing or reads finance. Both are
 * server-owned capabilities; the role name is never consulted here.
 */
function requirePayablesRead(actor: ActorContext): void {
  if (!hasPermission(actor, "operations.manage") && !hasPermission(actor, "reports.financial.read")) {
    domainError("FORBIDDEN", "Supplier payables are limited to purchasing managers and finance readers.", { correlationId: actor.correlationId });
  }
}

function branchVisible(actor: ActorContext, branchId: Id<"branches">): boolean {
  return actor.branchScope === "all" || actor.branchIds.includes(branchId);
}

async function branchMap(ctx: ReadContext, actor: ActorContext): Promise<Map<string, Branch>> {
  const branches = await ctx.db.query("branches").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  return new Map(branches.map((branch) => [String(branch._id), branch]));
}

async function supplierMap(ctx: ReadContext, actor: ActorContext): Promise<Map<string, Doc<"suppliers">>> {
  const suppliers = await ctx.db.query("suppliers").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  return new Map(suppliers.map((supplier) => [String(supplier._id), supplier]));
}

async function supplierPaymentRows(ctx: ReadContext, actor: ActorContext): Promise<SupplierPaymentRow[]> {
  return await ctx.db.query("supplierPayments").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
}

/**
 * Supplier cash is part of the authoritative drawer story. Money leaves the
 * drawer during the shift that funded the payment and comes back during the
 * shift that recorded the reversal, which may be a later shift; both sides
 * are counted where they physically happened so no shift closes on a number
 * the drawer cannot match.
 */
export async function supplierCashShiftMovements(ctx: ReadContext, actor: ActorContext, shiftPublicId: string): Promise<SupplierCashShiftMovements> {
  const funded = await ctx.db.query("supplierPayments").withIndex("by_organization_shift", (q) => q.eq("organizationId", actor.organization._id).eq("shiftPublicId", shiftPublicId)).collect();
  const returned = await ctx.db.query("supplierPayments").withIndex("by_organization_reversal_shift", (q) => q.eq("organizationId", actor.organization._id).eq("reversalShiftPublicId", shiftPublicId)).collect();
  const paid = funded.filter((payment) => payment.method === "cash");
  const reversed = returned.filter((payment) => payment.method === "cash" && payment.status === "reversed");
  return {
    paidMinor: paid.reduce((sum, payment) => sum + payment.amountMinor, 0),
    reversedMinor: reversed.reduce((sum, payment) => sum + payment.amountMinor, 0),
    paymentCount: paid.length,
    reversalCount: reversed.length,
  };
}

/**
 * Cash supplier payments recorded at a branch on one tenant-local date, for
 * the daily reconciliation view. Reversals are reported separately so the
 * day's drawer story stays additive.
 */
export async function supplierPaymentsForDay(ctx: ReadContext, actor: ActorContext, branchId: Id<"branches">, date: string): Promise<{ cashPaidMinor: number; cashReturnedMinor: number; totalPaidMinor: number; count: number }> {
  const rows = (await supplierPaymentRows(ctx, actor)).filter((row) => row.branchId === branchId);
  const timeZone = actor.organization.timezone;
  const paidToday = rows.filter((row) => localDate(row.occurredAt, timeZone) === date);
  const returnedToday = rows.filter((row) => row.status === "reversed" && row.method === "cash" && row.reversedAt !== undefined && localDate(row.reversedAt, timeZone) === date);
  return {
    cashPaidMinor: paidToday.filter((row) => row.method === "cash").reduce((sum, row) => sum + row.amountMinor, 0),
    cashReturnedMinor: returnedToday.reduce((sum, row) => sum + row.amountMinor, 0),
    totalPaidMinor: paidToday.reduce((sum, row) => sum + row.amountMinor, 0),
    count: paidToday.length,
  };
}

function paidByPayable(payments: SupplierPaymentRow[]): Map<string, number> {
  const paid = new Map<string, number>();
  for (const payment of payments) {
    if (payment.status !== "recorded") continue;
    for (const allocation of payment.allocations) paid.set(allocation.payableId, (paid.get(allocation.payableId) ?? 0) + allocation.amountMinor);
  }
  return paid;
}

function purchaseOrderLabel(order: Doc<"purchaseOrders">): string {
  const lines = order.lines.map((line) => `${line.productName} × ${line.receivedQuantity || line.orderedQuantity}`).join(", ");
  return truncateLabel(`Purchase order · ${lines || "no lines"}`);
}

function purchaseOrderHref(order: Doc<"purchaseOrders">): string {
  return `/operations?tab=orders&order=${encodeURIComponent(order.publicId)}`;
}

function receivedAmountMinor(order: Doc<"purchaseOrders">): number | undefined {
  let total = 0;
  for (const line of order.lines) {
    const lineTotal = line.receivedQuantity * line.unitCostMinor;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(total + lineTotal)) return undefined;
    total += lineTotal;
  }
  return total;
}

/**
 * Supplier-attributed payables: fully received purchase orders placed with a
 * saved supplier. Nothing is stored; the projection is recomputed from the
 * order and the recorded (non-reversed) payment allocations every time.
 */
async function projectPayables(ctx: ReadContext, actor: ActorContext, scope: { branch?: Branch } = {}): Promise<PayableProjection[]> {
  const currency = actor.organization.currency.toUpperCase();
  const timeZone = actor.organization.timezone;
  const today = localDate(Date.now(), timeZone);
  const [branches, suppliers, payments, orders] = await Promise.all([
    branchMap(ctx, actor),
    supplierMap(ctx, actor),
    supplierPaymentRows(ctx, actor),
    ctx.db.query("purchaseOrders").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect(),
  ]);
  const paid = paidByPayable(payments);
  const payables: PayableProjection[] = [];
  for (const order of orders) {
    if (order.status !== "received" || !order.supplierId || order.sourceType === "private") continue;
    if (!branchVisible(actor, order.branchId) || (scope.branch && order.branchId !== scope.branch._id)) continue;
    if (order.currency.toUpperCase() !== currency) continue;
    const supplier = suppliers.get(String(order.supplierId));
    const branch = branches.get(String(order.branchId));
    if (!supplier || !branch) continue;
    const originalMinor = receivedAmountMinor(order);
    if (originalMinor === undefined || originalMinor <= 0) continue;
    const id = payableIdFor("purchase_order", order.publicId);
    const paidMinor = Math.min(originalMinor, paid.get(id) ?? 0);
    const remainingMinor = originalMinor - paidMinor;
    const ledgerPostingStatus: PostingStatus = order.financialPostingStatus ?? "not_posted";
    const receivedAt = order.receivedAt ?? order.updatedAt;
    payables.push({
      id,
      sourceType: "purchase_order",
      sourceId: order.publicId,
      sourceLabel: purchaseOrderLabel(order),
      supplierId: order.supplierId,
      supplierPublicId: supplier.publicId,
      supplierName: order.supplierName,
      branchId: order.branchId,
      branchPublicId: publicBranchId(branch),
      branchName: branch.name,
      currency,
      receivedAt,
      ageDays: calendarDaysBetween(localDate(receivedAt, timeZone), today),
      originalMinor,
      paidMinor,
      remainingMinor,
      status: payableStatusFor(ledgerPostingStatus, paidMinor, remainingMinor),
      externalReference: order.supplierInvoiceReference,
      ledgerPostingStatus,
      href: purchaseOrderHref(order),
    });
  }
  payables.sort((left, right) => left.receivedAt - right.receivedAt || left.id.localeCompare(right.id));
  return payables;
}

/**
 * 2100 balances that no supplier account can own. They are listed so the
 * finance reader can reconcile the ledger, and never allocated to a supplier.
 */
async function projectReconciliationItems(ctx: ReadContext, actor: ActorContext, scope: { branch?: Branch } = {}): Promise<ReconciliationItem[]> {
  const currency = actor.organization.currency.toUpperCase();
  const branches = await branchMap(ctx, actor);
  const inScope = (branchId: Id<"branches">) => branchVisible(actor, branchId) && (!scope.branch || branchId === scope.branch._id);
  const items: ReconciliationItem[] = [];
  const push = (item: Omit<ReconciliationItem, "id" | "branchPublicId" | "branchName">) => {
    const branch = branches.get(String(item.branchId));
    if (!branch || !inScope(item.branchId)) return;
    items.push({ ...item, id: payableIdFor(item.sourceType, item.sourceId), branchPublicId: publicBranchId(branch), branchName: branch.name });
  };
  const orders = await ctx.db.query("purchaseOrders").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  for (const order of orders) {
    if (order.status !== "received") continue;
    const amountMinor = receivedAmountMinor(order);
    if (amountMinor === undefined || amountMinor <= 0) continue;
    const privateSource = !order.supplierId || order.sourceType === "private";
    const foreignCurrency = order.currency.toUpperCase() !== currency;
    if (!privateSource && !foreignCurrency) continue;
    push({ sourceType: "purchase_order", sourceId: order.publicId, sourceLabel: purchaseOrderLabel(order), vendorHint: privateSource ? undefined : order.supplierName, branchId: order.branchId, recordedAt: order.receivedAt ?? order.updatedAt, amountMinor, currency: order.currency.toUpperCase(), reason: foreignCurrency ? `Recorded in ${order.currency.toUpperCase()}, not ${currency}; settle it with a manual journal.` : "Private purchase: no supplier is recorded, so this balance cannot be assigned to a supplier account.", ledgerPostingStatus: order.financialPostingStatus ?? "not_posted", href: purchaseOrderHref(order) });
  }
  const movements = await ctx.db.query("stockMovements").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  for (const movement of movements) {
    if (movement.type !== "receive" || movement.referenceType === "purchase_order") continue;
    const amountMinor = movement.totalCostMinor ?? (movement.unitCostMinor === undefined ? undefined : movement.unitCostMinor * movement.quantity);
    if (amountMinor === undefined || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) continue;
    push({ sourceType: "stock_receive", sourceId: movement.publicId, sourceLabel: truncateLabel(`Stock received · ${movement.productName ?? movement.productSku ?? "item"} × ${movement.quantity}`), branchId: movement.branchId, recordedAt: movement.occurredAt, amountMinor, currency: (movement.totalCostCurrency ?? movement.unitCostCurrency ?? currency).toUpperCase(), reason: "Stock was received outside a purchase order, so no supplier is recorded for this cost.", ledgerPostingStatus: movement.financialPostingStatus, href: `/operations?tab=inventory&movement=${encodeURIComponent(movement.publicId)}` });
  }
  const tasks = await ctx.db.query("facilityTasks").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  for (const task of tasks) {
    if (task.status !== "completed" || task.suppliesCostMinor === undefined || task.suppliesCostMinor <= 0) continue;
    push({ sourceType: "facility_supplies", sourceId: task.publicId, sourceLabel: truncateLabel(`Facility supplies · ${task.title}`), branchId: task.branchId, recordedAt: task.completedAt ?? task.updatedAt, amountMinor: task.suppliesCostMinor, currency: (task.suppliesCostCurrency ?? currency).toUpperCase(), reason: "Supplies cost was recorded on a completed maintenance task; no supplier is recorded.", ledgerPostingStatus: task.financialPostingStatus, href: `/maintenance?task=${encodeURIComponent(task.publicId)}` });
  }
  const assets = await ctx.db.query("equipmentAssets").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  for (const asset of assets) {
    if (asset.purchaseCostMinor === undefined || asset.purchaseCostMinor <= 0) continue;
    const purchaseTimestamp = asset.purchaseDate ? Date.parse(`${asset.purchaseDate}T12:00:00.000Z`) : Number.NaN;
    push({ sourceType: "equipment_acquisition", sourceId: asset.publicId, sourceLabel: truncateLabel(`Equipment purchase · ${asset.code} ${asset.name}`), vendorHint: asset.manufacturer, branchId: asset.branchId, recordedAt: Number.isFinite(purchaseTimestamp) ? purchaseTimestamp : asset.createdAt, amountMinor: asset.purchaseCostMinor, currency: (asset.purchaseCostCurrency ?? currency).toUpperCase(), reason: "Equipment purchase cost is recorded on the machine; the manufacturer is not a supplier account.", ledgerPostingStatus: "not_posted", href: `/operations?tab=equipment&asset=${encodeURIComponent(asset.publicId)}` });
  }
  const workOrders = await ctx.db.query("equipmentWorkOrders").withIndex("by_organization", (q) => q.eq("organizationId", actor.organization._id)).collect();
  for (const order of workOrders) {
    if (order.status !== "completed") continue;
    const combined = (order.partsCostMinor ?? 0) + (order.laborCostMinor ?? 0);
    const amountMinor = order.totalCostMinor ?? (Number.isSafeInteger(combined) ? combined : undefined);
    if (amountMinor === undefined || amountMinor <= 0) continue;
    push({ sourceType: "equipment_repair", sourceId: order.publicId, sourceLabel: truncateLabel(`Equipment repair · ${order.description}`), vendorHint: order.vendorName, branchId: order.branchId, recordedAt: order.completedAt ?? order.updatedAt, amountMinor, currency: (order.costCurrency ?? currency).toUpperCase(), reason: "Repair cost is recorded on a completed work order; the vendor name is a note, not a supplier account.", ledgerPostingStatus: order.financialPostingStatus, href: `/operations?tab=equipment&workOrder=${encodeURIComponent(order.publicId)}` });
  }
  items.sort((left, right) => right.recordedAt - left.recordedAt || left.id.localeCompare(right.id));
  return items;
}

function payableView(payable: PayableProjection): Data {
  return {
    id: payable.id,
    sourceType: payable.sourceType,
    sourceId: payable.sourceId,
    sourceLabel: payable.sourceLabel,
    supplierId: payable.supplierPublicId,
    supplierName: payable.supplierName,
    branchId: payable.branchPublicId,
    branchName: payable.branchName,
    currency: payable.currency,
    receivedAt: iso(payable.receivedAt),
    dueDate: payable.dueDate,
    ageDays: payable.ageDays,
    original: money(payable.originalMinor, payable.currency),
    paid: money(payable.paidMinor, payable.currency),
    remaining: money(payable.remainingMinor, payable.currency),
    status: payable.status,
    externalReference: payable.externalReference,
    ledgerPostingStatus: payable.ledgerPostingStatus,
    href: payable.href,
  };
}

function reconciliationItemView(item: ReconciliationItem): Data {
  return {
    id: item.id,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    sourceLabel: item.sourceLabel,
    vendorHint: item.vendorHint,
    branchId: item.branchPublicId,
    branchName: item.branchName,
    recordedAt: iso(item.recordedAt),
    amount: money(item.amountMinor, item.currency),
    reason: item.reason,
    ledgerPostingStatus: item.ledgerPostingStatus,
    href: item.href,
  };
}

interface PayableFilters {
  branch?: Branch;
  supplier?: Doc<"suppliers">;
  status: PayableStatus | "open" | "all";
  search?: string;
}

async function resolveFilters(ctx: ReadContext, actor: ActorContext, input: Data): Promise<PayableFilters> {
  const requestedBranch = optionalText(input.branchId);
  const branch = requestedBranch ? await branchByPublicId(ctx, actor, requestedBranch) : undefined;
  const requestedSupplier = optionalText(input.supplierId);
  const supplier = requestedSupplier ? await ctx.db.query("suppliers").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", requestedSupplier)).unique() : null;
  if (requestedSupplier && !supplier) domainError("NOT_FOUND", "Supplier not found.", { correlationId: actor.correlationId });
  const requestedStatus = optionalText(input.status) ?? "open";
  if (requestedStatus !== "open" && requestedStatus !== "all" && !PAYABLE_STATUSES.includes(requestedStatus as PayableStatus)) domainError("VALIDATION_ERROR", "Payable status filter is invalid.", { correlationId: actor.correlationId });
  const search = optionalText(input.search)?.toLowerCase();
  if (search && search.length > 120) domainError("VALIDATION_ERROR", "Search text is too long.", { correlationId: actor.correlationId });
  return { branch, supplier: supplier ?? undefined, status: requestedStatus as PayableFilters["status"], search };
}

function matchesFilters(payable: PayableProjection, filters: PayableFilters): boolean {
  if (filters.supplier && payable.supplierId !== filters.supplier._id) return false;
  if (filters.status === "open" ? payable.status !== "unpaid" && payable.status !== "partially_paid" : filters.status !== "all" && payable.status !== filters.status) return false;
  if (filters.search) {
    const haystack = `${payable.supplierName} ${payable.sourceId} ${payable.sourceLabel} ${payable.externalReference ?? ""} ${payable.branchName}`.toLowerCase();
    if (!haystack.includes(filters.search)) return false;
  }
  return true;
}

async function listPayables(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requirePayablesRead(actor);
  const filters = await resolveFilters(ctx, actor, input);
  const currency = actor.organization.currency.toUpperCase();
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, integer(input.pageSize, DEFAULT_PAGE_SIZE)));
  const cursorText = optionalText(input.cursor);
  const offset = cursorText === undefined ? 0 : Number.parseInt(cursorText, 10);
  if (cursorText !== undefined && (!Number.isSafeInteger(offset) || offset < 0)) domainError("VALIDATION_ERROR", "Payables cursor is invalid.", { correlationId: actor.correlationId });
  const matched = (await projectPayables(ctx, actor, { branch: filters.branch })).filter((payable) => matchesFilters(payable, filters));
  const page = matched.slice(offset, offset + pageSize);
  const supplierTotals = new Map<string, { supplierId: string; supplierName: string; outstandingMinor: number; openCount: number; oldestReceivedAt?: number }>();
  const aging = new Map<string, { outstandingMinor: number; count: number }>(AGING_BUCKETS.map((bucket) => [bucket, { outstandingMinor: 0, count: 0 }]));
  let outstandingMinor = 0;
  let originalMinor = 0;
  let paidMinor = 0;
  let openCount = 0;
  for (const payable of matched) {
    originalMinor += payable.originalMinor;
    paidMinor += payable.paidMinor;
    if (payable.remainingMinor <= 0 || payable.status === "reversed") continue;
    outstandingMinor += payable.remainingMinor;
    openCount += 1;
    const bucket = aging.get(agingBucket(payable.ageDays))!;
    bucket.outstandingMinor += payable.remainingMinor;
    bucket.count += 1;
    const supplier = supplierTotals.get(payable.supplierPublicId) ?? { supplierId: payable.supplierPublicId, supplierName: payable.supplierName, outstandingMinor: 0, openCount: 0, oldestReceivedAt: undefined };
    supplier.outstandingMinor += payable.remainingMinor;
    supplier.openCount += 1;
    supplier.oldestReceivedAt = supplier.oldestReceivedAt === undefined ? payable.receivedAt : Math.min(supplier.oldestReceivedAt, payable.receivedAt);
    supplierTotals.set(payable.supplierPublicId, supplier);
  }
  return {
    currency,
    items: page.map(payableView),
    nextCursor: offset + pageSize < matched.length ? String(offset + pageSize) : undefined,
    matchedCount: matched.length,
    totals: { outstanding: money(outstandingMinor, currency), original: money(originalMinor, currency), paid: money(paidMinor, currency), openCount },
    supplierTotals: [...supplierTotals.values()].sort((left, right) => right.outstandingMinor - left.outstandingMinor || left.supplierName.localeCompare(right.supplierName)).map((entry) => ({ supplierId: entry.supplierId, supplierName: entry.supplierName, outstanding: money(entry.outstandingMinor, currency), openCount: entry.openCount, oldestReceivedAt: entry.oldestReceivedAt === undefined ? undefined : iso(entry.oldestReceivedAt) })),
    aging: AGING_BUCKETS.map((bucket) => ({ bucket, outstanding: money(aging.get(bucket)!.outstandingMinor, currency), count: aging.get(bucket)!.count })),
  };
}

async function exportPayables(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requirePayablesRead(actor);
  const filters = await resolveFilters(ctx, actor, input);
  const matched = (await projectPayables(ctx, actor, { branch: filters.branch })).filter((payable) => matchesFilters(payable, filters));
  const rows = matched.slice(0, MAX_EXPORT_ROWS);
  return {
    currency: actor.organization.currency.toUpperCase(),
    generatedAt: iso(Date.now()),
    truncated: matched.length > rows.length,
    rows: rows.map((payable) => ({ supplierName: payable.supplierName, sourceLabel: payable.sourceLabel, sourceId: payable.sourceId, branchName: payable.branchName, receivedAt: iso(payable.receivedAt), dueDate: payable.dueDate, ageDays: payable.ageDays, original: money(payable.originalMinor, payable.currency), paid: money(payable.paidMinor, payable.currency), remaining: money(payable.remainingMinor, payable.currency), status: payable.status, externalReference: payable.externalReference, ledgerPostingStatus: payable.ledgerPostingStatus })),
  };
}

async function listReconciliationItems(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requirePayablesRead(actor);
  const requestedBranch = optionalText(input.branchId);
  const branch = requestedBranch ? await branchByPublicId(ctx, actor, requestedBranch) : undefined;
  const currency = actor.organization.currency.toUpperCase();
  const items = await projectReconciliationItems(ctx, actor, { branch });
  const sameCurrency = items.filter((item) => item.currency === currency);
  return {
    currency,
    count: items.length,
    total: money(sameCurrency.reduce((sum, item) => sum + item.amountMinor, 0), currency),
    foreignCurrencyCount: items.length - sameCurrency.length,
    truncated: items.length > MAX_RECONCILIATION_ITEMS,
    items: items.slice(0, MAX_RECONCILIATION_ITEMS).map(reconciliationItemView),
  };
}

async function supplierPaymentView(ctx: ReadContext, actor: ActorContext, row: SupplierPaymentRow, payablesById: Map<string, PayableProjection>, branches: Map<string, Branch>): Promise<Data> {
  const branch = branches.get(String(row.branchId));
  const supplier = await ctx.db.get(row.supplierId);
  const reversedBy = row.reversedByUserId ? await ctx.db.get(row.reversedByUserId) : null;
  return {
    id: row.publicId,
    organizationId: publicOrganizationId(actor.organization),
    supplierId: supplier?.publicId ?? String(row.supplierId),
    supplierName: row.supplierName,
    branchId: branch ? publicBranchId(branch) : String(row.branchId),
    branchName: branch?.name ?? "Branch",
    method: row.method,
    amount: money(row.amountMinor, row.currency),
    reference: row.reference,
    notes: row.notes,
    status: row.status,
    shiftId: row.shiftPublicId,
    allocations: row.allocations.map((allocation) => ({ payableId: allocation.payableId, sourceType: allocation.payableSourceType, sourceLabel: payablesById.get(allocation.payableId)?.sourceLabel ?? `Purchase order ${allocation.payableId.split(":")[1] ?? allocation.payableId}`, amount: money(allocation.amountMinor, row.currency) })),
    recordedById: String(row.recordedByUserId),
    recordedByName: row.recordedByName,
    occurredAt: iso(row.occurredAt),
    ledgerPostingStatus: row.financialPostingStatus,
    reversal: row.status === "reversed" ? { reason: row.reversalReason ?? "", reversedAt: iso(row.reversedAt ?? row.updatedAt), reversedById: reversedBy ? publicUserId(reversedBy) : String(row.reversedByUserId ?? ""), reversedByName: row.reversedByName ?? reversedBy?.fullName ?? "Staff", shiftId: row.reversalShiftPublicId, ledgerPostingStatus: row.reversalFinancialPostingStatus ?? "not_posted" } : undefined,
    idempotencyKey: row.idempotencyKey,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

async function supplierPaymentDetail(ctx: ReadContext, actor: ActorContext, row: SupplierPaymentRow): Promise<Data> {
  const branches = await branchMap(ctx, actor);
  const payables = await projectPayables(ctx, actor);
  const payablesById = new Map(payables.map((payable) => [payable.id, payable]));
  const view = await supplierPaymentView(ctx, actor, row, payablesById, branches);
  const branch = branches.get(String(row.branchId));
  const supplierRemainingMinor = payables.filter((payable) => payable.supplierId === row.supplierId && payable.status !== "reversed").reduce((sum, payable) => sum + payable.remainingMinor, 0);
  return {
    ...view,
    organization: { name: actor.organization.name },
    branch: { name: branch?.name ?? "Branch", code: branch?.code ?? "", address: branch?.address ?? "", phone: branch?.phone ?? "" },
    supplierRemaining: money(supplierRemainingMinor, row.currency),
    payables: row.allocations.map((allocation) => {
      const payable = payablesById.get(allocation.payableId);
      return payable
        ? { payableId: payable.id, sourceLabel: payable.sourceLabel, original: money(payable.originalMinor, payable.currency), paid: money(payable.paidMinor, payable.currency), remaining: money(payable.remainingMinor, payable.currency), status: payable.status }
        : { payableId: allocation.payableId, sourceLabel: `Purchase order ${allocation.payableId.split(":")[1] ?? allocation.payableId}`, original: money(allocation.amountMinor, row.currency), paid: money(allocation.amountMinor, row.currency), remaining: money(0, row.currency), status: "paid" as const };
    }),
  };
}

async function listSupplierPayments(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requirePayablesRead(actor);
  const requestedBranch = optionalText(input.branchId);
  const branch = requestedBranch ? await branchByPublicId(ctx, actor, requestedBranch) : undefined;
  const requestedSupplier = optionalText(input.supplierId);
  const supplier = requestedSupplier ? await ctx.db.query("suppliers").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", requestedSupplier)).unique() : null;
  if (requestedSupplier && !supplier) domainError("NOT_FOUND", "Supplier not found.", { correlationId: actor.correlationId });
  const payableId = optionalText(input.payableId);
  const page = Math.max(1, integer(input.page, 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, integer(input.pageSize, DEFAULT_PAGE_SIZE)));
  const rows = (await supplierPaymentRows(ctx, actor))
    .filter((row) => branchVisible(actor, row.branchId) && (!branch || row.branchId === branch._id) && (!supplier || row.supplierId === supplier._id) && (!payableId || row.allocations.some((allocation) => allocation.payableId === payableId)))
    .sort((left, right) => right.occurredAt - left.occurredAt || right.publicId.localeCompare(left.publicId));
  const branches = await branchMap(ctx, actor);
  const payablesById = new Map((await projectPayables(ctx, actor)).map((payable) => [payable.id, payable]));
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);
  const items = await Promise.all(slice.map((row) => supplierPaymentView(ctx, actor, row, payablesById, branches)));
  return { items, page, pageSize, totalItems: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) };
}

async function supplierPaymentByPublicId(ctx: ReadContext, actor: ActorContext, paymentId: string | undefined): Promise<SupplierPaymentRow> {
  const row = paymentId ? await ctx.db.query("supplierPayments").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", paymentId)).unique() : null;
  if (!row || !branchVisible(actor, row.branchId)) domainError("NOT_FOUND", "Supplier payment not found.", { correlationId: actor.correlationId });
  return row;
}

async function getSupplierPayment(ctx: QueryCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requirePayablesRead(actor);
  const row = await supplierPaymentByPublicId(ctx, actor, optionalText(input.paymentId));
  return await supplierPaymentDetail(ctx, actor, row);
}

function requirePositiveMoney(input: unknown, currency: string, field: string, actor: ActorContext): number {
  const raw = value(input);
  const amount = integer(raw.amount, Number.NaN);
  const requestedCurrency = text(raw.currency, currency).trim().toUpperCase();
  if (!Number.isSafeInteger(amount) || amount <= 0) domainError("VALIDATION_ERROR", `${field} must be a positive whole amount in ${currency} minor units.`, { correlationId: actor.correlationId, fieldErrors: { [field]: ["Enter an amount greater than zero"] } });
  if (requestedCurrency !== currency) domainError("VALIDATION_ERROR", `${field} must be in ${currency}.`, { correlationId: actor.correlationId, fieldErrors: { [field]: [`Only ${currency} is accepted`] } });
  return amount;
}

async function recordSupplierPayment(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const currency = actor.organization.currency.toUpperCase();
  const idempotencyKey = optionalText(input.idempotencyKey);
  if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) domainError("VALIDATION_ERROR", "A bounded idempotency key is required.", { correlationId: actor.correlationId });
  const supplierPublicId = optionalText(input.supplierId);
  const supplier = supplierPublicId ? await ctx.db.query("suppliers").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", supplierPublicId)).unique() : null;
  if (!supplier) domainError("NOT_FOUND", "Supplier not found.", { correlationId: actor.correlationId });
  const branch = await branchByPublicId(ctx, actor, optionalText(input.branchId));
  const method = text(input.method) as PaymentMethod;
  if (!PAYMENT_METHODS.includes(method)) domainError("VALIDATION_ERROR", "Supplier payment method must be cash, bank transfer, or CliQ.", { correlationId: actor.correlationId, fieldErrors: { method: ["Choose cash, bank transfer, or CliQ"] } });
  const amountMinor = requirePositiveMoney(input.amount, currency, "amount", actor);
  const reference = optionalText(input.reference);
  if (reference && reference.length > MAX_REFERENCE_LENGTH) domainError("VALIDATION_ERROR", "Payment reference is too long.", { correlationId: actor.correlationId, fieldErrors: { reference: [`Keep it under ${MAX_REFERENCE_LENGTH} characters`] } });
  if (method !== "cash" && !reference) domainError("VALIDATION_ERROR", "A transfer or CliQ reference is required so the payment can be found later.", { correlationId: actor.correlationId, fieldErrors: { reference: ["Required for bank transfer and CliQ"] } });
  const notes = optionalText(input.notes);
  if (notes && notes.length > MAX_NOTES_LENGTH) domainError("VALIDATION_ERROR", "Payment notes are too long.", { correlationId: actor.correlationId, fieldErrors: { notes: [`Keep it under ${MAX_NOTES_LENGTH} characters`] } });
  const rawAllocations = Array.isArray(input.allocations) ? input.allocations : [];
  if (rawAllocations.length === 0 || rawAllocations.length > MAX_ALLOCATIONS) domainError("VALIDATION_ERROR", `Allocate the payment to between 1 and ${MAX_ALLOCATIONS} payables.`, { correlationId: actor.correlationId, fieldErrors: { allocations: ["Choose at least one payable"] } });
  const allocations = rawAllocations.map((raw) => ({ payableId: optionalText(value(raw).payableId) ?? "", amountMinor: requirePositiveMoney(value(raw).amount, currency, "allocation", actor) })).sort((left, right) => left.payableId.localeCompare(right.payableId));
  if (allocations.some((allocation) => !allocation.payableId)) domainError("VALIDATION_ERROR", "Every allocation needs a payable.", { correlationId: actor.correlationId });
  if (new Set(allocations.map((allocation) => allocation.payableId)).size !== allocations.length) domainError("VALIDATION_ERROR", "A payable can appear only once in an allocation.", { correlationId: actor.correlationId });
  let allocatedMinor = 0;
  for (const allocation of allocations) {
    if (!Number.isSafeInteger(allocatedMinor + allocation.amountMinor)) domainError("VALIDATION_ERROR", "Allocation total is too large.", { correlationId: actor.correlationId });
    allocatedMinor += allocation.amountMinor;
  }
  if (allocatedMinor !== amountMinor) domainError("VALIDATION_ERROR", "Allocations must add up to the payment amount exactly.", { correlationId: actor.correlationId, fieldErrors: { allocations: ["Allocated total does not match the payment amount"] } });
  const expectedShiftId = optionalText(input.expectedShiftId);
  const requestHash = JSON.stringify({ supplierId: supplier.publicId, branchId: publicBranchId(branch), method, amountMinor, reference, notes, allocations });
  // Tenant, supplier, and branch access are established before the
  // idempotency lookup: a known key is never a bearer token.
  const replay = await idempotentResult(ctx, actor, "operations.supplier_payment.record", idempotencyKey, requestHash);
  if (replay) return replay;
  if (supplier.status !== "active") domainError("CONFLICT", "This supplier is archived. Restore it before recording a payment.", { correlationId: actor.correlationId });

  const payables = await projectPayables(ctx, actor);
  const payablesById = new Map(payables.map((payable) => [payable.id, payable]));
  const payableSourceTypes = new Map<string, PayableSourceType>();
  for (const allocation of allocations) {
    const payable = payablesById.get(allocation.payableId);
    if (!payable) domainError("NOT_FOUND", `Payable ${allocation.payableId} is not an open supplier balance you can see.`, { correlationId: actor.correlationId });
    if (payable.supplierId !== supplier._id) domainError("VALIDATION_ERROR", `${payable.sourceLabel} belongs to ${payable.supplierName}, not ${supplier.name}. One payment settles one supplier.`, { correlationId: actor.correlationId });
    if (payable.currency !== currency) domainError("VALIDATION_ERROR", "Payables in another currency cannot be settled here.", { correlationId: actor.correlationId });
    if (payable.status === "paid" || payable.status === "reversed") domainError("CONFLICT", `${payable.sourceLabel} is already ${payable.status === "paid" ? "paid in full" : "reversed"}.`, { correlationId: actor.correlationId, details: { payableId: payable.id, status: payable.status } });
    if (allocation.amountMinor > payable.remainingMinor) domainError("CONFLICT", `${payable.sourceLabel} has only ${currency} ${(payable.remainingMinor / 1000).toFixed(3)} outstanding; the allocation would overpay it.`, { correlationId: actor.correlationId, details: { payableId: payable.id, remainingMinor: payable.remainingMinor, requestedMinor: allocation.amountMinor } });
    payableSourceTypes.set(allocation.payableId, payable.sourceType);
  }

  let shiftPublicId: string | undefined;
  if (method === "cash") {
    const shift = await openCashShiftForBranch(ctx, actor, branch);
    if (!shift) domainError("NO_OPEN_SHIFT", `Open a cash shift at ${branch.name} before paying a supplier in cash.`, { correlationId: actor.correlationId });
    shiftPublicId = cashShiftPublicId(shift);
    if (expectedShiftId && expectedShiftId !== shiftPublicId) domainError("CONFLICT", "The open cash shift changed since this screen loaded. Refresh and record the payment again.", { correlationId: actor.correlationId, details: { reason: "SHIFT_STALE", openShiftId: shiftPublicId } });
  }

  const now = Date.now();
  const publicId = `supplier-payment-${crypto.randomUUID()}`;
  const rowId = await ctx.db.insert("supplierPayments", {
    organizationId: actor.organization._id,
    publicId,
    supplierId: supplier._id,
    supplierName: supplier.name,
    branchId: branch._id,
    method,
    amountMinor,
    currency,
    reference,
    notes,
    allocations: allocations.map((allocation) => ({ payableId: allocation.payableId, payableSourceType: payableSourceTypes.get(allocation.payableId) ?? "purchase_order", amountMinor: allocation.amountMinor })),
    status: "recorded",
    shiftPublicId,
    recordedByUserId: actor.user._id,
    recordedByName: actor.user.fullName,
    occurredAt: now,
    financialPostingStatus: "not_posted",
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
  });
  await audit(ctx, actor, {
    action: "operations.supplier_payment.record",
    entityType: "supplier_payment",
    entityId: publicId,
    entityLabel: supplier.name,
    summary: `Paid ${supplier.name} ${currency} ${(amountMinor / 1000).toFixed(3)} by ${method.replace("_", " ")}`,
    after: { amountMinor, currency, method, reference, shiftId: shiftPublicId, allocations: allocations.map((allocation) => ({ payableId: allocation.payableId, amountMinor: allocation.amountMinor })) },
    branchId: publicBranchId(branch),
  });
  const row = (await ctx.db.get(rowId))!;
  const detail = await supplierPaymentDetail(ctx, actor, row);
  await saveIdempotentResult(ctx, actor, "operations.supplier_payment.record", idempotencyKey, requestHash, detail);
  return detail;
}

async function reverseSupplierPayment(ctx: MutationCtx, actor: ActorContext, input: Data): Promise<Data> {
  await requireOperations(ctx, actor);
  requireOperationsWrite(actor);
  const paymentId = optionalText(input.paymentId);
  const reason = optionalText(input.reason);
  requireReason(reason, actor.correlationId, "reason");
  const idempotencyKey = optionalText(input.idempotencyKey);
  if (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) domainError("VALIDATION_ERROR", "A bounded idempotency key is required.", { correlationId: actor.correlationId });
  const row = paymentId ? await ctx.db.query("supplierPayments").withIndex("by_public_id", (q) => q.eq("organizationId", actor.organization._id).eq("publicId", paymentId)).unique() : null;
  if (!row) domainError("NOT_FOUND", "Supplier payment not found.", { correlationId: actor.correlationId });
  const branch = await ctx.db.get(row.branchId);
  // Tenant and branch scope are checked before the idempotency record is
  // consulted so a replayed key cannot leak another branch's payment.
  if (!branch || branch.organizationId !== actor.organization._id) domainError("NOT_FOUND", "Supplier payment not found.", { correlationId: actor.correlationId });
  if (actor.branchScope === "selected" && !actor.branchIds.includes(branch._id)) domainError("FORBIDDEN", "You do not have access to this branch.", { correlationId: actor.correlationId });
  const requestHash = JSON.stringify({ paymentId: row.publicId, reason });
  const replay = await idempotentResult(ctx, actor, "operations.supplier_payment.reverse", idempotencyKey, requestHash);
  if (replay) return replay;
  if (row.status === "reversed") domainError("CONFLICT", "This supplier payment was already reversed. The original stays on record; nothing else changes.", { correlationId: actor.correlationId, details: { reversedAt: row.reversedAt } });
  let reversalShiftPublicId: string | undefined;
  if (row.method === "cash") {
    assertBranchAccess(actor, branch);
    const shift = await openCashShiftForBranch(ctx, actor, branch);
    if (!shift) domainError("NO_OPEN_SHIFT", `Open a cash shift at ${branch.name} so the returned cash has a drawer to go back into.`, { correlationId: actor.correlationId });
    reversalShiftPublicId = cashShiftPublicId(shift);
  }
  const now = Date.now();
  await ctx.db.patch(row._id, {
    status: "reversed",
    reversedAt: now,
    reversedByUserId: actor.user._id,
    reversedByName: actor.user.fullName,
    reversalReason: reason,
    reversalShiftPublicId,
    reversalFinancialPostingStatus: "not_posted",
    updatedAt: now,
  });
  await audit(ctx, actor, {
    action: "operations.supplier_payment.reverse",
    entityType: "supplier_payment",
    entityId: row.publicId,
    entityLabel: row.supplierName,
    summary: `Reversed ${row.supplierName} payment of ${row.currency} ${(row.amountMinor / 1000).toFixed(3)} (${row.method.replace("_", " ")})`,
    reason,
    before: { status: "recorded" },
    after: { status: "reversed", reversalShiftId: reversalShiftPublicId, reopenedAllocations: row.allocations.map((allocation) => ({ payableId: allocation.payableId, amountMinor: allocation.amountMinor })) },
    branchId: publicBranchId(branch),
  });
  const updated = (await ctx.db.get(row._id))!;
  const detail = await supplierPaymentDetail(ctx, actor, updated);
  await saveIdempotentResult(ctx, actor, "operations.supplier_payment.reverse", idempotencyKey, requestHash, detail);
  return detail;
}

export async function payablesQuery(ctx: QueryCtx, actor: ActorContext, operation: string, input: Data): Promise<unknown> {
  switch (operation) {
    case "operations.payables.list": return await listPayables(ctx, actor, input);
    case "operations.payables.export": return await exportPayables(ctx, actor, input);
    case "operations.payables.reconciliation": return await listReconciliationItems(ctx, actor, input);
    case "operations.supplier_payments.list": return await listSupplierPayments(ctx, actor, input);
    case "operations.supplier_payment.get": return await getSupplierPayment(ctx, actor, input);
    default: domainError("NOT_FOUND", `Unknown payables query ${operation}.`, { correlationId: actor.correlationId });
  }
}

export async function payablesMutation(ctx: MutationCtx, actor: ActorContext, operation: string, input: Data): Promise<unknown> {
  switch (operation) {
    case "operations.supplier_payment.record": return await recordSupplierPayment(ctx, actor, input);
    case "operations.supplier_payment.reverse": return await reverseSupplierPayment(ctx, actor, input);
    default: domainError("NOT_FOUND", `Unknown payables mutation ${operation}.`, { correlationId: actor.correlationId });
  }
}
