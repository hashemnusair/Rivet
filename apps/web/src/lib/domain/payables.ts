import type { Money, Payable, PayableStatus, PayableStatusFilter, PayablesAgingBucket, PayablesSupplierTotal, SupplierPaymentMethod } from "./types";

export const SUPPLIER_PAYMENT_METHODS: readonly SupplierPaymentMethod[] = ["cash", "bank_transfer", "cliq"];
export const PAYABLE_STATUSES: readonly PayableStatus[] = ["unpaid", "partially_paid", "paid", "reversed"];
export const PAYABLE_AGING_BUCKETS = ["0-30", "31-60", "61-90", "90+"] as const;
export const MAX_SUPPLIER_PAYMENT_ALLOCATIONS = 50;
export const MAX_SUPPLIER_PAYMENT_REFERENCE_LENGTH = 120;

export const SUPPLIER_PAYMENT_METHOD_LABELS: Record<SupplierPaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  cliq: "CliQ",
};

export const PAYABLE_STATUS_LABELS: Record<PayableStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  paid: "Paid",
  reversed: "Reversed",
};

const DAY_MS = 86_400_000;

/** Whole calendar days between two YYYY-MM-DD dates; never negative. */
export function calendarDaysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / DAY_MS));
}

export function payableAgingBucket(ageDays: number): (typeof PAYABLE_AGING_BUCKETS)[number] {
  if (ageDays <= 30) return "0-30";
  if (ageDays <= 60) return "31-60";
  if (ageDays <= 90) return "61-90";
  return "90+";
}

export function payableStatusFor(ledgerReversed: boolean, paidMinor: number, remainingMinor: number): PayableStatus {
  if (ledgerReversed) return "reversed";
  if (remainingMinor === 0) return "paid";
  return paidMinor > 0 ? "partially_paid" : "unpaid";
}

export function payableIsOpen(payable: Pick<Payable, "status">): boolean {
  return payable.status === "unpaid" || payable.status === "partially_paid";
}

export interface PayableFilterInput {
  supplierId?: string;
  status?: PayableStatusFilter;
  search?: string;
}

/** Mirrors the server filter so the mock and the UI reason about the same set. */
export function matchesPayableFilters(payable: Payable, filters: PayableFilterInput): boolean {
  if (filters.supplierId && payable.supplierId !== filters.supplierId) return false;
  const status = filters.status ?? "open";
  if (status === "open" ? !payableIsOpen(payable) : status !== "all" && payable.status !== status) return false;
  const search = filters.search?.trim().toLowerCase();
  if (search) {
    const haystack = `${payable.supplierName} ${payable.sourceId} ${payable.sourceLabel} ${payable.externalReference ?? ""} ${payable.branchName}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  return true;
}

export interface PayablesSummary {
  totals: { outstanding: Money; original: Money; paid: Money; openCount: number };
  supplierTotals: PayablesSupplierTotal[];
  aging: PayablesAgingBucket[];
}

/** Totals over a matched set; outstanding only counts open payables. */
export function summarizePayables(payables: Payable[], currency: string): PayablesSummary {
  const suppliers = new Map<string, { supplierId: string; supplierName: string; outstandingMinor: number; openCount: number; oldestReceivedAt?: string }>();
  const aging = new Map<string, { outstandingMinor: number; count: number }>(PAYABLE_AGING_BUCKETS.map((bucket) => [bucket, { outstandingMinor: 0, count: 0 }]));
  let outstandingMinor = 0;
  let originalMinor = 0;
  let paidMinor = 0;
  let openCount = 0;
  for (const payable of payables) {
    originalMinor += payable.original.amount;
    paidMinor += payable.paid.amount;
    if (!payableIsOpen(payable) || payable.remaining.amount <= 0) continue;
    outstandingMinor += payable.remaining.amount;
    openCount += 1;
    const bucket = aging.get(payableAgingBucket(payable.ageDays))!;
    bucket.outstandingMinor += payable.remaining.amount;
    bucket.count += 1;
    const supplier = suppliers.get(payable.supplierId) ?? { supplierId: payable.supplierId, supplierName: payable.supplierName, outstandingMinor: 0, openCount: 0, oldestReceivedAt: undefined };
    supplier.outstandingMinor += payable.remaining.amount;
    supplier.openCount += 1;
    supplier.oldestReceivedAt = supplier.oldestReceivedAt === undefined || payable.receivedAt < supplier.oldestReceivedAt ? payable.receivedAt : supplier.oldestReceivedAt;
    suppliers.set(payable.supplierId, supplier);
  }
  return {
    totals: { outstanding: { amount: outstandingMinor, currency }, original: { amount: originalMinor, currency }, paid: { amount: paidMinor, currency }, openCount },
    supplierTotals: [...suppliers.values()].sort((left, right) => right.outstandingMinor - left.outstandingMinor || left.supplierName.localeCompare(right.supplierName)).map((entry) => ({ supplierId: entry.supplierId, supplierName: entry.supplierName, outstanding: { amount: entry.outstandingMinor, currency }, openCount: entry.openCount, oldestReceivedAt: entry.oldestReceivedAt })),
    aging: PAYABLE_AGING_BUCKETS.map((bucket) => ({ bucket, outstanding: { amount: aging.get(bucket)!.outstandingMinor, currency }, count: aging.get(bucket)!.count })),
  };
}

export interface SuggestedAllocation {
  payableId: string;
  amountMinor: number;
}

/**
 * Oldest-first allocation of a payment across one supplier's open payables.
 * The result never exceeds any payable's remaining balance and never
 * exceeds the payment; whatever cannot be placed is returned as
 * `unallocatedMinor` so the operator sees it instead of RIVET inventing a
 * credit balance.
 */
export function suggestPayableAllocations(payables: Payable[], amountMinor: number): { allocations: SuggestedAllocation[]; unallocatedMinor: number } {
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return { allocations: [], unallocatedMinor: Math.max(0, Number.isSafeInteger(amountMinor) ? amountMinor : 0) };
  const ordered = payables.filter((payable) => payableIsOpen(payable) && payable.remaining.amount > 0).sort((left, right) => left.receivedAt.localeCompare(right.receivedAt) || left.id.localeCompare(right.id));
  const allocations: SuggestedAllocation[] = [];
  let left = amountMinor;
  for (const payable of ordered) {
    if (left <= 0) break;
    const amount = Math.min(left, payable.remaining.amount);
    allocations.push({ payableId: payable.id, amountMinor: amount });
    left -= amount;
  }
  return { allocations, unallocatedMinor: left };
}

export function allocationsTotalMinor(allocations: ReadonlyArray<{ amountMinor: number }>): number {
  return allocations.reduce((sum, allocation) => (Number.isSafeInteger(sum + allocation.amountMinor) ? sum + allocation.amountMinor : Number.NaN), 0);
}
