/*
 * The stack's scroll, for the one place on the landing that takes over the
 * page: from the film, the first move down glides straight onto the machine,
 * and from the machine's first plate a move up glides back to the film. While
 * the stage is pinned the page's own scroll drives the pin, plate by plate,
 * and a scroll that stops with the pin between plates finishes into the
 * nearer one. Everywhere else the landing scrolls as it always does.
 *
 * Wheel, touch and keys are only held in the film's stretch and only while a
 * glide that the visitor asked for is under way, plus the trailing momentum of
 * the same gesture, so the machine is not overshot on arrival. A settle between
 * plates gives way to any new input.
 */

export interface StackScrollOptions {
  /** The tall section the stage is pinned in. */
  section: HTMLElement;
  /** The pinned stage. */
  stage: HTMLElement;
  /** The run's length, in steps of one plate. */
  totalSteps: number;
  /** Where to finish a scroll that stopped at `steps`, or null to leave it. */
  restAt(steps: number): number | null;
  /** Called on every frame the scroll moves, with how far into the run the page is. */
  onSteps(steps: number): void;
}

export interface StackScroll {
  /** Glides the page to a point in the run, as choosing a plate does. */
  toSteps(steps: number): void;
  destroy(): void;
}

/** A wheel gesture's events, momentum included, come closer together than this. */
const GESTURE_GAP_MS = 140;
/** A swipe this long, in px, says which way the visitor means to go. */
const SWIPE_PX = 8;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** Unhurried at both ends, so the arrival reads as placed rather than thrown. */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const glideDuration = (distance: number) => Math.round(clamp(420 + distance * 0.45, 520, 980));

