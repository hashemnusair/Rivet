#!/usr/bin/env node
/**
 * Build the fonts the PDF renderer embeds.
 *
 * Takes TrueType files (or WOFF 1.0, which is TrueType with zlib per table),
 * keeps only the glyphs WinAnsi can address plus any composite parts they
 * use, and writes convex/pdfFonts.ts with each face as base64 together with
 * the metrics the renderer needs: advance widths per WinAnsi byte, and the
 * ascent, descent, cap height and bounding box for the font descriptor.
 *
 * Glyph ids are kept as they are, so the original cmap and hmtx stay valid;
 * unused glyphs simply become empty. That is all a PDF reader needs.
 *
 *   node scripts/build-pdf-fonts.mjs <dir with the source files>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import path from "node:path";

const WIN_ANSI_HIGH = { 0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178 };
function winAnsiToUnicode(byte) {
  if (byte < 0x80 || byte >= 0xa0) return byte;
  return WIN_ANSI_HIGH[byte] ?? 0x20;
}

const u16 = (b, o) => b.readUInt16BE(o);
const i16 = (b, o) => b.readInt16BE(o);
const u32 = (b, o) => b.readUInt32BE(o);

/** WOFF 1.0 to plain TrueType. A .ttf passes straight through. */
function toTrueType(bytes) {
  if (bytes.toString("latin1", 0, 4) !== "wOFF") return bytes;
  const numTables = u16(bytes, 12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const o = 44 + i * 20;
    const tag = bytes.toString("latin1", o, o + 4);
    const offset = u32(bytes, o + 4), compLength = u32(bytes, o + 8), origLength = u32(bytes, o + 12);
    const raw = bytes.subarray(offset, offset + compLength);
    tables.push({ tag, data: compLength < origLength ? inflateSync(raw) : Buffer.from(raw) });
  }
  return assemble(tables, u32(bytes, 4));
}

function parseTables(ttf) {
  const numTables = u16(ttf, 4);
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    tables.set(ttf.toString("latin1", o, o + 4), Buffer.from(ttf.subarray(u32(ttf, o + 8), u32(ttf, o + 8) + u32(ttf, o + 12))));
  }
  return tables;
}

function checksum(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum = (sum + ((data[i] << 24) | ((data[i + 1] ?? 0) << 16) | ((data[i + 2] ?? 0) << 8) | (data[i + 3] ?? 0))) >>> 0;
  return sum;
}

function assemble(entries, flavour = 0x00010000) {
  entries = [...entries].sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const numTables = entries.length;
  let searchRange = 1, entrySelector = 0;
  while (searchRange * 2 <= numTables) { searchRange *= 2; entrySelector++; }
  searchRange *= 16;
  const header = Buffer.alloc(12 + numTables * 16);
  header.writeUInt32BE(flavour, 0); header.writeUInt16BE(numTables, 4); header.writeUInt16BE(searchRange, 6); header.writeUInt16BE(entrySelector, 8); header.writeUInt16BE(numTables * 16 - searchRange, 10);
  let offset = header.length;
  const chunks = [];
  entries.forEach((entry, i) => {
    const padded = Buffer.concat([entry.data, Buffer.alloc((4 - (entry.data.length % 4)) % 4)]);
    const o = 12 + i * 16;
    header.write(entry.tag, o, "latin1"); header.writeUInt32BE(checksum(padded), o + 4); header.writeUInt32BE(offset, o + 8); header.writeUInt32BE(entry.data.length, o + 12);
    chunks.push(padded); offset += padded.length;
  });
  return Buffer.concat([header, ...chunks]);
}

/** Unicode to glyph id from a format 4 cmap subtable. */
function parseCmap(cmap) {
  const n = u16(cmap, 2);
  let best;
  for (let i = 0; i < n; i++) {
    const platform = u16(cmap, 4 + i * 8), encoding = u16(cmap, 6 + i * 8), offset = u32(cmap, 8 + i * 8);
    if (u16(cmap, offset) !== 4) continue;
    if ((platform === 3 && encoding === 1) || platform === 0) best = offset;
  }
  if (best === undefined) throw new Error("no format 4 cmap");
  const segX2 = u16(cmap, best + 6);
  const ends = best + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
  const map = new Map();
  for (let s = 0; s < segX2 / 2; s++) {
    const end = u16(cmap, ends + s * 2), start = u16(cmap, starts + s * 2), delta = i16(cmap, deltas + s * 2), rangeOffset = u16(cmap, ranges + s * 2);
    if (start === 0xffff) continue;
    for (let c = start; c <= end; c++) {
      let gid;
      if (rangeOffset === 0) gid = (c + delta) & 0xffff;
      else {
        const addr = ranges + s * 2 + rangeOffset + (c - start) * 2;
        if (addr + 1 >= cmap.length) continue;
        gid = u16(cmap, addr);
        if (gid !== 0) gid = (gid + delta) & 0xffff;
      }
      if (gid !== 0) map.set(c, gid);
    }
  }
  return map;
}

