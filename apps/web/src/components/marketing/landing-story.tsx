"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Reveal } from "@/components/marketing/reveal";
import { cn } from "@/lib/utils/cn";
import styles from "./landing-cinematic.module.css";

const STACK_ITEMS = [
  {
    label: "Sales",
    copy: "The first walk-in, trial, call, and follow-up all carry the name of the person who handled them.",
    caps: ["Leads, trials, follow-ups", "Conversion by staff member", "Nothing lives in a chat"],
  },
  {
    label: "Memberships",
    copy: "Plans, renewals, freezes, upgrades, and family memberships, with expiries the desk actually sees.",
    caps: ["Plans and renewals", "Freezes and transfers", "Access follows the plan"],
  },
  {
    label: "Payments",
    copy: "Cash, card, CliQ, and installments, with a receipt for every dinar and a balance for every member.",
    caps: ["Cash, card, CliQ", "Receipts and balances", "Drawer reconciled every shift"],
  },
  {
    label: "Reception",
    copy: "Check-in, who is inside right now, front-desk sales, and a proper handover between shifts.",
    caps: ["Check-in and access", "Front-desk sales", "Shift open and close"],
  },
  {
    label: "Operations",
    copy: "Staff, shifts, classes, trainers, maintenance, and the daily close live in one operating record.",
    caps: ["Staff, shifts, roles", "Classes and capacity", "The daily close"],
  },
  {
    label: "Member activity",
    copy: "Attendance and engagement per member, so a lapse becomes a conversation before it becomes a cancellation.",
    caps: ["Attendance history", "Inactivity flags", "Renewals at the right time"],
  },
] as const;

const MODULES = [
  {
    name: "Sales",
    summary: "From walk-in to member, with a name on every sale.",
    caps: [
      "Leads, walk-ins, and trials logged to the staff member who handled them",
      "Follow-ups with due dates instead of memory",
      "Conversion by person, day, and branch",
      "Every sale carries a name and a time",
    ],
  },
  {
    name: "Memberships",
    summary: "Plans, renewals, and freezes, with expiries the desk can see.",
    caps: [
      "Plans, renewals, freezes, upgrades, and transfers",
      "Family and group memberships",
      "Expiry lists at reception",
      "Access ends when the membership ends",
    ],
  },
  {
    name: "Payments",
    summary: "Cash, card, CliQ, and installments. A receipt for every dinar.",
    caps: [
      "Cash, card, CliQ, and installment plans",
      "A receipt for every payment, including partial ones",
      "Outstanding balances by member",
      "End-of-shift reconciliation against the drawer",
    ],
  },
  {
    name: "Reception",
    summary: "Check-in, who is inside, and a proper shift handover.",
    caps: [
      "Check-in by card, code, or phone number",
      "Who is inside right now",
      "Front-desk sales and top-ups",
      "Shift open, close, and handover notes",
    ],
  },
  {
    name: "Operations",
    summary: "Staff, shifts, classes, and the daily close, in one place.",
    caps: [
      "Staff, shifts, and roles",
      "Classes, trainers, and capacity",
      "Daily tasks and maintenance logs",
      "The daily close on one screen",
    ],
  },
  {
    name: "Member activity",
    summary: "Attendance and engagement, so lapses are seen before they happen.",
    caps: [
      "Attendance history per member",
      "Inactivity flags before members disappear",
      "Class bookings and no-shows",
      "Renewal conversations at the right time",
    ],
  },
] as const;

