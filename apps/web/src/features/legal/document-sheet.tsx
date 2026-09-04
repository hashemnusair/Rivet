import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { RIVET_CONTACT } from "@/lib/rivet-contact";

/**
 * The master page of RIVET's document system, on screen.
 *
 * Every document RIVET shows or sends follows one anatomy: the lockup and an
 * uppercase technical label above a hairline; a title with a quiet status
 * chip; a mono meta line; numbered sections at the document scale; label
 * and value rows on a fixed label column; signature frames; and a footer
 * naming the reference, RIVET, and the facts not registered yet. The PDF
 * renderer draws the same page, so a document reads identically on screen
 * and in the file.
 */
export type DocumentTone = "success" | "warning" | "danger" | "muted";

const TONE_CLASSES: Record<DocumentTone, string> = {
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning-deep",
  danger: "bg-signal-soft text-signal-deep",
  muted: "bg-sunken text-ink-3",
};

export const DOCUMENT_LEGAL_PLACEHOLDER = "[Legal entity name · Commercial registration no.]";

export function DocumentChip({ label, tone }: { label: string; tone: DocumentTone }) {
  return <span className={cn("inline-flex h-[22px] items-center rounded-[4px] px-2 text-[12px] font-semibold", TONE_CLASSES[tone])}>{label}</span>;
}

export function DocumentSheet({
  label,
  title,
  chip,
  meta,
  reference,
  children,
  frame = true,
  actions,
  className,
  testId,
  id,
}: {
  /** Uppercase technical label at the end of the header: PRIVACY POLICY, INVOICE. */
  label: string;
  title: string;
  chip?: { label: string; tone: DocumentTone };
  /** Reference · version · status · date, in the mono face. */
  meta: string;
  /** Footer reference; the label is used when a document has none. */
  reference?: string;
  children: ReactNode;
  /** Off when the sheet sits inside a dialog that already draws a surface. */
  frame?: boolean;
  actions?: ReactNode;
  className?: string;
  testId?: string;
  id?: string;
}) {
  return (
    <article
      id={id}
      data-testid={testId}
      className={cn("document-sheet mx-auto w-full max-w-[794px] bg-surface text-ink", frame && "border border-line", className)}
    >
      <header className="flex items-end justify-between gap-6 border-b border-line px-6 pb-4 pt-6 sm:px-14 sm:pt-12">
        {/* eslint-disable-next-line @next/next/no-img-element -- the brand file as supplied, never redrawn */}
        <img src="/brand/rivet-lockup.png" alt="RIVET" className="h-auto w-[112px] sm:w-[128px]" />
        <span className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">{label}</span>
      </header>

      <div className="px-6 py-6 sm:px-14 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight text-ink sm:text-[28px]">{title}</h1>
          <div className="flex items-center gap-3">
            {chip ? <DocumentChip label={chip.label} tone={chip.tone} /> : null}
            {actions}
          </div>
        </div>
        <p className="mt-2 font-mono text-[11.5px] text-ink-3">{meta}</p>
        <div className="document-body mt-6">{children}</div>
      </div>

      <footer className="border-t border-line px-6 pb-6 pt-4 sm:px-14">
        <div className="flex flex-wrap items-baseline justify-between gap-2 font-mono text-[11px] text-ink-3">
          <span className="font-medium uppercase tracking-[0.06em]">{reference ?? label}</span>
          <span>RIVET, {RIVET_CONTACT.city}</span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-ink-disabled">{DOCUMENT_LEGAL_PLACEHOLDER}</p>
      </footer>
    </article>
  );
}

/** A numbered section at the document scale. */
export function DocumentSection({ number, title, id, children }: { number?: string; title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 pt-6 first:pt-0">
      <h2 className="font-display text-[17px] font-semibold tracking-tight text-ink">{number ? `${number}. ` : ""}{title}</h2>
      <div className="document-prose mt-2 space-y-3 text-[14px] leading-[1.55] text-ink-2">{children}</div>
    </section>
  );
}

/** Label and value rows on the 52mm label column. */
export function DocumentRows({ rows }: { rows: Array<{ label: string; value: ReactNode; mono?: boolean }> }) {
  return (
    <dl className="divide-y divide-line border-y border-line">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-0.5 py-2 sm:grid-cols-[150px_1fr] sm:gap-4">
          <dt className="text-[12px] font-semibold text-ink-3">{row.label}</dt>
          <dd className={cn("text-[14px] text-ink", row.mono && "break-all font-mono text-[12.5px]")}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A signature block: the name line, the 85 × 32mm frame, and its caption. */
export function DocumentSignature({ heading, name, role, identity, imageDataUrl, typedName, alt, caption, empty }: { heading: string; name: string; role?: string; identity?: ReactNode; imageDataUrl?: string; typedName?: string; alt: string; caption: string; empty?: string }) {
  return (
    <div className="space-y-2">
      <p className="text-[14px] font-semibold text-ink">{heading}</p>
      <p className="text-[14px] text-ink">{name}</p>
      {role ? <p className="-mt-1 text-[12.5px] text-ink-3">{role}</p> : null}
      {identity ? <p className="-mt-1 font-mono text-[12px] text-ink-3">{identity}</p> : null}
      <div className="flex h-[121px] w-full max-w-[321px] items-center justify-center border border-line-2 bg-white" aria-label={alt}>
        {imageDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signature captured as a data URL, not an optimizable asset
          <img src={imageDataUrl} alt={alt} className="max-h-[105px] max-w-[300px] object-contain" />
        ) : typedName ? (
          <span className="font-display text-[24px] italic text-ink">{typedName}</span>
        ) : (
          <span className="px-4 text-center text-[12px] text-ink-3">{empty}</span>
        )}
      </div>
      <p className="text-[12px] leading-relaxed text-ink-3">{caption}</p>
    </div>
  );
}
