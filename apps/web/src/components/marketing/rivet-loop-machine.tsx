"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * The RIVET glyph is a weight stack with a selector pin, and this section makes
 * the mark do the explaining: each plate is one stage of the commercial loop.
 *
 * The machine runs itself — once it scrolls into view the pin drops one plate
 * every few seconds, exactly like working down a stack, and parks on the last
 * plate. Choosing a plate (or a numbered tab) pins that stage and stops the
 * autoplay for good; the page itself never hijacks scrolling.
 *
 * Geometry is traced from `rivet-glyph-source.png` (units = source px / 20), so
 * the drawing at rest *is* the logo, not an illustration of it.
 */
const STAGES = [
  {
    label: "Lead",
    detail:
      "A marketplace booking, a walk-in, a referral — every name lands in one pipeline with an owner and a follow-up time. Nothing lives in a notebook.",
  },
  {
    label: "Contact",
    detail:
      "Sales works a daily queue, not a memory. Every call, reply and promise is stamped onto the member's record the moment it happens.",
  },
  {
    label: "Free trial",
    detail:
      "Trials are booked against real slots and confirmed before the visit, so the desk knows who is walking in and what they came for.",
  },
  {
    label: "Offer",
    detail:
      "Plans and prices come from the catalog, so an offer is priced without guesswork — and every discount carries a reason with a name on it.",
  },
  {
    label: "Membership",
    detail:
      "The sale writes the membership: dates, terms, freezes and transfers live on the record, not on paper taped to the front desk.",
  },
  {
    label: "Payment",
    detail:
      "Cash, card or CliQ — every dinar is receipted the moment it moves, and lands in a drawer that has to reconcile at close.",
  },
  {
    label: "Check-in",
    detail:
      "One scan at the door returns a verdict — valid, expiring, frozen or blocked — with the next action already attached to it.",
  },
  {
    label: "Renewal",
    detail:
      "Expiring members enter the renewal queue before they lapse, and the loop hands the sale straight back to plate one.",
  },
] as const;

/** How long the pin rests in each plate while the machine runs itself. */
const DWELL_MS = 5000;

interface Plate {
  x: number;
  w: number;
  right: number;
  y: number;
  h: number;
}

const PLATES: Plate[] = [
  { x: 73.5, w: 34, right: 107.5, y: 67, h: 10 },
  { x: 73.5, w: 34, right: 107.5, y: 79.5, h: 10 },
  { x: 73.5, w: 34, right: 107.5, y: 92, h: 10 },
  { x: 73.5, w: 34, right: 107.5, y: 104.5, h: 10 },
  { x: 73.5, w: 53.5, right: 127, y: 120, h: 10 },
  { x: 73.5, w: 53.5, right: 127, y: 132.5, h: 10.5 },
  { x: 73.5, w: 53.5, right: 127, y: 145.5, h: 10.5 },
  { x: 73.5, w: 53.5, right: 127, y: 158, h: 10 },
];

/** The pin is drawn at its home plate (index 4, as in the logo) and translated. */
const PIN_HOME = PLATES[4]!;

