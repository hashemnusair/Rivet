/**
 * A tiny, dependency-free PDF writer.
 *
 * RIVET emails the signed subscription agreement as a real PDF, so the file
 * has to be produced on the server. Convex functions run in a web-standard
 * JavaScript runtime with no npm PDF library available, and this module has
 * no Convex imports either, so the browser builds byte-identical files for
 * the "Download PDF" action.
 *
 * Scope is deliberately small: the fourteen standard PDF fonts (no font
 * embedding), WinAnsi text, and JPEG images. That covers a Latin contract
 * with a signature. Text outside WinAnsi, Arabic included, cannot be drawn
 * with a standard font and is replaced with "?"; the app and the email body
 * still show it correctly.
 */

/** A4 in PostScript points. */
export const PDF_PAGE_WIDTH = 595.28;
export const PDF_PAGE_HEIGHT = 841.89;
export const PDF_MARGIN = 56;

export type PdfFont = "regular" | "bold";

export type PdfBlock =
  | { type: "title"; text: string }
  | { type: "meta"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string; font?: PdfFont; size?: number }
  | { type: "rows"; rows: Array<[string, string]> }
  | { type: "rule" }
  | { type: "spacer"; height: number }
  | { type: "image"; jpegDataUrl: string; maxWidth: number; maxHeight: number }
  /** Blocks that must not be split across a page break, such as a signature. */
  | { type: "keep"; blocks: PdfBlock[] };

export interface PdfDocumentOptions {
  title: string;
  author: string;
  subject?: string;
  /** Right-hand footer text; the page number is always on the left. */
  footer?: string;
  createdAt?: Date;
}

// Adobe's published widths for the standard Helvetica faces, in 1/1000 em.
// Only the characters a Latin contract uses are listed; anything else falls
// back to AVERAGE_WIDTH, which makes a line wrap slightly early rather than
// overflow the margin.
const AVERAGE_WIDTH = 556;
const HELVETICA_WIDTHS: Readonly<Record<string, number>> = {
  " ": 278, "!": 278, '"': 355, "#": 556, $: 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333,
  "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278,
  "0": 556, "1": 556, "2": 556, "3": 556, "4": 556, "5": 556, "6": 556, "7": 556, "8": 556, "9": 556,
  ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  "[": 278, "\\": 278, "]": 278, "^": 469, _: 556, "`": 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833,
  n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  "{": 334, "|": 260, "}": 334, "~": 584, "·": 278, "•": 350, "–": 556, "—": 1000,
  "‘": 222, "’": 222, "“": 333, "”": 333,
};
const HELVETICA_BOLD_WIDTHS: Readonly<Record<string, number>> = {
  ...HELVETICA_WIDTHS,
  "!": 333, '"': 474, "'": 238, "(": 333, ")": 333, ",": 278, ".": 278, "/": 278, ":": 333, ";": 333, "?": 611,
  A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556, K: 722, L: 611, M: 833,
  N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889,
  n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
  "‘": 278, "’": 278, "“": 500, "”": 500, "•": 350,
};

/** WinAnsi code points for the punctuation a contract picks up from typography. */
const WIN_ANSI_EXTRAS: Readonly<Record<string, number>> = {
  "€": 128, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149,
  "–": 150, "—": 151, "™": 153, " ": 32,
};

export function widthOf(text: string, font: PdfFont, size: number): number {
  const table = font === "bold" ? HELVETICA_BOLD_WIDTHS : HELVETICA_WIDTHS;
  let total = 0;
  for (const character of text) total += table[character] ?? AVERAGE_WIDTH;
  return (total * size) / 1000;
}

/** WinAnsi bytes; anything a standard font cannot draw becomes "?". */
function encodeWinAnsi(text: string): number[] {
  const bytes: number[] = [];
  for (const character of text) {
    const point = character.codePointAt(0)!;
    const extra = WIN_ANSI_EXTRAS[character];
    if (extra !== undefined) bytes.push(extra);
    else if (point >= 32 && point <= 126) bytes.push(point);
    else if (point >= 160 && point <= 255) bytes.push(point);
    else bytes.push(63);
  }
  return bytes;
}

