"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDownToLine, Ban, CalendarClock, CheckCircle2, CircleAlert, CreditCard, FilePlus2, Landmark, Receipt, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BillGymWizard } from "./bill-gym-wizard";
import { GymSubscriptions } from "./gym-subscriptions";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import type { CreatePlatformInvoiceInput, PlatformBillingInvoice, RecordPlatformInvoicePaymentInput } from "@/lib/api/GymOSApi";
import { useApiMutation } from "@/lib/hooks/use-api";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { exponentFor, formatMoney } from "@/lib/utils/money";

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
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1480px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="eyebrow">Payments control</p><h1 className="mt-2 text-[30px] font-semibold tracking-tight">Billing & invoices</h1><p className="mt-2 text-[12.5px] text-ink-2">Subscriptions, invoices, and collections in one place.</p></div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPolicyOpen(true)}><CalendarClock /> Renewal policy</Button>
            <Button variant="secondary" onClick={() => downloadInvoices(invoices)} disabled={invoices.length === 0}><ArrowDownToLine /> Export ledger</Button>
            <Button variant="signal" onClick={() => { setBillWizardGymId(undefined); setBillWizardOpen(true); }} disabled={!platformSnapshot}><Receipt /> Bill a gym</Button>
          </div>
        </div>

        <BillGymWizard open={billWizardOpen} onOpenChange={(open) => { setBillWizardOpen(open); if (!open) setBillWizardGymId(undefined); }} gyms={platformSnapshot?.gyms ?? []} plans={platformSnapshot?.plans ?? []} initialGymId={billWizardGymId} />

        <GymSubscriptions gyms={platformSnapshot?.gyms ?? []} onBill={(gymId) => { setBillWizardGymId(gymId); setBillWizardOpen(true); }} />

        <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>How renewals work</DialogTitle>
              <DialogDescription>The subscription clock runs on its own; you only confirm payments.</DialogDescription>
            </DialogHeader>
            <DialogBody className="grid gap-2">
              <PolicyStep index="01" title="Invoice issued" detail="Three days before the term ends" />
              <PolicyStep index="02" title="Due" detail="On the day the term ends" />
              <PolicyStep index="03" title="Two-day grace" detail="Time to confirm a bank transfer" />
              <PolicyStep index="04" title="Suspension" detail="Unpaid after grace closes access" />
              <p className="mt-2 text-[11px] leading-relaxed text-ink-3">Record the payment reference on an invoice to mark it paid and reactivate the gym. RIVET never charges cards automatically.</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setPolicyOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <section className="mt-7 grid gap-3 sm:grid-cols-3">
          <Card icon={<CreditCard />} label="Collected" value={platformSnapshot ? formatMoney(invoiceTotals.collected) : "—"} detail="Paid invoice records" />
          <Card icon={<CircleAlert />} label="Outstanding" value={platformSnapshot ? formatMoney(invoiceTotals.outstanding) : "—"} detail="Open and past-due invoices" warning={Boolean(invoiceTotals.outstanding.amount)} />
          <Card icon={<Landmark />} label="Automatic charging" value="Not configured" detail="Bank/reference payment confirmation only" />
        </section>

        <section className="mt-5" aria-labelledby="renewal-summary-heading">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Automatic renewals</p><h2 id="renewal-summary-heading" className="mt-1 text-[17px] font-semibold">Subscription invoice states</h2></div><p className="text-[10.5px] text-ink-3">From the renewal clock and subscription changes.</p></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <LifecycleCard label="Upcoming / open" count={renewalSummary.upcoming.length} amount={renewalSummary.amountFor(renewalSummary.upcoming)} detail="Issued T−3 and due at term end" />
            <LifecycleCard label="In grace / past due" count={renewalSummary.inGrace.length} amount={renewalSummary.amountFor(renewalSummary.inGrace)} detail="Grace ends two days after due" warning={renewalSummary.inGrace.length > 0} />
            <LifecycleCard label="Paid renewals" count={renewalSummary.paid.length} amount={renewalSummary.amountFor(renewalSummary.paid)} detail="Payment reference recorded" success={renewalSummary.paid.length > 0} />
          </div>
        </section>

        {invoiceTotals.overdue.amount ? (
          <section className="mt-5 flex items-start gap-3 border border-danger/30 bg-danger-bg p-5">
            <CircleAlert className="mt-0.5 size-5 text-danger" />
            <div><h2 className="text-[13px] font-semibold">Past-due invoices require manual review</h2><p className="mt-1 text-[10.5px] text-ink-2">{formatMoney(invoiceTotals.overdue)} is marked overdue in the platform ledger. No automated retry has been attempted.</p></div>
          </section>
        ) : null}

        <section className="mt-5 border border-line bg-surface">
          <div className="border-b border-line px-5 py-4"><p className="eyebrow">Invoice ledger</p><h2 className="mt-1 text-[17px] font-semibold">Subscription invoices</h2><p className="mt-1 text-[10.5px] text-ink-3">Renewals and change invoices, newest workflow first.</p></div>
          {!platformSnapshot ? <p className="px-5 py-10 text-center text-[12px] text-ink-3" role="status">Loading the persisted invoice ledger…</p> : automatedInvoices.length === 0 ? <p className="px-5 py-10 text-center text-[12px] text-ink-3">No subscription invoices are currently recorded.</p> : <InvoiceTable invoices={automatedInvoices} focusedInvoiceId={focusedInvoiceId} issueInvoice={issueInvoice} setAction={setAction} />}
        </section>

        {platformSnapshot && manualInvoices.length ? <details className="mt-4 border border-line bg-surface" open={manualInvoices.some((invoice) => invoice.id === focusedInvoiceId)}>
          <summary className="cursor-pointer list-none px-5 py-4 text-[12px] font-medium marker:hidden"><span className="eyebrow">Exception workflow</span><span className="mt-1 block text-[15px] font-semibold">Manual invoices <span className="font-mono text-[10px] text-ink-3">({manualInvoices.length})</span></span><span className="mt-1 block text-[10.5px] text-ink-3">One-off charges outside the renewal clock.</span></summary>
          <div className="border-t border-line"><InvoiceTable invoices={manualInvoices} focusedInvoiceId={focusedInvoiceId} issueInvoice={issueInvoice} setAction={setAction} /></div>
        </details> : null}

        {platformSnapshot ? <section className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-dashed border-line-2 bg-sunken px-5 py-4" aria-label="Manual invoice exception workflow"><div><p className="text-[11.5px] font-semibold">Need a one-off ledger exception?</p><p className="mt-1 text-[10.5px] text-ink-3">Create a manual invoice only when a charge is outside the automated subscription cycle.</p></div><Button variant="secondary" onClick={() => setCreateOpen(true)}><FilePlus2 /> Create exception invoice</Button></section> : null}
      </div>

      <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} gyms={platformSnapshot?.gyms ?? []} onCreated={replaceInvoice} />
      <InvoiceActionDialog action={action} onOpenChange={(open) => { if (!open) setAction(undefined); }} onPastDue={(input) => markPastDue.mutate(input)} onPayment={(input) => recordPayment.mutate(input)} onVoid={(input) => voidInvoice.mutate(input)} saving={markPastDue.isPending || recordPayment.isPending || voidInvoice.isPending} />
    </div>
  );
}

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
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Create a platform invoice</DialogTitle><DialogDescription>This creates a draft in the manual ledger. It does not charge a card or contact the gym.</DialogDescription></DialogHeader><DialogBody className="grid gap-4"><Field label="Gym"><select className="h-9 w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px]" value={gymId} onChange={(event) => setGymId(event.target.value)}><option value="">Choose a provisioned gym</option>{gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}</select></Field><Field label="Amount (JOD)"><Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="149.000" aria-invalid={Boolean(amountError)} aria-describedby={amountError ? "platform-invoice-amount-error" : undefined} />{amountError ? <span id="platform-invoice-amount-error" className="text-[10.5px] font-normal text-danger" role="alert">{amountError}</span> : null}</Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Period start"><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></Field><Field label="Period end"><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></Field></div>{!validPeriod ? <p className="-mt-2 text-[10.5px] text-danger" role="alert">Period end must be on or after the period start.</p> : null}<Field label="Due date"><Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></Field></DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate({ gymId, amountMinor: parsedAmount.amountMinor ?? 0, currency: "JOD", dueAt, periodStart, periodEnd })}>Create draft</Button></DialogFooter></DialogContent></Dialog>;
}

