/**
 * A stored platform invoice, projected into the printable document.
 *
 * The projection is pure so the same figures reach the PDF, the email and a
 * test. Anything RIVET has not decided, tax in particular, stays a visible
 * placeholder rather than an invented number.
 */
import { invoicePdfFilename, renderInvoicePdfBase64, type InvoicePdfInput, type InvoicePdfStatus } from "./platformInvoicePdf";

export interface StoredInvoice {
  amountMinor?: unknown;
  /** The term at list price, before any credit. Defaults to the amount. */
  subtotalMinor?: unknown;
  /** What the unfinished part of the replaced term was worth. */
  creditMinor?: unknown;
  currency?: unknown;
  dueAt?: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
  billingInterval?: unknown;
  creditDays?: unknown;
  status?: unknown;
  paidAt?: unknown;
  paymentReference?: unknown;
  createdAt?: unknown;
}

export interface InvoiceCustomer {
  name: string;
  address?: string;
  contactName?: string;
  contactEmail?: string;
  plan?: string;
}

const MINOR_EXPONENT: Readonly<Record<string, number>> = { JOD: 3, KWD: 3, BHD: 3, OMR: 3, TND: 3 };

export function invoiceMoney(amountMinor: number, currency: string): string {
  const exponent = MINOR_EXPONENT[currency.toUpperCase()] ?? 2;
  return `${currency.toUpperCase()} ${(amountMinor / 10 ** exponent).toFixed(exponent)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * "3 Sep 2026" in Amman's calendar, which is how RIVET dates its paperwork.
 * The month names are fixed here rather than taken from the runtime's locale
 * data, which spells September as "Sept" in newer versions.
 */
export function invoiceDate(value: unknown, fallback = "—"): string {
  const iso = typeof value === "string" ? value : typeof value === "number" ? new Date(value).toISOString() : undefined;
  const timestamp = iso ? Date.parse(iso) : Number.NaN;
  if (!Number.isFinite(timestamp)) return fallback;
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Amman", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
  const [year, month, day] = local.split("-").map((part) => Number.parseInt(part, 10));
  return `${day} ${MONTHS[(month ?? 1) - 1]} ${year}`;
}

function statusOf(value: unknown): InvoicePdfStatus {
  const status = typeof value === "string" ? value : "open";
  return (["draft", "open", "paid", "past_due", "failed", "void"] as const).includes(status as InvoicePdfStatus) ? status as InvoicePdfStatus : "open";
}

/** The stored cadence, whatever vocabulary the row was written in. */
function intervalOf(value: unknown): "monthly" | "annual" {
  return value === "annual" || value === "yearly" ? "annual" : "monthly";
}

/** Whole days between two stored timestamps, when both are readable. */
function daysApart(from: unknown, to: unknown): number | undefined {
  const start = typeof from === "string" ? Date.parse(from) : typeof from === "number" ? from : Number.NaN;
  const end = typeof to === "string" ? Date.parse(to) : typeof to === "number" ? to : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined;
  return Math.round((end - start) / 86_400_000);
}

export function invoicePdfInput(number: string, invoice: StoredInvoice, customer: InvoiceCustomer): InvoicePdfInput {
  const currency = typeof invoice.currency === "string" ? invoice.currency : "JOD";
  const amountMinor = typeof invoice.amountMinor === "number" ? invoice.amountMinor : 0;
  const creditMinor = typeof invoice.creditMinor === "number" && invoice.creditMinor > 0 ? invoice.creditMinor : 0;
  const subtotalMinor = typeof invoice.subtotalMinor === "number" && invoice.subtotalMinor > 0 ? invoice.subtotalMinor : amountMinor + creditMinor;
  const interval = intervalOf(invoice.billingInterval);
  const creditDays = typeof invoice.creditDays === "number" ? invoice.creditDays : 0;
  const amount = invoiceMoney(amountMinor, currency);
  const periodStart = invoiceDate(invoice.periodStart);
  const periodEnd = invoiceDate(invoice.periodEnd);
  const plan = customer.plan ? `${customer.plan} plan` : "RIVET platform subscription";
  const status = statusOf(invoice.status);
  const issuedValue = invoice.createdAt ?? invoice.periodStart;
  const paymentTermDays = daysApart(issuedValue, invoice.dueAt);
  return {
    number,
    status,
    issuedDate: invoiceDate(invoice.createdAt, invoiceDate(invoice.periodStart)),
    dueDate: invoiceDate(invoice.dueAt),
    periodStart,
    periodEnd,
    interval,
    ...(paymentTermDays === undefined ? {} : { paymentTermDays }),
    customer: { name: customer.name, address: customer.address, contactName: customer.contactName, contactEmail: customer.contactEmail },
    lines: [{
      description: `${plan}, ${interval === "annual" ? "yearly" : "monthly"} subscription`,
      period: `${periodStart} – ${periodEnd}`,
      amount: invoiceMoney(subtotalMinor, currency),
    }],
    subtotal: invoiceMoney(subtotalMinor, currency),
    ...(creditMinor > 0
      ? {
          credit: {
            label: creditDays > 0 ? `Credit, ${creditDays} unused ${creditDays === 1 ? "day" : "days"} of the previous term` : "Credit from the previous term",
            value: `-${invoiceMoney(creditMinor, currency)}`,
          },
        }
      : {}),
    total: amount,
    payment: status === "paid"
      ? {
          reference: typeof invoice.paymentReference === "string" ? invoice.paymentReference : undefined,
          paidDate: invoice.paidAt ? invoiceDate(invoice.paidAt) : undefined,
          amount,
          balance: invoiceMoney(0, currency),
        }
      : undefined,
  };
}

/** The invoice as a PDF, ready to hang off an operational email. */
export function platformInvoiceAttachment(number: string, invoice: StoredInvoice, customer: InvoiceCustomer): { filename: string; contentType: string; contentBase64: string } {
  return {
    filename: invoicePdfFilename(number),
    contentType: "application/pdf",
    contentBase64: renderInvoicePdfBase64(invoicePdfInput(number, invoice, customer)),
  };
}
