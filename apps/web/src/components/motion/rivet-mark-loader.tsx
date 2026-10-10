import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";
import styles from "./rivet-mark-loader.module.css";

/*
 * The RIVET glyph, drawn as the weight stack it is, building itself and then
 * lifting while something loads. Geometry is the landing's loop machine (traced
 * from `rivet-glyph-source.png`): one pitch for all eight plates, the pin in
 * the fifth. The machine takes the text colour, so it reads as ink on paper
 * and as night ink on the night pages; the pin is always the signal red.
 * Purely visual: the caller supplies the status role and its words.
 */

const PLATES = [
  { y: 67, w: 34 },
  { y: 80, w: 34 },
  { y: 93, w: 34 },
  { y: 106, w: 34 },
  { y: 119, w: 53.5 },
  { y: 132, w: 53.5 },
  { y: 145, w: 53.5 },
  { y: 158, w: 53.5 },
] as const;
const PIN_PLATE = 4;
const PLATE_X = 73.5;
const PIN_Y = PLATES[PIN_PLATE].y + 5;
const PIN_X = PLATE_X + PLATES[PIN_PLATE].w;

function Plate({ index }: { index: number }) {
  const plate = PLATES[index]!;
  return (
    <rect
      x={PLATE_X}
      y={plate.y}
      width={plate.w}
      height={10}
      rx={2}
      className={cn(styles.machine, styles.plate)}
      style={{ "--rack": PLATES.length - 1 - index } as CSSProperties}
    />
  );
}

export function RivetMarkLoader({ className }: { className?: string }) {
  const lifted = PLATES.slice(0, PIN_PLATE + 1).map((_, index) => index);
  const resting = PLATES.slice(PIN_PLATE + 1).map((_, index) => PIN_PLATE + 1 + index);
  return (
    <svg viewBox="44 20 102 152" className={cn(styles.mark, className)} aria-hidden focusable="false">
      <rect x={50} y={26} width={8} height={142} rx={2.5} className={cn(styles.machine, styles.post)} />
      <rect x={50} y={26} width={54} height={8} rx={2.5} className={cn(styles.machine, styles.bar)} />
      <rect x={96} y={26} width={8} height={30.5} rx={2.5} className={cn(styles.machine, styles.hook)} />
      {resting.map((index) => <Plate key={index} index={index} />)}
      <g className={styles.lift}>
        {lifted.map((index) => <Plate key={index} index={index} />)}
        <g className={styles.pin}>
          <rect x={PIN_X - 2.5} y={PIN_Y - 2.2} width={9.5} height={4.4} rx={2.2} className={styles.pinBar} />
          <circle cx={PIN_X + 10} cy={PIN_Y} r={4} className={styles.pinRing} />
        </g>
      </g>
    </svg>
  );
}
