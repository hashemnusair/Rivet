"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { RivetMarkLoader } from "./rivet-mark-loader";
import styles from "./workspace-curtain.module.css";

/** Matches the cover's fade in the stylesheet, after the mark has stepped back. */
const LIFT_MS = 480;
/** The shell mounts in one long task; the lift starts after it has painted, so it runs smoothly. */
const SETTLE_MS = 120;

type Phase = "covering" | "ready" | "lifting" | "gone";

/**
 * Covers a workspace shell until it is ready, then fades off it. Keep it
 * mounted in the same place while `ready` changes: the lift plays only when
 * this curtain was actually seen, so a shell that is ready on its first render
 * never shows it. While it covers a wait it is the page's status, named by
 * `label`; once the wait is over it is decoration and lets every click through.
 *
 * `launch` is the member app opening from the home screen: the finished mark
 * sits exactly in the middle, where the phone's launch image drew it, so the
 * hand-over from the phone to the page does not move or redraw it.
 *
 * `arrives` is the sign-in cover: it comes down over a page someone was
 * looking at, so it fades in (the shells' covers are there from the first
 * paint) and names the wait at once instead of after a pause.
 */
export function WorkspaceCurtain({
  ready,
  label,
  launch = false,
  arrives = false,
  testId = "workspace-curtain",
}: {
  ready: boolean;
  label: string;
  launch?: boolean;
  arrives?: boolean;
  testId?: string;
}) {
  const [phase, setPhase] = useState<Phase>(ready ? "gone" : "covering");

  // Before paint, so the curtain never claims to be loading over a shell that is ready.
  useLayoutEffect(() => {
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPhase((current) => {
      if (!ready) return "covering";
      if (reduced) return "gone";
      return current === "covering" ? "ready" : current;
    });
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
      className={cn(styles.curtain, launch && styles.launch, arrives && styles.arrives, !waiting && styles.done, phase === "lifting" && styles.lifting)}
      role={waiting ? "status" : undefined}
      aria-label={waiting ? label : undefined}
      aria-hidden={waiting ? undefined : true}
      data-testid={testId}
    >
      <div className={styles.cover} />
      <div className={styles.center}>
        <RivetMarkLoader assembled={launch} className="h-14 w-auto text-ink" />
        <p className={styles.label}>{label}</p>
      </div>
    </div>
  );
}
