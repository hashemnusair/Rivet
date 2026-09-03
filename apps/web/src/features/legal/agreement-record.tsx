import Link from "next/link";
import { formatDateTime } from "@/lib/utils/dates";
import { RIVET_CONTACT } from "@/lib/rivet-contact";
import type { AgreementTextSection, SubscriptionAgreement } from "@/lib/domain/types";
import { Badge } from "@/components/ui/badge";

export const AGREEMENT_ID_TYPE_LABELS = { national: "Jordanian national ID", passport: "Passport" } as const;

/** The agreement text as displayed to the signer and printed in the copy. */
export function AgreementText({ version, sections, reference }: { version: string; sections: AgreementTextSection[]; reference?: string }) {
  return (
    <div className="space-y-5 text-[13.5px] leading-relaxed text-ink-2" data-testid="agreement-text">
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">Subscription agreement · Version {version}{reference ? ` · Reference ${reference}` : ""}</p>
      <p>Between RIVET, Amman, the Hashemite Kingdom of Jordan (“RIVET”), and the Customer identified in the signature block (the gym).</p>
      {sections.map((section) => (
        <section key={section.number}>
          <h3 className="font-display text-[15px] font-semibold text-ink"><span className="me-2 font-mono text-[11px] font-normal text-ink-3">{section.number}</span>{section.heading}</h3>
          {section.paragraphs.map((paragraph, index) => <p key={index} className="mt-2">{paragraph}</p>)}
        </section>
      ))}
      <p className="text-[12px] text-ink-3">This agreement incorporates the <Link href="/terms" className="underline underline-offset-4">Terms of service</Link> and the <Link href="/privacy" className="underline underline-offset-4">Privacy policy</Link> as published on the date of signing.</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-[11.5px] uppercase tracking-wide text-ink-3">{label}</dt>
      <dd className="text-[13px] text-ink">{children}</dd>
    </div>
  );
}

/**
 * The signed record: what the signer keeps and what RIVET countersigns. The
 * ID number is always masked here; only the platform console can reveal it.
 */
export function AgreementRecord({ agreement, sections, idNumberOverride }: { agreement: SubscriptionAgreement; sections?: AgreementTextSection[]; idNumberOverride?: string }) {
  return (
    <article id="receipt-print" className="panel bg-surface p-6 sm:p-8" data-testid="agreement-record">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-dashed border-line-3 pb-5">
        <div>
          <p className="context-label">Signed subscription agreement</p>
          <h2 className="mt-1 font-display text-[22px] font-semibold tracking-tight">{agreement.reference}</h2>
          <p className="mt-1 text-[12px] text-ink-3">Version {agreement.version} · signed {agreement.signedAtLocal} ({agreement.timezone})</p>
        </div>
        <Badge variant={agreement.status === "countersigned" ? "success" : "warning"} dot>{agreement.status === "countersigned" ? "Countersigned by RIVET" : "Awaiting RIVET countersignature"}</Badge>
      </header>

      {sections ? <div className="border-b border-dashed border-line-3 py-5"><AgreementText version={agreement.version} sections={sections} reference={agreement.reference} /></div> : null}

      <dl className="divide-y divide-line border-b border-dashed border-line-3 py-2">
        <Row label="Customer">{agreement.customer.legalName}{agreement.customer.tradeName && agreement.customer.tradeName !== agreement.customer.legalName ? ` (trading as ${agreement.customer.tradeName})` : ""}</Row>
        <Row label="Commercial registration">{agreement.customer.registrationNumber ?? "To be provided before invoicing"}</Row>
        <Row label="Address">{agreement.customer.address}, {agreement.customer.city}</Row>
        <Row label="Branches">{agreement.customer.branches}</Row>
        <Row label="Plan">{agreement.subscription.plan}</Row>
        <Row label="Contract start date">{agreement.subscription.startDate}</Row>
        <Row label="Initial term">{agreement.subscription.termMonths} months</Row>
        <Row label="Quote">{agreement.subscription.quote ?? "—"}</Row>
      </dl>

      <dl className="divide-y divide-line border-b border-dashed border-line-3 py-2">
        <Row label="Signatory">{agreement.signatory.name} · {agreement.signatory.title}</Row>
        <Row label={AGREEMENT_ID_TYPE_LABELS[agreement.signatory.idType]}><span dir="ltr" className="font-mono">{idNumberOverride ?? agreement.signatory.idNumberMasked}</span></Row>
        <Row label="Phone"><span dir="ltr">{agreement.signatory.phone}</span></Row>
        <Row label="Email"><span dir="ltr">{agreement.signatory.email}</span></Row>
        <Row label="Signature">
          {agreement.signature.method === "drawn" && agreement.signature.imageDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signature captured as a data URL, not an optimizable asset
            <img src={agreement.signature.imageDataUrl} alt={`Signature of ${agreement.signatory.name}`} className="h-20 max-w-full rounded border border-line bg-white object-contain" />
          ) : (
            <span className="font-display text-[22px] italic">{agreement.signature.typedName}</span>
          )}
          <span className="mt-1 block text-[11.5px] text-ink-3">{agreement.signature.method === "drawn" ? "Drawn" : "Typed and adopted"} · {agreement.placeOfSigning}</span>
        </Row>
        <Row label="Signed at">{formatDateTime(agreement.signedAt)} <span className="text-ink-3">(server time)</span></Row>
        <Row label="Document fingerprint"><span dir="ltr" className="break-all font-mono text-[11px]">{agreement.documentSha256}</span>{agreement.hashMatch ? null : <span className="mt-1 block text-[11.5px] text-warning-deep">The browser’s fingerprint did not match RIVET’s copy; flagged for review.</span>}</Row>
      </dl>

      <dl className="divide-y divide-line py-2">
        <Row label="For RIVET">
          {agreement.countersign ? (
            <>
              <span className="font-display text-[20px] italic">{agreement.countersign.typedName}</span>
              <span className="mt-1 block text-[12px] text-ink-2">{agreement.countersign.byName} · {agreement.countersign.title} · {formatDateTime(agreement.countersign.at)}</span>
            </>
          ) : (
            <span className="text-ink-3">RIVET will countersign and send the completed copy.</span>
          )}
        </Row>
      </dl>

      <footer className="mt-4 border-t border-dashed border-line-3 pt-4 text-[11px] text-ink-3">
        RIVET · {RIVET_CONTACT.city} · WhatsApp <span dir="ltr">{RIVET_CONTACT.phoneDisplay}</span> · {RIVET_CONTACT.instagramHandle}. Electronic signature under the Electronic Transactions Law No. 15 of 2015.
      </footer>
    </article>
  );
}