const DAY_EVENTS = [
  {
    time: "06:00",
    where: "Reception",
    title: "Doors open.",
    copy: "Members check in. The desk sees who is active, who expires this week, and who still owes a balance, before anyone asks.",
    tag: "Reception · Memberships",
  },
  {
    time: "09:30",
    where: "Sales desk",
    title: "A walk-in asks about prices.",
    copy: "The trial is logged to the staff member who handled it. If they join next week, the sale is theirs, on record.",
    tag: "Sales",
  },
  {
    time: "13:15",
    where: "Reception",
    title: "Half now, half next month.",
    copy: "An installment plan is created, a receipt is issued, and the balance is visible to everyone who needs to see it.",
    tag: "Payments",
  },
  {
    time: "17:30",
    where: "The floor",
    title: "Peak hour.",
    copy: "Class capacity, the trainer schedule, and the number of people inside sit on one screen at reception.",
    tag: "Operations · Member activity",
  },
  {
    time: "21:00",
    where: "Reception",
    title: "Shift handover.",
    copy: "The cash in the drawer is counted against what the system says was collected. Any difference has a name.",
    tag: "Reception · Payments",
  },
  {
    time: "23:00",
    where: "The office",
    title: "Daily close.",
    copy: "The owner sees revenue by method, new members, renewals due, and who did what, exactly as the day happened.",
    tag: "Operations",
  },
] as const;

const REGIONAL_SPECS = [
  ["Currency", "JOD, to the fils. Three decimals wherever a number appears."],
  ["Payments", "Cash, card, CliQ, and installments, with a receipt for each."],
  ["Language", "English and Arabic, with RTL-ready layouts."],
  ["Calendar", "Ramadan hours, Friday schedules, and public holidays."],
  ["Memberships", "Family plans, women's hours, freezes, and transfers."],
  ["Branches", "One account across branches, in Amman or anywhere in the region."],
] as const;

const CHAIN = [
  ["Member pays", "Who, amount, method"],
  ["Reception records", "Name, time, shift"],
  ["Shift closes", "Drawer against system"],
  ["Owner sees", "The day, as it happened"],
] as const;

/** One entry's life on the ledger. Roles only, so nothing reads as a real person or amount. */
const TRAIL = [
  {
    key: "Recorded",
    body: <>Cash, monthly plan, receipt issued at the desk.</>,
    meta: "Receptionist · shift 2 · 13:15",
  },
  {
    key: "Corrected",
    body: (
      <>
        <s>Monthly plan</s> Quarterly plan. Reason: wrong plan selected at the desk.
      </>
    ),
    meta: "Branch manager · 13:22 · original kept on the record",
  },
  {
    key: "Reviewed",
    body: <>Drawer counted against the system at close. No unexplained difference.</>,
    meta: "Owner · daily close",
  },
] as const;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothstep = (value: number) => {
  const progress = clamp(value, 0, 1);
  return progress * progress * (3 - 2 * progress);
};
const easeOut = (value: number) => 1 - (1 - clamp(value, 0, 1)) ** 3;

export function StoryMarker({ label, dark = false }: { label: string; dark?: boolean }) {
  return (
    <div className={`group flex items-center gap-3 border-t pt-4 ${dark ? "border-night-line" : "border-ink/10"}`}>
      <span className="h-[3px] w-7 origin-left rounded-sm bg-signal transition-transform duration-500 group-hover:scale-x-150" aria-hidden />
      <span className={`text-[13.5px] font-semibold tracking-[-0.01em] ${dark ? "text-night-ink" : "text-ink"}`}>{label}</span>
    </div>
  );
}

/** Lays the previous section's colour under a rounded sheet's corners. */
export function SheetUnder({ tone }: { tone: "sunken" | "stack" }) {
  return <div aria-hidden className={cn(styles.sheetUnder, tone === "sunken" ? styles.sheetUnderSunken : styles.sheetUnderStack)} />;
}

// ---------------------------------------------------------------------------
// The stack
// ---------------------------------------------------------------------------

const PLATE_COUNT = STACK_ITEMS.length;

/** Rig geometry shared with the stylesheet, as fractions of the rig box. */
const RIG = {
  platesTop: 0.34,
  platesHeight: 0.61,
  platesLeft: 0.235,
  platesWidth: 0.66,
  platePitch: 0.155,
  plateHeight: 0.125,
  shortPlate: 0.72,
} as const;

