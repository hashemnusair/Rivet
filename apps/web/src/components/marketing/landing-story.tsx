"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Reveal } from "@/components/marketing/reveal";
import { cn } from "@/lib/utils/cn";
import styles from "./landing-cinematic.module.css";

export const STACK_ITEMS = [
  {
    label: "Sales",
    copy: "Walk-ins, trials, calls and follow-ups are logged to the staff member who handled them, with a due date instead of a memory.",
    caps: ["Leads and free trials", "Follow-ups with due dates", "Conversion by staff member"],
  },
  {
    label: "Memberships",
    copy: "Plans, renewals, freezes, upgrades and family memberships, with expiries the desk sees before the member asks.",
    caps: ["Plans and renewals", "Freezes and transfers", "Access ends with the plan"],
  },
  {
    label: "Payments",
    copy: "Cash, card, CliQ and installments, with a receipt for every payment and an outstanding balance on every member.",
    caps: ["Cash, card, CliQ", "Receipts and balances", "Drawer reconciled every shift"],
  },
  {
    label: "Reception",
    copy: "Check-in by card, code or phone number, who is inside right now, front-desk sales and a proper handover between shifts.",
    caps: ["Check-in and access", "Front-desk sales", "Shift open and close"],
  },
  {
    label: "Operations",
    copy: "Staff, shifts, classes, trainers, maintenance and the daily close, kept in one operating record instead of three notebooks.",
    caps: ["Staff, shifts and roles", "Classes and capacity", "The daily close"],
  },
  {
    label: "Member activity",
    copy: "Attendance and engagement per member, so a lapse becomes a conversation before it becomes a cancellation.",
    caps: ["Attendance history", "Inactivity flags", "Renewal at the right time"],
  },
] as const;

export const STACK_FINALE = {
  title: "All six, on one record.",
  copy: "A payment taken at reception is already on the member, already in the ledger and already in the daily close. Nothing is copied across.",
} as const;

const DAY_EVENTS = [
  {
    time: "06:00",
    where: "Reception",
    title: "Doors open.",
    copy: "Members check in. The desk sees who is active, who expires this week and who still owes a balance, before anyone asks.",
  },
  {
    time: "09:30",
    where: "Sales desk",
    title: "A walk-in asks about prices.",
    copy: "The trial is logged to the person who handled it. If they join next week, the sale is theirs, on record.",
  },
  {
    time: "13:15",
    where: "Reception",
    title: "Half now, half next month.",
    copy: "An installment plan is created, a receipt is issued, and the balance shows on the member for everyone who needs to see it.",
  },
  {
    time: "21:00",
    where: "Reception",
    title: "Shift handover.",
    copy: "The cash in the drawer is counted against what the system says was collected. Any difference has a name next to it.",
  },
  {
    time: "23:00",
    where: "The office",
    title: "Daily close.",
    copy: "The owner sees revenue by method, new members, renewals due and who did what, as the day happened.",
  },
] as const;

