"use client";

import { openInvoicePdf } from "@/features/billing/invoice-pdf";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDownToLine, Ban, CalendarClock, CheckCircle2, CircleAlert, FilePlus2, FileText, Receipt, Send } from "lucide-react";
import { PageHeader, Stat } from "@/components/shared/chrome";
import { PlatformPage, PlatformPanel, PlatformPanelHeader } from "@/components/platform/platform-page";
import { InvoiceStatusBadge } from "@/components/platform/platform-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BillGymWizard } from "./bill-gym-wizard";
import { GymSubscriptions } from "./gym-subscriptions";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CreatePlatformInvoiceInput, PlatformBillingInvoice, RecordPlatformInvoicePaymentInput } from "@/lib/api/GymOSApi";
import { useApiMutation } from "@/lib/hooks/use-api";
import { INVOICE_LEAD_DAYS, OVERDUE_BEFORE_NOTICE_DAYS, PAYMENT_TERM_DAYS, SUSPENSION_AFTER_DUE_DAYS, SUSPENSION_NOTICE_DAYS } from "../../../../convex/subscriptionTerm";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { exponentFor, formatMoney } from "@/lib/utils/money";
import { buildCsvDocument, exportStatusLabel, formatExportDateTime, formatMinorUnits } from "@/lib/exports/csv";
import { downloadTextFile } from "@/lib/exports/download";

type InvoiceAction = { invoice: PlatformBillingInvoice; kind: "payment" | "past_due" | "void" };

