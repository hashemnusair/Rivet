/**
 * The RIVET communications palette, shared by the email templates and the
 * PDF documents so both read as one family with the product interface.
 * Values are fixed by the identity system; never nudge them per surface.
 */
export const BRAND = {
  paper: "#F5F4EF",
  surface: "#FFFFFF",
  sunken: "#EDECE5",
  sunkenStrong: "#E4E2D8",
  ink: "#1B1A15",
  inkSecondary: "#565449",
  inkMuted: "#8B887B",
  inkDisabled: "#B6B3A6",
  line: "#E3E1D6",
  lineStrong: "#D2CFC2",
  lineEmphasis: "#BDB9A9",
  night: "#15140F",
  nightRaised: "#1E1C15",
  nightInk: "#F2F0E6",
  nightInkSecondary: "#A6A394",
  nightLine: "#2E2C22",
  signal: "#D9232B",
  signalDeep: "#AD1B22",
  signalSoft: "#FAE9E9",
  successInk: "#176E44",
  successBg: "#E6F1EA",
  warningInk: "#96620A",
  warningBg: "#F7EDD9",
  dangerInk: "#B3261E",
  dangerBg: "#F9E7E5",
} as const;

/** RIVET's own contact block, as it appears at the foot of every message. */
export const BRAND_CONTACT = {
  city: "Amman, Jordan",
  cityAr: "عمّان، الأردن",
  phone: "077 837 8608",
  whatsapp: "wa.me/962778378608",
  instagram: "@rivet.jo",
  website: "www.rivetjo.com",
  supportHours: "Support 09:00–21:00 Amman time, Saturday to Thursday",
  supportHoursAr: "الدعم 09:00–21:00 بتوقيت عمّان، من السبت إلى الخميس",
  /** The one address RIVET prints: on invoices, in footers, for questions. */
  email: "sales@rivetjo.com",
} as const;

/**
 * Registered facts about RIVET as a company. Each line is printed only once
 * it is filled in; until then the documents simply name RIVET and Amman,
 * with nothing invented and no bracketed placeholder on a customer's page.
 */
export const BRAND_LEGAL: {
  /** e.g. "RIVET Technologies LLC" */
  legalEntity?: string;
  /** Commercial registration number. */
  registrationNumber?: string;
  /** Tax number, once registered. */
  taxNumber?: string;
  /** How tax is applied on invoices, once decided; omitted until then. */
  taxNote?: string;
  /** Bank transfer details, once opened: bank, account name, IBAN, SWIFT. */
  bank?: { bank: string; accountName: string; iban: string; swift?: string };
  /** CliQ alias, once registered. */
  cliqAlias?: string;
} = {};

/** "RIVET Technologies LLC · CR 12345" when known; empty otherwise. */
export function brandLegalLine(): string {
  return [BRAND_LEGAL.legalEntity, BRAND_LEGAL.registrationNumber ? `CR ${BRAND_LEGAL.registrationNumber}` : undefined, BRAND_LEGAL.taxNumber ? `Tax no. ${BRAND_LEGAL.taxNumber}` : undefined].filter(Boolean).join(" · ");
}

export const BRAND_YEAR = 2026;
