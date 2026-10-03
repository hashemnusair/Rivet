import { createTranslator } from "../src/lib/i18n/core";
import { makeFormatters } from "../src/lib/i18n/formatters";
import { isolate, isolateLtr } from "../src/lib/i18n/bidi";
import { agreementLanguageForVersion } from "./legalAgreementText";
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
import { planSummary } from "./planCatalogue";
import { RIVET_GLYPH_JPEG, RIVET_LOCKUP_JPEG } from "./brandAssets";
import { BRAND_LEGAL, brandLegalLine } from "./brandTokens";
import { type AgreementSection } from "./legalAgreementText";

export interface AgreementPdfInput {
  reference: string;
  version: string;
  status: "signed" | "countersigned" | "void";
  organizationName: string;
  customer: { legalName: string; address: string; city?: string };
  signatory: { name: string; idType: "national" | "passport"; idNumberMasked: string; email: string; title?: string };
  subscription: { plan: string; startDate: string; billingInterval?: "monthly" | "annual"; feeLabel?: string };
  signature: { method: "drawn" | "typed"; typedName?: string; printImageDataUrl?: string };
  signedAtLocal: string;
  timezone: string;
  placeOfSigning?: string;
  documentSha256: string;
  hashMatch: boolean;
  countersign?: { byName: string; title: string; atLocal: string; signature?: { method: "drawn" | "typed"; typedName?: string; printImageDataUrl?: string } };
}


