"use client";

import { useState } from "react";
import { ArrowDownToLine, Ban, CheckCircle2, CircleAlert, CreditCard, FilePlus2, Landmark, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import type { CreatePlatformInvoiceInput, PlatformBillingInvoice, RecordPlatformInvoicePaymentInput } from "@/lib/api/GymOSApi";
import { useApiMutation } from "@/lib/hooks/use-api";
import { useExperience } from "@/lib/providers/experience-provider";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";

type InvoiceAction = { invoice: PlatformBillingInvoice; kind: "payment" | "past_due" | "void" };

export default function BillingPage() {
  const { platformSnapshot } = useExperience();
  const invoices = platformSnapshot?.invoices ?? [];
  const overview = platformSnapshot?.overview;
  const [createOpen, setCreateOpen] = useState(false);
  const [action, setAction] = useState<InvoiceAction>();

  const issueInvoice = useApiMutation((api, invoiceId: string) => api.issuePlatformInvoice(invoiceId), { successMessage: "Invoice issued." });
  const recordPayment = useApiMutation((api, input: RecordPlatformInvoicePaymentInput) => api.recordPlatformInvoicePayment(input), {
    successMessage: "Manual payment recorded.",
    onSuccess: () => setAction(undefined),
  });
  const markPastDue = useApiMutation((api, input: { invoiceId: string; reason: string }) => api.markPlatformInvoicePastDue(input.invoiceId, input.reason), {
    successMessage: "Invoice marked past due.",
    onSuccess: () => setAction(undefined),
  });
  const voidInvoice = useApiMutation((api, input: { invoiceId: string; reason: string }) => api.voidPlatformInvoice(input.invoiceId, input.reason), {
    successMessage: "Invoice voided.",
    onSuccess: () => setAction(undefined),
  });

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-[1480px]">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="eyebrow">Payments control</p><h1 className="mt-2 text-[30px] font-semibold tracking-tight">Billing & invoices</h1><p className="mt-2 text-[12.5px] text-ink-2">A ledger of persisted RIVET subscription invoices and manually recorded collections.</p></div>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => downloadInvoices(invoices)} disabled={invoices.length === 0}><ArrowDownToLine /> Export ledger</Button><Button onClick={() => setCreateOpen(true)}><FilePlus2 /> New invoice</Button></div>
        </div>

        <section className="mt-7 grid gap-3 sm:grid-cols-3">
          <Card icon={<CreditCard />} label="Collected" value={overview ? formatMoney(overview.invoiceTotals.collected) : "—"} detail="Paid invoice records" />
          <Card icon={<CircleAlert />} label="Outstanding" value={overview ? formatMoney(overview.invoiceTotals.outstanding) : "—"} detail="Open and past-due invoices" warning={Boolean(overview?.invoiceTotals.outstanding.amount)} />
          <Card icon={<Landmark />} label="External billing provider" value="Not configured" detail="No automatic card charge or payout is claimed" />
        </section>

        {overview?.invoiceTotals.overdue.amount ? (
          <section className="mt-5 flex items-start gap-3 border border-danger/30 bg-danger-bg p-5">
            <CircleAlert className="mt-0.5 size-5 text-danger" />
            <div><h2 className="text-[13px] font-semibold">Past-due invoices require manual review</h2><p className="mt-1 text-[10.5px] text-ink-2">{formatMoney(overview.invoiceTotals.overdue)} is marked overdue in the platform ledger. No automated retry has been attempted.</p></div>
          </section>
        ) : null}

        <section className="mt-5 overflow-x-auto border border-line bg-surface">
          <div className="border-b border-line px-5 py-4"><p className="eyebrow">Invoice ledger</p><h2 className="mt-1 text-[17px] font-semibold">Persisted invoices</h2></div>
          {invoices.length === 0 ? <p className="px-5 py-10 text-center text-[12px] text-ink-3">No platform invoices have been created.</p> : (
            <table className="w-full min-w-[880px]">
              <thead><tr className="border-b border-line bg-sunken font-mono text-[8px] uppercase tracking-[.1em] text-ink-3"><th className="px-5 py-3 text-start font-medium">Invoice</th><th className="px-4 py-3 text-start font-medium">Gym</th><th className="px-4 py-3 text-start font-medium">Issued</th><th className="px-4 py-3 text-start font-medium">Due</th><th className="px-4 py-3 text-end font-medium">Amount</th><th className="px-4 py-3 text-start font-medium">Status</th><th className="px-5 py-3 text-end font-medium">Actions</th></tr></thead>
              <tbody>{invoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} issuing={issueInvoice.isPending && issueInvoice.variables === invoice.id} onIssue={() => issueInvoice.mutate(invoice.id)} onPastDue={() => setAction({ invoice, kind: "past_due" })} onPayment={() => setAction({ invoice, kind: "payment" })} onVoid={() => setAction({ invoice, kind: "void" })} />)}</tbody>
            </table>
          )}
        </section>
      </div>

      <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} gyms={platformSnapshot?.gyms ?? []} />
      <InvoiceActionDialog action={action} onOpenChange={(open) => { if (!open) setAction(undefined); }} onPastDue={(input) => markPastDue.mutate(input)} onPayment={(input) => recordPayment.mutate(input)} onVoid={(input) => voidInvoice.mutate(input)} saving={markPastDue.isPending || recordPayment.isPending || voidInvoice.isPending} />
    </div>
  );
}