/**
 * The scroll timeline, as fractions of the track. The pin starts home in the
 * first plate, rests in each plate for a read, then pulls out, travels down and
 * pushes into the next one. What is left after the last plate lifts the stack.
 */
const LEAD = 0.03;
const DWELL = 0.09;
const MOVE = 0.07;
const OUT_END = 0.3;
const TRAVEL_END = 0.68;

interface PinState {
  /** Plate the pin is aligned with, fractional while it travels. */
  y: number;
  /** Plate whose edge the pin is measured from while it is out. */
  plate: number;
  /** 0 = home in the plate, 1 = fully withdrawn. */
  pull: number;
  /** How far the finale lift has progressed. */
  lift: number;
  finale: boolean;
}

function resolvePin(progress: number): PinState {
  let cursor = LEAD;
  if (progress < cursor) return { y: 0, plate: 0, pull: 0, lift: 0, finale: false };
  for (let index = 0; index < PLATE_COUNT; index += 1) {
    if (progress < cursor + DWELL) return { y: index, plate: index, pull: 0, lift: 0, finale: false };
    cursor += DWELL;
    if (index === PLATE_COUNT - 1) break;
    if (progress < cursor + MOVE) {
      const phase = (progress - cursor) / MOVE;
      if (phase < OUT_END) {
        return { y: index, plate: index, pull: smoothstep(phase / OUT_END), lift: 0, finale: false };
      }
      if (phase < TRAVEL_END) {
        return { y: index + smoothstep((phase - OUT_END) / (TRAVEL_END - OUT_END)), plate: index, pull: 1, lift: 0, finale: false };
      }
      return { y: index + 1, plate: index + 1, pull: 1 - easeOut((phase - TRAVEL_END) / (1 - TRAVEL_END)), lift: 0, finale: false };
    }
    cursor += MOVE;
  }
  const finale = clamp((progress - cursor) / Math.max(0.001, 1 - cursor), 0, 1);
  return { y: PLATE_COUNT - 1, plate: PLATE_COUNT - 1, pull: 0, lift: smoothstep(finale / 0.7), finale: finale > 0.02 };
}