export function RivetLoopMachine() {
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);
  const [running, setRunning] = useState(false);

  // The machine only starts once someone can actually see it.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setRunning(true);
      },
      { threshold: 0.35 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Advance one plate per dwell, park on the last; a manual pick stops it for good.
  useEffect(() => {
    if (!running || pinned || active >= STAGES.length - 1) return;
    const id = window.setTimeout(() => setActive((current) => Math.min(current + 1, STAGES.length - 1)), DWELL_MS);
    return () => window.clearTimeout(id);
  }, [running, pinned, active]);

  const select = (index: number) => {
    setPinned(true);
    setActive(index);
  };

  const autoplaying = running && !pinned && active < STAGES.length - 1;
  const stage = STAGES[active]!;

  return (
    <section
      id="product"
      ref={sectionRef}
      className="scroll-mt-20 border-b border-ink/10 px-5 py-20 sm:px-8 lg:px-12 lg:py-24"
    >
      {/* The whole loop, for readers and crawlers; the machine is the visual. */}
      <ol className="sr-only">
        {STAGES.map((item) => (
          <li key={item.label}>
            {item.label} — {item.detail}
          </li>
        ))}
      </ol>

      <div className="mx-auto grid max-w-[1344px] grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="eyebrow">The commercial loop</p>
          <h2 className="marketing-display mt-4 text-[clamp(2rem,3.6vw,3.4rem)] leading-[0.95]">
            Eight plates.
            <br />
            One machine.
          </h2>
          <p className="mt-5 max-w-md text-[14px] leading-[1.7] text-ink-2">
            The RIVET mark is a weight stack, and it runs like one — eight stages of a gym&rsquo;s revenue, all pinned
            to the same member record. Watch the machine work through them, or pick a plate yourself.
          </p>

          <div className="mt-8 flex items-baseline gap-3">
            <p
              key={active}
              className="marketing-display animate-scale-in text-[clamp(3rem,6vw,5rem)] leading-none text-signal"
              aria-hidden
            >
              {String(active + 1).padStart(2, "0")}
            </p>
            <p className="font-mono text-[12px] text-ink-3" aria-hidden>
              / {String(STAGES.length).padStart(2, "0")}
            </p>
          </div>

          {/* min-h keeps the block steady while stage copy changes length */}
          <div key={`stage-${active}`} className="mt-3 min-h-[108px] max-w-md animate-fade-up sm:min-h-[92px]" aria-live="polite">
            <p className="text-[clamp(1.2rem,1.8vw,1.5rem)] font-semibold tracking-tight">{stage.label}</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{stage.detail}</p>
          </div>

          {/* dwell indicator — fills while the machine is running itself */}
          <div className="mt-5 h-0.5 max-w-md overflow-hidden rounded-full bg-ink/10">
            {autoplaying ? <div key={`fill-${active}`} className="h-full origin-left animate-stage-fill bg-signal" /> : null}
          </div>

          <div className="mt-5 flex items-center gap-1.5" role="tablist" aria-label="Loop stages">
            {STAGES.map((item, index) => (
              <button
                key={item.label}
                type="button"
                role="tab"
                aria-selected={index === active}
                aria-label={`${index + 1}. ${item.label}`}
                onClick={() => select(index)}
                className={cn(
                  "h-7 w-7 cursor-pointer rounded-sm font-mono text-[10px] transition-colors",
                  index === active ? "bg-ink text-paper" : "text-ink-3 hover:bg-sunken hover:text-ink",
                )}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center">
          <Glyph active={active} entered={running} onSelect={select} className="h-[340px] w-auto sm:h-[430px] lg:h-[560px]" />
        </div>
      </div>
    </section>
  );
}

function Glyph({
  active,
  entered,
  onSelect,
  className,
}: {
  active: number;
  /** Plates rack in one by one the first time the section becomes visible. */
  entered: boolean;
  onSelect: (index: number) => void;
  className?: string;
}) {
  const target = PLATES[active]!;
  const dx = target.right - PIN_HOME.right;
  const dy = target.y + target.h / 2 - (PIN_HOME.y + PIN_HOME.h / 2);
  const pinY = PIN_HOME.y + PIN_HOME.h / 2;

  return (
    <svg viewBox="44 20 102 152" className={cn("text-ink", className)} aria-hidden>
      {/* frame */}
      <rect x={50} y={26} width={8} height={142} rx={2.5} fill="currentColor" />
      <rect x={50} y={26} width={54} height={8} rx={2.5} fill="currentColor" />
      <rect x={96} y={26} width={8} height={30.5} rx={2.5} fill="currentColor" />

      {/* plates — everything above the pin lifts, like a stack mid-rep */}
      {PLATES.map((plate, index) => (
        <g
          key={index}
          className="transition-[transform,opacity] duration-700 ease-out"
          style={{
            opacity: entered ? 1 : 0,
            transform: entered ? "translateY(0)" : "translateY(-14px)",
            transitionDelay: entered ? `${index * 70}ms` : "0ms",
          }}
        >
        <g
          onClick={() => onSelect(index)}
          className="cursor-pointer transition-transform duration-500 [transition-timing-function:cubic-bezier(0.3,1.4,0.4,1)]"
          style={{ transform: index < active ? "translateY(-3.5px)" : "translateY(0)", transitionDelay: `${index * 25}ms` }}
        >
          <rect x={plate.x} y={plate.y} width={plate.w} height={plate.h} rx={2} fill="currentColor" />
          <text
            x={plate.x + 4}
            y={plate.y + plate.h / 2}
            dominantBaseline="central"
            fontSize={4}
            className="font-mono"
            fill="var(--color-paper)"
            opacity={index === active ? 1 : 0.55}
          >
            {String(index + 1).padStart(2, "0")}
          </text>
        </g>
        </g>
      ))}

      {/* selector pin — the only colour on the machine */}
      <g className="transition-opacity duration-500" style={{ opacity: entered ? 1 : 0, transitionDelay: entered ? "650ms" : "0ms" }}>
        <g
          className="transition-transform duration-500 [transition-timing-function:cubic-bezier(0.3,1.6,0.4,1)]"
          style={{ transform: `translate(${dx}px, ${dy}px)` }}
        >
          <g key={active} className="animate-pin-pop [transform-box:fill-box] [transform-origin:center]">
            <rect x={PIN_HOME.right - 2.5} y={pinY - 2.2} width={9.5} height={4.4} rx={2.2} fill="var(--color-signal)" />
            <circle cx={PIN_HOME.right + 10} cy={pinY} r={4} fill="none" stroke="var(--color-signal)" strokeWidth={3.4} />
          </g>
        </g>
      </g>
    </svg>
  );
}
