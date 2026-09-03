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
  billingEmail: "billing@rivetjo.com",
} as const;

/**
 * Facts RIVET has not registered yet. They are shown in place, in the muted
 * ink, so a reader can see what is missing rather than reading an invention.
 */
export const BRAND_PLACEHOLDERS = {
  legalEntity: "[Legal entity name · Commercial registration no.]",
  legalEntityAr: "[اسم الكيان القانوني · رقم السجل التجاري]",
  legalEntityWithTax: "[Legal entity name · Commercial registration no. · Tax no.]",
} as const;

export const BRAND_YEAR = 2026;
