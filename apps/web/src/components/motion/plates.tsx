import type { CSSProperties } from "react";
import { cn } from "@/lib/utils/cn";
import styles from "./plates.module.css";

export const PLATE_COUNT = 8;

/** How long the plates take to rack in or lift off, from the first to the last. */
export const platesMs = (each: number, step: number) => each + (PLATE_COUNT - 1) * step;

/**
 * The plates that cover one page and uncover the next. `motion` picks the
 * move; at rest they simply cover. The timing is the caller's, through
 * `--rack-ms`/`--rack-step` and `--lift-ms`/`--lift-step` on any ancestor.
 */
export function Plates({ tone, motion }: { tone: "night" | "paper"; motion: "rack" | "lift" | null }) {
  return (
    <div className={cn(styles.plates, styles[tone], motion === "rack" && styles.racking, motion === "lift" && styles.lifting)} aria-hidden>
      {Array.from({ length: PLATE_COUNT }, (_, plate) => (
        <span key={plate} className={styles.plate} style={{ "--plate": plate } as CSSProperties} />
      ))}
    </div>
  );
}