export default function BillingPage() {
  const { platformSnapshot } = useExperience();
  const searchParams = useSearchParams();
  const requestedInvoiceId = searchParams.get("invoice")?.trim() || undefined;
  const [localInvoices, setLocalInvoices] = useState<PlatformBillingInvoice[]>();
  const invoices = useMemo(() => localInvoices ?? platformSnapshot?.invoices ?? [], [localInvoices, platformSnapshot?.invoices]);
  const overview = platformSnapshot?.overview;
  const [createOpen, setCreateOpen] = useState(false);
  const [billWizardOpen, setBillWizardOpen] = useState(false);
  const [billWizardGymId, setBillWizardGymId] = useState<string>();
  const [policyOpen, setPolicyOpen] = useState(false);
  const [action, setAction] = useState<InvoiceAction>();
  const [focusedInvoiceId, setFocusedInvoiceId] = useState<string>();
  const requestedBillGymId = searchParams.get("bill")?.trim() || undefined;

  // A gym page's "Manage subscription" link lands here with ?bill=<gymId>;
  // open the wizard on that tenant once the snapshot can resolve it.
  useEffect(() => {
    if (!requestedBillGymId || !platformSnapshot) return;
    if (!platformSnapshot.gyms.some((gym) => gym.id === requestedBillGymId && gym.isProvisioned === true && !gym.isArchived)) return;
    setBillWizardGymId(requestedBillGymId);
    setBillWizardOpen(true);
  }, [requestedBillGymId, platformSnapshot]);

  useEffect(() => {
    if (platformSnapshot) setLocalInvoices(platformSnapshot.invoices);
  }, [platformSnapshot]);

  useEffect(() => {
    if (!requestedInvoiceId) {
      setFocusedInvoiceId(undefined);
      return;
    }
    // Wait until the requested row is actually in the live snapshot before
    // focusing or scrolling. Header navigation can arrive before the ledger
    // has hydrated, and an eager timeout silently loses the deep link.
    if (!invoices.some((invoice) => invoice.id === requestedInvoiceId)) {
      setFocusedInvoiceId(undefined);
      return;
    }
    setFocusedInvoiceId(requestedInvoiceId);
  }, [invoices, requestedInvoiceId]);

  // Focus only after the state update above has committed the requested row.
  // Scheduling from the discovery effect could race the first render after a
  // live snapshot arrived, leaving the row highlighted but not brought into
  // view on a cold deep link.
  useEffect(() => {
    if (!requestedInvoiceId || focusedInvoiceId !== requestedInvoiceId) return;
    document.getElementById(`platform-invoice-${requestedInvoiceId}`)?.scrollIntoView?.({ block: "center" });
  }, [focusedInvoiceId, requestedInvoiceId]);

  const replaceInvoice = useCallback((updated: PlatformBillingInvoice) => {
    setLocalInvoices((current) => {
      const source = current ?? platformSnapshot?.invoices ?? [];
      return source.some((invoice) => invoice.id === updated.id)
        ? source.map((invoice) => invoice.id === updated.id ? updated : invoice)
        : [updated, ...source];
    });
  }, [platformSnapshot]);

  const invoiceTotals = useMemo(() => {
    const currency = invoices.find((invoice) => invoice.currency)?.currency ?? overview?.invoiceTotals.collected.currency ?? "JOD";
    const total = (statuses: string[]) => ({
      amount: invoices.filter((invoice) => statuses.includes(invoice.status)).reduce((sum, invoice) => sum + invoiceAmountMinor(invoice), 0),
      currency,
    });
    return {
      collected: total(["paid"]),
      outstanding: total(["open", "past_due", "failed"]),
      overdue: total(["past_due", "failed"]),
    };
  }, [invoices, overview?.invoiceTotals.collected.currency]);

  const automatedInvoices = useMemo(() => invoices.filter(isAutomaticRenewal), [invoices]);
  const manualInvoices = useMemo(() => invoices.filter((invoice) => !isAutomaticRenewal(invoice)), [invoices]);
  const renewalSummary = useMemo(() => {
    const amountFor = (items: PlatformBillingInvoice[]) => ({
      amount: items.reduce((sum, invoice) => sum + invoiceAmountMinor(invoice), 0),
      currency: items.find((invoice) => invoice.currency)?.currency ?? overview?.invoiceTotals.collected.currency ?? "JOD",
    });
    return {
      upcoming: automatedInvoices.filter((invoice) => invoice.status === "open"),
      inGrace: automatedInvoices.filter((invoice) => invoice.status === "past_due"),
      paid: automatedInvoices.filter((invoice) => invoice.status === "paid"),
      amountFor,
    };
  }, [automatedInvoices, overview?.invoiceTotals.collected.currency]);

  const issueInvoice = useApiMutation((api, invoiceId: string) => api.issuePlatformInvoice(invoiceId), { successMessage: "Invoice issued.", onSuccess: replaceInvoice });
  const recordPayment = useApiMutation((api, input: RecordPlatformInvoicePaymentInput) => api.recordPlatformInvoicePayment(input), {
    successMessage: "Manual payment recorded.",
    onSuccess: (updated) => { replaceInvoice(updated); setAction(undefined); },
  });
  const markPastDue = useApiMutation((api, input: { invoiceId: string; reason: string }) => api.markPlatformInvoicePastDue(input.invoiceId, input.reason), {
    successMessage: "Invoice marked past due.",
    onSuccess: (updated) => { replaceInvoice(updated); setAction(undefined); },
  });
  const voidInvoice = useApiMutation((api, input: { invoiceId: string; reason: string }) => api.voidPlatformInvoice(input.invoiceId, input.reason), {
    successMessage: "Invoice voided.",
    onSuccess: (updated) => { replaceInvoice(updated); setAction(undefined); },
  });

  return (
    <PlatformPage>
      <PageHeader
        title="Billing & invoices"
        description="Subscriptions, invoices and collections for every gym. RIVET never charges a card; you confirm bank or reference payments here."
        actions={
          <>
            <Button variant="secondary" onClick={() => setPolicyOpen(true)}><CalendarClock /> Renewal policy</Button>
            <Button variant="secondary" onClick={() => downloadInvoices(invoices)} disabled={invoices.length === 0}><ArrowDownToLine /> Export ledger</Button>
            <Button variant="signal" onClick={() => { setBillWizardGymId(undefined); setBillWizardOpen(true); }} disabled={!platformSnapshot}><Receipt /> Bill a gym</Button>
          </>
        }
      />

      <BillGymWizard open={billWizardOpen} onOpenChange={(open) => { setBillWizardOpen(open); if (!open) setBillWizardGymId(undefined); }} gyms={platformSnapshot?.gyms ?? []} plans={platformSnapshot?.plans ?? []} initialGymId={billWizardGymId} />

      {invoiceTotals.overdue.amount ? (
        <div className="mt-5 flex items-start gap-3 rounded-md border border-danger/30 bg-danger-bg px-4 py-3" role="status">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <div className="text-[12.5px]"><p className="font-semibold text-danger">Past-due invoices require manual review</p><p className="mt-0.5 text-ink-2">{formatMoney(invoiceTotals.overdue)} is marked overdue in the platform ledger. No automated retry has been attempted; record the payment reference or void the invoice below.</p></div>
        </div>
      ) : null}

      <section className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Billing totals">
        <PlatformPanel className="p-4"><Stat label="Outstanding" value={platformSnapshot ? formatMoney(invoiceTotals.outstanding) : "—"} context="Open and past-due invoices" tone={invoiceTotals.outstanding.amount ? "warning" : undefined} /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label="Collected" value={platformSnapshot ? formatMoney(invoiceTotals.collected) : "—"} context="Paid invoice records" /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label="Automatic charging" value="Not configured" context="Bank or reference payment confirmation only" /></PlatformPanel>
      </section>

      <GymSubscriptions gyms={platformSnapshot?.gyms ?? []} onBill={(gymId) => { setBillWizardGymId(gymId); setBillWizardOpen(true); }} />

      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How renewals work</DialogTitle>
            <DialogDescription>The subscription clock runs on its own; you only confirm payments.</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-2">
            <PolicyStep index="01" title="Invoice issued" detail={`${INVOICE_LEAD_DAYS} days before the term ends`} />
            <PolicyStep index="02" title="Due" detail={`${PAYMENT_TERM_DAYS} days after it is issued, as the agreement promises`} />
            <PolicyStep index="03" title="Past due" detail="The day after the due date, with written notice" />
            <PolicyStep index="04" title="Suspension" detail={`${SUSPENSION_AFTER_DUE_DAYS} days past due: ${OVERDUE_BEFORE_NOTICE_DAYS} days overdue plus ${SUSPENSION_NOTICE_DAYS} days' notice`} />
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">Record the payment reference on an invoice to mark it paid and reactivate the gym. RIVET never charges cards automatically.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPolicyOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="mt-5" aria-labelledby="renewal-summary-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><h2 id="renewal-summary-heading" className="text-[15px] font-semibold">Subscription invoice states</h2><p className="text-[12.5px] text-ink-3">From the renewal clock and subscription changes.</p></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <LifecycleCard label="Upcoming / open" count={renewalSummary.upcoming.length} amount={renewalSummary.amountFor(renewalSummary.upcoming)} detail={`Issued ${INVOICE_LEAD_DAYS} days early, payable within ${PAYMENT_TERM_DAYS}`} />
          <LifecycleCard label="In grace / past due" count={renewalSummary.inGrace.length} amount={renewalSummary.amountFor(renewalSummary.inGrace)} detail={`Access may close ${SUSPENSION_AFTER_DUE_DAYS} days after the due date`} tone={renewalSummary.inGrace.length > 0 ? "warning" : undefined} />
          <LifecycleCard label="Paid renewals" count={renewalSummary.paid.length} amount={renewalSummary.amountFor(renewalSummary.paid)} detail="Payment reference recorded" tone={renewalSummary.paid.length > 0 ? "success" : undefined} />
        </div>
      </section>

      <PlatformPanel className="mt-5 overflow-hidden" aria-labelledby="subscription-invoices-heading">
        <PlatformPanelHeader id="subscription-invoices-heading" title="Subscription invoices" description="Renewals and change invoices, newest workflow first." />
        {!platformSnapshot ? <p className="px-5 py-10 text-center text-[12.5px] text-ink-3" role="status">Loading the persisted invoice ledger…</p> : automatedInvoices.length === 0 ? <p className="px-5 py-10 text-center text-[12.5px] text-ink-3">No subscription invoices are currently recorded.</p> : <InvoiceTable invoices={automatedInvoices} focusedInvoiceId={focusedInvoiceId} issueInvoice={issueInvoice} setAction={setAction} />}
      </PlatformPanel>

      {platformSnapshot && manualInvoices.length ? (
        <details className="mt-4 rounded-lg border border-line bg-surface" open={manualInvoices.some((invoice) => invoice.id === focusedInvoiceId)}>
          <summary className="cursor-pointer list-none px-4 py-3.5 marker:hidden sm:px-5 [&::-webkit-details-marker]:hidden">
            <span className="block text-[15px] font-semibold">Manual invoices <span className="text-ink-3">({manualInvoices.length})</span></span>
            <span className="mt-0.5 block text-[12.5px] text-ink-3">One-off charges outside the renewal clock. Select to show or hide them.</span>
          </summary>
          <div className="border-t border-line"><InvoiceTable invoices={manualInvoices} focusedInvoiceId={focusedInvoiceId} issueInvoice={issueInvoice} setAction={setAction} /></div>
        </details>
      ) : null}

      {platformSnapshot ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3.5 sm:px-5" aria-label="Manual invoice exception workflow">
          <div><p className="text-[13px] font-semibold">Need a one-off ledger exception?</p><p className="mt-0.5 text-[12.5px] text-ink-3">Create a manual invoice only when a charge is outside the automated subscription cycle.</p></div>
          <Button variant="secondary" onClick={() => setCreateOpen(true)}><FilePlus2 /> Create exception invoice</Button>
        </div>
      ) : null}

      <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} gyms={platformSnapshot?.gyms ?? []} onCreated={replaceInvoice} />
      <InvoiceActionDialog action={action} onOpenChange={(open) => { if (!open) setAction(undefined); }} onPastDue={(input) => markPastDue.mutate(input)} onPayment={(input) => recordPayment.mutate(input)} onVoid={(input) => voidInvoice.mutate(input)} saving={markPastDue.isPending || recordPayment.isPending || voidInvoice.isPending} />
    </PlatformPage>
  );
}