export function ScrollStackStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const rodRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(0);
  const [seated, setSeated] = useState(0);
  const [finale, setFinale] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const rig = rigRef.current;
    const rod = rodRef.current;
    if (!section || !rig || !rod) return;
    const reduced = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : { matches: false };

    let rigWidth = rig.clientWidth;
    let rigHeight = rig.clientHeight;
    let rodWidth = rod.getBoundingClientRect().width;
    let gap = 14;
    const measure = () => {
      rigWidth = rig.clientWidth;
      rigHeight = rig.clientHeight;
      rodWidth = rod.getBoundingClientRect().width;
      gap = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.9;
    };

    const plateRight = (index: number) => rigWidth * (RIG.platesLeft + RIG.platesWidth * (index < 3 ? RIG.shortPlate : 1));
    const plateCenter = (index: number) => rigHeight * (RIG.platesTop + RIG.platesHeight * (index * RIG.platePitch + RIG.plateHeight / 2));

    const paint = (progress: number) => {
      const pin = resolvePin(progress);
      const home = plateRight(pin.plate);
      const out = plateRight(PLATE_COUNT - 1) + rodWidth + gap;
      const ringLeft = home + pin.pull * (out - home);
      const lift = -pin.lift * rigHeight * 0.06;
      // The copy switches the moment the rod's tip crosses the plate's edge.
      const tip = ringLeft - rodWidth;
      const entered = tip <= home + 0.5;
      const nextActive = entered ? pin.plate : Math.max(0, Math.min(pin.plate, Math.floor(pin.y)));
      const nextSeated = pin.pull === 0 ? pin.plate : -1;

      section.style.setProperty("--stack-pin-x", `${(ringLeft - rodWidth).toFixed(2)}px`);
      section.style.setProperty("--stack-pin-y", `${(plateCenter(pin.y) + lift).toFixed(2)}px`);
      section.style.setProperty("--stack-lift", `${lift.toFixed(2)}px`);
      section.style.setProperty("--stack-progress", `${(progress * 100).toFixed(2)}%`);
      // The bar has done its job once the stack lifts; fading it keeps the seam
      // with the next sheet clean.
      section.style.setProperty("--stack-progress-opacity", (1 - smoothstep((progress - 0.9) / 0.08)).toFixed(3));
      setActive((current) => (current === nextActive ? current : nextActive));
      setSeated((current) => (current === nextSeated ? current : nextSeated));
      setFinale((current) => (current === pin.finale ? current : pin.finale));
    };

    if (reduced.matches) {
      measure();
      paint(1);
      return;
    }

    // Scroll position is followed through a short lag so wheel steps read as
    // one continuous motion instead of jumps; the loop runs only while the
    // pin still has somewhere to go.
    let target = 0;
    let current = 0;
    let frame = 0;
    let last = 0;

    const readProgress = () => {
      const rect = section.getBoundingClientRect();
      const range = Math.max(1, section.offsetHeight - window.innerHeight);
      return clamp(-rect.top / range, 0, 1);
    };

    const tick = (now: number) => {
      const elapsed = last ? Math.min(64, now - last) : 16;
      last = now;
      current += (target - current) * (1 - Math.exp(-elapsed / 85));
      if (Math.abs(target - current) < 0.0003) {
        current = target;
        frame = 0;
        paint(current);
        return;
      }
      paint(current);
      frame = window.requestAnimationFrame(tick);
    };

    const follow = () => {
      target = readProgress();
      if (!frame) {
        last = 0;
        frame = window.requestAnimationFrame(tick);
      }
    };

    const settle = () => {
      measure();
      target = readProgress();
      current = target;
      paint(current);
    };

    settle();
    window.addEventListener("scroll", follow, { passive: true });
    window.addEventListener("resize", settle, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(settle);
    observer?.observe(rig);
    return () => {
      window.removeEventListener("scroll", follow);
      window.removeEventListener("resize", settle);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section ref={sectionRef} id="product" data-landing-theme="dark" className={styles.stackStory}>
      <div className={styles.stackTrack}>
        <div className={styles.stackStage}>
          <div className={styles.stackGrid}>
            <div className={styles.stackHeader}>
              <div>
                <StoryMarker label="The stack" dark />
                <h2>Six plates. One pin.</h2>
              </div>
              <p className={styles.stackLead}>
                A weight stack works because one pin turns loose plates into a single load. RIVET does that to a gym.
              </p>
            </div>

            <div className={styles.stackFigure} aria-hidden>
              <div ref={rigRef} className={styles.rig}>
                <span className={styles.rigRod} />
                <span className={styles.rigBar} />
                <span className={styles.rigReturn} />
                <span className={styles.rigPin} data-stack-pin>
                  <span ref={rodRef} className={styles.rigPinRod} />
                  <span className={styles.rigPinRing} />
                </span>
                <ol className={styles.rigPlates}>
                  {STACK_ITEMS.map((item, index) => (
                    <li
                      key={item.label}
                      data-stack-plate={index}
                      className={cn(
                        styles.rigPlate,
                        index < 3 && styles.rigPlateShort,
                        index <= active && styles.rigPlateActive,
                        index === seated && styles.rigPlateSeated,
                      )}
                      style={{ "--plate-index": index } as CSSProperties}
                    >
                      <span>{item.label}</span>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className={styles.stackCopy} aria-live="polite">
              {STACK_ITEMS.map((item, index) => (
                <div key={item.label} className={cn(styles.stackState, !finale && active === index && styles.stackStateActive)}>
                  <h3>{item.label}</h3>
                  <p>{item.copy}</p>
                  <ul className={styles.stackCaps}>
                    {item.caps.map((cap) => <li key={cap}>{cap}</li>)}
                  </ul>
                </div>
              ))}
              <div className={cn(styles.stackState, finale && styles.stackStateActive)}>
                <h3>The full stack,<br />lifted together.</h3>
                <p>Every module reads and writes the same record. A payment at reception is already on the member, already in the ledger, and already in the daily close.</p>
              </div>
            </div>
          </div>
          <div className={styles.stackProgress} aria-hidden><span /></div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

export function ModulesShowcase() {
  const [openModule, setOpenModule] = useState(0);

  return (
    <section
      id="modules"
      data-landing-cover
      data-landing-theme="dark"
      aria-labelledby="modules-title"
      className={cn(styles.coverSheet, styles.inkSheet, styles.layer4, styles.modulesSection)}
    >
      <div className={styles.modulesInner}>
        <StoryMarker label="Modules" dark />
        <div className={styles.modulesIntro}>
          <Reveal>
            <h2 id="modules-title" className={styles.modulesTitle}>What each<br />plate carries.</h2>
          </Reveal>
          <Reveal delay={140}>
            <p className={styles.modulesLead}>Six modules, one record. Everything a gym does between opening the door and counting the drawer.</p>
          </Reveal>
        </div>

        <ol className={styles.modulesList}>
          {MODULES.map((module, index) => {
            const open = openModule === index;
            const panelId = `landing-module-${index + 1}`;
            return (
              <li key={module.name} className={cn(styles.moduleItem, open && styles.moduleItemOpen)}>
                <Reveal delay={index * 55}>
                  <button
                    type="button"
                    className={styles.moduleButton}
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpenModule(open ? -1 : index)}
                  >
                    <span className={styles.moduleIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <span className={styles.moduleName}>{module.name}</span>
                    <span className={styles.moduleSummary}>{module.summary}</span>
                    <span className={styles.moduleToggle} aria-hidden />
                  </button>
                  <div id={panelId} className={styles.modulePanel} aria-hidden={!open}>
                    <div className={styles.modulePanelInner}>
                      <ul className={styles.moduleCaps}>
                        {module.caps.map((cap) => <li key={cap}>{cap}</li>)}
                      </ul>
                    </div>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// A day on RIVET
// ---------------------------------------------------------------------------

/** Where the sticky clock rests, matching `.daySticky` / `.dayAside` in the stylesheet. */
const clockOffset = () => (window.innerWidth <= 720 ? 68 : 80);

export function OperationalDay() {
  const sectionRef = useRef<HTMLElement>(null);
  const momentRefs = useRef<Array<HTMLLIElement | null>>([]);
  const inPlaceRef = useRef(false);
  const [active, setActive] = useState(0);
  const [landed, setLanded] = useState(false);

  // The clock only starts once the sheet has slid fully into place. Until
  // then it holds the opening moment, however much of the section is showing.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    let frame = 0;

    const read = () => {
      frame = 0;
      const top = section.getBoundingClientRect().top;
      const inPlace = top <= clockOffset() + 1;
      inPlaceRef.current = inPlace;
      if (!inPlace) {
        setActive(0);
        return;
      }
      setLanded(true);
      const line = window.innerHeight * 0.46;
      let next = 0;
      momentRefs.current.forEach((moment, index) => {
        if (moment && moment.getBoundingClientRect().top <= line) next = index;
      });
      setActive((current) => (current === next ? current : next));
    };

    const request = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request, { passive: true });
    return () => {
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const current = DAY_EVENTS[active] ?? DAY_EVENTS[0];

  return (
    <section
      ref={sectionRef}
      id="day"
      data-landing-theme="paper"
      aria-labelledby="day-title"
      className={cn(styles.coverSheet, styles.paperSheet, styles.layer5, styles.daySection)}
    >
      <div className={styles.dayGrid}>
        <aside className={styles.dayAside}>
          <div className={styles.daySticky}>
            <StoryMarker label="A day on RIVET" />
            <h2 id="day-title" className="sr-only">A day on RIVET</h2>
            <p className={styles.dayClock} aria-live="polite" aria-atomic="true">
              <span className={styles.dayTimeMask}>
                <span key={`${current.time}-${landed}`} className={styles.dayTime}>{current.time}</span>
              </span>
              <span key={`${current.where}-${landed}`} className={styles.dayWhere}>{current.where}</span>
            </p>
          </div>
        </aside>

        <ol className={styles.dayList}>
          {DAY_EVENTS.map((event, index) => (
            <li
              key={event.time}
              ref={(node) => { momentRefs.current[index] = node; }}
              data-day-index={index}
              className={cn(styles.dayMoment, active === index && styles.dayMomentActive)}
              onMouseEnter={() => { if (inPlaceRef.current) setActive(index); }}
            >
              <time className={styles.dayMomentTime}>{event.time}</time>
              <h3>{event.title}</h3>
              <p>{event.copy}</p>
              <span className={styles.dayMomentTag}>{event.tag}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Accountability
// ---------------------------------------------------------------------------

export function AccountabilityLedger() {
  return (
    <section
      id="accountability"
      data-landing-cover
      data-landing-theme="dark"
      aria-labelledby="accountability-title"
      className={cn(styles.coverSheet, styles.inkSheet, styles.layer6, styles.accountSection)}
    >
      <div className={styles.accountInner}>
        <StoryMarker label="Accountability" dark />
        <Reveal>
          <h2 id="accountability-title" className={styles.accountTitle}>Nothing gets<br />edited quietly.</h2>
        </Reveal>
        <div className={styles.accountBody}>
          <Reveal delay={120}>
            <p className={styles.accountLead}>Every sale, payment, check-in, and shift change is recorded under the person who did it. Corrections are allowed. Silent ones are not. The owner sees the day as it happened.</p>
          </Reveal>
          <Reveal delay={200} className={styles.trailReveal}>
            <div className={styles.trail}>
              <div className={styles.trailHead}>
                <span>One payment, as the owner sees it</span>
                <span>Audit trail</span>
              </div>
              {TRAIL.map((row, index) => (
                <div key={row.key} className={styles.trailRow} style={{ "--row-delay": `${260 + index * 220}ms` } as CSSProperties}>
                  <span className={styles.trailKey}>{row.key}</span>
                  <p>
                    {row.body}
                    <span className={styles.trailMeta}>{row.meta}</span>
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
        <Reveal delay={180} className={styles.chainReveal}>
          <div className={styles.chain} role="img" aria-label="A payment's chain of custody from member payment to owner review">
            <span className={styles.chainRod} aria-hidden />
            {CHAIN.map(([title, detail], index) => (
              <div key={title} className={styles.chainNode} style={{ "--chain-delay": `${220 + index * 150}ms` } as CSSProperties}>
                <span className={styles.chainPlate}>{title}</span>
                <span className={styles.chainSub}>{detail}</span>
              </div>
            ))}
            <span className={styles.chainPin} aria-hidden><span /><span /></span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Built for here
// ---------------------------------------------------------------------------

export function RegionProof() {
  return (
    <section
      id="region"
      data-landing-theme="paper"
      aria-labelledby="region-title"
      className={cn(styles.coverSheet, styles.paperSheet, styles.layer7, styles.regionSection)}
    >
      <div className={styles.regionInner}>
        <StoryMarker label="Built for here" />
        <div className={styles.regionBilingual}>
          <Reveal>
            <h2 id="region-title" className={styles.regionEnglish}>Built in<br />Amman.</h2>
          </Reveal>
          <Reveal delay={120}>
            <p lang="ar" dir="rtl" className={styles.regionArabic}>مبنيّ في عمّان.</p>
          </Reveal>
        </div>
        <div className={styles.regionBody}>
          <Reveal>
            <p className={styles.regionLead}>For the way gyms run here, not the way a template assumes they do.</p>
          </Reveal>
          <Reveal delay={120}>
            <dl className={styles.regionSpecs}>
              {REGIONAL_SPECS.map(([term, detail]) => (
                <div key={term} className={styles.regionSpec}>
                  <dt>{term}</dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
