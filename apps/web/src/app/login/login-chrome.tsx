"use client";

import { usePublicSiteHref } from "@/lib/routing/use-public-site-href";
import { LEGAL_LINKS, RIVET_CONTACT } from "@/lib/rivet-contact";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AuthProgressBar } from "@/components/auth/auth-transition";
import filmStyles from "@/components/marketing/landing-cinematic.module.css";
import { monaSans } from "@/components/marketing/mona-sans";
import { LOCALE_LABELS } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils/cn";
import styles from "./login.module.css";
import type { Portal } from "./portals";

const LEGAL_LABEL_KEYS = {
  "/privacy": "auth.chrome.privacy",
  "/terms": "auth.chrome.terms",
} as const;

const WORDMARK = ["R", "I", "V", "E", "T"] as const;

/**
 * Shared frame for `/login` and every door beneath it, in the landing's night
 * look: the RIVET film in the left half on wide screens, the form alone on the
 * right. The palette comes from `night-tokens`, so the forms inside need no
 * colours of their own.
 */
export function LoginLayout({
  portal,
  mode = "sign-in",
  footer,
  children,
}: {
  portal?: Portal;
  mode?: "sign-in" | "sign-up";
  footer?: ReactNode;
  children: ReactNode;
}) {
  const publicHref = usePublicSiteHref();
  const { t, dir, isolateLtr } = useLocale();
  const brand = portal?.id ?? "chooser";

  return (
    <div data-login className={cn("night-tokens night-surface marketing-body min-h-screen bg-paper text-ink", monaSans.variable)}>
      <div className={styles.frame}>
        <LoginFilm brand={brand} homeHref={publicHref} />

        <div className={styles.column}>
          <div className={styles.bar}>
            <Link href={publicHref} aria-label={t("auth.chrome.homeLabel")} className="lg:hidden">
              <Image src="/brand/rivet-lockup-rev.png" alt={t("common.brand.name")} width={112} height={29} priority />
            </Link>
            <div className={styles.barLinks}>
              <LanguageLink />
              {/* Members can create accounts here; gym access is issued by RIVET
                  after an application is reviewed. */}
              {portal && mode === "sign-up" ? (
                <Link href={portal.href} className={styles.barLink}>{t("auth.chrome.alreadyHaveAccount")}</Link>
              ) : portal?.signUpUrl ? (
                <Link href={portal.signUpUrl} className={styles.barLink}>{t("auth.chrome.createMemberAccount")}</Link>
              ) : null}
            </div>
          </div>

          <main className={styles.main}>{children}</main>

          <div className={styles.footer}>
            {footer ?? (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
                <a href={RIVET_CONTACT.whatsappHref} target="_blank" rel="noreferrer" className="hover:text-ink" dir={dir === "rtl" ? undefined : "ltr"}>{t("auth.chrome.whatsapp", { phone: isolateLtr(RIVET_CONTACT.phoneDisplay) })}</a>
                <span aria-hidden>·</span>
                <a href={RIVET_CONTACT.instagramHref} target="_blank" rel="noreferrer" className="hover:text-ink" dir="ltr">{RIVET_CONTACT.instagramHandle}</a>
                <span aria-hidden>·</span>
                {LEGAL_LINKS.map((item, index) => (
                  <span key={item.href} className="contents">
                    {index > 0 ? <span aria-hidden>·</span> : null}
                    <Link href={item.href} className="hover:text-ink">{t(LEGAL_LABEL_KEYS[item.href])}</Link>
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The left half on wide screens: the landing's film (portrait cut) behind the
 * name and the promise, with the door's own line where the landing shows its
 * chapter captions. The video loads only when the half is on screen and the
 * visitor has not asked for reduced motion; otherwise the poster stands still.
 */
function LoginFilm({ brand, homeHref }: { brand: "chooser" | Portal["id"]; homeHref: string }) {
  const { t } = useLocale();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || typeof window.matchMedia !== "function") return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (wide.matches && !reduce.matches) {
        if (!video.getAttribute("src")) video.src = "/marketing/rivet-film-portrait.mp4";
        video.play()?.catch(() => undefined);
      } else {
        video.pause();
      }
    };
    sync();
    wide.addEventListener("change", sync);
    reduce.addEventListener("change", sync);
    return () => {
      wide.removeEventListener("change", sync);
      reduce.removeEventListener("change", sync);
    };
  }, []);

  return (
    <aside className={styles.panel}>
      <div aria-hidden className={styles.poster} />
      <video
        ref={videoRef}
        aria-hidden
        className={cn(styles.video, showing && styles.videoOn)}
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
        onPlaying={() => setShowing(true)}
      />
      <div aria-hidden className={filmStyles.filmShade} />

      <Link href={homeHref} aria-label={t("auth.chrome.homeLabel")} className={styles.panelBrand}>
        <Image src="/brand/rivet-lockup-rev.png" alt={t("common.brand.name")} width={122} height={31} priority />
      </Link>

      <div aria-hidden className={styles.panelTitle}>
        <span className={cn(filmStyles.filmWord, styles.panelWord)} dir="ltr">
          {WORDMARK.map((letter, index) => (
            <span key={index} className={filmStyles.filmLetter} style={{ animationDelay: `${120 + index * 70}ms` }}>
              {letter}
            </span>
          ))}
        </span>
        <span className={cn(filmStyles.filmTagline, styles.panelTagline)}>{t("marketing.film.tagline")}</span>
      </div>

      <div className={styles.panelCaption}>
        <p>{t(`auth.brand.${brand}.headline` as const)}</p>
        <p>{t(`auth.brand.${brand}.body` as const)}</p>
      </div>
      <span aria-hidden className={styles.panelEdge} />
    </aside>
  );
}

/** The bar's language switch, written like the landing's: the other language's own name. */
function LanguageLink() {
  const { locale, setLocale, switchEnabled, t } = useLocale();
  if (!switchEnabled) return null;
  const next = locale === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      className={styles.barLink}
      onClick={() => setLocale(next)}
      aria-label={t("common.language.switchTo", { language: LOCALE_LABELS[next].english })}
      data-testid="language-switch"
      lang={next}
    >
      {LOCALE_LABELS[next].native}
    </button>
  );
}

export function PortalHeading({ portal, mode = "sign-in" }: { portal: Portal; mode?: "sign-in" | "sign-up" }) {
  const t = useT();
  const title = t(`auth.portal.${portal.id}.title` as const);
  return (
    <div>
      <h1 className={styles.heading}>
        {mode === "sign-up"
          ? (portal.signUpTitle ? t("auth.portal.member.signUpTitle") : t("auth.portal.createAccount", { portal: title.toLowerCase() }))
          : title}
      </h1>
      <p className={cn(styles.blurb, "text-ink-2")}>{t(`auth.portal.${portal.id}.blurb` as const)}</p>
    </div>
  );
}

export function LoginLoading() {
  const t = useT();
  return (
    <div className="flex min-h-40 items-center justify-center" role="status" aria-label={t("auth.chrome.checkingSignIn")}>
      <AuthProgressBar />
    </div>
  );
}
