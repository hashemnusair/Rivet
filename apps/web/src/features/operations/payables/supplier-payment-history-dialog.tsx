"use client";

import { ExternalLink, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { qk } from "@/lib/api/keys";
import { isApiError } from "@/lib/api/errors";
import { SUPPLIER_PAYMENT_METHOD_LABELS } from "@/lib/domain/payables";
import type { SupplierPayment, SupplierPaymentsQuery } from "@/lib/domain/types";
import { useApiMutation, useApiQuery, useInvalidate } from "@/lib/hooks/use-api";
import { DateTimeText, MoneyText } from "@/components/shared/data-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import { LedgerStatusBadge } from "./ledger-status";

export function supplierPaymentHref(paymentId: string): string {
  return `/operations/payables/payments/${encodeURIComponent(paymentId)}`;
}

/**
 * Reversal is the only thing that can happen to a recorded payment, and it
 * happens once, with a reason, leaving the original untouched.
 */
export function ReverseSupplierPaymentDialog({ payment, open, onOpenChange, onReversed }: { payment: SupplierPayment | null; open: boolean; onOpenChange: (open: boolean) => void; onReversed: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const mutation = useApiMutation((api) => api.reverseSupplierPayment({ paymentId: payment!.id, reason: reason.trim(), idempotencyKey }), {
    onSuccess: () => { setReason(""); setError(null); setIdempotencyKey(crypto.randomUUID()); onReversed(); },
    onError: (failure) => setError(isApiError(failure) ? failure.message : "The payment could not be reversed. Nothing changed."),
  });
  return (
    <Dialog open={open} onOpenChange={(next) => { if (mutation.isPending) return; if (!next) { setReason(""); setError(null); } onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse supplier payment</DialogTitle>
          <DialogDescription>{payment ? <>Reverses <MoneyText money={payment.amount} /> paid to {payment.supplierName} by {SUPPLIER_PAYMENT_METHOD_LABELS[payment.method].toLowerCase()}. The allocated balances reopen{payment.method === "cash" ? " and the cash goes back into the open drawer" : ""}. The original payment stays on record.</> : null}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="rounded-md border border-danger/30 bg-danger-bg/50 px-3 py-2.5 text-[12.5px] text-danger">This is audited with your name attached and can be done only once.</p>
          <Field label="Reason" required>
            <Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Paid the same invoice twice" data-testid="reverse-supplier-payment-reason" />
          </Field>
          {error ? <p role="alert" className="text-[12.5px] text-danger">{error}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button variant="signal" loading={mutation.isPending} disabled={!payment || reason.trim().length < 5} onClick={() => mutation.mutate()} data-testid="confirm-reverse-supplier-payment"><Undo2 /> Reverse payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SupplierPaymentRow({ payment, writeEnabled, onReverse }: { payment: SupplierPayment; writeEnabled: boolean; onReverse?: (payment: SupplierPayment) => void }) {
  const reversed = payment.status === "reversed";
  return (
    <li className="space-y-1.5 px-4 py-3" data-testid="supplier-payment-row">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium"><MoneyText money={payment.amount} /> · {SUPPLIER_PAYMENT_METHOD_LABELS[payment.method]}{payment.reference ? <span className="font-mono text-[12px] text-ink-2"> · {payment.reference}</span> : null}</p>
          <p className="text-[11.5px] text-ink-3"><DateTimeText iso={payment.occurredAt} /> · {payment.recordedByName} · {payment.branchName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {reversed ? <Badge variant="danger" dot>Reversed</Badge> : <Badge variant="success" dot>Recorded</Badge>}
          <LedgerStatusBadge status={payment.ledgerPostingStatus} />
        </div>
      </div>
      <ul className="text-[11.5px] text-ink-2">{payment.allocations.map((allocation) => <li key={allocation.payableId} className="flex justify-between gap-3"><span className="truncate">{allocation.sourceLabel}</span><MoneyText money={allocation.amount} /></li>)}</ul>
      {payment.reversal ? <p className="text-[11.5px] text-danger">Reversed <DateTimeText iso={payment.reversal.reversedAt} /> by {payment.reversal.reversedByName}: {payment.reversal.reason}</p> : null}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <Button asChild size="xs" variant="ghost"><Link href={supplierPaymentHref(payment.id)}><ExternalLink /> Confirmation</Link></Button>
        {writeEnabled && !reversed && onReverse ? <Button size="xs" variant="ghost" onClick={() => onReverse(payment)}><Undo2 /> Reverse…</Button> : null}
      </div>
    </li>
  );
}

/** Payment history for one payable or one supplier, opened from the table. */
export function SupplierPaymentHistoryDialog({ open, onOpenChange, query, title, description, writeEnabled }: { open: boolean; onOpenChange: (open: boolean) => void; query: SupplierPaymentsQuery; title: string; description?: string; writeEnabled: boolean }) {
  const invalidate = useInvalidate();
  const [reversing, setReversing] = useState<SupplierPayment | null>(null);
  const historyQuery = useApiQuery(qk.supplierPayments({ kind: "history", ...query }), (api) => api.listSupplierPayments({ ...query, pageSize: 50 }), { enabled: open });
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <DialogBody className="max-h-[60vh] overflow-y-auto p-0">
            {historyQuery.isLoading ? <div className="space-y-3 p-4"><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
              : historyQuery.isError ? <div className="p-4"><QueryErrorState error={historyQuery.error} onRetry={() => void historyQuery.refetch()} /></div>
                : (historyQuery.data?.items.length ?? 0) === 0 ? <EmptyState compact title="No payments yet" description="Payments recorded against this balance will appear here." className="m-4" />
                  : <ul className="divide-y divide-line">{historyQuery.data!.items.map((payment) => <SupplierPaymentRow key={payment.id} payment={payment} writeEnabled={writeEnabled} onReverse={setReversing} />)}</ul>}
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ReverseSupplierPaymentDialog payment={reversing} open={Boolean(reversing)} onOpenChange={(next) => { if (!next) setReversing(null); }} onReversed={async () => { setReversing(null); await invalidate([qk.payables(), qk.supplierPayments()]); }} />
    </>
  );
}
