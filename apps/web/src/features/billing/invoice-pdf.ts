"use client";

import type { PlatformBillingInvoice } from "@/lib/api/GymOSApi";
import { invoicePdfFilename, renderInvoicePdf } from "../../../convex/platformInvoicePdf";
import { invoicePdfInput, type InvoiceCustomer } from "../../../convex/platformInvoiceDocument";

/**
 * The invoice as a PDF, built in the browser from the same record and the
 * same renderer the server uses for the emailed attachment, so what a
 * person opens here is the file the gym received.
 */
export function invoicePdfBytes(invoice: PlatformBillingInvoice, customer: InvoiceCustomer): Uint8Array {
  return renderInvoicePdf(invoicePdfInput(invoice.id, {
    amountMinor: invoice.amountMinor,
    currency: invoice.currency,
    dueAt: invoice.dueAt,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    billingInterval: invoice.billingInterval === "annual" ? "yearly" : invoice.billingInterval,
    creditDays: invoice.creditDays,
    status: invoice.status === "trial" ? "draft" : invoice.status,
    paidAt: invoice.paidAt,
    paymentReference: invoice.paymentReference,
    createdAt: invoice.issuedAt ?? invoice.date,
  }, customer));
}

/** Open the invoice in a new tab as a PDF; the viewer offers save and print. */
export function openInvoicePdf(invoice: PlatformBillingInvoice, customer: InvoiceCustomer): void {
  const bytes = invoicePdfBytes(invoice, customer);
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) {
    // A blocked popup falls back to a download, so the file still reaches the reader.
    const link = document.createElement("a");
    link.href = url;
    link.download = invoicePdfFilename(invoice.id);
    document.body.append(link);
    link.click();
    link.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
