"use client";
import { useLocale } from "@/lib/i18n/provider";

import { Banknote, Landmark, Smartphone, WalletCards } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { qk } from "@/lib/api/keys";
import { MAX_SUPPLIER_PAYMENT_REFERENCE_LENGTH, SUPPLIER_PAYMENT_METHOD_LABELS, suggestPayableAllocations } from "@/lib/domain/payables";
import type { Payable, RecordSupplierPaymentInput, Session, Supplier, SupplierPaymentDetail, SupplierPaymentMethod } from "@/lib/domain/types";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { isApiError, localizeApiError } from "@/lib/api/errors";
import { money, parseMoneyInput, toMajorString } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import { useFormat } from "@/lib/i18n/format";
import type { TKey } from "@/lib/i18n/core";
import { payableSourceLabel, supplierPaymentMethodLabel } from "@/lib/i18n/payables";
import { useOperationsNumberProblems } from "../operations-shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const METHOD_ICONS: Record<SupplierPaymentMethod, typeof Banknote> = { cash: Banknote, bank_transfer: Landmark, cliq: Smartphone };
const METHOD_HINTS: Record<SupplierPaymentMethod, TKey> = {
  cash: "payablesWorkspace.cashHint",
  bank_transfer: "payablesWorkspace.bankHint",
  cliq: "payablesWorkspace.cliqHint",
};

