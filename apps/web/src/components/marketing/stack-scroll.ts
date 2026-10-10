/*
 * The stack's scroll: while the stage is pinned the page's own scroll drives
 * the pin, plate by plate. The page is never moved for the visitor.
 */

export interface StackScrollOptions {
  /** The tall section the stage is pinned in. */
  section: HTMLElement;
  /** The pinned stage. */
  stage: HTMLElement;
  /** The run's length, in steps of one plate. */
  totalSteps: number;
  /** Called on every frame the scroll moves, with how far into the run the page is. */
  onSteps(steps: number): void;
}

export interface StackScroll {
  destroy(): void;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function bindStackScroll({ section, stage, totalSteps, onSteps }: StackScrollOptions): StackScroll {
  const header = document.querySelector<HTMLElement>("[data-landing-header]");
  const bar = () => header?.offsetHeight ?? 72;
  /** The scroll position at which the stage pins on the first plate. */
  const start = () => section.getBoundingClientRect().top + window.scrollY - bar();
  const run = () => Math.max(1, section.offsetHeight - stage.offsetHeight);
  const stepPx = () => run() / totalSteps;

  let frame = 0;
  const paint = () => {
    frame = 0;
    onSteps(clamp(window.scrollY - start(), 0, run()) / stepPx());
  };
  const requestPaint = () => {
    if (!frame) frame = window.requestAnimationFrame(paint);
  };

  requestPaint();
  window.addEventListener("scroll", requestPaint, { passive: true });
  window.addEventListener("resize", requestPaint, { passive: true });

  return {
    destroy() {
      window.removeEventListener("scroll", requestPaint);
      window.removeEventListener("resize", requestPaint);
      if (frame) window.cancelAnimationFrame(frame);
    },
  };
}
