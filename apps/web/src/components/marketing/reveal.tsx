"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Reveals its children the first time they scroll into view, then stops
 * observing — marketing sections should settle, not react to every scroll.
 *
 * `prefers-reduced-motion` is honoured through Tailwind's `motion-reduce`
 * variants rather than JavaScript, so the content is simply present for anyone
 * who has asked for less movement.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  /** Stagger, in ms, for siblings that should arrive in sequence. */
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      setShown(true);
      return;
    }

    // Keep content recoverable if an embedded browser or a long-running
    // hydration pass misses the observer callback. Motion is a bonus, never
    // the thing that makes the page readable.
    const fallback = window.setTimeout(() => setShown(true), 1600);
    const reveal = () => {
      window.clearTimeout(fallback);
      setShown(true);
    };

    // Anything already on screen at mount counts as revealed, so deep links and
    // reloads mid-document never leave a blank panel waiting for a scroll.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        reveal();
        observer.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );

    observer.observe(el);
    return () => {
      window.clearTimeout(fallback);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      data-reveal-state={shown ? "shown" : "hidden"}
      className={cn(
        "transition-[opacity,transform] duration-[850ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity,transform]",
        shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
        "motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        className,
      )}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