function newIdempotencyKey(): string {
  return `supplier-payment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Typed amounts follow the shared money policy in the supplier's currency; an unreadable draft counts as no amount. */
function parseMajor(value: string, currency: string): number | undefined {
  return parseMoneyInput(value, currency)?.amount;
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
  const { t, locale, isolate, isolateLtr } = useLocale();
  const f = useFormat();
  const validate = useOperationsNumberProblems();
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
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    const fallbackBranch = branches.length === 1 ? branches[0]!.id : "";
    setSupplierId(initialSupplierId && activeSuppliers.some((supplier) => supplier.id === initialSupplierId) ? initialSupplierId : activeSuppliers.length === 1 ? activeSuppliers[0]!.id : "");
    setBranchId(initialBranchId && branches.some((branch) => branch.id === initialBranchId) ? initialBranchId : fallbackBranch);
    setMethod("cash");
    setAmountText(initialPayable ? toMajorString(initialPayable.remaining) : "");
    setReference("");
    setNotes("");
    setAllocationText(initialPayable ? { [initialPayable.id]: toMajorString(initialPayable.remaining) } : {});
    setManualAllocation(Boolean(initialPayable));
    setIdempotencyKey(newIdempotencyKey());
    setError(null);
  }, [open, activeSuppliers, branches, initialBranchId, initialSupplierId, initialPayable]);

  const payablesQuery = useApiQuery(qk.payables({ kind: "open-for-supplier", supplierId }), (api) => api.listPayables({ supplierId, status: "open", pageSize: 100 }), { enabled: open && Boolean(supplierId) });
  const shiftQuery = useApiQuery(qk.currentShift(branchId), (api) => api.getCurrentCashShift(branchId), { enabled: open && method === "cash" && Boolean(branchId) });
  const openPayables = useMemo(() => payablesQuery.data?.items ?? [], [payablesQuery.data]);
  const amountMinor = parseMajor(amountText, currency);
  const amountProblem = validate.amount(amountText, currency);
  const invalidAllocations = openPayables.some(payable => Boolean(validate.amount(allocationText[payable.id] ?? "", currency)));

  useEffect(() => {
    if (!open || manualAllocation) return;
    const suggestion = suggestPayableAllocations(openPayables, amountMinor ?? 0);
    setAllocationText(Object.fromEntries(suggestion.allocations.map((allocation) => [allocation.payableId, toMajorString(money(allocation.amountMinor, currency))])));
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
  const canSubmit = Boolean(!amountProblem && !invalidAllocations && supplier && branch && amountMinor && amountMinor > 0 && allocatedMinor === amountMinor && allocations.some((allocation) => allocation.amountMinor > 0) && overAllocated.length === 0 && !referenceMissing && !cashBlocked && reference.trim().length <= MAX_SUPPLIER_PAYMENT_REFERENCE_LENGTH);

  const mutation = useApiMutation((api, input: RecordSupplierPaymentInput) => api.recordSupplierPayment(input), {
    onSuccess: (detail) => { setError(null); onRecorded(detail); },
    onError: (failure) => setError(failure),
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
          <DialogTitle>{t("payablesWorkspace.recordSupplierPayment")}</DialogTitle>
          <DialogDescription>{t("payablesWorkspace.recordHint")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); submit(); }} data-testid="record-supplier-payment-form">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("stockWorkspace.supplier")} required>
                <Select value={supplierId || "none"} onValueChange={(value) => { setSupplierId(value === "none" ? "" : value); setManualAllocation(false); setAllocationText({}); }}>
                  <SelectTrigger aria-label={t("stockWorkspace.supplier")}><SelectValue placeholder={t("stockWorkspace.chooseSupplier")} /></SelectTrigger>
                  <SelectContent>{activeSuppliers.length === 0 ? <SelectItem value="none" disabled>{t("payablesWorkspace.noActiveSuppliers")}</SelectItem> : activeSuppliers.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={t("payablesWorkspace.payingFrom")} hint={method === "cash" ? t("payablesWorkspace.cashBranchHint") : t("payablesWorkspace.payingBranchHint")} required>
                <Select value={branchId || "none"} onValueChange={(value) => setBranchId(value === "none" ? "" : value)}>
                  <SelectTrigger aria-label={t("payablesWorkspace.payingBranch")}><SelectValue placeholder={t("members.bulk.chooseBranch")} /></SelectTrigger>
                  <SelectContent>{branches.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-[13px] font-medium text-ink-2">{t("payablesWorkspace.paidBy")}</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(SUPPLIER_PAYMENT_METHOD_LABELS) as SupplierPaymentMethod[]).map((candidate) => {
                  const Icon = METHOD_ICONS[candidate];
                  const selected = method === candidate;
                  return (
                    <label key={candidate} className={cn("flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-[13px]", selected ? "border-ink bg-sunken" : "border-line-2 hover:border-line-3")}>
                      <input type="radio" name="supplier-payment-method" value={candidate} checked={selected} onChange={() => { setMethod(candidate); if (candidate === "cash") setReference(""); }} className="sr-only" />
                      <Icon className="size-4 shrink-0 text-ink-2" aria-hidden />
                      <span className="font-medium">{supplierPaymentMethodLabel(candidate, t)}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[12px] text-ink-3">{t(METHOD_HINTS[method])}</p>
            </fieldset>

            {method === "cash" && branchId ? (
              shiftQuery.isLoading ? <p role="status" className="text-[12px] text-ink-3">{t("payablesWorkspace.checkingShift")}</p>
                : shiftQuery.isError ? <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg/40 px-3 py-2 text-[12.5px] text-danger">{t("payablesWorkspace.shiftCheckFailed")}{" "}<button type="button" className="font-medium underline" onClick={() => void shiftQuery.refetch()}>{t("common.action.retry")}</button></p>
                  : shift ? <p role="status" className="rounded-md border border-line bg-sunken/50 px-3 py-2 text-[12.5px] text-ink-2">{t("payablesWorkspace.shiftOpen", { branch: isolate(branch?.name ?? t("payablesWorkspace.thisBranch")), name: isolate(shift.openedByName), date: f.date(shift.openedAt) })}</p>
                    : <p role="alert" className="rounded-md border border-warning/40 bg-warning-bg/60 px-3 py-2 text-[12.5px] text-warning-deep">{t("payablesWorkspace.shiftClosed", { branch: isolate(branch?.name ?? t("payablesWorkspace.thisBranch")) })}{" "}<Link href="/payments/shifts" className="font-medium underline">{t("payablesWorkspace.openShift")}</Link> {" "}{t("payablesWorkspace.shiftAlternative")}</p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("payablesWorkspace.amountCurrency", { currency })} error={amountProblem} required>
                <Input inputMode="decimal" dir="ltr" aria-invalid={Boolean(amountProblem) || undefined} value={amountText} onChange={(event) => { setAmountText(event.target.value); setManualAllocation(false); }} placeholder={toMajorString(money(0, currency))} aria-label={t("payablesWorkspace.amountPaid")} />
              </Field>
              {method !== "cash" ? (
                <Field label={t("payablesWorkspace.methodReference", { method: supplierPaymentMethodLabel(method, t) })} hint={t("payablesWorkspace.copyReference")} required>
                  <Input dir="ltr" value={reference} onChange={(event) => setReference(event.target.value)} maxLength={MAX_SUPPLIER_PAYMENT_REFERENCE_LENGTH} placeholder={method === "cliq" ? "CLIQ-…" : "TRF-…"} aria-label={t("payablesWorkspace.methodReference", { method: supplierPaymentMethodLabel(method, t) })} />
                </Field>
              ) : null}
            </div>

            <section aria-label={t("payablesWorkspace.billsThisPays")} className="rounded-md border border-line">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
                <div>
                  <p className="text-[13px] font-medium">{t("payablesWorkspace.billsThisPays")}</p>
                  <p className="text-[12px] text-ink-3">{manualAllocation ? t("payablesWorkspace.manualAmounts") : t("payablesWorkspace.oldestBillsFirst")}{supplier ? t("payablesWorkspace.supplierOwed", { supplier: isolate(supplier.name), amount: isolateLtr(f.money(money(supplierOutstandingMinor, currency))) }) : t("payablesWorkspace.chooseSupplierOwed")}</p>
                </div>
                {manualAllocation && amountMinor ? <Button type="button" size="xs" variant="secondary" onClick={() => setManualAllocation(false)}>{t("payablesWorkspace.resetOldest")}</Button> : null}
              </header>
              {!supplierId ? null : payablesQuery.isLoading ? <div className="space-y-2 p-3"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
                : payablesQuery.isError ? <p role="alert" className="px-3 py-3 text-[12.5px] text-danger">{t("payablesWorkspace.billsLoadFailed")}{" "}<button type="button" className="font-medium underline" onClick={() => void payablesQuery.refetch()}>{t("common.action.retry")}</button></p>
                  : openPayables.length === 0 ? <p className="px-3 py-3 text-[12.5px] text-ink-3">{t("payablesWorkspace.oweNothing", { supplier: isolate(supplier?.name ?? t("payablesWorkspace.thisSupplier")) })}</p>
                    : (
                      <div className="divide-y divide-line">
                        {allocations.map(({ payable, amountMinor: allocated }) => {
                          const over = allocated > payable.remaining.amount;
                          const allocationProblem = validate.amount(allocationText[payable.id] ?? "", currency);
                          return (
                            <div key={payable.id} className="grid items-center gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_150px]">
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium">{payableSourceLabel(payable.sourceLabel, t)}</p>
                                <p className="text-[12px] text-ink-3">{t("payablesWorkspace.billReceived", { date: f.date(payable.receivedAt), age: t("payablesWorkspace.days", { count: payable.ageDays }), amount: isolateLtr(f.money(payable.remaining)) })}{payable.externalReference ? ` · ${payable.externalReference}` : ""}</p>
                                {over ? <p role="alert" className="text-[12px] text-danger">{t("payablesWorkspace.moreThanBill")}</p> : null}
                              </div>
                              <Input inputMode="decimal" dir="ltr" aria-label={t("payablesWorkspace.amountFor", { bill: payableSourceLabel(payable.sourceLabel, t) })} aria-invalid={over || Boolean(allocationProblem) || undefined} aria-describedby={allocationProblem ? `allocation-error-${payable.id}` : undefined} value={allocationText[payable.id] ?? ""} onChange={(event) => { setManualAllocation(true); setAllocationText((current) => ({ ...current, [payable.id]: event.target.value })); }} placeholder={toMajorString(money(0, currency))} className={cn((over || allocationProblem) && "border-danger")} />
                              {allocationProblem ? <p id={`allocation-error-${payable.id}`} role="alert" className="text-[12px] text-danger sm:col-span-2">{allocationProblem}</p> : null}
                            </div>
                          );
                        })}
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-sunken/40 px-3 py-2 text-[12.5px]">
                          <span className="text-ink-2">{t("payablesWorkspace.allocated", { allocated: isolateLtr(f.money(money(allocatedMinor, currency))), amount: isolateLtr(f.money(money(amountMinor ?? 0, currency))) })}</span>
                          {amountMinor && unallocatedMinor !== 0 ? <span role="alert" className={cn("font-medium", unallocatedMinor > 0 ? "text-warning-deep" : "text-danger")}>{unallocatedMinor > 0 ? t("payablesWorkspace.notAllocated", { amount: isolateLtr(f.money(money(unallocatedMinor, currency))) }) : t("payablesWorkspace.overAllocated", { amount: isolateLtr(f.money(money(-unallocatedMinor, currency))) })}</span> : null}
                        </div>
                      </div>
                    )}
            </section>

            <Field label={t("common.label.notes")} hint={t("payablesWorkspace.confirmationNotesHint")}>
              <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder={t("payablesWorkspace.notesExample")} />
            </Field>
            {error != null ? <p role="alert" className="rounded-md border border-danger/30 bg-danger-bg/40 px-3 py-2 text-[12.5px] text-danger">{isApiError(error) ? localizeApiError(error, locale).message : t("payablesWorkspace.recordFailure")}</p> : null}
          </form>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>{t("common.action.cancel")}</Button>
          <Button type="button" onClick={submit} loading={mutation.isPending} disabled={!canSubmit} data-testid="confirm-supplier-payment"><WalletCards /> {" "}{t("payablesWorkspace.recordPayment")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
