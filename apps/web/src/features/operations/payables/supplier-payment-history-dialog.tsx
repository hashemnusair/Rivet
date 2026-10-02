"use client";
import { useLocale, useT } from "@/lib/i18n/provider";

import { ExternalLink, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { qk } from "@/lib/api/keys";
import { isApiError, localizeApiError } from "@/lib/api/errors";
import { useFormat } from "@/lib/i18n/format";
import { payableSourceLabel, supplierPaymentMethodLabel } from "@/lib/i18n/payables";
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
  const { t, locale, isolate, isolateLtr } = useLocale();
  const f = useFormat();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const mutation = useApiMutation((api) => api.reverseSupplierPayment({ paymentId: payment!.id, reason: reason.trim(), idempotencyKey }), {
    onSuccess: () => { setReason(""); setError(null); setIdempotencyKey(crypto.randomUUID()); onReversed(); },
    onError: (failure) => setError(failure),
  });
  return (
    <Dialog open={open} onOpenChange={(next) => { if (mutation.isPending) return; if (!next) { setReason(""); setError(null); } onOpenChange(next); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("payablesWorkspace.reverseSupplierPayment")}</DialogTitle>
          <DialogDescription>{payment ? <>{t("payablesWorkspace.reverseHint", { amount: isolateLtr(f.money(payment.amount)), supplier: isolate(payment.supplierName), method: supplierPaymentMethodLabel(payment.method, t) })}{payment.method === "cash" ? <> {t("payablesWorkspace.cashReturned")}</> : null}</> : null}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="rounded-md border border-danger/30 bg-danger-bg/50 px-3 py-2.5 text-[12.5px] text-danger">{t("payablesWorkspace.irreversible")}</p>
          <Field label={t("common.label.reason")} required>
            <Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("payablesWorkspace.reverseReasonExample")} data-testid="reverse-supplier-payment-reason" />
          </Field>
          {error != null ? <p role="alert" className="text-[12.5px] text-danger">{isApiError(error) ? localizeApiError(error, locale).message : t("payablesWorkspace.reverseFailure")}</p> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>{t("common.action.cancel")}</Button>
          <Button variant="signal" loading={mutation.isPending} disabled={!payment || reason.trim().length < 5} onClick={() => mutation.mutate()} data-testid="confirm-reverse-supplier-payment"><Undo2 /> {" "}{t("payablesWorkspace.reversePayment")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SupplierPaymentRow({ payment, writeEnabled, onReverse }: { payment: SupplierPayment; writeEnabled: boolean; onReverse?: (payment: SupplierPayment) => void }) {
  const { t, isolate } = useLocale();
  const f = useFormat();
  const reversed = payment.status === "reversed";
  return (
    <li className="space-y-1.5 px-4 py-3" data-testid="supplier-payment-row">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium"><MoneyText money={payment.amount} /> · {supplierPaymentMethodLabel(payment.method, t)}{payment.reference ? <span className="font-mono text-[12px] text-ink-2"> · {payment.reference}</span> : null}</p>
          <p className="text-[12px] text-ink-3"><DateTimeText iso={payment.occurredAt} /> · {payment.recordedByName} · {payment.branchName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {reversed ? <Badge variant="danger" dot>{t("payablesWorkspace.reversed")}</Badge> : <Badge variant="success" dot>{t("payablesWorkspace.recorded")}</Badge>}
          <LedgerStatusBadge status={payment.ledgerPostingStatus} />
        </div>
      </div>
      <ul className="text-[12px] text-ink-2">{payment.allocations.map((allocation) => <li key={allocation.payableId} className="flex justify-between gap-3"><span className="truncate">{payableSourceLabel(allocation.sourceLabel, t)}</span><MoneyText money={allocation.amount} /></li>)}</ul>
      {payment.reversal ? <p className="text-[12px] text-danger">{t("payablesWorkspace.reversedDetail", { date: `${f.date(payment.reversal.reversedAt)} · ${f.time(payment.reversal.reversedAt)}`, name: isolate(payment.reversal.reversedByName), reason: isolate(payment.reversal.reason) })}</p> : null}
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <Button asChild size="xs" variant="ghost"><Link href={supplierPaymentHref(payment.id)}><ExternalLink /> {" "}{t("payablesWorkspace.viewConfirmation")}</Link></Button>
        {writeEnabled && !reversed && onReverse ? <Button size="xs" variant="ghost" onClick={() => onReverse(payment)}><Undo2 /> {" "}{t("payablesWorkspace.reverseEllipsis")}</Button> : null}
      </div>
    </li>
  );
}

/** Payment history for one payable or one supplier, opened from the table. */
export function SupplierPaymentHistoryDialog({ open, onOpenChange, query, title, description, writeEnabled }: { open: boolean; onOpenChange: (open: boolean) => void; query: SupplierPaymentsQuery; title: string; description?: string; writeEnabled: boolean }) {
  const t = useT();
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
                : (historyQuery.data?.items.length ?? 0) === 0 ? <EmptyState compact title={t("members.tabs.payments.noPayments")} description={t("payablesWorkspace.historyHint")} className="m-4" />
                  : <ul className="divide-y divide-line">{historyQuery.data!.items.map((payment) => <SupplierPaymentRow key={payment.id} payment={payment} writeEnabled={writeEnabled} onReverse={setReversing} />)}</ul>}
          </DialogBody>
          <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ReverseSupplierPaymentDialog payment={reversing} open={Boolean(reversing)} onOpenChange={(next) => { if (!next) setReversing(null); }} onReversed={async () => { setReversing(null); await invalidate([qk.payables(), qk.supplierPayments()]); }} />
    </>
  );
}
