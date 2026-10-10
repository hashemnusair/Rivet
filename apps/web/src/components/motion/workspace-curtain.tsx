"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Plates, platesMs } from "./plates";
import { RivetMarkLoader } from "./rivet-mark-loader";
import styles from "./workspace-curtain.module.css";

/** Matches `--lift-ms` and `--lift-step` in the stylesheet, plus the mark stepping back. */
const LIFT_MS = platesMs(460, 18) + 160;
/** The shell mounts in one long task; the lift starts after it has painted, so it runs smoothly. */
const SETTLE_MS = 120;

type Phase = "covering" | "ready" | "lifting" | "gone";

/**
 * Covers a workspace shell until it is ready, then lifts away over it. Keep it
 * mounted in the same place while `ready` changes: the lift plays only when
 * this curtain was actually seen, so a shell that is ready on its first render
 * never shows it. While it covers a wait it is the page's status, named by
 * `label`; once the wait is over it is decoration and lets every click through.
 */
export function WorkspaceCurtain({ ready, label }: { ready: boolean; label: string }) {
  const [phase, setPhase] = useState<Phase>(ready ? "gone" : "covering");

  // Before paint, so the curtain never claims to be loading over a shell that is ready.
  useLayoutEffect(() => {
    setPhase((current) => (ready ? (current === "covering" ? "ready" : current) : "covering"));
  }, [ready]);

  useEffect(() => {
    if (phase === "ready") {
      let frame = 0;
      const timer = window.setTimeout(() => {
        frame = requestAnimationFrame(() => setPhase("lifting"));
      }, SETTLE_MS);
      return () => {
        window.clearTimeout(timer);
        cancelAnimationFrame(frame);
      };
    }
    if (phase !== "lifting") return;
    const timer = window.setTimeout(() => setPhase("gone"), LIFT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "gone") return null;
  const waiting = phase === "covering";
  return (
    <div
      className={cn(styles.curtain, !waiting && styles.done, phase === "lifting" && styles.lifting)}
      role={waiting ? "status" : undefined}
      aria-label={waiting ? label : undefined}
      aria-hidden={waiting ? undefined : true}
      data-testid="workspace-curtain"
    >
      <Plates tone="paper" motion={phase === "lifting" ? "lift" : null} />
      <div className={styles.center}>
        <RivetMarkLoader className="h-14 w-auto text-ink" />
        <p className={styles.label}>{label}</p>
      </div>
    </div>
  );
}
