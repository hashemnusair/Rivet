"use client";

import { useEffect } from "react";
import { settleDuration, settleEase, settleTarget, type SettleEdge } from "./landing-settle";

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

    // ------------------------------------------------------------ settle
    // Section edges ease into place only after the visitor has let go.
    const snapStarts = Array.from(document.querySelectorAll<HTMLElement>("[data-landing-snap=start]"));
    const snapEnds = Array.from(document.querySelectorAll<HTMLElement>("[data-landing-snap=end]"));
    const header = document.querySelector<HTMLElement>("[data-landing-header]");
    // From the film to the end of the stack's run the page is never settled: the stack scrolls freely.
    const stack = document.querySelector<HTMLElement>("[data-landing-stack]");
    const stackOwnsScroll = () => Boolean(stack?.hasAttribute("data-stack-scrolly")) && (stack?.getBoundingClientRect().bottom ?? 0) > window.innerHeight + 1;
    let lastY = window.scrollY;
    let direction: -1 | 0 | 1 = 0;
    let settleFrame = 0;
    let settleTimer = 0;
    let settling = false;
    let touching = false;

    const cancelSettle = () => {
      if (settleFrame) window.cancelAnimationFrame(settleFrame);
      settleFrame = 0;
      settling = false;
    };

    const settle = () => {
      settleTimer = 0;
      if (settling || touching || reducedMotion.matches || root.classList.contains("landing-nav-open") || stackOwnsScroll()) return;
      const edges: SettleEdge[] = [
        ...snapStarts.map((el) => ({ kind: "start" as const, top: el.getBoundingClientRect().top })),
        ...snapEnds.map((el) => ({ kind: "end" as const, bottom: el.getBoundingClientRect().bottom })),
      ];
      const from = window.scrollY;
      const target = settleTarget({
        scrollY: from,
        viewportHeight: window.innerHeight,
        barHeight: header?.offsetHeight ?? 72,
        maxScroll: document.documentElement.scrollHeight - window.innerHeight,
        edges,
        direction,
      });
      if (target === null) return;
      const duration = settleDuration(Math.abs(target - from));
      const started = performance.now();
      settling = true;
      const step = (now: number) => {
        const t = (now - started) / duration;
        window.scrollTo({ top: from + (target - from) * settleEase(t), behavior: "instant" });
        settleFrame = t < 1 ? window.requestAnimationFrame(step) : 0;
        if (!settleFrame) settling = false;
      };
      settleFrame = window.requestAnimationFrame(step);
    };

    const supportsScrollEnd = "onscrollend" in window;
    const handleScroll = () => {
      const y = window.scrollY;
      if (!settling && y !== lastY) direction = y > lastY ? 1 : -1;
      lastY = y;
      if (settling || supportsScrollEnd) return;
      // No scrollend (older Safari): treat a short quiet spell as the end.
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, 180);
    };
    const handleScrollEnd = () => {
      if (settling) return;
      window.clearTimeout(settleTimer);
      // Let a wheel's trailing events or the page's own layout land first.
      settleTimer = window.setTimeout(settle, 60);
    };
    const handleInput = () => {
      window.clearTimeout(settleTimer);
      cancelSettle();
    };
    const handleTouchStart = () => { touching = true; handleInput(); };
    const handleTouchEnd = () => { touching = false; };

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
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("scrollend", handleScrollEnd);
    window.addEventListener("wheel", handleInput, { passive: true });
    window.addEventListener("keydown", handleInput);
    window.addEventListener("pointerdown", handleInput);
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    for (const cover of covers) resizeObserver?.observe(cover);

    return () => {
      root.classList.remove("landing-motion-ready");
      window.removeEventListener("scroll", requestRender);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scrollend", handleScrollEnd);
      window.removeEventListener("wheel", handleInput);
      window.removeEventListener("keydown", handleInput);
      window.removeEventListener("pointerdown", handleInput);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
      window.clearTimeout(settleTimer);
      cancelSettle();
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