const selectClass = "h-9 w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px] text-ink transition-colors hover:border-line-3 focus:border-[var(--tenant-brand-primary)]";

function CreateInvoiceDialog({ open, onOpenChange, gyms, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; gyms: Array<{ id: string; name: string }>; onCreated: (invoice: PlatformBillingInvoice) => void }) {
  const [gymId, setGymId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const create = useApiMutation((api, input: CreatePlatformInvoiceInput) => api.createPlatformInvoice(input), {
    successMessage: "Draft invoice created.",
    onSuccess: (invoice) => {
      onCreated(invoice);
      setGymId(""); setAmount(""); setDueAt(""); setPeriodStart(""); setPeriodEnd(""); onOpenChange(false);
    },
  });
  const parsedAmount = parsePositiveMinorAmount(amount, "JOD");
  const validAmount = parsedAmount.amountMinor !== undefined;
  const amountError = amount.trim() ? parsedAmount.error : undefined;
  const validPeriod = !periodStart || !periodEnd || periodEnd >= periodStart;
  const valid = Boolean(gymId && validAmount && dueAt && periodStart && periodEnd && validPeriod);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create a platform invoice</DialogTitle><DialogDescription>This creates a draft in the manual ledger. It does not charge a card or contact the gym.</DialogDescription></DialogHeader>
        <DialogBody className="grid gap-4">
          <Field label="Gym" htmlFor="platform-invoice-gym"><select id="platform-invoice-gym" className={selectClass} value={gymId} onChange={(event) => setGymId(event.target.value)}><option value="">Choose a provisioned gym</option>{gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}</select></Field>
          <Field label="Amount (JOD)" htmlFor="platform-invoice-amount" error={amountError}><Input id="platform-invoice-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="149.000" aria-invalid={Boolean(amountError)} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Period start" htmlFor="platform-invoice-period-start"><Input id="platform-invoice-period-start" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></Field><Field label="Period end" htmlFor="platform-invoice-period-end" error={validPeriod ? undefined : "Period end must be on or after the period start."}><Input id="platform-invoice-period-end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} aria-invalid={!validPeriod} /></Field></div>
          <Field label="Due date" htmlFor="platform-invoice-due"><Input id="platform-invoice-due" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></Field>
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate({ gymId, amountMinor: parsedAmount.amountMinor ?? 0, currency: "JOD", dueAt, periodStart, periodEnd })}>Create draft</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PolicyStep({ index, title, detail }: { index: string; title: string; detail: string }) {
  return <div className="flex items-start gap-3 rounded-md border border-line bg-sunken/60 p-3 text-[12.5px]"><span className="font-mono text-[11px] text-ink-3">{index}</span><span><span className="font-medium text-ink">{title}</span><span className="mt-0.5 block text-ink-3">{detail}</span></span></div>;
}

function LifecycleCard({ label, count, amount, detail, tone }: { label: string; count: number; amount: { amount: number; currency: string }; detail: string; tone?: "warning" | "success" }) {
  return <PlatformPanel className="p-4"><Stat label={label} value={<span className="flex items-baseline justify-between gap-3"><span>{count}</span><span className="text-[13px] font-medium tabular text-ink-2">{formatMoney(amount)}</span></span>} context={detail} tone={tone} /></PlatformPanel>;
}

function InvoiceTable({ invoices, focusedInvoiceId, issueInvoice, setAction }: { invoices: PlatformBillingInvoice[]; focusedInvoiceId?: string; issueInvoice: { isPending: boolean; variables?: string; mutate: (invoiceId: string) => void }; setAction: (action: InvoiceAction) => void }) {
  return (
    <Table className="min-w-[960px]">
      <TableHeader>
        <TableRow>
          <TableHead className="ps-4 sm:ps-5">Invoice</TableHead>
          <TableHead>Gym</TableHead>
          <TableHead>Issued</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Grace / period</TableHead>
          <TableHead className="text-end">Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="pe-4 text-end sm:pe-5">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} focused={focusedInvoiceId === invoice.id} issuing={issueInvoice.isPending && issueInvoice.variables === invoice.id} onIssue={() => issueInvoice.mutate(invoice.id)} onPastDue={() => setAction({ invoice, kind: "past_due" })} onPayment={() => setAction({ invoice, kind: "payment" })} onVoid={() => setAction({ invoice, kind: "void" })} />)}
      </TableBody>
    </Table>
  );
}

