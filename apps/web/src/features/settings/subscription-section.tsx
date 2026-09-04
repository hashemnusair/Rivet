"use client";

import { FileText, Receipt } from "lucide-react";
import { qk } from "@/lib/api/keys";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useApp } from "@/lib/providers/app-providers";
import { formatDate } from "@/lib/utils/dates";
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

/** Settings → Subscription: the gym's RIVET invoices, each with its PDF. */
export function SubscriptionSection() {
  const { session } = useApp();
  const query = useApiQuery(qk.myPlatformInvoices, (api) => api.listMyPlatformInvoices());
  if (query.isLoading) return <Skeleton className="h-48 w-full" />;
  if (query.isError || !query.data) return <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const invoices = query.data;
  const customer = { name: session?.organization?.name ?? invoices[0]?.gym ?? "", contactName: session?.user.name ? `${session.user.name} (owner)` : undefined, contactEmail: session?.user.email };
  if (invoices.length === 0) return <EmptyState icon={Receipt} title="No invoices yet" description="RIVET's invoices for this gym's subscription appear here, each with its PDF." />;
  return (
    <div className="space-y-3" data-testid="subscription-invoices">
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