/** A PDF literal string: escape the delimiters, keep everything else as bytes. */
function pdfString(text: string): number[] {
  const out: number[] = [40];
  for (const byte of encodeWinAnsi(text)) {
    if (byte === 40 || byte === 41 || byte === 92) out.push(92);
    out.push(byte);
  }
  out.push(41);
  return out;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!;
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    out += BASE64_ALPHABET[a >> 2];
    out += BASE64_ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? "=" : BASE64_ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    out += c === undefined ? "=" : BASE64_ALPHABET[c & 63];
  }
  return out;
}

export function decodeBase64(value: string): Uint8Array {
  const clean = value.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let position = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const a = BASE64_ALPHABET.indexOf(clean[index]!);
    const b = BASE64_ALPHABET.indexOf(clean[index + 1] ?? "A");
    const c = BASE64_ALPHABET.indexOf(clean[index + 2] ?? "A");
    const d = BASE64_ALPHABET.indexOf(clean[index + 3] ?? "A");
    bytes[position++] = (a << 2) | (b >> 4);
    if (index + 2 < clean.length) bytes[position++] = ((b & 15) << 4) | (c >> 2);
    if (index + 3 < clean.length) bytes[position++] = ((c & 3) << 6) | d;
  }
  return bytes.subarray(0, position);
}

/**
 * Width and height from a JPEG's frame header. PDF embeds JPEG bytes as they
 * are (DCTDecode), so the dimensions are the only thing that must be read,
 * and they are read here rather than trusted from the browser.
 */
export function readJpegSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    const marker = bytes[offset + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) {
      const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
      return width > 0 && height > 0 ? { width, height } : undefined;
    }
    if (length < 2) return undefined;
    offset += 2 + length;
  }
  return undefined;
}

/** One text run on a baseline; a row draws its label and value as two runs. */
interface Segment { text: string; font: PdfFont; size: number; indent: number }
interface DrawnImage { data: Uint8Array; width: number; height: number; drawWidth: number; drawHeight: number }
type Item =
  | { kind: "line"; segments: Segment[]; baseline: number; height: number }
  | { kind: "rule"; height: number }
  | { kind: "space"; height: number }
  | { kind: "image"; image: DrawnImage; height: number };

const CONTENT_WIDTH = PDF_PAGE_WIDTH - PDF_MARGIN * 2;
const LABEL_WIDTH = 150;

function wrap(text: string, font: PdfFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (widthOf(candidate, font, size) <= maxWidth) { current = candidate; continue; }
      if (current) lines.push(current);
      // An unbreakable run, such as a 64-character fingerprint, is split by
      // character so it never runs past the margin.
      if (widthOf(word, font, size) <= maxWidth) { current = word; continue; }
      let chunk = "";
      for (const character of word) {
        if (widthOf(chunk + character, font, size) > maxWidth) { lines.push(chunk); chunk = character; }
        else chunk += character;
      }
      current = chunk;
    }
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}

function line(text: string, font: PdfFont, size: number, leading: number, indent = 0): Item {
  return { kind: "line", segments: [{ text, font, size, indent }], baseline: size, height: leading };
}

function layoutImage(dataUrl: string, maxWidth: number, maxHeight: number): DrawnImage | undefined {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || !/^data:image\/jpe?g;base64,/i.test(dataUrl)) return undefined;
  const data = decodeBase64(dataUrl.slice(comma + 1));
  const size = readJpegSize(data);
  if (!size) return undefined;
  const scale = Math.min(maxWidth / size.width, maxHeight / size.height, 1);
  return { data, width: size.width, height: size.height, drawWidth: size.width * scale, drawHeight: size.height * scale };
}

