/**
 * A generic RIVET document as a PDF: the privacy policy, the terms, a
 * statement. Same page furniture as the agreement and the invoice, so the
 * file matches what the app shows on its document sheet.
 */
import { renderPdf, type PdfBlock } from "./pdfDocument";
import { RIVET_GLYPH_JPEG, RIVET_LOCKUP_JPEG } from "./brandAssets";
import { BRAND_CONTACT, brandLegalLine } from "./brandTokens";

export interface DocumentPdfOptions {
  locale?: "en" | "ar";
  /** Uppercase technical label: PRIVACY POLICY, TERMS OF SERVICE. */
  label: string;
  title: string;
  meta: string;
  /** Footer reference; the version when a document has no number. */
  reference: string;
  chip?: { label: string; tone: "success" | "warning" | "danger" | "muted" };
}

export function renderDocumentPdf(options: DocumentPdfOptions, body: PdfBlock[]): Uint8Array {
  return renderPdf([{ type: "title", text: options.title, chip: options.chip }, { type: "meta", text: options.meta }, { type: "spacer", height: 4 }, ...body], {
    title: `RIVET ${options.title}`,
    locale: options.locale,
    author: "RIVET",
    subject: options.meta,
    documentLabel: options.label,
    runningTitle: options.title,
    footer: `${options.reference} · RIVET, ${options.locale === "ar" ? BRAND_CONTACT.cityAr : BRAND_CONTACT.city}`,
    footerPlaceholder: brandLegalLine(options.locale) || undefined,
    lockupJpeg: RIVET_LOCKUP_JPEG,
    glyphJpeg: RIVET_GLYPH_JPEG,
  });
}

export function documentPdfFilename(title: string, version: string): string {
  const slug = `${title} ${version.split(" ·")[0] ?? ""}`.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return `RIVET-${slug}.pdf`;
}
