"use client";

import { useEffect } from "react";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function LandingMotionController() {
  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : { matches: false };
    const covers = Array.from(document.querySelectorAll<HTMLElement>("[data-landing-cover]"));
    const hero = document.querySelector<HTMLElement>("[data-landing-hero]");
    let frame = 0;

    root.classList.add("landing-motion-ready");

    const measure = () => {
      for (const cover of covers) {
        const top = reducedMotion.matches ? 0 : Math.min(0, window.innerHeight - cover.offsetHeight);
        cover.style.setProperty("--landing-cover-top", `${top}px`);
      }
    };

    const render = () => {
      frame = 0;
      if (!hero || reducedMotion.matches) return;
      const rect = hero.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight * 0.35);
      const progress = clamp(-rect.top / travel, 0, 1);
      hero.style.setProperty("--landing-hero-progress", progress.toFixed(4));
      hero.style.setProperty("--landing-hero-y", `${(progress * -72).toFixed(1)}px`);
      hero.style.setProperty("--landing-hero-scale", (1 - progress * 0.055).toFixed(4));
      hero.style.setProperty("--landing-hero-opacity", (1 - progress * 0.58).toFixed(4));
    };

    const requestRender = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(render);
    };

    const handleResize = () => {
      measure();
      requestRender();
    };

    measure();
    requestRender();
    window.addEventListener("scroll", requestRender, { passive: true });
    window.addEventListener("resize", handleResize, { passive: true });

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    for (const cover of covers) resizeObserver?.observe(cover);

    return () => {
      root.classList.remove("landing-motion-ready");
      window.removeEventListener("scroll", requestRender);
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
