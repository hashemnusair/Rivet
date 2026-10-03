"use client";
import { makeExportCopy } from "@/lib/exports/copy";
import { useLocale, useT, type TFunction } from "@/lib/i18n/provider";
import { useFormat, useFormattingTimeZone } from "@/lib/i18n/format";

import { openInvoicePdf } from "@/features/billing/invoice-pdf";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
import { exponentFor, money, readMoneyInput } from "@/lib/utils/money";
import type { MoneyInputProblem } from "@/lib/utils/money";
import { buildCsvDocument, formatMinorUnits } from "@/lib/exports/csv";
import { downloadTextFile } from "@/lib/exports/download";

type InvoiceAction = { invoice: PlatformBillingInvoice; kind: "payment" | "past_due" | "void" };

export default function BillingPage() {
  const t = useT();
  const { locale, isolate, isolateLtr } = useLocale();
  const timeZone = useFormattingTimeZone();
  const f = useFormat(timeZone);
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
  // A support triage suggestion lands here with ?case=<id>: say which case sent the operator, and offer the way back.
  const requestedCaseId = searchParams.get("case")?.trim() || undefined;
  const linkedCase = useMemo(() => (requestedCaseId ? platformSnapshot?.supportCases.find((item) => item.id === requestedCaseId) : undefined), [platformSnapshot?.supportCases, requestedCaseId]);
  const caseDetails = linkedCase ? ` · ${isolate(linkedCase.subject)} · ${isolate(linkedCase.gym)}` : ` · ${t("platformFinance.billing.missingCase")}`;

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

  const issueInvoice = useApiMutation((api, invoiceId: string) => api.issuePlatformInvoice(invoiceId), { successMessage: t("platformFinance.billing.invoiceIssuedToast"), onSuccess: replaceInvoice });
  const recordPayment = useApiMutation((api, input: RecordPlatformInvoicePaymentInput) => api.recordPlatformInvoicePayment(input), {
    successMessage: t("platformFinance.billing.paymentRecordedToast"),
    onSuccess: (updated) => { replaceInvoice(updated); setAction(undefined); },
  });
  const markPastDue = useApiMutation((api, input: { invoiceId: string; reason: string }) => api.markPlatformInvoicePastDue(input.invoiceId, input.reason), {
    successMessage: t("platformFinance.billing.markedPastDueToast"),
    onSuccess: (updated) => { replaceInvoice(updated); setAction(undefined); },
  });
  const voidInvoice = useApiMutation((api, input: { invoiceId: string; reason: string }) => api.voidPlatformInvoice(input.invoiceId, input.reason), {
    successMessage: t("platformFinance.billing.invoiceVoidedToast"),
    onSuccess: (updated) => { replaceInvoice(updated); setAction(undefined); },
  });

  return (
    <PlatformPage>
      <PageHeader
        title={t("platformFinance.billing.title")}
        description={t("platformFinance.billing.description")}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPolicyOpen(true)}><CalendarClock />{t("platformFinance.billing.renewalPolicy")}</Button>
            <Button variant="secondary" onClick={() => downloadInvoices(invoices, locale, t, timeZone)} disabled={invoices.length === 0}><ArrowDownToLine />{t("platformFinance.billing.exportLedger")}</Button>
            <Button variant="signal" onClick={() => { setBillWizardGymId(undefined); setBillWizardOpen(true); }} disabled={!platformSnapshot}><Receipt />{t("platformFinance.billing.billGym")}</Button>
          </>
        }
      />

      {requestedCaseId ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-sunken/50 px-4 py-2.5 text-[12.5px] text-ink-2" role="status" data-testid="billing-case-banner">
          <span>{t("platformFinance.billing.reviewingCase", { caseId: isolateLtr(requestedCaseId), details: caseDetails })}</span>
          <Link className="font-medium text-ink underline-offset-4 hover:underline" href={`/platform/support?case=${encodeURIComponent(requestedCaseId)}`}>{t("platformFinance.billing.backToCase")}</Link>
        </div>
      ) : null}

      <BillGymWizard open={billWizardOpen} onOpenChange={(open) => { setBillWizardOpen(open); if (!open) setBillWizardGymId(undefined); }} gyms={platformSnapshot?.gyms ?? []} plans={platformSnapshot?.plans ?? []} initialGymId={billWizardGymId} />

      {invoiceTotals.overdue.amount ? (
        <div className="mt-5 flex items-start gap-3 rounded-md border border-danger/30 bg-danger-bg px-4 py-3" role="status">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
          <div className="text-[12.5px]"><p className="font-semibold text-danger">{t("platformFinance.billing.overdueHeading")}</p><p className="mt-0.5 text-ink-2">{t("platformFinance.billing.overdueDescription", { amount: f.money(invoiceTotals.overdue) })}</p></div>
        </div>
      ) : null}

      <section className="mt-5 grid gap-3 sm:grid-cols-3" aria-label={t("platformFinance.billing.totals")}>
        <PlatformPanel className="p-4"><Stat label={t("marketing.device.kpi.outstanding")} value={platformSnapshot ? f.money(invoiceTotals.outstanding) : "—"} context={t("platformFinance.billing.openAndPastDue")} tone={invoiceTotals.outstanding.amount ? "warning" : undefined} /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label={t("dashboard.owner.collected")} value={platformSnapshot ? f.money(invoiceTotals.collected) : "—"} context={t("platformFinance.billing.paidRecords")} /></PlatformPanel>
        <PlatformPanel className="p-4"><Stat label={t("platformFinance.billing.automaticCharging")} value={t("platformFinance.billing.notConfigured")} context={t("platformFinance.billing.manualConfirmationOnly")} /></PlatformPanel>
      </section>

      <GymSubscriptions gyms={platformSnapshot?.gyms ?? []} onBill={(gymId) => { setBillWizardGymId(gymId); setBillWizardOpen(true); }} />

      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("platformFinance.billing.policyTitle")}</DialogTitle>
            <DialogDescription>{t("platformFinance.billing.policyDescription")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-2">
            <PolicyStep index="01" title={t("platformFinance.billing.invoiceIssued")} detail={t("platformFinance.billing.daysBeforeTermEnds", { count: f.number(INVOICE_LEAD_DAYS) })} />
            <PolicyStep index="02" title={t("platformFinance.billing.due")} detail={t("platformFinance.billing.daysAfterIssued", { count: f.number(PAYMENT_TERM_DAYS) })} />
            <PolicyStep index="03" title={t("platformFinance.billing.pastDue")} detail={t("platformFinance.billing.dayAfterDueNotice")} />
            <PolicyStep index="04" title={t("platformFinance.billing.suspension")} detail={t("platformFinance.billing.suspensionTiming", { suspensionDays: f.number(SUSPENSION_AFTER_DUE_DAYS), overdueDays: f.number(OVERDUE_BEFORE_NOTICE_DAYS), noticeDays: f.number(SUSPENSION_NOTICE_DAYS) })} />
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">{t("platformFinance.billing.paymentReactivates")}</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPolicyOpen(false)}>{t("common.action.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="mt-5" aria-labelledby="renewal-summary-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><h2 id="renewal-summary-heading" className="text-[15px] font-semibold">{t("platformFinance.billing.invoiceStates")}</h2><p className="text-[12.5px] text-ink-3">{t("platformFinance.billing.invoiceStatesDescription")}</p></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <LifecycleCard label={t("platformFinance.billing.upcomingOpen")} count={renewalSummary.upcoming.length} amount={renewalSummary.amountFor(renewalSummary.upcoming)} detail={t("platformFinance.billing.issuedPayable", { issuedDays: f.number(INVOICE_LEAD_DAYS), termDays: f.number(PAYMENT_TERM_DAYS) })} />
          <LifecycleCard label={t("platformFinance.billing.inGracePastDue")} count={renewalSummary.inGrace.length} amount={renewalSummary.amountFor(renewalSummary.inGrace)} detail={t("platformFinance.billing.accessMayClose", { graceDays: f.number(SUSPENSION_AFTER_DUE_DAYS) })} tone={renewalSummary.inGrace.length > 0 ? "warning" : undefined} />
          <LifecycleCard label={t("platformFinance.billing.paidRenewals")} count={renewalSummary.paid.length} amount={renewalSummary.amountFor(renewalSummary.paid)} detail={t("platformFinance.billing.paymentReferenceRecorded")} tone={renewalSummary.paid.length > 0 ? "success" : undefined} />
        </div>
      </section>

      <PlatformPanel className="mt-5 overflow-hidden" aria-labelledby="subscription-invoices-heading">
        <PlatformPanelHeader id="subscription-invoices-heading" title={t("platformFinance.billing.invoicesTitle")} description={t("platformFinance.billing.invoicesDescription")} />
        {!platformSnapshot ? <p className="px-5 py-10 text-center text-[12.5px] text-ink-3" role="status">{t("platformFinance.billing.loadingLedger")}</p> : automatedInvoices.length === 0 ? <p className="px-5 py-10 text-center text-[12.5px] text-ink-3">{t("platformFinance.billing.noInvoices")}</p> : <InvoiceTable invoices={automatedInvoices} focusedInvoiceId={focusedInvoiceId} issueInvoice={issueInvoice} setAction={setAction} />}
      </PlatformPanel>

      {platformSnapshot && manualInvoices.length ? (
        <details className="mt-4 rounded-lg border border-line bg-surface" open={manualInvoices.some((invoice) => invoice.id === focusedInvoiceId)}>
          <summary className="cursor-pointer list-none px-4 py-3.5 marker:hidden sm:px-5 [&::-webkit-details-marker]:hidden">
            <span className="block text-[15px] font-semibold">{t("platformFinance.billing.manualInvoices")} <span className="text-ink-3">({f.number(manualInvoices.length)})</span></span>
            <span className="mt-0.5 block text-[12.5px] text-ink-3">{t("platformFinance.billing.manualInvoicesDescription")}</span>
          </summary>
          <div className="border-t border-line"><InvoiceTable invoices={manualInvoices} focusedInvoiceId={focusedInvoiceId} issueInvoice={issueInvoice} setAction={setAction} /></div>
        </details>
      ) : null}

      {platformSnapshot ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3.5 sm:px-5" aria-label={t("platformFinance.billing.exceptionWorkflow")}>
          <div><p className="text-[13px] font-semibold">{t("platformFinance.billing.exceptionQuestion")}</p><p className="mt-0.5 text-[12.5px] text-ink-3">{t("platformFinance.billing.exceptionDescription")}</p></div>
          <Button variant="secondary" onClick={() => setCreateOpen(true)}><FilePlus2 />{t("platformFinance.billing.createExceptionInvoice")}</Button>
        </div>
      ) : null}

      <CreateInvoiceDialog open={createOpen} onOpenChange={setCreateOpen} gyms={platformSnapshot?.gyms ?? []} onCreated={replaceInvoice} />
      <InvoiceActionDialog action={action} onOpenChange={(open) => { if (!open) setAction(undefined); }} onPastDue={(input) => markPastDue.mutate(input)} onPayment={(input) => recordPayment.mutate(input)} onVoid={(input) => voidInvoice.mutate(input)} saving={markPastDue.isPending || recordPayment.isPending || voidInvoice.isPending} />
    </PlatformPage>
  );
}

