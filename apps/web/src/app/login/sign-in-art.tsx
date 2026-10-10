import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import styles from "./login.module.css";

/*
 * Line drawings for the sign-in doors, in the brand's white, black and red:
 * front elevations with faint construction lines, as on a layout sheet. Every
 * shape is a path so it can draw itself in (pathLength 1); faint construction
 * only fades. Inline SVG, so a door costs no image request.
 */

type Tone = "ink" | "thin" | "faint" | "red" | "redThin";

/** A rectangle with rounded corners, as a path. */
const box = (x: number, y: number, w: number, h: number, r = 0) =>
  r
    ? `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
    : `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
const line = (x1: number, y1: number, x2: number, y2: number) => `M${x1} ${y1}L${x2} ${y2}`;
const ring = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
const range = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

function S({ d, t = "ink", at = 0, dash }: { d: string; t?: Tone; at?: number; dash?: string }) {
  const faint = t === "faint";
  return (
    <path
      d={d}
      pathLength={faint ? undefined : 1}
      strokeDasharray={dash}
      className={cn(styles[t], faint ? styles.fade : styles.draw)}
      style={{ "--d": `${at}s` } as CSSProperties}
    />
  );
}

/** A soft red fill or a solid red dot, faded in after the lines. */
function Fill({ d, at = 0, solid = false }: { d: string; at?: number; solid?: boolean }) {
  return <path d={d} className={cn(solid ? styles.dot : styles.redFill, styles.fade)} style={{ "--d": `${at}s` } as CSSProperties} />;
}

/** Floor line, hatching and a centre axis: the sheet every drawing stands on. */
function Ground({ y = 640, from = 70, to = 730 }: { y?: number; from?: number; to?: number }) {
  return (
    <g>
      <S d={line(400, 90, 400, y + 30)} t="faint" dash="4 7" />
      {range(from + 20, to - 10, 22).map((x) => (
        <S key={x} d={line(x, y, x - 14, y + 14)} t="faint" />
      ))}
      <S d={line(from, y, to, y)} at={0.05} />
    </g>
  );
}

/** Decorative: the door's caption beside it already says what the page is for. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 800 900" preserveAspectRatio="xMidYMid meet" className={styles.art} aria-hidden focusable="false">
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------------ member */

/**
 * A bench press seen from the foot of the bench, in one-point perspective: the
 * pad runs back to the rack, one red plate on each end of the bar, and the
 * rack's safety pins in red. Faint construction lines meet at the eye point.
 */
