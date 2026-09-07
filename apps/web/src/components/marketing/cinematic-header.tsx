"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils/cn";
import styles from "./landing-cinematic.module.css";

export const NAV_ITEMS = [
  { index: "01", label: "Overview", href: "#top" },
  { index: "02", label: "The stack", href: "#product" },
  { index: "03", label: "A day", href: "#day" },
  { index: "04", label: "Accountability", href: "#accountability" },
  { index: "05", label: "Built for here", href: "#region" },
  { index: "06", label: "Pricing", href: "#pricing" },
] as const;

const NAV_DELAYS = [
  styles.navDelay0,
  styles.navDelay1,
  styles.navDelay2,
  styles.navDelay3,
  styles.navDelay4,
  styles.navDelay5,
] as const;

/** Anchors older links and shares still carry, mapped to the section that now holds that content. */
const RETIRED_ANCHORS: Record<string, string> = {
  "#modules": "#product",
  "#network": "#member",
};

export function resolveLandingHash(hash: string): string {
  return RETIRED_ANCHORS[hash] ?? hash;
}

/** How long the menu takes to leave before the page underneath may move. */
const MENU_EXIT_MS = 520;
/** When the first menu link may take focus without pulling the plate in early. */
const MENU_FOCUS_MS = 430;

const reducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Scrolls to a section and hands it focus, so keyboard and screen-reader users
 * continue from the place they asked for rather than from the menu button.
 */
function goToHash(href: string, behavior: ScrollBehavior) {
  if (href === "#top") {
    window.scrollTo({ top: 0, behavior });
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    return;
  }
  const target = document.querySelector<HTMLElement>(href);
  if (!target) return;
  target.scrollIntoView({ behavior, block: "start" });
  window.history.replaceState(null, "", href);
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
}

