/** Normalize input for comparison only; never rewrite a person's stored name. */
export function latinDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) - (digit <= "٩" ? 0x660 : 0x6f0)));
}

export function searchKey(value: string): string {
  return latinDigits(value.normalize("NFKC"))
    .replace(/[\u0610-\u061a\u0640\u064b-\u065f\u0670\u06d6-\u06ed\u200e\u200f\u2066-\u2069]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .toLocaleLowerCase("en")
    .trim();
}