export function BenchArt() {
  return (
    <Frame>
      {/* the sheet: near floor, far floor, and the lines that meet at the eye */}
      {range(110, 690, 22).map((x) => <S key={x} d={line(x, 640, x - 14, 654)} t="faint" />)}
      <S d={line(90, 640, 710, 640)} at={0.05} />
      <S d={line(146, 560, 654, 560)} t="thin" at={0.15} />
      <S d={line(90, 640, 400, 200)} t="faint" dash="3 7" />
      <S d={line(710, 640, 400, 200)} t="faint" dash="3 7" />
      <S d={line(392, 200, 408, 200)} t="faint" />
      <S d={line(400, 192, 400, 208)} t="faint" />
      {/* dimensions */}
      <S d={line(128, 150, 672, 150)} t="faint" />
      {[128, 400, 672].map((x) => <S key={x} d={line(x, x === 400 ? 145 : 142, x, x === 400 ? 155 : 158)} t="faint" />)}
      <S d={line(722, 312, 722, 560)} t="faint" />
      {[312, 560].map((y) => <S key={y} d={line(714, y, 730, y)} t="faint" />)}

      {/* the rack, at the head of the bench */}
      <S d={box(236, 230, 20, 330, 3)} at={0.2} />
      <S d={box(544, 230, 20, 330, 3)} at={0.25} />
      <S d={box(196, 546, 100, 14, 3)} at={0.3} />
      <S d={box(504, 546, 100, 14, 3)} at={0.3} />
      {range(360, 532, 28).map((y, i) => (
        <g key={y}>
          <S d={ring(246, y, 2.4)} t="thin" at={0.35 + i * 0.03} />
          <S d={ring(554, y, 2.4)} t="thin" at={0.35 + i * 0.03} />
        </g>
      ))}
      <S d="M256 290H276V318Q276 328 266 328H256" at={0.45} />
      <S d="M544 290H524V318Q524 328 534 328H544" at={0.45} />

      {/* the bench, running back to the rack */}
      <S d="M330 520L345 462H455L470 520Z" at={0.55} />
      <S d="M340 512L351 470H449L460 512Z" t="thin" at={0.7} />
      <S d="M330 520V536Q330 542 336 542H464Q470 542 470 536V520" at={0.6} />
      <S d="M384 542L378 622H422L416 542Z" at={0.65} />
      <S d={box(330, 622, 140, 18, 3)} at={0.7} />
      <S d={line(400, 470, 400, 566)} t="faint" dash="3 6" />

      {/* the bar */}
      <S d={box(234, 308, 332, 8, 4)} at={0.8} />
      <S d={box(128, 304, 98, 16, 4)} at={0.85} />
      <S d={box(574, 304, 98, 16, 4)} at={0.85} />
      <S d={box(226, 296, 8, 32, 2)} at={0.9} />
      <S d={box(566, 296, 8, 32, 2)} at={0.9} />
      {[...range(286, 368, 9), ...range(432, 514, 9)].map((x) => <S key={x} d={line(x, 309, x, 315)} t="thin" at={0.95} />)}

      {/* two plates */}
      <Fill d={box(182, 196, 34, 232, 12)} at={1.4} />
      <Fill d={box(584, 196, 34, 232, 12)} at={1.4} />
      <S d={box(182, 196, 34, 232, 12)} t="red" at={1.05} />
      <S d={box(584, 196, 34, 232, 12)} t="red" at={1.1} />
      <S d={box(190, 212, 18, 200, 7)} t="redThin" at={1.2} />
      <S d={box(592, 212, 18, 200, 7)} t="redThin" at={1.25} />
      <S d={box(170, 298, 8, 28, 2)} at={1.3} />
      <S d={box(622, 298, 8, 28, 2)} at={1.3} />

      {/* safety pins, the RIVET pin */}
      <S d={line(256, 470, 274, 470)} t="red" at={1.35} />
      <S d={ring(282, 470, 8)} t="red" at={1.4} />
      <S d={line(544, 470, 526, 470)} t="red" at={1.35} />
      <S d={ring(518, 470, 8)} t="red" at={1.4} />
    </Frame>
  );
}

/* --------------------------------------------------------------------- team */

const CHART = "M112 268L136 252L160 258L184 236L208 244L232 220L256 226L272 204";
const BARS = [30, 46, 38, 58, 50, 74];