export function bindStackScroll({ section, stage, totalSteps, restAt, onSteps }: StackScrollOptions): StackScroll {
  const root = document.documentElement;
  const header = document.querySelector<HTMLElement>("[data-landing-header]");
  const bar = () => header?.offsetHeight ?? 72;
  /** The scroll position at which the stage pins on the first plate. */
  const start = () => section.getBoundingClientRect().top + window.scrollY - bar();
  const run = () => Math.max(1, section.offsetHeight - stage.offsetHeight);
  const stepPx = () => run() / totalSteps;
  const stepsNow = () => clamp(window.scrollY - start(), 0, run()) / stepPx();
  const locked = () => root.classList.contains("landing-nav-open");

  let paintFrame = 0;
  const paint = () => {
    paintFrame = 0;
    onSteps(stepsNow());
  };
  const requestPaint = () => {
    if (!paintFrame) paintFrame = window.requestAnimationFrame(paint);
  };

  // ------------------------------------------------------------- glides
  let glideFrame = 0;
  /** A glide the visitor asked for holds their input until it lands; a settle does not. */
  let glide: { holds: boolean } | null = null;
  let absorbing = false;
  let lastWheel = 0;

  const cancelGlide = () => {
    if (glideFrame) window.cancelAnimationFrame(glideFrame);
    glideFrame = 0;
    glide = null;
  };

  const glideTo = (target: number, holds: boolean) => {
    cancelGlide();
    const from = window.scrollY;
    const to = clamp(Math.round(target), 0, root.scrollHeight - window.innerHeight);
    const distance = Math.abs(to - from);
    if (distance < 2) return;
    const duration = glideDuration(distance);
    const started = performance.now();
    glide = { holds };
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      window.scrollTo({ top: from + (to - from) * easeInOut(t), behavior: "instant" });
      if (t < 1) {
        glideFrame = window.requestAnimationFrame(tick);
        return;
      }
      glideFrame = 0;
      glide = null;
      absorbing = holds;
    };
    glideFrame = window.requestAnimationFrame(tick);
  };

  /** From the film, down goes to the machine; from the film or the first plate, up goes to the film. */
  const gate = (direction: 1 | -1): boolean => {
    if (locked()) return false;
    const pinned = start();
    const y = window.scrollY;
    const inFilm = y < pinned - 1;
    const atFirstPlate = Math.abs(y - pinned) <= 2;
    if (direction > 0 && inFilm) {
      glideTo(pinned, true);
      return true;
    }
    if (direction < 0 && (inFilm || atFirstPlate) && y > 0) {
      glideTo(0, true);
      return true;
    }
    return false;
  };

  // -------------------------------------------------------------- settle
  let restTimer = 0;
  let touching = false;
  const cancelRest = () => {
    window.clearTimeout(restTimer);
    restTimer = 0;
  };
  const rest = () => {
    restTimer = 0;
    if (glide || touching || locked()) return;
    const pinned = start();
    const y = window.scrollY;
    if (y < pinned - 1 || y > pinned + run() + 1) return;
    const target = restAt(stepsNow());
    if (target !== null) glideTo(pinned + target * stepPx(), false);
  };
  const scheduleRest = (delay: number) => {
    cancelRest();
    restTimer = window.setTimeout(rest, delay);
  };

  // --------------------------------------------------------------- input
  /** New input takes the page back from a settle; a held glide keeps it. */
  const interrupt = (event: Event): boolean => {
    cancelRest();
    if (!glide) return false;
    if (glide.holds) {
      if (event.cancelable) event.preventDefault();
      return true;
    }
    cancelGlide();
    return false;
  };

  const onWheel = (event: WheelEvent) => {
    const now = performance.now();
    const gap = now - lastWheel;
    lastWheel = now;
    if (interrupt(event)) return;
    if (absorbing) {
      if (gap < GESTURE_GAP_MS) {
        event.preventDefault();
        return;
      }
      absorbing = false;
    }
    if (event.ctrlKey || event.deltaY === 0 || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    if (gate(event.deltaY > 0 ? 1 : -1)) event.preventDefault();
  };

  let touchY: number | null = null;
  let touchGated = false;
  const onTouchStart = (event: TouchEvent) => {
    touching = true;
    absorbing = false;
    touchY = event.touches.length === 1 ? (event.touches[0]?.clientY ?? null) : null;
    touchGated = false;
    cancelRest();
    if (glide && !glide.holds) cancelGlide();
  };
  const onTouchMove = (event: TouchEvent) => {
    if ((glide?.holds || touchGated) && event.cancelable) {
      event.preventDefault();
      return;
    }
    if (touchY === null || event.touches.length !== 1 || locked()) return;
    const dy = touchY - (event.touches[0]?.clientY ?? touchY);
    const pinned = start();
    const y = window.scrollY;
    const inFilm = y < pinned - 1;
    const upFromFirstPlate = Math.abs(y - pinned) <= 2 && dy < 0;
    if (!inFilm && !upFromFirstPlate) return;
    if (event.cancelable) event.preventDefault();
    if (Math.abs(dy) >= SWIPE_PX) touchGated = gate(dy > 0 ? 1 : -1);
  };
  const onTouchEnd = () => {
    touching = false;
    touchY = null;
    touchGated = false;
    if (!("onscrollend" in window)) scheduleRest(180);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    const space = event.key === " ";
    if (space && target?.closest("a, button, [role=tab], summary")) return;
    const down = event.key === "ArrowDown" || event.key === "PageDown" || (space && !event.shiftKey);
    const up = event.key === "ArrowUp" || event.key === "PageUp" || (space && event.shiftKey);
    if (!down && !up) return;
    if (interrupt(event)) return;
    if (gate(down ? 1 : -1)) event.preventDefault();
  };

  const onPointerDown = () => {
    cancelRest();
    if (glide && !glide.holds) cancelGlide();
  };

  const onScroll = () => {
    requestPaint();
    if (!glide && !touching && !("onscrollend" in window)) scheduleRest(180);
  };
  const onScrollEnd = () => {
    if (!glide && !touching) scheduleRest(60);
  };

  requestPaint();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("scrollend", onScrollEnd);
  window.addEventListener("resize", requestPaint, { passive: true });
  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("pointerdown", onPointerDown, { passive: true });

  return {
    toSteps(steps) {
      glideTo(start() + clamp(steps, 0, totalSteps) * stepPx(), false);
    },
    destroy() {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", onScrollEnd);
      window.removeEventListener("resize", requestPaint);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
      cancelGlide();
      cancelRest();
      if (paintFrame) window.cancelAnimationFrame(paintFrame);
    },
  };
}