export function agreementPdfFilename(reference: string): string {
  return `RIVET-agreement-${reference.replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
}

function fullAddress(input: AgreementPdfInput): string {
  const { address, city } = input.customer;
  return city && !address.toLowerCase().includes(city.toLowerCase()) ? `${address}, ${city}` : address;
}

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
  const locale = agreementLanguageForVersion(input.version);
  const t = createTranslator(locale);
  const value = (text: string) => locale === "ar" ? isolate(text) : text;
  const ref = (text: string) => locale === "ar" ? isolateLtr(text) : text;
  const countersigned = input.status === "countersigned";
  const interval = input.subscription.billingInterval ?? "monthly";
  const versionNumber = input.version.split(" ·")[0] ?? input.version;
  const statusLabel = countersigned ? t("agreementDocument.countersigned") : input.status === "void" ? t("agreementDocument.void") : t("agreementDocument.signed");
  const blocks: PdfBlock[] = [
    {
      type: "title",
      text: t("agreementDocument.title"),
      chip: input.status === "void"
        ? { label: t("agreementDocument.void"), tone: "muted" }
        : countersigned
          ? { label: t("agreementDocument.countersigned"), tone: "success" }
          : { label: t("agreementDocument.awaiting"), tone: "warning" },
    },
    { type: "meta", text: `${input.reference} · v${versionNumber} · ${statusLabel} · ${value(shortLocal(input.signedAtLocal))}` },
    { type: "heading", text: `1. ${t("agreementDocument.parties")}` },
    { type: "paragraph", text: t("agreementDocument.partiesBody", { rivet: BRAND_LEGAL.legalEntity ?? "RIVET", city: t("agreementDocument.city"), customer: value(input.customer.legalName), address: value(fullAddress(input)), signatory: value(input.signatory.name) }) },
    { type: "heading", text: `2. ${t("agreementDocument.details")}` },
    {
      type: "rows",
      rows: [
        { label: t("agreementDocument.customer"), value: input.customer.legalName },
        { label: t("agreementDocument.representative"), value: `${value(input.signatory.name)}, ${input.signatory.title ?? t("agreementDocument.ownerLower")} · ${ref(input.signatory.email)}` },
        { label: t("agreementDocument.address"), value: fullAddress(input) },
        { label: t("agreementDocument.plan"), value: planSummary(input.subscription.plan) },
        { label: t("agreementDocument.fee"), value: t("agreementDocument.feeTax", { fee: input.subscription.feeLabel ?? t("agreementDocument.quotedFee") }) },
        { label: t("agreementDocument.interval"), value: t(interval === "annual" ? "agreementDocument.annualAdvance" : "agreementDocument.monthlyAdvance") },
        { label: t("agreementDocument.paymentTerms"), value: t("agreementDocument.paymentDays") },
        { label: t("agreementDocument.startDate"), value: locale === "ar" ? makeFormatters(locale, "", input.timezone).date(input.subscription.startDate) : shortDate(input.subscription.startDate) },
        { label: t("agreementDocument.term"), value: t("agreementDocument.termNotice", { interval: t(interval === "annual" ? "documents.annualAdjective" : "documents.monthlyAdjective") }) },
        { label: t("agreementDocument.law"), value: t("agreementDocument.jordanLaw") },
        ...(input.placeOfSigning ? [{ label: t("agreementDocument.place"), value: input.placeOfSigning }] : []),
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
    blocks.push({ type: "paragraph", text: t("agreementDocument.missingText", { version: ref(input.version) }) });
  }

  const signatureBlock = (
    party: "customer" | "rivet",
    name: string,
    role: string,
    identity: string | undefined,
    mark: { method: "drawn" | "typed"; typedName?: string; printImageDataUrl?: string } | undefined,
    caption: string,
  ): PdfBlock[] => {
    const heading = t(party === "rivet" ? "agreementDocument.forRivet" : "agreementDocument.forCustomer");
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
      if (!mark.printImageDataUrl) out.push({ type: "paragraph", text: t("agreementDocument.drawn"), size: 8.5 });
    } else {
      out.push({ type: "paragraph", text: mark?.typedName ?? name, size: 15 });
      out.push({ type: "paragraph", text: t(party === "rivet" ? "agreementDocument.typedRivet" : "agreementDocument.typedSigner"), size: 8.5 });
    }
    out.push({ type: "paragraph", text: caption, size: 8.5, color: "#8B887B" });
    return out;
  };

  const lastNumber = sections && sections.length > 0 ? Number.parseInt(sections[sections.length - 1]!.number, 10) + 1 : 3;
  // The signatures stay together on one page, but take the next free space
  // rather than a page of their own.
  const signatures: PdfBlock[] = [];
  signatures.push({ type: "rule" });
  signatures.push({ type: "heading", text: `${Number.isFinite(lastNumber) ? lastNumber : 13}. ${t("agreementDocument.signatures")}` });
  signatures.push({ type: "paragraph", text: t("agreementDocument.signatureConsent") });
  signatures.push({ type: "spacer", height: 6 });
  signatures.push(...signatureBlock(
    "customer",
    input.signatory.name,
    `${input.signatory.title ? input.signatory.title.charAt(0).toUpperCase() + input.signatory.title.slice(1) : t("agreementDocument.owner")}, ${input.customer.legalName}`,
    `${t(input.signatory.idType === "national" ? "agreementDocument.nationalId" : "agreementDocument.passport")} ${ref(input.signatory.idNumberMasked)}`,
    input.signature,
    t("agreementDocument.signedCaption", { date: input.signedAtLocal, timezone: ref(input.timezone) }),
  ));
  signatures.push({ type: "spacer", height: 12 });
  if (input.countersign) {
    signatures.push(...signatureBlock(
      "rivet",
      input.countersign.byName,
      `${input.countersign.title}, RIVET`,
      undefined,
      input.countersign.signature,
      t("agreementDocument.countersignedCaption", { date: input.countersign.atLocal, timezone: ref(input.timezone) }),
    ));
  } else {
    signatures.push({ type: "paragraph", text: t("agreementDocument.forRivet"), font: "bold", size: 10 });
    signatures.push({ type: "paragraph", text: t("agreementDocument.willSign"), size: 9, color: "#8B887B" });
  }
  signatures.push({ type: "spacer", height: 12 });
  signatures.push({ type: "rows", rows: [
    { label: t("agreementDocument.fingerprint"), value: input.documentSha256 },
    ...(input.hashMatch ? [] : [{ label: t("agreementDocument.fingerprintCheck"), value: t("agreementDocument.fingerprintMismatch") }]),
  ] });
  blocks.push({ type: "keep", blocks: signatures });
  return blocks;
}

export function renderAgreementPdf(input: AgreementPdfInput, sections?: readonly AgreementSection[]): Uint8Array {
  const locale = agreementLanguageForVersion(input.version);
  const t = createTranslator(locale);
  return renderPdf(agreementPdfBlocks(input, sections), {
    title: t("agreementDocument.metadata", { reference: input.reference }),
    locale,
    author: "RIVET",
    subject: `${input.customer.legalName} · ${input.subscription.plan} · from ${input.subscription.startDate}`,
    documentLabel: t("agreementDocument.title"),
    runningTitle: t("agreementDocument.title"),
    footer: `${input.reference} · RIVET, ${t("agreementDocument.city")}`,
    footerPlaceholder: brandLegalLine() || undefined,
    lockupJpeg: RIVET_LOCKUP_JPEG,
    glyphJpeg: RIVET_GLYPH_JPEG,
  });
}

export function renderAgreementPdfBase64(input: AgreementPdfInput, sections?: readonly AgreementSection[]): string {
  return encodeBase64(renderAgreementPdf(input, sections));
}