const REGIONAL_SPECS = [
  ["Currency", "JOD to the fils. Three decimals wherever a number appears."],
  ["Payments", "Cash, card, CliQ and installments, with a receipt for each."],
  ["Language", "English and Arabic, with right-to-left layouts."],
  ["Calendar", "Ramadan hours, Friday schedules and public holidays."],
  ["Memberships", "Family plans, women's hours, freezes and transfers."],
  ["Branches", "One account across branches, in Amman or anywhere in the region."],
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

export function StoryMarker({ label, dark = false }: { label: string; dark?: boolean }) {
  return (
    <div className={`group flex items-center gap-3 border-t pt-4 ${dark ? "border-night-line" : "border-ink/10"}`}>
      <span className="h-[3px] w-7 origin-left rounded-sm bg-signal transition-transform duration-500 group-hover:scale-x-150" aria-hidden />
      <span className={`text-[13.5px] font-semibold tracking-[-0.01em] ${dark ? "text-night-ink" : "text-ink"}`}>{label}</span>
    </div>
  );
}

/** Lays the previous section's colour under a rounded sheet's corners. */
export function SheetUnder({ tone }: { tone: "paper" | "sunken" | "stack" }) {
  const toneClass = tone === "sunken" ? styles.sheetUnderSunken : tone === "stack" ? styles.sheetUnderStack : styles.sheetUnderPaper;
  return <div aria-hidden className={cn(styles.sheetUnder, toneClass)} />;
}

// ---------------------------------------------------------------------------
// The stack
// ---------------------------------------------------------------------------

const PLATE_COUNT = STACK_ITEMS.length;

/**
 * The machine, in the proportions of the RIVET mark: an upright, a crossbar
 * with its return stub, plates stacked against the upright — a narrow group
 * above a wide group — and the pin entering from the right. Everything is in
 * viewBox units, so the same numbers drive the drawing, the motion and the
 * tests regardless of how large the rig is rendered.
 */
export const RIG = {
  view: { width: 530, height: 560 },
  upright: { x: 24, width: 24 },
  bar: { height: 24, right: 310 },
  stub: { x: 286, width: 24, bottom: 104 },
  plate: { left: 92, narrowRight: 310, wideRight: 396, height: 54, pitch: 62, top: 190, narrowCount: 3 },
  hole: { inset: 22, radius: 7 },
  pin: { rod: 56, rodHeight: 12, collar: 12, collarHeight: 26, ringRadius: 16, ringStroke: 11, clearance: 14 },
  /** How far each plate's lower face shows below it, to read as an iron slab. */
  plateDepth: 4,
  /** How far the load rises toward the stub in the finale. */
  lift: 32,
} as const;

/**
 * The scroll timeline, as fractions of the track. The pin starts home in the
 * first plate, rests in each plate for a read, then withdraws, travels and
 * inserts into the next one. What is left after the last plate lifts the stack.
 */
export const STACK_TIMELINE = { lead: 0.03, dwell: 0.09, move: 0.07 } as const;

export interface StackPose {
  /** Plate the pin is aligned with: the one it is leaving, or the one it is entering. */
  plate: number;
  /** Plate whose description is showing. */
  engaged: number;
  /** True while the pin is fully home in `plate`. */
  seated: boolean;
  /** The rod's tip, in viewBox units; the pin group is drawn from this point. */
  tipX: number;
  /** Vertical centre of the pin before the lift, in viewBox units. */
  y: number;
  /** Vertical offset of the lifted load, in viewBox units (negative is up). */
  lift: number;
  /** Progress through the finale, 0 until the last plate has been read. */
  finale: number;
}

export const plateRight = (index: number) => (index < RIG.plate.narrowCount ? RIG.plate.narrowRight : RIG.plate.wideRight);
export const plateCentre = (index: number) => RIG.plate.top + index * RIG.plate.pitch + RIG.plate.height / 2;
/** The rod is fully inside the plate when the collar meets the plate's edge. */
export const seatedTip = (index: number) => plateRight(index) - RIG.pin.rod;
/** Where the tip rests while the pin travels: clear of the widest plate. */
export const travelTip = () => RIG.plate.wideRight + RIG.pin.clearance;

/**
 * The pin's pose for a scroll progress. A pure function of the progress, so
 * scrolling back plays the same motion in reverse and reloading mid-section
 * lands on exactly the pose the reader left.
 *
 * Between plates the pin withdraws until its rod clears the widest plate,
 * travels straight down that clear lane, then inserts. One eased sweep is
 * spread over the whole path in proportion to distance, so the pin moves at a
 * steady pace and the three legs join without a jump.
 *
 * The description switches at the moment the rod's tip meets the edge of the
 * plate it is entering; in reverse, at the moment it leaves. The plate lights
 * at the same instant, and its hole shows the rod once the pin is home.
 */
export function stackPoseAt(progress: number): StackPose {
  const out = travelTip();
  const finish = (raw: { plate: number; from: number; tipX: number; y: number; lift: number; finale: number }): StackPose => {
    const inside = raw.tipX <= plateRight(raw.plate) + 0.5;
    return {
      plate: raw.plate,
      engaged: inside ? raw.plate : raw.from,
      seated: raw.plate === raw.from && raw.tipX <= seatedTip(raw.plate) + 0.5,
      tipX: raw.tipX,
      y: raw.y,
      lift: raw.lift,
      finale: raw.finale,
    };
  };
  const home = (index: number) => finish({ plate: index, from: index, tipX: seatedTip(index), y: plateCentre(index), lift: 0, finale: 0 });

  const { lead, dwell, move } = STACK_TIMELINE;
  let cursor = lead;
  if (progress < cursor) return home(0);
  for (let index = 0; index < PLATE_COUNT; index += 1) {
    if (progress < cursor + dwell) return home(index);
    cursor += dwell;
    if (index === PLATE_COUNT - 1) break;
    if (progress < cursor + move) {
      const withdraw = out - seatedTip(index);
      const travel = plateCentre(index + 1) - plateCentre(index);
      const insert = out - seatedTip(index + 1);
      const distance = smoothstep((progress - cursor) / move) * (withdraw + travel + insert);
      if (distance <= withdraw) {
        return finish({ plate: index, from: index, tipX: seatedTip(index) + distance, y: plateCentre(index), lift: 0, finale: 0 });
      }
      if (distance <= withdraw + travel) {
        return finish({ plate: index, from: index, tipX: out, y: plateCentre(index) + (distance - withdraw), lift: 0, finale: 0 });
      }
      return finish({ plate: index + 1, from: index, tipX: out - (distance - withdraw - travel), y: plateCentre(index + 1), lift: 0, finale: 0 });
    }
    cursor += move;
  }
  const last = PLATE_COUNT - 1;
  const finale = clamp((progress - cursor) / Math.max(0.001, 1 - cursor), 0, 1);
  return finish({ plate: last, from: last, tipX: seatedTip(last), y: plateCentre(last), lift: -smoothstep(finale / 0.7) * RIG.lift, finale });
}

/** The scene is pinned only where the whole composition fits; the stylesheet mirrors this query. */
const STATIC_STACK_QUERY = "(prefers-reduced-motion: reduce), (max-height: 600px)";

export function ScrollStackStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<SVGGElement>(null);
  const loadRef = useRef<SVGGElement>(null);
  const [engaged, setEngaged] = useState(0);
  const [seated, setSeated] = useState(true);
  const [finale, setFinale] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const pin = pinRef.current;
    const load = loadRef.current;
    if (!section || !pin || !load) return;

    const paint = (progress: number) => {
      const pose = stackPoseAt(progress);
      pin.style.transform = `translate(${pose.tipX.toFixed(2)}px, ${(pose.y + pose.lift).toFixed(2)}px)`;
      load.style.transform = `translate(0px, ${pose.lift.toFixed(2)}px)`;
      section.style.setProperty("--stack-progress", `${(progress * 100).toFixed(2)}%`);
      // The bar has done its job once the stack lifts; fading it keeps the seam
      // with the next sheet clean.
      section.style.setProperty("--stack-progress-opacity", (1 - smoothstep((progress - 0.9) / 0.08)).toFixed(3));
      const showFinale = pose.finale > 0.02;
      setEngaged((current) => (current === pose.engaged ? current : pose.engaged));
      setSeated((current) => (current === pose.seated ? current : pose.seated));
      setFinale((current) => (current === showFinale ? current : showFinale));
    };

    const readProgress = () => {
      const rect = section.getBoundingClientRect();
      const range = Math.max(1, section.offsetHeight - window.innerHeight);
      return clamp(-rect.top / range, 0, 1);
    };

    // Test and legacy environments have no matchMedia; they get the scrolling scene.
    const staticQuery = typeof window.matchMedia === "function" ? window.matchMedia(STATIC_STACK_QUERY) : null;
    const isStatic = () => staticQuery?.matches ?? false;
    let readyFrame = 0;
    let following = false;

    // Scroll events already arrive at most once a frame; painting straight
    // from them keeps the pin on the reader's hand with no loop of its own.
    const follow = () => paint(readProgress());
    const settle = () => paint(isStatic() ? 1 : readProgress());

    const start = () => {
      if (following) return;
      following = true;
      window.addEventListener("scroll", follow, { passive: true });
      window.addEventListener("resize", settle, { passive: true });
    };
    const stop = () => {
      if (!following) return;
      following = false;
      window.removeEventListener("scroll", follow);
      window.removeEventListener("resize", settle);
    };

    const apply = () => {
      // The first pose is written without a transition so a reload mid-section
      // shows the pin where it belongs instead of sliding it in from the top.
      delete section.dataset.stackReady;
      if (readyFrame) window.cancelAnimationFrame(readyFrame);
      settle();
      if (isStatic()) {
        stop();
        return;
      }
      start();
      readyFrame = window.requestAnimationFrame(() => {
        readyFrame = 0;
        section.dataset.stackReady = "";
      });
    };

    apply();
    staticQuery?.addEventListener("change", apply);
    return () => {
      staticQuery?.removeEventListener("change", apply);
      stop();
      if (readyFrame) window.cancelAnimationFrame(readyFrame);
      delete section.dataset.stackReady;
    };
  }, []);

  const { view, upright, bar, stub, plate, hole, pin } = RIG;

  return (
    <section ref={sectionRef} id="product" data-landing-theme="dark" className={styles.stackStory} aria-labelledby="stack-title">
      <div className={styles.stackTrack}>
        <div className={styles.stackStage}>
          <div className={styles.stackGrid}>
            <div className={styles.stackHeader}>
              <div>
                <StoryMarker label="The stack" dark />
                <h2 id="stack-title">Six plates. One pin.</h2>
              </div>
              <p className={styles.stackLead}>
                Six parts of running a gym, kept on one member record. Each plate is a module; the pin marks the one you are reading about.
              </p>
            </div>

            {/* The written version of the scene, for readers who do not scroll it. */}
            <ol className="sr-only">
              {STACK_ITEMS.map((item) => (
                <li key={item.label}>
                  {item.label}. {item.copy} {item.caps.join(". ")}.
                </li>
              ))}
              <li>{STACK_FINALE.title} {STACK_FINALE.copy}</li>
            </ol>

            <div className={styles.stackFigure} aria-hidden>
              <svg
                className={styles.rig}
                viewBox={`0 0 ${view.width} ${view.height}`}
                width={view.width}
                height={view.height}
                focusable="false"
              >
                {/* frame: upright, crossbar, return stub */}
                <rect className={styles.rigFrame} x={upright.x} y={0} width={upright.width} height={view.height} rx={6} />
                <rect className={styles.rigFrame} x={upright.x} y={0} width={bar.right - upright.x} height={bar.height} rx={6} />
                <rect className={styles.rigFrame} x={stub.x} y={0} width={stub.width} height={stub.bottom} rx={6} />

                {/* the pin, drawn under the plates so its rod disappears inside one */}
                <g ref={pinRef} className={styles.rigPin} data-stack-pin>
                  <rect className={styles.rigPinPart} x={0} y={-pin.rodHeight / 2} width={pin.rod + 2} height={pin.rodHeight} rx={pin.rodHeight / 2} />
                  <rect className={styles.rigPinPart} x={pin.rod} y={-pin.collarHeight / 2} width={pin.collar} height={pin.collarHeight} rx={4} />
                  <circle className={styles.rigPinRing} cx={pin.rod + pin.collar + pin.ringRadius + pin.ringStroke / 2} cy={0} r={pin.ringRadius} />
                </g>

                {/* the load: every plate, lifted together in the finale */}
                <g ref={loadRef} className={styles.rigLoad}>
                  {STACK_ITEMS.map((item, index) => {
                    const top = plate.top + index * plate.pitch;
                    const right = plateRight(index);
                    const lit = index <= engaged;
                    return (
                      <g
                        key={item.label}
                        data-stack-plate={index}
                        className={cn(styles.rigPlateGroup, lit && styles.rigPlateGroupLit, seated && index === engaged && styles.rigPlateGroupSeated)}
                      >
                        <rect className={styles.rigPlateSide} x={plate.left} y={top + RIG.plateDepth} width={right - plate.left} height={plate.height} rx={7} />
                        <rect className={styles.rigPlate} x={plate.left} y={top} width={right - plate.left} height={plate.height} rx={7} />
                        <text className={styles.rigPlateLabel} x={plate.left + 18} y={top + plate.height / 2} dominantBaseline="central">
                          {item.label}
                        </text>
                        <circle className={styles.rigHole} cx={right - hole.inset} cy={top + plate.height / 2} r={hole.radius} />
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>

            <div className={styles.stackCopy} aria-hidden>
              {STACK_ITEMS.map((item, index) => (
                <div key={item.label} className={cn(styles.stackState, !finale && engaged === index && styles.stackStateActive)}>
                  <h3>{item.label}</h3>
                  <p>{item.copy}</p>
                  <ul className={styles.stackCaps}>
                    {item.caps.map((cap) => <li key={cap}>{cap}</li>)}
                  </ul>
                </div>
              ))}
              <div className={cn(styles.stackState, finale && styles.stackStateActive)}>
                <h3>{STACK_FINALE.title}</h3>
                <p>{STACK_FINALE.copy}</p>
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
// A day on RIVET
// ---------------------------------------------------------------------------

/** Where the sticky clock rests, matching `.daySticky` / `.dayAside` in the stylesheet. */
const clockOffset = () => (window.innerWidth <= 720 ? 68 : 88);

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
      className={cn(styles.coverSheet, styles.paperSheet, styles.layer4, styles.daySection)}
    >
      <div className={styles.dayGrid}>
        <aside className={styles.dayAside}>
          <div className={styles.daySticky}>
            <StoryMarker label="A day on RIVET" />
            <h2 id="day-title" className="sr-only">A day on RIVET</h2>
            <p className={styles.dayLead}>One ordinary day, as reception and the owner see it.</p>
            <p className={styles.dayClock} aria-hidden>
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
      className={cn(styles.coverSheet, styles.inkSheet, styles.layer5, styles.accountSection)}
    >
      <div className={styles.accountInner}>
        <StoryMarker label="Accountability" dark />
        <div className={styles.accountBody}>
          <div>
            <Reveal>
              <h2 id="accountability-title" className={styles.accountTitle}>Nothing gets edited quietly.</h2>
            </Reveal>
            <Reveal delay={120}>
              <p className={styles.accountLead}>Every sale, payment, check-in and shift change is recorded under the person who did it. Corrections are allowed. Silent ones are not, and the owner sees the day as it happened.</p>
            </Reveal>
          </div>
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
      className={cn(styles.coverSheet, styles.paperSheet, styles.layer6, styles.regionSection)}
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
