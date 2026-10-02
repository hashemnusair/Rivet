import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PrivacyPolicy } from "./privacy-policy";
import { TermsOfService } from "./terms-of-service";
import { documentBlocksFromElement } from "./document-pdf";
import { documentPdfFilename, renderDocumentPdf } from "../../../convex/documentPdf";

const text = (bytes: Uint8Array) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

describe("documents as PDF, built from the page", () => {
  it("reads the privacy policy back as numbered headings, paragraphs, lists, tables and the contact rows", () => {
    const { container } = render(<PrivacyPolicy />);
    const root = container.querySelector<HTMLElement>('[data-document-body="privacy-policy"]')!;
    const blocks = documentBlocksFromElement(root);
    const headings = blocks.filter((block) => block.type === "heading").map((block) => (block as { text: string }).text);
    expect(headings[0]).toBe("01. Who we are");
    expect(headings).toHaveLength(15);
    expect(blocks.some((block) => block.type === "table" && (block as { head: string[] }).head.join("|") === "Record|Kept for")).toBe(true);
    expect(blocks.some((block) => block.type === "paragraph" && (block as { text: string }).text.startsWith("•  Visitors:"))).toBe(true);
    expect(blocks.some((block) => block.type === "rows" && (block as { rows: Array<{ label: string }> }).rows.some((row) => row.label === "WhatsApp"))).toBe(true);
    // Navigation and controls never reach the file.
    expect(JSON.stringify(blocks)).not.toContain("Download PDF");
    expect(JSON.stringify(blocks)).not.toContain("Contents");

    const pdf = text(renderDocumentPdf({ label: "Privacy policy", title: "Privacy policy", meta: "Version 1.0 · 3 September 2026", reference: "Version 1.0" }, blocks));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("(PRIVACY POLICY) Tj");
    expect(pdf).toContain("(01. Who we are) Tj");
    expect(pdf).toContain("(Kept for) Tj");
    expect([...pdf.matchAll(/\/Type \/Page[^s]/g)].length).toBeGreaterThan(2);
    expect(documentPdfFilename("Privacy policy", "1.0 · 3 September 2026")).toBe("RIVET-privacy-policy-1-0.pdf");
  });

  it("does the same for the terms, including the processing addendum", () => {
    const { container } = render(<TermsOfService />);
    const blocks = documentBlocksFromElement(container.querySelector<HTMLElement>('[data-document-body="terms-of-service"]')!);
    const headings = blocks.filter((block) => block.type === "heading").map((block) => (block as { text: string }).text);
    expect(headings).toHaveLength(19);
    expect(headings.some((heading) => /Data and the processing addendum/.test(heading))).toBe(true);
    expect(JSON.stringify(blocks)).toContain("Electronic Transactions Law No. 15 of 2015");
  });
});
