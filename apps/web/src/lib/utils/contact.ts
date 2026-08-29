/** Contact values shared by the CRM forms and the credential-free adapter. */
export const LEAD_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const LEAD_PHONE_PATTERN = /^\+?[\d\s()-]{9,18}$/;

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

/** Stable comparison key for complete phone numbers. Jordanian mobile aliases
 * (`079`, `+96279`, and `0096279`) collapse to the same E.164 digits. */
export function canonicalPhoneKey(value?: string | null): string {
  let digits = phoneDigits(value);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0(7[789]\d{7})$/.test(digits)) return `962${digits.slice(1)}`;
  if (/^7[789]\d{7}$/.test(digits)) return `962${digits}`;
  return digits;
}

/** Search key also canonicalizes partial Jordanian mobile prefixes, so staff
 * can type the familiar local form while records are stored internationally. */
export function phoneSearchKey(value?: string | null): string {
  let digits = phoneDigits(value);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^07[789]/.test(digits)) return `962${digits.slice(1)}`;
  if (/^7[789]/.test(digits)) return `962${digits}`;
  return digits;
}

export function phoneSearchMatches(value: string, query: string): boolean {
  const queryDigits = phoneDigits(query);
  if (queryDigits.length < 3) return false;
  const valueKey = phoneSearchKey(value);
  const queryKey = phoneSearchKey(query);
  return Boolean(valueKey && queryKey && valueKey.includes(queryKey));
}

export function normalizePhoneForStorage(value: string): string {
  const trimmed = value.trim();
  const key = canonicalPhoneKey(trimmed);
  if (/^9627[789]\d{7}$/.test(key)) return `+${key}`;
  if ((trimmed.startsWith("+") || phoneDigits(trimmed).startsWith("00")) && key) return `+${key}`;
  return trimmed.replace(/\s+/g, " ");
}

export function normalizeLeadPhone(value: string): string {
  return normalizePhoneForStorage(value);
}

export function isValidLeadPhone(value: string): boolean {
  const normalized = normalizeLeadPhone(value);
  return normalized.length >= 9 && normalized.length <= 18 && LEAD_PHONE_PATTERN.test(normalized);
}
