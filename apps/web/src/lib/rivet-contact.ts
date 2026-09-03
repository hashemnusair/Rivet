/**
 * RIVET's own contact details. One place, used by every footer, legal page,
 * confirmation and signing screen so a number can never drift between them.
 */
export const RIVET_CONTACT = {
  legalName: "RIVET",
  city: "Amman, Jordan",
  /** Display form, as printed on cards and in footers. */
  phoneDisplay: "077 837 8608",
  /** International form for tel: links and WhatsApp. */
  phoneE164: "+962778378608",
  phoneHref: "tel:+962778378608",
  whatsappHref: "https://wa.me/962778378608",
  whatsappDisplay: "wa.me/962778378608",
  instagramHandle: "@rivet.jo",
  instagramHref: "https://instagram.com/rivet.jo",
  /** Published support window quoted in the Terms and the subscription agreement. */
  supportHours: "09:00–21:00 Amman time, Saturday to Thursday",
} as const;

export const LEGAL_LINKS = [
  { label: "Privacy policy", href: "/privacy" },
  { label: "Terms of service", href: "/terms" },
] as const;