function PolicyStep({ index, title, detail }: { index: string; title: string; detail: string }) {
  return <div className="flex items-start gap-2 border border-line bg-sunken p-3"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-signal" /><span><span className="font-mono text-[8px] text-ink-3">{index}</span><span className="ml-2 font-medium">{title}</span><span className="mt-1 block text-ink-3">{detail}</span></span></div>;
}

function LifecycleCard({ label, count, amount, detail, warning = false, success = false }: { label: string; count: number; amount: { amount: number; currency: string }; detail: string; warning?: boolean; success?: boolean }) {
  const valueClass = warning ? "text-warning" : success ? "text-success" : "";
  return <div className="border border-line bg-surface p-5"><p className="font-mono text-[8px] uppercase tracking-[.1em] text-ink-3">{label}</p><div className="mt-2 flex items-baseline justify-between gap-3"><p className={cn("text-[25px] font-semibold", valueClass)}>{count}</p><p className="text-[11.5px] font-medium">{formatMoney(amount)}</p></div><p className="mt-1 text-[10px] text-ink-3">{detail}</p></div>;
}

function InvoiceTable({ invoices, focusedInvoiceId, issueInvoice, setAction }: { invoices: PlatformBillingInvoice[]; focusedInvoiceId?: string; issueInvoice: { isPending: boolean; variables?: string; mutate: (invoiceId: string) => void }; setAction: (action: InvoiceAction) => void }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[980px]"><thead><tr className="border-b border-line bg-sunken font-mono text-[8px] uppercase tracking-[.1em] text-ink-3"><th className="px-5 py-3 text-start font-medium">Invoice</th><th className="px-4 py-3 text-start font-medium">Gym</th><th className="px-4 py-3 text-start font-medium">Issued</th><th className="px-4 py-3 text-start font-medium">Due</th><th className="px-4 py-3 text-start font-medium">Grace / period</th><th className="px-4 py-3 text-end font-medium">Amount</th><th className="px-4 py-3 text-start font-medium">Status</th><th className="px-5 py-3 text-end font-medium">Actions</th></tr></thead><tbody>{invoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} focused={focusedInvoiceId === invoice.id} issuing={issueInvoice.isPending && issueInvoice.variables === invoice.id} onIssue={() => issueInvoice.mutate(invoice.id)} onPastDue={() => setAction({ invoice, kind: "past_due" })} onPayment={() => setAction({ invoice, kind: "payment" })} onVoid={() => setAction({ invoice, kind: "void" })} />)}</tbody></table></div>;
}

