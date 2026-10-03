import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";
import { isRivetHost } from "@/lib/routing/host-routing";

export const UI_PREFERENCE_COOKIE = "rivet_ui_locale_v1";
export const UI_PREFERENCE_STORAGE = "rivet.uiLocale.v1";
export interface UiLocalePreference { version: 1; locale: Locale; owner: string | null; pending?: string }

export function parseUiPreference(encoded: string | undefined | null): UiLocalePreference | undefined {
  if (!encoded || encoded.length > 1600) return undefined;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(encoded));
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    if (record.version !== 1 || !isLocale(record.locale) || !(record.owner === null || typeof record.owner === "string" && record.owner.length > 0 && record.owner.length <= 256)) return undefined;
    if (record.pending !== undefined && !(typeof record.pending === "string" && record.pending.length > 0 && record.pending.length <= 100)) return undefined;
    return { version: 1, locale: record.locale, owner: record.owner as string | null, ...(record.pending ? { pending: record.pending as string } : {}) };
  } catch { return undefined; }
}

export function encodeUiPreference(value: UiLocalePreference): string { return encodeURIComponent(JSON.stringify(value)); }

export function resolveUiPreference(input: { owner: string | null; savedLocale?: Locale; cookie?: UiLocalePreference; legacyLocale?: string }): UiLocalePreference {
  const eligible = input.cookie && (input.cookie.owner === input.owner || input.cookie.owner === null) ? input.cookie : undefined;
  const locale = eligible?.pending ? eligible.locale : input.savedLocale ?? eligible?.locale ?? (input.owner === null && !input.cookie && isLocale(input.legacyLocale) ? input.legacyLocale : DEFAULT_LOCALE);
  return { version: 1, locale, owner: input.owner, ...(eligible?.pending ? { pending: eligible.pending } : {}) };
}

/** Only the presentation preference crosses the known RIVET hosts. Auth cookies are untouched. */
export function localeCookieSuffix(hostname: string, secure: boolean): string {
  return `; path=/; max-age=31536000; samesite=lax${isRivetHost(hostname) ? "; domain=rivetjo.com" : ""}${secure ? "; secure" : ""}`;
}