/** The front desk from the lobby: the dumbbell on its face, the screens on the wall behind. */
export function DeskArt() {
  return (
    <Frame>
      <Ground />
      <S d={line(80, 60, 720, 60)} t="faint" />

      {/* pendant lamps and their light */}
      {[270, 530].map((x, i) => (
        <g key={x}>
          <S d={line(x, 60, x, 104)} t="thin" at={0.1 + i * 0.05} />
          <S d={`M${x - 22} 128L${x - 12} 104H${x + 12}L${x + 22} 128Z`} at={0.2 + i * 0.05} />
          <S d={line(x - 22, 128, x - 64, 150)} t="faint" />
          <S d={line(x + 22, 128, x + 64, 150)} t="faint" />
          <Fill d={ring(x, 133, 3.5)} solid at={1.6} />
        </g>
      ))}

      {/* screens on the wall */}
      {[96, 304, 512].map((x, i) => (
        <g key={x}>
          <S d={box(x, 170, 192, 124, 6)} at={0.3 + i * 0.08} />
          <S d={box(x + 8, 178, 176, 108, 3)} t="thin" at={0.45 + i * 0.08} />
        </g>
      ))}
      {/* revenue */}
      <S d={line(112, 192, 172, 192)} t="thin" at={0.7} />
      {[214, 238, 262].map((y) => <S key={y} d={line(112, y, 272, y)} t="faint" />)}
      <S d={CHART} t="red" at={1.1} />
      {/* who checked in */}
      {range(0, 4, 1).map((i) => {
        const y = 190 + i * 19;
        return (
          <g key={i}>
            <S d={ring(322, y + 6, 4)} t="thin" at={0.75 + i * 0.05} />
            <S d={line(332, y + 3, 404, y + 3)} t="thin" at={0.8 + i * 0.05} />
            <S d={line(332, y + 9, 376, y + 9)} t="faint" />
            {i === 0 ? <Fill d={ring(476, y + 6, 3.5)} solid at={1.5} /> : <S d={ring(476, y + 6, 3)} t="thin" at={0.9} />}
          </g>
        );
      })}
      {/* the week */}
      <S d={line(524, 280, 692, 280)} t="thin" at={0.75} />
      {BARS.map((h, i) => (
        <S key={i} d={box(532 + i * 26, 280 - h, 14, h, 1.5)} t={i === BARS.length - 1 ? "red" : "thin"} at={0.85 + i * 0.06} />
      ))}

      {/* the desk */}
      <S d={box(452, 312, 150, 86, 8)} at={0.55} />
      <S d={ring(527, 355, 5)} t="thin" at={0.7} />
      <S d={box(214, 372, 40, 26, 4)} at={0.6} />
      <S d={line(220, 381, 248, 381)} t="red" at={1.3} />
      <S d={box(104, 398, 592, 18, 4)} at={0.5} />
      <S d={box(124, 416, 552, 224, 2)} at={0.6} />
      <S d={line(124, 612, 676, 612)} t="thin" at={0.8} />
      <S d={line(176, 416, 176, 612)} t="thin" at={0.85} />
      <S d={line(624, 416, 624, 612)} t="thin" at={0.85} />

      {/* the dumbbell on its face */}
      <S d={ring(400, 514, 64)} t="thin" at={0.9} />
      <Fill d={box(350, 486, 16, 56, 4)} at={1.5} />
      <Fill d={box(434, 486, 16, 56, 4)} at={1.5} />
      <S d={box(366, 509, 68, 10, 3)} t="red" at={1.0} />
      <S d={box(350, 486, 16, 56, 4)} t="red" at={1.1} />
      <S d={box(434, 486, 16, 56, 4)} t="red" at={1.1} />
      <S d={box(338, 494, 12, 40, 3)} t="red" at={1.2} />
      <S d={box(450, 494, 12, 40, 3)} t="red" at={1.2} />
      <S d={box(332, 507, 6, 14, 2)} t="red" at={1.25} />
      <S d={box(462, 507, 6, 14, 2)} t="red" at={1.25} />
    </Frame>
  );
}

/* -------------------------------------------------------------------- admin */

const PINS = [[300, 200], [420, 252], [524, 178]] as const;

/** Every gym on one screen: three storefronts wired to the platform's map. */
export function NetworkArt() {
  return (
    <Frame>
      <Ground from={60} to={740} />

      {/* the screen and its map */}
      <S d={box(190, 104, 420, 216, 8)} at={0.1} />
      <S d={box(200, 114, 400, 196, 4)} t="thin" at={0.2} />
      {range(139, 289, 25).map((y) => <S key={`h${y}`} d={line(200, y, 600, y)} t="faint" />)}
      {range(225, 575, 25).map((x) => <S key={`v${x}`} d={line(x, 114, x, 310)} t="faint" />)}
      <S d="M228 286C262 240 280 214 300 200S380 244 420 252S500 196 524 178S572 150 586 140" t="thin" at={0.6} />
      <S d={`M${PINS[0][0]} ${PINS[0][1]}L${PINS[1][0]} ${PINS[1][1]}L${PINS[2][0]} ${PINS[2][1]}`} t="redThin" at={1.0} />
      {PINS.map(([x, y], i) => (
        <g key={x}>
          <S d={ring(x, y, 12)} t="redThin" at={1.05 + i * 0.08} />
          <Fill d={ring(x, y, 4.5)} solid at={1.3 + i * 0.08} />
        </g>
      ))}

      {/* the platform's node, and a line to every gym */}
      <S d={line(400, 320, 400, 352)} at={0.4} />
      <S d={ring(400, 362, 10)} t="red" at={0.9} />
      <Fill d={ring(400, 362, 3.5)} solid at={1.2} />
      <S d="M392 368C340 392 196 384 190 444" t="thin" at={1.1} />
      <S d={line(400, 372, 400, 404)} t="thin" at={1.1} />
      <S d="M408 368C460 392 604 394 610 454" t="thin" at={1.1} />
      {([[190, 444], [400, 404], [610, 454]] as const).map(([x, y]) => <Fill key={x} d={ring(x, y, 4)} solid at={1.5} />)}

      {/* three gyms */}
      {[
        { x: 100, top: 450, door: [222, 520, 40, 120] as const, window: [120, 510, 90, 80] as const },
        { x: 310, top: 410, door: [370, 560, 60, 80] as const, window: [330, 470, 140, 60] as const },
        { x: 520, top: 460, door: [642, 530, 40, 110] as const, window: [540, 520, 90, 80] as const },
      ].map((gym, i) => {
        const at = 0.3 + i * 0.12;
        const cx = gym.x + 90;
        const sign = gym.top + 18;
        const [wx, wy, ww, wh] = gym.window;
        const [dx, dy, dw, dh] = gym.door;
        return (
          <g key={gym.x}>
            <S d={box(gym.x - 6, gym.top - 6, 192, 10, 2)} at={at} />
            <S d={box(gym.x, gym.top + 4, 180, 636 - gym.top, 0)} at={at + 0.05} />
            <S d={box(gym.x + 20, sign, 140, 26, 3)} t="thin" at={at + 0.15} />
            <S d={line(cx - 14, sign + 13, cx + 14, sign + 13)} t="thin" at={at + 0.25} />
            <S d={box(cx - 21, sign + 6, 7, 14, 1.5)} t="thin" at={at + 0.25} />
            <S d={box(cx + 14, sign + 6, 7, 14, 1.5)} t="thin" at={at + 0.25} />
            <S d={box(wx, wy, ww, wh, 2)} t="thin" at={at + 0.3} />
            <S d={box(dx, dy, dw, dh, 2)} at={at + 0.35} />
            {i === 1 ? (
              <S d={line(400, 560, 400, 640)} t="thin" at={at + 0.45} />
            ) : (
              <S d={line(wx + ww / 2, wy, wx + ww / 2, wy + wh)} t="faint" />
            )}
          </g>
        );
      })}
    </Frame>
  );
}

