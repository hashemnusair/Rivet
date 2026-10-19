"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, Undo2 } from "lucide-react";
import { useState } from "react";
import { PlatformPanel, PlatformPanelHeader } from "@/components/platform/platform-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { StatePanel } from "@/components/ui/states";
import { InvoiceLines } from "@/features/billing/invoice-lines";
import type { PlatformBillingInvoice, PlatformCommerceView, PlatformPaymentDetails } from "@/lib/api/GymOSApi";
import { isApiError } from "@/lib/api/errors";
import { qk } from "@/lib/api/keys";
import { useApiMutation, useApiQuery } from "@/lib/hooks/use-api";
import { useFormat } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/provider";
import { paymentNoteReference } from "../../../../convex/firstPayment";

/**
 * Payment details gyms sent from their payment page, waiting for RIVET's team
 * to check the bank or CliQ account. Confirming records the payment (and opens
 * a new gym's workspace); sending back tells the gym what to fix.
 */
export function PaymentConfirmations({ invoices, onUpdated }: { invoices: PlatformBillingInvoice[]; onUpdated: (invoice: PlatformBillingInvoice) => void }) {
  const { t, isolate, isolateLtr } = useLocale();
  const f = useFormat();
  const waiting = invoices.filter((invoice) => invoice.paymentClaim?.status === "submitted").sort((left, right) => (left.paymentClaim?.submittedAt ?? "").localeCompare(right.paymentClaim?.submittedAt ?? ""));
  const [action, setAction] = useState<{ invoice: PlatformBillingInvoice; kind: "confirm" | "reject" }>();
  return (
    <PlatformPanel className="mt-5" aria-labelledby="payments-to-confirm" data-testid="payments-to-confirm">
      <PlatformPanelHeader id="payments-to-confirm" title={t("commerce.confirm.title")} description={t("commerce.confirm.description")} />
      {waiting.length === 0 ? (
        <StatePanel compact title={t("commerce.confirm.empty")} />
      ) : (
        <ul className="divide-y divide-line">
          {waiting.map((invoice) => {
            const claim = invoice.paymentClaim!;
            return (
              <li key={invoice.id} id={`payment-claim-${invoice.id}`} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold" dir="auto">{invoice.gym}</span>
                    <span className="font-mono text-[11.5px] text-ink-3" dir="ltr" title={invoice.id}>{paymentNoteReference(invoice.id)}</span>
                    {invoice.firstPayment ? <Badge variant="signal">{t("commerce.confirm.firstPayment")}</Badge> : null}
                    {invoice.planChange?.to ? <Badge variant="signal">{t("platformFinance.billingPage.kind.upgradeFrom", { from: isolate(invoice.planChange.from ?? "—"), plan: isolate(invoice.planChange.to) })}</Badge> : null}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-5">
                    <div><dt className="text-ink-3">{t("commerce.confirm.amount")}</dt><dd className="tabular font-medium">{isolateLtr(f.money({ amount: claim.amountMinor, currency: invoice.currency ?? "JOD" }))}</dd></div>
                    <div><dt className="text-ink-3">{t("commerce.confirm.method")}</dt><dd>{t(`commerce.methods.${claim.method}`)}</dd></div>
                    <div><dt className="text-ink-3">{t("commerce.confirm.reference")}</dt><dd className="font-mono break-all" dir="ltr">{claim.reference}</dd></div>
                    <div><dt className="text-ink-3">{t("commerce.confirm.payer")}</dt><dd dir="auto">{claim.payerName}</dd></div>
                    <div><dt className="text-ink-3">{t("commerce.confirm.paidOn")}</dt><dd>{f.date(claim.paidOn)}</dd></div>
                  </dl>
                  {claim.note ? <p className="mt-2 text-[12.5px] text-ink-2" dir="auto">{claim.note}</p> : null}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setAction({ invoice, kind: "confirm" })}><Check aria-hidden />{t("commerce.confirm.confirm")}</Button>
                  <Button size="sm" variant="secondary" onClick={() => setAction({ invoice, kind: "reject" })}><Undo2 aria-hidden />{t("commerce.confirm.reject")}</Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {action ? <ClaimDecisionDialog key={`${action.invoice.id}:${action.kind}`} invoice={action.invoice} kind={action.kind} onClose={() => setAction(undefined)} onUpdated={onUpdated} /> : null}
    </PlatformPanel>
  );
}

function ClaimDecisionDialog({ invoice, kind, onClose, onUpdated }: { invoice: PlatformBillingInvoice; kind: "confirm" | "reject"; onClose: () => void; onUpdated: (invoice: PlatformBillingInvoice) => void }) {
  const { t } = useLocale();
  const claim = invoice.paymentClaim!;
  const [reason, setReason] = useState(kind === "confirm" ? t("commerce.confirm.reasonDefault", { method: t(`commerce.methods.${claim.method}`), reference: claim.reference }) : "");
  const confirm = useApiMutation((api, input: { reason: string }) => api.recordPlatformInvoicePayment({ invoiceId: invoice.id, reference: claim.reference, reason: input.reason, paidAt: claim.paidOn }), {
    successMessage: t("commerce.confirm.confirmed"),
    onSuccess: (updated) => {
      onUpdated(updated);
      onClose();
    },
  });
  const reject = useApiMutation((api, input: { reason: string }) => api.rejectPlatformInvoicePayment({ invoiceId: invoice.id, reason: input.reason }), {
    successMessage: t("commerce.confirm.rejected"),
    onSuccess: (updated) => {
      onUpdated(updated);
      onClose();
    },
  });
  const pending = confirm.isPending || reject.isPending;
  const submit = () => {
    if (reason.trim().length < 3) return;
    if (kind === "confirm") confirm.mutate({ reason: reason.trim() });
    else reject.mutate({ reason: reason.trim() });
  };
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === "confirm" ? t("commerce.confirm.confirmTitle", { gym: invoice.gym }) : t("commerce.confirm.rejectTitle", { gym: invoice.gym })}</DialogTitle>
          <DialogDescription>{kind === "confirm" ? t("commerce.confirm.confirmBody") : t("commerce.confirm.rejectBody")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {kind === "confirm" ? <InvoiceLines invoice={invoice} /> : null}
          <Field label={kind === "confirm" ? t("commerce.confirm.reasonLabel") : t("commerce.confirm.rejectReason")} required>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} dir="auto" />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t("common.action.cancel")}</Button>
          <Button variant={kind === "confirm" ? "primary" : "danger"} onClick={submit} loading={pending} disabled={reason.trim().length < 3}>
            {kind === "confirm" ? t("commerce.confirm.confirm") : t("commerce.confirm.reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DETAIL_FIELDS = ["cliqAlias", "cliqName", "bankName", "accountName", "iban"] as const;

/** RIVET's own payment details, as every gym's payment page shows them. */
export function PaymentDetailsPanel() {
  const { t } = useLocale();
  const query = useApiQuery(qk.platformCommerce, (api) => api.getPlatformCommerce());
  const [editing, setEditing] = useState(false);
  const details = query.data?.paymentDetails;
  const set = details ? DETAIL_FIELDS.some((field) => details[field]) : false;
  return (
    <PlatformPanel className="mt-5" aria-labelledby="payment-details-heading">
      <PlatformPanelHeader
        id="payment-details-heading"
        title={t("commerce.paymentDetails.title")}
        description={t("commerce.paymentDetails.description")}
        actions={details ? <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil aria-hidden />{t("commerce.paymentDetails.edit")}</Button> : undefined}
      />
      <div className="p-4 sm:p-5">
        {!details ? (
          <Skeleton className="h-16 w-full" />
        ) : set ? (
          <dl className="grid gap-x-8 gap-y-3 text-[13px] sm:grid-cols-3">
            {DETAIL_FIELDS.filter((field) => details[field]).map((field) => (
              <div key={field}>
                <dt className="text-[12px] text-ink-3">{t(`commerce.paymentDetails.${field}`)}</dt>
                <dd className="mt-0.5 break-all font-medium" dir={field === "iban" || field === "cliqAlias" ? "ltr" : "auto"}>{details[field]}</dd>
              </div>
            ))}
            {details.note ? <div className="sm:col-span-3"><dt className="text-[12px] text-ink-3">{t("commerce.paymentDetails.note")}</dt><dd className="mt-0.5" dir="auto">{details.note}</dd></div> : null}
          </dl>
        ) : (
          <p className="text-[13px] text-ink-3">{t("commerce.paymentDetails.notSet")}</p>
        )}
      </div>
      {editing && details ? <PaymentDetailsDialog details={details} onClose={() => setEditing(false)} /> : null}
    </PlatformPanel>
  );
}

function PaymentDetailsDialog({ details, onClose }: { details: PlatformPaymentDetails; onClose: () => void }) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PlatformPaymentDetails>({ ...details });
  const [reason, setReason] = useState("");
  const [ibanError, setIbanError] = useState<string>();
  const mutation = useApiMutation((api, input: PlatformPaymentDetails & { reason: string }) => api.updatePaymentDetails(input), {
    successMessage: t("commerce.paymentDetails.saved"),
    onSuccess: (next: PlatformCommerceView) => {
      queryClient.setQueryData(qk.platformCommerce, next);
      onClose();
    },
    onError: (error) => {
      if (isApiError(error) && error.sourceFieldErrors?.iban) setIbanError(t("commerce.paymentDetails.ibanInvalid"));
    },
  });
  const update = (field: keyof PlatformPaymentDetails, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = () => {
    const iban = form.iban.trim().toUpperCase().replace(/\s+/g, "");
    if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) {
      setIbanError(t("commerce.paymentDetails.ibanInvalid"));
      return;
    }
    setIbanError(undefined);
    mutation.mutate({ ...form, iban, reason: reason.trim() });
  };
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("commerce.paymentDetails.title")}</DialogTitle>
          <DialogDescription>{t("commerce.paymentDetails.description")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          {DETAIL_FIELDS.map((field) => (
            <Field key={field} label={t(`commerce.paymentDetails.${field}`)} error={field === "iban" ? ibanError : undefined} className={field === "iban" ? "sm:col-span-2" : undefined}>
              <Input value={form[field]} onChange={(event) => update(field, event.target.value)} dir={field === "iban" || field === "cliqAlias" ? "ltr" : "auto"} autoComplete="off" />
            </Field>
          ))}
          <Field label={t("commerce.paymentDetails.note")} className="sm:col-span-2">
            <Textarea value={form.note} onChange={(event) => update("note", event.target.value)} rows={2} dir="auto" />
          </Field>
          <Field label={t("commerce.paymentDetails.reason")} className="sm:col-span-2" required>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>{t("common.action.cancel")}</Button>
          <Button onClick={submit} loading={mutation.isPending} disabled={reason.trim().length < 3}>{t("commerce.paymentDetails.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
