"use client";

import { FileText, Receipt } from "lucide-react";
import { feeLabel, findPlan } from "../../../convex/planCatalogue";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { formatDate } from "@/lib/utils/dates";
import { formatBillingDate } from "@/lib/platform/subscription-billing";
import { openInvoicePdf } from "@/features/billing/invoice-pdf";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { EmptyState, QueryErrorState } from "@/components/ui/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STATUS: Record<string, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  open: { label: "Open", variant: "warning" },
  paid: { label: "Paid", variant: "success" },
  past_due: { label: "Past due", variant: "danger" },
  failed: { label: "Payment failed", variant: "danger" },
  void: { label: "Void", variant: "neutral" },
  trial: { label: "Trial", variant: "neutral" },
  draft: { label: "Draft", variant: "neutral" },
};

const PLAN_STATUS: Record<string, { label: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  trial: { label: "Trial", variant: "neutral" },
  active: { label: "Active", variant: "success" },
  past_due: { label: "Past due", variant: "danger" },
  suspended: { label: "Suspended", variant: "danger" },
  cancelled: { label: "Cancelled", variant: "neutral" },
};

/** The plan this gym is on, what it costs, and when the paid term ends. */
function SubscriptionSummary() {
  const { session } = useApp();
  const subscription = session?.organization?.subscription;
  if (!subscription) return null;
  const status = PLAN_STATUS[subscription.status] ?? { label: subscription.status, variant: "neutral" as const };
  const plan = findPlan(subscription.plan);
  const term = subscription.status === "trial" ? subscription.trialEndsAt : subscription.currentPeriodEndsAt;
  const rows: Array<{ label: string; value: string }> = [
    { label: "Plan", value: subscription.plan ?? "—" },
    { label: "Billing", value: subscription.billingInterval === "annual" ? "Yearly, paid once a year" : "Monthly" },
    ...(plan ? [{ label: "Fee", value: `${feeLabel(plan.priceMinor, subscription.billingInterval)}, excluding any applicable tax` }] : []),
    { label: subscription.status === "trial" ? "Trial ends" : "Paid through", value: term ? formatBillingDate(new Date(term)) : "—" },
  ];
  return (
    <section className="panel p-4" aria-label="Subscription summary" data-testid="subscription-summary">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold">This gym&rsquo;s RIVET subscription</h3>
        <Badge variant={status.variant} dot>{status.label}</Badge>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 last:border-b-0">
            <dt className="text-[12px] text-ink-3">{row.label}</dt>
            <dd className="text-[12.5px] font-medium tabular-nums" dir="ltr">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11.5px] text-ink-3">To change the plan or the billing cadence, ask RIVET through support. A change starts a new term the day it is made, and the unused days of this one are credited against the invoice for it.</p>
    </section>
  );
}

/** Settings → Subscription: the plan this gym is on, and every RIVET invoice with its PDF. */
export function SubscriptionSection() {
  const { session } = useApp();
  const query = useApiQuery(qk.myPlatformInvoices, (api) => api.listMyPlatformInvoices());
  if (query.isLoading) return <Skeleton className="h-48 w-full" />;
  if (query.isError || !query.data) return <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const invoices = query.data;
  const customer = { name: session?.organization?.name ?? invoices[0]?.gym ?? "", contactName: session?.user.name ? `${session.user.name} (owner)` : undefined, contactEmail: session?.user.email };
  if (invoices.length === 0) {
    return (
      <div className="space-y-3">
        <SubscriptionSummary />
        <EmptyState icon={Receipt} title="No invoices yet" description="RIVET's invoices for this gym's subscription appear here, each with its PDF." />
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="subscription-invoices">
      <SubscriptionSummary />
      <p className="text-[12.5px] text-ink-3">Every invoice RIVET has issued for this gym. Open one to see the PDF that was emailed with it.</p>
      <section className="panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-end">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-end">PDF</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => {
              const status = STATUS[invoice.status] ?? { label: invoice.status, variant: "neutral" as const };
              return (
                <TableRow key={invoice.id} data-testid="subscription-invoice-row">
                  <TableCell><span className="font-mono text-[12px]" dir="ltr">{invoice.id}</span></TableCell>
                  <TableCell dir="ltr">{invoice.issuedAt ? formatDate(invoice.issuedAt) : invoice.date}</TableCell>
                  <TableCell dir="ltr">{invoice.dueAt ? formatDate(invoice.dueAt) : "—"}</TableCell>
                  <TableCell className="text-end font-semibold tabular-nums">{invoice.amount}</TableCell>
                  <TableCell><Badge variant={status.variant} dot>{status.label}</Badge></TableCell>
                  <TableCell className="text-end"><Button size="xs" variant="secondary" onClick={() => openInvoicePdf(invoice, customer)} aria-label={`View invoice ${invoice.id}`} data-testid="view-invoice-pdf"><FileText /> View</Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
