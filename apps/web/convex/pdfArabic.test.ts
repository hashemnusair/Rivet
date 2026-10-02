import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderPdf, type PdfBlock } from "./pdfDocument";
import { shapeUnicode, unicodeFont, utf16Hex } from "./pdfUnicode";

const title = "وصل دفع";
const phrase = "كل تفاصيل ناديك و مشتركينه في مكان واحد";
const name = "نادي القوة واللياقة البدنية - عمّان / RIVET";

function sampleBlocks(): PdfBlock[] {
  return [
    { type: "title", text: title, chip: { label: "مدفوع", tone: "success" } },
    { type: "meta", text: "RVT-2026-0042 · 2 تشرين الأول 2026، 2:30 م" },
    { type: "paragraph", text: phrase },
    { type: "rows", rows: [{ label: "النادي الرياضي", value: name }, { label: "المشترك", value: "عبد الرحمن أحمد الحسيني / Ahmad" }, { label: "طريقة الدفع", value: "كاش" }, { label: "المبلغ", value: "\u206625.000\u2069 د.أ", strong: true }, { label: "مردود", value: "\u2066-7.125\u2069 د.أ" }] },
    { type: "heading", text: "تفاصيل الاشتراك" },
    { type: "table", head: ["البيان", "العدد", "سعر الوحدة", "المجموع"], widths: [213.28, 60, 105, 105], alignEnd: [1, 2, 3], rows: Array.from({ length: 65 }, (_, index) => [`اشتراك شهري في النادي - بند ${index + 1}`, "1", "25.000 د.أ", "25.000 د.أ"]) },
    { type: "keep", blocks: [
      { type: "heading", text: "التوقيع الإلكتروني" },
      { type: "paragraph", text: "أوافق على التوقيع إلكترونيًا وأقرّ بأن هذا التوقيع ملزم قانونًا." },
      { type: "paragraph", text: "سيُسجَّل المبلغ كمردود. يجب إعادة المال للعضو خارج النظام." },
      { type: "frame", width: 230, height: 54, caption: "توقيع المشترك" },
    ] },
  ];
}

describe("Arabic PDF contract", () => {
  it("uses contextual Arabic glyphs and measures shaped advances", () => {
    const font = unicodeFont("regular");
    const shape = shapeUnicode("ببب", "regular");
    expect(shape.glyphs).toHaveLength(3);
    expect(new Set(shape.glyphs.map((glyph) => glyph.id)).size).toBeGreaterThan(1);
    expect(shape.glyphs.some((glyph) => glyph.id !== font.glyphForCodePoint(0x628).id)).toBe(true);
    expect(shape.width).toBeGreaterThan(0);
    expect(shape.glyphs.every((glyph) => glyph.id !== 0)).toBe(true);
  });

  it("retains mixed references, negative amounts and logical text over several pages", () => {
    const bytes = renderPdf(sampleBlocks(), { title, author: "RIVET", locale: "ar", runningTitle: "وصل دفع المشترك", documentLabel: "وصل دفع", footer: "RVT-2026-0042 · RIVET", createdAt: new Date("2026-10-02T11:30:00Z") });
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(2);
    expect(text).toContain(`/ActualText <${utf16Hex(phrase, true)}>`);
    expect(text).toContain("/BaseFont /IBMPlexSansArabic-Regular");
    expect(text).toContain("/BaseFont /IBMPlexSansArabic-SemiBold");
    expect(text).toContain(utf16Hex("\u2066-7.125\u2069 د.أ", true));
    expect(text).not.toContain("????");
    const output = process.env.RIVET_PDF_FIXTURE_DIR;
    if (output) {
      mkdirSync(output, { recursive: true });
      writeFileSync(join(output, "arabic-receipt-agreement.pdf"), bytes);
    }
  });
});
