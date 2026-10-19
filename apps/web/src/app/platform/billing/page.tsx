"use client";
import { makeExportCopy } from "@/lib/exports/copy";
import { useLocale, useT, type TFunction } from "@/lib/i18n/provider";
import { useFormat, useFormattingTimeZone } from "@/lib/i18n/format";

import { invoicePdfIntent, openInvoicePdf } from "@/features/billing/invoice-pdf";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowDownToLine, Ban, CheckCircle2, FileText, MoreHorizontal, X } from "lucide-react";
import { PageHeader, Stat } from "@/components/shared/chrome";
import { PlatformPage, PlatformPanel, PlatformPanelHeader } from "@/components/platform/platform-page";
import { InvoiceStatusBadge } from "@/components/platform/platform-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaymentConfirmations, PaymentDetailsPanel } from "./payment-confirmations";
import { GymSubscriptions } from "./gym-subscriptions";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PlatformBillingInvoice, RecordPlatformInvoicePaymentInput } from "@/lib/api/GymOSApi";
import { useApiMutation } from "@/lib/hooks/use-api";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { money, readMoneyInput } from "@/lib/utils/money";
import { buildCsvDocument, formatMinorUnits } from "@/lib/exports/csv";
import { downloadTextFile } from "@/lib/exports/download";
import { paymentNoteReference } from "../../../../convex/firstPayment";

type InvoiceAction = { invoice: PlatformBillingInvoice; kind: "payment" | "void" };
type InvoiceFilter = "unpaid" | "paid" | "all";

const UNPAID = ["open", "past_due", "failed"];

/**
 * RIVET's billing desk: payments gyms sent and are waiting to be confirmed,
 * every invoice, each gym's plan, and where gyms pay. Gyms change their own
 * plan; this page confirms the money and handles the rare exception.
 */