function subset(ttf, label) {
  const tables = parseTables(ttf);
  const head = tables.get("head"), hhea = tables.get("hhea"), maxp = tables.get("maxp"), hmtx = tables.get("hmtx"), loca = tables.get("loca"), glyf = tables.get("glyf"), os2 = tables.get("OS/2");
  if (!glyf) throw new Error(`${label}: not a TrueType outline font`);
  const unitsPerEm = u16(head, 18), longLoca = i16(head, 50) === 1, numGlyphs = u16(maxp, 4), numHMetrics = u16(hhea, 34);
  const unicodeToGid = parseCmap(tables.get("cmap"));
  const offsets = [];
  for (let g = 0; g <= numGlyphs; g++) offsets.push(longLoca ? u32(loca, g * 4) : u16(loca, g * 2) * 2);
  const keep = new Set([0]);
  const widths = [];
  for (let byte = 32; byte <= 255; byte++) {
    const gid = unicodeToGid.get(winAnsiToUnicode(byte));
    if (gid !== undefined) keep.add(gid);
    const w = gid === undefined ? 0 : u16(hmtx, Math.min(gid, numHMetrics - 1) * 4);
    widths.push(Math.round((w * 1000) / unitsPerEm));
  }
  // Composite glyphs reference other glyphs; keep those too.
  const queue = [...keep];
  while (queue.length) {
    const gid = queue.pop();
    const start = offsets[gid], end = offsets[gid + 1];
    if (end <= start || i16(glyf, start) >= 0) continue;
    let p = start + 10;
    for (;;) {
      const flags = u16(glyf, p), component = u16(glyf, p + 2);
      if (!keep.has(component)) { keep.add(component); queue.push(component); }
      p += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
      if (!(flags & 0x20)) break;
    }
  }
  const newGlyf = [], newLoca = Buffer.alloc((numGlyphs + 1) * 4);
  let cursor = 0;
  for (let g = 0; g < numGlyphs; g++) {
    newLoca.writeUInt32BE(cursor, g * 4);
    if (keep.has(g)) { const data = glyf.subarray(offsets[g], offsets[g + 1]); const padded = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)]); newGlyf.push(padded); cursor += padded.length; }
  }
  newLoca.writeUInt32BE(cursor, numGlyphs * 4);
  const newHead = Buffer.from(head); newHead.writeInt16BE(1, 50); newHead.writeUInt32BE(0, 8);
  const out = [];
  for (const [tag, data] of tables) {
    if (["glyf", "loca", "head", "DSIG", "GPOS", "GSUB", "GDEF", "kern", "hdmx", "LTSH", "VDMX", "gasp", "STAT", "fvar", "gvar", "HVAR", "MVAR", "avar", "meta"].includes(tag)) continue;
    out.push({ tag, data });
  }
  out.push({ tag: "glyf", data: Buffer.concat(newGlyf) }, { tag: "loca", data: newLoca }, { tag: "head", data: newHead });
  const scale = (v) => Math.round((v * 1000) / unitsPerEm);
  const metrics = {
    unitsPerEm,
    ascent: scale(i16(hhea, 4)), descent: scale(i16(hhea, 6)),
    capHeight: os2 && os2.length >= 90 ? scale(i16(os2, 88)) : scale(Math.round(i16(hhea, 4) * 0.7)),
    bbox: [scale(i16(head, 36)), scale(i16(head, 38)), scale(i16(head, 40)), scale(i16(head, 42))],
    widths,
  };
  return { bytes: assemble(out), metrics, kept: keep.size, of: numGlyphs };
}

const dir = process.argv[2];
if (!dir) { console.error("usage: build-pdf-fonts.mjs <dir>"); process.exit(2); }
const faces = [
  { key: "regular", name: "Manrope-Regular", file: "manrope-latin-400-normal.woff", fallback: "Manrope-Regular.ttf", flags: 32 },
  { key: "bold", name: "Manrope-SemiBold", file: "manrope-latin-600-normal.woff", fallback: "Manrope-SemiBold.ttf", flags: 32 },
  { key: "mono", name: "IBMPlexMono-Regular", file: "IBMPlexMono-Regular.ttf", fallback: "IBMPlexMono-Regular.ttf", flags: 33 },
];
let source = `/**
 * The faces the PDF renderer embeds: Manrope for text and IBM Plex Mono for
 * the technical lines, exactly as the identity system sets them. Each is a
 * WinAnsi subset produced by scripts/build-pdf-fonts.mjs from the open
 * licence files (SIL Open Font License 1.1; see scripts/pdf-fonts/OFL.txt).
 * Generated. Do not edit by hand.
 */

export interface PdfFontFace {
  name: string;
  /** PDF font descriptor flags: 32 nonsymbolic, 33 fixed pitch as well. */
  flags: number;
  ascent: number;
  descent: number;
  capHeight: number;
  bbox: [number, number, number, number];
  /** Advance widths for WinAnsi bytes 32 to 255, in 1/1000 em. */
  widths: number[];
  /** The TrueType program, base64. */
  base64: string;
}

`;
for (const face of faces) {
  let file = path.join(dir, face.file);
  try { readFileSync(file); } catch { file = path.join(dir, face.fallback); }
  const ttf = toTrueType(readFileSync(file));
  const { bytes, metrics, kept, of } = subset(ttf, face.name);
  console.log(`${face.name}: ${kept} of ${of} glyphs kept, ${bytes.length} bytes`);
  const chunks = bytes.toString("base64").match(/.{1,100}/g).map((line) => `  "${line}"`).join(" +\n");
  source += `export const ${face.key.toUpperCase()}_FACE: PdfFontFace = {\n  name: "${face.name}",\n  flags: ${face.flags},\n  ascent: ${metrics.ascent},\n  descent: ${metrics.descent},\n  capHeight: ${metrics.capHeight},\n  bbox: [${metrics.bbox.join(", ")}],\n  widths: [${metrics.widths.join(", ")}],\n  base64:\n${chunks},\n};\n\n`;
}
source += `export const PDF_FACES = { regular: REGULAR_FACE, bold: BOLD_FACE, mono: MONO_FACE } as const;\n`;
writeFileSync(path.join(process.cwd(), "convex/pdfFonts.ts"), source);
console.log("wrote convex/pdfFonts.ts");
