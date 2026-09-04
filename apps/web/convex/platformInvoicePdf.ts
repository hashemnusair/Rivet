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
  number: string;
  status: InvoicePdfStatus;
  issuedDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  interval: "monthly" | "yearly";
  customer: { name: string; address?: string; contactName?: string; contactEmail?: string };
  lines: InvoicePdfLine[];
  subtotal: string;
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
  const chip = CHIPS[input.status];
  return input.status === "paid" && input.payment?.paidDate ? { ...chip, label: `Paid · ${input.payment.paidDate}` } : chip;
}

/** The blocks of the invoice, in order. Exported so tests can read them. */
export function invoicePdfBlocks(input: InvoicePdfInput): PdfBlock[] {
  const period = `${input.periodStart} – ${input.periodEnd}`;
  const blocks: PdfBlock[] = [
    { type: "title", text: "Invoice", chip: chipFor(input) },
    { type: "meta", text: input.number },
    { type: "spacer", height: 6 },
    {
      type: "columns",
      columns: [
        {
          heading: "From",
          lines: [
            { text: BRAND_LEGAL.legalEntity ?? "RIVET", font: "bold" },
            { text: BRAND_CONTACT.city },
            ...(brandLegalLine() && BRAND_LEGAL.legalEntity ? [{ text: brandLegalLine().replace(`${BRAND_LEGAL.legalEntity} · `, ""), size: 9 }] : []),
            { text: BRAND_CONTACT.website, size: 9 },
            { text: BRAND_CONTACT.email, size: 9 },
          ],
        },
        {
          heading: "Bill to",
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
        { heading: "Issued", lines: [{ text: input.issuedDate }] },
        { heading: "Due", lines: [{ text: input.dueDate }] },
        { heading: "Billing period", lines: [{ text: period }] },
        { heading: "Interval", lines: [{ text: input.interval === "yearly" ? "Yearly" : "Monthly" }] },
      ],
    },
    { type: "paragraph", text: "Payment terms 14 days.", size: 9, color: "#8B887B" },
    { type: "spacer", height: 6 },
    {
      type: "table",
      head: ["Description", "Period", "Amount"],
      widths: [255, 118, 110],
      alignEnd: [2],
      rows: input.lines.map((line) => [line.description, line.period, line.amount]),
    },
    {
      type: "totals",
      rows: [
        { label: "Subtotal", value: input.subtotal },
        ...(BRAND_LEGAL.taxNote ? [{ label: "Tax", value: BRAND_LEGAL.taxNote }] : []),
        { label: input.payment ? "Total" : "Total due", value: input.total, strong: true },
        ...(input.payment?.amount ? [{ label: "Amount paid", value: input.payment.amount }] : []),
        ...(input.payment?.balance ? [{ label: "Balance", value: input.payment.balance }] : []),
      ],
    },
    { type: "spacer", height: 10 },
    {
      type: "panel",
      blocks: [
        { type: "paragraph", text: "How to pay", font: "bold", size: 10 },
        ...(BRAND_LEGAL.bank
          ? [{
              type: "columns" as const,
              columns: [
                { heading: "Bank transfer", lines: [{ text: `Bank ${BRAND_LEGAL.bank.bank}`, size: 9 }, { text: `Account name ${BRAND_LEGAL.bank.accountName}`, size: 9 }, { text: `IBAN ${BRAND_LEGAL.bank.iban}`, size: 9 }, ...(BRAND_LEGAL.bank.swift ? [{ text: `SWIFT ${BRAND_LEGAL.bank.swift}`, size: 9 }] : [])] },
                ...(BRAND_LEGAL.cliqAlias ? [{ heading: "CliQ", lines: [{ text: `Alias ${BRAND_LEGAL.cliqAlias}`, size: 9 }] }] : []),
              ],
            }]
          : [{ type: "paragraph" as const, text: `Bank transfer or CliQ. RIVET sends the account details with each invoice and confirms them on request at ${BRAND_CONTACT.email}.`, size: 9 }]),
        { type: "paragraph", text: `Quote ${input.number} as the payment reference.`, size: 9 },
      ],
    },
    { type: "paragraph", text: "Under the subscription agreement, access may be suspended after 7 days' notice once an invoice is past due.", size: 8.5, color: "#8B887B" },
  ];
  if (input.payment?.reference) blocks.push({ type: "paragraph", text: `Payment reference ${input.payment.reference}.`, size: 8.5, color: "#8B887B" });
  return blocks;
}

export function renderInvoicePdf(input: InvoicePdfInput): Uint8Array {
  return renderPdf(invoicePdfBlocks(input), {
    title: `RIVET invoice ${input.number}`,
    author: "RIVET",
    subject: `${input.customer.name} · ${input.total}`,
    documentLabel: "Invoice",
    runningTitle: "Invoice",
    footer: `${input.number} · RIVET, ${BRAND_CONTACT.city} · ${BRAND_CONTACT.email}`,
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