export default function BillingPage() {
  const t = useT();
  const { locale } = useLocale();
  const timeZone = useFormattingTimeZone();
  const f = useFormat(timeZone);
  const { platformSnapshot } = useExperience();
  const searchParams = useSearchParams();
  const requestedInvoiceId = searchParams.get("invoice")?.trim() || undefined;
  // Gym pages link here with ?gym=<id>; older links used ?bill=<id>.
  const requestedGymId = searchParams.get("gym")?.trim() || searchParams.get("bill")?.trim() || undefined;
  const [localInvoices, setLocalInvoices] = useState<PlatformBillingInvoice[]>();
  const invoices = useMemo(() => localInvoices ?? platformSnapshot?.invoices ?? [], [localInvoices, platformSnapshot?.invoices]);
  const [filter, setFilter] = useState<InvoiceFilter>("unpaid");
  const [gymId, setGymId] = useState<string | undefined>(requestedGymId);
  const [action, setAction] = useState<InvoiceAction>();
  const [focusedInvoiceId, setFocusedInvoiceId] = useState<string>();

  useEffect(() => {
    if (platformSnapshot) setLocalInvoices(platformSnapshot.invoices);
  }, [platformSnapshot]);
  useEffect(() => setGymId(requestedGymId), [requestedGymId]);

  // A deep link to one invoice shows it whatever the filter, once the ledger has loaded.
  useEffect(() => {
    if (!requestedInvoiceId || !invoices.some((invoice) => invoice.id === requestedInvoiceId)) {
      setFocusedInvoiceId(undefined);
      return;
    }
    setFilter("all");
    setFocusedInvoiceId(requestedInvoiceId);
  }, [invoices, requestedInvoiceId]);
  useEffect(() => {
    if (!focusedInvoiceId) return;
    document.getElementById(`platform-invoice-${focusedInvoiceId}`)?.scrollIntoView?.({ block: "center" });
  }, [focusedInvoiceId]);

  const replaceInvoice = useCallback((updated: PlatformBillingInvoice) => {
    setLocalInvoices((current) => {
      const source = current ?? platformSnapshot?.invoices ?? [];
      return source.some((invoice) => invoice.id === updated.id) ? source.map((invoice) => invoice.id === updated.id ? updated : invoice) : [updated, ...source];
    });
  }, [platformSnapshot]);

  const summary = useMemo(() => {
    const currency = invoices.find((invoice) => invoice.currency)?.currency ?? "JOD";
    const month = (value: string | undefined) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(new Date(value)) : undefined;
    const thisMonth = month(new Date().toISOString());
    const sum = (items: PlatformBillingInvoice[]) => ({ amount: items.reduce((total, invoice) => total + invoiceAmountMinor(invoice), 0), currency });
    return {
      toConfirm: invoices.filter((invoice) => invoice.paymentClaim?.status === "submitted").length,
      unpaid: sum(invoices.filter((invoice) => UNPAID.includes(invoice.status))),
      paidThisMonth: sum(invoices.filter((invoice) => invoice.status === "paid" && month(invoice.paidAt) === thisMonth)),
    };
  }, [invoices, timeZone]);

  const gymName = gymId ? platformSnapshot?.gyms.find((gym) => gym.id === gymId)?.name ?? invoices.find((invoice) => invoice.gymId === gymId)?.gym : undefined;
  const shown = useMemo(() => invoices
    .filter((invoice) => !gymId || invoice.gymId === gymId)
    .filter((invoice) => filter === "all" || (filter === "unpaid" ? UNPAID.includes(invoice.status) : invoice.status === "paid"))
    .sort((left, right) => (right.issuedAt ?? right.date ?? "").localeCompare(left.issuedAt ?? left.date ?? "")), [filter, gymId, invoices]);
  const unpaidCount = invoices.filter((invoice) => UNPAID.includes(invoice.status) && (!gymId || invoice.gymId === gymId)).length;

  const recordPayment = useApiMutation((api, input: RecordPlatformInvoicePaymentInput) => api.recordPlatformInvoicePayment(input), {
    successMessage: t("platformFinance.billingPage.markedPaid"),
    onSuccess: (updated) => { replaceInvoice(updated); setAction(undefined); },
  });
  const voidInvoice = useApiMutation((api, input: { invoiceId: string; reason: string }) => api.voidPlatformInvoice(input.invoiceId, input.reason), {
    successMessage: t("platformFinance.billingPage.voided"),
    onSuccess: (updated) => { replaceInvoice(updated); setAction(undefined); },
  });

  return (
    <PlatformPage>
      <PageHeader
        title={t("platformFinance.billing.title")}
        description={t("platformFinance.billingPage.description")}
        actions={<Button variant="secondary" onClick={() => downloadInvoices(invoices, locale, t, timeZone)} disabled={invoices.length === 0}><ArrowDownToLine />{t("platformFinance.billingPage.download")}</Button>}
      />

      <section className="mt-5 grid gap-3 sm:grid-cols-3" aria-label={t("platformFinance.billing.totals")}>
        <PlatformPanel className="p-4"><Stat label={t("platformFinance.billingPage.toConfirm")} value={platformSnapshot ? f.number(summary.toConfirm) : "—"} context={t("platformFinance.billingPage.toConfirmContext")} tone={summary.toConfirm ? "warning" : undefined} /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label={t("platformFinance.billingPage.unpaid")} value={platformSnapshot ? f.money(summary.unpaid) : "—"} context={t("platformFinance.billingPage.unpaidContext")} /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label={t("platformFinance.billingPage.paidThisMonth")} value={platformSnapshot ? f.money(summary.paidThisMonth) : "—"} context={t("platformFinance.billingPage.paidContext")} /></PlatformPanel>
      </section>

      <PaymentConfirmations invoices={invoices} onUpdated={replaceInvoice} />

      <PlatformPanel className="mt-5 overflow-hidden" aria-labelledby="platform-invoices-heading">
        <PlatformPanelHeader
          id="platform-invoices-heading"
          title={t("platformFinance.billingPage.invoices")}
          description={t("platformFinance.billingPage.invoicesDescription")}
          actions={
            <div role="group" aria-label={t("platformFinance.billingPage.filterLabel")} className="inline-flex rounded-md border border-line-2 p-0.5">
              {(["unpaid", "paid", "all"] as const).map((value) => (
                <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={cn("cursor-pointer rounded-[5px] px-3 py-1 text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink", filter === value && "bg-ink text-paper hover:text-paper")}>
                  {t(`platformFinance.billingPage.filter.${value}`)}{value === "unpaid" && unpaidCount ? <span className="ms-1.5 tabular opacity-80">{f.number(unpaidCount)}</span> : null}
                </button>
              ))}
            </div>
          }
        />
        {gymId ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-sunken/40 px-4 py-2 text-[12.5px] sm:px-5">
            <span className="text-ink-2">{t("platformFinance.billingPage.gymFilter", { gym: gymName ?? gymId })}</span>
            <Button variant="ghost" size="xs" onClick={() => setGymId(undefined)}><X aria-hidden />{t("platformFinance.billingPage.allGyms")}</Button>
          </div>
        ) : null}
        {!platformSnapshot ? (
          <p className="px-5 py-10 text-center text-[12.5px] text-ink-3" role="status">{t("platformFinance.billingPage.loading")}</p>
        ) : shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-[12.5px] text-ink-3">{t(`platformFinance.billingPage.empty.${filter}`)}</p>
        ) : (
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead className="ps-4 sm:ps-5">{t("platformFinance.billingPage.col.gym")}</TableHead>
                <TableHead>{t("platformFinance.billingPage.col.for")}</TableHead>
                <TableHead className="text-end">{t("platformFinance.billingPage.col.amount")}</TableHead>
                <TableHead>{t("platformFinance.billingPage.col.date")}</TableHead>
                <TableHead>{t("platformFinance.billingPage.col.status")}</TableHead>
                <TableHead className="pe-4 text-end sm:pe-5"><span className="sr-only">{t("common.label.actions")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} focused={focusedInvoiceId === invoice.id} onAction={(kind) => setAction({ invoice, kind })} />)}
            </TableBody>
          </Table>
        )}
      </PlatformPanel>

      <GymSubscriptions gyms={platformSnapshot?.gyms ?? []} focusedGymId={gymId} />

      <PaymentDetailsPanel />

      <InvoiceActionDialog action={action} onOpenChange={(open) => { if (!open) setAction(undefined); }} onPayment={(input) => recordPayment.mutate(input)} onVoid={(input) => voidInvoice.mutate(input)} saving={recordPayment.isPending || voidInvoice.isPending} />
    </PlatformPage>
  );
}

