"use client";
import { useLocale, type TKey } from "@/lib/i18n/provider";
import { useFormat } from "@/lib/i18n/format";
import * as messages from "@/lib/i18n/messages";

import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent } from "react";
import { Reveal } from "@/components/marketing/reveal";
import { cn } from "@/lib/utils/cn";
import styles from "./landing-cinematic.module.css";
import { bindStackScroll, type StackScroll } from "./stack-scroll";

export const STACK_ITEMS = [
  { key: "sales", caps: ["leadCapture", "followUps", "conversion"] },
  { key: "memberships", caps: ["plans", "freezes", "access"] },
  { key: "payments", caps: ["methods", "receipts", "drawer"] },
  { key: "reception", caps: ["access", "sales", "shifts"] },
  { key: "operations", caps: ["team", "classes", "close"] },
  { key: "activity", caps: ["attendance", "inactivity", "renewal"] },
] as const;

const DAY_EVENTS = [
  { time: "06:00", key: "doors" },
  { time: "09:30", key: "walkIn" },
  { time: "13:15", key: "payment" },
  { time: "21:00", key: "handover" },
  { time: "23:00", key: "close" },
] as const;

const REGIONAL_SPECS = [
  "currency", "payments", "language", "calendar", "memberships", "branches",
] as const;

/** One entry's life on the ledger. Roles only, so nothing reads as a real person or amount. */
const TRAIL = [
  { id: "recorded" },
  { id: "corrected" },
  { id: "reviewed" },
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
      <span className="h-[3px] w-7 origin-left rounded-sm rtl:origin-right bg-signal transition-transform duration-500 group-hover:scale-x-150" aria-hidden />
      <span className={`text-[13.5px] font-semibold tracking-[-0.01em] ${dark ? "text-night-ink" : "text-ink"}`}>{label}</span>
    </div>
  );
}

