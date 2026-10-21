"use client";

import { toast } from "sonner";
import type { PlatformBillingInvoice } from "@/lib/api/GymOSApi";
import { createTranslator, loadCatalogue } from "@/lib/i18n/core";
import type { InvoiceCustomer, InvoiceDocumentContext } from "../../../convex/platformInvoiceDocument";

/**
 * The renderer carries its own fonts and shaping engine (about 0.7 MB of
 * compressed script), so it loads when an invoice is opened, not with the
 * settings and billing screens that list invoices.
 */
const invoiceRenderer = () => Promise.all([import("../../../convex/platformInvoicePdf"), import("../../../convex/platformInvoiceDocument")]);

/**
 * Starts loading the renderer as soon as someone heads for a PDF button
 * (pointer, keyboard focus or touch), so the click usually finds it ready.
 * A failed prefetch is ignored; the click loads it again.
 */
export function prefetchInvoicePdf(): void {
  void invoiceRenderer().catch(() => undefined);
}

/** Spread onto every button that opens an invoice PDF. */
export const invoicePdfIntent = { onPointerEnter: prefetchInvoicePdf, onFocus: prefetchInvoicePdf, onTouchStart: prefetchInvoicePdf } as const;

/**
 * The invoice as a PDF, built in the browser from the same record and the
 * same renderer the server uses for the emailed attachment, so what a
 * person opens here is the file the gym received.
 */
export async function invoicePdf(invoice: PlatformBillingInvoice, customer: InvoiceCustomer, context: InvoiceDocumentContext = {}): Promise<{ bytes: Uint8Array; fileName: string }> {
  const [[{ renderInvoicePdf, invoicePdfFilename }, { invoicePdfInput }]] = await Promise.all([invoiceRenderer(), loadCatalogue(context.locale ?? "en")]);
  const bytes = renderInvoicePdf(invoicePdfInput(invoice.id, {
    amountMinor: invoice.amountMinor,
    lines: invoice.lines,
    currency: invoice.currency,
    dueAt: invoice.dueAt,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    billingInterval: invoice.billingInterval,
    subtotalMinor: invoice.subtotalMinor,
    onboardingFeeMinor: invoice.onboardingFeeMinor,
    creditMinor: invoice.creditMinor,
    creditDays: invoice.creditDays,
    status: invoice.status === "trial" ? "draft" : invoice.status,
    paidAt: invoice.paidAt,
    paymentReference: invoice.paymentReference,
    createdAt: invoice.issuedAt ?? invoice.date,
  }, customer, context));
  return { bytes, fileName: invoicePdfFilename(invoice.id) };
}

/**
 * Open the invoice in a new tab as a PDF; the viewer offers save and print.
 * The tab opens inside the click, so a popup blocker allows it, and shows the
 * file once it is built. A blocked tab falls back to a download.
 */
export function openInvoicePdf(invoice: PlatformBillingInvoice, customer: InvoiceCustomer, context: InvoiceDocumentContext = { locale: document.documentElement.lang === "ar" ? "ar" : "en" }): void {
  const tab = window.open("", "_blank");
  void invoicePdf(invoice, customer, context).then(({ bytes, fileName }) => {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
    if (tab && !tab.closed) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }).catch(() => {
    tab?.close();
    toast.error(createTranslator(document.documentElement.lang === "ar" ? "ar" : "en")("documents.openFailed"));
  });
}