/** What an invoice is for, in a word or two. */
function invoiceKind(invoice: PlatformBillingInvoice, t: TFunction, isolate: (value: string) => string): string {
  if (invoice.firstPayment) return t("platformFinance.billingPage.kind.first");
  if (invoice.planChange?.to) return t("platformFinance.billingPage.kind.upgrade", { plan: isolate(invoice.planChange.to) });
  if (invoice.cycleKey?.startsWith("change:")) return t("platformFinance.billingPage.kind.change");
  if (invoice.cycleKey) return t("platformFinance.billingPage.kind.renewal");
  return t("platformFinance.billingPage.kind.other");
}

function InvoiceRow({ invoice, focused, onAction }: { invoice: PlatformBillingInvoice; focused: boolean; onAction: (kind: InvoiceAction["kind"]) => void }) {
  const t = useT();
  const { isolate, isolateLtr } = useLocale();
  const timeZone = useFormattingTimeZone();
  const f = useFormat(timeZone);
  const amount = invoice.amountMinor !== undefined ? f.money(money(invoice.amountMinor, invoice.currency ?? "JOD")) : invoice.amount;
  const unpaid = UNPAID.includes(invoice.status);
  const waiting = invoice.paymentClaim?.status === "submitted";
  const date = invoice.status === "paid" && invoice.paidAt
    ? t("platformFinance.billingPage.paidOn", { date: f.date(invoice.paidAt) })
    : invoice.dueAt && Number.isFinite(Date.parse(invoice.dueAt)) ? t("platformFinance.billingPage.dueOn", { date: f.date(invoice.dueAt) }) : "—";
  return (
    <TableRow id={`platform-invoice-${invoice.id}`} className={cn(focused && "bg-sunken/60")}>
      <TableCell className="ps-4 sm:ps-5">
        {invoice.gymId ? <Link href={`/platform/gyms/${invoice.gymId}`} className="text-[13px] font-semibold underline-offset-4 hover:underline" dir="auto">{invoice.gym}</Link> : <span className="text-[13px] font-semibold" dir="auto">{invoice.gym}</span>}
        <span className="mt-0.5 block font-mono text-[11.5px] text-ink-3" dir="ltr" title={invoice.id}>{paymentNoteReference(invoice.id)}</span>
      </TableCell>
      <TableCell className="text-[12.5px] text-ink-2">{invoiceKind(invoice, t, isolate)}</TableCell>
      <TableCell className="text-end text-[13px] font-semibold tabular">{amount}</TableCell>
      <TableCell className="whitespace-nowrap text-[12.5px] text-ink-2">{date}</TableCell>
      <TableCell>{waiting ? <Badge variant="warning">{t("platformFinance.billingPage.waiting")}</Badge> : <InvoiceStatusBadge status={invoice.status} />}</TableCell>
      <TableCell className="pe-4 sm:pe-5">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" {...invoicePdfIntent} onClick={() => openInvoicePdf(invoice, { name: invoice.gym })} aria-label={t("platformFinance.billing.table.viewPdf", { invoiceId: isolateLtr(invoice.id) })} data-testid="view-invoice-pdf"><FileText /><span dir="ltr">{t("platformFinance.billing.table.pdf")}</span></Button>
          {unpaid ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label={t("platformFinance.billingPage.more", { id: isolateLtr(paymentNoteReference(invoice.id)) })}><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!waiting ? <DropdownMenuItem onClick={() => onAction("payment")}><CheckCircle2 /> {t("platformFinance.billingPage.markPaid")}</DropdownMenuItem> : null}
                <DropdownMenuItem onClick={() => onAction("void")}><Ban /> {t("platformFinance.billingPage.void")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function InvoiceActionDialog({ action, onOpenChange, onPayment, onVoid, saving }: { action?: InvoiceAction; onOpenChange: (open: boolean) => void; onPayment: (input: RecordPlatformInvoicePaymentInput) => void; onVoid: (input: { invoiceId: string; reason: string }) => void; saving: boolean }) {
  const t = useT();
  const { isolate, isolateLtr } = useLocale();
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const payment = action?.kind === "payment";
  const label = action ? isolateLtr(paymentNoteReference(action.invoice.id)) : "";
  const submit = () => {
    if (!action || !reason.trim()) return;
    if (payment) onPayment({ invoiceId: action.invoice.id, reference: reference.trim(), reason: reason.trim() });
    else onVoid({ invoiceId: action.invoice.id, reason: reason.trim() });
  };
  return (
    <Dialog open={Boolean(action)} onOpenChange={onOpenChange}>
      <DialogContent key={action ? `${action.invoice.id}:${action.kind}` : "closed"}>
        <DialogHeader>
          <DialogTitle>{payment ? t("platformFinance.billingPage.markPaidTitle", { id: label, gym: isolate(action?.invoice.gym ?? "") }) : t("platformFinance.billingPage.voidTitle", { id: label, gym: isolate(action?.invoice.gym ?? "") })}</DialogTitle>
          <DialogDescription>{payment ? t("platformFinance.billingPage.markPaidBody") : t("platformFinance.billingPage.voidBody")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4">
          {payment ? <Field label={t("platformFinance.billingPage.reference")} htmlFor="platform-invoice-reference" required><Input id="platform-invoice-reference" value={reference} onChange={(event) => setReference(event.target.value)} dir="ltr" autoComplete="off" /></Field> : null}
          <Field label={t("platformFinance.billingPage.reason")} htmlFor="platform-invoice-reason" required><Textarea id="platform-invoice-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={2} dir="auto" /></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button>
          <Button loading={saving} disabled={!action || !reason.trim() || (payment && !reference.trim())} variant={payment ? "primary" : "danger"} onClick={submit}>{payment ? t("platformFinance.billingPage.markPaid") : t("platformFinance.billingPage.void")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function invoiceAmountMinor(invoice: PlatformBillingInvoice): number {
  if (Number.isSafeInteger(invoice.amountMinor) && (invoice.amountMinor ?? 0) >= 0) return invoice.amountMinor ?? 0;
  const parsed = readMoneyInput(invoice.amount, invoice.currency ?? "JOD");
  return parsed.ok && parsed.money.amount >= 0 ? parsed.money.amount : 0;
}

function downloadInvoices(invoices: PlatformBillingInvoice[], locale: "en" | "ar", t: TFunction, timeZone: string) {
  const copy = makeExportCopy(locale);
  downloadTextFile({
    fileName: "rivet-platform-invoices.csv",
    mimeType: "text/csv;charset=utf-8",
    content: buildCsvDocument({
      locale,
      title: t("platformFinance.billing.csvTitle"),
      metadata: [{ label: t("platformFinance.billing.csvTimezone"), value: timeZone }],
      headers: ["Invoice ID", "Gym", "Invoice type", "Billing interval", "Service period starts", "Service period ends", "Issued", "Due", "Amount", "Currency", "Status", "Payment reference", "Paid", "Voided"].map(copy.label),
      rows: invoices.map((invoice) => [
        invoice.id,
        invoice.gym,
        copy.label(invoice.firstPayment ? "First payment" : invoice.planChange ? "Upgrade" : invoice.cycleKey ? "Renewal" : "Other"),
        copy.status(invoice.billingInterval),
        copy.dateTime(invoice.periodStart, timeZone),
        copy.dateTime(invoice.periodEnd, timeZone),
        copy.dateTime(invoice.issuedAt ?? invoice.date, timeZone),
        copy.dateTime(invoice.dueAt, timeZone),
        invoice.amountMinor === undefined ? invoice.amount : formatMinorUnits(invoice.amountMinor, invoice.currency),
        invoice.currency,
        copy.status(invoice.status),
        invoice.paymentReference,
        copy.dateTime(invoice.paidAt, timeZone),
        copy.dateTime(invoice.voidedAt, timeZone),
      ]),
    }),
  });
}
