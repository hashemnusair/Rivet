"use client";

import { useEffect, useRef, useState } from "react";
import { revealStep } from "@/lib/ai/chat/streaming";

/**
 * The visible part of a streaming text. Words appear at a steady pace that
 * speeds up to drain a burst, always whole words, driven by animation frames
 * so the page paints once per frame at most. Text that was already complete
 * when it mounted is shown at once; reduced motion shows text as it arrives.
 */
export function useSmoothText(target: string, streaming: boolean): string {
  const [shown, setShown] = useState(() => (streaming ? 0 : target.length));
  const shownRef = useRef(shown);
  const targetRef = useRef(target);
  const streamingRef = useRef(streaming);
  const frame = useRef<number | undefined>(undefined);
  const last = useRef<number | undefined>(undefined);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }, []);

  useEffect(() => {
    targetRef.current = target;
    streamingRef.current = streaming;
    // A replaced answer (asked again) starts over.
    if (shownRef.current > target.length) {
      shownRef.current = 0;
      setShown(0);
    }
    if (reduced.current) {
      shownRef.current = target.length;
      setShown(target.length);
      return;
    }
    if (frame.current !== undefined || shownRef.current >= target.length) return;
    const tick = (now: number) => {
      const elapsed = last.current === undefined ? 16 : now - last.current;
      last.current = now;
      const next = revealStep(targetRef.current, shownRef.current, elapsed, streamingRef.current);
      if (next === shownRef.current) {
        // Waiting on a word still being written: rest until the text changes.
        frame.current = undefined;
        last.current = undefined;
        return;
      }
      shownRef.current = next;
      setShown(next);
      if (shownRef.current < targetRef.current.length) frame.current = requestAnimationFrame(tick);
      else {
        frame.current = undefined;
        last.current = undefined;
      }
    };
    frame.current = requestAnimationFrame(tick);
  }, [target, streaming]);

  // Clear the handle too: a remount (React re-runs effects in development) must be able to start again.
  useEffect(() => () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    last.current = undefined;
  }, []);

  return target.slice(0, Math.min(shown, target.length));
}
