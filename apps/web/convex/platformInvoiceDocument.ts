import { ADD_ON_CATALOGUE, type SubscriptionInvoiceLine } from "./subscriptionAddOns";
import { createTranslator } from "../src/lib/i18n/core";
import { makeFormatters } from "../src/lib/i18n/formatters";
import { isolateLtr } from "../src/lib/i18n/bidi";
/**
 * A stored platform invoice, projected into the printable document.
 *
 * The projection is pure so the same figures reach the PDF, the email and a
 * test. Anything RIVET has not decided, tax in particular, stays a visible
 * placeholder rather than an invented number.
 */
import { invoicePdfFilename, renderInvoicePdfBase64, type InvoicePaymentDetails, type InvoicePdfInput, type InvoicePdfStatus } from "./platformInvoicePdf";

export interface StoredInvoice {
  lines?: unknown;
  upgradeActivation?: unknown;
  amountMinor?: unknown;
  /** The term at list price, before any credit. Defaults to the amount. */
  subtotalMinor?: unknown;
  onboardingFeeMinor?: unknown;
  /** A first invoice's website add-on, and whether a free place covered it. */
  websiteMinor?: unknown;
  websiteFree?: unknown;
  /** A promo code's discount on a first invoice. */
  discountMinor?: unknown;
  promoCode?: unknown;
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

export interface InvoiceDocumentContext {
  locale?: "en" | "ar";
  timeZone?: string;
  /** Where RIVET is paid, from the console, printed under "How to pay". */
  paymentDetails?: InvoicePaymentDetails;
}

const MINOR_EXPONENT: Readonly<Record<string, number>> = { JOD: 3, KWD: 3, BHD: 3, OMR: 3, TND: 3 };

export function invoiceMoney(amountMinor: number, currency: string, locale: "en" | "ar" = "en"): string {
  if (locale === "ar") {
    const value = makeFormatters(locale, "").money({ amount: amountMinor, currency });
    return value.replace(/^([+-]?[0-9,.]+)/, number => isolateLtr(number));
  }
  const exponent = MINOR_EXPONENT[currency.toUpperCase()] ?? 2;
  return `${currency.toUpperCase()} ${(amountMinor / 10 ** exponent).toFixed(exponent)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * "3 Sep 2026" in Amman's calendar, which is how RIVET dates its paperwork.
 * The month names are fixed here rather than taken from the runtime's locale
 * data, which spells September as "Sept" in newer versions.
 */
export function invoiceDate(value: unknown, fallback = "—", context: InvoiceDocumentContext = {}): string {
  if (context.locale === "ar") {
    const iso = typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? new Date(value).toISOString() : undefined;
    return iso && Number.isFinite(Date.parse(iso)) ? makeFormatters("ar", "", context.timeZone ?? "Asia/Amman").date(iso) : fallback;
  }
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

export function invoicePdfInput(number: string, invoice: StoredInvoice, customer: InvoiceCustomer, context: InvoiceDocumentContext = {}): InvoicePdfInput {
  const locale = context.locale ?? "en";
  const t = createTranslator(locale);
  const amountText = (minor: number, currency: string) => invoiceMoney(minor, currency, locale);
  const dateText = (value: unknown, fallback = "—") => invoiceDate(value, fallback, context);
  const currency = typeof invoice.currency === "string" ? invoice.currency : "JOD";
  const amountMinor = typeof invoice.amountMinor === "number" ? invoice.amountMinor : 0;
  const creditMinor = typeof invoice.creditMinor === "number" && invoice.creditMinor > 0 ? invoice.creditMinor : 0;
  const discountMinor = typeof invoice.discountMinor === "number" && invoice.discountMinor > 0 ? invoice.discountMinor : 0;
  const websiteMinor = typeof invoice.websiteMinor === "number" && invoice.websiteMinor > 0 ? invoice.websiteMinor : 0;
  const websiteRequested = typeof invoice.websiteFree === "boolean";
  const subtotalMinor = typeof invoice.subtotalMinor === "number" && invoice.subtotalMinor > 0 ? invoice.subtotalMinor : amountMinor + creditMinor + discountMinor;
  const interval = intervalOf(invoice.billingInterval);
  const onboardingFeeMinor = typeof invoice.onboardingFeeMinor === "number" && invoice.onboardingFeeMinor > 0 ? invoice.onboardingFeeMinor : 0;
  const creditDays = typeof invoice.creditDays === "number" ? invoice.creditDays : 0;
  const storedLines = Array.isArray(invoice.lines) ? invoice.lines.filter((line): line is SubscriptionInvoiceLine => Boolean(line && typeof line === "object" && (line.key === "base" || ADD_ON_CATALOGUE.some(item => item.key === line.key)) && Number.isSafeInteger(line.quantity) && line.quantity > 0 && Number.isSafeInteger(line.amountMinor) && line.amountMinor >= 0)) : [];
  const itemized = storedLines.length > 0 && storedLines.reduce((sum, line) => sum + line.amountMinor, 0) === subtotalMinor - onboardingFeeMinor - (typeof invoice.websiteMinor === "number" ? invoice.websiteMinor : 0);
  const amount = amountText(amountMinor, currency);
  const periodStart = dateText(invoice.periodStart);
  const periodEnd = dateText(invoice.periodEnd);
  const plan = customer.plan ? t("documents.plan", { plan: customer.plan }) : t("documents.platformSubscription");
  const status = statusOf(invoice.status);
  const activation = invoice.upgradeActivation && typeof invoice.upgradeActivation === "object" ? invoice.upgradeActivation as Record<string, unknown> : {};
  const activationNote = status === "paid" && [activation.fundedSubscriptionMinor, activation.appliedCreditMinor, activation.consumedCreditMinor].every(value => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    ? t("commerce.checkout.activationSummary", { funded: amountText(Number(activation.fundedSubscriptionMinor), currency), credit: amountText(Number(activation.appliedCreditMinor), currency), used: amountText(Number(activation.consumedCreditMinor), currency) })
    : undefined;
  const issuedValue = invoice.createdAt ?? invoice.periodStart;
  const paymentTermDays = daysApart(issuedValue, invoice.dueAt);
  return {
    number,
    ...(context.locale ? { locale } : {}),
    status,
    issuedDate: dateText(invoice.createdAt, dateText(invoice.periodStart)),
    dueDate: dateText(invoice.dueAt),
    periodStart,
    periodEnd,
    interval,
    ...(activationNote ? { activationNote } : {}),
    ...(paymentTermDays === undefined ? {} : { paymentTermDays }),
    customer: { name: customer.name, address: customer.address, contactName: customer.contactName, contactEmail: customer.contactEmail },
    lines: [...(itemized ? storedLines.map(line => ({ description: t("platformFinance.addOns.line", { name: t(`platformFinance.addOns.${line.key}`), quantity: line.quantity }), period: `${periodStart} – ${periodEnd}`, amount: amountText(line.amountMinor, currency) })) : [{
      description: t("documents.subscriptionLine", { plan, interval: t(interval === "annual" ? "documents.annualAdjective" : "documents.monthlyAdjective") }),
      period: `${periodStart} – ${periodEnd}`,
      amount: amountText(subtotalMinor - onboardingFeeMinor - websiteMinor, currency),
    }]), ...(onboardingFeeMinor > 0 ? [{ description: t("documents.onboardingFee"), period: "—", amount: amountText(onboardingFeeMinor, currency) }] : []),
    ...(websiteRequested ? [{ description: invoice.websiteFree === true ? t("documents.websiteFreeLine") : t("documents.websiteLine"), period: "—", amount: amountText(websiteMinor, currency) }] : [])],
    subtotal: amountText(subtotalMinor, currency),
    // A first invoice has no earlier term to credit, so a promo discount uses the same row.
    ...(creditMinor > 0 || discountMinor > 0
      ? {
          credit: {
            label: creditMinor > 0
              ? creditDays > 0 ? creditDays === 1 ? t("documents.creditOne") : t("documents.creditDays", { count: creditDays }) : t("documents.credit")
              : t("documents.promoDiscount", { code: typeof invoice.promoCode === "string" ? invoice.promoCode : "" }),
            value: locale === "ar" ? amountText(-(creditMinor + discountMinor), currency) : `-${invoiceMoney(creditMinor + discountMinor, currency)}`,
          },
        }
      : {}),
    total: amount,
    payment: status === "paid"
      ? {
          reference: typeof invoice.paymentReference === "string" ? invoice.paymentReference : undefined,
          paidDate: invoice.paidAt ? dateText(invoice.paidAt) : undefined,
          amount,
          balance: amountText(0, currency),
        }
      : undefined,
    ...(context.paymentDetails ? { paymentDetails: context.paymentDetails } : {}),
  };
}

/** The invoice as a PDF, ready to hang off an operational email. */
export function platformInvoiceAttachment(number: string, invoice: StoredInvoice, customer: InvoiceCustomer, context: InvoiceDocumentContext = {}): { filename: string; contentType: string; contentBase64: string } {
  return {
    filename: invoicePdfFilename(number),
    contentType: "application/pdf",
    contentBase64: renderInvoicePdfBase64(invoicePdfInput(number, invoice, customer, context)),
  };
}
