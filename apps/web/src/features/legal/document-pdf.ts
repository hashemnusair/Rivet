"use client";

import { encodeBase64, type PdfBlock } from "../../../convex/pdfDocument";
import { documentPdfFilename, renderDocumentPdf, type DocumentPdfOptions } from "../../../convex/documentPdf";

const text = (node: Node): string => (node.textContent ?? "").replace(/\s+/g, " ").trim();

/**
 * Read the rendered document back as PDF blocks, so the file says exactly
 * what the page says: numbered headings, paragraphs, lists, tables and the
 * label/value rows. Navigation and controls are skipped.
 */
export function documentBlocksFromElement(root: HTMLElement): PdfBlock[] {
  const blocks: PdfBlock[] = [];
  const walk = (element: Element) => {
    for (const child of Array.from(element.children)) {
      if (child.closest("nav, button, [data-pdf-skip]") && child.tagName !== "NAV") { if (child.tagName === "NAV" || child.tagName === "BUTTON") continue; }
      const tag = child.tagName;
      if (tag === "NAV" || tag === "BUTTON" || child.hasAttribute("data-pdf-skip")) continue;
      if (tag === "H2") blocks.push({ type: "heading", text: text(child) });
      else if (tag === "H3") blocks.push({ type: "paragraph", text: text(child), font: "bold", size: 10 });
      else if (tag === "P") { const value = text(child); if (value) blocks.push({ type: "paragraph", text: value }); }
      else if (tag === "UL" || tag === "OL") {
        Array.from(child.querySelectorAll(":scope > li")).forEach((item, index) => blocks.push({ type: "paragraph", text: `${tag === "OL" ? `${index + 1}.` : "•"}  ${text(item)}` }));
      } else if (tag === "TABLE") {
        const head = Array.from(child.querySelectorAll("thead th")).map(text);
        const rows = Array.from(child.querySelectorAll("tbody tr")).map((row) => Array.from(row.querySelectorAll("td")).map(text));
        const columns = Math.max(head.length, ...rows.map((row) => row.length), 1);
        const width = 483 / columns;
        blocks.push({ type: "table", head: head.length ? head : new Array(columns).fill(""), rows, widths: new Array(columns).fill(width) });
      } else if (tag === "DL") {
        const rows: Array<{ label: string; value: string }> = [];
        const terms = Array.from(child.querySelectorAll("dt"));
        const values = Array.from(child.querySelectorAll("dd"));
        terms.forEach((term, index) => rows.push({ label: text(term), value: text(values[index] ?? term) }));
        blocks.push({ type: "rows", rows });
      } else walk(child);
    }
  };
  walk(root);
  return blocks;
}

/** Build the PDF from the document on the page and save it. */
export function downloadDocumentPdf(options: DocumentPdfOptions & { version: string }, root: HTMLElement): void {
  const bytes = renderDocumentPdf(options, documentBlocksFromElement(root));
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = documentPdfFilename(options.title, options.version);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** The same bytes as base64, for tests and for anything that mails them. */
export function documentPdfBase64(options: DocumentPdfOptions, root: HTMLElement): string {
  return encodeBase64(renderDocumentPdf(options, documentBlocksFromElement(root)));
}