function InvoiceActionDialog({ action, onOpenChange, onPastDue, onPayment, onVoid, saving }: { action?: InvoiceAction; onOpenChange: (open: boolean) => void; onPastDue: (input: { invoiceId: string; reason: string }) => void; onPayment: (input: RecordPlatformInvoicePaymentInput) => void; onVoid: (input: { invoiceId: string; reason: string }) => void; saving: boolean }) {
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const key = action ? `${action.invoice.id}:${action.kind}` : "closed";
  const reactivating = action?.kind === "payment" && isAutomaticRenewal(action.invoice) && action.invoice.status === "past_due";
  const title = action?.kind === "payment" ? reactivating ? "Record bank payment & reactivate" : "Record an offline payment" : action?.kind === "past_due" ? "Mark invoice past due" : "Void invoice";
  const description = action?.kind === "payment" ? reactivating ? "Confirm a verified bank transfer or payment reference. This marks the renewal paid and reactivates the gym for its next period. RIVET does not charge a provider." : "Confirm money received outside RIVET with a bank transfer or receipt reference. No provider charge will be created." : action?.kind === "past_due" ? "This records an overdue ledger state and notifies the gym team. The automated subscription clock will suspend the gym after the two-day grace period if payment is not recorded." : "Voiding preserves the invoice and its immutable audit history.";
  const submitLabel = action?.kind === "payment" ? reactivating ? "Reactivate gym" : "Record payment" : action?.kind === "past_due" ? "Mark past due" : "Void invoice";
  return <Dialog open={Boolean(action)} onOpenChange={onOpenChange}><DialogContent key={key}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><DialogBody className="grid gap-4">{action?.kind === "payment" ? <Field label="Payment reference"><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Bank transfer or receipt reference" /></Field> : null}<Field label="Reason"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for the audit trail" /></Field></DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={saving} disabled={!action || !reason.trim() || (action.kind === "payment" && !reference.trim())} variant={action?.kind === "void" ? "danger" : "primary"} onClick={() => { if (!action) return; if (action.kind === "payment") onPayment({ invoiceId: action.invoice.id, reference: reference.trim(), reason: reason.trim() }); else if (action.kind === "past_due") onPastDue({ invoiceId: action.invoice.id, reason: reason.trim() }); else onVoid({ invoiceId: action.invoice.id, reason: reason.trim() }); }}>{submitLabel}</Button></DialogFooter></DialogContent></Dialog>;
}

function InvoiceRow({ invoice, focused, issuing, onIssue, onPastDue, onPayment, onVoid }: { invoice: PlatformBillingInvoice; focused: boolean; issuing: boolean; onIssue: () => void; onPastDue: () => void; onPayment: () => void; onVoid: () => void }) {
  const amount = invoice.amountMinor !== undefined ? formatMoney({ amount: invoice.amountMinor, currency: invoice.currency ?? "JOD" }) : invoice.amount;
  const outstanding = ["open", "past_due", "failed"].includes(invoice.status);
  const canVoid = !["paid", "void"].includes(invoice.status);
  const paymentLabel = invoice.status === "past_due" && isAutomaticRenewal(invoice) ? "Reactivate" : "Record payment";
  const graceEnd = isAutomaticRenewal(invoice) ? graceEndAt(invoice) : undefined;
  return <tr id={`platform-invoice-${invoice.id}`} className={cn("border-b border-line last:border-b-0", focused && "bg-info-bg/50")}><td className="px-5 py-4"><div className="font-mono text-[10px]">{invoice.id}</div>{isAutomaticRenewal(invoice) ? <span className="mt-1 inline-flex rounded-full bg-signal-bg px-2 py-1 font-mono text-[7.5px] uppercase tracking-[.04em] text-signal">{isSubscriptionChange(invoice) ? "Subscription change" : "Automatic renewal"}</span> : <span className="mt-1 inline-flex rounded-full bg-sunken px-2 py-1 font-mono text-[7.5px] uppercase tracking-[.04em] text-ink-3">Manual exception</span>}</td><td className="px-4 py-4 text-[12px] font-medium">{invoice.gym}</td><td className="px-4 py-4 text-[10.5px] text-ink-3">{displayDate(invoice.issuedAt ?? invoice.date)}</td><td className="px-4 py-4 text-[10.5px] text-ink-3">{displayDate(invoice.dueAt)}</td><td className="px-4 py-4 text-[10.5px] text-ink-3">{invoice.status === "past_due" && isAutomaticRenewal(invoice) ? <><span className="block font-medium text-danger">Grace ends {displayDate(graceEnd)}</span><span className="mt-1 block">Due + 2 days</span></> : invoice.periodEnd ? <><span className="block">Period ends {displayDate(invoice.periodEnd)}</span><span className="mt-1 block">{formatInterval(invoice.billingInterval)}</span></> : "Not recorded"}</td><td className="px-4 py-4 text-end text-[11.5px] font-semibold">{amount}</td><td className="px-4 py-4"><Status invoice={invoice} /></td><td className="px-5 py-4"><div className="flex justify-end gap-1">{invoice.status === "draft" ? <Button size="sm" loading={issuing} onClick={onIssue}><Send /> Issue</Button> : null}{invoice.status === "open" && !isAutomaticRenewal(invoice) ? <Button size="sm" variant="secondary" onClick={onPastDue}><CircleAlert /> Past due</Button> : null}{outstanding ? <Button size="sm" onClick={onPayment}><CheckCircle2 /> {paymentLabel}</Button> : null}{canVoid ? <Button size="sm" variant="secondary" onClick={onVoid}><Ban /> Void</Button> : null}</div></td></tr>;
}

function Status({ invoice }: { invoice: PlatformBillingInvoice }) {
  const label = isAutomaticRenewal(invoice) ? invoice.status === "open" ? "Upcoming" : invoice.status === "past_due" ? "In grace" : invoice.status === "paid" ? "Paid" : invoice.status.replace("_", " ") : invoice.status.replace("_", " ");
  const status = invoice.status;
  return <span className={cn("rounded-full px-2 py-1 font-mono text-[7.5px] uppercase", status === "paid" ? "bg-success-bg text-success" : ["failed", "past_due"].includes(status) ? "bg-danger-bg text-danger" : status === "void" ? "bg-sunken text-ink-3" : "bg-info-bg text-info")}>{label}</span>;
}

function isAutomaticRenewal(invoice: PlatformBillingInvoice): boolean {
  return Boolean(invoice.cycleKey?.trim());
}

/** Term invoices issued by an admin subscription change, not the renewal clock. */
function isSubscriptionChange(invoice: PlatformBillingInvoice): boolean {
  return Boolean(invoice.cycleKey?.startsWith("change:"));
}

function graceEndAt(invoice: PlatformBillingInvoice): string | undefined {
  if (!invoice.dueAt) return undefined;
  const dueAt = Date.parse(invoice.dueAt);
  return Number.isFinite(dueAt) ? new Date(dueAt + 2 * 86_400_000).toISOString() : undefined;
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

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-[11px] font-medium text-ink-2"><span>{label}</span>{children}</label>; }

function Card({ icon, label, value, detail, warning = false }: { icon: React.ReactNode; label: string; value: string; detail: string; warning?: boolean }) {
  return <div className="border border-line bg-surface p-5"><span className={warning ? "text-warning [&_svg]:size-4" : "text-ink-3 [&_svg]:size-4"}>{icon}</span><p className="mt-6 font-mono text-[8px] uppercase tracking-[.1em] text-ink-3">{label}</p><p className={warning ? "mt-2 text-[25px] font-semibold text-warning" : "mt-2 text-[25px] font-semibold"}>{value}</p><p className="mt-1 text-[10px] text-ink-3">{detail}</p></div>;
}

function downloadInvoices(invoices: PlatformBillingInvoice[]) {
  const csv = [["Invoice", "Gym", "Invoice type", "Cycle key", "Billing interval", "Period start", "Period end", "Issued", "Due", "Grace ends", "Amount minor", "Currency", "Status", "Marked past due", "Payment reference", "Paid", "Voided"], ...invoices.map((invoice) => [invoice.id, invoice.gym, isSubscriptionChange(invoice) ? "subscription change" : isAutomaticRenewal(invoice) ? "automatic renewal" : "manual exception", invoice.cycleKey ?? "", invoice.billingInterval ?? "", invoice.periodStart ?? "", invoice.periodEnd ?? "", invoice.issuedAt ?? invoice.date, invoice.dueAt ?? "", graceEndAt(invoice) ?? "", invoice.amountMinor ?? invoice.amount, invoice.currency ?? "", invoice.status, invoice.pastDueAt ?? "", invoice.paymentReference ?? "", invoice.paidAt ?? "", invoice.voidedAt ?? ""])]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "rivet-platform-invoices.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
