import { createTranslator } from "@/lib/i18n/core";
import { makeFormatters } from "@/lib/i18n/formatters";
import { isolate } from "@/lib/i18n/bidi";
import { agreementLanguageForVersion } from "../../../convex/legalAgreementText";
import Link from "next/link";
import type { AgreementTextSection, SubscriptionAgreement } from "@/lib/domain/types";
import { DocumentRows, DocumentSection, DocumentSheet, DocumentSignature, type DocumentTone } from "./document-sheet";
import { planSummary } from "../../../convex/planCatalogue";
import { BRAND_LEGAL } from "../../../convex/brandTokens";
import { shortDate } from "../../../convex/legalAgreementPdf";

export const AGREEMENT_ID_TYPE_LABELS = { national: "Jordanian national ID", passport: "Passport" } as const;


/** The numbered clauses, at the document scale. */
function Clauses({ sections }: { sections: AgreementTextSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <DocumentSection key={section.number} number={section.number} title={section.heading}>
          {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </DocumentSection>
      ))}
    </>
  );
}

/** What the reader will confirm in the next step, shown in its place. */
export interface AgreementPreview {
  legalName: string;
  address?: string;
  signatoryName: string;
  email: string;
  plan: string;
  feeLabel?: string;
  billingInterval?: "monthly" | "annual";
  startDate: string;
}


/**
 * The agreement as the owner reads it before signing: the whole document in
 * order. Sections 1 and 2 are the signature block, so they show the details
 * RIVET already holds and mark what the next step will confirm; the clauses
 * follow; the signatures close it.
 */
