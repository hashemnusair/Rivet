import type { AgreementSection } from "./legalAgreementText";

/**
 * The emailed copy of a signed subscription agreement. Pure: no Convex
 * imports, so it can be unit-tested and rendered anywhere. The ID number
 * is always the masked form; email is not the place for the full number.
 */
export interface AgreementCopy {
  reference: string;
  version: string;
  organizationName: string;
  customer: { legalName: string; address: string; city?: string };
  signatory: { name: string; idType: "national" | "passport"; idNumberMasked: string; email: string };
  subscription: { plan: string; startDate: string };
  signature: { method: "drawn" | "typed"; typedName?: string };
  signedAtLocal: string;
  timezone: string;
  documentSha256: string;
  hashMatch: boolean;
  countersign?: { byName: string; title: string; atLocal: string };
}

export type AgreementCopyAudience = "signer" | "rivet";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const ID_LABELS = { national: "Jordanian national ID", passport: "Passport" } as const;

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function rows(copy: AgreementCopy): Array<[string, string]> {
  const address = copy.customer.city && !copy.customer.address.toLowerCase().includes(copy.customer.city.toLowerCase()) ? `${copy.customer.address}, ${copy.customer.city}` : copy.customer.address;
  const signature = copy.signature.method === "typed" ? `Typed and adopted: ${copy.signature.typedName ?? copy.signatory.name}` : "Drawn signature, on file in RIVET";
  const list: Array<[string, string]> = [
    ["Reference", copy.reference],
    ["Agreement version", copy.version],
    ["Gym", copy.customer.legalName],
    ["Address", address],
    ["Plan", copy.subscription.plan],
    ["Contract start date", copy.subscription.startDate],
    ["Signed by", copy.signatory.name],
    [ID_LABELS[copy.signatory.idType], copy.signatory.idNumberMasked],
    ["Signer email", copy.signatory.email],
    ["Signature", signature],
    ["Signed at", `${copy.signedAtLocal} (${copy.timezone}, RIVET server time)`],
    ["Document fingerprint (SHA-256)", copy.documentSha256],
  ];
  if (!copy.hashMatch) list.push(["Fingerprint check", "The signer's browser produced a different fingerprint from RIVET's copy; review before countersigning."]);
  if (copy.countersign) list.push(["Countersigned for RIVET", `${copy.countersign.byName}, ${copy.countersign.title}, ${copy.countersign.atLocal}`]);
  return list;
}

function subjectFor(copy: AgreementCopy, audience: AgreementCopyAudience): string {
  if (copy.countersign) return audience === "signer" ? `RIVET countersigned your subscription agreement ${copy.reference}` : `${copy.organizationName} · agreement ${copy.reference} countersigned`;
  return audience === "signer" ? `Your signed RIVET subscription agreement ${copy.reference}` : `${copy.organizationName} signed the RIVET subscription agreement (${copy.reference})`;
}

function introFor(copy: AgreementCopy, audience: AgreementCopyAudience): string {
  if (audience === "rivet") return copy.countersign ? `The subscription agreement with ${copy.organizationName} is now countersigned. This is RIVET's copy of the record.` : `${copy.signatory.name} signed the RIVET subscription agreement on behalf of ${copy.organizationName}. This is RIVET's copy of the record; countersign it from Platform → Agreements.`;
  return copy.countersign ? "RIVET has countersigned your subscription agreement. This is your copy of the completed record; the same record, with both signatures, is in RIVET under Settings → Agreement." : "Thank you for signing the RIVET subscription agreement. This is your copy of the signed record. RIVET will countersign and send you the completed agreement.";
}

function whereToFind(audience: AgreementCopyAudience, siteUrl?: string): string {
  const base = siteUrl?.replace(/\/$/, "");
  if (audience === "rivet") return base ? `${base}/platform/agreements` : "Platform → Agreements in RIVET";
  return base ? `${base}/settings?section=agreement` : "Settings → Agreement in RIVET";
}

/** Subject, plain text and HTML for one recipient audience. */
export function renderAgreementCopyEmail(copy: AgreementCopy, audience: AgreementCopyAudience, options: { sections?: readonly AgreementSection[]; siteUrl?: string } = {}): RenderedEmail {
  const subject = subjectFor(copy, audience);
  const intro = introFor(copy, audience);
  const link = whereToFind(audience, options.siteUrl);
  const detailRows = rows(copy);
  const sections = options.sections ?? [];

  const textLines = [
    subject,
    "",
    intro,
    "",
    ...detailRows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Full record: ${link}`,
  ];
  if (sections.length > 0) {
    textLines.push("", `RIVET SUBSCRIPTION AGREEMENT · Version ${copy.version}`, "");
    for (const section of sections) textLines.push(`${section.number}. ${section.heading}`, ...section.paragraphs, "");
  }
  textLines.push("The ID number is shown masked in every copy. Electronic signature under the Electronic Transactions Law No. 15 of 2015.");

  const table = detailRows.map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b6a63;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:6px 0;word-break:break-word">${escapeHtml(value)}</td></tr>`).join("");
  const agreementHtml = sections.length > 0
    ? `<h3 style="margin:28px 0 8px;font-size:15px">RIVET subscription agreement · Version ${escapeHtml(copy.version)}</h3>${sections.map((section) => `<h4 style="margin:16px 0 4px;font-size:14px">${escapeHtml(section.number)}. ${escapeHtml(section.heading)}</h4>${section.paragraphs.map((paragraph) => `<p style="margin:0 0 8px">${escapeHtml(paragraph)}</p>`).join("")}`).join("")}`
    : "";
  const html = `<div style="font-family:Arial,sans-serif;color:#1b1a15;line-height:1.6;max-width:680px"><h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(subject)}</h2><p>${escapeHtml(intro)}</p><table style="border-collapse:collapse;font-size:14px;margin:16px 0">${table}</table><p style="font-size:13px">Full record: ${escapeHtml(link)}</p>${agreementHtml}<p style="margin-top:24px;font-size:12px;color:#6b6a63">The ID number is shown masked in every copy. Electronic signature under the Electronic Transactions Law No. 15 of 2015.</p></div>`;

  return { subject, text: textLines.join("\n"), html };
}
