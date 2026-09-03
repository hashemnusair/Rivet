import Link from "next/link";
import type { AgreementTextSection, SubscriptionAgreement } from "@/lib/domain/types";
import { DocumentRows, DocumentSection, DocumentSheet, DocumentSignature, type DocumentTone } from "./document-sheet";

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

/**
 * The agreement as the owner reads it before signing: the document sheet
 * with the preamble and the clauses, and nothing to fill in yet.
 */
export function AgreementText({ version, sections, reference }: { version: string; sections: AgreementTextSection[]; reference?: string }) {
  return (
    <div data-testid="agreement-text">
      <DocumentSheet label="Subscription agreement" title="Subscription agreement" meta={`${reference ? `${reference} · ` : ""}v${version} · For signature`} reference={reference ?? `v${version.split(" ·")[0] ?? version}`} frame={false}>
        <p className="text-[14px] leading-[1.55] text-ink-2">{PREAMBLE}</p>
        <div className="mt-2 divide-y divide-line">
          <div className="py-6"><Clauses sections={sections} /></div>
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
  const meta = `${agreement.reference} · v${agreement.version} · ${agreement.status === "countersigned" ? "Signed and countersigned" : agreement.status === "void" ? "Void" : "Signed"} · ${agreement.signedAtLocal}`;
  return (
    <DocumentSheet id="receipt-print" testId="agreement-record" label="Subscription agreement" title="Subscription agreement" chip={chip} meta={meta} reference={agreement.reference}>
      <div className="divide-y divide-line">
        <div className="pb-6">
          <DocumentSection number="1" title="Parties">
            <p>This agreement is made between RIVET ([Legal entity name · Commercial registration no.], Amman, Jordan) and {customer.legalName} ({fullAddress(agreement)}), represented by {signatory.name}, for the use of the RIVET platform under the plan and terms recorded below.</p>
          </DocumentSection>
        </div>
        <div className="py-6">
          <DocumentSection number="2" title="Details">
            <DocumentRows rows={[
              { label: "Customer", value: `${customer.legalName}${customer.tradeName && customer.tradeName !== customer.legalName ? ` (trading as ${customer.tradeName})` : ""}` },
              ...(customer.registrationNumber ? [{ label: "Commercial registration", value: customer.registrationNumber }] : []),
              { label: "Address", value: fullAddress(agreement) },
              ...(customer.branches ? [{ label: "Branches", value: String(customer.branches) }] : []),
              { label: "Representative", value: `${signatory.name}${signatory.title ? `, ${signatory.title}` : ""}` },
              { label: AGREEMENT_ID_TYPE_LABELS[signatory.idType], value: <span dir="ltr">{idNumberOverride ?? `${signatory.idNumberMasked} (masked)`}</span>, mono: true },
              ...(signatory.phone ? [{ label: "Phone", value: <span dir="ltr">{signatory.phone}</span> }] : []),
              { label: "Email", value: <span dir="ltr">{signatory.email}</span> },
              { label: "Plan", value: subscription.plan },
              ...(subscription.termMonths ? [{ label: "Initial term", value: `${subscription.termMonths} months` }] : []),
              ...(subscription.quote ? [{ label: "Quote", value: subscription.quote }] : []),
              { label: "Contract start date", value: <span dir="ltr">{subscription.startDate}</span> },
              { label: "Signed at", value: `${agreement.signedAtLocal} (${agreement.timezone}, RIVET server time)` },
              ...(agreement.placeOfSigning ? [{ label: "Place of signing", value: agreement.placeOfSigning }] : []),
              { label: "Document fingerprint", value: <span dir="ltr">{agreement.documentSha256}</span>, mono: true },
              ...(agreement.hashMatch ? [] : [{ label: "Fingerprint check", value: "The browser’s fingerprint did not match RIVET’s copy; flagged for review." }]),
              ...(agreement.status === "void" && agreement.voidReason ? [{ label: "Voided", value: agreement.voidReason }] : []),
            ]} />
          </DocumentSection>
        </div>
        {sections ? <div className="py-6"><Clauses sections={sections} /></div> : null}
        <div className="pt-6">
          <DocumentSection title="Signatures">
            <div className="grid gap-8 sm:grid-cols-2">
              <DocumentSignature
                heading="For the Customer"
                name={signatory.name}
                role={customer.legalName}
                imageDataUrl={agreement.signature.method === "drawn" ? agreement.signature.imageDataUrl : undefined}
                typedName={agreement.signature.method === "typed" ? agreement.signature.typedName : undefined}
                alt={`Signature of ${signatory.name}`}
                caption={`Signed ${agreement.signedAtLocal}, ${agreement.timezone}. Electronic signature under the Electronic Transactions Law No. 15 of 2015.`}
              />
              <DocumentSignature
                heading="For RIVET"
                name={agreement.countersign?.byName ?? "RIVET"}
                role={agreement.countersign?.title}
                imageDataUrl={agreement.countersign?.signature?.method === "drawn" ? agreement.countersign.signature.imageDataUrl : undefined}
                typedName={agreement.countersign ? agreement.countersign.signature?.typedName ?? agreement.countersign.typedName : undefined}
                alt={`Signature of ${agreement.countersign?.byName ?? "RIVET"}`}
                caption={agreement.countersign ? `Countersigned ${agreement.countersign.at.slice(0, 10)}. ${agreement.countersign.byName}, ${agreement.countersign.title}.` : "RIVET will countersign and send the completed agreement."}
                empty="Awaiting RIVET's countersignature"
              />
            </div>
          </DocumentSection>
        </div>
      </div>
    </DocumentSheet>
  );
}
