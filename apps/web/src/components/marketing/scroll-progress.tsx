"use client";

import { useEffect, useRef } from "react";
import styles from "./landing-cinematic.module.css";

/**
 * A hairline of signal red along the bottom edge of the fixed bar, filling
 * with reading progress. Decorative: the page never depends on it for
 * orientation, and it is written straight to the element so scrolling does
 * not re-render anything.
 */
export function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const bar = barRef.current;
      if (!bar) return;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
      bar.style.transform = `scaleX(${progress.toFixed(4)})`;
    };
    const request = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
    };
  }, []);

  return (
    <div className={styles.progress} aria-hidden>
      <div ref={barRef} className={styles.progressBar} />
    </div>
  );
}
