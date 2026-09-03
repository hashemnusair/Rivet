import { describe, expect, it } from "vitest";
import { decodeBase64, encodeBase64, readJpegSize, renderPdf, widthOf, PDF_PAGE_WIDTH, PDF_MARGIN, type PdfBlock } from "./pdfDocument";

/** SOI, APP0, a frame header of the given size, then EOI. Enough to embed. */
function jpegBytes(width: number, height: number, padding = 64): Uint8Array {
  const frame = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, ...frame, 0xff, 0xda, ...new Array(padding).fill(0x7f), 0xff, 0xd9]);
}

function text(pdf: Uint8Array): string {
  return Array.from(pdf, (byte) => String.fromCharCode(byte)).join("");
}

describe("pdf writer", () => {
  it("round-trips base64 for every byte value", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
    expect(encodeBase64(Uint8Array.from([77]))).toBe("TQ==");
    expect(encodeBase64(Uint8Array.from([77, 97]))).toBe("TWE=");
    expect(decodeBase64("TWFu")).toEqual(Uint8Array.from([77, 97, 110]));
  });

  it("reads JPEG dimensions from the frame header and refuses anything else", () => {
    expect(readJpegSize(jpegBytes(200, 50))).toEqual({ width: 200, height: 50 });
    expect(readJpegSize(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeUndefined();
    expect(readJpegSize(Uint8Array.from([0xff, 0xd8]))).toBeUndefined();
  });

  it("measures text with real Helvetica widths so wrapping respects the margin", () => {
    expect(widthOf("iii", "regular", 10)).toBeLessThan(widthOf("WWW", "regular", 10));
    expect(widthOf("Signed", "bold", 10)).toBeGreaterThan(widthOf("Signed", "regular", 10));
    expect(widthOf("", "regular", 10)).toBe(0);
  });

  it("writes a structurally complete file with the text, fonts and trailer", () => {
    const pdf = renderPdf([
      { type: "title", text: "RIVET subscription agreement" },
      { type: "meta", text: "Version 1.1" },
      { type: "rows", rows: [["Gym", "Iron House Fitness"], ["Document fingerprint", "a".repeat(64)]] },
      { type: "rule" },
      { type: "paragraph", text: "Fees are invoiced in advance." },
    ], { title: "Agreement", author: "RIVET", footer: "RVT-1" });
    const body = text(pdf);
    expect(body.startsWith("%PDF-1.4")).toBe(true);
    expect(body.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(body).toContain("/Type /Catalog");
    expect(body).toContain("/BaseFont /Helvetica-Bold");
    expect(body).toContain("(RIVET subscription agreement) Tj");
    expect(body).toContain("(Iron House Fitness) Tj");
    expect(body).toContain("(Page 1 of 1) Tj");
    // Every /Kids reference must name a real page object. A viewer refuses the
    // whole file when one points at a font or an image instead.
    const kids = [...body.match(/\/Kids \[([^\]]+)\]/)![1]!.matchAll(/(\d+) 0 R/g)].map((match) => Number(match[1]));
    expect(kids.length).toBeGreaterThan(0);
    for (const id of kids) {
      const start = body.indexOf(`\n${id} 0 obj\n`);
      expect(start).toBeGreaterThan(0);
      expect(body.slice(start, start + 200)).toContain("/Type /Page ");
    }
    // The xref offsets must point at the "N 0 obj" headers or no reader opens it.
    const startxref = Number(body.slice(body.lastIndexOf("startxref") + 9).trim().split("\n")[0]);
    expect(body.slice(startxref, startxref + 4)).toBe("xref");
    for (const [, offset] of body.slice(startxref).matchAll(/^(\d{10}) 00000 n/gm)) {
      expect(body.slice(Number(offset)).startsWith(`${body.slice(Number(offset)).split(" ")[0]} 0 obj`)).toBe(true);
    }
  });

  it("escapes PDF delimiters and replaces characters a standard font cannot draw", () => {
    const body = text(renderPdf([{ type: "paragraph", text: "Forge (Amman) \\ نادي" }], { title: "t", author: "RIVET" }));
    expect(body).toContain("(Forge \\(Amman\\) \\\\ ????) Tj");
  });

  it("breaks long documents into pages, numbers them, and keeps a group together", () => {
    const paragraphs: PdfBlock[] = Array.from({ length: 60 }, (_, index) => ({ type: "paragraph", text: `Clause ${index}. ${"word ".repeat(40)}` }));
    const body = text(renderPdf([...paragraphs, { type: "keep", blocks: [{ type: "heading", text: "Signatures" }, { type: "paragraph", text: "For the Customer" }] }], { title: "t", author: "RIVET" }));
    const pages = [...body.matchAll(/\/Type \/Page[^s]/g)].length;
    expect(pages).toBeGreaterThan(2);
    const kids = [...body.match(/\/Kids \[([^\]]+)\]/)![1]!.matchAll(/(\d+) 0 R/g)].map((match) => Number(match[1]));
    expect(kids).toHaveLength(pages);
    for (const id of kids) expect(body.slice(body.indexOf(`\n${id} 0 obj\n`), body.indexOf(`\n${id} 0 obj\n`) + 200)).toContain("/Type /Page ");
    expect(body).toContain(`(Page ${pages} of ${pages}) Tj`);
    // Every line starts at the left margin or the row indent, never beyond it.
    for (const [, x] of body.matchAll(/1 0 0 1 (\d+\.\d+) \d+\.\d+ Tm/g)) {
      expect(Number(x)).toBeGreaterThanOrEqual(PDF_MARGIN);
      expect(Number(x)).toBeLessThan(PDF_PAGE_WIDTH - PDF_MARGIN);
    }
  });

  it("embeds a JPEG as an image object and skips an image it cannot read", () => {
    const jpeg = `data:image/jpeg;base64,${encodeBase64(jpegBytes(400, 100))}`;
    const body = text(renderPdf([{ type: "image", jpegDataUrl: jpeg, maxWidth: 240, maxHeight: 90 }], { title: "t", author: "RIVET" }));
    expect(body).toContain("/Subtype /Image /Width 400 /Height 100");
    expect(body).toContain("/Filter /DCTDecode");
    expect(body).toContain("/XObject << /Im0");
    expect(body).toMatch(/q 240\.00 0 0 60\.00 56 \d+\.\d+ cm \/Im0 Do Q/);
    const missing = text(renderPdf([{ type: "image", jpegDataUrl: "data:image/png;base64,AAAA", maxWidth: 10, maxHeight: 10 }], { title: "t", author: "RIVET" }));
    expect(missing).not.toContain("/Subtype /Image");
  });
});
