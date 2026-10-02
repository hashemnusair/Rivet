"use client";

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Renders a product surface at its real size and scales it into whatever box
 * the device frame leaves for the screen, so type, spacing and controls keep
 * the proportions of the product instead of being redrawn at thumbnail size.
 */
export function ScaledScreen({
  width,
  height,
  defaultScale,
  children,
}: {
  /** Natural size of the surface, in CSS pixels. */
  width: number;
  height: number;
  /** Used until the box is measured, so the server render is close. */
  defaultScale: number;
  children: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => box.style.setProperty("--screen-scale", (box.clientWidth / width).toFixed(5));
    fit();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    observer?.observe(box);
    return () => observer?.disconnect();
  }, [width]);

  return (
    <div ref={boxRef} className="absolute inset-0 overflow-hidden" style={{ "--screen-scale": String(defaultScale) } as CSSProperties}>
      <div
        className="origin-top-left"
        style={{ width, height, transform: "scale(var(--screen-scale))" }}
      >
        {children}
      </div>
    </div>
  );
}