function itemsFor(block: PdfBlock): Item[] {
  switch (block.type) {
    case "title":
      return [...wrap(block.text, "bold", 18, CONTENT_WIDTH).map((text) => line(text, "bold", 18, 23)), { kind: "space", height: 4 }];
    case "meta":
      return wrap(block.text, "regular", 9, CONTENT_WIDTH).map((text) => line(text, "regular", 9, 13));
    case "heading":
      return [{ kind: "space", height: 8 }, ...wrap(block.text, "bold", 11.5, CONTENT_WIDTH).map((text) => line(text, "bold", 11.5, 15))];
    case "paragraph": {
      const font = block.font ?? "regular";
      const size = block.size ?? 10;
      return [...wrap(block.text, font, size, CONTENT_WIDTH).map((text) => line(text, font, size, size * 1.45)), { kind: "space", height: 5 }];
    }
    case "rows": {
      const items: Item[] = [];
      for (const [label, value] of block.rows) {
        const labelLines = wrap(label, "bold", 9, LABEL_WIDTH - 12);
        const valueLines = wrap(value, "regular", 10, CONTENT_WIDTH - LABEL_WIDTH);
        // Label and value share a baseline and wrap independently, so a row
        // is as tall as its longer column.
        for (let index = 0; index < Math.max(labelLines.length, valueLines.length); index += 1) {
          const segments: Segment[] = [];
          const labelText = labelLines[index];
          const valueText = valueLines[index];
          if (labelText) segments.push({ text: labelText, font: "bold", size: 9, indent: 0 });
          if (valueText) segments.push({ text: valueText, font: "regular", size: 10, indent: LABEL_WIDTH });
          items.push({ kind: "line", segments, baseline: 10, height: 14 });
        }
      }
      return items;
    }
    case "rule":
      return [{ kind: "rule", height: 12 }];
    case "spacer":
      return [{ kind: "space", height: block.height }];
    case "image": {
      const image = layoutImage(block.jpegDataUrl, block.maxWidth, block.maxHeight);
      return image ? [{ kind: "image", image, height: image.drawHeight + 6 }] : [];
    }
    case "keep":
      return block.blocks.flatMap(itemsFor);
  }
}

function bytes(text: string): number[] {
  const out: number[] = [];
  for (const character of text) out.push(character.codePointAt(0)! & 0xff);
  return out;
}

