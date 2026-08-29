/** Contact values shared by the CRM forms and the credential-free adapter. */
export const LEAD_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const LEAD_PHONE_PATTERN = /^\+?[\d\s()-]{9,18}$/;
export const DEFAULT_PHONE_COUNTRY_CALLING_CODE = "962";

const LOCALE_CALLING_CODES: Record<string, string> = {
  AE: "971",
  GB: "44",
  JO: "962",
  SA: "966",
  US: "1",
};

export function normalizeOptionalEmail(value?: string | null): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized || undefined;
}

export function isValidOptionalEmail(value?: string | null): boolean {
  const normalized = normalizeOptionalEmail(value);
  return normalized === undefined || (normalized.length <= 254 && LEAD_EMAIL_PATTERN.test(normalized));
}

export function normalizeLeadName(value: string): string {
  return value.trim();
}

export function phoneDigits(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

export function normalizeCountryCallingCode(value?: string | null): string {
  const digits = phoneDigits(value);
  return /^\d{1,3}$/.test(digits) ? digits : DEFAULT_PHONE_COUNTRY_CALLING_CODE;
}

export function countryCallingCodeForLocale(locale?: string | null): string {
  const region = locale?.trim().split(/[-_]/)[1]?.toUpperCase();
  return (region && LOCALE_CALLING_CODES[region]) || DEFAULT_PHONE_COUNTRY_CALLING_CODE;
}

/** Stable comparison key for complete phone numbers. Local aliases use the
 * tenant's default calling code; explicit `+` and `00` numbers always win. */
export function canonicalPhoneKey(value?: string | null, defaultCountryCallingCode = DEFAULT_PHONE_COUNTRY_CALLING_CODE): string {
  const trimmed = value?.trim() ?? "";
  let digits = phoneDigits(value);
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (trimmed.startsWith("+")) return digits;

  const callingCode = normalizeCountryCallingCode(defaultCountryCallingCode);
  if (digits.startsWith(callingCode) && digits.length >= 8) return digits;
  if (digits.startsWith("0")) digits = digits.slice(1);
  return `${callingCode}${digits}`;
}

/** Search aliases use the same country-aware rules as stored identities. */
export function phoneSearchKey(value?: string | null, defaultCountryCallingCode = DEFAULT_PHONE_COUNTRY_CALLING_CODE): string {
  return canonicalPhoneKey(value, defaultCountryCallingCode);
}

export function phoneSearchMatches(value: string, query: string, defaultCountryCallingCode = DEFAULT_PHONE_COUNTRY_CALLING_CODE): boolean {
  const queryDigits = phoneDigits(query);
  if (queryDigits.length < 3) return false;
  const valueKey = phoneSearchKey(value, defaultCountryCallingCode);
  const queryKey = phoneSearchKey(query, defaultCountryCallingCode);
  const localQuery = queryDigits.replace(/^0/, "");
  return Boolean(valueKey && queryKey && (valueKey.includes(queryKey) || (localQuery.length >= 3 && valueKey.endsWith(localQuery))));
}

export function normalizePhoneToE164(value: string, defaultCountryCallingCode = DEFAULT_PHONE_COUNTRY_CALLING_CODE): string | undefined {
  const key = canonicalPhoneKey(value, defaultCountryCallingCode);
  return /^\d{8,15}$/.test(key) ? `+${key}` : undefined;
}

export function normalizePhoneForStorage(value: string, defaultCountryCallingCode = DEFAULT_PHONE_COUNTRY_CALLING_CODE): string {
  const trimmed = value.trim();
  const e164 = normalizePhoneToE164(trimmed, defaultCountryCallingCode);
  if (e164) return e164;
  return trimmed.replace(/\s+/g, " ");
}

export function normalizeLeadPhone(value: string, defaultCountryCallingCode = DEFAULT_PHONE_COUNTRY_CALLING_CODE): string {
  return normalizePhoneForStorage(value, defaultCountryCallingCode);
}

export function isValidLeadPhone(value: string, defaultCountryCallingCode = DEFAULT_PHONE_COUNTRY_CALLING_CODE): boolean {
  const normalized = normalizeLeadPhone(value, defaultCountryCallingCode);
  return normalized.length >= 9 && normalized.length <= 18 && LEAD_PHONE_PATTERN.test(normalized);
}

export function buildWhatsAppUrl(input: { phone: string; message: string; defaultCountryCallingCode?: string }): string | undefined {
  const e164 = normalizePhoneToE164(input.phone, input.defaultCountryCallingCode);
  if (!e164) return undefined;
  const number = e164.slice(1);
  const message = input.message.trim();
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}
