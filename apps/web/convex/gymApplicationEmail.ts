/**
 * The emails about a public gym application: the applicant's copies
 * (received, approved, rejected) in the language they applied in (English
 * when the form sent none), and RIVET's own internal notice, which stays
 * English. All of them use the branded template.
 *
 * No Convex imports: tests render the same bytes.
 */
import { createTranslator } from "../src/lib/i18n/core";
import { renderBrandedEmail, type EmailRow, type RenderedEmail } from "./emailTemplate";

export type ApplicationLanguage = "en" | "ar";

export interface ApplicantDetails {
  gymName: string;
  gymAddress: string;
  ownerName: string;
  email: string;
  contactNumber: string;
  plan: string;
  billingInterval?: "monthly" | "annual";
  websiteRequested?: boolean;
  promoCode?: string;
}

/**
 * The details exactly as the applicant typed them. The email address and
 * phone number are set as identifiers, so they read left to right in an
 * Arabic message too.
 */
export function applicantDetailRows(values: ApplicantDetails, language: ApplicationLanguage = "en"): EmailRow[] {
  const t = createTranslator(language);
  const interval = t(`communicationCompletion.email.application.interval.${values.billingInterval ?? "monthly"}`);
  return [
    { label: t("communicationCompletion.email.application.details.gymName"), value: values.gymName, strong: true },
    { label: t("communicationCompletion.email.application.details.gymAddress"), value: values.gymAddress },
    { label: t("communicationCompletion.email.application.details.ownerName"), value: values.ownerName, strong: true },
    { label: t("communicationCompletion.email.application.details.email"), value: values.email, mono: true },
    { label: t("communicationCompletion.email.application.details.contactNumber"), value: values.contactNumber, mono: true },
    { label: t("communicationCompletion.email.application.details.plan"), value: t("communicationCompletion.email.application.details.planValue", { plan: values.plan, interval }) },
    ...(values.websiteRequested ? [{ label: t("communicationCompletion.email.application.details.website"), value: t("communicationCompletion.email.application.details.websiteRequested") }] : []),
    ...(values.promoCode ? [{ label: t("communicationCompletion.email.application.details.promoCode"), value: values.promoCode, mono: true }] : []),
  ];
}

export function applicantReceivedEmail(values: ApplicantDetails, language: ApplicationLanguage = "en"): RenderedEmail {
  const t = createTranslator(language);
  return renderBrandedEmail(t("communicationCompletion.email.application.receivedSubject"), {
    language,
    audience: "public",
    headline: t("communicationCompletion.email.application.receivedHeading"),
    paragraphs: [
      t("communicationCompletion.email.application.receivedThanks", { gym: values.gymName }),
      t("communicationCompletion.email.application.receivedNext"),
    ],
    rows: applicantDetailRows(values, language),
    reason: t("communicationCompletion.email.application.signoff"),
  });
}

export function applicantReviewEmail(values: { gymName: string; ownerName: string; plan: string }, decision: "approved" | "rejected", language: ApplicationLanguage = "en"): RenderedEmail {
  const t = createTranslator(language);
  const approved = decision === "approved";
  return renderBrandedEmail(t(approved ? "communicationCompletion.email.application.approvedSubject" : "communicationCompletion.email.application.rejectedSubject", { gym: values.gymName }), {
    language,
    audience: "public",
    headline: t(approved ? "communicationCompletion.email.application.approvedHeading" : "communicationCompletion.email.application.rejectedHeading"),
    paragraphs: [
      t("communicationCompletion.email.application.greeting", { name: values.ownerName }),
      t(approved ? "communicationCompletion.email.application.approvedMessage" : "communicationCompletion.email.application.rejectedMessage"),
    ],
    rows: [
      { label: t("communicationCompletion.email.application.text.gym"), value: values.gymName, strong: true },
      { label: t("communicationCompletion.email.application.text.plan"), value: values.plan },
    ],
    reason: t("communicationCompletion.email.application.signoff"),
  });
}

/** RIVET's own notice of a new application, for the applications inbox. */
export function applicationInternalEmail(values: ApplicantDetails, siteUrl = "https://www.rivetjo.com"): RenderedEmail {
  const origin = siteUrl.replace(/\/$/, "");
  return renderBrandedEmail(`New RIVET gym application · ${values.gymName}`, {
    language: "en",
    audience: "public",
    headline: "New gym application",
    paragraphs: ["A gym owner submitted an application through rivetjo.com.", "Review the applicant before provisioning a gym workspace or sending access."],
    rows: applicantDetailRows(values, "en"),
    button: { label: "Open in the console", href: `${origin}/platform/applications` },
    reason: "Sent to RIVET's applications inbox from the form on rivetjo.com.",
    siteUrl: origin,
  });
}
