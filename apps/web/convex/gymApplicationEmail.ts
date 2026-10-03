/**
 * The applicant's copies of a public gym application: received, approved
 * and rejected. Written in the language the applicant applied in (English
 * when the form sent none); RIVET's own internal notice stays English.
 *
 * No Convex imports: tests render the same bytes.
 */
import { createTranslator } from "../src/lib/i18n/core";

export type ApplicationLanguage = "en" | "ar";

export interface ApplicantDetails {
  gymName: string;
  gymAddress: string;
  ownerName: string;
  email: string;
  contactNumber: string;
  plan: string;
  billingInterval?: "monthly" | "annual";
}

export function escapeApplicationHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

const escape = escapeApplicationHtml;

function wrap(language: ApplicationLanguage, inner: string): string {
  // English keeps its original bytes; Arabic declares its direction for mail clients.
  return language === "ar"
    ? `<div dir="rtl" lang="ar" style="font-family:Tahoma,Arial,sans-serif;color:#1b1a15;line-height:1.7;text-align:right">${inner}</div>`
    : `<div style="font-family:Arial,sans-serif;color:#1b1a15;line-height:1.6">${inner}</div>`;
}

/** The details table. Values are exactly as the applicant typed them. */
export function applicantDetailsHtml(values: ApplicantDetails, language: ApplicationLanguage = "en"): string {
  const t = createTranslator(language);
  const cell = language === "ar" ? "padding:8px 0;text-align:right" : "padding:8px 0";
  const interval = t(`communicationCompletion.email.application.interval.${values.billingInterval ?? "monthly"}`);
  return `<table style="border-collapse:collapse;width:100%;max-width:560px;font-family:Arial,sans-serif;font-size:14px">
    <tr><td style="${cell};color:#777">${t("communicationCompletion.email.application.details.gymName")}</td><td style="${cell};font-weight:600">${escape(values.gymName)}</td></tr>
    <tr><td style="${cell};color:#777">${t("communicationCompletion.email.application.details.gymAddress")}</td><td style="${cell}">${escape(values.gymAddress)}</td></tr>
    <tr><td style="${cell};color:#777">${t("communicationCompletion.email.application.details.ownerName")}</td><td style="${cell};font-weight:600">${escape(values.ownerName)}</td></tr>
    <tr><td style="${cell};color:#777">${t("communicationCompletion.email.application.details.email")}</td><td style="${cell}"><a href="mailto:${encodeURIComponent(values.email)}">${escape(values.email)}</a></td></tr>
    <tr><td style="${cell};color:#777">${t("communicationCompletion.email.application.details.contactNumber")}</td><td style="${cell}"${language === "ar" ? ' dir="ltr"' : ""}>${escape(values.contactNumber)}</td></tr>
    <tr><td style="${cell};color:#777">${t("communicationCompletion.email.application.details.plan")}</td><td style="${cell}">${t("communicationCompletion.email.application.details.planValue", { plan: escape(values.plan), interval: escape(interval) })}</td></tr>
  </table>`;
}

export function applicantReceivedEmail(values: ApplicantDetails, language: ApplicationLanguage = "en"): { subject: string; html: string; text: string } {
  const t = createTranslator(language);
  const labels = (key: "gym" | "address" | "owner" | "email" | "contact" | "plan") => t(`communicationCompletion.email.application.text.${key}`);
  return {
    subject: t("communicationCompletion.email.application.receivedSubject"),
    html: wrap(language, `<h2>${t("communicationCompletion.email.application.receivedHeading")}</h2><p>${t("communicationCompletion.email.application.receivedThanks", { gym: `<strong>${escape(values.gymName)}</strong>` })}</p><p>${t("communicationCompletion.email.application.receivedNext")}</p>${applicantDetailsHtml(values, language)}`),
    text: `${t("communicationCompletion.email.application.receivedText", { gym: values.gymName })}\n\n${labels("gym")}: ${values.gymName}\n${labels("address")}: ${values.gymAddress}\n${labels("owner")}: ${values.ownerName}\n${labels("email")}: ${values.email}\n${labels("contact")}: ${values.contactNumber}\n${labels("plan")}: ${values.plan}`,
  };
}

export function applicantReviewEmail(values: { gymName: string; ownerName: string; plan: string }, decision: "approved" | "rejected", language: ApplicationLanguage = "en"): { subject: string; html: string; text: string } {
  const t = createTranslator(language);
  const approved = decision === "approved";
  const heading = t(approved ? "communicationCompletion.email.application.approvedHeading" : "communicationCompletion.email.application.rejectedHeading");
  const message = t(approved ? "communicationCompletion.email.application.approvedMessage" : "communicationCompletion.email.application.rejectedMessage");
  const gym = t("communicationCompletion.email.application.text.gym");
  const plan = t("communicationCompletion.email.application.text.plan");
  return {
    subject: t(approved ? "communicationCompletion.email.application.approvedSubject" : "communicationCompletion.email.application.rejectedSubject", { gym: values.gymName }),
    html: wrap(language, `<h2>${heading}</h2><p>${t("communicationCompletion.email.application.greeting", { name: escape(values.ownerName) })}</p><p>${message}</p><p><strong>${gym}:</strong> ${escape(values.gymName)}<br/><strong>${plan}:</strong> ${escape(values.plan)}</p><p style="color:#777;font-size:12px">${t("communicationCompletion.email.application.signoff")}</p>`),
    text: `${heading}\n\n${t("communicationCompletion.email.application.greeting", { name: values.ownerName })}\n\n${message}\n\n${gym}: ${values.gymName}\n${plan}: ${values.plan}`,
  };
}
