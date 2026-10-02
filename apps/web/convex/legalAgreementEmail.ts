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

/**
 * Everything a gym reads in this message, in both languages. RIVET's own
 * copy is always English; the signer's copy follows the gym's language.
 */
const COPY = {
  en: {
    idLabels: ID_LABELS,
    rows: { reference: "Reference", version: "Agreement version", gym: "Gym", address: "Address", plan: "Plan", startDate: "Contract start date", signedBy: "Signed by", signedAt: "Signed at", fingerprint: "Document fingerprint", countersignedBy: "Countersigned by", check: "Fingerprint check" },
    serverTime: (at: string, zone: string) => `${at} (${zone}, RIVET server time)`,
    mismatch: "The signer's browser produced a different fingerprint from RIVET's copy; flagged for review.",
    mismatchChip: "Fingerprint mismatch",
    subjectSigned: (reference: string) => `Your signed RIVET subscription agreement ${reference}`,
    subjectCountersigned: (reference: string) => `RIVET countersigned your subscription agreement ${reference}`,
    headlineSigned: "Your subscription agreement is signed",
    headlineCountersigned: "RIVET countersigned your subscription agreement",
    bodySigned: "Thank you for signing your RIVET subscription agreement. Your copy is attached. RIVET will countersign and send you the completed agreement.",
    bodyCountersigned: "RIVET has countersigned your subscription agreement. The completed agreement is attached, and the same record is in RIVET under Settings, Agreement.",
    button: "View the agreement",
    note: "The ID number is shown masked in every copy. Electronic signature under the Electronic Transactions Law No. 15 of 2015.",
  },
  ar: {
    idLabels: { national: "الرقم الوطني الأردني", passport: "جواز السفر" },
    rows: { reference: "المرجع", version: "إصدار الاتفاقية", gym: "النادي", address: "العنوان", plan: "الباقة", startDate: "تاريخ بدء العقد", signedBy: "وقّعها", signedAt: "وقت التوقيع", fingerprint: "بصمة المستند", countersignedBy: "وقّعت عن RIVET", check: "التحقق من البصمة" },
    serverTime: (at: string, zone: string) => `${at} (${zone}، توقيت خادم RIVET)`,
    mismatch: "أنتج متصفح الموقّع بصمة مختلفة عن نسخة RIVET؛ تم وضع علامة للمراجعة.",
    mismatchChip: "اختلاف في البصمة",
    subjectSigned: (reference: string) => `اتفاقية اشتراك RIVET الموقّعة ${reference}`,
    subjectCountersigned: (reference: string) => `وقّعت RIVET اتفاقية اشتراككم ${reference}`,
    headlineSigned: "تم توقيع اتفاقية الاشتراك",
    headlineCountersigned: "وقّعت RIVET اتفاقية اشتراككم",
    bodySigned: "شكرًا لتوقيع اتفاقية اشتراك RIVET. نسختكم مرفقة. ستوقّع RIVET بدورها وترسل لكم الاتفاقية المكتملة.",
    bodyCountersigned: "وقّعت RIVET اتفاقية الاشتراك الخاصة بكم. الاتفاقية المكتملة مرفقة، والسجل نفسه متاح داخل RIVET ضمن الإعدادات، الاتفاقية.",
    button: "عرض الاتفاقية",
    note: "يظهر رقم الهوية مخفيًا في كل نسخة. توقيع إلكتروني بموجب قانون المعاملات الإلكترونية رقم 15 لسنة 2015.",
  },
} as const;

export { escapeHtml } from "./emailTemplate";

function fullAddress(copy: AgreementCopy): string {
  const { address, city } = copy.customer;
  return city && !address.toLowerCase().includes(city.toLowerCase()) ? `${address}, ${city}` : address;
}

function rows(copy: AgreementCopy, language: "en" | "ar"): EmailRow[] {
  const t = COPY[language];
  const list: EmailRow[] = [
    { label: t.rows.reference, value: copy.reference, mono: true },
    { label: t.rows.version, value: copy.version },
    { label: t.rows.gym, value: copy.customer.legalName },
    { label: t.rows.address, value: fullAddress(copy) },
    { label: t.rows.plan, value: copy.subscription.plan },
    { label: t.rows.startDate, value: copy.subscription.startDate },
    { label: t.rows.signedBy, value: copy.signatory.name },
    { label: t.idLabels[copy.signatory.idType], value: copy.signatory.idNumberMasked },
    { label: t.rows.signedAt, value: t.serverTime(copy.signedAtLocal, copy.timezone) },
    { label: t.rows.fingerprint, value: copy.documentSha256, mono: true },
  ];
  if (copy.countersign) list.push({ label: t.rows.countersignedBy, value: `${copy.countersign.byName}, ${copy.countersign.title}, ${copy.countersign.atLocal}` });
  if (!copy.hashMatch) list.push({ label: t.rows.check, value: t.mismatch });
  return list;
}

function subjectFor(copy: AgreementCopy, audience: AgreementCopyAudience, language: "en" | "ar"): string {
  if (audience === "rivet") return copy.countersign ? `${copy.organizationName} · agreement ${copy.reference} countersigned` : `${copy.organizationName} signed the RIVET subscription agreement (${copy.reference})`;
  return copy.countersign ? COPY[language].subjectCountersigned(copy.reference) : COPY[language].subjectSigned(copy.reference);
}

function headlineFor(copy: AgreementCopy, audience: AgreementCopyAudience, language: "en" | "ar"): string {
  if (audience === "rivet") return copy.countersign ? `${copy.organizationName}'s agreement is countersigned` : `${copy.organizationName} signed its subscription agreement`;
  return copy.countersign ? COPY[language].headlineCountersigned : COPY[language].headlineSigned;
}

function paragraphsFor(copy: AgreementCopy, audience: AgreementCopyAudience, language: "en" | "ar"): string[] {
  if (audience === "rivet") {
    return copy.countersign
      ? [`The subscription agreement with ${copy.organizationName} is now countersigned. This is RIVET's copy of the record.`]
      : [`${copy.signatory.name} signed the RIVET subscription agreement on behalf of ${copy.organizationName}. Countersign it from Platform, Agreements.`];
  }
  return [copy.countersign ? COPY[language].bodyCountersigned : COPY[language].bodySigned];
}

/** Subject, plain text and HTML for one recipient audience. */
export function renderAgreementCopyEmail(copy: AgreementCopy, audience: AgreementCopyAudience, options: AgreementCopyOptions = {}): RenderedEmail {
  // RIVET's own copy is internal and stays English whatever the gym prefers.
  const language = audience === "rivet" ? "en" : options.language ?? "en";
  const t = COPY[language];
  const subject = subjectFor(copy, audience, language);
  const path = audience === "rivet" ? "/platform/agreements" : "/settings?section=agreement";
  const siteUrl = (options.siteUrl ?? "https://www.rivetjo.com").replace(/\/$/, "");
  return renderBrandedEmail(subject, {
    language,
    audience: "gym",
    headline: headlineFor(copy, audience, language),
    paragraphs: paragraphsFor(copy, audience, language),
    rows: rows(copy, language),
    button: { label: audience === "rivet" ? "Open in the console" : t.button, href: `${siteUrl}${path}` },
    attachment: options.attachment,
    note: t.note,
    status: copy.hashMatch ? undefined : { label: t.mismatchChip, tone: "warning" },
    siteUrl,
  });
}
