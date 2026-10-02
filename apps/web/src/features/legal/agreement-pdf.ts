"use client";

import { makeFormatters } from "@/lib/i18n/formatters";
import { agreementLanguageForVersion, agreementSectionsForVersion } from "../../../convex/legalAgreementText";
import { agreementPdfFilename, renderAgreementPdf, type AgreementPdfInput } from "../../../convex/legalAgreementPdf";
import type { AgreementTextSection, SubscriptionAgreement } from "@/lib/domain/types";

/** The record as the PDF builder wants it. Shared with the server copy. */
export function agreementPdfInput(agreement: SubscriptionAgreement): AgreementPdfInput {
  return {
    reference: agreement.reference,
    version: agreement.version,
    status: agreement.status,
    organizationName: agreement.organizationName,
    customer: { legalName: agreement.customer.legalName, address: agreement.customer.address, city: agreement.customer.city },
    signatory: { name: agreement.signatory.name, idType: agreement.signatory.idType, idNumberMasked: agreement.signatory.idNumberMasked, email: agreement.signatory.email },
    subscription: { ...agreement.subscription },
    signature: { method: agreement.signature.method, typedName: agreement.signature.typedName, printImageDataUrl: agreement.signature.printImageDataUrl },
    signedAtLocal: agreement.signedAtLocal,
    timezone: agreement.timezone,
    placeOfSigning: agreement.placeOfSigning,
    documentSha256: agreement.documentSha256,
    hashMatch: agreement.hashMatch,
    countersign: agreement.countersign ? { byName: agreement.countersign.byName, title: agreement.countersign.title, atLocal: agreementLanguageForVersion(agreement.version) === "ar" ? (() => { const f = makeFormatters("ar", "", agreement.timezone); return `${f.date(agreement.countersign!.at)}، ${f.time(agreement.countersign!.at)}`; })() : new Intl.DateTimeFormat("en-GB", { timeZone: agreement.timezone, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(agreement.countersign.at)), signature: agreement.countersign.signature } : undefined,
  };
}

/**
 * The text to print. A record signed under the version this build ships can
 * carry the full agreement; an older one names its version instead of
 * printing text it cannot vouch for.
 */
function sectionsFor(agreement: SubscriptionAgreement, sections?: AgreementTextSection[]) {
  if (sections && sections.length > 0) return sections;
  return agreementSectionsForVersion(agreement.version);
}

/** Build the PDF in the browser and save it. Same bytes as the emailed copy. */
export function downloadAgreementPdf(agreement: SubscriptionAgreement, sections?: AgreementTextSection[]): void {
  const bytes = renderAgreementPdf(agreementPdfInput(agreement), sectionsFor(agreement, sections));
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = agreementPdfFilename(agreement.reference);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
