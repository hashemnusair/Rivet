"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

/**
 * How Wazen's floating window opens, closes and changes size. It grows out of
 * the launcher it came from (the home screen's message box or the corner
 * button), keeping that launcher's bottom and side edges, so it opens upward
 * instead of appearing, and it settles back into the same place on close. The
 * message box's arrow travels to the window's send button and back.
 *
 * Only the frame changes size: the contents keep their final size, pinned to
 * the bottom corner, so nothing inside re-wraps while the frame moves. Phones
 * and reduced motion get no morph.
 */

// Gentler than the route entrance curve and a little longer than an overlay: the
// window travels a long way, and should be seen to open rather than jump.
const EASE = "cubic-bezier(0.2, 0, 0, 1)";
const DURATION = { open: 380, close: 260, resize: 320 } as const;
type Motion = keyof typeof DURATION;

/** Launchers mark themselves with this; the home screen's box also marks its arrow. */
const LAUNCHER = "[data-ask-origin]";
const LAUNCHER_ARROW = "[data-ask-origin-arrow]";
const SEND = "[data-ask-send]";

/** The launcher showing at this width (the others are display: none). */
export function visibleLauncher(selector = LAUNCHER): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>(selector)].find((element) => element.getClientRects().length > 0);
}

function still(frame: HTMLElement): boolean {
  return typeof frame.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function shown(element: Element | null | undefined): element is HTMLElement {
  return element instanceof HTMLElement && element.getClientRects().length > 0;
}

interface Paint {
  backgroundColor: string;
  color: string;
}

function paintOf(element: HTMLElement): Paint {
  const style = getComputedStyle(element);
  return { backgroundColor: style.backgroundColor, color: style.color };
}

/** The send button's look once the composer has settled: dark when there is something to send. */
function sendPaint(frame: HTMLElement, ready: boolean): Paint {
  const style = getComputedStyle(frame);
  const token = (name: string) => style.getPropertyValue(name).trim();
  return ready ? { backgroundColor: token("--color-ink"), color: token("--color-paper") } : { backgroundColor: token("--color-sunken-2"), color: token("--color-ink-4") };
}

interface Flight {
  from: HTMLElement;
  to: HTMLElement;
  toPaint?: Paint;
}

interface Running {
  animations: Animation[];
  undo: Array<() => void>;
}

function play(frame: HTMLElement, content: HTMLElement, motion: Motion, from: DOMRect, to: DOMRect, flight?: Flight): Running {
  const duration = DURATION[motion];
  const running: Running = { animations: [], undo: [] };
  const rtl = getComputedStyle(frame).direction === "rtl";
  // The frame is pinned by its bottom and end edges; a box anywhere else is reached by moving it.
  const base = frame.getBoundingClientRect();
  const box = (rect: DOMRect) => ({
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    transform: `translate(${rtl ? rect.left - base.left : rect.right - base.right}px, ${rect.bottom - base.bottom}px)`,
  });

  // The contents hold the size they end at (or, closing, the size they have) for the whole motion.
  const border = { x: frame.offsetWidth - frame.clientWidth, y: frame.offsetHeight - frame.clientHeight };
  const hold = motion === "close" ? from : to;
  content.style.width = `${hold.width - border.x}px`;
  content.style.height = `${hold.height - border.y}px`;
  running.undo.push(() => {
    content.style.width = "";
    content.style.height = "";
  });

  const frameKeys: Keyframe[] = motion === "open"
    ? [{ ...box(from), opacity: 0, visibility: "visible" }, { opacity: 1, offset: 0.25 }, { ...box(to), opacity: 1, visibility: "visible" }]
    : motion === "close"
      ? [{ ...box(from), opacity: 1, visibility: "visible" }, { opacity: 1, offset: 0.7 }, { ...box(to), opacity: 0, visibility: "visible" }]
      : [box(from), box(to)];
  const contentKeys: Keyframe[] = motion === "close"
    ? [{ opacity: 1 }, { opacity: 0, offset: 0.45 }, { opacity: 0 }]
    : [{ opacity: 0 }, { opacity: 0, offset: motion === "open" ? 0.15 : 0 }, { opacity: 1, offset: 0.7 }, { opacity: 1 }];
  running.animations.push(frame.animate(frameKeys, { duration, easing: EASE }));
  running.animations.push(content.animate(contentKeys, { duration, easing: "linear" }));

  if (flight) {
    const start = flight.from.getBoundingClientRect();
    const end = flight.to.getBoundingClientRect();
    const ghost = document.createElement("div");
    ghost.className = "ask-arrow-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.innerHTML = flight.from.innerHTML;
    Object.assign(ghost.style, { left: `${end.left}px`, top: `${end.top}px`, width: `${end.width}px`, height: `${end.height}px` });
    document.body.append(ghost);
    // Both buttons stay out of sight while the arrow is between them.
    flight.from.style.visibility = "hidden";
    flight.to.style.visibility = "hidden";
    running.undo.push(() => {
      ghost.remove();
      flight.from.style.visibility = "";
      flight.to.style.visibility = "";
    });
    running.animations.push(ghost.animate([
      { transform: `translate(${start.left - end.left}px, ${start.top - end.top}px)`, ...paintOf(flight.from) },
      { transform: "none", ...(flight.toPaint ?? paintOf(flight.to)) },
    ], { duration, easing: EASE }));
  }
  return running;
}

export function useWindowMotion({ panel, body, open, popup, size, sendReady }: {
  panel: RefObject<HTMLElement | null>;
  body: RefObject<HTMLElement | null>;
  open: boolean;
  popup: boolean;
  size: string;
  /** Whether the send button will be dark once the window has opened. */
  sendReady: () => boolean;
}): { beforeResize: () => void } {
  const running = useRef<Running | undefined>(undefined);
  const generation = useRef(0);
  const previous = useRef({ open, size });
  const resizeFrom = useRef<DOMRect | undefined>(undefined);
  const ready = useRef(sendReady);
  useLayoutEffect(() => {
    ready.current = sendReady;
  });

  const stop = useCallback(() => {
    running.current?.animations.forEach((animation) => animation.cancel());
    running.current?.undo.forEach((undo) => undo());
    running.current = undefined;
  }, []);

  useLayoutEffect(() => {
    const was = previous.current;
    previous.current = { open, size };
    const frame = panel.current;
    const content = body.current;
    const opened = open !== was.open;
    const resized = open && size !== was.size;
    if (!frame || !content || (!opened && !resized)) return;
    // Where the frame is right now, partway through an earlier motion if one is running.
    const current = running.current ? frame.getBoundingClientRect() : undefined;
    stop();
    const from = resizeFrom.current;
    resizeFrom.current = undefined;
    if (!popup || still(frame)) return;

    let next: Running | undefined;
    if (opened) {
      const launcher = visibleLauncher();
      if (!launcher) return;
      const arrow = launcher.querySelector(LAUNCHER_ARROW);
      const send = frame.querySelector(SEND);
      if (open) {
        const flight = shown(arrow) && shown(send) ? { from: arrow, to: send, toPaint: sendPaint(frame, ready.current()) } : undefined;
        next = play(frame, content, "open", current ?? launcher.getBoundingClientRect(), frame.getBoundingClientRect(), flight);
      } else {
        const flight = shown(arrow) && shown(send) ? { from: send, to: arrow } : undefined;
        next = play(frame, content, "close", current ?? frame.getBoundingClientRect(), launcher.getBoundingClientRect(), flight);
      }
    } else if (from || current) {
      next = play(frame, content, "resize", current ?? from!, frame.getBoundingClientRect());
    }
    if (!next) return;
    running.current = next;
    const token = ++generation.current;
    // Tidy up when the motion ends, or when something else cancels it; a newer motion tidies up after itself.
    const settle = () => {
      if (generation.current === token) stop();
    };
    void Promise.all(next.animations.map((animation) => animation.finished)).then(settle, settle);
  }, [open, size, popup, panel, body, stop]);

  useLayoutEffect(() => stop, [stop]);

  const beforeResize = useCallback(() => {
    if (panel.current && !running.current) resizeFrom.current = panel.current.getBoundingClientRect();
  }, [panel]);
  return { beforeResize };
}
