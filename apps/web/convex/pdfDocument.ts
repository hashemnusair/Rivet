/**
 * A tiny, dependency-free PDF writer.
 *
 * RIVET emails the signed subscription agreement as a real PDF, so the file
 * has to be produced on the server. Convex functions run in a web-standard
 * JavaScript runtime with no npm PDF library available, and this module has
 * no Convex imports either, so the browser builds byte-identical files for
 * the "Download PDF" action.
 *
 * Scope is deliberately small: three embedded TrueType faces (Manrope
 * regular and semibold, IBM Plex Mono), WinAnsi text, and JPEG images. That
 * covers a Latin contract with a signature in the identity's own type. Text
 * outside WinAnsi, Arabic included, is replaced with "?"; the app and the
 * email body still show it correctly.
 */

/** A4 in PostScript points. */
export const PDF_PAGE_WIDTH = 595.28;
export const PDF_PAGE_HEIGHT = 841.89;
export const PDF_MARGIN = 56;
/** Millimetres to points, for the measurements the identity system gives in mm. */
export const mm = (value: number): number => value * 2.834645669;

export type PdfFont = "regular" | "bold" | "mono";

export type PdfTone = "success" | "warning" | "danger" | "muted";

export interface PdfRow {
  label: string;
  value: string;
  /** Figures a reader compares are set bold. */
  strong?: boolean;
  muted?: boolean;
}

export interface PdfColumn {
  heading?: string;
  lines: Array<{ text: string; font?: PdfFont; size?: number; color?: string }>;
}

export type PdfBlock =
  | { type: "title"; text: string; chip?: { label: string; tone: PdfTone } }
  | { type: "meta"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string; font?: PdfFont; size?: number; color?: string }
  | { type: "rows"; rows: PdfRow[]; labelWidth?: number }
  /** Side-by-side blocks of lines: parties, or a meta grid. */
  | { type: "columns"; columns: PdfColumn[]; gap?: number }
  /** A ruled table: the invoice's line items. */
  | { type: "table"; head: string[]; rows: string[][]; widths: number[]; alignEnd?: number[] }
  /** Right-aligned figures under a table. */
  | { type: "totals"; rows: Array<{ label: string; value: string; strong?: boolean; muted?: boolean }>; width?: number }
  /** A sunken panel, for payment instructions. */
  | { type: "panel"; blocks: PdfBlock[] }
  /** A hairline box, for a drawn signature. */
  | { type: "frame"; width: number; height: number; jpegDataUrl?: string; caption?: string }
  | { type: "rule"; strong?: boolean }
  | { type: "spacer"; height: number }
  /** Start the next block on a new page. */
  | { type: "pagebreak" }
  | { type: "image"; jpegDataUrl: string; maxWidth: number; maxHeight: number }
  /** Blocks that must not be split across a page break, such as a signature. */
  | { type: "keep"; blocks: PdfBlock[] };

export interface PdfDocumentOptions {
  title: string;
  author: string;
  subject?: string;
  /** Right-hand footer text; the page number is always on the left. */
  footer?: string;
  /** A second, fainter footer line: the facts RIVET has not registered yet. */
  footerPlaceholder?: string;
  /** Uppercase technical label at the end of the first-page header. */
  documentLabel?: string;
  /** Shown in the running header of every page after the first. */
  runningTitle?: string;
  /** The lockup, drawn once at the start of page 1. */
  lockupJpeg?: string;
  /** The glyph, drawn in every running header. */
  glyphJpeg?: string;
  createdAt?: Date;
}

import { PDF_FACES, type PdfFontFace } from "./pdfFonts";

const FACE_KEYS: Record<PdfFont, "regular" | "bold" | "mono"> = { regular: "regular", bold: "bold", mono: "mono" };
const FONT_RESOURCE: Record<PdfFont, string> = { regular: "F1", bold: "F2", mono: "F3" };

/** WinAnsi code points for the punctuation a contract picks up from typography. */
const WIN_ANSI_EXTRAS: Readonly<Record<string, number>> = {
  "€": 128, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149,
  "–": 150, "—": 151, "™": 153, " ": 32,
};

