"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ART_VIEWBOX, sheetCarries } from "@/components/motion/sheet-store";
import { cn } from "@/lib/utils/cn";
import { flatten, samplePath, type Point } from "./sign-in-art-geometry";
import styles from "./login.module.css";

/*
 * Line drawings for the sign-in doors, in the brand's white, black and red:
 * front elevations with faint construction lines, as on a layout sheet. Each
 * drawing is data (a list of strokes), so the same lines can draw themselves
 * in, or carry over from the page before and move into this page's drawing.
 * Inline SVG: a door costs no image request.
 */

export type ArtDoor = "account" | "staff" | "member" | "admin";
const DOORS: readonly ArtDoor[] = ["account", "staff", "member", "admin"];
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

const STACK_TOP = 412;
const PLATE_PITCH = 24;
const PLATE_HEIGHT = 18;
/** The plates from the top, lightest first. */
const PLATES = range(0, 7, 1).map((i) => ({ x: i < 3 ? 352 : 326, y: STACK_TOP + i * PLATE_PITCH, w: i < 3 ? 96 : 148 }));
/** The plate the pin rests in: the red one of the mark. */
const PIN_HOME = 4;
const HOME_PLATE = { x: 326, y: STACK_TOP + PIN_HOME * PLATE_PITCH, w: 148 };
const plateBox = (plate: { x: number; y: number; w: number }) => box(plate.x, plate.y, plate.w, PLATE_HEIGHT, 4);

/**
 * A weight-stack machine with one red pin: the RIVET mark as the machine it
 * came from. Three narrow plates over five wide ones, as in the mark, each
 * with its pin hole; the cable runs over the far pulley to a tricep pushdown
 * rope, drawn to the same scale as the plates. The guide rods run behind the
 * stack, so they stop at its top plate. Returned in parts, so the pin, the
 * cable and the rope can move (see `MachineArt`).
 */
function machine() {
  const top = STACK_TOP;
  const pinY = HOME_PLATE.y + PLATE_HEIGHT / 2;
  return {
    frame: [
      ...ground(640, 120, 720),
      sh(line(184, 76, 616, 76), "faint"),
      ...[184, 616].map((x) => sh(line(x, 68, x, 84), "faint")),
      sh(box(200, 96, 470, 24, 4), "ink", 0.1),
      sh(box(220, 120, 20, 500, 2), "ink", 0.2),
      sh(box(560, 120, 20, 500, 2), "ink", 0.25),
      sh(box(184, 620, 432, 20, 4), "ink", 0.3),
    ],
    rods: [sh(line(376, 120, 376, top), "thin", 0.4), sh(line(424, 120, 424, top), "thin", 0.4)],
    pulleys: [
      sh(line(400, 120, 400, 132), "ink", 0.45),
      sh(ring(400, 152, 20), "ink", 0.5),
      sh(ring(400, 152, 6), "thin", 0.6),
      sh(line(650, 120, 650, 134), "ink", 0.45),
      sh(ring(650, 148, 13), "ink", 0.55),
      sh(ring(650, 148, 4), "thin", 0.65),
    ],
    // the cable: down to the stack, across the top, down to the rope
    stackCable: sh(`M400 172V${top}`, "thin", 0.7),
    run: sh("M420 152H637", "thin", 0.7),
    ropeCable: sh("M663 148V249", "thin", 0.8),
    // the tricep rope: a clip, two strands, two stoppers
    rope: [
      sh(ring(663, 258, 9), "ink", 0.85),
      sh("M658 266C652 320 636 368 632 408", "ink", 0.95),
      sh("M668 266C674 320 690 368 694 408", "ink", 0.95),
      sh("M663 267C659 322 645 370 642 408", "thin", 1.0),
      sh("M663 267C667 322 681 370 684 408", "thin", 1.0),
      sh(box(625, 408, 24, 34, 10), "ink", 1.1),
      sh(box(677, 408, 24, 34, 10), "ink", 1.1),
    ],
    centre: sh(line(400, top + PLATE_HEIGHT, 400, 604), "faint", 0, "3 6"),
    glow: sh(plateBox(HOME_PLATE), "soft", 1.5),
    plates: PLATES.map((plate, i) => [sh(plateBox(plate), "ink", 0.8 + i * 0.05), sh(ring(plate.x + plate.w - 12, plate.y + 9, 2.6), "thin", 1.0 + i * 0.04)]),
    pin: [sh(line(474, pinY, 498, pinY), "red", 1.3), sh(ring(507, pinY, 9), "red", 1.4), sh(ring(507, pinY, 3.2), "dot", 1.6)],
  };
}

function stack(): Shape[] {
  const m = machine();
  return [...m.frame, ...m.rods, ...m.pulleys, m.stackCable, m.run, m.ropeCable, ...m.rope, m.centre, m.glow, ...m.plates.flat(), ...m.pin];
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

/* ---------------------------------------------------------------- centring */

type Offset = { dx: number; dy: number };
const offsets = new Map<ArtDoor, Offset>();

/**
 * How far a drawing moves to sit in the middle of the viewBox, worked out from
 * its own lines: each drawing fills a different part of the sheet, and all of
 * them sat high. Drawn, it moves by shifting the viewBox, so the machine's own
 * moving parts keep their coordinates.
 */
function offsetOf(door: ArtDoor): Offset {
  const known = offsets.get(door);
  if (known) return known;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const shape of DRAWINGS[door]()) {
    for (const [x, y] of flatten(shape.d)) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const offset = { dx: Math.round(ART_VIEWBOX.width / 2 - (minX + maxX) / 2), dy: Math.round(ART_VIEWBOX.height / 2 - (minY + maxY) / 2) };
  offsets.set(door, offset);
  return offset;
}

/** The viewBox that shows a door's drawing centred. */
const viewBoxFor = (door: ArtDoor) => {
  const { dx, dy } = offsetOf(door);
  return `${-dx} ${-dy} ${ART_VIEWBOX.width} ${ART_VIEWBOX.height}`;
};

/* ---------------------------------------------------------------- rendering */

const isFill = (t: Shape["t"]) => t === "soft" || t === "dot";
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
const LOOP: readonly ArtDoor[] = ["account", "staff", "member", "admin"];
/** How long each drawing rests before its lines move on to the next. */
const LOOP_REST_MS = 1100;

/**
 * A drawing for as long as something takes: the first one draws itself in at
 * `pace`, then its lines move into the next door's drawing, and on round the
 * four. Given `endOn`, it stops going round and moves to that drawing (if it
 * is not there already), then calls `onRest` once it is fully drawn there. Where lines cannot be measured,
 * or motion is reduced, the first drawing stays.
 */
export function DrawingLoop({ pace = DRAW_PACE, endOn = null, onRest }: { pace?: number; endOn?: ArtDoor | null; onRest?: () => void }) {
  const [step, setStep] = useState<{ first: boolean; door: ArtDoor; from: ArtDoor | null; start: number }>({ first: true, door: LOOP[0]!, from: null, start: 0 });
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

/** Adds the drawing a link leaves from, so the next sign-in page can move its lines. */
export function withArt(href: string, from: ArtDoor): string {
  const [path, query = ""] = href.split("?");
  const params = new URLSearchParams(query);
  params.set(ART_PARAM, from);
  return `${path}?${params.toString()}`;
}
