"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale, type TKey } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import { FILM_CHAPTERS, chapterAt } from "./hero-film-chapters";
import styles from "./landing-cinematic.module.css";

const WORDMARK = ["R", "I", "V", "E", "T"] as const;

/**
 * The landing's opening section: a looping film of the product (rendered by
 * scripts/hero-film) behind the name and the one-line promise. The captions
 * follow the film's chapters; the film plays only while it is on screen, and
 * it waits for a press when the visitor prefers reduced motion.
 */
export function HeroFilm() {
  const { t } = useLocale();
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const [chapter, setChapter] = useState(0);
  // null until the visitor's motion preference is known; then their choice.
  const [paused, setPaused] = useState<boolean | null>(null);
  const [inView, setInView] = useState(true);
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPaused(reduce);
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? true), { threshold: 0.05 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || paused === null) return;
    if (paused || !inView) {
      video.pause();
      return;
    }
    video.preload = "auto";
    // Autoplay can still be refused (Low Power Mode, data saver); the poster stays and the button offers play.
    // A play interrupted by scrolling away rejects too, but that is not a refusal.
    video.play()?.catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "NotAllowedError") setPaused(true);
    });
  }, [paused, inView]);

  // Captions follow the picture; the fill is written straight to the element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || paused !== false || !inView) return;
    let frame = 0;
    const tick = () => {
      const { index, progress } = chapterAt(video.currentTime);
      setChapter((current) => (current === index ? current : index));
      fillRef.current?.style.setProperty("--film-chapter-progress", progress.toFixed(4));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [paused, inView]);

  const current = FILM_CHAPTERS[chapter] ?? FILM_CHAPTERS[0];

  return (
    <section
      ref={sectionRef}
      id="top"
      data-landing-hero
      data-landing-film
      data-landing-snap="start"
      data-landing-theme="dark"
      aria-labelledby="film-title"
      className={cn(styles.film, styles.layer1)}
    >
      <div aria-hidden className={styles.filmMedia}>
        <div className={styles.filmPoster} />
        <video
          ref={videoRef}
          className={cn(styles.filmVideo, showing && styles.filmVideoOn)}
          muted
          loop
          playsInline
          preload="none"
          disablePictureInPicture
          onPlaying={() => setShowing(true)}
        >
          <source media="(max-aspect-ratio: 1/1)" src="/marketing/rivet-film-portrait.mp4" type="video/mp4" />
          <source src="/marketing/rivet-film.mp4" type="video/mp4" />
        </video>
        <div className={styles.filmShade} />
        <div className={styles.filmGrain} />
      </div>

      <div className={cn(styles.filmTitle, styles.heroMotion)}>
        <h1 id="film-title">
          <span className={styles.filmWord} dir="ltr">
            <span className="sr-only">RIVET</span>
            {WORDMARK.map((letter, index) => (
              <span key={index} aria-hidden className={styles.filmLetter} style={{ animationDelay: `${120 + index * 70}ms` }}>
                {letter}
              </span>
            ))}
          </span>{" "}
          <span className={styles.filmTagline}>{t("marketing.film.tagline")}</span>
        </h1>
        <p className="sr-only">{t("marketing.film.summary")}</p>
      </div>

      <div className={styles.filmFooter}>
        <div aria-hidden className={styles.filmChapter}>
          <div className={styles.filmTicks}>
            {FILM_CHAPTERS.map((item, index) => (
              <span
                key={item.key}
                ref={index === chapter ? fillRef : undefined}
                className={cn(styles.filmTick, index < chapter && styles.filmTickDone, index === chapter && styles.filmTickNow)}
              />
            ))}
          </div>
          <div key={current.key} className={styles.filmCaption}>
            <p className={styles.filmCaptionTitle}>{t(`marketing.film.chapters.${current.key}.title` as TKey)}</p>
            <p className={styles.filmCaptionLine}>{t(`marketing.film.chapters.${current.key}.line` as TKey)}</p>
          </div>
        </div>
        <button
          type="button"
          className={styles.filmToggle}
          aria-label={t(paused === false ? "marketing.film.pause" : "marketing.film.play")}
          onClick={() => setPaused((value) => value === false)}
        >
          {paused === false ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4 translate-x-px" />}
        </button>
      </div>
    </section>
  );
}
