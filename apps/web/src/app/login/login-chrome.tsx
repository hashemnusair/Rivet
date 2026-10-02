"use client";

import { usePublicSiteHref } from "@/lib/routing/use-public-site-href";
import { ArrowLeft } from "lucide-react";
import { LEGAL_LINKS, RIVET_CONTACT } from "@/lib/rivet-contact";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AuthProgressBar } from "@/components/auth/auth-transition";
import { useLocale, useT } from "@/lib/i18n/provider";
import type { Portal } from "./portals";

const ARABIC_BRAND_LINE = "نظام الإيرادات والعمليات للنوادي الرياضية — من العضو المحتمل إلى التجديد والتحصيل.";

const LEGAL_LABEL_KEYS = {
  "/privacy": "auth.chrome.privacy",
  "/terms": "auth.chrome.terms",
} as const;

/** Shared two-column frame for `/login` and every portal beneath it. */
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
  const { t, locale, dir, isolateLtr } = useLocale();
  const brand = portal?.id ?? "chooser";

  return (
    <div className="grid min-h-screen lg:grid-cols-[42%_58%]">
      <div className="night-surface relative hidden flex-col justify-between bg-night p-10 text-night-ink lg:flex">
        <Link href={publicHref} aria-label={t("auth.chrome.homeLabel")}>
          <Image src="/brand/rivet-lockup-rev.png" alt={t("common.brand.name")} width={149} height={38} priority />
        </Link>

        <div className="max-w-md">
          <p className="context-label mb-4 text-night-ink-3">{t(`auth.brand.${brand}.context` as const)}</p>
          <h2 className="font-display text-[38px] font-semibold leading-[1.08] tracking-tight">{t(`auth.brand.${brand}.headline` as const)}</h2>
          <p className="mt-5 text-[15px] leading-relaxed text-night-ink-2">{t(`auth.brand.${brand}.body` as const)}</p>
          {/* Brand decoration on the English page only: an Arabic page already says all of this in Arabic.
              It is a fixed brand line, not translatable UI copy, so it stays out of the catalogue
              (which keeps Arabic letters out of the English file). */}
          {locale === "en" ? (
            <p className="mt-4 font-['var(--font-plex-arabic)'] text-[15px] leading-relaxed text-night-ink-3" dir="rtl">
              {ARABIC_BRAND_LINE}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-night-line pt-5 text-[12px] font-medium text-night-ink-3">
          <span>{t("auth.chrome.footerBrand")}</span>
          <span>{t("auth.chrome.footerPlace")}</span>
        </div>
      </div>

      <div className="flex flex-col bg-paper px-5 py-8 sm:px-8">
        <div className="flex items-center justify-between">
          <Link href={publicHref} className="flex min-h-8 items-center gap-2 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-ink">
            <ArrowLeft className="size-3.5" aria-hidden /> <bdi dir="ltr">rivet.jo</bdi>
          </Link>
          {/* Members can create accounts here; gym access is issued by RIVET
              after an application is reviewed. */}
          {portal && mode === "sign-up" ? (
            <Link href={portal.href} className="flex min-h-8 items-center text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink">
              {t("auth.chrome.alreadyHaveAccount")}
            </Link>
          ) : portal?.signUpUrl ? (
            <Link href={portal.signUpUrl} className="flex min-h-8 items-center text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink">
              {t("auth.chrome.createMemberAccount")}
            </Link>
          ) : null}
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <div className="mb-8 lg:hidden">
            <Image src="/brand/rivet-lockup.png" alt={t("common.brand.name")} width={126} height={32} priority />
          </div>
          {children}
        </div>

        <div className="mx-auto w-full max-w-md border-t border-line pt-4">
          {footer ?? (
            <div className="space-y-2 text-center">
              <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PortalHeading({ portal, mode = "sign-in" }: { portal: Portal; mode?: "sign-in" | "sign-up" }) {
  const t = useT();
  const title = t(`auth.portal.${portal.id}.title` as const);
  return (
    <div className="flex items-start gap-3.5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-ink text-paper" aria-hidden>
        <portal.icon className="size-5" />
      </span>
      <div className="min-w-0">
        <h1 className="font-display text-[23px] font-semibold leading-tight tracking-tight">
          {mode === "sign-up"
            ? (portal.signUpTitle ? t("auth.portal.member.signUpTitle") : t("auth.portal.createAccount", { portal: title.toLowerCase() }))
            : title}
        </h1>
        <p className="mt-1 text-[13px] leading-snug text-ink-2">{t(`auth.portal.${portal.id}.blurb` as const)}</p>
      </div>
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
