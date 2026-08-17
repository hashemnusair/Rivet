/**
 * A slow band of the product's own vocabulary between the hero and the numbers.
 * No logos to borrow credibility from — the words the system actually uses do
 * the work. The track is duplicated so the loop has no seam, and the copy is
 * hidden from assistive tech because it is texture, not content.
 */
const TERMS = [
  "Lead",
  "Free trial",
  "Offer",
  "Membership",
  "Cash · Card · CliQ",
  "Receipt",
  "Check-in",
  "Verdict",
  "Freeze",
  "Transfer",
  "Shift close",
  "Drawer variance",
  "Override reason",
  "Audit entry",
  "Renewal",
] as const;

export function VocabularyMarquee() {
  return (
    <div className="relative overflow-hidden border-b border-ink/10 bg-paper py-3.5" aria-hidden>
      {/* Fades the band into the page edges without painting a gradient over it. */}
      <div className="flex w-max animate-marquee items-center will-change-transform motion-reduce:animate-none">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center">
            {TERMS.map((term) => (
              <span key={`${copy}-${term}`} className="flex items-center">
                <span className="whitespace-nowrap font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-3">
                  {term}
                </span>
                <span className="mx-6 size-1 rounded-full bg-signal/50" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
