/**
 * The emailed copy of a signed subscription agreement.
 *
 * The message stays short: what was signed, by whom, when, and the
 * fingerprint, with the agreement itself attached as a PDF. The ID number is
 * always the masked form; email is not the place for the full number.
 */
import { renderBrandedEmail, type EmailRow, type RenderedEmail } from "./emailTemplate";

export interface AgreementCopy {
  reference: string;
  version: string;
  organizationName: string;
  customer: { legalName: string; address: string; city?: string };
  signatory: { name: string; idType: "national" | "passport"; idNumberMasked: string; email: string };
  subscription: { plan: string; startDate: string };
  signature: { method: "drawn" | "typed"; typedName?: string; printImageDataUrl?: string };
  signedAtLocal: string;
  timezone: string;
  documentSha256: string;
  hashMatch: boolean;
  countersign?: { byName: string; title: string; atLocal: string; signature?: { method: "drawn" | "typed"; typedName?: string; printImageDataUrl?: string } };
}

/** Who the copy is written for: the person who signed, or RIVET itself. */
export type AgreementCopyAudience = "signer" | "rivet";

export interface AgreementCopyOptions {
  siteUrl?: string;
  attachment?: { filename: string; sizeLabel: string };
  language?: "en" | "ar";
}

const ID_LABELS = { national: "Jordanian national ID", passport: "Passport" } as const;

export { escapeHtml } from "./emailTemplate";

function fullAddress(copy: AgreementCopy): string {
  const { address, city } = copy.customer;
  return city && !address.toLowerCase().includes(city.toLowerCase()) ? `${address}, ${city}` : address;
}

function rows(copy: AgreementCopy): EmailRow[] {
  const list: EmailRow[] = [
    { label: "Reference", value: copy.reference, mono: true },
    { label: "Agreement version", value: copy.version },
    { label: "Gym", value: copy.customer.legalName },
    { label: "Address", value: fullAddress(copy) },
    { label: "Plan", value: copy.subscription.plan },
    { label: "Contract start date", value: copy.subscription.startDate },
    { label: "Signed by", value: copy.signatory.name },
    { label: ID_LABELS[copy.signatory.idType], value: copy.signatory.idNumberMasked },
    { label: "Signed at", value: `${copy.signedAtLocal} (${copy.timezone}, RIVET server time)` },
    { label: "Document fingerprint", value: copy.documentSha256, mono: true },
  ];
  if (copy.countersign) list.push({ label: "Countersigned by", value: `${copy.countersign.byName}, ${copy.countersign.title}, ${copy.countersign.atLocal}` });
  if (!copy.hashMatch) list.push({ label: "Fingerprint check", value: "The signer's browser produced a different fingerprint from RIVET's copy; flagged for review." });
  return list;
}

function subjectFor(copy: AgreementCopy, audience: AgreementCopyAudience): string {
  if (copy.countersign) return audience === "signer" ? `RIVET countersigned your subscription agreement ${copy.reference}` : `${copy.organizationName} · agreement ${copy.reference} countersigned`;
  return audience === "signer" ? `Your signed RIVET subscription agreement ${copy.reference}` : `${copy.organizationName} signed the RIVET subscription agreement (${copy.reference})`;
}

function headlineFor(copy: AgreementCopy, audience: AgreementCopyAudience): string {
  if (copy.countersign) return audience === "signer" ? "RIVET countersigned your subscription agreement" : `${copy.organizationName}'s agreement is countersigned`;
  return audience === "signer" ? "Your subscription agreement is signed" : `${copy.organizationName} signed its subscription agreement`;
}

function paragraphsFor(copy: AgreementCopy, audience: AgreementCopyAudience): string[] {
  if (audience === "rivet") {
    return copy.countersign
      ? [`The subscription agreement with ${copy.organizationName} is now countersigned. This is RIVET's copy of the record.`]
      : [`${copy.signatory.name} signed the RIVET subscription agreement on behalf of ${copy.organizationName}. Countersign it from Platform, Agreements.`];
  }
  return copy.countersign
    ? ["RIVET has countersigned your subscription agreement. The completed agreement is attached, and the same record is in RIVET under Settings, Agreement."]
    : ["Thank you for signing your RIVET subscription agreement. Your copy is attached. RIVET will countersign and send you the completed agreement."];
}

/** Subject, plain text and HTML for one recipient audience. */
export function renderAgreementCopyEmail(copy: AgreementCopy, audience: AgreementCopyAudience, options: AgreementCopyOptions = {}): RenderedEmail {
  const subject = subjectFor(copy, audience);
  const path = audience === "rivet" ? "/platform/agreements" : "/settings?section=agreement";
  const siteUrl = (options.siteUrl ?? "https://www.rivetjo.com").replace(/\/$/, "");
  return renderBrandedEmail(subject, {
    language: options.language ?? "en",
    audience: "gym",
    headline: headlineFor(copy, audience),
    paragraphs: paragraphsFor(copy, audience),
    rows: rows(copy),
    button: { label: audience === "rivet" ? "Open in the console" : "View the agreement", href: `${siteUrl}${path}` },
    attachment: options.attachment,
    note: "The ID number is shown masked in every copy. Electronic signature under the Electronic Transactions Law No. 15 of 2015.",
    status: copy.hashMatch ? undefined : { label: "Fingerprint mismatch", tone: "warning" },
    siteUrl,
  });
}
