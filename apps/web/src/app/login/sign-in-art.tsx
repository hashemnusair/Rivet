"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";
import styles from "./login.module.css";

/*
 * Line drawings for the sign-in doors, in the brand's white, black and red:
 * front elevations with faint construction lines, as on a layout sheet. Each
 * drawing is data (a list of strokes), so the same lines can draw themselves
 * in, or carry over from the page before and move into this page's drawing.
 * Inline SVG: a door costs no image request.
 */

export type ArtDoor = "account" | "staff" | "member" | "admin";
type Tone = "ink" | "thin" | "faint" | "red" | "redThin";
type Shape = { d: string; t: Tone | "soft" | "dot"; at: number; dash?: string };

/** A rectangle with rounded corners, as a path. */
const box = (x: number, y: number, w: number, h: number, r = 0) =>
  r
    ? `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
    : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
const line = (x1: number, y1: number, x2: number, y2: number) => `M${x1} ${y1}L${x2} ${y2}`;
const ring = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
const range = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
const sh = (d: string, t: Shape["t"] = "ink", at = 0, dash?: string): Shape => ({ d, t, at, dash });

function ground(y = 640, from = 70, to = 730): Shape[] {
  return [
    sh(line(400, 90, 400, y + 30), "faint", 0, "4 7"),
    ...range(from + 20, to - 10, 22).map((x) => sh(line(x, y, x - 14, y + 14), "faint")),
    sh(line(from, y, to, y), "ink", 0.05),
  ];
}

/* ------------------------------------------------------------------ chooser */

/**
 * A weight-stack machine with one red pin: the RIVET mark as the machine it
 * came from. Three narrow plates over five wide ones, as in the mark; the
 * cable runs over the far pulley to a tricep pushdown rope.
 */
function stack(): Shape[] {
  const plates = range(0, 7, 1).flatMap((i) => {
    const y = 352 + i * 30;
    return i < 3
      ? [sh(box(335, y, 130, 24, 5), "ink", 0.8 + i * 0.05)]
      : [sh(box(300, y, 200, 24, 5), "ink", 0.8 + i * 0.05), sh(ring(484, y + 12, 3), "thin", 1.0 + i * 0.04)];
  });
  const pinY = 364 + 4 * 30;
  return [
    ...ground(640, 120, 720),
    sh(line(184, 76, 616, 76), "faint"),
    ...[184, 616].map((x) => sh(line(x, 68, x, 84), "faint")),
    // frame
    sh(box(200, 96, 470, 24, 4), "ink", 0.1),
    sh(box(220, 120, 20, 500, 2), "ink", 0.2),
    sh(box(560, 120, 20, 500, 2), "ink", 0.25),
    sh(box(184, 620, 432, 20, 4), "ink", 0.3),
    sh(line(350, 120, 350, 620), "thin", 0.4),
    sh(line(450, 120, 450, 620), "thin", 0.4),
    // pulleys and cable
    sh(line(400, 120, 400, 132), "ink", 0.45),
    sh(ring(400, 152, 20), "ink", 0.5),
    sh(ring(400, 152, 6), "thin", 0.6),
    sh(line(650, 120, 650, 134), "ink", 0.45),
    sh(ring(650, 148, 13), "ink", 0.55),
    sh(ring(650, 148, 4), "thin", 0.65),
    sh("M400 172V322", "thin", 0.7),
    sh("M420 152H637", "thin", 0.7),
    sh("M663 148V418", "thin", 0.8),
    // the tricep rope: a clip, two strands, two stoppers
    sh(ring(663, 425, 7), "ink", 0.95),
    sh("M659 431C655 456 645 474 642 500", "ink", 1.0),
    sh("M667 431C671 456 681 474 684 500", "ink", 1.0),
    sh("M663 432C659 458 650 476 648 500", "thin", 1.05),
    sh("M663 432C667 458 676 476 678 500", "thin", 1.05),
    sh(box(634, 500, 18, 24, 6), "ink", 1.15),
    sh(box(674, 500, 18, 24, 6), "ink", 1.15),
    // the stack
    sh(box(300, 322, 200, 22, 5), "ink", 0.75),
    sh(line(400, 344, 400, 604), "faint", 0, "3 6"),
    sh(box(300, 352 + 4 * 30, 200, 24, 5), "soft", 1.5),
    ...plates,
    // the pin
    sh(line(500, pinY, 530, pinY), "red", 1.3),
    sh(ring(540, pinY, 10), "red", 1.4),
    sh(ring(540, pinY, 3.5), "dot", 1.7),
  ];
}

/* --------------------------------------------------------------------- team */

const BARS = [30, 46, 38, 58, 50, 74];

/** The front desk from the lobby: the dumbbell on its face, the screens on the wall behind. */
function desk(): Shape[] {
  return [
    ...ground(),
    sh(line(80, 60, 720, 60), "faint"),
    // pendant lamps and their light
    ...[270, 530].flatMap((x, i) => [
      sh(line(x, 60, x, 104), "thin", 0.1 + i * 0.05),
      sh(`M${x - 22} 128L${x - 12} 104H${x + 12}L${x + 22} 128Z`, "ink", 0.2 + i * 0.05),
      sh(line(x - 22, 128, x - 64, 150), "faint"),
      sh(line(x + 22, 128, x + 64, 150), "faint"),
      sh(ring(x, 133, 3.5), "dot", 1.6),
    ]),
    // screens on the wall
    ...[96, 304, 512].flatMap((x, i) => [sh(box(x, 170, 192, 124, 6), "ink", 0.3 + i * 0.08), sh(box(x + 8, 178, 176, 108, 3), "thin", 0.45 + i * 0.08)]),
    // revenue
    sh(line(112, 192, 172, 192), "thin", 0.7),
    ...[214, 238, 262].map((y) => sh(line(112, y, 272, y), "faint")),
    sh("M112 268L136 252L160 258L184 236L208 244L232 220L256 226L272 204", "red", 1.1),
    // who checked in
    ...range(0, 4, 1).flatMap((i) => {
      const y = 190 + i * 19;
      return [
        sh(ring(322, y + 6, 4), "thin", 0.75 + i * 0.05),
        sh(line(332, y + 3, 404, y + 3), "thin", 0.8 + i * 0.05),
        sh(line(332, y + 9, 376, y + 9), "faint"),
        i === 0 ? sh(ring(476, y + 6, 3.5), "dot", 1.5) : sh(ring(476, y + 6, 3), "thin", 0.9),
      ];
    }),
    // the week
    sh(line(524, 280, 692, 280), "thin", 0.75),
    ...BARS.map((h, i) => sh(box(532 + i * 26, 280 - h, 14, h, 1.5), i === BARS.length - 1 ? "red" : "thin", 0.85 + i * 0.06)),
    // the desk, its screen and the scanner
    sh(box(452, 312, 150, 86, 8), "ink", 0.55),
    sh(ring(527, 355, 5), "thin", 0.7),
    sh(box(214, 372, 40, 26, 4), "ink", 0.6),
    sh(line(220, 381, 248, 381), "red", 1.3),
    sh(box(104, 398, 592, 18, 4), "ink", 0.5),
    sh(box(124, 416, 552, 224, 2), "ink", 0.6),
    sh(line(124, 612, 676, 612), "thin", 0.8),
    sh(line(176, 416, 176, 612), "thin", 0.85),
    sh(line(624, 416, 624, 612), "thin", 0.85),
    // the dumbbell on its face
    sh(ring(400, 514, 64), "thin", 0.9),
    sh(box(350, 486, 16, 56, 4), "soft", 1.5),
    sh(box(434, 486, 16, 56, 4), "soft", 1.5),
    sh(box(366, 509, 68, 10, 3), "red", 1.0),
    sh(box(350, 486, 16, 56, 4), "red", 1.1),
    sh(box(434, 486, 16, 56, 4), "red", 1.1),
    sh(box(338, 494, 12, 40, 3), "red", 1.2),
    sh(box(450, 494, 12, 40, 3), "red", 1.2),
    sh(box(332, 507, 6, 14, 2), "red", 1.25),
    sh(box(462, 507, 6, 14, 2), "red", 1.25),
  ];
}

/* ------------------------------------------------------------------- member */

/**
 * A bench press seen from the foot of the bench, in one-point perspective: the
 * pad runs back to the rack, one red plate on each end of the bar, and the
 * rack's safety pins in red. Faint construction lines meet at the eye point.
 */
function bench(): Shape[] {
  return [
    ...range(110, 690, 22).map((x) => sh(line(x, 640, x - 14, 654), "faint")),
    sh(line(90, 640, 710, 640), "ink", 0.05),
    sh(line(146, 560, 654, 560), "thin", 0.15),
    sh(line(90, 640, 400, 200), "faint", 0, "3 7"),
    sh(line(710, 640, 400, 200), "faint", 0, "3 7"),
    sh(line(392, 200, 408, 200), "faint"),
    sh(line(400, 192, 400, 208), "faint"),
    // dimensions
    sh(line(128, 150, 672, 150), "faint"),
    ...[128, 400, 672].map((x) => sh(line(x, x === 400 ? 145 : 142, x, x === 400 ? 155 : 158), "faint")),
    sh(line(722, 312, 722, 560), "faint"),
    ...[312, 560].map((y) => sh(line(714, y, 730, y), "faint")),
    // the rack, at the head of the bench
    sh(box(236, 230, 20, 330, 3), "ink", 0.2),
    sh(box(544, 230, 20, 330, 3), "ink", 0.25),
    sh(box(196, 546, 100, 14, 3), "ink", 0.3),
    sh(box(504, 546, 100, 14, 3), "ink", 0.3),
    ...range(360, 532, 28).flatMap((y, i) => [sh(ring(246, y, 2.4), "thin", 0.35 + i * 0.03), sh(ring(554, y, 2.4), "thin", 0.35 + i * 0.03)]),
    sh("M256 290H276V318Q276 328 266 328H256", "ink", 0.45),
    sh("M544 290H524V318Q524 328 534 328H544", "ink", 0.45),
    // the bench, running back to the rack
    sh("M330 520L345 462H455L470 520Z", "ink", 0.55),
    sh("M340 512L351 470H449L460 512Z", "thin", 0.7),
    sh("M330 520V536Q330 542 336 542H464Q470 542 470 536V520", "ink", 0.6),
    sh("M384 542L378 622H422L416 542Z", "ink", 0.65),
    sh(box(330, 622, 140, 18, 3), "ink", 0.7),
    sh(line(400, 470, 400, 566), "faint", 0, "3 6"),
    // the bar
    sh(box(234, 308, 332, 8, 4), "ink", 0.8),
    sh(box(128, 304, 98, 16, 4), "ink", 0.85),
    sh(box(574, 304, 98, 16, 4), "ink", 0.85),
    sh(box(226, 296, 8, 32, 2), "ink", 0.9),
    sh(box(566, 296, 8, 32, 2), "ink", 0.9),
    ...[...range(286, 368, 9), ...range(432, 514, 9)].map((x) => sh(line(x, 309, x, 315), "thin", 0.95)),
    // two plates
    sh(box(196, 238, 28, 148, 9), "soft", 1.4),
    sh(box(576, 238, 28, 148, 9), "soft", 1.4),
    sh(box(196, 238, 28, 148, 9), "red", 1.05),
    sh(box(576, 238, 28, 148, 9), "red", 1.1),
    sh(box(202, 250, 16, 124, 5), "redThin", 1.2),
    sh(box(582, 250, 16, 124, 5), "redThin", 1.25),
    sh(box(184, 298, 8, 28, 2), "ink", 1.3),
    sh(box(608, 298, 8, 28, 2), "ink", 1.3),
    // safety pins, the RIVET pin
    sh(line(256, 470, 274, 470), "red", 1.35),
    sh(ring(282, 470, 8), "red", 1.4),
    sh(line(544, 470, 526, 470), "red", 1.35),
    sh(ring(518, 470, 8), "red", 1.4),
  ];
}

/* -------------------------------------------------------------------- admin */

const PINS = [[300, 200], [420, 252], [524, 178]] as const;
const GYMS = [
  { x: 100, top: 450, door: [222, 520, 40, 120], window: [120, 510, 90, 80] },
  { x: 310, top: 410, door: [370, 560, 60, 80], window: [330, 470, 140, 60] },
  { x: 520, top: 460, door: [642, 530, 40, 110], window: [540, 520, 90, 80] },
] as const;

/** Every gym on one screen: three storefronts wired to the platform's map. */
function network(): Shape[] {
  return [
    ...ground(640, 60, 740),
    // the screen and its map
    sh(box(190, 104, 420, 216, 8), "ink", 0.1),
    sh(box(200, 114, 400, 196, 4), "thin", 0.2),
    ...range(139, 289, 25).map((y) => sh(line(200, y, 600, y), "faint")),
    ...range(225, 575, 25).map((x) => sh(line(x, 114, x, 310), "faint")),
    sh("M228 286C262 240 280 214 300 200S380 244 420 252S500 196 524 178S572 150 586 140", "thin", 0.6),
    sh(`M${PINS[0][0]} ${PINS[0][1]}L${PINS[1][0]} ${PINS[1][1]}L${PINS[2][0]} ${PINS[2][1]}`, "redThin", 1.0),
    ...PINS.flatMap(([x, y], i) => [sh(ring(x, y, 12), "redThin", 1.05 + i * 0.08), sh(ring(x, y, 4.5), "dot", 1.3 + i * 0.08)]),
    // the platform's node, and a line to every gym
    sh(line(400, 320, 400, 352), "ink", 0.4),
    sh(ring(400, 362, 10), "red", 0.9),
    sh(ring(400, 362, 3.5), "dot", 1.2),
    sh("M392 368C340 392 196 384 190 444", "thin", 1.1),
    sh(line(400, 372, 400, 404), "thin", 1.1),
    sh("M408 368C460 392 604 394 610 454", "thin", 1.1),
    ...([[190, 444], [400, 404], [610, 454]] as const).map(([x, y]) => sh(ring(x, y, 4), "dot", 1.5)),
    // three gyms
    ...GYMS.flatMap((gym, i) => {
      const at = 0.3 + i * 0.12;
      const cx = gym.x + 90;
      const sign = gym.top + 18;
      const [wx, wy, ww, wh] = gym.window;
      const [dx, dy, dw, dh] = gym.door;
      return [
        sh(box(gym.x - 6, gym.top - 6, 192, 10, 2), "ink", at),
        sh(box(gym.x, gym.top + 4, 180, 636 - gym.top, 0), "ink", at + 0.05),
        sh(box(gym.x + 20, sign, 140, 26, 3), "thin", at + 0.15),
        sh(line(cx - 14, sign + 13, cx + 14, sign + 13), "thin", at + 0.25),
        sh(box(cx - 21, sign + 6, 7, 14, 1.5), "thin", at + 0.25),
        sh(box(cx + 14, sign + 6, 7, 14, 1.5), "thin", at + 0.25),
        sh(box(wx, wy, ww, wh, 2), "thin", at + 0.3),
        sh(box(dx, dy, dw, dh, 2), "ink", at + 0.35),
        i === 1 ? sh(line(400, 560, 400, 640), "thin", at + 0.45) : sh(line(wx + ww / 2, wy, wx + ww / 2, wy + wh), "faint"),
      ];
    }),
  ];
}

const DRAWINGS: Record<ArtDoor, () => Shape[]> = { account: stack, staff: desk, member: bench, admin: network };

/* ---------------------------------------------------------------- rendering */

const isFill = (t: Shape["t"]) => t === "soft" || t === "dot";

/** The drawing at rest, drawing itself in when `animate` is set. */
function StaticArt({ shapes, animate }: { shapes: Shape[]; animate: boolean }) {
  return (
    <svg viewBox="0 0 800 900" preserveAspectRatio="xMidYMid meet" className={styles.art} aria-hidden focusable="false">
      {shapes.map((shape, i) => {
        const motion = animate ? (isFill(shape.t) || shape.t === "faint" ? styles.fade : styles.draw) : undefined;
        const style = { "--d": `${shape.at}s` } as CSSProperties;
        if (isFill(shape.t)) return <path key={i} d={shape.d} className={cn(shape.t === "dot" ? styles.dot : styles.redFill, motion)} style={style} />;
        return (
          <path
            key={i}
            d={shape.d}
            pathLength={shape.t === "faint" ? undefined : 1}
            strokeDasharray={shape.dash}
            className={cn(styles[shape.t as Tone], motion)}
            style={style}
          />
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------- morph */

const SAMPLES = 36;
const MORPH_MS = 2000;
const MORPH_HOLD_MS = 350;
/** Stroke colour (r, g, b, alpha) and width per tone, for blending one tone into another. */
const TONE: Record<Tone, readonly [number, number, number, number, number]> = {
  ink: [242, 240, 230, 1, 1.6],
  thin: [242, 240, 230, 0.5, 1.1],
  faint: [242, 240, 230, 0.14, 1],
  red: [229, 38, 46, 1, 1.9],
  redThin: [229, 38, 46, 0.75, 1.2],
};

type Point = readonly [number, number];
type Strand = { pts: Point[]; closed: boolean; cx: number; cy: number; tone: Tone };
type Pair = { a: Strand; flatA: Point[]; flatB: Point[]; b: Strand; fadeOut: boolean };

/** Samples every stroke of a drawing into evenly spaced points. */
function sample(shapes: Shape[], probe: SVGPathElement): Strand[] {
  return shapes
    .filter((s) => !isFill(s.t))
    .map((s) => {
      probe.setAttribute("d", s.d);
      const length = probe.getTotalLength();
      const closed = /z\s*$/i.test(s.d);
      const pts: Point[] = [];
      for (let i = 0; i < SAMPLES; i += 1) {
        const p = probe.getPointAtLength(length * (closed ? i / SAMPLES : i / (SAMPLES - 1)));
        pts.push([p.x, p.y]);
      }
      const cx = pts.reduce((sum, p) => sum + p[0], 0) / SAMPLES;
      const cy = pts.reduce((sum, p) => sum + p[1], 0) / SAMPLES;
      return { pts, closed, cx, cy, tone: s.t as Tone };
    });
}

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
 * A stroke pressed flat into a straight construction line where it stands:
 * across a wide shape, upright through a tall one. Each point drops straight
 * onto the line, so the shape can rise from it again.
 */
function flatten(s: Strand): Point[] {
  const xs = s.pts.map((p) => p[0]);
  const ys = s.pts.map((p) => p[1]);
  const wide = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  return s.pts.map((p): Point => (wide ? [p[0], s.cy] : [s.cx, p[1]]));
}

/** Pairs each stroke of the new drawing with the nearest unused stroke of the old one. */
function pair(from: Strand[], to: Strand[]): Pair[] {
  const used = new Set<number>();
  const pairs: Pair[] = [];
  for (const b of [...to].sort((x, y) => x.cy - y.cy)) {
    let best = -1;
    let bestD = Infinity;
    from.forEach((a, j) => {
      const d = used.has(j) ? Infinity : (a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    });
    const a = from[best];
    if (a) used.add(best);
    // a stroke with no partner grows out of its own middle
    const start = a ? align(a, b) : collapse(b);
    pairs.push({ a: start, flatA: flatten(start), flatB: flatten(b), b, fadeOut: false });
  }
  from.forEach((a, j) => {
    if (used.has(j)) return;
    pairs.push({ a, flatA: flatten(a), flatB: collapse(a).pts, b: collapse(a), fadeOut: true });
  });
  return pairs;
}

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

/** The page before's lines, moving into this page's drawing. */
function MorphArt({ from, to, start, onDone }: { from: Shape[]; to: Shape[]; start: number; onDone: () => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const probe = document.createElementNS("http://www.w3.org/2000/svg", "path");
    svg.appendChild(probe);
    setPairs(pair(sample(from, probe), sample(to, probe)));
    probe.remove();
  }, [from, to]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || pairs.length === 0) return;
    const strands = Array.from(svg.querySelectorAll<SVGPathElement>("path[data-strand]"));
    const fillsOut = Array.from(svg.querySelectorAll<SVGPathElement>("path[data-fill-out]"));
    const fillsIn = Array.from(svg.querySelectorAll<SVGPathElement>("path[data-fill-in]"));
    let frame = 0;
    const tick = (now: number) => {
      // the page before's drawing holds still for a beat, so the eye finds it first
      const t = Math.min(1, Math.max(0, now - start - MORPH_HOLD_MS) / MORPH_MS);
      pairs.forEach(({ a, flatA, flatB, b, fadeOut }, i) => {
        const el = strands[i];
        if (!el) return;
        // Strands near the top go first, so the change reads as a sweep. Each
        // presses flat where it stands, slides as a straight line to its new
        // place, then opens into its new shape.
        const r = Math.min(1, Math.max(0, (t - (b.cy / 900) * 0.25) / 0.75));
        const k = ease(r);
        const phase = r < 1 / 3 ? 0 : r < 2 / 3 ? 1 : 2;
        const u = ease(Math.min(1, (r - phase / 3) * 3));
        const src = [a.pts, flatA, flatB][phase] ?? a.pts;
        const dst = [flatA, flatB, b.pts][phase] ?? b.pts;
        let d = "";
        for (let p = 0; p < SAMPLES; p += 1) {
          const pa = src[p];
          const pb = dst[p];
          if (pa && pb) d += `${d ? "L" : "M"}${(pa[0] + (pb[0] - pa[0]) * u).toFixed(1)} ${(pa[1] + (pb[1] - pa[1]) * u).toFixed(1)}`;
        }
        if (a.closed || b.closed) d += "Z";
        const ta = TONE[a.tone];
        const tb = TONE[b.tone];
        const mix = (n: 0 | 1 | 2 | 3 | 4) => ta[n] + (tb[n] - ta[n]) * k;
        el.setAttribute("d", d);
        el.setAttribute("stroke", `rgb(${mix(0).toFixed(0)} ${mix(1).toFixed(0)} ${mix(2).toFixed(0)} / ${(fadeOut ? mix(3) * (1 - k) : mix(3)).toFixed(3)})`);
        el.setAttribute("stroke-width", mix(4).toFixed(2));
      });
      for (const el of fillsOut) el.style.opacity = String(Math.max(0, 1 - t * 3));
      for (const el of fillsIn) el.style.opacity = String(Math.max(0, (t - 0.75) / 0.25));
      if (t < 1) frame = requestAnimationFrame(tick);
      else onDone();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pairs, start, onDone]);

  return (
    <svg ref={svgRef} viewBox="0 0 800 900" preserveAspectRatio="xMidYMid meet" className={styles.art} aria-hidden focusable="false">
      {from.filter((s) => isFill(s.t)).map((s, i) => <path key={`o${i}`} data-fill-out d={s.d} className={s.t === "dot" ? styles.dot : styles.redFill} />)}
      {pairs.map((_, i) => <path key={i} data-strand fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
      {to.filter((s) => isFill(s.t)).map((s, i) => <path key={`i${i}`} data-fill-in d={s.d} className={s.t === "dot" ? styles.dot : styles.redFill} style={{ opacity: 0 }} />)}
    </svg>
  );
}

/* ------------------------------------------------------------------- stage */

/** Which drawing a sign-in link left from, carried as `?art=` across hosts. */
const ART_PARAM = "art";
const DOORS: readonly ArtDoor[] = ["account", "staff", "member", "admin"];

/**
 * One morph per page view. The frame around the form mounts twice (the
 * server's fallback, then the client's form), so the first mount records where
 * the lines came from and when they started, and the second carries on.
 */
let session: { door: ArtDoor; from: ArtDoor | null; start: number } | null = null;

function readFrom(): ArtDoor | null {
  const url = new URL(window.location.href);
  const from = url.searchParams.get(ART_PARAM);
  if (!from) return null;
  url.searchParams.delete(ART_PARAM);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return DOORS.includes(from as ArtDoor) ? (from as ArtDoor) : null;
}

/**
 * The drawing for a door. Arriving from another sign-in page, that page's
 * lines move into this drawing; otherwise it draws itself in. Reduced motion
 * shows it drawn.
 */
export function SignInArt({ door }: { door: ArtDoor }) {
  const [state, setState] = useState<{ from: ArtDoor | null; start: number; animate: boolean } | null>(null);
  const [settled, setSettled] = useState(false);
  const settle = useCallback(() => setSettled(true), []);
  const to = useMemo(() => DRAWINGS[door](), [door]);
  const from = useMemo(() => (state?.from ? DRAWINGS[state.from]() : null), [state?.from]);

  useEffect(() => {
    if (!session || session.door !== door) {
      const from = readFrom();
      session = { door, from: from === door ? null : from, start: performance.now() };
    }
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setState({ from: reduce ? null : session.from, start: session.start, animate: !reduce });
  }, [door]);

  // Until the client knows where the lines come from, the sheet stays empty.
  if (!state) return null;
  if (from && !settled) return <MorphArt from={from} to={to} start={state.start} onDone={settle} />;
  return <StaticArt shapes={to} animate={state.animate && !state.from} />;
}

/** Adds the drawing a link leaves from, so the next sign-in page can move its lines. */
export function withArt(href: string, from: ArtDoor): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set(ART_PARAM, from);
  return `${path}?${params.toString()}`;
}
