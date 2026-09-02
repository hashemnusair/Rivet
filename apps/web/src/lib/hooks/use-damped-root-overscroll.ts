"use client";

import { useEffect, type RefObject } from "react";

const MAX_PULL_PX = 7;
const DAMPING = 0.045;
// A critically damped spring returns the page continuously while trackpad
// momentum is still arriving. Timer-debounced CSS transitions felt delayed on
// macOS because every inertial wheel event postponed the start of the return.
const SPRING_STIFFNESS = 1000;
const SPRING_DAMPING = 2 * Math.sqrt(SPRING_STIFFNESS);
const REST_POSITION_PX = 0.04;
const REST_VELOCITY_PX_PER_SECOND = 0.8;

function normalizedWheelDelta(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
  return event.deltaY;
}

function nestedScrollerCanConsume(target: EventTarget | null, deltaY: number): boolean {
  let element = target instanceof Element ? target : null;
  while (element && element !== document.documentElement) {
    const style = window.getComputedStyle(element);
    const scrollable = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
    if (scrollable) {
      if (deltaY < 0 && element.scrollTop > 1) return true;
      if (deltaY > 0 && element.scrollTop + element.clientHeight < element.scrollHeight - 1) return true;
    }
    element = element.parentElement;
  }
  return false;
}

/**
 * Replaces the browser's large root rubber-band with a tiny, controlled edge
 * response on fine-pointer devices. Touch-first devices retain the platform's
 * native elasticity and pull-to-refresh behavior.
 */
export function useDampedRootOverscroll(shellRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const shell = shellRef.current;
    if (!shell) return;

    const coarsePointer = window.matchMedia("(pointer: coarse)");
    if (coarsePointer.matches) {
      shell.dataset.overscrollMode = "native";
      return () => {
        delete shell.dataset.overscrollMode;
      };
    }

    shell.dataset.overscrollMode = "damped";

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let offset = 0;
    let velocity = 0;
    let animationFrame: number | undefined;
    let previousFrameTime: number | undefined;
    let lastTouchY: number | undefined;

    const clearVisualOffset = () => {
      offset = 0;
      velocity = 0;
      previousFrameTime = undefined;
      animationFrame = undefined;
      shell.style.removeProperty("transform");
      shell.style.removeProperty("will-change");
    };

    const stepSpring = (frameTime: number) => {
      if (reducedMotion.matches) {
        clearVisualOffset();
        return;
      }

      const elapsedSeconds = previousFrameTime === undefined
        ? 1 / 60
        : Math.min((frameTime - previousFrameTime) / 1000, 1 / 30);
      previousFrameTime = frameTime;

      const acceleration = -SPRING_STIFFNESS * offset - SPRING_DAMPING * velocity;
      velocity += acceleration * elapsedSeconds;
      offset += velocity * elapsedSeconds;

      if (Math.abs(offset) <= REST_POSITION_PX && Math.abs(velocity) <= REST_VELOCITY_PX_PER_SECOND) {
        clearVisualOffset();
        return;
      }

      shell.style.transform = `translate3d(0, ${offset}px, 0)`;
      animationFrame = window.requestAnimationFrame(stepSpring);
    };

    const ensureSpringRunning = () => {
      if (animationFrame !== undefined || reducedMotion.matches) return;
      shell.style.willChange = "transform";
      animationFrame = window.requestAnimationFrame(stepSpring);
    };

    const dampBoundaryDelta = (deltaY: number, event: WheelEvent | TouchEvent): boolean => {
      if (deltaY === 0 || nestedScrollerCanConsume(event.target, deltaY)) return false;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const atTop = window.scrollY <= 1;
      const atBottom = window.scrollY >= maxScroll - 1;
      if (!((deltaY < 0 && atTop) || (deltaY > 0 && atBottom))) return false;

      if (event.cancelable) event.preventDefault();
      offset = Math.max(-MAX_PULL_PX, Math.min(MAX_PULL_PX, offset - deltaY * DAMPING));
      if (!reducedMotion.matches) {
        shell.style.transform = `translate3d(0, ${offset}px, 0)`;
        ensureSpringRunning();
      }
      return true;
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      dampBoundaryDelta(normalizedWheelDelta(event), event);
    };
    const onTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY;
    };
    const onTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY;
      if (currentY === undefined || lastTouchY === undefined) return;
      const deltaY = lastTouchY - currentY;
      lastTouchY = currentY;
      dampBoundaryDelta(deltaY, event);
    };
    const onTouchEnd = () => {
      lastTouchY = undefined;
      if (offset !== 0) ensureSpringRunning();
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
      clearVisualOffset();
      delete shell.dataset.overscrollMode;
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, shellRef]);
}
