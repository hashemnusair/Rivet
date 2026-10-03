import { toWesternDigits } from "@/lib/utils/money";

/** Text inputs retain Arabic digits until we can normalize them. Never coerce an empty draft to zero. */
export function readSettingsNumber(raw: string, { min, max = Number.MAX_SAFE_INTEGER, decimalPlaces = 0 }: {
  min: number;
  max?: number;
  decimalPlaces?: number | "any";
}): number | null {
  const text = toWesternDigits(raw).replace(/[\u061c\u200e\u200f\u2066-\u2069]/g, "").trim();
  if (!(decimalPlaces === 0 ? /^\d+$/ : /^(?:\d+(?:\.\d*)?|\.\d+)$/).test(text)) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max) return null;
  if (decimalPlaces !== "any") {
    const fraction = text.split(".")[1]?.replace(/0+$/, "") ?? "";
    if (fraction.length > decimalPlaces || !Number.isSafeInteger(Math.round(value * 10 ** decimalPlaces))) return null;
  }
  return value;
}
