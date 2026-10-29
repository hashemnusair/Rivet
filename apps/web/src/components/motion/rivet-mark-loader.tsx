import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";
import { MARK_BAR, MARK_HOOK, MARK_POST, MARK_VIEWBOX, PIN_BAR, PIN_PLATE, PIN_RING, PLATE_HEIGHT, PLATE_RX, PLATE_X, PLATES } from "./rivet-mark-geometry";
import styles from "./rivet-mark-loader.module.css";

/*
 * The RIVET glyph, drawn as the weight stack it is, building itself and then
 * lifting while something loads (geometry: `rivet-mark-geometry.ts`). The
 * machine takes the text colour, so it reads as ink on paper and as night ink
 * on the night pages; the pin is always the signal red.
 * Purely visual: the caller supplies the status role and its words.
 */

function Plate({ index }: { index: number }) {
  const plate = PLATES[index]!;
  return (
    <rect
      x={PLATE_X}
      y={plate.y}
      width={plate.w}
      height={PLATE_HEIGHT}
      rx={PLATE_RX}
      className={cn(styles.machine, styles.plate)}
      style={{ "--rack": PLATES.length - 1 - index } as CSSProperties}
    />
  );
}

/**
 * `assembled` skips the build and starts on the lift: the member app opens on
 * the finished mark its launch image already showed (`src/lib/pwa/launch-images.ts`).
 */
export function RivetMarkLoader({ className, assembled = false }: { className?: string; assembled?: boolean }) {
  const lifted = PLATES.slice(0, PIN_PLATE + 1).map((_, index) => index);
  const resting = PLATES.slice(PIN_PLATE + 1).map((_, index) => PIN_PLATE + 1 + index);
  return (
    <svg viewBox={`${MARK_VIEWBOX.x} ${MARK_VIEWBOX.y} ${MARK_VIEWBOX.width} ${MARK_VIEWBOX.height}`} className={cn(styles.mark, assembled && styles.assembled, className)} aria-hidden focusable="false">
      <rect {...MARK_POST} className={cn(styles.machine, styles.post)} />
      <rect {...MARK_BAR} className={cn(styles.machine, styles.bar)} />
      <rect {...MARK_HOOK} className={cn(styles.machine, styles.hook)} />
      {resting.map((index) => <Plate key={index} index={index} />)}
      <g className={styles.lift}>
        {lifted.map((index) => <Plate key={index} index={index} />)}
        <g className={styles.pin}>
          <rect {...PIN_BAR} className={styles.pinBar} />
          <circle cx={PIN_RING.cx} cy={PIN_RING.cy} r={PIN_RING.r} className={styles.pinRing} />
        </g>
      </g>
    </svg>
  );
}
