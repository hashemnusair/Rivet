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
import { RIVET_GLYPH_JPEG, RIVET_LOCKUP_JPEG } from "./brandAssets";
import { BRAND_CONTACT, BRAND_PLACEHOLDERS } from "./brandTokens";
import { type AgreementSection } from "./legalAgreementText";

export interface AgreementPdfInput {
  reference: string;
  version: string;
  status: "signed" | "countersigned" | "void";
  organizationName: string;
  customer: { legalName: string; address: string; city?: string };
  signatory: { name: string; idType: "national" | "passport"; idNumberMasked: string; email: string };
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

/**
 * The blocks of the document, in order. Exported so tests can read them.
 *
 * Page one carries the parties and the details; the numbered clauses follow
 * on continuation pages; the signatures and the fingerprint close the
 * document on a page of their own.
 */
export function agreementPdfBlocks(input: AgreementPdfInput, sections: readonly AgreementSection[] | undefined): PdfBlock[] {
  const countersigned = input.status === "countersigned";
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
    { type: "meta", text: `${input.reference} · v${input.version} · ${countersigned ? "Signed and countersigned" : input.status === "void" ? "Void" : "Signed"} · ${input.signedAtLocal}` },
    { type: "heading", text: "Parties" },
    { type: "paragraph", text: `This agreement is made between RIVET (${BRAND_PLACEHOLDERS.legalEntity}, ${BRAND_CONTACT.city}, "RIVET") and ${input.customer.legalName} (${fullAddress(input)}, "the Customer"), represented by ${input.signatory.name}, for the Customer's use of the RIVET platform under the plan and terms recorded below.` },
    { type: "heading", text: "Details" },
    {
      type: "rows",
      rows: [
        { label: "Customer", value: input.customer.legalName },
        { label: "Representative", value: `${input.signatory.name} · ${input.signatory.email}` },
        { label: ID_LABELS[input.signatory.idType], value: `${input.signatory.idNumberMasked} (masked)` },
        { label: "Address", value: fullAddress(input) },
        { label: "Plan", value: input.subscription.plan },
        { label: "Fee", value: "As quoted by RIVET in writing or, absent a quote, RIVET's published price for the plan; excluding tax [treatment to be decided]" },
        { label: "Billing interval", value: input.subscription.billingInterval ? INTERVALS[input.subscription.billingInterval] : "Monthly or yearly, in advance, as agreed" },
        { label: "Payment terms", value: "14 days from the invoice date" },
        { label: "Start date", value: input.subscription.startDate },
        { label: "Term", value: "Rolling; either party may end it with 30 days' written notice" },
        { label: "Governing law", value: "The laws of the Hashemite Kingdom of Jordan" },
        ...(input.placeOfSigning ? [{ label: "Place of signing", value: input.placeOfSigning }] : []),
      ],
    },
  ];

  if (sections && sections.length > 0) {
    blocks.push({ type: "pagebreak" });
    for (const section of sections) {
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
    mark: { method: "drawn" | "typed"; typedName?: string; printImageDataUrl?: string } | undefined,
    caption: string,
  ): PdfBlock[] => {
    const out: PdfBlock[] = [
      { type: "paragraph", text: heading, font: "bold", size: 10 },
      { type: "paragraph", text: name, size: 10 },
      { type: "paragraph", text: role, size: 9, color: "#8B887B" },
    ];
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

  blocks.push({ type: "pagebreak" });
  blocks.push({ type: "heading", text: "Signatures" });
  blocks.push({ type: "paragraph", text: "Each party confirms that it has read this agreement, including the details above, and agrees to be bound by it. Signatures are recorded electronically in RIVET together with the signer's identity and the time of signing." });
  blocks.push({ type: "spacer", height: 6 });
  blocks.push(...signatureBlock(
    "For the Customer",
    input.signatory.name,
    input.customer.legalName,
    input.signature,
    `Signed ${input.signedAtLocal}, ${input.timezone}. Electronic signature under the Electronic Transactions Law No. 15 of 2015.`,
  ));
  blocks.push({ type: "spacer", height: 12 });
  if (input.countersign) {
    blocks.push(...signatureBlock(
      "For RIVET",
      input.countersign.byName,
      `${input.countersign.title}, RIVET`,
      input.countersign.signature,
      `Countersigned ${input.countersign.atLocal}, ${input.timezone}. Electronic signature under the Electronic Transactions Law No. 15 of 2015.`,
    ));
  } else {
    blocks.push({ type: "paragraph", text: "For RIVET", font: "bold", size: 10 });
    blocks.push({ type: "paragraph", text: "RIVET will countersign and send the completed agreement.", size: 9, color: "#8B887B" });
  }
  blocks.push({ type: "spacer", height: 12 });
  blocks.push({ type: "rows", rows: [
    { label: "Document fingerprint (SHA-256)", value: input.documentSha256 },
    ...(input.hashMatch ? [] : [{ label: "Fingerprint check", value: "The signer's browser produced a different fingerprint from RIVET's copy; flagged for review." }]),
  ] });
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