export function CinematicHeader() {
  const [open, setOpen] = useState(false);
  const [activeHref, setActiveHref] = useState<string>("#top");
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const focusTimerRef = useRef(0);
  const navigationTimerRef = useRef(0);

  // Which section the reader is in, for the menu's red mark.
  useEffect(() => {
    let frame = 0;

    const readPage = () => {
      frame = 0;
      let nextActive = "#top";
      for (const item of NAV_ITEMS) {
        const section = document.querySelector<HTMLElement>(item.href);
        if (!section) continue;
        const rect = section.getBoundingClientRect();
        if (rect.top <= window.innerHeight * 0.44 && rect.bottom > window.innerHeight * 0.18) {
          nextActive = item.href;
        }
      }
      setActiveHref((current) => (current === nextActive ? current : nextActive));
    };

    const requestRead = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(readPage);
    };

    readPage();
    window.addEventListener("scroll", requestRead, { passive: true });
    window.addEventListener("resize", requestRead, { passive: true });
    return () => {
      window.removeEventListener("scroll", requestRead);
      window.removeEventListener("resize", requestRead);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  // A deep link is answered by the browser before fonts and the sticky
  // measurements settle, which leaves the section a few lines off. Once the
  // page is steady the anchor is re-aimed, unless the reader has already
  // started moving on their own. Retired anchors are redirected here too.
  useEffect(() => {
    let cancelled = false;
    let interacted = false;
    const markInteraction = () => {
      interacted = true;
    };

    const land = () => {
      const raw = window.location.hash;
      if (!raw || raw === "#top") return;
      const href = resolveLandingHash(raw);
      const target = document.querySelector<HTMLElement>(href);
      if (!target) return;
      if (href !== raw) window.history.replaceState(null, "", href);
      target.scrollIntoView({ behavior: "instant", block: "start" });
    };

    const onHashChange = () => land();
    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("wheel", markInteraction, { passive: true, once: true });
    window.addEventListener("touchstart", markInteraction, { passive: true, once: true });
    window.addEventListener("keydown", markInteraction, { once: true });

    const ready = typeof document.fonts?.ready?.then === "function" ? document.fonts.ready : Promise.resolve();
    void ready.then(() => {
      if (cancelled) return;
      window.requestAnimationFrame(() => {
        if (!cancelled && !interacted) land();
      });
    });

    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("wheel", markInteraction);
      window.removeEventListener("touchstart", markInteraction);
      window.removeEventListener("keydown", markInteraction);
    };
  }, []);

  // Open state: lock the page, make everything behind the menu inert, keep
  // focus inside, and put all of it back exactly as it was.
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const sheet = document.querySelector<HTMLElement>("[data-landing-sheet]");
    window.clearTimeout(focusTimerRef.current);

    if (!open) return;

    const previousOverflow = body.style.overflow;
    root.classList.add("landing-nav-open");
    body.style.overflow = "hidden";
    if (sheet) sheet.inert = true;

    focusTimerRef.current = window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
    }, reducedMotion() ? 0 : MENU_FOCUS_MS);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus({ preventScroll: true });
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = [
        toggleRef.current,
        ...Array.from(menuRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []),
      ].filter((element): element is HTMLElement => Boolean(element));
      const current = focusables.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && current <= 0) {
        event.preventDefault();
        focusables.at(-1)?.focus();
      } else if (!event.shiftKey && (current === -1 || current === focusables.length - 1)) {
        event.preventDefault();
        focusables[0]?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimerRef.current);
      document.removeEventListener("keydown", handleKeyDown);
      root.classList.remove("landing-nav-open");
      body.style.overflow = previousOverflow;
      if (sheet) sheet.inert = false;
    };
  }, [open]);

  // A click made while the menu is leaving waits for it; a newer click or an
  // unmount cancels what an older one was still about to do.
  useEffect(() => () => window.clearTimeout(navigationTimerRef.current), []);

  const dismiss = () => {
    setOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
  };

  const navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    // Modified clicks and middle clicks belong to the browser: new tab, new window.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    window.clearTimeout(navigationTimerRef.current);
    const behavior: ScrollBehavior = reducedMotion() ? "auto" : "smooth";
    const go = () => {
      navigationTimerRef.current = 0;
      goToHash(href, behavior);
    };
    if (!open) {
      go();
      return;
    }
    setOpen(false);
    navigationTimerRef.current = window.setTimeout(go, reducedMotion() ? 0 : MENU_EXIT_MS);
  };

  return (
    <>
      <header className={cn(styles.header, open && styles.headerOpen)}>
        <Link
          href="#top"
          className={styles.brand}
          aria-label="RIVET, back to top"
          inert={open}
          onClick={(event) => navigate(event, "#top")}
        >
          <Image src={open ? "/brand/rivet-lockup-rev.png" : "/brand/rivet-lockup.png"} alt="RIVET" width={122} height={31} priority />
        </Link>

        <div className={styles.headerActions}>
          <Link href="/signup" className={styles.apply} inert={open}>
            Apply for access
          </Link>
          <button
            ref={toggleRef}
            type="button"
            className={styles.menuToggle}
            aria-expanded={open}
            aria-controls="rivet-landing-menu"
            onClick={() => setOpen((current) => !current)}
          >
            <span className={styles.menuPin} aria-hidden />
            <span>{open ? "Close" : "Menu"}</span>
          </button>
        </div>
      </header>

      <div
        id="rivet-landing-menu"
        ref={menuRef}
        className={cn(styles.menu, open && styles.menuOpen)}
        aria-hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label="RIVET navigation"
      >
        <button type="button" className={styles.menuScrim} aria-label="Close navigation" onClick={dismiss} />
        <div className={styles.menuPlate}>
          <nav className={styles.menuPrimary} aria-label="Landing page sections">
            <ol className={styles.menuList}>
              {NAV_ITEMS.map((item, index) => (
                <li key={item.href} className={cn(styles.menuItem, NAV_DELAYS[index])}>
                  <Link
                    href={item.href}
                    className={styles.menuLink}
                    aria-current={activeHref === item.href ? "true" : undefined}
                    onClick={(event) => navigate(event, item.href)}
                  >
                    <span className={styles.menuIndex}>{item.index}</span>
                    <span className={styles.menuMask}>
                      <span className={styles.menuLabel}>{item.label}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>

          <div className={styles.menuMeta}>
            <div>
              <span className={styles.metaKey}>Contact</span>
              <a href="mailto:hello@rivet.jo">hello@rivet.jo</a>
            </div>
            <div>
              <span className={styles.metaKey}>Based in</span>
              <span>Amman, Jordan</span>
            </div>
            <div>
              <span className={styles.metaKey}>Interface</span>
              <span>English · <span lang="ar">العربية</span></span>
            </div>
            <div className={styles.menuAuth}>
              <Link href="/login" className={styles.menuSignIn}>Sign in</Link>
              <Link href="/signup" className={styles.menuCta}>Send gym application</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