/** Measured from the embedded face, so wrapping is exact for the type used. */
export function widthOf(text: string, font: PdfFont, size: number): number {
  const face: PdfFontFace = PDF_FACES[FACE_KEYS[font]];
  let total = 0;
  for (const byte of encodeWinAnsi(text)) total += face.widths[byte - 32] ?? face.widths[31] ?? 500;
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
interface Segment { text: string; font: PdfFont; size: number; indent: number; color?: string; alignEnd?: number }
interface DrawnImage { data: Uint8Array; width: number; height: number; drawWidth: number; drawHeight: number }
type Item =
  | { kind: "line"; segments: Segment[]; baseline: number; height: number; chip?: { label: string; tone: PdfTone } }
  | { kind: "rule"; height: number; strong?: boolean }
  | { kind: "space"; height: number }
  | { kind: "image"; image: DrawnImage; height: number }
  | { kind: "frame"; width: number; height: number; image?: DrawnImage }
  | { kind: "panel"; items: Item[]; height: number }
  | { kind: "pagebreak"; height: number };

const CONTENT_WIDTH = PDF_PAGE_WIDTH - PDF_MARGIN * 2;
/** 52mm, as the identity system sets the label column. */
const LABEL_WIDTH = mm(52);
const HAIRLINE = "#E3E1D6";
const HAIRLINE_STRONG = "#D2CFC2";
const INK = "#1B1A15";
const INK_MUTED = "#8B887B";
const INK_DISABLED = "#B6B3A6";
const SUNKEN = "#EDECE5";
const TONES: Record<PdfTone, { ink: string; background: string }> = {
  success: { ink: "#176E44", background: "#E6F1EA" },
  warning: { ink: "#96620A", background: "#F7EDD9" },
  danger: { ink: "#AD1B22", background: "#FAE9E9" },
  muted: { ink: INK_MUTED, background: SUNKEN },
};
const CHIP_HEIGHT = 16.5;
const CHIP_PADDING = 6;
const CHIP_SIZE = 8.5;

/** "#1B1A15" as the PDF's 0-1 RGB triple. */
function rgb(hex: string): string {
  const value = hex.replace("#", "");
  const parts = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  return parts.map((part) => part.toFixed(3)).join(" ");
}

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

function line(text: string, font: PdfFont, size: number, leading: number, indent = 0, color?: string): Item {
  return { kind: "line", segments: [{ text, font, size, indent, color }], baseline: size, height: leading };
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
    case "title": {
      const items: Item[] = wrap(block.text, "bold", 20, CONTENT_WIDTH - (block.chip ? 170 : 0)).map((text) => line(text, "bold", 20, 25));
      const first = items[0];
      if (block.chip && first?.kind === "line") first.chip = block.chip;
      items.push({ kind: "space", height: 4 });
      return items;
    }
    case "meta":
      return wrap(block.text, "mono", 8.5, CONTENT_WIDTH).map((text) => line(text, "mono", 8.5, 13, 0, INK_MUTED));
    case "heading":
      return [{ kind: "space", height: 8 }, ...wrap(block.text, "bold", 11.5, CONTENT_WIDTH).map((text) => line(text, "bold", 11.5, 15))];
    case "paragraph": {
      const font = block.font ?? "regular";
      const size = block.size ?? 10;
      return [...wrap(block.text, font, size, CONTENT_WIDTH).map((text) => line(text, font, size, size * 1.45, 0, block.color)), { kind: "space", height: 5 }];
    }
    case "rows": {
      const labelWidth = block.labelWidth ?? LABEL_WIDTH;
      const items: Item[] = [];
      for (const row of block.rows) {
        const labelLines = wrap(row.label, "bold", 9, labelWidth - 12);
        const valueLines = wrap(row.value, "regular", 10, CONTENT_WIDTH - labelWidth);
        // Label and value share a baseline and wrap independently, so a row
        // is as tall as its longer column.
        for (let index = 0; index < Math.max(labelLines.length, valueLines.length); index += 1) {
          const segments: Segment[] = [];
          const labelText = labelLines[index];
          const valueText = valueLines[index];
          if (labelText) segments.push({ text: labelText, font: "bold", size: 9, indent: 0, color: INK_MUTED });
          if (valueText) segments.push({ text: valueText, font: row.strong ? "bold" : "regular", size: 10, indent: labelWidth, color: row.muted ? INK_DISABLED : undefined });
          items.push({ kind: "line", segments, baseline: 10, height: 14 });
        }
      }
      return items;
    }
    case "columns": {
      const gap = block.gap ?? 24;
      const width = (CONTENT_WIDTH - gap * (block.columns.length - 1)) / block.columns.length;
      const laid = block.columns.map((column) => {
        const rendered: Array<{ text: string; font: PdfFont; size: number; color?: string }> = [];
        if (column.heading) for (const text of wrap(column.heading, "bold", 9, width)) rendered.push({ text, font: "bold", size: 9, color: INK_MUTED });
        for (const entry of column.lines) {
          const font = entry.font ?? "regular";
          const size = entry.size ?? 10;
          for (const text of wrap(entry.text, font, size, width)) rendered.push({ text, font, size, color: entry.color });
        }
        return rendered;
      });
      const rows = Math.max(...laid.map((column) => column.length));
      const items: Item[] = [];
      for (let index = 0; index < rows; index += 1) {
        const segments: Segment[] = [];
        laid.forEach((column, columnIndex) => {
          const entry = column[index];
          if (entry) segments.push({ text: entry.text, font: entry.font, size: entry.size, indent: columnIndex * (width + gap), color: entry.color });
        });
        items.push({ kind: "line", segments, baseline: 10, height: 14 });
      }
      items.push({ kind: "space", height: 6 });
      return items;
    }
    case "table": {
      const items: Item[] = [];
      const offsets = block.widths.map((_, index) => block.widths.slice(0, index).reduce((sum, value) => sum + value, 0));
      const cell = (values: string[], font: PdfFont, size: number, color?: string): Item[] => {
        const wrapped = values.map((value, index) => wrap(value, font, size, block.widths[index]! - 8));
        const height = Math.max(...wrapped.map((lines) => lines.length));
        const out: Item[] = [];
        for (let index = 0; index < height; index += 1) {
          const segments: Segment[] = [];
          wrapped.forEach((lines, column) => {
            const text = lines[index];
            if (!text) return;
            const alignEnd = block.alignEnd?.includes(column);
            const indent = alignEnd ? offsets[column]! + block.widths[column]! - widthOf(text, font, size) : offsets[column]!;
            segments.push({ text, font, size, indent, color });
          });
          out.push({ kind: "line", segments, baseline: size, height: size * 1.45 });
        }
        return out;
      };
      items.push(...cell(block.head, "bold", 9, INK_MUTED));
      items.push({ kind: "rule", height: 8, strong: true });
      block.rows.forEach((row, index) => {
        items.push(...cell(row, "regular", 10));
        if (index < block.rows.length - 1) items.push({ kind: "rule", height: 10 });
      });
      items.push({ kind: "rule", height: 10, strong: true });
      return items;
    }
    case "totals": {
      const width = block.width ?? 225;
      const indent = CONTENT_WIDTH - width;
      return block.rows.map((row) => {
        const size = row.strong ? 20 : 10;
        const font: PdfFont = row.strong ? "bold" : "regular";
        return {
          kind: "line" as const,
          segments: [
            { text: row.label, font: "bold" as PdfFont, size: row.strong ? 10 : 9, indent, color: INK_MUTED },
            { text: row.value, font, size, indent: CONTENT_WIDTH - widthOf(row.value, font, size), color: row.muted ? INK_DISABLED : undefined },
          ],
          baseline: size,
          height: size * 1.6,
        };
      });
    }
    case "panel": {
      const items = block.blocks.flatMap(itemsFor);
      const height = items.reduce((sum, item) => sum + item.height, 0) + 20;
      return [{ kind: "panel", items, height }];
    }
    case "frame": {
      const image = block.jpegDataUrl ? layoutImage(block.jpegDataUrl, block.width - 16, block.height - 16) : undefined;
      const items: Item[] = [{ kind: "frame", width: block.width, height: block.height, image }];
      if (block.caption) items.push(...wrap(block.caption, "regular", 8.5, CONTENT_WIDTH).map((text) => line(text, "regular", 8.5, 12, 0, INK_MUTED)));
      return items;
    }
    case "rule":
      return [{ kind: "rule", height: 12, strong: block.strong }];
    case "spacer":
      return [{ kind: "space", height: block.height }];
    case "pagebreak":
      return [{ kind: "pagebreak", height: 0 }];
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
  // The footer sits 42pt from the foot of the page; content stops above it.
  const FOOTER_RULE = 42;
  const bottom = PDF_MARGIN;
  let content: number[] = [];
  let cursor = PDF_PAGE_HEIGHT - PDF_MARGIN;
  let indent = 0;

  const push = (text: string) => content.push(...bytes(text));
  const stroke = (y: number, colour = HAIRLINE) => push(`${rgb(colour)} RG 0.7 w ${PDF_MARGIN} ${y.toFixed(2)} m ${(PDF_PAGE_WIDTH - PDF_MARGIN).toFixed(2)} ${y.toFixed(2)} l S\n`);
  const text = (value: string, x: number, y: number, font: PdfFont, size: number, colour = INK, tracking = 0) => {
    if (!value) return;
    push(`${rgb(colour)} rg BT /${FONT_RESOURCE[font]} ${size} Tf ${tracking ? `${tracking.toFixed(2)} Tc ` : ""}1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm `);
    content.push(...pdfString(value));
    push(` Tj ET\n${tracking ? "BT 0 Tc ET\n" : ""}`);
  };
  const box = (x: number, y: number, width: number, height: number, fill?: string, border?: string) => {
    if (fill) push(`${rgb(fill)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f\n`);
    if (border) push(`${rgb(border)} RG 0.7 w ${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re S\n`);
  };
  const image = (drawn: DrawnImage, x: number, y: number) => {
    const index = images.push(drawn) - 1;
    push(`q ${drawn.drawWidth.toFixed(2)} 0 0 ${drawn.drawHeight.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im${index} Do Q\n`);
  };
  const chip = (label: string, tone: PdfTone, baseline: number) => {
    const colours = TONES[tone];
    const width = widthOf(label, "bold", CHIP_SIZE) + CHIP_PADDING * 2;
    const x = PDF_PAGE_WIDTH - PDF_MARGIN - width;
    box(x, baseline - 4.5, width, CHIP_HEIGHT, colours.background);
    text(label, x + CHIP_PADDING, baseline, "bold", CHIP_SIZE, colours.ink);
  };

  /** Page furniture. Page 1 carries the lockup; later pages carry the glyph. */
  const startPage = (index: number) => {
    content = [];
    cursor = PDF_PAGE_HEIGHT - PDF_MARGIN;
    if (index === 0) {
      const lockup = options.lockupJpeg ? layoutImage(options.lockupJpeg, mm(34), 40) : undefined;
      const height = lockup?.drawHeight ?? 0;
      if (lockup) image(lockup, PDF_MARGIN, cursor - height);
      if (options.documentLabel) {
        const label = options.documentLabel.toUpperCase();
        const width = widthOf(label, "mono", 8) + label.length * 0.48;
        text(label, PDF_PAGE_WIDTH - PDF_MARGIN - width, cursor - height + 4, "mono", 8, INK_MUTED, 0.48);
      }
      cursor -= Math.max(height, 12) + 10;
      stroke(cursor);
      cursor -= 22;
      return;
    }
    const glyph = options.glyphJpeg ? layoutImage(options.glyphJpeg, 20, mm(6)) : undefined;
    const height = glyph?.drawHeight ?? 0;
    if (glyph) image(glyph, PDF_MARGIN, cursor - height);
    if (options.runningTitle) text(options.runningTitle, PDF_MARGIN + (glyph ? glyph.drawWidth + 8 : 0), cursor - height + 3, "regular", 8.5, INK_MUTED);
    if (options.footer) {
      const reference = options.footer.split(" · ")[0]!;
      text(reference, PDF_PAGE_WIDTH - PDF_MARGIN - widthOf(reference, "mono", 8.5), cursor - height + 3, "mono", 8.5, INK_MUTED);
    }
    cursor -= Math.max(height, 12) + 8;
    stroke(cursor);
    cursor -= 20;
  };

  const draw = (item: Item) => {
    if (item.kind === "line") {
      cursor -= item.baseline;
      if (item.chip) chip(item.chip.label, item.chip.tone, cursor);
      for (const segment of item.segments) {
        text(segment.text, PDF_MARGIN + indent + segment.indent, cursor, segment.font, segment.size, segment.color ?? INK);
      }
      cursor -= item.height - item.baseline;
      return;
    }
    if (item.kind === "rule") {
      cursor -= item.height / 2;
      stroke(cursor, item.strong ? HAIRLINE_STRONG : HAIRLINE);
      cursor -= item.height / 2;
      return;
    }
    if (item.kind === "image") {
      cursor -= item.image.drawHeight;
      image(item.image, PDF_MARGIN + indent, cursor);
      cursor -= 6;
      return;
    }
    if (item.kind === "frame") {
      cursor -= item.height;
      box(PDF_MARGIN + indent, cursor, item.width, item.height, undefined, HAIRLINE_STRONG);
      if (item.image) image(item.image, PDF_MARGIN + indent + (item.width - item.image.drawWidth) / 2, cursor + (item.height - item.image.drawHeight) / 2);
      cursor -= 8;
      return;
    }
    if (item.kind === "pagebreak") {
      // A break at the top of a fresh page is a no-op, never a blank page.
      if (cursor < PDF_PAGE_HEIGHT - PDF_MARGIN * 2) { pages.push(content); startPage(pages.length); }
      return;
    }
    if (item.kind === "panel") {
      cursor -= item.height;
      box(PDF_MARGIN, cursor, CONTENT_WIDTH, item.height, SUNKEN);
      const bottomOfPanel = cursor;
      cursor += item.height - 10;
      indent += 12;
      for (const inner of item.items) draw(inner);
      indent -= 12;
      cursor = bottomOfPanel - 8;
      return;
    }
    cursor -= item.height;
  };

  const fits = (height: number) => cursor - height >= bottom;

  startPage(0);
  for (const block of blocks) {
    const items = itemsFor(block);
    if (items.length === 0) continue;
    if (block.type === "keep" || block.type === "image" || block.type === "panel" || block.type === "frame") {
      const total = items.reduce((sum, item) => sum + item.height, 0);
      if (!fits(total) && cursor < PDF_PAGE_HEIGHT - PDF_MARGIN * 2) { pages.push(content); startPage(pages.length); }
    }
    for (const item of items) {
      if (!fits(item.height)) { pages.push(content); startPage(pages.length); }
      draw(item);
    }
  }
  pages.push(content);

  const footerFor = (index: number, total: number): number[] => {
    const saved = content;
    content = [];
    stroke(FOOTER_RULE);
    const page = `PAGE ${index + 1} OF ${total}`;
    text(page, PDF_MARGIN, FOOTER_RULE - 12, "mono", 8, INK_MUTED, 0.48);
    if (options.footer) text(options.footer, PDF_PAGE_WIDTH - PDF_MARGIN - widthOf(options.footer, "mono", 8), FOOTER_RULE - 12, "mono", 8, INK_MUTED);
    if (options.footerPlaceholder) text(options.footerPlaceholder, PDF_MARGIN, FOOTER_RULE - 22, "mono", 8, INK_DISABLED);
    const drawn = content;
    content = saved;
    return drawn;
  };

  const objects: number[][] = [];
  const add = (body: number[]) => objects.push(body) - 1;
  // Objects are written in order: catalog, pages, nine font objects (three
  // faces, each with a descriptor and its program), one per image, then a
  // page and its content stream per page. /Kids must name the page objects,
  // so the first page lands right after the last image.
  const pageObjectIds = pages.map((_, index) => 12 + images.length + index * 2);
  const created = options.createdAt ?? new Date();
  const stamp = `D:${created.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`;

  add(bytes("<< /Type /Catalog /Pages 2 0 R >>"));
  add(bytes(`<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`));
  // Objects 3 to 11: three faces, each a font, its descriptor and its program.
  const faces: PdfFontFace[] = [PDF_FACES.regular, PDF_FACES.bold, PDF_FACES.mono];
  faces.forEach((face, index) => {
    const fontId = 3 + index * 3;
    add(bytes(`<< /Type /Font /Subtype /TrueType /BaseFont /${face.name} /FirstChar 32 /LastChar 255 /Widths [${face.widths.join(" ")}] /Encoding /WinAnsiEncoding /FontDescriptor ${fontId + 1} 0 R >>`));
    add(bytes(`<< /Type /FontDescriptor /FontName /${face.name} /Flags ${face.flags} /FontBBox [${face.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${face.ascent} /Descent ${face.descent} /CapHeight ${face.capHeight} /StemV 80 /FontFile2 ${fontId + 2} 0 R >>`));
    const program = decodeBase64(face.base64);
    add([...bytes(`<< /Length ${program.length} /Length1 ${program.length} >>\nstream\n`), ...program, ...bytes("\nendstream")]);
  });
  const IMAGE_BASE = 3 + faces.length * 3;
  for (const image of images) {
    const header = bytes(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>\nstream\n`);
    add([...header, ...image.data, ...bytes("\nendstream")]);
  }
  const resources = `<< /Font << /F1 3 0 R /F2 6 0 R /F3 9 0 R >>${images.length > 0 ? ` /XObject << ${images.map((_, index) => `/Im${index} ${IMAGE_BASE + index} 0 R`).join(" ")} >>` : ""} >>`;
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
