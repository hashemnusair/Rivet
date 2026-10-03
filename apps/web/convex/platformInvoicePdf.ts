import { createTranslator } from "../src/lib/i18n/core";
import { isolateLtr } from "../src/lib/i18n/bidi";
/**
 * The invoice RIVET issues to a gym for its platform subscription.
 *
 * Same page furniture as the subscription agreement, so a gym's documents
 * read as one set: lockup, technical label, quiet status chip, hairline
 * tables, and a footer that names the page and the reference. It prints to
 * greyscale without loss; the only colour is the past-due chip.
 */
import { renderPdf, encodeBase64, type PdfBlock } from "./pdfDocument";
import { RIVET_GLYPH_JPEG, RIVET_LOCKUP_JPEG } from "./brandAssets";
import { BRAND_CONTACT, BRAND_LEGAL, brandLegalLine } from "./brandTokens";

export type InvoicePdfStatus = "draft" | "open" | "paid" | "past_due" | "failed" | "void";

export interface InvoicePdfLine {
  description: string;
  period: string;
  amount: string;
}

export interface InvoicePdfInput {
  locale?: "en" | "ar";
  number: string;
  status: InvoicePdfStatus;
  issuedDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  interval: "monthly" | "annual";
  /** Days between the issue date and the due date, when both are known. */
  paymentTermDays?: number;
  customer: { name: string; address?: string; contactName?: string; contactEmail?: string };
  lines: InvoicePdfLine[];
  subtotal: string;
  /** A deduction between the subtotal and the total, such as unused paid days. */
  credit?: { label: string; value: string };
  total: string;
  /** Present once the payment is recorded. */
  payment?: { reference?: string; paidDate?: string; amount?: string; balance?: string };
}