/** Render the blocks into a complete PDF file. */
export function renderPdf(blocks: PdfBlock[], options: PdfDocumentOptions): Uint8Array {
  const pages: number[][] = [];
  const images: DrawnImage[] = [];
  const bottom = PDF_MARGIN + 26;
  let content: number[] = [];
  let cursor = PDF_PAGE_HEIGHT - PDF_MARGIN;

  const newPage = () => { pages.push(content); content = []; cursor = PDF_PAGE_HEIGHT - PDF_MARGIN; };

  const draw = (item: Item) => {
    if (item.kind === "line") {
      cursor -= item.baseline;
      for (const segment of item.segments) {
        if (!segment.text) continue;
        content.push(...bytes(`BT /${segment.font === "bold" ? "F2" : "F1"} ${segment.size} Tf 1 0 0 1 ${(PDF_MARGIN + segment.indent).toFixed(2)} ${cursor.toFixed(2)} Tm `));
        content.push(...pdfString(segment.text));
        content.push(...bytes(" Tj ET\n"));
      }
      cursor -= item.height - item.baseline;
      return;
    }
    if (item.kind === "rule") {
      cursor -= item.height / 2;
      content.push(...bytes(`0.82 0.81 0.78 RG 0.7 w ${PDF_MARGIN} ${cursor.toFixed(2)} m ${(PDF_PAGE_WIDTH - PDF_MARGIN).toFixed(2)} ${cursor.toFixed(2)} l S\n`));
      cursor -= item.height / 2;
      return;
    }
    if (item.kind === "image") {
      cursor -= item.image.drawHeight;
      const index = images.push(item.image) - 1;
      content.push(...bytes(`q ${item.image.drawWidth.toFixed(2)} 0 0 ${item.image.drawHeight.toFixed(2)} ${PDF_MARGIN} ${cursor.toFixed(2)} cm /Im${index} Do Q\n`));
      cursor -= 6;
      return;
    }
    cursor -= item.height;
  };

  const fits = (height: number) => cursor - height >= bottom;

  for (const block of blocks) {
    const items = itemsFor(block);
    if (items.length === 0) continue;
    if (block.type === "keep" || block.type === "image") {
      const total = items.reduce((sum, item) => sum + item.height, 0);
      if (!fits(total) && cursor < PDF_PAGE_HEIGHT - PDF_MARGIN) newPage();
    }
    for (const item of items) {
      // A heading alone at the foot of a page reads as a mistake; move it and
      // its first line together.
      if (!fits(item.height)) newPage();
      draw(item);
    }
  }
  pages.push(content);

  const footerFor = (index: number, total: number): number[] => {
    const out: number[] = [];
    const y = PDF_MARGIN - 12;
    out.push(...bytes(`0.82 0.81 0.78 RG 0.7 w ${PDF_MARGIN} ${(y + 14).toFixed(2)} m ${(PDF_PAGE_WIDTH - PDF_MARGIN).toFixed(2)} ${(y + 14).toFixed(2)} l S\n`));
    out.push(...bytes(`BT /F1 8 Tf 1 0 0 1 ${PDF_MARGIN} ${y.toFixed(2)} Tm `));
    out.push(...pdfString(`Page ${index + 1} of ${total}`));
    out.push(...bytes(" Tj ET\n"));
    if (options.footer) {
      const width = widthOf(options.footer, "regular", 8);
      out.push(...bytes(`BT /F1 8 Tf 1 0 0 1 ${(PDF_PAGE_WIDTH - PDF_MARGIN - width).toFixed(2)} ${y.toFixed(2)} Tm `));
      out.push(...pdfString(options.footer));
      out.push(...bytes(" Tj ET\n"));
    }
    return out;
  };

  const objects: number[][] = [];
  const add = (body: number[]) => objects.push(body) - 1;
  // Objects are written in order: catalog, pages, two fonts, one per image,
  // then a page and its content stream per page. /Kids must name the page
  // objects, so the first page lands right after the last image.
  const pageObjectIds = pages.map((_, index) => 5 + images.length + index * 2);
  const created = options.createdAt ?? new Date();
  const stamp = `D:${created.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`;

  add(bytes("<< /Type /Catalog /Pages 2 0 R >>"));
  add(bytes(`<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`));
  add(bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  add(bytes("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"));
  for (const image of images) {
    const header = bytes(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>\nstream\n`);
    add([...header, ...image.data, ...bytes("\nendstream")]);
  }
  const resources = `<< /Font << /F1 3 0 R /F2 4 0 R >>${images.length > 0 ? ` /XObject << ${images.map((_, index) => `/Im${index} ${5 + index} 0 R`).join(" ")} >>` : ""} >>`;
  pages.forEach((page, index) => {
    const stream = [...page, ...footerFor(index, pages.length)];
    add(bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources ${resources} /Contents ${pageObjectIds[index]! + 1} 0 R >>`));
    add([...bytes(`<< /Length ${stream.length} >>\nstream\n`), ...stream, ...bytes("\nendstream")]);
  });
  const infoId = objects.length + 1;
  add([
    ...bytes("<< /Title "), ...pdfString(options.title),
    ...bytes(" /Author "), ...pdfString(options.author),
    ...bytes(" /Subject "), ...pdfString(options.subject ?? options.title),
    ...bytes(" /Producer "), ...pdfString("RIVET"),
    ...bytes(" /CreationDate "), ...pdfString(stamp),
    ...bytes(" >>"),
  ]);

  const file: number[] = [...bytes("%PDF-1.4\n%âãÏÓ\n")];
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(file.length);
    file.push(...bytes(`${index + 1} 0 obj\n`), ...body, ...bytes("\nendobj\n"));
  });
  const xref = file.length;
  file.push(...bytes(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  for (const offset of offsets) file.push(...bytes(`${offset.toString().padStart(10, "0")} 00000 n \n`));
  file.push(...bytes(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return Uint8Array.from(file);
}
