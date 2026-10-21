"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { getApi } from "@/lib/api/client";
import type { PlatformBillingInvoice } from "@/lib/api/GymOSApi";
import { qk } from "@/lib/api/keys";
import { createTranslator, loadCatalogue } from "@/lib/i18n/core";
import type { InvoiceCustomer, InvoiceDocumentContext } from "../../../convex/platformInvoiceDocument";

type PaymentDetails = NonNullable<InvoiceDocumentContext["paymentDetails"]>;

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
    currency: invoice.currency,
    dueAt: invoice.dueAt,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    billingInterval: invoice.billingInterval,
    subtotalMinor: invoice.subtotalMinor,
    onboardingFeeMinor: invoice.onboardingFeeMinor,
    websiteMinor: invoice.websiteMinor,
    websiteFree: invoice.websiteFree,
    discountMinor: invoice.discountMinor,
    promoCode: invoice.promoCode,
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
 * Where RIVET is paid (console → Billing → Where gyms pay), for a PDF opened
 * in the browser, so it prints what the emailed copy prints. The console reads
 * its own settings; a gym reads them from its payment page. A screen that
 * already loaded them answers from the cache. A failed read leaves the PDF's
 * general payment line rather than stopping the PDF.
 */
export function usePaymentDetailsLoader(reader: "platform" | "gym"): () => Promise<PaymentDetails | undefined> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    try {
      const view = reader === "platform"
        ? await queryClient.fetchQuery({ queryKey: qk.platformCommerce, queryFn: () => getApi().getPlatformCommerce(), staleTime: 60_000 })
        : await queryClient.fetchQuery({ queryKey: qk.billingCheckout, queryFn: () => getApi().getBillingCheckout(), staleTime: 60_000 });
      return view.paymentDetails;
    } catch {
      return undefined;
    }
  }, [queryClient, reader]);
}

/**
 * Open the invoice in a new tab as a PDF; the viewer offers save and print.
 * The tab opens inside the click, so a popup blocker allows it, and shows the
 * file once it is built. A blocked tab falls back to a download.
 */
export function openInvoicePdf(invoice: PlatformBillingInvoice, customer: InvoiceCustomer, context: InvoiceDocumentContext = { locale: document.documentElement.lang === "ar" ? "ar" : "en" }, loadPaymentDetails?: () => Promise<PaymentDetails | undefined>): void {
  const tab = window.open("", "_blank");
  void (loadPaymentDetails?.() ?? Promise.resolve(undefined)).then((paymentDetails) => invoicePdf(invoice, customer, paymentDetails ? { ...context, paymentDetails } : context)).then(({ bytes, fileName }) => {
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
