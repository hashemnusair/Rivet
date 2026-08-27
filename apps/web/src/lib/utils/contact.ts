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

export function normalizeLeadPhone(value: string): string {
  return value.trim();
}

export function isValidLeadPhone(value: string): boolean {
  const normalized = normalizeLeadPhone(value);
  return normalized.length >= 9 && normalized.length <= 18 && LEAD_PHONE_PATTERN.test(normalized);
}
