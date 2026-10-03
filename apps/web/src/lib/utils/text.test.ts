import { describe, expect, it } from "vitest";
import { latinDigits, searchKey } from "./text";
import { normalizePhoneToE164, phoneSearchMatches } from "./contact";
describe("Arabic input and search normalization", () => {
  it("matches Arabic names without changing stored spelling", () => {
    const name = "أحـمَد مصطفى";
    expect(searchKey(name)).toBe(searchKey("احمد مصطفي"));
    expect(name).toBe("أحـمَد مصطفى");
    expect(searchKey("هبة")).not.toBe(searchKey("هبه"));
  });
  it("handles Arabic and Persian digits alongside Latin digits", () => {
    expect(latinDigits("٠١٢٣٤٥٦٧٨٩/۰۱۲۳۴۵۶۷۸۹/0123456789")).toBe("0123456789/0123456789/0123456789");
    expect(searchKey("RVT-٠٠١٢")).toBe("rvt-0012");
  });
  it("preserves international phone semantics with localized digit input", () => {
    expect(normalizePhoneToE164("٠٧٩ ١٢٣ ٤٥٦٧")).toBe("+962791234567");
    expect(normalizePhoneToE164("+٩٧١ ٥٠ ١٢٣ ٤٥٦٧")).toBe("+971501234567");
    expect(phoneSearchMatches("+962791234567", "١٢٣٤٥٦٧")).toBe(true);
  });
});
