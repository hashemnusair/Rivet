/**
 * The subscription agreement RIVET asks a gym owner to sign at onboarding.
 *
 * The text is code-owned and versioned. A signing hashes the exact canonical
 * text the signer saw (SHA-256), so every published version must stay in the
 * repository for as long as a signed agreement can reference it. Editing a
 * published version in place would silently orphan every hash signed under
 * it: add a new version instead.
 *
 * This module has no Convex imports so the browser, the mock adapter and
 * the server all render and hash the same document.
 */
export const SUBSCRIPTION_AGREEMENT_VERSION = "1.0 · 3 September 2026";

export interface AgreementSection {
  number: string;
  heading: string;
  paragraphs: string[];
}

export const SUBSCRIPTION_AGREEMENT_SECTIONS: readonly AgreementSection[] = [
  {
    number: "01",
    heading: "What this agreement covers",
    paragraphs: [
      "RIVET will provide the Customer with access to the RIVET platform for the gym or gyms named in the signature block, on the Plan selected there. This agreement incorporates RIVET's Terms of service, including the data processing addendum, and the Privacy policy, both published at rivet.jo/terms and rivet.jo/privacy, as they stand on the date of signing. If this agreement and the Terms of service conflict, this agreement applies for the plan, fees, dates and anything else it sets out expressly.",
    ],
  },
  {
    number: "02",
    heading: "Plan, fees and payment",
    paragraphs: [
      "The Customer subscribes to the Plan selected in the signature block, with the modules, branches and staff accounts that Plan includes as confirmed in RIVET's written quote referenced there. Fees are those in the quote, in Jordanian dinars, exclusive of sales tax, which is added at the rate in force.",
      "Fees are invoiced in advance, monthly or yearly as stated in the quote, from the Contract Start Date. Invoices are payable within 14 days by bank transfer, CliQ, card or another method agreed in writing. If an invoice is more than 14 days overdue, RIVET may suspend access after 7 days' written notice, and will restore it on payment. Suspension does not shorten the term or reduce the Fees. RIVET may change Fees for a renewal term with at least 60 days' written notice before the current term ends.",
    ],
  },
  {
    number: "03",
    heading: "Term and renewal",
    paragraphs: [
      "This agreement starts on the Contract Start Date and runs for the Initial Term selected in the signature block. It then renews for successive terms of the same length unless either party gives written notice at least 30 days before the end of the current term.",
      "The Customer may end this agreement early by written notice. Fees for the remainder of the current term remain payable, unless the Customer ends it because RIVET is in material breach and has not fixed the breach within 30 days of written notice.",
    ],
  },
  {
    number: "04",
    heading: "Onboarding",
    paragraphs: [
      "RIVET will set up the Customer's account, import existing member and membership lists supplied by the Customer in a spreadsheet, configure plans and prices as the Customer instructs, and train the Customer's staff: one on-site session for gyms in Amman, or remote sessions elsewhere. The Customer will provide accurate data, a named contact, and the computers, card readers, printers and internet connection needed at the front desk, which are not included.",
    ],
  },
  {
    number: "05",
    heading: "The Customer's responsibilities",
    paragraphs: [
      "The Customer is responsible for the accuracy of the details it provides, for using the platform lawfully as the controller of its members' data under the Personal Data Protection Law No. 24 of 2023, for having a lawful basis and any required consent for messages sent to members through the platform and for honouring opt-outs, for obtaining a parent's or guardian's consent before recording a member under 18, for the actions of its staff on its account, and for keeping login credentials confidential.",
    ],
  },
  {
    number: "06",
    heading: "Data",
    paragraphs: [
      "Customer data belongs to the Customer. RIVET processes it only to provide and support the platform, keep it secure and meet legal obligations, as the data processing addendum in the Terms of service sets out. The Customer may export its data at any time. After this agreement ends, the Customer may export its data for 30 days; RIVET deletes it within 90 days unless the law requires otherwise.",
    ],
  },
  {
    number: "07",
    heading: "Availability and support",
    paragraphs: [
      "RIVET aims to keep the platform available at least 99.5% of the time in any calendar month, excluding planned maintenance announced at least 48 hours ahead. Support is available on WhatsApp and by phone during RIVET's published support hours, currently 09:00 to 21:00 Amman time, Saturday to Thursday. Issues that stop the front desk from working are treated first.",
    ],
  },
  {
    number: "08",
    heading: "Liability",
    paragraphs: [
      "Neither party is liable to the other for lost profits, lost revenue or indirect or consequential loss. RIVET's total liability under this agreement in any twelve-month period is limited to the Fees paid by the Customer for that period. These limits do not apply to fraud, breach of confidentiality, or anything the law does not allow to be limited.",
    ],
  },
  {
    number: "09",
    heading: "Governing law and disputes",
    paragraphs: [
      "This agreement is governed by the laws of the Hashemite Kingdom of Jordan. The parties will first try to resolve any dispute in good faith within 30 days of written notice. Failing that, the courts of Amman have exclusive jurisdiction.",
    ],
  },
  {
    number: "10",
    heading: "Electronic signature",
    paragraphs: [
      "The parties agree to sign this agreement electronically. The signature captured in RIVET, together with the signatory's details, the date and time of signing, the device used, and the cryptographic fingerprint of this text as displayed, constitutes the signed agreement and has the same legal effect as a handwritten signature under the Electronic Transactions Law No. 15 of 2015. RIVET will countersign and send the Customer a copy of the completed agreement.",
    ],
  },
];

export const SUBSCRIPTION_AGREEMENT_PREAMBLE = "Subscription agreement between RIVET, Amman, the Hashemite Kingdom of Jordan (\"RIVET\"), and the Customer identified in the signature block (the gym).";

/** The exact string that is hashed. Never reformat it: whitespace is part of the fingerprint. */
export function canonicalAgreementText(version = SUBSCRIPTION_AGREEMENT_VERSION, sections = SUBSCRIPTION_AGREEMENT_SECTIONS): string {
  const body = sections.map((section) => [`${section.number}. ${section.heading}`, ...section.paragraphs].join("\n")).join("\n\n");
  return `RIVET SUBSCRIPTION AGREEMENT\nVersion ${version}\n\n${SUBSCRIPTION_AGREEMENT_PREAMBLE}\n\n${body}\n`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const AGREEMENT_TERMS_MONTHS = [12, 24] as const;
export const AGREEMENT_PLANS = ["Starter", "Growth", "Pro", "Enterprise"] as const;
export const AGREEMENT_ID_TYPES = ["national", "passport"] as const;
export const SIGNATURE_METHODS = ["drawn", "typed"] as const;
/** PNG data URL cap; a drawn signature at 2× on a phone is well under this. */
export const MAX_SIGNATURE_IMAGE_LENGTH = 160_000;

export function maskIdNumber(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "•".repeat(trimmed.length);
  return `${"•".repeat(trimmed.length - 4)}${trimmed.slice(-4)}`;
}

export function validNationalId(value: string): boolean {
  return /^\d{10}$/.test(value.trim());
}

export function validPassportNumber(value: string): boolean {
  return /^[A-Za-z0-9]{5,20}$/.test(value.trim());
}

export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** RVT-YYYYMMDD-XXXXX, dated on the tenant calendar; the suffix is random. */
export function agreementReference(localDate: string, random: () => number = Math.random): string {
  const compact = localDate.replaceAll("-", "");
  let suffix = "";
  for (let index = 0; index < 5; index += 1) suffix += REFERENCE_ALPHABET[Math.floor(random() * REFERENCE_ALPHABET.length)]!;
  return `RVT-${compact}-${suffix}`;
}
