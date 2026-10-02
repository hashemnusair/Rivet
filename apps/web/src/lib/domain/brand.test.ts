import { describe, expect, it } from "vitest";
import { BRAND_PALETTE_PRESETS, contrastRatio, deriveBrandTokens, normalizeBrandHex, resolveBrandColor } from "./brand";

describe("tenant Brand Kit tokens", () => {
  it("accepts only six-digit hex colors and falls back to the selected palette", () => {
    expect(normalizeBrandHex(" #B88A2B ")).toBe("#b88a2b");
    expect(normalizeBrandHex("gold")).toBeUndefined();
    expect(normalizeBrandHex("#fff")).toBeUndefined();
    expect(resolveBrandColor("gold", "not-a-color")).toEqual({ paletteKey: "gold", primaryColor: BRAND_PALETTE_PRESETS.gold });
    expect(resolveBrandColor("unknown", "#123456")).toEqual({ paletteKey: "rivet", primaryColor: "#123456" });
  });

  it("derives readable foregrounds for every preset and representative custom colors", () => {
    const colors = [...Object.values(BRAND_PALETTE_PRESETS), "#ffffff", "#777777", "#ff00ff", "#0047ab"];
    for (const color of colors) {
      const tokens = deriveBrandTokens(color);
      expect(contrastRatio(tokens.primary, tokens.primaryForeground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.primaryHover, tokens.primaryForeground)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(tokens.primarySoft, tokens.primarySoftForeground)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
