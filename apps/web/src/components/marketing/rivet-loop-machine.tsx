"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/**
 * The RIVET glyph is a weight stack with a selector pin. This section makes the
 * mark do the explaining: each plate is one stage of the commercial loop, and
 * scrolling moves the red pin down the stack exactly like choosing a weight on
 * a machine — plates above the pin lift, the way a stack lifts mid-rep.
 *
 * Geometry is traced from `rivet-glyph-source.png` (units = source px / 20), so
 * the drawing at rest *is* the logo, not an illustration of it.
 */
const STAGES = [
  { label: "Lead", detail: "A name reaches the desk" },
  { label: "Contact", detail: "Follow-up, same day" },
  { label: "Free trial", detail: "Booked before the visit" },
  { label: "Offer", detail: "Priced without guesswork" },
  { label: "Membership", detail: "Terms on the record" },
  { label: "Payment", detail: "Every tender, receipted" },
  { label: "Check-in", detail: "One scan, one verdict" },
  { label: "Renewal", detail: "Queued before it lapses" },
] as const;

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
  { x: 72, w: 55, right: 127, y: 132.5, h: 10.5 },
  { x: 72, w: 55, right: 127, y: 145.5, h: 10.5 },
  { x: 72, w: 55, right: 127, y: 158, h: 10 },
];

/** The pin is drawn at its home plate (index 4, as in the logo) and translated. */
const PIN_HOME = PLATES[4]!;

export function RivetLoopMachine() {
  const trackRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) return;
      const progress = Math.min(1, Math.max(0, -rect.top / total));
      setActive(Math.min(STAGES.length - 1, Math.floor(progress * STAGES.length)));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  /** Scrolls the page so the pin lands in plate `index`. */
  const jumpTo = (index: number) => {
    const el = trackRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const total = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + ((index + 0.5) / STAGES.length) * total, behavior: "smooth" });
  };

  const stage = STAGES[active]!;

  return (
    <section
      id="product"
      ref={trackRef}
      className="relative scroll-mt-20 border-b border-ink/10"
      style={{ height: `${STAGES.length * 50 + 100}vh` }}
    >
      {/* The whole loop, for readers and crawlers; the machine is the visual. */}
      <ol className="sr-only">
        {STAGES.map((item) => (
          <li key={item.label}>
            {item.label} — {item.detail}
          </li>
        ))}
      </ol>

      {/* pt clears the sticky site header, which otherwise overlaps the eyebrow on phones */}
      <div className="sticky top-0 flex h-dvh items-center overflow-hidden pt-[68px] lg:pt-0">
        <div className="mx-auto grid w-full max-w-[1344px] grid-cols-1 items-center gap-6 px-5 sm:px-8 lg:grid-cols-2 lg:gap-14 lg:px-12">
          <div>
            <p className="eyebrow">The commercial loop</p>
            <h2 className="marketing-display mt-4 text-[clamp(2rem,3.6vw,3.4rem)] leading-[0.95]">
              Eight plates.
              <br />
              One machine.
            </h2>

            <div className="mt-6 flex items-baseline gap-3 lg:mt-10">
              <p
                key={active}
                className="marketing-display animate-scale-in text-[clamp(3.6rem,8vw,7rem)] leading-none text-signal"
                aria-hidden
              >
                {String(active + 1).padStart(2, "0")}
              </p>
              <p className="font-mono text-[12px] text-ink-3" aria-hidden>
                / {String(STAGES.length).padStart(2, "0")}
              </p>
            </div>

            <div key={`stage-${active}`} className="mt-3 animate-fade-up" aria-live="polite">
              <p className="text-[clamp(1.25rem,2vw,1.6rem)] font-semibold tracking-tight">{stage.label}</p>
              <p className="mt-1 text-[13.5px] text-ink-2">{stage.detail}</p>
            </div>

            <div className="mt-6 flex items-center gap-1.5" role="tablist" aria-label="Loop stages">
              {STAGES.map((item, index) => (
                <button
                  key={item.label}
                  type="button"
                  role="tab"
                  aria-selected={index === active}
                  aria-label={`${index + 1}. ${item.label}`}
                  onClick={() => jumpTo(index)}
                  className={cn(
                    "h-6 w-6 cursor-pointer rounded-sm font-mono text-[9px] transition-colors",
                    index === active ? "bg-ink text-paper" : "text-ink-3 hover:bg-sunken hover:text-ink",
                  )}
                >
                  {index + 1}
                </button>
              ))}
            </div>

            {/* Fixed-height slot so the hint/CTA swap never shifts the layout. */}
            <div className="mt-6 h-10">
              {active === 0 ? (
                <p className="animate-fade-in font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
                  Scroll — the pin does the rest
                </p>
              ) : null}
              {active === STAGES.length - 1 ? (
                <div className="animate-fade-up">
                  <Button asChild variant="signal">
                    <Link href="/signup">
                      Start free trial <ArrowRight />
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="relative flex h-[42vh] items-center justify-center lg:h-[74vh]">
            <Glyph active={active} onSelect={jumpTo} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Glyph({ active, onSelect }: { active: number; onSelect: (index: number) => void }) {
  const target = PLATES[active]!;
  const dx = target.right - PIN_HOME.right;
  const dy = target.y + target.h / 2 - (PIN_HOME.y + PIN_HOME.h / 2);
  const pinY = PIN_HOME.y + PIN_HOME.h / 2;

  return (
    <svg viewBox="44 20 102 152" className="h-full w-auto text-ink" aria-hidden>
      {/* frame */}
      <rect x={50} y={26} width={8} height={142} rx={2.5} fill="currentColor" />
      <rect x={50} y={26} width={54} height={8} rx={2.5} fill="currentColor" />
      <rect x={96} y={26} width={8} height={30.5} rx={2.5} fill="currentColor" />

      {/* plates — everything above the pin lifts, like a stack mid-rep */}
      {PLATES.map((plate, index) => (
        <g
          key={index}
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
      ))}

      {/* selector pin — the only colour on the machine */}
      <g
        className="transition-transform duration-500 [transition-timing-function:cubic-bezier(0.3,1.6,0.4,1)]"
        style={{ transform: `translate(${dx}px, ${dy}px)` }}
      >
        <rect x={PIN_HOME.right - 2.5} y={pinY - 2.2} width={9.5} height={4.4} rx={2.2} fill="var(--color-signal)" />
        <circle cx={PIN_HOME.right + 10} cy={pinY} r={4} fill="none" stroke="var(--color-signal)" strokeWidth={3.4} />
      </g>
    </svg>
  );
}
