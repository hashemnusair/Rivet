/**
 * The signed subscription agreement as a PDF: what RIVET attaches to the
 * copies it emails, and what the "Download PDF" action produces in the app.
 * Both sides call this with the same record, so the file is identical.
 *
 * The ID number is always the masked form. A PDF travels by email and gets
 * forwarded; the full number stays in the platform console behind a reason
 * and an audit event.
 */
import { renderPdf, encodeBase64, mm, type PdfBlock } from "./pdfDocument";
import { planFee, planSummary } from "./planCatalogue";
import { RIVET_GLYPH_JPEG, RIVET_LOCKUP_JPEG } from "./brandAssets";
import { BRAND_CONTACT, BRAND_PLACEHOLDERS } from "./brandTokens";
import { type AgreementSection } from "./legalAgreementText";

export interface AgreementPdfInput {
  reference: string;
  version: string;
  status: "signed" | "countersigned" | "void";
  organizationName: string;
  customer: { legalName: string; address: string; city?: string };
  signatory: { name: string; idType: "national" | "passport"; idNumberMasked: string; email: string; title?: string };
  subscription: { plan: string; startDate: string; billingInterval?: "monthly" | "annual" };
  signature: { method: "drawn" | "typed"; typedName?: string; printImageDataUrl?: string };
  signedAtLocal: string;
  timezone: string;
  placeOfSigning?: string;
  documentSha256: string;
  hashMatch: boolean;
  countersign?: { byName: string; title: string; atLocal: string; signature?: { method: "drawn" | "typed"; typedName?: string; printImageDataUrl?: string } };
}

const ID_LABELS = { national: "Jordanian national ID", passport: "Passport" } as const;

export function agreementPdfFilename(reference: string): string {
  return `RIVET-agreement-${reference.replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
}

function fullAddress(input: AgreementPdfInput): string {
  const { address, city } = input.customer;
  return city && !address.toLowerCase().includes(city.toLowerCase()) ? `${address}, ${city}` : address;
}

const INTERVALS = { monthly: "Monthly, in advance", annual: "Yearly, in advance" } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "3 Sep 2026" from an ISO date; anything else is returned as it came. */
export function shortDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${Number.parseInt(match[3]!, 10)} ${MONTHS[Number.parseInt(match[2]!, 10) - 1]} ${match[1]}`;
}

/** "3 Sep 2026" from a local timestamp such as "3 September 2026, 14:32". */
function shortLocal(value: string): string {
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})/.exec(value);
  if (!match) return value;
  return `${match[1]} ${match[2]!.slice(0, 3)} ${match[3]}`;
}

/**
 * The blocks of the document, in order: 1 Parties and 2 Details, then the
 * clauses numbered 3 to 12 straight after them with a hairline between
 * sections, then 13 Signatures with the fingerprint, kept together on one
 * page. Nothing forces a page break, so every page fills.
 */
