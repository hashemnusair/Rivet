"use client";
import { useLocale } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";
import { PRIVACY_POLICY_VERSION, TERMS_OF_SERVICE_VERSION } from "@/lib/legal/legal-versions";
import Link from "next/link";
import type { ReactNode } from "react";
import { RIVET_CONTACT } from "@/lib/rivet-contact";
import { DocumentSection, DocumentSheet } from "./document-sheet";
import { DownloadDocumentButton } from "./download-document-button";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/**
 * The public legal documents on RIVET's document sheet: the lockup and the
 * technical label, the title and version line, a numbered contents list,
 * and one column of numbered sections at the document scale. The download
 * builds a PDF from exactly what is rendered here.
 *
 * On screen the sheet is drawn a little narrower than the A4 master page, so
 * a line of the running text holds about eighty characters; the PDF keeps
 * the page's own measure.
 */
export function LegalDocument({ context, label, title, summary, version, sections, related, documentId }: { documentId?: string; context?: string; label: string; title: string; summary: string; version: string; sections: LegalSection[]; related?: Array<{ label: string; href: string }> }) {
  const { locale, t } = useLocale();
  const f = useFormat();
  const versionNumber = version.split(" ·")[0] ?? version;
  const displayVersion = locale === "ar" && (version === PRIVACY_POLICY_VERSION || version === TERMS_OF_SERVICE_VERSION) ? `${versionNumber} · ${f.date("2026-09-14")}` : version;
  const meta = t("publicDocuments.legalMeta", { version: displayVersion });
  const reference = t("publicDocuments.version", { version: versionNumber });
  const target = documentId ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="px-4 py-8 sm:px-8 lg:py-12">
      {context ? <p className="context-label mx-auto mb-3 max-w-[794px]">{context}</p> : null}
      <DocumentSheet
        locale={locale}
        label={label}
        title={title}
        meta={meta}
        reference={reference}
        testId="legal-document"
        className="max-w-[46rem]"
        actions={<DownloadDocumentButton locale={locale} target={target} label={label} title={title} meta={meta} reference={reference} version={version} />}
      >
        <p className="text-[14px] leading-[1.55] text-ink-2">{summary}</p>

        <nav aria-label={t("publicDocuments.contents")} className="mt-6 border-y border-line py-4">
          <p className="text-[12px] font-semibold text-ink-3">{t("publicDocuments.contents")}</p>
          <ol className="mt-2 grid gap-1 text-[13px] sm:grid-cols-2">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                  <span className="me-2 font-mono text-[11px] text-ink-3">{String(index + 1).padStart(2, "0")}</span>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-2 divide-y divide-line" data-document-body={target}>
          {sections.map((section, index) => (
            <div key={section.id} className="py-6">
              <DocumentSection id={section.id} number={String(index + 1).padStart(2, "0")} title={section.title}>{section.body}</DocumentSection>
            </div>
          ))}
        </div>

        {related?.length ? (
          <p className="mt-6 text-[13px] text-ink-3" data-pdf-skip>
            {t("publicDocuments.related")}{" "}
            {related.map((item, index) => (
              <span key={item.href}>
                {index > 0 ? " · " : ""}
                <Link href={item.href} className="text-ink-2 underline underline-offset-4 hover:text-ink">{item.label}</Link>
              </span>
            ))}
          </p>
        ) : null}
      </DocumentSheet>
    </div>
  );
}

export function ContactBlock() {
  const { locale, t } = useLocale();
  return (
    <dl className="grid gap-2 sm:grid-cols-[140px_1fr]">
      <dt className="text-ink-3">{t("common.label.phone")}</dt>
      <dd><a href={RIVET_CONTACT.phoneHref} className="underline underline-offset-4" dir="ltr">{RIVET_CONTACT.phoneDisplay}</a></dd>
      <dt className="text-ink-3">WhatsApp</dt>
      <dd><a href={RIVET_CONTACT.whatsappHref} className="underline underline-offset-4" dir="ltr">{RIVET_CONTACT.whatsappDisplay}</a></dd>
      <dt className="text-ink-3">Instagram</dt>
      <dd><a href={RIVET_CONTACT.instagramHref} className="underline underline-offset-4" dir="ltr">{RIVET_CONTACT.instagramHandle}</a></dd>
      <dt className="text-ink-3">{t("publicDocuments.post")}</dt>
      <dd>{RIVET_CONTACT.legalName}, {locale === "ar" ? t("agreementDocument.city") : RIVET_CONTACT.city}</dd>
    </dl>
  );
}

export function LegalTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line">
      <table className="w-full text-[13px]">
        <thead className="bg-sunken/50 text-start text-[11px] uppercase tracking-wide text-ink-3">
          <tr>{headers.map((header) => <th key={header} className="px-3 py-2 text-start font-medium">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.join("|")}>{row.map((cell, index) => <td key={index} className="px-3 py-2 align-top text-ink-2">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return <ul className="list-disc space-y-1.5 ps-5">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
}
