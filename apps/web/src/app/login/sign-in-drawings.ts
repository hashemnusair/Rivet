import { ART_VIEWBOX } from "@/components/motion/sheet-store";
import { flatten } from "./sign-in-art-geometry";

/*
 * The sign-in doors' line drawings as data, kept apart from the components
 * that draw them so the server can render one too (the page sheet's pre-paint
 * cover, `sheet-entry`).
 */

export type ArtDoor = "account" | "staff" | "member" | "admin";
export const DOORS: readonly ArtDoor[] = ["account", "staff", "member", "admin"];
export type Tone = "ink" | "thin" | "faint" | "red" | "redThin";
export type Shape = { d: string; t: Tone | "soft" | "dot"; at: number; dash?: string };

/** A rectangle with rounded corners, as a path. */
const box = (x: number, y: number, w: number, h: number, r = 0) =>
  r
    ? `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
    : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
export const line = (x1: number, y1: number, x2: number, y2: number) => `M${x1} ${y1}L${x2} ${y2}`;
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

export const STACK_TOP = 412;
export const PLATE_PITCH = 24;
export const PLATE_HEIGHT = 18;
/** The plates from the top, lightest first. */
export const PLATES = range(0, 7, 1).map((i) => ({ x: i < 3 ? 352 : 326, y: STACK_TOP + i * PLATE_PITCH, w: i < 3 ? 96 : 148 }));
/** The plate the pin rests in: the red one of the mark. */
export const PIN_HOME = 4;
export const HOME_PLATE = { x: 326, y: STACK_TOP + PIN_HOME * PLATE_PITCH, w: 148 };
export const plateBox = (plate: { x: number; y: number; w: number }) => box(plate.x, plate.y, plate.w, PLATE_HEIGHT, 4);

/**
 * A weight-stack machine with one red pin: the RIVET mark as the machine it
 * came from. Three narrow plates over five wide ones, as in the mark, each
 * with its pin hole; the cable runs over the far pulley to a tricep pushdown
 * rope, drawn to the same scale as the plates. The guide rods run behind the
 * stack, so they stop at its top plate. Returned in parts, so the pin, the
 * cable and the rope can move (see `MachineArt`).
 */
export function machine() {
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

export const DRAWINGS: Record<ArtDoor, () => Shape[]> = { account: stack, staff: desk, member: bench, admin: network };

/* ---------------------------------------------------------------- centring */

export type Offset = { dx: number; dy: number };
const offsets = new Map<ArtDoor, Offset>();

/**
 * How far a drawing moves to sit in the middle of the viewBox, worked out from
 * its own lines: each drawing fills a different part of the sheet, and all of
 * them sat high. Drawn, it moves by shifting the viewBox, so the machine's own
 * moving parts keep their coordinates.
 */
export function offsetOf(door: ArtDoor): Offset {
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
export const viewBoxFor = (door: ArtDoor) => {
  const { dx, dy } = offsetOf(door);
  return `${-dx} ${-dy} ${ART_VIEWBOX.width} ${ART_VIEWBOX.height}`;
};

export const isFill = (t: Shape["t"]) => t === "soft" || t === "dot";

/** The tones of `login.module.css` (`.ink` … `.dot`), for a drawing that is an image rather than markup. */
const IMAGE_TONES =
  "path{fill:none;stroke-linecap:round;stroke-linejoin:round}" +
  ".ink{stroke:#f2f0e6;stroke-width:1.6}.thin{stroke:rgba(242,240,230,.5);stroke-width:1.1}" +
  ".faint{stroke:rgba(242,240,230,.14);stroke-width:1}.red{stroke:#e5262e;stroke-width:1.9}" +
  ".redThin{stroke:rgba(229,38,46,.75);stroke-width:1.2}.soft{fill:rgba(229,38,46,.16)}.dot{fill:#e5262e}";

/**
 * A door's drawing at rest as a standalone SVG document, centred like the
 * drawn one: what the page sheet's pre-paint cover shows before any script.
 */
export function drawingSvg(door: ArtDoor): string {
  const paths = DRAWINGS[door]()
    .map((shape) => `<path class="${shape.t}" d="${shape.d}"${shape.dash ? ` stroke-dasharray="${shape.dash}"` : ""}/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxFor(door)}"><style>${IMAGE_TONES}</style>${paths}</svg>`;
}