/* ------------------------------------------------------------------ chooser */

const PLATES = range(0, 7, 1);
const PINNED = 4;

/** A weight-stack machine with one red pin: the RIVET mark as the machine it came from. */
export function StackArt() {
  return (
    <Frame>
      <Ground from={120} to={720} />
      {/* dimensions */}
      <S d={line(184, 76, 616, 76)} t="faint" />
      {[184, 616].map((x) => <S key={x} d={line(x, 68, x, 84)} t="faint" />)}

      {/* frame */}
      <S d={box(200, 96, 470, 24, 4)} at={0.1} />
      <S d={box(220, 120, 20, 500, 2)} at={0.2} />
      <S d={box(560, 120, 20, 500, 2)} at={0.25} />
      <S d={box(184, 620, 432, 20, 4)} at={0.3} />
      <S d={line(316, 120, 316, 620)} t="thin" at={0.4} />
      <S d={line(484, 120, 484, 620)} t="thin" at={0.4} />

      {/* pulleys, cable and handle */}
      <S d={line(400, 120, 400, 132)} at={0.45} />
      <S d={ring(400, 152, 20)} at={0.5} />
      <S d={ring(400, 152, 6)} t="thin" at={0.6} />
      <S d={line(650, 120, 650, 134)} at={0.45} />
      <S d={ring(650, 148, 13)} at={0.55} />
      <S d={ring(650, 148, 4)} t="thin" at={0.65} />
      <S d="M400 172V322" t="thin" at={0.7} />
      <S d="M420 152H637" t="thin" at={0.7} />
      <S d="M663 148V420" t="thin" at={0.8} />
      <S d={box(633, 420, 60, 12, 6)} at={0.95} />
      <S d={line(645, 432, 645, 444)} t="thin" at={1.0} />
      <S d={line(681, 432, 681, 444)} t="thin" at={1.0} />

      {/* the stack */}
      <S d={box(300, 322, 200, 22, 5)} at={0.75} />
      <S d={line(400, 344, 400, 604)} t="faint" dash="3 6" />
      <Fill d={box(300, 352 + PINNED * 30, 200, 24, 5)} at={1.5} />
      {PLATES.map((i) => {
        const y = 352 + i * 30;
        return (
          <g key={i}>
            <S d={box(300, y, 200, 24, 5)} at={0.8 + i * 0.05} />
            <S d={ring(484, y + 12, 3)} t="thin" at={1.0 + i * 0.04} />
          </g>
        );
      })}

      {/* the pin */}
      <S d={line(500, 364 + PINNED * 30, 530, 364 + PINNED * 30)} t="red" at={1.3} />
      <S d={ring(540, 364 + PINNED * 30, 10)} t="red" at={1.4} />
      <Fill d={ring(540, 364 + PINNED * 30, 3.5)} solid at={1.7} />
    </Frame>
  );
}