function InvoiceActionDialog({ action, onOpenChange, onPastDue, onPayment, onVoid, saving }: { action?: InvoiceAction; onOpenChange: (open: boolean) => void; onPastDue: (input: { invoiceId: string; reason: string }) => void; onPayment: (input: RecordPlatformInvoicePaymentInput) => void; onVoid: (input: { invoiceId: string; reason: string }) => void; saving: boolean }) {
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const key = action ? `${action.invoice.id}:${action.kind}` : "closed";
  const reactivating = action?.kind === "payment" && isAutomaticRenewal(action.invoice) && action.invoice.status === "past_due";
  const title = action?.kind === "payment" ? reactivating ? "Record bank payment & reactivate" : "Record an offline payment" : action?.kind === "past_due" ? "Mark invoice past due" : "Void invoice";
  const description = action?.kind === "payment" ? reactivating ? "Confirm a verified bank transfer or payment reference. This marks the renewal paid and reactivates the gym for its next period. RIVET does not charge a provider." : "Confirm money received outside RIVET with a bank transfer or receipt reference. No provider charge will be created." : action?.kind === "past_due" ? "This records an overdue ledger state and notifies the gym team. The automated subscription clock will suspend the gym after the two-day grace period if payment is not recorded." : "Voiding preserves the invoice and its immutable audit history.";
  const submitLabel = action?.kind === "payment" ? reactivating ? "Reactivate gym" : "Record payment" : action?.kind === "past_due" ? "Mark past due" : "Void invoice";
  return (
    <Dialog open={Boolean(action)} onOpenChange={onOpenChange}>
      <DialogContent key={key}>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <DialogBody className="grid gap-4">
          {action?.kind === "payment" ? <Field label="Payment reference" htmlFor="platform-invoice-reference"><Input id="platform-invoice-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Bank transfer or receipt reference" /></Field> : null}
          <Field label="Reason" htmlFor="platform-invoice-reason"><Textarea id="platform-invoice-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for the audit trail" /></Field>
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={saving} disabled={!action || !reason.trim() || (action.kind === "payment" && !reference.trim())} variant={action?.kind === "void" ? "danger" : "primary"} onClick={() => { if (!action) return; if (action.kind === "payment") onPayment({ invoiceId: action.invoice.id, reference: reference.trim(), reason: reason.trim() }); else if (action.kind === "past_due") onPastDue({ invoiceId: action.invoice.id, reason: reason.trim() }); else onVoid({ invoiceId: action.invoice.id, reason: reason.trim() }); }}>{submitLabel}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceRow({ invoice, focused, issuing, onIssue, onPastDue, onPayment, onVoid }: { invoice: PlatformBillingInvoice; focused: boolean; issuing: boolean; onIssue: () => void; onPastDue: () => void; onPayment: () => void; onVoid: () => void }) {
  const amount = invoice.amountMinor !== undefined ? formatMoney({ amount: invoice.amountMinor, currency: invoice.currency ?? "JOD" }) : invoice.amount;
  const outstanding = ["open", "past_due", "failed"].includes(invoice.status);
  const canVoid = !["paid", "void"].includes(invoice.status);
  const renewal = isAutomaticRenewal(invoice);
  const paymentLabel = invoice.status === "past_due" && renewal ? "Reactivate" : "Record payment";
  const graceEnd = renewal ? graceEndAt(invoice) : undefined;
  return (
    <TableRow id={`platform-invoice-${invoice.id}`} className={cn(focused && "bg-sunken/60")}>
      <TableCell className="ps-4 sm:ps-5"><span className="block font-mono text-[12px]" dir="ltr">{invoice.id}</span><Badge variant={renewal ? "neutral" : "outline"} className="mt-1">{isSubscriptionChange(invoice) ? "Subscription change" : renewal ? "Automatic renewal" : "Manual exception"}</Badge></TableCell>
      <TableCell className="text-[13px] font-medium">{invoice.gym}</TableCell>
      <TableCell className="whitespace-nowrap text-[12.5px] text-ink-2">{displayDate(invoice.issuedAt ?? invoice.date)}</TableCell>
      <TableCell className="whitespace-nowrap text-[12.5px] text-ink-2">{displayDate(invoice.dueAt)}</TableCell>
      <TableCell className="text-[12.5px] text-ink-2">{invoice.status === "past_due" && renewal ? <><span className="block font-medium text-danger">Grace ends {displayDate(graceEnd)}</span><span className="mt-0.5 block text-ink-3">Due + {SUSPENSION_AFTER_DUE_DAYS} days</span></> : invoice.periodEnd ? <><span className="block">Period ends {displayDate(invoice.periodEnd)}</span><span className="mt-0.5 block text-ink-3">{formatInterval(invoice.billingInterval)}</span></> : "Not recorded"}</TableCell>
      <TableCell className="text-end text-[13px] font-semibold tabular">{amount}</TableCell>
      <TableCell><InvoiceStatusBadge status={invoice.status} renewal={renewal} /></TableCell>
      <TableCell className="pe-4 sm:pe-5"><div className="flex flex-wrap justify-end gap-1">
        <Button size="sm" variant="secondary" onClick={() => openInvoicePdf(invoice, { name: invoice.gym })} aria-label={`View invoice ${invoice.id} as PDF`} data-testid="view-invoice-pdf"><FileText /> PDF</Button>
        {invoice.status === "draft" ? <Button size="sm" loading={issuing} onClick={onIssue}><Send /> Issue</Button> : null}
        {invoice.status === "open" && (!renewal || isSubscriptionChange(invoice)) ? <Button size="sm" variant="secondary" onClick={onPastDue}><CircleAlert /> Past due</Button> : null}
        {outstanding ? <Button size="sm" onClick={onPayment}><CheckCircle2 /> {paymentLabel}</Button> : null}
        {canVoid ? <Button size="sm" variant="secondary" onClick={onVoid}><Ban /> Void</Button> : null}
      </div></TableCell>
    </TableRow>
  );
}

function isAutomaticRenewal(invoice: PlatformBillingInvoice): boolean {
  return Boolean(invoice.cycleKey?.trim());
}

/** Term invoices issued by an admin subscription change, not the renewal clock. */
function isSubscriptionChange(invoice: PlatformBillingInvoice): boolean {
  return Boolean(invoice.cycleKey?.startsWith("change:"));
}

/** The day access may be suspended: the window the signed agreement allows. */
function graceEndAt(invoice: PlatformBillingInvoice): string | undefined {
  if (!invoice.dueAt) return undefined;
  const dueAt = Date.parse(invoice.dueAt);
  return Number.isFinite(dueAt) ? new Date(dueAt + SUSPENSION_AFTER_DUE_DAYS * 86_400_000).toISOString() : undefined;
}

function formatInterval(interval?: PlatformBillingInvoice["billingInterval"]): string {
  return interval === "annual" ? "Annual renewal" : interval === "monthly" ? "Monthly renewal" : "Renewal cadence not recorded";
}

function displayDate(value?: string) {
  if (!value) return "Not recorded";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-JO", { dateStyle: "medium" }).format(timestamp) : value;
}

function invoiceAmountMinor(invoice: PlatformBillingInvoice): number {
  if (Number.isSafeInteger(invoice.amountMinor) && (invoice.amountMinor ?? 0) >= 0) return invoice.amountMinor ?? 0;
  const parsed = Number(invoice.amount.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 10 ** exponentFor(invoice.currency ?? "JOD")) : 0;
}

function parsePositiveMinorAmount(raw: string, currency: string): { amountMinor?: number; error?: string } {
  const value = raw.trim();
  if (!value) return { error: "Enter an amount." };
  if (/[eE]/.test(value)) return { error: "Use a decimal amount, not scientific notation." };
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return { error: "Enter a valid positive decimal amount." };
  const numeric = Number(value);
  const amountMinor = Math.round(numeric * 10 ** exponentFor(currency));
  if (!Number.isFinite(numeric) || !Number.isSafeInteger(amountMinor)) return { error: "Amount is too large for a safe ledger value." };
  if (amountMinor <= 0) return { error: "Amount must be greater than zero at the currency's minor-unit precision." };
  return { amountMinor };
}

function downloadInvoices(invoices: PlatformBillingInvoice[]) {
  const timeZone = "Asia/Amman";
  downloadTextFile({
    fileName: "rivet-platform-invoices.csv",
    mimeType: "text/csv;charset=utf-8",
    content: buildCsvDocument({
      title: "RIVET platform invoice ledger",
      metadata: [{ label: "Timezone", value: timeZone }],
      headers: ["Invoice ID", "Gym", "Invoice type", "Billing interval", "Service period starts", "Service period ends", "Issued", "Due", "Grace period ends", "Amount", "Currency", "Status", "Marked past due", "Payment reference", "Paid", "Voided", "Cycle key"],
      rows: invoices.map((invoice) => [
        invoice.id,
        invoice.gym,
        isSubscriptionChange(invoice) ? "Subscription change" : isAutomaticRenewal(invoice) ? "Automatic renewal" : "Manual exception",
        exportStatusLabel(invoice.billingInterval),
        invoice.periodStart,
        invoice.periodEnd,
        formatExportDateTime(invoice.issuedAt ?? invoice.date, timeZone),
        formatExportDateTime(invoice.dueAt, timeZone),
        formatExportDateTime(graceEndAt(invoice), timeZone),
        invoice.amountMinor === undefined ? invoice.amount : formatMinorUnits(invoice.amountMinor, invoice.currency),
        invoice.currency,
        exportStatusLabel(invoice.status),
        formatExportDateTime(invoice.pastDueAt, timeZone),
        invoice.paymentReference,
        formatExportDateTime(invoice.paidAt, timeZone),
        formatExportDateTime(invoice.voidedAt, timeZone),
        invoice.cycleKey,
      ]),
    }),
  });
}
