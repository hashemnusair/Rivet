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
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        reveal();
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );

    // Keep content recoverable if an embedded browser or a long hydration pass
    // misses the observer's first callback — but only for content that is
    // actually on screen. Anything still below the fold keeps its entrance for
    // the moment the reader reaches it.
    const fallback = window.setTimeout(() => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) reveal();
    }, 2500);

    function reveal() {
      window.clearTimeout(fallback);
      observer.disconnect();
      setShown(true);
    }

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
        "transition-[opacity,transform] duration-[850ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
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
