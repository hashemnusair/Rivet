"use client";

import { usePublicSiteHref } from "@/lib/routing/use-public-site-href";
import { LEGAL_LINKS, RIVET_CONTACT } from "@/lib/rivet-contact";
import Image from "next/image";
import Link from "next/link";
import { useEffect, type ComponentProps, type ReactNode } from "react";
import { AuthProgressBar } from "@/components/auth/auth-transition";
import { monaSansText } from "@/components/marketing/mona-sans";
import { LOCALE_LABELS } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";
import { useCanonicalHref } from "@/lib/routing/use-canonical-href";
import { cn } from "@/lib/utils/cn";
import styles from "./login.module.css";
import { SignInArt, withArt, type ArtDoor } from "./sign-in-art";
import type { Portal } from "./portals";

const LEGAL_LABEL_KEYS = {
  "/privacy": "auth.chrome.privacy",
  "/terms": "auth.chrome.terms",
} as const;

/**
 * Shared frame for `/login` and every door beneath it, in the landing's night
 * look: a line drawing for this door in the left half on wide screens, the
 * form alone on the right. The palette comes from `night-tokens`, so the forms inside need no
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
  usePrepareDoors();

  return (
    <div data-login className={cn("night-tokens night-surface marketing-body min-h-screen bg-paper text-ink", monaSansText.variable)}>
      <div className={styles.frame}>
        <LoginArt brand={brand} homeHref={publicHref} />

        <div className={styles.column}>
          <div className={styles.bar}>
            <Link href={publicHref} aria-label={t("auth.chrome.homeLabel")} className="lg:hidden">
              <Image src="/brand/rivet-lockup-rev-488.png" alt={t("common.brand.name")} width={112} height={29} priority />
            </Link>
            <div className={styles.barLinks}>
              <LanguageLink />
              {/* Members can create accounts here; gym access is issued by RIVET
                  after an application is reviewed. */}
              {portal && mode === "sign-up" ? (
                <DoorLink href={withArt(portal.href, artDoor(brand))} className={styles.barLink}>{t("auth.chrome.alreadyHaveAccount")}</DoorLink>
              ) : portal?.signUpUrl ? (
                <DoorLink href={withArt(portal.signUpUrl, artDoor(brand))} className={styles.barLink}>{t("auth.chrome.createMemberAccount")}</DoorLink>
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
 * A link to another sign-in page. A door on another RIVET host is linked
 * there directly (no redirect through this host) and marked, so the browser
 * can fetch it at once and prepare the whole page while the pointer rests on
 * the link; the click then shows a page that is already loaded.
 */
export function DoorLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const target = useCanonicalHref(href);
  return <Link {...props} href={target} data-door={target === href ? undefined : ""} />;
}

const DOOR_RULES_ID = "rivet-door-rules";

/**
 * Speculation rules for the marked doors: fetch each page straight away, and
 * prerender the one the pointer rests on. Browsers without them simply
 * navigate. The doors answer with `Supports-Loading-Mode` (next.config) so a
 * page on another RIVET host may be prepared.
 */
function usePrepareDoors() {
  useEffect(() => {
    if (document.getElementById(DOOR_RULES_ID) || !HTMLScriptElement.supports?.("speculationrules")) return;
    const where = { selector_matches: "a[data-door]" };
    const script = document.createElement("script");
    script.id = DOOR_RULES_ID;
    script.type = "speculationrules";
    script.textContent = JSON.stringify({
      prefetch: [{ source: "document", where, eagerness: "immediate" }],
      prerender: [{ source: "document", where, eagerness: "moderate" }],
    });
    document.head.appendChild(script);
  }, []);
}

/** The chooser's drawing belongs to every door; each door has its own. */
const artDoor = (brand: "chooser" | Portal["id"]): ArtDoor => (brand === "chooser" ? "account" : brand);

/**
 * The left half on wide screens: a line drawing for this door (a weight stack
 * with its pin, the front desk, a bench press, every gym on one screen) on a
 * faint layout grid, with the door's own line as its caption. Inline SVG, so
 * it costs no request; phones never render it.
 */
function LoginArt({ brand, homeHref }: { brand: "chooser" | Portal["id"]; homeHref: string }) {
  const { t } = useLocale();
  return (
    <aside className={styles.panel}>
      <SignInArt door={artDoor(brand)} />

      <Link href={homeHref} aria-label={t("auth.chrome.homeLabel")} className={styles.panelBrand}>
        <Image src="/brand/rivet-lockup-rev-488.png" alt={t("common.brand.name")} width={122} height={31} priority />
      </Link>

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