function CreateInvoiceDialog({ open, onOpenChange, gyms }: { open: boolean; onOpenChange: (open: boolean) => void; gyms: Array<{ id: string; name: string }> }) {
  const [gymId, setGymId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const create = useApiMutation((api, input: CreatePlatformInvoiceInput) => api.createPlatformInvoice(input), {
    successMessage: "Draft invoice created.",
    onSuccess: () => {
      setGymId(""); setAmount(""); setDueAt(""); setPeriodStart(""); setPeriodEnd(""); onOpenChange(false);
    },
  });
  const valid = Boolean(gymId && Number(amount) > 0 && dueAt && periodStart && periodEnd);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Create a platform invoice</DialogTitle><DialogDescription>This creates a draft in the manual ledger. It does not charge a card or contact the gym.</DialogDescription></DialogHeader><DialogBody className="grid gap-4"><Field label="Gym"><select className="h-9 w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px]" value={gymId} onChange={(event) => setGymId(event.target.value)}><option value="">Choose a provisioned gym</option>{gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}</select></Field><Field label="Amount (JOD)"><Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="149.000" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Period start"><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></Field><Field label="Period end"><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></Field></div><Field label="Due date"><Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></Field></DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate({ gymId, amountMinor: Math.round(Number(amount) * 1_000), currency: "JOD", dueAt, periodStart, periodEnd })}>Create draft</Button></DialogFooter></DialogContent></Dialog>;
}

function InvoiceActionDialog({ action, onOpenChange, onPastDue, onPayment, onVoid, saving }: { action?: InvoiceAction; onOpenChange: (open: boolean) => void; onPastDue: (input: { invoiceId: string; reason: string }) => void; onPayment: (input: RecordPlatformInvoicePaymentInput) => void; onVoid: (input: { invoiceId: string; reason: string }) => void; saving: boolean }) {
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const key = action ? `${action.invoice.id}:${action.kind}` : "closed";
  const title = action?.kind === "payment" ? "Record an offline payment" : action?.kind === "past_due" ? "Mark invoice past due" : "Void invoice";
  const description = action?.kind === "payment" ? "Confirm money received outside RIVET. No provider charge will be created." : action?.kind === "past_due" ? "This records an overdue ledger state and notifies the gym team. No automatic retry will run." : "Voiding preserves the invoice and its immutable audit history.";
  const submitLabel = action?.kind === "payment" ? "Record payment" : action?.kind === "past_due" ? "Mark past due" : "Void invoice";
  return <Dialog open={Boolean(action)} onOpenChange={onOpenChange}><DialogContent key={key}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><DialogBody className="grid gap-4">{action?.kind === "payment" ? <Field label="Payment reference"><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Bank transfer or receipt reference" /></Field> : null}<Field label="Reason"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for the audit trail" /></Field></DialogBody><DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={saving} disabled={!action || !reason.trim() || (action.kind === "payment" && !reference.trim())} variant={action?.kind === "void" ? "danger" : "primary"} onClick={() => { if (!action) return; if (action.kind === "payment") onPayment({ invoiceId: action.invoice.id, reference: reference.trim(), reason: reason.trim() }); else if (action.kind === "past_due") onPastDue({ invoiceId: action.invoice.id, reason: reason.trim() }); else onVoid({ invoiceId: action.invoice.id, reason: reason.trim() }); }}>{submitLabel}</Button></DialogFooter></DialogContent></Dialog>;
}

function InvoiceRow({ invoice, issuing, onIssue, onPastDue, onPayment, onVoid }: { invoice: PlatformBillingInvoice; issuing: boolean; onIssue: () => void; onPastDue: () => void; onPayment: () => void; onVoid: () => void }) {
  const amount = invoice.amountMinor !== undefined ? formatMoney({ amount: invoice.amountMinor, currency: invoice.currency ?? "JOD" }) : invoice.amount;
  const outstanding = ["open", "past_due", "failed"].includes(invoice.status);
  const canVoid = !["paid", "void"].includes(invoice.status);
  return <tr className="border-b border-line last:border-b-0"><td className="px-5 py-4 font-mono text-[10px]">{invoice.id}</td><td className="px-4 py-4 text-[12px] font-medium">{invoice.gym}</td><td className="px-4 py-4 text-[10.5px] text-ink-3">{displayDate(invoice.issuedAt ?? invoice.date)}</td><td className="px-4 py-4 text-[10.5px] text-ink-3">{displayDate(invoice.dueAt)}</td><td className="px-4 py-4 text-end text-[11.5px] font-semibold">{amount}</td><td className="px-4 py-4"><Status status={invoice.status} /></td><td className="px-5 py-4"><div className="flex justify-end gap-1">{invoice.status === "draft" ? <Button size="sm" loading={issuing} onClick={onIssue}><Send /> Issue</Button> : null}{invoice.status === "open" ? <Button size="sm" variant="secondary" onClick={onPastDue}><CircleAlert /> Past due</Button> : null}{outstanding ? <Button size="sm" onClick={onPayment}><CheckCircle2 /> Paid</Button> : null}{canVoid ? <Button size="sm" variant="secondary" onClick={onVoid}><Ban /> Void</Button> : null}</div></td></tr>;
}

function Status({ status }: { status: PlatformBillingInvoice["status"] }) {
  return <span className={cn("rounded-full px-2 py-1 font-mono text-[7.5px] uppercase", status === "paid" ? "bg-success-bg text-success" : ["failed", "past_due"].includes(status) ? "bg-danger-bg text-danger" : status === "void" ? "bg-sunken text-ink-3" : "bg-info-bg text-info")}>{status.replace("_", " ")}</span>;
}

function displayDate(value?: string) {
  if (!value) return "Not recorded";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("en-JO", { dateStyle: "medium" }).format(timestamp) : value;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="grid gap-1.5 text-[11px] font-medium text-ink-2"><span>{label}</span>{children}</label>; }

function Card({ icon, label, value, detail, warning = false }: { icon: React.ReactNode; label: string; value: string; detail: string; warning?: boolean }) {
  return <div className="border border-line bg-surface p-5"><span className={warning ? "text-warning [&_svg]:size-4" : "text-ink-3 [&_svg]:size-4"}>{icon}</span><p className="mt-6 font-mono text-[8px] uppercase tracking-[.1em] text-ink-3">{label}</p><p className={warning ? "mt-2 text-[25px] font-semibold text-warning" : "mt-2 text-[25px] font-semibold"}>{value}</p><p className="mt-1 text-[10px] text-ink-3">{detail}</p></div>;
}

function downloadInvoices(invoices: PlatformBillingInvoice[]) {
  const csv = [["Invoice", "Gym", "Period start", "Period end", "Issued", "Due", "Amount minor", "Currency", "Status", "Marked past due", "Payment reference", "Paid", "Voided"], ...invoices.map((invoice) => [invoice.id, invoice.gym, invoice.periodStart ?? "", invoice.periodEnd ?? "", invoice.issuedAt ?? invoice.date, invoice.dueAt ?? "", invoice.amountMinor ?? invoice.amount, invoice.currency ?? "", invoice.status, invoice.pastDueAt ?? "", invoice.paymentReference ?? "", invoice.paidAt ?? "", invoice.voidedAt ?? ""])]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "rivet-platform-invoices.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
