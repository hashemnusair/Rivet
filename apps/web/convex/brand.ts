/** Server-side Brand Kit validation and semantic token derivation. */
export const BRAND_PALETTE_PRESETS = {
  rivet: "#15140f",
  gold: "#b88a2b",
  red: "#b42318",
  green: "#19704b",
  blue: "#2458a6",
  violet: "#7048a8",
} as const;

export type BrandPaletteKey = keyof typeof BRAND_PALETTE_PRESETS;
export const DEFAULT_BRAND_PALETTE: BrandPaletteKey = "rivet";

export interface BrandTokens {
  primary: string;
  primaryHover: string;
  primaryForeground: string;
  primarySoft: string;
  primarySoftForeground: string;
  focusRing: string;
}

export function isBrandPaletteKey(value: unknown): value is BrandPaletteKey {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(BRAND_PALETTE_PRESETS, value);
}

export function normalizeBrandHex(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : undefined;
}

export function resolveBrandColor(paletteKey: unknown, primaryColor: unknown): { paletteKey: BrandPaletteKey; primaryColor: string } {
  const key = isBrandPaletteKey(paletteKey) ? paletteKey : DEFAULT_BRAND_PALETTE;
  const custom = normalizeBrandHex(primaryColor);
  return { paletteKey: key, primaryColor: custom ?? BRAND_PALETTE_PRESETS[key] };
}

function rgbFromHex(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
}

function hexFromRgb(rgb: [number, number, number]): string {
  return `#${rgb.map((channel) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, "0")).join("")}`;
}

function relativeLuminance(hex: string): number {
  return rgbFromHex(hex).map((channel) => channel / 255).map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
}

export function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function shiftColor(hex: string, factor: number): string {
  return hexFromRgb(rgbFromHex(hex).map((channel) => channel * factor) as [number, number, number]);
}

function mixColor(first: string, second: string, firstWeight: number): string {
  const left = rgbFromHex(first);
  const right = rgbFromHex(second);
  return hexFromRgb(left.map((channel, index) => channel * firstWeight + right[index]! * (1 - firstWeight)) as [number, number, number]);
}

function readableForeground(background: string, preferred: string, alternate: string): string {
  const candidates = [preferred, alternate, "#000000", "#ffffff"];
  return candidates.find((candidate) => contrastRatio(background, candidate) >= 4.5) ?? (contrastRatio(background, "#000000") >= contrastRatio(background, "#ffffff") ? "#000000" : "#ffffff");
}

export function deriveBrandTokens(primaryColor: string): BrandTokens {
  const primary = normalizeBrandHex(primaryColor) ?? BRAND_PALETTE_PRESETS[DEFAULT_BRAND_PALETTE];
  const white = "#ffffff";
  const ink = "#15140f";
  const primaryForeground = readableForeground(primary, white, ink);
  const darkerHover = shiftColor(primary, 0.85);
  const lighterHover = shiftColor(primary, 1.15);
  const primaryHover = [darkerHover, lighterHover].find((candidate) => contrastRatio(candidate, primaryForeground) >= 4.5) ?? (primaryForeground === white ? "#000000" : "#ffffff");
  const primarySoft = mixColor(primary, white, 0.14);
  const primarySoftForeground = readableForeground(primarySoft, ink, primaryForeground);
  return { primary, primaryHover, primaryForeground, primarySoft, primarySoftForeground, focusRing: primary };
}
