import { cn } from "@/lib/utils/cn";

/**
 * The RIVET mark reduced for 14–20 px: the post, the top bar and cable drop,
 * and the weight stack with its red pin. While Ask RIVET works, the pinned
 * plates lift on the cable like a rep (the same motion as the full loader),
 * instead of a spinner. Takes the text colour; the pin is always signal red.
 */
export function RivetGlyph({ working = false, className }: { working?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 20 24" className={cn("ask-glyph block shrink-0", working && "ask-glyph-working", className)} aria-hidden focusable="false">
      <rect x="1.5" y="1" width="2.6" height="22" rx="0.9" fill="currentColor" />
      <rect x="1.5" y="1" width="10.8" height="2.6" rx="0.9" fill="currentColor" />
      <rect x="9.7" y="1" width="2.6" height="5.2" rx="0.9" fill="currentColor" />
      <rect x="6.2" y="17.3" width="10.6" height="2.3" rx="0.6" fill="currentColor" />
      <rect x="6.2" y="20.4" width="10.6" height="2.3" rx="0.6" fill="currentColor" />
      <g className="ask-glyph-lift">
        <rect x="6.2" y="8" width="7.4" height="2.3" rx="0.6" fill="currentColor" />
        <rect x="6.2" y="11.1" width="7.4" height="2.3" rx="0.6" fill="currentColor" />
        <rect x="6.2" y="14.2" width="10.6" height="2.3" rx="0.6" fill="currentColor" />
        <rect x="15.6" y="14.75" width="2.6" height="1.2" rx="0.6" fill="var(--color-signal)" />
        <circle cx="18.6" cy="15.35" r="1" fill="none" stroke="var(--color-signal)" strokeWidth="0.9" />
      </g>
    </svg>
  );
}