const CHIPS: Record<InvoicePdfStatus, { label: string; tone: "success" | "warning" | "danger" | "muted" }> = {
  draft: { label: "Draft", tone: "muted" },
  open: { label: "Open", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  past_due: { label: "Past due", tone: "danger" },
  failed: { label: "Payment failed", tone: "danger" },
  void: { label: "Void", tone: "muted" },
};

function chipFor(input: InvoicePdfInput): { label: string; tone: "success" | "warning" | "danger" | "muted" } {
  const t = createTranslator(input.locale ?? "en");
  const keys = { draft: "draft", open: "open", paid: "paid", past_due: "pastDue", failed: "failed", void: "void" } as const;
  const chip = { ...CHIPS[input.status], label: t(`documents.${keys[input.status]}`) };
  return input.status === "paid" && input.payment?.paidDate ? { ...chip, label: t("documents.paidOn", { date: input.payment.paidDate }) } : chip;
}

/** The blocks of the invoice, in order. Exported so tests can read them. */
export function invoicePdfBlocks(input: InvoicePdfInput): PdfBlock[] {
  const t = createTranslator(input.locale ?? "en");
  const reference = (value: string) => input.locale === "ar" ? isolateLtr(value) : value;
  const period = `${input.periodStart} – ${input.periodEnd}`;
  const blocks: PdfBlock[] = [
    { type: "title", text: t("documents.invoiceTitle"), chip: chipFor(input) },
    { type: "meta", text: input.number },
    { type: "spacer", height: 6 },
    {
      type: "columns",
      columns: [
        {
          heading: t("documents.from"),
          lines: [
            { text: BRAND_LEGAL.legalEntity ?? "RIVET", font: "bold" },
            { text: t("agreementDocument.city") },
            ...(brandLegalLine() && BRAND_LEGAL.legalEntity ? [{ text: brandLegalLine().replace(`${BRAND_LEGAL.legalEntity} · `, ""), size: 9 }] : []),
            { text: BRAND_CONTACT.website, size: 9 },
            { text: BRAND_CONTACT.email, size: 9 },
          ],
        },
        {
          heading: t("documents.billTo"),
          lines: [
            { text: input.customer.name, font: "bold" },
            ...(input.customer.address ? [{ text: input.customer.address }] : []),
            ...(input.customer.contactName ? [{ text: input.customer.contactName, size: 9 }] : []),
            ...(input.customer.contactEmail ? [{ text: input.customer.contactEmail, size: 9 }] : []),
          ],
        },
      ],
    },
    { type: "rule" },
    {
      type: "columns",
      gap: 12,
      columns: [
        { heading: t("documents.issued"), lines: [{ text: input.issuedDate }] },
        { heading: t("documents.due"), lines: [{ text: input.dueDate }] },
        { heading: t("documents.billingPeriod"), lines: [{ text: period }] },
        { heading: t("documents.interval"), lines: [{ text: t(input.interval === "annual" ? "documents.yearly" : "documents.monthly") }] },
      ],
    },
    { type: "paragraph", text: input.paymentTermDays === undefined ? t("documents.paymentDue") : input.paymentTermDays === 1 ? t("documents.paymentTermOne") : t("documents.paymentTerms", { count: input.paymentTermDays }), size: 9, color: "#8B887B" },
    { type: "spacer", height: 6 },
    {
      type: "table",
      head: [t("documents.description"), t("documents.period"), t("documents.amount")],
      widths: [255, 118, 110],
      alignEnd: [2],
      rows: input.lines.map((line) => [line.description, line.period, line.amount]),
    },
    {
      type: "totals",
      rows: [
        { label: t("documents.subtotal"), value: input.subtotal },
        ...(input.credit ? [{ label: input.credit.label, value: input.credit.value }] : []),
        ...(BRAND_LEGAL.taxNote ? [{ label: t("documents.tax"), value: BRAND_LEGAL.taxNote }] : []),
        { label: input.payment ? t("documents.total") : t("documents.totalDue"), value: input.total, strong: true },
        ...(input.payment?.amount ? [{ label: t("documents.amountPaid"), value: input.payment.amount }] : []),
        ...(input.payment?.balance ? [{ label: t("documents.balance"), value: input.payment.balance }] : []),
      ],
    },
    { type: "spacer", height: 10 },
    {
      type: "panel",
      blocks: [
        { type: "paragraph", text: t("documents.howToPay"), font: "bold", size: 10 },
        ...(BRAND_LEGAL.bank
          ? [{
              type: "columns" as const,
              columns: [
                { heading: t("documents.bankTransfer"), lines: [{ text: t("documents.bank", { bank: BRAND_LEGAL.bank.bank }), size: 9 }, { text: t("documents.accountName", { name: BRAND_LEGAL.bank.accountName }), size: 9 }, { text: t("documents.iban", { iban: reference(BRAND_LEGAL.bank.iban) }), size: 9 }, ...(BRAND_LEGAL.bank.swift ? [{ text: t("documents.swift", { swift: reference(BRAND_LEGAL.bank.swift) }), size: 9 }] : [])] },
                ...(BRAND_LEGAL.cliqAlias ? [{ heading: t("documents.cliq"), lines: [{ text: t("documents.alias", { alias: reference(BRAND_LEGAL.cliqAlias) }), size: 9 }] }] : []),
              ],
            }]
          : [{ type: "paragraph" as const, text: t("documents.bankInstructions", { email: reference(BRAND_CONTACT.email) }), size: 9 }]),
        { type: "paragraph", text: t("documents.quoteReference", { reference: reference(input.number) }), size: 9 },
      ],
    },
    { type: "paragraph", text: t("documents.suspensionNotice"), size: 8.5, color: "#8B887B" },
  ];
  if (input.payment?.reference) blocks.push({ type: "paragraph", text: t("documents.paymentReference", { reference: reference(input.payment.reference) }), size: 8.5, color: "#8B887B" });
  return blocks;
}

export function renderInvoicePdf(input: InvoicePdfInput): Uint8Array {
  const t = createTranslator(input.locale ?? "en");
  return renderPdf(invoicePdfBlocks(input), {
    title: t("documents.invoiceMetadata", { number: input.number }),
    locale: input.locale,
    author: "RIVET",
    subject: `${input.customer.name} · ${input.total}`,
    documentLabel: t("documents.invoiceTitle"),
    runningTitle: t("documents.invoiceTitle"),
    footer: `${input.number} · RIVET, ${t("agreementDocument.city")} · ${BRAND_CONTACT.email}`,
    footerPlaceholder: brandLegalLine() || undefined,
    lockupJpeg: RIVET_LOCKUP_JPEG,
    glyphJpeg: RIVET_GLYPH_JPEG,
  });
}

export function invoicePdfFilename(number: string): string {
  return `RIVET-invoice-${number.replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
}

export function renderInvoicePdfBase64(input: InvoicePdfInput): string {
  return encodeBase64(renderInvoicePdf(input));
}
