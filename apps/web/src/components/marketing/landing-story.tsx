"use client";

import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from "react";
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
    copy: "Plans, renewals, freezes and upgrades, with expiries the desk sees before the member asks.",
    caps: ["Plans and renewals", "Freezes and transfers", "Access ends with the plan"],
  },
  {
    label: "Payments",
    copy: "Cash, card and CliQ payments, with a receipt for every payment and an outstanding balance on every member.",
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
    title: "A partial payment, recorded.",
    copy: "A partial payment is recorded, a receipt is issued, and the remaining balance stays visible on the member account.",
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
  ["Payments", "Cash, card and CliQ payments, with a receipt for each."],
  ["Language", "English interface. Arabic names can be recorded; full Arabic and RTL support is planned."],
  ["Calendar", "Ramadan hours, Friday schedules and public holidays."],
  ["Memberships", "Plans, renewals, freezes and transfers."],
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

/**
 * The section marker: a rule, a short red dash and the label. The `drawn`
 * variant is for a boundary with no sheet edge of its own — its red rule draws
 * across the whole width as the section arrives, then settles into the dash.
 * Wrap it in a still `Reveal` so it knows when it has come into view.
 */
export function StoryMarker({ label, dark = false, drawn = false }: { label: string; dark?: boolean; drawn?: boolean }) {
  if (drawn) {
    return (
      <div className={styles.markerDrawn}>
        <span className={styles.markerRule} aria-hidden />
        <span className={styles.markerDrawnLabel}>{label}</span>
      </div>
    );
  }
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
  /**
   * The rod runs straight into the ring, one piece. `clearance` is how far
   * the rod's tip stops from a plate's opening when the pin is withdrawn —
   * the same for every plate, whatever its width.
   */
  pin: { rod: 56, rodHeight: 12, ringRadius: 17, ringStroke: 12, clearance: 14 },
  /** How far each plate's lower face shows below it, to read as an iron slab. */
  plateDepth: 4,
} as const;

/** How long the pin rests in a plate before it moves on to the next. */
export const STACK_DWELL_MS = 4000;
/** The pin's pace in viewBox units per millisecond, and the bounds one move may take. */
export const STACK_PACE = { unitsPerMs: 0.42, minMs: 380, maxMs: 1250 } as const;

export interface PinPose {
  /** The rod's tip, in viewBox units; the pin group is drawn from this point. */
  tipX: number;
  /** The pin's centre line. */
  y: number;
}

export const plateRight = (index: number) => (index < RIG.plate.narrowCount ? RIG.plate.narrowRight : RIG.plate.wideRight);
export const plateTop = (index: number) => RIG.plate.top + index * RIG.plate.pitch;
export const plateCentre = (index: number) => plateTop(index) + RIG.plate.height / 2;
/** The rod is fully inside the plate when the ring meets the plate's edge. */
export const seatedTip = (index: number) => plateRight(index) - RIG.pin.rod;
/** Where the tip rests once withdrawn from a plate: the same distance from every plate's opening. */
export const clearTip = (index: number) => plateRight(index) + RIG.pin.clearance;
export const seatedPose = (index: number): PinPose => ({ tipX: seatedTip(index), y: plateCentre(index) });

const near = (a: number, b: number, tolerance = 0.5) => Math.abs(a - b) <= tolerance;

/** The plate whose row the pin is on, if it is on one. */
export function plateAtRow(y: number): number | null {
  for (let index = 0; index < PLATE_COUNT; index += 1) {
    if (near(y, plateCentre(index))) return index;
  }
  return null;
}

/**
 * The lane the pin travels along between two rows: clear of every plate whose
 * row it crosses, by the same clearance from each plate's edge. Between two
 * narrow plates that is a short withdrawal; wherever a wide plate lies on the
 * way, the pin withdraws further to pass it. A pin that is already further
 * out stays where it is rather than moving in first.
 */
export function laneFor(from: PinPose, target: number): number {
  const yTo = plateCentre(target);
  const low = Math.min(from.y, yTo) - RIG.pin.rodHeight / 2;
  const high = Math.max(from.y, yTo) + RIG.pin.rodHeight / 2;
  let widest = 0;
  for (let index = 0; index < PLATE_COUNT; index += 1) {
    const top = plateTop(index);
    if (top <= high && top + RIG.plate.height >= low) widest = Math.max(widest, plateRight(index));
  }
  return Math.max(widest + RIG.pin.clearance, from.tipX);
}

/**
 * The pin's path from wherever it is to home in a plate: withdraw until the
 * rod is clear of every plate it will pass, travel along that lane, insert.
 * On the same row it simply slides home. The path starts at `from`, so a
 * plate chosen mid-move continues from the pin's current position instead of
 * competing with the move under way.
 */
export function pinPath(from: PinPose, target: number): PinPose[] {
  const to = seatedPose(target);
  if (near(from.y, to.y)) return near(from.tipX, to.tipX) ? [from] : [from, to];
  const lane = laneFor(from, target);
  const points: PinPose[] = [from];
  if (from.tipX < lane - 0.01) points.push({ tipX: lane, y: from.y });
  points.push({ tipX: lane, y: to.y }, to);
  return points;
}

export function pathLength(points: PinPose[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    if (a && b) length += Math.hypot(b.tipX - a.tipX, b.y - a.y);
  }
  return length;
}

/** The pose `distance` units along the path, walking its legs in order. */
export function poseAlong(points: PinPose[], distance: number): PinPose {
  let remaining = Math.max(0, distance);
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    if (!a || !b) break;
    const leg = Math.hypot(b.tipX - a.tipX, b.y - a.y);
    if (remaining <= leg || index === points.length - 1) {
      const t = leg === 0 ? 1 : Math.min(1, remaining / leg);
      return { tipX: a.tipX + (b.tipX - a.tipX) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= leg;
  }
  return points[points.length - 1] ?? { tipX: 0, y: 0 };
}

/** One eased sweep over the whole path, paced by its length: a long trip takes longer, but never drags. */
export function moveDuration(length: number): number {
  return clamp(length / STACK_PACE.unitsPerMs, STACK_PACE.minMs, STACK_PACE.maxMs);
}

type PauseKey = "focus" | "hidden" | "offscreen";

interface StackEngine {
  select(index: number): void;
  pause(key: PauseKey, value: boolean): void;
  destroy(): void;
}

/**
 * Drives the pin. One move runs at a time: choosing a plate cancels the move
 * under way and plans a fresh path from the pin's current position. When the
 * pin seats, a timer moves it on after the dwell; the timer is held while a
 * keyboard user has focus in the section, while the tab is hidden or the rig
 * is off screen, and never runs for a reader who prefers reduced motion, for
 * whom every move is instant. A click or a tap simply resets the dwell.
 */
function createStackEngine(
  pin: SVGGElement,
  notify: { selected(index: number): void; engaged(index: number): void; seated(value: boolean): void },
): StackEngine {
  let pose: PinPose = seatedPose(0);
  let engaged = 0;
  let seated = true;
  let move: { frame: number; start: number; duration: number; points: PinPose[]; length: number; target: number } | null = null;
  let timer = 0;
  const paused: Record<PauseKey, boolean> = { focus: false, hidden: false, offscreen: true };
  const reduced = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  const paint = (next: PinPose) => {
    pose = next;
    pin.style.transform = `translate(${next.tipX.toFixed(2)}px, ${next.y.toFixed(2)}px)`;
    // The plate and its description switch the moment the rod's tip meets the
    // edge of the plate it is entering; leaving a plate changes nothing until then.
    const row = plateAtRow(next.y);
    if (row !== null && row !== engaged && next.tipX <= plateRight(row) + 0.5) {
      engaged = row;
      notify.engaged(row);
    }
    const home = row !== null && row === engaged && next.tipX <= seatedTip(row) + 0.5;
    if (home !== seated) {
      seated = home;
      notify.seated(home);
    }
  };

  const clearTimer = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
  };
  const isPaused = () => paused.focus || paused.hidden || paused.offscreen;
  const stop = () => {
    if (move) window.cancelAnimationFrame(move.frame);
    move = null;
  };

  const schedule = () => {
    clearTimer();
    if (move || reduced?.matches || isPaused()) return;
    timer = window.setTimeout(() => {
      timer = 0;
      select((engaged + 1) % PLATE_COUNT);
    }, STACK_DWELL_MS);
  };

  const step = (now: number) => {
    if (!move) return;
    const t = clamp((now - move.start) / move.duration, 0, 1);
    paint(poseAlong(move.points, smoothstep(t) * move.length));
    if (t < 1) {
      move.frame = window.requestAnimationFrame(step);
      return;
    }
    const { target } = move;
    move = null;
    paint(seatedPose(target));
    schedule();
  };

  function select(index: number) {
    clearTimer();
    if (move?.target === index) return;
    notify.selected(index);
    stop();
    const points = pinPath(pose, index);
    const length = pathLength(points);
    if (length < 0.01 || reduced?.matches) {
      paint(seatedPose(index));
      schedule();
      return;
    }
    move = { frame: 0, start: performance.now(), duration: moveDuration(length), points, length, target: index };
    move.frame = window.requestAnimationFrame(step);
  }

  const onMotionPreferenceChange = () => {
    if (reduced?.matches && move) {
      const { target } = move;
      stop();
      paint(seatedPose(target));
    }
    schedule();
  };
  reduced?.addEventListener("change", onMotionPreferenceChange);
  paint(pose);

  return {
    select,
    pause(key, value) {
      if (paused[key] === value) return;
      paused[key] = value;
      if (isPaused()) clearTimer();
      else schedule();
    },
    destroy() {
      stop();
      clearTimer();
      reduced?.removeEventListener("change", onMotionPreferenceChange);
    },
  };
}

const PLATE_KEYS: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

export function StackStory() {
  const gridRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<SVGGElement>(null);
  const plateRefs = useRef<Array<SVGGElement | null>>([]);
  const engineRef = useRef<StackEngine | null>(null);
  const [selected, setSelected] = useState(0);
  const [engaged, setEngaged] = useState(0);
  const [seated, setSeated] = useState(true);

  useEffect(() => {
    const pin = pinRef.current;
    const figure = figureRef.current;
    if (!pin || !figure) return;

    const engine = createStackEngine(pin, { selected: setSelected, engaged: setEngaged, seated: setSeated });
    engineRef.current = engine;

    const onVisibility = () => engine.pause("hidden", document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);

    // The pin only works while the rig can be seen.
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "function") {
      observer = new IntersectionObserver(([entry]) => engine.pause("offscreen", !entry?.isIntersecting), { threshold: 0.4 });
      observer.observe(figure);
    } else {
      engine.pause("offscreen", false);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  const choose = (index: number) => engineRef.current?.select(index);

  const onPlateKeyDown = (event: KeyboardEvent<SVGGElement>, index: number) => {
    let next: number | null = null;
    const delta = PLATE_KEYS[event.key];
    if (delta !== undefined) next = (index + delta + PLATE_COUNT) % PLATE_COUNT;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = PLATE_COUNT - 1;
    else if (event.key === "Enter" || event.key === " ") next = index;
    if (next === null) return;
    event.preventDefault();
    plateRefs.current[next]?.focus();
    choose(next);
  };

  // Keyboard focus inside the section holds the pin where it is, so a plate
  // is not taken away from under a reader working through the tabs. Focus
  // that a click or a tap leaves behind does not count: that reader has just
  // chosen a plate and expects the loop to carry on from it.
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    let keyboard = true;
    try {
      keyboard = event.target.matches(":focus-visible");
    } catch {
      keyboard = true;
    }
    if (keyboard) engineRef.current?.pause("focus", true);
  };
  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) engineRef.current?.pause("focus", false);
  };

  const { view, upright, bar, stub, plate, hole, pin } = RIG;
  const ringOuter = pin.ringRadius + pin.ringStroke / 2;

  return (
    <section id="product" data-landing-theme="dark" className={styles.stackStory} aria-labelledby="stack-title">
      <div ref={gridRef} className={styles.stackGrid} onFocus={onFocus} onBlur={onBlur}>
        <div className={styles.stackHeader}>
          <div>
            <StoryMarker label="The stack" dark />
            <h2 id="stack-title">Six plates. One pin.</h2>
          </div>
          <p className={styles.stackLead}>
            Six modules on one member record: a payment taken at reception is already on the member, in the ledger and in the daily close. Tap a plate, or let the pin work through them.
          </p>
        </div>

        <div ref={figureRef} className={styles.stackFigure}>
          <svg
            className={styles.rig}
            viewBox={`0 0 ${view.width} ${view.height}`}
            width={view.width}
            height={view.height}
            focusable="false"
          >
            <defs>
              {/* Matte shading: a touch lighter along the top of the pin, darker underneath. */}
              <linearGradient id="stack-pin-shade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#ec3f46" />
                <stop offset="0.55" stopColor="#e5262e" />
                <stop offset="1" stopColor="#c9202a" />
              </linearGradient>
              {/* The hole's rim: a dark upper lip, a lit lower one, so it reads as cut into the face. */}
              <linearGradient id="stack-hole-rim" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#000000" stopOpacity="0.55" />
                <stop offset="0.5" stopColor="#000000" stopOpacity="0.1" />
                <stop offset="1" stopColor="#f2f0e6" stopOpacity="0.3" />
              </linearGradient>
              <filter id="stack-plate-shadow" x="-10%" y="-60%" width="120%" height="260%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
            </defs>

            {/* frame: upright, crossbar, return stub */}
            <g aria-hidden>
              <rect className={styles.rigFrame} x={upright.x} y={0} width={upright.width} height={view.height} rx={6} />
              <rect className={styles.rigFrame} x={upright.x} y={0} width={bar.right - upright.x} height={bar.height} rx={6} />
              <rect className={styles.rigFrame} x={stub.x} y={0} width={stub.width} height={stub.bottom} rx={6} />
            </g>

            {/* each plate's soft shadow on the one beneath, drawn before any face */}
            <g aria-hidden>
              {STACK_ITEMS.map((item, index) => (
                <rect
                  key={item.label}
                  className={styles.rigPlateShadow}
                  x={plate.left + 5}
                  y={plateTop(index) + plate.height - 1}
                  width={plateRight(index) - plate.left - 10}
                  height={10}
                  rx={5}
                  filter="url(#stack-plate-shadow)"
                />
              ))}
            </g>

            {/* the pin, drawn under the plates so its rod disappears inside one */}
            <g ref={pinRef} className={styles.rigPin} data-stack-pin aria-hidden>
              <rect className={styles.rigPinRod} x={0} y={-pin.rodHeight / 2} width={pin.rod + pin.ringStroke / 2} height={pin.rodHeight} rx={pin.rodHeight / 2} />
              <circle className={styles.rigPinRing} cx={pin.rod + ringOuter} cy={0} r={pin.ringRadius} />
            </g>

            {/* the plates: each one a tab the pin can be sent to */}
            <g role="tablist" aria-label="Modules" aria-orientation="vertical">
              {STACK_ITEMS.map((item, index) => {
                const top = plateTop(index);
                const right = plateRight(index);
                const width = right - plate.left;
                const isSelected = selected === index;
                return (
                  <g
                    key={item.label}
                    ref={(node) => { plateRefs.current[index] = node; }}
                    id={`stack-tab-${index}`}
                    role="tab"
                    aria-selected={isSelected}
                    aria-controls="stack-panel"
                    aria-label={item.label}
                    tabIndex={isSelected ? 0 : -1}
                    data-stack-plate={index}
                    className={cn(styles.rigPlateGroup, engaged === index && styles.rigPlateGroupLit, seated && engaged === index && styles.rigPlateGroupSeated)}
                    onClick={() => choose(index)}
                    onKeyDown={(event) => onPlateKeyDown(event, index)}
                  >
                    {/* the whole pitch answers a tap, not just the face */}
                    <rect className={styles.rigPlateHit} x={plate.left - 6} y={top - (plate.pitch - plate.height) / 2} width={width + 18} height={plate.pitch} />
                    <rect className={styles.rigPlateSide} x={plate.left} y={top + RIG.plateDepth} width={width} height={plate.height} rx={7} />
                    <rect className={styles.rigPlate} x={plate.left} y={top} width={width} height={plate.height} rx={7} />
                    <rect className={styles.rigPlateEdge} x={plate.left + 7} y={top + 1} width={width - 14} height={1.5} rx={0.75} />
                    <text className={styles.rigPlateLabel} x={plate.left + 18} y={top + plate.height / 2} dominantBaseline="central">
                      {item.label}
                    </text>
                    <circle className={styles.rigHole} cx={right - hole.inset} cy={top + plate.height / 2} r={hole.radius} />
                    <circle className={styles.rigHoleRim} cx={right - hole.inset} cy={top + plate.height / 2} r={hole.radius} />
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        <div id="stack-panel" role="tabpanel" aria-labelledby={`stack-tab-${selected}`} className={styles.stackCopy}>
          {STACK_ITEMS.map((item, index) => (
            <div key={item.label} className={cn(styles.stackState, engaged === index && styles.stackStateActive)} aria-hidden={engaged !== index}>
              <h3>{item.label}</h3>
              <p>{item.copy}</p>
              <ul className={styles.stackCaps}>
                {item.caps.map((cap) => <li key={cap}>{cap}</li>)}
              </ul>
            </div>
          ))}
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