export function agreementPdfBlocks(input: AgreementPdfInput, sections: readonly AgreementSection[] | undefined): PdfBlock[] {
  const countersigned = input.status === "countersigned";
  const interval = input.subscription.billingInterval ?? "monthly";
  const versionNumber = input.version.split(" ·")[0] ?? input.version;
  const statusLabel = countersigned ? "Signed and countersigned" : input.status === "void" ? "Void" : "Signed";
  const blocks: PdfBlock[] = [
    {
      type: "title",
      text: "Subscription agreement",
      chip: input.status === "void"
        ? { label: "Void", tone: "muted" }
        : countersigned
          ? { label: "Signed and countersigned", tone: "success" }
          : { label: "Signed, awaiting countersignature", tone: "warning" },
    },
    { type: "meta", text: `${input.reference} · v${versionNumber} · ${statusLabel} · ${shortLocal(input.signedAtLocal)}` },
    { type: "heading", text: "1. Parties" },
    { type: "paragraph", text: `This agreement is made between RIVET (${BRAND_PLACEHOLDERS.legalEntity}, ${BRAND_CONTACT.city}, "RIVET") and ${input.customer.legalName} (${fullAddress(input)}, "the Customer"), represented by ${input.signatory.name}, for the Customer's use of the RIVET platform under the plan and terms recorded below. It takes effect on the start date and replaces any earlier agreement between the parties for the same service.` },
    { type: "heading", text: "2. Details" },
    {
      type: "rows",
      rows: [
        { label: "Customer", value: input.customer.legalName },
        { label: "Representative", value: `${input.signatory.name}, ${input.signatory.title ?? "owner"} · ${input.signatory.email}` },
        { label: "Address", value: fullAddress(input) },
        { label: "Plan", value: planSummary(input.subscription.plan) },
        { label: "Fee", value: `${planFee(input.subscription.plan, interval) ?? "As quoted by RIVET in writing"}, excluding tax [treatment to be decided]` },
        { label: "Billing interval", value: INTERVALS[interval] },
        { label: "Payment terms", value: "14 days from the invoice date" },
        { label: "Start date", value: shortDate(input.subscription.startDate) },
        { label: "Term", value: `Rolling ${interval === "annual" ? "yearly" : "monthly"}; either party may end it with 30 days' written notice` },
        { label: "Governing law", value: "The laws of the Hashemite Kingdom of Jordan" },
        ...(input.placeOfSigning ? [{ label: "Place of signing", value: input.placeOfSigning }] : []),
      ],
    },
  ];

  if (sections && sections.length > 0) {
    // The clauses follow the details directly, a hairline between sections,
    // so the page fills and nothing is pushed out of sight.
    for (const section of sections) {
      blocks.push({ type: "rule" });
      blocks.push({ type: "heading", text: `${section.number}. ${section.heading}` });
      for (const paragraph of section.paragraphs) blocks.push({ type: "paragraph", text: paragraph });
    }
  } else {
    blocks.push({ type: "paragraph", text: `The full text of agreement version ${input.version} is held by RIVET and is available in the app under Settings, Agreement.` });
  }

  const signatureBlock = (
    heading: string,
    name: string,
    role: string,
    identity: string | undefined,
    mark: { method: "drawn" | "typed"; typedName?: string; printImageDataUrl?: string } | undefined,
    caption: string,
  ): PdfBlock[] => {
    const out: PdfBlock[] = [
      { type: "paragraph", text: heading, font: "bold", size: 10 },
      { type: "paragraph", text: name, size: 10 },
      { type: "paragraph", text: role, size: 9, color: "#8B887B" },
    ];
    if (identity) out.push({ type: "paragraph", text: identity, size: 9, color: "#8B887B" });
    if (mark?.method === "drawn") {
      // The signature sits in a hairline frame at the size the identity
      // system sets, whether or not a printable image reached the server.
      out.push({ type: "frame", width: mm(85), height: mm(32), jpegDataUrl: mark.printImageDataUrl });
      if (!mark.printImageDataUrl) out.push({ type: "paragraph", text: "Signature drawn in RIVET and held with the signed record.", size: 8.5 });
    } else {
      out.push({ type: "paragraph", text: mark?.typedName ?? name, size: 15 });
      out.push({ type: "paragraph", text: `Typed and adopted as ${heading === "For RIVET" ? "RIVET's" : "the signatory's"} signature.`, size: 8.5 });
    }
    out.push({ type: "paragraph", text: caption, size: 8.5, color: "#8B887B" });
    return out;
  };

  const lastNumber = sections && sections.length > 0 ? Number.parseInt(sections[sections.length - 1]!.number, 10) + 1 : 3;
  // The signatures stay together on one page, but take the next free space
  // rather than a page of their own.
  const signatures: PdfBlock[] = [];
  signatures.push({ type: "rule" });
  signatures.push({ type: "heading", text: `${Number.isFinite(lastNumber) ? lastNumber : 13}. Signatures` });
  signatures.push({ type: "paragraph", text: "Each party confirms that it has read this agreement, including the details in section 2, and agrees to be bound by it. Signatures are recorded electronically in RIVET together with the signer's identity and the time of signing." });
  signatures.push({ type: "spacer", height: 6 });
  signatures.push(...signatureBlock(
    "For the Customer",
    input.signatory.name,
    `${input.signatory.title ? input.signatory.title.charAt(0).toUpperCase() + input.signatory.title.slice(1) : "Owner"}, ${input.customer.legalName}`,
    `${ID_LABELS[input.signatory.idType]} ${input.signatory.idNumberMasked}`,
    input.signature,
    `Signed ${input.signedAtLocal}, ${input.timezone}. Electronic signature under the Electronic Transactions Law No. 15 of 2015.`,
  ));
  signatures.push({ type: "spacer", height: 12 });
  if (input.countersign) {
    signatures.push(...signatureBlock(
      "For RIVET",
      input.countersign.byName,
      `${input.countersign.title}, RIVET`,
      undefined,
      input.countersign.signature,
      `Countersigned ${input.countersign.atLocal}, ${input.timezone}. Electronic signature under the Electronic Transactions Law No. 15 of 2015.`,
    ));
  } else {
    signatures.push({ type: "paragraph", text: "For RIVET", font: "bold", size: 10 });
    signatures.push({ type: "paragraph", text: "RIVET will countersign and send the completed agreement.", size: 9, color: "#8B887B" });
  }
  signatures.push({ type: "spacer", height: 12 });
  signatures.push({ type: "rows", rows: [
    { label: "Document fingerprint (SHA-256)", value: input.documentSha256 },
    ...(input.hashMatch ? [] : [{ label: "Fingerprint check", value: "The signer's browser produced a different fingerprint from RIVET's copy; flagged for review." }]),
  ] });
  blocks.push({ type: "keep", blocks: signatures });
  return blocks;
}

export function renderAgreementPdf(input: AgreementPdfInput, sections?: readonly AgreementSection[]): Uint8Array {
  return renderPdf(agreementPdfBlocks(input, sections), {
    title: `RIVET subscription agreement ${input.reference}`,
    author: "RIVET",
    subject: `${input.customer.legalName} · ${input.subscription.plan} · from ${input.subscription.startDate}`,
    documentLabel: "Subscription agreement",
    runningTitle: "Subscription agreement",
    footer: `${input.reference} · RIVET, ${BRAND_CONTACT.city}`,
    footerPlaceholder: BRAND_PLACEHOLDERS.legalEntity,
    lockupJpeg: RIVET_LOCKUP_JPEG,
    glyphJpeg: RIVET_GLYPH_JPEG,
  });
}

export function renderAgreementPdfBase64(input: AgreementPdfInput, sections?: readonly AgreementSection[]): string {
  return encodeBase64(renderAgreementPdf(input, sections));
}