export function AgreementText({ version, sections, reference, preview }: { version: string; sections: AgreementTextSection[]; reference?: string; preview?: AgreementPreview }) {
  const language = agreementLanguageForVersion(version);
  const t = createTranslator(language);
  const value = (text: string) => language === "ar" ? isolate(text) : text;
  const date = (iso: string) => language === "ar" ? makeFormatters(language, "").date(iso) : shortDate(iso);
  const lastNumber = sections.length > 0 ? Number.parseInt(sections[sections.length - 1]!.number, 10) + 1 : 13;
  return (
    <div data-testid="agreement-text">
      <DocumentSheet locale={language} label={t("agreementDocument.title")} title={t("agreementDocument.title")} meta={`${reference ? `${reference} · ` : ""}v${version} · ${t("agreementDocument.forSignature")}`} reference={reference ?? `v${version.split(" ·")[0] ?? version}`} frame={false}>
        <p className="text-[14px] leading-[1.55] text-ink-2">{t("agreementDocument.preamble")}</p>
        <div className="mt-2 divide-y divide-line">
          {preview ? (
            <>
              <div className="py-6">
                <DocumentSection number="1" title={t("agreementDocument.parties")}>
                  <p>{t("agreementDocument.partiesBody", { rivet: BRAND_LEGAL.legalEntity ?? "RIVET", city: t("agreementDocument.city"), customer: value(preview.legalName), address: value(preview.address ?? t("agreementDocument.addressNext")), signatory: value(preview.signatoryName) })}</p>
                </DocumentSection>
              </div>
              <div className="py-6">
                <DocumentSection number="2" title={t("agreementDocument.details")}>
                  <DocumentRows rows={[
                    { label: t("agreementDocument.customer"), value: preview.legalName },
                    { label: t("agreementDocument.representative"), value: <span>{preview.signatoryName}, {t("agreementDocument.ownerLower")} · <span dir="ltr">{preview.email}</span></span> },
                    { label: t("agreementDocument.address"), value: preview.address ?? <span className="text-ink-3">{t("agreementDocument.confirmNext")}</span> },
                    { label: t("agreementDocument.plan"), value: planSummary(preview.plan) },
                    { label: t("agreementDocument.fee"), value: t("agreementDocument.feeTax", { fee: preview.feeLabel ?? t("agreementDocument.quotedFee") }) },
                    { label: t("agreementDocument.interval"), value: t(preview.billingInterval === "annual" ? "agreementDocument.annualAdvance" : "agreementDocument.monthlyAdvance") },
                    { label: t("agreementDocument.paymentTerms"), value: t("agreementDocument.paymentDays") },
                    { label: t("agreementDocument.startDate"), value: <bdi>{date(preview.startDate)}</bdi> },
                    { label: t("agreementDocument.term"), value: t("agreementDocument.termNotice", { interval: t(preview.billingInterval === "annual" ? "documents.annualAdjective" : "documents.monthlyAdjective") }) },
                    { label: t("agreementDocument.law"), value: t("agreementDocument.jordanLaw") },
                  ]} />
                  <p className="text-[12.5px] text-ink-3">{t("agreementDocument.idNext")}</p>
                </DocumentSection>
              </div>
            </>
          ) : null}
          <div className="py-6"><Clauses sections={sections} /></div>
          {preview ? (
            <div className="pt-6">
              <DocumentSection number={String(Number.isFinite(lastNumber) ? lastNumber : 13)} title={t("agreementDocument.signatures")}>
                <p>{t("agreementDocument.signatureConsent")} {t("agreementDocument.signatureNext")}</p>
              </DocumentSection>
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-[12px] text-ink-3">{t("agreementDocument.includes")}{" "}<Link href="/terms" target="_blank" rel="noreferrer" className="underline underline-offset-4">{t("agreementFlow.terms")}</Link>{" "}{t("agreementDocument.and")}{" "}<Link href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-4">{t("agreementFlow.privacy")}</Link>{" "}{t("agreementDocument.publishedOn")}</p>
      </DocumentSheet>
    </div>
  );
}

function fullAddress(agreement: SubscriptionAgreement): string {
  const { address, city } = agreement.customer;
  return city && !address.toLowerCase().includes(city.toLowerCase()) ? `${address}, ${city}` : address;
}

export function agreementStatusChip(agreement: Pick<SubscriptionAgreement, "status">, language: "en" | "ar" = "en"): { label: string; tone: DocumentTone } {
  const t = createTranslator(language);
  if (agreement.status === "void") return { label: t("agreementDocument.cancelled"), tone: "muted" };
  if (agreement.status === "countersigned") return { label: t("agreementDocument.bothSides"), tone: "success" };
  return { label: t("agreementDocument.waiting"), tone: "warning" };
}

/**
 * The signed record on the document sheet: what the signer keeps and what
 * RIVET countersigns. The ID number is always masked here; only the platform
 * console can reveal it. Optional details a signing did not record are left
 * out rather than shown empty.
 */
export function AgreementRecord({ agreement, sections, idNumberOverride }: { agreement: SubscriptionAgreement; sections?: AgreementTextSection[]; idNumberOverride?: string }) {
  const language = agreementLanguageForVersion(agreement.version);
  const t = createTranslator(language);
  const value = (text: string) => language === "ar" ? isolate(text) : text;
  const date = (iso: string) => language === "ar" ? makeFormatters(language, "", agreement.timezone).date(iso) : shortDate(iso);
  const { customer, subscription, signatory } = agreement;
  const chip = agreementStatusChip(agreement, language);
  const versionNumber = agreement.version.split(" ·")[0] ?? agreement.version;
  const statusLabel = agreement.status === "countersigned" ? t("agreementDocument.bothSides") : agreement.status === "void" ? t("agreementDocument.cancelled") : t("agreementDocument.signed");
  const meta = `${agreement.reference} · v${versionNumber} · ${statusLabel} · ${agreement.signedAtLocal.replace(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}).*$/, "$1 $2 $3")}`;
  const role = signatory.title ? signatory.title.charAt(0).toUpperCase() + signatory.title.slice(1) : t("agreementDocument.owner");
  const lastNumber = sections && sections.length > 0 ? Number.parseInt(sections[sections.length - 1]!.number, 10) + 1 : 13;
  return (
    <DocumentSheet locale={language} id="receipt-print" testId="agreement-record" label={t("agreementDocument.title")} title={t("agreementDocument.title")} chip={chip} meta={meta} reference={agreement.reference}>
      <div className="divide-y divide-line">
        <div className="pb-6">
          <DocumentSection number="1" title={t("agreementDocument.parties")}>
            <p>{t("agreementDocument.partiesBody", { rivet: BRAND_LEGAL.legalEntity ?? "RIVET", city: t("agreementDocument.city"), customer: value(customer.legalName), address: value(fullAddress(agreement)), signatory: value(signatory.name) })}</p>
          </DocumentSection>
        </div>
        <div className="py-6">
          <DocumentSection number="2" title={t("agreementDocument.details")}>
            <DocumentRows rows={[
              { label: t("agreementDocument.customer"), value: customer.tradeName && customer.tradeName !== customer.legalName ? t("agreementDocument.tradingAs", { legalName: customer.legalName, tradeName: customer.tradeName }) : customer.legalName },
              ...(customer.registrationNumber ? [{ label: t("agreementDocument.commercialRegistration"), value: customer.registrationNumber }] : []),
              { label: t("agreementDocument.representative"), value: <span>{signatory.name}, {role.toLowerCase()} · <span dir="ltr">{signatory.email}</span></span> },
              ...(signatory.phone ? [{ label: t("agreementDocument.phone"), value: <span dir="ltr">{signatory.phone}</span> }] : []),
              { label: t("agreementDocument.address"), value: fullAddress(agreement) },
              ...(customer.branches ? [{ label: t("agreementDocument.branches"), value: String(customer.branches) }] : []),
              { label: t("agreementDocument.plan"), value: planSummary(subscription.plan) },
              { label: t("agreementDocument.fee"), value: t("agreementDocument.feeTax", { fee: subscription.feeLabel ?? t("agreementDocument.quotedFee") }) },
              { label: t("agreementDocument.interval"), value: t(subscription.billingInterval === "annual" ? "agreementDocument.annualAdvance" : "agreementDocument.monthlyAdvance") },
              { label: t("agreementDocument.paymentTerms"), value: t("agreementDocument.paymentDays") },
              { label: t("agreementDocument.startDate"), value: <bdi>{date(subscription.startDate)}</bdi> },
              ...(subscription.termMonths ? [{ label: t("agreementDocument.initialTerm"), value: t("agreementDocument.months", { count: subscription.termMonths }) }] : [{ label: t("agreementDocument.term"), value: t("agreementDocument.termNotice", { interval: t(subscription.billingInterval === "annual" ? "documents.annualAdjective" : "documents.monthlyAdjective") }) }]),
              ...(subscription.quote ? [{ label: t("agreementDocument.quote"), value: subscription.quote }] : []),
              { label: t("agreementDocument.law"), value: t("agreementDocument.jordanLaw") },
              ...(agreement.placeOfSigning ? [{ label: t("agreementDocument.place"), value: agreement.placeOfSigning }] : []),
              ...(agreement.status === "void" && agreement.voidReason ? [{ label: t("agreementDocument.cancelled"), value: agreement.voidReason }] : []),
            ]} />
          </DocumentSection>
        </div>
        {sections ? <div className="py-6"><Clauses sections={sections} /></div> : null}
        <div className="pt-6">
          <DocumentSection number={String(Number.isFinite(lastNumber) ? lastNumber : 13)} title={t("agreementDocument.signatures")}>
            <p>{t("agreementDocument.signatureConsent")}</p>
            <div className="grid gap-8 pt-2 sm:grid-cols-2">
              <DocumentSignature
                heading={t("agreementDocument.forCustomer")}
                name={signatory.name}
                role={`${role}, ${customer.legalName}`}
                identity={<span>{t(signatory.idType === "national" ? "agreementDocument.nationalId" : "agreementDocument.passport")} <bdi dir="ltr">{idNumberOverride ?? signatory.idNumberMasked}</bdi></span>}
                imageDataUrl={agreement.signature.method === "drawn" ? agreement.signature.imageDataUrl : undefined}
                typedName={agreement.signature.method === "typed" ? agreement.signature.typedName : undefined}
                alt={t("agreementDocument.signatureAlt", { name: signatory.name })}
                caption={t("agreementDocument.signedCaption", { date: agreement.signedAtLocal, timezone: agreement.timezone })}
              />
              <DocumentSignature
                heading={t("agreementDocument.forRivet")}
                name={agreement.countersign?.byName ?? "RIVET"}
                role={agreement.countersign ? `${agreement.countersign.title}, RIVET` : undefined}
                imageDataUrl={agreement.countersign?.signature?.method === "drawn" ? agreement.countersign.signature.imageDataUrl : undefined}
                typedName={agreement.countersign ? agreement.countersign.signature?.typedName ?? agreement.countersign.typedName : undefined}
                alt={t("agreementDocument.signatureAlt", { name: agreement.countersign?.byName ?? "RIVET" })}
                caption={agreement.countersign ? t("agreementDocument.countersignedCaption", { date: language === "ar" ? makeFormatters(language, "", agreement.timezone).dateTime(agreement.countersign.at) : agreement.countersign.at.slice(0, 10), timezone: agreement.timezone }) : t("agreementDocument.willSign")}
                empty={t("agreementDocument.emptySignature")}
              />
            </div>
            <div className="pt-4">
              <DocumentRows rows={[
                { label: t("agreementDocument.fingerprint"), value: <span dir="ltr">{agreement.documentSha256}</span>, mono: true },
                ...(agreement.hashMatch ? [] : [{ label: t("agreementDocument.fingerprintCheck"), value: t("agreementDocument.fingerprintMismatch") }]),
              ]} />
            </div>
          </DocumentSection>
        </div>
      </div>
    </DocumentSheet>
  );
}
