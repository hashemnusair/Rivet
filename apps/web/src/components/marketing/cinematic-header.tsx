"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils/cn";
import styles from "./landing-cinematic.module.css";

const NAV_ITEMS = [
  { index: "01", label: "Overview", href: "#top" },
  { index: "02", label: "The stack", href: "#product" },
  { index: "03", label: "Modules", href: "#modules" },
  { index: "04", label: "A day", href: "#day" },
  { index: "05", label: "Accountability", href: "#accountability" },
  { index: "06", label: "Built for here", href: "#region" },
] as const;

const NAV_DELAYS = [
  styles.navDelay0,
  styles.navDelay1,
  styles.navDelay2,
  styles.navDelay3,
  styles.navDelay4,
  styles.navDelay5,
] as const;

type HeaderTheme = "paper" | "dark";

export function CinematicHeader() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<HeaderTheme>("paper");
  const [activeHref, setActiveHref] = useState<string>("#top");
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef(0);
  const dark = open || theme === "dark";

  useEffect(() => {
    let frame = 0;

    const readPage = () => {
      frame = 0;
      const marker = 38;
      const themed = Array.from(document.querySelectorAll<HTMLElement>("[data-landing-theme]"));
      let nextTheme: HeaderTheme = "paper";
      for (const section of themed) {
        const rect = section.getBoundingClientRect();
        if (rect.top <= marker && rect.bottom > marker) {
          nextTheme = section.dataset.landingTheme === "dark" ? "dark" : "paper";
        }
      }
      setTheme((current) => (current === nextTheme ? current : nextTheme));

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

  useEffect(() => {
    const root = document.documentElement;
    const sheet = document.querySelector<HTMLElement>("[data-landing-sheet]");
    window.clearTimeout(closeTimerRef.current);

    if (!open) {
      root.classList.remove("landing-nav-open");
      document.body.style.removeProperty("overflow");
      if (sheet) sheet.inert = false;
      return;
    }

    root.classList.add("landing-nav-open");
    document.body.style.overflow = "hidden";
    if (sheet) sheet.inert = true;

    closeTimerRef.current = window.setTimeout(() => {
      menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
    }, 430);

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
      } else if (!event.shiftKey && current === focusables.length - 1) {
        event.preventDefault();
        focusables[0]?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(closeTimerRef.current);
      document.removeEventListener("keydown", handleKeyDown);
      root.classList.remove("landing-nav-open");
      document.body.style.removeProperty("overflow");
      if (sheet) sheet.inert = false;
    };
  }, [open]);

  const navigate = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    event.preventDefault();
    setOpen(false);
    window.setTimeout(() => {
      const behavior = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth";
      if (href === "#top") {
        window.scrollTo({
          top: 0,
          behavior,
        });
        window.history.replaceState(null, "", href);
        return;
      }
      document.querySelector<HTMLElement>(href)?.scrollIntoView({
        behavior,
        block: "start",
      });
      window.history.replaceState(null, "", href);
    }, 520);
  };

  return (
    <>
      <header className={cn(styles.header, dark && styles.headerDark)}>
        <Link href="#top" className={styles.brand} aria-label="RIVET, back to top" onClick={(event) => navigate(event, "#top")}>
          <Image src={dark ? "/brand/rivet-lockup-rev.png" : "/brand/rivet-lockup.png"} alt="RIVET" width={122} height={31} priority />
        </Link>

        <div className={styles.headerActions}>
          <Link href="#contact" className={styles.walkthrough} onClick={(event) => navigate(event, "#contact")}>
            Book a walkthrough
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
            <span className={styles.menuCount} aria-hidden>01–06</span>
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
        <button type="button" className={styles.menuScrim} aria-label="Close navigation" onClick={() => setOpen(false)} />
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
