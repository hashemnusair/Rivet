"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils/cn";
import { RivetLogoLoader } from "./rivet-logo-loader";

/**
 * Working surfaces, where a full-screen hold between every list and record
 * would be in the way rather than reassuring. Someone moving through members,
 * the reception lane or the platform console is doing a job, not being
 * introduced to the product.
 *
 * Arriving at one of these from outside still gets the transition — it is
 * navigating *within* them that is suppressed.
 */
const WORKSPACE_ROUTES = [
  "/dashboard",
  "/reception",
  "/members",
  "/memberships",
  "/plans",
  "/crm",
  "/payments",
  "/automations",
  "/audit",
  "/settings",
  "/platform",
];

function isWorkspace(pathname: string): boolean {
  return WORKSPACE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
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
  const [navigatingFrom, setNavigatingFrom] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // The hold ends when the route actually changes.
  useEffect(() => {
    setNavigatingFrom((from) => (from !== null && from !== pathname ? null : from));
  }, [pathname]);

  // A cached route can resolve in a few milliseconds; showing the hold straight
  // away would read as a flicker, so it only appears if the wait is real.
  useEffect(() => {
    if (navigatingFrom === null) {
      setVisible(false);
      return;
    }
    const show = window.setTimeout(() => setVisible(true), 130);
    // Backstop: a click that never became a navigation must not strand the
    // overlay over the page.
    const bail = window.setTimeout(() => setNavigatingFrom(null), 10_000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(bail);
    };
  }, [navigatingFrom]);

  useEffect(() => {
    if (isWorkspace(pathname)) return;

    // Capture phase, and deliberately passive: Next's Link calls
    // preventDefault on its own handler before a bubbled listener would run,
    // so this watches for a navigation starting rather than trying to own it.
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

      setNavigatingFrom(window.location.pathname);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  return (
    <>
      {children}
      {mounted && visible ? createPortal(<RouteLoadingOverlay />, document.body) : null}
    </>
  );
}