const selectClass = "h-9 w-full rounded-md border border-line-2 bg-surface px-3 text-[13.5px] text-ink transition-colors hover:border-line-3 focus:border-[var(--tenant-brand-primary)]";

function CreateInvoiceDialog({ open, onOpenChange, gyms, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; gyms: Array<{ id: string; name: string }>; onCreated: (invoice: PlatformBillingInvoice) => void }) {
  const t = useT();
  const [gymId, setGymId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const create = useApiMutation((api, input: CreatePlatformInvoiceInput) => api.createPlatformInvoice(input), {
    successMessage: t("platformFinance.billing.draftInvoiceCreated"),
    onSuccess: (invoice) => {
      onCreated(invoice);
      setGymId(""); setAmount(""); setDueAt(""); setPeriodStart(""); setPeriodEnd(""); onOpenChange(false);
    },
  });
  const parsedAmount = parsePositiveMinorAmount(amount, "JOD", t);
  const validAmount = parsedAmount.amountMinor !== undefined;
  const amountError = amount.trim() ? parsedAmount.error : undefined;
  const validPeriod = !periodStart || !periodEnd || periodEnd >= periodStart;
  const valid = Boolean(gymId && validAmount && dueAt && periodStart && periodEnd && validPeriod);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("platformFinance.billing.createInvoiceTitle")}</DialogTitle><DialogDescription>{t("platformFinance.billing.createInvoiceDescription")}</DialogDescription></DialogHeader>
        <DialogBody className="grid gap-4">
          <Field label={t("shell.topbar.gym")} htmlFor="platform-invoice-gym"><select id="platform-invoice-gym" className={selectClass} value={gymId} onChange={(event) => setGymId(event.target.value)}><option value="">{t("platformFinance.billing.chooseGym")}</option>{gyms.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}</select></Field>
          <Field label={t("platformFinance.billing.amountJod")} htmlFor="platform-invoice-amount" error={amountError}><Input id="platform-invoice-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="149.000" aria-invalid={Boolean(amountError)} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label={t("platformFinance.billing.periodStart")} htmlFor="platform-invoice-period-start"><Input id="platform-invoice-period-start" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></Field><Field label={t("platformFinance.billing.periodEnd")} htmlFor="platform-invoice-period-end" error={validPeriod ? undefined : t("platformFinance.billing.periodEndAfterStart")}><Input id="platform-invoice-period-end" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} aria-invalid={!validPeriod} /></Field></div>
          <Field label={t("memberProfile.createTask.dueDate")} htmlFor="platform-invoice-due"><Input id="platform-invoice-due" type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></Field>
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button><Button loading={create.isPending} disabled={!valid} onClick={() => create.mutate({ gymId, amountMinor: parsedAmount.amountMinor ?? 0, currency: "JOD", dueAt, periodStart, periodEnd })}>{t("platformFinance.billing.createDraft")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PolicyStep({ index, title, detail }: { index: string; title: string; detail: string }) {
  return <div className="flex items-start gap-3 rounded-md border border-line bg-sunken/60 p-3 text-[12.5px]"><span className="font-mono text-[11px] text-ink-3">{index}</span><span><span className="font-medium text-ink">{title}</span><span className="mt-0.5 block text-ink-3">{detail}</span></span></div>;
}

function LifecycleCard({ label, count, amount, detail, tone }: { label: string; count: number; amount: { amount: number; currency: string }; detail: string; tone?: "warning" | "success" }) {
  const f = useFormat();
  return <PlatformPanel className="p-4"><Stat label={label} value={<span className="flex items-baseline justify-between gap-3"><span>{f.number(count)}</span><span className="text-[13px] font-medium tabular text-ink-2">{f.money(amount)}</span></span>} context={detail} tone={tone} /></PlatformPanel>;
}

function InvoiceTable({ invoices, focusedInvoiceId, issueInvoice, setAction }: { invoices: PlatformBillingInvoice[]; focusedInvoiceId?: string; issueInvoice: { isPending: boolean; variables?: string; mutate: (invoiceId: string) => void }; setAction: (action: InvoiceAction) => void }) {
  const t = useT();
  return (
    <Table className="min-w-[960px]">
      <TableHeader>
        <TableRow>
          <TableHead className="ps-4 sm:ps-5">{t("renewFlow.payment.invoice")}</TableHead>
          <TableHead>{t("shell.topbar.gym")}</TableHead>
          <TableHead>{t("platformFinance.billing.table.issued")}</TableHead>
          <TableHead>{t("platformFinance.billing.table.due")}</TableHead>
          <TableHead>{t("platformFinance.billing.table.gracePeriod")}</TableHead>
          <TableHead className="text-end">{t("common.label.amount")}</TableHead>
          <TableHead>{t("common.label.status")}</TableHead>
          <TableHead className="pe-4 text-end sm:pe-5">{t("common.label.actions")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invoices.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} focused={focusedInvoiceId === invoice.id} issuing={issueInvoice.isPending && issueInvoice.variables === invoice.id} onIssue={() => issueInvoice.mutate(invoice.id)} onPastDue={() => setAction({ invoice, kind: "past_due" })} onPayment={() => setAction({ invoice, kind: "payment" })} onVoid={() => setAction({ invoice, kind: "void" })} />)}
      </TableBody>
    </Table>
  );
}

