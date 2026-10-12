"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { OPENING_DRAWING, sheetCarries } from "@/components/motion/sheet-store";
import { cn } from "@/lib/utils/cn";
import { samplePath, type Point } from "./sign-in-art-geometry";
import {
  DOORS,
  DRAWINGS,
  HOME_PLATE,
  isFill,
  line,
  machine,
  offsetOf,
  PIN_HOME,
  PLATE_HEIGHT,
  PLATE_PITCH,
  plateBox,
  PLATES,
  STACK_TOP,
  viewBoxFor,
  type ArtDoor,
  type Offset,
  type Shape,
  type Tone,
} from "./sign-in-drawings";
import styles from "./login.module.css";

/*
 * Line drawings for the sign-in doors, in the brand's white, black and red:
 * front elevations with faint construction lines, as on a layout sheet. Each
 * drawing is data (a list of strokes), so the same lines can draw themselves
 * in, or carry over from the page before and move into this page's drawing.
 * Inline SVG: a door costs no image request.
 */

export type { ArtDoor };

/* ---------------------------------------------------------------- rendering */

/** The draw-in runs at this fraction of each shape's `at`, in seconds. */
const DRAW_PACE = 0.45;
/** The latest `at` in any drawing, and how long one line takes to draw (`.draw`). */
const LAST_AT = 1.6;
const LINE_DRAW_S = 0.6;

function ShapePath({ shape, motion, pace = DRAW_PACE }: { shape: Shape; motion?: string; pace?: number }) {
  const style = motion ? ({ "--d": `${(shape.at * pace).toFixed(3)}s` } as CSSProperties) : undefined;
  if (isFill(shape.t)) return <path d={shape.d} className={cn(shape.t === "dot" ? styles.dot : styles.redFill, motion)} style={style} />;
  return (
    <path
      d={shape.d}
      pathLength={shape.t === "faint" ? undefined : 1}
      strokeDasharray={shape.dash}
      className={cn(styles[shape.t as Tone], motion)}
      style={style}
    />
  );
}

/** How a shape arrives while the drawing draws itself in: lines draw, fills and construction fade. */
const drawIn = (shape: Shape, animate: boolean) => (animate ? (isFill(shape.t) || shape.t === "faint" ? styles.fade : styles.draw) : undefined);

/**
 * The drawing at rest, drawing itself in when `animate` is set. `pending`
 * marks the server's copy: a page reached from another sign-in page hides it
 * before the first paint, because the lines will arrive from that page.
 */
function StaticArt({ door, shapes, animate, pending = false, pace }: { door: ArtDoor; shapes: Shape[]; animate: boolean; pending?: boolean; pace?: number }) {
  return (
    <svg viewBox={viewBoxFor(door)} preserveAspectRatio="xMidYMid meet" className={styles.art} aria-hidden focusable="false" data-art-pending={pending ? "" : undefined}>
      {shapes.map((shape, i) => (
        <ShapePath key={i} shape={shape} pace={pace} motion={drawIn(shape, animate)} />
      ))}
    </svg>
  );
}

/* ----------------------------------------------------------------- machine */

/** How far the rope sinks, and the top plate rises, with the pin in the lightest plate. */
const SLACK = 32;
const scaleY = (from: number, to: number, by: number) => `scaleY(${((to - from + by) / (to - from)).toFixed(4)})`;

/**
 * The chooser's machine at rest, with a pin that works. Nothing on the page
 * says so: clicking a plate moves the pin into it, and with the pin in the
 * lightest plate the rope outweighs what is selected, so it sinks and lifts
 * that plate by the same length of cable. Pointer only: the drawing stays
 * hidden from assistive technology and out of the tab order, because it does
 * nothing a visitor needs before the form.
 */