/** Lays the previous section's colour under a rounded sheet's corners. */
export function SheetUnder({ tone }: { tone: "paper" | "sunken" | "stack" | "film" }) {
  const toneClass = { paper: styles.sheetUnderPaper, sunken: styles.sheetUnderSunken, stack: styles.sheetUnderStack, film: styles.sheetUnderFilm }[tone];
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

/**
 * The pinned stack's scroll, in steps of one plate. The run opens with a short
 * rest on the first plate (`lead`) and closes with one on the last (`tail`);
 * within each step the pin rests seated for `hold` of it, half either side of
 * the plate, and makes its move in the rest.
 */
export const STACK_SCROLL = { lead: 0.25, tail: 0.5, hold: 0.4 } as const;

/** The whole run, in steps: the stylesheet multiplies it by one step's height. */
export const STACK_SCROLL_STEPS = STACK_SCROLL.lead + (PLATE_COUNT - 1) + STACK_SCROLL.tail;

/** The pin's pose with the page `steps` into the stack's run. */
export function stackPoseAt(steps: number): PinPose {
  const at = clamp(steps - STACK_SCROLL.lead, 0, PLATE_COUNT - 1);
  const from = Math.min(Math.floor(at), PLATE_COUNT - 2);
  const local = at - from;
  const edge = STACK_SCROLL.hold / 2;
  if (local <= edge) return seatedPose(from);
  if (local >= 1 - edge) return seatedPose(from + 1);
  const points = pinPath(seatedPose(from), from + 1);
  return poseAlong(points, smoothstep((local - edge) / (1 - STACK_SCROLL.hold)) * pathLength(points));
}

/** Where the pin rests seated in a plate, in steps: chosen plates scroll here. */
export const stackStepsFor = (index: number) => STACK_SCROLL.lead + index;

type PauseKey = "focus" | "hidden" | "offscreen" | "scroll";

interface StackEngine {
  select(index: number): void;
  /** Puts the pin at a pose at once: the scroll drives it while the stack is pinned. */
  show(pose: PinPose): void;
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
  const paused: Record<PauseKey, boolean> = { focus: false, hidden: false, offscreen: true, scroll: false };
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
  const isPaused = () => paused.focus || paused.hidden || paused.offscreen || paused.scroll;
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
    show(next) {
      clearTimer();
      stop();
      paint(next);
    },
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

/** A rectangle with rounded corners, as one path, so it can draw itself in. */
const outline = (x: number, y: number, w: number, h: number, r = 0) =>
  r
    ? `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
    : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;

/** The page is pinned on the stack and scrolls the pin; reduced motion and very short screens keep the tappable machine. */
const STATIC_STACK = "(prefers-reduced-motion: reduce), (max-height: 559px)";

type DrawState = "drawn" | "pending" | "drawing";

export function StackStory() {
  const { t, locale } = useLocale();
  const stackItems = STACK_ITEMS.map((item) => ({
    key: item.key,
    label: t(`publicCompletion.story.stack.items.${item.key}.label` as TKey),
    copy: t(`publicCompletion.story.stack.items.${item.key}.copy` as TKey),
    caps: item.caps.map((cap) => t(`publicCompletion.story.stack.items.${item.key}.caps.${cap}` as TKey)),
  }));
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<SVGGElement>(null);
  const plateRefs = useRef<Array<SVGGElement | null>>([]);
  const engineRef = useRef<StackEngine | null>(null);
  const scrollRef = useRef<StackScroll | null>(null);
  const [selected, setSelected] = useState(0);
  const [engaged, setEngaged] = useState(0);
  const [seated, setSeated] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [draw, setDraw] = useState<DrawState>("drawn");

  useEffect(() => {
    const pin = pinRef.current;
    const figure = figureRef.current;
    const section = sectionRef.current;
    const stage = stageRef.current;
    if (!pin || !figure || !section || !stage) return;

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

    // Pinned, the page's scroll drives the pin; otherwise the machine runs itself and takes taps.
    const staticQuery = typeof window.matchMedia === "function" ? window.matchMedia(STATIC_STACK) : null;
    const applyMode = () => {
      scrollRef.current?.destroy();
      scrollRef.current = null;
      const pinned = !staticQuery?.matches;
      setScrolled(pinned);
      engine.pause("scroll", pinned);
      if (pinned) {
        section.setAttribute("data-stack-scrolly", "");
        scrollRef.current = bindStackScroll({
          section,
          stage,
          totalSteps: STACK_SCROLL_STEPS,
          onSteps: (steps) => engine.show(stackPoseAt(steps)),
        });
      } else {
        section.removeAttribute("data-stack-scrolly");
      }
    };
    applyMode();
    staticQuery?.addEventListener("change", applyMode);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      staticQuery?.removeEventListener("change", applyMode);
      observer?.disconnect();
      scrollRef.current?.destroy();
      scrollRef.current = null;
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // The lines draw themselves in the first time the machine comes into view.
  // Already on screen when the page opens (a reload part way down), it is simply drawn.
  useEffect(() => {
    const figure = figureRef.current;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!figure || reduced || typeof IntersectionObserver !== "function") return;
    if (figure.getBoundingClientRect().top < window.innerHeight) return;
    setDraw("pending");
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setDraw("drawing");
      observer.disconnect();
    }, { threshold: 0.25 });
    observer.observe(figure);
    return () => observer.disconnect();
  }, []);

  const choose = (index: number) => {
    if (scrollRef.current) scrollRef.current.toSteps(stackStepsFor(index));
    else engineRef.current?.select(index);
  };

  const onPlateKeyDown = (event: KeyboardEvent<SVGGElement>, index: number) => {
    let next: number | null = null;
    const delta = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : event.key === "ArrowRight" ? (locale === "ar" ? -1 : 1) : event.key === "ArrowLeft" ? (locale === "ar" ? 1 : -1) : undefined;
    if (delta !== undefined) next = (index + delta + PLATE_COUNT) % PLATE_COUNT;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = PLATE_COUNT - 1;
    else if (event.key === "Enter" || event.key === " ") next = index;
    if (next === null) return;
    event.preventDefault();
    plateRefs.current[next]?.focus({ preventScroll: true });
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
  const ringInner = pin.ringRadius - pin.ringStroke / 2;
  // Pinned, the plate the pin is in is the chosen tab; otherwise the last one chosen is.
  const current = scrolled ? engaged : selected;
  // Each line's place in the draw-in, in seconds.
  const at = (seconds: number) => ({ "--d": `${seconds.toFixed(2)}s` }) as CSSProperties;
  const centreX = (plate.left + plate.narrowRight) / 2;
  const r = 5;
  const frameOutline = [
    `M${upright.x + r} 0H${bar.right - r}A${r} ${r} 0 0 1 ${bar.right} ${r}`,
    `V${stub.bottom - r}A${r} ${r} 0 0 1 ${bar.right - r} ${stub.bottom}H${stub.x + r}A${r} ${r} 0 0 1 ${stub.x} ${stub.bottom - r}`,
    `V${bar.height}H${upright.x + upright.width}`,
    `V${view.height - r}A${r} ${r} 0 0 1 ${upright.x + upright.width - r} ${view.height}H${upright.x + r}A${r} ${r} 0 0 1 ${upright.x} ${view.height - r}`,
    `V${r}A${r} ${r} 0 0 1 ${upright.x + r} 0Z`,
  ].join("");

  return (
    <section
      ref={sectionRef}
      id="product"
      data-landing-theme="dark"
      data-landing-stack
      className={styles.stackStory}
      style={{ "--stack-steps": STACK_SCROLL_STEPS } as CSSProperties}
      aria-labelledby="stack-title"
    >
      <div ref={stageRef} className={styles.stackStage}>
        <div className={styles.stackGrid} onFocus={onFocus} onBlur={onBlur}>
          <div className={styles.stackHeader}>
            <StoryMarker label={t("publicCompletion.header.stack")} dark />
            <h2 id="stack-title">{t("publicCompletion.story.stack.title")}</h2>
          </div>

          <div ref={figureRef} className={styles.stackFigure}>
            {/* A line drawing, as on the sign-in pages: the frame, the plates and the
                pin in outline, with faint construction lines for the pin's lanes. */}
            <svg
              className={cn(styles.rig, draw === "pending" && styles.rigPending, draw === "drawing" && styles.rigDrawing)}
              viewBox={`0 0 ${view.width} ${view.height}`}
              width={view.width}
              height={view.height}
              focusable="false"
            >
              {/* construction: the stack's centre line, and each plate's lane out to where the pin waits */}
              <g aria-hidden className={styles.rigGuides}>
                <path className={styles.rigGuide} d={`M${centreX} ${bar.height + 10}V${view.height}`} strokeDasharray="3 7" />
                {stackItems.map((item, index) => (
                  <path key={item.key} className={styles.rigGuide} d={`M${plateRight(index) + 6} ${plateCentre(index)}H${view.width}`} strokeDasharray="2 6" />
                ))}
              </g>

              {/* frame: upright, crossbar and return stub as one outline, the mark's own shape */}
              <g aria-hidden>
                <path className={cn(styles.rigLine, styles.rigFrame)} pathLength={1} style={at(0)} d={frameOutline} />
              </g>

              {/* the pin, drawn under the plates so its rod disappears inside one */}
              <g ref={pinRef} className={styles.rigPin} data-stack-pin aria-hidden>
                <path className={cn(styles.rigLine, styles.rigPinPart)} pathLength={1} style={at(0.9)} d={outline(0, -pin.rodHeight / 2, pin.rod + pin.ringStroke / 2, pin.rodHeight, pin.rodHeight / 2)} />
                <path className={cn(styles.rigLine, styles.rigPinPart)} pathLength={1} style={at(0.95)} d={circle(pin.rod + ringOuter, 0, ringOuter)} />
                <path className={cn(styles.rigLine, styles.rigPinInner)} pathLength={1} style={at(1.05)} d={circle(pin.rod + ringOuter, 0, ringInner)} />
                <circle className={cn(styles.rigFade, styles.rigPinDot)} style={at(1.2)} cx={pin.rod + ringOuter} cy={0} r={3.2} />
              </g>

              {/* the plates: each one a tab the pin can be sent to */}
              <g role="tablist" aria-label={t("publicCompletion.story.stack.tabLabel")} aria-orientation="vertical">
                {stackItems.map((item, index) => {
                  const top = plateTop(index);
                  const right = plateRight(index);
                  const width = right - plate.left;
                  const isCurrent = current === index;
                  const delay = 0.3 + index * 0.07;
                  return (
                    <g
                      key={item.key}
                      ref={(node) => { plateRefs.current[index] = node; }}
                      id={`stack-tab-${index}`}
                      role="tab"
                      aria-selected={isCurrent}
                      aria-controls="stack-panel"
                      aria-label={item.label}
                      tabIndex={isCurrent ? 0 : -1}
                      data-stack-plate={index}
                      className={cn(styles.rigPlateGroup, engaged === index && styles.rigPlateGroupLit, seated && engaged === index && styles.rigPlateGroupSeated)}
                      onClick={() => choose(index)}
                      onKeyDown={(event) => onPlateKeyDown(event, index)}
                    >
                      {/* the whole pitch answers a tap, not just the face */}
                      <rect className={styles.rigPlateHit} x={plate.left - 6} y={top - (plate.pitch - plate.height) / 2} width={width + 18} height={plate.pitch} />
                      <path className={cn(styles.rigLine, styles.rigPlateSide)} pathLength={1} style={at(delay + 0.05)} d={outline(plate.left, top + RIG.plateDepth, width, plate.height, 7)} />
                      <path className={cn(styles.rigLine, styles.rigPlate)} pathLength={1} style={at(delay)} d={outline(plate.left, top, width, plate.height, 7)} />
                      {/* The rig keeps the mark's orientation in Arabic, so the label still
                          sits at the plate's open left end; RTL flips "start" to the right. */}
                      <text className={cn(styles.rigFade, styles.rigPlateLabel)} style={at(delay + 0.25)} x={plate.left + 18} y={top + plate.height / 2} dominantBaseline="central" textAnchor={locale === "ar" ? "end" : "start"}>
                        {item.label}
                      </text>
                      <path className={cn(styles.rigLine, styles.rigHole)} pathLength={1} style={at(delay + 0.2)} d={circle(right - hole.inset, top + plate.height / 2, hole.radius)} />
                      <circle className={cn(styles.rigFade, styles.rigHoleDot)} style={at(delay + 0.4)} cx={right - hole.inset} cy={top + plate.height / 2} r={hole.radius - 3} />
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          <div className={styles.stackCopy}>
            <div id="stack-panel" role="tabpanel" aria-labelledby={`stack-tab-${current}`} className={styles.stackStates}>
              {stackItems.map((item, index) => (
                <div key={item.key} className={cn(styles.stackState, engaged === index && styles.stackStateActive)} aria-hidden={engaged !== index}>
                  <h3>{item.label}</h3>
                  <p>{item.copy}</p>
                  <ul className={styles.stackCaps}>
                    {item.caps.map((cap) => <li key={cap}>{cap}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <p className={styles.stackNote}>{t("publicCompletion.story.stack.note")}</p>
          </div>
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
  const { t } = useLocale();
  const f = useFormat();
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
  const [clockDigits, clockPeriod] = f.clock(current.time).split(" ");

  return (
    <section
      ref={sectionRef}
      id="day"
      data-landing-theme="paper"
      aria-labelledby="day-title"
      className={cn(styles.coverSheet, styles.paperSheet, styles.layer4, styles.daySection)}
      data-landing-snap="start"
    >
      <div className={styles.dayGrid}>
        <aside className={styles.dayAside}>
          <div className={styles.daySticky}>
            <StoryMarker label={t("publicCompletion.story.day.eyebrow", { brand: "RIVET" })} />
            <h2 id="day-title" className="sr-only">{t("publicCompletion.story.day.title", { brand: "RIVET" })}</h2>
            <p className={styles.dayLead}>{t("publicCompletion.story.day.lead")}</p>
            <p className={styles.dayClock} aria-hidden>
              <span className={styles.dayTimeMask}>
                {/* Arabic's 12-hour clock carries ص/م; it rides beside the digits at
                    caption size instead of wrapping under them at display size. */}
                <span key={`${current.time}-${landed}`} className={styles.dayTime}>
                  {clockDigits}{clockPeriod ? <span className={styles.dayPeriod}>{clockPeriod}</span> : null}
                </span>
              </span>
              <span key={`${current.key}-${landed}`} className={styles.dayWhere}>{t(`publicCompletion.story.day.events.${current.key}.where`)}</span>
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
              <time className={styles.dayMomentTime} dateTime={event.time}>{f.clock(event.time)}</time>
              <h3>{t(`publicCompletion.story.day.events.${event.key}.title`)}</h3>
              <p>{t(`publicCompletion.story.day.events.${event.key}.copy`)}</p>
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
  const { t, locale } = useLocale();
  const f = useFormat();
  const rows = {
    recorded: {
      key: t("publicCompletion.story.accountability.rows.recorded.key"),
      body: t("publicCompletion.story.accountability.rows.recorded.body"),
      meta: t("publicCompletion.story.accountability.rows.recorded.meta", { time: f.clock("09:14") }),
    },
    corrected: {
      key: t("publicCompletion.story.accountability.rows.corrected.key"),
      before: t("publicCompletion.story.accountability.rows.corrected.before"),
      after: t("publicCompletion.story.accountability.rows.corrected.after"),
      reason: t("publicCompletion.story.accountability.rows.corrected.reason"),
      meta: t("publicCompletion.story.accountability.rows.corrected.meta", { time: f.clock("11:36") }),
    },
    reviewed: {
      key: t("publicCompletion.story.accountability.rows.reviewed.key"),
      body: t("publicCompletion.story.accountability.rows.reviewed.body"),
      meta: t("publicCompletion.story.accountability.rows.reviewed.meta"),
    },
  };
  return (
    <section
      id="accountability"
      data-landing-cover
      data-landing-theme="dark"
      aria-labelledby="accountability-title"
      className={cn(styles.coverSheet, styles.inkSheet, styles.layer5, styles.accountSection)}
    >
      <div className={styles.accountInner}>
        <StoryMarker label={t("publicCompletion.header.accountability")} dark />
        <div className={styles.accountBody}>
          <div>
            <Reveal>
              <h2 id="accountability-title" className={styles.accountTitle}>{t("publicCompletion.story.accountability.title")}</h2>
            </Reveal>
            <Reveal delay={120}>
              <p className={styles.accountLead}>{t("publicCompletion.story.accountability.body")}</p>
            </Reveal>
          </div>
          <Reveal delay={200} className={styles.trailReveal}>
            <div className={styles.trail}>
              <div className={styles.trailHead}>
                <span>{t("publicCompletion.story.accountability.payment")}</span>
                <span>{t("publicCompletion.preview.dashboard.auditTrail")}</span>
              </div>
              {TRAIL.map(({ id }, index) => {
                const row = rows[id];
                return (
                <div key={id} className={styles.trailRow} style={{ "--row-delay": `${260 + index * 220}ms` } as CSSProperties}>
                  <span className={styles.trailKey}>{row.key}</span>
                  <p>
                    {id === "corrected" ? (
                      <>
                        {rows.corrected.reason} <s className="whitespace-nowrap">{rows.corrected.before}</s> {locale === "ar" ? "←" : "→"} <strong className="whitespace-nowrap">{rows.corrected.after}</strong>
                      </>
                    ) : id === "recorded" ? rows.recorded.body : rows.reviewed.body}
                    <span className={styles.trailMeta}>{row.meta}</span>
                  </p>
                </div>
                );
              })}
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
  const { t, locale } = useLocale();
  const echo = locale === "ar"
    ? { lang: "en", dir: "ltr", text: messages.en.publicCompletion.story.region.title } as const
    : { lang: "ar", dir: "rtl", text: messages.ar.publicCompletion.story.region.title } as const;
  return (
    <section
      id="region"
      data-landing-theme="paper"
      aria-labelledby="region-title"
      className={cn(styles.coverSheet, styles.paperSheet, styles.layer6, styles.regionSection)}
      data-landing-snap="start"
    >
      <div className={styles.regionInner}>
        <StoryMarker label={t("publicCompletion.story.region.eyebrow")} />
        <div className={styles.regionBilingual}>
          <Reveal>
            <h2 id="region-title" className={styles.regionEnglish}>{t("publicCompletion.story.region.title")}</h2>
          </Reveal>
          <Reveal delay={120}>
            {/* The same title in the other language, so each page shows both. */}
            <p lang={echo.lang} dir={echo.dir} className={styles.regionArabic}>{echo.text}</p>
          </Reveal>
        </div>
        <div className={styles.regionBody}>
          <Reveal>
            <p className={styles.regionLead}>{t("publicCompletion.story.region.lead")}</p>
          </Reveal>
          <Reveal delay={120}>
            <dl className={styles.regionSpecs}>
              {REGIONAL_SPECS.map((key) => (
                <div key={key} className={styles.regionSpec}>
                  <dt>{t(`publicCompletion.story.regional.${key}` as TKey)}</dt>
                  <dd>{t(`publicCompletion.story.regional.${key}Detail` as TKey)}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