function InvoiceActionDialog({ action, onOpenChange, onPastDue, onPayment, onVoid, saving }: { action?: InvoiceAction; onOpenChange: (open: boolean) => void; onPastDue: (input: { invoiceId: string; reason: string }) => void; onPayment: (input: RecordPlatformInvoicePaymentInput) => void; onVoid: (input: { invoiceId: string; reason: string }) => void; saving: boolean }) {
  const t = useT();
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const key = action ? `${action.invoice.id}:${action.kind}` : "closed";
  const reactivating = action?.kind === "payment" && isAutomaticRenewal(action.invoice) && action.invoice.status === "past_due";
  const title = action?.kind === "payment" ? reactivating ? t("platformFinance.billing.action.recordAndReactivate") : t("platformFinance.billing.action.recordOffline") : action?.kind === "past_due" ? t("platformFinance.billing.action.markPastDue") : t("platformFinance.billing.action.voidInvoice");
  const description = action?.kind === "payment" ? reactivating ? t("platformFinance.billing.action.reactivateDescription") : t("platformFinance.billing.action.offlineDescription") : action?.kind === "past_due" ? t("platformFinance.billing.action.markPastDueDescription") : t("platformFinance.billing.action.voidDescription");
  const submitLabel = action?.kind === "payment" ? reactivating ? t("platformFinance.billing.action.reactivateGym") : t("platformFinance.billing.action.recordPayment") : action?.kind === "past_due" ? t("platformFinance.billing.action.markPastDueSubmit") : t("platformFinance.billing.action.voidSubmit");
  return (
    <Dialog open={Boolean(action)} onOpenChange={onOpenChange}>
      <DialogContent key={key}>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <DialogBody className="grid gap-4">
          {action?.kind === "payment" ? <Field label={t("platformFinance.billing.action.reference")} htmlFor="platform-invoice-reference"><Input id="platform-invoice-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder={t("platformFinance.billing.action.referencePlaceholder")} /></Field> : null}
          <Field label={t("common.label.reason")} htmlFor="platform-invoice-reason"><Textarea id="platform-invoice-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("platformFinance.billing.action.auditReasonPlaceholder")} /></Field>
        </DialogBody>
        <DialogFooter><Button variant="secondary" onClick={() => onOpenChange(false)}>{t("common.action.cancel")}</Button><Button loading={saving} disabled={!action || !reason.trim() || (action.kind === "payment" && !reference.trim())} variant={action?.kind === "void" ? "danger" : "primary"} onClick={() => { if (!action) return; if (action.kind === "payment") onPayment({ invoiceId: action.invoice.id, reference: reference.trim(), reason: reason.trim() }); else if (action.kind === "past_due") onPastDue({ invoiceId: action.invoice.id, reason: reason.trim() }); else onVoid({ invoiceId: action.invoice.id, reason: reason.trim() }); }}>{submitLabel}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceRow({ invoice, focused, issuing, onIssue, onPastDue, onPayment, onVoid }: { invoice: PlatformBillingInvoice; focused: boolean; issuing: boolean; onIssue: () => void; onPastDue: () => void; onPayment: () => void; onVoid: () => void }) {
  const t = useT();
  const { isolateLtr } = useLocale();
  const timeZone = useFormattingTimeZone();
  const f = useFormat(timeZone);
  const amount = invoice.amountMinor !== undefined ? f.money(money(invoice.amountMinor, invoice.currency ?? "JOD")) : invoice.amount;
  const outstanding = ["open", "past_due", "failed"].includes(invoice.status);
  const canVoid = !["paid", "void"].includes(invoice.status);
  const renewal = isAutomaticRenewal(invoice);
  const paymentLabel = invoice.status === "past_due" && renewal ? t("platformFinance.billing.table.reactivate") : t("platformFinance.billing.table.recordPayment");
  const graceEnd = renewal ? graceEndAt(invoice) : undefined;
  return (
    <TableRow id={`platform-invoice-${invoice.id}`} className={cn(focused && "bg-sunken/60")}>
      <TableCell className="ps-4 sm:ps-5"><span className="block font-mono text-[12px]" dir="ltr">{invoice.id}</span><Badge variant={renewal ? "neutral" : "outline"} className="mt-1">{isSubscriptionChange(invoice) ? t("platformFinance.billing.table.subscriptionChange") : renewal ? t("platformFinance.billing.table.renewal") : t("platformFinance.billing.table.manualException")}</Badge></TableCell>
      <TableCell className="text-[13px] font-medium">{invoice.gym}</TableCell>
      <TableCell className="whitespace-nowrap text-[12.5px] text-ink-2">{displayDate(invoice.issuedAt ?? invoice.date, f, t)}</TableCell>
      <TableCell className="whitespace-nowrap text-[12.5px] text-ink-2">{displayDate(invoice.dueAt, f, t)}</TableCell>
      <TableCell className="text-[12.5px] text-ink-2">{invoice.status === "past_due" && renewal ? <><span className="block font-medium text-danger">{t("platformFinance.billing.table.graceEnds", { date: displayDate(graceEnd, f, t) })}</span><span className="mt-0.5 block text-ink-3">{t("platformFinance.billing.table.duePlusDays", { count: SUSPENSION_AFTER_DUE_DAYS })}</span></> : invoice.periodEnd ? <><span className="block">{t("platformFinance.billing.table.periodEnds", { date: displayDate(invoice.periodEnd, f, t) })}</span><span className="mt-0.5 block text-ink-3">{formatInterval(invoice.billingInterval, t)}</span></> : t("platformFinance.billing.table.notRecorded")}</TableCell>
      <TableCell className="text-end text-[13px] font-semibold tabular">{amount}</TableCell>
      <TableCell><InvoiceStatusBadge status={invoice.status} renewal={renewal} /></TableCell>
      <TableCell className="pe-4 sm:pe-5"><div className="flex flex-wrap justify-end gap-1">
        <Button size="sm" variant="secondary" onClick={() => openInvoicePdf(invoice, { name: invoice.gym })} aria-label={t("platformFinance.billing.table.viewPdf", { invoiceId: isolateLtr(invoice.id) })} data-testid="view-invoice-pdf"><FileText /><span dir="ltr">{t("platformFinance.billing.table.pdf")}</span></Button>
        {invoice.status === "draft" ? <Button size="sm" loading={issuing} onClick={onIssue}><Send />{t("platformFinance.billing.table.issue")}</Button> : null}
        {invoice.status === "open" && (!renewal || isSubscriptionChange(invoice)) ? <Button size="sm" variant="secondary" onClick={onPastDue}><CircleAlert />{t("platformFinance.billing.table.pastDueAction")}</Button> : null}
        {outstanding ? <Button size="sm" onClick={onPayment}><CheckCircle2 /> {paymentLabel}</Button> : null}
        {canVoid ? <Button size="sm" variant="secondary" onClick={onVoid}><Ban />{t("platformFinance.billing.table.void")}</Button> : null}
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

function formatInterval(interval: PlatformBillingInvoice["billingInterval"], t: TFunction): string {
  return interval === "annual" ? t("platformFinance.billing.table.annualRenewal") : interval === "monthly" ? t("platformFinance.billing.table.monthlyRenewal") : t("platformFinance.billing.table.cadenceUnknown");
}

function displayDate(value: string | undefined, f: ReturnType<typeof useFormat>, t: TFunction): string {
  if (!value) return t("platformFinance.billing.table.notRecorded");
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? f.date(value) : value;
}

function invoiceAmountMinor(invoice: PlatformBillingInvoice): number {
  if (Number.isSafeInteger(invoice.amountMinor) && (invoice.amountMinor ?? 0) >= 0) return invoice.amountMinor ?? 0;
  const parsed = readMoneyInput(invoice.amount, invoice.currency ?? "JOD");
  return parsed.ok && parsed.money.amount >= 0 ? parsed.money.amount : 0;
}

function parsePositiveMinorAmount(raw: string, currency: string, t: TFunction): { amountMinor?: number; error?: string } {
  const result = readMoneyInput(raw, currency);
  if (!result.ok) return { error: localizedMoneyInputError(result.problem, currency, t) };
  if (result.money.amount <= 0) return { error: t("platformFinance.validation.amountGreaterThanZero") };
  return { amountMinor: result.money.amount };
}

function localizedMoneyInputError(problem: MoneyInputProblem, currency: string, t: TFunction): string {
  switch (problem) {
    case "empty": return t("platformFinance.validation.amountEmpty");
    case "not_a_number": return t("platformFinance.validation.amountNotNumber");
    case "ambiguous_separator": return t("platformFinance.validation.amountAmbiguous");
    case "negative": return t("platformFinance.validation.amountNegative");
    case "too_precise": return t("platformFinance.validation.amountTooPrecise", { count: exponentFor(currency) });
    case "currency_mismatch": return t("platformFinance.validation.amountCurrencyMismatch");
    case "too_large": return t("platformFinance.validation.amountTooLarge");
  }
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
      headers: ["Invoice ID", "Gym", "Invoice type", "Billing interval", "Service period starts", "Service period ends", "Issued", "Due", "Grace period ends", "Amount", "Currency", "Status", "Marked past due", "Payment reference", "Paid", "Voided", "Cycle key"].map(copy.label),
      rows: invoices.map((invoice) => [
        invoice.id,
        invoice.gym,
        copy.label(isSubscriptionChange(invoice) ? "Subscription change" : isAutomaticRenewal(invoice) ? "Automatic renewal" : "Manual exception"),
        copy.status(invoice.billingInterval),
        copy.dateTime(invoice.periodStart, timeZone),
        copy.dateTime(invoice.periodEnd, timeZone),
        copy.dateTime(invoice.issuedAt ?? invoice.date, timeZone),
        copy.dateTime(invoice.dueAt, timeZone),
        copy.dateTime(graceEndAt(invoice), timeZone),
        invoice.amountMinor === undefined ? invoice.amount : formatMinorUnits(invoice.amountMinor, invoice.currency),
        invoice.currency,
        copy.status(invoice.status),
        copy.dateTime(invoice.pastDueAt, timeZone),
        invoice.paymentReference,
        copy.dateTime(invoice.paidAt, timeZone),
        copy.dateTime(invoice.voidedAt, timeZone),
        invoice.cycleKey,
      ]),
    }),
  });
}
