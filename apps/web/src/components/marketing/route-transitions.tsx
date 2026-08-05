"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { RivetLogoLoader } from "./rivet-logo-loader";

/**
 * The journeys that deserve a branded hand-off. The rest of the product is a
 * working surface: moving between members, reception, payments or settings
 * should stay immediate rather than putting a full-screen hold between every
 * task.
 */
function isAuthRoute(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/signup" ||
    pathname.startsWith("/signup/") ||
    pathname === "/customer/login" ||
    pathname === "/customer/signup"
  );
}

function isGymFinderRoute(pathname: string): boolean {
  return pathname === "/customer/discover" || pathname.startsWith("/customer/gyms/");
}

function isAuthenticatedHome(pathname: string): boolean {
  return (
    pathname === "/dashboard" ||
    pathname === "/reception" ||
    pathname === "/platform" ||
    pathname === "/customer/my-gyms" ||
    pathname.startsWith("/customer/my-gyms/")
  );
}

/** True only for the intentional public/authenticated hand-off journeys. */
export function shouldTransition(from: string, to: string): boolean {
  if (from === to) return false;
  const landingToAuth = from === "/" && isAuthRoute(to);
  const authToLanding = isAuthRoute(from) && to === "/";
  const landingToFinder = from === "/" && isGymFinderRoute(to);
  const finderToLanding = isGymFinderRoute(from) && to === "/";
  const authToHome = isAuthRoute(from) && isAuthenticatedHome(to);
  const homeToAuth = isAuthenticatedHome(from) && isAuthRoute(to);
  return landingToAuth || authToLanding || landingToFinder || finderToLanding || authToHome || homeToAuth;
}

/**
 * The full-screen hold shown between pages: the page blurs back and the mark
 * loads itself. Exported for `loading.tsx`, so a cold visit and an in-app
 * navigation look identical.
 */
export function RouteLoadingOverlay({ fixed = true }: { fixed?: boolean }) {
  return (
    <div
      className={cn(
        "z-[100] grid place-items-center bg-paper/70 backdrop-blur-md",
        "animate-fade-in motion-reduce:animate-none",
        fixed ? "fixed inset-0" : "min-h-[70vh] w-full",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-5">
        <RivetLogoLoader className="h-24 w-auto text-ink sm:h-28" />
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">Loading</p>
      </div>
    </div>
  );
}

/**
 * Turns ordinary link clicks across the public product into a branded page
 * transition, without every call site having to opt in. Mounted once at the
 * root; it listens for clicks rather than wrapping the tree, so no element is
 * inserted and no layout changes.
 */
export function RouteTransitions({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const previousPathname = useRef(pathname);
  const visibleSince = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const bailTimer = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);

  const hide = useCallback(() => {
    visibleSince.current = null;
    setVisible(false);
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    if (bailTimer.current !== null) window.clearTimeout(bailTimer.current);
    hideTimer.current = null;
    bailTimer.current = null;
  }, []);

  const start = useCallback(() => {
    if (visibleSince.current === null) {
      visibleSince.current = performance.now();
      setVisible(true);
    }
    if (bailTimer.current !== null) window.clearTimeout(bailTimer.current);
    bailTimer.current = window.setTimeout(hide, 10_000);
  }, [hide]);

  const finish = useCallback(() => {
    if (visibleSince.current === null) return;
    const elapsed = performance.now() - visibleSince.current;
    const remaining = Math.max(320 - elapsed, 0);
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(hide, remaining);
  }, [hide]);

  // Catch both prefetched links and programmatic router.push calls. The click
  // listener below starts the hold before an anchor navigation; this effect is
  // the fallback for the login button, sign-out, browser back/forward, and any
  // other navigation that does not emit a click.
  useEffect(() => {
    const from = previousPathname.current;
    previousPathname.current = pathname;
    if (shouldTransition(from, pathname)) {
      start();
      finish();
    }
  }, [finish, pathname, start]);

  useEffect(() => {
    // Capture phase: Next's Link calls preventDefault in its own handler, so we
    // observe the navigation before it is handed to the client router.
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;

      // Anything the browser should own: downloads, new tabs, other origins,
      // and explicit opt-outs from this behaviour.
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download") || anchor.dataset.noTransition !== undefined) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      // In-page anchors scroll; they are not navigations.
      if (url.pathname === window.location.pathname) return;

      if (shouldTransition(window.location.pathname, url.pathname)) start();
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [start]);

  useEffect(() => () => hide(), [hide]);

  return (
    <>
      {children}
      {mounted && visible ? createPortal(<RouteLoadingOverlay />, document.body) : null}
    </>
  );
}
