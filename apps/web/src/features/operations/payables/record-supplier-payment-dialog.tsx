"use client";

import { Banknote, Landmark, Smartphone, WalletCards } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { qk } from "@/lib/api/keys";
import { MAX_SUPPLIER_PAYMENT_REFERENCE_LENGTH, SUPPLIER_PAYMENT_METHOD_LABELS, suggestPayableAllocations } from "@/lib/domain/payables";
import type { Payable, RecordSupplierPaymentInput, Session, Supplier, SupplierPaymentDetail, SupplierPaymentMethod } from "@/lib/domain/types";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { isApiError } from "@/lib/api/errors";
import { fromMajor, money, toMajor } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { DateText, MoneyText } from "@/components/shared/data-display";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const METHOD_ICONS: Record<SupplierPaymentMethod, typeof Banknote> = { cash: Banknote, bank_transfer: Landmark, cliq: Smartphone };
const METHOD_HINTS: Record<SupplierPaymentMethod, string> = {
  cash: "Comes out of this branch's open cash drawer.",
  bank_transfer: "Record the bank reference so the transfer can be found later.",
  cliq: "Record the CliQ reference so the transfer can be found later.",
};

function newIdempotencyKey(): string {
  return `supplier-payment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseMajor(value: string, currency: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const major = Number(trimmed);
  if (!Number.isFinite(major) || major < 0) return undefined;
  const minor = fromMajor(major, currency).amount;
  return Number.isSafeInteger(minor) ? minor : undefined;
}

export interface RecordSupplierPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  suppliers: Supplier[];
  branches: Session["branches"];
  currency: string;
  initialBranchId?: string;
  initialSupplierId?: string;
  /** When staff clicked Pay on one payable, start with that payable's balance allocated. */
  initialPayable?: Pick<Payable, "id" | "remaining">;
  onRecorded: (detail: SupplierPaymentDetail) => void;
}

/**
 * One dialog, one supplier, one payment. The amount is allocated oldest-first
 * by default; every allocation stays editable and the total must match the
 * payment exactly before the button enables, so nothing is ever "left over"
 * as a credit balance.
 */
export function RecordSupplierPaymentDialog({ open, onOpenChange, suppliers, branches, currency, initialBranchId, initialSupplierId, initialPayable, onRecorded }: RecordSupplierPaymentDialogProps) {
  const activeSuppliers = useMemo(() => suppliers.filter((supplier) => supplier.status === "active"), [suppliers]);
  const [supplierId, setSupplierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [method, setMethod] = useState<SupplierPaymentMethod>("cash");
  const [amountText, setAmountText] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [allocationText, setAllocationText] = useState<Record<string, string>>({});
  const [manualAllocation, setManualAllocation] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const fallbackBranch = branches.length === 1 ? branches[0]!.id : "";
    setSupplierId(initialSupplierId && activeSuppliers.some((supplier) => supplier.id === initialSupplierId) ? initialSupplierId : activeSuppliers.length === 1 ? activeSuppliers[0]!.id : "");
    setBranchId(initialBranchId && branches.some((branch) => branch.id === initialBranchId) ? initialBranchId : fallbackBranch);
    setMethod("cash");
    setAmountText(initialPayable ? toMajor(initialPayable.remaining).toFixed(3) : "");
    setReference("");
    setNotes("");
    setAllocationText(initialPayable ? { [initialPayable.id]: toMajor(initialPayable.remaining).toFixed(3) } : {});
    setManualAllocation(Boolean(initialPayable));
    setIdempotencyKey(newIdempotencyKey());
    setError(null);
  }, [open, activeSuppliers, branches, initialBranchId, initialSupplierId, initialPayable]);

  const payablesQuery = useApiQuery(qk.payables({ kind: "open-for-supplier", supplierId }), (api) => api.listPayables({ supplierId, status: "open", pageSize: 100 }), { enabled: open && Boolean(supplierId) });
  const shiftQuery = useApiQuery(qk.currentShift(branchId), (api) => api.getCurrentCashShift(branchId), { enabled: open && method === "cash" && Boolean(branchId) });
  const openPayables = useMemo(() => payablesQuery.data?.items ?? [], [payablesQuery.data]);
  const amountMinor = parseMajor(amountText, currency);

  useEffect(() => {
    if (!open || manualAllocation) return;
    const suggestion = suggestPayableAllocations(openPayables, amountMinor ?? 0);
    setAllocationText(Object.fromEntries(suggestion.allocations.map((allocation) => [allocation.payableId, toMajor(money(allocation.amountMinor, currency)).toFixed(3)])));
  }, [open, manualAllocation, openPayables, amountMinor, currency]);

  const allocations = useMemo(() => openPayables.map((payable) => ({ payable, amountMinor: parseMajor(allocationText[payable.id] ?? "", currency) ?? 0 })), [openPayables, allocationText, currency]);
  const allocatedMinor = allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0);
  const unallocatedMinor = (amountMinor ?? 0) - allocatedMinor;
  const overAllocated = allocations.filter((allocation) => allocation.amountMinor > allocation.payable.remaining.amount);
  const supplierOutstandingMinor = openPayables.reduce((sum, payable) => sum + payable.remaining.amount, 0);
  const supplier = activeSuppliers.find((candidate) => candidate.id === supplierId);
  const branch = branches.find((candidate) => candidate.id === branchId);
  const shift = shiftQuery.data ?? null;
  const cashBlocked = method === "cash" && (shiftQuery.isLoading || shiftQuery.isError || !shift);
  const referenceMissing = method !== "cash" && !reference.trim();
  const canSubmit = Boolean(supplier && branch && amountMinor && amountMinor > 0 && allocatedMinor === amountMinor && allocations.some((allocation) => allocation.amountMinor > 0) && overAllocated.length === 0 && !referenceMissing && !cashBlocked && reference.trim().length <= MAX_SUPPLIER_PAYMENT_REFERENCE_LENGTH);

  const mutation = useApiMutation((api, input: RecordSupplierPaymentInput) => api.recordSupplierPayment(input), {
    onSuccess: (detail) => { setError(null); onRecorded(detail); },
    onError: (failure) => setError(isApiError(failure) ? failure.message : "The payment could not be recorded. Nothing was saved."),
  });

  const submit = () => {
    if (!canSubmit || !supplier || !branch || amountMinor === undefined || mutation.isPending) return;
    mutation.mutate({
      supplierId: supplier.id,
      branchId: branch.id,
      method,
      amount: money(amountMinor, currency),
      reference: reference.trim() || undefined,
      notes: notes.trim() || undefined,
      allocations: allocations.filter((allocation) => allocation.amountMinor > 0).map((allocation) => ({ payableId: allocation.payable.id, amount: money(allocation.amountMinor, currency) })),
      expectedShiftId: method === "cash" ? shift?.id : undefined,
      idempotencyKey,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!mutation.isPending) onOpenChange(next); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Record supplier payment</DialogTitle>
          <DialogDescription>Choose the supplier, enter what was paid, and confirm how it settles their open balances. Saving records the payment; the ledger posts it separately.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit(); }} data-testid="record-supplier-payment-form">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Supplier" required>
                <Select value={supplierId || "none"} onValueChange={(value) => { setSupplierId(value === "none" ? "" : value); setManualAllocation(false); setAllocationText({}); }}>
                  <SelectTrigger aria-label="Supplier"><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                  <SelectContent>{activeSuppliers.length === 0 ? <SelectItem value="none" disabled>No active suppliers</SelectItem> : activeSuppliers.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Paying from branch" hint={method === "cash" ? "Cash leaves this branch's drawer." : "The branch that made the payment."} required>
                <Select value={branchId || "none"} onValueChange={(value) => setBranchId(value === "none" ? "" : value)}>
                  <SelectTrigger aria-label="Paying branch"><SelectValue placeholder="Choose branch" /></SelectTrigger>
                  <SelectContent>{branches.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-[13px] font-medium text-ink-2">Paid by</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(SUPPLIER_PAYMENT_METHOD_LABELS) as SupplierPaymentMethod[]).map((candidate) => {
                  const Icon = METHOD_ICONS[candidate];
                  const selected = method === candidate;
                  return (
                    <label key={candidate} className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-[13px]", selected ? "border-ink bg-sunken" : "border-line-2 hover:border-line-3")}>
                      <input type="radio" name="supplier-payment-method" value={candidate} checked={selected} onChange={() => { setMethod(candidate); if (candidate === "cash") setReference(""); }} className="sr-only" />
                      <Icon className="size-4 shrink-0 text-ink-2" aria-hidden />
                      <span className="font-medium">{SUPPLIER_PAYMENT_METHOD_LABELS[candidate]}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11.5px] text-ink-3">{METHOD_HINTS[method]}</p>
            </fieldset>

            {method === "cash" && branchId ? (
              shiftQuery.isLoading ? <p role="status" className="text-[12px] text-ink-3">Checking the open cash shift…</p>
                : shiftQuery.isError ? <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg/40 px-3 py-2 text-[12.5px] text-danger">The cash shift could not be checked. <button type="button" className="font-medium underline" onClick={() => void shiftQuery.refetch()}>Try again</button></p>
                  : shift ? <p role="status" className="rounded-md border border-line bg-sunken/50 px-3 py-2 text-[12.5px] text-ink-2">Open cash shift at {branch?.name ?? "this branch"} · opened by {shift.openedByName} <DateText iso={shift.openedAt} />. The payment will be counted against this drawer.</p>
                    : <p role="alert" className="rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2 text-[12.5px] text-warning-deep">No cash shift is open at {branch?.name ?? "this branch"}. <Link href="/payments/shifts" className="font-medium underline">Open a shift</Link> first, or pay by bank transfer or CliQ.</p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={`Amount paid (${currency})`} required>
                <Input inputMode="decimal" dir="ltr" value={amountText} onChange={(event) => { setAmountText(event.target.value); setManualAllocation(false); }} placeholder="0.000" aria-label="Amount paid" />
              </Field>
              {method !== "cash" ? (
                <Field label={`${SUPPLIER_PAYMENT_METHOD_LABELS[method]} reference`} hint="Typed as given by the bank or app; RIVET does not verify it." required>
                  <Input dir="ltr" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={MAX_SUPPLIER_PAYMENT_REFERENCE_LENGTH} placeholder={method === "cliq" ? "CLIQ-…" : "TRF-…"} aria-label={`${SUPPLIER_PAYMENT_METHOD_LABELS[method]} reference`} />
                </Field>
              ) : null}
            </div>

            <section aria-label="Allocation" className="rounded-md border border-line">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
                <div>
                  <p className="text-[13px] font-medium">Apply to open balances</p>
                  <p className="text-[11.5px] text-ink-3">{manualAllocation ? "Edited by you. " : "Oldest first. "}{supplier ? <>Owed to {supplier.name}: <MoneyText money={money(supplierOutstandingMinor, currency)} /></> : "Choose a supplier to see what is owed."}</p>
                </div>
                {manualAllocation && amountMinor ? <Button type="button" size="xs" variant="secondary" onClick={() => setManualAllocation(false)}>Suggest again</Button> : null}
              </header>
              {!supplierId ? null : payablesQuery.isLoading ? <div className="space-y-2 p-3"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
                : payablesQuery.isError ? <p role="alert" className="px-3 py-3 text-[12.5px] text-danger">Open balances could not be loaded. <button type="button" className="font-medium underline" onClick={() => void payablesQuery.refetch()}>Try again</button></p>
                  : openPayables.length === 0 ? <p className="px-3 py-3 text-[12.5px] text-ink-3">{supplier?.name ?? "This supplier"} has no open balance. There is nothing to pay.</p>
                    : (
                      <div className="divide-y divide-line">
                        {allocations.map(({ payable, amountMinor: allocated }) => {
                          const over = allocated > payable.remaining.amount;
                          return (
                            <div key={payable.id} className="grid items-center gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_150px]">
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium">{payable.sourceLabel}</p>
                                <p className="text-[11.5px] text-ink-3">Received <DateText iso={payable.receivedAt} /> · {payable.ageDays} days · remaining <MoneyText money={payable.remaining} />{payable.externalReference ? ` · ${payable.externalReference}` : ""}</p>
                                {over ? <p role="alert" className="text-[11.5px] text-danger">More than this payable&apos;s remaining balance.</p> : null}
                              </div>
                              <Input inputMode="decimal" dir="ltr" aria-label={`Allocate to ${payable.sourceLabel}`} value={allocationText[payable.id] ?? ""} onChange={(event) => { setManualAllocation(true); setAllocationText((current) => ({ ...current, [payable.id]: event.target.value })); }} placeholder="0.000" className={cn(over && "border-danger")} />
                            </div>
                          );
                        })}
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-sunken/40 px-3 py-2 text-[12.5px]">
                          <span className="text-ink-2">Allocated <MoneyText money={money(allocatedMinor, currency)} /> of <MoneyText money={money(amountMinor ?? 0, currency)} /></span>
                          {amountMinor && unallocatedMinor !== 0 ? <span role="alert" className={cn("font-medium", unallocatedMinor > 0 ? "text-warning-deep" : "text-danger")}>{unallocatedMinor > 0 ? <>Not yet applied: <MoneyText money={money(unallocatedMinor, currency)} />. RIVET never keeps a supplier credit; apply it or lower the amount.</> : <>Allocations exceed the amount by <MoneyText money={money(-unallocatedMinor, currency)} />.</>}</span> : null}
                        </div>
                      </div>
                    )}
            </section>

            <Field label="Notes" hint="Optional; shown on the confirmation.">
              <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Invoice numbers, who handed over the cash, anything worth remembering" />
            </Field>
            {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg/40 px-3 py-2 text-[12.5px] text-danger">{error}</p> : null}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button type="button" onClick={submit} loading={mutation.isPending} disabled={!canSubmit} data-testid="confirm-supplier-payment"><WalletCards /> Record payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