function MachineArt({ animate, pending = false }: { animate: boolean; pending?: boolean }) {
  const m = useMemo(() => machine(), []);
  const [pin, setPin] = useState(PIN_HOME);
  const [used, setUsed] = useState(false);
  const light = pin === 0;
  const paint = (shape: Shape, key: number | string) => <ShapePath key={key} shape={shape} motion={drawIn(shape, animate)} />;
  const raised = light ? { transform: `translateY(${-SLACK}px)` } : undefined;
  const gapFloor = STACK_TOP + PLATE_PITCH;
  const pinTo = PLATES[pin] ?? HOME_PLATE;

  return (
    <svg
      viewBox={viewBoxFor("account")}
      preserveAspectRatio="xMidYMid meet"
      className={styles.art}
      aria-hidden
      focusable="false"
      data-art-pending={pending ? "" : undefined}
      data-rope={light ? "sunk" : used ? "raised" : undefined}
    >
      {m.frame.map(paint)}
      {/* the rods run behind the stack, so they end at the top plate wherever it is */}
      <g className={styles.lift} style={{ transformOrigin: "0 120px", transform: light ? scaleY(120, STACK_TOP, -SLACK) : undefined }}>{m.rods.map(paint)}</g>
      {m.pulleys.map(paint)}
      <g className={styles.lift} style={{ transformOrigin: "0 172px", transform: light ? scaleY(172, STACK_TOP, -SLACK) : undefined }}>{paint(m.stackCable, "stack-cable")}</g>
      {paint(m.run, "run")}
      <g className={styles.lift} style={{ transformOrigin: "0 148px", transform: light ? scaleY(148, 249, SLACK) : undefined }}>{paint(m.ropeCable, "rope-cable")}</g>
      <g className={styles.lift} style={light ? { transform: `translateY(${SLACK}px)` } : undefined}>
        <g className={styles.sway} style={{ transformOrigin: "663px 249px" }}>{m.rope.map(paint)}</g>
      </g>
      {paint(m.centre, "centre")}
      {/* under a raised plate: the two rods and the selector stem */}
      <g
        className={cn(styles.lift, styles.gap)}
        style={{ transformOrigin: `0 ${gapFloor}px`, transform: light ? undefined : scaleY(gapFloor, STACK_TOP + PLATE_HEIGHT - SLACK, SLACK) }}
      >
        {[376, 400, 424].map((x) => <path key={x} d={line(x, gapFloor, x, STACK_TOP + PLATE_HEIGHT - SLACK)} className={styles.thin} />)}
      </g>
      {PLATES.map((plate, i) => (
        <g
          key={i}
          data-plate={i}
          className={cn(styles.plate, i === 0 && styles.lift)}
          style={i === 0 ? raised : undefined}
          onClick={() => {
            setPin(i);
            if (i === 0) setUsed(true);
          }}
        >
          {/* the whole row, out to where the pin sits */}
          <rect x={plate.x - 8} y={plate.y - 3} width={plate.w + 52} height={PLATE_PITCH} className={styles.hit} />
          <g className={styles.glow} data-on={pin === i ? "" : undefined}>
            {i === PIN_HOME ? paint(m.glow, "glow") : <path d={plateBox(plate)} className={styles.redFill} />}
          </g>
          {m.plates[i]?.map(paint)}
        </g>
      ))}
      <g className={styles.lift} style={raised}>
        <g data-pin={pin} className={styles.pin} style={{ transform: `translate(${pinTo.x - HOME_PLATE.x + pinTo.w - HOME_PLATE.w}px, ${pinTo.y - HOME_PLATE.y}px)` }}>
          {m.pin.map(paint)}
        </g>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------- morph */

const SAMPLES = 48;
const MORPH_MS = 480;
/** Stroke colour (r, g, b, alpha) and width per tone, for blending one tone into another. */
const TONE: Record<Tone, readonly [number, number, number, number, number]> = {
  ink: [242, 240, 230, 1, 1.6],
  thin: [242, 240, 230, 0.5, 1.1],
  faint: [242, 240, 230, 0.14, 1],
  red: [229, 38, 46, 1, 1.9],
  redThin: [229, 38, 46, 0.75, 1.2],
};

type Strand = { pts: Point[]; closed: boolean; cx: number; cy: number; w: number; h: number; tone: Tone };
/** A stroke of the old drawing (a) and the stroke of the new one it becomes (b). */
type Pair = { a: Strand; b: Strand; fadeOut: boolean };

/** Samples every stroke of a drawing into evenly spaced points. */
function sample(shapes: Shape[]): Strand[] {
  return shapes
    .filter((s) => !isFill(s.t))
    .map((s) => {
      const closed = /z\s*$/i.test(s.d);
      const pts = samplePath(s.d, SAMPLES, closed);
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const cx = xs.reduce((sum, x) => sum + x, 0) / SAMPLES;
      const cy = ys.reduce((sum, y) => sum + y, 0) / SAMPLES;
      return { pts, closed, cx, cy, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), tone: s.t as Tone };
    });
}

const sampled = new Map<ArtDoor, Strand[]>();

/**
 * A door's strokes as points, worked out once per page from the path data
 * (`sign-in-art-geometry`), well inside a frame, so a move never waits on the
 * browser measuring its lines.
 */
function strandsOf(door: ArtDoor): Strand[] {
  const known = sampled.get(door);
  if (known) return known;
  const strands = sample(DRAWINGS[door]());
  sampled.set(door, strands);
  return strands;
}

/** Whether this browser lays SVG out at all (test DOMs do not), so lines can be seen to move. */
const measurable = () => typeof document.createElementNS("http://www.w3.org/2000/svg", "path").getTotalLength === "function";

/** A drawing's strokes moved by an offset, to be drawn in another drawing's frame. */
const moveStrands = (strands: Strand[], { dx, dy }: Offset): Strand[] =>
  dx === 0 && dy === 0 ? strands : strands.map((s) => ({ ...s, pts: s.pts.map(([x, y]): Point => [x + dx, y + dy]), cx: s.cx + dx, cy: s.cy + dy }));

const collapse = (s: Strand): Strand => ({ ...s, pts: s.pts.map((): Point => [s.cx, s.cy]) });
const dist = (p: Point | undefined, q: Point | undefined) => (p && q ? (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 : Infinity);

/** Turns a stroke so its points start where the target's do, and run the same way round. */
function align(a: Strand, b: Strand): Strand {
  if (!a.closed) {
    return dist(a.pts[a.pts.length - 1], b.pts[0]) < dist(a.pts[0], b.pts[0]) ? { ...a, pts: [...a.pts].reverse() } : a;
  }
  let best = a.pts;
  let bestCost = Infinity;
  for (const pts of [a.pts, [...a.pts].reverse()]) {
    for (let k = 0; k < SAMPLES; k += 1) {
      let cost = 0;
      for (let i = 0; i < SAMPLES; i += 4) cost += dist(pts[(i + k) % SAMPLES], b.pts[i]);
      if (cost < bestCost) {
        bestCost = cost;
        best = pts.map((_, i) => pts[(i + k) % SAMPLES] ?? pts[0]!);
      }
    }
  }
  return { ...a, pts: best };
}

/**
 * How far one stroke has to travel to become another: the move itself, plus
 * the change of size, plus a large step for a line that would have to become
 * a closed shape (that is what tangles mid-move).
 */
const cost = (a: Strand, b: Strand) =>
  (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2 + 0.6 * ((a.w - b.w) ** 2 + (a.h - b.h) ** 2) + (a.closed === b.closed ? 0 : 160 ** 2);

/** Pairs each stroke of the new drawing with the closest unused stroke of the old one. */
function pair(from: Strand[], to: Strand[]): Pair[] {
  const used = new Set<number>();
  const pairs: Pair[] = [];
  for (const b of [...to].sort((x, y) => x.cy - y.cy)) {
    let best = -1;
    let bestD = Infinity;
    from.forEach((a, j) => {
      const d = used.has(j) ? Infinity : cost(a, b);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    });
    const a = from[best];
    if (a) used.add(best);
    // a stroke with no partner grows out of its own middle
    const start = a ? align(a, b) : collapse(b);
    pairs.push({ a: start, b, fadeOut: false });
  }
  from.forEach((a, j) => {
    if (used.has(j)) return;
    pairs.push({ a, b: collapse(a), fadeOut: true });
  });
  return pairs;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const ease = (k: number) => 1 - Math.pow(1 - k, 3);

/**
 * The page before's lines, moving straight into this page's drawing in one
 * quick motion that starts at full speed. Every line moves at once and lands
 * together; over the last frames the exact drawing fades in under them, so
 * nothing is left to settle. Without a `start` (a page prepared ahead of the
 * click) it holds the first frame.
 */
function MorphArt({ from, to, start, onDone }: { from: ArtDoor; to: ArtDoor; start: number | null; onDone: () => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const before = useMemo(() => DRAWINGS[from]().filter((s) => isFill(s.t)), [from]);
  const after = useMemo(() => DRAWINGS[to](), [to]);
  // Each drawing is centred on its own lines; the page before's starts where it was on screen.
  const shift = useMemo(() => {
    const a = offsetOf(from);
    const b = offsetOf(to);
    return { dx: a.dx - b.dx, dy: a.dy - b.dy };
  }, [from, to]);

  // Paired before the first paint, so the page opens on the page before's drawing.
  useLayoutEffect(() => {
    setPairs(pair(moveStrands(strandsOf(from), shift), strandsOf(to)));
  }, [from, to, shift]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg || !pairs) return;
    const strands = Array.from(svg.querySelectorAll<SVGPathElement>("path[data-strand]"));
    const lines = svg.querySelector<SVGGElement>("g[data-lines]");
    const leaving = svg.querySelector<SVGGElement>("g[data-before]");
    const fills = svg.querySelector<SVGGElement>("g[data-fills]");
    const exact = svg.querySelector<SVGGElement>("g[data-exact]");
    // A stroke that keeps its tone is coloured once; only its shape changes per frame.
    const steady = pairs.map(({ a, b, fadeOut }) => a.tone === b.tone && !fadeOut);
    const point = new Array<string>(SAMPLES);
    const draw = (t: number) => {
      const u = ease(t);
      const v = 1 - u;
      pairs.forEach(({ a, b, fadeOut }, i) => {
        const el = strands[i];
        if (!el) return;
        for (let p = 0; p < SAMPLES; p += 1) {
          const pa = a.pts[p]!;
          const pb = b.pts[p]!;
          point[p] = `${(v * pa[0] + u * pb[0]).toFixed(1)} ${(v * pa[1] + u * pb[1]).toFixed(1)}`;
        }
        el.setAttribute("d", `M${point.join("L")}${a.closed || b.closed ? "Z" : ""}`);
        if (steady[i] && t > 0) return;
        const ta = TONE[a.tone];
        const tb = TONE[b.tone];
        const mix = (n: 0 | 1 | 2 | 3 | 4) => ta[n] + (tb[n] - ta[n]) * u;
        el.setAttribute("stroke", `rgb(${mix(0).toFixed(0)} ${mix(1).toFixed(0)} ${mix(2).toFixed(0)} / ${(fadeOut ? mix(3) * v : mix(3)).toFixed(3)})`);
        el.setAttribute("stroke-width", mix(4).toFixed(2));
      });
      const land = clamp((t - 0.8) / 0.2);
      if (lines) lines.style.opacity = String(1 - land);
      if (exact) exact.style.opacity = String(land);
      if (leaving) leaving.style.opacity = String(1 - clamp(t / 0.3));
      if (fills) fills.style.opacity = String(clamp((t - 0.45) / 0.45));
    };
    draw(0);
    if (start === null) return;
    let frame = 0;
    const tick = (now: number) => {
      const t = clamp((now - start) / MORPH_MS);
      draw(t);
      if (t < 1) frame = requestAnimationFrame(tick);
      else onDone();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pairs, start, onDone]);

  return (
    <svg ref={svgRef} viewBox={viewBoxFor(to)} preserveAspectRatio="xMidYMid meet" className={styles.art} aria-hidden focusable="false">
      <g data-before transform={`translate(${shift.dx} ${shift.dy})`}>
        {before.map((s, i) => <ShapePath key={i} shape={s} />)}
      </g>
      <g data-lines>
        {pairs?.map((_, i) => <path key={i} data-strand fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
      </g>
      <g data-fills style={{ opacity: 0 }}>
        {after.filter((s) => isFill(s.t)).map((s, i) => <ShapePath key={i} shape={s} />)}
      </g>
      <g data-exact style={{ opacity: 0 }}>
        {after.filter((s) => !isFill(s.t)).map((s, i) => <ShapePath key={i} shape={s} />)}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------- stage */

/** Which drawing a sign-in link left from, carried as `?art=` across hosts. */
const ART_PARAM = "art";

/**
 * One morph per page view, even when the frame mounts twice (development's
 * strict mode): the first mount records where the lines came from and when
 * they started, and any later mount carries on. `start` stays empty while the
 * browser prepares the page ahead of the click; the morph begins when it is shown.
 */
let session: { door: ArtDoor; from: ArtDoor | null; start: number | null } | null = null;

const prerendering = () => (document as Document & { prerendering?: boolean }).prerendering === true;

/** Whether the art panel is on screen: it shows from `lg` up (`.panel` in login.module.css). */
const panelShown = () => typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 1024px)").matches;

function readFrom(): ArtDoor | null {
  const url = new URL(window.location.href);
  const from = url.searchParams.get(ART_PARAM);
  if (!from) return null;
  // Only tidies the address bar. A page prepared ahead of the click keeps the
  // address it was prepared under until it is shown, so the click still finds it.
  const tidy = () => {
    url.searchParams.delete(ART_PARAM);
    try {
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  };
  if (prerendering()) document.addEventListener("prerenderingchange", tidy, { once: true });
  else tidy();
  return DOORS.includes(from as ArtDoor) ? (from as ArtDoor) : null;
}

/**
 * The drawing for a door. Arriving from another sign-in page, that page's
 * lines move into this drawing; otherwise it draws itself in, starting with
 * the server's HTML. Reduced motion shows it drawn.
 */
export function SignInArt({ door }: { door: ArtDoor }) {
  const [stage, setStage] = useState<{ from: ArtDoor | null; start: number | null; animate: boolean } | null>(null);
  const [settled, setSettled] = useState(false);
  const settle = useCallback(() => setSettled(true), []);
  const to = useMemo(() => DRAWINGS[door](), [door]);

  // Decided before the first client paint, so a page reached in-app never flashes its own drawing first.
  useLayoutEffect(() => {
    if (!session || session.door !== door) {
      const from = readFrom();
      session = { door, from: from === door ? null : from, start: prerendering() ? null : performance.now() };
    }
    const current = session;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // A page sheet carrying this drawing in lays it over this one when it lands, so this one is simply drawn.
    const carried = sheetCarries(door);
    // Phones never show the panel: nothing moves or draws there, so nothing is worked out for it.
    const still = reduce || carried || !panelShown();
    setStage({ from: still || !measurable() ? null : current.from, start: current.start, animate: !still });
    if (current.start !== null) return;
    const shown = () => {
      current.start = performance.now();
      setStage((value) => (value ? { ...value, start: current.start } : value));
    };
    document.addEventListener("prerenderingchange", shown, { once: true });
    return () => document.removeEventListener("prerenderingchange", shown);
  }, [door]);

  if (stage?.from && !settled) return <MorphArt from={stage.from} to={door} start={stage.start} onDone={settle} />;
  const animate = stage ? stage.animate && !stage.from : true;
  // One element for the server's copy and the page's own, so the lines keep drawing across the hand-over.
  return door === "account" ? <MachineArt animate={animate} pending={!stage} /> : <StaticArt door={door} shapes={to} animate={animate} pending={!stage} />;
}

/* -------------------------------------------------------------------- loop */

/** The drawings in the order a wait walks through them: the machine, the desk, the bench, the network. */
const LOOP: readonly ArtDoor[] = [OPENING_DRAWING, "staff", "member", "admin"];
/** How long each drawing rests before its lines move on to the next. */
const LOOP_REST_MS = 1100;

/**
 * A drawing for as long as something takes: the first one (`startOn`, the
 * page being opened, or the machine) draws itself in at `pace`, then its
 * lines move into the next door's drawing, and on round the four. Given
 * `endOn`, it stops going round and moves to that drawing (if it is not there
 * already), then calls `onRest` once it is fully drawn there. Where lines
 * cannot be measured, or motion is reduced, the first drawing stays.
 */
export function DrawingLoop({ pace = DRAW_PACE, startOn = null, endOn = null, onRest }: { pace?: number; startOn?: ArtDoor | null; endOn?: ArtDoor | null; onRest?: () => void }) {
  const [step, setStep] = useState<{ first: boolean; door: ArtDoor; from: ArtDoor | null; start: number }>(() => ({ first: true, door: startOn ?? LOOP[0]!, from: null, start: 0 }));
  const shapes = useMemo(() => DRAWINGS[step.door](), [step.door]);
  const [moves, setMoves] = useState(false);
  const born = useRef(0);
  const settle = useCallback(() => setStep((current) => ({ ...current, from: null })), []);
  const drawnMs = (LAST_AT * pace + LINE_DRAW_S) * 1000;

  useEffect(() => {
    born.current = performance.now();
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMoves(!reduce && measurable());
  }, []);

  useEffect(() => {
    if (step.from) return;
    const moveTo = (door: ArtDoor) => setStep((current) => ({ first: false, door, from: current.door, start: performance.now() }));
    if (endOn && moves && step.door !== endOn) {
      moveTo(endOn);
      return;
    }
    if (endOn) {
      const timer = window.setTimeout(() => onRest?.(), step.first ? Math.max(0, drawnMs - (performance.now() - born.current)) : 0);
      return () => window.clearTimeout(timer);
    }
    if (!moves) return;
    const timer = window.setTimeout(() => moveTo(LOOP[(LOOP.indexOf(step.door) + 1) % LOOP.length]!), (step.first ? drawnMs : 0) + LOOP_REST_MS);
    return () => window.clearTimeout(timer);
  }, [moves, step, drawnMs, endOn, onRest]);

  if (step.from) return <MorphArt from={step.from} to={step.door} start={step.start} onDone={settle} />;
  return <StaticArt door={step.door} shapes={shapes} animate={step.first} pace={pace} />;
}
