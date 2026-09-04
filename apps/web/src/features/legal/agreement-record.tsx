import Link from "next/link";
import type { AgreementTextSection, SubscriptionAgreement } from "@/lib/domain/types";
import { DocumentRows, DocumentSection, DocumentSheet, DocumentSignature, type DocumentTone } from "./document-sheet";
import { planFee, planSummary } from "../../../convex/planCatalogue";
import { shortDate } from "../../../convex/legalAgreementPdf";

export const AGREEMENT_ID_TYPE_LABELS = { national: "Jordanian national ID", passport: "Passport" } as const;

const PREAMBLE = "Subscription agreement between RIVET, Amman, the Hashemite Kingdom of Jordan (“RIVET”), and the Customer identified in the signature block (the gym).";

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
  startDate: string;
}

const TO_CONFIRM = "Confirmed in the next step";

/**
 * The agreement as the owner reads it before signing: the whole document in
 * order. Sections 1 and 2 are the signature block, so they show the details
 * RIVET already holds and mark what the next step will confirm; the clauses
 * follow; the signatures close it.
 */
export function AgreementText({ version, sections, reference, preview }: { version: string; sections: AgreementTextSection[]; reference?: string; preview?: AgreementPreview }) {
  const lastNumber = sections.length > 0 ? Number.parseInt(sections[sections.length - 1]!.number, 10) + 1 : 13;
  return (
    <div data-testid="agreement-text">
      <DocumentSheet label="Subscription agreement" title="Subscription agreement" meta={`${reference ? `${reference} · ` : ""}v${version} · For signature`} reference={reference ?? `v${version.split(" ·")[0] ?? version}`} frame={false}>
        <p className="text-[14px] leading-[1.55] text-ink-2">{PREAMBLE}</p>
        <div className="mt-2 divide-y divide-line">
          {preview ? (
            <>
              <div className="py-6">
                <DocumentSection number="1" title="Parties">
                  <p>This agreement is made between RIVET ([Legal entity name · Commercial registration no.], Amman, Jordan, “RIVET”) and {preview.legalName} ({preview.address ?? "address confirmed in the next step"}, “the Customer”), represented by {preview.signatoryName}, for the Customer’s use of the RIVET platform under the plan and terms recorded below. It takes effect on the start date and replaces any earlier agreement between the parties for the same service.</p>
                </DocumentSection>
              </div>
              <div className="py-6">
                <DocumentSection number="2" title="Details">
                  <DocumentRows rows={[
                    { label: "Customer", value: preview.legalName },
                    { label: "Representative", value: <span>{preview.signatoryName}, owner · <span dir="ltr">{preview.email}</span></span> },
                    { label: "Address", value: preview.address ?? <span className="text-ink-3">{TO_CONFIRM}</span> },
                    { label: "Plan", value: planSummary(preview.plan) },
                    { label: "Fee", value: `${planFee(preview.plan, "monthly") ?? "As quoted by RIVET in writing"}, excluding tax [treatment to be decided]` },
                    { label: "Billing interval", value: "Monthly, in advance" },
                    { label: "Payment terms", value: "14 days from the invoice date" },
                    { label: "Start date", value: <span dir="ltr">{shortDate(preview.startDate)}</span> },
                    { label: "Term", value: "Rolling monthly; either party may end it with 30 days’ written notice" },
                    { label: "Governing law", value: "The laws of the Hashemite Kingdom of Jordan" },
                  ]} />
                  <p className="text-[12.5px] text-ink-3">Your ID number is recorded in the next step and appears masked beside your signature.</p>
                </DocumentSection>
              </div>
            </>
          ) : null}
          <div className="py-6"><Clauses sections={sections} /></div>
          {preview ? (
            <div className="pt-6">
              <DocumentSection number={String(Number.isFinite(lastNumber) ? lastNumber : 13)} title="Signatures">
                <p>Each party confirms that it has read this agreement, including the details in section 2, and agrees to be bound by it. Signatures are recorded electronically in RIVET together with the signer’s identity and the time of signing. You sign in the final step; RIVET countersigns afterwards.</p>
              </DocumentSection>
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-[12px] text-ink-3">This agreement incorporates the <Link href="/terms" target="_blank" rel="noreferrer" className="underline underline-offset-4">Terms of service</Link> and the <Link href="/privacy" target="_blank" rel="noreferrer" className="underline underline-offset-4">Privacy policy</Link> as published on the date of signing.</p>
      </DocumentSheet>
    </div>
  );
}

function fullAddress(agreement: SubscriptionAgreement): string {
  const { address, city } = agreement.customer;
  return city && !address.toLowerCase().includes(city.toLowerCase()) ? `${address}, ${city}` : address;
}

export function agreementStatusChip(agreement: Pick<SubscriptionAgreement, "status">): { label: string; tone: DocumentTone } {
  if (agreement.status === "void") return { label: "Void", tone: "muted" };
  if (agreement.status === "countersigned") return { label: "Signed and countersigned", tone: "success" };
  return { label: "Signed, awaiting countersignature", tone: "warning" };
}

/**
 * The signed record on the document sheet: what the signer keeps and what
 * RIVET countersigns. The ID number is always masked here; only the platform
 * console can reveal it. Optional details a signing did not record are left
 * out rather than shown empty.
 */
export function AgreementRecord({ agreement, sections, idNumberOverride }: { agreement: SubscriptionAgreement; sections?: AgreementTextSection[]; idNumberOverride?: string }) {
  const { customer, subscription, signatory } = agreement;
  const chip = agreementStatusChip(agreement);
  const versionNumber = agreement.version.split(" ·")[0] ?? agreement.version;
  const statusLabel = agreement.status === "countersigned" ? "Signed and countersigned" : agreement.status === "void" ? "Void" : "Signed";
  const meta = `${agreement.reference} · v${versionNumber} · ${statusLabel} · ${agreement.signedAtLocal.replace(/^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4}).*$/, "$1 $2 $3")}`;
  const role = signatory.title ? signatory.title.charAt(0).toUpperCase() + signatory.title.slice(1) : "Owner";
  const lastNumber = sections && sections.length > 0 ? Number.parseInt(sections[sections.length - 1]!.number, 10) + 1 : 13;
  return (
    <DocumentSheet id="receipt-print" testId="agreement-record" label="Subscription agreement" title="Subscription agreement" chip={chip} meta={meta} reference={agreement.reference}>
      <div className="divide-y divide-line">
        <div className="pb-6">
          <DocumentSection number="1" title="Parties">
            <p>This agreement is made between RIVET ([Legal entity name · Commercial registration no.], Amman, Jordan, “RIVET”) and {customer.legalName} ({fullAddress(agreement)}, “the Customer”), represented by {signatory.name}, for the Customer’s use of the RIVET platform under the plan and terms recorded below. It takes effect on the start date and replaces any earlier agreement between the parties for the same service.</p>
          </DocumentSection>
        </div>
        <div className="py-6">
          <DocumentSection number="2" title="Details">
            <DocumentRows rows={[
              { label: "Customer", value: `${customer.legalName}${customer.tradeName && customer.tradeName !== customer.legalName ? ` (trading as ${customer.tradeName})` : ""}` },
              ...(customer.registrationNumber ? [{ label: "Commercial registration", value: customer.registrationNumber }] : []),
              { label: "Representative", value: <span>{signatory.name}, {role.toLowerCase()} · <span dir="ltr">{signatory.email}</span></span> },
              ...(signatory.phone ? [{ label: "Phone", value: <span dir="ltr">{signatory.phone}</span> }] : []),
              { label: "Address", value: fullAddress(agreement) },
              ...(customer.branches ? [{ label: "Branches", value: String(customer.branches) }] : []),
              { label: "Plan", value: planSummary(subscription.plan) },
              { label: "Fee", value: `${planFee(subscription.plan, "monthly") ?? "As quoted by RIVET in writing"}, excluding tax [treatment to be decided]` },
              { label: "Billing interval", value: "Monthly, in advance" },
              { label: "Payment terms", value: "14 days from the invoice date" },
              { label: "Start date", value: <span dir="ltr">{shortDate(subscription.startDate)}</span> },
              ...(subscription.termMonths ? [{ label: "Initial term", value: `${subscription.termMonths} months` }] : [{ label: "Term", value: "Rolling monthly; either party may end it with 30 days’ written notice" }]),
              ...(subscription.quote ? [{ label: "Quote", value: subscription.quote }] : []),
              { label: "Governing law", value: "The laws of the Hashemite Kingdom of Jordan" },
              ...(agreement.placeOfSigning ? [{ label: "Place of signing", value: agreement.placeOfSigning }] : []),
              ...(agreement.status === "void" && agreement.voidReason ? [{ label: "Voided", value: agreement.voidReason }] : []),
            ]} />
          </DocumentSection>
        </div>
        {sections ? <div className="py-6"><Clauses sections={sections} /></div> : null}
        <div className="pt-6">
          <DocumentSection number={String(Number.isFinite(lastNumber) ? lastNumber : 13)} title="Signatures">
            <p>Each party confirms that it has read this agreement, including the details in section 2, and agrees to be bound by it. Signatures are recorded electronically in RIVET together with the signer’s identity and the time of signing.</p>
            <div className="grid gap-8 pt-2 sm:grid-cols-2">
              <DocumentSignature
                heading="For the Customer"
                name={signatory.name}
                role={`${role}, ${customer.legalName}`}
                identity={<span dir="ltr">{AGREEMENT_ID_TYPE_LABELS[signatory.idType]} {idNumberOverride ?? signatory.idNumberMasked}</span>}
                imageDataUrl={agreement.signature.method === "drawn" ? agreement.signature.imageDataUrl : undefined}
                typedName={agreement.signature.method === "typed" ? agreement.signature.typedName : undefined}
                alt={`Signature of ${signatory.name}`}
                caption={`Signed ${agreement.signedAtLocal}, ${agreement.timezone}. Electronic signature under the Electronic Transactions Law No. 15 of 2015.`}
              />
              <DocumentSignature
                heading="For RIVET"
                name={agreement.countersign?.byName ?? "RIVET"}
                role={agreement.countersign ? `${agreement.countersign.title}, RIVET` : undefined}
                imageDataUrl={agreement.countersign?.signature?.method === "drawn" ? agreement.countersign.signature.imageDataUrl : undefined}
                typedName={agreement.countersign ? agreement.countersign.signature?.typedName ?? agreement.countersign.typedName : undefined}
                alt={`Signature of ${agreement.countersign?.byName ?? "RIVET"}`}
                caption={agreement.countersign ? `Countersigned ${agreement.countersign.at.slice(0, 10)}, ${agreement.timezone}. Electronic signature under the Electronic Transactions Law No. 15 of 2015.` : "RIVET will countersign and send the completed agreement."}
                empty="Awaiting RIVET's countersignature"
              />
            </div>
            <div className="pt-4">
              <DocumentRows rows={[
                { label: "Document fingerprint (SHA-256)", value: <span dir="ltr">{agreement.documentSha256}</span>, mono: true },
                ...(agreement.hashMatch ? [] : [{ label: "Fingerprint check", value: "The browser’s fingerprint did not match RIVET’s copy; flagged for review." }]),
              ]} />
            </div>
          </DocumentSection>
        </div>
      </div>
    </DocumentSheet>
  );
}
