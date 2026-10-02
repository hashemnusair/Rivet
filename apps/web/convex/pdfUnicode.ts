/** Unicode shaping/encoding shared unchanged by the browser and Convex runtime. */
import { create, type Font, type GlyphRun, type TypeFeatures } from "@pdf-lib/fontkit";
import bidiFactory from "bidi-js";
import { ARABIC_PDF_FONTS } from "./pdfArabicFonts";
import type { PdfFont } from "./pdfDocument";

// The package implements the five-argument layout API; its bundled type
// declaration omits script/language/direction. Keep that compatibility here.
interface DirectionalFont extends Font {
  layout(text: string, features?: TypeFeatures | (keyof TypeFeatures)[], script?: string, language?: string, direction?: "ltr" | "rtl"): GlyphRun;
}
const bidi = bidiFactory();
const fonts = new Map<string, Font>();
const programs = new Map<string, Uint8Array>();
export type UnicodeFace = "regular" | "bold";
export interface PositionedGlyph { id: number; x: number; y: number; width: number; unicode: number[] }
export interface ShapedText { glyphs: PositionedGlyph[]; width: number; face: UnicodeFace }
const cache = new Map<string, ShapedText>();
const CONTROLS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export function requiresUnicode(text: string): boolean {
  return /[^\x20-\xff€‘’“”•–—™]/u.test(text);
}

export function unicodeProgram(face: UnicodeFace): Uint8Array {
  let bytes = programs.get(face);
  if (!bytes) {
    const raw = atob(ARABIC_PDF_FONTS[face]);
    bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    programs.set(face, bytes);
  }
  return bytes;
}

export function unicodeFont(face: UnicodeFace): Font {
  let font = fonts.get(face);
  if (!font) { font = create(unicodeProgram(face)); fonts.set(face, font); }
  return font;
}

/** PDF Unicode strings use UTF-16BE, including surrogate pairs. */
export function utf16Hex(text: string, bom = false): string {
  let out = bom ? "FEFF" : "";
  for (let index = 0; index < text.length; index += 1) out += text.charCodeAt(index).toString(16).padStart(4, "0");
  return out.toUpperCase();
}

/** Resolve visual run order with UAX #9, then shape each logical run with GSUB/GPOS.
 * Strings are never manually reversed. Fontkit positions joined letters and marks;
 * bidi-js orders directional runs and supplies mirrored punctuation. */
export function shapeUnicode(text: string, kind: PdfFont): ShapedText {
  const face: UnicodeFace = kind === "bold" ? "bold" : "regular";
  const key = `${face}:${text}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const font = unicodeFont(face);
  const levels = bidi.getEmbeddingLevels(text);
  const mirrored = bidi.getMirroredCharactersMap(text, levels);
  const runs: Array<{ start: number; end: number; level: number }> = [];
  const runAt: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const level = levels.levels[index] ?? 0;
    const previous = runs[runs.length - 1];
    if (previous && previous.level === level) previous.end = index + 1;
    else runs.push({ start: index, end: index + 1, level });
    runAt[index] = runs.length - 1;
  }
  const visualOrder = [...new Set(bidi.getReorderedIndices(text, levels).map((index) => runAt[index]!))];
  const glyphs: PositionedGlyph[] = [];
  let x = 0;
  for (const runIndex of visualOrder) {
    const run = runs[runIndex]!;
    let logical = "";
    for (let index = run.start; index < run.end; index += 1) logical += mirrored.get(index) ?? text[index];
    logical = logical.replace(CONTROLS, "");
    if (!logical) continue;
    const layout = (font as DirectionalFont).layout(logical, undefined, undefined, undefined, run.level % 2 ? "rtl" : "ltr");
    layout.glyphs.forEach((glyph, index) => {
      const position = layout.positions[index]!;
      glyphs.push({ id: glyph.id, x: (x + position.xOffset) / font.unitsPerEm, y: position.yOffset / font.unitsPerEm, width: glyph.advanceWidth * 1000 / font.unitsPerEm, unicode: glyph.codePoints });
      x += position.xAdvance;
    });
  }
  const result = { glyphs, width: x / font.unitsPerEm, face };
  // Bound worker/browser memory when many distinct documents are generated.
  if (cache.size >= 2048) cache.clear();
  cache.set(key, result);
  return result;
}

/** Five PDF objects per used Unicode face: Type0, CID font, descriptor, font, CMap. */
export function unicodeObjects(face: UnicodeFace, firstId: number, glyphs: Map<number, PositionedGlyph>): Uint8Array[] {
  const font = unicodeFont(face);
  const name = font.postscriptName;
  const encode = (value: string) => new TextEncoder().encode(value);
  const stream = (data: Uint8Array, extra = "") => {
    const head = encode(`<< /Length ${data.length}${extra} >>\nstream\n`), tail = encode("\nendstream");
    const out = new Uint8Array(head.length + data.length + tail.length);
    out.set(head); out.set(data, head.length); out.set(tail, head.length + data.length); return out;
  };
  const entries = [...glyphs.values()].sort((a, b) => a.id - b.id);
  const mappings = entries.filter((glyph) => glyph.unicode.length).map((glyph) => `<${glyph.id.toString(16).padStart(4, "0")}> <${utf16Hex(String.fromCodePoint(...glyph.unicode))}>`);
  const chunks: string[] = [];
  for (let index = 0; index < mappings.length; index += 100) {
    const chunk = mappings.slice(index, index + 100); chunks.push(`${chunk.length} beginbfchar\n${chunk.join("\n")}\nendbfchar`);
  }
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /RIVETUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${chunks.join("\n")}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  const scale = (value: number) => Math.round(value * 1000 / font.unitsPerEm);
  return [
    encode(`<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${firstId + 1} 0 R] /ToUnicode ${firstId + 4} 0 R >>`),
    encode(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${firstId + 2} 0 R /CIDToGIDMap /Identity /DW 1000 /W [${entries.map((glyph) => `${glyph.id} [${glyph.width.toFixed(3)}]`).join(" ")}] >>`),
    encode(`<< /Type /FontDescriptor /FontName /${name} /Flags 4 /FontBBox [${[font.bbox.minX, font.bbox.minY, font.bbox.maxX, font.bbox.maxY].map(scale).join(" ")}] /ItalicAngle 0 /Ascent ${scale(font.ascent)} /Descent ${scale(font.descent)} /CapHeight ${scale(font.capHeight)} /StemV 80 /FontFile2 ${firstId + 3} 0 R >>`),
    stream(unicodeProgram(face), ` /Length1 ${unicodeProgram(face).length}`),
    stream(encode(cmap)),
  ];
}
