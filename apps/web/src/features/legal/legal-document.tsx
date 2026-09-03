import Link from "next/link";
import type { ReactNode } from "react";
import { RIVET_CONTACT } from "@/lib/rivet-contact";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/**
 * Shared layout for the public legal documents: a numbered contents list, the
 * version line, and one column of sections. Print-friendly and readable on a
 * phone without any client-side code.
 */
export function LegalDocument({ context, title, summary, version, sections, related }: { context?: string; title: string; summary: string; version: string; sections: LegalSection[]; related?: Array<{ label: string; href: string }> }) {
  return (
    <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8 lg:py-16" data-testid="legal-document">
      {context ? <p className="context-label">{context}</p> : null}
      <h1 className={context ? "mt-3 font-display text-[34px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[42px]" : "font-display text-[34px] font-semibold leading-[1.1] tracking-tight text-ink sm:text-[42px]"}>{title}</h1>
      <p className="mt-5 text-[15px] leading-relaxed text-ink-2">{summary}</p>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3">Version {version} · Governed by the laws of the Hashemite Kingdom of Jordan</p>

      <nav aria-label="Contents" className="mt-10 border-y border-line py-5">
        <p className="context-label">Contents</p>
        <ol className="mt-3 grid gap-1.5 text-[13px] sm:grid-cols-2">
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

      <div className="mt-10 space-y-10">
        {sections.map((section, index) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="font-display text-[20px] font-semibold tracking-tight text-ink">
              <span className="me-3 font-mono text-[12px] font-normal text-ink-3">{String(index + 1).padStart(2, "0")}</span>
              {section.title}
            </h2>
            <div className="legal-body mt-4 space-y-3 text-[14px] leading-relaxed text-ink-2">{section.body}</div>
          </section>
        ))}
      </div>

      {related?.length ? (
        <p className="mt-12 border-t border-line pt-6 text-[13px] text-ink-3">
          Related documents:{" "}
          {related.map((item, index) => (
            <span key={item.href}>
              {index > 0 ? " · " : ""}
              <Link href={item.href} className="text-ink-2 underline underline-offset-4 hover:text-ink">{item.label}</Link>
            </span>
          ))}
        </p>
      ) : null}
    </article>
  );
}

export function ContactBlock() {
  return (
    <dl className="grid gap-2 sm:grid-cols-[140px_1fr]">
      <dt className="text-ink-3">Phone</dt>
      <dd><a href={RIVET_CONTACT.phoneHref} className="underline underline-offset-4" dir="ltr">{RIVET_CONTACT.phoneDisplay}</a></dd>
      <dt className="text-ink-3">WhatsApp</dt>
      <dd><a href={RIVET_CONTACT.whatsappHref} className="underline underline-offset-4" dir="ltr">{RIVET_CONTACT.whatsappDisplay}</a></dd>
      <dt className="text-ink-3">Instagram</dt>
      <dd><a href={RIVET_CONTACT.instagramHref} className="underline underline-offset-4" dir="ltr">{RIVET_CONTACT.instagramHandle}</a></dd>
      <dt className="text-ink-3">Post</dt>
      <dd>{RIVET_CONTACT.legalName}, {RIVET_CONTACT.city}</dd>
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
