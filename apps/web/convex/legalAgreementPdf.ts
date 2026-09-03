/**
 * The signed subscription agreement as a PDF: what RIVET attaches to the
 * copies it emails, and what the "Download PDF" action produces in the app.
 * Both sides call this with the same record, so the file is identical.
 *
 * The ID number is always the masked form. A PDF travels by email and gets
 * forwarded; the full number stays in the platform console behind a reason
 * and an audit event.
 */
import { renderPdf, encodeBase64, type PdfBlock } from "./pdfDocument";
import { SUBSCRIPTION_AGREEMENT_PREAMBLE, type AgreementSection } from "./legalAgreementText";

export interface AgreementPdfInput {
  reference: string;
  version: string;
  status: "signed" | "countersigned" | "void";
  organizationName: string;
  customer: { legalName: string; address: string; city?: string };
  signatory: { name: string; idType: "national" | "passport"; idNumberMasked: string; email: string };
  subscription: { plan: string; startDate: string };
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

/** The blocks of the document, in order. Exported so tests can read them. */
export function agreementPdfBlocks(input: AgreementPdfInput, sections: readonly AgreementSection[] | undefined): PdfBlock[] {
  const blocks: PdfBlock[] = [
    { type: "title", text: "RIVET subscription agreement" },
    { type: "meta", text: `Version ${input.version} · Reference ${input.reference} · ${input.status === "countersigned" ? "Signed and countersigned" : "Signed, awaiting RIVET's countersignature"}` },
    { type: "spacer", height: 6 },
    { type: "paragraph", text: SUBSCRIPTION_AGREEMENT_PREAMBLE, size: 9.5 },
    { type: "rule" },
    {
      type: "rows",
      rows: [
        ["Gym", input.customer.legalName],
        ["Address", fullAddress(input)],
        ["Plan", input.subscription.plan],
        ["Contract start date", input.subscription.startDate],
        ["Signed by", input.signatory.name],
        [ID_LABELS[input.signatory.idType], `${input.signatory.idNumberMasked} (masked)`],
        ["Email", input.signatory.email],
        ["Signed at", `${input.signedAtLocal} (${input.timezone}, RIVET server time)`],
        ...(input.placeOfSigning ? [["Place of signing", input.placeOfSigning] as [string, string]] : []),
        ["Document fingerprint", input.documentSha256],
        ...(input.hashMatch ? [] : [["Fingerprint check", "The signer's browser produced a different fingerprint from RIVET's copy; flagged for review."] as [string, string]]),
      ],
    },
    { type: "rule" },
  ];

  if (sections && sections.length > 0) {
    for (const section of sections) {
      blocks.push({ type: "heading", text: `${section.number}. ${section.heading}` });
      for (const paragraph of section.paragraphs) blocks.push({ type: "paragraph", text: paragraph });
    }
  } else {
    blocks.push({ type: "paragraph", text: `The full text of agreement version ${input.version} is held by RIVET and is available in the app under Settings, Agreement.` });
  }

  const signatureBlocks: PdfBlock[] = [
    { type: "rule" },
    { type: "heading", text: "Signatures" },
    { type: "paragraph", text: `For the Customer: ${input.signatory.name}`, font: "bold", size: 10 },
  ];
  if (input.signature.method === "drawn" && input.signature.printImageDataUrl) {
    signatureBlocks.push({ type: "image", jpegDataUrl: input.signature.printImageDataUrl, maxWidth: 240, maxHeight: 90 });
  } else if (input.signature.method === "typed") {
    signatureBlocks.push({ type: "paragraph", text: input.signature.typedName ?? input.signatory.name, size: 15 });
    signatureBlocks.push({ type: "paragraph", text: "Typed and adopted as the signatory's signature.", size: 8.5 });
  } else {
    signatureBlocks.push({ type: "paragraph", text: "Signature drawn in RIVET and held with the signed record.", size: 8.5 });
  }
  signatureBlocks.push({ type: "paragraph", text: `Signed ${input.signedAtLocal} (${input.timezone}). Electronic signature under the Electronic Transactions Law No. 15 of 2015.`, size: 8.5 });
  signatureBlocks.push({ type: "spacer", height: 8 });
  signatureBlocks.push({ type: "spacer", height: 4 });
  signatureBlocks.push({ type: "paragraph", text: `For RIVET${input.countersign ? `: ${input.countersign.byName}` : ""}`, font: "bold", size: 10 });
  if (!input.countersign) {
    signatureBlocks.push({ type: "paragraph", text: "RIVET will countersign and send the completed agreement.", size: 9 });
  } else {
    const mark = input.countersign.signature;
    if (mark?.method === "drawn" && mark.printImageDataUrl) {
      signatureBlocks.push({ type: "image", jpegDataUrl: mark.printImageDataUrl, maxWidth: 240, maxHeight: 90 });
    } else if (mark?.method === "drawn") {
      signatureBlocks.push({ type: "paragraph", text: "Signature drawn in RIVET and held with the signed record.", size: 8.5 });
    } else {
      signatureBlocks.push({ type: "paragraph", text: mark?.typedName ?? input.countersign.byName, size: 15 });
      signatureBlocks.push({ type: "paragraph", text: "Typed and adopted as RIVET's signature.", size: 8.5 });
    }
    signatureBlocks.push({ type: "paragraph", text: `${input.countersign.title}, ${input.countersign.atLocal}`, size: 8.5 });
  }
  blocks.push({ type: "keep", blocks: signatureBlocks });
  return blocks;
}

export function renderAgreementPdf(input: AgreementPdfInput, sections?: readonly AgreementSection[]): Uint8Array {
  return renderPdf(agreementPdfBlocks(input, sections), {
    title: `RIVET subscription agreement ${input.reference}`,
    author: "RIVET",
    subject: `${input.customer.legalName} · ${input.subscription.plan} · from ${input.subscription.startDate}`,
    footer: `${input.reference} · RIVET, Amman, Jordan`,
  });
}

export function renderAgreementPdfBase64(input: AgreementPdfInput, sections?: readonly AgreementSection[]): string {
  return encodeBase64(renderAgreementPdf(input, sections));
}
